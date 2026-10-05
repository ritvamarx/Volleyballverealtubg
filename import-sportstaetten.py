"""Sporthallen der letzten beiden Saisons aus den Terminen in state.sportstaetten übernehmen.

Name = Teil vor dem ersten Komma, Adresse = Rest. Bei Auswärtsspielen wird der
Gegner als Heimmannschaft der Halle vermerkt; die eigene Halle bekommt SKV Müritz.
Dedupe per Name (ohne Groß/Klein); bestehende Einträge werden nicht überschrieben,
nur leere Felder ergänzt.
"""
import datetime as dt
import json

import db


def uid(prefix):
    import random
    import string
    return prefix + "-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


con = db.connect()
try:
    for _ in range(4):
        row = db.get_state(con)
        daten = json.loads(row["data"])
        jetzt = dt.datetime.now(dt.timezone.utc)
        jahr = jetzt.year - (1 if jetzt.month < 7 else 0)
        # letzte beiden Saisons: Vorsaison + laufende
        grenze = dt.datetime(jahr - 1, 7, 1, tzinfo=dt.timezone.utc)

        bestand = daten.setdefault("sportstaetten", [])
        index = {s.get("name", "").strip().lower(): s for s in bestand if s.get("name")}

        neu = 0
        ergaenzt = 0
        for e in daten.get("events", []):
            loc = str(e.get("location") or "").strip()
            if not loc or e.get("type") not in ("training", "home", "away"):
                continue
            try:
                start = dt.datetime.fromisoformat(str(e.get("start") or "").replace("Z", "+00:00"))
                if start.tzinfo is None:
                    start = start.replace(tzinfo=dt.timezone.utc)
            except Exception:
                continue
            if start < grenze:
                continue
            teile = [t.strip() for t in loc.split(",")]
            name = teile[0]
            adresse = ", ".join(teile[1:]) if len(teile) > 1 else ""
            if not name:
                continue
            heim = ""
            if e.get("type") == "away" and e.get("opponent"):
                heim = str(e.get("opponent")).strip()
            elif e.get("type") in ("home", "training"):
                heim = "SKV Müritz"
            key = name.lower()
            if key in index:
                s = index[key]
                geaendert = False
                if adresse and not s.get("adresse"):
                    s["adresse"] = adresse
                    geaendert = True
                if heim and not s.get("heimmannschaft"):
                    s["heimmannschaft"] = heim
                    geaendert = True
                if geaendert:
                    ergaenzt += 1
            else:
                s = {"id": uid("st"), "name": name, "adresse": adresse,
                     "ansprechpartner": "", "heimmannschaft": heim,
                     "notizen": "", "bild": ""}
                bestand.append(s)
                index[key] = s
                neu += 1

        if neu == 0 and ergaenzt == 0:
            print("Nichts zu importieren – Bestand:", len(bestand))
            break
        version, _k = db.put_state(con, row["version"],
                                   json.dumps(daten, ensure_ascii=False),
                                   "Sportstätten-Import (letzte 2 Saisons)")
        if version is not None:
            print(f"{neu} Sportstätten neu, {ergaenzt} ergänzt – Bestand jetzt "
                  f"{len(bestand)} (Version {version}).")
            for s in bestand:
                print(" •", s["name"], "|", s.get("adresse") or "—", "|",
                      s.get("heimmannschaft") or "—")
            break
    else:
        print("Konflikt beim Speichern – bitte erneut ausführen.")
finally:
    con.close()
