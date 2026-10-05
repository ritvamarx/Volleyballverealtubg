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
// Bewusst gesetzte externe Links: Verband/Verein, Behörden-Infoseiten sowie
// Karten- und Teilen-Links. Das sind alles Ziele, die der Nutzer anklickt –
// keine Ressourcen, die die Seite lädt. Die Offline-Tauglichkeit bleibt also
// erhalten. Alles außerhalb dieser Liste wird gemeldet.
const ERLAUBTE_LINKS = [
  /https:\/\/www\.skv-mueritz\.de/,
  /https:\/\/[^"]*vvmv/,
  /https:\/\/[^"]*vmv24\.de[^"]*/,
  /https:\/\/vmv\.sams-(server|ticker)\.de[^"]*/,
  /https:\/\/mv\.sams-ticket/,
  /https:\/\/www\.volleyball-verband/,
  /https:\/\/www\.bildung-mv\.de[^"]*/,
  /https:\/\/www\.regierung-mv\.de[^"]*/,
  /https:\/\/calendar\.google\.com[^"]*/,
  /https:\/\/www\.google\.com\/maps[^"]*/,
  /https:\/\/chat\.whatsapp\.com[^"]*/,
  /https:\/\/wa\.me[^"]*/,
];

const erlaubt = new RegExp(ERLAUBTE_LINKS.map((r) => r.source).join("|"), "g");
const unbekannt = [...new Set(
  [...html.replace(erlaubt, "").matchAll(/(?:href|src)="(https?:[^"]*)"/g)].map((m) => m[1])
)];
if (unbekannt.length) {
  console.warn("⚠ Warnung: nicht freigegebene externe Verweise gefunden:");
  unbekannt.forEach((u) => console.warn(`    ${u}`));
  console.warn("    Prüfen und, falls gewollt, in ERLAUBTE_LINKS aufnehmen.");
} else {
  console.log("✔ Keine externen Ressourcen – voll offline-tauglich (nur bewusste Verbands-/Vereinslinks).");
}
