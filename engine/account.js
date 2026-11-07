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
  // проверить вход на сервере: если преподаватель завершил сеансы (новый код, отключение) — выйти на этом устройстве
  if (navigator.onLine) {
    try {
      const { error: ue } = await sb.auth.getUser();
      if (ue && (ue.status === 400 || ue.status === 401 || ue.status === 403 || /session|not found|missing|JWT/i.test(ue.message || ""))) {
        try { await sb.auth.signOut({ scope: "local" }); } catch (x) {}
        LS.set("acad-kicked", Date.now());                       // объяснить причину выхода на этом устройстве
        [K.profile, K.srs, K.owner, K.synced, K.dirty, "acad-mistakes"].forEach(LS.del);
        api.profile = null; return null;
      }
    } catch (e) { /* нет связи — проверим в следующий раз */ }
  }
  try {
    const cols = "id,full_name,login,role,status,group_id,groups(name)";
    let { data, error } = await sb.from("profiles").select(cols + ",access_until").eq("id", session.user.id).single();
    if (error && /access_until/.test(error.message || "")) ({ data, error } = await sb.from("profiles").select(cols).eq("id", session.user.id).single());   // скрипт 05 ещё не запущен
    if (error) throw error;
    api.profile = Object.assign({}, data, { email: data.login ? null : session.user.email, group: data.groups ? data.groups.name : null });
    delete api.profile.groups;
    LS.set(K.profile, api.profile);
  } catch (e) {
    // без интернета — последний известный профиль; если же сервер отклонил вход (сеанс завершён) — выйти
    if (navigator.onLine && e && (e.status === 401 || e.code === "PGRST301" || /JWT|token/i.test(e.message || ""))) {
      try { await sb.auth.signOut({ scope: "local" }); } catch (x) {}
      [K.profile, K.srs, K.owner, K.synced, K.dirty, "acad-mistakes"].forEach(LS.del);
      api.profile = null; return null;
    }
    const cached = LS.get(K.profile, null);
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
  const { error } = await sb.rpc("teacher_rename", { p_user: api.profile.id, p_full_name: fullName });   // только преподаватель
  if (error) throw new Error(ru(error));
  await loadProfile(); emit();
};

// срок доступа (скрипт 05): после него тесты и сохранение закрыты, кабинет и история остаются
const expired = p => !!(p && p.access_until && Date.parse(p.access_until) <= Date.now());
api.expired = expired;
// текущий курсант: загруженный профиль, а до ответа сервера — сохранённый на устройстве
api.current = () => api.profile || (() => { const c = LS.get(K.profile, null); try { return c && localStorage.getItem("acad-auth") ? c : null; } catch (e) { return null; } })();
// как курсант назван в отчёте преподавателю: логин или почта аккаунта
api.who = p => p ? (p.login ? "логин " + p.login : (p.email ? "почта " + p.email : "аккаунт " + String(p.id).slice(0, 8))) : "";
const active = () => !!(api.profile && api.profile.status === "active" && !expired(api.profile));
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

// ---------- доступ к тестам только после входа ----------
// Закрывает страницу, если курсант не вошёл или ещё не подтверждён преподавателем.
// opts.teacher — страница только для преподавателя. Возвращает true, если доступ есть.
// Это ограничение интерфейса: оно отсекает случайных посетителей, но файлы тестов на сайте остаются публичными.
api.gate = async function (opts) {
  opts = opts || {};
  // быстрый путь: на устройстве есть сессия и последний известный профиль подтверждён — не ждём сеть
  const cached = LS.get(K.profile, null), hasSession = (() => { try { return !!localStorage.getItem("acad-auth"); } catch (e) { return false; } })();
  const allowed = p => !!(p && p.status === "active" && !expired(p) && (!opts.teacher || p.role === "teacher"));
  if (hasSession && allowed(cached)) {
    // но проверяем и по серверу: если преподаватель отключил курсанта или сменил ему код — закрываем сразу
    api.ready.then(p => { if (!allowed(p)) shutter(p, opts); });
    return true;
  }
  const p = await api.ready;
  if (allowed(p)) return true;
  shutter(p, opts);
  return false;
};

function shutter(p, opts) {
  if (document.getElementById("acad-gate")) return;
  const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
  const [title, text, btn] = !p
    ? ["Нужно войти", (Date.now() - LS.get("acad-kicked", 0) < 7 * 864e5
        ? "На этом устройстве выполнен выход: в ваш аккаунт вошли на другом устройстве или преподаватель выдал новый код. Один аккаунт работает на одном устройстве. "
        : "") + "Тесты Академии УЗИ доступны только курсантам. Войдите по логину и коду от преподавателя или по своей почте.", "Войти"]
    : p.status === "active" && expired(p) ? ["Срок доступа истёк", `Доступ к тестам и руководствам был открыт до ${new Date(p.access_until).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}. Ваши результаты сохранены в личном кабинете. Чтобы продлить доступ, обратитесь к преподавателю.`, "Личный кабинет"]
    : p.status === "pending" ? ["Ожидает подтверждения", "Ваша регистрация ещё не подтверждена преподавателем. Как только он добавит вас в группу, тесты откроются.", "Личный кабинет"]
    : p.status === "blocked" ? ["Аккаунт отключён", "Обратитесь к преподавателю.", "Личный кабинет"]
    : ["Только для преподавателя", "Эта страница доступна только преподавателю курса.", "Личный кабинет"];
  const d = document.createElement("div");
  d.id = "acad-gate";
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
  d.style.cssText = "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:var(--bg,#f3f6f7)";
  d.innerHTML = `<div style="max-width:420px;width:100%;background:var(--paper,#fff);color:var(--ink,#18232f);border:1px solid var(--line,#d5e0e3);border-radius:12px;padding:22px;display:grid;gap:12px;font:16px/1.5 'PT Sans','Segoe UI',Arial,sans-serif">
    <span style="font:600 12px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--teal,#007a7a)">Академия УЗИ</span>
    <b style="font:700 24px/1.2 Georgia,serif;color:var(--navy,#1f3864)"></b><p style="margin:0;color:var(--muted,#5b6b78)"></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a style="font-weight:700;border-radius:8px;padding:10px 16px;background:var(--navy,#1f3864);color:var(--paper,#fff);text-decoration:none" href="account.html?next=${next}"></a>
    <a style="font-weight:700;border-radius:8px;padding:10px 16px;border:1.5px solid var(--navy,#1f3864);color:var(--navy,#1f3864);text-decoration:none" href="./">На главную</a></div></div>`;
  d.querySelector("b").textContent = title; d.querySelector("p").textContent = text; d.querySelector("a").textContent = btn;
  document.body.appendChild(d);
  document.querySelectorAll("body > :not([role=dialog])").forEach(el => { el.setAttribute("aria-hidden", "true"); el.style.visibility = "hidden"; });
}

async function afterLogin() {
  LS.del("acad-kicked");
  await loadProfile();
  // один аккаунт курсанта — одно устройство: прежние сеансы завершаются (скрипт 07)
  if (api.profile && api.profile.role !== "teacher") { try { await sb.rpc("keep_only_this_session"); } catch (e) {} }
  emit();
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
