"""Dokumentenablage mit Freigabe (Trainer laden hoch, Portal sieht Freigegebenes).

Dateien liegen einzeln auf der Platte unter data/dokumente/<token>.<ext>,
die Datenbank hält nur Name, Ordner, Freigabe, Größe und Datum. So bleibt das
App-Datenpaket (app_state) klein und eine Datei wird erst beim Antippen
geladen – und danach vom Gerät zwischengespeichert (Cache-Control private).

Freigabe: "trainer" (nur Trainerteam) | "spieler" | "eltern" | "alle"
(Spieler:innen und Eltern). Zugriff auf die Datei wird je Anfrage geprüft.
"""
from __future__ import annotations

import json
import os
import re
import secrets

from flask import jsonify, request, send_file

import db

DOK_DIR = os.path.join(db.DATA_DIR, "dokumente")
DOK_MAX_BYTES = 20 * 1024 * 1024
FREIGABEN = ("trainer", "spieler", "eltern", "alle")
# Erlaubte Dateitypen: Endung → MIME-Typ (nur das, was sich gefahrlos ausliefern lässt)
TYPEN = {
    "pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "gif": "image/gif", "heic": "image/heic",
    "txt": "text/plain", "csv": "text/csv", "ics": "text/calendar", "md": "text/plain",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "odt": "application/vnd.oasis.opendocument.text",
    "ods": "application/vnd.oasis.opendocument.spreadsheet",
    "zip": "application/zip",
}
INLINE = {"pdf", "png", "jpg", "jpeg", "webp", "gif", "txt"}  # im Browser anzeigen statt herunterladen


def sichtbar_fuer(rolle: str):
    """SQL-Bedingung + Parameter: welche Freigaben diese Rolle sehen darf (normale Ablage)."""
    if rolle == "trainer":
        return "art = ''", ()
    return "art = '' AND freigabe IN (?, 'alle')", (rolle,)


def sauberer_name(roh: str, fallback: str = "Dokument") -> str:
    return re.sub(r"[\\/:*?\"<>|\r\n\t]+", " ", str(roh or "")).strip()[:140] or fallback


def datei_ablegen(con, quelle, name: str, ordner: str, freigabe: str, von: str,
                  player_id: str = "", art: str = ""):
    """Datei (Stream oder bytes) unter data/dokumente ablegen und Zeile anlegen.

    Rückgabe: (zeile, fehler) – fehler = (status, meldung) bei Ablehnung.
    """
    os.makedirs(DOK_DIR, exist_ok=True)
    name = sauberer_name(name)
    endung = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if endung not in TYPEN:
        return None, (400, f"Dateityp .{endung or '?'} wird nicht unterstützt (erlaubt: "
                           + ", ".join(sorted(TYPEN)) + ")")
    if freigabe not in FREIGABEN:
        return None, (400, "Ungültige Freigabe")
    token = secrets.token_hex(16)
    datei = f"{token}.{endung}"
    ziel = os.path.join(DOK_DIR, datei)
    groesse = 0
    lesen = (lambda: quelle.read(1024 * 1024)) if hasattr(quelle, "read") else None
    with open(ziel, "wb") as out:
        if lesen is None:
            groesse = len(quelle)
            if groesse > DOK_MAX_BYTES:
                out.close(); os.remove(ziel)
                return None, (413, f"Datei zu groß (max. {DOK_MAX_BYTES // (1024 * 1024)} MB)")
            out.write(quelle)
        else:
            while True:
                block = lesen()
                if not block:
                    break
                groesse += len(block)
                if groesse > DOK_MAX_BYTES:
                    out.close(); os.remove(ziel)
                    return None, (413, f"Datei zu groß (max. {DOK_MAX_BYTES // (1024 * 1024)} MB)")
                out.write(block)
    if groesse == 0:
        os.remove(ziel)
        return None, (400, "Die Datei ist leer")
    jetzt = db.now()
    cur = con.execute(
        "INSERT INTO dokumente (name, datei, endung, mime, groesse, ordner, freigabe, beschreibung,"
        " hochgeladen_von, created_at, updated_at, player_id, art) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (name, datei, endung, TYPEN[endung], groesse, (ordner or "Allgemein")[:60], freigabe, "",
         (von or "")[:80], jetzt, jetzt, (player_id or "")[:60], (art or "")[:30]))
    con.commit()
    return con.execute("SELECT * FROM dokumente WHERE id = ?", (cur.lastrowid,)).fetchone(), None


def datei_loeschen(con, dok_id: int) -> bool:
    r = con.execute("SELECT * FROM dokumente WHERE id = ?", (dok_id,)).fetchone()
    if r is None:
        return False
    con.execute("DELETE FROM dokumente WHERE id = ?", (dok_id,))
    con.commit()
    try:
        os.remove(os.path.join(DOK_DIR, r["datei"]))
    except OSError:
        pass
    return True


