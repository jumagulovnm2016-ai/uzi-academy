// Тесты по УЗ-диагностике — офлайн-режим. Файл sw.js собирается из sw.template.js командой: python3 build-sw.py
// Страницы: сначала сеть (обновления приходят сразу), без сети — из кэша.
// Результаты в Telegram: без сети ставятся в очередь и отправляются при появлении связи.
const VERSION = '20261114-135936';
const CACHE = 'academy-' + VERSION;
const FONTS = 'academy-fonts';
const PRECACHE = [
 "./",
 "./account.html",
 "./anketa.html",
 "./brain-guess.html",
 "./cns-face-spine.html",
 "./consensus.html",
 "./early-pregnancy.html",
 "./early-quiz.html",
 "./entry.html",
 "./exam-builder.html",
 "./face-guess.html",
 "./fetal-heart-basic.html",
 "./fetal-heart-pathology.html",
 "./fetal-heart.html",
 "./fetal-spine-quiz.html",
 "./fetal-spine.html",
 "./fetal-thorax.html",
 "./first-trimester.html",
 "./gallbladder.html",
 "./guess.html",
 "./guides.html",
 "./gyn-guess.html",
 "./index.html",
 "./kidney-guess.html",
 "./kidney-quiz.html",
 "./kidney-ums.html",
 "./kidney.html",
 "./liver-anatomy.html",
 "./liver.html",
 "./normy.html",
 "./pancreas.html",
 "./physics-20.html",
 "./physics-30.html",
 "./plan.html",
 "./quiz.html",
 "./screening-11-14-quiz.html",
 "./screening-2-guess.html",
 "./screening-2-trimester.html",
 "./spleen.html",
 "./teacher.html",
 "./ureter-bladder.html",
 "./ureter-quiz.html",
 "./uro-guess.html",
 "./uterus-adnexa.html",
 "./uterus-quiz.html",
 "./pc/",
 "./pomoshnik/",
 "./offline.js",
 "./manifest.webmanifest",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon-maskable-512.png",
 "./icons/apple-touch-icon.png",
 "./data/catalog.json",
 "./engine/account.js",
 "./engine/guess.css",
 "./engine/guess.js",
 "./engine/plan.js",
 "./engine/quiz.css",
 "./engine/quiz.js",
 "./engine/srs.js",
 "./engine/vendor/supabase-js-2.119.0.umd.js",
 "./engine/vendor/ts-fsrs-5.4.1.umd.js",
 "./data/tests/brain-guess.json",
 "./data/tests/cns-face-spine.json",
 "./data/tests/early-pregnancy.json",
 "./data/tests/early-quiz.json",
 "./data/tests/entry.json",
 "./data/tests/face-guess.json",
 "./data/tests/fetal-heart-basic.json",
 "./data/tests/fetal-heart-pathology.json",
 "./data/tests/fetal-heart.json",
 "./data/tests/fetal-spine-quiz.json",
 "./data/tests/fetal-spine.json",
 "./data/tests/fetal-thorax.json",
 "./data/tests/first-trimester.json",
 "./data/tests/gallbladder.json",
 "./data/tests/gyn-guess.json",
 "./data/tests/kidney-guess.json",
 "./data/tests/kidney-quiz.json",
 "./data/tests/kidney-ums.json",
 "./data/tests/kidney.json",
 "./data/tests/liver-anatomy.json",
 "./data/tests/liver.json",
 "./data/tests/pancreas.json",
 "./data/tests/physics-20.json",
 "./data/tests/physics-30.json",
 "./data/tests/screening-11-14-quiz.json",
 "./data/tests/screening-2-guess.json",
 "./data/tests/screening-2-trimester.json",
 "./data/tests/spleen.json",
 "./data/tests/ureter-bladder.json",
 "./data/tests/ureter-quiz.json",
 "./data/tests/uro-guess.json",
 "./data/tests/uterus-adnexa.json",
 "./data/tests/uterus-quiz.json"
];
const IMG = {
 "brain-guess": [
  "./img/brain-guess/b01.jpg",
  "./img/brain-guess/b02.jpg",
  "./img/brain-guess/b03.jpg",
  "./img/brain-guess/b04.jpg",
  "./img/brain-guess/b05.jpg",
  "./img/brain-guess/b06.jpg",
  "./img/brain-guess/b07.jpg",
  "./img/brain-guess/b08.jpg",
  "./img/brain-guess/b09.jpg",
  "./img/brain-guess/b10.jpg",
  "./img/brain-guess/b11.jpg",
  "./img/brain-guess/b12.jpg",
  "./img/brain-guess/b13.jpg",
  "./img/brain-guess/b14.jpg",
  "./img/brain-guess/b15.jpg",
  "./img/brain-guess/b16.jpg",
  "./img/brain-guess/b17.jpg",
  "./img/brain-guess/b18.jpg",
  "./img/brain-guess/b19.jpg",
  "./img/brain-guess/b20.jpg",
  "./img/brain-guess/b21.jpg",
  "./img/brain-guess/b22.jpg",
  "./img/brain-guess/b23.jpg",
  "./img/brain-guess/b24.jpg",
  "./img/brain-guess/b25.jpg",
  "./img/brain-guess/b26.jpg",
  "./img/brain-guess/b27.jpg",
  "./img/brain-guess/b28.jpg",
  "./img/brain-guess/b29.jpg",
  "./img/brain-guess/b30.jpg"
 ],
 "face-guess": [
  "./img/face-guess/f01.jpg",
  "./img/face-guess/f02.jpg",
  "./img/face-guess/f03.jpg",
  "./img/face-guess/f04.jpg",
  "./img/face-guess/f05.jpg",
  "./img/face-guess/f06.jpg",
  "./img/face-guess/f07.jpg",
  "./img/face-guess/f08.jpg",
  "./img/face-guess/f09.jpg",
  "./img/face-guess/f10.jpg",
  "./img/face-guess/f11.jpg",
  "./img/face-guess/f12.jpg",
  "./img/face-guess/f13.jpg",
  "./img/face-guess/f14.jpg",
  "./img/face-guess/f15.jpg",
  "./img/face-guess/f16.jpg",
  "./img/face-guess/f17.jpg",
  "./img/face-guess/f18.jpg",
  "./img/face-guess/f19.jpg",
  "./img/face-guess/f20.jpg",
  "./img/face-guess/f21.jpg",
  "./img/face-guess/f22.jpg",
  "./img/face-guess/f23.jpg",
  "./img/face-guess/f24.jpg",
  "./img/face-guess/f25.jpg",
  "./img/face-guess/f26.jpg",
  "./img/face-guess/f27.jpg",
  "./img/face-guess/f28.jpg",
  "./img/face-guess/f29.jpg",
  "./img/face-guess/f30.jpg"
 ],
 "fetal-spine": [
  "./img/fetal-spine/q_banana.jpg",
  "./img/fetal-spine/q_cereb.jpg",
  "./img/fetal-spine/q_csd.jpg",
  "./img/fetal-spine/q_hemivert.jpg",
  "./img/fetal-spine/q_lemon.jpg",
  "./img/fetal-spine/q_mmc_sag.jpg",
  "./img/fetal-spine/q_norm_axial.jpg",
  "./img/fetal-spine/q_norm_coronal.jpg",
  "./img/fetal-spine/q_sb_axial.jpg",
  "./img/fetal-spine/q_sct.jpg"
 ],
 "gyn-guess": [
  "./img/gyn-guess/g01.jpg",
  "./img/gyn-guess/g02.jpg",
  "./img/gyn-guess/g03.jpg",
  "./img/gyn-guess/g04.jpg",
  "./img/gyn-guess/g05.jpg",
  "./img/gyn-guess/g06.jpg",
  "./img/gyn-guess/g07.jpg",
  "./img/gyn-guess/g08.jpg",
  "./img/gyn-guess/g09.jpg",
  "./img/gyn-guess/g10.jpg",
  "./img/gyn-guess/g11.jpg",
  "./img/gyn-guess/g12.jpg",
  "./img/gyn-guess/g13.jpg",
  "./img/gyn-guess/g14.jpg",
  "./img/gyn-guess/g15.jpg",
  "./img/gyn-guess/g16.jpg",
  "./img/gyn-guess/g17.jpg",
  "./img/gyn-guess/g18.jpg",
  "./img/gyn-guess/g19.jpg",
  "./img/gyn-guess/g20.jpg",
  "./img/gyn-guess/g21.jpg",
  "./img/gyn-guess/g22.jpg",
  "./img/gyn-guess/g23.jpg",
  "./img/gyn-guess/g24.jpg",
  "./img/gyn-guess/g25.jpg",
  "./img/gyn-guess/g26.jpg",
  "./img/gyn-guess/g27.jpg",
  "./img/gyn-guess/g28.jpg",
  "./img/gyn-guess/g29.jpg",
  "./img/gyn-guess/g30.jpg",
  "./img/gyn-guess/g31.jpg",
  "./img/gyn-guess/g32.jpg"
 ],
 "kidney-guess": [
  "./img/kidney-guess/k01.jpg",
  "./img/kidney-guess/k02.jpg",
  "./img/kidney-guess/k03.jpg",
  "./img/kidney-guess/k04.jpg",
  "./img/kidney-guess/k05.jpg",
  "./img/kidney-guess/k06.jpg",
  "./img/kidney-guess/k07.jpg",
  "./img/kidney-guess/k08.jpg",
  "./img/kidney-guess/k09.jpg",
  "./img/kidney-guess/k10.jpg",
  "./img/kidney-guess/k11.jpg",
  "./img/kidney-guess/k12.jpg",
  "./img/kidney-guess/k13.jpg",
  "./img/kidney-guess/k14.jpg",
  "./img/kidney-guess/k15.jpg",
  "./img/kidney-guess/k16.jpg",
  "./img/kidney-guess/k17.jpg",
  "./img/kidney-guess/k18.jpg",
  "./img/kidney-guess/k19.jpg",
  "./img/kidney-guess/k20.jpg",
  "./img/kidney-guess/k21.jpg",
  "./img/kidney-guess/k22.jpg",
  "./img/kidney-guess/k23.jpg",
  "./img/kidney-guess/k24.jpg",
  "./img/kidney-guess/k25.jpg",
  "./img/kidney-guess/k26.jpg",
  "./img/kidney-guess/k27.jpg",
  "./img/kidney-guess/k28.jpg",
  "./img/kidney-guess/k29.jpg",
  "./img/kidney-guess/k30.jpg",
  "./img/kidney-guess/k31.jpg",
  "./img/kidney-guess/k32.jpg",
  "./img/kidney-guess/k33.jpg",
  "./img/kidney-guess/k34.jpg",
  "./img/kidney-guess/k35.jpg",
  "./img/kidney-guess/k36.jpg",
  "./img/kidney-guess/k37.jpg",
  "./img/kidney-guess/k38.jpg",
  "./img/kidney-guess/k39.jpg",
  "./img/kidney-guess/k40.jpg"
 ],
 "kidney-ums": [
  "./img/kidney-ums/a10.jpg",
  "./img/kidney-ums/a18.jpg",
  "./img/kidney-ums/a19.jpg",
  "./img/kidney-ums/a20.jpg",
  "./img/kidney-ums/a25.jpg",
  "./img/kidney-ums/a33.jpg",
  "./img/kidney-ums/a44.jpg",
  "./img/kidney-ums/a51.jpg",
  "./img/kidney-ums/a57.jpg",
  "./img/kidney-ums/a65.jpg",
  "./img/kidney-ums/a66.jpg",
  "./img/kidney-ums/a72.jpg",
  "./img/kidney-ums/a74.jpg",
  "./img/kidney-ums/q13.jpg",
  "./img/kidney-ums/q36.jpg",
  "./img/kidney-ums/q58.jpg"
 ],
 "screening-2-guess": [
  "./img/screening-2-guess/g01.jpg",
  "./img/screening-2-guess/g02.jpg",
  "./img/screening-2-guess/g03.jpg",
  "./img/screening-2-guess/g04.jpg",
  "./img/screening-2-guess/g05.jpg",
  "./img/screening-2-guess/g06.jpg",
  "./img/screening-2-guess/g07.jpg",
  "./img/screening-2-guess/g08.jpg",
  "./img/screening-2-guess/g09.jpg",
  "./img/screening-2-guess/g10.jpg",
  "./img/screening-2-guess/g11.jpg",
  "./img/screening-2-guess/g12.jpg",
  "./img/screening-2-guess/g13.jpg",
  "./img/screening-2-guess/g14.jpg",
  "./img/screening-2-guess/g15.jpg",
  "./img/screening-2-guess/g16.jpg",
  "./img/screening-2-guess/g17.jpg",
  "./img/screening-2-guess/g18.jpg",
  "./img/screening-2-guess/g19.jpg",
  "./img/screening-2-guess/g20.jpg",
  "./img/screening-2-guess/g21.jpg",
  "./img/screening-2-guess/g22.jpg",
  "./img/screening-2-guess/g23.jpg",
  "./img/screening-2-guess/g24.jpg",
  "./img/screening-2-guess/g25.jpg",
  "./img/screening-2-guess/g26.jpg",
  "./img/screening-2-guess/g27.jpg",
  "./img/screening-2-guess/g28.jpg",
  "./img/screening-2-guess/g29.jpg",
  "./img/screening-2-guess/g30.jpg"
 ],
 "screening-2-trimester": [
  "./img/screening-2-trimester/q_ac.jpg",
  "./img/screening-2-trimester/q_cord_art.jpg",
  "./img/screening-2-trimester/q_head_tc.jpg",
  "./img/screening-2-trimester/q_head_tt.jpg",
  "./img/screening-2-trimester/q_lips.jpg",
  "./img/screening-2-trimester/q_spine.jpg"
 ],
 "uro-guess": [
  "./img/uro-guess/b01.jpg",
  "./img/uro-guess/b02.jpg",
  "./img/uro-guess/b03.jpg",
  "./img/uro-guess/b04.jpg",
  "./img/uro-guess/b05.jpg",
  "./img/uro-guess/b06.jpg",
  "./img/uro-guess/b07.jpg",
  "./img/uro-guess/b08.jpg",
  "./img/uro-guess/b09.jpg",
  "./img/uro-guess/b10.jpg",
  "./img/uro-guess/b11.jpg"
 ]
};
const SEND_HOSTS = ['api.telegram.org', 'script.google.com', 'script.googleusercontent.com'];
const GIF = Uint8Array.from(atob('R0lGODlhAQABAAAAACw='), c => c.charCodeAt(0));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(n => n !== CACHE && n !== FONTS && n.startsWith('academy-')).map(n => caches.delete(n))))
    .then(() => self.clients.claim()).then(flush));
});

