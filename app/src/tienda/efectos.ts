// Efectos del carrito: el producto "vuela" hasta la bolsa, el contador salta y el confeti celebra.
// Todo es decoración: no bloquea toques (pointer-events: none) y se apaga con "reducir movimiento".
import { sonido } from './sonido';

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let origen: { rect: DOMRect; imagen: Element | null } | null = null;

/** Guarda desde dónde tocó el cliente (la foto de la tarjeta), para que el vuelo salga de ahí */
export function recordarOrigen(e: Event) {
  const t = (e.target as Element | null)?.closest?.('.t-card-premium, .t-combo, .rueda-pizza, .t-fav, .t-sug');
  if (!t) return;
  const img = t.querySelector('.t-card-foto svg, .t-card-foto img, .t-combo-img, .rueda-gira, .t-sug-img svg, .t-sug-img img, svg, img');
  origen = { rect: (img ?? t).getBoundingClientRect(), imagen: img };
}

/** Destino visible del vuelo: el botón central "Pedir" o, si no está, la bolsa de arriba */
function destino(): Element | null {
  const cands = ['.t-nav-pedir span', '.t-barra [aria-label="Mi carrito"]'];
  for (const c of cands) { const el = document.querySelector(c); if (el && el.getBoundingClientRect().width) return el; }
  return null;
}

/** Hace saltar un elemento (contador, botón) */
export function pop(el: Element | null) {
  if (!el || sinMovimiento()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
    { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' });
}

/** El producto vuela desde la tarjeta hasta el carrito; al llegar, el carrito salta */
export function volarAlCarrito() {
  sonido.efecto('agregar');
  const meta = destino();
  const o = origen; origen = null;
  if (!meta) return;
  if (!o || sinMovimiento()) { pop(meta); return; }
  const m = meta.getBoundingClientRect();
  const tam = Math.min(110, Math.max(56, o.rect.width * 0.7));
  const v = document.createElement('div');
  v.className = 't-vuelo';
  v.style.width = v.style.height = `${tam}px`;
  v.style.left = `${o.rect.left + o.rect.width / 2 - tam / 2}px`;
  v.style.top = `${o.rect.top + o.rect.height / 2 - tam / 2}px`;
  if (o.imagen) { const c = o.imagen.cloneNode(true) as HTMLElement; c.removeAttribute?.('style'); v.appendChild(c); } else v.textContent = '🍕';
  document.body.appendChild(v);
  const dx = m.left + m.width / 2 - (o.rect.left + o.rect.width / 2);
  const dy = m.top + m.height / 2 - (o.rect.top + o.rect.height / 2);
  const a = v.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(.8) rotate(180deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(360deg)`, opacity: 0.6 },
  ], { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)' });
  a.onfinish = () => { v.remove(); pop(meta); pop(document.querySelector('.t-barra .t-contador')); };
}

/** Lluvia de confeti en toda la pantalla (combos, pedido confirmado) */
export function confeti(cantidad = 36) {
  if (sinMovimiento()) return;
  const capa = document.createElement('div');
  capa.className = 't-confeti-capa';
  const colores = ['#E3A21A', '#F6D58A', '#141414', '#D9463B', '#2E8B57', '#ffffff'];
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colores[i % colores.length];
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    p.style.setProperty('--giro', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--x', `${Math.random() * 120 - 60}px`);
    capa.appendChild(p);
  }
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 3000);
}
