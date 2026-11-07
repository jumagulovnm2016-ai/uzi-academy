// Персональный план Академии УЗИ: слабые темы, что пройти дальше, что пора проверить повторно.
// Источник данных — последние попытки по каждому тесту:
//   • с сервера (личный кабинет): у попытки есть список вопросов с ошибкой (wrong_ids);
//   • с этого устройства: сохранённый ход теста или игры (точные ответы на каждый вопрос).
// Для каждого теста берётся самая свежая попытка; точность по теме = доля верных ответов
// на вопросы этой темы в ней. Сборные экзамены (свой набор вопросов) в темы не входят.
(function () {
"use strict";
const DAY = 864e5;
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

// Попытки, сохранённые на этом устройстве (нужен уже загруженный тест, чтобы сопоставить ответы)
function localAttempt(T) {
  const S = LS("acad-state-" + T.id);
  if (!S || S.v !== 1) return null;
  if (T.format === "guess") {
    if (S.phase !== "done" || !Array.isArray(S.log) || S.log.length !== T.questions.length) return null;
    return { test_id: T.id, mode: "game", finished_at: null, wrong_ids: T.questions.filter((q, k) => !S.log[k].ok).map(q => q.id), total: T.questions.length, source: "device" };
  }
  if (!S.finished || S.mode === "review" || !Array.isArray(S.ans) || S.ans.length !== T.questions.length) return null;
  return { test_id: T.id, mode: S.mode, finished_at: S.endAt ? new Date(S.endAt).toISOString() : null,
           wrong_ids: T.questions.filter((q, i) => S.ans[i] !== q.a).map(q => q.id), total: T.questions.length, source: "device" };
}

// Последняя попытка по каждому тесту
function latest(attempts) {
  const by = {};
  for (const a of attempts) {
    if (!a || !/^[a-z0-9-]+$/.test(a.test_id) || a.test_id.startsWith("exam-") || a.mode === "review" || a.mode === "srs") continue;
    const cur = by[a.test_id], t = a.finished_at ? Date.parse(a.finished_at) : 0;
    if (!cur || t > (cur.finished_at ? Date.parse(cur.finished_at) : 0)) by[a.test_id] = a;
  }
  return by;
}

// Точность по темам. tests: { id: JSON теста }
function topics(last, tests) {
  const out = [];
  for (const id in last) {
    const T = tests[id]; if (!T) continue;
    const wrong = new Set(last[id].wrong_ids || []), agg = {};
    for (const q of T.questions) { const g = agg[q.t] || (agg[q.t] = { n: 0, ok: 0, wrongIds: [] }); g.n++; if (wrong.has(q.id)) g.wrongIds.push(q.id); else g.ok++; }
    for (const t in agg) out.push({ test: id, title: T.title, topic: t, n: agg[t].n, ok: agg[t].ok, acc: Math.round(agg[t].ok / agg[t].n * 100), wrongIds: agg[t].wrongIds, when: last[id].finished_at });
  }
  return out;
}

function pctOf(a, T) {
  if (a.percent != null) return a.percent;
  const total = a.total || (T && T.questions.length) || 0;
  return total ? Math.round((total - (a.wrong_ids || []).length) / total * 100) : 0;
}

// Рекомендации по порядку важности
function build({ attempts, tests, catalog, srs }) {
  const last = latest(attempts), tops = topics(last, tests), now = Date.now(), recs = [];
  const link = (id, mode) => { const T = tests[id]; const page = T && T.format === "guess" && !mode ? "guess.html" : "quiz.html"; return `${page}?t=${encodeURIComponent(id)}${mode ? "&mode=" + mode : ""}`; };

  if (srs && srs.dueToday) recs.push({ kind: "srs", title: `Повторить ${srs.dueToday} вопр. по расписанию`, why: "Повторение в срок — главное, что удерживает знания. Займёт 5–10 минут.", href: "quiz.html?srs=1", action: "Повторить" });

  const weak = tops.filter(t => t.n >= 2 && t.acc < 70).sort((a, b) => a.acc - b.acc || b.n - a.n);
  weak.slice(0, 3).forEach(t => recs.push({ kind: "weak", title: `Слабая тема: ${t.topic}`, why: `${t.title}: верно ${t.ok} из ${t.n} (${t.acc}%). Разберите ошибки с пояснениями, затем пройдите тест заново.`,
    href: link(t.test, "review"), action: "Разобрать ошибки", href2: link(t.test), action2: "Пройти заново" }));

  const results = Object.keys(last).map(id => ({ id, T: tests[id], a: last[id], p: pctOf(last[id], tests[id]), when: last[id].finished_at ? Date.parse(last[id].finished_at) : null }));
  results.filter(r => r.p < 60 && !weak.slice(0, 3).some(w => w.test === r.id)).sort((a, b) => a.p - b.p).slice(0, 2)
    .forEach(r => recs.push({ kind: "retake", title: `Пройти заново: ${r.T ? r.T.title : r.id}`, why: `Последний результат ${r.p}% — ниже порога 60%.`, href: link(r.id), action: "Пройти" }));

  // контроль сохранения знаний: хороший результат, но давно — через 30 и 90 дней
  results.filter(r => r.when && r.p >= 75).map(r => ({ r, days: Math.floor((now - r.when) / DAY) }))
    .filter(x => x.days >= 30).sort((a, b) => b.days - a.days).slice(0, 2)
    .forEach(x => recs.push({ kind: "check", title: `Проверить, что помните: ${x.r.T ? x.r.T.title : x.r.id}`, why: `Последний раз — ${x.days} дн. назад, результат был ${x.r.p}%. Контроль через ${x.days >= 90 ? "90" : "30"} дней показывает, что осталось в памяти.`, href: link(x.r.id, "exam"), action: "Пройти как экзамен" }));

  // что ещё не пройдено — в порядке курса
  const notTaken = [];
  (catalog || []).forEach(sec => sec.tests.forEach(t => { if (!last[t.id]) notTaken.push(Object.assign({ section: sec.section }, t)); }));
  notTaken.slice(0, 2).forEach(t => recs.push({ kind: "new", title: `Новый тест: ${t.title}`, why: `${t.section} · ${t.n} вопр. Ещё не пройден.`, href: t.format === "guess" ? `guess.html?t=${t.id}` : `quiz.html?t=${t.id}`, action: "Начать" }));

  const strong = tops.filter(t => t.n >= 2 && t.acc >= 90).sort((a, b) => b.n - a.n);
  return { recs, weak, strong, results, notTaken, taken: Object.keys(last).length };
}

async function loadTests(ids) {
  const out = {};
  await Promise.all([...new Set(ids)].map(id => fetch(`data/tests/${id}.json`).then(r => r.ok ? r.json() : null).then(j => { if (j) out[id] = j; }).catch(() => {})));
  return out;
}

window.AcadPlan = { build, latest, topics, localAttempt, loadTests };
})();
