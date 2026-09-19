# contenthub/ — Deployment- und Konzeptpaket für den Content-Hub

Gehört zu `../PLAN-CONTENT-AUTOMATION.md` und `../PLAN-INFRASTRUKTUR.md`.
Läuft auf einer **eigenen Hetzner-VM** („hub“) unter **`/opt/contenthub`**
mit eigenem Caddy. Gedacht als Startinhalt eines eigenen Repos `contenthub`.

```
docker-compose.yml        caddy · n8n · postgres · nocodb (Profil board) · renderer (Profil visuals)
compose.lokal.yml         lokale Werkstatt auf dem Mac (localhost:5678, ohne Caddy)
Caddyfile                 eigener Caddy: n8n. / hub. / media.nettverwaltet.de
.env.example              → .env (Schlüssel; nie ins Repo)
config/                   Schicht 1: Modelle je Schritt, Kanal-Limits
scripts/                  setup-vm.sh (Grundinstallation), workflows-export/-import.sh
deploy.sh                 rsync → compose up → Workflow-Import
backup.sh, cron/          tägliche Sicherung (DBs, Workflows, Credentials, Medien)
werkzeuge/                Schicht 5: eigene Python-Dienste (Muster)
sql/                      Hub-Datenmodell + Init-Skript (läuft beim ersten Postgres-Start)
mandanten/                Profil-Schema, Inventar, Beispielprofile (werkhaus, spd-waren, skv-mueritz)
briefing.md               Felder des Eingangs-Formulars
prompts/                  System-Prompts + JSON-Schemata der Sub-Workflows
workflows/                Bauanleitung W1 (Stufe 1), Knoten für Knoten
anbindung/                Content-Feed-/Inbox-API der nettverwaltet-Container (+ Referenz-Blueprint, Caddy-Snippet VM 1)
renderer/, templates/     Stufe 5: HTML → PNG
```

## Stufe 1 in Kürze

```bash
# 1) VM 2 anlegen (Hetzner: 8 GB, Cloud Network, Firewall, Backup-Option), DNS n8n/hub/media → VM 2
# 2) Grundinstallation als root auf VM 2
bash scripts/setup-vm.sh deploy "ssh-ed25519 AAAA… ritva@mac"
# 3) vom Mac
./deploy.sh deploy@hub-server                     # rsync + compose up (Caddy, n8n, Postgres)
ssh deploy@hub-server "cd /opt/contenthub && cp .env.example .env && nano .env"   # Werte setzen, dann:
ssh deploy@hub-server "cd /opt/contenthub && docker compose up -d"
# 4) Backup-Cron
ssh deploy@hub-server "sudo cp /opt/contenthub/cron/contenthub-backup /etc/cron.d/"
```

Danach `https://n8n.nettverwaltet.de` (nur von deiner IP) öffnen, Owner-Konto
+ 2FA anlegen, Credentials (`postgres`, `llm-standard`, `smtp`) hinterlegen
und W1 nach `workflows/W1-briefing-paket.md` bauen — am besten zuerst lokal:

```bash
docker compose -f docker-compose.yml -f compose.lokal.yml up      # http://localhost:5678
./scripts/workflows-export.sh && git commit -am "W1" && ./deploy.sh deploy@hub-server
```

Stufe 2: `docker compose --profile board up -d` (NocoDB unter `hub.nettverwaltet.de`).
Stufe 5: `docker compose --profile visuals up -d --build` (Renderer).
