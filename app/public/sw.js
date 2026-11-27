// Max Pizza · service worker: recibe los avisos aunque la app esté cerrada o el celular bloqueado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: e.data ? e.data.text() : 'Max Pizza' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Max Pizza', {
    body: d.cuerpo || '',
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    tag: d.id || undefined,
    renotify: true,
    requireInteraction: true,                 // se queda en pantalla hasta que lo toquen
    vibrate: [400, 150, 400, 150, 400, 150, 800],
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    // Abre directo lo que dice el aviso (el pedido, la tarea, el stock)
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = abiertas.find((c) => new URL(c.url).pathname !== '/pedir');
    if (app) { app.postMessage({ abrir: new URL(url, self.location.origin).searchParams.get('abrir') }); return app.focus(); }
    return self.clients.openWindow(url);
  })());
});
