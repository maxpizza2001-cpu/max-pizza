import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
import { hora, plata } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { guardar, q, Titulo, UBICACIONES, useAviso, useConsulta, type Sede, type SedeSel } from './comun';

const FORMATOS: Record<string, string> = { porcion: 'Porción', personal: 'Personal', unidad: 'Unidad' };
const ESTACIONES: Record<string, string> = { horno: 'Horno (cola de Caja)', rapidas: 'Comidas rápidas (tablet)', ninguna: 'Ninguna (sale directo)' };

export function Catalogo({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [editar, setEditar] = useState<string | 'nuevo' | null>(null);
  const sedeVer = sede !== 'todas' ? sede : sedes[0]?.id;
  const { datos } = useConsulta('catalogo', async () => {
    const [cats, prods, precios] = await Promise.all([
      q<any[]>(sb.from('categorias').select('id, nombre, tipo').order('orden')),
      q<any[]>(sb.from('productos').select('id, nombre, categoria_id, formato, estacion, activo, foto_url, destacado').order('nombre')),
      q<any[]>(sb.from('productos_sede').select('producto_id, sede_id, precio, disponible, online')),
    ]);
    return { cats, prods, precios };
  }, []);

  return (
    <div className="pila">
      <Titulo accion={<button className="btn btn-principal" onClick={() => setEditar('nuevo')}>＋ Nuevo producto</button>}>Catálogo</Titulo>
      <div className="texto-sec">Precios de {sedes.find((s) => s.id === sedeVer)?.nombre}. Las ventas ya hechas conservan el precio con que se vendieron.</div>
      {datos?.cats.map((c) => (
        <div key={c.id} className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>{c.nombre}</h2>
          {datos.prods.filter((p) => p.categoria_id === c.id).map((p) => {
            const ps = datos.precios.find((x) => x.producto_id === p.id && x.sede_id === sedeVer);
            return (
              <button key={p.id} className="fila entre linea fila-boton" onClick={() => setEditar(p.id)} style={{ opacity: p.activo ? 1 : 0.5 }}>
                <span><b>{p.nombre}</b> <span className="texto-sec">· {FORMATOS[p.formato]} · {ESTACIONES[p.estacion].split(' (')[0]}</span>
                  {p.destacado && <span className="estado estado-lista"> ★ Portada</span>}
                  {ps && !ps.online && <span className="estado estado-proceso"> No sale en la tienda</span>}
                  {!p.activo && <span className="estado estado-proceso"> Desactivado</span>}
                  {ps && !ps.disponible && <span className="estado estado-alta"> No disponible aquí</span>}</span>
                <b>{ps ? plata(ps.precio) : '—'}</b>
              </button>
            );
          })}
        </div>
      ))}
      {editar && datos && <EditarProducto id={editar === 'nuevo' ? null : editar} cats={datos.cats} sedes={sedes} onCerrar={() => setEditar(null)} />}
    </div>
  );
}

function EditarProducto({ id, cats, sedes, onCerrar }: { id: string | null; cats: any[]; sedes: Sede[]; onCerrar: () => void }) {
  const aviso = useAviso();
  const { datos } = useConsulta('prod-' + id, async () => {
    if (!id) return null;
    const [p, ps, rec, hist] = await Promise.all([
      q<any>(sb.from('productos').select('*').eq('id', id).single()),
      q<any[]>(sb.from('productos_sede').select('sede_id, precio, disponible, online').eq('producto_id', id)),
      q<any[]>(sb.from('recetas').select('id, version, receta_detalles(insumo_id, cantidad, ubicacion)').eq('producto_id', id).eq('vigente', true)),
      q<any[]>(sb.from('precios_historial').select('sede_id, precio_ant, precio_nuevo, creado_en, perfiles(nombre)').eq('producto_id', id).order('creado_en', { ascending: false }).limit(10)),
    ]);
    return { p, ps, rec: rec[0], hist };
  }, [id]);
  const { datos: insumos } = useConsulta('insumos-cat', () => q<any[]>(sb.from('insumos').select('id, nombre, unidad').eq('activo', true).order('nombre')), []);

  if (id && !datos) return null;
  return <FormProducto key={id ?? 'nuevo'} id={id} datos={datos} cats={cats} sedes={sedes} insumos={insumos ?? []} aviso={aviso} onCerrar={onCerrar} />;
}

function FormProducto({ id, datos, cats, sedes, insumos, aviso, onCerrar }: any) {
  const p = datos?.p;
  const [f, setF] = useState({
    nombre: p?.nombre ?? '', categoria_id: p?.categoria_id ?? cats[0]?.id, formato: p?.formato ?? 'unidad',
    estacion: p?.estacion ?? 'rapidas', foto_url: p?.foto_url ?? '', activo: p?.activo ?? true,
    descripcion: p?.descripcion ?? '', destacado: p?.destacado ?? false,
  });
  const [precios, setPrecios] = useState<Record<string, { precio: string; disponible: boolean; online: boolean }>>(() =>
    Object.fromEntries(sedes.map((s: Sede) => {
      const x = datos?.ps.find((y: any) => y.sede_id === s.id);
      return [s.id, { precio: x ? String(Number(x.precio)) : '', disponible: x ? x.disponible : true, online: x ? x.online : true }];
    })));
  const [receta, setReceta] = useState<{ insumo_id: string; cantidad: string; ubicacion: string }[]>(
    () => datos?.rec?.receta_detalles?.map((d: any) => ({ insumo_id: d.insumo_id, cantidad: String(Number(d.cantidad)), ubicacion: d.ubicacion })) ?? []);
  const recetaOriginal = JSON.stringify(datos?.rec?.receta_detalles?.map((d: any) => [d.insumo_id, Number(d.cantidad), d.ubicacion]) ?? []);

  const [subiendo, setSubiendo] = useState(false);
  async function subirFoto(archivo: File) {
    setSubiendo(true);
    try {
      const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
      const ruta = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('productos').upload(ruta, archivo, { contentType: archivo.type, upsert: false });
      if (error) throw new Error('No se pudo subir la foto: ' + error.message);
      setF((x) => ({ ...x, foto_url: sb.storage.from('productos').getPublicUrl(ruta).data.publicUrl }));
    } catch (e) { aviso.error(e); } finally { setSubiendo(false); }
  }

  async function guardarTodo() {
    try {
      let pid = id;
      const fila = { ...f, nombre: f.nombre.trim(), foto_url: f.foto_url.trim() || null, descripcion: f.descripcion.trim() || null };
      if (id) await guardar(sb.from('productos').update(fila).eq('id', id));
      else {
        const { data, error } = await sb.from('productos').insert(fila).select('id').single();
        if (error) throw new Error(/duplicate/.test(error.message) ? 'Ya existe un producto con ese nombre' : error.message);
        pid = data.id;
      }
      for (const s of sedes as Sede[]) {
        const v = precios[s.id]; if (!v || v.precio === '') continue;
        const antes = datos?.ps.find((y: any) => y.sede_id === s.id);
        if (!antes) await guardar(sb.from('productos_sede').insert({ producto_id: pid, sede_id: s.id, precio: Number(v.precio), disponible: v.disponible, online: v.online }));
        else if (Number(antes.precio) !== Number(v.precio) || antes.disponible !== v.disponible || antes.online !== v.online)
          await guardar(sb.from('productos_sede').update({ precio: Number(v.precio), disponible: v.disponible, online: v.online }).eq('producto_id', pid).eq('sede_id', s.id));
      }
      const nueva = receta.filter((r) => r.insumo_id && Number(r.cantidad) > 0);
      if (JSON.stringify(nueva.map((r) => [r.insumo_id, Number(r.cantidad), r.ubicacion])) !== recetaOriginal && nueva.length)
        await rpc('guardar_receta', { p_producto: pid, p_detalles: nueva.map((r) => ({ ...r, cantidad: Number(r.cantidad) })) });
      window.dispatchEvent(new Event('mp:cambio'));
      onCerrar();
    } catch (e) { aviso.error(e); }
  }

  const ubicacionPorDefecto = f.estacion === 'horno' ? 'armado' : f.estacion === 'rapidas' ? 'nevera_rapidas' : 'bodega';

  return (
    <Ventana titulo={id ? `Editar · ${p.nombre}` : 'Nuevo producto'} onCerrar={onCerrar} ancho={720}>
      <div className="pila">
        <div className="fila envolver" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 2, minWidth: 200 }}><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div className="campo" style={{ flex: 1 }}><label>Categoría</label>
            <select value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })}>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        </div>
        <div className="fila envolver" style={{ gap: 10 }}>
          <div className="campo" style={{ flex: 1 }}><label>Formato de venta</label>
            <select value={f.formato} onChange={(e) => setF({ ...f, formato: e.target.value })}>{Object.entries(FORMATOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div className="campo" style={{ flex: 1 }}><label>Estación que lo prepara</label>
            <select value={f.estacion} onChange={(e) => setF({ ...f, estacion: e.target.value })}>{Object.entries(ESTACIONES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        </div>
        <div className="campo"><label>Descripción (la ve el cliente en la tienda)</label>
          <textarea rows={2} placeholder="Ingredientes, ej. queso mozarella, piña y jamón (sale en la tienda)" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></div>
        <div className="fila envolver" style={{ gap: 12, alignItems: 'end' }}>
          {f.foto_url && <img src={f.foto_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', background: '#000' }} />}
          <div className="campo" style={{ flex: 1, minWidth: 200 }}><label>Foto (sube una o pega un enlace)</label>
            <input placeholder="https://…" value={f.foto_url} onChange={(e) => setF({ ...f, foto_url: e.target.value })} /></div>
          <label className="btn">{subiendo ? 'Subiendo…' : '📷 Subir foto'}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} /></label>
        </div>
        <label className="fila" style={{ gap: 8, fontWeight: 700 }}><input type="checkbox" checked={f.destacado} onChange={(e) => setF({ ...f, destacado: e.target.checked })} /> ★ Mostrar en la portada giratoria de la tienda online</label>

        <b>Precio y disponibilidad por sede</b>
        {(sedes as Sede[]).map((s) => (
          <div key={s.id} className="fila envolver" style={{ gap: 8 }}>
            <span style={{ flex: 1, minWidth: 120, fontWeight: 600 }}>{s.nombre}</span>
            <input className="entrada" style={{ width: 130 }} inputMode="numeric" placeholder="$0" value={precios[s.id]?.precio ?? ''}
              onChange={(e) => setPrecios({ ...precios, [s.id]: { ...precios[s.id], precio: e.target.value.replace(/\D/g, '') } })} />
            <label className="fila" style={{ gap: 6 }}><input type="checkbox" checked={precios[s.id]?.disponible ?? true}
              onChange={(e) => setPrecios({ ...precios, [s.id]: { ...precios[s.id], disponible: e.target.checked } })} /> Se vende aquí</label>
            <label className="fila" style={{ gap: 6 }}><input type="checkbox" checked={precios[s.id]?.online ?? true}
              onChange={(e) => setPrecios({ ...precios, [s.id]: { ...precios[s.id], online: e.target.checked } })} /> En la tienda online</label>
          </div>
        ))}

        <b>Receta (qué gasta cada unidad vendida)</b>
        {receta.map((r, i) => {
          const ins = insumos.find((x: any) => x.id === r.insumo_id);
          const cambiar = (c: any) => { const n = [...receta]; n[i] = { ...n[i], ...c }; setReceta(n); };
          return (
            <div key={i} className="fila envolver" style={{ gap: 6 }}>
              <select style={{ flex: 2, minWidth: 160 }} value={r.insumo_id} onChange={(e) => cambiar({ insumo_id: e.target.value })}>
                <option value="">Insumo…</option>{insumos.map((x: any) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
              <input className="entrada" style={{ width: 90 }} inputMode="decimal" value={r.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value.replace(/[^\d.]/g, '') })} />
              <span className="texto-sec" style={{ width: 60 }}>{ins?.unidad}</span>
              <select value={r.ubicacion} onChange={(e) => cambiar({ ubicacion: e.target.value })}>
                {Object.entries(UBICACIONES).map(([k, n]) => <option key={k} value={k}>desde {n}</option>)}</select>
              <button className="enlace" onClick={() => setReceta(receta.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
        <button className="enlace" style={{ justifySelf: 'start' }} onClick={() => setReceta([...receta, { insumo_id: '', cantidad: '1', ubicacion: ubicacionPorDefecto }])}>＋ Agregar insumo a la receta</button>
        {datos?.rec && <div className="texto-sec" style={{ fontSize: 13 }}>Receta versión {datos.rec.version}. Si la cambias se guarda como versión nueva; las ventas anteriores conservan la suya.</div>}

        <label className="fila" style={{ gap: 8, fontWeight: 700 }}><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Producto activo</label>
        {aviso.vista}
        <button className="btn btn-principal btn-ancho" disabled={!f.nombre.trim()} onClick={guardarTodo}>Guardar producto</button>

        {datos?.hist?.length > 0 && <div>
          <b>Historial de precios</b>
          {datos.hist.map((h: any, i: number) => (
            <div key={i} className="texto-sec linea" style={{ fontSize: 13 }}>
              {new Date(h.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })} {hora(h.creado_en)} ·
              {' '}{(sedes as Sede[]).find((s) => s.id === h.sede_id)?.nombre}: {h.precio_ant != null ? `${plata(h.precio_ant)} → ` : ''}{plata(h.precio_nuevo)}{h.perfiles ? ` · ${h.perfiles.nombre}` : ''}
            </div>
          ))}
        </div>}
      </div>
    </Ventana>
  );
}

