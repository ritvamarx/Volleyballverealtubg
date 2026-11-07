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

### A1 Grundlage (keine Verhaltensänderung für Bestandsnutzer)
1. Schema: `users.email TEXT UNIQUE COLLATE NOCASE` (nullable), `users.email_verified INTEGER`.
2. `/api/login`: Feld heißt künftig „Benutzername oder E-Mail“. Enthält die Eingabe ein `@`,
   wird nach `email` gesucht, sonst wie bisher nach `username`. Passwort bleibt Pflicht.
3. Vorbelegung: Verwaltungsbefehl `manage.py email-import` und Knopf in „Portal-Zugänge“
   übernehmen die Adresse aus den Spielerdaten (Spieler: `playerEmail`, Eltern: `parentEmail`).
   Bei Doppelungen (z. B. Geschwister mit gleicher Elternadresse auf zwei Konten) bleibt
   das Feld leer und wird in der Trainerliste als „ohne E-Mail“ markiert.
4. Trainer „Portal-Zugänge“: Spalte E-Mail, bearbeitbar, Status verifiziert/unverifiziert.

### A2 Passwort vergessen per E-Mail (ersetzt den Codeweg für Konten mit Adresse)
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
3. Sitzungsdauer von 30 auf 180 Tage für Spieler/Eltern, damit seltener Passwörter nötig sind.
4. Login-Hinweis „Benutzername, nicht dein Name“ entfällt, weil die E-Mail eindeutig ist.

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

## Reihenfolge und Freigaben
1. A1 + A2 auf Test → Freigabe → live.
2. B1 auf Test (Messwerte) → Freigabe → live.
3. B2 + B3 auf Test → Freigabe → live.
4. A3, dann B4.

## Offene Entscheidungen
- Welches SMTP-Postfach (z. B. info@skv-mueritz.de)? Eintrag in die Live-`.env` durch dich.
- E-Mail-Adressen aus den Spielerdaten automatisch übernehmen: ja (empfohlen) oder nur von Hand?
- Sitzungsdauer 180 Tage für Spieler/Eltern: ok?
