// Botón "Activar avisos": deja este celular suscrito para que le lleguen los avisos aunque esté bloqueado.
import { useEffect, useState } from 'react';
import { rpc } from '../lib/supabase';

const LLAVE = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;   // llave pública (no es secreta)

function aBytes(base64: string) {
  const p = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

const esApk = () => !!(window as any).Capacitor?.isNativePlatform?.();
const soporta = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIphone = () => /iphone|ipad/i.test(navigator.userAgent);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

export function ActivarAvisos({ sede, rol }: { sede: string; rol: string }) {
  const [estado, setEstado] = useState<'cargando' | 'activos' | 'apagados' | 'bloqueados' | 'no'>('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!LLAVE || esApk() || !soporta()) return setEstado('no');
      if (Notification.permission === 'denied') return setEstado('bloqueados');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        await guardar(sub).catch(() => {});   // por si cambió de sede o de rol
        setEstado('activos');
      } else setEstado('apagados');
    })();
  }, [sede, rol]);

  async function guardar(sub: PushSubscription) {
    const j = sub.toJSON();
    await rpc('push_guardar', { p_sede: sede, p_rol: rol, p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth });
  }

  async function activar() {
    setError('');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return setEstado(permiso === 'denied' ? 'bloqueados' : 'apagados');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE!) });
      await guardar(sub);
      setEstado('activos');
    } catch (e) { setError((e as Error).message || 'No se pudo activar.'); }
  }

  if (estado === 'cargando' || estado === 'activos') {
    return estado === 'activos' ? <div className="ok">🔔 Avisos activos: te suena aunque el celular esté bloqueado.</div> : null;
  }
  if (estado === 'no') {
    if (esApk()) return <div className="aviso">🔕 Para que te suene con el celular bloqueado, abre la app desde <b>Chrome</b> (max-pizza-roan.vercel.app) y toca "Activar avisos".</div>;
    if (esIphone() && !instalada()) return <div className="aviso">🔕 En iPhone: toca <b>Compartir → Agregar a pantalla de inicio</b>, abre Max Pizza desde ese ícono y activa los avisos.</div>;
    return null;
  }
  if (estado === 'bloqueados') return <div className="aviso">🔕 Los avisos están bloqueados. En el navegador: candado/ajustes del sitio → Notificaciones → Permitir, y recarga.</div>;
  return (
    <div className="aviso pila" style={{ gap: 8 }}>
      <div>🔔 Activa los avisos para que te suene cuando haya un domicilio, <b>aunque tengas el celular bloqueado</b>.</div>
      {error && <div className="error">{error}</div>}
      <button className="btn btn-principal btn-ancho" onClick={activar}>Activar avisos</button>
    </div>
  );
}
