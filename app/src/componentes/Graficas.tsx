// Gráficas sencillas en SVG (sin librerías): barras, líneas, dona y barras por sede.
// Tocar o pasar el mouse por una barra, punto o pedazo muestra su detalle. Se leen bien en celular y computador.
import { useState, type ReactNode } from 'react';

// Colores de series: orden fijo, nunca se reparten según el ranking (paleta validada para daltonismo)
export const COLORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

function Detalle({ children }: { children: ReactNode }) {
  return <div className="g-detalle" role="status">{children}</div>;
}

export type Barra = { clave: string; nombre: string; valor: number; texto: string; color?: string; extra?: string };

/** Barras horizontales: el nombre a la izquierda, la cifra al final de la barra. */
export function BarrasH({ datos, vacio = 'Sin datos en este período.' }: { datos: Barra[]; vacio?: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1e-9, ...datos.map((d) => d.valor));
  if (!datos.length) return <div className="texto-sec">{vacio}</div>;
  const s = datos.find((d) => d.clave === sel);
  return (
    <div className="pila" style={{ gap: 6 }}>
      {datos.map((d) => (
        <button key={d.clave} className={'g-barra' + (sel === d.clave ? ' activa' : '')} onClick={() => setSel(sel === d.clave ? null : d.clave)}
          onMouseEnter={() => setSel(d.clave)} title={`${d.nombre}: ${d.texto}`}>
          <span className="g-barra-nombre">{d.nombre}</span>
          <span className="g-barra-pista"><span className="g-barra-relleno" style={{ width: `${Math.max(1.5, (100 * d.valor) / max)}%`, background: d.color ?? COLORES[0] }} /></span>
          <span className="g-barra-cifra">{d.texto}</span>
        </button>
      ))}
      {s && <Detalle><b>{s.nombre}</b> · {s.texto}{s.extra ? ` · ${s.extra}` : ''}</Detalle>}
    </div>
  );
}

export type Serie = { nombre: string; color: string; valores: number[] };

