# Plan: Content-Hub — Content-Automation mit n8n auf dem Hetzner-Server

Stand: September 2026 · Zielbild: **Ein Thema → ein Informationspaket → viele
Formate → mehrere Kanäle**, orchestriert von **n8n auf deinem bestehenden
Hetzner-Server**, mit **Mandanten** (WerkHausWaren, NETT.Waren, SPD Waren,
Klinik Amsee, persönlich, dazu die Vereine der nettverwaltet-Container),
**menschlicher Freigabe vor jeder Veröffentlichung** und einer direkten
Anbindung an die Container unter **nettverwaltet.de**.

Dieser Plan prüft das ChatGPT-Konzept (Abschnitt 2), setzt es auf die
tatsächliche Serverumgebung (Abschnitt 3) und zerlegt es in **acht Stufen**,
die jede für sich ein brauchbares Ergebnis liefern (Abschnitt 7). Die
konkreten Bausteine (Compose-Datei, Caddy-Snippet, Mandantenprofile,
Agenten-Prompts, Datenmodell, Schnittstellen-Spezifikation) liegen im
Ordner `contenthub/` (Anhang).

---

## 1. Kurzfassung

```
Briefing / Fotos / Feed der Vereins-App / RSS
            │
            ▼
   ┌─────────────────────────────────────────────┐
   │  n8n (Orchestrierung)  ·  Postgres (Hub-DB)  │   /opt/contenthub
   │  Themen → Fakten → Redaktion → Formate       │   hinter dem vorhandenen Caddy
   └───────────────┬─────────────────────────────┘
                   ▼
          Freigabe (E-Mail/Telegram, später Board)   ← Mensch, immer
                   ▼
   Instagram · Facebook · Website · Newsletter · Vereins-App (Ankündigung + Push)
                   ▼
          Analyse → Learnings → zurück ins Mandantenprofil
```

**Was sich für dich ändert:** Du gibst ein Briefing (Formular, 2 Minuten) oder
lädst Fotos hoch; die Vereins-Apps liefern Termine und Meldungen von selbst.
Du bekommst ein fertiges Content-Paket zur Freigabe. Erst nach deinem Klick
wird veröffentlicht.

**Drei Grundentscheidungen dieses Plans:**

1. **n8n statt Make, selbst gehostet.** Alles bleibt auf deinem Server, keine
   Abhängigkeit von Operations-Kontingenten, Daten (Briefings, Fotos,
   Faktenblätter) verlassen den Server nur zum LLM-Anbieter.
2. **„Agenten“ sind Sub-Workflows mit festen Ein-/Ausgabeformaten, keine
   frei agierenden Bots.** Nur der Research-Schritt darf Werkzeuge nutzen
   (Webseiten lesen). Alle anderen bekommen strukturierte Eingaben und liefern
   strukturiertes JSON. Das ist billiger, reproduzierbar und prüfbar.
3. **Mandantentrennung ist Daten, nicht Prompt-Text.** Jeder Mandant ist eine
   YAML-Datei (Farben, Tonalität, Content-Säulen, Regeln, Kanäle, Learnings),
   die in jeden Schritt eingespeist wird. Ein Workflow, N Mandanten — keine
   Workflow-Kopien.

## 2. Bewertung des ChatGPT-Konzepts

Das Grundprinzip (ein Thema, gemeinsame Wissensbasis, Formatfächer, Freigabe,
Analyse-Rückkopplung) ist richtig und bleibt. Folgende Punkte habe ich
geändert oder konkretisiert:

| Punkt im ChatGPT-Konzept | Bewertung | Entscheidung in diesem Plan |
|---|---|---|
| 7–10 eigenständige „Agenten“ | Zu viel Autonomie, zu teuer, schwer zu debuggen. Die meisten Schritte sind deterministische Prompt-Aufrufe. | **Ein Haupt-Workflow + 8 Sub-Workflows** (Abschnitt 4.4). Nur *Research* nutzt Tools. Format-Agenten sind reine Prompt-Ketten mit JSON-Schema. |
| Themenboard in Airtable/Notion | Externe SaaS für die zentrale Redaktionsdatenbank, während alles andere auf dem eigenen Server liegt. | **Postgres auf dem Server** (n8n braucht ohnehin eine DB) + **NocoDB** als Kanban-Oberfläche darauf (Stufe 2). Kein Airtable. |
| Reel-Agent „erstellt Kurzvideo“ | Videoschnitt automatisch auf einer 4-GB-VM ist unrealistisch und die Qualität wäre schlecht. | Reel-Agent liefert **Hook, Sprechertext, Szenenliste, Texteinblendungen, Untertitel (SRT) und CTA**. Schnitt bleibt bei dir (CapCut/Canva). Foto-Slideshow-Reels per ffmpeg sind optionale Stufe 7. |
| Story-Agent mit Umfrage/Frage-Sticker | Sticker (Umfrage, Fragen) lassen sich **nicht per API** setzen. | Stories werden als Paket vorbereitet (Bild + Text + Sticker-Vorschlag); du postest sie manuell aus dem Freigabe-Paket. Reine Bild-/Video-Stories später per API. |
| Visual-Agent + „Bildgenerator“ | KI-Bildgenerierung für Vereins-, Klinik- und Politikinhalte ist heikel (Kennzeichnungspflicht, Glaubwürdigkeit). | **Echte Fotos aus deinem Medienarchiv** + **HTML/CSS-Vorlagen je Mandant**, die ein Renderer-Container zu 1080×1350-PNGs macht (Stufe 5). KI-Bilder nur für abstrakte Grafiken, immer gekennzeichnet. |
| Freigabe „jeden Morgen“ | Richtig, aber die Umsetzung fehlte. | n8n-Baustein **„Send and wait“**: E-Mail (Stufe 1, null Einrichtung), Telegram mit Buttons (Stufe 4). Später ein Freigabe-Board in NocoDB. Kein Workflow darf ohne diesen Schritt zum Publishing-Zweig. |
| Publishing „Instagram → Facebook → Website → Newsletter → YouTube“ | Alle vier Kanäle haben unterschiedliche Voraussetzungen; das Konzept unterschlägt Meta-Business-Setup, öffentliche Bild-URLs, App-Berechtigungen. | Publishing wird **kanalweise** eingeführt (Stufe 4): erst Vereins-App + Website, dann Facebook + Instagram über die Meta-Graph-API, dann Newsletter, YouTube/LinkedIn optional. |
| Analyse-Agent „erkennt Muster“ | Gut, aber ohne Datenbasis leer. | Metriken werden je Beitrag in die Hub-DB geschrieben (Stufe 6); Learnings landen **als Text im Mandantenprofil** und fließen so automatisch in die nächste Redaktion. |
| Multi-Mandanten-Struktur | Richtig und wichtig. | Ausgebaut zu **Mandantenprofilen mit Governance-Regeln** (Abschnitt 6): SPD = Quellenpflicht + nie Auto-Publishing; Klinik = Datenschutz/HWG; Vereine = Fotos Minderjähriger nur mit Einwilligung. |
| „ChatGPT als Gehirn“ | n8n ist anbieterneutral. | LLM über die n8n-Chat-Model-Knoten (OpenAI **oder** Anthropic, umschaltbar per Credential). Wichtig ist nur: JSON-Ausgabe, deutschsprachig, Modell mit großem Kontext für Faktenblätter. |
| Fehlt komplett: nettverwaltet-Anbindung | — | Abschnitt 5: **Content-Feed-API** in jedem Vereins-Container, n8n im gleichen Docker-Netz, Rückkanal für Ankündigungen + Web-Push. |
| Fehlt: Recht (KI-Kennzeichnung, Parteienrecht, HWG, Bildrechte) | — | Abschnitt 9. |

