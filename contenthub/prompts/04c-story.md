# 04c · Format: Story-Sequenz (4–6 Frames)

Stories mit Stickern (Umfrage, Frage, Quiz) lassen sich **nicht** per API
setzen. Das Paket liefert Bild/Text je Frame plus Sticker-Vorschlag; du
postest die Sequenz manuell aus der Freigabe-Nachricht. Reine Bild-/
Video-Frames kann Stufe 4 später per API veröffentlichen.

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Plane eine Story-Sequenz mit 4–6 Frames zum Serien-Eintrag
„{{ arbeitstitel }}“. Stories sind flüchtig und persönlich: kurze Sätze,
direkte Ansprache, ein Gedanke je Frame.

Typische Dramaturgie:
1 Einstieg („Heute geht's um …“) · 2 Bild/Video · 3 Fakt · 4 Sticker
(Umfrage/Frage/Quiz) · 5 Link/CTA.

Je Frame: art (bild | video | text), bildwunsch oder medien_id,
text_einblendung (max. 20 Wörter), sticker (keiner | umfrage | frage |
quiz | link | countdown) mit sticker_inhalt (Umfrage-Optionen, Frage,
Link-Ziel, Countdown-Zeitpunkt aus dem Faktenblatt).
Mindestens ein Frame mit Interaktions-Sticker, außer typ = partei mit
Sachthema (dann Frage-Sticker nur, wenn Briefing das erlaubt).
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["frames"],
  "properties": {
    "frames": {
      "type": "array", "minItems": 4, "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["nr", "art", "text_einblendung", "sticker"],
        "properties": {
          "nr": { "type": "integer" },
          "art": { "type": "string", "enum": ["bild", "video", "text"] },
          "bildwunsch": { "type": "string" },
          "medien_id": { "type": "string" },
          "text_einblendung": { "type": "string", "maxLength": 140 },
          "sticker": { "type": "string", "enum": ["keiner", "umfrage", "frage", "quiz", "link", "countdown"] },
          "sticker_inhalt": { "type": "string" },
          "api_veroeffentlichbar": { "type": "boolean", "description": "true nur bei art bild/video ohne Sticker" }
        }
      }
    }
  }
}
```
