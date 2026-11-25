// "La pizza que se arma": una caja de Max Pizza que se va llenando con lo que el cliente agrega,
// y sube de nivel según el valor del pedido (Antojado → Hambre seria → Rey de la pizza → Fiesta Max).
import { useEffect, useRef, useState } from 'react';
import { sonido } from './sonido';
import { plata } from '../lib/formato';
import { PizzaDibujo, iconoDe } from './Dibujos';
import { precioLinea, type LineaCarrito, type Plato } from './modelo';

export const NIVELES = [
  { desde: 0, nombre: 'Antojado', icono: '🍕', frase: 'Arranca la noche' },
  { desde: 40000, nombre: 'Hambre seria', icono: '🔥', frase: 'Esto ya es en serio' },
  { desde: 60000, nombre: 'Rey de la pizza', icono: '👑', frase: 'Con corona y todo' },
  { desde: 90000, nombre: 'Fiesta Max', icono: '🎉', frase: '¡Que empiece la fiesta!' },
];
export function nivelDe(total: number) {
  let i = 0;
  NIVELES.forEach((n, k) => { if (total >= n.desde) i = k; });
  return { i, actual: NIVELES[i], siguiente: NIVELES[i + 1] ?? null };
}

type Pieza = { clave: string; tipo: 'pizza' | 'otro'; nombre: string; foto: string | null; icono: string };

/** Convierte el carrito en las piezas que se ven dentro y alrededor de la caja */
function piezas(lineas: LineaCarrito[], platos: Plato[]): Pieza[] {
  const out: Pieza[] = [];
  for (const l of lineas) {
    const pl = platos.find((p) => p.id === l.plato_id);
    const items = l.combo_id && l.detalle ? l.detalle.split(' + ').map((d) => d.replace(/^\d+\s×\s/, '')) : [l.nombre];
    for (let k = 0; k < l.cantidad; k++) {
      for (const nombre of items) {
        const esPizza = /pizza|porci[oó]n|personal/i.test(nombre) || pl?.categoria_tipo === 'pizza';
        out.push({ clave: `${l.clave}-${k}-${nombre}`, tipo: esPizza ? 'pizza' : 'otro', nombre: nombre.replace(/^(Porción|Personal)\s+/i, 'Pizza '),
          foto: !l.combo_id ? pl?.foto_url ?? null : null, icono: iconoDe(nombre, pl?.categoria_tipo ?? '') });
      }
    }
  }
  return out;
}

export function Caja({ lineas, platos, compacta = false, onVerPedido }: {
  lineas: LineaCarrito[]; platos: Plato[]; compacta?: boolean; onVerPedido?: () => void;
}) {
  const total = lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  const { i, actual, siguiente } = nivelDe(total);
  const todo = piezas(lineas, platos);
  const pizzas = todo.filter((p) => p.tipo === 'pizza');
  const otros = todo.filter((p) => p.tipo === 'otro');
  const avance = siguiente ? Math.min(100, Math.round(((total - actual.desde) / (siguiente.desde - actual.desde)) * 100)) : 100;

  // Celebración al subir de nivel
  const antes = useRef(i);
  const [fiesta, setFiesta] = useState(false);
  useEffect(() => {
    if (i > antes.current) { setFiesta(true); if (!compacta) sonido.efecto('nivel'); const t = setTimeout(() => setFiesta(false), 1800); antes.current = i; return () => clearTimeout(t); }
    antes.current = i;
  }, [i]);

  return (
    <section className={`caja-zona nivel-${i}${compacta ? ' compacta' : ''}${fiesta ? ' fiesta' : ''}`} aria-label={`Tu caja: nivel ${actual.nombre}`}>
      <div className="caja-cabeza">
        <span className="caja-insignia">{actual.icono} Nivel {i + 1} · <b>{actual.nombre}</b></span>
        {!compacta && <span className="caja-frase">{lineas.length ? actual.frase : 'Agrega algo y mira cómo se llena'}</span>}
      </div>

      <div className="caja-escena" onClick={onVerPedido} role={onVerPedido ? 'button' : undefined}>
        <div className="caja">
          <div className="caja-tapa"><span>MAX PIZZA</span><small>¡Más sabor!</small>{i >= 2 && <i className="caja-corona">👑</i>}</div>
          <div className="caja-fondo">
            {pizzas.length === 0 && <div className="caja-vacia">Tu caja está vacía<br /><small>¡Llénala! 🍕</small></div>}
            {pizzas.slice(0, 4).map((p, k) => (
              <div key={p.clave} className={`caja-pizza n${Math.min(pizzas.length, 4)} p${k}`} title={p.nombre}>
                {p.foto ? <img src={p.foto} alt={p.nombre} /> : <PizzaDibujo nombre={p.nombre} style={{ width: '100%', height: '100%', display: 'block' }} />}
              </div>
            ))}
            {pizzas.length > 4 && <span className="caja-mas">+{pizzas.length - 4}</span>}
          </div>
        </div>
        <div className="caja-lado">
          {otros.slice(0, 6).map((p) => <span key={p.clave} className="caja-extra" title={p.nombre}>{p.icono}</span>)}
          {otros.length > 6 && <span className="caja-extra caja-extra-mas">+{otros.length - 6}</span>}
        </div>
        {fiesta && <div className="caja-confeti" aria-hidden>{Array.from({ length: 18 }, (_, k) => <i key={k} style={{ ['--k' as string]: k }} />)}</div>}
      </div>

      <div className="caja-progreso">
        <div className="caja-barra"><span style={{ width: `${avance}%` }} /></div>
        <div className="caja-meta">
          {siguiente
            ? <>Te faltan <b>{plata(siguiente.desde - total)}</b> para <b>{siguiente.icono} {siguiente.nombre}</b></>
            : <>🎉 ¡Nivel máximo! Eres <b>Fiesta Max</b></>}
        </div>
        {!compacta && (
          <div className="caja-niveles">
            {NIVELES.map((n, k) => <span key={n.nombre} className={k <= i ? 'on' : ''} title={`${n.nombre} · desde ${plata(n.desde)}`}>{n.icono}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}

/** Frase con personalidad para el aviso al agregar algo */
export function fraseAgregado(nombre: string, totalNuevo: number) {
  const n = nombre.toLowerCase();
  const gancho = n.includes('hawai') ? '¡Esa Hawaiana va a quedar brutal! 🍍'
    : n.includes('pepper') ? '¡Pepperoni, la que nunca falla! 🔥'
    : n.includes('mexic') ? '¡Con picantico y todo! 🌶️'
    : n.includes('pollo') ? '¡Pollo con champiñones, qué nivel! 🍄'
    : n.includes('hamburg') ? '¡Hamburguesa a la caja! 🍔'
    : n.includes('papa') || n.includes('salchi') ? '¡Papitas para acompañar! 🍟'
    : n.includes('combo') ? '¡Combo adentro, ahorro asegurado! 🎉'
    : /gaseosa|jugo|agua/.test(n) ? '¡Y para pasar, bien fría! 🥤'
    : `¡${nombre} a la caja! 🍕`;
  const { actual, siguiente } = nivelDe(totalNuevo);
  const sigue = siguiente ? ` Te faltan ${plata(siguiente.desde - totalNuevo)} para ${siguiente.icono} ${siguiente.nombre}.` : ` ¡Eres ${actual.icono} ${actual.nombre}!`;
  return gancho + sigue;
}
