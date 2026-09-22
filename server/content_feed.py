"""Content-Feed und Inbox für den Content-Hub (Stufe 3, anbindung/content-feed-spec.md im Repo contenthub).

Zwei token-geschützte Endpunkte:
  GET  /api/content-feed?since=<ISO>&limit=<n>   → öffentliche Termine (Spiele, keine Trainings), Ergebnisse,
                                                    Ankündigungen mit Zielgruppe "oeffentlich"
  POST /api/content/inbox                         → freigegebene Meldung als Ankündigung anlegen (+ Web-Push)
Token: CONTENT_FEED_TOKEN in der .env des Containers (32 Byte hex). Ohne Token sind beide Endpunkte aus (404).
Der Caddy der Vereins-VM gibt die Pfade nur für die private IP der Hub-VM frei.
Es werden NIE Mitglieder-, Kinder- oder Kontaktdaten ausgeliefert: nur Titel, Zeit, Ort, Gegner, Ergebnis.
"""
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

bp = Blueprint("content_feed", __name__)
TOKEN = os.environ.get("CONTENT_FEED_TOKEN", "")
PUBLIC_EVENT_TYPES = {"home", "away", "other", "spiel"}   # Trainings bleiben intern
APP_URL = os.environ.get("APP_PUBLIC_URL", "https://volleyball.nettverwaltet.de")
MANDANT = os.environ.get("CONTENT_FEED_MANDANT", "volleyball-app")


def _authorized() -> bool:
    given = request.headers.get("X-Content-Token", "")
    return bool(TOKEN) and hmac.compare_digest(given, TOKEN)


def _iso(value):
    """ISO-8601-String → aware datetime (naiv = lokale Zeit); None bei Unsinn."""
    if not value:
        return None
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.astimezone()


def _state(con):
    row = bp.db.get_state(con)
    return (json.loads(row["data"]) if row else {}), (row["version"] if row else 0)


@bp.get("/api/content-feed")
def content_feed():
    if not TOKEN:
        return jsonify(error="not found"), 404
    if not _authorized():
        return jsonify(error="unauthorized"), 401
    state, _ = _state(bp.con())
    jetzt = datetime.now(timezone.utc)
    since = _iso(request.args.get("since")) or (jetzt - timedelta(days=30))
    limit = max(1, min(int(request.args.get("limit", 200) or 200), 200))
    items = []
    for ev in state.get("events", []) or []:
        if not isinstance(ev, dict) or ev.get("type") not in PUBLIC_EVENT_TYPES:
            continue
        start = _iso(ev.get("start"))
        if not start:
            continue
        updated = _iso(ev.get("updatedAt")) or start
        items.append({
            "id": str(ev.get("id")), "type": "event", "subtype": ev.get("type"),
            "title": ev.get("title") or (f"Spiel gegen {ev.get('opponent')}" if ev.get("opponent") else "Spiel"),
            "text": ev.get("description") or ev.get("notes") or "",
            "starts_at": start.isoformat(), "ends_at": (_iso(ev.get("end")) or start).isoformat(),
            "location": ev.get("location") or "", "opponent": ev.get("opponent") or None,
            "url": f"{APP_URL}/#kalender", "images": [], "updated_at": updated.isoformat(),
            "extra": {k: ev.get(k) for k in ("category", "team", "abteilung", "liga") if ev.get(k)},
        })
        res = ev.get("result")
        if isinstance(res, dict) and (res.get("headline") or res.get("sets") or res.get("score")):
            items.append({
                "id": "res_" + str(ev.get("id")), "type": "result",
                "title": res.get("headline") or f"{ev.get('title') or 'Spiel'}: {res.get('score') or res.get('sets')}",
                "starts_at": start.isoformat(), "extra": {"sets": res.get("sets"), "score": res.get("score")},
                "updated_at": (_iso(res.get("updatedAt")) or updated).isoformat(),
            })
    for an in state.get("announcements", []) or []:
        if not isinstance(an, dict) or an.get("audience") != "oeffentlich":
            continue
        d = _iso(an.get("date")) or jetzt
        items.append({"id": str(an.get("id")), "type": "call" if an.get("kind") == "aufruf" else "announcement",
                      "title": an.get("title") or "", "text": an.get("body") or "",
                      "published_at": d.isoformat(), "updated_at": d.isoformat(), "url": f"{APP_URL}/#ankuendigungen"})
    items = [i for i in items
             if (_iso(i["updated_at"]) or jetzt) >= since
             or (i.get("starts_at") and (_iso(i["starts_at"]) or jetzt) >= jetzt)]
    items.sort(key=lambda i: i.get("starts_at") or i["updated_at"])
    return jsonify(mandant=MANDANT, generated_at=datetime.now().astimezone().isoformat(), items=items[:limit])


@bp.post("/api/content/inbox")
def content_inbox():
    if not TOKEN:
        return jsonify(error="not found"), 404
    if not _authorized():
        return jsonify(error="unauthorized"), 401
    body = request.get_json(silent=True) or {}
    title, text = (body.get("title") or "").strip(), (body.get("text") or "").strip()
    if not title or not text:
        return jsonify(error="title und text erforderlich"), 400
    audience = body.get("audience") if body.get("audience") in ("alle", "eltern", "spieler", "trainer") else "alle"
    con = bp.con()
    url = f"{APP_URL}/#ankuendigungen"
    hub_id = body.get("beitrag_id")
    state, _ = _state(con)
    for an in state.get("announcements", []) or []:                      # Idempotenz: gleiche Hub-ID → vorhandene Ankündigung
        if hub_id and an.get("hubId") == hub_id:
            return jsonify(id=an["id"], url=url), 200
    neu = {"id": "an_%x" % int(time.time() * 1000), "hubId": hub_id, "title": title[:120], "body": text[:2000],
           "audience": audience, "url": body.get("url") or None, "date": datetime.now().astimezone().isoformat(),
           "source": "content-hub"}

    def mutation(data):
        data.setdefault("announcements", []).insert(0, neu)
        return data
    versuch = bp.db.mutate_state(con, mutation, "Content-Hub")
    if versuch is None:
        return jsonify(error="Konflikt – bitte erneut versuchen"), 409
    if body.get("push") and bp.push is not None:                          # Web-Push wie bei Trainer-Ankündigungen
        try:
            rollen = {"alle": ("trainer", "spieler", "eltern"), "eltern": ("eltern",), "spieler": ("spieler",),
                      "trainer": ("trainer",)}[audience]
            platzhalter = ",".join("?" * len(rollen))
            ids = [r["id"] for r in con.execute(f"SELECT id FROM users WHERE active = 1 AND role IN ({platzhalter})", list(rollen))]
            if ids:
                bp.push.senden(con, title[:60], (body.get("push_text") or text)[:140], "/#ankuendigungen", ids, kategorie="allgemein")
        except Exception:                                                  # Push ist Komfort, nie Grund für einen Fehler
            pass
    return jsonify(id=neu["id"], url=url), 201


def register(app, con, db, push=None):
    """In create_app(): content_feed.register(app, con, db, push) – con/db sind dort Closures bzw. Module."""
    bp.con, bp.db, bp.push = con, db, push
    app.register_blueprint(bp)
