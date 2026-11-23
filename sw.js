/* UXPWA 홈 — 빌드 번호는 등록 URL 의 ?build= 값 */
importScripts("./sw.config.js");

const build = new URL(self.location.href).searchParams.get("build") || "1";
const CACHE_NAME = `${CACHE_PREFIX}-${build}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/pwa-update.js",
  "./deploy-version.js",
  "./version.json",
  "./manifest.webmanifest",
  "./pwa.config.json",
  "./sw.config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon-32.png",
  "./icons/bus-192.png",
  "./icons/sea-192.png",
  "./icons/bueongi-market.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const path = url.pathname.replace(/\/$/, "");
  if (/\/(?:version\.json|deploy-version\.js)$/.test(path)) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => caches.match(request))
    );
    return;
  }
  if (
    /\/(?:js\/[^/]+\.js|css\/styles\.css|index\.html)$/.test(path)
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "PURGE_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
    return;
  }

  if (data.type === "GET_VERSION") {
    event.source?.postMessage({ type: "VERSION", version: CACHE_NAME });
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match("./offline.html");
    if (offline) return offline;
    return new Response("오프라인 상태이고, 저장된 페이지가 없습니다.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}