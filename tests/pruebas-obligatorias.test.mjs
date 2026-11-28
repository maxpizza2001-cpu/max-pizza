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
  const jefe = await b.usuario('Jefe', [[S, 'ceo']]);
  await b.como(jefe);
  const norte = await b.rpc('crear_sede', { p_nombre: 'Sede Norte', p_mesas: 8 });
  const n = await b.uno(`select
      (select count(*)::int from mesas where sede_id = $1) mesas,
      (select count(*)::int from estaciones where sede_id = $1) estaciones,
      (select count(*)::int from ubicaciones_stock where sede_id = $1) ubicaciones,
      (select count(*)::int from reglas_stock where sede_id = $1) reglas,
      (select count(*)::int from productos_sede where sede_id = $1) productos`, [norte]);
  const p = await b.uno(`select count(*)::int reglas from reglas_stock where sede_id = $1`, [S]);
  assert.deepEqual(n, { mesas: 8, estaciones: 3, ubicaciones: 6, reglas: p.reglas, productos: 16 });

  // Se asigna un mesero; su Mesa 02 es distinta de la Mesa 02 de Principal
  const meseroNorte = await b.usuario('MeseroNorte', [[norte, 'mesero']]);
  await b.como(jefe);
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
  await assert.rejects(b.rpc('cambiar_precio', { p_producto: haw, p_sede: S, p_precio: 1000 }), /Solo (Administración|el administrador)/);
  await assert.rejects(b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: queso, p_nuevo: 1, p_motivo: 'robo' }), /Solo (Administración|el administrador)/);

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

test('Extra · Reposición: el área repone y su tarea queda lista; si se marca lista con stock bajo, nace otra', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.insumo('porc_hawaiana');
  await b.como(u.admin);
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: haw, p_nuevo: 4, p_motivo: 'Prueba' });
  let [t] = await b.tareasAbiertas(S, 'armado', 'Armar Hawaiana');
  await b.como(u.armado);
  await b.rpc('tarea_empezar', { p_tarea: t.id });
  await b.rpc('registrar_armado', { p_op: op(), p_sede: S, p_tipo: 'rueda', p_resultado: haw, p_cantidad: 8, p_tortas: 1 });
  assert.equal((await b.uno(`select estado, terminada_por from tareas where id = $1`, [t.id])).estado, 'lista');
  // Marcar lista a mano con stock bajo: la necesidad sigue visible
  await b.como(u.admin);
  await b.rpc('ajustar_stock', { p_op: op(), p_sede: S, p_ubicacion: 'armado', p_insumo: haw, p_nuevo: 3, p_motivo: 'Prueba' });
  [t] = await b.tareasAbiertas(S, 'armado', 'Armar Hawaiana');
  await b.como(u.armado);
  await b.rpc('tarea_completar', { p_tarea: t.id });
  const abiertas = await b.tareasAbiertas(S, 'armado', 'Armar Hawaiana');
  assert.equal(abiertas.length, 1);
  assert.notEqual(abiertas[0].id, t.id);
});

test('Fase 4 · Administración crea usuarios con rol y sede; Caja no puede', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.caja);
  await assert.rejects(b.rpc('admin_crear_usuario', { p_correo: 'x@y.co', p_clave: '123456', p_nombre: 'X', p_accesos: '[]' }), /Solo Administración/);
  await b.como(u.admin);
  const id = await b.rpc('admin_crear_usuario', { p_correo: 'Nueva@MaxPizza.co', p_clave: 'clave123', p_nombre: 'Laura',
    p_accesos: JSON.stringify([{ sede_id: S, rol: 'mesero' }]) });
  const p = await b.uno(`select p.nombre, p.correo, a.rol from perfiles p join accesos_sede a on a.perfil_id = p.id where p.id = $1`, [id]);
  assert.deepEqual(p, { nombre: 'Laura', correo: 'nueva@maxpizza.co', rol: 'mesero' });
  await assert.rejects(b.rpc('admin_crear_usuario', { p_correo: 'nueva@maxpizza.co', p_clave: 'clave123', p_nombre: 'Otra', p_accesos: '[]' }), /Ya existe/);
  await b.rpc('admin_activar_usuario', { p_perfil: id, p_activo: false });
  assert.equal((await b.uno(`select activo from perfiles where id = $1`, [id])).activo, false);
  assert.ok((await b.uno(`select banned_until from auth.users where id = $1`, [id])).banned_until);
});

test('Fase 4 · Precio editado directo por Administración deja historial; análisis cuenta uso y merma', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.admin);
  await b.q(`update productos_sede set precio = 8000 where producto_id = $1 and sede_id = $2`, [haw, S]);
  const h = await b.q(`select precio_ant::float, precio_nuevo::float from precios_historial where producto_id = $1 and sede_id = $2 and precio_ant is not null`, [haw, S]);
  assert.deepEqual(h, [{ precio_ant: 7000, precio_nuevo: 8000 }]);
  // Venta preparada y luego cancelada → merma de 2 porciones
  await b.como(u.mesero);
  const e = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 9, p_lineas: JSON.stringify([{ producto_id: haw, cantidad: 2 }]) });
  const [c] = await b.q(`select id from comandas where pedido_id = $1`, [e.pedido_id]);
  await b.como(u.caja);
  await b.rpc('comanda_estado', { p_comanda: c.id, p_estado: 'en_preparacion' });
  await b.como(u.mesero);
  const lp = await b.uno(`select id from lineas_pedido where pedido_id = $1`, [e.pedido_id]);
  await b.rpc('cancelar_linea', { p_linea: lp.id, p_motivo: 'Se quemó' });
  await b.como(u.admin);
  const a = await b.uno(`select usado::float, merma::float, existencia::float from analisis_consumo($1, 7) where insumo = 'Porciones Hawaiana'`, [S]);
  assert.deepEqual(a, { usado: 2, merma: 2, existencia: 14 });
});

