// Administración · pedidos online y domicilios del día: quién lo llevó, cuánto se demoró, tarifa y notas.
import { useState } from 'react';
import { rpc, sb } from '../../lib/supabase';
import { hora, plata } from '../../lib/formato';
import { Ventana } from '../../componentes/Piezas';
import { ESTADOS } from '../../componentes/PedidosOnline';
import { q, Titulo, useConsulta, type Sede, type SedeSel } from './comun';

const minutos = (a?: string | null, b?: string | null) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);

export function Domicilios({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [dia, setDia] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));
  const [editar, setEditar] = useState<any | null>(null);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';
  const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
  const hasta = new Date(new Date(`${dia}T00:00:00-05:00`).getTime() + 86400000).toISOString();

  const { datos } = useConsulta('domicilios-admin', () => {
    let c = sb.from('pedidos_online').select('*, cuentas(pagado), pedidos(numero), zonas_domicilio(nombre)')
      .gte('creado_en', desde).lt('creado_en', hasta).order('creado_en', { ascending: false });
    if (sede !== 'todas') c = c.eq('sede_id', sede);
    return q<any[]>(c);
  }, [sede, dia], ['pedidos_online', 'cuentas']);

  const lista = datos ?? [];
  const validos = lista.filter((p) => p.estado !== 'cancelado');
  const ventas = validos.reduce((t, p) => t + Number(p.total), 0);
  const tarifas = validos.reduce((t, p) => t + Number(p.domicilio), 0);
  const tiempos = validos.map((p) => minutos(p.creado_en, p.entregado_en)).filter((m): m is number => m != null);
  const promedio = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null;
  const porDomiciliario = Object.entries(validos.filter((p) => p.domiciliario).reduce<Record<string, number>>(
    (a, p) => ({ ...a, [p.domiciliario]: (a[p.domiciliario] ?? 0) + 1 }), {}));

  return (
    <div className="pila">
      <Titulo accion={<input type="date" className="entrada" value={dia} onChange={(e) => setDia(e.target.value)} />}>Domicilios y pedidos online</Titulo>
      <div className="cifras cuatro">
        <div><span>Pedidos online</span><b>{validos.length}</b></div>
        <div><span>Vendido online</span><b>{plata(ventas)}</b></div>
        <div><span>Cobrado en domicilios</span><b>{plata(tarifas)}</b></div>
        <div><span>Tiempo promedio de entrega</span><b>{promedio != null ? `${promedio} min` : '—'}</b></div>
      </div>
      {porDomiciliario.length > 0 && <div className="fila envolver" style={{ gap: 6 }}>
        {porDomiciliario.map(([d, n]) => <span key={d} className="estado estado-proceso">🛵 {d} · {n}</span>)}
      </div>}

      <div className="tarjeta">
        {lista.length === 0 && <div className="texto-sec">No hubo pedidos online este día.</div>}
        {lista.map((p) => {
          const [txt, cls] = ESTADOS[p.estado] ?? [p.estado, 'estado-proceso'];
          const pagado = Number(p.cuentas?.pagado ?? 0) >= Number(p.total);
          const m = minutos(p.creado_en, p.entregado_en);
          return (
            <div key={p.id} className="linea">
              <div className="fila entre envolver">
                <b>#{p.pedidos?.numero} · {p.codigo} · {p.nombre}{sede === 'todas' ? ` · ${nombreSede(p.sede_id)}` : ''}</b>
                <span className="fila" style={{ gap: 6 }}>
                  <span className={'estado ' + cls}>{txt}</span>
                  {p.estado !== 'cancelado' && <span className={'estado ' + (pagado ? 'estado-baja' : 'estado-alta')}>{pagado ? '✓ Pagado' : 'Sin pagar'}</span>}
                </span>
              </div>
              <div className="texto-sec" style={{ fontSize: 13 }}>
                {p.entrega === 'domicilio' ? `🛵 ${p.direccion} · ${p.barrio}${p.zonas_domicilio?.nombre ? ` · ${p.zonas_domicilio.nombre}` : ''}` : '🏪 Recoge en el local'}
                {' · '}{p.celular}
              </div>
              <div className="fila entre envolver" style={{ fontSize: 13 }}>
                <span>Llegó {hora(p.creado_en)}{p.salio_en ? ` · salió ${hora(p.salio_en)}` : ''}{p.entregado_en ? ` · entregado ${hora(p.entregado_en)}` : ''}
                  {m != null && <b> · {m} min</b>}{p.domiciliario ? ` · lo llevó ${p.domiciliario}` : ''}</span>
                <span>Domicilio {plata(p.domicilio)} · <b>Total {plata(p.total)}</b>
                  {' '}<button className="enlace" onClick={() => setEditar(p)}>Editar</button></span>
              </div>
              {p.notas_internas && <div className="txt-rojo" style={{ fontSize: 13 }}>📝 {p.notas_internas}</div>}
            </div>
          );
        })}
      </div>
      {editar && <Editar p={editar} onCerrar={() => setEditar(null)} />}
    </div>
  );
}

function Editar({ p, onCerrar }: { p: any; onCerrar: () => void }) {
  const [domiciliario, setDomiciliario] = useState(p.domiciliario ?? '');
  const [notas, setNotas] = useState(p.notas_internas ?? '');
  const [tarifa, setTarifa] = useState(String(Number(p.domicilio)));
  const [error, setError] = useState('');
  const bloqueada = Number(p.cuentas?.pagado ?? 0) > 0 || p.estado === 'cancelado';
  async function guardar() {
    setError('');
    try {
      await rpc('online_ajustar', { p_id: p.id, p_domiciliario: domiciliario, p_notas: notas, p_domicilio: bloqueada ? null : Number(tarifa || 0) });
      onCerrar();
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <Ventana titulo={`Pedido ${p.codigo}`} onCerrar={onCerrar}>
      <div className="pila">
        <div className="campo"><label>Domiciliario</label><input value={domiciliario} onChange={(e) => setDomiciliario(e.target.value)} /></div>
        <div className="campo"><label>Tarifa de domicilio{bloqueada ? ' (ya pagado: no se cambia)' : ''}</label>
          <input inputMode="numeric" disabled={bloqueada} value={tarifa} onChange={(e) => setTarifa(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="campo"><label>Notas internas</label><input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-principal btn-ancho" onClick={guardar}>Guardar cambios</button>
      </div>
    </Ventana>
  );
}
