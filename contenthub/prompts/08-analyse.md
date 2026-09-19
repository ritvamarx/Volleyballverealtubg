# 08 · Analyse-Agent (wöchentlich, Montag 06:00)

Vorher (Code/HTTP-Knoten): Metriken der letzten 28 Tage je
Veröffentlichung abrufen und in `metriken` schreiben — Instagram
`GET /{media-id}/insights?metric=reach,likes,comments,saved,shares,views`,
Facebook `GET /{post-id}/insights?metric=post_impressions_unique,post_engaged_users,post_clicks`,
Website-Statistik (falls vorhanden), App: Push-Zustellungen/Öffnungen aus dem
Container-Log. Dann SQL-Aggregation je Mandant: nach Typ, Kanal, Wochentag,
Uhrzeit, Säule, Motiv (`medien.motiv`, `personen_erkennbar`).

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Werte die aggregierten Kennzahlen des Mandanten aus und
formuliere einen kurzen Wochenreport sowie Learnings-Kandidaten.

- Vergleiche nur Gleiches mit Gleichem (Reel vs. Reel, Carousel vs.
  Carousel). Reichweite und Interaktionsrate (Interaktionen/Reichweite)
  getrennt betrachten.
- Nenne die 3 stärksten und 3 schwächsten Beiträge mit je einem Satz
  Begründung, die sich aus den Daten ergibt (Format, Motiv, Zeit, Säule,
  CTA). Keine Spekulation über Algorithmen.
- learnings_kandidaten: nur Muster, die auf ≥ 4 Beiträgen beruhen und
  einen Unterschied von ≥ 30 % zeigen; formuliere sie als handlungsleitende
  Regel („Beiträge mit Menschen im Bild erreichen ~3× mehr Interaktionen
  als Sachgrafiken → bei Sachthemen mindestens eine Slide mit Menschen“).
- Wenn die Datenbasis zu klein ist, sage das, statt Muster zu erfinden.
```

## Eingabe

`{ mandant, zeitraum, aggregate: { nach_typ: [...], nach_kanal: [...], nach_wochentag_stunde: [...], nach_saeule: [...], nach_motiv: [...] }, top_beitraege: [...], flop_beitraege: [...], anzahl_beitraege }`

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["report_markdown", "top", "flop", "learnings_kandidaten", "datenbasis_ausreichend"],
  "properties": {
    "report_markdown": { "type": "string" },
    "top": { "type": "array", "items": { "type": "object", "properties": { "beitrag_id": { "type": "string" }, "grund": { "type": "string" } } } },
    "flop": { "type": "array", "items": { "type": "object", "properties": { "beitrag_id": { "type": "string" }, "grund": { "type": "string" } } } },
    "learnings_kandidaten": { "type": "array", "items": { "type": "object", "required": ["text", "beleg"], "properties": { "text": { "type": "string" }, "beleg": { "type": "string" } } } },
    "datenbasis_ausreichend": { "type": "boolean" }
  }
}
```

Learnings-Kandidaten landen in `learnings` mit `bestaetigt = false`; im
Board bestätigt → Workflow hängt den Text an `mandanten.learnings` und
damit an jeden künftigen Prompt.
