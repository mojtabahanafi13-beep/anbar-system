# سیستم انبارداری هولدینگ

نسخه عملیاتی و رسمی سیستم:

**https://app.factor-anbar.online/**

## کاربران
کاربران عادی نیازی به دانلود یا اجرای فایل HTML ندارند. فقط آدرس بالا را باز کنند.

## نصب PWA
در مرورگرهای Chromium مثل Chrome و Edge، در صورت پشتیبانی گزینه نصب اپلیکیشن نمایش داده می‌شود.
در iPhone/iPad و Safari: از **Share → Add to Home Screen** استفاده کنید.

## مهاجرت نسخه قدیمی
Service Worker مخزن، کاربران نسخه قدیمی GitHub Pages را به نسخه رسمی Production منتقل می‌کند تا کاربران قدیمی تا حد امکان مجبور به نصب مجدد نباشند.

## لوگو
لوگوی شرکت در `logo.svg` قرار دارد و برای هویت بصری و PWA استفاده می‌شود.

## امنیت
هیچ Secret، رمز عبور، B2 Application Key یا کلید خصوصی نباید داخل این مخزن قرار بگیرد. این مقادیر باید در Cloudflare Secrets نگهداری شوند.

## معماری
- Frontend/Production: Cloudflare Workers + Static Assets
- Database: Cloudflare D1
- File Storage: Backblaze B2
- Repository: GitHub
