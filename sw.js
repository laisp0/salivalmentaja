// Salivalmentaja service worker: verkko ensin (ohittaa selaimen välimuistin), puhelimen kopio varalla.
const CACHE = 'salivalmentaja-v4';
const SHELL = ['./', 'index.html', 'app.js', 'dashboard.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'no-cache' }).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API-kutsut suoraan verkkoon
  const varalla = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) return varalla().then(v => v || r);   // virhesivu (esim. 404) ei korvaa toimivaa versiota
        const k = r.clone(); caches.open(CACHE).then(c => c.put(e.request, k));
        return r;
      })
      .catch(varalla)
  );
});
