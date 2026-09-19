#!/bin/bash
# Wird beim ERSTEN Start des Postgres-Containers ausgeführt (docker-entrypoint-initdb.d).
# Legt neben "n8n" (POSTGRES_DB) die Hub-Datenbank "contenthub" und "nocodb" an
# und spielt das Hub-Schema ein.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE DATABASE contenthub;
    CREATE DATABASE nocodb;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname contenthub -f /contenthub-schema/schema.sql
