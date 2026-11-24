import { useState } from 'react';
import { sb } from '../../lib/supabase';
import { cant, ROLES } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { factor, unidadEscrita } from '../../componentes/Inventario';
import { guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

/** Acción que abre la tarea según el área que la recibe */
function accionSugerida(rol: string, codigo: string) {
  if (rol === 'insumos') return `produccion:${codigo}`;
  if (rol === 'rapidas') return `subir_nevera:${codigo}`;
  if (rol === 'armado') return codigo.startsWith('porc_') ? `rueda:${codigo}` : `retirar:${codigo}`;
  if (rol === 'tortas') return 'tortas';
  if (rol === 'mesero' && codigo === 'portapizza') return 'portapizzas';
  if (rol === 'admin') return `compra:${codigo}`;
  return null;
}

export function Reglas({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [editar, setEditar] = useState<any | 'nueva' | null>(null);
  const [soloBajos, setSoloBajos] = useState(false);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';
  const { datos } = useConsulta('reglas', async () => {
    let r = sb.from('reglas_stock').select(`id, sede_id, ubicacion_id, insumo_id, minimo, rol_destino, responsable_id, prioridad, texto, accion, activa,
      insumos(nombre, unidad, codigo), ubicaciones_stock(codigo), perfiles(nombre)`).order('texto');
    let s = sb.from('saldos_stock').select('ubicacion_id, insumo_id, fisico, reservado');
    if (sede !== 'todas') { r = r.eq('sede_id', sede); s = s.eq('sede_id', sede); }
    const [reglas, saldos] = await Promise.all([q<any[]>(r), q<any[]>(s)]);
    return reglas.map((x) => {
      const sa = saldos.find((y) => y.ubicacion_id === x.ubicacion_id && y.insumo_id === x.insumo_id);
      const disp = sa ? Number(sa.fisico) - Number(sa.reservado) : 0;
      return { ...x, disponible: disp, bajo: x.activa && disp <= Number(x.minimo) };
    });
  }, [sede], ['reglas_stock', 'saldos_stock']);
  const lista = (datos ?? []).filter((r) => !soloBajos || r.bajo).sort((a, b) => Number(b.bajo) - Number(a.bajo));

  return (
    <div className="pila">
      <Titulo accion={<button className="btn btn-principal" onClick={() => setEditar('nueva')}>＋ Nueva regla</button>}>Reglas de stock bajo</Titulo>
      <div className="texto-sec">Cuando un saldo llega al mínimo, la tarea le llega sola al área elegida y a ti te llega la alerta. Al cambiar un mínimo se revisa el saldo de una vez.</div>
      <label className="fila" style={{ gap: 8, fontWeight: 700 }}>
        <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} /> Ver solo las que están en stock bajo ({(datos ?? []).filter((r) => r.bajo).length})
      </label>
      <div className="tabla-tarjetas">
        {lista.map((r) => (
          <div key={r.id} className={'tarjeta regla' + (r.bajo ? ' bajo' : '') + (r.activa ? '' : ' pausada')}>
            <div className="fila entre" style={{ alignItems: 'flex-start' }}>
              <div>
                <b>{r.insumos?.nombre}</b>
                <div className="texto-sec" style={{ fontSize: 13 }}>{UBICACIONES[r.ubicaciones_stock?.codigo]}{sede === 'todas' ? ` · ${nombreSede(r.sede_id)}` : ''}</div>
              </div>
              {!r.activa ? <span className="estado estado-proceso">Pausada</span> : r.bajo ? <span className="estado estado-alta">Stock bajo</span> : <span className="estado estado-baja">OK</span>}
            </div>
            <div style={{ fontSize: 14 }}>Hay <b>{cant(r.disponible, r.insumos?.unidad)}</b> · mínimo <b>{cant(Number(r.minimo), r.insumos?.unidad)}</b></div>
            <div style={{ fontSize: 13.5 }}>→ <b>{ROLES[r.rol_destino]}</b>{r.perfiles ? ` (${r.perfiles.nombre})` : ''}: “{r.texto}” <span className={`estado estado-${r.prioridad}`}>● {r.prioridad}</span></div>
            <div className="fila" style={{ gap: 6 }}>
              <button className="btn btn-suave" style={{ padding: '7px 12px', fontSize: 14 }} onClick={() => setEditar(r)}>Editar</button>
              <button className="btn btn-suave" style={{ padding: '7px 12px', fontSize: 14 }}
                onClick={() => guardar(sb.from('reglas_stock').update({ activa: !r.activa }).eq('id', r.id)).catch((e) => alert(e.message))}>
                {r.activa ? 'Pausar' : 'Reactivar'}</button>
            </div>
          </div>
        ))}
      </div>
      {editar && <EditarRegla regla={editar === 'nueva' ? null : editar} sede={sede} sedes={sedes} onCerrar={() => setEditar(null)} />}
    </div>
  );
}

function EditarRegla({ regla, sede, sedes, onCerrar }: { regla: any | null; sede: SedeSel; sedes: Sede[]; onCerrar: () => void }) {
  const aviso = useAviso();
  const unidad0 = regla?.insumos?.unidad ?? '';
  const [f, setF] = useState({
    sede: regla?.sede_id ?? (sede !== 'todas' ? sede : sedes[0]?.id ?? ''),
    ubicacion: regla?.ubicaciones_stock?.codigo ?? 'produccion',
    insumo: regla?.insumo_id ?? '',
    minimo: regla ? String(Number(regla.minimo) / factor(unidad0)) : '',
    rol: regla?.rol_destino ?? 'insumos', responsable: regla?.responsable_id ?? '',
    prioridad: regla?.prioridad ?? 'alta', texto: regla?.texto ?? '',
  });
  const { datos: insumos } = useConsulta('insumos-todos', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad, codigo').eq('activo', true).order('nombre')), []);
  const { datos: personas } = useConsulta('resp-' + f.sede + f.rol, () =>
    q<any[]>(sb.from('accesos_sede').select('perfil_id, perfiles(nombre)').eq('sede_id', f.sede).eq('rol', f.rol)), [f.sede, f.rol]);
  const ins = (insumos ?? []).find((i) => i.id === f.insumo);

  async function guardarRegla() {
    try {
      const { data: u } = await sb.from('ubicaciones_stock').select('id').eq('sede_id', f.sede).eq('codigo', f.ubicacion).single();
      if (!u) throw new Error('Esa sede no tiene esa ubicación');
      const fila = {
        sede_id: f.sede, ubicacion_id: u.id, insumo_id: f.insumo,
        minimo: Number(f.minimo.replace(',', '.')) * factor(ins?.unidad ?? ''), rol_destino: f.rol,
        responsable_id: f.responsable || null, prioridad: f.prioridad,
        texto: f.texto.trim() || `${f.rol === 'insumos' ? 'Preparar' : f.rol === 'admin' ? 'Revisar compra ·' : 'Reponer'} ${ins?.nombre.toLowerCase()}`,
        accion: accionSugerida(f.rol, ins?.codigo ?? ''),
      };
      if (regla) await guardar(sb.from('reglas_stock').update(fila).eq('id', regla.id));
      else await guardar(sb.from('reglas_stock').insert(fila));
      onCerrar();
    } catch (e) { aviso.error(e); }
  }

  return (
    <Ventana titulo={regla ? 'Editar regla' : 'Nueva regla de stock bajo'} onCerrar={onCerrar}>
      <div className="pila">
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Sede</label>
            <select value={f.sede} disabled={!!regla} onChange={(e) => setF({ ...f, sede: e.target.value })}>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div className="campo" style={{ flex: 1 }}><label>Ubicación</label>
            <select value={f.ubicacion} disabled={!!regla} onChange={(e) => setF({ ...f, ubicacion: e.target.value })}>
              {Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        </div>
        <div className="campo"><label>Insumo o producto</label>
          <select value={f.insumo} disabled={!!regla} onChange={(e) => setF({ ...f, insumo: e.target.value })}>
            <option value="">Elige…</option>{(insumos ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
        <div className="campo"><label>Mínimo {ins ? `(en ${unidadEscrita(ins.unidad)})` : ''}: avisa cuando quede esto o menos</label>
          <input inputMode="decimal" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Área que recibe la tarea</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value, responsable: '' })}>
              {Object.entries(ROLES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div className="campo" style={{ flex: 1 }}><label>Persona (opcional)</label>
            <select value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })}>
              <option value="">Toda el área</option>
              {(personas ?? []).map((p) => <option key={p.perfil_id} value={p.perfil_id}>{p.perfiles?.nombre}</option>)}</select></div>
        </div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 2 }}><label>Mensaje de la tarea</label>
            <input placeholder="Ej: Preparar carne de res" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></div>
          <div className="campo" style={{ flex: 1 }}><label>Prioridad</label>
            <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
        </div>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.insumo || !f.minimo || !f.sede} onClick={guardarRegla}>Guardar regla</button>
        {regla && <button className="btn btn-negro btn-ancho" onClick={async () => {
          if (!confirm('¿Borrar esta regla? Si tiene historial, mejor páusala.')) return;
          try { await guardar(sb.from('reglas_stock').delete().eq('id', regla.id)); onCerrar(); }
          catch { aviso.error(new Error('Esta regla ya tiene alertas en el historial: mejor páusala.')); }
        }}>Borrar regla</button>}
      </div>
    </Ventana>
  );
}
