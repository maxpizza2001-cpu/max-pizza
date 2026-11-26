import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// base '/' para que /pedir encuentre sus archivos (en la APK, Capacitor también sirve desde la raíz).
// Dos entradas: index.html (app del equipo) y pedir.html (tienda de clientes, carga sola y más rápido).
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5180 },
  build: { rollupOptions: { input: { index: resolve(__dirname, 'index.html'), pedir: resolve(__dirname, 'pedir.html') } } },
});