test('Tienda · Fase 1: el menú público sale del mismo catálogo, por sede, y respeta "se vende online"', async () => {
  const { b, S, u } = await preparar();
  const R = b.sedes['El Refugio'];
  await b.como(null);   // cliente sin cuenta
  const sedes = await b.q(`select nombre from tienda_sedes()`);
  assert.deepEqual(sedes.map((s) => s.nombre).sort(), ['El Refugio', 'Sede Principal']);
  const menu = await b.q(`select nombre, precio::float from tienda_catalogo($1)`, [S]);
  assert.equal(menu.length, 16);
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.admin);
  await b.q(`update productos_sede set online = false where producto_id = $1 and sede_id = $2`, [haw, S]);
  await b.q(`update productos_sede set precio = 9000 where producto_id = $1 and sede_id = $2`, [haw, R]);
  await b.como(null);
  assert.equal((await b.q(`select 1 from tienda_catalogo($1) where id = $2`, [S, haw])).length, 0);
  assert.equal((await b.uno(`select precio::float from tienda_catalogo($1) where id = $2`, [R, haw])).precio, 9000);
});

test('Tienda · Fase 2: ajustes, zonas y adicionales por sede, públicos y de solo lectura', async () => {
  const { b, S } = await preparar();
  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  assert.equal(info.ajustes.abierta, true);
  assert.deepEqual(info.ajustes.medios, ['efectivo', 'nequi', 'transferencia']);
  assert.equal(info.zonas.length, 3);
  const ham = await b.producto('Hamburguesa');
  assert.deepEqual(info.opciones.filter((o) => o.producto_id === ham).map((o) => o.nombre), ['Doble carne', 'Extra queso', 'Porción extra de papas']);
  const pers = await b.producto('Personal Hawaiana');
  assert.equal(info.opciones.find((o) => o.producto_id === pers).nombre, 'Extra queso');
});

test('Tienda · Fase 3: el pedido online entra al mismo motor, precio del servidor, idempotente', async () => {
  const { b, S, u } = await preparar();
  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  const pers = await b.producto('Personal Hawaiana');
  const ham = await b.producto('Hamburguesa');
  const queso = info.opciones.find((o) => o.producto_id === pers).id;
  const zona = info.zonas.find((z) => +z.tarifa === 5000).id;
  const datos = { nombre: 'Ana Pérez', celular: '300 123 4567', entrega: 'domicilio', direccion: 'Calle 10 # 5-20',
    barrio: 'Centro', zona_id: zona, medio: 'efectivo', paga_con: '70000' };
  // El navegador manda un precio inventado: el servidor lo ignora
  const lineas = [{ producto_id: pers, cantidad: 2, opciones: [queso], nota: 'Sin piña', precio: 1 }, { producto_id: ham, cantidad: 1, opciones: [] }];
  const o = op();
  const r = await b.rpc('tienda_crear_pedido', { p_op: o, p_sede: S, p_lineas: JSON.stringify(lineas), p_datos: JSON.stringify(datos) });
  assert.equal(r.subtotal, 2 * 19000 + 18000);
  assert.equal(r.total, 2 * 19000 + 18000 + 5000);
  assert.match(r.codigo, /^[A-Z2-9]{6}$/);
  const r2 = await b.rpc('tienda_crear_pedido', { p_op: o, p_sede: S, p_lineas: JSON.stringify(lineas), p_datos: JSON.stringify(datos) });
  assert.equal(r2.codigo, r.codigo, 'doble toque no duplica');

  await b.como(u.caja);
  const ped = await b.uno(`select count(*)::int n, sum(total)::float total from pedidos_online where sede_id = $1`, [S]);
  assert.deepEqual(ped, { n: 1, total: 61000 });
  const com = await b.q(`select e.codigo est, lp.observacion obs, lp.precio_unit::float precio from comandas c join estaciones e on e.id = c.estacion_id
    join lineas_comanda lc on lc.comanda_id = c.id join lineas_pedido lp on lp.id = lc.linea_pedido_id where c.sede_id = $1 order by e.codigo`, [S]);
  assert.deepEqual(com, [
    { est: 'armado', obs: 'ONLINE · + Extra queso · Sin piña', precio: 19000 },
    { est: 'rapidas', obs: 'ONLINE', precio: 18000 },
  ]);

  // Validaciones del servidor
  await b.como(null);
  const mal = (d, l = lineas) => b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S, p_lineas: JSON.stringify(l), p_datos: JSON.stringify({ ...datos, ...d }) });
  await assert.rejects(mal({ celular: '123' }), /celular/);
  await assert.rejects(mal({ zona_id: '' }), /zona/);
  await assert.rejects(mal({ paga_con: '20000' }), /no alcanza/);
  await assert.rejects(mal({}, [{ producto_id: ham, cantidad: 1, opciones: [queso] }]), /adicional/);
  const vistos = await b.q(`select 1 from pedidos_online where puede_ver_sede(sede_id)`);
  assert.equal(vistos.length, 0, "un cliente no ve pedidos de otros");
});

