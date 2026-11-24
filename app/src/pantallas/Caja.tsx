import { useCallback, useEffect, useState } from 'react';
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

  const cuentaAbierta = porCobrar.find((p) => p.cuenta_id === abierta);

  return (
    <main className="contenido" style={{ maxWidth: 1280 }}>
      <div className="fila entre envolver" style={{ marginBottom: 16 }}>
        <div>
          <h1>Caja</h1>
          <div className="fila accesos">
            <button onClick={() => setVentana('base')}>Base{turnoCaja ? ` · ${plata(turnoCaja.base)}` : ''}</button>·
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
      {ventana === 'pedido' && <NuevoPedido sede={sede} productos={productos} onCerrar={() => setVentana(null)} />}
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

  async function cobrar() {
    setError(''); setEstado('enviando');
    try {
      await rpc('cobrar_mostrador', { p_op: v.op, p_sede: sede, p_tipo: v.tipo, p_lineas: v.lineas, p_medio: v.medio });
      setV(ventaVacia()); setEstado('ok'); setTimeout(() => setEstado(''), 2500);
    } catch (e) { setEstado(''); setError((e as Error).message + ' · La venta sigue aquí; puedes reintentar sin que se duplique.'); }
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
function NuevoPedido({ sede, productos, onCerrar }: { sede: string; productos: Producto[]; onCerrar: () => void }) {
  const [p, setP] = useGuardado<Pedido>(`mp.caja.pedido.${sede}`, pedidoVacio());
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
    setError(''); setEstado('enviando');
    try {
      if (esMesa) await rpc('enviar_pedido_mesa', { p_op: p.op, p_sede: sede, p_mesa: Number(p.destino.slice(5)), p_lineas: p.lineas });
      else await rpc('cobrar_mostrador', { p_op: p.op, p_sede: sede, p_tipo: p.destino, p_lineas: p.lineas, p_medio: p.medio });
      setP(pedidoVacio()); onCerrar();
    } catch (e) { setEstado(''); setError((e as Error).message + ' · El pedido sigue guardado: Pendiente de envío.'); }
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

// ───────── Base del turno de caja ─────────
function Base({ sede, turno, onCerrar }: { sede: string; turno: { base: number; efectivo_esperado: number; cobrado: number; gastos: number; abierto_en: string } | null; onCerrar: () => void }) {
  const [valor, setValor] = useState('');
  const [op] = useState(nuevaOperacion);
  const [error, setError] = useState('');
  async function guardar() {
    setError('');
    try { await rpc('registrar_base', { p_op: op, p_sede: sede, p_base: Number(valor) }); onCerrar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function cerrarCaja() {
    if (!confirm('¿Cerrar el turno de caja? Después se registra una base nueva.')) return;
    try { await rpc('cerrar_caja', { p_sede: sede }); onCerrar(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <Ventana titulo="Base de caja" onCerrar={onCerrar}>
      {turno ? (
        <div className="pila">
          <div className="texto-sec">Turno de caja abierto desde {hora(turno.abierto_en)}</div>
          <div className="cifras">
            <div><span>Base</span><b>{plata(turno.base)}</b></div>
            <div><span>Cobrado</span><b>{plata(turno.cobrado)}</b></div>
            <div><span>Gastos</span><b>{plata(turno.gastos)}</b></div>
            <div><span>Efectivo esperado</span><b>{plata(turno.efectivo_esperado)}</b></div>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-negro" onClick={cerrarCaja}>Cerrar turno de caja</button>
        </div>
      ) : (
        <div className="pila">
          <div className="campo">
            <label>Efectivo inicial para dar cambio</label>
            <input inputMode="numeric" autoFocus placeholder="$0" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-principal btn-ancho" disabled={!valor} onClick={guardar}>Registrar base · {plata(Number(valor))}</button>
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
