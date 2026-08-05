/* ==========================================================================
   SKV Volleyball – Datenhaltung (localStorage)
   Kleiner Datenspeicher mit Seed-Daten. Kein Backend nötig – die Plattform
   läuft komplett im Browser. Für den Produktivbetrieb kann dieselbe
   Datenstruktur später an eine echte API/Datenbank angebunden werden.
   ========================================================================== */
(function () {
  "use strict";

  const KEY = "skv_vb_data_v5";
  const CLUB = "SKV Müritz";
  const WEBSITE = "https://www.skv-mueritz.de";

  // ---- kleine ID- & Datums-Helfer (deterministisch, ohne Zufall) ----
  let _idc = 1;
  const uid = (p) => `${p}_${Date.now().toString(36)}_${(_idc++).toString(36)}`;

  // Saison-Anker für die Seed-Daten
  const SEASON = { year: 2026 };

  function seed(includeDemo) {
    // Abteilungen / Mannschaften des Vereins – Jungen-/Herrenbereich
    const departments = [
      dept("HER1", "Herren I", "Aktive", "m", "Landesliga MV", "Herren", "Michael Voß", "herren1@skv-mueritz.de", "Mi & Fr 19:30–21:30", "Sporthalle SKV, Halle 2"),
      dept("MU20", "männliche U20", "Jugend", "m", "Verbandsliga MV männl. U20", "U20", "Thomas Krüger", "mu20@skv-mueritz.de", "Mo & Mi 18:30–20:30", "Sporthalle SKV, Halle 1"),
      dept("MU18", "männliche U18", "Jugend", "m", "Verbandsliga MV männl. U18", "U18", "Andreas Berg", "mu18@skv-mueritz.de", "Mo & Fr 18:00–20:00", "Sporthalle SKV, Halle 1"),
      dept("MU16", "männliche U16", "Jugend", "m", "Verbandsliga MV männl. U16", "U16", "Andreas Berg", "mu16@skv-mueritz.de", "Di & Do 17:00–18:30", "Sporthalle SKV, Halle 1"),
      dept("MU14", "männliche U14", "Jugend", "m", "Bezirksklasse männl. U14", "U14", "Sven Lorenz", "mu14@skv-mueritz.de", "Mi 16:30–18:00", "Sporthalle SKV, Halle 2"),
      dept("MINI", "Mini-Volleyball (U12)", "Nachwuchs", "m", "Mini-Spielfeste MV", "U12", "Sven Lorenz", "mini@skv-mueritz.de", "Fr 16:00–17:30", "Grundschule am See"),
      dept("HOBBY", "Hobby & Freizeit", "Breitensport", "mix", "Freizeitrunde Müritz", "Erwachsene", "Team Hobby", "hobby@skv-mueritz.de", "So 18:00–20:00", "Sporthalle SKV, Halle 1"),
    ];
    const deptId = (code) => (departments.find((x) => x.code === code) || {}).id || null;

    const players = [
      p("Ben", "Bauer", "2009-03-14", "Zuspiel", 3, "U18", "Sabine Bauer", "sabine.bauer@example.de", "0170 1234501", true, "aktiv"),
      p("Luca", "Schulz", "2008-07-02", "Außenangriff", 7, "U18", "Ralf Schulz", "ralf.schulz@example.de", "0170 1234502", true, "aktiv"),
      p("Finn", "Wagner", "2009-11-28", "Mitte", 5, "U18", "Petra Wagner", "petra.wagner@example.de", "0170 1234503", false, "aktiv"),
      p("Jonas", "Krüger", "2010-01-09", "Libero", 11, "U16", "Uwe Krüger", "uwe.krueger@example.de", "0170 1234504", true, "aktiv"),
      p("Paul", "Fischer", "2008-05-21", "Diagonal", 9, "U18", "Anke Fischer", "anke.fischer@example.de", "0170 1234505", true, "aktiv"),
      p("Noah", "Hoffmann", "2010-09-03", "Außenangriff", 4, "U16", "Jens Hoffmann", "jens.hoffmann@example.de", "0170 1234506", false, "aktiv"),
      p("Elias", "Weber", "2009-07-08", "Mitte", 8, "U18", "Karin Weber", "karin.weber@example.de", "0170 1234507", true, "aktiv"),
      p("Emil", "Schneider", "2011-02-17", "Zuspiel", 6, "U16", "Tim Schneider", "tim.schneider@example.de", "0170 1234508", true, "aktiv"),
      p("Leon", "Meyer", "2010-12-01", "Libero", 12, "U16", "Nadja Meyer", "nadja.meyer@example.de", "0170 1234509", false, "aktiv"),
      p("Max", "Richter", "2008-08-25", "Diagonal", 10, "U18", "Frank Richter", "frank.richter@example.de", "0170 1234510", true, "aktiv"),
      p("Anton", "Klein", "2011-04-30", "Außenangriff", 2, "U16", "Bea Klein", "bea.klein@example.de", "0170 1234511", true, "aktiv"),
      p("Tom", "Wolf", "2009-07-08", "Mitte", 14, "U18", "Olaf Wolf", "olaf.wolf@example.de", "0170 1234512", false, "beitragsrückstand"),
    ];

    // Spieler den Abteilungen zuordnen und Passnummern vergeben
    const teamToDept = { U20: "MU20", U18: "MU18", U16: "MU16", U14: "MU14", Herren: "HER1" };
    players.forEach((pl, i) => {
      pl.departmentId = deptId(teamToDept[pl.team] || null);
      pl.passNumber = `MV${SEASON.year}${String(10001 + i)}`;
    });
    // Beispiel-Kontaktdaten: ältere Spieler mit eigener Nummer/Mail, teils Erstkontakt Spieler
    Object.assign(players[0], { playerPhone: "0151 2340001", playerEmail: "ben.bauer@example.de", contactPreference: "both" });
    Object.assign(players[1], { playerPhone: "0151 2340002", playerEmail: "luca.schulz@example.de", contactPreference: "player" });
    Object.assign(players[4], { playerPhone: "0151 2340005", contactPreference: "both" });
    // Beispiel: getrennte Eltern – zweites Elternfeld belegt
    Object.assign(players[2], { parent2Name: "Dirk Wagner", parent2Email: "dirk.wagner@example.de", parent2Phone: "0170 5554503" });
    Object.assign(players[8], { parent2Name: "Peter Meyer", parent2Email: "peter.meyer@example.de", parent2Phone: "0170 5554509" });

    const events = [
      ev("training", "Training mU18", d(0, 18, 0), d(0, 20, 0), "Sporthalle SKV, Halle 1", ""),
      ev("training", "Training mU16", d(1, 17, 0), d(1, 18, 30), "Sporthalle SKV, Halle 1", ""),
      ev("home", "Heimspiel vs. SV Rostock", d(3, 11, 0), d(3, 14, 0), "Sporthalle SKV, Halle 1", "SV Rostock"),
      ev("training", "Training mU18", d(5, 18, 0), d(5, 20, 0), "Sporthalle SKV, Halle 1", ""),
      ev("away", "Auswärtsspiel @ VC Schwerin", d(7, 14, 0), d(7, 17, 0), "Sport- und Kongresshalle Schwerin", "VC Schwerin"),
      ev("training", "Training mU16", d(8, 17, 0), d(8, 18, 30), "Sporthalle SKV, Halle 1", ""),
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

    // Vorlagen für Einverständniserklärungen (vom Trainer selbst verwaltbar)
    const consentTemplates = [
      ctpl("Datennutzung & Fotorechte", "Einverständnis zur Speicherung von Kontaktdaten sowie zur Veröffentlichung von Mannschafts- und Spielfotos auf Vereinswebsite und in Vereinsmedien.", true),
      ctpl("Fahrten & Aufsicht", "Einverständnis zur Mitfahrt in privaten PKW zu Auswärtsspielen und zur Aufsicht durch das Trainerteam während Fahrten und Spielen.", true),
      ctpl("Medizinische Notfallversorgung", "Einverständnis zur Veranlassung notwendiger ärztlicher Maßnahmen im Notfall, wenn die Eltern nicht erreichbar sind.", true),
      ctpl("Teilnahme Trainingslager", "Einverständnis zur Teilnahme am Trainingslager inkl. Übernachtung.", false),
      ctpl("Teilnahme an der Erwachsenenliga",
        "Hiermit erkläre ich mich damit einverstanden, dass mein Kind am Spiel- und Trainingsbetrieb der Erwachsenenmannschaften des SKV Müritz (z. B. Herren I, Landesliga/Verbandsliga Mecklenburg-Vorpommern) teilnimmt.\n\n" +
        "Mir ist bekannt, dass:\n" +
        "• mein Kind dabei gemeinsam mit erwachsenen Spielern trainiert und Wettkämpfe bestreitet,\n" +
        "• die Teilnahme im Rahmen der Jugendschutzbestimmungen und der Spielordnung des Volleyball-Verbands Mecklenburg-Vorpommern (VVMV) erfolgt,\n" +
        "• für den Einsatz in Erwachsenenmannschaften ggf. eine gesonderte Spielberechtigung/Doppelspielrecht beim Verband beantragt wird,\n" +
        "• die Aufsicht während Training und Spielen durch das Trainerteam gewährleistet ist.\n\n" +
        "Diese Zustimmung gilt für die laufende Saison und kann jederzeit schriftlich widerrufen werden.", false),
      ctpl("Kontaktaufnahme & WhatsApp-Gruppe",
        "Hiermit erkläre ich mich damit einverstanden, dass das Trainerteam des SKV Müritz mich in Angelegenheiten des Trainings- und Spielbetriebs kontaktiert (z. B. Terminänderungen, Fahrten, Rückmeldungen).\n\n" +
        "Dazu gebe ich freiwillig meine E-Mail-Adresse und meine Mobilnummer an (Felder unten) und stimme zu, dass diese ausschließlich für die Vereinskommunikation gespeichert und genutzt werden.\n\n" +
        "☐ Ich bin außerdem einverstanden, in die WhatsApp-Elterngruppe der Mannschaft aufgenommen zu werden. Mir ist bekannt, dass WhatsApp Daten außerhalb der EU verarbeiten kann und die Teilnahme freiwillig ist; alle wichtigen Informationen erhalte ich auf Wunsch alternativ per E-Mail.\n\n" +
        "Diese Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden.", true),
    ];

    // Kalender-Abos (iCal/RSS) für automatischen Termin-Import
    const calendarFeeds = [
      feed("VVMV Spielplan (Beispiel)", "https://mv.sams-ticket.de/public/ical-beispiel.ics", "ical", false),
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
      st("SKV Müritz", 12, 9, 3, 28, 8, 27),
      st("Stralsunder VV", 12, 8, 4, 26, 12, 24),
      st("Neubrandenburger SV", 12, 6, 6, 20, 18, 18),
      st("SV Rostock", 12, 5, 7, 17, 22, 15),
      st("VfL Wismar", 12, 4, 8, 15, 25, 12),
      st("TSG Güstrow", 12, 2, 10, 9, 30, 6),
      st("Waren Volleys", 12, 2, 10, 8, 31, 5),
    ];

    // Schulfreie Tage in Mecklenburg-Vorpommern (Stand: offizielle Ferientermine
    // Bildungsministerium MV; werden per Ferien-Abo automatisch aktualisiert)
    const holidays = [
      hol("Sommerferien MV", "2026-07-13", "2026-08-22"),
      hol("Tag der Deutschen Einheit", "2026-10-03", "2026-10-03"),
      hol("Herbstferien MV", "2026-10-15", "2026-10-24"),
      hol("Reformationstag", "2026-10-31", "2026-10-31"),
      hol("Weihnachtsferien MV", "2026-12-21", "2027-01-02"),
      hol("Winterferien MV", "2027-02-08", "2027-02-19"),
      hol("Internationaler Frauentag", "2027-03-08", "2027-03-08"),
      hol("Osterferien MV", "2027-03-22", "2027-03-31"),
      hol("Tag der Arbeit", "2027-05-01", "2027-05-01"),
      hol("Christi Himmelfahrt", "2027-05-06", "2027-05-06"),
      hol("Pfingstferien MV", "2027-05-07", "2027-05-07"),
      hol("Pfingstferien MV", "2027-05-14", "2027-05-18"),
      hol("Sommerferien MV", "2027-07-12", "2027-08-28"),
      hol("Herbstferien MV", "2027-10-18", "2027-10-29"),
      hol("Weihnachtsferien MV", "2027-12-20", "2028-01-03"),
    ];

    // Bearbeitbare Link-Sammlung (Übersicht & Verbandsseite)
    const links = [
      lnk("🏠", "Vereinswebsite SKV Müritz", "Offizielle Seite des Vereins", WEBSITE),
      lnk("🏐", "Volleyball-Verband MV (VVMV)", "Startseite des Landesverbands", "https://www.vvmv.de/"),
      lnk("📊", "Ligen & Tabellen", "Aktuelle Tabellen im SAMS-Spielbetrieb", "https://mv.sams-ticket.de/public/ranking.html"),
      lnk("📅", "Spielplan & Termine", "Ansetzungen der Verbandsliga", "https://mv.sams-ticket.de/public/schedule.html"),
      lnk("📋", "Spielbetrieb / Meldung", "Infos zum Spielbetrieb des VVMV", "https://www.vvmv.de/spielbetrieb/"),
      lnk("⚖️", "Regeln & Ordnungen", "Spielordnung und Regelwerk", "https://www.volleyball-verband.de/regelwerk"),
      lnk("🧑‍⚖️", "Schiedsrichterwesen", "Ansetzungen & Ausbildung", "https://www.vvmv.de/schiedsrichter/"),
      lnk("🏖", "Ferientermine MV (offiziell)", "Bildungsserver Mecklenburg-Vorpommern", "https://www.bildung-mv.de/schueler/ferien/"),
    ];

    // Elternbriefe des Trainers (bearbeitbar, mehrere möglich)
    const letters = [
      letter("Elternbrief zum Saisonstart",
        "Liebe Eltern,\n\n" +
        "ein neues Volleyball-Jahr liegt vor uns – und ich freue mich riesig, Ihre Kinder dabei zu begleiten! " +
        "Unsere Mannschaft trainiert mit großem Einsatz, wächst als Team zusammen und wird in dieser Saison auch in der Erwachsenenliga wertvolle Erfahrungen sammeln. " +
        "Damit das gelingt, brauchen wir Sie: Ohne die Unterstützung der Eltern ist Jugendsport im Verein nicht möglich. " +
        "Vieles davon kostet wenig Zeit, bewirkt aber sehr viel – und ganz nebenbei erleben Sie Ihr Kind dort, wo es über sich hinauswächst.\n\n" +
        "## 🚗 Fahrten zu Auswärtsspielen\n" +
        "Zu Auswärtsspielen fahren wir wann immer möglich mit dem Vereinsbus – ich fahre als Trainer immer selbst mit. " +
        "Wenn die Plätze im Bus nicht ausreichen, bin ich auf einzelne Eltern angewiesen, die mit dem eigenen PKW einige Spieler mitnehmen. " +
        "Bitte geben Sie unten an, ob Sie grundsätzlich als Fahrer/in zur Verfügung stehen – die konkrete Abstimmung erfolgt rechtzeitig vor jedem Spiel.\n\n" +
        "## 🥗 Heimspiele: kleines Buffet\n" +
        "Bei Heimspielen ist es guter Brauch, dass die gastgebende Mannschaft für beide Teams ein kleines Buffet organisiert: Salat, belegte Brötchen, Kuchen und Getränke. " +
        "Das übernehmen die Eltern der Heimmannschaft gemeinsam – wenn jede Familie einmal pro Saison etwas beisteuert, ist es für alle leicht zu stemmen. " +
        "Zusätzlich sollten pro Heimspiel zwei Elternteile anwesend sein, die den Stand betreuen. " +
        "Bitte tragen Sie sich dafür in die Listen ein, die ich vor jedem Heimspiel herumgebe.\n\n" +
        "## 📱 Kommunikation\n" +
        "Damit Informationen zu Training, Spielen und Fahrten Sie schnell erreichen, möchte ich Sie gern direkt kontaktieren können und organisiere die Eltern in einer WhatsApp-Gruppe. " +
        "Bitte geben Sie dazu unten Ihre E-Mail-Adresse und Mobilnummer an. Die Daten werden ausschließlich für die Vereinskommunikation genutzt; " +
        "die Teilnahme an der WhatsApp-Gruppe ist freiwillig – wichtige Informationen erhalten Sie auf Wunsch auch per E-Mail.\n\n" +
        "Ich freue mich auf eine tolle Saison mit Ihren Kindern – und auf Sie am Spielfeldrand!",
        "", true, true),
    ];

    // Beispiel-Verbandsmeldung für die männliche U18
    const mu18Id = deptId("MU18");
    const mu18Players = players.filter((pl) => pl.departmentId === mu18Id);
    const seasonLabel = `${SEASON.year}/${String(SEASON.year + 1).slice(2)}`;
    const meldungen = [
      meldung(seasonLabel, mu18Id, "Verbandsliga MV männl. U18", "Staffel Nord", "SKV Müritz männl. U18", "Andreas Berg",
        mu18Players.map((pl) => ({
          playerId: pl.id,
          passNumber: pl.passNumber,
          jahrgang: new Date(pl.birthDate).getFullYear(),
          role: pl.position === "Libero" ? "Libero" : (pl.jerseyNumber === 3 ? "Kapitän" : "Spieler"),
        })), "gemeldet"),
    ];

    // Struktur-Daten (Abteilungen, Vorlagen, Kleidung, Ferien) sind immer dabei –
    // personen- und terminbezogene Beispieldaten nur im Demo-Modus.
    return {
      club: CLUB, website: "https://www.skv-mueritz.de", season: SEASON,
      departments, consentTemplates, clothing, holidays, letters, links,
      players: includeDemo ? players : [],
      events: includeDemo ? events : [],
      responses: includeDemo ? responses : [],
      drivers: includeDemo ? drivers : [],
      jobs: includeDemo ? jobs : [],
      consents: includeDemo ? consents : [],
      calendarFeeds: includeDemo ? calendarFeeds : [],
      finances: includeDemo ? finances : [],
      clothingRequests: includeDemo ? clothingRequests : [],
      sponsors: includeDemo ? sponsors : [],
      announcements: includeDemo ? announcements : [],
      tasks: includeDemo ? tasks : [],
      inventory: includeDemo ? inventory : [],
      standings: includeDemo ? standings : [],
      meldungen: includeDemo ? meldungen : [],
    };
  }

  // ---- Entity-Factories ----
  function p(firstName, lastName, birthDate, position, jerseyNumber, team, parentName, parentEmail, parentPhone, consentOnFile, membershipStatus) {
    return { id: uid("pl"), firstName, lastName, birthDate, position, jerseyNumber, team,
      // Kontakt Spieler selbst
      playerPhone: "", playerEmail: "",
      // Erstkontakt: "player" | "parents" | "both"
      contactPreference: "parents",
      // Elternteil 1
      parentName, parentEmail, parentPhone,
      // Elternteil 2 (z. B. bei getrennten Eltern)
      parent2Name: "", parent2Email: "", parent2Phone: "",
      consentOnFile, membershipStatus, notes: "", gender: "m", passNumber: "", departmentId: null };
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
  function ctpl(name, text, required) {
    return { id: uid("ct"), name, text, required: !!required };
  }
  function feed(name, url, type, autoSync) {
    return { id: uid("cf"), name, url, type: type || "ical", autoSync: !!autoSync, lastSync: null, lastResult: "" };
  }
  function lnk(icon, title, sub, url) {
    return { id: uid("lk"), icon, title, sub, url };
  }
  function letter(title, body, deadline, includeHomeGames, includeSlip) {
    return { id: uid("le"), title, body, deadline: deadline || "", includeHomeGames: !!includeHomeGames, includeSlip: !!includeSlip, createdAt: new Date().toISOString() };
  }
  function hol(name, start, end) {
    // src "auto": stammt aus Seed/Ferien-Abo und wird beim Sync ersetzt;
    // manuell angelegte Einträge haben kein src und bleiben erhalten
    return { id: uid("ho"), name, start, end, src: "auto" };
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
    // Erststart: OHNE Demodaten (leerer Verein mit Struktur)
    const s = seed(false);
    persist(s);
    return s;
  }
  function persist(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s || state)); } catch (e) { /* quota */ }
  }
  function save() { persist(state); }

  function resetDemo() {
    _idc = 1;
    state = seed(true);
    persist(state);
    return state;
  }
  function resetEmpty() {
    _idc = 1;
    state = seed(false);
    persist(state);
    return state;
  }
  // Kompletten Datenbestand ersetzen (z. B. nach CSV-Import); unbekannte Felder bleiben erhalten
  function replaceAll(obj) {
    state = Object.assign({}, seed(false), obj);
    persist(state);
    return state;
  }

  // ---- Öffentliche API ----
  const Store = {
    CLUB, WEBSITE,
    get: () => state,
    save,
    resetDemo, resetEmpty, replaceAll,
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