test('Tienda · Fase 4: Caja confirma, cobra y entrega; la cocina avanza el estado; adicionales descuentan; cancelar libera', async () => {
  const { b, S, u } = await preparar();
  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  const pers = await b.producto('Personal Hawaiana');
  const queso = info.opciones.find((o) => o.producto_id === pers).id;
  const zona = info.zonas[0].id;
  const datos = { nombre: 'Ana Pérez', celular: '3001234567', entrega: 'domicilio', direccion: 'Calle 10 # 5-20', barrio: 'Centro', zona_id: zona, medio: 'nequi' };
  const quesoId = await b.insumo('queso');
  const saldo = async () => +(await b.uno(`select fisico from saldos_stock s join ubicaciones_stock u on u.id = s.ubicacion_id
    where u.sede_id = $1 and u.codigo = 'armado' and s.insumo_id = $2`, [S, quesoId])).fisico;
  const antes = await saldo();
  const pedir = () => b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S,
    p_lineas: JSON.stringify([{ producto_id: pers, cantidad: 2, opciones: [queso] }]), p_datos: JSON.stringify(datos) });
  const r = await pedir();
  assert.equal(await saldo(), antes - 160, 'extra queso × 2 = 160 g');

  const po = await b.uno(`select id, cuenta_id, estado, comprobante_estado from pedidos_online where codigo = $1`, [r.codigo]);
  assert.equal(po.comprobante_estado, 'pendiente');
  await b.como(u.mesero);
  await assert.rejects(b.rpc('online_estado', { p_id: po.id, p_estado: 'confirmado' }), /permiso/);
  await b.como(u.caja);
  await b.rpc('online_comprobante', { p_id: po.id, p_ok: true });
  await b.rpc('online_estado', { p_id: po.id, p_estado: 'confirmado' });
  const com = await b.uno(`select id from comandas where pedido_id = (select pedido_id from pedidos_online where id = $1)`, [po.id]);
  await b.como(u.armado);   // la pizza personal la prepara Armado
  await b.rpc('comanda_estado', { p_comanda: com.id, p_estado: 'en_preparacion' });
  assert.equal((await b.uno(`select estado from pedidos_online where id = $1`, [po.id])).estado, 'en_preparacion');
  await b.rpc('comanda_estado', { p_comanda: com.id, p_estado: 'lista' });
  assert.equal((await b.uno(`select estado from pedidos_online where id = $1`, [po.id])).estado, 'listo');
  await b.como(u.caja);
  await b.rpc('online_estado', { p_id: po.id, p_estado: 'en_camino', p_domiciliario: 'Carlos' });
  await assert.rejects(b.rpc('online_estado', { p_id: po.id, p_estado: 'confirmado' }), /ya pasó/);
  await b.rpc('confirmar_cobro', { p_op: op(), p_cuenta: po.cuenta_id, p_monto: r.total, p_medio: 'nequi' });
  await b.rpc('online_estado', { p_id: po.id, p_estado: 'entregado' });
  const fin = await b.uno(`select o.estado, o.domiciliario, c.estado cuenta from pedidos_online o join cuentas c on c.id = o.cuenta_id where o.id = $1`, [po.id]);
  assert.deepEqual(fin, { estado: 'entregado', domiciliario: 'Carlos', cuenta: 'pagada' });

  // Cancelar uno sin preparar: libera las porciones reservadas
  await b.como(null);
  const r2 = await pedir();
  await b.como(u.caja);
  const po2 = await b.uno(`select id from pedidos_online where codigo = $1`, [r2.codigo]);
  const res = async () => +(await b.uno(`select coalesce(sum(cantidad),0) q from reservas_stock where estado = 'activa'`)).q;
  assert.ok(await res() > 0);
  await b.rpc('online_estado', { p_id: po2.id, p_estado: 'cancelado', p_motivo: 'Cliente no contestó' });
  assert.equal(await res(), 0);
  assert.equal((await b.uno(`select estado from cuentas where id = (select cuenta_id from pedidos_online where id = $1)`, [po2.id])).estado, 'anulada');
});

test('Tienda · Fase 5: el cliente sigue su pedido con código + celular; Administración ajusta la tarifa', async () => {
  const { b, S, u } = await preparar();
  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  const ham = await b.producto('Hamburguesa');
  const r = await b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S,
    p_lineas: JSON.stringify([{ producto_id: ham, cantidad: 1, opciones: [], nota: 'Sin cebolla' }]),
    p_datos: JSON.stringify({ nombre: 'Ana Pérez', celular: '3001234567', entrega: 'domicilio', direccion: 'Calle 10 # 5-20', barrio: 'Centro', zona_id: info.zonas[0].id, medio: 'efectivo' }) });
  const seguir = (c, cel) => b.uno(`select tienda_seguimiento($1, $2) as s`, [c, cel]).then((x) => x.s);
  assert.equal(await seguir(r.codigo, '3009999999'), null, 'con otro celular no se ve');
  let s = await seguir(r.codigo.toLowerCase(), '300 123 4567');
  assert.equal(s.estado, 'recibido');
  assert.deepEqual(s.lineas, [{ nombre: 'Hamburguesa', cantidad: 1, detalle: 'Sin cebolla' }]);

  await b.como(u.rapidas);
  const com = await b.uno(`select id from comandas where pedido_id = (select pedido_id from pedidos_online where codigo = $1)`, [r.codigo]);
  await b.rpc('comanda_estado', { p_comanda: com.id, p_estado: 'en_preparacion' });
  await b.como(u.caja);
  const po = await b.uno(`select id from pedidos_online where codigo = $1`, [r.codigo]);
  await assert.rejects(b.rpc('online_ajustar', { p_id: po.id, p_domiciliario: 'X', p_notas: null, p_domicilio: 0 }), /Solo Administración/);
  await b.como(u.admin);
  await b.rpc('online_ajustar', { p_id: po.id, p_domiciliario: 'Carlos Ruiz', p_notas: 'Cliente frecuente', p_domicilio: 0 });
  await b.como(u.caja);
  await b.rpc('online_estado', { p_id: po.id, p_estado: 'en_camino' });
  await b.como(null);
  s = await seguir(r.codigo, '3001234567');
  assert.equal(s.estado, 'en_camino');
  assert.equal(s.domiciliario, 'Carlos');
  assert.equal(+s.total, 18000, 'domicilio gratis tras el ajuste');
  assert.deepEqual(s.historial.map((h) => h.estado), ['en_preparacion', 'en_camino']);
  assert.equal(+(await b.uno(`select total from cuentas where id = (select cuenta_id from pedidos_online where id = $1)`, [po.id])).total, 18000);
});

