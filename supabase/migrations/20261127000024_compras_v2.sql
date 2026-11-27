-- Max Pizza · 024 · Proveedores, necesidades de compra por sede, WhatsApp; borrar proveedores y productos sin perder historia

-- ───────── Datos del proveedor ─────────
alter table proveedores add column if not exists contacto text;
alter table proveedores add column if not exists telefono text;
alter table proveedores add column if not exists categorias text;
alter table proveedores add column if not exists notas text;
alter table proveedores add column if not exists sedes uuid[];            -- null = atiende todas las sedes
alter table proveedores add column if not exists eliminado boolean not null default false;
-- Cómo se le compra: "bloque" de 2.500 g, "paquete" de 50 und…
alter table proveedor_insumos add column if not exists unidad_compra text;
alter table proveedor_insumos add column if not exists contenido numeric(14,3) check (contenido is null or contenido > 0);

-- ───────── Necesidades de compra calculadas con el inventario real ─────────
-- Por cada sede (solo las que el usuario administra): lo que está en stock bajo y se compra afuera.
-- Sugerido = llevar el saldo hasta el doble del mínimo. Se le asigna el proveedor activo que lo vende y atiende esa sede.
create or replace function necesidades_compra(p_sedes uuid[])
returns table (insumo_id uuid, insumo text, unidad text, sede_id uuid, sede text, saldo numeric, minimo numeric, sugerido numeric,
               proveedor_id uuid, proveedor text, whatsapp text, unidad_compra text, contenido numeric)
language sql stable security definer set search_path = public as $$
  with bajos as (
    select r.insumo_id, r.sede_id, sum(greatest(coalesce(s.fisico - s.reservado, 0), 0)) saldo, sum(r.minimo) minimo
    from reglas_stock r
    join alertas_stock a on a.regla_id = r.id and a.estado = 'activa'
    left join saldos_stock s on s.ubicacion_id = r.ubicacion_id and s.insumo_id = r.insumo_id
    join insumos i on i.id = r.insumo_id
    where r.sede_id = any(p_sedes) and r.activa and es_admin_de(r.sede_id)
      and i.categoria not in ('porciones','produccion','masa')       -- lo que se produce en casa no se compra
    group by r.insumo_id, r.sede_id)
  select b.insumo_id, i.nombre, i.unidad, b.sede_id, se.nombre, b.saldo, b.minimo, greatest(b.minimo * 2 - b.saldo, 0),
         pv.id, pv.nombre, pv.whatsapp, pv.unidad_compra, pv.contenido
  from bajos b join insumos i on i.id = b.insumo_id join sedes se on se.id = b.sede_id
  left join lateral (
    select p.*, x.unidad_compra, x.contenido from proveedor_insumos x join proveedores p on p.id = x.proveedor_id
    where x.insumo_id = b.insumo_id and p.activo and not p.eliminado and (p.sedes is null or b.sede_id = any(p.sedes))
    order by x.precio nulls last limit 1) pv on true
  order by pv.nombre nulls last, i.nombre, se.nombre
$$;

-- ───────── Borrar proveedor: si tiene compras se desactiva (la historia se conserva) ─────────
create or replace function proveedor_eliminar(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración maneja proveedores');
  if exists (select 1 from ordenes_compra where proveedor_id = p_id) then
    update proveedores set activo = false, eliminado = true where id = p_id;
    perform auditar(null, 'desactivar_proveedor', 'proveedores', p_id::text, null, null);
    return 'desactivado';
  end if;
  delete from proveedor_precios_historial where proveedor_id = p_id;
  delete from proveedor_insumos where proveedor_id = p_id;
  delete from proveedores where id = p_id;
  perform auditar(null, 'eliminar_proveedor', 'proveedores', p_id::text, null, null);
  return 'eliminado';
end $$;

-- ───────── Borrar producto: si nunca se vendió se borra; si tiene historia, se desactiva ─────────
create or replace function producto_eliminar(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración maneja el catálogo');
  if exists (select 1 from lineas_pedido where producto_id = p_id) or exists (select 1 from combo_items where producto_id = p_id) then
    update productos set activo = false where id = p_id;
    update productos_sede set disponible = false where producto_id = p_id;
    perform auditar(null, 'desactivar_producto', 'productos', p_id::text, null, null);
    return 'desactivado';
  end if;
  begin
    delete from receta_detalles where receta_id in (select id from recetas where producto_id = p_id);
    delete from recetas where producto_id = p_id;
    delete from precios_historial where producto_id = p_id;
    delete from productos_sede where producto_id = p_id;
    delete from productos where id = p_id;
  exception when foreign_key_violation then
    -- Tiene algún otro registro asociado: se conserva y solo se desactiva
    update productos set activo = false where id = p_id;
    update productos_sede set disponible = false where producto_id = p_id;
    return 'desactivado';
  end;
  perform auditar(null, 'eliminar_producto', 'productos', p_id::text, null, null);
  return 'eliminado';
end $$;

grant execute on function necesidades_compra(uuid[]), proveedor_eliminar(uuid), producto_eliminar(uuid) to authenticated;
