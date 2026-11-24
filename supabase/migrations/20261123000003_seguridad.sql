-- Max Pizza · 003 · Permisos en el servidor (RLS) y tiempo real
-- Regla general: el personal LEE lo de sus sedes; los cambios van por las funciones de 002.
-- Administración además edita directamente la configuración (catálogo, reglas, sedes, equipo).

do $$
declare t text;
begin
  foreach t in array array[
    'sedes','roles','permisos','perfiles','accesos_sede','turnos','estaciones','mesas','unidades','categorias','insumos',
    'productos','productos_sede','precios_historial','recetas','receta_detalles','receta_armado','ubicaciones_stock',
    'saldos_stock','movimientos_stock','cuentas','pedidos','lineas_pedido','reservas_stock','comandas','lineas_comanda',
    'historial_estados','turnos_caja','pagos','gastos_caja','movimientos_caja','lotes_produccion','detalle_lote',
    'categorias_tareas','plantillas_checklist','reglas_stock','alertas_stock','tareas','historial_tareas','notificaciones',
    'reportes_stock','proveedores','proveedor_insumos','proveedor_precios_historial','ordenes_compra','lineas_compra',
    'recepciones','lineas_recepcion','historial_auditoria','operaciones']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── Lectura del catálogo general (cualquier persona con sesión) ──
create policy leer on roles for select to authenticated using (true);
create policy leer on permisos for select to authenticated using (true);
create policy leer on unidades for select to authenticated using (true);
create policy leer on categorias for select to authenticated using (true);
create policy leer on insumos for select to authenticated using (true);
create policy leer on productos for select to authenticated using (true);
create policy leer on recetas for select to authenticated using (true);
create policy leer on receta_detalles for select to authenticated using (true);
create policy leer on receta_armado for select to authenticated using (true);
create policy leer on categorias_tareas for select to authenticated using (true);
create policy leer on perfiles for select to authenticated using (true);

-- ── Lectura por sede ──
create policy leer on sedes for select to authenticated using (puede_ver_sede(id));
create policy leer on accesos_sede for select to authenticated using (perfil_id = auth.uid() or es_admin());
create policy leer on turnos for select to authenticated using (perfil_id = auth.uid() or es_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'estaciones','mesas','productos_sede','ubicaciones_stock','saldos_stock','movimientos_stock','cuentas','pedidos',
    'comandas','turnos_caja','pagos','gastos_caja','lotes_produccion','alertas_stock','tareas','reportes_stock',
    'reglas_stock']
  loop
    execute format('create policy leer on %I for select to authenticated using (puede_ver_sede(sede_id))', t);
  end loop;
end $$;

create policy leer on plantillas_checklist for select to authenticated using (sede_id is null or puede_ver_sede(sede_id));
create policy leer on lineas_pedido for select to authenticated
  using (exists (select 1 from cuentas c where c.id = cuenta_id and puede_ver_sede(c.sede_id)));
create policy leer on reservas_stock for select to authenticated
  using (exists (select 1 from ubicaciones_stock u where u.id = ubicacion_id and puede_ver_sede(u.sede_id)));
create policy leer on lineas_comanda for select to authenticated
  using (exists (select 1 from comandas c where c.id = comanda_id and puede_ver_sede(c.sede_id)));
create policy leer on historial_estados for select to authenticated using (true);
create policy leer on historial_tareas for select to authenticated
  using (exists (select 1 from tareas t where t.id = tarea_id and puede_ver_sede(t.sede_id)));
create policy leer on detalle_lote for select to authenticated
  using (exists (select 1 from lotes_produccion l where l.id = lote_id and puede_ver_sede(l.sede_id)));
create policy leer on movimientos_caja for select to authenticated
  using (exists (select 1 from turnos_caja t where t.id = turno_caja_id and tiene_rol(t.sede_id, array['caja'])));

-- Notificaciones: las de mi rol en mi sede, las mías, o todas si soy admin
create policy leer on notificaciones for select to authenticated using (
  es_admin() or perfil_id = auth.uid() or (
    perfil_id is null and exists (select 1 from accesos_sede a where a.perfil_id = auth.uid() and a.sede_id = notificaciones.sede_id and a.rol = notificaciones.rol)));
create policy marcar_leida on notificaciones for update to authenticated using (
  es_admin() or perfil_id = auth.uid() or exists (select 1 from accesos_sede a where a.perfil_id = auth.uid() and a.sede_id = notificaciones.sede_id and a.rol = notificaciones.rol))
  with check (true);

-- ── Solo Administración ──
create policy leer on precios_historial for select to authenticated using (es_admin());
create policy leer on proveedores for select to authenticated using (es_admin());
create policy leer on proveedor_insumos for select to authenticated using (es_admin());
create policy leer on proveedor_precios_historial for select to authenticated using (es_admin());
create policy leer on ordenes_compra for select to authenticated using (es_admin());
create policy leer on lineas_compra for select to authenticated using (es_admin());
create policy leer on recepciones for select to authenticated using (es_admin());
create policy leer on lineas_recepcion for select to authenticated using (es_admin());
create policy leer on historial_auditoria for select to authenticated using (es_admin());

do $$
declare t text;
begin
  -- Configuración que Administración edita directamente (todo queda en las tablas con su historial)
  foreach t in array array[
    'sedes','mesas','estaciones','ubicaciones_stock','categorias','insumos','productos','receta_armado','reglas_stock',
    'plantillas_checklist','categorias_tareas','proveedores','proveedor_insumos','accesos_sede','unidades']
  loop
    execute format('create policy admin_escribe on %I for all to authenticated using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;
create policy admin_edita on perfiles for update to authenticated using (es_admin()) with check (es_admin());
-- Precios: Administración agrega el precio de un producto nuevo; los cambios van por cambiar_precio() (deja historial)
create policy admin_agrega on productos_sede for insert to authenticated with check (es_admin());

-- ── Funciones internas: no se pueden llamar desde la app ──
do $$
declare f text;
begin
  foreach f in array array[
    'op_iniciar(uuid,text)','op_terminar(uuid,jsonb)','notificar(uuid,text,uuid,text,text,text,uuid)',
    'evaluar_regla(uuid)','evaluar_reglas(uuid,uuid)','stock_fila(uuid,uuid)',
    'stock_mover(uuid,uuid,numeric,text,text,text,text,uuid,boolean)','exigir_disponible(uuid,uuid,numeric)',
    'crear_envio(uuid,uuid,jsonb)','consumir_linea(uuid)','completar_tareas_accion(uuid,text)',
    'generar_tareas_plantilla(uuid,text)','auditar(uuid,text,text,text,jsonb,jsonb)','siguiente_numero_pedido(uuid)',
    'trg_regla_cambio()','trg_nuevo_usuario()','exigir_rol(uuid,text[])']
  loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated, anon', f);
    end if;
  end loop;
end $$;

-- Tiempo real (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      cuentas, pedidos, lineas_pedido, comandas, lineas_comanda, pagos, turnos, tareas, alertas_stock,
      saldos_stock, notificaciones, turnos_caja, gastos_caja, reportes_stock;
  end if;
end $$;
