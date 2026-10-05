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
    render();  // sofort anzeigen – Push-Status/Wetter/Quiz ziehen im Hintergrund nach
    // Push-Abo-Prüfung nicht blockierend (nur fürs Konto-Tab relevant)
    pushAbo().then((abo) => { if (abo) { P.pushAktiv = true; render(); } }).catch(() => {});
    // Wetter für die Begrüßung (Spieler:innen UND Eltern), Quiz nur für Spieler:innen
    api("/api/portal/wetter").then((r) => { if (r.ok) { P.wetter = r.data; P.grussText = null; render(); } });
    if (P.daten.user.role === "spieler") {
      api("/api/portal/quiz").then((r) => { if (r.ok) { P.quiz = r.data; render(); } });
    }
    pushAuffrischen();
  };

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
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${sp.abzeichen.map((a) => `<span class="badge good" title="${esc(a.name)}" style="font-size:.85rem">${esc(a.emoji)} ${esc(a.name)}</span>`).join("")}
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

    return `
      ${hallo}
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
        ${naechste.length ? naechste.map((e) => `<div class="list-item"><div class="grow">
            <div class="title">${e.art === "misc" ? esc(e.kategorie) + ": " : (ICON[e.art] || "📌") + " "}${esc(e.title || "")}${e.opponent ? " gegen " + esc(e.opponent) : ""}</div>
            <div class="sub">${fmtDate(e.start)} · ${fmtTime(e.start)} Uhr${e.location ? " · " + esc(e.location) : ""}</div>
          </div></div>`).join("") : `<p class="soft">Aktuell stehen keine Termine an.</p>`}
      </div></div>
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
        <div class="portal-termin">
          <div class="title">${fmtDate(t.start)} · ${fmtTime(t.start)}–${fmtTime(t.end)} Uhr${t.location ? " · " + esc(t.location) : ""}</div>
          ${ortZeile(t)}
          ${zusagenPills(t.zusagen)}
          ${dabeiAvatare(t)}
          ${d.spieler.map((sp) => `
            <div class="portal-rsvp-zeile">${d.spieler.length > 1 || istEltern() ? `<span class="sub">${esc(sp.name)}:</span>` : ""}
            ${rsvpKnoepfe(t, sp.id)}</div>`).join("")}
        </div>`).join("") : `<p class="soft">Keine anstehenden Trainings eingetragen.</p>`}
      </div>
      <div class="card"><h3>${istEltern() ? "🏆 Spiele – Rückmeldestand deines Kindes" : "🏆 Spiele – bitte rückmelden"}</h3>
      ${d.spiele.length ? d.spiele.map((s) => `<div class="portal-termin">
          <div class="title">${s.type === "home" ? "🏟️ Heimspiel" : "🚌 Auswärtsspiel"}${s.opponent ? " gegen " + esc(s.opponent) : ""}</div>
          <div class="sub">${fmtDate(s.start)} · ${fmtTime(s.start)} Uhr${s.location ? " · " + esc(s.location) : ""}</div>
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
      ${P.daten.weitere.map((w) => `<div class="list-item"><div class="grow">
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

  // „Wer ist dabei?": Vornamen der Zugesagten (nur für Spieler:innen; voller
  // Name beim Berühren/Hover per title – bewusst OHNE Gründe oder Bemerkungen)
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
    const vorname = (p) => p.vorname || p.name.split(" ")[0] || p.name;
    // Gleiche Vornamen im Team → Anfangsbuchstabe des Nachnamens dazu („Lena S.")
    const anzahl = {};
    leute.forEach((p) => { anzahl[vorname(p)] = (anzahl[vorname(p)] || 0) + 1; });
    const anzeige = (p) => {
      const v = vorname(p);
      const nach = p.name.slice(v.length).trim();
      return anzahl[v] > 1 && nach ? `${v} ${nach[0]}.` : v;
    };
    return `<div class="dabei">
      <span class="n">${leute.length} dabei:</span>
      ${leute.map((p) => `<span class="dabei-name" title="${esc(p.name)}">${p.foto
        ? `<img class="mini" src="${p.foto}" alt="" style="object-fit:cover">`
        : p.avatarEmoji ? `<span class="mini emoji">${esc(p.avatarEmoji)}</span>` : ""}${esc(anzeige(p))}</span>`).join("")}
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
    const auswaerts = d.spiele.filter((s) => s.type === "away");
    const angebot = (eid) => d.fahrer.find((f) => f.eventId === eid);
    const KAT = { catering: "🥗", helper: "🙌", other: "📌" };
    const jobsProSpiel = new Map();
    d.jobs.forEach((j) => {
      if (!jobsProSpiel.has(j.eventId)) jobsProSpiel.set(j.eventId, []);
      jobsProSpiel.get(j.eventId).push(j);
    });
    const spielVon = (eid) => d.spiele.find((s) => s.id === eid);
    return `
      <div class="card"><h3>🚗 Fahrer:in für Auswärtsspiele</h3>
      <p class="soft">Trage ein, wie viele Plätze du anbieten kannst – die Zuordnung der Mitfahrer:innen
      übernimmt das Trainerteam und meldet sich bei dir.</p>
      ${auswaerts.length ? auswaerts.map((s) => {
        const a = angebot(s.id);
        return `<div class="portal-termin">
          <div class="title">🚌 ${fmtDate(s.start)}${s.opponent ? " gegen " + esc(s.opponent) : ""}${s.location ? " · " + esc(s.location) : ""}</div>
          ${a ? `<div class="sub">Dein Angebot: <strong>${a.seats} Plätze</strong>${a.phone ? " · " + esc(a.phone) : ""}</div>` : `<div class="sub">Noch kein Angebot von dir.</div>`}
          <div class="portal-fahrer">
            <select data-fseats="${s.id}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
              `<option value="${n}" ${a && a.seats === n ? "selected" : ""}>${n === 0 ? "kein Angebot" : n + " Plätze"}</option>`).join("")}</select>
            <input data-fphone="${s.id}" placeholder="Mobilnummer für Rückfragen" value="${esc(a ? a.phone : "")}">
            <button class="btn sm" data-fsave="${s.id}">Speichern</button>
          </div>
        </div>`;
      }).join("") : `<p class="soft">Keine anstehenden Auswärtsspiele.</p>`}
      </div>
      <div class="card"><h3>🙌 Heimspiel-Jobs</h3>
      <p class="soft">Offene Aufgaben rund um unsere Heimspiele – einfach übernehmen, das Trainerteam sieht deinen Namen.</p>
      ${jobsProSpiel.size ? Array.from(jobsProSpiel.entries()).map(([eid, jobs]) => {
        const s = spielVon(eid);
        return `<div class="portal-termin">
          <div class="title">🏟️ ${s ? `${fmtDate(s.start)}${s.opponent ? " gegen " + esc(s.opponent) : ""}` : "Heimspiel"}</div>
          <div class="list" style="margin-top:8px">
          ${jobs.map((j) => `<div class="list-item"><div class="grow">
              <div class="title" style="font-size:.9rem">${KAT[j.category] || "📌"} ${esc(j.title)}</div>
              ${j.meiner ? `<div class="sub">Du hast diesen Job übernommen – danke! 💪</div>` : ""}
            </div>
            ${j.meiner ? `<button class="btn sm ghost" data-jobab="${j.id}">Abgeben</button>`
                       : `<button class="btn sm" data-job="${j.id}">Übernehmen</button>`}
          </div>`).join("")}
          </div>
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
      <div class="card"><h3>📝 Einverständniserklärung</h3>
        <p class="soft">Die unterschriebene Sammel-Einverständniserklärung kannst du hier direkt hochladen –
        als <strong>PDF</strong> oder als <strong>Foto</strong> (Bilder werden automatisch verkleinert).</p>
        ${d.spieler.map((sp) => {
          const st = (d.einverstaendnis || []).find((e) => e.playerId === sp.id) || {};
          return `<div class="portal-termin">
            <div class="title" style="font-size:.92rem">${esc(sp.name)}
              ${st.vorhanden ? '<span class="badge good">✓ liegt vor</span>' : '<span class="badge warn">fehlt noch</span>'}</div>
            ${st.fileName ? `<div class="sub">zuletzt: ${esc(st.fileName)}${st.uploadedAt ? " · " + fmtDateShort(st.uploadedAt) : ""}</div>` : ""}
            <div class="portal-fahrer">
              <input type="file" data-updatei="${sp.id}" accept="application/pdf,image/*" style="flex:1;min-width:150px">
              <button class="btn sm" data-upsenden="${sp.id}">⬆️ Hochladen</button>
            </div>
          </div>`;
        }).join("")}
      </div>
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
      <div class="card">
        <button class="btn secondary" id="portalAbmelden">Abmelden</button>
        <p class="soft" style="font-size:.78rem;margin:12px 0 0;text-align:center">
          <a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a> ·
          <a href="/impressum" target="_blank" rel="noopener">Impressum</a></p>
      </div>`;
  }

  // ---------- Rahmen & Ereignisse ----------

  const TABS = () => [
    { id: "start", label: "Übersicht", icon: "🏠" },
    { id: "termine", label: "Termine", icon: "📅" },
    ...(istEltern() ? [{ id: "mithelfen", label: "Mithelfen", icon: "🤝" }] : []),
    // Vereinskleidung fordern Spieler:innen selbst an – für Eltern ausgeblendet
    ...(istEltern() ? [] : [{ id: "kleidung", label: "Kleidung", icon: "👕" }]),
    { id: "wiki", label: "Wiki", icon: "📖" },
    { id: "kontakt", label: "Konto", icon: "⚙️" },
  ];

  function render() {
    const wrap = $("#portalRoot2");
    if (istEltern() && P.tab === "kleidung") P.tab = "start"; // Tab existiert für Eltern nicht
    const inhalt = { start: tabStart, termine: tabTermine, mithelfen: tabMithelfen,
                     kleidung: tabKleidung, wiki: tabWiki, kontakt: tabKontakt }[P.tab] || tabStart;
    wrap.innerHTML = `
      <header class="portal-kopf">
        <div class="portal-logo"><svg viewBox="0 0 512 512" width="22" height="22" aria-hidden="true" style="vertical-align:-4px"><g fill="#F1662A"><path d="M346 64A213 213 0 0 0 105 405A55 55 0 0 0 187 330A300 300 0 0 1 346 64Z"/><path transform="rotate(180 256 256)" d="M346 64A213 213 0 0 0 105 405A55 55 0 0 0 187 330A300 300 0 0 1 346 64Z"/></g></svg> SKV Müritz Volleyball</div>
        <div class="portal-nutzer">${(() => {
          const sp = (P.daten.spieler || [])[0] || {};
          const bild = sp.foto ? `<img src="${sp.foto}" alt="" class="portal-kopf-avatar">`
            : sp.avatarEmoji ? `<span class="portal-kopf-avatar" style="font-size:1.15rem;background:#ffffff22">${esc(sp.avatarEmoji)}</span>` : "";
          return bild + esc(P.daten.user.name);
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
    wrap.querySelectorAll("[data-fsave]").forEach((b) => b.onclick = () => {
      const eid = b.dataset.fsave;
      aktion("/api/portal/driver", {
        eventId: eid,
        seats: parseInt(wrap.querySelector(`[data-fseats="${eid}"]`).value, 10) || 0,
        phone: wrap.querySelector(`[data-fphone="${eid}"]`).value.trim(),
      }, "Fahrer-Angebot gespeichert – danke!");
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
    // Einverständnis-Upload: PDF direkt, Fotos vorher aufs Handliche verkleinern
    const dateiZuDataUrl = (datei) => new Promise((ok, nein) => {
      if (datei.type === "application/pdf" || !datei.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => ok(r.result); r.onerror = nein;
        r.readAsDataURL(datei);
        return;
      }
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
        ok(c.toDataURL("image/jpeg", 0.82));
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
        if (datei.size > 15 * 1024 * 1024) { toast("Datei zu groß (max. 15 MB Original)", "bad"); return; }
        toast("Wird hochgeladen …");
        let dataUrl;
        try { dataUrl = await dateiZuDataUrl(datei); }
        catch (e) { toast("Datei konnte nicht gelesen werden", "bad"); return; }
        if (dataUrl.length > 5_500_000) { toast("Datei nach Umwandlung zu groß – bitte als Foto (nicht Scan) versuchen", "bad"); return; }
        aktion("/api/portal/einverstaendnis", { playerId: pid, fileName: datei.name, dataUrl },
          "Einverständniserklärung hochgeladen – danke! 📝");
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
    const abmelden = $("#portalAbmelden", wrap);
    if (abmelden) abmelden.onclick = async () => {
      await api("/api/logout", {});
      location.reload();
    };
  }
})();
