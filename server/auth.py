"""SKV Müritz Volleyball – Authentifizierungs-Bausteine.

- Passwort-Hashing: Argon2id (argon2-cffi, im Docker-Image installiert);
  Fallback auf scrypt aus der Standardbibliothek, falls argon2 fehlt.
  Das Hash-Format trägt ein Präfix, beide Formate werden geprüft.
- TOTP (RFC 6238, SHA-1, 30 s, 6 Stellen) in reiner Standardbibliothek.
- Einladungs-/Backup-Codes und Session-Token.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time

try:  # Argon2id bevorzugt (auf dem Server via requirements installiert)
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError

    _ph = PasswordHasher()  # argon2id, sinnvolle Defaults
except Exception:  # pragma: no cover - Fallback-Umgebungen ohne C-Build
    _ph = None

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**15, 8, 1


# ---------- Passwörter ----------

def hash_password(password: str) -> str:
    if _ph is not None:
        return "argon2$" + _ph.hash(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
        dklen=32, maxmem=64 * 1024 * 1024,
    )
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        if stored.startswith("argon2$"):
            if _ph is None:
                return False
            try:
                _ph.verify(stored[len("argon2$"):], password)
                return True
            except VerifyMismatchError:
                return False
        if stored.startswith("scrypt$"):
            _, salt_b64, digest_b64 = stored.split("$", 2)
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(digest_b64)
            actual = hashlib.scrypt(
                password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
                dklen=32, maxmem=64 * 1024 * 1024,
            )
            return hmac.compare_digest(expected, actual)
    except Exception:
        return False
    return False


# ---------- TOTP (RFC 6238) ----------

def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret_b32: str, counter: int, digits: int = 6) -> str:
    padding = "=" * (-len(secret_b32) % 8)
    key = base64.b32decode(secret_b32 + padding, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def totp_now(secret_b32: str, at: int | None = None, digits: int = 6, period: int = 30) -> str:
    t = int(time.time()) if at is None else at
    return _hotp(secret_b32, t // period, digits)


def verify_totp(secret_b32: str, code: str, window: int = 1) -> bool:
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit():
        return False
    t = int(time.time()) // 30
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret_b32, t + offset), code):
            return True
    return False


def otpauth_url(secret_b32: str, username: str, issuer: str = "SKV Müritz Volleyball") -> str:
    from urllib.parse import quote

    label = quote(f"{issuer}:{username}")
    return f"otpauth://totp/{label}?secret={secret_b32}&issuer={quote(issuer)}&digits=6&period=30"


# ---------- Codes & Token ----------

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne 0/O/1/I


def new_code(groups: int = 3, group_len: int = 4) -> str:
    parts = [
        "".join(secrets.choice(_CODE_ALPHABET) for _ in range(group_len))
        for _ in range(groups)
    ]
    return "-".join(parts)


def new_backup_codes(n: int = 8) -> list[str]:
    return [new_code(groups=2, group_len=5) for _ in range(n)]


def hash_code(code: str) -> str:
    normalized = (code or "").strip().upper().replace(" ", "")
    return hashlib.sha256(normalized.encode()).hexdigest()


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_csrf() -> str:
    return secrets.token_urlsafe(24)


def hmac_compare(a: str, b: str) -> bool:
    """Konstantzeit-Vergleich zweier Strings (z. B. CSRF-Token)."""
    return hmac.compare_digest((a or "").encode(), (b or "").encode())
