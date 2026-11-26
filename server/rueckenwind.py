"""„Rückenwind": wertschätzende Rückmeldung von Eltern an ihre Spieler:in.

Leitplanken (siehe docs/PLAN-email-login-offline.md, Teil G): Opt-in der Spieler:in
(ab 18 Standard aus), nur positiv/konkret (Kacheln + kurzer Satz), privat zwischen
Absender:in und Empfänger:in (Trainer sehen nichts), keine Gamification für Eltern,
Begrenzung je Termin und „einfach so" je Woche, Reaktion/Antwort der Spieler:in.

Datenbestand: rueckenwind[] {id, playerId, vonUserId, vonName, terminId, terminTitel,
kacheln[], text, emoji, at, status: "neu"|"wartet", reaktion, antwort, antwortAt},
rueckenwindKacheln[] (vom Trainerteam pflegbar). Opt-in in users.notify_prefs:
rueckenwindAn (bool|None), rueckenwindErlaubt {elternUserId: bool}.
"""
from __future__ import annotations

import datetime as dt
import json
import re

from flask import jsonify, request

import db

KACHELN_STANDARD = [
    "Starker Einsatz bis zum Schluss", "Respekt, wie du drangeblieben bist", "Fair gespielt",
    "Mutig angenommen", "Ruhig geblieben, als es eng wurde", "Gut für das Team gesprochen",
    "Konzentriert von Anfang an", "Sichtbar besser als letzte Woche", "Du hast andere mitgezogen",
]
FENSTER_AB_STD = 1       # ab 1 Stunde nach Terminende
FENSTER_BIS_STD = 48     # bis 48 Stunden nach Terminende
TEXT_MAX = 140
_LINK = re.compile(r"(https?://\S+|www\.\S+)", re.I)


def kacheln(daten) -> list:
    liste = [str(k)[:60] for k in daten.get("rueckenwindKacheln", []) if str(k).strip()]
    return liste[:12] or KACHELN_STANDARD


def _alter(player) -> int | None:
    try:
        g = dt.date.fromisoformat(str(player.get("birthDate") or "")[:10])
    except ValueError:
        return None
    h = dt.date.today()
    return h.year - g.year - ((h.month, h.day) < (g.month, g.day))


def _prefs_roh(con, user_id) -> dict:
    row = con.execute("SELECT notify_prefs FROM users WHERE id = ?", (user_id,)).fetchone()
    try:
        return json.loads((row["notify_prefs"] if row else "") or "{}")
    except Exception:
        return {}


def _prefs_schreiben(con, user_id, prefs: dict) -> None:
    con.execute("UPDATE users SET notify_prefs = ? WHERE id = ?", (db.to_json(prefs), user_id))
    con.commit()


def spieler_konten(con, pid) -> list:
    """Spielerkonten (Zeilen) zu einer Spieler:in."""
    out = []
    for r in con.execute("SELECT id, name, player_ids, notify_prefs FROM users"
                         " WHERE active = 1 AND role = 'spieler'").fetchall():
        try:
            if pid in set(json.loads(r["player_ids"] or "[]")):
                out.append(r)
        except Exception:
            pass
    return out


def empfang_status(con, daten, pid, eltern_user_id) -> str:
    """'an' | 'aus' | 'offen' (Spieler:in hat noch nicht entschieden) | 'kein-konto'."""
    konten = spieler_konten(con, pid)
    if not konten:
        return "kein-konto"
    sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None) or {}
    for k in konten:
        try:
            prefs = json.loads(k["notify_prefs"] or "{}")
        except Exception:
            prefs = {}
        an = prefs.get("rueckenwindAn")
        if an is None:
            alter = _alter(sp)
            an = not (alter is not None and alter >= 18)
        if not an:
            return "aus"
        erlaubt = (prefs.get("rueckenwindErlaubt") or {}).get(str(eltern_user_id))
        if erlaubt is True:
            return "an"
        if erlaubt is False:
            return "aus"
        return "offen"
    return "aus"


