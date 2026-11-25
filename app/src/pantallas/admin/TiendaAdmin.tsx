// Administración · Tienda online: abrir/cerrar, horario, pedido mínimo, medios de pago, zonas, adicionales y promociones.
// Fotos, precios, "se vende online" y "portada giratoria" de cada producto están en Catálogo.
import { useEffect, useState } from 'react';
import { sb } from '../../lib/supabase';
import { plata } from '../../lib/formato';
import { ElegirSede, guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

const MEDIOS: [string, string][] = [['efectivo', '💵 Efectivo'], ['nequi', '📱 Nequi'], ['transferencia', '🏦 Transferencia']];
const num = (v: string) => v.replace(/\D/g, '');

export function TiendaAdmin({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [s, setS] = useState(sede !== 'todas' ? sede : '');
  useEffect(() => { if (sede !== 'todas') setS(sede); else if (!s && sedes[0]) setS(sedes[0].id); }, [sede, sedes]);
  const nombre = sedes.find((x) => x.id === s)?.nombre ?? '';

  return (
    <div className="pila">
      <Titulo accion={<div className="fila" style={{ gap: 8 }}>
        <ElegirSede sedes={sedes} valor={s} onCambio={setS} />
        <a className="btn btn-suave" href="/pedir" target="_blank" rel="noreferrer">Ver la tienda ↗</a>
      </div>}>Tienda online · {nombre}</Titulo>
      <div className="texto-sec">Fotos, precios, qué productos salen en la tienda y cuáles van en la portada giratoria se cambian en <b>Catálogo</b>.</div>
      {s && <>
        <Ajustes sede={s} />
        <div className="dos-columnas">
          <Zonas sede={s} />
          <Promos sede={s} sedes={sedes} />
        </div>
        <Combos sede={s} sedes={sedes} />
        <Adicionales sede={s} />
      </>}
    </div>
  );
}

// ───────── Abierta, horario, mínimo, entrega y pago ─────────
function Ajustes({ sede }: { sede: string }) {
  const aviso = useAviso();
  const { datos } = useConsulta('tienda-ajustes', () => q<any>(sb.from('tienda_ajustes').select('*').eq('sede_id', sede).maybeSingle()), [sede], ['tienda_ajustes']);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    setF(datos ? { ...datos, pedido_minimo: String(Number(datos.pedido_minimo)) }
      : { sede_id: sede, abierta: true, pedido_minimo: '0', medios: ['efectivo'], nequi_numero: '', cuenta_texto: '', horario_texto: '', recoger: true, domicilio: true });
  }, [datos, sede]);
  if (!f) return null;
  const c = (x: any) => setF({ ...f, ...x });

  async function abrirCerrar() {
    try { await guardar(sb.from('tienda_ajustes').upsert({ sede_id: sede, abierta: !f.abierta })); aviso.ok(f.abierta ? 'Tienda cerrada' : 'Tienda abierta'); }
    catch (e) { aviso.error(e); }
  }
  async function salvar() {
    if (!f.medios.length) return aviso.error(new Error('Deja al menos un medio de pago.'));
    if (!f.domicilio && !f.recoger) return aviso.error(new Error('Deja domicilio o recoger.'));
    try {
      await guardar(sb.from('tienda_ajustes').upsert({ sede_id: sede, abierta: f.abierta, pedido_minimo: Number(f.pedido_minimo || 0), medios: f.medios,
        nequi_numero: f.nequi_numero || null, cuenta_texto: f.cuenta_texto || null, horario_texto: f.horario_texto || null, recoger: f.recoger, domicilio: f.domicilio,
        whatsapp: f.whatsapp || null, instagram: f.instagram || null, facebook: f.facebook || null, tiktok: f.tiktok || null,
        banner_activo: !!f.banner_activo, banner_etiqueta: f.banner_etiqueta || null, banner_titulo: f.banner_titulo || null, banner_texto: f.banner_texto || null }));
      aviso.ok('✓ Guardado');
    } catch (e) { aviso.error(e); }
  }

  return (
    <div className="tarjeta pila">
      <div className="fila entre envolver">
        <div>
          <h2>La tienda está {f.abierta ? <span style={{ color: 'var(--verde)' }}>abierta</span> : <span className="txt-rojo">cerrada</span>}</h2>
          <div className="texto-sec">{f.abierta ? 'Los clientes pueden hacer pedidos.' : 'Los clientes ven el menú pero no pueden pedir.'}</div>
        </div>
        <button className={'btn ' + (f.abierta ? 'btn-negro' : 'btn-principal')} onClick={abrirCerrar}>{f.abierta ? '⏸ Pausar pedidos' : '▶ Abrir la tienda'}</button>
      </div>
      <div className="dos-columnas">
        <div className="campo"><label>Horario (lo ve el cliente)</label>
          <input value={f.horario_texto ?? ''} placeholder="Todos los días · 4:00 p. m. a 11:00 p. m." onChange={(e) => c({ horario_texto: e.target.value })} /></div>
        <div className="campo"><label>Pedido mínimo (sin domicilio)</label>
          <input inputMode="numeric" value={f.pedido_minimo === '0' ? '' : plata(Number(f.pedido_minimo))} placeholder="Sin mínimo" onChange={(e) => c({ pedido_minimo: num(e.target.value) || '0' })} /></div>
      </div>
      <div className="fila envolver" style={{ gap: 6 }}>
        <span className="texto-sec" style={{ fontWeight: 700 }}>Entrega:</span>
        <button className={'pastilla' + (f.domicilio ? ' activa' : '')} onClick={() => c({ domicilio: !f.domicilio })}>🛵 Domicilio</button>
        <button className={'pastilla' + (f.recoger ? ' activa' : '')} onClick={() => c({ recoger: !f.recoger })}>🏪 Recoger</button>
        <span className="texto-sec" style={{ fontWeight: 700, marginLeft: 12 }}>Pago:</span>
        {MEDIOS.map(([m, t]) => <button key={m} className={'pastilla' + (f.medios.includes(m) ? ' activa' : '')}
          onClick={() => c({ medios: f.medios.includes(m) ? f.medios.filter((x: string) => x !== m) : [...f.medios, m] })}>{t}</button>)}
      </div>
      <div className="dos-columnas">
        {f.medios.includes('nequi') && <div className="campo"><label>Número Nequi</label>
          <input inputMode="tel" value={f.nequi_numero ?? ''} onChange={(e) => c({ nequi_numero: num(e.target.value).slice(0, 10) })} /></div>}
        {f.medios.includes('transferencia') && <div className="campo"><label>Datos para transferencia</label>
          <input value={f.cuenta_texto ?? ''} placeholder="Bancolombia ahorros 000-000000-00 · Max Pizza" onChange={(e) => c({ cuenta_texto: e.target.value })} /></div>}
      </div>
      <h3 style={{ marginTop: 6 }}>Contacto y redes (salen en la tienda)</h3>
      <div className="dos-columnas">
        <div className="campo"><label>WhatsApp para pedidos</label>
          <input inputMode="tel" placeholder="3001234567" value={f.whatsapp ?? ''} onChange={(e) => c({ whatsapp: num(e.target.value).slice(0, 10) })} /></div>
        <div className="campo"><label>Instagram (usuario)</label>
          <input placeholder="maxpizza" value={f.instagram ?? ''} onChange={(e) => c({ instagram: e.target.value.replace(/[@\s]/g, '') })} /></div>
        <div className="campo"><label>Facebook (usuario o página)</label>
          <input placeholder="maxpizza" value={f.facebook ?? ''} onChange={(e) => c({ facebook: e.target.value.replace(/[@\s]/g, '') })} /></div>
        <div className="campo"><label>TikTok (usuario)</label>
          <input placeholder="maxpizza" value={f.tiktok ?? ''} onChange={(e) => c({ tiktok: e.target.value.replace(/[@\s]/g, '') })} /></div>
      </div>
      <h3 style={{ marginTop: 6 }}>Banner de temporada</h3>
      <label className="fila texto-sec" style={{ gap: 6 }}><input type="checkbox" checked={!!f.banner_activo} onChange={(e) => c({ banner_activo: e.target.checked })} />
        Mostrar el banner en la portada (ej. Navidad, Amor y Amistad, partido de la Selección)</label>
      {f.banner_activo && <div className="dos-columnas">
        <div className="campo"><label>Etiqueta</label><input placeholder="SOLO HOY" value={f.banner_etiqueta ?? ''} onChange={(e) => c({ banner_etiqueta: e.target.value.toUpperCase().slice(0, 24) })} /></div>
        <div className="campo"><label>Título</label><input placeholder="¡Noche de partido!" value={f.banner_titulo ?? ''} onChange={(e) => c({ banner_titulo: e.target.value.slice(0, 40) })} /></div>
        <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Texto</label><input placeholder="Pide tu combo y no te pierdas ningún gol" value={f.banner_texto ?? ''} onChange={(e) => c({ banner_texto: e.target.value.slice(0, 90) })} /></div>
      </div>}
      {aviso.vista}
      <button className="btn btn-principal" onClick={salvar}>Guardar ajustes</button>
    </div>
  );
}

