import { useEffect, useState } from 'react';
import { nuevaOperacion, rpc, sb } from '../lib/supabase';
import { cant, hora } from '../lib/formato';
import { Ventana } from '../componentes/Piezas';
import { MisTareas, type Tarea } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';
import { aBase, factor, FilasInsumos, TarjetaSaldo, unidadEscrita, useMovimientos, useSaldos, type Fila } from '../componentes/Inventario';

// ═════════ Producción de tortas ═════════
export function Tortas({ sede, perfil }: { sede: string; perfil: string }) {
  const [pestana, setPestana] = useState<'registrar' | 'tareas'>('registrar');
  const { de } = useSaldos(sede, ['tortas']);
  const otras = useTortasOtrasSedes(sede);
  const monjes = de('tortas', 'monje');
  const grandes = de('tortas', 'torta_grande');
  const pequenas = de('tortas', 'torta_pequena');

  return (
    <main className="contenido pila" style={{ maxWidth: 640 }}>
      <h1>Producción de tortas</h1>
      <div className="rejilla-saldos tres">
        {monjes && <TarjetaSaldo s={{ ...monjes, insumo: 'Monjes' }} />}
        {grandes && <TarjetaSaldo s={{ ...grandes, insumo: 'Tortas grandes' }} />}
        {pequenas && <TarjetaSaldo s={{ ...pequenas, insumo: 'Tortas pequeñas' }} />}
      </div>
      {otras.length > 0 && (
        <div className="tarjeta">
          <div className="texto-sec" style={{ fontWeight: 700, marginBottom: 6 }}>Bases en tus otras sedes</div>
          {otras.map((o) => (
            <div key={o.sede} className="fila entre linea"><b>{o.sede}</b><span>{cant(o.grandes, 'torta')} grandes · {cant(o.pequenas, 'torta')} pequeñas</span></div>
          ))}
        </div>
      )}
      <div className="fila" style={{ gap: 6 }}>
        <button className={'pastilla' + (pestana === 'registrar' ? ' activa' : '')} onClick={() => setPestana('registrar')}>Registrar</button>
        <button className={'pastilla' + (pestana === 'tareas' ? ' activa' : '')} onClick={() => setPestana('tareas')}>Mis tareas</button>
      </div>
      {pestana === 'registrar' ? <RegistrarTortas sede={sede} /> : <>
        <MiTurno sede={sede} rol="tortas" perfil={perfil} />
        <MisTareas sede={sede} rol="tortas" perfil={perfil} onAccion={() => setPestana('registrar')} />
      </>}
    </main>
  );
}

function useTortasOtrasSedes(sede: string) {
  const [otras, setOtras] = useState<{ sede: string; grandes: number; pequenas: number }[]>([]);
  useEffect(() => {
    Promise.all([
      sb.from('v_saldos').select('sede_id, insumo_codigo, disponible')
        .eq('ubicacion', 'tortas').in('insumo_codigo', ['torta_grande', 'torta_pequena']).neq('sede_id', sede),
      sb.from('sedes').select('id, nombre'),
    ]).then(([{ data }, { data: sedes }]) => {
        const m = new Map<string, { sede: string; grandes: number; pequenas: number }>();
        for (const x of (data ?? []) as any[]) {
          const k = x.sede_id; const v = m.get(k) ?? { sede: (sedes ?? []).find((y: any) => y.id === k)?.nombre ?? '', grandes: 0, pequenas: 0 };
          if (x.insumo_codigo === 'torta_grande') v.grandes = +x.disponible; else v.pequenas = +x.disponible;
          m.set(k, v);
        }
        setOtras([...m.values()]);
      });
  }, [sede]);
  return otras;
}

function RegistrarTortas({ sede }: { sede: string }) {
  const vacio = { recibidos: '', usados: '', grandes: '', pequenas: '' };
  const [f, setF] = useState(vacio);
  const [op, setOp] = useState(nuevaOperacion);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const n = (v: string) => Number(v.replace(',', '.') || 0);
  const hay = n(f.recibidos) || n(f.usados) || n(f.grandes) || n(f.pequenas);

  async function guardar() {
    setMsg({});
    try {
      await rpc('registrar_tortas', { p_op: op, p_sede: sede, p_monjes_recibidos: n(f.recibidos), p_monjes_usados: n(f.usados),
        p_grandes: n(f.grandes), p_pequenas: n(f.pequenas) });
      setMsg({ ok: `✓ Registrado: ${n(f.grandes)} grandes y ${n(f.pequenas)} pequeñas` }); setF(vacio); setOp(nuevaOperacion());
    } catch (e) { setMsg({ error: (e as Error).message }); setOp(nuevaOperacion()); }
  }
  const campo = (k: keyof typeof f, label: string) => (
    <div className="campo" style={{ flex: 1, minWidth: 130 }}>
      <label>{label}</label>
      <input inputMode="decimal" placeholder="0" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.,]/g, '') })} />
    </div>
  );
  return (
    <div className="tarjeta pila">
      <h2>Monjes y tortas</h2>
      <div className="fila envolver" style={{ gap: 10 }}>{campo('recibidos', 'Monjes recibidos')}{campo('usados', 'Monjes usados')}</div>
      <div className="fila envolver" style={{ gap: 10 }}>{campo('grandes', 'Tortas grandes hechas')}{campo('pequenas', 'Tortas pequeñas hechas')}</div>
      {msg.error && <div className="error">{msg.error}</div>}
      {msg.ok && <div className="ok">{msg.ok}</div>}
      <button className="btn btn-principal btn-ancho btn-grande" disabled={!hay} onClick={guardar}>Registrar producción</button>
    </div>
  );
}

