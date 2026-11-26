# Plan: E-Mail-Login und Offline-Portal

Stand: 2026-11-07. Reihenfolge laut Auftrag: zuerst Login, dann Offline/Datensparen.
Der bisherige Weg (Benutzername + Passwort, Wiederherstellungscode vom Trainerteam)
bleibt in jeder Phase unverändert nutzbar und wird erst abgeschaltet, wenn der
E-Mail-Weg im Alltag läuft und das ausdrücklich freigegeben wird.

## Ist-Zustand (geprüft)

- `users` hat keine E-Mail-Spalte. E-Mail-Adressen liegen nur in den Spielerdaten
  (`playerEmail`, `parentEmail`, `parent2Email`) und sind über `player_ids` erreichbar.
- Login: `/api/login` mit `username` + `password`, Sitzung 30 Tage (Cookie `skv_session`).
- Passwort vergessen: `/api/passwort-vergessen` legt eine Anfrage an und pusht ans
  Trainerteam. Trainer erzeugt in „Portal-Zugänge“ einen Code, Spieler setzt mit
  `/api/passwort-reset` ein neues Passwort.
- SMTP-Modul `server/mail.py` existiert (Umgebungsvariablen `MAIL_HOST`, `MAIL_PORT`,
  `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`), wird bisher nur für die 06:30-Trainingsmail
  genutzt. Ob es auf dem Live-Server konfiguriert ist, ist unbekannt (`manage.py mail-test`).
- Portal: `/api/portal` wird bei jedem Start komplett geladen, inklusive Base64-Fotos
  von Team und eigenen Spielern. Nach jeder Aktion wird `?leicht=1` nachgeladen.
  Der Service Worker cached nur die App-Hülle, nie `/api/*`. Offline zeigt das Portal
  „konnte nicht geladen werden“. Schreibaktionen gehen direkt zum Server.

## Teil A: Login mit E-Mail und Passwort

### A1 Grundlage (keine Verhaltensänderung für Bestandsnutzer) – UMGESETZT 2026-11-26
1. Schema: `users.email TEXT UNIQUE COLLATE NOCASE` (nullable), `users.email_verified INTEGER`.
2. `/api/login`: Feld heißt künftig „Benutzername oder E-Mail“. Enthält die Eingabe ein `@`,
   wird nach `email` gesucht, sonst wie bisher nach `username`. Passwort bleibt Pflicht.
3. Vorbelegung: Verwaltungsbefehl `manage.py email-import` und Knopf in „Portal-Zugänge“
   übernehmen die Adresse aus den Spielerdaten (Spieler: `playerEmail`, Eltern: `parentEmail`).
   Bei Doppelungen (z. B. Geschwister mit gleicher Elternadresse auf zwei Konten) bleibt
   das Feld leer und wird in der Trainerliste als „ohne E-Mail“ markiert.
4. Trainer „Portal-Zugänge“: Spalte E-Mail, bearbeitbar, Status verifiziert/unverifiziert.

### A2 Passwort vergessen per E-Mail (ersetzt den Codeweg für Konten mit Adresse) – UMGESETZT 2026-11-26
1. `/api/passwort-vergessen` nimmt Benutzername oder E-Mail. Hat das Konto eine Adresse,
   geht eine Mail mit Link `…/#/reset?code=…` raus (Code in `reset_codes`, `created_by="email"`,
   60 Minuten gültig, einmalig). Antwort bleibt neutral.
2. Hat das Konto keine Adresse, läuft es wie heute: Push ans Trainerteam, Code von Hand.
3. Reset-Seite liest den Code aus der URL und fragt nur das neue Passwort ab
   (bestehende Route `/api/passwort-reset`, keine Änderung).
4. Voraussetzung: SMTP in der Live-`.env` eintragen und mit `manage.py mail-test` prüfen.
   Zugangsdaten nur auf dem Server, nie im Chat.

