# Plan: Infrastruktur für den Content-Hub — eigener Server, anpassbar gebaut

Stand: September 2026 · Ergänzt `PLAN-CONTENT-AUTOMATION.md` (Abschnitt 3
dort verweist hierher). Frage: Soll die Automation auf der bestehenden
nettverwaltet-VM laufen oder auf einem eigenen Server, und wie muss die
Infrastruktur aussehen, damit du die Automatisierung **selbst und laufend
anpassen** kannst, ohne den Vereinsbetrieb zu gefährden?

---

## 1. Beurteilung: eigener Server — ja

**Empfehlung: Der Content-Hub bekommt eine eigene Hetzner-Cloud-VM.** Die
bestehende VM bleibt ausschließlich Betrieb der Vereins-Apps.

Der Ausschlag ist nicht der Preis (ein zweiter kleiner Server kostet etwa
so viel wie das Aufrüsten des vorhandenen), sondern **Trennung von Betrieb
und Werkstatt**:

| Kriterium | A: auf der bestehenden VM | B: eigene VM (Empfehlung) | C: n8n Cloud / gemanagt |
|---|---|---|---|
| **Schutz der Vereinsdaten** (Kinder, Eltern, 2FA-Konten) | n8n, NocoDB und ein Chromium-Renderer laufen neben den Mitglieder-Datenbanken. n8n führt frei geschriebenen Code aus, hat offene Webhook-Endpunkte und wöchentliche Releases. Ein Fehler oder Einbruch dort trifft denselben Host. | Physische Trennung. Der Hub erreicht die Vereins-Apps nur über eine schmale, token-geschützte Schnittstelle. | Daten (Briefings, Faktenblätter, Fotos) liegen beim Anbieter; Feed-Zugriff auf die Apps muss öffentlich erreichbar sein. |
| **Freiheit zum Basteln** | Jede Experimentier-Runde (neue n8n-Version, zusätzlicher Dienst, kaputter Workflow, Docker-Neustart) riskiert die Vereins-Apps. Du wirst vorsichtig — und änderst weniger. | „Kaputtmachen erlaubt“: Snapshot vorher, im Zweifel zurückrollen oder neu aufsetzen. Vereine merken nichts. | Anpassung nur innerhalb des Angebots; keine eigenen Container (Renderer, Werkzeuge), Community-Nodes eingeschränkt. |
| **Ressourcen** | 4 GB, davon ~1 GB belegt. Hub-Vollausbau braucht 2–2,7 GB → Upgrade auf 8 GB nötig; Renderer-Spitzen könnten Gunicorn-Prozesse verdrängen. | Eigene 8 GB nur für den Hub; Speicherlimits pro Container ohne Rücksicht auf Vereins-Apps. | Nach Tarif; Ausführungs-Kontingente. |
| **Update-Rhythmus** | Vereins-Apps: selten, bewusst. n8n: wöchentlich. Beides auf einem Host = zwei Rhythmen, ein Risiko. | Getrennte Rhythmen, getrennte Wartungsfenster. | Anbieter entscheidet. |
| **Betriebsaufwand** | ein Server | zwei Server, aber identisches Muster (Docker Compose + Caddy + Cron); Hub-Server darf „gröber“ gewartet werden | am geringsten |
| **Kosten je Monat (etwa, bitte aktuelle Preise prüfen)** | Upgrade 4 → 8 GB: +3–4 € | VM 8 GB (z. B. CX32): ~7 € + Backup-Option 20 % | ab ~20 € (Starter) + LLM-API |
| **Datenhoheit / DSGVO** | auf eigenem Server | auf eigenem Server, EU | Auftragsverarbeitung mit weiterem Anbieter |

Option C fällt aus, weil sie deinem Ziel (selbst anpassen, eigene Dienste,
Datenhoheit) widerspricht. Option A ist technisch möglich, aber sie
untergräbt genau das, was du willst: Du sollst im Hub jederzeit etwas
ändern können, ohne an die Vereine denken zu müssen.

## 2. Zielarchitektur: zwei Server, eine Handschrift

