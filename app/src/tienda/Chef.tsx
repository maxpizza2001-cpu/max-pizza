// El chef de Max Pizza (estilo "Giancarlo"): se viste según CUÁNTOS productos lleva el cliente.
//   0–1 Antojado (traje amarillo) · 2–3 Chef de gala (negro) · 4–5 Rey de la pizza (negro, brillo dorado) · 6+ Fiesta Max (+ baile y llamas)
// El chef se llama DON IVÁN.
// En la mano lleva una pala de pizza con el ÚLTIMO producto agregado y el total de unidades.
// Todo es decoración: no recibe toques (pointer-events: none), salvo nada. Respeta "reducir movimiento".
import { useEffect, useRef, useState } from 'react';
import { ImagenProducto } from './Dibujos';
import type { Plato } from './modelo';

export const NOMBRE_CHEF = 'Don Iván';
export type Nivel = { i: number; nombre: string; traje: 'amarillo' | 'negro'; fiesta: boolean; color: string; desde: number };
export const NIVELES_CHEF: Nivel[] = [
  { i: 1, nombre: 'Antojado', traje: 'amarillo', fiesta: false, color: '#E3A21A', desde: 0 },
  { i: 2, nombre: 'Chef de gala', traje: 'negro', fiesta: false, color: '#F3F0E8', desde: 2 },
  { i: 3, nombre: 'Rey de la pizza', traje: 'negro', fiesta: false, color: '#F6C64A', desde: 4 },
  { i: 4, nombre: 'Fiesta Max', traje: 'negro', fiesta: true, color: '#FF7A1A', desde: 6 },
];
export function nivelChef(unidades: number) {
  const actual = [...NIVELES_CHEF].reverse().find((n) => unidades >= n.desde)!;
  const siguiente = NIVELES_CHEF.find((n) => n.desde > unidades) ?? null;
  return { actual, siguiente, faltan: siguiente ? siguiente.desde - unidades : 0 };
}

/** Dónde queda la mano levantada en las imágenes (medido sobre chef-amarillo / chef-negro.webp, 550×1134) */
const MANO = { x: 85.9, y: 32.5 };
export const IMAGENES_CHEF = ['/max/chef-amarillo.webp', '/max/chef-negro.webp'];

/** Frase del chef según el producto que acaban de agregar */
export function fraseChef(nombre: string) {
  const n = nombre.toLowerCase();
  const pizza = n.match(/(?:pizza|porci[oó]n|personal)\s+(.+)/i)?.[1];
  if (n.includes('hawai')) return '¡Esa Hawaiana va directo al horno! 🍍';
  if (n.includes('pepper')) return '¡Pepperoni, la que nunca falla! 🔥';
  if (n.includes('mexic')) return '¡Con su picantico y todo! 🌶️';
  if (n.includes('pollo')) return '¡Pollo con champiñones, qué nivel! 🍄';
  if (n.includes('combo')) return '¡Combo a la pala, ahorro asegurado! 🎉';
  if (n.includes('hamburg')) return '¡Una hamburguesa bien armada, ya sale! 🍔';
  if (/papa|salchi/.test(n)) return '¡Papitas para acompañar! 🍟';
  if (/costilla|picada|s[aá]ndwich/.test(n)) return '¡Eso sale jugosito! 🤤';
  if (/gaseosa|jugo|agua/.test(n)) return '¡Y para pasar, bien fría! 🥤';
  if (pizza) return `¡Esa ${pizza} va directo al horno! 🍕`;
  return `¡${nombre} a la pala! 🍕`;
}
const FRASES_TRISTES = ['¡Uy! Bueno, lo saco de la pala… 😢', 'Ay, se me cayó de la pala 🥲', 'Está bien… pero ¿algo más rico? 😌'];

