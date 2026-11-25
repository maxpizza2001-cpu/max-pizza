-- Max Pizza · 018 · La tienda sabe cuántas quedan: lo que no alcanza sale "Agotado" en vez de fallar al confirmar.
-- Solo para productos del horno (pizzas): son los que reservan porciones al pedir y por eso pueden quedarse sin stock.
-- disponibles = null → sin límite (comidas rápidas y bebidas se descuentan al preparar/vender, no bloquean el pedido).

drop function if exists tienda_catalogo(uuid);
create function tienda_catalogo(p_sede uuid)
returns table (id uuid, nombre text, descripcion text, foto_url text, precio numeric, destacado boolean,
               formato text, categoria text, categoria_tipo text, categoria_orden int, disponibles int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.descripcion, p.foto_url, ps.precio, p.destacado,
         p.formato, c.nombre, c.tipo, c.orden,
         case when p.estacion = 'horno' then greatest(0, coalesce(st.disponibles, 0)) end
  from productos p
  join productos_sede ps on ps.producto_id = p.id and ps.sede_id = p_sede
  join categorias c on c.id = p.categoria_id
  join sedes s on s.id = p_sede and s.activa
  left join lateral (
    select min(floor(coalesce(ss.fisico - ss.reservado, 0) / rd.cantidad))::int as disponibles
    from recetas r
    join receta_detalles rd on rd.receta_id = r.id and rd.cantidad > 0
    left join ubicaciones_stock u on u.sede_id = p_sede and u.codigo = rd.ubicacion
    left join saldos_stock ss on ss.ubicacion_id = u.id and ss.insumo_id = rd.insumo_id
    where r.producto_id = p.id and r.vigente
  ) st on true
  where p.activo and ps.disponible and ps.online
  order by c.orden, p.destacado desc, p.nombre
$$;
revoke execute on function tienda_catalogo(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_catalogo(uuid) to anon, authenticated;
  end if;
end $$;
