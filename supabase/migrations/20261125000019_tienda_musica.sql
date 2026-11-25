-- Max Pizza · 019 · La tienda puede sonar con la canción que suba Administración (si no hay, suena la música original)
-- La canción va en el bucket público "productos" (carpeta musica/), que solo Administración puede llenar.
alter table tienda_ajustes add column if not exists musica_url text;
alter table tienda_ajustes add column if not exists musica_nombre text;

create or replace function tienda_info(p_sede uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ajustes', (select jsonb_build_object('abierta', a.abierta, 'pedido_minimo', a.pedido_minimo, 'medios', to_jsonb(a.medios),
                  'nequi_numero', a.nequi_numero, 'cuenta_texto', a.cuenta_texto, 'horario_texto', a.horario_texto,
                  'recoger', a.recoger, 'domicilio', a.domicilio,
                  'musica_url', a.musica_url, 'musica_nombre', a.musica_nombre,
                  'whatsapp', a.whatsapp, 'instagram', a.instagram, 'facebook', a.facebook, 'tiktok', a.tiktok,
                  'banner', case when a.banner_activo and coalesce(a.banner_titulo, '') <> '' then
                    jsonb_build_object('etiqueta', a.banner_etiqueta, 'titulo', a.banner_titulo, 'texto', a.banner_texto) end)
                from tienda_ajustes a join sedes s on s.id = a.sede_id and s.activa where a.sede_id = p_sede),
    'zonas', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'tarifa', z.tarifa,
                  'minutos_min', z.minutos_min, 'minutos_max', z.minutos_max) order by z.orden, z.nombre)
                from zonas_domicilio z where z.sede_id = p_sede and z.activa), '[]'),
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'producto_id', o.producto_id, 'nombre', o.nombre,
                  'precio_extra', o.precio_extra) order by o.orden, o.nombre)
                from producto_opciones o join productos_sede ps on ps.producto_id = o.producto_id and ps.sede_id = p_sede
                where o.activo), '[]'),
    'promos', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'tipo', p.tipo, 'valor', p.valor, 'minimo', p.minimo))
                from promociones p where p.activa and p.codigo is null and (p.sede_id is null or p.sede_id = p_sede)
                  and (p.desde is null or p.desde <= hoy_co()) and (p.hasta is null or p.hasta >= hoy_co())), '[]'),
    'hay_codigos', exists (select 1 from promociones p where p.activa and p.codigo is not null and (p.sede_id is null or p.sede_id = p_sede)),
    -- Solo combos con TODOS sus productos disponibles en línea en esta sede
    'combos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'descripcion', c.descripcion,
                  'foto_url', c.foto_url, 'precio', c.precio, 'normal', x.normal, 'items', x.items) order by c.orden, c.nombre)
                from combos c
                cross join lateral (
                  select sum(ps.precio * ci.cantidad) normal, count(*) total, count(ps.producto_id) disponibles,
                         jsonb_agg(jsonb_build_object('producto_id', ci.producto_id, 'nombre', p.nombre, 'cantidad', ci.cantidad) order by ps.precio desc) items
                  from combo_items ci join productos p on p.id = ci.producto_id
                  left join productos_sede ps on ps.producto_id = ci.producto_id and ps.sede_id = p_sede and ps.disponible and ps.online and p.activo
                  where ci.combo_id = c.id) x
                where c.activo and (c.sede_id is null or c.sede_id = p_sede) and x.total > 0 and x.total = x.disponibles), '[]'))
$$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_info(uuid) to anon, authenticated;
  end if;
end $$;
