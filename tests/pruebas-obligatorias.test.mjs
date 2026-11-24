// Las 10 pruebas obligatorias del documento (sección 6) + flujos clave, contra la base real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaBase, op } from './base.mjs';

async function preparar() {
  const b = await nuevaBase();
  const S = b.principal;
  const u = {
    admin:   await b.usuario('Admin',   [[S, 'admin']]),
    caja:    await b.usuario('Caja',    [[S, 'caja']]),
    mesero:  await b.usuario('Mesero',  [[S, 'mesero']]),
    rapidas: await b.usuario('Rapidas', [[S, 'rapidas']]),
    armado:  await b.usuario('Armado',  [[S, 'armado']]),
    tortas:  await b.usuario('Tortas',  [[S, 'tortas']]),
    insumos: await b.usuario('Insumos', [[S, 'insumos']]),
  };
  return { b, S, u };
}

const linea = (producto_id, cantidad, observacion) => ({ producto_id, cantidad, observacion });

test('1 · Por cobrar muestra solo la mesa con pedido enviado y saldo', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.mesero);
  await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 1, p_lineas: JSON.stringify([linea(haw, 1)]) });
  const r4 = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 4, p_lineas: JSON.stringify([linea(haw, 2)]) });
  // mesa 7: sin pedido (no se toca)
  await b.como(u.caja);
  await b.rpc('confirmar_cobro', { p_op: op(), p_cuenta: r4.cuenta_id, p_monto: 14000, p_medio: 'efectivo' });

  const porCobrar = await b.q(`select mesa from v_por_cobrar where sede_id = $1`, [S]);
  assert.deepEqual(porCobrar.map((r) => r.mesa), [1]);
  const cuenta = await b.uno(`select total::float, pagado::float from v_por_cobrar where sede_id = $1 and mesa = 1`, [S]);
  assert.equal(cuenta.total, 7000);
});

