/* Лапки: офлайн-режим. Страница берётся из сети, а без сети или при медленном GitHub — из сохранённой копии.
   Шрифты и библиотека Firebase сохраняются при первом открытии, чтобы календарь запускался и без интернета. */
var VERSION = 'lapki-v1';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
var NET_TIMEOUT = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { /* файла может не быть */ }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('lapki-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

function fromCache(req) {
  return caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (r) { return r || (req.mode === 'navigate' ? c.match('./index.html') : undefined); });
  });
}

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      fromCache(req).then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, NET_TIMEOUT);
    var net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
    net.then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req.mode === 'navigate' ? './index.html' : req, copy); });
      }
      clearTimeout(timer);
      if (!done) { done = true; resolve(res && res.redirected ? res.blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); }) : res); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache(req).then(function (r) {
        if (done) return;
        done = true;
        resolve(r || new Response('Нет сети', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      });
    });
  });
}

function cacheFirst(req) {
  return caches.open(VERSION).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) e.respondWith(networkFirst(req));
    else if (/\.(png|svg|webmanifest|js|css|json)$/.test(url.pathname)) e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com' || (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0)) {
    e.respondWith(cacheFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(staleWhileRevalidate(req));
  }
});
