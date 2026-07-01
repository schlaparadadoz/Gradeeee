/* ================================================================
   Grade-Check Vault – Service Worker
   ----------------------------------------------------------------
   Gibt der App echtes Offline (öffnet auch ohne Netz nach dem
   ersten Laden) und macht sie sauber installierbar (PWA).

   Deployment: einfach neben index.html legen (z. B. GitHub Pages,
   gleicher Ordner). Muss über http(s) laufen – nicht über file://.

   Strategie:
   • App-Shell (index.html, gleiche Origin) → cache-first, im
     Hintergrund aktualisiert (stale-while-revalidate).
   • CDN-Bibliotheken (three.js, Tesseract, GSAP, Firebase) →
     stale-while-revalidate, damit sie nach dem ersten Laden auch
     offline verfügbar sind.
   • API-Aufrufe (Preise/Karten: tcgdex, ygoprodeck) und alles
     andere → NICHT gecacht (immer Netz), damit keine veralteten
     Preise ausgeliefert werden.
================================================================ */
const CACHE = 'gcv-cache-v1';
const SHELL = ['./', './index.html'];

// Hosts, deren Bibliotheks-Dateien fürs Offline gecacht werden dürfen:
const CDN_HOSTS = [
  'www.gstatic.com',        // Firebase
  'cdn.jsdelivr.net',       // three.js, Tesseract
  'cdnjs.cloudflare.com'    // localForage/Howler (falls genutzt)
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  const sameOrigin = url.origin === self.location.origin;
  const isCDN = CDN_HOSTS.includes(url.host);

  // App-Shell: cache-first + Hintergrund-Update
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit || caches.match('./index.html'));
        return hit || net;
      })
    );
    return;
  }

  // CDN-Bibliotheken: stale-while-revalidate
  if (isCDN) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Alles andere (APIs etc.): unberührt lassen -> Standard-Netzwerk
});
