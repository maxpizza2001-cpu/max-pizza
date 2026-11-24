-- Max Pizza · 012 · Tienda online · Fase 4: Caja maneja los pedidos online; los adicionales descuentan su insumo

-- Lo que gasta cada adicional sale del inventario al hacer el pedido (ej. extra queso: 80 g de la ubicación armado)
create or replace function descontar_adicionales(p_sede uuid, p_pedido uuid, p_lineas jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare l jsonb; o producto_opciones;
begin
  for l in select * from jsonb_array_elements(p_lineas) loop
    for o in select * from producto_opciones
             where id in (select x::uuid from jsonb_array_elements_text(coalesce(l->'opciones', '[]'::jsonb)) x)
               and insumo_id is not null and coalesce(cantidad, 0) > 0 and ubicacion is not null loop
      perform stock_mover(ubicacion_id(p_sede, o.ubicacion), o.insumo_id, -(o.cantidad * (l->>'cantidad')::numeric),
        'venta', 'Adicional · ' || o.nombre, 'pedido', p_pedido::text);
    end loop;
  end loop;
end $$;

-- Caja / Administración cambian el estado del pedido online. Solo avanza; cancelar devuelve lo reservado.
create or replace function online_estado(p_id uuid, p_estado text, p_domiciliario text default null, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare po pedidos_online; c cuentas; v_lp uuid;
  orden constant text[] := array['recibido','confirmado','en_preparacion','listo','en_camino','entregado'];
begin
  select * into po from pedidos_online where id = p_id for update;
  perform exigir(found, 'El pedido no existe');
  perform exigir_rol(po.sede_id, array['caja']);
  if po.estado = p_estado then return; end if;
  perform exigir(po.estado not in ('entregado','cancelado'), 'Este pedido ya está cerrado');
  if p_estado = 'cancelado' then
    select * into c from cuentas where id = po.cuenta_id for update;
    perform exigir(c.pagado = 0, 'Ya tiene un pago registrado: primero hay que devolverlo');
    for v_lp in select id from lineas_pedido where cuenta_id = po.cuenta_id and estado = 'activa' loop
      perform cancelar_linea(v_lp, coalesce(p_motivo, 'Pedido online cancelado'));
    end loop;
    update cuentas set estado = 'anulada', total = 0 where id = po.cuenta_id;
  else
    perform exigir(array_position(orden, p_estado) is not null, 'Estado inválido');
    perform exigir(array_position(orden, p_estado) > array_position(orden, po.estado), 'El pedido ya pasó ese paso');
    perform exigir(p_estado <> 'en_camino' or po.entrega = 'domicilio', 'Este pedido es para recoger');
  end if;
  update pedidos_online set estado = p_estado,
    domiciliario = coalesce(nullif(trim(p_domiciliario), ''), domiciliario),
    salio_en = case when p_estado = 'en_camino' then now() else salio_en end,
    entregado_en = case when p_estado = 'entregado' then now() else entregado_en end,
    notas_internas = case when p_motivo is not null then concat_ws(' · ', notas_internas, p_motivo) else notas_internas end
  where id = p_id;
  insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id) values ('pedido_online', p_id, po.estado, p_estado, auth.uid());
end $$;

-- Caja revisa el comprobante de Nequi / transferencia
create or replace function online_comprobante(p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare po pedidos_online;
begin
  select * into po from pedidos_online where id = p_id for update;
  perform exigir(found, 'El pedido no existe');
  perform exigir_rol(po.sede_id, array['caja']);
  update pedidos_online set comprobante_estado = case when p_ok then 'verificado' else 'rechazado' end where id = p_id;
  insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
  values ('comprobante', p_id, po.comprobante_estado, case when p_ok then 'verificado' else 'rechazado' end, auth.uid());
end $$;

-- La cocina mueve el pedido solo hacia adelante: empezar → "En preparación"; todo listo → "Listo".
-- Nunca lo devuelve ni pisa lo que Caja ya marcó más adelante.
create or replace function trg_comanda_online() returns trigger
language plpgsql security definer set search_path = public as $$
declare po pedidos_online;
begin
  select * into po from pedidos_online where pedido_id = new.pedido_id for update;
  if not found or new.estado = old.estado then return new; end if;
  if new.estado in ('en_preparacion','lista') and po.estado in ('recibido','confirmado') then
    update pedidos_online set estado = 'en_preparacion' where id = po.id;
    po.estado := 'en_preparacion';
  end if;
  if po.estado = 'en_preparacion' and not exists (
       select 1 from comandas where pedido_id = new.pedido_id and estado in ('nueva','en_preparacion')) then
    update pedidos_online set estado = 'listo' where id = po.id;
  end if;
  return new;
end $$;
drop trigger if exists comandas_online on comandas;
create trigger comandas_online after update of estado on comandas for each row execute function trg_comanda_online();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table pedidos_online;
  end if;
end $$;

create or replace function tienda_crear_pedido(p_op uuid, p_sede uuid, p_lineas jsonb, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; a tienda_ajustes; z zonas_domicilio; l jsonb; v_lineas jsonb := '[]'::jsonb;
  v_prod productos; v_extra numeric; v_txt text; v_cant numeric; v_ops int; v_ok int;
  v_cuenta uuid; v_res jsonb; v_sub numeric; v_dom numeric := 0; v_total numeric; v_codigo text;
  v_entrega text := coalesce(p_datos->>'entrega', 'domicilio');
  v_medio text := coalesce(p_datos->>'medio', 'efectivo');
  v_cel text := regexp_replace(coalesce(p_datos->>'celular', ''), '\D', '', 'g');
  v_paga numeric := nullif(regexp_replace(coalesce(p_datos->>'paga_con', ''), '\D', '', 'g'), '')::numeric;
begin
  v_prev := op_iniciar(p_op, 'tienda_crear_pedido');
  if v_prev is not null then return v_prev; end if;

  perform exigir(exists (select 1 from sedes where id = p_sede and activa), 'Sede no disponible');
  select * into a from tienda_ajustes where sede_id = p_sede;
  perform exigir(a.sede_id is null or a.abierta, 'La tienda está cerrada en este momento');
  perform exigir(length(trim(coalesce(p_datos->>'nombre', ''))) >= 3, 'Escribe tu nombre completo');
  perform exigir(v_cel ~ '^3\d{9}$', 'Escribe un celular de 10 dígitos');
  perform exigir(v_entrega in ('domicilio','recoger'), 'Forma de entrega inválida');
  perform exigir(a.sede_id is null or (v_entrega = 'domicilio' and a.domicilio) or (v_entrega = 'recoger' and a.recoger),
    'Esa forma de entrega no está disponible');
  perform exigir(v_medio in ('efectivo','nequi','transferencia') and (a.sede_id is null or v_medio = any(a.medios)), 'Medio de pago no disponible');
  if v_entrega = 'domicilio' then
    perform exigir(length(trim(coalesce(p_datos->>'direccion', ''))) >= 5, 'Escribe la dirección');
    perform exigir(length(trim(coalesce(p_datos->>'barrio', ''))) >= 2, 'Escribe el barrio');
    select * into z from zonas_domicilio where id = nullif(p_datos->>'zona_id', '')::uuid and sede_id = p_sede and activa;
    perform exigir(z.id is not null, 'Escoge la zona de entrega');
    v_dom := z.tarifa;
  end if;
  perform exigir(jsonb_array_length(coalesce(p_lineas, '[]'::jsonb)) between 1 and 40, 'El pedido está vacío');

  -- Cada línea: producto que se vende online en la sede + adicionales de ese producto (precio del servidor)
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (l->>'cantidad')::numeric;
    perform exigir(v_cant between 1 and 50 and v_cant = trunc(v_cant), 'Cantidad inválida');
    v_prod := null;
    select p.* into v_prod from productos p join productos_sede ps on ps.producto_id = p.id
      where p.id = (l->>'producto_id')::uuid and p.activo and ps.sede_id = p_sede and ps.disponible and ps.online;
    perform exigir(v_prod.id is not null, 'Un producto de tu carrito ya no está disponible');
    v_ops := jsonb_array_length(coalesce(l->'opciones', '[]'::jsonb));
    select count(*), coalesce(sum(precio_extra), 0), string_agg('+ ' || nombre, ' · ' order by orden)
      into v_ok, v_extra, v_txt
      from producto_opciones where producto_id = v_prod.id and activo
       and id in (select x::uuid from jsonb_array_elements_text(coalesce(l->'opciones', '[]'::jsonb)) x);
    perform exigir(v_ok = v_ops, 'Un adicional de tu carrito ya no está disponible');
    v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod.id, 'opciones', coalesce(l->'opciones', '[]'::jsonb), 'cantidad', v_cant, 'precio_extra', v_extra,
      'observacion', concat_ws(' · ', 'ONLINE', v_txt, nullif(left(trim(coalesce(l->>'nota', '')), 140), '')));
  end loop;

  insert into cuentas (sede_id, tipo) values (p_sede, 'online') returning id into v_cuenta;
  v_res := crear_envio(p_op, v_cuenta, v_lineas);
  v_sub := (v_res->>'total_envio')::numeric;
  perform descontar_adicionales(p_sede, (v_res->>'pedido_id')::uuid, v_lineas);
  perform exigir(v_sub >= coalesce(a.pedido_minimo, 0), format('El pedido mínimo es $%s', to_char(a.pedido_minimo, 'FM999G999G999')));
  v_total := v_sub + v_dom;
  perform exigir(v_medio <> 'efectivo' or v_paga is null or v_paga >= v_total, 'Con ese billete no alcanza para el total');
  update cuentas set total = v_total where id = v_cuenta;

  loop
    v_codigo := codigo_pedido();
    exit when not exists (select 1 from pedidos_online where codigo = v_codigo);
  end loop;
  insert into pedidos_online (sede_id, cuenta_id, pedido_id, operacion_id, codigo, nombre, celular, entrega, direccion, barrio,
    referencia, indicaciones, zona_id, medio, paga_con, subtotal, domicilio, total, comprobante, comprobante_estado)
  values (p_sede, v_cuenta, (v_res->>'pedido_id')::uuid, p_op, v_codigo, left(trim(p_datos->>'nombre'), 80), v_cel, v_entrega,
    case when v_entrega = 'domicilio' then left(trim(p_datos->>'direccion'), 160) end,
    case when v_entrega = 'domicilio' then left(trim(p_datos->>'barrio'), 80) end,
    case when v_entrega = 'domicilio' then nullif(left(trim(coalesce(p_datos->>'referencia', '')), 160), '') end,
    nullif(left(trim(coalesce(p_datos->>'indicaciones', '')), 300), ''),
    z.id, v_medio, case when v_medio = 'efectivo' then v_paga end, v_sub, v_dom, v_total,
    nullif(p_datos->>'comprobante', ''),
    case when v_medio = 'efectivo' then 'no_aplica' else 'pendiente' end);

  perform notificar(p_sede, 'caja', null, 'pedido_online', '🛵 Pedido online #' || (v_res->>'numero'),
    format('%s · $%s · %s', left(trim(p_datos->>'nombre'), 40), to_char(v_total, 'FM999G999G999'), v_entrega), v_cuenta);

  return op_terminar(p_op, jsonb_build_object('codigo', v_codigo, 'numero', (v_res->>'numero')::int,
    'subtotal', v_sub, 'domicilio', v_dom, 'total', v_total));
end $$;
revoke execute on function descontar_adicionales(uuid, uuid, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function descontar_adicionales(uuid, uuid, jsonb) from anon, authenticated;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function online_estado(uuid, text, text, text), online_comprobante(uuid, boolean) to authenticated;
  end if;
end $$;
