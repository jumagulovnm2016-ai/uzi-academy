// Интервальное повторение (FSRS) для Академии УЗИ.
// Алгоритм — библиотека ts-fsrs (engine/vendor), не самописная формула.
// В повторение попадают вопросы, на которые курсант ответил неверно (в тесте, экзамене или игре).
// Дальше каждый ответ двигает вопрос по расписанию: ошибка — вопрос вернётся скоро,
// верный ответ — интервал растёт (день, несколько дней, неделя, месяц, несколько месяцев).
// Хранится только на этом устройстве: localStorage "acad-srs" = { id вопроса: карточка FSRS }.
(function () {
"use strict";
const F = window.FSRS;
const KEY = "acad-srs";
const scheduler = F ? F.fsrs(F.generatorParameters({ enable_fuzz: true })) : null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function saveAll(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {} }
const card = raw => F.TypeConvert.card(raw);
const testOf = qid => qid.replace(/-\d+$/, "");
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }

// Отметить ответ. ok=false заводит вопрос в повторение; ok=true двигает только уже заведённые.
function rate(qid, ok, when) {
  if (!scheduler || !qid) return;
  const all = load(), now = when || new Date();
  let c = all[qid] ? card(all[qid]) : null;
  if (!c && ok) return;
  if (!c) c = F.createEmptyCard(now);
  all[qid] = scheduler.next(c, now, ok ? F.Rating.Good : F.Rating.Again).card;
  saveAll(all);
}

// Вопросы к повторению до конца сегодняшнего дня, сначала самые «просроченные»
function due(limit) {
  const all = load(), until = endOfToday();
  return Object.keys(all).map(id => ({ id, test: testOf(id), due: new Date(all[id].due) }))
    .filter(x => x.due <= until).sort((a, b) => a.due - b.due).slice(0, limit || Infinity);
}

function stats() {
  const all = load(), ids = Object.keys(all), until = endOfToday();
  let dueToday = 0, next = null, learned = 0;
  for (const id of ids) {
    const c = all[id], d = new Date(c.due);
    if (d <= until) dueToday++; else if (!next || d < next) next = d;
    if (c.state === F.State.Review && c.scheduled_days >= 21) learned++;   // устойчиво запомнено: интервал 3+ недели
  }
  return { total: ids.length, dueToday, next, learned };
}

function fmtDate(d) {
  if (!d) return "";
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5);
  if (days === 1) return "завтра";
  if (days === 2) return "послезавтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

window.AcadSRS = { ok: !!scheduler, rate, due, stats, fmtDate, testOf };
})();
