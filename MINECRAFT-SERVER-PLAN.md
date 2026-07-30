# Minecraft-Server mit minimalen Kosten — Optionen & Plan

Stand: Juli 2026. Alle Preise sind Richtwerte und können sich ändern.

## Kurzantwort

**Kann der Server „auf diesem" (dieser Claude-Code-Cloud-Umgebung) laufen?**
Nein, nicht dauerhaft. Diese Umgebung ist ein temporärer Container:

- Er wird nach Inaktivität bzw. Sitzungsende **gelöscht** — die Spielwelt wäre weg.
- Es gibt **keine eingehenden Netzwerkverbindungen** (keine offenen Ports), d. h.
  niemand könnte dem Server beitreten.
- Ein kurzer lokaler Testlauf wäre technisch möglich (Java 21 ist installiert),
  aber als echter Server ist das unbrauchbar.

Für einen echten Server braucht man eine **dauerhaft laufende, aus dem Internet
erreichbare Maschine**. Das muss aber kein teurer Mietserver sein — es gibt
Optionen ab **0 €**.

## Die Optionen im Vergleich

| # | Option | Kosten/Monat | Leistung | Aufwand | Haken |
|---|--------|--------------|----------|---------|-------|
| 1 | **Aternos** (kostenloser Hoster) | **0 €** | für 2–6 Spieler ok | sehr gering | Warteschlange beim Start, Server schläft bei Inaktivität, Werbung |
| 2 | **Oracle Cloud „Always Free"** (ARM-VM) | **0 €** | sehr gut (bis 4 CPU / 24 GB RAM) | mittel–hoch | Kreditkarte zur Verifizierung nötig, ARM-Kapazität je Region knapp, Konto-Regeln beachten |
| 3 | **Zuhause selbst hosten** (alter Laptop / Raspberry Pi) | ~1–5 € Strom | gut für 3–10 Spieler | mittel | Portfreigabe im Router, dynamische IP (DynDNS), Gerät läuft 24/7 |
| 4 | **Günstiger VPS** (z. B. Hetzner CAX11/CX22, Netcup) | ~4–6 € | gut für 5–15 Spieler | mittel | Linux-Grundkenntnisse nötig, Server selbst absichern |
| 5 | **Minecraft-Spezialhoster** (exaroton, Nitrado, G-Portal …) | ~5–15 € (exaroton: nutzungsbasiert, oft günstiger) | gut | sehr gering | teuerste Dauerlösung; exaroton lohnt sich nur bei wenigen Spielstunden |

### Empfehlung nach Situation

- **Nur mit Freunden ab und zu spielen, 0 € Budget:** → **Option 1 (Aternos)**.
  Registrieren, Server anklicken, fertig. Die Warteschlange ist der Preis dafür.
- **0 € Budget, aber dauerhaft online und leistungsstark:** → **Option 2
  (Oracle Free Tier)**, wenn man die Einrichtung nicht scheut.
- **Es liegt ein alter Laptop/PC herum:** → **Option 3 (Zuhause)**. Ein Laptop
  mit 8 GB RAM reicht locker; Stromkosten ~15 W ≈ 4 €/Monat, ein Raspberry Pi 4/5
  ≈ 1–2 €/Monat.
- **Zuverlässig, wenig Bastelei, kleines Budget:** → **Option 4 (VPS)** für
  ~4–6 €/Monat — das beste Preis-Leistungs-Verhältnis unter den Bezahloptionen.

## Technische Basis (für Optionen 2–4)

