const CACHE = 'dashboard-shell-20261027-v63';
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['/dashboard/dashboard.html', '/dashboard/dash-icon-192.png', '/dashboard/dash-icon-512.png']))
      .catch(() => {})
      .finally(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('dashboard-shell-') && k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/dashboard/')) return;
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// Real Web Push: show notifications with App Name and App Logo even when the dashboard tab is closed.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const rawTitle = String(data.title || 'اعلان جدید').trim();
  const title = (rawTitle.includes('سیستم یکپارچه انبار') || rawTitle.includes('سیستم انبار'))
    ? rawTitle
    : ('📦 سیستم یکپارچه انبار و توزیع | ' + rawTitle);
  const logoUrl = data.icon || '/dashboard/dash-icon-192.png';
  const options = {
    body: data.body || 'اطلاعات جدید در داشبورد ثبت شده است.',
    icon: logoUrl,
    badge: data.badge || logoUrl,
    tag: data.tag || 'dashboard-' + (data.url || 'notice'),
    renotify: true,
    data: { url: data.url || '/dashboard/dashboard.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || '/dashboard/dashboard.html', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.navigate(target).then(c => c && c.focus());
    return self.clients.openWindow(target);
  }));
});
