// Entrada propia de la tienda (/pedir → pedir.html): el navegador baja de una el código de la tienda,
// sin pasar primero por el archivo de la app del equipo.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Tienda } from './tienda/Tienda';
import './estilos.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Tienda />
  </React.StrictMode>,
);

// Para que el celular ofrezca "Instalar" la tienda como app (y para los avisos)
if ('serviceWorker' in navigator && !(window as any).Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
