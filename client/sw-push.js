/* Service Worker — Push Notifications Admin */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '🧶 Tout en Aiguilles';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: '/assets/images/favicon.svg',
    badge: '/assets/images/favicon.svg',
    data: { url: data.url || '/gestion-tea/' },
    actions: data.actions || [],
    tag: data.tag || 'tea-notification',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
