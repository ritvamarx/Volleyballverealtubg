# 02 · Research-Agent (einziger Schritt mit Werkzeug)

n8n: **AI Agent** mit Tool „Seite lesen“ (HTTP Request Tool, GET, nur
Domains aus `research_allowlist`; Code-Node davor prüft die Domain und
lehnt alles andere ab) sowie Tool „Dokument lesen“ (Text aus hochgeladenen
PDFs/Bildern, vorab extrahiert). Maximal 8 Tool-Aufrufe je Lauf.

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Erstelle zum Thema ein Faktenblatt. Du darfst NUR die
übergebenen Materialien (Briefing, Feed-Items, Uploads) und Seiten aus
der Allowlist nutzen. Jede Aussage im Faktenteil braucht eine Quelle mit
Nummer, URL/Dateiname und Abrufdatum.

Vorgehen:
1. Sammle aus Briefing und Materialien, was bereits belegt ist.
2. Prüfe, welche der typischen Fragen (Was? Wo? Wann? Wer? Warum? Kosten?
   Zeitplan? Beschlusslage? Was bedeutet das für die Zielgruppe?) offen sind.
3. Rufe gezielt Seiten der Allowlist ab, um offene Fragen zu klären.
4. Trenne strikt:
   - fakten: belegt, mit Quellen-Nr.
   - nicht_verifiziert: plausibel, aber ohne belastbare Quelle
   - offene_fragen: was der Mensch klären muss (ggf. wen man fragen könnte)
5. Widersprüche zwischen Quellen ausdrücklich benennen.

Bei typ = partei oder Themen mit politischem Bezug: Primärquellen
(Beschlussvorlagen, Protokolle, amtliche Mitteilungen) bevorzugen;
Presseartikel nur als Sekundärquelle kennzeichnen.
```

## Eingabe

```json
{
  "mandant": { "...": "" },
  "thema": { "titel": "…", "briefing": { "…": "" }, "quelle_ref": { "…": "" } },
  "materialien": [ { "art": "feed_item|upload_text|mail", "name": "…", "inhalt": "…" } ],
  "allowlist": ["werkhauswaren.de", "waren-mueritz.de"],
  "heute": "2026-09-19"
}
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["fakten", "quellen", "offene_fragen", "nicht_verifiziert"],
  "properties": {
    "fakten": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["aussage", "quelle_nr"],
        "properties": {
          "aussage": { "type": "string" },
          "quelle_nr": { "type": "array", "items": { "type": "integer" }, "minItems": 1 },
          "kategorie": { "type": "string", "enum": ["was", "wo", "wann", "wer", "warum", "kosten", "zeitplan", "beschluss", "bedeutung", "sonstiges"] }
        }
      }
    },
    "quellen": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["nr", "titel", "art", "abgerufen"],
        "properties": {
          "nr": { "type": "integer" },
          "titel": { "type": "string" },
          "url": { "type": "string" },
          "datei": { "type": "string" },
          "art": { "type": "string", "enum": ["primaer", "sekundaer", "briefing", "feed", "upload"] },
          "abgerufen": { "type": "string" },
          "zitat": { "type": "string", "description": "kurzer Beleg-Ausschnitt" }
        }
      }
    },
    "offene_fragen": { "type": "array", "items": { "type": "string" } },
    "nicht_verifiziert": { "type": "array", "items": { "type": "string" } },
    "widersprueche": { "type": "array", "items": { "type": "string" } }
  }
}
```
