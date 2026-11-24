import { useEffect, useRef, useState } from 'react';
import { nuevaOperacion, rpc } from '../lib/supabase';
import { cant } from '../lib/formato';
import { pitar, useComandas } from '../lib/datos';
import { TarjetaComanda, Ventana } from '../componentes/Piezas';
import { MisTareas } from '../componentes/MisTareas';
import { MiTurno } from '../componentes/MiTurno';
import { aBase, FilasInsumos, useSaldos, type Fila } from '../componentes/Inventario';

/** Comidas rápidas: tablet de comandas (fija) y vista personal (nevera, turno y tareas). */
export function Rapidas({ sede, perfil }: { sede: string; perfil: string }) {
  const [vista, setVista] = useState<'comandas' | 'personal'>(() => (localStorage.getItem('mp.rapidas.vista') as any) ?? 'comandas');
  const cambiar = (v: 'comandas' | 'personal') => { setVista(v); localStorage.setItem('mp.rapidas.vista', v); };

  return (
    <main className="contenido pila" style={{ maxWidth: vista === 'comandas' ? 1280 : 640 }}>
      <div className="fila entre envolver">
        <h1>{vista === 'comandas' ? 'Comandas · Comidas rápidas' : 'Nevera y tareas'}</h1>
        <div className="fila" style={{ gap: 6 }}>
          <button className={'pastilla' + (vista === 'comandas' ? ' activa' : '')} onClick={() => cambiar('comandas')}>Tablet de comandas</button>
          <button className={'pastilla' + (vista === 'personal' ? ' activa' : '')} onClick={() => cambiar('personal')}>Nevera y tareas</button>
        </div>
      </div>
      {vista === 'comandas' ? <Comandas sede={sede} /> : <Personal sede={sede} perfil={perfil} />}
    </main>
  );
}

