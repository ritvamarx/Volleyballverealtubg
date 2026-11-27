"""Automatischer Status „ruhend“ nach vier Trainingswochen ohne Rückmeldung.

Regel (abgestimmt 27.11.2026, siehe docs/PLAN-ruhend-status.md):
- Maßstab ist die RÜCKMELDUNG (👍/❓/👎) zu Trainings – nicht die Zusage. Eine Absage
  wegen Verletzung hält den Status aktiv. Auch eine Rückmeldung zu einem Spiel zählt.
- Fenster = die letzten N (Standard 4) Trainingswochen: Kalenderwochen mit mindestens
  einem nicht abgesagten Training außerhalb der Ferien. Ferienwochen und trainingsfreie
  Wochen verlängern das Fenster.
- Trainings mit „nicht nominiert“ (x) oder innerhalb einer gemeldeten Abwesenheit zählen
  nicht gegen die Person. Mindestens 3 relevante Trainings nötig, sonst kein Urteil.
- Schutz für Neue: wer sich noch nie zurückgemeldet hat oder jünger als das Fenster im
  Bestand ist, wird nicht automatisch ruhend. Ausnahme bis Datum durch Trainer:in möglich.
- Vorwarnung nach N-1 Wochen (Push/E-Mail) mit Ein-Tipp „Ja, ich bin dabei“ (/#dabei).
- Zurück nur selbst: Spieler:in bestätigt im Portal „Ich bin wieder dabei“. Termine der
  Ruhezeit werden dann für die Person als „nicht nominiert“ nachgetragen, damit Quoten,
  Abzeichen und Urkunde nicht unter der Pause leiden.

Läuft täglich per Cron (/etc/cron.d/volleyball-ruhend) über `manage.py ruhend-pruefen`;
`--trocken` zeigt nur, wen es treffen würde.
"""
from __future__ import annotations

import datetime as dt
import json

import db
import mail
import push

STANDARD = {"aktiv": True, "wochen": 4, "mindestens": 3, "vorwarnung": True}
AKTIVE_TERMINE = ("training", "home", "away")


def regel(daten) -> dict:
    cfg = dict(STANDARD)
    for k, v in (daten.get("ruhendRegel") or {}).items():
        if k in cfg and v is not None:
            cfg[k] = v
    cfg["wochen"] = max(2, min(12, int(cfg["wochen"] or 4)))
    cfg["mindestens"] = max(1, min(10, int(cfg["mindestens"] or 3)))
    return cfg


def _tag(e) -> str:
    return str(e.get("start") or "")[:10]


def _in_ferien(tag: str, ferien: list) -> bool:
    return any(str(h.get("start") or "")[:10] <= tag <= str(h.get("end") or "")[:10] for h in ferien)


def _woche(tag: str) -> tuple:
    d = dt.date.fromisoformat(tag)
    iso = d.isocalendar()
    return (iso[0], iso[1])


def _montag(woche: tuple) -> dt.date:
    return dt.date.fromisocalendar(woche[0], woche[1], 1)


