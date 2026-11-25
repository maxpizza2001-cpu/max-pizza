-- Max Pizza · 016 · Avisos al celular aunque esté bloqueado (Web Push)
-- Cada celular que toca "Activar avisos" queda guardado aquí. Cuando nace una notificación (ej. "Domicilio disponible"),
-- la base llama a la función "avisar" del servidor, que le manda el aviso a los celulares de ese rol y sede.

create table if not exists push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references perfiles(id) on delete cascade,
  sede_id     uuid not null references sedes(id),
  rol         text not null references roles(codigo),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  creada_en   timestamptz not null default now()
);
create index if not exists push_suscripciones_destino on push_suscripciones (sede_id, rol);
alter table push_suscripciones enable row level security;
create policy propia_lee on push_suscripciones for select to authenticated using (perfil_id = auth.uid());
create policy propia_borra on push_suscripciones for delete to authenticated using (perfil_id = auth.uid());

-- Guardar (o mover) la suscripción de este celular a este rol y sede
create or replace function push_guardar(p_sede uuid, p_rol text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(auth.uid() is not null, 'Debes iniciar sesión');
  perform exigir(exists (select 1 from accesos_sede where perfil_id = auth.uid() and sede_id = p_sede and rol = p_rol), 'No tienes ese rol en esta sede');
  perform exigir(p_endpoint like 'https://%', 'Suscripción inválida');
  insert into push_suscripciones (perfil_id, sede_id, rol, endpoint, p256dh, auth)
  values (auth.uid(), p_sede, p_rol, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set perfil_id = excluded.perfil_id, sede_id = excluded.sede_id, rol = excluded.rol,
    p256dh = excluded.p256dh, auth = excluded.auth, creada_en = now();
end $$;

-- Dirección de la función "avisar" (se llena una vez en el proyecto real; vacía = no se mandan avisos)
create table if not exists config_app (clave text primary key, valor text not null);
alter table config_app enable row level security;

create or replace function trg_notificacion_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select valor into v_url from config_app where clave = 'url_avisar';
  if v_url is null or not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  -- Solo si hay algún celular suscrito para ese destino (no gasta llamadas en vano)
  if not exists (select 1 from push_suscripciones s where
       (new.perfil_id is not null and s.perfil_id = new.perfil_id)
       or (new.perfil_id is null and s.sede_id = new.sede_id and s.rol = new.rol)) then
    return new;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, jsonb_build_object('id', new.id), '{"Content-Type": "application/json"}'::jsonb;
  return new;
end $$;
drop trigger if exists notificaciones_push on notificaciones;
create trigger notificaciones_push after insert on notificaciones for each row execute function trg_notificacion_push();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, delete on push_suscripciones to authenticated;
    grant execute on function push_guardar(uuid, text, text, text, text) to authenticated;
  end if;
end $$;
