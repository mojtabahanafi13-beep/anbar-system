اگر می‌خواهید نقشه بدون اینترنت‌ِ CDN بالا بیاید، فایل‌های Leaflet 1.9.4 را اینجا بگذارید:
  vendor/leaflet/leaflet.js
  vendor/leaflet/leaflet.css
  vendor/leaflet/images/marker-icon.png ، marker-icon-2x.png ، marker-shadow.png ، layers.png ، layers-2x.png
(از https://unpkg.com/leaflet@1.9.4/dist/ روی یک سیستم متصل به اینترنت دانلود کنید.)
اگر فایل‌ها اینجا نباشند، صفحه به‌صورت خودکار از CDN بارگذاری می‌کند.
توجه: کاشی‌های نقشه (Google Maps) در هر حال به اینترنت نیاز دارند.
