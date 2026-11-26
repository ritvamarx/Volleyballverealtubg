"""Einwilligungen je Spieler:in und Vorlage (Einverständniserklärungen).

Datenmodell im App-Datenbestand (app_state):
  consentTemplates[]  Vorlagen: {id, name, text, required, gueltigkeit: "unbefristet"|"saison",
                      schutz: ""|"foto"}  – „foto" steuert, ob Profilfotos im Portal gezeigt werden
  consents[]          Belege (Uploads/Papier/digital): {id, playerId, fileName, dokumentId, signedBy,
                      uploadedAt, quelle: "papier"|"portal"|"digital"|"trainer", gesichtet: bool,
                      bestaetigung?: {...}}  – kein Base64 mehr, Datei liegt in data/dokumente
  einwilligungen[]    je Erklärung: {id, playerId, vorlageId, status: "ja"|"nein", datum, saison,
                      quelle, belegId, erfasstVon, erfasstAm, widerrufenAm?}
  players[].consentOnFile  bleibt als abgeleitetes Feld erhalten (alle Pflicht-Erklärungen erfasst).

Dieses Modul rechnet den Status (auch für das Portal), nimmt Portal-Uploads als
Datei entgegen, verarbeitet die digitale Bestätigung (Passwort oder Passkey) mit
PDF-Nachweis und verschickt Erinnerungen per Push.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import time

from flask import jsonify, request

import db
import dokumente

MIME_ENDUNG = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
               "image/webp": "webp", "image/heic": "heic"}


# ---------- Status-Berechnung (reine Funktionen auf dem Datenbestand) ----------

def saison_jahr(daten) -> int:
    try:
        return int((daten.get("season") or {}).get("year") or 0) or time.localtime().tm_year
    except (TypeError, ValueError):
        return time.localtime().tm_year


def vorlagen(daten) -> list:
    return [t for t in daten.get("consentTemplates", []) if isinstance(t, dict) and t.get("id")]


def _aktuell(eintraege, vorlage, saison):
    """Neuester Eintrag zur Vorlage und daraus abgeleiteter Status."""
    kand = [e for e in eintraege if e.get("vorlageId") == vorlage["id"]]
    if not kand:
        return None, "offen"
    e = max(kand, key=lambda x: (str(x.get("datum") or ""), str(x.get("erfasstAm") or "")))
    if e.get("widerrufenAm"):
        return e, "nein"
    if vorlage.get("gueltigkeit") == "saison":
        try:
            if int(e.get("saison") or 0) != saison:
                return e, "abgelaufen"
        except (TypeError, ValueError):
            return e, "abgelaufen"
    return e, (e.get("status") if e.get("status") in ("ja", "nein") else "offen")


def status(daten, pid) -> dict:
    saison = saison_jahr(daten)
    eigene = [e for e in daten.get("einwilligungen", []) if isinstance(e, dict) and e.get("playerId") == pid]
    belege = [c for c in daten.get("consents", []) if isinstance(c, dict) and c.get("playerId") == pid]
    liste = []
    for t in vorlagen(daten):
        e, st = _aktuell(eigene, t, saison)
        liste.append({"id": t["id"], "name": t.get("name") or "", "required": bool(t.get("required")),
                      "schutz": t.get("schutz") or "", "status": st,
                      "datum": (e or {}).get("datum"), "quelle": (e or {}).get("quelle"),
                      "widerrufenAm": (e or {}).get("widerrufenAm")})
    offen = [v["id"] for v in liste if v["required"] and v["status"] in ("offen", "abgelaufen")]
    foto_v = [v for v in liste if v["schutz"] == "foto"]
    letzter = max(belege, key=lambda c: str(c.get("uploadedAt") or ""), default=None)
    return {
        "vollstaendig": not offen,
        "offen": offen,
        "eingereicht": any(c.get("gesichtet") is False for c in belege),
        "vorlagen": liste,
        "foto": (None if not foto_v else all(v["status"] == "ja" for v in foto_v)),
        "beleg": ({"id": letzter.get("id"), "fileName": letzter.get("fileName"),
                   "uploadedAt": letzter.get("uploadedAt"), "quelle": letzter.get("quelle") or "trainer",
                   "gesichtet": letzter.get("gesichtet") is not False,
                   "dokumentId": letzter.get("dokumentId")} if letzter else None),
    }


def foto_erlaubt(daten, pid) -> bool:
    """Profilfoto darf anderen gezeigt werden? Ohne Foto-Vorlage: ja (wie bisher)."""
    return status(daten, pid)["foto"] is not False


def flags_aktualisieren(daten) -> None:
    """players[].consentOnFile aus den Einwilligungen ableiten (Altfeld bleibt gültig)."""
    for p in daten.get("players", []):
        if isinstance(p, dict) and p.get("id"):
            p["consentOnFile"] = status(daten, p["id"])["vollstaendig"]


def _text_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:12]


# ---------- Routen ----------

def register(app, con, require, require_portal, err, h):
    """h: Hilfsfunktionen aus app.py – sess_player_ids, eigene_spieler,
    speichere_portal_aenderung, lade_state, neue_id, iso_jetzt, client_ip, push, auth, pdf_brief."""

    def eltern_only():
        sess, failure = require_portal()
        if failure:
            return None, failure
        if sess["role"] != "eltern":
            return None, err(403, "Einverständniserklärungen können nur über das Elternkonto abgegeben werden")
        return sess, None

    def trainer_push(con_, titel, text, url):
        ids = [r["id"] for r in con_.execute(
            "SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]
        try:
            h["push"].senden(con_, titel, text, url, ids, kategorie="allgemein")
        except Exception:  # noqa: BLE001
            pass

    # ----- Portal: unterschriebenes Formular hochladen (Datei, nur Eltern) -----
    @app.post("/api/portal/einverstaendnis")
    def api_portal_einverstaendnis():
        sess, failure = eltern_only()
        if failure:
            return failure
        f = request.files.get("datei")
        if f is not None and f.filename:
            pid = str(request.form.get("playerId") or "").strip()
            unterschrieben = str(request.form.get("unterschriebenVon") or "").strip()[:80]
            art_text = str(request.form.get("art") or "").strip()[:80]
            quelle_datei, name = f.stream, f.filename
        else:
            # Alter Weg (JSON mit dataUrl) – Übergangsweise weiter annehmen
            body = request.get_json(silent=True) or {}
            pid = str(body.get("playerId") or "").strip()
            unterschrieben = str(body.get("unterschriebenVon") or "").strip()[:80]
            art_text = ""
            data_url = str(body.get("dataUrl") or "")
            m = re.match(r"^data:([a-z]+/[a-z0-9.+-]+);base64,(.*)$", data_url, re.S)
            if not m or m.group(1) not in MIME_ENDUNG:
                return err(400, "Bitte eine PDF- oder Bilddatei hochladen")
            try:
                quelle_datei = base64.b64decode(m.group(2))
            except Exception:
                return err(400, "Datei konnte nicht gelesen werden")
            name = str(body.get("fileName") or "einverstaendnis")[:120]
            if "." not in name:
                name += "." + MIME_ENDUNG[m.group(1)]
        if pid not in h["sess_player_ids"](sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        _v, daten = h["lade_state"]()
        sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None)
        if sp is None:
            return err(404, "Spieler:in nicht gefunden")
        zeile, fehler = dokumente.datei_ablegen(con(), quelle_datei, name, "Einverständnis", "trainer",
                                                sess["name"], player_id=pid, art="einverstaendnis")
        if fehler:
            return err(*fehler)
        alte_dateien = []

        def mut(d):
            liste = []
            for c in d.get("consents", []):
                if c.get("playerId") == pid and c.get("quelle") == "portal" and c.get("gesichtet") is False:
                    if c.get("dokumentId"):
                        alte_dateien.append(c["dokumentId"])  # noch ungesichteter Vorgänger wird ersetzt
                    continue
                liste.append(c)
            liste.append({"id": h["neue_id"]("co"), "playerId": pid,
                          "type": (art_text or "Sammel-Einverständniserklärung") + " (Portal-Upload)",
                          "fileName": zeile["name"], "dokumentId": zeile["id"],
                          "signedBy": unterschrieben or sess["name"], "uploadedAt": h["iso_jetzt"](),
                          "quelle": "portal", "gesichtet": False})
            d["consents"] = liste

        if h["speichere_portal_aenderung"](mut, f"{sess['name']} (Portal)") is None:
            dokumente.datei_loeschen(con(), zeile["id"])
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        for alt in alte_dateien:
            dokumente.datei_loeschen(con(), alt)
        name_sp = f"{sp.get('firstName', '')} {sp.get('lastName', '')}".strip()
        trainer_push(con(), "📝 Einverständnis eingereicht",
                     f"{name_sp}: unterschriebenes Formular im Portal hochgeladen – bitte sichten.",
                     "/#/consents")
        return jsonify({"ok": True, "status": status(daten, pid)})

    # ----- Portal: digitale Bestätigung (Eltern kreuzen an, bestätigen mit Passwort/Passkey) -----
    @app.post("/api/portal/einwilligung")
    def api_portal_einwilligung():
        sess, failure = eltern_only()
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        pid = str(body.get("playerId") or "").strip()
        antworten = body.get("antworten") if isinstance(body.get("antworten"), dict) else {}
        unterschrieben = str(body.get("unterschriebenVon") or "").strip()[:80]
        best = body.get("bestaetigung") if isinstance(body.get("bestaetigung"), dict) else {}
        if pid not in h["sess_player_ids"](sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        if not unterschrieben:
            return err(400, "Bitte den Namen der erklärenden Person angeben")
        nutzer = con().execute("SELECT * FROM users WHERE id = ?", (sess["user_id"],)).fetchone()
        art = str(best.get("art") or "")
        if art == "passwort":
            if not h["auth"].verify_password(str(best.get("passwort") or ""), nutzer["pw_hash"]):
                h["log_login"](nutzer["username"], False)
                return err(401, "Passwort falsch – die Bestätigung wurde nicht gespeichert")
        elif art == "passkey":
            pruefen = getattr(app, "passkey_pruefen", None)
            if pruefen is None or not pruefen(best.get("credential") or {}, sess["user_id"]):
                return err(401, "Passkey-Bestätigung fehlgeschlagen – bitte erneut versuchen")
        else:
            return err(400, "Bestätigung mit Passwort oder Passkey nötig")
        _v, daten = h["lade_state"]()
        sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None)
        if sp is None:
            return err(404, "Spieler:in nicht gefunden")
        vl = vorlagen(daten)
        if not vl:
            return err(400, "Es sind keine Erklärungen hinterlegt")
        gewaehlt = []
        for t in vl:
            a = antworten.get(t["id"])
            if a in ("ja", "nein"):
                gewaehlt.append((t, a))
            elif t.get("required"):
                return err(400, f"Bitte zu „{t.get('name')}“ zustimmen oder ablehnen")
        if not gewaehlt:
            return err(400, "Keine Erklärung beantwortet")
        heute = time.strftime("%Y-%m-%d")
        jetzt = h["iso_jetzt"]()
        saison = saison_jahr(daten)
        name_sp = f"{sp.get('firstName', '')} {sp.get('lastName', '')}".strip()
        ip = h["client_ip"]()
        verfahren = "Passkey (Face ID / Touch ID / Fingerabdruck)" if art == "passkey" else "Passwort"
        # PDF-Nachweis
        B = [{"art": "h1c", "runs": [{"t": "Einwilligungserklärung – digital abgegeben"}]},
             {"art": "subc", "runs": [{"t": f"SKV Müritz · Abteilung Volleyball · Saison {saison}/{str(saison + 1)[2:]}"}]},
             {"art": "h2box", "runs": [{"t": "Angaben"}]},
             {"art": "p", "runs": [{"t": "Spieler:in: "}, {"t": name_sp, "b": True},
                                   {"t": (f"   Geburtsdatum: {sp.get('birthDate')}" if sp.get("birthDate") else "")}]},
             {"art": "p", "runs": [{"t": "Erklärende Person (Erziehungsberechtigte/r): "}, {"t": unterschrieben, "b": True}]},
             {"art": "p", "runs": [{"t": "Abgegeben über das Elternkonto: "}, {"t": f"{nutzer['name']} ({nutzer['username']})", "b": True}]},
             {"art": "p", "runs": [{"t": f"Zeitpunkt: {jetzt} (UTC)   Verfahren: {verfahren}   IP: {ip}"}]},
             {"art": "leer"},
             {"art": "p", "runs": [{"t": "Zu den folgenden Erklärungen wurde Stellung genommen:", "b": True}]}]
        for i, (t, a) in enumerate(gewaehlt, 1):
            B.append({"art": "sec", "titel": f"{i}. {t.get('name')}", "text": t.get("text") or "", "ankreuz": False})
            B.append({"art": "p", "runs": [{"t": ("[X] Zustimmung erteilt" if a == "ja" else "[ ] Zustimmung NICHT erteilt"), "b": True}]})
        B.append({"art": "leer"})
        B.append({"art": "kasten", "runs": [{"t": "Diese Erklärung wurde elektronisch im Elternportal der Vereins-App abgegeben und mit "
                                                  f"{verfahren} bestätigt. Jede Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die "
                                                  "Zukunft formlos beim Trainerteam widerrufen werden. Verantwortlich: SKV Müritz e. V., "
                                                  "Abteilung Volleyball (Kontakt siehe Impressum der Vereins-App)."}]})
        try:
            pdf = h["pdf_brief"].erzeuge_pdf(B, f"{name_sp} · digitale Einwilligung")
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Einwilligungs-PDF fehlgeschlagen: %s", e)
            return err(500, "Nachweis-PDF konnte nicht erzeugt werden")
        datei_name = re.sub(r"[^A-Za-z0-9ÄÖÜäöüß-]+", "-", f"Einwilligung-{sp.get('lastName', '')}-{sp.get('firstName', '')}-{heute}").strip("-") + ".pdf"
        zeile, fehler = dokumente.datei_ablegen(con(), pdf, datei_name, "Einverständnis", "trainer",
                                                nutzer["name"], player_id=pid, art="einverstaendnis")
        if fehler:
            return err(*fehler)
        beleg_id = h["neue_id"]("co")
        ergebnis = {}

        def mut(d):
            d.setdefault("consents", []).append({
                "id": beleg_id, "playerId": pid, "type": "Digitale Einwilligung (Portal)",
                "fileName": zeile["name"], "dokumentId": zeile["id"], "signedBy": unterschrieben,
                "uploadedAt": jetzt, "quelle": "digital", "gesichtet": True,
                "bestaetigung": {"userId": sess["user_id"], "konto": nutzer["username"], "name": nutzer["name"],
                                 "zeit": jetzt, "art": art, "ip": ip}})
            liste = d.setdefault("einwilligungen", [])
            for t, a in gewaehlt:
                liste.append({"id": h["neue_id"]("ew"), "playerId": pid, "vorlageId": t["id"], "status": a,
                              "datum": heute, "saison": saison, "quelle": "digital", "belegId": beleg_id,
                              "erfasstVon": unterschrieben, "erfasstAm": jetzt,
                              "textVersion": _text_hash(t.get("text") or "")})
            flags_aktualisieren(d)
            ergebnis["status"] = status(d, pid)

        if h["speichere_portal_aenderung"](mut, f"{sess['name']} (Portal)") is None:
            dokumente.datei_loeschen(con(), zeile["id"])
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        h["log_login"](nutzer["username"], True)
        nein = [t.get("name") for t, a in gewaehlt if a == "nein"]
        trainer_push(con(), "📝 Einwilligung digital abgegeben",
                     f"{name_sp}: {len(gewaehlt)} Erklärung(en) bestätigt"
                     + (f", abgelehnt: {', '.join(nein)}" if nein else "") + ".", "/#/consents")
        return jsonify({"ok": True, "status": ergebnis.get("status"), "dokumentId": zeile["id"]})

    # ----- Trainer: Eltern per Push an fehlende Erklärung erinnern -----
    @app.post("/api/einverstaendnis/erinnern")
    def api_einverstaendnis_erinnern():
        _sess, failure = require(role="trainer")
        if failure:
            return failure
        body = request.get_json(silent=True) or {}
        pid = str(body.get("playerId") or "").strip()
        _v, daten = h["lade_state"]()
        sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None)
        if sp is None:
            return err(404, "Spieler:in nicht gefunden")
        name_sp = f"{sp.get('firstName', '')} {sp.get('lastName', '')}".strip()
        st = status(daten, pid)
        fehlend = [v["name"] for v in st["vorlagen"] if v["id"] in st["offen"]]
        ids = []
        for r in con().execute("SELECT id, player_ids FROM users WHERE active = 1 AND role = 'eltern'").fetchall():
            try:
                if pid in set(json.loads(r["player_ids"] or "[]")):
                    ids.append(r["id"])
            except Exception:
                pass
        if not ids:
            return jsonify({"ok": True, "empfaenger": 0, "zugestellt": 0,
                            "hint": "Kein Elternkonto mit diesem Kind verknüpft"})
        text = (f"Für {name_sp} fehlt noch die Einverständniserklärung"
                + (f" ({', '.join(fehlend[:3])}{'…' if len(fehlend) > 3 else ''})" if fehlend else "")
                + ". Bitte im Portal unter „Konto“ digital bestätigen oder das unterschriebene Formular hochladen.")
        res = h["push"].senden(con(), "📝 Einverständniserklärung fehlt", text, "/#einverstaendnis", ids,
                               kategorie="allgemein")
        return jsonify({"ok": True, "empfaenger": len(ids), "zugestellt": res["ok"]})
