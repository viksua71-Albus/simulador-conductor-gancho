// Service worker del Simulador Conductor: guarda la app para abrirla sin conexión.
// Estrategia: la página (index.html) se pide primero a la red (así cada versión nueva llega sola al estar en línea)
// y, si no hay red, se usa la copia guardada. Iconos, manifest y Leaflet: copia guardada + actualización en segundo plano.
// Mapas, rutas y lugares (teselas, OSRM, Photon, Overpass, Nominatim) NO se interceptan: solo la caché normal del navegador.
const VER = "29.0";
const CACHE = "simconductor-" + VER;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-192.png", "./icons/maskable-512.png"];
const CDN_PREFIX = "https://unpkg.com/leaflet@1.9.4/dist/";
const CDN = [CDN_PREFIX + "leaflet.css", CDN_PREFIX + "leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    for (const u of CDN) { try { const r = await fetch(new Request(u, { mode: "cors" })); if (r.ok) await c.put(u, r); } catch (err) {} }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("simconductor-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req, { cache: "no-cache" });
    if (r && r.ok) { c.put(req.mode === "navigate" ? "./index.html" : req, r.clone()); }
    return r;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match("./index.html")) || Response.error();
  }
}
async function staleWhileRevalidate(req, e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    const p = u.pathname;
    if (req.mode === "navigate" || p.endsWith("/") || p.endsWith("/index.html")) { e.respondWith(networkFirst(req)); return; }
    if (p.endsWith("/manifest.webmanifest") || p.includes("/icons/")) { e.respondWith(staleWhileRevalidate(req, e)); return; }
    return; // sw.js y lo demás: red normal
  }
  if (req.url.startsWith(CDN_PREFIX)) { e.respondWith(staleWhileRevalidate(req, e)); return; }
  // Resto (teselas, rutas, lugares…): sin interceptar
});
