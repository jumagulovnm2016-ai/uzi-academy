// Личный кабинет Академии УЗИ: вход, профиль, сохранение результатов и синхронизация повторения.
// Сервер — Supabase (engine/vendor/supabase-js). Публичный ключ ниже можно хранить открыто:
// что разрешено курсанту и преподавателю, решают правила доступа в базе (supabase/01-schema.sql).
// Без входа сайт работает как раньше: результаты уходят преподавателю в Telegram.
(function () {
"use strict";
const URL_ = "https://smaeftsvppysiedbbxlm.supabase.co";
const KEY_ = "sb_publishable_0IUPZ_KNQwVAid8BMP60dA_ICc0sEt4";
const DOMAIN = "uzi-academy.invalid";   // служебные адреса аккаунтов «по коду»
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const K = { profile: "acad-profile", outbox: "acad-outbox", srs: "acad-srs", owner: "acad-srs-owner", synced: "acad-srs-synced", dirty: "acad-srs-dirty" };

const listeners = [];
const api = { client: null, profile: null, ready: null, onChange(cb) { listeners.push(cb); } };
window.AcadAccount = api;
const emit = () => listeners.forEach(cb => { try { cb(api.profile); } catch (e) {} });

if (!window.supabase || !window.supabase.createClient) { api.ready = Promise.resolve(null); return; }
const sb = api.client = window.supabase.createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "acad-auth" } });

// ---------- понятные сообщения об ошибках ----------
function ru(err) {
  const m = String((err && (err.message || err.error_description || err.error)) || err || "");
  if (/Invalid login credentials/i.test(m)) return "Неверный логин (почта) или пароль.";
  if (/already registered|already been registered|User already/i.test(m)) return "Эта почта уже зарегистрирована. Войдите или попросите преподавателя сбросить пароль.";
  if (/Password should be at least|password.*(short|length)/i.test(m)) return "Пароль слишком короткий — нужно не меньше 6 символов.";
  if (/valid email|Unable to validate email|invalid format/i.test(m)) return "Проверьте адрес почты.";
  if (/rate limit|too many/i.test(m)) return "Слишком много попыток. Подождите минуту и попробуйте снова.";
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m)) return "Нет связи с сервером. Проверьте интернет.";
  if (/signups not allowed|Signups not allowed/i.test(m)) return "Регистрация сейчас закрыта. Обратитесь к преподавателю.";
  return m || "Неизвестная ошибка.";
}
api.ru = ru;

// ---------- профиль ----------
async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { api.profile = null; LS.del(K.profile); return null; }
  try {
    const { data, error } = await sb.from("profiles").select("id,full_name,login,role,status,group_id,groups(name)").eq("id", session.user.id).single();
    if (error) throw error;
    api.profile = Object.assign({}, data, { email: data.login ? null : session.user.email, group: data.groups ? data.groups.name : null });
    delete api.profile.groups;
    LS.set(K.profile, api.profile);
  } catch (e) {
    const cached = LS.get(K.profile, null);                      // без интернета — последний известный профиль
    api.profile = cached && cached.id === session.user.id ? cached : null;
  }
  return api.profile;
}

api.signIn = async (who, password) => {
  who = String(who || "").trim().toLowerCase();
  const email = who.includes("@") ? who : `${who}@${DOMAIN}`;
  const { error } = await sb.auth.signInWithPassword({ email, password: String(password || "") });
  if (error) throw new Error(ru(error));
  await afterLogin(); return api.profile;
};

api.signUp = async (fullName, email, password) => {
  fullName = String(fullName || "").trim().replace(/\s+/g, " ");
  email = String(email || "").trim().toLowerCase();
  if (fullName.split(" ").length < 2) throw new Error("Введите фамилию и имя полностью.");
  if (email.endsWith("@" + DOMAIN)) throw new Error("Проверьте адрес почты.");
  const { data, error } = await sb.auth.signUp({ email, password: String(password || ""), options: { data: { full_name: fullName } } });
  if (error) throw new Error(ru(error));
  if (!data.session) throw new Error("Регистрация прошла, но вход не выполнен: в Supabase включено подтверждение почты. Сообщите преподавателю.");
  await afterLogin(); return api.profile;
};

api.signOut = async () => {
  try { await sb.auth.signOut(); } catch (e) {}
  // на общем телефоне личные данные не должны оставаться
  [K.profile, K.srs, K.owner, K.synced, K.dirty, "acad-mistakes"].forEach(LS.del);
  api.profile = null; emit();
};

