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
      pl.departmentIds = pl.departmentId ? [pl.departmentId] : [];
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

    // Trainings-Bausteine für die Trainingsplanung (vom Trainerteam erweiterbar).
    // Aufbau nach klassischer Trainingslehre: Erwärmung → Technik → Spielform →
    // Abschlussspiel → Cool-down. minSp/maxSp = sinnvolle Teilnehmerzahl (0 = egal).
    const uebungen = [
      ueb("Lauf-ABC & Mobilisation", "aufwaermen", 10, 0, 0, "Zwei Runden lockeres Einlaufen, dann Lauf-ABC über die Hallenlänge (Skippings, Anfersen, Seitgalopp, Hopserlauf), dazwischen Schulterkreisen und Hüftmobilisation. Puls langsam hochfahren, Sprunggelenke gezielt vorbereiten."),
      ueb("Ballgewöhnung in Paaren", "aufwaermen", 10, 2, 0, "Je zwei mit einem Ball: Zuwerfen und Fangen in Bewegung, dann Pritschen und Baggern im Wechsel, Abstand schrittweise vergrößern. Viele Kontakte ohne Druck – auf saubere Grundposition und Beinarbeit achten."),
      ueb("Chaosball / Fangspiel", "aufwaermen", 8, 6, 0, "Fang- oder Ballspiel mit hohem Tempo (z. B. zwei Fänger:innen, Ball in der Hand schützt). Alle in Bewegung, Regeln alle 2–3 Minuten variieren – Puls und Stimmung steigen gemeinsam."),
      ueb("Athletik-Zirkel", "aufwaermen", 12, 4, 0, "4–6 Stationen à 40 Sekunden (Plank, Ausfallschritte, Linien-Sprünge, Seilspringen, Wandsitz), 20 Sekunden Wechselpause, zwei Runden. Saubere Ausführung vor Tempo; für Jugend die Belastung halbieren."),
      ueb("Baggern in Paaren", "technik", 10, 2, 0, "Zuwurf – Bagger zurück, dann Bagger-Bagger direkt. Fokus: ruhige, stabile Plattform, Beine arbeiten, Ballkontakt vor dem Körper. Steigerung: seitliches Verschieben vor jedem Kontakt oder Zielzonen am Boden."),
      ueb("Pritschen übers Netz", "technik", 10, 4, 0, "Paare oder Dreiecke am Netz: hohes Zuspiel in markierte Zonen, erst frontal, dann über Kopf. Körper unter den Ball, Kontakt auf Stirnhöhe, symmetrische Handarbeit. Wettkampf: Wer trifft zuerst 10-mal die Zone?"),
      ueb("Aufschlag-Serie", "technik", 12, 4, 0, "Erst Sicherheit (fünf Aufschläge ins Feld), dann Zielfelder mit Hütchen (Zonen 1/5/6). Mini-Wettkampf mit Teamzähler: Treffer zählen, Fehlaufschlag kostet einen Sprint zur Linie."),
      ueb("Annahme-Riegel", "technik", 15, 6, 0, "Dreier-Riegel nimmt echte Aufschläge an, am Netz wird gefangen oder gestellt. Jede Annahme bewerten (3 = perfekt, 2 = spielbar, 1 = Notlösung); nach zehn Aufschlägen rotieren – der beste Riegel gewinnt."),
      ueb("Angriff aus Zuspiel", "technik", 15, 6, 0, "Hohe Bälle auf Position 4 (später 2), Angriff mit vollem Anlauf: Drei-Schritt-Rhythmus, Absprung hinter dem Ball, Schlag über der Schulter. Erst ohne, dann gegen Einerblock."),
      ueb("Blocktraining am Netz", "technik", 12, 4, 0, "Fußarbeit am Netz (Side-Steps, Kreuzschritt), Blocksprung mit aktiven Händen über der Kante, Timing gegen Angriff von Kiste oder Zuwurf. Ab acht Teilnehmenden Doppelblock mit Absprache üben."),
      ueb("Abwehr-Drill (Dig)", "technik", 12, 4, 0, "Harte Bälle aus Trainerhand auf die Abwehr: tiefe Position, Arme früh raus, Ball hoch in die Feldmitte. Hechttechnik nur nach Einweisung und altersgerecht dosieren."),
      ueb("Kleinfeld 2:2", "spielform", 15, 4, 8, "Feld längs geteilt, 2 gegen 2 mit drei Pflichtkontakten (Annahme – Zuspiel – Angriff). Jede:r macht alles, maximale Ballkontakte. Bis 11 zählen; Gewinnerpaar rückt Richtung Kaiserfeld auf."),
      ueb("Kleinfeld 3:3", "spielform", 15, 6, 12, "3 gegen 3 auf halbem Feld mit Pflicht-Zuspiel über die Mitte. Sauberer Aufbau mit drei Kontakten und lauter Kommunikation („Ich!“). Varianten: nur Longline-Angriff oder Pflicht-Finte."),
      ueb("4 gegen 4 mit Aufgaben", "spielform", 15, 8, 12, "4 gegen 4 auf dem Großfeld mit Zusatzregeln – z. B. Punkt zählt nur nach drei Berührungen oder nach Angriff aus dem Rückraum. Zwingt zu Taktik, Lücken erkennen und ansagen."),
      ueb("Königsfeld", "spielform", 15, 9, 0, "Zwei Felder: Wer den Ballwechsel gewinnt, bleibt auf dem Königsfeld, Herausforderer rücken nach. Kurze Ballwechsel, hohes Tempo, große Motivation. Über Dankeball-Einwürfe des Trainerteams steuerbar."),
      ueb("Sideout-Spiel 6:6", "spielform", 20, 12, 0, "6 gegen 6, ein Team ausschließlich in Annahme (Sideout): Punkt für den sauberen K1-Abschluss, das Aufschlagteam punktet beim Break. Nach fünf Aufschlägen Wechsel – spielnäher geht Annahmetraining nicht."),
      ueb("Abschlussspiel 6:6", "abschluss", 15, 12, 0, "Freies 6:6 mit einer Zusatzaufgabe aus dem Technikteil des Tages (z. B. jeder Angriff mit Absicherung). Normale Zählweise und Rotation – das Gelernte unter Wettkampfdruck anwenden."),
      ueb("Match-Satz bis 15", "abschluss", 15, 8, 0, "Verkürzter Satz bis 15 mit allem, was dazugehört: feste Aufstellung, Auszeiten, Coaching wie am Spieltag. Ideal als Generalprobe vor Punktspielen."),
      ueb("Kleinfeld-Turnier", "abschluss", 15, 6, 0, "Schnellturnier 2:2 oder 3:3 mit Fünf-Minuten-Spielen: Gewinner rücken auf, Punkte werden je Person gezählt. Motivierender Abschluss mit vielen Ballkontakten – auch für kleine Gruppen."),
      ueb("Dehnen & Feedback", "cooldown", 5, 0, 0, "Dehnprogramm im Kreis (Schultern, hintere Kette, Hüfte) mit kurzer Trainingsauswertung: Was lief gut, woran arbeiten wir nächstes Mal? Ausblick auf die kommenden Termine."),
      ueb("Auslaufen & Abschlusskreis", "cooldown", 5, 0, 0, "Zwei lockere Runden auslaufen, danach Abschlusskreis mit Teamritual (gemeinsamer Ruf). Kurz und verbindlich – ein gleichbleibendes Ende gibt jedem Training Struktur."),
      // ---- Bausteine nach Ideen von volleyballkompass.de und VolleyballFREAK (mit Quelle/Link) ----
      ueb("Lauftennis", "aufwaermen", 10, 6, 0, "Tennisartige Spielform über das Netz für zwei Teams: Nach jeder eigenen Aktion wird auf die andere Feldseite durchgelaufen (Rundlauf-Prinzip). Bringt Puls, Orientierung und erste Ballkontakte in einem – Regeln und Varianten im Übungsblatt.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/PDF___K_Lauftennis.pdf"),
      ueb("Netz-und-Matte-Challenge", "aufwaermen", 12, 8, 0, "Erwärmungs-Wettkampf zweier Teams rund um Netz und Weichbodenmatte: Pritschen und Baggern sind fest in die Spielform eingebaut, gezählt wird in kleinen Challenges. Kompletter Aufbau im Übungsblatt.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/__K_Netz_Matte.pdf"),
      ueb("WarmUp-Challenge mit Wasserkisten", "aufwaermen", 10, 8, 0, "Zwei Teams räumen per lockerem Aufschlag Wasserkisten-Ziele auf der Gegenseite ab – Aufschlag-Sicherheit im Wettkampfformat, schon beim Warmmachen. Ablauf im Video.", "volleyballkompass.de (Video)", "https://youtu.be/Azcgwyy9ozI"),
      ueb("Koordinationsleiter-Drills", "aufwaermen", 10, 0, 0, "Frequenzläufe, In-In-Out-Out und seitliche Muster durch die Koordinationsleiter – erst langsam und sauber, dann mit Tempo. Volleyballnah wird es mit anschließendem Block- oder Abwehrsprint; Übungskatalog im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/Koordinationsleiter_Drills.pdf"),
      ueb("SA-Zirkel (Schnellkraft-Ausdauer)", "aufwaermen", 15, 4, 0, "Stationszirkel für Schnellkraft- und Schnelligkeitsausdauer: kurze maximale Belastungen (Sprünge, Sprints, Würfe) im Wechsel mit knappen Pausen. Stationen und Dosierung im Video – stark in der Saisonvorbereitung.", "volleyballkompass.de (Video)", "https://youtu.be/BTCdoNZ3Sv0"),
      ueb("Kraftausdauer-Zirkel (Endurance-Circuit)", "aufwaermen", 15, 4, 0, "Kraftausdauer-Stationen für das ganze Team (Rumpf, Beine, Schultergürtel) – ohne Geräte in jeder Halle umsetzbar. Stationskarten mit Belastungs- und Pausenzeiten im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/Kraftausdauerzirkel_2018_Kompass.pdf"),
      ueb("Zirkeltraining 12 × 1 Minute", "aufwaermen", 12, 4, 0, "Zwölf Stationen à eine Minute praktisch ohne Pause – kompakter Konditionsblock für die Schnelligkeitsausdauer, komplett in einer Viertelstunde erledigt. Stationsliste im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/Schnelligkeitsausdauerzirkel1.pdf"),
      ueb("Mobilisation & Stabilisation (Mobi/Stabi)", "aufwaermen", 10, 0, 0, "Geführtes Programm zur Mobilisation (Schulter, Brustwirbelsäule, Hüfte) und Stabilisation (Rumpf, Schulterblatt) – Verletzungsprophylaxe speziell für Volleyball. Leitfaden mit Übungen im PDF, auch als ruhiger Ausklang geeignet.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/SA_Mobi_Stabi_Ausgabe1_.pdf"),
      ueb("Sprungkraft-Programm", "aufwaermen", 12, 0, 0, "Sprungkraft ohne Geräte: Aufsteigen auf Kasten oder Bank, Seitsprünge, beidbeinige Sprünge und mehr – als kurzer Block in jedes Training integrierbar. Im Artikel: zehn Übungen mit Videos und Hinweisen zur altersgerechten Dosierung.", "VolleyballFREAK", "https://www.volleyballfreak.de/steigerung-sprungkraft-volleyball-training"),
      ueb("Aufschlag-Annahme-Rundlauf", "technik", 15, 6, 0, "Der Klassiker: Auf einer Seite wird aufgeschlagen, auf der anderen angenommen – nach jeder Aktion rücken alle eine Station weiter (Aufschlag → Annahme → Ball holen). Hohe Wiederholungszahl für beide Techniken, niemand steht herum. Ablauf im Video.", "VolleyballFREAK (Video)", "https://www.volleyballfreak.de/der-aufschlag-annahme-rundlauf"),
      ueb("Baggertennis-Varianten", "technik", 12, 4, 0, "Baggertennis über das Netz (1:1 bis 3:3): gespielt wird ausschließlich im unteren Zuspiel, wahlweise mit einem erlaubten Bodenkontakt. Mehrere Varianten mit steigender Schwierigkeit im PDF – spielerische Schule für Plattform und Beinarbeit.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A36_Baggertennis2.pdf"),
      ueb("Einschlagen mal anders", "technik", 10, 6, 0, "Spielnahe Alternative zum klassischen Einschlagen über Position 4: mit Annahme- bzw. Abwehranteil vor dem Angriff, damit das Einschlagen echte Spielsituationen abbildet. Ablauf im Video – auch als Routine vor Punktspielen.", "volleyballkompass.de (Video)", "https://youtu.be/XQrHZfGPK2I"),
      ueb("Aufschlag-Taktik-Training", "technik", 10, 4, 0, "Drei sofort anwendbare Aufschlag-Taktiken (auf die schwächste Annahme, in Laufwege, auf die Nahtstelle zwischen zwei Spieler:innen) mit passenden Übungsformen. Video ansehen, Zielzonen markieren, in Serien üben.", "volleyballkompass.de (Video)", "https://youtu.be/g3L8wAlzoY4"),
      ueb("Abwehr-Übungspaket", "technik", 15, 6, 0, "Übungsreihe für die Feldabwehr: vom Einzeldrill (Position, Plattform) über Zweierabwehr mit Absprache bis zur Sechser-Teamabwehr gegen echten Angriff. Aufbauten und Steigerungen im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A53_Abwehr.pdf"),
      ueb("Mehrball-Übungen", "technik", 15, 6, 0, "Mehrballtraining mit hoher Schlagzahl: Das Trainerteam bringt in schneller Folge Bälle ins Spiel (Annahme → Abwehr → Freeball …), die Gruppe spielt jede Situation zu Ende. Viele Aktionen pro Minute; Übungsbeispiele im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A25_Mehrballu__bungen.pdf"),
      ueb("Annahmekönig (K1-Spielaufbau)", "spielform", 15, 8, 0, "Wettkampfform für den Komplex 1: Annahme-Riegel, Zuspiel und Angriff spielen den Ballwechsel strukturiert aus, gepunktet wird nach Qualität von Annahme und Abschluss. Wer verteidigt den Titel Annahmekönig:in? Aufbau im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A65_Annahmek__nig.pdf"),
      ueb("Angriff „Hase“ (komplex)", "spielform", 15, 8, 0, "Komplexe Angriffsübung: Nach dem eigenen Angriff folgt sofort die nächste Aufgabe (Absicherung, Abwehr, erneuter Angriff) – spielnahe Dauerbelastung für Angreifer:innen mit Wettkampf-Zählung. Kompletter Aufbau im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A64_AngriffHase.pdf"),
      ueb("Kleinfeldspiele-Sammlung", "spielform", 15, 4, 12, "Ideenkatalog kleiner Spielformen von 1:1 bis 4:4 mit Feldgrößen, Regeln und Zählweisen – für jede Gruppengröße und jedes Niveau die passende Form mit maximalen Ballkontakten. Sammlung im PDF.", "volleyballkompass.de", "https://volleyballkompass.de/pdf/A7_Kleinfeldspiele.pdf"),
      ueb("Dankeball vermeiden & bestrafen", "spielform", 12, 6, 0, "Spielform zur Dankeball-Situation: Ein Team übt, aus Drucksituationen keinen einfachen Freeball zu schenken; das andere trainiert, Dankebälle konsequent zu verwerten (aggressive Feldposition, schneller Gegenaufbau). Hintergrund und Video im Artikel.", "VolleyballFREAK (Video)", "https://www.volleyballfreak.de/dankeball-freeball-volleyball"),
      ueb("Hallengewöhnung auswärts", "aufwaermen", 10, 6, 0, "Feste Routine für fremde Hallen: Decke und Licht mit hohen Bällen austesten, Boden- und Raumgefühl über Annahme-/Abwehrserien aufbauen, Aufschläge auf Zonen kalibrieren. Ablauf im Video – gibt dem Team Sicherheit am Auswärtsspieltag.", "volleyballkompass.de (Video)", "https://youtu.be/ZFJHjLLRUh8"),
    ];

    // Vorlagen für Einverständniserklärungen (vom Trainer selbst verwaltbar)
    const consentTemplates = [
      ctpl("Datennutzung & Fotorechte", "Einverständnis zur Speicherung von Kontaktdaten sowie zur Veröffentlichung von Mannschafts- und Spielfotos auf Vereinswebsite und in Vereinsmedien.", true),
      ctpl("Fahrten & Aufsicht",
        "Zu Auswärtsspielen fahren wir wann immer möglich mit dem Vereinsbus; es begleitet immer mindestens ein Mitglied des Trainerteams die Mannschaft. " +
        "Reichen die Plätze im Vereinsbus nicht aus, erfolgt die Fahrt in privaten PKW einzelner Eltern.\n\n" +
        "Hiermit erkläre ich mich mit der Mitfahrt meines Kindes im Vereinsbus und in privaten PKW zu Auswärtsspielen sowie mit der Aufsicht durch das Trainerteam während Fahrten, Trainings und Spielen einverstanden.", true),
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
      feed("VMV-Spielplan (Beispiel – echte iCal-Adresse aus dem SAMS-Portal eintragen)", "", "ical", false),
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
      lnk("💬", "WhatsApp-Elterngruppe", "Einladungslink der Gruppe – eigenen Link per ✏️ eintragen", "https://chat.whatsapp.com/"),
      lnk("🏠", "Vereinswebsite SKV Müritz", "Offizielle Seite des Vereins", WEBSITE),
      lnk("🏐", "Volleyball-Verband MV (VMV)", "Startseite des Landesverbands", "https://www.vmv24.de/"),
      lnk("📊", "Ligen & Tabellen", "Offizielle Tabellen der Hallensaison", "https://www.vmv24.de/"),
      lnk("📅", "Live-Ticker & Ergebnisse", "SAMS-Ticker des VMV", "https://vmv.sams-ticker.de/"),
      lnk("📋", "Spielbetrieb / Meldung", "SAMS-Meldeportal des VMV", "https://vmv.sams-server.de/ma/"),
      lnk("⚖️", "Regeln & Ordnungen", "Spielordnung und Regelwerk (DVV)", "https://www.volleyball-verband.de/de/service/schiedsrichter/regelwerk/"),
      lnk("🏖", "Ferientermine MV (offiziell)", "Bildungsministerium Mecklenburg-Vorpommern", "https://www.regierung-mv.de/Landesregierung/bm/Schule/Schulorganisation/Ferientermine/"),
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
        "Zu Auswärtsspielen fahren wir wann immer möglich mit dem Vereinsbus – es begleitet immer mindestens ein Mitglied des Trainerteams die Mannschaft. " +
        "Wenn die Plätze im Bus nicht ausreichen, sind wir auf einzelne Eltern angewiesen, die mit dem eigenen PKW einige Spieler mitnehmen. " +
        "Bitte geben Sie unten an, ob Sie grundsätzlich als Fahrer/in zur Verfügung stehen – die konkrete Abstimmung erfolgt rechtzeitig vor jedem Spiel.\n\n" +
        "## 🥗 Heimspiele: kleines Buffet\n" +
        "An unseren Heimspieltagen sind immer drei Mannschaften in der Halle. Es ist guter Brauch, dass die gastgebende Mannschaft für alle drei Mannschaften ein kleines Buffet organisiert: Salat, belegte Brötchen, Kuchen und Getränke. " +
        "Das übernehmen die Eltern der Heimmannschaft gemeinsam – wenn jede Familie einmal pro Saison etwas beisteuert, ist es für alle leicht zu stemmen. " +
        "Zusätzlich sollten pro Heimspiel zwei Elternteile anwesend sein, die den Stand betreuen. " +
        "Bitte tragen Sie sich dafür in die Listen ein, die das Trainerteam vor jedem Heimspiel herumgibt.\n\n" +
        "## 📱 Kommunikation & WhatsApp-Gruppe\n" +
        "Kurzfristige Änderungen gehören zum Spielbetrieb: verlegte Spiele, geänderte Hallenzeiten, Abfahrtszeiten zu Auswärtsspielen oder ein ausgefallenes Training. " +
        "Solche Informationen erreichen Sie zuverlässig nur über unsere WhatsApp-Elterngruppe – die Aufnahme aller Familien ist deshalb für den reibungslosen Ablauf der Saison notwendig. " +
        "Bitte stimmen Sie unten der Aufnahme zu und geben Sie Ihre E-Mail-Adresse und Mobilnummer an; die Daten werden ausschließlich für die Vereinskommunikation der Volleyball-Abteilung genutzt.\n\n" +
        "Wir freuen uns auf eine tolle Saison mit Ihren Kindern – und auf Sie am Spielfeldrand!",
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
      departments, consentTemplates, clothing, holidays, letters, links, uebungen,
      // Eigene Termin-Kategorien (zusätzlich zu Training/Heim/Auswärts/Termin);
      // Events speichern die Kategorie-ID im Feld type.
      eventCategories: [],
      // Buffet-Ankündigungen je Heimspiel (aus dem Portal)
      buffet: [],
      // Abwesenheits-Meldungen der Familien (aus dem Portal)
      abwesenheiten: [],
      // Eigene Quizfragen des Trainerteams (ergänzen die eingebauten Kapitel)
      quizFragen: [],
      // WhatsApp-Gruppen (Portal zeigt je Rolle nur den passenden Link)
      whatsapp: { spieler: "", eltern: "" },
      // Automatische Trainings-Erinnerung (vom Trainerteam in der App einstellbar)
      trainingErinnerung: { aktiv: true, zeit: "06:30" },
      // Sportstätten-Verzeichnis (Autovervollständigung bei Terminen)
      sportstaetten: [],
      // Frei definierbare Abzeichen: typ "rueckmeldung" (hat geantwortet) oder
      // "teilnahme" (hat zugesagt), bereich "alle" | "training" | "spiel",
      // schwelle in Prozent – bezogen auf die laufende Saison (mind. 3 Termine)
      abzeichenDefs: [
        { id: "ab-rm75", name: "Zuverlässig zurückgemeldet", emoji: "🔔", typ: "rueckmeldung", schwelle: 75, bereich: "alle" },
        { id: "ab-tt75", name: "Trainingsteilnahme 75 %", emoji: "🥉", typ: "teilnahme", schwelle: 75, bereich: "training" },
        { id: "ab-tt80", name: "Trainingsteilnahme 80 %", emoji: "🥈", typ: "teilnahme", schwelle: 80, bereich: "training" },
        { id: "ab-tt85", name: "Trainingsteilnahme 85 %", emoji: "🥇", typ: "teilnahme", schwelle: 85, bereich: "training" },
        { id: "ab-tt90", name: "Trainingsteilnahme 90 %", emoji: "🏅", typ: "teilnahme", schwelle: 90, bereich: "training" },
        { id: "ab-tt95", name: "Trainingsteilnahme 95 %", emoji: "💎", typ: "teilnahme", schwelle: 95, bereich: "training" },
        { id: "ab-tt100", name: "Trainingsteilnahme 100 %", emoji: "👑", typ: "teilnahme", schwelle: 100, bereich: "training" },
      ],
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
  function ueb(name, kategorie, dauer, minSp, maxSp, beschreibung, quelle, link) {
    return { id: uid("ub"), name, kategorie, dauer, minSp: minSp || 0, maxSp: maxSp || 0,
             beschreibung: beschreibung || "", quelle: quelle || "", link: link || "" };
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
      if (raw) {
        const s = JSON.parse(raw);
        // Migration: neue Sammlungen/Felder aus der Struktur ergänzen, damit
        // ältere Datenstände nach einem Update nicht crashen. Bestehende
        // Nutzerdaten bleiben unangetastet.
        const base = seed(false);
        let migrated = false;
        Object.keys(base).forEach((k) => {
          if (s[k] === undefined) { s[k] = base[k]; migrated = true; }
        });
        if (migrated) persist(s);
        return s;
      }
    } catch (e) { /* ignore */ }
    // Erststart: OHNE Demodaten (leerer Verein mit Struktur)
    const s = seed(false);
    persist(s);
    return s;
  }
  function persist(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s || state)); } catch (e) { /* quota */ }
  }
  let onSave = null; // Hook für den Server-Abgleich (sync.js)
  function save() {
    persist(state);
    if (onSave) { try { onSave(); } catch (e) { /* Sync darf Speichern nie blockieren */ } }
  }

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
    setOnSave(fn) { onSave = fn; },
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