## 3. Der Server heute — und was der Content-Hub zusätzlich braucht

> **Entscheidung (siehe `PLAN-INFRASTRUKTUR.md`):** Der Content-Hub läuft auf
> einer **eigenen Hetzner-VM („hub“, 8 GB)** mit eigenem Caddy, verbunden mit
> der bestehenden VM über ein privates Cloud Network. Die bestehende VM bleibt
> reiner Vereinsbetrieb. Die folgenden Absätze beschreiben, was der Hub
> braucht; das Speicherbudget bezieht sich jetzt auf die neue VM.

Stand laut `PLAN-HOSTING.md`: Hetzner-Cloud-VM `ubuntu-4gb-fsn1-1` (4 GB RAM),
Docker Compose, **ein Caddy 2** für alle Domains (nur Caddy hat 80/443),
Flask/SQLite-Container (`werkhaus`, `kitawabe`, `verein`, `wdb`,
`mueritzhilft`, `volleyball`) je mit `.env` + `data/`-Volume, Cron-Jobs in
`/etc/cron.d/`, Deployment per `rsync` + `docker compose up -d --build`.

Der Content-Hub übernimmt dieses Muster auf der **neuen VM**: Ordner
**`/opt/contenthub`**, eigene `docker-compose.yml`, `.env`, `data/`, eigener
Caddy, Backup-Cron in `/etc/cron.d/`. Neu gegenüber der Vereins-VM: Git auf
dem Server ist erlaubt (Prompts, Vorlagen, Workflows ändern sich laufend)
und es gibt eine lokale Werkstatt auf dem Mac mit denselben Dateien.

### Speicherbudget (Richtwerte)

| Komponente | RAM etwa | ab Stufe |
|---|---|---|
| Caddy + 6 Gunicorn-Container (heute) | 0,7–1,0 GB | — |
| n8n (Node, Community-Edition) | 0,4–0,7 GB | 1 |
| Postgres 16 (Hub-DB + n8n-DB) | 0,1–0,2 GB | 1 |
| NocoDB (Themenboard) | 0,3 GB | 2 |
| Renderer (Playwright/Chromium, nur bei Bedarf) | 0,5 GB Spitze | 5 |
| **Summe Vollausbau** | **2,0–2,7 GB** | |

**Entscheidung:** Die Hub-VM wird gleich mit 8 GB angelegt; damit passt der
Vollausbau ohne späteres Rescale. Die Zeile „Caddy + 6 Gunicorn-Container“
bleibt auf der Vereins-VM und belastet den Hub nicht.

### Neue Domains (alle auf die IP der neuen Hub-VM)

| Domain | Dienst | Zugang |
|---|---|---|
| `n8n.nettverwaltet.de` | n8n-Oberfläche + Webhooks | n8n-Login mit 2FA; Oberfläche nur von deiner IP bzw. über Tailscale (Caddy `remote_ip`), Webhook-Pfade öffentlich |
| `hub.nettverwaltet.de` | NocoDB Themenboard (Stufe 2) | NocoDB-Login |
| `media.nettverwaltet.de` | statische Medien (Caddy `file_server` auf `data/media`) | öffentlich lesbar — **Pflicht für Instagram/Facebook**, die Bilder nur per öffentlicher URL annehmen; Dateinamen mit Zufallsanteil, kein Listing |

## 4. Architektur

### 4.1 Komponenten

```
/opt/contenthub
├── docker-compose.yml      n8n · postgres · (nocodb) · (renderer)
├── .env                    Schlüssel, Tokens (nie im Repo)
├── mandanten/*.yaml        Mandantenprofile (Design, Ton, Säulen, Regeln, Kanäle, Learnings)
├── templates/<mandant>/    HTML/CSS-Vorlagen für Carousel/Story-Grafiken (Stufe 5)
└── data/
    ├── n8n/                n8n-Konfiguration
    ├── postgres/           Hub-DB + n8n-DB
    ├── media/              Fotos, gerenderte Grafiken (über media.nettverwaltet.de)
    └── backups/
```

- **n8n** — Orchestrierung: Trigger (Formular, Zeitplan, Webhook, RSS, Feeds
  der Vereins-Apps), LLM-Aufrufe, Freigabe („Send and wait“), Publishing
  (HTTP/Graph-API), Analyse. Läuft mit Postgres statt SQLite, Ausführungsdaten
  werden nach 7 Tagen gelöscht.
