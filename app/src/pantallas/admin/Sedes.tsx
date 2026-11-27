import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
import { Ventana } from '../../componentes/Piezas';
import { guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Permisos, type Sede, type SedeSel } from './comun';

export function Sedes({ sedes, permisos }: { sede: SedeSel; sedes: Sede[]; permisos: Permisos }) {
  const ceo = permisos.esCeo;
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="pila">
      <Titulo accion={ceo && <button className="btn btn-principal" onClick={() => setNueva(true)}>＋ Nueva sede</button>}>Sedes</Titulo>
      {!ceo && <div className="aviso">Ves solo tus sedes. Crear, renombrar o desactivar sedes lo hace el Administrador CEO.</div>}
      <div className="texto-sec">Cada sede tiene sus propias mesas, estaciones, inventario, precios, equipo y mínimos.</div>
      {sedes.map((s) => (
        <div key={s.id} className="tarjeta">
          <button className="fila entre" style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setAbierta(abierta === s.id ? null : s.id)}>
            <span className="titulo" style={{ fontSize: 19 }}>{s.nombre}</span>
            <span className={'estado ' + (s.activa ? 'estado-baja' : 'estado-proceso')}>{s.activa ? 'Activa' : 'Inactiva'}</span>
          </button>
          {abierta === s.id && <DetalleSede sede={s} ceo={ceo} />}
        </div>
      ))}
      {nueva && <NuevaSede sedes={sedes} onCerrar={() => setNueva(false)} />}
    </div>
  );
}

function DetalleSede({ sede, ceo }: { sede: Sede; ceo: boolean }) {
  const aviso = useAviso();
  const [nombre, setNombre] = useState(sede.nombre);
  const { datos } = useConsulta('sede-' + sede.id, async () => {
    const [mesas, est, ubi, acc] = await Promise.all([
      q<any[]>(sb.from('mesas').select('numero, activa').eq('sede_id', sede.id).order('numero')),
      q<any[]>(sb.from('estaciones').select('id, nombre, codigo, activa').eq('sede_id', sede.id)),
      q<any[]>(sb.from('ubicaciones_stock').select('id, nombre, codigo, activa').eq('sede_id', sede.id)),
      q<any[]>(sb.from('accesos_sede').select('rol, perfiles(nombre, activo)').eq('sede_id', sede.id)),
    ]);
    return { mesas, est, ubi, acc };
  }, [sede.id]);
  const activas = datos?.mesas.filter((m) => m.activa).length ?? 0;
  const [mesas, setMesas] = useState('');

  async function hacer(f: () => Promise<unknown>, m: string) { try { await f(); aviso.ok(m); } catch (e) { aviso.error(e); } }

  return (
    <div className="pila" style={{ marginTop: 12 }}>
      {ceo && <div className="fila envolver" style={{ gap: 8, alignItems: 'end' }}>
        <div className="campo" style={{ flex: 1, minWidth: 200 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <button className="btn btn-suave" disabled={nombre.trim() === sede.nombre || !nombre.trim()}
          onClick={() => hacer(() => guardar(sb.from('sedes').update({ nombre: nombre.trim() }).eq('id', sede.id)), '✓ Nombre guardado')}>Guardar nombre</button>
      </div>}
      <div className="fila envolver" style={{ gap: 8, alignItems: 'end' }}>
        <div className="campo"><label>Mesas (hoy {activas})</label><input inputMode="numeric" placeholder={String(activas)} value={mesas} onChange={(e) => setMesas(e.target.value.replace(/\D/g, ''))} /></div>
        <button className="btn btn-suave" disabled={!mesas} onClick={() => hacer(() => rpc('configurar_mesas', { p_sede: sede.id, p_total: Number(mesas) }), `✓ Ahora tiene ${mesas} mesas`)}>Guardar mesas</button>
      </div>
      <div>
        <b>Estaciones</b>
        <div className="fila envolver" style={{ gap: 6, marginTop: 6 }}>
          {datos?.est.map((e) => (
            <button key={e.id} className={'pastilla' + (e.activa ? ' activa' : '')}
              onClick={() => hacer(() => guardar(sb.from('estaciones').update({ activa: !e.activa }).eq('id', e.id)), '✓ Estación actualizada')}>
              {e.nombre} · {e.activa ? 'activa' : 'apagada'}</button>
          ))}
        </div>
      </div>
      <div>
        <b>Ubicaciones de inventario</b>
        <div className="fila envolver" style={{ gap: 6, marginTop: 6 }}>
          {datos?.ubi.map((u) => <span key={u.id} className="estado estado-proceso">{UBICACIONES[u.codigo] ?? u.nombre}</span>)}
        </div>
      </div>
      <div>
        <b>Equipo con acceso ({datos?.acc.length ?? 0})</b>
        <div className="texto-sec" style={{ marginTop: 4 }}>
          {datos?.acc.map((a: any) => `${a.perfiles?.nombre} (${a.rol})`).join(' · ') || 'Nadie todavía. Asígnalo en Equipo.'}
        </div>
      </div>
      <div className="texto-sec">Productos y precios de esta sede: en Catálogo. Mínimos: en Stock bajo.</div>
      {aviso.vista}
      {ceo && <button className={'btn ' + (sede.activa ? 'btn-negro' : 'btn-principal')} style={{ justifySelf: 'start' }}
        onClick={() => { if (!sede.activa || confirm(`¿Desactivar ${sede.nombre}? Se conserva todo su historial.`)) hacer(() => guardar(sb.from('sedes').update({ activa: !sede.activa }).eq('id', sede.id)), sede.activa ? '✓ Sede desactivada' : '✓ Sede activada'); }}>
        {sede.activa ? 'Desactivar sede' : 'Activar sede'}
      </button>}
    </div>
  );
}

function NuevaSede({ sedes, onCerrar }: { sedes: Sede[]; onCerrar: () => void }) {
  const [f, setF] = useState({ nombre: '', mesas: '10', copiar: sedes[0]?.id ?? '' });
  const aviso = useAviso();
  const [enviando, setEnviando] = useState(false);
  async function crear() {
    setEnviando(true);
    try { await rpc('crear_sede', { p_nombre: f.nombre, p_mesas: Number(f.mesas), p_copiar_de: f.copiar || null }); window.dispatchEvent(new Event('mp:cambio')); onCerrar(); }
    catch (e) { aviso.error(e); setEnviando(false); }
  }
  return (
    <Ventana titulo="Nueva sede" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo"><label>Nombre</label><input autoFocus placeholder="Ej: Sede Norte" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="campo"><label>Número de mesas</label><input inputMode="numeric" value={f.mesas} onChange={(e) => setF({ ...f, mesas: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="campo">
          <label>Copiar precios y reglas de stock bajo de</label>
          <select value={f.copiar} onChange={(e) => setF({ ...f, copiar: e.target.value })}>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="texto-sec">Se crean las estaciones (horno y comidas rápidas) y las ubicaciones de inventario en cero.</div>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.nombre.trim() || enviando} onClick={crear}>Crear sede</button>
      </div>
    </Ventana>
  );
}
