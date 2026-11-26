#!/usr/bin/env python3
"""SKV Müritz Volleyball – Verwaltungs-Kommandos (auf dem Server ausführen).

Beispiele:
  ./manage.py create-trainer --username andreas --name "Andreas Berg"
  ./manage.py create-invite --role trainer --name "Katrin Sommer"
  ./manage.py reset-2fa andreas
  ./manage.py reset-password andreas
  ./manage.py list-users
  ./manage.py backup /pfad/zur/sicherung/
Im Container:  docker compose exec app ./manage.py <kommando>
"""
from __future__ import annotations

import argparse
import getpass
import os
import shutil
import sys
import time

import auth
import db


def _prompt_password() -> str:
    while True:
        pw1 = getpass.getpass("Passwort (mind. 8 Zeichen): ")
        if len(pw1) < 8:
            print("Zu kurz.")
            continue
        pw2 = getpass.getpass("Passwort wiederholen: ")
        if pw1 != pw2:
            print("Stimmt nicht überein.")
            continue
        return pw1


def cmd_create_trainer(args) -> None:
    db.init_db()
    con = db.connect()
    if con.execute("SELECT 1 FROM users WHERE username = ?", (args.username,)).fetchone():
        sys.exit(f"Benutzername '{args.username}' existiert bereits.")
    password = args.password or _prompt_password()
    if len(password) < 8:
        sys.exit("Passwort zu kurz (mind. 8 Zeichen).")
    with con:
        con.execute(
            "INSERT INTO users (username, name, role, pw_hash, created_at) VALUES (?,?,?,?,?)",
            (args.username, args.name or args.username, "trainer",
             auth.hash_password(password), db.now()),
        )
    print(f"Trainerkonto '{args.username}' angelegt. Beim ersten Login wird 2FA eingerichtet.")


def cmd_test_konten(args) -> None:
    """Testkonten für Trainer, Spieler:in und Eltern anlegen (oder Passwörter neu setzen).

    Legt bei Bedarf eine Testspieler:in „Mia Muster“ im Datenbestand an und verknüpft
    Spieler- und Elternkonto damit. Mehrfach ausführbar: vorhandene Konten bekommen
    nur ein neues Passwort. Gedacht für die TEST-Instanz.
    """
    import json
    import secrets as _sec
    db.init_db()
    con = db.connect()
    # Testspieler:in im Datenbestand sicherstellen
    row = db.get_state(con)
    daten = json.loads(row["data"]) if row else {}
    spieler = [p for p in daten.get("players", []) if isinstance(p, dict)]
    pid = next((p["id"] for p in spieler if p.get("lastName") == "Muster" and p.get("firstName") == "Mia"), None)
    if pid is None:
        pid = "pl_test_mia"
        spieler.append({"id": pid, "firstName": "Mia", "lastName": "Muster", "birthDate": "2011-05-14",
                        "position": "Außen", "jerseyNumber": 99, "team": "", "parentName": "Petra Muster",
                        "parent2Name": "", "parentEmail": "", "parentPhone": "", "playerEmail": "", "playerPhone": "",
                        "consentOnFile": False, "membershipStatus": "aktiv", "notes": "Testspielerin",
                        "gender": "w", "passNumber": "", "departmentId": None, "departmentIds": []})
        daten["players"] = spieler
        if row is None:
            con.execute("INSERT INTO app_state (id, version, data, updated_at, updated_by) VALUES (1, 1, ?, ?, ?)",
                        (json.dumps(daten, ensure_ascii=False), db.now(), "manage.py test-konten"))
            con.commit()
        else:
            db.put_state(con, row["version"], json.dumps(daten, ensure_ascii=False), "manage.py test-konten")
        print("Testspielerin „Mia Muster“ angelegt.")
    konten = (("test-trainer", "Test Trainer", "trainer", []),
              ("test-spieler", "Mia Muster", "spieler", [pid]),
              ("test-eltern", "Petra Muster", "eltern", [pid]))
    zeilen = []
    with con:
        for username, name, rolle, pids in konten:
            pw = args.passwort or _sec.token_urlsafe(9)
            vorhanden = con.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if vorhanden:
                con.execute("UPDATE users SET pw_hash = ?, active = 1, player_ids = ?, name = ? WHERE id = ?",
                            (auth.hash_password(pw), json.dumps(pids), name, vorhanden["id"]))
                con.execute("DELETE FROM sessions WHERE user_id = ?", (vorhanden["id"],))
                if rolle == "trainer" and args.reset_2fa:
                    con.execute("UPDATE users SET totp_secret = NULL, totp_enabled = 0, backup_codes = '[]' WHERE id = ?",
                                (vorhanden["id"],))
                stand = "Passwort neu gesetzt"
            else:
                con.execute("INSERT INTO users (username, name, role, pw_hash, player_ids, created_at)"
                            " VALUES (?,?,?,?,?,?)",
                            (username, name, rolle, auth.hash_password(pw), json.dumps(pids), db.now()))
                stand = "neu angelegt"
            zeilen.append((rolle, username, pw, stand))
    print()
    print(f"{'Rolle':<9} {'Benutzername':<14} {'Passwort':<16} Stand")
    for rolle, username, pw, stand in zeilen:
        print(f"{rolle:<9} {username:<14} {pw:<16} {stand}")
    print()
    print("Trainer: beim ersten Login wird die 2FA (Authenticator-App) eingerichtet.")
    print("Spieler/Eltern: Anmeldung mit Benutzername + Passwort, danach im Portal Passkey möglich.")


