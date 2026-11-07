"""E-Mail-Versand für die SKV-Müritz-App (eigenes Postfach, getrennt von den
anderen Server-Apps).

Konfiguration ausschließlich über Umgebungsvariablen (.env auf dem Server):

    MAIL_HOST      SMTP-Server (z. B. smtp.example.de)
    MAIL_PORT      Port (Standard 587 für STARTTLS, 465 für SSL)
    MAIL_USER      Postfach-Benutzer
    MAIL_PASS      Postfach-Passwort
    MAIL_FROM      Absenderadresse (z. B. "SKV Müritz Volleyball <skv.volleyball@nettverwaltet.de>")
    MAIL_SECURITY  "starttls" (Standard), "ssl" oder "none"
    MAIL_REPLY_TO  optional: Antworten gehen an diese Adresse (z. B. das Trainerteam).
                   Fehlt sie, steht in jeder Mail, dass Antworten nicht gelesen werden.

Ist MAIL_HOST/USER/PASS nicht gesetzt, macht ``senden`` nichts (No-Op mit
Log-Hinweis) – die App läuft unverändert weiter, es gehen nur keine Mails raus.
Der Verein stellt ein eigenes SMTP-Postfach + SPF/DKIM/DMARC beim Hoster bereit.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

log = logging.getLogger("skv.mail")


def _cfg() -> dict:
    return {
        "host": os.environ.get("MAIL_HOST", "").strip(),
        "port": int(os.environ.get("MAIL_PORT", "587") or "587"),
        "user": os.environ.get("MAIL_USER", "").strip(),
        "pass": os.environ.get("MAIL_PASS", ""),
        "from": os.environ.get("MAIL_FROM", "").strip()
                 or os.environ.get("MAIL_USER", "").strip(),
        "security": os.environ.get("MAIL_SECURITY", "starttls").strip().lower(),
        "reply_to": os.environ.get("MAIL_REPLY_TO", "").strip(),
    }


def fusszeile() -> str:
    """Hinweis unter jeder Mail: wohin Antworten gehen (oder dass keine gelesen werden)."""
    c = _cfg()
    if c["reply_to"]:
        return ("\n\n--\nSKV Müritz Volleyball · automatische Nachricht aus der Vereins-App."
                f"\nAntworten gehen an das Trainerteam ({c['reply_to']}).")
    return ("\n\n--\nSKV Müritz Volleyball · automatische Nachricht aus der Vereins-App."
            "\nBitte nicht auf diese E-Mail antworten – das Postfach wird nicht gelesen.")


def konfiguriert() -> bool:
    """True, wenn ein SMTP-Postfach hinterlegt ist."""
    c = _cfg()
    return bool(c["host"] and c["user"] and c["pass"])


def senden(empfaenger: str, betreff: str, text: str) -> bool:
    """Eine einfache Text-Mail verschicken. Rückgabe: True bei Erfolg.

    Ohne Konfiguration oder bei Fehler wird False zurückgegeben (kein Absturz).
    """
    empfaenger = (empfaenger or "").strip()
    if not empfaenger:
        return False
    if not konfiguriert():
        log.info("Mail nicht verschickt (kein SMTP konfiguriert): an=%s betreff=%s",
                 empfaenger, betreff)
        return False
    c = _cfg()
    msg = EmailMessage()
    msg["From"] = c["from"]
    msg["To"] = empfaenger
    msg["Subject"] = betreff
    if c["reply_to"]:
        msg["Reply-To"] = c["reply_to"]
    msg["Auto-Submitted"] = "auto-generated"  # Autoresponder sollen nicht zurückschreiben
    msg.set_content(text.rstrip() + fusszeile())
    try:
        if c["security"] == "ssl":
            with smtplib.SMTP_SSL(c["host"], c["port"], context=ssl.create_default_context(),
                                  timeout=20) as s:
                s.login(c["user"], c["pass"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(c["host"], c["port"], timeout=20) as s:
                if c["security"] != "none":
                    s.starttls(context=ssl.create_default_context())
                s.login(c["user"], c["pass"])
                s.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001 – ein Mailfehler darf nie die App stoppen
        log.warning("Mailversand fehlgeschlagen (an=%s): %s", empfaenger, e)
        return False
