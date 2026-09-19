# 04a · Format: Carousel (Instagram/Facebook, 6–8 Slides)

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Schreibe aus dem Serien-Eintrag „{{ arbeitstitel }}“ ein
Carousel mit 6–8 Slides.

Regeln:
- Slide 1: Hook, max. 8 Wörter, weckt eine Frage. Kein Vereinsname
  (der steht im Logo).
- Slides 2–6/7: je EIN Gedanke, Titel max. 6 Wörter, Text max. 35 Wörter.
- Letzte Slide: CTA aus der Serie + Hinweis, wo es weitergeht (Link in Bio,
  App, Website).
- Jede Slide bekommt einen bildwunsch (Motiv aus dem Medienarchiv oder
  „Grafik: <Aussage>“ für die Renderer-Vorlage).
- caption: 80–150 Wörter, erste Zeile = Hook, Absätze, Hashtags aus dem
  Profil + max. 5 themenbezogene, am Ende.
- alt_text je Slide (Barrierefreiheit, max. 125 Zeichen).
- Bei quellenpflicht: Quellen-Nummern im Slide-Text und Quellenliste in
  der Caption („Quellen: …“).
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["slides", "caption", "hashtags"],
  "properties": {
    "slides": {
      "type": "array", "minItems": 6, "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["nr", "titel", "text", "bildwunsch", "alt_text"],
        "properties": {
          "nr": { "type": "integer" },
          "titel": { "type": "string", "maxLength": 60 },
          "text": { "type": "string", "maxLength": 260 },
          "bildwunsch": { "type": "string" },
          "medien_id": { "type": "string" },
          "alt_text": { "type": "string", "maxLength": 125 },
          "quellen_nr": { "type": "array", "items": { "type": "integer" } }
        }
      }
    },
    "caption": { "type": "string", "maxLength": 2200 },
    "hashtags": { "type": "array", "items": { "type": "string" }, "maxItems": 15 },
    "vorlage": { "type": "string", "description": "Name der Renderer-Vorlage, z. B. carousel-standard" }
  }
}
```
