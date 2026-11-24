import { useEffect, useState } from 'react';
import { nuevaOperacion, rpc } from '../lib/supabase';
import { cant } from '../lib/formato';
import { MisTareas, type Tarea } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';
import { TarjetaSaldo, useSaldos } from '../componentes/Inventario';
import { Traslado } from './Rapidas';

type Pestana = 'ruedas' | 'personales' | 'retirar' | 'tareas';
const sabor = (nombre: string) => nombre.replace(/^(Porciones|Personales) /, '');

export function Armado({ sede, perfil }: { sede: string; perfil: string }) {
  const [pestana, setPestana] = useState<Pestana>('ruedas');
  const [inicial, setInicial] = useState<{ codigo?: string; tarea?: string }>({});
  const [retirar, setRetirar] = useState<null | { codigo?: string }>(null);
  const { saldos, de } = useSaldos(sede, ['armado', 'tortas']);
  const porciones = saldos.filter((s) => s.ubicacion === 'armado' && s.insumo_codigo.startsWith('porc_'));
  const personales = saldos.filter((s) => s.ubicacion === 'armado' && s.insumo_codigo.startsWith('pers_'));
  const ingredientes = saldos.filter((s) => s.ubicacion === 'armado' && !/^(porc|pers)_/.test(s.insumo_codigo));
  const grandes = de('tortas', 'torta_grande');
  const pequenas = de('tortas', 'torta_pequena');

  function desdeTarea(accion: string, t: Tarea) {
    if (accion.startsWith('rueda:')) { setInicial({ codigo: accion.split(':')[1], tarea: t.id }); setPestana('ruedas'); }
    if (accion.startsWith('retirar:')) setRetirar({ codigo: accion.split(':')[1] });
  }

  return (
    <main className="contenido pila" style={{ maxWidth: 640 }}>
      <h1>Armado de ruedas</h1>
      <div className="fila envolver" style={{ gap: 6 }}>
        {([['ruedas', 'Ruedas'], ['personales', 'Pizzas personales'], ['retirar', 'Retirar insumo'], ['tareas', 'Mis tareas']] as const).map(([k, t]) => (
          <button key={k} className={'pastilla' + (pestana === k ? ' activa' : '')} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>

      {pestana === 'ruedas' && <>
        <RegistrarArmado key={inicial.codigo + (inicial.tarea ?? '')} sede={sede} tipo="rueda" sabores={porciones}
          tortas={grandes?.disponible ?? 0} codigoInicial={inicial.codigo} tarea={inicial.tarea} onListo={() => setInicial({})} />
        <h2>Porciones disponibles</h2>
        <div className="rejilla-saldos">{porciones.map((s) => <TarjetaSaldo key={s.insumo_id} s={{ ...s, insumo: sabor(s.insumo) }} />)}</div>
      </>}

      {pestana === 'personales' && <>
        <RegistrarArmado sede={sede} tipo="personales" sabores={personales} tortas={pequenas?.disponible ?? 0} />
        <h2>Personales disponibles</h2>
        <div className="rejilla-saldos">{personales.map((s) => <TarjetaSaldo key={s.insumo_id} s={{ ...s, insumo: sabor(s.insumo) }} />)}</div>
      </>}

      {pestana === 'retirar' && <>
        <button className="btn btn-principal btn-ancho btn-grande" onClick={() => setRetirar({})}>⬇ Retirar insumo de Producción</button>
        <h2>Ingredientes en Armado</h2>
        <div className="rejilla-saldos">{ingredientes.map((s) => <TarjetaSaldo key={s.insumo_id} s={s} />)}</div>
      </>}

      {pestana === 'tareas' && <>
        <MiTurno sede={sede} rol="armado" perfil={perfil} />
        <MisTareas sede={sede} rol="armado" perfil={perfil} onAccion={desdeTarea} />
      </>}

      {retirar && (
        <Traslado sede={sede} origen="produccion" destino="armado" titulo="Retirar insumo" boton="Retirar a Armado"
          codigoInicial={retirar.codigo} soloCodigos={ingredientes.map((s) => s.insumo_codigo)} onCerrar={() => setRetirar(null)} />
      )}
    </main>
  );
}

function RegistrarArmado({ sede, tipo, sabores, tortas, codigoInicial, tarea, onListo }: {
  sede: string; tipo: 'rueda' | 'personales'; sabores: { insumo_id: string; insumo_codigo: string; insumo: string; disponible: number }[];
  tortas: number; codigoInicial?: string; tarea?: string; onListo?: () => void;
}) {
  const [elegido, setElegido] = useState('');
  const [porciones, setPorciones] = useState<4 | 8>(8);
  const [cantidad, setCantidad] = useState('1');
  const [usadas, setUsadas] = useState('1');
  const [op, setOp] = useState(nuevaOperacion);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!elegido && codigoInicial) { const s = sabores.find((x) => x.insumo_codigo === codigoInicial); if (s) setElegido(s.insumo_id); }
  }, [sabores, codigoInicial]);
  // Bases sugeridas: ½ rueda = ½ torta, 1 rueda = 1 torta; personales = 1 torta pequeña cada una (se puede corregir)
  useEffect(() => { if (tipo === 'rueda') setUsadas(porciones === 4 ? '0.5' : '1'); }, [porciones, tipo]);
  useEffect(() => { if (tipo === 'personales') setUsadas(cantidad); }, [cantidad, tipo]);

  const s = sabores.find((x) => x.insumo_id === elegido);
  const n = tipo === 'rueda' ? porciones : Number(cantidad || 0);
  const bases = Number(usadas.replace(',', '.') || 0);

  async function guardar() {
    setMsg({}); setEnviando(true);
    try {
      await rpc('registrar_armado', { p_op: op, p_sede: sede, p_tipo: tipo, p_resultado: elegido, p_cantidad: n, p_tortas: bases });
      if (tarea) await rpc('tarea_completar', { p_tarea: tarea }).catch(() => undefined);
      setMsg({ ok: `✓ ${n} ${tipo === 'rueda' ? 'porciones' : 'personales'} de ${sabor(s!.insumo)} registradas` });
      setOp(nuevaOperacion()); onListo?.();
    } catch (e) { setMsg({ error: (e as Error).message }); setOp(nuevaOperacion()); }
    setEnviando(false);
  }

  const pasos = (d: number) => setUsadas(String(Math.max(0, bases + d)));

  return (
    <div className="tarjeta pila">
      <h2>{tipo === 'rueda' ? 'Registrar rueda' : 'Registrar personales'}</h2>
      <div className="fila envolver" style={{ gap: 6 }}>
        {sabores.map((x) => (
          <button key={x.insumo_id} className={'pastilla' + (elegido === x.insumo_id ? ' activa' : '')} onClick={() => setElegido(x.insumo_id)}>
            {sabor(x.insumo)} · {x.disponible}
          </button>
        ))}
      </div>
      {tipo === 'rueda' ? (
        <div className="fila" style={{ gap: 8 }}>
          <button className={'opcion' + (porciones === 4 ? ' activa' : '')} onClick={() => setPorciones(4)}><b>½ rueda</b><span>4 porciones</span></button>
          <button className={'opcion' + (porciones === 8 ? ' activa' : '')} onClick={() => setPorciones(8)}><b>1 rueda</b><span>8 porciones</span></button>
        </div>
      ) : (
        <div className="campo"><label>¿Cuántas personales armaste?</label>
          <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} /></div>
      )}
      <div className="campo">
        <label>{tipo === 'rueda' ? 'Tortas grandes usadas de verdad' : 'Tortas pequeñas usadas'} · hay {cant(tortas, 'torta')}</label>
        <div className="contador" style={{ alignSelf: 'start' }}>
          <button onClick={() => pasos(tipo === 'rueda' ? -0.5 : -1)} aria-label="Menos">−</button>
          <input style={{ width: 60 }} inputMode="decimal" value={usadas} onChange={(e) => setUsadas(e.target.value.replace(/[^\d.,]/g, ''))} />
          <button onClick={() => pasos(tipo === 'rueda' ? 0.5 : 1)} aria-label="Más">+</button>
        </div>
      </div>
      {msg.error && <div className="error">{msg.error}</div>}
      {msg.ok && <div className="ok">{msg.ok}</div>}
      <button className="btn btn-principal btn-ancho btn-grande" disabled={!elegido || !n || enviando} onClick={guardar}>
        {enviando ? 'Guardando…' : s ? `Registrar ${n} ${tipo === 'rueda' ? 'porciones' : 'personales'} de ${sabor(s.insumo)}` : 'Elige el sabor'}
      </button>
    </div>
  );
}
