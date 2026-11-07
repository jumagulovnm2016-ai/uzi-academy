// Единый движок тестов Академии УЗИ.
// Страница: quiz.html?t=<id>, вопросы: data/tests/<id>.json.
// Режимы: учебный (разбор сразу), экзамен (разбор после завершения), работа над ошибками.
// Ход попытки сохраняется на устройстве и восстанавливается после перезагрузки.
(function () {
"use strict";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = ["А", "Б", "В", "Г", "Д", "Е"];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// ---------- отправка преподавателю (как на прежних страницах) ----------
const TG_CHAT = "188183172";
const TG_PROXY = "https://script.google.com/macros/s/AKfycbznrtw3Wd7QBRhQaMlrCIp86oLemxjc_LlaIVomj-9rcXiyMYpmP_OCtc8u4lgQbaXKpg/exec";
async function sendToTeacher(text) {
  try {
    await fetch(TG_PROXY, { method: "POST", mode: "no-cors", body: new URLSearchParams({ chat_id: TG_CHAT, text }) });
    return "sent";
  } catch (e) { return "fail"; }
}

// ---------- ошибки по всем тестам: { id вопроса: сколько раз ошибался } ----------
const MKEY = "acad-mistakes";
const mistakes = () => store.get(MKEY, {});
function markMistake(qid, wrong) {
  if (window.AcadSRS) AcadSRS.rate(qid, !wrong);          // интервальное повторение (engine/srs.js)
  const m = mistakes();
  if (wrong) m[qid] = (m[qid] || 0) + 1; else delete m[qid];
  store.set(MKEY, m);
}

const MODES = {
  study: { name: "учебный" },
  exam: { name: "экзамен" },
  review: { name: "работа над ошибками" }
};

let T, Q, S, KEY, LIMIT, tick = null;

function fresh(mode) {
  if (T && T.lock) mode = T.lock;                          // в экзамене преподавателя режим задан ссылкой
  return { v: 1, mode, qids: null, fio: "", ans: [], cur: 0, startAt: null, endAt: null,
           finished: false, timedOut: false, reportText: null, sendState: null,
           seed: T && T.pool ? newSeed() : null };
}

// ---------- сборный экзамен: случайный вариант из нескольких тестов ----------
// Ссылка: quiz.html?exam=<base64url JSON {n: название, t: [id тестов], q: вопросов, min: минут, m: "exam"|"study"}>
// Вариант определяется зерном (seed): по нему из отчёта восстанавливается тот же набор и порядок вопросов.
const newSeed = () => Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
function rng(seed) {
  let a = parseInt(seed, 36) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, rnd) { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
// Поровну из каждого раздела; если в разделе вопросов меньше доли — недостающие добираются из остальных.
function variant(pool, total, seed) {
  const rnd = rng(seed), groups = pool.map(g => shuffled(g, rnd));
  const take = groups.map(() => 0); let left = Math.min(total, groups.reduce((n, g) => n + g.length, 0));
  while (left > 0) {
    const open = groups.map((g, i) => i).filter(i => take[i] < groups[i].length);
    const share = Math.max(1, Math.floor(left / open.length));
    for (const i of shuffled(open, rnd)) { if (!left) break; const add = Math.min(share, groups[i].length - take[i], left); take[i] += add; left -= add; }
  }
  const picked = shuffled(groups.flatMap((g, i) => g.slice(0, take[i])), rnd);
  // варианты ответа тоже перемешиваются — у соседей разные буквы
  return picked.map(q => { const order = shuffled(q.o.map((_, i) => i), rnd);
    return Object.assign({}, q, { o: order.map(i => q.o[i]), a: order.indexOf(q.a) }); });
}
function applyVariant() { if (T.pool) T.questions = variant(T.pool, T.total, S.seed); }
const b64 = { enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
              dec: s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))) };
