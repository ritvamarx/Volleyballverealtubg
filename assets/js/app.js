/* ==========================================================================
   SKV Volleyball – App-Router & Initialisierung
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$ } = U;

  // Navigationsstruktur (Reihenfolge = Menü)
  const NAV = [
    { group: "Team" },
    { id: "dashboard", label: "Übersicht", icon: "🏠" },
    { id: "departments", label: "Abteilungen", icon: "🏟️" },
    { id: "players", label: "Spielerverwaltung", icon: "🧑‍🤝‍🧑" },
    { id: "announcements", label: "Ankündigungen", icon: "📣" },
    { id: "birthdays", label: "Geburtstage", icon: "🎂" },
    { id: "consents", label: "Einverständnis", icon: "📝" },

    { group: "Termine & Einsatz" },
    { id: "calendar", label: "Kalender", icon: "📅" },
    { id: "training", label: "Trainingsrückmeldung", icon: "🏐" },
    { id: "drivers", label: "Fahrerplanung", icon: "🚗" },
    { id: "jobs", label: "Heimspiel-Jobs", icon: "🙌" },
    { id: "tasks", label: "Aufgaben", icon: "✅" },

    { group: "Verein" },
    { id: "finances", label: "Finanzen", icon: "💶" },
    { id: "clothing", label: "Vereinskleidung", icon: "👕" },
    { id: "sponsors", label: "Sponsoren", icon: "🤝" },
    { id: "inventory", label: "Material", icon: "📦" },

    { group: "Wissen & Verband" },
    { id: "verbandsmeldung", label: "Verbandsmeldung", icon: "📋" },
    { id: "standings", label: "Verbandsliga MV", icon: "🏆" },
    { id: "wiki", label: "Volleyball-Wiki", icon: "📖" },

    { group: "System" },
    { id: "backup", label: "Datensicherung", icon: "💾" },
  ];

  const titles = {};
  NAV.forEach((n) => { if (n.id) titles[n.id] = n.label; });

  function buildNav() {
    const nav = $("#nav");
    nav.innerHTML = NAV.map((n) => {
      if (n.group) return `<div class="nav-group-title">${n.group}</div>`;
      return `<a href="#/${n.id}" data-route="${n.id}"><span class="ic">${n.icon}</span>${n.label}</a>`;
    }).join("");
  }

  let current = "dashboard";

  function route() {
    const hash = (location.hash || "#/dashboard").replace(/^#\//, "");
    current = Views[hash] ? hash : "dashboard";
    render(current);
  }

  function render(id) {
    const view = $("#view");
    $("#pageTitle").textContent = titles[id] || "Übersicht";
    $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === id));
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    try {
      Views[id](view);
    } catch (err) {
      view.innerHTML = `<div class="card"><h3>Fehler beim Laden</h3><pre style="white-space:pre-wrap">${U.esc(err && err.stack || err)}</pre></div>`;
      console.error(err);
    }
    // Menü auf Mobile schließen
    $("#sidebar").classList.remove("open");
    $("#overlay").classList.remove("show");
  }

  // Öffentliche App-API (von Views genutzt)
  window.App = {
    reload() { render(current); },
    go(id) { location.hash = `#/${id}`; },
  };

  // ---- Theme ----
  const THEME_KEY = "skv_theme";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function initTheme() {
    let t = "light";
    try { t = localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (e) {}
    applyTheme(t);
  }

  // ---- Init ----
  function init() {
    buildNav();
    initTheme();
    window.addEventListener("hashchange", route);
    if (!location.hash) location.hash = "#/dashboard";
    route();

    $("#themeToggle").onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    $("#resetData").onclick = () => U.modal({
      title: "Daten zurücksetzen",
      body: `<p>Wie soll die Plattform zurückgesetzt werden? <strong>Eigene Eingaben gehen verloren</strong> –
        vorher ggf. unter „Datensicherung" exportieren.</p>`,
      footer: `<button class="btn ghost" data-c>Abbrechen</button>
        <button class="btn outline" data-e>Leer (ohne Demodaten)</button>
        <button class="btn" data-d>Mit Demo-Daten</button>`,
      onOpen(m) {
        m.querySelector("[data-c]").onclick = U.closeModal;
        m.querySelector("[data-e]").onclick = () => { Store.resetEmpty(); U.closeModal(); U.toast("Leer zurückgesetzt", "good"); App.reload(); };
        m.querySelector("[data-d]").onclick = () => { Store.resetDemo(); U.closeModal(); U.toast("Demo-Daten geladen", "good"); App.reload(); };
      },
    });

    $("#hamburger").onclick = () => {
      $("#sidebar").classList.toggle("open");
      $("#overlay").classList.toggle("show");
    };
    $("#overlay").addEventListener("click", () => { $("#sidebar").classList.remove("open"); });

    // Formulierungs-Update in bestehenden Briefen: nur exakte alte Standardsätze
    // werden ersetzt (individuell bearbeitete Texte bleiben unangetastet)
    (function migrateLetterWording() {
      const repl = [
        ["ich fahre als Trainer immer selbst mit", "es begleitet immer mindestens ein Mitglied des Trainerteams die Mannschaft"],
        ["Wenn die Plätze im Bus nicht ausreichen, bin ich auf einzelne Eltern angewiesen", "Wenn die Plätze im Bus nicht ausreichen, sind wir auf einzelne Eltern angewiesen"],
        ["Bei Heimspielen ist es guter Brauch, dass die gastgebende Mannschaft für beide Teams ein kleines Buffet organisiert",
          "An unseren Heimspieltagen sind immer drei Mannschaften in der Halle. Es ist guter Brauch, dass die gastgebende Mannschaft für alle drei Mannschaften ein kleines Buffet organisiert"],
        ["die Listen ein, die ich vor jedem Heimspiel herumgebe", "die Listen ein, die das Trainerteam vor jedem Heimspiel herumgibt"],
        ["möchte ich Sie gern direkt kontaktieren können und organisiere die Eltern", "möchte das Trainerteam Sie gern direkt kontaktieren können und organisiert die Eltern"],
        ["Ich freue mich auf eine tolle Saison", "Wir freuen uns auf eine tolle Saison"],
      ];
      Store.get().letters.forEach((l) => {
        let body = l.body || "", changed = false;
        repl.forEach(([a, b]) => { if (body.includes(a)) { body = body.split(a).join(b); changed = true; } });
        if (changed) Store.update("letters", l.id, { body });
      });
    })();

    // Bereits importierte Termine mit Art "Sonstiges" einmalig neu klassifizieren
    // (verbesserte Erkennung von "Heim : Gast"-Spielplan-Titeln)
    if (window.IO) {
      let reclassified = 0;
      Store.get().events.forEach((e) => {
        if (e.sourceUid && e.type === "other" && !e.reGuessed) {
          const t = IO.guessType(e.title);
          Store.update("events", e.id, { type: t, reGuessed: true });
          if (t !== "other") reclassified++;
        }
      });
      if (reclassified) U.toast(`${reclassified} importierte Termine als Heim-/Auswärtsspiel erkannt`, "good");
    }

    // Ferien-Abo MV: automatisch aktualisieren (still, höchstens einmal pro Tag)
    if (window.IO && navigator.onLine !== false) {
      const HK = "skv_holidays_synced";
      const todayKey = new Date().toISOString().slice(0, 10);
      let last = null; try { last = localStorage.getItem(HK); } catch (e) {}
      if (last !== todayKey) {
        IO.syncHolidaysMV().then(() => {
          try { localStorage.setItem(HK, todayKey); } catch (e) {}
          App.reload();
        }).catch(() => { /* offline/CORS – Seed-Termine bleiben */ });
      }
    }

    // Kalender-Abos automatisch synchronisieren (still im Hintergrund)
    if (window.IO && navigator.onLine !== false) {
      IO.syncAllFeeds().then((r) => {
        if (r.added > 0) {
          Store.get().calendarFeeds.forEach((f) => { if (f.autoSync) Store.update("calendarFeeds", f.id, { lastSync: new Date().toISOString() }); });
          U.toast(`🔄 ${r.added} neue Termine aus Kalender-Abos importiert`, "good");
          App.reload();
        }
      }).catch(() => { /* offline oder CORS – still bleiben */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
