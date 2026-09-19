# Mandantenprofile

Ein Profil je Mandant als YAML. Der Loader-Workflow liest alle Dateien dieses
Ordners in die Tabelle `mandanten` (Spalte `profil` als JSON). **Jeder**
LLM-Aufruf bekommt das Profil des betroffenen Mandanten als Systemkontext —
so entsteht die Trennung zwischen WerkHaus-, SPD-, Klinik- und Vereins-Ton
ohne Workflow-Kopien.

Änderung = Datei bearbeiten → per `rsync` nach `/opt/contenthub/mandanten/`
→ Workflow „Mandanten laden“ anstoßen (oder auf den stündlichen Lauf warten).

## Felder

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Kurzname, nur `a-z0-9-`; identisch mit Ordnernamen unter `data/media/` und `templates/` |
| `name`, `typ` | ja | Anzeigename; `verein` · `initiative` · `partei` · `unternehmen` · `person` |
| `design` | ja | `primaer`, `sekundaer`, `hintergrund`, `schrift`, `logo` (Pfad unter `data/media`) — für Renderer-Vorlagen |
| `tonalitaet` | ja | Ein Satz bis ein Absatz; Anrede (du/Sie), Sprachstil, No-Gos |
| `zielgruppen` | ja | Liste |
| `content_saeulen` | ja | Liste; der Themen-Agent ordnet jedes Thema einer Säule zu |
| `kanaele` | ja | je Kanal Handle/URL; fehlt ein Kanal, wird er nie bedient. `app` = Name des nettverwaltet-Containers |
| `slots` | nein | Standard-Veröffentlichungszeiten je Kanal (Publishing-Regeln in `prompts/07-publishing.md`) |
| `hashtags` | nein | Basis-Set; Format-Agenten ergänzen themenbezogen |
| `pflichttexte` | nein | `impressum`, `visdp`, `hinweis_ki_bild`, `signatur_newsletter` … werden vom Publishing-Schritt angehängt |
| `regeln` | ja | Governance (siehe unten), vom Qualitäts-Schritt geprüft |
| `freigeber` | ja | E-Mail/Telegram-Kennungen; bei `zweite_freigabe: true` müssen alle freigeben |
| `quellen` | nein | was der Themen-Agent beobachtet: `app_feed`, `rss`, `website`, `mail`, `upload` |
| `research_allowlist` | nein | Domains, die der Research-Schritt lesen darf (sonst nur Briefing + Feed + Uploads) |
| `learnings` | nein | Freitext; wird vom Analyse-Schritt ergänzt (nur bestätigte Learnings) |

## Regeln (`regeln`)

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `auto_publish` | `false` | **Muss** `false` bleiben; der Publishing-Schritt bricht sonst ab. Existiert nur, damit die Absicht sichtbar ist. |
| `quellenpflicht` | `false` | `true`: jede Sachaussage im Beitrag muss auf eine Fakten-Nr. des Faktenblatts verweisen; sonst kein Freigabe-Vorschlag |
| `zweite_freigabe` | `false` | zwei Freigeber nötig (SPD, Klinik) |
| `personen_nur_mit_einwilligung` | `true` | Namen/Fotos erkennbarer Personen nur bei `einwilligung: ja` im Medienarchiv |
| `keine_kinderfotos_ohne_einwilligung` | `true` | dito, zusätzlich Prüfung durch Vision-Schritt |
| `keine_parteinennung` | `false` | `true` bei Vereinen: Beitrag mit Parteinamen fällt durch |
| `hwg_pruefung` | `false` | Klinik: Prüfliste Heilmittelwerbegesetz im Qualitäts-Prompt aktiv |
| `ki_bilder_erlaubt` | `false` | nur bei ausdrücklichem Briefing-Wunsch; immer mit `hinweis_ki_bild` |
| `max_beitraege_pro_woche` | `–` | Publishing verteilt Slots, mehr wird geschoben |

## Inventar (Stufe 0 — bitte ausfüllen)

| Mandant-ID | Container | Instagram | Facebook | Website | Newsletter | Freigeber |
|---|---|---|---|---|---|---|
| `werkhaus` | werkhaus-app | | | | | |
| `nett-waren` | – | | | | | |
| `spd-waren` | – | | | | | + zweiter Freigeber |
| `klinik-amsee` | – | | | | | + Klinik-Kommunikation |
| `persoenlich` | – | | | | | |
| `skv-mueritz` | volleyball-app | | | www.skv-mueritz.de | | Trainerteam |
| `kita-wabe` (?) | kitawabe | | | | | |
| `mueritzhilft` | mueritzhilft | | | | | |
| ? | wdb | | | | | |