- **Postgres** — zwei Datenbanken: `n8n` (intern) und `contenthub` (Redaktion,
  Abschnitt 4.3).
- **NocoDB** (Stufe 2) — Kanban-/Tabellenansicht direkt auf `contenthub`
  (Themen, Status, Freigaben, Kalender). Ersetzt Airtable/Notion.
- **Renderer** (Stufe 5) — kleiner Python/Playwright-Container: HTML-Vorlage +
  JSON → PNG (1080×1350, 1080×1920). Nur intern erreichbar.
- **LLM-API** — extern (OpenAI oder Anthropic, per n8n-Credential wählbar).
  Bekommt Faktenblätter, Briefings, Mandantenprofil — **nie Mitgliederdaten**.
- **Freigabe-Kanal** — E-Mail (Stufe 1), Telegram-Bot mit Buttons (Stufe 4).
- **Kanäle** — Vereins-Apps (nettverwaltet), Website(s), Facebook-Seiten,
  Instagram-Business-Konten, Newsletter, optional YouTube/LinkedIn/Mastodon.

### 4.2 Mandantenprofil (Kern der Trennung)

Eine YAML-Datei je Mandant (`contenthub/mandanten/`), beim Start in die
Hub-DB geladen und in **jeden** LLM-Aufruf als Systemkontext eingesetzt:

```yaml
id: werkhaus
name: WerkHausWaren
typ: verein            # verein | initiative | partei | unternehmen | person
design: {primaer: "#…", schrift: "…", logo: media/werkhaus/logo.png}
tonalitaet: "offen, freundlich, lokal, du-Form, kein Behördendeutsch"
zielgruppen: [Menschen aus Waren und Umgebung, Ehrenamtliche, Familien]
content_saeulen: [Veranstaltungen, Menschen, Ehrenamt, Café, Kino, Reparatur, …]
kanaele: {instagram: "@…", facebook: "…", website: "https://…", app: werkhaus}
hashtags: [...]
pflichttexte: {impressum: "…", hinweis_ki_bild: "Grafik KI-unterstützt erstellt"}
regeln:
  auto_publish: false           # niemals ohne Freigabe (gilt überall)
  quellenpflicht: false         # bei spd-waren: true
  personen_nur_mit_einwilligung: true
  keine_kinderfotos_ohne_einwilligung: true
quellen:                       # was der Themen-Agent beobachtet
  - {typ: app_feed, container: werkhaus-app}
  - {typ: rss, url: "https://…/feed"}
learnings: |                   # vom Analyse-Agent gepflegt
  Beiträge mit Menschen im Bild erreichen ~3× mehr Interaktionen als Sachgrafiken.
```

Vollständige Beispiele: `contenthub/mandanten/werkhaus.yaml`,
`spd-waren.yaml`, `skv-mueritz.yaml`, Schema in `contenthub/mandanten/README.md`.

### 4.3 Datenmodell der Hub-DB (`contenthub/sql/schema.sql`)

| Tabelle | Inhalt |
|---|---|
| `mandanten` | id, name, Profil-YAML (jsonb), Tokens der Kanäle (Verweis auf n8n-Credentials) |
| `themen` | Themenboard: mandant, titel, status (`idee → recherche → produktion → freigabe → geplant → veroeffentlicht → ausgewertet`), relevanz, anlass, deadline, quelle |
| `faktenblaetter` | je Thema: Fakten (jsonb), Quellen mit URL + Datum, offene Fragen, nicht verifiziert |
| `content_pakete` | je Thema: Redaktionsplan (Botschaft, Serie, Formate) |
| `beitraege` | je Format: typ (`reel|carousel|story|post|artikel|newsletter|faq`), Inhalt (jsonb), Medien, Status, Freigabe durch/wann, Änderungswunsch |
| `veroeffentlichungen` | je Beitrag × Kanal: geplant für, veröffentlicht am, Kanal-ID/URL, Fehler |
| `metriken` | je Veröffentlichung × Zeitpunkt: Reichweite, Interaktionen, Klicks (jsonb) |
| `medien` | Fotos/Grafiken: Datei, mandant, Alt-Text, Personen-Einwilligung (ja/nein/unbekannt), Rechte |
| `learnings` | mandant, datum, Text, Quelle (Analyse-Lauf) |

### 4.4 Die Agenten als n8n-Sub-Workflows

Jeder „Agent“ ist ein Sub-Workflow (`Execute Workflow`), der ein JSON bekommt
und ein JSON nach festem Schema zurückgibt (Structured Output Parser). Die
Prompts liegen in `contenthub/prompts/`.

| # | Sub-Workflow | Eingabe | Ausgabe | LLM/Tools | Prompt |
|---|---|---|---|---|---|
| 1 | **Themen** | Mandantenprofil, neue Quellen-Items (Feeds, RSS, Fotos, Briefing) | Themenvorschläge mit Relevanz, Anlass, mögliche Inhalte | LLM, kein Tool | `01-themen.md` |
| 2 | **Research** | Thema, Mandant, erlaubte Quellen (URLs, hochgeladene PDFs, Feed-Items) | Faktenblatt (Fakten, Quellen, offene Fragen, nicht verifiziert) | LLM **mit Tool** „Seite lesen“ (nur Allowlist-Domains) | `02-research.md` |
| 3 | **Redaktion** | Faktenblatt, Briefing, Mandantenprofil inkl. Learnings | Content-Paket: Kernbotschaft, Serie, Formatliste, Reihenfolge, Risiken | LLM | `03-redaktion.md` |
| 4a | **Format: Carousel** | Paket + Faktenblatt + Profil | 6–8 Slides (Titel, Text, Bildwunsch), Caption, Hashtags | LLM | `04a-carousel.md` |
| 4b | **Format: Reel** | dito | Hook, Sprechertext, Szenen, Einblendungen, SRT, CTA | LLM | `04b-reel.md` |
| 4c | **Format: Story** | dito | 4–6 Story-Frames mit Sticker-Vorschlag | LLM | `04c-story.md` |
| 4d | **Format: Post/Artikel/Newsletter** | dito | FB-Post, IG-Caption, Website-Artikel (Markdown), Newsletter-Absatz, FAQ | LLM | `04d-text.md` |
| 5 | **Qualität** | alle Beiträge + Faktenblatt + Regeln | Prüfbericht: Faktenabgleich (jede Aussage ↔ Faktenblatt), Regelverstöße, Kennzeichnungen, Länge/Zeichen je Kanal | LLM, deterministische Checks in Code-Node | `05-qualitaet.md` |
| 6 | **Freigabe** | Paket + Prüfbericht | Entscheidung je Beitrag: freigeben / ändern (mit Text) / ablehnen | **Mensch** (E-Mail/Telegram „Send and wait“) | — |
| 7 | **Publishing** | freigegebene Beiträge, Kanalprofil, Slot-Plan | Veröffentlichungen (geplant/erfolgt), Kanal-IDs | HTTP/Graph-API, kein LLM (Kanal-Anpassung der Texte ist Teil von 4d) | `07-publishing.md` (Slot-Regeln) |
| 8 | **Analyse** | Metriken der letzten 7/28 Tage | Wochenreport + neue Learnings je Mandant | LLM | `08-analyse.md` |