// ───────── Zonas de domicilio ─────────
function Zonas({ sede }: { sede: string }) {
  const aviso = useAviso();
  const { datos } = useConsulta('tienda-zonas', () => q<any[]>(sb.from('zonas_domicilio').select('*').eq('sede_id', sede).order('orden').order('nombre')), [sede], ['zonas_domicilio']);
  const [nueva, setNueva] = useState({ nombre: '', tarifa: '' });
  const cambiar = async (id: string, x: any) => { try { await guardar(sb.from('zonas_domicilio').update(x).eq('id', id)); aviso.ok('✓ Guardado'); } catch (e) { aviso.error(e); } };
  async function agregar() {
    if (!nueva.nombre.trim()) return aviso.error(new Error('Escribe el nombre de la zona.'));
    try {
      await guardar(sb.from('zonas_domicilio').insert({ sede_id: sede, nombre: nueva.nombre.trim(), tarifa: Number(nueva.tarifa || 0), orden: (datos?.length ?? 0) + 1 }));
      setNueva({ nombre: '', tarifa: '' }); aviso.ok('✓ Zona agregada');
    } catch (e) { aviso.error(e); }
  }
  return (
    <div className="tarjeta pila">
      <h2>Zonas y precio del domicilio</h2>
      {(datos ?? []).map((z) => (
        <div key={z.id} className="fila linea" style={{ gap: 8, opacity: z.activa ? 1 : .5 }}>
          <input className="entrada" style={{ flex: 2 }} defaultValue={z.nombre} onBlur={(e) => e.target.value.trim() !== z.nombre && cambiar(z.id, { nombre: e.target.value.trim() })} />
          <input className="entrada" style={{ flex: 1 }} inputMode="numeric" defaultValue={plata(z.tarifa)}
            onBlur={(e) => { const v = Number(num(e.target.value)); e.target.value = plata(v); if (v !== Number(z.tarifa)) cambiar(z.id, { tarifa: v }); }} />
          <input className="entrada" style={{ width: 92 }} title="Tiempo de entrega (minutos)" placeholder="30-45 min"
            defaultValue={z.minutos_min ? `${z.minutos_min}-${z.minutos_max ?? z.minutos_min}` : ''}
            onBlur={(e) => { const [a, b] = e.target.value.split(/[^\d]+/).filter(Boolean).map(Number); if (a) cambiar(z.id, { minutos_min: a, minutos_max: b ?? a }); }} />
          <button className="btn btn-suave" onClick={() => cambiar(z.id, { activa: !z.activa })}>{z.activa ? 'Quitar' : 'Activar'}</button>
        </div>
      ))}
      <div className="fila" style={{ gap: 8 }}>
        <input className="entrada" style={{ flex: 2 }} placeholder="Nueva zona (ej. Barrio La Paz)" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
        <input className="entrada" style={{ flex: 1 }} inputMode="numeric" placeholder="Tarifa" value={nueva.tarifa ? plata(Number(nueva.tarifa)) : ''} onChange={(e) => setNueva({ ...nueva, tarifa: num(e.target.value) })} />
        <button className="btn btn-principal" onClick={agregar}>＋</button>
      </div>
      {aviso.vista}
    </div>
  );
}

