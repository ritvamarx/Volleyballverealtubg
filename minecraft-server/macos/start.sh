#!/bin/bash
# Startet den Paper-Server. Wird sowohl von Hand als auch von launchd aufgerufen.
#
# Die Heap-Größe wird aus dem verbauten RAM abgeleitet (Gesamt minus 3 GB für
# macOS). Überschreiben lässt sie sich per Umgebungsvariable:
#   MC_HEAP=4G ./start.sh
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# launchd startet Dienste ohne den PATH einer Anmeldesitzung — Java deshalb
# ueber java_home aufloesen statt auf "java" im PATH zu vertrauen.
JAVA="$(/usr/libexec/java_home -v 21)/bin/java"
[[ -x "$JAVA" ]] || { echo "Java 21 nicht gefunden. brew install --cask temurin@21" >&2; exit 1; }
[[ -f paper.jar ]] || { echo "paper.jar fehlt. Zuerst ./setup.sh ausfuehren." >&2; exit 1; }

if [[ -z "${MC_HEAP:-}" ]]; then
  TOTAL_MB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
  HEAP_MB=$(( TOTAL_MB - 3072 ))            # 3 GB bleiben fuer macOS
  (( HEAP_MB < 1024 )) && HEAP_MB=1024
  # Obergrenze 8 GB: Mehr bringt einer kleinen Runde nichts, kostet aber echten
  # Arbeitsspeicher (AlwaysPreTouch belegt den Heap sofort vollstaendig). Ab
  # 12 GB braeuchten die Aikar-Flags unten ausserdem andere Werte.
  (( HEAP_MB > 8192 )) && HEAP_MB=8192
  MC_HEAP="${HEAP_MB}M"
fi

# Aikar-Flags: seit Jahren der Standard fuer Paper-Server. Sie halten die
# GC-Pausen kurz, was man im Spiel als ausbleibende Ruckler merkt.
FLAGS=(
  "-Xms$MC_HEAP" "-Xmx$MC_HEAP"
  -XX:+UseG1GC
  -XX:+ParallelRefProcEnabled
  -XX:MaxGCPauseMillis=200
  -XX:+UnlockExperimentalVMOptions
  -XX:+DisableExplicitGC
  -XX:+AlwaysPreTouch
  -XX:G1NewSizePercent=30
  -XX:G1MaxNewSizePercent=40
  -XX:G1HeapRegionSize=8M
  -XX:G1ReservePercent=20
  -XX:G1HeapWastePercent=5
  -XX:G1MixedGCCountTarget=4
  -XX:InitiatingHeapOccupancyPercent=15
  -XX:G1MixedGCLiveThresholdPercent=90
  -XX:G1RSetUpdatingPauseTimePercent=5
  -XX:SurvivorRatio=32
  -XX:+PerfDisableSharedMem
  -XX:MaxTenuringThreshold=1
  -Dusing.aikars.flags=https://mcflags.emc.gs
  -Daikars.new.flags=true
)

echo "Starte Paper mit $MC_HEAP Heap..."
exec "$JAVA" "${FLAGS[@]}" -jar paper.jar --nogui
