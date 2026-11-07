// Тесты по УЗ-диагностике — офлайн-режим. Файл sw.js собирается из sw.template.js командой: python3 build-sw.py
// Страницы: сначала сеть (обновления приходят сразу), без сети — из кэша.
// Результаты в Telegram: без сети ставятся в очередь и отправляются при появлении связи.
const VERSION = '__VERSION__';
const CACHE = 'academy-' + VERSION;
const FONTS = 'academy-fonts';
const PRECACHE = __PRECACHE__;
const IMG = __IMGMAP__;
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