// ---------- очередь отложенных отправок (IndexedDB) ----------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('academy-outbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function qOp(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('q', mode); const out = fn(tx.objectStore('q')); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error); });
}
const qAdd = item => qOp('readwrite', s => s.add(item));
const qAll = () => qOp('readonly', s => s.getAll());
const qDel = id => qOp('readwrite', s => s.delete(id));

async function notify(msg) { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); }

function markDelayed(item) {
  const when = new Date(item.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const note = '\n\n⏳ Отправлено с задержкой (не было интернета). Завершено: ' + when;
  if (item.body != null) {
    const p = new URLSearchParams(item.body);
    if (p.has('text')) { p.set('text', p.get('text') + note); return { url: item.url, body: p.toString() }; }
    return { url: item.url, body: item.body };
  }
  const u = new URL(item.url);
  if (u.searchParams.has('text')) u.searchParams.set('text', u.searchParams.get('text') + note);
  return { url: u.toString(), body: null };
}

let flushing = null;
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let n = 0;
    try {
      for (const item of await qAll()) {
        if (Date.now() - item.t > 30 * 864e5) { await qDel(item.id); continue; }
        const m = markDelayed(item);
        try {
          await fetch(m.url, m.body != null
            ? { method: 'POST', mode: 'no-cors', body: new URLSearchParams(m.body) }
            : { mode: 'no-cors' });
          await qDel(item.id); n++;
        } catch (e) { break; }
      }
    } catch (e) {}
    if (n) notify({ type: 'flushed', n });
    flushing = null;
  })();
  return flushing;
}
self.addEventListener('message', e => { if (e.data === 'flush') e.waitUntil(flush()); });
self.addEventListener('sync', e => { if (e.tag === 'flush') e.waitUntil(flush()); });

