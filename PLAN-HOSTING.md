# Plan: volleyball.nettverwaltet.de — von der Datei zur gehosteten Vereins-App

Stand: August 2026 · Zielbild: Die SKV-Müritz-Plattform läuft als Web-App auf
**deinem Hetzner-Server** unter **https://volleyball.nettverwaltet.de**.
**Trainer, Spieler und Eltern melden sich mit eigenen Zugängen an** und sehen
jeweils genau das, was ihre Rolle erlaubt. Ein gemeinsamer, geschützter
Datenbestand für alle Geräte; auf dem iPhone wie eine App installierbar.

---

## 1. Ausgangslage und Grundprinzip

**Heute:** Eine einzelne HTML-Datei; Daten im Browser-Speicher des jeweiligen
Geräts; Austausch manuell per verschlüsselter `.skv`-Datei.

**Umbau-Prinzip:** Die App bleibt optisch und funktional erhalten. Neu ist ein
schlankes Backend auf dem Hetzner-Server mit drei Aufgaben:
**(1) Anmeldung/Rollen**, **(2) zentrale Datenhaltung**, **(3) rollenbasierte
Sichten** — der Server entscheidet, welche Daten ein Konto überhaupt erhält.
Das ist der entscheidende Sicherheitspunkt: Bei Eltern-/Spieler-Zugängen darf
die Filterung **niemals im Browser** stattfinden.

```
Trainer ────┐                       ┌───────────────────────────────────────┐
Spieler ────┼─ HTTPS + Session ────▶│ volleyball.nettverwaltet.de (Hetzner) │
Eltern  ────┘  (Cookie, HttpOnly)   │ Reverse Proxy (TLS) → App-Container   │
                                    │  ├─ statische App (wie heute)         │
                                    │  ├─ API  /api/… (Flask/Gunicorn)      │
                                    │  └─ SQLite: Nutzer · Rollen · Daten   │
                                    └───────────────────────────────────────┘
```

## 2. Der Server — tatsächlicher Stand (vom Betreiber verifiziert, Aug. 2026)

- **Hetzner-Cloud-VM** `ubuntu-4gb-fsn1-1` (Falkenstein, 4 GB RAM,
  Ubuntu 26.04 LTS).
- **Bestehende Plattform „nettverwaltet":** Python/**Flask** + **SQLite**
  (je Verein eigene DB-Datei), gebaut aus `python:3.12-slim`, **Gunicorn**
  (1 Worker / 8 Threads), unprivilegierter Nutzer `appuser`. Ein Image
  (`werkhaus-app:latest`), fünf Container (werkhaus, kitawabe, verein/Demo,
  wdb, mueritzhilft) unter `/opt/werkhaus` bzw. `/opt/nettverwaltet`, je
  Container eigener `.env`- und `data`-Ordner (per `deploy/konfig-generieren.sh`).
- **Ein Caddy 2** als Reverse-Proxy für alle Domains (Let's Encrypt
  automatisch, gzip, Logs); nur Caddy hat 80/443, App-Container intern :8000.
- **Daten** liegen in `./data`-Volumes und überleben jeden Image-Neubau.
- **Cron-Jobs** klassisch in `/etc/cron.d/` (Backups, Healthcheck, Automatiken).
- **Deployment:** `rsync` vom Mac → `docker compose up -d --build` →
  Erreichbarkeits-Check. Kein Git auf dem Server.
- Die „WerkHausApp" ist **die Website als PWA** (Manifest + Service Worker
  `sw.js`, Web-Push über `pywebpush`).

### Getroffene Entscheidungen

- **Nutzerkreis:** Trainer + Spieler + Eltern mit eigenen Zugängen (Rollen
  unten).
- **Technik-Backend: Python/Flask + SQLite — nicht Node.** Begründung: Der
  Server fährt bereits ausschließlich diesen Stack; die Volleyball-App wird
  damit **deploygleich** gewartet (gleiches Basis-Image, gleiches
  Gunicorn-Muster 1 Worker/8 Threads, gleiche Volume-/Cron-/rsync-Routinen,
  Push später mit `pywebpush` wie gehabt). Ein zweiter Stack (Node) wäre
  vermeidbarer Wartungs-Zoo.