test('2 · Mesa 02: pizzas a Caja, hamburguesa a la tablet, el agregado llega una vez, una sola cuenta', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  const ham = await b.producto('Hamburguesa');
  await b.como(u.mesero);
  const opA = op();
  const e1 = await b.rpc('enviar_pedido_mesa', { p_op: opA, p_sede: S, p_mesa: 2,
    p_lineas: JSON.stringify([linea(haw, 2), linea(ham, 1, 'Sin cebolla')]) });
  // Reintento del mismo envío (doble toque / mala señal): no duplica
  const e1b = await b.rpc('enviar_pedido_mesa', { p_op: opA, p_sede: S, p_mesa: 2,
    p_lineas: JSON.stringify([linea(haw, 2), linea(ham, 1, 'Sin cebolla')]) });
  assert.equal(e1b.pedido_id, e1.pedido_id);
  const e2 = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 2, p_lineas: JSON.stringify([linea(haw, 1)]) });
  assert.equal(e2.cuenta_id, e1.cuenta_id, 'el agregado va a la misma cuenta');

  const comandas = await b.q(`
    select e.codigo estacion, pe.numero, sum(lp.cantidad)::float cant, string_agg(pr.nombre || coalesce(' (' || lp.observacion || ')',''), ', ') prods
    from comandas c join estaciones e on e.id = c.estacion_id join pedidos pe on pe.id = c.pedido_id
    join lineas_comanda lc on lc.comanda_id = c.id join lineas_pedido lp on lp.id = lc.linea_pedido_id join productos pr on pr.id = lp.producto_id
    where c.sede_id = $1 group by e.codigo, pe.numero order by pe.numero, e.codigo`, [S]);
  assert.deepEqual(comandas, [
    { estacion: 'horno', numero: 1, cant: 2, prods: 'Porción Hawaiana' },
    { estacion: 'rapidas', numero: 1, cant: 1, prods: 'Hamburguesa (Sin cebolla)' },
    { estacion: 'horno', numero: 2, cant: 1, prods: 'Porción Hawaiana' },
  ]);
  assert.equal((await b.saldo(S, 'armado', 'porc_hawaiana')).reservado, 3);

  // Preparación: el horno empieza → se descuenta la porción física; la tablet marca lista → consume receta de la nevera
  const [cHorno] = await b.q(`select c.id from comandas c join estaciones e on e.id=c.estacion_id where e.codigo='horno' and c.pedido_id=$1`, [e1.pedido_id]);
  const [cRap] = await b.q(`select c.id from comandas c join estaciones e on e.id=c.estacion_id where e.codigo='rapidas' and c.pedido_id=$1`, [e1.pedido_id]);
  await b.como(u.caja);
  await b.rpc('comanda_estado', { p_comanda: cHorno.id, p_estado: 'en_preparacion' });
  await b.rpc('comanda_estado', { p_comanda: cHorno.id, p_estado: 'lista' });
  await b.como(u.rapidas);
  await b.rpc('comanda_estado', { p_comanda: cRap.id, p_estado: 'en_preparacion' });
  await b.rpc('comanda_estado', { p_comanda: cRap.id, p_estado: 'lista' });
  await b.rpc('comanda_estado', { p_comanda: cRap.id, p_estado: 'lista' }); // doble toque
  const porc = await b.saldo(S, 'armado', 'porc_hawaiana');
  assert.deepEqual([porc.fisico, porc.reservado], [14, 1]);
  assert.equal((await b.saldo(S, 'nevera_rapidas', 'carne_hamburguesa')).fisico, 14, 'consumo de receta una sola vez');
  const avisos = await b.q(`select titulo from notificaciones where rol = 'mesero' and tipo = 'listo' order by creada_en`);
  assert.equal(avisos.length, 2);
  assert.match(avisos[0].titulo, /Mesa 02/);

  // Se cobra una sola cuenta al final (y el cobro no vuelve a descontar porciones)
  await b.como(u.caja);
  const pago = await b.rpc('confirmar_cobro', { p_op: op(), p_cuenta: e1.cuenta_id, p_monto: 39000, p_medio: 'nequi' });
  assert.equal(Number(pago.saldo), 0);
  assert.equal((await b.saldo(S, 'armado', 'porc_hawaiana')).fisico, 14);
  assert.equal((await b.q(`select 1 from v_por_cobrar where sede_id = $1`, [S])).length, 0);
  await b.como(u.mesero);
  await b.rpc('liberar_mesa', { p_cuenta: e1.cuenta_id });
  assert.equal((await b.uno(`select estado from cuentas where id = $1`, [e1.cuenta_id])).estado, 'cerrada');
});

test('3 · Mostrador vende 4 Hawaianas y Caja confirma dos veces: un pago, una comanda, una reducción', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.caja);
  const o = op();
  const args = { p_op: o, p_sede: S, p_tipo: 'mostrador', p_lineas: JSON.stringify([linea(haw, 4)]), p_medio: 'efectivo' };
  const r1 = await b.rpc('cobrar_mostrador', args);
  const r2 = await b.rpc('cobrar_mostrador', args);
  assert.equal(r2.pago_id, r1.pago_id);
  assert.equal(r2.repetida, true);
  assert.equal((await b.uno(`select count(*)::int n from pagos`)).n, 1);
  assert.equal((await b.uno(`select count(*)::int n from comandas`)).n, 1);
  assert.equal((await b.uno(`select sum(lp.cantidad)::float n from lineas_comanda lc join lineas_pedido lp on lp.id = lc.linea_pedido_id`)).n, 4);
  const s = await b.saldo(S, 'armado', 'porc_hawaiana');
  assert.equal(s.disponible, 12, '16 − 4 una sola vez');
  assert.equal((await b.uno(`select total::float from cuentas`)).total, 28000);
  // Consulta de estado incierto: el cobro quedó registrado
  assert.ok(await b.rpc('consultar_operacion', { p_op: o }));
});

