import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
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
    let r = sb.from('reglas_stock').select(`id, sede_id, ubicacion_id, insumo_id, minimo, rol_destino, responsable_id, prioridad, texto, accion, activa, excepcion,
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
                <div className="texto-sec" style={{ fontSize: 13 }}>{UBICACIONES[r.ubicaciones_stock?.codigo]}{sede === 'todas' ? ` · ${nombreSede(r.sede_id)}` : ''}{r.excepcion ? ' · mínimo propio' : ''}</div>
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
    sedes: [regla?.sede_id ?? (sede !== 'todas' ? sede : sedes[0]?.id ?? '')] as string[], excepcion: !!regla?.excepcion,
  });
  const { datos: insumos } = useConsulta('insumos-todos', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad, codigo').eq('activo', true).order('nombre')), []);
  const { datos: personas } = useConsulta('resp-' + f.sede + f.rol, () =>
    q<any[]>(sb.from('accesos_sede').select('perfil_id, perfiles(nombre)').eq('sede_id', f.sede).eq('rol', f.rol)), [f.sede, f.rol]);
  const ins = (insumos ?? []).find((i) => i.id === f.insumo);

  async function guardarRegla() {
    try {
      const texto = f.texto.trim() || `${f.rol === 'insumos' ? 'Preparar' : f.rol === 'admin' ? 'Revisar compra ·' : 'Reponer'} ${ins?.nombre.toLowerCase()}`;
      const r = await rpc<{ hechas: number; saltadas: string[] }>('regla_aplicar', {
        p_sedes: f.sedes, p_ubicacion: f.ubicacion, p_insumo: f.insumo,
        p_minimo: Number(f.minimo.replace(',', '.')) * factor(ins?.unidad ?? ''), p_rol: f.rol, p_prioridad: f.prioridad,
        p_texto: texto, p_accion: accionSugerida(f.rol, ins?.codigo ?? ''), p_excepcion: f.excepcion });
      // La persona responsable es de cada sede: solo se guarda cuando es una sola sede
      if (f.sedes.length === 1) {
        const { data: u } = await sb.from('ubicaciones_stock').select('id').eq('sede_id', f.sedes[0]).eq('codigo', f.ubicacion).single();
        if (u) await guardar(sb.from('reglas_stock').update({ responsable_id: f.responsable || null })
          .eq('ubicacion_id', u.id).eq('insumo_id', f.insumo).eq('rol_destino', f.rol));
      }
      if (r.saltadas.length) { aviso.ok(`✓ Guardado en ${r.hechas} sede(s). No se cambió ${r.saltadas.join(', ')} porque tiene mínimo propio.`); return; }
      onCerrar();
    } catch (e) { aviso.error(e); }
  }

  return (
    <Ventana titulo={regla ? 'Editar regla' : 'Nueva regla de stock bajo'} onCerrar={onCerrar}>
      <div className="pila">
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Ubicación</label>
            <select value={f.ubicacion} disabled={!!regla} onChange={(e) => setF({ ...f, ubicacion: e.target.value })}>
              {Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        </div>
        <div className="campo"><label>Aplicar en</label>
          <div className="fila envolver" style={{ gap: 6 }}>
            {sedes.filter((x) => x.activa).map((x) => (
              <button key={x.id} type="button" className={'pastilla' + (f.sedes.includes(x.id) ? ' activa' : '')}
                onClick={() => setF({ ...f, sedes: f.sedes.includes(x.id) ? f.sedes.filter((y) => y !== x.id) : [...f.sedes, x.id], sede: x.id })}>📍 {x.nombre}</button>
            ))}
            {sedes.filter((x) => x.activa).length > 1 && <button type="button" className="enlace" onClick={() => setF({ ...f, sedes: sedes.filter((x) => x.activa).map((x) => x.id) })}>Todas mis sedes</button>}
          </div>
          {f.sedes.length > 1 && <div className="texto-sec" style={{ fontSize: 13 }}>Se aplica el mismo mínimo en {f.sedes.length} sedes. Las que tengan "mínimo propio" no se cambian.</div>}
        </div>
        {f.sedes.length === 1 && <label className="fila" style={{ gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={f.excepcion} onChange={(e) => setF({ ...f, excepcion: e.target.checked })} />
          Mínimo propio de esta sede (no lo cambia "aplicar a todas")</label>}
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
        <button className="btn btn-principal btn-ancho" disabled={!f.insumo || !f.minimo || !f.sedes.length} onClick={guardarRegla}>{f.sedes.length > 1 ? `Guardar en ${f.sedes.length} sedes` : 'Guardar regla'}</button>
        {regla && <button className="btn btn-negro btn-ancho" onClick={async () => {
          if (!confirm('¿Borrar esta regla? Si tiene historial, mejor páusala.')) return;
          try { await guardar(sb.from('reglas_stock').delete().eq('id', regla.id)); onCerrar(); }
          catch { aviso.error(new Error('Esta regla ya tiene alertas en el historial: mejor páusala.')); }
        }}>Borrar regla</button>}
      </div>
    </Ventana>
  );
}
