# Content-Briefing (Eingang des Systems)

Das Briefing ist das n8n-Formular (Form Trigger) des Workflows W1 und
zugleich das Feld `themen.briefing` in der Hub-DB. Es muss in **zwei Minuten**
ausfüllbar sein; alles Weitere holt sich das System aus dem Mandantenprofil,
dem Faktenblatt und dem Medienarchiv.

| Feld | Typ | Pflicht | Beispiel |
|---|---|---|---|
| **Projekt** (Mandant) | Auswahl aus `mandanten` | ja | WerkHausWaren |
| **Thema** | Text | ja | Reparaturcafé |
| **Anlass** | Text | ja | Nächster Termin am 12.10., 15–18 Uhr |
| **Was ist die Botschaft?** | Text (1–2 Sätze) | nein | Kaputt ist nicht kaputt – wir reparieren gemeinsam. |
| **Fakten / Material** | Mehrzeiliger Text | nein | Ort, Zeit, Ansprechperson, Besonderheiten; Links |
| **Dateien** | Upload (Fotos, PDF, Flyer) | nein | 5 Fotos + Flyer |
| **Ziel** | Auswahl: informieren · einladen · Helfer gewinnen · erklären · feiern · Fragen sammeln | ja | einladen |
| **Zielgruppe** | Text (Vorbelegung aus Profil) | nein | Menschen aus Waren und Umgebung |
| **Formate** | Mehrfachauswahl: Carousel · Reel · Story · Post · Artikel · Newsletter · FAQ · App-Meldung | ja | Carousel, Post, Story, App-Meldung |
| **Kanäle** | Mehrfachauswahl (Vorbelegung aus Profil) | ja | Instagram, Facebook, App |
| **Ton** | Text (Vorbelegung aus Profil) | nein | offen, freundlich, lokal |
| **Deadline / Wunschtermin** | Datum | nein | Freitag |
| **Recherche nötig?** | ja/nein | ja | nein (alle Fakten stehen oben) |
| **Hinweise für die Freigabe** | Text | nein | „Bitte Bild mit Kindern nicht verwenden“ |

Regeln:

- Ohne „Fakten / Material“ **und** ohne „Recherche nötig“ dürfen die Agenten
  nichts Sachliches behaupten; das Paket enthält dann nur Struktur und
  Platzhalter mit der Kennzeichnung `[FAKT FEHLT]`.
- Uploads landen unter `data/media/<mandant>/eingang/<thema-id>/` und werden
  im Medienarchiv mit `einwilligung: unbekannt` angelegt. Erkennbare Personen
  → das Paket erinnert an die Einwilligung.
- Das Briefing wird unverändert in der Freigabe-Nachricht mitgeschickt,
  damit der Freigeber den Auftrag neben dem Ergebnis sieht.
