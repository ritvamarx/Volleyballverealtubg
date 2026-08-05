/* ==========================================================================
   SKV Müritz – Import/Export & Parser
   - Spielerdaten: CSV, JSON, vCard (Export) · CSV, JSON (Import)
   - Termine: iCal (.ics), RSS/Atom  – aus Datei, Text oder URL
   Alles clientseitig, keine externen Bibliotheken.
   ========================================================================== */
(function () {
  "use strict";

  // ---------- Datei-Download / Upload ----------
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function decodeSmart(buffer) {
    // Erst UTF-8 (strikt) versuchen; schlägt es fehl → Latin-1 (z. B. SAMS-Exporte des VVMV)
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder("iso-8859-1").decode(buffer); }
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = accept || "";
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return resolve(null);
        const rd = new FileReader();
        rd.onload = () => resolve({ name: f.name, text: decodeSmart(rd.result) });
        rd.readAsArrayBuffer(f);
      };
      inp.click();
    });
  }

  // ---------- CSV ----------
  function csvEscape(v) {
    v = v == null ? "" : String(v);
    return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCSV(headers, rows) {
    const head = headers.join(";");
    const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")).join("\n");
    return head + "\n" + body;
  }
  // robuster CSV/`;`-Parser (unterstützt Anführungszeichen, Zeilenumbrüche in Feldern)
  function parseCSV(text) {
    text = text.replace(/^﻿/, ""); // BOM
    const delim = (text.split("\n")[0].split(";").length >= text.split("\n")[0].split(",").length) ? ";" : ",";
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') inQ = false;
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === delim) { row.push(field); field = ""; }
        else if (c === "\r") { /* skip */ }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    const headers = (rows.shift() || []).map((h) => h.trim());
    return rows.filter((r) => r.some((c) => c !== "")).map((r) => {
      const o = {}; headers.forEach((h, idx) => o[h] = (r[idx] != null ? r[idx] : "").trim()); return o;
    });
  }

  // ---------- vCard (Export) ----------
  function toVCard(players, deptName) {
    return players.map((p) => {
      const tel = [];
      if (p.playerPhone) tel.push(`TEL;TYPE=cell:${p.playerPhone}`);
      if (p.parentPhone) tel.push(`TEL;TYPE=home,voice:${p.parentPhone}`);
      const email = [];
      if (p.playerEmail) email.push(`EMAIL;TYPE=internet:${p.playerEmail}`);
      if (p.parentEmail) email.push(`EMAIL;TYPE=internet:${p.parentEmail}`);
      const bday = p.birthDate ? `BDAY:${p.birthDate.replace(/-/g, "")}` : "";
      const org = `ORG:SKV Müritz Volleyball;${deptName ? deptName(p.departmentId) : ""}`;
      return [
        "BEGIN:VCARD", "VERSION:3.0",
        `N:${p.lastName};${p.firstName};;;`,
        `FN:${p.firstName} ${p.lastName}`,
        org, ...tel, ...email, bday,
        p.parentName ? `NOTE:Eltern: ${p.parentName}${p.parent2Name ? " / " + p.parent2Name : ""}` : "",
        "END:VCARD",
      ].filter(Boolean).join("\r\n");
    }).join("\r\n");
  }

  // ---------- iCal (.ics) ----------
  function icsDate(val) {
    // Formate: 20260805T173000Z | 20260805T173000 | 20260805
    if (!val) return null;
    const m = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h == null) return new Date(+y, +mo - 1, +d, 12, 0, 0).toISOString();
    if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s || 0)).toISOString();
    return new Date(+y, +mo - 1, +d, +h, +mi, +s || 0).toISOString();
  }
  function parseICS(text) {
    // Zeilen entfalten (RFC 5545: Folgezeilen beginnen mit Space/Tab)
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);
    const events = []; let cur = null;
    for (const line of lines) {
      if (line.startsWith("BEGIN:VEVENT")) cur = {};
      else if (line.startsWith("END:VEVENT")) { if (cur) events.push(cur); cur = null; }
      else if (cur) {
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const rawKey = line.slice(0, idx); const val = line.slice(idx + 1);
        const key = rawKey.split(";")[0].toUpperCase();
        if (key === "SUMMARY") cur.title = unescapeICS(val);
        else if (key === "DTSTART") cur.start = icsDate(val);
        else if (key === "DTEND") cur.end = icsDate(val);
        else if (key === "LOCATION") cur.location = unescapeICS(val);
        else if (key === "DESCRIPTION") cur.description = unescapeICS(val);
        else if (key === "UID") cur.uid = val.trim();
      }
    }
    return events.filter((e) => e.start && e.title).map(normalizeImported);
  }
  function unescapeICS(v) { return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }

  // ---------- RSS / Atom ----------
  function parseFeed(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Ungültiges XML/Feed");
    const items = Array.from(doc.querySelectorAll("item, entry"));
    const T = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent.trim() : ""; };
    return items.map((it) => {
      const title = T(it, "title");
      const date = T(it, "pubDate") || T(it, "published") || T(it, "updated") || T(it, "date");
      const link = T(it, "link") || (it.querySelector("link") && it.querySelector("link").getAttribute("href")) || "";
      const guid = T(it, "guid") || T(it, "id") || link || title;
      const desc = T(it, "description") || T(it, "summary") || "";
      const dt = date ? new Date(date) : null;
      return { title, start: dt && !isNaN(dt) ? dt.toISOString() : null, description: stripHtml(desc), location: "", uid: "rss:" + guid, link };
    }).filter((e) => e.title && e.start).map(normalizeImported);
  }
  function stripHtml(s) { const d = document.createElement("div"); d.innerHTML = s; return (d.textContent || "").trim().slice(0, 400); }

  // ---------- gemeinsame Normalisierung importierter Termine ----------
  function guessType(title) {
    const t = (title || "").toLowerCase();
    if (/training|übung/.test(t)) return "training";
    if (/heim|home/.test(t)) return "home";
    if (/auswärts|auswaerts|away|@/.test(t)) return "away";
    return "other";
  }
  function normalizeImported(e) {
    return {
      title: e.title || "Termin",
      type: guessType(e.title),
      start: e.start,
      end: e.end || e.start,
      location: e.location || "",
      description: e.description || "",
      sourceUid: e.uid || null,
    };
  }

  // ---------- Netzabruf (best effort – CORS-abhängig) ----------
  async function fetchText(url) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  }
  function parseByType(type, text) {
    return type === "rss" ? parseFeed(text) : parseICS(text);
  }

  // Termine in den Store mergen (Dedup über sourceUid); gibt Anzahl neuer zurück
  function mergeEvents(list) {
    const existing = new Set(Store.get().events.map((e) => e.sourceUid).filter(Boolean));
    let added = 0;
    list.forEach((e) => {
      if (e.sourceUid && existing.has(e.sourceUid)) return;
      Store.add("events", e); if (e.sourceUid) existing.add(e.sourceUid); added++;
    });
    return added;
  }

  // Alle Abos mit autoSync durchsynchronisieren (still). Gibt {added, errors}
  async function syncAllFeeds() {
    const feeds = Store.get().calendarFeeds.filter((f) => f.autoSync && f.url);
    let added = 0, errors = 0;
    for (const f of feeds) {
      try { added += mergeEvents(parseByType(f.type, await fetchText(f.url))); }
      catch (e) { errors++; }
    }
    return { added, errors };
  }

  // ---------- Komplett-Backup: ALLE Daten als eine CSV-Datei ----------
  // Format: Abschnitte, eingeleitet mit  #TABELLE;<name>  gefolgt von normaler CSV.
  const BACKUP_COLLECTIONS = ["departments", "players", "events", "responses", "drivers", "jobs",
    "consents", "consentTemplates", "calendarFeeds", "finances", "clothing", "clothingRequests",
    "sponsors", "announcements", "tasks", "inventory", "standings", "meldungen", "holidays"];
  const NUM_FIELDS = new Set(["amount", "seats", "qty", "price", "count", "target", "jerseyNumber",
    "games", "win", "loss", "setsW", "setsL", "points", "contribution"]);
  const BOOL_FIELDS = new Set(["paid", "done", "consentOnFile", "required", "autoSync", "active"]);

  function cellOut(v) {
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);  // Arrays/Objekte als JSON in der Zelle
    return String(v);
  }
  function cellIn(key, v) {
    if (v === "" || v == null) return "";
    if (typeof v === "string" && (v.startsWith("[") || v.startsWith("{"))) {
      try { return JSON.parse(v); } catch (e) { return v; }
    }
    if (BOOL_FIELDS.has(key)) return v === "true";
    if (NUM_FIELDS.has(key)) { const n = Number(v); return isNaN(n) ? v : n; }
    return v;
  }

  function exportAllCSV() {
    const s = Store.get();
    const parts = [`#SKV-BACKUP;1;${new Date().toISOString()};${s.club}`];
    BACKUP_COLLECTIONS.forEach((coll) => {
      const rows = s[coll] || [];
      // Spaltenmenge = Vereinigung aller Schlüssel (stabil sortiert, id zuerst)
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      keys.sort((a, b) => (a === "id" ? -1 : b === "id" ? 1 : a.localeCompare(b)));
      parts.push(`#TABELLE;${coll}`);
      parts.push(keys.join(";"));
      rows.forEach((r) => parts.push(keys.map((k) => {
        const v = cellOut(r[k]);
        return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(";")));
    });
    return parts.join("\n");
  }

  function importAllCSV(text) {
    text = text.replace(/^﻿/, "").replace(/\r/g, "");
    if (!text.includes("#TABELLE;")) throw new Error("Kein SKV-Backup: Abschnitt #TABELLE fehlt");
    const result = {};
    const sections = text.split(/\n(?=#TABELLE;)/);
    sections.forEach((sec) => {
      if (!sec.startsWith("#TABELLE;")) return;
      const nl = sec.indexOf("\n");
      const name = sec.slice(9, nl).trim();
      if (!BACKUP_COLLECTIONS.includes(name)) return;
      const body = sec.slice(nl + 1);
      if (!body.trim()) { result[name] = []; return; }
      const rows = parseCSV(body);
      result[name] = rows.map((r) => {
        const o = {};
        Object.keys(r).forEach((k) => { if (k) o[k] = cellIn(k, r[k]); });
        return o;
      });
    });
    const found = Object.keys(result);
    if (!found.length) throw new Error("Keine bekannten Tabellen in der Datei gefunden");
    return { data: result, tables: found, counts: found.map((t) => `${t}: ${result[t].length}`) };
  }

  window.IO = {
    download, pickFile, toCSV, parseCSV, toVCard,
    parseICS, parseFeed, fetchText, parseByType, mergeEvents, syncAllFeeds,
    guessType, exportAllCSV, importAllCSV, BACKUP_COLLECTIONS,
  };
})();
