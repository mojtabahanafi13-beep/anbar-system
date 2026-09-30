/* مهاجرت خودکار PWA قدیمی GitHub Pages به نسخه Production
   این فایل عمداً هیچ کش آفلاینی ندارد.
   وقتی کاربر نسخه قدیمی نصب‌شده را باز کند، ناوبری صفحه به نسخه اصلی منتقل می‌شود.
*/
const PRODUCTION_URL = 'https://app.factor-anbar.online/';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // فقط ناوبری‌های HTML را منتقل کن؛ API، فایل‌ها و assetهای داخلی را دستکاری نکن.
  if (req.mode === 'navigate') {
    event.respondWith(Response.redirect(PRODUCTION_URL, 302));
    return;
  }

  // بقیه درخواست‌ها مستقیماً به شبکه بروند.
  event.respondWith(fetch(req));
});
