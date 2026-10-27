/* پایش زنده ماشین‌ها + ارسال برنامه به رانندگان (افزونهٔ داشبورد)
   این فایل خودش منو، صفحه و دکمه‌هایش را به داشبورد اضافه می‌کند و به هیچ بخش دیگری دست نمی‌زند. */
(function () {
  'use strict';
  var API = '/api/dashboard-fleet/';
  var $ = function (id) { return document.getElementById(id); };
  var fa = function (n) { return Number(n || 0).toLocaleString('fa-IR'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var F = { open: false, trips: [], controlCenter: null, unreadByTrip: {}, serverOff: 0, timer: null, map: null, layer: null, pathLayer: null, sel: null, markers: {}, err: '', loadedAt: 0, mapFailed: false, fitted: false };
  var voiceRecorder = null, voiceStream = null, voiceChunks = [], voiceStartedAt = 0, voiceStopTimer = null, voiceTripId = null, voiceDraftBlob = null, voiceDraftDuration = 0, voicePressActive = false, voiceRequestPending = false, voiceStopRequested = false, pollingTripId = null, modalPollTimer = null, modalLastSignature = null, activeConversationRefresh = null;
  var STOP_FA = { pending: 'در انتظار', enroute: 'در راه', arrived: 'رسیده', delivered: 'تحویل کامل', partial: 'تحویل ناقص', failed: 'تحویل ناموفق' };
  var TRIP_FA = { planned: 'آماده ارسال (برنامه‌ریزی‌شده)', active: 'در حال اجرا (در مسیر)', finished: 'پایان‌یافته', cancelled: 'لغو شد' };
  var OUTCOME_FA = { completed: '✅ تحویل کامل', completed_with_issues: '🟠 پایان با توقف ناقص/ناموفق', finished_with_open_stops: '🚨 پایان با توقف تعیین‌تکلیف‌نشده' };
  var COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#65a30d'];
  function sess() { return window.__dashSession || null; }
  function canWrite() { return typeof window.__dashCanWrite === 'function' && window.__dashCanWrite(); }
  function isAdmin() { var s = sess(); return !!(s && s.role === 'admin'); }
  function toast(m, t) { try { if (typeof showToast === 'function') return showToast(m, t || 'success'); } catch (e) {} alert(m); }
  function api(path, method, body) {
    var hdrs = body ? { 'Content-Type': 'application/json' } : {};
    var tk = (window.__dashToken && window.__dashToken()) || '';
    if (tk) hdrs.Authorization = 'Bearer ' + tk;
    return fetch(API + path, { method: method || 'GET', headers: hdrs, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) { var er = new Error(j.message || j.error || ('خطا ' + r.status)); er.status = r.status; er.payload = j; er.notFound = (r.status === 404); throw er; } return j; }); });
  }
  var OLD_SERVER = 'سرور هنوز به‌روز نشده است: فایل‌های server.mjs و fleet.mjs را در local-server جایگزین کنید و وظیفهٔ «Anbar Local Server» را Restart کنید.';
  function now() { return Date.now() + F.serverOff; }
  function hhmm(ms) { return ms ? new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function ago(ms) {
    if (!ms) return 'نامشخص';
    var s = Math.max(0, Math.round((now() - ms) / 1000));
    if (s < 60) return fa(s) + ' ثانیه پیش';
    if (s < 3600) return fa(Math.round(s / 60)) + ' دقیقه پیش';
    return fa(Math.round(s / 3600)) + ' ساعت پیش';
  }
  function colorOf(key) { var h = 0; String(key).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return COLORS[h % COLORS.length]; }

  // ───── استایل ─────
  var css = '#fleetView{padding:14px 16px 40px}'
    + '#fleetView .fl-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}'
    + '#fleetView .fl-title{font-size:16px;font-weight:800;color:var(--text-main)}'
    + '.fl-btn{border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);border-radius:10px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700}'
    + '.fl-btn.pri{background:#2563eb;border-color:#2563eb;color:#fff}.fl-btn.red{background:#dc2626;border-color:#dc2626;color:#fff}'
    + '#fleetView .fl-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px}'
    + '#fleetView .fl-kpi{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px 12px}'
    + '#fleetView .fl-kpi b{display:block;font-size:20px;color:var(--text-main)}#fleetView .fl-kpi span{font-size:11px;color:var(--text-muted)}'
    + '#fleetView .fl-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;align-items:start}'
    + '@media(max-width:1000px){#fleetView .fl-grid{grid-template-columns:1fr}}'
    + '#flMap{height:480px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card);overflow:hidden;position:sticky;top:8px;z-index:1}'
    + '@media(max-width:1000px){#flMap{height:340px;position:relative}}'
    + '.fl-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;border-right:5px solid #94a3b8;color:var(--text-main)}'
    + '.fl-card.sel{box-shadow:0 0 0 2px #2563eb}'
    + '.fl-card .h{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.fl-card .h b{font-size:15px}.fl-card .sub{font-size:11px;color:var(--text-muted)}'
    + '.fl-chip{font-size:10px;padding:2px 9px;border-radius:99px;font-weight:800;white-space:nowrap}'
    + '.fl-chip.active{background:#dcfce7;color:#166534}.fl-chip.planned{background:#e0e7ff;color:#3730a3}.fl-chip.finished{background:#e5e7eb;color:#374151}.fl-chip.cancelled{background:#fee2e2;color:#991b1b}'
    + '.fl-stage{margin:8px 0 4px;font-size:13px;font-weight:700;line-height:1.8}'
    + '.fl-bar{height:8px;border-radius:99px;background:rgba(148,163,184,.3);overflow:hidden;margin:6px 0}.fl-bar i{display:block;height:100%;background:#16a34a}'
    + '.fl-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--text-muted)}'
    + '.fl-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:4px;vertical-align:middle}'
    + '.fl-act{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}'
    + '.fl-warn{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:10px;padding:8px 12px;font-size:12px;margin-bottom:10px}'
    + '.fl-empty{text-align:center;padding:30px 10px;color:var(--text-muted);font-size:13px;line-height:2}'
    + '#flModal{position:fixed;inset:0;z-index:99991;background:rgba(8,15,30,.7);display:none;align-items:center;justify-content:center;padding:12px}#flModal.open{display:flex}'
    + '#flModal .bx{width:100%;max-width:920px;max-height:92vh;overflow:auto;background:var(--bg-card);color:var(--text-main);border:1px solid var(--border);border-radius:18px;padding:16px;direction:rtl}'
    + '#flModal h3{font-size:16px;margin-bottom:8px}#flModal table{width:100%;border-collapse:collapse;font-size:12px}#flModal th,#flModal td{padding:6px 5px;border-bottom:1px solid var(--border);text-align:right;vertical-align:top}'
    + '#flModal input,#flModal select{height:36px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;padding:0 8px;font-family:inherit;font-size:12px;min-width:0}'
    + '#flModal select option{color:#111}.fl-bad{color:#dc2626;font-weight:700}.fl-ok{color:#16a34a;font-weight:700}'
    + '.fl-chat-list{display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow:auto;padding:6px 2px;margin:8px 0}'
    + '.fl-chat-msg{position:relative;max-width:88%;align-self:flex-start;border:1px solid var(--border);border-radius:12px 12px 12px 3px;background:var(--bg);padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:13px;touch-action:manipulation;-webkit-touch-callout:none}'
    + '.fl-chat-more{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;margin-right:4px;border:1px solid var(--border);border-radius:7px;background:transparent;color:inherit;font-weight:900;cursor:pointer;vertical-align:middle}'
    + '.fl-chat-action-menu{position:fixed;z-index:100000;min-width:165px;max-width:230px;padding:5px;background:var(--bg-card);color:var(--text-main);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 35px rgba(0,0,0,.25);display:grid;gap:3px;direction:rtl}'
    + '.fl-chat-action-menu button{background:transparent;border:0;border-radius:8px;padding:9px 11px;text-align:right;color:inherit;font:inherit;font-size:12px;cursor:pointer}.fl-chat-action-menu button:hover{background:rgba(100,116,139,.18)}.fl-chat-action-menu button.danger{color:#dc2626}'
    + '.fl-chat-msg.mine{align-self:flex-end;background:rgba(37,99,235,.10);border-color:#60a5fa;border-radius:12px 12px 3px 12px}'
    + '.fl-chat-meta{font-size:10px;color:var(--text-muted);display:block;margin-top:3px}'
    + '.fl-chat-msg audio{display:block;width: min(280px, 70vw);height:38px;margin-top:6px}'
    + '.fl-chat-ticks{font-size:12px;letter-spacing:-2px;margin-right:4px;font-weight:800;direction:ltr;display:inline-block}.fl-chat-ticks.read{color:#38bdf8}'
    + '.fl-unread-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;line-height:20px;letter-spacing:0;vertical-align:middle;margin-right:5px;box-shadow:0 0 0 1px rgba(255,255,255,.18)}'
    + '#flChatForm textarea{width:100%;min-height:74px;resize:vertical;border:1px solid var(--border);background:var(--bg);color:var(--text-main);padding:9px 10px;border-radius:10px;font-family:inherit;font-size:13px;line-height:1.8;box-sizing:border-box}';
  function injectCss() { if ($('flCss')) return; var st = document.createElement('style'); st.id = 'flCss'; st.textContent = css; document.head.appendChild(st); }

  // ───── ساخت منو و صفحه ─────
  function build() {
    if ($('fleetView')) return true;
    var plan = $('planningView'); if (!plan) return false;
    injectCss();
    var v = document.createElement('div'); v.id = 'fleetView'; v.style.display = 'none';
    v.innerHTML = '<div class="fl-head"><div class="fl-title"><i class="fa-solid fa-satellite-dish" style="color:#16a34a"></i> پایش زنده ماشین‌ها <span id="flStamp" style="font-size:11px;font-weight:400;color:var(--text-muted)"></span></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="fl-btn pri" id="flExceptionsBtn" style="background:#dc2626;border-color:#dc2626">🚨 صف استثناها <span id="flExcBadge"></span></button><button class="fl-btn pri" id="flAddMiscTop" style="background:#db2777;border-color:#db2777">➕ ثبت ماموریت متفرقه</button><button class="fl-btn" id="flRefresh">به‌روزرسانی</button><button class="fl-btn" id="flAuditBtn">📜 سوابق تغییرات (Audit)</button><button class="fl-btn" id="flStaleCfgBtn">⏱️ آستانه تازگی GPS</button><button class="fl-btn" id="flHist">تاریخچه سفرها</button><button class="fl-btn" id="flReport">گزارش پایان روز</button>'
      + '<button class="fl-btn" id="flCustomerDna" style="border-color:#0891b2;color:#0891b2">🧬 رفتار مشتریان (DNA)</button>'
      + '<button class="fl-btn" id="flScorecard" style="border-color:#d97706;color:#d97706">🏆 کارنامه رانندگان</button>'
      + '<button class="fl-btn" id="flLocations">📍 پیشنهادهای لوکیشن</button><button class="fl-btn" id="flDrivers" style="display:none">رانندگان و رمزها</button></div></div>'
      + '<div id="flWarn"></div><div class="fl-sum" id="flSum"></div>'
      + '<div class="fl-grid"><div><div id="flMap"></div></div><div id="flList"></div></div>';
    plan.insertAdjacentElement('afterend', v);
    var m = document.createElement('div'); m.id = 'flModal'; m.innerHTML = '<div class="bx" id="flBox"></div>';
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    $('flRefresh').onclick = function () { poll(true); };
    if ($('flExceptionsBtn')) $('flExceptionsBtn').onclick = function () { showExceptionsModal('all', 'open'); };
    if ($('flAuditBtn')) $('flAuditBtn').onclick = function () { showAuditLogModal(); };
    if ($('flStaleCfgBtn')) $('flStaleCfgBtn').onclick = function () { showStaleThresholdModal(); };
    if ($('flAddMiscTop')) $('flAddMiscTop').onclick = function () { openMiscMissionModal(''); };
    $('flHist').onclick = showHistory;
    $('flReport').onclick = function () { showReport(); };
    $('flDrivers').onclick = showDrivers;
    $('flLocations').onclick = showLocationSuggestions;
    if ($('flCustomerDna')) $('flCustomerDna').onclick = showCustomerDna;
    if ($('flScorecard')) $('flScorecard').onclick = showDriverScorecard;
    // منو
    var nav = document.querySelector('.nav-menu');
    if (nav && !$('navFleet')) {
      var it = document.createElement('div'); it.className = 'nav-item'; it.id = 'navFleet';
      it.innerHTML = '<i class="fa-solid fa-satellite-dish" style="color:#22c55e"></i> پایش زنده ماشین‌ها';
      it.onclick = function () { openFleet(it); };
      var after = null; Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (n) { if (/openPlanningView/.test(n.getAttribute('onclick') || '')) after = n; });
      if (after) after.insertAdjacentElement('afterend', it); else nav.appendChild(it);
    }
    // دکمهٔ ارسال برنامه به رانندگان در نوار برنامه‌ریزی
    var wb = $('planWeightBtn');
    if (wb && !$('planFleetBtn')) {
      var b = document.createElement('button'); b.id = 'planFleetBtn'; b.className = 'btn-outline'; b.style.cssText = 'border-color:#16a34a;color:#16a34a';
      b.title = 'مسیر و فاکتورهای هر ماشین را به پرتال راننده‌اش می‌فرستد'; b.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ارسال به رانندگان';
      b.onclick = publishPlan; wb.insertAdjacentElement('afterend', b);
    }
    if (isAdmin()) $('flDrivers').style.display = '';
    // با رفتن به بخش‌های دیگر، این صفحه بسته شود
    ['setCategory', 'openPlanningView'].forEach(function (fn) {
      var orig = window[fn]; if (typeof orig !== 'function' || orig.__fleetWrapped) return;
      var w = function () { closeFleet(); return orig.apply(this, arguments); }; w.__fleetWrapped = true; window[fn] = w;
    });
    applyAdminOnly();
    return true;
  }
  // پایش زنده و برنامه‌ریزی ارسال فقط برای مدیر سیستم؛ برای بقیه منو پنهان است و باز هم نمی‌شود.
  function applyAdminOnly() {
    var admin = isAdmin();
    var nf = $('navFleet'); if (nf) nf.style.display = admin ? '' : 'none';
    var locBtn = $('flLocations'); if (locBtn) locBtn.style.display = admin ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('.nav-menu .nav-item'), function (n) { if (/openPlanningView/.test(n.getAttribute('onclick') || '')) n.style.display = admin ? '' : 'none'; });
    var op = window.openPlanningView;
    if (typeof op === 'function' && !op.__adminOnly) {
      var w = function () { if (!isAdmin()) { toast('این بخش فقط برای مدیر سیستم است.', 'error'); return; } return op.apply(this, arguments); };
      w.__adminOnly = true; w.__fleetWrapped = true; window.openPlanningView = w;
    }
  }
  function closeFleet() {
    if (!F.open) return; F.open = false; var v = $('fleetView'); if (v) v.style.display = 'none';
    var n = $('navFleet'); if (n) n.classList.remove('active'); stopTimer();
  }
  function openFleet(el) {
    if (!isAdmin()) { toast('این بخش فقط برای مدیر سیستم است.', 'error'); return; }
    build();
    ['dashboardView', 'planningView'].forEach(function (id) { var x = $(id); if (x) x.style.display = 'none'; });
    document.querySelectorAll('.nav-menu .nav-item').forEach(function (c) { c.classList.remove('active'); });
    if (el) el.classList.add('active');
    $('fleetView').style.display = 'block'; F.open = true; F.fitted = false;
    if (isAdmin()) $('flDrivers').style.display = '';
    try { if (window.innerWidth <= 900 && typeof toggleMobileMenu === 'function') toggleMobileMenu(true); } catch (e) {}
    initMap(); poll(true); startTimer();
  }
  window.openFleetView = openFleet;
  function startTimer() { stopTimer(); F.timer = setInterval(function () { if (F.open && !document.hidden) poll(false); else if (!F.open) stopTimer(); }, 10000); }
  function stopTimer() { if (F.timer) { clearInterval(F.timer); F.timer = null; } }
  document.addEventListener('visibilitychange', function () { if (F.open && !document.hidden) poll(false); });

  // ───── نقشه ─────
  function loadLeaflet() {
    return new Promise(function (res, rej) {
      if (window.L && window.L.map) return res();
      var srcs = ['vendor/leaflet/', 'https://unpkg.com/leaflet@1.9.4/dist/', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/'], i = 0;
      function add(base) {
        var css2 = document.createElement('link'); css2.rel = 'stylesheet'; css2.href = base + 'leaflet.css'; document.head.appendChild(css2);
        var sc = document.createElement('script'); sc.src = base + 'leaflet.js';
        sc.onload = function () { (window.L && window.L.map) ? res() : (css2.remove(), sc.remove(), next()); };
        sc.onerror = function () { css2.remove(); sc.remove(); next(); };
        document.head.appendChild(sc);
      }
      function next() {
        if (i >= srcs.length) return rej(new Error('leaflet'));
        var base = srcs[i++];
        if (base.indexOf('http') === 0) return add(base);
        // نسخهٔ محلی فقط اگر واقعاً فایل جاوااسکریپت باشد (وگرنه سرور صفحهٔ HTML برمی‌گرداند و خطای «Unexpected token <» می‌دهد)
        fetch(base + 'leaflet.js', { method: 'HEAD' }).then(function (r) {
          var ct = r.headers.get('content-type') || ''; if (r.ok && /javascript/i.test(ct)) add(base); else next();
        }).catch(next);
      }
      next();
    });
  }
  function initMap() {
    if (F.map || F.mapFailed) return;
    loadLeaflet().then(function () {
      if (F.map) return;
      F.map = L.map('flMap').setView([35.70, 51.40], 11);
      // نقشهٔ اصلی گوگل؛ اگر کاشی‌ها بارگذاری نشد (مسدود/کند)، خودکار OpenStreetMap جایگزین می‌شود. با کنترل بالای نقشه هم می‌شود دستی عوض کرد.
      var gl = L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=fa&x={x}&y={y}&z={z}', { attribution: '© Google Maps', maxZoom: 20 });
      var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
      var bad = 0, ok = 0;
      gl.on('tileload', function () { ok++; });
      gl.on('tileerror', function () { bad++; if (bad >= 4 && ok === 0 && F.map.hasLayer(gl)) { F.map.removeLayer(gl); osm.addTo(F.map); toast('کاشی‌های گوگل‌مپ بارگذاری نشد؛ نقشهٔ OpenStreetMap نمایش داده می‌شود.', 'info'); } });
      function tilesShown(){ var n=0; document.querySelectorAll('#flMap img.leaflet-tile').forEach(function(im){ if (im.complete && im.naturalWidth>0) n++; }); return n; }
      function useOsm(msg){ if (F.map.hasLayer(gl)) { F.map.removeLayer(gl); osm.addTo(F.map); if (msg) toast(msg, 'info'); } }
      setTimeout(function () { F.map.invalidateSize(); if (!tilesShown()) useOsm('کاشی‌های گوگل‌مپ نمایش داده نشد؛ نقشهٔ OpenStreetMap فعال شد.'); }, 6000);
      setTimeout(function () { if (F.map && !tilesShown()) { var m=$('flMap'); if (m && !m.querySelector('.fl-maphint')) { var d=document.createElement('div'); d.className='fl-maphint'; d.style.cssText='position:absolute;bottom:34px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(15,23,42,.85);color:#fff;padding:6px 12px;border-radius:8px;font-size:12px'; d.textContent='تصویر نقشه از اینترنت لود نشد؛ موقعیت‌ها همچنان روی نقشه ثبت می‌شوند.'; m.appendChild(d); } } }, 13000);
      gl.addTo(F.map); L.control.layers({ 'گوگل‌مپ': gl, 'OpenStreetMap': osm }, null, { position: 'topleft' }).addTo(F.map);
      window.addEventListener('resize', function () { if (F.map) F.map.invalidateSize(); });
      F.layer = L.layerGroup().addTo(F.map); F.pathLayer = L.layerGroup().addTo(F.map);
      setTimeout(function () { F.map.invalidateSize(); }, 200); drawMap();
    }).catch(function () { F.mapFailed = true; var m = $('flMap'); if (m) m.innerHTML = '<div class="fl-empty">نقشه بارگذاری نشد (اینترنت). فهرست ماشین‌ها در کنار صفحه کار می‌کند.</div>'; });
  }
  function pin(txt, bg, size) { return L.divIcon({ className: '', html: '<div style="background:' + bg + ';color:#fff;border-radius:50%;width:' + size + 'px;height:' + size + 'px;line-height:' + (size - 4) + 'px;text-align:center;font-size:' + (size > 24 ? 13 : 11) + 'px;font-weight:900;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.6)">' + txt + '</div>', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }); }
  function drawMap() {
    if (!F.map || !F.layer) return;
    F.layer.clearLayers(); var pts = [];
    F.trips.forEach(function (t) {
      if (t.status === 'cancelled') return;
      var col = colorOf(t.vehicleKey), showStops = (F.sel ? F.sel === t.id : t.status === 'active');
      if (showStops) t.stops.forEach(function (s, i) {
        if (s.lat == null) return; var bg = s.status === 'delivered' ? '#16a34a' : s.status === 'partial' ? '#d97706' : s.status === 'failed' ? '#dc2626' : (s.status === 'enroute' || s.status === 'arrived') ? '#f59e0b' : '#64748b';
        L.marker([s.lat, s.lng], { icon: pin(fa(i + 1), bg, 22) }).addTo(F.layer).bindTooltip(esc(s.party) + ' — ' + (STOP_FA[s.status] || s.status)); pts.push([s.lat, s.lng]);
      });
      if (t.last && t.status === 'active') {
        var lfState = (t.locationFreshness && t.locationFreshness.state) ? t.locationFreshness.state : (typeof t.locationFreshness === 'string' ? t.locationFreshness : null);
        var stale = lfState ? (lfState !== 'fresh') : (now() - (t.last.recordedAt || t.last.ts) > (t.staleThresholdMs || 120000));
        var locBadge = stale ? '🟡 موقعیت قدیمی (' + ago(t.last.recordedAt || t.last.ts) + ')' : '🟢 موقعیت تازه (زنده — ' + ago(t.last.recordedAt || t.last.ts) + ')';
        L.marker([t.last.lat, t.last.lng], { icon: pin('🚚', stale ? '#9ca3af' : col, 34), zIndexOffset: 1000 }).addTo(F.layer)
          .bindTooltip(esc(t.vehicleLabel || t.vehicleKey) + ' — ' + esc(t.driverName || '') + ' — ' + locBadge, { permanent: false });
        pts.push([t.last.lat, t.last.lng]);
      }
    });
    F.map.invalidateSize();
    if (!F.fitted && pts.length) { F.map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 }); F.fitted = true; }
  }
  function focusTrip(id) {
    var t = F.trips.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    F.sel = id; F.fitted = false; render(); drawMap();
    var pts = []; if (t.last) pts.push([t.last.lat, t.last.lng]); t.stops.forEach(function (s) { if (s.lat != null) pts.push([s.lat, s.lng]); });
    if (F.map && pts.length) F.map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
    if (F.pathLayer) F.pathLayer.clearLayers();
    api('trip?id=' + encodeURIComponent(id)).then(function (j) {
      if (F.sel !== id || !F.map || !j.path || j.path.length < 2) return;
      F.pathLayer.clearLayers(); L.polyline(j.path.map(function (p) { return [p.lat, p.lng]; }), { color: colorOf(t.vehicleKey), weight: 4, opacity: .85 }).addTo(F.pathLayer);
    }).catch(function () {});
  }

  // ───── داده ─────
  function poll(force) {
    return Promise.all([
      api('live'),
      api('control-center').catch(function () { return null; }),
      api('unread').catch(function () { return { unreadByTrip: {} }; })
    ]).then(function (res) {
      var j = res[0] || {}, cc = res[1] || null, u = res[2] || {};
      F.serverOff = (j.serverNow || Date.now()) - Date.now();
      F.trips = j.trips || [];
      F.controlCenter = cc;
      F.unreadByTrip = u.unreadByTrip || {};
      F.err = '';
      F.loadedAt = Date.now();
      var excBadge = $('flExcBadge');
      var openExcCount = cc && cc.exceptions ? cc.exceptions.length : 0;
      if (excBadge) excBadge.textContent = openExcCount > 0 ? ('(' + fa(openExcCount) + ')') : '';
      var planExcBtn = $('planExceptionsBtn');
      if (planExcBtn) planExcBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> صف استثناها' + (openExcCount > 0 ? ' (' + fa(openExcCount) + ')' : '');
    }).then(function () { render(); drawMap(); })
      .catch(function (e) { F.err = (e && e.notFound) ? OLD_SERVER : ((e && e.message) || 'ارتباط برقرار نشد'); render(); });
  }
  function stageText(t) {
    var s = t.stops || [], n = s.length;
    if (t.status === 'planned') return '📦 آماده ارسال — برنامه برای راننده ارسال شده؛ هنوز مسیر را شروع نکرده.';
    if (t.status === 'finished') {
      var outLbl = OUTCOME_FA[t.finishOutcome] || 'مسیر تمام شد';
      return outLbl + (t.finishedMs ? ' (' + hhmm(t.finishedMs) + ')' : '') + (t.openStopsReason ? ' — علت توقف باز: ' + esc(t.openStopsReason) : '');
    }
    if (t.status === 'cancelled') return 'سفر لغو شد.';
    var cur = null, idx = -1;
    for (var i = 0; i < n; i++) if (s[i].status === 'enroute' || s[i].status === 'arrived') { cur = s[i]; idx = i; break; }
    if (!cur) for (var j = 0; j < n; j++) if (s[j].status === 'pending') { cur = s[j]; idx = j; break; }
    if (!cur) return '🎉 همهٔ توقف‌ها تعیین‌تکلیف شدند؛ در انتظار بازگشت به انبار و ثبت پایان مسیر.';
    var lbl = 'توقف ' + fa(idx + 1) + ' از ' + fa(n) + ' — «' + esc(cur.party) + '»';
    if (cur.status === 'arrived') return '📍 رسیده به ' + lbl + ' (' + ago(cur.arrivedMs) + ')';
    if (cur.status === 'enroute') return '🚗 در راه ' + lbl;
    return '⏳ آمادهٔ حرکت به ' + lbl;
  }

  function computeEffectiveTripMetrics(t) {
    var rawMax = Number(t.maxKg || t.capacityKg || 0);
    if (t.vehicleKey === 'nissan' && (!rawMax || rawMax === 1200)) rawMax = 2000;
    if (!rawMax && typeof window.getVehicleCap === 'function') rawMax = Number(window.getVehicleCap(t.vehicleKey)) || 500;
    var stops = t.stops || [];
    var unkStops = 0, partStops = 0;
    stops.forEach(function (s) {
      var isAdHoc = s.isAdHoc || !(s.items && s.items.length);
      if (isAdHoc) return;
      var hasPositiveKg = (Number(s.kg) || 0) > 0 || (s.items || []).some(function (i) { return (Number(i.kg) || 0) > 0; });
      var anyMissingNote = (s.items || []).some(function (i) { return String(i.note || '').indexOf('وزن کالا ندارد') >= 0; });
      if (hasPositiveKg && !anyMissingNote) return;
      if (hasPositiveKg && anyMissingNote) partStops++;
      else unkStops++;
    });
    var isOverKg = rawMax > 0 && (Number(t.totalKg) || 0) > rawMax + 0.01;
    return {
      effMaxKg: rawMax,
      unknownKgStops: unkStops,
      partialKgStops: partStops,
      isOverloadedKg: isOverKg
    };
  }

  function buildAllKpiBuckets() {
    var cc = F.controlCenter || {};
    var trips = F.trips || [];
    var readyItems = (cc.kpis && cc.kpis.ready && cc.kpis.ready.items && cc.kpis.ready.items.length)
      ? cc.kpis.ready.items
      : trips.filter(function (t) { return t.status === 'planned'; });
    var activeItems = (cc.kpis && cc.kpis.active && cc.kpis.active.items && cc.kpis.active.items.length)
      ? cc.kpis.active.items
      : trips.filter(function (t) { return t.status === 'active'; });
    var completedItems = (cc.kpis && cc.kpis.completed && cc.kpis.completed.items && cc.kpis.completed.items.length)
      ? cc.kpis.completed.items
      : trips.filter(function (t) { return t.status === 'finished' && t.finishOutcome === 'completed'; });
    var needsAttentionItems = (cc.kpis && cc.kpis.needsAttention && cc.kpis.needsAttention.items && cc.kpis.needsAttention.items.length)
      ? cc.kpis.needsAttention.items
      : trips.filter(function (t) {
          var m = computeEffectiveTripMetrics(t);
          var sb = t.stopBreakdown || {};
          var hasProb = (sb.partial > 0) || (sb.failed > 0) || (t.status === 'finished' && sb.open > 0);
          var lfState = (t.locationFreshness && t.locationFreshness.state) ? t.locationFreshness.state : null;
          var hasStale = t.status === 'active' && lfState === 'stale';
          return hasProb || (m.isOverloadedKg && !t.overloadApproved) || hasStale || t.finishOutcome === 'finished_with_open_stops' || t.finishOutcome === 'completed_with_issues';
        });

    var problemStops = (cc.problemStops && cc.problemStops.length) ? cc.problemStops : [];
    if (!problemStops.length) {
      trips.forEach(function (t) {
        (t.stops || []).forEach(function (s) {
          if (s.status === 'partial' || s.status === 'failed' || (t.status === 'finished' && s.status !== 'delivered' && s.status !== 'partial' && s.status !== 'failed')) {
            problemStops.push({
              stopId: s.id,
              tripId: t.id,
              planDate: t.planDate,
              vehicleKey: t.vehicleKey,
              vehicleLabel: t.vehicleLabel || t.vehicleKey,
              driverName: t.driverName || 'تعیین‌نشده',
              party: s.party,
              status: s.status,
              issueType: s.status === 'partial' ? 'تحویل ناقص' : (s.status === 'failed' ? 'تحویل ناموفق' : 'توقف انجام‌نشده در سفر پایان‌یافته'),
              reason: s.partialReason || s.failReason || t.finishReason || 'بدون توضیح',
              kg: s.kg || 0,
              cartons: s.cartons || 0
            });
          }
        });
      });
    }

    var overloadOrUnknownItems = [];
    trips.forEach(function (t) {
      if (t.status === 'cancelled' || t.status === 'finished') return;
      var m = computeEffectiveTripMetrics(t);
      if (m.isOverloadedKg || m.unknownKgStops > 0 || m.partialKgStops > 0) {
        var reasons = [];
        if (m.isOverloadedKg) reasons.push('اضافه‌بار وزنی (' + fa(Math.round(t.totalKg || 0)) + ' از ' + fa(Math.round(m.effMaxKg)) + ' کیلو)');
        if (m.unknownKgStops > 0) reasons.push(fa(m.unknownKgStops) + ' توقف بدون وزن ثبت‌شده');
        if (m.partialKgStops > 0) reasons.push(fa(m.partialKgStops) + ' توقف با وزن ناقص');
        overloadOrUnknownItems.push({
          id: t.id,
          vehicleLabel: t.vehicleLabel || t.vehicleKey,
          driverName: t.driverName || 'تعیین‌نشده',
          planDate: t.planDate,
          status: t.status,
          totalKg: t.totalKg || 0,
          effMaxKg: m.effMaxKg,
          unknownKgStops: m.unknownKgStops,
          partialKgStops: m.partialKgStops,
          isOverloadedKg: m.isOverloadedKg,
          reasonsText: reasons.join(' · ')
        });
      }
    });

    var syncIssues = (cc.syncIssues && cc.syncIssues.length) ? cc.syncIssues : [];

    return {
      ready: { count: readyItems.length, items: readyItems },
      active: { count: activeItems.length, items: activeItems },
      completed: { count: completedItems.length, items: completedItems },
      needsAttention: { count: needsAttentionItems.length, items: needsAttentionItems },
      problemStops: { count: problemStops.length, items: problemStops },
      overloadOrUnknown: { count: overloadOrUnknownItems.length, items: overloadOrUnknownItems },
      syncIssues: { count: syncIssues.length, items: syncIssues }
    };
  }

  function openKpiDrilldownModal(kpiKey) {
    ensureModalReady();
    var allBuckets = buildAllKpiBuckets();
    var bucket = allBuckets[kpiKey];
    if (!bucket) return;

    if (kpiKey === 'problemStops') {
      var pRows = (bucket.items || []).map(function (ps, idx) {
        return '<tr>'
          + '<td>' + fa(idx + 1) + '</td>'
          + '<td><span class="fl-bad">' + esc(ps.issueType || STOP_FA[ps.status] || ps.status) + '</span></td>'
          + '<td><b>' + esc(ps.party || '—') + '</b><div class="sub">برنامهٔ ' + esc(ps.planDate || '') + '</div></td>'
          + '<td>🚚 ' + esc(ps.vehicleLabel || ps.vehicleKey || '') + '<div class="sub">راننده: ' + esc(ps.driverName || '—') + '</div></td>'
          + '<td>' + esc(ps.reason || '—') + '<div class="sub">' + fa(Math.round(ps.kg || 0)) + ' کیلو · ' + fa(Math.round(ps.cartons || 0)) + ' کارتن</div></td>'
          + '<td><button class="fl-btn pri" onclick="__flDetail(\'' + esc(ps.tripId) + '\')">مشاهده و ویرایش در سفر</button></td>'
          + '</tr>';
      }).join('');
      openModal('<h3>🛑 فهرست توقف‌های ناموفق، ناقص یا باز (' + fa(bucket.count) + ' مورد)</h3>'
        + '<div class="sub" style="margin-bottom:8px">فهرست توقف‌هایی که تحویل نشده‌اند، ناقص تحویل شده‌اند یا پس از پایان سفر باز مانده‌اند.</div>'
        + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>وضعیت</th><th>مشتری / مقصد</th><th>خودرو / راننده</th><th>علت و مشخصات بار</th><th>اقدام</th></tr></thead><tbody>'
        + (pRows || '<tr><td colspan="6" class="fl-empty">هیچ توقف ناموفق یا ناقصی وجود ندارد. ✅</td></tr>')
        + '</tbody></table></div>' + CLOSE);
      return;
    }

    if (kpiKey === 'overloadOrUnknown') {
      var oRows = (bucket.items || []).map(function (ov, idx) {
        return '<tr>'
          + '<td>' + fa(idx + 1) + '</td>'
          + '<td><span class="fl-chip ' + esc(ov.status) + '">' + (TRIP_FA[ov.status] || ov.status) + '</span></td>'
          + '<td><b>🚚 ' + esc(ov.vehicleLabel) + '</b><div class="sub">راننده: ' + esc(ov.driverName) + ' · ' + esc(ov.planDate || '') + '</div></td>'
          + '<td style="color:#dc2626;font-weight:700">' + esc(ov.reasonsText) + '</td>'
          + '<td>' + fa(Math.round(ov.totalKg)) + ' از ' + fa(Math.round(ov.effMaxKg)) + ' کیلو</td>'
          + '<td><button class="fl-btn pri" onclick="__flDetail(\'' + esc(ov.id) + '\')">مشاهده فاکتورها و توقف‌ها</button></td>'
          + '</tr>';
      }).join('');
      openModal('<h3>⚖️ خودروهای دارای اضافه‌بار یا فاکتور بدون وزن (' + fa(bucket.count) + ' مورد)</h3>'
        + '<div class="sub" style="margin-bottom:8px">فهرست خودروهایی که وزن بارشان از ظرفیت مجاز بیشتر است یا فاکتور بدون سند خروج انبار دارند.</div>'
        + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>وضعیت سفر</th><th>خودرو / راننده</th><th>علت هشدار وزن</th><th>بار / ظرفیت مجاز</th><th>اقدام</th></tr></thead><tbody>'
        + (oRows || '<tr><td colspan="6" class="fl-empty">وزن تمام خودروها و فاکتورها کامل و در محدودهٔ مجاز است. ✅</td></tr>')
        + '</tbody></table></div>' + CLOSE);
      return;
    }

    if (kpiKey === 'syncIssues') {
      var sRows = (bucket.items || []).map(function (si, idx) {
        return '<tr>'
          + '<td>' + fa(idx + 1) + '</td>'
          + '<td><span class="fl-bad">' + esc(si.error_code || si.errorCode || 'خطا') + '</span></td>'
          + '<td><b>' + esc(si.driver_name || si.driverName || 'راننده') + '</b></td>'
          + '<td>' + esc(si.error_message || si.errorMessage || 'خطا در ارسال عملیات آفلاین') + '</td>'
          + '<td>' + hhmm(si.updated_ms || si.created_ms) + '</td>'
          + '<td>' + (si.trip_id ? '<button class="fl-btn pri" onclick="__flDetail(\'' + esc(si.trip_id) + '\')">مشاهده سفر</button>' : '—') + '</td>'
          + '</tr>';
      }).join('');
      openModal('<h3>📲 خطاهای صف آفلاین گوشی رانندگان (' + fa(bucket.count) + ' مورد)</h3>'
        + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>کد خطا</th><th>راننده</th><th>شرح خطا</th><th>زمان</th><th>اقدام</th></tr></thead><tbody>'
        + (sRows || '<tr><td colspan="6" class="fl-empty">هیچ خطایی در صف آفلاین گوشی رانندگان وجود ندارد. ✅</td></tr>')
        + '</tbody></table></div>' + CLOSE);
      return;
    }

    var titles = {
      ready: '📦 فهرست سفرهای آماده ارسال (برنامه‌ریزی‌شده)',
      active: '🚚 فهرست سفرهای در حال اجرا (در مسیر)',
      completed: '✅ فهرست سفرهای تکمیل‌شده',
      needsAttention: '🚨 سفرهای نیازمند رسیدگی فوری'
    };
    var items = bucket.items || [];
    var rows = items.map(function (it, idx) {
      if (it.kind === 'exception') {
        return '<tr><td>' + fa(idx + 1) + '</td><td><span class="fl-bad">🚨 استثنا</span></td><td><b>' + esc(it.title || '') + '</b><div class="sub">' + esc(it.detail || '') + '</div></td><td>' + esc(it.vehicleKey || '—') + ' / ' + esc(it.driverName || '—') + '</td><td>' + hhmm(it.createdMs) + '</td><td><button class="fl-btn pri" onclick="__flShowExceptions(\'' + esc(it.category || 'all') + '\',\'open\')">رسیدگی</button></td></tr>';
      }
      var sb = it.stopBreakdown || {
        total: (it.stops || []).length,
        delivered: (it.stops || []).filter(function (s) { return s.status === 'delivered'; }).length,
        partial: (it.stops || []).filter(function (s) { return s.status === 'partial'; }).length,
        failed: (it.stops || []).filter(function (s) { return s.status === 'failed'; }).length,
        open: (it.stops || []).filter(function (s) { return s.status !== 'delivered' && s.status !== 'partial' && s.status !== 'failed'; }).length
      };
      var m = computeEffectiveTripMetrics(it);
      var whyAttention = [];
      if (sb.failed > 0) whyAttention.push('✖ ' + fa(sb.failed) + ' توقف ناموفق');
      if (sb.partial > 0) whyAttention.push('🟠 ' + fa(sb.partial) + ' تحویل ناقص');
      if (it.status === 'finished' && sb.open > 0) whyAttention.push('⚠️ ' + fa(sb.open) + ' توقف باز پس از پایان سفر');
      var lfSt = (it.locationFreshness && it.locationFreshness.state) ? it.locationFreshness.state : null;
      if (it.status === 'active' && lfSt === 'stale') whyAttention.push('🟡 موقعیت مکانی قدیمی');
      if (m.isOverloadedKg && !it.overloadApproved) whyAttention.push('⚖️ اضافه‌بار');
      var whyHtml = whyAttention.length ? '<div style="font-size:11px;color:#dc2626;font-weight:700;margin-top:3px">' + whyAttention.join(' · ') + '</div>' : '';
      return '<tr><td>' + fa(idx + 1) + '</td><td><span class="fl-chip ' + esc(it.status) + '">' + (TRIP_FA[it.status] || it.status) + '</span></td><td><b>🚚 ' + esc(it.vehicleLabel || it.vehicleKey) + '</b><div class="sub">راننده: ' + esc(it.driverName || 'تعیین‌نشده') + ' · تاریخ: ' + esc(it.planDate || '') + '</div>' + whyHtml + '</td><td>کل توقف: <b>' + fa(sb.total || 0) + '</b> | تحویل کامل: <b class="fl-ok">' + fa(sb.delivered || 0) + '</b>' + (sb.partial ? ' | ناقص: <b style="color:#d97706">' + fa(sb.partial) + '</b>' : '') + (sb.failed ? ' | ناموفق: <b class="fl-bad">' + fa(sb.failed) + '</b>' : '') + (sb.open ? ' | باز: <b>' + fa(sb.open) + '</b>' : '') + '</td><td>' + fa(Math.round(it.totalKg || 0)) + ' کیلو</td><td><button class="fl-btn pri" onclick="__flDetail(\'' + esc(it.id) + '\')">جزئیات و فاکتورها</button></td></tr>';
    }).join('');
    openModal('<h3>' + (titles[kpiKey] || 'جزئیات شاخص') + ' (' + fa(items.length) + ' مورد)</h3>'
      + '<div class="sub" style="margin-bottom:8px">برای مشاهدهٔ ریز فاکتورها، شواهد تحویل یا ویرایش هر سفر، روی دکمهٔ «جزئیات و فاکتورها» بزنید.</div>'
      + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>وضعیت</th><th>خودرو و راننده</th><th>وضعیت توقف‌ها</th><th>وزن بار</th><th>اقدام</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="6" class="fl-empty">موردی در این دسته وجود ندارد.</td></tr>')
      + '</tbody></table></div>' + CLOSE);
  }
  window.__flOpenKpiDrilldown = openKpiDrilldownModal;

  function render() {
    var list = $('flList'); if (!list) return;
    var st = $('flStamp'); if (st) st.textContent = F.loadedAt ? '— به‌روز شده ' + hhmm(F.loadedAt) : '';
    $('flWarn').innerHTML = F.err ? '<div class="fl-warn">' + esc(F.err) + '</div>' : '';

    var kpis = buildAllKpiBuckets();
    $('flSum').innerHTML =
      '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #3b82f6" onclick="__flOpenKpiDrilldown(\'ready\')" title="کلیک برای مشاهده فهرست سفرهای آماده ارسال"><b>' + fa(kpis.ready.count) + '</b><span>📦 آماده ارسال (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #16a34a" onclick="__flOpenKpiDrilldown(\'active\')" title="کلیک برای مشاهده فهرست سفرهای در حال اجرا"><b>' + fa(kpis.active.count) + '</b><span>🚚 در حال اجرا (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #059669" onclick="__flOpenKpiDrilldown(\'completed\')" title="کلیک برای مشاهده سفرهای تکمیل‌شده"><b>' + fa(kpis.completed.count) + '</b><span>✅ تکمیل‌شده (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #dc2626;background:rgba(220,38,38,.06)" onclick="__flOpenKpiDrilldown(\'needsAttention\')" title="کلیک برای مشاهده موارد نیازمند رسیدگی"><b style="color:#dc2626">' + fa(kpis.needsAttention.count) + '</b><span style="color:#dc2626;font-weight:700">🚨 نیازمند رسیدگی (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #f59e0b" onclick="__flOpenKpiDrilldown(\'problemStops\')" title="کلیک برای مشاهده توقف‌های ناموفق، ناقص یا باز"><b>' + fa(kpis.problemStops.count) + '</b><span>🛑 توقف ناموفق/ناقص/باز (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #8b5cf6" onclick="__flOpenKpiDrilldown(\'overloadOrUnknown\')" title="کلیک برای مشاهده خودروهای دارای اضافه‌بار یا وزن نامشخص"><b>' + fa(kpis.overloadOrUnknown.count) + '</b><span>⚖️ اضافه‌بار / وزن نامشخص (کلیک کنید)</span></div>'
      + '<div class="fl-kpi" style="cursor:pointer;border-right:4px solid #64748b" onclick="__flOpenKpiDrilldown(\'syncIssues\')" title="کلیک برای مشاهده خطاهای صف آفلاین گوشی"><b>' + fa(kpis.syncIssues.count) + '</b><span>📲 خطای صف آفلاین گوشی</span></div>';

    if (!F.trips.length) { list.innerHTML = '<div class="fl-empty">هنوز سفری ثبت نشده.<br>در «برنامه‌ریزی ارسال» برنامه را پردازش کنید و دکمهٔ «ارسال به رانندگان» را بزنید.</div>'; return; }

    list.innerHTML = F.trips.map(function (t) {
      var sb = t.stopBreakdown || {
        total: t.stops.length,
        delivered: t.stops.filter(function (s) { return s.status === 'delivered'; }).length,
        partial: t.stops.filter(function (s) { return s.status === 'partial'; }).length,
        failed: t.stops.filter(function (s) { return s.status === 'failed'; }).length,
        open: t.stops.filter(function (s) { return s.status === 'pending' || s.status === 'enroute' || s.status === 'arrived'; }).length
      };
      var d = sb.delivered + sb.partial + sb.failed, n = sb.total, pct = n ? Math.round(100 * d / n) : 0;
      var kgd = t.stops.reduce(function (a, s) { return a + (s.status === 'delivered' ? (s.kg || 0) : (s.status === 'partial' && s.deliveredKg != null ? Number(s.deliveredKg) : 0)); }, 0);
      var unreadForTrip = Math.max(0, Number(F.unreadByTrip[t.id]) || 0);

      // بخش ۳.۲ و ۴.۳: نمایش صریح تازگی موقعیت و تفکیک زمان ثبت روی گوشی (recordedAt) از زمان دریافت سرور (receivedAt)
      var gpsHtml = '';
      if (t.last) {
        var recAt = t.last.recordedAt || t.last.ts;
        var srvAt = t.last.receivedAt || t.last.ts;
        var lfObjState = (t.locationFreshness && t.locationFreshness.state) ? t.locationFreshness.state : (typeof t.locationFreshness === 'string' ? t.locationFreshness : null);
        var threshMs = ((F.controlCenter && F.controlCenter.staleThresholdSec) ? F.controlCenter.staleThresholdSec * 1000 : 120000);
        var freshState = (lfObjState === 'fresh' || (now() - recAt <= threshMs)) ? 'fresh' : 'stale';
        var dotCol = freshState === 'fresh' ? '#16a34a' : '#f59e0b';
        var freshLbl = freshState === 'fresh' ? '🟢 موقعیت تازه (زنده)' : '🟡 موقعیت قدیمی (' + ago(recAt) + ' — غیرلحظه‌ای)';
        gpsHtml = '<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(148,163,184,.1);font-size:11px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center">'
          + '<span><i class="fl-dot" style="background:' + dotCol + '"></i><b>' + freshLbl + '</b></span>'
          + '<span>📱 ثبت گوشی: <b>' + hhmm(recAt) + '</b> (' + ago(recAt) + ')</span>'
          + '<span>🖥️ دریافت سرور: <b>' + hhmm(srvAt) + '</b></span>'
          + (t.last.speed != null ? '<span>سرعت: ' + fa(Math.round(t.last.speed)) + ' km/h</span>' : '')
          + (t.last.battery != null ? '<span>باتری: ' + fa(Math.round(t.last.battery)) + '٪</span>' : '')
          + '</div>';
      } else if (t.status === 'active') {
        gpsHtml = '<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(220,38,38,.1);color:#dc2626;font-size:11px;font-weight:700">⚪ موقعیت ناموجود — هنوز هیچ نقطه GPS برای این سفر دریافت نشده است</div>';
      }

      var effMetrics = computeEffectiveTripMetrics(t);
      var effMaxKg = effMetrics.effMaxKg;
      var capStr = effMaxKg ? (fa(Math.round(t.totalKg || 0)) + ' از ' + fa(Math.round(effMaxKg)) + ' کیلو') : (fa(Math.round(t.totalKg || 0)) + ' کیلو');
      var allAdHoc = (t.stops || []).length > 0 && (t.stops || []).every(function (s) { return s.isAdHoc || !(s.items && s.items.length); });
      var wStatusBadge = allAdHoc
        ? '<span style="color:#db2777;font-weight:700">📌 ماموریت متفرقه</span>'
        : (effMetrics.unknownKgStops > 0)
        ? '<span style="color:#dc2626;font-weight:700">وزن نامشخص (' + fa(effMetrics.unknownKgStops) + ' توقف)</span>'
        : (effMetrics.partialKgStops > 0)
        ? '<span style="color:#d97706;font-weight:700">وزن ناقص (' + fa(effMetrics.partialKgStops) + ' توقف)</span>'
        : '<span style="color:#16a34a;font-weight:700">✓ وزن تأییدشده</span>';
      var overloadBadge = effMetrics.isOverloadedKg ? ' <span class="fl-bad">⚠️ اضافه‌بار وزنی</span>' : '';
      var overrideBadge = t.overrideReason ? '<div style="font-size:10.5px;color:#b45309;margin-top:3px">⚡ تایید استثنای ظرفیت توسط ' + esc(t.overrideApprovedBy || 'مدیر') + ': ' + esc(t.overrideReason) + '</div>' : '';

      return '<div class="fl-card' + (F.sel === t.id ? ' sel' : '') + '" style="border-right-color:' + colorOf(t.vehicleKey) + '">'
        + '<div class="h"><div><b>🚚 ' + esc(t.vehicleLabel || t.vehicleKey) + '</b><div class="sub">راننده: <b>' + esc(t.driverName || 'تعیین‌نشده') + '</b> · برنامهٔ ' + esc(t.planDate) + (t.handoverAt ? ' · 🤝 تحویل گیت: ' + hhmm(t.handoverAt) : '') + '</div></div>'
        + '<span class="fl-chip ' + t.status + '">' + (TRIP_FA[t.status] || t.status) + '</span></div>'
        + '<div class="fl-stage">' + stageText(t) + '</div><div class="fl-bar"><i style="width:' + pct + '%"></i></div>'
        + '<div class="fl-meta">'
        + '<span>کل توقف: <b>' + fa(n) + '</b></span>'
        + '<span class="fl-ok">تحویل کامل: <b>' + fa(sb.delivered) + '</b></span>'
        + (sb.partial ? '<span style="color:#d97706;font-weight:700">تحویل ناقص: <b>' + fa(sb.partial) + '</b></span>' : '')
        + (sb.failed ? '<span class="fl-bad">ناموفق: <b>' + fa(sb.failed) + '</b></span>' : '')
        + (sb.open ? '<span style="color:#0284c7;font-weight:700">باز/در انتظار: <b>' + fa(sb.open) + '</b></span>' : '')
        + '<span>بار تحویلی: <b>' + fa(Math.round(kgd)) + '</b> از <b>' + capStr + '</b></span>'
        + '<span>کارتن: <b>' + fa(Math.round(t.totalCartons || 0)) + '</b>' + (t.maxCartons ? '/' + fa(Math.round(t.maxCartons)) : '') + '</span>'
        + wStatusBadge + overloadBadge
        + (t.startedMs ? '<span>شروع: ' + hhmm(t.startedMs) + '</span>' : '')
        + '</div>'
        + overrideBadge
        + gpsHtml
        + '<div class="fl-act"><button class="fl-btn pri" data-fl="detail" data-id="' + t.id + '">جزئیات، فاکتورها و شواهد</button><button class="fl-btn" data-fl="focus" data-id="' + t.id + '">روی نقشه</button>'
        + ((t.status === 'planned' || t.status === 'active') && t.handoverCode ? '<button class="fl-btn" style="background:#f0fdf4;border-color:#86efac;color:#166534;font-weight:800" data-fl="gateqr" data-id="' + t.id + '">📱 QR گیت خروج</button>' : '')
        + (isAdmin() && ((t.status === 'planned' || t.status === 'active') || unreadForTrip > 0) ? '<button class="fl-btn" data-fl="chat" data-id="' + t.id + '">💬 گفت‌وگو' + (unreadForTrip > 0 ? '<span class="fl-unread-badge" aria-label="پیام خوانده‌نشده">' + fa(unreadForTrip) + '</span>' : '') + '</button>' + ((t.status === 'planned' || t.status === 'active') ? '<button class="fl-btn" data-fl="addstop" data-id="' + t.id + '">➕ توقف متفرقه</button>' : '') : '')
        + (canWrite() && (t.status === 'planned' || t.status === 'active') ? '<button class="fl-btn red" data-fl="cancel" data-id="' + t.id + '">لغو</button>' : '') + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-fl]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id'), a = b.getAttribute('data-fl');
        if (a === 'detail') showDetail(id); else if (a === 'focus') focusTrip(id);
        else if (a === 'gateqr') showGateQrModal(id);
        else if (a === 'chat') showChat(id);
        else if (a === 'voice') showVoice(id);
        else if (a === 'addstop') showAddStop(id);
        else if (a === 'locations') showLocationSuggestions();
        else if (a === 'cancel' && confirm('این سفر لغو شود؟ راننده دیگر آن را نمی‌بیند.')) api('trip/cancel', 'POST', { id: id }).then(function () { toast('سفر لغو شد.'); poll(true); }).catch(function (e) { toast(e.message, 'error'); });
      };
    });
  }

  // ───── پنجره‌ها ─────
  function stopModalPolling() { if (modalPollTimer) clearInterval(modalPollTimer); modalPollTimer = null; pollingTripId = null; modalLastSignature = null; }
  function openModal(html) { ensureModalReady(); stopModalPolling(); activeConversationRefresh = null; $('flBox').innerHTML = html; $('flModal').classList.add('open'); }
  function closeModal() { stopModalPolling(); activeConversationRefresh = null; $('flModal').classList.remove('open'); }
  window.__flClose = closeModal;
  var CLOSE = '<div style="text-align:left;margin-top:12px"><button class="fl-btn" onclick="__flClose()">بستن</button></div>';
  function openEditStopModal(tripId, stop, returnToDetail) {
    ensureModalReady();
    var coordVal = (stop.lat != null && stop.lng != null && isFinite(Number(stop.lat)) && isFinite(Number(stop.lng)))
      ? (Number(stop.lat).toFixed(6) + ', ' + Number(stop.lng).toFixed(6))
      : '';
    var stOpts = Object.keys(STOP_FA).map(function (k) {
      return '<option value="' + k + '"' + (stop.status === k ? ' selected' : '') + '>' + STOP_FA[k] + '</option>';
    }).join('');
    openModal(
      '<h3>✏️ ویرایش ماموریت / توقف — ' + esc(stop.party || '') + '</h3>'
      + '<div class="sub" style="margin-bottom:10px">تغییرات بلافاصله در مسیر راننده اعمال و به گوشی او اطلاع داده می‌شود.</div>'
      + '<form id="flEditStopForm">'
      + '<label style="font-size:12px;font-weight:700">نام مقصد / مشتری</label>'
      + '<input class="fl-input-wide" id="flEdParty" required value="' + esc(stop.party || '') + '" style="width:100%;margin:4px 0 10px">'
      + '<label style="font-size:12px;font-weight:700">شرح ماموریت / توضیحات</label>'
      + '<input class="fl-input-wide" id="flEdNote" value="' + esc(stop.note || '') + '" placeholder="شرح کار یا توضیحات برای راننده" style="width:100%;margin:4px 0 10px">'
      + '<label style="font-size:12px;font-weight:700">آدرس یا راهنمای مسیر (اختیاری)</label>'
      + '<input class="fl-input-wide" id="flEdAddress" value="' + esc(stop.address || '') + '" placeholder="آدرس مقصد" style="width:100%;margin:4px 0 10px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'
      + '<div><label style="font-size:12px;font-weight:700">وزن (کیلوگرم)</label><input class="fl-input-wide" id="flEdKg" type="number" step="0.1" min="0" value="' + Number(stop.kg || 0) + '" style="width:100%;margin-top:4px"></div>'
      + '<div><label style="font-size:12px;font-weight:700">تعداد کارتن</label><input class="fl-input-wide" id="flEdCartons" type="number" step="1" min="0" value="' + Number(stop.cartons || 0) + '" style="width:100%;margin-top:4px"></div>'
      + '<div><label style="font-size:12px;font-weight:700">وضعیت توقف</label><select class="fl-input-wide" id="flEdStatus" style="width:100%;margin-top:4px">' + stOpts + '</select></div>'
      + '</div>'
      + '<label style="font-size:12px;font-weight:700">مختصات جغرافیایی (عرض، طول — اختیاری)</label>'
      + '<input class="fl-input-wide" id="flEdCoord" dir="ltr" value="' + esc(coordVal) + '" placeholder="35.700000, 51.400000" style="width:100%;margin:4px 0 10px">'
      + '<div id="flEdStopMsg" style="min-height:20px;font-size:12px"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">'
      + '<button type="button" class="fl-btn" id="flEdCancelBtn">انصراف و بازگشت</button>'
      + '<button type="submit" class="fl-btn pri" id="flEdSaveBtn">💾 ذخیره تغییرات</button>'
      + '</div>'
      + '</form>'
    );
    if ($('flEdCancelBtn')) {
      $('flEdCancelBtn').onclick = function () {
        if (returnToDetail && tripId) showDetail(tripId);
        else closeModal();
      };
    }
    if ($('flEditStopForm')) {
      $('flEditStopForm').onsubmit = function (ev) {
        ev.preventDefault();
        var partyVal = $('flEdParty').value.trim();
        var noteVal = $('flEdNote').value.trim();
        var addrVal = $('flEdAddress').value.trim();
        var kgVal = Number($('flEdKg').value || 0);
        var cartVal = Number($('flEdCartons').value || 0);
        var stVal = $('flEdStatus').value;
        var coordStr = $('flEdCoord').value.trim();
        var latVal = null, lngVal = null;
        if (coordStr) {
          var mm = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(coordStr);
          if (!mm || Math.abs(Number(mm[1])) > 90 || Math.abs(Number(mm[2])) > 180) {
            $('flEdStopMsg').textContent = 'مختصات باید به شکل عرض، طول باشد؛ نمونه: 35.700000, 51.400000';
            $('flEdStopMsg').className = 'fl-bad';
            return;
          }
          latVal = Number(mm[1]);
          lngVal = Number(mm[2]);
        }
        var btn = $('flEdSaveBtn');
        if (btn) btn.disabled = true;
        $('flEdStopMsg').textContent = 'در حال ذخیره تغییرات…';
        $('flEdStopMsg').className = '';
        api('trip/edit-stop', 'POST', {
          stopId: stop.id,
          party: partyVal,
          note: noteVal,
          address: addrVal,
          kg: kgVal,
          cartons: cartVal,
          status: stVal,
          lat: latVal,
          lng: lngVal
        }).then(function () {
          toast('تغییرات ماموریت با موفقیت ذخیره شد. ✅');
          if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
          if (F.open) poll(true);
          if (returnToDetail && tripId) showDetail(tripId);
          else closeModal();
        }).catch(function (err) {
          if (btn) btn.disabled = false;
          $('flEdStopMsg').textContent = err.message || 'خطا در ویرایش ماموریت';
          $('flEdStopMsg').className = 'fl-bad';
        });
      };
    }
  }

  window.editFleetMiscMission = function (stopId, tripId) {
    if (!isAdmin() && !canWrite()) return;
    if (tripId) {
      api('trip?id=' + encodeURIComponent(tripId)).then(function (j) {
        var st = ((j && j.trip && j.trip.stops) || []).filter(function (x) { return x.id === stopId; })[0];
        if (st) openEditStopModal(tripId, st, false);
        else toast('ماموریت مورد نظر یافت نشد.', 'error');
      }).catch(function (e) { toast(e.message, 'error'); });
      return;
    }
    var foundTripId = null, foundStop = null;
    (F.trips || []).forEach(function (t) {
      (t.stops || []).forEach(function (s) {
        if (s.id === stopId) { foundTripId = t.id; foundStop = s; }
      });
    });
    if (foundStop) {
      openEditStopModal(foundTripId, foundStop, false);
    } else {
      var adhoc = ((window.__fleetActiveAdhocStops) || []).filter(function (x) { return x.id === stopId; })[0];
      if (adhoc) {
        openEditStopModal(adhoc.tripId || null, {
          id: adhoc.id,
          party: adhoc.party || '',
          note: adhoc.note || '',
          address: adhoc.address || '',
          lat: adhoc.lat,
          lng: adhoc.lng,
          kg: 0,
          cartons: 0,
          status: adhoc.status || 'pending'
        }, false);
      } else {
        toast('ماموریت مورد نظر یافت نشد.', 'error');
      }
    }
  };

  function showDetail(id) {
    openModal('<div class="fl-empty">در حال دریافت…</div>');
    api('trip?id=' + encodeURIComponent(id)).then(function (j) {
      var t = j.trip, tok = (window.__dashToken && window.__dashToken()) || '';
      var canManageStops = isAdmin() || canWrite();
      function lookupInvoicePartyLocal(sheet, num) {
        var gd = window.globalData || [];
        var nStr = String(num || '').trim();
        var shStr = String(sheet || '').trim();
        if (!nStr || !gd.length) return '';
        var exactMatch = gd.filter(function (inv) { return String(inv.number || '').trim() === nStr && (!shStr || String(inv.sheet || '').trim() === shStr); });
        if (exactMatch.length === 1 && exactMatch[0].party) return String(exactMatch[0].party).trim();
        var numMatch = gd.filter(function (inv) { return String(inv.number || '').trim() === nStr; });
        if (numMatch.length === 1 && numMatch[0].party) return String(numMatch[0].party).trim();
        return '';
      }
      var rows = t.stops.map(function (s, i) {
        var dur = s.arrivedMs && s.doneMs ? fa(Math.max(0, Math.round((s.doneMs - s.arrivedMs) / 60000))) + ' دقیقه' : '—';
        var far = s.distM != null && s.distM > 300 ? ' <span class="fl-bad">(در ' + fa(s.distM) + ' متری مقصد ثبت شد)</span>' : '';
        var items = (s.items || []).map(function (x) {
          var realParty = lookupInvoicePartyLocal(x.sheet, x.number) || x.party || s.party || '';
          return Object.assign({}, x, { resolvedParty: realParty });
        });
        var distinctCusts = [];
        items.forEach(function (x) {
          if (x.resolvedParty && distinctCusts.indexOf(x.resolvedParty) < 0) distinctCusts.push(x.resolvedParty);
        });
        var stopTitle = s.party || '';
        if (distinctCusts.length > 1) {
          var addrPrefix = (s.address && s.address.indexOf('باربری') >= 0) ? (s.address.split('،')[0] + ' — ') : '';
          stopTitle = addrPrefix + 'شامل ' + fa(distinctCusts.length) + ' مشتری (' + distinctCusts.join(' ، ') + ')';
        }
        var invDetailsHtml = '';
        if (!items.length) {
          invDetailsHtml = '<div class="sub" style="font-size:10.5px;color:#db2777;font-weight:700">📌 ماموریت متفرقه</div>';
        } else if (items.length === 1) {
          var x0 = items[0];
          invDetailsHtml = '<div class="sub" style="font-size:11px;margin-top:3px">🧾 فاکتور <b>' + esc(x0.number) + '</b>' + (x0.sheet ? ' (' + esc(x0.sheet) + ')' : '') + (x0.kg ? ' · ' + fa(Math.round(x0.kg)) + ' کیلو' : '') + '</div>';
        } else {
          invDetailsHtml = '<div style="margin-top:5px;display:flex;flex-direction:column;gap:3px">'
            + items.map(function (x, idx) {
                return '<div style="font-size:11px;background:rgba(148,163,184,.12);border-right:3px solid #3b82f6;padding:3px 7px;border-radius:5px">'
                  + '<b>' + fa(idx + 1) + ') فاکتور ' + esc(x.number) + '</b> — مشتری: <b style="color:#0284c7">' + esc(x.resolvedParty || '—') + '</b>'
                  + (x.sheet ? ' <span class="sub">(' + esc(x.sheet) + ')</span>' : '')
                  + (x.kg ? ' · <b>' + fa(Math.round(x.kg)) + ' کیلو</b>' : '')
                  + (x.cartons ? ' · ' + fa(Math.round(x.cartons)) + ' کارتن' : '')
                  + '</div>';
              }).join('')
            + '</div>';
        }
        var isAdHocStop = s.isAdHoc || !items.length;
        var hasPosWeight = (Number(s.kg) || 0) > 0 || items.some(function (x) { return (Number(x.kg) || 0) > 0; });
        var wBadge = isAdHocStop ? ' <span style="color:#db2777">(متفرقه)</span>' : ((s.weightStatus === 'confirmed' || (hasPosWeight && s.weightStatus !== 'partial')) ? '' : s.weightStatus === 'partial' ? ' <span style="color:#d97706">(وزن ناقص)</span>' : ' <span class="fl-bad">(وزن نامشخص)</span>');
        var partialInfo = s.status === 'partial'
          ? '<div style="color:#d97706;font-weight:700">کسری: ' + esc(s.partialReason || s.failReason || '') + (s.deliveredKg != null ? ' | تحویل‌شده: ' + fa(Math.round(s.deliveredKg)) + ' کیلو' : '') + '</div>'
          : (s.failReason ? '<div style="font-weight:400">' + esc(s.failReason) + '</div>' : '');
        var addrLine = s.address ? '<div class="sub" style="font-size:10.5px;color:#0284c7;margin-top:3px">📍 آدرس مقصد: ' + esc(s.address) + '</div>' : '';
        var actionCell = canManageStops
          ? '<td style="white-space:nowrap"><button type="button" class="fl-btn" style="padding:4px 8px;font-size:11px;border-color:#2563eb;color:#2563eb" data-stop-edit="' + esc(s.id) + '" title="ویرایش این ماموریت / توقف">✏️ ویرایش</button> <button type="button" class="fl-btn red" style="padding:4px 8px;font-size:11px" data-stop-del="' + esc(s.id) + '" title="حذف این ماموریت / توقف">🗑 حذف</button></td>'
          : '';
        return '<tr><td>' + fa(i + 1) + '</td><td style="text-align:right"><b>' + esc(stopTitle) + '</b>' + invDetailsHtml + addrLine + '</td><td>' + fa(Math.round(s.kg || 0)) + wBadge + '</td>'
          + '<td class="' + (s.status === 'delivered' ? 'fl-ok' : (s.status === 'failed' || s.status === 'partial') ? 'fl-bad' : '') + '">' + (STOP_FA[s.status] || s.status) + partialInfo + far + (s.note ? '<div style="font-weight:400;opacity:.85">📝 ' + esc(s.note) + '</div>' : '') + '</td>'
          + '<td>' + hhmm(s.arrivedMs) + '</td><td>' + hhmm(s.doneMs) + '</td><td>' + dur + '</td><td>' + (s.hasPhoto ? '<a target="_blank" href="/api/dashboard-fleet/photo?stop=' + s.id + '&t=' + encodeURIComponent(tok) + '">📷 رسید/امضا</a>' : '—') + '</td>' + actionCell + '</tr>';
      }).join('');
      var KINDS = { plan_published: 'ارسال برنامه', plan_updated: 'به‌روزرسانی برنامه', handover_confirmed: '🤝 تایید گیت خروج', trip_started: 'شروع مسیر', trip_finished: 'پایان مسیر', trip_cancelled: 'لغو سفر', gps_lost: 'هشدار GPS', photo: 'ثبت عکس/امضا', stop_enroute: 'در راه', stop_arrived: 'رسید', stop_delivered: 'تحویل کامل', stop_partial: 'تحویل ناقص', stop_failed: 'تحویل ناموفق', stop_pending: 'برگشت به انتظار', stop_edited: '✏️ ویرایش توقف', adhoc_stop_added: '➕ ثبت ماموریت متفرقه', adhoc_stop_deleted: '🗑 حذف توقف/ماموریت' };
      var ev = (j.events || []).map(function (e) { return '<tr><td>' + hhmm(e.ts) + '</td><td>' + (KINDS[e.kind] || esc(e.kind)) + '</td><td>' + esc(e.detail || '') + '</td></tr>'; }).join('');
      var lastLocLine = '';
      if (t.last) {
        var detFresh = (t.locationFreshness && t.locationFreshness.state === 'fresh') || (typeof t.locationFreshness === 'string' && t.locationFreshness === 'fresh') || (now() - (t.last.recordedAt || t.last.ts) <= 120000);
        lastLocLine = '<div style="margin:6px 0;padding:7px 10px;border-radius:9px;background:rgba(14,165,233,.08);font-size:11.5px">📍 آخرین موقعیت (' + (detFresh ? '🟢 تازه و زنده' : '🟡 قدیمی / غیرلحظه‌ای') + '): ثبت روی گوشی: <b>' + hhmm(t.last.recordedAt || t.last.ts) + '</b> · دریافت سرور: <b>' + hhmm(t.last.receivedAt || t.last.ts) + '</b></div>';
      }
      var addStopBtn = (canManageStops && (t.status === 'planned' || t.status === 'active'))
        ? ' <button class="fl-btn pri" type="button" id="flDetailAddStopBtn" style="padding:4px 10px;font-size:11.5px;background:#db2777;border-color:#db2777">➕ افزودن ماموریت متفرقه</button>'
        : '';
      openModal('<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px"><h3 style="margin:0">🚚 ' + esc(t.vehicleLabel || t.vehicleKey) + ' — ' + esc(t.driverName || '') + ' · ' + esc(t.planDate) + ' <span class="fl-chip ' + t.status + '">' + (TRIP_FA[t.status] || t.status) + '</span></h3>' + addStopBtn + '</div>'
        + '<div class="sub" style="font-size:12px;opacity:.85;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span>مسافت واقعی ثبت‌شده: ' + fa(j.driven_km) + ' کیلومتر · ' + fa(j.positions) + ' نقطهٔ GPS' + (t.startedMs ? ' · شروع ' + hhmm(t.startedMs) : '') + (t.finishedMs ? ' · پایان ' + hhmm(t.finishedMs) : '') + '</span>' + (t.handoverCode ? '<span style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:3px 10px;border-radius:8px;font-weight:800;display:inline-flex;align-items:center;gap:8px">🤝 کد گیت خروج: <code dir="ltr" style="font-size:14px;letter-spacing:1px">' + esc(t.handoverCode) + '</code> <button class="fl-btn" style="padding:2px 8px;font-size:11px;background:#16a34a;color:#fff;border:none" onclick="__flShowGateQr(\'' + esc(t.id) + '\')">📱 نمایش QR گیت</button></span>' : '') + '</div>'
        + lastLocLine
        + '<div style="overflow:auto"><table><thead><tr><th>#</th><th>مشتری / ماموریت</th><th>کیلو</th><th>وضعیت و شرح</th><th>رسیدن</th><th>پایان</th><th>توقف</th><th>شواهد</th>' + (canManageStops ? '<th>عملیات (ویرایش / حذف)</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        + '<h3 style="margin-top:14px">رویدادها</h3><div style="overflow:auto;max-height:200px"><table><tbody>' + ev + '</tbody></table></div>' + CLOSE);

      if ($('flDetailAddStopBtn')) {
        $('flDetailAddStopBtn').onclick = function () { showAddStop(t.id); };
      }
      Array.prototype.forEach.call($('flBox').querySelectorAll('[data-stop-edit]'), function (b) {
        b.onclick = function () {
          var sid = b.getAttribute('data-stop-edit');
          var stObj = (t.stops || []).filter(function (x) { return x.id === sid; })[0];
          if (stObj) openEditStopModal(t.id, stObj, true);
        };
      });
      Array.prototype.forEach.call($('flBox').querySelectorAll('[data-stop-del]'), function (b) {
        b.onclick = function () {
          var sid = b.getAttribute('data-stop-del');
          var stObj = (t.stops || []).filter(function (x) { return x.id === sid; })[0];
          if (!stObj) return;
          if (!confirm('آیا مطمئن هستید که ماموریت / توقف «' + (stObj.party || '') + '» از این سفر حذف شود؟')) return;
          b.disabled = true;
          api('trip/delete-stop', 'POST', { stopId: sid }).then(function (res) {
            toast('ماموریت / توقف «' + (stObj.party || '') + '» حذف شد.');
            if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
            if (F.open) poll(true);
            if (res && res.tripDeleted) closeModal();
            else showDetail(t.id);
          }).catch(function (err) {
            b.disabled = false;
            toast(err.message || 'خطا در حذف ماموریت', 'error');
          });
        };
      });
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }
  function voiceAudioUrl(m) {
    var tok = (window.__dashToken && window.__dashToken()) || '';
    return '/api/dashboard-fleet/voice/audio?id=' + encodeURIComponent(m.id) + '&t=' + encodeURIComponent(tok);
  }
  function chatPhotoUrl(m) {
    var tok = (window.__dashToken && window.__dashToken()) || '';
    var rawId = String(m.id || '').replace(/^photo_/, '');
    return '/api/dashboard-fleet/chat/photo?id=' + encodeURIComponent(rawId) + '&t=' + encodeURIComponent(tok);
  }
  function voiceMessagesHtml(messages) {
    if (!messages || !messages.length) return '<div class="fl-empty" style="padding:16px">هنوز پیام صوتی در این سفر ثبت نشده است.</div>';
    return '<div class="fl-voice-list">' + messages.map(function (m) {
      var who = m.senderRole === 'admin' ? 'مدیریت' : 'راننده';
      var sec = m.durationMs ? ' · ' + fa(Math.max(1, Math.round(m.durationMs / 1000))) + ' ثانیه' : '';
      return '<div class="fl-voice-msg"><div><b>' + esc(who) + ' — ' + esc(m.senderName || '') + '</b></div><div class="fl-voice-meta">' + hhmm(m.createdMs) + sec + ' · ' + fa(Math.ceil((m.sizeBytes || 0) / 1024)) + ' کیلوبایت</div><audio controls preload="none" src="' + esc(voiceAudioUrl(m)) + '"></audio></div>';
    }).join('') + '</div>';
  }
  // متون، عکس‌ها و ویس‌ها در یک گفت‌وگو مدیریت می‌شوند تا ارسال/حذف رفتار یکسان داشته باشد.
  function showVoice(tripId) { showChat(tripId); }
  function conversationMessagesHtml(messages) {
    if (!messages || !messages.length) return '<div class="fl-empty" style="padding:16px">هنوز پیامی در این گفت‌وگو ثبت نشده است.</div>';
    return '<div class="fl-chat-list">' + messages.map(function (m) {
      var mine = m.senderRole === 'admin';
      var who = mine ? 'شما / مدیریت' : 'راننده';
      var ticks = '';
      if (mine) {
        if (m.readMs) ticks = '<span class="fl-chat-ticks read" title="خوانده شده">✓✓</span>';
        else if (m.deliveredMs) ticks = '<span class="fl-chat-ticks" title="به راننده رسیده است">✓</span>';
        else ticks = '<span class="fl-chat-ticks" title="در انتظار دریافت">◷</span>';
      }
      var kind = m.type || (m.text != null ? 'text' : 'voice');
      var body = '';
      if (kind === 'voice') {
        body = '<div>🎙 پیام صوتی' + (m.durationMs ? ' · ' + fa(Math.max(1, Math.round(m.durationMs / 1000))) + ' ثانیه' : '') + '</div><audio controls preload="none" src="' + esc(voiceAudioUrl(m)) + '"></audio>';
      } else if (kind === 'photo') {
        var pUrl = m.photoUrl ? (m.photoUrl + '&t=' + encodeURIComponent((window.__dashToken && window.__dashToken()) || '')) : chatPhotoUrl(m);
        body = '<div style="margin-top:6px"><a href="' + esc(pUrl) + '" target="_blank" rel="noopener"><img src="' + esc(pUrl) + '" alt="تصویر پیوست" style="max-width:240px;max-height:220px;border-radius:10px;display:block;border:1px solid rgba(148,163,184,.35);object-fit:cover" loading="lazy"></a>' + (m.text ? '<div style="margin-top:4px">' + esc(m.text) + '</div>' : '') + '</div>';
      } else {
        body = '<div>' + esc(m.text || '') + '</div>';
      }
      return '<div class="fl-chat-msg' + (mine ? ' mine' : '') + '" data-message-id="' + esc(m.id) + '" data-sender-role="' + esc(m.senderRole || '') + '" data-message-type="' + esc(kind) + '" data-message-text="' + esc(kind === 'text' ? (m.text || '') : '') + '"><b>' + esc(who) + (m.senderName ? ' — ' + esc(m.senderName) : '') + '</b>' + body + '<span class="fl-chat-meta">' + hhmm(m.createdMs) + (m.editedMs ? ' · ویرایش‌شده' : '') + ticks + ' <button type="button" class="fl-chat-more" data-message-more="' + esc(m.id) + '" aria-label="گزینه‌های پیام" title="گزینه‌های پیام">⋮</button></span></div>';
    }).join('') + '</div>';
  }
  var fleetMessageGlobalEventsBound = false;
  function closeFleetMessageMenu() {
    var old = $('flChatActionMenu'); if (old) old.remove();
  }
  function openFleetMessageMenu(msgEl, x, y, tripId) {
    if (!msgEl) return;
    closeFleetMessageMenu();
    var id = msgEl.getAttribute('data-message-id') || '';
    var senderRole = msgEl.getAttribute('data-sender-role') || '';
    var type = msgEl.getAttribute('data-message-type') || 'text';
    var text = msgEl.getAttribute('data-message-text') || '';
    var menu = document.createElement('div'); menu.id = 'flChatActionMenu'; menu.className = 'fl-chat-action-menu';
    function add(label, action, danger) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (danger) b.className = 'danger';
      b.addEventListener('click', function () {
        closeFleetMessageMenu();
        if (action === 'copy') {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){toast('متن کپی شد.');}).catch(function(){window.prompt('متن پیام را کپی کنید:', text);});
          else window.prompt('متن پیام را کپی کنید:', text);
        } else if (action === 'edit') {
          var next = window.prompt('متن پیام را ویرایش کنید:', text);
          if (next === null || next.trim() === text.trim()) return;
          api('message/edit', 'POST', { tripId: tripId, messageId: id, text: next }).then(function(){
            toast('پیام ویرایش شد.'); modalLastSignature = null; return activeConversationRefresh ? activeConversationRefresh() : Promise.resolve();
          }).catch(function(e){toast('ویرایش پیام ناموفق بود: ' + e.message, 'error');});
        } else if (action === 'delete') {
          if (!confirm('این پیام برای هر دو طرف حذف شود؟')) return;
          api('message/delete', 'POST', { tripId: tripId, messageId: id }).then(function(){
            toast('پیام برای هر دو طرف حذف شد.'); modalLastSignature = null; return activeConversationRefresh ? activeConversationRefresh() : Promise.resolve();
          }).catch(function(e){toast('حذف پیام ناموفق بود: ' + e.message, 'error');});
        }
      }); menu.appendChild(b);
    }
    if (type === 'text' && text) add('کپی متن', 'copy', false);
    if (senderRole === 'admin' && type === 'text') add('✏️ ویرایش پیام', 'edit', false);
    add('🗑 حذف برای هر دو', 'delete', true);
    document.body.appendChild(menu);
    var rect = msgEl.getBoundingClientRect();
    var left = Number.isFinite(x) ? x : rect.left + 12;
    var top = Number.isFinite(y) ? y : rect.bottom;
    var w = menu.offsetWidth || 180, h = menu.offsetHeight || 100;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, left)) + 'px';
    menu.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, top)) + 'px';
  }
  function bindFleetMessageActions(holder, tripId) {
    if (!holder || holder.dataset.messageActionsBound === '1') return;
    holder.dataset.messageActionsBound = '1';
    var holdTimer = null, holdMsg = null;
    function clearHold() { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; holdMsg = null; }
    holder.addEventListener('contextmenu', function(ev) {
      var msg = ev.target.closest('.fl-chat-msg'); if (!msg) return;
      ev.preventDefault(); clearHold(); openFleetMessageMenu(msg, ev.clientX, ev.clientY, tripId);
    });
    holder.addEventListener('pointerdown', function(ev) {
      if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
      if (ev.target.closest('audio,button,a,input,textarea')) return;
      var msg = ev.target.closest('.fl-chat-msg'); if (!msg) return;
      clearHold(); holdMsg = msg;
      holdTimer = setTimeout(function(){ var target = holdMsg; holdTimer = null; holdMsg = null; if (target && target.isConnected) openFleetMessageMenu(target, ev.clientX, ev.clientY, tripId); }, 520);
    });
    if (!fleetMessageGlobalEventsBound) {
      fleetMessageGlobalEventsBound = true;
      document.addEventListener('pointerup', function(){ var h = document.querySelector('#flChatMessages'); if (h && h._fleetClearHold) h._fleetClearHold(); }, true);
      document.addEventListener('pointercancel', function(){ var h = document.querySelector('#flChatMessages'); if (h && h._fleetClearHold) h._fleetClearHold(); }, true);
      document.addEventListener('pointerdown', function(ev) { var menu = $('flChatActionMenu'); if (menu && !menu.contains(ev.target) && !ev.target.closest('[data-message-more]')) closeFleetMessageMenu(); }, true);
    }
    holder._fleetClearHold = clearHold;
    holder.addEventListener('click', function(ev) {
      var more = ev.target.closest('[data-message-more]'); if (!more) return;
      ev.preventDefault(); ev.stopPropagation();
      var msg = more.closest('.fl-chat-msg'); if (!msg) return;
      var r = more.getBoundingClientRect(); openFleetMessageMenu(msg, r.left, r.bottom + 3, tripId);
    });
  }

  function compressAdminChatImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('خواندن فایل تصویر ناموفق بود.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { resolve(String(reader.result || '')); };
        img.onload = function () {
          try {
            var maxDim = 1400;
            var w = img.width || 800, h = img.height || 600;
            if (w > maxDim || h > maxDim) {
              if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
              else { w = Math.round(w * (maxDim / h)); h = maxDim; }
            }
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', 0.82));
          } catch (_) {
            resolve(String(reader.result || ''));
          }
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function pickAndSendAdminChatPhoto(tripId, useCamera, loadConversation) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (useCamera) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      var captionEl = $('flChatText');
      var caption = String(captionEl && captionEl.value || '').trim();
      toast('در حال آماده‌سازی و ارسال تصویر…', 'info');
      compressAdminChatImage(file).then(function (dataUrl) {
        return api('chat/photo', 'POST', {
          tripId: tripId,
          dataUrl: dataUrl,
          caption: caption,
          fileName: file.name || 'chat-photo.jpg'
        });
      }).then(function () {
        if (captionEl) captionEl.value = '';
        toast('📷 تصویر برای راننده ارسال شد.');
        modalLastSignature = null;
        if (loadConversation) loadConversation();
      }).catch(function (e) {
        toast('ارسال تصویر ناموفق بود: ' + e.message, 'error');
      });
    };
    inp.click();
  }

  function showChat(tripId) {
    if (!isAdmin()) return;
    var t = F.trips.filter(function (x) { return x.id === tripId; })[0];
    var canSend = !!(t && (t.status === 'planned' || t.status === 'active'));
    openModal('<h3>💬 گفت‌وگو با راننده — ' + esc(t ? (t.vehicleLabel || t.vehicleKey) : 'سفر') + '</h3>'
      + '<div class="sub" style="font-size:12px;line-height:1.9">پیام متنی، عکس و ویس در یک صفحه؛ ✓ یعنی تحویل‌شده و ✓✓ یعنی خوانده‌شده. با ارسال پیام جدید، اعلان فوری روی گوشی راننده نمایش داده می‌شود.</div>'
      + '<div id="flChatMessages"><div class="fl-empty">در حال دریافت گفت‌وگو…</div></div>'
      + (canSend ? '<div class="sub" style="font-size:11px;line-height:1.8;margin:4px 0">می‌توانید پیام متنی، عکس با دوربین، تصویر از گالری یا ویس صوتی ارسال کنید.</div>'
      + '<form id="flChatForm" style="margin-top:8px"><textarea id="flChatText" maxlength="2000" placeholder="پیام یا توضیح عکس خود را بنویسید…"></textarea>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="fl-btn" type="button" id="flVoiceRecord">🎙 نگه‌دار برای ضبط</button>'
      + '<button class="fl-btn" type="button" id="flChatCameraBtn">📷 دوربین</button>'
      + '<button class="fl-btn" type="button" id="flChatPhotoBtn">🖼️ ارسال عکس</button>'
      + '</div>'
      + '<button class="fl-btn pri" id="flChatSend" type="submit">ارسال پیام</button></div>' + (voiceDraftBlob && voiceTripId === tripId ? '<div style="margin-top:8px"><b>پیش‌نمایش ویس آمادهٔ ارسال</b><audio id="flVoicePreview" controls style="width:100%"></audio><button class="fl-btn" type="button" id="flVoiceCancel">حذف ضبط</button><button class="fl-btn pri" type="button" id="flVoiceSend">ارسال ویس</button></div>' : '') + '</form>' : '<div class="sub" style="margin-top:8px">این سفر پایان یافته است؛ پیام‌های قبلی قابل مشاهده‌اند اما ارسال پیام جدید غیرفعال است.</div>') + CLOSE);
    pollingTripId = tripId; modalLastSignature = null;
    function loadConversation() {
      if (pollingTripId !== tripId || !$('flChatMessages')) return Promise.resolve();
      return api('conversation?tripId=' + encodeURIComponent(tripId)).then(function (j) {
        if (pollingTripId !== tripId || !$('flChatMessages')) return;
        var messages = j.messages || [], signature = messages.map(function (m) { return m.id + ':' + (m.type || '') + ':' + (m.deliveredMs || '') + ':' + (m.readMs || '') + ':' + (m.editedMs || '') + ':' + (m.text || ''); }).join('|');
        if (signature !== modalLastSignature) {
          modalLastSignature = signature;
          $('flChatMessages').innerHTML = conversationMessagesHtml(messages);
          var list = $('flChatMessages').querySelector('.fl-chat-list'); if (list) list.scrollTop = list.scrollHeight;
        }
        // باز بودن پنجره به معنی خوانده‌شدن پیام‌های ورودی است؛ شمارندهٔ همان سفر را هم فوری صفر می‌کنیم.
        return api('conversation/read', 'POST', { tripId: tripId }).then(function () {
          var hadUnread = (Number(F.unreadByTrip[tripId]) || 0) > 0;
          F.unreadByTrip[tripId] = 0;
          if (hadUnread) render();
        }).catch(function () {});
      }).catch(function (e) { if (modalLastSignature === null && $('flChatMessages')) $('flChatMessages').innerHTML = '<div class="fl-warn">' + esc(e.message) + '</div>'; });
    }
    bindFleetMessageActions($('flChatMessages'), tripId);
    activeConversationRefresh = loadConversation;
    var form = $('flChatForm');
    if (form) form.onsubmit = function (ev) {
      ev.preventDefault();
      var input = $('flChatText'), button = $('flChatSend'), text = String(input && input.value || '').trim();
      if (!text) { if (input) input.focus(); return; }
      if (button) { button.disabled = true; button.textContent = 'در حال ارسال…'; }
      api('chat/send', 'POST', { tripId: tripId, text: text }).then(function () {
        if (input) input.value = '';
        toast('پیام ارسال شد.'); modalLastSignature = null; return loadConversation();
      }).catch(function (e) { toast('ارسال پیام ناموفق بود: ' + e.message, 'error'); })
        .then(function () { if (button) { button.disabled = false; button.textContent = 'ارسال پیام'; } });
    };
    var input = $('flChatText');
    if (input) input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); if (form && form.requestSubmit) form.requestSubmit(); else if (form && form.onsubmit) form.onsubmit(ev); } });
    var recordBtn = $('flVoiceRecord'); if (recordBtn) {
      recordBtn.style.touchAction = 'none'; recordBtn.style.userSelect = 'none'; recordBtn.style.webkitUserSelect = 'none';
      recordBtn.onpointerdown = function (ev) {
        ev.preventDefault();
        if (voiceDraftBlob) { toast('ابتدا ویس آماده را ارسال یا حذف کنید.', 'info'); return; }
        var isMouse = ev.pointerType === 'mouse';
        if (isMouse && voiceRecorder) { stopAdminRecording(); return; }
        voicePressActive = true;
        try { if (recordBtn.setPointerCapture && ev.pointerId != null) recordBtn.setPointerCapture(ev.pointerId); } catch (_) {}
        if (!voiceRecorder) toggleAdminRecording(tripId, !isMouse);
      };
      recordBtn.onpointerup = function (ev) { ev.preventDefault(); if (ev.pointerType === 'mouse') return; voicePressActive = false; if (voiceRecorder) stopAdminRecording(); };
      recordBtn.onpointercancel = function () { voicePressActive = false; if (voiceRecorder) stopAdminRecording(); };
      recordBtn.oncontextmenu = function(ev){ev.preventDefault();};
    }
    var camBtn = $('flChatCameraBtn'); if (camBtn) camBtn.onclick = function () { pickAndSendAdminChatPhoto(tripId, true, loadConversation); };
    var photoBtn = $('flChatPhotoBtn'); if (photoBtn) photoBtn.onclick = function () { pickAndSendAdminChatPhoto(tripId, false, loadConversation); };
    var preview = $('flVoicePreview'); if (preview && voiceDraftBlob) preview.src = URL.createObjectURL(voiceDraftBlob);
    var sendVoice = $('flVoiceSend'); if (sendVoice) sendVoice.onclick = function(){ sendAdminVoiceDraft(tripId); };
    var cancelVoice = $('flVoiceCancel'); if (cancelVoice) cancelVoice.onclick = function(){ voiceDraftBlob=null; voiceDraftDuration=0; modalLastSignature=null; showChat(tripId); };
    loadConversation();
    modalPollTimer = setInterval(loadConversation, 4000);
  }

  function fileToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader(); r.onload = function () { resolve(String(r.result || '')); }; r.onerror = function () { reject(new Error('خواندن فایل صوتی ناموفق بود.')); }; r.readAsDataURL(blob);
    });
  }
  function toggleAdminRecording(tripId, holdToRecord) {
    if (voiceRecorder) { stopAdminRecording(); return; }
    if (voiceRequestPending) { voiceStopRequested = true; return; }
    if (voiceDraftBlob) { voicePressActive = false; toast('ابتدا ویس آماده را ارسال یا حذف کنید.', 'info'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { voicePressActive = false; toast('ضبط صدا در این مرورگر پشتیبانی نمی‌شود؛ داشبورد را با HTTPS و مرورگر به‌روز باز کنید.', 'error'); return; }
    voiceRequestPending = true; voiceStopRequested = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      voiceRequestPending = false;
      // Release on mobile or a second desktop click while the permission prompt was open cancels this attempt.
      if ((holdToRecord && !voicePressActive) || voiceStopRequested) { voiceStopRequested = false; voicePressActive = false; stream.getTracks().forEach(function (x) { x.stop(); }); return; }
      voiceStream = stream; voiceTripId = tripId; voiceChunks = []; voiceStartedAt = Date.now();
      var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
      var opt = {}; for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) { opt.mimeType = types[i]; break; }
      var rec = new MediaRecorder(stream, opt); voiceRecorder = rec;
      rec.ondataavailable = function (e) { if (e.data && e.data.size) voiceChunks.push(e.data); };
      rec.onstop = function () {
        if (voiceStopTimer) clearTimeout(voiceStopTimer); voiceStopTimer = null;
        var blob = new Blob(voiceChunks, { type: rec.mimeType || 'audio/webm' }), duration = Date.now() - voiceStartedAt;
        if (voiceStream) voiceStream.getTracks().forEach(function (x) { x.stop(); });
        voiceStream = null; voiceRecorder = null; voiceChunks = []; voicePressActive = false;
        var b = $('flVoiceRecord'); if (b) { b.classList.remove('fl-recording'); b.textContent = '🎙 ضبط ویس'; }
        if (!blob.size) { toast('صدایی ضبط نشد؛ کمی بیشتر نگه دارید و دوباره تلاش کنید.', 'error'); return; }
        if (blob.size > 8 * 1024 * 1024) { toast('حجم صدا بیش از ۸ مگابایت است؛ پیام کوتاه‌تری ضبط کنید.', 'error'); return; }
        voiceDraftBlob = blob; voiceDraftDuration = duration; modalLastSignature = null;
        showChat(tripId);
      };
      rec.start(); var btn = $('flVoiceRecord'); if (btn) { btn.classList.add('fl-recording'); btn.textContent = holdToRecord ? '🔴 ضبط… رها کنید' : '🔴 ضبط… برای توقف دوباره کلیک کنید'; btn.style.touchAction = 'none'; }
      voiceStopTimer = setTimeout(function () { if (voiceRecorder === rec && rec.state !== 'inactive') { voicePressActive = false; stopAdminRecording(); } }, 120000);
    }).catch(function (e) { voiceRequestPending = false; voiceStopRequested = false; voicePressActive = false; toast('دسترسی به میکروفون برقرار نشد: ' + (e.message || 'اجازهٔ میکروفون را فعال کنید.'), 'error'); });
  }
  function stopAdminRecording() { if (voiceStopTimer) clearTimeout(voiceStopTimer); voiceStopTimer = null; voicePressActive = false; if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop(); }
  function sendAdminVoiceDraft(tripId) {
    if (!voiceDraftBlob || voiceTripId !== tripId) return;
    var blob = voiceDraftBlob, duration = voiceDraftDuration, btn = $('flVoiceSend'); if (btn) { btn.disabled = true; btn.textContent = 'در حال ارسال…'; }
    fileToDataUrl(blob).then(function(dataUrl){return api('voice/send','POST',{tripId:tripId,dataUrl:dataUrl,mimeType:blob.type||'audio/webm',durationMs:duration});})
      .then(function(){voiceDraftBlob=null;voiceDraftDuration=0;modalLastSignature=null;showChat(tripId);toast('پیام صوتی ارسال شد.');})
      .catch(function(e){toast('ارسال پیام صوتی ناموفق بود: '+e.message,'error');}).then(function(){var b=$('flVoiceSend');if(b)b.disabled=false;});
  }
  function showAddStop(tripId) {
    if (!isAdmin()) return;
    openModal('<h3>➕ افزودن توقف متفرقه به مسیر</h3><div class="sub" style="font-size:12px;line-height:1.9;margin-bottom:8px">این توقف به فاکتور نیاز ندارد و مستقیم به سفر همین ماشین اضافه می‌شود؛ راننده در پرتال خود آن را می‌بیند.</div>'
      + '<form id="flAddStopForm"><label>نام مقصد / محل</label><input class="fl-input-wide" id="flAddTitle" required placeholder="مثلاً انبار شورآباد">'
      + '<label>شرح کار</label><input class="fl-input-wide" id="flAddTask" required placeholder="مثلاً دریافت کیسه مواد">'
      + '<label>آدرس یا راهنما (اختیاری)</label><input class="fl-input-wide" id="flAddAddress" placeholder="آدرس، پلاک یا توضیح برای راننده">'
      + '<label>مختصات جغرافیایی (اختیاری)</label><input class="fl-input-wide" id="flAddCoord" dir="ltr" placeholder="35.700000, 51.400000">'
      + '<div id="flAddStopMsg" style="min-height:22px;font-size:12px"></div><button class="fl-btn pri" type="submit" style="width:100%;padding:11px">ثبت توقف در مسیر</button></form>' + CLOSE);
    $('flAddStopForm').onsubmit = function (e) {
      e.preventDefault(); var coord = $('flAddCoord').value.trim(), ll = null;
      if (coord) { var mm = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(coord); if (!mm || Math.abs(Number(mm[1])) > 90 || Math.abs(Number(mm[2])) > 180) { $('flAddStopMsg').textContent = 'مختصات باید به شکل عرض، طول باشد؛ نمونه: 35.700000, 51.400000'; $('flAddStopMsg').className = 'fl-bad'; return; } ll = [Number(mm[1]), Number(mm[2])]; }
      var b = $('flAddStopForm').querySelector('button[type=submit]'); b.disabled = true; $('flAddStopMsg').textContent = 'در حال ثبت…';
      api('trip/add-stop', 'POST', { tripId: tripId, title: $('flAddTitle').value.trim(), task: $('flAddTask').value.trim(), address: $('flAddAddress').value.trim(), lat: ll ? ll[0] : null, lng: ll ? ll[1] : null })
        .then(function () {
          toast('ماموریت متفرقه ثبت شد و اعلان به راننده ارسال گردید.');
          closeModal();
          poll(true);
          if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
        })
        .catch(function (err) { $('flAddStopMsg').textContent = err.message; $('flAddStopMsg').className = 'fl-bad'; b.disabled = false; });
    };
  }

  function getTodayJalaliStr() {
    try {
      if (typeof window.todayStr === 'string' && window.todayStr) return normDate(window.todayStr);
      if (window.__lastPlan && window.__lastPlan.date) return normDate(window.__lastPlan.date);
      return normDate(new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    } catch (e) {
      return normDate(new Date().toLocaleDateString('fa-IR'));
    }
  }

  function normPlanDateStr(dStr) {
    var raw = String(dStr || '').trim();
    if (!raw) raw = getTodayJalaliStr();
    return normDate(raw);
  }

  function ensureModalReady() {
    injectCss();
    if (!$('flModal')) {
      var m = document.createElement('div');
      m.id = 'flModal';
      m.innerHTML = '<div class="bx" id="flBox"></div>';
      m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
      document.body.appendChild(m);
    }
  }

  function openMiscMissionModal(defaultVehicleKey) {
    if (!canWrite() && !isAdmin()) { toast('این حساب فقط اجازهٔ مشاهده دارد.', 'error'); return; }
    build();
    ensureModalReady();
    var vehKeys = ['nissan', 'paykan', 'pride1', 'pride2'];
    var vehLabels = (window.VEHICLE_LABELS) || { nissan: 'وانت نیسان', paykan: 'وانت پیکان', pride1: 'وانت پراید 1', pride2: 'وانت پراید 2' };
    var selVeh = defaultVehicleKey && vehKeys.indexOf(defaultVehicleKey) >= 0 ? defaultVehicleKey : 'pride1';
    var selDateEl = document.getElementById('planDateFilter');
    var curDate = normPlanDateStr((selDateEl && selDateEl.value) ? selDateEl.value : getTodayJalaliStr());
    var optsHtml = vehKeys.map(function (k) {
      var drv = typeof window.getVehicleDriverName === 'function' ? window.getVehicleDriverName(k) : '';
      var lbl = '🚚 فقط ' + (vehLabels[k] || k) + (drv ? ' — راننده: ' + drv : ' (راننده تعیین‌نشده)');
      return '<option value="' + esc(k) + '"' + (k === selVeh ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('') + '<option value="all"' + (defaultVehicleKey === 'all' ? ' selected' : '') + '>🌐 کل خودروها و تمام رانندگان (ارسال هم‌زمان برای همه)</option>';
    openModal(
      '<h3>📌 ثبت ماموریت متفرقه برای راننده (بدون نیاز به فاکتور)</h3>'
      + '<div class="sub" style="font-size:12px;line-height:1.9;margin-bottom:10px">حتی زمانی که هیچ فاکتوری برای ارسال وجود ندارد، می‌توانید برای هر خودرو و راننده ماموریت متفرقه ثبت کنید. به محض ثبت، <b>اعلان فوری (Push Notification)</b> حتی در حالت بسته بودن برنامه و قفل بودن صفحهٔ گوشی برای راننده ارسال می‌شود.</div>'
      + '<form id="flMiscMissionForm">'
      + '<label>خودرو و رانندهٔ ماموریت</label>'
      + '<select class="fl-input-wide" id="flMiscVehicle" style="margin:6px 0 10px">' + optsHtml + '</select>'
      + '<label>تاریخ اعزام (شمسی)</label>'
      + '<input class="fl-input-wide" id="flMiscDate" dir="ltr" required value="' + esc(curDate) + '" placeholder="1405/08/04">'
      + '<label>نام مقصد / محل ماموریت</label>'
      + '<input class="fl-input-wide" id="flMiscTitle" required placeholder="مثلاً انبار شورآباد، بانک، دفتر مرکزی و...">'
      + '<label>شرح ماموریت / دستور کار</label>'
      + '<input class="fl-input-wide" id="flMiscTask" required placeholder="مثلاً دریافت کیسه مواد اولیه یا تحویل امانت">'
      + '<label>آدرس یا راهنمای مسیر (اختیاری)</label>'
      + '<input class="fl-input-wide" id="flMiscAddress" placeholder="آدرس، پلاک یا توضیح تکمیلی برای راننده">'
      + '<label>مختصات جغرافیایی مقصد (اختیاری)</label>'
      + '<input class="fl-input-wide" id="flMiscCoord" dir="ltr" placeholder="35.700000, 51.400000">'
      + '<div id="flMiscMsg" style="min-height:22px;font-size:12px;margin-top:4px"></div>'
      + '<button class="fl-btn pri" type="submit" style="width:100%;padding:12px;font-size:14px;background:#db2777;border-color:#db2777">🚀 ثبت ماموریت و ارسال اعلان فوری به راننده</button>'
      + '</form>' + CLOSE
    );
    $('flMiscMissionForm').onsubmit = function (e) {
      e.preventDefault();
      var vk = $('flMiscVehicle').value;
      var vLabel = vehLabels[vk] || vk;
      var pDate = normPlanDateStr($('flMiscDate').value);
      var title = $('flMiscTitle').value.trim();
      var task = $('flMiscTask').value.trim();
      var addr = $('flMiscAddress').value.trim();
      var coord = $('flMiscCoord').value.trim(), ll = null;
      if (coord) {
        var mm = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(coord);
        if (!mm || Math.abs(Number(mm[1])) > 90 || Math.abs(Number(mm[2])) > 180) {
          $('flMiscMsg').textContent = 'مختصات باید به شکل عرض، طول باشد؛ نمونه: 35.700000, 51.400000';
          $('flMiscMsg').className = 'fl-bad';
          return;
        }
        ll = [Number(mm[1]), Number(mm[2])];
      }
      var btn = $('flMiscMissionForm').querySelector('button[type=submit]');
      btn.disabled = true;
      $('flMiscMsg').textContent = 'در حال ثبت ماموریت و ارسال اعلان به گوشی راننده…';
      $('flMiscMsg').className = '';
      var targetKeys = vk === 'all' ? vehKeys.slice() : [vk];
      Promise.all(targetKeys.map(function (k) {
        return api('trip/add-stop', 'POST', {
          vehicleKey: k,
          vehicleLabel: vehLabels[k] || k,
          planDate: pDate,
          origin: parseOrigin(),
          title: title,
          task: task,
          address: addr,
          lat: ll ? ll[0] : null,
          lng: ll ? ll[1] : null
        });
      })).then(function () {
        toast(vk === 'all'
          ? '🚀 ماموریت متفرقه برای کل خودروها و رانندگان ثبت و اعلان فوری ارسال گردید.'
          : '🚀 ماموریت متفرقه برای «' + (vehLabels[vk] || vk) + '» ثبت شد و اعلان فوری برای راننده ارسال گردید.');
        closeModal();
        if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
        if (F.open) poll(true);
      }).catch(function (err) {
        $('flMiscMsg').textContent = err.message || 'خطا در ثبت ماموریت';
        $('flMiscMsg').className = 'fl-bad';
        btn.disabled = false;
      });
    };
  }
  window.__flOpenMiscMission = openMiscMissionModal;

  window.deleteFleetMiscMission = function (stopId) {
    if (!isAdmin()) return;
    if (!confirm('این ماموریت متفرقه حذف شود؟')) return;
    api('trip/delete-stop', 'POST', { stopId: stopId }).then(function () {
      toast('ماموریت متفرقه حذف شد.');
      if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
      if (F.open) poll(true);
    }).catch(function (e) { toast(e.message || 'خطا در حذف ماموریت', 'error'); });
  };
  function showLocationSuggestions() {
    if (!isAdmin()) return;
    openModal('<h3>📍 پیشنهادهای لوکیشن رانندگان</h3><div class="fl-empty">در حال دریافت…</div>' + CLOSE);
    api('location-suggestions').then(function (j) {
      var rows = j.suggestions || [];
      var html = rows.map(function (s) {
        return '<div class="fl-card" style="margin:8px 0;border-right-color:#f59e0b"><div class="h"><b>' + esc(s.party) + '</b><span class="fl-chip ' + (s.status === 'pending' ? 'planned' : 'finished') + '">' + (s.status === 'pending' ? 'در انتظار تأیید' : s.status === 'approved' ? 'تأیید شد' : 'رد شد') + '</span></div>'
          + '<div class="sub">ماشین: ' + esc(s.vehicleLabel) + ' · راننده: ' + esc(s.driverName) + ' · ' + hhmm(s.createdMs) + '</div>'
          + (s.note ? '<div style="margin-top:5px">توضیح راننده: ' + esc(s.note) + '</div>' : '')
          + '<div dir="ltr" style="font-size:12px;margin-top:5px">' + Number(s.lat).toFixed(6) + ', ' + Number(s.lng).toFixed(6) + '</div>'
          + '<div class="fl-act"><a class="fl-btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + encodeURIComponent(s.lat + ',' + s.lng) + '">نمایش روی نقشه</a>'
          + (s.status === 'pending' ? '<button class="fl-btn pri" data-loc-review="approve" data-id="' + s.id + '">تأیید و ثبت</button><button class="fl-btn red" data-loc-review="reject" data-id="' + s.id + '">رد پیشنهاد</button>' : '') + '</div></div>';
      }).join('');
      $('flBox').innerHTML = '<h3>📍 پیشنهادهای لوکیشن رانندگان</h3>' + (html || '<div class="fl-empty">پیشنهاد در انتظار تأییدی وجود ندارد.</div>') + CLOSE;
      Array.prototype.forEach.call($('flBox').querySelectorAll('[data-loc-review]'), function (b) {
        b.onclick = function () {
          var decision = b.getAttribute('data-loc-review'), id = b.getAttribute('data-id');
          if (decision === 'approve' && !confirm('مختصات این مقصد تأیید شود؟ لوکیشن ذخیره‌شدهٔ مشتری برای برنامه‌ریزی‌های بعدی هم اصلاح می‌شود.')) return;
          b.disabled = true;
          api('location-suggestion/review', 'POST', { id: id, decision: decision }).then(function (r) {
            toast(decision === 'approve' ? (r.masterSaved ? 'لوکیشن تأیید شد و برای برنامه‌ریزی‌های بعدی ذخیره شد.' : 'لوکیشن توقف تأیید شد.') : 'پیشنهاد رد شد.');
            poll(true); showLocationSuggestions();
          }).catch(function (e) { b.disabled = false; toast(e.message, 'error'); });
        };
      });
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }

  function showHistory() {
    openModal('<div class="fl-empty">در حال دریافت…</div>');
    api('history').then(function (j) {
      var rows = (j.trips || []).map(function (t) { return '<tr><td>' + esc(t.planDate) + '</td><td>' + esc(t.vehicleLabel || t.vehicleKey) + '</td><td>' + esc(t.driverName || '—') + '</td><td>' + fa(t.delivered) + ' از ' + fa(t.stops) + (t.failed ? ' <span class="fl-bad">(' + fa(t.failed) + ' ناموفق)</span>' : '') + '</td><td>' + fa(Math.round(t.totalKg || 0)) + '</td><td>' + TRIP_FA[t.status] + '</td><td><button class="fl-btn" onclick="__flDetail(\'' + t.id + '\')">جزئیات</button></td></tr>'; }).join('');
      openModal('<h3>تاریخچهٔ سفرها (۶۰ مورد اخیر)</h3><div style="overflow:auto"><table><thead><tr><th>برنامه</th><th>ماشین</th><th>راننده</th><th>تحویل</th><th>کیلو</th><th>وضعیت</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="fl-empty">سفر بسته‌شده‌ای نیست.</td></tr>') + '</tbody></table></div>' + CLOSE);
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }
  // ───── گزارش پایان روز ─────
  function normDate(d) { return String(d || '').trim().replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 1776); }).split('/').map(function (x, i) { return i ? ('0' + x).slice(-2) : x; }).join('/'); }
  function minsBetween(a, b) { return a && b ? Math.max(0, Math.round((b - a) / 60000)) : null; }
  function reportModel(trips) {
    var T = { trips: 0, stops: 0, ok: 0, fail: 0, left: 0, kgOk: 0, kgAll: 0, km: 0, dwell: 0, dwellN: 0, reasons: {} }, rows = [];
    trips.forEach(function (t) {
      if (t.status === 'cancelled') return;
      T.trips++; T.km += t.drivenKm || 0;
      t.stops.forEach(function (s, i) {
        T.stops++; T.kgAll += s.kg || 0;
        if (s.status === 'delivered') { T.ok++; T.kgOk += s.kg || 0; } else if (s.status === 'failed') { T.fail++; var r = s.failReason || 'بدون دلیل'; T.reasons[r] = (T.reasons[r] || 0) + 1; } else T.left++;
        var d = minsBetween(s.arrivedMs, s.doneMs); if (d != null) { T.dwell += d; T.dwellN++; }
        rows.push({ trip: t, stop: s, n: i + 1, dwell: d });
      });
    });
    return { T: T, rows: rows };
  }
  function reportRowsHtml(trips, tok, forPrint) {
    return trips.filter(function (t) { return t.status !== 'cancelled'; }).map(function (t) {
      var done = t.stops.filter(function (s) { return s.status === 'delivered'; }).length, fail = t.stops.filter(function (s) { return s.status === 'failed'; }).length;
      var body = t.stops.map(function (s, i) {
        var d = minsBetween(s.arrivedMs, s.doneMs), con = [s.carrier, s.contactName, s.phone].filter(Boolean).map(esc).join(' · ');
        return '<tr><td>' + fa(i + 1) + '</td><td><b>' + esc(s.party) + '</b>' + (con ? '<div style="font-size:10px;opacity:.75">' + con + '</div>' : '') + '<div style="font-size:10px;opacity:.7">فاکتور ' + s.items.map(function (x) { return esc(x.number); }).join('، ') + '</div></td><td>' + fa(Math.round(s.kg)) + '</td>'
          + '<td class="' + (s.status === 'delivered' ? 'fl-ok' : s.status === 'failed' ? 'fl-bad' : '') + '">' + STOP_FA[s.status] + (s.failReason ? '<div style="font-weight:400">' + esc(s.failReason) + '</div>' : '') + (s.note ? '<div style="font-weight:400;opacity:.8">' + esc(s.note) + '</div>' : '') + '</td>'
          + '<td>' + hhmm(s.arrivedMs) + '</td><td>' + hhmm(s.doneMs) + '</td><td>' + (d != null ? fa(d) + ' د' : '—') + '</td>'
          + '<td>' + (s.hasPhoto ? (forPrint ? '✔ دارد' : '<a target="_blank" href="/api/dashboard-fleet/photo?stop=' + s.id + '&t=' + encodeURIComponent(tok) + '">📷</a>') : '') + '</td></tr>';
      }).join('');
      return '<h4 style="margin:14px 0 4px">🚚 ' + esc(t.vehicleLabel || t.vehicleKey) + ' — ' + esc(t.driverName || 'بدون راننده') + ' <span class="fl-chip ' + t.status + '">' + TRIP_FA[t.status] + '</span></h4>'
        + '<div style="font-size:12px;opacity:.8;margin-bottom:4px">تحویل ' + fa(done) + ' از ' + fa(t.stops.length) + (fail ? ' · <span class="fl-bad">' + fa(fail) + ' ناموفق</span>' : '') + ' · شروع ' + hhmm(t.startedMs) + ' · پایان ' + hhmm(t.finishedMs) + ' · ' + fa(t.drivenKm || 0) + ' کیلومتر · ' + fa(Math.round(t.totalKg || 0)) + ' کیلو</div>'
        + '<div style="overflow:auto"><table><thead><tr><th>#</th><th>مشتری / تماس</th><th>کیلو</th><th>وضعیت</th><th>رسیدن</th><th>پایان</th><th>توقف</th><th>رسید</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    }).join('');
  }
  function showReport(dateStr) {
    var date = normDate(dateStr || (typeof todayStr !== 'undefined' ? todayStr : ''));
    openModal('<h3>گزارش پایان روز</h3><div class="fl-empty">در حال دریافت…</div>');
    api('report?date=' + encodeURIComponent(date)).then(function (j) {
      var m = reportModel(j.trips || []), T = m.T, tok = (window.__dashToken && window.__dashToken()) || '';
      var kpi = function (l, v, c) { return '<div style="flex:1 1 120px;background:var(--bg-main);border:1px solid var(--border);border-radius:10px;padding:8px 10px;text-align:center"><div style="font-size:10px;opacity:.7">' + l + '</div><div style="font-size:18px;font-weight:900;' + (c ? 'color:' + c : '') + '">' + v + '</div></div>'; };
      var reasons = Object.keys(T.reasons).map(function (r) { return esc(r) + ' (' + fa(T.reasons[r]) + ')'; }).join('، ');
      var head = '<h3>گزارش پایان روز — ' + esc(date) + '</h3><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><input id="flRepDate" value="' + esc(date) + '" dir="ltr" style="width:110px;text-align:center" placeholder="1405/07/30"><button class="fl-btn" id="flRepGo">نمایش</button><button class="fl-btn" id="flRepPrint">چاپ</button><button class="fl-btn" id="flRepCsv">خروجی CSV</button></div>';
      var body = !T.trips ? '<div class="fl-empty">برای این تاریخ سفری ثبت نشده است. (تاریخ را با قالب ۱۴۰۵/۰۷/۳۰ وارد کنید.)</div>'
        : '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + kpi('ماشین', fa(T.trips)) + kpi('توقف', fa(T.stops)) + kpi('تحویل شد', fa(T.ok), '#16a34a') + kpi('تحویل نشد', fa(T.fail), T.fail ? '#dc2626' : '') + kpi('مانده', fa(T.left), T.left ? '#d97706' : '') + kpi('کیلو تحویل‌شده', fa(Math.round(T.kgOk)) + ' از ' + fa(Math.round(T.kgAll))) + kpi('کیلومتر', fa(Math.round(T.km))) + kpi('میانگین توقف', T.dwellN ? fa(Math.round(T.dwell / T.dwellN)) + ' د' : '—') + '</div>'
          + (reasons ? '<div class="fl-warn" style="margin-bottom:6px">دلایل تحویل‌نشدن: ' + reasons + '</div>' : '') + reportRowsHtml(j.trips || [], tok, false);
      openModal(head + body + CLOSE);
      $('flRepGo').onclick = function () { showReport($('flRepDate').value); };
      $('flRepPrint').onclick = function () {
        var w = window.open('', '_blank'); if (!w) return;
        w.document.write('<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>گزارش پایان روز ' + esc(date) + '</title><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:14mm}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #444;padding:4px 6px;text-align:center}td:nth-child(2){text-align:right}h4{margin:12px 0 4px}.fl-ok{color:#15803d;font-weight:700}.fl-bad{color:#b91c1c;font-weight:700}.fl-chip{font-size:10px;border:1px solid #888;border-radius:8px;padding:1px 6px}@page{size:A4 landscape;margin:10mm}</style></head><body><h2>گزارش پایان روز — ' + esc(date) + '</h2><p>ماشین: ' + fa(T.trips) + ' · توقف: ' + fa(T.stops) + ' · تحویل شد: ' + fa(T.ok) + ' · تحویل نشد: ' + fa(T.fail) + ' · مانده: ' + fa(T.left) + ' · کیلو تحویل‌شده: ' + fa(Math.round(T.kgOk)) + ' از ' + fa(Math.round(T.kgAll)) + ' · کیلومتر: ' + fa(Math.round(T.km)) + '</p>' + (reasons ? '<p>دلایل تحویل‌نشدن: ' + reasons + '</p>' : '') + reportRowsHtml(j.trips || [], '', true) + '</body></html>');
        w.document.close(); setTimeout(function () { w.print(); }, 400);
      };
      $('flRepCsv').onclick = function () {
        var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var out = [['تاریخ', 'ماشین', 'راننده', 'ردیف', 'مشتری', 'باربری', 'طرف تماس', 'شماره تماس', 'فاکتورها', 'کیلو', 'وضعیت', 'دلیل', 'رسیدن', 'پایان', 'توقف (دقیقه)', 'عکس رسید']];
        m.rows.forEach(function (r) { var s = r.stop; out.push([date, r.trip.vehicleLabel || r.trip.vehicleKey, r.trip.driverName || '', r.n, s.party, s.carrier, s.contactName, s.phone, s.items.map(function (x) { return x.number; }).join(' '), Math.round(s.kg), STOP_FA[s.status], s.failReason || '', s.arrivedMs ? hhmm(s.arrivedMs) : '', s.doneMs ? hhmm(s.doneMs) : '', r.dwell == null ? '' : r.dwell, s.hasPhoto ? 'دارد' : '']); });
        var blob = new Blob(['\ufeff' + out.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'گزارش_پایان_روز_' + date.replace(/\//g, '-') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      };
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }
  window.__flDetail = showDetail;
  function vehicleOptions(sel) {
    var L2 = (typeof VEHICLE_LABELS !== 'undefined' && VEHICLE_LABELS) || { pride1: 'پراید ۱', pride2: 'پراید ۲', paykan: 'پیکان', nissan: 'نیسان', khavar: 'خاور' };
    return '<option value="">— بدون ماشین —</option>' + Object.keys(L2).filter(function (k) { return k !== 'pickup'; }).map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(L2[k]) + '</option>'; }).join('');
  }
  // رانندگان همان کاربران داشبورد با نقش «راننده» هستند؛ ساخت/رمز/حذف از API کاربران، و ماشین از ماژول ناوگان.
  function usersApi(path, method, body) {
    return fetch('/api/auth/users' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'company=rojin-dash', { method: method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + ((window.__dashToken && window.__dashToken()) || '') }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) throw new Error(j.message || ('خطا ' + r.status)); return j; }); });
  }
  function showDrivers() {
    if (!isAdmin()) return;
    api('drivers').then(function (j) {
      if (typeof window.applyFleetDriversList === 'function' && j && j.drivers) window.applyFleetDriversList(j.drivers);
      var rows = (j.drivers || []).map(function (d) {
        return '<tr data-name="' + esc(d.name) + '"><td><b>' + esc(d.name) + '</b></td><td><select data-f="vehicle">' + vehicleOptions(d.vehicle) + '</select></td><td><input data-f="pass" type="text" placeholder="رمز جدید (اختیاری)" style="width:115px" autocomplete="off"></td>'
          + '<td><label><input type="checkbox" data-f="active" ' + (d.active ? 'checked' : '') + '> فعال</label></td><td style="white-space:nowrap"><button class="fl-btn pri" data-d="save">ذخیره</button> <button class="fl-btn" data-d="track" title="کد ردیابی پس‌زمینه (وقتی صفحهٔ گوشی قفل است)">📍 ردیاب</button> <button class="fl-btn red" data-d="del">حذف</button></td></tr>';
      }).join('');
      openModal('<h3>رانندگان</h3><div class="sub" style="font-size:12px;opacity:.8;margin-bottom:8px;line-height:1.9">راننده یک کاربر عادی داشبورد با نقش «راننده» است: با همان نام کاربری و رمز، در آدرس <b dir="ltr">/driver</b> (یا همین صفحهٔ ورود داشبورد) وارد می‌شود و <b>فقط</b> پرتال راننده را می‌بیند، نه فاکتورها و اسناد را. رمز حداقل ۴ کاراکتر است. اگر راننده عوض شد، فقط ماشین را عوض کنید.</div>'
        + '<div style="overflow:auto"><table><thead><tr><th>نام کاربری</th><th>ماشین</th><th>رمز</th><th></th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="fl-empty" style="padding:12px">هنوز راننده‌ای تعریف نشده.</td></tr>')
        + '<tr id="flNewRow"><td><input data-f="name" placeholder="نام کاربری راننده جدید" style="width:130px"></td><td><select data-f="vehicle">' + vehicleOptions('') + '</select></td><td><input data-f="pass" type="text" placeholder="رمز عبور" style="width:115px" autocomplete="off"></td><td></td><td><button class="fl-btn pri" data-d="add">افزودن راننده</button></td></tr></tbody></table></div><div id="flDrvMsg" style="min-height:20px;font-size:12px;margin-top:8px"></div>' + CLOSE);
      var msg = function (t, bad) { var m = $('flDrvMsg'); if (m) { m.textContent = t; m.className = bad ? 'fl-bad' : 'fl-ok'; } };
      Array.prototype.forEach.call($('flBox').querySelectorAll('[data-d]'), function (b) {
        b.onclick = function () {
          var tr = b.closest('tr'), a = b.getAttribute('data-d');
          var g = function (f) { var e = tr.querySelector('[data-f=' + f + ']'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; };
          var name = a === 'add' ? g('name').trim() : tr.getAttribute('data-name');
          if (a === 'track') {
            api('driver/track-code', 'POST', { name: name }).then(function (j) {
              var url = location.origin + '/api/driver/track';
              var qrPayloadUrl = url + '?id=' + encodeURIComponent(j.code) + '&interval=15&distance=0&accuracy=high&buffer=true';
              var qrSvg = makeQrSvg(qrPayloadUrl, 220);
              openModal('<h3>📱 تنظیم خودکار ردیاب (Traccar Client) برای «' + esc(name) + '»</h3>'
                + '<div style="text-align:center;background:#f0fdf4;border:1.5px dashed #22c55e;border-radius:16px;padding:12px;margin:8px 0">'
                + '<div style="font-size:12.5px;font-weight:800;color:#166534;margin-bottom:8px">اسکن با بارکدخوان داخل برنامه Traccar Client (تنظیم خودکار همه مقادیر):</div>'
                + '<div style="display:inline-block;margin:4px auto">' + qrSvg + '</div>'
                + '<div style="font-size:11.5px;color:#15803d;margin-top:8px;line-height:1.8">راننده در برنامهٔ <b>Traccar Client</b> وارد بخش <b>Settings (تنظیمات)</b> شود و روی <b>آیکون اسکن QR کد</b> بزند و دوربین را مقابل این تصویر بگیرد تا آدرس سرور، کد راننده و زمان‌بندی ۱۵ ثانیه خودکار تنظیم شوند (این QR کد و دکمهٔ تنظیم تک‌کلیکی در پرتال خود راننده هم قرار دارد).</div>'
                + '</div>'
                + '<table><tbody><tr><td>Device identifier</td><td dir="ltr"><b style="font-size:16px;letter-spacing:1px">' + esc(j.code) + '</b></td></tr><tr><td>Server URL</td><td dir="ltr" style="word-break:break-all">' + esc(url) + '</td></tr><tr><td>Frequency / Interval</td><td>15</td></tr></tbody></table>'
                + '<div class="sub" style="font-size:12px;margin-top:8px;line-height:1.9">اجازهٔ موقعیت روی «همیشه» و باتری «بدون محدودیت» باشد. اگر کد لو رفت «کد جدید» بزنید؛ کد قبلی باطل می‌شود.</div>'
                + '<div style="display:flex;gap:6px;margin-top:12px"><button class="fl-btn red" id="flTrkReset">کد جدید</button><button class="fl-btn" id="flTrkBack">بازگشت</button></div>');
              $('flTrkBack').onclick = showDrivers;
              $('flTrkReset').onclick = function () { if (confirm('کد ردیاب این راننده عوض شود؟ باید دوباره در گوشی او وارد شود.')) api('driver/track-code', 'POST', { name: name, reset: true }).then(function () { showDrivers(); setTimeout(function () { toast('کد جدید ساخته شد؛ دوباره «📍 ردیاب» را بزنید.', 'success'); }, 400); }); };
            }).catch(function (e) { msg(e.message, 1); });
            return;
          }
          if (a === 'del') { if (!confirm('کاربر راننده «' + name + '» حذف شود؟')) return; usersApi('/' + encodeURIComponent(name), 'DELETE').then(function () { return api('driver/vehicle', 'POST', { name: name, vehicle: '' }); }).then(showDrivers).catch(function (e) { msg(e.message, 1); }); return; }
          if (!name) { msg('نام کاربری را بنویسید.', 1); return; }
          var chain;
          if (a === 'add') { if (g('pass').length < 4) { msg('رمز باید حداقل ۴ کاراکتر باشد.', 1); return; } chain = usersApi('', 'POST', { name: name, password: g('pass'), role: 'driver' }); }
          else { var body = { active: g('active') }; if (g('pass')) body.password = g('pass'); chain = usersApi('/' + encodeURIComponent(name), 'PUT', body); }
          chain.then(function () { return api('driver/vehicle', 'POST', { name: name, vehicle: g('vehicle') }).then(function (res) { if (typeof window.refreshVehicleDriverNames === 'function') window.refreshVehicleDriverNames(true); return res; }); }).then(function () { showDrivers(); setTimeout(function () { msg('ذخیره شد.'); }, 300); }).catch(function (e) { msg(e.notFound ? OLD_SERVER : e.message, 1); });
        };
      });
    }).catch(function (e) { toast(e.notFound ? OLD_SERVER : e.message, 'error'); });
  }

  // ───── پروفایل هوشمند رفتار تحویل و ساعت طلایی مشتریان (Customer Delivery DNA) ─────
  function showCustomerDna() {
    openModal('<div class="fl-empty">در حال تحلیل تاریخچه تحویل مشتریان…</div>');
    api('customer-dna').then(function (j) {
      var list = j.customers || [];
      if (!list.length) {
        openModal('<h3>🧬 پروفایل رفتاری تحویل مشتریان (Customer DNA)</h3><div class="fl-empty">هنوز سابقه تحویل کافی در جدول سفرها ثبت نشده است.</div>' + CLOSE);
        return;
      }
      var rows = list.map(function (c, i) {
        var badges = [];
        if (c.highDwellAlert) badges.push('<span class="fl-chip cancelled">⏱ پرمعطلی (' + fa(c.avgDwellMin) + ' دقیقه)</span>');
        if (c.failAlert) badges.push('<span class="fl-chip planned" style="background:#fef3c7;color:#92400e">⚠️ ' + fa(c.failedCount) + ' عدم تحویل</span>');
        return '<tr><td>' + fa(i + 1) + '</td><td><b>' + esc(c.party) + '</b>' + (c.lastFailReason ? '<div class="sub" style="color:#dc2626">آخرین علت عدم تحویل: ' + esc(c.lastFailReason) + '</div>' : '') + '</td>'
          + '<td><span style="color:#0891b2;font-weight:800">🕒 ' + esc(c.goldenWindow) + '</span></td>'
          + '<td>' + (c.avgDwellMin != null ? fa(c.avgDwellMin) + ' دقیقه' : '—') + '</td>'
          + '<td class="' + (c.successRate >= 90 ? 'fl-ok' : c.successRate < 70 ? 'fl-bad' : '') + '">' + fa(c.successRate) + '٪ (' + fa(c.deliveredCount) + '/' + fa(c.totalStops) + ')</td>'
          + '<td>' + fa(c.totalKg) + ' کیلو</td>'
          + '<td>' + (badges.join(' ') || '<span class="fl-ok">✓ خوش‌تحویل</span>') + '</td></tr>';
      }).join('');
      openModal('<h3>🧬 حافظه هوشمند رفتار تحویل و ساعت طلایی مشتریان (Customer DNA)</h3>'
        + '<div class="sub" style="margin-bottom:10px;line-height:1.9">این گزارش به‌طور خودکار از روی ساعت‌های تحویل موفق، مدت توقف GPS راننده در محل و سابقه برگشتی‌ها استخراج شده است تا در چیدمان مسیر لحاظ شود.</div>'
        + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>مشتری</th><th>ساعت طلایی تحویل</th><th>میانگین توقف</th><th>نرخ موفقیت</th><th>کل بار</th><th>وضعیت رفتاری</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + CLOSE);
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }

  // ───── تولید QR کد استاندارد گیت خروج (آفلاین و بدون وابستگی خارجی) ─────
  function makeQrMatrix(text) {
    var bytes = Array.from(new TextEncoder().encode(String(text || '')));
    var cfg = bytes.length <= 32 ? { v: 2, sz: 25, b: 1, d: 34, ec: 10, al: [6, 18], vi: 0 }
            : bytes.length <= 78 ? { v: 4, sz: 33, b: 1, d: 80, ec: 20, al: [6, 26], vi: 0 }
            : bytes.length <= 106 ? { v: 5, sz: 37, b: 1, d: 108, ec: 26, al: [6, 30], vi: 0 }
            : bytes.length <= 134 ? { v: 6, sz: 41, b: 2, d: 68, ec: 18, al: [6, 34], vi: 0 }
            : { v: 8, sz: 49, b: 2, d: 97, ec: 24, al: [6, 24, 42], vi: 0x085BC };
    var size = cfg.sz, dataCap = cfg.b * cfg.d, ecLen = cfg.ec, alignPos = cfg.al;
    var bits = [];
    function pushBits(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    pushBits(4, 4);
    pushBits(bytes.length, 8);
    for (var bi = 0; bi < bytes.length; bi++) pushBits(bytes[bi], 8);
    pushBits(0, Math.min(4, dataCap * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    var dataWords = [];
    for (var i = 0; i < bits.length && dataWords.length < dataCap; i += 8) {
      var w = 0;
      for (var j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      dataWords.push(w);
    }
    var padToggle = true;
    while (dataWords.length < dataCap) {
      dataWords.push(padToggle ? 0xEC : 0x11);
      padToggle = !padToggle;
    }
    var exp = new Uint8Array(512), log = new Uint8Array(256);
    var x = 1;
    for (var gi = 0; gi < 255; gi++) { exp[gi] = x; log[x] = gi; x = (x << 1) ^ (x & 0x80 ? 0x11D : 0); }
    for (var gk = 255; gk < 512; gk++) exp[gk] = exp[gk - 255];
    function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : exp[log[a] + log[b]]; }
    var gen = [1];
    for (var ei = 0; ei < ecLen; ei++) {
      var next = new Array(gen.length + 1).fill(0);
      for (var ej = 0; ej < gen.length; ej++) {
        next[ej] ^= gen[ej];
        next[ej + 1] ^= gfMul(gen[ej], exp[ei]);
      }
      gen = next;
    }
    var dBlocks = [], eBlocks = [];
    for (var blk = 0; blk < cfg.b; blk++) {
      var bData = dataWords.slice(blk * cfg.d, (blk + 1) * cfg.d);
      var rem = new Array(ecLen).fill(0);
      for (var di = 0; di < bData.length; di++) {
        var factor = bData[di] ^ rem.shift();
        rem.push(0);
        if (factor !== 0) {
          for (var rj = 0; rj < ecLen; rj++) rem[rj] ^= gfMul(gen[rj + 1], factor);
        }
      }
      dBlocks.push(bData);
      eBlocks.push(rem);
    }
    var codewords = [];
    for (var ci = 0; ci < cfg.d; ci++) {
      for (var cb = 0; cb < cfg.b; cb++) codewords.push(dBlocks[cb][ci]);
    }
    for (var eci = 0; eci < ecLen; eci++) {
      for (var ecb = 0; ecb < cfg.b; ecb++) codewords.push(eBlocks[ecb][eci]);
    }
    var mat = Array.from({ length: size }, function () { return new Array(size).fill(0); });
    var isFunc = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    function setFinder(r0, c0) {
      for (var dy = -1; dy <= 7; dy++) {
        for (var dx = -1; dx <= 7; dx++) {
          var r = r0 + dy, c = c0 + dx;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          var inOuter = (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) || (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6));
          var inInner = (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);
          mat[r][c] = (inOuter || inInner) ? 1 : 0;
          isFunc[r][c] = true;
        }
      }
    }
    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);
    for (var ti = 8; ti < size - 8; ti++) {
      mat[6][ti] = mat[ti][6] = (ti % 2 === 0) ? 1 : 0;
      isFunc[6][ti] = isFunc[ti][6] = true;
    }
    for (var ai = 0; ai < alignPos.length; ai++) {
      for (var aj = 0; aj < alignPos.length; aj++) {
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === alignPos.length - 1) || (ai === alignPos.length - 1 && aj === 0)) continue;
        var ar = alignPos[ai], ac = alignPos[aj];
        for (var ady = -2; ady <= 2; ady++) {
          for (var adx = -2; adx <= 2; adx++) {
            var dist = Math.max(Math.abs(ady), Math.abs(adx));
            mat[ar + ady][ac + adx] = (dist === 2 || dist === 0) ? 1 : 0;
            isFunc[ar + ady][ac + adx] = true;
          }
        }
      }
    }
    if (cfg.vi) {
      for (var vi = 0; vi < 18; vi++) {
        var vbit = (cfg.vi >> vi) & 1;
        var vr = Math.floor(vi / 3), vc = size - 11 + (vi % 3);
        mat[vr][vc] = mat[vc][vr] = vbit;
        isFunc[vr][vc] = isFunc[vc][vr] = true;
      }
    }
    for (var fi = 0; fi < 9; fi++) {
      if (fi !== 6) { isFunc[8][fi] = true; isFunc[fi][8] = true; }
    }
    for (var fj = 0; fj < 8; fj++) {
      isFunc[8][size - 1 - fj] = true;
      isFunc[size - 1 - fj][8] = true;
    }
    mat[size - 8][8] = 1;
    isFunc[size - 8][8] = true;
    var bitIdx = 0, totalBits = codewords.length * 8, upward = true;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        var r = upward ? (size - 1 - vert) : vert;
        for (var cj = 0; cj < 2; cj++) {
          var c = right - cj;
          if (!isFunc[r][c]) {
            var bit = 0;
            if (bitIdx < totalBits) {
              bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            if ((r + c) % 2 === 0) bit ^= 1;
            mat[r][c] = bit;
          }
        }
      }
      upward = !upward;
    }
    var fmt = 0x77C4, fmtBits = [];
    for (var fbi = 0; fbi < 15; fbi++) fmtBits.push((fmt >> fbi) & 1);
    for (var f1 = 0; f1 <= 5; f1++) mat[8][f1] = fmtBits[f1];
    mat[8][7] = fmtBits[6];
    mat[8][8] = fmtBits[7];
    mat[7][8] = fmtBits[8];
    for (var f2 = 9; f2 < 15; f2++) mat[14 - f2][8] = fmtBits[f2];
    for (var f3 = 0; f3 < 8; f3++) mat[8][size - 1 - f3] = fmtBits[f3];
    for (var f4 = 8; f4 < 15; f4++) mat[size - 15 + f4][8] = fmtBits[f4];
    return mat;
  }

  function makeQrSvg(text, pxSize) {
    var mat = makeQrMatrix(text);
    var n = mat.length, quiet = 4, total = n + quiet * 2;
    var d = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (mat[r][c]) d.push('M' + (c + quiet) + ',' + (r + quiet) + 'h1v1h-1z');
      }
    }
    var sz = pxSize || 230;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + sz + '" height="' + sz + '" shape-rendering="crispEdges" style="background:#fff;border-radius:14px;border:2px solid #86efac;box-shadow:0 8px 24px rgba(15,23,42,.12)"><rect width="100%" height="100%" fill="#fff"/><path d="' + d.join('') + '" fill="#0f172a"/></svg>';
  }

  function showGateQrModal(id) {
    var t = F.trips.filter(function (x) { return String(x.id) === String(id); })[0];
    function renderGateModal(trip) {
      var code = String(trip.handoverCode || '').trim();
      var payload = 'ANBAR-GATE:' + trip.id + ':' + code;
      var qrSvg = makeQrSvg(payload, 240);
      openModal(
        '<div style="text-align:center;padding:6px 4px">'
        + '<h3 style="margin-bottom:6px">📱 اسکن QR کد گیت خروج توسط راننده</h3>'
        + '<div class="sub" style="font-size:13px;margin-bottom:12px">🚚 <b>' + esc(trip.vehicleLabel || trip.vehicleKey) + '</b> — راننده: <b>' + esc(trip.driverName || 'تعیین‌نشده') + '</b> · تاریخ: <b>' + esc(trip.planDate || '') + '</b></div>'
        + '<div style="display:inline-block;padding:12px;background:#f0fdf4;border:2px dashed #22c55e;border-radius:18px;margin:4px auto">' + qrSvg + '</div>'
        + '<div style="margin-top:12px;font-size:13px;color:#166534;font-weight:800">راننده در پرتال خود دکمهٔ «📷 اسکن QR کد مدیر و تحویل گرفتن بار» را بزند و دوربین را مقابل این تصویر بگیرد.</div>'
        + '<div style="margin-top:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px;display:inline-block;min-width:240px">'
        + '<div style="font-size:11px;color:#64748b;margin-bottom:4px">کد ۶ رقمی پشتیبان (در صورت عدم دسترسی به دوربین):</div>'
        + '<code dir="ltr" style="font-size:22px;font-weight:900;letter-spacing:4px;color:#0f172a">' + esc(code) + '</code>'
        + '</div>'
        + '<div style="margin-top:10px;font-size:12px;color:#475569">تعداد مقصد: <b>' + fa((trip.stops || []).length) + '</b> · وزن کل بار: <b>' + fa(Math.round(trip.totalKg || 0)) + ' کیلوگرم</b> · جمع کارتن: <b>' + fa(Math.round(trip.totalCartons || 0)) + '</b></div>'
        + '</div>' + CLOSE
      );
    }
    if (t && t.handoverCode) {
      renderGateModal(t);
    } else {
      openModal('<div class="fl-empty">در حال دریافت QR کد گیت خروج…</div>');
      api('trip?id=' + encodeURIComponent(id)).then(function (j) {
        if (j && j.trip) renderGateModal(j.trip);
        else openModal('<div class="fl-warn">اطلاعات سفر یافت نشد.</div>' + CLOSE);
      }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
    }
  }
  window.__flShowGateQr = showGateQrModal;

  // ───── کارنامه هوشمند، ریز مسیرهای روزانه و گزارش ماهانه عملکرد رانندگان ─────
  var JALALI_MONTH_NAMES = {
    '01': 'فروردین', '02': 'اردیبهشت', '03': 'خرداد', '04': 'تیر', '05': 'مرداد', '06': 'شهریور',
    '07': 'مهر', '08': 'آبان', '09': 'آذر', '10': 'دی', '11': 'بهمن', '12': 'اسفند'
  };
  function formatMonthLabel(ym) {
    if (!ym || ym === 'all') return 'همهٔ ماه‌ها (کل سوابق)';
    var p = String(ym).split('/');
    if (p.length !== 2) return ym;
    return (JALALI_MONTH_NAMES[p[1]] || p[1]) + ' ' + fa(p[0]) + ' (' + ym + ')';
  }

  function showDriverScorecard(opts) {
    opts = opts || {};
    var curMonth = opts.month || 'all';
    var curFrom = opts.fromDate || '';
    var curTo = opts.toDate || '';
    var curDrvFilter = opts.driver || 'all';

    openModal('<div class="fl-empty">در حال محاسبه کارنامه و ریز عملکرد ماهانهٔ رانندگان…</div>');
    var q = 'scorecard?month=' + encodeURIComponent(curMonth);
    if (curFrom) q += '&fromDate=' + encodeURIComponent(curFrom);
    if (curTo) q += '&toDate=' + encodeURIComponent(curTo);

    api(q).then(function (j) {
      var allDrivers = j.drivers || [];
      var availMonths = j.availableMonths || [];
      var list = curDrvFilter === 'all' ? allDrivers : allDrivers.filter(function (d) { return d.driverName === curDrvFilter; });

      var monthOpts = '<option value="all"' + (curMonth === 'all' ? ' selected' : '') + '>📅 همهٔ ماه‌ها (کل کارکرد)</option>'
        + availMonths.map(function (m) {
            return '<option value="' + esc(m) + '"' + (curMonth === m ? ' selected' : '') + '>📅 ماه ' + esc(formatMonthLabel(m)) + '</option>';
          }).join('');

      var drvOpts = '<option value="all"' + (curDrvFilter === 'all' ? ' selected' : '') + '>👤 همهٔ رانندگان (' + fa(allDrivers.length) + ' نفر)</option>'
        + allDrivers.map(function (d) {
            return '<option value="' + esc(d.driverName) + '"' + (curDrvFilter === d.driverName ? ' selected' : '') + '>👤 ' + esc(d.driverName) + ' (' + esc(d.vehicleLabel) + ')</option>';
          }).join('');

      var filterBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;margin-bottom:10px">'
        + '<select id="flScMonth" style="min-width:170px">' + monthOpts + '</select>'
        + '<select id="flScDriver" style="min-width:160px">' + drvOpts + '</select>'
        + '<span style="font-size:11.5px;color:#475569">یا بازهٔ دلخواه:</span>'
        + '<input id="flScFrom" dir="ltr" value="' + esc(curFrom) + '" placeholder="از 1405/08/01" style="width:105px;text-align:center">'
        + '<input id="flScTo" dir="ltr" value="' + esc(curTo) + '" placeholder="تا 1405/08/30" style="width:105px;text-align:center">'
        + '<button class="fl-btn pri" type="button" id="flScApply">🔍 اعمال فیلتر</button>'
        + '<div style="margin-right:auto;display:flex;gap:6px">'
        + '<button class="fl-btn" type="button" id="flScPrint" style="background:#0f766e;color:#fff;border-color:#0f766e">🖨️ چاپ گزارش ماهانه</button>'
        + '<button class="fl-btn" type="button" id="flScCsv" style="background:#16a34a;color:#fff;border-color:#16a34a">📥 خروجی اکسل (CSV)</button>'
        + '</div></div>';

      if (!list.length) {
        openModal('<h3>🏆 کارنامه و گزارش ماهانهٔ عملکرد رانندگان</h3>' + filterBar + '<div class="fl-empty">در این ماه یا بازهٔ زمانی، سفری برای نمایش ثبت نشده است.</div>' + CLOSE);
        bindScorecardFilters();
        return;
      }

      var medals = ['🥇', '🥈', '🥉'];
      var sumInvoices = 0, sumTotInvoices = 0, sumCartons = 0, sumKg = 0, sumTrips = 0, sumStops = 0, sumTotStops = 0, sumAdhoc = 0;
      var rows = list.map(function (d, i) {
        var medal = medals[i] || fa(i + 1);
        var scoreColor = d.score >= 85 ? '#16a34a' : (d.score >= 70 ? '#d97706' : '#dc2626');
        var delivInv = d.deliveredInvoices != null ? d.deliveredInvoices : d.deliveredStops;
        var totInv = d.totalInvoices != null ? d.totalInvoices : d.totalStops;
        var delivCartons = d.deliveredCartons != null ? d.deliveredCartons : 0;
        var delivKg = d.deliveredKg != null ? d.deliveredKg : d.totalKg;
        sumInvoices += Number(delivInv) || 0;
        sumTotInvoices += Number(totInv) || 0;
        sumCartons += Number(delivCartons) || 0;
        sumKg += Number(delivKg) || 0;
        sumTrips += Number(d.tripsCount) || 0;
        sumStops += Number(d.deliveredStops) || 0;
        sumTotStops += Number(d.totalStops) || 0;
        sumAdhoc += Number(d.adhocDelivered || 0);
        return '<tr><td style="font-size:16px">' + medal + '</td>'
          + '<td><b>' + esc(d.driverName) + '</b><div class="sub">' + esc(d.vehicleLabel) + '</div></td>'
          + '<td style="font-weight:900;color:#1e40af;background:#eff6ff">' + fa(d.tripsCount) + ' مسیر</td>'
          + '<td style="font-weight:900;color:#7c3aed;background:#f5f3ff">' + fa(d.deliveredStops) + ' ماموریت انجام‌شده<div class="sub">از کل ' + fa(d.totalStops) + ' مقصد' + (d.adhocDelivered ? ' (' + fa(d.adhocDelivered) + ' متفرقه)' : '') + '</div></td>'
          + '<td style="background:#f0fdf4;font-weight:900;color:#166534">' + fa(delivInv) + ' فاکتور تحویلی<div class="sub" style="font-weight:600;color:#15803d">از کل ' + fa(totInv) + ' فاکتور</div></td>'
          + '<td style="background:#ecfeff;font-weight:900;color:#0f766e">' + fa(delivCartons) + ' کارتن<div class="sub" style="font-weight:600;color:#0e7490">' + fa(delivKg) + ' کیلوگرم</div></td>'
          + '<td><span style="display:inline-block;padding:3px 10px;border-radius:99px;background:' + scoreColor + ';color:#fff;font-weight:900">' + fa(d.score) + ' از ۱۰۰</span></td>'
          + '<td><a href="#sc-drv-' + i + '" class="fl-btn pri" style="text-decoration:none;padding:4px 8px;font-size:11px">📋 ریز روزها (' + fa(d.tripsCount) + ')</a></td></tr>';
      }).join('');

      var totalRow = '<tr style="background:#e2e8f0;font-weight:900;color:#0f172a">'
        + '<td colspan="2">📊 جمع کل همهٔ رانندگان در این گزارش (' + fa(list.length) + ' نفر)</td>'
        + '<td>' + fa(sumTrips) + ' مسیر</td>'
        + '<td>' + fa(sumStops) + ' ماموریت (از ' + fa(sumTotStops) + ')</td>'
        + '<td>' + fa(sumInvoices) + ' فاکتور (از ' + fa(sumTotInvoices) + ')</td>'
        + '<td>' + fa(sumCartons) + ' کارتن (' + fa(sumKg) + ' کیلو)</td>'
        + '<td colspan="2">—</td></tr>';

      var summaryStrip = '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:10px 14px;font-size:13px;color:#0f172a">'
        + '<span>📅 دوره گزارش: <b>' + esc(formatMonthLabel(curMonth)) + (curFrom || curTo ? ' (' + esc(curFrom || 'ابتدا') + ' تا ' + esc(curTo || 'امروز') + ')' : '') + '</b></span>'
        + '<span>·</span><span>🚚 جمع کل مسیرهای رفته‌شده: <b>' + fa(sumTrips) + ' مسیر</b></span>'
        + '<span>·</span><span style="color:#6d28d9">📍 جمع ماموریت‌های انجام‌شده: <b>' + fa(sumStops) + ' ماموریت</b></span>'
        + '<span>·</span><span style="color:#166534">🧾 جمع کل فاکتورهای تحویلی: <b>' + fa(sumInvoices) + ' فاکتور</b></span>'
        + '<span>·</span><span style="color:#0f766e">📦 جمع بار تحویلی: <b>' + fa(sumCartons) + ' کارتن (' + fa(sumKg) + ' کیلو)</b></span>'
        + '</div>';

      // ساخت جداول ریز تاریخ و روز هفته برای تک‌تک رانندگان
      var detailedPerDriverHtml = list.map(function (d, idx) {
        var hist = d.tripHistory || [];
        var hRows = hist.map(function (th, rIdx) {
          var timeRange = (th.startedMs ? hhmm(th.startedMs) : '—') + ' تا ' + (th.finishedMs ? hhmm(th.finishedMs) : (th.status === 'active' ? 'در مسیر' : '—'));
          var invText = (th.invoiceNumbers && th.invoiceNumbers.length) ? th.invoiceNumbers.join(' ، ') : 'بدون فاکتور (ماموریت متفرقه)';
          var destText = (th.parties && th.parties.length) ? th.parties.join(' ، ') : '—';
          return '<tr>'
            + '<td>' + fa(rIdx + 1) + '</td>'
            + '<td style="white-space:nowrap;font-weight:800">' + esc(th.planDate || '—') + '</td>'
            + '<td style="white-space:nowrap;color:#0284c7;font-weight:800">' + esc(th.dayOfWeek || '—') + '</td>'
            + '<td style="white-space:nowrap;font-size:11px">' + esc(timeRange) + '</td>'
            + '<td style="font-weight:800;color:#6d28d9">' + fa(th.deliveredStops) + ' از ' + fa(th.totalStops) + ' ماموریت' + (th.adhocDelivered ? ' (' + fa(th.adhocDelivered) + ' متفرقه)' : '') + '</td>'
            + '<td style="font-weight:800;color:#166534">' + fa(th.deliveredInvoices) + ' از ' + fa(th.totalInvoices) + ' فاکتور</td>'
            + '<td style="font-size:11px;text-align:right;max-width:260px">' + esc(destText) + '<div class="sub" style="font-size:10px">فاکتورها: ' + esc(invText) + '</div></td>'
            + '<td>' + fa(th.deliveredCartons || 0) + ' کارتن / ' + fa(th.deliveredKg || 0) + ' کیلو</td>'
            + '<td><button class="fl-btn" style="padding:3px 7px;font-size:10.5px" onclick="__flDetail(\'' + esc(th.tripId) + '\')">مشاهده</button></td>'
            + '</tr>';
        }).join('');

        var drvFooter = '<tr style="background:#fef3c7;font-weight:900;color:#92400e">'
          + '<td colspan="4">📌 جمع کل کارکرد «' + esc(d.driverName) + '» در این دوره: ' + fa(d.tripsCount) + ' مسیر رفته‌شده</td>'
          + '<td>جمع ماموریت: ' + fa(d.deliveredStops) + ' از ' + fa(d.totalStops) + '</td>'
          + '<td>جمع فاکتور: ' + fa(d.deliveredInvoices) + ' از ' + fa(d.totalInvoices) + '</td>'
          + '<td>—</td>'
          + '<td>' + fa(d.deliveredCartons || 0) + ' کارتن / ' + fa(d.deliveredKg || 0) + ' کیلو</td>'
          + '<td></td></tr>';

        return '<div id="sc-drv-' + idx + '" style="margin-top:16px;border:1.5px solid #cbd5e1;border-radius:12px;padding:10px 12px;background:var(--bg-main)">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
          + '<h4 style="margin:0;font-size:14px">👤 ریز کارکرد روزبه‌روز راننده: <b>' + esc(d.driverName) + '</b> (' + esc(d.vehicleLabel) + ')</h4>'
          + '<div style="display:flex;gap:10px;font-size:12px;font-weight:800">'
          + '<span style="color:#1e40af">🚚 جمع مسیرها: ' + fa(d.tripsCount) + ' مسیر</span>'
          + '<span style="color:#6d28d9">📍 جمع ماموریت‌ها: ' + fa(d.deliveredStops) + ' مورد</span>'
          + '<span style="color:#166534">🧾 جمع فاکتورها: ' + fa(d.deliveredInvoices) + ' فاکتور</span>'
          + '</div></div>'
          + '<div style="overflow:auto"><table><thead><tr><th>#</th><th>تاریخ</th><th>روز هفته</th><th>ساعت شروع و پایان</th><th>تعداد ماموریت / مقصد</th><th>تعداد فاکتور</th><th>مقاصد و شماره فاکتورها</th><th>کارتن / وزن</th><th>جزئیات</th></tr></thead><tbody>'
          + (hRows || '<tr><td colspan="9" class="fl-empty">مسیری ثبت نشده است.</td></tr>')
          + drvFooter
          + '</tbody></table></div></div>';
      }).join('');

      openModal('<h3>🏆 کارنامه و گزارش ماهانهٔ مسیرها، ماموریت‌ها و فاکتورهای رانندگان</h3>'
        + '<div class="sub" style="margin-bottom:8px;line-height:1.8">در این صفحه می‌توانید به تفکیک هر ماه یا بازهٔ دلخواه، تعداد مسیرهای رفته‌شده، تعداد ماموریت‌ها و تعداد فاکتورهای هر راننده را همراه با ریز تاریخ و روز هفته مشاهده، چاپ یا به اکسل (CSV) خروجی بگیرید.</div>'
        + filterBar
        + summaryStrip
        + '<div style="overflow:auto;max-height:66vh;padding-left:4px">'
        + '<table><thead><tr><th>رتبه</th><th>راننده / خودرو</th><th>تعداد مسیرهای رفته‌شده</th><th>جمع ماموریت‌های انجام‌شده</th><th>جمع فاکتورهای تحویلی</th><th>جمع کارتن و وزن</th><th>امتیاز عملکرد</th><th>ریز روزها</th></tr></thead><tbody>' + rows + totalRow + '</tbody></table>'
        + detailedPerDriverHtml
        + '</div>' + CLOSE);

      bindScorecardFilters(list, curMonth, curFrom, curTo);
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });

    function bindScorecardFilters(currentList, mLbl, fDate, tDate) {
      var applyFn = function () {
        showDriverScorecard({
          month: $('flScMonth') ? $('flScMonth').value : 'all',
          driver: $('flScDriver') ? $('flScDriver').value : 'all',
          fromDate: $('flScFrom') ? $('flScFrom').value.trim() : '',
          toDate: $('flScTo') ? $('flScTo').value.trim() : ''
        });
      };
      if ($('flScMonth')) $('flScMonth').onchange = applyFn;
      if ($('flScDriver')) $('flScDriver').onchange = applyFn;
      if ($('flScApply')) $('flScApply').onclick = applyFn;

      if ($('flScCsv') && currentList) {
        $('flScCsv').onclick = function () {
          var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
          var out = [['نام راننده', 'خودرو', 'ردیف مسیر', 'تاریخ', 'روز هفته', 'ساعت شروع', 'ساعت پایان', 'تعداد کل ماموریت/مقصد', 'ماموریت انجام‌شده', 'ماموریت متفرقه انجام‌شده', 'تعداد کل فاکتور', 'فاکتور تحویل‌شده', 'جمع کارتن تحویلی', 'جمع وزن تحویلی (کیلو)', 'مقاصد / مشتریان', 'شماره فاکتورها']];
          currentList.forEach(function (d) {
            (d.tripHistory || []).forEach(function (th, idx) {
              out.push([
                d.driverName,
                d.vehicleLabel,
                idx + 1,
                th.planDate || '',
                th.dayOfWeek || '',
                th.startedMs ? hhmm(th.startedMs) : '',
                th.finishedMs ? hhmm(th.finishedMs) : '',
                th.totalStops || 0,
                th.deliveredStops || 0,
                th.adhocDelivered || 0,
                th.totalInvoices || 0,
                th.deliveredInvoices || 0,
                th.deliveredCartons || 0,
                th.deliveredKg || 0,
                (th.parties || []).join(' | '),
                (th.invoiceNumbers || []).join(' | ')
              ]);
            });
            out.push([
              'جمع کل ' + d.driverName,
              d.vehicleLabel,
              d.tripsCount + ' مسیر',
              '',
              '',
              '',
              '',
              d.totalStops || 0,
              d.deliveredStops || 0,
              d.adhocDelivered || 0,
              d.totalInvoices || 0,
              d.deliveredInvoices || 0,
              d.deliveredCartons || 0,
              d.deliveredKg || 0,
              '',
              ''
            ]);
          });
          var blob = new Blob(['\ufeff' + out.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'گزارش_عملکرد_رانندگان_' + (mLbl && mLbl !== 'all' ? mLbl.replace(/\//g, '-') : 'کل') + '.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
        };
      }

      if ($('flScPrint') && currentList) {
        $('flScPrint').onclick = function () {
          var w = window.open('', '_blank');
          if (!w) return;
          var htmlTables = currentList.map(function (d) {
            var trs = (d.tripHistory || []).map(function (th, idx) {
              return '<tr><td>' + fa(idx + 1) + '</td><td>' + esc(th.planDate) + '</td><td>' + esc(th.dayOfWeek) + '</td><td>' + (th.startedMs ? hhmm(th.startedMs) : '—') + ' تا ' + (th.finishedMs ? hhmm(th.finishedMs) : '—') + '</td><td>' + fa(th.deliveredStops) + ' از ' + fa(th.totalStops) + '</td><td>' + fa(th.deliveredInvoices) + ' از ' + fa(th.totalInvoices) + '</td><td style="text-align:right">' + esc((th.parties || []).join(' ، ')) + '</td><td>' + fa(th.deliveredCartons || 0) + ' کارتن / ' + fa(th.deliveredKg || 0) + ' کیلو</td></tr>';
            }).join('');
            return '<h3>👤 راننده: ' + esc(d.driverName) + ' (' + esc(d.vehicleLabel) + ') — جمع مسیر: ' + fa(d.tripsCount) + ' | جمع ماموریت: ' + fa(d.deliveredStops) + ' | جمع فاکتور: ' + fa(d.deliveredInvoices) + '</h3>'
              + '<table><thead><tr><th>#</th><th>تاریخ</th><th>روز هفته</th><th>ساعت</th><th>ماموریت انجام‌شده</th><th>فاکتور تحویلی</th><th>مقاصد</th><th>کارتن / وزن</th></tr></thead><tbody>'
              + trs
              + '<tr style="font-weight:bold;background:#eee"><td colspan="4">جمع کل ' + esc(d.driverName) + ' (' + fa(d.tripsCount) + ' مسیر)</td><td>' + fa(d.deliveredStops) + ' ماموریت</td><td>' + fa(d.deliveredInvoices) + ' فاکتور</td><td>—</td><td>' + fa(d.deliveredCartons || 0) + ' کارتن / ' + fa(d.deliveredKg || 0) + ' کیلو</td></tr>'
              + '</tbody></table>';
          }).join('');
          w.document.write('<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>گزارش عملکرد رانندگان</title><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:12mm}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:1px solid #333;padding:5px 6px;text-align:center}h2,h3{margin:10px 0 6px}@page{size:A4 landscape;margin:10mm}</style></head><body><h2>گزارش عملکرد ماهانه و روزانه رانندگان — ' + esc(formatMonthLabel(mLbl)) + '</h2>' + htmlTables + '</body></html>');
          w.document.close();
          setTimeout(function () { w.print(); }, 400);
        };
      }
    }
  }

  // ───── ارسال برنامه به رانندگان ─────
  function parseOrigin() {
    try { var o = String((window.aiSettings || aiSettings || {}).origin || '').split(',').map(Number); if (o.length === 2 && isFinite(o[0]) && isFinite(o[1])) return o; } catch (e) {}
    return [35.628382, 51.245099];
  }
  var EXC_CATEGORY_FA = {
    open_stops_on_finished_trip: '🚨 توقف تعیین‌تکلیف‌نشده پس از پایان سفر',
    open_stop_after_finish: '🚨 توقف تعیین‌تکلیف‌نشده پس از پایان سفر',
    failed_stop: '✖ تحویل ناموفق',
    failed_delivery: '✖ تحویل ناموفق',
    partial_delivery: '🟠 تحویل ناقص / کسری بار',
    vehicle_overload: '⚖️ اضافه‌بار وزنی خودرو',
    unknown_weight: '⚖️ فاکتور بدون وزن / سند خروج',
    overload_or_unknown_weight: '⚖️ اضافه‌بار یا وزن نامشخص',
    unverified_customer_location: '📍 مقصد بدون لوکیشن دقیق',
    missing_location: '📍 مقصد بدون لوکیشن دقیق',
    gps_issue: '📡 قطع یا قدیمی شدن موقعیت GPS',
    stale_or_offline_gps: '📡 قطع یا قدیمی شدن موقعیت GPS',
    missing_pod: '📷 تحویل بدون عکس رسید یا امضا',
    ambiguous_shipment_id: '🆔 ابهام در شناسه فاکتور همنام',
    offline_sync_issue: '📲 خطای همگام‌سازی صف آفلاین گوشی',
    client_sync_rejected: '📲 خطای همگام‌سازی صف آفلاین گوشی',
    unassigned_invoice: '📦 فاکتور تخصیص‌نیافته'
  };
  var EXC_SEVERITY_FA = {
    critical: '<span class="fl-chip cancelled" style="background:#fee2e2;color:#991b1b">فوری / بحرانی</span>',
    high: '<span class="fl-chip planned" style="background:#ffedd5;color:#9a3412">اهمیت بالا</span>',
    medium: '<span class="fl-chip planned" style="background:#fef3c7;color:#92400e">متوسط (هشدار)</span>',
    warning: '<span class="fl-chip planned" style="background:#fef3c7;color:#92400e">هشدار</span>',
    low: '<span class="fl-chip finished">اطلاع / کم‌اهمیت</span>',
    info: '<span class="fl-chip finished">اطلاع</span>'
  };

  function showExceptionsModal(initCat, initStatus) {
    ensureModalReady();
    var curCat = initCat || 'all';
    var curStatus = initStatus || 'open';
    var curSev = 'all';
    var filterCategories = [
      ['all', 'همه دسته‌ها'],
      ['failed_stop', '✖ تحویل ناموفق'],
      ['partial_delivery', '🟠 تحویل ناقص / کسری بار'],
      ['open_stops_on_finished_trip', '🚨 توقف باز پس از پایان سفر'],
      ['overload_or_unknown_weight', '⚖️ اضافه‌بار یا وزن نامشخص'],
      ['unverified_customer_location', '📍 مقصد بدون لوکیشن دقیق'],
      ['gps_issue', '📡 اختلال یا قطع GPS راننده'],
      ['missing_pod', '📷 تحویل بدون عکس یا امضا'],
      ['offline_sync_issue', '📲 خطای صف آفلاین گوشی']
    ];
    function loadExc() {
      var q = 'exceptions?status=' + encodeURIComponent(curStatus);
      if (curCat && curCat !== 'all') q += '&category=' + encodeURIComponent(curCat);
      if (curSev && curSev !== 'all') q += '&severity=' + encodeURIComponent(curSev);
      openModal('<h3>🚨 صف استثناها و موارد نیازمند رسیدگی</h3><div class="fl-empty">در حال دریافت صف استثناها…</div>');
      api(q).then(function (j) {
        var list = j.exceptions || [];
        var catOpts = filterCategories.map(function (pair) {
          return '<option value="' + pair[0] + '"' + (curCat === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
        }).join('');
        var stOpts = '<option value="open"' + (curStatus === 'open' ? ' selected' : '') + '>🔴 موارد باز (نیازمند اقدام)</option>'
          + '<option value="resolved"' + (curStatus === 'resolved' ? ' selected' : '') + '>🟢 تاریخچه موارد حل‌شده</option>'
          + '<option value="all"' + (curStatus === 'all' ? ' selected' : '') + '>همه (باز و حل‌شده)</option>';
        var sevOpts = '<option value="all"' + (curSev === 'all' ? ' selected' : '') + '>همه اولویت‌ها</option>'
          + '<option value="high"' + (curSev === 'high' ? ' selected' : '') + '>اهمیت بالا / فوری</option>'
          + '<option value="medium"' + (curSev === 'medium' ? ' selected' : '') + '>متوسط / هشدار</option>'
          + '<option value="low"' + (curSev === 'low' ? ' selected' : '') + '>کم‌اهمیت / اطلاع</option>';

        var filterBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">'
          + '<select id="flExcStatusSel">' + stOpts + '</select>'
          + '<select id="flExcCatSel">' + catOpts + '</select>'
          + '<select id="flExcSevSel">' + sevOpts + '</select>'
          + '<span style="margin-right:auto;font-size:12px;font-weight:800">تعداد: ' + fa(list.length) + ' مورد</span>'
          + '</div>';

        var vehNames = { nissan: 'وانت نیسان', paykan: 'وانت پیکان', pride1: 'وانت پراید ۱', pride2: 'وانت پراید ۲', khavar: 'خاور' };
        var rows = list.map(function (ex, idx) {
          var isRes = ex.status === 'resolved';
          var vLbl = vehNames[ex.vehicleKey] || ex.vehicleKey || '';
          return '<tr style="' + (isRes ? 'opacity:.72' : '') + '">'
            + '<td>' + fa(idx + 1) + '</td>'
            + '<td>' + (EXC_SEVERITY_FA[ex.severity] || esc(ex.severity)) + '<div style="font-size:10px;margin-top:2px">' + esc(EXC_CATEGORY_FA[ex.category] || ex.category) + '</div></td>'
            + '<td><b>' + esc(ex.title || '') + '</b><div class="sub">' + esc(ex.detail || '') + '</div>'
            + (ex.nextAction ? '<div style="font-size:11px;color:#0284c7;margin-top:2px">💡 اقدام پیشنهادی: ' + esc(ex.nextAction) + '</div>' : '')
            + (isRes ? '<div style="font-size:11px;color:#16a34a;margin-top:2px">✅ حل‌شده توسط ' + esc(ex.resolvedBy || '') + ' (' + hhmm(ex.resolvedMs) + '): ' + esc(ex.resolutionNote || '') + '</div>' : '')
            + '</td>'
            + '<td>' + (vLbl ? '🚚 ' + esc(vLbl) : '') + (ex.driverName ? '<br>👤 ' + esc(ex.driverName) : '') + (ex.party ? '<br>🏢 ' + esc(ex.party) : '') + '</td>'
            + '<td>' + esc(ex.assignee || 'مدیر عملیات') + '<div class="sub">' + hhmm(ex.updatedMs || ex.createdMs) + '</div></td>'
            + '<td>' + (!isRes ? '<button class="fl-btn pri" data-resolve-exc="' + esc(ex.id) + '">✅ ثبت اقدام و بستن</button>' : '<span class="fl-ok">بسته‌شده</span>')
            + (ex.tripId ? ' <button class="fl-btn" onclick="__flDetail(\'' + esc(ex.tripId) + '\')">مشاهده سفر</button>' : '')
            + '</td></tr>';
        }).join('');

        openModal('<h3>🚨 صف استثناها و موارد نیازمند رسیدگی</h3>'
          + '<div class="sub" style="margin-bottom:8px">فهرست مواردی که نیاز به بررسی یا تایید مدیر دارند. با رفع هر مورد یا زدن «ثبت اقدام و بستن»، از فهرست باز خارج می‌شود.</div>'
          + filterBar
          + '<div style="overflow:auto;max-height:62vh"><table><thead><tr><th>#</th><th>اولویت / نوع</th><th>شرح موضوع و اقدام پیشنهادی</th><th>مرتبط با</th><th>مسئول / ساعت</th><th>عملیات</th></tr></thead><tbody>'
          + (rows || '<tr><td colspan="6" class="fl-empty">هیچ موردی با این فیلترها وجود ندارد. ✅</td></tr>')
          + '</tbody></table></div>' + CLOSE);

        if ($('flExcStatusSel')) $('flExcStatusSel').onchange = function () { curStatus = this.value; loadExc(); };
        if ($('flExcCatSel')) $('flExcCatSel').onchange = function () { curCat = this.value; loadExc(); };
        if ($('flExcSevSel')) $('flExcSevSel').onchange = function () { curSev = this.value; loadExc(); };
        Array.prototype.forEach.call($('flBox').querySelectorAll('[data-resolve-exc]'), function (b) {
          b.onclick = function () {
            var excId = b.getAttribute('data-resolve-exc');
            var note = prompt('توضیح اقدام انجام‌شده برای بستن این مورد را وارد کنید:', 'بررسی و تعیین‌تکلیف شد');
            if (note === null) return;
            b.disabled = true;
            api('exception/resolve', 'POST', { id: excId, resolutionNote: note }).then(function () {
              toast('مورد با موفقیت بسته شد.');
              poll(true);
              loadExc();
            }).catch(function (e) { b.disabled = false; toast(e.message, 'error'); });
          };
        });
      }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
    }
    loadExc();
  }
  window.__flShowExceptions = showExceptionsModal;

  function formatAuditRow(l) {
    var ts = l.tsMs || l.ts_ms || 0;
    var dateTimeStr = '—';
    if (ts) {
      try {
        var dStr = new Date(ts).toLocaleDateString('fa-IR');
        dateTimeStr = dStr + ' — ' + hhmm(ts);
      } catch (_) {
        dateTimeStr = hhmm(ts);
      }
    }
    var roleRaw = String(l.actorRole || l.role || '').toLowerCase();
    var roleFa = roleRaw === 'driver' ? 'راننده' : (roleRaw === 'admin' ? 'مدیر سیستم' : (roleRaw === 'loader' ? 'بارگیر / انبار' : (roleRaw ? roleRaw : 'کاربر')));
    var actorStr = (l.actor ? esc(l.actor) : 'سیستم') + ' <span class="sub">(' + esc(roleFa) + ')</span>';

    var bObj = l.beforeObj || null;
    var aObj = l.afterObj || null;
    if (!bObj && l.before_state) { try { bObj = JSON.parse(l.before_state); } catch (_) {} }
    if (!aObj && l.after_state) { try { aObj = JSON.parse(l.after_state); } catch (_) {} }

    var vehNames = { nissan: 'وانت نیسان', paykan: 'وانت پیکان', pride1: 'وانت پراید ۱', pride2: 'وانت پراید ۲', khavar: 'خاور' };
    var veh = l.vehicleLabel || (aObj && aObj.vehicle) || '';
    if (vehNames[veh]) veh = vehNames[veh];
    var party = l.party || (aObj && aObj.party) || (bObj && bObj.party) || '';

    var act = String(l.action || '');
    var actionTitle = '';
    var detailParts = [];

    if (act === 'stop_status_change') {
      var fromSt = bObj && bObj.status ? (STOP_FA[bObj.status] || bObj.status) : '';
      var toStRaw = aObj && aObj.status ? aObj.status : '';
      var toSt = STOP_FA[toStRaw] || toStRaw || 'تغییر وضعیت';
      if (toStRaw === 'delivered') actionTitle = '<span class="fl-ok">✅ ثبت تحویل کامل مقصد</span>';
      else if (toStRaw === 'partial') actionTitle = '<span style="color:#d97706;font-weight:700">🟠 ثبت تحویل ناقص مقصد</span>';
      else if (toStRaw === 'failed') actionTitle = '<span class="fl-bad">✖ ثبت عدم تحویل (ناموفق)</span>';
      else if (toStRaw === 'arrived') actionTitle = '<span style="color:#0284c7;font-weight:700">📍 رسیدن راننده به مقصد</span>';
      else if (toStRaw === 'enroute') actionTitle = '<span style="color:#d97706;font-weight:700">🚗 حرکت به سمت مقصد</span>';
      else actionTitle = '🔄 تغییر وضعیت مقصد به «' + esc(toSt) + '»';

      if (fromSt && toSt) detailParts.push('تغییر وضعیت از «' + fromSt + '» به «' + toSt + '»');
      if (l.reason || (aObj && aObj.reason)) detailParts.push('علت: ' + (l.reason || aObj.reason));
      if (aObj && aObj.note) detailParts.push('توضیح: ' + aObj.note);
      if (aObj && aObj.receiverName) detailParts.push('تحویل‌گیرنده: ' + aObj.receiverName);
    } else if (act === 'trip_started') {
      actionTitle = '<span style="color:#16a34a;font-weight:700">🚚 شروع سفر توسط راننده</span>';
      detailParts.push('راننده مسیر توزیع را آغاز کرد');
    } else if (act === 'trip_finished') {
      actionTitle = '<span style="color:#059669;font-weight:700">🏁 پایان سفر و بازگشت</span>';
      if (aObj) {
        detailParts.push('تحویل کامل: ' + fa(aObj.delivered || 0)
          + (aObj.partial ? '، ناقص: ' + fa(aObj.partial) : '')
          + (aObj.failed ? '، ناموفق: ' + fa(aObj.failed) : '')
          + (aObj.open ? '، انجام‌نشده: ' + fa(aObj.open) : ''));
      }
      if (l.reason) detailParts.push('توضیح: ' + l.reason);
    } else if (act === 'handover_confirmed') {
      actionTitle = '<span style="color:#166534;font-weight:700">🤝 تایید تحویل بار در گیت خروج</span>';
      detailParts.push('راننده بار را در گیت خروج انبار تحویل گرفت');
    } else if (act === 'plan_published') {
      actionTitle = '<span style="color:#2563eb;font-weight:700">📤 ارسال برنامه به راننده</span>';
      if (aObj && aObj.totalKg != null) detailParts.push('وزن کل بار: ' + fa(Math.round(aObj.totalKg)) + ' کیلوگرم');
      if (l.reason) detailParts.push('تایید استثنا: ' + l.reason);
    } else if (act === 'plan_updated') {
      actionTitle = '<span style="color:#2563eb;font-weight:700">🔄 به‌روزرسانی برنامه سفر</span>';
      if (aObj && aObj.totalKg != null) detailParts.push('وزن جدید بار: ' + fa(Math.round(aObj.totalKg)) + ' کیلوگرم');
      if (l.reason) detailParts.push('توضیح: ' + l.reason);
    } else if (act === 'stop_edited_by_admin') {
      actionTitle = '<span style="color:#2563eb;font-weight:700">✏️ ویرایش ماموریت / توقف توسط ادمین</span>';
      if (bObj && aObj && bObj.party !== aObj.party) detailParts.push('نام مقصد از «' + (bObj.party || '') + '» به «' + (aObj.party || '') + '» تغییر کرد');
      if (aObj && aObj.note) detailParts.push('شرح: ' + aObj.note);
    } else if (act === 'stop_deleted_by_admin') {
      actionTitle = '<span class="fl-bad">🗑 حذف ماموریت / توقف توسط ادمین</span>';
      if (bObj && bObj.party) detailParts.push('مقصد «' + bObj.party + '» از مسیر حذف شد');
    } else if (act === 'stop_photo_uploaded') {
      actionTitle = '📷 ثبت عکس رسید تحویل';
      detailParts.push('تصویر رسید تحویل توسط راننده بارگذاری شد');
    } else if (act === 'stop_signature_uploaded') {
      actionTitle = '✍️ ثبت امضای دیجیتال تحویل';
      detailParts.push('امضای گیرنده توسط راننده ثبت شد');
    } else if (act.indexOf('exception_') === 0) {
      actionTitle = '✅ رسیدگی و بستن مورد استثنا';
      if (l.reason) detailParts.push('توضیح: ' + l.reason);
    } else if (act === 'update_stale_threshold') {
      actionTitle = '⏱ تغییر تنظیمات زمان تازگی لوکیشن';
      if (aObj && aObj.staleThresholdSec) detailParts.push('زمان مجاز به ' + fa(aObj.staleThresholdSec) + ' ثانیه تغییر یافت');
    } else {
      actionTitle = '<b>' + esc(act) + '</b>';
      if (l.reason) detailParts.push(l.reason);
    }

    var targetInfo = [];
    if (veh) targetInfo.push('🚚 <b>' + esc(veh) + '</b>');
    if (party) targetInfo.push('📍 مقصد: <b>' + esc(party) + '</b>');
    if (l.planDate) targetInfo.push('📅 برنامهٔ ' + esc(l.planDate));

    return {
      dateTimeStr: dateTimeStr,
      actionTitle: actionTitle,
      targetHtml: targetInfo.length ? targetInfo.join(' · ') : '—',
      actorHtml: actorStr,
      detailText: detailParts.length ? detailParts.join(' | ') : (l.reason || '—'),
      tripId: l.tripId || l.trip_id || null
    };
  }

  function showAuditLogModal() {
    ensureModalReady();
    openModal('<h3>📜 سوابق تغییرات عملیاتی</h3><div class="fl-empty">در حال دریافت…</div>');
    api('audit-log?limit=120').then(function (j) {
      var rows = (j.logs || []).map(function (l, i) {
        var f = formatAuditRow(l);
        return '<tr>'
          + '<td>' + fa(i + 1) + '</td>'
          + '<td style="white-space:nowrap;font-size:11.5px">' + esc(f.dateTimeStr) + '</td>'
          + '<td>' + f.actionTitle + '</td>'
          + '<td style="font-size:11.5px">' + f.targetHtml + '</td>'
          + '<td>' + f.actorHtml + '</td>'
          + '<td>' + esc(f.detailText) + (f.tripId ? ' <button class="fl-btn" style="padding:2px 6px;font-size:10px" onclick="__flDetail(\'' + esc(f.tripId) + '\')">مشاهده سفر</button>' : '') + '</td>'
          + '</tr>';
      }).join('');
      openModal('<h3>📜 سوابق تغییرات عملیاتی</h3>'
        + '<div class="sub" style="margin-bottom:8px">تاریخچهٔ کامل و قابل فهم تمام عملیات انجام‌شده توسط رانندگان و مدیران (شروع و پایان سفر، ثبت تحویل یا عدم تحویل، ویرایش و حذف ماموریت‌ها).</div>'
        + '<div style="overflow:auto;max-height:65vh"><table><thead><tr><th>#</th><th>تاریخ و ساعت</th><th>نوع عملیات</th><th>خودرو و مقصد مربوطه</th><th>انجام‌دهنده</th><th>شرح و جزئیات</th></tr></thead><tbody>'
        + (rows || '<tr><td colspan="6" class="fl-empty">هنوز موردی ثبت نشده است.</td></tr>')
        + '</tbody></table></div>' + CLOSE);
    }).catch(function (e) { openModal('<div class="fl-warn">' + esc(e.message) + '</div>' + CLOSE); });
  }

  function showStaleThresholdModal() {
    var curSec = (F.controlCenter && F.controlCenter.staleThresholdSec) || 120;
    var val = prompt('آستانه قدیمی شدن موقعیت مکانی (Stale Location Threshold) بر حسب ثانیه (بین ۳۰ تا ۳۶۰۰ ثانیه):', String(curSec));
    if (val === null) return;
    var num = Number(val);
    if (!isFinite(num) || num < 30 || num > 3600) {
      toast('لطفاً عددی بین ۳۰ تا ۳۶۰۰ ثانیه وارد کنید.', 'error');
      return;
    }
    api('settings/stale-threshold', 'POST', { staleThresholdSec: Math.round(num) }).then(function (j) {
      toast('آستانه تازگی موقعیت به ' + fa(j.staleThresholdSec) + ' ثانیه تغییر یافت.');
      poll(true);
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  function sendPublishRequest(planDateNorm, vehicles, overrideApproval) {
    var btn = $('planFleetBtn'); if (btn) btn.disabled = true;
    var body = { planDate: planDateNorm, origin: parseOrigin(), vehicles: vehicles };
    if (overrideApproval) body.overrideApproval = overrideApproval;
    return api('publish', 'POST', body)
      .then(function (j) {
        closeModal();
        toast('برنامه برای ' + fa((j.trips || []).length) + ' ماشین ارسال شد. راننده‌ها در /driver می‌بینند.');
        if (F.open) poll(true);
      })
      .catch(function (e) {
        if (e && e.status === 409 && e.payload && e.payload.code === 'CAPACITY_OR_WEIGHT_EXCEPTION') {
          openPublishOverrideModal(planDateNorm, vehicles, e.payload.violations || []);
          return;
        }
        toast('ارسال نشد: ' + (e.notFound ? OLD_SERVER : e.message), 'error');
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  function openPublishOverrideModal(planDateNorm, vehicles, violations) {
    ensureModalReady();
    var vRows = (violations || []).map(function (v) {
      var list = v.reasons || v.violations || [];
      var detailBullets = list.map(function (vi) {
        return '<li style="margin-right:16px;color:#b91c1c">' + esc(typeof vi === 'string' ? vi : vi.message) + '</li>';
      }).join('');
      return '<div style="padding:8px 10px;border:1px solid #fca5a5;background:#fef2f2;border-radius:10px;margin-bottom:8px">'
        + '<b>🚚 ' + esc(v.vehicleLabel || v.vehicleKey) + '</b> (وزن: ' + fa(Math.round(v.totalKg || 0)) + ' از ' + fa(Math.round(v.capacityKg || v.maxKg || 0)) + ' کیلو)'
        + '<ul style="margin-top:4px;font-size:12px">' + detailBullets + '</ul>'
        + '</div>';
    }).join('');
    openModal(
      '<h3 style="color:#dc2626">⚖️ هشدار استثنای ظرفیت خودرو یا وزن نامشخص پیش از انتشار</h3>'
      + '<div class="sub" style="margin-bottom:10px;line-height:1.9">طبق سیاست کنترل ظرفیت (بخش ۲.۳ دستورکار)، خودروهای زیر دارای <b>اضافه‌بار</b> یا <b>فاکتور با وزن نامشخص / ناقص</b> هستند. وزن نامشخص هرگز صفر قطعی فرض نمی‌شود.<br>برای ارسال این برنامه به رانندگان، یا ابتدا بار را در جدول برنامه‌ریزی اصلاح کنید، یا <b>دلیل تایید استثنا</b> را در کادر زیر ثبت نمایید تا در سوابق ممیزی (Audit Log) ثبت شود:</div>'
      + '<div style="max-height:38vh;overflow:auto;margin-bottom:10px">' + vRows + '</div>'
      + '<label style="font-size:12.5px;font-weight:800;color:#991b1b">علت تایید استثنای ظرفیت / وزن نامشخص توسط مدیر (الزامی):</label>'
      + '<input id="flOverrideReasonInput" class="fl-input-wide" style="width:100%;margin-top:6px;height:40px" placeholder="مثلاً: بار حجیم نیست و با هماهنگی سرپرست انبار روی نیسان/پراید بارگیری شده است">'
      + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
      + '<button class="fl-btn" type="button" onclick="__flClose()">انصراف و اصلاح برنامه</button>'
      + '<button class="fl-btn pri" type="button" id="flConfirmOverridePublishBtn" style="background:#dc2626;border-color:#dc2626">⚡ تایید مسئولیت استثنا و ارسال به رانندگان</button>'
      + '</div>'
    );
    if ($('flConfirmOverridePublishBtn')) {
      $('flConfirmOverridePublishBtn').onclick = function () {
        var r = String(($('flOverrideReasonInput') && $('flOverrideReasonInput').value) || '').trim();
        if (!r) { alert('لطفاً علت تایید استثنا را وارد کنید.'); return; }
        this.disabled = true;
        sendPublishRequest(planDateNorm, vehicles, { approved: true, reason: r, approvedBy: (sess() && sess().name) || 'admin' });
      };
    }
  }

  function collectPublishableVehicles(filterKeys) {
    var plan = window.__lastPlan;
    if (!plan || !plan.vehicles) return { vehicles: [], noCoord: 0, partialW: 0, planDateNorm: '' };
    var inactive = []; try { inactive = aiSettings.inactiveVehicles || []; } catch (e) {}
    var defaultCaps = { nissan: 2000, paykan: 850, pride1: 650, pride2: 650 };
    var vehicles = [], noCoord = 0, partialW = 0;
    var allowedSet = Array.isArray(filterKeys) && filterKeys.length ? filterKeys : null;

    Object.keys(plan.vehicles).forEach(function (vk) {
      if (allowedSet && allowedSet.indexOf(vk) < 0) return;
      var veh = plan.vehicles[vk];
      if (!veh || !veh.items || !veh.items.length) return;
      if (vk === 'pickup' || vk === 'khavar' || /انبار|خاور/.test(veh.name || '')) return;
      if (inactive.indexOf(vk) >= 0 && vk !== 'khavar' && !allowedSet) return;
      var maxKg = (window.aiSettings && window.aiSettings.capacity && Number(window.aiSettings.capacity[vk])) || veh.cap || defaultCaps[vk] || 650;
      if (vk === 'nissan' && maxKg === 1200) maxKg = 2000;
      var maxCartons = (window.aiSettings && window.aiSettings.capacityCartons && Number(window.aiSettings.capacityCartons[vk])) || veh.cartonCap || null;
      var groups = veh.routeStops;
      if (!groups) {
        var mp = {}; groups = [];
        veh.items.forEach(function (i) {
          if (i && i.isMiscMission) return;
          var k = i.destName || i.party;
          if (!mp[k]) { mp[k] = { name: k, items: [], coord: null }; groups.push(mp[k]); }
          mp[k].items.push(i);
        });
      }
      var vehNoCoord = 0, vehPartialW = 0, vehTotalKg = 0, vehInvCount = 0;
      var stops = groups.map(function (g) {
        var invItems = (g.items || []).filter(function (i) { return !i.isMiscMission; });
        if (!invItems.length) return null;
        var ok = g.coord && !g.approx && !g.unknown;
        if (!ok) { noCoord++; vehNoCoord++; }
        var distinctParties = [];
        invItems.forEach(function (i) {
          var p = String(i.party || '').trim();
          if (p && distinctParties.indexOf(p) < 0) distinctParties.push(p);
        });
        var firstParty = distinctParties[0] || g.name || '';
        var party = distinctParties.length > 1
          ? ((g.name && g.name.indexOf('باربری') >= 0 ? g.name.split('،')[0] + ' — ' : '') + distinctParties.join(' ، '))
          : firstParty;
        return {
          party: party,
          ck: (typeof custKey === 'function' ? custKey(firstParty) : ''),
          address: g.name && g.name !== party ? g.name : '',
          lat: ok ? g.coord[0] : null,
          lng: ok ? g.coord[1] : null,
          items: invItems.map(function (i) {
            var ex = i.loadSrc === 'warehouse';
            if (!ex) { partialW++; vehPartialW++; }
            var wSt = i.weightStatus || (ex ? 'confirmed' : (i.loadSrc === 'partial' ? 'partial' : 'unknown'));
            var sUid = i.shipmentUid || (typeof window.getShipmentUid === 'function' ? window.getShipmentUid(i) : '');
            var itemKg = Number(i.loadKg || 0);
            vehTotalKg += itemKg;
            vehInvCount++;
            return {
              id: i.id || null,
              shipmentUid: sUid,
              company: i.company || '',
              party: i.party || party,
              sheet: i.sheet,
              number: i.number,
              kg: itemKg,
              exact: ex,
              weightStatus: wSt,
              cartons: i.loadCartons,
              note: i.loadNote || ''
            };
          })
        };
      }).filter(Boolean);
      var miscCount = (veh.items || []).filter(function (i) { return i && i.isMiscMission; }).length;
      if (!stops.length) return;
      var drvName = typeof window.getVehicleDriverName === 'function' ? window.getVehicleDriverName(vk) : '';
      vehicles.push({
        key: vk,
        label: veh.name || vk,
        driverName: drvName || 'تعیین‌نشده',
        closed: !!veh.routeClosed,
        maxKg: maxKg,
        maxCartons: maxCartons,
        totalKg: Math.round(vehTotalKg),
        invCount: vehInvCount,
        miscCount: miscCount,
        noCoord: vehNoCoord,
        partialW: vehPartialW,
        stops: stops
      });
    });
    var planDateNorm = String(plan.date || '').split('/').map(function (x, i) { return i ? x.padStart(2, '0') : x; }).join('/');
    return { vehicles: vehicles, noCoord: noCoord, partialW: partialW, planDateNorm: planDateNorm, rawDate: plan.date || '' };
  }

  function publishSingleVehiclePlan(vehicleKey) {
    var plan = window.__lastPlan;
    if (!plan || !plan.vehicles) { toast('ابتدا «پردازش مسیرها» را بزنید تا برنامه ساخته شود.', 'info'); return; }
    if (!canWrite()) { toast('این حساب فقط اجازهٔ مشاهده دارد.', 'error'); return; }
    build();
    ensureModalReady();
    var res = collectPublishableVehicles([vehicleKey]);
    if (!res.vehicles.length) {
      // اگر این خودرو فاکتوری ندارد، پنجره ثبت ماموریت متفرقه را برای همین خودرو باز کن
      openMiscMissionModal(vehicleKey);
      return;
    }
    var v = res.vehicles[0];
    var msg = 'آیا مسیر و ماموریت‌های تاریخ ' + res.rawDate + ' فقط برای خودروی «' + v.label + '» (راننده: ' + v.driverName + ') ارسال شود؟\n\n'
      + '• تعداد توقف: ' + fa(v.stops.length) + ' مقصد (' + fa(v.invCount) + ' فاکتور — ' + fa(v.totalKg) + ' کیلوگرم)'
      + (v.noCoord ? '\n⚠ ' + fa(v.noCoord) + ' توقف لوکیشن دقیق ندارد.' : '');
    if (!confirm(msg)) return;
    sendPublishRequest(res.planDateNorm, res.vehicles, null);
  }
  window.__flPublishSingleVehicle = publishSingleVehiclePlan;

  function publishPlan() {
    var plan = window.__lastPlan;
    if (!plan || !plan.vehicles) { toast('ابتدا «پردازش مسیرها» را بزنید تا برنامه ساخته شود.', 'info'); return; }
    if (!canWrite()) { toast('این حساب فقط اجازهٔ مشاهده دارد.', 'error'); return; }
    build();
    ensureModalReady();
    var res = collectPublishableVehicles(null);
    if (!res.vehicles.length) { toast('ماشینی با بار برای ارسال نیست. برای ارسال ماموریت بدون فاکتور از دکمهٔ «ثبت ماموریت متفرقه» استفاده کنید.', 'info'); return; }

    var rowsHtml = res.vehicles.map(function (v) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border,#cbd5e1);border-radius:12px;margin-bottom:8px;background:var(--bg-main,#f8fafc)">'
        + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;margin:0">'
        + '<input type="checkbox" class="fl-pub-veh-chk" value="' + esc(v.key) + '" checked style="width:18px;height:18px">'
        + '<div>'
        + '<div style="font-size:13.5px;font-weight:900">🚚 ' + esc(v.label) + ' — <span style="color:#0284c7">👤 راننده: ' + esc(v.driverName) + '</span></div>'
        + '<div class="sub" style="font-size:11.5px;margin-top:2px">'
        + '📍 <b>' + fa(v.stops.length) + ' مقصد</b> · 🧾 <b>' + fa(v.invCount) + ' فاکتور</b>'
        + (v.miscCount ? ' · 📌 <b>' + fa(v.miscCount) + ' ماموریت متفرقه</b>' : '')
        + ' · ⚖️ وزن: <b>' + fa(v.totalKg) + ' از ' + fa(v.maxKg) + ' کیلو</b>'
        + (v.noCoord ? ' · <span style="color:#d97706">⚠️ ' + fa(v.noCoord) + ' بدون لوکیشن</span>' : '')
        + '</div></div></label>'
        + '<button type="button" class="fl-btn pri" data-pub-single="' + esc(v.key) + '" style="white-space:nowrap;background:#0f766e;border-color:#0f766e;padding:7px 11px;font-size:11.5px">📤 ارسال فقط به همین راننده</button>'
        + '</div>';
    }).join('');

    var warnHtml = '';
    if (res.noCoord || res.partialW) {
      warnHtml = '<div class="fl-warn" style="margin-bottom:10px;font-size:12px">'
        + (res.noCoord ? '<div>⚠️ ' + fa(res.noCoord) + ' توقف لوکیشن دقیق ندارد (راننده نام و آدرس را می‌بیند).</div>' : '')
        + (res.partialW ? '<div>⚠️ وزن ' + fa(res.partialW) + ' فاکتور کامل نیست.</div>' : '')
        + '</div>';
    }

    openModal(
      '<h3>📲 ارسال مسیرها و ماموریت‌ها به رانندگان (برنامهٔ ' + esc(res.rawDate) + ')</h3>'
      + '<div class="sub" style="margin-bottom:10px;line-height:1.9">می‌توانید مسیر و ماموریت‌ها را <b>فقط برای یک خودرو و رانندهٔ انتخابی</b> بفرستید، یا <b>هم‌زمان برای کل خودروها و رانندگان</b> ارسال کنید:</div>'
      + '<div style="margin-bottom:12px">'
      + '<button type="button" class="fl-btn pri" id="flPubAllBtn" style="width:100%;padding:12px;font-size:14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);border:none;font-weight:900">🌐 ارسال هم‌زمان مسیرها و ماموریت‌ها برای کل خودروها و رانندگان (' + fa(res.vehicles.length) + ' خودرو)</button>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:800;margin-bottom:6px;color:var(--text-main)">یا انتخاب خودرو و رانندهٔ مورد نظر:</div>'
      + rowsHtml
      + warnHtml
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">'
      + '<button type="button" class="fl-btn" onclick="__flOpenMiscMission(\'all\')" style="border-color:#db2777;color:#db2777;font-weight:800">📌 ثبت ماموریت متفرقه (تک‌راننده یا کل رانندگان)</button>'
      + '<div style="display:flex;gap:8px">'
      + '<button type="button" class="fl-btn" onclick="__flClose()">انصراف</button>'
      + '<button type="button" class="fl-btn pri" id="flPubSelectedBtn" style="background:#16a34a;border-color:#16a34a">✅ ارسال برای خودروهای تیک‌خورده</button>'
      + '</div></div>'
    );

    if ($('flPubAllBtn')) {
      $('flPubAllBtn').onclick = function () {
        this.disabled = true;
        sendPublishRequest(res.planDateNorm, res.vehicles, null);
      };
    }
    if ($('flPubSelectedBtn')) {
      $('flPubSelectedBtn').onclick = function () {
        var chks = $('flBox').querySelectorAll('.fl-pub-veh-chk:checked');
        var selKeys = Array.prototype.map.call(chks, function (c) { return c.value; });
        if (!selKeys.length) {
          toast('لطفاً حداقل یک خودرو / راننده را انتخاب کنید.', 'error');
          return;
        }
        var filtered = res.vehicles.filter(function (v) { return selKeys.indexOf(v.key) >= 0; });
        this.disabled = true;
        sendPublishRequest(res.planDateNorm, filtered, null);
      };
    }
    Array.prototype.forEach.call($('flBox').querySelectorAll('[data-pub-single]'), function (b) {
      b.onclick = function () {
        var vk = b.getAttribute('data-pub-single');
        var singleList = res.vehicles.filter(function (v) { return v.key === vk; });
        if (!singleList.length) return;
        b.disabled = true;
        b.textContent = 'در حال ارسال…';
        sendPublishRequest(res.planDateNorm, singleList, null);
      };
    });
  }

  // ───── راه‌اندازی + واکنش آنی به رویدادهای SSE ناوگان ─────
  window.addEventListener('anbar-sse-notification', function (ev) {
    var d = (ev && ev.detail) || {};
    if (F.open) poll(true);
    if (typeof window.refreshFleetPlanningState === 'function') window.refreshFleetPlanningState(true);
    if (pollingTripId && typeof activeConversationRefresh === 'function') activeConversationRefresh();
  });
  function init() {
    if (!build()) { setTimeout(init, 500); return; }
    if (isAdmin() && /#fleet/.test(location.hash)) { var tries = 0; (function go() { if (sess() || tries++ > 20) openFleet($('navFleet')); else setTimeout(go, 400); })(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