def analyse(daten: dict, heute: dt.date, cfg: dict | None = None) -> dict:
    """Reine Auswertung ohne Nebenwirkungen.

    Rückgabe: {"ruhend": [pid…], "vorwarnen": [pid…], "fenster": {"von","bis","wochen","trainings"},
               "details": {pid: {"name", "relevant", "gemeldet"}}}"""
    cfg = cfg or regel(daten)
    heute_s = heute.isoformat()
    ferien = daten.get("holidays") or []
    trainings = [e for e in daten.get("events", [])
                 if e.get("type") == "training" and not e.get("abgesagt")
                 and _tag(e) and _tag(e) < heute_s and not _in_ferien(_tag(e), ferien)]
    if not trainings:
        return {"ruhend": [], "vorwarnen": [], "fenster": None, "details": {}}
    wochen = sorted({_woche(_tag(e)) for e in trainings}, reverse=True)

    antworten: dict = {}
    je_spieler: dict = {}
    for r in daten.get("responses", []):
        antworten.setdefault(r.get("eventId"), {})[r.get("playerId")] = r.get("status")
        if r.get("status"):
            je_spieler.setdefault(r.get("playerId"), 0)
            je_spieler[r.get("playerId")] += 1
    abwesend = {}
    for a in daten.get("abwesenheiten", []):
        abwesend.setdefault(a.get("playerId"), []).append((str(a.get("von") or "")[:10], str(a.get("bis") or "")[:10]))

    def entschuldigt(pid, tag):
        return any(v <= tag <= b for v, b in abwesend.get(pid, []))

    def fenster(n_wochen):
        ww = wochen[:n_wochen]
        if len(ww) < n_wochen:
            return None
        von = _montag(ww[-1]).isoformat()
        tr = [e for e in trainings if _woche(_tag(e)) in ww]
        sp = [e for e in daten.get("events", []) if e.get("type") in ("home", "away") and not e.get("abgesagt")
              and von <= _tag(e) < heute_s]
        return {"von": von, "trainings": tr, "spiele": sp, "wochen": n_wochen}

    def stumm(pid, p, f):
        """True = im Fenster keinerlei Rückmeldung; None = zu wenig Daten/Schutz."""
        if f is None:
            return None
        if (p.get("angelegtAm") or "")[:10] >= f["von"]:
            return None
        if not je_spieler.get(pid):
            return None  # noch nie zurückgemeldet (Probetraining)
        relevant = [e for e in f["trainings"]
                    if antworten.get(e.get("id"), {}).get(pid) != "x" and not entschuldigt(pid, _tag(e))]
        if len(relevant) < cfg["mindestens"]:
            return None
        gemeldet = (any(antworten.get(e.get("id"), {}).get(pid) for e in relevant)
                    or any(antworten.get(e.get("id"), {}).get(pid) not in (None, "", "x") for e in f["spiele"])
                    or (p.get("dabeiBestaetigt") or "")[:10] >= f["von"]
                    or any(v >= f["von"] for v, _b in abwesend.get(pid, [])))
        return not gemeldet

    f_voll = fenster(cfg["wochen"])
    f_warn = fenster(max(1, cfg["wochen"] - 1))
    out = {"ruhend": [], "vorwarnen": [], "details": {},
           "fenster": {"von": f_voll["von"], "bis": heute_s, "wochen": cfg["wochen"],
                       "trainings": len(f_voll["trainings"])} if f_voll else None}
    for p in daten.get("players", []):
        pid = p.get("id")
        if not pid or p.get("membershipStatus") in ("inaktiv", "ruhend"):
            continue
        if (p.get("ruhendAusnahmeBis") or "")[:10] >= heute_s:
            continue
        name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()
        if stumm(pid, p, f_voll):
            out["ruhend"].append(pid)
            out["details"][pid] = {"name": name, "stufe": "ruhend"}
        elif cfg.get("vorwarnung") and stumm(pid, p, f_warn):
            if (p.get("ruhendGewarntAm") or "")[:10] < f_warn["von"]:
                out["vorwarnen"].append(pid)
                out["details"][pid] = {"name": name, "stufe": "vorwarnung"}
    return out


def _konten(con, pids: set):
    rows = con.execute("SELECT id, role, player_ids, notify_prefs FROM users"
                       " WHERE active = 1 AND role IN ('spieler','eltern')").fetchall()
    out = []
    for k in rows:
        try:
            eigene = set(json.loads(k["player_ids"] or "[]"))
        except Exception:
            eigene = set()
        if eigene & pids:
            out.append((k, eigene & pids))
    return out


def _mailadressen(k, players_by_id, pids):
    felder = ("parentEmail", "parent2Email") if k["role"] == "eltern" else ("playerEmail",)
    adressen = []
    for pid in pids:
        p = players_by_id.get(pid) or {}
        for feld in felder:
            a = (p.get(feld) or "").strip()
            if a and a not in adressen:
                adressen.append(a)
    return adressen


