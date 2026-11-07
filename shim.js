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
      onSnapshot: function (a, b, c) { return (a && typeof a === 'object') ? ref.onSnapshot(a, b, c) : ref.onSnapshot(a, b) }
    };
  }
  function wrapCol(ref) {
    return {
      doc: function (id) { return wrapDoc(ref.doc(id)) },
      onSnapshot: function (a, b, c) { return (a && typeof a === 'object') ? ref.onSnapshot(a, b, c) : ref.onSnapshot(a, b) },
      get: function () { return ref.get() },
      where: function (f, op, v) { return wrapCol(ref.where(f, op, v)) }
    };
  }
  var dbApi = {
    collection: function (p) { return wrapCol(fs.collection(p)) },
    doc: function (p) { return wrapDoc(fs.doc(p)) },
    tx: function (fn) { return fs.runTransaction(function (t) { return fn(t, function (p) { return fs.doc(p) }) }) }
  };

  // In-App-Browser (Instagram, Facebook, Messenger, TikTok, Snapchat, LINE): Google sperrt dort die Anmeldung.
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|musical_ly|Bytedance|TikTok|Snapchat|Line\//i.test(navigator.userAgent || '');
  var iosDev = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  // Einladungslink (#w-i…): Gäste tragen sich ohne Konto ein, also kein Anmeldebildschirm davor.
  // Ausnahme: Gast hat im Formular „Anmelden“ getippt.
  var wantLogin = false; try { wantLogin = sessionStorage.getItem('waypals-wantlogin') === '1'; sessionStorage.removeItem('waypals-wantlogin') } catch (e) {}
  var startHref = location.href;
  var codeLink = /w-[pc][A-Za-z0-9_-]{8,}/.test(location.hash || '');
  // Antwort-Links (#w-p…) zeigen die Antwort auch ohne Anmeldung; anmelden lässt sich dann im Fenster selbst
  var guestLink = !wantLogin && /w-[ipc][A-Za-z0-9_-]{8,}/.test(location.hash || '');

  // Anmeldung per E-Mail-Link (ohne Passwort): Adresse merken, damit der Link auf diesem Gerät ohne Rückfrage anmeldet
  var EMAILKEY = 'waypals-signin-email', HASHKEY = 'waypals-signin-hash', LINKKEY = 'waypals-addmail', LINKRES = 'waypals-addmail-result';
  var BTN = 'padding:14px;border-radius:14px;border:0;background:#0B7F78;color:#fff;font:700 16px Nunito,system-ui,sans-serif;cursor:pointer';
  var BTN2 = 'padding:12px;border-radius:14px;border:2px solid #EADFCF;background:transparent;color:inherit;font:600 15px Nunito,system-ui,sans-serif;cursor:pointer';
  var INP = 'padding:13px 14px;border-radius:14px;border:2px solid #EADFCF;background:#fff;color:#2D2A3E;font:500 16px Nunito,system-ui,sans-serif;width:100%;box-sizing:border-box';
  var NOTE = 'margin:0;padding:10px 12px;border-radius:12px;background:#FFF1C9;color:#2D2A3E;font-size:14px';
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function okMail(m) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) }
  function linkErr(e) {
    var c = e && e.code || '';
    if (c === 'auth/invalid-email') return T('Diese E-Mail-Adresse stimmt nicht. Bitte prüfe sie.', 'This email address is not valid. Please check it.');
    if (c === 'auth/invalid-action-code' || c === 'auth/expired-action-code') return T('Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.', 'This sign-in link has expired or was already used. Just request a new one.');
    if (c === 'auth/too-many-requests' || c === 'auth/quota-exceeded') return T('Gerade wurden zu viele Links verschickt. Bitte versuche es später nochmal oder melde dich mit Google an.', 'Too many links were sent just now. Please try again later or sign in with Google.');
    if (c === 'auth/network-request-failed') return T('Keine Verbindung. Bitte prüfe dein Internet.', 'No connection. Please check your internet.');
    return T('Das hat nicht geklappt. Bitte nochmal versuchen.', 'That did not work. Please try again.') + (c ? ' (' + c.replace('auth/', '') + ')' : '');
  }
  function cleanUrl() {
    var h = lsGet(HASHKEY) || ''; lsSet(HASHKEY, null);
    try { history.replaceState(null, '', location.pathname + h) } catch (e) {}
    if (h) setTimeout(function () { try { window.dispatchEvent(new HashChangeEvent('hashchange')) } catch (e) {} }, 1200);
  }
  function sendLink(mail) {
    lsSet(EMAILKEY, mail);
    if (location.hash) lsSet(HASHKEY, location.hash);
    return auth.sendSignInLinkToEmail(mail, { url: location.origin + location.pathname, handleCodeInApp: true });
  }
  function signInLink(mail, href) {
    return auth.signInWithEmailLink(mail, href).then(function (r) { lsSet(EMAILKEY, null); return r });
  }
  function shell(inner) {
    var o = document.createElement('div');
    o.id = 'wp-login';
    o.setAttribute('role', 'dialog');
    o.style.cssText = 'position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:24px;background:#FFF8EE;color:#2D2A3E;font-family:Nunito,system-ui,sans-serif;text-align:center;overflow:auto';
    o.innerHTML = '<div style="max-width:340px;width:100%;display:grid;gap:14px;margin:auto">' +
      '<img src="icons/icon-192.png" alt="" width="84" height="84" style="margin:0 auto;border-radius:20px">' +
      '<h1 style="margin:0;font-size:28px">Waypals</h1>' + inner +
      '<p id="wp-err" style="margin:0;color:#B3261E;min-height:1em" role="alert"></p>' +
      '<p style="margin:0;font-size:12px;color:#6F6A85">' + T('Mit der Anmeldung stimmst du der Verarbeitung deiner Daten laut ', 'By signing in you agree to the processing of your data as described in the ') + '<a href="datenschutz.html" style="color:inherit">' + T('Datenschutzerklärung', 'privacy policy') + '</a>' + T(' zu.', '.') + '</p></div>';
    document.body.appendChild(o);
    return o;
  }

  function loginScreen(errMsg) {
    var o = shell(
      '<p style="margin:0;color:#6F6A85">' + T('Dein Freundebuch für unterwegs. Melde dich an, damit deine Einträge gespeichert werden und auf all deinen Geräten da sind.', 'Your friend book for the road. Sign in so your entries are saved and available on all your devices.') + '</p>' +
      '<div id="wp-mail-box" style="display:grid;gap:10px">' +
        '<input id="wp-mail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="' + T('Deine E-Mail-Adresse', 'Your email address') + '" value="' + esc(lsGet(EMAILKEY) || '') + '" style="' + INP + '">' +
        '<button id="wp-m" type="button" style="' + BTN + '">' + T('Anmeldelink per E-Mail schicken', 'Email me a sign-in link') + '</button>' +
        '<small style="color:#6F6A85">' + T('Ohne Passwort: Du bekommst eine E-Mail mit einem Link, ein Tipp darauf meldet dich an.', 'No password: you get an email with a link, one tap on it signs you in.') + '</small>' +
      '</div>' +
      '<div id="wp-sent" hidden style="display:grid;gap:10px"></div>' +
      '<div style="display:flex;align-items:center;gap:10px;color:#6F6A85;font-size:13px"><i style="flex:1;height:1px;background:#EADFCF"></i>' + T('oder', 'or') + '<i style="flex:1;height:1px;background:#EADFCF"></i></div>' +
      '<button id="wp-g" type="button" style="' + BTN2 + '">' + T('Mit Google anmelden', 'Sign in with Google') + '</button>' +
      (inApp ? '<p style="' + NOTE + '">' + T('Google erlaubt die Anmeldung nicht im Browser dieser App. Nimm den E-Mail-Link oben, oder tippe oben rechts auf ••• und wähle „' + (iosDev ? 'In Safari öffnen' : 'Im Browser öffnen') + '“.', 'Google does not allow signing in inside this app\'s browser. Use the email link above, or tap ••• at the top right and choose “' + (iosDev ? 'Open in Safari' : 'Open in browser') + '”.') + '</p>' : '') +
      ((inApp || (iosDev && !navigator.standalone)) && codeLink ? '<p style="margin:0;font-size:14px">' + T('' + (iosDev ? 'Du hast Waypals als App auf dem Home-Bildschirm? Das iPhone öffnet Links nicht in dieser App. ' : '') + 'Kopiere den Link, öffne Waypals und füge ihn bei + → „Code oder Link einfügen“ ein.', (iosDev ? 'Using Waypals from your home screen? The iPhone does not open links in that app. ' : '') + 'Copy the link, open Waypals and paste it under + → “Paste code or link”.') + '</p><button id="wp-c" type="button" style="padding:12px;border-radius:14px;border:2px solid #0B7F78;background:transparent;color:#0B7F78;font:700 15px Nunito,system-ui,sans-serif;cursor:pointer">' + T('Link kopieren', 'Copy link') + '</button>' : '') +
      '<button id="wp-l" type="button" style="' + BTN2 + ';border:0;font-weight:500;color:#6F6A85">' + T('Ohne Konto fortfahren (nur auf diesem Gerät)', 'Continue without account (this device only)') + '</button>'
    );
    var err = o.querySelector('#wp-err');
    if (errMsg) err.textContent = errMsg;
    o.querySelector('#wp-g').onclick = function () {
      var p = new fb.auth.GoogleAuthProvider();
      auth.signInWithPopup(p).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
        if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
        err.textContent = inApp ? T('Google-Anmeldung ist hier nicht möglich. Nimm den E-Mail-Link oder öffne die Seite im Browser (••• oben rechts).', 'Google sign-in is not possible here. Use the email link or open the page in your browser (••• at the top right).') : T('Anmeldung fehlgeschlagen. Bitte nochmal versuchen.', 'Sign-in failed. Please try again.');
      });
    };
    var mi = o.querySelector('#wp-mail'), mb = o.querySelector('#wp-m'), box = o.querySelector('#wp-mail-box'), sent = o.querySelector('#wp-sent');
    function showSent(mail) {
      box.hidden = true; sent.hidden = false;
      sent.innerHTML = '<p style="' + NOTE + ';background:#E3F4F1">' + T('Fast geschafft! Wir haben einen Anmeldelink an <b>' + esc(mail) + '</b> geschickt. Öffne die E-Mail und tippe auf den Link. Schau auch im Spam-Ordner nach.', 'Almost there! We sent a sign-in link to <b>' + esc(mail) + '</b>. Open the email and tap the link. Check your spam folder too.') + '</p>' +
        (navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ? '<small style="color:#6F6A85">' + T('Öffnet der Link Waypals im Browser statt hier in der App? Dann halte den Link in der E-Mail gedrückt, kopiere ihn und füge ihn hier ein:', 'Does the link open Waypals in the browser instead of this app? Then press and hold the link in the email, copy it and paste it here:') + '</small>' +
          '<input id="wp-paste" type="url" autocapitalize="off" spellcheck="false" placeholder="' + T('Link aus der E-Mail einfügen', 'Paste the link from the email') + '" style="' + INP + '"><button id="wp-pgo" type="button" style="' + BTN + '">' + T('Anmelden', 'Sign in') + '</button>' : '') +
        '<button id="wp-again" type="button" style="' + BTN2 + '">' + T('Andere Adresse oder neuen Link', 'Other address or new link') + '</button>';
      sent.querySelector('#wp-again').onclick = function () { sent.hidden = true; box.hidden = false; err.textContent = ''; mb.disabled = false; mi.focus() };
      var pg = sent.querySelector('#wp-pgo');
      if (pg) pg.onclick = function () {
        var v = (sent.querySelector('#wp-paste').value || '').trim();
        if (!auth.isSignInWithEmailLink(v)) { err.textContent = T('Das ist kein Anmeldelink. Kopiere den ganzen Link aus der E-Mail.', 'That is not a sign-in link. Copy the whole link from the email.'); return }
        pg.disabled = true; err.textContent = '';
        signInLink(mail, v).catch(function (e) { pg.disabled = false; err.textContent = linkErr(e) });
      };
    }
    mb.onclick = function () {
      var mail = (mi.value || '').trim();
      if (!okMail(mail)) { err.textContent = T('Bitte gib deine E-Mail-Adresse ein.', 'Please enter your email address.'); mi.focus(); return }
      mb.disabled = true; err.textContent = ''; mb.textContent = T('Wird geschickt …', 'Sending …');
      sendLink(mail).then(function () { showSent(mail) }, function (e) { err.textContent = linkErr(e) }).then(function () { mb.disabled = false; mb.textContent = T('Anmeldelink per E-Mail schicken', 'Email me a sign-in link') });
    };
    mi.onkeydown = function (e) { if (e.key === 'Enter') mb.onclick() };
    var cb = o.querySelector('#wp-c');
    if (cb) cb.onclick = function () {
      var url = startHref, done = function () { cb.textContent = T('Kopiert ✓', 'Copied ✓') };
      try { navigator.clipboard.writeText(url).then(done, function () { window.prompt('', url) }) } catch (e) { window.prompt('', url) }
    };
    o.querySelector('#wp-l').onclick = function () { lsSet(LOCALKEY, '1'); o.remove(); overlay = null; resolveReady(null) };
    return o;
  }

  // Link aus der E-Mail wurde geöffnet, aber die Adresse ist auf diesem Gerät/Browser nicht bekannt (anderes Gerät, App-Browser, Home-Bildschirm-App)
  function confirmScreen(href, done) {
    var o = shell(
      '<p style="margin:0;color:#6F6A85">' + T('Fast angemeldet. Gib zur Sicherheit nochmal die E-Mail-Adresse ein, an die der Link ging.', 'Almost signed in. For safety, enter the email address the link was sent to.') + '</p>' +
      '<input id="wp-mail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="' + T('Deine E-Mail-Adresse', 'Your email address') + '" style="' + INP + '">' +
      '<button id="wp-m" type="button" style="' + BTN + '">' + T('Hier anmelden', 'Sign in here') + '</button>' +
      (iosDev && !navigator.standalone ? '<p style="' + NOTE + '">' + T('Du nutzt Waypals als App auf dem Home-Bildschirm? Dann tippe hier nicht auf Anmelden, sondern kopiere den Link und füge ihn in der App ein.', 'Using Waypals from your home screen? Then do not sign in here: copy the link and paste it in the app.') + '</p><button id="wp-c" type="button" style="' + BTN2 + ';border-color:#0B7F78;color:#0B7F78">' + T('Link kopieren', 'Copy link') + '</button>' : '') +
      '<button id="wp-x" type="button" style="' + BTN2 + ';border:0;font-weight:500;color:#6F6A85">' + T('Abbrechen', 'Cancel') + '</button>'
    );
    var err = o.querySelector('#wp-err'), mi = o.querySelector('#wp-mail'), mb = o.querySelector('#wp-m');
    mb.onclick = function () {
      var mail = (mi.value || '').trim();
      if (!okMail(mail)) { err.textContent = T('Bitte gib deine E-Mail-Adresse ein.', 'Please enter your email address.'); return }
      mb.disabled = true; err.textContent = '';
      signInLink(mail, href).then(function () { o.remove(); done(null) }, function (e) {
        mb.disabled = false;
        if (e && (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code')) { o.remove(); done(linkErr(e)) } else err.textContent = linkErr(e);
      });
    };
    mi.onkeydown = function (e) { if (e.key === 'Enter') mb.onclick() };
    var cb = o.querySelector('#wp-c');
    if (cb) cb.onclick = function () { try { navigator.clipboard.writeText(href).then(function () { cb.textContent = T('Kopiert ✓', 'Copied ✓') }, function () { window.prompt('', href) }) } catch (e) { window.prompt('', href) } };
    o.querySelector('#wp-x').onclick = function () { o.remove(); done(null) };
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
      .then(function () { return fs.collection('usernames').where('uid', '==', uid).get().then(function (s) { return Promise.all(s.docs.map(function (d) { return d.ref.delete() })) }).catch(function () {}) })
      .then(function () { return Promise.all(['from', 'to'].map(function (k) { return fs.collection('friendRequests').where(k, '==', uid).get().then(function (s) { return Promise.all(s.docs.map(function (d) { return d.ref.delete() })) }).catch(function () {}) })) })
      .then(function () { return fs.doc('blocks/' + uid).delete().catch(function () {}) })
      .then(function () { return user.delete() })
      .then(function () { try { localStorage.clear() } catch (e) {} setTimeout(function () { location.reload() }, 800) });
  }

  if (!configured) {
    window.claude = { use: function () { return Promise.resolve(null) } };
  } else {
    fb.initializeApp(cfg);
    auth = fb.auth(); fs = fb.firestore();
    try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () {}) } catch (e) {}
    try { var pl2 = JSON.parse(localStorage.getItem('waypals-pref') || '{}'); auth.languageCode = pl2.lang || (navigator.language || 'en').slice(0, 2) } catch (e) {}
    var overlay = null, pendingErr = null;
    function onUser(u) {
      if (u) {
        user = u; lsSet(LOCALKEY, null);
        window.WAYPALS_AUTH = {
          email: u.email, name: u.displayName,
          signOut: function () { auth.signOut().then(function () { location.reload() }) },
          deleteAccount: deleteAccount,
          emails: (u.providerData || []).map(function (p) { return p.email }).filter(Boolean).filter(function (m, i, a) { return a.indexOf(m) === i }),
          // Weitere E-Mail-Adresse an dasselbe Konto hängen (gleiche Konto-ID, alle Daten bleiben)
          addEmail: function (mail) { lsSet(LINKKEY, mail); return auth.sendSignInLinkToEmail(mail, { url: location.origin + location.pathname, handleCodeInApp: true }) },
          finishAddEmail: function (mail, href) {
            if (!auth.isSignInWithEmailLink(href)) return Promise.reject({ code: 'wp/not-link' });
            return auth.currentUser.linkWithCredential(fb.auth.EmailAuthProvider.credentialWithLink(mail, href)).then(function () { lsSet(LINKKEY, null) });
          }
        };
        if (overlay) { overlay.remove(); overlay = null }
        resolveReady(u);
      } else if (!pendingErr && (lsGet(LOCALKEY) || guestLink)) {
        window.WAYPALS_AUTH = null; resolveReady(null);
      } else if (!overlay) {
        var mk = function () { overlay = loginScreen(pendingErr); pendingErr = null };
        document.body ? mk() : document.addEventListener('DOMContentLoaded', mk);
      }
    }
    function startAuth(err) { pendingErr = err || null; auth.onAuthStateChanged(onUser) }
    var linkHref = location.href;
    if (auth.isSignInWithEmailLink(linkHref)) {
      // Erst den Link einlösen, dann starten: so springt die App nicht kurz in den Gast-/lokalen Modus
      var mail = lsGet(EMAILKEY);
      var stop = auth.onAuthStateChanged(function (cur) {
        stop();
        // Weitere Adresse hinzufügen: Link im selben Browser geöffnet, dann direkt an das angemeldete Konto hängen
        var lm = lsGet(LINKKEY);
        if (cur && lm) {
          lsSet(LINKKEY, null);
          cur.linkWithCredential(fb.auth.EmailAuthProvider.credentialWithLink(lm, linkHref)).then(function () { lsSet(LINKRES, 'ok') }, function (e) { lsSet(LINKRES, (e && e.code) || 'err') }).then(function () { cleanUrl(); startAuth() });
          return;
        }
        // Schon angemeldet und der Link ist alt oder für dasselbe Konto: Link ignorieren, nichts überschreiben
        if (cur && (!mail || (cur.email || '').toLowerCase() === mail.toLowerCase())) { if (mail) lsSet(EMAILKEY, null); cleanUrl(); startAuth(); return }
        useLink();
      });
    }
    function useLink() {
      var mail = lsGet(EMAILKEY);
      if (mail) signInLink(mail, linkHref).then(function () { cleanUrl(); startAuth() }, function (e) { cleanUrl(); startAuth(linkErr(e)) });
      else {
        var go = function () { confirmScreen(linkHref, function (err) { cleanUrl(); startAuth(err) }) };
        document.body ? go() : document.addEventListener('DOMContentLoaded', go);
      }
    }
    if (!auth.isSignInWithEmailLink(linkHref)) startAuth();
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
