// Distribución "estilo Giancarlo": chef fijo a la izquierda + categorías en tarjetas a la derecha,
// barra de nivel abajo y pestaña lateral de "Combos y promos". Solo es la capa visual: usa el carrito y los precios reales.
import { useState, type ReactNode } from 'react';
import { plata } from '../lib/formato';
import { useCapa } from '../lib/atras';
import { Chef, NIVELES_CHEF, nivelChef } from './Chef';
import { ImagenProducto } from './Dibujos';
import type { Combo, Plato, Promo } from './modelo';

export type TarjetaCategoria = { nombre: string; icono: ReactNode; desde: number; enPedido: number; productos: number };

export function Escenario({ unidades, ultimo, platos, categorias, onCategoria }: {
  unidades: number; ultimo: { nombre: string; plato_id: string } | null; platos: Plato[];
  categorias: TarjetaCategoria[]; onCategoria: (c: string) => void;
}) {
  return (
    <section className="esc" id="menu" aria-label="Arma tu pedido">
      <div className="esc-chef"><Chef unidades={unidades} ultimo={ultimo} platos={platos} /></div>
      <div className="esc-lado">
        <div className="esc-titulo"><small>ARMA TU PEDIDO</small><b>¿Qué se te antoja?</b></div>
        <div className="esc-cats">
          {categorias.map((c) => (
            <button key={c.nombre} className={'esc-cat' + (c.enPedido ? ' con' : '')} onClick={() => onCategoria(c.nombre)}
              aria-label={`${c.nombre}, desde ${plata(c.desde)}${c.enPedido ? `, ${c.enPedido} en tu pedido` : ''}`}>
              <span className="esc-cat-img">{c.icono}</span>
              <span className="esc-cat-txt"><b>{c.nombre}</b><small>{c.productos} opciones · desde {plata(c.desde)}</small></span>
              {c.enPedido > 0 && <span className="esc-cat-n">{c.enPedido}</span>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Barra fija de abajo: progreso al siguiente nivel (por unidades) y botón "Pedir · $total" */
export function BarraNivel({ unidades, subtotal, onPedir }: { unidades: number; subtotal: number; onPedir: () => void }) {
  const { actual, siguiente, faltan } = nivelChef(unidades);
  const max = NIVELES_CHEF[NIVELES_CHEF.length - 1].desde;
  const avance = Math.min(100, (unidades / max) * 100);
  return (
    <div className="barra-nivel">
      <div className="barra-nivel-txt">
        <small>Entre más pidas, mejor se viste</small>
        <b>{siguiente ? <>{faltan === 1 ? 'Te falta 1 producto' : `Te faltan ${faltan} productos`} para el nivel {siguiente.i}: {siguiente.nombre}</> : <>¡Nivel máximo: {actual.nombre}! 🎉</>}</b>
        <div className="barra-nivel-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(unidades, max)}>
          <span style={{ width: `${avance}%` }} />
          {NIVELES_CHEF.slice(1).map((n) => <i key={n.i} className={unidades >= n.desde ? 'on' : ''} style={{ left: `${(n.desde / max) * 100}%` }} title={`${n.nombre}: ${n.desde} productos`} />)}
        </div>
      </div>
      <button className="barra-nivel-pedir" onClick={onPedir}>
        <span>{unidades ? 'Pedir' : 'Ver menú'}</span><b>{unidades ? plata(subtotal) : '🍕'}</b>
      </button>
    </div>
  );
}

/** Pestaña lateral "Combos y promos" (como "Precios por mayor" de Gian), con datos reales de tienda_info */
export function PestanaPromos({ combos, promos, platos, agotado, onAgregarCombo }: {
  combos: Combo[]; promos: Promo[]; platos: Plato[]; agotado: (c: Combo) => boolean; onAgregarCombo: (c: Combo) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  useCapa(abierta, () => setAbierta(false));
  if (!combos.length && !promos.length) return null;
  return (
    <>
      <button className="pestana-promos" onClick={() => setAbierta(true)} aria-label="Ver combos y promociones">
        <span>🎁</span><b>Combos y promos</b>
      </button>
      {abierta && (
        <div className="t-fondo" onClick={() => setAbierta(false)}>
          <div className="t-hoja panel-promos" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Combos y promociones">
            <button className="t-cerrar" onClick={() => setAbierta(false)} aria-label="Cerrar">✕</button>
            <div className="t-hoja-cuerpo">
              <h2>🎁 Combos y promos</h2>
              <p className="t-gris">Precios reales de hoy. Entre más lleves, más ahorras.</p>
              {promos.map((p) => (
                <div key={p.nombre} className="promo-fila">
                  <b>{p.tipo === 'porcentaje' ? `${Number(p.valor)}%` : plata(p.valor)}<small> menos</small></b>
                  <span>{p.nombre}{Number(p.minimo) > 0 && <small> · en pedidos desde {plata(p.minimo)}</small>}</span>
                </div>
              ))}
              {combos.map((c) => {
                const fuera = agotado(c);
                const img = platos.find((x) => x.variantes.some((v) => c.items[0] && v.producto_id === c.items[0].producto_id));
                return (
                  <button key={c.id} className={'combo-fila' + (fuera ? ' t-agotado' : '')} disabled={fuera} onClick={() => { onAgregarCombo(c); setAbierta(false); }}>
                    <span className="combo-fila-img">{c.foto_url ? <img className="t-foto" src={c.foto_url} alt="" style={{ width: 56, height: 56 }} /> : img ? <ImagenProducto p={img} tam={56} /> : '🎉'}</span>
                    <span className="combo-fila-txt"><b>{c.nombre}</b><small>{c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(' + ')}</small></span>
                    <span className="combo-fila-precio">
                      <b>{plata(c.precio)}</b>
                      {c.normal > c.precio && <small>ahorras {plata(c.normal - c.precio)}</small>}
                      {fuera ? <small>Agotado</small> : <i>＋</i>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Hoja con los productos de una categoría (se abre al tocar una tarjeta de categoría) */
export function HojaCategoria({ nombre, children, onCerrar }: { nombre: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <div className="t-fondo" onClick={onCerrar}>
      <div className="t-hoja t-hoja-alta hoja-cat" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={nombre}>
        <button className="t-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="t-hoja-cuerpo">
          <h2>{nombre}</h2>
          <div className="t-cards">{children}</div>
        </div>
      </div>
    </div>
  );
}