```
                       Internet
                          │
      ┌───────────────────┴────────────────────┐
      │                                        │
┌─────▼──────────────────────┐    ┌────────────▼─────────────────────────┐
│ VM 1 „betrieb“ (bestehend) │    │ VM 2 „hub“ (neu, 8 GB, gleiche Region)│
│ Caddy                      │    │ Caddy (eigener)                       │
│ werkhaus · kitawabe ·      │    │ n8n · postgres · nocodb · renderer    │
│ verein · wdb · mueritzhilft│    │ + optionale „Werkzeuge“-Container     │
│ · volleyball               │    │                                       │
│ /api/content-feed ◄────────┼────┼── nur aus dem privaten Netz           │
│ /api/content/inbox ◄───────┼────┼── (Hetzner Cloud Network, 10.0.0.0/24)│
└────────────────────────────┘    └───────────────────────────────────────┘
        Backups → externes Ziel (Storage Box o. ä.) ← Backups
```

**Bausteine**

| Baustein | Entscheidung |
|---|---|
| **VM 2** | Hetzner Cloud, gleiche Region wie VM 1 (fsn1), 8-GB-Klasse (z. B. CX32), Ubuntu LTS, Docker + Compose, unprivilegierter Deploy-Nutzer, SSH nur mit Schlüssel. Hetzner-Backup-Option aktivieren (automatische Snapshots). |
| **Privates Netz** | Hetzner „Cloud Network“ (kostenlos) mit beiden VMs. Die Vereins-Apps liefern Feed und Inbox **nur** an die private IP der Hub-VM aus (Caddy-Matcher `remote_ip`). Von außen antworten diese Pfade mit 404. |
| **Hetzner Cloud Firewall** | VM 2: eingehend nur 22 (deine IP), 80, 443. Alles andere zu. |
| **Caddy je Server** | Jeder Server hat seinen eigenen Caddy; keine Abhängigkeit zwischen den Caddy-Konfigurationen. Auf VM 1 kommt nur ein kleiner Block je Vereins-App hinzu (Feed-Pfade freigeben, s. `contenthub/anbindung/content-feed-spec.md`). |
| **Domains** | `n8n.`, `hub.`, `media.nettverwaltet.de` → IP von VM 2. Alle Vereins-Domains bleiben auf VM 1. |
| **n8n-Oberfläche** | Nicht öffentlich: Caddy lässt `/webhook/*` und `/form/*` für alle durch, die Oberfläche nur von deiner IP (oder über Tailscale/WireGuard, siehe 4). |
| **Datenhaltung** | `/opt/contenthub/data/` (Postgres, n8n, Medien) — einziges Verzeichnis, das gesichert werden muss, plus `.env`. |
| **Deployment** | Git-Repository `contenthub` (eigenes Repo, nicht das Volleyball-Repo) → `deploy.sh` per rsync **oder** `git pull` auf VM 2. Auf der Hub-VM ist Git erlaubt und sinnvoll, weil hier Prompts, Vorlagen und Workflows fortlaufend geändert werden. Die Regel „kein Git auf dem Server“ bleibt für VM 1. |

## 3. Anpassbar bauen: fünf Schichten, alles in Git

Damit du die Automation individuell anpassen kannst, ohne jedes Mal in n8n
zu klicken oder Code zu ändern, ist der Hub in Schichten aufgebaut. Jede
Schicht ist eine Datei im Repo; je weiter oben, desto häufiger änderst du.

| Schicht | Was du änderst | Wo | Wie es wirkt |
|---|---|---|---|
| **1 Konfiguration** | Mandanten (Ton, Säulen, Kanäle, Regeln, Slots), Modelle je Schritt, Kanal-Limits | `mandanten/*.yaml`, `config/modelle.yaml`, `config/kanaele.yaml` | Loader-Workflow liest stündlich; sofort mit „Mandanten laden“ |
| **2 Prompts** | Wortlaut und Ausgabe-Schema jedes Agenten | `prompts/*.md` | Workflows **lesen die Prompts zur Laufzeit aus der Datei** (Read File → Prompt). Kein Kopieren in Knoten. Datei ändern = Verhalten geändert. |
| **3 Vorlagen** | Grafik-Layouts, Freigabe-Mail, Newsletter-Gerüst | `templates/<mandant>/*.html`, `templates/mail/*.md` | Renderer und Mail-Knoten laden Vorlagen aus dem Ordner |
| **4 Workflows** | Ablauf, neue Trigger, neue Kanäle | n8n-Editor, dann `scripts/workflows-export.sh` → `workflows/*.json` im Repo | Export nach jeder Änderung (Cron nachts zusätzlich); `deploy.sh` importiert auf dem Server |
| **5 Code** | Eigene Werkzeuge (Python), Renderer, Feed-Blueprints | `werkzeuge/<name>/` (je ein kleiner HTTP-Dienst), `renderer/` | Compose-Profil, von n8n per HTTP aufgerufen. Muster: Python statt n8n-JavaScript, wenn es komplex wird. |

