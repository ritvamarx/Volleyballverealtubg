# Java-Minecraft-Server auf dem Mac mini

Vollständiger Plan von der leeren Maschine bis zum Server, der nach einem
Stromausfall von selbst wieder hochkommt. Geschätzter Gesamtaufwand: **1,5–2
Stunden**, davon das meiste Wartezeit bei Downloads.

Die Kostenübersicht und der Vergleich mit gemieteten Servern stehen in
[`../../MINECRAFT-SERVER-PLAN.md`](../../MINECRAFT-SERVER-PLAN.md).

## Warum hier nativ und nicht Docker

Für Linux-Server empfiehlt dieses Repo Docker (siehe
[`../docker-compose.yml`](../docker-compose.yml)). **Auf dem Mac gilt das
nicht.** Docker Desktop startet unter macOS eine komplette Linux-VM: Die
reserviert dauerhaft RAM, bremst die Festplattenzugriffe spürbar aus, und die
Weltdaten liegen hinter einer Dateisystem-Brücke. Für einen Minecraft-Server,
der genau eine Java-Anwendung ist, lohnt das nicht.

Auf dem Mac mini läuft Paper deshalb direkt als Java-Prozess, verwaltet von
**launchd** — dem macOS-eigenen Dienst-System, das hier die Rolle von
`systemd` übernimmt.

## Phase 0 — Maschine prüfen (5 Minuten)