function shortHash(str) { let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
// Повторение по расписанию: вопросы из разных тестов, у которых подошёл срок (не больше 30 за раз)
async function loadSrs() {
  const KEYS = "acad-state-srs", saved = store.get(KEYS, null);
  if (saved && saved.finished) store.del(KEYS);
  const ids = saved && !saved.finished && saved.v === 1 && Array.isArray(saved.qids) ? saved.qids
    : (window.AcadSRS ? AcadSRS.due(30).map(x => x.id) : []);
  const tests = [...new Set(ids.map(id => id.replace(/-\d+$/, "")))].filter(id => /^[a-z0-9-]+$/.test(id));
  const byId = {};
  await Promise.all(tests.map(id => fetch(`data/tests/${id}.json`).then(r => r.ok ? r.json() : null).then(t => { if (t) t.questions.forEach(q => { byId[q.id] = q; }); })));
  return { id: "srs", format: "quiz", srs: true, lock: "review", title: "Повторение", h1: "Повторение по расписанию", pageTitle: "Повторение · Академия УЗИ",
           eyebrow: "Интервальное повторение · Академия УЗИ", about: ids.length ? `Сегодня к повторению: ${ids.length} вопр.` : "",
           footer: "Расписание повторений хранится на этом устройстве. Алгоритм — FSRS (библиотека ts-fsrs, лицензия MIT).",
           minutes: 60, salt: "acad-srs", questions: ids.map(id => byId[id]).filter(Boolean) };
}

async function loadExam(code) {
  let c; try { c = b64.dec(code); } catch (e) { throw new Error("Ссылка на экзамен повреждена."); }
  const ids = Array.isArray(c.t) ? c.t.filter(id => /^[a-z0-9-]+$/.test(id)) : [];
  if (!ids.length) throw new Error("В ссылке на экзамен не выбраны разделы.");
  const tests = await Promise.all(ids.map(id => fetch(`data/tests/${id}.json`).then(r => { if (!r.ok) throw new Error("Раздел не найден: " + id); return r.json(); })));
  const total = Math.max(1, Math.min(200, +c.q || 30)), h = shortHash(code);
  const name = String(c.n || "Сборный экзамен").slice(0, 120);
  return { id: "exam-" + h, format: "quiz", title: name, h1: name, pageTitle: name + " · Академия УЗИ", eyebrow: "Экзамен преподавателя · Академия УЗИ",
           about: `${total} вопросов из разделов: ${tests.map(t => t.title).join("; ")}. У каждого курсанта свой случайный вариант: вопросы и варианты ответов перемешаны.`,
           footer: "Вопросы взяты из тестов Академии УЗИ; источники указаны в разборе каждого вопроса.",
           minutes: Math.max(1, Math.min(300, +c.min || Math.ceil(total * 0.8))), salt: "acad-exam-" + h,
           lock: c.m === "study" ? "study" : "exam", pool: tests.map(t => t.questions), total, sections: tests.map(t => t.title), questions: [] };
}
const save = () => store.set(KEY, S);
const timed = () => S.mode !== "review";
const reveal = () => S.mode !== "exam" || S.finished;   // можно ли показывать правильные ответы

function pickQuestions() {
  if (S.mode !== "review") { Q = T.questions; return; }
  if (!S.qids && T.srs) S.qids = T.questions.map(q => q.id);
  if (!S.qids) { const m = mistakes(); S.qids = T.questions.filter(q => m[q.id]).map(q => q.id); }
  const set = new Set(S.qids); Q = T.questions.filter(q => set.has(q.id));
}
function sizeAnswers() { if (S.ans.length !== Q.length) S.ans = Array(Q.length).fill(null); }

// ---------- таймер ----------
const fmt = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
function runTimer() { if (!tick) tick = setInterval(updateClock, 250); updateClock(); }
function stopTimer() { if (tick) { clearInterval(tick); tick = null; } if (S.startAt !== null) S.endAt = S.endAt || Date.now(); }
function updateClock() {
  const el = $("timer");
  el.hidden = !timed();
  if (!timed()) return;
  const left = S.startAt === null ? LIMIT : LIMIT - ((S.endAt || Date.now()) - S.startAt);
  $("clock").textContent = fmt(left);
  $("tnote").textContent = S.startAt === null ? "старт с первым ответом" : S.finished ? (S.timedOut ? "время вышло" : "тест завершён") : "осталось";
  el.classList.toggle("warn", !S.finished && S.startAt !== null && left <= 2 * 60 * 1000);
  el.classList.toggle("stop", S.finished);
  if (!S.finished && S.startAt !== null && left <= 0) { S.timedOut = true; S.endAt = S.startAt + LIMIT; showResult(true); }
}

// ---------- ФИО ----------
function fioOk() { const v = $("fio").value.trim().replace(/\s+/g, " "); return v.split(" ").length >= 2 && /^[A-Za-zА-Яа-яЁёӨөҮүҢң'\- ]+$/.test(v) ? v : null; }
function fioLocked() {
  $("fio").value = S.fio; $("fio").readOnly = true;
  const h = $("fiohint"); h.classList.remove("err"); h.textContent = "ФИО зафиксировано до конца попытки.";
}
function fioReset() {
  $("fio").readOnly = false;
  const h = $("fiohint"); h.classList.remove("err");
  h.textContent = "Введите фамилию, имя и отчество. Без ФИО ответы не принимаются; после первого ответа ФИО изменить нельзя.";
}

// ---------- шапка и режимы ----------
function renderChrome() {
  const started = S.startAt !== null || S.ans.some(v => v !== null);
  $("modes").hidden = !!T.lock;
  document.querySelectorAll(".mode").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode));
    b.disabled = started && b.dataset.mode !== S.mode;
  });
  const nMist = T.questions.filter(q => mistakes()[q.id]).length;
  const rv = document.querySelector('[data-mode="review"]');
  rv.hidden = !(nMist || S.mode === "review");
  $("reviewnote").textContent = nMist ? `Ваши ошибки в этом тесте: ${nMist}` : "Ошибок не осталось";
  $("modehint").textContent = started ? "Режим зафиксирован до конца попытки. «Начать заново» — чтобы сменить." : "Режим выбирается до первого ответа.";
  const min = T.minutes;
  const tail = `На тест отводится ${min} мин: отсчёт начинается с первого ответа, по истечении времени тест завершается автоматически. После завершения результат автоматически уходит преподавателю.`;
  $("rules").textContent = S.mode === "study" ? "После ответа сразу показывается правильный вариант и пояснение. " + tail
    : S.mode === "exam" ? "Правильные ответы и пояснения откроются после завершения теста. До конца теста ответ можно изменить. " + tail
    : T.srs ? "Вопросы из всех тестов, в которых вы ошибались, — по расписанию интервального повторения (FSRS). Верный ответ отодвигает следующее повторение: через день, несколько дней, недели, месяцы. Ошибка возвращает вопрос в ближайшие повторения. Без таймера и без отправки преподавателю."
    : "Вопросы, в которых вы ошиблись в прошлых попытках. Без таймера и без отправки преподавателю. Вопрос, на который вы ответили верно, уходит из списка ошибок.";
  $("who").hidden = S.mode === "review";
  $("legend").innerHTML = reveal()
    ? '<span><i style="background:var(--ok)"></i>верно</span><span><i style="background:var(--bad)"></i>неверно</span><span><i style="border:1.5px solid var(--line)"></i>без ответа</span>'
    : '<span><i style="background:var(--navy)"></i>отвечено</span><span><i style="border:1.5px solid var(--line)"></i>без ответа</span>';
  $("finish").textContent = S.mode === "exam" && !S.finished ? "Завершить экзамен" : "Показать результат";
}