**Haupt-Workflow „Thema → Paket“:** Trigger → Mandant laden → (Research) →
Redaktion → Formate parallel → Qualität → Freigabe → Publishing → Status im
Board. Jeder Schritt schreibt in die Hub-DB, so dass Abbrüche wieder
aufgenommen werden können.

### 4.5 Eingänge (Trigger)

| Eingang | n8n-Trigger | ab Stufe |
|---|---|---|
| **Briefing-Formular** (`contenthub/briefing.md`): Projekt, Thema, Anlass, Material, Ziel, Zielgruppe, Kanäle, Ton, Deadline | Form Trigger (n8n-Formular mit Datei-Upload) | 1 |
| **Foto-Upload** in `data/media/<mandant>/eingang/` (per Nextcloud/rsync/Formular) | Schedule + Dateiliste, oder Form Trigger | 2 |
| **Feeds der Vereins-Apps** (Termine, Meldungen) | Schedule (stündlich) → HTTP zu `…-app:8000/api/content-feed` | 3 |
| **RSS/Websites** (lokale Nachrichten, Stadt, Verband) | RSS Feed Trigger | 2 |
| **E-Mail an eine Redaktionsadresse** (Pressemitteilung weiterleiten) | IMAP-Trigger | 2 |
| **Tagesplan** (jeden Morgen 07:30: Themen-Agent sichtet alles Neue, schickt Vorschlagsliste) | Schedule | 2 |

## 5. Anbindung an nettverwaltet.de (Container / Vereine)

### 5.1 Prinzip

n8n greift **nicht** in die SQLite-Dateien der Vereins-Container (Sperren,
Schema-Kopplung, Datenschutz). Stattdessen bekommt jede Flask-App zwei
kleine, token-geschützte Endpunkte (Spezifikation und Referenz-Code:
`contenthub/anbindung/content-feed-spec.md`):

```
GET  /api/content-feed?since=<ISO>   → öffentliche Items: Termine, Ankündigungen, Ergebnisse, Aufrufe
POST /api/content/inbox              → freigegebene Meldung als Ankündigung anlegen (+ optional Web-Push)
```

Beide nur mit Header `X-Content-Token` (je Container ein eigener Token in
dessen `.env`). Die App entscheidet, was „öffentlich“ ist — der Feed liefert
**nur Inhalte, die ohnehin zur Veröffentlichung gedacht sind** (Veranstaltung,
öffentliche Ankündigung, Spielergebnis), **nie** Mitglieder-, Kinder- oder
Kontaktdaten. Da fünf Container aus **einem** Image gebaut werden, reicht ein
Blueprint einmal für alle; die Volleyball-App bekommt denselben Blueprint in
`server/`.

**Netz:** Hub-VM und Vereins-VM hängen im selben privaten Hetzner Cloud
Network. Der Caddy der Vereins-VM gibt die Feed-/Inbox-Pfade **nur für die
private IP der Hub-VM** frei (`contenthub/anbindung/Caddyfile-vm1-snippet.txt`);
von außen antworten sie mit 404. Kein Hub-Dienst hat Zugriff auf Docker,
Volumes oder Datenbanken der Vereins-Apps.

### 5.2 Container ↔ Mandant

| Container (Server) | Mandant im Hub | Feed liefert | Rückkanal |
|---|---|---|---|
| `werkhaus-app` (mein.werkhauswaren.de) | `werkhaus` | Veranstaltungen (Kino, Café, Reparaturcafé), Projekte, Aufrufe | Ankündigung + Web-Push (pywebpush vorhanden) |
| `volleyball-app` (volleyball.nettverwaltet.de, dieses Repo) | `skv-mueritz` | Heim-/Auswärtsspiele aus dem Kalender, Ankündigungen mit Zielgruppe „öffentlich“, Tabelle | Ankündigung (Trainer sehen sie im Cockpit), später Push |
| `kitawabe` | `kita-wabe` (Bezeichnung bitte bestätigen) | Termine, Elterninfos mit Flag „öffentlich“ | Ankündigung |
| `mueritzhilft` | `mueritzhilft` | Hilfsaufrufe, Termine | Ankündigung + Push |
| `wdb` | *bitte zuordnen* | | |
| `verein` (Demo) | — (Testmandant `demo`) | Testdaten für Entwicklung | — |
| ohne Container | `nett-waren`, `spd-waren`, `klinik-amsee`, `persoenlich` | Briefing, RSS, Uploads | Website/Newsletter |

### 5.3 Beispielabläufe

**Volleyball, Heimspiel:** Samstag 14:00 Heimspiel gegen X in Halle Y steht im
Kalender → Feed liefert das Item am Montag → Themen-Agent schlägt „Heimspiel-
Ankündigung + Helferaufruf“ vor → Redaktion erzeugt FB-Post, IG-Grafik
(Vorlage „Spieltag“ mit Gegner/Zeit/Halle), Story-Frame → Freigabe → Post
Donnerstag 18:00; **Sonntag** holt der Feed das Ergebnis → „Spielbericht kurz“
→ Freigabe → Post. Spielernamen erscheinen nur, wenn im Medienarchiv eine
Einwilligung hinterlegt ist (Regel `personen_nur_mit_einwilligung`).

