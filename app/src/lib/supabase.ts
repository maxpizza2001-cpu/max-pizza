import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && anon && !url.includes('TU-PROYECTO'));

export const sb: SupabaseClient = configurado
  ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } })
  : (null as unknown as SupabaseClient);

/** Identificador de operación: el mismo para reintentos de la misma acción (evita duplicados). */
export const nuevaOperacion = () => crypto.randomUUID();

/** Llama una función del servidor y devuelve un mensaje en español si falla. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(traducirError(error.message));
  // Esta pantalla se refresca al instante (las demás se enteran por tiempo real)
  window.dispatchEvent(new Event('mp:cambio'));
  return data as T;
}

export function traducirError(msg: string) {
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa el internet e intenta de nuevo.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o clave incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Falta confirmar el correo.';
  return msg;
}