Drei Regeln, die das tragen:

1. **Werkstatt auf dem Mac, Betrieb auf dem Server, gleiche Dateien.**
   `docker compose -f docker-compose.yml -f compose.lokal.yml up` startet
   denselben Hub lokal (n8n unter `http://localhost:5678`, ohne Caddy, mit
   Test-Mandant `demo`). Du probierst Prompts und Workflows lokal, exportierst,
   committest, deployst. Der Server sieht nur geprüfte Stände.
2. **Ein Workflow, viele Mandanten.** Mandanten-Unterschiede leben in
   Schicht 1, nie als Workflow-Kopie. Sonst zerfasert das System nach dem
   dritten Mandanten.
3. **Werkzeuge statt Knoten-Wildwuchs.** Was in n8n mehr als ~10 Knoten oder
   JavaScript-Logik braucht (Slot-Planung, Faktenabgleich, Feed-Abgleich),
   wird ein kleiner Python-Dienst unter `werkzeuge/`. Testbar, versionierbar,
   in deiner Sprache.

**Was n8n Community nicht kann und wie wir es lösen**

| Fehlt in Community | Lösung |
|---|---|
| Git-Anbindung („Source Control“) | `scripts/workflows-export.sh` / `-import.sh` über die n8n-CLI (`n8n export:workflow --all`) |
| Umgebungen (Dev/Prod) | lokale Werkstatt + Server; Credentials tragen dieselben Namen, damit importierte Workflows sofort laufen |
| Variablen | `config/*.yaml` per Loader in die Hub-DB; Workflows lesen von dort |
| Mehrere Nutzer mit Rollen | Community-Edition erlaubt inzwischen mehrere Nutzer (Owner + Member) ohne Projekte; für einen zweiten Freigeber reicht Telegram/E-Mail, er braucht kein n8n-Konto |

## 4. Sicherheit auf VM 2

- **Zugang:** SSH nur Schlüssel, `PermitRootLogin no`, Fail2ban oder
  Hetzner-Firewall auf deine IP. n8n-Oberfläche per Caddy-Allowlist oder
  besser **Tailscale** (kostenlos für Einzelnutzer): Oberfläche nur im
  Tailnet, Webhooks öffentlich. Dann kann `n8n.nettverwaltet.de` sogar nur
  Webhook-Pfade bedienen.
- **n8n:** Owner mit 2FA, `N8N_ENCRYPTION_KEY` im Backup, Task-Runner
  aktiviert (Code-Knoten laufen isoliert), Ausführungsdaten nach 7 Tagen
  gelöscht, Community-Nodes nur nach Prüfung.
- **Geheimnisse:** `.env` nur auf dem Server (`chmod 600`), alles Weitere in
  n8n-Credentials. Im Repo liegt nur `.env.example`.
- **Feed-Tokens:** je Vereins-App eigener Token; Feed nur aus dem privaten
  Netz erreichbar. Kompromittierter Hub = im schlimmsten Fall lesbare
  öffentliche Termine und angelegte Ankündigungen, keine Mitgliederdaten.
- **Container-Limits:** `mem_limit` je Dienst (Renderer 1 GB, n8n 1,5 GB),
  damit ein Ausreißer nicht die VM lahmlegt.
- **Backups:** Hetzner-Backup-Option (VM-Snapshots) **plus** täglicher
  `backup.sh` nach extern (gleiches Ziel wie die vereins-backups). Restore
  einmal geprobt, bevor Stufe 3 startet.

## 5. Was sich am Content-Plan ändert

