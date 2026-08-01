#!/usr/bin/env python3
"""Erzeugt die App-Icons der Reisekasse (Blau/Gelb, € ⇄ kr).

Aufruf:  python3 make_icons.py   (benötigt Pillow)
"""
from PIL import Image, ImageDraw, ImageFont

BLUE = (0, 106, 167)
BLUE_DARK = (0, 74, 118)
YELLOW = (254, 204, 2)
WHITE = (255, 255, 255)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def make(size: int, path: str) -> None:
    scale = 4  # supersampling für glatte Kanten
    s = size * scale
    img = Image.new("RGB", (s, s), BLUE)
    d = ImageDraw.Draw(img)

    # dezenter Verlauf nach unten
    for y in range(s):
        t = y / s
        col = tuple(int(BLUE[i] + (BLUE_DARK[i] - BLUE[i]) * t) for i in range(3))
        d.line([(0, y), (s, y)], fill=col)

    # gelbes Kreuz wie auf der schwedischen Flagge, sehr dezent
    bar = s // 14
    d.rectangle([int(s * 0.30), 0, int(s * 0.30) + bar, s], fill=(255, 214, 40, 40))
    d.rectangle([0, int(s * 0.42), s, int(s * 0.42) + bar], fill=(255, 214, 40, 40))

    big = ImageFont.truetype(FONT, int(s * 0.34))
    mid = ImageFont.truetype(FONT, int(s * 0.20))

    def center(text, font, cx, cy, fill):
        box = d.textbbox((0, 0), text, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        d.text((cx - w / 2 - box[0], cy - h / 2 - box[1]), text, font=font, fill=fill)

    center("€", big, s * 0.30, s * 0.32, WHITE)
    center("kr", big, s * 0.66, s * 0.68, YELLOW)
    center("⇄", mid, s * 0.52, s * 0.50, YELLOW)

    img.resize((size, size), Image.LANCZOS).save(path, "PNG")
    print(f"{path} ({size}x{size})")


if __name__ == "__main__":
    make(180, "icons/icon-180.png")
    make(192, "icons/icon-192.png")
    make(512, "icons/icon-512.png")
