"""06:30-Erinnerung zum heutigen Training.

Läuft morgens per Cron (/etc/cron.d/volleyball-trainingserinnerung, 30 6 * * *):
Wer sich zu einem HEUTE stattfindenden, nicht abgesagten Training noch nicht
zurückgemeldet hat (und nicht als „nicht nominiert" markiert ist), bekommt eine
freundliche Erinnerung – als Push und/oder E-Mail, je nach den persönlichen
Benachrichtigungs-Einstellungen (notify_prefs). Der Merker `erinnertTraining`
(Datum) am Termin verhindert Doppelversand.
"""
from __future__ import annotations

import datetime as dt
import json

import db
import mail
import push


def _prefs(row) -> dict:
    try:
        return json.loads(row["notify_prefs"] or "{}")
    except Exception:
        return {}


def _mailadressen(row, players_by_id, offene_pids) -> list:
    """E-Mail-Adressen eines Kontos – abhängig von Rolle und offenen Spieler:innen."""
    try:
        eigene = set(json.loads(row["player_ids"] or "[]"))
    except Exception:
        eigene = set()
    felder = ("parentEmail", "parent2Email") if row["role"] == "eltern" else ("playerEmail",)
    adressen = []
    for pid in (eigene & offene_pids):
        p = players_by_id.get(pid) or {}
        for feld in felder:
            a = (p.get(feld) or "").strip()
            if a and a not in adressen:
                adressen.append(a)
    return adressen


def lauf() -> str:
    heute = dt.date.today().isoformat()
    con = db.connect()
    try:
        row = db.get_state(con)
        if row is None:
            return "Kein Datenbestand – nichts zu tun."
        daten = json.loads(row["data"])

        # Vom Trainerteam in der App eingestellt: an/aus + Uhrzeit. Der Cron ist nur
        # der „Wecker" (läuft oft), gesendet wird erst ab der eingestellten Zeit –
        # der erinnertTraining-Merker sorgt dann für genau EINEN Versand pro Tag.
        from zoneinfo import ZoneInfo
        cfg = daten.get("trainingErinnerung") or {}
        if cfg.get("aktiv", True) is False:
            return "Automatische Trainings-Erinnerung ist ausgeschaltet."
        zeit = str(cfg.get("zeit") or "06:30")[:5]
        jetzt_lokal = dt.datetime.now(dt.timezone.utc).astimezone(ZoneInfo("Europe/Berlin"))
        if jetzt_lokal.strftime("%H:%M") < zeit:
            return f"Noch vor der eingestellten Zeit ({zeit} Uhr) – nichts zu tun."

        roster = [p for p in daten.get("players", []) if p.get("membershipStatus") != "inaktiv"]
        players_by_id = {p.get("id"): p for p in daten.get("players", [])}
        # Antworten je Event: Spieler-ID -> Status ("yes"/"no"/"maybe"/"x")
        antwort: dict = {}
        for r in daten.get("responses", []):
            antwort.setdefault(r.get("eventId"), {})[r.get("playerId")] = r.get("status")

        heutige = [e for e in daten.get("events", [])
                   if e.get("type") == "training" and not e.get("abgesagt")
                   and str(e.get("start") or "")[:10] == heute
                   and e.get("erinnertTraining") != heute]
        if not heutige:
            return "Heute kein offenes Training zu erinnern."

        konten = con.execute(
            "SELECT id, role, player_ids, notify_prefs FROM users"
            " WHERE active = 1 AND role IN ('spieler','eltern')").fetchall()

        push_ok = mail_ok = 0
        erinnert_ids = []
        from zoneinfo import ZoneInfo
        for e in heutige:
            resp = antwort.get(e.get("id"), {})
            # offen = aktive Spieler:in ohne Rückmeldung; „x" (nicht nominiert) zählt NICHT als offen
            offene = {p.get("id") for p in roster if resp.get(p.get("id"), "") in ("", None)}
            if not offene:
                erinnert_ids.append(e.get("id"))  # nichts offen → nur Merker setzen, kein Versand
                continue
            start = db.parse_iso(e.get("start"))
            zeit = start.astimezone(ZoneInfo("Europe/Berlin")).strftime("%H:%M") if start else ""
            titel = "🏐 Heute Training – kommst du?"
            text = (f"{str(e.get('title') or 'Training')[:80]}"
                    + (f" um {zeit} Uhr" if zeit else "")
                    + ". Bitte kurz zu- oder absagen.")

            push_ids = []
            for k in konten:
                try:
                    eigene = set(json.loads(k["player_ids"] or "[]"))
                except Exception:
                    eigene = set()
                if not (eigene & offene):
                    continue
                push_ids.append(k["id"])
                if _prefs(k).get("email", False):
                    for adr in _mailadressen(k, players_by_id, offene):
                        if mail.senden(adr, "SKV Müritz Volleyball – heute Training", text):
                            mail_ok += 1
            if push_ids:
                push_ok += push.senden(con, titel, text, "/", push_ids, kategorie="teilnahme")["ok"]
            erinnert_ids.append(e.get("id"))

        if not erinnert_ids:
            return "Nichts zu erinnern."

        def merker(daten):
            for e in daten.get("events", []):
                if e.get("id") in erinnert_ids:
                    e["erinnertTraining"] = heute

        version = db.mutate_state(con, merker, "Trainings-Erinnerung 06:30")
        return (f"{len(erinnert_ids)} Training(s) bearbeitet, {push_ok} Push + {mail_ok} Mail verschickt"
                + (f" (Version {version})." if version is not None else " – Merker-Konflikt."))
    finally:
        con.close()