**WerkHaus, Reparaturcafé:** Termin im Feed + 5 Fotos vom letzten Mal im
Eingang-Ordner → Serie: Carousel „So lief das letzte Reparaturcafé“, Post
„Nächster Termin“, Story mit Frage-Sticker-Vorschlag → nach Freigabe: FB, IG,
**und** Ankündigung in der WerkHausApp mit Push an alle Abonnenten.

**MüritzHilft, Aufruf:** Hilfsaufruf in der App → innerhalb einer Stunde
Vorschlag „Aufruf teilen“ → Freigabe → FB/IG + Website. Hier zeigt sich der
Wert: **eine** Eingabe in der Vereins-App, alle Kanäle bedient.

### 5.4 Datenschutz-Grenze

- Der Feed exportiert nur Items mit ausdrücklichem Öffentlichkeits-Flag.
  In der Volleyball-App sind das Ankündigungen mit Zielgruppe „öffentlich“
  (neu einzuführen) und Kalender-Einträge vom Typ Spiel — keine Rückmeldungen,
  keine Fahrer, keine Finanzen, keine Elterndaten.
- Der Rückkanal legt nur Ankündigungen an, er liest nichts.
- Tokens liegen in der `.env` des jeweiligen Containers und als n8n-Credential;
  Rotation = zwei Dateien ändern.

## 6. Regeln je Mandant (Governance)

Gilt für alle: **Kein Publishing ohne menschliche Freigabe.** Der
Publishing-Sub-Workflow prüft `freigegeben_von` und bricht sonst ab — auch
wenn jemand den Workflow von Hand startet.

| Mandant | Zusätzliche Regeln (im Profil hinterlegt, vom Qualitäts-Schritt geprüft) |
|---|---|
| **SPD Waren / kommunale Arbeit** | `quellenpflicht: true` — jede Sachaussage muss auf eine Quelle im Faktenblatt zeigen; ohne Quelle wird der Beitrag nicht zur Freigabe vorgelegt. Kennzeichnung „V. i. S. d. P.“ als Pflichttext. Keine Formulierung von Positionen, die nicht im Briefing/Beschluss stehen. Kein Bezug auf Wahlen/Kandidaturen ohne explizite Briefing-Freigabe. |
| **Klinik Amsee** | Keine Patientendaten, keine Fallbeschreibungen mit Personenbezug. Mitarbeiterfotos/-zitate nur mit Einwilligung (Medienarchiv-Flag). Keine Heilversprechen, keine Werbung für verschreibungspflichtige Leistungen (HWG-Prüfliste im Prompt). Zusätzlicher Freigeber: Klinik-Kommunikation. |
| **Vereine (SKV, WerkHaus, Kita, MüritzHilft)** | Fotos Minderjähriger und Namen von Spielern/Kindern nur mit Einwilligung. Termine immer mit Ort/Zeit aus dem Feed, nie aus dem Modellgedächtnis. Impressum/Vereinsname als Pflichttext auf Website/Newsletter. |
| **NETT.Waren / Demokratie** | Überparteilich; Beiträge zu politischen Themen bekommen `quellenpflicht: true` und ausdrückliche Kennzeichnung der Initiative. |
| **persönlich** | Lockerste Regeln, aber Kennzeichnung KI-Bilder bleibt. |

## 7. Stufenplan

Jede Stufe endet mit einem Ergebnis, das du sofort nutzen kannst. Aufwand
bezieht sich auf reine Umsetzungszeit; „du“ = Entscheidungen/Zugänge, „ich“ =
Bauarbeit.

| Stufe | Ergebnis | Wer | Aufwand |
|---|---|---|---|
| **0** Vorbereitung | Entscheidungen getroffen, Zugänge da, Mandanten inventarisiert | du | 2–3 h |
| **1** Fundament | Hub-VM steht (`PLAN-INFRASTRUKTUR.md`), n8n + Postgres laufen unter `n8n.nettverwaltet.de`; **Briefing-Formular → Content-Paket per E-Mail** für einen Mandanten | ich (+ du: VM, DNS, API-Key) | 1–2 Runden |
| **2** Wissensbasis & Board | Mandantenprofile, Research-Faktenblatt, Themenboard (NocoDB), Themen-Agent mit Tagesvorschlag | ich | 1–2 Runden |
| **3** nettverwaltet-Anbindung | Content-Feed + Inbox in allen Containern; Volleyball-Heimspiel-Ablauf läuft Ende-zu-Ende bis zur Freigabe | ich (+ du: Deploy `/opt/werkhaus`) | 1–2 Runden |
| **4** Freigabe & Publishing | Telegram-Freigabe mit Buttons; Publishing in Vereins-App, Website, Facebook, Instagram; Slot-Planung | ich (+ du: Meta-Business-Setup) | 2 Runden |
| **5** Visuals | Renderer, HTML-Vorlagen je Mandant, Medienarchiv mit Einwilligungs-Flag, Alt-Texte | ich | 1–2 Runden |
| **6** Analyse & Lernen | Metriken-Abruf, Wochenreport, Learnings im Profil | ich | 1 Runde |
| **7** Ausbau (optional) | Newsletter-Automation, YouTube/LinkedIn/Mastodon, Foto-Slideshow-Reels, WhatsApp-Freigabe | ich | je 1 Runde |

### Stufe 0 — Vorbereitung (du)

1. Entscheidungen: LLM-Anbieter (OpenAI oder Anthropic; AV-Vertrag/DPA des
   Anbieters abschließen), Freigabe-Kanal Stufe 1 (E-Mail-Adresse),
   Startmandant (Empfehlung: **WerkHaus** — unpolitisch, viele Termine, App
   mit Push vorhanden).
2. Zugänge: API-Key des LLM-Anbieters; DNS-Records `n8n`, `hub`, `media`;
   SMTP-Zugang für Freigabe-Mails (vorhandenes Postfach reicht).
