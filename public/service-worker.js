const CACHE = "volia-control-v4";
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/app-icon.svg",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/app-icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/spa.traineddata.gz",
];

async function precacheApplication() {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    } catch {
      // A single optional asset must not prevent the app from installing.
    }
  }));

  try {
    const shell = await fetch("/", { cache: "reload" });
    if (!shell.ok) return;
    const html = await shell.clone().text();
    await cache.put("/", shell);
    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => `${url.pathname}${url.search}`)
      .filter((url) => /\.(?:js|css|woff2?|svg|png|jpe?g|webp)(?:\?|$)/i.test(url));
    await Promise.all([...new Set(assetUrls)].map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch {
        // Runtime caching will retry unavailable assets while online.
      }
    }));
  } catch {
    // The previous cache remains available until activation finishes.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApplication().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/signin-with-chatgpt")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refresh = fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || refresh.catch(() => new Response("Sin conexión", { status: 503 }));
    }),
  );
});
