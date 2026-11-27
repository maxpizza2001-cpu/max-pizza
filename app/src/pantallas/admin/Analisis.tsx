import { useMemo, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { factor, unidadEscrita } from '../../componentes/Inventario';
import { BarrasH, BarrasSedes, COLORES, Dona, Lineas } from '../../componentes/Graficas';
import { Titulo, UBICACIONES, useConsulta, type Sede, type SedeSel } from './comun';

const CATEGORIAS: Record<string, string> = {
  ingredientes: 'Ingredientes', produccion: 'Producción interna', porciones: 'Porciones y personales', aseo: 'Aseo',
  empaques: 'Empaques', bebidas: 'Bebidas', masa: 'Masa',
};
const AREAS: Record<string, string> = { ...UBICACIONES, produccion: 'Producción de insumos', nevera_rapidas: 'Comidas rápidas · Nevera', servicio: 'Meseros y servicio' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type Periodo = 'semana' | 'mes' | 'anio';
type Fila = { periodo: string; sede_id: string; sede: string; area: string; categoria: string; insumo_id: string; insumo: string; unidad: string;
  usado: number; comprado: number; merma: number; producido: number };

// Fechas en hora de Colombia (UTC−5 fijo)
const co = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 5));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function rango(p: Periodo, atras: number) {
  const hoy = new Date(Date.now() - 5 * 3600e3);
  const Y = hoy.getUTCFullYear(), M = hoy.getUTCMonth(), D = hoy.getUTCDate();
  if (p === 'semana') {
    const lunes = D - ((hoy.getUTCDay() + 6) % 7) - 7 * atras;
    return { desde: co(Y, M, lunes), hasta: co(Y, M, lunes + 7), paso: 'dia' as const };
  }
  if (p === 'mes') return { desde: co(Y, M - atras, 1), hasta: co(Y, M - atras + 1, 1), paso: 'dia' as const };
  return { desde: co(Y - atras, 0, 1), hasta: co(Y - atras + 1, 0, 1), paso: 'mes' as const };
}
function nombreRango(p: Periodo, atras: number) {
  const { desde, hasta } = rango(p, atras);
  if (p === 'anio') return String(desde.getUTCFullYear());
  if (p === 'mes') return MESES[desde.getUTCMonth()] + ' ' + desde.getUTCFullYear();
  const fin = new Date(hasta.getTime() - 86400e3);
  return `${desde.getUTCDate()} ${MESES[desde.getUTCMonth()]} – ${fin.getUTCDate()} ${MESES[fin.getUTCMonth()]}`;
}
function etiquetasDe(p: Periodo, atras: number) {
  const { desde, hasta, paso } = rango(p, atras);
  const out: { clave: string; texto: string }[] = [];
  if (paso === 'mes') for (let m = 0; m < 12; m++) out.push({ clave: ymd(co(desde.getUTCFullYear(), m, 1)).slice(0, 7), texto: MESES[m] });
  else for (let d = new Date(desde); d < hasta; d = new Date(d.getTime() + 86400e3)) out.push({ clave: ymd(d), texto: p === 'semana' ? ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][out.length] : String(d.getUTCDate()) });
  return out;
}

