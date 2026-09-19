# 01 · Themen-Agent

Läuft täglich 07:30 (und stündlich für Feed-Items mit Anlass). Bewertet
neue Quellen-Items und schlägt Themen vor. Kein Tool, nur Bewertung.

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Sichte die neuen Quellen-Items und schlage daraus Themen für
den Mandanten vor. Ein Thema ist eine Geschichte, die sich in mehreren
Formaten erzählen lässt – nicht ein einzelner Post.

Bewerte je Thema:
- relevanz 1–5 (5 = jetzt dringend, z. B. Termin in < 7 Tagen, neues
  Ergebnis, Aufruf; 1 = irgendwann)
- content_saeule: genau eine Säule aus dem Profil
- anlass: termin | ergebnis | aufruf | neuigkeit | hintergrund | serie
- moegliche_inhalte: 3–6 konkrete Blickwinkel (Frage-Form bevorzugt)
- recherche_noetig: true, wenn Fakten fehlen, die man nachschlagen kann
- risiko: leer oder Hinweis (politisch, Personen, Minderjährige, Klinik)

Lasse weg: Items, die bereits als Thema existieren (Liste
„bestehende_themen“), reine Interna, alles ohne öffentlichen Bezug.
Bei Vereins-Feeds: Spiele → immer zwei Themen (Ankündigung, Ergebnis)
anlegen, falls noch nicht vorhanden.
```

## Eingabe

```json
{
  "mandant": { "...": "Profil, Learnings" },
  "neue_items": [
    { "quelle": "app_feed|rss|upload|mail|briefing", "container": "werkhaus-app",
      "id": "event-123", "typ": "event", "titel": "…", "text": "…",
      "starts_at": "2026-10-12T15:00:00+02:00", "location": "…", "url": "…",
      "images": ["…"], "updated_at": "…" }
  ],
  "bestehende_themen": [ { "titel": "…", "status": "…", "quelle_ref": "…" } ],
  "heute": "2026-09-19"
}
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["themen"],
  "properties": {
    "themen": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["titel", "relevanz", "content_saeule", "anlass", "begruendung", "moegliche_inhalte", "recherche_noetig", "quelle_ids"],
        "properties": {
          "titel": { "type": "string", "maxLength": 80 },
          "relevanz": { "type": "integer", "minimum": 1, "maximum": 5 },
          "content_saeule": { "type": "string" },
          "anlass": { "type": "string", "enum": ["termin", "ergebnis", "aufruf", "neuigkeit", "hintergrund", "serie"] },
          "begruendung": { "type": "string" },
          "moegliche_inhalte": { "type": "array", "items": { "type": "string" }, "minItems": 3, "maxItems": 6 },
          "recherche_noetig": { "type": "boolean" },
          "risiko": { "type": "string" },
          "vorgeschlagene_deadline": { "type": "string", "format": "date" },
          "quelle_ids": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```
