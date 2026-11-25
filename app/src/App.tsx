import { Domiciliario } from './pantallas/Domiciliario';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurado, sb } from './lib/supabase';
import { ROLES } from './lib/formato';
import { Logo } from './componentes/Logo';
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
      const lista = (a ?? []) as unknown as Acceso[];
      setAccesos(lista);
      setNombre(p?.nombre ?? '');
      // Si solo tiene un área, entra directo; si el área guardada ya no aplica, se borra
      const vale = (x: Area | null) => x && lista.some((l) => l.sede_id === x.sede && l.rol === x.rol);
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

  async function salir() {
    localStorage.removeItem(CLAVE_AREA);
    await sb.auth.signOut();
  }

  if (!accesos) return null;

  return (
    <>
      <header className="barra">
        <Logo alto={58} />
        <div className="barra-der">
          {area && accesos.length > 1 && (
            <button className="chip-sede" onClick={() => elegir(null)}>{area.sedeNombre} · {ROLES[area.rol]} ▾</button>
          )}
          <button className="chip-sede" onClick={salir}>Salir</button>
        </div>
      </header>

      {!area ? (
        <main className="contenido pila" style={{ maxWidth: 520 }}>
          <h1>Hola{nombre ? `, ${nombre}` : ''}</h1>
          <div className="texto-sec">¿Dónde trabajas hoy?</div>
          {accesos.length === 0 && <div className="aviso">Todavía no tienes sedes asignadas. Pídele acceso a Administración.</div>}
          {accesos.map((a) => (
            <button key={a.sede_id + a.rol} className="tarjeta btn" style={{ justifyContent: 'space-between' }}
              onClick={() => elegir({ sede: a.sede_id, sedeNombre: a.sedes?.nombre ?? '', rol: a.rol })}>
              <span className="titulo" style={{ fontSize: 18 }}>{ROLES[a.rol]}</span>
              <span className="texto-sec">{a.sedes?.nombre}</span>
            </button>
          ))}
        </main>
      ) : area.rol === 'caja' ? <Caja key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'mesero' ? <Mesero key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'rapidas' ? <Rapidas key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'armado' ? <Armado key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'tortas' ? <Tortas key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'insumos' ? <Insumos key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'domiciliario' ? <Domiciliario key={area.sede} sede={area.sede} perfil={perfil} />
        : area.rol === 'admin' ? <Admin perfil={perfil} />
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
