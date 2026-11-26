// Botón "APP" + ventana "La app de Max Pizza": cómo dejar la tienda como app en la pantalla de inicio.
//   · Android/Chrome: botón "Instalar" directo (si el navegador lo ofrece); si no, los pasos del menú ⋮.
//   · iPhone/Safari: los 3 pasos (Compartir → Agregar a inicio → Agregar).
//   · Computador: el ícono de instalar de Chrome/Edge.
// Si ya está abierta como app, el botón no aparece.
import { useEffect, useState } from 'react';
import { useCapa } from '../lib/atras';

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let guardado: EventoInstalar | null = null;
const oyentes = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); guardado = e as EventoInstalar; oyentes.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { guardado = null; oyentes.forEach((f) => f()); });
}

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const esIphone = /iphone|ipad|ipod/i.test(ua) || /iP(hone|od|ad)/.test(typeof navigator !== 'undefined' ? navigator.platform : '')
  || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const esAndroid = /android/i.test(ua);
const esApk = () => !!(window as any).Capacitor?.isNativePlatform?.();
const yaEsApp = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true || esApk();

export function BotonApp() {
  const [abierta, setAbierta] = useState(false);
  const [, refrescar] = useState(0);
  useEffect(() => { const f = () => refrescar((n) => n + 1); oyentes.add(f); return () => { oyentes.delete(f); }; }, []);
  useCapa(abierta, () => setAbierta(false));
  if (yaEsApp()) return null;
  return (
    <>
      <button className="app-boton" onClick={() => setAbierta(true)} aria-label="Descargar la app de Max Pizza">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7v7m-3-3 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 18.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>APP</span>
      </button>
      {abierta && <VentanaApp onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function VentanaApp({ onCerrar }: { onCerrar: () => void }) {
  const [instalando, setInstalando] = useState(false);
  const [lista, setLista] = useState(false);
  async function instalar() {
    if (!guardado) return;
    setInstalando(true);
    try { await guardado.prompt(); const r = await guardado.userChoice; if (r.outcome === 'accepted') setLista(true); } finally { setInstalando(false); guardado = null; }
  }
  const Ico = ({ children }: { children: string }) => <span className="app-chip" aria-hidden>{children}</span>;

  return (
    <div className="app-fondo" onClick={onCerrar}>
      <div className="app-ventana" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="La app de Max Pizza">
        <div className="app-cabeza">
          <img src="/icono-tienda-192.png" alt="" width={56} height={56} />
          <b>LA APP DE <em>MAX PIZZA</em></b>
          <button className="app-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="app-cuerpo">
          {lista ? (
            <p className="app-lista">🎉 ¡Listo! Busca el ícono de <b>Max Pizza</b> en tu pantalla de inicio.</p>
          ) : esIphone ? (
            <>
              <p>Instálala en tu iPhone en 3 toques y te queda el ícono de Max Pizza en la pantalla de inicio:</p>
              <ol>
                <li>Toca <Ico>⬆</Ico> <b>Compartir</b> (en Safari está abajo; en Chrome, arriba a la derecha).</li>
                <li>Baja y toca <b>Agregar a inicio</b> <Ico>＋</Ico>.</li>
                <li>Toca <b>Agregar</b>. ¡Listo! Ábrela desde tu pantalla de inicio.</li>
              </ol>
            </>
          ) : guardado ? (
            <>
              <p>Instálala en tu celular con un solo toque y te queda el ícono de Max Pizza en la pantalla de inicio.</p>
              <button className="app-instalar" onClick={instalar} disabled={instalando}>{instalando ? 'Instalando…' : '📲 Instalar la app'}</button>
            </>
          ) : esAndroid ? (
            <>
              <p>Instálala en tu Android en 3 toques y te queda el ícono de Max Pizza en la pantalla de inicio:</p>
              <ol>
                <li>Toca el menú <Ico>⋮</Ico> de Chrome (arriba a la derecha).</li>
                <li>Toca <b>Instalar app</b> o <b>Agregar a la pantalla principal</b> <Ico>＋</Ico>.</li>
                <li>Toca <b>Instalar</b>. ¡Listo! Ábrela desde tu pantalla de inicio.</li>
              </ol>
            </>
          ) : (
            <>
              <p>Instálala en tu computador y ábrela como una app, sin buscar la página:</p>
              <ol>
                <li>En Chrome o Edge, toca el ícono <Ico>⤓</Ico> <b>Instalar</b> al final de la barra de la dirección.</li>
                <li>Si no lo ves: menú <Ico>⋮</Ico> → <b>Guardar y compartir</b> → <b>Instalar página como app</b>.</li>
                <li>Toca <b>Instalar</b>. ¡Listo!</li>
              </ol>
            </>
          )}
          <small>Es la misma tienda con todo: Don Iván, niveles, combos y pedidos. Necesita internet.</small>
        </div>
      </div>
    </div>
  );
}