### A3 Komfort
1. Registrierung mit Einladungscode fragt die E-Mail ab (aus Spielerdaten vorbelegt).
2. Konto-Tab im Portal: eigene E-Mail sehen und ändern, neue Adresse per Bestätigungslink.
3. Sitzungsdauer von 30 auf 180 Tage für Spieler/Eltern, damit seltener Passwörter nötig sind. – UMGESETZT (mit A1)
4. Login-Hinweis „Benutzername, nicht dein Name“ entfällt, weil die E-Mail eindeutig ist.

### A3b Passkeys: Face ID / Touch ID / Fingerabdruck – UMGESETZT 2026-11-26
- Spieler:innen und Eltern richten nach einer Anmeldung im Portal einen Passkey ein
  (Karte „Schneller anmelden“ auf der Übersicht, Verwaltung im Konto-Tab).
- Anmeldebildschirm: Knopf „Mit Face ID / Fingerabdruck anmelden“; auf einem Gerät mit
  eingerichtetem Passkey steht er ganz oben – ein Tipp genügt.
- Technik: WebAuthn (py_webauthn), Resident Keys mit Pflicht-Nutzerverifikation, Tabellen
  `passkeys` und `webauthn_challenges`. Passwort- und Code-Weg bleiben unverändert.
- Auch für Trainerkonten (seit 2026-11-26): Einrichten nach Anmeldung mit 2FA über die Seitenleiste
  „🔐 Passkey“ oder die Dashboard-Karte; der Passkey ersetzt Passwort + Authenticator-Code
  (Besitz + Biometrie = zwei Faktoren). Sitzung Trainer 30 Tage, Portal 180 Tage.

### A4 Später, nach Freigabe
- Codeweg nur noch als Trainer-Notfall sichtbar.
- Optional: Anmeldelink per E-Mail ohne Passwort („Magic Link“), falls gewünscht.

## Teil B: Weniger mobile Daten, Offline-Portal

### B1 Daten sparen (sofort wirksam)
1. Fotos raus aus `/api/portal`: eigene Route `/api/portal/foto/<id>` mit `ETag` und
   `Cache-Control: immutable`; der Service Worker cached sie dauerhaft. Fotos werden so
   nur beim ersten Mal übertragen.
2. `/api/portal` mit `ETag` (Hash aus State-Version und Konto) und `If-None-Match` → `304`
   ohne Inhalt, wenn sich nichts geändert hat.
3. Wetter und Quiz erst beim Öffnen des jeweiligen Tabs laden, nicht bei jedem Start.
4. Messen auf der Test-Instanz: Bytes pro Portal-Start vorher/nachher.

### B2 Offline lesen
1. Service Worker: `/api/portal` netz-zuerst mit Cache-Rückfall; zusätzlich letzter
   Payload mit Zeitstempel in IndexedDB.
2. Ohne Netz startet das Portal aus dem Cache, kleiner Hinweis „Stand 14:32 · offline“.
3. `/api/me` offline → zuletzt bekannter Nutzer, Portal öffnet trotzdem (Cookie ist 30/180 Tage gültig).

### B3 Offline schreiben (Warteschlange)
1. Alle Portal-Aktionen (Zu-/Absage, Abwesenheit, Fahrer, Aufgabe, Buffet, Job, Kleidung,
   Kontakt, Profilbild) landen bei Netzfehler in einer IndexedDB-Warteschlange; die Anzeige
   wird sofort lokal aktualisiert.
2. Abarbeiten beim `online`-Ereignis, beim Wiederöffnen der App und per Background Sync
   (Android/Chrome; iPhone beim nächsten Öffnen).
3. Konflikte: Server gewinnt, Antwort ersetzt den lokalen Stand; abgelehnte Aktionen
   (z. B. Termin vorbei) als Hinweis.
4. Hinweis im Konto-Tab „n Änderungen warten auf Netz“, sonst keine Bedienung nötig.

### B4 Traineransicht (später)
- `/api/state` netz-zuerst mit Cache und Warteschlange fürs Speichern; die Versionsprüfung
  gegen Konflikte gibt es dort schon.