export function Analisis({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [atras, setAtras] = useState(0);
  const [cat, setCat] = useState('');
  const [area, setArea] = useState('');
  const [producto, setProducto] = useState('');
  const [verTabla, setVerTabla] = useState(false);
  const sedesQ = sede === 'todas' ? null : [sede];

  const pedir = (a: number) => { const r = rango(periodo, a); return rpc<Fila[]>('analisis_periodo', { p_sedes: sedesQ, p_desde: r.desde.toISOString(), p_hasta: r.hasta.toISOString(), p_paso: r.paso }); };
  const { datos, error } = useConsulta('analisis2', async () => {
    const [ahora, antes] = await Promise.all([pedir(atras), pedir(atras + 1)]);
    const n = (x: Fila[]) => (x ?? []).map((f) => ({ ...f, usado: +f.usado, comprado: +f.comprado, merma: +f.merma, producido: +f.producido }));
    return { ahora: n(ahora), antes: n(antes) };
  }, [sede, periodo, atras], ['movimientos_stock']);

  const filtrar = (x: Fila[]) => x.filter((f) => (!cat || f.categoria === cat) && (!area || f.area === area) && (!producto || f.insumo_id === producto));
  const ahora = filtrar(datos?.ahora ?? []), antes = filtrar(datos?.antes ?? []);

  // Solo se suman cosas de la misma unidad: kg con kg, litros con litros, unidades con unidades
  const unidades = [...new Set(ahora.map((f) => f.unidad))];
  const conteoU = (u: string) => ahora.filter((f) => f.unidad === u).reduce((a, f) => a + f.usado, 0) / factor(u);
  const [unidadElegida, setUnidad] = useState('');
  const unidad = unidades.includes(unidadElegida) ? unidadElegida : [...unidades].sort((a, b) => conteoU(b) - conteoU(a))[0] ?? 'g';
  const enU = (x: Fila[]) => x.filter((f) => f.unidad === unidad);
  const v = (n: number) => n / factor(unidad);
  const fmt = (n: number) => `${(Math.round(v(n) * 10) / 10).toLocaleString('es-CO')} ${unidadEscrita(unidad)}`;
  const suma = (x: Fila[], k: keyof Fila) => x.reduce((a, f) => a + Number(f[k]), 0);

  const opcionesProd = useMemo(() => {
    const m = new Map<string, string>(); for (const f of datos?.ahora ?? []) m.set(f.insumo_id, f.insumo);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [datos]);

  // Totales del período y comparación con el anterior
  const tot = { usado: suma(enU(ahora), 'usado'), comprado: suma(enU(ahora), 'comprado'), merma: suma(enU(ahora), 'merma'), producido: suma(enU(ahora), 'producido') };
  const totAntes = suma(enU(antes), 'usado');
  const variacion = totAntes > 0 ? Math.round((100 * (tot.usado - totAntes)) / totAntes) : null;

  // Tendencia
  const etq = etiquetasDe(periodo, atras);
  const porPaso = (k: 'usado' | 'comprado') => etq.map((e) => suma(enU(ahora).filter((f) => f.periodo.startsWith(e.clave)), k) / factor(unidad));

  // Por producto
  const porProd = new Map<string, { nombre: string; usado: number; antes: number; unidad: string }>();
  for (const f of ahora) { const x = porProd.get(f.insumo_id) ?? { nombre: f.insumo, usado: 0, antes: 0, unidad: f.unidad }; x.usado += f.usado; porProd.set(f.insumo_id, x); }
  for (const f of antes) { const x = porProd.get(f.insumo_id); if (x) x.antes += f.usado; }
  const prods = [...porProd.entries()].filter(([, x]) => x.unidad === unidad && x.usado > 0).sort((a, b) => b[1].usado - a[1].usado);
  const barra = ([k, x]: [string, { nombre: string; usado: number; antes: number }], color = COLORES[0]) => ({
    clave: k, nombre: x.nombre, valor: x.usado, texto: fmt(x.usado), color,
    extra: x.antes ? `antes ${fmt(x.antes)} (${x.usado >= x.antes ? '▲' : '▼'} ${Math.abs(Math.round((100 * (x.usado - x.antes)) / x.antes))}%)` : 'sin datos del período anterior' });

  // Reparto por categoría y por área
  const agrupar = (k: 'categoria' | 'area', nombres: Record<string, string>) => {
    const m = new Map<string, number>(); for (const f of enU(ahora)) m.set(f[k], (m.get(f[k]) ?? 0) + f.usado);
    return [...m.entries()].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([c, x], i) => ({ clave: c, nombre: nombres[c] ?? c, valor: x, color: COLORES[i % COLORES.length] }));
  };
  const porCat = agrupar('categoria', CATEGORIAS);
  const porArea = agrupar('area', AREAS);

  // Comparación entre sedes (vista Todas las sedes)
  const sedesCon = sedes.map((s, i) => ({ id: s.id, nombre: s.nombre, color: COLORES[i % COLORES.length] })).filter((s) => ahora.some((f) => f.sede_id === s.id));
  const valorSede = (prodNombre: string, sedeId: string) => enU(ahora).filter((f) => f.insumo === prodNombre && f.sede_id === sedeId).reduce((a, f) => a + f.usado, 0);
  const totalSede = (sedeId: string) => enU(ahora).filter((f) => f.sede_id === sedeId).reduce((a, f) => a + f.usado, 0);

  // Variaciones grandes
  const variaciones = prods.filter(([, x]) => x.antes > 0).map(([k, x]) => ({ k, x, p: Math.round((100 * (x.usado - x.antes)) / x.antes) }))
    .sort((a, b) => Math.abs(b.p) - Math.abs(a.p)).slice(0, 6);

  return (
    <div className="pila">
      <Titulo>Análisis de consumo</Titulo>

      {/* Filtros en una sola franja */}
      <div className="tarjeta pila" style={{ gap: 10 }}>
        <div className="fila envolver" style={{ gap: 6 }}>
          {([['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']] as const).map(([k, n]) => (
            <button key={k} className={'pastilla' + (periodo === k ? ' activa' : '')} onClick={() => { setPeriodo(k); setAtras(0); }}>{n}</button>
          ))}
          <span className="fila" style={{ gap: 4, marginLeft: 'auto' }}>
            <button className="btn btn-suave" style={{ padding: '6px 12px' }} onClick={() => setAtras(atras + 1)} aria-label="Período anterior">‹</button>
            <b style={{ minWidth: 130, textAlign: 'center' }}>{nombreRango(periodo, atras)}</b>
            <button className="btn btn-suave" style={{ padding: '6px 12px' }} disabled={atras === 0} onClick={() => setAtras(atras - 1)} aria-label="Período siguiente">›</button>
          </span>
        </div>
        <div className="fila envolver" style={{ gap: 6 }}>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>{Object.entries(CATEGORIAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>{Object.entries(AREAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select value={producto} onChange={(e) => setProducto(e.target.value)} aria-label="Producto">
            <option value="">Todos los productos</option>{opcionesProd.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          {unidades.length > 1 && <select value={unidad} onChange={(e) => setUnidad(e.target.value)} aria-label="Medir en">
            {unidades.map((u) => <option key={u} value={u}>Medir en {unidadEscrita(u)}</option>)}</select>}
        </div>
        <div className="texto-sec" style={{ fontSize: 12.5 }}>Sede: {sede === 'todas' ? 'todas tus sedes' : sedes.find((s) => s.id === sede)?.nombre} (se cambia arriba). Las gráficas suman solo productos que se miden en {unidadEscrita(unidad)}.</div>
      </div>

      {error && <div className="error">{error}</div>}
      {datos && ahora.length === 0 && <div className="aviso">No hay movimientos registrados en este período con estos filtros.</div>}

      {ahora.length > 0 && <>
        <div className="cifras cuatro">
          <div><span>Usado</span><b>{fmt(tot.usado)}</b>{variacion !== null && <small className={variacion > 0 ? 'txt-rojo' : 'texto-sec'}>{variacion >= 0 ? '▲' : '▼'} {Math.abs(variacion)}% vs. anterior</small>}</div>
          <div><span>Comprado / recibido</span><b>{fmt(tot.comprado)}</b></div>
          <div><span>Producido en casa</span><b>{fmt(tot.producido)}</b></div>
          <div><span>Merma y ajustes</span><b className={tot.merma ? 'txt-rojo' : ''}>{fmt(tot.merma)}</b></div>
        </div>

        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Tendencia · usado y comprado</h2>
          <Lineas etiquetas={etq.map((e) => e.texto)} formato={(n) => `${(Math.round(n * 10) / 10).toLocaleString('es-CO')} ${unidadEscrita(unidad)}`}
            series={[{ nombre: 'Usado', color: COLORES[0], valores: porPaso('usado') }, { nombre: 'Comprado', color: COLORES[1], valores: porPaso('comprado') }]} />
        </div>

        <div className="dos-columnas">
          <div className="tarjeta"><h2 style={{ marginBottom: 8 }}>Mayor consumo</h2><BarrasH datos={prods.slice(0, 8).map((p) => barra(p))} /></div>
          <div className="tarjeta"><h2 style={{ marginBottom: 8 }}>Menor consumo</h2><BarrasH datos={prods.slice(-5).reverse().map((p) => barra(p, COLORES[2]))} /></div>
        </div>

        <div className="dos-columnas">
          <div className="tarjeta"><h2 style={{ marginBottom: 8 }}>Por categoría</h2><Dona datos={porCat} formato={fmt} /></div>
          <div className="tarjeta"><h2 style={{ marginBottom: 8 }}>Por área</h2>
            <BarrasH datos={porArea.map((a) => ({ clave: a.clave, nombre: a.nombre, valor: a.valor, texto: fmt(a.valor), color: COLORES[0] }))} /></div>
        </div>

        {sede === 'todas' && sedesCon.length > 1 && (
          <div className="tarjeta">
            <h2 style={{ marginBottom: 8 }}>Comparación entre sedes</h2>
            <BarrasH datos={sedesCon.map((s) => ({ clave: s.id, nombre: s.nombre, valor: totalSede(s.id), texto: fmt(totalSede(s.id)), color: s.color }))} />
            <h2 style={{ margin: '14px 0 8px', fontSize: 16 }}>Productos que más se usan, por sede</h2>
            <BarrasSedes productos={prods.slice(0, 6).map(([, x]) => x.nombre)} sedes={sedesCon} valor={valorSede} formato={fmt} />
          </div>
        )}

        {variaciones.length > 0 && (
          <div className="tarjeta">
            <h2 style={{ marginBottom: 8 }}>Variación vs. período anterior</h2>
            {variaciones.map(({ k, x, p }) => (
              <div key={k} className="fila entre linea">
                <span><b>{x.nombre}</b> <span className="texto-sec">· {fmt(x.antes)} → {fmt(x.usado)}</span></span>
                <span className={'estado ' + (p > 0 ? 'estado-alta' : 'estado-baja')}>{p > 0 ? '▲ subió' : '▼ bajó'} {Math.abs(p)}%</span>
              </div>
            ))}
          </div>
        )}

        <button className="enlace" style={{ justifySelf: 'start' }} onClick={() => setVerTabla(!verTabla)}>{verTabla ? 'Ocultar tabla' : 'Ver todo en tabla'}</button>
        {verTabla && <TablaDetalle filas={ahora} sedeTodas={sede === 'todas'} />}
      </>}

      <HistorialTortas sede={sede} />
    </div>
  );
}

function TablaDetalle({ filas, sedeTodas }: { filas: Fila[]; sedeTodas: boolean }) {
  const m = new Map<string, Fila>();
  for (const f of filas) {
    const k = f.insumo_id + (sedeTodas ? f.sede_id : '');
    const x = m.get(k) ?? { ...f, usado: 0, comprado: 0, merma: 0, producido: 0 };
    x.usado += f.usado; x.comprado += f.comprado; x.merma += f.merma; x.producido += f.producido; m.set(k, x);
  }
  const c = (n: number, u: string) => n ? `${(Math.round((n / factor(u)) * 10) / 10).toLocaleString('es-CO')} ${unidadEscrita(u)}` : '—';
  return (
    <div className="tarjeta" style={{ overflowX: 'auto' }}>
      <table className="tabla-simple">
        <thead><tr><th>Producto</th>{sedeTodas && <th>Sede</th>}<th>Usado</th><th>Comprado</th><th>Producido</th><th>Merma</th></tr></thead>
        <tbody>{[...m.values()].sort((a, b) => a.insumo.localeCompare(b.insumo)).map((f) => (
          <tr key={f.insumo_id + f.sede_id}><td><b>{f.insumo}</b></td>{sedeTodas && <td>{f.sede}</td>}
            <td>{c(f.usado, f.unidad)}</td><td>{c(f.comprado, f.unidad)}</td><td>{c(f.producido, f.unidad)}</td><td>{c(f.merma, f.unidad)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Historial completo de producción de tortas (solo Administración) */
function HistorialTortas({ sede }: { sede: SedeSel }) {
  const [paso, setPaso] = useState<'dia' | 'semana' | 'mes' | 'anio'>('dia');
  const { datos } = useConsulta('tortas-hist', () => {
    const hasta = new Date(Date.now() + 86400e3), desde = new Date(Date.now() - (paso === 'anio' ? 3 * 365 : paso === 'mes' ? 365 : paso === 'semana' ? 120 : 31) * 86400e3);
    return rpc<any[]>('produccion_tortas_historial', { p_sedes: sede === 'todas' ? null : [sede], p_desde: desde.toISOString(), p_hasta: hasta.toISOString(), p_paso: paso });
  }, [sede, paso], ['lotes_produccion']);
  const fecha = (d: string) => {
    const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
    return paso === 'anio' ? String(y) : paso === 'mes' ? `${MESES[m - 1]} ${y}` : paso === 'semana' ? `Semana del ${dd} ${MESES[m - 1]}` : `${dd} ${MESES[m - 1]} ${y}`;
  };
  return (
    <div className="tarjeta pila" style={{ gap: 8 }}>
      <div className="fila entre envolver"><h2>Historial de producción de tortas</h2>
        <span className="fila" style={{ gap: 4 }}>{([['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']] as const).map(([k, n]) => (
          <button key={k} className={'pastilla' + (paso === k ? ' activa' : '')} onClick={() => setPaso(k)}>{n}</button>))}</span></div>
      {(datos ?? []).length === 0 && <div className="texto-sec">Sin registros de monjes o tortas.</div>}
      <div style={{ overflowX: 'auto', maxHeight: 360 }}>
        <table className="tabla-simple">
          <thead><tr><th>Fecha</th><th>Sede</th><th>Persona</th><th>Registro</th><th>Cantidad</th></tr></thead>
          <tbody>{(datos ?? []).map((r, i) => (
            <tr key={i}><td>{fecha(r.periodo)}</td><td>{r.sede}</td><td>{r.persona}</td><td>{r.tipo}</td><td><b>{Number(r.cantidad).toLocaleString('es-CO')}</b></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
