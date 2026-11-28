// Actividad general: lo último que pasó en tus sedes (cobros, pedidos, tareas, stock bajo, turnos y cambios de Administración)
import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { hora } from '../../lib/formato';
import { Titulo, useConsulta, type Sede, type SedeSel } from './comun';

const TIPOS: Record<string, [string, string]> = {
  pedido: ['🧾', 'Pedidos'], cobro: ['💵', 'Cobros'], tarea: ['☑', 'Tareas'], stock_bajo: ['⚠', 'Stock bajo'], turno: ['🕒', 'Turnos'], admin: ['⚙', 'Administración'],
};

export function Actividad({ sede }: { sede: SedeSel; sedes: Sede[] }) {
  const [tipo, setTipo] = useState('');
  const { datos, error } = useConsulta('actividad', () =>
    rpc<{ hora: string; sede: string | null; persona: string | null; tipo: string; texto: string }[]>('actividad_reciente',
      { p_sedes: sede === 'todas' ? null : [sede], p_limite: 150 }), [sede], ['pagos', 'pedidos', 'tareas', 'alertas_stock', 'turnos']);
  const lista = (datos ?? []).filter((a) => !tipo || a.tipo === tipo);
  const dia = (d: string) => new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'short' });
  let ultimoDia = '';
  return (
    <div className="pila">
      <Titulo>Actividad general</Titulo>
      <div className="texto-sec">Lo que pasó en los últimos 3 días{sede === 'todas' ? ' en todas tus sedes' : ''}. Se actualiza solo.</div>
      <div className="fila envolver" style={{ gap: 6 }}>
        <button className={'pastilla' + (!tipo ? ' activa' : '')} onClick={() => setTipo('')}>Todo</button>
        {Object.entries(TIPOS).map(([k, [ic, n]]) => (
          <button key={k} className={'pastilla' + (tipo === k ? ' activa' : '')} onClick={() => setTipo(k)}>{ic} {n}</button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {datos && lista.length === 0 && <div className="texto-sec">Sin actividad.</div>}
      <div className="tarjeta">
        {lista.map((a, i) => {
          const d = dia(a.hora); const cabeza = d !== ultimoDia; ultimoDia = d;
          return (
            <div key={i}>
              {cabeza && <div className="texto-sec" style={{ fontWeight: 800, fontSize: 12.5, textTransform: 'capitalize', margin: i ? '12px 0 4px' : '0 0 4px' }}>{d}</div>}
              <div className="fila entre linea" style={{ gap: 10 }}>
                <span><span aria-hidden>{TIPOS[a.tipo]?.[0]}</span> {a.texto}
                  <span className="texto-sec" style={{ fontSize: 13 }}>{a.persona ? ` · ${a.persona}` : ''}{a.sede && sede === 'todas' ? ` · ${a.sede}` : ''}</span></span>
                <span className="texto-sec" style={{ whiteSpace: 'nowrap' }}>{hora(a.hora)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
