# 04b · Format: Reel (30–60 s) — Drehbuch, kein Video

Das System liefert das komplette Drehbuch samt Untertiteln; Schnitt bleibt
manuell (CapCut/Canva). Ab Stufe 7 optional Foto-Slideshow per ffmpeg.

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Schreibe ein Reel-Drehbuch (30–60 Sekunden, Hochformat 9:16)
zum Serien-Eintrag „{{ arbeitstitel }}“.

- hook: gesprochener erster Satz, max. 12 Wörter, in den ersten 2 Sekunden.
- szenen: 4–7 Szenen mit dauer_s, bild (was zu sehen ist; Motiv aus
  Medienarchiv oder Drehanweisung), sprechertext (natürlich gesprochen,
  keine Schriftsprache), einblendung (max. 6 Wörter, optional).
- Gesamtsprechdauer ≈ 2,5 Wörter/Sekunde beachten.
- cta: letzter Satz + Einblendung.
- srt: Untertitel im SRT-Format, Blöcke ≤ 2 Zeilen, ≤ 42 Zeichen/Zeile.
- caption: 40–90 Wörter + Hashtags.
- musik_stimmung: 3 Wörter (kein Titel – Lizenz bleibt beim Menschen).
- bei quellenpflicht: Quellen als letzte Einblendung „Quellen: …“.
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["hook", "szenen", "cta", "srt", "caption", "hashtags", "musik_stimmung"],
  "properties": {
    "hook": { "type": "string" },
    "szenen": {
      "type": "array", "minItems": 4, "maxItems": 7,
      "items": {
        "type": "object",
        "required": ["nr", "dauer_s", "bild", "sprechertext"],
        "properties": {
          "nr": { "type": "integer" },
          "dauer_s": { "type": "number" },
          "bild": { "type": "string" },
          "medien_id": { "type": "string" },
          "sprechertext": { "type": "string" },
          "einblendung": { "type": "string" }
        }
      }
    },
    "cta": { "type": "string" },
    "srt": { "type": "string" },
    "caption": { "type": "string" },
    "hashtags": { "type": "array", "items": { "type": "string" } },
    "musik_stimmung": { "type": "string" },
    "gesamtdauer_s": { "type": "number" }
  }
}
```