test('Tienda · Fase 6: Administración edita la tienda; promociones automáticas y con código se calculan en el servidor', async () => {
  const { b, S, u } = await preparar();
  await b.como(u.admin);
  await b.q(`update tienda_ajustes set pedido_minimo = 20000, medios = array['efectivo','nequi'], nequi_numero = '3110000000' where sede_id = $1`, [S]);
  await b.q(`insert into zonas_domicilio (sede_id, nombre, tarifa) values ($1, 'Vereda', 9000)`, [S]);
  await b.q(`insert into promociones (nombre, tipo, valor, minimo) values ('10% en pedidos de $30.000', 'porcentaje', 10, 30000)`);
  await b.q(`insert into promociones (sede_id, nombre, tipo, valor, codigo) values ($1, 'Bienvenida', 'valor', 5000, 'HOLA')`, [S]);
  await b.como(u.caja);
  assert.equal((await b.uno(`select es_admin() a`)).a, false, "Caja no edita la tienda (la política exige es_admin)");

  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  assert.equal(+info.ajustes.pedido_minimo, 20000);
  assert.deepEqual(info.ajustes.medios, ['efectivo', 'nequi']);
  assert.ok(info.zonas.some((z) => z.nombre === 'Vereda'));
  assert.deepEqual(info.promos.map((p) => p.nombre), ['10% en pedidos de $30.000'], 'la de código no se revela');
  assert.equal(info.hay_codigos, true);

  const ham = await b.producto('Hamburguesa');
  const vereda = info.zonas.find((z) => z.nombre === 'Vereda').id;
  const pedir = (cant, extra = {}) => b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S,
    p_lineas: JSON.stringify([{ producto_id: ham, cantidad: cant, opciones: [] }]),
    p_datos: JSON.stringify({ nombre: 'Ana Pérez', celular: '3001234567', entrega: 'domicilio', direccion: 'Calle 10 # 5-20', barrio: 'Centro', zona_id: vereda, medio: 'efectivo', ...extra }) });
  await assert.rejects(pedir(1, { medio: 'transferencia' }), /Medio de pago/);
  const r1 = await pedir(2);                       // 36.000 → 10% = 3.600
  assert.deepEqual([+r1.descuento, +r1.total], [3600, 36000 + 9000 - 3600]);
  const r2 = await pedir(2, { codigo_promo: 'hola' });   // la mejor: 5.000 con código
  assert.deepEqual([+r2.descuento, r2.promocion], [5000, 'Bienvenida']);
  await assert.rejects(pedir(2, { codigo_promo: 'NOEXISTE' }), /código de promoción/);
  const prev = (await b.uno(`select tienda_promo($1, 18000, null) p`, [S])).p;
  assert.equal(prev, null, 'con $18.000 no alcanza el mínimo de la promo');
  await b.como(u.caja);
  assert.equal(+(await b.uno(`select total from cuentas where id = (select cuenta_id from pedidos_online where codigo = $1)`, [r1.codigo])).total, 41400);
});

test('Domiciliarios: el primero que toca "Yo lo llevo" se lo queda; sale con el pedido listo y lo entrega', async () => {
  const { b, S, u } = await preparar();
  const d1 = await b.usuario('Carlos Ruiz', [[S, 'domiciliario']]);
  const d2 = await b.usuario('Pedro Gómez', [[S, 'domiciliario']]);
  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  const ham = await b.producto('Hamburguesa');
  const r = await b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S, p_lineas: JSON.stringify([{ producto_id: ham, cantidad: 1, opciones: [] }]),
    p_datos: JSON.stringify({ nombre: 'Ana Pérez', celular: '3001234567', entrega: 'domicilio', direccion: 'Calle 10 # 5-20', barrio: 'Centro', zona_id: info.zonas[0].id, medio: 'efectivo' }) });
  const po = await b.uno(`select id, pedido_id from pedidos_online where codigo = $1`, [r.codigo]);

  await b.como(d1);
  await assert.rejects(b.rpc('domicilio_tomar', { p_id: po.id }), /no está disponible/, 'sin confirmar por Caja no se puede tomar');
  await b.como(u.caja);
  await b.rpc('online_estado', { p_id: po.id, p_estado: 'confirmado' });
  assert.equal((await b.uno(`select count(*)::int n from notificaciones where rol = 'domiciliario'`)).n, 1);

  await b.como(d1);
  await b.rpc('domicilio_tomar', { p_id: po.id });
  await b.como(d2);
  await assert.rejects(b.rpc('domicilio_tomar', { p_id: po.id }), /Ya lo tomó Carlos Ruiz/);
  await assert.rejects(b.rpc('domicilio_avanzar', { p_id: po.id, p_estado: 'en_camino' }), /no es tuyo/);

  await b.como(d1);
  await assert.rejects(b.rpc('domicilio_avanzar', { p_id: po.id, p_estado: 'en_camino' }), /esté listo/);
  await b.como(u.rapidas);
  const com = await b.uno(`select id from comandas where pedido_id = $1`, [po.pedido_id]);
  await b.rpc('comanda_estado', { p_comanda: com.id, p_estado: 'lista' });
  await b.como(d1);
  await b.rpc('domicilio_avanzar', { p_id: po.id, p_estado: 'en_camino' });
  await b.rpc('domicilio_avanzar', { p_id: po.id, p_estado: 'entregado' });
  const fin = await b.uno(`select estado, domiciliario from pedidos_online where id = $1`, [po.id]);
  assert.deepEqual(fin, { estado: 'entregado', domiciliario: 'Carlos Ruiz' });
});

test('Avisos push: cada quien guarda su celular solo para un rol que tiene', async () => {
  const { b, S, u } = await preparar();
  const d1 = await b.usuario('Carlos Ruiz', [[S, 'domiciliario']]);
  await b.como(d1);
  await b.rpc('push_guardar', { p_sede: S, p_rol: 'domiciliario', p_endpoint: 'https://push.ejemplo/abc', p_p256dh: 'k', p_auth: 'a' });
  await b.rpc('push_guardar', { p_sede: S, p_rol: 'domiciliario', p_endpoint: 'https://push.ejemplo/abc', p_p256dh: 'k2', p_auth: 'a' });
  assert.equal((await b.uno(`select count(*)::int n from push_suscripciones`)).n, 1, 'el mismo celular no se repite');
  await assert.rejects(b.rpc('push_guardar', { p_sede: S, p_rol: 'caja', p_endpoint: 'https://push.ejemplo/x', p_p256dh: 'k', p_auth: 'a' }), /No tienes ese rol/);
  // Sin la dirección de la función configurada, las notificaciones siguen funcionando igual
  await b.como(u.admin);
  await b.q(`select notificar($1, 'domiciliario', null, 'prueba', 'Hola', null, null)`, [S]);
});

