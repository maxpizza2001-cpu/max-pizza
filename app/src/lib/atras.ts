// "Atrás" que cierra la ventana abierta o vuelve a la pantalla anterior, en vez de salir de la app.
// Cada cosa que se abre (una ventana, una sección, un área) deja una "capa" en el historial del navegador.
// El botón atrás del celular (Android/APK) y el botón de pizza hacen history.back() → se cierra la capa de arriba.
import { useEffect, useRef, useSyncExternalStore } from 'react';

type Capa = { id: number; cerrar: () => void };
const pila: Capa[] = [];
let contador = 0;
let ignorar = 0;   // cuántos "atrás" fueron hechos por el código (al cerrar con la X) y no hay que procesar
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorar > 0) { ignorar--; return; }
    const capa = pila.pop();
    if (capa) { capa.cerrar(); avisar(); }
  });
}

/** Abre una capa. Devuelve la función para quitarla cuando se cierra con un botón (no con atrás). */
function abrirCapa(cerrar: () => void) {
  const id = ++contador;
  pila.push({ id, cerrar });
  history.pushState({ ...(history.state ?? {}), mpCapa: id }, '');
  avisar();
  return () => {
    const i = pila.findIndex((c) => c.id === id);
    if (i < 0) return;                 // ya la cerró el botón atrás
    pila.splice(i, 1);
    ignorar++; history.back();         // saca su paso del historial sin cerrar nada más
    avisar();
  };
}

/** Mientras `abierto` sea true, el botón atrás llama a `cerrar` (en vez de salir de la app). */
export function useCapa(abierto: boolean, cerrar: () => void) {
  const ref = useRef(cerrar);
  ref.current = cerrar;
  useEffect(() => {
    if (!abierto) return;
    return abrirCapa(() => ref.current());
  }, [abierto]);
}

/** ¿Hay algo a dónde volver? (para mostrar el botón de pizza) */
export function useHayAtras() {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => pila.length > 0);
}

export const irAtras = () => { if (pila.length) history.back(); };