function setMode(m) {
  if (m === S.mode || S.startAt !== null || S.ans.some(v => v !== null)) return;
  S = fresh(m); S.fio = $("fio").value; pickQuestions(); sizeAnswers(); save();
  $("result").hidden = true; $("qcard").hidden = false; renderAll();
}

// ---------- вопрос ----------
function renderQ() {
  const c = $("qcard"); c.innerHTML = "";
  if (!Q.length) {
    const st = T.srs && window.AcadSRS ? AcadSRS.stats() : null;
    c.innerHTML = T.srs
      ? `<p>На сегодня повторять нечего.${st && st.next ? " Следующее повторение — " + esc(AcadSRS.fmtDate(st.next)) + "." : ""}</p><p><a href="./">Вернуться к тестам</a></p>`
      : "<p>В этом тесте у вас не осталось ошибок. Выберите учебный режим или экзамен.</p>";
    renderMap(); return;
  }
  const x = Q[S.cur], v = S.ans[S.cur], answered = v !== null, show = reveal();
  const meta = document.createElement("div"); meta.className = "qmeta";
  meta.innerHTML = `<span class="tag">${esc(x.t)}</span><span>Вопрос ${S.cur + 1} из ${Q.length}</span>`;
  const h = document.createElement("p"); h.className = "qtext"; h.textContent = x.q;
  const ul = document.createElement("ul"); ul.className = "opts";
  x.o.forEach((o, i) => {
    const li = document.createElement("li"); const b = document.createElement("button");
    b.type = "button"; b.className = "opt"; b.id = `opt-${S.cur}-${i}`;
    b.innerHTML = `<span class="letter">${L[i]}</span><span></span>`; b.lastChild.textContent = o;
    if (show && (answered || S.finished)) { b.disabled = true; if (i === x.a) b.classList.add("correct"); else if (i === v) b.classList.add("wrong"); }
    else if (!show && i === v) { b.classList.add("picked"); b.setAttribute("aria-pressed", "true"); }
    if (S.finished) b.disabled = true;
    b.addEventListener("click", () => choose(i)); li.appendChild(b); ul.appendChild(li);
  });
  c.append(meta, h);
  if (x.img) {
    const f = document.createElement("figure"); f.className = "qimg";
    const a = document.createElement("a"); a.href = x.img; a.target = "_blank"; a.rel = "noopener"; a.title = "Открыть крупно";
    const im = document.createElement("img"); im.src = x.img; im.alt = x.alt || "Эхограмма"; im.decoding = "async";
    a.appendChild(im); f.appendChild(a);
    const cap = document.createElement("figcaption"); cap.textContent = "Нажмите на изображение, чтобы открыть его крупно. " + (x.cr || "");
    f.appendChild(cap); c.appendChild(f);
  }
  const nextImg = Q[S.cur + 1] && Q[S.cur + 1].img; if (nextImg) { const pre = new Image(); pre.src = nextImg; }
  c.appendChild(ul);
  if (show && answered) {
    const fb = document.createElement("div"); fb.className = "fb"; const ok = v === x.a;
    fb.innerHTML = `<span class="verdict ${ok ? "ok" : "bad"}">${ok ? "Верно." : "Неверно. Правильный ответ — " + L[x.a] + "."}</span><span></span>`;
    fb.children[1].textContent = x.e || "";
    if (x.k) { const k = document.createElement("span"); k.innerHTML = "<b>Вывод:</b> "; k.appendChild(document.createTextNode(x.k)); fb.appendChild(k); }
    if (x.p) { const p = document.createElement("span"); p.innerHTML = "<b>На практике:</b> "; p.appendChild(document.createTextNode(x.p)); fb.appendChild(p); }
    if (x.s) { const s = document.createElement("span"); s.className = "src"; s.textContent = "Источник: " + x.s; fb.appendChild(s); }
    c.appendChild(fb);
  } else if (show && S.finished && !answered) {
    const fb = document.createElement("div"); fb.className = "fb";
    fb.innerHTML = `<span class="verdict bad">Без ответа. Правильный ответ — ${L[x.a]}.</span><span></span>`;
    fb.children[1].textContent = x.e || ""; c.appendChild(fb);
  }
  const nav = document.createElement("div"); nav.className = "nav";
  nav.innerHTML = `<button class="btn" type="button" id="prev">← Назад</button><button class="btn primary" type="button" id="next">${S.cur === Q.length - 1 ? "К результату" : "Далее →"}</button>`;
  c.appendChild(nav);
  $("prev").disabled = S.cur === 0; $("prev").onclick = () => go(S.cur - 1);
  $("next").onclick = () => S.cur === Q.length - 1 ? showResult() : go(S.cur + 1);
  renderMap();
}

