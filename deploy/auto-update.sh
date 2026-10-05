#!/usr/bin/env bash
# SKV Müritz Volleyball – automatisches Update der TEST-Instanz vom
# GitHub-Stand (main). Läuft per Cron (deploy/cron/volleyball-test-update):
# prüft alle 10 Minuten auf einen neuen Stand und deployt ihn selbstständig.
# Die LIVE-Instanz (/opt/volleyball) wird hiervon NIE angefasst – Live-Updates
# erfolgen nur nach ausdrücklicher Freigabe.
# data/ und .env der Ziel-Instanz bleiben unberührt.
set -euo pipefail

REPO="ritvamarx/Volleyballverealtubg"
PFAD="${1:-/opt/volleyball-test}"
SHA_DATEI="$PFAD/.deployed-sha"

NEU="$(curl -fsSL --max-time 30 "https://api.github.com/repos/$REPO/commits/main" \
      | grep -m1 '"sha"' | cut -d'"' -f4)"
[ -n "$NEU" ] || exit 0
ALT="$(cat "$SHA_DATEI" 2>/dev/null || true)"
[ "$NEU" = "$ALT" ] && exit 0

echo "$(date -Is) neuer Stand $NEU (bisher: ${ALT:-keiner}) – Update startet"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 120 "https://codeload.github.com/$REPO/tar.gz/$NEU" \
  | tar -xz -C "$TMP" --strip-components=1

cp -r "$TMP/index.html" "$TMP/assets" "$TMP/server" "$TMP/deploy" "$PFAD/"
cd "$PFAD"
docker compose up -d --build app

# Erst nach erfolgreichem Start als deployt markieren
sleep 3
docker compose exec -T app python3 -c \
  "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/gesund')" \
  >/dev/null
echo "$NEU" > "$SHA_DATEI"
echo "$(date -Is) erfolgreich aktualisiert auf $NEU"
