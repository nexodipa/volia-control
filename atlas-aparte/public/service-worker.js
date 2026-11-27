// Permite instalar el Atlas y abrirlo sin conexión después de la primera visita.
// Páginas y datos: primero la red (para que una versión nueva se vea enseguida) y, sin red, la copia guardada.
// Archivos con huella en el nombre (js, css, fuentes, imágenes): primero la copia guardada.
const CACHE = "volia-atlas-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/app-icon-192.png", "/favicon.svg"]).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const hashed = url.pathname.startsWith("/assets/");
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (hashed) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req) ?? (req.mode === "navigate" ? await cache.match("/") : undefined);
      return hit ?? new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
    }
  })());
});
