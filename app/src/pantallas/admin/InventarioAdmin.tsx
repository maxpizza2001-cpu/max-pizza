import { useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../../lib/supabase';
import { cant, hora } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { factor, unidadEscrita } from '../../componentes/Inventario';
import { ElegirSede, guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

const TIPOS: Record<string, string> = {
  produccion: 'Producción', consumo: 'Consumo', traslado_salida: 'Salida a otra área', traslado_entrada: 'Entrada de otra área',
  venta: 'Venta', merma: 'Merma', ajuste: 'Ajuste', recepcion: 'Compra recibida', armado: 'Usado en armado',
};

export function InventarioAdmin({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [miSede, setMiSede] = useState(sede !== 'todas' ? sede : sedes[0]?.id ?? '');
  const s = sede !== 'todas' ? sede : miSede || sedes[0]?.id;
  const [vista, setVista] = useState<'saldos' | 'movimientos' | 'conteos' | 'insumos'>('saldos');
  return (
    <div className="pila">
      <Titulo accion={sede === 'todas' && <ElegirSede sedes={sedes} valor={s} onCambio={setMiSede} />}>Inventario</Titulo>
      <div className="fila envolver" style={{ gap: 6 }}>
        {([['saldos', 'Saldos'], ['movimientos', 'Movimientos'], ['conteos', 'Conteos reportados'], ['insumos', 'Insumos']] as const).map(([k, n]) => (
          <button key={k} className={'pastilla' + (vista === k ? ' activa' : '')} onClick={() => setVista(k)}>{n}</button>
        ))}
      </div>
      {s && vista === 'saldos' && <Saldos sede={s} />}
      {s && vista === 'movimientos' && <Movimientos sede={s} />}
      {s && vista === 'conteos' && <Conteos sede={s} />}
      {vista === 'insumos' && <Insumos />}
    </div>
  );
}

function Saldos({ sede }: { sede: string }) {
  const [ajuste, setAjuste] = useState<any | 'nuevo' | null>(null);
  const [buscar, setBuscar] = useState('');
  const { datos } = useConsulta('inv-saldos', () =>
    q<any[]>(sb.from('v_saldos').select('*').eq('sede_id', sede).order('insumo')), [sede], ['saldos_stock']);
  const filas = (datos ?? []).filter((x) => !buscar || x.insumo.toLowerCase().includes(buscar.toLowerCase()));
  return (
    <div className="pila">
      <div className="fila envolver" style={{ gap: 8 }}>
        <input className="entrada" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar insumo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <button className="btn btn-suave" onClick={() => setAjuste('nuevo')}>＋ Agregar insumo a una ubicación</button>
      </div>
      {Object.entries(UBICACIONES).map(([u, nombre]) => {
        const xs = filas.filter((x) => x.ubicacion === u);
        if (!xs.length) return null;
        return (
          <div key={u} className="tarjeta">
            <h2 style={{ marginBottom: 6 }}>{nombre}</h2>
            <div className="fila entre texto-sec" style={{ fontSize: 12, fontWeight: 700 }}>
              <span>Insumo</span><span className="cols3"><span>Físico</span><span>Reservado</span><span>Disponible</span><span /></span>
            </div>
            {xs.map((x) => (
              <div key={x.insumo_id} className="fila entre linea">
                <b style={{ fontSize: 14.5 }}>{x.insumo}</b>
                <span className="cols3">
                  <span>{cant(Number(x.fisico), x.unidad)}</span>
                  <span className="texto-sec">{Number(x.reservado) ? cant(Number(x.reservado), x.unidad) : '—'}</span>
                  <b>{cant(Number(x.disponible), x.unidad)}</b>
                  <button className="enlace" onClick={() => setAjuste(x)}>Ajustar</button>
                </span>
              </div>
            ))}
          </div>
        );
      })}
      {ajuste && <Ajuste sede={sede} saldo={ajuste === 'nuevo' ? null : ajuste} onCerrar={() => setAjuste(null)} />}
    </div>
  );
}

export function Ajuste({ sede, saldo, reporte, onCerrar }: { sede: string; saldo: any | null; reporte?: { id: string; conteo: number }; onCerrar: () => void }) {
  const aviso = useAviso();
  const [ubic, setUbic] = useState(saldo?.ubicacion ?? 'bodega');
  const [insumo, setInsumo] = useState(saldo?.insumo_id ?? '');
  const { datos: insumos } = useConsulta('ins-ajuste', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad').eq('activo', true).order('nombre')), []);
  const unidad = saldo?.unidad ?? insumos?.find((i) => i.id === insumo)?.unidad ?? '';
  const [nuevo, setNuevo] = useState(reporte ? String(reporte.conteo / factor(unidad || 'und')) : '');
  const [motivo, setMotivo] = useState(reporte ? 'Conteo físico reportado' : '');
  const [merma, setMerma] = useState(false);
  const [op] = useState(nuevaOperacion);

  async function guardarAjuste() {
    try {
      await rpc('ajustar_stock', { p_op: op, p_sede: sede, p_ubicacion: ubic, p_insumo: insumo,
        p_nuevo: Number(nuevo.replace(',', '.')) * factor(unidad), p_motivo: (merma ? 'Merma: ' : '') + motivo.trim(), p_reporte: reporte?.id ?? null });
      onCerrar();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Ventana titulo="Ajuste de stock" onCerrar={onCerrar}>
      <div className="pila">
        {saldo ? (
          <div><b>{saldo.insumo}</b> · {UBICACIONES[saldo.ubicacion]}<div className="texto-sec">Hoy dice {cant(Number(saldo.fisico), saldo.unidad)} en físico</div></div>
        ) : (
          <div className="fila" style={{ gap: 10 }}>
            <div className="campo" style={{ flex: 1 }}><label>Ubicación</label>
              <select value={ubic} onChange={(e) => setUbic(e.target.value)}>{Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
            <div className="campo" style={{ flex: 1 }}><label>Insumo</label>
              <select value={insumo} onChange={(e) => setInsumo(e.target.value)}><option value="">Elige…</option>
                {(insumos ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
          </div>
        )}
        <div className="campo"><label>Saldo real {unidad ? `(en ${unidadEscrita(unidad)})` : ''}</label>
          <input inputMode="decimal" autoFocus value={nuevo} onChange={(e) => setNuevo(e.target.value.replace(/[^\d.,]/g, ''))} /></div>
        <div className="campo"><label>Motivo (obligatorio)</label><input placeholder="Ej: Conteo físico del cierre" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <label className="fila" style={{ gap: 8, fontWeight: 600 }}><input type="checkbox" checked={merma} onChange={(e) => setMerma(e.target.checked)} /> Es merma (daño, vencimiento, se cayó…)</label>
        <div className="texto-sec" style={{ fontSize: 13 }}>Queda guardado el saldo anterior, el nuevo, el motivo, quién y a qué hora.</div>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!insumo || nuevo === '' || motivo.trim().length < 3} onClick={guardarAjuste}>Guardar ajuste</button>
      </div>
    </Ventana>
  );
}

function Movimientos({ sede }: { sede: string }) {
  const [limite, setLimite] = useState(50);
  const [ubic, setUbic] = useState('');
  const [tipo, setTipo] = useState('');
  const { datos } = useConsulta('inv-movs', () => {
    let x = sb.from('movimientos_stock').select('id, cantidad, cantidad_ref, tipo, motivo, saldo_ant, saldo_nuevo, creado_en, insumos(nombre, unidad), perfiles(nombre), ubicaciones_stock!inner(codigo)')
      .eq('sede_id', sede).order('creado_en', { ascending: false }).limit(limite);
    if (ubic) x = x.eq('ubicaciones_stock.codigo', ubic);
    if (tipo) x = x.eq('tipo', tipo);
    return q<any[]>(x);
  }, [sede, limite, ubic, tipo]);
  return (
    <div className="pila">
      <div className="fila envolver" style={{ gap: 8 }}>
        <select value={ubic} onChange={(e) => setUbic(e.target.value)}><option value="">Todas las ubicaciones</option>
          {Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos los movimientos</option>
          {Object.entries(TIPOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      </div>
      <div className="tarjeta">
        {(datos ?? []).map((m) => {
          const n = Number(m.cantidad) || Number(m.cantidad_ref) * -1 || 0;
          return (
            <div key={m.id} className="linea" style={{ fontSize: 14 }}>
              <div className="fila entre">
                <span><b className={n < 0 ? 'txt-rojo' : 'txt-verde'}>{n > 0 ? '+' : ''}{cant(n, m.insumos?.unidad)}</b> {m.insumos?.nombre}</span>
                <span className="texto-sec">{new Date(m.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })} {hora(m.creado_en)}</span>
              </div>
              <div className="texto-sec" style={{ fontSize: 12.5 }}>
                {TIPOS[m.tipo] ?? m.tipo} · {UBICACIONES[m.ubicaciones_stock?.codigo]}{m.motivo ? ` · ${m.motivo}` : ''}{m.perfiles ? ` · ${m.perfiles.nombre}` : ''}
                {m.saldo_ant != null && ` · ${cant(Number(m.saldo_ant), m.insumos?.unidad)} → ${cant(Number(m.saldo_nuevo), m.insumos?.unidad)}`}
              </div>
            </div>
          );
        })}
        {datos?.length === limite && <button className="btn btn-suave btn-ancho" style={{ marginTop: 8 }} onClick={() => setLimite(limite + 50)}>Ver más</button>}
        {datos?.length === 0 && <div className="texto-sec">Sin movimientos.</div>}
      </div>
    </div>
  );
}

function Conteos({ sede }: { sede: string }) {
  const [corregir, setCorregir] = useState<any | null>(null);
  const { datos } = useConsulta('inv-conteos', () =>
    q<any[]>(sb.from('reportes_stock').select('id, tipo, conteo, saldo_sistema, estado, creado_en, insumo_id, insumos(nombre, unidad), ubicaciones_stock(codigo), perfiles!reportes_stock_perfil_id_fkey(nombre)')
      .eq('sede_id', sede).order('creado_en', { ascending: false }).limit(60)), [sede], ['reportes_stock']);
  const revisar = (id: string) => guardar(sb.from('reportes_stock').update({ estado: 'revisado', revisado_en: new Date().toISOString() }).eq('id', id)).catch((e) => alert(e.message));
  return (
    <div className="tarjeta">
      {(datos ?? []).length === 0 && <div className="texto-sec">Sin reportes del equipo.</div>}
      {(datos ?? []).map((r) => (
        <div key={r.id} className="fila entre envolver linea">
          <div>
            <b>{r.tipo === 'queda_poco' ? 'Queda poco' : r.tipo === 'se_acabo' ? 'Se acabó' : 'Conteo'} · {r.insumos?.nombre}</b>
            <div className="texto-sec" style={{ fontSize: 13 }}>
              {r.conteo != null && `Contaron ${cant(Number(r.conteo), r.insumos?.unidad)} · sistema ${cant(Number(r.saldo_sistema), r.insumos?.unidad)} · `}
              {r.perfiles?.nombre} · {hora(r.creado_en)}
            </div>
          </div>
          {r.estado === 'nuevo' ? (
            <span className="fila" style={{ gap: 6 }}>
              {r.conteo != null && <button className="btn btn-suave" style={{ padding: '7px 12px' }} onClick={() => setCorregir(r)}>Corregir saldo</button>}
              <button className="btn btn-principal" style={{ padding: '7px 12px' }} onClick={() => revisar(r.id)}>Revisado</button>
            </span>
          ) : <span className="estado estado-proceso">{r.estado === 'corregido' ? '✓ Corregido' : 'Revisado'}</span>}
        </div>
      ))}
      {corregir && <Ajuste sede={sede} reporte={{ id: corregir.id, conteo: Number(corregir.conteo) }}
        saldo={{ insumo: corregir.insumos?.nombre, insumo_id: corregir.insumo_id, ubicacion: corregir.ubicaciones_stock?.codigo, unidad: corregir.insumos?.unidad, fisico: corregir.saldo_sistema }}
        onCerrar={() => setCorregir(null)} />}
    </div>
  );
}

function Insumos() {
  const aviso = useAviso();
  const [f, setF] = useState({ nombre: '', unidad: 'und', categoria: 'aseo' });
  const { datos } = useConsulta('insumos-admin', () => q<any[]>(sb.from('insumos').select('id, codigo, nombre, unidad, categoria, activo').order('categoria').order('nombre')), []);
  async function crear() {
    try {
      const codigo = f.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      await guardar(sb.from('insumos').insert({ ...f, nombre: f.nombre.trim(), codigo }));
      setF({ ...f, nombre: '' }); aviso.ok('✓ Insumo creado. Para que aparezca en una pantalla, agrégale saldo en esa ubicación.');
    } catch (e) { aviso.error(e); }
  }
  return (
    <div className="pila">
      <div className="tarjeta pila">
        <b>Nuevo insumo</b>
        <div className="fila envolver" style={{ gap: 8 }}>
          <input className="entrada" style={{ flex: 1, minWidth: 180 }} placeholder="Ej: Bolsas de basura" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })}>
            <option value="und">Unidades</option><option value="porcion">Porciones</option><option value="ml">Líquido (ml)</option><option value="g">Peso (g)</option><option value="torta">Tortas</option></select>
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
            {['ingredientes', 'produccion', 'porciones', 'aseo', 'empaques', 'bebidas', 'masa'].map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <button className="btn btn-principal" disabled={!f.nombre.trim()} onClick={crear}>Crear</button>
        </div>
        {aviso.vista}
      </div>
      <div className="tarjeta">
        {(datos ?? []).map((i) => (
          <div key={i.id} className="fila entre linea" style={{ opacity: i.activo ? 1 : 0.5 }}>
            <span><b>{i.nombre}</b> <span className="texto-sec">· {i.categoria} · {i.unidad}</span></span>
            <button className="enlace" onClick={() => guardar(sb.from('insumos').update({ activo: !i.activo }).eq('id', i.id)).catch((e) => alert(e.message))}>{i.activo ? 'Desactivar' : 'Activar'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
