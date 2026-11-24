// Dibujos para productos sin foto: una pizza vista desde arriba (con ingredientes según el sabor) o un ícono en plato.
import type { CSSProperties } from 'react';

function azar(semilla: string) {
  let h = 2166136261;
  for (const c of semilla) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
}

type Ingrediente = { color: string; forma: 'circulo' | 'cuadro' | 'hoja' | 'trozo'; tam: number; cuantos: number };

function ingredientesDe(nombre: string): Ingrediente[] {
  const n = nombre.toLowerCase();
  if (n.includes('hawai')) return [
    { color: '#F6D55C', forma: 'cuadro', tam: 7, cuantos: 14 }, { color: '#E88A8A', forma: 'trozo', tam: 9, cuantos: 10 }];
  if (n.includes('pepper') || n.includes('salami')) return [{ color: '#B8322A', forma: 'circulo', tam: 11, cuantos: 13 }];
  if (n.includes('pollo')) return [
    { color: '#F4E7C8', forma: 'trozo', tam: 9, cuantos: 13 }, { color: '#5E9C3A', forma: 'hoja', tam: 5, cuantos: 9 }];
  if (n.includes('carne') || n.includes('mexic') || n.includes('ranch')) return [
    { color: '#6B3A24', forma: 'trozo', tam: 8, cuantos: 16 }, { color: '#2F7D32', forma: 'hoja', tam: 5, cuantos: 8 }, { color: '#D9463B', forma: 'circulo', tam: 5, cuantos: 8 }];
  if (n.includes('veget') || n.includes('champi')) return [
    { color: '#C9B79C', forma: 'circulo', tam: 8, cuantos: 10 }, { color: '#3E8E41', forma: 'hoja', tam: 6, cuantos: 12 }, { color: '#7A3E8E', forma: 'trozo', tam: 6, cuantos: 8 }];
  return [
    { color: '#B8322A', forma: 'circulo', tam: 9, cuantos: 8 }, { color: '#E88A8A', forma: 'trozo', tam: 8, cuantos: 8 }, { color: '#3E8E41', forma: 'hoja', tam: 5, cuantos: 8 }];
}

export function PizzaDibujo({ nombre, style }: { nombre: string; style?: CSSProperties }) {
  const r = azar(nombre);
  const puntos = (cuantos: number) => Array.from({ length: cuantos }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70;
    return { x: 100 + Math.cos(a) * d, y: 100 + Math.sin(a) * d, giro: r() * 360 };
  });
  const queso = Array.from({ length: 22 }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 72;
    return { x: 100 + Math.cos(a) * d, y: 100 + Math.sin(a) * d, rx: 8 + r() * 10, ry: 5 + r() * 7, giro: r() * 180 };
  });
  return (
    <svg viewBox="0 0 200 200" style={style} aria-hidden="true">
      <defs>
        <radialGradient id="borde" cx="50%" cy="45%" r="55%"><stop offset="80%" stopColor="#E7A94F" /><stop offset="100%" stopColor="#A9661F" /></radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#borde)" />
      <circle cx="100" cy="100" r="84" fill="#C8432B" />
      <circle cx="100" cy="100" r="80" fill="#F2C14E" />
      {queso.map((q, i) => <ellipse key={i} cx={q.x} cy={q.y} rx={q.rx} ry={q.ry} transform={`rotate(${q.giro} ${q.x} ${q.y})`} fill="#F8D978" opacity=".8" />)}
      {ingredientesDe(nombre).flatMap((ing, j) => puntos(ing.cuantos).map((p, i) => {
        const k = `${j}-${i}`;
        if (ing.forma === 'circulo') return <circle key={k} cx={p.x} cy={p.y} r={ing.tam} fill={ing.color} stroke="rgba(0,0,0,.15)" />;
        if (ing.forma === 'cuadro') return <rect key={k} x={p.x - ing.tam / 2} y={p.y - ing.tam / 2} width={ing.tam} height={ing.tam} rx="1.5" fill={ing.color} transform={`rotate(${p.giro} ${p.x} ${p.y})`} />;
        if (ing.forma === 'hoja') return <ellipse key={k} cx={p.x} cy={p.y} rx={ing.tam} ry={ing.tam / 2.2} fill={ing.color} transform={`rotate(${p.giro} ${p.x} ${p.y})`} />;
        return <path key={k} d={`M${p.x - ing.tam} ${p.y} q${ing.tam} ${-ing.tam} ${ing.tam * 2} 0 q${-ing.tam} ${ing.tam * .8} ${-ing.tam * 2} 0z`} fill={ing.color} transform={`rotate(${p.giro} ${p.x} ${p.y})`} />;
      }))}
      {[0, 45, 90, 135].map((a) => <line key={a} x1="100" y1="16" x2="100" y2="184" stroke="rgba(120,60,10,.25)" strokeWidth="1.2" transform={`rotate(${a} 100 100)`} />)}
    </svg>
  );
}

export function iconoDe(nombre: string, tipo: string) {
  const n = nombre.toLowerCase();
  if (n.includes('hamburg')) return '🍔';
  if (n.includes('salchipapa') || n.includes('papa')) return '🍟';
  if (n.includes('perro')) return '🌭';
  if (n.includes('costilla')) return '🍖';
  if (n.includes('picada')) return '🥩';
  if (n.includes('sándwich') || n.includes('sandwich')) return '🥪';
  if (n.includes('jugo')) return '🧃';
  if (n.includes('agua')) return '💧';
  if (tipo === 'bebida') return '🥤';
  return '🍽️';
}

/** Imagen redonda del producto: foto si hay; si no, pizza dibujada o ícono en plato. */
export function ImagenProducto({ p, tam }: { p: { nombre: string; foto_url: string | null; categoria_tipo: string }; tam: number }) {
  if (p.foto_url) return <img className="t-foto" src={p.foto_url} alt={p.nombre} style={{ width: tam, height: tam }} loading="lazy" />;
  if (p.categoria_tipo === 'pizza') return <PizzaDibujo nombre={p.nombre} style={{ width: tam, height: tam, display: 'block' }} />;
  return <div className="t-plato" style={{ width: tam, height: tam, fontSize: tam * 0.45 }}>{iconoDe(p.nombre, p.categoria_tipo)}</div>;
}
