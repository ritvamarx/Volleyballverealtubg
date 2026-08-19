#!/usr/bin/env bash
# SKV Müritz Volleyball – Deployment nach eurer gewohnten Routine
# Aufruf VOM MAC aus:  ./deploy/deploy.sh benutzer@server
set -euo pipefail

ZIEL_HOST="${1:?Aufruf: ./deploy/deploy.sh benutzer@server}"
ZIEL_PFAD="/opt/volleyball"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "1/4 · rsync nach ${ZIEL_HOST}:${ZIEL_PFAD}"
ssh "${ZIEL_HOST}" "mkdir -p ${ZIEL_PFAD}/data"
rsync -az --delete \
  --exclude '.git' --exclude 'data' --exclude '.env' --exclude 'dist' \
  --exclude 'node_modules' \
  "${REPO_ROOT}/index.html" "${REPO_ROOT}/assets" "${REPO_ROOT}/server" \
  "${REPO_ROOT}/deploy" \
  "${ZIEL_HOST}:${ZIEL_PFAD}/"

echo "2/4 · docker-compose.yml an Ort und Stelle"
ssh "${ZIEL_HOST}" "cd ${ZIEL_PFAD} && cp deploy/docker-compose.yml . && [ -f .env ] || echo SECRET_KEY=\$(python3 -c 'import secrets;print(secrets.token_hex(32))') > .env"

echo "3/4 · Image bauen & starten"
ssh "${ZIEL_HOST}" "cd ${ZIEL_PFAD} && docker compose up -d --build app"

echo "4/4 · Erreichbarkeits-Check"
sleep 3
# Port 8000 ist nur im Docker-Netz erreichbar (expose, nicht ports) – daher im Container prüfen
ssh "${ZIEL_HOST}" "cd ${ZIEL_PFAD} && docker compose exec -T app python3 -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/gesund')\" >/dev/null 2>&1 || docker compose logs --tail 20 app"
curl -fsS "https://volleyball.nettverwaltet.de/gesund" && echo " ✔ volleyball.nettverwaltet.de erreichbar" || echo " (extern noch nicht erreichbar – DNS/Caddy prüfen)"
