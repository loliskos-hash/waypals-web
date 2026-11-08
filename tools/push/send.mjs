// Waypals Push: läuft per GitHub Actions alle paar Minuten (siehe .github/workflows/push.yml).
// Schaut nach, was seit dem letzten Lauf passiert ist (Taube gelandet, Freundschaftsanfrage, Wander-Taube),
// und schickt den Empfängern eine Push-Nachricht über Firebase Cloud Messaging.
// Liest nur; schreibt einzig den Merkzettel push_state/main und entfernt abgelaufene Geräte-Tokens aus push/{uid}.
import admin from 'firebase-admin';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.log('Kein FIREBASE_SERVICE_ACCOUNT gesetzt, nichts zu tun.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const fcm = admin.messaging();

const T = {
  de: {
    mail: n => [`Taubenpost von ${n}`, 'Deine Brieftaube ist gelandet. Schau rein!'],
    stop: n => [`Eine Taube von ${n} rastet bei dir`, 'Leg ein Foto dazu und schick sie weiter.'],
    home: () => ['Deine Taube ist zurück', 'Sie bringt Fotos und Grüße mit.'],
    quest: n => [`Challenge von ${n}`, 'Eine Taube hat dir eine Challenge gebracht.'],
    req: n => ['Neue Freundschaftsanfrage', `${n} möchte in deinen Kreis.`],
    ok: n => ['Anfrage angenommen', `${n} ist jetzt in deinem Kreis.`],
    flock: n => [`Wander-Taube von ${n}`, 'Sie ist bei dir gelandet. Gib sie weiter!'],
    flockHome: () => ['Deine Wander-Taube ist zurück', 'Schau dir an, wo sie überall war.'],
    someone: 'Jemand'
  },
  en: {
    mail: n => [`Pigeon post from ${n}`, 'Your carrier pigeon has landed. Take a look!'],
    stop: n => [`A pigeon from ${n} is resting with you`, 'Add a photo and send it on.'],
    home: () => ['Your pigeon is back', 'It brings photos and greetings.'],
    quest: n => [`Challenge from ${n}`, 'A pigeon brought you a challenge.'],
    req: n => ['New friend request', `${n} wants to join your circle.`],
    ok: n => ['Request accepted', `${n} is now in your circle.`],
    flock: n => [`Roaming pigeon from ${n}`, 'It landed with you. Pass it on!'],
    flockHome: () => ['Your roaming pigeon is back', 'See everywhere it has been.'],
    someone: 'Someone'
  },
  es: {
    mail: n => [`Correo de paloma de ${n}`, 'Tu paloma mensajera ha llegado. ¡Échale un vistazo!'],
    stop: n => [`Una paloma de ${n} descansa contigo`, 'Añade una foto y envíala.'],
    home: () => ['Tu paloma ha vuelto', 'Trae fotos y saludos.'],
    quest: n => [`Reto de ${n}`, 'Una paloma te ha traído un reto.'],
    req: n => ['Nueva solicitud de amistad', `${n} quiere unirse a tu círculo.`],
    ok: n => ['Solicitud aceptada', `${n} ya está en tu círculo.`],
    flock: n => [`Paloma viajera de ${n}`, 'Ha aterrizado contigo. ¡Pásala!'],
    flockHome: () => ['Tu paloma viajera ha vuelto', 'Mira por dónde ha estado.'],
    someone: 'Alguien'
  },
  fr: {
    mail: n => [`Pigeon voyageur de ${n}`, 'Ton pigeon est arrivé. Viens voir !'],
    stop: n => [`Un pigeon de ${n} fait escale chez toi`, 'Ajoute une photo et renvoie-le.'],
    home: () => ['Ton pigeon est de retour', 'Il rapporte des photos et des salutations.'],
    quest: n => [`Défi de ${n}`, 'Un pigeon t’a apporté un défi.'],
    req: n => ['Nouvelle demande d’ami', `${n} veut rejoindre ton cercle.`],
    ok: n => ['Demande acceptée', `${n} est maintenant dans ton cercle.`],
    flock: n => [`Pigeon vagabond de ${n}`, 'Il s’est posé chez toi. Fais-le passer !'],
    flockHome: () => ['Ton pigeon vagabond est de retour', 'Regarde tous les endroits où il est passé.'],
    someone: 'Quelqu’un'
  },
  it: {
    mail: n => [`Posta del piccione da ${n}`, 'Il tuo piccione viaggiatore è arrivato. Dai un’occhiata!'],
    stop: n => [`Un piccione di ${n} si riposa da te`, 'Aggiungi una foto e mandalo avanti.'],
    home: () => ['Il tuo piccione è tornato', 'Porta foto e saluti.'],
    quest: n => [`Sfida da ${n}`, 'Un piccione ti ha portato una sfida.'],
    req: n => ['Nuova richiesta di amicizia', `${n} vuole entrare nella tua cerchia.`],
    ok: n => ['Richiesta accettata', `${n} ora è nella tua cerchia.`],
    flock: n => [`Piccione errante di ${n}`, 'È atterrato da te. Passalo avanti!'],
    flockHome: () => ['Il tuo piccione errante è tornato', 'Guarda dove è stato.'],
    someone: 'Qualcuno'
  },
  pt: {
    mail: n => [`Correio de pombo de ${n}`, 'O teu pombo-correio chegou. Vem ver!'],
    stop: n => [`Um pombo de ${n} está a descansar contigo`, 'Junta uma foto e envia-o adiante.'],
    home: () => ['O teu pombo voltou', 'Traz fotos e saudações.'],
    quest: n => [`Desafio de ${n}`, 'Um pombo trouxe-te um desafio.'],
    req: n => ['Novo pedido de amizade', `${n} quer entrar no teu círculo.`],
    ok: n => ['Pedido aceite', `${n} já está no teu círculo.`],
    flock: n => [`Pombo viajante de ${n}`, 'Pousou contigo. Passa-o adiante!'],
    flockHome: () => ['O teu pombo viajante voltou', 'Vê por onde andou.'],
    someone: 'Alguém'
  }
};

const now = Date.now();
const stRef = db.doc('push_state/main');
const st = (await stRef.get()).data();
// Erster Lauf: nichts Altes nachschicken
if (!st || !st.t) { await stRef.set({ t: now }); console.log('Erster Lauf, Startzeit gemerkt.'); process.exit(0); }
// Lücke höchstens 6 Stunden zurück (falls GitHub lange pausiert hat)
const since = Math.max(st.t, now - 6 * 3600e3);

const jobs = []; // {to, kind, name, from, tag}
const range = (col, field) => db.collection(col).where(field, '>', since).where(field, '<=', now).get();

const [mails, quests, reqs, flocks] = await Promise.all([
  range('mail', 'arriveAt'), range('quests', 'arriveAt'), range('friendRequests', 'upd'), range('flocks', 'upd')
]);
mails.forEach(d => {
  const m = d.data(); if (m.status !== 'carried' || !m.holder) return;
  const tk = m.cur && m.cur.tk;
  const kind = tk === 'home' ? 'home' : tk === 'stop' ? 'stop' : 'mail';
  if (kind !== 'home' && m.holder === m.from) return;
  jobs.push({ to: m.holder, kind, name: m.fromName, from: m.from, tag: 'mail-' + d.id });
});
quests.forEach(d => {
  const q = d.data(); if (q.status !== 'flying' || !q.to) return;
  jobs.push({ to: q.to, kind: 'quest', name: q.fromName, from: q.from, tag: 'quest-' + d.id });
});
reqs.forEach(d => {
  const r = d.data();
  if (r.status === 'pending' && r.to) jobs.push({ to: r.to, kind: 'req', name: r.fromName, from: r.from, tag: 'fr-' + d.id });
  else if (r.status === 'accepted' && r.from) jobs.push({ to: r.from, kind: 'ok', name: r.toName, from: r.to, tag: 'fr-' + d.id });
});
flocks.forEach(d => {
  const k = d.data(); if (!k.holder) return;
  if (k.status === 'home' && k.holder === k.from) jobs.push({ to: k.from, kind: 'flockHome', name: '', from: '', tag: 'flock-' + d.id });
  else if (k.status === 'carried' && k.holder !== k.from) jobs.push({ to: k.holder, kind: 'flock', name: k.fromName, from: k.from, tag: 'flock-' + d.id });
});

const pushCache = {}, blockCache = {};
async function pushDoc(uid) { if (!(uid in pushCache)) pushCache[uid] = (await db.doc('push/' + uid).get()).data() || null; return pushCache[uid]; }
async function blocked(uid, from) {
  if (!from) return false;
  if (!(uid in blockCache)) blockCache[uid] = (await db.doc('blocks/' + uid).get()).data() || {};
  const b = blockCache[uid];
  return !!((b.b && b.b[from]) || (b.m && b.m[from]));
}

let sent = 0;
for (const j of jobs) {
  const p = await pushDoc(j.to);
  if (!p || p.on === false || !p.t) continue;
  if (await blocked(j.to, j.from)) continue;
  for (const [key, dev] of Object.entries(p.t)) {
    if (!dev || !dev.tk) continue;
    const tx = T[dev.lang] || T.en;
    const [title, body] = tx[j.kind](j.name || tx.someone);
    try {
      await fcm.send({
        token: dev.tk,
        data: { title, body, tag: j.tag, url: './' },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } }
      });
      sent++;
    } catch (e) {
      const c = e && e.code || '';
      console.log('Fehler', j.kind, c);
      if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(c)) {
        await db.doc('push/' + j.to).update({ ['t.' + key]: admin.firestore.FieldValue.delete() }).catch(() => {});
      }
    }
  }
}
await stRef.set({ t: now });
console.log(`Ereignisse: ${jobs.length}, gesendet: ${sent}`);
