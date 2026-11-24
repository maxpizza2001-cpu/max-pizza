-- Max Pizza · 005 · Permisos de la API para usuarios con sesión
-- Los proyectos nuevos de Supabase no exponen las tablas solas: hay que darlas explícitamente.
-- Igual manda RLS (003): esto solo abre la puerta; las políticas deciden qué filas ve y cambia cada quien.

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Configuración que Administración edita directo (RLS solo deja a Administración)
grant insert, update, delete on
  sedes, mesas, estaciones, ubicaciones_stock, categorias, insumos, productos, receta_armado, reglas_stock,
  plantillas_checklist, categorias_tareas, proveedores, proveedor_insumos, accesos_sede, unidades
to authenticated;
grant update on perfiles, notificaciones to authenticated;
grant insert on productos_sede to authenticated;

-- Funciones: todas las de negocio se pueden llamar; las internas quedan bloqueadas otra vez
grant execute on all functions in schema public to authenticated;
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
    execute format('revoke execute on function %s from public, authenticated, anon', f);
  end loop;
end $$;

-- Lo que se cree después también queda disponible
alter default privileges in schema public grant select on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