test('4 · Cocina retira carne, Producción queda en 7: tarea automática y Administración la ve', async () => {
  const { b, S, u } = await preparar();
  const carne = await b.insumo('carne_hamburguesa');
  await b.como(u.rapidas);
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: carne, cantidad: 5 }]) });
  assert.equal((await b.saldo(S, 'produccion', 'carne_hamburguesa')).fisico, 7);
  assert.equal((await b.saldo(S, 'nevera_rapidas', 'carne_hamburguesa')).fisico, 20, 'resta y suma en la misma operación');

  const tareas = await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa');
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0].origen, 'automatica');
  assert.match(tareas[0].detalle, /Quedan 7 porcion/);
  const aviso = await b.q(`select * from notificaciones where rol = 'admin' and tipo = 'stock_bajo'`);
  assert.equal(aviso.length, 1);

  // Sigue bajando 7 → 6 → 4: el mismo aviso y la misma tarea
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: carne, cantidad: 1 }]) });
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: carne, cantidad: 2 }]) });
  assert.equal((await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa')).length, 1);
  assert.equal((await b.uno(`select count(*)::int n from alertas_stock where estado='activa'`)).n, 1);
  assert.match((await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa'))[0].detalle, /Quedan 4/);

  // Producción guarda un lote de 20: sube el stock, la tarea queda lista y la alerta se cierra
  await b.como(u.insumos);
  await b.rpc('tarea_empezar', { p_tarea: tareas[0].id });
  await b.rpc('registrar_produccion', { p_op: op(), p_sede: S, p_insumo: carne, p_cantidad: 20 });
  assert.equal((await b.saldo(S, 'produccion', 'carne_hamburguesa')).fisico, 24);
  const t = await b.uno(`select estado, tomada_por, terminada_por from tareas where id = $1`, [tareas[0].id]);
  assert.deepEqual([t.estado, t.tomada_por, t.terminada_por], ['lista', u.insumos, u.insumos]);
  assert.equal((await b.uno(`select count(*)::int n from alertas_stock where estado='activa'`)).n, 0);
});

test('4b · Lote que no alcanza: el trabajo queda hecho y queda UNA reposición pendiente', async () => {
  const { b, S, u } = await preparar();
  const carne = await b.insumo('carne_res');           // mínimo 50 en Producción, hay 100
  await b.como(u.rapidas);
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: carne, cantidad: 80 }]) });  // quedan 20
  await b.como(u.insumos);
  await b.rpc('registrar_produccion', { p_op: op(), p_sede: S, p_insumo: carne, p_cantidad: 10 }); // 30, sigue bajo
  const todas = await b.q(`select estado from tareas where titulo = 'Preparar carne de res' order by creada_en`);
  assert.deepEqual(todas.map((t) => t.estado), ['lista', 'pendiente']);
});

test('5 · Administración cambia el mínimo de 7 a 10 cuando quedan 8: se crea alerta y tarea', async () => {
  const { b, S, u } = await preparar();
  const carne = await b.insumo('carne_hamburguesa');
  await b.como(u.rapidas);
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: carne, cantidad: 4 }]) });   // quedan 8
  assert.equal((await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa')).length, 0);
  await b.como(u.admin);
  await b.q(`update reglas_stock set minimo = 10 where sede_id = $1 and insumo_id = $2 and rol_destino = 'insumos'`, [S, carne]);
  const t = await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa');
  assert.equal(t.length, 1);
  assert.match(t[0].detalle, /Quedan 8 porcion.*mínimo 10/);
  // Pausar la regla cierra la alerta y retira el pendiente
  await b.q(`update reglas_stock set activa = false where sede_id = $1 and insumo_id = $2 and rol_destino = 'insumos'`, [S, carne]);
  assert.equal((await b.tareasAbiertas(S, 'insumos', 'Preparar carne de hamburguesa')).length, 0);
});

