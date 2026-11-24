import { useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../../lib/supabase';
import { cant, hora, plata } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { factor, unidadEscrita } from '../../componentes/Inventario';
import { ElegirSede, guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

// ═════════ Proveedores ═════════
export function Proveedores(_: { sede: SedeSel; sedes: Sede[] }) {
  const [editar, setEditar] = useState<any | 'nuevo' | null>(null);
  const { datos } = useConsulta('proveedores', () =>
    q<any[]>(sb.from('proveedores').select('*, proveedor_insumos(insumo_id, precio, actualizado, insumos(nombre, unidad))').order('nombre')), []);
  return (
    <div className="pila">
      <Titulo accion={<button className="btn btn-principal" onClick={() => setEditar('nuevo')}>＋ Nuevo proveedor</button>}>Proveedores</Titulo>
      <div className="tabla-tarjetas">
        {(datos ?? []).map((p) => (
          <button key={p.id} className="tarjeta fila-boton" style={{ display: 'grid', gap: 4, textAlign: 'left', opacity: p.activo ? 1 : 0.5 }} onClick={() => setEditar(p)}>
            <b style={{ fontSize: 16 }}>{p.nombre}</b>
            <span className="texto-sec" style={{ fontSize: 13 }}>{p.whatsapp ? `WhatsApp ${p.whatsapp}` : 'Sin WhatsApp'} · {p.dias_entrega || 'días sin definir'}</span>
            <span style={{ fontSize: 13 }}>{p.proveedor_insumos.map((x: any) => x.insumos?.nombre).join(' · ') || 'Sin productos'}</span>
          </button>
        ))}
      </div>
      {editar && <EditarProveedor p={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </div>
  );
}

function EditarProveedor({ p, onCerrar }: { p: any | null; onCerrar: () => void }) {
  const aviso = useAviso();
  const [f, setF] = useState({ nombre: p?.nombre ?? '', whatsapp: p?.whatsapp ?? '', dias_entrega: p?.dias_entrega ?? '', condiciones: p?.condiciones ?? '', activo: p?.activo ?? true });
  const [items, setItems] = useState<{ insumo_id: string; precio: string; antes?: number }[]>(
    () => (p?.proveedor_insumos ?? []).map((x: any) => ({ insumo_id: x.insumo_id, precio: String(Number(x.precio ?? 0)), antes: Number(x.precio ?? 0) })));
  const { datos: insumos } = useConsulta('ins-prov', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad').eq('activo', true).order('nombre')), []);
  const { datos: hist } = useConsulta('hist-prov-' + p?.id, () => p ? q<any[]>(sb.from('proveedor_precios_historial')
    .select('precio, creado_en, insumos(nombre, unidad)').eq('proveedor_id', p.id).order('creado_en', { ascending: false }).limit(15)) : Promise.resolve([]), [p?.id]);

  async function guardarTodo() {
    try {
      let id = p?.id;
      const fila = { ...f, nombre: f.nombre.trim(), whatsapp: f.whatsapp.replace(/\D/g, '') || null };
      if (id) await guardar(sb.from('proveedores').update(fila).eq('id', id));
      else { const { data, error } = await sb.from('proveedores').insert(fila).select('id').single(); if (error) throw new Error(error.message); id = data.id; }
      const actuales = items.filter((i) => i.insumo_id);
      for (const x of p?.proveedor_insumos ?? []) if (!actuales.some((i) => i.insumo_id === x.insumo_id))
        await guardar(sb.from('proveedor_insumos').delete().eq('proveedor_id', id).eq('insumo_id', x.insumo_id));
      for (const i of actuales) {
        const precio = Number(i.precio || 0);
        await guardar(sb.from('proveedor_insumos').upsert({ proveedor_id: id, insumo_id: i.insumo_id, precio, actualizado: new Date().toISOString() }));
        if (i.antes !== precio && precio > 0) await guardar(sb.from('proveedor_precios_historial').insert({ proveedor_id: id, insumo_id: i.insumo_id, precio }));
      }
      onCerrar();
    } catch (e) { aviso.error(e); }
  }

  return (
    <Ventana titulo={p ? p.nombre : 'Nuevo proveedor'} onCerrar={onCerrar} ancho={640}>
      <div className="pila">
        <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="fila" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>WhatsApp (con 57)</label><input inputMode="tel" placeholder="573001234567" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
          <div className="campo" style={{ flex: 1 }}><label>Días de entrega</label><input placeholder="Lunes y jueves" value={f.dias_entrega} onChange={(e) => setF({ ...f, dias_entrega: e.target.value })} /></div>
        </div>
        <div className="campo"><label>Condiciones</label><input placeholder="Contado, crédito 15 días…" value={f.condiciones} onChange={(e) => setF({ ...f, condiciones: e.target.value })} /></div>
        <b>Productos que vende y precio</b>
        {items.map((it, i) => (
          <div key={i} className="fila" style={{ gap: 6 }}>
            <select style={{ flex: 1 }} value={it.insumo_id} onChange={(e) => { const n = [...items]; n[i] = { ...it, insumo_id: e.target.value }; setItems(n); }}>
              <option value="">Insumo…</option>{(insumos ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
            <input className="entrada" style={{ width: 120 }} inputMode="numeric" placeholder="$ por unidad" value={it.precio}
              onChange={(e) => { const n = [...items]; n[i] = { ...it, precio: e.target.value.replace(/\D/g, '') }; setItems(n); }} />
            <button className="enlace" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="enlace" style={{ justifySelf: 'start' }} onClick={() => setItems([...items, { insumo_id: '', precio: '' }])}>＋ Agregar producto</button>
        <div className="texto-sec" style={{ fontSize: 12.5 }}>El precio es por unidad de inventario (por ml en líquidos, por g en pesos).</div>
        <label className="fila" style={{ gap: 8, fontWeight: 600 }}><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Proveedor activo</label>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.nombre.trim()} onClick={guardarTodo}>Guardar proveedor</button>
        {(hist ?? []).length > 0 && <div><b>Historial de precios</b>
          {hist!.map((h, i) => <div key={i} className="texto-sec linea" style={{ fontSize: 13 }}>
            {new Date(h.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })} · {h.insumos?.nombre}: {plata(h.precio)}</div>)}
        </div>}
      </div>
    </Ventana>
  );
}

// ═════════ Compras ═════════
const ESTADOS_OC: Record<string, string> = { por_comprar: 'Por comprar', en_camino: 'En camino', parcial: 'Llegó una parte', recibido: 'Recibido', anulada: 'Anulada' };

export function Compras({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [vista, setVista] = useState<'por_comprar' | 'en_camino' | 'recibido'>('por_comprar');
  const [miSede, setMiSede] = useState(sede !== 'todas' ? sede : sedes[0]?.id ?? '');
  const s = sede !== 'todas' ? sede : miSede || sedes[0]?.id;
  const [nueva, setNueva] = useState<null | { proveedor?: string; lineas?: { insumo_id: string; cantidad: string; ubicacion: string }[] }>(null);
  const nombreSede = (id: string) => sedes.find((x) => x.id === id)?.nombre ?? '';

  const { datos: ordenes } = useConsulta('ordenes', () => {
    let x = sb.from('ordenes_compra').select('id, sede_id, estado, creada_en, pedida_en, proveedores(id, nombre, whatsapp), lineas_compra(id, cantidad, recibido, precio, insumo_id, insumos(nombre, unidad), ubicaciones_stock(codigo))')
      .order('creada_en', { ascending: false }).limit(60);
    if (sede !== 'todas') x = x.eq('sede_id', sede);
    return q<any[]>(x);
  }, [sede]);

  const grupos = { por_comprar: ['por_comprar'], en_camino: ['en_camino', 'parcial'], recibido: ['recibido', 'anulada'] };
  const lista = (ordenes ?? []).filter((o) => grupos[vista].includes(o.estado));

  return (
    <div className="pila">
      <Titulo accion={<div className="fila" style={{ gap: 6 }}>
        {sede === 'todas' && <ElegirSede sedes={sedes} valor={s} onCambio={setMiSede} />}
        <button className="btn btn-principal" onClick={() => setNueva({})}>＋ Nuevo pedido</button></div>}>Compras</Titulo>
      <div className="fila envolver" style={{ gap: 6 }}>
        {([['por_comprar', 'Por comprar'], ['en_camino', 'En camino'], ['recibido', 'Recibido']] as const).map(([k, n]) => (
          <button key={k} className={'pastilla' + (vista === k ? ' activa' : '')} onClick={() => setVista(k)}>
            {n} · {(ordenes ?? []).filter((o) => grupos[k].includes(o.estado)).length}</button>
        ))}
      </div>
      {vista === 'por_comprar' && s && <Faltantes sede={s} onPedir={(proveedor, lineas) => setNueva({ proveedor, lineas })} />}
      {lista.map((o) => <Orden key={o.id} o={o} sedeNombre={sede === 'todas' ? nombreSede(o.sede_id) : ''} />)}
      {lista.length === 0 && <div className="texto-sec">No hay pedidos aquí.</div>}
      {nueva && s && <NuevaOrden sede={s} inicial={nueva} onCerrar={() => setNueva(null)} />}
    </div>
  );
}

/** Lo que está bajo o reportado, agrupado por proveedor */
function Faltantes({ sede, onPedir }: { sede: string; onPedir: (proveedor: string, lineas: { insumo_id: string; cantidad: string; ubicacion: string }[]) => void }) {
  const { datos } = useConsulta('faltantes', async () => {
    const [alertas, reportes, prov] = await Promise.all([
      q<any[]>(sb.from('alertas_stock').select('saldo, reglas_stock(minimo, insumo_id, insumos(nombre, unidad, categoria), ubicaciones_stock(codigo))').eq('sede_id', sede).eq('estado', 'activa')),
      q<any[]>(sb.from('reportes_stock').select('insumo_id, tipo, insumos(nombre, unidad, categoria), ubicaciones_stock(codigo)').eq('sede_id', sede).eq('estado', 'nuevo').in('tipo', ['queda_poco', 'se_acabo'])),
      q<any[]>(sb.from('proveedor_insumos').select('insumo_id, precio, proveedores(id, nombre, activo)')),
    ]);
    type Item = { insumo_id: string; nombre: string; unidad: string; ubicacion: string; sugerido: number; motivo: string };
    const items = new Map<string, Item>();
    for (const a of alertas) {
      const r = a.reglas_stock; if (!r) continue;
      // Solo lo que se compra afuera (no lo que se produce en casa)
      if (['porciones', 'produccion', 'masa'].includes(r.insumos?.categoria)) continue;
      items.set(r.insumo_id, { insumo_id: r.insumo_id, nombre: r.insumos.nombre, unidad: r.insumos.unidad, ubicacion: r.ubicaciones_stock.codigo,
        sugerido: Math.max(1, Number(r.minimo) * 2 - Number(a.saldo)), motivo: `quedan ${cant(Number(a.saldo), r.insumos.unidad)}` });
    }
    for (const rp of reportes) if (!items.has(rp.insumo_id) && !['porciones', 'produccion', 'masa'].includes(rp.insumos?.categoria))
      items.set(rp.insumo_id, { insumo_id: rp.insumo_id, nombre: rp.insumos.nombre, unidad: rp.insumos.unidad, ubicacion: rp.ubicaciones_stock?.codigo ?? 'bodega',
        sugerido: 0, motivo: rp.tipo === 'se_acabo' ? 'reportaron que se acabó' : 'reportaron que queda poco' });
    const porProv = new Map<string, { nombre: string; items: Item[] }>();
    for (const it of items.values()) {
      const p = prov.find((x) => x.insumo_id === it.insumo_id && x.proveedores?.activo);
      const k = p?.proveedores?.id ?? '';
      const g = porProv.get(k) ?? { nombre: p?.proveedores?.nombre ?? 'Sin proveedor asignado', items: [] as Item[] };
      g.items.push(it); porProv.set(k, g);
    }
    return [...porProv.entries()];
  }, [sede], ['alertas_stock', 'reportes_stock']);

  if (!datos?.length) return <div className="ok">No hay faltantes de compra en esta sede.</div>;
  return (
    <div className="pila">
      <h2>Faltantes por proveedor</h2>
      {datos.map(([prov, g]) => (
        <div key={prov} className="tarjeta pila" style={{ gap: 8 }}>
          <div className="fila entre"><b style={{ fontSize: 16 }}>{g.nombre}</b>
            <button className="btn btn-principal" style={{ padding: '8px 14px' }} onClick={() => onPedir(prov, g.items.map((i) => ({
              insumo_id: i.insumo_id, ubicacion: i.ubicacion, cantidad: i.sugerido ? String(Math.ceil(i.sugerido / factor(i.unidad) * 10) / 10) : '' })))}>Armar pedido</button></div>
          {g.items.map((i) => <div key={i.insumo_id} className="texto-sec" style={{ fontSize: 14 }}>• <b style={{ color: 'var(--negro)' }}>{i.nombre}</b> · {i.motivo}</div>)}
        </div>
      ))}
    </div>
  );
}

function NuevaOrden({ sede, inicial, onCerrar }: { sede: string; inicial: { proveedor?: string; lineas?: { insumo_id: string; cantidad: string; ubicacion: string }[] }; onCerrar: () => void }) {
  const aviso = useAviso();
  const [proveedor, setProveedor] = useState(inicial.proveedor ?? '');
  const [lineas, setLineas] = useState(inicial.lineas?.length ? inicial.lineas : [{ insumo_id: '', cantidad: '', ubicacion: 'bodega' }]);
  const { datos: provs } = useConsulta('provs-oc', () => q<any[]>(sb.from('proveedores').select('id, nombre, proveedor_insumos(insumo_id, precio)').eq('activo', true).order('nombre')), []);
  const { datos: insumos } = useConsulta('ins-oc', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad').eq('activo', true).order('nombre')), []);
  const precioDe = (insumo: string) => provs?.find((p) => p.id === proveedor)?.proveedor_insumos.find((x: any) => x.insumo_id === insumo)?.precio;

  async function crear() {
    try {
      const ls = lineas.filter((l) => l.insumo_id && Number(l.cantidad.replace(',', '.')) > 0).map((l) => {
        const u = insumos?.find((i) => i.id === l.insumo_id)?.unidad ?? '';
        return { insumo_id: l.insumo_id, ubicacion: l.ubicacion, cantidad: Number(l.cantidad.replace(',', '.')) * factor(u), precio: precioDe(l.insumo_id) ?? null };
      });
      await rpc('crear_orden_compra', { p_sede: sede, p_proveedor: proveedor || null, p_lineas: ls });
      onCerrar();
    } catch (e) { aviso.error(e); }
  }

  return (
    <Ventana titulo="Nuevo pedido de compra" onCerrar={onCerrar} ancho={680}>
      <div className="pila">
        <div className="campo"><label>Proveedor</label>
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}><option value="">Sin proveedor</option>
            {(provs ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        {lineas.map((l, i) => {
          const u = insumos?.find((x) => x.id === l.insumo_id)?.unidad ?? '';
          const cambiar = (c: any) => { const n = [...lineas]; n[i] = { ...l, ...c }; setLineas(n); };
          return (
            <div key={i} className="fila envolver" style={{ gap: 6 }}>
              <select style={{ flex: 2, minWidth: 150 }} value={l.insumo_id} onChange={(e) => cambiar({ insumo_id: e.target.value })}>
                <option value="">Insumo…</option>{(insumos ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
              <input className="entrada" style={{ width: 90 }} inputMode="decimal" placeholder="0" value={l.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value.replace(/[^\d.,]/g, '') })} />
              <span className="texto-sec" style={{ width: 70 }}>{u ? unidadEscrita(u) : ''}</span>
              <select value={l.ubicacion} onChange={(e) => cambiar({ ubicacion: e.target.value })}>
                {Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>a {n}</option>)}</select>
              <button className="enlace" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
        <button className="enlace" style={{ justifySelf: 'start' }} onClick={() => setLineas([...lineas, { insumo_id: '', cantidad: '', ubicacion: 'bodega' }])}>＋ Agregar insumo</button>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!lineas.some((l) => l.insumo_id && Number(l.cantidad))} onClick={crear}>Crear pedido</button>
      </div>
    </Ventana>
  );
}

function Orden({ o, sedeNombre }: { o: any; sedeNombre: string }) {
  const [recibir, setRecibir] = useState(false);
  const total = o.lineas_compra.reduce((t: number, l: any) => t + Number(l.cantidad) * Number(l.precio ?? 0), 0);
  const mensaje = `Hola ${o.proveedores?.nombre ?? ''}, de Max Pizza${sedeNombre ? ` (${sedeNombre})` : ''} queremos pedir:\n` +
    o.lineas_compra.map((l: any) => `• ${cant(Number(l.cantidad), l.insumos?.unidad)} de ${l.insumos?.nombre}`).join('\n') + '\n¡Gracias!';
  const wa = o.proveedores?.whatsapp ? `https://wa.me/${o.proveedores.whatsapp}?text=${encodeURIComponent(mensaje)}` : null;

  return (
    <div className="tarjeta pila" style={{ gap: 8 }}>
      <div className="fila entre envolver">
        <div><b style={{ fontSize: 16 }}>{o.proveedores?.nombre ?? 'Sin proveedor'}</b>
          <div className="texto-sec" style={{ fontSize: 13 }}>{sedeNombre && `${sedeNombre} · `}Creado {new Date(o.creada_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })} {hora(o.creada_en)}{o.pedida_en ? ` · pedido ${hora(o.pedida_en)}` : ''}</div></div>
        <span className={'estado ' + (o.estado === 'recibido' ? 'estado-lista' : o.estado === 'anulada' ? 'estado-proceso' : 'estado-media')}>{ESTADOS_OC[o.estado]}</span>
      </div>
      {o.lineas_compra.map((l: any) => (
        <div key={l.id} className="fila entre" style={{ fontSize: 14 }}>
          <span><b>{l.insumos?.nombre}</b> <span className="texto-sec">· a {UBICACIONES[l.ubicaciones_stock?.codigo]}</span></span>
          <span>{cant(Number(l.cantidad), l.insumos?.unidad)}{Number(l.recibido) > 0 && <span className="texto-sec"> · llegó {cant(Number(l.recibido), l.insumos?.unidad)}{Number(l.recibido) < Number(l.cantidad) ? ` · faltan ${cant(Number(l.cantidad) - Number(l.recibido), l.insumos?.unidad)}` : ''}</span>}</span>
        </div>
      ))}
      {total > 0 && <div className="texto-sec" style={{ fontWeight: 700 }}>Valor estimado {plata(total)}</div>}
      <div className="fila envolver" style={{ gap: 6 }}>
        {o.estado === 'por_comprar' && <>
          {wa && <a className="btn btn-suave" href={wa} target="_blank" rel="noreferrer">💬 Mensaje por WhatsApp</a>}
          <button className="btn btn-principal" onClick={() => rpc('marcar_orden_pedida', { p_orden: o.id }).catch((e) => alert(e.message))}>Marcar pedido</button>
        </>}
        {['en_camino', 'parcial', 'por_comprar'].includes(o.estado) && <button className="btn btn-principal" onClick={() => setRecibir(true)}>Registrar lo que llegó</button>}
        {['por_comprar', 'en_camino'].includes(o.estado) && <button className="enlace" onClick={() => confirm('¿Anular este pedido?') && guardar(sb.from('ordenes_compra').update({ estado: 'anulada' }).eq('id', o.id)).catch((e) => alert(e.message))}>Anular</button>}
      </div>
      {recibir && <Recepcion o={o} onCerrar={() => setRecibir(false)} />}
    </div>
  );
}

function Recepcion({ o, onCerrar }: { o: any; onCerrar: () => void }) {
  const aviso = useAviso();
  const [op] = useState(nuevaOperacion);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(o.lineas_compra.map((l: any) =>
    [l.id, String((Number(l.cantidad) - Number(l.recibido)) / factor(l.insumos?.unidad))])));
  async function registrar() {
    try {
      await rpc('recibir_compra', { p_op: op, p_orden: o.id, p_lineas: o.lineas_compra.map((l: any) => ({
        linea_compra_id: l.id, cantidad: Number((vals[l.id] || '0').replace(',', '.')) * factor(l.insumos?.unidad) })) });
      onCerrar();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Ventana titulo="¿Qué llegó?" onCerrar={onCerrar}>
      <div className="pila">
        <div className="texto-sec">Escribe lo que llegó de verdad. Lo que falte queda pendiente en el pedido.</div>
        {o.lineas_compra.filter((l: any) => Number(l.recibido) < Number(l.cantidad)).map((l: any) => (
          <div key={l.id} className="fila entre" style={{ gap: 8 }}>
            <span><b>{l.insumos?.nombre}</b><div className="texto-sec" style={{ fontSize: 13 }}>Pedido {cant(Number(l.cantidad), l.insumos?.unidad)}{Number(l.recibido) ? ` · ya llegó ${cant(Number(l.recibido), l.insumos?.unidad)}` : ''}</div></span>
            <span className="fila" style={{ gap: 6 }}>
              <input className="entrada" style={{ width: 90 }} inputMode="decimal" value={vals[l.id]} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value.replace(/[^\d.,]/g, '') })} />
              <span className="texto-sec">{unidadEscrita(l.insumos?.unidad)}</span>
            </span>
          </div>
        ))}
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" onClick={registrar}>Registrar recepción</button>
      </div>
    </Ventana>
  );
}
