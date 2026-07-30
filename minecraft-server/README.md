# Minecraft-Server — Setup

Die Kosten- und Entscheidungsübersicht steht in
[`../MINECRAFT-SERVER-PLAN.md`](../MINECRAFT-SERVER-PLAN.md).
Hier steht nur, wie man den Server konkret startet.

## Voraussetzungen

Eine Linux-Maschine, die dauerhaft läuft und aus dem Internet erreichbar ist
(VPS, Oracle Free Tier, oder ein Gerät zuhause mit Portfreigabe). Docker muss
installiert sein:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # danach einmal ab- und wieder anmelden
```

## Start

```bash
git clone <dieses-repo> && cd Volleyballverealtubg/minecraft-server
docker compose up -d
docker compose logs -f mc          # beim ersten Start dauert es 1–2 Minuten
```

### Sparvariante für kleine Maschinen

Auf einem Raspberry Pi oder der kleinsten VPS-Stufe stattdessen
`docker-compose.minimal.yml` verwenden — 1 GB RAM, `view-distance 6`, bis zu
5 Spieler:

```bash
docker compose -f docker-compose.minimal.yml up -d
```

Verbinden im Spiel über `<IP-des-Servers>:25565`.

## Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw enable
```

Bei Cloud-Anbietern zusätzlich Port 25565/TCP in der Sicherheitsgruppe der
Weboberfläche freigeben — sonst blockt der Anbieter trotz offener VM-Firewall.

## Spieler auf die Whitelist setzen

Entweder in `docker-compose.yml` die Zeile `WHITELIST` eintragen und
`docker compose up -d` erneut ausführen, oder direkt auf der Serverkonsole:

```bash
docker exec minecraft rcon-cli whitelist add Spielername
```

## RAM anpassen

`MEMORY` in `docker-compose.yml` ändern (Faustregel: Gesamt-RAM der Maschine
minus 1 GB fürs Betriebssystem), dann `docker compose up -d`.

## Backups

Der `backups`-Container legt täglich ein Archiv unter `./backups/` ab und löscht
Sicherungen, die älter als 7 Tage sind. Wiederherstellen: Container stoppen,
`./data/world*` durch den Inhalt des Backups ersetzen, Container starten.

## Server stoppen / entfernen

```bash
docker compose down          # stoppt, Welt in ./data bleibt erhalten
```
