"""„Dein Jahr mit Volleyball" – Saisonrückblick als Urkunde (PDF) für die Spieler:in.

Nur für das eigene Spielerkonto: A4-Urkunde mit Rahmen in Vereinsfarben,
Vereinslogo, rundem Profilbild, Kennzahlen der Saison (Trainings, Spiele,
Rückmeldungen, Quiz), Abzeichen, Tabellenplatz, gesammeltem Rückenwind und
Unterschriftszeile. Saison = 1. Juli bis 30. Juni (wie in der Trainer-App).
"""
from __future__ import annotations

import base64
import datetime as dt
import io
import os
import re
from zoneinfo import ZoneInfo

from flask import request
from fpdf import FPDF

import db

BERLIN = ZoneInfo("Europe/Berlin")
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOGO = os.path.join(APP_ROOT, "assets", "icons", "icon-512.png")

ORANGE = (242, 106, 53)
GRUEN = (119, 170, 64)
BLAU = (30, 58, 138)
DUNKEL = (24, 32, 52)
GRAU = (110, 118, 135)
HELL = (247, 248, 251)
CREME = (255, 252, 246)
GOLD = (166, 126, 58)
GOLD_HELL = (214, 188, 134)
BRAUN = (92, 66, 34)

_LOGO_FREI = None


def _logo_frei():
    """Vereinslogo ohne dunkelblauen Hintergrund (freigestellt, mit weichen Kanten)."""
    global _LOGO_FREI
    if _LOGO_FREI is not None:
        return _LOGO_FREI or None
    try:
        from PIL import Image
        img = Image.open(LOGO).convert("RGB")
        blau, orange = (22, 37, 92), (241, 102, 42)
        px = img.load()
        out = Image.new("RGBA", img.size, (0, 0, 0, 0))
        po = out.load()
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                r, g, b = px[x, y]
                # Anteil Orange im Pixel (Entmischung der zwei Farben) = Deckkraft
                a = ((r - blau[0]) / (orange[0] - blau[0]) + (blau[2] - b) / (blau[2] - orange[2])) / 2
                a = max(0.0, min(1.0, a))
                if a > 0.02:
                    po[x, y] = (orange[0], orange[1], orange[2], int(round(a * 255)))
        _LOGO_FREI = out
    except Exception:  # noqa: BLE001
        _LOGO_FREI = False
    return _LOGO_FREI or None

# Zeichen außerhalb der Grundebene (Emojis) hat DejaVu nicht
_EMOJI = re.compile("[\U0001F000-\U0001FAFF\U0001F1E6-\U0001F1FF☀-➿️‍]")


def _t(s) -> str:
    return _EMOJI.sub("", str(s or "")).strip()


def saison_grenzen(jetzt: dt.datetime, vorige: bool = False):
    lokal = jetzt.astimezone(BERLIN)
    jahr = lokal.year - (1 if lokal.month < 7 else 0)
    if vorige:
        jahr -= 1
    start = dt.datetime(jahr, 7, 1, tzinfo=BERLIN)
    ende = min(dt.datetime(jahr + 1, 7, 1, tzinfo=BERLIN), jetzt)
    return jahr, start, ende


def zahlen(daten, pid, start, ende) -> dict:
    events = [e for e in daten.get("events", [])
              if e.get("type") in ("training", "home", "away") and not e.get("abgesagt")
              and (z := db.parse_iso(e.get("start"))) is not None and start <= z < ende]
    antworten = {r.get("eventId"): r.get("status") for r in daten.get("responses", []) if r.get("playerId") == pid}

    def block(evs):
        rel = [e for e in evs if antworten.get(e.get("id")) != "x"]
        ja = sum(1 for e in rel if antworten.get(e.get("id")) == "yes")
        beantwortet = sum(1 for e in rel if antworten.get(e.get("id")))
        return {"gesamt": len(rel), "dabei": ja, "beantwortet": beantwortet,
                "quote": round(ja / len(rel) * 100) if rel else None,
                "rmquote": round(beantwortet / len(rel) * 100) if rel else None}
    return {"training": block([e for e in events if e.get("type") == "training"]),
            "spiele": block([e for e in events if e.get("type") in ("home", "away")]),
            "alle": block(events)}


