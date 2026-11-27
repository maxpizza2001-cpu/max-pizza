import { useState } from 'react';
import { useCapa } from '../../lib/atras';
import { rpc, sb } from '../../lib/supabase';
import { cant, hora, mesa2, plata, ROLES } from '../../lib/formato';
import { q, useConsulta, usePermisos, useSedes, type SedeSel } from './comun';
import { useEffect } from 'react';
import { Sedes } from './Sedes';
import { Equipo } from './Equipo';
import { Checklists } from './Checklists';
import { Reglas } from './Reglas';
import { Catalogo } from './Catalogo';
import { InventarioAdmin } from './InventarioAdmin';
import { Proveedores, Compras } from './Compras';
import { Analisis } from './Analisis';
import { CajaAdmin } from './CajaAdmin';
import { Domicilios } from './Domicilios';
import { TiendaAdmin } from './TiendaAdmin';

type Seccion = 'inicio' | 'equipo' | 'tareas' | 'stock' | 'compras' | 'caja' | 'sedes' | 'reglas' | 'catalogo' | 'proveedores' | 'analisis' | 'domicilios' | 'tienda';

const SECCIONES: [Seccion, string, string][] = [
  ['inicio', '🏠', 'Inicio'], ['equipo', '👥', 'Equipo'], ['tareas', '☑', 'Tareas'], ['stock', '📦', 'Inventario'],
  ['compras', '🛒', 'Compras'], ['caja', '💵', 'Caja'], ['domicilios', '🛵', 'Domicilios'], ['tienda', '🌐', 'Tienda online'], ['reglas', '⚠', 'Stock bajo'], ['catalogo', '🍕', 'Catálogo'],
  ['proveedores', '🚚', 'Proveedores'], ['analisis', '📊', 'Análisis'], ['sedes', '🏪', 'Sedes'],
];

export function Admin({ perfil }: { perfil: string }) {
  const [seccion, setSeccion] = useState<Seccion>(() => (sessionStorage.getItem('mp.admin.seccion') as Seccion) ?? 'inicio');
  const [sede, setSede] = useState<SedeSel>(() => localStorage.getItem('mp.admin.sede') ?? 'todas');
  const { sedes } = useSedes();
  const ir = (s: Seccion) => { setSeccion(s); sessionStorage.setItem('mp.admin.seccion', s); window.scrollTo(0, 0); };
  useCapa(seccion !== 'inicio', () => ir('inicio'));   // atrás vuelve al inicio de Administración
  const cambiarSede = (s: string) => { setSede(s); localStorage.setItem('mp.admin.sede', s); };
  const permisos = usePermisos(perfil);
  // Si la sede guardada ya no es de esta persona, vuelve a "Todas mis sedes"
  useEffect(() => { if (sedes.length && sede !== 'todas' && !sedes.some((s) => s.id === sede)) cambiarSede('todas'); }, [sedes, sede]);
  const props = { sede, sedes, perfil };

  return (
    <main className="contenido pila" style={{ maxWidth: 1180 }}>
      <div className="fila entre envolver">
        <h1>{permisos.esCeo ? 'Administrador CEO' : 'Administración'}</h1>
        <div className="selector-sede">
          <span aria-hidden>🏪</span>
          <select value={sede} onChange={(e) => cambiarSede(e.target.value)} aria-label="Sede">
            <option value="todas">{permisos.esCeo ? 'Todas las sedes' : 'Todas mis sedes'}</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.activa ? '' : ' (inactiva)'}</option>)}
          </select>
        </div>
      </div>
      <nav className="admin-nav">
        {SECCIONES.map(([k, ic, t]) => (
          <button key={k} className={seccion === k ? 'activo' : ''} onClick={() => ir(k)}><span>{ic}</span>{t}</button>
        ))}
      </nav>

      {seccion === 'inicio' && <Inicio {...props} ir={ir} />}
      {seccion === 'equipo' && <Equipo {...props} permisos={permisos} />}
      {seccion === 'tareas' && <Checklists {...props} />}
      {seccion === 'stock' && <InventarioAdmin {...props} />}
      {seccion === 'compras' && <Compras {...props} />}
      {seccion === 'caja' && <CajaAdmin {...props} />}
      {seccion === 'domicilios' && <Domicilios {...props} />}
      {seccion === 'tienda' && <TiendaAdmin {...props} />}
      {seccion === 'reglas' && <Reglas {...props} />}
      {seccion === 'catalogo' && <Catalogo {...props} />}
      {seccion === 'proveedores' && <Proveedores {...props} />}
      {seccion === 'analisis' && <Analisis {...props} />}
      {seccion === 'sedes' && <Sedes {...props} permisos={permisos} />}
    </main>
  );
}

