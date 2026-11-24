// Caja · pedidos que llegan de la tienda online (/pedir): confirmar, revisar comprobante, cobrar, despachar y entregar.
import { useCallback, useEffect, useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../lib/supabase';
import { hora, plata } from '../lib/formato';
import { pitar, useEnVivo } from '../lib/datos';
import { Ventana } from './Piezas';

export type PedidoOnline = {
  id: string; codigo: string; nombre: string; celular: string; entrega: 'domicilio' | 'recoger';
  direccion: string | null; barrio: string | null; referencia: string | null; indicaciones: string | null;
  medio: string; paga_con: number | null; subtotal: number; domicilio: number; total: number;
  comprobante: string | null; comprobante_estado: string; estado: string; domiciliario: string | null;
  creado_en: string; salio_en: string | null; cuenta_id: string; pedido_id: string;
  pagado: number; numero: number; zona: string | null;
};

export const ESTADOS: Record<string, [string, string]> = {
  recibido: ['Nuevo', 'estado-alta'], confirmado: ['Confirmado', 'estado-media'], en_preparacion: ['En preparación', 'estado-proceso'],
  listo: ['✓ Listo', 'estado-lista'], en_camino: ['🛵 En camino', 'estado-media'], entregado: ['Entregado', 'estado-baja'],
  cancelado: ['Cancelado', 'estado-proceso'],
};
const MEDIO: Record<string, string> = { efectivo: 'Efectivo', nequi: 'Nequi', transferencia: 'Transferencia' };

export function usePedidosOnline(sede: string) {
  const [lista, setLista] = useState<PedidoOnline[]>([]);
  const cargar = useCallback(async () => {
    const hace = new Date(Date.now() - 20 * 3600e3).toISOString();
    const { data } = await sb.from('pedidos_online')
      .select('*, cuentas(pagado), pedidos(numero), zonas_domicilio(nombre)')
      .eq('sede_id', sede).gte('creado_en', hace).order('creado_en', { ascending: false });
    setLista((data ?? []).map((p: any) => ({
      ...p, subtotal: +p.subtotal, domicilio: +p.domicilio, total: +p.total, paga_con: p.paga_con == null ? null : +p.paga_con,
      pagado: +(p.cuentas?.pagado ?? 0), numero: p.pedidos?.numero, zona: p.zonas_domicilio?.nombre ?? null,
    })));
  }, [sede]);
  useEnVivo(`online-${sede}`, [{ tabla: 'pedidos_online', filtro: `sede_id=eq.${sede}` }, { tabla: 'cuentas', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return lista;
}

/** Tarjeta de Caja con los pedidos online activos (y los cerrados recientes, plegados). */
export function PedidosOnline({ sede }: { sede: string }) {
  const lista = usePedidosOnline(sede);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);
  const activos = lista.filter((p) => !['entregado', 'cancelado'].includes(p.estado) || (p.estado === 'entregado' && p.pagado < p.total));
  const cerrados = lista.filter((p) => !activos.includes(p));
  const nuevos = lista.filter((p) => p.estado === 'recibido').length;
  const [vistos, setVistos] = useState(nuevos);
  useEffect(() => { if (nuevos > vistos) pitar(); setVistos(nuevos); }, [nuevos]);
  const sel = lista.find((p) => p.id === abierto);

  return (
    <div className="tarjeta">
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>🛵 Pedidos online</h2>
        {nuevos > 0 && <span className="estado estado-alta">{nuevos} nuevo{nuevos > 1 ? 's' : ''}</span>}
      </div>
      {activos.length === 0 && <div className="texto-sec">No hay pedidos online pendientes.</div>}
      <div className="pila" style={{ gap: 8 }}>
        {activos.map((p) => <Fila key={p.id} p={p} onAbrir={() => setAbierto(p.id)} />)}
      </div>
      {cerrados.length > 0 && <>
        <button className="enlace" style={{ marginTop: 10 }} onClick={() => setVerCerrados(!verCerrados)}>
          {verCerrados ? 'Ocultar' : 'Ver'} cerrados de hoy ({cerrados.length})
        </button>
        {verCerrados && <div className="pila" style={{ gap: 8, marginTop: 8 }}>{cerrados.map((p) => <Fila key={p.id} p={p} onAbrir={() => setAbierto(p.id)} />)}</div>}
      </>}
      {sel && <Detalle p={sel} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

function Fila({ p, onAbrir }: { p: PedidoOnline; onAbrir: () => void }) {
  const [txt, cls] = ESTADOS[p.estado] ?? [p.estado, 'estado-proceso'];
  const debe = p.total - p.pagado;
  return (
    <button className="online-fila" onClick={onAbrir}>
      <div className="fila entre">
        <b>#{p.numero} · {p.nombre}</b>
        <span className={'estado ' + cls}>{txt}</span>
      </div>
      <div className="fila entre texto-sec" style={{ fontSize: 13 }}>
        <span>{hora(p.creado_en)} · {p.entrega === 'domicilio' ? `🛵 ${p.barrio}` : '🏪 Recoge'} · {MEDIO[p.medio]}
          {p.comprobante_estado === 'pendiente' && <b className="txt-rojo"> · revisar pago</b>}</span>
        <span>{debe > 0 ? <b>{plata(p.total)}</b> : <span style={{ color: 'var(--verde)', fontWeight: 700 }}>✓ Pagado</span>}</span>
      </div>
    </button>
  );
}

function Detalle({ p, onCerrar }: { p: PedidoOnline; onCerrar: () => void }) {
  const [lineas, setLineas] = useState<{ nombre: string; cantidad: number; precio: number; obs: string | null }[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [domiciliario, setDomiciliario] = useState(p.domiciliario ?? '');
  const [op, setOp] = useState(nuevaOperacion);
  const [urlComp, setUrlComp] = useState('');
  const saldo = p.total - p.pagado;

  useEffect(() => {
    sb.from('lineas_pedido').select('cantidad, precio_unit, observacion, estado, productos(nombre)').eq('pedido_id', p.pedido_id).order('id')
      .then(({ data }) => setLineas((data ?? []).filter((l: any) => l.estado === 'activa').map((l: any) => ({
        nombre: l.productos?.nombre, cantidad: +l.cantidad, precio: +l.precio_unit,
        obs: (l.observacion ?? '').replace(/^ONLINE( · )?/, '') || null }))));
    if (p.comprobante) sb.storage.from('comprobantes').createSignedUrl(p.comprobante, 3600).then(({ data }) => setUrlComp(data?.signedUrl ?? ''));
  }, [p.pedido_id, p.comprobante]);

  async function hacer(fn: () => Promise<unknown>) {
    setError(''); setOcupado(true);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  }
  const estado = (e: string, extra: Record<string, unknown> = {}) => hacer(() => rpc('online_estado', { p_id: p.id, p_estado: e, ...extra }));
  const cobrar = () => hacer(async () => {
    await rpc('confirmar_cobro', { p_op: op, p_cuenta: p.cuenta_id, p_monto: saldo, p_medio: p.medio });
    setOp(nuevaOperacion());
  });
  const cancelar = () => {
    const motivo = window.prompt('¿Por qué se cancela? (se guarda en el pedido)');
    if (motivo != null) estado('cancelado', { p_motivo: motivo || 'Cancelado por Caja' });
  };
  const cerrado = ['entregado', 'cancelado'].includes(p.estado);
  const [txt, cls] = ESTADOS[p.estado] ?? [p.estado, ''];

  return (
    <Ventana titulo={`Pedido online #${p.numero} · ${p.codigo}`} onCerrar={onCerrar} ancho={620}>
      <div className="pila">
        <div className="fila entre"><span className={'estado ' + cls}>{txt}</span><span className="texto-sec">Llegó {hora(p.creado_en)}</span></div>

        <div className="online-cliente">
          <b>{p.nombre}</b> · <a href={`tel:${p.celular}`}>{p.celular}</a>
          {' · '}<a href={`https://wa.me/57${p.celular}`} target="_blank" rel="noreferrer">WhatsApp</a>
          {p.entrega === 'domicilio'
            ? <div>🛵 {p.direccion} · <b>{p.barrio}</b>{p.zona ? ` · ${p.zona}` : ''}{p.referencia && <div className="texto-sec">{p.referencia}</div>}</div>
            : <div>🏪 Recoge en el local</div>}
          {p.indicaciones && <div className="txt-rojo">“{p.indicaciones}”</div>}
        </div>

        <div>
          {lineas.map((l, i) => (
            <div key={i} className="fila entre linea">
              <span><b>{l.nombre}</b> <span className="txt-mostaza">×{l.cantidad}</span>{l.obs && <div className="txt-rojo" style={{ fontSize: 13 }}>{l.obs}</div>}</span>
              <span>{plata(l.cantidad * l.precio)}</span>
            </div>
          ))}
          {p.domicilio > 0 && <div className="fila entre linea"><span>Domicilio</span><span>{plata(p.domicilio)}</span></div>}
          <div className="fila entre total"><span>Total</span><span>{plata(p.total)}</span></div>
          {p.pagado > 0 && <div className="fila entre texto-sec"><span>Pagado</span><span>{plata(p.pagado)}</span></div>}
        </div>

        <div className="aviso">
          Paga con <b>{MEDIO[p.medio]}</b>
          {p.medio === 'efectivo' && p.paga_con ? <> · billete de {plata(p.paga_con)} → llevar <b>{plata(p.paga_con - p.total)}</b> de vueltas</> : null}
          {p.medio !== 'efectivo' && <div style={{ marginTop: 6 }}>
            Comprobante: {p.comprobante ? (urlComp ? <a href={urlComp} target="_blank" rel="noreferrer">ver archivo</a> : 'cargando…') : 'no lo adjuntó'}
            {' · '}<b>{{ pendiente: 'por revisar', verificado: '✓ verificado', rechazado: '✗ rechazado', no_aplica: '' }[p.comprobante_estado]}</b>
            {!cerrado && p.comprobante_estado !== 'verificado' && <div className="fila" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn-suave" disabled={ocupado} onClick={() => hacer(() => rpc('online_comprobante', { p_id: p.id, p_ok: true }))}>✓ El pago llegó</button>
              {p.comprobante_estado !== 'rechazado' && <button className="btn btn-suave" disabled={ocupado} onClick={() => hacer(() => rpc('online_comprobante', { p_id: p.id, p_ok: false }))}>✗ No llegó</button>}
            </div>}
          </div>}
        </div>

        {error && <div className="error">{error}</div>}

        {!cerrado && <div className="pila" style={{ gap: 8 }}>
          {p.estado === 'recibido' && <button className="btn btn-principal btn-ancho btn-grande" disabled={ocupado} onClick={() => estado('confirmado')}>Confirmar pedido</button>}
          {p.entrega === 'domicilio' && ['recibido', 'confirmado', 'en_preparacion', 'listo'].includes(p.estado) && (
            <div className="fila" style={{ gap: 8 }}>
              <input className="online-campo" placeholder="¿Quién lo lleva?" value={domiciliario} onChange={(e) => setDomiciliario(e.target.value)} />
              <button className="btn btn-negro" disabled={ocupado || !domiciliario.trim()} onClick={() => estado('en_camino', { p_domiciliario: domiciliario })}>🛵 Salió</button>
            </div>)}
          {saldo > 0 && <button className="btn btn-principal btn-ancho" disabled={ocupado} onClick={cobrar}>Confirmar cobro · {plata(saldo)} ({MEDIO[p.medio]})</button>}
          {['listo', 'en_camino'].includes(p.estado) || (p.entrega === 'recoger' && p.estado !== 'recibido')
            ? <button className="btn btn-negro btn-ancho" disabled={ocupado} onClick={() => estado('entregado')}>✓ Entregado</button> : null}
          {p.pagado === 0 && <button className="enlace" style={{ color: 'var(--rojo)' }} disabled={ocupado} onClick={cancelar}>Cancelar pedido</button>}
        </div>}
        {p.domiciliario && <div className="texto-sec">Lo lleva {p.domiciliario}{p.salio_en ? ` · salió ${hora(p.salio_en)}` : ''}</div>}
      </div>
    </Ventana>
  );
}
