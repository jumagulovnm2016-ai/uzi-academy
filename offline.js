// Офлайн-режим сайта тестов: регистрация service worker и уведомления об отложенной отправке.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var me = document.currentScript && document.currentScript.src;
  var swUrl = new URL('sw.js', me || location.href).href;
  var scope = new URL('./', swUrl).href;

  function toast(msg, ms) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;' +
      'max-width:min(92vw,460px);background:#1b2733;color:#fff;padding:12px 16px;border-radius:12px;' +
      'font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 6000);
  }

  function flush() {
    if (navigator.onLine && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('flush');
  }

  navigator.serviceWorker.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'queued') toast('Нет интернета. Результат сохранён на телефоне и будет отправлен преподавателю автоматически, когда появится связь.', 9000);
    if (d.type === 'flushed' && d.n) toast('Отправлено сохранённых результатов: ' + d.n);
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register(swUrl, { scope: scope }).then(function () {
      navigator.serviceWorker.ready.then(flush);
    }).catch(function () {});
    if (!navigator.onLine) toast('Офлайн-режим: тест работает без интернета.', 4000);
  });
  window.addEventListener('online', flush);
})();
