-- Max Pizza · cuentas de prueba (una por rol, con acceso a todas las sedes)
-- Correo: <rol>@maxpizza.test · Clave de prueba: MaxPizza-prueba-2026
-- Ejecutar en Supabase → SQL Editor. Se puede correr varias veces (no duplica).
do $$
declare x record; v uuid;
begin
  for x in select * from (values
    ('admin','Administración'), ('caja','Caja'), ('mesero','Mesero'), ('rapidas','Comidas rápidas'),
    ('armado','Armado'), ('tortas','Tortas'), ('insumos','Insumos')) t(rol, nombre) loop
    select id into v from auth.users where email = x.rol || '@maxpizza.test';
    if v is null then
      v := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', x.rol || '@maxpizza.test',
        extensions.crypt('MaxPizza-prueba-2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', x.nombre), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v, v::text,
        jsonb_build_object('sub', v::text, 'email', x.rol || '@maxpizza.test', 'email_verified', true), 'email', now(), now(), now());
    end if;
    insert into perfiles (id, nombre, correo) values (v, x.nombre, x.rol || '@maxpizza.test') on conflict (id) do nothing;
    insert into accesos_sede (perfil_id, sede_id, rol) select v, s.id, x.rol from sedes s on conflict do nothing;
  end loop;
end $$;
select p.correo, string_agg(distinct a.rol, ', ') rol, count(*) sedes
from perfiles p join accesos_sede a on a.perfil_id = p.id group by p.correo order by 1;
