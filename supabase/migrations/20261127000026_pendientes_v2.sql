-- Max Pizza · 026 · Lo que faltaba de la V2
--  · Editar nombre y correo de un usuario.
--  · Actividad general (por sedes que administra).
--  · Probar los avisos del celular.
--  · Quién tomó cada comanda (Armado: "la tomó Juan").
--  · El aviso de stock bajo abre esa alerta exacta.

-- ───────── Editar nombre y correo ─────────
create or replace function admin_editar_usuario(p_perfil uuid, p_nombre text, p_correo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_correo text := lower(trim(p_correo));
begin
  perform exigir(puede_manejar(p_perfil), 'No puedes editar a esta persona');
  perform exigir(length(trim(coalesce(p_nombre,''))) > 1, 'Escribe el nombre');
  perform exigir(v_correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Correo inválido');
  perform exigir(not exists (select 1 from auth.users where lower(email) = v_correo and id <> p_perfil), 'Ya existe otro usuario con ese correo');
  update perfiles set nombre = trim(p_nombre), correo = v_correo where id = p_perfil;
  update auth.users set email = v_correo, updated_at = now() where id = p_perfil;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_correo)
    where user_id = p_perfil and provider = 'email';
  perform auditar(null, 'editar_usuario', 'perfiles', p_perfil::text, null, jsonb_build_object('nombre', p_nombre, 'correo', v_correo));
end $$;

-- ───────── Actividad general ─────────
create or replace function actividad_reciente(p_sedes uuid[], p_limite int default 80)
returns table (hora timestamptz, sede text, persona text, tipo text, texto text)
language sql stable security definer set search_path = public as $$
  select * from (
    select p.creado_en, s.nombre, pf.nombre, 'cobro',
      'Cobró ' || to_char(p.monto, 'FM$999G999G999') || ' · ' || p.medio
    from pagos p join sedes s on s.id = p.sede_id left join perfiles pf on pf.id = p.perfil_id
    where (p_sedes is null or p.sede_id = any(p_sedes)) and es_admin_de(p.sede_id)
    union all
    select pe.enviado_en, s.nombre, pf.nombre, 'pedido', 'Envió el pedido #' || pe.numero || ' · ' || coalesce(destino_pedido(pe.id), '')
    from pedidos pe join sedes s on s.id = pe.sede_id left join perfiles pf on pf.id = pe.enviado_por
    where (p_sedes is null or pe.sede_id = any(p_sedes)) and es_admin_de(pe.sede_id)
    union all
    select t.terminada_en, s.nombre, pf.nombre, 'tarea', 'Terminó: ' || t.titulo
    from tareas t join sedes s on s.id = t.sede_id left join perfiles pf on pf.id = t.terminada_por
    where t.estado = 'lista' and t.terminada_en is not null and (p_sedes is null or t.sede_id = any(p_sedes)) and es_admin_de(t.sede_id)
    union all
    select a.abierta_en, s.nombre, null, 'stock_bajo', 'Stock bajo · ' || i.nombre
    from alertas_stock a join reglas_stock r on r.id = a.regla_id join insumos i on i.id = r.insumo_id join sedes s on s.id = a.sede_id
    where (p_sedes is null or a.sede_id = any(p_sedes)) and es_admin_de(a.sede_id)
    union all
    select tu.inicio, s.nombre, pf.nombre, 'turno', 'Empezó turno · ' || coalesce((select nombre from roles where codigo = tu.rol), tu.rol)
    from turnos tu join sedes s on s.id = tu.sede_id left join perfiles pf on pf.id = tu.perfil_id
    where (p_sedes is null or tu.sede_id = any(p_sedes)) and es_admin_de(tu.sede_id)
    union all
    select h.creado_en, s.nombre, pf.nombre, 'admin', replace(h.accion, '_', ' ')
    from historial_auditoria h left join sedes s on s.id = h.sede_id left join perfiles pf on pf.id = h.perfil_id
    where (h.sede_id is null and es_ceo()) or (h.sede_id is not null and (p_sedes is null or h.sede_id = any(p_sedes)) and es_admin_de(h.sede_id))
  ) x
  where x.creado_en >= now() - interval '3 days'
  order by 1 desc limit greatest(1, least(p_limite, 300))
$$;

-- ───────── Probar avisos: se manda un aviso a uno mismo ─────────
create or replace function push_probar() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform exigir(auth.uid() is not null, 'Debes iniciar sesión');
  select count(*) into n from push_suscripciones where perfil_id = auth.uid();
  if n > 0 then
    perform notificar(null, null, auth.uid(), 'prueba', '🔔 Aviso de prueba', 'Si ves esto, los avisos de este celular funcionan.', null);
  end if;
  return n;
end $$;

-- ───────── Quién tomó la comanda ─────────
alter table comandas add column if not exists tomada_por uuid references perfiles(id);
create or replace function trg_comanda_tomada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'en_preparacion' and old.estado = 'nueva' and new.tomada_por is null then new.tomada_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists comanda_tomada on comandas;
create trigger comanda_tomada before update on comandas for each row execute function trg_comanda_tomada();

-- ───────── Avisos: el de stock bajo abre esa alerta; el de prueba abre la app ─────────
create or replace function push_destinos(p_id uuid)
returns table (sub_id uuid, endpoint text, p256dh text, auth text, titulo text, cuerpo text, url text)
language plpgsql stable security definer set search_path = public as $$
declare n notificaciones; v_url text;
begin
  select * into n from notificaciones where id = p_id;
  if n.id is null then return; end if;
  if n.rol in ('admin','ceo') and n.tipo <> 'stock_bajo' then return; end if;
  v_url := case
    when n.tipo in ('listo','comanda') then '/?abrir=comanda:' || n.ref_id
    when n.tipo in ('tarea','recordatorio') then '/?abrir=tarea:' || n.ref_id
    when n.tipo = 'stock_bajo' then '/?abrir=stock:' || coalesce(n.ref_id::text, '')
    when n.tipo in ('domicilio','pedido_online') then '/?abrir=domicilios'
    else '/' end;
  return query
  select distinct on (s.endpoint) s.id, s.endpoint, s.p256dh, s.auth,
    'MAX PIZZA · ' || n.titulo,
    concat_ws(E'\n', nullif(n.cuerpo, ''), coalesce((select nombre from sedes where id = n.sede_id) || ' · ', '')
      || to_char(n.creada_en at time zone 'America/Bogota', 'DD/MM') || ' ' || hora_co(n.creada_en)),
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

grant execute on function admin_editar_usuario(uuid, text, text), actividad_reciente(uuid[], int), push_probar() to authenticated;
