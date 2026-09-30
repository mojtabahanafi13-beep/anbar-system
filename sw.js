const PRODUCTION_URL='https://app.factor-anbar.online/';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate'){
    event.respondWith(Response.redirect(PRODUCTION_URL,302));
    return;
  }
  event.respondWith(fetch(event.request));
});