- **Einbindung:** eigenes, kleines Image `volleyball-app:latest` in eigenem
  Ordner **`/opt/volleyball`** (analog `/opt/werkhaus`): eigenes
  `docker-compose.yml`, eigener `data/`-Ordner (`volleyball.db`), `.env` mit
  `SECRET_KEY`. Im Caddyfile ein zusätzlicher vHost-Block
  `volleyball.nettverwaltet.de → volleyball-app:8000` (Container ins
  bestehende Caddy-Docker-Netz hängen). Cron-Konvention wie gehabt:
  `/etc/cron.d/volleyball-backup`, `volleyball-ferien` (s. u.).

### Zwei Wege — und die Empfehlung

| | **A: Volleyball als 6. Mandant der bestehenden Flask-Plattform** | **B: Diese Volleyball-App + eigenes kleines Flask-Backend (Empfehlung)** |
|---|---|---|
| Login/PWA/Push | geschenkt (vorhanden) | nachbauen nach WerkHaus-Vorbild (überschaubar) |
| Volleyball-Funktionen (Verbandsmeldung, Fahrerplanung, Trainingsrückmeldung, Elternbriefe/Serienbrief, SAMS-Import, Ferien MV, Tabelle, Wiki, Kleidung …) | **müssten alle neu** in der Vereinsverwaltung entwickelt werden | **fertig und getestet** (diese Sitzung) |
| Wartung | ein Image für 6 Vereine | zweites (kleines) Image, aber identischer Stack & identische Routinen |
| Risiko | Funktionsverlust/lange Nachbauphase | gering; klarer Schnitt: Verwaltung generisch, Volleyball speziell |

**Empfehlung: B.** Die Volleyball-App ist das Ergebnis vieler Review-Runden
dieser Sitzung; Weg A würde sie faktisch wegwerfen. Weg B hält den Server
homogen (alles Flask/SQLite/Docker/Caddy) und die Zuständigkeiten sauber
getrennt.

### Aus dieser Sitzung wiederverwendbar
Komplettes Frontend (18 Bereiche), Datenmodell (ein JSON-Bestand, 20 Tabellen,
CSV-Komplettbackup), AES-256-`.skv`-Sicherung, SAMS-/iCal-/RSS-Import,
Elternbriefe/Serienbrief/Sammeldokument, Mobil-Layout. Serverhosting löst
zugleich drei bekannte Schmerzpunkte: iPhone-Zugriff (echte URL), Ferien-/
Kalender-Abos ohne Browser-CORS (Cron auf dem Server ruft OpenHolidays/SAMS
ab und schreibt in die DB) und automatische Backups.

### Noch zu klären
1. ~~Server-Setup~~ → **geklärt** (siehe oben: Docker + Caddy 2 + Flask/SQLite).
2. DNS: `volleyball.nettverwaltet.de` als A-/AAAA-Record auf die IP der
   bestehenden VM legen (gleiche IP wie die übrigen nettverwaltet-Domains).

## 3. Rollenmodell (Kernstück)

| Recht / Bereich | 🧑‍🏫 Trainer | 🏐 Spieler | 👪 Eltern |
|---|---|---|---|
| Alles sehen & bearbeiten (Kader, Finanzen, Briefe, Meldungen …) | ✔ | ✖ | ✖ |
| Kalender (Trainings, Spiele, Ferien) | ✔ | ✔ | ✔ |
| Trainingsrückmeldung abgeben | für alle | **für sich** | **für das eigene Kind** |
| Fahrer-Angebot für Auswärtsspiele eintragen | ✔ | ✖ | ✔ (sich selbst) |
| Heimspiel-Job übernehmen (Buffet, Helfer) | vergeben | ✖ | ✔ (offene Jobs) |
| Vereinskleidung ansehen / anfordern | ✔ | ✔ (für sich) | ✔ (fürs Kind) |
| Eigene Kontaktdaten einsehen/ändern | ✔ | ✔ (eigene) | ✔ (eigene + Kind) |
| Kontaktdaten **anderer** Familien | ✔ | ✖ | ✖ |
| **Namen anderer Kinder/Spieler** | ✔ | ✔ (eigener Kader) | **✖ — Eltern sehen ausschließlich das eigene Kind** |
| Ankündigungen, Links, Wiki, Tabelle | ✔ | ✔ | ✔ (Zielgruppen-Filter) |
| Finanzen: eigener Beitragsstatus | ✔ (alle) | ✖ | ✔ (nur eigener) |