test('Combos: el combo se abre en sus productos, cada uno va a su cocina, y el total es el precio del combo', async () => {
  const { b, S, u } = await preparar();
  const pers = await b.producto('Personal Hawaiana');   // $16.000 · horno
  const gas = await b.producto('Gaseosa');              // $4.000 · sale de una vez
  const ham = await b.producto('Hamburguesa');          // $18.000 · tablet
  await b.como(u.admin);
  const c = await b.uno(`insert into combos (nombre, precio) values ('Personal + gaseosa', 18000) returning id`);
  await b.q(`insert into combo_items (combo_id, producto_id, cantidad) values ($1, $2, 1), ($1, $3, 1)`, [c.id, pers, gas]);
  await b.q(`update zonas_domicilio set minutos_min = 30, minutos_max = 45 where sede_id = $1`, [S]);
  await b.q(`update tienda_ajustes set whatsapp = '3001112233', banner_activo = true, banner_titulo = 'Noche de partido' where sede_id = $1`, [S]);

  await b.como(null);
  const info = (await b.uno(`select tienda_info($1) as i`, [S])).i;
  const combo = info.combos.find((x) => x.nombre === 'Personal + gaseosa');
  assert.equal(+combo.normal, 20000, 'por separado vale $20.000');
  assert.equal(info.ajustes.banner.titulo, 'Noche de partido');
  assert.equal(info.ajustes.whatsapp, '3001112233');
  assert.equal(info.zonas[0].minutos_max, 45);

  const r = await b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S,
    p_lineas: JSON.stringify([{ combo_id: c.id, cantidad: 2, nota: 'Bien fría' }, { producto_id: ham, cantidad: 1, opciones: [] }]),
    p_datos: JSON.stringify({ nombre: 'Ana Pérez', celular: '3001234567', entrega: 'recoger', medio: 'efectivo' }) });
  assert.equal(+r.subtotal, 2 * 18000 + 18000);

  await b.como(u.caja);
  const lineas = await b.q(`select pr.nombre, lp.cantidad::int cant, lp.precio_unit::float precio, lp.observacion obs from lineas_pedido lp
    join productos pr on pr.id = lp.producto_id join pedidos_online o on o.pedido_id = lp.pedido_id where o.codigo = $1 order by pr.nombre`, [r.codigo]);
  assert.deepEqual(lineas, [
    { nombre: 'Gaseosa', cant: 2, precio: 4000, obs: 'ONLINE · COMBO Personal + gaseosa' },
    { nombre: 'Hamburguesa', cant: 1, precio: 18000, obs: 'ONLINE' },
    { nombre: 'Personal Hawaiana', cant: 2, precio: 14000, obs: 'ONLINE · COMBO Personal + gaseosa · Bien fría' },
  ]);
  const est = await b.q(`select e.codigo from comandas c join estaciones e on e.id = c.estacion_id join pedidos_online o on o.pedido_id = c.pedido_id where o.codigo = $1 order by 1`, [r.codigo]);
  assert.deepEqual(est.map((x) => x.codigo), ['armado', 'rapidas'], 'la personal va a Armado');

  // Si un producto del combo deja de venderse en línea, el combo desaparece y no se puede pedir
  await b.como(u.admin);
  await b.q(`update productos_sede set online = false where producto_id = $1 and sede_id = $2`, [gas, S]);
  await b.como(null);
  assert.equal((await b.uno(`select tienda_info($1) as i`, [S])).i.combos.length, 0);
  await assert.rejects(b.rpc('tienda_crear_pedido', { p_op: op(), p_sede: S, p_lineas: JSON.stringify([{ combo_id: c.id, cantidad: 1 }]),
    p_datos: JSON.stringify({ nombre: 'Ana Pérez', celular: '3001234567', entrega: 'recoger', medio: 'efectivo' }) }), /del combo/);
});

test('Agotados: la tienda dice cuántas pizzas quedan; sin porciones sale en 0 y las comidas rápidas no tienen límite', async () => {
  const { b, S, u } = await preparar();
  await b.como(null);
  const ver = async (n) => (await b.uno(`select disponibles from tienda_catalogo($1) where nombre = $2`, [S, n])).disponibles;
  const antes = await ver('Personal Hawaiana');
  assert.ok(antes > 0);
  assert.equal(await ver('Hamburguesa'), null, 'comidas rápidas sin límite');
  // Se piden todas las que quedan → queda en 0 (reservadas)
  const pers = await b.producto('Personal Hawaiana');
  await b.como(u.mesero);
  await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 1, p_lineas: JSON.stringify([{ producto_id: pers, cantidad: antes }]) });
  await b.como(null);
  assert.equal(await ver('Personal Hawaiana'), 0);
});

test('V2 · Administrador CEO: ve todas las sedes y nombra admins; un admin solo ve y maneja sus sedes y no se da permisos', async () => {
  const b = await nuevaBase();
  const S = b.principal, R = b.sedes['El Refugio'];
  const ceo = await b.usuario('Jefe', [[S, 'ceo']]);
  const adm = await b.usuario('Admin Principal', [[S, 'admin']]);
  const mes = await b.usuario('Mesero Refugio', [[R, 'mesero']]);
  const app = async (sql, p = []) => { await b.q('begin'); try { await b.q('set local role authenticated'); const r = await b.q(sql, p); await b.q('commit'); return r; } catch (e) { await b.q('rollback'); throw e; } };
  const ver = async () => (await app(`select nombre from sedes order by nombre`)).map((x) => x.nombre);

  // CEO: todas las sedes, y puede crear una nueva
  await b.como(ceo);
  assert.deepEqual(await ver(), ['El Refugio', 'Sede Principal']);
  await b.rpc('crear_sede', { p_nombre: 'Sede 3', p_mesas: 5 });
  // Admin normal: solo su sede; no crea sedes
  await b.como(adm);
  assert.deepEqual(await ver(), ['Sede Principal']);
  await assert.rejects(b.rpc('crear_sede', { p_nombre: 'Sede 4', p_mesas: 5 }), /CEO/);
  // No se puede dar acceso a otra sede ni nombrarse/nombrar administradores
  await assert.rejects(app(`insert into accesos_sede (perfil_id, sede_id, rol) values ($1, $2, 'admin')`, [adm, R]));
  await assert.rejects(app(`insert into accesos_sede (perfil_id, sede_id, rol) values ($1, $2, 'caja')`, [adm, R]));
  await assert.rejects(b.rpc('admin_crear_usuario', { p_correo: 'otro@x.co', p_clave: '123456', p_nombre: 'Otro', p_accesos: JSON.stringify([{ sede_id: S, rol: 'admin' }]) }), /CEO/);
  // Sí crea personal en su sede, pero no toca personal de otra sede
  await b.rpc('admin_crear_usuario', { p_correo: 'cajero@x.co', p_clave: '123456', p_nombre: 'Cajero', p_accesos: JSON.stringify([{ sede_id: S, rol: 'caja' }]) });
  await assert.rejects(b.rpc('admin_activar_usuario', { p_perfil: mes, p_activo: false }), /No puedes/);
  await assert.rejects(b.rpc('configurar_mesas', { p_sede: R, p_total: 3 }), /administrador de esta sede/);
  assert.equal((await b.q(`select 1 from cuentas where sede_id = $1`, [R])).length, 0);

  // CEO nombra al admin también en El Refugio → ahora ve las dos
  await b.como(ceo);
  await app(`insert into accesos_sede (perfil_id, sede_id, rol) values ($1, $2, 'admin')`, [adm, R]);
  assert.equal((await b.q(`select * from ceo_administradores() where rol = 'admin'`))[0].sedes.length, 2);
  await b.como(adm);
  assert.deepEqual(await ver(), ['El Refugio', 'Sede Principal']);
  // Siempre queda al menos un CEO
  await b.como(ceo);
  await assert.rejects(app(`delete from accesos_sede where perfil_id = $1 and rol = 'ceo'`, [ceo]), /al menos un/);
});

