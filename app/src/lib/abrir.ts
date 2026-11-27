// Lo que pide abrir un aviso del celular: "comanda:<id>", "tarea:<id>", "stock", "domicilios".
// Llega por la dirección (?abrir=...) si la app estaba cerrada, o por mensaje del service worker si ya estaba abierta.
import { useEffect, useState } from 'react';

let pendiente: string | null = null;
const oyentes = new Set<(v: string) => void>();

if (typeof window !== 'undefined') {
  const p = new URLSearchParams(location.search);
  if (p.get('abrir')) {
    pendiente = p.get('abrir');
    p.delete('abrir');
    history.replaceState(history.state, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
  }
  navigator.serviceWorker?.addEventListener('message', (e) => {
    const v = e.data?.abrir;
    if (typeof v === 'string' && v) { pendiente = v; oyentes.forEach((f) => f(v)); }
  });
}

/** Devuelve el id que pide abrir el aviso para este tipo ("comanda", "tarea") o el valor completo ("stock"), y lo consume. */
export function useAbrir(tipo: string): [string | null, () => void] {
  const leer = () => (pendiente && (pendiente === tipo || pendiente.startsWith(tipo + ':')) ? (pendiente.split(':')[1] ?? tipo) : null);
  const [v, setV] = useState<string | null>(leer);
  useEffect(() => {
    const f = () => setV(leer());
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, [tipo]);
  return [v, () => { pendiente = null; setV(null); }];
}
