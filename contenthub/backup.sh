#!/usr/bin/env bash
# /opt/contenthub/backup.sh – wird vom Cron /etc/cron.d/contenthub-backup aufgerufen.
set -euo pipefail
cd /opt/contenthub
ZIEL="${1:-/opt/contenthub/data/backups}"     # Ziel an vereins-backup-Muster anpassen
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$ZIEL/$STAMP"
set -a; . ./.env; set +a

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d n8n        | gzip > "$ZIEL/$STAMP/n8n.sql.gz"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d contenthub | gzip > "$ZIEL/$STAMP/contenthub.sql.gz"
docker compose exec -T n8n n8n export:workflow    --all --output=/tmp/workflows.json   >/dev/null
docker compose exec -T n8n n8n export:credentials --all --output=/tmp/credentials.json >/dev/null
docker compose cp n8n:/tmp/workflows.json   "$ZIEL/$STAMP/workflows.json"
docker compose cp n8n:/tmp/credentials.json "$ZIEL/$STAMP/credentials.json"
tar czf "$ZIEL/$STAMP/media-und-mandanten.tgz" data/media mandanten templates 2>/dev/null || true

# 14 Tage vorhalten (Langzeit-Sicherung übernimmt das bestehende Backup-Ziel)
find "$ZIEL" -maxdepth 1 -mindepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "$(date -Is) Backup nach $ZIEL/$STAMP fertig"
