/* Verbindet die App mit Firebase (Google-Login + Firestore). Ohne Konfiguration läuft die App lokal auf dem Gerät. */
(function () {
  var cfg = window.FIREBASE_CONFIG, fb = window.firebase;
  var configured = !!(cfg && cfg.apiKey && cfg.apiKey.indexOf('DEIN') !== 0 && fb);
  var de = false; try { var pl = JSON.parse(localStorage.getItem('waypals-pref') || '{}'); de = pl.lang === 'de'; } catch (e) {}
  var T = function (a, b) { return de ? a : b };
  var LOCALKEY = 'waypals-localmode';
  var resolveReady, ready = new Promise(function (r) { resolveReady = r });
  var auth, fs, user;

  function lsGet(k) { try { return localStorage.getItem(k) } catch (e) { return null } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (e) {} }

  function wrapDoc(ref) {
    return {
      get: function () { return ref.get().then(function (s) { return { id: s.id, exists: s.exists, data: function () { return s.data() } } }) },
      set: function (d) { return ref.set(d) },
      update: function (d) { return ref.update(d) },
      delete: function () { return ref.delete() },
      onSnapshot: function (ok, err) { return ref.onSnapshot(ok, err) }
    };
  }
  function wrapCol(ref) {
    return {
      doc: function (id) { return wrapDoc(ref.doc(id)) },
      onSnapshot: function (ok, err) { return ref.onSnapshot(ok, err) },
      get: function () { return ref.get() }
    };
  }
  var dbApi = {
    collection: function (p) { return wrapCol(fs.collection(p)) },
    doc: function (p) { return wrapDoc(fs.doc(p)) }
  };

  function loginScreen() {
    var o = document.createElement('div');
    o.id = 'wp-login';
    o.setAttribute('role', 'dialog');
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:#FFF8EE;color:#2D2A3E;font-family:Nunito,system-ui,sans-serif;text-align:center';
    o.innerHTML = '<div style="max-width:340px;display:grid;gap:14px">' +
      '<img src="icons/icon-192.png" alt="" width="96" height="96" style="margin:0 auto;border-radius:22px">' +
      '<h1 style="margin:0;font-size:28px">Waypals</h1>' +
      '<p style="margin:0;color:#6F6A85">' + T('Dein Freundebuch für unterwegs. Melde dich an, damit deine Einträge gespeichert werden und auf all deinen Geräten da sind.', 'Your friend book for the road. Sign in so your entries are saved and available on all your devices.') + '</p>' +
      '<button id="wp-g" style="padding:14px;border-radius:14px;border:0;background:#0B7F78;color:#fff;font:700 16px Nunito,system-ui,sans-serif;cursor:pointer">' + T('Mit Google anmelden', 'Sign in with Google') + '</button>' +
      '<button id="wp-l" style="padding:12px;border-radius:14px;border:2px solid #EADFCF;background:transparent;color:inherit;font:600 15px Nunito,system-ui,sans-serif;cursor:pointer">' + T('Ohne Konto fortfahren (nur auf diesem Gerät)', 'Continue without account (this device only)') + '</button>' +
      '<p id="wp-err" style="margin:0;color:#B3261E;min-height:1em" role="alert"></p>' +
      '<p style="margin:0;font-size:12px;color:#6F6A85">' + T('Mit der Anmeldung stimmst du der Verarbeitung deiner Daten laut ', 'By signing in you agree to the processing of your data as described in the ') + '<a href="datenschutz.html" style="color:inherit">' + T('Datenschutzerklärung', 'privacy policy') + '</a>' + T(' zu.', '.') + '</p></div>';
    document.body.appendChild(o);
    o.querySelector('#wp-g').onclick = function () {
      var p = new fb.auth.GoogleAuthProvider();
      auth.signInWithPopup(p).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
        o.querySelector('#wp-err').textContent = T('Anmeldung fehlgeschlagen. Bitte nochmal versuchen.', 'Sign-in failed. Please try again.');
      });
    };
    o.querySelector('#wp-l').onclick = function () { lsSet(LOCALKEY, '1'); o.remove(); resolveReady(null) };
    return o;
  }

  function deleteAccount() {
    var uid = user.uid;
    try { localStorage.removeItem('wegmarken-post-v1'); localStorage.removeItem('wegmarken-v1'); localStorage.removeItem('wegmarken-owner'); localStorage.removeItem(LOCALKEY) } catch (e) {}
    function wipe(colPath) {
      return fs.collection(colPath).get().then(function (s) {
        return Promise.all(s.docs.map(function (d) { return d.ref.delete() }));
      });
    }
    return wipe('data/users/' + uid)
      .then(function () { return fs.doc('pals/' + uid).delete().catch(function () {}) })
      .then(function () { return fs.collection('quests').where('from', '==', uid).get().then(function (s) { return Promise.all(s.docs.map(function (d) { return d.ref.delete() })) }).catch(function () {}) })
      .then(function () { return fs.collection('quests').where('to', '==', uid).get().then(function (s) { return Promise.all(s.docs.map(function (d) { return d.ref.delete() })) }).catch(function () {}) })
      .then(function () { return user.delete() })
      .then(function () { try { localStorage.clear() } catch (e) {} setTimeout(function () { location.reload() }, 800) });
  }

  if (!configured) {
    window.claude = { use: function () { return Promise.resolve(null) } };
  } else {
    fb.initializeApp(cfg);
    auth = fb.auth(); fs = fb.firestore();
    try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () {}) } catch (e) {}
    var overlay = null;
    auth.onAuthStateChanged(function (u) {
      if (u) {
        user = u; lsSet(LOCALKEY, null);
        window.WAYPALS_AUTH = {
          email: u.email, name: u.displayName,
          signOut: function () { auth.signOut().then(function () { location.reload() }) },
          deleteAccount: deleteAccount
        };
        if (overlay) { overlay.remove(); overlay = null }
        resolveReady(u);
      } else if (lsGet(LOCALKEY)) {
        window.WAYPALS_AUTH = null; resolveReady(null);
      } else if (!overlay) {
        var mk = function () { overlay = loginScreen() };
        document.body ? mk() : document.addEventListener('DOMContentLoaded', mk);
      }
    });
    window.claude = {
      use: function (n) {
        return ready.then(function (u) {
          if (!u) return null;
          if (n === 'db') return dbApi;
          if (n === 'user') return { id: function () { return Promise.resolve(u.uid) }, isOwner: function () { return true } };
          return null;
        });
      }
    };
  }
})();
