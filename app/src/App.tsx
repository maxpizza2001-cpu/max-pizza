import { Domiciliario } from './pantallas/Domiciliario';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurado, sb } from './lib/supabase';
import { ROLES } from './lib/formato';
import { Logo } from './componentes/Logo';
import { BotonAtras } from './componentes/BotonAtras';
import { useCapa } from './lib/atras';
import { MiTurno } from './componentes/MiTurno';
import { MisTareas } from './componentes/MisTareas';
import { Entrar } from './pantallas/Entrar';
import { Caja } from './pantallas/Caja';
import { Mesero } from './pantallas/Mesero';
import { Rapidas } from './pantallas/Rapidas';
import { Armado } from './pantallas/Armado';
import { Insumos, Tortas } from './pantallas/Produccion';
import { Admin } from './pantallas/admin/Admin';

type Acceso = { sede_id: string; rol: string; sedes: { nombre: string } | null };
type Area = { sede: string; sedeNombre: string; rol: string };

const CLAVE_AREA = 'maxpizza.area';
const TODAS = 'todas';
const esAdmin = (rol: string) => rol === 'admin' || rol === 'ceo';
/** Áreas donde tiene sentido ver "Todas mis sedes" juntas (cada registro sigue quedando en su sede real). */
const ROLES_TODAS = ['insumos', 'tortas', 'armado', 'rapidas'];

/** Vista "Todas mis sedes": un resumen por sede, bien separado. Para registrar algo se entra a la sede. */
function TodasMisSedes({ rol, sedes, perfil, onElegir }: { rol: string; sedes: { id: string; nombre: string }[]; perfil: string; onElegir: (s: { id: string; nombre: string }) => void }) {
  return (
    <main className="contenido pila" style={{ maxWidth: 760 }}>
      <h1>{ROLES[rol]} · Todas mis sedes</h1>
      <div className="texto-sec">Cada sede tiene su propio inventario. Para registrar producción o movimientos, entra a la sede.</div>
      {sedes.map((s) => (
        <section key={s.id} className="tarjeta pila">
          <div className="fila entre">
            <h2>📍 {s.nombre}</h2>
            <button className="btn btn-principal" onClick={() => onElegir(s)}>Entrar a {s.nombre}</button>
          </div>
          <MisTareas sede={s.id} rol={rol} perfil={perfil} compacto />
        </section>
      ))}
    </main>
  );
}

/** App interna del equipo (todo lo que no es /pedir). La tienda de clientes se carga aparte en main.tsx. */
export default function AppInterna() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [listo, setListo] = useState(!configurado);

  useEffect(() => {
    if (!configurado) return;
    sb.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!listo) return null;
  if (!sesion) return <Entrar />;
  return <AreaDeTrabajo perfil={sesion.user.id} />;
}

