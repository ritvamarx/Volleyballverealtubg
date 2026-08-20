/* ==========================================================================
   SKV Volleyball – Hilfsfunktionen (DOM, Formatierung, Modal, Toast, SVG)
   ========================================================================== */
(function () {
  "use strict";

  // ---- DOM ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // sichere HTML-Escapes
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---- Datum / Uhrzeit (deutsch) ----
  const DOW = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${DOW[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtDateShort(iso) {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function fmtDateTime(iso) { return `${fmtDate(iso)} · ${fmtTime(iso)} Uhr`; }
  function fmtMoney(n) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
  }
  function daysUntil(iso) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  }
  function relDays(iso) {
    const n = daysUntil(iso);
    if (n === 0) return "heute";
    if (n === 1) return "morgen";
    if (n === -1) return "gestern";
    if (n > 1) return `in ${n} Tagen`;
    return `vor ${Math.abs(n)} Tagen`;
  }
  function age(iso) {
    const b = new Date(iso), now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a;
  }

  // ---- Farb-Avatar aus Namen ----
  const AV_COLORS = ["#f97316", "#2563eb", "#16a34a", "#db2777", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];
  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AV_COLORS.length;
    return AV_COLORS[h];
  }
  function initials(first, last) {
    return `${(first || "?")[0]}${(last || "")[0] || ""}`.toUpperCase();
  }
  function avatar(first, last, profil) {
    // profil (optional): Spieler-Objekt mit eigenem Foto oder Emoji-Avatar
    if (profil && profil.foto) {
      return `<div class="avatar" style="padding:0;overflow:hidden"><img src="${profil.foto}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`;
    }
    if (profil && profil.avatarEmoji) {
      return `<div class="avatar" style="background:#eef2ff;font-size:1.15rem">${esc(profil.avatarEmoji)}</div>`;
    }
    const c = avatarColor(`${first}${last}`);
    return `<div class="avatar" style="background:${c}">${esc(initials(first, last))}</div>`;
  }

  // ---- Toast ----
  function toast(msg, kind = "") {
    const root = $("#toastRoot");
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // ---- Modal ----
  function modal({ title, body, footer, onOpen, wide }) {
    const root = $("#modalRoot");
    root.innerHTML = "";
    const m = document.createElement("div");
    m.className = "modal";
    if (wide) m.style.width = "min(860px, calc(100vw - 32px))";
    m.innerHTML = `
      <div class="modal-head"><h3>${esc(title)}</h3><button class="close" aria-label="Schließen">×</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
    root.appendChild(m);
    const overlay = $("#overlay");
    requestAnimationFrame(() => { overlay.classList.add("show"); m.classList.add("show"); });
    const close = () => closeModal();
    $(".close", m).addEventListener("click", close);
    overlay.onclick = close;
    if (onOpen) onOpen(m);
    return m;
  }
  function closeModal() {
    const overlay = $("#overlay");
    const m = $(".modal");
    overlay.classList.remove("show");
    // nur DIESES Modal entfernen – ein direkt danach geöffnetes neues Modal bleibt erhalten
    if (m) { m.classList.remove("show"); setTimeout(() => m.remove(), 200); }
  }

  function confirmDialog(message, onYes, yesLabel = "Löschen") {
    modal({
      title: "Bestätigen",
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn danger" data-y>${esc(yesLabel)}</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-y]").onclick = () => { closeModal(); onYes(); };
      },
    });
  }

  // Formular-Werte einsammeln
  function formData(form) {
    const data = {};
    $$("[name]", form).forEach((el) => {
      if (el.type === "checkbox") data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  // ---- Produkt-SVGs für Vereinskleidung (selbstenthaltend, keine externen Bilder) ----
  function clothingSVG(kind, color) {
    const c = color || "#f97316";
    const logo = `<circle cx="128" cy="98" r="9" fill="#fff" opacity=".9"/>`;
    const shapes = {
      jersey: `<path d="M78 60 L58 78 L74 96 L88 84 L88 168 Q128 178 168 168 L168 84 L182 96 L198 78 L178 60 Q160 74 128 74 Q96 74 78 60 Z" fill="${c}"/><text x="128" y="150" font-size="34" font-weight="800" fill="#fff" text-anchor="middle" opacity=".85">7</text>`,
      jacket: `<path d="M78 60 L58 78 L74 96 L86 86 L86 176 L170 176 L170 86 L182 96 L198 78 L178 60 Q160 74 128 74 Q96 74 78 60 Z" fill="${c}"/><line x1="128" y1="76" x2="128" y2="176" stroke="#fff" stroke-width="3" opacity=".7"/>`,
      hoodie: `<path d="M80 66 Q128 44 176 66 L196 84 L180 100 L170 92 L170 176 L86 176 L86 92 L76 100 L60 84 Z" fill="${c}"/><path d="M108 66 Q128 84 148 66" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/>`,
      bag: `<rect x="60" y="96" width="136" height="72" rx="14" fill="${c}"/><path d="M96 96 Q96 78 128 78 Q160 78 160 96" fill="none" stroke="#fff" stroke-width="6" opacity=".8"/><rect x="118" y="120" width="20" height="24" rx="4" fill="#fff" opacity=".8"/>`,
      pads: `<rect x="78" y="80" width="46" height="96" rx="20" fill="${c}"/><rect x="132" y="80" width="46" height="96" rx="20" fill="${c}"/><ellipse cx="101" cy="118" rx="14" ry="16" fill="#fff" opacity=".35"/><ellipse cx="155" cy="118" rx="14" ry="16" fill="#fff" opacity=".35"/>`,
    };
    return `<svg viewBox="0 0 256 220" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="220" fill="#f1f5f9"/>
      ${shapes[kind] || shapes.jersey}
      ${kind === "jersey" ? "" : logo}
    </svg>`;
  }

  // Sponsor-Logo-SVG (Platzhalter aus Initialen)
  function sponsorSVG(name, color) {
    const c = color || "#0ea5e9";
    const words = name.split(" ");
    const ini = words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return `<svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="130" fill="#fff"/>
      <rect x="26" y="35" width="60" height="60" rx="14" fill="${c}"/>
      <text x="56" y="76" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">${esc(ini)}</text>
      <text x="104" y="66" font-size="19" font-weight="700" fill="#0f172a">${esc(words[0] || "")}</text>
      <text x="104" y="90" font-size="14" fill="#64748b">${esc(words.slice(1).join(" "))}</text>
    </svg>`;
  }

  // 🏐 Belohnungs-Animation: ein Volleyball fliegt durchs Bild – jedes Mal mit
  // zufälliger Route (hoher Bogen, Boden-Praller oder Abprallen an der Wand),
  // zufälliger Richtung, Größe und Geschwindigkeit.
  function volleyballFlug() {
    try {
      const b = document.createElement("div");
      b.textContent = "🏐";
      const groesse = 46 + Math.round(Math.random() * 30);
      const vonLinks = Math.random() < 0.5;
      const B = window.innerWidth, H = window.innerHeight;
      const startTop = H * (0.2 + Math.random() * 0.45);
      b.style.cssText = `position:fixed;z-index:99999;left:${vonLinks ? -groesse - 40 : B + 40}px;top:${startTop}px;`
        + `font-size:${groesse}px;pointer-events:none;will-change:transform;filter:drop-shadow(0 6px 8px rgba(0,0,0,.25))`;
      document.body.appendChild(b);
      const dirX = vonLinks ? 1 : -1;
      const weite = B + groesse + 120;
      const drall = (3 + Math.random() * 3) * dirX;
      const kf = (off, x, y) => ({
        offset: off,
        transform: `translate(${dirX * x}px, ${y}px) rotate(${drall * off}turn)`,
      });
      const variante = Math.floor(Math.random() * 3);
      let frames;
      if (variante === 0) {
        // Hoher Bogen über den Bildschirm
        const hoehe = 100 + Math.random() * (startTop * 0.8);
        frames = [kf(0, 0, 0), kf(0.5, weite * 0.5, -hoehe), kf(1, weite, 60)];
      } else if (variante === 1) {
        // Boden-Praller: hüpft mit abnehmender Höhe über den Boden
        const boden = H - startTop - groesse - 8;
        frames = [
          kf(0, 0, 0),
          kf(0.22, weite * 0.22, boden),
          kf(0.42, weite * 0.42, boden - Math.min(boden, H * 0.34)),
          kf(0.58, weite * 0.58, boden),
          kf(0.73, weite * 0.73, boden - Math.min(boden, H * 0.17)),
          kf(0.85, weite * 0.85, boden),
          kf(1, weite, boden - Math.min(boden, H * 0.07)),
        ];
      } else {
        // Wand-Praller: an der gegenüberliegenden Kante abprallen und zurück
        const wand = B - groesse * 1.2;
        frames = [
          kf(0, 0, 0),
          kf(0.45, wand, -H * (0.05 + Math.random() * 0.15)),
          kf(0.7, wand * 0.55, H * 0.2),
          kf(1, wand * 0.1, H - startTop + groesse),
        ];
      }
      b.animate(frames, { duration: 1200 + Math.random() * 800, easing: "linear" }).onfinish = () => b.remove();
      setTimeout(() => b.remove(), 2600); // Sicherheitsnetz für alte Browser
    } catch (e) { /* Animation ist nur Zierde */ }
  }

  window.U = {
    $, $$, esc, fmtDate, fmtDateShort, fmtTime, fmtDateTime, fmtMoney,
    daysUntil, relDays, age, avatar, avatarColor, initials,
    toast, modal, closeModal, confirmDialog, formData,
    clothingSVG, sponsorSVG, DOW, MON, volleyballFlug,
  };
})();