3. Mandanten-Inventar ausfüllen: `contenthub/mandanten/README.md` → je Mandant
   Kanäle, Ton, Säulen, Pflichttexte, Regeln. Container `wdb`/`kitawabe`
   zuordnen (Abschnitt 5.2).
4. Meta-Vorbereitung (kann parallel zu Stufe 1–3 laufen, dauert wegen Meta am
   längsten): Facebook-Seiten in einem Business-Portfolio bündeln,
   Instagram-Konten auf „Business“ umstellen und mit den Seiten verknüpfen,
   Meta-App anlegen (Berechtigungen `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`).
   Für eigene Seiten/Konten von Personen mit Rolle in der App reicht in der
   Regel Standard-Zugriff ohne App-Review; System-User-Token ohne Ablauf über
   das Business-Portfolio. Ist zu verifizieren, sobald die App steht.

### Stufe 1 — Fundament

- **1a Infrastruktur** nach `PLAN-INFRASTRUKTUR.md` Schritte I-1 bis I-4:
  Hub-VM, Cloud Network, Firewall, Grundinstallation (`scripts/setup-vm.sh`),
  Repo `contenthub`, lokale Werkstatt, Backup mit Restore-Probe.
- **1b** `/opt/contenthub` aus dem Repo (`deploy.sh`): eigener Caddy
  (`contenthub/Caddyfile`), n8n mit Postgres, `GENERIC_TIMEZONE=Europe/Berlin`,
  `N8N_ENCRYPTION_KEY`, Ausführungsdaten-Pruning, Task-Runner aktiv.
- n8n-Owner-Konto + 2FA; Credentials: LLM-API, SMTP.
- Backup-Cron `contenthub/cron/contenthub-backup` (pg_dump beider DBs +
  `n8n export:workflow --all` + `data/media`), Ziel wie die vereins-backups.
- Hub-DB anlegen (`contenthub/sql/schema.sql`), Mandantenprofil `werkhaus`
  laden.
- **Workflow W1 „Briefing → Paket“** (Bauanleitung Knoten für Knoten:
  `contenthub/workflows/W1-briefing-paket.md`): Form Trigger → Mandant laden →
  Redaktion → Formate 4a/4d → Qualität → E-Mail mit dem kompletten Paket
  (Markdown) + Speicherung in `beitraege`. Noch **kein** Publishing; du
  kopierst freigegebene Texte selbst.

**Abnahme:** Briefing „Reparaturcafé, nächster Termin, 5 Fotos“ liefert in
unter 3 Minuten ein Paket mit Carousel-Struktur, FB-Post, IG-Caption,
Website-Artikel und Prüfbericht, im WerkHaus-Ton, ohne erfundene Fakten (alle
Angaben stammen aus dem Briefing).

### Stufe 2 — Wissensbasis & Themenboard

- Alle Mandantenprofile anlegen; Loader-Workflow liest `mandanten/*.yaml`
  in die DB (Änderung = Datei bearbeiten + Workflow anstoßen).
- **Research-Sub-Workflow** mit Tool „Seite lesen“ (HTTP-Request-Tool,
  Allowlist je Mandant: eigene Website, Stadt Waren, Landkreis, VVMV, lokale
  Presse-RSS); PDF-Upload im Briefing wird zu Text extrahiert und als Quelle
  geführt. Ausgabe = Faktenblatt-Schema; **Aussagen ohne Quelle landen
  zwingend unter „nicht verifiziert“**.
- **NocoDB** auf die Hub-DB: Kanban „Themen“ nach Status, Tabellen
  „Beiträge“, „Kalender“; Status-Änderung im Board löst per Webhook den
  nächsten Schritt aus (z. B. `recherche → produktion`).
- **Themen-Agent** täglich 07:30: sichtet neue RSS-Items, Uploads, E-Mails
  der Redaktionsadresse; schreibt Vorschläge mit Relevanz in `themen`
  (Status `idee`) und schickt dir eine Liste. Du schiebst gute Ideen per
  Board auf `recherche`.

**Abnahme:** Thema „Neue Grundschule Waren“ nur als Titel ins Board →
Faktenblatt mit mindestens drei Quellen-URLs, offene Fragen gelistet, keine
Aussage ohne Quelle im Faktenteil.

### Stufe 3 — nettverwaltet-Anbindung

- Blueprint `content_feed` nach `contenthub/anbindung/content-feed-spec.md`
  in die gemeinsame Flask-Codebasis (`/opt/werkhaus`, ein Image → fünf
  Container) und in `server/` dieses Repos. Je App die Abbildung „was ist
  öffentlich“: Volleyball = Ankündigungen mit neuer Zielgruppe „öffentlich“
  + Kalender-Spiele + Tabelle; WerkHaus = Veranstaltungen/Projekte; usw.
- Token je Container in `.env`, als n8n-Credential hinterlegen.
- **Workflow W3 „Feed-Sichtung“** stündlich: alle Feeds abrufen, neue Items
  als Themen-Kandidaten mit Anlass (`termin_in_5_tagen`, `ergebnis_neu`,
  `aufruf_neu`) anlegen; Regelwerk je Anlass (Spieltag: Ankündigung 3 Tage
  vorher, Ergebnis am selben Abend).
- **Rückkanal:** Publishing-Zweig „app“ postet die freigegebene Kurzfassung
  in `/api/content/inbox`, die App legt eine Ankündigung an und (WerkHaus,
  MüritzHilft) sendet Web-Push.

**Abnahme:** Heimspiel im Volleyball-Kalender eintragen → Vorschlag im Board
innerhalb einer Stunde → Paket zur Freigabe → nach Freigabe steht die
Ankündigung in der Volleyball-App.

### Stufe 4 — Freigabe & Publishing

- **Freigabe per Telegram** („Send message and wait for approval“, Buttons
  Freigeben / Ändern / Ablehnen; „Ändern“ öffnet ein kleines n8n-Formular für
  den Änderungswunsch → Beitrag geht zurück in den Format-Schritt mit dem
  Hinweis). E-Mail bleibt als Fallback. Für SPD und Klinik: zweiter Freigeber
  konfigurierbar (beide müssen freigeben).
