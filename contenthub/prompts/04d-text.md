# 04d · Format: Post · Artikel · Newsletter · FAQ · App-Meldung

Ein Sub-Workflow für alle Textformate; welches Format erzeugt wird,
bestimmt `typ` aus der Serie. Die **Kanal-Anpassung** (Instagram kurz,
Facebook länger, Website vollständig, Newsletter persönlich, App knapp)
passiert hier, nicht im Publishing-Schritt.

## System

```
<Präambel 00-gemeinsam>

AUFGABE: Schreibe den Beitrag „{{ arbeitstitel }}“ vom Typ {{ typ }}.

Formatvorgaben:
- post → varianten je Kanal:
    instagram: 60–120 Wörter, erste Zeile Hook, Absätze, Hashtags am Ende
    facebook: 80–180 Wörter, vollständige Sätze, Link erlaubt, ≤ 3 Hashtags
    linkedin (nur wenn Kanal im Profil): 100–200 Wörter, Sie-Form
- artikel → website: Titel (≤ 70 Zeichen), Teaser (≤ 160 Zeichen),
    Markdown-Text 300–600 Wörter mit Zwischenüberschriften, Fakten-Kasten
    (Was/Wann/Wo/Wer), Quellenliste, Bildwunsch fürs Titelbild, Alt-Text.
- newsletter → Betreffzeile (≤ 50 Zeichen), Vorschautext (≤ 90 Zeichen),
    persönlicher Absatz 80–150 Wörter in Ich-/Wir-Form, ein Link, ein CTA.
- faq → 5–8 Fragen mit Antworten (je ≤ 60 Wörter); Antworten nur aus dem
    Faktenblatt, sonst „Das klären wir gerade.“ + offene Frage übernehmen.
- app_meldung → titel (≤ 60 Zeichen), text (≤ 400 Zeichen), optional
    push_text (≤ 90 Zeichen), zielgruppe (alle | eltern | mitglieder);
    sachlich, keine Hashtags.

Pflichttexte aus dem Profil (Impressum, V. i. S. d. P.) NICHT einfügen –
das macht der Publishing-Schritt. Bei quellenpflicht: [Qn]-Verweise im
Text und Quellenliste am Ende.
```

## Ausgabe-Schema (Union je Typ, `typ` Pflichtfeld)

```json
{
  "type": "object",
  "required": ["typ"],
  "properties": {
    "typ": { "type": "string", "enum": ["post", "artikel", "newsletter", "faq", "app_meldung"] },
    "varianten": {
      "type": "object",
      "properties": {
        "instagram": { "type": "string" }, "facebook": { "type": "string" }, "linkedin": { "type": "string" }
      }
    },
    "artikel": {
      "type": "object",
      "properties": {
        "titel": { "type": "string" }, "teaser": { "type": "string" }, "markdown": { "type": "string" },
        "faktenkasten": { "type": "object" }, "quellen": { "type": "array", "items": { "type": "string" } },
        "bildwunsch": { "type": "string" }, "alt_text": { "type": "string" }
      }
    },
    "newsletter": {
      "type": "object",
      "properties": { "betreff": { "type": "string" }, "vorschau": { "type": "string" }, "absatz": { "type": "string" }, "link": { "type": "string" }, "cta": { "type": "string" } }
    },
    "faq": { "type": "array", "items": { "type": "object", "properties": { "frage": { "type": "string" }, "antwort": { "type": "string" }, "quellen_nr": { "type": "array", "items": { "type": "integer" } } } } },
    "app_meldung": {
      "type": "object",
      "properties": { "titel": { "type": "string" }, "text": { "type": "string" }, "push_text": { "type": "string" }, "zielgruppe": { "type": "string", "enum": ["alle", "eltern", "mitglieder"] } }
    },
    "hashtags": { "type": "array", "items": { "type": "string" } },
    "bildwunsch": { "type": "string" },
    "medien_id": { "type": "string" }
  }
}
```
