"""Rückmelde-Warnung für das Trainerteam.

Läuft stündlich per Cron (/etc/cron.d/volleyball-rueckmeldung): Steht ein
Termin (Training oder Spiel) in weniger als 24 Stunden bevor und haben noch
keine 50 % der aktiven Spieler:innen eine Rückmeldung abgegeben, bekommen
alle Trainer:innen EINMALIG eine Push-Mitteilung (Merker `rueckmeldeAlarm`
im Termin verhindert Doppelversand).
"""
from __future__ import annotations

import datetime as dt
import json

import db
import push

SCHWELLE = 0.5  # unterhalb dieser Rückmeldequote wird gewarnt


def _start(e) -> dt.datetime | None:
    try:
        z = dt.datetime.fromisoformat(str(e.get("start") or "").replace("Z", "+00:00"))
        return z if z.tzinfo else z.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None


def lauf() -> str:
    jetzt = dt.datetime.now(dt.timezone.utc)
    fenster_ende = jetzt + dt.timedelta(hours=24)
    con = db.connect()
    try:
        row = db.get_state(con)
        if row is None:
            return "Kein Datenbestand – nichts zu tun."
        daten = json.loads(row["data"])
        roster = [p for p in daten.get("players", [])
                  if p.get("membershipStatus") != "inaktiv"]
        if not roster:
            return "Keine aktiven Spieler:innen."
        antworten = {}
        for r in daten.get("responses", []):
            antworten.setdefault(r.get("eventId"), set()).add(r.get("playerId"))

        trainer_ids = [r["id"] for r in con.execute(
            "SELECT id FROM users WHERE active = 1 AND role = 'trainer'").fetchall()]

        gesendet = 0
        alarm_ids = []
        for e in daten.get("events", []):
            if e.get("type") not in ("training", "home", "away") or e.get("rueckmeldeAlarm"):
                continue
            if e.get("abgesagt"):
                continue  # abgesagte Termine brauchen keine Rückmelde-Warnung
            start = _start(e)
            if start is None or not (jetzt < start <= fenster_ende):
                continue
            zahl = sum(1 for p in roster if p.get("id") in antworten.get(e.get("id"), set()))
            quote = zahl / len(roster)
            if quote >= SCHWELLE:
                continue
            from zoneinfo import ZoneInfo
            lokal = start.astimezone(ZoneInfo("Europe/Berlin"))
            ergebnis = push.senden(
                con, "⏳ Wenig Rückmeldungen",
                f"{str(e.get('title') or 'Termin')[:80]} am {lokal.strftime('%d.%m. %H:%M')} Uhr: "
                f"erst {zahl} von {len(roster)} Rückmeldungen ({round(quote * 100)} %).",
                "/", trainer_ids)
            gesendet += ergebnis["ok"]
            alarm_ids.append(e.get("id"))

        if not alarm_ids:
            return "Alle Termine der nächsten 24 Stunden ausreichend zurückgemeldet."
        heute = dt.date.today().isoformat()
        for _ in range(4):
            row = db.get_state(con)
            daten = json.loads(row["data"])
            for e in daten.get("events", []):
                if e.get("id") in alarm_ids:
                    e["rueckmeldeAlarm"] = heute
            version, _k = db.put_state(con, row["version"],
                                       json.dumps(daten, ensure_ascii=False), "Rückmelde-Warnung")
            if version is not None:
                return (f"{len(alarm_ids)} Termin(e) gemeldet, {gesendet} Push-Mitteilungen "
                        f"an das Trainerteam (Version {version}).")
        return "Warnung gesendet, Merker konnte nicht gespeichert werden (Konflikt)."
    finally:
        con.close()
