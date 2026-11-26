"""„Dein Jahr mit Volleyball" – Saisonrückblick als PDF für die Spieler:in.

Nur für das eigene Spielerkonto: Trainings und Spiele der Saison, Rückmelde- und
Teilnahmequote, Abzeichen, Quizpunkte, Tabellenplatz der Mannschaft und die
gesammelten Rückenwinde. Saison = 1. Juli bis 30. Juni (wie in der Trainer-App).
"""
from __future__ import annotations

import datetime as dt
import json
from zoneinfo import ZoneInfo

from flask import request

import db

BERLIN = ZoneInfo("Europe/Berlin")


def saison_grenzen(jetzt: dt.datetime, vorige: bool = False):
    lokal = jetzt.astimezone(BERLIN)
    jahr = lokal.year - (1 if lokal.month < 7 else 0)
    if vorige:
        jahr -= 1
    start = dt.datetime(jahr, 7, 1, tzinfo=BERLIN)
    ende = min(dt.datetime(jahr + 1, 7, 1, tzinfo=BERLIN), jetzt)
    return jahr, start, ende


def zahlen(daten, pid, start, ende) -> dict:
    events = [e for e in daten.get("events", [])
              if e.get("type") in ("training", "home", "away") and not e.get("abgesagt")
              and (z := db.parse_iso(e.get("start"))) is not None and start <= z < ende]
    antworten = {}
    for r in daten.get("responses", []):
        if r.get("playerId") == pid:
            antworten[r.get("eventId")] = r.get("status")
    def block(evs):
        rel = [e for e in evs if antworten.get(e.get("id")) != "x"]
        ja = sum(1 for e in rel if antworten.get(e.get("id")) == "yes")
        beantwortet = sum(1 for e in rel if antworten.get(e.get("id")))
        return {"gesamt": len(rel), "dabei": ja, "beantwortet": beantwortet,
                "quote": round(ja / len(rel) * 100) if rel else None,
                "rmquote": round(beantwortet / len(rel) * 100) if rel else None}
    tr = block([e for e in events if e.get("type") == "training"])
    sp = block([e for e in events if e.get("type") in ("home", "away")])
    alle = block(events)
    siege = 0
    for e in events:
        if e.get("type") in ("home", "away") and antworten.get(e.get("id")) == "yes":
            erg = e.get("result") or e.get("ergebnis") or {}
            if isinstance(erg, dict) and erg.get("win"):
                siege += 1
    return {"training": tr, "spiele": sp, "alle": alle, "siege": siege}


def abzeichen(daten, pid, start, ende) -> list:
    z = zahlen(daten, pid, start, ende)
    out = []
    for d in daten.get("abzeichenDefs", []):
        bereich = {"training": z["training"], "spiel": z["spiele"]}.get(d.get("bereich") or "alle", z["alle"])
        if bereich["gesamt"] < 3:
            continue
        quote = bereich["quote"] if d.get("typ") == "teilnahme" else bereich["rmquote"]
        if quote is not None and quote >= (d.get("schwelle") or 0):
            out.append({"name": d.get("name") or "", "emoji": d.get("emoji") or "", "wert": quote})
    return out


