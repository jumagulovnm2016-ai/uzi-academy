// Ситуационные задачи Академии УЗИ: курсант пишет ответ сам (категория + обоснование и тактика),
// затем открывает эталонный ответ и оценивает себя: верно / частично / неверно.
// Данные — data/cases/<id>.json. Порядок задач у каждого курсанта свой (перемешивается при старте).
(function () {
"use strict";
const TG_CHAT = "188183172";
const TG_PROXY = "https://script.google.com/macros/s/AKfycbznrtw3Wd7QBRhQaMlrCIp86oLemxjc_LlaIVomj-9rcXiyMYpmP_OCtc8u4lgQbaXKpg/exec";
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const MARK = { "1": "верно", "0.5": "частично", "0": "неверно" };
let T = null, S = null, KEY = "", ME = null, cur = 0;

function shuffle(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fresh() { return { order: shuffle(T.tasks.length), ans: {}, fio: "", startAt: null, endAt: null, sent: false, cid: null }; }
const save = () => store.set(KEY, S);
const fio = () => (ME && ME.full_name ? ME.full_name.trim() : (S.fio || "").trim());
const fioOk = () => fio().split(/\s+/).filter(Boolean).length >= 2;
const task = i => T.tasks[S.order[i]];
const A = t => S.ans[t.id] || (S.ans[t.id] = { cat: "", text: "", open: false, mark: null });
const opened = () => T.tasks.filter(t => S.ans[t.id] && S.ans[t.id].open).length;
const score = () => T.tasks.reduce((s, t) => s + (S.ans[t.id] && S.ans[t.id].mark != null ? +S.ans[t.id].mark : 0), 0);

function stat() {
  const n = T.tasks.length, o = opened();
  $("fill").style.width = (100 * o / n) + "%";
  $("stat").textContent = `${o} / ${n} решено · ${String(score()).replace(".", ",")} балл.`;
  $("map").innerHTML = "";
  S.order.forEach((k, i) => {
    const t = T.tasks[k], a = S.ans[t.id], b = document.createElement("button");
    b.type = "button"; b.className = "cell"; b.textContent = i + 1; b.setAttribute("aria-label", "Задача " + (i + 1));
    if (a && a.open) b.classList.add(a.mark === "1" ? "ok" : a.mark === "0.5" ? "half" : a.mark === "0" ? "bad" : "open");
    if (i === cur) b.classList.add("cur");
    b.onclick = () => { cur = i; render(); };
    $("map").appendChild(b);
  });
}

function render() {
  $("result").hidden = true; $("tcard").hidden = false;
  const t = task(cur), a = A(t), n = T.tasks.length, locked = a.open;
  let h = `<span class="eyebrow">Задача ${cur + 1} из ${n}</span>
    <p class="vignette">${esc(t.text)}</p>
    <p class="task-q">${esc(T.q)}</p>
    <div class="field"><label for="cat">Категория BI-RADS</label>
      <input id="cat" type="text" maxlength="60" placeholder="Например: BI-RADS 3" value="${esc(a.cat)}" ${locked ? "readonly" : ""}></div>
    <div class="field"><label for="txt">Обоснование и тактика</label>
      <textarea id="txt" maxlength="1500" placeholder="Какие признаки определили категорию? Что рекомендуете?" ${locked ? "readonly" : ""}>${esc(a.text)}</textarea></div>`;
  if (!locked) {
    h += `<p class="hint" id="openhint">Сначала напишите ответ. После открытия эталона изменить его будет нельзя.</p>
      <div class="actions"><button class="btn primary" id="open" type="button">Показать правильный ответ</button></div>`;
  } else {
    h += `<div class="key"><div class="cat">${esc(t.cat)}</div>
      ${t.why.map(p => `<p>${esc(p)}</p>`).join("")}
      <p><b>Тактика.</b> ${esc(t.tac)}</p>
      <p class="trap"><b>Типичная ошибка.</b> ${esc(t.trap)}</p>
      <p class="src">Источник: ${esc(t.s)}</p></div>
      <div class="self"><b style="color:var(--navy)">Сравните со своим ответом и оцените себя:</b>
        <div class="row">${["1", "0.5", "0"].map(v => `<button type="button" data-v="${v}" aria-pressed="${a.mark === v}" ${S.endAt ? "disabled" : ""}>${v === "1" ? "Верно" : v === "0.5" ? "Частично" : "Неверно"}</button>`).join("")}</div>
        <p class="hint">«Частично» — например, верная категория без тактики или соседняя подкатегория 4.</p></div>`;
  }
  h += `<div class="navrow"><button class="btn" id="prev" type="button" ${cur === 0 ? "disabled" : ""}>← Назад</button>
    <button class="btn" id="next" type="button">${cur === n - 1 ? "К карте ↓" : "Далее →"}</button></div>`;
  $("tcard").innerHTML = h;
  const cat = $("cat"), txt = $("txt");
  if (!locked) {
    cat.oninput = () => { a.cat = cat.value; save(); };
    txt.oninput = () => { a.text = txt.value; save(); };
    $("open").onclick = () => {
      const hint = $("openhint");
      if (!fioOk()) { hint.textContent = "Сначала введите ФИО (фамилия, имя, отчество)."; hint.className = "hint err"; $("fio").focus(); return; }
      if (!a.cat.trim()) { hint.textContent = "Напишите категорию BI-RADS."; hint.className = "hint err"; cat.focus(); return; }
      if (a.text.trim().length < 10) { hint.textContent = "Кратко обоснуйте категорию и укажите тактику."; hint.className = "hint err"; txt.focus(); return; }
      a.open = true; if (!S.startAt) S.startAt = Date.now(); save(); lockFio(); render();
    };
  } else {
    document.querySelectorAll(".self button").forEach(b => b.onclick = () => { if (S.endAt) return; a.mark = b.dataset.v; save(); render(); });
  }
  $("prev").onclick = () => { if (cur > 0) { cur--; render(); window.scrollTo({ top: 0 }); } };
  $("next").onclick = () => { if (cur < n - 1) { cur++; render(); window.scrollTo({ top: 0 }); } else $("map").scrollIntoView({ behavior: "smooth" }); };
  stat(); finishState();
}

function finishState() {
  const n = T.tasks.length, unmarked = T.tasks.filter(t => !(S.ans[t.id] && S.ans[t.id].mark != null)).length;
  $("finish").disabled = !!S.endAt ? false : unmarked > 0;
  $("finish").title = unmarked ? `Осталось решить и оценить задач: ${unmarked}` : "";
}

function lockFio() {
  const f = $("fio");
  if (ME && ME.full_name) { f.value = ME.full_name; f.readOnly = true; $("fiohint").textContent = "ФИО из личного кабинета."; return; }
  if (opened() > 0) { f.readOnly = true; $("fiohint").textContent = "После первого ответа ФИО изменить нельзя."; }
}

function stamp(d) { const p = x => String(x).padStart(2, "0"); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function grade(pct) { return pct >= 90 ? "Отлично" : pct >= 75 ? "Хорошо" : pct >= 60 ? "Удовлетворительно" : "Неудовлетворительно"; }

function report() {
  const n = T.tasks.length, sc = score(), pct = Math.round(100 * sc / n);
  const lines = [`Задачи «${T.title}» — результат (самооценка)`, `Академия УЗИ`, `ФИО: ${fio() || "не указано"}`, `Дата: ${stamp(new Date(S.endAt || Date.now()))}`,
    `Баллы: ${String(sc).replace(".", ",")} из ${n} (${pct}%) — ${grade(pct)}`, ""];
  S.order.forEach((k, i) => {
    const t = T.tasks[k], a = S.ans[t.id] || {};
    const txt = (a.text || "").replace(/\s+/g, " ").trim();
    lines.push(`${i + 1}. [№${k + 1}] Ответ: ${(a.cat || "—").trim()} · эталон: ${t.cat} · ${MARK[a.mark] || "без оценки"}`);
    lines.push(`   ${txt.length > 220 ? txt.slice(0, 220) + "…" : txt}`);
  });
  return lines.join("\n").slice(0, 3900);
}

async function send(text) {
  try { await fetch(TG_PROXY, { method: "POST", mode: "no-cors", body: new URLSearchParams({ chat_id: TG_CHAT, text }) }); return true; }
  catch (e) { return false; }
}

function finish() {
  const n = T.tasks.length, sc = score(), pct = Math.round(100 * sc / n);
  if (!S.endAt) {
    S.endAt = Date.now(); save();
    const text = report();
    send(text).then(ok => { S.sent = ok; save(); const m = $("sendmsg"); if (m) { m.textContent = ok ? "Результат отправлен преподавателю." : "Не удалось отправить — скопируйте отчёт и пришлите преподавателю."; m.className = ok ? "ok-msg" : "bad-msg"; } });
    if (window.AcadAccount && AcadAccount.saveAttempt) {
      S.cid = S.cid || AcadAccount.newClientId(); save();
      AcadAccount.saveAttempt({ client_id: S.cid, test_id: T.id, title: T.title, mode: "study",
        correct: T.tasks.filter(t => S.ans[t.id] && S.ans[t.id].mark === "1").length, total: n,
        duration_sec: S.startAt ? (S.endAt - S.startAt) / 1000 : null,
        wrong_ids: T.tasks.filter(t => !(S.ans[t.id] && S.ans[t.id].mark === "1")).map(t => t.id),
        report: text, finished_at: new Date(S.endAt).toISOString() });
    }
  }
  const half = T.tasks.filter(t => S.ans[t.id] && S.ans[t.id].mark === "0.5").length;
  const bad = S.order.map((k, i) => ({ t: T.tasks[k], i })).filter(({ t }) => !(S.ans[t.id] && S.ans[t.id].mark === "1"));
  $("result").innerHTML = `<h2>Результат</h2>
    <div class="score"><span class="big">${String(sc).replace(".", ",")}/${n}</span><span class="grade">${pct}% · ${grade(pct)}</span></div>
    <p class="hint">По самооценке: «верно» — 1 балл, «частично» — 0,5 балла${half ? `; частично решено задач: ${half}` : ""}. Ваши ответы вместе с самооценкой ушли преподавателю.</p>
    <table class="scale"><tbody>${[["Отлично", "90–100%"], ["Хорошо", "75–89%"], ["Удовлетворительно", "60–74%"], ["Неудовлетворительно", "менее 60%"]].map(([g, r]) => `<tr class="${g === grade(pct) ? "me" : ""}"><td>${g}</td><td>${r}</td></tr>`).join("")}</tbody></table>
    ${bad.length ? `<h2>Вернуться к задачам</h2><ol class="wrongs">${bad.map(({ t, i }) => `<li><button type="button" data-i="${i}">Задача ${i + 1}: эталон — ${esc(t.cat)}</button></li>`).join("")}</ol>` : ""}
    <h2>Отчёт</h2><p id="sendmsg" class="${S.sent ? "ok-msg" : "hint"}">${S.sent ? "Результат отправлен преподавателю." : "Отправка…"}</p>
    <textarea class="report" id="rep" readonly>${esc(report())}</textarea>
    <div class="actions"><button class="btn" id="copy" type="button">Скопировать отчёт</button></div>`;
  $("result").hidden = false; $("tcard").hidden = true;
  $("result").querySelectorAll(".wrongs button").forEach(b => b.onclick = () => { cur = +b.dataset.i; render(); window.scrollTo({ top: 0 }); });
  $("copy").onclick = () => { const ta = $("rep"); try { navigator.clipboard.writeText(ta.value).then(() => { $("sendmsg").textContent = "Скопировано."; }); } catch (e) { ta.select(); } };
  stat(); window.scrollTo({ top: 0 });
}

async function boot() {
  if (!window.AcadAccount || !AcadAccount.gate || !(await AcadAccount.gate())) return;
  const id = new URLSearchParams(location.search).get("t") || "";
  if (!/^[a-z0-9-]{1,80}$/.test(id)) { $("h1").textContent = "Задачи не найдены"; return; }
  try { T = await (await fetch("data/cases/" + id + ".json", { cache: "no-cache" })).json(); }
  catch (e) { $("h1").textContent = navigator.onLine ? "Не удалось загрузить задачи" : "Нет интернета, и задачи ещё не сохранены на устройстве"; return; }
  KEY = "acad-cases-" + T.id;
  S = store.get(KEY, null);
  if (!S || !Array.isArray(S.order) || S.order.length !== T.tasks.length) S = fresh();
  document.title = T.pageTitle || T.title;
  $("eyebrow").textContent = T.eyebrow || "Академия УЗИ"; $("h1").textContent = T.h1 || T.title;
  $("about").textContent = T.about || ""; $("foot").textContent = T.footer || "";
  ME = AcadAccount.current ? AcadAccount.current() : null;
  const f = $("fio"); f.value = (ME && ME.full_name) || S.fio || "";
  f.oninput = () => { if (!f.readOnly) { S.fio = f.value; save(); } };
  lockFio();
  if (AcadAccount.ready) AcadAccount.ready.then(p => { if (p) { ME = p; lockFio(); } });
  $("restart").onclick = () => { if (confirm("Начать задачи заново? Ваши ответы будут удалены, а порядок задач изменится.")) { store.del(KEY); S = fresh(); S.fio = (ME && ME.full_name) || ""; save(); cur = 0; f.readOnly = false; lockFio(); render(); } };
  $("finish").onclick = finish;
  if (S.endAt) finish(); else render();
}
boot();
})();
