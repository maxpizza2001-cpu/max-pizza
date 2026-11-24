-- Max Pizza · 011 · Tienda online · Fase 3: el pedido del cliente entra al MISMO motor (crear_envio)
-- Precios, adicionales y domicilio se calculan en el servidor; el navegador solo manda qué quiere.

alter table cuentas drop constraint if exists cuentas_tipo_check;
alter table cuentas add constraint cuentas_tipo_check check (tipo in ('mesa','mostrador','llevar','online'));

create table if not exists pedidos_online (
  id                  uuid primary key default gen_random_uuid(),
  sede_id             uuid not null references sedes(id),
  cuenta_id           uuid not null references cuentas(id),
  pedido_id           uuid not null references pedidos(id),
  operacion_id        uuid not null unique,
  codigo              text not null unique,
  nombre              text not null,
  celular             text not null,
  entrega             text not null check (entrega in ('domicilio','recoger')),
  direccion           text, barrio text, referencia text, indicaciones text,
  zona_id             uuid references zonas_domicilio(id),
  medio               text not null check (medio in ('efectivo','nequi','transferencia')),
  paga_con            numeric(14,2),
  subtotal            numeric(14,2) not null,
  domicilio           numeric(14,2) not null default 0,
  total               numeric(14,2) not null,
  comprobante         text,             -- ruta en el bucket "comprobantes"
  comprobante_estado  text not null default 'no_aplica' check (comprobante_estado in ('no_aplica','pendiente','verificado','rechazado')),
  estado              text not null default 'recibido'
                      check (estado in ('recibido','confirmado','en_preparacion','listo','en_camino','entregado','cancelado')),
  domiciliario        text,
  salio_en            timestamptz, entregado_en timestamptz,
  notas_internas      text,
  creado_en           timestamptz not null default now()
);
create index if not exists pedidos_online_sede on pedidos_online (sede_id, creado_en desc);
alter table pedidos_online enable row level security;
create policy equipo_sede_lee on pedidos_online for select to authenticated using (puede_ver_sede(sede_id));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on pedidos_online to authenticated;
  end if;
end $$;

-- Comprobantes de pago: el cliente sube (sin cuenta), solo el equipo los ve
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false) on conflict (id) do nothing;
    execute $p$ create policy "comprobantes cliente sube" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'comprobantes') $p$;
    execute $p$ create policy "comprobantes equipo ve" on storage.objects for select to authenticated
      using (bucket_id = 'comprobantes') $p$;
  end if;
end $$;

