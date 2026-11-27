import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
import { hora, ROLES } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { guardar, q, Titulo, useAviso, useConsulta, type Permisos, type Sede, type SedeSel } from './comun';

type Persona = { id: string; nombre: string; correo: string; activo: boolean; accesos: { id: string; sede_id: string; rol: string }[] };

const duracion = (a: string, b?: string | null) => {
  const m = Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export function Equipo({ sede, sedes, perfil, permisos }: { sede: SedeSel; sedes: Sede[]; perfil: string; permisos: Permisos }) {
  // Sedes donde esta persona puede dar roles: el CEO en todas; un admin solo en las suyas, y nunca roles de administración
  const editables = permisos.esCeo ? sedes : sedes.filter((s) => permisos.adminDe.includes(s.id));
  const sel = { sedes: editables, esCeo: permisos.esCeo };
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';

  const { datos: gente } = useConsulta('equipo', async () => {
    const [ps, as] = await Promise.all([
      q<any[]>(sb.from('perfiles').select('id, nombre, correo, activo').order('nombre')),
      q<any[]>(sb.from('accesos_sede').select('id, perfil_id, sede_id, rol')),
    ]);
    return ps.map((p) => ({ ...p, accesos: as.filter((a) => a.perfil_id === p.id) })) as Persona[];
  }, []);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const { datos: turnos } = useConsulta('equipo-turnos', () => {
    let x = sb.from('turnos').select('id, perfil_id, sede_id, rol, inicio, fin, perfiles(nombre)')
      .or(`fin.is.null,inicio.gte.${hoy.toISOString()}`).order('inicio', { ascending: false });
    if (sede !== 'todas') x = x.eq('sede_id', sede);
    return q<any[]>(x);
  }, [sede], ['turnos']);

  const visibles = (gente ?? []).filter((p) => (permisos.esCeo || p.accesos.length > 0) && (sede === 'todas' || p.accesos.some((a) => a.sede_id === sede)));
  const enTurno = (turnos ?? []).filter((t) => !t.fin);
  const terminaron = (turnos ?? []).filter((t) => t.fin);

  return (
    <div className="pila">
      <Titulo accion={<button className="btn btn-principal" onClick={() => setNuevo(true)}>＋ Nuevo integrante</button>}>Equipo</Titulo>
      <div className="dos-columnas">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>En turno ahora · {enTurno.length}</h2>
          {enTurno.length === 0 && <div className="texto-sec">Nadie en turno.</div>}
          {enTurno.map((t) => (
            <div key={t.id} className="fila entre linea">
              <span><span className="punto-verde" /> <b>{t.perfiles?.nombre}</b> <span className="texto-sec">· {ROLES[t.rol]} · {nombreSede(t.sede_id)}</span></span>
              <span className="texto-sec">{hora(t.inicio)} · {duracion(t.inicio)}</span>
            </div>
          ))}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>Terminaron hoy · {terminaron.length}</h2>
          {terminaron.length === 0 && <div className="texto-sec">Nadie ha terminado turno hoy.</div>}
          {terminaron.map((t) => (
            <div key={t.id} className="fila entre linea">
              <span><b>{t.perfiles?.nombre}</b> <span className="texto-sec">· {ROLES[t.rol]} · {nombreSede(t.sede_id)}</span></span>
              <span className="texto-sec">{hora(t.inicio)}–{hora(t.fin)} · {duracion(t.inicio, t.fin)}</span>
            </div>
          ))}
        </div>
      </div>

      {permisos.esCeo && <PermisosAdmin />}
      <h2>Integrantes · {visibles.length}</h2>
      {visibles.map((p) => (
        <div key={p.id} className="tarjeta">
          <button className="fila entre envolver" style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
            <span>
              <b style={{ fontSize: 16 }}>{p.nombre}</b> {!p.activo && <span className="estado estado-proceso">Desactivado</span>}
              <div className="texto-sec" style={{ fontSize: 13 }}>{p.correo}</div>
            </span>
            <span className="fila envolver" style={{ gap: 4 }}>
              {p.accesos.filter((a) => sede === 'todas' || a.sede_id === sede).map((a) => (
                <span key={a.id} className="estado estado-media">{ROLES[a.rol]}{sede === 'todas' ? ` · ${nombreSede(a.sede_id)}` : ''}</span>
              ))}
            </span>
          </button>
          {abierto === p.id && <DetallePersona p={p} sel={sel} yo={perfil} />}
        </div>
      ))}
      {nuevo && <NuevoIntegrante sel={sel} sede={sede} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

type Sel = { sedes: Sede[]; esCeo: boolean };
const ROLES_ADMIN = ['ceo', 'admin'];

function SelectorAccesos({ sel: { sedes, esCeo }, valor, onCambio }: { sel: Sel; valor: { sede_id: string; rol: string }[]; onCambio: (v: { sede_id: string; rol: string }[]) => void }) {
  const tiene = (s: string, r: string) => valor.some((a) => a.sede_id === s && a.rol === r);
  const alternar = (s: string, r: string) => onCambio(tiene(s, r) ? valor.filter((a) => !(a.sede_id === s && a.rol === r)) : [...valor, { sede_id: s, rol: r }]);
  return (
    <div className="pila" style={{ gap: 8 }}>
      {sedes.filter((s) => s.activa).map((s) => (
        <div key={s.id}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.nombre}</div>
          <div className="fila envolver" style={{ gap: 5 }}>
            {Object.entries(ROLES).filter(([r]) => esCeo || !ROLES_ADMIN.includes(r)).map(([r, n]) => (
              <button key={r} type="button" className={'pastilla' + (tiene(s.id, r) ? ' activa' : '')} style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => alternar(s.id, r)}>{n}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetallePersona({ p, sel, yo }: { p: Persona; sel: Sel; yo: string }) {
  const aviso = useAviso();
  const [clave, setClave] = useState('');
  const { datos: actividad } = useConsulta('act-' + p.id, async () => {
    const [ts, tareas] = await Promise.all([
      q<any[]>(sb.from('turnos').select('id, rol, sede_id, inicio, fin').eq('perfil_id', p.id).order('inicio', { ascending: false }).limit(8)),
      q<any[]>(sb.from('tareas').select('id, titulo, terminada_en').eq('terminada_por', p.id).order('terminada_en', { ascending: false }).limit(8)),
    ]);
    return { ts, tareas };
  }, [p.id]);

  async function cambiarAccesos(nuevos: { sede_id: string; rol: string }[]) {
    try {
      const quitar = p.accesos.filter((a) => !nuevos.some((n) => n.sede_id === a.sede_id && n.rol === a.rol));
      const poner = nuevos.filter((n) => !p.accesos.some((a) => n.sede_id === a.sede_id && n.rol === a.rol));
      for (const a of quitar) await guardar(sb.from('accesos_sede').delete().eq('id', a.id));
      if (poner.length) await guardar(sb.from('accesos_sede').insert(poner.map((n) => ({ ...n, perfil_id: p.id }))));
      aviso.ok('✓ Roles y sedes actualizados');
    } catch (e) { aviso.error(e); }
  }

  return (
    <div className="pila" style={{ marginTop: 12 }}>
      <b>Roles y sedes</b>
      <SelectorAccesos sel={sel} valor={p.accesos} onCambio={cambiarAccesos} />
      <div className="fila envolver" style={{ gap: 8, alignItems: 'end' }}>
        <div className="campo"><label>Nueva clave (mínimo 6)</label><input value={clave} onChange={(e) => setClave(e.target.value)} /></div>
        <button className="btn btn-suave" disabled={clave.length < 6}
          onClick={async () => { try { await rpc('admin_cambiar_clave', { p_perfil: p.id, p_clave: clave }); setClave(''); aviso.ok('✓ Clave cambiada. Dísela a la persona.'); } catch (e) { aviso.error(e); } }}>Restablecer clave</button>
      </div>
      {aviso.vista}
      {p.id !== yo && (
        <button className={'btn ' + (p.activo ? 'btn-negro' : 'btn-principal')} style={{ justifySelf: 'start' }}
          onClick={async () => {
            if (p.activo && !confirm(`¿Desactivar la cuenta de ${p.nombre}? No podrá entrar; su historial se conserva.`)) return;
            try { await rpc('admin_activar_usuario', { p_perfil: p.id, p_activo: !p.activo }); } catch (e) { aviso.error(e); }
          }}>{p.activo ? 'Desactivar cuenta' : 'Activar cuenta'}</button>
      )}
      <div className="dos-columnas">
        <div>
          <b>Últimos turnos</b>
          {actividad?.ts.map((t) => (
            <div key={t.id} className="texto-sec linea" style={{ fontSize: 13 }}>
              {new Date(t.inicio).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })} · {ROLES[t.rol]} · {hora(t.inicio)}–{t.fin ? hora(t.fin) : 'en turno'} · {duracion(t.inicio, t.fin)}
            </div>
          ))}
          {actividad?.ts.length === 0 && <div className="texto-sec">Sin turnos.</div>}
        </div>
        <div>
          <b>Últimas tareas terminadas</b>
          {actividad?.tareas.map((t) => <div key={t.id} className="texto-sec linea" style={{ fontSize: 13 }}>✓ {t.titulo} · {hora(t.terminada_en)}</div>)}
          {actividad?.tareas.length === 0 && <div className="texto-sec">Sin tareas.</div>}
        </div>
      </div>
    </div>
  );
}

function NuevoIntegrante({ sel, sede, onCerrar }: { sel: Sel; sede: SedeSel; onCerrar: () => void }) {
  const [f, setF] = useState({ nombre: '', correo: '', clave: '' });
  const [accesos, setAccesos] = useState<{ sede_id: string; rol: string }[]>(sede !== 'todas' && sel.sedes.some((s) => s.id === sede) ? [{ sede_id: sede, rol: 'mesero' }] : []);
  const aviso = useAviso();
  async function crear() {
    try {
      await rpc('admin_crear_usuario', { p_correo: f.correo, p_clave: f.clave, p_nombre: f.nombre, p_accesos: accesos });
      onCerrar();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Ventana titulo="Nuevo integrante" onCerrar={onCerrar} ancho={640}>
      <div className="pila">
        <div className="campo"><label>Nombre</label><input autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="campo"><label>Correo (con este entra)</label><input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></div>
        <div className="campo"><label>Clave inicial (mínimo 6)</label><input value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></div>
        <b>Roles y sedes</b>
        <SelectorAccesos sel={sel} valor={accesos} onCambio={setAccesos} />
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.nombre || !f.correo || f.clave.length < 6 || !accesos.length} onClick={crear}>Crear cuenta</button>
      </div>
    </Ventana>
  );
}

/** Solo para el CEO: quién tiene permisos de administración y en qué sedes */
function PermisosAdmin() {
  const { datos } = useConsulta('ceo-admins', () => q<any[]>(sb.rpc('ceo_administradores') as any), [], ['accesos_sede']);
  return (
    <div className="tarjeta">
      <h2 style={{ marginBottom: 6 }}>🔑 Permisos de administración</h2>
      <div className="texto-sec" style={{ marginBottom: 8 }}>Para nombrar un administrador o cambiar sus sedes, abre a la persona abajo y marca "Administración" en cada sede.</div>
      {(datos ?? []).map((a) => (
        <div key={a.perfil_id + a.rol} className="fila entre linea envolver">
          <span><b>{a.nombre}</b> {!a.activo && <span className="estado estado-proceso">Desactivado</span>}
            <span className="texto-sec"> · {a.correo}</span></span>
          <span className={'estado ' + (a.rol === 'ceo' ? 'estado-alta' : 'estado-media')}>
            {a.rol === 'ceo' ? 'CEO · todas las sedes' : 'Admin · ' + a.sedes.join(', ')}</span>
        </div>
      ))}
    </div>
  );
}
