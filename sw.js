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
  "/assets/js/portal.js",
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
    Promise.all(keys.filter((k) => k !== STATIK && k !== DATEN).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.typ === "SKIP_WAITING") self.skipWaiting();
});

// ------------------------------ Offline-Daten (Teil B) ---------------------
// Portal-Paket & Co.: Netz zuerst, bei Netzfehler der zuletzt gespeicherte Stand
// (mit Kopfzeile X-Offline-Stand = Speicherzeit). Fotos: einmal laden, dann vom Gerät.
// Der Daten-Cache hängt NICHT an der App-Version und wird bei An-/Abmeldung geleert
// (gemeinsam genutzte Geräte: nie den Stand einer anderen Person zeigen).
const DATEN = "skv-daten-v1";
const DATEN_PFADE = ["/api/me", "/api/portal", "/api/portal/wetter", "/api/portal/quiz",
  "/api/dokumente", "/api/passkey/liste", "/api/portal/helfer"];
const AUTH_PFADE = /^\/api\/(login|logout|register|passkey\/login\/finish|reset)/;

function mitKopf(antwort, kopf) {
  const h = new Headers(antwort.headers);
  Object.keys(kopf).forEach((k) => h.set(k, kopf[k]));
  return antwort.blob().then((b) => new Response(b, { status: antwort.status, statusText: antwort.statusText, headers: h }));
}

async function datenNetzZuerst(req) {
  const c = await caches.open(DATEN);
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const kopie = await mitKopf(r.clone(), { "X-Gespeichert": new Date().toISOString() });
      c.put(new Request(req.url.split("?")[0]), kopie).catch(() => {});
    } else if (r && r.status === 401) {
      // Sitzung weg → gespeicherten Stand dieser Route verwerfen
      c.delete(new Request(req.url.split("?")[0])).catch(() => {});
    }
    return r;
  } catch (err) {
    const alt = await c.match(new Request(req.url.split("?")[0]));
    if (!alt) throw err;
    return mitKopf(alt, { "X-Offline-Stand": alt.headers.get("X-Gespeichert") || "" });
  }
}

async function bildCacheZuerst(req) {
  const c = await caches.open(DATEN);
  const alt = await c.match(req);
  if (alt) return alt;
  const r = await fetch(req);
  if (r && r.ok) c.put(req, r.clone()).catch(() => {});
  return r;
}

// ------------------------------ Offline-Warteschlange (Teil B3) ----------
// Gleiche IndexedDB wie das Portal (skv-offline/warteschlange). Background Sync
// (Android/Chrome) sendet wartende Änderungen auch bei geschlossener App.
const WS_DB = "skv-offline", WS_STORE = "warteschlange";
function wsDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(WS_DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(WS_STORE)) r.result.createObjectStore(WS_STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function wsAlle() {
  const db = await wsDB();
  return new Promise((res, rej) => { const q = db.transaction(WS_STORE).objectStore(WS_STORE).getAll(); q.onsuccess = () => res((q.result || []).sort((a, b) => a.at - b.at)); q.onerror = () => rej(q.error); });
}
async function wsAendern(fn) {
  const db = await wsDB();
  return new Promise((res, rej) => { const t = db.transaction(WS_STORE, "readwrite"); fn(t.objectStore(WS_STORE)); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
}
async function wsLeeren() { try { await wsAendern((st) => st.clear()); } catch (err) { /* leer */ } }
async function warteschlangeSenden() {
  let liste = [];
  try { liste = await wsAlle(); } catch (err) { return; }
  let getan = false;
  for (const e of liste) {
    if (e.fehler) continue;
    let r;
    try {
      r = await fetch(e.pfad, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": e.csrf || "" }, body: JSON.stringify(e.body) });
    } catch (err) { throw err; }                       // kein Netz → Sync versucht es später erneut
    if (r.status === 401) break;                       // Sitzung weg: behalten
    if (r.ok) { await wsAendern((st) => st.delete(e.id)); getan = true; continue; }
    let txt = ""; try { txt = (await r.json()).error || ""; } catch (err) { /* leer */ }
    e.fehler = txt || "abgelehnt";                     // Portal zeigt den Hinweis beim nächsten Öffnen
    await wsAendern((st) => st.put(e)); getan = true;
  }
  if (getan) {
    const cs = await clients.matchAll({ type: "window" });
    cs.forEach((c) => c.postMessage({ typ: "WARTESCHLANGE_FERTIG" }));
  }
}
self.addEventListener("sync", (e) => {
  if (e.tag === "skv-warteschlange") e.waitUntil(warteschlangeSenden());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const pfad = url.pathname;
  if (e.request.method !== "GET") {
    // An-/Abmeldung: Daten-Cache UND Warteschlange leeren, damit nie der Stand oder
    // wartende Änderungen einer anderen Person weiterverwendet werden
    if (AUTH_PFADE.test(pfad)) {
      e.respondWith(fetch(e.request).then(async (r) => {
        try { await caches.delete(DATEN); } catch (err) { /* leer */ }
        await wsLeeren();
        return r;
      }));
    }
    return;
  }
  if (/^\/api\/portal\/(foto|bild)\//.test(pfad)) { e.respondWith(bildCacheZuerst(e.request)); return; }
  if (DATEN_PFADE.includes(pfad)) { e.respondWith(datenNetzZuerst(e.request)); return; }
  // Übrige API und der Service Worker selbst laufen immer übers Netz –
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
