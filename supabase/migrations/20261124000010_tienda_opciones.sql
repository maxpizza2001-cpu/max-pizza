-- Max Pizza · 010 · Tienda online · Fase 2: adicionales, ajustes de la tienda por sede y zonas de domicilio
-- Tamaños de pizza NO son tabla nueva: Porción / Personal ya son productos del catálogo; la tienda los agrupa por sabor.

-- Adicionales que el cliente puede sumar a un producto (lo que gastan queda anotado para descontarlo en la Fase 4)
create table if not exists producto_opciones (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references productos(id) on delete cascade,
  nombre        text not null,
  precio_extra  numeric(14,2) not null default 0 check (precio_extra >= 0),
  insumo_id     uuid references insumos(id),
  cantidad      numeric(14,3),
  ubicacion     text,
  orden         int not null default 0,
  activo        boolean not null default true,
  unique (producto_id, nombre)
);

-- Ajustes de la tienda por sede (se administran en la Fase 6)
create table if not exists tienda_ajustes (
  sede_id          uuid primary key references sedes(id),
  abierta          boolean not null default true,
  pedido_minimo    numeric(14,2) not null default 0,
  medios           text[] not null default array['efectivo','nequi','transferencia'],
  nequi_numero     text,
  cuenta_texto     text,          -- datos para transferencia
  horario_texto    text,
  recoger          boolean not null default true,
  domicilio        boolean not null default true
);

create table if not exists zonas_domicilio (
  id       uuid primary key default gen_random_uuid(),
  sede_id  uuid not null references sedes(id),
  nombre   text not null,
  tarifa   numeric(14,2) not null default 0 check (tarifa >= 0),
  activa   boolean not null default true,
  orden    int not null default 0,
  unique (sede_id, nombre)
);

alter table producto_opciones enable row level security;
alter table tienda_ajustes enable row level security;
alter table zonas_domicilio enable row level security;
create policy equipo_lee on producto_opciones for select to authenticated using (true);
create policy admin_escribe on producto_opciones for all to authenticated using (es_admin()) with check (es_admin());
create policy equipo_lee on tienda_ajustes for select to authenticated using (true);
create policy admin_escribe on tienda_ajustes for all to authenticated using (es_admin()) with check (es_admin());
create policy equipo_lee on zonas_domicilio for select to authenticated using (true);
create policy admin_escribe on zonas_domicilio for all to authenticated using (es_admin()) with check (es_admin());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on producto_opciones, tienda_ajustes, zonas_domicilio to authenticated;
  end if;
end $$;

-- Datos iniciales (ejemplos, editables)
insert into tienda_ajustes (sede_id, horario_texto) select id, 'Todos los días · 4:00 p. m. a 11:00 p. m.' from sedes on conflict do nothing;
insert into zonas_domicilio (sede_id, nombre, tarifa, orden)
  select s.id, z.nombre, z.tarifa, z.orden from sedes s
  cross join (values ('Cerca (hasta 2 km)', 3000, 1), ('Media (2 a 4 km)', 5000, 2), ('Lejos (4 a 6 km)', 7000, 3)) z(nombre, tarifa, orden)
  on conflict do nothing;
insert into producto_opciones (producto_id, nombre, precio_extra, insumo_id, cantidad, ubicacion, orden)
  select p.id, o.nombre, o.precio, (select id from insumos where codigo = o.cod), o.cant, o.ubic, o.orden
  from productos p join categorias c on c.id = p.categoria_id
  join (values
    ('pizza',  'personal', 'Extra queso',        3000, 'queso',             80, 'armado',         1),
    ('rapida', 'Hamburguesa', 'Doble carne',     6000, 'carne_hamburguesa',  1, 'nevera_rapidas', 1),
    ('rapida', 'Hamburguesa', 'Extra queso',     2000, 'queso',             30, 'nevera_rapidas', 2),
    ('rapida', '*',        'Porción extra de papas', 4000, 'papas',          1, 'nevera_rapidas', 3),
    ('rapida', 'Salchipapa', 'Extra salchicha',  3000, 'salchicha',          1, 'nevera_rapidas', 1)
  ) o(tipo, filtro, nombre, precio, cod, cant, ubic, orden)
    on c.tipo = o.tipo and (o.filtro = '*' or p.nombre = o.filtro or p.formato = o.filtro)
  on conflict do nothing;

-- Todo lo que la tienda necesita de una sede, en una sola llamada pública
create or replace function tienda_info(p_sede uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ajustes', (select jsonb_build_object('abierta', a.abierta, 'pedido_minimo', a.pedido_minimo, 'medios', to_jsonb(a.medios),
                  'nequi_numero', a.nequi_numero, 'cuenta_texto', a.cuenta_texto, 'horario_texto', a.horario_texto,
                  'recoger', a.recoger, 'domicilio', a.domicilio)
                from tienda_ajustes a join sedes s on s.id = a.sede_id and s.activa where a.sede_id = p_sede),
    'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'tarifa', z.tarifa) order by z.orden, z.nombre)
                from zonas_domicilio z where z.sede_id = p_sede and z.activa), '[]'),
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'producto_id', o.producto_id, 'nombre', o.nombre,
                  'precio_extra', o.precio_extra) order by o.orden, o.nombre)
                from producto_opciones o join productos_sede ps on ps.producto_id = o.producto_id and ps.sede_id = p_sede
                where o.activo), '[]'))
$$;
revoke execute on function tienda_info(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_info(uuid) to anon, authenticated;
  end if;
end $$;
