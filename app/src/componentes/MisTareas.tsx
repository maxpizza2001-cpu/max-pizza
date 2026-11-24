import { useCallback, useEffect, useState } from 'react';
import { rpc, sb } from '../lib/supabase';
import { hora, PRIORIDAD } from '../lib/formato';
import { Anillo, Barra } from './Anillo';

export type Tarea = {
  id: string; titulo: string; detalle: string | null; prioridad: 'alta' | 'media' | 'baja';
  estado: 'pendiente' | 'en_proceso' | 'lista' | 'archivada'; origen: string; accion: string | null;
  tomada_en: string | null; terminada_en: string | null;
};

/** "Quedan 7 porcion · mínimo 7" → "Quedan 7 porciones · mínimo 7"; 1500 ml → 1,5 L */
const bonito = (d: string) => d
  .replace(/(\d+(?:\.\d+)?) porcion\b/g, (_, n) => `${n} ${n === '1' ? 'porción' : 'porciones'}`)
  .replace(/(\d+(?:\.\d+)?) (ml|g)\b/g, (x, n, u) =>
    (Number(n) >= 1000 ? `${(Number(n) / 1000).toLocaleString('es-CO')} ${u === 'ml' ? 'L' : 'kg'}` : x))
  .replace(/(\d+(?:\.\d+)?) torta\b/g, (_, n) => `${n} ${n === '1' ? 'torta' : 'tortas'}`);

const ordenPrioridad = { alta: 0, media: 1, baja: 2 } as const;
const ordenEstado = { en_proceso: 0, pendiente: 1, lista: 2, archivada: 3 } as const;

/** Botón vinculado a la operación de la tarea. 'despues' = primero Empezar y luego la operación (ej. producción). */
const ACCIONES: [string, string, boolean][] = [
  ['registrar_base', 'Registrar base', false], ['portapizzas', 'Armar portapizzas', false],
  ['subir_nevera:', 'Subir a nevera', false], ['retirar:', 'Retirar insumo', false],
  ['rueda:', 'Registrar rueda', true], ['tortas', 'Registrar tortas', true], ['produccion:', 'Marcar lista', true],
];
export const accionDe = (a: string | null) => (a ? ACCIONES.find(([p]) => a === p || (p.endsWith(':') && a.startsWith(p))) : undefined);

/** Checklist personal con su gráfica. Se actualiza en vivo cuando entra o cambia una tarea. */
export function MisTareas({ sede, rol, perfil, compacto = false, onAccion }: {
  sede: string; rol: string; perfil: string; compacto?: boolean; onAccion?: (accion: string, tarea: Tarea) => void;
}) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const t = await rpc<Tarea[]>('tareas_vigentes', { p_sede: sede, p_rol: rol, p_perfil: perfil });
      setTareas(t ?? []);
    } catch (e) { setError((e as Error).message); }
  }, [sede, rol, perfil]);

  useEffect(() => {
    cargar();
    const canal = sb.channel(`tareas-${sede}-${rol}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas', filter: `sede_id=eq.${sede}` }, cargar)
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [sede, rol, cargar]);

  async function accion(fn: 'tarea_empezar' | 'tarea_completar' | 'tarea_reabrir', id: string) {
    setError('');
    try { await rpc(fn, { p_tarea: id }); await cargar(); } catch (e) { setError((e as Error).message); }
  }

  const listas = tareas.filter((t) => t.estado === 'lista').length;
  const ordenadas = [...tareas].sort((a, b) =>
    ordenEstado[a.estado] - ordenEstado[b.estado] || ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);

  return (
    <div className="pila">
      <div className="tarjeta">
        {compacto ? <Barra listas={listas} total={tareas.length} /> : <Anillo listas={listas} total={tareas.length} />}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="tarjeta">
        {tareas.length === 0 && <div className="texto-sec">Sin tareas asignadas</div>}
        {ordenadas.map((t) => (
          <div key={t.id} className={'tarea' + (t.estado === 'lista' ? ' hecha' : '')}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tarea-titulo">{t.titulo}</div>
              <div className="texto-sec" style={{ fontSize: 13 }}>
                {t.detalle ? bonito(t.detalle) : (t.origen === 'automatica' ? 'Automática' : '')}
                {t.estado === 'en_proceso' && ` · Empezó ${hora(t.tomada_en)}`}
                {t.estado === 'lista' && ` · Lista ${hora(t.terminada_en)}`}
              </div>
            </div>
            {t.estado === 'lista' ? (
              <button className="estado estado-lista" style={{ border: 0, cursor: 'pointer' }}
                title="Tocar para reabrir" onClick={() => accion('tarea_reabrir', t.id)}>✓ Lista</button>
            ) : (
              <>
                <span className={`estado estado-${t.prioridad}`}>● {PRIORIDAD[t.prioridad]}</span>
                {onAccion && accionDe(t.accion) && !(accionDe(t.accion)![2] && t.estado === 'pendiente')
                  ? <button className="btn btn-principal" style={{ padding: '9px 12px', fontSize: 14 }} onClick={() => onAccion(t.accion!, t)}>{accionDe(t.accion)![1]}</button>
                  : t.estado === 'pendiente'
                  ? <button className="btn btn-suave" style={{ padding: '9px 12px', fontSize: 14 }} onClick={() => accion('tarea_empezar', t.id)}>Empezar</button>
                  : <button className="btn btn-principal" style={{ padding: '9px 12px', fontSize: 14 }} onClick={() => accion('tarea_completar', t.id)}>Marcar lista</button>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
