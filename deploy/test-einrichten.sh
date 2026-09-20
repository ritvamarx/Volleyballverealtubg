#!/usr/bin/env bash
# SKV Müritz Volleyball – TEST-Umgebung einrichten (einmalig, AUF DEM SERVER
# ausführen, z. B. in der Hetzner-Konsole als root):
#
#   curl -sL https://raw.githubusercontent.com/ritvamarx/Volleyballverealtubg/main/deploy/test-einrichten.sh | bash
#
# Ergebnis: https://volleyball-test.nettverwaltet.de – eigener Container
# (volleyball-test-app), eigene Datenbank, eigenes .env; aktualisiert sich
# danach alle 10 Minuten selbst vom GitHub-Stand (main).
# Die LIVE-Instanz (/opt/volleyball) und alle anderen Container werden
# nicht angefasst; Caddy bekommt nur einen zusätzlichen vHost
# (mit Sicherungskopie + validate vor dem Reload). Mehrfach ausführbar.
set -euo pipefail

REPO="ritvamarx/Volleyballverealtubg"
PFAD="/opt/volleyball-test"
DOMAIN="volleyball-test.nettverwaltet.de"

echo "▶ 1/6 Dateien von GitHub holen"
mkdir -p "$PFAD/data"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" \
  | tar -xz -C "$TMP" --strip-components=1
cp -r "$TMP/index.html" "$TMP/assets" "$TMP/server" "$TMP/deploy" "$PFAD/"

echo "▶ 2/6 docker-compose und .env vorbereiten"
if [ -f /opt/volleyball/docker-compose.yml ]; then
  # Netzname usw. von der Live-Instanz übernehmen, nur Namen umbenennen
  sed 's/volleyball-app/volleyball-test-app/g' /opt/volleyball/docker-compose.yml > "$PFAD/docker-compose.yml"
else
  sed 's/volleyball-app/volleyball-test-app/g' "$PFAD/deploy/docker-compose.yml" > "$PFAD/docker-compose.yml"
fi
[ -f "$PFAD/.env" ] || echo "SECRET_KEY=$(python3 -c 'import secrets;print(secrets.token_hex(32))')" > "$PFAD/.env"

echo "▶ 3/6 Test-Container bauen und starten"
cd "$PFAD"
docker compose up -d --build app
sleep 3
docker compose exec -T app python3 -c \
  "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/gesund').read().decode())"

echo "▶ 4/6 Caddy-vHost eintragen"
CADDY_CTN="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($2) ~ /caddy/ {print $1; exit}')"
CADDYFILE="$(docker inspect "$CADDY_CTN" -f '{{range .Mounts}}{{.Destination}}={{.Source}}
{{end}}' | grep '^/etc/caddy/Caddyfile=' | cut -d= -f2)"
if ! grep -q "$DOMAIN" "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d%H%M)"
  printf '\n%s {\n    encode gzip\n    reverse_proxy volleyball-test-app:8000\n}\n' "$DOMAIN" >> "$CADDYFILE"
fi
docker exec "$CADDY_CTN" caddy validate --config /etc/caddy/Caddyfile >/dev/null
docker exec "$CADDY_CTN" caddy reload --config /etc/caddy/Caddyfile

echo "▶ 5/6 Auto-Update der Test-Instanz einrichten (alle 10 Minuten)"
chmod +x "$PFAD/deploy/auto-update.sh"
cp "$PFAD/deploy/cron/volleyball-test-update" /etc/cron.d/volleyball-test-update
SHA="$(curl -fsSL "https://api.github.com/repos/$REPO/commits/main" | grep -m1 '"sha"' | cut -d'"' -f4)"
[ -n "$SHA" ] && echo "$SHA" > "$PFAD/.deployed-sha"

echo "▶ 6/6 Fertig"
echo "🧪 TEST-UMGEBUNG BEREIT: https://$DOMAIN"
echo "   (Erstes Trainerkonto anlegen mit:"
echo "    cd $PFAD && docker compose exec app ./manage.py create-trainer --username NAME)"
