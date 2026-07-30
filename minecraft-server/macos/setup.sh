#!/bin/bash
# Richtet einen PaperMC-Server im aktuellen Ordner ein.
#
#   ./setup.sh            Ersteinrichtung (Welt und Konfiguration bleiben erhalten)
#   ./setup.sh --update   nur die Paper-JAR aktualisieren, vorher Backup
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SERVER_DIR"

UPDATE_ONLY=false
[[ "${1:-}" == "--update" ]] && UPDATE_ONLY=true

info()  { printf '\033[32m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m==>\033[0m %s\n' "$1"; }
abort() { printf '\033[31mFehler:\033[0m %s\n' "$1" >&2; exit 1; }

# --- Java prüfen -------------------------------------------------------------
if ! /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
  abort "Java 21 nicht gefunden. Installieren mit:  brew install --cask temurin@21"
fi
JAVA_HOME_21="$(/usr/libexec/java_home -v 21)"
info "Java gefunden: $JAVA_HOME_21"

ARCH="$(uname -m)"
JAVA_ARCH="$("$JAVA_HOME_21/bin/java" -XshowSettings:properties -version 2>&1 |
             awk -F'= ' '/os.arch/ {print $2}' | tr -d ' ')"
if [[ "$ARCH" == "arm64" && "$JAVA_ARCH" != "aarch64" ]]; then
  warn "Java läuft als $JAVA_ARCH unter Rosetta-Emulation statt nativ (aarch64)."
  warn "Das kostet spürbar Leistung. ARM-Build von https://adoptium.net installieren."
fi

# --- Backup vor einem Update -------------------------------------------------
if $UPDATE_ONLY && [[ -d world ]]; then
  info "Sicherung vor dem Update..."
  ./backup.sh || warn "Backup fehlgeschlagen — Update wird trotzdem fortgesetzt."
fi

# --- Paper herunterladen -----------------------------------------------------
download_paper() {
  command -v jq >/dev/null 2>&1 || abort "jq fehlt. Installieren mit:  brew install jq"

  local api="https://api.papermc.io/v2/projects/paper"
  local version build jar url

  version="$(curl -fsSL --max-time 30 "$api" 2>/dev/null | jq -r '.versions[-1] // empty')"
  [[ -n "$version" ]] || return 1

  build="$(curl -fsSL --max-time 30 "$api/versions/$version/builds" 2>/dev/null |
           jq -r '[.builds[] | select(.channel == "default")][-1].build // empty')"
  [[ -n "$build" ]] || return 1

  jar="paper-$version-$build.jar"
  url="$api/versions/$version/builds/$build/downloads/$jar"

  info "Lade Paper $version (Build $build)..."
  curl -fSL --max-time 300 -o paper.jar.tmp "$url" || return 1
  mv paper.jar.tmp paper.jar
  echo "$version-$build" > .paper-version
  info "Paper $version installiert."
}

if [[ -f paper.jar ]] && ! $UPDATE_ONLY; then
  info "paper.jar ist bereits vorhanden — Download übersprungen."
elif ! download_paper; then
  rm -f paper.jar.tmp
  if [[ -f paper.jar ]]; then
    warn "Download fehlgeschlagen, die vorhandene paper.jar bleibt in Benutzung."
  else
    abort "Paper konnte nicht geladen werden (API erreichbar? Version geändert?).
       Bitte manuell von https://papermc.io/downloads laden,
       als 'paper.jar' hier ablegen und ./setup.sh erneut starten."
  fi
fi

$UPDATE_ONLY && { info "Update abgeschlossen."; exit 0; }

# --- EULA --------------------------------------------------------------------
if [[ ! -f eula.txt ]]; then
  cat <<'EOF'

Der Betrieb erfordert die Zustimmung zur Minecraft-EULA:
https://aka.ms/MinecraftEULA

EOF
  read -r -p "EULA akzeptieren? [j/N] " answer
  [[ "$answer" =~ ^[jJyY]$ ]] || abort "Ohne Zustimmung zur EULA kann der Server nicht starten."
  echo "eula=true" > eula.txt
  info "EULA akzeptiert."
fi

# --- RCON-Passwort -----------------------------------------------------------
if [[ ! -f rcon.password ]]; then
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 > rcon.password
  chmod 600 rcon.password
  info "RCON-Passwort erzeugt (rcon.password, nur für dich lesbar)."
fi

# --- Grundkonfiguration ------------------------------------------------------
if [[ ! -f server.properties ]]; then
  TOTAL_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
  if (( TOTAL_GB <= 4 )); then
    VIEW=6; SIM=4
    info "4 GB RAM erkannt — Sparwerte werden gesetzt (view-distance 6)."
  else
    VIEW=8; SIM=6
  fi

  cat > server.properties <<EOF
# Von setup.sh erzeugt. Änderungen bleiben bei ./setup.sh --update erhalten.
motd=Minecraft-Server
server-port=25565
max-players=10
view-distance=$VIEW
simulation-distance=$SIM
difficulty=normal
gamemode=survival

# Sicherheit: beides so lassen.
online-mode=true
white-list=true

# RCON nur fuer den lokalen Zugriff - Port 25575 niemals im Router freigeben.
enable-rcon=true
rcon.port=25575
rcon.password=$(cat rcon.password)
EOF
  chmod 600 server.properties
  info "server.properties angelegt (view-distance $VIEW, Whitelist aktiv)."
fi

mkdir -p logs backups

cat <<EOF

Fertig. Nächste Schritte:

  1. Server starten:     ./start.sh
  2. Dich freischalten:  im Serverfenster  whitelist add DEIN_MINECRAFT_NAME
  3. Dauerbetrieb:       Phase 4 in README.md (launchd und Energieeinstellungen)

EOF
