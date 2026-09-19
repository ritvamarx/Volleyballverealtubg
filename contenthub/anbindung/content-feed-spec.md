# Anbindung der nettverwaltet-Container: Content-Feed und Inbox

Zwei kleine, token-geschützte Endpunkte je Flask-Container. Der Hub läuft
auf einer **eigenen VM** (siehe `PLAN-INFRASTRUKTUR.md`); n8n ruft die
Endpunkte über das **private Hetzner Cloud Network** auf. Der Caddy auf der
nettverwaltet-VM gibt die Pfade nur für die private IP der Hub-VM frei
(`Caddyfile-vm1-snippet.txt`), von außen antworten sie mit 404. Der Feed liefert ausschließlich Inhalte,
die zur Veröffentlichung gedacht sind; der Rückkanal legt nur
Ankündigungen an.

Da `werkhaus`, `kitawabe`, `verein`, `wdb` und `mueritzhilft` aus **einem**
Image gebaut werden, reicht **ein** Blueprint in der gemeinsamen Codebasis
(`/opt/werkhaus`); die Volleyball-App (dieses Repo, `server/`) bekommt
denselben Blueprint mit eigener Abbildung ihrer Daten.

## Authentifizierung

- Header `X-Content-Token: <token>`; Token steht in der `.env` des
  Containers als `CONTENT_FEED_TOKEN` (32 Byte hex, je Container eigener
  Wert) und als n8n-Credential (Header Auth).
- Fehlender/falscher Token → `401`, ohne weitere Information. Vergleich
  zeitkonstant (`hmac.compare_digest`).
- Kein Token gesetzt → beide Endpunkte deaktiviert (`404`).

## `GET /api/content-feed`

Parameter: `since` (ISO-8601, optional; ohne → letzte 30 Tage und alle
zukünftigen Termine), `limit` (max. 200).

