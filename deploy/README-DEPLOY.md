# Deployment: volleyball.nettverwaltet.de (Phase 1)

Zugeschnitten auf den bestehenden Hetzner-Server (Docker Compose, ein Caddy 2
für alle Domains, rsync-Deployment ohne Git auf dem Server).

## ⚡ Schnellstart: alles in einem Befehl

```bash
./deploy/livegang.sh benutzer@server
```

`livegang.sh` erledigt die komplette Einrichtung automatisch: DNS-Check,
Caddy-Netz erkennen, Dateien übertragen, `.env` mit SECRET_KEY erzeugen,
Image bauen & starten, Caddy-vHost eintragen (mit Sicherungskopie) und neu
laden, erstes Trainerkonto anlegen, Backup-Cron installieren, Endkontrolle.
Das Skript ist mehrfach ausführbar – erledigte Schritte werden übersprungen.
Einzige Voraussetzung: der DNS-A-Record `volleyball` → Server-IP existiert
(oder wird kurz danach angelegt; TLS zieht Caddy dann automatisch nach).

Die folgenden Abschnitte beschreiben dieselben Schritte einzeln – für
manuelles Vorgehen oder zum Nachschlagen.

## Einmalige Einrichtung

1. **DNS:** `volleyball.nettverwaltet.de` als A-/AAAA-Record auf die Server-IP
   (gleiche IP wie die übrigen nettverwaltet-Domains).

2. **Verzeichnis + erste Übertragung (vom Mac):**
   ```bash
   ./deploy/deploy.sh benutzer@server
   ```
   Beim ersten Lauf entsteht `/opt/volleyball` mit `data/` (Volume) und einer
   `.env` aus der Vorlage → **SECRET_KEY setzen**:
   ```bash
   ssh benutzer@server "cd /opt/volleyball && sed -i \"s/BITTE-ERSETZEN/$(python3 -c 'import secrets;print(secrets.token_hex(32))')/\" .env && docker compose up -d volleyball"
   ```

3. **Caddy:** Block aus `deploy/Caddyfile-snippet.txt` ins bestehende
   Caddyfile aufnehmen, dann `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.
   (Netzname in `docker-compose.yml` prüfen: `docker network ls` — Standard
   hier ist das externe Netz `caddy`.)

4. **Erstes Trainerkonto:**
   ```bash
   ssh benutzer@server "cd /opt/volleyball && docker compose exec volleyball ./manage.py create-trainer --username andreas --name 'Andreas Berg'"
   ```
   Beim ersten Login richtet das Konto verpflichtend TOTP-2FA ein
   (Authenticator-App; Backup-Codes werden einmalig angezeigt).

5. **Weitere Trainer:** In der App anmelden … oder per CLI einen
   Einladungscode erzeugen und per WhatsApp verschicken:
   ```bash
   docker compose exec volleyball ./manage.py create-invite --role trainer --name "Katrin Sommer"
   ```
   Registrierung dann unter `https://volleyball.nettverwaltet.de/?code=XXXX-XXXX-XXXX`.

6. **Datenübernahme:** Als Trainer anmelden → die App bietet an, lokale
   Browserdaten zu übertragen — oder Datensicherung → „Verschlüsselt
   importieren" mit der vorhandenen `.skv`-Datei.

7. **Backup:** läuft seit 2026-08-19 **zentral** über `/opt/backup-server.sh`
   (Cron `/etc/cron.d/vereins-backup`, täglich 03:30): konsistenter
   SQLite-Snapshot, Ablage `/opt/backups` (14 Stände) **plus Off-Site-Kopie
   in die WerkHaus-Nextcloud**. Das Skript wird aus dem Vereinsverwaltung-Repo
   (`deploy/backup-server.sh`) gepflegt; `deploy/cron/volleyball-backup` hier
   ist nur noch eine Hinweisdatei.

## Updates (wie gewohnt)