/** Líneas de tendencia sobre un mismo eje (misma unidad). Tocar un punto del eje muestra todos los valores de ese día/mes. */
export function Lineas({ etiquetas, series, formato }: { etiquetas: string[]; series: Serie[]; formato: (v: number) => string }) {
  const [i, setI] = useState<number | null>(null);
  const W = 640, H = 220, iz = 8, de = 8, ar = 12, ab = 26;
  const max = Math.max(1e-9, ...series.flatMap((s) => s.valores));
  const x = (k: number) => iz + (etiquetas.length <= 1 ? (W - iz - de) / 2 : (k * (W - iz - de)) / (etiquetas.length - 1));
  const y = (v: number) => ar + (H - ar - ab) * (1 - v / max);
  const cada = Math.max(1, Math.ceil(etiquetas.length / 8));
  if (!etiquetas.length) return <div className="texto-sec">Sin datos en este período.</div>;
  return (
    <div className="pila" style={{ gap: 6 }}>
      <div className="g-leyenda">{series.map((s) => <span key={s.nombre}><i style={{ background: s.color }} />{s.nombre}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="g-svg" role="img" aria-label={series.map((s) => s.nombre).join(' y ') + ' en el tiempo'}
        onMouseLeave={() => setI(null)}>
        {[0.25, 0.5, 0.75, 1].map((p) => <line key={p} x1={iz} x2={W - de} y1={y(max * p)} y2={y(max * p)} stroke="#E8E2D6" strokeWidth={1} />)}
        <line x1={iz} x2={W - de} y1={y(0)} y2={y(0)} stroke="#CFC7B8" strokeWidth={1} />
        {etiquetas.map((e, k) => k % cada === 0 && <text key={k} x={x(k)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6B665D">{e}</text>)}
        {i !== null && <line x1={x(i)} x2={x(i)} y1={ar} y2={y(0)} stroke="#141414" strokeOpacity={0.35} strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.nombre}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.valores.map((v, k) => `${x(k)},${y(v)}`).join(' ')} />
            {s.valores.map((v, k) => (etiquetas.length <= 31 || k === i) &&
              <circle key={k} cx={x(k)} cy={y(v)} r={k === i ? 5 : 3} fill={s.color} stroke="#fff" strokeWidth={2} />)}
          </g>
        ))}
        {/* zonas para tocar: más grandes que los puntos */}
        {etiquetas.map((_, k) => (
          <rect key={k} x={x(k) - (W / Math.max(etiquetas.length, 1)) / 2} y={0} width={W / Math.max(etiquetas.length, 1)} height={H}
            fill="transparent" onMouseEnter={() => setI(k)} onClick={() => setI(k)} />
        ))}
      </svg>
      {i !== null && <Detalle><b>{etiquetas[i]}</b>{series.map((s) => <span key={s.nombre}> · <i className="g-punto" style={{ background: s.color }} />{s.nombre}: {formato(s.valores[i])}</span>)}</Detalle>}
    </div>
  );
}

/** Dona de reparto (pocas partes). Cada parte lleva su nombre y % en la leyenda; tocar muestra el detalle. */
export function Dona({ datos, formato }: { datos: { clave: string; nombre: string; valor: number; color: string }[]; formato: (v: number) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  const total = datos.reduce((a, d) => a + d.valor, 0);
  if (!total) return <div className="texto-sec">Sin datos en este período.</div>;
  const R = 70, r = 44, c = 80;
  let ang = -Math.PI / 2;
  const arcos = datos.filter((d) => d.valor > 0).map((d) => {
    const a0 = ang, a1 = ang + (2 * Math.PI * d.valor) / total; ang = a1;
    const g = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
    const path = d.valor === total
      ? `M ${c - R},${c} a ${R},${R} 0 1,0 ${2 * R},0 a ${R},${R} 0 1,0 ${-2 * R},0 M ${c - r},${c} a ${r},${r} 0 1,1 ${2 * r},0 a ${r},${r} 0 1,1 ${-2 * r},0`
      : `M ${p(R, a0)} A ${R},${R} 0 ${g} 1 ${p(R, a1)} L ${p(r, a1)} A ${r},${r} 0 ${g} 0 ${p(r, a0)} Z`;
    return { ...d, path };
  });
  const s = datos.find((d) => d.clave === sel);
  return (
    <div className="g-dona">
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label="Reparto">
        {arcos.map((a) => <path key={a.clave} d={a.path} fill={a.color} stroke="#fff" strokeWidth={2} fillRule="evenodd"
          opacity={sel && sel !== a.clave ? 0.45 : 1} onMouseEnter={() => setSel(a.clave)} onClick={() => setSel(a.clave)} style={{ cursor: 'pointer' }} />)}
        <text x={c} y={c - 2} textAnchor="middle" fontSize={12} fill="#6B665D">{s ? Math.round((100 * s.valor) / total) + '%' : 'Total'}</text>
        <text x={c} y={c + 14} textAnchor="middle" fontSize={12} fontWeight={800} fill="#141414">{formato(s ? s.valor : total)}</text>
      </svg>
      <div className="pila" style={{ gap: 4 }}>
        {datos.map((d) => (
          <button key={d.clave} className={'g-ley-fila' + (sel === d.clave ? ' activa' : '')} onClick={() => setSel(sel === d.clave ? null : d.clave)}>
            <i style={{ background: d.color }} /><span>{d.nombre}</span><b>{Math.round((100 * d.valor) / total)}%</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Comparación entre sedes: por cada producto, una barra delgada por sede (misma escala). */
export function BarrasSedes({ productos, sedes, valor, formato }: {
  productos: string[]; sedes: { id: string; nombre: string; color: string }[]; valor: (producto: string, sede: string) => number; formato: (v: number) => string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1e-9, ...productos.flatMap((p) => sedes.map((s) => valor(p, s.id))));
  if (!productos.length) return <div className="texto-sec">Sin datos en este período.</div>;
  return (
    <div className="pila" style={{ gap: 10 }}>
      <div className="g-leyenda">{sedes.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.nombre}</span>)}</div>
      {productos.map((p) => (
        <button key={p} className={'g-grupo' + (sel === p ? ' activa' : '')} onClick={() => setSel(sel === p ? null : p)} onMouseEnter={() => setSel(p)}>
          <span className="g-barra-nombre">{p}</span>
          <span className="pila" style={{ gap: 3, flex: 1 }}>
            {sedes.map((s) => (
              <span key={s.id} className="g-barra-pista fina"><span className="g-barra-relleno" style={{ width: `${Math.max(1, (100 * valor(p, s.id)) / max)}%`, background: s.color }} /></span>
            ))}
          </span>
        </button>
      ))}
      {sel && <Detalle><b>{sel}</b>{sedes.map((s) => <span key={s.id}> · <i className="g-punto" style={{ background: s.color }} />{s.nombre}: {formato(valor(sel, s.id))}</span>)}</Detalle>}
    </div>
  );
}