```json
{
  "mandant": "volleyball-app",
  "generated_at": "2026-09-19T08:00:00+02:00",
  "items": [
    {
      "id": "ev_k3f9a2",
      "type": "event",
      "subtype": "home",
      "title": "Heimspiel vs. SV Rostock",
      "text": "",
      "starts_at": "2026-09-27T11:00:00+02:00",
      "ends_at": "2026-09-27T14:00:00+02:00",
      "location": "Sporthalle SKV, Halle 1",
      "opponent": "SV Rostock",
      "url": "https://volleyball.nettverwaltet.de/#kalender",
      "images": [],
      "updated_at": "2026-09-01T10:12:00+02:00",
      "extra": { "abteilung": "Herren I", "liga": "Verbandsliga MV" }
    },
    {
      "id": "an_7hq1",
      "type": "announcement",
      "title": "Probetraining für Jahrgang 2013/2014",
      "text": "…",
      "published_at": "2026-09-18T19:30:00+02:00",
      "updated_at": "2026-09-18T19:30:00+02:00"
    },
    {
      "id": "res_ev_k3f9a2",
      "type": "result",
      "title": "SKV Müritz – SV Rostock 3:1",
      "starts_at": "2026-09-27T11:00:00+02:00",
      "extra": { "sets": "25:21, 23:25, 25:18, 25:20" },
      "updated_at": "2026-09-27T14:40:00+02:00"
    }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | stabil je Item (bei Änderung gleiche id, neues `updated_at`) |
| `type` | ja | `event` · `announcement` · `result` · `call` (Aufruf) · `news` · `project` |
| `subtype` | nein | z. B. `home`/`away`/`other` bei Spielen, `kino`/`cafe`/`reparatur` bei WerkHaus |
| `title`, `text` | ja / nein | Klartext, kein HTML |
| `starts_at`, `ends_at`, `location` | bei event/result | ISO mit Zeitzone |
| `images` | nein | öffentliche URLs (nur Bilder mit Einwilligung/Rechten) |
| `updated_at` | ja | für `since`-Filter und Dubletten |
| `extra` | nein | app-spezifisch, frei |

**Was ist „öffentlich“?** Das entscheidet jede App selbst — Stufe 3 führt
dafür je App ein Flag ein:

| App | öffentlich sind … | Neu einzuführen |
|---|---|---|
| volleyball-app | Kalender-Einträge vom Typ `home`/`away`/`other` (keine Trainings), Ankündigungen mit Zielgruppe `oeffentlich`, Tabelle, Ergebnisse | Zielgruppe `oeffentlich` bei Ankündigungen; Ergebnis-Felder am Spiel (Sätze) |
| werkhaus-app | Veranstaltungen, Projekte, Aufrufe, die auf der Website sichtbar sind | vermutlich nichts (Website-Flag existiert) |
| kitawabe | Termine/Elterninfos mit Flag „öffentlich“ | Flag |
| mueritzhilft | Hilfsaufrufe, Termine | prüfen |

**Nie im Feed:** Rückmeldungen, Fahrer, Jobs, Finanzen, Kontaktdaten,
Namen von Kindern/Spielern, Einverständnisse. Optional (Stufe 5): eine
anonyme Liste `foto_einwilligung: ["sp_…", …]` mit Spieler-IDs (ohne
Namen), damit der Hub weiß, für welche Personen Bildfreigaben vorliegen.

## `POST /api/content/inbox`

Legt eine Ankündigung/Meldung in der App an, optional mit Web-Push.

```json
{
  "beitrag_id": "5f1c…",                       // Hub-ID, für Idempotenz
  "title": "Heimspiel am Samstag – kommt vorbei!",
  "text": "Samstag 11:00, Sporthalle SKV, Halle 1: Herren I gegen SV Rostock. …",
  "audience": "alle",                          // alle | eltern | mitglieder (App-abhängig)
  "url": "https://www.skv-mueritz.de/…",       // optional
  "push": true,                                // nur wo pywebpush vorhanden
  "push_text": "Heimspiel Samstag 11 Uhr – wir freuen uns auf euch!"
}
```

Antwort `201 { "id": "an_…", "url": "…" }`; gleiche `beitrag_id` erneut →
`200` mit vorhandener ID (kein Duplikat). Fehler → `4xx/5xx` mit
`{"error": "…"}`; n8n zeigt das in der Fehler-Meldung.

## Referenz-Blueprint (Volleyball-App, Flask)

Für die Volleyball-App liegt der gesamte Datenbestand als JSON in
`app_state.data` (siehe `server/db.py`). Der Feed liest daraus; die Inbox
hängt eine Ankündigung an und erhöht die Version wie ein Trainer-Save
(Autor „Content-Hub“). Skizze, in Stufe 3 in `server/content_feed.py`
umzusetzen und in `create_app()` zu registrieren:

```python
# server/content_feed.py  (Skizze – Stufe 3)
import hmac, json, os, time
from datetime import datetime, timedelta, timezone
from flask import Blueprint, jsonify, request, current_app

bp = Blueprint("content_feed", __name__)
TOKEN = os.environ.get("CONTENT_FEED_TOKEN", "")
PUBLIC_EVENT_TYPES = {"home", "away", "other"}          # keine Trainings

def _authorized() -> bool:
    given = request.headers.get("X-Content-Token", "")
    return bool(TOKEN) and hmac.compare_digest(given, TOKEN)

def _state(con):
    row = current_app.db.get_state(con)
    return (json.loads(row["data"]) if row else {}), (row["version"] if row else 0)