def cmd_create_invite(args) -> None:
    db.init_db()
    con = db.connect()
    code = auth.new_code()
    with con:
        con.execute(
            "INSERT INTO invites (code_hash, role, name, created_by, created_at, expires_at)"
            " VALUES (?,?,?,?,?,?)",
            (auth.hash_code(code), args.role, args.name or "", "manage.py",
             db.now(), db.now() + 14 * 86400),
        )
    print(f"Einladungscode ({args.role}, 14 Tage gültig): {code}")


def cmd_reset_2fa(args) -> None:
    con = db.connect()
    with con:
        cur = con.execute(
            "UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = '[]'"
            " WHERE username = ?",
            (args.username,),
        )
        con.execute(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = ?)",
            (args.username,),
        )
    if cur.rowcount == 0:
        sys.exit("Konto nicht gefunden.")
    print(f"2FA für '{args.username}' zurückgesetzt – wird beim nächsten Login neu eingerichtet.")


def cmd_reset_password(args) -> None:
    con = db.connect()
    password = args.password or _prompt_password()
    with con:
        cur = con.execute(
            "UPDATE users SET pw_hash = ? WHERE username = ?",
            (auth.hash_password(password), args.username),
        )
        con.execute(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = ?)",
            (args.username,),
        )
    if cur.rowcount == 0:
        sys.exit("Konto nicht gefunden.")
    print(f"Passwort für '{args.username}' gesetzt; alle Sitzungen abgemeldet.")


def cmd_list_users(_args) -> None:
    db.init_db()
    con = db.connect()
    rows = con.execute(
        "SELECT username, name, role, email, totp_enabled, active, created_at FROM users ORDER BY role, username"
    ).fetchall()
    for r in rows:
        ts = time.strftime("%d.%m.%Y", time.localtime(r["created_at"]))
        print(f"{r['role']:<8} {r['username']:<20} {r['name']:<24} {(r['email'] or '-'):<30} "
              f"2FA={'ja' if r['totp_enabled'] else 'nein'} aktiv={'ja' if r['active'] else 'nein'} seit {ts}")


def cmd_email_import(_args) -> None:
    """Leere E-Mail-Felder der Portal-Konten aus den Spielerdaten füllen."""
    db.init_db()
    con = db.connect()
    n = db.emails_aus_spielerdaten(con)
    offen = con.execute(
        "SELECT username, name FROM users WHERE role != 'trainer' AND active = 1"
        " AND (email IS NULL OR email = '') ORDER BY name").fetchall()
    print(f"{n} Adresse(n) übernommen.")
    if offen:
        print("Noch ohne E-Mail (in den Spielerdaten nachtragen oder in Portal-Zugängen eintragen):")
        for r in offen:
            print(f"  {r['name']} ({r['username']})")


