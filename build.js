/* ==========================================================================
   SKV Müritz – Build für eine einzelne, offline-taugliche HTML-Datei.
   Fügt CSS und JS in index.html ein und schreibt dist/skv-mueritz-offline.html.
   Aufruf:  node build.js
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let html = read("index.html");

// <link rel="stylesheet" href="assets/css/styles.css"> -> <style>…</style>
html = html.replace(
  /<link rel="stylesheet" href="assets\/css\/styles\.css"\s*\/?>/,
  `<style>\n${read("assets/css/styles.css")}\n</style>`
);

// <script src="assets/js/xyz.js"></script> -> <script>…</script>  (Reihenfolge bleibt erhalten)
html = html.replace(/<script src="(assets\/js\/[^"]+)"><\/script>/g, (_, src) => {
  return `<script>\n/* ${src} */\n${read(src)}\n</script>`;
});

const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "skv-mueritz-offline.html");
fs.writeFileSync(outFile, html);

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`✔ Erstellt: dist/skv-mueritz-offline.html (${kb} KB)`);
if (/href="https?:|src="https?:/.test(html.replace(/https:\/\/www\.skv-mueritz\.de|https:\/\/[^"]*vvmv|https:\/\/mv\.sams-ticket|https:\/\/www\.volleyball-verband|https:\/\/www\.bildung-mv\.de[^"]*|https:\/\/calendar\.google\.com[^"]*/g, ""))) {
  console.warn("⚠ Warnung: potenziell externe Ressource gefunden (bitte prüfen).");
} else {
  console.log("✔ Keine externen Ressourcen – voll offline-tauglich (nur bewusste Verbands-/Vereinslinks).");
}
