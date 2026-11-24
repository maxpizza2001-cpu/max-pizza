-- Max Pizza · 009 · Tienda online · Fase 1: catálogo público
-- Reutiliza productos / productos_sede / categorias (no hay catálogo aparte).
-- El público (sin cuenta) solo lee por estas dos funciones: nunca ve tablas internas.

alter table productos add column if not exists descripcion text;
alter table productos add column if not exists destacado boolean not null default false;   -- sale en la portada giratoria
alter table productos_sede add column if not exists online boolean not null default true;  -- se vende en la tienda de esa sede

-- Sedes que el cliente puede escoger
create or replace function tienda_sedes()
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select id, nombre from sedes where activa order by creada_en
$$;

-- Menú de una sede: solo lo activo, disponible y marcado para la tienda, con el precio de esa sede
create or replace function tienda_catalogo(p_sede uuid)
returns table (id uuid, nombre text, descripcion text, foto_url text, precio numeric, destacado boolean,
               formato text, categoria text, categoria_tipo text, categoria_orden int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.descripcion, p.foto_url, ps.precio, p.destacado,
         p.formato, c.nombre, c.tipo, c.orden
  from productos p
  join productos_sede ps on ps.producto_id = p.id and ps.sede_id = p_sede
  join categorias c on c.id = p.categoria_id
  join sedes s on s.id = p_sede and s.activa
  where p.activo and ps.disponible and ps.online
  order by c.orden, p.destacado desc, p.nombre
$$;

revoke execute on function tienda_sedes(), tienda_catalogo(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_sedes(), tienda_catalogo(uuid) to anon, authenticated;
  end if;
end $$;

-- Fotos de productos: carpeta pública "productos" en Supabase Storage (solo Administración sube o cambia)
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('productos', 'productos', true) on conflict (id) do nothing;
    execute $p$ create policy "productos fotos se ven" on storage.objects for select using (bucket_id = 'productos') $p$;
    execute $p$ create policy "productos fotos admin sube" on storage.objects for insert to authenticated
                with check (bucket_id = 'productos' and public.es_admin()) $p$;
    execute $p$ create policy "productos fotos admin cambia" on storage.objects for update to authenticated
                using (bucket_id = 'productos' and public.es_admin()) $p$;
    execute $p$ create policy "productos fotos admin borra" on storage.objects for delete to authenticated
                using (bucket_id = 'productos' and public.es_admin()) $p$;
  end if;
end $$;
