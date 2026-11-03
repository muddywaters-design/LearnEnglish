/* sw.js — offline shell for "מילים | אנגלית בריטית" (v3.0)
   The page is fetched network-first: with reception the newest version on
   GitHub always wins, so an update can never get stuck behind an old copy.
   With no reception — or a signal too weak to answer within a few seconds —
   the last saved copy opens instead. */
const SHELL_VERSION = '3.0';
const CACHE = 'bev-shell-' + SHELL_VERSION;
const FONT_CACHE = 'bev-fonts-1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const NET_TIMEOUT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // one missing file (say, an icon not uploaded) must not stop the rest
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('bev-') && k !== CACHE && k !== FONT_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                  // calls to Claude are POST: never touched
  const url = new URL(req.url);
  if (req.mode === 'navigate') { event.respondWith(pageNetworkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, req)); return;
  }
  if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(CACHE, req));
});

function savedPage(req){
  return caches.match(req, {ignoreSearch: true})
    .then(r => r || caches.match('./index.html'))
    .then(r => r || caches.match('./'));
}

function pageNetworkFirst(req){
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    // a weak signal can hang for a minute; after a few seconds the saved copy opens
    const timer = setTimeout(() => savedPage(req).then(finish), NET_TIMEOUT_MS);
    // 'no-cache' = always ask GitHub. GitHub Pages tells browsers to keep a page
    // for 10 minutes, so a plain fetch could hand back the old copy right after
    // an upload; this way an unchanged page costs only a tiny "not modified".
    fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}).then(res => {
      // a navigation must not be answered with a redirected response
      if (res && res.redirected) res = new Response(res.body, {status: res.status, statusText: res.statusText, headers: res.headers});
      if (res && res.ok) {
        clearTimeout(timer);
        const a = res.clone(), b = res.clone(), c = res.clone();
        caches.open(CACHE)
          .then(cache => Promise.all([cache.put(req, a), cache.put('./', b), cache.put('./index.html', c)]))
          .catch(() => {});
        finish(res);
      } else {
        // GitHub answered with an error page: the saved copy is better than that
        savedPage(req).then(r => { clearTimeout(timer); finish(r || res); });
      }
    }).catch(() => {
      clearTimeout(timer);
      savedPage(req).then(r => finish(r || offlinePage()));
    });
  });
}

function staleWhileRevalidate(cacheName, req){
  return caches.open(cacheName).then(cache => cache.match(req).then(hit => {
    const fresh = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => hit || Response.error());
    return hit || fresh;
  }));
}

function offlinePage(){
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;direction:rtl;padding:28px;line-height:1.7">' +
    'אין קליטה, ועדיין אין עותק שמור של האפליקציה במכשיר.<br>פתח אותה פעם אחת עם קליטה, ומאז היא תיפתח גם בלי.</body>',
    {headers: {'Content-Type': 'text/html; charset=utf-8'}});
}
