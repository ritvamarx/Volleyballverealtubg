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
    return { status: res.status, ok: res.ok, data: data || {} };
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
      if (!prefillInviteCode()) show("login");
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
    if (!username) { authMsg("Bitte den Benutzernamen angeben", true); return; }
    authMsg("Anfrage wird gesendet …");
    const res = await api("/api/passwort-vergessen", {
      method: "POST", body: JSON.stringify({ username }),
    });
    authMsg(res.ok ? "✅ " + (res.data.hint || "Das Trainerteam wurde informiert.")
                   : (res.data.error || "Anfrage nicht möglich"), !res.ok);
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
    if (res.data.username) $("#loginUser").value = res.data.username;
    $("#loginPass").value = "";
    authMsg("✅ Passwort geändert – bitte neu anmelden.");
  });
  $("#auth-register").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    authMsg("Registrierung läuft …");
    const res = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        code: $("#regCode").value,
        name: $("#regName").value.trim(),
        username: $("#regUser").value.trim(),
        password: $("#regPass").value,
      }),
    });
    if (!res.ok) { authMsg(res.data.error || "Registrierung fehlgeschlagen", true); return; }
    show("login");
    $("#loginUser").value = $("#regUser").value.trim();
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
    const res = await api("/api/state");
    if (!res.ok) { authMsg(res.data.error || "Daten konnten nicht geladen werden", true); show("login"); return; }
    Sync.version = res.data.version || 0;
    if (res.data.state) {
      Store.replaceAll(res.data.state);
    } else {
      // Frischer Server: vorhandene lokale Daten anbieten
      const local = Store.get();
      const hasLocal = (local.players || []).length || (local.events || []).length;
      if (hasLocal && confirm("Der Server ist noch leer. Lokale Daten dieses Browsers jetzt zum Server übertragen?")) {
        await pushNow(true);
      } else if (!hasLocal) {
        await pushNow(true); // leere Struktur als Version 1 anlegen
      }
    }
    Sync.active = true;
    gate.hidden = true;
    installSyncHooks();
    App.reload();
    updateStatus("☁️ Verbunden als " + (Sync.user.name || Sync.user.username));
  }

  // ---------- Laufender Abgleich ----------
  let debounceTimer = 0;
  function installSyncHooks() {
    Store.setOnSave(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { pushNow(false); }, 1200);
    });
    setInterval(() => { if (Sync.pending && navigator.onLine !== false) pushNow(false); }, 20000);
    window.addEventListener("online", () => { if (Sync.pending) pushNow(false); });

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
    const t = new Date();
    updateStatus("☁️ Gespeichert " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0"));
    if (initial) App.reload();
  }

  function conflictDialog(info) {
    const who = info.updatedBy || "einem anderen Trainerkonto";
    const when = info.updatedAt ? new Date(info.updatedAt * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr" : "";
    U.modal({
      title: "Neuerer Stand auf dem Server",
      body: `<p><strong>${who}</strong> hat ${when ? "um " + when + " " : ""}gespeichert, während du gearbeitet hast.</p>
        <p>Deine letzte Änderung wurde <strong>nicht</strong> übernommen. Lade den aktuellen Stand und trage sie erneut ein.</p>`,
      footer: `<button class="btn" data-r>Aktuellen Stand laden</button>`,
      onOpen(m) {
        m.querySelector("[data-r]").onclick = async () => {
          const res = await api("/api/state");
          if (res.ok && res.data.state) {
            Sync.version = res.data.version;
            Store.replaceAll(res.data.state);
          }
          U.closeModal();
          App.reload();
          updateStatus("☁️ Aktueller Stand geladen (v" + Sync.version + ")");
        };
      },
    });
  }

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
