# 🏐 SKV Müritz – Trainer- & Vereinsplattform

Eine komplette Verwaltungs- und Kommunikationsplattform für den Volleyballverein
**SKV Müritz** ([www.skv-mueritz.de](https://www.skv-mueritz.de), Verbandsliga
Mecklenburg-Vorpommern). Sie hilft dem Trainerteam, den
Kader zu verwalten, mit den Eltern zu kommunizieren, Einsätze rund um Heim- und
Auswärtsspiele zu organisieren und den Vereinsalltag zu koordinieren.

Die Anwendung läuft **komplett im Browser** – ohne Server, ohne Installation,
ohne Build-Schritt. Alle Daten werden lokal im Browser (`localStorage`)
gespeichert. Beim ersten Start werden realistische Beispieldaten geladen.

## ▶️ Starten / Offline testen

Die Plattform ist **vollständig offline-fähig** – kein Server, kein Internet,
keine externen Ressourcen. Es gibt zwei Wege:

**1. Direkt (empfohlen zum schnellen Testen)**
Die einzelne Datei **`dist/skv-mueritz-offline.html`** enthält alles (HTML, CSS,
JavaScript) in einer Datei. Einfach herunterladen und per **Doppelklick** im
Browser öffnen – funktioniert komplett ohne Internet und lässt sich bequem auf
jedes Gerät kopieren (USB-Stick, E-Mail, Tablet …).

**2. Projektordner**
Das gesamte Repository herunterladen/klonen und **`index.html`** im Browser
öffnen (Doppelklick). Alternativ ein lokaler Server:
`python3 -m http.server` im Projektordner, dann `http://localhost:8000` aufrufen.

> Die Daten werden im `localStorage` des jeweiligen Browsers gespeichert und
> bleiben auch offline zwischen Sitzungen erhalten. Über den Button
> **„Demo-Daten"** lässt sich der Beispielstand zurücksetzen.

### Einzeldatei neu bauen
Nach Änderungen an `assets/…` die Offline-Datei neu erzeugen mit:

```bash
node build.js
```

## ✨ Funktionen

| Bereich | Beschreibung |
|---|---|
| **Übersicht** | Trainer-Cockpit mit Kennzahlen, nächsten Terminen, offenen Aufgaben, Geburtstagen und Warnhinweisen. |
| **Abteilungen** | Verschiedene Mannschaften/Abteilungen (Herren I, männl. U20/U18/U16/U14, Mini-Volleyball, Hobby) mit Liga, Altersklasse, Trainingszeiten, Halle und Ansprechpartner. |
| **Spielerverwaltung** | Kader mit Position, Trikotnummer, **Abteilung**, **Jahrgang**, **Passnummer**, Geschlecht. Kontaktdaten von **Spieler und beiden Elternteilen** (auch bei getrennten Eltern), **Erstkontakt-Kennzeichnung** (⭐ Spieler/Eltern/beide) und Kontakt-Dialog mit Empfängerauswahl. **Import/Export**: CSV (inkl. **SAMS-Mannschaftsliste** von vvmv.sams-server.de mit automatischer Umlaut-Erkennung – ideal einmal pro Saison), JSON und vCard; Re-Import aktualisiert statt zu duplizieren. |
| **Verbandsmeldung** | Mannschaftsmeldung an den VVMV: Abteilung wählen → Kader wird mit **Jahrgang** und **Passnummer** automatisch übernommen; Rolle (Kapitän/Libero/…), Staffel und Status pflegbar; **Druck-/PDF-Ausgabe** und Link zum SAMS-Meldeportal. |
| **Ankündigungen** | Nachrichten an Team und Eltern zentral veröffentlichen (Zielgruppen-Auswahl). |
| **Geburtstage** | Automatisch sortierte Geburtstagsliste inkl. „nächste 30 Tage" und Countdown. |
| **Einverständniserklärungen** | Von den Eltern unterschriebene Formulare hochladen und ablegen (Datei-Upload, lokal gespeichert). Offene Formulare werden angemahnt. **Eigene Formular-Vorlagen** anlegen, ändern, löschen – inkl. Druckausgabe. Ausformulierte Vorlagen u. a. für **Teilnahme an der Erwachsenenliga** und **Kontaktaufnahme/WhatsApp-Gruppe** (mit E-Mail-/Mobilnummer-Feldern). Dazu ein druckbarer **Elternbrief des Trainers** mit Erwartungen (Fahrten, Heimspiel-Buffet mit 2 Elternteilen), den aktuellen Heimspielterminen aus dem Kalender und Rückmeldeabschnitt. |
| **Kalender** | **Monats-, Jahres- und Listenansicht** aller Trainings und Spieltage, farblich nach Terminart. **Serientermine** (wöchentlich/14-tägig, z. B. Training) mit automatischem Auslassen der Schulferien; Serie komplett oder einzeln löschbar. **Schulfreie Tage MV** (Ferien & Feiertage, editierbar, ohne Gewähr) werden im Kalender markiert. **Termin-Import** aus iCal (.ics, z. B. Google Kalender/Apple/Outlook) und RSS-Feeds – per Datei, Text oder URL; URL-Abos mit **automatischer Synchronisation** bei jedem App-Start und auf Knopfdruck (↻); Duplikate werden erkannt. |
| **Datensicherung** | **Alle Daten** in eine einzige CSV-Datei exportieren und daraus wiederherstellen (Gerätewechsel, Backup, Excel-Bearbeitung). Zurücksetzen wahlweise **leer (ohne Demodaten)** oder mit Demo-Beispieldaten – Erststart ist immer leer. |
| **Ferien-Abo MV** | Schulferien & Feiertage Mecklenburg-Vorpommern werden **automatisch aktuell gehalten** (OpenHolidays-API mit offiziellen Terminen, Fallback ferien-api.de) – Sync beim App-Start und per ↻; eigene Einträge bleiben erhalten. |
| **Elternbriefe** | Mehrere Briefe **anlegen, bearbeiten, löschen** – mit **Rückmeldefrist**, frei editierbarem Text (## = Überschrift), automatisch eingefügten Heim- **und** Auswärtsterminen (je Datum zusammengefasst, Trainings-Hinweis donnerstags) und Rückmeldeabschnitt. |
| **Sammeldokument** | Alle **Pflicht-Einverständniserklärungen in einem Dokument**: Spieler-Daten nur einmal eintragen, Eltern unterschreiben nur einmal, jede Erklärung einzeln ankreuzbar. |
| **Links** | Link-Sammlung (Verein, VVMV, SAMS, Ferien …) auf Übersicht & Verbandsseite – **neu anlegen, bearbeiten, löschen**. |
| **Trainingsrückmeldung** | Spieler melden sich **verbindlich** zu, ab oder unsicher – mit Live-Zählung pro Training. |
| **Fahrerplanung** | Fahrer für Auswärtsspiele eintragen, Plätze zuordnen und offene Mitfahrgelegenheiten erkennen. |
| **Heimspiel-Jobs** | Catering, Helfer und sonstige Aufgaben für Heimspiele/Events vergeben und abhaken. |
| **Aufgaben** | Persönliche To-Do-Liste des Trainers mit Priorität und Fälligkeit. |
| **Finanzen** | Mitgliedsbeiträge, Spenden und Ausgaben verwalten, Saldo, offene Beiträge, „als bezahlt"-Buchung. |
| **Vereinskleidung** | Kollektion mit Bild (SVG), Preis und Größen – von Spieler direkt anforderbar; Bestellstatus-Verwaltung. |
| **Sponsoren** | Sponsoren mit Logo, Kategorie und Fördersumme präsentieren – **Platz für weitere Sponsoren** ist eingeplant. |
| **Material** | Inventar (Bälle, Netze, Ausrüstung) mit Soll/Ist und Nachbestell-Hinweis. |
| **Verbandsliga MV** | Tabelle/Punktestand der Verbandsliga sowie Direktlinks zum Volleyball-Verband Mecklenburg-Vorpommern (VVMV). |
| **Volleyball-Wiki** | Regeln, Positionen, Techniken, Trainingsaufbau und Glossar – ideal für neue Spieler und Eltern. |

### Zusätzliche, den Trainer entlastende Funktionen
Über die ausdrücklich gewünschten Punkte hinaus wurden ergänzt: **Ankündigungs-/
Eltern-Infoboard**, **Aufgaben-/To-Do-Verwaltung**, **Materialverwaltung**, ein
zentrales **Trainer-Dashboard** mit Warnhinweisen, **Dark-/Light-Mode** und ein
**„Eltern kontaktieren"-Assistent**.

## 🔗 Verbands-Links (Verbandsliga Mecklenburg-Vorpommern)

Im Bereich *Verbandsliga MV* sind Direktlinks hinterlegt, u. a. zum
Volleyball-Verband MV (VVMV), zu Ligen/Tabellen und Spielplänen im
SAMS-Spielbetrieb sowie zu Regelwerk und Schiedsrichterwesen. Die angezeigte
Tabelle enthält Beispieldaten und kann an den offiziellen Live-Spielbetrieb
angebunden werden.

## 🗂️ Projektstruktur

```
index.html                 App-Shell (Sidebar-Navigation, Layout)
assets/css/styles.css      Design-System, Layout, Responsive, Dark-Mode
assets/js/store.js         Datenmodell + Beispieldaten + localStorage
assets/js/utils.js         Hilfsfunktionen (Datum, Modal, Toast, SVG)
assets/js/views.js         Alle Ansichten/Bereiche
assets/js/app.js           Router & Initialisierung
```

## 🖥️ Server-Betrieb (volleyball.nettverwaltet.de)

Die App kann auf dem eigenen Server mit **Login** betrieben werden
(Flask/SQLite-Backend in `server/`, Deployment-Paket in `deploy/` –
siehe `deploy/README-DEPLOY.md` und `PLAN-HOSTING.md`). Trainer melden sich
mit Passwort + **TOTP-2FA** an; der Datenbestand liegt zentral mit
Versionsprüfung, Verlauf und Konfliktwarnung. Wird die Datei lokal
(Doppelklick) geöffnet, bleibt alles wie gehabt – der Server-Modus aktiviert
sich nur hinter dem eigenen Backend.

## ☁️ Geräteübergreifend nutzen (Cloud) & Passwortschutz

Die App-Datei selbst enthält **keine persönlichen Daten** – Daten liegen im
Browser des jeweiligen Geräts. Für Gerätewechsel und Cloud-Ablage gibt es in
**Datensicherung** die **verschlüsselte Sicherung** (`.skv`,
AES-256-GCM, Schlüssel per PBKDF2 aus deinem Passwort):

1. Auf Gerät A: *Verschlüsselt exportieren* (Passwort wählen).
2. Die `.skv`-Datei zusammen mit der App-Datei in die Cloud legen
   (iCloud/Dropbox/OneDrive …) – ohne Passwort ist sie nicht lesbar.
3. Auf Gerät B: App öffnen → *Verschlüsselt importieren* → Passwort eingeben.

> Achtung: Ohne das Passwort lässt sich eine `.skv`-Sicherung nicht
> wiederherstellen – es gibt keine „Passwort vergessen"-Funktion.

## 🔒 Datenschutz

Es werden **keine Daten an einen Server übertragen** – alles bleibt lokal im
Browser. Hochgeladene Einverständniserklärungen werden ausschließlich im
`localStorage` des Geräts abgelegt. Über den Button **„Demo-Daten"** lässt sich
der Beispieldatenstand jederzeit wiederherstellen.

## 🚀 Weiterentwicklung

Die Datenstruktur in `store.js` ist bewusst so gehalten, dass sie später an eine
echte API/Datenbank (z. B. für mehrere Nutzer, sichere Dateiablage und
Live-Verbandsdaten) angebunden werden kann, ohne die Views neu schreiben zu
müssen.