test('V2 · Caja: resumen del turno separa efectivo y Nequi, calcula el esperado y el descuadre al cerrar', async () => {
  const { b, S, u } = await preparar();
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.caja);
  await b.rpc('registrar_base', { p_op: op(), p_sede: S, p_base: 100000 });
  const v = (n, m) => b.rpc('cobrar_mostrador', { p_op: op(), p_sede: S, p_tipo: 'mostrador', p_lineas: JSON.stringify([linea(haw, n)]), p_medio: m });
  await v(5, 'efectivo');   // 35.000
  await v(2, 'nequi');      // 14.000
  await b.rpc('registrar_gasto', { p_op: op(), p_sede: S, p_categoria: 'Aseo', p_concepto: 'Jabón', p_valor: 5000, p_responsable: null, p_medio: 'efectivo' });
  await b.rpc('registrar_gasto', { p_op: op(), p_sede: S, p_categoria: 'Aseo', p_concepto: 'Bolsas', p_valor: 3000, p_responsable: null, p_medio: 'nequi' });
  const opS = op();
  await b.rpc('caja_movimiento', { p_op: opS, p_sede: S, p_tipo: 'salida', p_monto: 10000, p_concepto: 'Retiro del dueño' });
  await b.rpc('caja_movimiento', { p_op: opS, p_sede: S, p_tipo: 'salida', p_monto: 10000, p_concepto: 'Retiro del dueño' }); // doble toque
  const mesa = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 3, p_lineas: JSON.stringify([linea(haw, 1)]) });

  const r = await b.rpc('caja_resumen', { p_sede: S });
  assert.equal(+r.efectivo.ventas, 35000);
  assert.equal(+r.efectivo.gastos, 5000);
  assert.equal(+r.efectivo.salidas, 10000);
  assert.equal(+r.efectivo.esperado, 100000 + 35000 - 5000 - 10000, 'Nequi no entra al efectivo');
  assert.equal(r.nequi.length, 1);
  assert.equal(+r.nequi[0].monto, 14000);
  assert.equal(+r.vendido, 8 * 7000);
  assert.equal(+r.pendiente, 7000, 'la mesa 03 sin cobrar');
  assert.ok(mesa.cuenta_id);

  await assert.rejects(b.rpc('cerrar_caja', { p_sede: S, p_contado: 115000 }), /observación/);
  const c = await b.rpc('cerrar_caja', { p_sede: S, p_contado: 115000, p_observacion: 'Faltó un billete' });
  assert.equal(+c.diferencia, -5000);
  const t = await b.uno(`select efectivo_contado::float c, diferencia::float d, observacion from turnos_caja where sede_id = $1`, [S]);
  assert.deepEqual(t, { c: 115000, d: -5000, observacion: 'Faltó un billete' });
});

test('V2 · Avisos: personal va al armador, "lista" avisa solo a quien pidió, admin solo stock bajo, recordatorios a su hora', async () => {
  const { b, S, u } = await preparar();
  const mesero2 = await b.usuario('Mesero2', [[S, 'mesero']]);
  const pers = await b.producto('Personal Hawaiana');
  const haw = await b.producto('Porción Hawaiana');
  // Cada uno con su celular suscrito
  for (const [quien, rol] of [[u.mesero, 'mesero'], [mesero2, 'mesero'], [u.armado, 'armado'], [u.admin, 'admin'], [u.caja, 'caja']]) {
    await b.como(quien);
    await b.rpc('push_guardar', { p_sede: S, p_rol: rol, p_endpoint: `https://push.test/${rol}-${quien}`, p_p256dh: 'k', p_auth: 'a' });
  }
  const destinos = async (titulo) => {
    const n = await b.uno(`select id from notificaciones where titulo like $1 order by creada_en desc limit 1`, [titulo]);
    assert.ok(n, 'existe la notificación ' + titulo);
    return (await b.q(`select endpoint, titulo, cuerpo, url from push_destinos($1)`, [n.id]));
  };

  // Mesero pide 2 personales + 1 porción en la mesa 3
  await b.como(u.mesero);
  const e = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 3, p_lineas: JSON.stringify([linea(pers, 2), linea(haw, 1)]) });
  const com = await b.q(`select c.id, e.codigo from comandas c join estaciones e on e.id = c.estacion_id where c.pedido_id = $1 order by 2`, [e.pedido_id]);
  assert.deepEqual(com.map((x) => x.codigo), ['armado', 'horno'], 'la personal va a Armado, la porción al horno');
  const aArmado = await destinos('🍕 Pizza personal solicitada%');
  assert.equal(aArmado.length, 1);
  assert.match(aArmado[0].endpoint, /armado/);
  assert.match(aArmado[0].cuerpo, /2 Personal Hawaiana[\s\S]*Solicitado por Mesero/);
  assert.match(aArmado[0].titulo, /MAX PIZZA · .*Mesa 03/);

  // Solo el armador mueve su comanda; al marcar lista avisa SOLO al mesero que la pidió
  const cArm = com.find((x) => x.codigo === 'armado').id;
  await b.como(u.caja);
  await assert.rejects(b.rpc('comanda_estado', { p_comanda: cArm, p_estado: 'en_preparacion' }));
  await b.como(u.armado);
  await b.rpc('comanda_estado', { p_comanda: cArm, p_estado: 'en_preparacion' });
  await b.rpc('comanda_estado', { p_comanda: cArm, p_estado: 'lista' });
  const lista = await destinos('🍕 Pizza personal lista%');
  assert.deepEqual(lista.map((x) => x.endpoint), [`https://push.test/mesero-${u.mesero}`], 'no le llega al otro mesero');
  assert.equal(lista[0].url, '/?abrir=comanda:' + cArm);

  // Administración: un reporte NO va al celular; el stock bajo SÍ
  await b.como(null);
  await b.q(`select notificar($1, 'admin', null, 'reporte', 'Reporte X', null, null)`, [S]);
  assert.equal((await destinos('Reporte X')).length, 0);
  await b.q(`select notificar($1, 'admin', null, 'stock_bajo', 'Stock bajo · Queso', 'Quedan 2', null)`, [S]);
  assert.equal((await destinos('Stock bajo · Queso')).length, 1);

  // Tarea con hora y recordatorio 10 min antes, que se repite cada día
  await b.como(u.admin);
  const t = await b.rpc('tarea_crear', { p_sede: S, p_rol: 'insumos', p_titulo: 'Preparar salsa de ajo', p_prioridad: 'alta', p_asignada: u.insumos, p_detalle: null, p_accion: null });
  await b.rpc('tarea_horario', { p_tarea: t, p_hora: new Date(Date.now() + 5 * 60000).toISOString(), p_recordar_min: 10, p_recordar_en: null, p_repeticion: 'diaria' });
  await b.como(null);
  assert.equal(await b.uno(`select enviar_recordatorios() n`).then((r) => r.n), 1);
  assert.equal(await b.uno(`select enviar_recordatorios() n`).then((r) => r.n), 0, 'no se repite el mismo recordatorio');
  const rec = await b.uno(`select perfil_id, titulo from notificaciones where tipo = 'recordatorio'`);
  assert.deepEqual(rec, { perfil_id: u.insumos, titulo: '⏰ Preparar salsa de ajo' });
  assert.equal((await b.q(`select 1 from tareas where titulo = 'Preparar salsa de ajo'`)).length, 2, 'quedó la de mañana');
});

