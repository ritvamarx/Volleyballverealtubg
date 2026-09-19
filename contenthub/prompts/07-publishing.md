# 07 · Publishing — Regeln (kein LLM)

Der Publishing-Sub-Workflow ist deterministisch: Code-Node für die
Slot-Planung, dann je Kanal ein Zweig mit HTTP-/Graph-API-Knoten. Texte sind
bereits kanalangepasst (04d); hier werden nur Pflichttexte angehängt und
Medien-URLs eingesetzt.

## Vorbedingungen (harte Abbrüche)

1. `beitraege.status = 'freigegeben'` **und** `freigegeben_von` gesetzt; bei
   `regeln.zweite_freigabe` beide Freigeber. Andernfalls Abbruch mit
   Fehlermeldung an den Fehler-Workflow. (Zusätzlich DB-Trigger
   `veroeff_nur_mit_freigabe`.)
2. Alle referenzierten Medien liegen unter `data/media/<mandant>/…` und
   sind über `https://media.nettverwaltet.de/...` erreichbar (HEAD 200).
3. Kanal ist im Mandantenprofil hinterlegt.

## Slot-Planung (Code-Node)

- Eingabe: Beiträge der Serie mit `reihenfolge`, `wunschtermin_relativ`
  (z. B. `T-3`, `T+0 abends`), Anlass-Termin aus dem Thema, `slots` des
  Profils, bereits belegte Slots aus `veroeffentlichungen` (alle
  Mandanten).
- Regeln:
  1. `wunschtermin_relativ` in absolutes Datum umrechnen; ohne Angabe
     nächster freier Profil-Slot in `reihenfolge`.
  2. Facebook-Slot = Instagram-Slot + 15 min (aus Profil `+15min`).
  3. Kein Mandant belegt zwei Slots innerhalb von 3 Stunden; verschiedene
     Mandanten nicht innerhalb von 30 Minuten (sonst verschieben).
  4. `max_beitraege_pro_woche` je Mandant einhalten; Überhang in die
     Folgewoche.
  5. Slots in der Vergangenheit (Freigabe kam spät) → nächster freier Slot,
     nie „sofort“ außer für Kanal `app` und Anlass `ergebnis`/`aufruf`.
- Ausgabe: je Beitrag × Kanal eine Zeile in `veroeffentlichungen` mit
  `geplant_fuer`.

## Ausführung (Schedule-Trigger alle 5 min: fällige Zeilen)

| Kanal | Knoten | Details |
|---|---|---|
| `app` | HTTP → `http://<container>:8000/api/content/inbox` | Header `X-Content-Token`; Body nach `anbindung/content-feed-spec.md`; `push: true` nur wenn Profil-Kanal `app` mit `push: true` |
| `website` | WordPress-Knoten (REST) oder HTTP zur Flask-App | Artikel als Entwurf (`status: draft`) oder `publish` je Profil; Titelbild hochladen; Pflichttext Impressum/V. i. S. d. P. anhängen |
| `facebook` | Facebook Graph API-Knoten | Text: `POST /{page-id}/feed` mit `message`, `link`; Bild(er): `POST /{page-id}/photos` (`url`, `published=false`) → `feed` mit `attached_media`; Zeitsteuerung wahlweise `published=false&scheduled_publish_time=<unix>` |
| `instagram` | HTTP (Graph API) | Bild: `POST /{ig-user-id}/media` (`image_url`, `caption`) → `POST /{ig-user-id}/media_publish` (`creation_id`); Carousel: je Slide Container mit `is_carousel_item=true`, dann Container `media_type=CAROUSEL&children=…`, dann publish; Reel: `media_type=REELS&video_url=…`, Status-Polling `GET /{container-id}?fields=status_code` bis `FINISHED`; Story: `media_type=STORIES` nur für Frames mit `api_veroeffentlichbar=true` |
| `newsletter` | Brevo/Mailchimp-Knoten (oder vorhandenes Tool) | Absatz als Entwurf in die Wochen-Kampagne; Versand bleibt manuell (Stufe 7: Automation) |
| `youtube` (optional) | YouTube-Knoten | Reel-MP4 als Short: Titel ≤ 100 Zeichen, Beschreibung aus Caption, Kapitel aus Szenen |

Nach Erfolg: `veroeffentlicht`, `kanal_id`, `url` setzen; Thema auf
`veroeffentlicht`, sobald alle Zeilen erledigt sind. Bei Fehler:
`fehler`, `versuche + 1`; ≤ 3 Versuche im Abstand 15 min, danach
Telegram-/E-Mail-Meldung mit Retry-Button.

## Pflichttexte

| Kanal | angehängt |
|---|---|
| website, newsletter | `pflichttexte.impressum`; bei typ partei zusätzlich `visdp` |
| facebook, instagram | bei typ partei `visdp` als letzte Zeile; bei `ki_generiert` Medium: `hinweis_ki_bild` + Meta-Kennzeichnung „KI-Info“ (Graph-API-Feld, sobald verfügbar; sonst im Text) |
| app | keine (App führt eigenes Impressum) |