api.rename = async (fullName) => {
  fullName = String(fullName || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const { error } = await sb.from("profiles").update({ full_name: fullName }).eq("id", api.profile.id);
  if (error) throw new Error(ru(error));
  await loadProfile(); emit();
};

const active = () => !!(api.profile && api.profile.status === "active");
api.active = active;

// ---------- результаты: очередь на устройстве → сервер ----------
const rid = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
api.newClientId = rid;

api.saveAttempt = (a) => {
  if (!active()) return "skip";
  const row = {
    client_id: a.client_id || rid(), test_id: a.test_id, title: String(a.title || "").slice(0, 200), mode: a.mode,
    correct: a.correct | 0, total: a.total | 0, points: a.points == null ? null : a.points | 0,
    duration_sec: a.duration_sec == null ? null : Math.max(0, Math.round(a.duration_sec)), timed_out: !!a.timed_out,
    seed: a.seed || null, wrong_ids: (a.wrong_ids || []).slice(0, 300), report: a.report ? String(a.report).slice(0, 4000) : null,
    finished_at: a.finished_at || new Date().toISOString(), owner: api.profile.id
  };
  if (!/^[a-z0-9-]{1,80}$/.test(row.test_id) || !row.total) return "skip";
  const box = LS.get(K.outbox, []);
  if (!box.some(x => x.client_id === row.client_id)) { box.push(row); LS.set(K.outbox, box); }
  flush();
  return "queued";
};

let flushing = null;
async function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!active() || !navigator.onLine) return;
    const box = LS.get(K.outbox, []), mine = box.filter(r => r.owner === api.profile.id);
    if (!mine.length) return;
    const rows = mine.map(r => { const c = Object.assign({}, r); delete c.owner; return c; });
    const { error } = await sb.from("attempts").upsert(rows, { onConflict: "user_id,client_id", ignoreDuplicates: true });
    if (error) { window.__acadFlushError = error; return; }
    LS.set(K.outbox, LS.get(K.outbox, []).filter(r => !mine.some(m => m.client_id === r.client_id)));
  })().catch(() => {}).finally(() => { flushing = null; });
  return flushing;
}
api.flush = flush;
api.pending = () => LS.get(K.outbox, []).filter(r => api.profile && r.owner === api.profile.id).length;

// ---------- повторение FSRS: слияние устройства и сервера по карточкам ----------
// Побеждает карточка с более поздним повторением (last_review), при равенстве — с большим числом повторений.
function newer(a, b) {
  const ta = a && a.last_review ? Date.parse(a.last_review) : 0, tb = b && b.last_review ? Date.parse(b.last_review) : 0;
  if (ta !== tb) return ta > tb;
  return (a && a.reps || 0) > (b && b.reps || 0);
}
let syncing = null, syncTimer = null;
api.syncSrs = function () {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!active() || !navigator.onLine) return;
    const me = api.profile.id, owner = LS.get(K.owner, null);
    let local = LS.get(K.srs, {});
    if (owner && owner !== me) local = {};                       // на устройстве были карточки другого аккаунта
    const remote = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("srs_cards").select("qid,card").eq("user_id", me).range(from, from + 999);
      if (error) throw error;
      data.forEach(r => { remote[r.qid] = r.card; });
      if (data.length < 1000) break;
    }
    const push = [];
    for (const q of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      if (!local[q] || (remote[q] && newer(remote[q], local[q]))) local[q] = remote[q];
      else if (!remote[q] || newer(local[q], remote[q])) push.push({ qid: q, card: local[q], updated_at: new Date().toISOString() });
    }
    for (let i = 0; i < push.length; i += 500) {
      const { error } = await sb.from("srs_cards").upsert(push.slice(i, i + 500), { onConflict: "user_id,qid" });
      if (error) throw error;
    }
    LS.set(K.srs, local); LS.set(K.owner, me); LS.set(K.synced, Date.now()); LS.del(K.dirty);
  })().catch(e => { window.__acadSyncError = e; }).finally(() => { syncing = null; });
  return syncing;
};
// вызывается из engine/srs.js после каждой оценки
api.srsChanged = () => { if (!active()) return; LS.set(K.dirty, 1); clearTimeout(syncTimer); syncTimer = setTimeout(api.syncSrs, 3000); };
// страницу закрыли до отправки — отправим сразу, пока она ещё жива
addEventListener("pagehide", () => { if (LS.get(K.dirty, 0) && active()) api.syncSrs(); });

async function afterLogin() {
  await loadProfile(); emit();
  if (active()) { flush(); await api.syncSrs(); emit(); }
}

addEventListener("online", () => { flush(); api.syncSrs(); });
api.ready = loadProfile().then(p => {
  if (p && active()) {
    flush();
    if (LS.get(K.dirty, 0) || Date.now() - LS.get(K.synced, 0) > 60 * 1000) api.syncSrs().then(emit);
  }
  emit(); return p;
}).catch(() => null);
})();