function choose(i) {
  if (S.finished) return;
  const was = S.ans[S.cur];
  if (was !== null && S.mode !== "exam") return;          // в учебном режиме ответ окончательный
  if (S.mode !== "review") {
    if (S.startAt === null) {
      const f = fioOk();
      if (!f) { const h = $("fiohint"); h.textContent = "Сначала введите ФИО полностью — хотя бы фамилию и имя, буквами."; h.classList.add("err"); $("fio").focus(); return; }
      S.fio = f; S.startAt = Date.now(); fioLocked(); runTimer();
    }
  } else {
    markMistake(Q[S.cur].id, i !== Q[S.cur].a);
  }
  S.ans[S.cur] = i; save(); renderChrome(); renderQ();
}

function go(i) { if (i < 0 || i >= Q.length) return; S.cur = i; save(); $("result").hidden = true; $("qcard").hidden = false; renderQ(); }

function stats() { const done = S.ans.filter(v => v !== null).length, ok = S.ans.filter((v, i) => v === Q[i].a).length; return { done, ok }; }

function renderMap() {
  const m = $("map"); m.innerHTML = ""; const show = reveal();
  Q.forEach((x, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "cell"; b.textContent = i + 1; b.id = `cell-${i}`;
    b.setAttribute("aria-label", `Вопрос ${i + 1}`);
    if (S.ans[i] !== null) b.classList.add(show ? (S.ans[i] === x.a ? "ok" : "bad") : "done");
    if (i === S.cur && !$("qcard").hidden) b.classList.add("cur");
    b.onclick = () => go(i); m.appendChild(b);
  });
  const { done, ok } = stats();
  $("fill").style.width = (Q.length ? done / Q.length * 100 : 0) + "%";
  $("stat").textContent = show ? `${done} / ${Q.length} отвечено · верно ${ok}` : `${done} / ${Q.length} отвечено`;
}

