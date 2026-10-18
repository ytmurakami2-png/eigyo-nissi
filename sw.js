/* 電波が弱い所でも開けるように、アプリの部品を端末に置いておく。データは毎回サーバーから */
const CACHE = "eigyo-v2";
const SHELL = ["./", "index.html", "app.css", "app.js", "data.js", "config.js", "manifest.webmanifest",
  "vendor/supabase.js", "vendor/html2pdf.bundle.min.js", "vendor/xlsx.full.min.js", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting() });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// 自分の部品は新しい物を先に取りにいき、取れない時だけ端末の控えを使う
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