def cmd_backup(args) -> None:
    """Konsistente SQLite-Sicherung (nutzt das Online-Backup der sqlite3-API)."""
    import sqlite3

    os.makedirs(args.ziel, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d_%H%M")
    target = os.path.join(args.ziel, f"volleyball_{stamp}.db")
    src = sqlite3.connect(db.DB_PATH)
    dst = sqlite3.connect(target)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    print(f"Sicherung geschrieben: {target}")
    # Dokumentenablage (data/dokumente) mitsichern: neue Dateien kopieren, gelöschte entfernen
    import shutil
    quelle = os.path.join(db.DATA_DIR, "dokumente")
    if os.path.isdir(quelle):
        ziel_dok = os.path.join(args.ziel, "dokumente")
        os.makedirs(ziel_dok, exist_ok=True)
        vorhanden = set(os.listdir(quelle))
        kopiert = 0
        for name in vorhanden:
            z = os.path.join(ziel_dok, name)
            if not os.path.exists(z):
                shutil.copy2(os.path.join(quelle, name), z)
                kopiert += 1
        for name in os.listdir(ziel_dok):
            if name not in vorhanden:
                os.remove(os.path.join(ziel_dok, name))
        print(f"Dokumente: {len(vorhanden)} Dateien gesichert ({kopiert} neu).")
    # alte Sicherungen ausdünnen (die letzten 30 behalten)
    backups = sorted(
        f for f in os.listdir(args.ziel) if f.startswith("volleyball_") and f.endswith(".db")
    )
    for old in backups[:-30]:
        os.remove(os.path.join(args.ziel, old))


def cmd_ferien_sync(_args) -> None:
    """Schulferien DE-MV von OpenHolidays holen und in den Datenbestand schreiben."""
    import ferien

    print(ferien.sync())


def cmd_tabelle_sync(args) -> None:
    """Offizielle VMV-Ligatabelle (vmv24.de) in den Datenbestand übernehmen."""
    import tabelle

    print(tabelle.sync(args.liga or None))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("create-trainer", help="Trainerkonto anlegen")
    s.add_argument("--username", required=True)
    s.add_argument("--name", default="")
    s.add_argument("--password", default="", help="nur für Skripte; sonst interaktive Abfrage")
    s.set_defaults(func=cmd_create_trainer)

    s = sub.add_parser("test-konten", help="Testkonten (Trainer, Spieler:in, Eltern) anlegen bzw. Passwörter neu setzen")
    s.add_argument("--passwort", help="festes Passwort für alle drei Konten (sonst zufällig, wird ausgegeben)")
    s.add_argument("--reset-2fa", action="store_true", help="2FA des Test-Trainers zurücksetzen")
    s.set_defaults(func=cmd_test_konten)

    s = sub.add_parser("create-invite", help="Einladungscode erzeugen")
    s.add_argument("--role", choices=["trainer", "spieler", "eltern"], required=True)
    s.add_argument("--name", default="")
    s.set_defaults(func=cmd_create_invite)

    s = sub.add_parser("reset-2fa", help="2FA eines Kontos zurücksetzen (Notfall)")
    s.add_argument("username")
    s.set_defaults(func=cmd_reset_2fa)

    s = sub.add_parser("reset-password", help="Passwort eines Kontos neu setzen")
    s.add_argument("username")
    s.add_argument("--password", default="")
    s.set_defaults(func=cmd_reset_password)

    s = sub.add_parser("email-import", help="E-Mail-Adressen der Konten aus den Spielerdaten übernehmen")
    s.set_defaults(func=cmd_email_import)

    s = sub.add_parser("list-users", help="Konten anzeigen")
    s.set_defaults(func=cmd_list_users)

    s = sub.add_parser("backup", help="Datenbank-Sicherung schreiben")
    s.add_argument("ziel")
    s.set_defaults(func=cmd_backup)

    s = sub.add_parser("ferien-sync", help="Schulferien MV serverseitig abgleichen")
    s.set_defaults(func=cmd_ferien_sync)

    s = sub.add_parser("aufgaben-erinnern", help="Fällige Portal-Aufgaben per Push erinnern")
    s.set_defaults(func=lambda _a: print(__import__("erinnerung").lauf()))

    s = sub.add_parser("trainings-erinnern", help="06:30-Erinnerung an heutige Trainings (Push/E-Mail)")
    s.set_defaults(func=lambda _a: print(__import__("trainingserinnerung").lauf()))

    s = sub.add_parser("mail-test", help="Test-E-Mail verschicken (SMTP-Konfiguration prüfen)")
    s.add_argument("adresse")
    s.set_defaults(func=lambda a: print("gesendet ✓" if __import__("mail").senden(
        a.adresse, "SKV Müritz Volleyball – Test",
        "Test-E-Mail vom SKV-Müritz-Server. Wenn du das liest, funktioniert der Versand.")
        else "NICHT gesendet – SMTP nicht konfiguriert oder Fehler (Logs prüfen)."))

    s = sub.add_parser("rueckmelde-warnung", help="Trainerteam warnen, wenn <24 h vor Terminen zu wenige Rückmeldungen da sind")
    s.set_defaults(func=lambda _a: print(__import__("rueckmeldung").lauf()))

    s = sub.add_parser("tabelle-sync", help="VMV-Ligatabelle (vmv24.de) abgleichen")
    s.add_argument("--liga", default="", help="Liga-Slug, z. B. VerbandsligaMänner (Standard aus VV_TABELLE_LIGA)")
    s.set_defaults(func=cmd_tabelle_sync)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
