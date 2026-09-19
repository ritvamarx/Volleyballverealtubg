# contenthub/ — Deployment- und Konzeptpaket für den Content-Hub

Gehört zu `../PLAN-CONTENT-AUTOMATION.md`. Zielordner auf dem Server:
**`/opt/contenthub`** (gleiches Muster wie `/opt/volleyball`, `/opt/werkhaus`).

```
docker-compose.yml        n8n · postgres · nocodb (Profil board) · renderer (Profil visuals)
.env.example              → .env (Schlüssel; nie ins Repo)
Caddyfile-snippet.txt     vHosts n8n. / hub. / media.nettverwaltet.de
backup.sh, cron/          tägliche Sicherung (DBs, Workflows, Credentials, Medien)
sql/                      Hub-Datenmodell + Init-Skript (läuft beim ersten Postgres-Start)
mandanten/                Profil-Schema, Inventar, Beispielprofile (werkhaus, spd-waren, skv-mueritz)
briefing.md               Felder des Eingangs-Formulars
prompts/                  System-Prompts + JSON-Schemata der Sub-Workflows
workflows/                Bauanleitung W1 (Stufe 1), Knoten für Knoten
anbindung/                Content-Feed-/Inbox-API der nettverwaltet-Container (+ Referenz-Blueprint)
renderer/, templates/     Stufe 5: HTML → PNG
```

## Stufe 1 in Kürze

```bash
# vom Mac
rsync -av --exclude data --exclude .env contenthub/ benutzer@server:/opt/contenthub/
ssh benutzer@server
cd /opt/contenthub && cp .env.example .env && nano .env      # Werte setzen
mkdir -p data/n8n data/postgres data/media data/backups && chown -R 1000:1000 data/n8n
docker compose up -d                                          # n8n + postgres
# Caddy: Block aus Caddyfile-snippet.txt einfügen, dann
docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile
# Backup-Cron
cp cron/contenthub-backup /etc/cron.d/ && chmod 644 /etc/cron.d/contenthub-backup
```

Danach `https://n8n.nettverwaltet.de` öffnen, Owner-Konto + 2FA anlegen,
Credentials (Postgres, LLM, SMTP) hinterlegen und W1 nach
`workflows/W1-briefing-paket.md` bauen.

Stufe 2: `docker compose --profile board up -d` (NocoDB unter
`hub.nettverwaltet.de`, Hub-DB als externe Datenquelle einbinden).
Stufe 5: VM auf 8 GB, `docker compose --profile visuals up -d --build`.
