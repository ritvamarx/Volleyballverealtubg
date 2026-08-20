"""Automatischer Tabellen-Abgleich mit dem VMV-Spielbetrieb (vmv24.de).

Holt die offizielle Ligatabelle des Volleyballverbands Mecklenburg-Vorpommern
(SAMS-CMS auf www.vmv24.de) und ersetzt state.standings komplett – die
Tabelle ist damit in Trainer-Bereich UND Portal immer auf dem offiziellen
Stand. Läuft per Cron (/etc/cron.d/volleyball-tabelle) über
`./manage.py tabelle-sync`.

Liga wählbar über die Umgebungsvariable VV_TABELLE_LIGA (Slug wie in der
vmv24-URL, Standard "VerbandsligaMänner"); die aktuelle Saison wird von der
Startseite erkannt. Beispiele: VerbandsligaFrauen, LandesligaMännerWest …
"""
from __future__ import annotations

import json
import os
import re
import secrets
import urllib.parse
import urllib.request

import db

BASIS = "https://www.vmv24.de"
UA = "Mozilla/5.0 (kompatibel; SKV-Mueritz-Volleyball-App; +https://volleyball.nettverwaltet.de)"


def _hole(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as antwort:
        return antwort.read().decode("utf-8", errors="replace")


def _aktuelle_saison() -> str:
    """Neueste Saison (z. B. "2025-2026") von der vmv24-Startseite lesen."""
    html = _hole(BASIS + "/")
    saisons = re.findall(r'href="hallensaison/(\d{4}-\d{4})\.html"', html)
    if not saisons:
        raise RuntimeError("Keine Hallensaison auf vmv24.de gefunden")
    return max(saisons)


def _entity(text: str) -> str:
    return (text.replace("&nbsp;", " ").replace("&amp;", "&")
            .replace("&auml;", "ä").replace("&ouml;", "ö").replace("&uuml;", "ü")
            .replace("&Auml;", "Ä").replace("&Ouml;", "Ö").replace("&Uuml;", "Ü")
            .replace("&szlig;", "ß").strip())


def _parse_tabelle(html: str) -> list[dict]:
    """Ranking-Tabelle des SAMS-CMS parsen.

    Zeilenformat: Platz · Mannschaft · Punkte · Spiele ges. · gew. · verl.
    · Sätze "59:25" · Satzquote · Bälle · Ballquote
    """
    zeilen = []
    for tabelle in re.findall(r"<table.*?</table>", html, re.S):
        for tr in re.findall(r"<tr.*?</tr>", tabelle, re.S):
            zellen = [_entity(re.sub(r"<[^>]+>", "", z))
                      for z in re.findall(r"<t[dh].*?</t[dh]>", tr, re.S)]
            if len(zellen) < 7 or not zellen[0].rstrip(".").isdigit():
                continue
            saetze = re.match(r"(\d+):(\d+)", zellen[6].replace(" ", ""))
            try:
                zeilen.append({
                    "id": "st" + secrets.token_hex(5),
                    "team": zellen[1],
                    "points": int(zellen[2]),
                    "games": int(zellen[3]),
                    "win": int(zellen[4]),
                    "loss": int(zellen[5]),
                    "setsW": int(saetze.group(1)) if saetze else 0,
                    "setsL": int(saetze.group(2)) if saetze else 0,
                    "src": "vmv",
                })
            except (ValueError, AttributeError):
                continue
        if zeilen:
            break  # erste echte Ranking-Tabelle reicht (danach folgt das Login-Formular)
    return zeilen


def sync(liga: str | None = None) -> str:
    liga = (liga or os.environ.get("VV_TABELLE_LIGA") or "VerbandsligaMänner").strip()
    saison = _aktuelle_saison()
    url = f"{BASIS}/hallensaison/{saison}/ligen/tabelle/{urllib.parse.quote(liga)}.html"
    zeilen = _parse_tabelle(_hole(url))
    if not zeilen:
        return f"Keine Tabellenzeilen gefunden ({url}) – Bestand unverändert."
    import time
    con = db.connect()
    try:
        for _ in range(4):
            row = db.get_state(con)
            if row is None:
                return "Noch kein Datenbestand vorhanden – nichts zu tun."
            daten = json.loads(row["data"])
            daten["standings"] = zeilen
            daten["standingsMeta"] = {
                "liga": liga, "saison": saison, "quelle": url,
                "stand": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            version, _konflikt = db.put_state(
                con, row["version"], json.dumps(daten, ensure_ascii=False), "Tabellen-Automatik (VMV)")
            if version is not None:
                return (f"{len(zeilen)} Teams aus {liga} {saison} übernommen "
                        f"(Version {version}).")
        return "Abbruch: Datenbestand wurde dauerhaft parallel geändert."
    finally:
        con.close()
