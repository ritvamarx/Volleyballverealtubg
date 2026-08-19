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
                                    │  ├─ API  /api/… (Node.js)             │
                                    │  └─ SQLite: Nutzer · Rollen · Daten   │
                                    └───────────────────────────────────────┘
```

## 2. Getroffene Entscheidungen

- **Server:** eigener Hetzner-Server (dort läuft bereits deine
  Vereinsverwaltung). → Deployment als **Docker-Container hinter dem
  vorhandenen Reverse-Proxy**; falls noch keiner läuft, bringt das Paket einen
  Caddy mit (TLS automatisch via Let's Encrypt).
- **Nutzerkreis:** **Trainer + Spieler + Eltern** mit eigenen Zugängen und
  abgestuften Rechten (Rollenmodell unten).
- **Technik Backend:** Node.js (Express) + SQLite — ein Container, keine
  externen Dienste, Backups = eine Datei. Passwörter mit Argon2id.

## 2a. Erkenntnisse aus der Bestandsaufnahme (August 2026)

**Die „Vereinsverwaltung" ist die WerkHausApp** (`mein.werkhauswaren.de`,
WerkHausWaren e. V.) — laut deiner Mitglieder-Anleitung eine App mit genau den
Mustern, die wir brauchen: **Mitglied-Login**, Termine mit **Zu-/Absagen**,
**offene Schichten übernehmen/tauschen** (≈ unsere Heimspiel-Jobs), Dokumente,
Umfragen/Terminfindung, Abwesenheiten, Geburtstage, **eigene Daten pflegen**,
Installation **„Zum Home-Bildschirm"/„App installieren" (PWA)** und
**Benachrichtigungen**. Konsequenzen für diesen Plan:

1. **Gleiches Bedienmuster übernehmen:** Login-Flow, PWA-Installation und
   Mitglieder-Anleitung der Volleyball-App orientieren sich 1:1 an der
   WerkHausApp — die Familien kennen das Muster ggf. schon, und für dich
   bleibt die Verwaltung beider Apps einheitlich.
2. **Der Server hostet bereits mehrere Domains** (werkhauswaren.de neben
   nettverwaltet.de) → ein Reverse-Proxy mit vHosts existiert praktisch
   sicher; die Volleyball-App wird ein weiterer Eintrag darin.
3. **Push-Benachrichtigungen** (wie in der WerkHausApp) nehmen wir als
   optionalen Baustein in Phase 4 auf (Web-Push: Termin-Erinnerung,
   „Rückmeldung fehlt noch", neuer Elternbrief).
4. **Noch offen:** Mit welchem Stack/Deployment die WerkHausApp gebaut ist
   (Docker? Node? PHP?). Ich konnte deine anderen Claude-Sitzungen aus dieser
   Sitzung heraus nicht öffnen (Freigabe erforderlich). → Bitte frag im
   offenen Chrome-Tab der Vereinsverwaltungs-Sitzung kurz: *„Mit welcher
   Technik und welchem Deployment (Docker/Proxy) läuft die WerkHausApp auf dem
   Server?"* — mit der Antwort baue ich die Volleyball-App **deploygleich**
   (gleicher Proxy, gleiches Update-Verfahren). Idealerweise sogar gleicher
   Stack, damit sich der Server einheitlich wartet.

**Aus dieser Sitzung übernehmbar** (bereits gebaut und getestet):
das komplette Frontend mit 18 Bereichen, das Datenmodell (ein JSON-Bestand mit
20 Tabellen inkl. CSV-Komplettbackup), die AES-256-Verschlüsselung der
`.skv`-Sicherung, SAMS-/iCal-/RSS-Import, Elternbriefe/Serienbrief/
Sammeldokument sowie die frisch polierte Mobil-Oberfläche. Serverhosting löst
zudem drei bekannte Schmerzpunkte dieser Sitzung: iPhone-Zugriff (echte URL
statt Datei-Umwege), Ferien-/Kalender-Abos ohne Browser-CORS-Grenzen (der
Server ruft die Quellen ab) und automatische Backups.

### Noch zu klären (bitte kurz beantworten)
1. Wie ist der Server heute aufgesetzt — läuft schon **Docker** und ein
   **Reverse-Proxy** (Caddy/Traefik/nginx) für die Vereinsverwaltung, oder ein
   Panel (Plesk o. ä.)? Danach richtet sich das Deployment-Snippet.
2. Soll die DNS-Subdomain `volleyball` auf dieselbe IP zeigen wie die
   bestehende Vereinsverwaltung? (Vermutlich ja.)

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
| Ankündigungen, Links, Wiki, Tabelle | ✔ | ✔ | ✔ (Zielgruppen-Filter) |
| Finanzen: eigener Beitragsstatus | ✔ (alle) | ✖ | ✔ (nur eigener) |

**Konto-Anlage ohne offene Registrierung:** Der Trainer erzeugt pro Spieler
**Einladungscodes** (einen für den Spieler, einen für die Eltern). Mit dem Code
registriert man sich selbst (Name vorausgefüllt, Passwort selbst wählen) und
ist automatisch mit dem richtigen Spieler verknüpft. Eltern mit mehreren
Kindern lassen sich auf mehrere Spieler verknüpfen.

## 4. Bausteine

### 4.1 DNS & TLS (machst du, ~10 Min.)
`volleyball.nettverwaltet.de` als A-/AAAA-Record auf die Server-IP; TLS macht
der Reverse-Proxy automatisch (Let's Encrypt), HTTPS wird erzwungen (+ HSTS).

### 4.2 Backend-API (baue ich)
Node.js + SQLite im Docker-Container. Endpunkte:

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
CSRF-Token · Anmeldeprotokoll · Sicherheits-Header (CSP, X-Frame-Options) ·
optional TOTP-2FA für Trainerkonten. Einladungscodes einmalig + ablaufend.

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
| **1** | Backend (Auth + Trainer-Vollsync + Versionierung), Login-UI, Deployment-Paket → **App läuft mit Trainer-Login unter der Domain** | ich | 1 große Runde |
| **2** | PWA (Manifest, Icons, Service Worker) | ich | klein |
| **3** | **Portal für Spieler & Eltern**: Rollen, Einladungscodes, gefilterte Sicht, Aktionen (Rückmeldung, Fahrer, Jobs, Kleidung, Kontaktdaten), Trainer-Verwaltung der Zugänge | ich | 1–2 große Runden |
| **4** | Härtung + DSGVO-Seiten + Backup-Automatik (+ optional TOTP) | ich | mittel |

Reihenfolge bewusst: Nach Phase 1 arbeitest du bereits produktiv über die
Domain; Phase 3 öffnet die Plattform für Familien.

## 6. Grenzen (ehrlich)
- Kein Echtzeit-Kollaborations-Merge; Konflikte beim Trainer-Vollzugriff werden
  erkannt und gemeldet, nicht automatisch verschmolzen.
- Datei-Uploads (Einverständnis-PDFs) bleiben zunächst Teil des Datenbestands
  (~4 MB/Datei); eigener Datei-Store wäre späterer Ausbau.
- E-Mail-Versand (z. B. „Passwort vergessen") braucht einen Mail-Weg; v1 löst
  das über den Trainer (Code neu ausstellen) statt über E-Mails.
