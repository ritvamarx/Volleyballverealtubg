/* ==========================================================================
   SKV Volleyball – Views (Ansichten)
   Jede View ist eine Funktion(el), die das Ziel-Element füllt und Events bindet.
   Nach Änderungen wird über App.reload() die aktuelle Ansicht neu gerendert.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, esc, escUrl, fmtDate, fmtDateShort, fmtTime, fmtDateTime, fmtMoney,
    daysUntil, relDays, age, avatar, toast, modal, closeModal, confirmDialog,
    formData, clothingSVG, sponsorSVG, DOW, MON, volleyballFlug } = U;

  // Quiz-Kapitel (Key → Titel) – eine Quelle für Trainer-Übersicht und -Formular.
  // Keys müssen mit server/quiz_fragen.py übereinstimmen (Zuordnung eigener Fragen).
  const QUIZ_KAPITEL_NAMEN = { feld: "📐 Feld, Netz & Ball", punkte: "🔢 Zählweise & Sätze",
    team: "👥 Team & Rotation", libero: "🦺 Libero", angriff: "🎯 Aufschlag & Angriff",
    netz: "🚫 Netz, Block & Fehler", schiri: "🧑‍⚖️ Schiri-Regelquiz", begriffe: "📖 Begriffe & Profi-Wissen" };

  const S = () => Store.get();
  const reload = () => App.reload();

  // ---- gemeinsame Bausteine ----
  function head(title, subtitle, actionsHTML) {
    return `<div class="section-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
      <div class="spacer"></div>${actionsHTML || ""}</div>`;
  }
  function stat(icon, label, value, sub, href) {
    const inhalt = `<div class="flex" style="align-items:flex-start">
      <div class="icon">${icon}</div>
      <div class="stat"><span class="label">${esc(label)}</span>
      <span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</div></div>`;
    return href ? `<a class="card stat-link" href="${href}">${inhalt}</a>`
                : `<div class="card">${inhalt}</div>`;
  }
  function empty(icon, text) {
    return `<div class="empty"><span class="big">${icon}</span>${esc(text)}</div>`;
  }
  function playerName(id) {
    const p = Store.byId("players", id);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  }
  function deptName(id) {
    const d = Store.byId("departments", id);
    return d ? d.name : "—";
  }
  // Mehrfach-Zugehörigkeit: Spieler:innen können in MEHREREN Mannschaften sein.
  // departmentIds ist die Wahrheit; departmentId bleibt als erste Mannschaft
  // gepflegt, damit ältere Datenstände und Exporte weiter funktionieren.
  function playerDeptIds(p) {
    if (Array.isArray(p.departmentIds) && p.departmentIds.length) return p.departmentIds;
    return p.departmentId ? [p.departmentId] : [];
  }
  function inDept(p, id) { return playerDeptIds(p).includes(id); }
  function playerDeptNames(p) {
    const namen = playerDeptIds(p).map(deptName).filter((n) => n !== "—");
    return namen.length ? namen.join(", ") : "—";
  }

  // ---- Bearbeitbare Link-Sammlung (Übersicht + Verbandsseite) ----
  function linkListHTML() {
    return S().links.map((lk) => `
      <div class="flex" style="gap:0">
        <a class="link-card grow" href="${escUrl(lk.url)}" target="_blank" rel="noopener" style="border-radius:12px 0 0 12px;border-right:none">
          <span class="ic">${esc(lk.icon || "🔗")}</span>
          <div class="grow"><div class="title">${esc(lk.title)}</div><div class="sub">${esc(lk.sub || "")}</div></div>
          <span class="arr">↗</span></a>
        <div style="display:flex;flex-direction:column;border:1px solid var(--border);border-left:none;border-radius:0 12px 12px 0;overflow:hidden">
          <button class="btn sm ghost" data-lkedit="${lk.id}" style="border-radius:0">✏️</button>
          <button class="btn sm ghost" data-lkdel="${lk.id}" style="border-radius:0">🗑️</button>
        </div>
      </div>`).join("") || empty("🔗", "Noch keine Links – jetzt anlegen");
  }
  function bindLinkActions(el) {
    $$("[data-lkadd]", el).forEach((b) => b.onclick = () => linkForm());
    $$("[data-lkedit]", el).forEach((b) => b.onclick = () => linkForm(Store.byId("links", b.dataset.lkedit)));
    $$("[data-lkdel]", el).forEach((b) => b.onclick = () => {
      const lk = Store.byId("links", b.dataset.lkdel);
      confirmDialog(`Link „${lk.title}" löschen?`, () => { Store.remove("links", lk.id); toast("Link gelöscht"); reload(); });
    });
  }
  function linkForm(lk) {
    const isEdit = !!lk;
    lk = lk || { icon: "🔗", title: "", sub: "", url: "https://" };
    modal({
      title: isEdit ? "Link bearbeiten" : "Neuer Link",
      body: `<form id="lkf"><div class="form-grid">
        <div class="field"><label>Symbol (Emoji)</label><input name="icon" value="${esc(lk.icon)}" maxlength="4"></div>
        <div class="field"><label>Titel</label><input name="title" value="${esc(lk.title)}" required></div>
        <div class="field full"><label>Beschreibung</label><input name="sub" value="${esc(lk.sub)}"></div>
        <div class="field full"><label>URL</label><input type="url" name="url" value="${esc(lk.url)}" required placeholder="https://"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#lkf"); if (!f.reportValidity()) return;
          const d = formData(f);
          if (isEdit) Store.update("links", lk.id, d); else Store.add("links", d);
          closeModal(); toast("Link gespeichert", "good"); reload();
        };
      },
    });
  }
  function jahrgang(birthDate) { return birthDate ? new Date(birthDate).getFullYear() : "—"; }
  const genderLabel = { w: "weiblich", m: "männlich", mix: "gemischt" };
  const typeLabel = { training: "Training", home: "Heimspiel", away: "Auswärtsspiel", other: "Termin" };
  // Eigene Termin-Kategorien: Events speichern die Kategorie-ID im type-Feld
  const eventCats = () => S().eventCategories || [];
  function labelForType(type) {
    if (typeLabel[type]) return typeLabel[type];
    const c = eventCats().find((k) => k.id === type);
    return c ? `${c.emoji ? c.emoji + " " : ""}${c.name}` : "Termin";
  }
  function eventPill(type) {
    const fest = !!typeLabel[type];
    return `<span class="badge pill-type-${fest ? type : "other"}">${esc(labelForType(type))}</span>`;
  }
  // Rückmeldestand eines Termins (👍/❓/👎/offen) – für Dashboard & Co.
  function rsvpStand(e) {
    if (!["training", "home", "away"].includes(e.type)) return "";
    if (e.abgesagt) return `<div class="sub"><span class="badge bad">🚫 abgesagt</span></div>`;
    const aktive = S().players.filter((p) => p.membershipStatus !== "inaktiv").length;
    const z = { yes: 0, no: 0, maybe: 0 };
    let nichtnom = 0;
    S().responses.forEach((r) => {
      if (r.eventId !== e.id) return;
      if (r.status === "x") nichtnom++;
      else if (z[r.status] != null) z[r.status]++;
    });
    const offen = Math.max(0, aktive - z.yes - z.no - z.maybe - nichtnom);
    return `<div class="sub">👍 ${z.yes} · ❓ ${z.maybe} · 👎 ${z.no}${nichtnom ? ` · 🚫 ${nichtnom}` : ""} · ⏳ ${offen} offen</div>`;
  }
  // Auswahl-Optionen (feste Arten + eigene Kategorien) für Termin-Formulare
  function typeOptions(selected) {
    return Object.entries(typeLabel).map(([k, v]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${v}</option>`).join("") +
      eventCats().map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc((c.emoji ? c.emoji + " " : "") + c.name)}</option>`).join("");
  }
  function upcomingEvents(limit) {
    return S().events
      .filter((e) => daysUntil(e.start) >= -1)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, limit || 999);
  }

  /* ======================================================================
     DASHBOARD
     ====================================================================== */
  function dashboard(el) {
    const s = S();
    const openConsents = s.players.filter((p) => !p.consentOnFile).length;
    const openFees = s.finances.filter((f) => f.type === "fee" && !f.paid);
    const openJobs = s.jobs.filter((j) => !j.assignee || !j.done).length;
    const next = upcomingEvents(5);
    const openTasks = s.tasks.filter((t) => !t.done);
    const bdays = birthdaysWithin(30);

    el.innerHTML = `
      ${head("Übersicht", `Willkommen zurück im Trainer-Cockpit des ${esc(s.club)}`)}
      <div class="grid grid-4 mb">
        ${stat("🏐", "Aktive Spieler", s.players.filter((p) => p.membershipStatus !== "inaktiv").length, `${s.players.length} gesamt`, "#/players")}
        ${stat("📅", "Nächste Termine", next.length, next[0] ? `${labelForType(next[0].type)} ${relDays(next[0].start)}` : "—", "#/calendar")}
        ${stat("📝", "Offene Einverständnis.", openConsents, openConsents ? "Bitte einholen" : "alles vollständig", "#/consents")}
        ${stat("💶", "Offene Beiträge", fmtMoney(openFees.reduce((a, f) => a + f.amount, 0)), `${openFees.length} Positionen`, "#/finances")}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3>📆 Anstehende Termine</h3><span class="spacer"></span>
            <a class="btn sm outline" href="#/calendar">Kalender</a></div>
          <div class="timeline">
            ${next.length ? next.map((e) => `
              <div class="tl-item">
                <div class="flex"><strong>${esc(e.title)}</strong> ${eventPill(e.type)}</div>
                <div class="sub soft">${fmtDate(e.start)} · ${fmtTime(e.start)} Uhr · ${esc(e.location)}</div>
                ${rsvpStand(e)}
              </div>`).join("") : empty("🗓️", "Keine anstehenden Termine")}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>✅ Meine Aufgaben</h3><span class="spacer"></span>
            <a class="btn sm outline" href="#/tasks">Alle</a></div>
          <div class="list">
            ${openTasks.length ? openTasks.slice(0, 5).map((t) => `
              <label class="list-item" style="cursor:pointer">
                <input type="checkbox" data-task="${t.id}" style="width:auto">
                <div class="grow"><div class="title">${esc(t.title)}</div>
                <div class="sub">fällig ${relDays(t.due)} · ${prioBadge(t.priority)}</div></div>
              </label>`).join("") : empty("🎉", "Keine offenen Aufgaben")}
          </div>
        </div>
      </div>

      <div class="grid grid-3 mt">
        <div class="card">
          <div class="card-head"><h3>📣 Ankündigungen</h3><span class="spacer"></span>
            <a class="btn sm outline" href="#/announcements">Alle</a></div>
          <div class="list">
            ${s.announcements.slice(0, 3).map((a) => `
              <a class="list-item" href="#/announcements"><div class="grow">
                <div class="title">${esc(a.title)}</div>
                <div class="sub">${fmtDateShort(a.date)}</div></div><span class="arr">›</span></a>`).join("")}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>🎂 Geburtstage (30 Tage)</h3><span class="spacer"></span>
            <a class="btn sm outline" href="#/birthdays">Alle</a></div>
          <div class="list">
            ${bdays.length ? bdays.slice(0, 4).map((b) => `
              <div class="list-item">${avatar(b.firstName, b.lastName, b)}
                <div class="grow"><div class="title">${esc(b.firstName)} ${esc(b.lastName)}</div>
                <div class="sub">${fmtDateShort(b.next)} · wird ${b.turns}</div></div></div>`).join("")
              : empty("🎈", "Keine in den nächsten 30 Tagen")}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>⚠️ Zu erledigen</h3></div>
          <div class="list">
            <a class="list-item" href="#/consents"><div class="grow"><div class="title">${openConsents} offene Einverständnis.</div><div class="sub">Formulare einholen</div></div><span class="arr">›</span></a>
            <a class="list-item" href="#/jobs"><div class="grow"><div class="title">${openJobs} offene Jobs</div><div class="sub">Catering & Helfer</div></div><span class="arr">›</span></a>
            <a class="list-item" href="#/finances"><div class="grow"><div class="title">${openFees.length} offene Beiträge</div><div class="sub">Zahlungen prüfen</div></div><span class="arr">›</span></a>
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card-head"><h3>🔗 Links</h3><span class="spacer"></span>
          <button class="btn sm outline" data-lkadd>＋ Link</button></div>
        <div class="grid grid-2">${linkListHTML()}</div>
      </div>`;

    $$("[data-task]", el).forEach((cb) => cb.addEventListener("change", () => {
      Store.update("tasks", cb.dataset.task, { done: true });
      volleyballFlug();
      toast("Aufgabe erledigt", "good"); reload();
    }));
    bindLinkActions(el);
  }
  function prioBadge(p) {
    const m = { hoch: "bad", mittel: "warn", niedrig: "" };
    return `<span class="badge ${m[p] || ""}">${esc(p)}</span>`;
  }

  /* ======================================================================
     SPIELERVERWALTUNG
     ====================================================================== */
  function players(el) {
    const s = S();
    const filter = players._team || "alle";
    let list = s.players.slice().sort((a, b) => a.lastName.localeCompare(b.lastName));
    if (filter !== "alle") list = list.filter((p) => inDept(p, filter));
    const chips = [`<button class="chip ${filter === "alle" ? "active" : ""}" data-team="alle">alle (${s.players.length})</button>`]
      .concat(s.departments.map((d) => {
        const n = s.players.filter((p) => inDept(p, d.id)).length;
        return `<button class="chip ${filter === d.id ? "active" : ""}" data-team="${d.id}">${esc(d.name)} (${n})</button>`;
      }));

    const wa = waGroupLink();
    el.innerHTML = `
      ${head("Spielerverwaltung", "Kader, Kontaktdaten von Spielern und Eltern",
        `${wa ? `<a class="btn secondary" href="${escUrl(wa.url)}" target="_blank" rel="noopener">💬 WhatsApp-Gruppe</a>` : ""}<button class="btn outline" data-io>⇅ Import / Export</button><button class="btn" data-add>＋ Spieler</button>`)}
      <div class="chip-row mb">${chips.join("")}</div>
      <div class="card" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Nr.</th><th>Mannschaften</th><th>Jg.</th><th>Pass-Nr.</th><th class="wrap">Kontakt (Erstkontakt ⭐)</th><th>Einverst.</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((p) => `
            <tr>
              <td><div class="flex">${avatar(p.firstName, p.lastName, p)}<div><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong><div class="sub soft">${esc(p.position)}</div></div></div></td>
              <td>#${esc(p.jerseyNumber)}</td>
              <td>${playerDeptIds(p).map((id) => `<span class="badge info">${esc(deptName(id))}</span>`).join(" ") || '<span class="badge">—</span>'}</td>
              <td>${jahrgang(p.birthDate)}</td>
              <td class="soft">${esc(p.passNumber || "—")}</td>
              <td class="wrap">${contactCell(p)}</td>
              <td>${p.consentOnFile ? '<span class="badge good">✓</span>' : '<span class="badge bad">fehlt</span>'}</td>
              <td>${statusBadge(p.membershipStatus)}</td>
              <td class="right nowrap">
                <button class="btn sm ghost" data-mail="${p.id}" title="Kontaktieren">✉️</button>
                <button class="btn sm ghost" data-edit="${p.id}">✏️</button>
                <button class="btn sm ghost" data-del="${p.id}">🗑️</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>`;

    $$("[data-team]", el).forEach((c) => c.onclick = () => { players._team = c.dataset.team; reload(); });
    $("[data-add]", el).onclick = () => playerForm();
    $("[data-io]", el).onclick = () => playerIO();
    $$("[data-edit]", el).forEach((b) => b.onclick = () => playerForm(Store.byId("players", b.dataset.edit)));
    $$("[data-del]", el).forEach((b) => b.onclick = () => {
      const p = Store.byId("players", b.dataset.del);
      confirmDialog(`Spieler „${p.firstName} ${p.lastName}“ wirklich löschen?`, () => {
        Store.remove("players", p.id); toast("Spieler gelöscht"); reload();
      });
    });
    $$("[data-mail]", el).forEach((b) => b.onclick = () => contactParent(Store.byId("players", b.dataset.mail)));
  }

  // Kontaktzelle: Spieler + Eltern 1/2, Erstkontakt mit ⭐ markiert.
  // E-Mail und Telefon sind direkt klickbar (mailto:/tel: – öffnet Standardprogramm des Geräts)
  const prefLabel = { player: "Spieler", parents: "Eltern", both: "Spieler + Eltern" };
  function mailtoLink(email) { return email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ""; }
  function telLink(phone) { return phone ? `<a href="tel:${esc(String(phone).replace(/[^+\d]/g, ""))}">${esc(phone)}</a>` : ""; }
  function contactLine(email, phone) {
    return [mailtoLink(email), telLink(phone)].filter(Boolean).join(" · ");
  }
  function contactCell(p) {
    const starP = p.contactPreference === "player" || p.contactPreference === "both";
    const starE = p.contactPreference === "parents" || p.contactPreference === "both";
    const rows = [];
    if (p.playerPhone || p.playerEmail) {
      rows.push(`<div>${starP ? "⭐ " : ""}<strong>Spieler:</strong> <span class="soft">${contactLine(p.playerEmail, p.playerPhone)}</span></div>`);
    }
    if (p.parentName || p.parentEmail || p.parentPhone) {
      rows.push(`<div>${starE ? "⭐ " : ""}<strong>${esc(p.parentName || "Eltern")}:</strong> <span class="soft">${contactLine(p.parentEmail, p.parentPhone)}</span></div>`);
    }
    if (p.parent2Name || p.parent2Email || p.parent2Phone) {
      rows.push(`<div>${starE ? "⭐ " : ""}<strong>${esc(p.parent2Name || "Elternteil 2")}:</strong> <span class="soft">${contactLine(p.parent2Email, p.parent2Phone)}</span></div>`);
    }
    return rows.join("") || '<span class="muted">keine Kontaktdaten</span>';
  }

  // Hinterlegter WhatsApp-Gruppenlink (aus der Link-Sammlung)
  function waGroupLink() {
    return S().links.find((l) => /chat\.whatsapp\.com|wa\.me/.test(l.url || "")) || null;
  }

  /* ---------- Import / Export Spielerdaten ---------- */
  const PLAYER_CSV_FIELDS = ["firstName", "lastName", "birthDate", "gender", "position", "jerseyNumber", "team", "departmentId", "passNumber",
    "playerPhone", "playerEmail", "contactPreference", "parentName", "parentEmail", "parentPhone",
    "parent2Name", "parent2Email", "parent2Phone", "membershipStatus", "notes"];
  function playerIO() {
    modal({
      title: "Spielerdaten importieren / exportieren",
      body: `
        <h3 style="font-size:.95rem">⬇️ Export</h3>
        <p class="soft" style="font-size:.85rem;margin-top:0">Exportiert alle ${S().players.length} Spieler.</p>
        <div class="flex flex-wrap mb">
          <button class="btn sm outline" data-ex="csv">CSV (Excel)</button>
          <button class="btn sm outline" data-ex="json">JSON</button>
          <button class="btn sm outline" data-ex="vcf">vCard (Kontakte)</button>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3 style="font-size:.95rem">⬆️ Import (CSV oder JSON)</h3>
        <p class="soft" style="font-size:.85rem;margin-top:0">CSV mit Semikolon oder Komma; Spaltennamen wie im Export
        (mind. <code>firstName</code>, <code>lastName</code>). Bestehende Spieler werden über Passnummer bzw.
        Name+Geburtsdatum erkannt und aktualisiert, neue werden angelegt.</p>
        <p class="soft" style="font-size:.85rem"><strong>🏐 SAMS-Mannschaftsliste (VVMV):</strong> Der CSV-Export von
        <code>vvmv.sams-server.de</code> („Mannschaftsliste") wird automatisch erkannt – inkl. Umlaut-Kodierung.
        Ideal für den Kader-Import <strong>einmal pro Saison</strong>; danach werden vorhandene Spieler nur aktualisiert.</p>
        <div class="flex flex-wrap">
          <button class="btn sm" data-im>📂 Datei wählen (CSV/JSON)</button>
          <button class="btn sm ghost" data-tpl>Vorlage herunterladen</button>
        </div>
        <div id="ioResult" class="mt"></div>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const stamp = new Date().toISOString().slice(0, 10);
        m.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => {
          const ps = S().players;
          if (b.dataset.ex === "csv") IO.download(`skv-spieler-${stamp}.csv`, IO.toCSV(PLAYER_CSV_FIELDS, ps.map((p) => ({ ...p, departmentId: playerDeptNames(p) }))), "text/csv");
          if (b.dataset.ex === "json") IO.download(`skv-spieler-${stamp}.json`, JSON.stringify(ps, null, 2), "application/json");
          if (b.dataset.ex === "vcf") IO.download(`skv-spieler-${stamp}.vcf`, IO.toVCard(ps, deptName), "text/vcard");
          toast("Export erstellt", "good");
        });
        m.querySelector("[data-tpl]").onclick = () => {
          IO.download("skv-spieler-vorlage.csv", IO.toCSV(PLAYER_CSV_FIELDS, [{
            firstName: "Max", lastName: "Muster", birthDate: "2010-05-01", gender: "m", position: "Außenangriff",
            jerseyNumber: 5, team: "U16", departmentId: "männliche U16", passNumber: "",
            playerPhone: "", playerEmail: "", contactPreference: "parents",
            parentName: "Erika Muster", parentEmail: "erika@example.de", parentPhone: "0170 0000000",
            parent2Name: "", parent2Email: "", parent2Phone: "", membershipStatus: "aktiv", notes: "",
          }]), "text/csv");
        };
        m.querySelector("[data-im]").onclick = async () => {
          const f = await IO.pickFile(".csv,.json,text/csv,application/json");
          if (!f) return;
          let rows;
          try {
            rows = f.name.toLowerCase().endsWith(".json") || f.text.trim().startsWith("[")
              ? JSON.parse(f.text) : IO.parseCSV(f.text);
          } catch (err) { m.querySelector("#ioResult").innerHTML = `<span class="badge bad">Fehler: ${esc(err.message)}</span>`; return; }
          const res = importPlayers(rows);
          m.querySelector("#ioResult").innerHTML =
            `<span class="badge good">✓ ${res.added} neu</span> <span class="badge info">${res.updated} aktualisiert</span>` +
            (res.skipped ? ` <span class="badge warn">${res.skipped} übersprungen (kein Name)</span>` : "");
          toast(`Import: ${res.added} neu, ${res.updated} aktualisiert`, "good");
          App.reload();
        };
      },
    });
  }
  // SAMS-Mannschaftsliste (vvmv.sams-server.de) → interne Felder übersetzen
  function normalizeSamsRow(r) {
    if (r.firstName || r.lastName || (!r.Nachname && !r.Vorname)) return r; // kein SAMS-Format
    const out = { firstName: r.Vorname || "", lastName: r.Nachname || "" };
    const g = (r.Geschlecht || "").toLowerCase();
    if (g.startsWith("m")) out.gender = "m"; else if (g.startsWith("w")) out.gender = "w";
    if (r.Trikot) out.jerseyNumber = r.Trikot;
    if (r["Position/Funktion Offizieller"]) out.position = r["Position/Funktion Offizieller"];
    const notes = [];
    if (r["Größe"]) notes.push(`Größe: ${r["Größe"]} cm`);
    if (r.Titel) notes.push(`Titel: ${r.Titel}`);
    if (r.spielberechtigt) notes.push(`spielberechtigt (SAMS): ${r.spielberechtigt}`);
    if (notes.length) out.notes = notes.join(" · ");
    return out;
  }
  function importPlayers(rows) {
    const s = S();
    const byDeptName = {}; s.departments.forEach((d) => { byDeptName[d.name.toLowerCase()] = d.id; byDeptName[(d.code || "").toLowerCase()] = d.id; });
    let added = 0, updated = 0, skipped = 0;
    rows.map(normalizeSamsRow).forEach((r) => {
      if (!r || !(r.firstName || "").trim() || !(r.lastName || "").trim()) { skipped++; return; }
      const data = {};
      PLAYER_CSV_FIELDS.forEach((k) => { if (r[k] != null && r[k] !== "") data[k] = r[k]; });
      if (data.jerseyNumber != null) data.jerseyNumber = Number(data.jerseyNumber) || "";
      // Abteilung: ID direkt oder über Namen/Code auflösen
      if (data.departmentId && !s.departments.some((d) => d.id === data.departmentId)) {
        data.departmentId = byDeptName[String(data.departmentId).toLowerCase()] || null;
      }
      if (!["player", "parents", "both"].includes(data.contactPreference)) delete data.contactPreference;
      const ex = s.players.find((p) =>
        (data.passNumber && p.passNumber && p.passNumber === data.passNumber) ||
        (p.firstName.toLowerCase() === data.firstName.toLowerCase() && p.lastName.toLowerCase() === data.lastName.toLowerCase() &&
          (!data.birthDate || !p.birthDate || p.birthDate === data.birthDate)));
      if (ex) { Store.update("players", ex.id, data); updated++; }
      else {
        Store.add("players", Object.assign({
          position: "Außenangriff", jerseyNumber: "", team: "", departmentId: null, gender: "m", passNumber: "",
          playerPhone: "", playerEmail: "", contactPreference: "parents",
          parentName: "", parentEmail: "", parentPhone: "", parent2Name: "", parent2Email: "", parent2Phone: "",
          consentOnFile: false, membershipStatus: "aktiv", notes: "", birthDate: "",
        }, data));
        added++;
      }
    });
    return { added, updated, skipped };
  }

  function statusBadge(st) {
    if (st === "aktiv") return '<span class="badge good">aktiv</span>';
    if (st === "beitragsrückstand") return '<span class="badge warn">Rückstand</span>';
    if (st === "inaktiv") return '<span class="badge">inaktiv</span>';
    return `<span class="badge">${esc(st)}</span>`;
  }

  function playerForm(p) {
    const isEdit = !!p;
    const deps = S().departments;
    p = p || { firstName: "", lastName: "", birthDate: "", position: "Außenangriff", jerseyNumber: "", team: "U18", departmentId: (deps[0] || {}).id || null, gender: "m", passNumber: "",
      playerPhone: "", playerEmail: "", contactPreference: "parents",
      parentName: "", parentEmail: "", parentPhone: "", parent2Name: "", parent2Email: "", parent2Phone: "",
      membershipStatus: "aktiv", consentOnFile: false, notes: "" };
    const positions = ["Zuspiel", "Außenangriff", "Mitte", "Diagonal", "Libero"];
    const sect = (t) => `<div class="field full" style="margin-top:6px"><strong style="color:var(--primary)">${t}</strong></div>`;
    modal({
      title: isEdit ? "Spieler bearbeiten" : "Neuer Spieler",
      wide: true,
      body: `<form id="pf"><div class="form-grid">
        ${sect("🏐 Stammdaten")}
        <div class="field"><label>Vorname</label><input name="firstName" value="${esc(p.firstName)}" required></div>
        <div class="field"><label>Nachname</label><input name="lastName" value="${esc(p.lastName)}" required></div>
        <div class="field"><label>Geburtsdatum</label><input type="date" name="birthDate" value="${esc(p.birthDate)}" required></div>
        <div class="field"><label>Trikotnummer</label><input type="number" name="jerseyNumber" value="${esc(p.jerseyNumber)}"></div>
        <div class="field"><label>Position</label><select name="position">${positions.map((x) => `<option ${x === p.position ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>Mannschaften <span class="soft" style="font-weight:400">(Mehrfachauswahl möglich)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:10px 14px;padding:8px 2px">
          ${deps.map((d) => `<label style="font-weight:400;display:flex;align-items:center;gap:6px;font-size:.88rem">
            <input type="checkbox" name="dp_${d.id}" ${playerDeptIds(p).includes(d.id) ? "checked" : ""} style="width:auto"> ${esc(d.name)}</label>`).join("")}
          </div></div>
        <div class="field"><label>Geschlecht</label><select name="gender">
          ${Object.entries(genderLabel).map(([k, v]) => `<option value="${k}" ${k === p.gender ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>Passnummer (Verband)</label><input name="passNumber" value="${esc(p.passNumber || "")}" placeholder="z. B. MV202512345"></div>
        <div class="field"><label>Status</label><select name="membershipStatus">
          ${["aktiv", "beitragsrückstand", "inaktiv"].map((x) => `<option ${x === p.membershipStatus ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>⭐ Erstkontakt (wer wird zuerst angeschrieben?)</label><select name="contactPreference">
          ${Object.entries(prefLabel).map(([k, v]) => `<option value="${k}" ${k === p.contactPreference ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        ${sect("📱 Kontakt Spieler")}
        <div class="field"><label>Telefon Spieler</label><input name="playerPhone" value="${esc(p.playerPhone || "")}" placeholder="Handy des Spielers"></div>
        <div class="field"><label>E-Mail Spieler</label><input type="email" name="playerEmail" value="${esc(p.playerEmail || "")}"></div>
        ${sect("👪 Elternteil 1")}
        <div class="field"><label>Name</label><input name="parentName" value="${esc(p.parentName)}"></div>
        <div class="field"><label>Telefon</label><input name="parentPhone" value="${esc(p.parentPhone)}"></div>
        <div class="field full"><label>E-Mail</label><input type="email" name="parentEmail" value="${esc(p.parentEmail)}"></div>
        ${sect("👪 Elternteil 2 <span class='soft' style='font-weight:400'>(optional, z. B. bei getrennten Eltern)</span>")}
        <div class="field"><label>Name</label><input name="parent2Name" value="${esc(p.parent2Name || "")}"></div>
        <div class="field"><label>Telefon</label><input name="parent2Phone" value="${esc(p.parent2Phone || "")}"></div>
        <div class="field full"><label>E-Mail</label><input type="email" name="parent2Email" value="${esc(p.parent2Email || "")}"></div>
        ${sect("📝 Sonstiges")}
        <div class="field full"><label>Notizen</label><textarea name="notes">${esc(p.notes)}</textarea></div>
        <div class="field full"><label><input type="checkbox" name="consentOnFile" ${p.consentOnFile ? "checked" : ""} style="width:auto"> Einverständniserklärung liegt vor</label></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#pf");
          if (!f.reportValidity()) return;
          const data = formData(f);
          data.jerseyNumber = Number(data.jerseyNumber) || "";
          // Mannschafts-Mehrfachauswahl einsammeln (dp_<id>-Checkboxen)
          data.departmentIds = Object.keys(data).filter((k) => k.startsWith("dp_") && data[k]).map((k) => k.slice(3));
          Object.keys(data).forEach((k) => { if (k.startsWith("dp_")) delete data[k]; });
          data.departmentId = data.departmentIds[0] || null;
          if (isEdit) Store.update("players", p.id, data);
          else Store.add("players", data);
          closeModal(); toast(isEdit ? "Gespeichert" : "Spieler angelegt", "good"); reload();
        };
      },
    });
  }

  function contactParent(p) {
    // Empfängerliste mit Vorauswahl nach Erstkontakt-Einstellung
    const recips = [];
    const preferP = p.contactPreference === "player" || p.contactPreference === "both";
    const preferE = p.contactPreference === "parents" || p.contactPreference === "both";
    if (p.playerEmail || p.playerPhone) recips.push({ key: "player", label: `Spieler (${p.firstName})`, email: p.playerEmail, phone: p.playerPhone, star: preferP, checked: preferP });
    if (p.parentName || p.parentEmail || p.parentPhone) recips.push({ key: "p1", label: p.parentName || "Elternteil 1", email: p.parentEmail, phone: p.parentPhone, star: preferE, checked: preferE });
    if (p.parent2Name || p.parent2Email || p.parent2Phone) recips.push({ key: "p2", label: p.parent2Name || "Elternteil 2", email: p.parent2Email, phone: p.parent2Phone, star: preferE, checked: preferE });
    modal({
      title: `Kontaktieren – ${esc(p.firstName)} ${esc(p.lastName)}`,
      body: `
        <p class="soft" style="margin-top:0;font-size:.85rem">Erstkontakt laut Einstellung: <strong>${prefLabel[p.contactPreference] || "Eltern"}</strong> ⭐</p>
        <div class="list mb">
          ${recips.length ? recips.map((r) => `
            <label class="list-item" style="cursor:pointer;padding:10px 12px">
              <input type="checkbox" data-rc="${r.key}" ${r.checked ? "checked" : ""} style="width:auto">
              <div class="grow"><div class="title">${r.star ? "⭐ " : ""}${esc(r.label)}</div>
                <div class="sub">${contactLine(r.email, r.phone)}</div></div>
            </label>`).join("") : '<div class="muted">Keine Kontaktdaten hinterlegt.</div>'}
        </div>
        ${(() => { const wa = waGroupLink(); return wa ? `<a class="btn sm secondary mb" href="${escUrl(wa.url)}" target="_blank" rel="noopener">💬 WhatsApp-Gruppe öffnen</a>` : ""; })()}
        <form id="cf"><div class="field"><label>Betreff</label><input name="subject" value="SKV Müritz – Info zu ${esc(p.firstName)}"></div>
        <div class="field mt"><label>Nachricht</label><textarea name="msg" rows="5">Hallo,\n\n</textarea></div></form>`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn" data-send>E-Mail öffnen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-send]").onclick = () => {
          const picked = Array.from(m.querySelectorAll("[data-rc]:checked")).map((c) => c.dataset.rc);
          const emails = recips.filter((r) => picked.includes(r.key) && r.email).map((r) => r.email);
          if (!emails.length) { toast("Kein Empfänger mit E-Mail ausgewählt", "bad"); return; }
          const d = formData(m.querySelector("#cf"));
          const href = `mailto:${encodeURIComponent(emails.join(","))}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.msg)}`;
          window.location.href = href;
          closeModal(); toast("E-Mail-Programm geöffnet");
        };
      },
    });
  }

  /* ======================================================================
     KALENDER
     ====================================================================== */
  // Fällt ein Datum in schulfreie Tage? → Name oder null
  function holidayFor(date) {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const h = S().holidays.find((x) => x.start <= iso && iso <= x.end);
    return h ? h.name : null;
  }

  function calendar(el) {
    const mode = calendar._mode || "month";
    const cur = calendar._month ? new Date(calendar._month) : new Date();
    cur.setDate(1);
    const y = cur.getFullYear(), mo = cur.getMonth();
    const today = new Date();
    const dows = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    // ---------- Monatsansicht ----------
    function monthHTML() {
      const startDow = (new Date(y, mo, 1).getDay() + 6) % 7; // Montag=0
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      const evByDay = {};
      S().events.forEach((e) => {
        const d = new Date(e.start);
        if (d.getFullYear() === y && d.getMonth() === mo) {
          const k = d.getDate(); (evByDay[k] = evByDay[k] || []).push(e);
        }
      });
      const cells = [];
      for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-cell other"></div>`);
      for (let day = 1; day <= daysInMonth; day++) {
        const dt = new Date(y, mo, day);
        const isToday = today.getFullYear() === y && today.getMonth() === mo && today.getDate() === day;
        const hol = holidayFor(dt);
        const evs = (evByDay[day] || []).sort((a, b) => new Date(a.start) - new Date(b.start));
        cells.push(`<div class="cal-cell ${isToday ? "today" : ""} ${hol ? "holiday" : ""}" ${hol ? `title="${esc(hol)}"` : ""}>
          <span class="cal-daynum">${day}${hol ? ' <span class="hol-dot" title="' + esc(hol) + '">🏖</span>' : ""}</span>
          ${evs.map((e) => `<div class="cal-ev pill-type-${e.type}" data-ev="${e.id}" title="${esc(e.title)}">${fmtTime(e.start)} ${esc(e.title)}</div>`).join("")}
        </div>`);
      }
      return `
        <div class="cal-head">
          <button class="btn sm outline" data-prev>‹</button>
          <strong style="font-size:1.05rem">${MON[mo]} ${y}</strong>
          <button class="btn sm outline" data-next>›</button>
          <span class="spacer"></span>
          <button class="btn sm ghost" data-today>Heute</button>
        </div>
        <div class="cal-grid">${dows.map((d) => `<div class="cal-dow">${d}</div>`).join("")}${cells.join("")}</div>
        <div class="chip-row mt">
          <span class="chip pill-type-training">Training</span>
          <span class="chip pill-type-home">Heimspiel</span>
          <span class="chip pill-type-away">Auswärts</span>
          <span class="chip pill-type-other">Sonstiges</span>
          ${eventCats().map((c) => `<span class="chip pill-type-other">${esc((c.emoji ? c.emoji + " " : "") + c.name)}</span>`).join("")}
          <span class="chip" style="background:color-mix(in srgb,#f59e0b 18%,transparent)">🏖 schulfrei (MV)</span>
        </div>`;
    }

    // ---------- Jahresansicht ----------
    function yearHTML() {
      const evDays = new Set();
      S().events.forEach((e) => {
        const d = new Date(e.start);
        if (d.getFullYear() === y) evDays.add(d.getMonth() * 100 + d.getDate());
      });
      const minis = Array.from({ length: 12 }, (_, m) => {
        const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
        const dim = new Date(y, m + 1, 0).getDate();
        let cells = "";
        for (let i = 0; i < startDow; i++) cells += `<span></span>`;
        for (let d = 1; d <= dim; d++) {
          const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
          const hasEv = evDays.has(m * 100 + d);
          const hol = holidayFor(new Date(y, m, d));
          cells += `<span class="${isToday ? "mini-today" : ""} ${hol ? "mini-hol" : ""}">${d}${hasEv ? '<i class="mini-dot"></i>' : ""}</span>`;
        }
        return `<div class="mini-cal" data-month="${m}" title="Zur Monatsansicht">
          <div class="mini-title">${MON[m]}</div>
          <div class="mini-grid">${["M","D","M","D","F","S","S"].map((x) => `<b>${x}</b>`).join("")}${cells}</div>
        </div>`;
      }).join("");
      return `
        <div class="cal-head">
          <button class="btn sm outline" data-prev>‹</button>
          <strong style="font-size:1.05rem">Jahr ${y}</strong>
          <button class="btn sm outline" data-next>›</button>
          <span class="spacer"></span>
          <button class="btn sm ghost" data-today>Heute</button>
        </div>
        <div class="year-grid">${minis}</div>
        <p class="muted" style="font-size:.78rem;margin-bottom:0">● Termin · <span style="background:color-mix(in srgb,#f59e0b 25%,transparent);padding:0 4px;border-radius:4px">Tag</span> schulfrei · Monat antippen für Details</p>`;
    }

    // ---------- Listenansicht ----------
    function listHTML() {
      const showPast = !!calendar._showPast;
      let evs = S().events.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
      if (!showPast) evs = evs.filter((e) => daysUntil(e.start) >= 0);
      let lastKey = "";
      const rows = evs.map((e) => {
        const d = new Date(e.start);
        const st2 = sportstaetteZuOrt(e.location);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const headRow = key !== lastKey ? `<div class="list-month">${MON[d.getMonth()]} ${d.getFullYear()}</div>` : "";
        lastKey = key;
        const hol = holidayFor(d);
        return `${headRow}
          <div class="list-item">
            <div class="cal-list-date" data-ev="${e.id}" style="cursor:pointer"><strong>${d.getDate()}.</strong><span>${DOW[d.getDay()]}</span></div>
            <div class="grow" data-ev="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)} ${e.abgesagt ? '<span class="badge bad">🚫 abgesagt</span>' : ""}${e.seriesId ? '<span class="badge">🔁 Serie</span>' : ""}${hol ? ' <span class="badge warn">🏖 schulfrei</span>' : ""}</div>
            <div class="sub">${fmtTime(e.start)} Uhr · ${st2
              ? `<a href="#" data-stort="${st2.id}" title="Sportstätte anzeigen">🏟️ ${esc(e.location)}</a>`
              : esc(e.location || "—")}${e.trainerName ? ` · 👤 ${esc(e.trainerName)}` : ""}</div></div>
            <select class="ev-type" data-evtype="${e.id}" title="Art des Termins ändern" style="width:auto;font-size:.78rem;padding:5px 6px">
              ${typeOptions(e.type)}
            </select></div>`;
      }).join("");
      return `
        <div class="cal-head">
          <strong style="font-size:1.05rem">Terminliste</strong>
          <span class="spacer"></span>
          <label class="soft" style="font-size:.82rem;display:flex;align-items:center;gap:6px">
            <input type="checkbox" data-past ${showPast ? "checked" : ""} style="width:auto"> Vergangene anzeigen</label>
        </div>
        <div class="list">${rows || empty("🗓️", "Keine Termine")}</div>`;
    }

    const feeds = S().calendarFeeds;
    const hols = S().holidays.slice().sort((a, b) => a.start.localeCompare(b.start));
    const upcoming = upcomingEvents(8);
    const bodyHTML = mode === "year" ? yearHTML() : mode === "list" ? listHTML() : monthHTML();

    el.innerHTML = `
      ${head("Kalender", "Alle Trainings und Spieltage auf einen Blick",
        `<button class="btn outline" data-orte>🏟️ Sportstätten</button><button class="btn outline" data-cats>🏷️ Kategorien</button><button class="btn outline" data-import>⬇️ Termine importieren</button><button class="btn" data-add>＋ Termin</button>`)}
      <div class="tabs">
        ${[["month", "📅 Monat"], ["year", "🗓️ Jahr"], ["list", "📋 Liste"]].map(([k, l]) =>
          `<button class="tab ${mode === k ? "active" : ""}" data-mode="${k}">${l}</button>`).join("")}
      </div>
      <div class="grid cols-side">
        <div class="card">${bodyHTML}</div>
        <div>
          <div class="card mb">
            <div class="card-head"><h3>Nächste Termine</h3></div>
            <div class="list">
              ${upcoming.map((e) => `
                <div class="list-item" data-ev="${e.id}" style="cursor:pointer">
                  <div class="grow"><div class="title">${esc(e.title)} ${eventPill(e.type)}</div>
                  <div class="sub">${fmtDateShort(e.start)} · ${fmtTime(e.start)} Uhr · ${esc(e.location)}</div></div></div>`).join("")}
            </div>
          </div>
          <div class="card mb">
            <div class="card-head"><h3>🔄 Kalender-Abos</h3><span class="spacer"></span>
              <button class="btn sm outline" data-sync title="Alle Abos jetzt abrufen">↻</button></div>
            <div class="list">
              ${feeds.length ? feeds.map((f) => `
                <div class="list-item" style="padding:10px">
                  <div class="grow"><div class="title" style="font-size:.86rem">${esc(f.name)}</div>
                    <div class="sub">${f.type === "rss" ? "RSS-Feed" : "iCal"} · ${f.autoSync ? "🟢 automatisch" : "⚪ manuell"}${f.lastSync ? ` · zuletzt ${fmtDateShort(f.lastSync)}` : ""}</div></div>
                  <button class="btn sm ghost" data-ftoggle="${f.id}" title="Automatik umschalten">${f.autoSync ? "⏸" : "▶"}</button>
                  <button class="btn sm ghost" data-fdel="${f.id}">🗑️</button>
                </div>`).join("") : `<div class="muted" style="font-size:.85rem">Keine Abos – über „Termine importieren" anlegen.</div>`}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>🏖 Schulfrei (MV)</h3><span class="spacer"></span>
              <button class="btn sm outline" data-hsync title="Ferien-Abo: jetzt aktualisieren">↻</button>
              <button class="btn sm outline" data-hadd>＋</button></div>
            <div class="list" style="max-height:280px;overflow-y:auto">
              ${hols.length ? hols.map((h) => `
                <div class="list-item" style="padding:8px 10px">
                  <div class="grow"><div class="title" style="font-size:.84rem">${esc(h.name)}</div>
                    <div class="sub">${fmtDateShort(h.start)}${h.end !== h.start ? " – " + fmtDateShort(h.end) : ""}</div></div>
                  <button class="btn sm ghost" data-hedit="${h.id}">✏️</button>
                  <button class="btn sm ghost" data-hdel="${h.id}">🗑️</button>
                </div>`).join("") : `<div class="muted" style="font-size:.85rem">Keine Einträge</div>`}
            </div>
            <p class="muted" style="font-size:.74rem;margin:8px 0 0">📡 <strong>Ferien-Abo:</strong> aktualisiert sich automatisch beim App-Start
            über die OpenHolidays-API (offizielle Ferientermine MV) – oder per ↻. Eigene Einträge bleiben erhalten.
            Offizielle Quelle: <a href="https://www.regierung-mv.de/Landesregierung/bm/Schule/Schulorganisation/Ferientermine/" target="_blank" rel="noopener">Ferientermine MV (Bildungsministerium) ↗</a></p>
          </div>
        </div>
      </div>`;

    const step = mode === "year" ? 12 : 1;
    if ($("[data-prev]", el)) $("[data-prev]", el).onclick = () => { calendar._month = new Date(y, mo - step, 1).toISOString(); reload(); };
    if ($("[data-next]", el)) $("[data-next]", el).onclick = () => { calendar._month = new Date(y, mo + step, 1).toISOString(); reload(); };
    if ($("[data-today]", el)) $("[data-today]", el).onclick = () => { calendar._month = null; reload(); };
    if ($("[data-past]", el)) $("[data-past]", el).onchange = (e2) => { calendar._showPast = e2.target.checked; reload(); };
    $$("[data-mode]", el).forEach((b) => b.onclick = () => { calendar._mode = b.dataset.mode; reload(); });
    $$(".mini-cal", el).forEach((mc) => mc.onclick = () => {
      calendar._month = new Date(y, +mc.dataset.month, 1).toISOString();
      calendar._mode = "month"; reload();
    });
    $("[data-hsync]", el).onclick = async () => {
      toast("Ferientermine werden abgerufen …");
      try {
        const r = await IO.syncHolidaysMV();
        toast(`✓ ${r.count} Ferien-/Feiertagseinträge aktualisiert`, "good"); reload();
      } catch (err) {
        toast("Abruf fehlgeschlagen (offline?) – vorhandene Termine bleiben", "bad");
      }
    };
    $("[data-hadd]", el).onclick = () => holidayForm();
    $$("[data-hedit]", el).forEach((b) => b.onclick = () => holidayForm(Store.byId("holidays", b.dataset.hedit)));
    $$("[data-hdel]", el).forEach((b) => b.onclick = () => confirmDialog("Eintrag löschen?", () => {
      Store.remove("holidays", b.dataset.hdel); toast("Gelöscht"); reload();
    }));
    $("[data-add]", el).onclick = () => eventForm();
    $("[data-import]", el).onclick = () => calendarImport();
    $("[data-cats]", el).onclick = () => eventCategoriesModal();
    $("[data-orte]", el).onclick = () => sportstaettenModal();
    $("[data-sync]", el).onclick = async () => {
      toast("Abos werden abgerufen …");
      const r = await IO.syncAllFeeds();
      S().calendarFeeds.forEach((f) => { if (f.autoSync) Store.update("calendarFeeds", f.id, { lastSync: new Date().toISOString() }); });
      toast(`Synchronisiert: ${r.added} neue Termine${r.errors ? `, ${r.errors} Feed(s) nicht erreichbar` : ""}`, r.errors ? "bad" : "good");
      reload();
    };
    $$("[data-ftoggle]", el).forEach((b) => b.onclick = () => {
      const f = Store.byId("calendarFeeds", b.dataset.ftoggle);
      Store.update("calendarFeeds", f.id, { autoSync: !f.autoSync }); reload();
    });
    $$("[data-fdel]", el).forEach((b) => b.onclick = () => confirmDialog("Abo entfernen? Bereits importierte Termine bleiben erhalten.", () => {
      Store.remove("calendarFeeds", b.dataset.fdel); toast("Abo entfernt"); reload();
    }));
    $$("[data-ev]", el).forEach((n) => n.onclick = () => eventDetail(n.dataset.ev));
    $$("[data-stort]", el).forEach((a) => a.onclick = (ev2) => {
      ev2.preventDefault(); ev2.stopPropagation();
      const st2 = Store.byId("sportstaetten", a.dataset.stort);
      if (st2) sportstaetteInfoModal(st2);
    });
    $$("[data-evtype]", el).forEach((sel) => sel.onchange = () => {
      Store.update("events", sel.dataset.evtype, { type: sel.value, reGuessed: true });
      toast("Termin-Art geändert", "good"); reload();
    });
  }

  /* ---------- Termin-Import (iCal / Google Kalender / RSS) ---------- */
  function calendarImport() {
    modal({
      title: "Termine importieren",
      wide: true,
      body: `
        <h3 style="font-size:.95rem">📂 Aus Datei (.ics)</h3>
        <p class="soft" style="font-size:.85rem;margin-top:0">iCal-Export z. B. aus Apple Kalender, Outlook oder
        <strong>Google Kalender</strong> (dort: Einstellungen → „Exportieren" → .ics-Datei).</p>
        <button class="btn sm mb" data-file>📂 .ics-Datei wählen</button>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">

        <h3 style="font-size:.95rem">🔗 Von URL (iCal-Adresse oder RSS-Feed)</h3>
        <p class="soft" style="font-size:.85rem;margin-top:0">Google Kalender: Einstellungen des Kalenders →
        „Kalender integrieren" → <em>„Geheime Adresse im iCal-Format"</em> kopieren und hier einfügen.
        RSS-Feeds (z. B. Vereins-News mit Terminen) funktionieren ebenso.</p>
        <div class="form-grid">
          <div class="field full"><label>URL</label><input id="feedUrl" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"></div>
          <div class="field"><label>Format</label><select id="feedType"><option value="ical">iCal (.ics)</option><option value="rss">RSS/Atom-Feed</option></select></div>
          <div class="field"><label>Name (für Abo)</label><input id="feedName" placeholder="z. B. Hallenbelegung"></div>
          <div class="field full"><label><input type="checkbox" id="feedAuto" checked style="width:auto">
            Als Abo speichern und <strong>automatisch synchronisieren</strong> (bei jedem App-Start und per ↻)</label></div>
        </div>
        <button class="btn sm mt" data-url>⬇️ Von URL importieren</button>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">

        <h3 style="font-size:.95rem">📋 Text einfügen</h3>
        <p class="soft" style="font-size:.85rem;margin-top:0">Falls eine URL wegen Browser-Sicherheit (CORS) nicht
        abrufbar ist: Inhalt der .ics-/Feed-Datei einfach hier einfügen.</p>
        <textarea id="pasteBox" rows="4" placeholder="BEGIN:VCALENDAR …"></textarea>
        <button class="btn sm mt" data-paste>⬇️ Aus Text importieren</button>
        <div id="calImpResult" class="mt"></div>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const showResult = (added, note) => {
          m.querySelector("#calImpResult").innerHTML =
            `<span class="badge good">✓ ${added} neue Termine importiert</span>${note ? ` <span class="badge">${esc(note)}</span>` : ""}`;
          toast(`${added} Termine importiert`, "good"); App.reload();
        };
        const showError = (err) => {
          m.querySelector("#calImpResult").innerHTML = `<span class="badge bad">Fehler: ${esc(err.message || err)}</span>`;
        };
        m.querySelector("[data-file]").onclick = async () => {
          const f = await IO.pickFile(".ics,text/calendar");
          if (!f) return;
          try { showResult(IO.mergeEvents(IO.parseICS(f.text))); } catch (e) { showError(e); }
        };
        m.querySelector("[data-paste]").onclick = () => {
          const text = m.querySelector("#pasteBox").value.trim();
          if (!text) { showError(new Error("Kein Text eingefügt")); return; }
          try {
            const list = text.includes("BEGIN:VCALENDAR") || text.includes("BEGIN:VEVENT") ? IO.parseICS(text) : IO.parseFeed(text);
            showResult(IO.mergeEvents(list));
          } catch (e) { showError(e); }
        };
        m.querySelector("[data-url]").onclick = async () => {
          const url = m.querySelector("#feedUrl").value.trim();
          const type = m.querySelector("#feedType").value;
          const name = m.querySelector("#feedName").value.trim() || url.slice(0, 40);
          const auto = m.querySelector("#feedAuto").checked;
          if (!url) { showError(new Error("Bitte URL eingeben")); return; }
          try {
            const text = await IO.fetchText(url);
            const added = IO.mergeEvents(IO.parseByType(type, text));
            if (auto) {
              Store.add("calendarFeeds", { name, url, type, autoSync: true, lastSync: new Date().toISOString(), lastResult: "ok" });
              showResult(added, "Abo gespeichert – wird automatisch aktualisiert");
            } else showResult(added);
          } catch (e) {
            showError(new Error("URL nicht abrufbar (evtl. CORS-Sperre des Anbieters). Tipp: Datei herunterladen und über „.ics-Datei wählen“ importieren, oder Inhalt unten als Text einfügen."));
          }
        };
      },
    });
  }

  function eventDetail(id) {
    const e = Store.byId("events", id);
    if (!e) return;
    const responses = S().responses.filter((r) => r.eventId === id);
    const drivers = S().drivers.filter((d) => d.eventId === id);
    const jobs = S().jobs.filter((j) => j.eventId === id);
    const st2 = sportstaetteZuOrt(e.location);
    modal({
      title: e.title,
      wide: true,
      body: `
        <div class="flex flex-wrap mb">${eventPill(e.type)}<span class="badge">${fmtDateTime(e.start)}</span><span class="badge">bis ${fmtTime(e.end)} Uhr</span></div>
        ${st2 && st2.bild
          ? `<img src="${st2.bild}" alt="${esc(st2.name)}" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin-bottom:10px">` : ""}
        <dl class="kv mb">
          <dt>Ort</dt><dd>${st2
            ? `<a href="#" data-stlink="${st2.id}">🏟️ ${esc(e.location)}</a>${st2.ansprechpartner ? `<br><span class="soft">👤 ${esc(st2.ansprechpartner)}</span>` : ""}${st2.heimmannschaft ? `<br><span class="soft">Heim: ${esc(st2.heimmannschaft)}</span>` : ""}` : esc(e.location)}</dd>
          ${e.opponent ? `<dt>Gegner</dt><dd>${esc(e.opponent)}</dd>` : ""}
          ${e.description ? `<dt>Info</dt><dd>${esc(e.description)}</dd>` : ""}
        </dl>
        ${e.type === "training" ? `<p class="soft">${responses.filter((r) => r.status === "yes").length} Zusagen · ${responses.filter((r) => r.status === "no").length} Absagen. Details unter „Training“.</p>` : ""}
        ${e.type === "away" ? `<p class="soft">${drivers.length} Fahrer eingetragen (${drivers.reduce((a, d) => a + d.seats, 0)} Plätze). Details unter „Fahrerplanung“.</p>` : ""}
        ${e.type === "home" ? `<p class="soft">${jobs.filter((j) => j.assignee).length}/${jobs.length} Jobs vergeben. Details unter „Heimspiel-Jobs“.</p>` : ""}`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn danger" data-del>Löschen</button><button class="btn" data-edit>Bearbeiten</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const stLink = m.querySelector("[data-stlink]");
        if (stLink) stLink.onclick = (ev2) => { ev2.preventDefault(); closeModal(); sportstaetteInfoModal(Store.byId("sportstaetten", stLink.dataset.stlink)); };
        m.querySelector("[data-edit]").onclick = () => { closeModal(); eventForm(e); };
        m.querySelector("[data-del]").onclick = () => {
          if (e.seriesId) {
            const count = S().events.filter((x) => x.seriesId === e.seriesId).length;
            closeModal();
            modal({
              title: "Serientermin löschen",
              body: `<p>Dieser Termin gehört zu einer Serie mit <strong>${count} Terminen</strong>. Was soll gelöscht werden?</p>`,
              footer: `<button class="btn ghost" data-c>Abbrechen</button>
                <button class="btn outline" data-one>Nur diesen Termin</button>
                <button class="btn danger" data-all>Ganze Serie (${count})</button>`,
              onOpen(m2) {
                m2.querySelector("[data-c]").onclick = closeModal;
                m2.querySelector("[data-one]").onclick = () => { Store.remove("events", id); closeModal(); toast("Termin gelöscht"); reload(); };
                m2.querySelector("[data-all]").onclick = () => {
                  S().events.filter((x) => x.seriesId === e.seriesId).forEach((x) => Store.remove("events", x.id));
                  closeModal(); toast(`Serie gelöscht (${count} Termine)`); reload();
                };
              },
            });
          } else confirmDialog("Termin wirklich löschen?", () => {
            Store.remove("events", id); closeModal(); toast("Termin gelöscht"); reload();
          });
        };
      },
    });
  }

  // ---- Trainer:innen-Konten für die Trainings-Zuordnung ----
  let _trainerNamen = null;
  function eingeloggterTrainer() {
    return (window.Sync && Sync.user && (Sync.user.name || Sync.user.username)) || "";
  }
  async function trainerNamen() {
    if (_trainerNamen) return _trainerNamen;
    let namen = [];
    try {
      const res = await apiZugang("/api/accounts");
      namen = (res.ok && res.data.accounts ? res.data.accounts : [])
        .filter((k) => k.role === "trainer" && k.active)
        .map((k) => k.name || k.username);
    } catch (e) { /* offline – unten Fallback */ }
    // Bereits verwendete Namen und die eingeloggte Person ergänzen
    S().events.forEach((e) => { const n = (e.trainerName || "").trim(); if (n && !namen.includes(n)) namen.push(n); });
    const ich = eingeloggterTrainer();
    if (ich && !namen.includes(ich)) namen.unshift(ich);
    _trainerNamen = [...new Set(namen)];
    return _trainerNamen;
  }

  function eventForm(e) {
    const isEdit = !!e;
    e = e || { type: "training", title: "", start: "", end: "", location: "Sporthalle SKV, Halle 1", opponent: "", description: "" };
    const toLocal = (iso) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    modal({
      title: isEdit ? "Termin bearbeiten" : "Neuer Termin",
      body: `<form id="ef"><div class="form-grid">
        <div class="field"><label>Art</label><select name="type">
          ${typeOptions(e.type)}</select></div>
        <div class="field"><label>Titel</label><input name="title" value="${esc(e.title)}" required></div>
        <div class="field"><label>Beginn</label><input type="datetime-local" name="start" value="${toLocal(e.start)}" required></div>
        <div class="field"><label>Ende</label><input type="datetime-local" name="end" value="${toLocal(e.end)}"></div>
        <div class="field full"><label>Ort <span class="soft" style="font-weight:400">(Sportstätten werden beim Tippen vorgeschlagen)</span></label>
          <input name="location" value="${esc(e.location)}" list="ortListe" autocomplete="off">
          <datalist id="ortListe">
            ${(S().sportstaetten || []).map((st2) => `<option value="${esc(st2.name)}${st2.adresse ? ", " + esc(st2.adresse) : ""}">${esc(st2.heimmannschaft ? "Heim: " + st2.heimmannschaft : st2.name)}</option>`).join("")}
          </datalist></div>
        <div class="field full"><label>Gegner (bei Spielen)</label><input name="opponent" value="${esc(e.opponent)}"></div>
        <div class="field full"><label>👤 Trainer:in / Leitung <span class="soft" style="font-weight:400">(wer übernimmt diesen Termin?)</span></label>
          <select name="trainerName" id="evTrainer">
            <option value="">– keine Zuordnung –</option>
            ${e.trainerName ? `<option value="${esc(e.trainerName)}" selected>${esc(e.trainerName)}</option>` : ""}
          </select></div>
        <div class="field full"><label>Beschreibung</label><textarea name="description">${esc(e.description)}</textarea></div>
        ${!isEdit ? `
        <div class="field"><label>🔁 Wiederholung (z. B. Training)</label><select name="repeat">
          <option value="">keine</option>
          <option value="7">wöchentlich</option>
          <option value="14">alle 2 Wochen</option>
        </select></div>
        <div class="field"><label>Wiederholen bis</label><input type="date" name="repeatUntil"></div>
        <div class="field full"><label style="font-weight:400" class="soft">
          <input type="checkbox" name="skipHolidays" checked style="width:auto"> Termine in den Schulferien/Feiertagen (MV) automatisch auslassen</label></div>` : ""}
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        // Registrierte Trainer:innen laden; neue Termine standardmäßig der
        // eingeloggten Person zuordnen
        trainerNamen().then((namen) => {
          const sel = m.querySelector("#evTrainer");
          if (!sel) return;
          const vorhanden = new Set(Array.from(sel.options).map((o) => o.value));
          namen.forEach((n) => {
            if (vorhanden.has(n)) return;
            const o = document.createElement("option");
            o.value = o.textContent = n;
            sel.appendChild(o);
          });
          if (!isEdit && !sel.value && eingeloggterTrainer()) sel.value = eingeloggterTrainer();
        });
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#ef");
          if (!f.reportValidity()) return;
          const d = formData(f);
          const repeat = Number(d.repeat) || 0;
          const repeatUntil = d.repeatUntil ? new Date(d.repeatUntil + "T23:59:59") : null;
          const skipHol = !!d.skipHolidays;
          delete d.repeat; delete d.repeatUntil; delete d.skipHolidays;
          d.start = new Date(d.start).toISOString();
          d.end = d.end ? new Date(d.end).toISOString() : d.start;
          if (isEdit) { Store.update("events", e.id, d); }
          else if (repeat && repeatUntil) {
            // Serie erzeugen: alle N Tage bis zum Enddatum (max. 80 Termine)
            const seriesId = Store.uid("se");
            const durMs = new Date(d.end) - new Date(d.start);
            let cur2 = new Date(d.start), made = 0, skipped = 0;
            while (cur2 <= repeatUntil && made < 80) {
              if (skipHol && holidayFor(cur2)) { skipped++; }
              else {
                Store.add("events", Object.assign({}, d, {
                  start: cur2.toISOString(),
                  end: new Date(cur2.getTime() + durMs).toISOString(),
                  seriesId,
                }));
                made++;
              }
              cur2 = new Date(cur2.getTime() + repeat * 86400000);
            }
            closeModal(); toast(`Serie angelegt: ${made} Termine${skipped ? `, ${skipped} in Ferien übersprungen` : ""}`, "good"); reload();
            return;
          } else { Store.add("events", d); }
          closeModal(); toast("Termin gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ---------- Sportstätten: Verzeichnis mit Bild, verlinkt aus Terminen ---------- */
  function sportstaetteZuOrt(location) {
    const ort = String(location || "").toLowerCase();
    if (!ort) return null;
    return (S().sportstaetten || []).find((st2) =>
      st2.name && ort.startsWith(st2.name.toLowerCase())) || null;
  }

  function sportstaetteInfoModal(st2) {
    modal({
      title: `🏟️ ${esc(st2.name)}`,
      body: `
        ${st2.bild ? `<img src="${st2.bild}" alt="${esc(st2.name)}" style="width:100%;border-radius:12px;margin-bottom:12px">` : ""}
        <div class="list">
          ${st2.adresse ? `<div class="list-item"><div class="grow"><div class="sub">Adresse</div><div class="title" style="font-size:.92rem">${esc(st2.adresse)}</div></div>
            <a class="btn sm ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st2.name + ", " + st2.adresse)}" target="_blank" rel="noopener">🗺️</a></div>` : ""}
          ${st2.heimmannschaft ? `<div class="list-item"><div class="grow"><div class="sub">Heimmannschaft</div><div class="title" style="font-size:.92rem">${esc(st2.heimmannschaft)}</div></div></div>` : ""}
          ${st2.ansprechpartner ? `<div class="list-item"><div class="grow"><div class="sub">Ansprechpartner:in</div><div class="title" style="font-size:.92rem">${esc(st2.ansprechpartner)}</div></div></div>` : ""}
          ${st2.notizen ? `<div class="list-item"><div class="grow"><div class="sub">Notizen</div><div class="title" style="font-size:.9rem;font-weight:400">${esc(st2.notizen)}</div></div></div>` : ""}
        </div>`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn outline" data-edit>✏️ Bearbeiten</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-edit]").onclick = () => { closeModal(); sportstaetteForm(st2); };
      },
    });
  }

  function sportstaetteForm(st2) {
    const isEdit = !!st2;
    st2 = st2 || { name: "", adresse: "", ansprechpartner: "", heimmannschaft: "", notizen: "", bild: "" };
    modal({
      title: isEdit ? "Sportstätte bearbeiten" : "Neue Sportstätte",
      body: `<form id="stf2"><div class="form-grid">
        <div class="field full"><label>Bezeichnung</label><input name="name" value="${esc(st2.name)}" required placeholder="z. B. Sporthalle Regionale Schule Waren-West"></div>
        <div class="field full"><label>Adresse</label><input name="adresse" value="${esc(st2.adresse)}" placeholder="Straße Nr., PLZ Ort"></div>
        <div class="field"><label>Ansprechpartner:in</label><input name="ansprechpartner" value="${esc(st2.ansprechpartner)}"></div>
        <div class="field"><label>Heimmannschaft</label><input name="heimmannschaft" value="${esc(st2.heimmannschaft)}"></div>
        <div class="field full"><label>Notizen (Schlüssel, Parken, Besonderheiten)</label><textarea name="notizen" rows="2">${esc(st2.notizen || "")}</textarea></div>
        <div class="field full"><label>🖼️ Bild ${st2.bild ? '<span class="badge good">vorhanden</span>' : ""}</label>
          <input type="file" id="stBild" accept="image/*"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button>${isEdit && st2.bild ? '<button class="btn outline" data-bildweg>🗑️ Bild entfernen</button>' : ""}<button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const bildweg = m.querySelector("[data-bildweg]");
        if (bildweg) bildweg.onclick = () => { Store.update("sportstaetten", st2.id, { bild: "" }); toast("Bild entfernt"); closeModal(); reload(); };
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#stf2"); if (!f.reportValidity()) return;
          const d = formData(f);
          delete d.stBild;
          const speichern = (bild) => {
            const werte = { name: d.name, adresse: d.adresse, ansprechpartner: d.ansprechpartner,
                            heimmannschaft: d.heimmannschaft, notizen: d.notizen };
            if (bild !== undefined) werte.bild = bild;
            if (isEdit) Store.update("sportstaetten", st2.id, werte);
            else Store.add("sportstaetten", Object.assign({ id: Store.uid("sp"), bild: bild || "" }, werte));
            closeModal(); toast("Sportstätte gespeichert", "good"); reload();
          };
          const datei = m.querySelector("#stBild").files[0];
          if (!datei) { speichern(undefined); return; }
          const bild = new Image();
          const url = URL.createObjectURL(datei);
          bild.onload = () => {
            const faktor = Math.min(1, 900 / Math.max(bild.width, bild.height));
            const c = document.createElement("canvas");
            c.width = Math.round(bild.width * faktor); c.height = Math.round(bild.height * faktor);
            c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            speichern(c.toDataURL("image/jpeg", 0.8));
          };
          bild.onerror = () => toast("Bild konnte nicht gelesen werden", "bad");
          bild.src = url;
        };
      },
    });
  }

  function sportstaettenModal() {
    modal({
      title: "🏟️ Sportstätten",
      wide: true,
      body: `<p class="soft" style="margin-top:0;font-size:.85rem">Gespeicherte Hallen werden beim Anlegen von
        Terminen automatisch vervollständigt; in Terminlisten ist der Ort anklickbar.</p>
        <div class="list" style="max-height:420px;overflow-y:auto">
        ${(S().sportstaetten || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((st2) => `
          <div class="list-item" style="padding:8px 10px">
            ${st2.bild ? `<img src="${st2.bild}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:8px">` : `<span style="font-size:1.4rem">🏟️</span>`}
            <div class="grow"><div class="title" style="font-size:.9rem">${esc(st2.name)}</div>
            <div class="sub">${esc(st2.adresse || "ohne Adresse")}${st2.heimmannschaft ? ` · Heim: ${esc(st2.heimmannschaft)}` : ""}${st2.ansprechpartner ? ` · 👤 ${esc(st2.ansprechpartner)}` : ""}</div></div>
            <button class="btn sm ghost" data-stinfo="${st2.id}">👁️</button>
            <button class="btn sm ghost" data-stedit2="${st2.id}">✏️</button>
            <button class="btn sm ghost" data-stdel2="${st2.id}">🗑️</button>
          </div>`).join("") || `<p class="soft">Noch keine Sportstätten gespeichert.</p>`}
        </div>`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn" data-neu>＋ Sportstätte</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-neu]").onclick = () => { closeModal(); sportstaetteForm(); };
        $$("[data-stinfo]", m).forEach((b) => b.onclick = () => { closeModal(); sportstaetteInfoModal(Store.byId("sportstaetten", b.dataset.stinfo)); });
        $$("[data-stedit2]", m).forEach((b) => b.onclick = () => { closeModal(); sportstaetteForm(Store.byId("sportstaetten", b.dataset.stedit2)); });
        $$("[data-stdel2]", m).forEach((b) => b.onclick = () => {
          const s2 = Store.byId("sportstaetten", b.dataset.stdel2);
          confirmDialog(`Sportstätte „${esc(s2.name)}“ löschen?`, () => {
            Store.remove("sportstaetten", s2.id); toast("Gelöscht"); closeModal(); sportstaettenModal();
          });
        });
      },
    });
  }

  // Eigene Termin-Kategorien verwalten (zusätzlich zu Training/Heim/Auswärts/Termin)
  function eventCategoriesModal() {
    const liste = () => eventCats().map((c) => `
      <div class="list-item" style="padding:8px 10px">
        <div class="grow"><div class="title" style="font-size:.9rem">${esc((c.emoji ? c.emoji + " " : "") + c.name)}</div>
        <div class="sub">${S().events.filter((e) => e.type === c.id).length} Termine</div></div>
        <button class="btn sm ghost" data-cedit="${c.id}">✏️</button>
        <button class="btn sm ghost" data-cdel="${c.id}">🗑️</button>
      </div>`).join("") || `<p class="soft">Noch keine eigenen Kategorien – z. B. 🏆 Turnier, 🎓 Lehrgang, 🎉 Vereinsfeier.</p>`;
    modal({
      title: "🏷️ Eigene Termin-Kategorien",
      body: `
        <p class="soft" style="margin-top:0;font-size:.85rem">Eigene Kategorien stehen überall zur Auswahl, wo die
        Termin-Art gewählt wird (Kalender, Terminliste), erscheinen im Portal und können beim Elternbrief
        für die Pinnwand-Seite ausgewählt werden. Training, Heim- und Auswärtsspiel bleiben fest.</p>
        <div class="list" id="ecListe">${liste()}</div>
        <form id="ecForm" class="portal-fahrer" style="margin-top:14px">
          <input name="emoji" placeholder="🏆" maxlength="4" style="flex:0 0 64px;min-width:64px;text-align:center">
          <input name="name" placeholder="Name der Kategorie, z. B. Turnier" required>
          <button class="btn sm">＋ Anlegen</button>
        </form>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = () => { closeModal(); reload(); };
        const neuZeichnen = () => {
          m.querySelector("#ecListe").innerHTML = liste();
          verdrahten();
        };
        function verdrahten() {
          $$("[data-cedit]", m).forEach((b) => b.onclick = () => {
            const c = Store.byId("eventCategories", b.dataset.cedit);
            const name = prompt("Name der Kategorie:", c.name);
            if (!name) return;
            const emoji = prompt("Emoji (leer = keins):", c.emoji || "") || "";
            Store.update("eventCategories", c.id, { name: name.trim(), emoji: emoji.trim() });
            toast("Kategorie gespeichert", "good"); neuZeichnen();
          });
          $$("[data-cdel]", m).forEach((b) => b.onclick = () => {
            const c = Store.byId("eventCategories", b.dataset.cdel);
            const n = S().events.filter((e) => e.type === c.id).length;
            confirmDialog(`Kategorie „${esc(c.name)}“ löschen?${n ? ` ${n} Termin(e) werden zu „Termin“ (Sonstiges).` : ""}`, () => {
              S().events.forEach((e) => { if (e.type === c.id) Store.update("events", e.id, { type: "other" }); });
              Store.remove("eventCategories", c.id);
              toast("Kategorie gelöscht"); neuZeichnen();
            });
          });
        }
        m.querySelector("#ecForm").onsubmit = (ev) => {
          ev.preventDefault();
          const f = ev.target;
          Store.add("eventCategories", { id: Store.uid("ec"), name: f.name.value.trim(), emoji: f.emoji.value.trim() });
          f.name.value = ""; f.emoji.value = "";
          toast("Kategorie angelegt", "good"); neuZeichnen();
        };
        verdrahten();
      },
    });
  }

  function holidayForm(h) {
    const isEdit = !!h;
    h = h || { name: "", start: "", end: "" };
    modal({
      title: isEdit ? "Schulfreien Eintrag bearbeiten" : "Schulfreie Tage hinzufügen",
      body: `<form id="hf"><div class="form-grid">
        <div class="field full"><label>Bezeichnung</label><input name="name" value="${esc(h.name)}" required placeholder="z. B. Herbstferien MV"></div>
        <div class="field"><label>Von</label><input type="date" name="start" value="${esc(h.start)}" required></div>
        <div class="field"><label>Bis</label><input type="date" name="end" value="${esc(h.end)}"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#hf"); if (!f.reportValidity()) return;
          const d = formData(f);
          if (!d.end || d.end < d.start) d.end = d.start;
          if (isEdit) Store.update("holidays", h.id, d); else Store.add("holidays", d);
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     TRAININGSRÜCKMELDUNG
     ====================================================================== */
  function training(el) {
    // Rückmeldungen gibt es für Trainings UND Spiele (Portal: „bitte rückmelden")
    const trainings = S().events.filter((e) => e.type === "training" || e.type === "home" || e.type === "away")
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const upcoming = trainings.filter((e) => daysUntil(e.start) >= -1);
    const sel = training._sel && trainings.find((t) => t.id === training._sel) ? training._sel : (upcoming[0] || trainings[0] || {}).id;
    const evt = Store.byId("events", sel);

    // Zähler: bereits durchgeführte Trainings (gesamt + laufende Saison ab 1. Juli),
    // aufgeschlüsselt nach Trainer:in, damit bei mehreren klar ist, wer was übernimmt
    const jetzt = new Date();
    const saisonStart = new Date(jetzt.getFullYear() - (jetzt.getMonth() < 6 ? 1 : 0), 6, 1);
    const vergangene = S().events.filter((e) => e.type === "training" && !e.abgesagt && new Date(e.start) < jetzt);
    const inSaison = vergangene.filter((e) => new Date(e.start) >= saisonStart);
    const proTrainer = {};
    vergangene.forEach((e) => {
      const n = (e.trainerName || "").trim() || "ohne Zuordnung";
      proTrainer[n] = proTrainer[n] || { gesamt: 0, saison: 0 };
      proTrainer[n].gesamt++;
      if (new Date(e.start) >= saisonStart) proTrainer[n].saison++;
    });
    const trainerZeilen = Object.keys(proTrainer).sort()
      .map((n) => `<span class="badge ${n === "ohne Zuordnung" ? "" : "info"}" title="Saison / gesamt">👤 ${esc(n)}: <strong>${proTrainer[n].saison}</strong> / ${proTrainer[n].gesamt}</span>`).join(" ");

    el.innerHTML = `
      ${head("Trainingsrückmeldung und Planung", "Rückmeldungen für Trainings und Spiele im Blick – und das Training passend zur Gruppengröße planen")}
      <div class="field" style="max-width:560px">
        <label>Termin (Training oder Spiel)</label>
        <select id="tsel">${trainings.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${t.abgesagt ? "🚫 " : ""}${fmtDateShort(t.start)} · ${fmtTime(t.start)} · ${esc(labelForType(t.type))}: ${esc(t.title)}${t.trainerName ? ` · 👤 ${esc(t.trainerName)}` : ""}</option>`).join("")}</select>
      </div>
      <div id="tbody" class="mt-lg"></div>
      <div class="card mt" style="padding:10px 14px">
        <div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">
          <strong>🏐 Trainings durchgeführt:</strong>
          <span class="badge good" title="in der laufenden Saison (ab 1. Juli)">Saison: ${inSaison.length}</span>
          <span class="badge" title="seit Beginn der Aufzeichnung">gesamt: ${vergangene.length}</span>
          ${trainerZeilen ? `<span class="soft" style="font-size:.82rem">·</span> ${trainerZeilen}` : ""}
        </div>
      </div>`;

    $("#tsel", el).onchange = (ev) => { training._sel = ev.target.value; reload(); };
    renderTrainingBody($("#tbody", el), evt);
  }

  function renderTrainingBody(box, evt) {
    if (!evt) { box.innerHTML = empty("🏐", "Kein Training vorhanden"); return; }
    const roster = S().players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    const resp = {};
    const gruende = {};
    S().responses.filter((r) => r.eventId === evt.id).forEach((r) => {
      resp[r.playerId] = r.status;
      if (r.grund) gruende[r.playerId] = r.grund;
    });
    // Vom Portal gemeldete Abwesenheiten am Termin-Tag (krank, Klassenfahrt …)
    const tag = String(evt.start || "").slice(0, 10);
    const abwesend = {};
    (S().abwesenheiten || []).forEach((a) => { if (a.von <= tag && tag <= a.bis) abwesend[a.playerId] = a.grund || "abwesend"; });
    const count = { yes: 0, no: 0, maybe: 0, nichtnom: 0, open: 0 };
    roster.forEach((p) => {
      const st = resp[p.id];
      if (st === "x") count.nichtnom++;
      else if (st) count[st]++;
      else count.open++;
    });

    box.innerHTML = `
      ${evt.abgesagt ? `<div class="card mb" style="padding:10px 14px;border:1.5px solid #d05050">
        <div class="flex" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>🚫 <strong>Abgesagt</strong> am ${fmtDateShort(evt.abgesagt.am)}${evt.abgesagt.notiz ? ` · <span class="soft">${esc(evt.abgesagt.notiz)}</span>` : ""}</div>
          <button class="btn sm ghost" data-absagezurueck>↩️ Absage zurücknehmen</button>
        </div>
      </div>` : ""}
      <div class="card mb" style="padding:10px 14px">
        <div class="flex" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>👤 <strong>Leitung:</strong> ${evt.trainerName ? esc(evt.trainerName) : '<span class="soft">noch nicht zugeordnet</span>'}</div>
          <div class="flex" style="gap:6px">
            ${!evt.trainerName ? '<button class="btn sm outline" data-leitungich>✓ Ich übernehme</button>' : ""}
            <button class="btn sm ghost" data-leitung>✏️ ${evt.trainerName ? "ändern" : "zuordnen"}</button>
            ${!evt.abgesagt && daysUntil(evt.start) >= 0 ? `<button class="btn sm ghost" data-absagen title="Termin absagen und alle Rückgemeldeten benachrichtigen">🚫 Absagen</button>` : ""}
          </div>
        </div>
      </div>
      <div class="grid grid-4 mb">
        ${stat("✅", "Zusagen", count.yes)}
        ${stat("❌", "Absagen", count.no)}
        ${stat("❔", "Unsicher", count.maybe)}
        ${stat("⏳", "Keine Rückmeldung", count.open)}
        ${count.nichtnom ? stat("🚫", "Nicht nominiert", count.nichtnom) : ""}
      </div>
      ${Object.keys(gruende).length ? `<div class="card mb">
        <div class="card-head"><h3>💬 Bemerkungen der Spieler:innen</h3><span class="badge">${Object.keys(gruende).length}</span></div>
        <div class="list">
          ${roster.filter((p) => gruende[p.id]).map((p) => `<div class="list-item" style="padding:8px 10px">
            ${avatar(p.firstName, p.lastName, p)}<div class="grow">
            <div class="title" style="font-size:.88rem">${esc(p.firstName)} ${esc(p.lastName)} ${rmBadge(resp[p.id] || "open")}</div>
            <div class="sub">💬 ${esc(gruende[p.id])}</div></div></div>`).join("")}
        </div>
      </div>` : ""}
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Spieler</th><th>Team</th><th>Rückmeldung</th><th class="right">Aktion</th></tr></thead>
        <tbody>${roster.map((p) => {
          const st = resp[p.id] || "open";
          return `<tr>
            <td><div class="flex">${avatar(p.firstName, p.lastName, p)}<strong>${esc(p.firstName)} ${esc(p.lastName)}</strong>
              ${abwesend[p.id] ? `<span class="badge warn" title="Über das Portal gemeldet">🏖 ${esc(abwesend[p.id])}</span>` : ""}</div></td>
            <td><span class="badge info">${esc(p.team)}</span></td>
            <td>${rmBadge(st)}${gruende[p.id] ? `<div class="sub" title="Begründung aus dem Portal">💬 ${esc(gruende[p.id])}</div>` : ""}</td>
            <td class="right nowrap">
              <button class="rsvp-daumen sm ${st === "yes" ? "aktiv ja" : ""}" data-set="yes" data-pl="${p.id}" title="Zusagen">👍</button>
              <button class="rsvp-daumen sm ${st === "maybe" ? "aktiv viel" : ""}" data-set="maybe" data-pl="${p.id}" title="Unsicher">❓</button>
              <button class="rsvp-daumen sm ${st === "no" ? "aktiv nein" : ""}" data-set="no" data-pl="${p.id}" title="Absagen">👎</button>
              <button class="rsvp-daumen sm ${st === "x" ? "aktiv nn" : ""}" data-set="x" data-pl="${p.id}" title="Nicht nominiert (Spieler:in kann selbst überschreiben)">🚫</button>
            </td></tr>`;
        }).join("")}</tbody>
      </table></div></div>
      ${evt.type === "training" ? trainingsplanHTML(evt, count.yes) : ""}`;

    $$("[data-set]", box).forEach((b) => b.onclick = () => {
      const status = b.dataset.set;
      const aktuell = resp[b.dataset.pl];
      // Erneuter Klick auf den aktiven Daumen nimmt die Rückmeldung zurück
      if (aktuell === status) {
        const ex = S().responses.find((r) => r.eventId === evt.id && r.playerId === b.dataset.pl);
        if (ex) Store.remove("responses", ex.id);
        reload();
        return;
      }
      let grund = "";
      if (status === "no" || status === "maybe") {
        // Auch beim Eintragen durch das Trainerteam wird die Begründung erfasst
        const bisher = gruende[b.dataset.pl] || "";
        const eingabe = prompt(status === "no"
          ? "Begründung für die Absage (z. B. krank, Klassenfahrt):"
          : "Begründung für „Unsicher“ (z. B. Mitfahrt offen):", bisher);
        if (eingabe === null) return; // abgebrochen – nichts ändern
        grund = eingabe.trim();
      }
      setResponse(evt.id, b.dataset.pl, status, grund); reload();
    });
    const leitungBtn = box.querySelector("[data-leitung]");
    if (leitungBtn) leitungBtn.onclick = async () => {
      const namen = await trainerNamen();
      const vorbelegt = evt.trainerName || eingeloggterTrainer();
      modal({
        title: "Leitung zuordnen",
        body: `<div class="field"><label>Wer übernimmt diesen Termin?</label>
          <select id="ltgSel">
            <option value="">– keine Zuordnung –</option>
            ${namen.map((n) => `<option value="${esc(n)}" ${n === vorbelegt ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select></div>
          <p class="soft" style="font-size:.82rem">Zur Auswahl stehen alle als Trainer:in registrierten Konten.</p>`,
        footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
        onOpen(m) {
          m.querySelector("[data-x]").onclick = closeModal;
          m.querySelector("[data-s]").onclick = () => {
            const wert = m.querySelector("#ltgSel").value;
            Store.update("events", evt.id, { trainerName: wert });
            closeModal(); toast(wert ? `Leitung: ${wert}` : "Zuordnung entfernt", "good"); reload();
          };
        },
      });
    };
    const absagenBtn = box.querySelector("[data-absagen]");
    if (absagenBtn) absagenBtn.onclick = () => {
      const istTraining = evt.type === "training";
      modal({
        title: istTraining ? "Training absagen" : "Termin absagen",
        body: `<p class="soft" style="margin-top:0;font-size:.88rem">Alle Spieler:innen und Eltern, die sich zu diesem Termin
            bereits zurückgemeldet haben, werden automatisch per Push-Mitteilung informiert.</p>
          <div class="field"><label>Notiz zur Absage (frei)</label>
            <textarea id="absNotiz" rows="2" placeholder="z. B. Halle gesperrt, Trainer:in krank …"></textarea></div>`,
        footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>🚫 Jetzt absagen</button>`,
        onOpen(m) {
          m.querySelector("[data-x]").onclick = closeModal;
          m.querySelector("[data-s]").onclick = async () => {
            const notiz = m.querySelector("#absNotiz").value.trim();
            Store.update("events", evt.id, { abgesagt: { am: new Date().toISOString(), notiz } });
            closeModal(); reload();
            // Push an alle bereits Rückgemeldeten (Server kennt die Zuordnung Konto → Spieler:in)
            const r = await apiZugang("/api/termin-absage", {
              eventId: evt.id, titel: evt.title || "", start: evt.start || "", notiz });
            if (r.ok) toast(`Termin abgesagt – ${r.data.benachrichtigt || 0} Mitteilung(en) verschickt`, "good");
            else toast("Termin abgesagt – Mitteilungen konnten nicht verschickt werden", "bad");
          };
        },
      });
    };
    const absageZurueckBtn = box.querySelector("[data-absagezurueck]");
    if (absageZurueckBtn) absageZurueckBtn.onclick = () => {
      Store.update("events", evt.id, { abgesagt: null });
      toast("Absage zurückgenommen – bitte das Team selbst informieren", "good"); reload();
    };
    const leitungIchBtn = box.querySelector("[data-leitungich]");
    if (leitungIchBtn) leitungIchBtn.onclick = () => {
      const ich = eingeloggterTrainer();
      if (!ich) { toast("Kein Trainer:innen-Konto angemeldet", "bad"); return; }
      Store.update("events", evt.id, { trainerName: ich });
      toast(`Leitung: ${ich}`, "good"); reload();
    };
    bindTrainingsplan(box, evt, count.yes);
  }

  /* ----------------------------------------------------------------------
     TRAININGSPLANUNG – Aufbau nach klassischer Trainingslehre:
     Erwärmung → Technik → Spielform → Abschlussspiel → Cool-down.
     Bausteine tragen sinnvolle Teilnehmerzahlen und werden nach der Zahl
     der ZUSAGEN gefiltert; das Trainerteam stellt per Klick zusammen und
     kann die Baustein-Bibliothek beliebig erweitern.
     ---------------------------------------------------------------------- */
  const PLAN_PHASEN = [
    ["aufwaermen", "🔥 Erwärmung"], ["technik", "🎯 Technik"], ["spielform", "🧩 Spielform"],
    ["abschluss", "🏁 Abschlussspiel"], ["cooldown", "🧘 Cool-down"],
  ];
  const phasenName = (k) => (PLAN_PHASEN.find(([key]) => key === k) || [k, k])[1];
  const uebungPasst = (u, n) => !n || (((u.minSp || 0) <= n) && (!u.maxSp || n <= u.maxSp));

  function trainingsplanHTML(evt, zusagen) {
    const plan = evt.plan || { notiz: "", bausteine: [] };
    const alle = S().uebungen || [];
    const dauerMin = Math.max(0, Math.round((new Date(evt.end) - new Date(evt.start)) / 60000)) || 90;
    const gewaehlt = plan.bausteine.map((id) => Store.byId("uebungen", id)).filter(Boolean)
      .sort((a, b) => PLAN_PHASEN.findIndex(([k]) => k === a.kategorie) - PLAN_PHASEN.findIndex(([k]) => k === b.kategorie));
    const summe = gewaehlt.reduce((s, u) => s + (u.dauer || 0), 0);
    return `
      <div class="card mt">
        <div class="card-head"><h3>📋 Trainingsplanung</h3><span class="spacer"></span>
          <span class="badge ${summe > dauerMin ? "warn" : summe ? "good" : ""}">${summe} / ${dauerMin} Min.</span>
          <button class="btn sm outline" data-planauto title="Passenden Plan für ${zusagen || "alle"} Zusagen würfeln">🎲 Vorschlag</button>
          <button class="btn sm outline" data-planpdf title="Plan als PDF zum Ausdrucken">🖨️ PDF</button>
          <button class="btn sm outline" data-planspicker title="Kompakter Spicker fürs Handy">📱 Spicker</button>
          <button class="btn sm outline" data-uebadd>＋ Baustein</button></div>
        <p class="soft" style="font-size:.82rem;margin-top:0">Bausteine sind auf <strong>${zusagen ? zusagen + " Zusagen" : "noch offene Rückmeldungen"}</strong> gefiltert –
        Übungen, die zur Gruppengröße nicht passen, erscheinen ausgegraut.</p>
        ${gewaehlt.length ? `<div class="list" style="margin-bottom:12px">
          ${gewaehlt.map((u) => `<div class="list-item" style="padding:8px 10px"><div class="grow">
            <div class="title" style="font-size:.88rem">${phasenName(u.kategorie)} · ${esc(u.name)} <span class="soft">(${u.dauer}′)</span></div>
            ${u.beschreibung ? `<div class="sub">${esc(u.beschreibung)}</div>` : ""}
            ${u.quelle || u.link ? `<div class="sub">📚 ${esc(u.quelle || "Quelle")}${u.link ? ` · <a href="${escUrl(u.link)}" target="_blank" rel="noopener">${/youtu/.test(u.link) ? "▶️ Video" : "📄 Anleitung"} öffnen</a>` : ""}</div>` : ""}</div>
            <button class="btn sm ghost" data-planweg="${u.id}" title="Aus dem Plan entfernen">✕</button>
          </div>`).join("")}</div>` : `<p class="soft">Noch kein Plan – unten Bausteine antippen oder 🎲 Vorschlag nutzen.</p>`}
        ${PLAN_PHASEN.map(([kat, label]) => {
          const der = alle.filter((u) => u.kategorie === kat);
          if (!der.length) return "";
          return `<div style="margin:8px 0"><strong style="font-size:.82rem;color:var(--primary)">${label}</strong>
            <div class="chip-row" style="margin-top:4px">
            ${der.map((u) => {
              const drin = plan.bausteine.includes(u.id);
              const passt = uebungPasst(u, zusagen);
              return `<button class="chip" data-planplus="${u.id}" ${drin ? "disabled" : ""}
                style="${drin ? "opacity:.4" : !passt ? "opacity:.45;border-style:dashed" : "cursor:pointer"}"
                title="${esc(u.beschreibung || "")}${!passt ? ` – passt eher für ${u.minSp}${u.maxSp ? "–" + u.maxSp : "+"} Teilnehmende` : ""}">
                ${esc(u.name)} ${u.dauer}′${!passt ? " ⚠" : ""}</button>`;
            }).join("")}
            </div></div>`;
        }).join("")}
        <div class="field" style="margin-top:10px"><label>🗒️ Notizen zur Trainingsplanung</label>
          <textarea id="planNotiz" rows="3" placeholder="Schwerpunkt, Material, Besonderheiten …">${esc(plan.notiz || "")}</textarea></div>
        <button class="btn sm" data-plansave>Notiz speichern</button>
        <button class="btn sm ghost" data-uebverwalten style="float:right">🧰 Bausteine verwalten</button>
      </div>`;
  }

  function planSpeichern(evt, patch) {
    const plan = Object.assign({ notiz: "", bausteine: [] }, evt.plan || {}, patch);
    Store.update("events", evt.id, { plan });
  }

  function bindTrainingsplan(box, evt, zusagen) {
    if (!evt || evt.type !== "training") return;
    $$("[data-planplus]", box).forEach((b) => b.onclick = () => {
      const plan = evt.plan || { notiz: "", bausteine: [] };
      if (!plan.bausteine.includes(b.dataset.planplus)) {
        planSpeichern(evt, { bausteine: [...plan.bausteine, b.dataset.planplus] });
        reload();
      }
    });
    $$("[data-planweg]", box).forEach((b) => b.onclick = () => {
      const plan = evt.plan || { notiz: "", bausteine: [] };
      planSpeichern(evt, { bausteine: plan.bausteine.filter((id) => id !== b.dataset.planweg) });
      reload();
    });
    const auto = $("[data-planauto]", box);
    if (auto) auto.onclick = () => {
      // Ein-Klick-Plan: je Phase passende Bausteine würfeln, bis die
      // Trainingszeit gut gefüllt ist (Technik doppelt gewichtet).
      const dauerMin = Math.max(0, Math.round((new Date(evt.end) - new Date(evt.start)) / 60000)) || 90;
      const alle = S().uebungen || [];
      const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
      const bausteine = [];
      let summe = 0;
      PLAN_PHASEN.forEach(([kat]) => {
        const anzahl = kat === "technik" ? 2 : 1;
        const passende = alle.filter((u) => u.kategorie === kat && uebungPasst(u, zusagen));
        for (let i = 0; i < anzahl && passende.length; i++) {
          const u = zufall(passende.filter((x) => !bausteine.includes(x.id)));
          if (!u || summe + u.dauer > dauerMin + 5) break;
          bausteine.push(u.id);
          summe += u.dauer;
        }
      });
      planSpeichern(evt, { bausteine });
      toast(`🎲 Vorschlag für ${zusagen || "alle"} Zusagen erstellt (${summe} Min.)`, "good");
      reload();
    };
    const save = $("[data-plansave]", box);
    if (save) save.onclick = () => {
      planSpeichern(evt, { notiz: $("#planNotiz", box).value });
      toast("Planung gespeichert", "good");
    };
    const add = $("[data-uebadd]", box);
    if (add) add.onclick = () => uebungForm();
    const verwalten = $("[data-uebverwalten]", box);
    if (verwalten) verwalten.onclick = () => uebungenModal();
    const pdfKnopf = $("[data-planpdf]", box);
    if (pdfKnopf) pdfKnopf.onclick = () => planPdf(evt, zusagen);
    const spicker = $("[data-planspicker]", box);
    if (spicker) spicker.onclick = () => planSpicker(evt, zusagen);
  }

  // Plan-Bausteine mit kumulierten Uhrzeiten (16:30–16:40 …) in Phasen-Reihenfolge
  function planZeitplan(evt) {
    const plan = evt.plan || { bausteine: [] };
    const gewaehlt = plan.bausteine.map((id) => Store.byId("uebungen", id)).filter(Boolean)
      .sort((a, b) => PLAN_PHASEN.findIndex(([k]) => k === a.kategorie) - PLAN_PHASEN.findIndex(([k]) => k === b.kategorie));
    let t = new Date(evt.start);
    return gewaehlt.map((u) => {
      const von = fmtTime(t.toISOString());
      t = new Date(t.getTime() + (u.dauer || 0) * 60000);
      return { u, von, bis: fmtTime(t.toISOString()) };
    });
  }

  // Sauber formatiertes PDF des Trainingsplans (über die Server-PDF-Erzeugung)
  function planPdf(evt, zusagen) {
    const zeitplan = planZeitplan(evt);
    if (!zeitplan.length) { toast("Erst Bausteine in den Plan legen", "bad"); return; }
    const B = [];
    const p = (runs) => B.push({ art: "p", runs: Array.isArray(runs) ? runs : [{ t: runs }] });
    B.push({ art: "h1", runs: [{ t: "Trainingsplan" }] });
    B.push({ art: "sub", runs: [{ t: `${fmtDate(evt.start)} · ${fmtTime(evt.start)}–${fmtTime(evt.end)} Uhr · ${evt.location || ""} · ${zusagen || "?"} Zusagen` }] });
    zeitplan.forEach(({ u, von, bis }) => {
      B.push({ art: "h2", runs: [{ t: `${von}–${bis}  ${phasenName(u.kategorie).replace(/^\S+\s/, "")}: ${u.name} (${u.dauer}′)` }] });
      if (u.beschreibung) p(u.beschreibung);
      if (u.quelle || u.link) B.push({ art: "sub", runs: [{ t: `Quelle: ${u.quelle || ""}${u.link ? " · " + u.link : ""}` }] });
    });
    if ((evt.plan || {}).notiz) {
      B.push({ art: "h2", runs: [{ t: "Notizen" }] });
      p(evt.plan.notiz);
    }
    B.push({ art: "linie", runs: [{ t: "SKV Müritz Volleyball · Trainingsplanung" }] });
    pdfVomServer(`Trainingsplan – ${fmtDateShort(evt.start)}`, B, false, `Training ${fmtDateShort(evt.start)}`);
  }

  // Kompakter Handy-Spicker: große Schrift, nur das Nötigste für die Halle
  function planSpicker(evt, zusagen) {
    const zeitplan = planZeitplan(evt);
    if (!zeitplan.length) { toast("Erst Bausteine in den Plan legen", "bad"); return; }
    modal({
      title: `📱 Spicker – ${fmtDateShort(evt.start)}`,
      body: `
        <div class="spicker">
          <div class="spicker-kopf">${fmtTime(evt.start)}–${fmtTime(evt.end)} Uhr · ${zusagen || "?"} Zusagen</div>
          ${zeitplan.map(({ u, von }) => `
            <div class="spicker-zeile">
              <span class="spicker-zeit">${von}</span>
              <span class="spicker-name">${phasenName(u.kategorie).split(" ")[0]} ${esc(u.name)}</span>
              <span class="spicker-dauer">${u.dauer}′</span>
            </div>`).join("")}
          ${(evt.plan || {}).notiz ? `<div class="spicker-notiz">🗒️ ${esc(evt.plan.notiz)}</div>` : ""}
        </div>`,
      footer: `<button class="btn" data-x>Schließen</button>`,
      onOpen(m) { m.querySelector("[data-x]").onclick = closeModal; },
    });
  }

  function uebungForm(u) {
    const isEdit = !!u;
    u = u || { name: "", kategorie: "technik", dauer: 10, minSp: 0, maxSp: 0, beschreibung: "" };
    modal({
      title: isEdit ? "Baustein bearbeiten" : "Neuer Trainings-Baustein",
      body: `<form id="uf"><div class="form-grid">
        <div class="field full"><label>Name</label><input name="name" value="${esc(u.name)}" required placeholder="z. B. Annahme unter Druck"></div>
        <div class="field"><label>Phase</label><select name="kategorie">
          ${PLAN_PHASEN.map(([k, l]) => `<option value="${k}" ${k === u.kategorie ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label>Dauer (Minuten)</label><input type="number" name="dauer" value="${u.dauer}" min="1" max="90" required></div>
        <div class="field"><label>Mindest-Teilnehmende (0 = egal)</label><input type="number" name="minSp" value="${u.minSp || 0}" min="0" max="30"></div>
        <div class="field"><label>Maximal sinnvoll (0 = egal)</label><input type="number" name="maxSp" value="${u.maxSp || 0}" min="0" max="30"></div>
        <div class="field full"><label>Beschreibung / Aufbau</label><textarea name="beschreibung" rows="3">${esc(u.beschreibung || "")}</textarea></div>
        <div class="field"><label>Quelle <span class="soft" style="font-weight:400">(z. B. volleyballkompass.de)</span></label>
          <input name="quelle" value="${esc(u.quelle || "")}"></div>
        <div class="field"><label>Link (Video/PDF)</label><input type="url" name="link" value="${esc(u.link || "")}" placeholder="https://…"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#uf"); if (!f.reportValidity()) return;
          const d = formData(f);
          const werte = { name: d.name, kategorie: d.kategorie, dauer: +d.dauer || 10,
                          minSp: +d.minSp || 0, maxSp: +d.maxSp || 0, beschreibung: d.beschreibung,
                          quelle: d.quelle || "", link: d.link || "" };
          if (isEdit) Store.update("uebungen", u.id, werte);
          else Store.add("uebungen", Object.assign({ id: Store.uid("ub") }, werte));
          closeModal(); toast("Baustein gespeichert", "good"); reload();
        };
      },
    });
  }

  function uebungenModal() {
    modal({
      title: "🧰 Trainings-Bausteine verwalten",
      wide: true,
      body: `<p class="soft" style="margin-top:0;font-size:.85rem">Die Bibliothek wächst mit jedem Training –
        bewährte Übungen anlegen, anpassen und wiederverwenden.</p>
        <div class="list" style="max-height:420px;overflow-y:auto">
        ${PLAN_PHASEN.map(([kat, label]) => {
          const der = (S().uebungen || []).filter((u) => u.kategorie === kat);
          return `<div class="list-month">${label}</div>` + der.map((u) => `
            <div class="list-item" style="padding:8px 10px"><div class="grow">
              <div class="title" style="font-size:.88rem">${esc(u.name)} <span class="soft">(${u.dauer}′ · ${u.minSp || "egal"}${u.maxSp ? "–" + u.maxSp : u.minSp ? "+" : ""} Teiln.)</span></div>
              ${u.beschreibung ? `<div class="sub">${esc(u.beschreibung)}</div>` : ""}
              ${u.quelle || u.link ? `<div class="sub">📚 ${esc(u.quelle || "Quelle")}${u.link ? ` · <a href="${escUrl(u.link)}" target="_blank" rel="noopener">${/youtu/.test(u.link) ? "▶️ Video" : "📄 Anleitung"}</a>` : ""}</div>` : ""}</div>
              <button class="btn sm ghost" data-uedit="${u.id}">✏️</button>
              <button class="btn sm ghost" data-udel="${u.id}">🗑️</button>
            </div>`).join("");
        }).join("")}
        </div>`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn" data-neu>＋ Neuer Baustein</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-neu]").onclick = () => { closeModal(); uebungForm(); };
        $$("[data-uedit]", m).forEach((b) => b.onclick = () => { closeModal(); uebungForm(Store.byId("uebungen", b.dataset.uedit)); });
        $$("[data-udel]", m).forEach((b) => b.onclick = () => {
          const u = Store.byId("uebungen", b.dataset.udel);
          confirmDialog(`Baustein „${esc(u.name)}“ löschen?`, () => {
            Store.remove("uebungen", u.id); toast("Baustein gelöscht"); closeModal(); reload();
          });
        });
      },
    });
  }
  function rmBadge(st) {
    return ({ yes: '<span class="badge good">Zugesagt</span>', no: '<span class="badge bad">Abgesagt</span>',
      maybe: '<span class="badge warn">Unsicher</span>', x: '<span class="badge">🚫 nicht nominiert</span>',
      open: '<span class="badge">offen</span>' })[st] || "";
  }
  function setResponse(eventId, playerId, status, grund) {
    // Begründung gehört zu Unsicher/Absage; bei Zusage wird sie gelöscht
    const werte = { status, grund: (status === "no" || status === "maybe") ? (grund || "") : "",
                    at: new Date().toISOString() };
    const ex = S().responses.find((r) => r.eventId === eventId && r.playerId === playerId);
    if (ex) Store.update("responses", ex.id, werte);
    else Store.add("responses", Object.assign({ eventId, playerId }, werte));
  }

  /* ======================================================================
     FAHRERPLANUNG (Auswärtsspiele)
     ====================================================================== */
  function drivers(el) {
    const away = S().events.filter((e) => e.type === "away").sort((a, b) => new Date(a.start) - new Date(b.start));
    const sel = drivers._sel && away.find((a) => a.id === drivers._sel) ? drivers._sel : (away[0] || {}).id;
    const evt = Store.byId("events", sel);

    el.innerHTML = `
      ${head("Fahrerplanung", "Fahrer für Auswärtsspiele koordinieren und Plätze zuordnen",
        `<button class="btn" data-add ${evt ? "" : "disabled"}>＋ Fahrer</button>`)}
      <div class="field" style="max-width:520px">
        <label>Auswärtsspiel</label>
        <select id="asel">${away.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${fmtDateShort(a.start)} · ${esc(a.title)}</option>`).join("")}</select>
      </div>
      <div id="dbody" class="mt-lg"></div>`;

    $("#asel", el).onchange = (ev) => { drivers._sel = ev.target.value; reload(); };
    if ($("[data-add]", el)) $("[data-add]", el).onclick = () => driverForm(evt.id);
    renderDriversBody($("#dbody", el), evt);
  }

  function renderDriversBody(box, evt) {
    if (!evt) { box.innerHTML = empty("🚗", "Kein Auswärtsspiel vorhanden"); return; }
    const list = S().drivers.filter((d) => d.eventId === evt.id);
    const seats = list.reduce((a, d) => a + Number(d.seats || 0), 0);
    const assigned = list.reduce((a, d) => a + d.playerIds.length, 0);
    const roster = S().players.filter((p) => p.membershipStatus !== "inaktiv");
    const assignedIds = new Set(list.flatMap((d) => d.playerIds));
    const needRide = roster.filter((p) => !assignedIds.has(p.id));

    box.innerHTML = `
      <div class="grid grid-3 mb">
        ${stat("🚗", "Fahrer", list.length, `${seats} Plätze`)}
        ${stat("🧍", "Zugeordnet", assigned, `von ${roster.length} Spieler`)}
        ${stat("⚠️", "Ohne Fahrt", needRide.length, needRide.length ? "noch offen" : "alle versorgt")}
      </div>
      <div class="grid grid-2">
        ${list.length ? list.map((d) => `
          <div class="card">
            <div class="card-head"><h3>🚗 ${esc(d.name)}</h3><span class="spacer"></span>
              <span class="badge ${d.playerIds.length >= d.seats ? "warn" : "good"}">${d.playerIds.length}/${d.seats} Plätze</span></div>
            <div class="sub soft mb">${esc(d.phone || "")}</div>
            <div class="list mb">
              ${d.playerIds.length ? d.playerIds.map((pid) => `
                <div class="list-item" style="padding:8px 10px">${avatar(...pn(pid))}
                  <div class="grow title">${esc(playerName(pid))}</div>
                  <button class="btn sm ghost" data-unassign="${d.id}:${pid}">✕</button></div>`).join("")
                : `<div class="muted" style="padding:6px">Noch keine Mitfahrer</div>`}
            </div>
            <div class="flex">
              <button class="btn sm outline" data-assign="${d.id}" ${d.playerIds.length >= d.seats ? "disabled" : ""}>＋ Mitfahrer</button>
              <span class="spacer"></span>
              <button class="btn sm ghost" data-dedit="${d.id}">✏️</button>
              <button class="btn sm ghost" data-ddel="${d.id}">🗑️</button>
            </div>
          </div>`).join("") : empty("🚙", "Noch keine Fahrer eingetragen")}
      </div>
      ${needRide.length ? `<div class="card mt"><div class="card-head"><h3>⚠️ Spieler ohne Fahrt (${needRide.length})</h3></div>
        <div class="chip-row">${needRide.map((p) => `<span class="chip">${esc(p.firstName)} ${esc(p.lastName)}</span>`).join("")}</div></div>` : ""}`;

    $$("[data-ddel]", box).forEach((b) => b.onclick = () => confirmDialog("Fahrer entfernen?", () => { Store.remove("drivers", b.dataset.ddel); toast("Fahrer entfernt"); reload(); }));
    $$("[data-dedit]", box).forEach((b) => b.onclick = () => driverForm(evt.id, Store.byId("drivers", b.dataset.dedit)));
    $$("[data-unassign]", box).forEach((b) => b.onclick = () => {
      const [did, pid] = b.dataset.unassign.split(":");
      const d = Store.byId("drivers", did);
      Store.update("drivers", did, { playerIds: d.playerIds.filter((x) => x !== pid) });
      reload();
    });
    $$("[data-assign]", box).forEach((b) => b.onclick = () => assignRider(evt, Store.byId("drivers", b.dataset.assign)));
  }
  function pn(pid) { const p = Store.byId("players", pid); return p ? [p.firstName, p.lastName] : ["?", ""]; }

  function driverForm(eventId, d) {
    const isEdit = !!d;
    d = d || { name: "", phone: "", seats: 4, playerIds: [], notes: "" };
    modal({
      title: isEdit ? "Fahrer bearbeiten" : "Fahrer hinzufügen",
      body: `<form id="df"><div class="form-grid">
        <div class="field"><label>Name Fahrer:in</label><input name="name" value="${esc(d.name)}" required></div>
        <div class="field"><label>Telefon</label><input name="phone" value="${esc(d.phone)}"></div>
        <div class="field"><label>Freie Plätze</label><input type="number" name="seats" min="1" max="8" value="${esc(d.seats)}"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#df"); if (!f.reportValidity()) return;
          const data = formData(f); data.seats = Number(data.seats) || 1;
          if (isEdit) Store.update("drivers", d.id, data);
          else Store.add("drivers", Object.assign({ eventId, playerIds: [] }, data));
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  function assignRider(evt, d) {
    const list = S().drivers.filter((x) => x.eventId === evt.id);
    const assigned = new Set(list.flatMap((x) => x.playerIds));
    const avail = S().players.filter((p) => p.membershipStatus !== "inaktiv" && !assigned.has(p.id));
    if (!avail.length) { toast("Alle Spieler sind bereits zugeordnet"); return; }
    modal({
      title: `Mitfahrer → ${esc(d.name)}`,
      body: `<div class="list">${avail.map((p) => `
        <label class="list-item" style="cursor:pointer">${avatar(p.firstName, p.lastName, p)}
          <div class="grow title">${esc(p.firstName)} ${esc(p.lastName)}</div>
          <input type="checkbox" data-pl="${p.id}" style="width:auto"></label>`).join("")}</div>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Zuordnen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const picks = $$("[data-pl]:checked", m).map((c) => c.dataset.pl);
          const free = d.seats - d.playerIds.length;
          if (picks.length > free) { toast(`Nur noch ${free} Platz/Plätze frei`, "bad"); return; }
          Store.update("drivers", d.id, { playerIds: d.playerIds.concat(picks) });
          closeModal(); toast("Zugeordnet", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     HEIMSPIEL-JOBS (Catering, Helfer, sonstige)
     ====================================================================== */
  function jobs(el) {
    const events = S().events.filter((e) => e.type === "home" || e.type === "other")
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const sel = jobs._sel && events.find((e) => e.id === jobs._sel) ? jobs._sel : (events[0] || {}).id;
    const evt = Store.byId("events", sel);

    el.innerHTML = `
      ${head("Heimspiel-Jobs", "Catering, Helfer und weitere Aufgaben für Heimspiele & Events vergeben",
        `<button class="btn" data-add ${evt ? "" : "disabled"}>＋ Job</button>`)}
      <div class="field" style="max-width:520px">
        <label>Veranstaltung</label>
        <select id="jsel">${events.map((e) => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${fmtDateShort(e.start)} · ${esc(e.title)}</option>`).join("")}</select>
      </div>
      <div id="jbody" class="mt-lg"></div>`;

    $("#jsel", el).onchange = (ev) => { jobs._sel = ev.target.value; reload(); };
    if ($("[data-add]", el)) $("[data-add]", el).onclick = () => jobForm(evt.id);
    renderJobsBody($("#jbody", el), evt);
  }

  const jobCat = { catering: { label: "Catering", icon: "🍰" }, helper: { label: "Helfer", icon: "🙌" }, other: { label: "Sonstiges", icon: "🔧" } };
  function renderJobsBody(box, evt) {
    if (!evt) { box.innerHTML = empty("🙌", "Keine Veranstaltung vorhanden"); return; }
    const list = S().jobs.filter((j) => j.eventId === evt.id);
    const done = list.filter((j) => j.assignee).length;

    box.innerHTML = `
      <div class="grid grid-3 mb">
        ${stat("📋", "Jobs gesamt", list.length)}
        ${stat("✅", "Vergeben", done, `${list.length - done} offen`)}
        ${stat("📊", "Abdeckung", list.length ? Math.round(done / list.length * 100) + "%" : "—")}
      </div>
      <div class="grid grid-3">
        ${Object.keys(jobCat).map((cat) => {
          const items = list.filter((j) => j.category === cat);
          return `<div class="card">
            <div class="card-head"><h3>${jobCat[cat].icon} ${jobCat[cat].label}</h3><span class="badge">${items.length}</span></div>
            <div class="list">
              ${items.length ? items.map((j) => `
                <div class="list-item" style="padding:10px">
                  <div class="grow"><div class="title" style="${j.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(j.title)}</div>
                    <div class="sub">${j.assignee ? `👤 ${esc(j.assignee)}` : '<span class="badge warn">unbesetzt</span>'}</div></div>
                  <button class="btn sm ghost" data-jdone="${j.id}" title="Erledigt">${j.done ? "↺" : "✔"}</button>
                  <button class="btn sm ghost" data-jedit="${j.id}">✏️</button>
                  <button class="btn sm ghost" data-jdel="${j.id}">🗑️</button>
                </div>`).join("") : `<div class="muted" style="padding:6px">Keine Jobs</div>`}
            </div>
            <button class="btn sm outline mt" data-jadd="${cat}">＋ ${jobCat[cat].label}-Job</button>
          </div>`;
        }).join("")}
      </div>
      ${(() => {
        // Buffet-Ankündigungen aus dem Portal (Familien tragen je Heimspiel ein, was sie mitbringen)
        const buffet = (S().buffet || []).filter((b) => b.eventId === evt.id);
        return `<div class="card mt">
          <div class="card-head"><h3>🥗 Angekündigte Buffet-Beiträge (Portal)</h3><span class="badge">${buffet.length}</span></div>
          ${buffet.length ? `<div class="list">${buffet.map((b) => `
            <div class="list-item" style="padding:9px 10px"><div class="grow">
              <div class="title" style="font-size:.9rem">${esc(b.beitrag)}</div>
              <div class="sub">👤 ${esc(b.name || "unbekannt")}</div></div></div>`).join("")}</div>`
          : `<p class="soft" style="margin:0">Noch keine Ankündigungen – Familien tragen im Portal unter „Termine" ein, was sie mitbringen.</p>`}
        </div>`;
      })()}`;

    $$("[data-jdone]", box).forEach((b) => b.onclick = () => {
      const j = Store.byId("jobs", b.dataset.jdone);
      Store.update("jobs", j.id, { done: !j.done });
      if (!j.done) volleyballFlug();
      reload();
    });
    $$("[data-jedit]", box).forEach((b) => b.onclick = () => jobForm(evt.id, Store.byId("jobs", b.dataset.jedit)));
    $$("[data-jdel]", box).forEach((b) => b.onclick = () => confirmDialog("Job löschen?", () => { Store.remove("jobs", b.dataset.jdel); toast("Job gelöscht"); reload(); }));
    $$("[data-jadd]", box).forEach((b) => b.onclick = () => jobForm(evt.id, null, b.dataset.jadd));
  }

  function jobForm(eventId, j, presetCat) {
    const isEdit = !!j;
    j = j || { category: presetCat || "catering", title: "", assignee: "", done: false };
    modal({
      title: isEdit ? "Job bearbeiten" : "Neuer Job",
      body: `<form id="jf"><div class="form-grid">
        <div class="field"><label>Kategorie</label><select name="category">
          ${Object.entries(jobCat).map(([k, v]) => `<option value="${k}" ${k === j.category ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
        <div class="field"><label>Zuständig (Name)</label><input name="assignee" value="${esc(j.assignee)}" placeholder="offen lassen = unbesetzt"></div>
        <div class="field full"><label>Aufgabe</label><input name="title" value="${esc(j.title)}" required></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#jf"); if (!f.reportValidity()) return;
          const d = formData(f);
          if (isEdit) Store.update("jobs", j.id, d); else Store.add("jobs", Object.assign({ eventId, done: false }, d));
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     EINVERSTÄNDNISERKLÄRUNGEN
     ====================================================================== */
  function consents(el) {
    const s = S();
    const missing = s.players.filter((p) => !p.consentOnFile);
    el.innerHTML = `
      ${head("Einverständniserklärungen", "Von den Eltern unterschriebene Formulare erfassen und ablegen",
        `<button class="btn" data-add>⬆️ Formular hochladen</button>`)}
      <div class="grid grid-3 mb">
        ${stat("📄", "Erfasste Formulare", s.consents.length)}
        ${stat("✅", "Vollständig", s.players.filter((p) => p.consentOnFile).length, `von ${s.players.length}`)}
        ${stat("⚠️", "Noch offen", missing.length, missing.length ? "bitte einholen" : "vollständig")}
      </div>

      ${missing.length ? `<div class="card mb"><div class="card-head"><h3>⚠️ Fehlende Einverständniserklärungen</h3></div>
        <div class="table-wrap"><table><thead><tr><th>Spieler</th><th>Eltern</th><th>Kontakt</th><th class="right">Aktion</th></tr></thead>
        <tbody>${missing.map((p) => `<tr>
          <td>${esc(p.firstName)} ${esc(p.lastName)}</td><td>${esc(p.parentName)}</td>
          <td class="soft">${mailtoLink(p.parentEmail) || "—"}</td>
          <td class="right"><button class="btn sm outline" data-remind="${p.id}">Erinnern</button>
          <button class="btn sm" data-upload="${p.id}">Hochladen</button></td></tr>`).join("")}</tbody></table></div></div>` : ""}

      <div class="card mb" style="padding:0"><div class="card-head" style="padding:18px 18px 0"><h3>📁 Abgelegte Formulare</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Spieler</th><th>Art</th><th>Datei</th><th>Unterschrift</th><th>Erfasst am</th><th class="right"></th></tr></thead>
          <tbody>${s.consents.map((c) => `<tr>
            <td><strong>${esc(playerName(c.playerId))}</strong></td>
            <td>${esc(c.type)}</td>
            <td>${c.dataUrl ? `<a href="${c.dataUrl}" download="${esc(c.fileName)}">📎 ${esc(c.fileName)}</a>` : `📎 ${esc(c.fileName)} <span class="badge">Demo</span>`}</td>
            <td>${esc(c.signedBy)}</td>
            <td class="soft">${fmtDateShort(c.uploadedAt)}</td>
            <td class="right"><button class="btn sm ghost" data-cdel="${c.id}">🗑️</button></td></tr>`).join("")
            || `<tr><td colspan="6">${empty("📄", "Noch keine Formulare erfasst")}</td></tr>`}</tbody>
        </table></div></div>

      <div class="card">
        <div class="card-head"><h3>🗂️ Formular-Vorlagen</h3><span class="spacer"></span>
          <button class="btn sm" data-tadd>＋ Vorlage</button></div>
        <p class="soft" style="font-size:.85rem;margin-top:0">Eigene Einverständnis-Vorlagen anlegen, ändern und löschen.
        Vorlagen erscheinen als Auswahl beim Hochladen und lassen sich als Formular drucken/als PDF sichern.</p>
        <div class="list">
          ${s.consentTemplates.map((t) => {
            const cnt = s.consents.filter((c) => c.type === t.name).length;
            return `<div class="list-item">
              <div class="grow"><div class="title">${esc(t.name)} ${t.required ? '<span class="badge bad">Pflicht</span>' : '<span class="badge">optional</span>'}</div>
                <div class="sub">${esc(t.text.slice(0, 110))}${t.text.length > 110 ? "…" : ""}</div></div>
              <span class="badge info nowrap">${cnt}× erfasst</span>
              <button class="btn sm ghost" data-tprint="${t.id}" title="Formular drucken">🖨️</button>
              <button class="btn sm ghost" data-tedit="${t.id}">✏️</button>
              <button class="btn sm ghost" data-tdel="${t.id}">🗑️</button>
            </div>`;
          }).join("") || empty("🗂️", "Noch keine Vorlagen – jetzt anlegen")}
        </div>
      </div>

      <div class="card mt">
        <div class="card-head"><h3>📑 Sammeldokument Pflicht-Erklärungen</h3><span class="spacer"></span>
          <button class="btn sm" data-collective>🖨️ Drucken / PDF</button></div>
        <p class="soft" style="font-size:.88rem;margin-top:0">Zum Saisonstart: <strong>alle Pflicht-Formulare in
        einem Dokument</strong> (${s.consentTemplates.filter((t) => t.required).length} Erklärungen). Der Spieler trägt seine Daten
        <strong>nur einmal</strong> ein, die Eltern unterschreiben <strong>nur einmal</strong> für alle Erklärungen –
        jede Erklärung wird einzeln angekreuzt.</p>
      </div>

      <div class="card mt">
        <div class="card-head"><h3>💌 Elternbriefe des Trainers</h3><span class="spacer"></span>
          <button class="btn sm" data-ladd>＋ Neuer Brief</button></div>
        <p class="soft" style="font-size:.88rem;margin-top:0">Briefe an die Eltern – frei bearbeitbar, mit
        Rückmeldefrist, Terminen aus dem Kalender und Rückmeldeabschnitt.
        📨 <strong>Serienbrief</strong>: ein personalisierter Brief pro Spieler (Daten werden automatisch eingesetzt).</p>
        ${(() => {
          const h = s.events.filter((e) => e.type === "home" && daysUntil(e.start) >= 0).length;
          const a = s.events.filter((e) => e.type === "away" && daysUntil(e.start) >= 0).length;
          return `<p class="soft" style="font-size:.82rem">📅 Aktuell werden <strong>${h} Heimspiele</strong> und <strong>${a} Auswärtsspiele</strong> aus dem
            Kalender eingefügt.${(h + a) === 0 ? ` <span class="badge warn">Hinweis</span> Keine Spieltermine gefunden – importierte Termine ggf. in der
            Kalender-<strong>Listenansicht</strong> per Auswahlfeld als Heim-/Auswärtsspiel einstufen.` : ""}</p>`;
        })()}
        <div class="list">
          ${s.letters.map((l) => `
            <div class="list-item">
              <div class="grow"><div class="title">${esc(l.title)}</div>
                <div class="sub">${l.deadline ? `⏰ Rückmeldung bis ${fmtDateShort(l.deadline)}` : "ohne Frist"} ·
                  ${l.includeHomeGames ? "mit Terminen" : "ohne Termine"} · ${l.includeSlip ? "mit Rückmeldeabschnitt" : "ohne Abschnitt"}</div></div>
              <button class="btn sm outline" data-lserial="${l.id}" title="Serienbrief: ein Brief pro Spieler">📨 Serienbrief</button>
              <button class="btn sm ghost" data-lprint="${l.id}" title="Drucken">🖨️</button>
              <button class="btn sm ghost" data-ledit="${l.id}">✏️</button>
              <button class="btn sm ghost" data-ldel="${l.id}">🗑️</button>
            </div>`).join("") || empty("💌", "Noch keine Briefe – jetzt anlegen")}
        </div>
      </div>`;

    $("[data-add]", el).onclick = () => consentForm();
    $$("[data-upload]", el).forEach((b) => b.onclick = () => consentForm(b.dataset.upload));
    $$("[data-remind]", el).forEach((b) => b.onclick = () => {
      const p = Store.byId("players", b.dataset.remind); contactParent(p);
    });
    $$("[data-cdel]", el).forEach((b) => b.onclick = () => confirmDialog("Formular-Eintrag löschen?", () => {
      Store.remove("consents", b.dataset.cdel); toast("Eintrag gelöscht"); reload();
    }));
    $("[data-tadd]", el).onclick = () => consentTemplateForm();
    $$("[data-tedit]", el).forEach((b) => b.onclick = () => consentTemplateForm(Store.byId("consentTemplates", b.dataset.tedit)));
    $$("[data-tdel]", el).forEach((b) => b.onclick = () => {
      const t = Store.byId("consentTemplates", b.dataset.tdel);
      confirmDialog(`Vorlage „${t.name}" löschen? Bereits abgelegte Formulare bleiben erhalten.`, () => {
        Store.remove("consentTemplates", t.id); toast("Vorlage gelöscht"); reload();
      });
    });
    $$("[data-tprint]", el).forEach((b) => b.onclick = () => printConsentTemplate(Store.byId("consentTemplates", b.dataset.tprint)));
    $("[data-collective]", el).onclick = () => printCollectiveConsent();
    $("[data-ladd]", el).onclick = () => letterForm();
    $$("[data-ledit]", el).forEach((b) => b.onclick = () => letterForm(Store.byId("letters", b.dataset.ledit)));
    $$("[data-ldel]", el).forEach((b) => b.onclick = () => {
      const l = Store.byId("letters", b.dataset.ldel);
      confirmDialog(`Brief „${l.title}" löschen?`, () => { Store.remove("letters", l.id); toast("Brief gelöscht"); reload(); });
    });
    $$("[data-lprint]", el).forEach((b) => b.onclick = () => printParentLetter(Store.byId("letters", b.dataset.lprint)));
    $$("[data-lserial]", el).forEach((b) => b.onclick = () => serialLetterModal(Store.byId("letters", b.dataset.lserial)));
  }

  function letterForm(l) {
    const isEdit = !!l;
    l = l || { title: "", body: "Liebe Eltern,\n\n", deadline: "", trainingTime: "", includeHomeGames: true, includeSlip: true, includeConsents: true };
    modal({
      title: isEdit ? "Elternbrief bearbeiten" : "Neuer Elternbrief",
      wide: true,
      body: `<form id="lf"><div class="form-grid">
        <div class="field"><label>Titel</label><input name="title" value="${esc(l.title)}" required placeholder="z. B. Elternbrief zum Saisonstart"></div>
        <div class="field"><label>⏰ Rückmeldefrist</label><input type="date" name="deadline" value="${esc(l.deadline)}"></div>
        <div class="field full"><label>Brieftext <span class="soft" style="font-weight:400">(Absätze mit Leerzeile trennen; „## " = Überschrift; Platzhalter für Serienbrief: {vorname}, {nachname}, {eltern})</span></label>
          <textarea name="body" rows="14" required>${esc(l.body)}</textarea></div>
        <div class="field full"><label>🏐 Regelmäßige Trainingszeit <span class="soft" style="font-weight:400">(von Hand eintragen – erscheint im Termine-Block; leer = Linie zum Ausfüllen)</span></label>
          <input name="trainingTime" value="${esc(l.trainingTime || "")}" placeholder="z. B. donnerstags 14:30–16:30 Uhr, Sporthalle Am Bürgersee"></div>
        <div class="field full"><label><input type="checkbox" name="includeHomeGames" ${l.includeHomeGames ? "checked" : ""} style="width:auto"> 📅 Termine-Seite („für die Pinnwand") einfügen – mit diesen Kategorien:</label>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 0 24px">
            ${(() => {
              const gewaehlt = Array.isArray(l.terminArten) ? l.terminArten : ["home", "away"];
              const kat = [["home", "🏟️ Heimspiele"], ["away", "🚌 Auswärtsspiele"], ["other", "📌 Sonstige Termine"],
                           ...eventCats().map((c) => [c.id, (c.emoji ? c.emoji + " " : "") + c.name])];
              return kat.map(([k, label]) => `<label style="font-weight:400;display:flex;align-items:center;gap:6px">
                <input type="checkbox" name="ta_${k}" ${gewaehlt.includes(k) ? "checked" : ""} style="width:auto"> ${esc(label)}</label>`).join("");
            })()}
          </div></div>
        <div class="field"><label><input type="checkbox" name="includeSlip" ${l.includeSlip ? "checked" : ""} style="width:auto"> Rückmeldeabschnitt (E-Mail, Mobil, WhatsApp, Fahrer, Buffet) anhängen</label></div>
        <div class="field"><label><input type="checkbox" name="includeConsents" ${l.includeConsents !== false ? "checked" : ""} style="width:auto"> Pflicht-Erklärungen als vorausgefüllte Zusatzseite anhängen (Serienbrief)</label></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button>
        <button class="btn outline" data-p>🖨️ Vorschau/Druck</button>
        <button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const collect = () => {
          const d = formData(m.querySelector("#lf"));
          const terminArten = Object.keys(d).filter((k) => k.startsWith("ta_") && d[k]).map((k) => k.slice(3));
          return { title: d.title, body: d.body, deadline: d.deadline, trainingTime: d.trainingTime || "",
            includeHomeGames: !!d.includeHomeGames, includeSlip: !!d.includeSlip, includeConsents: !!d.includeConsents,
            terminArten };
        };
        m.querySelector("[data-p]").onclick = () => printParentLetter(collect());
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#lf"); if (!f.reportValidity()) return;
          const d = collect();
          if (isEdit) Store.update("letters", l.id, d);
          else Store.add("letters", Object.assign({ createdAt: new Date().toISOString() }, d));
          closeModal(); toast("Brief gespeichert", "good"); reload();
        };
      },
    });
  }

  // Sammeldokument: alle Pflicht-Erklärungen, Daten & Unterschrift nur einmal
  function printCollectiveConsent() {
    const req = S().consentTemplates.filter((t) => t.required);
    if (!req.length) { toast("Keine Pflicht-Vorlagen vorhanden", "bad"); return; }
    const secs = req.map((t, i) => `
      <div class="sec">
        <div class="sec-head"><span class="num">${i + 1}</span> ${esc(t.name)}</div>
        <div class="sec-body">${esc(t.text).replace(/\n/g, "<br>")}</div>
        <div class="agree">☐ <strong>Ich stimme zu</strong>&nbsp;&nbsp;&nbsp;☐ Ich stimme nicht zu</div>
      </div>`).join("");
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Sammel-Einverständniserklärung SKV Müritz</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:34px auto;max-width:720px;font-size:13px;line-height:1.5}
        h1{font-size:19px;color:#1e3a8a;margin-bottom:2px}
        .sub{color:#666;font-size:11.5px;margin-bottom:16px}
        .box{border:1px solid #999;border-radius:8px;padding:14px;margin-bottom:18px}
        .box .line{border-bottom:1px solid #333;margin:14px 0 3px;padding-bottom:2px}
        .box .cols{display:flex;gap:24px}.box .cols>div{flex:1}
        .sec{border:1px solid #bbb;border-radius:8px;padding:12px 14px;margin:10px 0;page-break-inside:avoid}
        .sec-head{font-weight:700;color:#1e3a8a;margin-bottom:6px}
        .num{display:inline-block;background:#1e3a8a;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:11px;margin-right:6px}
        .sec-body{font-size:12px;color:#222}
        .agree{margin-top:8px;font-size:12.5px}
        .sign{margin-top:30px;display:flex;gap:50px;page-break-inside:avoid}.sign div{border-top:1px solid #333;padding-top:4px;font-size:11px;flex:1}
        .note{font-size:11px;color:#555;margin-top:14px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>🏐 SKV Müritz – Sammel-Einverständniserklärung zum Saisonstart</h1>
      <div class="sub">www.skv-mueritz.de · Abteilung Volleyball · Saison ${esc(`${S().season.year}/${String(S().season.year + 1).slice(2)}`)}</div>

      <div class="box">
        <strong>Angaben zum Spieler und zu den Erziehungsberechtigten</strong> (bitte einmal ausfüllen – gilt für alle Erklärungen)
        <div class="cols">
          <div><div class="line">Name, Vorname des Spielers:</div></div>
          <div><div class="line">Geburtsdatum:</div></div>
        </div>
        <div class="line">Name der/des Erziehungsberechtigten:</div>
        <div class="cols">
          <div><div class="line">E-Mail-Adresse:</div></div>
          <div><div class="line">Mobilnummer:</div></div>
        </div>
      </div>

      <p><strong>Hiermit erkläre ich mich mit den nachfolgend angekreuzten Punkten einverstanden:</strong></p>
      ${secs}

      <p class="note">Alle Einwilligungen sind freiwillig und können jederzeit mit Wirkung für die Zukunft schriftlich
      widerrufen werden. Die Daten werden ausschließlich für die Vereinsarbeit des SKV Müritz genutzt.</p>
      <div class="sign"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte/r</div></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken", "bad"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }

  // Elternbrief drucken – nutzt den bearbeitbaren Brief (Titel, Text, Frist, Optionen).
  // playersList (optional): Serienbrief – ein personalisierter Brief pro Spieler.
  // docTitle (optional): Fenster-/Dokumenttitel – wird beim "Als PDF sichern" zum Dateinamen.
  function printParentLetter(l, playersList, docTitle) {
    l = l || S().letters[0];
    if (!l) { toast("Kein Brief vorhanden – bitte zuerst anlegen", "bad"); return; }
    // Termine je Datum zusammenfassen: ein Listeneintrag pro Datum
    const futureOf = (type) => S().events.filter((e) => e.type === type && daysUntil(e.start) >= 0)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const groupByDate = (evs) => {
      const map = new Map();
      evs.forEach((e) => { const k = String(e.start).slice(0, 10); if (!map.has(k)) map.set(k, []); map.get(k).push(e); });
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    };
    // Datum/Uhrzeit aus importierten Titeln entfernen (steht sonst doppelt in der Zeile)
    const stripDateTime = (t) => String(t || "")
      .replace(/\b(?:mo|di|mi|do|fr|sa|so)\.?,?\s+\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\b/gi, "")
      .replace(/\b\d{1,2}\.\s?(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s?(?:\d{2,4})?\b/gi, "")
      .replace(/\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\b/g, "")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\b\d{1,2}:\d{2}(?:\s*Uhr)?\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–:,·]+|[\s\-–:,·]+$/g, "").trim();
    const dateList = (evs) => groupByDate(evs).map(([day, items]) =>
      `<li><strong>${fmtDate(items[0].start)}</strong> – ${items.map((g) =>
        `${fmtTime(g.start)} Uhr ${esc(stripDateTime(g.title))}${g.opponent ? " gegen " + esc(g.opponent) : ""}${g.location ? " (" + esc(g.location) + ")" : ""}`
      ).join(" · ")}</li>`).join("");
    const blanks = `<ul><li>______________________________</li><li>______________________________</li><li>______________________________</li></ul>`;
    // Gewählte Termin-Kategorien für die Pinnwand-Seite (Brief-Editor);
    // Standard wie früher: Heim- und Auswärtsspiele.
    const terminArten = Array.isArray(l.terminArten) && l.terminArten.length ? l.terminArten : ["home", "away"];
    const artInfo = (k) => {
      if (k === "home") return { titel: "🏟️ Heimspiele", blanks: true };
      if (k === "away") return { titel: "🚌 Auswärtsspiele", blanks: true };
      if (k === "other") return { titel: "📌 Weitere Termine", blanks: false };
      const c = (S().eventCategories || []).find((x) => x.id === k);
      return c ? { titel: `${c.emoji || "📌"} ${c.name}`, blanks: false } : null;
    };
    // Trainingszeit: kommt bewusst NICHT aus dem Kalender, sondern wird im
    // Brief-Editor von Hand eingetragen (Feld „Regelmäßige Trainingszeit").
    const trainingText = () => String(l.trainingTime || "").trim();
    const trainingLine = () => trainingText() ? esc(trainingText()) : "_______________________________";
    // Termine als eigene, ganze Seite – gestaltet für die Pinnwand.
    // Ziel: ALLE gewählten Termin-Blöcke passen zusammen auf EINE Seite –
    // bei vielen Terminen schaltet die Seite automatisch auf die Kompaktstufe.
    const pinZeilen = () => terminArten.reduce((summe, k) => {
      const info = artInfo(k);
      if (!info) return summe;
      const evs = futureOf(k);
      return summe + (evs.length ? groupByDate(evs).length : (info.blanks ? 3 : 0)) + 2;
    }, 0);
    const gamesHTMLFor = () => !l.includeHomeGames ? "" : `
      <div class="pin ${pinZeilen() > 22 ? "pin-eng" : ""}">
        <div class="pin-titel">📅 Unsere Termine</div>
        <div class="pin-unter">SKV Müritz · Abteilung Volleyball · für die Pinnwand</div>
        <div class="pin-training">🏐 Regelmäßiges Training<span>${trainingLine()}</span></div>
        ${terminArten.map((k) => {
          const info = artInfo(k);
          if (!info) return "";
          const evs = futureOf(k);
          if (!evs.length && !info.blanks) return "";
          return `<div class="pin-block">
            <div class="pin-block-titel">${esc(info.titel)}</div>
            ${evs.length ? `<ul>${dateList(evs)}</ul>` : `<p class="pin-leer">Die Termine werden rechtzeitig bekannt gegeben bzw. hier ergänzt:</p>${blanks}`}
          </div>`;
        }).join("")}
      </div>`;
    // Pflicht-Erklärungen (Einverständnis-Vorlagen mit „Pflicht") als eigene,
    // je Spieler VORAUSGEFÜLLTE Seite hinter dem Brief (Serienbrief).
    const reqTpls = S().consentTemplates.filter((t) => t.required);
    const consentHTMLFor = (pl2) => {
      if (l.includeConsents === false || !reqTpls.length) return "";
      const parents = pl2 ? [pl2.parentName, pl2.parent2Name].filter(Boolean).join(" und ") : "";
      const line = (label, val) => `<div class="line">${label}${val ? ` <strong>${esc(val)}</strong>` : ""}</div>`;
      const secs = reqTpls.map((t, i) => `
        <div class="sec">
          <div class="sec-head"><span class="num">${i + 1}</span> ${esc(t.name)}</div>
          <div class="sec-body">${esc(t.text).replace(/\n/g, "<br>")}</div>
          <div class="agree">☐ <strong>Ich stimme zu</strong>&nbsp;&nbsp;&nbsp;☐ Ich stimme nicht zu</div>
        </div>`).join("");
      return `
      <h1>🏐 SKV Müritz – Sammel-Einverständniserklärung</h1>
      <div class="sub">www.skv-mueritz.de · Abteilung Volleyball · ${reqTpls.length} Pflicht-Erklärungen</div>
      <div class="box">
        <strong>Angaben zum Spieler und zu den Erziehungsberechtigten</strong>
        <div class="cols">
          <div>${line("Name, Vorname des Spielers:", pl2 ? `${pl2.lastName}, ${pl2.firstName}` : "")}</div>
          <div>${line("Geburtsdatum:", pl2 && pl2.birthDate ? fmtDateShort(pl2.birthDate) : "")}</div>
        </div>
        ${line("Name der/des Erziehungsberechtigten:", parents)}
        <div class="cols">
          <div>${line("E-Mail-Adresse:", pl2 ? (pl2.parentEmail || pl2.playerEmail || "") : "")}</div>
          <div>${line("Mobilnummer:", pl2 ? (pl2.parentPhone || pl2.playerPhone || "") : "")}</div>
        </div>
      </div>
      <p><strong>Hiermit erkläre ich mich mit den nachfolgend angekreuzten Punkten einverstanden:</strong></p>
      ${secs}
      <p class="note">Alle Einwilligungen sind freiwillig und können jederzeit mit Wirkung für die Zukunft schriftlich
      widerrufen werden. Die Daten werden ausschließlich für die Vereinsarbeit des SKV Müritz genutzt.</p>
      <div class="sign"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte/r</div></div>`;
    };
    // Platzhalter {vorname} {nachname} {eltern} ersetzen (Serienbrief: je Spieler)
    const fill = (text, pl2) => String(text || "")
      .replace(/\{vorname\}/gi, pl2 ? pl2.firstName : "…")
      .replace(/\{nachname\}/gi, pl2 ? pl2.lastName : "…")
      .replace(/\{eltern\}/gi, pl2 ? ([pl2.parentName, pl2.parent2Name].filter(Boolean).join(" und ") || "Eltern") : "Eltern");
    // Brieftext: Leerzeilen = Absätze, "## " am Zeilenanfang = Überschrift
    const toBodyHTML = (pl2) => fill(l.body, pl2).split(/\n{2,}/).map((block) => {
      const lines = block.split("\n");
      return lines.map((line) =>
        line.startsWith("## ") ? `<h2>${esc(line.slice(3))}</h2>` : line.trim() === "" ? "" : `<span>${esc(line)} </span>`
      ).join("");
    }).map((b) => b.startsWith("<h2>") ? b : `<p>${b}</p>`).join("");
    const deadlineTxt = l.deadline ? `bitte bis zum <strong>${fmtDate(l.deadline)}</strong> zurückgeben` : "bitte bis zum nächsten Training zurückgeben";

    // Ein Brief (ggf. personalisiert für einen Spieler)
    const oneLetter = (pl2) => {
      const parents = pl2 ? [pl2.parentName, pl2.parent2Name].filter(Boolean).join(" und ") : "";
      const pref = (val, filled) => filled ? `<div class="line">${val} <strong>${esc(filled)}</strong></div>` : `<div class="line">${val}</div>`;
      // Der Brief wird in explizite Seiten zerlegt: so kann jede Seite eine
      // Fußzeile (Spielername · Seite X von Y) tragen, sobald es mehr als
      // eine Seite gibt.
      const seiten = [];
      seiten.push(`
      <h1>🏐 SKV Müritz – Abteilung Volleyball</h1>
      <div class="sub">www.skv-mueritz.de · ${esc(l.title || "Elternbrief zur Saison")}${l.deadline ? ` · Rückmeldung bis ${fmtDateShort(l.deadline)}` : ""}</div>
      ${pl2 ? `<div class="addr">An die Eltern von</div>
      <div class="addr-name">${esc(pl2.firstName)} ${esc(pl2.lastName)}</div>
      ${parents || playerDeptIds(pl2).length ? `<div class="addr">${[parents ? esc(parents) : "", playerDeptIds(pl2).length ? esc(playerDeptNames(pl2)) : ""].filter(Boolean).join(" · ")}</div>` : ""}` : ""}
      <div style="margin-top:22px">${toBodyHTML(pl2)}</div>`);
      const pinSeite = gamesHTMLFor(pl2);
      if (pinSeite) seiten.push(pinSeite);
      if (l.includeSlip) seiten.push(`
      <div class="cut"></div>
      <div class="slip">
        <strong>Rückmeldung an das Trainerteam</strong>
        <div class="frist">⏰ ${deadlineTxt.charAt(0).toUpperCase() + deadlineTxt.slice(1)}!</div>
        ${pref("Name des Kindes:", pl2 ? `${pl2.firstName} ${pl2.lastName}` : "")}
        <div class="slip-gruppe">👤 Kontaktdaten – bitte je Person eintragen</div>
        <div class="slip-zeile">
          <div class="line lz-name">Erziehungsberechtigte/r 1:${pl2 && pl2.parentName ? ` <strong>${esc(pl2.parentName)}</strong>` : ""}</div>
          <div class="line lz-mobil">Mobil:${pl2 && pl2.parentPhone ? ` <strong>${esc(pl2.parentPhone)}</strong>` : ""}</div>
          <div class="line lz-mail">E-Mail:${pl2 && pl2.parentEmail ? ` <strong>${esc(pl2.parentEmail)}</strong>` : ""}</div>
        </div>
        <div class="slip-zeile">
          <div class="line lz-name">Erziehungsberechtigte/r 2 <span class="lz-hinweis">(bei geteiltem Sorgerecht)</span>:${pl2 && pl2.parent2Name ? ` <strong>${esc(pl2.parent2Name)}</strong>` : ""}</div>
          <div class="line lz-mobil">Mobil:${pl2 && pl2.parent2Phone ? ` <strong>${esc(pl2.parent2Phone)}</strong>` : ""}</div>
          <div class="line lz-mail">E-Mail:${pl2 && pl2.parent2Email ? ` <strong>${esc(pl2.parent2Email)}</strong>` : ""}</div>
        </div>
        <div class="slip-zeile">
          <div class="line lz-name">Spieler:in <span class="lz-hinweis">(eigenes Handy, freiwillig)</span></div>
          <div class="line lz-mobil">Mobil:${pl2 && pl2.playerPhone ? ` <strong>${esc(pl2.playerPhone)}</strong>` : ""}</div>
          <div class="line lz-mail">E-Mail:${pl2 && pl2.playerEmail ? ` <strong>${esc(pl2.playerEmail)}</strong>` : ""}</div>
        </div>
        <div class="chk">☐ Ich stimme zu, dass das Trainerteam mich über E-Mail/Telefon kontaktiert.</div>
        <div class="chk">☐ Ich stimme der Aufnahme in die <strong>WhatsApp-Elterngruppe</strong> zu – unser zentraler
          Informationsweg und für den reibungslosen Ablauf der Saison notwendig.</div>
        <div class="slip-gruppe">🚗 Fahrbereitschaft zu Auswärtsspielen</div>
        <div class="chk">☐ Ich fahre <strong>regelmäßig</strong> (freie Plätze: ____ )</div>
        <div class="chk">☐ Ich fahre <strong>gelegentlich nach Absprache</strong> (freie Plätze: ____ )</div>
        <div class="chk">☐ Ich kann leider nicht fahren</div>
        <div class="slip-gruppe">🥗 Beteiligung am Heimspiel-Buffet</div>
        <div class="chk">☐ Ich steuere etwas bei:&nbsp;&nbsp;☐ Salat&nbsp;&nbsp;☐ belegte Brötchen&nbsp;&nbsp;☐ Kuchen&nbsp;&nbsp;☐ Getränke</div>
        <div class="chk">☐ Ich übernehme <strong>Standdienst</strong> an einem Heimspieltag</div>
        <div class="chk">☐ Ich kann mich diesmal nicht beteiligen</div>
        <div class="sign"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte/r</div></div>
      </div>`);
      const consentSeite = consentHTMLFor(pl2);
      if (consentSeite) seiten.push(consentSeite);
      const gesamt = seiten.length;
      const fussName = pl2 ? `${pl2.firstName} ${pl2.lastName}` : "";
      return seiten.map((inhalt, i) => `<div class="brief-seite">${inhalt}
        ${gesamt > 1 ? `<div class="fuss">${fussName ? esc(fussName) + " · " : ""}Seite ${i + 1} von ${gesamt}</div>` : ""}
      </div>`).join("");
    };

    const list = Array.isArray(playersList) && playersList.length ? playersList : [null];
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(docTitle || l.title || "Elternbrief SKV Müritz")}</title>
      <style>
        /* Durchgängig Arial, platzsparend, Vereinsfarben Blau/Orange */
        body{font-family:Arial,'Helvetica Neue',sans-serif;color:#111;margin:38px auto;max-width:700px;line-height:1.5;font-size:13.5px}
        p{margin:9px 0}
        h1{font-size:21px;color:#1e3a8a;margin:0;letter-spacing:.2px}
        .sub{color:#64748b;font-size:11.5px;margin:3px 0 0;padding-bottom:9px;border-bottom:2.5px solid #1e3a8a}
        .addr{font-size:11px;color:#64748b;margin-top:16px}
        .addr-name{font-size:17px;font-weight:700;color:#1e3a8a;margin:2px 0}
        .addr + .addr, .addr-name + .addr{margin-top:0}
        h2{font-size:14.5px;font-weight:800;color:#1e3a8a;margin:20px 0 6px}
        ul{margin:6px 0;padding-left:22px}
        li{margin:3px 0}
        /* Rückmeldeabschnitt: eigene Seite, Schnittlinie, nie umbrechen */
        .cut{border-top:2px dashed #94a3b8;margin:26px 0 16px;position:relative}
        .cut::before{content:"✂  hier abschneiden";position:absolute;top:-10px;left:12px;background:#fff;padding:0 8px;color:#64748b;font-size:11px}
        .slip{font-size:12.5px;border:1.5px solid #1e3a8a;border-radius:12px;padding:16px 18px;page-break-inside:avoid;break-inside:avoid}
        .slip>strong{font-size:14px;color:#1e3a8a}
        .slip .line{border-bottom:1px solid #334155;margin:15px 0 3px;padding-bottom:2px}
        .slip .frist{font-weight:800;font-size:14px;margin-top:7px;color:#9a3412;background:#fff7ed;border-radius:8px;padding:6px 10px;display:inline-block}
        .chk{margin:8px 0}
        .slip-gruppe{margin:14px 0 4px;font-weight:800;color:#1e3a8a;border-top:1px solid #e2e8f0;padding-top:10px}
        .slip-zeile{display:flex;gap:16px}
        .slip-zeile .lz-name{flex:2.2}.slip-zeile .lz-mobil{flex:1.2}.slip-zeile .lz-mail{flex:1.8}
        .lz-hinweis{font-weight:400;font-size:10.5px;color:#64748b}
        .sign{margin-top:32px;display:flex;gap:50px}.sign div{border-top:1px solid #334155;padding-top:4px;font-size:11px;flex:1;color:#334155}
        /* Pinnwand-Seite – kompakt, damit alle Termin-Blöcke auf EINE Seite passen */
        .pin{text-align:center}
        .pin-titel{font-size:24px;font-weight:800;color:#1e3a8a;margin-top:0}
        .pin-unter{font-size:11px;color:#64748b;margin:2px 0 10px}
        .pin-training{background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:7px 14px;
          font-size:12.5px;font-weight:700;color:#9a3412;margin:0 auto 10px;max-width:620px}
        .pin-training span{display:block;font-size:15px;color:#111;margin-top:2px}
        .pin-block{border:1.5px solid #1e3a8a;border-radius:10px;padding:7px 14px 8px;margin:0 auto 9px;
          max-width:620px;text-align:left;page-break-inside:avoid}
        .pin-block-titel{font-size:13.5px;font-weight:800;color:#1e3a8a;text-align:center;margin-bottom:2px}
        .pin-block ul{list-style:none;padding:0;margin:0}
        .pin-block li{font-size:12px;padding:2.5px 0;margin:0;border-bottom:1px dashed #cbd5e1;line-height:1.35}
        .pin-block li:last-child{border-bottom:0}
        .pin-leer{font-size:11.5px;color:#555;font-style:italic;margin:3px 0}
        /* Kompaktstufe bei vielen Terminen (schaltet automatisch) */
        .pin-eng .pin-titel{font-size:20px}
        .pin-eng .pin-unter{margin-bottom:6px}
        .pin-eng .pin-training{padding:5px 12px;margin-bottom:7px;font-size:11.5px}
        .pin-eng .pin-training span{font-size:13.5px}
        .pin-eng .pin-block{padding:5px 12px 6px;margin-bottom:6px}
        .pin-eng .pin-block-titel{font-size:12.5px}
        .pin-eng .pin-block li{font-size:10.8px;padding:1.6px 0;line-height:1.3}
        /* Einverständnis-Seite */
        .box{font-size:12.5px;border:1.5px solid #1e3a8a;border-radius:12px;padding:14px 18px;margin:14px 0 16px}
        .box .line{border-bottom:1px solid #334155;margin:14px 0 3px;padding-bottom:2px}
        .box .cols{display:flex;gap:24px}.box .cols>div{flex:1}
        .sec{border:1px solid #cbd5e1;border-radius:10px;padding:11px 14px;margin:9px 0;page-break-inside:avoid}
        .sec-head{font-weight:700;color:#1e3a8a;margin-bottom:5px;font-size:13px}
        .num{display:inline-block;background:#1e3a8a;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:11px;margin-right:6px}
        .sec-body{font-size:12px;color:#1e293b}
        .agree{margin-top:7px;font-size:12.5px}
        .note{font-size:10.5px;color:#555;margin-top:12px}
        .pagebreak{page-break-after:always}
        /* Explizite Brief-Seiten: Fußzeile (Name · Seite X von Y) sitzt unten */
        .brief-seite{page-break-after:always;display:flex;flex-direction:column}
        .brief-seite:last-child{page-break-after:auto}
        .fuss{margin-top:auto;padding-top:8px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #eef2f7}
        /* @page margin:0 verhindert, dass sich Browser-Druckränder und body-Rand
           addieren – sonst überläuft jede Briefseite und erzeugt Leerseiten */
        @media print { @page{size:A4;margin:0} body{margin:11mm} .brief-seite{min-height:269mm} }
      </style></head><body>
      ${list.map((pl2) => oneLetter(pl2)).join("")}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken", "bad"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }

  // ---- Elternbrief als echte PDF-Datei (Server-Endpunkt /api/brief-pdf) ----
  // Baut den Brief als einfache Blockliste (statt HTML) für die PDF-Setzung.
  function letterPdfBlocks(l, pl2) {
    const s = S();
    const futureOf = (type) => s.events.filter((e) => e.type === type && daysUntil(e.start) >= 0)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const groupByDate = (evs) => {
      const map = new Map();
      evs.forEach((e) => { const k = String(e.start).slice(0, 10); if (!map.has(k)) map.set(k, []); map.get(k).push(e); });
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    };
    const stripDateTime = (t) => String(t || "")
      .replace(/\b(?:mo|di|mi|do|fr|sa|so)\.?,?\s+\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\b/gi, "")
      .replace(/\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\b/g, "")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\b\d{1,2}:\d{2}(?:\s*Uhr)?\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–:,·]+|[\s\-–:,·]+$/g, "").trim();
    const fill = (text) => String(text || "")
      .replace(/\{vorname\}/gi, pl2 ? pl2.firstName : "…")
      .replace(/\{nachname\}/gi, pl2 ? pl2.lastName : "…")
      .replace(/\{eltern\}/gi, pl2 ? ([pl2.parentName, pl2.parent2Name].filter(Boolean).join(" und ") || "Eltern") : "Eltern");
    const parents = pl2 ? [pl2.parentName, pl2.parent2Name].filter(Boolean).join(" und ") : "";
    const bestEmail = pl2 ? (pl2.parentEmail || pl2.playerEmail || "") : "";
    const bestPhone = pl2 ? (pl2.parentPhone || pl2.playerPhone || "") : "";
    const B = [];
    const p = (runs) => B.push({ art: "p", runs: Array.isArray(runs) ? runs : [{ t: runs }] });
    const KASTEN = "[  ] ";

    B.push({ art: "h1", runs: [{ t: "SKV Müritz – Abteilung Volleyball" }] });
    B.push({ art: "sub", runs: [{ t: `www.skv-mueritz.de · ${l.title || "Elternbrief zur Saison"}${l.deadline ? ` · Rückmeldung bis ${fmtDateShort(l.deadline)}` : ""}` }] });
    if (pl2) {
      B.push({ art: "sub", runs: [{ t: "An die Eltern von" }] });
      B.push({ art: "h2", runs: [{ t: `${pl2.firstName} ${pl2.lastName}` }] });
      const zeile = [parents, playerDeptIds(pl2).length ? playerDeptNames(pl2) : ""].filter(Boolean).join(" · ");
      if (zeile) B.push({ art: "sub", runs: [{ t: zeile }] });
    }
    B.push({ art: "trenn" });
    fill(l.body).split(/\n{2,}/).forEach((block) => {
      const lines = block.split("\n");
      if (lines[0].startsWith("## ")) {
        B.push({ art: "h2", runs: [{ t: lines[0].slice(3) }] });
        const rest = lines.slice(1).join(" ").trim();
        if (rest) p(rest);
      } else p(lines.join(" ").trim());
    });
    if (l.includeHomeGames) {
      // Termine als eigene Seite (Pinnwand); Rückmeldung folgt direkt darunter
      B.push({ art: "seite" });
      B.push({ art: "h1c", runs: [{ t: "Unsere Termine" }] });
      B.push({ art: "subc", runs: [{ t: "SKV Müritz · Abteilung Volleyball · für die Pinnwand" }] });
      const tt = String(l.trainingTime || "").trim();
      B.push({ art: "kasten", runs: [{ t: "Regelmäßiges Training: ", b: true }, tt ? { t: tt, b: true } : { t: "_______________________________" }] });
      const terminArten = Array.isArray(l.terminArten) && l.terminArten.length ? l.terminArten : ["home", "away"];
      const artInfo = (k) => {
        if (k === "home") return { titel: "Heimspiele", blanks: true };
        if (k === "away") return { titel: "Auswärtsspiele", blanks: true };
        if (k === "other") return { titel: "Weitere Termine", blanks: false };
        const c = (s.eventCategories || []).find((x) => x.id === k);
        return c ? { titel: c.name, blanks: false } : null;
      };
      // Alle Termin-Blöcke sollen zusammen auf EINE PDF-Seite passen –
      // bei vielen Terminen kompakte Listenzeilen (li2) verwenden.
      const zeilenGesamt = terminArten.reduce((summe, k) => {
        const info = artInfo(k);
        if (!info) return summe;
        const evs = futureOf(k);
        return summe + (evs.length ? groupByDate(evs).length : 1) + 2;
      }, 0);
      const liArt = zeilenGesamt > 22 ? "li2" : "li";
      terminArten.forEach((k) => {
        const info = artInfo(k);
        if (!info) return;
        const evs = futureOf(k);
        if (!evs.length && !info.blanks) return;
        B.push({ art: "h2box", runs: [{ t: info.titel }] });
        if (!evs.length) { p("Die Termine werden rechtzeitig bekannt gegeben."); return; }
        groupByDate(evs).forEach(([day, items]) => B.push({ art: liArt, runs: [
          { t: fmtDate(items[0].start), b: true },
          { t: " – " + items.map((g) => `${fmtTime(g.start)} Uhr ${stripDateTime(g.title)}${g.opponent ? " gegen " + g.opponent : ""}${g.location ? " (" + g.location + ")" : ""}`).join(" · ") },
        ] }));
      });
      B.push({ art: "leer" });
    }
    if (l.includeSlip) {
      const deadlineTxt = l.deadline ? `bitte bis zum ${fmtDate(l.deadline)} zurückgeben` : "bitte bis zum nächsten Training zurückgeben";
      B.push({ art: "seite" });
      B.push({ art: "schnitt" });
      B.push({ art: "h2box", runs: [{ t: "Rückmeldung an das Trainerteam" }] });
      p([{ t: deadlineTxt.charAt(0).toUpperCase() + deadlineTxt.slice(1) + "!", b: true }]);
      const zeile = (label, val) => p(val ? [{ t: label + " " }, { t: val, b: true }] : [{ t: label + " ______________________________" }]);
      zeile("Name des Kindes:", pl2 ? `${pl2.firstName} ${pl2.lastName}` : "");
      p([{ t: "Kontaktdaten – bitte je Person eintragen", b: true }]);
      const kontakt = (label, name, mobil, mail) => p([
        { t: label + " " }, name ? { t: name, b: true } : { t: "__________________" },
        { t: "   Mobil: " }, mobil ? { t: mobil, b: true } : { t: "______________" },
        { t: "   E-Mail: " }, mail ? { t: mail, b: true } : { t: "____________________" },
      ]);
      kontakt("Erziehungsberechtigte/r 1:", pl2 ? pl2.parentName : "", pl2 ? pl2.parentPhone : "", pl2 ? pl2.parentEmail : "");
      kontakt("Erziehungsberechtigte/r 2 (bei geteiltem Sorgerecht):", pl2 ? pl2.parent2Name : "",
              pl2 ? pl2.parent2Phone : "", pl2 ? pl2.parent2Email : "");
      p([
        { t: "Spieler:in (eigenes Handy, freiwillig):   Mobil: " },
        pl2 && pl2.playerPhone ? { t: pl2.playerPhone, b: true } : { t: "______________" },
        { t: "   E-Mail: " },
        pl2 && pl2.playerEmail ? { t: pl2.playerEmail, b: true } : { t: "____________________" },
      ]);
      p(KASTEN + "Ich stimme zu, dass das Trainerteam mich über E-Mail/Telefon kontaktiert.");
      p([{ t: KASTEN + "Ich stimme der Aufnahme in die " }, { t: "WhatsApp-Elterngruppe", b: true },
         { t: " zu – unser zentraler Informationsweg und für den reibungslosen Ablauf der Saison notwendig." }]);
      p([{ t: "Fahrbereitschaft zu Auswärtsspielen", b: true }]);
      p(KASTEN + "Ich fahre regelmäßig (freie Plätze: ____ )");
      p(KASTEN + "Ich fahre gelegentlich nach Absprache (freie Plätze: ____ )");
      p(KASTEN + "Ich kann leider nicht fahren");
      p([{ t: "Beteiligung am Heimspiel-Buffet", b: true }]);
      p(KASTEN + "Ich steuere etwas bei:   " + KASTEN + "Salat  " + KASTEN + "belegte Brötchen  " + KASTEN + "Kuchen  " + KASTEN + "Getränke");
      p(KASTEN + "Ich übernehme Standdienst an einem Heimspieltag");
      p(KASTEN + "Ich kann mich diesmal nicht beteiligen");
      B.push({ art: "linie", runs: [{ t: "Ort, Datum, Unterschrift Erziehungsberechtigte/r" }] });
    }
    const reqTpls = s.consentTemplates.filter((t) => t.required);
    if (l.includeConsents !== false && reqTpls.length) {
      B.push({ art: "seite" });
      B.push({ art: "h1c", runs: [{ t: "Sammel-Einverständniserklärung" }] });
      B.push({ art: "subc", runs: [{ t: `www.skv-mueritz.de · Abteilung Volleyball · ${reqTpls.length} Pflicht-Erklärungen` }] });
      B.push({ art: "h2box", runs: [{ t: "Angaben zu Spieler:in und Erziehungsberechtigten" }] });
      const zeile = (label, val) => p(val ? [{ t: label + " " }, { t: val, b: true }] : [{ t: label + " ______________________________" }]);
      zeile("Name, Vorname des Spielers:", pl2 ? `${pl2.lastName}, ${pl2.firstName}` : "");
      zeile("Geburtsdatum:", pl2 && pl2.birthDate ? fmtDateShort(pl2.birthDate) : "");
      zeile("Name der/des Erziehungsberechtigten:", parents);
      zeile("E-Mail-Adresse:", bestEmail);
      zeile("Mobilnummer:", bestPhone);
      B.push({ art: "leer" });
      p([{ t: "Hiermit erkläre ich mich mit den nachfolgend angekreuzten Punkten einverstanden:", b: true }]);
      reqTpls.forEach((t, i) => {
        B.push({ art: "sec", titel: `${i + 1}. ${t.name}`, text: t.text, ankreuz: true });
      });
      B.push({ art: "leer" });
      p("Alle Einwilligungen sind freiwillig und können jederzeit mit Wirkung für die Zukunft schriftlich widerrufen werden. Die Daten werden ausschließlich für die Vereinsarbeit des SKV Müritz genutzt.");
      B.push({ art: "linie", runs: [{ t: "Ort, Datum, Unterschrift Erziehungsberechtigte/r" }] });
    }
    return B;
  }

  // PDF vom Server holen und herunterladen bzw. übers Teilen-Menü (WhatsApp) weitergeben.
  // waZiel (optional): {nummer, text} – Fallback ohne natives Teilen: PDF herunterladen
  // und den WhatsApp-Chat mit der richtigen Nummer direkt öffnen.
  async function pdfVomServer(name, blocks, teilen, fusszeile, waZiel) {
    if (!window.Sync || !Sync.csrf) { toast("PDF-Erzeugung braucht den Server-Modus (Anmeldung)", "bad"); return; }
    toast("PDF wird erstellt …");
    let res;
    try {
      res = await fetch("/api/brief-pdf", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": Sync.csrf },
        body: JSON.stringify({ filename: name, blocks, fusszeile: fusszeile || "" }),
      });
    } catch (e) { toast("Keine Verbindung zum Server", "bad"); return; }
    if (res.status === 401) {
      toast("Anmeldung abgelaufen – bitte Seite neu laden und anmelden, dann klappt das PDF wieder", "bad");
      return;
    }
    if (!res.ok) { toast("PDF-Erzeugung fehlgeschlagen", "bad"); return; }
    const blob = await res.blob();
    // WhatsApp (iOS) scheitert beim Direktversand an Sonderzeichen im Dateinamen
    // (Gedankenstrich, Umlaute, Leerzeichen) – daher ein technisch sicherer Name
    const sicher = name
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dokument";
    const datei = new File([blob], sicher + ".pdf", { type: "application/pdf" });
    if (teilen && navigator.canShare && navigator.canShare({ files: [datei] })) {
      try { await navigator.share({ files: [datei], title: name }); return; }
      catch (e) { if (e && e.name === "AbortError") return; /* sonst: herunterladen */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name + ".pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (teilen && waZiel && waZiel.nummer) {
      window.open(`https://wa.me/${waZiel.nummer}?text=${encodeURIComponent(waZiel.text || "")}`, "_blank", "noopener");
      toast("PDF heruntergeladen – WhatsApp-Chat ist geöffnet, bitte die Datei dort anhängen", "good");
    } else if (teilen) {
      toast("Teilen nicht verfügbar – PDF wurde heruntergeladen (in WhatsApp anhängen)", "good");
    }
  }

  // WhatsApp-Zielnummer: wer zuerst kontaktiert werden soll und eine Nummer hat
  // (Erziehungsberechtigte:r 1 → 2 → Spieler:in); Format für wa.me (49…)
  function waNummerFuer(pl2) {
    if (!pl2) return "";
    const roh = [pl2.parentPhone, pl2.parent2Phone, pl2.playerPhone]
      .map((n) => String(n || "").trim()).find(Boolean) || "";
    let ziffern = roh.replace(/[^\d+]/g, "");
    if (ziffern.startsWith("+")) ziffern = ziffern.slice(1);
    else if (ziffern.startsWith("00")) ziffern = ziffern.slice(2);
    else if (ziffern.startsWith("0")) ziffern = "49" + ziffern.slice(1);
    // Schreibweise „+49 (0) 171 …": die eingeklammerte 0 nach dem Ländercode entfernen
    if (ziffern.startsWith("490")) ziffern = "49" + ziffern.slice(3);
    return ziffern;
  }

  function letterPdf(l, pl2, teilen) {
    const name = pl2 ? `Elternbrief – ${pl2.firstName} ${pl2.lastName}` : `Elternbrief – ${l.title || "SKV Müritz"}`;
    const waZiel = teilen && pl2 ? {
      nummer: waNummerFuer(pl2),
      text: `Hallo! Anbei der Elternbrief für ${pl2.firstName} vom SKV Müritz Volleyball – ` +
        `die PDF-Datei hänge ich gleich hier an.${l.deadline ? ` Rückmeldung bitte bis ${fmtDateShort(l.deadline)}.` : ""}`,
    } : null;
    return pdfVomServer(name, letterPdfBlocks(l, pl2), teilen,
      pl2 ? `${pl2.firstName} ${pl2.lastName}` : "", waZiel);
  }

  // Serienbrief: Spieler auswählen, ein personalisierter Brief pro Spieler
  function serialLetterModal(l) {
    const s = S();
    const active = s.players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    if (!active.length) { toast("Keine aktiven Spieler vorhanden", "bad"); return; }
    modal({
      title: `Serienbrief – ${esc(l.title)}`,
      body: `
        <p class="soft" style="margin-top:0;font-size:.85rem">Ein personalisierter Brief pro Spieler: Anschrift,
        Rückmeldeabschnitt mit Name, Eltern, E-Mail und Mobilnummer werden automatisch ausgefüllt.
        Im Brieftext funktionieren die Platzhalter <code>{vorname}</code>, <code>{nachname}</code>, <code>{eltern}</code>.</p>
        <p class="soft" style="font-size:.85rem">Je Spieler: <strong>⬇️ PDF herunterladen</strong> (fertige Datei inkl.
        vorausgefüllter Pflicht-Erklärungen), <strong>📤 Teilen</strong> (z. B. per WhatsApp an die Eltern schicken)
        oder <strong>📄 Drucken</strong>. Der große Knopf unten druckt alle ausgewählten Briefe in einem Dokument.</p>
        <div class="field mb"><label>Abteilung</label><select id="slDept">
          <option value="">alle Abteilungen</option>
          ${s.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
        <div class="list" id="slList" style="max-height:300px;overflow-y:auto">
          ${active.map((p) => `
            <label class="list-item" data-dept="${esc(playerDeptIds(p).join(","))}" style="cursor:pointer;padding:8px 10px">
              <input type="checkbox" data-slp="${p.id}" checked style="width:auto">
              <div class="grow"><div class="title" style="font-size:.88rem">${esc(p.firstName)} ${esc(p.lastName)}</div>
              <div class="sub">${esc(playerDeptNames(p))} · ${esc(p.parentName || "ohne Elternkontakt")}</div></div>
              <button type="button" class="btn sm ghost" data-slpdf="${p.id}" title="PDF herunterladen">⬇️</button>
              <button type="button" class="btn sm ghost" data-slshare="${p.id}" title="PDF teilen (z. B. WhatsApp)">📤</button>
              <button type="button" class="btn sm ghost" data-slone="${p.id}" title="Einzelbrief drucken">📄</button>
            </label>`).join("")}
        </div>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>🖨️ Serienbrief drucken</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelectorAll("[data-slone]").forEach((b) => b.onclick = (ev2) => {
          ev2.preventDefault(); ev2.stopPropagation();
          const p = Store.byId("players", b.dataset.slone);
          printParentLetter(l, [p], `Elternbrief – ${p.firstName} ${p.lastName}`);
        });
        m.querySelectorAll("[data-slpdf]").forEach((b) => b.onclick = (ev2) => {
          ev2.preventDefault(); ev2.stopPropagation();
          letterPdf(l, Store.byId("players", b.dataset.slpdf), false);
        });
        m.querySelectorAll("[data-slshare]").forEach((b) => b.onclick = (ev2) => {
          ev2.preventDefault(); ev2.stopPropagation();
          letterPdf(l, Store.byId("players", b.dataset.slshare), true);
        });
        m.querySelector("#slDept").onchange = (ev) => {
          const dep = ev.target.value;
          m.querySelectorAll("#slList label").forEach((row) => {
            const match = !dep || row.dataset.dept.split(",").includes(dep);
            row.style.display = match ? "" : "none";
            row.querySelector("input").checked = match;
          });
        };
        m.querySelector("[data-s]").onclick = () => {
          const ids = Array.from(m.querySelectorAll("[data-slp]:checked"))
            .filter((c) => c.closest("label").style.display !== "none")
            .map((c) => c.dataset.slp);
          if (!ids.length) { toast("Keine Spieler ausgewählt", "bad"); return; }
          closeModal();
          printParentLetter(l, ids.map((id) => Store.byId("players", id)).filter(Boolean));
          toast(`Serienbrief mit ${ids.length} Briefen erstellt`, "good");
        };
      },
    });
  }

  function consentTemplateForm(t) {
    const isEdit = !!t;
    t = t || { name: "", text: "", required: false };
    modal({
      title: isEdit ? "Vorlage bearbeiten" : "Neue Formular-Vorlage",
      body: `<form id="tf"><div class="form-grid">
        <div class="field full"><label>Name der Erklärung</label><input name="name" value="${esc(t.name)}" required placeholder="z. B. Teilnahme Turnierfahrt"></div>
        <div class="field full"><label>Text / Inhalt der Erklärung</label><textarea name="text" rows="6" required placeholder="Hiermit erkläre ich mich einverstanden, dass …">${esc(t.text)}</textarea></div>
        <div class="field full"><label><input type="checkbox" name="required" ${t.required ? "checked" : ""} style="width:auto"> Pflicht-Formular (für alle Spieler erforderlich)</label></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#tf"); if (!f.reportValidity()) return;
          const d = formData(f);
          if (isEdit) {
            // Umbenennung auch in bereits abgelegten Formularen nachziehen
            if (d.name !== t.name) S().consents.forEach((c) => { if (c.type === t.name) Store.update("consents", c.id, { type: d.name }); });
            Store.update("consentTemplates", t.id, d);
          } else Store.add("consentTemplates", d);
          closeModal(); toast("Vorlage gespeichert", "good"); reload();
        };
      },
    });
  }

  // Druckbares Formular (zum Austeilen an die Eltern) aus einer Vorlage
  function printConsentTemplate(t) {
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(t.name)}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;margin:40px;max-width:700px}
      h1{font-size:19px}h2{font-size:15px;color:#444;font-weight:normal;margin-top:0}
      .box{border:1px solid #999;border-radius:6px;padding:16px;margin:18px 0;line-height:1.6;font-size:14px}
      .fields{margin:22px 0;font-size:14px}.fields div{margin:14px 0;border-bottom:1px solid #333;padding-bottom:2px}
      .sign{margin-top:46px;display:flex;gap:50px}.sign div{border-top:1px solid #333;padding-top:4px;font-size:12px;flex:1}</style></head><body>
      <h1>SKV Müritz – ${esc(t.name)}</h1>
      <h2>www.skv-mueritz.de · Abteilung Volleyball</h2>
      <div class="box">${esc(t.text).replace(/\n/g, "<br>")}</div>
      <div class="fields">
        <div>Name des Spielers: &nbsp;</div>
        <div>Geburtsdatum: &nbsp;</div>
        <div>Name der/des Erziehungsberechtigten: &nbsp;</div>
        <div>E-Mail-Adresse: &nbsp;</div>
        <div>Mobilnummer: &nbsp;</div>
      </div>
      <div class="sign"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte/r</div></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken", "bad"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }

  function consentForm(preselectPlayer) {
    const s = S();
    modal({
      title: "Einverständniserklärung hochladen",
      body: `<form id="cf"><div class="form-grid">
        <div class="field"><label>Spieler</label><select name="playerId">
          ${s.players.map((p) => `<option value="${p.id}" ${p.id === preselectPlayer ? "selected" : ""}>${esc(p.firstName)} ${esc(p.lastName)}</option>`).join("")}</select></div>
        <div class="field"><label>Art der Erklärung (Vorlage)</label><select name="type">
          ${s.consentTemplates.map((t) => `<option>${esc(t.name)}</option>`).join("")}
          <option>Sonstige</option></select></div>
        <div class="field"><label>Unterschrieben von</label><input name="signedBy" placeholder="Name Elternteil"></div>
        <div class="field"><label>Datum der Erklärung</label><input type="date" name="datum" value="${new Date().toISOString().slice(0, 10)}" required></div>
        <div class="field full"><label>Datei (PDF/Bild)</label>
          <label class="file-drop" id="fd">📎 Klicken zum Auswählen<div class="sub" id="fdname"></div>
          <input type="file" name="file" accept="application/pdf,image/*" hidden></label></div>
      </div><p class="muted" style="font-size:.8rem">Die Datei wird lokal im Browser gespeichert (DSGVO-konform ohne Server). Für den Vereinsbetrieb kann eine sichere Serverablage angebunden werden.</p></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        const fileInput = m.querySelector('input[name="file"]');
        m.querySelector("#fd").onclick = () => fileInput.click();
        const leseDatei = (f) => new Promise((ok, nein) => {
          const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.onerror = nein; rd.readAsDataURL(f);
        });
        fileInput.onchange = () => {
          const f = fileInput.files[0]; if (!f) return;
          if (f.size > 4 * 1024 * 1024) { toast("Datei zu groß (max. 4 MB)", "bad"); fileInput.value = ""; return; }
          m.querySelector("#fdname").textContent = f.name;
        };
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = async () => {
          try {
            const d = formData(m.querySelector("#cf"));
            const f = fileInput.files[0];
            if (!f && !d.signedBy) { toast("Bitte Datei oder Unterschrift angeben", "bad"); return; }
            // Datei erst beim Speichern lesen und darauf WARTEN – sonst wäre die
            // Datei bei schnellem Klick noch nicht fertig eingelesen (dataUrl:null).
            const dataUrl = f ? await leseDatei(f) : null;
            Store.add("consents", { playerId: d.playerId, type: d.type, signedBy: d.signedBy || "—",
              fileName: (f && f.name) || "manuell_erfasst.txt", dataUrl,
              uploadedAt: d.datum ? d.datum + "T12:00:00" : new Date().toISOString() });
            Store.update("players", d.playerId, { consentOnFile: true });
            closeModal(); toast("Einverständnis abgelegt", "good"); reload();
          } catch (e) {
            toast("Speichern fehlgeschlagen – bitte erneut versuchen", "bad");
          }
        };
      },
    });
  }

  /* ======================================================================
     GEBURTSTAGE
     ====================================================================== */
  // Spieler ohne (gültiges) Geburtsdatum werden übersprungen – z. B. nach SAMS-Import
  function validBirth(p) {
    if (!p.birthDate) return false;
    const b = new Date(p.birthDate);
    return !isNaN(b.getTime());
  }
  function birthdaysWithin(days) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return S().players.filter(validBirth).map((p) => {
      const b = new Date(p.birthDate);
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      const inDays = Math.round((next - now) / 86400000);
      return { ...p, next: next.toISOString(), inDays, turns: next.getFullYear() - b.getFullYear() };
    }).filter((p) => p.inDays <= days).sort((a, b) => a.inDays - b.inDays);
  }
  function birthdays(el) {
    const missing = S().players.filter((p) => !validBirth(p));
    const all = S().players.filter(validBirth).map((p) => {
      const b = new Date(p.birthDate);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      return { ...p, next: next.toISOString(), inDays: Math.round((next - now) / 86400000), turns: next.getFullYear() - b.getFullYear() };
    }).sort((a, b) => a.inDays - b.inDays);
    const soon = all.filter((p) => p.inDays <= 30);

    el.innerHTML = `
      ${head("Geburtstagsliste", "Damit kein Geburtstag im Team vergessen wird")}
      ${soon.length ? `<div class="card mb"><div class="card-head"><h3>🎉 Die nächsten 30 Tage</h3></div>
        <div class="grid grid-4">${soon.map((p) => `
          <div class="list-item">${avatar(p.firstName, p.lastName, p)}
            <div class="grow"><div class="title">${esc(p.firstName)} ${esc(p.lastName)}</div>
            <div class="sub">${p.inDays === 0 ? "🎂 heute!" : fmtDateShort(p.next)} · wird ${p.turns}</div></div></div>`).join("")}</div></div>` : ""}
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Spieler</th><th>Geburtstag</th><th>Alter</th><th>Nächster</th><th>In Tagen</th></tr></thead>
        <tbody>${all.map((p) => `<tr>
          <td><div class="flex">${avatar(p.firstName, p.lastName, p)}<strong>${esc(p.firstName)} ${esc(p.lastName)}</strong></div></td>
          <td>${fmtDateShort(p.birthDate)}</td>
          <td>${age(p.birthDate)} Jahre</td>
          <td>${DOW[new Date(p.next).getDay()]}, ${fmtDateShort(p.next)}</td>
          <td>${p.inDays === 0 ? '<span class="badge accent">heute 🎂</span>' : `${p.inDays} Tage`}</td></tr>`).join("")
          || `<tr><td colspan="5">${empty("🎂", "Noch keine Spieler mit Geburtsdatum")}</td></tr>`}</tbody>
      </table></div></div>
      ${missing.length ? `<p class="muted mt" style="font-size:.82rem">⚠️ ${missing.length} Spieler ohne Geburtsdatum (z. B. aus SAMS-Import) – bitte in der Spielerverwaltung ergänzen: ${missing.slice(0, 8).map((p) => esc(p.firstName + " " + p.lastName)).join(", ")}${missing.length > 8 ? " …" : ""}</p>` : ""}`;
  }

  /* ======================================================================
     FINANZEN
     ====================================================================== */
  function finances(el) {
    const s = S();
    const fees = s.finances.filter((f) => f.type === "fee");
    const donations = s.finances.filter((f) => f.type === "donation");
    const expenses = s.finances.filter((f) => f.type === "expense");
    const income = fees.filter((f) => f.paid).reduce((a, f) => a + f.amount, 0) + donations.filter((f) => f.paid).reduce((a, f) => a + f.amount, 0);
    const spent = expenses.filter((f) => f.paid).reduce((a, f) => a + f.amount, 0);
    const openFees = fees.filter((f) => !f.paid);
    const tab = finances._tab || "all";
    const rows = tab === "all" ? s.finances : s.finances.filter((f) => f.type === tab);

    el.innerHTML = `
      ${head("Finanzen", "Mitgliedsbeiträge, Spenden und Ausgaben verwalten", `<button class="btn" data-add>＋ Buchung</button>`)}
      <div class="grid grid-4 mb">
        ${stat("💶", "Einnahmen", fmtMoney(income), "bezahlt")}
        ${stat("🧾", "Ausgaben", fmtMoney(spent))}
        ${stat("📈", "Saldo", fmtMoney(income - spent))}
        ${stat("⚠️", "Offene Beiträge", fmtMoney(openFees.reduce((a, f) => a + f.amount, 0)), `${openFees.length} offen`)}
      </div>
      <div class="tabs">
        ${[["all", "Alle"], ["fee", "Mitgliedsbeiträge"], ["donation", "Spenden"], ["expense", "Ausgaben"]].map(([k, l]) =>
          `<button class="tab ${tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}
      </div>
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Beschreibung</th><th>Art</th><th>Zuordnung</th><th>Datum</th><th class="right">Betrag</th><th>Status</th><th class="right"></th></tr></thead>
        <tbody>${rows.sort((a, b) => new Date(b.date) - new Date(a.date)).map((f) => `<tr>
          <td class="wrap">${esc(f.description)}</td>
          <td>${finType(f.type)}</td>
          <td class="soft">${f.playerId ? esc(playerName(f.playerId)) : "—"}</td>
          <td class="soft">${fmtDateShort(f.date)}</td>
          <td class="right ${f.type === "expense" ? "" : ""}"><strong>${f.type === "expense" ? "−" : "+"}${fmtMoney(f.amount)}</strong></td>
          <td>${f.paid ? '<span class="badge good">bezahlt</span>' : '<span class="badge warn">offen</span>'}</td>
          <td class="right nowrap">
            ${!f.paid ? `<button class="btn sm outline" data-paid="${f.id}">als bezahlt</button>` : ""}
            <button class="btn sm ghost" data-fdel="${f.id}">🗑️</button></td></tr>`).join("")}</tbody>
      </table></div></div>`;

    $$("[data-tab]", el).forEach((b) => b.onclick = () => { finances._tab = b.dataset.tab; reload(); });
    $("[data-add]", el).onclick = () => financeForm();
    $$("[data-paid]", el).forEach((b) => b.onclick = () => {
      const f = Store.update("finances", b.dataset.paid, { paid: true });
      if (f.type === "fee" && f.playerId) {
        const p = Store.byId("players", f.playerId);
        if (p && p.membershipStatus === "beitragsrückstand") Store.update("players", p.id, { membershipStatus: "aktiv" });
      }
      toast("Als bezahlt markiert", "good"); reload();
    });
    $$("[data-fdel]", el).forEach((b) => b.onclick = () => confirmDialog("Buchung löschen?", () => { Store.remove("finances", b.dataset.fdel); toast("Gelöscht"); reload(); }));
  }
  function finType(t) {
    return ({ fee: '<span class="badge info">Beitrag</span>', donation: '<span class="badge good">Spende</span>', expense: '<span class="badge warn">Ausgabe</span>' })[t] || t;
  }
  function financeForm() {
    const s = S();
    modal({
      title: "Neue Buchung",
      body: `<form id="ff"><div class="form-grid">
        <div class="field"><label>Art</label><select name="type" id="ftype">
          <option value="fee">Mitgliedsbeitrag</option><option value="donation">Spende</option><option value="expense">Ausgabe</option></select></div>
        <div class="field"><label>Betrag (€)</label><input type="number" step="0.01" name="amount" required></div>
        <div class="field full"><label>Beschreibung</label><input name="description" required></div>
        <div class="field"><label>Datum</label><input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Spieler (optional)</label><select name="playerId"><option value="">—</option>
          ${s.players.map((p) => `<option value="${p.id}">${esc(p.firstName)} ${esc(p.lastName)}</option>`).join("")}</select></div>
        <div class="field full"><label><input type="checkbox" name="paid" style="width:auto"> bereits bezahlt / eingegangen</label></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#ff"); if (!f.reportValidity()) return;
          const d = formData(f); d.amount = Number(d.amount) || 0;
          d.date = new Date(d.date).toISOString();
          if (!d.playerId) d.playerId = null;
          Store.add("finances", d); closeModal(); toast("Buchung gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     VEREINSKLEIDUNG
     ====================================================================== */
  function clothing(el) {
    const s = S();
    el.innerHTML = `
      ${head("Vereinskleidung", "Kollektion ansehen und direkt anfordern", `<button class="btn outline" data-add>＋ Artikel</button>`)}
      <div class="grid grid-3 mb">
        ${s.clothing.map((c) => `
          <div class="card product">
            <div class="img">${c.bild ? `<img src="${c.bild}" alt="${esc(c.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : clothingSVG(c.kind, c.color)}</div>
            <div class="body">
              <div class="flex"><strong>${esc(c.name)}</strong><span class="spacer"></span><span class="price">${fmtMoney(c.price)}</span></div>
              <p class="soft" style="font-size:.85rem;margin:0">${esc(c.description)}</p>
              <div class="chip-row" style="gap:5px">${c.sizes.map((sz) => `<span class="badge">${esc(sz)}</span>`).join("")}</div>
              <div class="flex mt" style="gap:6px">
                <button class="btn sm" data-req="${c.id}">🛒 Anfordern</button>
                <button class="btn sm ghost" data-bildup="${c.id}" title="Produktfoto hochladen (nur Trainerteam)">📷 ${c.bild ? "Bild ändern" : "Bild"}</button>
                ${c.bild ? `<button class="btn sm ghost" data-bildweg="${c.id}" title="Bild entfernen">🗑️</button>` : ""}
              </div>
            </div></div>`).join("")}
      </div>
      <input type="file" id="clothBildDatei" accept="image/*" hidden>
      <p class="muted" style="font-size:.78rem;margin:0 0 14px">ℹ️ Vereinskleidung – insbesondere Trikots – bleibt Eigentum
      des Vereins: Ein Trikot darf nur so lange behalten werden, wie aktiv gespielt wird; danach bitte ans Trainerteam zurückgeben.
      Dieser Hinweis steht auch im Portal.</p>

      <div class="card"><div class="card-head"><h3>📦 Bestellungen & Anforderungen</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Artikel</th><th>Spieler</th><th>Größe</th><th>Menge</th><th>Status</th><th class="right"></th></tr></thead>
          <tbody>${s.clothingRequests.length ? s.clothingRequests.map((r) => {
            const item = Store.byId("clothing", r.itemId);
            return `<tr><td>${esc(item ? item.name : "—")}</td><td>${esc(playerName(r.playerId))}</td>
              <td>${esc(r.size)}</td><td>${r.qty}×</td>
              <td>${reqStatus(r.status)}</td>
              <td class="right nowrap">
                <select class="rstat" data-r="${r.id}" style="width:auto;display:inline-block">
                  ${["offen", "bestellt", "geliefert"].map((st) => `<option ${st === r.status ? "selected" : ""}>${st}</option>`).join("")}</select>
                <button class="btn sm ghost" data-rdel="${r.id}">🗑️</button></td></tr>`;
          }).join("") : `<tr><td colspan="6">${empty("🛒", "Noch keine Anforderungen")}</td></tr>`}</tbody>
        </table></div></div>`;

    $$("[data-req]", el).forEach((b) => b.onclick = () => clothingRequestForm(b.dataset.req));
    $("[data-add]", el).onclick = () => clothingItemForm();
    // Produktfotos: nur hier in der Trainer-Ansicht hochladbar (Portal zeigt sie nur an)
    const bildDatei = $("#clothBildDatei", el);
    $$("[data-bildup]", el).forEach((b) => b.onclick = () => {
      bildDatei.dataset.ziel = b.dataset.bildup;
      bildDatei.click();
    });
    bildDatei.onchange = () => {
      const datei = bildDatei.files && bildDatei.files[0];
      if (!datei || !datei.type.startsWith("image/")) return;
      const bild = new Image();
      const url = URL.createObjectURL(datei);
      bild.onload = () => {
        const faktor = Math.min(1, 800 / Math.max(bild.width, bild.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bild.width * faktor); c.height = Math.round(bild.height * faktor);
        c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL("image/jpeg", 0.8);
        if (dataUrl.length > 400000) { toast("Bild ist auch verkleinert noch zu groß", "bad"); return; }
        Store.update("clothing", bildDatei.dataset.ziel, { bild: dataUrl });
        toast("Produktfoto gespeichert", "good"); reload();
      };
      bild.onerror = () => toast("Bild konnte nicht gelesen werden", "bad");
      bild.src = url;
    };
    $$("[data-bildweg]", el).forEach((b) => b.onclick = () => confirmDialog("Produktfoto entfernen?", () => {
      Store.update("clothing", b.dataset.bildweg, { bild: "" }); toast("Bild entfernt"); reload();
    }));
    $$(".rstat", el).forEach((s2) => s2.onchange = () => { Store.update("clothingRequests", s2.dataset.r, { status: s2.value }); toast("Status aktualisiert"); reload(); });
    $$("[data-rdel]", el).forEach((b) => b.onclick = () => confirmDialog("Anforderung löschen?", () => { Store.remove("clothingRequests", b.dataset.rdel); toast("Gelöscht"); reload(); }));
  }
  function reqStatus(s) {
    return ({ offen: '<span class="badge warn">offen</span>', bestellt: '<span class="badge info">bestellt</span>', geliefert: '<span class="badge good">geliefert</span>' })[s] || s;
  }
  function clothingRequestForm(itemId) {
    const item = Store.byId("clothing", itemId); const s = S();
    modal({
      title: `Anfordern – ${esc(item.name)}`,
      body: `<div class="flex mb"><div style="width:120px">${clothingSVG(item.kind, item.color)}</div>
        <div><strong>${esc(item.name)}</strong><div class="price">${fmtMoney(item.price)}</div><p class="soft" style="font-size:.85rem">${esc(item.description)}</p></div></div>
        <form id="rf"><div class="form-grid">
        <div class="field"><label>Spieler</label><select name="playerId">${s.players.map((p) => `<option value="${p.id}">${esc(p.firstName)} ${esc(p.lastName)}</option>`).join("")}</select></div>
        <div class="field"><label>Größe</label><select name="size">${item.sizes.map((sz) => `<option>${esc(sz)}</option>`).join("")}</select></div>
        <div class="field"><label>Menge</label><input type="number" name="qty" min="1" value="1"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Anfordern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const d = formData(m.querySelector("#rf")); d.qty = Number(d.qty) || 1;
          Store.add("clothingRequests", { itemId, playerId: d.playerId, size: d.size, qty: d.qty, status: "offen", at: new Date().toISOString() });
          closeModal(); toast("Anforderung gesendet", "good"); reload();
        };
      },
    });
  }
  function clothingItemForm() {
    modal({
      title: "Neuer Artikel",
      body: `<form id="cif"><div class="form-grid">
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Preis (€)</label><input type="number" step="0.01" name="price" value="0"></div>
        <div class="field"><label>Typ (Bild)</label><select name="kind">
          ${["jersey", "jacket", "hoodie", "bag", "pads"].map((k) => `<option value="${k}">${k}</option>`).join("")}</select></div>
        <div class="field"><label>Farbe</label><input type="color" name="color" value="#f97316"></div>
        <div class="field full"><label>Größen (Komma-getrennt)</label><input name="sizes" value="S, M, L, XL"></div>
        <div class="field full"><label>Beschreibung</label><textarea name="description"></textarea></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#cif"); if (!f.reportValidity()) return;
          const d = formData(f); d.price = Number(d.price) || 0;
          d.sizes = d.sizes.split(",").map((x) => x.trim()).filter(Boolean);
          Store.add("clothing", d); closeModal(); toast("Artikel angelegt", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     SPONSOREN
     ====================================================================== */
  function sponsors(el) {
    const s = S();
    const total = s.sponsors.reduce((a, x) => a + Number(x.contribution || 0), 0);
    el.innerHTML = `
      ${head("Sponsoren", "Partner des Vereins verwalten und präsentieren", `<button class="btn" data-add>＋ Sponsor</button>`)}
      <div class="grid grid-3 mb">
        ${stat("🤝", "Sponsoren", s.sponsors.length)}
        ${stat("💶", "Fördersumme / Saison", fmtMoney(total))}
        ${stat("⭐", "Hauptsponsor", s.sponsors.find((x) => /haupt/i.test(x.tier)) ? esc(s.sponsors.find((x) => /haupt/i.test(x.tier)).name) : "—")}
      </div>
      <div class="grid grid-3">
        ${s.sponsors.map((sp) => `
          <div class="card sponsor-card">
            <div class="sponsor-logo">${sponsorSVG(sp.name, sp.color)}</div>
            <div class="flex" style="width:100%"><strong>${esc(sp.name)}</strong><span class="spacer"></span><span class="badge accent">${esc(sp.tier)}</span></div>
            <dl class="kv" style="width:100%">
              <dt>Beitrag</dt><dd>${fmtMoney(sp.contribution)}</dd>
              <dt>Kontakt</dt><dd class="soft">${esc(sp.contact || "—")}</dd>
              <dt>Web</dt><dd>${sp.website ? `<a href="${escUrl(sp.website)}" target="_blank" rel="noopener">Website ↗</a>` : "—"}</dd>
            </dl>
            <div class="flex" style="width:100%"><span class="spacer"></span>
              <button class="btn sm ghost" data-sedit="${sp.id}">✏️</button>
              <button class="btn sm ghost" data-sdel="${sp.id}">🗑️</button></div>
          </div>`).join("")}
        <div class="card" style="display:grid;place-items:center;border-style:dashed;min-height:200px;cursor:pointer" data-add2>
          <div class="center soft"><div style="font-size:2rem">＋</div>Platz für weitere Sponsoren</div></div>
      </div>`;

    const addFn = () => sponsorForm();
    $("[data-add]", el).onclick = addFn;
    $("[data-add2]", el).onclick = addFn;
    $$("[data-sedit]", el).forEach((b) => b.onclick = () => sponsorForm(Store.byId("sponsors", b.dataset.sedit)));
    $$("[data-sdel]", el).forEach((b) => b.onclick = () => confirmDialog("Sponsor löschen?", () => { Store.remove("sponsors", b.dataset.sdel); toast("Gelöscht"); reload(); }));
  }
  function sponsorForm(sp) {
    const isEdit = !!sp;
    sp = sp || { name: "", tier: "Partner", website: "", contact: "", contribution: 0, color: "#0ea5e9" };
    modal({
      title: isEdit ? "Sponsor bearbeiten" : "Neuer Sponsor",
      body: `<form id="sf"><div class="form-grid">
        <div class="field"><label>Name</label><input name="name" value="${esc(sp.name)}" required></div>
        <div class="field"><label>Kategorie</label><select name="tier">
          ${["Hauptsponsor", "Premium", "Partner", "Förderer"].map((t) => `<option ${t === sp.tier ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Fördersumme (€/Saison)</label><input type="number" name="contribution" value="${esc(sp.contribution)}"></div>
        <div class="field"><label>Logo-Farbe</label><input type="color" name="color" value="${esc(sp.color)}"></div>
        <div class="field"><label>Website</label><input name="website" value="${esc(sp.website)}" placeholder="https://"></div>
        <div class="field"><label>Kontakt</label><input name="contact" value="${esc(sp.contact)}"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#sf"); if (!f.reportValidity()) return;
          const d = formData(f); d.contribution = Number(d.contribution) || 0;
          if (isEdit) Store.update("sponsors", sp.id, d); else Store.add("sponsors", d);
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     VERBAND & TABELLE (Verbandsliga Mecklenburg-Vorpommern)
     ====================================================================== */
  function standings(el) {
    const s = S();
    const rows = s.standings.slice().sort((a, b) => b.points - a.points || (b.setsW - b.setsL) - (a.setsW - a.setsL));
    const ourPos = rows.findIndex((r) => /skv/i.test(r.team)) + 1;

    el.innerHTML = `
      ${head("Verbandsliga MV – Tabelle & Links", "Punktestand der Verbandsliga Mecklenburg-Vorpommern und Direktlinks zum Verband")}
      <div class="grid grid-4 mb">
        ${stat("🏆", "Tabellenplatz SKV", ourPos ? ourPos + "." : "—", `${rows.length} Teams`)}
        ${stat("⭐", "Punkte SKV", (() => { const t = rows.find((r) => /skv/i.test(r.team)); return t && t.points != null ? t.points : "—"; })())}
        ${stat("🎽", "Spiele", (() => { const t = rows.find((r) => /skv/i.test(r.team)); return t && t.games != null ? t.games : "—"; })())}
        ${stat("📈", "Satzverhältnis", (() => { const t = rows.find((r) => /skv/i.test(r.team)); return t ? `${t.setsW}:${t.setsL}` : "—"; })())}
      </div>

      <div class="grid cols-wide">
        <div class="card" style="padding:0">
          <div class="card-head" style="padding:18px 18px 0"><h3>📊 Tabelle Verbandsliga MV</h3><span class="spacer"></span>
            <button class="btn sm" data-stadd>＋ Team</button></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Team</th><th>Sp.</th><th>S</th><th>N</th><th>Sätze</th><th class="right">Pkt.</th><th></th></tr></thead>
            <tbody>${rows.map((r, i) => `<tr style="${/skv/i.test(r.team) ? "background:color-mix(in srgb,var(--accent) 10%,transparent)" : ""}">
              <td><strong>${i + 1}</strong></td>
              <td>${/skv/i.test(r.team) ? "🏐 " : ""}<strong>${esc(r.team)}</strong></td>
              <td>${r.games}</td><td>${r.win}</td><td>${r.loss}</td>
              <td class="soft">${r.setsW}:${r.setsL}</td>
              <td class="right"><strong>${r.points}</strong></td>
              <td class="right" style="white-space:nowrap">
                <button class="btn sm ghost" data-stedit="${r.id}" title="Bearbeiten">✏️</button>
                <button class="btn sm ghost" data-stdel="${r.id}" title="Löschen">🗑️</button></td></tr>`).join("") ||
              `<tr><td colspan="8" class="soft" style="padding:16px 18px">Noch keine Tabelle erfasst – über „＋ Team" die Mannschaften anlegen und nach jedem Spieltag kurz aktualisieren. Die Tabelle erscheint auch im Spieler-/Eltern-Portal.</td></tr>`}</tbody>
          </table></div>
          <p class="muted" style="padding:12px 18px;font-size:.78rem">Die Tabelle wird auch im Spieler-/Eltern-Portal angezeigt.
          ${(S().standingsMeta && S().standingsMeta.stand)
            ? `🔄 Automatischer Abgleich mit dem VMV-Spielbetrieb: <strong>${esc(S().standingsMeta.liga || "")}</strong>,
               Saison ${esc(S().standingsMeta.saison || "")}, Stand ${fmtDateShort(S().standingsMeta.stand)}.
               Handänderungen werden beim nächsten Abgleich (täglich 6:05) überschrieben.`
            : `Offizielle Tabellen: <a href="https://www.vmv24.de/" target="_blank" rel="noopener">VMV-Spielbetrieb (vmv24.de) ↗</a>`}</p>
        </div>

        <div class="card">
          <div class="card-head"><h3>🔗 Links</h3><span class="spacer"></span>
            <button class="btn sm" data-lkadd>＋ Link</button></div>
          <div class="list">${linkListHTML()}</div>
        </div>
      </div>`;
    bindLinkActions(el);
    $("[data-stadd]", el).onclick = () => standingForm();
    $$("[data-stedit]", el).forEach((b) => b.onclick = () => standingForm(Store.byId("standings", b.dataset.stedit)));
    $$("[data-stdel]", el).forEach((b) => b.onclick = () => {
      const r = Store.byId("standings", b.dataset.stdel);
      confirmDialog(`Team „${esc(r.team)}“ aus der Tabelle löschen?`, () => {
        Store.remove("standings", r.id); toast("Team gelöscht"); reload();
      });
    });
  }

  // Tabellenzeile anlegen/bearbeiten (Pflege nach jedem Spieltag)
  function standingForm(r) {
    const isEdit = !!r;
    r = r || { team: "", games: 0, win: 0, loss: 0, setsW: 0, setsL: 0, points: 0 };
    const zahl = (name, label, val) => `<div class="field"><label>${label}</label>
      <input type="number" name="${name}" value="${val}" min="0" max="999" required></div>`;
    modal({
      title: isEdit ? `Team bearbeiten – ${esc(r.team)}` : "Team in die Tabelle aufnehmen",
      body: `<form id="stf"><div class="form-grid">
        <div class="field full"><label>Team</label><input name="team" value="${esc(r.team)}" required placeholder="z. B. SKV Müritz"></div>
        ${zahl("games", "Spiele", r.games)}${zahl("points", "Punkte", r.points)}
        ${zahl("win", "Siege", r.win)}${zahl("loss", "Niederlagen", r.loss)}
        ${zahl("setsW", "Sätze gewonnen", r.setsW)}${zahl("setsL", "Sätze verloren", r.setsL)}
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#stf"); if (!f.reportValidity()) return;
          const d = formData(f);
          const werte = { team: d.team, games: +d.games || 0, win: +d.win || 0, loss: +d.loss || 0,
                          setsW: +d.setsW || 0, setsL: +d.setsL || 0, points: +d.points || 0 };
          if (isEdit) Store.update("standings", r.id, werte);
          else Store.add("standings", werte);
          closeModal(); toast("Tabelle gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     WIKI (Volleyball erklärt)
     ====================================================================== */
  // Wiki-Artikel: werden auch im Spieler-/Eltern-Portal gezeigt (portal.js,
  // ohne den Trainer-Artikel) – daher außerhalb der View definiert.
  const WIKI_ARTIKEL = [
      { id: "grundlagen", h: "🏐 Grundlagen & Ziel des Spiels", html: `
        <p>Volleyball wird von zwei Teams zu je sechs Spieler:innen über ein Netz gespielt. Ziel ist es, den Ball so über das Netz ins gegnerische Feld zu spielen, dass ihn das andere Team nicht regelkonform zurückspielen kann. Ein Team darf den Ball maximal <strong>dreimal</strong> berühren (plus möglicher Block), bevor er über das Netz muss.</p>
        <ul><li>Feldgröße: 18 × 9 Meter, geteilt durch das Netz. Die <strong>Angriffslinie</strong> (3-m-Linie) trennt Vorder- und Hinterzone.</li>
        <li>Netzhöhe: 2,24 m (Frauen) bzw. 2,43 m (Männer); in der Jugend niedriger.</li>
        <li>Ein Satz wird bis <strong>25 Punkte</strong> gespielt (mind. 2 Punkte Vorsprung).</li>
        <li>Gewonnen hat, wer zuerst <strong>3 Sätze</strong> gewinnt (Tie-Break bis 15).</li>
        <li>Der Ball darf mit <strong>jedem Körperteil</strong> gespielt werden – auch mit dem Fuß!</li></ul>` },
      { id: "geschichte", h: "📜 Geschichte des Volleyballs", html: `
        <p>Volleyball wurde <strong>1895</strong> vom US-Amerikaner William G. Morgan erfunden – als sanftere Alternative zum Basketball. Der ursprüngliche Name war „Mintonette“. Weil der Ball ständig hin- und herfliegt („to volley“), setzte sich schnell der Name Volleyball durch.</p>
        <ul>
        <li><strong>1947:</strong> Gründung des Weltverbands FIVB.</li>
        <li><strong>1964:</strong> Volleyball wird olympisch (Tokio).</li>
        <li><strong>1996:</strong> Beachvolleyball wird olympisch (Atlanta).</li>
        <li><strong>1998:</strong> Einführung des Rally-Point-Systems und des Liberos – das Spiel wird schneller und spannender.</li>
        <li>Heute ist Volleyball mit über <strong>800 Millionen</strong> Aktiven eine der größten Sportarten der Welt.</li></ul>` },
      { id: "zaehlweise", h: "🔢 Zählweise (Rally-Point-System)", html: `
        <p>Es gilt das Rally-Point-System: <strong>Jeder Ballwechsel</strong> bringt einen Punkt – egal welches Team aufgeschlagen hat. Gewinnt das annehmende Team den Ballwechsel, erhält es den Punkt <em>und</em> das Aufschlagrecht – alle Spieler:innen rotieren dann im Uhrzeigersinn eine Position weiter.</p>
        <ul>
        <li>Sätze 1–4 gehen bis <strong>25 Punkte</strong>, der Entscheidungssatz (Tie-Break) bis <strong>15</strong>.</li>
        <li>Immer mit <strong>2 Punkten Vorsprung</strong> – ein Satz kann also auch 31:29 enden.</li>
        <li>Im Tie-Break werden bei 8 Punkten die Seiten gewechselt.</li>
        <li>Je Satz hat jedes Team <strong>2 Auszeiten</strong> (30 Sekunden).</li></ul>` },
      { id: "positionen", h: "📍 Positionen & Rotation", html: `
        <p>Auf dem Feld stehen sechs Positionen, nummeriert 1 (hinten rechts) bis 6 (hinten Mitte) – gegen den Uhrzeigersinn. Nach Gewinn des Aufschlagrechts rotieren alle im Uhrzeigersinn um eine Position.</p>
        <ul>
        <li><strong>Zuspieler:in (Steller:in):</strong> das „Gehirn“ des Teams – organisiert den Angriff und spielt fast immer den zweiten Ball.</li>
        <li><strong>Außenangreifer:in (Annahme/Außen):</strong> greift über Position 4 an und trägt die Annahme mit.</li>
        <li><strong>Mittelblocker:in:</strong> blockt in der Mitte und schlägt schnelle Bälle („Quick“).</li>
        <li><strong>Diagonalangreifer:in:</strong> Hauptangreifer:in gegenüber dem Zuspiel, meist ohne Annahmeaufgaben.</li>
        <li><strong>Libero / Libera:</strong> Abwehrspezialist:in im andersfarbigen Trikot – darf nicht aufschlagen, blocken oder vorne angreifen.</li></ul>
        <p>Wichtig: Die Aufstellung muss nur <strong>im Moment des Aufschlags</strong> stimmen – danach dürfen alle frei laufen.</p>` },
      { id: "spielsysteme", h: "🧩 Spielsysteme: 5-1, 4-2 & 6-2", html: `
        <p>Das Spielsystem beschreibt, wie viele Angreifer:innen und Zuspieler:innen ein Team einsetzt:</p>
        <ul>
        <li><strong>4-2 (Einsteiger:innen):</strong> vier Angreifer:innen, zwei Zuspieler:innen – es stellt immer die Person, die gerade vorne steht. Einfach zu lernen, ideal für Jugendteams.</li>
        <li><strong>6-2:</strong> zwei Zuspieler:innen, die aber nur aus dem Hinterfeld stellen – so stehen vorne immer drei Angreifer:innen. Braucht viel Laufarbeit.</li>
        <li><strong>5-1 (Standard im Leistungsbereich):</strong> genau ein:e Zuspieler:in stellt jeden Ball – maximale Abstimmung, aber in drei Rotationen nur zwei Angreifer:innen vorne.</li></ul>
        <p>Der „Läufer“ beschreibt dabei, wie sich der:die Zuspieler:in nach dem Aufschlag aus der Annahme-Position zum Netz bewegt (z. B. „Läufer 1“ von Position 1).</p>` },
      { id: "techniken", h: "🖐️ Grundtechniken", html: `
        <ul>
        <li><strong>Pritschen (oberes Zuspiel):</strong> Ball wird mit den Fingerspitzen über der Stirn gespielt – Körbchenstellung, Beine mitarbeiten lassen. Basis des Zuspiels.</li>
        <li><strong>Baggern (unteres Zuspiel):</strong> Ball auf den gestreckten Unterarmen („Spielbrett“) annehmen – für Aufschlagannahme und Feldabwehr. Tiefe Position, Schultern vor.</li>
        <li><strong>Aufschlag (Service):</strong> von unten (Einstieg) oder von oben (Tennis-, Flatter- oder Sprungaufschlag).</li>
        <li><strong>Angriff (Schmetterschlag):</strong> Stemmschritt-Anlauf (links-rechts-links für Rechtshänder:innen), beidbeiniger Absprung, Schlag mit gestrecktem Arm über dem Kopf.</li>
        <li><strong>Block:</strong> Sprung dicht an der Netzkante, Hände aktiv über das Netz schieben, Finger gespreizt.</li>
        <li><strong>Hechtbagger / Rolle:</strong> Abwehrtechniken für weite Bälle – kontrolliert fallen lernen gehört zum Training.</li></ul>` },
      { id: "aufschlag", h: "🎾 Aufschlagarten im Detail", html: `
        <ul>
        <li><strong>Aufschlag von unten:</strong> sicher und einfach – der Einstieg für alle. Ball auf der flachen Hand, mit der Faust oder Handfläche treffen.</li>
        <li><strong>Tennisaufschlag:</strong> von oben mit Effet (Topspin) – der Ball fällt hinter dem Netz nach unten.</li>
        <li><strong>Flatteraufschlag (Float):</strong> ohne Rotation getroffen – der Ball „flattert“ unberechenbar. Sehr effektiv, weil die Annahme die Flugbahn schwer lesen kann.</li>
        <li><strong>Sprungaufschlag (Jump Serve):</strong> Anwurf + Angriffsanlauf – der härteste Aufschlag, aber auch der riskanteste.</li>
        <li><strong>Sprungflatterer (Jump Float):</strong> Kompromiss aus Druck und Sicherheit – im modernen Volleyball am weitesten verbreitet.</li></ul>
        <p>Taktik-Tipp: Gezielt auf die schwächste Annahme oder in die „Naht“ zwischen zwei Spieler:innen aufschlagen!</p>` },
      { id: "angriff", h: "💥 Angriffsvarianten", html: `
        <ul>
        <li><strong>Hoher Ball außen („Vier“):</strong> der Klassiker über die Außenposition.</li>
        <li><strong>Quick / Schnellangriff („Eins“):</strong> der:die Mittelblocker:in springt, bevor der Ball gestellt ist – kaum zu blocken, braucht perfektes Timing.</li>
        <li><strong>Pipe:</strong> Hinterfeldangriff durch die Mitte – Absprung hinter der 3-m-Linie.</li>
        <li><strong>Diagonal-Angriff („Fünf“):</strong> hoher Ball auf Position 2 für den:die Diagonalangreifer:in.</li>
        <li><strong>Lob / Finte:</strong> angetäuschter Schlag, der Ball wird kurz hinter den Block gelegt – oft der klügste Punkt.</li>
        <li><strong>Wischer (Tool):</strong> bewusst gegen die Blockhände schlagen, sodass der Ball ins Aus abprallt – Punkt fürs angreifende Team.</li></ul>` },
      { id: "blockabwehr", h: "🧱 Block & Feldabwehr", html: `
        <p>Verteidigung beginnt am Netz: Der Block nimmt dem Angriff Raum weg, die Feldabwehr sichert den Rest.</p>
        <ul>
        <li><strong>Einerblock / Doppelblock / Dreierblock:</strong> je mehr Hände am Netz, desto kleiner das Angriffsfenster – ein Doppelblock ist das Standardziel.</li>
        <li><strong>Blockschatten:</strong> der Bereich hinter dem Block, in den kein harter Ball kommen kann – die Feldabwehr stellt sich <em>daneben</em> auf.</li>
        <li><strong>Abwehrsysteme:</strong> „6 vorne“ (Position 6 sichert kurze Bälle hinter dem Block) oder „6 hinten“ (Standard: Position 6 sichert die Grundlinie).</li>
        <li><strong>Der Block zählt nicht</strong> als eine der drei Berührungen – nach Blockkontakt darf dieselbe Person sofort weiterspielen.</li></ul>` },
      { id: "libero", h: "🦺 Libero: Sonderregeln", html: `
        <p>Der:die Libero:Libera ist Spezialist:in für Annahme und Feldabwehr – erkennbar am andersfarbigen Trikot.</p>
        <ul>
        <li>Darf <strong>nicht aufschlagen</strong>, <strong>nicht blocken</strong> und keinen Angriffsschlag oberhalb der Netzkante ausführen.</li>
        <li>Wechselt <strong>ohne offizielle Auswechslung</strong> für eine:n Hinterfeldspieler:in ein und aus (meist für die Mitte).</li>
        <li>Stellt der:die Libero:Libera den Ball in der Vorderzone <em>im oberen Zuspiel</em>, darf der folgende Angriff nicht oberhalb der Netzkante geschlagen werden.</li>
        <li>Ein Team darf pro Spiel bis zu <strong>zwei Liberos</strong> benennen.</li></ul>` },
      { id: "regeln", h: "⚖️ Wichtige Regeln & typische Fehler", html: `
        <ul>
        <li><strong>Vierschlag:</strong> Ball mehr als dreimal berührt (Block zählt nicht mit).</li>
        <li><strong>Doppelberührung:</strong> zweimal hintereinander durch dieselbe Person (außer nach Block und beim ersten Schlag in einer Aktion).</li>
        <li><strong>Netzberührung</strong> zwischen den Antennen während der Spielaktion ist ein Fehler – Haare zählen nicht.</li>
        <li><strong>Übertreten der Mittellinie</strong> mit dem ganzen Fuß (Teilberührung der Linie ist ok, solange niemand behindert wird).</li>
        <li><strong>Rotations-/Positionsfehler:</strong> falsche Aufstellung im Moment des Aufschlags.</li>
        <li><strong>Fußfehler</strong> beim Aufschlag (Grundlinie berührt) – dafür gibt es <strong>8 Sekunden</strong> Zeit nach dem Pfiff.</li>
        <li><strong>Gegnerischen Aufschlag</strong> blocken oder direkt oberhalb der Netzkante angreifen ist verboten.</li>
        <li>Der Ball ist erst „aus“, wenn er den Boden, die Antenne oder ein Objekt außerhalb berührt – <strong>die Linie zählt zum Feld</strong>.</li></ul>` },
      { id: "schiedsrichter", h: "🧑‍⚖️ Schiedsrichter:innen & Handzeichen", html: `
        <p>Ein Spiel leiten der:die 1. Schiedsrichter:in (auf dem Stuhl am Netz), der:die 2. Schiedsrichter:in (gegenüber), das Schreiberteam und die Linienrichter:innen.</p>
        <ul>
        <li><strong>Aufschlagfreigabe:</strong> Pfiff + Arm zeigt zur aufschlagenden Seite.</li>
        <li><strong>Ball „in“:</strong> Arm zeigt flach auf das Feld. <strong>Ball „aus“:</strong> Unterarme senkrecht hoch, Handflächen zum Körper.</li>
        <li><strong>Vier Berührungen:</strong> vier gespreizte Finger. <strong>Doppelberührung:</strong> zwei Finger.</li>
        <li><strong>Netzberührung:</strong> Hand tippt auf die Netzoberkante der fehlbaren Seite.</li>
        <li><strong>Auszeit:</strong> Hände formen ein T.</li></ul>
        <p>Respekt gehört dazu: Nur der:die Spielkapitän:in darf Entscheidungen (höflich!) hinterfragen.</p>` },
      { id: "beach", h: "🏖️ Beachvolleyball: die Unterschiede", html: `
        <ul>
        <li><strong>2 gegen 2</strong> auf 16 × 8 m Sand – ohne Positionswechsel-Zwang und ohne Libero.</li>
        <li>Sätze bis <strong>21</strong> (Tie-Break bis 15), gespielt wird auf zwei Gewinnsätze; Seitenwechsel alle 7 Punkte.</li>
        <li>Der Block <strong>zählt als erste Berührung</strong> – danach sind nur noch zwei Kontakte erlaubt.</li>
        <li>Pritschen wird deutlich strenger bewertet, ein angepritschter Ball über das Netz muss senkrecht zur Schulterachse fliegen.</li>
        <li>Kein festes Zuspiel: Beide müssen alles können – deshalb ist Beach im Sommer das perfekte Ergänzungstraining!</li></ul>` },
      { id: "ausruestung", h: "🎽 Ausrüstung & Kleidung", html: `
        <ul>
        <li><strong>Hallenschuhe</strong> mit heller Sohle und gutem Seitenhalt – Laufschuhe sind ungeeignet und in vielen Hallen verboten.</li>
        <li><strong>Knieschoner:</strong> Pflicht fürs Abwehrtraining – schützen beim Hechten und Rutschen.</li>
        <li><strong>Ball:</strong> Größe 5, 260–280 g; für die Jugend gibt es leichtere Bälle.</li>
        <li>Schmuck und Uhren bleiben in der Tasche – Verletzungsgefahr für alle.</li>
        <li>Trikot: Bitte behandelt eure Vereinstrikots gut – sie gehören dem Verein und werden nur an aktive Spieler:innen ausgegeben.</li></ul>` },
      { id: "fitness", h: "💪 Fitness & Ernährung", html: `
        <p>Volleyball verlangt Sprungkraft, Schnelligkeit und Rumpfstabilität. Wer regelmäßig ein paar Basics macht, spielt besser und verletzt sich seltener:</p>
        <ul>
        <li><strong>Sprungkraft:</strong> Ausfallschritte, Kniebeugen, Seilspringen – 2 × pro Woche 10 Minuten wirken schon.</li>
        <li><strong>Rumpf:</strong> Planks und Seitstütz stabilisieren Schlag und Landung.</li>
        <li><strong>Schultern:</strong> vor dem Training mit Theraband aufwärmen – die Schlagschulter dankt es.</li>
        <li><strong>Essen & Trinken:</strong> 2–3 Stunden vor dem Spiel die letzte große Mahlzeit; Wasser statt Energydrinks; nach dem Sport hilft Eiweiß + Kohlenhydrate bei der Erholung.</li>
        <li><strong>Schlaf</strong> ist das beste Regenerationsmittel – vor Spieltagen 8+ Stunden.</li></ul>` },
      { id: "ligen", h: "🏆 Ligasystem: Deutschland & MV", html: `
        <p>So geht es von der Kreisliga bis ganz nach oben:</p>
        <ul>
        <li><strong>Bundesliga</strong> (1. & 2., bundesweit) → <strong>Dritte Liga</strong> → <strong>Regionalliga Nordost</strong> → <strong>Oberliga</strong> → dann die Ebene des Landesverbands.</li>
        <li>In Mecklenburg-Vorpommern organisiert der <strong>Volleyballverband M-V (VMV)</strong> den Spielbetrieb: Verbandsliga → Landesliga → Landesklasse, dazu Pokal- und Jugendwettbewerbe.</li>
        <li>Unsere SKV-Teams spielen in der Verbandsliga und den Landesligen – die aktuellen Tabellen findest du hier in der App unter „Tabelle“.</li>
        <li>Gespielt wird meist an <strong>Spieltagen mit mehreren Teams</strong> in einer Halle – deshalb sind Heimspieltage mit Buffet und Auf-/Abbau echte Teamarbeit!</li></ul>` },
      { id: "training", h: "🎯 Trainingsaufbau (für Trainer:innen)", html: `
        <p>Ein ausgewogenes Jugendtraining kombiniert Technik, Spielformen und Athletik:</p>
        <ul>
        <li><strong>Aufwärmen (15 min):</strong> Lauf-ABC, Ballgewöhnung, Mobilisation.</li>
        <li><strong>Technikblock (25 min):</strong> Fokus auf 1–2 Techniken, viele Wiederholungen.</li>
        <li><strong>Spielformen (30 min):</strong> Kleinfeld 2:2/3:3, Situationsspiele.</li>
        <li><strong>Abschlussspiel (15 min):</strong> 6:6 mit Aufgabenstellung.</li>
        <li><strong>Cool-down (5 min):</strong> Dehnen, Feedback, Ausblick.</li></ul>
        <p>Fertige Bausteine samt Quellen gibt es unter „Trainingsrückmeldung und Planung“ – dort lässt sich mit wenigen Klicks ein komplettes Training zusammenstellen.</p>` },
      { id: "begriffe", h: "📖 Glossar", html: `
        <dl class="kv">
        <dt>Ass</dt><dd>Direkter Punkt durch den Aufschlag.</dd>
        <dt>Block</dt><dd>Abwehr des gegnerischen Angriffs direkt am Netz.</dd>
        <dt>Dig</dt><dd>Abwehr eines harten Angriffsballs.</dd>
        <dt>Down Ball</dt><dd>Angriff ohne Sprung – der Block bleibt unten.</dd>
        <dt>Free Ball</dt><dd>Leicht zu verteidigender Ball, der ohne Druck übers Netz kommt.</dd>
        <dt>Joust</dt><dd>Gleichzeitiger Ballkontakt zweier Gegner:innen über der Netzkante – erlaubt.</dd>
        <dt>Lob / Finte</dt><dd>Angetäuschter Angriff, Ball wird kurz gelegt.</dd>
        <dt>MVP</dt><dd>Wertvollste:r Spieler:in eines Spiels oder Turniers.</dd>
        <dt>Pipe</dt><dd>Hinterfeldangriff durch die Mitte.</dd>
        <dt>Rally</dt><dd>Ein kompletter Ballwechsel vom Aufschlag bis zum Punkt.</dd>
        <dt>Rotation</dt><dd>Weiterrücken aller Spieler:innen im Uhrzeigersinn nach Gewinn des Aufschlagrechts.</dd>
        <dt>Side-Out</dt><dd>Das annehmende Team gewinnt den Ballwechsel.</dd>
        <dt>Tie-Break</dt><dd>Entscheidungssatz bis 15 Punkte.</dd>
        <dt>Tool / Wischer</dt><dd>Absichtlicher Schlag gegen den Block ins Aus.</dd>
        <dt>Transition</dt><dd>Umschalten von Abwehr auf Angriff.</dd>
        <dt>Zuspiel über Kopf</dt><dd>Zuspiel nach hinten, ohne hinzusehen – Überraschungsmoment.</dd></dl>` },
  ];
  window.WikiArtikel = WIKI_ARTIKEL;

  function wiki(el) {
    const articles = WIKI_ARTIKEL;

    const eigeneFragen = S().quizFragen || [];
    el.innerHTML = `
      ${head("Volleyball-Wiki", "Regeln, Techniken und Begriffe – ideal für neue Spieler und Eltern")}
      ${window.Sync && Sync.active ? `
      <div class="grid grid-2 mb">
        <div class="card">
          <div class="card-head"><h3>🏐 Quiz-Beteiligung der Spieler:innen</h3></div>
          <div id="quizStatBox"><p class="soft">Wird geladen …</p></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>❓ Eigene Quizfragen</h3><span class="spacer"></span>
            <button class="btn sm" data-qfneu>＋ Frage</button></div>
          <p class="soft" style="font-size:.82rem;margin-top:0">Eigene Fragen erscheinen sofort im Portal-Quiz
          des gewählten Kapitels und zählen ganz normal Punkte.</p>
          <div class="list" style="max-height:260px;overflow-y:auto">
            ${eigeneFragen.length ? eigeneFragen.map((q) => `
              <div class="list-item" style="padding:8px 10px"><div class="grow">
                <div class="title" style="font-size:.86rem">${esc(q.f)}</div>
                <div class="sub">${esc(QUIZ_KAPITEL_NAMEN[q.kapitel] || q.kapitel)} · richtig: ${esc((q.a || [])[q.r] || "?")}</div></div>
                <button class="btn sm ghost" data-qfedit="${q.id}">✏️</button>
                <button class="btn sm ghost" data-qfdel="${q.id}">🗑️</button>
              </div>`).join("") : `<p class="soft">Noch keine eigenen Fragen.</p>`}
          </div>
        </div>
      </div>` : ""}
      <div class="grid cols-toc">
        <div class="card wiki-toc" style="position:sticky;top:80px">
          <h3 style="font-size:.9rem">Inhalt</h3>
          ${articles.map((a) => `<a href="#/wiki" data-goto="${a.id}">${esc(a.h)}</a>`).join("")}
          <hr style="border:none;border-top:1px solid var(--border);margin:10px 0">
          <a href="https://www.volleyball-verband.de/de/service/schiedsrichter/regelwerk/" target="_blank" rel="noopener">📘 Offizielles Regelwerk (DVV) ↗</a>
        </div>
        <div class="card wiki-article">
          ${articles.map((a) => `<div id="wiki-${a.id}"><h3>${esc(a.h)}</h3>${a.html}</div>`).join("")}
        </div>
      </div>`;

    $$("[data-goto]", el).forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      const t = el.querySelector(`#wiki-${a.dataset.goto}`);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Quiz-Beteiligung laden (Server-Modus) + eigene Fragen verwalten
    if (window.Sync && Sync.active) {
      (async () => {
        const res = await apiZugang("/api/quiz-uebersicht");
        const box = $("#quizStatBox", el);
        if (!box) return;
        if (!res.ok) { box.innerHTML = `<p class="soft">Konnte nicht geladen werden.</p>`; return; }
        const st = res.data;
        box.innerHTML = `
          <p class="soft" style="margin-top:0;font-size:.82rem"><strong>${st.beteiligt} von ${st.gesamt}</strong>
          Spieler:innen-Konten haben schon Punkte gesammelt · Woche ${esc(st.woche)}</p>
          <div class="list" style="max-height:220px;overflow-y:auto">
            ${st.spieler.length ? st.spieler.map((s2, i) => `
              <div class="list-item" style="padding:7px 10px"><div class="grow">
                <div class="title" style="font-size:.86rem">${["🥇", "🥈", "🥉"][s2.wochenPunkte > 0 ? i : 99] || ""} ${esc(s2.name)}</div>
                <div class="sub">${s2.beantwortetWoche} Fragen diese Woche${s2.zuletzt ? ` · zuletzt ${fmtDateShort(new Date(s2.zuletzt * 1000).toISOString())}` : " · noch nie gespielt"}</div></div>
                <span class="badge accent">${s2.wochenPunkte} P. Woche</span>
                <span class="badge">${s2.punkte} P. gesamt</span>
              </div>`).join("") : `<p class="soft">Noch keine Spieler:innen-Konten.</p>`}
          </div>`;
      })();
      const qfForm = (q) => {
        const isEdit = !!q;
        q = q || { kapitel: "begriffe", f: "", a: ["", "", ""], r: 0, stufe: 2 };
        modal({
          title: isEdit ? "Quizfrage bearbeiten" : "Neue Quizfrage",
          body: `<form id="qf"><div class="form-grid">
            <div class="field"><label>Kategorie</label><select name="kapitel">
              ${Object.entries(QUIZ_KAPITEL_NAMEN).map(([k, l]) => `<option value="${k}" ${k === q.kapitel ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="field"><label>Schwierigkeit</label><select name="stufe">
              <option value="1" ${q.stufe === 1 ? "selected" : ""}>🟢 Anfänger (5 P.)</option>
              <option value="2" ${!q.stufe || q.stufe === 2 ? "selected" : ""}>🟡 Fortgeschritten (10 P.)</option>
              <option value="3" ${q.stufe === 3 ? "selected" : ""}>🔴 Profi (15 P.)</option></select></div>
            <div class="field full"><label>Frage</label><input name="f" value="${esc(q.f)}" required></div>
            ${[0, 1, 2].map((i) => `<div class="field full"><label>Antwort ${i + 1} ${q.r === i ? "" : ""}</label>
              <div class="flex" style="gap:8px"><input name="a${i}" value="${esc(q.a[i] || "")}" required style="flex:1">
              <label style="font-weight:400;display:flex;align-items:center;gap:5px;white-space:nowrap">
                <input type="radio" name="richtig" value="${i}" ${q.r === i ? "checked" : ""} style="width:auto"> richtig</label></div></div>`).join("")}
          </div></form>`,
          footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
          onOpen(m) {
            m.querySelector("[data-x]").onclick = closeModal;
            m.querySelector("[data-s]").onclick = () => {
              const f = m.querySelector("#qf"); if (!f.reportValidity()) return;
              const d = formData(f);
              const werte = { kapitel: d.kapitel, f: d.f, stufe: Number(d.stufe) || 2,
                              a: [d.a0, d.a1, d.a2], r: +(f.querySelector("[name=richtig]:checked") || {}).value || 0 };
              if (isEdit) Store.update("quizFragen", q.id, werte);
              else Store.add("quizFragen", Object.assign({ id: Store.uid("qc") }, werte));
              closeModal(); toast("Quizfrage gespeichert – ab sofort im Portal", "good"); reload();
            };
          },
        });
      };
      const neu = $("[data-qfneu]", el);
      if (neu) neu.onclick = () => qfForm();
      $$("[data-qfedit]", el).forEach((b) => b.onclick = () => qfForm(Store.byId("quizFragen", b.dataset.qfedit)));
      $$("[data-qfdel]", el).forEach((b) => b.onclick = () => confirmDialog("Frage löschen?", () => {
        Store.remove("quizFragen", b.dataset.qfdel); toast("Frage gelöscht"); reload();
      }));
    }
  }

  /* ======================================================================
     ANKÜNDIGUNGEN (Eltern-Kommunikation)
     ====================================================================== */
  function announcements(el) {
    const s = S();
    el.innerHTML = `
      ${head("Ankündigungen & Eltern-Info", "Nachrichten an Team und Eltern zentral veröffentlichen", `<button class="btn" data-add>＋ Ankündigung</button>`)}
      <div class="list">
        ${s.announcements.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((a) => `
          <div class="card">
            <div class="flex mb"><h3 style="margin:0">${esc(a.title)}</h3><span class="spacer"></span>
              <span class="badge ${a.audience === "eltern" ? "info" : "accent"}">${a.audience === "eltern" ? "👪 Eltern" : "👥 Alle"}</span>
              <span class="badge">${fmtDateShort(a.date)}</span></div>
            <p style="margin:0" class="soft">${esc(a.body)}</p>
            <div class="flex mt"><span class="spacer"></span>
              <button class="btn sm ghost" data-adel="${a.id}">🗑️ Löschen</button></div>
          </div>`).join("") || empty("📣", "Noch keine Ankündigungen")}
      </div>`;

    $("[data-add]", el).onclick = () => announcementForm();
    $$("[data-adel]", el).forEach((b) => b.onclick = () => confirmDialog("Ankündigung löschen?", () => { Store.remove("announcements", b.dataset.adel); toast("Gelöscht"); reload(); }));
  }
  function announcementForm() {
    modal({
      title: "Neue Ankündigung",
      body: `<form id="af"><div class="form-grid">
        <div class="field full"><label>Titel</label><input name="title" required></div>
        <div class="field"><label>Zielgruppe</label><select name="audience"><option value="alle">Alle</option><option value="eltern">Eltern</option></select></div>
        <div class="field full"><label>Nachricht</label><textarea name="body" rows="5" required></textarea></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Veröffentlichen</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#af"); if (!f.reportValidity()) return;
          const d = formData(f); d.date = new Date().toISOString();
          Store.add("announcements", d); closeModal(); toast("Veröffentlicht", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     AUFGABEN (Trainer To-Do)
     ====================================================================== */
  function tasks(el) {
    const s = S();
    const open = s.tasks.filter((t) => !t.done).sort((a, b) => new Date(a.due) - new Date(b.due));
    const done = s.tasks.filter((t) => t.done);
    el.innerHTML = `
      ${head("Aufgaben", "Deine To-Do-Liste rund um das Team", `<button class="btn" data-add>＋ Aufgabe</button>`)}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3>Offen (${open.length})</h3></div>
          <div class="list">${open.length ? open.map((t) => taskRow(t)).join("") : empty("🎉", "Alles erledigt!")}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Erledigt (${done.length})</h3></div>
          <div class="list">${done.map((t) => taskRow(t)).join("") || empty("—", "Noch nichts erledigt")}</div>
        </div>
      </div>`;

    $("[data-add]", el).onclick = () => taskForm();
    $$("[data-tdone]", el).forEach((cb) => cb.onchange = () => {
      Store.update("tasks", cb.dataset.tdone, { done: cb.checked });
      if (cb.checked) volleyballFlug();
      reload();
    });
    $$("[data-tdel]", el).forEach((b) => b.onclick = () => { Store.remove("tasks", b.dataset.tdel); toast("Gelöscht"); reload(); });
    $$("[data-terinnern]", el).forEach((b) => b.onclick = async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const res = await apiZugang("/api/aufgaben/erinnern", { taskId: b.dataset.terinnern });
      if (!res.ok) toast(res.data.error || "Erinnerung fehlgeschlagen", "bad");
      else toast(`🔔 Erinnerung an ${res.data.empfaenger} Konto/Konten geschickt (${res.data.ok} Push-Abos erreicht)`, "good");
    });
    $$("[data-tedit2]", el).forEach((b) => b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      taskForm(Store.byId("tasks", b.dataset.tedit2));
    });
    $$("[data-tdup]", el).forEach((b) => b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      taskForm(Store.byId("tasks", b.dataset.tdup), true);
    });
  }
  const TASK_ZIEL = { spieler: "🏐 an Spieler:innen", eltern: "👪 an Eltern", alle: "👨‍👩‍👧 an alle im Portal" };
  function taskRow(t) {
    const overdue = !t.done && daysUntil(t.due) < 0;
    const portalZiel = t.zielRolle && t.zielRolle !== "trainer";
    const zielInfo = portalZiel
      ? ` <span class="badge info">${TASK_ZIEL[t.zielRolle] || "Portal"}${(t.zielPlayerIds || []).length ? ` · ${t.zielPlayerIds.length} ausgewählt` : ""}</span>
          <span class="badge ${(t.erledigtVon || []).length ? "good" : ""}">${(t.erledigtVon || []).length}× erledigt</span>`
      : "";
    return `<label class="list-item" style="cursor:pointer">
      <input type="checkbox" data-tdone="${t.id}" ${t.done ? "checked" : ""} style="width:auto">
      <div class="grow"><div class="title" style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</div>
        <div class="sub">${t.done ? "erledigt" : `fällig ${relDays(t.due)}`} · ${prioBadge(t.priority)} ${overdue ? '<span class="badge bad">überfällig</span>' : ""}${zielInfo}</div></div>
      ${portalZiel && !t.done && window.Sync && Sync.active
        ? `<button class="btn sm ghost" data-terinnern="${t.id}" title="Push-Erinnerung an alle schicken, die noch nicht erledigt haben">🔔</button>` : ""}
      <button class="btn sm ghost" data-tedit2="${t.id}" title="Bearbeiten">✏️</button>
      <button class="btn sm ghost" data-tdup="${t.id}" title="Duplizieren">⧉</button>
      <button class="btn sm ghost" data-tdel="${t.id}">🗑️</button></label>`;
  }
  function taskForm(t, alsKopie) {
    const isEdit = !!t && !alsKopie;
    t = t || { title: "", due: new Date().toISOString(), priority: "mittel", zielRolle: "trainer", zielPlayerIds: [] };
    const aktive = S().players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    modal({
      title: isEdit ? "Aufgabe bearbeiten" : alsKopie ? "Aufgabe duplizieren" : "Neue Aufgabe",
      body: `<form id="tf"><div class="form-grid">
        <div class="field full"><label>Aufgabe</label><input name="title" value="${esc(t.title)}" required></div>
        <div class="field"><label>Fällig am</label><input type="date" name="due" value="${String(t.due || "").slice(0, 10) || new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Priorität</label><select name="priority">
          ${["hoch", "mittel", "niedrig"].map((x) => `<option ${x === t.priority ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field full"><label>👥 Zuweisung</label><select name="zielRolle" id="tfRolle">
          <option value="trainer" ${!t.zielRolle || t.zielRolle === "trainer" ? "selected" : ""}>Nur Trainerteam (interne Aufgabe)</option>
          <option value="spieler" ${t.zielRolle === "spieler" ? "selected" : ""}>Alle Spieler:innen (Portal)</option>
          <option value="eltern" ${t.zielRolle === "eltern" ? "selected" : ""}>Alle Eltern (Portal)</option>
          <option value="alle" ${t.zielRolle === "alle" ? "selected" : ""}>Alle im Portal (Spieler:innen + Eltern)</option>
        </select></div>
        <div class="field full" id="tfEinzel" ${!t.zielRolle || t.zielRolle === "trainer" ? "hidden" : ""}><label>Nur für einzelne Spieler:innen/Familien <span class="soft" style="font-weight:400">(leer = alle der gewählten Rolle)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:8px 14px;max-height:160px;overflow-y:auto;padding:6px 2px">
          ${aktive.map((p) => `<label style="font-weight:400;display:flex;align-items:center;gap:6px;font-size:.86rem">
            <input type="checkbox" name="zp_${p.id}" ${(t.zielPlayerIds || []).includes(p.id) ? "checked" : ""} style="width:auto"> ${esc(p.firstName)} ${esc(p.lastName)}</label>`).join("")}
          </div></div>
        ${!isEdit ? `
        <div class="field"><label>🔁 Wiederholen</label><select name="wdh">
          <option value="">nicht wiederholen</option>
          <option value="7">wöchentlich</option>
          <option value="14">alle 2 Wochen</option>
          <option value="30">monatlich</option>
        </select></div>
        <div class="field"><label>Wiederholen bis</label><input type="date" name="wdhBis"></div>` : ""}
        <p class="soft full" style="font-size:.8rem;margin:0">Portal-Aufgaben erscheinen den Empfänger:innen auf der
        Portal-Übersicht und können dort abgehakt werden. Erinnerung: automatisch per Push-Mitteilung zum
        Fälligkeitstag – oder jederzeit über den 🔔-Knopf in der Aufgabenliste.</p>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("#tfRolle").onchange = (ev) => {
          m.querySelector("#tfEinzel").hidden = ev.target.value === "trainer";
        };
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#tf"); if (!f.reportValidity()) return;
          const d = formData(f);
          const wdh = Number(d.wdh) || 0;
          const wdhBis = d.wdhBis ? new Date(d.wdhBis + "T23:59:59") : null;
          delete d.wdh; delete d.wdhBis;
          d.due = new Date(d.due).toISOString();
          d.zielPlayerIds = d.zielRolle === "trainer" ? []
            : Object.keys(d).filter((k) => k.startsWith("zp_") && d[k]).map((k) => k.slice(3));
          Object.keys(d).forEach((k) => { if (k.startsWith("zp_")) delete d[k]; });
          if (isEdit) {
            Store.update("tasks", t.id, d);
            closeModal(); toast("Aufgabe aktualisiert", "good"); reload();
            return;
          }
          d.done = false;
          d.erledigtVon = [];
          if (wdh && wdhBis) {
            // Serie: eigenständige Aufgaben im gewählten Rhythmus (max. 26)
            const seriesId = Store.uid("ts");
            let cur = new Date(d.due), n = 0;
            while (cur <= wdhBis && n < 26) {
              Store.add("tasks", Object.assign({}, d, { due: cur.toISOString(), erledigtVon: [], seriesId }));
              cur = new Date(cur.getTime() + wdh * 86400000);
              n++;
            }
            closeModal(); toast(`Aufgaben-Serie angelegt: ${n} Termine`, "good"); reload();
            return;
          }
          Store.add("tasks", d); closeModal(); toast("Aufgabe angelegt", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     MATERIAL / INVENTAR
     ====================================================================== */
  function inventory(el) {
    const s = S();
    el.innerHTML = `
      ${head("Materialverwaltung", "Bestand an Bällen, Netzen und Ausrüstung im Blick behalten", `<button class="btn" data-add>＋ Position</button>`)}
      <div class="grid grid-auto">
        ${s.inventory.map((it) => {
          const pct = it.target ? Math.min(100, Math.round(it.count / it.target * 100)) : 100;
          const low = it.count < it.target;
          return `<div class="card">
            <div class="flex mb"><strong>${esc(it.name)}</strong><span class="spacer"></span>
              ${low ? '<span class="badge warn">nachbestellen</span>' : '<span class="badge good">ok</span>'}</div>
            <div class="flex" style="align-items:flex-end"><span class="value" style="font-size:1.6rem;font-weight:800">${it.count}</span><span class="soft">/ ${it.target} Soll</span></div>
            <div class="progress mt" style="margin-top:8px"><span style="width:${pct}%;background:${low ? "var(--warn)" : "var(--good)"}"></span></div>
            <div class="sub soft mt" style="margin-top:8px">📍 ${esc(it.location)}</div>
            <div class="flex mt">
              <button class="btn sm outline" data-minus="${it.id}">−</button>
              <button class="btn sm outline" data-plus="${it.id}">＋</button>
              <span class="spacer"></span>
              <button class="btn sm ghost" data-iedit="${it.id}">✏️</button>
              <button class="btn sm ghost" data-idel="${it.id}">🗑️</button>
            </div></div>`;
        }).join("")}
      </div>`;

    $("[data-add]", el).onclick = () => inventoryForm();
    $$("[data-plus]", el).forEach((b) => b.onclick = () => { const it = Store.byId("inventory", b.dataset.plus); Store.update("inventory", it.id, { count: it.count + 1 }); reload(); });
    $$("[data-minus]", el).forEach((b) => b.onclick = () => { const it = Store.byId("inventory", b.dataset.minus); Store.update("inventory", it.id, { count: Math.max(0, it.count - 1) }); reload(); });
    $$("[data-iedit]", el).forEach((b) => b.onclick = () => inventoryForm(Store.byId("inventory", b.dataset.iedit)));
    $$("[data-idel]", el).forEach((b) => b.onclick = () => confirmDialog("Position löschen?", () => { Store.remove("inventory", b.dataset.idel); toast("Gelöscht"); reload(); }));
  }
  function inventoryForm(it) {
    const isEdit = !!it;
    it = it || { name: "", count: 0, target: 1, location: "Materialraum" };
    modal({
      title: isEdit ? "Position bearbeiten" : "Neue Position",
      body: `<form id="if"><div class="form-grid">
        <div class="field full"><label>Bezeichnung</label><input name="name" value="${esc(it.name)}" required></div>
        <div class="field"><label>Bestand</label><input type="number" name="count" value="${esc(it.count)}"></div>
        <div class="field"><label>Soll</label><input type="number" name="target" value="${esc(it.target)}"></div>
        <div class="field full"><label>Lagerort</label><input name="location" value="${esc(it.location)}"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#if"); if (!f.reportValidity()) return;
          const d = formData(f); d.count = Number(d.count) || 0; d.target = Number(d.target) || 0;
          if (isEdit) Store.update("inventory", it.id, d); else Store.add("inventory", d);
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     ABTEILUNGEN / MANNSCHAFTEN
     ====================================================================== */
  const catBadge = { Aktive: "info", Jugend: "accent", Nachwuchs: "good", Breitensport: "warn" };
  function departments(el) {
    const s = S();
    const byCat = {};
    s.departments.forEach((d) => (byCat[d.category] = byCat[d.category] || []).push(d));
    el.innerHTML = `
      ${head("Mannschaften", `Alle Teams der Abteilung Volleyball des ${esc(s.club)}`, `<button class="btn" data-add>＋ Mannschaft</button>`)}
      <div class="grid grid-4 mb">
        ${stat("🏟️", "Abteilungen", s.departments.length)}
        ${stat("🧑‍🤝‍🧑", "Mitglieder gesamt", s.players.length)}
        ${stat("🏅", "Aktiven-Teams", s.departments.filter((d) => d.category === "Aktive").length)}
        ${stat("🧒", "Jugend & Nachwuchs", s.departments.filter((d) => d.category === "Jugend" || d.category === "Nachwuchs").length)}
      </div>
      ${Object.keys(byCat).map((cat) => `
        <h3 style="margin:18px 0 10px">${esc(cat)}</h3>
        <div class="grid grid-3 mb">
          ${byCat[cat].map((d) => {
            const members = s.players.filter((p) => inDept(p, d.id)).length;
            return `<div class="card">
              <div class="flex mb"><strong style="font-size:1.05rem">${esc(d.name)}</strong><span class="spacer"></span>
                <span class="badge ${catBadge[d.category] || ""}">${esc(d.category)}</span></div>
              <dl class="kv">
                <dt>Liga/Spielklasse</dt><dd>${esc(d.league)}</dd>
                <dt>Altersklasse</dt><dd>${esc(d.ageGroup)} · ${genderLabel[d.gender] || d.gender}</dd>
                <dt>Training</dt><dd>${esc(d.times)}</dd>
                <dt>Halle</dt><dd>${esc(d.venue)}</dd>
                <dt>Ansprechpartner</dt><dd>${esc(d.trainer)}${d.email ? `<br><a href="mailto:${esc(d.email)}" class="soft">${esc(d.email)}</a>` : ""}</dd>
                <dt>Mitglieder</dt><dd><strong>${members}</strong></dd>
              </dl>
              <div class="flex mt">
                <a class="btn sm outline" href="#/verbandsmeldung" data-meld="${d.id}">📋 Verbandsmeldung</a>
                <span class="spacer"></span>
                <button class="btn sm ghost" data-dedit="${d.id}">✏️</button>
                <button class="btn sm ghost" data-ddel="${d.id}">🗑️</button>
              </div></div>`;
          }).join("")}
        </div>`).join("")}`;

    $("[data-add]", el).onclick = () => departmentForm();
    $$("[data-dedit]", el).forEach((b) => b.onclick = () => departmentForm(Store.byId("departments", b.dataset.dedit)));
    $$("[data-ddel]", el).forEach((b) => b.onclick = () => {
      const d = Store.byId("departments", b.dataset.ddel);
      const members = S().players.filter((p) => inDept(p, d.id)).length;
      confirmDialog(`Abteilung „${d.name}" löschen?${members ? ` ${members} Spieler(nen) verlieren die Zuordnung.` : ""}`, () => {
        S().players.forEach((p) => { if (inDept(p, d.id)) { const ids = playerDeptIds(p).filter((x) => x !== d.id); Store.update("players", p.id, { departmentIds: ids, departmentId: ids[0] || null }); } });
        Store.remove("departments", d.id); toast("Abteilung gelöscht"); reload();
      });
    });
    $$("[data-meld]", el).forEach((a) => a.onclick = () => { verbandsmeldung._preselect = a.dataset.meld; });
  }

  function departmentForm(d) {
    const isEdit = !!d;
    d = d || { code: "", name: "", category: "Jugend", gender: "m", league: "", ageGroup: "", trainer: "", email: "", times: "", venue: "Sporthalle SKV, Halle 1", active: true };
    modal({
      title: isEdit ? "Abteilung bearbeiten" : "Neue Abteilung",
      body: `<form id="def"><div class="form-grid">
        <div class="field"><label>Name</label><input name="name" value="${esc(d.name)}" required></div>
        <div class="field"><label>Kurzcode</label><input name="code" value="${esc(d.code)}" placeholder="z. B. WU18"></div>
        <div class="field"><label>Kategorie</label><select name="category">
          ${["Aktive", "Jugend", "Nachwuchs", "Breitensport"].map((x) => `<option ${x === d.category ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>Geschlecht</label><select name="gender">
          ${Object.entries(genderLabel).map(([k, v]) => `<option value="${k}" ${k === d.gender ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>Liga / Spielklasse</label><input name="league" value="${esc(d.league)}"></div>
        <div class="field"><label>Altersklasse</label><input name="ageGroup" value="${esc(d.ageGroup)}" placeholder="U18, Damen …"></div>
        <div class="field"><label>Ansprechpartner:in</label><input name="trainer" value="${esc(d.trainer)}"></div>
        <div class="field"><label>E-Mail</label><input name="email" value="${esc(d.email)}"></div>
        <div class="field"><label>Trainingszeiten</label><input name="times" value="${esc(d.times)}"></div>
        <div class="field"><label>Halle</label><input name="venue" value="${esc(d.venue)}"></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#def"); if (!f.reportValidity()) return;
          const data = formData(f); data.active = true;
          if (isEdit) Store.update("departments", d.id, data); else Store.add("departments", data);
          closeModal(); toast("Gespeichert", "good"); reload();
        };
      },
    });
  }

  /* ======================================================================
     VERBANDSMELDUNG (Mannschaftsmeldung an den Verband)
     ====================================================================== */
  const meldStatus = { Entwurf: "warn", gemeldet: "good", eingereicht: "info" };
  const meldRoles = ["Spieler", "Kapitän", "Libero", "Ersatz", "Betreuer", "Trainer"];

  function verbandsmeldung(el) {
    const s = S();
    if (verbandsmeldung._open && Store.byId("meldungen", verbandsmeldung._open)) {
      return renderMeldungDetail(el, Store.byId("meldungen", verbandsmeldung._open));
    }
    el.innerHTML = `
      ${head("Verbandsmeldung", "Mannschaftsmeldungen mit Jahrgang und Passnummer für den VVMV erstellen",
        `<button class="btn" data-add>＋ Neue Meldung</button>`)}
      <div class="grid grid-3 mb">
        ${stat("📋", "Meldungen", s.meldungen.length)}
        ${stat("✅", "Gemeldet", s.meldungen.filter((m) => m.status !== "Entwurf").length)}
        ${stat("👥", "Gemeldete Spieler", s.meldungen.reduce((a, m) => a + m.entries.length, 0))}
      </div>
      <a class="link-card mb" href="https://vmv.sams-server.de/ma/" target="_blank" rel="noopener">
        <span class="ic">🌐</span><div class="grow"><div class="title">VMV Meldeportal (SAMS)</div>
        <div class="sub">Offizielle Online-Meldung des Volleyball-Verbands MV</div></div><span class="arr">↗</span></a>
      <div class="grid grid-2">
        ${s.meldungen.length ? s.meldungen.map((m) => `
          <div class="card">
            <div class="flex mb"><strong style="font-size:1.05rem">${esc(m.teamName)}</strong><span class="spacer"></span>
              <span class="badge ${meldStatus[m.status] || ""}">${esc(m.status)}</span></div>
            <dl class="kv mb">
              <dt>Saison</dt><dd>${esc(m.season)}</dd>
              <dt>Spielklasse</dt><dd>${esc(m.league)}</dd>
              <dt>Staffel</dt><dd>${esc(m.staffel || "—")}</dd>
              <dt>Verantwortlich</dt><dd>${esc(m.responsible || "—")}</dd>
              <dt>Spieler</dt><dd><strong>${m.entries.length}</strong></dd>
            </dl>
            <div class="flex"><button class="btn sm" data-open="${m.id}">Öffnen & bearbeiten</button>
              <span class="spacer"></span>
              <button class="btn sm ghost" data-mdel="${m.id}">🗑️</button></div>
          </div>`).join("") : empty("📋", "Noch keine Meldungen – jetzt erstellen")}
      </div>`;

    $("[data-add]", el).onclick = () => meldungForm();
    $$("[data-open]", el).forEach((b) => b.onclick = () => { verbandsmeldung._open = b.dataset.open; reload(); });
    $$("[data-mdel]", el).forEach((b) => b.onclick = () => confirmDialog("Meldung löschen?", () => { Store.remove("meldungen", b.dataset.mdel); toast("Gelöscht"); reload(); }));
  }

  function meldungForm() {
    const s = S();
    const preset = verbandsmeldung._preselect;
    verbandsmeldung._preselect = null;
    const seasonLabel = `${s.season.year}/${String(s.season.year + 1).slice(2)}`;
    modal({
      title: "Neue Verbandsmeldung",
      body: `<form id="mf"><div class="form-grid">
        <div class="field"><label>Abteilung / Mannschaft</label><select name="departmentId" id="mdept">
          ${s.departments.map((d) => `<option value="${d.id}" ${d.id === preset ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Saison</label><input name="season" value="${esc(seasonLabel)}"></div>
        <div class="field"><label>Spielklasse / Liga</label><input name="league" id="mleague"></div>
        <div class="field"><label>Staffel</label><input name="staffel" placeholder="z. B. Staffel Nord"></div>
        <div class="field"><label>Mannschaftsname (Meldung)</label><input name="teamName" id="mteam"></div>
        <div class="field"><label>Verantwortlich</label><input name="responsible" id="mresp"></div>
      </div>
      <p class="muted" style="font-size:.82rem">Alle aktiven Spieler der gewählten Abteilung werden automatisch mit Jahrgang und Passnummer übernommen. Danach kannst du die Liste anpassen.</p></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Meldung anlegen</button>`,
      onOpen(m) {
        const sync = () => {
          const d = Store.byId("departments", m.querySelector("#mdept").value);
          if (!d) return;
          m.querySelector("#mleague").value = d.league || "";
          m.querySelector("#mteam").value = `${Store.CLUB} ${d.name}`;
          m.querySelector("#mresp").value = d.trainer || "";
        };
        sync();
        m.querySelector("#mdept").onchange = sync;
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const data = formData(m.querySelector("#mf"));
          const roster = S().players.filter((p) => inDept(p, data.departmentId) && p.membershipStatus !== "inaktiv");
          const entries = roster.map((p) => ({
            playerId: p.id, passNumber: p.passNumber || "",
            jahrgang: jahrgang(p.birthDate), role: p.position === "Libero" ? "Libero" : "Spieler",
          }));
          const created = Store.add("meldungen", Object.assign({ entries, status: "Entwurf", createdAt: new Date().toISOString() }, data));
          closeModal(); verbandsmeldung._open = created.id; toast("Meldung angelegt", "good"); reload();
        };
      },
    });
  }

  function renderMeldungDetail(el, m) {
    const dep = Store.byId("departments", m.departmentId);
    el.innerHTML = `
      <div class="section-head">
        <div><h2>${esc(m.teamName)}</h2><p>Verbandsmeldung · Saison ${esc(m.season)}</p></div>
        <div class="spacer"></div>
        <button class="btn outline" data-back>‹ Zurück</button>
        <button class="btn secondary" data-print>🖨️ Drucken / PDF</button>
      </div>
      <div class="card mb"><div class="form-grid">
        <div class="field"><label>Spielklasse / Liga</label><input id="f-league" value="${esc(m.league)}"></div>
        <div class="field"><label>Staffel</label><input id="f-staffel" value="${esc(m.staffel || "")}"></div>
        <div class="field"><label>Verantwortlich</label><input id="f-resp" value="${esc(m.responsible || "")}"></div>
        <div class="field"><label>Status</label><select id="f-status">
          ${Object.keys(meldStatus).map((k) => `<option ${k === m.status ? "selected" : ""}>${k}</option>`).join("")}</select></div>
      </div></div>

      <div class="card" style="padding:0">
        <div class="card-head" style="padding:16px 16px 0"><h3>Gemeldete Spieler (${m.entries.length})</h3>
          <span class="spacer"></span><button class="btn sm" data-addpl>＋ Spieler</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Name</th><th>Jahrgang</th><th>Passnummer</th><th>Position</th><th>Rolle</th><th></th></tr></thead>
          <tbody>${m.entries.map((e, i) => {
            const p = Store.byId("players", e.playerId);
            return `<tr>
              <td>${i + 1}</td>
              <td><strong>${esc(p ? p.firstName + " " + p.lastName : "unbekannt")}</strong></td>
              <td>${esc(e.jahrgang || (p ? jahrgang(p.birthDate) : "—"))}</td>
              <td><input class="e-pass" data-i="${i}" value="${esc(e.passNumber || "")}" style="min-width:150px"></td>
              <td class="soft">${esc(p ? p.position : "—")}</td>
              <td><select class="e-role" data-i="${i}">${meldRoles.map((r) => `<option ${r === e.role ? "selected" : ""}>${r}</option>`).join("")}</select></td>
              <td class="right"><button class="btn sm ghost" data-rm="${i}">🗑️</button></td></tr>`;
          }).join("") || `<tr><td colspan="7">${empty("👥", "Noch keine Spieler in der Meldung")}</td></tr>`}</tbody>
        </table></div>
      </div>
      <p class="muted mt" style="font-size:.82rem">Änderungen an Passnummer und Rolle werden sofort gespeichert. Für die offizielle Einreichung nutze das VVMV-Meldeportal (SAMS).</p>`;

    const saveField = (k, v) => { Store.update("meldungen", m.id, { [k]: v }); };
    $("#f-league", el).onchange = (e) => saveField("league", e.target.value);
    $("#f-staffel", el).onchange = (e) => saveField("staffel", e.target.value);
    $("#f-resp", el).onchange = (e) => saveField("responsible", e.target.value);
    $("#f-status", el).onchange = (e) => { saveField("status", e.target.value); toast("Status gespeichert", "good"); };

    $$(".e-pass", el).forEach((inp) => inp.onchange = () => {
      const entries = m.entries.slice(); entries[+inp.dataset.i].passNumber = inp.value;
      Store.update("meldungen", m.id, { entries });
      const pl = Store.byId("players", entries[+inp.dataset.i].playerId);
      if (pl) Store.update("players", pl.id, { passNumber: inp.value });
    });
    $$(".e-role", el).forEach((sel) => sel.onchange = () => {
      const entries = m.entries.slice(); entries[+sel.dataset.i].role = sel.value;
      Store.update("meldungen", m.id, { entries });
    });
    $$("[data-rm]", el).forEach((b) => b.onclick = () => {
      const entries = m.entries.filter((_, i) => i !== +b.dataset.rm);
      Store.update("meldungen", m.id, { entries }); reload();
    });
    $("[data-addpl]", el).onclick = () => addMeldungPlayer(m);
    $("[data-back]", el).onclick = () => { verbandsmeldung._open = null; reload(); };
    $("[data-print]", el).onclick = () => printMeldung(Store.byId("meldungen", m.id), dep);
  }

  function addMeldungPlayer(m) {
    const inList = new Set(m.entries.map((e) => e.playerId));
    const avail = S().players.filter((p) => !inList.has(p.id))
      .sort((a, b) => (inDept(a, m.departmentId) ? -1 : 1) - (inDept(b, m.departmentId) ? -1 : 1) || a.lastName.localeCompare(b.lastName));
    if (!avail.length) { toast("Alle Spieler sind bereits gemeldet"); return; }
    modal({
      title: "Spieler zur Meldung hinzufügen",
      body: `<div class="list">${avail.map((p) => `
        <label class="list-item" style="cursor:pointer">${avatar(p.firstName, p.lastName, p)}
          <div class="grow"><div class="title">${esc(p.firstName)} ${esc(p.lastName)}</div>
          <div class="sub">Jg. ${jahrgang(p.birthDate)} · ${esc(playerDeptNames(p))} · ${esc(p.passNumber || "ohne Pass-Nr.")}</div></div>
          <input type="checkbox" data-pl="${p.id}" style="width:auto"></label>`).join("")}</div>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Hinzufügen</button>`,
      onOpen(mm) {
        mm.querySelector("[data-x]").onclick = closeModal;
        mm.querySelector("[data-s]").onclick = () => {
          const picks = $$("[data-pl]:checked", mm).map((c) => c.dataset.pl);
          const entries = m.entries.slice();
          picks.forEach((pid) => {
            const p = Store.byId("players", pid);
            entries.push({ playerId: pid, passNumber: p.passNumber || "", jahrgang: jahrgang(p.birthDate), role: p.position === "Libero" ? "Libero" : "Spieler" });
          });
          Store.update("meldungen", m.id, { entries });
          closeModal(); toast(`${picks.length} hinzugefügt`, "good"); reload();
        };
      },
    });
  }

  function printMeldung(m, dep) {
    const rows = m.entries.map((e, i) => {
      const p = Store.byId("players", e.playerId);
      return `<tr><td>${i + 1}</td><td>${esc(p ? p.lastName + ", " + p.firstName : "—")}</td>
        <td>${esc(e.jahrgang || "")}</td><td>${esc(e.passNumber || "")}</td>
        <td>${esc(p ? p.position : "")}</td><td>${esc(e.role || "")}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Verbandsmeldung ${esc(m.teamName)}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 2px}
      .sub{color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}
      .kv{font-size:13px;margin-bottom:14px}.kv b{display:inline-block;width:150px}
      .sign{margin-top:40px;display:flex;gap:60px}.sign div{border-top:1px solid #333;padding-top:4px;font-size:12px;flex:1}
      </style></head><body>
      <h1>Mannschaftsmeldung – ${esc(Store.CLUB)}</h1>
      <p class="sub">${esc(Store.WEBSITE)} · Volleyball-Verband Mecklenburg-Vorpommern (VVMV)</p>
      <div class="kv">
        <div><b>Mannschaft:</b> ${esc(m.teamName)}</div>
        <div><b>Saison:</b> ${esc(m.season)}</div>
        <div><b>Spielklasse:</b> ${esc(m.league)}${m.staffel ? " · " + esc(m.staffel) : ""}</div>
        <div><b>Altersklasse:</b> ${esc(dep ? dep.ageGroup + " (" + (genderLabel[dep.gender] || dep.gender) + ")" : "—")}</div>
        <div><b>Verantwortlich:</b> ${esc(m.responsible || "")}</div>
        <div><b>Status:</b> ${esc(m.status)}</div>
      </div>
      <table><thead><tr><th>Nr.</th><th>Name, Vorname</th><th>Jahrgang</th><th>Passnummer</th><th>Position</th><th>Rolle</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">keine Spieler</td></tr>'}</tbody></table>
      <div class="sign"><div>Ort, Datum</div><div>Unterschrift Abteilungsleitung</div></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken", "bad"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }

  /* ======================================================================
     DATENSICHERUNG (Komplett-Export/-Import als CSV)
     ====================================================================== */
  function backup(el) {
    const s = S();
    const counts = IO.BACKUP_COLLECTIONS.map((c) => ({ name: c, n: (s[c] || []).length }));
    const total = counts.reduce((a, x) => a + x.n, 0);
    el.innerHTML = `
      ${head("Datensicherung", "Alle Vereinsdaten als eine CSV-Datei exportieren und wieder importieren")}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3>⬇️ Alles exportieren</h3></div>
          <p class="soft" style="font-size:.88rem;margin-top:0">Erstellt <strong>eine CSV-Datei</strong> mit allen
          Daten (${total} Einträge in ${counts.filter((c) => c.n).length} Tabellen) – als Sicherung, zum Umzug auf ein
          anderes Gerät oder zur Bearbeitung in Excel. Die Datei enthält Abschnitte je Tabelle
          (<code>#TABELLE;…</code>).</p>
          <button class="btn" data-exall>💾 Komplett-Export (CSV)</button>
          <div class="mt">
            <div class="chip-row">${counts.filter((c) => c.n).map((c) => `<span class="badge">${esc(c.name)}: ${c.n}</span>`).join("") || '<span class="muted">Noch keine Daten vorhanden</span>'}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>⬆️ Aus Datei wiederherstellen</h3></div>
          <p class="soft" style="font-size:.88rem;margin-top:0">Liest eine zuvor exportierte CSV-Datei ein.
          <strong>Achtung:</strong> Die enthaltenen Tabellen ersetzen den aktuellen Datenbestand vollständig.</p>
          <button class="btn secondary" data-imall>📂 CSV-Datei wählen & importieren</button>
          <div id="backupResult" class="mt"></div>
        </div>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>🔐 Verschlüsselte Sicherung – für die Cloud & Gerätewechsel</h3></div>
        <p class="soft" style="font-size:.88rem;margin-top:0">Erstellt eine <strong>passwortgeschützte Datei</strong>
        (<code>.skv</code>, AES-256-verschlüsselt). Nur damit gehören persönliche Daten in eine Cloud!
        <strong>So nutzt du die Plattform geräteübergreifend:</strong> ① Hier verschlüsselt exportieren →
        ② Datei in deine Cloud legen (iCloud/Dropbox/OneDrive…) → ③ auf dem anderen Gerät die App öffnen und
        die .skv-Datei mit dem Passwort importieren. Die App-Datei selbst enthält keine persönlichen Daten –
        die liegen nur im Browser des jeweiligen Geräts und in deinen Sicherungen.</p>
        <div class="flex flex-wrap">
          <button class="btn" data-encex>🔐 Verschlüsselt exportieren</button>
          <button class="btn secondary" data-encim>🔓 Verschlüsselt importieren</button>
        </div>
        <div id="encResult" class="mt"></div>
      </div>

      <div class="card mt">
        <div class="card-head"><h3>🧹 Zurücksetzen</h3></div>
        <div class="flex flex-wrap">
          <button class="btn outline" data-empty>Leerer Verein (ohne Demodaten)</button>
          <button class="btn outline" data-demo>Mit Demo-Beispieldaten</button>
        </div>
        <p class="muted" style="font-size:.8rem;margin-bottom:0">Struktur (Abteilungen, Formular-Vorlagen, Kleiderkatalog, Ferien MV) bleibt in beiden Fällen erhalten.</p>
      </div>`;

    $("[data-exall]", el).onclick = () => {
      IO.download(`skv-mueritz-datensicherung-${new Date().toISOString().slice(0, 10)}.csv`, IO.exportAllCSV(), "text/csv");
      toast("Datensicherung erstellt", "good");
    };
    $("[data-imall]", el).onclick = async () => {
      const f = await IO.pickFile(".csv,text/csv");
      if (!f) return;
      let parsed;
      try { parsed = IO.importAllCSV(f.text); }
      catch (err) { $("#backupResult", el).innerHTML = `<span class="badge bad">Fehler: ${esc(err.message)}</span>`; return; }
      confirmDialog(`Import aus „${f.name}": ${parsed.tables.length} Tabellen (${parsed.counts.join(", ")}). Aktuelle Daten dieser Tabellen werden ERSETZT. Fortfahren?`, () => {
        Store.replaceAll(parsed.data);
        toast("Datensicherung wiederhergestellt", "good"); reload();
      }, "Importieren");
    };
    $("[data-encex]", el).onclick = () => {
      modal({
        title: "Verschlüsselt exportieren",
        body: `<form id="exf"><div class="form-grid">
          <div class="field full"><label>Passwort (mind. 8 Zeichen)</label><input type="password" name="pw1" minlength="8" required autocomplete="new-password"></div>
          <div class="field full"><label>Passwort wiederholen</label><input type="password" name="pw2" minlength="8" required autocomplete="new-password"></div>
        </div><p class="muted" style="font-size:.8rem">Wichtig: Ohne dieses Passwort lässt sich die Sicherung
        <strong>nicht wiederherstellen</strong> – es gibt keine Zurücksetzen-Funktion.</p></form>`,
        footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>🔐 Exportieren</button>`,
        onOpen(m) {
          m.querySelector("[data-x]").onclick = closeModal;
          m.querySelector("[data-s]").onclick = async () => {
            const f = m.querySelector("#exf"); if (!f.reportValidity()) return;
            const d = formData(f);
            if (d.pw1 !== d.pw2) { toast("Passwörter stimmen nicht überein", "bad"); return; }
            try {
              const payload = { exportedAt: new Date().toISOString(), club: Store.CLUB, state: S() };
              const enc = await IO.encryptData(d.pw1, payload);
              IO.download(`skv-mueritz-daten-${new Date().toISOString().slice(0, 10)}.skv`, enc, "application/json");
              closeModal(); toast("Verschlüsselte Sicherung erstellt", "good");
            } catch (err) { toast(err.message || "Verschlüsselung fehlgeschlagen", "bad"); }
          };
        },
      });
    };
    $("[data-encim]", el).onclick = async () => {
      const f = await IO.pickFile(".skv,application/json");
      if (!f) return;
      modal({
        title: `Verschlüsselte Sicherung importieren`,
        body: `<p class="soft" style="font-size:.88rem;margin-top:0">Datei: <strong>${esc(f.name)}</strong></p>
          <form id="imf"><div class="field"><label>Passwort</label>
          <input type="password" name="pw" required autocomplete="current-password"></div></form>
          <p class="muted" style="font-size:.8rem">Der Import ersetzt den aktuellen Datenbestand vollständig.</p>`,
        footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>🔓 Entschlüsseln & importieren</button>`,
        onOpen(m) {
          m.querySelector("[data-x]").onclick = closeModal;
          m.querySelector("[data-s]").onclick = async () => {
            const fo = m.querySelector("#imf"); if (!fo.reportValidity()) return;
            const d = formData(fo);
            try {
              const payload = await IO.decryptData(d.pw, f.text);
              const state = payload && payload.state ? payload.state : payload;
              if (!state || !Array.isArray(state.players)) throw new Error("Datei enthält keinen gültigen Datenbestand");
              Store.replaceAll(state);
              closeModal(); toast("Sicherung wiederhergestellt", "good"); reload();
            } catch (err) { toast(err.message || "Import fehlgeschlagen", "bad"); }
          };
        },
      });
    };
    $("[data-empty]", el).onclick = () => confirmDialog("Alle Daten löschen und leer starten (Struktur bleibt)?", () => {
      Store.resetEmpty(); toast("Leer zurückgesetzt", "good"); reload();
    }, "Zurücksetzen");
    $("[data-demo]", el).onclick = () => confirmDialog("Alle Daten durch Demo-Beispieldaten ersetzen?", () => {
      Store.resetDemo(); toast("Demo-Daten geladen", "good"); reload();
    }, "Laden");
  }

  // ---- Portal-Zugänge (Phase 3): Einladungscodes je Spieler:in + Kontenliste ----
  async function apiZugang(pfad, body, methode) {
    const opts = { credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (window.Sync && Sync.csrf) opts.headers["X-CSRF-Token"] = Sync.csrf;
    if (body || methode) { opts.method = methode || "POST"; if (body) opts.body = JSON.stringify(body); }
    const res = await fetch(pfad, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* leer */ }
    return { ok: res.ok, data };
  }

  // Einladungs-Vorlage: eine PDF-Seite je Code mit QR, Link, Code und
  // Kurzanleitung – zum Ausdrucken (Trainingsbeutel) oder Teilen (WhatsApp).
  function einladungsBlocks(rolle, zielName, code, url) {
    const eltern = rolle === "eltern";
    const spieler = rolle === "spieler";
    const B = [];
    const p = (runs) => B.push({ art: "p", runs: Array.isArray(runs) ? runs : [{ t: runs }] });
    const li = (runs) => B.push({ art: "li", runs: Array.isArray(runs) ? runs : [{ t: runs }] });
    const h2 = (t) => B.push({ art: "h2", runs: [{ t }] });

    B.push({ art: "h1", runs: [{ t: "Einladung ins SKV-Müritz-Portal" }] });
    B.push({ art: "sub", runs: [{ t: `SKV Müritz · Abteilung Volleyball · ${eltern ? "Eltern-Zugang" : spieler ? "Zugang für Spieler:innen" : "Trainer:innen-Zugang"}${zielName ? ` · für ${zielName}` : ""}` }] });
    p(eltern
      ? "Liebe Eltern, unsere Volleyball-Abteilung hat ein eigenes Online-Portal: alle Termine und Spiele auf einen Blick, Trainingsrückmeldung für euer Kind mit einem Tipp, Fahrplätze für Auswärtsspiele anbieten, Heimspiel-Jobs übernehmen und Vereinskleidung anfordern – alles an einem Ort, auch als App auf dem Handy."
      : spieler
      ? "Hallo! Unsere Volleyball-Abteilung hat ein eigenes Online-Portal: alle Trainings und Spiele auf einen Blick, deine Trainingsrückmeldung mit einem Tipp, Vereinskleidung anfordern und deine Kontaktdaten immer aktuell – auch als App auf dem Handy."
      : "Willkommen im Trainerteam! Über diesen Zugang kommst du in die komplette Online-Verwaltung (mit Pflicht-2FA beim ersten Login).");
    h2("So richtest du deinen Zugang ein – 3 Schritte");
    li([{ t: "1. ", b: true }, { t: "QR-Code mit der Handy-Kamera scannen oder den Link öffnen." }]);
    li([{ t: "2. ", b: true }, { t: "Benutzernamen und Passwort selbst wählen – der Einladungscode ist im Link schon eingetragen." }]);
    li([{ t: "3. ", b: true }, { t: "„Registrieren“ antippen und anmelden – fertig!" }]);
    B.push({ art: "qr", runs: [{ t: url }] });
    p([{ t: url, b: true }]);
    B.push({ art: "sub", runs: [{ t: "Falls nach dem Code gefragt wird – einfach diesen eingeben:" }] });
    B.push({ art: "code", runs: [{ t: code }] });
    B.push({ art: "sub", runs: [{ t: "Der Code ist persönlich, nur einmal verwendbar und 14 Tage gültig." }] });
    h2("Das kannst du im Portal");
    if (eltern) {
      li("Termine, Spiele und Ferien ansehen");
      li("Trainingsrückmeldung für euer Kind abgeben (Zusagen/Absagen)");
      li("Fahrplätze für Auswärtsspiele anbieten und Heimspiel-Jobs übernehmen");
      li("Vereinskleidung anfordern und eure Kontaktdaten aktuell halten");
      p([{ t: "Datenschutz: Ihr seht ausschließlich die Daten eures eigenen Kindes – niemals Namen oder Angaben anderer Kinder.", b: true }]);
    } else if (spieler) {
      li("Trainings und Spiele ansehen, mit einem Tipp zu- oder absagen");
      li("Vereinskleidung anfordern");
      li("Deine Kontaktdaten selbst aktuell halten");
    } else {
      li("Komplette Vereinsverwaltung: Kader, Termine, Rückmeldungen, Briefe, Finanzen");
      li("Beim ersten Login wird die Zwei-Faktor-Anmeldung eingerichtet (Authenticator-App)");
    }
    h2("Als App aufs Handy (empfohlen)");
    p("iPhone: Link in Safari öffnen → Teilen-Knopf → „Zum Home-Bildschirm“. Android: In Chrome öffnen → Menü → „App installieren“. Danach startet das Portal wie eine normale App.");
    B.push({ art: "leer" });
    p("Fragen? Das Trainerteam hilft jederzeit gern. Viele Grüße – das Trainerteam des SKV Müritz Volleyball");
    return B;
  }

  function codeModal(rolle, zielName, code, url) {
    const nachricht = `Hallo${zielName ? " " + zielName : ""}! 🏐 Für das Online-Portal des SKV Müritz Volleyball bekommst du hier deinen persönlichen Zugang (Rolle: ${rolle === "eltern" ? "Eltern" : rolle === "spieler" ? "Spieler:in" : "Trainer:in"}):\n\n${url}\n\nEinfach den Link öffnen und mit dem Code ${code} registrieren – er ist 14 Tage gültig.\n\nKurzanleitung: Link öffnen → Benutzername + Passwort wählen → Registrieren → Anmelden. Tipp fürs Handy: In Safari/Chrome öffnen und „Zum Home-Bildschirm“ hinzufügen – dann ist das Portal eine App.\n\nViele Grüße, das Trainerteam`;
    const dateiname = `Einladung Portal – ${zielName || rolle}`;
    modal({
      title: "Einladungscode erstellt",
      body: `
        <p class="soft" style="margin-top:0">Für <strong>${esc(zielName || "neues Konto")}</strong> · Rolle
        <strong>${esc(rolle)}</strong> · 14 Tage gültig. Der Code wird aus Sicherheitsgründen nur EINMAL angezeigt.</p>
        <div class="field"><label>Code</label><input readonly value="${esc(code)}" onclick="this.select()"></div>
        <div class="field"><label>Registrierungslink</label><input readonly value="${esc(url)}" onclick="this.select()"></div>
        <p class="soft" style="font-size:.82rem">📄 Die <strong>Einladungs-Vorlage</strong> ist eine fertige PDF-Seite mit
        QR-Code, Link, Code und Kurzanleitung – zum Ausdrucken oder direkt per WhatsApp verschicken.</p>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>
        <button class="btn outline" data-copy title="Einladungstext in die Zwischenablage">📋 Text kopieren</button>
        <button class="btn outline" data-pdf title="Einladungs-Vorlage als PDF herunterladen">📄 Vorlage (PDF)</button>
        <button class="btn outline" data-pdfshare title="Einladungs-PDF teilen, z. B. per WhatsApp">📤 Vorlage teilen</button>
        <a class="btn" style="text-decoration:none" target="_blank" rel="noopener"
           href="https://wa.me/?text=${encodeURIComponent(nachricht)}">💬 WhatsApp</a>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-copy]").onclick = async () => {
          try { await navigator.clipboard.writeText(nachricht); toast("Nachricht kopiert", "good"); }
          catch (e) { toast("Kopieren nicht möglich – bitte Felder markieren", "bad"); }
        };
        m.querySelector("[data-pdf]").onclick = () => pdfVomServer(dateiname, einladungsBlocks(rolle, zielName, code, url), false);
        m.querySelector("[data-pdfshare]").onclick = () => pdfVomServer(dateiname, einladungsBlocks(rolle, zielName, code, url), true);
      },
    });
  }

  // ---- Kurzanleitungen je Rolle (eine kompakte PDF-Seite je Rolle) ----
  // Bei Textänderungen bitte Version und Stand mit hochziehen!
  const ANLEITUNG_VERSION = "1.2";
  const ANLEITUNG_STAND = "20.08.2026";

  function kurzanleitungBlocks(rolle, codeInfo) {
    const B = [];
    const p = (runs) => B.push({ art: "p", runs: Array.isArray(runs) ? runs : [{ t: runs }] });
    const li = (t) => B.push({ art: "li2", runs: [{ t }] });
    const h2 = (t) => B.push({ art: "h2box", runs: [{ t }] });
    const titelJeRolle = { trainer: "Trainer:innen", spieler: "Spieler:innen", eltern: "Eltern" };

    B.push({ art: "h1c", runs: [{ t: `Kurzanleitung für ${titelJeRolle[rolle]}` }] });
    B.push({ art: "subc", runs: [{ t: `SKV Müritz Volleyball · volleyball.nettverwaltet.de · Version ${ANLEITUNG_VERSION} · Stand ${ANLEITUNG_STAND}` }] });

    if (rolle === "spieler") {
      B.push({ art: "kasten", runs: [
        { t: "So bist du in 3 Schritten dabei: ", b: true },
        { t: "① Einladungslink vom Trainerteam öffnen (oder Code eingeben) · ② Benutzernamen und Passwort wählen · ③ Als App installieren: im Browser Teilen-Menü → „Zum Home-Bildschirm“." },
      ] });
      h2("🏐 Rückmelden – deine wichtigste Aufgabe");
      li("Auf der Übersicht bei „Kommst du?“ einfach Daumen hoch (komme), Fragezeichen (unsicher) oder Daumen runter (kann nicht) antippen.");
      li("Bei Fragezeichen und Daumen runter bitte kurz den Grund dazuschreiben (z. B. krank, Klassenfahrt).");
      li("Bei Daumen hoch kannst du eine Bemerkung ergänzen, z. B. „+1“ oder „muss 10 Min eher los“.");
      li("Umentschieden? Einfach neu antippen – die Antwort lässt sich jederzeit ändern.");
      h2("📅 Termine");
      li("Im Termine-Tab stehen alle Trainings und Spiele – mit Wetter am Spielort und Kartenlink.");
      li("Heimspiel: Trag ein, was du fürs Buffet mitbringst. Auswärtsspiel: Sag Bescheid, wenn ihr Plätze im Auto frei habt.");
      li("Im Konto kannst du den Kalender abonnieren – dann stehen alle Termine automatisch in deinem Handy-Kalender.");
      h2("🧠 Quiz, Wiki & Abzeichen");
      li("Im Wiki-Tab wartet das Volleyball-Quiz: Jede Woche neuer Wettbewerb mit Bestenliste und Medaillen-Abzeichen für die Top 3.");
      li("Im Wiki lernst du alles über Volleyball – von den Regeln bis zu Profi-Tricks.");
      li("Abzeichen gibt es fürs zuverlässige Rückmelden und fürs Dabeisein – sie erscheinen auf deiner Startseite.");
      h2("⚙️ Konto");
      li("Profilbild hochladen oder Emoji-Avatar wählen.");
      li("Abwesenheit melden (krank, Klassenfahrt, Urlaub) – die Absagen für den Zeitraum laufen dann automatisch.");
      li("Unterschriebene Einverständniserklärung als PDF oder Foto hochladen.");
      li("Mitteilungen aktivieren, damit nichts an dir vorbeigeht (iPhone: zuerst als App installieren!).");
      li("Über die Übersicht der WhatsApp-Gruppe des Teams beitreten.");
      li("Passwort vergessen? Am Anmeldebildschirm auf „Passwort vergessen?“ tippen – das Trainerteam schickt dir einen Wiederherstellungscode.");
      B.push({ art: "leer" });
      p([{ t: "Fragen? Das Trainerteam hilft dir gern weiter. Viel Spaß! 🏐", b: true }]);
    }

    if (rolle === "eltern") {
      B.push({ art: "kasten", runs: [
        { t: "So seid ihr in 3 Schritten dabei: ", b: true },
        { t: "① Einladungslink vom Trainerteam öffnen (oder Code eingeben) · ② Benutzernamen und Passwort wählen · ③ Als App installieren: im Browser Teilen-Menü → „Zum Home-Bildschirm“. Mehrere Kinder im Verein? Im Konto einfach den weiteren Code einlösen – dann seht ihr alle Kinder in einem Zugang." },
      ] });
      h2("👍 Rückmelden für euer Kind");
      li("Auf der Übersicht je Termin Daumen hoch (kommt), Fragezeichen (unsicher) oder Daumen runter (kann nicht) antippen – bei Absagen bitte kurz den Grund angeben.");
      li("Längere Abwesenheit (Krankheit, Klassenfahrt, Urlaub) im Konto melden – die Absagen laufen dann automatisch.");
      h2("🚗 Mithelfen");
      li("Auswärtsspiele: freie Plätze im Auto anbieten – das Trainerteam plant damit die Fahrten.");
      li("Heimspiele: eintragen, was ihr zum Buffet beisteuert (Salat, Brötchen, Kuchen, Getränke).");
      li("Im Mithelfen-Tab offene Heimspiel-Aufgaben übernehmen (z. B. Aufbau, Standdienst).");
      h2("📅 Termine & Infos");
      li("Alle Trainings und Spiele mit Wetter und Kartenlink; die Ferien MV stehen gleich mit dabei.");
      li("Kalender-Abo im Konto: Alle Termine erscheinen automatisch im eigenen Handy-Kalender.");
      li("Mitteilungen aktivieren – Ankündigungen und Erinnerungen kommen direkt aufs Handy.");
      li("Der WhatsApp-Elterngruppe beitreten (Link auf der Übersicht) – unser wichtigster Infoweg.");
      h2("📝 Einverständnis & Datenschutz");
      li("Die unterschriebene Sammel-Einverständniserklärung im Konto hochladen – als PDF oder einfach als Foto.");
      li("Datenschutz: Ihr seht im Portal ausschließlich das eigene Kind – nie andere Kinder.");
      li("Passwort vergessen? Am Anmeldebildschirm auf „Passwort vergessen?“ tippen – das Trainerteam schickt einen Wiederherstellungscode.");
      B.push({ art: "leer" });
      p([{ t: "Fragen? Das Trainerteam hilft gern weiter. Danke für eure Unterstützung! 🏐", b: true }]);
    }

    if (rolle === "trainer") {
      B.push({ art: "kasten", runs: [
        { t: "Anmeldung: ", b: true },
        { t: "Mit Benutzername und Passwort anmelden; beim ersten Login wird die Zwei-Faktor-Anmeldung (Authenticator-App) eingerichtet. Danach am besten als App installieren: Teilen-Menü → „Zum Home-Bildschirm“." },
      ] });
      h2("📅 Kalender & Sportstätten");
      li("Termine einzeln oder als Serie anlegen (wöchentlich/14-tägig, Ferien MV werden automatisch ausgelassen).");
      li("Sporthallen über den Knopf „Sportstätten“ im Kalender verwalten (Adresse, Bild, Heimmannschaft) – beim Termin-Anlegen wird der Ort automatisch vervollständigt.");
      li("Je Termin eine Leitung zuordnen – vorbelegt ist immer die angemeldete Trainer:in.");
      h2("🏐 Trainingsrückmeldung und Planung");
      li("Rückmeldestand je Termin im Blick; Daumen für Spieler:innen direkt setzen – erneutes Antippen nimmt zurück.");
      li("Training absagen mit Notiz: Alle, die schon geantwortet haben, bekommen automatisch eine Push-Mitteilung.");
      li("Trainingsplan aus Bausteinen zusammenstellen (automatischer Vorschlag passend zur Zusagen-Zahl) – als PDF drucken oder als Spicker fürs Handy mitnehmen.");
      li("Automatische Warnung, wenn 24 Stunden vor einem Termin weniger als die Hälfte geantwortet hat.");
      h2("📈 Team-Analyse & Abzeichen");
      li("Quoten je Spieler:in (Rückmeldungen, Zusagen) nach Zeitraum und Termin-Art filtern – wer ist zuverlässig, wer braucht Ansprache?");
      li("Abzeichen frei definieren (z. B. Trainingsteilnahme 75–100 %) – die Spieler:innen sehen sie im Portal.");
      h2("💌 Elternbriefe & Einverständnis");
      li("Serienbrief: ein personalisierter Brief je Spieler:in mit Terminen, Rückmeldeabschnitt und vorausgefüllten Pflicht-Erklärungen.");
      li("Je Spieler:in als PDF herunterladen oder direkt per WhatsApp an die richtige Nummer schicken.");
      li("Hochgeladene Einverständniserklärungen der Familien landen automatisch im Bereich Einverständnis.");
      h2("🔑 Portal-Zugänge & Kommunikation");
      li("Einladungscodes je Spieler:in und Eltern erzeugen und mit fertiger Vorlage teilen; Konten und Nutzung im Blick.");
      li("Ankündigungen erreichen alle per Push; Aufgaben lassen sich zuweisen, duplizieren und als Serie wiederholen – erinnert wird automatisch.");
      li("WhatsApp-Gruppenlinks (Spieler:innen/Eltern) einmal hinterlegen – das Portal zeigt jeder Rolle den passenden Link.");
      li("Passwort vergessen? Anfragen erscheinen oben bei den Konten – per Klick Wiederherstellungscode erzeugen und weitergeben; Konten lassen sich dort auch bearbeiten.");
      h2("⚙️ Gut zu wissen");
      li("Die Verbandsliga-Tabelle wird täglich automatisch von vmv24.de übernommen.");
      li("Vereinskleidung mit Fotos pflegen; Fahrerplanung und Heimspiel-Jobs füllen sich aus den Portal-Angaben.");
      li("Quiz-Beteiligung einsehen und eigene Quizfragen ergänzen (Bereich Volleyball-Wiki).");
      li("Datensicherung: Der Server sichert täglich automatisch; zusätzlich gibt es den Export unter „Datensicherung“.");
    }

    // Optional: persönlicher Einladungscode samt QR am Ende der Anleitung
    if (codeInfo && codeInfo.code) {
      B.push({ art: "h2box", runs: [{ t: `Persönlicher Einladungscode${codeInfo.name ? ` für ${codeInfo.name}` : ""}` }] });
      B.push({ art: "code", runs: [{ t: codeInfo.code }] });
      if (codeInfo.url) B.push({ art: "qr", runs: [{ t: codeInfo.url }] });
      p([{ t: "QR-Code scannen oder den Code unter „Mit Einladungscode registrieren“ eingeben – gültig 14 Tage, nur einmal einlösbar." }]);
    }
    return B;
  }

  // Konto bearbeiten: Name, Benutzername, Rolle und verknüpfte Spieler:innen
  function kontoForm(k, fertig) {
    const aktive = S().players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    modal({
      title: `Konto bearbeiten – ${esc(k.name)}`,
      body: `<form id="kf"><div class="form-grid">
        <div class="field"><label>Anzeigename</label><input name="name" value="${esc(k.name)}" required></div>
        <div class="field"><label>Benutzername (für die Anmeldung)</label><input name="username" value="${esc(k.username)}" required></div>
        <div class="field"><label>Rolle</label><select name="role">
          ${["trainer", "spieler", "eltern"].map((r) => `<option value="${r}" ${k.role === r ? "selected" : ""}>${r === "trainer" ? "Trainer:in" : r === "spieler" ? "Spieler:in" : "Eltern"}</option>`).join("")}
        </select></div>
        <div class="field full"><label>Verknüpfte Spieler:innen</label>
          <div class="list" style="max-height:220px;overflow-y:auto">
            ${aktive.map((p) => `<label class="list-item" style="cursor:pointer;padding:6px 10px">
              <input type="checkbox" data-kfpid="${p.id}" ${k.player_ids.includes(p.id) ? "checked" : ""} style="width:auto">
              <div class="grow"><div class="title" style="font-size:.86rem">${esc(p.firstName)} ${esc(p.lastName)}</div></div>
            </label>`).join("")}
          </div></div>
      </div>
      <p class="soft" style="font-size:.8rem">Rollenwechsel zu Trainer:in verlangt beim nächsten Login die 2FA-Einrichtung.
      Passwort ändern geht über den 🔑-Wiederherstellungscode.</p></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = async () => {
          const f = m.querySelector("#kf"); if (!f.reportValidity()) return;
          const d = formData(f);
          const playerIds = Array.from(m.querySelectorAll("[data-kfpid]:checked")).map((c) => c.dataset.kfpid);
          const r = await apiZugang(`/api/accounts/${k.id}`, {
            name: d.name, username: d.username, role: d.role, playerIds });
          if (!r.ok) { toast(r.data.error || "Speichern fehlgeschlagen", "bad"); return; }
          closeModal(); toast("Konto gespeichert", "good");
          if (fertig) fertig();
        };
      },
    });
  }

  // Wiederherstellungscode anzeigen und teilen (24 h gültig, einmal einlösbar)
  function resetCodeModal(username, code) {
    const anleitung = `Hallo! Hier ist dein Wiederherstellungscode für die SKV-Volleyball-App:\n\n${code}\n\n` +
      `So geht's: volleyball.nettverwaltet.de öffnen → „Passwort vergessen?“ → Code eingeben und neues Passwort wählen. ` +
      `Der Code gilt 24 Stunden und funktioniert nur einmal.`;
    modal({
      title: `🔑 Wiederherstellungscode für ${esc(username)}`,
      body: `
        <p class="soft" style="margin-top:0;font-size:.88rem">Diesen Code an die Person weitergeben (z. B. per WhatsApp).
        Damit setzt sie unter „Passwort vergessen?“ am Anmeldebildschirm selbst ein neues Passwort –
        <strong>gültig 24 Stunden, einmal einlösbar</strong>.</p>
        <p style="text-align:center;font-size:1.6rem;font-weight:800;letter-spacing:.08em;border:2px solid var(--accent,#1e3a8a);border-radius:12px;padding:12px 8px">${esc(code)}</p>`,
      footer: `<button class="btn ghost" data-x>Schließen</button>
        <button class="btn outline" data-kopie>📋 Kopieren</button>
        <a class="btn" style="text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(anleitung)}" target="_blank" rel="noopener">💬 Per WhatsApp teilen</a>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-kopie]").onclick = () => {
          navigator.clipboard.writeText(anleitung).then(() => toast("Text mit Code kopiert", "good"),
            () => toast("Kopieren nicht möglich", "bad"));
        };
      },
    });
  }

  function zugaenge(el) {
    if (!window.Sync || !Sync.active) {
      el.innerHTML = `${head("Portal-Zugänge", "Einladungscodes und Konten für Spieler:innen und Eltern")}
        <div class="card"><p class="soft" style="margin:0">🔒 Die Zugangs-Verwaltung funktioniert nur in der
        <strong>Online-Version</strong> (mit Server-Anmeldung) – dort werden Codes erzeugt und Konten verwaltet.</p></div>`;
      return;
    }
    const s = S();
    const aktive = s.players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    el.innerHTML = `
      ${head("Portal-Zugänge", "Einladungscodes je Spieler:in erzeugen, per WhatsApp verschicken und Konten verwalten")}
      <div class="grid grid-4 mb" id="zgStat"></div>
      <div class="card">
        <div class="card-head"><h3>🔑 Zugangscodes je Spieler:in</h3><span class="spacer"></span>
          <button class="btn sm outline" data-tcode>🧑‍🏫 Trainer:in-Code</button></div>
        <p class="soft" style="font-size:.85rem;margin-top:0">Je Spieler:in gibt es zwei Codes: einen für das
        <strong>Spieler:innen-Konto</strong> und einen für das <strong>Eltern-Konto</strong>. Die Registrierung
        verknüpft das Konto automatisch mit der richtigen Person – Eltern sehen im Portal nur das eigene Kind.</p>
        <div class="list">
          ${aktive.map((p) => `<div class="list-item"><div class="grow">
              <div class="title" style="font-size:.9rem">${esc(p.firstName)} ${esc(p.lastName)}</div>
              <div class="sub">${esc(playerDeptNames(p))}</div>
              <div class="sub" data-online="${p.id}"></div></div>
            <button class="btn sm ghost" data-cs="${p.id}" title="Code für Spieler:innen-Konto">🏐 Spieler:in</button>
            <button class="btn sm ghost" data-ce="${p.id}" title="Code für Eltern-Konto">👪 Eltern</button>
          </div>`).join("") || empty("🧑‍🤝‍🧑", "Keine aktiven Spieler:innen")}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>💬 WhatsApp-Gruppen fürs Portal</h3></div>
        <p class="soft" style="font-size:.85rem;margin-top:0">Je Rolle der passende Einladungslink:
        Spieler:innen sehen im Portal nur die Spieler-Gruppe, Eltern nur die Eltern-Gruppe.</p>
        <div class="form-grid">
          <div class="field"><label>🏐 Gruppe für Spieler:innen</label>
            <input id="waSpieler" placeholder="https://chat.whatsapp.com/…" value="${esc((s.whatsapp || {}).spieler || "")}"></div>
          <div class="field"><label>👪 Gruppe für Eltern</label>
            <input id="waEltern" placeholder="https://chat.whatsapp.com/…" value="${esc((s.whatsapp || {}).eltern || "")}"></div>
        </div>
        <button class="btn sm mt" data-wasave>Speichern</button>
      </div>
      <div class="card">
        <div class="card-head"><h3>📚 Kurzanleitungen</h3></div>
        <p class="soft" style="font-size:.85rem;margin-top:0">Eine kompakte Anleitung je Rolle – zum Ausdrucken
        oder direkt per WhatsApp an neue Mitglieder schicken (z. B. zusammen mit dem Einladungscode).</p>
        <div class="list">
          ${[["trainer", "🧑‍🏫", "Für Trainer:innen", "Kalender, Rückmeldungen, Analyse, Briefe, Zugänge"],
             ["spieler", "🏐", "Für Spieler:innen", "Rückmelden, Termine, Quiz, Abzeichen, Konto"],
             ["eltern", "👪", "Für Eltern", "Rückmelden, Mithelfen, Termine, Einverständnis"]].map(([r, ic, titel, sub]) => `
          <div class="list-item">
            <div style="font-size:1.3rem">${ic}</div>
            <div class="grow"><div class="title" style="font-size:.9rem">${titel}</div>
              <div class="sub">${sub}</div></div>
            <button class="btn sm ghost" data-anlpdf="${r}" title="Kurzanleitung als PDF herunterladen">⬇️ PDF</button>
            <button class="btn sm ghost" data-anlshare="${r}" title="Kurzanleitung teilen (z. B. WhatsApp)">📤 Teilen</button>
          </div>`).join("")}
        </div>
      </div>
      <div class="card"><div class="card-head"><h3>👥 Konten</h3></div><div class="list" id="zgKonten">
        <p class="soft">Wird geladen …</p></div></div>
      <div class="card"><div class="card-head"><h3>🎟️ Offene Einladungscodes</h3></div><div class="list" id="zgCodes">
        <p class="soft">Wird geladen …</p></div></div>`;

    const spielerName = (pid) => {
      const p = Store.byId("players", pid);
      return p ? `${p.firstName} ${p.lastName}` : "unbekannt";
    };

    const erzeugen = async (rolle, p) => {
      const res = await apiZugang("/api/invites", {
        role: rolle,
        name: rolle === "eltern" ? ([p.parentName, p.parent2Name].filter(Boolean)[0] || "") : `${p.firstName} ${p.lastName}`,
        playerIds: [p.id],
      });
      if (!res.ok) { toast(res.data.error || "Code konnte nicht erstellt werden", "bad"); return; }
      codeModal(rolle, rolle === "eltern" ? `Eltern von ${p.firstName}` : p.firstName, res.data.code, res.data.url);
      ladeCodes();
    };
    $("[data-wasave]", el).onclick = () => {
      const st2 = S();
      st2.whatsapp = { spieler: $("#waSpieler", el).value.trim(), eltern: $("#waEltern", el).value.trim() };
      Store.save();
      toast("WhatsApp-Gruppen gespeichert – Portal zeigt je Rolle den passenden Link", "good");
    };
    // Kurzanleitung erstellen – wahlweise mit frisch erzeugtem Einladungscode am Ende
    const ANL_ROLLE = { trainer: "Trainer:innen", spieler: "Spieler:innen", eltern: "Eltern" };
    const ANL_DATEI = { trainer: "Trainer-innen", spieler: "Spieler-innen", eltern: "Eltern" };
    const anleitungErstellen = (rolle, teilen) => {
      const kandidaten = rolle === "trainer" ? [] : aktive;
      modal({
        title: `Kurzanleitung für ${ANL_ROLLE[rolle]}`,
        body: `
          <div class="field"><label>🎟️ Einladungscode am Ende anfügen?</label>
            <select id="anlCode">
              <option value="">ohne Einladungscode (allgemeine Anleitung)</option>
              ${rolle === "trainer"
                ? `<option value="neu">Neuen Trainer:innen-Code erzeugen und anfügen</option>`
                : kandidaten.map((p) => `<option value="${p.id}">Code für ${esc(p.firstName)} ${esc(p.lastName)}${rolle === "eltern" ? " (Eltern-Konto)" : ""}</option>`).join("")}
            </select></div>
          <p class="soft" style="font-size:.82rem">Mit Code steht unten auf der Anleitung der persönliche
          Einladungscode samt QR-Code – ideal, um alles in einem Schritt zu verschicken (Code gilt 14 Tage).</p>`,
        footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>${teilen ? "📤 Erstellen & teilen" : "⬇️ PDF erstellen"}</button>`,
        onOpen(m) {
          m.querySelector("[data-x]").onclick = closeModal;
          m.querySelector("[data-s]").onclick = async () => {
            const wahl = m.querySelector("#anlCode").value;
            let codeInfo = null;
            let dateiname = `SKV-Volleyball-Kurzanleitung-${ANL_DATEI[rolle]}-v${ANLEITUNG_VERSION}`;
            if (wahl) {
              const p = wahl === "neu" ? null : Store.byId("players", wahl);
              const res = await apiZugang("/api/invites", {
                role: rolle,
                name: p ? (rolle === "eltern" ? ([p.parentName, p.parent2Name].filter(Boolean)[0] || "") : `${p.firstName} ${p.lastName}`) : "",
                playerIds: p ? [p.id] : [],
              });
              if (!res.ok) { toast(res.data.error || "Code konnte nicht erzeugt werden", "bad"); return; }
              codeInfo = { code: res.data.code, url: res.data.url,
                           name: p ? (rolle === "eltern" ? `die Eltern von ${p.firstName}` : `${p.firstName} ${p.lastName}`) : "" };
              if (p) dateiname += `-${p.firstName}-${p.lastName}`;
              ladeCodes();
            }
            closeModal();
            pdfVomServer(dateiname, kurzanleitungBlocks(rolle, codeInfo), teilen);
          };
        },
      });
    };
    $$("[data-anlpdf]", el).forEach((b) => b.onclick = () => anleitungErstellen(b.dataset.anlpdf, false));
    $$("[data-anlshare]", el).forEach((b) => b.onclick = () => anleitungErstellen(b.dataset.anlshare, true));
    $$("[data-cs]", el).forEach((b) => b.onclick = () => erzeugen("spieler", Store.byId("players", b.dataset.cs)));
    $$("[data-ce]", el).forEach((b) => b.onclick = () => erzeugen("eltern", Store.byId("players", b.dataset.ce)));
    $("[data-tcode]", el).onclick = async () => {
      const res = await apiZugang("/api/invites", { role: "trainer", name: "", playerIds: [] });
      if (!res.ok) { toast(res.data.error || "Code konnte nicht erstellt werden", "bad"); return; }
      codeModal("trainer", "", res.data.code, res.data.url);
      ladeCodes();
    };

    const ROLLE_BADGE = { trainer: "accent", spieler: "info", eltern: "good" };
    const zuletztAktiv = (ts) => {
      if (!ts) return "noch nie angemeldet";
      const tage = Math.floor((Date.now() / 1000 - ts) / 86400);
      if (tage <= 0) return "heute aktiv";
      if (tage === 1) return "gestern aktiv";
      return `zuletzt aktiv vor ${tage} Tagen (${fmtDateShort(new Date(ts * 1000).toISOString())})`;
    };
    async function ladeKonten() {
      _trainerNamen = null; // Konten wurden (neu) geladen/geändert → Trainer-Dropdown-Cache verwerfen
      const res = await apiZugang("/api/accounts");
      const ziel = $("#zgKonten", el);
      if (!res.ok) { ziel.innerHTML = `<p class="soft">Konten konnten nicht geladen werden.</p>`; return; }
      const st = res.data.statistik || {};
      $("#zgStat", el).innerHTML = `
        ${stat("👥", "Portal-Konten", st.portalKonten != null ? st.portalKonten : "—", `${st.konten || 0} Konten gesamt`)}
        ${stat("📈", "Aktiv (7 Tage)", st.aktiv7 != null ? st.aktiv7 : "—", `${st.aktiv30 || 0} in 30 Tagen`)}
        ${stat("🔔", "Push-Abos", st.pushAbos != null ? st.pushAbos : "—", "Mitteilungen aktiviert")}
        ${stat("🎟️", "Offene Codes", st.offeneCodes != null ? st.offeneCodes : "—", "noch nicht eingelöst")}`;
      // Offene Passwort-Anfragen prominent über der Kontenliste
      const anfragen = res.data.anfragen || [];
      const konten = res.data.accounts;
      const anfrageHTML = anfragen.length ? `
        <div style="border:1.5px solid #e8a13c;border-radius:12px;padding:10px 12px;margin-bottom:10px">
          <strong style="font-size:.9rem">🔑 Offene Passwort-Anfragen</strong>
          ${anfragen.map((a) => {
            const konto = konten.find((k) => k.username.toLowerCase() === String(a.username).toLowerCase());
            return `<div class="flex" style="justify-content:space-between;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
              <span style="font-size:.88rem">„${esc(a.username)}“ <span class="soft">· ${zuletztAktiv(a.created_at).replace("aktiv", "angefragt")}</span>
                ${konto ? "" : ' <span class="badge warn" title="Kein Konto mit diesem Benutzernamen – ggf. Tippfehler, bitte nachfragen">unbekannt</span>'}</span>
              <span class="flex" style="gap:6px">
                ${konto ? `<button class="btn sm outline" data-anfcode="${konto.id}">🔑 Code erzeugen</button>` : ""}
                <button class="btn sm ghost" data-anfweg="${a.id}" title="Anfrage verwerfen">🗑️</button>
              </span></div>`;
          }).join("")}
        </div>` : "";
      ziel.innerHTML = anfrageHTML + konten.map((k) => `
        <div class="list-item"><div class="grow">
          <div class="title" style="font-size:.9rem">${esc(k.name)} <span class="soft">(${esc(k.username)})</span></div>
          <div class="sub">${k.player_ids.length ? "verknüpft: " + k.player_ids.map(spielerName).map(esc).join(", ") : "keine Spieler:in verknüpft"}${k.totp_enabled ? " · 2FA ✔" : ""}${k.push_abos ? ` · 🔔 ${k.push_abos}` : ""}</div>
          <div class="sub">${zuletztAktiv(k.last_login)}</div>
        </div>
        <span class="badge ${ROLLE_BADGE[k.role] || ""}">${esc(k.role)}</span>
        <button class="btn sm ghost" data-kedit="${k.id}" title="Konto bearbeiten (Name, Rolle, Verknüpfungen)">✏️</button>
        <button class="btn sm ghost" data-kreset="${k.id}" title="Passwort-Wiederherstellungscode erzeugen">🔑</button>
        ${k.active ? `<button class="btn sm ghost" data-deakt="${k.id}">Deaktivieren</button>`
                   : `<span class="badge bad">deaktiviert</span><button class="btn sm ghost" data-akt="${k.id}">Aktivieren</button>`}
        </div>`).join("") || `<p class="soft">Noch keine Konten.</p>`;
      $$("[data-deakt]", ziel).forEach((b) => b.onclick = () =>
        confirmDialog("Konto deaktivieren? Die Person kann sich dann nicht mehr anmelden.", async () => {
          const r = await apiZugang(`/api/accounts/${b.dataset.deakt}/active`, { active: false });
          if (!r.ok) toast(r.data.error || "Fehler", "bad"); else { toast("Konto deaktiviert"); ladeKonten(); }
        }));
      $$("[data-akt]", ziel).forEach((b) => b.onclick = async () => {
        const r = await apiZugang(`/api/accounts/${b.dataset.akt}/active`, { active: true });
        if (!r.ok) toast(r.data.error || "Fehler", "bad"); else { toast("Konto aktiviert", "good"); ladeKonten(); }
      });
      const resetErzeugen = async (kontoId) => {
        const r = await apiZugang(`/api/accounts/${kontoId}/reset-code`, {});
        if (!r.ok) { toast(r.data.error || "Code konnte nicht erzeugt werden", "bad"); return; }
        resetCodeModal(r.data.username, r.data.code);
        ladeKonten();
      };
      $$("[data-kreset]", ziel).forEach((b) => b.onclick = () => resetErzeugen(b.dataset.kreset));
      $$("[data-anfcode]", ziel).forEach((b) => b.onclick = () => resetErzeugen(b.dataset.anfcode));
      $$("[data-anfweg]", ziel).forEach((b) => b.onclick = async () => {
        const r = await apiZugang(`/api/passwort-anfragen/${b.dataset.anfweg}`, null, "DELETE");
        if (!r.ok) toast("Löschen fehlgeschlagen", "bad"); else ladeKonten();
      });
      $$("[data-kedit]", ziel).forEach((b) => b.onclick = () => {
        const k = konten.find((x) => String(x.id) === b.dataset.kedit);
        if (k) kontoForm(k, ladeKonten);
      });
      // In der Code-Liste je Spieler:in anzeigen, wann Spieler:in- und
      // Eltern-Konto zuletzt online waren
      $$("[data-online]", el).forEach((n) => {
        const pid = n.dataset.online;
        const sp = konten.find((k) => k.role === "spieler" && k.active && k.player_ids.includes(pid));
        const elt = konten.find((k) => k.role === "eltern" && k.active && k.player_ids.includes(pid));
        const teil = (icon, k) => k ? `${icon} ${zuletztAktiv(k.last_login)}` : `${icon} noch kein Konto`;
        n.textContent = `${teil("🏐", sp)} · ${teil("👪", elt)}`;
      });
    }
    async function ladeCodes() {
      const res = await apiZugang("/api/invites");
      const ziel = $("#zgCodes", el);
      if (!res.ok) { ziel.innerHTML = `<p class="soft">Codes konnten nicht geladen werden.</p>`; return; }
      const jetzt = Math.floor(Date.now() / 1000);
      const offen = res.data.invites.filter((i) => !i.used_by && i.expires_at > jetzt);
      ziel.innerHTML = offen.map((i) => `
        <div class="list-item"><div class="grow">
          <div class="title" style="font-size:.9rem">${esc(i.name || "ohne Namen")}${i.player_ids.length ? ` · ${i.player_ids.map(spielerName).map(esc).join(", ")}` : ""}</div>
          <div class="sub">läuft ab ${fmtDateShort(new Date(i.expires_at * 1000).toISOString())} · von ${esc(i.created_by)}</div></div>
        <span class="badge ${ROLLE_BADGE[i.role] || ""}">${esc(i.role)}</span>
        <button class="btn sm ghost" data-cdel="${i.id}">🗑️</button>
        </div>`).join("") || `<p class="soft">Keine offenen Codes. Codes werden bei der Registrierung automatisch eingelöst.</p>`;
      $$("[data-cdel]", ziel).forEach((b) => b.onclick = async () => {
        const r = await apiZugang(`/api/invites/${b.dataset.cdel}`, null, "DELETE");
        if (!r.ok) toast("Löschen fehlgeschlagen", "bad"); else { toast("Code gelöscht"); ladeCodes(); }
      });
    }
    ladeKonten();
    ladeCodes();
  }

  // ---- Export ----
  /* ======================================================================
     TEAM-ANALYSE & ABZEICHEN
     Rückmelde- und Zusagenquoten je Spieler:in, filterbar nach Zeitraum und
     Termin-Art. „Teilnahme" wird über die Zusagen abgebildet (eine echte
     Anwesenheitsliste gibt es nicht). Abzeichen beziehen sich immer auf die
     laufende Saison und brauchen mindestens 3 Termine im Bereich.
     ====================================================================== */
  const ABZ_MIN_TERMINE = 3;

  function saisonBeginn() {
    const jetzt = new Date();
    return new Date(jetzt.getFullYear() - (jetzt.getMonth() < 6 ? 1 : 0), 6, 1);
  }

  function analyseTermine(zeitraum, typ) {
    const jetzt = new Date();
    // Abgesagte Termine zählen nicht – weder für Quoten noch für Abzeichen
    let evs = S().events.filter((e) => ["training", "home", "away"].includes(e.type) && !e.abgesagt && new Date(e.start) < jetzt);
    if (zeitraum === "saison") { const sb = saisonBeginn(); evs = evs.filter((e) => new Date(e.start) >= sb); }
    if (zeitraum === "90") evs = evs.filter((e) => (jetzt - new Date(e.start)) <= 90 * 86400000);
    if (typ === "training") evs = evs.filter((e) => e.type === "training");
    if (typ === "spiel") evs = evs.filter((e) => e.type === "home" || e.type === "away");
    return evs.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function analyseStatistik(evs) {
    const roster = S().players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    const respByEvent = {};
    S().responses.forEach((r) => { (respByEvent[r.eventId] = respByEvent[r.eventId] || {})[r.playerId] = r.status; });
    return roster.map((p) => {
      let geantwortet = 0, zusagen = 0, absagen = 0, unsicher = 0, n = 0;
      evs.forEach((e) => {
        const st = (respByEvent[e.id] || {})[p.id];
        if (st === "x") return;  // „nicht nominiert" zählt für diese Person nicht mit
        n++;
        if (st) geantwortet++;
        if (st === "yes") zusagen++; else if (st === "no") absagen++; else if (st === "maybe") unsicher++;
      });
      return { p, termine: n, geantwortet, zusagen, absagen, unsicher,
        antwortQ: n ? Math.round(geantwortet / n * 100) : 0,
        zusageQ: n ? Math.round(zusagen / n * 100) : 0 };
    });
  }

  // Abzeichen je Spieler:in – immer über die laufende Saison gerechnet
  function spielerAbzeichen() {
    const statB = {};
    ["alle", "training", "spiel"].forEach((k) => {
      statB[k] = {};
      analyseStatistik(analyseTermine("saison", k)).forEach((z) => { statB[k][z.p.id] = z; });
    });
    const defs = (S().abzeichenDefs || []).slice().sort((a, b) => (a.schwelle || 0) - (b.schwelle || 0));
    const out = {};
    S().players.forEach((p) => {
      out[p.id] = defs.filter((d) => {
        const z = (statB[d.bereich || "alle"] || {})[p.id];
        if (!z || z.termine < ABZ_MIN_TERMINE) return false;
        const q = d.typ === "teilnahme" ? z.zusageQ : z.antwortQ;
        return q >= (d.schwelle || 0);
      });
    });
    return out;
  }

  function abzeichenForm(d) {
    const isEdit = !!d;
    d = d || { name: "", emoji: "🏅", typ: "teilnahme", schwelle: 75, bereich: "training" };
    modal({
      title: isEdit ? "Abzeichen bearbeiten" : "Neues Abzeichen",
      body: `<form id="abf"><div class="form-grid">
        <div class="field"><label>Emoji</label><input name="emoji" value="${esc(d.emoji)}" maxlength="4" required></div>
        <div class="field"><label>Name</label><input name="name" value="${esc(d.name)}" required placeholder="z. B. Trainingsteilnahme 85 %"></div>
        <div class="field"><label>Gezählt wird</label><select name="typ">
          <option value="rueckmeldung" ${d.typ === "rueckmeldung" ? "selected" : ""}>Rückmeldung abgegeben</option>
          <option value="teilnahme" ${d.typ === "teilnahme" ? "selected" : ""}>Teilnahme (Zusagen)</option></select></div>
        <div class="field"><label>Schwelle (%)</label><input type="number" name="schwelle" min="1" max="100" value="${d.schwelle}" required></div>
        <div class="field"><label>Bereich</label><select name="bereich">
          <option value="alle" ${d.bereich === "alle" ? "selected" : ""}>alle Termine</option>
          <option value="training" ${d.bereich === "training" ? "selected" : ""}>nur Trainings</option>
          <option value="spiel" ${d.bereich === "spiel" ? "selected" : ""}>nur Spiele</option></select></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#abf"); if (!f.reportValidity()) return;
          const w = formData(f); w.schwelle = Number(w.schwelle) || 0;
          if (isEdit) Store.update("abzeichenDefs", d.id, w); else Store.add("abzeichenDefs", w);
          closeModal(); toast("Abzeichen gespeichert", "good"); reload();
        };
      },
    });
  }

  function analyse(el) {
    const zeit = analyse._zeit || "saison";
    const typ = analyse._typ || "alle";
    const evs = analyseTermine(zeit, typ);
    const zeilen = analyseStatistik(evs);
    const abz = spielerAbzeichen();
    const defs = (S().abzeichenDefs || []).slice().sort((a, b) => (a.schwelle || 0) - (b.schwelle || 0));

    const mitTerminen = zeilen.filter((z) => z.termine > 0);
    const avg = (f) => mitTerminen.length ? Math.round(mitTerminen.reduce((s, z) => s + f(z), 0) / mitTerminen.length) : 0;
    const beste = mitTerminen.filter((z) => z.termine >= ABZ_MIN_TERMINE)
      .slice().sort((a, b) => b.antwortQ - a.antwortQ || b.zusageQ - a.zusageQ)[0];

    // Trainings je Trainer:in im gewählten Zeitraum
    const proTrainer = {};
    evs.filter((e) => e.type === "training").forEach((e) => {
      const n = (e.trainerName || "").trim() || "ohne Zuordnung";
      proTrainer[n] = (proTrainer[n] || 0) + 1;
    });

    const balken = (q) => `<div style="display:flex;align-items:center;gap:8px;min-width:120px">
      <div style="flex:1;height:7px;border-radius:4px;background:var(--border,#e3e6ee);overflow:hidden">
        <div style="width:${q}%;height:100%;border-radius:4px;background:${q >= 75 ? "var(--good,#2e9e5b)" : q >= 50 ? "#e8a13c" : "#d05050"}"></div>
      </div><span style="font-size:.82rem;width:38px;text-align:right">${q} %</span></div>`;

    el.innerHTML = `
      ${head("Team-Analyse", "Wer meldet zuverlässig zurück, wer ist oft dabei? Quoten, Abzeichen und Trends für das Trainerteam")}
      <div class="flex mb" style="gap:10px;flex-wrap:wrap">
        <div class="field" style="min-width:180px"><label>Zeitraum</label><select id="anZeit">
          <option value="saison" ${zeit === "saison" ? "selected" : ""}>laufende Saison (ab 1. Juli)</option>
          <option value="90" ${zeit === "90" ? "selected" : ""}>letzte 90 Tage</option>
          <option value="alles" ${zeit === "alles" ? "selected" : ""}>gesamter Zeitraum</option></select></div>
        <div class="field" style="min-width:160px"><label>Termin-Art</label><select id="anTyp">
          <option value="alle" ${typ === "alle" ? "selected" : ""}>alle Termine</option>
          <option value="training" ${typ === "training" ? "selected" : ""}>nur Trainings</option>
          <option value="spiel" ${typ === "spiel" ? "selected" : ""}>nur Spiele</option></select></div>
      </div>
      <div class="grid grid-4 mb">
        ${stat("📅", "Termine im Zeitraum", evs.length)}
        ${stat("🔔", "Ø Rückmeldequote", avg((z) => z.antwortQ) + " %")}
        ${stat("👍", "Ø Zusagenquote", avg((z) => z.zusageQ) + " %")}
        ${stat("⭐", "Zuverlässigste:r", beste ? `${esc(beste.p.firstName)} ${esc(beste.p.lastName.slice(0, 1))}.` : "–")}
      </div>
      ${Object.keys(proTrainer).length ? `<div class="card mb" style="padding:10px 14px">
        <div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">
          <strong>🏐 Trainings je Trainer:in:</strong>
          ${Object.keys(proTrainer).sort().map((n) => `<span class="badge ${n === "ohne Zuordnung" ? "" : "info"}">👤 ${esc(n)}: <strong>${proTrainer[n]}</strong></span>`).join(" ")}
        </div></div>` : ""}
      <div class="card mb" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Spieler:in</th><th>Team</th><th>geantwortet</th><th>Rückmeldequote</th><th>Zusagen</th><th>Absagen</th><th>Abzeichen (Saison)</th></tr></thead>
        <tbody>${zeilen.map((z) => `<tr>
          <td><div class="flex">${avatar(z.p.firstName, z.p.lastName, z.p)}<strong>${esc(z.p.firstName)} ${esc(z.p.lastName)}</strong></div></td>
          <td><span class="badge info">${esc(z.p.team)}</span></td>
          <td>${z.geantwortet} / ${z.termine}</td>
          <td>${balken(z.antwortQ)}</td>
          <td>${balken(z.zusageQ)}</td>
          <td>${z.absagen}${z.unsicher ? ` <span class="soft">(+${z.unsicher} ❔)</span>` : ""}</td>
          <td style="font-size:1.05rem">${(abz[z.p.id] || []).map((d) => `<span title="${esc(d.name)} (ab ${d.schwelle} %)">${esc(d.emoji)}</span>`).join(" ") || '<span class="soft">–</span>'}</td>
        </tr>`).join("")}</tbody>
      </table></div></div>
      <div class="card">
        <div class="card-head"><h3>🏅 Abzeichen-Regeln</h3><span class="spacer"></span>
          <button class="btn sm" data-abadd>＋ Abzeichen</button></div>
        <p class="soft" style="font-size:.82rem;margin-top:0">Abzeichen werden automatisch über die <strong>laufende Saison</strong> vergeben
          (mindestens ${ABZ_MIN_TERMINE} Termine im Bereich). „Teilnahme" zählt die Zusagen. Die Spieler:innen sehen ihre Abzeichen im Portal.</p>
        <div class="list">
          ${defs.map((d) => `<div class="list-item" style="padding:8px 10px">
            <div style="font-size:1.3rem">${esc(d.emoji)}</div>
            <div class="grow"><div class="title" style="font-size:.9rem">${esc(d.name)}</div>
              <div class="sub">${d.typ === "teilnahme" ? "Teilnahme (Zusagen)" : "Rückmeldung abgegeben"} · ab ${d.schwelle} % ·
                ${d.bereich === "training" ? "nur Trainings" : d.bereich === "spiel" ? "nur Spiele" : "alle Termine"}</div></div>
            <button class="btn sm ghost" data-abedit="${d.id}">✏️</button>
            <button class="btn sm ghost" data-abdel="${d.id}">🗑️</button>
          </div>`).join("") || empty("🏅", "Noch keine Abzeichen definiert")}
        </div>
      </div>`;

    $("#anZeit", el).onchange = (e2) => { analyse._zeit = e2.target.value; reload(); };
    $("#anTyp", el).onchange = (e2) => { analyse._typ = e2.target.value; reload(); };
    $("[data-abadd]", el).onclick = () => abzeichenForm(null);
    $$("[data-abedit]", el).forEach((b) => b.onclick = () => abzeichenForm(Store.byId("abzeichenDefs", b.dataset.abedit)));
    $$("[data-abdel]", el).forEach((b) => b.onclick = () => {
      const d = Store.byId("abzeichenDefs", b.dataset.abdel);
      if (d && confirm(`Abzeichen „${d.name}“ löschen?`)) { Store.remove("abzeichenDefs", d.id); toast("Abzeichen gelöscht"); reload(); }
    });
  }

  window.Views = {
    dashboard, players, departments, calendar, training, analyse, drivers, jobs, consents,
    birthdays, finances, clothing, sponsors, standings, wiki,
    announcements, tasks, inventory, verbandsmeldung, backup, zugaenge,
  };
})();
