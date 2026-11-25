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
    data: { url: '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = abiertas.find((c) => new URL(c.url).pathname !== '/pedir');
    if (app) return app.focus();
    return self.clients.openWindow('/');
  })());
});
