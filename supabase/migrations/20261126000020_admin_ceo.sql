-- Max Pizza · 020 · Administrador CEO y administradores por sede
--  · Nuevo rol 'ceo': ve y maneja TODAS las sedes, crea sedes y es el único que nombra administradores.
--  · 'admin' pasa a ser administrador DE SUS SEDES: solo ve y gestiona las sedes donde tiene el rol admin.
--  · Nadie se puede dar permisos a sí mismo sobre otra sede: se valida en el servidor (funciones y RLS).
--  · Para no dejar a nadie por fuera, todos los administradores actuales quedan como CEO (luego el CEO ajusta).

insert into roles (codigo, nombre, orden) values ('ceo', 'Administrador CEO', 0) on conflict (codigo) do nothing;
insert into permisos (rol, permiso) select 'ceo', permiso from permisos where rol = 'admin' on conflict do nothing;

insert into accesos_sede (perfil_id, sede_id, rol)
select distinct on (perfil_id) perfil_id, sede_id, 'ceo' from accesos_sede where rol = 'admin'
order by perfil_id
on conflict do nothing;

-- ───────── Ayudantes de permisos ─────────
create or replace function es_ceo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.rol = 'ceo' and p.activo
  )
$$;

-- Administrador de esa sede (o CEO)
create or replace function es_admin_de(p_sede uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_ceo() or exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.sede_id = p_sede and a.rol = 'admin' and p.activo
  )
$$;

-- ¿Es administrador de alguna sede? (para lo que es de toda la cadena: catálogo, recetas, tienda)
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.rol in ('admin', 'ceo') and p.activo
  )
$$;

-- Lo que depende de la sede ya no se abre con "es admin de algo": solo CEO o admin DE ESA sede
create or replace function tiene_rol(p_sede uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select es_ceo() or exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.sede_id = p_sede and (a.rol = any(p_roles) or a.rol = 'admin') and p.activo
  )
$$;

create or replace function puede_ver_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_ceo() or exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.perfil_id = auth.uid() and a.sede_id = p_sede and p.activo
  )
$$;

-- ¿Puedo manejar a esta persona? CEO: a todos. Admin: solo personal (no admins/CEO) que esté SOLO en sus sedes.
create or replace function puede_manejar(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_ceo() or (es_admin() and not exists (
    select 1 from accesos_sede a where a.perfil_id = p_perfil and (a.rol in ('admin','ceo') or not es_admin_de(a.sede_id))
  ))
$$;

-- ───────── Accesos (roles y sedes de cada persona) ─────────
drop policy if exists leer on accesos_sede;
drop policy if exists admin_escribe on accesos_sede;
create policy leer on accesos_sede for select to authenticated using (perfil_id = auth.uid() or es_admin_de(sede_id));
create policy ceo_o_admin_sede on accesos_sede for all to authenticated
  using (es_ceo() or (es_admin_de(sede_id) and rol not in ('admin','ceo')))
  with check (es_ceo() or (es_admin_de(sede_id) and rol not in ('admin','ceo')));

-- Siempre debe quedar al menos un CEO activo
create or replace function trg_ultimo_ceo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'ceo' and (tg_op = 'DELETE' or new.rol <> 'ceo') and not exists (
    select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id
    where a.rol = 'ceo' and a.id <> old.id and p.activo) then
    raise exception 'Debe quedar al menos un Administrador CEO' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists accesos_ultimo_ceo on accesos_sede;
create trigger accesos_ultimo_ceo before delete or update on accesos_sede for each row execute function trg_ultimo_ceo();

-- ───────── Sedes: solo el CEO crea, renombra, activa o desactiva ─────────
drop policy if exists admin_escribe on sedes;
create policy ceo_escribe on sedes for all to authenticated using (es_ceo()) with check (es_ceo());

-- Se cambia SOLO el chequeo de permiso dentro de funciones que ya funcionan (sin reescribirlas)
create or replace function cambiar_permiso(p_fn regprocedure, p_viejo text, p_nuevo text) returns void
language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn);
begin
  if position(p_viejo in d) = 0 then raise exception 'No encontré el chequeo en %', p_fn; end if;
  execute replace(d, p_viejo, p_nuevo);
end $f$;

select cambiar_permiso('crear_sede(text,int,uuid)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración puede crear sedes'')', 'exigir(es_ceo(), ''Solo el Administrador CEO puede crear sedes'')');
select cambiar_permiso('configurar_mesas(uuid,int)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración configura las mesas'')', 'exigir(es_admin_de(p_sede), ''Solo el administrador de esta sede configura las mesas'')');
select cambiar_permiso('crear_orden_compra(uuid,uuid,jsonb)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración hace compras'')', 'exigir(es_admin_de(p_sede), ''Solo el administrador de esta sede hace sus compras'')');
select cambiar_permiso('tarea_crear(uuid,text,text,text,uuid,text,text)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración crea tareas para el equipo'')', 'exigir(es_admin_de(p_sede), ''Solo el administrador de esta sede crea sus tareas'')');
select cambiar_permiso('tarea_editar(uuid,jsonb)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración edita las tareas del equipo'')', 'exigir(es_admin_de((select sede_id from tareas where id = p_tarea)), ''Solo el administrador de esta sede edita sus tareas'')');
select cambiar_permiso('cambiar_precio(uuid,uuid,numeric)'::regprocedure,
  'exigir(es_admin(), ''Solo Administración puede cambiar precios'')', 'exigir(es_admin_de(p_sede), ''Solo el administrador de esta sede cambia sus precios'')');
