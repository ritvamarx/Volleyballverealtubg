"""Passkeys (WebAuthn): Anmelden mit Face ID, Touch ID oder Fingerabdruck.

Nach einer normalen Anmeldung (Trainer: inklusive 2FA) wird ein Passkey
eingerichtet. Danach reicht am Anmeldebildschirm ein Tipp auf „Mit Face ID /
Fingerabdruck anmelden" – kein Benutzername, kein Passwort, für Trainer auch
kein Authenticator-Code mehr: Ein Passkey mit Nutzerverifikation ist Besitz
plus Biometrie/PIN und damit selbst zwei Faktoren. Passwort- und Code-Weg
bleiben unverändert bestehen.

Technik: py_webauthn, Resident Keys (discoverable) mit Pflicht zur
Nutzerverifikation, Challenges liegen 5 Minuten in der Tabelle
webauthn_challenges (gunicorn-tauglich, kein Prozess-Speicher).
"""
from __future__ import annotations

import json
import re

import webauthn
from flask import jsonify, request
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor,
                                      ResidentKeyRequirement, UserVerificationRequirement)

import db

CHALLENGE_SEK = 300
RP_NAME = "SKV Müritz Volleyball"


def register(app, con, require, start_session, err, rate_limited, log_login, tage_fuer):
    def rp_id() -> str:
        host = (request.host or "").split(":")[0].lower()
        return host if re.fullmatch(r"[a-z0-9.-]+", host) else "localhost"

    def origin() -> list:
        proto = request.headers.get("X-Forwarded-Proto", request.scheme)
        host = request.host or ""
        liste = [f"{proto}://{host}"]
        if rp_id() in ("localhost", "127.0.0.1"):
            liste.append(f"http://{host}")
        return liste

    def challenge_merken(challenge: bytes, art: str, user_id=None) -> None:
        jetzt = db.now()
        con().execute("DELETE FROM webauthn_challenges WHERE expires_at < ?", (jetzt,))
        con().execute(
            "INSERT INTO webauthn_challenges (challenge, user_id, art, created_at, expires_at)"
            " VALUES (?,?,?,?,?)",
            (bytes_to_base64url(challenge), user_id, art, jetzt, jetzt + CHALLENGE_SEK))
        con().commit()

    def challenge_einloesen(credential: dict, art: str):
        """Challenge aus clientDataJSON lesen, in der DB finden und einmalig verbrauchen."""
        try:
            cdj = json.loads(base64url_to_bytes(credential["response"]["clientDataJSON"]))
            ch = str(cdj.get("challenge") or "")
        except Exception:
            return None
        row = con().execute(
            "SELECT * FROM webauthn_challenges WHERE challenge = ? AND art = ?", (ch, art)).fetchone()
        if row is None:
            return None
        con().execute("DELETE FROM webauthn_challenges WHERE challenge = ?", (ch,))
        con().commit()
        if row["expires_at"] < db.now():
            return None
        return row

    def eigene(user_id: int) -> list:
        return con().execute(
            "SELECT id, cred_id, geraet, created_at, last_used FROM passkeys WHERE user_id = ?"
            " ORDER BY created_at", (user_id,)).fetchall()

    def liste_json(user_id: int) -> dict:
        return {"passkeys": [{"id": r["id"], "geraet": r["geraet"], "seit": r["created_at"],
                              "zuletzt": r["last_used"]} for r in eigene(user_id)]}

    # ---------- Einrichten (angemeldet) ----------

    @app.get("/api/passkey/liste")
    def api_passkey_liste():
        sess, failure = require()
        if failure:
            return failure
        return jsonify(dict(liste_json(sess["user_id"]), erlaubt=True))

    @app.post("/api/passkey/register/start")
    def api_passkey_register_start():
        sess, failure = require()
        if failure:
            return failure
        if len(eigene(sess["user_id"])) >= 10:
            return err(400, "Zu viele Passkeys – bitte zuerst einen entfernen")
        nutzer = con().execute("SELECT username, name, email FROM users WHERE id = ?",
                               (sess["user_id"],)).fetchone()
        opts = webauthn.generate_registration_options(
            rp_id=rp_id(), rp_name=RP_NAME,
            user_id=f"skv-{sess['user_id']}".encode(),
            user_name=nutzer["email"] or nutzer["username"],
            user_display_name=nutzer["name"] or nutzer["username"],
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED),
            exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(r["cred_id"]))
                                 for r in eigene(sess["user_id"])],
            timeout=120000,
        )
        challenge_merken(opts.challenge, "reg", sess["user_id"])
        return app.response_class(webauthn.options_to_json(opts), mimetype="application/json")

    @app.post("/api/passkey/register/finish")
    def api_passkey_register_finish():
        sess, failure = require()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        credential = body.get("credential") or {}
        geraet = str(body.get("geraet") or "")[:60].strip() or "Gerät"
        row = challenge_einloesen(credential, "reg")
        if row is None or row["user_id"] != sess["user_id"]:
            return err(400, "Einrichtung abgelaufen – bitte noch einmal starten")
        try:
            v = webauthn.verify_registration_response(
                credential=credential, expected_challenge=base64url_to_bytes(row["challenge"]),
                expected_rp_id=rp_id(), expected_origin=origin(), require_user_verification=True)
        except Exception as e:  # noqa: BLE001 – Details gehören ins Log, nicht zum Nutzer
            app.logger.warning("Passkey-Registrierung fehlgeschlagen: %s", e)
            return err(400, "Der Passkey konnte nicht geprüft werden")
        cred_id = bytes_to_base64url(v.credential_id)
        if con().execute("SELECT 1 FROM passkeys WHERE cred_id = ?", (cred_id,)).fetchone():
            return err(400, "Dieser Passkey ist bereits eingerichtet")
        transports = credential.get("response", {}).get("transports") or []
        con().execute(
            "INSERT INTO passkeys (user_id, cred_id, public_key, sign_count, transports, geraet, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (sess["user_id"], cred_id, v.credential_public_key, v.sign_count,
             json.dumps(transports)[:200], geraet, db.now()))
        con().commit()
        return jsonify(dict(liste_json(sess["user_id"]), ok=True))

    @app.post("/api/passkey/loeschen")
    def api_passkey_loeschen():
        sess, failure = require()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        con().execute("DELETE FROM passkeys WHERE id = ? AND user_id = ?",
                      (int(body.get("id") or 0), sess["user_id"]))
        con().commit()
        return jsonify(dict(liste_json(sess["user_id"]), ok=True))

    def pruefen(credential: dict, user_id: int) -> bool:
        """Passkey-Bestätigung eines angemeldeten Kontos (z. B. digitale Einwilligung)."""
        row = challenge_einloesen(credential or {}, "login")
        if row is None:
            return False
        pk = con().execute("SELECT * FROM passkeys WHERE cred_id = ? AND user_id = ?",
                           (str(credential.get("id") or ""), user_id)).fetchone()
        if pk is None:
            return False
        try:
            v = webauthn.verify_authentication_response(
                credential=credential, expected_challenge=base64url_to_bytes(row["challenge"]),
                expected_rp_id=rp_id(), expected_origin=origin(),
                credential_public_key=pk["public_key"],
                credential_current_sign_count=pk["sign_count"], require_user_verification=True)
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Passkey-Bestätigung fehlgeschlagen: %s", e)
            return False
        con().execute("UPDATE passkeys SET sign_count = ?, last_used = ? WHERE id = ?",
                      (v.new_sign_count, db.now(), pk["id"]))
        con().commit()
        return True
    app.passkey_pruefen = pruefen

    # ---------- Anmelden (öffentlich) ----------

    @app.post("/api/passkey/login/start")
    def api_passkey_login_start():
        wait = rate_limited("passkey")
        if wait:
            return err(429, f"Zu viele Versuche – bitte {wait} Sekunden warten")
        opts = webauthn.generate_authentication_options(
            rp_id=rp_id(), user_verification=UserVerificationRequirement.REQUIRED, timeout=120000)
        challenge_merken(opts.challenge, "login")
        return app.response_class(webauthn.options_to_json(opts), mimetype="application/json")

    @app.post("/api/passkey/login/finish")
    def api_passkey_login_finish():
        wait = rate_limited("passkey")
        if wait:
            return err(429, f"Zu viele Versuche – bitte {wait} Sekunden warten")
        body = request.get_json(silent=True) or {}
        credential = body.get("credential") or {}
        row = challenge_einloesen(credential, "login")
        if row is None:
            log_login("passkey", False)
            return err(400, "Anmeldung abgelaufen – bitte noch einmal tippen")
        pk = con().execute(
            "SELECT p.*, u.active, u.role FROM passkeys p JOIN users u ON u.id = p.user_id"
            " WHERE p.cred_id = ?", (str(credential.get("id") or ""),)).fetchone()
        if pk is None or not pk["active"]:
            log_login("passkey", False)
            return err(401, "Dieser Passkey ist hier nicht (mehr) eingerichtet – bitte mit Passwort anmelden")
        try:
            v = webauthn.verify_authentication_response(
                credential=credential, expected_challenge=base64url_to_bytes(row["challenge"]),
                expected_rp_id=rp_id(), expected_origin=origin(),
                credential_public_key=pk["public_key"],
                credential_current_sign_count=pk["sign_count"], require_user_verification=True)
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Passkey-Anmeldung fehlgeschlagen: %s", e)
            log_login("passkey", False)
            return err(401, "Passkey konnte nicht geprüft werden – bitte mit Passwort anmelden")
        con().execute("UPDATE passkeys SET sign_count = ?, last_used = ? WHERE id = ?",
                      (v.new_sign_count, db.now(), pk["id"]))
        con().commit()
        user = con().execute("SELECT * FROM users WHERE id = ?", (pk["user_id"],)).fetchone()
        log_login(user["username"], True)
        resp = jsonify({})
        # Passkey = Besitz + Nutzerverifikation → auch für Trainer direkt volle Sitzung (kein TOTP)
        start_session(resp, user["id"], pre_2fa=False, tage=tage_fuer(user["role"]))
        resp.set_data(db.to_json({"need": None, "user": {
            "username": user["username"], "name": user["name"], "role": user["role"]}}))
        return resp
