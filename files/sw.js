/*
  سرویس‌ورکر حداقلی — فقط برای «قابل‌نصب» شدن اپ (PWA) لازم است.
  کش کردن واقعی فایل‌ها عمداً انجام نشده تا رفتار فعلی اپلیکیشن
  (که به دیتابیس آنلاین وصل است) تغییر نکند.
*/
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// یک fetch handler خالی (pass-through) — برای معیارهای نصب کروم لازم است
self.addEventListener('fetch', function (event) {
  // درخواست‌ها را دست‌نخورده به شبکه پاس می‌دهیم
});
