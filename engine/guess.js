// Игра «Угадай снимок» Академии УЗИ: guess.html?t=<id>, вопросы — data/tests/<id>.json.
// Перенесена со страниц игр без изменения правил подсчёта баллов. Добавлено:
// — ход игры сохраняется; если страницу перезагрузить на открытом снимке, он засчитывается как «время вышло»;
// — ошибки попадают в общий список ошибок (разбираются в quiz.html в режиме «Работа над ошибками»).
(function () {
"use strict";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const TG_CHAT = "188183172";
const TG_PROXY = "https://script.google.com/macros/s/AKfycbznrtw3Wd7QBRhQaMlrCIp86oLemxjc_LlaIVomj-9rcXiyMYpmP_OCtc8u4lgQbaXKpg/exec";
let cspBlocked = false;
document.addEventListener("securitypolicyviolation", e => { if (String(e.blockedURI || "").includes("script.google")) cspBlocked = true; });
const wait = ms => new Promise(r => setTimeout(r, ms));
// Несколько способов доставки: если один заблокирован браузером или сетью, пробуем следующий
async function sendTG(text) {
  const url = TG_PROXY;
  try { await fetch(url, { method: "POST", mode: "no-cors", body: new URLSearchParams({ chat_id: TG_CHAT, text }) }); return true; } catch (e) {}
  cspBlocked = false;
  try { const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = url + "?" + new URLSearchParams({ chat_id: TG_CHAT, text, _: Date.now() }); } catch (e) {}
  await wait(1500); if (!cspBlocked) return true;
  cspBlocked = false;
  try {
    const fr = document.createElement("iframe"); fr.name = "tgsink"; fr.hidden = true; document.body.appendChild(fr);
    const f = document.createElement("form"); f.method = "POST"; f.target = "tgsink"; f.action = url; f.hidden = true;
    for (const [k, v] of [["chat_id", TG_CHAT], ["text", text]]) { const i = document.createElement("input"); i.name = k; i.value = v; f.appendChild(i); }
    document.body.appendChild(f); f.submit();
  } catch (e) { return false; }
  await wait(1500); return !cspBlocked;
}

const MKEY = "acad-mistakes";
function markMistake(qid, wrong) {
  if (window.AcadSRS) AcadSRS.rate(qid, !wrong);          // интервальное повторение (engine/srs.js)
  const m = store.get(MKEY, {}); if (wrong) m[qid] = (m[qid] || 0) + 1; else delete m[qid]; store.set(MKEY, m); }

const SHAPES = ['<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3 22 20H2z"/></svg>', '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2 22 12 12 22 2 12z"/></svg>',
  '<svg viewBox="0 0 24 24"><circle fill="#fff" cx="12" cy="12" r="9.5"/></svg>', '<svg viewBox="0 0 24 24"><rect fill="#fff" x="3.5" y="3.5" width="17" height="17" rx="1"/></svg>'];
const shuffle = a => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
function fioOk(v) { v = v.trim().replace(/\s+/g, " "); return v.split(" ").length >= 2 && /^[A-Za-zА-Яа-яЁёӨөҮүҢң'\- ]+$/.test(v) ? v : null; }

let T, Q, LIMIT, KEY, S, perm = [], t0 = 0, raf = 0, locked = false;
// S.phase: "q" — снимок открыт, "fb" — показан разбор, "done" — игра окончена
const fresh = fio => ({ v: 1, fio, i: 0, score: 0, streak: 0, best: 0, log: [], phase: "q", text: null, sent: null });
const save = () => store.set(KEY, S);

function begin() {
  S = fresh(S && S.fio || fioOk($("fio").value)); save();
  $("start").hidden = true; $("result").hidden = true; $("game").hidden = false; window.scrollTo(0, 0); show();
}

function paintQuestion() {
  const x = Q[S.i];
  $("qn").textContent = S.i + 1; $("score").textContent = S.score; $("tag").textContent = x.t; $("qtext").textContent = x.q;
  const im = $("qimg"), fig = im.closest("figure");
  fig.hidden = !x.img;                                   // квизы на время — без эхограмм
  if (x.img) { im.alt = x.t + ": эхограмма"; $("imglink").href = x.img; im.src = x.img; } else im.removeAttribute("src");
}

function show() {
  const x = Q[S.i]; locked = false; perm = shuffle([0, 1, 2, 3].slice(0, x.o.length));
  S.phase = "q"; save();
  paintQuestion();
  $("fb").hidden = true; $("next").hidden = true;
  const g = $("tiles"); g.innerHTML = "";
  perm.forEach((oi, pos) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tile t" + pos; b.dataset.oi = oi;
    b.innerHTML = SHAPES[pos] + "<span></span>"; b.lastChild.textContent = x.o[oi]; b.setAttribute("aria-label", (pos + 1) + ": " + x.o[oi]);
    b.onclick = () => answer(oi); g.appendChild(b);
  });
  cancelAnimationFrame(raf); $("secs").textContent = LIMIT; $("bar").style.transform = "scaleX(1)"; $("bar").classList.remove("low");
  t0 = performance.now(); const qi = S.i, im = $("qimg"); let started = false;
  const go = () => { if (started || locked || S.i !== qi) return; started = true; t0 = performance.now(); tick(); };
  if (!x.img) go();
  else { im.onload = go; im.onerror = go; if (im.complete && im.naturalWidth) go(); setTimeout(go, 6000); }
  if (Q[S.i + 1] && Q[S.i + 1].img) { const pre = new Image(); pre.src = Q[S.i + 1].img; }
}

function tick() {
  const left = Math.max(0, LIMIT - (performance.now() - t0) / 1000);
  $("bar").style.transform = `scaleX(${left / LIMIT})`; $("bar").classList.toggle("low", left <= 5);
  $("secs").textContent = Math.ceil(left);
  if (left <= 0) { answer(null); return; }
  raf = requestAnimationFrame(tick);
}

function record(oi, el) {
  const x = Q[S.i], ok = oi === x.a;
  const pts = ok ? Math.round(500 + 500 * (1 - el / LIMIT)) : 0;
  if (ok) { S.streak++; S.best = Math.max(S.best, S.streak); } else S.streak = 0;
  S.score += pts; S.log.push({ ok, el, pts, timeout: oi === null, oi });
  markMistake(x.id, !ok);
  S.phase = "fb"; save();
}

function answer(oi) {
  if (locked) return; locked = true; cancelAnimationFrame(raf);
  record(oi, Math.min(LIMIT, (performance.now() - t0) / 1000));
  showFeedback();
}

function showFeedback() {
  locked = true;
  const x = Q[S.i], r = S.log[S.i], ok = r.ok, oi = r.oi;
  $("score").textContent = S.score;
  [...$("tiles").children].forEach(b => { b.disabled = true; const k = +b.dataset.oi; if (k === x.a) b.classList.add("right"); else if (k === oi) b.classList.add("picked"); else b.classList.add("dim"); });
  const fb = $("fb"); fb.hidden = false;
  fb.className = "verdict " + (ok ? "ok" : "bad");
  fb.innerHTML = `<strong></strong><span class="pts"></span><span class="e"></span><span class="src"></span>`;
  fb.children[0].textContent = ok ? "Верно!" : (oi === null ? (r.reloaded ? "Страница была перезагружена — вопрос засчитан как «время вышло»" : "Время вышло") : "Неверно");
  fb.children[1].textContent = ok ? `+${r.pts} баллов · ${r.el.toFixed(1)} с${S.streak >= 3 ? ` · серия ${S.streak} 🔥` : ""}` : `Правильно: ${x.o[x.a]}`;
  fb.children[2].textContent = x.e; fb.children[3].textContent = x.s ? "Источник: " + x.s : "";
  $("next").hidden = false; $("next").textContent = S.i === Q.length - 1 ? "Показать результат" : "Следующий вопрос →"; $("next").focus({ preventScroll: true });
}

// Восстановление после перезагрузки: показываем снимок с разбором (без плиток — порядок вариантов не сохранялся)
function resumeFeedback() {
  paintQuestion();
  const x = Q[S.i], g = $("tiles"); g.innerHTML = "";
  x.o.forEach((o, oi) => { const b = document.createElement("button"); b.type = "button"; b.className = "tile t" + oi; b.dataset.oi = oi;
    b.innerHTML = SHAPES[oi] + "<span></span>"; b.lastChild.textContent = o; g.appendChild(b); });
  $("secs").textContent = "0"; $("bar").style.transform = "scaleX(0)";
  showFeedback();
}

function grade(p) { return p >= 90 ? "Отлично" : p >= 75 ? "Хорошо" : p >= 60 ? "Удовлетворительно" : "Неудовлетворительно"; }
function stamp(d) { const z = n => String(n).padStart(2, "0"); return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`; }
function hash(s) { let h = 0x811c9dc5; for (const ch of s + "|" + T.salt) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).toUpperCase().padStart(6, "0").slice(-6); }
function attemptNo() { try { const k = "acad-" + T.salt + "-attempts"; const n = (+localStorage.getItem(k) || 0) + 1; localStorage.setItem(k, n); return n; } catch (e) { return null; } }

function finish() {
  $("game").hidden = true; $("start").hidden = true;
  const n = Q.length, log = S.log, ok = log.filter(r => r.ok).length, p = Math.round(ok / n * 100);
  const answered = log.filter(r => !r.timeout), avg = answered.length ? answered.reduce((s, r) => s + r.el, 0) / answered.length : 0;
  const okT = log.filter(r => r.ok).map(r => r.el), fastest = okT.length ? Math.min(...okT) : null;
  const wrong = log.map((r, k) => r.ok ? null : k + 1).filter(Boolean);
  if (!S.text) {
    const att = attemptNo();
    const lines = [`${T.title} — результат`, `Режим: игра · Академия УЗИ`, `ФИО: ${S.fio}`, `Дата: ${stamp(new Date())}`].concat(att ? [`Попытка на этом устройстве: ${att}`] : []).concat([
      `Баллы: ${S.score} из ${n * 1000}`, `Верно: ${ok} из ${n} (${p}%) — ${grade(p)}`, `Среднее время ответа: ${avg.toFixed(1)} с`,
      `Лучшая серия: ${S.best}`, `Ошибки в вопросах: ${wrong.length ? wrong.join(", ") : "нет"}`]);
    S.text = lines.join("\n") + "\nКод: " + hash(lines.join("\n"));
    // копия результата в личный кабинет
    if (window.AcadAccount && AcadAccount.saveAttempt) {
      S.cid = S.cid || AcadAccount.newClientId();
      AcadAccount.saveAttempt({ client_id: S.cid, test_id: T.id, title: T.title, mode: "game", correct: ok, total: n, points: S.score,
        duration_sec: log.reduce((s, r) => s + r.el, 0), wrong_ids: log.map((r, k) => r.ok ? null : Q[k].id).filter(Boolean), report: S.text });
    }
  }
  S.phase = "done"; save();
  const nMist = T.questions.filter(q => store.get(MKEY, {})[q.id]).length;
  const r = $("result"); r.hidden = false;
  r.innerHTML = `<span class="eyebrow">Результат</span><div class="big">${S.score}</div><p class="muted">баллов из ${n * 1000}</p>
   <div class="stats"><div class="stat"><span>Верных ответов</span><b>${ok} / ${n}</b></div><div class="stat"><span>Оценка</span><b style="font-size:17px">${grade(p)}</b></div>
   <div class="stat"><span>Среднее время</span><b>${avg.toFixed(1)} с</b></div><div class="stat"><span>Самый быстрый верный</span><b>${fastest !== null ? fastest.toFixed(1) + " с" : "—"}</b></div>
   <div class="stat"><span>Лучшая серия</span><b>${S.best}</b></div></div>
   <p class="send" id="send"></p>
   <ol class="list">${log.map(rr => `<li class="${rr.ok ? "v" : "x"}">${rr.ok ? "верно" : rr.timeout ? "время вышло" : "неверно"} · ${rr.el.toFixed(1)} с · +${rr.pts}</li>`).join("")}</ol>
   <div class="row"><button class="btn" id="again" type="button">Пройти ещё раз</button><button class="btn ghost" id="share" type="button">Отправить через Telegram</button></div>
   ${nMist ? `<p class="muted">Ошибок в этой игре: ${nMist}. <a href="quiz.html?t=${esc(T.id)}&mode=review">Разобрать их без таймера</a>.</p>` : ""}`;
  $("again").onclick = () => { r.hidden = true; r.innerHTML = ""; store.del(KEY); begin(); };
  $("share").onclick = () => window.open("https://t.me/share/url?url=" + encodeURIComponent(" ") + "&text=" + encodeURIComponent(S.text), "_blank", "noopener");
  window.scrollTo(0, 0);
  const paint = () => { const s = $("send"); if (!s) return;
    if (S.sent === null) { s.className = "send"; s.textContent = "Отправляем результат преподавателю…"; }
    else { s.className = "send " + (S.sent ? "ok" : "bad"); s.textContent = S.sent ? "Результат отправлен преподавателю." : "Автоматически отправить не удалось — нажмите «Отправить через Telegram» и выберите чат преподавателя."; } };
  paint();
  if (S.sent === null) sendTG(S.text).then(okS => { S.sent = okS; save(); paint(); });
}

$("next").onclick = () => { if (S.i < Q.length - 1) { S.i++; show(); window.scrollTo(0, 0); } else finish(); };
document.addEventListener("keydown", e => {
  if ($("game").hidden) return;
  if (!locked && /^[1-4]$/.test(e.key) && perm[+e.key - 1] !== undefined) answer(perm[+e.key - 1]);
  else if (locked && e.key === "Enter" && document.activeElement !== $("next")) $("next").click();
});

function fail(text) { $("h1").textContent = "Игра не найдена"; $("about").innerHTML = esc(text) + ' <a href="./">Вернуться к списку тестов</a>.'; ["rules", "go", "fio"].forEach(id => $(id).hidden = true); document.querySelector('label[for="fio"]').hidden = true; document.querySelector(".alt").hidden = true; }

async function boot() {
  const id = new URLSearchParams(location.search).get("t") || "";
  if (!/^[a-z0-9-]+$/.test(id)) return fail("В адресе не указана игра.");
  try { const r = await fetch(`data/tests/${id}.json`); if (!r.ok) throw 0; T = await r.json(); }
  catch (e) { return fail(navigator.onLine ? "Такой игры нет." : "Нет интернета, и эта игра ещё не сохранена на устройстве."); }
  if (T.format !== "guess") { location.replace("quiz.html?t=" + encodeURIComponent(T.id)); return; }
  Q = T.questions; LIMIT = T.seconds; KEY = "acad-state-" + T.id;
  document.title = T.pageTitle || T.title;
  $("eyebrow").textContent = T.eyebrow; $("h1").textContent = T.h1 || T.title; $("about").textContent = T.about; $("foot").textContent = T.footer;
  $("qtotal").textContent = Q.length;
  const pics = Q.some(q => q.img), unit = pics ? "снимок" : "вопрос";
  $("unit").textContent = pics ? "Снимок" : "Вопрос";
  $("rules").innerHTML = [pics ? `На каждый снимок — ${LIMIT} секунд; отсчёт начинается, когда снимок загрузился.` : `На каждый вопрос — ${LIMIT} секунд.`,
    pics ? "Снимок можно открыть крупно, нажав на него (время при этом идёт)." : null,
    "Ответ выбирается одним касанием, изменить его нельзя.", "После ответа — правильный вариант и короткое пояснение; пауза между вопросами в зачёт времени не идёт.",
    `Если перезагрузить страницу на открытом вопросе, он засчитывается как «время вышло».`, "В конце результат автоматически уходит преподавателю."]
    .filter(Boolean).map(t => `<li>${esc(t)}</li>`).join("");
  $("asquiz").parentElement.firstChild.textContent = `Без таймера на каждый ${unit}: `;
  $("asquiz").href = `quiz.html?t=${encodeURIComponent(T.id)}`;
  const nMist = T.questions.filter(q => store.get(MKEY, {})[q.id]).length;
  if (nMist) { $("mistline").hidden = false; $("mistn").textContent = nMist; $("asreview").href = `quiz.html?t=${encodeURIComponent(T.id)}&mode=review`; }

  $("go").onclick = () => { const v = fioOk($("fio").value); if (!v) { $("fioerr").hidden = false; $("fio").focus(); return; } S = null; $("fio").value = v; begin(); };
  $("fio").addEventListener("keydown", e => { if (e.key === "Enter") $("go").click(); });

  if (window.AcadAccount && AcadAccount.ready) AcadAccount.ready.then(p => { if (p && p.full_name && !$("fio").value.trim()) $("fio").value = p.full_name; });
  const saved = store.get(KEY, null);
  if (saved && saved.v === 1 && saved.fio && saved.log.length <= Q.length) {
    S = saved; $("start").hidden = true; $("game").hidden = false;
    if (S.phase === "done") return finish();
    if (S.phase === "q") { S.log.splice(S.i); record(null, LIMIT); S.log[S.i].reloaded = true; save(); }
    resumeFeedback();
  }
}
boot();
})();
