# Plan: volleyball.nettverwaltet.de — von der Datei zur gehosteten Vereins-App

Stand: August 2026 · Ziel: Die SKV-Müritz-Plattform läuft als Web-App mit Login
auf deinem eigenen Server unter **https://volleyball.nettverwaltet.de** und ist
vom iPhone, MacBook und jedem anderen Gerät aus nutzbar — mit **einem
gemeinsamen, geschützten Datenbestand** statt Gerätespeicher.

---

## 1. Ausgangslage und Ziel

**Heute:** Eine einzelne HTML-Datei; Daten liegen im Browser-Speicher des
jeweiligen Geräts (localStorage); Austausch nur manuell per verschlüsselter
`.skv`-Datei.

**Ziel:** Dieselbe App, aber:
- erreichbar unter `volleyball.nettverwaltet.de` (HTTPS)
- **Login vorgeschaltet** — ohne Anmeldung keine Daten (persönliche Daten!)
- Daten liegen **zentral auf dem Server** — alle Geräte sehen denselben Stand
- auf dem iPhone **wie eine App installierbar** (PWA / „Zum Home-Bildschirm")
- weiterhin offline benutzbar, mit Abgleich sobald wieder online

**Grundprinzip des Umbaus:** Die App bleibt zu ~95 % unverändert. Es kommt ein
schlankes Backend dazu, das genau zwei Dinge kann: **Anmelden** und den
**Datenbestand speichern/laden**. Der bestehende Store synchronisiert statt nur
mit localStorage zusätzlich mit dem Server.

```
iPhone/Safari ─┐                        ┌────────────────────────────┐
MacBook  ──────┼── HTTPS + Session ────▶│ volleyball.nettverwaltet.de │
Tablet  ───────┘   (Cookie, HttpOnly)   │  ├─ App (statisch, wie heute)│
                                        │  ├─ API: /api/login, /api/state
                                        │  └─ DB: Nutzer + Datenbestand │
                                        └────────────────────────────┘
```

---

## 2. Entscheidung 1: Welche Art Server ist es?

| | **Variante A: Webhosting-Paket** (empfohlen, wenn vorhanden) | **Variante B: eigener Server/VPS** |
|---|---|---|
| Typisch | All-Inkl, IONOS, Strato, Hetzner Webhosting … | Hetzner Cloud, NAS, Root-Server |
| Backend | **PHP 8 + SQLite** — läuft ohne Installation auf praktisch jedem deutschen Hosting | **Node.js** oder Docker (z. B. Caddy + kleine API) |
| Deployment | Dateien per FTP/SFTP hochladen, fertig | Docker-Compose / systemd-Dienst |
| TLS/HTTPS | beim Hoster per Klick (Let's Encrypt) | Caddy/Traefik automatisch |
| Wartung | minimal | Updates selbst einspielen |

**Empfehlung:** Variante A, falls `nettverwaltet.de` bei einem klassischen
Hoster liegt — geringste Komplexität, kein laufender Prozess, Backups über den
Hoster. Der Plan unten ist für A ausformuliert; für B ändert sich nur die
API-Schicht (gleiches Konzept, gleiche Endpunkte).

## 3. Entscheidung 2: Wer bekommt Zugänge?

- **Stufe 1 (Start):** 1–3 Konten für das Trainerteam. Alle sehen/ändern alles.
- **Stufe 2 (später, optional):** Eltern-/Spieler-Zugänge mit eigener Rolle —
  z. B. nur Kalender sehen und die eigene Trainingsrückmeldung abgeben.
  Das wäre der eigentliche Langfrist-Gewinn der Server-Version, ist aber ein
  eigenes Ausbaupaket (Rollenrechte in jeder Ansicht).

---

## 4. Bausteine im Detail

### 4.1 Domain & TLS (machst du beim Hoster, ~15 Min.)
- Subdomain `volleyball.nettverwaltet.de` im Hoster-Panel anlegen und auf das
  Hosting-Verzeichnis bzw. die Server-IP zeigen lassen (A/CNAME-Record).
- Let's-Encrypt-Zertifikat für die Subdomain aktivieren; **HTTPS erzwingen**
  (Redirect) + HSTS-Header. Ohne HTTPS kein Login-Betrieb.

### 4.2 Backend-API (baue ich)
Ein bewusst kleines PHP-Backend (`/api/`), Datenhaltung in **SQLite** (eine
Datei, vom Webroot aus unerreichbar abgelegt):

| Endpunkt | Zweck |
|---|---|
| `POST /api/login` | Anmeldung (Benutzername + Passwort) → Session-Cookie |
| `POST /api/logout` | Abmelden |
| `GET /api/state` | Gesamten Datenbestand laden (JSON + Versionsnummer) |
| `PUT /api/state` | Datenbestand speichern (mit Versionsprüfung) |
| `GET /api/me` | Sitzungsstatus prüfen |

- **Versionierung:** Jeder Speichervorgang zählt eine Version hoch; gespeichert
  wird nur, wenn der Client die aktuelle Version kannte (optimistisches
  Sperren). Bei Konflikt (zwei Geräte gleichzeitig) bekommt das zweite Gerät
  eine Warnung und lädt neu — für 1–3 Trainer völlig ausreichend.
- **Verlauf:** Die letzten 30 Versionen bleiben als automatische Sicherung in
  der DB (Wiederherstellen-Knopf in der Datensicherung).

### 4.3 Login & Sicherheit (baue ich)
- Passwörter mit **Argon2id** gehasht (PHP `password_hash`), niemals Klartext.
- **Session-Cookie**: HttpOnly, Secure, SameSite=Lax; Ablauf nach Inaktivität
  (konfigurierbar, z. B. 30 Tage „angemeldet bleiben").
- **Rate-Limiting** auf Login (Bremse nach Fehlversuchen), generische
  Fehlermeldung, Protokoll der letzten Anmeldungen.
- **CSRF-Schutz** für schreibende Aufrufe (Token).
- Benutzerverwaltung Stufe 1: Konten werden per kleinem CLI/Setup-Skript
  angelegt (kein offenes „Registrieren" — geschlossener Nutzerkreis).
- Optional (empfohlen, +1 Baustein): **TOTP-Zweitfaktor** (Authenticator-App).
- Sicherheits-Header: CSP, X-Frame-Options, Referrer-Policy.

### 4.4 Frontend-Anpassungen (baue ich)
- **Login-Bildschirm** vor der App (im bestehenden Design).
- **Store-Sync:** `Store.save()` schreibt weiter sofort in localStorage
  (Offline-Fähigkeit!) und schiebt Änderungen gebündelt (debounced) per
  `PUT /api/state` zum Server; beim Start `GET /api/state`.
  Offline erfasste Änderungen werden beim nächsten Online-Start abgeglichen.
- Statusanzeige „☁️ synchronisiert / 📴 offline, 3 Änderungen ausstehend".
- Die bestehende `.skv`-/CSV-Datensicherung bleibt als zusätzliche Absicherung.

### 4.5 PWA — „echte App" auf dem iPhone (baue ich)
- **Web-App-Manifest** (Name, 🏐-Icons in allen Größen, Farben, Standalone-
  Modus) + **Service Worker** (App-Dateien offline gecacht).
- Ergebnis: Safari → Teilen → „Zum Home-Bildschirm" → startet vollbild wie
  eine native App, eigenes Icon, funktioniert auch offline (Daten aus dem
  letzten Sync).

### 4.6 Datenübernahme (einmalig, machst du in 2 Min.)
- Erster Login auf der neuen Domain → Datensicherung → „Verschlüsselt
  importieren" mit deiner aktuellen `.skv`-Datei. Fertig — ab dann ist der
  Server die zentrale Wahrheit.

### 4.7 DSGVO & Betrieb (gemeinsam)
- **AV-Vertrag** mit dem Hoster abschließen (bei deutschen Hostern ein
  Formular-Klick); Hosting in der EU.
- **Datenschutzerklärung + Impressum** als Seiten der App (Vorlage liefere ich;
  Inhalte Verein/Verantwortlicher trägst du ein). Einverständnis-Vorlage
  „Datennutzung" um den Hinweis auf die Online-Plattform ergänzen.
- **Backups:** Hoster-Backup + wöchentlicher automatischer verschlüsselter
  Export (die vorhandene `.skv`-Mechanik, serverseitig).
- **Löschkonzept:** Spieler löschen entfernt alle personenbezogenen Einträge;
  Versionshistorie läuft nach 30 Ständen automatisch aus.
- Klartext-Grenze: WhatsApp bleibt freiwilliger Zusatzkanal, wie im
  Einverständnis formuliert.

---

## 5. Phasen, Reihenfolge, Aufwand

| Phase | Inhalt | Wer | Aufwand |
|---|---|---|---|
| **0** | Hosting-Typ klären, Subdomain + TLS einrichten, FTP-Zugang bereitlegen | du | ~30 Min. |
| **1** | Backend-API + Login + Store-Sync + Login-UI; Deployment-Paket (`dist/server/` zum Hochladen) inkl. Setup-Anleitung | ich | 1 Runde |
| **2** | PWA (Manifest, Icons, Service Worker, Offline-Cache) | ich | klein |
| **3** | Härtung: Rate-Limit-Feinschliff, CSRF, Anmeldeprotokoll, optional TOTP-2FA; DSGVO-Seiten; serverseitiger Backup-Export | ich | 1 Runde |
| **4** | *Optional:* Eltern-/Spieler-Rollen (eigene Zugänge, Rückmeldung selbst abgeben, nur eigene Daten sehen) | ich | größer, eigenes Paket |

Nach Phase 1 ist die App bereits mit Login unter der Domain nutzbar; Phase 2–3
machen sie komfortabel und robust.

## 6. Was du konkret brauchst
1. Zugang zum Hoster-Panel von `nettverwaltet.de` (Subdomain + TLS + FTP).
2. Info an mich: **Variante A oder B** (bzw. welcher Hoster/Serverart).
3. Später: gewünschte Benutzernamen fürs Trainerteam (Passwörter werden beim
   ersten Login selbst gesetzt).

## 7. Risiken & Grenzen (ehrlich)
- **Gleichzeitiges Bearbeiten** auf zwei Geräten löst v1 mit „Letzter gewinnt +
  Warnung" — kein Echtzeit-Merge. Für ein kleines Trainerteam okay; echte
  Mehrbenutzer-Gleichzeitigkeit wäre Phase-4-Thema.
- **Uploads** (Einverständnis-PDFs) wandern in v1 als Teil des Datenbestands
  mit (Größenlimit ~4 MB/Datei bleibt); ein eigener Datei-Store wäre Ausbau.
- Ein selbst gehosteter Server bedeutet **Betriebsverantwortung** (Updates,
  Backups prüfen). Variante A minimiert das, auf null geht es nie.
