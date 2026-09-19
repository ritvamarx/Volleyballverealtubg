# Prompts der Sub-Workflows

Jede Datei = ein Sub-Workflow in n8n (Basic LLM Chain bzw. AI Agent +
Structured Output Parser). Aufbau ist immer gleich:

1. **System-Prompt** (Abschnitt „System“) — wird 1:1 in den Knoten kopiert.
   Platzhalter in `{{ }}` werden per n8n-Expression aus dem Mandantenprofil
   und den Vorschritten gefüllt.
2. **Eingabe** — welches JSON der Knoten als User-Nachricht bekommt.
3. **Ausgabe-Schema** — JSON-Schema für den Structured Output Parser. Der
   Knoten wiederholt bei Schema-Verstoß (Auto-Fix aktivieren).

Gemeinsame Grundregeln, die in **jedem** System-Prompt stehen
(`00-gemeinsam.md`), werden vorangestellt.

| Datei | Sub-Workflow | Modell-Empfehlung |
|---|---|---|
| `00-gemeinsam.md` | Präambel für alle | – |
| `01-themen.md` | Themen | günstiges Modell, viel Eingabe |
| `02-research.md` | Research (mit Tool „Seite lesen“) | starkes Modell, großer Kontext |
| `03-redaktion.md` | Redaktion | starkes Modell |
| `04a-carousel.md` · `04b-reel.md` · `04c-story.md` · `04d-text.md` | Formate | mittleres Modell |
| `05-qualitaet.md` | Qualität | starkes Modell (Faktenabgleich) |
| `07-publishing.md` | Publishing-Regeln (kein LLM; Slot-Logik als Code-Node) | – |
| `08-analyse.md` | Analyse | starkes Modell |