def _termin_fenster(daten, pid, jetzt: dt.datetime) -> list:
    """Termine, zu denen die Spieler:in zugesagt hatte und deren Ende 1–48 h zurückliegt."""
    zusagen = {r.get("eventId") for r in daten.get("responses", [])
               if r.get("playerId") == pid and r.get("status") == "yes"}
    out = []
    for e in daten.get("events", []):
        if e.get("id") not in zusagen or e.get("abgesagt") or e.get("type") not in ("training", "home", "away"):
            continue
        ende = db.parse_iso(e.get("end")) or db.parse_iso(e.get("start"))
        if ende is None:
            continue
        h = (jetzt - ende).total_seconds() / 3600
        if FENSTER_AB_STD <= h <= FENSTER_BIS_STD:
            out.append(e)
    return sorted(out, key=lambda e: str(e.get("start") or ""), reverse=True)


def _eintrag_json(x: dict) -> dict:
    return {k: x.get(k) for k in ("id", "playerId", "vonUserId", "vonName", "terminId", "terminTitel",
                                  "kacheln", "text", "emoji", "at", "status", "reaktion", "antwort", "antwortAt")}


def payload(con, daten, sess, meine) -> dict | None:
    """Teil des /api/portal-Payloads, je nach Rolle."""
    jetzt = dt.datetime.now(dt.timezone.utc)
    alle = [x for x in daten.get("rueckenwind", []) if isinstance(x, dict)]
    if sess["role"] == "eltern":
        kinder = {}
        woche = (jetzt - dt.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for p in meine:
            pid = p["id"]
            eigene = [x for x in alle if x.get("playerId") == pid and x.get("vonUserId") == sess["user_id"]]
            gesendet_termine = {x.get("terminId") for x in eigene}
            kinder[pid] = {
                "status": empfang_status(con, daten, pid, sess["user_id"]),
                "fenster": [{"terminId": e.get("id"), "titel": e.get("title") or "", "start": e.get("start"),
                             "typ": e.get("type"), "gesendet": e.get("id") in gesendet_termine}
                            for e in _termin_fenster(daten, pid, jetzt)],
                "einfachSoMoeglich": not any(x.get("terminId") is None and str(x.get("at") or "") >= woche
                                             for x in eigene),
            }
        gesendet = sorted([x for x in alle if x.get("vonUserId") == sess["user_id"]],
                          key=lambda x: str(x.get("at") or ""), reverse=True)[:10]
        return {"kacheln": kacheln(daten), "kinder": kinder, "gesendet": [_eintrag_json(x) for x in gesendet]}
    if sess["role"] == "spieler":
        pids = {p["id"] for p in meine}
        prefs = _prefs_roh(con, sess["user_id"])
        an = prefs.get("rueckenwindAn")
        if an is None:
            alter = min([a for a in (_alter(p) for p in meine) if a is not None] or [0])
            an = alter < 18
        erlaubt = prefs.get("rueckenwindErlaubt") or {}
        eigene = sorted([x for x in alle if x.get("playerId") in pids],
                        key=lambda x: str(x.get("at") or ""), reverse=True)
        # Offene Anfragen: Eltern mit wartenden Einträgen, über die noch nicht entschieden wurde
        anfragen = {}
        for x in eigene:
            if x.get("status") == "wartet" and erlaubt.get(str(x.get("vonUserId"))) is None:
                anfragen[x.get("vonUserId")] = x.get("vonName") or "Ein Elternteil"
        sichtbar = [x for x in eigene if x.get("status") == "neu"]
        return {"an": bool(an), "entschieden": prefs.get("rueckenwindAn") is not None,
                "anfragen": [{"userId": k, "name": v} for k, v in anfragen.items()],
                "neu": [_eintrag_json(x) for x in sichtbar if not x.get("reaktion") and not x.get("antwort")][:5],
                "sammlung": [_eintrag_json(x) for x in sichtbar][:50]}
    return None


def register(app, con, require_portal, err, h):
    """h: sess_player_ids, lade_state, speichere_portal_aenderung, neue_id, iso_jetzt, push, log_login."""

    def push_an(ids, titel, text, url):
        if not ids or h["push"] is None:
            return
        try:
            h["push"].senden(con(), titel, text, url, ids, kategorie="allgemein")
        except Exception:  # noqa: BLE001
            pass

    @app.post("/api/portal/rueckenwind")
    def api_rueckenwind_senden():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "eltern":
            return err(403, "Rückenwind schicken Eltern über ihr Elternkonto")
        body = request.get_json(silent=True) or {}
        pid = str(body.get("playerId") or "").strip()
        if pid not in h["sess_player_ids"](sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        _v, daten = h["lade_state"]()
        sp = next((p for p in daten.get("players", []) if p.get("id") == pid), None)
        if sp is None:
            return err(404, "Spieler:in nicht gefunden")
        erlaubt = kacheln(daten)
        gewaehlt = [str(k) for k in (body.get("kacheln") or []) if str(k) in erlaubt][:2]
        text = _LINK.sub("", str(body.get("text") or "")).strip()[:TEXT_MAX]
        emoji = str(body.get("emoji") or "").strip()[:4]
        if not gewaehlt and len(text) < 3:
            return err(400, "Bitte mindestens eine Kachel wählen oder einen kurzen Satz schreiben")
        status = empfang_status(con(), daten, pid, sess["user_id"])
        if status == "kein-konto":
            return err(400, f"{sp.get('firstName') or 'Dein Kind'} hat noch kein Spielerkonto")
        if status == "aus":
            return err(403, "Rückenwind ist bei dieser Spieler:in derzeit nicht aktiviert")
        jetzt = dt.datetime.now(dt.timezone.utc)
        termin_id = body.get("terminId") or None
        termin_titel = ""
        if termin_id:
            fenster = {e.get("id"): e for e in _termin_fenster(daten, pid, jetzt)}
            if termin_id not in fenster:
                return err(400, "Rückenwind geht ab 1 Stunde bis 48 Stunden nach einem Termin, zu dem zugesagt war")
            if any(x.get("terminId") == termin_id and x.get("vonUserId") == sess["user_id"] and x.get("playerId") == pid
                   for x in daten.get("rueckenwind", [])):
                return err(409, "Zu diesem Termin hast du schon Rückenwind geschickt")
            e = fenster[termin_id]
            termin_titel = (e.get("title") or ("Training" if e.get("type") == "training" else "Spiel"))[:80]
        else:
            woche = (jetzt - dt.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            if any(x.get("terminId") is None and x.get("vonUserId") == sess["user_id"] and x.get("playerId") == pid
                   and str(x.get("at") or "") >= woche for x in daten.get("rueckenwind", [])):
                return err(429, "„Einfach so“ geht einmal pro Woche – der nächste Termin kommt bestimmt")
        eintrag = {"id": h["neue_id"]("rw"), "playerId": pid, "vonUserId": sess["user_id"],
                   "vonName": (sess["name"] or "").split(" ")[0] or sess["name"], "terminId": termin_id,
                   "terminTitel": termin_titel, "kacheln": gewaehlt, "text": text, "emoji": emoji,
                   "at": h["iso_jetzt"](), "status": "neu" if status == "an" else "wartet",
                   "reaktion": "", "antwort": "", "antwortAt": None}

        def mut(d):
            d.setdefault("rueckenwind", []).append(eintrag)

        if h["speichere_portal_aenderung"](mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Senden gerade nicht möglich – bitte erneut versuchen")
        ids = [k["id"] for k in spieler_konten(con(), pid)]
        if eintrag["status"] == "neu":
            push_an(ids, f"💬 Rückenwind von {eintrag['vonName']}",
                    (gewaehlt[0] if gewaehlt else text)[:100], "/#rueckenwind")
        else:
            push_an(ids, f"💬 {eintrag['vonName']} möchte dir Rückenwind schicken",
                    "Du entscheidest in der App, ob du das erlauben möchtest.", "/#rueckenwind")
        return jsonify({"ok": True, "status": eintrag["status"]})

    @app.post("/api/portal/rueckenwind/reaktion")
    def api_rueckenwind_reaktion():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Reagieren kann nur die Spieler:in selbst")
        body = request.get_json(silent=True) or {}
        rid = str(body.get("id") or "")
        reaktion = str(body.get("reaktion") or "").strip()[:4]
        antwort = _LINK.sub("", str(body.get("antwort") or "")).strip()[:TEXT_MAX]
        pids = h["sess_player_ids"](sess)
        ziel = {}

        def mut(d):
            x = next((y for y in d.get("rueckenwind", []) if y.get("id") == rid), None)
            if x is None or x.get("playerId") not in pids or x.get("status") != "neu":
                ziel["fehler"] = (404, "Eintrag nicht gefunden")
                return
            if reaktion:
                x["reaktion"] = reaktion
            if antwort:
                x["antwort"] = antwort
                x["antwortAt"] = h["iso_jetzt"]()
            ziel["von"] = x.get("vonUserId")
            ziel["name"] = sess["name"]

        if h["speichere_portal_aenderung"](mut, f"{sess['name']} (Portal)") is None:
            return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
        if ziel.get("fehler"):
            return err(*ziel["fehler"])
        vorname = (sess["name"] or "").split(" ")[0]
        push_an([ziel["von"]], f"{reaktion or '💬'} {vorname} hat reagiert",
                antwort[:100] if antwort else "Dein Rückenwind ist angekommen.", "/#rueckenwind")
        return jsonify({"ok": True})

    @app.post("/api/portal/rueckenwind/einstellung")
    def api_rueckenwind_einstellung():
        """Spieler:in: Empfang an/aus, einzelne Eltern erlauben/ablehnen."""
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Nur für Spielerkonten")
        body = request.get_json(silent=True) or {}
        prefs = _prefs_roh(con(), sess["user_id"])
        if "an" in body:
            prefs["rueckenwindAn"] = bool(body["an"])
        erlauben = body.get("erlauben")
        geloescht = []
        if isinstance(erlauben, dict) and erlauben.get("userId") is not None:
            uid = str(erlauben.get("userId"))
            ok = bool(erlauben.get("ok"))
            e = prefs.get("rueckenwindErlaubt") or {}
            e[uid] = ok
            prefs["rueckenwindErlaubt"] = e
            pids = h["sess_player_ids"](sess)

            def mut(d):
                liste = []
                for x in d.get("rueckenwind", []):
                    if x.get("playerId") in pids and str(x.get("vonUserId")) == uid and x.get("status") == "wartet":
                        if ok:
                            x["status"] = "neu"
                        else:
                            geloescht.append(x.get("id"))
                            continue
                    liste.append(x)
                d["rueckenwind"] = liste

            if h["speichere_portal_aenderung"](mut, f"{sess['name']} (Portal)") is None:
                return err(409, "Speichern gerade nicht möglich – bitte erneut versuchen")
            if ok:
                try:
                    push_an([int(uid)], "💬 Rückenwind freigeschaltet",
                            f"{(sess['name'] or '').split(' ')[0]} hat deinen Rückenwind erlaubt.", "/#rueckenwind")
                except ValueError:
                    pass
        _prefs_schreiben(con(), sess["user_id"], prefs)
        return jsonify({"ok": True, "an": prefs.get("rueckenwindAn"), "erlaubt": prefs.get("rueckenwindErlaubt") or {}})
