import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sb } from '../../lib/supabase';
import { useEnVivo } from '../../lib/datos';

export type Sede = { id: string; nombre: string; activa: boolean };
export type SedeSel = string | 'todas';

/** Permisos de quien está en Administración: CEO (todo) o admin de ciertas sedes. El servidor lo valida igual. */
export type Permisos = { esCeo: boolean; adminDe: string[] };
export function usePermisos(perfil: string): Permisos {
  const [p, setP] = useState<Permisos>({ esCeo: false, adminDe: [] });
  useEffect(() => {
    sb.from('accesos_sede').select('sede_id, rol').eq('perfil_id', perfil).in('rol', ['admin', 'ceo']).then(({ data }) => {
      const l = data ?? [];
      setP({ esCeo: l.some((a: any) => a.rol === 'ceo'), adminDe: l.filter((a: any) => a.rol === 'admin').map((a: any) => a.sede_id) });
    });
  }, [perfil]);
  return p;
}

/** Lista de sedes (activas e inactivas) en vivo */
export function useSedes() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const cargar = useCallback(async () => {
    const { data } = await sb.from('sedes').select('id, nombre, activa').order('creada_en');
    setSedes(data ?? []);
  }, []);
  useEnVivo('admin-sedes', [], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return { sedes, recargar: cargar };
}

/** Consulta que se repite cuando cambian las tablas indicadas (y al guardar algo en esta pantalla) */
export function useConsulta<T>(nombre: string, fn: () => Promise<T>, deps: unknown[], tablas: string[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    try { setDatos(await fn()); setError(''); } catch (e) { setError((e as Error).message); }
  }, deps);
  useEnVivo(nombre + JSON.stringify(deps), tablas.map((tabla) => ({ tabla })), cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return { datos, error, recargar: cargar };
}

/** Lanza error si Supabase respondió con error (para usar dentro de useConsulta) */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

/** Guarda directo en una tabla (Administración) y devuelve un error en español */
export async function guardar(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) throw new Error('Ya existe un registro con esos datos.');
    if (/row-level security|permission/i.test(error.message)) throw new Error('No tienes permiso para este cambio.');
    throw new Error(error.message);
  }
  window.dispatchEvent(new Event('mp:cambio'));
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="fila entre envolver" style={{ marginBottom: 4 }}>
      <h2 style={{ fontSize: 24 }}>{children}</h2>
      {accion}
    </div>
  );
}

/** Selector de sede dentro de un formulario (cuando arriba está "Todas las sedes") */
export function ElegirSede({ sedes, valor, onCambio, todas = false }: { sedes: Sede[]; valor: string; onCambio: (v: string) => void; todas?: boolean }) {
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)}>
      {todas && <option value="todas">Todas las sedes</option>}
      {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.activa ? '' : ' (inactiva)'}</option>)}
    </select>
  );
}

export const UBICACIONES: Record<string, string> = {
  produccion: 'Producción', tortas: 'Tortas', armado: 'Armado', nevera_rapidas: 'Nevera comidas rápidas',
  servicio: 'Servicio y aseo', bodega: 'Bodega',
};

/** Mensaje temporal de "✓ Guardado" o error */
export function useAviso() {
  const [aviso, setAviso] = useState<{ ok?: string; error?: string }>({});
  const ok = (m: string) => { setAviso({ ok: m }); setTimeout(() => setAviso({}), 3000); };
  const error = (e: unknown) => setAviso({ error: (e as Error).message ?? String(e) });
  const vista = (aviso.ok && <div className="ok">{aviso.ok}</div>) || (aviso.error && <div className="error">{aviso.error}</div>) || null;
  return { ok, error, vista, limpiar: () => setAviso({}) };
}