- **Publishing-Sub-Workflow** kanalweise:
  1. Vereins-App (Stufe 3) und **Website** (WordPress-REST-API oder Flask-App,
     Artikel als Entwurf oder direkt, je Profil).
  2. **Facebook-Seite**: `POST /{page-id}/feed` bzw. `/photos`, geplante
     Veröffentlichung über `scheduled_publish_time`.
  3. **Instagram**: Bild/Carousel/Reel über Container-Objekte
     (`/{ig-user-id}/media` → `/media_publish`); Bilder müssen unter
     `media.nettverwaltet.de` öffentlich liegen; Reels als MP4 ebenfalls.
     Stories nur als Bild/Video, Sticker manuell.
  4. **Newsletter** (Brevo/Mailchimp-Knoten oder vorhandenes Tool):
     Newsletter-Absatz als Entwurf in die Kampagne.
- **Slot-Planung** (`prompts/07-publishing.md`): je Mandant Standard-Slots
  (z. B. IG Di/Do 18:00, FB 15 Min. später, Website morgens, Newsletter
  Donnerstag), Kollisionen zwischen Mandanten vermeiden, Tabelle
  `veroeffentlichungen` als Redaktionskalender in NocoDB.
- Fehlerbehandlung: Kanal-Fehler → Telegram-Nachricht mit Retry-Button;
  kein stiller Ausfall.

**Abnahme:** Ein freigegebenes WerkHaus-Paket erscheint zeitversetzt auf
Facebook, Instagram, Website und in der WerkHausApp mit Push; alle vier
Veröffentlichungen mit URL im Kalender.

### Stufe 5 — Visuals

- **Renderer-Container** (`contenthub/docker-compose.yml`, Dienst `renderer`):
  Flask + Playwright, `POST /render {template, mandant, daten, format}` →
  PNG nach `data/media/<mandant>/render/`. Vorlagen `templates/<mandant>/`
  (Carousel-Slide, Story, Spieltag, Zitat, Veranstaltung) als HTML/CSS mit
  den Profil-Farben/-Schriften.
- **Medienarchiv:** Upload-Ordner je Mandant; Workflow verschlagwortet neue
  Fotos per Vision-Modell (Alt-Text, Motiv, „Personen erkennbar: ja/nein“),
  Einwilligungs-Flag setzt du im Board; Format-Agenten wählen aus dem Archiv
  nach Motivwunsch und Einwilligung.
- KI-Bilder nur auf ausdrücklichen Briefing-Wunsch, automatisch mit
  Pflichthinweis aus dem Profil.
- Optional: Canva-Anbindung (Brand-Kits je Mandant; die Autofill-API
  erfordert Canva Enterprise — daher nur als manueller Weg: Paket liefert
  Texte + Bildwünsche, du füllst die Brand-Vorlage).

**Abnahme:** Carousel-Paket enthält 7 fertige PNGs im WerkHaus-Design mit
Fotos aus dem Archiv; Instagram-Publishing nutzt diese direkt.

### Stufe 6 — Analyse & Lernen

- Wöchentlicher Workflow: Insights je Veröffentlichung (Facebook/Instagram
  Insights-API: Reichweite, Interaktionen, Speicherungen, Klicks; Website:
  vorhandene Statistik; App: Push-Öffnungen) → `metriken`.
- Analyse-Sub-Workflow: Vergleich nach Format, Motiv (Menschen/Sachgrafik),
  Wochentag/Uhrzeit, Content-Säule → Wochenreport per Telegram/E-Mail +
  **Vorschlag neuer Learnings**, die du im Board bestätigst; bestätigte
  Learnings wandern ins Mandantenprofil und damit in den Redaktions-Prompt.

**Abnahme:** Nach vier Wochen zeigt der Report je Mandant die drei
erfolgreichsten und schwächsten Beiträge mit Begründung; mindestens ein
Learning ist im Profil aktiv.

### Stufe 7 — Ausbau (optional, je nach Bedarf)

Newsletter komplett (Zusammenstellung aus den Beiträgen der Woche),
YouTube-Shorts/LinkedIn/Mastodon/Bluesky-Zweige, Foto-Slideshow-Reels per
ffmpeg mit TTS-Sprecher, WhatsApp-Business-Freigabe (Meta-Setup aus Stufe 4
liegt dann schon vor), Sitzungsunterlagen-Ingest für kommunale Themen
(Ratsinformationssystem-RSS/PDF).

## 8. Betrieb

| Thema | Umsetzung |
|---|---|
| **Deployment** | `deploy.sh` (rsync → `docker compose up -d` → Workflow-Import) oder `git pull` auf der Hub-VM; Workflows liegen als JSON im Repo |
| **Updates** | n8n-Image monatlich heben (`docker compose pull && up -d`), vorher Backup; Postgres-Major-Version fest pinnen |
| **Backups** | Cron 03:45 täglich: `pg_dump` beider DBs, Workflow-Export, `data/media` → gleiches Ziel wie die vereins-backups (außerhalb der VM!) |
| **Monitoring** | Healthcheck-Cron wie bei den Apps; n8n-Fehler-Workflow (Error Trigger) schickt Telegram/E-Mail bei jedem Workflow-Fehler |
| **Zugang** | n8n-Oberfläche: Login + 2FA, zusätzlich Caddy-`basicauth` oder IP-Allowlist auf `/` (Webhook-Pfade `/webhook/*`, `/form/*` bleiben frei); NocoDB-Login; media-Domain read-only |
| **Secrets** | `.env` (DB, Encryption-Key), alles Weitere in n8n-Credentials (verschlüsselt mit `N8N_ENCRYPTION_KEY` — dieser Schlüssel gehört ins Backup, sonst sind Credentials nach Restore unlesbar) |
| **Kosten (Schätzung)** | siehe Tabelle |

| Posten | etwa je Monat |
|---|---|
| eigene Hub-VM 8 GB inkl. Backup-Option | ~8–9 € |
| LLM-API bei ~40 Paketen/Monat mit Research | 10–30 € |
| Meta-APIs, Telegram, n8n Community | 0 € |
| Newsletter-Dienst (falls neu) | 0–20 € |