// ═════════ Producción de insumos ═════════
export function Insumos({ sede, perfil }: { sede: string; perfil: string }) {
  const [pestana, setPestana] = useState<'tareas' | 'stock' | 'registrar'>('tareas');
  const [registro, setRegistro] = useState<null | { codigo?: string; tarea?: string }>(null);
  const { saldos } = useSaldos(sede, ['produccion']);
  const retiros = useMovimientos(sede, 'produccion', ['traslado_salida']);

  function desdeTarea(accion: string, t: Tarea) {
    if (accion.startsWith('produccion:')) setRegistro({ codigo: accion.split(':')[1], tarea: t.id });
  }

  const bajos = saldos.filter((s) => s.bajo);
  return (
    <main className="contenido pila" style={{ maxWidth: 640 }}>
      <h1>Producción de insumos</h1>
      <div className="fila envolver" style={{ gap: 6 }}>
        {([['tareas', 'Mis tareas'], ['stock', 'Stock'], ['registrar', 'Registrar producción']] as const).map(([k, t]) => (
          <button key={k} className={'pastilla' + (pestana === k ? ' activa' : '')}
            onClick={() => (k === 'registrar' ? setRegistro({}) : setPestana(k))}>{t}{k === 'stock' && bajos.length ? ` · ${bajos.length} bajos` : ''}</button>
        ))}
      </div>

      {pestana === 'tareas' && <>
        <MiTurno sede={sede} rol="insumos" perfil={perfil} />
        <MisTareas sede={sede} rol="insumos" perfil={perfil} onAccion={desdeTarea} />
      </>}

      {pestana === 'stock' && <>
        <div className="rejilla-saldos">
          {[...saldos].sort((a, b) => Number(b.bajo) - Number(a.bajo)).map((s) => (
            <TarjetaSaldo key={s.insumo_id} s={s} extra={
              <button className="btn btn-suave" style={{ padding: '8px 10px', fontSize: 14 }} onClick={() => setRegistro({ codigo: s.insumo_codigo })}>Registrar</button>} />
          ))}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>Retiros de otras áreas</h2>
          {retiros.length === 0 && <div className="texto-sec">Todavía no hay retiros.</div>}
          {retiros.map((m) => (
            <div key={m.id} className="fila entre linea">
              <span><b>{cant(-m.cantidad, m.insumos?.unidad)}</b> {m.insumos?.nombre}
                <span className="texto-sec"> · {m.motivo === 'A nevera_rapidas' ? 'Comidas rápidas' : m.motivo === 'A armado' ? 'Armado' : m.motivo} · {m.perfiles?.nombre}</span></span>
              <span className="texto-sec">{hora(m.creado_en)}</span>
            </div>
          ))}
        </div>
      </>}

      {registro && <RegistrarProduccion sede={sede} codigo={registro.codigo} tarea={registro.tarea} onCerrar={() => setRegistro(null)} />}
    </main>
  );
}

function RegistrarProduccion({ sede, codigo, tarea, onCerrar }: { sede: string; codigo?: string; tarea?: string; onCerrar: () => void }) {
  const { saldos } = useSaldos(sede, ['produccion']);
  const [insumo, setInsumo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [usados, setUsados] = useState<Fila[]>([]);
  const [op, setOp] = useState(nuevaOperacion);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!insumo && codigo) { const s = saldos.find((x) => x.insumo_codigo === codigo); if (s) setInsumo(s.insumo_id); }
  }, [saldos, codigo]);
  const s = saldos.find((x) => x.insumo_id === insumo);
  const opciones = saldos.filter((x) => x.insumo_id !== insumo).map((x) => ({ insumo_id: x.insumo_id, insumo: x.insumo, unidad: x.unidad, disponible: x.disponible }));
  const total = Number(cantidad.replace(',', '.') || 0) * factor(s?.unidad ?? '');

  async function guardar() {
    setError('');
    try {
      await rpc('registrar_produccion', { p_op: op, p_sede: sede, p_insumo: insumo, p_cantidad: total,
        p_usados: usados.filter((u) => u.insumo_id && Number(u.cantidad)).map((u) => aBase(u, opciones)), p_tarea: tarea ?? null });
      onCerrar();
    } catch (e) { setError((e as Error).message); setOp(nuevaOperacion()); }
  }

  return (
    <Ventana titulo="Registrar producción" onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo">
          <label>¿Qué preparaste?</label>
          <select value={insumo} onChange={(e) => setInsumo(e.target.value)}>
            <option value="">Elige…</option>
            {saldos.map((x) => <option key={x.insumo_id} value={x.insumo_id}>{x.insumo} · hay {cant(x.disponible, x.unidad)}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Cantidad real producida {s ? `(${unidadEscrita(s.unidad)})` : ''}</label>
          <input inputMode="decimal" placeholder={s?.unidad === 'ml' ? 'Ej: 1' : 'Ej: 20'} value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,]/g, ''))} />
        </div>
        <details>
          <summary className="enlace" style={{ cursor: 'pointer' }}>Insumos usados (opcional)</summary>
          <div style={{ marginTop: 10 }}>
            <FilasInsumos opciones={opciones} filas={usados.length ? usados : [{ insumo_id: '', cantidad: '' }]} onCambio={setUsados} textoDisponible="hay" />
          </div>
        </details>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho btn-grande" disabled={!insumo || !total} onClick={guardar}>
          {s && total ? `Registrar ${cant(total, s.unidad)} de ${s.insumo.toLowerCase()}` : 'Registrar producción'}
        </button>
      </div>
    </Ventana>
  );
}

