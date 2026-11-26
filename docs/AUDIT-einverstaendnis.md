# Audit: Workflow Einverständniserklärung

Stand 2026-11-26, Codebasis `main` e8f0d1e. Geprüft: Trainer-Ansicht „Einverständnis“
(`assets/js/views.js`), Portal Konto-Tab (`assets/js/portal.js`), Server-Endpunkte
`/api/portal` und `/api/portal/einverstaendnis` (`server/app.py`), PDF-Erzeugung
(`server/pdf_brief.py`), Datenmodell (`assets/js/store.js`), Datenschutzseite.

## 1. Ist-Ablauf

1. **Vorlagen** (Trainer): Name, Text, Haken „Pflicht“. Sechs Standardvorlagen, u. a.
   „Datennutzung & Fotorechte“, „Fahrten & Aufsicht“, „Medizinische Notfallversorgung“,
   „Kontaktaufnahme & WhatsApp“.
2. **Formular erzeugen**: Einzelformular (Browser-Druck), Sammeldokument aller
   Pflicht-Erklärungen (Browser-Druck) oder Serienbrief je Spieler:in mit vorausgefüllter
   Sammelseite (Server-PDF, teilbar per WhatsApp). Je Erklärung „☐ stimme zu / ☐ stimme nicht zu“.
3. **Unterschrift** auf Papier durch Erziehungsberechtigte.
4. **Rückweg A (Portal)**: Eltern- oder Spielerkonto lädt im Konto-Tab PDF oder Foto hoch
   (Foto wird auf 1600 px verkleinert). Server ersetzt den vorherigen Portal-Upload des Kindes
   und setzt `consentOnFile = true`.
5. **Rückweg B (Trainer)**: „Formular hochladen“ mit Spieler, Vorlage, „Unterschrieben von“,
   Datum, Datei (max. 4 MB) – Datei ist optional. Setzt `consentOnFile = true`.
6. **Rückweg C (Spielerverwaltung)**: Haken „Einverständniserklärung liegt vor“ von Hand.
7. **Status**: Dashboard-Kennzahl „Offene Einverständnis.“, Liste „Fehlende
   Einverständniserklärungen“ mit „Erinnern“ (öffnet Mail/WhatsApp) und „Hochladen“;
   Portal zeigt je Kind „✓ liegt vor“ / „fehlt noch“.

## 2. Befunde

### Kritisch

**K1 – Einwilligung ist ein einziges Häkchen, das Formular aber kleinteilig.**
`consentOnFile` ist ein Boolean je Spieler:in. Das Sammelformular lässt jede Erklärung
einzeln ankreuzen, auch „stimme nicht zu“. Die App kann eine Teil-Zustimmung (z. B. keine
Fotorechte, kein WhatsApp) nicht abbilden. Nirgends im Code wird eine Foto-Einwilligung
geprüft: Profilfotos werden im Portal allen Spieler:innen als Team-Avatare gezeigt,
unabhängig davon, was die Eltern angekreuzt haben. Das ist die größte fachliche und
datenschutzrechtliche Lücke.

**K2 – Scans liegen als Base64 im App-Datenpaket (15-MB-Grenze).**
Trainer-Upload erlaubt 4 MB je Datei (≈ 5,4 MB als Base64). Zwei bis drei Scans füllen
das Paket; danach scheitert *jedes* Speichern der App (`PUT /api/state` → 413), nicht
nur das Einverständnis. Portal-Fotos werden verkleinert, Trainer-Uploads nicht. Jeder
Abgleich überträgt alle Scans mit – genau das Gegenteil von datensparend.
Lösung liegt bereit: die neue Dokumentenablage (`data/dokumente`, Tabelle `dokumente`).

### Hoch

