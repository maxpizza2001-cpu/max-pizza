import { useCallback, useEffect, useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../lib/supabase';
import { hora, mesa2, plata } from '../lib/formato';
import { aComanda, pitar, useCatalogo, useComandas, useEnVivo, useGuardado, type Comanda, type LineaCarrito } from '../lib/datos';
import { Productos, Resumen, TarjetaComanda, totalCarrito, Ventana } from '../componentes/Piezas';
import { MisTareas } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';
import { useAbrir } from '../lib/abrir';

type Mesa = { numero: number; cuenta: null | { id: string; estado: 'abierta' | 'pagada'; total: number; pagado: number } };
type Borrador = { lineas: LineaCarrito[]; op: string; pendiente?: boolean };

export function Mesero({ sede, perfil }: { sede: string; perfil: string }) {
  const [pestana, setPestana] = useState<'mesas' | 'tareas' | 'stock'>('mesas');
  const [mesaAbierta, setMesaAbierta] = useState<number | null>(null);
  const [portapizzas, setPortapizzas] = useState(false);
  const { comandas: listos } = useComandas(sede, { estados: ['lista'] });

  const [abrir, listoAbrir] = useAbrir('comanda');   // tocó el aviso "pedido listo"
  useEffect(() => {
    if (!abrir || !listos.some((c) => c.id === abrir)) return;
    setPestana('mesas');
    setTimeout(() => document.getElementById('listo-' + abrir)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    const t = setTimeout(listoAbrir, 8000); return () => clearTimeout(t);
  }, [abrir, listos.length]);
  const [vistos, setVistos] = useState(0);
  useEffect(() => { if (listos.length > vistos) pitar(); setVistos(listos.length); }, [listos.length]);

  async function entregar(id: string) {
    try { await rpc('comanda_estado', { p_comanda: id, p_estado: 'entregada' }); } catch (e) { alert((e as Error).message); }
  }

  return (
    <main className="contenido pila" style={{ maxWidth: 640 }}>
      {listos.length > 0 && (
        <div className="listos">
          <div className="titulo" style={{ fontSize: 16, marginBottom: 8 }}>🔔 Listos para llevar · {listos.length}</div>
          <div className="pila" style={{ gap: 10 }}>
            {listos.map((c) => <div key={c.id} id={'listo-' + c.id} style={abrir === c.id ? { outline: '3px solid #E3A21A', borderRadius: 16 } : undefined}><TarjetaComanda c={c} onEstado={entregar} botonesMesero /></div>)}
          </div>
        </div>
      )}

      {pestana === 'mesas' && (mesaAbierta == null
        ? <Mesas sede={sede} onAbrir={setMesaAbierta} />
        : <DetalleMesa sede={sede} numero={mesaAbierta} onVolver={() => setMesaAbierta(null)} />)}
      {pestana === 'tareas' && (
        <>
          <h1>Mis tareas</h1>
          <MiTurno sede={sede} rol="mesero" perfil={perfil} />
          <MisTareas sede={sede} rol="mesero" perfil={perfil} onAccion={(a) => a === 'portapizzas' && setPortapizzas(true)} />
        </>
      )}
      {pestana === 'stock' && <Stock sede={sede} onArmar={() => setPortapizzas(true)} />}

      {portapizzas && <ArmarPortapizzas sede={sede} onCerrar={() => setPortapizzas(false)} />}

      <nav className="nav-inferior">
        {([['mesas', '🍽', 'Mesas'], ['tareas', '☑', 'Mis tareas'], ['stock', '📦', 'Stock']] as const).map(([k, ic, t]) => (
          <button key={k} className={pestana === k ? 'activo' : ''} onClick={() => setPestana(k)}>
            <span style={{ fontSize: 20 }}>{ic}</span>{t}
          </button>
        ))}
      </nav>
    </main>
  );
}

// ───────── Mesas de la sede ─────────
function Mesas({ sede, onAbrir }: { sede: string; onAbrir: (n: number) => void }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const cargar = useCallback(async () => {
    const [{ data: ms }, { data: cs }] = await Promise.all([
      sb.from('mesas').select('id, numero').eq('sede_id', sede).eq('activa', true).order('numero'),
      sb.from('cuentas').select('id, mesa_id, estado, total, pagado').eq('sede_id', sede).eq('tipo', 'mesa').in('estado', ['abierta', 'pagada']),
    ]);
    setMesas((ms ?? []).map((m: any) => {
      const c = (cs ?? []).find((x: any) => x.mesa_id === m.id);
      return { numero: m.numero, cuenta: c ? { id: c.id, estado: c.estado, total: +c.total, pagado: +c.pagado } : null };
    }));
  }, [sede]);
  useEnVivo(`mesas-${sede}`, [{ tabla: 'cuentas', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <h1>Mesas</h1>
      <div className="rejilla-mesas">
        {mesas.map((m) => (
          <button key={m.numero} className={'mesa ' + (m.cuenta ? (m.cuenta.estado === 'pagada' ? 'pagada' : 'ocupada') : 'libre')} onClick={() => onAbrir(m.numero)}>
            <span className="mesa-num">{mesa2(m.numero)}</span>
            <span className="mesa-estado">
              {!m.cuenta ? 'Libre' : m.cuenta.estado === 'pagada' ? 'Pagada · liberar' : `Ocupada · ${plata(m.cuenta.total - m.cuenta.pagado)}`}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ───────── Una mesa: cuenta, lo que está listo, tomar pedido ─────────
function DetalleMesa({ sede, numero, onVolver }: { sede: string; numero: number; onVolver: () => void }) {
  const productos = useCatalogo(sede);
  const [cuenta, setCuenta] = useState<null | { id: string; estado: string; total: number; pagado: number }>(null);
  const [envios, setEnvios] = useState<{ numero: number; enviado_en: string; comandas: Comanda[]; sueltas: { id: string; cantidad: number; producto: string; estado: string; observacion: string | null }[] }[]>([]);
  const [tomando, setTomando] = useState(false);
  const [b, setB] = useGuardado<Borrador>(`mp.mesero.${sede}.mesa${numero}`, { lineas: [], op: nuevaOperacion() });
  const [estado, setEstado] = useState<'' | 'enviando' | 'enviado'>('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data: m } = await sb.from('mesas').select('id').eq('sede_id', sede).eq('numero', numero).single();
    if (!m) return;
    const { data: c } = await sb.from('cuentas').select('id, estado, total, pagado').eq('mesa_id', m.id).in('estado', ['abierta', 'pagada']).maybeSingle();
    setCuenta(c ? { ...c, total: +c.total, pagado: +c.pagado } : null);
    if (!c) { setEnvios([]); return; }
    const { data: ps } = await sb.from('pedidos').select(`numero, enviado_en,
      comandas(id, estado, creada_en, empezada_en, lista_en, estaciones(codigo), pedidos(numero, cuenta_id, cuentas(tipo, mesas(numero))),
        lineas_comanda(cancelada, lineas_pedido(id, cantidad, observacion, productos(nombre)))),
      lineas_pedido(id, cantidad, estado, observacion, productos(nombre, estacion))`).eq('cuenta_id', c.id).order('numero');
    setEnvios((ps ?? []).map((p: any) => ({
      numero: p.numero, enviado_en: p.enviado_en,
      comandas: (p.comandas ?? []).map(aComanda),
      sueltas: (p.lineas_pedido ?? []).filter((l: any) => l.productos?.estacion === 'ninguna')
        .map((l: any) => ({ id: l.id, cantidad: +l.cantidad, producto: l.productos.nombre, estado: l.estado, observacion: l.observacion })),
    })));
  }, [sede, numero]);
  useEnVivo(`mesa-${sede}-${numero}`, [
    { tabla: 'cuentas', filtro: `sede_id=eq.${sede}` }, { tabla: 'comandas', filtro: `sede_id=eq.${sede}` },
  ], cargar);
  useEffect(() => { cargar(); }, [cargar]);

  // Si había un borrador sin enviar, se abre directo
  useEffect(() => { if (b.lineas.length) setTomando(true); }, []);

  async function enviar() {
    setError(''); setEstado('enviando');
    try {
      await rpc('enviar_pedido_mesa', { p_op: b.op, p_sede: sede, p_mesa: numero, p_lineas: b.lineas });
      setB({ lineas: [], op: nuevaOperacion() }); setEstado('enviado'); setTomando(false); cargar();
      setTimeout(() => setEstado(''), 2500);
    } catch (e) {
      setB({ ...b, pendiente: true }); setEstado('');
      setError((e as Error).message);
    }
  }

  async function liberar() {
    if (!cuenta) return;
    try { await rpc('liberar_mesa', { p_cuenta: cuenta.id }); onVolver(); } catch (e) { setError((e as Error).message); }
  }

  async function cancelar(lineaId: string, nombre: string) {
    const motivo = prompt(`¿Por qué se cancela ${nombre}?`, 'El cliente cambió de opinión');
    if (motivo == null) return;
    try { await rpc('cancelar_linea', { p_linea: lineaId, p_motivo: motivo }); cargar(); } catch (e) { setError((e as Error).message); }
  }

  const estadoTxt: Record<string, string> = { nueva: 'En cola', en_preparacion: 'Preparando', lista: '✓ Lista', entregada: 'Entregada', cancelada: 'Cancelada' };

  return (
    <div className="pila">
      <div className="fila entre">
        <button className="btn btn-suave" onClick={onVolver}>← Mesas</button>
        {cuenta && <span className={'estado ' + (cuenta.estado === 'pagada' ? 'estado-lista' : 'estado-media')}>
          {cuenta.estado === 'pagada' ? '✓ Pagada' : `Saldo ${plata(cuenta.total - cuenta.pagado)}`}</span>}
      </div>
      <h1 style={{ fontSize: 40 }}>Mesa {mesa2(numero)}</h1>

      {estado === 'enviado' && <div className="ok">✓ Enviado a preparación</div>}
      {b.pendiente && !tomando && <div className="aviso">Pendiente de envío. <button className="enlace" onClick={() => setTomando(true)}>Revisar y reintentar</button></div>}

      {!tomando && (
        <button className="btn btn-principal btn-ancho btn-grande" onClick={() => setTomando(true)}>
          📝 {cuenta ? 'Agregar al pedido' : 'Tomar pedido'}
        </button>
      )}

      {tomando && (
        <div className="tarjeta pila">
          <h2>{cuenta ? 'Agregar a la cuenta' : 'Nuevo pedido'}</h2>
          <Catalogo productos={productos} lineas={b.lineas} onCambio={(l) => setB({ ...b, lineas: l })} />
          <Resumen productos={productos} carrito={b.lineas} onCambio={(l) => setB({ ...b, lineas: l })} conObservaciones />
          {b.pendiente && <div className="aviso">Pendiente de envío: no se pudo confirmar. Al reintentar no se duplica.</div>}
          {error && <div className="error">{error}</div>}
          <button className="btn btn-principal btn-ancho btn-grande" disabled={!b.lineas.length || estado === 'enviando'} onClick={enviar}>
            {estado === 'enviando' ? 'Enviando…' : `Enviar pedido · ${plata(totalCarrito(b.lineas, productos))}`}
          </button>
          <button className="enlace" onClick={() => setTomando(false)}>Seguir después (queda guardado)</button>
        </div>
      )}

      {cuenta && envios.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>Cuenta</h2>
          {envios.map((e) => (
            <div key={e.numero} className="envio">
              <div className="texto-sec" style={{ fontWeight: 700 }}>Envío #{e.numero} · {hora(e.enviado_en)}</div>
              {e.comandas.flatMap((c) => c.lineas.map((l) => (
                <div key={l.id} className={'fila entre linea' + (l.cancelada ? ' cancelada' : '')}>
                  <span><b>{l.cantidad}×</b> {l.producto}{l.observacion && <span className="texto-sec"> · {l.observacion}</span>}</span>
                  <span className="fila" style={{ gap: 6 }}>
                    <span className={'estado ' + (c.estado === 'lista' ? 'estado-lista' : c.estado === 'entregada' ? 'estado-proceso' : 'estado-media')}>
                      {l.cancelada ? 'Cancelada' : estadoTxt[c.estado]}</span>
                    {!l.cancelada && cuenta.estado === 'abierta' && c.estado !== 'entregada' &&
                      <button className="enlace" aria-label="Cancelar" onClick={() => cancelar(l.id, l.producto)}>✕</button>}
                  </span>
                </div>
              )))}
              {e.sueltas.map((l) => (
                <div key={l.id} className={'fila entre linea' + (l.estado === 'cancelada' ? ' cancelada' : '')}>
                  <span><b>{l.cantidad}×</b> {l.producto}</span>
                  <span className="estado estado-proceso">{l.estado === 'cancelada' ? 'Cancelada' : 'Bebida'}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="fila entre total"><span>Total</span><span>{plata(cuenta.total)}</span></div>
          <div className="texto-sec" style={{ marginTop: 6 }}>El cliente paga en Caja con la ficha de la mesa.</div>
        </div>
      )}

      {cuenta?.estado === 'pagada' && (
        <button className="btn btn-negro btn-ancho btn-grande" onClick={liberar}>Liberar mesa</button>
      )}
    </div>
  );
}

function Catalogo({ productos, lineas, onCambio }: { productos: ReturnType<typeof useCatalogo>; lineas: LineaCarrito[]; onCambio: (l: LineaCarrito[]) => void }) {
  const [tipo, setTipo] = useState<'pizza' | 'rapida' | 'bebida'>('pizza');
  return (
    <>
      <div className="fila" style={{ gap: 6 }}>
        {([['pizza', 'Pizzas'], ['rapida', 'Comidas rápidas'], ['bebida', 'Bebidas']] as const).map(([t, n]) => (
          <button key={t} className={'pastilla' + (tipo === t ? ' activa' : '')} onClick={() => setTipo(t)}>{n}</button>
        ))}
      </div>
      <Productos productos={productos.filter((p) => p.tipo === tipo)} carrito={lineas} onCambio={onCambio} />
    </>
  );
}

// ───────── Stock de servicio y aseo ─────────
function Stock({ sede, onArmar }: { sede: string; onArmar: () => void }) {
  const [items, setItems] = useState<{ insumo_id: string; insumo: string; unidad: string; disponible: number; insumo_codigo: string }[]>([]);
  const [msg, setMsg] = useState('');
  const cargar = useCallback(async () => {
    const { data } = await sb.from('v_saldos').select('insumo_id, insumo, insumo_codigo, unidad, disponible')
      .eq('sede_id', sede).eq('ubicacion', 'servicio').order('insumo');
    setItems((data ?? []).map((x: any) => ({ ...x, disponible: +x.disponible })));
  }, [sede]);
  useEnVivo(`stock-servicio-${sede}`, [{ tabla: 'saldos_stock', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);

  async function reportar(i: { insumo_id: string; insumo: string; unidad: string }, tipo: 'queda_poco' | 'se_acabo' | 'conteo') {
    let conteo: number | null = null;
    if (tipo === 'conteo') {
      const r = prompt(`¿Cuántos ${i.unidad} de ${i.insumo} contaste?`);
      if (r == null || r.trim() === '' || isNaN(Number(r))) return;
      conteo = Number(r);
    }
    try {
      await rpc('reportar_stock', { p_sede: sede, p_ubicacion: 'servicio', p_insumo: i.insumo_id, p_tipo: tipo, p_conteo: conteo });
      setMsg(`✓ Reporte de ${i.insumo} enviado a Administración`); setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg((e as Error).message); }
  }

  const cantidad = (n: number, u: string) => u === 'ml' ? (n >= 1000 ? `${(n / 1000).toLocaleString('es-CO')} L` : `${n} ml`) : `${n.toLocaleString('es-CO')}`;

  return (
    <>
      <h1>Stock</h1>
      <div className="texto-sec">Servicio y aseo de esta sede</div>
      {msg && <div className="ok">{msg}</div>}
      {items.map((i) => (
        <div key={i.insumo_id} className="tarjeta pila" style={{ gap: 10 }}>
          <div className="fila entre">
            <b style={{ fontSize: 17 }}>{i.insumo}</b>
            <span className="titulo" style={{ fontSize: 22 }}>{cantidad(i.disponible, i.unidad)}</span>
          </div>
          <div className="fila envolver" style={{ gap: 6 }}>
            <button className="pastilla" onClick={() => reportar(i, 'queda_poco')}>Queda poco</button>
            <button className="pastilla" onClick={() => reportar(i, 'se_acabo')}>Se acabó</button>
            <button className="pastilla" onClick={() => reportar(i, 'conteo')}>Reportar conteo</button>
            {i.insumo_codigo === 'portapizza' && <button className="pastilla activa" onClick={onArmar}>Armar portapizzas</button>}
          </div>
        </div>
      ))}
    </>
  );
}

function ArmarPortapizzas({ sede, onCerrar }: { sede: string; onCerrar: () => void }) {
  const [n, setN] = useState('');
  const [op, setOp] = useState(nuevaOperacion);
  const [error, setError] = useState('');
  async function guardar() {
    setError('');
    try {
      const r = await rpc<{ ok?: boolean; error?: string }>('armar_portapizzas', { p_op: op, p_sede: sede, p_cantidad: Number(n) });
      if (r && r.ok === false) { setError(r.error ?? 'No se pudo'); setOp(nuevaOperacion()); return; }
      onCerrar();
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <Ventana titulo="Armar portapizzas" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo">
          <label>¿Cuántos armaste?</label>
          <input inputMode="numeric" autoFocus value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="texto-sec">Se descuentan los cartones y suben los portapizzas armados.</div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho" disabled={!Number(n)} onClick={guardar}>Registrar {n || 0} portapizzas</button>
      </div>
    </Ventana>
  );
}
