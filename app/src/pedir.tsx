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
