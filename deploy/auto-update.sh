#!/usr/bin/env bash
# SKV Müritz Volleyball – automatisches Update einer Instanz vom GitHub-Stand.
# Test-Instanz folgt dem Branch main; die Live-Instanz folgt (optional) dem
# Branch "live", auf den nur nach ausdrücklicher Freigabe gepusht wird. Läuft per Cron (deploy/cron/volleyball-test-update):
# prüft alle 10 Minuten auf einen neuen Stand und deployt ihn selbstständig.
# Die LIVE-Instanz (/opt/volleyball) wird hiervon NIE angefasst – Live-Updates
# erfolgen nur nach ausdrücklicher Freigabe.
# data/ und .env der Ziel-Instanz bleiben unberührt.
set -euo pipefail

# Alles in einem { …; exit; }-Block: bash liest den Block vollständig ein,
# bevor er läuft. Sonst würde das Kopieren von deploy/ dieses Skript
# überschreiben, während bash es noch zeilenweise liest (→ Syntaxfehler).
{

REPO="ritvamarx/Volleyballverealtubg"
PFAD="${1:-/opt/volleyball-test}"
BRANCH="${2:-main}"   # Test folgt main, Live folgt dem Branch "live" (nur nach Freigabe)
SHA_DATEI="$PFAD/.deployed-sha"

# awk liest die Antwort vollständig (grep -m1 würde die Pipe vorzeitig
# schließen → curl-Fehler 23, mit pipefail Abbruch bei jedem Lauf)
NEU="$(curl -fsSL --max-time 30 "https://api.github.com/repos/$REPO/commits/$BRANCH" \
      | awk -F'"' '/"sha"/ && !s {s=$4} END {print s}')" || true
[ -n "$NEU" ] || exit 0
ALT="$(cat "$SHA_DATEI" 2>/dev/null || true)"
[ "$NEU" = "$ALT" ] && exit 0

echo "$(date -Is) neuer Stand $NEU (bisher: ${ALT:-keiner}) – Update startet"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 120 "https://codeload.github.com/$REPO/tar.gz/$NEU" \
  | tar -xz -C "$TMP" --strip-components=1

cp -r "$TMP/index.html" "$TMP/assets" "$TMP/server" "$TMP/deploy" "$PFAD/"
for extra in manifest.webmanifest sw.js; do
  [ -f "$TMP/$extra" ] && cp "$TMP/$extra" "$PFAD/"
done
cd "$PFAD"
docker compose up -d --build volleyball

# Erst nach erfolgreichem Start als deployt markieren
sleep 3
docker compose exec -T volleyball python3 -c \
  "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/gesund')" \
  >/dev/null </dev/null
echo "$NEU" > "$SHA_DATEI"
echo "$(date -Is) erfolgreich aktualisiert auf $NEU"
exit
}
