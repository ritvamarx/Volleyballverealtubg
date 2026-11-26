/* ==========================================================================
   SKV Müritz – Spieler-/Eltern-Portal (Phase 3)

   Wird von sync.js gestartet, sobald sich ein Konto mit Rolle „spieler"
   oder „eltern" anmeldet. Alle Daten kommen vom Server-Endpunkt
   /api/portal – dort ist bereits gefiltert: Eltern sehen keine Namen
   fremder Kinder, Rückmeldungen nur als Zähler, Fahrer nur das eigene
   Angebot. Das Portal zeigt also nur an, was das Konto sehen darf.
   ========================================================================== */
(function () {
  "use strict";
  const { $, esc, escUrl, fmtDate, fmtTime, fmtDateShort, fmtMoney, toast, volleyballFlug } = U;

  const P = { daten: null, tab: "start", busy: false };
  window.Portal = P;

  async function api(pfad, body) {
    const opts = { credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (window.Sync && Sync.csrf) opts.headers["X-CSRF-Token"] = Sync.csrf;
    if (body) { opts.method = "POST"; opts.body = JSON.stringify(body); }
    const res = await fetch(pfad, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* leer */ }
    return { ok: res.ok, data };
  }

  // ---------- Push-Mitteilungen (Phase 4) ----------

  function pushMoeglich() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function istIosOhneApp() {
    // iPhone/iPad erlaubt Web-Push nur, wenn die Seite als App
    // („Zum Home-Bildschirm") installiert wurde.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installiert = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    return ios && !installiert;
  }

  function b64ZuBytes(b64) {
    const roh = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(roh, (z) => z.charCodeAt(0));
  }

  async function pushAbo() {
    if (!pushMoeglich()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function pushAktivieren() {
    if (istIosOhneApp()) {
      toast("Bitte zuerst als App installieren: Teilen-Knopf → „Zum Home-Bildschirm“", "bad");
      return;
    }
    if (!pushMoeglich()) { toast("Dieser Browser unterstützt keine Mitteilungen", "bad"); return; }
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== "granted") { toast("Mitteilungen wurden nicht erlaubt", "bad"); return; }
    const key = await api("/api/push/key");
    if (!key.ok) { toast("Server-Schlüssel nicht erreichbar", "bad"); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast("App bitte einmal neu laden und erneut versuchen", "bad"); return; }
    let abo;
    try {
      abo = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ZuBytes(key.data.key),
      });
    } catch (e) { toast("Mitteilungen konnten nicht eingerichtet werden", "bad"); return; }
    const res = await api("/api/push/abo", abo.toJSON());
    if (!res.ok) { toast("Abo konnte nicht gespeichert werden", "bad"); return; }
    toast("Mitteilungen sind aktiv 🎉", "good");
    render();
  }

  async function pushDeaktivieren() {
    const abo = await pushAbo();
    if (abo) {
      await api("/api/push/abo-loeschen", { endpoint: abo.endpoint });
      try { await abo.unsubscribe(); } catch (e) { /* leer */ }
    }
    toast("Mitteilungen abgeschaltet");
    render();
  }

  async function pushProbe() {
    const res = await api("/api/push/test", {});
    if (res.ok && res.data.ok > 0) toast("Probe-Mitteilung verschickt – gleich schauen!", "good");
    else toast("Keine Probe angekommen – Mitteilungen zuerst aktivieren", "bad");
  }

  // Bestehendes Abo nach dem Login still auffrischen (Browser rotieren Endpunkte)
  async function pushAuffrischen() {
    try {
      if (!pushMoeglich() || Notification.permission !== "granted") return;
      const abo = await pushAbo();
      if (abo) await api("/api/push/abo", abo.toJSON());
    } catch (e) { /* leer */ }
  }

  // ---------- Begrüßung: tageszeit- und wetterabhängig, mit Jugendsprache ----------

  function gruss(name) {
    const h = new Date().getHours();
    const code = P.wetter ? P.wetter.code : null;
    const wetter = code == null ? "unbekannt"
      : code <= 1 ? "sonne" : code <= 3 ? "wolken" : code <= 48 ? "nebel"
      : code <= 67 || (code >= 80 && code <= 82) ? "regen"
      : code <= 86 ? "schnee" : "gewitter";
    const W = {
      sonne: ["☀️ Draußen knallt die Sonne – perfektes Baggerwetter am Volksbad!",
              "☀️ Sonne satt – nach dem Training ab an die Müritz, no cap!"],
      wolken: ["⛅ Bisschen bedeckt heute – beste Bedingungen für die Halle!",
               "☁️ Grau draußen? Egal, wir bringen den Vibe selbst mit!"],
      nebel: ["🌫️ Nebel über der Müritz – sieht aus wie ein Endgegner-Level!",
              "🌫️ Draußen Suppe, drinnen Volleyball – läuft!"],
      regen: ["🌧️ Es schüttet – Glück gehabt, Volleyball ist eh Hallensport! 😎",
              "🌧️ Regen prasselt, Ball fliegt trotzdem – Halle macht's möglich!"],
      schnee: ["❄️ Schnee?! Dann wird die Halle heute zur Wohlfühl-Zone!",
               "❄️ Draußen Schneeballschlacht, drinnen Baggerschlacht!"],
      gewitter: ["⛈️ Draußen Gewitter – drinnen darfst nur DU einschlagen! ⚡",
                 "⛈️ Blitz und Donner? Dein Schmetterball macht mehr Lärm!"],
      unbekannt: ["🏐 Egal, was draußen los ist – Hauptsache, der Ball fliegt!",
                  "🏐 Bereit für ein paar Quizpunkte oder eine schnelle Zusage?"],
    };
    const T = h < 5 ? ["🌙 Nachtschicht?! Sheesh – aber klar, schau gern rein …", "🌙 Mitternachts-Check? Respekt für die Motivation!"]
      : h < 11 ? [`Moin ${name}! ☕`, `Guten Morgen ${name}! Erstmal locker reinkommen …`, `Yo ${name}, schon wach? Stark!`]
      : h < 14 ? [`Mahlzeit ${name}! 🥪`, `Hey ${name}, Mittagspause = Quizzeit!`]
      : h < 18 ? [`Na ${name}, alles fit? 💪`, `Hey ${name}! Schön, dass du reinschaust.`, `Was geht, ${name}? Läuft bei dir!`]
      : h < 23 ? [`'n Abend ${name}! 🌆`, `Hey ${name}, entspannter Abend-Check?`, `Yo ${name}, Chill-Modus an – Quiz-Modus auch?`]
      : ["🌙 Noch wach? Dann schnell noch ein paar Punkte holen!", "🌙 Späte Session – aber Träume nicht das Training weg!"];
    const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
    return { titel: zufall(T), text: zufall(W[wetter]) };
  }

  // Eltern-Begrüßung: plattdeutsch und hochdeutsch gemischt – nach Tageszeit,
  // Wetter und Jahreszeit (bewusst ohne Jugendsprache)
  function grussEltern(name) {
    const h = new Date().getHours();
    const m = new Date().getMonth();
    const code = P.wetter ? P.wetter.code : null;
    const wetter = code == null ? "unbekannt"
      : code <= 1 ? "sonne" : code <= 3 ? "wolken" : code <= 48 ? "nebel"
      : code <= 67 || (code >= 80 && code <= 82) ? "regen"
      : code <= 86 ? "schnee" : "gewitter";
    const W = {
      sonne: ["☀️ De Sünn lacht över de Müritz – wat’n schönen Dag!",
              "☀️ Herrliches Wetter draußen – und hier drin alles Wichtige zum Team."],
      wolken: ["⛅ Beten grau büten – in de Hall is dat Wetter jo egal.",
               "☁️ Bedeckter Himmel über Waren – in der Halle läuft’s trotzdem."],
      nebel: ["🌫️ Nevel över’t Water – man schön vörsichtig ünnerwegens!",
              "🌫️ Nebelsuppe draußen – gut, dass Volleyball drinnen stattfindet."],
      regen: ["🌧️ Dat gütt as ut Emmers – good, dat de Hall dröög is!",
              "🌧️ Schietwetter büten – Hallensport hett eben sien Vördeel."],
      schnee: ["❄️ Sneei up’t Land – denkt an beten mihr Tied för’n Weg!",
               "❄️ Winterwetter – bitte vorsichtig auf dem Weg zur Halle."],
      gewitter: ["⛈️ Dunnerwedder büten – in de Hall sünd all good uphoben.",
                 "⛈️ Gewitter über der Müritz – drinnen ist es sicher und trocken."],
      unbekannt: ["🏐 Allens Wichtige rund üm dien Kind up een Blick.",
                  "🏐 Hier gibt es alles Wichtige rund ums Team auf einen Blick."],
    };
    const J = (m >= 2 && m <= 4) ? [
        "🌷 Fröhjohr an de Müritz – de Saison nimmt wedder Fohrt up!",
        "🌷 Frühling in Waren – Zeit für neuen Schwung im Team."]
      : (m >= 5 && m <= 7) ? [
        "🌞 Sommertied – twüschen Baden un Volleyball passt allens rin.",
        "🌞 Sommer an der Müritz – die Saisonvorbereitung läuft."]
      : (m >= 8 && m <= 10) ? [
        "🍂 Harvst is Punktspieltied – nu geiht dat wedder los!",
        "🍂 Herbstzeit ist Spielzeit – die Punktspiele laufen."]
      : [
        "⛄ Winterhalvjohr – schön warm antrecken för’n Weg to de Hall!",
        "❄️ Wintersaison – in der Halle ist es zum Glück warm."];
    const T = h < 5 ? ["🌙 So laat noch up? Denn man tau!", "🌙 Noch spät unterwegs? Hier ist trotzdem alles da."]
      : h < 11 ? [`Moin moin, ${name}!`, `Goden Morgen, ${name}!`, `Guten Morgen, ${name}!`, `Moin ${name}, na, ok all munter?`]
      : h < 14 ? [`Middach, ${name}!`, `Mahlzeit, ${name}!`, `Goden Dag, ${name}!`, `Guten Tag, ${name}!`]
      : h < 18 ? [`Goden Namiddach, ${name}!`, `Schönen Nachmittag, ${name}!`, `Na, ${name}, allens klor?`, `Hallo ${name}, schön, dass du reinschaust!`]
      : h < 23 ? [`Goden Abend, ${name}!`, `N’Abend, ${name}!`, `Guten Abend, ${name}!`, `Schönen Abend, ${name}!`]
      : ["🌙 Noch en lütten Blick vör’t Slapengahn?", "🌙 Später Abend-Check – morgen ist auch noch ein Tag."];
    const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
    return { titel: zufall(T), text: zufall([...W[wetter], ...J]) };
  }

  P.start = async function () {
    const gate = $("#authGate");
    if (gate) gate.hidden = true;
    document.body.classList.add("portal-aktiv"); // Trainer-Schnellleiste ausblenden
    let wrap = $("#portalRoot2");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "portalRoot2";
      wrap.className = "portal";
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = `<div class="portal-lade">🏐 Portal wird geladen …</div>`;
    const res = await api("/api/portal");
    if (!res.ok) {
      wrap.innerHTML = `<div class="portal-lade">Portal konnte nicht geladen werden – bitte Seite neu laden.</div>`;
      return;
    }
    P.daten = res.data;
    P.pushAktiv = false;
    if (location.hash === "#einverstaendnis") P.tab = "kontakt";
    render();  // sofort anzeigen – Push-Status/Wetter/Quiz ziehen im Hintergrund nach
    const rot = offenePunkte().filter((x) => x.art === "rot").length;
    if (rot) toast(`🔴 ${rot} dringende${rot === 1 ? "r Punkt" : " Punkte"} – Ampel oben antippen`, "bad");
    // Push-Abo-Prüfung nicht blockierend (nur fürs Konto-Tab relevant)
    pushAbo().then((abo) => {
      if (abo) { P.pushAktiv = true; render(); return; }
      // Eltern: bei jedem Öffnen ohne aktive Mitteilungen nachfragen – Push ist der
      // Kanal für Absagen, Jobs, Antworten des Trainerteams
      if (istEltern() && pushMoeglich() && !P.pushGefragt) { P.pushGefragt = true; pushNachfragen(); }
    }).catch(() => {});
    if (location.hash === "#rueckenwind") setTimeout(() => { const z = document.querySelector("#rwKarte"); if (z) z.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
    if (location.hash === "#nachrichten") setTimeout(() => { const z = document.querySelector("#nachrichtenKarte"); if (z) z.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
    // Wetter für die Begrüßung (Spieler:innen UND Eltern), Quiz nur für Spieler:innen
    api("/api/portal/wetter").then((r) => { if (r.ok) { P.wetter = r.data; P.grussText = null; render(); } });
    if (P.daten.user.role === "spieler") {
      api("/api/portal/quiz").then((r) => { if (r.ok) { P.quiz = r.data; render(); } });
    }
    pushAuffrischen();
    passkeyStatus();
    if (!P.countdownTimer) {
      P.countdownTimer = setInterval(() => {
        document.querySelectorAll("[data-countdown]").forEach((el) => { el.textContent = countdownText(el.dataset.countdown); });
      }, 30000);
    }
    // Freigegebene Dokumente – Tab erscheint nur, wenn es welche gibt
    api("/api/dokumente").then((r) => {
      if (!r.ok) return;
      P.dokumente = r.data.dokumente || [];
      if (location.hash === "#dokumente" && P.dokumente.length) P.tab = "dokumente";
      render();
    });
  };

  // Passkey-Angebot: nur wenn das Gerät Face ID/Touch ID/Fingerabdruck kann,
  // hier noch keiner eingerichtet ist und „Später" nicht in den letzten 30 Tagen gedrückt wurde
  async function passkeyStatus() {
    if (!window.Passkey || !Passkey.moeglich()) return;
    const ua = navigator.userAgent;
    P.passkeyWort = /iPhone|iPad|Macintosh/.test(ua) ? "Face ID / Touch ID" : "Fingerabdruck / Gesicht";
    const r = await api("/api/passkey/liste");
    if (!r.ok) return;
    P.passkeys = r.data;
    let spaeter = 0;
    try { spaeter = parseInt(localStorage.getItem(Passkey.NEIN) || "0", 10); } catch (e) { /* leer */ }
    const plattform = await Passkey.plattform();
    P.passkeyAngebot = plattform && r.data.erlaubt !== false && !Passkey.hier() && Date.now() > spaeter;
    render();
  }

  async function passkeyEinrichten() {
    toast("Gerät fragt nach " + (P.passkeyWort || "Face ID / Fingerabdruck") + " …");
    const r = await Passkey.einrichten();
    if (!r.ok) { if (r.error !== "Abgebrochen") toast(r.error, "bad"); return; }
    P.passkeyAngebot = false;
    if (r.passkeys) P.passkeys = Object.assign({}, P.passkeys, { passkeys: r.passkeys });
    toast(r.schon ? "Auf diesem Gerät ist schon ein Passkey eingerichtet" : "Fertig – beim nächsten Mal reicht ein Tipp 🔐", "good");
    render();
  }

  // Nach Aktionen wird der Portal-Payload neu geladen – standardmäßig „leicht"
  // (ohne die großen Base64-Fotos), die wir aus dem ersten vollen Load behalten.
  // Nur wenn sich Bilder geändert haben (Foto-Upload), voll neu laden.
  async function neuLaden(voll) {
    const alt = P.daten;
    const res = await api(voll ? "/api/portal" : "/api/portal?leicht=1");
    if (!res.ok) return;
    const neu = res.data;
    if (!voll && alt) {
      const uebernehmen = (liste, altListe) => (liste || []).forEach((x) => {
        const a = (altListe || []).find((y) => y.id === x.id);
        if (!a) return;
        if ("foto" in a) x.foto = a.foto;
        if ("bild" in a) x.bild = a.bild;
      });
      uebernehmen(neu.team, alt.team);
      uebernehmen(neu.spieler, alt.spieler);
      uebernehmen(neu.kleidung, alt.kleidung);
    }
    P.daten = neu;
    render();
  }

  function istEltern() { return P.daten.user.role === "eltern"; }

  function spielerName(pid) {
    const p = P.daten.spieler.find((x) => x.id === pid);
    return p ? p.name : "";
  }

  // ---------- Ansichten ----------

  function tabStart() {
    const d = P.daten;
    const naechste = [...d.trainings.map((t) => ({ ...t, art: "training" })),
                      ...d.spiele.map((s) => ({ ...s, art: s.type })),
                      ...(d.weitere || []).map((w) => ({ ...w, art: "misc" }))]
      .sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, 5);
    const ICON = { training: "🏐", home: "🏟️", away: "🚌" };
    // Lebendige Begrüßung (einmal je Besuch gewürfelt): Spieler:innen mit
    // Jugendsprache, Eltern plattdeutsch/hochdeutsch nach Wetter und Jahreszeit
    const vorname = (d.user.name || "").split(" ")[0];
    if (!P.grussText) P.grussText = istEltern() ? grussEltern(vorname) : gruss(vorname);
    const hallo = `<div class="card"><h3>${esc(P.grussText.titel)}</h3>
      <p class="soft">${esc(P.grussText.text)}${P.wetter && P.wetter.temp != null ? ` <span class="badge">${Math.round(P.wetter.temp)} °C in Waren</span>` : ""}</p>
      ${istEltern() ? `<p class="soft" style="font-size:.78rem;margin-bottom:0">Eltern-Zugang für <strong>${esc(d.spieler.map((s) => s.name).join(", ") || "–")}</strong> – du siehst hier alles rund um dein Kind, Rückmeldungen geben die Spieler:innen selbst ab.</p>` : ""}
    </div>`;
    // Schnelle Rückmeldung: der nächste rückmeldbare Termin (Training + Spiel)
    const naechstesTraining = d.trainings[0];
    const naechstesSpiel = d.spiele[0];
    const schnell = !istEltern() && (naechstesTraining || naechstesSpiel) ? `
      <div class="card"><h3>⚡ Kommst du? Sag schnell Bescheid!</h3>
        ${[naechstesTraining, naechstesSpiel].filter(Boolean).map((t) => `
        <div class="portal-termin">
          <div class="title">${t.type === "home" ? "🏟️ Heimspiel" : t.type === "away" ? "🚌 Auswärtsspiel" : "🏐 " + esc(t.title || "Training")}${t.opponent ? " gegen " + esc(t.opponent) : ""}</div>
          <div class="sub">${fmtDate(t.start)} · ${fmtTime(t.start)} Uhr${t.location ? " · " + esc(t.location) : ""}</div>
          ${ortZeile(t)}
          ${dabeiAvatare(t)}
          ${d.spieler.map((sp) => rsvpKnoepfe(t, sp.id)).join("")}
        </div>`).join("")}
      </div>` : "";
    // Quizfrage des Tages: wechselt bei jedem Besuch (zufällige offene Frage)
    let tagesfrage = "";
    if (!istEltern() && P.quiz) {
      const offen = alleFragen().filter((q) => !(P.quiz.beantwortet || []).includes(q.id));
      if (!P.quizTagesfrage || !offen.some((q) => q.id === P.quizTagesfrage)) {
        P.quizTagesfrage = offen.length ? offen[Math.floor(Math.random() * offen.length)].id : null;
      }
      const frage = alleFragen().find((q) => q.id === P.quizTagesfrage);
      tagesfrage = frage ? `<div class="card"><h3>🧠 Quizfrage zwischendurch</h3>
        ${quizKopf()}${frageHTML(frage)}
        <p class="soft" style="font-size:.78rem;margin-bottom:0">Mehr Fragen und die Wochen-Bestenliste findest du im Wiki-Tab.</p>
      </div>` : "";
    }
    // Abzeichen der laufenden Saison (vom Server berechnet, pro Spieler:in)
    const mitAbzeichen = d.spieler.filter((sp) => (sp.abzeichen || []).length);
    const abzeichenKarte = mitAbzeichen.length ? `
      <div class="card"><h3>🏅 ${istEltern() ? "Abzeichen" : "Deine Abzeichen"}</h3>
        ${mitAbzeichen.map((sp) => `<div class="portal-termin">
          ${d.spieler.length > 1 ? `<div class="title">${esc(sp.name)}</div>` : ""}
          <div class="list" style="margin-top:4px">
            ${sp.abzeichen.map((a) => `<div class="list-item" style="padding:6px 8px"><span style="font-size:1.4rem">${esc(a.emoji)}</span>
              <div class="grow"><div class="title" style="font-size:.88rem">${esc(a.name)}</div><div class="sub">${esc(a.text || "")}</div></div></div>`).join("")}
          </div>
        </div>`).join("")}
        <p class="soft" style="font-size:.78rem;margin-bottom:0">Abzeichen gibt es fürs zuverlässige Zurückmelden und fürs Dabeisein – sie gelten für die laufende Saison.</p>
      </div>` : (!istEltern() && d.spieler.length ? `
      <div class="card"><h3>🏅 Abzeichen</h3>
        <p class="soft" style="margin-bottom:0">Noch keine Abzeichen – melde dich fleißig zu Trainings und Spielen zurück, dann klappt das! 💪</p>
      </div>` : "");
    // Aufgaben-Karte (bei Eltern direkt unter der Begrüßung)
    const aufgabenKarte = (d.aufgaben || []).length ? `<div class="card"><h3>✅ Deine Aufgaben vom Trainerteam</h3><div class="list">
        ${d.aufgaben.map((t) => `<label class="list-item" style="cursor:pointer">
          <input type="checkbox" data-aufg="${t.id}" ${t.erledigt ? "checked" : ""} style="width:auto">
          <div class="grow"><div class="title" style="${t.erledigt ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</div>
          <div class="sub">${t.due ? "fällig bis " + fmtDateShort(t.due) : ""}${t.priority === "hoch" ? ' · <span class="badge bad">wichtig</span>' : ""}</div></div>
        </label>`).join("")}
      </div></div>` : "";

    // Eltern: Rückmeldeverhalten des eigenen Kindes im anonymen Teamvergleich
    const statBalken = (wert, teamWert, label) => `
      <div style="margin:6px 0 2px;font-size:.8rem">${label}: <strong>${wert} %</strong> <span class="soft">(Ø Team ${teamWert} %)</span></div>
      <div style="position:relative;height:9px;border-radius:5px;background:#e3e6ee;overflow:hidden">
        <div style="width:${wert}%;height:100%;border-radius:5px;background:${wert >= 75 ? "#2e9e5b" : wert >= 50 ? "#e8a13c" : "#d05050"}"></div>
        <div title="Team-Durchschnitt" style="position:absolute;top:-2px;bottom:-2px;left:${teamWert}%;width:2px;background:#1e3a8a"></div>
      </div>`;
    const statistikKarte = istEltern() && d.statistik && d.spieler.length ? `
      <div class="card"><h3>📊 Rückmeldeverhalten (laufende Saison)</h3>
        ${d.spieler.map((sp) => {
          const st = (d.statistik.kinder || {})[sp.id];
          const team = d.statistik.team || {};
          if (!st || !st.termine) return `<div class="portal-termin"><div class="title">${esc(sp.name)}</div>
            <p class="soft" style="margin-bottom:0">Noch keine Termine in dieser Saison – die Statistik füllt sich mit den ersten Trainings und Spielen.</p></div>`;
          return `<div class="portal-termin">
            <div class="title">${esc(sp.name)} <span class="badge info" title="Rang nach Rückmeldequote – ohne Namen anderer">Platz ${st.rang} von ${team.anzahl}</span></div>
            ${statBalken(st.antwortQ, team.antwortQ, "Rückmeldungen abgegeben")}
            ${statBalken(st.zusageQ, team.zusageQ, "Zusagen (dabei gewesen)")}
            <div class="sub" style="margin-top:6px">${st.geantwortet} von ${st.termine} Terminen beantwortet · ${st.zusagen} Zusagen</div>
          </div>`;
        }).join("")}
        <p class="soft" style="font-size:.75rem;margin-bottom:0">Der Vergleich zeigt nur Durchschnitt und Platznummer – Namen oder Werte anderer Kinder sind nicht einsehbar.</p>
      </div>` : "";

    const einwFehlt = (d.einverstaendnis || []).filter((e) => !e.vollstaendig && !e.eingereicht);
    const einwKarteStart = einwFehlt.length ? `<div class="card" style="border:1.5px solid #e8a13c">
        <h3>📝 Einverständniserklärung fehlt</h3>
        <p class="soft">Für ${einwFehlt.map((e) => esc((d.spieler.find((x) => x.id === e.playerId) || {}).name || "")).join(", ")} fehlt noch die Erklärung des Trainerteams
        ${istEltern() ? "– am schnellsten digital bestätigen, dauert zwei Minuten." : "– bitte deine Eltern, sie im Elternkonto zu bestätigen."}</p>
        ${istEltern() ? `<button class="btn" data-gehkonto>✍️ Jetzt bestätigen</button>` : ""}
      </div>` : "";
    const passkeyKarte = P.passkeyAngebot ? `<div class="card">
        <h3>🔐 Schneller anmelden</h3>
        <p class="soft">Nie wieder Passwort merken: Anmelden mit ${P.passkeyWort} – mit einem Tipp.
        Sicher gespeichert auf diesem Gerät, Passwort und Code funktionieren weiterhin.</p>
        <div class="portal-fahrer" style="margin-top:6px">
          <button class="btn" data-pkneu>🔐 ${P.passkeyWort} einrichten</button>
          <button class="btn sm ghost" data-pkspaeter>Später</button>
        </div>
      </div>` : "";
    const nachrichtenKarte = istEltern() ? `<div class="card" id="nachrichtenKarte"><h3>📨 Nachricht ans Trainerteam</h3>
        <p class="soft" style="margin-top:0">Frage, Hinweis, Krankmeldung, Lob – schreib direkt hier. Das Trainerteam bekommt eine Push-Mitteilung und antwortet dir an dieser Stelle.</p>
        <textarea id="nmText" rows="3" maxlength="1000" placeholder="Deine Nachricht …" style="width:100%"></textarea>
        <div class="portal-fahrer"><button class="btn sm" id="nmSenden">📨 Senden</button></div>
        ${(d.nachrichten || []).length ? `<div class="list" style="margin-top:10px">${d.nachrichten.slice().reverse().slice(0, 5).map((n) => `
          <div class="list-item" style="flex-direction:column;align-items:stretch;gap:4px">
            <div><div class="sub">Du · ${fmtDateShort(n.at)}</div><div style="font-size:.9rem">${esc(n.text)}</div></div>
            ${(n.antworten || []).map((a) => `<div style="background:var(--surface-2);border-radius:10px;padding:6px 10px"><div class="sub">💬 ${esc(a.von)} · ${fmtDateShort(a.at)}</div><div style="font-size:.9rem">${esc(a.text)}</div></div>`).join("")
              || '<div class="sub">⏳ noch keine Antwort</div>'}
          </div>`).join("")}</div>` : ""}
      </div>` : "";
    return `
      ${hallo}
      ${deinJahrKarte()}
      ${rwSpielerStart()}
      ${einwKarteStart}
      ${rwElternStart()}
      ${nachrichtenKarte}
      ${istEltern() ? elternAbzeichenKarte() : ""}
      ${passkeyKarte}
      ${istEltern() ? aufgabenKarte : ""}
      ${statistikKarte}
      ${schnell}
      ${tagesfrage}
      ${abzeichenKarte}
      ${d.whatsapp ? `<div class="card"><h3>💬 ${istEltern() ? "WhatsApp-Elterngruppe" : "WhatsApp-Gruppe des Teams"}</h3>
        <p class="soft">Hier laufen kurzfristige Infos zusammen – komm gern dazu!</p>
        <a class="btn" style="text-decoration:none" href="${escUrl(d.whatsapp)}" target="_blank" rel="noopener">💬 Gruppe öffnen / beitreten</a>
      </div>` : ""}
      ${pushMoeglich() && !P.pushAktiv ? `<div class="card">
        <h3>🔔 Mitteilungen aktivieren</h3>
        <p class="soft">Neue Ankündigungen des Trainerteams direkt aufs Handy – ohne die App öffnen zu müssen.
        ${istIosOhneApp() ? "<br><strong>iPhone:</strong> zuerst als App installieren (Teilen → „Zum Home-Bildschirm“), dann hier aktivieren." : ""}</p>
        <button class="btn" data-pushan>🔔 Jetzt aktivieren</button>
      </div>` : ""}
      ${!istEltern() ? aufgabenKarte : ""}
      ${d.ankuendigungen.length ? `<div class="card"><h3>📣 Ankündigungen</h3><div class="list">
        ${d.ankuendigungen.map((a) => `<div class="list-item"><div class="grow">
          <div class="title">${esc(a.title)}</div><div class="sub">${esc(a.body)}</div></div></div>`).join("")}
      </div></div>` : ""}
      <div class="card"><h3>📅 Die nächsten Termine</h3><div class="list">
        ${naechste.length ? naechste.map((e) => {
          const spiel = e.art === "home" || e.art === "away";
          const offen = (e.art === "training" || spiel) && !e.abgesagt
            ? d.spieler.filter((sp) => !((e.meine || {})[sp.id])) : [];
          const jobsHier = e.art === "home" ? (d.jobs || []).filter((j) => j.eventId === e.id) : [];
          const fahrt = e.art === "away" && istEltern() ? (d.fahrer || []).find((f) => f.eventId === e.id) : null;
          return `<div class="list-item" data-gehzu="${e.id}" role="link" tabindex="0" style="cursor:pointer;flex-wrap:wrap"><div class="grow" style="min-width:200px">
            <div class="title">${e.art === "misc" ? esc(e.kategorie) + ": " : (ICON[e.art] || "📌") + " "}${esc(e.title || "")}${e.opponent ? " gegen " + esc(e.opponent) : ""}
              ${e.abgesagt ? '<span class="badge bad">abgesagt</span>' : ""}
              ${offen.length ? `<span class="badge warn" title="Noch keine Rückmeldung${d.spieler.length > 1 ? ": " + esc(offen.map((x) => x.name.split(" ")[0]).join(", ")) : ""}">🟡 Rückmeldung fehlt</span>` : ""}
              ${(spiel || e.art === "training") && !e.abgesagt ? `<span class="badge" title="Zusagen inkl. Trainer:in">👥 ${((e.zusagen || {}).yes || 0) + 1} dabei</span>` : ""}
              ${spiel && !e.abgesagt ? `<span class="badge accent" data-countdown="${esc(e.start)}">${countdownText(e.start)}</span>` : ""}</div>
            <div class="sub">${fmtDate(e.start)} · ${fmtTime(e.start)} Uhr${e.location ? " · " + esc(e.location) : ""}</div>
            ${ortZeile(e)}
          </div><span class="arr">›</span>
          ${jobsHier.length ? `<div style="flex-basis:100%;margin-top:6px"><div class="sub" style="margin-bottom:4px">🙌 Hilfe gesucht – einfach übernehmen:</div>
            ${jobsHier.map((j) => `<div class="flex" style="justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-top:1px dashed var(--border)">
              <span style="font-size:.86rem">${JOB_KAT[j.category] || "📌"} ${esc(j.title)}${jobDauer(j)}${j.meiner ? ' <span class="badge good">deiner 💪</span>' : ""}</span>
              ${j.meiner ? `<button class="btn sm ghost" data-jobab="${j.id}">Abgeben</button>` : `<button class="btn sm" data-job="${j.id}">Übernehmen</button>`}
            </div>`).join("")}${helferZeile([e.id])}</div>` : ""}
          ${e.art === "away" && istEltern() && !e.abgesagt ? `<div style="flex-basis:100%;margin-top:6px" class="sub">🚗 ${fahrt && fahrt.seats ? `Du bietest ${fahrt.seats} Mitfahrplätze an – danke!` : `Mitfahrplätze gesucht – <a href="#" data-gehtab="mithelfen">jetzt anbieten</a>`}</div>` : ""}
          </div>`;
        }).join("") : `<p class="soft">Aktuell stehen keine Termine an.</p>`}
      </div></div>
      ${tabelleKompakt()}
      ${d.links.length ? `<div class="card"><h3>🔗 Links</h3><div class="list">
        ${d.links.map((l) => `<a class="list-item" href="${escUrl(l.url)}" target="_blank" rel="noopener"><div class="grow">
          <div class="title">${esc(l.icon)} ${esc(l.title)}</div><div class="sub">${esc(l.sub)}</div></div><span class="arr">›</span></a>`).join("")}
      </div></div>` : ""}`;
  }

  // Rückmeldung: nur Daumen-Symbole – 👍 direkt, ❓/👎 fragen nach einer Begründung
  function rsvpKnoepfe(t, pid) {
    if (t.abgesagt) {
      return `<div class="portal-rsvp"><span class="badge bad">🚫 Abgesagt${t.abgesagt.notiz ? " – " + esc(t.abgesagt.notiz) : ""}</span></div>`;
    }
    if (istEltern()) {
      // Eltern sehen nur den Stand des eigenen Kindes – Rückmeldung gibt das Kind selbst ab
      const st = (t.meine || {})[pid] || "";
      const g = (t.gruende || {})[pid] || "";
      const M = { yes: ['<span class="badge good">✅ zugesagt</span>', ""],
                  maybe: ['<span class="badge warn">❔ unsicher</span>', ""],
                  no: ['<span class="badge bad">❌ abgesagt</span>', ""],
                  x: ['<span class="badge">🚫 nicht nominiert</span>', ""] };
      return `<div class="portal-rsvp" style="gap:6px;align-items:center">
        ${st ? M[st][0] : '<span class="badge">⏳ noch keine Rückmeldung</span>'}
        ${st && g ? `<span class="sub">💬 ${esc(g)}</span>` : ""}
      </div>`;
    }
    const mein = (t.meine || {})[pid] || "";
    const grund = (t.gruende || {})[pid] || "";
    const offen = P.rsvpBegr && P.rsvpBegr.eid === t.id && P.rsvpBegr.pid === pid;
    const MOD = { yes: "ja", maybe: "viel", no: "nein" };  // Aktiv-Farbe: Ja=grün, Vielleicht=orange, Nein=rot
    const B = (status, symbol, titel) => `<button class="rsvp-daumen ${mein === status ? "aktiv " + MOD[status] : ""}"
      data-rsvp="${t.id}" data-pid="${pid}" data-status="${mein === status ? "" : status}"
      title="${titel}" aria-label="${titel}">${symbol}</button>`;
    return `${mein === "x" ? `<div class="portal-rsvp-zeile"><span class="badge-x">🚫 Du wurdest für diesen Termin nicht nominiert</span>
      <span class="sub" style="display:block;margin-top:2px">Du kannst dich trotzdem selbst zurückmelden:</span></div>` : ""}
    <div class="portal-rsvp">
      ${B("yes", "👍", "Ich komme")}${B("maybe", "❓", "Weiß noch nicht")}${B("no", "👎", "Ich kann nicht")}
    </div>
    ${offen ? `<div class="portal-fahrer rsvp-begruendung">
      <input data-rsvpgrund placeholder="${P.rsvpBegr.status === "no" ? "Warum klappt es nicht? (z. B. krank, Schule …)"
        : P.rsvpBegr.status === "maybe" ? "Warum unsicher? (z. B. Mitfahrt offen …)"
        : "Bemerkung (z. B. +1, muss 10 Min eher los) – optional"}" value="${P.rsvpBegr.status === "yes" ? esc(grund) : ""}" maxlength="80" autofocus>
      <button class="btn sm" data-rsvpsenden>Senden</button>
      <button class="btn sm ghost" data-rsvpabbruch>✕</button>
    </div>` : ""}
    ${!offen && grund && mein ? `<div class="sub">💬 ${esc(grund)}</div>` : ""}
    ${!offen && mein === "yes" ? `<div class="sub"><a href="#" data-rsvpplus="${t.id}" data-pid="${pid}">💬 ${grund ? "Bemerkung ändern" : "Bemerkung hinzufügen (z. B. +1, muss eher los)"}</a></div>` : ""}`;
  }

  function tabTermine() {
    const d = P.daten;
    return `
      <div class="card"><h3>${istEltern() ? "🏐 Trainings – so hat sich dein Kind gemeldet" : "🏐 Training – bitte rückmelden"}</h3>
      ${d.trainings.length ? d.trainings.map((t) => `
        <div class="portal-termin" data-termin="${t.id}">
          <div class="title">🏐 ${esc(t.title || "Training")}</div>
          <div class="sub">${fmtDate(t.start)} · ${fmtTime(t.start)}–${fmtTime(t.end)} Uhr${t.location ? " · " + esc(t.location) : ""}</div>
          ${ortZeile(t)}
          ${zusagenPills(t.zusagen)}
          ${dabeiAvatare(t)}
          ${d.spieler.map((sp) => `
            <div class="portal-rsvp-zeile">${d.spieler.length > 1 || istEltern() ? `<span class="sub">${esc(sp.name)}:</span>` : ""}
            ${rsvpKnoepfe(t, sp.id)}</div>`).join("")}
        </div>`).join("") : `<p class="soft">Keine anstehenden Trainings eingetragen.</p>`}
      </div>
      <div class="card"><h3>${istEltern() ? "🏆 Spiele – Rückmeldestand deines Kindes" : "🏆 Spiele – bitte rückmelden"}</h3>
      ${d.spiele.length ? d.spiele.map((s) => `<div class="portal-termin" data-termin="${s.id}">
          <div class="title">${s.type === "home" ? "🏟️" : "🚌"} ${esc(s.title || (s.type === "home" ? "Heimspiel" : "Auswärtsspiel"))}</div>
          <div class="sub">${s.type === "home" ? "Heimspiel" : "Auswärtsspiel"}${s.opponent ? " gegen " + esc(s.opponent) : ""} · ${fmtDate(s.start)} · ${fmtTime(s.start)} Uhr${s.location ? " · " + esc(s.location) : ""}</div>
          ${ortZeile(s)}
          ${zusagenPills(s.zusagen)}
          ${dabeiAvatare(s)}
          ${d.spieler.map((sp) => `
            <div class="portal-rsvp-zeile">${d.spieler.length > 1 || istEltern() ? `<span class="sub">${esc(sp.name)}:</span>` : ""}
            ${rsvpKnoepfe(s, sp.id)}</div>`).join("")}
          ${s.type === "home" ? `
            <div class="sub">🥗 Buffet: ${s.buffetAnzahl || 0} ${s.buffetAnzahl === 1 ? "Beitrag" : "Beiträge"} angekündigt${s.meinBuffet ? ` · deiner: <strong>${esc(s.meinBuffet)}</strong>` : ""}</div>
            <div class="portal-fahrer">
              <input data-bufin="${s.id}" placeholder="Ich bringe mit: z. B. Kuchen, Salat, Getränke …" value="${esc(s.meinBuffet || "")}" maxlength="80">
              <button class="btn sm" data-bufsave="${s.id}">Speichern</button>
            </div>` : `
            <div class="sub">🚗 Mitfahrgelegenheiten: ${s.plaetzeGesamt || 0} ${s.plaetzeGesamt === 1 ? "Platz" : "Plätze"} angeboten${s.meinePlaetze ? ` · deine: <strong>${s.meinePlaetze}</strong>` : ""}</div>
            <div class="portal-fahrer">
              <select data-mfseats="${s.id}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
                `<option value="${n}" ${(s.meinePlaetze || 0) === n ? "selected" : ""}>${n === 0 ? "kein Angebot" : n + (n === 1 ? " Platz" : " Plätze")}</option>`).join("")}</select>
              <button class="btn sm" data-mfsave="${s.id}">Speichern</button>
            </div>`}
        </div>`).join("") : `<p class="soft">Keine anstehenden Spiele eingetragen.</p>`}
      </div>
      ${(P.daten.weitere || []).length ? `<div class="card"><h3>📌 Weitere Termine</h3><div class="list">
      ${P.daten.weitere.map((w) => `<div class="list-item" data-termin="${w.id}"><div class="grow">
          <div class="title">${esc(w.kategorie)}: ${esc(w.title)}</div>
          <div class="sub">${fmtDate(w.start)} · ${fmtTime(w.start)} Uhr${w.location ? " · " + esc(w.location) : ""}</div>
          ${ortZeile(w)}
        </div></div>`).join("")}
      </div></div>` : ""}
      ${tabelleKarte()}`;
  }

  // Verbandsliga-Tabelle (öffentliche Daten aus dem Trainer-Bereich)
  function tabelleKarte() {
    const rows = P.daten.tabelle || [];
    if (!rows.length) return `
      <div class="card"><h3>📊 Tabelle Verbandsliga MV</h3>
      <p class="soft">Die Tabelle wird vom Trainerteam nach den Spieltagen gepflegt und erscheint dann hier.
      Live-Stände gibt es jederzeit beim Verband:</p>
      <p style="margin-bottom:0"><a href="https://www.vmv24.de/" target="_blank" rel="noopener">📊 VMV-Spielbetrieb (vmv24.de) ↗</a></p>
      </div>`;
    return `
      <div class="card"><h3>📊 Tabelle Verbandsliga MV</h3>
      <div class="portal-tabelle"><table>
        <thead><tr><th>#</th><th>Team</th><th>Sp.</th><th>S</th><th>N</th><th>Sätze</th><th>Pkt.</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr class="${/skv/i.test(r.team || "") ? "wir" : ""}">
            <td>${i + 1}</td>
            <td>${/skv/i.test(r.team || "") ? "🏐 " : ""}${esc(r.team || "")}</td>
            <td>${r.games == null ? "" : r.games}</td><td>${r.win == null ? "" : r.win}</td><td>${r.loss == null ? "" : r.loss}</td>
            <td>${r.setsW || 0}:${r.setsL || 0}</td>
            <td><strong>${r.points == null ? "" : r.points}</strong></td>
          </tr>`).join("")}</tbody>
      </table></div>
      <p class="soft" style="font-size:.75rem;margin-bottom:0">Sp. = Spiele · S = Siege · N = Niederlagen · Pkt. = Punkte${
        P.daten.tabelleMeta && P.daten.tabelleMeta.stand
          ? `<br>Offizieller Stand ${esc(P.daten.tabelleMeta.liga || "")} · automatisch abgeglichen am ${fmtDate(P.daten.tabelleMeta.stand)}`
          : ""}</p>
      </div>`;
  }

  // ---------- Volleyball-Quiz (Wochen-Wettbewerb) ----------
  // 7 Kapitel nach den offiziellen Volleyball-Spielregeln (FIVB/DVV).
  // 1. Versuch richtig = 10 Punkte, nach Fehlversuch = 5. Die Wochenwertung
  // startet jeden Montag neu (alle Fragen wieder spielbar); die Gesamtpunkte
  // laufen dauerhaft weiter. Punktestand liegt je Konto auf dem Server.
  // Fragen kommen vom Server (P.quiz.kapitel) – eigene Trainer-Fragen sind dort
  // schon eingemischt, richtige Antwort und Punktevergabe bleiben serverseitig.
  const alleKapitel = () => (P.quiz && P.quiz.kapitel) || [];
  const alleFragen = () => alleKapitel().flatMap((k) => k.fragen);

  const ABZEICHEN = { gold: "🥇", silber: "🥈", bronze: "🥉" };

  // HTML für EINE Quizfrage (wird im Wiki-Tab und als Tagesfrage genutzt).
  // Fragen und Punkte kommen vom Server; STUFEN dient nur der Anzeige (Symbol/Name).
  const STUFEN = { 1: ["🟢", "Anfänger"], 2: ["🟡", "Fortgeschritten"], 3: ["🔴", "Profi"] };
  const frageStufe = (frage) => STUFEN[frage.stufe] ? frage.stufe : 2;

  function frageHTML(frage) {
    const falsche = (P.quizFalsche && P.quizFalsche[frage.id]) || [];
    const st = STUFEN[frageStufe(frage)];
    return `<div class="portal-termin">
      <div class="title" style="font-size:.95rem">${esc(frage.f)}</div>
      <div class="sub" style="margin:2px 0 4px">${st[0]} ${st[1]} · ${frage.punkte || 10} Punkte</div>
      <div class="quiz-optionen">
        ${frage.a.map((opt, i) => falsche.includes(i)
          ? `<span class="quiz-opt falsch">${esc(opt)}</span>`
          : `<button class="quiz-opt" data-quiz="${i}" data-qid="${frage.id}">${esc(opt)}</button>`).join("")}
      </div>
      ${falsche.length ? `<div class="sub" style="margin-top:8px;color:#b45309">Leider falsch – probier’s gleich nochmal! (gibt jetzt weniger Punkte)</div>` : ""}
    </div>`;
  }

  // Wetter (nächste 7 Tage, am Spielort) + Karten-Link für eine Termin-Zeile
  const wetterIcon = (code) => code == null ? "" : code <= 1 ? "☀️" : code <= 3 ? "⛅"
    : code <= 48 ? "🌫️" : code <= 67 ? "🌧️" : code <= 77 ? "❄️" : code <= 82 ? "🌦️"
    : code <= 86 ? "❄️" : "⛈️";
  function ortZeile(e) {
    const teile = [];
    if (e.wetter && e.wetter.code != null) {
      teile.push(`${wetterIcon(e.wetter.code)} voraussichtlich ${Math.round(e.wetter.tmin)}–${Math.round(e.wetter.tmax)} °C`);
    }
    if (e.location) {
      teile.push(`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">🗺️ Karte</a>`);
    }
    return teile.length ? `<div class="sub">${teile.join(" · ")}</div>` : "";
  }

  // „Wer ist dabei?": Avatare der Zugesagten (nur für Spieler:innen; Name beim
  // Berühren/Hover per title – bewusst OHNE Gründe oder Bemerkungen)
  // Zu-/Absagen als farbige Zahl-Pillen (SpielerPlus-Muster)
  function zusagenPills(z) {
    z = z || {};
    return `<div class="zahlrow">
      <span class="pill ja">👍 ${z.yes || 0}</span>
      <span class="pill viel">❓ ${z.maybe || 0}</span>
      <span class="pill nein">👎 ${z.no || 0}</span>
    </div>`;
  }

  function dabeiAvatare(t) {
    if (istEltern() || !(t.dabeiIds || []).length) return "";
    const team = P.daten.team || [];
    const leute = t.dabeiIds.map((id) => team.find((p) => p.id === id)).filter(Boolean);
    if (!leute.length) return "";
    const vorname = (name) => (name || "").trim().split(" ")[0];
    // Alle Namen zeigen (Chips brechen um) – nichts kürzen
    return `<div class="dabei">
      ${leute.map((p) => `<span class="mini-name" title="${esc(p.name)}">${p.foto
        ? `<img class="mini" src="${p.foto}" alt="" style="object-fit:cover">`
        : (p.avatarEmoji ? `<span class="me">${esc(p.avatarEmoji)}</span>` : "")}${esc(vorname(p.name))}</span>`).join("")}
      <span class="n">${leute.length} dabei</span>
    </div>`;
  }

  function quizKopf() {
    const eigenes = (P.quiz.bestenliste || []).find((b) => b.name === P.daten.user.name);
    return `<div class="flex" style="align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      ${eigenes && eigenes.abzeichen ? `<span style="font-size:1.4rem" title="Dein Wochen-Abzeichen">${ABZEICHEN[eigenes.abzeichen]}</span>` : ""}
      <span class="badge accent" style="font-size:.9rem">⚡ ${P.quiz.wochenPunkte || 0} P. diese Woche</span>
      <span class="badge">⭐ ${P.quiz.punkte || 0} P. gesamt</span>
      <span class="badge">${(P.quiz.beantwortet || []).length}/${alleFragen().length} Fragen</span></div>`;
  }

  function bestenlisteHTML() {
    const liste = P.quiz.bestenliste || [];
    if (!liste.length) return "";
    return `
      <div style="margin-top:14px"><strong style="font-size:.9rem">🏆 Wochen-Bestenliste</strong>
      <span class="soft" style="font-size:.75rem"> · startet jeden Montag neu</span>
      <div class="list" style="margin-top:6px">
        ${liste.map((b, i) => `<div class="list-item" style="padding:7px 10px;${b.abzeichen ? "background:#fff7ed" : ""}"><div class="grow">
          <div class="title" style="font-size:.88rem">${b.abzeichen ? ABZEICHEN[b.abzeichen] : `${i + 1}.`} ${esc(b.name)}</div></div>
          <span class="badge accent">${b.wochenPunkte} P. Woche</span>
          <span class="badge">${b.punkte} P. gesamt</span></div>`).join("")}
      </div></div>`;
  }

  function quizKarte() {
    if (!P.quiz) return `<div class="card"><h3>🏐 Volleyball-Quiz</h3><p class="soft">Wird geladen …</p></div>`;
    const beantwortet = P.quiz.beantwortet || [];
    const kapitelListe = alleKapitel();
    if (P.quizKapitel == null) P.quizKapitel = kapitelListe.findIndex((k) => k.fragen.some((q) => !beantwortet.includes(q.id)));
    if (P.quizKapitel < 0) P.quizKapitel = 0;
    const kapitel = kapitelListe[P.quizKapitel];
    const frage = kapitel.fragen.find((q) => !beantwortet.includes(q.id));
    const chips = kapitelListe.map((k, i) => {
      const fertig = k.fragen.filter((q) => beantwortet.includes(q.id)).length;
      return `<button class="chip ${i === P.quizKapitel ? "aktiv" : ""}" data-qkap="${i}">${esc(k.titel)} ${fertig}/${k.fragen.length}</button>`;
    }).join("");
    return `<div class="card"><h3>🏐 Volleyball-Quiz – Wochen-Wettbewerb</h3>${quizKopf()}
      <div class="portal-chips">${chips}</div>
      ${frage ? frageHTML(frage)
        : `<p style="margin:10px 0"><strong>✔ Kapitel „${esc(kapitel.titel)}“ diese Woche komplett!</strong>
           Such dir oben das nächste Kapitel aus.</p>`}
      ${bestenlisteHTML()}</div>`;
  }

  async function quizAntwort(frageId, idx) {
    // Auswertung passiert serverseitig: wir schicken nur den gewählten Index
    const res = await api("/api/portal/quiz", { frageId, antwortIndex: idx });
    if (!res.ok) { toast(res.data.error || "Antwort konnte nicht gespeichert werden", "bad"); return; }
    P.quizFalsche = P.quizFalsche || {};
    if (!res.data.richtig) {
      P.quizFalsche[frageId] = [...(P.quizFalsche[frageId] || []), idx];
      render();
      return;
    }
    P.quiz.punkte = res.data.punkte;
    P.quiz.wochenPunkte = res.data.wochenPunkte;
    if (res.data.neu > 0) { volleyballFlug(); toast(`Richtig! +${res.data.neu} Punkte 🎉`, "good"); }
    P.quiz.beantwortet = [...(P.quiz.beantwortet || []), frageId];
    delete P.quizFalsche[frageId];
    if (P.quizTagesfrage === frageId) P.quizTagesfrage = null; // nächste Tagesfrage wählen
    const r2 = await api("/api/portal/quiz");
    if (r2.ok) P.quiz = r2.data; // Bestenliste/Abzeichen auffrischen
    render();
  }

  function tabWiki() {
    const artikel = (window.WikiArtikel || []).filter((a) => a.id !== "training");
    return `
      ${quizKarte()}
      <div class="card"><h3>📖 Volleyball-Wiki</h3>
      <p class="soft">Regeln, Techniken und Begriffe – zum Nachschlagen für Spieler:innen und Eltern.
      Einfach ein Thema antippen.</p>
      ${artikel.map((a) => `
        <details class="portal-wiki">
          <summary>${a.h}</summary>
          <div class="portal-wiki-inhalt">${a.html}</div>
        </details>`).join("")}
      <p class="soft" style="font-size:.8rem;margin-bottom:0">
        <a href="https://www.volleyball-verband.de/de/service/schiedsrichter/regelwerk/" target="_blank" rel="noopener">📘 Offizielles Regelwerk (DVV) ↗</a></p>
      </div>`;
  }

  function tabMithelfen() {
    const d = P.daten;
    const tagKey = (e) => `${String(e.start).slice(0, 10)}|${(e.location || "").trim().toLowerCase()}`;
    // Spieltage: mehrere Spiele am selben Tag am selben Ort = ein Block
    const gruppen = (liste) => {
      const m = new Map();
      liste.forEach((e) => { const k = tagKey(e); if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
      return Array.from(m.values());
    };
    const spieleText = (evs) => evs.map((e) => `${fmtTime(e.start)} Uhr${e.opponent ? " gegen " + esc(e.opponent) : (e.title ? " " + esc(e.title) : "")}`).join(" · ");
    const auswaerts = gruppen(d.spiele.filter((s) => s.type === "away" && !s.abgesagt));
    const angebot = (eid) => (d.fahrer || []).find((f) => f.eventId === eid);
    const ea = d.elternAbzeichen;
    const heim = gruppen(d.spiele.filter((s) => s.type === "home" && !s.abgesagt)
      .filter((s) => (d.jobs || []).some((j) => j.eventId === s.id)));
    return `
      ${ea ? `<div class="card"><h3>💪 Mithelfen lohnt sich</h3>
        <p class="soft" style="margin-top:0">Heimspiel-Jobs und Mitfahrplätze halten den Spielbetrieb am Laufen – und bringen dir Helfer-Abzeichen.
        Bisher <strong>${ea.jobs}</strong> Job(s) und <strong>${ea.fahrten}</strong> Fahrt(en).${ea.naechstes ? ` Nächstes Abzeichen: ${esc(ea.naechstes.emoji)} <strong>${esc(ea.naechstes.name)}</strong> – noch ${ea.naechstes.fehlt} ${esc(ea.naechstes.text)}.` : ""}</p>
        ${ea.erhalten.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${ea.erhalten.map((x) => `<span class="badge good" title="${esc(x.text)}">${esc(x.emoji)} ${esc(x.name)}</span>`).join("")}</div>` : ""}
      </div>` : ""}
      <div class="card"><h3>🚗 Fahrer:in für Auswärtsspiele</h3>
      <p class="soft">Trage ein, wie viele Plätze du anbieten kannst – die Zuordnung der Mitfahrer:innen
      übernimmt das Trainerteam und meldet sich bei dir. Jede Fahrt zählt für dein Helfer-Abzeichen.</p>
      ${auswaerts.length ? auswaerts.map((evs) => {
        const s0 = evs[0];
        const a = angebot(s0.id);
        const ids = evs.map((e) => e.id).join(",");
        return `<div class="portal-termin">
          <div class="title">🚌 ${fmtDate(s0.start)}${s0.location ? " · " + esc(s0.location) : ""}</div>
          <div class="sub">${evs.length > 1 ? `${evs.length} Spiele: ` : ""}${spieleText(evs)}</div>
          ${ortZeile(s0)}
          ${a && a.seats ? `<div class="sub">Dein Angebot: <strong>${a.seats} Plätze</strong>${a.phone ? " · " + esc(a.phone) : ""}</div>` : `<div class="sub">Noch kein Angebot von dir.</div>`}
          <div class="portal-fahrer">
            <select data-fseats="${s0.id}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
              `<option value="${n}" ${a && a.seats === n ? "selected" : ""}>${n === 0 ? "kein Angebot" : n + " Plätze"}</option>`).join("")}</select>
            <input data-fphone="${s0.id}" placeholder="Mobilnummer für Rückfragen" value="${esc(a ? a.phone : "")}">
            <button class="btn sm" data-fsave="${s0.id}" data-fids="${ids}">Speichern</button>
          </div>
        </div>`;
      }).join("") : `<p class="soft">Keine anstehenden Auswärtsspiele.</p>`}
      </div>
      <div class="card"><h3>🙌 Heimspiel-Jobs</h3>
      <p class="soft">Offene Aufgaben rund um unsere Heimspiele – einfach übernehmen, das Trainerteam sieht deinen Namen.</p>
      ${heim.length ? heim.map((evs) => {
        const s0 = evs[0];
        const jobs = (d.jobs || []).filter((j) => evs.some((e) => e.id === j.eventId));
        const zeit = (j) => evs.length > 1 ? ` <span class="soft">(${fmtTime((evs.find((e) => e.id === j.eventId) || s0).start)} Uhr)</span>` : "";
        const kats = Array.from(new Set(jobs.map((j) => j.category || "other")));
        return `<div class="portal-termin">
          <div class="title">🏟️ Heimspieltag ${fmtDate(s0.start)}${s0.location ? " · " + esc(s0.location) : ""}</div>
          <div class="sub">${evs.length > 1 ? `${evs.length} Spiele: ` : ""}${spieleText(evs)}</div>
          ${kats.map((k) => `<div class="sub" style="margin-top:4px">${JOB_KAT[k] || "📌"} ${esc(JOB_TEXT[k] || JOB_TEXT.other)}</div>`).join("")}
          <div class="list" style="margin-top:8px">
          ${jobs.map((j) => `<div class="list-item"><div class="grow">
              <div class="title" style="font-size:.9rem">${JOB_KAT[j.category] || "📌"} ${esc(j.title)}${zeit(j)}${jobDauer(j)}</div>
              ${j.meiner ? `<div class="sub">Du hast diesen Job übernommen – danke! 💪</div>` : ""}
            </div>
            ${j.meiner ? `<button class="btn sm ghost" data-jobab="${j.id}">Abgeben</button>`
                       : `<button class="btn sm" data-job="${j.id}">Übernehmen</button>`}
          </div>`).join("")}
          </div>
          ${helferZeile(evs.map((e) => e.id))}
        </div>`;
      }).join("") : `<p class="soft">Aktuell sind keine offenen Jobs eingetragen.</p>`}
      </div>`;
  }

  function tabKleidung() {
    const d = P.daten;
    const STATUS_BADGE = { offen: "warn", bestellt: "info", geliefert: "good" };
    const artikel = (id) => d.kleidung.find((c) => c.id === id);
    return `
      ${d.kleidungAnfragen.length ? `<div class="card"><h3>📦 Deine Anfragen</h3><div class="list">
        ${d.kleidungAnfragen.map((r) => {
          const a = artikel(r.itemId);
          return `<div class="list-item"><div class="grow">
            <div class="title">${esc(a ? a.name : "Artikel")} · Gr. ${esc(r.size)} · ${r.qty}×</div>
            <div class="sub">für ${esc(spielerName(r.playerId))}</div></div>
            <span class="badge ${STATUS_BADGE[r.status] || ""}">${esc(r.status)}</span></div>`;
        }).join("")}
      </div></div>` : ""}
      <div class="card"><h3>👕 Vereinskleidung anfordern</h3>
      ${d.kleidung.map((c) => `
        <div class="portal-termin">
          ${c.bild ? `<img src="${c.bild}" alt="${esc(c.name)}" style="width:100%;max-width:220px;border-radius:10px;margin-bottom:8px">` : ""}
          <div class="title">${esc(c.name)} <span class="badge accent">${fmtMoney ? fmtMoney(c.price) : c.price + " €"}</span></div>
          <div class="sub">${esc(c.description)}</div>
          <div class="portal-fahrer">
            ${d.spieler.length > 1 ? `<select data-kpid="${c.id}">${d.spieler.map((sp) =>
              `<option value="${sp.id}">${esc(sp.name)}</option>`).join("")}</select>` : ""}
            <select data-ksize="${c.id}">${(c.sizes || []).map((s) => `<option>${esc(s)}</option>`).join("")}</select>
            <select data-kqty="${c.id}">${[1, 2, 3].map((n) => `<option value="${n}">${n}×</option>`).join("")}</select>
            <button class="btn sm" data-korder="${c.id}">Anfordern</button>
          </div>
        </div>`).join("")}
      <p class="soft" style="font-size:.75rem;margin:12px 0 0">Kleingedrucktes: Vereinskleidung – insbesondere
      Trikots – bleibt Eigentum des SKV Müritz. Ein Trikot darf nur so lange behalten werden, wie aktiv in der
      Abteilung Volleyball gespielt wird; beim Ausscheiden ist es an das Trainerteam zurückzugeben.
      Beschädigungen oder Verlust bitte dem Trainerteam melden.</p>
      </div>`;
  }

  function tabKontakt() {
    const d = P.daten;
    const eltern = istEltern();
    const feld = (k, label, val, typ) => `<div class="field"><label>${label}</label>
      <input type="${typ || "text"}" name="${k}" value="${esc(val || "")}"></div>`;
    return `
      ${d.kontakte.map((k) => `<div class="card"><h3>👤 ${esc(k.firstName)} ${esc(k.lastName)}</h3>
        <form data-kontakt="${k.id}"><div class="form-grid">
          ${eltern ? feld("parentName", "Erziehungsberechtigte/r 1", k.parentName) : ""}
          ${eltern ? feld("parent2Name", "Erziehungsberechtigte/r 2", k.parent2Name) : ""}
          ${eltern ? feld("parentEmail", "E-Mail (Eltern)", k.parentEmail, "email") : ""}
          ${eltern ? feld("parentPhone", "Mobil (Eltern)", k.parentPhone, "tel") : ""}
          ${feld("playerEmail", eltern ? "E-Mail (Spieler:in)" : "Deine E-Mail", k.playerEmail, "email")}
          ${feld("playerPhone", eltern ? "Mobil (Spieler:in)" : "Deine Mobilnummer", k.playerPhone, "tel")}
        </div><button class="btn sm" style="margin-top:10px">Änderungen speichern</button></form>
      </div>`).join("")}
      ${d.spieler.map((sp) => `
      <div class="card"><h3>🖼️ Profilbild – ${esc(sp.name)}</h3>
        <div class="flex" style="gap:14px;align-items:center;margin-bottom:10px">
          <div class="profil-vorschau">${sp.foto ? `<img src="${sp.foto}" alt="">` : `<span>${esc(sp.avatarEmoji || "🏐")}</span>`}</div>
          <p class="soft" style="margin:0;font-size:.85rem">Such dir ein Emoji aus – oder lade ein echtes Foto hoch
          (das Foto gewinnt, solange eines gesetzt ist).</p>
        </div>
        <div class="quiz-optionen" style="margin-top:0">
          ${["🏐", "😀", "😎", "🤩", "😜", "🥳", "🦁", "🐯", "🦊", "🐼", "🐸", "🦈", "🦅", "🦄", "🐉", "🔥", "⚡", "🌊", "🌟", "🚀", "🎯", "🏆", "💪", "👑"].map((e2) =>
            `<button class="quiz-opt ${sp.avatarEmoji === e2 ? "gewaehlt" : ""}" data-avemoji="${e2}" data-avpid="${sp.id}">${e2}</button>`).join("")}
        </div>
        <div class="portal-fahrer" style="margin-top:10px">
          <input type="file" data-fotodatei="${sp.id}" accept="image/*" style="flex:1;min-width:150px">
          <button class="btn sm" data-fotoup="${sp.id}">📷 Foto hochladen</button>
          ${sp.foto ? `<button class="btn sm ghost" data-fotoweg="${sp.id}">🗑️ Foto entfernen</button>` : ""}
        </div>
      </div>`).join("")}
      <div class="card"><h3>🏖 Abwesenheit melden</h3>
        <p class="soft">Krank, Klassenfahrt, Ferien? Kurz eintragen – Termine im Zeitraum werden automatisch
        abgesagt und das Trainerteam sieht den Grund.</p>
        ${(d.abwesenheiten || []).length ? `<div class="list" style="margin-bottom:10px">
          ${d.abwesenheiten.map((a) => `<div class="list-item" style="padding:8px 10px"><div class="grow">
            <div class="title" style="font-size:.88rem">🏖 ${esc(a.grund)}${d.spieler.length > 1 ? ` · ${esc(spielerName(a.playerId))}` : ""}</div>
            <div class="sub">${fmtDateShort(a.von)} – ${fmtDateShort(a.bis)}</div></div>
            ${a.eigene ? `<button class="btn sm ghost" data-abwdel="${a.id}" title="Abwesenheit zurücknehmen">🗑️</button>` : ""}
          </div>`).join("")}</div>` : ""}
        <form id="abwForm" class="portal-fahrer" style="align-items:flex-end">
          ${d.spieler.length > 1 ? `<select name="playerId">${d.spieler.map((sp) => `<option value="${sp.id}">${esc(sp.name)}</option>`).join("")}</select>` : ""}
          <label style="display:flex;flex-direction:column;font-size:.72rem;color:#64748b;gap:2px">von
            <input type="date" name="von" required></label>
          <label style="display:flex;flex-direction:column;font-size:.72rem;color:#64748b;gap:2px">bis
            <input type="date" name="bis" required></label>
          <input name="grund" list="abwGruende" placeholder="Betreff, z. B. Klassenfahrt" required style="min-width:160px">
          <datalist id="abwGruende"><option>krank</option><option>Klassenfahrt</option><option>Ferien</option><option>Urlaub</option><option>Schule</option><option>verletzt</option></datalist>
          <button class="btn sm">Melden</button>
        </form>
      </div>
      <div class="card"><h3>📅 Termine in deinen Kalender</h3>
        <p class="soft">Alle Trainings und Spiele in deiner Kalender-App – einmalig als Datei oder als
        <strong>Abo, das sich automatisch aktualisiert</strong>.</p>
        <div class="portal-fahrer">
          <a class="btn sm" style="text-decoration:none" href="/api/portal/kalender.ics">⬇️ Exportieren (.ics)</a>
          <button class="btn sm ghost" data-kalabo>🔄 Kalender-Abo einrichten</button>
        </div>
        <div id="kalAboBox" hidden style="margin-top:10px">
          <p class="soft" style="font-size:.8rem;margin:0 0 6px"><strong>iPhone:</strong> Link unten antippen → „Abonnieren".
          <strong>Google Kalender:</strong> „Weitere Kalender ＋ → Per URL" und die Adresse einfügen.
          Neue Termine erscheinen dann automatisch.</p>
          <p style="margin:0 0 8px"><a id="kalWebcal" href="#">📲 Abo direkt öffnen (webcal)</a></p>
          <div class="portal-fahrer">
            <input id="kalAboUrl" readonly onclick="this.select()">
            <button class="btn sm ghost" data-kalkopie>📋 Kopieren</button>
          </div>
        </div>
      </div>
      ${einwKarte()}
      ${rwElternKonto()}${rwSpielerKonto()}
      <div class="card"><h3>🎟️ Weiteren Einladungscode einlösen</h3>
        <p class="soft">${eltern ? "Du hast mehrere Kinder im Verein? Löse hier den Code für das weitere Kind ein – dann siehst du alle in einem Konto." : "Hier kannst du einen weiteren Code mit deinem Konto verknüpfen."}</p>
        <form id="portalCode" class="portal-fahrer">
          <input name="code" placeholder="XXXX-XXXX-XXXX" required>
          <button class="btn sm">Einlösen</button>
        </form>
      </div>
      ${(() => {
        const b = d.benachrichtigungen || { prefs: {}, emailAdressen: [], mailMoeglich: false };
        const pr = b.prefs || {};
        const adr = b.emailAdressen || [];
        const mailSub = !adr.length ? "Keine E-Mail-Adresse hinterlegt – im Profil oben ergänzen"
          : !b.mailMoeglich ? "an " + adr.join(", ") + " · Versand wird noch eingerichtet"
          : "an " + adr.join(", ");
        const tog = (key, titel, sub) => `<button class="toggle-item ${pr[key] ? "an" : ""}" data-notify="${key}" aria-pressed="${pr[key] ? "true" : "false"}">
          <span class="check">✓</span>
          <div class="g"><div class="t">${titel}</div><div class="s">${sub}</div></div></button>`;
        return `<div class="card"><h3>🔔 Benachrichtigungen</h3>
        <p class="soft">Push auf dieses Gerät${istIosOhneApp() ? " (am iPhone zuerst als App installieren: Teilen → „Zum Home-Bildschirm“)" : ""}:</p>
        <div class="portal-fahrer" style="margin-bottom:4px">
          ${P.pushAktiv
            ? `<span class="badge good">auf diesem Gerät aktiv</span>
               <button class="btn sm ghost" data-pushprobe>Probe senden</button>
               <button class="btn sm ghost" data-pushaus>Gerät abmelden</button>`
            : `<button class="btn sm" data-pushan>🔔 Push aktivieren</button>`}
        </div>
        <div class="menu" style="margin-bottom:0">
          ${tog("pushAllgemein", "📣 Ankündigungen", "Allgemeine Neuigkeiten des Trainerteams")}
          ${tog("pushTeilnahme", "📅 Termin-Teilnahme", "Erinnerungen zum Rückmelden &amp; Absagen von Terminen")}
          ${tog("email", "✉️ Zusätzlich per E-Mail", mailSub)}
        </div></div>`;
      })()}
      ${window.Passkey && Passkey.moeglich() && P.passkeys && P.passkeys.erlaubt !== false ? `<div class="card"><h3>🔐 Anmeldung ohne Passwort</h3>
        <p class="soft">${P.passkeyWort || "Face ID / Fingerabdruck"} statt Passwort – ein Passkey je Gerät.
        ${istIosOhneApp() ? "<br>Tipp: Als App installiert (Teilen → „Zum Home-Bildschirm“) klappt es am zuverlässigsten." : ""}</p>
        ${(P.passkeys.passkeys || []).length ? `<div class="list" style="margin-bottom:10px">
          ${P.passkeys.passkeys.map((k) => `<div class="list-item" style="padding:8px 10px"><div class="grow">
            <div class="title" style="font-size:.88rem">🔐 ${esc(k.geraet || "Gerät")}</div>
            <div class="sub">eingerichtet ${fmtDateShort(new Date(k.seit * 1000).toISOString())}${k.zuletzt ? ` · zuletzt ${fmtDateShort(new Date(k.zuletzt * 1000).toISOString())}` : ""}</div></div>
            <button class="btn sm ghost" data-pkweg="${k.id}" title="Passkey entfernen">🗑️</button></div>`).join("")}
        </div>` : `<p class="soft" style="font-size:.82rem">Noch kein Passkey eingerichtet.</p>`}
        <button class="btn sm" data-pkneu>🔐 Auf diesem Gerät einrichten</button>
      </div>` : ""}
      <div class="card">
        <button class="btn secondary" id="portalAbmelden">Abmelden</button>
        <p class="soft" style="font-size:.78rem;margin:12px 0 0;text-align:center">
          <a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a> ·
          <a href="/impressum" target="_blank" rel="noopener">Impressum</a></p>
      </div>`;
  }

  // ---------- Rückenwind: Eltern → Spieler:in (privat, Opt-in, nur positiv) ----------
  const RW_EMOJI = ["👏", "💪", "🔥", "❤️", "🙌"];
  const RW_REAKT = ["👍", "❤️", "🙌"];
  function rwFormular(pid, terminId, kopf) {
    const rw = P.daten.rueckenwind || {};
    const key = `${pid}|${terminId || "frei"}`;
    return `<div class="portal-termin" data-rwform="${key}" data-rwpid="${pid}" data-rwtermin="${terminId || ""}">
      ${kopf}
      <div class="sub" style="margin:6px 0 4px">Bis zu zwei Dinge, die dir aufgefallen sind:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${(rw.kacheln || []).map((k) => `<button class="btn sm ghost" data-rwkachel="${esc(k)}">${esc(k)}</button>`).join("")}</div>
      <div class="field" style="margin-top:8px"><input data-rwtext maxlength="140" placeholder="Optional ein Satz: „Mir ist aufgefallen, dass du …“"></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${RW_EMOJI.map((e) => `<button class="btn sm ghost" data-rwemoji="${e}" style="font-size:1.1rem">${e}</button>`).join("")}
        <span class="spacer"></span><button class="btn sm" data-rwsenden>💬 Senden</button>
      </div>
    </div>`;
  }
  function rwElternStart() {
    if (!istEltern()) return "";
    const rw = P.daten.rueckenwind; if (!rw) return "";
    const d = P.daten;
    const bloecke = [];
    d.spieler.forEach((sp) => {
      const k = (rw.kinder || {})[sp.id]; if (!k) return;
      if (k.status !== "an" && k.status !== "offen") return;
      const offen = (k.fenster || []).filter((f) => !f.gesendet).slice(0, 2);
      offen.forEach((f) => bloecke.push(rwFormular(sp.id, f.terminId,
        `<div class="title">💬 Rückenwind für ${esc(sp.name.split(" ")[0])}</div>
         <div class="sub">${f.typ === "training" ? "🏐" : "🏆"} ${esc(f.titel)} · ${fmtDateShort(f.start)}${k.status === "offen" ? ' · <span class="badge warn">wartet auf Freigabe</span>' : ""}</div>`)));
    });
    if (!bloecke.length) return "";
    return `<div class="card" id="rwKarte"><h3>💬 Rückenwind</h3>
      <p class="soft" style="margin-top:0">Eine kurze, konkrete Rückmeldung nach dem Termin – nur Positives, nichts zum Ergebnis. Sieht nur dein Kind.</p>
      ${bloecke.join("")}</div>`;
  }
  function rwElternKonto() {
    if (!istEltern()) return "";
    const rw = P.daten.rueckenwind; if (!rw) return "";
    const d = P.daten;
    const STATUS = { an: ["aktiv", "good"], offen: ["wartet auf Freigabe", "warn"], aus: ["derzeit nicht aktiviert", ""], "kein-konto": ["kein Spielerkonto", ""] };
    const frei = d.spieler.filter((sp) => { const k = (rw.kinder || {})[sp.id]; return k && (k.status === "an" || k.status === "offen") && k.einfachSoMoeglich; });
    return `<div class="card"><h3>💬 Rückenwind</h3>
      <p class="soft" style="margin-top:0">Wertschätzung an dein Kind – privat, freiwillig, jederzeit von der Spieler:in abschaltbar.</p>
      ${d.spieler.map((sp) => { const k = (rw.kinder || {})[sp.id] || { status: "kein-konto" }; const b = STATUS[k.status] || STATUS.aus;
        return `<div class="sub">${esc(sp.name)}: <span class="badge ${b[1]}">${b[0]}</span></div>`; }).join("")}
      ${frei.map((sp) => rwFormular(sp.id, null, `<div class="title">Einfach so – für ${esc(sp.name.split(" ")[0])}</div><div class="sub">einmal pro Woche, unabhängig von Terminen</div>`)).join("")}
      ${(rw.gesendet || []).length ? `<div class="list" style="margin-top:10px">${rw.gesendet.map((x) => `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:3px">
          <div class="sub">${fmtDateShort(x.at)} · ${esc(spielerName(x.playerId))}${x.terminTitel ? " · " + esc(x.terminTitel) : " · einfach so"}${x.status === "wartet" ? ' · <span class="badge warn">wartet</span>' : ""}</div>
          <div style="font-size:.9rem">${(x.kacheln || []).map((k) => `<span class="badge good">${esc(k)}</span>`).join(" ")} ${esc(x.text || "")} ${esc(x.emoji || "")}</div>
          ${x.reaktion || x.antwort ? `<div class="sub">↩️ ${esc(x.reaktion || "")} ${esc(x.antwort || "")}</div>` : ""}
        </div>`).join("")}</div>` : ""}
    </div>`;
  }
  function rwSpielerStart() {
    if (istEltern()) return "";
    const rw = P.daten.rueckenwind; if (!rw) return "";
    const teile = [];
    (rw.anfragen || []).forEach((a) => teile.push(`<div class="list-item" style="gap:6px;padding:8px 10px">
      <div class="grow"><div class="title" style="font-size:.88rem">${esc(a.name)} möchte dir Rückenwind schicken</div>
        <div class="sub">kurze positive Rückmeldungen · nur du siehst sie · jederzeit abschaltbar</div></div>
      <button class="btn sm" data-rwerlauben="${a.userId}" data-ok="1">OK</button>
      <button class="btn sm ghost" data-rwerlauben="${a.userId}" data-ok="0">Nein</button></div>`));
    (rw.neu || []).forEach((x) => teile.push(`<div class="list-item rw-zeile" data-rwid="${x.id}" style="flex-wrap:wrap;gap:4px 8px;padding:8px 10px">
      <div class="grow" style="min-width:160px">
        <div style="font-size:.9rem;line-height:1.5">${(x.kacheln || []).map((k) => `<span class="badge good">${esc(k)}</span>`).join(" ")}${x.text ? ` „${esc(x.text)}“` : ""} ${esc(x.emoji || "")}</div>
        <div class="sub">${esc(x.vonName)} · ${x.terminTitel ? esc(x.terminTitel) + " · " : ""}${fmtDateShort(x.at)}</div></div>
      <div style="display:flex;gap:2px;align-items:center">
        ${RW_REAKT.map((r) => `<button class="btn sm ghost" data-rwreakt="${x.id}" data-r="${r}" style="padding:2px 6px;font-size:1rem">${r}</button>`).join("")}
        <button class="btn sm ghost" data-rwantwortzeigen="${x.id}" title="kurz antworten" style="padding:2px 6px">↩︎</button></div>
      <div data-rwantwortbox="${x.id}" style="flex-basis:100%;display:none;gap:6px">
        <input data-rwantwort="${x.id}" maxlength="140" placeholder="kurz antworten" style="flex:1">
        <button class="btn sm" data-rwantwortsenden="${x.id}">Senden</button></div>
    </div>`));
    if (!teile.length) return "";
    return `<div class="card rw-neu" id="rwKarte" style="padding:10px 12px"><h3 style="font-size:.95rem;margin:0 0 6px">💬 Rückenwind</h3><div class="list">${teile.join("")}</div></div>`;
  }
  // „Dein Jahr": Rückblick-PDF – Karte im Juni/Juli, Knopf immer im Konto-Tab
  function deinJahrKarte() {
    if (istEltern()) return "";
    const m = new Date().getMonth() + 1;
    if (m !== 6 && m !== 7) return "";
    return `<div class="card"><h3>🏐 Dein Jahr mit Volleyball</h3>
      <p class="soft" style="margin-top:0">Die Saison ist (fast) rum: Trainings, Spiele, Abzeichen, Quizpunkte und dein gesammelter Rückenwind auf einer Seite – zum Behalten und Teilen.</p>
      <a class="btn" style="text-decoration:none" href="/api/portal/dein-jahr.pdf${m === 7 ? "?saison=vorige" : ""}" target="_blank" rel="noopener">📄 PDF öffnen</a></div>`;
  }

  function rwSpielerKonto() {
    if (istEltern()) return "";
    const rw = P.daten.rueckenwind; if (!rw) return "";
    return `<div class="card"><h3>💬 Rückenwind</h3>
      <p class="soft" style="margin-top:0">Deine Eltern können dir nach Terminen kurze, positive Rückmeldungen schicken. Nur du siehst sie. Du bestimmst, ob und von wem.</p>
      <p style="margin:0 0 8px"><a class="btn sm outline" style="text-decoration:none" href="/api/portal/dein-jahr.pdf" target="_blank" rel="noopener">📄 Dein Jahr mit Volleyball (Saisonrückblick als PDF)</a></p>
      <button class="toggle-item ${rw.an ? "an" : ""}" data-rwan aria-pressed="${rw.an ? "true" : "false"}"><span class="check">✓</span>
        <div class="g"><div class="t">Rückenwind empfangen</div><div class="s">${rw.an ? "an – Eltern können nach Freigabe schicken" : "aus – niemand kann dir Rückenwind schicken"}</div></div></button>
      ${(rw.sammlung || []).length ? `<div class="sub" style="margin-top:10px">Deine Sammlung (${rw.sammlung.length})</div><div class="list">${rw.sammlung.map((x) => `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:2px">
        <div class="sub">${fmtDateShort(x.at)} · von ${esc(x.vonName)}${x.terminTitel ? " · " + esc(x.terminTitel) : ""}${x.reaktion ? " · " + esc(x.reaktion) : ""}</div>
        <div style="font-size:.9rem">${(x.kacheln || []).map((k) => `✨ ${esc(k)}`).join(" · ")}${x.text ? ` „${esc(x.text)}“` : ""} ${esc(x.emoji || "")}</div></div>`).join("")}</div>` : ""}
    </div>`;
  }

  // ---------- Push-Nachfrage beim Öffnen (Eltern) ----------
  function pushNachfragen() {
    const ios = istIosOhneApp();
    U.modal({
      title: "🔔 Mitteilungen einschalten?",
      body: `<p class="soft" style="margin-top:0">Absagen, Terminänderungen, gesuchte Helfer:innen und Antworten des Trainerteams kommen dann sofort aufs Handy – ohne die App öffnen zu müssen.</p>
        ${ios ? `<p class="soft"><strong>iPhone:</strong> Dafür muss die App zuerst installiert sein: Teilen-Menü → „Zum Home-Bildschirm“. Danach hier einmal auf „Einschalten“ tippen.</p>` : ""}`,
      footer: `<button class="btn ghost" data-x>Später</button>${ios ? "" : `<button class="btn" data-pushjetzt>🔔 Jetzt einschalten</button>`}`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = U.closeModal;
        const b = m.querySelector("[data-pushjetzt]");
        if (b) b.onclick = async () => {
          U.closeModal();
          await pushAktivieren();
          P.pushAktiv = !!(await pushAbo());
          render();
        };
      },
    });
  }

  // ---------- Countdown bis zum Spiel, Kompakttabelle, Eltern-Abzeichen ----------
  function countdownText(start) {
    const diff = new Date(start) - Date.now();
    if (diff <= 0) return diff > -3 * 3600000 ? "⏱️ läuft" : "vorbei";
    const min = Math.floor(diff / 60000), h = Math.floor(min / 60), tage = Math.floor(h / 24);
    if (tage >= 2) return `⏳ noch ${tage} Tage`;
    if (tage === 1) return `⏳ noch 1 Tag ${h - 24} Std`;
    if (h >= 1) return `⏳ noch ${h} Std ${min - h * 60} Min`;
    return `⏳ noch ${min} Min`;
  }
  const JOB_KAT = { catering: "🥗", helper: "🙌", other: "📌" };
  const jobDauer = (j) => !j.dauerMin ? "" : ` <span class="soft">⏱️ ${j.dauerMin >= 300 ? "ganzer Spieltag" : j.dauerMin >= 60 ? "ca. " + (j.dauerMin / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Std" : "ca. " + j.dauerMin + " Min"}</span>`;
  const helferZeile = (eventIds) => {
    const h = eventIds.flatMap((eid) => (P.daten.helfer || {})[eid] || []);
    if (!h.length) return "";
    const seen = new Set();
    return `<div class="sub" style="margin-top:6px">🤝 Mit dir dabei: ${h.filter((x) => { const k = x.name + "|" + x.job; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((x) => `<strong>${esc(x.name)}</strong> (${esc(x.job)})`).join(", ")} – sprecht euch gern ab.</div>`;
  };
  const JOB_TEXT = {
    catering: "Kuchen, Brötchen, Getränke: Mit dem Buffet finanzieren wir Bälle, Netze und Trikots – und Gäste wie Spieler lieben es.",
    helper: "Auf- und Abbau, Kampfgericht, Einlass, Anschreiben: Ohne helfende Hände findet kein Heimspiel statt.",
    other: "Kleine Aufgabe, große Wirkung – jede Hilfe entlastet das Trainerteam und die Mannschaft.",
  };
  function tabelleKompakt() {
    const rows = P.daten.tabelle || [];
    if (!rows.length) return "";
    const wir = rows.map((r, i) => ({ r, i })).filter((x) => /skv|müritz|mueritz/i.test(x.r.team || ""));
    if (!wir.length) return "";
    const zeigen = new Set();
    wir.forEach((x) => [x.i - 1, x.i, x.i + 1].forEach((k) => { if (k >= 0 && k < rows.length) zeigen.add(k); }));
    const liste = Array.from(zeigen).sort((a, b) => a - b);
    return `<div class="card"><h3>📊 Tabelle${P.daten.tabelleMeta && P.daten.tabelleMeta.liga ? " · " + esc(P.daten.tabelleMeta.liga) : " Verbandsliga MV"}</h3>
      <div class="portal-tabelle"><table><tbody>
        ${liste.map((k, idx) => { const r = rows[k]; const uns = /skv|müritz|mueritz/i.test(r.team || "");
          return `${idx > 0 && liste[idx - 1] !== k - 1 ? '<tr><td colspan="4" class="soft" style="text-align:center">…</td></tr>' : ""}
          <tr class="${uns ? "wir" : ""}"><td><strong>${k + 1}.</strong></td><td>${uns ? "🏐 " : ""}${esc(r.team || "")}</td>
          <td>${r.games == null ? "" : r.games + " Sp."}</td><td><strong>${r.points == null ? "" : r.points + " Pkt."}</strong></td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="soft" style="font-size:.78rem;margin-bottom:0">${wir.map((x) => `<strong>${esc(x.r.team)}</strong>: Platz ${x.i + 1} von ${rows.length}`).join(" · ")} · <a href="#" data-gehtab="termine">ganze Tabelle</a></p>
    </div>`;
  }
  function elternAbzeichenKarte() {
    const ea = P.daten.elternAbzeichen;
    if (!ea) return "";
    const n = ea.naechstes;
    return `<div class="card"><h3>🏅 Deine Helfer-Abzeichen</h3>
      ${ea.erhalten.length ? `<div class="list">${ea.erhalten.map((a) => `<div class="list-item" style="padding:6px 8px"><span style="font-size:1.4rem">${esc(a.emoji)}</span>
        <div class="grow"><div class="title" style="font-size:.88rem">${esc(a.name)}</div><div class="sub">${esc(a.text)}</div></div></div>`).join("")}</div>`
        : `<p class="soft" style="margin-top:0">Noch keins – aber das erste ist nah: Ein übernommener Heimspiel-Job oder eine Auswärtsfahrt genügt. 💪</p>`}
      <p class="soft" style="font-size:.82rem;margin-bottom:0">Bisher: <strong>${ea.jobs}</strong> Heimspiel-Job(s) · <strong>${ea.fahrten}</strong> Auswärtsfahrt(en).
      ${n ? ` Nächstes Abzeichen: ${esc(n.emoji)} <strong>${esc(n.name)}</strong> – noch ${n.fehlt} ${esc(n.text)}.` : " Alle Abzeichen geholt – Wahnsinn! 🏆"}
      <a href="#" data-gehtab="mithelfen">Mithelfen</a></p>
    </div>`;
  }

  // ---------- Einverständnis: Status je Erklärung, Upload (Eltern), digitale Bestätigung ----------
  const EINW_STATUS = { ja: ["✅ zugestimmt", "good"], nein: ["❌ nicht zugestimmt", "bad"],
    offen: ["⏳ offen", "warn"], abgelaufen: ["🔁 erneuern (Vorsaison)", "warn"] };
  function einwVon(pid) { return (P.daten.einverstaendnis || []).find((e) => e.playerId === pid) || { vorlagen: [], vollstaendig: true }; }
  function einwKarte() {
    const d = P.daten;
    const eltern = istEltern();
    const vorlagen = d.vorlagen || [];
    return `<div class="card" id="einwKarte"><h3>📝 Einverständniserklärung</h3>
      <p class="soft">${eltern
        ? "Je Erklärung zählt deine Entscheidung einzeln. Am einfachsten <strong>digital bestätigen</strong> – ohne Papier, mit Passwort oder Face ID als Unterschrift. Alternativ das unterschriebene Formular als PDF oder Foto hochladen."
        : "Die Erklärungen geben deine Eltern über ihr Elternkonto ab – hier siehst du den Stand."}</p>
      ${d.spieler.map((sp) => {
        const st = einwVon(sp.id);
        const kontakt = (d.kontakte || []).find((k) => k.id === sp.id) || {};
        return `<div class="portal-termin" data-einwsp="${sp.id}">
          <div class="title" style="font-size:.95rem">${esc(sp.name)}
            ${st.vollstaendig ? '<span class="badge good">✓ vollständig</span>' : st.eingereicht ? '<span class="badge info">eingereicht – wird geprüft</span>' : '<span class="badge warn">fehlt noch</span>'}</div>
          <div class="list" style="margin:8px 0">
            ${(st.vorlagen || []).map((v) => `<div class="list-item" style="padding:6px 8px"><div class="grow">
              <div class="title" style="font-size:.86rem">${esc(v.name)} ${v.required ? '<span class="badge bad">Pflicht</span>' : ""}</div>
              ${v.datum ? `<div class="sub">${fmtDateShort(v.datum)}${v.quelle === "digital" ? " · digital" : ""}</div>` : ""}</div>
              <span class="badge ${EINW_STATUS[v.status][1]}">${EINW_STATUS[v.status][0]}</span></div>`).join("")}
          </div>
          ${st.beleg ? `<div class="sub">zuletzt: ${st.beleg.dokumentId && st.beleg.quelle === "digital" && eltern ? `<a href="/api/dokumente/${st.beleg.dokumentId}/datei" target="_blank" rel="noopener">📎 ${esc(st.beleg.fileName)}</a>` : esc(st.beleg.fileName || "")}${st.beleg.uploadedAt ? " · " + fmtDateShort(st.beleg.uploadedAt) : ""}</div>` : ""}
          ${eltern && vorlagen.length ? (() => { const abgegeben = (st.vorlagen || []).some((v) => v.status === "ja" || v.status === "nein");
            const wahl = (tid) => ((st.vorlagen || []).find((v) => v.id === tid) || {}).status;
            return `<details class="einw-digital" style="margin-top:10px" ${st.vollstaendig ? "" : "open"}>
            <summary class="btn sm ${abgegeben ? "outline" : ""}" style="display:inline-block;cursor:pointer">${abgegeben ? "✍️ Erklärungen ändern oder widerrufen" : "✍️ Digital bestätigen (ohne Papier)"}</summary>
            <div style="margin-top:10px">
              <p class="soft" style="font-size:.84rem">${abgegeben
                ? "Du kannst jede Entscheidung jederzeit ändern oder eine Einwilligung widerrufen – einfach neu auswählen und erneut bestätigen. Es gilt immer die neueste Abgabe; der Widerruf wirkt ab sofort für die Zukunft, ein neuer PDF-Nachweis wird gespeichert."
                : "Jede Erklärung lesen und entscheiden. Die Bestätigung mit Passwort oder Face ID / Fingerabdruck gilt wie eine Unterschrift; ein PDF-Nachweis wird für dich und das Trainerteam gespeichert. Jede Einwilligung ist freiwillig und jederzeit widerrufbar."}</p>
              ${vorlagen.map((t) => `<div class="portal-termin" style="margin:8px 0">
                <div class="title" style="font-size:.9rem">${esc(t.name)} ${t.required ? '<span class="badge bad">Pflicht</span>' : '<span class="badge">optional</span>'}${t.gueltigkeit === "saison" ? ' <span class="badge warn">je Saison</span>' : ""}</div>
                <details style="margin:4px 0"><summary class="soft" style="cursor:pointer;font-size:.82rem">📄 Text lesen</summary><p style="font-size:.84rem;white-space:pre-line;margin:6px 0 0">${esc(t.text)}</p></details>
                <div class="rm-wahl" style="margin-top:6px">
                  <label class="btn sm outline" style="cursor:pointer"><input type="radio" name="ew_${sp.id}_${t.id}" value="ja" ${wahl(t.id) === "ja" ? "checked" : ""} style="width:auto;margin-right:6px">✅ Ich stimme zu</label>
                  <label class="btn sm ghost" style="cursor:pointer"><input type="radio" name="ew_${sp.id}_${t.id}" value="nein" ${wahl(t.id) === "nein" ? "checked" : ""} style="width:auto;margin-right:6px">❌ Ich stimme nicht zu</label>
                </div></div>`).join("")}
              <div class="field" style="margin-top:8px"><label>Name der erklärenden Person (Erziehungsberechtigte/r)</label>
                <input data-ewname="${sp.id}" value="${esc(kontakt.parentName || d.user.name)}" autocomplete="name"></div>
              <div class="field"><label>Passwort zur Bestätigung</label><input type="password" data-ewpw="${sp.id}" autocomplete="current-password" placeholder="dein Portal-Passwort"></div>
              <div class="portal-fahrer">
                <button class="btn sm" data-ewsenden="${sp.id}" data-art="passwort">🔏 Mit Passwort bestätigen</button>
                ${window.Passkey && Passkey.hier() ? `<button class="btn sm outline" data-ewsenden="${sp.id}" data-art="passkey">🔐 Mit ${P.passkeyWort || "Face ID / Fingerabdruck"} bestätigen</button>` : ""}
              </div>
            </div></details>`; })() : ""}
          ${eltern ? `<details style="margin-top:8px" data-upbereich="${sp.id}"><summary class="soft" style="cursor:pointer;font-size:.84rem">📎 Stattdessen unterschriebenes Formular hochladen (PDF oder Foto)</summary>
            <div class="field" style="margin-top:8px"><label>Was lädst du hoch?</label><select data-upart="${sp.id}">
              <option value="Sammel-Einverständniserklärung">📑 Sammel-Einverständniserklärung (alle Erklärungen)</option>
              ${vorlagen.map((t) => `<option value="${esc(t.name)}">📄 ${esc(t.name)} (einzeln)</option>`).join("")}
              <option value="Sonstiges Dokument">📎 Sonstiges (z. B. Attest, Widerruf)</option></select></div>
            <div class="field"><label>Unterschrieben von</label><input data-upname="${sp.id}" value="${esc(kontakt.parentName || d.user.name)}"></div>
            <div class="portal-fahrer">
              <input type="file" data-updatei="${sp.id}" accept="application/pdf,image/*" style="flex:1;min-width:150px">
              <button class="btn sm" data-upsenden="${sp.id}">⬆️ Hochladen</button>
            </div></details>` : ""}
        </div>`;
      }).join("")}
    </div>`;
  }

  // Ampel: offene Punkte des Kontos (Aufgaben, Einverständnis, Rückmeldungen der nächsten 7 Tage)
  function offenePunkte() {
    const d = P.daten; if (!d) return [];
    const heute = new Date().toISOString().slice(0, 10);
    const punkte = [];
    (d.aufgaben || []).filter((t) => !t.erledigt).forEach((t) => punkte.push({
      art: t.due && t.due < heute ? "rot" : "gelb", text: t.title,
      sub: t.due ? "fällig " + fmtDateShort(t.due) : "Aufgabe vom Trainerteam", tab: "start" }));
    (d.einverstaendnis || []).forEach((e) => {
      const sp = d.spieler.find((x) => x.id === e.playerId) || {};
      if (e.vollstaendig) return;
      if (e.eingereicht) punkte.push({ art: "gelb", text: `Einverständnis für ${sp.name || ""} wird geprüft`, sub: "vom Trainerteam gesichtet, sobald möglich", tab: "kontakt" });
      else punkte.push({ art: "rot", text: `Einverständniserklärung für ${sp.name || "dich"} fehlt`,
        sub: istEltern() ? "im Konto digital bestätigen oder hochladen" : "deine Eltern bestätigen sie im Elternkonto", tab: "kontakt" });
    });
    const termine = [...(d.trainings || []), ...(d.spiele || [])].filter((t) => !t.abgesagt);
    termine.forEach((t) => {
      const tage = (new Date(String(t.start).slice(0, 10)) - new Date(heute)) / 86400000;
      if (tage < 0 || tage > 7) return;
      const fehlt = d.spieler.filter((sp) => !((t.meine || {})[sp.id]));
      if (!fehlt.length) return;
      punkte.push({ art: "gelb", text: `Rückmeldung fehlt: ${t.title || "Termin"}`, sub: `${fmtDateShort(t.start)}${d.spieler.length > 1 ? " · " + fehlt.map((x) => x.name.split(" ")[0]).join(", ") : ""}`, tab: "termine", termin: t.id });
    });
    return punkte;
  }
  function ampelHTML() {
    const p = offenePunkte();
    const farbe = p.some((x) => x.art === "rot") ? "rot" : p.length ? "gelb" : "gruen";
    const titel = farbe === "gruen" ? "Alles erledigt" : `${p.length} offene${p.length === 1 ? "r Punkt" : " Punkte"}`;
    return `<button class="ampel ampel-${farbe}" data-ampel title="${titel}" aria-label="${titel}">${p.length ? p.length : "✓"}</button>`;
  }
  function ampelListe() {
    const p = offenePunkte();
    U.modal({
      title: p.length ? `🚦 ${p.length} offene${p.length === 1 ? "r Punkt" : " Punkte"}` : "🚦 Alles erledigt",
      body: p.length ? `<div class="list">${p.map((x, i) => `<button class="list-item" data-ampelgo="${i}" style="text-align:left;width:100%;background:none;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer">
          <span style="font-size:1.1rem">${x.art === "rot" ? "🔴" : "🟡"}</span>
          <div class="grow"><div class="title" style="font-size:.9rem">${esc(x.text)}</div><div class="sub">${esc(x.sub || "")}</div></div><span class="arr">›</span></button>`).join("")}</div>`
        : `<p class="soft">Keine offenen Aufgaben, alle Erklärungen liegen vor und die Termine der nächsten Woche sind beantwortet. 🟢</p>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = U.closeModal;
        m.querySelectorAll("[data-ampelgo]").forEach((b) => b.onclick = () => {
          const x = p[parseInt(b.dataset.ampelgo, 10)];
          U.closeModal(); P.tab = x.tab; render();
          setTimeout(() => {
            const ziel = x.termin ? document.querySelector(`[data-termin="${x.termin}"]`) : (x.tab === "kontakt" ? document.querySelector("#einwKarte") : null);
            if (ziel) { ziel.scrollIntoView({ behavior: "smooth", block: "center" }); ziel.classList.add("termin-blitz"); }
          }, 60);
        });
      },
    });
  }

  // ---------- Dokumente (vom Trainerteam freigegeben) ----------
  const DOK_ICON = (e) => ({ pdf: "📕", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", webp: "🖼️", gif: "🖼️", heic: "🖼️",
    doc: "📘", docx: "📘", odt: "📘", xls: "📗", xlsx: "📗", ods: "📗", ppt: "📙", pptx: "📙",
    zip: "🗜️", ics: "📅", csv: "📊", txt: "📄", md: "📄" }[e] || "📄");
  const dokGroesse = (b) => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  function tabDokumente() {
    const liste = P.dokumente || [];
    const ordner = {};
    liste.forEach((d) => { (ordner[d.ordner] = ordner[d.ordner] || []).push(d); });
    const neu = (d) => Date.now() / 1000 - d.seit < 14 * 86400;
    return `<div class="card"><h3>📁 Dokumente</h3>
      <p class="soft">Vom Trainerteam für dich freigegeben. Antippen öffnet die Datei – sie wird nur einmal geladen und danach auf dem Gerät behalten.</p></div>
      ${Object.keys(ordner).sort((a, b) => a.localeCompare(b, "de")).map((o) => `<div class="card"><h3>📂 ${esc(o)}</h3><div class="list">
        ${ordner[o].map((d) => `<a class="list-item" href="/api/dokumente/${d.id}/datei" target="_blank" rel="noopener"><div class="grow">
          <div class="title">${DOK_ICON(d.endung)} ${esc(d.name)} ${neu(d) ? '<span class="badge accent">neu</span>' : ""}</div>
          ${d.beschreibung ? `<div class="sub">${esc(d.beschreibung)}</div>` : ""}
          <div class="sub">${dokGroesse(d.groesse)} · ${fmtDateShort(new Date(d.seit * 1000).toISOString())}</div>
        </div><span class="arr">›</span></a>`).join("")}
      </div></div>`).join("")}`;
  }

  // ---------- Rahmen & Ereignisse ----------

  const TABS = () => [
    { id: "start", label: "Übersicht", icon: "🏠" },
    { id: "termine", label: "Termine", icon: "📅" },
    ...(istEltern() ? [{ id: "mithelfen", label: "Mithelfen", icon: "🤝" }] : []),
    // Vereinskleidung fordern Spieler:innen selbst an – für Eltern ausgeblendet
    ...(istEltern() ? [] : [{ id: "kleidung", label: "Kleidung", icon: "👕" }]),
    ...((P.dokumente || []).length ? [{ id: "dokumente", label: "Dokumente", icon: "📁" }] : []),
    { id: "wiki", label: "Wiki", icon: "📖" },
    { id: "kontakt", label: "Konto", icon: "⚙️" },
  ];

  function render() {
    const wrap = $("#portalRoot2");
    if (istEltern() && P.tab === "kleidung") P.tab = "start"; // Tab existiert für Eltern nicht
    const inhalt = { start: tabStart, termine: tabTermine, mithelfen: tabMithelfen,
                     kleidung: tabKleidung, wiki: tabWiki, kontakt: tabKontakt,
                     dokumente: tabDokumente }[P.tab] || tabStart;
    wrap.innerHTML = `
      <header class="portal-kopf">
        <div class="portal-logo"><svg viewBox="0 0 512 512" width="22" height="22" aria-hidden="true" style="vertical-align:-4px"><g fill="#F1662A"><path d="M346 64A213 213 0 0 0 105 405A55 55 0 0 0 187 330A300 300 0 0 1 346 64Z"/><path transform="rotate(180 256 256)" d="M346 64A213 213 0 0 0 105 405A55 55 0 0 0 187 330A300 300 0 0 1 346 64Z"/></g></svg> SKV Müritz Volleyball</div>
        <div class="portal-nutzer">${(() => {
          const sp = (P.daten.spieler || [])[0] || {};
          const bild = sp.foto ? `<img src="${sp.foto}" alt="" class="portal-kopf-avatar">`
            : sp.avatarEmoji ? `<span class="portal-kopf-avatar" style="font-size:1.15rem;background:#ffffff22">${esc(sp.avatarEmoji)}</span>` : "";
          return ampelHTML() + bild + esc(P.daten.user.name);
        })()}</div>
      </header>
      <main class="portal-inhalt">${inhalt()}</main>
      <nav class="portal-tabs">
        ${TABS().map((t) => `<button class="${P.tab === t.id ? "aktiv" : ""}" data-tab="${t.id}">
          <span>${t.icon}</span>${t.label}</button>`).join("")}
      </nav>`;
    verdrahten(wrap);
  }

  async function aktion(pfad, body, erfolg, voll) {
    if (P.busy) return;
    P.busy = true;
    const res = await api(pfad, body);
    P.busy = false;
    if (!res.ok) { toast(res.data.error || "Aktion fehlgeschlagen", "bad"); return; }
    if (erfolg) toast(erfolg, "good");
    await neuLaden(voll);
  }

  // Belohnung für Platz 1 der Wochen-Bestenliste: Schmetter-Show beim Tippen
  // aufs eigene Profilbild in der Kopfzeile
  function fuehrtBestenliste() {
    const liste = (P.quiz && P.quiz.bestenliste) || [];
    return !istEltern() && liste.length > 0 &&
      liste[0].name === P.daten.user.name && (liste[0].wochenPunkte || 0) > 0;
  }

  function schmetterShow() {
    if (document.getElementById("schmetterShow")) return;
    const o = document.createElement("div");
    o.id = "schmetterShow";
    o.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden";
    const W = innerWidth, H = innerHeight;
    const kx = Math.round(W * 0.34), ky = Math.round(H * 0.30); // Treffpunkt in der Luft
    o.innerHTML = `
      <svg id="smFigur" width="130" height="170" viewBox="0 0 130 170" style="position:absolute;left:${Math.round(W * 0.16)}px;top:${H}px">
        <g stroke="#F1662A" stroke-width="9" stroke-linecap="round" fill="none">
          <circle cx="60" cy="24" r="15" fill="#F1662A" stroke="none"/>
          <path d="M60 42 L56 96"/>
          <path id="smArm" d="M58 54 L88 16"/>
          <path d="M58 60 L32 84"/>
          <path d="M56 96 L36 130 L28 156"/>
          <path d="M56 96 L80 126 L76 154"/>
        </g></svg>
      <div id="smBall" style="position:absolute;left:${Math.round(W * 0.08)}px;top:${H}px;font-size:34px;line-height:1">🏐</div>
      <div id="smText" style="position:absolute;left:0;right:0;top:22%;text-align:center;font-weight:800;font-size:1.55rem;color:#F1662A;opacity:0;text-shadow:0 2px 12px rgba(0,0,0,.45)">👑 Nummer 1 im Quiz!</div>`;
    document.body.appendChild(o);
    const fig = o.querySelector("#smFigur"), ball = o.querySelector("#smBall"),
          arm = o.querySelector("#smArm"), text = o.querySelector("#smText");
    // 1) Zuspiel: Ball steigt im Bogen zum Treffpunkt, Figur springt hinterher
    ball.animate([
      { transform: "translate(0,0) rotate(0deg)" },
      { transform: `translate(${kx - W * 0.08}px, ${ky - H - 40}px) rotate(260deg)` },
    ], { duration: 900, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" });
    fig.animate([
      { transform: "translate(0,0)" },
      { transform: `translate(0, ${ky - H + 30}px)` },
    ], { duration: 700, delay: 250, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
    setTimeout(() => {
      // 2) Der Schmetterschlag: Arm klappt durch, Lichtblitz am Treffpunkt
      arm.setAttribute("d", "M58 54 L98 84");
      const blitz = document.createElement("div");
      blitz.style.cssText = `position:absolute;left:${kx}px;top:${ky}px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 30px 16px rgba(241,102,42,.8)`;
      o.appendChild(blitz);
      blitz.animate([{ transform: "scale(.3)", opacity: 1 }, { transform: "scale(5)", opacity: 0 }],
        { duration: 350, fill: "forwards" });
      // 3) Ball schießt steil nach unten rechts durch
      ball.animate([
        { transform: `translate(${kx - W * 0.08}px, ${ky - H - 40}px) rotate(260deg)` },
        { transform: `translate(${Math.round(W * 0.84) - W * 0.08}px, -30px) rotate(1000deg)` },
      ], { duration: 320, easing: "cubic-bezier(.6,0,1,.6)", fill: "forwards" });
      setTimeout(() => {
        // 4) Einschlag: Erschütterung, Explosion, Funkenregen, Jubel-Schriftzug
        document.body.animate([
          { transform: "translate(0,0)" }, { transform: "translate(-7px,5px)" },
          { transform: "translate(6px,-4px)" }, { transform: "translate(-3px,2px)" },
          { transform: "translate(0,0)" },
        ], { duration: 340 });
        const bx = Math.round(W * 0.84), by = H - 60;
        const boom = document.createElement("div");
        boom.style.cssText = `position:absolute;left:${bx}px;top:${by}px;font-size:44px;line-height:1`;
        boom.textContent = "💥";
        o.appendChild(boom);
        boom.animate([{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.9)", opacity: 0 }],
          { duration: 650, fill: "forwards" });
        for (let i = 0; i < 8; i++) {
          const s = document.createElement("div");
          s.textContent = "✨";
          s.style.cssText = `position:absolute;left:${bx}px;top:${by}px;font-size:18px;line-height:1`;
          o.appendChild(s);
          const wk = (i / 8) * 2 * Math.PI;
          s.animate([
            { transform: "translate(0,0)", opacity: 1 },
            { transform: `translate(${Math.round(Math.cos(wk) * 110)}px, ${Math.round(Math.sin(wk) * 110 - 40)}px)`, opacity: 0 },
          ], { duration: 800, easing: "ease-out", fill: "forwards" });
        }
        text.animate([
          { opacity: 0, transform: "scale(.6)" },
          { opacity: 1, transform: "scale(1.08)", offset: .3 },
          { opacity: 1, transform: "scale(1)", offset: .75 },
          { opacity: 0, transform: "scale(1)" },
        ], { duration: 1500, fill: "forwards" });
      }, 300);
    }, 950);
    setTimeout(() => o.remove(), 3100);
  }

  function verdrahten(wrap) {
    const nutzer = wrap.querySelector(".portal-nutzer");
    if (nutzer && fuehrtBestenliste()) {
      nutzer.style.cursor = "pointer";
      nutzer.title = "Du führst die Wochen-Bestenliste an – tipp drauf! 👑";
      nutzer.onclick = schmetterShow;
    }
    wrap.querySelectorAll("[data-tab]").forEach((b) => b.onclick = async () => {
      P.tab = b.dataset.tab;
      if (P.tab === "wiki" && !P.quiz) {
        render();
        const r = await api("/api/portal/quiz");
        if (r.ok) P.quiz = r.data;
      }
      render();
    });
    // Übersicht: ein Tipp auf einen Termin springt zum Termine-Tab und hebt ihn hervor
    wrap.querySelectorAll("[data-gehtab]").forEach((n) => n.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation(); P.tab = n.dataset.gehtab; render(); window.scrollTo(0, 0);
    });
    wrap.querySelectorAll("[data-gehzu]").forEach((n) => n.onclick = (ev) => {
      if (ev && ev.target && ev.target.closest("button, a, select, input")) return;
      const id = n.dataset.gehzu;
      P.tab = "termine";
      render();
      const ziel = document.querySelector(`[data-termin="${id}"]`);
      if (ziel) {
        ziel.scrollIntoView({ behavior: "smooth", block: "center" });
        ziel.classList.add("termin-blitz");
        setTimeout(() => ziel.classList.remove("termin-blitz"), 2400);
      }
    });
    wrap.querySelectorAll("[data-aufg]").forEach((cb) => cb.onchange = () => {
      if (cb.checked) volleyballFlug();
      aktion("/api/portal/aufgabe", { taskId: cb.dataset.aufg, erledigt: cb.checked },
        cb.checked ? "Stark – Aufgabe erledigt! ✅" : "Als offen markiert");
    });
    wrap.querySelectorAll("[data-quiz]").forEach((b) => b.onclick = () => quizAntwort(b.dataset.qid, parseInt(b.dataset.quiz, 10)));
    wrap.querySelectorAll("[data-qkap]").forEach((b) => b.onclick = () => { P.quizKapitel = parseInt(b.dataset.qkap, 10); render(); });
    wrap.querySelectorAll("[data-rsvp]").forEach((b) => b.onclick = () => {
      const status = b.dataset.status;
      if (status === "no" || status === "maybe") {
        // Erst kurz begründen, dann senden
        P.rsvpBegr = { eid: b.dataset.rsvp, pid: b.dataset.pid, status };
        render();
        const feld = wrap.querySelector("[data-rsvpgrund]") || document.querySelector("[data-rsvpgrund]");
        if (feld) feld.focus();
        return;
      }
      P.rsvpBegr = null;
      aktion("/api/portal/rsvp", { eventId: b.dataset.rsvp, playerId: b.dataset.pid, status },
        status ? "Rückmeldung gespeichert 👍" : "Rückmeldung entfernt");
    });
    wrap.querySelectorAll("[data-rsvpplus]").forEach((a) => a.onclick = (ev) => {
      ev.preventDefault();
      P.rsvpBegr = { eid: a.dataset.rsvpplus, pid: a.dataset.pid, status: "yes" };
      render();
      const feld = document.querySelector("[data-rsvpgrund]");
      if (feld) feld.focus();
    });
    const rsvpSenden = wrap.querySelector("[data-rsvpsenden]");
    if (rsvpSenden) rsvpSenden.onclick = () => {
      const feld = wrap.querySelector("[data-rsvpgrund]");
      const grund = (feld.value || "").trim();
      // Bei ❓/👎 ist die Begründung Pflicht, bei 👍 ist die Bemerkung optional
      if (!grund && P.rsvpBegr.status !== "yes") {
        toast("Bitte kurz begründen – ein Wort reicht", "bad"); feld.focus(); return;
      }
      const b2 = P.rsvpBegr;
      P.rsvpBegr = null;
      aktion("/api/portal/rsvp", { eventId: b2.eid, playerId: b2.pid, status: b2.status, grund },
        grund ? "Rückmeldung mit Bemerkung gespeichert" : "Rückmeldung gespeichert 👍");
    };
    const rsvpAbbruch = wrap.querySelector("[data-rsvpabbruch]");
    if (rsvpAbbruch) rsvpAbbruch.onclick = () => { P.rsvpBegr = null; render(); };
    const rsvpFeld = wrap.querySelector("[data-rsvpgrund]");
    if (rsvpFeld) rsvpFeld.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); rsvpSenden.click(); } };
    wrap.querySelectorAll("[data-bufsave]").forEach((b) => b.onclick = () => {
      const eid = b.dataset.bufsave;
      const wert = wrap.querySelector(`[data-bufin="${eid}"]`).value.trim();
      aktion("/api/portal/buffet", { eventId: eid, beitrag: wert },
        wert ? "Danke – dein Buffet-Beitrag ist angekündigt! 🥗" : "Buffet-Beitrag zurückgezogen");
    });
    wrap.querySelectorAll("[data-mfsave]").forEach((b) => b.onclick = () => {
      const eid = b.dataset.mfsave;
      const plaetze = parseInt(wrap.querySelector(`[data-mfseats="${eid}"]`).value, 10) || 0;
      aktion("/api/portal/driver", { eventId: eid, seats: plaetze },
        plaetze ? "Danke – deine Mitfahrgelegenheit ist eingetragen! 🚗" : "Mitfahr-Angebot zurückgezogen");
    });
    wrap.querySelectorAll("[data-fsave]").forEach((b) => b.onclick = async () => {
      const eid = b.dataset.fsave;
      const ids = (b.dataset.fids || eid).split(",").filter(Boolean);
      const seats = parseInt(wrap.querySelector(`[data-fseats="${eid}"]`).value, 10) || 0;
      const phone = wrap.querySelector(`[data-fphone="${eid}"]`).value.trim();
      // Spieltag mit mehreren Spielen: Angebot gilt für alle Spiele des Tages
      for (let i = 0; i < ids.length; i++) {
        const letzte = i === ids.length - 1;
        if (!letzte) { const r = await api("/api/portal/driver", { eventId: ids[i], seats, phone }); if (!r.ok) { toast(r.data.error || "Speichern fehlgeschlagen", "bad"); return; } }
        else await aktion("/api/portal/driver", { eventId: ids[i], seats, phone }, "Fahrer-Angebot gespeichert – danke!");
      }
    });
    wrap.querySelectorAll("[data-job]").forEach((b) => b.onclick = () =>
      aktion("/api/portal/job", { jobId: b.dataset.job }, "Job übernommen – danke!"));
    wrap.querySelectorAll("[data-jobab]").forEach((b) => b.onclick = () =>
      aktion("/api/portal/job", { jobId: b.dataset.jobab, abgeben: true }, "Job wieder freigegeben"));
    wrap.querySelectorAll("[data-korder]").forEach((b) => b.onclick = () => {
      const id = b.dataset.korder;
      const pidSel = wrap.querySelector(`[data-kpid="${id}"]`);
      aktion("/api/portal/clothing", {
        itemId: id,
        playerId: pidSel ? pidSel.value : (P.daten.spieler[0] || {}).id,
        size: wrap.querySelector(`[data-ksize="${id}"]`).value,
        qty: parseInt(wrap.querySelector(`[data-kqty="${id}"]`).value, 10) || 1,
      }, "Anfrage gesendet – das Trainerteam meldet sich");
    });
    wrap.querySelectorAll("[data-kontakt]").forEach((f) => f.onsubmit = (ev) => {
      ev.preventDefault();
      const body = { playerId: f.dataset.kontakt };
      f.querySelectorAll("input[name]").forEach((i) => { body[i.name] = i.value.trim(); });
      aktion("/api/portal/contact", body, "Kontaktdaten gespeichert");
    });
    // Profilbild: Emoji wählen oder Foto hochladen (quadratisch zugeschnitten)
    wrap.querySelectorAll("[data-avemoji]").forEach((b) => b.onclick = () => {
      const sp = P.daten.spieler.find((x) => x.id === b.dataset.avpid) || {};
      const neu = sp.avatarEmoji === b.dataset.avemoji ? "" : b.dataset.avemoji;
      aktion("/api/portal/profilbild", { playerId: b.dataset.avpid, avatarEmoji: neu },
        neu ? `Avatar gespeichert ${neu}` : "Avatar entfernt", true);
    });
    wrap.querySelectorAll("[data-fotoup]").forEach((b) => b.onclick = () => {
      const pid = b.dataset.fotoup;
      const eingabe = wrap.querySelector(`[data-fotodatei="${pid}"]`);
      const datei = eingabe.files && eingabe.files[0];
      if (!datei || !datei.type.startsWith("image/")) { toast("Bitte zuerst ein Foto auswählen", "bad"); return; }
      const bild = new Image();
      const url = URL.createObjectURL(datei);
      bild.onload = () => {
        // quadratischer Mittel-Ausschnitt, 256 px
        const seite = Math.min(bild.width, bild.height);
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        c.getContext("2d").drawImage(bild, (bild.width - seite) / 2, (bild.height - seite) / 2, seite, seite, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        aktion("/api/portal/profilbild", { playerId: pid, foto: c.toDataURL("image/jpeg", 0.85) },
          "Profilfoto gespeichert 📷", true);
      };
      bild.onerror = () => toast("Foto konnte nicht gelesen werden", "bad");
      bild.src = url;
    });
    wrap.querySelectorAll("[data-fotoweg]").forEach((b) => b.onclick = () =>
      aktion("/api/portal/profilbild", { playerId: b.dataset.fotoweg, fotoLoeschen: true }, "Foto entfernt", true));
    // Rückenwind: Kacheln (max. 2) und Emoji wählen, senden
    wrap.querySelectorAll("[data-rwkachel]").forEach((b) => b.onclick = () => {
      const form = b.closest("[data-rwform]");
      const an = form.querySelectorAll("[data-rwkachel].outline").length;
      if (!b.classList.contains("outline") && an >= 2) { toast("Höchstens zwei Kacheln – weniger ist mehr", "bad"); return; }
      b.classList.toggle("outline"); b.classList.toggle("ghost");
    });
    wrap.querySelectorAll("[data-rwemoji]").forEach((b) => b.onclick = () => {
      const form = b.closest("[data-rwform]");
      form.querySelectorAll("[data-rwemoji]").forEach((x) => { x.classList.remove("outline"); x.classList.add("ghost"); });
      b.classList.add("outline"); b.classList.remove("ghost");
    });
    wrap.querySelectorAll("[data-rwsenden]").forEach((b) => b.onclick = async () => {
      const form = b.closest("[data-rwform]");
      const kacheln = Array.from(form.querySelectorAll("[data-rwkachel].outline")).map((x) => x.dataset.rwkachel);
      const emoji = (form.querySelector("[data-rwemoji].outline") || {}).dataset ? form.querySelector("[data-rwemoji].outline").dataset.rwemoji : "";
      const text = (form.querySelector("[data-rwtext]").value || "").trim();
      if (!kacheln.length && text.length < 3) { toast("Mindestens eine Kachel oder ein kurzer Satz", "bad"); return; }
      b.disabled = true;
      const res = await api("/api/portal/rueckenwind", { playerId: form.dataset.rwpid, terminId: form.dataset.rwtermin || null, kacheln, text, emoji });
      b.disabled = false;
      if (!res.ok) { toast(res.data.error || "Senden fehlgeschlagen", "bad"); return; }
      toast(res.data.status === "wartet" ? "Gesendet – wartet auf Freigabe deines Kindes" : "Rückenwind ist unterwegs 💬", "good");
      await neuLaden(false);
    });
    wrap.querySelectorAll("[data-rwerlauben]").forEach((b) => b.onclick = async () => {
      const res = await api("/api/portal/rueckenwind/einstellung", { erlauben: { userId: parseInt(b.dataset.rwerlauben, 10), ok: b.dataset.ok === "1" } });
      if (!res.ok) { toast(res.data.error || "Fehler", "bad"); return; }
      toast(b.dataset.ok === "1" ? "Freigegeben – viel Rückenwind! 💬" : "Okay, abgelehnt", "good");
      await neuLaden(false);
    });
    wrap.querySelectorAll("[data-rwreakt]").forEach((b) => b.onclick = async () => {
      const res = await api("/api/portal/rueckenwind/reaktion", { id: b.dataset.rwreakt, reaktion: b.dataset.r });
      if (!res.ok) { toast(res.data.error || "Fehler", "bad"); return; }
      toast("Reaktion geschickt " + b.dataset.r, "good");
      await neuLaden(false);
    });
    wrap.querySelectorAll("[data-rwantwortzeigen]").forEach((b) => b.onclick = () => {
      const box = wrap.querySelector(`[data-rwantwortbox="${b.dataset.rwantwortzeigen}"]`);
      const offen = box.style.display !== "none";
      box.style.display = offen ? "none" : "flex"; if (!offen) box.querySelector("input").focus();
    });
    wrap.querySelectorAll("[data-rwantwortsenden]").forEach((b) => b.onclick = async () => {
      const id = b.dataset.rwantwortsenden;
      const antwort = (wrap.querySelector(`[data-rwantwort="${id}"]`).value || "").trim();
      if (antwort.length < 2) { toast("Bitte kurz etwas schreiben", "bad"); return; }
      const res = await api("/api/portal/rueckenwind/reaktion", { id, antwort });
      if (!res.ok) { toast(res.data.error || "Fehler", "bad"); return; }
      toast("Antwort geschickt", "good");
      await neuLaden(false);
    });
    const rwAn = wrap.querySelector("[data-rwan]");
    if (rwAn) rwAn.onclick = async () => {
      const neu = !(P.daten.rueckenwind || {}).an;
      const res = await api("/api/portal/rueckenwind/einstellung", { an: neu });
      if (!res.ok) { toast("Konnte nicht gespeichert werden", "bad"); return; }
      toast(neu ? "Rückenwind ist an" : "Rückenwind ist aus");
      await neuLaden(false);
    };
    const nmSenden = wrap.querySelector("#nmSenden");
    if (nmSenden) nmSenden.onclick = async () => {
      const ta = wrap.querySelector("#nmText");
      const text = (ta.value || "").trim();
      if (text.length < 2) { toast("Bitte eine Nachricht eingeben", "bad"); return; }
      nmSenden.disabled = true;
      const res = await api("/api/portal/nachricht", { text });
      nmSenden.disabled = false;
      if (!res.ok) { toast(res.data.error || "Senden fehlgeschlagen", "bad"); return; }
      toast("Nachricht ans Trainerteam geschickt 📨", "good");
      await neuLaden(false);
    };
    const ampel = wrap.querySelector("[data-ampel]");
    if (ampel) ampel.onclick = ampelListe;
    const gehKonto = wrap.querySelector("[data-gehkonto]");
    if (gehKonto) gehKonto.onclick = () => { P.tab = "kontakt"; render(); setTimeout(() => { const z = document.querySelector("#einwKarte"); if (z) z.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); };
    // Digitale Bestätigung der Erklärungen (Eltern) – Passwort oder Passkey als Unterschrift
    wrap.querySelectorAll("[data-ewsenden]").forEach((b) => b.onclick = async () => {
      if (P.busy) return;
      const pid = b.dataset.ewsenden;
      const antworten = {};
      let fehlt = null;
      (P.daten.vorlagen || []).forEach((t) => {
        const w = wrap.querySelector(`input[name="ew_${pid}_${t.id}"]:checked`);
        if (w) antworten[t.id] = w.value; else if (t.required && !fehlt) fehlt = t.name;
      });
      if (fehlt) { toast(`Bitte bei „${fehlt}“ zustimmen oder ablehnen`, "bad"); return; }
      if (!Object.keys(antworten).length) { toast("Bitte mindestens eine Erklärung beantworten", "bad"); return; }
      const name = (wrap.querySelector(`[data-ewname="${pid}"]`) || {}).value || "";
      if (!name.trim()) { toast("Bitte den Namen der erklärenden Person angeben", "bad"); return; }
      let bestaetigung;
      if (b.dataset.art === "passkey") {
        toast("Gerät fragt nach " + (P.passkeyWort || "Face ID / Fingerabdruck") + " …");
        const c = await Passkey.credential();
        if (!c.ok) { if (c.error) toast(c.error, "bad"); return; }
        bestaetigung = { art: "passkey", credential: c.credential };
      } else {
        const pw = (wrap.querySelector(`[data-ewpw="${pid}"]`) || {}).value || "";
        if (!pw) { toast("Bitte dein Passwort zur Bestätigung eingeben", "bad"); return; }
        bestaetigung = { art: "passwort", passwort: pw };
      }
      b.disabled = true;
      P.busy = true;
      const res = await api("/api/portal/einwilligung", { playerId: pid, antworten, unterschriebenVon: name.trim(), bestaetigung });
      P.busy = false; b.disabled = false;
      if (!res.ok) { toast(res.data.error || "Bestätigung fehlgeschlagen", "bad"); return; }
      toast("Danke – Erklärung verbindlich abgegeben, Nachweis gespeichert 📝", "good");
      await neuLaden(false);
    });
    // Einverständnis-Upload: PDF direkt, Fotos vorher aufs Handliche verkleinern
    const dateiZuBlob = (datei) => new Promise((ok, nein) => {
      if (datei.type === "application/pdf" || !datei.type.startsWith("image/")) { ok(datei); return; }
      const bild = new Image();
      const url = URL.createObjectURL(datei);
      bild.onload = () => {
        const maxSeite = 1600;
        const faktor = Math.min(1, maxSeite / Math.max(bild.width, bild.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bild.width * faktor);
        c.height = Math.round(bild.height * faktor);
        c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((blob) => blob ? ok(blob) : nein(new Error("leer")), "image/jpeg", 0.82);
      };
      bild.onerror = nein;
      bild.src = url;
    });
    wrap.querySelectorAll("[data-upsenden]").forEach((b) => b.onclick = async () => {
      // Alles absichern: ein stiller Fehler ließe den Knopf scheinbar „nicht
      // reagieren" – lieber immer eine sichtbare Rückmeldung geben.
      try {
        const pid = b.dataset.upsenden;
        const eingabe = wrap.querySelector(`[data-updatei="${pid}"]`);
        const datei = eingabe && eingabe.files && eingabe.files[0];
        if (!datei) { toast("Bitte zuerst eine PDF- oder Bilddatei auswählen", "bad"); return; }
        if (datei.size > 20 * 1024 * 1024) { toast("Datei zu groß (max. 20 MB)", "bad"); return; }
        toast("Wird hochgeladen …");
        let blob;
        try { blob = await dateiZuBlob(datei); }
        catch (e) { toast("Datei konnte nicht gelesen werden", "bad"); return; }
        let name = datei.name || "einverstaendnis";
        if (blob !== datei && !/\.jpe?g$/i.test(name)) name = name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
        const fd = new FormData();
        fd.append("datei", blob, name); fd.append("playerId", pid);
        fd.append("unterschriebenVon", (wrap.querySelector(`[data-upname="${pid}"]`) || {}).value || "");
        fd.append("art", (wrap.querySelector(`[data-upart="${pid}"]`) || {}).value || "");
        if (P.busy) return;
        P.busy = true;
        let res;
        try {
          res = await fetch("/api/portal/einverstaendnis", { method: "POST", body: fd, credentials: "same-origin",
            headers: window.Sync && Sync.csrf ? { "X-CSRF-Token": Sync.csrf } : {} });
        } catch (e2) { P.busy = false; toast("Keine Verbindung – bitte später erneut versuchen", "bad"); return; }
        P.busy = false;
        let data = {}; try { data = await res.json(); } catch (e3) { /* leer */ }
        if (!res.ok) { toast(data.error || "Hochladen fehlgeschlagen", "bad"); return; }
        toast("Einverständniserklärung hochgeladen – das Trainerteam sichtet sie. Danke! 📝", "good");
        await neuLaden(false);
      } catch (e) {
        toast("Hochladen fehlgeschlagen – bitte erneut versuchen", "bad");
      }
    });
    // Abwesenheit melden / zurücknehmen
    const abwForm = $("#abwForm", wrap);
    if (abwForm) abwForm.onsubmit = (ev) => {
      ev.preventDefault();
      aktion("/api/portal/abwesenheit", {
        playerId: abwForm.playerId ? abwForm.playerId.value : (P.daten.spieler[0] || {}).id,
        von: abwForm.von.value, bis: abwForm.bis.value, grund: abwForm.grund.value.trim(),
      }, "Abwesenheit gemeldet – Termine im Zeitraum sind abgesagt. Gute Zeit! 🏖");
    };
    wrap.querySelectorAll("[data-abwdel]").forEach((b) => b.onclick = () =>
      aktion("/api/portal/abwesenheit", { loeschen: true, abwesenheitId: b.dataset.abwdel },
        "Abwesenheit zurückgenommen"));
    // Kalender-Abo-Adresse holen und anzeigen
    const kalKnopf = wrap.querySelector("[data-kalabo]");
    if (kalKnopf) kalKnopf.onclick = async () => {
      const res = await api("/api/portal/kalender-info");
      if (!res.ok) { toast("Abo-Adresse konnte nicht erstellt werden", "bad"); return; }
      const box = $("#kalAboBox", wrap);
      box.hidden = false;
      $("#kalAboUrl", wrap).value = res.data.aboUrl;
      $("#kalWebcal", wrap).href = res.data.webcalUrl;
    };
    const kalKopie = wrap.querySelector("[data-kalkopie]");
    if (kalKopie) kalKopie.onclick = async () => {
      try { await navigator.clipboard.writeText($("#kalAboUrl", wrap).value); toast("Adresse kopiert", "good"); }
      catch (e) { toast("Bitte Adresse markieren und kopieren", "bad"); }
    };
    const codeForm = $("#portalCode", wrap);
    if (codeForm) codeForm.onsubmit = (ev) => {
      ev.preventDefault();
      aktion("/api/portal/code", { code: codeForm.code.value.trim() }, "Code eingelöst");
    };
    wrap.querySelectorAll("[data-pushan]").forEach((b) => b.onclick = async () => {
      await pushAktivieren();
      P.pushAktiv = !!(await pushAbo());
      render();
    });
    wrap.querySelectorAll("[data-pushaus]").forEach((b) => b.onclick = async () => {
      await pushDeaktivieren();
      P.pushAktiv = false;
      render();
    });
    wrap.querySelectorAll("[data-pushprobe]").forEach((b) => b.onclick = pushProbe);
    // Benachrichtigungs-Schalter: sofort umlegen, im Hintergrund speichern (kein Neuladen)
    wrap.querySelectorAll("[data-notify]").forEach((b) => b.onclick = async () => {
      const key = b.dataset.notify;
      const box = P.daten.benachrichtigungen || (P.daten.benachrichtigungen = { prefs: {} });
      const pr = box.prefs || (box.prefs = {});
      const neu = !pr[key];
      b.classList.toggle("an", neu);
      b.setAttribute("aria-pressed", neu ? "true" : "false");
      pr[key] = neu;
      const res = await api("/api/portal/benachrichtigungen", { [key]: neu });
      if (!res.ok) {
        pr[key] = !neu;
        b.classList.toggle("an", !neu);
        b.setAttribute("aria-pressed", !neu ? "true" : "false");
        toast("Konnte nicht gespeichert werden", "bad");
        return;
      }
      if (res.data && res.data.prefs) box.prefs = res.data.prefs;
    });
    wrap.querySelectorAll("[data-pkneu]").forEach((b) => b.onclick = passkeyEinrichten);
    wrap.querySelectorAll("[data-pkspaeter]").forEach((b) => b.onclick = () => {
      try { localStorage.setItem(Passkey.NEIN, String(Date.now() + 30 * 86400000)); } catch (e) { /* leer */ }
      P.passkeyAngebot = false; render();
    });
    wrap.querySelectorAll("[data-pkweg]").forEach((b) => b.onclick = async () => {
      if (!confirm("Diesen Passkey entfernen? Die Anmeldung geht dann wieder nur mit Passwort.")) return;
      const r = await api("/api/passkey/loeschen", { id: parseInt(b.dataset.pkweg, 10) });
      if (!r.ok) { toast("Konnte nicht entfernt werden", "bad"); return; }
      P.passkeys = Object.assign({}, P.passkeys, { passkeys: r.data.passkeys || [] });
      if (!P.passkeys.passkeys.length) Passkey.merken(false);
      toast("Passkey entfernt"); render();
    });
    const abmelden = $("#portalAbmelden", wrap);
    if (abmelden) abmelden.onclick = async () => {
      await api("/api/logout", {});
      location.reload();
    };
  }
})();
