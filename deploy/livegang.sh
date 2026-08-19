#!/usr/bin/env bash
# SKV Müritz Volleyball – kompletter Livegang in einem Befehl.
#
#   ./deploy/livegang.sh benutzer@server
#
# Erledigt automatisch: DNS-Check, Caddy-Netz erkennen, Dateien übertragen,
# .env mit Schlüssel erzeugen, Image bauen & starten, Caddy-vHost eintragen
# (mit Sicherungskopie des Caddyfile) und neu laden, erstes Trainerkonto
# anlegen (falls noch keines existiert), Backup-Cron installieren, Endkontrolle.
# Mehrfach ausführbar – bereits erledigte Schritte werden übersprungen.
set -euo pipefail

HOST="${1:?Aufruf: ./deploy/livegang.sh benutzer@server}"
DOMAIN="volleyball.nettverwaltet.de"
REFERENZ_DOMAIN="mein.werkhauswaren.de"
PFAD="/opt/volleyball"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

schritt() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()      { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
warn()    { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1. DNS
schritt "1/8 DNS prüfen"
SERVER_IP="$(dig +short "$REFERENZ_DOMAIN" | tail -1 || true)"
VB_IP="$(dig +short "$DOMAIN" | tail -1 || true)"
if [ -n "$VB_IP" ] && [ "$VB_IP" = "$SERVER_IP" ]; then
  ok "$DOMAIN → $VB_IP (identisch mit $REFERENZ_DOMAIN)"
elif [ -n "$VB_IP" ]; then
  warn "$DOMAIN zeigt auf $VB_IP, $REFERENZ_DOMAIN auf $SERVER_IP – bitte prüfen."
else
  warn "$DOMAIN hat noch keinen DNS-Eintrag."
  warn "→ A-Record 'volleyball' auf $SERVER_IP anlegen (TLS klappt erst danach)."
fi

# ------------------------------------------- 2. Caddy-Netz erkennen
schritt "2/8 Caddy-Container und Docker-Netz erkennen"
# Container übers Image finden – der Name kann alles Mögliche sein (caddy, caddy-caddy-1, …)
CADDY_CTN="$(ssh "$HOST" "docker ps --format '{{.Names}}\t{{.Image}}'" 2>/dev/null \
        | awk -F'\t' 'tolower($2) ~ /caddy/ {print $1; exit}' || true)"
if [ -z "$CADDY_CTN" ]; then
  CADDY_CTN="$(ssh "$HOST" "docker ps --format '{{.Names}}'" 2>/dev/null \
          | grep -im1 caddy || true)"
fi
if [ -z "$CADDY_CTN" ]; then
  warn "Kein laufender Caddy-Container gefunden – laufende Container:"
  ssh "$HOST" "docker ps --format '  {{.Names}}  ({{.Image}})'" || true
  warn "Verwende Netzname 'caddy' – Caddy-Schritte müssen ggf. manuell erfolgen."
  CADDY_CTN=""
  NETZ="caddy"
else
  ok "Caddy-Container: $CADDY_CTN"
  NETZ="$(ssh "$HOST" "docker inspect '$CADDY_CTN' -f '{{json .NetworkSettings.Networks}}'" 2>/dev/null \
          | sed 's/^{\"//; s/\".*//' || true)"
  if [ -z "$NETZ" ]; then NETZ="caddy"; fi
  ok "Caddy hängt im Netz: $NETZ"
fi

# ------------------------------------------------- 3. Dateien übertragen
schritt "3/8 Dateien nach $HOST:$PFAD übertragen"
ssh "$HOST" "mkdir -p $PFAD/data"
rsync -az --delete \
  --exclude '.git' --exclude 'data' --exclude '.env' --exclude 'dist' \
  --exclude 'node_modules' \
  "$REPO_ROOT/index.html" "$REPO_ROOT/assets" "$REPO_ROOT/server" "$REPO_ROOT/deploy" \
  "$HOST:$PFAD/"
ssh "$HOST" "cd $PFAD && cp deploy/docker-compose.yml . \
  && sed -i 's/^  caddy:\$/  $NETZ:/; s/^      - caddy\$/      - $NETZ/' docker-compose.yml \
  && { [ -f .env ] || echo SECRET_KEY=\$(python3 -c 'import secrets;print(secrets.token_hex(32))') > .env; }"
ok "Übertragen (docker-compose auf Netz '$NETZ' eingestellt, .env vorhanden)"

# --------------------------------------------------- 4. Bauen & starten
schritt "4/8 Image bauen und Container starten"
ssh "$HOST" "cd $PFAD && docker compose up -d --build app"
sleep 3
GESUND="$(ssh "$HOST" "cd $PFAD && docker compose exec -T app python3 -c \"import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/gesund').read().decode())\"" || true)"
if echo "$GESUND" | grep -q '"ok"'; then
  ok "App-Container läuft und antwortet"
else
  warn "Healthcheck fehlgeschlagen – letzte Logzeilen:"
  ssh "$HOST" "cd $PFAD && docker compose logs --tail 25 app" || true
  exit 1
fi

# --------------------------------------------------- 5. Caddy-vHost
schritt "5/8 Caddy-vHost eintragen"
CADDYFILE=""
if [ -n "$CADDY_CTN" ]; then
  CADDYFILE="$(ssh "$HOST" "docker inspect '$CADDY_CTN' -f '{{range .Mounts}}{{.Destination}}={{.Source}}
{{end}}'" 2>/dev/null | grep '^/etc/caddy/Caddyfile=' | cut -d= -f2 || true)"
fi
if [ -z "$CADDYFILE" ]; then
  warn "Caddyfile-Pfad nicht automatisch gefunden."
  warn "→ Bitte Block aus deploy/Caddyfile-snippet.txt manuell eintragen und Caddy neu laden."
else
  if ssh "$HOST" "grep -q '$DOMAIN' '$CADDYFILE'"; then
    ok "vHost für $DOMAIN steht bereits im Caddyfile ($CADDYFILE)"
  else
    ssh "$HOST" "cp '$CADDYFILE' '$CADDYFILE.bak-\$(date +%Y%m%d%H%M)' && cat >> '$CADDYFILE'" <<EOF

$DOMAIN {
    encode gzip
    reverse_proxy volleyball-app:8000
}
EOF
    ok "vHost angehängt (Sicherungskopie des Caddyfile liegt daneben)"
  fi
  if ssh "$HOST" "docker exec '$CADDY_CTN' caddy validate --config /etc/caddy/Caddyfile" >/dev/null 2>&1; then
    ssh "$HOST" "docker exec '$CADDY_CTN' caddy reload --config /etc/caddy/Caddyfile"
    ok "Caddy neu geladen"
  else
    warn "Caddyfile-Validierung fehlgeschlagen – Eintrag bitte prüfen (Sicherung liegt bereit)."
  fi
fi

# --------------------------------------------------- 6. Erstes Trainerkonto
schritt "6/8 Trainerkonto"
ANZAHL="$(ssh "$HOST" "cd $PFAD && docker compose exec -T app ./manage.py list-users 2>/dev/null | wc -l" || echo 0)"
if [ "${ANZAHL:-0}" -gt 0 ]; then
  ok "Es existieren bereits $ANZAHL Konto/Konten – Schritt übersprungen"
else
  read -r -p "  Benutzername für dein Trainerkonto: " TUSER
  read -r -p "  Voller Name: " TNAME
  ssh -t "$HOST" "cd $PFAD && docker compose exec app ./manage.py create-trainer --username '$TUSER' --name '$TNAME'"
  ok "Trainerkonto '$TUSER' angelegt (2FA wird beim ersten Login eingerichtet)"
fi

# --------------------------------------------------- 7. Backup-Cron
schritt "7/8 Backup-Cron installieren"
if ssh "$HOST" "cp $PFAD/deploy/cron/volleyball-backup /etc/cron.d/volleyball-backup" 2>/dev/null; then
  ok "/etc/cron.d/volleyball-backup installiert (Ziel ggf. an vereins-backup-Muster angleichen)"
else
  warn "Konnte Cron nicht installieren (kein root?) – bitte manuell kopieren."
fi

# --------------------------------------------------- 8. Endkontrolle
schritt "8/8 Endkontrolle über die Domain"
for i in 1 2 3 4 5 6; do
  if curl -fsS --max-time 10 "https://$DOMAIN/gesund" 2>/dev/null | grep -q '"ok"'; then
    ok "https://$DOMAIN ist erreichbar – Zertifikat aktiv"
    printf '\n\033[1;32m🏐 FERTIG! Jetzt anmelden: https://%s\033[0m\n' "$DOMAIN"
    printf '   (Erster Login führt durch die 2FA-Einrichtung – Backup-Codes sichern!)\n'
    exit 0
  fi
  sleep 10
done
warn "Extern noch nicht erreichbar – meist fehlt der DNS-Eintrag oder das Zertifikat braucht noch einen Moment."
warn "Später prüfen mit:  curl https://$DOMAIN/gesund"
