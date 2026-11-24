-- Max Pizza · 006 · Cierre de tareas de reposición
-- 1) Cuando el área repone el stock (traslado, rueda, tortas...), su tarea queda lista aunque estuviera en proceso.
-- 2) Si alguien marca lista una reposición y el stock sigue bajo, nace una sola reposición pendiente nueva.

create or replace function evaluar_regla(p_regla uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r reglas_stock;
  v_saldo numeric;
  v_unidad text;
  v_insumo text;
  a alertas_stock;
  t tareas;
  v_detalle text;
begin
  select * into r from reglas_stock where id = p_regla;
  if not found then return; end if;

  select coalesce(s.fisico - s.reservado, 0) into v_saldo
    from saldos_stock s where s.ubicacion_id = r.ubicacion_id and s.insumo_id = r.insumo_id;
  v_saldo := coalesce(v_saldo, 0);
  select i.unidad, i.nombre into v_unidad, v_insumo from insumos i where i.id = r.insumo_id;
  v_detalle := format('Quedan %s %s · mínimo %s', fmt_cant(v_saldo), v_unidad, fmt_cant(r.minimo));

  select * into a from alertas_stock where regla_id = r.id and estado = 'activa' for update;
  select * into t from tareas where regla_id = r.id and estado in ('pendiente','en_proceso') for update;

  if r.activa and v_saldo <= r.minimo then
    -- Alerta: una sola activa; si el saldo sigue bajando se actualiza la misma
    if a.id is null then
      insert into alertas_stock (regla_id, sede_id, saldo) values (r.id, r.sede_id, v_saldo) returning * into a;
      perform notificar(r.sede_id, 'admin', null, 'stock_bajo', 'Stock bajo · ' || v_insumo, v_detalle, a.id);
      perform notificar(r.sede_id, r.rol_destino, r.responsable_id, 'tarea', r.texto, v_detalle, a.id);
    else
      update alertas_stock set saldo = v_saldo, actualizada = now() where id = a.id;
    end if;
    -- Tarea: un solo pendiente de reposición por regla
    if t.id is null then
      insert into tareas (sede_id, rol, asignada_a, titulo, detalle, prioridad, origen, accion, regla_id, alerta_id)
      values (r.sede_id, r.rol_destino, r.responsable_id, r.texto, v_detalle, r.prioridad, 'automatica', r.accion, r.id, a.id)
      returning * into t;
      insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'creada', v_detalle, auth.uid());
    else
      update tareas set detalle = v_detalle, alerta_id = a.id, prioridad = r.prioridad, titulo = r.texto,
        rol = case when estado = 'pendiente' then r.rol_destino else rol end,
        asignada_a = case when estado = 'pendiente' then r.responsable_id else asignada_a end
      where id = t.id;
    end if;
  else
    -- Repuesto (o regla pausada): se cierra la alerta
    if a.id is not null then
      update alertas_stock set estado = 'cerrada', saldo = v_saldo, cerrada_en = now(), actualizada = now() where id = a.id;
    end if;
    -- Si quien repuso es del área, la tarea (pendiente o en proceso) queda lista a su nombre.
    -- Si repuso alguien de otra área: la pendiente se archiva y la que está en proceso no se toca.
    if t.id is not null then
      if auth.uid() is not null and exists (
           select 1 from accesos_sede x where x.perfil_id = auth.uid() and x.sede_id = r.sede_id and x.rol = t.rol) then
        update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(), detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'lista', 'Stock repuesto', auth.uid());
      elsif t.estado = 'pendiente' then
        update tareas set estado = 'archivada', detalle = v_detalle where id = t.id;
        insert into historial_tareas (tarea_id, evento, detalle, perfil_id) values (t.id, 'archivada', 'Stock repuesto', auth.uid());
      end if;
    end if;
  end if;
end $$;


create or replace function tarea_completar(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  perform exigir(found, 'La tarea no existe');
  perform exigir_rol(t.sede_id, array[t.rol]);
  if t.estado in ('lista','archivada') then return; end if;
  update tareas set estado = 'lista', terminada_por = auth.uid(), terminada_en = now(),
    tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now())
  where id = p_tarea;
  insert into historial_tareas (tarea_id, evento, perfil_id) values (p_tarea, 'lista', auth.uid());
  -- Si era una reposición automática y el stock sigue bajo, queda una sola reposición pendiente nueva
  if t.regla_id is not null then perform evaluar_regla(t.regla_id); end if;
end $$;