**H1 – Status und Belege laufen auseinander.**
Löschen eines Formular-Eintrags setzt `consentOnFile` nicht zurück. Der Haken in der
Spielerverwaltung ist ohne Beleg setzbar. Beim Löschen einer Spieler:in bleiben die
Einträge in `consents` als Waisen (inkl. Scan) zurück. Umgekehrt zählt ein Eintrag ohne
Datei („manuell_erfasst.txt“) als vollständig.

**H2 – Keine Gültigkeit, keine Saison, kein Widerruf.**
Vorlagentexte sagen „gilt für die laufende Saison“ und „jederzeit widerrufbar“, das
Datenmodell kennt weder Gültig-bis noch Saison noch Widerrufsdatum. Nichts erinnert zum
Saisonstart an die Erneuerung, ein Widerruf lässt sich nur durch Löschen abbilden.

**H3 – Keine Löschfristen (Speicherbegrenzung, Art. 5 DSGVO).**
Beim Vereinsaustritt (`membershipStatus = inaktiv`) bleiben Scans dauerhaft im
Datenbestand, in jeder Sicherung und in jedem Export. Keine Routine, kein Hinweis.

**H4 – Eltern erfahren von der fehlenden Erklärung kaum.**
Der Hinweis „fehlt noch“ steht nur im Konto-Tab des Portals. Keine Push, nicht auf der
Startseite, keine Aufgabe. „Erinnern“ beim Trainer öffnet nur Mail/WhatsApp statt das
Portal-Konto per Push anzusprechen. Erinnerungen werden nicht protokolliert.

### Mittel

**M1 – Spielerkonten (Minderjährige) laden selbst hoch.** Als „Unterschrieben von“ wird
dann der Kontoname gespeichert, d. h. der Beleg sieht aus, als hätte das Kind
unterschrieben. Upload sollte dem Elternkonto vorbehalten sein oder den Namen der
unterschreibenden Person abfragen.

**M2 – Rechtsinhalt der Vorlagen.**
„Datennutzung & Fotorechte“ koppelt die Speicherung von Kontaktdaten (dafür ist keine
Einwilligung nötig, Grundlage ist die Mitgliedschaft) mit der Fotoveröffentlichung (echte
Einwilligung). Kopplung schwächt die Freiwilligkeit. Es fehlen: Verantwortlicher mit
Kontakt, Zweck je Medium (Website, Social Media, Presse, intern), konkreter Widerrufsweg
(an wen, wie), Hinweis auf Mitunterschrift ab 16 Jahren (Art. 8 DSGVO). Empfehlung:
Fotoerklärung mit Teil-Kreuzen je Medium, beide Sorgeberechtigte bei Fotos, Verweis auf
die Datenschutzseite der App.

**M3 – Zugriff und Export.** Alle Trainerkonten sehen alle Scans (vertretbar), aber ohne
Protokoll. Die Datensicherung als JSON-Export enthält alle Scans im Klartext: wer die
Datei weitergibt, gibt Einwilligungen weiter.

**M4 – Kennzahl verzerrt.** „Offene Einverständnis.“ zählt auch inaktive Spieler:innen.

### Niedrig

**N1** Demo-Einträge (Dateiname ohne Datei, Badge „Demo“) können im Live-Bestand liegen.
**N2** Zwei Druckwege (Browser-Druck, Server-PDF) mit leicht abweichendem Layout; Browser-Druck braucht Pop-ups.
**N3** Sammelformular fragt E-Mail/Mobil ab, obwohl die Vorlage „Kontaktaufnahme“ das ebenfalls tut.
**N4** Beim Löschen einer Vorlage bleiben Einträge mit dem Vorlagennamen ohne Kennzeichnung zurück.

## 3. Was gut funktioniert

- Sammelformular mit Vorausfüllung je Spieler:in und Serienbrief spart Eltern Arbeit.
- Portal-Upload mit automatischer Bildverkleinerung; Server prüft Dateityp und Zuordnung
  zum eigenen Kind; alter Portal-Upload wird ersetzt statt gestapelt.
