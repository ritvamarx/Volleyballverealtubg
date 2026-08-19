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
    con = db.connect()
    rows = con.execute(
        "SELECT username, name, role, totp_enabled, active, created_at FROM users ORDER BY role, username"
    ).fetchall()
    for r in rows:
        ts = time.strftime("%d.%m.%Y", time.localtime(r["created_at"]))
        print(f"{r['role']:<8} {r['username']:<20} {r['name']:<24} "
              f"2FA={'ja' if r['totp_enabled'] else 'nein'} aktiv={'ja' if r['active'] else 'nein'} seit {ts}")


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
    # alte Sicherungen ausdünnen (die letzten 30 behalten)
    backups = sorted(
        f for f in os.listdir(args.ziel) if f.startswith("volleyball_") and f.endswith(".db")
    )
    for old in backups[:-30]:
        os.remove(os.path.join(args.ziel, old))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("create-trainer", help="Trainerkonto anlegen")
    s.add_argument("--username", required=True)
    s.add_argument("--name", default="")
    s.add_argument("--password", default="", help="nur für Skripte; sonst interaktive Abfrage")
    s.set_defaults(func=cmd_create_trainer)

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

    s = sub.add_parser("list-users", help="Konten anzeigen")
    s.set_defaults(func=cmd_list_users)

    s = sub.add_parser("backup", help="Datenbank-Sicherung schreiben")
    s.add_argument("ziel")
    s.set_defaults(func=cmd_backup)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