// ───────── Portada: primero lo que necesita una decisión ─────────
function Inicio({ sede, sedes, ir }: { sede: SedeSel; sedes: { id: string; nombre: string }[]; ir: (s: Seccion) => void }) {
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';
  const filtro = <T,>(x: T & { eq: (c: string, v: string) => T }) => (sede === 'todas' ? x : x.eq('sede_id', sede));

  const { datos: alertas } = useConsulta('ini-alertas', () => q<any[]>(filtro(sb.from('alertas_stock')
    .select('id, sede_id, saldo, abierta_en, reglas_stock(minimo, texto, rol_destino, insumos(nombre, unidad), ubicaciones_stock(nombre))')
    .eq('estado', 'activa') as any).order('abierta_en', { ascending: false })), [sede], ['alertas_stock']);
  const { datos: reportes, recargar: recRep } = useConsulta('ini-reportes', () => q<any[]>(filtro(sb.from('reportes_stock')
    .select('id, sede_id, tipo, conteo, saldo_sistema, creado_en, insumos(nombre, unidad), perfiles!reportes_stock_perfil_id_fkey(nombre)')
    .eq('estado', 'nuevo') as any).order('creado_en', { ascending: false }).limit(20)), [sede], ['reportes_stock']);
  const { datos: tareasAdmin } = useConsulta('ini-tareas', () => q<any[]>(filtro(sb.from('tareas')
    .select('id, sede_id, titulo, detalle, prioridad, estado').eq('rol', 'admin').in('estado', ['pendiente', 'en_proceso']) as any)
    .order('creada_en', { ascending: false })), [sede], ['tareas']);
  const { datos: turnos } = useConsulta('ini-turnos', () => q<any[]>(filtro(sb.from('turnos')
    .select('id, sede_id, rol, inicio, perfiles(nombre)').is('fin', null) as any)), [sede], ['turnos']);
  const { datos: porCobrar } = useConsulta('ini-cobrar', () => q<any[]>(filtro(sb.from('v_por_cobrar').select('sede_id, mesa, saldo') as any)), [sede], ['cuentas', 'pagos']);
  const { datos: progreso } = useConsulta('ini-progreso', async () => {
    const lista = sede === 'todas' ? sedes.map((s) => s.id) : [sede];
    const filas: { sede: string; rol: string; listas: number; total: number; porcentaje: number }[] = [];
    for (const s of lista) for (const rol of Object.keys(ROLES).filter((r) => r !== 'admin')) {
      const { data } = await sb.rpc('progreso_tareas', { p_sede: s, p_rol: rol });
      const p = (data as any[])?.[0];
      if (p?.total) filas.push({ sede: s, rol, ...p });
    }
    return filas;
  }, [sede, sedes.length], ['tareas']);

  async function marcarRevisado(id: string) {
    await sb.from('reportes_stock').update({ estado: 'revisado', revisado_en: new Date().toISOString() }).eq('id', id);
    recRep();
  }
  async function completar(id: string) { try { await rpc('tarea_completar', { p_tarea: id }); } catch (e) { alert((e as Error).message); } }

  const hayDecisiones = (alertas?.length ?? 0) + (reportes?.length ?? 0) + (tareasAdmin?.length ?? 0) > 0;

  return (
    <div className="pila">
      <div className="cifras cuatro">
        <button onClick={() => ir('reglas')}><span>Stock bajo</span><b className={alertas?.length ? 'txt-rojo' : ''}>{alertas?.length ?? '…'}</b></button>
        <button onClick={() => ir('equipo')}><span>En turno ahora</span><b>{turnos?.length ?? '…'}</b></button>
        <button onClick={() => ir('caja')}><span>Mesas por cobrar</span><b>{porCobrar?.length ?? '…'}</b></button>
        <button onClick={() => ir('caja')}><span>Saldo por cobrar</span><b>{plata((porCobrar ?? []).reduce((t, x) => t + Number(x.saldo), 0))}</b></button>
      </div>

      {hayDecisiones && <h2>Requiere tu decisión</h2>}
      {(tareasAdmin ?? []).map((t) => (
        <div key={t.id} className="tarjeta fila entre envolver decision">
          <div>
            <b>{t.titulo}</b> <span className={`estado estado-${t.prioridad}`}>● {t.prioridad === 'alta' ? 'Alta' : t.prioridad === 'media' ? 'Media' : 'Baja'}</span>
            <div className="texto-sec">{t.detalle} · {nombreSede(t.sede_id)}</div>
          </div>
          <div className="fila" style={{ gap: 6 }}>
            {/compra|Comprar/i.test(t.titulo) && <button className="btn btn-suave" onClick={() => ir('compras')}>Ir a compras</button>}
            <button className="btn btn-principal" onClick={() => completar(t.id)}>Marcar lista</button>
          </div>
        </div>
      ))}
      {(alertas ?? []).map((a) => (
        <div key={a.id} className="tarjeta fila entre envolver decision alerta">
          <div>
            <b>{a.reglas_stock?.insumos?.nombre}</b> <span className="estado estado-alta">Stock bajo</span>
            <div className="texto-sec">
              Quedan {cant(Number(a.saldo), a.reglas_stock?.insumos?.unidad)} · mínimo {cant(Number(a.reglas_stock?.minimo), a.reglas_stock?.insumos?.unidad)}
              {' '}· {a.reglas_stock?.ubicaciones_stock?.nombre} · {nombreSede(a.sede_id)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Tarea enviada a {ROLES[a.reglas_stock?.rol_destino]}: “{a.reglas_stock?.texto}”</div>
          </div>
          <span className="texto-sec">desde {hora(a.abierta_en)}</span>
        </div>
      ))}
      {(reportes ?? []).map((r) => (
        <div key={r.id} className="tarjeta fila entre envolver decision">
          <div>
            <b>{r.tipo === 'queda_poco' ? 'Queda poco' : r.tipo === 'se_acabo' ? 'Se acabó' : 'Conteo'} · {r.insumos?.nombre}</b>
            <div className="texto-sec">
              {r.conteo != null && `Contaron ${cant(Number(r.conteo), r.insumos?.unidad)} · el sistema dice ${cant(Number(r.saldo_sistema), r.insumos?.unidad)} · `}
              {r.perfiles?.nombre} · {nombreSede(r.sede_id)} · {hora(r.creado_en)}
            </div>
          </div>
          <div className="fila" style={{ gap: 6 }}>
            {r.conteo != null && <button className="btn btn-suave" onClick={() => ir('stock')}>Corregir saldo</button>}
            <button className="btn btn-principal" onClick={() => marcarRevisado(r.id)}>Revisado</button>
          </div>
        </div>
      ))}
      {!hayDecisiones && alertas && <div className="ok">Todo en orden: no hay alertas ni reportes pendientes.</div>}

      <div className="dos-columnas">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Avance de tareas por área</h2>
          {(progreso ?? []).length === 0 && <div className="texto-sec">Sin tareas vigentes.</div>}
          {(progreso ?? []).map((p) => (
            <div key={p.sede + p.rol} className="linea">
              <div className="fila entre" style={{ fontSize: 14 }}>
                <b>{ROLES[p.rol]}{sede === 'todas' ? ` · ${nombreSede(p.sede)}` : ''}</b>
                <span>{p.listas} de {p.total} · {p.porcentaje} %</span>
              </div>
              <div className="barra-mini"><div style={{ width: `${p.porcentaje}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>En turno</h2>
          {(turnos ?? []).length === 0 && <div className="texto-sec">Nadie ha iniciado turno.</div>}
          {(turnos ?? []).map((t) => (
            <div key={t.id} className="fila entre linea">
              <span><b>{t.perfiles?.nombre}</b> <span className="texto-sec">· {ROLES[t.rol]}{sede === 'todas' ? ` · ${nombreSede(t.sede_id)}` : ''}</span></span>
              <span className="texto-sec">desde {hora(t.inicio)}</span>
            </div>
          ))}
          {(porCobrar ?? []).length > 0 && <>
            <h2 style={{ margin: '14px 0 8px' }}>Mesas por cobrar</h2>
            <div className="fila envolver" style={{ gap: 6 }}>
              {(porCobrar ?? []).map((m, i) => <span key={i} className="estado estado-media">Mesa {mesa2(m.mesa)} · {plata(m.saldo)}{sede === 'todas' ? ` · ${nombreSede(m.sede_id)}` : ''}</span>)}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
