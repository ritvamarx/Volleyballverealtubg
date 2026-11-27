# Übergabe: Testumgebung für nettverwaltet.de (neuer Chat)

Stand 2026-11-27. Dieses Blatt ist die Startgrundlage für einen neuen Chat, der eine
Testumgebung für die Seite **nettverwaltet.de** einrichtet – nach dem Muster, das für die
Volleyball-App bereits läuft.

## Was im Volleyball-Projekt funktioniert (Vorlage)

- Gleicher Hetzner-Server (`root@mein.werkhauswaren.de`, Docker + Caddy als Reverse-Proxy
  mit automatischem TLS), Live und Test als getrennte Container mit eigener Datenbank
  und eigener `.env`.
- Live: `/opt/volleyball` → `volleyball.nettverwaltet.de`, folgt dem Git-Branch `live`
  (dorthin wird nur nach ausdrücklicher „Freigabe“ gepusht; Updater holt den Stand ≤ 10 min).
- Test: `/opt/volleyball-test` → `volleyball-test.nettverwaltet.de`, folgt `main`
  (`deploy/auto-update.sh` per Cron alle 10 Minuten, Log `data/update.log`).
- Einmalige Einrichtung über ein Skript, das AUF DEM SERVER läuft
  (`deploy/test-einrichten.sh`): Dateien von GitHub holen, `.env` kopieren, Container
  bauen, Caddy-vHost ergänzen (mit Sicherungskopie und `caddy validate` vor dem Reload),
  Cron für das Auto-Update anlegen. Mehrfach ausführbar, Live wird nie angefasst.
- Testkonten per `manage.py test-konten`.
- E-Mail über Brevo-SMTP mit Absender `skv.volleyball@nettverwaltet.de`
  (Domain nettverwaltet.de ist bei Brevo mit DKIM authentifiziert; `hub@nettverwaltet.de`
  wurde früher ebenso betrieben).

## Was der neue Chat zuerst klären muss

1. **Welches Repository** gehört zu nettverwaltet.de, und wie ist die Seite heute
   aufgesetzt (statisch, WordPress, eigener Container, Pfad unter `/opt/…`, Caddy-Block)?
   Repository ggf. zur Sitzung hinzufügen.
2. **Domain der Testumgebung**, Vorschlag `test.nettverwaltet.de` (DNS-A-Record auf den
   Server, falls kein Wildcard existiert).
3. Gibt es Daten/Datenbank, die kopiert werden sollen, oder startet Test leer?
4. Soll Test wie bei Volleyball automatisch `main` folgen und Live einen Branch `live`
   bekommen?

## Regeln aus dem Volleyball-Projekt (gelten weiter)

- Keine Server-, SMTP- oder API-Zugangsdaten im Chat; Werte trägt die Nutzerin auf dem
  Server ein. Befehle als kopierbarer Block liefern, nie zum Abtippen.
- Live wird nur nach ausdrücklicher „Freigabe“ verändert. Test-Deploys sind frei.
- Keine veralteten Konsolen-Blöcke erneut vorschlagen; vorher Zustand prüfen.
- Modellnamen gehören nicht in Commits oder Pull Requests.

## Noch offen im Volleyball-Projekt (nicht Teil des neuen Chats)

- Freigabe für Stand eb9b65c (B4-Rest: Rückweg nach „durchsetzen“, Verlauf mit
  Wiederherstellen) – liegt auf der Testinstanz.
- Einmalig auf dem Server: Cron für die Automatik „ruhend“ installieren
  (`deploy/cron/volleyball-ruhend`, vorher `./manage.py ruhend-pruefen --trocken`).
- Später: Testumgebung für intern.spdwaren.de nach demselben Muster.

## Startnachricht für den neuen Chat (zum Einfügen)

> Richte eine Testumgebung für nettverwaltet.de ein – nach dem Muster der Volleyball-App
> (siehe `docs/UEBERGABE-testumgebung-nettverwaltet.md` und `deploy/test-einrichten.sh`
> im Repository ritvamarx/Volleyballverealtubg): eigener Container mit eigener `.env`,
> Test-Domain `test.nettverwaltet.de` über Caddy auf demselben Hetzner-Server, automatisches
> Update vom Branch `main` alle 10 Minuten, Live unverändert. Kläre zuerst, welches
> Repository zur Seite gehört und wie sie heute läuft, dann plane kurz und setze um.
> Zugangsdaten trage ich selbst auf dem Server ein; Live nur nach meiner Freigabe.