// ---------- результат и отчёт ----------
function grade(p) { if (p >= 90) return ["Отлично", 0]; if (p >= 75) return ["Хорошо", 1]; if (p >= 60) return ["Удовлетворительно", 2]; return ["Неудовлетворительно", 3]; }
function hash(str) {
  let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  let h2 = 0x9e3779b9; for (const ch of (str + T.salt)) { h2 ^= ch.codePointAt(0); h2 = Math.imul(h2, 0x85ebca6b) >>> 0; }
  const a = h.toString(36).toUpperCase().padStart(7, "0").slice(-4), b = h2.toString(36).toUpperCase().padStart(7, "0").slice(-4); return a + "-" + b;
}
const body = t => t.split(/\r?\n/).map(x => x.trim()).filter(Boolean).filter(x => !x.startsWith("Код проверки:")).join("\n");
function stamp(d) { const z = n => String(n).padStart(2, "0"); return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`; }
function attemptNo() { try { const k = "acad-" + T.salt + "-attempts"; const n = (+localStorage.getItem(k) || 0) + 1; localStorage.setItem(k, n); return n; } catch (e) { return null; } }

function showSend() {
  const el = $("autosend"); if (!el) return;
  const st = S.sendState;
  if (st === "pending") { el.className = "hint"; el.textContent = "Отправляем результат преподавателю…"; }
  else if (st === "sent") { el.className = "ok-msg"; el.textContent = "Результат отправлен преподавателю. Если преподаватель его не получил, нажмите «Отправить через Telegram»."; }
  else if (st === "unknown") { el.className = "bad-msg"; el.textContent = "Страница была закрыта во время отправки — неизвестно, дошёл ли результат. Нажмите «Отправить ещё раз»."; }
  else if (st === "fail") { el.className = "bad-msg"; el.textContent = "Автоматическая отправка не удалась. Нажмите «Отправить через Telegram» и выберите чат преподавателя (или скопируйте отчёт)."; }
  else el.textContent = "";
}
function send(text) {
  S.sendState = "pending"; save(); showSend();
  sendToTeacher(text).then(st => { S.sendState = st; save(); showSend(); });
}

function showResult(auto) {
  if (!Q.length) return;
  if (!S.finished) {
    if (S.mode !== "review" && S.startAt === null) {
      const h = $("fiohint"); h.textContent = "Тест ещё не начат: введите ФИО и ответьте хотя бы на один вопрос."; h.classList.add("err"); $("fio").focus(); return;
    }
    const left = S.ans.filter(v => v === null).length;
    if (!auto && left && !confirm(`Без ответа осталось вопросов: ${left}. Они будут засчитаны как неверные. Завершить?`)) return;
    S.finished = true; stopTimer();
    // В ошибки попадают только неверные ответы; пропущенные вопросы не трогаем.
    if (S.mode !== "review") Q.forEach((q, i) => { if (S.ans[i] !== null) markMistake(q.id, S.ans[i] !== q.a); });
    save();
  }
  updateClock(); renderChrome();
  const { done, ok } = stats(), p = Math.round(ok / Q.length * 100), [g, gi] = grade(p);
  const wrong = Q.map((x, i) => i).filter(i => S.ans[i] !== Q[i].a);
  const wrongList = wrong.length
    ? `<h2>Разобрать ошибки</h2><ol class="wrongs">${wrong.map(i => `<li><button type="button" data-i="${i}">Вопрос ${i + 1}: ${esc(Q[i].t.toLowerCase())}</button></li>`).join("")}</ol>`
    : "<p>Все ответы верны.</p>";
  const r = $("result");

  if (T.srs) {
    const st = window.AcadSRS ? AcadSRS.stats() : { dueToday: 0, next: null, total: 0, learned: 0 };
    r.innerHTML = `<h2>Повторение</h2><div class="score"><span class="big">${ok}/${Q.length}</span><span class="grade">верно</span></div>
      <p class="stat">${st.dueToday ? `На сегодня осталось: ${st.dueToday}. <a href="quiz.html?srs=1" id="more">Продолжить</a>` : "На сегодня всё повторено."}${st.next ? " Следующее повторение — " + esc(AcadSRS.fmtDate(st.next)) + "." : ""}</p>
      <p class="hint">Вопросов в повторении: ${st.total}, из них устойчиво запомнено (интервал 3 недели и больше): ${st.learned}.</p>${wrongList}`;
    const more = r.querySelector("#more"); if (more) more.onclick = e => { e.preventDefault(); store.del(KEY); location.reload(); };
  } else if (S.mode === "review") {
    r.innerHTML = `<h2>Работа над ошибками</h2><div class="score"><span class="big">${ok}/${Q.length}</span><span class="grade">исправлено</span></div>
      <p class="stat">Осталось ошибок в этом тесте: ${T.questions.filter(q => mistakes()[q.id]).length}</p>${wrongList}`;
  } else {
    const LIMITv = LIMIT, used = Math.min(LIMITv, (S.endAt || Date.now()) - S.startAt);
    const rows = [["Отлично", "90–100%"], ["Хорошо", "75–89%"], ["Удовлетворительно", "60–74%"], ["Неудовлетворительно", "менее 60%"]];
    r.innerHTML = `<h2>Результат</h2>${S.timedOut ? `<p class="notice">Время вышло — тест завершён автоматически.</p>` : ""}<div class="score"><span class="big">${ok}/${Q.length}</span><span class="grade">${p}% · ${g}</span></div><p class="stat">Режим: ${MODES[S.mode].name} · затрачено времени: ${fmt(used)} из ${fmt(LIMITv)}</p>
      ${done < Q.length ? `<p class="sub">Без ответа осталось вопросов: ${Q.length - done}. Они засчитаны как неверные.</p>` : ""}
      <table class="scale"><tbody>${rows.map((rw, i) => `<tr class="${i === gi ? "me" : ""}"><td>${rw[0]}</td><td>${rw[1]}</td></tr>`).join("")}</tbody></table>
      <h2>Отправка результата</h2>
      <p id="autosend" role="status"></p>
      <p class="hint">Копия отчёта — на случай, если преподаватель попросит прислать его вручную. Не редактируйте текст — иначе код проверки не совпадёт.</p>
      <textarea class="report" id="report" readonly spellcheck="false"></textarea>
      <div class="actions"><button class="btn primary" id="copy" type="button">Скопировать отчёт</button><button class="btn" id="resend" type="button">Отправить ещё раз</button><button class="btn" id="share" type="button">Отправить через Telegram</button><span id="sendmsg" role="status"></span></div>
      ${wrongList}`;
    if (!S.reportText) {
      const lines = [`Тест «${T.title}» — результат`, `Режим: ${MODES[S.mode].name} · Академия УЗИ`, `ФИО: ${S.fio || "не указано"}`, `Дата: ${stamp(new Date(S.endAt || Date.now()))}`,
        `Результат: ${ok} из ${Q.length} (${p}%) — ${g}`, `Время: ${fmt(used)} из ${fmt(LIMITv)}${S.timedOut ? " (время вышло)" : ""}`,
        `Без ответа: ${Q.length - done}`, `Ошибки в вопросах: ${wrong.length ? wrong.map(i => i + 1).join(", ") : "нет"}`];
      if (T.pool) lines.splice(2, 0, `Вариант: ${S.seed}`);
      const att = attemptNo(); if (att) lines.splice(lines.findIndex(l => l.startsWith("Дата:")) + 1, 0, `Попытка на этом устройстве: ${att}`);
      S.reportText = lines.join("\n") + "\nКод проверки: " + hash(body(lines.join("\n")));
      save(); send(S.reportText);
      // копия результата в личный кабинет (если курсант вошёл; без интернета — сохранится позже)
      if (window.AcadAccount && AcadAccount.saveAttempt) {
        S.cid = S.cid || AcadAccount.newClientId(); save();
        AcadAccount.saveAttempt({ client_id: S.cid, test_id: T.id, title: T.title, mode: S.mode, correct: ok, total: Q.length,
          duration_sec: used / 1000, timed_out: S.timedOut, seed: S.seed || null, wrong_ids: wrong.map(i => Q[i].id),
          report: S.reportText, finished_at: new Date(S.endAt || Date.now()).toISOString() });
      }
    }
    $("report").value = S.reportText; showSend();
    const msg = t => { const m = $("sendmsg"); m.textContent = t; m.className = "ok-msg"; };
    $("copy").onclick = () => {
      const ta = $("report");
      const sel = () => { ta.focus(); ta.select(); msg("Текст выделен — нажмите Ctrl+C (или «Копировать»)."); };
      try { navigator.clipboard.writeText(S.reportText).then(() => msg("Скопировано. Вставьте в чат с преподавателем."), sel); } catch (e) { sel(); }
    };
    $("resend").onclick = () => send(S.reportText + "\n(повторная отправка)");
    $("share").onclick = () => { window.open("https://t.me/share/url?url=" + encodeURIComponent(" ") + "&text=" + encodeURIComponent(S.reportText), "_blank", "noopener"); };
  }
  r.querySelectorAll("[data-i]").forEach(b => b.onclick = () => go(+b.dataset.i));
  $("qcard").hidden = true; r.hidden = false; renderMap(); r.scrollIntoView({ block: "start" });
}

function restart() {
  if (T.srs) { stopTimer(); store.del(KEY); location.reload(); return; }   // новый список вопросов к повторению
  const m = S.mode; stopTimer(); S = fresh(m); applyVariant(); pickQuestions();
  if (m === "review" && !Q.length) { S = fresh("study"); pickQuestions(); }
  sizeAnswers(); store.del(KEY); save(); fioReset(); $("restored").hidden = true;
  $("result").hidden = true; $("qcard").hidden = false; renderAll(); window.scrollTo(0, 0);
}

function renderAll() { renderChrome(); updateClock(); renderQ(); }

// ---------- запуск ----------
function fail(text) {
  $("h1").textContent = "Тест не найден";
  $("about").innerHTML = esc(text) + ' <a href="./">Вернуться к списку тестов</a>.';
  ["modes", "who", "qcard", "timer"].forEach(id => $(id).hidden = true);
  document.querySelector(".map").parentElement.hidden = true;
}

async function boot() {
  const params = new URLSearchParams(location.search), exam = params.get("exam");
  const id = params.get("t") || "";
  if (params.get("srs")) {
    try { T = await loadSrs(); }
    catch (e) { return fail(navigator.onLine ? "Не удалось загрузить вопросы для повторения." : "Нет интернета, и часть тестов для повторения ещё не сохранена на устройстве."); }
  } else if (exam) {
    try { T = await loadExam(exam); }
    catch (e) { return fail(navigator.onLine ? e.message : "Нет интернета, и разделы этого экзамена ещё не сохранены на устройстве."); }
  } else {
    if (!/^[a-z0-9-]+$/.test(id)) return fail("В адресе не указан тест.");
    try {
      const r = await fetch(`data/tests/${id}.json`);
      if (!r.ok) throw new Error(r.status);
      T = await r.json();
    } catch (e) { return fail(navigator.onLine ? "Такого теста нет." : "Нет интернета, и этот тест ещё не сохранён на устройстве."); }
  }

  KEY = "acad-state-" + T.id;
  // У игр «Угадай снимок» нет общего лимита — в обычном тесте даём столько же времени, сколько в игре.
  T.minutes = T.minutes || Math.max(5, Math.ceil(T.questions.length * (T.seconds || 60) / 60));
  LIMIT = T.minutes * 60 * 1000;
  document.title = T.pageTitle || ("Тест: " + T.title);
  $("eyebrow").textContent = T.eyebrow; $("h1").textContent = T.h1 || T.title; $("about").textContent = T.about || "";
  $("foot").textContent = T.footer || "";

  const saved = store.get(KEY, null);
  S = saved && saved.v === 1 && MODES[saved.mode] && (!T.pool || saved.seed) ? saved : fresh("study");
  if (T.lock && S.mode !== T.lock) S = fresh(T.lock);
  applyVariant(); pickQuestions();
  if (S.ans.length !== Q.length) { S = fresh(S.mode === "review" ? "study" : S.mode); applyVariant(); pickQuestions(); }
  sizeAnswers();
  if (S.cur >= Q.length) S.cur = 0;
  // ?mode=review|exam со страницы игры — если попытка ещё не начата
  const want = new URLSearchParams(location.search).get("mode");
  if (!T.lock && MODES[want] && want !== S.mode && S.startAt === null && !S.ans.some(v => v !== null)) {
    S = fresh(want); pickQuestions(); if (!Q.length) { S = fresh("study"); pickQuestions(); } sizeAnswers();
  }

  if (S.startAt !== null || S.ans.some(v => v !== null)) {
    if (S.mode !== "review") fioLocked();
    if (S.sendState === "pending") S.sendState = "unknown";
    const note = $("restored"); note.hidden = false;
    note.textContent = S.finished ? "Это результат вашей последней попытки. Чтобы пройти тест снова, нажмите «Начать заново»."
      : "Попытка восстановлена: ответы сохранены, таймер продолжает идти с момента первого ответа.";
  } else if (S.fio) { $("fio").value = S.fio; }

  document.querySelectorAll(".mode").forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $("fio").addEventListener("input", () => {
    if (S.startAt === null) { S.fio = $("fio").value; save(); }
    const h = $("fiohint"); if (h.classList.contains("err") && fioOk()) { h.classList.remove("err"); h.textContent = "ФИО принято. Можно отвечать."; }
  });
  $("finish").onclick = () => showResult();
  $("restart").onclick = () => {
    if (!S.finished && S.startAt !== null && !confirm("Текущая попытка будет потеряна. Начать заново?")) return;
    restart();
  };
  $("vbtn").onclick = () => {
    const t = $("vin").value, o = $("vout"); const m = t.match(/Код проверки:\s*([0-9A-Z]{4}-[0-9A-Z]{4})/);
    if (!m) { o.className = "bad-msg"; o.textContent = "В тексте нет строки «Код проверки»."; return; }
    const good = hash(body(t)) === m[1]; o.className = good ? "ok-msg" : "bad-msg"; o.textContent = good ? "Код верный: отчёт не изменён." : "Код не совпадает: текст отчёта изменён.";
    // Для экзамена — восстановить вариант курсанта и показать, в каких вопросах он ошибся
    const box = $("vlist"); box.innerHTML = "";
    const sv = t.match(/Вариант:\s*([0-9A-Z]{6})/), sw = t.match(/Ошибки в вопросах:\s*([0-9, ]+)/);
    if (T.pool && good && sv && sw) {
      const qs = variant(T.pool, T.total, sv[1]);
      const nums = sw[1].split(",").map(x => +x.trim()).filter(n => n >= 1 && n <= qs.length);
      box.innerHTML = `<p class="hint">Вариант ${esc(sv[1])}: вопросы с ошибками и правильные ответы.</p><ol class="wrongs">` +
        nums.map(n => `<li value="${n}"><b>${esc(qs[n - 1].t)}.</b> ${esc(qs[n - 1].q)} — <i>${esc(qs[n - 1].o[qs[n - 1].a])}</i></li>`).join("") + "</ol>";
    }
  };
  document.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if ($("qcard").hidden || !Q.length) return;
    const kn = +e.key; if (kn >= 1 && kn <= Q[S.cur].o.length) choose(kn - 1);
    else if (e.key === "ArrowRight") go(S.cur + 1); else if (e.key === "ArrowLeft") go(S.cur - 1);
  });

  // ФИО из личного кабинета, если курсант вошёл и попытка ещё не начата
  if (window.AcadAccount && AcadAccount.ready) AcadAccount.ready.then(p => {
    if (p && p.full_name && S.startAt === null && !$("fio").value.trim() && S.mode !== "review") {
      $("fio").value = p.full_name; S.fio = p.full_name; save();
      const h = $("fiohint"); h.classList.remove("err"); h.textContent = "ФИО взято из личного кабинета. Результат сохранится и в кабинете.";
    }
  });

  renderAll();
  if (S.finished) showResult();
  else if (S.startAt !== null && timed()) runTimer();   // истёкшее время завершит тест в updateClock
}

boot();
})();