## Teil C: Dokumentenablage mit Freigabe – UMGESETZT 2026-11-26
- Trainer-Ansicht „📁 Dokumente“: Upload (mehrere Dateien, PDF/Bilder/Office/CSV/ICS/ZIP,
  max. 20 MB je Datei), Ordner, Freigabe (Nur Trainerteam / Spieler:innen / Eltern / beide),
  Kurzbeschreibung, optional Push an die Freigegebenen; Umbenennen, Ordner/Freigabe ändern, Löschen.
- Portal: Tab „📁 Dokumente“ erscheint nur, wenn für die Rolle etwas freigegeben ist; Link
  `/#dokumente` (aus dem Push) öffnet den Tab direkt; „neu“-Markierung 14 Tage.
- Technik: Dateien einzeln unter `data/dokumente/`, Metadaten in Tabelle `dokumente`;
  Auslieferung nur nach Rechteprüfung, `Cache-Control: private` (einmal laden, dann vom Gerät);
  `manage.py backup` sichert den Ordner mit.
- Offen: bestehende Einverständnis-Uploads (Base64 im App-Datenpaket) in die Ablage überführen.

## Teil D: Einverständnis-Workflow (aus dem Audit) – UMGESETZT 2026-11-26
- **Datenmodell:** `einwilligungen[]` je Spieler:in und Vorlage (ja/nein, Datum, Saison, Quelle,
  Beleg, Widerruf); `consents[]` sind nur noch Belege (Datei in der Dokumentenablage, kein Base64);
  Vorlagen mit `gueltigkeit` (unbefristet/Saison) und `schutz: foto`. `consentOnFile` wird abgeleitet.
- **Migration:** läuft automatisch beim ersten Trainer-Login (Dashboard/Einverständnis): Base64-Scans
  → `data/dokumente`, Alt-Einträge → Einwilligungen, „Haken ohne Beleg“ → Papierbeleg.
- **Trainer:** Kennzahlen nur aktive; Karten „Zu sichten“, „Fehlend“ (mit Push-Erinnerung ans
  Elternkonto, Fallback Mail/WhatsApp), „Saison erneuern“, „Ausgetretene löschen“; Erfassen mit
  Datei oder Papier-Vermerk und Checkliste je Erklärung; Status-Dialog je Spieler:in mit Widerruf;
  Löschen eines Belegs räumt Einwilligungen und Datei auf; Spieler-Löschung räumt Belege auf;
  „Musterstand 2026“ aktualisiert Vorlagentexte (Fotoveröffentlichung getrennt, Verantwortlicher,
  Widerrufsweg, Mitunterschrift ab 16).
- **Portal:** Konto-Tab zeigt Status je Erklärung; Eltern bestätigen digital (Passwort oder Passkey
  als Unterschrift, PDF-Nachweis in der Ablage, für Eltern abrufbar) oder laden das Formular als
  Datei hoch (→ „Zu sichten“); Spielerkonten sehen nur den Status; Startkarte bei fehlender
  Erklärung; Link `/#einverstaendnis`; Profilfotos anderer nur mit Foto-Einwilligung.
- **Ampel** in der Kopfzeile neben dem Profilbild: rot = überfällige Aufgabe oder fehlende
  Erklärung, gelb = offene Aufgabe/eingereicht/unbeantworteter Termin (7 Tage), grün = nichts offen;
  Antippen öffnet die Liste mit Sprung zur Stelle.

## Reihenfolge und Freigaben
1. A1 + A2 auf Test → Freigabe → live.
2. B1 auf Test (Messwerte) → Freigabe → live.
3. B2 + B3 auf Test → Freigabe → live.
4. A3, dann B4.

## Offene Entscheidungen
- Entschieden: Versand über Brevo-SMTP als skv.volleyball@nettverwaltet.de (Test-Instanz eingerichtet, Live folgt mit der Freigabe).
- Entschieden: Adressen werden automatisch aus den Spielerdaten übernommen (beim Start, bei jedem Öffnen der Portal-Zugänge, per `manage.py email-import`).
- Entschieden: 180 Tage Sitzung für Spieler/Eltern, Trainer bleiben bei 30 Tagen mit 2FA.