function Comandas({ sede }: { sede: string }) {
  const { comandas } = useComandas(sede, { estacion: 'rapidas', estados: ['nueva', 'en_preparacion'] });
  const [error, setError] = useState('');
  const vistas = useRef<Set<string> | null>(null);

  // Aviso breve cuando llega una comanda nueva
  useEffect(() => {
    const ids = new Set(comandas.map((c) => c.id));
    if (vistas.current && [...ids].some((id) => !vistas.current!.has(id))) pitar();
    vistas.current = ids;
  }, [comandas]);

  async function cambiar(id: string, estado: string) {
    setError('');
    try { await rpc('comanda_estado', { p_comanda: id, p_estado: estado }); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {comandas.length === 0 && <div className="tarjeta texto-sec" style={{ textAlign: 'center', padding: 40, fontSize: 18 }}>Sin comandas pendientes 👌</div>}
      <div className="rejilla-comandas grande">
        {comandas.map((c) => <TarjetaComanda key={c.id} c={c} grande onEstado={cambiar} />)}
      </div>
    </>
  );
}

function Personal({ sede, perfil }: { sede: string; perfil: string }) {
  const [pestana, setPestana] = useState<'nevera' | 'tareas'>('nevera');
  const [subir, setSubir] = useState<null | { codigo?: string }>(null);
  const { saldos, de } = useSaldos(sede, ['nevera_rapidas', 'produccion']);
  const nevera = saldos.filter((s) => s.ubicacion === 'nevera_rapidas');

  return (
    <>
      <MiTurno sede={sede} rol="rapidas" perfil={perfil} />
      <div className="fila" style={{ gap: 6 }}>
        <button className={'pastilla' + (pestana === 'nevera' ? ' activa' : '')} onClick={() => setPestana('nevera')}>Mi nevera</button>
        <button className={'pastilla' + (pestana === 'tareas' ? ' activa' : '')} onClick={() => setPestana('tareas')}>Mis tareas</button>
      </div>

      {pestana === 'nevera' ? (
        <>
          <button className="btn btn-principal btn-ancho btn-grande" onClick={() => setSubir({})}>⬆ Subir a nevera</button>
          <div className="rejilla-saldos">
            {nevera.map((s) => {
              const prod = de('produccion', s.insumo_codigo);
              return (
                <div key={s.insumo_id} className={'tarjeta saldo' + (s.bajo ? ' bajo' : '')}>
                  <div className="fila entre" style={{ alignItems: 'flex-start' }}>
                    <b>{s.insumo}</b>
                    {s.bajo && <span className="estado estado-alta">Stock bajo</span>}
                  </div>
                  <div className="saldo-num">{cant(s.disponible, s.unidad)}</div>
                  <div className="texto-sec" style={{ fontSize: 13 }}>en mi nevera</div>
                  {prod && <div style={{ fontSize: 13, fontWeight: 700 }}>{cant(prod.disponible, prod.unidad)} disponibles en Producción</div>}
                  {s.bajo && <button className="btn btn-suave" style={{ padding: '8px 10px', fontSize: 14 }} onClick={() => setSubir({ codigo: s.insumo_codigo })}>Subir {s.insumo.toLowerCase()}</button>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <MisTareas sede={sede} rol="rapidas" perfil={perfil}
          onAccion={(a) => a.startsWith('subir_nevera:') && setSubir({ codigo: a.split(':')[1] })} />
      )}

      {subir && (
        <Traslado sede={sede} origen="produccion" destino="nevera_rapidas" titulo="Subir a nevera" boton="Subir a nevera"
          codigoInicial={subir.codigo} soloCodigos={nevera.map((s) => s.insumo_codigo)} onCerrar={() => setSubir(null)} />
      )}
    </>
  );
}

/** Mover insumos de una ubicación a otra en un solo registro (resta en origen y suma en destino a la vez). */
export function Traslado({ sede, origen, destino, titulo, boton, codigoInicial, soloCodigos, onCerrar }: {
  sede: string; origen: string; destino: string; titulo: string; boton: string;
  codigoInicial?: string; soloCodigos?: string[]; onCerrar: () => void;
}) {
  const { saldos } = useSaldos(sede, [origen]);
  const opciones = saldos.filter((s) => !soloCodigos || soloCodigos.includes(s.insumo_codigo))
    .map((s) => ({ insumo_id: s.insumo_id, insumo: s.insumo, unidad: s.unidad, disponible: s.disponible }));
  const [filas, setFilas] = useState<Fila[]>([{ insumo_id: '', cantidad: '' }]);
  const [op, setOp] = useState(nuevaOperacion);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Si viene de una tarea, el insumo queda elegido
  useEffect(() => {
    if (!codigoInicial || filas[0].insumo_id) return;
    const s = saldos.find((x) => x.insumo_codigo === codigoInicial);
    if (s) setFilas([{ insumo_id: s.insumo_id, cantidad: '' }]);
  }, [saldos, codigoInicial]);

  const items = filas.filter((f) => f.insumo_id && Number(f.cantidad.replace(',', '.')) > 0).map((f) => aBase(f, opciones));

  async function guardar() {
    setError(''); setEnviando(true);
    try {
      await rpc('trasladar', { p_op: op, p_sede: sede, p_origen: origen, p_destino: destino, p_items: items });
      onCerrar();
    } catch (e) { setError((e as Error).message); setOp(nuevaOperacion()); setEnviando(false); }
  }

  return (
    <Ventana titulo={titulo} onCerrar={onCerrar}>
      <div className="pila">
        <div className="texto-sec">Sale de {origen === 'produccion' ? 'Producción' : origen} y entra {destino === 'nevera_rapidas' ? 'a tu nevera' : 'a Armado'} en un solo paso.</div>
        <FilasInsumos opciones={opciones} filas={filas} onCambio={setFilas} textoDisponible="en Producción" />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho" disabled={!items.length || enviando} onClick={guardar}>
          {enviando ? 'Guardando…' : `${boton}${items.length > 1 ? ` · ${items.length} insumos` : ''}`}
        </button>
      </div>
    </Ventana>
  );
}
