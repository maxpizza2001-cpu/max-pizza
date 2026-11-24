import { useCallback, useEffect, useState } from 'react';
import { rpc, sb } from '../lib/supabase';
import { hora, PRIORIDAD } from '../lib/formato';
import { Anillo, Barra } from './Anillo';

export type Tarea = {
  id: string; titulo: string; detalle: string | null; prioridad: 'alta' | 'media' | 'baja';
  estado: 'pendiente' | 'en_proceso' | 'lista' | 'archivada'; origen: string; accion: string | null;
  tomada_en: string | null; terminada_en: string | null;
};

const ordenPrioridad = { alta: 0, media: 1, baja: 2 } as const;
const ordenEstado = { en_proceso: 0, pendiente: 1, lista: 2, archivada: 3 } as const;

/** Checklist personal con su gráfica. Se actualiza en vivo cuando entra o cambia una tarea. */
export function MisTareas({ sede, rol, perfil, compacto = false }: { sede: string; rol: string; perfil: string; compacto?: boolean }) {
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
                {t.detalle ?? (t.origen === 'automatica' ? 'Automática' : '')}
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
                {t.estado === 'pendiente'
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
