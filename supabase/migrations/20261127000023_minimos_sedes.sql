-- Max Pizza · 023 · Mínimos de stock para varias sedes a la vez
-- "Aplicar a todas mis sedes / varias sedes": crea o actualiza la misma regla en cada sede.
-- Una sede marcada con "mínimo propio" (excepción) NO se pisa al aplicar a varias: lo hecho a mano manda.

alter table reglas_stock add column if not exists excepcion boolean not null default false;

create or replace function regla_aplicar(p_sedes uuid[], p_ubicacion text, p_insumo uuid, p_minimo numeric, p_rol text,
  p_prioridad text, p_texto text, p_accion text, p_excepcion boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sede uuid; v_ubic uuid; r reglas_stock; v_hechas int := 0; v_saltadas text[] := '{}';
begin
  perform exigir(coalesce(array_length(p_sedes, 1), 0) > 0, 'Elige al menos una sede');
  perform exigir(p_minimo >= 0, 'El mínimo no puede ser negativo');
  perform exigir(p_prioridad in ('alta','media','baja'), 'Prioridad inválida');
  perform exigir(length(trim(coalesce(p_texto,''))) >= 3, 'Escribe el mensaje de la tarea');
  foreach v_sede in array p_sedes loop
    perform exigir(es_admin_de(v_sede), 'Solo puedes cambiar los mínimos de tus sedes');
    select id into v_ubic from ubicaciones_stock where sede_id = v_sede and codigo = p_ubicacion;
    perform exigir(v_ubic is not null, 'Una de las sedes no tiene esa ubicación de inventario');
    select * into r from reglas_stock where ubicacion_id = v_ubic and insumo_id = p_insumo and rol_destino = p_rol;
    if r.id is not null and r.excepcion and array_length(p_sedes, 1) > 1 then
      v_saltadas := v_saltadas || (select nombre from sedes where id = v_sede);   -- excepción: se respeta
      continue;
    end if;
    if r.id is null then
      insert into reglas_stock (sede_id, ubicacion_id, insumo_id, minimo, rol_destino, prioridad, texto, accion, excepcion)
      values (v_sede, v_ubic, p_insumo, p_minimo, p_rol, p_prioridad, trim(p_texto), p_accion, p_excepcion and array_length(p_sedes, 1) = 1);
    else
      update reglas_stock set minimo = p_minimo, prioridad = p_prioridad, texto = trim(p_texto), accion = p_accion,
        excepcion = case when array_length(p_sedes, 1) = 1 then p_excepcion else excepcion end
      where id = r.id;   -- el trigger reevalúa el saldo al instante
    end if;
    v_hechas := v_hechas + 1;
  end loop;
  return jsonb_build_object('hechas', v_hechas, 'saltadas', to_jsonb(v_saltadas));
end $$;

grant execute on function regla_aplicar(uuid[], text, uuid, numeric, text, text, text, text, boolean) to authenticated;
