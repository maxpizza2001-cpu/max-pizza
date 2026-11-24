import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { cant } from '../../lib/formato';
import { Titulo, useConsulta, type Sede, type SedeSel } from './comun';

const CATEGORIAS: Record<string, string> = {
  ingredientes: 'Ingredientes', produccion: 'Producción interna', porciones: 'Porciones y personales', aseo: 'Aseo',
  empaques: 'Empaques', bebidas: 'Bebidas', masa: 'Masa',
};

type Fila = { sede: string; categoria: string; insumo: string; unidad: string; usado: number; merma: number; existencia: number };

export function Analisis({ sede }: { sede: SedeSel; sedes: Sede[] }) {
  const [dias, setDias] = useState(7);
  const [cat, setCat] = useState('');
  const { datos, error } = useConsulta('analisis', () =>
    rpc<Fila[]>('analisis_consumo', { p_sede: sede === 'todas' ? null : sede, p_dias: dias }), [sede, dias]);

  // Si es "todas las sedes" se suma por insumo; el detalle por sede queda abajo de cada uno
  const porInsumo = new Map<string, Fila & { sedes: Fila[] }>();
  for (const f of datos ?? []) {
    const k = f.insumo;
    const x = porInsumo.get(k) ?? { ...f, usado: 0, merma: 0, existencia: 0, sedes: [] };
    x.usado += Number(f.usado); x.merma += Number(f.merma); x.existencia += Number(f.existencia); x.sedes.push(f);
    porInsumo.set(k, x);
  }
  const filas = [...porInsumo.values()].filter((f) => !cat || f.categoria === cat);
  const cats = [...new Set((datos ?? []).map((f) => f.categoria))];
  const maxUso = Math.max(1, ...filas.map((f) => f.usado / (f.unidad === 'ml' || f.unidad === 'g' ? 1000 : 1)));

  return (
    <div className="pila">
      <Titulo>Análisis de consumo</Titulo>
      <div className="fila envolver" style={{ gap: 6 }}>
        {[[1, 'Hoy'], [7, 'Semana'], [30, '30 días']].map(([d, n]) => (
          <button key={d} className={'pastilla' + (dias === d ? ' activa' : '')} onClick={() => setDias(d as number)}>{n}</button>
        ))}
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c} value={c}>{CATEGORIAS[c] ?? c}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {Object.keys(CATEGORIAS).filter((c) => (!cat || c === cat) && filas.some((f) => f.categoria === c)).map((c) => (
        <div key={c} className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>{CATEGORIAS[c]}</h2>
          <div className="fila entre texto-sec" style={{ fontSize: 12, fontWeight: 700 }}>
            <span>Insumo</span><span className="cols3"><span>Usado</span><span>Merma</span><span>Existencia</span></span>
          </div>
          {filas.filter((f) => f.categoria === c).sort((a, b) => b.usado - a.usado).map((f) => {
            const uso = f.usado / (f.unidad === 'ml' || f.unidad === 'g' ? 1000 : 1);
            return (
              <div key={f.insumo} className="linea">
                <div className="fila entre">
                  <b style={{ fontSize: 14.5 }}>{f.insumo}</b>
                  <span className="cols3">
                    <b>{cant(f.usado, f.unidad)}</b>
                    <span className={f.merma ? 'txt-rojo' : 'texto-sec'}>{f.merma ? cant(f.merma, f.unidad) : '—'}</span>
                    <span>{cant(f.existencia, f.unidad)}</span>
                  </span>
                </div>
                <div className="barra-mini"><div style={{ width: `${(100 * uso) / maxUso}%` }} /></div>
                {sede === 'todas' && f.sedes.length > 1 && (
                  <div className="texto-sec" style={{ fontSize: 12 }}>{f.sedes.map((s) => `${s.sede}: ${cant(Number(s.usado), s.unidad)}`).join(' · ')}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {datos && filas.length === 0 && <div className="texto-sec">Sin movimientos en este periodo.</div>}
    </div>
  );
}