- Server-PDF (fpdf2) mit Ankreuzfeldern, teilbar per WhatsApp.
- Trainer-Upload liest die Datei erst beim Speichern (Race Condition bewusst vermieden).
- Vorlagen-Umbenennung zieht abgelegte Einträge nach.

## 4. Empfohlener Soll-Workflow

### Phase 1 – Sofortmaßnahmen (klein, ohne Datenmodell-Änderung)
1. Löschen eines Eintrags setzt `consentOnFile` zurück, wenn kein weiterer Eintrag existiert.
2. Spieler:in löschen räumt `consents` mit auf.
3. Kennzahl und Liste „fehlend“ nur für aktive Spieler:innen.
4. Trainer-Upload: ohne Datei nur mit Kennzeichnung „Papier liegt im Ordner“ (Aufbewahrungsort).
5. Portal-Upload nur für Elternkonten; Spielerkonten sehen nur den Status.
6. Startseite im Elternportal: Karte „Einverständniserklärung fehlt“ mit Upload-Link.
7. „Erinnern“ beim Trainer: Push ans Elternkonto (Fallback Mail/WhatsApp), Datum der
   letzten Erinnerung merken und anzeigen.

### Phase 2 – Einwilligung je Erklärung (Datenmodell)
Neue Struktur `einwilligungen` je Spieler:in und Vorlage:
`{ playerId, vorlageId, status: "ja"|"nein"|"offen", datum, gueltigBis, quelle:
"portal"|"papier"|"digital", dokumentId, erfasstVon, widerrufenAm }`.
- Nach einem Upload prüft das Trainerteam per Checkliste („Sichten“), welche Kreuze
  gesetzt sind, und bestätigt je Erklärung. Erst danach gilt die Erklärung als erfasst.
- Spielerverwaltung zeigt je Spieler:in die Ampel je Pflicht-Erklärung, Foto-Status
  prominent.
- Portal und Trainer-Ansicht respektieren die Foto-Einwilligung: ohne „ja“ wird das Profilfoto
  nicht an andere ausgeliefert (Avatar-Emoji statt Foto), Hinweis beim Hochladen.
- Gültigkeit: Vorlage bekommt „gilt bis Saisonende“ oder „unbefristet“; zum Saisonstart
  Assistent „Erklärungen erneuern“ mit Serienbrief-Verknüpfung.
- Widerruf: Knopf „Widerruf erfassen“ mit Datum; Status wird „nein“, Beleg bleibt.

### Phase 3 – Ablage und Löschung
- Scans in die Dokumentenablage (Freigabe „nur Trainerteam“, verknüpft mit Spieler:in);
  bestehende Base64-Einträge einmalig migrieren, App-Datenpaket wird klein.
- Löschregel: bei Status „inaktiv“ Hinweis „Erklärungen löschen?“; automatische
  Löschung nach einer festgelegten Frist (Vorschlag: Saisonende + 12 Monate), mit Protokoll.
- JSON-Export ohne Scans (nur Metadaten), Scans getrennt sicherbar.

### Phase 4 – Digitale Einwilligung im Portal
Eltern kreuzen die Erklärungen im Portal an und bestätigen mit Passkey oder Passwort.
Der Server protokolliert Zeitpunkt, Konto und Text der Erklärung (Versionsstand) und
erzeugt ein PDF als Nachweis. Für einfache Einwilligungen ist das formfrei zulässig
(Art. 7 DSGVO); Papier bleibt als Alternative. Das macht den Rückweg per Foto überflüssig
und löst H4 vollständig.

## 5. Prioritätsvorschlag
1. K2 zusammen mit Phase 3 (Ablage), weil die 15-MB-Grenze den laufenden Betrieb gefährdet.
2. Phase 1 komplett (ein Nachmittag).
3. K1 + H2 über Phase 2 (Einwilligung je Erklärung, Foto-Prüfung).
4. M2 Vorlagentexte überarbeiten (mit dir, inhaltliche Entscheidung des Vereins).
5. Phase 4 als Komfortstufe.
