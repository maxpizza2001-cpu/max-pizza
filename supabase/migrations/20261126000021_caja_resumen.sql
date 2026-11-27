-- Max Pizza · 021 · Caja: resumen financiero del turno y cierre con conteo de efectivo
-- Efectivo esperado = base + cobros en efectivo − gastos en efectivo + entradas − salidas de efectivo.
-- Nequi y los demás medios NO se suman al efectivo físico.

alter table turnos_caja add column if not exists efectivo_contado numeric(14,2);
alter table turnos_caja add column if not exists diferencia numeric(14,2);
alter table turnos_caja add column if not exists observacion text;
alter table turnos_caja add column if not exists cerrado_por uuid references perfiles(id);

-- Entradas y salidas de efectivo que no son venta ni gasto (ej: el dueño saca plata, se mete más cambio)
alter table movimientos_caja drop constraint if exists movimientos_caja_tipo_check;
alter table movimientos_caja add constraint movimientos_caja_tipo_check check (tipo in ('base','pago','gasto','entrada','salida'));
alter table movimientos_caja add column if not exists concepto text;
alter table movimientos_caja add column if not exists perfil_id uuid references perfiles(id);

create or replace function caja_movimiento(p_op uuid, p_sede uuid, p_tipo text, p_monto numeric, p_concepto text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_turno uuid;
begin
  perform exigir_rol(p_sede, array['caja']);
  perform exigir(p_tipo in ('entrada','salida'), 'Tipo inválido');
  perform exigir(p_monto > 0, 'Escribe el valor');
  perform exigir(length(trim(coalesce(p_concepto,''))) >= 3, 'Escribe el motivo');
  v_prev := op_iniciar(p_op, 'caja_movimiento');
  if v_prev is not null then return; end if;
  select id into v_turno from turnos_caja where sede_id = p_sede and cerrado_en is null;
  perform exigir(v_turno is not null, 'Primero registra la base del turno');
  insert into movimientos_caja (turno_caja_id, tipo, medio, monto, concepto, perfil_id)
  values (v_turno, p_tipo, 'efectivo', case when p_tipo = 'entrada' then p_monto else -p_monto end, trim(p_concepto), auth.uid());
  perform op_terminar(p_op, '{}'::jsonb);
end $$;

create or replace view v_caja_turnos with (security_invoker = true) as
select t.id, t.sede_id, t.perfil_id, t.base, t.abierto_en, t.cerrado_en,
  coalesce(sum(mc.monto) filter (where mc.tipo = 'pago'), 0) as cobrado,
  coalesce(sum(-mc.monto) filter (where mc.tipo = 'gasto'), 0) as gastos,
  t.base + coalesce(sum(mc.monto) filter (where mc.medio = 'efectivo' and mc.tipo <> 'base'), 0) as efectivo_esperado,
  t.efectivo_contado, t.diferencia, t.observacion
from turnos_caja t left join movimientos_caja mc on mc.turno_caja_id = t.id
group by t.id;

-- Resumen completo de un turno (el abierto si p_turno es null)
create or replace function caja_resumen(p_sede uuid, p_turno uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t turnos_caja; v_fin timestamptz; r jsonb;
begin
  perform exigir_rol(p_sede, array['caja']);
  if p_turno is null then select * into t from turnos_caja where sede_id = p_sede and cerrado_en is null;
  else select * into t from turnos_caja where id = p_turno and sede_id = p_sede; end if;
  if t.id is null then return null; end if;
  v_fin := coalesce(t.cerrado_en, now());

  with mov as (select * from movimientos_caja where turno_caja_id = t.id),
  ventas as (   -- lo que se pidió en este turno (por la hora de envío del pedido)
    select lp.estado, lp.cantidad * lp.precio_unit as valor
    from lineas_pedido lp join pedidos pe on pe.id = lp.pedido_id
    where pe.sede_id = p_sede and pe.enviado_en >= t.abierto_en and pe.enviado_en < v_fin)
  select jsonb_build_object(
    'turno_id', t.id, 'abierto_en', t.abierto_en, 'cerrado_en', t.cerrado_en, 'base', t.base,
    'efectivo', jsonb_build_object(
      'ventas',   coalesce((select sum(monto) from mov where tipo = 'pago' and medio = 'efectivo'), 0),
      'gastos',   coalesce((select sum(-monto) from mov where tipo = 'gasto' and medio = 'efectivo'), 0),
      'entradas', coalesce((select sum(monto) from mov where tipo = 'entrada'), 0),
      'salidas',  coalesce((select sum(-monto) from mov where tipo = 'salida'), 0),
      'esperado', t.base + coalesce((select sum(monto) from mov where medio = 'efectivo' and tipo <> 'base'), 0),
      'contado', t.efectivo_contado, 'diferencia', t.diferencia, 'observacion', t.observacion),
    'medios', coalesce((select jsonb_agg(jsonb_build_object('medio', medio, 'total', total, 'pagos', n) order by total desc)
      from (select medio, sum(monto) total, count(*) n from mov where tipo = 'pago' group by medio) m), '[]'),
    'nequi', coalesce((select jsonb_agg(jsonb_build_object('hora', p.creado_en, 'monto', p.monto,
        'detalle', case when c.tipo = 'mesa' then 'Mesa ' || lpad(me.numero::text, 2, '0') else initcap(c.tipo) end) order by p.creado_en)
      from pagos p join cuentas c on c.id = p.cuenta_id left join mesas me on me.id = c.mesa_id
      where p.turno_caja_id = t.id and p.medio = 'nequi'), '[]'),
    'gastos_otros', coalesce((select sum(-monto) from mov where tipo = 'gasto' and medio <> 'efectivo'), 0),
    'vendido',    coalesce((select sum(valor) from ventas where estado = 'activa'), 0),
    'cancelado',  coalesce((select sum(valor) from ventas where estado = 'cancelada'), 0),
    'cobrado',    coalesce((select sum(monto) from mov where tipo = 'pago'), 0),
    'pendiente',  coalesce((select sum(saldo) from v_por_cobrar where sede_id = p_sede), 0),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', abs(monto), 'concepto', concepto, 'hora', creado_en) order by creado_en)
      from mov where tipo in ('entrada','salida')), '[]')
  ) into r;
  return r;
