# W1 · „Briefing → Content-Paket“ (Stufe 1) — Bauanleitung Knoten für Knoten

Ziel: Ein Formular ausfüllen → in unter 3 Minuten kommt ein vollständiges
Content-Paket per E-Mail und liegt in der Hub-DB. Noch kein Publishing.
Die Anleitung ist bewusst als Liste statt als Workflow-Export geschrieben,
weil n8n-Exporte an Knoten-Versionen hängen; nach dem Bau wird der
Workflow mit `scripts/workflows-export.sh` nach `workflows/` exportiert und
committet (Schicht 4). Bauen am besten in der lokalen Werkstatt
(`compose.lokal.yml`), dann `deploy.sh`.

## Vorbereitung in n8n

Credentials: **Postgres** (`postgres`, DB `contenthub`, User/Passwort aus
`.env`), **LLM-Anbieter** (OpenAI oder Anthropic), **SMTP** (Freigabe-Mail).
Workflow „Mandanten laden“ (siehe unten) einmal ausführen.

## Haupt-Workflow W1

| # | Knoten | Einstellungen |
|---|---|---|
| 1 | **Form Trigger** | Felder exakt nach `contenthub/briefing.md`; „Projekt“ als Dropdown (Werte = `mandanten.id`); Dateiupload aktiv; Pfad `briefing`; Antwortseite „Danke – das Paket kommt per E-Mail.“ |
| 2 | **Postgres – Select** | `SELECT * FROM mandanten WHERE id = $1 AND aktiv` mit `{{ $json.Projekt }}` |
| 3 | **Postgres – Insert** | `themen` (mandant_id, titel = Thema, status `produktion`, anlass `briefing`, briefing = gesamtes Formular-JSON, deadline) → `RETURNING id` |
| 4 | **Code** – Uploads ablegen | Binärdateien nach `/files/media/<mandant>/eingang/<thema_id>/`; je Datei Zeile in `medien` (einwilligung `unbekannt`, art `foto`/`grafik`) |
| 5 | **IF** „Recherche nötig?“ | ja → Execute Workflow **Research (02)**; nein → Faktenblatt aus Briefing bauen (Code: jede Zeile aus „Fakten / Material“ = Fakt mit Quelle „briefing“) |
| 6 | **Postgres – Insert** | `faktenblaetter` |
| 7 | **Execute Workflow – Redaktion (03)** | Eingabe: mandant, thema, faktenblatt, medienarchiv_auszug (Select aus `medien` des Mandanten) |
| 8 | **Postgres – Insert** | `content_pakete` |
| 9 | **Split Out** `serie[]` → **Switch** nach `typ` | carousel → 04a · reel → 04b · story → 04c · post/artikel/newsletter/faq/app_meldung → 04d (jeweils Execute Workflow) |
| 10 | **Merge** (alle Format-Zweige) | |
| 11 | **Execute Workflow – Qualität (05)** je Beitrag | Ausgabe = pruefbericht |
| 12 | **IF** `blockiert` | ja → zurück zu 9 mit `hinweise` (max. 2 Schleifen, dann Status `entwurf` + Vermerk); nein → weiter |
| 13 | **Postgres – Insert** | `beitraege` (status `wartet_freigabe`, inhalt, pruefbericht, medien_ids) |
| 14 | **Code – Paket rendern** | Markdown-Mail: Briefing (Original) · Kernbotschaft · je Beitrag: Text/Slides/Drehbuch, Bildwünsche, Prüfbericht (Zusammenfassung, ungedeckte Aussagen, Regelverstöße) · Link zum Board (ab Stufe 2) |
| 15 | **Send Email** | an `freigeber` des Mandanten; Betreff `[Content-Hub] <Mandant>: <Thema> – <n> Beiträge zur Freigabe` |
| 16 | **Postgres – Update** | `themen.status = 'freigabe'` |

Fehlerbehandlung: Workflow-Einstellung „Error Workflow“ = **W0 Fehler**
(Error Trigger → Send Email/Telegram mit Workflow, Knoten, Meldung).

## Sub-Workflows (je einer, alle nach gleichem Muster)

| Knoten | Einstellungen |
|---|---|
| **Execute Workflow Trigger** | Eingabe-JSON wie in `prompts/<nr>.md` „Eingabe“ |
| **Read Files** `/files/prompts/00-gemeinsam.md` + `/files/prompts/<nr>.md` → **Code** (System-Block extrahieren) | Prompt kommt aus der Datei, nicht aus dem Knoten (Schicht 2) |
| **Basic LLM Chain** (AI Agent nur bei 02) | System-Prompt = `{{ $json.praeambel + $json.prompt }}`; Modell und Temperatur aus `config/modelle.yaml` (Schritt-Name); User-Nachricht = `{{ JSON.stringify($json) }}`; Chat Model = Credential des Anbieters; Temperatur 0,3 (Formate 0,6) |
| **Structured Output Parser** | Schema aus der Datei; „Auto-Fix“ aktiv (zweiter LLM-Aufruf bei Schema-Fehler) |
| bei 02: **HTTP Request Tool** „seite_lesen“ | Methode GET, URL vom Modell; davor Code-Node prüft Host gegen `research_allowlist`, sonst Fehlertext zurück; Antwort auf 20.000 Zeichen kürzen, HTML zu Text |
| **Return** | Parser-Ausgabe |

## Hilfs-Workflow „Mandanten laden“

Schedule (stündlich) + manuell: **Read Files** `/files/mandanten/*.yaml` →
Code (YAML → JSON; `js-yaml` ist in n8n-Code-Nodes verfügbar) → Postgres
`INSERT … ON CONFLICT (id) DO UPDATE SET name, typ, profil, aktualisiert`
(`learnings` **nicht** überschreiben — die pflegt der Analyse-Schritt).

## Abnahmetest (Stufe 1)

Briefing: Projekt WerkHausWaren · Thema Reparaturcafé · Anlass „12.10.,
15–18 Uhr, WerkHaus, Eingang Hofseite“ · Fakten „kostenlos; Mitbringen:
kaputte Kleingeräte, Textilien, Fahrräder; drei ehrenamtliche
Reparateure; Kaffee & Kuchen“ · Ziel einladen · Formate Carousel, Post,
Story, App-Meldung · Kanäle Instagram, Facebook, App · Recherche nein.

Erwartung: E-Mail in < 3 min; Carousel 6–8 Slides; Post mit IG- und
FB-Variante; Story 4–6 Frames mit einem Sticker-Vorschlag; App-Meldung
≤ 400 Zeichen; Prüfbericht ohne „widerspruch“; kein Termin/Ort, der nicht
im Briefing steht; Ton du-Form, keine Superlative.
