// Service Worker der SKV-Müritz-App (Phase 2): Offline-Shell + Update-Fluss.
// __VERSION__ ersetzt der Server beim Ausliefern durch einen Build-Hash,
// dadurch erneuert jedes Deployment die Caches automatisch.
const VERSION = "__VERSION__";
const STATIK = "skv-statik-" + VERSION;
const SHELL = [
  "/",
  "/assets/css/styles.css",
  "/assets/js/store.js",
  "/assets/js/utils.js",
  "/assets/js/io.js",
  "/assets/js/views.js",
  "/assets/js/app.js",
  "/assets/js/sync.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIK).then((c) => c.addAll(SHELL)).catch(() => {}));
  // KEIN skipWaiting: Der Nutzer entscheidet über den Update-Hinweis in der App.
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== STATIK).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.typ === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const pfad = url.pathname;
  // API und der Service Worker selbst laufen immer übers Netz –
  // Anmeldung, Datenstand und Versionsprüfung dürfen nie aus dem Cache kommen.
  if (pfad.startsWith("/api/") || pfad === "/sw.js" || pfad === "/gesund") return;

  if (e.request.mode === "navigate") {
    // App-Seite: Netz zuerst (frische Version), sonst Cache-Fallback.
    e.respondWith(fetch(e.request).then((r) => {
      if (r && r.ok && !r.redirected) {
        const kopie = r.clone();
        caches.open(STATIK).then((c) => c.put("/", kopie)).catch(() => {});
      }
      return r;
    }).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }

  // Statik: Cache zuerst, im Hintergrund auffrischen (stale-while-revalidate).
  e.respondWith(caches.open(STATIK).then(async (c) => {
    const alt = await c.match(e.request);
    const neu = fetch(e.request).then((r) => {
      if (r && r.ok) c.put(e.request, r.clone());
      return r;
    }).catch(() => null);
    return alt || neu.then((r) => r || Response.error());
  }));
});

// ------------------------------ Push (Phase 4) ---------------------------
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { /* leer */ }
  e.waitUntil(self.registration.showNotification(data.titel || "SKV Müritz Volleyball", {
    body: data.text || "",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    lang: "de",
    dir: "auto",
    data: data.url || "/",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = e.notification.data || "/";
  e.waitUntil((async () => {
    const liste = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const offen = liste.find((c) => new URL(c.url).origin === location.origin);
    if (offen) {
      try { await offen.focus(); } catch (err) { /* leer */ }
      try { if ("navigate" in offen) await offen.navigate(ziel); } catch (err) { /* leer */ }
      return;
    }
    await clients.openWindow(ziel);
  })());
});

// Abgelaufene Push-Abos automatisch erneuern (Browser rotieren Endpunkte gelegentlich)
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    try {
      const alt = e.oldSubscription;
      const key = alt && alt.options ? alt.options.applicationServerKey : null;
      if (!key) return;
      const neu = await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key,
      });
      await fetch("/api/push/abo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(neu),
      });
    } catch (err) { /* leer */ }
  })());
});
