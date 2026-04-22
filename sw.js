/* ═══════════════════════════════════════════════════════════
   MACARIO LITE — SERVICE WORKER
   Offline fallback + cache de assets estáticos
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'macario-lite-cache-3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

/* Install: cache static assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const OFFLINE_HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Macario — Sin conexión</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#FAFAFA;color:#0A0A0A;text-align:center;padding:20px}.offline{max-width:360px}.offline h1{font-size:20px;font-weight:800;margin-bottom:12px}.offline p{font-size:13px;color:#8A8A8A;line-height:1.6;margin-bottom:20px}.retry{padding:12px 24px;background:#0A0A0A;color:#fff;border:none;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}</style></head><body><div class="offline"><h1>Sin conexión</h1><p>No hay conexión a internet. Verificá tu WiFi o datos móviles e intentá de nuevo.</p><button class="retry" onclick="location.reload()">Reintentar</button></div></body></html>';

/* Fetch: network-first for HTML/JS (siempre código fresco), cache-first para el resto */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Supabase: siempre red, sin caché */
  if (url.hostname.includes('supabase.co')) return;

  /* app.js, index.html, / — network-first: nunca servir código viejo desde caché */
  const isAppCode = url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js');
  if (isAppCode) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } })
        )
      )
    );
    return;
  }

  /* CSS, íconos, manifest — cache-first con actualización en background */
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } }));
      return cached || fetchPromise;
    })
  );
});
