"""Content-Hub Renderer (Stufe 5).

POST /render
{
  "mandant": "werkhaus",
  "template": "carousel-standard",      # templates/<mandant>/<template>.html
  "format": "carousel",                 # carousel 1080x1350 | story 1080x1920 | post 1080x1080
  "daten": { ... },                     # frei, steht in der Vorlage als {{ daten }} zur Verfügung
  "ziel": "werkhaus/render/thema-123/slide-1"   # relativ zu OUTPUT_DIR, ohne .png
}
→ { "datei": "werkhaus/render/thema-123/slide-1-a1b2c3.png" }

Nur intern erreichbar (kein Caddy-Netz); n8n ruft ihn auf und legt die
Datei über media.nettverwaltet.de öffentlich ab.
"""
import os, re, secrets
from pathlib import Path
from flask import Flask, jsonify, request
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.sync_api import sync_playwright

TEMPLATE_DIR = Path(os.environ.get("TEMPLATE_DIR", "/templates"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/files/media"))
FORMATE = {"carousel": (1080, 1350), "story": (1080, 1920), "post": (1080, 1080)}
SAFE = re.compile(r"^[a-z0-9][a-z0-9_\-/]*$")

app = Flask(__name__)
env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=select_autoescape(["html"]))


@app.get("/gesund")
def health():
    return "ok"


@app.post("/render")
def render():
    body = request.get_json(silent=True) or {}
    mandant, template, ziel = body.get("mandant", ""), body.get("template", ""), body.get("ziel", "")
    fmt = FORMATE.get(body.get("format", "carousel"))
    if not (SAFE.match(mandant) and SAFE.match(template) and SAFE.match(ziel) and fmt):
        return jsonify(error="mandant/template/ziel ungültig"), 400
    try:
        tpl = env.get_template(f"{mandant}/{template}.html")
    except Exception:
        return jsonify(error="Vorlage nicht gefunden"), 404
    html = tpl.render(daten=body.get("daten", {}), breite=fmt[0], hoehe=fmt[1], mandant=mandant)
    out = OUTPUT_DIR / f"{ziel}-{secrets.token_hex(3)}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": fmt[0], "height": fmt[1]}, device_scale_factor=1)
        page.set_content(html, wait_until="networkidle")
        page.screenshot(path=str(out), full_page=False)
        browser.close()
    return jsonify(datei=str(out.relative_to(OUTPUT_DIR)))
