# werkzeuge/ — eigene Dienste statt Knoten-Wildwuchs (Schicht 5)

Wenn Logik in n8n mehr als etwa zehn Knoten oder JavaScript braucht, wird
sie ein kleiner Python-Dienst hier. n8n ruft ihn per HTTP-Request-Knoten
im internen Netz auf (`http://werkzeug-<name>:8000/...`). Vorteile: Tests,
Versionierung, Python statt JavaScript, unabhängig von n8n-Updates.

Kandidaten aus dem Content-Plan:

| Werkzeug | Aufgabe | Stufe |
|---|---|---|
| `slots` | Slot-Planung nach `prompts/07-publishing.md` und `config/kanaele.yaml` | 4 |
| `feed` | Feed-Abgleich gegen `feed_items`, Anlass ableiten | 3 |
| `checks` | deterministische Qualitätsprüfungen (`prompts/05-qualitaet.md`, Tabelle) | 2 |
| `meta` | Instagram-Container-Ablauf (Bild/Carousel/Reel, Status-Polling) | 4 |

Muster je Werkzeug (`werkzeuge/<name>/`): `Dockerfile` (python:3.12-slim,
Flask oder FastAPI, unprivilegierter Nutzer), `app.py`, `test_app.py`,
Eintrag als Compose-Dienst mit `profiles: ["werkzeuge"]`, `networks: [intern]`.
Der Renderer (`../renderer/`) ist das erste Beispiel dieses Musters.