test('6 · 2 de 4 listas · 50 % y llega una automática → 2 de 5 · 40 %', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.insumos);
  await b.rpc('iniciar_turno', { p_sede: S, p_rol: 'insumos' });           // 2 tareas de plantilla
  await b.como(u.admin);
  await b.rpc('tarea_crear', { p_sede: S, p_rol: 'insumos', p_titulo: 'Lavar ollas' });
  await b.rpc('tarea_crear', { p_sede: S, p_rol: 'insumos', p_titulo: 'Etiquetar salsas', p_prioridad: 'alta' });
  await b.como(u.insumos);
  const ts = await b.q(`select id from tareas where sede_id = $1 and rol = 'insumos' order by creada_en limit 2`, [S]);
  for (const t of ts) await b.rpc('tarea_completar', { p_tarea: t.id });
  const prog = async () => b.uno(`select * from progreso_tareas($1, 'insumos', $2)`, [S, u.insumos]);
  assert.deepEqual(await prog(), { listas: 2, total: 4, porcentaje: 50 });

  await b.como(u.rapidas);
  await b.rpc('trasladar', { p_op: op(), p_sede: S, p_origen: 'produccion', p_destino: 'nevera_rapidas',
    p_items: JSON.stringify([{ insumo_id: await b.insumo('carne_hamburguesa'), cantidad: 5 }]) });
  assert.deepEqual(await prog(), { listas: 2, total: 5, porcentaje: 40 });
  // Administración ve lo mismo (vista del área)
  assert.deepEqual(await b.uno(`select * from progreso_tareas($1, 'insumos')`, [S]), { listas: 2, total: 5, porcentaje: 40 });
});

test('7 · Armado registra media rueda y dos personales: saldos distintos y bases reales', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.armado);
  await b.rpc('registrar_armado', { p_op: op(), p_sede: S, p_tipo: 'rueda', p_resultado: await b.insumo('porc_hawaiana'), p_cantidad: 4, p_tortas: 0.5 });
  await b.rpc('registrar_armado', { p_op: op(), p_sede: S, p_tipo: 'personales', p_resultado: await b.insumo('pers_hawaiana'), p_cantidad: 2, p_tortas: 2 });
  assert.equal((await b.saldo(S, 'armado', 'porc_hawaiana')).fisico, 20);
  assert.equal((await b.saldo(S, 'armado', 'pers_hawaiana')).fisico, 6);
  assert.equal((await b.saldo(S, 'tortas', 'torta_grande')).fisico, 19.5);
  assert.equal((await b.saldo(S, 'tortas', 'torta_pequena')).fisico, 13);
  assert.equal((await b.saldo(S, 'armado', 'salsa_ajo')).fisico, 2000 - 4 * 10 - 2 * 30);
});

test('7b · Tortas grandes: 20 hechas, Armado usa 15, alerta desde 8 y actualiza hasta 5', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.admin);
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'tortas', p_insumo: await b.insumo('torta_grande'), p_nuevo: 0, p_motivo: 'Prueba desde cero' });
  await b.como(u.tortas);
  await b.rpc('registrar_tortas', { p_op: op(), p_sede: S, p_monjes_recibidos: 10, p_monjes_usados: 10, p_grandes: 20, p_pequenas: 0 });
  await b.como(u.armado);
  const haw = await b.insumo('porc_hawaiana');
  for (let i = 0; i < 12; i++) await b.rpc('registrar_armado', { p_op: op(), p_sede: S, p_tipo: 'rueda', p_resultado: haw, p_cantidad: 8, p_tortas: 1 });
  let t = await b.tareasAbiertas(S, 'tortas', 'Reponer tortas grandes');
  assert.equal(t.length, 1);
  assert.match(t[0].detalle, /Quedan 8 /);
  for (let i = 0; i < 3; i++) await b.rpc('registrar_armado', { p_op: op(), p_sede: S, p_tipo: 'rueda', p_resultado: haw, p_cantidad: 8, p_tortas: 1 });
  t = await b.tareasAbiertas(S, 'tortas', 'Reponer tortas grandes');
  assert.equal(t.length, 1);
  assert.match(t[0].detalle, /Quedan 5 /);
});

