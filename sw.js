/* ==========================================================================
   Riviera: Life & Numbers — service worker

   Strategy (one, on purpose): cache-first from a versioned precache.
   Everything in CORE is stored at install time, so the whole application,
   including every calculator and the catalogue data, works offline after the
   first visit. Paths are relative, so it works at any base path, including a
   GitHub Pages project path such as /calcwise/.

   TO DEPLOY A CHANGE: edit VERSION below. The browser then installs a new
   worker, deletes the old cache and shows users a "Reload" notice.
   Add every new page, script, stylesheet, data file and image to CORE.
   ========================================================================== */

const VERSION = "riviera-v2";

const CORE = [
  "./",
  "index.html",
  "calculators.html",
  "money.html",
  "life.html",
  "science.html",
  "information.html",
  "css/style.css",
  "js/app.js",
  "js/calculator-engine.js",
  "js/calculators.js",
  "js/workspace.js",
  "js/pwa.js",
  "data/calculator-catalogue.json",
  "data/guides.json",
  "manifest.webmanifest",
  "images/riviera-logo.svg",
  "images/money-tools.svg",
  "images/life-tools.svg",
  "images/science-tools.svg",
  "images/information-guides.svg",
  "images/icon-192.png",
  "images/icon-512.png",
];

self.addEventListener("install", (event) => {
  // cache: "reload" bypasses the HTTP cache so a new version never precaches stale files.
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE.map((url) => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // ignoreSearch: calculators.html?tool=... is served from the one cached page.
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)));
});
