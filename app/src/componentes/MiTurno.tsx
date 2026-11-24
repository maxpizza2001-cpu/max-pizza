import { useEffect, useState } from 'react';
import { rpc, sb } from '../lib/supabase';
import { hora } from '../lib/formato';

type Turno = { id: string; inicio: string; rol: string; sede_id: string } | null;

/** Iniciar / Finalizar turno: registra persona, rol, sede y hora en el servidor. */
export function MiTurno({ sede, rol, perfil }: { sede: string; rol: string; perfil: string }) {
  const [turno, setTurno] = useState<Turno>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    const { data } = await sb.from('turnos').select('id, inicio, rol, sede_id').eq('perfil_id', perfil).is('fin', null).maybeSingle();
    setTurno(data);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, [perfil]);

  async function cambiar() {
    setError('');
    setCargando(true);
    try {
      if (turno) await rpc('finalizar_turno');
      else await rpc('iniciar_turno', { p_sede: sede, p_rol: rol });
      await cargar();
    } catch (e) { setError((e as Error).message); setCargando(false); }
  }

  return (
    <div className="tarjeta fila entre envolver">
      <div>
        <div className="titulo" style={{ fontSize: 17 }}>Mi turno</div>
        <div className="texto-sec">{turno ? `En turno desde ${hora(turno.inicio)}` : 'Todavía no has iniciado turno'}</div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
      <button className={'btn ' + (turno ? 'btn-negro' : 'btn-principal')} disabled={cargando} onClick={cambiar}>
        {turno ? 'Finalizar turno' : 'Iniciar turno'}
      </button>
    </div>
  );
}