test('8 · Se piden 2 L de citronela y llega 1 L: entra 1 L y queda 1 L pendiente', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.admin);
  const citro = await b.insumo('citronela');
  const antes = (await b.saldo(S, 'servicio', 'citronela')).fisico;
  const orden = await b.rpc('crear_orden_compra', { p_sede: S, p_proveedor: null,
    p_lineas: JSON.stringify([{ insumo_id: citro, cantidad: 2000, ubicacion: 'servicio' }]) });
  await b.rpc('marcar_orden_pedida', { p_orden: orden });
  const lc = await b.uno(`select id from lineas_compra where orden_id = $1`, [orden]);
  await b.rpc('recibir_compra', { p_op: op(), p_orden: orden, p_lineas: JSON.stringify([{ linea_compra_id: lc.id, cantidad: 1000 }]) });
  assert.equal((await b.saldo(S, 'servicio', 'citronela')).fisico, antes + 1000);
  const l = await b.uno(`select (cantidad - recibido)::float pendiente from lineas_compra where id = $1`, [lc.id]);
  assert.equal(l.pendiente, 1000);
  assert.equal((await b.uno(`select estado from ordenes_compra where id = $1`, [orden])).estado, 'parcial');
});

test('9 · Administración crea una tercera sede con mesas, estaciones, saldos y reglas propios', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.admin);
  const norte = await b.rpc('crear_sede', { p_nombre: 'Sede Norte', p_mesas: 8 });
  const n = await b.uno(`select
      (select count(*)::int from mesas where sede_id = $1) mesas,
      (select count(*)::int from estaciones where sede_id = $1) estaciones,
      (select count(*)::int from ubicaciones_stock where sede_id = $1) ubicaciones,
      (select count(*)::int from reglas_stock where sede_id = $1) reglas,
      (select count(*)::int from productos_sede where sede_id = $1) productos`, [norte]);
  const p = await b.uno(`select count(*)::int reglas from reglas_stock where sede_id = $1`, [S]);
  assert.deepEqual(n, { mesas: 8, estaciones: 2, ubicaciones: 6, reglas: p.reglas, productos: 16 });

  // Se asigna un mesero; su Mesa 02 es distinta de la Mesa 02 de Principal
  const meseroNorte = await b.usuario('MeseroNorte', [[norte, 'mesero']]);
  await b.como(u.admin);
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: norte, p_ubicacion: 'armado', p_insumo: await b.insumo('porc_hawaiana'), p_nuevo: 8, p_motivo: 'Saldo inicial' });
  const haw = await b.producto('Porción Hawaiana');
  await b.como(meseroNorte);
  const r = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: norte, p_mesa: 2, p_lineas: JSON.stringify([linea(haw, 1)]) });
  await b.como(u.mesero);
  const r2 = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 2, p_lineas: JSON.stringify([linea(haw, 1)]) });
  assert.notEqual(r.cuenta_id, r2.cuenta_id);
  // El mesero de Norte no puede operar en Principal
  await b.como(meseroNorte);
  await assert.rejects(b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 3, p_lineas: JSON.stringify([linea(haw, 1)]) }), /No tienes permiso/);
});

test('10 · Caja no puede cambiar precios ni ajustar stock; Administración sí y deja historial', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  const queso = await b.insumo('queso');
  await b.como(u.caja);
  await assert.rejects(b.rpc('cambiar_precio', { p_producto: haw, p_sede: S, p_precio: 1000 }), /Solo Administración/);
  await assert.rejects(b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: queso, p_nuevo: 1, p_motivo: 'robo' }), /Solo Administración/);

  await b.como(u.admin);
  await assert.rejects(b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: queso, p_nuevo: 4000, p_motivo: '' }), /motivo/);
  await b.rpc('cambiar_precio', { p_producto: haw, p_sede: S, p_precio: 7500 });
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: queso, p_nuevo: 4000, p_motivo: 'Conteo físico' });
  const h = await b.uno(`select precio_ant::float, precio_nuevo::float, perfil_id from precios_historial`);
  assert.deepEqual(h, { precio_ant: 7000, precio_nuevo: 7500, perfil_id: u.admin });
  const m = await b.uno(`select saldo_ant::float, saldo_nuevo::float, motivo, perfil_id from movimientos_stock where tipo = 'ajuste' and motivo = 'Conteo físico'`);
  assert.deepEqual(m, { saldo_ant: 5000, saldo_nuevo: 4000, motivo: 'Conteo físico', perfil_id: u.admin });
  // Las ventas anteriores conservan su precio
  await b.como(u.mesero);
  const e = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 5, p_lineas: JSON.stringify([linea(haw, 1)]) });
  assert.equal((await b.uno(`select precio_unit::float from lineas_pedido where pedido_id = $1`, [e.pedido_id])).precio_unit, 7500);
});