def register(app, con, require, err, push_modul=None):
    os.makedirs(DOK_DIR, exist_ok=True)

    def zeile(r) -> dict:
        return {"id": r["id"], "name": r["name"], "ordner": r["ordner"], "freigabe": r["freigabe"],
                "beschreibung": r["beschreibung"], "groesse": r["groesse"], "endung": r["endung"],
                "von": r["hochgeladen_von"], "seit": r["created_at"], "geaendert": r["updated_at"],
                "inline": r["endung"] in INLINE, "playerId": r["player_id"], "art": r["art"]}

    def liste(rolle: str) -> list:
        bed, par = sichtbar_fuer(rolle)
        rows = con().execute(
            f"SELECT * FROM dokumente WHERE {bed} ORDER BY ordner COLLATE NOCASE, created_at DESC",
            par).fetchall()
        return [zeile(r) for r in rows]

    def pfad_von(r) -> str:
        return os.path.join(DOK_DIR, r["datei"])

    def eigene_player_ids(sess) -> set:
        try:
            return {str(i) for i in json.loads(sess["player_ids"] or "[]")}
        except Exception:
            return set()

    def darf_lesen(sess, r) -> bool:
        if sess["role"] == "trainer":
            return True
        if r["art"] == "einverstaendnis":
            # Eigener Beleg (z. B. Nachweis der digitalen Einwilligung) – nur Elternkonto
            return sess["role"] == "eltern" and r["player_id"] in eigene_player_ids(sess)
        return r["freigabe"] in (sess["role"], "alle")

    @app.get("/api/dokumente")
    def api_dokumente():
        sess, failure = require()
        if failure:
            return failure
        return jsonify({"dokumente": liste(sess["role"]),
                        "maxBytes": DOK_MAX_BYTES, "typen": sorted(TYPEN)})

    @app.post("/api/dokumente")
    def api_dokumente_hochladen():
        sess, failure = require(role="trainer")
        if failure:
            return failure
        f = request.files.get("datei")
        if f is None or not f.filename:
            return err(400, "Bitte eine Datei auswählen")
        name = f.filename
        ordner = str(request.form.get("ordner") or "Allgemein").strip()[:60] or "Allgemein"
        freigabe = str(request.form.get("freigabe") or "trainer")
        beschreibung = str(request.form.get("beschreibung") or "").strip()[:300]
        art = "einverstaendnis" if request.form.get("art") == "einverstaendnis" else ""
        player_id = str(request.form.get("playerId") or "").strip()[:60] if art else ""
        if art:
            freigabe = "trainer"  # Belege sind nie für das Portal freigegeben
            ordner = "Einverständnis"
        neu, fehler = datei_ablegen(con(), f.stream, name, ordner, freigabe, sess["name"],
                                    player_id=player_id, art=art)
        if fehler:
            return err(*fehler)
        name = neu["name"]
        if beschreibung:
            con().execute("UPDATE dokumente SET beschreibung = ? WHERE id = ?", (beschreibung, neu["id"]))
            con().commit()
            neu = con().execute("SELECT * FROM dokumente WHERE id = ?", (neu["id"],)).fetchone()
        benachrichtigt = 0
        if request.form.get("push") in ("1", "true", "on") and freigabe != "trainer" and not art and push_modul:
            rollen = ("spieler", "eltern") if freigabe == "alle" else (freigabe,)
            platz = ",".join("?" * len(rollen))
            ids = [r["id"] for r in con().execute(
                f"SELECT id FROM users WHERE active = 1 AND role IN ({platz})", rollen).fetchall()]
            try:
                benachrichtigt = push_modul.senden(
                    con(), "📁 Neues Dokument", f"{name} – {ordner}", "/#dokumente", ids,
                    kategorie="allgemein")["ok"]
            except Exception:  # noqa: BLE001 – Push darf den Upload nicht scheitern lassen
                benachrichtigt = 0
        return jsonify({"ok": True, "dokument": zeile(neu), "benachrichtigt": benachrichtigt,
                        "dokumente": liste("trainer")})

    @app.post("/api/dokumente/<int:dok_id>")
    def api_dokumente_bearbeiten(dok_id: int):
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        r = con().execute("SELECT * FROM dokumente WHERE id = ?", (dok_id,)).fetchone()
        if r is None:
            return err(404, "Dokument nicht gefunden")
        body = request.get_json(silent=True) or {}
        name = re.sub(r"[\\/:*?\"<>|\r\n\t]+", " ", str(body.get("name") or r["name"])).strip()[:140] or r["name"]
        if not name.lower().endswith("." + r["endung"]):
            name = f"{name}.{r['endung']}"
        ordner = str(body.get("ordner") or r["ordner"]).strip()[:60] or r["ordner"]
        freigabe = str(body.get("freigabe") or r["freigabe"])
        if freigabe not in FREIGABEN:
            return err(400, "Ungültige Freigabe")
        beschreibung = str(body.get("beschreibung") if body.get("beschreibung") is not None
                           else r["beschreibung"]).strip()[:300]
        con().execute(
            "UPDATE dokumente SET name = ?, ordner = ?, freigabe = ?, beschreibung = ?, updated_at = ?"
            " WHERE id = ?", (name, ordner, freigabe, beschreibung, db.now(), dok_id))
        con().commit()
        return jsonify({"ok": True, "dokumente": liste("trainer")})

    @app.delete("/api/dokumente/<int:dok_id>")
    def api_dokumente_loeschen(dok_id: int):
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        if not datei_loeschen(con(), dok_id):
            return err(404, "Dokument nicht gefunden")
        return jsonify({"ok": True, "dokumente": liste("trainer")})

    @app.get("/api/dokumente/<int:dok_id>/datei")
    def api_dokumente_datei(dok_id: int):
        sess, failure = require(csrf=False)
        if failure:
            return failure
        r = con().execute("SELECT * FROM dokumente WHERE id = ?", (dok_id,)).fetchone()
        if r is None or not darf_lesen(sess, r):
            return err(404, "Dokument nicht gefunden oder nicht freigegeben")
        pfad = pfad_von(r)
        if not os.path.isfile(pfad):
            return err(410, "Die Datei liegt nicht mehr auf dem Server")
        anhang = request.args.get("download") == "1" or r["endung"] not in INLINE
        resp = send_file(pfad, mimetype=r["mime"], as_attachment=anhang, download_name=r["name"],
                         conditional=True, max_age=0)
        resp.headers["Cache-Control"] = "private, max-age=31536000"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp
