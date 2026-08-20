"""Wettervorhersage für Terminorte (Open-Meteo, kostenlos, ohne Schlüssel).

Termine bis 7 Tage im Voraus bekommen im Portal das voraussichtliche Wetter
am Spielort. Der Ort wird aus dem Freitext (z. B. „Sporthalle, Liese-Meitner-
Str. 3, 19063 Schwerin") über die Stadt geocodiert; ohne erkennbare Stadt
gilt Waren (Müritz). Geocoding und Vorhersagen werden im Prozess gecacht.
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request

UA = "skv-mueritz-volleyball"
WAREN = (53.516, 12.678)

_geo_cache: dict = {}          # stadt -> (lat, lon)
_vorhersage_cache: dict = {}   # (lat, lon, datum) -> (ts, daten|None)


def _hole_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=6) as antwort:
        return json.load(antwort)


def _stadt_aus_ort(ort: str) -> str:
    """Stadt aus dem Orts-Freitext ziehen – bevorzugt das Wort nach der PLZ."""
    m = re.search(r"\b\d{5}\s+([A-ZÄÖÜ][\wäöüß().-]+(?:\s+\([\wäöüß.]+\))?)", ort or "")
    if m:
        return m.group(1).strip()
    return ""


def _koordinaten(ort: str) -> tuple:
    stadt = _stadt_aus_ort(ort)
    if not stadt:
        return WAREN
    if stadt in _geo_cache:
        return _geo_cache[stadt]
    try:
        roh = _hole_json("https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name="
                         + urllib.parse.quote(stadt))
        treffer = (roh.get("results") or [{}])[0]
        koord = (treffer.get("latitude"), treffer.get("longitude"))
        if koord[0] is None:
            koord = WAREN
    except Exception:
        koord = WAREN
    _geo_cache[stadt] = koord
    return koord


def fuer_termin(ort: str, datum: str):
    """Vorhersage {code, tmin, tmax} für einen Tag (YYYY-MM-DD) am Ort – oder None."""
    lat, lon = _koordinaten(ort or "")
    schluessel = (round(lat, 2), round(lon, 2), datum)
    treffer = _vorhersage_cache.get(schluessel)
    if treffer and time.time() - treffer[0] < 3 * 3600:
        return treffer[1]
    daten = None
    try:
        roh = _hole_json(
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}&timezone=Europe%2FBerlin"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min"
            f"&start_date={datum}&end_date={datum}")
        tag = roh.get("daily") or {}
        if tag.get("weather_code"):
            daten = {"code": tag["weather_code"][0],
                     "tmin": tag["temperature_2m_min"][0],
                     "tmax": tag["temperature_2m_max"][0]}
    except Exception:
        daten = None
    _vorhersage_cache[schluessel] = (time.time(), daten)
    return daten