- **Server-Software:** [PaperMC](https://papermc.io) statt Vanilla — deutlich
  performanter, gleiche Spielerfahrung, Plugin-Unterstützung.
- **RAM:** 2–4 GB reichen für einen kleinen Server (5–10 Spieler ohne große
  Modpacks). Vanilla/Paper läuft ab ~1,5 GB.
- **Java:** Version 21 (für Minecraft 1.20.5+).
- **Betrieb:** Am einfachsten per Docker mit dem Image `itzg/minecraft-server`
  (automatische Updates, Neustart, EULA, Backups). Fertige Konfiguration liegt
  in [`minecraft-server/docker-compose.yml`](minecraft-server/docker-compose.yml).

## Schritt-für-Schritt-Plan

### Phase 1 — Sofort kostenlos starten (Tag 1)

1. Konto bei [aternos.org](https://aternos.org) anlegen (kostenlos).
2. Server erstellen, Version wählen (z. B. Paper, aktuelle Version).
3. Freunde per Serveradresse einladen. **Kosten: 0 €.**
4. Damit prüfen: Macht uns das Spielen überhaupt dauerhaft Spaß? Wie viele
   Spieler sind wir wirklich?

### Phase 2 — Entscheidung nach 2–4 Wochen

- Stört die Aternos-Warteschlange nicht → **bei 0 € bleiben, fertig.**
- Server soll immer sofort erreichbar sein →  Phase 3a (0 €) oder 3b (~5 €).

### Phase 3a — Oracle Cloud Free Tier (0 €, ~2–3 h Einrichtung)

1. Oracle-Cloud-Konto anlegen (Kreditkarte nur zur Verifizierung; „Always
   Free"-Ressourcen kosten dauerhaft nichts).
2. ARM-Instanz (Ampere A1) anlegen: bis zu 4 OCPU / 24 GB RAM sind frei —
   2 OCPU / 12 GB reichen völlig. Ubuntu 24.04 als Image.
3. In den Security Rules Port **25565/TCP** freigeben (zusätzlich in der
   VM-Firewall).
4. Docker installieren, `minecraft-server/docker-compose.yml` aus diesem Repo
   auf den Server kopieren, `docker compose up -d` — läuft.
5. Backups: der Compose-Stack legt automatisch tägliche Welt-Backups an.

### Phase 3b — Alternativ: VPS für ~4–6 €/Monat

1. VPS mieten (z. B. Hetzner CAX11, ARM, 4 GB RAM, ~4 €/Monat — Standort
   Deutschland/Falkenstein, gut für deutsche Spieler-Pings).
2. Gleiche Schritte wie 3a ab Punkt 3 (Firewall, Docker, Compose-Datei).
3. Grundabsicherung: SSH nur mit Key, `ufw` aktivieren (nur 22 + 25565 offen),
   automatische Sicherheitsupdates (`unattended-upgrades`).

### Phase 3c — Alternativ: Zuhause hosten (nur Stromkosten)

1. Alten Laptop/PC mit Linux (oder Windows) 24/7 laufen lassen; Deckel-zu-
   Standby im Energiemanagement deaktivieren.
2. Docker + die Compose-Datei aus diesem Repo verwenden.
3. Im Router (z. B. FritzBox) Portfreigabe **25565/TCP** auf das Gerät einrichten.
4. Dynamische IP lösen: kostenloses DynDNS (z. B. DuckDNS) oder — ohne
   Portfreigabe und hinter CGNAT — **playit.gg** (kostenloser Tunnel).
5. Achtung: Heim-Upload sollte ≥ 10 Mbit/s sein, sonst laggt es ab ~5 Spielern.

## Kostenübersicht Jahr 1

| Weg | Jahr 1 gesamt |
|-----|---------------|
| Aternos | 0 € |
| Oracle Free Tier | 0 € |
| Zuhause (alter Laptop) | ~15–60 € Strom |
| VPS (Hetzner CAX11) | ~47–72 € |
| Spezialhoster | ~60–180 € |

## Sicherheits-Checkliste (für jede selbst gehostete Variante)

- [ ] `online-mode=true` lassen (nur echte Minecraft-Konten können joinen).
- [ ] Whitelist aktivieren (`whitelist on` + Spieler hinzufügen) — verhindert
      Griefing durch Fremde.
- [ ] Regelmäßige Backups der Welt (im Compose-Stack enthalten).
- [ ] Keine unnötigen Ports öffnen; RCON (25575) **nicht** ins Internet freigeben.
