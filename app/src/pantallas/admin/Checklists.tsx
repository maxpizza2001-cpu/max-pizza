import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
import { hora, PRIORIDAD, ROLES } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { guardar, q, Titulo, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

const ROLES_EQUIPO = Object.entries(ROLES);
const ESTADO: Record<string, [string, string]> = {
  pendiente: ['Pendiente', 'estado-proceso'], en_proceso: ['En proceso', 'estado-media'], lista: ['✓ Lista', 'estado-lista'], archivada: ['Archivada', 'estado-proceso'],
};

export function Checklists({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [vista, setVista] = useState<'tareas' | 'plantillas'>('tareas');
  const [nueva, setNueva] = useState(false);
  return (
    <div className="pila">
      <Titulo accion={<button className="btn btn-principal" onClick={() => setNueva(true)}>＋ Nueva tarea</button>}>Checklists</Titulo>
      <div className="fila" style={{ gap: 6 }}>
        <button className={'pastilla' + (vista === 'tareas' ? ' activa' : '')} onClick={() => setVista('tareas')}>Tareas de hoy</button>
        <button className={'pastilla' + (vista === 'plantillas' ? ' activa' : '')} onClick={() => setVista('plantillas')}>Plantillas por turno</button>
      </div>
      {vista === 'tareas' ? <TareasHoy sede={sede} sedes={sedes} /> : <Plantillas sede={sede} sedes={sedes} />}
      {nueva && <NuevaTarea sede={sede} sedes={sedes} onCerrar={() => setNueva(false)} />}
    </div>
  );
}

function TareasHoy({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const { datos: tareas } = useConsulta('adm-tareas', () => {
    let x = sb.from('tareas').select(`id, sede_id, rol, titulo, detalle, prioridad, estado, origen, creada_en, tomada_en, terminada_en, hora_programada, recordatorio_en, recordatorio_enviado, repeticion,
      asignada:perfiles!tareas_asignada_a_fkey(nombre), tomada:perfiles!tareas_tomada_por_fkey(nombre), terminada:perfiles!tareas_terminada_por_fkey(nombre)`)
      .or(`estado.in.(pendiente,en_proceso),terminada_en.gte.${inicioHoy.toISOString()}`).order('creada_en');
    if (sede !== 'todas') x = x.eq('sede_id', sede);
    return q<any[]>(x);
  }, [sede], ['tareas']);

  const grupos = new Map<string, any[]>();
  for (const t of tareas ?? []) {
    if (t.estado === 'archivada') continue;
    const k = `${t.sede_id}|${t.rol}`; grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }

  return (
    <div className="pila">
      {grupos.size === 0 && <div className="texto-sec">No hay tareas vigentes.</div>}
      {[...grupos.entries()].map(([k, ts]) => {
        const [s, rol] = k.split('|');
        const listas = ts.filter((t) => t.estado === 'lista').length;
        const pct = Math.round((100 * listas) / ts.length);
        return (
          <div key={k} className="tarjeta">
            <button className="fila entre" style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setAbierto(abierto === k ? null : k)}>
              <b style={{ fontSize: 16 }}>{ROLES[rol]}{sede === 'todas' ? ` · ${nombreSede(s)}` : ''}</b>
              <span style={{ fontWeight: 700 }}>{listas} de {ts.length} · {pct} %</span>
            </button>
            <div className="barra-mini"><div style={{ width: `${pct}%` }} /></div>
            {abierto === k && ts.sort((a, b) => ['alta', 'media', 'baja'].indexOf(a.prioridad) - ['alta', 'media', 'baja'].indexOf(b.prioridad)).map((t) => (
              <FilaTarea key={t.id} t={t} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function FilaTarea({ t }: { t: any }) {
  const [editar, setEditar] = useState(false);
  const [e, se] = ESTADO[t.estado];
  return (
    <div className="linea">
      <div className="fila entre envolver" style={{ gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <b>{t.titulo}</b> {t.origen === 'automatica' && <span className="texto-sec">· automática</span>}
          <div className="texto-sec" style={{ fontSize: 12.5 }}>
            {t.hora_programada && `⏰ ${hora(t.hora_programada)}${t.recordatorio_en ? (t.recordatorio_enviado ? ' · recordatorio enviado' : ' · recordatorio ' + hora(t.recordatorio_en)) : ''}${t.repeticion ? ' · se repite ' + (t.repeticion === 'diaria' ? 'cada día' : 'cada semana') : ''} · `}
            {t.detalle && `${t.detalle} · `}Recibida {hora(t.creada_en)}{t.asignada ? ` · para ${t.asignada.nombre}` : ' · para el área'}
            {t.tomada && ` · empezó ${t.tomada.nombre} ${hora(t.tomada_en)}`}
            {t.terminada && ` · terminó ${t.terminada.nombre} ${hora(t.terminada_en)}`}
          </div>
        </div>
        <div className="fila" style={{ gap: 6 }}>
          <span className={`estado estado-${t.prioridad}`}>● {PRIORIDAD[t.prioridad]}</span>
          <span className={`estado ${se}`}>{e}</span>
          <button className="enlace" onClick={() => setEditar(true)}>Editar</button>
        </div>
      </div>
      {editar && <EditarTarea t={t} onCerrar={() => setEditar(false)} />}
    </div>
  );
}

function EditarTarea({ t, onCerrar }: { t: any; onCerrar: () => void }) {
  const [f, setF] = useState({ titulo: t.titulo, prioridad: t.prioridad, rol: t.rol, detalle: t.detalle ?? '' });
  const aviso = useAviso();
  async function hacer(cambios: Record<string, unknown>) {
    try { await rpc('tarea_editar', { p_tarea: t.id, p_cambios: cambios }); onCerrar(); } catch (e) { aviso.error(e); }
  }
  return (
    <Ventana titulo="Editar tarea" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo"><label>Tarea</label><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
        <div className="campo"><label>Detalle</label><input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Prioridad</label>
            <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
          <div className="campo" style={{ flex: 1 }}><label>Área</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
              {ROLES_EQUIPO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        </div>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" onClick={() => hacer({ ...f, detalle: f.detalle || null })}>Guardar cambios</button>
        <button className="btn btn-negro btn-ancho" onClick={() => hacer({ estado: 'archivada' })}>Archivar tarea</button>
      </div>
    </Ventana>
  );
}

function NuevaTarea({ sede, sedes, onCerrar }: { sede: SedeSel; sedes: Sede[]; onCerrar: () => void }) {
  const [f, setF] = useState({ sede: sede !== 'todas' ? sede : sedes[0]?.id ?? '', rol: 'mesero', titulo: '', prioridad: 'media', asignada: '', detalle: '',
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), hora: '', recordar: '', recordarHora: '', repeticion: '' });
  const aviso = useAviso();
  const { datos: personas } = useConsulta('personas-' + f.sede + f.rol, () =>
    q<any[]>(sb.from('accesos_sede').select('perfil_id, perfiles(nombre)').eq('sede_id', f.sede).eq('rol', f.rol)), [f.sede, f.rol]);
  async function crear() {
    try {
      const id = await rpc<string>('tarea_crear', { p_sede: f.sede, p_rol: f.rol, p_titulo: f.titulo, p_prioridad: f.prioridad,
        p_asignada: f.asignada || null, p_detalle: f.detalle || null });
      if (f.hora) {
        // Hora de Colombia (UTC−5, sin horario de verano)
        const enCo = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-05:00`).toISOString();
        await rpc('tarea_horario', { p_tarea: id, p_hora: enCo(f.fecha, f.hora),
          p_recordar_min: f.recordar === '' || f.recordar === 'otra' ? null : Number(f.recordar),
          p_recordar_en: f.recordar === 'otra' && f.recordarHora ? enCo(f.fecha, f.recordarHora) : null,
          p_repeticion: f.repeticion || null });
      }
      onCerrar();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Ventana titulo="Nueva tarea" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo"><label>Tarea</label><input autoFocus placeholder="Ej: Lavar la nevera" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Sede</label>
            <select value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value, asignada: '' })}>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div className="campo" style={{ flex: 1 }}><label>Área</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value, asignada: '' })}>{ROLES_EQUIPO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        </div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Para</label>
            <select value={f.asignada} onChange={(e) => setF({ ...f, asignada: e.target.value })}>
              <option value="">Toda el área</option>
              {(personas ?? []).map((p) => <option key={p.perfil_id} value={p.perfil_id}>{p.perfiles?.nombre}</option>)}
            </select></div>
          <div className="campo" style={{ flex: 1 }}><label>Prioridad</label>
            <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
        </div>
        <div className="campo"><label>Descripción o instrucción (opcional)</label><input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Fecha</label><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          <div className="campo" style={{ flex: 1 }}><label>Hora (opcional)</label><input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></div>
        </div>
        {f.hora && <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Recordatorio al celular</label>
            <select value={f.recordar} onChange={(e) => setF({ ...f, recordar: e.target.value })}>
              <option value="">Sin recordatorio</option><option value="0">A la hora de la tarea</option>
              <option value="5">5 minutos antes</option><option value="10">10 minutos antes</option>
              <option value="15">15 minutos antes</option><option value="30">30 minutos antes</option>
              <option value="otra">Otra hora…</option>
            </select></div>
          {f.recordar === 'otra' && <div className="campo" style={{ flex: 1 }}><label>Hora del recordatorio</label>
            <input type="time" value={f.recordarHora} onChange={(e) => setF({ ...f, recordarHora: e.target.value })} /></div>}
          <div className="campo" style={{ flex: 1 }}><label>Repetir</label>
            <select value={f.repeticion} onChange={(e) => setF({ ...f, repeticion: e.target.value })}>
              <option value="">No se repite</option><option value="diaria">Todos los días</option><option value="semanal">Cada semana</option>
            </select></div>
        </div>}
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.titulo.trim() || !f.sede} onClick={crear}>Enviar tarea</button>
      </div>
    </Ventana>
  );
}

function Plantillas({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const aviso = useAviso();
  const [f, setF] = useState({ rol: 'mesero', titulo: '', prioridad: 'media', sede: 'todas' });
  const { datos: lista } = useConsulta('plantillas', () =>
    q<any[]>(sb.from('plantillas_checklist').select('id, sede_id, rol, titulo, prioridad, orden, activa').order('rol').order('orden')), []);
  const visibles = (lista ?? []).filter((p) => sede === 'todas' || !p.sede_id || p.sede_id === sede);

  async function agregar() {
    try {
      const orden = visibles.filter((p) => p.rol === f.rol).length + 1;
      await guardar(sb.from('plantillas_checklist').insert({ rol: f.rol, titulo: f.titulo.trim(), prioridad: f.prioridad, orden,
        sede_id: f.sede === 'todas' ? null : f.sede }));
      setF({ ...f, titulo: '' }); aviso.ok('✓ Se creará en cada turno de esa área');
    } catch (e) { aviso.error(e); }
  }
  const cambiar = async (id: string, c: Record<string, unknown>) => { try { await guardar(sb.from('plantillas_checklist').update(c).eq('id', id)); } catch (e) { aviso.error(e); } };

  return (
    <div className="pila">
      <div className="texto-sec">Estas tareas aparecen solas cuando la persona toca <b>Iniciar turno</b>.</div>
      <div className="tarjeta pila">
        <div className="fila envolver" style={{ gap: 8 }}>
          <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>{ROLES_EQUIPO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })}>
            <option value="todas">Todas las sedes</option>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
            <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <input className="entrada" style={{ flex: 1 }} placeholder="Ej: Revisar gas del horno" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <button className="btn btn-principal" disabled={!f.titulo.trim()} onClick={agregar}>Agregar</button>
        </div>
        {aviso.vista}
      </div>
      {ROLES_EQUIPO.map(([rol, nombre]) => {
        const ps = visibles.filter((p) => p.rol === rol);
        if (!ps.length) return null;
        return (
          <div key={rol} className="tarjeta">
            <b style={{ fontSize: 16 }}>{nombre}</b>
            {ps.map((p, i) => (
              <div key={p.id} className="fila entre linea" style={{ opacity: p.activa ? 1 : 0.5 }}>
                <span>{p.titulo} <span className="texto-sec">· {p.sede_id ? sedes.find((s) => s.id === p.sede_id)?.nombre : 'todas las sedes'}</span></span>
                <span className="fila" style={{ gap: 6 }}>
                  <select value={p.prioridad} onChange={(e) => cambiar(p.id, { prioridad: e.target.value })} aria-label="Prioridad">
                    <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
                  {i > 0 && <button className="enlace" aria-label="Subir" onClick={() => { cambiar(p.id, { orden: ps[i - 1].orden }); cambiar(ps[i - 1].id, { orden: p.orden }); }}>↑</button>}
                  <button className="enlace" onClick={() => cambiar(p.id, { activa: !p.activa })}>{p.activa ? 'Pausar' : 'Activar'}</button>
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