def bloecke(daten, con, user_id, spieler, start, ende, jahr) -> list:
    pid = spieler["id"]
    name = f"{spieler.get('firstName', '')} {spieler.get('lastName', '')}".strip()
    z = zahlen(daten, pid, start, ende)
    abz = abzeichen(daten, pid, start, ende)
    quiz = con.execute("SELECT punkte FROM quiz_stand WHERE user_id = ?", (user_id,)).fetchone()
    punkte = int(quiz["punkte"] or 0) if quiz else 0
    rw = [x for x in daten.get("rueckenwind", []) if isinstance(x, dict) and x.get("playerId") == pid
          and x.get("status") == "neu" and start.strftime("%Y-%m-%d") <= str(x.get("at") or "")[:10]]
    rw.sort(key=lambda x: str(x.get("at") or ""))
    rows = sorted(daten.get("standings", []), key=lambda r: (-(r.get("points") or 0), -((r.get("setsW") or 0) - (r.get("setsL") or 0))))
    wir = [(i + 1, r) for i, r in enumerate(rows) if "skv" in str(r.get("team") or "").lower() or "müritz" in str(r.get("team") or "").lower()]
    saison_txt = f"Saison {jahr}/{str(jahr + 1)[2:]}"
    B = [{"art": "h1c", "runs": [{"t": "Dein Jahr mit Volleyball"}]},
         {"art": "subc", "runs": [{"t": f"{name} · SKV Müritz · {saison_txt} · Stand {ende.astimezone(BERLIN).strftime('%d.%m.%Y')}"}]},
         {"art": "h2box", "runs": [{"t": "Deine Zahlen"}]}]
    def li(t): B.append({"art": "li", "runs": [{"t": t}]})
    tr, sp = z["training"], z["spiele"]
    li(f"Trainings: {tr['dabei']} von {tr['gesamt']} dabei" + (f" ({tr['quote']} %)" if tr["quote"] is not None else ""))
    li(f"Spiele: {sp['dabei']} von {sp['gesamt']} dabei" + (f" ({sp['quote']} %)" if sp["quote"] is not None else ""))
    if z["alle"]["rmquote"] is not None:
        li(f"Rückmeldungen abgegeben: {z['alle']['rmquote']} % aller Termine")
    if punkte:
        li(f"Volleyball-Quiz: {punkte} Punkte gesammelt")
    for platz, r in wir:
        li(f"{r.get('team')}: Platz {platz} von {len(rows)}" + (f" · {r.get('points')} Punkte" if r.get("points") is not None else ""))
    B.append({"art": "leer"})
    B.append({"art": "h2box", "runs": [{"t": "Deine Abzeichen"}]})
    if abz:
        for a in abz:
            li(f"{a['name']} ({a['wert']} %)")
    else:
        B.append({"art": "p", "runs": [{"t": "Noch kein Abzeichen in dieser Saison – die nächste Chance kommt beim nächsten Training."}]})
    B.append({"art": "leer"})
    B.append({"art": "h2box", "runs": [{"t": f"Rückenwind ({len(rw)})"}]})
    if rw:
        for x in rw:
            wann = str(x.get("at") or "")[:10]
            try:
                wann = dt.date.fromisoformat(wann).strftime("%d.%m.%Y")
            except ValueError:
                pass
            teile = list(x.get("kacheln") or [])
            if x.get("text"):
                teile.append("„" + str(x.get("text")) + "“")
            B.append({"art": "li", "runs": [{"t": " · ".join(teile), "b": True}, {"t": f"  – {x.get('vonName') or ''}, {wann}"
                                                                             + (f", {x.get('terminTitel')}" if x.get("terminTitel") else "")}]})
            if x.get("antwort"):
                B.append({"art": "li2", "runs": [{"t": f"Deine Antwort: „{x.get('antwort')}“"}]})
    else:
        B.append({"art": "p", "runs": [{"t": "Noch kein Rückenwind in dieser Saison."}]})
    B.append({"art": "leer"})
    B.append({"art": "kasten", "runs": [{"t": "Danke für deinen Einsatz in dieser Saison. Jedes Training, jede Zusage und jede faire Aktion "
                                              "zählt – für dich und für das Team. Bis zur nächsten Saison!  – Dein Trainerteam"}]})
    return B


def register(app, con, require_portal, err, h):
    @app.get("/api/portal/dein-jahr.pdf")
    def api_dein_jahr():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Der Saisonrückblick ist für das eigene Spielerkonto")
        _v, daten = h["lade_state"]()
        pids = h["sess_player_ids"](sess)
        spieler = next((p for p in daten.get("players", []) if p.get("id") in pids), None)
        if spieler is None:
            return err(404, "Keine Spieler:in mit deinem Konto verknüpft")
        jetzt = dt.datetime.now(dt.timezone.utc)
        jahr, start, ende = saison_grenzen(jetzt, vorige=request.args.get("saison") == "vorige")
        try:
            pdf = h["pdf_brief"].erzeuge_pdf(bloecke(daten, con(), sess["user_id"], spieler, start, ende, jahr),
                                           f"{spieler.get('firstName', '')} · Dein Jahr {jahr}/{str(jahr + 1)[2:]}")
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Dein-Jahr-PDF fehlgeschlagen: %s", e)
            return err(500, "PDF konnte nicht erzeugt werden")
        resp = app.response_class(pdf, mimetype="application/pdf")
        name = f"Dein-Jahr-{jahr}-{str(spieler.get('firstName') or 'Spieler')}".encode("ascii", "ignore").decode()
        resp.headers["Content-Disposition"] = f'inline; filename="{name}.pdf"'
        return resp