test('V2 · Stock bajo: aplicar el mínimo a todas las sedes respeta las excepciones y crea una sola tarea por alerta', async () => {
  const b = await nuevaBase();
  const S = b.principal, R = b.sedes['El Refugio'];
  const jefe = await b.usuario('Jefe', [[S, 'ceo']]);
  const adm = await b.usuario('AdminP', [[S, 'admin']]);
  const queso = await b.insumo('queso');
  const aplicar = (sedes, minimo, excepcion = false) => b.rpc('regla_aplicar', { p_sedes: `{${sedes.join(',')}}`, p_ubicacion: 'bodega',
    p_insumo: queso, p_minimo: minimo, p_rol: 'insumos', p_prioridad: 'alta', p_texto: 'Reponer queso', p_accion: null, p_excepcion: excepcion });
  const minimos = async () => (await b.q(`select s.nombre, r.minimo::float m from reglas_stock r join sedes s on s.id = r.sede_id
    join ubicaciones_stock u on u.id = r.ubicacion_id where r.insumo_id = $1 and u.codigo = 'bodega' and r.rol_destino = 'insumos' order by 1`, [queso]));

  await b.como(jefe);
  await aplicar([S, R], 5000);
  assert.deepEqual(await minimos(), [{ nombre: 'El Refugio', m: 5000 }, { nombre: 'Sede Principal', m: 5000 }]);
  await aplicar([R], 2000, true);                       // El Refugio con mínimo propio
  const r = await aplicar([S, R], 8000);                 // "todas": no pisa la excepción
  assert.deepEqual(r.saltadas, ['El Refugio']);
  assert.deepEqual(await minimos(), [{ nombre: 'El Refugio', m: 2000 }, { nombre: 'Sede Principal', m: 8000 }]);
  // Una sola alerta y una sola tarea aunque se reevalúe varias veces (saldo de queso en bodega = 0 < mínimo)
  await aplicar([S], 9000);
  const al = await b.q(`select a.id from alertas_stock a join reglas_stock r on r.id = a.regla_id where r.sede_id = $1 and r.insumo_id = $2 and a.estado = 'activa'`, [S, queso]);
  assert.equal(al.length, 1);
  assert.equal((await b.q(`select 1 from tareas t join reglas_stock r on r.id = t.regla_id where r.sede_id = $1 and r.insumo_id = $2 and t.estado = 'pendiente'`, [S, queso])).length, 1);
  // Un admin de la Principal no toca El Refugio
  await b.como(adm);
  await assert.rejects(aplicar([S, R], 1), /tus sedes/);
});

