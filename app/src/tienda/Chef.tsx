// El chef de Max Pizza (estilo "Giancarlo"): se viste según CUÁNTOS productos lleva el cliente.
//   0–1 Antojado (traje amarillo) · 2–3 Chef de gala (negro) · 4–5 Rey de la pizza (negro + corona) · 6+ Fiesta Max (+ baile y llamas)
// En la mano lleva una pala de pizza con el ÚLTIMO producto agregado y el total de unidades.
// Todo es decoración: no recibe toques (pointer-events: none), salvo nada. Respeta "reducir movimiento".
import { useEffect, useRef, useState } from 'react';
import { ImagenProducto } from './Dibujos';
import type { Plato } from './modelo';

export type Nivel = { i: number; nombre: string; traje: 'amarillo' | 'negro'; corona: boolean; fiesta: boolean; color: string; desde: number };
export const NIVELES_CHEF: Nivel[] = [
  { i: 1, nombre: 'Antojado', traje: 'amarillo', corona: false, fiesta: false, color: '#E3A21A', desde: 0 },
  { i: 2, nombre: 'Chef de gala', traje: 'negro', corona: false, fiesta: false, color: '#F3F0E8', desde: 2 },
  { i: 3, nombre: 'Rey de la pizza', traje: 'negro', corona: true, fiesta: false, color: '#F6C64A', desde: 4 },
  { i: 4, nombre: 'Fiesta Max', traje: 'negro', corona: true, fiesta: true, color: '#FF7A1A', desde: 6 },
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
      <div className="chef-etiqueta">Nivel {actual.i} · <b>{actual.nombre}</b></div>
      <div className="chef-resplandor" />
      <div className="chef-piso" />
      {actual.fiesta && <><span className="chef-llama izq">🔥</span><span className="chef-llama der">🔥</span></>}
      <div className={'chef-cuerpo ' + anim}>
        <img className={'chef-img' + (actual.traje === 'amarillo' ? ' on' : '')} src={IMAGENES_CHEF[0]} alt="" width={550} height={1134} decoding="async" fetchPriority="high" />
        <img className={'chef-img' + (actual.traje === 'negro' ? ' on' : '')} src={IMAGENES_CHEF[1]} alt="" width={550} height={1134} decoding="async" />
        {destello > 0 && <span key={destello} className="chef-destello" />}
        {actual.corona && <Corona />}
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

/** Corona dorada (SVG propio) que se posa sobre el gorro desde "Rey de la pizza" */
function Corona() {
  return (
    <svg className="chef-corona" viewBox="0 0 120 80" aria-hidden="true">
      <defs><linearGradient id="corona-oro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE38A" /><stop offset=".55" stopColor="#F2B81F" /><stop offset="1" stopColor="#B9800E" /></linearGradient></defs>
      <path d="M8 72 L4 20 L32 44 L60 6 L88 44 L116 20 L112 72 Z" fill="url(#corona-oro)" stroke="#8a5d08" strokeWidth="3" strokeLinejoin="round" />
      <rect x="8" y="62" width="104" height="12" rx="4" fill="#E3A21A" stroke="#8a5d08" strokeWidth="2.5" />
      <circle cx="60" cy="40" r="7" fill="#D9463B" stroke="#7a1a12" strokeWidth="2" />
      <circle cx="30" cy="54" r="5" fill="#2E8B57" /><circle cx="90" cy="54" r="5" fill="#2E8B57" />
      <circle cx="4" cy="20" r="5" fill="#FFE38A" /><circle cx="60" cy="6" r="6" fill="#FFE38A" /><circle cx="116" cy="20" r="5" fill="#FFE38A" />
    </svg>
  );
}
