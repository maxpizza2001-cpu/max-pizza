-- Max Pizza · 022 · Avisos V2
--  · Pedido listo → al mesero (o cajero) que lo pidió, no a todos.
--  · Pizzas personales → van a la estación "Armado": el armador las recibe, las toma y las marca listas;
--    al estar listas le avisa a quien la pidió (mesero o caja).
--  · Administración recibe al celular SOLO stock bajo (el CEO, de todas las sedes).
--  · Tareas con hora y recordatorio (se mandan solas cada minuto con pg_cron).
--  · Cada aviso abre directo lo suyo en la app (url).

-- ───────── Estación Armado para pizzas personales ─────────
alter table productos drop constraint if exists productos_estacion_check;
alter table productos add constraint productos_estacion_check check (estacion in ('horno','rapidas','armado','ninguna'));
insert into estaciones (sede_id, codigo, nombre) select id, 'armado', 'Armado (pizzas personales)' from sedes
on conflict (sede_id, codigo) do nothing;
update productos set estacion = 'armado' where formato = 'personal' and estacion = 'horno';

-- Se ajustan las funciones que ya existen cambiando solo el pedacito necesario (sin reescribirlas)
create or replace function ajustar_funciones(p_viejo text, p_nuevo text, p_regex boolean default false) returns int
language plpgsql as $f$
declare r record; d text; n int := 0;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prokind = 'f' and p.proname <> 'ajustar_funciones' loop
    d := pg_get_functiondef(r.oid);
    if (not p_regex and position(p_viejo in d) > 0) or (p_regex and d ~ p_viejo) then
      execute case when p_regex then regexp_replace(d, p_viejo, p_nuevo, 'g') else replace(d, p_viejo, p_nuevo) end;
      n := n + 1;
    end if;
  end loop;
  return n;
end $f$;

do $$
declare n int;
begin
  -- 1) La comanda de personales va al armador (el aviso rico lo manda avisar_comanda_armado, sin repetir)
  n := ajustar_funciones($a$case when p.estacion = 'horno' then 'caja' else 'rapidas' end$a$,
                         $a$case p.estacion when 'horno' then 'caja' when 'armado' then null else 'rapidas' end$a$);
  if n = 0 then raise exception 'No encontré a quién avisar la comanda'; end if;
  -- 2) Las personales reservan sus unidades igual que las porciones del horno
  n := ajustar_funciones($a$p.estacion = 'horno' then$a$, $a$p.estacion in ('horno','armado') then$a$);
  if n = 0 then raise exception 'No encontré las reservas del horno'; end if;
  -- 3) Se crea comanda también para Armado
  n := ajustar_funciones($a$p.estacion in ('horno','rapidas')$a$, $a$p.estacion in ('horno','rapidas','armado')$a$);
  if n = 0 then raise exception 'No encontré dónde se crean las comandas'; end if;
  -- 4) Quién puede mover el estado de una comanda de Armado
  n := ajustar_funciones($a$case when v_est = 'horno' then array['caja'] else array['rapidas'] end$a$,
                         $a$case v_est when 'horno' then array['caja'] when 'armado' then array['armado'] else array['rapidas'] end$a$);
  if n = 0 then raise exception 'No encontré los permisos de comanda_estado'; end if;
  -- 5) "Lista" avisa solo a quien pidió
  n := ajustar_funciones($a$perform notificar\(c\.sede_id, 'mesero', null, 'listo',.*?null, c\.id\);$a$, 'perform avisar_listo(c.id);', true);
  if n = 0 then raise exception 'No encontré el aviso de pedido listo'; end if;
  -- 6) Las sedes nuevas también nacen con la estación Armado
  n := ajustar_funciones($a$(v, 'rapidas', 'Comidas rápidas');$a$, $a$(v, 'rapidas', 'Comidas rápidas'), (v, 'armado', 'Armado (pizzas personales)');$a$);
end $$;

-- "10:00 a. m." en hora de Colombia
create or replace function hora_co(p timestamptz) returns text language sql stable as $$
  select ltrim(to_char(p at time zone 'America/Bogota', 'HH12:MI'), '0') || case when extract(hour from p at time zone 'America/Bogota') < 12 then ' a. m.' else ' p. m.' end
$$;

-- Texto corto de lo que lleva una comanda: "2 Personal Hawaiana, 1 Hamburguesa"
create or replace function resumen_comanda(p_comanda uuid) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(fmt_cant(x.cant) || ' ' || x.nombre, ', ' order by x.nombre)
  from (select pr.nombre, sum(lp.cantidad) cant from lineas_comanda lc join lineas_pedido lp on lp.id = lc.linea_pedido_id
        join productos pr on pr.id = lp.producto_id where lc.comanda_id = p_comanda and not lc.cancelada and lp.estado = 'activa'
        group by pr.nombre) x
$$;