test('V2 · Compras: necesidades por sede consolidadas con proveedor; borrar proveedor/producto conserva la historia', async () => {
  const b = await nuevaBase();
  const S = b.principal, R = b.sedes['El Refugio'];
  const jefe = await b.usuario('Jefe', [[S, 'ceo']]);
  const queso = await b.insumo('queso');
  await b.como(jefe);
  await b.rpc('regla_aplicar', { p_sedes: `{${S},${R}}`, p_ubicacion: 'bodega', p_insumo: queso, p_minimo: 5000, p_rol: 'admin',
    p_prioridad: 'alta', p_texto: 'Comprar queso', p_accion: null, p_excepcion: false });
  const pv = (await b.uno(`insert into proveedores (nombre, whatsapp) values ('Lácteos Don Pepe', '573001112233') returning id`)).id;
  await b.q(`insert into proveedor_insumos (proveedor_id, insumo_id, precio, unidad_compra, contenido) values ($1, $2, 20, 'bloque', 2500)`, [pv, queso]);
  const n = await b.q(`select sede, sugerido::float, proveedor, unidad_compra, contenido::float from necesidades_compra($1) where insumo_id = $2 order by sede`, [`{${S},${R}}`, queso]);
  assert.equal(n.length, 2, 'una fila por sede');
  assert.ok(n.every((x) => x.proveedor === 'Lácteos Don Pepe' && x.unidad_compra === 'bloque' && x.sugerido > 0));

  // Proveedor sin compras → se borra; con compras → se desactiva y la orden conserva su proveedor
  assert.equal(await b.rpc('proveedor_eliminar', { p_id: pv }), 'eliminado');
  const pv2 = (await b.uno(`insert into proveedores (nombre) values ('Cartones SAS') returning id`)).id;
  const orden = await b.rpc('crear_orden_compra', { p_sede: S, p_proveedor: pv2, p_lineas: JSON.stringify([{ insumo_id: queso, ubicacion: 'bodega', cantidad: 1000 }]) });
  assert.equal(await b.rpc('proveedor_eliminar', { p_id: pv2 }), 'desactivado');
  assert.equal((await b.uno(`select proveedor_id from ordenes_compra where id = $1`, [orden])).proveedor_id, pv2);

  // Producto vendido → se desactiva; producto nuevo sin ventas → se borra
  const caja = await b.usuario('Caja', [[S, 'caja']]);
  const haw = await b.producto('Porción Hawaiana');
  await b.como(caja);
  await b.rpc('cobrar_mostrador', { p_op: op(), p_sede: S, p_tipo: 'mostrador', p_lineas: JSON.stringify([{ producto_id: haw, cantidad: 1 }]), p_medio: 'efectivo' });
  await b.como(jefe);
  assert.equal(await b.rpc('producto_eliminar', { p_id: haw }), 'desactivado');
  assert.equal((await b.uno(`select activo from productos where id = $1`, [haw])).activo, false);
  const cat = (await b.uno(`select categoria_id from productos where id = $1`, [haw])).categoria_id;
  const nuevo = (await b.uno(`insert into productos (categoria_id, nombre, formato, estacion) values ($1, 'Prueba X', 'unidad', 'ninguna') returning id`, [cat])).id;
  assert.equal(await b.rpc('producto_eliminar', { p_id: nuevo }), 'eliminado');
});

test('V2 · Análisis: consumo real por período y sede; un admin no ve otras sedes; historial de tortas', async () => {
  const { b, S, u } = await preparar();
  const R = b.sedes['El Refugio'];
  const haw = await b.producto('Porción Hawaiana');
  await b.como(u.caja);
  await b.rpc('cobrar_mostrador', { p_op: op(), p_sede: S, p_tipo: 'mostrador', p_lineas: JSON.stringify([linea(haw, 3)]), p_medio: 'efectivo' });
  await b.como(u.tortas);
  await b.rpc('registrar_tortas', { p_op: op(), p_sede: S, p_monjes_recibidos: 4, p_monjes_usados: 2, p_grandes: 2, p_pequenas: 1 });
  await b.como(u.admin);
  const desde = new Date(Date.now() - 86400000).toISOString(), hasta = new Date(Date.now() + 86400000).toISOString();
  const filas = await b.q(`select * from analisis_periodo(null, $1, $2, 'dia')`, [desde, hasta]);
  assert.ok(filas.length > 0);
  assert.ok(filas.every((f) => f.sede_id === S), 'solo su sede');
  assert.ok(filas.some((f) => Number(f.comprado) > 0), 'monjes recibidos cuentan como comprado');
  assert.ok(filas.some((f) => Number(f.producido) > 0));
  const t = await b.q(`select tipo, sum(cantidad)::float c from produccion_tortas_historial(null, $1, $2, 'dia') group by tipo`, [desde, hasta]);
  assert.ok(t.length > 0);
  await b.como(await b.usuario('AdminR', [[R, 'admin']]));
  assert.ok((await b.q(`select sede_id from analisis_periodo(null, $1, $2, 'dia')`, [desde, hasta])).every((f) => f.sede_id === R), 'el admin de El Refugio no ve la Principal');
});

test('V2 · Pendientes: editar usuario, actividad por sede, probar aviso y quién tomó la comanda', async () => {
  const { b, S, u } = await preparar();
  const R = b.sedes['El Refugio'];
  await b.como(u.admin);
  await b.rpc('admin_editar_usuario', { p_perfil: u.mesero, p_nombre: 'Mesero Nuevo', p_correo: 'mesero.nuevo@maxpizza.test' });
  assert.deepEqual(await b.uno(`select p.nombre, u.email from perfiles p join auth.users u on u.id = p.id where p.id = $1`, [u.mesero]),
    { nombre: 'Mesero Nuevo', email: 'mesero.nuevo@maxpizza.test' });
  const otro = await b.usuario('MeseroR', [[R, 'mesero']]);
  await assert.rejects(b.rpc('admin_editar_usuario', { p_perfil: otro, p_nombre: 'X Y', p_correo: 'x@y.co' }), /No puedes/);

  // Comanda personal: queda quién la tomó; la actividad la muestra solo para la sede del admin
  const pers = await b.producto('Personal Hawaiana');
  await b.como(u.mesero);
  const e = await b.rpc('enviar_pedido_mesa', { p_op: op(), p_sede: S, p_mesa: 2, p_lineas: JSON.stringify([{ producto_id: pers, cantidad: 1 }]) });
  const c = await b.uno(`select id from comandas where pedido_id = $1`, [e.pedido_id]);
  await b.como(u.armado);
  await b.rpc('comanda_estado', { p_comanda: c.id, p_estado: 'en_preparacion' });
  assert.equal((await b.uno(`select tomada_por from comandas where id = $1`, [c.id])).tomada_por, u.armado);
  await b.como(u.admin);
  const act = await b.q(`select tipo, sede from actividad_reciente(null, 50)`);
  assert.ok(act.some((a) => a.tipo === 'pedido'));
  assert.ok(act.every((a) => a.sede === null || a.sede === 'Sede Principal'));

  // Probar aviso: sin celular suscrito no manda nada; con celular, le llega solo a uno mismo
  assert.equal(await b.rpc('push_probar', {}), 0);
  await b.rpc('push_guardar', { p_sede: S, p_rol: 'admin', p_endpoint: 'https://push.test/yo', p_p256dh: 'k', p_auth: 'a' });
  assert.equal(await b.rpc('push_probar', {}), 1);
  const n = await b.uno(`select id from notificaciones where tipo = 'prueba'`);
  assert.deepEqual((await b.q(`select endpoint from push_destinos($1)`, [n.id])).map((x) => x.endpoint), ['https://push.test/yo']);
});
