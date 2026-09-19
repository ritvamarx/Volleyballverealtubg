#!/usr/bin/env bash
# Importiert alle workflows/*.json in die laufende n8n-Instanz (gleiche ID = aktualisieren).
# Wird von deploy.sh aufgerufen; Credentials müssen vorher unter denselben Namen existieren.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T n8n n8n import:workflow --separate --input=/files/workflows/ 
echo "Importiert. Aktive Workflows bleiben aktiv; neue müssen einmal in der Oberfläche aktiviert werden."
