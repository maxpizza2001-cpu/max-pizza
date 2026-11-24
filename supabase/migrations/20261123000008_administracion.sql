-- Max Pizza · 008 · Administración
-- Usuarios desde la app (sin clave secreta), historial de precios automático, conteos revisables, análisis de consumo.

-- ───────── Equipo: crear usuarios, cambiar clave, activar/desactivar ─────────
create or replace function admin_crear_usuario(p_correo text, p_clave text, p_nombre text, p_accesos jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid; v_correo text := lower(trim(p_correo)); a jsonb;
begin
  perform exigir(es_admin(), 'Solo Administración crea usuarios');
  perform exigir(v_correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Correo inválido');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  perform exigir(length(trim(coalesce(p_nombre,''))) > 1, 'Escribe el nombre');
  perform exigir(not exists (select 1 from auth.users where lower(email) = v_correo), 'Ya existe un usuario con ese correo');
  v := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', v_correo,
    crypt(p_clave, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nombre', trim(p_nombre)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', v_correo, 'email_verified', true), 'email', now(), now(), now());
  insert into perfiles (id, nombre, correo) values (v, trim(p_nombre), v_correo) on conflict (id) do update set nombre = excluded.nombre;
  for a in select * from jsonb_array_elements(coalesce(p_accesos, '[]')) loop
    insert into accesos_sede (perfil_id, sede_id, rol) values (v, (a->>'sede_id')::uuid, a->>'rol') on conflict do nothing;
  end loop;
  perform auditar(null, 'crear_usuario', 'perfiles', v::text, null, jsonb_build_object('correo', v_correo, 'accesos', p_accesos));
  return v;
end $$;

create or replace function admin_cambiar_clave(p_perfil uuid, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir(es_admin(), 'Solo Administración restablece accesos');
  perform exigir(length(coalesce(p_clave,'')) >= 6, 'La clave debe tener mínimo 6 caracteres');
  update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')), updated_at = now() where id = p_perfil;
  perform auditar(null, 'cambiar_clave', 'perfiles', p_perfil::text, null, null);
end $$;

create or replace function admin_activar_usuario(p_perfil uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración activa o desactiva cuentas');
  perform exigir(p_perfil <> auth.uid() or p_activo, 'No puedes desactivar tu propia cuenta');
  update perfiles set activo = p_activo where id = p_perfil;
  update auth.users set banned_until = case when p_activo then null else 'infinity'::timestamptz end where id = p_perfil;
  if not p_activo then update turnos set fin = now() where perfil_id = p_perfil and fin is null; end if;
  perform auditar(null, case when p_activo then 'activar_usuario' else 'desactivar_usuario' end, 'perfiles', p_perfil::text, null, null);
end $$;

-- ───────── Precios: el historial se guarda solo, con cualquier cambio ─────────
create or replace function trg_precio_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.precio is distinct from old.precio then
    insert into precios_historial (producto_id, sede_id, precio_ant, precio_nuevo, perfil_id)
    values (new.producto_id, new.sede_id, case when tg_op = 'UPDATE' then old.precio end, new.precio, auth.uid());
    perform auditar(new.sede_id, 'cambiar_precio', 'productos_sede', new.producto_id::text,
      case when tg_op = 'UPDATE' then jsonb_build_object('precio', old.precio) end, jsonb_build_object('precio', new.precio));
  end if;
  return new;
end $$;
create trigger productos_sede_historial after insert or update on productos_sede
  for each row execute function trg_precio_historial();

create or replace function cambiar_precio(p_producto uuid, p_sede uuid, p_precio numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir(es_admin(), 'Solo Administración puede cambiar precios');
  perform exigir(p_precio >= 0, 'Precio inválido');
  insert into productos_sede (producto_id, sede_id, precio) values (p_producto, p_sede, p_precio)
  on conflict (producto_id, sede_id) do update set precio = excluded.precio;
end $$;

create policy admin_edita on productos_sede for update to authenticated using (es_admin()) with check (es_admin());
create policy admin_revisa on reportes_stock for update to authenticated using (es_admin()) with check (es_admin());
grant update on productos_sede, reportes_stock to authenticated;

-- ───────── Merma con cantidad (para el análisis) ─────────
alter table movimientos_stock add column if not exists cantidad_ref numeric(14,3);

create or replace function cancelar_linea(p_linea uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare lp lineas_pedido; c cuentas; r reservas_stock; m record; v_com uuid;
begin
  select * into lp from lineas_pedido where id = p_linea for update;
  perform exigir(found, 'La línea no existe');
  select * into c from cuentas where id = lp.cuenta_id for update;
  perform exigir_rol(c.sede_id, array['mesero','caja']);
  perform exigir(c.estado = 'abierta', 'Solo se cancela en cuentas abiertas');
  if lp.estado = 'cancelada' then return; end if;

  for r in select * from reservas_stock where linea_pedido_id = p_linea and estado = 'activa' for update loop
    update saldos_stock set reservado = reservado - r.cantidad where ubicacion_id = r.ubicacion_id and insumo_id = r.insumo_id;
    update reservas_stock set estado = 'liberada' where id = r.id;
    perform evaluar_reglas(r.ubicacion_id, r.insumo_id);
  end loop;
  -- Ya usada: lo consumido se reclasifica como merma (no cambia la existencia física)
  for m in select ubicacion_id, insumo_id, sum(-cantidad) q from movimientos_stock
           where ref_tipo = 'linea_pedido' and ref_id = p_linea::text and tipo in ('venta','consumo')
           group by ubicacion_id, insumo_id loop
    insert into movimientos_stock (sede_id, insumo_id, ubicacion_id, cantidad, cantidad_ref, tipo, motivo, ref_tipo, ref_id, perfil_id)
    values (c.sede_id, m.insumo_id, m.ubicacion_id, 0, m.q, 'merma',
            format('Cancelada después de preparar (%s): %s', fmt_cant(m.q), coalesce(p_motivo,'')), 'linea_pedido', p_linea::text, auth.uid());
  end loop;

  update lineas_pedido set estado = 'cancelada' where id = p_linea;
  update lineas_comanda set cancelada = true where linea_pedido_id = p_linea returning comanda_id into v_com;
  if v_com is not null and not exists (select 1 from lineas_comanda where comanda_id = v_com and not cancelada) then
    update comandas set estado = 'cancelada' where id = v_com;
  end if;
  if v_com is not null then
    insert into historial_estados (entidad, entidad_id, estado_ant, estado_nuevo, perfil_id)
    values ('linea_comanda', p_linea, 'activa', 'cancelada', auth.uid());
  end if;
  update cuentas set total = total - lp.cantidad * lp.precio_unit where id = c.id;
  perform auditar(c.sede_id, 'cancelar_linea', 'lineas_pedido', p_linea::text, to_jsonb(lp), jsonb_build_object('motivo', p_motivo));
end $$;

-- ───────── Análisis: consumo por categoría e insumo ─────────
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
  where es_admin()
  order by i.categoria, i.nombre, s.nombre
$$;

-- Las de Administración se pueden llamar (cada una revisa es_admin); el disparador no.
grant execute on function admin_crear_usuario(text,text,text,jsonb), admin_cambiar_clave(uuid,text),
  admin_activar_usuario(uuid,boolean), analisis_consumo(uuid,int), cancelar_linea(uuid,text) to authenticated;
revoke execute on function trg_precio_historial() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function trg_precio_historial() from authenticated, anon;
  end if;
end $$;

-- Compras: Administración guarda historial de precios del proveedor y puede anular órdenes
create policy admin_escribe on proveedor_precios_historial for insert to authenticated with check (es_admin());
create policy admin_edita on ordenes_compra for update to authenticated using (es_admin()) with check (es_admin());
grant insert on proveedor_precios_historial to authenticated;
grant update on ordenes_compra to authenticated;