| Stelle in `PLAN-CONTENT-AUTOMATION.md` | vorher | jetzt |
|---|---|---|
| Abschnitt 3 „Der Server heute“ | Hub in `/opt/contenthub` auf der bestehenden VM, Caddy-Blöcke ins vorhandene Caddyfile | Hub auf **VM 2**, eigener Caddy, eigenes Caddyfile; VM 1 bekommt nur die Feed-Freigabe |
| Speicherbudget / VM-Upgrade vor Stufe 5 | Upgrade der bestehenden VM | entfällt; VM 2 wird gleich mit 8 GB angelegt |
| Abschnitt 5.1 „Netz“ | n8n im gleichen Docker-Netz, Aufruf `http://werkhaus-app:8000` | Aufruf über privates Netz: `https://mein.werkhauswaren.de/api/content-feed` von der privaten IP der Hub-VM; Caddy auf VM 1 gibt die Pfade nur dieser IP frei |
| Stufe 1 | n8n + Postgres auf bestehender VM | **Stufe 1a: VM 2 anlegen** (Cloud Network, Firewall, Docker, Caddy, Backup) → Stufe 1b wie gehabt |
| Stufe 3 | Blueprint + Token | zusätzlich Caddy-Matcher auf VM 1 und Cloud Network beitreten (VM 1 muss ins private Netz aufgenommen werden — ohne Neustart möglich) |
| Deployment | rsync, kein Git | Hub: Git-Repo `contenthub`, `deploy.sh` mit Workflow-Import; lokale Werkstatt |

Das `contenthub/`-Paket in diesem Repo ist entsprechend angepasst
(eigener Caddy im Compose, vollständiges `Caddyfile`, `compose.lokal.yml`,
`config/modelle.yaml`, `scripts/workflows-export.sh`/`-import.sh`,
`deploy.sh`, Prompts als Laufzeit-Dateien). Es ist als **Startinhalt für
ein eigenes Repo `contenthub`** gedacht; im Volleyball-Repo liegt es nur,
weil die Planung hier begonnen hat.

## 6. Umsetzungsplan Infrastruktur

| Schritt | Inhalt | Wer | Dauer |
|---|---|---|---|
| **I-1** | Hetzner: VM 2 (8 GB, fsn1), Cloud Network anlegen, beide VMs hinzufügen, Firewall-Regeln; Backup-Option an. DNS `n8n`, `hub`, `media` → VM 2 | du | 30 Min. |
| **I-2** | Grundinstallation VM 2: Ubuntu-Updates, Docker + Compose, Deploy-Nutzer, SSH-Härtung, unattended-upgrades, Zeitzone; `/opt/contenthub` aus dem Repo, `.env`, `docker compose up -d` (Caddy, n8n, Postgres) | ich (Skript `setup-vm.sh`), du führst aus | 1 h |
| **I-3** | Repo `contenthub` anlegen (Inhalt aus `contenthub/` dieses Repos), lokale Werkstatt auf dem Mac starten, erster Workflow-Export/-Import-Roundtrip | ich + du | 1 h |
| **I-4** | Backup: `backup.sh` + Cron nach extern; Restore-Probe auf einem Wegwerf-Server (Snapshot → neue VM → `docker compose up` → alles da?) | ich | 1 h |
| **I-5** | VM 1: Caddy-Blöcke für Feed-Pfade (nur private IP), Token in `.env` je App — erst mit Stufe 3 des Content-Plans | ich | 30 Min. |
| **I-6** | Optional: Tailscale auf VM 2 und Mac; n8n-Oberfläche aus dem öffentlichen Caddy nehmen | du | 20 Min. |

Danach läuft Stufe 1b des Content-Plans (Briefing → Paket) auf VM 2.

## 7. Grenzen und offene Punkte

- Zwei Server heißt zwei Mal Betriebssystem-Updates. Auf VM 2 übernimmt
  `unattended-upgrades`; Docker-Images hebst du bewusst (n8n monatlich).
- Der Renderer braucht Chromium; auf 8 GB unkritisch, aber ein weiterer
  Dienst, den man pflegen muss. Alternative bleibt Canva von Hand.
- Wenn du später Videos schneiden oder ein lokales Sprachmodell betreiben
  willst, ist auch VM 2 zu klein; das wäre eine dritte, größere Maschine
  oder ein API-Dienst. Für Text, Grafiken und Publishing reicht VM 2 lange.
- Offen: Tailscale ja/nein; Backup-Ziel (Storage Box vorhanden?); ob das
  `contenthub`-Repo öffentlich oder privat ist (privat — es enthält
  Mandantenprofile mit Pflichttexten und Freigeber-Kennungen).
