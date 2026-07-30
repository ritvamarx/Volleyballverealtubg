#!/bin/bash
# Sichert die Weltordner als tar.gz nach ./backups/.
#
# Laeuft der Server gerade, wird das Speichern ueber RCON kurz angehalten und
# alles auf die Platte geschrieben. Ohne diesen Schritt landen halb
# geschriebene Chunks im Archiv, und das Backup ist im Ernstfall wertlos.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KEEP_DAYS=7
STAMP="$(date +%Y-%m-%d-%H%M)"
ARCHIVE="backups/world-$STAMP.tar.gz"
mkdir -p backups

rcon() {
  [[ -f rcon.password ]] || return 1
  command -v mcrcon >/dev/null 2>&1 || return 1
  mcrcon -H 127.0.0.1 -P 25575 -p "$(cat rcon.password)" "$@" >/dev/null 2>&1
}

SAVE_DISABLED=false
if rcon "save-off" "save-all flush"; then
  SAVE_DISABLED=true
  echo "Speichern angehalten, Welt auf die Platte geschrieben."
  sleep 3
else
  echo "Kein laufender Server erreichbar — es wird direkt gesichert."
fi

# Speichern in jedem Fall wieder einschalten, auch wenn tar fehlschlaegt.
resume_saving() {
  if $SAVE_DISABLED; then
    rcon "save-on" && echo "Speichern wieder aktiviert."
  fi
}
trap resume_saving EXIT

WORLDS=()
for w in world world_nether world_the_end; do
  [[ -d "$w" ]] && WORLDS+=("$w")
done

if (( ${#WORLDS[@]} == 0 )); then
  echo "Keine Weltordner gefunden — nichts zu sichern." >&2
  exit 1
fi

tar -czf "$ARCHIVE" "${WORLDS[@]}"
echo "Sicherung erstellt: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

DELETED=$(find backups -name 'world-*.tar.gz' -type f -mtime "+$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
(( DELETED > 0 )) && echo "$DELETED Sicherung(en) aelter als $KEEP_DAYS Tage geloescht."

exit 0