@bp.get("/api/content-feed")
def content_feed():
    if not TOKEN:  return jsonify(error="not found"), 404
    if not _authorized(): return jsonify(error="unauthorized"), 401
    state, _ = _state(current_app.con())
    since = request.args.get("since")
    cutoff = datetime.fromisoformat(since) if since else datetime.now(timezone.utc) - timedelta(days=30)
    items = []
    for ev in state.get("events", []):
        if ev.get("type") not in PUBLIC_EVENT_TYPES: continue
        items.append({
            "id": ev["id"], "type": "event", "subtype": ev["type"], "title": ev["title"],
            "text": ev.get("description", ""), "starts_at": ev["start"], "ends_at": ev.get("end"),
            "location": ev.get("location"), "opponent": ev.get("opponent") or None,
            "url": "https://volleyball.nettverwaltet.de/#kalender",
            "images": [], "updated_at": ev.get("updatedAt") or ev["start"],
        })
        if ev.get("result"):                                    # Stufe 3: Ergebnis-Felder am Spiel
            items.append({"id": "res_" + ev["id"], "type": "result", "title": ev["result"]["headline"],
                          "starts_at": ev["start"], "extra": {"sets": ev["result"].get("sets")},
                          "updated_at": ev["result"]["updatedAt"]})
    for an in state.get("announcements", []):
        if an.get("audience") != "oeffentlich": continue        # neue Zielgruppe, Stufe 3
        items.append({"id": an["id"], "type": "announcement", "title": an["title"], "text": an["body"],
                      "published_at": an["date"], "updated_at": an["date"]})
    items = [i for i in items if datetime.fromisoformat(i["updated_at"]) >= cutoff
             or (i.get("starts_at") and datetime.fromisoformat(i["starts_at"]) >= datetime.now(timezone.utc))]
    return jsonify(mandant="volleyball-app", generated_at=datetime.now().astimezone().isoformat(),
                   items=items[: int(request.args.get("limit", 200))])

@bp.post("/api/content/inbox")
def content_inbox():
    if not TOKEN:  return jsonify(error="not found"), 404
    if not _authorized(): return jsonify(error="unauthorized"), 401
    body = request.get_json(silent=True) or {}
    if not body.get("title") or not body.get("text"): return jsonify(error="title und text erforderlich"), 400
    con = current_app.con()
    state, version = _state(con)
    anns = state.setdefault("announcements", [])
    for an in anns:                                              # Idempotenz
        if an.get("hubId") == body.get("beitrag_id"):
            return jsonify(id=an["id"], url="https://volleyball.nettverwaltet.de/#ankuendigungen"), 200
    an = {"id": "an_%x" % int(time.time() * 1000), "hubId": body.get("beitrag_id"),
          "title": body["title"], "body": body["text"], "audience": body.get("audience", "alle"),
          "url": body.get("url"), "date": datetime.now().astimezone().isoformat()}
    anns.insert(0, an)
    new_version, conflict = current_app.db.put_state(con, version, json.dumps(state, ensure_ascii=False), "Content-Hub")
    if new_version is None: return jsonify(error="Konflikt – bitte erneut versuchen"), 409
    # push: Stufe 4, sobald pywebpush in dieser App vorhanden ist (wie WerkHausApp)
    return jsonify(id=an["id"], url="https://volleyball.nettverwaltet.de/#ankuendigungen"), 201
```

Anpassungen für die gemeinsame Flask-Plattform (`/opt/werkhaus`): gleiche
Endpunkte, aber Abbildung auf deren Tabellen (Veranstaltungen, Meldungen)
und Aufruf der vorhandenen `pywebpush`-Funktion bei `push: true`.

## n8n-Seite (Workflow W3 „Feed-Sichtung“)

1. Schedule (stündlich) → für jeden Mandanten mit `quellen[].typ = app_feed`:
   HTTP GET `{{ $env.CONTENTHUB_FEED_BASE }}/api/content-feed?since=<letzter Lauf>`
   (privates Netz, siehe `Caddyfile-vm1-snippet.txt`) mit Header-Auth-Credential.
2. Code-Node: Items gegen `feed_items` abgleichen (neu oder `updated_at`
   neuer) → nur diese weiter.
3. Anlass ableiten: `event` mit `starts_at` in 3–10 Tagen → `termin`;
   `result` → `ergebnis`; `call` → `aufruf`; sonst `neuigkeit`.
4. Sub-Workflow **Themen** (01) mit den neuen Items → Themen mit Status
   `idee` (Relevanz ≥ 4 direkt `recherche`, wenn `recherche_noetig`,
   sonst `produktion`).
5. `feed_items` fortschreiben; Tagesliste an den Freigeber.
