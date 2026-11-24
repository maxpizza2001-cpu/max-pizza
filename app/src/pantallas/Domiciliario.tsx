// Domiciliario: ve los domicilios confirmados; el primero que toca "Yo lo llevo" se lo queda. Luego "Salí" y "Entregado".
import { useEffect, useState } from 'react';
import { rpc, sb } from '../lib/supabase';
import { hora, plata } from '../lib/formato';
import { pitar } from '../lib/datos';
import { ESTADOS, usePedidosOnline, type PedidoOnline } from '../componentes/PedidosOnline';
import { MiTurno } from '../componentes/MiTurno';

const MEDIO: Record<string, string> = { efectivo: '💵 Efectivo', nequi: '📱 Nequi', transferencia: '🏦 Transferencia' };

export function Domiciliario({ sede, perfil }: { sede: string; perfil: string }) {
  const lista = usePedidosOnline(sede) as (PedidoOnline & { domiciliario_id: string | null })[];
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');
  const disponibles = lista.filter((p) => p.entrega === 'domicilio' && !p.domiciliario_id && ['confirmado', 'en_preparacion', 'listo'].includes(p.estado))
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const mios = lista.filter((p) => p.domiciliario_id === perfil && !['entregado', 'cancelado'].includes(p.estado));
  const entregados = lista.filter((p) => p.domiciliario_id === perfil && p.estado === 'entregado');
  const efectivo = entregados.filter((p) => p.medio === 'efectivo').reduce((t, p) => t + p.total, 0);

  const [vistos, setVistos] = useState(disponibles.length);
  useEffect(() => { if (disponibles.length > vistos) pitar(); setVistos(disponibles.length); }, [disponibles.length]);

  async function hacer(id: string, fn: () => Promise<unknown>) {
    setError(''); setOcupado(id);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setOcupado(''); }
  }

  return (
    <main className="contenido pila" style={{ maxWidth: 640 }}>
      <h1>Domicilios</h1>
      <MiTurno sede={sede} rol="domiciliario" perfil={perfil} />
      {error && <div className="error">{error}</div>}

      <section className="pila">
        <h2>Mis domicilios · {mios.length}</h2>
        {mios.length === 0 && <div className="texto-sec">No llevas ninguno ahora.</div>}
        {mios.map((p) => <Mio key={p.id} p={p} ocupado={ocupado === p.id}
          onSali={() => hacer(p.id, () => rpc('domicilio_avanzar', { p_id: p.id, p_estado: 'en_camino' }))}
          onEntregado={() => hacer(p.id, () => rpc('domicilio_avanzar', { p_id: p.id, p_estado: 'entregado' }))}
          onSoltar={() => window.confirm('¿Soltar este pedido para que lo lleve otro?') && hacer(p.id, () => rpc('domicilio_soltar', { p_id: p.id }))} />)}
      </section>

      <section className="pila">
        <div className="fila entre"><h2>Disponibles · {disponibles.length}</h2>
          {disponibles.length > 0 && <span className="estado estado-alta">¡El primero que toque se lo lleva!</span>}</div>
        {disponibles.length === 0 && <div className="texto-sec">No hay domicilios esperando. Te suena cuando llegue uno.</div>}
        {disponibles.map((p) => (
          <div key={p.id} className="tarjeta pila" style={{ gap: 8 }}>
            <div className="fila entre"><b style={{ fontSize: 18 }}>🛵 {p.barrio}</b><Estado e={p.estado} /></div>
            <div className="texto-sec">{p.zona ?? ''} · pedido #{p.numero} · llegó {hora(p.creado_en)}</div>
            <div className="fila entre"><span>{MEDIO[p.medio]}</span><b>{plata(p.total)}</b></div>
            <button className="btn btn-principal btn-ancho btn-grande" disabled={!!ocupado}
              onClick={() => hacer(p.id, () => rpc('domicilio_tomar', { p_id: p.id }))}>
              {ocupado === p.id ? 'Tomando…' : '🙋 Yo lo llevo'}
            </button>
          </div>
        ))}
      </section>

      {entregados.length > 0 && <div className="tarjeta">
        <b>Hoy entregaste {entregados.length}</b>
        {efectivo > 0 && <div className="texto-sec">Efectivo recibido para entregar en Caja: <b>{plata(efectivo)}</b></div>}
      </div>}
    </main>
  );
}

function Estado({ e }: { e: string }) {
  const [t, c] = ESTADOS[e] ?? [e, 'estado-proceso'];
  return <span className={'estado ' + c}>{t}</span>;
}

function Mio({ p, ocupado, onSali, onEntregado, onSoltar }: { p: PedidoOnline; ocupado: boolean; onSali: () => void; onEntregado: () => void; onSoltar: () => void }) {
  const [lineas, setLineas] = useState<string[]>([]);
  useEffect(() => {
    sb.from('lineas_pedido').select('cantidad, observacion, estado, productos(nombre)').eq('pedido_id', p.pedido_id).order('id')
      .then(({ data }) => setLineas((data ?? []).filter((l: any) => l.estado === 'activa')
        .map((l: any) => `${Number(l.cantidad)} × ${l.productos?.nombre}${(l.observacion ?? '').replace(/^ONLINE/, '')}`)));
  }, [p.pedido_id]);
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.direccion}, ${p.barrio}`)}`;
  const debe = p.total - p.pagado;
  return (
    <div className="tarjeta pila" style={{ gap: 8, borderColor: 'var(--mostaza)', borderWidth: 2 }}>
      <div className="fila entre"><b style={{ fontSize: 18 }}>#{p.numero} · {p.nombre}</b><Estado e={p.estado} /></div>
      <div><b>{p.direccion}</b> · {p.barrio}{p.referencia && <div className="texto-sec">{p.referencia}</div>}
        {p.indicaciones && <div className="txt-rojo">“{p.indicaciones}”</div>}</div>
      <div className="fila envolver" style={{ gap: 6 }}>
        <a className="btn btn-suave" href={mapa} target="_blank" rel="noreferrer">🗺️ Mapa</a>
        <a className="btn btn-suave" href={`tel:${p.celular}`}>📞 Llamar</a>
        <a className="btn btn-suave" href={`https://wa.me/57${p.celular}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
      </div>
      <div className="texto-sec" style={{ fontSize: 14 }}>{lineas.map((l, i) => <div key={i}>{l}</div>)}</div>
      <div className="aviso">
        {debe <= 0 ? <>✓ Ya está pagado. No cobres nada.</>
          : p.medio === 'efectivo' ? <>Cobrar <b>{plata(debe)}</b> en efectivo{p.paga_con ? <> · paga con {plata(p.paga_con)} → lleva <b>{plata(p.paga_con - p.total)}</b> de vueltas</> : ''}</>
          : <>Pagó por {MEDIO[p.medio]} · {p.comprobante_estado === 'verificado' ? '✓ verificado por Caja' : 'Caja aún lo está verificando'}</>}
      </div>
      {p.estado === 'listo' && <button className="btn btn-negro btn-ancho btn-grande" disabled={ocupado} onClick={onSali}>🛵 Salí con el pedido</button>}
      {['confirmado', 'en_preparacion'].includes(p.estado) && <div className="texto-sec">Espera a que la cocina lo marque listo para salir.</div>}
      {p.estado === 'en_camino' && <button className="btn btn-principal btn-ancho btn-grande" disabled={ocupado} onClick={onEntregado}>✓ Entregado</button>}
      {p.estado !== 'en_camino' && <button className="enlace" disabled={ocupado} onClick={onSoltar}>Soltar este pedido</button>}
    </div>
  );
}
