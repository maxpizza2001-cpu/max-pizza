-- Max Pizza · 025 · Análisis con gráficas: consumo por período, sede, área, categoría y producto
-- Datos reales de movimientos de inventario (nada inventado). Solo de las sedes que la persona administra.

create or replace function analisis_periodo(p_sedes uuid[], p_desde timestamptz, p_hasta timestamptz, p_paso text default 'dia')
returns table (periodo date, sede_id uuid, sede text, area text, categoria text, insumo_id uuid, insumo text, unidad text,
               usado numeric, comprado numeric, merma numeric, producido numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc(case p_paso when 'mes' then 'month' when 'semana' then 'week' else 'day' end,
                    ms.creado_en at time zone 'America/Bogota')::date,
    ms.sede_id, s.nombre, u.codigo, i.categoria, i.id, i.nombre, i.unidad,
    sum(case when ms.tipo in ('venta','consumo') then -ms.cantidad else 0 end),
    sum(case when ms.tipo = 'recepcion' then ms.cantidad else 0 end),
    sum(case when ms.tipo = 'merma' then -ms.cantidad
             when ms.tipo = 'ajuste' and ms.cantidad < 0 then -ms.cantidad else 0 end),
    sum(case when ms.tipo in ('produccion','armado') and ms.cantidad > 0 then ms.cantidad else 0 end)
  from movimientos_stock ms
  join sedes s on s.id = ms.sede_id
  join insumos i on i.id = ms.insumo_id
  join ubicaciones_stock u on u.id = ms.ubicacion_id
  where ms.creado_en >= p_desde and ms.creado_en < p_hasta
    and (p_sedes is null or ms.sede_id = any(p_sedes))
    and es_admin_de(ms.sede_id)
    and ms.tipo in ('venta','consumo','recepcion','merma','ajuste','produccion','armado')
  group by 1, 2, 3, 4, 5, 6, 7, 8
$$;

-- El análisis viejo ya no muestra sedes que el admin no maneja
create or replace function analisis_consumo(p_sede uuid default null, p_dias int default 7)
returns table (sede text, categoria text, insumo text, unidad text, usado numeric, merma numeric, existencia numeric)
language sql stable security definer set search_path = public as $$
  with m as (
    select ms.sede_id, ms.insumo_id,
      sum(case when ms.tipo in ('venta','consumo') then -ms.cantidad else 0 end) usado,
      sum(case when ms.tipo = 'merma' then coalesce(ms.cantidad_ref, -ms.cantidad)
               when ms.tipo = 'ajuste' and ms.cantidad < 0 and ms.motivo ilike 'merma%' then -ms.cantidad else 0 end) merma
    from movimientos_stock ms
    where ms.creado_en >= now() - make_interval(days => p_dias)
      and (p_sede is null or ms.sede_id = p_sede)
    group by ms.sede_id, ms.insumo_id
  ), e as (
    select sede_id, insumo_id, sum(fisico) existencia from saldos_stock
    where (p_sede is null or sede_id = p_sede) group by sede_id, insumo_id
  )
  select s.nombre, i.categoria, i.nombre, i.unidad, coalesce(m.usado, 0), coalesce(m.merma, 0), coalesce(e.existencia, 0)
  from e join insumos i on i.id = e.insumo_id join sedes s on s.id = e.sede_id
  left join m on m.sede_id = e.sede_id and m.insumo_id = e.insumo_id
  where es_admin_de(e.sede_id)
  order by i.categoria, i.nombre, s.nombre
$$;

-- Historial de producción de tortas para Administración (día/semana/mes/año, sede, persona)
create or replace function produccion_tortas_historial(p_sedes uuid[], p_desde timestamptz, p_hasta timestamptz, p_paso text default 'dia')
returns table (periodo date, sede text, persona text, tipo text, cantidad numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc(case p_paso when 'anio' then 'year' when 'mes' then 'month' when 'semana' then 'week' else 'day' end,
                    m.creado_en at time zone 'America/Bogota')::date,
    s.nombre, coalesce(p.nombre, '—'), m.motivo, sum(abs(m.cantidad))
  from movimientos_stock m join lotes_produccion l on l.id::text = m.ref_id and m.ref_tipo = 'lote' and l.tipo = 'tortas'
  join sedes s on s.id = m.sede_id left join perfiles p on p.id = l.perfil_id
  where m.creado_en >= p_desde and m.creado_en < p_hasta
    and (p_sedes is null or m.sede_id = any(p_sedes)) and es_admin_de(m.sede_id)
  group by 1, 2, 3, 4
  order by 1 desc, 2, 3, 4
$$;

grant execute on function analisis_periodo(uuid[], timestamptz, timestamptz, text),
  produccion_tortas_historial(uuid[], timestamptz, timestamptz, text) to authenticated;
