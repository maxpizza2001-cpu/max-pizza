// Tarjeta premium de producto: foto grande (o dibujo mientras no haya foto), etiquetas REALES y botón "Agregar".
// Las etiquetas salen solo de datos del sistema: marcado en portada, está en un combo, quedan pocas, agotado, tamaños, adicionales.
import { memo } from 'react';
import { plata } from '../lib/formato';
import { ImagenProducto } from './Dibujos';
import { platoAgotado, type Plato } from './modelo';

export const Tarjeta = memo(function Tarjeta({ p, sello, enPedido, enCombo, conAdicionales, onAbrir }: {
  p: Plato; sello?: string; enPedido: number; enCombo: boolean; conAdicionales: boolean; onAbrir: (p: Plato) => void;
}) {
  const fuera = platoAgotado(p);
  // "Quedan pocas": solo cuando el inventario dice cuántas quedan (pizzas) y son 3 o menos
  const quedan = p.variantes.map((v) => v.disponibles).filter((d): d is number => d != null && d > 0);
  const pocas = !fuera && quedan.length > 0 && Math.max(...quedan) <= 3 ? Math.max(...quedan) : null;
  const etiquetas = [
    fuera ? { t: 'Agotado', c: 'gris' } : null,
    !fuera && sello ? { t: sello, c: 'oro' } : null,
    !fuera && pocas ? { t: `¡Quedan ${pocas}!`, c: 'roja' } : null,
    !fuera && enCombo ? { t: 'También en combo', c: 'clara' } : null,
  ].filter(Boolean) as { t: string; c: string }[];
  const detalle = [p.variantes.length > 1 ? p.variantes.map((v) => v.etiqueta).join(' · ') : null, conAdicionales ? 'con adicionales' : null].filter(Boolean).join(' · ');

  return (
    <article className={'t-card t-card-premium' + (fuera ? ' t-agotado' : '')} aria-disabled={fuera}
      onClick={() => !fuera && onAbrir(p)} onKeyDown={(e) => { if (!fuera && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAbrir(p); } }}
      tabIndex={fuera ? -1 : 0} role="button" aria-label={`${p.nombre}, ${p.variantes.length > 1 ? 'desde ' : ''}${plata(p.precio)}${fuera ? ', agotado' : ''}`}>
      <div className={'t-card-foto' + (p.foto_url ? ' con-foto' : '')}>
        <ImagenProducto p={p} tam={150} />
        <div className="t-etiquetas">{etiquetas.map((e) => <span key={e.t} className={'t-etq ' + e.c}>{e.t}</span>)}</div>
        {enPedido > 0 && <span className="t-en-pedido" aria-label={`${enPedido} en tu pedido`}>{enPedido}</span>}
      </div>
      <div className="t-card-cuerpo">
        <b className="t-card-nombre">{p.nombre}</b>
        <span className="t-card-desc">{p.descripcion || detalle || p.categoria}</span>
        {p.descripcion && detalle && <span className="t-card-detalle">{detalle}</span>}
        <div className="t-card-pie">
          <span className="t-card-precio">{p.variantes.length > 1 && <small>Desde </small>}{plata(p.precio)}</span>
          {fuera ? <span className="t-card-agotado">Vuelve pronto</span>
            : <span className="t-card-agregar" aria-hidden>＋ Agregar</span>}
        </div>
      </div>
    </article>
  );
});