test('Extra · Mesero: portapizzas, falta de cartones y reportes a Administración', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.admin);
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'servicio', p_insumo: await b.insumo('portapizza'), p_nuevo: 25, p_motivo: 'Conteo' });
  const t = await b.tareasAbiertas(S, 'mesero', 'Armar portapizzas');
  assert.equal(t.length, 1);
  await b.como(u.mesero);
  await b.rpc('armar_portapizzas', { p_op: op(), p_sede: S, p_cantidad: 10 });
  assert.equal((await b.saldo(S, 'servicio', 'portapizza')).fisico, 35);
  assert.equal((await b.uno(`select estado from tareas where id = $1`, [t[0].id])).estado, 'lista', 'la hizo alguien del área');
  const r = await b.rpc('armar_portapizzas', { p_op: op(), p_sede: S, p_cantidad: 500 });
  assert.equal(r.ok, false);
  assert.equal((await b.tareasAbiertas(S, 'admin', 'Comprar cartones')).length, 1);
  await b.rpc('reportar_stock', { p_sede: S, p_ubicacion: 'servicio', p_insumo: await b.insumo('citronela'), p_tipo: 'queda_poco' });
  assert.equal((await b.tareasAbiertas(S, 'admin', 'Revisar compra · Citronela')).length, 1);
});

test('Extra · Cancelar: antes de preparar libera la reserva; después queda como merma', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.mesero);
  const e = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 3, p_lineas: JSON.stringify([linea(haw, 2)]) });
  const lp = await b.uno(`select id from lineas_pedido where pedido_id = $1`, [e.pedido_id]);
  await b.rpc('cancelar_linea', { p_linea: lp.id, p_motivo: 'Cliente cambió' });
  const s = await b.saldo(S, 'armado', 'porc_hawaiana');
  assert.deepEqual([s.fisico, s.reservado], [16, 0]);
  assert.equal((await b.uno(`select total::float from cuentas where id = $1`, [e.cuenta_id])).total, 0);
  assert.equal((await b.uno(`select estado from comandas where pedido_id = $1`, [e.pedido_id])).estado, 'cancelada');
});

test('Extra · Turnos, base de caja y gastos: efectivo esperado', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.caja);
  await b.rpc('iniciar_turno', { p_sede: S, p_rol: 'caja' });
  const tBase = await b.uno(`select id from tareas where titulo = 'Registrar base' and sede_id = $1`, [S]);
  await b.rpc('registrar_base', { p_op: op(), p_sede: S, p_base: 100000 });
  assert.equal((await b.uno(`select estado from tareas where id = $1`, [tBase.id])).estado, 'lista');
  await b.rpc('registrar_gasto', { p_op: op(), p_sede: S, p_categoria: 'Insumos', p_concepto: 'Hielo', p_valor: 8000, p_responsable: 'Caja', p_medio: 'efectivo' });
  await b.rpc('cobrar_mostrador', { p_op: op(), p_sede: S, p_tipo: 'llevar', p_lineas: JSON.stringify([linea(await b.producto('Gaseosa'), 2)]), p_medio: 'efectivo' });
  const c = await b.uno(`select base::float, cobrado::float, gastos::float, efectivo_esperado::float from v_caja_turnos where sede_id = $1`, [S]);
  assert.deepEqual(c, { base: 100000, cobrado: 8000, gastos: 8000, efectivo_esperado: 100000 });
  assert.equal((await b.saldo(S, 'bodega', 'gaseosa')).fisico, 46);
  const turno = await b.uno(`select rol, fin from turnos where perfil_id = $1`, [u.caja]);
  assert.equal(turno.rol, 'caja');
  await b.rpc('finalizar_turno', {});
  assert.ok((await b.uno(`select fin from turnos where perfil_id = $1`, [u.caja])).fin);
});
