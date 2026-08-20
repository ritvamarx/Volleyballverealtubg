"""Serverseitiger Ferien-Abgleich für Mecklenburg-Vorpommern (Phase 4).

Ruft die OpenHolidays-API ab (Schulferien DE-MV, kommende 15 Monate) und
ersetzt im zentralen Datenbestand alle automatischen Ferien-Einträge
(src == "auto"); von Hand angelegte Einträge bleiben unangetastet.
Läuft wöchentlich per Cron (/etc/cron.d/volleyball-ferien) über
`./manage.py ferien-sync` – ohne Browser, also ohne CORS-Grenzen.
"""
from __future__ import annotations

import datetime as dt
import json
import secrets
import urllib.request

import db

API = ("https://openholidaysapi.org/SchoolHolidays"
       "?countryIsoCode=DE&subdivisionCode=DE-MV&languageIsoCode=DE"
       "&validFrom={von}&validTo={bis}")


def _hole_ferien() -> list[dict]:
    heute = dt.date.today()
    url = API.format(von=heute.isoformat(), bis=(heute + dt.timedelta(days=456)).isoformat())
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                               "User-Agent": "skv-mueritz-volleyball"})
    with urllib.request.urlopen(req, timeout=30) as antwort:
        roh = json.load(antwort)
    ferien = []
    for eintrag in roh:
        namen = eintrag.get("name") or []
        name = next((n.get("text") for n in namen if n.get("language") == "DE"),
                    namen[0].get("text") if namen else "Ferien")
        ferien.append({
            "id": "ho" + secrets.token_hex(5),
            "name": name,
            "start": eintrag.get("startDate"),
            "end": eintrag.get("endDate"),
            "src": "auto",
        })
    ferien.sort(key=lambda f: f["start"] or "")
    return ferien


def sync() -> str:
    """Ferien abrufen und in den Datenbestand schreiben. Gibt eine Meldung zurück."""
    neue = _hole_ferien()
    if not neue:
        return "OpenHolidays lieferte keine Einträge – Bestand unverändert."
    con = db.connect()
    try:
        behalten = [0]

        def merker(daten):
            manuell = [h for h in daten.get("holidays", []) if h.get("src") != "auto"]
            behalten[0] = len(manuell)
            daten["holidays"] = manuell + neue

        version = db.mutate_state(con, merker, "Ferien-Automatik")
        if version is not None:
            return (f"{len(neue)} Ferienzeiträume (DE-MV) übernommen, "
                    f"{behalten[0]} manuelle Einträge behalten (Version {version}).")
        return "Abbruch: kein Datenbestand oder Datenbestand dauerhaft parallel geändert."
    finally:
        con.close()