```bash
./deploy/deploy.sh benutzer@server
```
(rsync → `docker compose up -d --build volleyball` → Healthcheck. `data/` und `.env`
werden nie angefasst.)

## Notfall-Kommandos

```bash
docker compose exec volleyball ./manage.py list-users
docker compose exec volleyball ./manage.py reset-2fa <benutzername>
docker compose exec volleyball ./manage.py reset-password <benutzername>
docker compose exec volleyball ./manage.py backup /app/data/backups
```

## Was Phase 1 kann — und was noch nicht

- ✔ Login (Trainer mit Pflicht-2FA), mehrere Trainerkonten, Registrierung
  per Einladungscode (alle Rollen)
- ✔ Zentraler Datenbestand mit Versionsprüfung, Verlauf (30 Stände, mit
  Autor), Konfliktwarnung, Offline-Puffer
- ✔ Phase 2: PWA — Manifest, 🏐-Icons, Service Worker (Offline-Shell,
  Build-Hash-Version, Update-Hinweis); iPhone: Safari → Teilen →
  „Zum Home-Bildschirm"
- ✔ Phase 3: **Spieler-/Eltern-Portal** — Registrierung per Einladungscode
  (Trainer-Bereich „Portal-Zugänge": Codes je Spieler:in, WhatsApp-Versand,
  Kontenverwaltung), serverseitig gefilterte Sicht (`/api/portal` – Eltern
  sehen keine Namen fremder Kinder), Aktionen: Trainingsrückmeldung,
  Fahrer-Angebot, Heimspiel-Jobs, Kleidungs-Anfrage, eigene Kontaktdaten,
  weiteren Code einlösen (Eltern mit mehreren Kindern)
- ✔ PDF-Elternbriefe pro Spieler:in (`/api/brief-pdf`, fpdf2/DejaVu) mit
  vorausgefüllten Pflicht-Erklärungen – Download oder Teilen (WhatsApp)
- ✔ Phase 4: **Web-Push** (VAPID-Schlüssel entstehen automatisch in
  `data/vapid.json`; Abo im Portal unter Konto; neue Ankündigungen gehen
  automatisch als Mitteilung an die passende Zielgruppe), **Ferien-Cron**
  `/etc/cron.d/volleyball-ferien` (Mo 05:35, OpenHolidays DE-MV,
  `./manage.py ferien-sync`), **DSGVO-Seiten** `/datenschutz` + `/impressum`
  (⚠ Anschrift/Register einmalig in `server/seiten/*.html` ergänzen)
- ✔ **Tabellen-Automatik:** `/etc/cron.d/volleyball-tabelle` (täglich 06:05)
  gleicht die offizielle VMV-Ligatabelle von www.vmv24.de ab
  (`./manage.py tabelle-sync`; Liga über `VV_TABELLE_LIGA` in `.env`,
  Standard `VerbandsligaMänner`; Saison wird automatisch erkannt).
  Handpflege im Tabellen-Editor wird dabei überschrieben.

## Content-Hub-Anbindung (Stufe 3)

Die App liefert dem Content-Hub (eigene VM, privates Hetzner-Netz) einen Feed
öffentlicher Termine, Ergebnisse und Ankündigungen mit Zielgruppe „Öffentlich“
und nimmt freigegebene Meldungen als Ankündigung entgegen (`server/content_feed.py`).
Aktiv nur mit Token in der `.env` des Containers:

    CONTENT_FEED_TOKEN=<openssl rand -hex 32>      # derselbe Wert steht im Hub (scripts/app-kanal.sh)
    APP_PUBLIC_URL=https://volleyball.nettverwaltet.de

Caddy auf der Vereins-VM gibt `/api/content-feed` und `/api/content/*` nur für die
Hub-VM (10.0.0.2) über einen privaten Port frei, siehe `anbindung/Caddyfile-vm1-snippet.txt`
im Repo `contenthub`. Ohne Token antworten beide Endpunkte mit 404. Es werden nie
Mitglieder-, Kinder- oder Kontaktdaten ausgeliefert.