def _trainer_ids(con):
    return [r["id"] for r in con.execute("SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]


def lauf(trocken: bool = False) -> str:
    heute = dt.date.today()
    con = db.connect()
    try:
        row = db.get_state(con)
        if row is None:
            return "Kein Datenbestand – nichts zu tun."
        daten = json.loads(row["data"])
        cfg = regel(daten)
        if not cfg.get("aktiv", True):
            return "Automatik „ruhend“ ist ausgeschaltet (Trainer-Einstellung)."
        erg = analyse(daten, heute, cfg)
        if not erg["fenster"]:
            return f"Noch keine {cfg['wochen']} Trainingswochen im Bestand – kein Urteil möglich."
        namen = lambda pids: ", ".join(erg["details"][p]["name"] for p in pids) or "–"  # noqa: E731
        kopf = (f"Fenster {erg['fenster']['von']} bis {erg['fenster']['bis']} "
                f"({erg['fenster']['wochen']} Trainingswochen, {erg['fenster']['trainings']} Trainings). ")
        if trocken:
            return kopf + f"Würden ruhend: {namen(erg['ruhend'])}. Vorwarnung: {namen(erg['vorwarnen'])}."
        if not erg["ruhend"] and not erg["vorwarnen"]:
            return kopf + "Niemand betroffen."

        players_by_id = {p.get("id"): p for p in daten.get("players", [])}
        heute_s = heute.isoformat()

        def mut(d):
            for p in d.get("players", []):
                if p.get("id") in erg["ruhend"] and p.get("membershipStatus") not in ("inaktiv", "ruhend"):
                    p["statusVorRuhend"] = p.get("membershipStatus") or "aktiv"
                    p["membershipStatus"] = "ruhend"
                    p["ruhendSeit"] = heute_s
                    p["ruhendGrund"] = f"automatisch: {cfg['wochen']} Trainingswochen ohne Rückmeldung"
                    p.setdefault("ruhendZeiten", []).append({"von": heute_s, "bis": None, "grund": "automatisch"})
                elif p.get("id") in erg["vorwarnen"]:
                    p["ruhendGewarntAm"] = heute_s
            d.setdefault("ruhendProtokoll", []).extend(
                [{"at": heute_s, "playerId": pid, "art": "ruhend"} for pid in erg["ruhend"]]
                + [{"at": heute_s, "playerId": pid, "art": "vorwarnung"} for pid in erg["vorwarnen"]])
            d["ruhendProtokoll"] = d["ruhendProtokoll"][-200:]

        version = db.mutate_state(con, mut, "Automatik ruhend")
        if version is None:
            return "Abbruch: Datenbestand dauerhaft parallel geändert."

        push_ok = mail_ok = 0
        # Vorwarnung an die Person (und Eltern zur Kenntnis)
        if erg["vorwarnen"]:
            for k, pids in _konten(con, set(erg["vorwarnen"])):
                wer = ", ".join(players_by_id[p].get("firstName", "") for p in pids if p in players_by_id)
                titel = "🏐 Wir vermissen dich – bist du noch dabei?"
                text = (f"{wer}, seit drei Trainingswochen kam keine Rückmeldung. Ein Tipp genügt: "
                        f"„Ja, ich bin dabei“ – sonst wird das Konto in einer Woche auf ruhend gestellt.")
                push_ok += push.senden(con, titel, text, "/#dabei", [k["id"]], kategorie="teilnahme")["ok"]
                try:
                    prefs = json.loads(k["notify_prefs"] or "{}")
                except Exception:
                    prefs = {}
                if prefs.get("email", False):
                    for adr in _mailadressen(k, players_by_id, pids):
                        if mail.senden(adr, "SKV Müritz Volleyball – bist du noch dabei?",
                                       text + "\n\nIm Portal anmelden und bestätigen: /#dabei"):
                            mail_ok += 1
        # Ruhend: Person informieren + Trainerteam
        if erg["ruhend"]:
            for k, pids in _konten(con, set(erg["ruhend"])):
                wer = ", ".join(players_by_id[p].get("firstName", "") for p in pids if p in players_by_id)
                push_ok += push.senden(
                    con, "⏸️ Konto auf „ruhend“ gestellt",
                    f"{wer}: vier Trainingswochen ohne Rückmeldung. Wenn du wieder dabei bist, bestätige das kurz im Portal.",
                    "/", [k["id"]], kategorie="teilnahme")["ok"]
            tr = _trainer_ids(con)
            if tr:
                push.senden(con, "⏸️ Ruhend gestellt", namen(erg["ruhend"]) + " – vier Trainingswochen ohne Rückmeldung.",
                            "/#/players", tr, kategorie="allgemein")
        return (kopf + f"Ruhend: {namen(erg['ruhend'])}. Vorwarnung: {namen(erg['vorwarnen'])}. "
                f"{push_ok} Push, {mail_ok} Mail (Version {version}).")
    finally:
        con.close()


def register(app, con, require_portal, err, sess_player_ids, iso_jetzt, neue_id):
    from flask import jsonify, request

    @app.post("/api/portal/wieder-dabei")
    def api_portal_wieder_dabei():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Das bestätigen die Spieler:innen selbst")
        body = request.get_json(silent=True) or {}
        pid = body.get("playerId")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        heute = dt.date.today().isoformat()
        info = {"name": "", "war": False}

        def mut(d):
            p = next((x for x in d.get("players", []) if x.get("id") == pid), None)
            if not p or p.get("membershipStatus") != "ruhend":
                return
            info["war"] = True
            info["name"] = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()
            seit = (p.get("ruhendSeit") or heute)[:10]
            p["membershipStatus"] = p.get("statusVorRuhend") or "aktiv"
            p["reaktiviertAm"] = heute
            p["dabeiBestaetigt"] = heute
            for z in p.get("ruhendZeiten") or []:
                if not z.get("bis"):
                    z["bis"] = heute
            # Termine der Ruhezeit zählen für die Person als „nicht nominiert“
            vorhanden = {(r.get("eventId"), r.get("playerId")) for r in d.get("responses", [])}
            for e in d.get("events", []):
                tag = str(e.get("start") or "")[:10]
                if e.get("type") in AKTIVE_TERMINE and seit <= tag < heute and (e.get("id"), pid) not in vorhanden:
                    d.setdefault("responses", []).append({
                        "id": neue_id("rs"), "eventId": e.get("id"), "playerId": pid, "status": "x",
                        "at": iso_jetzt(), "quelle": "ruhend"})
            d.setdefault("ruhendProtokoll", []).append({"at": heute, "playerId": pid, "art": "zurueck"})

        version = db.mutate_state(con(), mut, sess["name"])
        if version is None:
            return err(409, "Gerade wird gespeichert – bitte noch einmal tippen")
        if not info["war"]:
            return err(400, "Dieses Konto ist nicht ruhend")
        tr = _trainer_ids(con())
        if tr:
            push.senden(con(), "🏐 Wieder dabei", f"{info['name']} hat sich zurückgemeldet und ist wieder aktiv.",
                        "/#/players", tr, kategorie="allgemein")
        return jsonify({"ok": True})

    @app.post("/api/portal/noch-dabei")
    def api_portal_noch_dabei():
        """Antwort auf die Vorwarnung: zählt als Rückmeldung und setzt das Fenster zurück."""
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Das bestätigen die Spieler:innen selbst")
        body = request.get_json(silent=True) or {}
        pid = body.get("playerId")
        if pid not in sess_player_ids(sess):
            return err(403, "Spieler:in ist nicht mit deinem Konto verknüpft")
        heute = dt.date.today().isoformat()

        def mut(d):
            for p in d.get("players", []):
                if p.get("id") == pid:
                    p["dabeiBestaetigt"] = heute

        version = db.mutate_state(con(), mut, sess["name"])
        if version is None:
            return err(409, "Gerade wird gespeichert – bitte noch einmal tippen")
        return jsonify({"ok": True})
