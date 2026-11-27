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
import re
import time
import urllib.parse
import urllib.request

from flask import Flask, g, jsonify, request, send_from_directory

import auth
import db
import mail

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SESSION_COOKIE = "skv_session"
SESSION_DAYS = 30            # Trainer (mit 2FA)
SESSION_DAYS_PORTAL = 180    # Spieler:innen und Eltern – seltener neu anmelden
RESET_MAIL_MINUTES = 60      # Gültigkeit des Passwort-Links per E-Mail
PRE2FA_MINUTES = 15
STATE_MAX_BYTES = 15 * 1024 * 1024
LOGIN_MAX_FAILS = 8
LOGIN_WINDOW_S = 15 * 60
INVITE_DAYS = 14


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "")
    import dokumente as _dok
    app.config["MAX_CONTENT_LENGTH"] = max(STATE_MAX_BYTES, _dok.DOK_MAX_BYTES) + 1024 * 1024
    db.init_db()
    try:
        _c = db.connect()
        db.emails_aus_spielerdaten(_c)  # Adressen aus den Spielerdaten übernehmen
        _c.close()
    except Exception:  # noqa: BLE001 – darf den Start nie verhindern
        pass

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

    # Content-Hub (Stufe 3): Feed + Inbox, nur mit CONTENT_FEED_TOKEN aktiv (siehe server/content_feed.py)
    import content_feed
    try:
        import push as _push
    except Exception:  # pragma: no cover – ohne pywebpush läuft die Inbox ohne Push
        _push = None
    content_feed.register(app, con, db, _push)

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
            "SELECT s.*, u.username, u.name, u.role, u.totp_enabled, u.active, u.player_ids"
            " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (auth.hash_token(token),),
        ).fetchone()
        if row is None or row["expires_at"] < db.now() or not row["active"]:
            return None, None
        con().execute(
            "UPDATE sessions SET last_seen = ? WHERE token_hash = ?",
            (db.now(), row["token_hash"]),
        )
        # „Zuletzt aktiv" je Konto – Grundlage der Nutzungs-Auswertung
        if not row["pre_2fa"]:
            con().execute("UPDATE users SET last_login = ? WHERE id = ?",
                          (db.now(), row["user_id"]))
        con().commit()
        return row, token

    def start_session(resp, user_id: int, pre_2fa: bool, tage: int = SESSION_DAYS):
        token = auth.new_session_token()
        lifetime = PRE2FA_MINUTES * 60 if pre_2fa else tage * 86400
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

    # Dokumentenablage mit Freigabe – siehe server/dokumente.py
    _dok.register(app, con, require, err, _push)

    # Passkeys (Face ID / Fingerabdruck) – siehe server/passkeys.py
    import passkeys
    passkeys.register(app, con, require, start_session, err, rate_limited, log_login,
                      lambda rolle: SESSION_DAYS if rolle == "trainer" else SESSION_DAYS_PORTAL)

    # ---------- API: Sitzung ----------

    @app.post("/api/login")
    def api_login():
        body = request.get_json(silent=True) or {}
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        if not username or not password:
            return err(400, "E-Mail-Adresse oder Benutzername und Passwort angeben")
        wait = rate_limited(username)
        if wait:
            return err(429, f"Zu viele Fehlversuche – bitte {wait // 60 + 1} Min. warten")
        user = konto_finden(username)
        if user is None or not auth.verify_password(password, user["pw_hash"]):
            log_login(username, False)
            return err(401, "Anmeldedaten falsch – E-Mail-Adresse oder Benutzername und Passwort prüfen")
        log_login(username, True)

        resp = jsonify({})
        if user["role"] == "trainer":
            # Trainer: 2FA verpflichtend – erst Pre-Session
            start_session(resp, user["id"], pre_2fa=True)
            need = "totp" if user["totp_enabled"] else "totp-setup"
            resp.set_data(db.to_json({"need": need, "user": public_user(user)}))
            return resp
        start_session(resp, user["id"], pre_2fa=False, tage=SESSION_DAYS_PORTAL)
        resp.set_data(db.to_json({"need": None, "user": public_user(user)}))
        return resp

    def konto_finden(kennung: str):
        """Aktives Konto zu Benutzername oder E-Mail-Adresse (Groß-/Kleinschreibung egal)."""
        kennung = (kennung or "").strip()
        if not kennung:
            return None
        user = con().execute("SELECT * FROM users WHERE username = ? AND active = 1",
                             (kennung,)).fetchone()
        if user is None and "@" in kennung:
            suche = lambda: con().execute(  # noqa: E731
                "SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1",
                (kennung,)).fetchone()
            user = suche()
            if user is None and db.emails_aus_spielerdaten(con()):
                user = suche()  # Adresse erst kürzlich in den Spielerdaten eingetragen
        return user

    def basis_url() -> str:
        """Öffentliche Adresse für Links in E-Mails – nie aus einem fremden Host-Header."""
        fest = os.environ.get("APP_URL", "").strip().rstrip("/")
        if fest:
            return fest
        host = (request.host or "").lower()
        if re.fullmatch(r"[a-z0-9.-]+\.nettverwaltet\.de", host):
            return "https://" + host
        if re.fullmatch(r"(127\.0\.0\.1|localhost)(:\d+)?", host):
            return "http://" + host
        return "https://volleyball.nettverwaltet.de"

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
        email_roh = (body.get("email") or "").strip()
        email = db.email_normal(email_roh)
        if email_roh and not email:
            return err(400, "Die E-Mail-Adresse sieht nicht gültig aus")
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
        if email and con().execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            return err(400, "Diese E-Mail-Adresse gehört schon zu einem anderen Konto")
        with con() as c:
            cur = c.execute(
                "INSERT INTO users (username, name, role, pw_hash, player_ids, created_at, email)"
                " VALUES (?,?,?,?,?,?,?)",
                (
                    username, name or inv["name"] or username, inv["role"],
                    auth.hash_password(password), inv["player_ids"], db.now(), email or None,
                ),
            )
            c.execute(
                "UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?",
                (cur.lastrowid, db.now(), inv["id"]),
            )
        if not email:
            db.emails_aus_spielerdaten(con())
        return jsonify({"ok": True, "role": inv["role"],
                        "hint": "Jetzt anmelden" + (" – 2FA wird eingerichtet" if inv["role"] == "trainer" else "")})

    # ---------- API: Termin-Absage (nur Trainer) ----------

    @app.post("/api/termin-absage")
    def api_termin_absage():
        """Push-Mitteilung an alle Konten, deren Spieler:innen sich zum
        abgesagten Termin bereits zurückgemeldet haben."""
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        event_id = str(body.get("eventId") or "")
        if not event_id:
            return err(400, "eventId fehlt")
        titel = str(body.get("titel") or "Termin")[:80]
        notiz = str(body.get("notiz") or "")[:160]
        wann = ""
        z = db.parse_iso(body.get("start"))
        if z is not None:
            from zoneinfo import ZoneInfo
            wann = z.astimezone(ZoneInfo("Europe/Berlin")).strftime(" am %d.%m. um %H:%M Uhr")
        row = db.get_state(con())
        try:
            daten = json.loads(row["data"]) if row else {}
        except (ValueError, TypeError):
            daten = {}
        betroffen = {r.get("playerId") for r in daten.get("responses", [])
                     if r.get("eventId") == event_id}
        if not betroffen:
            return jsonify({"ok": True, "benachrichtigt": 0})
        empfaenger = []
        for r in con().execute(
                "SELECT id, player_ids FROM users WHERE active = 1 AND role IN ('spieler', 'eltern')").fetchall():
            try:
                eigene = set(json.loads(r["player_ids"] or "[]"))
            except Exception:
                eigene = set()
            if eigene & betroffen:
                empfaenger.append(r["id"])
        import push
        ergebnis = push.senden(
            con(), "🚫 Abgesagt: " + titel,
            f"{titel}{wann} fällt aus." + (f" Grund: {notiz}" if notiz else ""),
            "/", empfaenger, kategorie="teilnahme")
        return jsonify({"ok": True, "benachrichtigt": ergebnis["ok"]})

    # ---------- API: Einladungen (nur Trainer) ----------

    @app.get("/api/invites")
    def api_invites_list():
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        rows = con().execute(
            "SELECT id, role, name, player_ids, created_by, created_at, expires_at, used_by, used_at"
            " FROM invites ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
        codes = []
        for r in rows:
            d = dict(r)
            try:
                d["player_ids"] = json.loads(d["player_ids"] or "[]")
            except Exception:
                d["player_ids"] = []
            codes.append(d)
        return jsonify({"invites": codes})

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
        body = ('{"version":%d,"updatedAt":%d,"updatedBy":%s,"state":%s}'
                % (row["version"], row["updated_at"], db.to_json(row["updated_by"]), row["data"]))
        # ETag aus Version + Zeitstempel: unverändert → 304 ohne den großen Datenbestand (Teil B4)
        etag = '"st-%d-%d"' % (row["version"], row["updated_at"])
        wenn = [t.strip() for t in (request.headers.get("If-None-Match") or "").split(",") if t.strip()]
        resp = app.response_class(status=304) if etag in wenn else app.response_class(body, mimetype="application/json")
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "private, no-cache"
        resp.headers["Vary"] = "Cookie"
        return resp

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
        # Für den Push-Trigger: bisherige Ankündigungs-IDs merken (nur das
        # announcements-Feld wird verglichen, nicht der ganze Bestand).
        alte_ank_ids = set()
        alt = db.get_state(con())
        if alt is not None:
            try:
                alte_ank_ids = {a.get("id") for a in json.loads(alt["data"]).get("announcements", [])}
            except Exception:
                pass
        new_version, conflict = db.put_state(con(), int(body["version"]), data, sess["name"])
        if new_version is None:
            return err(
                409, "Konflikt: Es gibt einen neueren Stand",
                currentVersion=conflict["version"] if conflict else 0,
                updatedBy=conflict["updated_by"] if conflict else None,
                updatedAt=conflict["updated_at"] if conflict else None,
            )
        # Neue Ankündigungen als Push-Mitteilung an die passenden Konten
        try:
            neue_ank = [a for a in (body["state"].get("announcements") or [])
                        if isinstance(a, dict) and a.get("id") not in alte_ank_ids]
            for a in neue_ank[:5]:
                rollen = {"alle": ("trainer", "spieler", "eltern"), "oeffentlich": ("trainer", "spieler", "eltern"),
                          "eltern": ("eltern",), "spieler": ("spieler",)}.get(a.get("audience"), ())
                if not rollen:
                    continue
                platzhalter = ",".join("?" * len(rollen))
                ids = [r["id"] for r in con().execute(
                    f"SELECT id FROM users WHERE active = 1 AND role IN ({platzhalter})", list(rollen))]
                if ids:
                    import push
                    push.senden(con(), "📣 " + str(a.get("title") or "Ankündigung")[:80],
                                str(a.get("body") or "")[:180], "/", ids, kategorie="allgemein")
        except Exception:
            pass  # Push darf das Speichern nie scheitern lassen
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

    # ---------- API: Spieler-/Eltern-Portal (Phase 3) ----------
    # Grundsatz: Die Filterung passiert HIER auf dem Server. Eltern-Konten
    # erhalten keine Namen fremder Kinder – Rückmeldungen nur als Zähler,
    # Fahrerplanung nur das eigene Angebot, Jobs ohne fremden Personenbezug.

    import secrets as _secrets

    def require_portal():
        sess, failure = require()
        if failure:
            return None, failure
        if sess["role"] not in ("spieler", "eltern"):
            return None, err(403, "Nur für Spieler:innen- und Eltern-Konten")
        return sess, None

    def lade_state():
        row = db.get_state(con())
        if row is None:
            return 0, {}
        try:
            return row["version"], json.loads(row["data"])
        except Exception:
            return row["version"], {}

    def speichere_portal_aenderung(mutation, autor: str):
        """Kleine Portal-Änderung am zentralen Datenbestand (mit Konflikt-Retry)."""
        return db.mutate_state(con(), mutation, autor)

    def sess_player_ids(sess) -> set:
        try:
            ids = json.loads(sess["player_ids"] or "[]")
        except Exception:
            ids = []
        return {i for i in ids if isinstance(i, str)}

    def eigene_spieler(sess, daten) -> list:
        ids = sess_player_ids(sess)
        return [p for p in daten.get("players", []) if p.get("id") in ids]

    def neue_id(prefix: str) -> str:
        return prefix + _secrets.token_hex(5)

    def iso_jetzt() -> str:
        # UTC mit 'Z' – gleiches Format wie das clientseitige new Date().toISOString(),
        # damit Portal- und Trainer-Zeitstempel (responses.at usw.) vergleichbar bleiben
        import datetime as _dt
        return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def portal_antwort(payload: dict):
        """JSON mit ETag: schickt der Client denselben Stand (If-None-Match), kommt 304
        ohne Inhalt. „private, no-cache" = Browser darf speichern, muss aber nachfragen."""
        import hashlib as _hashlib
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        etag = '"' + _hashlib.sha1(body.encode("utf-8")).hexdigest()[:24] + '"'
        wenn = [t.strip() for t in (request.headers.get("If-None-Match") or "").split(",") if t.strip()]
        if etag in wenn or "*" in wenn:
            resp = app.response_class(status=304)
        else:
            resp = app.response_class(body, mimetype="application/json")
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "private, no-cache"
        resp.headers["Vary"] = "Cookie"
        return resp

    def data_url_antwort(data_url: str):
        """Base64-Data-URL als echtes Bild ausliefern – unveränderlich je Versions-Hash."""
        import base64 as _b64
        import hashlib as _hashlib
        m = re.match(r"^data:(image/[a-z+.-]+);base64,(.*)$", str(data_url or ""), re.S)
        if not m:
            return err(404, "Kein Bild")
        try:
            roh = _b64.b64decode(m.group(2), validate=False)
        except Exception:  # noqa: BLE001
            return err(404, "Kein Bild")
        etag = '"' + _hashlib.sha1(roh).hexdigest()[:24] + '"'
        wenn = [t.strip() for t in (request.headers.get("If-None-Match") or "").split(",") if t.strip()]
        if etag in wenn:
            resp = app.response_class(status=304)
        else:
            resp = app.response_class(roh, mimetype=m.group(1))
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "private, max-age=31536000, immutable"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    @app.get("/api/portal/foto/<pid>")
    def api_portal_foto(pid):
        sess, failure = require_portal()
        if failure:
            return failure
        _v, daten = lade_state()
        meine_ids = {p["id"] for p in eigene_spieler(sess, daten)}
        p = next((x for x in daten.get("players", []) if isinstance(x, dict) and x.get("id") == pid), None)
        # Fremde Fotos nur unter Spieler:innen und nur mit Foto-Einwilligung – Eltern nie
        # (Zugriff zuerst prüfen, damit Fremde nicht einmal erfahren, ob ein Foto existiert)
        if pid not in meine_ids and not (sess["role"] == "spieler" and p and p.get("membershipStatus") != "inaktiv"
                                         and _einw.foto_erlaubt(daten, pid)):
            return err(403, "Kein Zugriff")
        if not p or not p.get("foto"):
            return err(404, "Kein Foto")
        return data_url_antwort(p.get("foto"))

    @app.get("/api/portal/bild/<oid>")
    def api_portal_bild(oid):
        sess, failure = require_portal()
        if failure:
            return failure
        _v, daten = lade_state()
        c = next((x for x in daten.get("clothing", []) if isinstance(x, dict) and x.get("id") == oid), None)
        if not c or not c.get("bild"):
            return err(404, "Kein Bild")
        return data_url_antwort(c.get("bild"))

    @app.get("/api/portal")
    def api_portal():
        sess, failure = require_portal()
        if failure:
            return failure
        _v, daten = lade_state()
        rolle = sess["role"]
        meine = eigene_spieler(sess, daten)
        meine_ids = {p["id"] for p in meine}
        heute = time.strftime("%Y-%m-%d")

        def kommend(evs, n=30):
            return sorted(
                [e for e in evs if str(e.get("start", ""))[:10] >= heute],
                key=lambda e: str(e.get("start", "")),
            )[:n]

        events = daten.get("events", [])
        antworten = daten.get("responses", [])
        # Antworten einmal nach eventId gruppieren – sonst scannt jeder Termin
        # die komplette responses-Liste (quadratisch bei vielen Terminen/Antworten)
        antworten_je_event = {}
        for r in antworten:
            antworten_je_event.setdefault(r.get("eventId"), []).append(r)

        def termin_wetter(e):
            """Vorhersage fürs Termin-Datum, wenn es höchstens 7 Tage entfernt ist."""
            import datetime as _dt
            datum = str(e.get("start") or "")[:10]
            try:
                tage = (_dt.date.fromisoformat(datum) - _dt.date.today()).days
            except ValueError:
                return None
            if not 0 <= tage <= 7:
                return None
            import wetter
            return wetter.fuer_termin(e.get("location") or "", datum)

        def rsvp_info(eid):
            zu = {"yes": 0, "no": 0, "maybe": 0}
            mein = {}
            gruende = {}
            for r in antworten_je_event.get(eid, []):
                st = r.get("status")
                if st in zu:
                    zu[st] += 1
                if r.get("playerId") in meine_ids:
                    mein[r.get("playerId")] = st
                    if r.get("grund"):
                        gruende[r.get("playerId")] = r.get("grund")
            return zu, mein, gruende

        def dabei_ids(eid):
            """Zugesagte Spieler:innen – nur für die Spieler:innen-Rolle sichtbar,
            ohne Gründe oder Bemerkungen (Eltern sehen nur das eigene Kind)."""
            if rolle != "spieler":
                return None
            return [r.get("playerId") for r in antworten_je_event.get(eid, [])
                    if r.get("status") == "yes"]

        def training_obj(e):
            zu, mein, gruende = rsvp_info(e.get("id"))
            return {"id": e.get("id"), "start": e.get("start"), "end": e.get("end"),
                    "location": e.get("location") or "", "title": e.get("title") or "Training",
                    "zusagen": zu, "meine": mein, "gruende": gruende, "wetter": termin_wetter(e),
                    "dabeiIds": dabei_ids(e.get("id")),
                    "abgesagt": ({"notiz": (e.get("abgesagt") or {}).get("notiz") or ""}
                                 if e.get("abgesagt") else None)}

        buffet_liste = daten.get("buffet", [])
        fahrer_liste = daten.get("drivers", [])

        def spiel_obj(e):
            o = {k: (e.get(k) or "") for k in ("id", "type", "title", "start", "end", "location", "opponent")}
            o["zusagen"], o["meine"], o["gruende"] = rsvp_info(e.get("id"))
            o["wetter"] = termin_wetter(e)
            o["dabeiIds"] = dabei_ids(e.get("id"))
            o["abgesagt"] = ({"notiz": (e.get("abgesagt") or {}).get("notiz") or ""}
                             if e.get("abgesagt") else None)
            if e.get("type") == "home":
                eintraege = [b for b in buffet_liste if b.get("eventId") == e.get("id")]
                mein = next((b for b in eintraege if b.get("userId") == sess["user_id"]), None)
                o["meinBuffet"] = (mein or {}).get("beitrag") or ""
                o["buffetAnzahl"] = len(eintraege)
            if e.get("type") == "away":
                angebote = [d for d in fahrer_liste if d.get("eventId") == e.get("id")]
                mein = next((d for d in angebote if d.get("userId") == sess["user_id"]), None)
                o["meinePlaetze"] = int((mein or {}).get("seats") or 0)
                o["plaetzeGesamt"] = sum(int(d.get("seats") or 0) for d in angebote)
            return o

        fahrer, jobs = [], []
        if rolle == "eltern":
            for d in daten.get("drivers", []):
                if d.get("userId") == sess["user_id"]:
                    fahrer.append({"eventId": d.get("eventId"), "seats": d.get("seats") or 0,
                                   "phone": d.get("phone") or ""})
            alle_jobs = [j for j in daten.get("jobs", []) if not j.get("done")]
            meine_events = {j.get("eventId") for j in alle_jobs if j.get("userId") == sess["user_id"]}
            for j in alle_jobs:
                offen = not str(j.get("assignee") or "").strip()
                meiner = j.get("userId") == sess["user_id"]
                if offen or meiner:
                    jobs.append({"id": j.get("id"), "eventId": j.get("eventId"),
                                 "category": j.get("category") or "other",
                                 "title": j.get("title") or "", "meiner": meiner,
                                 "dauerMin": int(j.get("dauerMin") or 0) or None})
            # Wer hilft noch mit? Nur sichtbar für Eltern, die beim selben Termin selbst einen Job haben
            # (zum Vernetzen untereinander) – Namen und Aufgabe, keine Kontaktdaten.
            helfer = {}
            for j in alle_jobs:
                eid = j.get("eventId")
                if eid in meine_events and str(j.get("assignee") or "").strip() and j.get("userId") != sess["user_id"]:
                    helfer.setdefault(eid, []).append({"name": str(j.get("assignee")).strip()[:60],
                                                       "job": j.get("title") or ""})

        # Eltern-Abzeichen: übernommene Heimspiel-Jobs und Fahrten der laufenden Saison.
        # Zählt erst, wenn der Termin vorbei ist (also wirklich geholfen wurde).
        ELTERN_STUFEN = {
            "jobs": [(1, "🤝", "Erste Hilfe", "Ersten Heimspiel-Job übernommen"),
                     (3, "🥉", "Helferherz Bronze", "3 Heimspiel-Jobs gestemmt"),
                     (6, "🥈", "Helferherz Silber", "6 Heimspiel-Jobs gestemmt"),
                     (10, "🥇", "Helferherz Gold", "10 Heimspiel-Jobs – das Rückgrat jedes Heimspiels")],
            "fahrten": [(1, "🚗", "Mitfahr-Taxi", "Erste Fahrt zu einem Auswärtsspiel angeboten"),
                        (3, "🚐", "Tour-Guide", "3 Auswärtsfahrten angeboten"),
                        (6, "🚌", "Reiseleitung", "6 Auswärtsfahrten – ohne dich kein Auswärtssieg")],
            "gesamt": [(5, "⭐", "Vereinsstütze", "5 Einsätze für das Team"),
                       (12, "🏆", "MVP der Eltern", "12 Einsätze – Most Valuable Parent")],
        }

        def eltern_abzeichen() -> dict:
            if rolle != "eltern":
                return None
            jetzt_iso = iso_jetzt()
            vorbei = {e.get("id") for e in daten.get("events", [])
                      if str(e.get("start") or "") < jetzt_iso and not e.get("abgesagt")}
            n_jobs = sum(1 for j in daten.get("jobs", [])
                         if j.get("userId") == sess["user_id"] and (j.get("done") or j.get("eventId") in vorbei))
            n_fahrten = sum(1 for d_ in daten.get("drivers", [])
                            if d_.get("userId") == sess["user_id"] and int(d_.get("seats") or 0) > 0
                            and d_.get("eventId") in vorbei)
            werte = {"jobs": n_jobs, "fahrten": n_fahrten, "gesamt": n_jobs + n_fahrten}
            erhalten, naechste = [], []
            for art, stufen in ELTERN_STUFEN.items():
                for ziel, emoji, name, text in stufen:
                    if werte[art] >= ziel:
                        erhalten.append({"emoji": emoji, "name": name, "text": text, "art": art})
                    else:
                        naechste.append({"emoji": emoji, "name": name, "fehlt": ziel - werte[art], "art": art,
                                         "text": {"jobs": "Heimspiel-Job(s)", "fahrten": "Auswärtsfahrt(en)",
                                                  "gesamt": "Einsatz/Einsätze"}[art]})
                        break
            naechste.sort(key=lambda n: n["fehlt"])
            return {"jobs": n_jobs, "fahrten": n_fahrten, "erhalten": erhalten, "naechstes": naechste[0] if naechste else None}

        # Vergangene, nicht abgesagte Termine der laufenden Saison + Antwort-Index –
        # einmal aufbereitet, von Abzeichen UND Eltern-Statistik gemeinsam genutzt.
        # Saisonbeginn 1. Juli 00:00 Europe/Berlin (deckt sich mit der Trainer-App).
        def _saison_termine_antworten():
            import datetime as _dt
            from zoneinfo import ZoneInfo
            berlin = ZoneInfo("Europe/Berlin")
            jetzt = _dt.datetime.now(_dt.timezone.utc)
            jahr = jetzt.astimezone(berlin).year - (1 if jetzt.astimezone(berlin).month < 7 else 0)
            saison_start = _dt.datetime(jahr, 7, 1, tzinfo=berlin)
            past = [e for e in daten.get("events", [])
                    if e.get("type") in ("training", "home", "away")
                    and not e.get("abgesagt")
                    and (z := db.parse_iso(e.get("start"))) is not None and saison_start <= z < jetzt]
            antworten = {}
            for r in daten.get("responses", []):
                antworten.setdefault(r.get("eventId"), {})[r.get("playerId")] = r.get("status")
            return past, antworten

        # Abzeichen (laufende Saison, mind. 3 Termine im Bereich) für die eigenen
        # Spieler:innen berechnen – gleiche Logik wie in der Team-Analyse
        def abzeichen_fuer(pids: list) -> dict:
            past, antworten = _saison_termine_antworten()
            bereiche = {
                "alle": past,
                "training": [e for e in past if e.get("type") == "training"],
                "spiel": [e for e in past if e.get("type") in ("home", "away")],
            }
            out = {}
            for pid in pids:
                erhalten = []
                for d in daten.get("abzeichenDefs", []):
                    evs = bereiche.get(d.get("bereich") or "alle", [])
                    # „nicht nominiert" (x): dieser Termin zählt für die Person gar nicht
                    evs = [e for e in evs if antworten.get(e.get("id"), {}).get(pid) != "x"]
                    if len(evs) < 3:
                        continue
                    geantwortet = sum(1 for e in evs if antworten.get(e.get("id"), {}).get(pid))
                    zusagen = sum(1 for e in evs
                                  if antworten.get(e.get("id"), {}).get(pid) == "yes")
                    zaehler = zusagen if d.get("typ") == "teilnahme" else geantwortet
                    quote = round(zaehler / len(evs) * 100)
                    if quote >= (d.get("schwelle") or 0):
                        bereich_txt = {"training": "Trainings", "spiel": "Spiele"}.get(d.get("bereich") or "alle", "Termine")
                        text = d.get("beschreibung") or (
                            f"Bei mindestens {d.get('schwelle') or 0} % der {bereich_txt} dabei gewesen"
                            if d.get("typ") == "teilnahme"
                            else f"Mindestens {d.get('schwelle') or 0} % der {bereich_txt} rechtzeitig beantwortet")
                        erhalten.append({"name": d.get("name") or "", "emoji": d.get("emoji") or "🏅",
                                         "wert": quote, "text": f"{text} – aktuell {quote} %."})
                out[pid] = erhalten
            return out

        abz = abzeichen_fuer([p["id"] for p in meine])

        # Eltern: Rückmeldeverhalten des eigenen Kindes im Vergleich zum Team –
        # nur Quoten, Durchschnitt und Rangnummer, KEINE Daten anderer Personen
        def eltern_statistik(pids: list) -> dict:
            past, antworten = _saison_termine_antworten()
            aktive = [p for p in daten.get("players", [])
                      if p.get("membershipStatus") != "inaktiv"]

            def quoten(pid):
                # Termine mit „nicht nominiert" (x) zählen für diese Person nicht mit
                rel = [e for e in past if antworten.get(e.get("id"), {}).get(pid) != "x"]
                n = len(rel)
                geantwortet = sum(1 for e in rel if antworten.get(e.get("id"), {}).get(pid))
                zusagen = sum(1 for e in rel
                              if antworten.get(e.get("id"), {}).get(pid) == "yes")
                return {"termine": n, "geantwortet": geantwortet, "zusagen": zusagen,
                        "antwortQ": round(geantwortet / n * 100) if n else 0,
                        "zusageQ": round(zusagen / n * 100) if n else 0}

            alle = {p["id"]: quoten(p["id"]) for p in aktive}
            anzahl = len(alle)
            team = {"anzahl": anzahl,
                    "antwortQ": round(sum(q["antwortQ"] for q in alle.values()) / anzahl) if anzahl else 0,
                    "zusageQ": round(sum(q["zusageQ"] for q in alle.values()) / anzahl) if anzahl else 0}
            kinder = {}
            for pid in pids:
                q = alle.get(pid) or quoten(pid)
                rang = 1 + sum(1 for a in alle.values() if a["antwortQ"] > q["antwortQ"])
                kinder[pid] = dict(q, rang=rang)
            return {"kinder": kinder, "team": team}

        statistik = eltern_statistik([p["id"] for p in meine]) if rolle == "eltern" else None

        # „leicht": Nach einer Aktion lädt das Portal ohne die großen Base64-Fotos
        # neu (der Client behält sie aus dem ersten vollen Load) – spart Bandbreite.
        # Fotos/Bilder liegen NICHT mehr als Base64 im Paket, sondern als kleine URL
        # mit Versions-Hash: einmal geladen, dann ein Jahr aus dem Gerätecache
        # (Teil B: mobile Daten sparen). ?leicht=1 wird aus Kompatibilität weiter akzeptiert.
        import hashlib as _hashlib

        def bild_url(art, oid, data_url):
            if not data_url or not str(data_url).startswith("data:image/"):
                return ""
            return f"/api/portal/{art}/{oid}?v={_hashlib.sha1(str(data_url).encode()).hexdigest()[:10]}"
        foto_von = lambda v: v or ""  # noqa: E731 (nur noch für Altpfade)

        abt = {d.get("id"): d.get("name") for d in daten.get("departments", [])}
        # Kategorie-Label einmal aufbauen (statt pro „weiterer" Termin neu)
        kat_label = {c.get("id"): (((c.get("emoji") or "") + " ").strip() + " " + (c.get("name") or "")).strip()
                     for c in daten.get("eventCategories", [])}
        ank = sorted(
            [{"id": a.get("id"), "title": a.get("title"), "body": a.get("body"), "date": a.get("date")}
             for a in daten.get("announcements", []) if a.get("audience") in ("alle", "oeffentlich", rolle)],
            key=lambda a: str(a.get("date", "")), reverse=True)[:10]

        return portal_antwort({
            "user": {"name": sess["name"], "role": rolle},
            "benachrichtigungen": {
                "prefs": notify_prefs_lesen(sess["user_id"]),
                "emailAdressen": portal_mailadressen(sess, daten),
                "mailMoeglich": mail.konfiguriert(),
            },
            "statistik": statistik,
            # Team-Avatare für die „Wer ist dabei?"-Anzeige – nur unter Spieler:innen
            # Foto nur, wenn die Foto-Einwilligung vorliegt (eigene Kinder/sich selbst immer)
            "team": ([{"id": p["id"],
                       "name": f"{p.get('firstName', '')} {p.get('lastName', '')}".strip(),
                       "avatarEmoji": p.get("avatarEmoji") or "",
                       "foto": (bild_url("foto", p["id"], p.get("foto"))
                                if (p["id"] in meine_ids or _einw.foto_erlaubt(daten, p["id"])) else "")}
                      for p in daten.get("players", [])
                      if p.get("membershipStatus") != "inaktiv"]
                     if rolle == "spieler" else []),
            # Spieler:innen: alle erreichbaren Abzeichen (kurz) – motiviert, zeigt das Ziel
            "abzeichenDefs": ([{k: d.get(k) for k in ("id", "name", "emoji", "typ", "schwelle", "bereich")}
                               for d in sorted(daten.get("abzeichenDefs", []), key=lambda d: (d.get("bereich") or "", d.get("schwelle") or 0))
                               if isinstance(d, dict)]
                              if rolle == "spieler" else []),
            "whatsapp": (daten.get("whatsapp") or {}).get(
                "eltern" if rolle == "eltern" else "spieler") or "",
            "spieler": [{"id": p["id"],
                         "name": f"{p.get('firstName', '')} {p.get('lastName', '')}".strip(),
                         "avatarEmoji": p.get("avatarEmoji") or "",
                         "foto": bild_url("foto", p["id"], p.get("foto")),
                         "abzeichen": abz.get(p["id"], []),
                         "abteilung": ", ".join(
                             n for n in (abt.get(i) for i in (
                                 p.get("departmentIds") or ([p.get("departmentId")] if p.get("departmentId") else [])))
                             if n)} for p in meine],
            "trainings": [training_obj(e) for e in kommend([e for e in events if e.get("type") == "training"], 15)],
            "spiele": [spiel_obj(e) for e in kommend([e for e in events if e.get("type") in ("home", "away")], 20)],
            "weitere": [
                {"id": e.get("id"), "title": e.get("title") or "", "start": e.get("start"),
                 "end": e.get("end"), "location": e.get("location") or "",
                 "wetter": termin_wetter(e),
                 "kategorie": kat_label.get(e.get("type")) or "📌 Termin"}
                for e in kommend([e for e in events
                                  if e.get("type") not in ("training", "home", "away")], 15)],
            "ferien": sorted([{"name": h.get("name"), "start": h.get("start"), "end": h.get("end")}
                              for h in daten.get("holidays", []) if str(h.get("end", ""))[:10] >= heute],
                             key=lambda h: str(h.get("start", "")))[:8],
            "ankuendigungen": ank,
            "aufgaben": portal_aufgaben_fuer(sess, daten),
            "links": [{k: (l.get(k) or "") for k in ("id", "icon", "title", "sub", "url")}
                      for l in daten.get("links", [])],
            "fahrer": fahrer,
            "jobs": jobs,
            "helfer": (helfer if rolle == "eltern" else {}),
            "rueckenwind": _rw.payload(con(), daten, sess, meine),
            "elternAbzeichen": eltern_abzeichen(),
            "nachrichten": [{"id": n.get("id"), "text": n.get("text") or "", "at": n.get("at"),
                             "antworten": [{"text": a.get("text") or "", "von": a.get("von") or "Trainerteam",
                                            "at": a.get("at")} for a in (n.get("antworten") or [])]}
                            for n in daten.get("nachrichten", [])
                            if isinstance(n, dict) and n.get("userId") == sess["user_id"]][-20:],
            "quizFragen": [{k: q.get(k) for k in ("id", "kapitel", "f", "a", "r", "stufe")}
                           for q in daten.get("quizFragen", [])],
            "kleidung": [dict({k: c.get(k) for k in ("id", "name", "description", "price", "sizes", "kind", "color")},
                              bild=bild_url("bild", c.get("id"), c.get("bild")))
                         for c in daten.get("clothing", [])],
            "kleidungAnfragen": [{"id": r.get("id"), "itemId": r.get("itemId"), "playerId": r.get("playerId"),
                                  "size": r.get("size"), "qty": r.get("qty"), "status": r.get("status")}
                                 for r in daten.get("clothingRequests", []) if r.get("playerId") in meine_ids],
            "tabelleMeta": {k: (daten.get("standingsMeta") or {}).get(k)
                            for k in ("liga", "saison", "stand")},
            "tabelle": sorted(
                [{k: r.get(k) for k in ("team", "games", "win", "loss", "setsW", "setsL", "points")}
                 for r in daten.get("standings", [])],
                key=lambda r: (-(r.get("points") or 0),
                               -((r.get("setsW") or 0) - (r.get("setsL") or 0)))),
            "abwesenheiten": sorted(
                [{"id": a.get("id"), "playerId": a.get("playerId"), "von": a.get("von"),
                  "bis": a.get("bis"), "grund": a.get("grund") or "",
                  "eigene": a.get("userId") == sess["user_id"]}
                 for a in daten.get("abwesenheiten", [])
                 if a.get("playerId") in meine_ids and str(a.get("bis") or "") >= heute],
                key=lambda a: str(a.get("von") or "")),
            "einverstaendnis": [dict(_einw.status(daten, p["id"]), playerId=p["id"],
                                     vorhanden=_einw.status(daten, p["id"])["vollstaendig"])
                                for p in meine],
            # Vorlagen für die digitale Bestätigung (nur Eltern)
            "vorlagen": ([{"id": t["id"], "name": t.get("name") or "", "text": t.get("text") or "",
                           "required": bool(t.get("required")), "gueltigkeit": t.get("gueltigkeit") or "unbefristet",
                           "schutz": t.get("schutz") or ""} for t in _einw.vorlagen(daten)]
                         if rolle == "eltern" else []),
            "kontakte": [{"id": p["id"], "firstName": p.get("firstName"), "lastName": p.get("lastName"),
                          "parentName": p.get("parentName") or "", "parent2Name": p.get("parent2Name") or "",
                          "parentEmail": p.get("parentEmail") or "", "parentPhone": p.get("parentPhone") or "",
                          "playerEmail": p.get("playerEmail") or "", "playerPhone": p.get("playerPhone") or ""}
                         for p in meine],
        })

    @app.post("/api/portal/rsvp")
    def api_portal_rsvp():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] == "eltern":
            # Eltern haben nur Leserechte auf die Rückmeldungen des eigenen Kindes
            return err(403, "Rückmeldungen geben die Spieler:innen selbst ab – "
                            "Eltern sehen hier nur den Stand")
        body = request.get_json(silent=True) or {}
        eid = body.get("eventId")
        pid = body.get("playerId")
        status = body.get("status") or ""
        # Begründung/Bemerkung: bei ❓/👎 Pflicht (Client), bei 👍 optional (z. B. „+1")
        grund = str(body.get("grund") or "").strip()[:80] if status else ""
        if status not in ("yes", "no", "maybe", ""):
            return err(400, "Ungültiger Status")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        _v, daten = lade_state()
        # Spieltag: "id1,id2" = mehrere Spiele am selben Tag, eine Rückmeldung für alle
        eids = [x for x in str(eid or "").split(",") if x][:6]
        evs = [e for e in daten.get("events", []) if e.get("id") in eids and e.get("type") in ("training", "home", "away")]
        if not eids or len(evs) != len(eids):
            return err(404, "Termin nicht gefunden")
        ev, eid = evs[0], eids[0]
        vorher = next((r.get("status") for r in daten.get("responses", [])
                       if r.get("eventId") == eid and r.get("playerId") == pid), "")

        def mut(d):
            liste = [r for r in d.get("responses", [])
                     if not (r.get("eventId") in eids and r.get("playerId") == pid)]
            if status:
                for e_id in eids:
                    liste.append({"id": neue_id("rs"), "eventId": e_id, "playerId": pid,
                                  "status": status, "grund": grund, "at": iso_jetzt(), "quelle": "portal"})
            d["responses"] = liste

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        # Neue Absage → Trainerteam sofort informieren (abschaltbar: pushAbsagen)
        if status == "no" and vorher != "no":
            sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None)
            sp_name = f"{sp.get('firstName', '')} {sp.get('lastName', '')}".strip() if sp else sess["name"]
            start = str(ev.get("start") or "")
            datum = f"{start[8:10]}.{start[5:7]}." if len(start) >= 10 else ""
            titel = ev.get("title") or {"training": "Training", "home": "Heimspiel", "away": "Auswärtsspiel"}[ev["type"]]
            trainer_ids = [r["id"] for r in con().execute(
                "SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]
            try:
                import push
                push.senden(con(), f"👎 Absage: {sp_name}",
                            f"{sp_name} hat für {titel} am {datum} abgesagt"
                            + (f" – „{grund}“" if grund else "."),
                            "/#/training", trainer_ids, kategorie="absagen")
            except Exception:
                pass  # Push ist Komfort – die Absage selbst ist gespeichert
        return jsonify({"ok": True})

    @app.post("/api/portal/driver")
    def api_portal_driver():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        eid = body.get("eventId")
        try:
            seats = max(0, min(8, int(body.get("seats", 0))))
        except (TypeError, ValueError):
            return err(400, "Plätze: Zahl zwischen 0 und 8")
        _v, daten = lade_state()
        ev = next((e for e in daten.get("events", []) if e.get("id") == eid), None)
        if ev is None or ev.get("type") != "away":
            return err(404, "Auswärtsspiel nicht gefunden")
        bisher = next((x for x in daten.get("drivers", [])
                       if x.get("eventId") == eid and x.get("userId") == sess["user_id"]), None)
        # Telefon nur überschreiben, wenn es mitgeschickt wurde (Terminliste
        # schickt nur die Plätze – das Telefon aus „Mithelfen" bleibt erhalten)
        if "phone" in body:
            phone = str(body.get("phone") or "")[:40]
        else:
            phone = (bisher or {}).get("phone") or ""

        def mut(d):
            liste = [x for x in d.get("drivers", []) if not (x.get("eventId") == eid and x.get("userId") == sess["user_id"])]
            if seats > 0:
                liste.append({"id": neue_id("dr"), "eventId": eid, "name": sess["name"],
                              "phone": phone, "seats": seats, "playerIds": [], "notes": "",
                              "userId": sess["user_id"], "quelle": "portal"})
            d["drivers"] = liste

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    # ---------- Abwesenheiten (Konto-Tab: krank, Klassenfahrt, Ferien …) ----------

    @app.post("/api/portal/abwesenheit")
    def api_portal_abwesenheit():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        if body.get("loeschen"):
            aid = body.get("abwesenheitId")

            eigene = sess_player_ids(sess)

            def mut_weg(d):
                d["abwesenheiten"] = [a for a in d.get("abwesenheiten", [])
                                      if not (a.get("id") == aid and a.get("userId") == sess["user_id"])]
                # Auto-Absagen nur entfernen, wenn sie zu einem eigenen Kind gehören –
                # sonst könnte eine fremde abwesenheitId fremde Rückmeldungen löschen (IDOR)
                d["responses"] = [r for r in d.get("responses", [])
                                  if not (r.get("autoAbwesenheit") == aid
                                          and r.get("playerId") in eigene)]

            if speichere_portal_aenderung(mut_weg, f"{sess['name']} (Portal)") is None:
                return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
            return jsonify({"ok": True})
        pid = body.get("playerId")
        von = str(body.get("von") or "")[:10]
        bis = str(body.get("bis") or "")[:10] or von
        grund = str(body.get("grund") or "").strip()[:60] or "abwesend"
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        import datetime as _dt
        try:
            d_von, d_bis = _dt.date.fromisoformat(von), _dt.date.fromisoformat(bis)
        except ValueError:
            return err(400, "Bitte Anfang und Ende angeben")
        if d_bis < d_von or (d_bis - d_von).days > 120:
            return err(400, "Zeitraum prüfen (Ende vor Anfang oder länger als 120 Tage)")
        aid = neue_id("ab")

        def mut(d):
            d.setdefault("abwesenheiten", []).append({
                "id": aid, "playerId": pid, "von": von, "bis": bis, "grund": grund,
                "userId": sess["user_id"], "gemeldetVon": sess["name"],
                "at": iso_jetzt(), "quelle": "portal"})
            # Termine im Zeitraum automatisch absagen (übersteuerbar durch neue Rückmeldung)
            for e in d.get("events", []):
                if e.get("type") not in ("training", "home", "away"):
                    continue
                tag = str(e.get("start") or "")[:10]
                if von <= tag <= bis:
                    d["responses"] = [r for r in d.get("responses", [])
                                      if not (r.get("eventId") == e.get("id") and r.get("playerId") == pid)]
                    d["responses"].append({"id": neue_id("rs"), "eventId": e.get("id"),
                                           "playerId": pid, "status": "no", "grund": grund,
                                           "at": iso_jetzt(), "quelle": "portal",
                                           "autoAbwesenheit": aid})

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    # ---------- Portal-Aufgaben: Empfänger-Ermittlung ----------

    def aufgaben_empfaenger(task) -> list:
        """Aktive Konten-IDs, an die eine Portal-Aufgabe gerichtet ist."""
        rolle = task.get("zielRolle")
        if rolle not in ("spieler", "eltern", "alle"):
            return []
        rollen = ("spieler", "eltern") if rolle == "alle" else (rolle,)
        platzhalter = ",".join("?" * len(rollen))
        rows = con().execute(
            f"SELECT id, player_ids FROM users WHERE active = 1 AND role IN ({platzhalter})",
            list(rollen)).fetchall()
        ziel_pids = set(task.get("zielPlayerIds") or [])
        ids = []
        for r in rows:
            if ziel_pids:
                try:
                    eigene = set(json.loads(r["player_ids"] or "[]"))
                except Exception:
                    eigene = set()
                if not (eigene & ziel_pids):
                    continue
            ids.append(r["id"])
        return ids

    def portal_aufgaben_fuer(sess, daten) -> list:
        eigene_pids = sess_player_ids(sess)
        rollen_ok = ("alle", sess["role"])
        ergebnis = []
        for t in daten.get("tasks", []):
            if t.get("done"):
                continue  # vom Trainerteam global erledigte Aufgaben nicht mehr zeigen
            if t.get("zielRolle") not in rollen_ok:
                continue
            ziel_pids = set(t.get("zielPlayerIds") or [])
            if ziel_pids and not (ziel_pids & eigene_pids):
                continue
            ergebnis.append({"id": t.get("id"), "title": t.get("title") or "",
                             "due": t.get("due"), "priority": t.get("priority") or "mittel",
                             "erledigt": sess["user_id"] in (t.get("erledigtVon") or [])})
        ergebnis.sort(key=lambda t: (t["erledigt"], str(t["due"] or "")))
        return ergebnis

    @app.post("/api/portal/nachricht")
    def api_portal_nachricht():
        """Eltern schreiben dem Trainerteam. Landet im Datenbestand (nachrichten[]) + Push an alle Trainer."""
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "eltern":
            return err(403, "Nachrichten ans Trainerteam gibt es im Elternkonto")
        body = request.get_json(silent=True) or {}
        text = str(body.get("text") or "").strip()[:1000]
        if len(text) < 2:
            return err(400, "Bitte eine Nachricht eingeben")
        jetzt = db.now()
        neulich = con().execute(
            "SELECT COUNT(*) AS n FROM login_log WHERE username = ? AND ts > ?",
            (f"nachricht:{sess['user_id']}", jetzt - 3600)).fetchone()["n"]
        if neulich >= 20:
            return err(429, "Sehr viele Nachrichten in kurzer Zeit – bitte später noch einmal")
        log_login(f"nachricht:{sess['user_id']}", True)
        eintrag = {"id": neue_id("nm"), "userId": sess["user_id"], "von": sess["name"], "rolle": sess["role"],
                   "playerIds": sorted(sess_player_ids(sess)), "text": text, "at": iso_jetzt(),
                   "gelesen": False, "antworten": []}

        def mut(d):
            d.setdefault("nachrichten", []).append(eintrag)

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Senden gerade nicht möglich – bitte erneut versuchen")
        trainer_ids = [r["id"] for r in con().execute(
            "SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]
        if _push is not None:
            try:
                _push.senden(con(), f"📨 Nachricht von {sess['name']}",
                             text[:140] + ("…" if len(text) > 140 else ""), "/#/nachrichten", trainer_ids,
                             kategorie="allgemein")
            except Exception:  # noqa: BLE001
                pass
        return jsonify({"ok": True, "id": eintrag["id"]})

    @app.post("/api/nachrichten/push")
    def api_nachrichten_push():
        """Trainer hat geantwortet (Antwort steht schon im Datenbestand) – Elternkonto per Push informieren."""
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        try:
            ziel = int(body.get("userId") or 0)
        except (TypeError, ValueError):
            ziel = 0
        text = str(body.get("text") or "").strip()[:140]
        if not ziel or not text:
            return err(400, "userId und Text nötig")
        if _push is None:
            return jsonify({"ok": True, "zugestellt": 0})
        res = _push.senden(con(), f"💬 Antwort vom Trainerteam ({sess['name']})", text, "/#nachrichten", [ziel],
                           kategorie="allgemein")
        return jsonify({"ok": True, "zugestellt": res["ok"]})

    @app.post("/api/portal/aufgabe")
    def api_portal_aufgabe():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        tid = body.get("taskId")
        erledigt = bool(body.get("erledigt"))
        ergebnis = {"fehler": None}

        def mut(d):
            t = next((x for x in d.get("tasks", []) if x.get("id") == tid), None)
            if t is None or t.get("zielRolle") not in ("alle", sess["role"]):
                ergebnis["fehler"] = (404, "Aufgabe nicht gefunden")
                return
            ziel_pids = set(t.get("zielPlayerIds") or [])
            if ziel_pids and not (ziel_pids & sess_player_ids(sess)):
                ergebnis["fehler"] = (403, "Diese Aufgabe ist nicht an dich gerichtet")
                return
            von = [u for u in (t.get("erledigtVon") or []) if u != sess["user_id"]]
            if erledigt:
                von.append(sess["user_id"])
            t["erledigtVon"] = von

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        if ergebnis["fehler"]:
            return err(*ergebnis["fehler"])
        return jsonify({"ok": True})

    @app.post("/api/aufgaben/erinnern")
    def api_aufgaben_erinnern():
        """Trainer:in schickt manuell eine Push-Erinnerung an alle Säumigen."""
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        tid = (request.get_json(silent=True) or {}).get("taskId")
        _v, daten = lade_state()
        t = next((x for x in daten.get("tasks", []) if x.get("id") == tid), None)
        if t is None:
            return err(404, "Aufgabe nicht gefunden")
        saeumige = [u for u in aufgaben_empfaenger(t) if u not in (t.get("erledigtVon") or [])]
        if not saeumige:
            return jsonify({"empfaenger": 0, "ok": 0, "weg": 0})
        import push
        faellig = str(t.get("due") or "")[:10]
        ergebnis = push.senden(con(), "✅ Erinnerung vom Trainerteam",
                               f"Bitte noch erledigen: {str(t.get('title') or '')[:120]}"
                               + (f" (fällig {faellig[8:10]}.{faellig[5:7]}.)" if faellig else ""),
                               "/", saeumige, kategorie="teilnahme")
        ergebnis["empfaenger"] = len(saeumige)
        return jsonify(ergebnis)

    @app.post("/api/termin/erinnern")
    def api_termin_erinnern():
        """Trainer:in erinnert per Push alle Spieler:innen, die zu einem Termin
        noch keine Rückmeldung gegeben haben (Knopf im Trainer-Cockpit)."""
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        eid = body.get("eventId")
        nur_pid = body.get("playerId")  # optional: Erinnerung an genau eine Person
        _v, daten = lade_state()
        ev = next((e for e in daten.get("events", []) if e.get("id") == eid), None)
        if ev is None or ev.get("type") not in ("training", "home", "away"):
            return err(404, "Termin nicht gefunden")
        roster = {p["id"] for p in daten.get("players", []) if p.get("membershipStatus") != "inaktiv"}
        if nur_pid:
            offene = {nur_pid} & roster
        else:
            geantwortet = {r.get("playerId") for r in daten.get("responses", []) if r.get("eventId") == eid}
            offene = roster - geantwortet
        empfaenger = []
        for u in con().execute(
                "SELECT id, player_ids FROM users WHERE active = 1 AND role = 'spieler'").fetchall():
            try:
                pids = set(json.loads(u["player_ids"] or "[]"))
            except Exception:
                pids = set()
            if pids & offene:
                empfaenger.append(u["id"])
        if not empfaenger:
            return jsonify({"empfaenger": 0, "offen": len(offene), "ok": 0, "weg": 0})
        start = str(ev.get("start") or "")
        datum = f"{start[8:10]}.{start[5:7]}." if len(start) >= 10 else ""
        uhr = start[11:16] if len(start) >= 16 else ""
        titel = ev.get("title") or {"training": "Training", "home": "Heimspiel", "away": "Auswärtsspiel"}[ev["type"]]
        import push
        ergebnis = push.senden(con(), "⏰ Kommst du?",
                               f"Bitte sag kurz Bescheid: {titel} am {datum}"
                               + (f" um {uhr} Uhr" if uhr else "") + " – 👍 ❓ 👎 im Portal",
                               "/", empfaenger, kategorie="teilnahme")
        ergebnis["empfaenger"] = len(empfaenger)
        ergebnis["offen"] = len(offene)
        return jsonify(ergebnis)

    @app.get("/api/trainer/benachrichtigungen")
    def api_trainer_benachr_get():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        return jsonify({"prefs": notify_prefs_lesen(sess["user_id"])})

    @app.post("/api/trainer/benachrichtigungen")
    def api_trainer_benachr_set():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        prefs = notify_prefs_lesen(sess["user_id"])
        for k in NOTIFY_DEFAULT:
            if k in body:
                prefs[k] = bool(body[k])
        # Andere gespeicherte Schlüssel (z. B. Rückenwind-Opt-in) unverändert mitnehmen
        row = con().execute("SELECT notify_prefs FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        try:
            gesamt = json.loads((row["notify_prefs"] if row else "") or "{}")
        except Exception:
            gesamt = {}
        gesamt.update(prefs)
        con().execute("UPDATE users SET notify_prefs = ? WHERE id = ?",
                      (db.to_json(gesamt), sess["user_id"]))
        con().commit()
        return jsonify({"ok": True, "prefs": prefs})

    # ---------- API: Volleyball-Quiz (Punkte je Konto) ----------

    def quiz_woche() -> str:
        """Aktueller Wochen-Schlüssel (ISO-Woche, Reset montags)."""
        import datetime as _dt
        j, w, _t = _dt.date.today().isocalendar()
        return f"{j}-W{w:02d}"

    @app.get("/api/portal/quiz")
    def api_quiz_stand():
        sess, failure = require_portal()
        if failure:
            return failure
        woche = quiz_woche()
        row = con().execute("SELECT punkte, wochen_punkte, woche, beantwortet FROM quiz_stand"
                            " WHERE user_id = ?", (sess["user_id"],)).fetchone()
        aktuelle_woche = bool(row and row["woche"] == woche)
        try:
            # Wochenwettbewerb: mit jeder neuen Woche sind alle Fragen wieder
            # spielbar (beantwortet gilt nur je Woche); Gesamtpunkte laufen weiter.
            beantwortet = json.loads(row["beantwortet"]) if aktuelle_woche else []
        except Exception:
            beantwortet = []
        import quiz_fragen
        _v, daten = lade_state()
        antwort = {"punkte": row["punkte"] if row else 0,
                   "wochenPunkte": row["wochen_punkte"] if aktuelle_woche else 0,
                   "woche": woche, "beantwortet": beantwortet,
                   # Fragen kommen jetzt vom Server – ohne richtige Antwort (r)
                   "kapitel": quiz_fragen.kapitel_public(daten.get("quizFragen", []))}
        # Bestenliste NUR für Spieler:innen-Konten – Eltern dürfen keine Namen
        # anderer Kinder sehen (Datenschutz-Grundsatz des Portals).
        if sess["role"] == "spieler":
            rows = con().execute(
                "SELECT u.name, q.punkte, q.wochen_punkte, q.woche FROM quiz_stand q"
                " JOIN users u ON u.id = q.user_id"
                " WHERE u.role = 'spieler' AND u.active = 1 AND q.punkte > 0").fetchall()
            liste = [{"name": r["name"], "punkte": r["punkte"],
                      "wochenPunkte": r["wochen_punkte"] if r["woche"] == woche else 0}
                     for r in rows]
            liste.sort(key=lambda x: (-x["wochenPunkte"], -x["punkte"], x["name"]))
            for i, eintrag in enumerate(liste[:3]):
                if eintrag["wochenPunkte"] > 0:
                    eintrag["abzeichen"] = ("gold", "silber", "bronze")[i]
            antwort["bestenliste"] = liste[:10]
        return jsonify(antwort)

    @app.post("/api/portal/quiz")
    def api_quiz_antwort():
        """Server wertet die Antwort selbst aus: prüft den gewählten Index gegen die
        richtige Antwort und vergibt die Punkte nach Stufe (Client kann weder die
        Lösung noch die Punktzahl fälschen)."""
        sess, failure = require_portal()
        if failure:
            return failure
        import quiz_fragen
        body = request.get_json(silent=True) or {}
        frage_id = str(body.get("frageId") or "")[:40]
        try:
            antwort_index = int(body.get("antwortIndex"))
        except (TypeError, ValueError):
            return err(400, "Ungültige Quiz-Antwort")
        _v, daten = lade_state()
        frage = quiz_fragen.index_by_id(daten.get("quizFragen", [])).get(frage_id)
        if frage is None:
            return err(400, "Frage nicht gefunden")
        korrekt_index = frage.get("r")
        richtig = antwort_index == korrekt_index
        woche = quiz_woche()
        with con() as c:
            row = c.execute("SELECT punkte, wochen_punkte, woche, beantwortet, fehlversuche"
                            " FROM quiz_stand WHERE user_id = ?", (sess["user_id"],)).fetchone()
            aktuelle_woche = bool(row and row["woche"] == woche)
            try:
                beantwortet = json.loads(row["beantwortet"]) if aktuelle_woche else []
                fehl = json.loads(row["fehlversuche"]) if (aktuelle_woche and row["fehlversuche"]) else {}
            except Exception:
                beantwortet, fehl = [], {}
            wochen_punkte = row["wochen_punkte"] if aktuelle_woche else 0
            gesamt = row["punkte"] if row else 0
            # Schon richtig beantwortet: keine weitere Wertung
            if frage_id in beantwortet:
                return jsonify({"ok": True, "richtig": True, "korrektIndex": korrekt_index,
                                "punkte": gesamt, "wochenPunkte": wochen_punkte, "neu": 0})
            if not richtig:
                # Fehlversuch merken (mindert die Punkte beim späteren Treffer)
                fehl[frage_id] = int(fehl.get(frage_id, 0)) + 1
                c.execute(
                    "INSERT INTO quiz_stand (user_id, punkte, wochen_punkte, woche, beantwortet, fehlversuche, updated_at)"
                    " VALUES (?,?,?,?,?,?,?)"
                    " ON CONFLICT(user_id) DO UPDATE SET woche = excluded.woche,"
                    " beantwortet = excluded.beantwortet, fehlversuche = excluded.fehlversuche,"
                    " updated_at = excluded.updated_at",
                    (sess["user_id"], gesamt, wochen_punkte, woche,
                     json.dumps(beantwortet), json.dumps(fehl), db.now()))
                return jsonify({"ok": True, "richtig": False, "korrektIndex": korrekt_index,
                                "punkte": gesamt, "wochenPunkte": wochen_punkte, "neu": 0})
            # Richtig: Punkte nach Stufe, reduziert wenn zuvor falsch geraten wurde
            neu = quiz_fragen.punkte_fuer(frage, erstversuch=frage_id not in fehl)
            beantwortet.append(frage_id)
            gesamt += neu
            wochen_punkte += neu
            c.execute(
                "INSERT INTO quiz_stand (user_id, punkte, wochen_punkte, woche, beantwortet, fehlversuche, updated_at)"
                " VALUES (?,?,?,?,?,?,?)"
                " ON CONFLICT(user_id) DO UPDATE SET punkte = excluded.punkte,"
                " wochen_punkte = excluded.wochen_punkte, woche = excluded.woche,"
                " beantwortet = excluded.beantwortet, fehlversuche = excluded.fehlversuche,"
                " updated_at = excluded.updated_at",
                (sess["user_id"], gesamt, wochen_punkte, woche,
                 json.dumps(beantwortet), json.dumps(fehl), db.now()))
        return jsonify({"ok": True, "richtig": True, "korrektIndex": korrekt_index,
                        "punkte": gesamt, "wochenPunkte": wochen_punkte, "neu": neu})

    @app.post("/api/portal/buffet")
    def api_portal_buffet():
        """Buffet-Beitrag je Heimspiel ankündigen (leer = zurückziehen)."""
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        eid = body.get("eventId")
        beitrag = str(body.get("beitrag") or "").strip()[:80]
        _v, daten = lade_state()
        ev = next((e for e in daten.get("events", []) if e.get("id") == eid), None)
        if ev is None or ev.get("type") != "home":
            return err(404, "Heimspiel nicht gefunden")

        def mut(d):
            liste = [b for b in d.get("buffet", [])
                     if not (b.get("eventId") == eid and b.get("userId") == sess["user_id"])]
            if beitrag:
                liste.append({"id": neue_id("bf"), "eventId": eid, "userId": sess["user_id"],
                              "name": sess["name"], "beitrag": beitrag, "at": iso_jetzt(),
                              "quelle": "portal"})
            d["buffet"] = liste

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    @app.post("/api/portal/job")
    def api_portal_job():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "eltern":
            return err(403, "Heimspiel-Jobs sind für Eltern-Konten")
        body = request.get_json(silent=True) or {}
        jid = body.get("jobId")
        abgeben = bool(body.get("abgeben"))
        ergebnis = {"fehler": None}

        def mut(d):
            j = next((x for x in d.get("jobs", []) if x.get("id") == jid), None)
            if j is None:
                ergebnis["fehler"] = (404, "Job nicht gefunden")
            elif abgeben:
                if j.get("userId") != sess["user_id"]:
                    ergebnis["fehler"] = (403, "Das ist nicht dein Job")
                else:
                    j["assignee"] = ""
                    j.pop("userId", None)
            else:
                if str(j.get("assignee") or "").strip():
                    ergebnis["fehler"] = (409, "Der Job ist schon vergeben – danke trotzdem!")
                else:
                    j["assignee"] = sess["name"]
                    j["userId"] = sess["user_id"]

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        if ergebnis["fehler"]:
            return err(*ergebnis["fehler"])
        return jsonify({"ok": True})

    @app.post("/api/portal/clothing")
    def api_portal_clothing():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] == "eltern":
            return err(403, "Vereinskleidung fordern die Spieler:innen selbst an")
        body = request.get_json(silent=True) or {}
        item_id = body.get("itemId")
        pid = body.get("playerId")
        size = str(body.get("size") or "")[:12]
        try:
            qty = max(1, min(5, int(body.get("qty", 1))))
        except (TypeError, ValueError):
            return err(400, "Anzahl: 1–5")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        _v, daten = lade_state()
        item = next((c for c in daten.get("clothing", []) if c.get("id") == item_id), None)
        if item is None:
            return err(404, "Artikel nicht gefunden")
        if size not in (item.get("sizes") or []):
            return err(400, "Bitte eine gültige Größe wählen")

        def mut(d):
            d.setdefault("clothingRequests", []).append({
                "id": neue_id("cr"), "itemId": item_id, "playerId": pid, "size": size,
                "qty": qty, "status": "offen", "at": iso_jetzt(), "quelle": "portal"})

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    KONTAKT_FELDER = {
        "eltern": ("parentName", "parent2Name", "parentEmail", "parentPhone", "playerEmail", "playerPhone"),
        "spieler": ("playerEmail", "playerPhone"),
    }

    @app.post("/api/portal/contact")
    def api_portal_contact():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        pid = body.get("playerId")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        erlaubt = KONTAKT_FELDER[sess["role"]]
        neu = {k: str(body.get(k))[:90] for k in erlaubt if isinstance(body.get(k), str)}
        if not neu:
            return err(400, "Keine Änderungen übergeben")

        def mut(d):
            for p in d.get("players", []):
                if p.get("id") == pid:
                    p.update(neu)

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    @app.post("/api/portal/code")
    def api_portal_code():
        """Weiteren Einladungscode einlösen (z. B. Eltern mit mehreren Kindern)."""
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        code = (body.get("code") or "").strip()
        if not code:
            return err(400, "Code angeben")
        inv = con().execute("SELECT * FROM invites WHERE code_hash = ?", (auth.hash_code(code),)).fetchone()
        if inv is None or inv["used_by"] is not None or inv["expires_at"] < db.now():
            return err(400, "Einladungscode ungültig oder abgelaufen")
        if inv["role"] != sess["role"]:
            return err(400, f"Dieser Code ist für die Rolle „{inv['role']}“ bestimmt")
        try:
            neu = json.loads(inv["player_ids"] or "[]")
        except Exception:
            neu = []
        ids = sess_player_ids(sess) | {i for i in neu if isinstance(i, str)}
        with con() as c:
            c.execute("UPDATE users SET player_ids = ? WHERE id = ?",
                      (json.dumps(sorted(ids)), sess["user_id"]))
            c.execute("UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?",
                      (sess["user_id"], db.now(), inv["id"]))
        return jsonify({"ok": True, "anzahlSpieler": len(ids)})

    # ---------- Kalender: iCal-Export und Abo-Feed (Sync mit dem eigenen Kalender) ----------

    TYP_LABEL = {"training": "Training", "home": "Heimspiel", "away": "Auswärtsspiel", "other": "Termin"}

    def _ics_text(daten) -> str:
        import datetime as _dt

        def esc_ics(t):
            return (str(t or "").replace("\\", "\\\\").replace(";", "\\;")
                    .replace(",", "\\,").replace("\n", "\\n"))

        def zeit(iso):
            d = db.parse_iso(iso)
            return d.astimezone(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") if d else None

        kats = {c.get("id"): c.get("name") for c in daten.get("eventCategories", [])}
        grenze = (_dt.date.today() - _dt.timedelta(days=7)).isoformat()
        zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0",
                  "PRODID:-//SKV Mueritz Volleyball//volleyball.nettverwaltet.de//DE",
                  "X-WR-CALNAME:SKV Müritz Volleyball", "X-WR-TIMEZONE:Europe/Berlin",
                  "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
        jetzt = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for e in sorted(daten.get("events", []), key=lambda x: str(x.get("start") or "")):
            if str(e.get("start") or "")[:10] < grenze:
                continue
            start, ende = zeit(e.get("start")), zeit(e.get("end") or e.get("start"))
            if not start:
                continue
            label = TYP_LABEL.get(e.get("type")) or kats.get(e.get("type")) or "Termin"
            titel = f"🏐 {label}: {e.get('title') or ''}".strip().rstrip(":")
            if e.get("opponent"):
                titel += f" gegen {e['opponent']}"
            zeilen += ["BEGIN:VEVENT",
                       f"UID:{e.get('id')}@volleyball.nettverwaltet.de",
                       f"DTSTAMP:{jetzt}", f"DTSTART:{start}", f"DTEND:{ende or start}",
                       f"SUMMARY:{esc_ics(titel)}"]
            if e.get("location"):
                zeilen.append(f"LOCATION:{esc_ics(e['location'])}")
            # description bewusst NICHT ausgeben: kann interne Notizen enthalten und
            # wird auch im /api/portal-Payload für Trainings/Spiele weggelassen
            zeilen.append("END:VEVENT")
        zeilen.append("END:VCALENDAR")
        return "\r\n".join(zeilen) + "\r\n"

    def _ics_antwort(daten):
        resp = app.response_class(_ics_text(daten), mimetype="text/calendar; charset=utf-8")
        resp.headers["Content-Disposition"] = 'attachment; filename="skv-mueritz-volleyball.ics"'
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.get("/api/portal/kalender.ics")
    def api_kalender_download():
        sess, failure = require(csrf=False)
        if failure:
            return failure
        _v, daten = lade_state()
        return _ics_antwort(daten)

    @app.get("/api/portal/kalender-info")
    def api_kalender_info():
        """Persönliche Abo-Adresse (Token statt Login – für Kalender-Apps)."""
        sess, failure = require()
        if failure:
            return failure
        row = con().execute("SELECT ics_token FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        token = row["ics_token"] if row and row["ics_token"] else None
        if not token:
            token = _secrets.token_urlsafe(24)
            con().execute("UPDATE users SET ics_token = ? WHERE id = ?", (token, sess["user_id"]))
            con().commit()
        basis = request.headers.get("X-Forwarded-Host") or request.host
        return jsonify({"aboUrl": f"https://{basis}/kalender/{token}.ics",
                        "webcalUrl": f"webcal://{basis}/kalender/{token}.ics"})

    @app.get("/kalender/<token>.ics")
    def kalender_feed(token: str):
        """Abo-Feed für Kalender-Apps – das persönliche Token ersetzt den Login."""
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token):
            return err(404, "Unbekannter Kalender")
        row = con().execute("SELECT id FROM users WHERE ics_token = ? AND active = 1",
                            (token,)).fetchone()
        if row is None:
            return err(404, "Unbekannter Kalender")
        _v, daten = lade_state()
        return _ics_antwort(daten)

    # ---------- Wetter für die Portal-Begrüßung (Server-Proxy, 30-min-Cache) ----------

    @app.get("/api/portal/wetter")
    def api_portal_wetter():
        sess, failure = require_portal()
        if failure:
            return failure
        import wetter
        return jsonify(wetter.aktuell())

    # ---------- Profilbild: Emoji-Avatar oder eigenes Foto (Portal) ----------

    @app.post("/api/portal/profilbild")
    def api_portal_profilbild():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        pid = body.get("playerId")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        patch = {}
        if body.get("fotoLoeschen"):
            patch["foto"] = ""
        elif isinstance(body.get("foto"), str) and body["foto"]:
            if not re.match(r"^data:image/(jpeg|png|webp);base64,", body["foto"]):
                return err(400, "Bitte ein Bild hochladen")
            if len(body["foto"]) > 260_000:  # ≈ 190 KB – Profilfotos sind klein
                return err(413, "Foto zu groß – bitte erneut versuchen")
            patch["foto"] = body["foto"]
        if isinstance(body.get("avatarEmoji"), str):
            patch["avatarEmoji"] = body["avatarEmoji"][:8]
        if not patch:
            return err(400, "Keine Änderung übergeben")

        def mut(d):
            for p in d.get("players", []):
                if p.get("id") == pid:
                    p.update(patch)

        if speichere_portal_aenderung(mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        return jsonify({"ok": True})

    # Einverständnis/Einwilligungen (Portal-Upload, digitale Bestätigung, Erinnerung) – server/einwilligung.py
    import einwilligung as _einw
    _einw.register(app, con, require, require_portal, err, {
        "sess_player_ids": sess_player_ids, "eigene_spieler": eigene_spieler,
        "speichere_portal_aenderung": speichere_portal_aenderung, "lade_state": lade_state,
        "neue_id": neue_id, "iso_jetzt": iso_jetzt, "client_ip": client_ip, "log_login": log_login,
        "push": _push, "auth": auth, "pdf_brief": __import__("pdf_brief")})

    # Saisonrückblick „Dein Jahr" als PDF – siehe server/dein_jahr.py
    import dein_jahr as _dj
    _dj.register(app, con, require_portal, err, {
        "sess_player_ids": sess_player_ids, "lade_state": lade_state, "pdf_brief": __import__("pdf_brief")})

    # Rückenwind (Eltern → Spieler:in) – siehe server/rueckenwind.py
    import rueckenwind as _rw
    _rw.register(app, con, require_portal, err, {
        "sess_player_ids": sess_player_ids, "lade_state": lade_state,
        "speichere_portal_aenderung": speichere_portal_aenderung, "neue_id": neue_id,
        "iso_jetzt": iso_jetzt, "push": _push, "log_login": log_login})


    # ---------- Benachrichtigungs-Einstellungen (Portal) ----------

    NOTIFY_DEFAULT = {"pushAllgemein": True, "pushTeilnahme": True, "pushAbsagen": True, "email": False}

    def notify_prefs_lesen(user_id):
        """Gespeicherte Einstellungen mit den Standardwerten auffüllen."""
        prefs = dict(NOTIFY_DEFAULT)
        row = con().execute("SELECT notify_prefs FROM users WHERE id = ?", (user_id,)).fetchone()
        if row:
            try:
                gespeichert = json.loads(row["notify_prefs"] or "{}")
                for k in NOTIFY_DEFAULT:
                    if k in gespeichert:
                        prefs[k] = bool(gespeichert[k])
            except Exception:
                pass
        return prefs

    def portal_mailadressen(sess, daten):
        """E-Mail-Adressen, an die dieses Konto Mitteilungen bekäme."""
        ids = sess_player_ids(sess)
        adressen = []
        felder = ("parentEmail", "parent2Email") if sess["role"] == "eltern" else ("playerEmail",)
        for p in daten.get("players", []):
            if p.get("id") not in ids:
                continue
            for feld in felder:
                a = (p.get(feld) or "").strip()
                if a and a not in adressen:
                    adressen.append(a)
        return adressen

    @app.get("/api/portal/benachrichtigungen")
    def api_portal_benachr_get():
        sess, failure = require_portal()
        if failure:
            return failure
        import mail
        _, daten = lade_state()
        return jsonify({
            "prefs": notify_prefs_lesen(sess["user_id"]),
            "emailAdressen": portal_mailadressen(sess, daten),
            "mailMoeglich": mail.konfiguriert(),
        })

    @app.post("/api/portal/benachrichtigungen")
    def api_portal_benachr_set():
        sess, failure = require_portal()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        prefs = notify_prefs_lesen(sess["user_id"])
        for k in NOTIFY_DEFAULT:
            if k in body:
                prefs[k] = bool(body[k])
        # Andere gespeicherte Schlüssel (z. B. Rückenwind-Opt-in) unverändert mitnehmen
        row = con().execute("SELECT notify_prefs FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        try:
            gesamt = json.loads((row["notify_prefs"] if row else "") or "{}")
        except Exception:
            gesamt = {}
        gesamt.update(prefs)
        con().execute("UPDATE users SET notify_prefs = ? WHERE id = ?",
                      (db.to_json(gesamt), sess["user_id"]))
        con().commit()
        return jsonify({"ok": True, "prefs": prefs})

    # ---------- API: Web-Push (alle angemeldeten Konten) ----------

    @app.get("/api/push/key")
    def api_push_key():
        sess, failure = require()
        if failure:
            return failure
        import push
        return jsonify({"key": push.public_key()})

    @app.post("/api/push/abo")
    def api_push_abo():
        sess, failure = require()
        if failure:
            return failure
        abo = request.get_json(silent=True) or {}
        endpoint = abo.get("endpoint") or ""
        if not endpoint.startswith("https://") or "keys" not in abo:
            return err(400, "Ungültiges Push-Abo")
        con().execute(
            "INSERT INTO push_abos (user_id, endpoint, daten, created_at) VALUES (?,?,?,?)"
            " ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, daten = excluded.daten",
            (sess["user_id"], endpoint, db.to_json(abo), db.now()),
        )
        con().commit()
        return jsonify({"ok": True})

    @app.post("/api/push/abo-loeschen")
    def api_push_abo_loeschen():
        sess, failure = require()
        if failure:
            return failure
        endpoint = (request.get_json(silent=True) or {}).get("endpoint") or ""
        con().execute("DELETE FROM push_abos WHERE endpoint = ? AND user_id = ?",
                      (endpoint, sess["user_id"]))
        con().commit()
        return jsonify({"ok": True})

    @app.post("/api/push/test")
    def api_push_test():
        sess, failure = require()
        if failure:
            return failure
        import push
        ergebnis = push.senden(con(), "🏐 Probe-Mitteilung",
                               "Deine Mitteilungen vom SKV-Müritz-Portal funktionieren!",
                               "/", [sess["user_id"]])
        return jsonify(ergebnis)

    @app.get("/api/quiz-uebersicht")
    def api_quiz_uebersicht():
        """Trainer-Sicht: Beteiligung und Punktestand aller Spieler:innen-Konten."""
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        woche = quiz_woche()
        rows = con().execute(
            "SELECT u.name, q.punkte, q.wochen_punkte, q.woche, q.beantwortet, q.updated_at"
            " FROM users u LEFT JOIN quiz_stand q ON q.user_id = u.id"
            " WHERE u.role = 'spieler' AND u.active = 1 ORDER BY u.name").fetchall()
        liste = []
        for r in rows:
            aktuelle = r["woche"] == woche
            try:
                beantwortet = len(json.loads(r["beantwortet"])) if (r["beantwortet"] and aktuelle) else 0
            except Exception:
                beantwortet = 0
            liste.append({"name": r["name"], "punkte": r["punkte"] or 0,
                          "wochenPunkte": (r["wochen_punkte"] or 0) if aktuelle else 0,
                          "beantwortetWoche": beantwortet,
                          "zuletzt": r["updated_at"]})
        liste.sort(key=lambda x: (-x["wochenPunkte"], -x["punkte"], x["name"]))
        return jsonify({"woche": woche, "spieler": liste,
                        "beteiligt": len([x for x in liste if x["punkte"] > 0]),
                        "gesamt": len(liste)})

    # ---------- API: Konto-Verwaltung (nur Trainer) ----------

    @app.get("/api/accounts")
    def api_accounts():
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        db.emails_aus_spielerdaten(con())
        rows = con().execute(
            "SELECT u.id, u.username, u.name, u.role, u.player_ids, u.active,"
            " u.totp_enabled, u.created_at, u.last_login, u.email, u.email_verified,"
            " (SELECT COUNT(*) FROM push_abos p WHERE p.user_id = u.id) AS push_abos"
            " FROM users u ORDER BY u.role, u.name"
        ).fetchall()
        konten = []
        for r in rows:
            k = dict(r)
            try:
                k["player_ids"] = json.loads(k["player_ids"] or "[]")
            except Exception:
                k["player_ids"] = []
            konten.append(k)
        jetzt = db.now()
        offene_codes = con().execute(
            "SELECT COUNT(*) AS n FROM invites WHERE used_by IS NULL AND expires_at > ?",
            (jetzt,)).fetchone()["n"]
        aktive = [k for k in konten if k["active"]]
        anfragen = [dict(r) for r in con().execute(
            "SELECT id, username, created_at FROM passwort_anfragen"
            " WHERE created_at > ? ORDER BY created_at DESC LIMIT 20",
            (jetzt - 7 * 86400,)).fetchall()]
        return jsonify({
            "accounts": konten,
            "anfragen": anfragen,
            "statistik": {
                "konten": len(aktive),
                "portalKonten": len([k for k in aktive if k["role"] != "trainer"]),
                "aktiv7": len([k for k in aktive if (k["last_login"] or 0) > jetzt - 7 * 86400]),
                "aktiv30": len([k for k in aktive if (k["last_login"] or 0) > jetzt - 30 * 86400]),
                "pushAbos": sum(k["push_abos"] for k in konten),
                "offeneCodes": offene_codes,
                "ohneEmail": len([k for k in aktive if k["role"] != "trainer" and not k["email"]]),
            },
            "mailMoeglich": mail.konfiguriert(),
        })

    @app.post("/api/accounts/<int:user_id>")
    def api_accounts_edit(user_id: int):
        """Konto bearbeiten (Name, Benutzername, Rolle, verknüpfte Spieler:innen)."""
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        ziel = con().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if ziel is None:
            return err(404, "Konto nicht gefunden")
        name = str(body.get("name") or "").strip()[:80]
        username = str(body.get("username") or "").strip()[:80]
        role = str(body.get("role") or "")
        player_ids = body.get("playerIds")
        if not name or not username:
            return err(400, "Name und Benutzername angeben")
        if role not in ("trainer", "spieler", "eltern"):
            return err(400, "Ungültige Rolle")
        if not isinstance(player_ids, list):
            player_ids = []
        player_ids = [str(p)[:60] for p in player_ids][:20]
        email = ziel["email"]
        if "email" in body:
            roh = str(body.get("email") or "").strip()
            email = db.email_normal(roh)  # "" = bewusst ohne Adresse
            if roh and not email:
                return err(400, "Die E-Mail-Adresse sieht nicht gültig aus")
            if email and con().execute(
                    "SELECT 1 FROM users WHERE lower(email) = ? AND id != ?",
                    (email, user_id)).fetchone():
                return err(400, "Diese E-Mail-Adresse gehört schon zu einem anderen Konto")
        andere = con().execute(
            "SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?",
            (username, user_id)).fetchone()
        if andere:
            return err(400, "Benutzername ist schon vergeben")
        if ziel["role"] == "trainer" and role != "trainer":
            rest = con().execute(
                "SELECT COUNT(*) AS n FROM users WHERE role = 'trainer' AND active = 1 AND id != ?",
                (user_id,)).fetchone()
            if rest["n"] < 1:
                return err(400, "Das letzte aktive Trainerkonto muss Trainer:in bleiben")
        geaendert = (email or "") != (ziel["email"] or "").lower()
        con().execute(
            "UPDATE users SET name = ?, username = ?, role = ?, player_ids = ?, email = ?,"
            " email_verified = CASE WHEN ? THEN 0 ELSE email_verified END WHERE id = ?",
            (name, username, role, db.to_json(player_ids), email, 1 if geaendert else 0, user_id))
        con().commit()
        return jsonify({"ok": True})

    @app.post("/api/accounts/<int:user_id>/reset-code")
    def api_accounts_reset_code(user_id: int):
        """Einmal-Wiederherstellungscode (24 h) für ein Konto erzeugen."""
        sess, failure = require(role="trainer")
        if failure:
            return failure
        ziel = con().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if ziel is None:
            return err(404, "Konto nicht gefunden")
        if not ziel["active"]:
            return err(400, "Konto ist deaktiviert – zuerst aktivieren")
        code = auth.new_code()
        # Frühere unbenutzte Codes desselben Kontos entwerten – es soll immer nur
        # EIN gültiger Wiederherstellungscode je Konto existieren
        con().execute(
            "UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            (db.now(), user_id))
        con().execute(
            "INSERT INTO reset_codes (user_id, code_hash, created_by, created_at, expires_at)"
            " VALUES (?,?,?,?,?)",
            (user_id, auth.hash_code(code), sess["name"], db.now(), db.now() + 24 * 3600))
        con().execute("DELETE FROM passwort_anfragen WHERE lower(username) = lower(?)",
                      (ziel["username"],))
        con().commit()
        return jsonify({"code": code, "username": ziel["username"], "gueltigStunden": 24})

    @app.delete("/api/passwort-anfragen/<int:anfrage_id>")
    def api_passwort_anfrage_loeschen(anfrage_id: int):
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        con().execute("DELETE FROM passwort_anfragen WHERE id = ?", (anfrage_id,))
        con().commit()
        return jsonify({"ok": True})

    PASSWORT_HINWEIS = ("Falls zu deinem Konto eine E-Mail-Adresse hinterlegt ist, kommt gleich ein Link"
                        " (bitte auch im Spam-Ordner nachsehen). Sonst meldet sich das Trainerteam mit einem Code.")

    def reset_mail_senden(nutzer) -> bool:
        """Einmal-Link zum Passwortsetzen an die hinterlegte Adresse schicken."""
        adresse = (nutzer["email"] or "").strip()
        if not adresse or not mail.konfiguriert():
            return False
        jetzt = db.now()
        # Drossel: je Konto höchstens 3 Links pro Stunde, insgesamt 30
        je_konto = con().execute(
            "SELECT COUNT(*) AS n FROM reset_codes WHERE user_id = ? AND created_by = 'email'"
            " AND created_at > ?", (nutzer["id"], jetzt - 3600)).fetchone()["n"]
        gesamt = con().execute(
            "SELECT COUNT(*) AS n FROM reset_codes WHERE created_by = 'email' AND created_at > ?",
            (jetzt - 3600,)).fetchone()["n"]
        if je_konto >= 3 or gesamt >= 30:
            return True  # still ablehnen – nach außen wie versendet
        code = auth.new_code()
        con().execute(
            "UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL"
            " AND created_by = 'email'", (jetzt, nutzer["id"]))
        con().execute(
            "INSERT INTO reset_codes (user_id, code_hash, created_by, created_at, expires_at)"
            " VALUES (?,?,?,?,?)",
            (nutzer["id"], auth.hash_code(code), "email", jetzt, jetzt + RESET_MAIL_MINUTES * 60))
        con().commit()
        link = f"{basis_url()}/?reset={urllib.parse.quote(code)}"
        vorname = (nutzer["name"] or "").split(" ")[0]
        text = (f"Hallo {vorname},\n\n"
                "für dein Konto in der SKV-Volleyball-App wurde ein neues Passwort angefordert.\n"
                f"Über diesen Link setzt du es selbst neu (gültig {RESET_MAIL_MINUTES} Minuten, nur einmal):\n\n"
                f"{link}\n\n"
                f"Anmelden kannst du dich danach mit deiner E-Mail-Adresse ({adresse})"
                f" oder mit deinem Benutzernamen „{nutzer['username']}“.\n\n"
                "Du hast nichts angefordert? Dann ignoriere diese Mail einfach –"
                " dein bisheriges Passwort bleibt gültig.")
        return mail.senden(adresse, "SKV Müritz Volleyball – neues Passwort", text)

    @app.post("/api/passwort-vergessen")
    def api_passwort_vergessen():
        """Öffentlich: Passwort-Hilfe anfordern.

        Hat das Konto eine E-Mail-Adresse, geht ein Einmal-Link per Mail raus.
        Sonst (oder wenn der Versand scheitert) wie bisher: Anfrage hinterlegen
        und Trainerteam per Push informieren. Antwortet immer neutral, damit
        weder Benutzernamen noch Adressen erraten werden können.
        """
        body = request.get_json(silent=True) or {}
        username = str(body.get("username") or "").strip()[:120]
        if not username:
            return err(400, "Bitte E-Mail-Adresse oder Benutzernamen angeben")
        nutzer = konto_finden(username)
        if nutzer is not None and reset_mail_senden(nutzer):
            return jsonify({"ok": True, "hint": PASSWORT_HINWEIS})
        jetzt = db.now()
        con().execute("DELETE FROM passwort_anfragen WHERE created_at < ?",
                      (jetzt - 7 * 86400,))
        # Anfrage unter dem Benutzernamen ablegen (auch wenn per E-Mail gesucht wurde),
        # damit das Trainerteam sie in den Portal-Zugängen dem Konto zuordnen kann
        anzeige = nutzer["username"] if nutzer is not None else username
        neulich = con().execute(
            "SELECT COUNT(*) AS n FROM passwort_anfragen"
            " WHERE lower(username) = lower(?) AND created_at > ?",
            (anzeige, jetzt - 3600)).fetchone()["n"]
        gesamt = con().execute(
            "SELECT COUNT(*) AS n FROM passwort_anfragen WHERE created_at > ?",
            (jetzt - 3600,)).fetchone()["n"]
        if neulich < 3 and gesamt < 30:
            con().execute(
                "INSERT INTO passwort_anfragen (username, created_at) VALUES (?, ?)",
                (anzeige, jetzt))
            con().commit()
            if nutzer is not None:
                trainer_ids = [r["id"] for r in con().execute(
                    "SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]
                import push
                push.senden(
                    con(), "🔑 Passwort-Hilfe angefragt",
                    f"„{anzeige}“ hat das Passwort vergessen – bitte in den Portal-Zugängen"
                    " einen Wiederherstellungscode erzeugen und weitergeben.",
                    "/#/zugaenge", trainer_ids)
        return jsonify({"ok": True, "hint": PASSWORT_HINWEIS})

    @app.post("/api/passwort-reset")
    def api_passwort_reset():
        """Öffentlich: Mit gültigem Wiederherstellungscode ein neues Passwort setzen."""
        # Brute-Force auf den Code drosseln (gleiche Sperre wie beim Login, IP-basiert)
        wait = rate_limited("reset")
        if wait:
            return err(429, f"Zu viele Versuche – bitte {wait} Sekunden warten")
        body = request.get_json(silent=True) or {}
        code = str(body.get("code") or "").strip().upper()
        password = str(body.get("password") or "")
        if not code or len(password) < 8:
            return err(400, "Code und neues Passwort (mind. 8 Zeichen) angeben")
        row = con().execute("SELECT * FROM reset_codes WHERE code_hash = ?",
                            (auth.hash_code(code),)).fetchone()
        if row is None or row["used_at"] or row["expires_at"] < db.now():
            log_login("reset", False)  # Fehlversuch zählt in die Drosselung
            return err(400, "Code ungültig oder abgelaufen – bitte neuen Code anfordern")
        nutzer = con().execute("SELECT * FROM users WHERE id = ? AND active = 1",
                               (row["user_id"],)).fetchone()
        if nutzer is None:
            return err(400, "Konto ist nicht verfügbar")
        with con() as c:
            c.execute("UPDATE users SET pw_hash = ?, email_verified = CASE WHEN ? THEN 1"
                      " ELSE email_verified END WHERE id = ?",
                      (auth.hash_password(password), 1 if row["created_by"] == "email" else 0,
                       nutzer["id"]))
            c.execute("UPDATE reset_codes SET used_at = ? WHERE id = ?",
                      (db.now(), row["id"]))
            c.execute("DELETE FROM sessions WHERE user_id = ?", (nutzer["id"],))
            c.execute("DELETE FROM passwort_anfragen WHERE lower(username) = lower(?)",
                      (nutzer["username"],))
        log_login("reset", True)
        return jsonify({"ok": True, "username": nutzer["username"],
                        "email": nutzer["email"] or "",
                        "hint": "Passwort geändert – jetzt anmelden"})

    @app.post("/api/accounts/<int:user_id>/active")
    def api_accounts_active(user_id: int):
        sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        aktiv = 1 if body.get("active") else 0
        if user_id == sess["user_id"] and not aktiv:
            return err(400, "Das eigene Konto kann nicht deaktiviert werden")
        ziel = con().execute("SELECT role, active FROM users WHERE id = ?", (user_id,)).fetchone()
        if ziel is None:
            return err(404, "Konto nicht gefunden")
        if ziel["role"] == "trainer" and not aktiv:
            rest = con().execute(
                "SELECT COUNT(*) AS n FROM users WHERE role = 'trainer' AND active = 1 AND id != ?",
                (user_id,)).fetchone()
            if rest["n"] < 1:
                return err(400, "Das letzte aktive Trainerkonto kann nicht deaktiviert werden")
        with con() as c:
            c.execute("UPDATE users SET active = ? WHERE id = ?", (aktiv, user_id))
            if not aktiv:
                c.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return jsonify({"ok": True})

    # ---------- PDF-Elternbrief (eine Datei pro Spieler:in, teilbar) ----------

    @app.post("/api/brief-pdf")
    def brief_pdf():
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        data = request.get_json(silent=True) or {}
        blocks = data.get("blocks")
        if not isinstance(blocks, list) or not blocks or len(blocks) > 3000:
            return err(400, "Ungültiger Briefinhalt")
        import pdf_brief
        try:
            inhalt = pdf_brief.erzeuge_pdf(blocks, str(data.get("fusszeile") or "")[:80])
        except Exception:
            return err(500, "PDF-Erzeugung fehlgeschlagen")
        name = re.sub(r"[^\w À-ſ.-]", "", str(data.get("filename") or "Elternbrief"))[:80] or "Elternbrief"
        resp = app.response_class(inhalt, mimetype="application/pdf")
        ascii_name = name.encode("ascii", "ignore").decode() or "Elternbrief"
        resp.headers["Content-Disposition"] = (
            f'attachment; filename="{ascii_name}.pdf"; '
            f"filename*=UTF-8''{urllib.parse.quote(name)}.pdf"
        )
        resp.headers["Cache-Control"] = "no-store"
        return resp

    # ---------- Statische App ----------

    SECURITY_HEADERS = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy": (
            "default-src 'self'; script-src 'self' 'unsafe-inline';"
            # blob: nötig: Foto-Uploads (Einverständnis, Profilbild, Kleidung) laden
            # die gewählte Datei per URL.createObjectURL() als <img> zum Verkleinern.
            " style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
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
        # API nie zwischenspeichern – außer Dokument-Dateien (unveränderlich je ID,
        # „private": nur im Browser des angemeldeten Nutzers, nie in Zwischenproxys)
        if request.path.startswith("/api/") and not re.fullmatch(r"/api/dokumente/\d+/datei", request.path):
            # Routen mit eigener Cache-Strategie (Portal-Paket mit ETag, Fotos
            # unveränderlich je Hash) behalten ihren Header
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.get("/")
    def index():
        return send_from_directory(APP_ROOT, "index.html")

    @app.get("/assets/<path:filename>")
    def assets(filename: str):
        return send_from_directory(os.path.join(APP_ROOT, "assets"), filename)

    @app.get("/manifest.webmanifest")
    def manifest():
        return send_from_directory(APP_ROOT, "manifest.webmanifest",
                                   mimetype="application/manifest+json")

    @app.get("/datenschutz")
    def datenschutz():
        return send_from_directory(os.path.join(os.path.dirname(__file__), "seiten"), "datenschutz.html")

    @app.get("/impressum")
    def impressum():
        return send_from_directory(os.path.join(os.path.dirname(__file__), "seiten"), "impressum.html")

    # Build-Hash über die ausgelieferten Dateien: jede Code-Änderung ergibt
    # eine neue Service-Worker-Version und erneuert damit die Offline-Caches.
    def _build_hash() -> str:
        import hashlib
        h = hashlib.sha1()
        pfade = [os.path.join(APP_ROOT, "index.html"), os.path.join(APP_ROOT, "sw.js")]
        for wurzel, _dirs, dateien in os.walk(os.path.join(APP_ROOT, "assets")):
            pfade.extend(os.path.join(wurzel, d) for d in sorted(dateien))
        for p in sorted(pfade):
            try:
                st = os.stat(p)
                h.update(f"{p}:{st.st_mtime_ns}:{st.st_size};".encode())
            except OSError:
                pass
        return h.hexdigest()[:12]

    sw_version = _build_hash()

    @app.get("/sw.js")
    def service_worker():
        with open(os.path.join(APP_ROOT, "sw.js"), encoding="utf-8") as f:
            quelle = f.read().replace("__VERSION__", sw_version)
        resp = app.response_class(quelle, mimetype="text/javascript")
        # Der Browser soll Updates sofort sehen – der SW selbst wird nie gecacht.
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.get("/bg<int:nr>")
    def wallpaper(nr: int):
        # Vereins-Hintergrundbilder: /bg1 Mac dunkel, /bg2 iPhone dunkel,
        # /bg3 Mac hell (Vereinsfarben), /bg4 iPhone hell (Vereinsfarben)
        if nr < 1 or nr > 4:
            return jsonify({"error": "Es gibt bg1 bis bg4."}), 404
        return send_from_directory(
            os.path.join(APP_ROOT, "assets", "wallpaper"), f"bg{nr}.png",
            mimetype="image/png", max_age=86400,
        )

    @app.get("/gesund")
    def health():
        con().execute("SELECT 1")
        return jsonify({"ok": True, "ts": db.now()})

    return app


if __name__ == "__main__":  # lokaler Testlauf
    create_app().run(host="127.0.0.1", port=8000, debug=False)
