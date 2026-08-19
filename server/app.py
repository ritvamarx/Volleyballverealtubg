"""SKV Müritz Volleyball – Flask-Backend (Phase 1).

Aufgaben: Anmeldung mit Rollen (Trainer verpflichtend mit TOTP-2FA),
zentraler versionierter Datenbestand für Trainer, Einladungscodes,
statische Auslieferung der App. Läuft als Gunicorn-Prozess
(1 Worker / 8 Threads) im Docker-Container – wie die übrigen
nettverwaltet-Dienste.
"""
from __future__ import annotations

import json
import os
import time

from flask import Flask, g, jsonify, request, send_from_directory

import auth
import db

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SESSION_COOKIE = "skv_session"
SESSION_DAYS = 30
PRE2FA_MINUTES = 15
STATE_MAX_BYTES = 15 * 1024 * 1024
LOGIN_MAX_FAILS = 8
LOGIN_WINDOW_S = 15 * 60
INVITE_DAYS = 14


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = STATE_MAX_BYTES + 1024 * 1024
    db.init_db()

    # ---------- Hilfen ----------

    def con():
        if "db" not in g:
            g.db = db.connect()
        return g.db

    @app.teardown_appcontext
    def _close(_exc):
        d = g.pop("db", None)
        if d is not None:
            d.close()

    def client_ip() -> str:
        fwd = request.headers.get("X-Forwarded-For", "")
        return (fwd.split(",")[0].strip() if fwd else request.remote_addr) or "?"

    def is_secure_request() -> bool:
        return request.headers.get("X-Forwarded-Proto", request.scheme) == "https"

    def current_session():
        token = request.cookies.get(SESSION_COOKIE)
        if not token:
            return None, None
        row = con().execute(
            "SELECT s.*, u.username, u.name, u.role, u.totp_enabled, u.active"
            " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (auth.hash_token(token),),
        ).fetchone()
        if row is None or row["expires_at"] < db.now() or not row["active"]:
            return None, None
        con().execute(
            "UPDATE sessions SET last_seen = ? WHERE token_hash = ?",
            (db.now(), row["token_hash"]),
        )
        con().commit()
        return row, token

    def start_session(resp, user_id: int, pre_2fa: bool):
        token = auth.new_session_token()
        lifetime = PRE2FA_MINUTES * 60 if pre_2fa else SESSION_DAYS * 86400
        con().execute(
            "INSERT INTO sessions (token_hash, user_id, csrf, pre_2fa, created_at, last_seen,"
            " expires_at, ip, ua) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                auth.hash_token(token), user_id, auth.new_csrf(), 1 if pre_2fa else 0,
                db.now(), db.now(), db.now() + lifetime,
                client_ip(), (request.headers.get("User-Agent") or "")[:200],
            ),
        )
        con().commit()
        resp.set_cookie(
            SESSION_COOKIE, token, max_age=lifetime, httponly=True,
            secure=is_secure_request(), samesite="Lax", path="/",
        )
        return token

    def drop_session(resp, token: str | None):
        if token:
            con().execute("DELETE FROM sessions WHERE token_hash = ?", (auth.hash_token(token),))
            con().commit()
        resp.delete_cookie(SESSION_COOKIE, path="/")

    def upgrade_session(sess_row):
        """Pre-2FA-Sitzung nach erfolgreicher TOTP-Prüfung zur Voll-Sitzung machen."""
        con().execute(
            "UPDATE sessions SET pre_2fa = 0, expires_at = ? WHERE token_hash = ?",
            (db.now() + SESSION_DAYS * 86400, sess_row["token_hash"]),
        )
        con().commit()

    def err(status: int, message: str, **extra):
        payload = {"error": message}
        payload.update(extra)
        return jsonify(payload), status

    def require(role: str | None = None, csrf: bool = True):
        """Gemeinsame Zugriffs-Prüfung. Gibt (session, fehler_response) zurück."""
        sess, _token = current_session()
        if sess is None:
            return None, err(401, "Nicht angemeldet")
        if sess["pre_2fa"]:
            return None, err(401, "Zwei-Faktor-Bestätigung ausstehend", need="totp")
        if role and sess["role"] != role:
            return None, err(403, "Keine Berechtigung")
        if csrf and request.method in ("POST", "PUT", "DELETE"):
            sent = request.headers.get("X-CSRF-Token", "")
            if not sent or not auth.hmac_compare(sent, sess["csrf"]):
                return None, err(403, "Ungültiges Sicherheits-Token (Seite neu laden)")
        return sess, None

    def rate_limited(username: str) -> int:
        """Sekunden Restsperre bei zu vielen Fehlversuchen (User oder IP), sonst 0."""
        cutoff = db.now() - LOGIN_WINDOW_S
        row = con().execute(
            "SELECT COUNT(*) AS n, MAX(ts) AS last FROM login_log"
            " WHERE ts > ? AND ok = 0 AND (username = ? OR ip = ?)",
            (cutoff, username.lower(), client_ip()),
        ).fetchone()
        if row["n"] >= LOGIN_MAX_FAILS:
            return max(1, (row["last"] + LOGIN_WINDOW_S) - db.now())
        return 0

    def log_login(username: str, ok: bool):
        con().execute(
            "INSERT INTO login_log (ts, username, ok, ip) VALUES (?,?,?,?)",
            (db.now(), username.lower(), 1 if ok else 0, client_ip()),
        )
        con().execute("DELETE FROM login_log WHERE ts < ?", (db.now() - 7 * 86400,))
        con().commit()

    # ---------- API: Sitzung ----------

    @app.post("/api/login")
    def api_login():
        body = request.get_json(silent=True) or {}
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        if not username or not password:
            return err(400, "Benutzername und Passwort angeben")
        wait = rate_limited(username)
        if wait:
            return err(429, f"Zu viele Fehlversuche – bitte {wait // 60 + 1} Min. warten")
        user = con().execute(
            "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
        ).fetchone()
        if user is None or not auth.verify_password(password, user["pw_hash"]):
            log_login(username, False)
            return err(401, "Benutzername oder Passwort falsch")
        log_login(username, True)

        resp = jsonify({})
        if user["role"] == "trainer":
            # Trainer: 2FA verpflichtend – erst Pre-Session
            start_session(resp, user["id"], pre_2fa=True)
            need = "totp" if user["totp_enabled"] else "totp-setup"
            resp.set_data(db.to_json({"need": need, "user": public_user(user)}))
            return resp
        start_session(resp, user["id"], pre_2fa=False)
        resp.set_data(db.to_json({"need": None, "user": public_user(user)}))
        return resp

    def public_user(u):
        return {"username": u["username"], "name": u["name"], "role": u["role"]}

    @app.get("/api/2fa/setup")
    def api_2fa_setup():
        sess, _ = current_session()
        if sess is None or not sess["pre_2fa"]:
            return err(401, "Kein 2FA-Einrichtungsschritt aktiv")
        user = con().execute("SELECT * FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        if user["totp_enabled"]:
            return err(400, "2FA ist bereits eingerichtet")
        secret = user["totp_secret"] or auth.new_totp_secret()
        con().execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user["id"]))
        con().commit()
        return jsonify({
            "secret": secret,
            "otpauth": auth.otpauth_url(secret, user["username"]),
        })

    @app.post("/api/2fa/enable")
    def api_2fa_enable():
        sess, _ = current_session()
        if sess is None or not sess["pre_2fa"]:
            return err(401, "Kein 2FA-Einrichtungsschritt aktiv")
        body = request.get_json(silent=True) or {}
        user = con().execute("SELECT * FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        if not user["totp_secret"] or not auth.verify_totp(user["totp_secret"], body.get("code", "")):
            return err(401, "Code falsch – bitte den aktuellen Code aus der App eingeben")
        codes = auth.new_backup_codes()
        con().execute(
            "UPDATE users SET totp_enabled = 1, backup_codes = ? WHERE id = ?",
            (db.to_json([auth.hash_code(c) for c in codes]), user["id"]),
        )
        con().commit()
        upgrade_session(sess)
        return jsonify({"ok": True, "backupCodes": codes, "user": public_user(user)})

    @app.post("/api/login/totp")
    def api_login_totp():
        sess, _ = current_session()
        if sess is None or not sess["pre_2fa"]:
            return err(401, "Bitte zuerst mit Passwort anmelden")
        body = request.get_json(silent=True) or {}
        code = (body.get("code") or "").strip()
        user = con().execute("SELECT * FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        ok = False
        if user["totp_secret"] and auth.verify_totp(user["totp_secret"], code):
            ok = True
        else:  # Backup-Code?
            hashed = auth.hash_code(code)
            stored = json.loads(user["backup_codes"] or "[]")
            if hashed in stored:
                stored.remove(hashed)
                con().execute(
                    "UPDATE users SET backup_codes = ? WHERE id = ?",
                    (db.to_json(stored), user["id"]),
                )
                con().commit()
                ok = True
        if not ok:
            log_login(user["username"], False)
            return err(401, "Code falsch")
        upgrade_session(sess)
        return jsonify({"ok": True, "user": public_user(user)})

    @app.post("/api/logout")
    def api_logout():
        _sess, token = current_session()
        resp = jsonify({"ok": True})
        drop_session(resp, token)
        return resp

    @app.get("/api/me")
    def api_me():
        sess, _ = current_session()
        if sess is None:
            return err(401, "Nicht angemeldet")
        return jsonify({
            "user": {"username": sess["username"], "name": sess["name"], "role": sess["role"]},
            "pre2fa": bool(sess["pre_2fa"]),
            "csrf": sess["csrf"],
        })

    # ---------- API: Registrierung per Einladungscode ----------

    @app.post("/api/register")
    def api_register():
        body = request.get_json(silent=True) or {}
        code = (body.get("code") or "").strip()
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        name = (body.get("name") or "").strip()
        if not code or not username or len(password) < 8:
            return err(400, "Code, Benutzername und Passwort (mind. 8 Zeichen) angeben")
        if len(username) < 3 or len(username) > 40:
            return err(400, "Benutzername: 3–40 Zeichen")
        wait = rate_limited("register:" + client_ip())
        if wait:
            return err(429, "Zu viele Versuche – bitte kurz warten")
        inv = con().execute(
            "SELECT * FROM invites WHERE code_hash = ?", (auth.hash_code(code),)
        ).fetchone()
        if inv is None or inv["used_by"] is not None or inv["expires_at"] < db.now():
            log_login("register:" + client_ip(), False)
            return err(400, "Einladungscode ungültig oder abgelaufen")
        exists = con().execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if exists:
            return err(400, "Benutzername ist bereits vergeben")
        with con() as c:
            cur = c.execute(
                "INSERT INTO users (username, name, role, pw_hash, player_ids, created_at)"
                " VALUES (?,?,?,?,?,?)",
                (
                    username, name or inv["name"] or username, inv["role"],
                    auth.hash_password(password), inv["player_ids"], db.now(),
                ),
            )
            c.execute(
                "UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?",
                (cur.lastrowid, db.now(), inv["id"]),
            )
        return jsonify({"ok": True, "role": inv["role"],
                        "hint": "Jetzt anmelden" + (" – 2FA wird eingerichtet" if inv["role"] == "trainer" else "")})

    # ---------- API: Einladungen (nur Trainer) ----------

    @app.get("/api/invites")
    def api_invites_list():
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        rows = con().execute(
            "SELECT id, role, name, created_by, created_at, expires_at, used_by, used_at"
            " FROM invites ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
        return jsonify({"invites": [dict(r) for r in rows]})

    @app.post("/api/invites")
    def api_invites_create():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        role = body.get("role") or "eltern"
        if role not in ("trainer", "spieler", "eltern"):
            return err(400, "Unbekannte Rolle")
        name = (body.get("name") or "").strip()
        player_ids = body.get("playerIds") or []
        if not isinstance(player_ids, list):
            return err(400, "playerIds muss eine Liste sein")
        code = auth.new_code()
        con().execute(
            "INSERT INTO invites (code_hash, role, name, player_ids, created_by, created_at, expires_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (
                auth.hash_code(code), role, name, db.to_json(player_ids),
                sess["username"], db.now(), db.now() + INVITE_DAYS * 86400,
            ),
        )
        con().commit()
        base = request.headers.get("X-Forwarded-Host") or request.host
        proto = "https" if is_secure_request() else "http"
        url = f"{proto}://{base}/?code={code}"
        return jsonify({"code": code, "url": url, "expiresDays": INVITE_DAYS})

    @app.delete("/api/invites/<int:invite_id>")
    def api_invites_delete(invite_id: int):
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        con().execute("DELETE FROM invites WHERE id = ? AND used_by IS NULL", (invite_id,))
        con().commit()
        return jsonify({"ok": True})

    # ---------- API: Datenbestand (nur Trainer) ----------

    @app.get("/api/state")
    def api_state_get():
        _sess, failure = require(role="trainer", csrf=False)
        if failure:
            return failure
        row = db.get_state(con())
        if row is None:
            return jsonify({"version": 0, "state": None, "updatedAt": None, "updatedBy": None})
        return app.response_class(
            '{"version":%d,"updatedAt":%d,"updatedBy":%s,"state":%s}'
            % (row["version"], row["updated_at"], db.to_json(row["updated_by"]), row["data"]),
            mimetype="application/json",
        )

    @app.put("/api/state")
    def api_state_put():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True)
        if not body or "state" not in body or "version" not in body:
            return err(400, "version und state erforderlich")
        data = db.to_json(body["state"])
        if len(data.encode()) > STATE_MAX_BYTES:
            return err(413, "Datenbestand zu groß (max. 15 MB)")
        new_version, conflict = db.put_state(con(), int(body["version"]), data, sess["name"])
        if new_version is None:
            return err(
                409, "Konflikt: Es gibt einen neueren Stand",
                currentVersion=conflict["version"] if conflict else 0,
                updatedBy=conflict["updated_by"] if conflict else None,
                updatedAt=conflict["updated_at"] if conflict else None,
            )
        return jsonify({"ok": True, "version": new_version})

    @app.get("/api/state/history")
    def api_state_history():
        _sess, failure = require(role="trainer", csrf=False)
        if failure:
            return failure
        rows = db.list_history(con())
        return jsonify({"history": [dict(r) for r in rows]})

    @app.post("/api/state/restore")
    def api_state_restore():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        row = db.get_history_version(con(), int(body.get("version", 0)))
        if row is None:
            return err(404, "Version nicht gefunden")
        current = db.get_state(con())
        new_version, _ = db.put_state(
            con(), current["version"] if current else 0, row["data"],
            f"{sess['name']} (Wiederherstellung v{row['version']})",
        )
        return jsonify({"ok": True, "version": new_version})

    # ---------- Statische App ----------

    SECURITY_HEADERS = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy": (
            "default-src 'self'; script-src 'self' 'unsafe-inline';"
            " style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
            " connect-src 'self' https://openholidaysapi.org https://ferien-api.de;"
            " frame-ancestors 'none'"
        ),
    }

    @app.after_request
    def _headers(resp):
        for key, value in SECURITY_HEADERS.items():
            resp.headers.setdefault(key, value)
        if is_secure_request():
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/")
    def index():
        return send_from_directory(APP_ROOT, "index.html")

    @app.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(os.path.join(APP_ROOT, "assets"), filename)

    @app.get("/gesund")
    def health():
        con().execute("SELECT 1")
        return jsonify({"ok": True, "ts": db.now()})

    return app


if __name__ == "__main__":  # lokaler Testlauf
    create_app().run(host="127.0.0.1", port=8000, debug=False)
