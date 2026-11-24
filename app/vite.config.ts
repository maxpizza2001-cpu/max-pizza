import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' para que /pedir encuentre sus archivos (en la APK, Capacitor también sirve desde la raíz)
export default defineConfig({ base: '/', plugins: [react()], server: { port: 5180 } });
