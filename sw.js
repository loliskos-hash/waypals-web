/* Offline-Cache für die App-Hülle. Firebase/Firestore kümmern sich selbst um Offline-Daten. */
var V = 'waypals-v67';
var FILES = ['./', 'index.html', 'fonts.css', 'fonts/nunito.woff', 'fonts/caveat.woff', 'fonts/patrickhand.woff', 'shim.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'datenschutz.html', 'impressum.html'];
/* Bei schlechtem Netz höchstens so lange auf den Server warten, dann die gespeicherte Fassung zeigen (sonst hängt die Seite beim Neuladen) */
var WAIT = 3500;
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return Promise.all(FILES.map(function (f) { return fetch(new Request(f, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(f, r) }).catch(function () {}) }));
  }).then(function () { return self.skipWaiting() }));
});
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V }).map(function (k) { return caches.delete(k) })) }).then(function () { return self.clients.claim() })) });
function keep(r, res) { if (res && res.ok && res.type === 'basic') { var cp = res.clone(); caches.open(V).then(function (c) { return c.put(r, cp) }).catch(function () {}) } return res }
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || r.headers.has('range') || new URL(r.url).origin !== location.origin) return;
  if (/\/sprites\//.test(r.url)) { e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { return keep(r, res) }) })); return }
  var nav = r.mode === 'navigate';
  var cached = function () { return caches.match(r, { ignoreSearch: nav }).then(function (m) { return m || (nav ? caches.match('index.html') : undefined) }) };
  var net = fetch(r).then(function (res) { return keep(r, res) });
  e.respondWith(new Promise(function (ok, no) {
    var done = false;
    function give(res) { if (!done && res) { done = true; ok(res) } }
    var t = setTimeout(function () { cached().then(give) }, WAIT);
    net.then(function (res) { clearTimeout(t); give(res) }, function () { clearTimeout(t); cached().then(function (m) { if (m) give(m); else if (!done) { done = true; no(new Error('offline')) } }) });
  }));
});
