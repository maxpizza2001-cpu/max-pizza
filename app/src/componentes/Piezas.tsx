import { useState, type ReactNode } from 'react';
import { useCapa } from '../lib/atras';
import { plata } from '../lib/formato';
import { emojiProducto, minutosDesde, nombreDestino, useAhora, type Comanda, type LineaCarrito, type Producto } from '../lib/datos';

// ───────── Ventana (hoja que sube en celular, centrada en computador) ─────────
export function Ventana({ titulo, onCerrar, children, ancho = 560 }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  useCapa(true, onCerrar);   // atrás cierra la ventana
  return (
    <div className="velo" onClick={onCerrar}>
      <div className="ventana" style={{ maxWidth: ancho }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="fila entre" style={{ marginBottom: 14 }}>
          <h2>{titulo}</h2>
          <button className="btn btn-suave" style={{ padding: '8px 12px' }} onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ───────── Carrito ─────────
export const totalCarrito = (c: LineaCarrito[], ps: Producto[]) =>
  c.reduce((t, l) => t + l.cantidad * (ps.find((p) => p.id === l.producto_id)?.precio ?? 0), 0);

export function sumar(c: LineaCarrito[], producto_id: string, n = 1): LineaCarrito[] {
  const i = c.findIndex((l) => l.producto_id === producto_id && !l.observacion);
  if (i < 0) return n > 0 ? [...c, { producto_id, cantidad: n }] : c;
  const nueva = [...c];
  nueva[i] = { ...nueva[i], cantidad: nueva[i].cantidad + n };
  return nueva.filter((l) => l.cantidad > 0);
}

/** Tarjetas de productos: cada toque suma uno */
export function Productos({ productos, carrito, onCambio, compacto = false }: {
  productos: Producto[]; carrito: LineaCarrito[]; onCambio: (c: LineaCarrito[]) => void; compacto?: boolean;
}) {
  return (
    <div className={compacto ? 'rejilla-prod compacta' : 'rejilla-prod'}>
      {productos.map((p) => {
        const enCarrito = carrito.filter((l) => l.producto_id === p.id).reduce((t, l) => t + l.cantidad, 0);
        const agotado = p.disponible !== null && p.disponible - enCarrito <= 0;
        return (
          <button key={p.id} className={'prod' + (enCarrito ? ' elegido' : '')} disabled={agotado}
            onClick={() => onCambio(sumar(carrito, p.id))}>
            {enCarrito > 0 && <span className="prod-cuenta">×{enCarrito}</span>}
            <span className="prod-foto">{p.foto_url ? <img src={p.foto_url} alt="" /> : emojiProducto(p)}</span>
            <span className="prod-nombre">{p.nombre.replace(/^Porción /, '')}</span>
            <span className="prod-pie">
              <span>{plata(p.precio)}</span>
              {p.disponible !== null && <span className={p.disponible <= 5 ? 'txt-rojo' : 'texto-sec'}>{agotado ? 'Agotado' : `${p.disponible} disp.`}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Resumen editable: cantidad directa, observaciones, quitar */
export function Resumen({ productos, carrito, onCambio, conObservaciones = false }: {
  productos: Producto[]; carrito: LineaCarrito[]; onCambio: (c: LineaCarrito[]) => void; conObservaciones?: boolean;
}) {
  const [notaAbierta, setNotaAbierta] = useState<number | null>(null);
  if (!carrito.length) return <div className="texto-sec" style={{ padding: '8px 0' }}>Toca un producto para agregarlo.</div>;
  const cambiar = (i: number, cambio: Partial<LineaCarrito>) => {
    const n = [...carrito]; n[i] = { ...n[i], ...cambio }; onCambio(n.filter((l) => l.cantidad > 0));
  };
  return (
    <div>
      {carrito.map((l, i) => {
        const p = productos.find((x) => x.id === l.producto_id);
        return (
          <div key={i} className="linea">
            <div className="fila" style={{ gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{p?.nombre ?? 'Producto'} <span className="txt-mostaza">×{l.cantidad}</span></div>
                {l.observacion && <div className="texto-sec" style={{ fontSize: 13 }}>“{l.observacion}”</div>}
              </div>
              <div className="contador">
                <button onClick={() => cambiar(i, { cantidad: l.cantidad - 1 })} aria-label="Quitar uno">−</button>
                <input inputMode="numeric" value={l.cantidad} aria-label="Cantidad"
                  onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); cambiar(i, { cantidad: v }); }} />
                <button onClick={() => cambiar(i, { cantidad: l.cantidad + 1 })} aria-label="Sumar uno">+</button>
              </div>
              <div style={{ width: 82, textAlign: 'right', fontWeight: 700 }}>{plata(l.cantidad * (p?.precio ?? 0))}</div>
            </div>
            {conObservaciones && (notaAbierta === i ? (
              <input className="nota" autoFocus placeholder="Ej: Sin cebolla" defaultValue={l.observacion ?? ''}
                onBlur={(e) => { cambiar(i, { observacion: e.target.value.trim() || undefined }); setNotaAbierta(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            ) : (
              <button className="enlace" onClick={() => setNotaAbierta(i)}>{l.observacion ? 'Cambiar nota' : '+ Nota (ej. sin cebolla)'}</button>
            ))}
          </div>
        );
      })}
      <div className="fila entre total">
        <span>Total</span><span>{plata(totalCarrito(carrito, productos))}</span>
      </div>
    </div>
  );
}

export const MEDIOS = [
  ['efectivo', 'Efectivo'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'],
] as const;

export function MedioPago({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="fila envolver" style={{ gap: 6 }}>
      {MEDIOS.map(([v, t]) => (
        <button key={v} className={'pastilla' + (valor === v ? ' activa' : '')} onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  );
}

// ───────── Comandas (horno en Caja y tablet de comidas rápidas) ─────────
const ESTADO_COMANDA: Record<string, [string, string]> = {
  nueva: ['Nueva', 'estado-alta'], en_preparacion: ['En preparación', 'estado-media'],
  lista: ['✓ Lista', 'estado-lista'], entregada: ['Entregada', 'estado-proceso'], cancelada: ['Cancelada', 'estado-proceso'],
};

export function TarjetaComanda({ c, grande = false, onEstado, botonesMesero = false }: {
  c: Comanda; grande?: boolean; onEstado: (id: string, estado: string) => void; botonesMesero?: boolean;
}) {
  const ahora = useAhora();
  const espera = minutosDesde(c.creada_en, ahora);
  const [txt, cls] = ESTADO_COMANDA[c.estado];
  return (
    <div className={'tarjeta comanda' + (grande ? ' grande' : '') + (espera >= 15 && c.estado !== 'lista' ? ' tarde' : '')}>
      <div className="fila entre">
        <div>
          <div className="comanda-dest">{nombreDestino(c)}</div>
          <div className="texto-sec">Pedido #{c.numero} · {espera === 0 ? 'ahora' : `hace ${espera} min`}</div>
          {(c.solicitante || c.tomador) && <div className="texto-sec" style={{ fontSize: 12.5 }}>{c.solicitante ? `Pidió ${c.solicitante}` : ''}{c.solicitante && c.tomador ? ' · ' : ''}{c.tomador ? `La tomó ${c.tomador}` : ''}</div>}
        </div>
        <span className={`estado ${cls}`}>{txt}</span>
      </div>
      <div className="comanda-lineas">
        {c.lineas.map((l) => (
          <div key={l.id} className={l.cancelada ? 'cancelada' : ''}>
            <b>{l.cantidad}×</b> {l.producto}{l.cancelada && ' · CANCELADA'}
            {l.observacion && <div className="comanda-obs">⚠ {l.observacion}</div>}
          </div>
        ))}
      </div>
      {botonesMesero ? (
        c.estado === 'lista' && <button className="btn btn-principal btn-ancho" onClick={() => onEstado(c.id, 'entregada')}>Entregado</button>
      ) : (
        <div className="fila" style={{ gap: 8 }}>
          {c.estado === 'nueva' && <button className="btn btn-suave" style={{ flex: 1 }} onClick={() => onEstado(c.id, 'en_preparacion')}>Empezar</button>}
          {(c.estado === 'nueva' || c.estado === 'en_preparacion') &&
            <button className="btn btn-principal" style={{ flex: 1 }} onClick={() => onEstado(c.id, 'lista')}>{c.estacion !== 'rapidas' ? 'Lista' : 'Listo'}</button>}
        </div>
      )}
    </div>
  );
}
