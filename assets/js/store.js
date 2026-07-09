/* ==========================================================================
   SKV Volleyball – Datenhaltung (localStorage)
   Kleiner Datenspeicher mit Seed-Daten. Kein Backend nötig – die Plattform
   läuft komplett im Browser. Für den Produktivbetrieb kann dieselbe
   Datenstruktur später an eine echte API/Datenbank angebunden werden.
   ========================================================================== */
(function () {
  "use strict";

  const KEY = "skv_vb_data_v2";
  const CLUB = "SKV Müritz";
  const WEBSITE = "https://www.skv-mueritz.de";

  // ---- kleine ID- & Datums-Helfer (deterministisch, ohne Zufall) ----
  let _idc = 1;
  const uid = (p) => `${p}_${Date.now().toString(36)}_${(_idc++).toString(36)}`;

  // Saison-Anker für die Seed-Daten
  const SEASON = { year: 2025 };

  function seed() {
    // Abteilungen / Mannschaften des Vereins
    const departments = [
      dept("DAM1", "Damen I", "Aktive", "w", "Verbandsliga MV", "Damen", "Katrin Sommer", "damen1@skv-mueritz.de", "Di & Do 19:30–21:30", "Sporthalle SKV, Halle 1"),
      dept("DAM2", "Damen II", "Aktive", "w", "Bezirksliga Ost", "Damen", "Katrin Sommer", "damen2@skv-mueritz.de", "Mo 19:00–21:00", "Sporthalle SKV, Halle 1"),
      dept("HER1", "Herren I", "Aktive", "m", "Landesliga MV", "Herren", "Michael Voß", "herren1@skv-mueritz.de", "Mi & Fr 19:30–21:30", "Sporthalle SKV, Halle 2"),
      dept("WU18", "weibliche U18", "Jugend", "w", "Verbandsliga MV weibl. U18", "U18", "Andrea Berg", "wu18@skv-mueritz.de", "Mo & Fr 18:00–20:00", "Sporthalle SKV, Halle 1"),
      dept("WU16", "weibliche U16", "Jugend", "w", "Verbandsliga MV weibl. U16", "U16", "Andrea Berg", "wu16@skv-mueritz.de", "Di & Do 17:00–18:30", "Sporthalle SKV, Halle 1"),
      dept("WU14", "weibliche U14", "Jugend", "w", "Bezirksklasse weibl. U14", "U14", "Sven Lorenz", "wu14@skv-mueritz.de", "Mi 16:30–18:00", "Sporthalle SKV, Halle 2"),
      dept("MINI", "Mini-Volleyball (U12)", "Nachwuchs", "mix", "Mini-Spielfeste MV", "U12", "Sven Lorenz", "mini@skv-mueritz.de", "Fr 16:00–17:30", "Grundschule am See"),
      dept("HOBBY", "Hobby & Freizeit", "Breitensport", "mix", "Freizeitrunde Müritz", "Erwachsene", "Team Hobby", "hobby@skv-mueritz.de", "So 18:00–20:00", "Sporthalle SKV, Halle 1"),
    ];
    const deptId = (code) => (departments.find((x) => x.code === code) || {}).id || null;

    const players = [
      p("Lena", "Bauer", "2009-03-14", "Zuspiel", 3, "U18", "Sabine Bauer", "sabine.bauer@example.de", "0170 1234501", true, "aktiv"),
      p("Mia", "Schulz", "2008-07-02", "Außenangriff", 7, "U18", "Ralf Schulz", "ralf.schulz@example.de", "0170 1234502", true, "aktiv"),
      p("Emma", "Wagner", "2009-11-28", "Mitte", 5, "U18", "Petra Wagner", "petra.wagner@example.de", "0170 1234503", false, "aktiv"),
      p("Hannah", "Krüger", "2010-01-09", "Libero", 11, "U16", "Uwe Krüger", "uwe.krueger@example.de", "0170 1234504", true, "aktiv"),
      p("Sophie", "Fischer", "2008-05-21", "Diagonal", 9, "U18", "Anke Fischer", "anke.fischer@example.de", "0170 1234505", true, "aktiv"),
      p("Marie", "Hoffmann", "2010-09-03", "Außenangriff", 4, "U16", "Jens Hoffmann", "jens.hoffmann@example.de", "0170 1234506", false, "aktiv"),
      p("Leonie", "Weber", "2009-07-08", "Mitte", 8, "U18", "Karin Weber", "karin.weber@example.de", "0170 1234507", true, "aktiv"),
      p("Clara", "Schneider", "2011-02-17", "Zuspiel", 6, "U16", "Tim Schneider", "tim.schneider@example.de", "0170 1234508", true, "aktiv"),
      p("Amelie", "Meyer", "2010-12-01", "Libero", 12, "U16", "Nadja Meyer", "nadja.meyer@example.de", "0170 1234509", false, "aktiv"),
      p("Johanna", "Richter", "2008-08-25", "Diagonal", 10, "U18", "Frank Richter", "frank.richter@example.de", "0170 1234510", true, "aktiv"),
      p("Paula", "Klein", "2011-04-30", "Außenangriff", 2, "U16", "Bea Klein", "bea.klein@example.de", "0170 1234511", true, "aktiv"),
      p("Ida", "Wolf", "2009-07-08", "Mitte", 14, "U18", "Olaf Wolf", "olaf.wolf@example.de", "0170 1234512", false, "beitragsrückstand"),
    ];

    // Spielerinnen den Abteilungen zuordnen und Passnummern vergeben
    const teamToDept = { U18: "WU18", U16: "WU16", U14: "WU14", Damen: "DAM1", Herren: "HER1" };
    players.forEach((pl, i) => {
      pl.departmentId = deptId(teamToDept[pl.team] || null);
      pl.passNumber = `MV${SEASON.year}${String(10001 + i)}`;
    });

    const events = [
      ev("training", "Training U18", d(0, 18, 0), d(0, 20, 0), "Sporthalle SKV, Halle 1", ""),
      ev("training", "Training U16", d(1, 17, 0), d(1, 18, 30), "Sporthalle SKV, Halle 1", ""),
      ev("home", "Heimspiel vs. SV Rostock", d(3, 11, 0), d(3, 14, 0), "Sporthalle SKV, Halle 1", "SV Rostock"),
      ev("training", "Training U18", d(5, 18, 0), d(5, 20, 0), "Sporthalle SKV, Halle 1", ""),
      ev("away", "Auswärtsspiel @ VC Schwerin", d(7, 14, 0), d(7, 17, 0), "Sport- und Kongresshalle Schwerin", "VC Schwerin"),
      ev("training", "Training U16", d(8, 17, 0), d(8, 18, 30), "Sporthalle SKV, Halle 1", ""),
      ev("home", "Heimspiel vs. Stralsunder VV", d(10, 11, 0), d(10, 14, 0), "Sporthalle SKV, Halle 1", "Stralsunder VV"),
      ev("away", "Auswärtsspiel @ Neubrandenburg", d(14, 13, 0), d(14, 16, 0), "Halle am Datzeberg, Neubrandenburg", "Neubrandenburger SV"),
      ev("other", "Vereinsfest & Saisonabschluss", d(21, 15, 0), d(21, 20, 0), "Vereinsheim SKV", ""),
    ];

    // Trainingsrückmeldungen für das erste Training
    const trainingId = events[0].id;
    const responses = [
      resp(trainingId, players[0].id, "yes"),
      resp(trainingId, players[1].id, "yes"),
      resp(trainingId, players[2].id, "maybe"),
      resp(trainingId, players[4].id, "yes"),
      resp(trainingId, players[6].id, "no"),
      resp(trainingId, players[9].id, "yes"),
    ];

    // Fahrer für Auswärtsspiele
    const awayA = events[4].id;
    const awayB = events[7].id;
    const drivers = [
      drv(awayA, "Ralf Schulz", "0170 1234502", 4, [players[1].id, players[4].id, players[9].id]),
      drv(awayA, "Anke Fischer", "0170 1234505", 3, [players[0].id, players[6].id]),
      drv(awayB, "Frank Richter", "0170 1234510", 4, [players[9].id, players[1].id]),
    ];

    // Jobs / Catering / Helfer für Heimspiele
    const homeA = events[2].id;
    const homeB = events[6].id;
    const jobs = [
      job(homeA, "catering", "Kuchenbüfett organisieren", "Sabine Bauer", true),
      job(homeA, "catering", "Kaffee & Getränkeverkauf", "Karin Weber", false),
      job(homeA, "helper", "Hallenaufbau (Netz & Bänke)", "Uwe Krüger", true),
      job(homeA, "helper", "Kampfgericht / Anschreiben", "", false),
      job(homeA, "other", "Hallenschlüssel & Öffnen", "Trainerteam", true),
      job(homeB, "catering", "Grillstand betreuen", "", false),
      job(homeB, "helper", "Abbau & Halle reinigen", "", false),
      job(homeB, "helper", "Sanitätsdienst / Erste Hilfe", "Anke Fischer", true),
    ];

    // Einverständniserklärungen
    const consents = [
      consent(players[0].id, "Datennutzung & Fotorechte", "einverstaendnis_lena.pdf", null, "Sabine Bauer"),
      consent(players[3].id, "Fahrten & Aufsicht", "einverstaendnis_hannah.pdf", null, "Uwe Krüger"),
      consent(players[7].id, "Datennutzung & Fotorechte", "einverstaendnis_clara.pdf", null, "Tim Schneider"),
    ];

    // Finanzen
    const finances = [
      fin("fee", "Mitgliedsbeitrag Q3 – Lena Bauer", 45, d(-20), true, players[0].id),
      fin("fee", "Mitgliedsbeitrag Q3 – Mia Schulz", 45, d(-18), true, players[1].id),
      fin("fee", "Mitgliedsbeitrag Q3 – Ida Wolf", 45, d(-30), false, players[11].id),
      fin("fee", "Mitgliedsbeitrag Q3 – Emma Wagner", 45, d(-15), true, players[2].id),
      fin("donation", "Spende Bäckerei Ostsee", 250, d(-12), true, null),
      fin("donation", "Spende Elternbeirat", 120, d(-6), true, null),
      fin("expense", "Neue Trainingsbälle (Satz 6 Stück)", 210, d(-9), true, null),
      fin("expense", "Turniergebühr Verbandsliga", 90, d(-4), true, null),
    ];

    // Vereinskleidung
    const clothing = [
      cloth("Trikot Heim (orange)", "Offizielles Spieltrikot mit Vereinslogo und Rückennummer.", 34.9, ["S", "M", "L", "XL"], "jersey", "#f97316"),
      cloth("Trikot Auswärts (blau)", "Auswärtstrikot in Vereinsblau, atmungsaktives Material.", 34.9, ["S", "M", "L", "XL"], "jersey", "#1e3a8a"),
      cloth("Trainingsjacke", "Warm-up Jacke mit SKV-Emblem, ideal für kühle Hallen.", 49.9, ["XS", "S", "M", "L", "XL"], "jacket", "#1e3a8a"),
      cloth("Hoodie SKV", "Bequemer Kapuzenpulli für Fahrten und Freizeit.", 39.9, ["S", "M", "L", "XL"], "hoodie", "#334155"),
      cloth("Sporttasche", "Geräumige Tasche mit Nassfach und Vereinsdruck.", 29.9, ["Einheit"], "bag", "#0ea5e9"),
      cloth("Knieschoner (Paar)", "Gepolsterte Knieschoner für sicheres Abtauchen.", 19.9, ["S", "M", "L"], "pads", "#111827"),
    ];

    const clothingRequests = [
      clothReq(clothing[0].id, players[3].id, "M", 1, "offen"),
      clothReq(clothing[2].id, players[7].id, "S", 1, "bestellt"),
    ];

    // Sponsoren
    const sponsors = [
      sponsor("Ostsee Bäckerei GmbH", "Hauptsponsor", "https://www.example.de", "info@ostsee-baeckerei.de", 1500, "#f59e0b"),
      sponsor("Sanitätshaus Nordlicht", "Premium", "https://www.example.de", "kontakt@nordlicht.de", 800, "#0ea5e9"),
      sponsor("Autohaus Küstenweg", "Partner", "https://www.example.de", "team@kuestenweg.de", 500, "#16a34a"),
    ];

    // Ankündigungen
    const announcements = [
      ann("Willkommen im Trainer-Cockpit", "Alle Termine, Rückmeldungen und Aufgaben findet ihr ab sofort hier gebündelt. Bitte tragt eure Trainingsrückmeldungen bis 24h vorher ein.", "alle"),
      ann("Fahrergesuch Auswärtsspiel Schwerin", "Für das Spiel in Schwerin brauchen wir noch 1–2 Fahrer:innen. Bitte im Bereich Fahrerplanung eintragen.", "eltern"),
      ann("Einverständniserklärungen", "Bitte die unterschriebenen Formulare zum nächsten Training mitbringen oder digital hochladen.", "eltern"),
    ];

    // Aufgaben Trainer
    const tasks = [
      task("Aufstellung für Heimspiel Rostock festlegen", d(2), "hoch", false),
      task("Fehlende Einverständniserklärungen anmahnen", d(1), "hoch", false),
      task("Bälle für Auswärtsspiel einpacken", d(6), "mittel", false),
      task("Beitragsrückstand Ida Wolf klären", d(3), "mittel", false),
      task("Hallenschlüssel-Übergabe organisieren", d(-1), "niedrig", true),
    ];

    // Material / Inventar
    const inventory = [
      inv("Spielbälle (Molten)", 12, 15, "Ballwagen Halle 1"),
      inv("Trainingsbälle", 18, 20, "Ballwagen Halle 1"),
      inv("Netzgarnituren", 2, 2, "Materialraum"),
      inv("Antennen (Paar)", 3, 3, "Materialraum"),
      inv("Erste-Hilfe-Koffer", 1, 2, "Trainerbank"),
      inv("Leibchen (Satz)", 2, 3, "Materialraum"),
    ];

    // Verbandsliga-Tabelle MV (Beispieldaten)
    const standings = [
      st("VC Schwerin", 12, 10, 2, 30, 5, 29),
      st("SKV Volleyball", 12, 9, 3, 28, 8, 27),
      st("Stralsunder VV", 12, 8, 4, 26, 12, 24),
      st("Neubrandenburger SV", 12, 6, 6, 20, 18, 18),
      st("SV Rostock", 12, 5, 7, 17, 22, 15),
      st("VfL Wismar", 12, 4, 8, 15, 25, 12),
      st("TSG Güstrow", 12, 2, 10, 9, 30, 6),
      st("Waren Volleys", 12, 2, 10, 8, 31, 5),
    ];

    // Beispiel-Verbandsmeldung für die weibliche U18
    const wu18Id = deptId("WU18");
    const wu18Players = players.filter((pl) => pl.departmentId === wu18Id);
    const seasonLabel = `${SEASON.year}/${String(SEASON.year + 1).slice(2)}`;
    const meldungen = [
      meldung(seasonLabel, wu18Id, "Verbandsliga MV weibl. U18", "Staffel Nord", "SKV Müritz weibl. U18", "Andrea Berg",
        wu18Players.map((pl) => ({
          playerId: pl.id,
          passNumber: pl.passNumber,
          jahrgang: new Date(pl.birthDate).getFullYear(),
          role: pl.position === "Libero" ? "Libero" : (pl.jerseyNumber === 3 ? "Kapitän" : "Spieler"),
        })), "gemeldet"),
    ];

    return {
      club: CLUB, website: "https://www.skv-mueritz.de", season: SEASON,
      departments, players, events, responses, drivers, jobs, consents, finances,
      clothing, clothingRequests, sponsors, announcements, tasks, inventory, standings, meldungen,
    };
  }

  // ---- Entity-Factories ----
  function p(firstName, lastName, birthDate, position, jerseyNumber, team, parentName, parentEmail, parentPhone, consentOnFile, membershipStatus) {
    return { id: uid("pl"), firstName, lastName, birthDate, position, jerseyNumber, team, parentName, parentEmail, parentPhone, consentOnFile, membershipStatus, notes: "", gender: "w", passNumber: "", departmentId: null };
  }
  function dept(code, name, category, gender, league, ageGroup, trainer, email, times, venue) {
    return { id: uid("de"), code, name, category, gender, league, ageGroup, trainer, email, times, venue, active: true };
  }
  function meldung(season, departmentId, league, staffel, teamName, responsible, entries, status) {
    return { id: uid("vm"), season, departmentId, league, staffel, teamName, responsible, entries: entries || [], status: status || "Entwurf", createdAt: new Date().toISOString() };
  }
  function ev(type, title, start, end, location, opponent) {
    return { id: uid("ev"), type, title, start, end, location, opponent, description: "" };
  }
  function resp(eventId, playerId, status) {
    return { id: uid("rs"), eventId, playerId, status, at: new Date().toISOString() };
  }
  function drv(eventId, name, phone, seats, playerIds) {
    return { id: uid("dr"), eventId, name, phone, seats, playerIds: playerIds || [], notes: "" };
  }
  function job(eventId, category, title, assignee, done) {
    return { id: uid("jb"), eventId, category, title, assignee: assignee || "", done: !!done };
  }
  function consent(playerId, type, fileName, dataUrl, signedBy) {
    return { id: uid("co"), playerId, type, fileName, dataUrl: dataUrl || null, signedBy, uploadedAt: new Date().toISOString() };
  }
  function fin(type, description, amount, date, paid, playerId) {
    return { id: uid("fi"), type, description, amount, date, paid: !!paid, playerId: playerId || null };
  }
  function cloth(name, description, price, sizes, kind, color) {
    return { id: uid("cl"), name, description, price, sizes, kind, color };
  }
  function clothReq(itemId, playerId, size, qty, status) {
    return { id: uid("cr"), itemId, playerId, size, qty, status, at: new Date().toISOString() };
  }
  function sponsor(name, tier, website, contact, contribution, color) {
    return { id: uid("sp"), name, tier, website, contact, contribution, color };
  }
  function ann(title, body, audience) {
    return { id: uid("an"), title, body, audience, date: new Date().toISOString() };
  }
  function task(title, due, priority, done) {
    return { id: uid("ta"), title, due, priority, done: !!done };
  }
  function inv(name, count, target, location) {
    return { id: uid("in"), name, count, target, location };
  }
  function st(team, games, win, loss, setsW, setsL, points) {
    return { team, games, win, loss, setsW, setsL, points };
  }

  // relative date helper: dayOffset from "now", with optional hour/minute
  function d(dayOffset, hour, minute) {
    const base = new Date();
    base.setHours(hour == null ? 12 : hour, minute == null ? 0 : minute, 0, 0);
    base.setDate(base.getDate() + dayOffset);
    return base.toISOString();
  }

  // ---- Persistenz ----
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const s = seed();
    persist(s);
    return s;
  }
  function persist(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s || state)); } catch (e) { /* quota */ }
  }
  function save() { persist(state); }

  function resetDemo() {
    _idc = 1;
    state = seed();
    persist(state);
    return state;
  }

  // ---- Öffentliche API ----
  const Store = {
    CLUB, WEBSITE,
    get: () => state,
    save,
    resetDemo,
    uid,
    // generische CRUD-Helfer für eine Collection
    add(coll, obj) { obj.id = obj.id || uid(coll.slice(0, 2)); state[coll].push(obj); save(); return obj; },
    update(coll, id, patch) {
      const it = state[coll].find((x) => x.id === id);
      if (it) { Object.assign(it, patch); save(); }
      return it;
    },
    remove(coll, id) {
      state[coll] = state[coll].filter((x) => x.id !== id);
      save();
    },
    byId(coll, id) { return state[coll].find((x) => x.id === id); },
  };

  window.Store = Store;
})();
