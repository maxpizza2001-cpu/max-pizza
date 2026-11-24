// El cliente sigue su pedido con el código y su celular. Se actualiza solo cada pocos segundos.
import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase';
import { hora, plata } from '../lib/formato';

type Estado = {
  codigo: string; numero: number; estado: string; entrega: 'domicilio' | 'recoger'; sede: string; nombre: string; barrio: string | null;
  medio: string; comprobante_estado: string; pagado: boolean; subtotal: number; domicilio: number; total: number;
  domiciliario: string; creado_en: string; salio_en: string | null; entregado_en: string | null;
  historial: { estado: string; en: string }[]; lineas: { nombre: string; cantidad: number; detalle: string | null }[];
};

export const CLAVE_ULTIMO = 'maxpizza.tienda.ultimo';

const PASOS = (entrega: string): [string, string, string][] => [
  ['recibido', '📩', 'Recibido'],
  ['confirmado', '👍', 'Confirmado'],
  ['en_preparacion', '🔥', 'En preparación'],
  ['listo', '✅', entrega === 'domicilio' ? 'Listo para salir' : 'Listo para recoger'],
  ...(entrega === 'domicilio' ? [['en_camino', '🛵', 'En camino'] as [string, string, string]] : []),
  ['entregado', '🎉', 'Entregado'],
];

const FRASE: Record<string, string> = {
  recibido: 'Recibimos tu pedido. En un momento lo confirmamos.',
  confirmado: 'Tu pedido está confirmado y entra a la cocina.',
  en_preparacion: '¡Ya lo estamos preparando!',
  listo: 'Tu pedido está listo.',
  en_camino: 'Tu pedido va en camino.',
  entregado: '¡Que lo disfrutes! Gracias por pedir en Max Pizza.',
  cancelado: 'Este pedido fue cancelado. Si tienes dudas, escríbenos.',
};

export function Seguimiento({ inicial, onCerrar }: { inicial?: { codigo: string; celular: string }; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '');
  const [celular, setCelular] = useState(inicial?.celular ?? '');
  const [buscar, setBuscar] = useState(inicial?.celular ? inicial : null);
  const [datos, setDatos] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!buscar) return;
    let vivo = true;
    const traer = async (primera: boolean) => {
      if (primera) setCargando(true);
      const { data, error } = await sb.rpc('tienda_seguimiento', { p_codigo: buscar.codigo, p_celular: buscar.celular });
      if (!vivo) return;
      setCargando(false);
      if (error) { if (primera) setError('No pudimos consultar. Revisa tu internet.'); return; }
      if (!data) { setDatos(null); setError('No encontramos un pedido con ese código y celular.'); return; }
      setError(''); setDatos(data as Estado);
    };
    traer(true);
    const t = setInterval(() => document.visibilityState === 'visible' && traer(false), 10000);
    return () => { vivo = false; clearInterval(t); };
  }, [buscar]);

  const cuando = (e: string) => e === 'recibido' ? datos?.creado_en : datos?.historial.find((h) => h.estado === e)?.en;
  const pasos = datos ? PASOS(datos.entrega) : [];
  const actual = datos ? pasos.findIndex((p) => p[0] === datos.estado) : -1;

  return (
    <div className="t-fondo" onClick={onCerrar}>
      <div className="t-hoja t-hoja-alta" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Seguir mi pedido">
        <button className="t-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="t-hoja-cuerpo">
          {!datos && <>
            <h2>Sigue tu pedido</h2>
            <p className="t-gris">Escribe el código que te dimos al pedir y tu celular.</p>
            <input className="t-campo t-campo-codigo" placeholder="Código (ej. BAWBHT)" maxLength={6} value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <input className="t-campo" placeholder="Celular" inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value.replace(/[^\d ]/g, ''))} />
            {error && <div className="t-errores">{error}</div>}
            <button className="t-btn t-btn-ancho" disabled={codigo.length < 6 || celular.replace(/\D/g, '').length < 10 || cargando}
              onClick={() => setBuscar({ codigo, celular })}>{cargando ? 'Buscando…' : 'Ver mi pedido'}</button>
          </>}

          {datos && <>
            <div className="t-seg-cabeza">
              <span className="t-gris">Pedido #{datos.numero} · {datos.sede}</span>
              <div className="t-codigo t-codigo-chico">{datos.codigo}</div>
            </div>
            <h2 className="t-seg-frase">{FRASE[datos.estado]}</h2>
            {datos.estado === 'en_camino' && datos.domiciliario && <div className="t-info">🛵 Lo lleva <b>{datos.domiciliario}</b>{datos.salio_en ? ` · salió a las ${hora(datos.salio_en)}` : ''}</div>}

            {datos.estado !== 'cancelado' ? (
              <ol className="t-linea-tiempo">
                {pasos.map(([k, ic, t], i) => (
                  <li key={k} className={i < actual ? 'hecho' : i === actual ? 'ahora' : ''}>
                    <span className="t-lt-icono">{ic}</span>
                    <span className="t-lt-txt"><b>{t}</b>{i <= actual && cuando(k) && <span className="t-gris">{hora(cuando(k))}</span>}</span>
                  </li>
                ))}
              </ol>
            ) : <div className="t-errores">Pedido cancelado.</div>}

            {datos.medio !== 'efectivo' && datos.comprobante_estado === 'pendiente' && <div className="t-info">Estamos revisando tu pago.</div>}
            {datos.comprobante_estado === 'rechazado' && <div className="t-errores">No encontramos tu pago. Te vamos a contactar.</div>}

            <h3 className="t-sub">Tu pedido</h3>
            {datos.lineas.map((l, i) => (
              <div key={i} className="t-fila"><span>{Number(l.cantidad)} × {l.nombre}{l.detalle && <span className="t-gris"> · {l.detalle}</span>}</span></div>
            ))}
            {Number(datos.domicilio) > 0 && <div className="t-fila"><span>Domicilio</span><span>{plata(datos.domicilio)}</span></div>}
            <div className="t-fila t-total"><span>Total</span><span>{plata(datos.total)}{datos.pagado ? ' · ✓ pagado' : ''}</span></div>
            <p className="t-gris" style={{ fontSize: 12.5, marginTop: 12 }}>Esta pantalla se actualiza sola.</p>
            <button className="t-enlace-osc" onClick={() => { setDatos(null); setBuscar(null); }}>Buscar otro pedido</button>
          </>}
        </div>
      </div>
    </div>
  );
}