def abzeichen(daten, pid, start, ende) -> list:
    z = zahlen(daten, pid, start, ende)
    out = []
    for d in daten.get("abzeichenDefs", []):
        bereich = {"training": z["training"], "spiel": z["spiele"]}.get(d.get("bereich") or "alle", z["alle"])
        if bereich["gesamt"] < 3:
            continue
        quote = bereich["quote"] if d.get("typ") == "teilnahme" else bereich["rmquote"]
        if quote is not None and quote >= (d.get("schwelle") or 0):
            out.append({"name": _t(d.get("name")), "wert": quote})
    return out


ELTERN_STUFEN = {
    "jobs": [(1, "Erste Hilfe"), (3, "Helferherz Bronze"), (6, "Helferherz Silber"), (10, "Helferherz Gold")],
    "fahrten": [(1, "Mitfahr-Taxi"), (3, "Tour-Guide"), (6, "Reiseleitung")],
    "gesamt": [(5, "Vereinsstütze"), (12, "MVP der Eltern")],
}


def eltern_abzeichen(daten, con, pid, start, ende) -> list:
    """Höchste Helfer-Abzeichen der Elternkonten dieses Kindes (nur erreichte)."""
    import json as _json
    vorbei = {e.get("id") for e in daten.get("events", [])
              if (z := db.parse_iso(e.get("start"))) is not None and start <= z < ende and not e.get("abgesagt")}
    out = []
    for r in con.execute("SELECT id, name, player_ids FROM users WHERE active = 1 AND role = 'eltern'").fetchall():
        try:
            if pid not in set(_json.loads(r["player_ids"] or "[]")):
                continue
        except Exception:
            continue
        jobs = sum(1 for j in daten.get("jobs", []) if j.get("userId") == r["id"] and (j.get("done") or j.get("eventId") in vorbei))
        fahrten = sum(1 for d_ in daten.get("drivers", []) if d_.get("userId") == r["id"] and int(d_.get("seats") or 0) > 0 and d_.get("eventId") in vorbei)
        werte = {"jobs": jobs, "fahrten": fahrten, "gesamt": jobs + fahrten}
        vorname = (r["name"] or "").split(" ")[0]
        for art, stufen in ELTERN_STUFEN.items():
            erreicht = [n for ziel, n in stufen if werte[art] >= ziel]
            if erreicht:
                out.append(f"{erreicht[-1]} ({vorname})")
    return out


def quiz_rang(con, user_id):
    """(Punkte, Platz im Verein) – Platz nur, wenn Punkte > 0."""
    rows = con.execute("SELECT q.user_id, q.punkte FROM quiz_stand q JOIN users u ON u.id = q.user_id"
                       " WHERE u.active = 1 AND u.role = 'spieler' ORDER BY q.punkte DESC").fetchall()
    punkte = next((int(r["punkte"] or 0) for r in rows if r["user_id"] == user_id), 0)
    if punkte <= 0:
        return 0, None
    platz = 1 + sum(1 for r in rows if int(r["punkte"] or 0) > punkte)
    return punkte, platz