async function handleSend(req) {
  const body = req.method === 'POST' ? await req.clone().text() : null;
  try {
    return await fetch(req);
  } catch (err) {
    // В сети, но запрос не прошёл — пусть страница попробует свои запасные способы.
    if (self.navigator && self.navigator.onLine) return Response.error();
    await qAdd({ url: req.url, body, t: Date.now() });
    notify({ type: 'queued' });
    try { await self.registration.sync.register('flush'); } catch (e) {}
    return req.method === 'POST' || req.destination !== 'image'
      ? new Response('{"ok":true,"queued":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(GIF, { status: 200, headers: { 'Content-Type': 'image/gif' } });
  }
}

// ---------- картинки страницы: фоновая докачка ----------
async function warmImages(pageUrl) {
  const u = new URL(pageUrl);
  const name = u.searchParams.get('t') || u.pathname.split('/').pop().replace(/\.html$/, '');
  const list = IMG[name];
  if (!list) return;
  const c = await caches.open(CACHE);
  for (const u of list) { if (!(await c.match(u))) { try { await c.add(u); } catch (e) {} } }
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);

  if (SEND_HOSTS.includes(url.hostname)) { e.respondWith(handleSend(req)); return; }
  if (req.method !== 'GET') return;

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(req, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
        if (r.ok) { c.put(req, r.clone()); e.waitUntil(warmImages(req.url)); }
        return r;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
