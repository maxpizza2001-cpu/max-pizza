import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/supabase';
import { pitar, useComandas } from '../lib/datos';
import { TarjetaComanda } from '../componentes/Piezas';
import { MisTareas } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';

/** Comidas rápidas: vista de comandas (tablet fija) y vista personal (turno y tareas; la nevera llega en la Fase 3). */
export function Rapidas({ sede, perfil }: { sede: string; perfil: string }) {
  const [vista, setVista] = useState<'comandas' | 'personal'>(() => (localStorage.getItem('mp.rapidas.vista') as any) ?? 'comandas');
  const cambiar = (v: 'comandas' | 'personal') => { setVista(v); localStorage.setItem('mp.rapidas.vista', v); };

  return (
    <main className="contenido pila" style={{ maxWidth: vista === 'comandas' ? 1280 : 640 }}>
      <div className="fila entre envolver">
        <h1>{vista === 'comandas' ? 'Comandas · Comidas rápidas' : 'Comidas rápidas'}</h1>
        <div className="fila" style={{ gap: 6 }}>
          <button className={'pastilla' + (vista === 'comandas' ? ' activa' : '')} onClick={() => cambiar('comandas')}>Tablet de comandas</button>
          <button className={'pastilla' + (vista === 'personal' ? ' activa' : '')} onClick={() => cambiar('personal')}>Mi turno y tareas</button>
        </div>
      </div>
      {vista === 'comandas' ? <Comandas sede={sede} /> : (
        <>
          <MiTurno sede={sede} rol="rapidas" perfil={perfil} />
          <h2>Mis tareas</h2>
          <MisTareas sede={sede} rol="rapidas" perfil={perfil} />
        </>
      )}
    </main>
  );
}

function Comandas({ sede }: { sede: string }) {
  const { comandas } = useComandas(sede, { estacion: 'rapidas', estados: ['nueva', 'en_preparacion'] });
  const [error, setError] = useState('');
  const vistas = useRef<Set<string> | null>(null);

  // Aviso breve cuando llega una comanda nueva
  useEffect(() => {
    const ids = new Set(comandas.map((c) => c.id));
    if (vistas.current && [...ids].some((id) => !vistas.current!.has(id))) pitar();
    vistas.current = ids;
  }, [comandas]);

  async function cambiar(id: string, estado: string) {
    setError('');
    try { await rpc('comanda_estado', { p_comanda: id, p_estado: estado }); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {comandas.length === 0 && <div className="tarjeta texto-sec" style={{ textAlign: 'center', padding: 40, fontSize: 18 }}>Sin comandas pendientes 👌</div>}
      <div className="rejilla-comandas grande">
        {comandas.map((c) => <TarjetaComanda key={c.id} c={c} grande onEstado={cambiar} />)}
      </div>
    </>
  );
}
