/* Service worker.
 *
 * The app used to be one HTML file, so a cache-first worker only ever risked
 * serving a stale page. It is now index.html plus a stylesheet and four
 * scripts, and cache-first on those is worse than stale — it can pair last
 * week's core.js with this week's dashboard.js and break the app outright.
 * Worse, the lookup ignores the query string, so a ?v= cache-buster does not
 * get you out of it either.
 *
 * So: app code is stale-while-revalidate. The cached copy is served straight
 * away (launch stays instant and offline still works), a fresh copy is fetched
 * in the background, and the next launch runs it. Icons never change, so those
 * stay cache-first. CACHE_NAME is stamped by build.mjs, which means a real
 * deploy also drops the old cache outright and nobody waits a launch.
 */
const CACHE = "4qian-__BUILD__";
const SHELL = "./index.html";
const CODE  = ["./index.html", "./styles.css", "./questions.js", "./vocab.js",
               "./answers.js", "./track.js", "./core.js", "./dashboard.js", "./insights.js", "./folder.js", "./drive.js",
               "./boot.js", "./write.js", "./native.js"];
/* The stroke data is megabytes and only the Write tab needs it, so it is not
   precached on install — it joins the cache the first time it is asked
   for, and is stale-while-revalidate from then on like the rest. */
const LAZY = ["./strokes.js", "./strokes-tw.js", "./defs.js"];
const ASSETS = CODE.concat(["./manifest.webmanifest", "./icon-192.png",
                            "./icon-512.png", "./icon-maskable.png"]);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Is this one of our own code files? Compared by pathname so a ?v= or a
   #hash does not change the answer. */
function isCode(url){
  if(url.origin !== self.location.origin) return false;
  const base = url.pathname.split("/").pop() || "index.html";
  return CODE.concat(LAZY).some(c => c.slice(2) === base) || base === "";
}

function put(req, res){
  if(res && res.ok){
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
  }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  let url;
  try{ url = new URL(req.url); }catch(_){ return; }

  // Navigations: network first, so a reload always gets the current page.
  if(req.mode === "navigate" || req.destination === "document"){
    e.respondWith(fetch(req).then(res => put(req, res)).catch(() =>
      caches.match(req, {ignoreSearch:true}).then(hit => hit || caches.match(SHELL))));
    return;
  }

  // Our own code: serve the cached copy now, refresh it for next time.
  if(isCode(url)){
    e.respondWith(caches.match(req, {ignoreSearch:true}).then(hit => {
      const net = fetch(req).then(res => put(req, res)).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Icons and fonts: cache first, they are immutable.
  e.respondWith(
    caches.match(req, {ignoreSearch:true}).then(hit => hit || fetch(req).then(res => {
      if(res && res.ok && (req.url.startsWith(self.registration.scope) ||
                           req.url.includes("fonts.g"))) put(req, res);
      return res;
    }).catch(() => hit))
  );
});
