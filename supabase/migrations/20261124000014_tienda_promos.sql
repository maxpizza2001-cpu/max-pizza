-- Max Pizza · 014 · Tienda online · Fase 6: promociones (automáticas o con código) y descuento calculado en el servidor
-- Ajustes, zonas y adicionales ya tienen tablas (010); Administración los edita directo (RLS: solo admin escribe).

create table if not exists promociones (
  id         uuid primary key default gen_random_uuid(),
  sede_id    uuid references sedes(id),           -- vacío = todas las sedes
  nombre     text not null,
  tipo       text not null check (tipo in ('porcentaje','valor')),
  valor      numeric(14,2) not null check (valor > 0),
  minimo     numeric(14,2) not null default 0,     -- subtotal mínimo para que aplique
  codigo     text,                                 -- vacío = automática
  desde      date, hasta date,
  activa     boolean not null default true,
  creada_en  timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100)
);
create unique index if not exists promociones_codigo on promociones (upper(codigo)) where codigo is not null;
alter table promociones enable row level security;
create policy equipo_lee on promociones for select to authenticated using (true);
create policy admin_escribe on promociones for all to authenticated using (es_admin()) with check (es_admin());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on promociones to authenticated;
  end if;
end $$;

alter table pedidos_online add column if not exists descuento numeric(14,2) not null default 0;
alter table pedidos_online add column if not exists promocion_id uuid references promociones(id);

-- La mejor promoción que aplica a este subtotal (con el código si el cliente escribió uno)
create or replace function promo_mejor(p_sede uuid, p_sub numeric, p_codigo text)
returns table (id uuid, nombre text, descuento numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre,
    least(p_sub, case when p.tipo = 'porcentaje' then round(p_sub * p.valor / 100) else p.valor end) as descuento
  from promociones p
  where p.activa and (p.sede_id is null or p.sede_id = p_sede) and p_sub >= p.minimo
    and (p.desde is null or p.desde <= hoy_co()) and (p.hasta is null or p.hasta >= hoy_co())
    and (p.codigo is null or upper(p.codigo) = upper(trim(coalesce(p_codigo, ''))))
  order by 3 desc limit 1
$$;

-- Lo público de la tienda ahora incluye las promociones automáticas (las de código no se revelan)
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
                where o.activo), '[]'),
    'promos', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'tipo', p.tipo, 'valor', p.valor, 'minimo', p.minimo))
                from promociones p where p.activa and p.codigo is null and (p.sede_id is null or p.sede_id = p_sede)
                  and (p.desde is null or p.desde <= hoy_co()) and (p.hasta is null or p.hasta >= hoy_co())), '[]'),
    'hay_codigos', exists (select 1 from promociones p where p.activa and p.codigo is not null and (p.sede_id is null or p.sede_id = p_sede)))
$$;

-- Vista previa del descuento para el carrito (el valor que vale es el que calcula tienda_crear_pedido)
create or replace function tienda_promo(p_sede uuid, p_subtotal numeric, p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('nombre', nombre, 'descuento', descuento) from promo_mejor(p_sede, p_subtotal, p_codigo)), 'null'::jsonb)
$$;

create or replace function tienda_crear_pedido(p_op uuid, p_sede uuid, p_lineas jsonb, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; a tienda_ajustes; z zonas_domicilio; l jsonb; v_lineas jsonb := '[]'::jsonb;
  v_prod productos; v_extra numeric; v_txt text; v_cant numeric; v_ops int; v_ok int;
  v_cuenta uuid; v_res jsonb; v_sub numeric; v_dom numeric := 0; v_total numeric; v_codigo text; pr record; v_desc numeric := 0;
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
  if nullif(trim(coalesce(p_datos->>'codigo_promo', '')), '') is not null then
    perform exigir(exists (select 1 from promociones where activa and upper(codigo) = upper(trim(p_datos->>'codigo_promo'))
      and (sede_id is null or sede_id = p_sede)), 'Ese código de promoción no existe o ya venció');
  end if;
  select * into pr from promo_mejor(p_sede, v_sub, p_datos->>'codigo_promo');
  v_desc := coalesce(pr.descuento, 0);
  v_total := v_sub + v_dom - v_desc;
  perform exigir(v_medio <> 'efectivo' or v_paga is null or v_paga >= v_total, 'Con ese billete no alcanza para el total');
  update cuentas set total = v_total where id = v_cuenta;

  loop
    v_codigo := codigo_pedido();
    exit when not exists (select 1 from pedidos_online where codigo = v_codigo);
  end loop;
  insert into pedidos_online (sede_id, cuenta_id, pedido_id, operacion_id, codigo, nombre, celular, entrega, direccion, barrio,
    referencia, indicaciones, zona_id, medio, paga_con, subtotal, domicilio, total, comprobante, comprobante_estado, descuento, promocion_id)
  values (p_sede, v_cuenta, (v_res->>'pedido_id')::uuid, p_op, v_codigo, left(trim(p_datos->>'nombre'), 80), v_cel, v_entrega,
    case when v_entrega = 'domicilio' then left(trim(p_datos->>'direccion'), 160) end,
    case when v_entrega = 'domicilio' then left(trim(p_datos->>'barrio'), 80) end,
    case when v_entrega = 'domicilio' then nullif(left(trim(coalesce(p_datos->>'referencia', '')), 160), '') end,
    nullif(left(trim(coalesce(p_datos->>'indicaciones', '')), 300), ''),
    z.id, v_medio, case when v_medio = 'efectivo' then v_paga end, v_sub, v_dom, v_total,
    nullif(p_datos->>'comprobante', ''),
    case when v_medio = 'efectivo' then 'no_aplica' else 'pendiente' end, v_desc, pr.id);

  perform notificar(p_sede, 'caja', null, 'pedido_online', '🛵 Pedido online #' || (v_res->>'numero'),
    format('%s · $%s · %s', left(trim(p_datos->>'nombre'), 40), to_char(v_total, 'FM999G999G999'), v_entrega), v_cuenta);

  return op_terminar(p_op, jsonb_build_object('codigo', v_codigo, 'numero', (v_res->>'numero')::int,
    'subtotal', v_sub, 'domicilio', v_dom, 'descuento', v_desc, 'promocion', pr.nombre, 'total', v_total));
end $$;

revoke execute on function promo_mejor(uuid, numeric, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function promo_mejor(uuid, numeric, text) from anon, authenticated;
    grant execute on function tienda_promo(uuid, numeric, text), tienda_info(uuid) to anon, authenticated;
  end if;
end $$;
