"""Automatische Aufgaben-Erinnerung für Portal-Aufgaben (Phase-4-Ausbau).

Läuft täglich per Cron (/etc/cron.d/volleyball-erinnerung): Portal-Aufgaben,
die spätestens MORGEN fällig und noch nicht von allen erledigt sind, lösen
EINMALIG eine Push-Mitteilung an die säumigen Konten aus (Merker
`erinnertAm` in der Aufgabe). Danach kann das Trainerteam jederzeit über
den 🔔-Knopf in der Aufgabenliste manuell nachfassen.
"""
from __future__ import annotations

import datetime as dt
import json

import db
import push


def _empfaenger(con, task) -> list:
    rolle = task.get("zielRolle")
    if rolle not in ("spieler", "eltern", "alle"):
        return []
    rollen = ("spieler", "eltern") if rolle == "alle" else (rolle,)
    platzhalter = ",".join("?" * len(rollen))
    rows = con.execute(
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


def lauf() -> str:
    heute = dt.date.today().isoformat()
    morgen = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    con = db.connect()
    try:
        row = db.get_state(con)
        if row is None:
            return "Kein Datenbestand – nichts zu tun."
        daten = json.loads(row["data"])
        gesendet = 0
        erinnert_ids = []
        for t in daten.get("tasks", []):
            if t.get("done") or t.get("erinnertAm"):
                continue
            if t.get("zielRolle") not in ("spieler", "eltern", "alle"):
                continue
            due = str(t.get("due") or "")[:10]
            if not due or due > morgen:
                continue
            saeumige = [u for u in _empfaenger(con, t) if u not in (t.get("erledigtVon") or [])]
            if saeumige:
                faellig = f"{due[8:10]}.{due[5:7]}."
                ergebnis = push.senden(
                    con, "✅ Erinnerung vom Trainerteam",
                    f"Bitte bis {faellig} erledigen: {str(t.get('title') or '')[:120]}",
                    "/", saeumige)
                gesendet += ergebnis["ok"]
            erinnert_ids.append(t.get("id"))
        if not erinnert_ids:
            return "Keine fälligen Portal-Aufgaben ohne Erinnerung."
        for _ in range(4):
            row = db.get_state(con)
            daten = json.loads(row["data"])
            for t in daten.get("tasks", []):
                if t.get("id") in erinnert_ids:
                    t["erinnertAm"] = heute
            version, _k = db.put_state(con, row["version"],
                                       json.dumps(daten, ensure_ascii=False), "Erinnerungs-Automatik")
            if version is not None:
                return (f"{len(erinnert_ids)} Aufgabe(n) erinnert, {gesendet} Push-Mitteilungen "
                        f"zugestellt (Version {version}).")
        return "Erinnerungen gesendet, Merker konnte nicht gespeichert werden (Konflikt)."
    finally:
        con.close()
