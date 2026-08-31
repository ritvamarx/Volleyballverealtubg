"""Web-Push für das Spieler-/Eltern-Portal (Phase 4).

Muster wie die WerkHausApp: VAPID + pywebpush, Abos je Gerät in der
Tabelle push_abos, abgelaufene Abos (404/410) werden automatisch gelöscht.
Die VAPID-Schlüssel werden beim ersten Start erzeugt und im data-Ordner
(data/vapid.json) abgelegt – kein manueller Einrichtungsschritt nötig.
"""
from __future__ import annotations

import json
import os

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid, b64urlencode
from pywebpush import WebPushException, webpush

import db

VAPID_PFAD = os.path.join(db.DATA_DIR, "vapid.json")
ABSENDER = "mailto:info@skv-mueritz.de"

_schluessel = None


def _lade_schluessel() -> dict:
    """Privaten/öffentlichen VAPID-Schlüssel laden, beim ersten Mal erzeugen."""
    global _schluessel
    if _schluessel:
        return _schluessel
    if os.path.exists(VAPID_PFAD):
        with open(VAPID_PFAD, encoding="utf-8") as f:
            _schluessel = json.load(f)
        return _schluessel
    v = Vapid()
    v.generate_keys()
    raw_pub = v.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    priv_num = v.private_key.private_numbers().private_value
    _schluessel = {
        "public": b64urlencode(raw_pub),
        "private": b64urlencode(priv_num.to_bytes(32, "big")),
    }
    os.makedirs(db.DATA_DIR, exist_ok=True)
    with open(VAPID_PFAD, "w", encoding="utf-8") as f:
        json.dump(_schluessel, f)
    os.chmod(VAPID_PFAD, 0o600)
    return _schluessel


def public_key() -> str:
    return _lade_schluessel()["public"]


def _kategorie_erlaubt(prefs_json, kategorie: str) -> bool:
    """Ob ein Konto Push dieser Kategorie erhalten möchte. Standard: an (Opt-out)."""
    schluessel = {"allgemein": "pushAllgemein", "teilnahme": "pushTeilnahme"}.get(kategorie)
    if not schluessel:
        return True  # unbekannte/leere Kategorie → immer senden
    try:
        prefs = json.loads(prefs_json or "{}")
    except Exception:
        prefs = {}
    return prefs.get(schluessel, True)


def senden(con, titel: str, text: str, url: str = "/", user_ids: list | None = None,
           kategorie: str | None = None) -> dict:
    """Push an alle Abos (oder nur an die der angegebenen Konten) schicken.

    ``kategorie`` ("allgemein" | "teilnahme" | None): filtert die Empfänger nach
    ihren Benachrichtigungs-Einstellungen (notify_prefs). None = immer senden
    (z. B. Probe-Push). Rückgabe: {"ok": n, "weg": n} – weg = gelöschte Abos.
    """
    schl = _lade_schluessel()
    # Bei gesetzter Kategorie zuerst die Konten aussortieren, die diese Art
    # Mitteilung abbestellt haben.
    if kategorie:
        if user_ids is not None:
            if not user_ids:
                return {"ok": 0, "weg": 0}
            platzhalter = ",".join("?" * len(user_ids))
            rows = con.execute(
                f"SELECT id, notify_prefs FROM users WHERE id IN ({platzhalter})",
                list(user_ids)).fetchall()
        else:
            rows = con.execute("SELECT id, notify_prefs FROM users").fetchall()
        user_ids = [r["id"] for r in rows if _kategorie_erlaubt(r["notify_prefs"], kategorie)]
        if not user_ids:
            return {"ok": 0, "weg": 0}
    if user_ids is not None:
        if not user_ids:
            return {"ok": 0, "weg": 0}
        platzhalter = ",".join("?" * len(user_ids))
        abos = con.execute(
            f"SELECT id, endpoint, daten FROM push_abos WHERE user_id IN ({platzhalter})",
            list(user_ids)).fetchall()
    else:
        abos = con.execute("SELECT id, endpoint, daten FROM push_abos").fetchall()
    nutzlast = json.dumps({"titel": titel, "text": text, "url": url}, ensure_ascii=False)
    ok = weg = 0
    for abo in abos:
        try:
            webpush(
                subscription_info=json.loads(abo["daten"]),
                data=nutzlast,
                vapid_private_key=schl["private"],
                vapid_claims={"sub": ABSENDER},
                ttl=86400,
            )
            ok += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (400, 404, 410):
                con.execute("DELETE FROM push_abos WHERE id = ?", (abo["id"],))
                weg += 1
        except Exception:
            pass  # einzelnes kaputtes Abo darf den Rest nicht stoppen
    con.commit()
    return {"ok": ok, "weg": weg}
