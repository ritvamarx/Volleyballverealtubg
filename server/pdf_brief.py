"""PDF-Erzeugung für Elternbriefe (Serienbrief: eine Datei pro Spieler:in).

Der Browser schickt eine einfache Blockliste (kein HTML) – hier wird daraus
ein A4-PDF mit DejaVu Sans (Unicode: Umlaute, ☐, Gedankenstriche) gesetzt.

Blockformat: {"art": ..., "runs": [{"t": "Text", "b": true|false}, ...]}
  h1     große blaue Überschrift          h2     Abschnittsüberschrift
  sub    graue Unterzeile                 p      Absatz
  li     Aufzählungspunkt                 leer   Abstand
  linie  Unterschriftslinie mit Beschriftung (runs = Beschriftung)
  seite  Seitenumbruch
  code   großer, zentrierter Code im Rahmen (z. B. Einladungscode)
  qr     zentrierter QR-Code (runs[0].t = Inhalt, z. B. Registrierungslink)
  h1c    große zentrierte Überschrift (Pinnwand-Stil)
  subc   graue Unterzeile, zentriert
  trenn  dünne blaue Trennlinie über die volle Breite
  h2box  Abschnittstitel auf hellblauem Balken
  kasten umrahmter Hinweiskasten (runs wie p)
  schnitt gestrichelte Abschneidelinie („hier abschneiden")
  sec    umrahmte Erklärungs-Sektion: {titel, text, ankreuz: true|false}
"""
from __future__ import annotations

import os
import re

from fpdf import FPDF

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
BLAU = (30, 58, 138)
GRAU = (102, 102, 102)
SCHWARZ = (17, 17, 17)

# Zeichen außerhalb der Grundebene (Emojis u. Ä.) hat DejaVu nicht – entfernen.
_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U0001F1E6-\U0001F1FF✀-➿☀-⛿️‍]"
)


def _sauber(text: str) -> str:
    return _EMOJI.sub("", str(text or "")).strip(" ")


class _BriefPDF(FPDF):
    """A4-Brief mit optionaler Fußzeile (Name · Seite X von Y)."""

    fusszeile = ""

    def footer(self):
        if not self.fusszeile_aktiv():
            return
        self.set_y(-14)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(148, 163, 184)
        text = (self.fusszeile + " · " if self.fusszeile else "") + f"Seite {self.page_no()} von {{nb}}"
        self.cell(0, 5, text, align="C")

    def fusszeile_aktiv(self) -> bool:
        return bool(getattr(self, "_fuss_an", False))


def erzeuge_pdf(blocks: list, fusszeile: str = "") -> bytes:
    """Erzeugt das PDF; bei mehr als einer Seite bekommt jede Seite eine
    Fußzeile (Spielername · Seite X von Y). Dafür läuft die Setzung bei
    Bedarf ein zweites Mal – der erste Lauf ermittelt nur die Seitenzahl."""
    pdf = _setze(blocks, fusszeile, fuss_an=False)
    if fusszeile is not None and pdf.page > 1:
        pdf = _setze(blocks, fusszeile, fuss_an=True)
    return bytes(pdf.output())