## 9. Recht & Datenschutz

- **Auftragsverarbeitung:** AV-Vertrag Hetzner (vorhanden) + DPA des
  LLM-Anbieters (EU-Datenverarbeitung wählen, wo angeboten; kein Training
  auf den Daten — Business-/API-Konditionen prüfen).
- **Was zum LLM geht:** Briefings, Faktenblätter, Profile, öffentliche
  Feed-Items, Fotos zur Verschlagwortung. **Nicht:** Mitgliederlisten,
  Kontaktdaten, Rückmeldungen, Finanzen, Elterndaten. Der Feed erzwingt das
  technisch (Abschnitt 5.4).
- **KI-Kennzeichnung (KI-Verordnung Art. 50, gilt seit 2. Aug. 2026):**
  KI-generierte oder -manipulierte Bilder/Videos werden maschinenlesbar und
  sichtbar gekennzeichnet (Pflichttext im Profil; Meta-Label „KI-Info“ beim
  Upload setzen). KI-unterstützte **Texte** sind durch die menschliche
  Freigabe mit redaktioneller Verantwortung abgedeckt; für Beiträge im
  öffentlichen Interesse (SPD, NETT.Waren, Klinik) bleibt die namentliche
  Verantwortung (V. i. S. d. P.) Pflicht.
- **Bildrechte/Einwilligungen:** Medienarchiv führt je Foto Einwilligung
  und Urheber; Minderjährige nur mit Einwilligung der Sorgeberechtigten —
  passt zur Einverständnis-Verwaltung der Volleyball-App (dort kann ein
  Formular „Fotoveröffentlichung“ ergänzt werden, dessen Status der Feed als
  `foto_einwilligung` pro Spieler-ID **ohne Namen** mitliefern kann).
- **Parteipolitik:** Kennzeichnung, keine Vermischung mit Vereins-Mandanten
  (getrennte Profile, getrennte Kanäle, Qualitäts-Check schlägt bei
  Parteinennung in Vereins-Beiträgen an).
- **Klinik:** HWG-Prüfliste, keine Patientendaten, zweite Freigabe.
- **Impressum/Datenschutz** für `hub`/`n8n`/`media` unnötig (keine
  öffentlichen Inhalte außer Mediendateien), Website-Beiträge tragen das
  Impressum der jeweiligen Website.

## 10. Risiken & Grenzen (ehrlich)

- **Meta-Setup** ist der langsamste und fehleranfälligste Teil (Business-
  Verifizierung, Token-Ablauf, Berechtigungen). Deshalb parallel ab Stufe 0
  starten; bis dahin manuelles Posten aus dem Freigabe-Paket.
- **Halluzinationen:** Faktenblatt + Qualitäts-Check + Freigabe sind drei
  Netze, aber kein Ersatz für Lesen. Bei SPD/Klinik bleibt jede Zahl Prüfsache.
- **Zwei Server** bedeuten zwei Mal Betriebssystem-Pflege; auf der Hub-VM
  übernimmt `unattended-upgrades`, Docker-Images hebst du bewusst.
- **Stories mit Stickern, Reel-Schnitt, Canva-Autofill** bleiben manuell.
- **n8n-Updates** ändern gelegentlich Knoten-Verhalten; deshalb Workflow-
  Exporte im Backup und Updates nur nach Backup.
- **Ein Freigeber (du) ist der Engpass** — das ist gewollt. Der Tagesplan
  bündelt alles in eine Freigabe-Runde morgens; nichts ist zeitkritisch,
  Slots werden automatisch nach hinten geschoben, wenn die Freigabe fehlt.

## 11. Nächste Schritte

1. **Du:** Stufe 0 — Anbieter, Startmandant, DNS, API-Key, Mandanten-Inventar
   (`contenthub/mandanten/README.md`), Zuordnung `wdb`/`kitawabe`.
2. **Ich:** Stufe 1 — Deployment-Paket finalisieren (`contenthub/`), W1
   bauen und mit dem WerkHaus-Briefing „Reparaturcafé“ abnehmen.
3. Danach Stufe 2 und 3 in der Reihenfolge; Meta-Setup läuft parallel.

Offene Entscheidungen für dich: LLM-Anbieter; Telegram als Freigabe-Kanal
ab Stufe 4 (oder gleich E-Mail behalten); Website-Systeme je Mandant
(WordPress? statisch? Flask-App?); Newsletter-Tool im Bestand.

## Anhang: Dateien in `contenthub/`

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | n8n, Postgres, (NocoDB), (Renderer) — für `/opt/contenthub` |
| `.env.example` | Vorlage für Schlüssel und Tokens |
| `Caddyfile` | eigener Caddy der Hub-VM: `n8n`, `hub`, `media` |
| `compose.lokal.yml` | lokale Werkstatt auf dem Mac |
| `config/modelle.yaml`, `config/kanaele.yaml` | Modell je Schritt, Kanal-Limits (Schicht 1) |
| `scripts/`, `deploy.sh` | Grundinstallation der VM, Workflow-Export/-Import, Deployment |
| `werkzeuge/README.md` | Muster für eigene Python-Dienste (Schicht 5) |
| `anbindung/Caddyfile-vm1-snippet.txt` | Feed-Freigabe auf der Vereins-VM nur für die Hub-IP |
| `cron/contenthub-backup` | Backup-Cron nach dem Muster der vereins-backups |
| `sql/schema.sql` | Hub-Datenmodell (Abschnitt 4.3) |
| `mandanten/README.md`, `mandanten/*.yaml` | Profil-Schema und drei Beispielprofile |
| `briefing.md` | Standard-Briefing (Felder des n8n-Formulars) |
| `prompts/*.md` | System-Prompts und JSON-Schemata der Sub-Workflows |
| `workflows/W1-briefing-paket.md` | Bauanleitung des ersten Workflows, Knoten für Knoten |
| `anbindung/content-feed-spec.md` | Feed-/Inbox-API für die nettverwaltet-Container mit Referenz-Blueprint |