**Privatsphäre-Regel (beschlossen):** Die Eltern-Sicht enthält **keine Namen
anderer Kinder** — nirgends: Rückmeldungs-Übersichten zeigen Eltern nur
anonyme Zähler („8 Zusagen"), die Fahrer-Koordination zeigt ihnen nur das
eigene Angebot (die Zuordnung von Mitfahrern sieht und macht allein das
Trainerteam), Job-Listen zeigen Aufgaben ohne Personenbezug. Der Server
liefert diese Daten an Eltern-Konten gar nicht erst aus.

**Konto-Anlage ohne offene Registrierung (beschlossen):** Das Trainerteam
erzeugt pro Spieler **Einladungscodes** (einen für den Spieler, einen für die
Eltern) und verschickt sie **per WhatsApp**: Die App erzeugt zu jedem Code
einen fertigen WhatsApp-Teilen-Knopf (vorformulierte Nachricht mit
Registrierungslink + Code, geöffnet über WhatsApp/Systemteilen — kein
Mailserver nötig). Mit dem Code registriert man sich selbst (Name
vorausgefüllt, Passwort selbst wählen) und ist automatisch mit dem richtigen
Spieler verknüpft; Eltern mit mehreren Kindern werden auf mehrere Spieler
verknüpft. Codes sind einmalig gültig und laufen ab.

## 4. Bausteine

### 4.1 DNS & TLS (machst du, ~10 Min.)
`volleyball.nettverwaltet.de` als A-/AAAA-Record auf die Server-IP; TLS macht
der Reverse-Proxy automatisch (Let's Encrypt), HTTPS wird erzwungen (+ HSTS).

### 4.2 Backend-API (baue ich)
Flask + SQLite im Docker-Container (Gunicorn, 1 Worker / 8 Threads — wie
die bestehende Plattform; der eine Worker macht die Versionsprüfung des
Datenbestands ohne Wettlauf-Probleme). Endpunkte:

| Endpunkt | Rolle | Zweck |
|---|---|---|
| `POST /api/login` · `POST /api/logout` · `GET /api/me` | alle | Sitzung |
| `POST /api/register` (nur mit Einladungscode) | Spieler/Eltern | Konto anlegen |
| `GET/PUT /api/state` | Trainer | kompletter Datenbestand, mit Versionsprüfung (optimistisches Sperren) + Verlauf (letzte 30 Stände) |
| `GET /api/portal` | Spieler/Eltern | **serverseitig gefilterte Sicht** (nur erlaubte Daten) |
| `POST /api/portal/rsvp` | Spieler/Eltern | Trainingsrückmeldung setzen |
| `POST /api/portal/driver` | Eltern | Fahrer-Angebot (Plätze) für ein Auswärtsspiel |
| `POST /api/portal/job` | Eltern | offenen Heimspiel-Job übernehmen |
| `POST /api/portal/clothing` | Spieler/Eltern | Kleidung anfordern |
| `POST /api/portal/contact` | Spieler/Eltern | eigene Kontaktdaten aktualisieren |
| `GET /api/invites` · `POST /api/invites` | Trainer | Einladungscodes verwalten |

Alle Portal-Schreibzugriffe validiert der Server gegen die Verknüpfung
Konto ↔ Spieler — niemand kann für fremde Kinder melden oder fremde Daten lesen.

### 4.3 Login & Sicherheit (baue ich)
Argon2id-Hashes · HttpOnly/Secure/SameSite-Cookies · Login-Rate-Limit ·
CSRF-Token · Anmeldeprotokoll · Sicherheits-Header (CSP, X-Frame-Options).
**2FA (beschlossen):** TOTP per Authenticator-App — für **Trainerkonten
verpflichtend** ab Phase 1 (bevor echte Daten online sind), für Spieler-/
Eltern-Konten optional aktivierbar. Backup-Codes beim Einrichten; verlorene
2FA setzt das Trainerteam zurück. Einladungscodes einmalig + ablaufend,
Versand per WhatsApp-Teilen (siehe Abschnitt 3).

### 4.4 Frontend (baue ich)
- **Login-/Registrierungs-Bildschirm** im bestehenden Design.
- **Trainer-Modus:** App wie heute; `Store.save()` synchronisiert zusätzlich
  gebündelt zum Server (localStorage bleibt Offline-Puffer, Statusanzeige
  „☁️ synchronisiert / 📴 offline"). Konfliktfall: Warnung + Neuladen
  („Letzter gewinnt" — für ein kleines Trainerteam angemessen, ehrlich gesagt
  kein Echtzeit-Merge).
- **Portal-Modus (Spieler/Eltern):** reduziertes Menü (Übersicht, Kalender,
  Rückmeldung, Mithelfen [Jobs/Fahrer], Kleidung, Links, Wiki) auf Basis der
  gefilterten `/api/portal`-Daten; große Touch-Buttons „Zusagen/Absagen".

### 4.5 PWA — „echte App" (baue ich)
Manifest + 🏐-Icons + Service Worker: Safari → Teilen → „Zum Home-Bildschirm"
→ Vollbild-App mit eigenem Icon, App-Gerüst offline verfügbar.

### 4.6 Deployment-Paket (baue ich)
`deploy/`-Ordner im Repo: `Dockerfile`, `docker-compose.yml` (inkl.
Volume für SQLite + optionalem Caddy), Beispiel-Snippets für vorhandenen
nginx/Traefik, `setup`-Skript (erstes Trainerkonto anlegen), Update-Anleitung
(„git pull && docker compose up -d --build").

### 4.7 Datenübernahme (machst du, 2 Min.)
Erster Trainer-Login → Datensicherung → `.skv` importieren → Server ist ab
dann die zentrale Wahrheit.

### 4.8 DSGVO & Betrieb (gemeinsam)
- Hetzner = EU-Hosting; **AV-Vertrag** bei Hetzner aktivieren (Konto-Klick).
- **Datenschutzerklärung + Impressum** als App-Seiten (Vorlage liefere ich).
- Einverständnis-Vorlage „Datennutzung" um Online-Plattform + Zugänge ergänzen.
- **Backups:** tägliches SQLite-Snapshot aufs Volume + wöchentlicher
  verschlüsselter Export; Hetzner-Server-Backup falls gebucht.
- **Löschkonzept:** Spieler löschen entfernt zugehörige personenbezogene Daten
  und deaktiviert verknüpfte Konten; Versionsverlauf läuft automatisch aus.
- Betriebsverantwortung bleibt real: OS-/Docker-Updates, Backup-Kontrolle.

## 5. Phasen & Reihenfolge

| Phase | Inhalt | Wer | Umfang |
|---|---|---|---|
| **0** | Server-Setup klären (Docker? Proxy?), DNS-Record, ggf. AV-Vertrag | du | ~30 Min. |
| **1** | Backend (Auth inkl. **TOTP-2FA für Trainer** + Trainer-Vollsync + Versionierung), Login-UI, Deployment-Paket (`/opt/volleyball`, Caddy-vHost-Snippet) → **App läuft mit Trainer-Login unter der Domain** | ich | 1 große Runde |
| **2** | PWA (Manifest, Icons, Service Worker) | ich | klein |
| **3** | **Portal für Spieler & Eltern**: Rollen, Einladungscodes mit WhatsApp-Versand, gefilterte Sicht (ohne fremde Kindernamen), Aktionen (Rückmeldung, Fahrer, Jobs, Kleidung, Kontaktdaten), Trainer-Verwaltung der Zugänge | ich | 1–2 große Runden |
| **4** | Härtung + DSGVO-Seiten + Backup-/Ferien-Cron + Web-Push (pywebpush, wie WerkHausApp) | ich | mittel |

Reihenfolge bewusst: Nach Phase 1 arbeitest du bereits produktiv über die
Domain; Phase 3 öffnet die Plattform für Familien.

## 6. Grenzen (ehrlich)
- Kein Echtzeit-Kollaborations-Merge; Konflikte beim Trainer-Vollzugriff werden
  erkannt und gemeldet, nicht automatisch verschmolzen.
- Datei-Uploads (Einverständnis-PDFs) bleiben zunächst Teil des Datenbestands
  (~4 MB/Datei); eigener Datei-Store wäre späterer Ausbau.
- E-Mail-Versand (z. B. „Passwort vergessen") braucht einen Mail-Weg; v1 löst
  das über den Trainer (Code neu ausstellen) statt über E-Mails.
