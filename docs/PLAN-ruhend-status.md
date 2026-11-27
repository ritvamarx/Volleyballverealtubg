# Plan: Automatisch „ruhend“ nach 4 Trainingswochen ohne Rückmeldung

Stand 2026-11-27 – Planung abgestimmt (Antworten des Trainerteams eingearbeitet), noch nicht umgesetzt.

## Ziel (Wunsch Trainerteam)

Wer sich vier Trainingswochen lang **gar nicht meldet** (weder zu- noch absagt; Ferien zählen
nicht), wird automatisch aus dem aktiven Kader genommen und zählt in keine Statistik mehr. Wer
sich meldet – auch mit einer Absage, z. B. wegen Verletzung – bleibt aktiv. Zurück kommt man nur
selbst: Spieler:in meldet sich an und bestätigt „Ich bin wieder dabei“.

**Entscheidungen (27.11.):** Grundlage ist die Rückmeldung in der App (keine Anwesenheitsliste);
gezählt wird in Trainingswochen (Ferien/trainingsfreie Wochen verlängern das Fenster); Vorwarnung
nach 3 Wochen: ja; Rückmeldung zu Spielen zählt mit; Eltern bestätigen nicht für ihr Kind (alle
Spieler:innen sind alt genug); Beitragsrückstand bleibt davon unberührt.

## Befund im heutigen Stand

- **Es gibt keine Anwesenheitsliste.** Maßstab für „ruhend“ ist deshalb die **Rückmeldung**
  (👍, ❓ oder 👎) zu einem Termin – nicht die Zusage. Eine Absage wegen Verletzung ist eine
  Rückmeldung und hält den Status aktiv.
- **`inaktiv` bedeutet heute „ausgetreten“.** Die Einverständnis-Ansicht bietet für `inaktiv`
  das Löschen der Erklärungen an, Fotos werden nicht mehr gezeigt, Portal-Teamliste und
  Erinnerungen lassen die Person weg. Automatisch auf `inaktiv` zu stellen würde Pausierende wie
  Ausgetretene behandeln. **Deshalb ein eigener Status `ruhend`.**
- Statistik-Filter stehen an ~15 Stellen als `membershipStatus !== "inaktiv"` (views.js:
  Dashboard, Spielerverwaltung, Trainingsplanung, Team-Analyse, Rückmeldungen, Abzeichen,
  Einverständnis; server: Portal-Teamliste, Foto-Route, Erinnerungs-Jobs, Rückmelde-Übersicht).
- Es gibt bereits: Ferien (`holidays`, automatisch aus OpenHolidays + manuelle Einträge),
  gemeldete Abwesenheiten (`abwesenheiten`, von Spieler:in/Eltern im Portal eingetragen),
  „nicht nominiert“ (`x`) je Termin, tägliche Cron-Jobs (Trainings-Erinnerung) als Vorlage,
  Push und E-Mail je Konto.

## Regelwerk (Vorschlag)

**Status `ruhend`** (neu) neben `aktiv`, `beitragsrückstand`, `inaktiv`:
- zählt **nicht** in Kader, Quoten, Team-Analyse, Rückmelde-Übersicht, Erinnerungen, Portal-Teamliste;
- bleibt in der Spielerverwaltung sichtbar (Badge „⏸️ ruhend seit 12.11.“), behält Erklärungen,
  Fotos, Konto, Abzeichen und Urkunde;
- Felder am Spieler: `ruhendSeit`, `ruhendGrund` („automatisch: 4 Trainingswochen ohne Zusage“ /
  „manuell“), `ruhendZeiten: [{von, bis}]` (Verlauf, für den Statistik-Ausschluss),
  `statusVorRuhend` (wird bei Rückkehr wiederhergestellt, z. B. `beitragsrückstand`).

**Wann wird jemand ruhend?** Tägliche Prüfung (Cron, wie die Trainings-Erinnerung):
1. Betrachtet werden die **letzten 4 Trainingswochen**: rückwärts ab heute werden Kalenderwochen
   gezählt, in denen mindestens ein nicht abgesagtes Training der eigenen Mannschaft(en) lag, das
   **nicht in Ferien** fiel. Ferienwochen und trainingsfreie Wochen verlängern das Fenster also.
2. Ausgenommen sind Trainings, bei denen die Person als „nicht nominiert“ (`x`) markiert war oder
   die in eine **gemeldete Abwesenheit** fallen (Verletzung, Urlaub, Prüfungen) – eine eingetragene
   Abwesenheit ist selbst eine Rückmeldung.
3. Bleiben im Fenster **mindestens 3 relevante Trainings** und die Person hat zu **keinem** davon
   eine Rückmeldung abgegeben (👍/❓/👎) – und auch zu keinem Spiel im selben Zeitraum –, wird sie
   `ruhend`. Eine einzige Rückmeldung, auch eine Absage, genügt, um aktiv zu bleiben.
