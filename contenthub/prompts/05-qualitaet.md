# 05 · Qualitäts-Check (vor der Freigabe)

Zwei Teile: **deterministische Prüfungen** in einer Code-Node (Längen,
Pflichtfelder, verbotene Wörter, Einwilligungs-Flags, Hashtag-Anzahl) und
der **LLM-Faktenabgleich** unten. Ergebnis wird als `pruefbericht` am
Beitrag gespeichert und in der Freigabe-Nachricht angezeigt. Bei
`blockiert = true` geht der Beitrag **nicht** zur Freigabe, sondern zurück
in den Format-Schritt mit den Befunden.

## Code-Node (Auszug der Regeln)

| Prüfung | Quelle | blockiert? |
|---|---|---|
| Instagram-Caption ≤ 2200 Zeichen, ≤ 30 Hashtags; App-Meldung ≤ 400 Zeichen | Kanal-Limits | ja |
| `[FAKT FEHLT` im Text | Präambel-Regel 1 | ja |
| Personen-Namen aus Medienarchiv mit `einwilligung != ja` | `regeln.personen_nur_mit_einwilligung` | ja |
| Bild mit `personen_erkennbar = true` und `einwilligung != ja` | dito | ja |
| Parteiname in Vereins-Beitrag | `regeln.keine_parteinennung` | ja |
| `ki_generiert = true` ohne `hinweis_ki_bild` | Kennzeichnung | ja |
| Wahl/Kandidat/Stimme in Beitrag ohne Briefing-Freigabe | `regeln.keine_wahlbezuege_ohne_briefing` | ja |
| Termin im Text ≠ Termin im Feed/Faktenblatt | `regeln.termine_nur_aus_feed` | ja |
| Slide-Text > 260 Zeichen, Hook > 8 Wörter | Format-Vorgabe | Hinweis |

## System (LLM-Teil)

```
<Präambel 00-gemeinsam>

AUFGABE: Prüfe den Beitrag gegen das Faktenblatt und die Regeln des
Mandanten. Du änderst nichts, du befundest.

1. Faktenabgleich: Liste JEDE Sachaussage des Beitrags (Zahlen, Daten,
   Orte, Namen, Zusagen, Ursachen) und ordne sie einer Fakten-Nr. zu.
   Aussagen ohne Entsprechung → „ungedeckt“. Aussagen, die dem
   Faktenblatt widersprechen → „widerspruch“.
2. Tonalität: passt der Text zu Anrede und No-Gos des Profils? Nenne
   Stellen.
3. Regeln: Verstöße gegen `regeln` benennen (Parteinennung, Personen,
   Heilversprechen bei hwg_pruefung: Erfolgsgarantien, Vorher-Nachher,
   Angstwerbung, Fachkreis-Infos an Laien).
4. Kennzeichnung: fehlt V. i. S. d. P./Impressum-Bedarf oder KI-Hinweis?
5. Verständlichkeit: ein Satz je Beitrag, ob die Kernbotschaft ankommt.

blockiert = true, wenn ≥ 1 „widerspruch“, bei quellenpflicht ≥ 1
„ungedeckt“, oder ein Regelverstoß der Kategorie Personen/Politik/HWG.
```

## Ausgabe-Schema

```json
{
  "type": "object",
  "required": ["blockiert", "aussagen", "regelverstoesse", "hinweise", "zusammenfassung"],
  "properties": {
    "blockiert": { "type": "boolean" },
    "aussagen": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "status"],
        "properties": {
          "text": { "type": "string" },
          "status": { "type": "string", "enum": ["gedeckt", "ungedeckt", "widerspruch"] },
          "fakten_nr": { "type": "array", "items": { "type": "integer" } },
          "kommentar": { "type": "string" }
        }
      }
    },
    "regelverstoesse": { "type": "array", "items": { "type": "object", "properties": { "regel": { "type": "string" }, "stelle": { "type": "string" }, "schwere": { "type": "string", "enum": ["blockiert", "hinweis"] } } } },
    "hinweise": { "type": "array", "items": { "type": "string" } },
    "zusammenfassung": { "type": "string", "maxLength": 400 }
  }
}
```
