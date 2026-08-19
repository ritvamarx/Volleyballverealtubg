"""SKV Müritz Volleyball – SQLite-Datenhaltung.

Eine Datenbankdatei (data/volleyball.db) nach dem Muster der bestehenden
nettverwaltet-Plattform. Enthält Konten/Sessions/Einladungen sowie den
App-Datenbestand als versioniertes JSON-Dokument mit Verlauf.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time

DATA_DIR = os.environ.get("VOLLEYBALL_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "volleyball.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('trainer','spieler','eltern')),
    pw_hash       TEXT NOT NULL,
    totp_secret   TEXT,
    totp_enabled  INTEGER NOT NULL DEFAULT 0,
    backup_codes  TEXT NOT NULL DEFAULT '[]',   -- JSON-Liste gehashter Einmalcodes
    player_ids    TEXT NOT NULL DEFAULT '[]',   -- JSON-Liste verknüpfter Spieler-IDs
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    csrf        TEXT NOT NULL,
    pre_2fa     INTEGER NOT NULL DEFAULT 0,     -- 1 = Passwort ok, 2FA fehlt noch
    created_at  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    ip          TEXT,
    ua          TEXT
);

CREATE TABLE IF NOT EXISTS invites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash   TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL CHECK (role IN ('trainer','spieler','eltern')),
    name        TEXT NOT NULL DEFAULT '',       -- vorausgefüllter Name
    player_ids  TEXT NOT NULL DEFAULT '[]',
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_by     INTEGER,
    used_at     INTEGER
);

CREATE TABLE IF NOT EXISTS app_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    version     INTEGER NOT NULL,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_by  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_history (
    version     INTEGER PRIMARY KEY,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_by  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    username  TEXT NOT NULL,
    ok        INTEGER NOT NULL,
    ip        TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_log_ts ON login_log(ts);
"""


def connect() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db() -> None:
    con = connect()
    with con:
        con.executescript(SCHEMA)
    con.close()


def now() -> int:
    return int(time.time())


# ---------- App-Datenbestand (versioniertes JSON) ----------

HISTORY_KEEP = 30


def get_state(con: sqlite3.Connection):
    row = con.execute("SELECT * FROM app_state WHERE id = 1").fetchone()
    return row


def put_state(con: sqlite3.Connection, expected_version: int, data: str, updated_by: str):
    """Speichert den Datenbestand mit optimistischem Sperren.

    Rückgabe: (neue_version, None) bei Erfolg, (None, aktuelle_zeile) bei Konflikt.
    """
    with con:
        row = con.execute("SELECT version, updated_at, updated_by FROM app_state WHERE id = 1").fetchone()
        current = row["version"] if row else 0
        if current != expected_version:
            return None, row
        new_version = current + 1
        ts = now()
        if row is None:
            con.execute(
                "INSERT INTO app_state (id, version, data, updated_at, updated_by) VALUES (1, ?, ?, ?, ?)",
                (new_version, data, ts, updated_by),
            )
        else:
            con.execute(
                "UPDATE app_state SET version = ?, data = ?, updated_at = ?, updated_by = ? WHERE id = 1",
                (new_version, data, ts, updated_by),
            )
        con.execute(
            "INSERT INTO state_history (version, data, updated_at, updated_by) VALUES (?, ?, ?, ?)",
            (new_version, data, ts, updated_by),
        )
        con.execute(
            "DELETE FROM state_history WHERE version <= ?", (new_version - HISTORY_KEEP,)
        )
    return new_version, None


def list_history(con: sqlite3.Connection):
    return con.execute(
        "SELECT version, updated_at, updated_by, length(data) AS size FROM state_history ORDER BY version DESC"
    ).fetchall()


def get_history_version(con: sqlite3.Connection, version: int):
    return con.execute("SELECT * FROM state_history WHERE version = ?", (version,)).fetchone()


def to_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
