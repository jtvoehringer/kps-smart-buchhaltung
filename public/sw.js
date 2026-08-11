// KPS Smart Buchhaltung – minimaler Service Worker
//
// Zweck: Installierbarkeit als PWA (Chrome/Android verlangen einen registrierten
// Service Worker mit fetch-Handler). Bewusst OHNE Precaching/Offline-Cache von
// App-Code oder Daten – die App arbeitet laufend gegen Supabase (Live-Daten),
// aggressives Caching von JS/CSS-Bundles würde nach Deploys veraltete Versionen
// ausliefern. Es wird lediglich, wenn ein Netzwerk-Request fehlschlägt (z.B.
// kein Empfang beim Scannen unterwegs), best-effort im Browser-HTTP-Cache
// nachgesehen.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
