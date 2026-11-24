import { useCallback, useEffect, useState } from 'react';
import { sb } from '../lib/supabase';
import { cant } from '../lib/formato';
import { useEnVivo } from '../lib/datos';

export type Saldo = {
  ubicacion: string; insumo_id: string; insumo_codigo: string; insumo: string; unidad: string; categoria: string;
  fisico: number; reservado: number; disponible: number; minimo: number | null; bajo: boolean;
};

/** Saldos de una sede por ubicación, con el mínimo de la regla y si está bajo. En vivo. */
export function useSaldos(sede: string, ubicaciones: string[]) {
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const clave = ubicaciones.join(',');
  const cargar = useCallback(async () => {
    const [{ data: s }, { data: r }] = await Promise.all([
      sb.from('v_saldos').select('ubicacion, insumo_id, insumo_codigo, insumo, unidad, categoria, fisico, reservado, disponible')
        .eq('sede_id', sede).in('ubicacion', ubicaciones).order('insumo'),
      sb.from('reglas_stock').select('insumo_id, minimo, activa, ubicaciones_stock!inner(codigo)').eq('sede_id', sede).eq('activa', true)
        .in('ubicaciones_stock.codigo', ubicaciones),
    ]);
    setSaldos((s ?? []).map((x: any) => {
      const regla = (r ?? []).find((y: any) => y.insumo_id === x.insumo_id && y.ubicaciones_stock.codigo === x.ubicacion);
      const minimo = regla ? Number(regla.minimo) : null;
      return { ...x, fisico: +x.fisico, reservado: +x.reservado, disponible: +x.disponible, minimo,
        bajo: minimo != null && +x.disponible <= minimo };
    }));
  }, [sede, clave]);
  useEnVivo(`saldos-${sede}-${clave}`, [
    { tabla: 'saldos_stock', filtro: `sede_id=eq.${sede}` }, { tabla: 'reglas_stock', filtro: `sede_id=eq.${sede}` },
  ], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  const de = (ubicacion: string, codigo: string) => saldos.find((x) => x.ubicacion === ubicacion && x.insumo_codigo === codigo);
  return { saldos, de, recargar: cargar };
}

/** Tarjeta de un saldo con su número grande y aviso de bajo */
export function TarjetaSaldo({ s, extra }: { s: Saldo; extra?: React.ReactNode }) {
  return (
    <div className={'tarjeta saldo' + (s.bajo ? ' bajo' : '')}>
      <div className="fila entre" style={{ alignItems: 'flex-start' }}>
        <b>{s.insumo}</b>
        {s.bajo && <span className="estado estado-alta">Stock bajo</span>}
      </div>
      <div className="saldo-num">{cant(s.disponible, s.unidad)}</div>
      {s.minimo != null && <div className="texto-sec" style={{ fontSize: 12.5 }}>Mínimo {cant(s.minimo, s.unidad)}</div>}
      {extra}
    </div>
  );
}

// ───────── Varias filas insumo + cantidad (Subir a nevera, Retirar insumo, insumos usados) ─────────
export type Fila = { insumo_id: string; cantidad: string };
export type Opcion = { insumo_id: string; insumo: string; unidad: string; disponible?: number };

/** Los líquidos se escriben en litros y los pesos en kilos; se guardan en ml y g. */
export const factor = (unidad: string) => (unidad === 'ml' || unidad === 'g' ? 1000 : 1);
export const unidadEscrita = (unidad: string) => (unidad === 'ml' ? 'L' : unidad === 'g' ? 'kg' : unidad === 'porcion' ? 'porciones' : unidad === 'torta' ? 'tortas' : 'und');
export const aBase = (f: Fila, opciones: Opcion[]) => {
  const o = opciones.find((x) => x.insumo_id === f.insumo_id);
  return { insumo_id: f.insumo_id, cantidad: Number(f.cantidad.replace(',', '.')) * factor(o?.unidad ?? '') };
};

export function FilasInsumos({ opciones, filas, onCambio, textoDisponible = 'disponibles' }: {
  opciones: Opcion[]; filas: Fila[]; onCambio: (f: Fila[]) => void; textoDisponible?: string;
}) {
  const cambiar = (i: number, c: Partial<Fila>) => { const n = [...filas]; n[i] = { ...n[i], ...c }; onCambio(n); };
  return (
    <div className="pila" style={{ gap: 10 }}>
      {filas.map((f, i) => {
        const o = opciones.find((x) => x.insumo_id === f.insumo_id);
        const pedido = Number(f.cantidad.replace(',', '.') || 0) * factor(o?.unidad ?? '');
        const pasa = o?.disponible != null && pedido > o.disponible;
        return (
          <div key={i} className="fila-insumo">
            <select value={f.insumo_id} onChange={(e) => cambiar(i, { insumo_id: e.target.value })} aria-label="Insumo">
              <option value="">Elige el insumo…</option>
              {opciones.map((x) => (
                <option key={x.insumo_id} value={x.insumo_id}>
                  {x.insumo}{x.disponible != null ? ` · ${cant(x.disponible, x.unidad)} ${textoDisponible}` : ''}
                </option>
              ))}
            </select>
            <div className="fila" style={{ gap: 6 }}>
              <input inputMode="decimal" placeholder="0" value={f.cantidad} aria-label="Cantidad"
                onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/[^\d.,]/g, '') })} />
              <span className="texto-sec" style={{ minWidth: 70 }}>{o ? unidadEscrita(o.unidad) : ''}</span>
              {filas.length > 1 && <button className="enlace" aria-label="Quitar" onClick={() => onCambio(filas.filter((_, j) => j !== i))}>✕</button>}
            </div>
            {pasa && <div className="txt-rojo" style={{ fontSize: 13 }}>Solo hay {cant(o!.disponible!, o!.unidad)}</div>}
          </div>
        );
      })}
      <button className="enlace" style={{ justifySelf: 'start' }} onClick={() => onCambio([...filas, { insumo_id: '', cantidad: '' }])}>＋ Agregar otro insumo</button>
    </div>
  );
}

/** Movimientos recientes (retiros que hicieron otras áreas, por ejemplo) */
export function useMovimientos(sede: string, ubicacion: string, tipos: string[], limite = 30) {
  const [movs, setMovs] = useState<any[]>([]);
  const cargar = useCallback(async () => {
    const { data } = await sb.from('movimientos_stock')
      .select('id, cantidad, tipo, motivo, creado_en, insumos(nombre, unidad), perfiles(nombre), ubicaciones_stock!inner(codigo)')
      .eq('sede_id', sede).eq('ubicaciones_stock.codigo', ubicacion).in('tipo', tipos)
      .order('creado_en', { ascending: false }).limit(limite);
    setMovs(data ?? []);
  }, [sede, ubicacion, tipos.join(',')]);
  useEnVivo(`movs-${sede}-${ubicacion}`, [{ tabla: 'saldos_stock', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return movs;
}
