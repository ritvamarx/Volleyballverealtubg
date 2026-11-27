/* ==========================================================================
   SKV Müritz – Server-Modus: Login-Gate + Datenabgleich (Phase 1)

   Wird die App über http(s) von unserem Flask-Backend ausgeliefert, schaltet
   sich dieser Modus ein: Anmeldung (Trainer mit TOTP-2FA), zentraler
   Datenbestand mit Versionsprüfung, Offline-Puffer im localStorage.
   Bei file:// oder ohne erreichbare API (z. B. Artifact-Hosting) bleibt die
   App im lokalen Modus – unverändert wie bisher.
   ========================================================================== */
(function () {
  "use strict";
  if (!/^https?:$/.test(location.protocol)) return; // Datei-Modus: nichts tun

  const $ = (sel, root) => (root || document).querySelector(sel);
  const gate = $("#authGate");
  if (!gate) return;

  const Sync = {
    active: false,
    csrf: "",
    version: 0,
    user: null,
    pending: false,
    saving: false,
  };
  window.Sync = Sync;

  // Gate sofort zeigen (verhindert Aufblitzen lokaler Daten), API prüfen
  gate.hidden = false;
  show("checking");

  function show(step) {
    ["checking", "login", "totp", "setup", "backupcodes", "register", "portal", "reset"].forEach((s) => {
      const el = $("#auth-" + s);
      if (el) el.hidden = s !== step;
    });
  }
  function authMsg(text, isError) {
    const el = $("#authMsg");
    el.textContent = text || "";
    el.className = "auth-msg" + (isError ? " bad" : "");
  }

  async function api(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    opts.headers["Content-Type"] = "application/json";
    if (Sync.csrf) opts.headers["X-CSRF-Token"] = Sync.csrf;
    opts.credentials = "same-origin";
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* leer */ }
    // X-Offline-Stand setzt der Service Worker, wenn er den gespeicherten Stand liefert
    return { status: res.status, ok: res.ok, data: data || {}, offlineStand: res.headers.get("X-Offline-Stand") || null };
  }

  // Merker über Neuladen hinweg: letzte bekannte Server-Version und ob lokale Änderungen
  // noch nicht gesendet wurden (Teil B4 – Trainer offline). Ohne diesen Merker würde ein
  // Neuladen den Serverstand über ungesendete Offline-Änderungen schreiben.
  const META_KEY = "skv_sync_meta";
  function metaLesen() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function metaSchreiben(obj) {
    try { localStorage.setItem(META_KEY, JSON.stringify(Object.assign(metaLesen(), obj))); } catch (e) { /* leer */ }
  }
  function uhrzeit(iso) {
    const z = iso ? new Date(iso) : new Date();
    return isNaN(z) ? "" : String(z.getHours()).padStart(2, "0") + ":" + String(z.getMinutes()).padStart(2, "0");
  }

  // ---------- Boot ----------
  async function boot() {
    let me;
    try {
      me = await api("/api/me");
    } catch (e) {
      return localMode(); // Netzwerkfehler → lokaler Modus
    }
    if (me.status === 404 || (me.status !== 200 && me.status !== 401)) {
      return localMode(); // kein SKV-Backend hinter dieser URL
    }
    if (me.status === 401) {
      const err = (me.data && me.data.error) || "";
      if (/Zwei-Faktor/i.test(err)) { show("totp"); return; }
      if (!prefillInviteCode() && !prefillResetCode()) show("login");
      return;
    }
    if (!me.data || !me.data.user || !me.data.csrf) {
      return localMode(); // 200, aber kein SKV-Backend (z. B. statisches Hosting)
    }
    Sync.csrf = me.data.csrf;
    Sync.user = me.data.user;
    if (me.data.pre2fa) { show("totp"); return; }
    await enterApp();
  }

  function localMode() {
    gate.hidden = true;
    Sync.active = false;
  }

  function prefillInviteCode() {
    const code = new URLSearchParams(location.search).get("code");
    if (!code) return false;
    const inp = $("#regCode");
    if (inp) inp.value = code;
    show("register");
    return true;
  }

  // Link aus der „Passwort vergessen“-Mail: /?reset=CODE → direkt neues Passwort setzen
  function prefillResetCode() {
    const code = new URLSearchParams(location.search).get("reset");
    if (!code) return false;
    $("#resetCode").value = code.trim().toUpperCase();
    $("#resetAnfrage").hidden = true;
    $("#resetLinkHinweis").hidden = false;
    show("reset");
    setTimeout(() => $("#resetPass").focus(), 50);
    // Code aus der Adresszeile nehmen (Verlauf/Teilen), Seite bleibt
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* leer */ }
    return true;
  }

  // ---------- Passkeys: Face ID / Touch ID / Fingerabdruck ----------
  // Base64url ↔ Bytes, weil ältere Safari/Chrome die *FromJSON-Helfer nicht haben
  const b64uZuBytes = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const bytesZuB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const Passkey = {
    FLAG: "skv_passkey_geraet",           // "1" = auf diesem Gerät eingerichtet
    NEIN: "skv_passkey_spaeter",          // Zeitstempel: Hinweis bis dahin nicht zeigen
    moeglich: () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext),
    async plattform() {
      if (!Passkey.moeglich()) return false;
      try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
      catch (e) { return false; }
    },
    hier: () => { try { return localStorage.getItem(Passkey.FLAG) === "1"; } catch (e) { return false; } },
    spaeter: () => { try { return Date.now() < parseInt(localStorage.getItem(Passkey.NEIN) || "0", 10); } catch (e) { return false; } },
    spaeterSetzen: () => { try { localStorage.setItem(Passkey.NEIN, String(Date.now() + 30 * 86400000)); } catch (e) { /* leer */ } },
    wort: () => (/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? "Face ID / Touch ID" : "Fingerabdruck / Gesicht"),
    // Soll die Karte „Schneller anmelden" gezeigt werden? (Gerät kann es, hier noch keiner, kein „Später")
    async angebot() {
      if (!Passkey.moeglich() || Passkey.hier() || Passkey.spaeter()) return false;
      return Passkey.plattform();
    },
    merken: (ja) => { try { if (ja) localStorage.setItem(Passkey.FLAG, "1"); else localStorage.removeItem(Passkey.FLAG); } catch (e) { /* leer */ } },
    geraetName() {
      const ua = navigator.userAgent;
      const g = /iPhone/.test(ua) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
              : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Gerät";
      const b = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Edg/.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
      return b ? `${g} · ${b}` : g;
    },
    // Einrichten – nur angemeldet (Portal). Rückgabe {ok, error}
    async einrichten() {
      const start = await api("/api/passkey/register/start", { method: "POST", body: "{}" });
      if (!start.ok) return { ok: false, error: start.data.error || "Einrichtung nicht möglich" };
      const o = start.data;
      o.challenge = b64uZuBytes(o.challenge);
      o.user.id = b64uZuBytes(o.user.id);
      o.excludeCredentials = (o.excludeCredentials || []).map((c) => Object.assign({}, c, { id: b64uZuBytes(c.id) }));
      let cred;
      try {
        cred = await navigator.credentials.create({ publicKey: o });
      } catch (e) {
        if (e && e.name === "InvalidStateError") { Passkey.merken(true); return { ok: true, schon: true }; }
        return { ok: false, error: e && e.name === "NotAllowedError" ? "Abgebrochen" : "Gerät hat die Einrichtung abgelehnt" };
      }
      const r = cred.response;
      const nutzlast = {
        id: cred.id, rawId: bytesZuB64u(cred.rawId), type: cred.type,
        authenticatorAttachment: cred.authenticatorAttachment || null,
        clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
        response: {
          clientDataJSON: bytesZuB64u(r.clientDataJSON),
          attestationObject: bytesZuB64u(r.attestationObject),
          transports: r.getTransports ? r.getTransports() : [],
        },
      };
      const fin = await api("/api/passkey/register/finish", {
        method: "POST", body: JSON.stringify({ credential: nutzlast, geraet: Passkey.geraetName() }),
      });
      if (!fin.ok) return { ok: false, error: fin.data.error || "Passkey konnte nicht gespeichert werden" };
      Passkey.merken(true);
      return { ok: true, passkeys: fin.data.passkeys || [] };
    },
    // Passkey-Nachweis vom Gerät holen (für Anmeldung oder Bestätigung). Rückgabe {ok, credential} | {ok:false, error}
    async credential() {
      const start = await api("/api/passkey/login/start", { method: "POST", body: "{}" });
      if (!start.ok) return { ok: false, error: start.data.error || "Passkey nicht möglich" };
      const o = start.data;
      o.challenge = b64uZuBytes(o.challenge);
      o.allowCredentials = (o.allowCredentials || []).map((c) => Object.assign({}, c, { id: b64uZuBytes(c.id) }));
      let cred;
      try {
        cred = await navigator.credentials.get({ publicKey: o });
      } catch (e) {
        return { ok: false, abbruch: true, error: e && e.name === "NotAllowedError" ? "" : "Face ID / Fingerabdruck nicht verfügbar" };
      }
      const r = cred.response;
      return { ok: true, credential: {
        id: cred.id, rawId: bytesZuB64u(cred.rawId), type: cred.type,
        authenticatorAttachment: cred.authenticatorAttachment || null,
        clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
        response: {
          clientDataJSON: bytesZuB64u(r.clientDataJSON),
          authenticatorData: bytesZuB64u(r.authenticatorData),
          signature: bytesZuB64u(r.signature),
          userHandle: r.userHandle ? bytesZuB64u(r.userHandle) : null,
        },
      } };
    },
    // Anmelden – öffentlich. Rückgabe {ok, user, error}
    async anmelden() {
      const c = await Passkey.credential();
      if (!c.ok) return c;
      const nutzlast = c.credential;
      const fin = await api("/api/passkey/login/finish", { method: "POST", body: JSON.stringify({ credential: nutzlast }) });
      if (!fin.ok) {
        if (fin.status === 401) Passkey.merken(false); // Passkey serverseitig weg → Knopf nicht mehr hervorheben
        return { ok: false, error: fin.data.error || "Anmeldung fehlgeschlagen" };
      }
      Passkey.merken(true);
      return { ok: true, user: fin.data.user };
    },
  };
  window.Passkey = Passkey;

  const pkBtn = $("#passkeyLogin");
  if (pkBtn && Passkey.moeglich()) {
    pkBtn.hidden = false;
    // Auf einem Gerät mit eingerichtetem Passkey steht der Knopf oben – ein Tipp genügt
    if (Passkey.hier()) { pkBtn.classList.remove("outline"); $("#auth-login").prepend(pkBtn); }
    pkBtn.addEventListener("click", async () => {
      authMsg("Face ID / Fingerabdruck …");
      pkBtn.disabled = true;
      const r = await Passkey.anmelden();
      pkBtn.disabled = false;
      if (!r.ok) { authMsg(r.error || "", !!r.error); return; }
      authMsg("");
      Sync.user = r.user;
      await afterFullLogin();
    });
  }

  // ---------- Anmeldung ----------
  $("#auth-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Anmeldung läuft …");
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#loginUser").value.trim(),
        password: $("#loginPass").value,
      }),
    });
    if (!res.ok) { authMsg(res.data.error || "Anmeldung fehlgeschlagen", true); return; }
    authMsg("");
    Sync.user = res.data.user;
    if (res.data.need === "totp") { show("totp"); $("#totpCode").focus(); }
    else if (res.data.need === "totp-setup") { await startTotpSetup(); }
    else { await afterFullLogin(); }
  });

  $("#auth-totp").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Prüfe Code …");
    const res = await api("/api/login/totp", {
      method: "POST",
      body: JSON.stringify({ code: $("#totpCode").value }),
    });
    if (!res.ok) { authMsg(res.data.error || "Code falsch", true); return; }
    authMsg("");
    Sync.user = res.data.user;
    await afterFullLogin();
  });

  async function startTotpSetup() {
    const res = await api("/api/2fa/setup");
    if (!res.ok) { authMsg(res.data.error || "2FA-Einrichtung nicht möglich", true); show("login"); return; }
    $("#setupSecret").textContent = res.data.secret.replace(/(.{4})/g, "$1 ").trim();
    $("#setupLink").href = res.data.otpauth;
    show("setup");
    $("#setupCode").focus();
  }

  $("#auth-setup").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Prüfe Code …");
    const res = await api("/api/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code: $("#setupCode").value }),
    });
    if (!res.ok) { authMsg(res.data.error || "Code falsch", true); return; }
    authMsg("");
    Sync.user = res.data.user;
    $("#backupCodesBox").textContent = (res.data.backupCodes || []).join("\n");
    show("backupcodes");
  });

  $("#backupDone").addEventListener("click", async () => { await afterFullLogin(); });

  async function afterFullLogin() {
    const me = await api("/api/me");
    if (me.ok) { Sync.csrf = me.data.csrf; Sync.user = me.data.user; }
    await enterApp();
  }

  // ---------- Registrierung mit Einladungscode ----------
  $("#gotoRegister").addEventListener("click", (e) => { e.preventDefault(); show("register"); });
  $("#gotoLogin").addEventListener("click", (e) => { e.preventDefault(); show("login"); });

  // ---------- Passwort vergessen ----------
  $("#gotoReset").addEventListener("click", (e) => { e.preventDefault(); authMsg(""); show("reset"); });
  $("#gotoLogin2").addEventListener("click", (e) => { e.preventDefault(); authMsg(""); show("login"); });
  $("#auth-reset").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const username = $("#resetUser").value.trim();
    if (!username) { authMsg("Bitte E-Mail-Adresse oder Benutzernamen angeben", true); return; }
    authMsg("Anfrage wird gesendet …");
    const res = await api("/api/passwort-vergessen", {
      method: "POST", body: JSON.stringify({ username }),
    });
    authMsg(res.ok ? "✅ " + (res.data.hint || "Anfrage gesendet.")
                   : (res.data.error || "Anfrage nicht möglich"), !res.ok);
    if (res.ok) { $("#resetAnfrage").hidden = false; $("#resetLinkHinweis").hidden = true; }
  });
  $("#resetSetzen").addEventListener("click", async () => {
    const code = $("#resetCode").value.trim();
    const password = $("#resetPass").value;
    if (!code || password.length < 8) {
      authMsg("Bitte Code und neues Passwort (mind. 8 Zeichen) angeben", true); return;
    }
    authMsg("Passwort wird gesetzt …");
    const res = await api("/api/passwort-reset", {
      method: "POST", body: JSON.stringify({ code, password }),
    });
    if (!res.ok) { authMsg(res.data.error || "Code ungültig oder abgelaufen", true); return; }
    show("login");
    $("#loginUser").value = res.data.email || res.data.username || "";
    $("#loginPass").value = "";
    $("#resetAnfrage").hidden = false; $("#resetLinkHinweis").hidden = true;
    authMsg("✅ Passwort geändert – bitte neu anmelden.");
    setTimeout(() => $("#loginPass").focus(), 50);
  });
  $("#auth-register").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Registrierung läuft …");
    const res = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        code: $("#regCode").value,
        name: $("#regName").value.trim(),
        email: $("#regEmail").value.trim(),
        username: $("#regUser").value.trim(),
        password: $("#regPass").value,
      }),
    });
    if (!res.ok) { authMsg(res.data.error || "Registrierung fehlgeschlagen", true); return; }
    show("login");
    $("#loginUser").value = $("#regEmail").value.trim() || $("#regUser").value.trim();
    authMsg("Konto angelegt – bitte anmelden. " + (res.data.hint || ""));
  });

  // ---------- App betreten (Trainer: Vollzugriff + Sync) ----------
  async function enterApp() {
    if (Sync.user && Sync.user.role !== "trainer") {
      // Spieler-/Eltern-Portal (Phase 3)
      if (window.Portal && Portal.start) { Portal.start(); return; }
      $("#portalName").textContent = Sync.user.name || Sync.user.username;
      show("portal");
      return;
    }
    let res = null;
    try { res = await api("/api/state"); } catch (e) { res = null; }   // kein Netz, kein gespeicherter Stand
    const meta = metaLesen();
    const local = Store.get();
    const hasLocal = (local.players || []).length || (local.events || []).length;
    Sync.offlineStand = null;
    if (!res) {
      if (!hasLocal) { authMsg("Offline – und auf diesem Gerät ist noch kein Stand gespeichert. Bitte mit Netz anmelden.", true); show("login"); return; }
      // Offline mit lokalem Stand: weiterarbeiten, Änderungen werden nachgetragen
      Sync.version = meta.version || 0;
      Sync.pending = !!meta.pending;
      Sync.offlineStand = "gerät";
    } else if (!res.ok) {
      authMsg(res.data.error || "Daten konnten nicht geladen werden", true); show("login"); return;
    } else if (meta.pending && hasLocal) {
      // Lokale Änderungen warten noch auf den Server → NICHT überschreiben, gleich senden
      Sync.version = meta.version || 0;
      Sync.pending = true;
      Sync.offlineStand = res.offlineStand;
    } else {
      Sync.version = res.data.version || 0;
      Sync.offlineStand = res.offlineStand;
      if (res.data.state) {
        Store.replaceAll(res.data.state);
        metaSchreiben({ version: Sync.version, pending: false });
      } else if (hasLocal && confirm("Der Server ist noch leer. Lokale Daten dieses Browsers jetzt zum Server übertragen?")) {
        await pushNow(true);   // Frischer Server: vorhandene lokale Daten anbieten
      } else if (!hasLocal) {
        await pushNow(true);   // leere Struktur als Version 1 anlegen
      }
    }
    Sync.active = true;
    gate.hidden = true;
    installSyncHooks();
    App.reload();
    if (Sync.offlineStand) {
      updateStatus("📴 Offline – Stand vom Gerät" + (Sync.offlineStand !== "gerät" ? " (" + uhrzeit(Sync.offlineStand) + ")" : "")
        + (Sync.pending ? " · Änderungen werden nachgetragen" : ""));
    } else {
      updateStatus(Sync.pending ? "☁️ Sende Offline-Änderungen …" : "☁️ Verbunden als " + (Sync.user.name || Sync.user.username));
    }
    if (Sync.pending && navigator.onLine !== false) setTimeout(() => pushNow(false), 500);
  }

  // ---------- Laufender Abgleich ----------
  let debounceTimer = 0;
  function installSyncHooks() {
    Store.setOnSave(() => {
      metaSchreiben({ version: Sync.version, pending: true });   // bis der Server bestätigt hat
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { pushNow(false); }, 1200);
    });
    setInterval(() => { if (Sync.pending && navigator.onLine !== false) pushNow(false); }, 20000);
    window.addEventListener("online", () => {
      Sync.offlineStand = null;
      if (Sync.pending) pushNow(false); else updateStatus("☁️ Wieder online");
    });
    window.addEventListener("offline", () => updateStatus("📴 Offline – Änderungen werden nachgetragen"));

    // Abmelden-Knopf + Status in der Seitenleiste
    const foot = document.querySelector(".sidebar-foot");
    if (foot && !$("#logoutBtn")) {
      const bell = document.createElement("button");
      bell.id = "pushBtn";
      bell.className = "btn-ghost";
      bell.textContent = "🔔 Mitteilungen";
      bell.title = "Push-Mitteilungen für das Trainerteam (z. B. Passwort-Anfragen) an-/abschalten";
      bell.onclick = trainerPushToggle;
      foot.appendChild(bell);
      if (Passkey.moeglich()) {
        const pk = document.createElement("button");
        pk.id = "passkeyBtn";
        pk.className = "btn-ghost";
        pk.textContent = "🔐 Passkey";
        pk.title = "Anmeldung mit Face ID / Touch ID / Fingerabdruck einrichten oder verwalten";
        pk.onclick = passkeyEinstellungen;
        foot.appendChild(pk);
      }
      const btn = document.createElement("button");
      btn.id = "logoutBtn";
      btn.className = "btn-ghost";
      btn.textContent = "🚪 Abmelden";
      btn.onclick = async () => { await api("/api/logout", { method: "POST" }); location.reload(); };
      foot.appendChild(btn);
      const st = document.createElement("div");
      st.id = "syncStatus";
      st.className = "sync-status";
      foot.parentElement.insertBefore(st, foot);
      pushKnopfAktualisieren();
      pushAuffrischen();
    }
  }

  // ---------- Push-Mitteilungen für das Trainerteam ----------
  function pushMoeglich() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function istIosOhneApp() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installiert = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    return ios && !installiert;
  }
  function b64ZuBytes(b64) {
    const roh = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(roh, (z) => z.charCodeAt(0));
  }
  async function aktuellesPushAbo() {
    if (!pushMoeglich()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  // Passkeys des Trainerkontos verwalten (Seitenleiste 🔐)
  async function passkeyEinstellungen() {
    const r = await api("/api/passkey/liste");
    if (!r.ok) { U.toast("Passkeys konnten nicht geladen werden", "bad"); return; }
    const liste = r.data.passkeys || [];
    const datum = (ts) => new Date(ts * 1000).toLocaleDateString("de-DE");
    U.modal({
      title: "🔐 Anmeldung ohne Passwort",
      body: `<p class="soft" style="margin-top:0;font-size:.88rem">${Passkey.wort()} statt Passwort und Authenticator-Code –
        ein Passkey je Gerät, sicher auf dem Gerät gespeichert. Passwort + 2FA bleiben als Weg erhalten.</p>
        ${liste.length ? `<div class="list" style="margin-bottom:10px">${liste.map((k) => `
          <div class="list-item" style="padding:8px 10px"><div class="grow">
            <div class="title" style="font-size:.88rem">🔐 ${U.esc(k.geraet || "Gerät")}</div>
            <div class="sub">eingerichtet ${datum(k.seit)}${k.zuletzt ? ` · zuletzt ${datum(k.zuletzt)}` : ""}</div></div>
            <button class="btn sm ghost" data-pkweg="${k.id}" title="Passkey entfernen">🗑️</button></div>`).join("")}</div>`
          : `<p class="soft" style="font-size:.85rem">Noch kein Passkey eingerichtet.</p>`}`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn" data-pkneu>🔐 Auf diesem Gerät einrichten</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = U.closeModal;
        m.querySelector("[data-pkneu]").onclick = async () => {
          U.toast("Gerät fragt nach " + Passkey.wort() + " …");
          const e = await Passkey.einrichten();
          if (!e.ok) { if (e.error !== "Abgebrochen") U.toast(e.error, "bad"); return; }
          U.toast(e.schon ? "Auf diesem Gerät ist schon ein Passkey eingerichtet" : "Fertig – beim nächsten Mal reicht ein Tipp 🔐", "good");
          U.closeModal(); passkeyEinstellungen();
          const karte = document.querySelector("#passkeyAngebot"); if (karte) karte.innerHTML = "";
        };
        m.querySelectorAll("[data-pkweg]").forEach((b) => b.onclick = async () => {
          if (!confirm("Diesen Passkey entfernen? Die Anmeldung geht dann wieder nur mit Passwort + 2FA.")) return;
          const d = await api("/api/passkey/loeschen", { method: "POST", body: JSON.stringify({ id: parseInt(b.dataset.pkweg, 10) }) });
          if (!d.ok) { U.toast("Konnte nicht entfernt werden", "bad"); return; }
          if (!(d.data.passkeys || []).length) Passkey.merken(false);
          U.closeModal(); passkeyEinstellungen();
        });
      },
    });
  }
  window.passkeyEinstellungen = passkeyEinstellungen;
  // Fürs Dashboard: Mitteilungen aktiv? (null = Browser kann kein Push)
  window.trainerPushAktiv = async () => {
    if (!pushMoeglich()) return null;
    try { return !!(await aktuellesPushAbo()); } catch (e) { return false; }
  };
  window.trainerPushToggle = trainerPushToggle;

  async function pushKnopfAktualisieren() {
    const b = $("#pushBtn");
    if (!b) return;
    const abo = await aktuellesPushAbo().catch(() => null);
    b.textContent = abo ? "🔕 Mitteilungen aus" : "🔔 Mitteilungen an";
  }
  async function trainerPushToggle() {
    const abo = await aktuellesPushAbo().catch(() => null);
    if (abo) { pushEinstellungen(abo); return; }
    if (istIosOhneApp()) { U.toast("Bitte zuerst als App installieren: Teilen → „Zum Home-Bildschirm“", "bad"); return; }
    if (!pushMoeglich()) { U.toast("Dieser Browser unterstützt keine Mitteilungen", "bad"); return; }
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== "granted") { U.toast("Mitteilungen wurden nicht erlaubt", "bad"); return; }
    const key = await api("/api/push/key");
    if (!key.ok) { U.toast("Server-Schlüssel nicht erreichbar", "bad"); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { U.toast("Seite bitte einmal neu laden und erneut versuchen", "bad"); return; }
    let neu;
    try {
      neu = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ZuBytes(key.data.key) });
    } catch (e) { U.toast("Mitteilungen konnten nicht eingerichtet werden", "bad"); return; }
    const res = await api("/api/push/abo", { method: "POST", body: JSON.stringify(neu.toJSON()) });
    if (!res.ok) { U.toast("Abo konnte nicht gespeichert werden", "bad"); return; }
    U.toast("Mitteilungen sind aktiv 🎉", "good");
    pushKnopfAktualisieren();
  }
  // Einstellungen bei aktivem Abo: was soll gemeldet werden? + Abschalten
  async function pushEinstellungen(abo) {
    const res = await api("/api/trainer/benachrichtigungen");
    const prefs = (res.ok && res.data.prefs) || {};
    U.modal({
      title: "🔔 Mitteilungen fürs Trainerteam",
      body: `<p class="soft">Du bekommst Push-Mitteilungen auf dieses Gerät bei:</p>
        <label class="list-item" style="cursor:pointer"><input type="checkbox" checked disabled style="width:auto">
          <div class="grow"><div class="title">🔑 Passwort-/Code-Anfragen</div><div class="sub">immer – damit niemand ausgesperrt bleibt</div></div></label>
        <label class="list-item" style="cursor:pointer;margin-top:8px"><input type="checkbox" data-absagen ${prefs.pushAbsagen === false ? "" : "checked"} style="width:auto">
          <div class="grow"><div class="title">👎 Absagen von Spielern</div><div class="sub">sofort, wenn jemand für Training oder Spiel absagt</div></div></label>
        <label class="list-item" style="cursor:pointer;margin-top:8px"><input type="checkbox" data-allgemein ${prefs.pushAllgemein === false ? "" : "checked"} style="width:auto">
          <div class="grow"><div class="title">📣 Ankündigungen & Rückmelde-Warnungen</div><div class="sub">neue Ankündigungen, zu wenige Rückmeldungen vor Terminen</div></div></label>`,
      footer: `<button class="btn ghost" data-aus>🔕 Abschalten</button><button class="btn" data-ok>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-ok]").onclick = async () => {
          const r = await api("/api/trainer/benachrichtigungen", { method: "POST", body: JSON.stringify({
            pushAbsagen: m.querySelector("[data-absagen]").checked,
            pushAllgemein: m.querySelector("[data-allgemein]").checked,
          }) });
          U.closeModal();
          U.toast(r.ok ? "Einstellungen gespeichert" : "Speichern fehlgeschlagen", r.ok ? "good" : "bad");
        };
        m.querySelector("[data-aus]").onclick = async () => {
          await api("/api/push/abo-loeschen", { method: "POST", body: JSON.stringify({ endpoint: abo.endpoint }) });
          try { await abo.unsubscribe(); } catch (e) { /* leer */ }
          U.closeModal();
          U.toast("Mitteilungen abgeschaltet");
          pushKnopfAktualisieren();
        };
      },
    });
  }
  // Bestehendes Abo nach dem Login still auffrischen (Browser rotieren Endpunkte)
  async function pushAuffrischen() {
    try {
      if (!pushMoeglich() || Notification.permission !== "granted") return;
      const abo = await aktuellesPushAbo();
      if (abo) await api("/api/push/abo", { method: "POST", body: JSON.stringify(abo.toJSON()) });
    } catch (e) { /* leer */ }
  }

  async function pushNow(initial) {
    if (Sync.saving) { Sync.pending = true; return; }
    Sync.saving = true;
    updateStatus("☁️ Speichere …");
    let res;
    try {
      res = await api("/api/state", {
        method: "PUT",
        body: JSON.stringify({ version: Sync.version, state: Store.get() }),
      });
    } catch (e) {
      Sync.saving = false;
      Sync.pending = true;
      metaSchreiben({ version: Sync.version, pending: true });
      updateStatus("📴 Offline – Änderungen werden nachgetragen");
      return;
    }
    Sync.saving = false;
    if (res.status === 409) {
      Sync.pending = false;
      conflictDialog(res.data);
      return;
    }
    if (res.status === 401 || res.status === 403) {
      updateStatus("🔒 Sitzung abgelaufen – bitte neu anmelden");
      gate.hidden = false;
      show("login");
      return;
    }
    if (!res.ok) {
      Sync.pending = true;
      updateStatus("⚠️ Speichern fehlgeschlagen – neuer Versuch folgt");
      return;
    }
    Sync.version = res.data.version;
    Sync.pending = false;
    Sync.offlineStand = null;
    metaSchreiben({ version: Sync.version, pending: false });
    updateStatus("☁️ Gespeichert " + uhrzeit());
    if (initial) App.reload();
  }

  function conflictDialog(info) {
    const who = info.updatedBy || "einem anderen Trainerkonto";
    const when = info.updatedAt ? new Date(info.updatedAt * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr" : "";
    U.modal({
      title: "Neuerer Stand auf dem Server",
      body: `<p><strong>${who}</strong> hat ${when ? "um " + when + " " : ""}gespeichert, während du gearbeitet hast${metaLesen().pending ? " (z. B. während du offline warst)" : ""}.</p>
        <p>Deine Änderungen wurden <strong>noch nicht</strong> übernommen. Entweder den aktuellen Stand laden und sie erneut eintragen –
        oder deine Änderungen durchsetzen; dann ist der Stand von ${who} überschrieben.</p>`,
      footer: `<button class="btn ghost" data-m>Meine Änderungen durchsetzen</button><button class="btn" data-r>Aktuellen Stand laden</button>`,
      onOpen(m) {
        m.querySelector("[data-r]").onclick = async () => {
          const res = await api("/api/state");
          if (res.ok && res.data.state) {
            Sync.version = res.data.version;
            Store.replaceAll(res.data.state);
            metaSchreiben({ version: Sync.version, pending: false });
          }
          U.closeModal();
          App.reload();
          updateStatus("☁️ Aktueller Stand geladen (v" + Sync.version + ")");
        };
        m.querySelector("[data-m]").onclick = async () => {
          if (!confirm(`Wirklich? Der Stand von ${who} wird damit überschrieben. Er bleibt im Verlauf (Datensicherung) und lässt sich dort wiederherstellen.`)) return;
          const ueberschrieben = info.currentVersion || Sync.version;
          Sync.version = ueberschrieben;   // auf den Serverstand aufsetzen und überschreiben
          U.closeModal();
          await pushNow(false);
          if (!Sync.pending) {
            Sync.ueberschrieben = { version: ueberschrieben, wer: who, wann: when };
            wiederherstellenAngebot();
          }
        };
      },
    });
  }

  // Nach „durchsetzen": kleiner Hinweis mit Rückweg (überschriebener Stand liegt im Verlauf)
  function wiederherstellenAngebot() {
    const u = Sync.ueberschrieben;
    if (!u) return;
    const alt = document.getElementById("wiederherstellenHinweis");
    if (alt) alt.parentNode.removeChild(alt);
    const box = document.createElement("div");
    box.id = "wiederherstellenHinweis";
    box.className = "wh-hinweis";
    box.innerHTML = `<span>↩️ Stand von <strong>${u.wer}</strong> (v${u.version}) wurde überschrieben.</span>
      <button class="btn sm" data-wh>Doch wiederherstellen</button><button class="btn sm ghost" data-whx title="Hinweis schließen">✕</button>`;
    document.body.appendChild(box);
    const weg = () => { if (box.parentNode) box.parentNode.removeChild(box); };
    box.querySelector("[data-whx]").onclick = weg;
    box.querySelector("[data-wh]").onclick = async () => {
      if (!confirm(`Version ${u.version} (${u.wer}) wiederherstellen? Deine durchgesetzten Änderungen bleiben als eigene Version im Verlauf.`)) return;
      weg();
      await Sync.wiederherstellen(u.version);
    };
  }

  // Serverstand einer früheren Version zurückholen (wird selbst eine neue Version) und laden
  Sync.wiederherstellen = async function (version) {
    const r = await api("/api/state/restore", { method: "POST", body: JSON.stringify({ version }) });
    if (!r.ok) { if (window.U) U.toast(r.data.error || "Wiederherstellen fehlgeschlagen", "bad"); return false; }
    const res = await api("/api/state");
    if (res.ok && res.data.state) {
      Sync.version = res.data.version;
      Store.replaceAll(res.data.state);
      metaSchreiben({ version: Sync.version, pending: false });
    }
    Sync.ueberschrieben = null;
    App.reload();
    updateStatus("☁️ Version " + version + " wiederhergestellt (jetzt v" + Sync.version + ")");
    if (window.U) U.toast("Version " + version + " wiederhergestellt", "good");
    return true;
  };

  Sync.verlauf = async function () {
    const r = await api("/api/state/history");
    return r.ok ? (r.data.history || []) : [];
  };

  function updateStatus(text) {
    const el = $("#syncStatus");
    if (el) el.textContent = text;
  }

  // Portal-Logout (Spieler/Eltern-Zwischenseite)
  $("#portalLogout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    location.reload();
  });

  boot();
})();
