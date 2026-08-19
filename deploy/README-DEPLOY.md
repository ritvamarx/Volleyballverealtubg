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
   ssh benutzer@server "cd /opt/volleyball && sed -i \"s/BITTE-ERSETZEN/$(python3 -c 'import secrets;print(secrets.token_hex(32))')/\" .env && docker compose up -d app"
   ```

3. **Caddy:** Block aus `deploy/Caddyfile-snippet.txt` ins bestehende
   Caddyfile aufnehmen, dann `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.
   (Netzname in `docker-compose.yml` prüfen: `docker network ls` — Standard
   hier ist das externe Netz `caddy`.)

4. **Erstes Trainerkonto:**
   ```bash
   ssh benutzer@server "cd /opt/volleyball && docker compose exec app ./manage.py create-trainer --username andreas --name 'Andreas Berg'"
   ```
   Beim ersten Login richtet das Konto verpflichtend TOTP-2FA ein
   (Authenticator-App; Backup-Codes werden einmalig angezeigt).

5. **Weitere Trainer:** In der App anmelden … oder per CLI einen
   Einladungscode erzeugen und per WhatsApp verschicken:
   ```bash
   docker compose exec app ./manage.py create-invite --role trainer --name "Katrin Sommer"
   ```
   Registrierung dann unter `https://volleyball.nettverwaltet.de/?code=XXXX-XXXX-XXXX`.

6. **Datenübernahme:** Als Trainer anmelden → die App bietet an, lokale
   Browserdaten zu übertragen — oder Datensicherung → „Verschlüsselt
   importieren" mit der vorhandenen `.skv`-Datei.

7. **Backup-Cron:** `deploy/cron/volleyball-backup` nach `/etc/cron.d/`
   kopieren und das Ziel an euer bestehendes vereins-backup-Muster anpassen
   (Sicherungen gehören zusätzlich auf ein anderes System!).

## Updates (wie gewohnt)

```bash
./deploy/deploy.sh benutzer@server
```
(rsync → `docker compose up -d --build app` → Healthcheck. `data/` und `.env`
werden nie angefasst.)

## Notfall-Kommandos

```bash
docker compose exec app ./manage.py list-users
docker compose exec app ./manage.py reset-2fa <benutzername>
docker compose exec app ./manage.py reset-password <benutzername>
docker compose exec app ./manage.py backup /app/data/backups
```

## Was Phase 1 kann — und was noch nicht

- ✔ Login (Trainer mit Pflicht-2FA), mehrere Trainerkonten, Registrierung
  per Einladungscode (alle Rollen)
- ✔ Zentraler Datenbestand mit Versionsprüfung, Verlauf (30 Stände, mit
  Autor), Konfliktwarnung, Offline-Puffer
- ✔ Spieler-/Eltern-Konten können sich bereits registrieren und anmelden,
  sehen aber nur eine „Portal folgt"-Seite — die gefilterte Portal-Sicht
  ist Phase 3
- ➜ Phase 2: PWA (Home-Bildschirm-App), Phase 4: Push, Ferien-Cron, DSGVO-Seiten
