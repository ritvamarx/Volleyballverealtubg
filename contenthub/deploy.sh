#!/usr/bin/env bash
# Deployment des Content-Hubs auf VM 2:   ./deploy.sh benutzer@hub-server
# rsync (ohne data/ und .env) → docker compose up -d → Workflows importieren → Healthcheck.
# Alternativ auf dem Server: git pull && docker compose up -d && scripts/workflows-import.sh
set -euo pipefail
HOST="${1:?Aufruf: ./deploy.sh benutzer@hub-server}"
PFAD="/opt/contenthub"
cd "$(dirname "$0")"
rsync -az --delete \
  --exclude data/ --exclude .env --exclude '.git/' --exclude 'renderer/__pycache__' \
  ./ "$HOST:$PFAD/"
ssh "$HOST" "cd $PFAD && docker compose up -d --remove-orphans && ./scripts/workflows-import.sh && docker compose ps"
ssh "$HOST" "curl -fsS -o /dev/null -w 'n8n: %{http_code}\n' http://127.0.0.1:5678/healthz || true"