export function Chef({ unidades, ultimo, platos }: {
  unidades: number;
  ultimo: { nombre: string; plato_id: string } | null;   // el último producto agregado (para la pala)
  platos: Plato[];
}) {
  const { actual } = nivelChef(unidades);
  const [frase, setFrase] = useState<string | null>(null);
  const [anim, setAnim] = useState<'' | 'brinca' | 'hunde'>('');
  const [destello, setDestello] = useState(0);
  const antes = useRef(unidades);
  const trajeAntes = useRef(actual.traje);

  // Reacción a agregar / quitar
  useEffect(() => {
    if (unidades === antes.current) return;
    const subio = unidades > antes.current;
    antes.current = unidades;
    setAnim(subio ? 'brinca' : 'hunde');
    setFrase(subio ? (ultimo ? fraseChef(ultimo.nombre) : '¡A la pala!') : FRASES_TRISTES[unidades % FRASES_TRISTES.length]);
    const t = setTimeout(() => setAnim(''), 700);
    return () => clearTimeout(t);
  }, [unidades]);
  // La burbuja se esconde a los 3 s
  useEffect(() => { if (!frase) return; const t = setTimeout(() => setFrase(null), 3000); return () => clearTimeout(t); }, [frase]);
  // Destello blanco al cambiar de traje
  useEffect(() => { if (actual.traje !== trajeAntes.current) { trajeAntes.current = actual.traje; setDestello((d) => d + 1); } }, [actual.traje]);

  const pl = ultimo ? platos.find((p) => p.id === ultimo.plato_id) : null;
  const enPala = ultimo ? (pl ?? { nombre: ultimo.nombre, foto_url: null, categoria_tipo: /combo/i.test(ultimo.nombre) ? 'combo' : 'pizza' }) : null;

  return (
    <div className={`chef-escena nivel-${actual.i}${actual.fiesta ? ' fiesta' : ''}`} style={{ ['--nivel' as string]: actual.color }} aria-hidden="true">
      <div className="chef-etiqueta"><span className="chef-nombre">{NOMBRE_CHEF}</span><span>Nivel {actual.i} · <b>{actual.nombre}</b></span></div>
      <div className="chef-resplandor" />
      <div className="chef-piso" />
      {actual.fiesta && <><span className="chef-llama izq">🔥</span><span className="chef-llama der">🔥</span></>}
      <div className={'chef-cuerpo ' + anim}>
        <img className={'chef-img' + (actual.traje === 'amarillo' ? ' on' : '')} src={IMAGENES_CHEF[0]} alt="" width={550} height={1134} decoding="async" fetchPriority="high" />
        <img className={'chef-img' + (actual.traje === 'negro' ? ' on' : '')} src={IMAGENES_CHEF[1]} alt="" width={550} height={1134} decoding="async" />
        {destello > 0 && <span key={destello} className="chef-destello" />}
        <div className={'chef-pala' + (anim === 'brinca' ? ' sacude' : '')} style={{ left: `${MANO.x}%`, top: `${MANO.y}%` }}>
          <Pala />
          <div className="chef-pala-producto">
            {enPala ? <ImagenProducto p={enPala} tam={86} /> : <span className="chef-pala-vacia">🍕</span>}
          </div>
          {unidades > 0 && <span className="chef-contador" key={unidades}>{unidades}</span>}
        </div>
      </div>
      {frase && <div className="chef-burbuja" role="status">{frase}</div>}
    </div>
  );
}

/** Pala de pizza de madera (SVG propio). La parte de abajo del mango va en la mano del chef. */
function Pala() {
  return (
    <svg className="chef-pala-svg" viewBox="0 0 100 190" aria-hidden="true">
      <defs>
        <linearGradient id="pala-madera" x1="0" x2="1"><stop offset="0" stopColor="#B57A3C" /><stop offset=".5" stopColor="#D9A15E" /><stop offset="1" stopColor="#A86C30" /></linearGradient>
        <radialGradient id="pala-cabeza" cx=".45" cy=".4" r=".7"><stop offset="0" stopColor="#E2AE6C" /><stop offset="1" stopColor="#B9803F" /></radialGradient>
      </defs>
      <rect x="45" y="92" width="10" height="98" rx="5" fill="url(#pala-madera)" stroke="#7a4a1c" strokeWidth="1.2" />
      <path d="M43 96 Q50 90 57 96 L56 102 Q50 99 44 102 Z" fill="#9b6326" />
      <ellipse cx="50" cy="48" rx="48" ry="46" fill="url(#pala-cabeza)" stroke="#7a4a1c" strokeWidth="2" />
      <path d="M14 30 Q50 6 86 30" stroke="#f1c98f" strokeWidth="2" fill="none" opacity=".6" />
      <path d="M10 60 Q20 70 30 64 M68 78 Q78 72 88 60" stroke="#9b6326" strokeWidth="1.4" fill="none" opacity=".5" />
    </svg>
  );
}