// ───────── Promociones ─────────
function Promos({ sede, sedes }: { sede: string; sedes: Sede[] }) {
  const aviso = useAviso();
  const { datos } = useConsulta('tienda-promos', () => q<any[]>(sb.from('promociones').select('*').or(`sede_id.is.null,sede_id.eq.${sede}`).order('creada_en', { ascending: false })), [sede], ['promociones']);
  const vacia = { nombre: '', tipo: 'porcentaje', valor: '', minimo: '', codigo: '', hasta: '', todas: false };
  const [n, setN] = useState(vacia);
  const sedeNombre = (id: string | null) => (id ? sedes.find((x) => x.id === id)?.nombre : 'Todas las sedes');
  async function agregar() {
    if (!n.nombre.trim() || !Number(n.valor)) return aviso.error(new Error('Escribe el nombre y el valor del descuento.'));
    if (n.tipo === 'porcentaje' && Number(n.valor) > 100) return aviso.error(new Error('El porcentaje va de 1 a 100.'));
    try {
      await guardar(sb.from('promociones').insert({ sede_id: n.todas ? null : sede, nombre: n.nombre.trim(), tipo: n.tipo, valor: Number(n.valor),
        minimo: Number(n.minimo || 0), codigo: n.codigo.trim().toUpperCase() || null, hasta: n.hasta || null }));
      setN(vacia); aviso.ok('✓ Promoción creada');
    } catch (e) { aviso.error(e); }
  }
  const activar = async (p: any) => { try { await guardar(sb.from('promociones').update({ activa: !p.activa }).eq('id', p.id)); } catch (e) { aviso.error(e); } };
  return (
    <div className="tarjeta pila">
      <h2>Promociones</h2>
      <div className="texto-sec" style={{ fontSize: 13 }}>Sin código se aplica sola. Con código, el cliente lo escribe al pagar. Si aplican varias, se usa la que más descuenta.</div>
      {(datos ?? []).length === 0 && <div className="texto-sec">Aún no hay promociones.</div>}
      {(datos ?? []).map((p) => (
        <div key={p.id} className="fila entre linea" style={{ opacity: p.activa ? 1 : .5 }}>
          <span><b>{p.nombre}</b>
            <div className="texto-sec" style={{ fontSize: 13 }}>
              {p.tipo === 'porcentaje' ? `${Number(p.valor)}% menos` : `${plata(p.valor)} menos`}
              {Number(p.minimo) > 0 ? ` · desde ${plata(p.minimo)}` : ''}{p.codigo ? ` · código ${p.codigo}` : ' · automática'}
              {p.hasta ? ` · hasta ${p.hasta}` : ''} · {sedeNombre(p.sede_id)}
            </div></span>
          <button className="btn btn-suave" onClick={() => activar(p)}>{p.activa ? 'Pausar' : 'Activar'}</button>
        </div>
      ))}
      <div className="pila" style={{ gap: 8, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
        <input className="entrada" placeholder="Nombre (ej. 10% los martes)" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
        <div className="fila" style={{ gap: 8 }}>
          <select className="entrada" value={n.tipo} onChange={(e) => setN({ ...n, tipo: e.target.value })}><option value="porcentaje">% descuento</option><option value="valor">$ descuento</option></select>
          <input className="entrada" inputMode="numeric" placeholder={n.tipo === 'porcentaje' ? 'Ej. 10' : 'Ej. $5.000'} value={n.tipo === 'valor' && n.valor ? plata(Number(n.valor)) : n.valor} onChange={(e) => setN({ ...n, valor: num(e.target.value) })} />
          <input className="entrada" inputMode="numeric" placeholder="Pedido desde" value={n.minimo ? plata(Number(n.minimo)) : ''} onChange={(e) => setN({ ...n, minimo: num(e.target.value) })} />
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <input className="entrada" placeholder="Código (opcional)" value={n.codigo} onChange={(e) => setN({ ...n, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          <label className="fila texto-sec" style={{ gap: 4, fontSize: 13 }}>Hasta <input type="date" className="entrada" value={n.hasta} onChange={(e) => setN({ ...n, hasta: e.target.value })} /></label>
        </div>
        <label className="fila texto-sec" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={n.todas} onChange={(e) => setN({ ...n, todas: e.target.checked })} /> Para todas las sedes</label>
        <button className="btn btn-principal" onClick={agregar}>Crear promoción</button>
      </div>
      {aviso.vista}
    </div>
  );
}

// ───────── Adicionales por producto ─────────
function Adicionales({ sede }: { sede: string }) {
  const aviso = useAviso();
  const { datos } = useConsulta('tienda-adicionales', async () => {
    const [ops, prods, ins] = await Promise.all([
      q<any[]>(sb.from('producto_opciones').select('*, insumos(nombre, unidad)').order('orden')),
      q<any[]>(sb.from('productos_sede').select('producto_id, productos(nombre, activo)').eq('sede_id', sede)),
      q<any[]>(sb.from('insumos').select('id, nombre, unidad').eq('activo', true).order('nombre')),
    ]);
    return { ops, prods: prods.filter((p) => p.productos?.activo).map((p) => ({ id: p.producto_id, nombre: p.productos.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)), ins };
  }, [sede], ['producto_opciones']);
  const vacia = { producto_id: '', nombre: '', precio: '', insumo_id: '', cantidad: '', ubicacion: 'armado' };
  const [n, setN] = useState(vacia);
  const cambiar = async (id: string, x: any) => { try { await guardar(sb.from('producto_opciones').update(x).eq('id', id)); aviso.ok('✓ Guardado'); } catch (e) { aviso.error(e); } };
  async function agregar() {
    if (!n.producto_id || !n.nombre.trim()) return aviso.error(new Error('Escoge el producto y escribe el adicional.'));
    try {
      await guardar(sb.from('producto_opciones').insert({ producto_id: n.producto_id, nombre: n.nombre.trim(), precio_extra: Number(n.precio || 0),
        insumo_id: n.insumo_id || null, cantidad: n.insumo_id ? Number(n.cantidad || 0) : null, ubicacion: n.insumo_id ? n.ubicacion : null,
        orden: (datos?.ops.filter((o) => o.producto_id === n.producto_id).length ?? 0) + 1 }));
      setN({ ...vacia, producto_id: n.producto_id }); aviso.ok('✓ Adicional agregado');
    } catch (e) { aviso.error(e); }
  }
  const prods = datos?.prods ?? [];
  const ins = datos?.ins.find((i) => i.id === n.insumo_id);
  return (
    <div className="tarjeta pila">
      <h2>Adicionales</h2>
      <div className="texto-sec" style={{ fontSize: 13 }}>Lo que el cliente puede sumar a un producto. Si gasta un insumo, se descuenta solo del inventario al pedir.</div>
      {prods.filter((p) => datos!.ops.some((o) => o.producto_id === p.id)).map((p) => (
        <div key={p.id}>
          <b>{p.nombre}</b>
          {datos!.ops.filter((o) => o.producto_id === p.id).map((o) => (
            <div key={o.id} className="fila entre linea" style={{ gap: 8, opacity: o.activo ? 1 : .5 }}>
              <span style={{ flex: 2 }}>{o.nombre}<span className="texto-sec" style={{ fontSize: 13 }}>
                {o.insumos ? ` · gasta ${Number(o.cantidad)} ${o.insumos.unidad} de ${o.insumos.nombre} (${UBICACIONES[o.ubicacion] ?? o.ubicacion})` : ''}</span></span>
              <input className="entrada" style={{ width: 110 }} inputMode="numeric" defaultValue={plata(o.precio_extra)}
                onBlur={(e) => { const v = Number(num(e.target.value)); e.target.value = plata(v); if (v !== Number(o.precio_extra)) cambiar(o.id, { precio_extra: v }); }} />
              <button className="btn btn-suave" onClick={() => cambiar(o.id, { activo: !o.activo })}>{o.activo ? 'Quitar' : 'Activar'}</button>
            </div>
          ))}
        </div>
      ))}
      <div className="pila" style={{ gap: 8, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
        <div className="fila envolver" style={{ gap: 8 }}>
          <select className="entrada" value={n.producto_id} onChange={(e) => setN({ ...n, producto_id: e.target.value })}>
            <option value="">Producto…</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <input className="entrada" placeholder="Adicional (ej. Extra tocineta)" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
          <input className="entrada" style={{ width: 120 }} inputMode="numeric" placeholder="Precio" value={n.precio ? plata(Number(n.precio)) : ''} onChange={(e) => setN({ ...n, precio: num(e.target.value) })} />
        </div>
        <div className="fila envolver" style={{ gap: 8 }}>
          <select className="entrada" value={n.insumo_id} onChange={(e) => setN({ ...n, insumo_id: e.target.value })}>
            <option value="">No gasta insumo</option>{(datos?.ins ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select>
          {n.insumo_id && <>
            <input className="entrada" style={{ width: 120 }} inputMode="decimal" placeholder={`Cantidad (${ins?.unidad ?? ''})`} value={n.cantidad} onChange={(e) => setN({ ...n, cantidad: e.target.value.replace(/[^\d.]/g, '') })} />
            <select className="entrada" value={n.ubicacion} onChange={(e) => setN({ ...n, ubicacion: e.target.value })}>
              {Object.entries(UBICACIONES).map(([k, v]) => <option key={k} value={k}>Sale de: {v}</option>)}</select>
          </>}
          <button className="btn btn-principal" onClick={agregar}>Agregar adicional</button>
        </div>
      </div>
      {aviso.vista}
    </div>
  );
}

// ───────── Combos: varios productos a un precio especial ─────────
function Combos({ sede, sedes }: { sede: string; sedes: Sede[] }) {
  const aviso = useAviso();
  const { datos } = useConsulta('tienda-combos', async () => {
    const [combos, prods] = await Promise.all([
      q<any[]>(sb.from('combos').select('*, combo_items(id, cantidad, producto_id, productos(nombre))').or(`sede_id.is.null,sede_id.eq.${sede}`).order('orden').order('nombre')),
      q<any[]>(sb.from('productos_sede').select('producto_id, precio, online, productos(nombre, activo)').eq('sede_id', sede)),
    ]);
    const lista = prods.filter((p) => p.productos?.activo).map((p) => ({ id: p.producto_id, nombre: p.productos.nombre, precio: Number(p.precio), online: p.online }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { combos, prods: lista };
  }, [sede], ['combos', 'combo_items']);
  const vacio = { nombre: '', descripcion: '', precio: '', todas: false, items: [] as { producto_id: string; cantidad: number }[], elegir: '' };
  const [n, setN] = useState(vacio);
  const prods = datos?.prods ?? [];
  const precio = (id: string) => prods.find((p) => p.id === id)?.precio ?? 0;
  const normal = n.items.reduce((t, i) => t + precio(i.producto_id) * i.cantidad, 0);
  const sedeNombre = (id: string | null) => (id ? sedes.find((x) => x.id === id)?.nombre : 'Todas las sedes');

  function sumar(id: string) {
    if (!id) return;
    const ya = n.items.find((i) => i.producto_id === id);
    setN({ ...n, elegir: '', items: ya ? n.items.map((i) => (i.producto_id === id ? { ...i, cantidad: i.cantidad + 1 } : i)) : [...n.items, { producto_id: id, cantidad: 1 }] });
  }
  async function crear() {
    if (!n.nombre.trim() || n.items.length < 2 || !Number(n.precio)) return aviso.error(new Error('Ponle nombre, al menos 2 productos y el precio del combo.'));
    if (Number(n.precio) >= normal) return aviso.error(new Error(`El combo debe costar menos que por separado (${plata(normal)}).`));
    try {
      const { data, error } = await sb.from('combos').insert({ sede_id: n.todas ? null : sede, nombre: n.nombre.trim(), descripcion: n.descripcion.trim() || null,
        precio: Number(n.precio), orden: (datos?.combos.length ?? 0) + 1 }).select('id').single();
      if (error) throw new Error(error.message);
      await guardar(sb.from('combo_items').insert(n.items.map((i) => ({ combo_id: data.id, producto_id: i.producto_id, cantidad: i.cantidad }))));
      setN(vacio); aviso.ok('✓ Combo creado');
    } catch (e) { aviso.error(e); }
  }
  const cambiar = async (id: string, x: any) => { try { await guardar(sb.from('combos').update(x).eq('id', id)); aviso.ok('✓ Guardado'); } catch (e) { aviso.error(e); } };

  return (
    <div className="tarjeta pila">
      <h2>Combos</h2>
      <div className="texto-sec" style={{ fontSize: 13 }}>Varios productos a un precio especial. En la tienda sale "Ahorras $X". Cada producto llega a su cocina y descuenta su inventario normal.
        Si un producto del combo no se vende en línea en esta sede, el combo no aparece.</div>
      {(datos?.combos ?? []).length === 0 && <div className="texto-sec">Aún no hay combos.</div>}
      {(datos?.combos ?? []).map((cb) => {
        const norm = (cb.combo_items ?? []).reduce((t: number, i: any) => t + precio(i.producto_id) * i.cantidad, 0);
        const fuera = (cb.combo_items ?? []).some((i: any) => !prods.find((p) => p.id === i.producto_id)?.online);
        return (
          <div key={cb.id} className="fila entre linea" style={{ opacity: cb.activo ? 1 : .5, gap: 8 }}>
            <span><b>{cb.nombre}</b> · {plata(cb.precio)} {norm > cb.precio && <span className="estado estado-baja">Ahorra {plata(norm - cb.precio)}</span>}
              <div className="texto-sec" style={{ fontSize: 13 }}>{(cb.combo_items ?? []).map((i: any) => `${i.cantidad} × ${i.productos?.nombre}`).join(' + ')} · {sedeNombre(cb.sede_id)}</div>
              {fuera && <div className="txt-rojo" style={{ fontSize: 13 }}>No sale en la tienda: un producto no se vende en línea en esta sede.</div>}</span>
            <span className="fila" style={{ gap: 6 }}>
              <input className="entrada" style={{ width: 110 }} inputMode="numeric" defaultValue={plata(cb.precio)}
                onBlur={(e) => { const v = Number(num(e.target.value)); e.target.value = plata(v); if (v && v !== Number(cb.precio)) cambiar(cb.id, { precio: v }); }} />
              <button className="btn btn-suave" onClick={() => cambiar(cb.id, { activo: !cb.activo })}>{cb.activo ? 'Pausar' : 'Activar'}</button>
            </span>
          </div>
        );
      })}
      <div className="pila" style={{ gap: 8, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
        <div className="fila envolver" style={{ gap: 8 }}>
          <input className="entrada" placeholder="Nombre (ej. Combo pareja)" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
          <input className="entrada" placeholder="Descripción corta (opcional)" value={n.descripcion} onChange={(e) => setN({ ...n, descripcion: e.target.value })} />
        </div>
        <div className="fila envolver" style={{ gap: 8 }}>
          <select className="entrada" value={n.elegir} onChange={(e) => sumar(e.target.value)}>
            <option value="">＋ Agregar producto al combo…</option>
            {prods.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {plata(p.precio)}</option>)}
          </select>
          {n.items.map((i) => (
            <span key={i.producto_id} className="estado estado-proceso">
              {i.cantidad} × {prods.find((p) => p.id === i.producto_id)?.nombre}
              <button className="enlace" onClick={() => setN({ ...n, items: n.items.filter((x) => x.producto_id !== i.producto_id) })}>✕</button>
            </span>
          ))}
        </div>
        <div className="fila envolver" style={{ gap: 8, alignItems: 'center' }}>
          {n.items.length > 0 && <span className="texto-sec">Por separado: <b>{plata(normal)}</b></span>}
          <input className="entrada" style={{ width: 140 }} inputMode="numeric" placeholder="Precio del combo" value={n.precio ? plata(Number(n.precio)) : ''} onChange={(e) => setN({ ...n, precio: num(e.target.value) })} />
          {Number(n.precio) > 0 && Number(n.precio) < normal && <span className="estado estado-baja">Ahorran {plata(normal - Number(n.precio))}</span>}
          <label className="fila texto-sec" style={{ gap: 4, fontSize: 13 }}><input type="checkbox" checked={n.todas} onChange={(e) => setN({ ...n, todas: e.target.checked })} /> Para todas las sedes</label>
          <button className="btn btn-principal" onClick={crear}>Crear combo</button>
        </div>
      </div>
      {aviso.vista}
    </div>
  );
}