-- ───────── Usuarios ─────────
create or replace function admin_crear_usuario(p_correo text, p_clave text, p_nombre text, p_accesos jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid; v_correo text := lower(trim(p_correo)); a jsonb;
begin
  perform exigir(es_admin(), 'Solo Administración crea usuarios');
  for a in select * from jsonb_array_elements(coalesce(p_accesos, '[]')) loop
    perform exigir(es_ceo() or (es_admin_de((a->>'sede_id')::uuid) and a->>'rol' not in ('admin','ceo')),
      'Solo puedes dar roles de personal en tus sedes. Los administradores los nombra el Administrador CEO.');
  end loop;
  perform exigir(v_correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Correo inválido');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  perform exigir(length(trim(coalesce(p_nombre,''))) > 1, 'Escribe el nombre');
  perform exigir(not exists (select 1 from auth.users where lower(email) = v_correo), 'Ya existe un usuario con ese correo');
  v := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', v_correo,
    crypt(p_clave, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nombre', trim(p_nombre)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', v_correo, 'email_verified', true), 'email', now(), now(), now());
  insert into perfiles (id, nombre, correo) values (v, trim(p_nombre), v_correo) on conflict (id) do update set nombre = excluded.nombre;
  for a in select * from jsonb_array_elements(coalesce(p_accesos, '[]')) loop
    insert into accesos_sede (perfil_id, sede_id, rol) values (v, (a->>'sede_id')::uuid, a->>'rol') on conflict do nothing;
  end loop;
  perform auditar(null, 'crear_usuario', 'perfiles', v::text, null, jsonb_build_object('correo', v_correo, 'accesos', p_accesos));
  return v;
end $$;

create or replace function admin_cambiar_clave(p_perfil uuid, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir(puede_manejar(p_perfil), 'No puedes restablecer el acceso de esta persona');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')), updated_at = now() where id = p_perfil;
  perform auditar(null, 'cambiar_clave', 'perfiles', p_perfil::text, null, null);
end $$;

create or replace function admin_activar_usuario(p_perfil uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(puede_manejar(p_perfil), 'No puedes activar o desactivar a esta persona');
  perform exigir(p_perfil <> auth.uid() or p_activo, 'No puedes desactivar tu propia cuenta');
  perform exigir(p_activo or not exists (select 1 from accesos_sede where perfil_id = p_perfil and rol = 'ceo')
    or exists (select 1 from accesos_sede a join perfiles p on p.id = a.perfil_id where a.rol = 'ceo' and a.perfil_id <> p_perfil and p.activo),
    'Debe quedar al menos un Administrador CEO activo');
  update perfiles set activo = p_activo where id = p_perfil;
  update auth.users set banned_until = case when p_activo then null else 'infinity'::timestamptz end where id = p_perfil;
  if not p_activo then update turnos set fin = now() where perfil_id = p_perfil and fin is null; end if;
  perform auditar(null, case when p_activo then 'activar_usuario' else 'desactivar_usuario' end, 'perfiles', p_perfil::text, null, null);
end $$;

drop policy if exists admin_edita on perfiles;
create policy admin_edita on perfiles for update to authenticated using (puede_manejar(id)) with check (puede_manejar(id));

-- ───────── Ajuste de stock y mínimos: solo su sede ─────────
do $d$
declare p regprocedure;
begin
  select oid::regprocedure into p from pg_proc where proname = 'ajustar_stock' limit 1;
  perform cambiar_permiso(p, 'exigir(es_admin(), ''Solo Administración puede ajustar el stock'')',
    'exigir(es_admin_de(p_sede), ''Solo el administrador de esta sede puede ajustar su stock'')');
end $d$;

create or replace function trg_reglas_admin_sede() returns trigger
language plpgsql security definer set search_path = public as $t$
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- procesos automáticos
  if tg_op <> 'INSERT' then perform exigir(es_admin_de(old.sede_id), 'Solo puedes cambiar los mínimos de tus sedes'); end if;
  if tg_op <> 'DELETE' then perform exigir(es_admin_de(new.sede_id), 'Solo puedes cambiar los mínimos de tus sedes'); end if;
  return coalesce(new, old);
end $t$;
drop trigger if exists solo_admin_sede on reglas_stock;
create trigger solo_admin_sede before insert or update or delete on reglas_stock for each row execute function trg_reglas_admin_sede();

drop function cambiar_permiso(regprocedure, text, text);

-- ───────── Panel del CEO: quién tiene permisos administrativos ─────────
create or replace function ceo_administradores() returns table (perfil_id uuid, nombre text, correo text, activo boolean, rol text, sedes text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.correo, p.activo, a.rol, array_agg(s.nombre order by s.nombre)
  from accesos_sede a join perfiles p on p.id = a.perfil_id join sedes s on s.id = a.sede_id
  where a.rol in ('admin','ceo') and es_ceo()
  group by p.id, p.nombre, p.correo, p.activo, a.rol
  order by a.rol, p.nombre
$$;

grant execute on function es_ceo, es_admin_de, puede_manejar, ceo_administradores to authenticated;
