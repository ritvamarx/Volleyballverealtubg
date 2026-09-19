#!/usr/bin/env bash
# Exportiert alle n8n-Workflows als einzelne JSON-Dateien nach workflows/ (Schicht 4 → Git).
# Auf dem Server oder in der lokalen Werkstatt ausführen; danach committen.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T n8n n8n export:workflow --all --separate --pretty --output=/files/workflows/ >/dev/null
# n8n benennt nach ID; lesbare Namen daneben ablegen
for f in workflows/*.json; do
  name="$(python3 -c "import json,sys,re;print(re.sub(r'[^a-z0-9]+','-',json.load(open(sys.argv[1]))['name'].lower()).strip('-'))" "$f")"
  [ -n "$name" ] && mv -f "$f" "workflows/${name}.json"
done
echo "Exportiert: $(ls workflows/*.json | wc -l) Workflows → workflows/"