end $$;

-- Cerrar caja contando el efectivo: se guarda lo esperado vs. lo contado y la diferencia
drop function if exists cerrar_caja(uuid);
create or replace function cerrar_caja(p_sede uuid, p_contado numeric default null, p_observacion text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t turnos_caja; v_esp numeric; v_dif numeric;
begin
  perform exigir_rol(p_sede, array['caja']);
  select * into t from turnos_caja where sede_id = p_sede and cerrado_en is null for update;
  perform exigir(t.id is not null, 'No hay un turno de caja abierto');
  perform exigir(p_contado is not null and p_contado >= 0, 'Escribe cuánto efectivo contaste');
  select efectivo_esperado into v_esp from v_caja_turnos where id = t.id;
  v_dif := p_contado - v_esp;
  perform exigir(v_dif = 0 or length(trim(coalesce(p_observacion,''))) >= 3, 'Hay diferencia: escribe una observación');
  update turnos_caja set cerrado_en = now(), cerrado_por = auth.uid(), efectivo_contado = p_contado,
    diferencia = v_dif, observacion = nullif(trim(coalesce(p_observacion,'')), '') where id = t.id;
  perform auditar(p_sede, 'cerrar_caja', 'turnos_caja', t.id::text, null,
    jsonb_build_object('esperado', v_esp, 'contado', p_contado, 'diferencia', v_dif));
  return jsonb_build_object('esperado', v_esp, 'contado', p_contado, 'diferencia', v_dif);
end $$;

grant execute on function caja_movimiento, caja_resumen, cerrar_caja(uuid, numeric, text) to authenticated;
