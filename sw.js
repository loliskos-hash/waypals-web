/* Offline-Cache für die App-Hülle. Firebase/Firestore kümmern sich selbst um Offline-Daten. */
var V = 'waypals-v2';
var FILES = ['./', 'index.html', 'fonts.css', 'fonts/nunito.woff', 'fonts/caveat.woff', 'fonts/patrickhand.woff', 'shim.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'datenschutz.html', 'impressum.html'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(FILES) }).then(function () { return self.skipWaiting() })) });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V }).map(function (k) { return caches.delete(k) })) }).then(function () { return self.clients.claim() })) });
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (/\/sprites\//.test(r.url)) { e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp) }); return res }) })); return }
  e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp) }); return res }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('index.html') }) }));
});