function AreaDeTrabajo({ perfil }: { perfil: string }) {
  const [accesos, setAccesos] = useState<Acceso[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [area, setArea] = useState<Area | null>(() => {
    try { return JSON.parse(localStorage.getItem(CLAVE_AREA) ?? 'null'); } catch { return null; }
  });

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: p }] = await Promise.all([
        sb.from('accesos_sede').select('sede_id, rol, sedes(nombre)').eq('perfil_id', perfil),
        sb.from('perfiles').select('nombre').eq('id', perfil).single(),
      ]);
      let lista = (a ?? []) as unknown as Acceso[];
      // El CEO entra a Administración global: no se repite como "Administración" de cada sede
      if (lista.some((l) => l.rol === 'ceo')) lista = [lista.find((l) => l.rol === 'ceo')!, ...lista.filter((l) => !['ceo', 'admin'].includes(l.rol))];
      else { const adm = lista.find((l) => l.rol === 'admin'); if (adm) lista = [adm, ...lista.filter((l) => l.rol !== 'admin')]; }
      setAccesos(lista);
      setNombre(p?.nombre ?? '');
      // Si solo tiene un área, entra directo; si el área guardada ya no aplica, se borra
      const vale = (x: Area | null) => x && lista.some((l) => l.rol === x.rol && (l.sede_id === x.sede
        || (x.sede === TODAS && ROLES_TODAS.includes(x.rol) && lista.filter((m) => m.rol === x.rol).length > 1)));
      if (!vale(area)) {
        if (lista.length === 1) elegir({ sede: lista[0].sede_id, sedeNombre: lista[0].sedes?.nombre ?? '', rol: lista[0].rol });
        else elegir(null);
      }
    })();
  }, [perfil]);

  function elegir(a: Area | null) {
    setArea(a);
    if (a) localStorage.setItem(CLAVE_AREA, JSON.stringify(a)); else localStorage.removeItem(CLAVE_AREA);
  }

  // Atrás desde un área de trabajo vuelve a "¿Dónde trabajas hoy?" (si la persona tiene varias)
  useCapa(!!area && new Set((accesos ?? []).map((a) => a.rol)).size > 1, () => elegir(null));

  async function salir() {
    localStorage.removeItem(CLAVE_AREA);
    await sb.auth.signOut();
  }

  if (!accesos) return null;

  // Solo las sedes y áreas que Administración le asignó a esta persona
  const roles = [...new Set(accesos.map((a) => a.rol))];
  const sedesDe = (rol: string) => accesos.filter((a) => a.rol === rol).map((a) => ({ id: a.sede_id, nombre: a.sedes?.nombre ?? '' }));
  const unaSola = new Set(accesos.map((a) => a.sede_id)).size === 1;
  const sedesArea = area ? sedesDe(area.rol) : [];
  const conTodas = (rol: string) => ROLES_TODAS.includes(rol) && sedesDe(rol).length > 1;

  return (
    <>
      <header className="barra">
        <div className="barra-izq"><BotonAtras /><Logo alto={58} /></div>
        <div className="barra-der">
          {area && roles.length > 1 && (
            <button className="chip-sede" onClick={() => elegir(null)}>{ROLES[area.rol]} ▾</button>
          )}
          {area && !esAdmin(area.rol) && sedesArea.length === 1 && <span className="chip-sede" style={{ background: 'transparent' }}>📍 {area.sedeNombre}</span>}
          <button className="chip-sede" onClick={salir}>Salir</button>
        </div>
      </header>

      {/* Cambio rápido de sede: solo aparece si esta persona tiene 2 o más sedes en esta área */}
      {area && !esAdmin(area.rol) && sedesArea.length > 1 && (
        <nav className="selector-sedes" aria-label="Mis sedes">
          {sedesArea.map((s) => (
            <button key={s.id} className={area.sede === s.id ? 'activa' : ''} onClick={() => elegir({ sede: s.id, sedeNombre: s.nombre, rol: area.rol })}>📍 {s.nombre}</button>
          ))}
          {conTodas(area.rol) && (
            <button className={area.sede === TODAS ? 'activa' : ''} onClick={() => elegir({ sede: TODAS, sedeNombre: 'Todas mis sedes', rol: area.rol })}>Todas mis sedes</button>
          )}
        </nav>
      )}

      {!area ? (
        <main className="contenido pila" style={{ maxWidth: 520 }}>
          <h1>Hola{nombre ? `, ${nombre}` : ''}</h1>
          {accesos.length === 0 && <div className="aviso">Todavía no tienes sedes asignadas. Pídele acceso a Administración.</div>}
          {accesos.length > 0 && <div className="texto-sec">{unaSola ? `📍 ${accesos[0].sedes?.nombre} · ¿En qué área trabajas hoy?` : '¿Dónde trabajas hoy?'}</div>}
          {roles.map((rol) => {
            const ss = sedesDe(rol);
            if (unaSola || esAdmin(rol) || ss.length === 1) return (
              <button key={rol} className="tarjeta btn" style={{ justifyContent: 'space-between' }}
                onClick={() => elegir({ sede: ss[0].id, sedeNombre: ss[0].nombre, rol })}>
                <span className="titulo" style={{ fontSize: 18 }}>{ROLES[rol]}</span>
                {!unaSola && !esAdmin(rol) && <span className="texto-sec">{ss[0].nombre}</span>}
              </button>
            );
            return (
              <div key={rol} className="tarjeta pila" style={{ gap: 10 }}>
                <span className="titulo" style={{ fontSize: 18 }}>{ROLES[rol]}</span>
                <div className="fila envolver" style={{ gap: 8 }}>
                  {ss.map((s) => <button key={s.id} className="btn btn-suave" onClick={() => elegir({ sede: s.id, sedeNombre: s.nombre, rol })}>📍 {s.nombre}</button>)}
                  {conTodas(rol) && <button className="btn btn-negro" onClick={() => elegir({ sede: TODAS, sedeNombre: 'Todas mis sedes', rol })}>Todas mis sedes</button>}
                </div>
              </div>
            );
          })}
        </main>
      ) : area.sede === TODAS ? (
        <TodasMisSedes rol={area.rol} sedes={sedesArea} perfil={perfil} onElegir={(s) => elegir({ sede: s.id, sedeNombre: s.nombre, rol: area.rol })} />
      ) : area.rol === 'caja' ? <Caja key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'mesero' ? <Mesero key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'rapidas' ? <Rapidas key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'armado' ? <Armado key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'tortas' ? <Tortas key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'insumos' ? <Insumos key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'domiciliario' ? <Domiciliario key={area.sede} sede={area.sede} perfil={perfil} />
        : esAdmin(area.rol) ? <Admin perfil={perfil} />
        : (
        <main className="contenido pila" style={{ maxWidth: 640 }}>
          <h1>{ROLES[area.rol]}</h1>
          <MiTurno sede={area.sede} rol={area.rol} perfil={perfil} />
          <div className="aviso">La pantalla completa de {ROLES[area.rol]} se arma en la siguiente fase.</div>
          <h2>Mis tareas</h2>
          <MisTareas sede={area.sede} rol={area.rol} perfil={perfil} />
        </main>
      )}
    </>
  );
}