-- crear_envio: igual que antes, más el valor de los adicionales SOLO en cuentas online (lo calcula tienda_crear_pedido)
create or replace function crear_envio(p_op uuid, p_cuenta uuid, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c cuentas;
  v_pedido uuid; v_num int;
  l jsonb; p productos; v_precio numeric; v_receta uuid; v_linea uuid; v_cant numeric;
  d record; v_ubic uuid; v_est uuid; v_comanda uuid;
  v_total numeric := 0;
  v_comandas jsonb := '[]'::jsonb;
begin
  select * into c from cuentas where id = p_cuenta for update;
  perform exigir(jsonb_array_length(coalesce(p_lineas,'[]'::jsonb)) > 0, 'El pedido está vacío');
  v_num := siguiente_numero_pedido(c.sede_id);
  insert into pedidos (sede_id, cuenta_id, numero, operacion_id, enviado_por)
  values (c.sede_id, c.id, v_num, p_op, auth.uid()) returning id into v_pedido;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (l->>'cantidad')::numeric;
    perform exigir(v_cant > 0, 'Cantidad inválida');
    select * into p from productos where id = (l->>'producto_id')::uuid and activo;
    perform exigir(found, 'Producto no disponible');
    select precio into v_precio from productos_sede where producto_id = p.id and sede_id = c.sede_id and disponible;
    perform exigir(v_precio is not null, format('%s no está disponible en esta sede', p.nombre));
    if c.tipo = 'online' then v_precio := v_precio + coalesce((l->>'precio_extra')::numeric, 0); end if;
    select id into v_receta from recetas where producto_id = p.id and vigente;

    insert into lineas_pedido (pedido_id, cuenta_id, producto_id, receta_id, cantidad, precio_unit, observacion)
    values (v_pedido, c.id, p.id, v_receta, v_cant, v_precio, nullif(trim(l->>'observacion'), ''))
    returning id into v_linea;
    v_total := v_total + v_cant * v_precio;

    -- Inventario según estación: horno = reserva porciones; ninguna (bebidas) = sale de una vez; rapidas = se consume al preparar
    if v_receta is not null and p.estacion <> 'rapidas' then
      for d in select * from receta_detalles where receta_id = v_receta loop
        v_ubic := ubicacion_id(c.sede_id, d.ubicacion);
        if p.estacion = 'horno' then
          perform exigir_disponible(v_ubic, d.insumo_id, d.cantidad * v_cant);
          perform stock_fila(v_ubic, d.insumo_id);
          update saldos_stock set reservado = reservado + d.cantidad * v_cant, actualizado = now()
            where ubicacion_id = v_ubic and insumo_id = d.insumo_id;
          insert into reservas_stock (linea_pedido_id, ubicacion_id, insumo_id, cantidad)
          values (v_linea, v_ubic, d.insumo_id, d.cantidad * v_cant);
          perform evaluar_reglas(v_ubic, d.insumo_id);
        else
          perform stock_mover(v_ubic, d.insumo_id, -(d.cantidad * v_cant), 'venta', p.nombre, 'linea_pedido', v_linea::text, v_receta);
        end if;
      end loop;
    end if;

    -- Comanda por estación (una por envío y estación); solo llega lo de este envío
    if p.estacion in ('horno','rapidas') then
      select id into v_est from estaciones where sede_id = c.sede_id and codigo = p.estacion and activa;
      perform exigir(v_est is not null, 'La sede no tiene la estación ' || p.estacion);
      select id into v_comanda from comandas where pedido_id = v_pedido and estacion_id = v_est;
      if v_comanda is null then
        insert into comandas (sede_id, pedido_id, estacion_id) values (c.sede_id, v_pedido, v_est) returning id into v_comanda;
        insert into historial_estados (entidad, entidad_id, estado_nuevo, perfil_id) values ('comanda', v_comanda, 'nueva', auth.uid());
        v_comandas := v_comandas || jsonb_build_object('id', v_comanda, 'estacion', p.estacion);
        perform notificar(c.sede_id, case when p.estacion = 'horno' then 'caja' else 'rapidas' end, null, 'comanda',
          'Nueva comanda · pedido ' || v_num, null, v_comanda);
      end if;
      insert into lineas_comanda (comanda_id, linea_pedido_id) values (v_comanda, v_linea);
    end if;
  end loop;

  update cuentas set total = total + v_total,
    estado = case when estado = 'pagada' then 'abierta' else estado end
  where id = c.id;

  return jsonb_build_object('cuenta_id', c.id, 'pedido_id', v_pedido, 'numero', v_num, 'total_envio', v_total, 'comandas', v_comandas);
end $$;


create or replace function codigo_pedido() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6)
$$;

-- El cliente (sin cuenta) hace su pedido. p_lineas: [{producto_id, cantidad, opciones:[id], nota}]
-- p_datos: {nombre, celular, entrega, direccion, barrio, zona_id, referencia, indicaciones, medio, paga_con, comprobante}
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
    v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod.id, 'cantidad', v_cant, 'precio_extra', v_extra,
      'observacion', concat_ws(' · ', 'ONLINE', v_txt, nullif(left(trim(coalesce(l->>'nota', '')), 140), '')));
  end loop;

  insert into cuentas (sede_id, tipo) values (p_sede, 'online') returning id into v_cuenta;
  v_res := crear_envio(p_op, v_cuenta, v_lineas);
  v_sub := (v_res->>'total_envio')::numeric;
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

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_crear_pedido(uuid, uuid, jsonb, jsonb) to anon, authenticated;
  end if;
end $$;
