// Portada giratoria: los productos van montados en una rueda grande; al deslizar el dedo la rueda gira
// y la siguiente pizza sube rodando al centro. Cada pizza además gira sobre sí misma.
import { useEffect, useRef, useState } from 'react';
import { plata } from '../lib/formato';
import { ImagenProducto } from './Dibujos';
import type { Plato } from './modelo';

const PASO = 34;        // grados entre una pizza y la siguiente
const RADIO = 430;      // radio de la rueda (px)
const GRADOS_POR_PX = 0.13;

export function Rueda({ items, onElegir }: { items: Plato[]; onElegir: (p: Plato) => void }) {
  // Con pocos productos se repiten, para que la rueda siempre se vea llena
  const lista = items.length >= 8 ? items : Array.from({ length: Math.ceil(8 / Math.max(items.length, 1)) }, () => items).flat();
  const n = lista.length;
  const [pos, setPos] = useState(0);              // posición sin límite (permite girar siempre hacia el mismo lado)
  const [arrastre, setArrastre] = useState(0);    // grados mientras el dedo arrastra
  const inicio = useRef<{ x: number; t: number } | null>(null);
  const [pausa, setPausa] = useState(false);

  useEffect(() => {
    if (pausa || n < 2) return;
    const t = setInterval(() => setPos((p) => p + 1), 4200);
    return () => clearInterval(t);
  }, [pausa, n]);

  if (!n) return null;
  const actual = lista[((pos % n) + n) % n];
  const giro = -pos * PASO + arrastre;

  function soltar(x: number) {
    if (!inicio.current) return;
    const dx = x - inicio.current.x;
    const rapido = Math.abs(dx) / Math.max(Date.now() - inicio.current.t, 1) > 0.5;
    const pasos = Math.round((dx * GRADOS_POR_PX) / PASO) || (Math.abs(dx) > 30 || rapido ? Math.sign(dx) : 0);
    setPos((p) => p - pasos);
    setArrastre(0);
    inicio.current = null;
    setTimeout(() => setPausa(false), 6000);
  }

  return (
    <div className="rueda-zona">
      <div className="rueda"
        onPointerDown={(e) => { inicio.current = { x: e.clientX, t: Date.now() }; setPausa(true); (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (inicio.current) setArrastre((e.clientX - inicio.current.x) * GRADOS_POR_PX); }}
        onPointerUp={(e) => soltar(e.clientX)}
        onPointerCancel={(e) => soltar(e.clientX)}>
        <div className="rueda-aro" />
        <div className="rueda-giro" style={{ transform: `rotate(${giro}deg)`, transition: arrastre ? 'none' : undefined }}>
          {lista.map((p, k) => {
            // cada pizza se pone en la copia más cercana de la vuelta, para que la rueda no tenga fin
            const vuelta = Math.round((pos - k) / n) * n;
            const angulo = (k + vuelta) * PASO;
            const cerca = Math.abs(k + vuelta - pos) < 0.5;
            return (
              <div key={k} className="rueda-item" style={{ transform: `rotate(${angulo}deg) translateY(-${RADIO}px)` }}>
                <button className={'rueda-pizza' + (cerca ? ' activa' : '')} aria-label={p.nombre}
                  onClick={() => { if (cerca) onElegir(p); else setPos(k + vuelta); }}>
                  <div className="rueda-sombra" />
                  <div className="rueda-gira"><ImagenProducto p={p} tam={230} /></div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rueda-info" key={actual.id + pos}>
        <div className="rueda-cat">{actual.categoria}</div>
        <h2 className="rueda-nombre">{actual.nombre}</h2>
        {actual.descripcion && <p className="rueda-desc">{actual.descripcion}</p>}
        <div className="fila" style={{ gap: 14, justifyContent: 'center' }}>
          <span className="rueda-precio">{plata(actual.precio)}</span>
          <button className="t-btn" onClick={() => onElegir(actual)}>Pedir ahora</button>
        </div>
        <div className="rueda-puntos">
          {items.slice(0, 10).map((p, i) => <span key={p.id} className={((pos % items.length) + items.length) % items.length === i ? 'on' : ''} />)}
        </div>
        <div className="rueda-ayuda">← Desliza para girar →</div>
      </div>
    </div>
  );
}
