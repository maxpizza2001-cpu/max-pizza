import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './estilos.css';

// /pedir = tienda de clientes. Se carga SOLA, sin el código de Caja, Administración, etc. (más rápido en el celular).
// Todo lo demás = app interna del equipo.
const esTienda = window.location.pathname.replace(/\/+$/, '') === '/pedir';

// Salvavidas: si alguien abre la APP INSTALADA en la entrada del equipo pero no es trabajador (no tiene sesión)
// y ya había usado la tienda, va directo a la tienda. Los trabajadores entran con "?equipo=1" o con su sesión.
(() => {
  if (esTienda) return;
  const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const apk = !!(window as any).Capacitor?.isNativePlatform?.();
  const quiereEquipo = new URLSearchParams(location.search).has('equipo') || sessionStorage.getItem('maxpizza.equipo') === '1';
  if (quiereEquipo) { sessionStorage.setItem('maxpizza.equipo', '1'); return; }
  const conSesion = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
  const fueCliente = !!localStorage.getItem('maxpizza.tienda.sede');
  if (instalada && !apk && !conSesion && fueCliente) location.replace('/pedir?origen=app');
})();
const Tienda = lazy(() => import('./tienda/Tienda').then((m) => ({ default: m.Tienda })));
const AppInterna = lazy(() => import('./App'));

function Cargando() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: esTienda ? '#FBFAF7' : '#F7F3EA', color: '#6B665D',
    fontFamily: 'Montserrat, sans-serif', fontWeight: 800 }}>🍕 Calentando el horno…</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>{esTienda ? <Tienda /> : <AppInterna />}</Suspense>
  </React.StrictMode>,
);