4. Schutz für Neue: wer jünger als 4 Wochen im Bestand ist oder sich noch nie zurückgemeldet hat
   (Probetraining), wird nicht automatisch ruhend gestellt.
5. Trainer:innen können je Person eine **Ausnahme bis Datum** setzen („Verletzt bis 15.1.“) und
   die Automatik insgesamt ein-/ausschalten sowie Fenster (4 Wochen) und Mindestanzahl (3) ändern.

**Vorwarnung (beschlossen):** Nach 3 Trainingswochen ohne Rückmeldung Push/E-Mail an Spieler:in
(und Eltern zur Kenntnis): „Wir vermissen dich 🏐 – bist du noch dabei?“ mit einem Tipp „Ja, ich bin
dabei“. Der Tipp zählt als Rückmeldung und setzt das Fenster zurück. Ohne Reaktion folgt nach
Woche 4 der Status.

**Rückkehr:** Nur die Person selbst (Login ins Portal):
- Portal-Start zeigt eine Karte über allem: „Du bist seit 12.11. als ruhend geführt, weil vier
  Trainingswochen keine Rückmeldung kam. Bist du wieder dabei?“ → **„Ja, ich bin wieder dabei“**.
- Danach: Status zurück auf `statusVorRuhend` (meist `aktiv`), `ruhendZeiten` abgeschlossen,
  Push ans Trainerteam „Ben Bach ist wieder dabei“, Dashboard-Hinweis.
- Bis zur Bestätigung sind Zu-/Absagen gesperrt (Tipp auf 👍 öffnet die Bestätigungsfrage).
- Trainer:innen können zusätzlich manuell reaktivieren (Spielerverwaltung).
- Eltern: sehen den Hinweis beim Kind, bestätigen aber **nicht** für das Kind (Entscheidung 27.11.).

**Statistik-Ausschluss:** Termine innerhalb einer Ruhezeit werden für diese Person wie „nicht
nominiert“ behandelt. Quoten, Abzeichen und Urkunde der Saison leiden also nicht unter der Pause,
und während der Pause erscheint die Person in keiner Team-Statistik.

## Umsetzung (Schritte)

1. **Datenmodell + Filter-Helfer** – `Store.aktiveSpieler()` (Client) und `aktive_spieler(daten)`
   (Server) ersetzen alle `!== "inaktiv"`-Filter; Badge, Spielerverwaltungs-Filter „ruhend“;
   Statusauswahl im Formular um `ruhend` ergänzt. Migration: nichts nötig (Status fehlt → aktiv).
2. **Prüf-Job `server/ruhend.py`** – Regelwerk oben, `manage.py ruhend-pruefen [--trocken]`
   (zeigt, wen es treffen würde, ohne zu speichern), Cron-Eintrag im Deploy-README, Einstellungen
   im Trainer-Bereich (an/aus, Wochen, Mindestanzahl, Vorwarnung an/aus). Erster Lauf nur trocken
   mit Bericht ans Trainerteam, Scharfschalten nach Sichtung.
3. **Vorwarnung** – Push/E-Mail über die bestehenden Kanäle, Portal-Link `/#dabei` mit
   Ein-Tipp-Bestätigung; Merker am Spieler gegen Doppelversand.
4. **Rückkehr im Portal** – Karte + `POST /api/portal/wieder-dabei`, Sperre der Zu-/Absagen bis zur
   Bestätigung, Push ans Trainerteam, Dashboard-Karte „wieder dabei“ / „neu ruhend“.
5. **Statistik-Ausschluss** – Team-Analyse, Abzeichen (Client + Server), Urkunde, Rückmelde-
   Übersicht überspringen Termine in `ruhendZeiten`.
6. **Tests** – Seed mit vier Trainingswochen (eine davon Ferien), Abwesenheit, „x“, Neuling,
   eine Person mit nur Absagen (muss aktiv bleiben); Prüf-Job trocken/scharf, Vorwarnung, Rückkehr
   über Portal, Trainer-Reaktivierung, Statistik ohne Ruhezeit.

Aufwand: etwa ein Arbeitstag, in zwei Freigaben (1–2 zuerst, dann 3–6).

## Entschiedene Fragen (27.11.)

1. Grundlage ist die Rückmeldung in der App (keine Anwesenheitsliste nötig).
2. Trainingswochen, nicht Kalendertage.
3. Vorwarnung nach 3 Wochen: ja.
4. Rückmeldung zu Spielen zählt mit: ja.
5. Eltern bestätigen nicht für ihr Kind – alle Spieler:innen sind alt genug.
6. Beitragsrückstand bleibt eigener Status und unberührt.
