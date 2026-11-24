import { useState } from 'react';
import { sb } from '../../lib/supabase';
import { hora, mesa2, plata } from '../../lib/formato';
import { q, Titulo, useConsulta, type Sede, type SedeSel } from './comun';

const MEDIOS: Record<string, string> = { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

export function CajaAdmin({ sede, sedes }: { sede: SedeSel; sedes: Sede[] }) {
  const [dia, setDia] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? '';
  const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
  const hasta = new Date(new Date(`${dia}T00:00:00-05:00`).getTime() + 86400000).toISOString();
  const f = <T,>(x: T & { eq: (c: string, v: string) => T }) => (sede === 'todas' ? x : x.eq('sede_id', sede));

  const { datos } = useConsulta('caja-admin', async () => {
    const [turnos, pagos, gastos, cuentas, porCobrar] = await Promise.all([
      q<any[]>(f(sb.from('v_caja_turnos').select('*') as any).gte('abierto_en', desde).lt('abierto_en', hasta).order('abierto_en')),
      q<any[]>(f(sb.from('pagos').select('id, sede_id, monto, medio, creado_en, cuentas(tipo, mesas(numero)), perfiles(nombre)') as any).gte('creado_en', desde).lt('creado_en', hasta).order('creado_en', { ascending: false })),
      q<any[]>(f(sb.from('gastos_caja').select('id, sede_id, categoria, concepto, valor, medio, responsable, creado_en, perfiles(nombre)') as any).gte('creado_en', desde).lt('creado_en', hasta).order('creado_en', { ascending: false })),
      q<any[]>(f(sb.from('cuentas').select('id, total, estado') as any).gte('abierta_en', desde).lt('abierta_en', hasta).neq('estado', 'anulada')),
      q<any[]>(f(sb.from('v_por_cobrar').select('sede_id, mesa, saldo, total, abierta_en') as any)),
    ]);
    return { turnos, pagos, gastos, cuentas, porCobrar };
  }, [sede, dia], ['pagos', 'gastos_caja', 'turnos_caja', 'cuentas']);

  const ventas = (datos?.cuentas ?? []).reduce((t, c) => t + Number(c.total), 0);
  const recibido = (datos?.pagos ?? []).reduce((t, p) => t + Number(p.monto), 0);
  const pendiente = (datos?.porCobrar ?? []).reduce((t, p) => t + Number(p.saldo), 0);
  const gastado = (datos?.gastos ?? []).reduce((t, g) => t + Number(g.valor), 0);
  const porMedio = Object.entries((datos?.pagos ?? []).reduce<Record<string, number>>((a, p) => ({ ...a, [p.medio]: (a[p.medio] ?? 0) + Number(p.monto) }), {}));

  return (
    <div className="pila">
      <Titulo accion={<input type="date" className="entrada" value={dia} onChange={(e) => setDia(e.target.value)} />}>Caja</Titulo>
      <div className="cifras cuatro">
        <div><span>Ventas registradas</span><b>{plata(ventas)}</b></div>
        <div><span>Pagos recibidos</span><b>{plata(recibido)}</b></div>
        <div><span>Saldos pendientes</span><b className={pendiente ? 'txt-rojo' : ''}>{plata(pendiente)}</b></div>
        <div><span>Gastos</span><b>{plata(gastado)}</b></div>
      </div>
      {porMedio.length > 0 && <div className="fila envolver" style={{ gap: 6 }}>{porMedio.map(([m, v]) => <span key={m} className="estado estado-proceso">{MEDIOS[m]} · {plata(v)}</span>)}</div>}

      <div className="tarjeta">
        <h2 style={{ marginBottom: 6 }}>Turnos de caja</h2>
        {(datos?.turnos ?? []).length === 0 && <div className="texto-sec">No se registró base este día.</div>}
        {(datos?.turnos ?? []).map((t) => (
          <div key={t.id} className="linea">
            <div className="fila entre"><b>{sede === 'todas' ? nombreSede(t.sede_id) + ' · ' : ''}{hora(t.abierto_en)} – {t.cerrado_en ? hora(t.cerrado_en) : 'abierto'}</b>
              <span className="estado estado-media">Efectivo esperado {plata(t.efectivo_esperado)}</span></div>
            <div className="texto-sec" style={{ fontSize: 13 }}>Base {plata(t.base)} · cobrado {plata(t.cobrado)} · gastos {plata(t.gastos)}</div>
          </div>
        ))}
      </div>

      <div className="dos-columnas">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>Cuentas abiertas · {(datos?.porCobrar ?? []).length}</h2>
          {(datos?.porCobrar ?? []).map((c, i) => (
            <div key={i} className="fila entre linea"><span>Mesa {mesa2(c.mesa)}{sede === 'todas' ? ` · ${nombreSede(c.sede_id)}` : ''} <span className="texto-sec">desde {hora(c.abierta_en)}</span></span><b>{plata(c.saldo)}</b></div>
          ))}
          {(datos?.porCobrar ?? []).length === 0 && <div className="texto-sec">Ninguna.</div>}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 6 }}>Gastos</h2>
          {(datos?.gastos ?? []).map((g) => (
            <div key={g.id} className="fila entre linea"><span><b>{g.concepto}</b> <span className="texto-sec">· {g.categoria} · {MEDIOS[g.medio] ?? g.medio} · {g.perfiles?.nombre} · {hora(g.creado_en)}</span></span><span>{plata(g.valor)}</span></div>
          ))}
          {(datos?.gastos ?? []).length === 0 && <div className="texto-sec">Sin gastos.</div>}
        </div>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginBottom: 6 }}>Cobros · {(datos?.pagos ?? []).length}</h2>
        {(datos?.pagos ?? []).map((p) => (
          <div key={p.id} className="fila entre linea">
            <span>{p.cuentas?.mesas ? `Mesa ${mesa2(p.cuentas.mesas.numero)}` : p.cuentas?.tipo === 'llevar' ? 'Para llevar' : 'Mostrador'}
              <span className="texto-sec"> · {MEDIOS[p.medio]} · {p.perfiles?.nombre} · {hora(p.creado_en)}{sede === 'todas' ? ` · ${nombreSede(p.sede_id)}` : ''}</span></span>
            <b>{plata(p.monto)}</b>
          </div>
        ))}
        {(datos?.pagos ?? []).length === 0 && <div className="texto-sec">Sin cobros.</div>}
      </div>
    </div>
  );
}