def _volleyball(jahr: int, px: int = 600):
    """Stilisierter Volleyball (PIL) mit der Saison darauf – Ersatz für ein fehlendes Profilbild."""
    try:
        import math
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((4, 4, px - 5, px - 5), fill=(255, 255, 255, 255))
        # Drei klassische Nähte: Bögen von Kreisen außerhalb des Balls, zur Mitte hin gewölbt,
        # auf eine eigene Ebene gezeichnet und mit der Ballform maskiert
        ebene = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        dz = ImageDraw.Draw(ebene)
        c = px / 2
        R, abstand, w = px * 0.62, px * 0.80, 11
        for winkel, farbe in ((30, ORANGE), (150, BLAU), (270, ORANGE)):
            kx = c + abstand * math.cos(math.radians(winkel))
            ky = c + abstand * math.sin(math.radians(winkel))
            start = (winkel + 180 - 62) % 360
            dz.arc((kx - R, ky - R, kx + R, ky + R), start, start + 124, fill=farbe + (255,), width=w)
        maske = Image.new("L", (px, px), 0)
        ImageDraw.Draw(maske).ellipse((14, 14, px - 15, px - 15), fill=255)
        img.paste(ebene, (0, 0), Image.composite(ebene.split()[3], Image.new("L", (px, px), 0), maske))
        d.ellipse((4, 4, px - 5, px - 5), outline=ORANGE + (255,), width=10)
        text = f"{jahr}/{str(jahr + 1)[2:]}"
        try:
            font = ImageFont.truetype(os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"), int(px * 0.16))
        except Exception:
            font = ImageFont.load_default()
        box = d.textbbox((0, 0), text, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        d.rounded_rectangle((c - tw / 2 - 18, c - th / 2 - 12, c + tw / 2 + 18, c + th / 2 + 14),
                            radius=22, fill=(255, 255, 255, 240), outline=BLAU + (255,), width=4)
        d.text((c - tw / 2 - box[0], c - th / 2 - box[1]), text, font=font, fill=BLAU + (255,))
        return img
    except Exception:  # noqa: BLE001
        return None


def _foto_rund(data_url: str, px: int = 600):
    """Base64-Foto → rundes RGBA-Bild (PIL) oder None."""
    try:
        from PIL import Image, ImageDraw, ImageOps
        m = re.match(r"^data:image/[a-z]+;base64,(.*)$", data_url or "", re.S)
        if not m:
            return None
        img = Image.open(io.BytesIO(base64.b64decode(m.group(1))))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img = ImageOps.fit(img, (px, px), centering=(0.5, 0.4))
        maske = Image.new("L", (px, px), 0)
        ImageDraw.Draw(maske).ellipse((0, 0, px - 1, px - 1), fill=255)
        rund = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        rund.paste(img, (0, 0), maske)
        return rund
    except Exception:  # noqa: BLE001
        return None


class _Urkunde(FPDF):
    def __init__(self):
        super().__init__(format="A4")
        self.set_auto_page_break(False)
        self.set_margins(0, 0, 0)
        self.add_font("Sans", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
        self.add_font("Sans", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
        self.add_font("Serif", "", os.path.join(FONT_DIR, "DejaVuSerif.ttf"))
        self.add_font("Serif", "B", os.path.join(FONT_DIR, "DejaVuSerif-Bold.ttf"))

    def zierlinie(self, y, breite=90):
        """Trennlinie mit Rautenornament in der Mitte (klassische Urkunde)."""
        cx = 105
        self.set_draw_color(*GOLD); self.set_line_width(0.4)
        self.line(cx - breite / 2, y, cx - 5, y)
        self.line(cx + 5, y, cx + breite / 2, y)
        self.set_fill_color(*GOLD)
        self.star(cx, y, 0.7, 2.2, 4, 0, "F")
        self.set_fill_color(*GOLD_HELL)
        self.ellipse(cx - 9, y - 0.6, 1.2, 1.2, "F"); self.ellipse(cx + 7.8, y - 0.6, 1.2, 1.2, "F")

    def text_zentriert(self, y, text, font, groesse, farbe, zeichenabstand=0.0):
        self.set_font(*font, groesse)
        self.set_text_color(*farbe)
        if zeichenabstand:
            self.set_char_spacing(zeichenabstand)
        self.set_xy(14, y)
        self.cell(182, groesse * 0.45, text, align="C")
        if zeichenabstand:
            self.set_char_spacing(0)


def urkunde(daten, con, user_id, spieler, start, ende, jahr) -> bytes:
    pid = spieler["id"]
    name = f"{spieler.get('firstName', '')} {spieler.get('lastName', '')}".strip()
    z = zahlen(daten, pid, start, ende)
    abz = abzeichen(daten, pid, start, ende)
    punkte, qplatz = quiz_rang(con, user_id)
    eltern_abz = eltern_abzeichen(daten, con, pid, start, ende)
    rw = [x for x in daten.get("rueckenwind", []) if isinstance(x, dict) and x.get("playerId") == pid
          and x.get("status") == "neu" and start.strftime("%Y-%m-%d") <= str(x.get("at") or "")[:10]]
    rw.sort(key=lambda x: str(x.get("at") or ""))
    rows = sorted(daten.get("standings", []), key=lambda r: (-(r.get("points") or 0), -((r.get("setsW") or 0) - (r.get("setsL") or 0))))
    wir = [(i + 1, r) for i, r in enumerate(rows) if re.search(r"skv|müritz|mueritz", str(r.get("team") or ""), re.I)]
    abt = {d.get("id"): d.get("name") for d in daten.get("departments", [])}
    ids = spieler.get("departmentIds") or ([spieler.get("departmentId")] if spieler.get("departmentId") else [])
    mannschaft = ", ".join(n for n in (abt.get(i) for i in ids) if n)
    saison_txt = f"Saison {jahr}/{str(jahr + 1)[2:]}"

    pdf = _Urkunde()
    pdf.add_page()
    W, H = 210, 297
    # Pergament-Hintergrund, klassischer Urkundenrahmen in Altgold
    pdf.set_fill_color(*CREME)
    pdf.rect(0, 0, W, H, "F")
    pdf.set_draw_color(*GOLD); pdf.set_line_width(1.8); pdf.rect(8, 8, W - 16, H - 16)
    pdf.set_line_width(0.35); pdf.rect(11.2, 11.2, W - 22.4, H - 22.4)
    pdf.set_draw_color(*GOLD_HELL); pdf.set_line_width(0.6); pdf.rect(13, 13, W - 26, H - 26)
    pdf.set_draw_color(*GOLD); pdf.set_line_width(0.35); pdf.rect(14.6, 14.6, W - 29.2, H - 29.2)
    # Eckrosetten mit Perlenreihen entlang der Kanten
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        ex = 8 if sx > 0 else W - 8
        ey = 8 if sy > 0 else H - 8
        pdf.set_fill_color(*GOLD_HELL)
        for k, rp in ((9, 1.3), (14, 1.0), (18, 0.7)):
            pdf.ellipse(ex + sx * k - rp, ey - rp, 2 * rp, 2 * rp, "F")
            pdf.ellipse(ex - rp, ey + sy * k - rp, 2 * rp, 2 * rp, "F")
        pdf.set_draw_color(*GOLD); pdf.set_line_width(0.6)
        pdf.set_fill_color(*CREME); pdf.ellipse(ex - 6.5, ey - 6.5, 13, 13, "FD")
        pdf.set_fill_color(*GOLD); pdf.star(ex, ey, 1.4, 3.8, 8, 0, "F")
        pdf.set_fill_color(*ORANGE); pdf.ellipse(ex - 1.2, ey - 1.2, 2.4, 2.4, "F")
    # Zierstücke an den Seitenmitten
    pdf.set_fill_color(*GOLD)
    for x, y in ((W / 2, 8), (W / 2, H - 8), (8, H / 2), (W - 8, H / 2)):
        pdf.set_fill_color(*CREME); pdf.ellipse(x - 3, y - 3, 6, 6, "F")
        pdf.set_fill_color(*GOLD); pdf.star(x, y, 0.9, 2.6, 4, 0, "F")
    # Logo (freigestellt) + Vereinsname
    logo = _logo_frei()
    if logo is not None:
        pdf.image(logo, x=W / 2 - 13, y=19, w=26)
    elif os.path.exists(LOGO):
        pdf.image(LOGO, x=W / 2 - 11, y=20, w=22)
    pdf.text_zentriert(48, "SKV MÜRITZ · ABTEILUNG VOLLEYBALL", ("Sans", "B"), 10.5, GRAU, 1.4)
    pdf.text_zentriert(55, "URKUNDE", ("Serif", "B"), 40, BLAU, 3.4)
    pdf.text_zentriert(73, "Dein Jahr mit Volleyball", ("Serif", ""), 20, DUNKEL)
    pdf.text_zentriert(83, saison_txt, ("Sans", ""), 12, GRAU)
    # Profilbild (rund) mit Goldring, sonst Volleyball mit Saison
    cx, cy, r = W / 2, 110, 21
    pdf.set_fill_color(*GOLD); pdf.ellipse(cx - r - 1.8, cy - r - 1.8, 2 * r + 3.6, 2 * r + 3.6, "F")
    pdf.set_fill_color(255, 255, 255); pdf.ellipse(cx - r - 0.7, cy - r - 0.7, 2 * r + 1.4, 2 * r + 1.4, "F")
    bild = _foto_rund(spieler.get("foto") or "")
    if bild is not None:
        pdf.image(bild, x=cx - r, y=cy - r, w=2 * r, h=2 * r)
    else:
        ball = _volleyball(jahr)
        if ball is not None:
            pdf.image(ball, x=cx - r, y=cy - r, w=2 * r, h=2 * r)
        else:
            pdf.set_fill_color(*BLAU); pdf.ellipse(cx - r, cy - r, 2 * r, 2 * r, "F")
    pdf.text_zentriert(137, "verliehen an", ("Sans", ""), 11, GRAU)
    pdf.text_zentriert(144, _t(name), ("Serif", "B"), 30, DUNKEL)
    if mannschaft:
        pdf.text_zentriert(158, _t(mannschaft), ("Sans", ""), 12.5, BLAU)
    y = 167
    pdf.zierlinie(y)
    # Kennzahlen als Medaillons
    tr, sp, alle = z["training"], z["spiele"], z["alle"]
    QUIZ_MEDAILLE = {1: "Gold im Vereinsquiz", 2: "Silber im Vereinsquiz", 3: "Bronze im Vereinsquiz"}
    med = [(str(tr["dabei"]), "Trainings", "dabei gewesen"),
           (str(sp["dabei"]), "Spiele", "dabei gewesen"),
           (str(alle["beantwortet"]), "Rückmeldungen", "abgegeben"),
           (str(punkte), "Quizpunkte", QUIZ_MEDAILLE.get(qplatz, "Volleyball-Wissen") if punkte else "Volleyball-Wissen")]
    # Tabellenplatz nur, wenn er sich sehen lassen kann (obere Hälfte)
    platz_txt = ""
    if wir:
        platz, r_ = wir[0]
        if platz <= max(1, (len(rows) + 1) // 2):
            platz_txt = f"{_t(r_.get('team') or '')}: Platz {platz} von {len(rows)} in der Liga"
    # nur Positives: Medaillons mit 0 entfallen, der Rest wird mittig gesetzt
    med = [m for m in med if m[0] not in ("0", "")]
    bw, gap = 42, 6
    x0 = (W - (len(med) * bw + max(0, len(med) - 1) * gap)) / 2
    y = 172
    for i, (zahl, label, sub) in enumerate(med):
        x = x0 + i * (bw + gap)
        pdf.set_fill_color(*HELL); pdf.set_draw_color(*GOLD_HELL); pdf.set_line_width(0.5)
        pdf.rect(x, y, bw, 28, "FD", round_corners=True, corner_radius=3)
        pdf.set_font("Serif", "B", 20); pdf.set_text_color(*ORANGE)
        pdf.set_xy(x, y + 3); pdf.cell(bw, 10, zahl, align="C")
        pdf.set_font("Sans", "B", 9.5); pdf.set_text_color(*DUNKEL)
        pdf.set_xy(x, y + 14); pdf.cell(bw, 5, label, align="C")
        pdf.set_font("Sans", "", 8.5); pdf.set_text_color(*GRAU)
        pdf.set_xy(x, y + 19.5); pdf.cell(bw, 5, sub, align="C")
    y = 205
    if platz_txt:
        pdf.text_zentriert(y, platz_txt, ("Sans", "B"), 11, BLAU)
        y += 7.5
    # Abzeichen: Spieler:in, Quiz, Familie – nur erreichte
    namen = [a["name"] for a in abz]
    if punkte and qplatz in QUIZ_MEDAILLE:
        namen.append(QUIZ_MEDAILLE[qplatz])
    if namen or eltern_abz:
        y += 2
        pdf.text_zentriert(y, "ABZEICHEN", ("Sans", "B"), 10.5, GOLD, 1.8)
        y += 8
        if namen:
            pdf.set_font("Sans", "", 11.5); pdf.set_text_color(*DUNKEL)
            pdf.set_xy(20, y); pdf.multi_cell(W - 40, 6, "★   " + "   ★   ".join(namen[:7]), align="C")
            y = pdf.get_y() + 1.5
        if eltern_abz:
            pdf.set_font("Sans", "", 10.5); pdf.set_text_color(*GRUEN)
            pdf.set_xy(20, y); pdf.multi_cell(W - 40, 5.6, "Deine Familie hat mit angepackt:  " + "  ·  ".join(eltern_abz[:4]), align="C")
            y = pdf.get_y() + 1.5
    # Rückenwind (nur wenn vorhanden)
    if rw:
        y = max(y + 3, 214)
        pdf.text_zentriert(y, "RÜCKENWIND", ("Sans", "B"), 10.5, GOLD, 1.8)
        y += 8
    if rw:
        for x in rw[-5:]:
            teile = [_t(k) for k in (x.get("kacheln") or []) if _t(k)]
            if _t(x.get("text")):
                teile.append("„" + _t(x.get("text")) + "“")
            if not teile:
                continue
            pdf.set_xy(26, y)
            pdf.set_font("Serif", "", 11); pdf.set_text_color(*DUNKEL)
            pdf.multi_cell(W - 52, 5.4, " · ".join(teile) + f"   — {_t(x.get('vonName')) or 'Familie'}", align="C")
            y = pdf.get_y() + 1.5
            if y > 256:
                break
    # Schlusssatz + Unterschrift
    pdf.zierlinie(261.5)
    pdf.text_zentriert(265, "Danke für deinen Einsatz – jedes Training, jede Zusage und jede faire Aktion zählt.", ("Serif", ""), 10.5, DUNKEL)
    datum = ende.astimezone(BERLIN).strftime("%d.%m.%Y")
    pdf.set_font("Sans", "", 9.5); pdf.set_text_color(*GRAU)
    pdf.set_xy(28, 276); pdf.cell(64, 5, f"Waren (Müritz), {datum}", align="C")
    pdf.set_draw_color(*BRAUN); pdf.set_line_width(0.3); pdf.line(122, 280, 182, 280)
    pdf.set_xy(117, 280.5); pdf.cell(70, 5, "Trainerteam SKV Müritz Volleyball", align="C")
    return bytes(pdf.output())


def register(app, con, require_portal, err, h):
    @app.get("/api/portal/dein-jahr.pdf")
    def api_dein_jahr():
        sess, failure = require_portal()
        if failure:
            return failure
        if sess["role"] != "spieler":
            return err(403, "Der Saisonrückblick ist für das eigene Spielerkonto")
        _v, daten = h["lade_state"]()
        pids = h["sess_player_ids"](sess)
        spieler = next((p for p in daten.get("players", []) if p.get("id") in pids), None)
        if spieler is None:
            return err(404, "Keine Spieler:in mit deinem Konto verknüpft")
        jetzt = dt.datetime.now(dt.timezone.utc)
        jahr, start, ende = saison_grenzen(jetzt, vorige=request.args.get("saison") == "vorige")
        try:
            pdf = urkunde(daten, con(), sess["user_id"], spieler, start, ende, jahr)
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Dein-Jahr-PDF fehlgeschlagen: %s", e)
            return err(500, "PDF konnte nicht erzeugt werden")
        resp = app.response_class(pdf, mimetype="application/pdf")
        name = f"Urkunde-Dein-Jahr-{jahr}-{str(spieler.get('firstName') or 'Spieler')}".encode("ascii", "ignore").decode()
        resp.headers["Content-Disposition"] = f'inline; filename="{name}.pdf"'
        return resp
