/* Offline-Cache für die App-Hülle. Firebase/Firestore kümmern sich selbst um Offline-Daten. */
var V = 'waypals-v102';
var FILES = ['./', 'index.html', 'fonts.css', 'fonts/nunito.woff', 'fonts/caveat.woff', 'fonts/patrickhand.woff', 'fonts/dm-sans-latin-wght-normal.woff2', 'fonts/cormorant-garamond-latin-600-normal.woff2', 'fonts/cormorant-garamond-latin-700-normal.woff2', 'shim.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'datenschutz.html', 'impressum.html'];
/* Start ohne Warten: App-Hülle sofort aus dem Speicher, neue Fassung still im Hintergrund holen (gilt ab dem nächsten Start).
   Früher wurde index.html (über 800 KB) bei jedem Start zuerst vom Server geladen; bei schwachem Netz hing die App auf dem Startbild. */
var WAIT = 3500;
var FB = /^https:\/\/www\.gstatic\.com\/firebasejs\/[0-9.]+\//;
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return Promise.all(FILES.map(function (f) { return fetch(new Request(f, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(f, r) }).catch(function () {}) }));
  }).then(function () { return self.skipWaiting() }));
});
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V && k !== 'waypals-fb' && k !== 'waypals-fig' }).map(function (k) { return caches.delete(k) })) }).then(function () { return self.clients.claim() })) });
function keep(r, res) { if (res && res.ok && res.type === 'basic') { var cp = res.clone(); caches.open(V).then(function (c) { return c.put(r, cp) }).catch(function () {}) } return res }
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return;
  /* Firebase-Bibliothek: Adresse enthält die Versionsnummer, ändert sich also nie. Einmal laden, dann aus dem Speicher. */
  if (FB.test(r.url)) {
    e.respondWith(caches.open('waypals-fb').then(function (c) { return c.match(r).then(function (m) { return m || fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()).catch(function () {}); return res }) }) }));
    return;
  }
  if (new URL(r.url).origin !== location.origin) return;
  if (/\/sprites\//.test(r.url)) { e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { return keep(r, res) }) })); return }
  var nav = r.mode === 'navigate';
  var net = fetch(r).then(function (res) { return keep(r, res) });
  var cached = caches.match(r, { ignoreSearch: nav }).then(function (m) { return m || (nav ? caches.match('index.html') : undefined) });
  e.waitUntil(net.catch(function () {}));
  e.respondWith(cached.then(function (m) {
    if (m) return m;
    /* Noch nichts gespeichert: wie bisher vom Server, bei Funkloch nach WAIT doch noch Cache versuchen */
    return new Promise(function (ok, no) {
      var done = false;
      function give(res) { if (!done && res) { done = true; ok(res) } }
      var t = setTimeout(function () { caches.match('index.html').then(function (x) { if (nav) give(x) }) }, WAIT);
      net.then(function (res) { clearTimeout(t); give(res) }, function () { clearTimeout(t); if (!done) { done = true; no(new Error('offline')) } });
    });
  }));
});
/* Push-Benachrichtigungen (über Firebase Cloud Messaging, Nachricht kommt als data: title, body, tag, url) */
self.addEventListener('push', function (e) {
  var p = {}; try { p = e.data ? e.data.json() : {} } catch (x) { try { p = { data: { body: e.data.text() } } } catch (y) {} }
  var d = p.data || p, n = p.notification || {};
  var title = d.title || n.title || 'Waypals', body = d.body || n.body || '';
  e.waitUntil(self.registration.showNotification(title, { body: body, tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) return cs[i].focus() }
    return self.clients.openWindow(url);
  }));
});