-- "Mesa 03" / "Pedido #104"
create or replace function destino_pedido(p_pedido uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when m.numero is not null then 'Mesa ' || lpad(m.numero::text, 2, '0') else 'Pedido #' || pe.numero end
  from pedidos pe join cuentas cu on cu.id = pe.cuenta_id left join mesas m on m.id = cu.mesa_id where pe.id = p_pedido
$$;

-- Quién pidió y desde qué área: mesero / caja (online o sin persona = caja)
create or replace function solicitante_pedido(p_pedido uuid, out perfil uuid, out rol text) returns record
language sql stable security definer set search_path = public as $$
  select pe.enviado_por,
    case when exists (select 1 from accesos_sede a where a.perfil_id = pe.enviado_por and a.sede_id = pe.sede_id and a.rol = 'mesero')
          and not exists (select 1 from accesos_sede a where a.perfil_id = pe.enviado_por and a.sede_id = pe.sede_id and a.rol = 'caja')
         then 'mesero' else 'caja' end
  from pedidos pe where pe.id = p_pedido
$$;

-- Comanda lista → aviso a quien la pidió (mesero o caja), no a todos. Nunca a quien la marcó.
create or replace function avisar_listo(p_comanda uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c comandas; v_est text; s record; v_titulo text;
begin
  select * into c from comandas where id = p_comanda;
  select codigo into v_est from estaciones where id = c.estacion_id;
  select * into s from solicitante_pedido(c.pedido_id);
  v_titulo := case v_est when 'armado' then '🍕 Pizza personal lista · ' when 'horno' then '🔔 Pizza lista · ' else '🔔 Pedido listo · ' end
              || destino_pedido(c.pedido_id);
  if s.perfil is not null and s.perfil = auth.uid() then return; end if;
  perform notificar(c.sede_id, s.rol, s.perfil, 'listo', v_titulo,
    coalesce(resumen_comanda(c.id), '') || E'\nListo para entregar.', c.id);
end $$;

-- Pizza personal pedida → aviso rico al armador (se dispara al final del envío, cuando ya están todas las líneas)
create or replace function trg_comanda_armado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_est text; s record; v_quien text;
begin
  select codigo into v_est from estaciones where id = new.estacion_id;
  if v_est <> 'armado' then return null; end if;
  select * into s from solicitante_pedido(new.pedido_id);
  select coalesce(p.nombre, '') into v_quien from perfiles p where p.id = s.perfil;
  perform notificar(new.sede_id, 'armado', null, 'comanda', '🍕 Pizza personal solicitada · ' || destino_pedido(new.pedido_id),
    coalesce(resumen_comanda(new.id), '') || E'\nSolicitado por ' || case s.rol when 'mesero' then 'Mesero' else 'Caja' end
      || coalesce(' (' || nullif(v_quien, '') || ')', ''), new.id);
  return null;
end $$;
drop trigger if exists comanda_armado on comandas;
create constraint trigger comanda_armado after insert on comandas deferrable initially deferred
  for each row execute function trg_comanda_armado();

-- ───────── Suscripciones: un celular puede recibir de varias sedes/roles ─────────
alter table push_suscripciones drop constraint if exists push_suscripciones_endpoint_key;
create unique index if not exists push_suscripciones_destino_unico on push_suscripciones (endpoint, sede_id, rol);

create or replace function push_guardar(p_sede uuid, p_rol text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(auth.uid() is not null, 'Debes iniciar sesión');
  perform exigir(exists (select 1 from accesos_sede where perfil_id = auth.uid() and sede_id = p_sede and rol = p_rol), 'No tienes ese rol en esta sede');
  perform exigir(p_endpoint like 'https://%', 'Suscripción inválida');
  -- si el celular era de otra persona (se cambió de cuenta), se limpia
  delete from push_suscripciones where endpoint = p_endpoint and perfil_id <> auth.uid();
  insert into push_suscripciones (perfil_id, sede_id, rol, endpoint, p256dh, auth)
  values (auth.uid(), p_sede, p_rol, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint, sede_id, rol) do update set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth, creada_en = now();
end $$;

-- A qué celulares va un aviso, y qué abre al tocarlo. Lo usa la función "avisar" del servidor.
create or replace function push_destinos(p_id uuid)
returns table (sub_id uuid, endpoint text, p256dh text, auth text, titulo text, cuerpo text, url text)
language plpgsql stable security definer set search_path = public as $$
declare n notificaciones; v_url text;
begin
  select * into n from notificaciones where id = p_id;
  if n.id is null then return; end if;
  -- Administración: al celular solo llega stock bajo (lo demás lo ve en la app)
  if n.rol in ('admin','ceo') and n.tipo <> 'stock_bajo' then return; end if;
  v_url := case
    when n.tipo in ('listo','comanda') then '/?abrir=comanda:' || n.ref_id
    when n.tipo in ('tarea','recordatorio') then '/?abrir=tarea:' || n.ref_id
    when n.tipo = 'stock_bajo' then '/?abrir=stock'
    when n.tipo in ('domicilio','pedido_online') then '/?abrir=domicilios'
    else '/' end;
  return query
  select distinct on (s.endpoint) s.id, s.endpoint, s.p256dh, s.auth,
    'MAX PIZZA · ' || n.titulo,
    concat_ws(E'\n', nullif(n.cuerpo, ''), (select nombre from sedes where id = n.sede_id) || ' · '
      || hora_co(n.creada_en)),
    v_url
  from push_suscripciones s
  where case
    when n.perfil_id is not null then s.perfil_id = n.perfil_id
    when n.rol = 'admin' then (s.sede_id = n.sede_id and s.rol = 'admin') or s.rol = 'ceo'
    else s.sede_id = n.sede_id and s.rol = n.rol end
  order by s.endpoint;
end $$;
revoke execute on function push_destinos(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function push_destinos(uuid) to service_role; end if;
end $$;

create or replace function trg_notificacion_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select valor into v_url from config_app where clave = 'url_avisar';
  if v_url is null or not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  if not exists (select 1 from push_destinos(new.id)) then return new; end if;   -- nadie a quién avisar
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, jsonb_build_object('id', new.id), '{"Content-Type": "application/json"}'::jsonb;
  return new;
end $$;

-- ───────── Tareas con hora y recordatorio ─────────
alter table tareas add column if not exists hora_programada timestamptz;
alter table tareas add column if not exists recordatorio_en timestamptz;
alter table tareas add column if not exists recordatorio_enviado boolean not null default false;
alter table tareas add column if not exists repeticion text check (repeticion in ('diaria','semanal'));
create index if not exists tareas_recordatorios on tareas (recordatorio_en) where not recordatorio_enviado;

-- p_recordar_min: null = sin recordatorio, 0 = a la hora, 5/10/15/30 = minutos antes. p_recordar_en: hora personalizada.
create or replace function tarea_horario(p_tarea uuid, p_hora timestamptz, p_recordar_min int default null,
  p_recordar_en timestamptz default null, p_repeticion text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir(found, 'La tarea no existe');
  perform exigir(es_admin_de(t.sede_id), 'Solo el administrador de esta sede programa sus tareas');
  perform exigir(p_repeticion is null or p_repeticion in ('diaria','semanal'), 'Repetición inválida');
  perform exigir(p_recordar_min is null or p_recordar_min between 0 and 1440, 'Recordatorio inválido');
  update tareas set hora_programada = p_hora,
    fecha = coalesce((p_hora at time zone 'America/Bogota')::date, fecha),
    recordatorio_en = coalesce(p_recordar_en, p_hora - make_interval(mins => p_recordar_min)),
    recordatorio_enviado = false, repeticion = p_repeticion
  where id = p_tarea;
end $$;

-- Se corre cada minuto: manda los recordatorios que ya tocan y deja lista la siguiente si se repite
create or replace function enviar_recordatorios() returns int
language plpgsql security definer set search_path = public as $$
declare t tareas; n int := 0; v_paso interval; v_nueva uuid;
begin
  for t in select * from tareas where not recordatorio_enviado and recordatorio_en <= now()
           and estado in ('pendiente','en_proceso') for update skip locked loop
    perform notificar(t.sede_id, t.rol, t.asignada_a, 'recordatorio', '⏰ ' || t.titulo,
      'Programada ' || hora_co(coalesce(t.hora_programada, t.recordatorio_en))
      || ' · Prioridad ' || initcap(t.prioridad) || E'\nTu tarea está programada para este momento.', t.id);
    update tareas set recordatorio_enviado = true where id = t.id;
    if t.repeticion is not null then
      v_paso := case t.repeticion when 'diaria' then interval '1 day' else interval '7 days' end;
      insert into tareas (sede_id, rol, asignada_a, categoria_id, titulo, detalle, prioridad, origen, accion, fecha, creada_por,
                          hora_programada, recordatorio_en, repeticion)
      values (t.sede_id, t.rol, t.asignada_a, t.categoria_id, t.titulo, t.detalle, t.prioridad, 'manual', t.accion,
              ((t.hora_programada + v_paso) at time zone 'America/Bogota')::date, t.creada_por,
              t.hora_programada + v_paso, t.recordatorio_en + v_paso, t.repeticion) returning id into v_nueva;
      update tareas set repeticion = null where id = t.id;   -- la cadena sigue en la nueva
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Reloj del servidor: cada minuto (solo si el proyecto tiene pg_cron)
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'max-recordatorios';
    perform cron.schedule('max-recordatorios', '* * * * *', 'select public.enviar_recordatorios()');
  end if;
end $$;

drop function ajustar_funciones(text, text, boolean);
grant execute on function tarea_horario(uuid, timestamptz, int, timestamptz, text) to authenticated;