Terminal öffnen (`Cmd+Leertaste` → „Terminal") und ausführen:

```bash
uname -m                    # arm64 = Apple Silicon, x86_64 = Intel
sw_vers                     # macOS-Version
sysctl -n hw.memsize | awk '{print $1/1024/1024/1024 " GB RAM"}'
```

Was das für dich bedeutet:

| Ergebnis | Bewertung |
|---|---|
| `arm64` (M1/M2/M4) | ideal — sehr sparsam, sehr schnell |
| `x86_64` (Intel, 2012–2018) | funktioniert gut, braucht mehr Strom |
| 8 GB RAM | reicht für 5–10 Spieler |
| 16 GB RAM oder mehr | reicht für alles, was du vorhast |
| 4 GB RAM | knapp, aber machbar (siehe Sparvariante unten) |

**Wichtige Regel für später:** Dem Server maximal `Gesamt-RAM minus 3 GB`
zuweisen. macOS selbst braucht den Rest.

## Phase 1 — Java 21 installieren (10 Minuten)

Minecraft ab Version 1.20.5 benötigt **Java 21 oder neuer**. Das mitgelieferte
macOS hat kein Java.

**Homebrew installieren** (falls noch nicht vorhanden):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Auf Apple Silicon danach dem Hinweis am Ende folgen und Homebrew in den PATH
aufnehmen (`eval "$(/opt/homebrew/bin/brew shellenv)"`).

**Java und Hilfswerkzeuge installieren:**

```bash
brew install --cask temurin@21
brew install jq mcrcon
```

**Prüfen — und zwar genau hinsehen:**

```bash
java -version
java -XshowSettings:properties -version 2>&1 | grep os.arch
```

Die erste Ausgabe muss `21` (oder höher) zeigen. Die zweite muss auf Apple
Silicon **`aarch64`** ergeben. Steht dort `x86_64`, läuft Java über die
Rosetta-Emulation — das kostet deutlich Leistung. Dann das Temurin-Paket
entfernen und die ARM-Variante von [adoptium.net](https://adoptium.net)
manuell installieren.

## Phase 2 — Server anlegen und erster Start (15 Minuten)

Die Skripte aus diesem Ordner auf den Mac kopieren und einrichten:

```bash
mkdir -p ~/minecraft-server
cd ~/minecraft-server
# setup.sh, start.sh und backup.sh aus minecraft-server/macos/ hierher kopieren
chmod +x setup.sh start.sh backup.sh
./setup.sh
```

`setup.sh` lädt die aktuelle Paper-Version herunter, legt die Ordnerstruktur
an und schreibt eine sinnvolle Grundkonfiguration. Falls sich die Download-API
von PaperMC geändert hat, bricht das Skript mit einer klaren Meldung ab — dann
die JAR-Datei von [papermc.io/downloads](https://papermc.io/downloads) manuell
herunterladen, als `paper.jar` in den Ordner legen und `./setup.sh` erneut
starten.

**Erster Start:**

```bash
./start.sh
```

Der erste Start dauert 1–3 Minuten, weil die Welt erzeugt wird. Wenn `Done
(x.xxx s)! For help, type "help"` erscheint, läuft der Server. Mit `stop`
sauber beenden.

An dieser Stelle kannst du bereits von einem Rechner im selben WLAN beitreten —
Serveradresse ist die lokale IP des Mac mini:

```bash
ipconfig getifaddr en0     # bei Kabelverbindung ggf. en1 statt en0
```

## Phase 3 — Server konfigurieren (10 Minuten)

`server.properties` im Serverordner öffnen. Die Einstellungen, die wirklich
etwas bewirken:

| Einstellung | Empfehlung | Warum |
|---|---|---|
| `view-distance` | `8` (bei 4 GB RAM: `6`) | größter Hebel für RAM-Bedarf |
| `simulation-distance` | `6` (bei 4 GB RAM: `4`) | größter Hebel für CPU-Last |
| `max-players` | so viele, wie ihr wirklich seid | jeder Spieler lädt eigene Chunks |
| `white-list` | `true` | verhindert Fremdzugriff und Griefing |
| `online-mode` | `true` (**unbedingt so lassen**) | nur echte Minecraft-Konten kommen rein |
| `difficulty` | `normal` | Geschmackssache |
| `motd` | euer Servername | steht in der Serverliste |

### Arbeitsspeicher

Darum musst du dich normalerweise nicht kümmern: `start.sh` liest den verbauten
RAM aus und lässt macOS 3 GB übrig.

| Mac mini | Server bekommt | für macOS bleiben |
|---|---|---|
| 4 GB | 1 GB | 3 GB |
| 8 GB | 5 GB | 3 GB |
| 16 GB und mehr | 8 GB | Rest |

Die Obergrenze von 8 GB ist Absicht: Mehr bringt einer kleinen Runde nichts,
belegt aber sofort echten Arbeitsspeicher. Falls du doch mehr brauchst (großes
Modpack, viele Spieler), lässt sich das überschreiben:

```bash
MC_HEAP=12G ./start.sh
```

Bei Werten über 12 GB solltest du die Aikar-Flags in `start.sh` anpassen —
sie sind auf kleinere Heaps abgestimmt. Die passenden Werte stehen auf
[flags.sh](https://flags.sh).

Spieler auf die Whitelist setzen — dafür läuft der Server bereits mit
aktiviertem RCON, also von einem zweiten Terminal aus:

```bash
mcrcon -H 127.0.0.1 -P 25575 -p "$(cat ~/minecraft-server/rcon.password)" "whitelist add Spielername"
```

Alternativ direkt im Serverfenster tippen, solange der Server im Vordergrund
läuft.

## Phase 4 — Dauerbetrieb: Autostart und kein Schlaf (20 Minuten)

Das ist der Teil, der einen Mac mini erst zum Server macht.

### 4a — Energieeinstellungen

Ein Mac mini schläft standardmäßig ein. Ein schlafender Server ist kein Server:

```bash
sudo pmset -a sleep 0          # Rechner schläft nie
sudo pmset -a disksleep 0      # Festplatte schläft nie
sudo pmset -a autorestart 1    # startet nach Stromausfall selbst wieder
sudo pmset -a womp 1           # weckt bei Netzwerkzugriff
sudo pmset -a powernap 0       # Power Nap aus
sudo pmset -a displaysleep 10  # Bildschirm darf schlafen, das spart Strom
```

Kontrollieren mit `pmset -g`.

### 4b — FileVault beachten

```bash
fdesetup status
```

Ist FileVault **aktiviert**, verlangt der Mac nach jedem Neustart die
Festplatten-Entsperrung, *bevor* Dienste starten. Der Server käme nach einem
Stromausfall also nicht von allein hoch — genau der Fall, für den `autorestart`
gedacht war.

Zwei Möglichkeiten: FileVault deaktivieren (der Mac mini steht vermutlich
zuhause, das Risiko ist überschaubar), oder es aktiviert lassen und nach einem
Stromausfall einmal von Hand entsperren. Deine Entscheidung — aber du solltest
sie bewusst treffen.

### 4c — launchd-Dienst einrichten

`com.minecraft.server.plist` aus diesem Ordner nehmen und **alle drei
Vorkommen von `DEIN_BENUTZERNAME`** durch deinen tatsächlichen Kurznamen
ersetzen (`whoami` zeigt ihn an). Dann:

```bash
sudo cp com.minecraft.server.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.minecraft.server.plist
sudo chmod 644 /Library/LaunchDaemons/com.minecraft.server.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.minecraft.server.plist
```

Warum ein **LaunchDaemon** und kein LaunchAgent: Ein Daemon startet beim
Systemstart, ohne dass sich jemand anmelden muss. Ein Agent bräuchte
automatische Anmeldung.

Der Dienst ist so eingestellt, dass er **nur nach einem Absturz** neu startet.
Beendest du den Server sauber mit `stop`, bleibt er aus — das brauchst du für
Wartungsarbeiten.

Steuerung im Alltag:

```bash
sudo launchctl kickstart -k system/com.minecraft.server   # neu starten
sudo launchctl bootout system/com.minecraft.server        # anhalten
sudo launchctl print system/com.minecraft.server          # Status ansehen
```

## Phase 5 — Von außen erreichbar machen (20–40 Minuten)

### 5a — macOS-Firewall

Beim ersten Start fragt macOS, ob Java eingehende Verbindungen annehmen darf —
mit „Erlauben" bestätigen. Kam die Frage nicht:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$(/usr/libexec/java_home -v 21)/bin/java"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$(/usr/libexec/java_home -v 21)/bin/java"
```

### 5b — Feste lokale IP

Im Router eine **DHCP-Reservierung** für den Mac mini einrichten (bei der
FritzBox: Heimnetz → Netzwerk → Gerät bearbeiten → „Diesem Gerät immer die
gleiche IPv4-Adresse zuweisen"). Ohne das zeigt die Portfreigabe irgendwann
ins Leere.

### 5c — Prüfen, ob Portfreigabe überhaupt möglich ist

Erst testen, ob dein Anschluss hinter CGNAT liegt — sonst suchst du später
lange:

```bash
curl -s https://ifconfig.me
```

Diese Adresse mit der WAN-IP vergleichen, die dein Router anzeigt.

- **Adressen identisch** → Portfreigabe funktioniert, weiter mit 5d.
- **Adressen verschieden** → CGNAT, Portfreigabe ist unmöglich. Dann
  **playit.gg** verwenden: kostenloser Tunnel, `brew install --cask playit`,
  Konto anlegen, Tunnel auf `127.0.0.1:25565` zeigen lassen. Du bekommst eine
  Adresse, die deine Freunde nutzen können. Schritt 5d und 5e entfallen damit.

### 5d — Portfreigabe im Router

**Port 25565/TCP** auf die lokale IP des Mac mini freigeben.

**Port 25575 (RCON) auf keinen Fall freigeben.** Über RCON hat man volle
Kontrolle über den Server; er gehört ausschließlich ins lokale Netz.

### 5e — Wechselnde öffentliche IP

Die meisten Privatanschlüsse bekommen regelmäßig eine neue IP. Kostenlose
Lösung: Konto bei [duckdns.org](https://duckdns.org) anlegen und die
Aktualisierung im Router eintragen (FritzBox: Internet → Freigaben →
DynDNS). Deine Freunde nutzen dann `deinname.duckdns.org:25565`.

## Phase 6 — Backups (10 Minuten)

`backup.sh` sichert die Welt konsistent: Es schaltet über RCON das
Speichern kurz ab, packt die Weltordner und schaltet es wieder ein. Ohne
diesen Schritt riskierst du ein Backup mit halb geschriebenen Chunks.

Automatisch täglich um 4 Uhr:

```bash
# DEIN_BENUTZERNAME auch hier ersetzen
sudo cp com.minecraft.backup.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.minecraft.backup.plist
sudo chmod 644 /Library/LaunchDaemons/com.minecraft.backup.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.minecraft.backup.plist
```

Einmal von Hand testen, bevor du dich darauf verlässt:

```bash
~/minecraft-server/backup.sh && ls -lh ~/minecraft-server/backups/
```

Sicherungen älter als 7 Tage werden automatisch gelöscht.

**Time Machine:** Den Ordner `~/minecraft-server/world*` in den Time-Machine-
Ausschlüssen eintragen (Systemeinstellungen → Time Machine → Optionen). Die
Weltdateien ändern sich permanent und blähen sonst jede Sicherung auf. Der
Ordner `backups/` sollte dagegen mitgesichert werden — dann liegen deine
Welten auch auf der externen Platte.

## Phase 7 — Wartung

**Paper aktualisieren** (etwa monatlich, und nach jedem Minecraft-Update):

```bash
sudo launchctl bootout system/com.minecraft.server
cd ~/minecraft-server && ./setup.sh --update
sudo launchctl bootstrap system /Library/LaunchDaemons/com.minecraft.server.plist
```

`--update` lädt nur die neue JAR-Datei und lässt Welt und Konfiguration in Ruhe.
Vorher läuft automatisch ein Backup.

**Logs ansehen:**

```bash
tail -f ~/minecraft-server/logs/latest.log
```

## Stromkosten

Bei 0,35 €/kWh (Deutschland, Mitte 2026):

| Modell | Realistische Dauerlast | Kosten/Monat |
|---|---|---|
| Mac mini M1/M2/M4 | 10–15 W | **~3–4 €** |
| Mac mini Intel (2018) | 25–35 W | ~7–9 € |
| Mac mini Intel (2012–2014) | 15–25 W | ~4–6 € |

Ein Apple-Silicon-Mac-mini ist damit günstiger als fast jeder gemietete
Server — und du hast die volle Kontrolle über deine Welt.

## Troubleshooting

**„Failed to bind to port" beim Start** — es läuft bereits ein Server:
`sudo lsof -i :25565` zeigt den Prozess.

**Freunde kommen nicht rein, im lokalen Netz geht es** — Portfreigabe oder
CGNAT. Erst Phase 5c wiederholen, dann von außen testen (z. B. über das
Mobilfunknetz statt WLAN).

**Server startet nach Neustart nicht** — FileVault (Phase 4b) oder ein Tippfehler
im Pfad der plist-Datei. Prüfen mit:
`sudo launchctl print system/com.minecraft.server` und
`cat ~/minecraft-server/logs/launchd.err.log`.

**Ruckeln beim Erkunden** — `view-distance` senken. Der Wert wirkt stärker als
alles andere.

**`java: command not found` im launchd-Dienst** — launchd kennt deinen PATH nicht.
`start.sh` löst Java bewusst über `/usr/libexec/java_home` auf, damit genau das
nicht passiert. Tritt es trotzdem auf, ist Java 21 nicht installiert.
