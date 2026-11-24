-- Max Pizza · 013 · Tienda online · Fase 5: el cliente sigue su pedido; Administración ajusta domicilios

-- Seguimiento público: hace falta el código Y el celular con que se pidió (nadie ve pedidos ajenos)
create or replace function tienda_seguimiento(p_codigo text, p_celular text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'codigo', o.codigo, 'numero', pe.numero, 'estado', o.estado, 'entrega', o.entrega, 'sede', s.nombre,
    'nombre', split_part(o.nombre, ' ', 1), 'barrio', o.barrio, 'medio', o.medio,
    'comprobante_estado', o.comprobante_estado, 'pagado', c.pagado >= c.total and c.total > 0,
    'subtotal', o.subtotal, 'domicilio', o.domicilio, 'total', o.total,
    'domiciliario', split_part(coalesce(o.domiciliario, ''), ' ', 1),
    'creado_en', o.creado_en, 'salio_en', o.salio_en, 'entregado_en', o.entregado_en,
    'historial', coalesce((select jsonb_agg(jsonb_build_object('estado', h.estado, 'en', h.en) order by h.en)
                  from (select estado_nuevo estado, min(creado_en) en from historial_estados
                        where entidad = 'pedido_online' and entidad_id = o.id group by estado_nuevo) h), '[]'::jsonb),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'cantidad', lp.cantidad,
                  'detalle', nullif(regexp_replace(coalesce(lp.observacion, ''), '^ONLINE( · )?', ''), '')) order by lp.id)
                  from lineas_pedido lp join productos p on p.id = lp.producto_id
                  where lp.pedido_id = o.pedido_id and lp.estado = 'activa'), '[]'::jsonb))
  from pedidos_online o join pedidos pe on pe.id = o.pedido_id join sedes s on s.id = o.sede_id join cuentas c on c.id = o.cuenta_id
  where o.codigo = upper(trim(p_codigo))
    and o.celular = regexp_replace(coalesce(p_celular, ''), '\D', '', 'g')
$$;

-- El cambio automático de la cocina también queda en el historial (para la línea de tiempo del cliente)
create or replace function trg_online_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- (Caja también lo anota en online_estado; el seguimiento toma la primera hora de cada paso)
  if new.estado is distinct from old.estado then
    insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
    values ('pedido_online', new.id, old.estado, new.estado, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists pedidos_online_historial on pedidos_online;
create trigger pedidos_online_historial after update of estado on pedidos_online for each row execute function trg_online_historial();

-- Administración: domiciliario, notas y tarifa de domicilio (la tarifa solo mientras no esté pagado)
create or replace function online_ajustar(p_id uuid, p_domiciliario text, p_notas text, p_domicilio numeric) returns void
language plpgsql security definer set search_path = public as $$
declare po pedidos_online; c cuentas;
begin
  perform exigir(es_admin(), 'Solo Administración ajusta domicilios');
  select * into po from pedidos_online where id = p_id for update;
  perform exigir(found, 'El pedido no existe');
  select * into c from cuentas where id = po.cuenta_id for update;
  if p_domicilio is not null and p_domicilio <> po.domicilio then
    perform exigir(p_domicilio >= 0, 'Valor inválido');
    perform exigir(c.pagado = 0 and po.estado <> 'cancelado', 'Ya está pagado o cancelado: la tarifa no se cambia');
    update cuentas set total = total - po.domicilio + p_domicilio where id = c.id;
  end if;
  update pedidos_online set domiciliario = nullif(trim(p_domiciliario), ''), notas_internas = nullif(trim(p_notas), ''),
    domicilio = coalesce(p_domicilio, domicilio), total = total - domicilio + coalesce(p_domicilio, domicilio)
  where id = p_id;
  perform auditar(po.sede_id, 'online_ajustar', 'pedidos_online', p_id::text, to_jsonb(po),
    jsonb_build_object('domiciliario', p_domiciliario, 'notas', p_notas, 'domicilio', p_domicilio));
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_seguimiento(text, text) to anon, authenticated;
    grant execute on function online_ajustar(uuid, text, text, numeric) to authenticated;
  end if;
end $$;
