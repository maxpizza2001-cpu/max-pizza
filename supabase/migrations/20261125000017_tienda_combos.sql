-- Max Pizza · 017 · Tienda: combos, tiempo de entrega por zona, banner de temporada y redes sociales

-- Combos: varios productos del catálogo a un precio especial (cada producto sigue yendo a su cocina e inventario)
create table if not exists combos (
  id           uuid primary key default gen_random_uuid(),
  sede_id      uuid references sedes(id),            -- vacío = todas las sedes
  nombre       text not null,
  descripcion  text,
  foto_url     text,
  precio       numeric(14,2) not null check (precio > 0),
  activo       boolean not null default true,
  orden        int not null default 0,
  creado_en    timestamptz not null default now()
);
create table if not exists combo_items (
  id           uuid primary key default gen_random_uuid(),
  combo_id     uuid not null references combos(id) on delete cascade,
  producto_id  uuid not null references productos(id),
  cantidad     int not null default 1 check (cantidad between 1 and 20),
  unique (combo_id, producto_id)
);
alter table combos enable row level security;
alter table combo_items enable row level security;
create policy equipo_lee on combos for select to authenticated using (true);
create policy admin_escribe on combos for all to authenticated using (es_admin()) with check (es_admin());
create policy equipo_lee on combo_items for select to authenticated using (true);
create policy admin_escribe on combo_items for all to authenticated using (es_admin()) with check (es_admin());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on combos, combo_items to authenticated;
  end if;
end $$;

-- Tiempo de entrega por zona y datos de contacto / temporada de la tienda
alter table zonas_domicilio add column if not exists minutos_min int;
alter table zonas_domicilio add column if not exists minutos_max int;
alter table tienda_ajustes add column if not exists whatsapp text;
alter table tienda_ajustes add column if not exists instagram text;
alter table tienda_ajustes add column if not exists facebook text;
alter table tienda_ajustes add column if not exists tiktok text;
alter table tienda_ajustes add column if not exists banner_activo boolean not null default false;
alter table tienda_ajustes add column if not exists banner_etiqueta text;
alter table tienda_ajustes add column if not exists banner_titulo text;
alter table tienda_ajustes add column if not exists banner_texto text;
update zonas_domicilio set minutos_min = coalesce(minutos_min, 25 + 10 * (orden - 1)), minutos_max = coalesce(minutos_max, 40 + 10 * (orden - 1))
  where minutos_min is null;

create or replace function tienda_info(p_sede uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ajustes', (select jsonb_build_object('abierta', a.abierta, 'pedido_minimo', a.pedido_minimo, 'medios', to_jsonb(a.medios),
                  'nequi_numero', a.nequi_numero, 'cuenta_texto', a.cuenta_texto, 'horario_texto', a.horario_texto,
                  'recoger', a.recoger, 'domicilio', a.domicilio,
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

create or replace function tienda_crear_pedido(p_op uuid, p_sede uuid, p_lineas jsonb, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; a tienda_ajustes; z zonas_domicilio; l jsonb; v_lineas jsonb := '[]'::jsonb;
  v_prod productos; v_extra numeric; v_txt text; v_cant numeric; v_ops int; v_ok int;
  v_cuenta uuid; v_res jsonb; v_sub numeric; v_dom numeric := 0; v_total numeric; v_codigo text; pr record; v_desc numeric := 0; cb combos; ci record; v_base numeric; v_primero boolean;
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
    -- Combo: se abre en sus productos; el descuento del combo va en el producto más caro
    if l ? 'combo_id' then
      cb := null;
      select * into cb from combos where id = (l->>'combo_id')::uuid and activo and (sede_id is null or sede_id = p_sede);
      perform exigir(cb.id is not null, 'Un combo de tu carrito ya no está disponible');
      select count(*), count(ps.producto_id), coalesce(sum(ps.precio * c2.cantidad), 0) into v_ok, v_ops, v_base
        from combo_items c2 join productos p on p.id = c2.producto_id
        left join productos_sede ps on ps.producto_id = c2.producto_id and ps.sede_id = p_sede and ps.disponible and ps.online and p.activo
        where c2.combo_id = cb.id;
      perform exigir(v_ok > 0 and v_ok = v_ops, 'Un producto del combo ' || cb.nombre || ' ya no está disponible');
      v_primero := true;
      for ci in select c2.producto_id, c2.cantidad, ps.precio from combo_items c2
                join productos_sede ps on ps.producto_id = c2.producto_id and ps.sede_id = p_sede
                where c2.combo_id = cb.id order by ps.precio desc, c2.producto_id loop
        if v_primero then
          perform exigir(ci.precio + (cb.precio - v_base) / ci.cantidad >= 0, 'El combo ' || cb.nombre || ' tiene un precio inválido');
        end if;
        v_lineas := v_lineas || jsonb_build_object('producto_id', ci.producto_id, 'opciones', '[]'::jsonb, 'cantidad', ci.cantidad * v_cant,
          'precio_extra', case when v_primero then round((cb.precio - v_base) / ci.cantidad, 2) else 0 end,
          'observacion', concat_ws(' · ', 'ONLINE', 'COMBO ' || cb.nombre,
            case when v_primero then nullif(left(trim(coalesce(l->>'nota', '')), 140), '') end));
        v_primero := false;
      end loop;
      continue;
    end if;
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

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function tienda_info(uuid) to anon, authenticated;
  end if;
end $$;