def _setze(blocks: list, fusszeile: str, fuss_an: bool) -> "_BriefPDF":
    pdf = _BriefPDF(format="A4")
    pdf.fusszeile = _sauber(fusszeile or "")
    pdf._fuss_an = fuss_an
    pdf.alias_nb_pages()
    pdf.set_margins(20, 18, 20)
    pdf.set_auto_page_break(True, margin=20 if fuss_an else 18)
    pdf.add_font("DejaVu", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
    pdf.add_page()

    def schreibe(runs, groesse, hoehe, farbe=SCHWARZ, fett_alles=False):
        pdf.set_text_color(*farbe)
        for r in runs:
            t = _sauber(r.get("t", ""))
            if not t:
                continue
            pdf.set_font("DejaVu", "B" if (fett_alles or r.get("b")) else "", groesse)
            pdf.write(hoehe, t)
        pdf.ln(hoehe)

    # Seitenumbrüche am Dokumentende erzeugen nur leere Schlussseiten – weg damit
    while blocks and blocks[-1].get("art") == "seite":
        blocks = blocks[:-1]

    for b in blocks:
        art = b.get("art", "p")
        runs = b.get("runs", [])
        if art == "seite":
            # Nur umbrechen, wenn die aktuelle Seite schon Inhalt hat –
            # sonst entstehen leere Seiten (z. B. zwei Umbrüche nacheinander)
            if pdf.get_y() > pdf.t_margin + 0.5:
                pdf.add_page()
        elif art == "leer":
            pdf.ln(4)
        elif art == "h1":
            schreibe(runs, 15.5, 7.5, BLAU, fett_alles=True)
            pdf.ln(0.5)
        elif art == "h2":
            pdf.ln(3)
            schreibe(runs, 11.5, 6, BLAU, fett_alles=True)
        elif art == "sub":
            schreibe(runs, 8.5, 4.5, GRAU)
            pdf.ln(2)
        elif art in ("li", "li2"):
            # li2 = Kompaktzeile (viele Termine auf einer Seite)
            gr, hoehe = (8.5, 4.5) if art == "li2" else (10, 5.6)
            pdf.set_text_color(*SCHWARZ)
            pdf.set_font("DejaVu", "", gr)
            pdf.write(hoehe, "  •  ")
            for r in runs:
                pdf.set_font("DejaVu", "B" if r.get("b") else "", gr)
                pdf.write(hoehe, _sauber(r.get("t", "")))
            pdf.ln(hoehe)
        elif art == "code":
            text = _sauber("".join(r.get("t", "") for r in runs))
            pdf.ln(3)
            pdf.set_font("DejaVu", "B", 21)
            breite = pdf.get_string_width(text) + 24
            x = (210 - breite) / 2
            y = pdf.get_y()
            pdf.set_draw_color(*BLAU)
            pdf.set_line_width(0.6)
            pdf.rect(x, y, breite, 15, round_corners=True, corner_radius=3)
            pdf.set_line_width(0.2)
            pdf.set_text_color(*BLAU)
            pdf.set_xy(x, y + 3.5)
            pdf.cell(breite, 8, text, align="C")
            pdf.set_y(y + 18)
        elif art == "qr":
            import io
            import qrcode
            inhalt = "".join(r.get("t", "") for r in runs)
            bild = qrcode.make(inhalt, box_size=8, border=2)
            puffer = io.BytesIO()
            bild.save(puffer, format="PNG")
            puffer.seek(0)
            groesse = 44
            pdf.ln(2)
            pdf.image(puffer, x=(210 - groesse) / 2, w=groesse)
            pdf.ln(2)
        elif art == "h1c":
            pdf.set_text_color(*BLAU)
            pdf.set_font("DejaVu", "B", 19)
            pdf.cell(0, 10, _sauber("".join(r.get("t", "") for r in runs)), align="C")
            pdf.ln(11)
        elif art == "subc":
            pdf.set_text_color(*GRAU)
            pdf.set_font("DejaVu", "", 9)
            pdf.cell(0, 5, _sauber("".join(r.get("t", "") for r in runs)), align="C")
            pdf.ln(8)
        elif art == "trenn":
            pdf.ln(1.5)
            y = pdf.get_y()
            pdf.set_draw_color(*BLAU)
            pdf.set_line_width(0.5)
            pdf.line(20, y, 190, y)
            pdf.set_line_width(0.2)
            pdf.ln(4)
        elif art == "h2box":
            text = _sauber("".join(r.get("t", "") for r in runs))
            if pdf.get_y() + 20 > pdf.h - pdf.b_margin:
                pdf.add_page()  # Balken nicht als Waise ans Seitenende setzen
            pdf.ln(2)
            pdf.set_fill_color(226, 236, 254)
            pdf.set_text_color(*BLAU)
            pdf.set_font("DejaVu", "B", 11.5)
            pdf.set_x(20)
            pdf.cell(170, 7.6, "  " + text, fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.5)
        elif art == "kasten":
            gesamt = _sauber("".join(r.get("t", "") for r in runs))
            pdf.set_font("DejaVu", "", 10)
            h_txt = pdf.multi_cell(162, 5.6, gesamt, dry_run=True, output="HEIGHT")
            if pdf.get_y() + h_txt + 14 > pdf.h - pdf.b_margin:
                pdf.add_page()
            y0 = pdf.get_y()
            alt_l, alt_r = pdf.l_margin, pdf.r_margin
            pdf.set_left_margin(24)
            pdf.set_right_margin(24)
            pdf.set_xy(24, y0 + 3)
            pdf.set_text_color(*SCHWARZ)
            for r in runs:
                t = _sauber(r.get("t", ""))
                if not t:
                    continue
                pdf.set_font("DejaVu", "B" if r.get("b") else "", 10)
                pdf.write(5.6, t)
            pdf.set_left_margin(alt_l)
            pdf.set_right_margin(alt_r)
            y1 = pdf.get_y() + 5.6 + 3
            pdf.set_draw_color(*BLAU)
            pdf.set_line_width(0.4)
            pdf.rect(20, y0, 170, y1 - y0, round_corners=True, corner_radius=3)
            pdf.set_line_width(0.2)
            pdf.set_y(y1 + 3)
        elif art == "schnitt":
            pdf.ln(3)
            y = pdf.get_y()
            pdf.set_draw_color(*GRAU)
            pdf.set_line_width(0.3)
            pdf.set_dash_pattern(dash=2, gap=2)
            pdf.line(20, y, 190, y)
            pdf.set_dash_pattern()
            pdf.set_line_width(0.2)
            pdf.set_xy(20, y + 1)
            pdf.set_text_color(*GRAU)
            pdf.set_font("DejaVu", "", 7.5)
            pdf.cell(170, 4, "hier abschneiden", align="C")
            pdf.ln(7)
        elif art == "sec":
            titel = _sauber(b.get("titel", ""))
            text = _sauber(b.get("text", ""))
            pdf.set_font("DejaVu", "", 9.5)
            h_text = pdf.multi_cell(162, 4.8, text, dry_run=True, output="HEIGHT") if text else 0
            h_gesamt = 8 + h_text + (7 if b.get("ankreuz") else 0) + 5
            if pdf.get_y() + h_gesamt > pdf.h - pdf.b_margin:
                pdf.add_page()
            y0 = pdf.get_y()
            pdf.set_xy(24, y0 + 2.5)
            pdf.set_text_color(*BLAU)
            pdf.set_font("DejaVu", "B", 10.5)
            pdf.cell(162, 5, titel)
            pdf.set_xy(24, y0 + 8.5)
            if text:
                pdf.set_text_color(*SCHWARZ)
                pdf.set_font("DejaVu", "", 9.5)
                pdf.multi_cell(162, 4.8, text)
            if b.get("ankreuz"):
                pdf.set_xy(24, pdf.get_y() + 1.5)
                pdf.set_text_color(*SCHWARZ)
                pdf.set_font("DejaVu", "B", 10)
                pdf.cell(162, 5.5, "☐  Ich stimme zu          ☐  Ich stimme nicht zu")
                pdf.ln(5.5)
            y1 = pdf.get_y() + 2.5
            pdf.set_draw_color(203, 213, 225)
            pdf.set_line_width(0.3)
            pdf.rect(20, y0, 170, y1 - y0, round_corners=True, corner_radius=2.5)
            pdf.set_line_width(0.2)
            pdf.set_y(y1 + 3.5)
        elif art == "linie":
            pdf.ln(9)
            y = pdf.get_y()
            pdf.set_draw_color(*SCHWARZ)
            pdf.line(20, y, 110, y)
            pdf.set_xy(20, y + 1)
            schreibe(runs, 8, 4.5, GRAU)
        else:  # p
            schreibe(runs, 10, 5.6)
            pdf.ln(1.2)

    return pdf
