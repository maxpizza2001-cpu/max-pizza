import { useCallback, useEffect, useRef, useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../lib/supabase';
import { hora, mesa2, plata } from '../lib/formato';
import { pitar, useCatalogo, useComandas, useEnVivo, useGuardado, type LineaCarrito, type Producto } from '../lib/datos';
import { MedioPago, Productos, Resumen, TarjetaComanda, totalCarrito, Ventana } from '../componentes/Piezas';
import { MisTareas } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';
import { PedidosOnline } from '../componentes/PedidosOnline';

type PorCobrar = { cuenta_id: string; mesa: number; total: number; pagado: number; saldo: number };
type Venta = { lineas: LineaCarrito[]; op: string; tipo: 'mostrador' | 'llevar'; medio: string };
type Pedido = { lineas: LineaCarrito[]; op: string; destino: string; medio: string };

const ventaVacia = (): Venta => ({ lineas: [], op: nuevaOperacion(), tipo: 'mostrador', medio: 'efectivo' });
const pedidoVacio = (): Pedido => ({ lineas: [], op: nuevaOperacion(), destino: 'mostrador', medio: 'efectivo' });

export function Caja({ sede, perfil }: { sede: string; perfil: string }) {
  const productos = useCatalogo(sede);
  const [porCobrar, setPorCobrar] = useState<PorCobrar[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ventana, setVentana] = useState<null | 'base' | 'gastos' | 'tareas' | 'horno' | 'pedido'>(null);
  const [turnoCaja, setTurnoCaja] = useState<{ id: string; base: number; efectivo_esperado: number; cobrado: number; gastos: number; abierto_en: string } | null>(null);
  const { comandas: horno } = useComandas(sede, { estacion: 'horno', estados: ['nueva', 'en_preparacion'] });

  const cargar = useCallback(async () => {
    const [{ data: pc }, { data: tc }] = await Promise.all([
      sb.from('v_por_cobrar').select('cuenta_id, mesa, total, pagado, saldo').eq('sede_id', sede).order('mesa'),
      sb.from('v_caja_turnos').select('id, base, efectivo_esperado, cobrado, gastos, abierto_en').eq('sede_id', sede).is('cerrado_en', null).maybeSingle(),
    ]);
    setPorCobrar((pc ?? []).map((r: any) => ({ ...r, total: +r.total, pagado: +r.pagado, saldo: +r.saldo })));
    setTurnoCaja(tc ? { ...tc, base: +tc.base, efectivo_esperado: +tc.efectivo_esperado, cobrado: +tc.cobrado, gastos: +tc.gastos } : null);
  }, [sede]);
  useEnVivo(`caja-${sede}`, [
    { tabla: 'cuentas', filtro: `sede_id=eq.${sede}` }, { tabla: 'pagos', filtro: `sede_id=eq.${sede}` },
    { tabla: 'turnos_caja', filtro: `sede_id=eq.${sede}` }, { tabla: 'gastos_caja', filtro: `sede_id=eq.${sede}` },
  ], cargar);
  useEffect(() => { cargar(); }, [cargar]);

  // Aviso cuando entra una pizza nueva al horno
  const [vistas, setVistas] = useState(0);
  useEffect(() => { if (horno.length > vistas) pitar(); setVistas(horno.length); }, [horno.length]);

  const [enviado, setEnviado] = useState('');
  useEffect(() => { if (!enviado) return; const t = setTimeout(() => setEnviado(''), 4000); return () => clearTimeout(t); }, [enviado]);
  const cuentaAbierta = porCobrar.find((p) => p.cuenta_id === abierta);

  return (
    <main className="contenido" style={{ maxWidth: 1280 }}>
      <div className="fila entre envolver" style={{ marginBottom: 16 }}>
        <div>
          <h1>Caja</h1>
          <div className="fila accesos">
            <button onClick={() => setVentana('base')}>{turnoCaja ? '💵 Resumen y cierre' : 'Base'}</button>·
            <button onClick={() => setVentana('gastos')}>Gastos</button>·
            <button onClick={() => setVentana('tareas')}>Tareas</button>
          </div>
        </div>
        <div className="fila envolver">
          <button className={'btn ' + (horno.length ? 'btn-negro' : 'btn-suave')} onClick={() => setVentana('horno')}>
            🔥 Pizzas por hornear · {horno.length}
          </button>
          <button className="btn btn-principal" onClick={() => setVentana('pedido')}>＋ Nuevo pedido</button>
        </div>
      </div>

      {enviado && <div className="ok" style={{ marginBottom: 14 }}>{enviado}</div>}
      {!turnoCaja && (
        <div className="aviso" style={{ marginBottom: 14 }}>
          Falta registrar la base de este turno. <button className="enlace" onClick={() => setVentana('base')}>Registrar base</button>
        </div>
      )}

      <div className="caja-columnas">
        <section className="pila">
          <PedidosOnline sede={sede} />
          <div className="tarjeta">
            <h2 style={{ marginBottom: 12 }}>Por cobrar</h2>
            {porCobrar.length === 0 && <div className="texto-sec">No hay mesas con saldo pendiente.</div>}
            <div className="fila envolver" style={{ gap: 10 }}>
              {porCobrar.map((p) => (
                <button key={p.cuenta_id} className={'btn-mesa' + (abierta === p.cuenta_id ? ' activa' : '')}
                  onClick={() => setAbierta(abierta === p.cuenta_id ? null : p.cuenta_id)} aria-label={`Mesa ${mesa2(p.mesa)}`}>
                  {mesa2(p.mesa)}
                </button>
              ))}
            </div>
          </div>
          {cuentaAbierta && <CuentaMesa key={cuentaAbierta.cuenta_id} c={cuentaAbierta} onCerrar={() => setAbierta(null)} />}
        </section>

        <section>
          <VentaRapida sede={sede} productos={productos.filter((p) => p.formato === 'porcion')} todos={productos} />
        </section>
      </div>

      {ventana === 'horno' && (
        <Ventana titulo={`Pizzas por hornear · ${horno.length}`} onCerrar={() => setVentana(null)} ancho={760}>
          <ColaHorno comandas={horno} />
        </Ventana>
      )}
      {ventana === 'pedido' && <NuevoPedido sede={sede} productos={productos} onCerrar={() => setVentana(null)} onEnviado={setEnviado} />}
      {ventana === 'base' && <Base sede={sede} turno={turnoCaja} onCerrar={() => setVentana(null)} />}
      {ventana === 'gastos' && <Gastos sede={sede} onCerrar={() => setVentana(null)} />}
      {ventana === 'tareas' && (
        <Ventana titulo="Mis tareas" onCerrar={() => setVentana(null)}>
          <div className="pila">
            <MiTurno sede={sede} rol="caja" perfil={perfil} />
            <MisTareas sede={sede} rol="caja" perfil={perfil} compacto onAccion={(a) => a === 'registrar_base' && setVentana('base')} />
          </div>
        </Ventana>
      )}
    </main>
  );
}

// ───────── Una cuenta de mesa (solo una abierta a la vez) ─────────
function CuentaMesa({ c, onCerrar }: { c: PorCobrar; onCerrar: () => void }) {
  const [lineas, setLineas] = useState<{ id: string; nombre: string; cantidad: number; precio: number; observacion: string | null }[]>([]);
  const [medio, setMedio] = useState('efectivo');
  const [monto, setMonto] = useState(String(c.saldo));
  const [op, setOp] = useState(nuevaOperacion);
  const [estado, setEstado] = useState<'' | 'enviando' | 'incierto'>('');
  const [error, setError] = useState('');

  useEffect(() => { setMonto(String(c.saldo)); }, [c.saldo]);
  useEffect(() => {
    sb.from('lineas_pedido').select('id, cantidad, precio_unit, observacion, productos(nombre)')
      .eq('cuenta_id', c.cuenta_id).eq('estado', 'activa').order('id')
      .then(({ data }) => setLineas((data ?? []).map((l: any) => ({
        id: l.id, nombre: l.productos?.nombre, cantidad: +l.cantidad, precio: +l.precio_unit, observacion: l.observacion }))));
  }, [c.cuenta_id, c.total]);

  // Agrupa por producto para leerlo rápido
  const agrupadas = Object.values(lineas.reduce<Record<string, { nombre: string; cantidad: number; valor: number }>>((acc, l) => {
    const k = l.nombre + l.precio;
    acc[k] = acc[k] ?? { nombre: l.nombre, cantidad: 0, valor: 0 };
    acc[k].cantidad += l.cantidad; acc[k].valor += l.cantidad * l.precio;
    return acc;
  }, {}));

  async function cobrar() {
    setError(''); setEstado('enviando');
    try {
      await rpc('confirmar_cobro', { p_op: op, p_cuenta: c.cuenta_id, p_monto: Number(monto), p_medio: medio });
      setOp(nuevaOperacion()); setEstado('');
      if (Number(monto) >= c.saldo) onCerrar();
    } catch (e) {
      const m = (e as Error).message;
      if (/conexión/i.test(m)) { setEstado('incierto'); setError('No se sabe si el cobro quedó registrado.'); }
      else { setEstado(''); setError(m); }
    }
  }

  async function verificar() {
    setError('');
    try {
      const r = await rpc('consultar_operacion', { p_op: op });
      if (r) { setOp(nuevaOperacion()); setEstado(''); onCerrar(); }
      else { setEstado(''); setError('El cobro NO quedó registrado. Puedes intentarlo de nuevo.'); }
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="tarjeta pila">
      <div className="fila entre">
        <h2>Mesa {mesa2(c.mesa)}</h2>
        <button className="btn btn-suave" style={{ padding: '6px 12px' }} onClick={onCerrar}>Cerrar</button>
      </div>
      <div>
        {agrupadas.map((l, i) => (
          <div key={i} className="fila entre linea"><span><b>{l.nombre}</b> <span className="txt-mostaza">×{l.cantidad}</span></span><span>{plata(l.valor)}</span></div>
        ))}
        <div className="fila entre total"><span>Total</span><span>{plata(c.total)}</span></div>
        {c.pagado > 0 && <div className="fila entre texto-sec"><span>Ya pagado</span><span>{plata(c.pagado)}</span></div>}
        {c.pagado > 0 && <div className="fila entre total"><span>Saldo</span><span>{plata(c.saldo)}</span></div>}
      </div>
      <MedioPago valor={medio} onCambio={setMedio} />
      <div className="campo">
        <label>Valor que recibes (puede ser parcial)</label>
        <input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} />
      </div>
      {error && <div className="error">{error}</div>}
      {estado === 'incierto'
        ? <button className="btn btn-negro btn-ancho" onClick={verificar}>Verificar si quedó cobrado</button>
        : <button className="btn btn-principal btn-ancho btn-grande" disabled={estado === 'enviando' || !Number(monto)} onClick={cobrar}>
            {estado === 'enviando' ? 'Cobrando…' : `Confirmar cobro · ${plata(Number(monto))}`}
          </button>}
    </div>
  );
}

// ───────── Venta rápida de porciones (mostrador / para llevar) ─────────
function VentaRapida({ sede, productos, todos }: { sede: string; productos: Producto[]; todos: Producto[] }) {
  const [v, setV] = useGuardado<Venta>(`mp.caja.venta.${sede}`, ventaVacia());
  const [estado, setEstado] = useState<'' | 'enviando' | 'ok'>('');
  const [error, setError] = useState('');
  const total = totalCarrito(v.lineas, todos);
  const ocupado = useRef(false);
  useEffect(() => { borradorYaEnviado(v.op, v.lineas.length).then((ya) => { if (ya) setV(ventaVacia()); }); }, []);

  async function cobrar() {
    if (ocupado.current) return;
    ocupado.current = true;
    setError(''); setEstado('enviando');
    try {
      await rpc('cobrar_mostrador', { p_op: v.op, p_sede: sede, p_tipo: v.tipo, p_lineas: v.lineas, p_medio: v.medio });
      setV(ventaVacia()); setEstado('ok'); setTimeout(() => setEstado(''), 2500);
    } catch (e) { setEstado(''); setError((e as Error).message + ' · La venta sigue aquí; puedes reintentar sin que se duplique.'); }
    finally { ocupado.current = false; }
  }

  return (
    <div className="tarjeta pila">
      <h2>Venta rápida</h2>
      <Productos productos={productos} carrito={v.lineas} onCambio={(l) => setV({ ...v, lineas: l })} compacto />
      <Resumen productos={todos} carrito={v.lineas} onCambio={(l) => setV({ ...v, lineas: l })} />
      {v.lineas.length > 0 && <>
        <div className="fila" style={{ gap: 6 }}>
          {(['mostrador', 'llevar'] as const).map((t) => (
            <button key={t} className={'pastilla' + (v.tipo === t ? ' activa' : '')} onClick={() => setV({ ...v, tipo: t })}>
              {t === 'mostrador' ? 'Mostrador' : 'Para llevar'}
            </button>
          ))}
        </div>
        <MedioPago valor={v.medio} onCambio={(m) => setV({ ...v, medio: m })} />
      </>}
      {error && <div className="error">{error}</div>}
      {estado === 'ok' && <div className="ok">✓ Cobrado y enviado al horno</div>}
      <button className="btn btn-principal btn-ancho btn-grande" disabled={!v.lineas.length || estado === 'enviando'} onClick={cobrar}>
        {estado === 'enviando' ? 'Cobrando…' : `Confirmar cobro · ${plata(total)}`}
      </button>
      {v.lineas.length > 0 && <button className="enlace" onClick={() => setV(ventaVacia())}>Borrar venta</button>}
    </div>
  );
}

// ───────── Nuevo pedido desde Caja (mesa = se prepara y queda la cuenta abierta; mostrador = se cobra primero) ─────────
function NuevoPedido({ sede, productos, onCerrar, onEnviado }: { sede: string; productos: Producto[]; onCerrar: () => void; onEnviado: (m: string) => void }) {
  const [p, setP] = useGuardado<Pedido>(`mp.caja.pedido.${sede}`, pedidoVacio());
  const ocupado = useRef(false);
  // Si quedó un borrador viejo, se pregunta al servidor si YA se había enviado: si sí, se empieza vacío.
  useEffect(() => { borradorYaEnviado(p.op, p.lineas.length).then((ya) => { if (ya) setP(pedidoVacio()); }); }, []);
  const [mesas, setMesas] = useState<number[]>([]);
  const [tipo, setTipo] = useState<'pizza' | 'rapida' | 'bebida'>('pizza');
  const [estado, setEstado] = useState<'' | 'enviando'>('');
  const [error, setError] = useState('');
  useEffect(() => {
    sb.from('mesas').select('numero').eq('sede_id', sede).eq('activa', true).order('numero')
      .then(({ data }) => setMesas((data ?? []).map((m: any) => m.numero)));
  }, [sede]);
  const esMesa = p.destino.startsWith('mesa:');
  const total = totalCarrito(p.lineas, productos);

  async function enviar() {
    if (ocupado.current) return; // doble toque: no se manda dos veces
    ocupado.current = true;
    setError(''); setEstado('enviando');
    try {
      if (esMesa) await rpc('enviar_pedido_mesa', { p_op: p.op, p_sede: sede, p_mesa: Number(p.destino.slice(5)), p_lineas: p.lineas });
      else await rpc('cobrar_mostrador', { p_op: p.op, p_sede: sede, p_tipo: p.destino, p_lineas: p.lineas, p_medio: p.medio });
      const aviso = esMesa ? `✓ Pedido de la mesa ${mesa2(Number(p.destino.slice(5)))} enviado a preparación` : '✓ Cobrado y enviado a preparación';
      setP(pedidoVacio()); onEnviado(aviso); onCerrar();
    } catch (e) { setEstado(''); setError((e as Error).message + ' · El pedido sigue guardado: Pendiente de envío. Reintentar no lo duplica.'); }
    finally { ocupado.current = false; }
  }

  return (
    <Ventana titulo="Nuevo pedido" onCerrar={onCerrar} ancho={860}>
      <div className="pila">
        <div className="campo">
          <label>¿Para dónde?</label>
          <select value={p.destino} onChange={(e) => setP({ ...p, destino: e.target.value })}>
            <option value="mostrador">Mostrador (se cobra ya)</option>
            <option value="llevar">Para llevar (se cobra ya)</option>
            {mesas.map((m) => <option key={m} value={`mesa:${m}`}>Mesa {mesa2(m)} (se cobra al final)</option>)}
          </select>
        </div>
        <div className="fila" style={{ gap: 6 }}>
          {([['pizza', 'Pizzas'], ['rapida', 'Comidas rápidas'], ['bebida', 'Bebidas']] as const).map(([t, n]) => (
            <button key={t} className={'pastilla' + (tipo === t ? ' activa' : '')} onClick={() => setTipo(t)}>{n}</button>
          ))}
        </div>
        <Productos productos={productos.filter((x) => x.tipo === tipo)} carrito={p.lineas} onCambio={(l) => setP({ ...p, lineas: l })} />
        <Resumen productos={productos} carrito={p.lineas} onCambio={(l) => setP({ ...p, lineas: l })} conObservaciones />
        {!esMesa && p.lineas.length > 0 && <MedioPago valor={p.medio} onCambio={(m) => setP({ ...p, medio: m })} />}
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho btn-grande" disabled={!p.lineas.length || estado === 'enviando'} onClick={enviar}>
          {estado === 'enviando' ? 'Enviando…' : esMesa ? `Enviar pedido · ${plata(total)}` : `Confirmar cobro · ${plata(total)}`}
        </button>
      </div>
    </Ventana>
  );
}

/** ¿Ese borrador ya se había enviado antes (p. ej. se cerró la ventana justo al enviar)? */
async function borradorYaEnviado(op: string, lineas: number) {
  if (!lineas) return false;
  try { return !!(await rpc('consultar_operacion', { p_op: op })); } catch { return false; }
}

// ───────── Cola del horno ─────────
function ColaHorno({ comandas }: { comandas: ReturnType<typeof useComandas>['comandas'] }) {
  const [error, setError] = useState('');
  async function cambiar(id: string, estado: string) {
    setError('');
    try { await rpc('comanda_estado', { p_comanda: id, p_estado: estado }); } catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="pila">
      {error && <div className="error">{error}</div>}
      {comandas.length === 0 && <div className="texto-sec">No hay pizzas por hornear. 🎉</div>}
      <div className="rejilla-comandas">
        {comandas.map((c) => <TarjetaComanda key={c.id} c={c} onEstado={cambiar} />)}
      </div>
    </div>
  );
}

// ───────── Base del turno de caja · resumen financiero · cierre con conteo ─────────
type Resumen = {
  base: number; abierto_en: string;
  efectivo: { ventas: number; gastos: number; entradas: number; salidas: number; esperado: number };
  medios: { medio: string; total: number; pagos: number }[];
  nequi: { hora: string; monto: number; detalle: string }[];
  gastos_otros: number; vendido: number; cancelado: number; cobrado: number; pendiente: number;
  movimientos: { tipo: 'entrada' | 'salida'; monto: number; concepto: string; hora: string }[];
};
const MEDIOS: Record<string, string> = { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

function Base({ sede, turno, onCerrar }: { sede: string; turno: { base: number; efectivo_esperado: number; cobrado: number; gastos: number; abierto_en: string } | null; onCerrar: () => void }) {
  const [valor, setValor] = useState('');
  const [op] = useState(nuevaOperacion);
  const [error, setError] = useState('');
  async function guardar() {
    setError('');
    try { await rpc('registrar_base', { p_op: op, p_sede: sede, p_base: Number(valor) }); onCerrar(); }
    catch (e) { setError((e as Error).message); }
  }
  if (turno) return <ResumenTurno sede={sede} onCerrar={onCerrar} />;
  return (
    <Ventana titulo="Base de caja" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo">
          <label>Efectivo inicial para dar cambio</label>
          <input inputMode="numeric" autoFocus placeholder="$0" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho" disabled={!valor} onClick={guardar}>Registrar base · {plata(Number(valor))}</button>
      </div>
    </Ventana>
  );
}

function ResumenTurno({ sede, onCerrar }: { sede: string; onCerrar: () => void }) {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [mov, setMov] = useState<{ tipo: 'entrada' | 'salida'; monto: string; concepto: string; op: string } | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [cerrado, setCerrado] = useState<null | { diferencia: number }>(null);

  const cargar = useCallback(async () => {
    try { setR(await rpc<Resumen>('caja_resumen', { p_sede: sede })); } catch (e) { setError((e as Error).message); }
  }, [sede]);
  useEnVivo(`caja-resumen-${sede}`, [{ tabla: 'pagos', filtro: `sede_id=eq.${sede}` }, { tabla: 'gastos_caja', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);

  const n = (x: unknown) => Number(x ?? 0);
  const esperado = n(r?.efectivo.esperado);
  const dif = contado === '' ? null : Number(contado) - esperado;
  const textoDif = (d: number) => d === 0 ? '✓ Cuadra' : d < 0 ? `Faltan ${plata(-d)}` : `Sobran ${plata(d)}`;
  const claseDif = (d: number) => d === 0 ? 'estado-baja' : d < 0 ? 'estado-alta' : 'estado-media';

  async function guardarMov() {
    if (!mov) return;
    setError('');
    try {
      await rpc('caja_movimiento', { p_op: mov.op, p_sede: sede, p_tipo: mov.tipo, p_monto: Number(mov.monto), p_concepto: mov.concepto });
      setMov(null); cargar();
    } catch (e) { setError((e as Error).message); }
  }
  async function cerrar() {
    if (cerrando) return;
    setError(''); setCerrando(true);
    try {
      const c = await rpc<{ diferencia: number }>('cerrar_caja', { p_sede: sede, p_contado: Number(contado), p_observacion: obs || null });
      setCerrado({ diferencia: n(c.diferencia) });
    } catch (e) { setError((e as Error).message); } finally { setCerrando(false); }
  }

  const Fila = ({ t, v, fuerte, signo }: { t: string; v: number; fuerte?: boolean; signo?: '+' | '−' }) => (
    <div className={'fila entre linea' + (fuerte ? ' total' : '')}><span>{t}</span><span>{signo && v ? signo + ' ' : ''}{plata(v)}</span></div>
  );

  if (cerrado) return (
    <Ventana titulo="Caja cerrada" onCerrar={onCerrar}>
      <div className="pila" style={{ textAlign: 'center' }}>
        <div className={'estado ' + claseDif(cerrado.diferencia)} style={{ fontSize: 22, padding: '12px 18px', justifySelf: 'center' }}>{textoDif(cerrado.diferencia)}</div>
        <div className="texto-sec">El turno quedó cerrado y guardado. Para el siguiente turno se registra una base nueva.</div>
        <button className="btn btn-principal btn-ancho" onClick={onCerrar}>Listo</button>
      </div>
    </Ventana>
  );

  return (
    <Ventana titulo="Resumen del turno de caja" onCerrar={onCerrar} ancho={720}>
      {!r ? <div className="texto-sec">{error || 'Cargando…'}</div> : (
        <div className="pila">
          <div className="texto-sec">Turno abierto desde {hora(r.abierto_en)}</div>

          <div className="cifras">
            <div><span>Total vendido</span><b>{plata(n(r.vendido))}</b></div>
            <div><span>Total cobrado</span><b>{plata(n(r.cobrado))}</b></div>
            <div><span>Pendiente por cobrar</span><b>{plata(n(r.pendiente))}</b></div>
            <div><span>Ventas canceladas</span><b className="texto-sec">{plata(n(r.cancelado))}</b></div>
          </div>

          <div className="tarjeta">
            <h2 style={{ marginBottom: 6 }}>💵 Efectivo</h2>
            <Fila t="Base inicial" v={n(r.base)} />
            <Fila t="Ventas en efectivo" v={n(r.efectivo.ventas)} signo="+" />
            <Fila t="Gastos en efectivo" v={n(r.efectivo.gastos)} signo="−" />
            {n(r.efectivo.entradas) > 0 && <Fila t="Entradas de efectivo" v={n(r.efectivo.entradas)} signo="+" />}
            {n(r.efectivo.salidas) > 0 && <Fila t="Salidas de efectivo" v={n(r.efectivo.salidas)} signo="−" />}
            <Fila t="Efectivo esperado" v={esperado} fuerte />
            {r.movimientos.map((m, i) => (
              <div key={i} className="texto-sec" style={{ fontSize: 13 }}>{m.tipo === 'entrada' ? '↓ Entró' : '↑ Salió'} {plata(n(m.monto))} · {m.concepto} · {hora(m.hora)}</div>
            ))}
            {!mov ? (
              <div className="fila envolver" style={{ gap: 8, marginTop: 8 }}>
                <button className="enlace" onClick={() => setMov({ tipo: 'entrada', monto: '', concepto: '', op: nuevaOperacion() })}>＋ Entrada de efectivo</button>
                <button className="enlace" onClick={() => setMov({ tipo: 'salida', monto: '', concepto: '', op: nuevaOperacion() })}>－ Salida de efectivo</button>
              </div>
            ) : (
              <div className="pila" style={{ gap: 8, marginTop: 10 }}>
                <b>{mov.tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo'}</b>
                <div className="fila" style={{ gap: 8 }}>
                  <input inputMode="numeric" placeholder="$0" style={{ flex: 1 }} value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value.replace(/\D/g, '') })} />
                  <input placeholder="Motivo (ej: más cambio)" style={{ flex: 2 }} value={mov.concepto} onChange={(e) => setMov({ ...mov, concepto: e.target.value })} />
                </div>
                <div className="fila" style={{ gap: 8 }}>
                  <button className="btn btn-principal" disabled={!Number(mov.monto) || mov.concepto.trim().length < 3} onClick={guardarMov}>Registrar · {plata(Number(mov.monto))}</button>
                  <button className="btn btn-suave" onClick={() => setMov(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div className="tarjeta">
            <h2 style={{ marginBottom: 6 }}>📱 Nequi y otros medios</h2>
            <div className="texto-sec" style={{ fontSize: 13, marginBottom: 4 }}>No se suman al efectivo de la caja.</div>
            {r.medios.filter((m) => m.medio !== 'efectivo').length === 0 && <div className="texto-sec">Sin pagos por otros medios.</div>}
            {r.medios.filter((m) => m.medio !== 'efectivo').map((m) => (
              <div key={m.medio} className="fila entre linea"><span><b>{MEDIOS[m.medio] ?? m.medio}</b> <span className="texto-sec">· {m.pagos} {m.pagos === 1 ? 'pago' : 'pagos'}</span></span><span>{plata(n(m.total))}</span></div>
            ))}
            {r.nequi.length > 0 && <details style={{ marginTop: 6 }}>
              <summary className="texto-sec" style={{ cursor: 'pointer', fontWeight: 700 }}>Ver pagos por Nequi</summary>
              {r.nequi.map((x, i) => <div key={i} className="fila entre texto-sec" style={{ fontSize: 13 }}><span>{hora(x.hora)} · {x.detalle}</span><span>{plata(n(x.monto))}</span></div>)}
            </details>}
            {n(r.gastos_otros) > 0 && <div className="texto-sec" style={{ fontSize: 13, marginTop: 6 }}>Gastos pagados por otros medios: {plata(n(r.gastos_otros))}</div>}
          </div>

          <div className="tarjeta pila">
            <h2>🔒 Cerrar caja</h2>
            <div className="campo">
              <label>Efectivo real contado</label>
              <input inputMode="numeric" placeholder="$0" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, ''))} />
            </div>
            {dif !== null && (
              <div className="fila entre"><span className="texto-sec">Esperado {plata(esperado)} · Contado {plata(Number(contado))}</span>
                <span className={'estado ' + claseDif(dif)} style={{ fontSize: 16 }}>{textoDif(dif)}</span></div>
            )}
            {dif !== null && dif !== 0 && (
              <div className="campo"><label>Observación (obligatoria si no cuadra)</label>
                <input placeholder="Ej: se dio mal un cambio" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            )}
            {error && <div className="error">{error}</div>}
            <button className="btn btn-negro btn-ancho" disabled={contado === '' || cerrando || (dif !== 0 && obs.trim().length < 3)} onClick={cerrar}>
              {cerrando ? 'Cerrando…' : 'Confirmar cierre de caja'}
            </button>
          </div>
        </div>
      )}
    </Ventana>
  );
}

// ───────── Gastos ─────────
const CATEGORIAS_GASTO = ['Insumos', 'Aseo', 'Empaques', 'Transporte', 'Servicios', 'Personal', 'Otro'];

function Gastos({ sede, onCerrar }: { sede: string; onCerrar: () => void }) {
  const [f, setF] = useState({ categoria: 'Insumos', concepto: '', valor: '', responsable: '', medio: 'efectivo' });
  const [op, setOp] = useState(nuevaOperacion);
  const [lista, setLista] = useState<any[]>([]);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    const { data } = await sb.from('gastos_caja').select('id, categoria, concepto, valor, medio, creado_en, perfiles(nombre)')
      .eq('sede_id', sede).order('creado_en', { ascending: false }).limit(15);
    setLista(data ?? []);
  }, [sede]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError('');
    try {
      await rpc('registrar_gasto', { p_op: op, p_sede: sede, p_categoria: f.categoria, p_concepto: f.concepto,
        p_valor: Number(f.valor), p_responsable: f.responsable || null, p_medio: f.medio });
      setF({ ...f, concepto: '', valor: '', responsable: '' }); setOp(nuevaOperacion()); cargar();
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <Ventana titulo="Gastos" onCerrar={onCerrar}>
      <div className="pila">
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}>
            <label>Categoría</label>
            <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo" style={{ flex: 1 }}>
            <label>Valor</label>
            <input inputMode="numeric" placeholder="$0" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
        <div className="campo"><label>Concepto</label><input placeholder="Ej: Hielo" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} /></div>
        <div className="campo"><label>Responsable (quién lo recibió)</label><input value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} /></div>
        <MedioPago valor={f.medio} onCambio={(m) => setF({ ...f, medio: m })} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho" disabled={!f.concepto || !f.valor} onClick={guardar}>Registrar gasto · {plata(Number(f.valor))}</button>
        {lista.length > 0 && <div>
          <div className="texto-sec" style={{ fontWeight: 700, margin: '6px 0' }}>Últimos gastos</div>
          {lista.map((g) => (
            <div key={g.id} className="fila entre linea">
              <span><b>{g.concepto}</b> <span className="texto-sec">· {g.categoria} · {g.medio} · {hora(g.creado_en)} · {g.perfiles?.nombre}</span></span>
              <span>{plata(g.valor)}</span>
            </div>
          ))}
        </div>}
      </div>
    </Ventana>
  );
}
