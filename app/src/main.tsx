import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './estilos.css';

// /pedir = tienda de clientes. Se carga SOLA, sin el código de Caja, Administración, etc. (más rápido en el celular).
// Todo lo demás = app interna del equipo.
const esTienda = window.location.pathname.replace(/\/+$/, '') === '/pedir';
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
