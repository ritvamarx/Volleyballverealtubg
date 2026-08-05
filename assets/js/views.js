/* ==========================================================================
   SKV Volleyball – Views (Ansichten)
   Jede View ist eine Funktion(el), die das Ziel-Element füllt und Events bindet.
   Nach Änderungen wird über App.reload() die aktuelle Ansicht neu gerendert.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, esc, fmtDate, fmtDateShort, fmtTime, fmtDateTime, fmtMoney,
    daysUntil, relDays, age, avatar, toast, modal, closeModal, confirmDialog,
    formData, clothingSVG, sponsorSVG, DOW, MON } = U;

  const S = () => Store.get();
  const reload = () => App.reload();

  // ---- gemeinsame Bausteine ----
  function head(title, subtitle, actionsHTML) {
    return `<div class="section-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
      <div class="spacer"></div>${actionsHTML || ""}</div>`;
  }
  function stat(icon, label, value, sub) {
    return `<div class="card"><div class="flex" style="align-items:flex-start">
      <div class="icon">${icon}</div>
      <div class="stat"><span class="label">${esc(label)}</span>
      <span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</div></div></div>`;
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

  // ---- Bearbeitbare Link-Sammlung (Übersicht + Verbandsseite) ----
  function linkListHTML() {
    return S().links.map((lk) => `
      <div class="flex" style="gap:0">
        <a class="link-card grow" href="${esc(lk.url)}" target="_blank" rel="noopener" style="border-radius:12px 0 0 12px;border-right:none">
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
  function eventPill(type) {
    return `<span class="badge pill-type-${type}">${typeLabel[type] || "Termin"}</span>`;
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
        ${stat("🏐", "Aktive Spieler", s.players.filter((p) => p.membershipStatus !== "inaktiv").length, `${s.players.length} gesamt`)}
        ${stat("📅", "Nächste Termine", next.length, next[0] ? `${typeLabel[next[0].type]} ${relDays(next[0].start)}` : "—")}
        ${stat("📝", "Offene Einverständnis.", openConsents, openConsents ? "Bitte einholen" : "alles vollständig")}
        ${stat("💶", "Offene Beiträge", fmtMoney(openFees.reduce((a, f) => a + f.amount, 0)), `${openFees.length} Positionen`)}
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
          <div class="card-head"><h3>📣 Ankündigungen</h3></div>
          <div class="list">
            ${s.announcements.slice(0, 3).map((a) => `
              <div class="list-item"><div class="grow">
                <div class="title">${esc(a.title)}</div>
                <div class="sub">${fmtDateShort(a.date)}</div></div></div>`).join("")}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>🎂 Geburtstage (30 Tage)</h3></div>
          <div class="list">
            ${bdays.length ? bdays.slice(0, 4).map((b) => `
              <div class="list-item">${avatar(b.firstName, b.lastName)}
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
    if (filter !== "alle") list = list.filter((p) => p.departmentId === filter);
    const chips = [`<button class="chip ${filter === "alle" ? "active" : ""}" data-team="alle">alle (${s.players.length})</button>`]
      .concat(s.departments.map((d) => {
        const n = s.players.filter((p) => p.departmentId === d.id).length;
        return `<button class="chip ${filter === d.id ? "active" : ""}" data-team="${d.id}">${esc(d.name)} (${n})</button>`;
      }));

    const wa = waGroupLink();
    el.innerHTML = `
      ${head("Spielerverwaltung", "Kader, Kontaktdaten von Spielern und Eltern",
        `${wa ? `<a class="btn secondary" href="${esc(wa.url)}" target="_blank" rel="noopener">💬 WhatsApp-Gruppe</a>` : ""}<button class="btn outline" data-io>⇅ Import / Export</button><button class="btn" data-add>＋ Spieler</button>`)}
      <div class="chip-row mb">${chips.join("")}</div>
      <div class="card" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Nr.</th><th>Abteilung</th><th>Jg.</th><th>Pass-Nr.</th><th class="wrap">Kontakt (Erstkontakt ⭐)</th><th>Einverst.</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((p) => `
            <tr>
              <td><div class="flex">${avatar(p.firstName, p.lastName)}<div><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong><div class="sub soft">${esc(p.position)}</div></div></div></td>
              <td>#${esc(p.jerseyNumber)}</td>
              <td><span class="badge info">${esc(deptName(p.departmentId))}</span></td>
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
          if (b.dataset.ex === "csv") IO.download(`skv-spieler-${stamp}.csv`, IO.toCSV(PLAYER_CSV_FIELDS, ps.map((p) => ({ ...p, departmentId: deptName(p.departmentId) }))), "text/csv");
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
        <div class="field"><label>Abteilung / Mannschaft</label><select name="departmentId">
          ${deps.map((d) => `<option value="${d.id}" ${d.id === p.departmentId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
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
        ${(() => { const wa = waGroupLink(); return wa ? `<a class="btn sm secondary mb" href="${esc(wa.url)}" target="_blank" rel="noopener">💬 WhatsApp-Gruppe öffnen</a>` : ""; })()}
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
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const headRow = key !== lastKey ? `<div class="list-month">${MON[d.getMonth()]} ${d.getFullYear()}</div>` : "";
        lastKey = key;
        const hol = holidayFor(d);
        return `${headRow}
          <div class="list-item">
            <div class="cal-list-date" data-ev="${e.id}" style="cursor:pointer"><strong>${d.getDate()}.</strong><span>${DOW[d.getDay()]}</span></div>
            <div class="grow" data-ev="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)} ${e.seriesId ? '<span class="badge">🔁 Serie</span>' : ""}${hol ? ' <span class="badge warn">🏖 schulfrei</span>' : ""}</div>
            <div class="sub">${fmtTime(e.start)} Uhr · ${esc(e.location || "—")}</div></div>
            <select class="ev-type" data-evtype="${e.id}" title="Art des Termins ändern" style="width:auto;font-size:.78rem;padding:5px 6px">
              ${Object.entries(typeLabel).map(([k, v]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${v}</option>`).join("")}
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
        `<button class="btn outline" data-import>⬇️ Termine importieren</button><button class="btn" data-add>＋ Termin</button>`)}
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
            Offizielle Quelle: <a href="https://www.bildung-mv.de/schueler/ferien/" target="_blank" rel="noopener">Bildungsserver MV ↗</a></p>
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
    modal({
      title: e.title,
      wide: true,
      body: `
        <div class="flex flex-wrap mb">${eventPill(e.type)}<span class="badge">${fmtDateTime(e.start)}</span><span class="badge">bis ${fmtTime(e.end)} Uhr</span></div>
        <dl class="kv mb">
          <dt>Ort</dt><dd>${esc(e.location)}</dd>
          ${e.opponent ? `<dt>Gegner</dt><dd>${esc(e.opponent)}</dd>` : ""}
          ${e.description ? `<dt>Info</dt><dd>${esc(e.description)}</dd>` : ""}
        </dl>
        ${e.type === "training" ? `<p class="soft">${responses.filter((r) => r.status === "yes").length} Zusagen · ${responses.filter((r) => r.status === "no").length} Absagen. Details unter „Training“.</p>` : ""}
        ${e.type === "away" ? `<p class="soft">${drivers.length} Fahrer eingetragen (${drivers.reduce((a, d) => a + d.seats, 0)} Plätze). Details unter „Fahrerplanung“.</p>` : ""}
        ${e.type === "home" ? `<p class="soft">${jobs.filter((j) => j.assignee).length}/${jobs.length} Jobs vergeben. Details unter „Heimspiel-Jobs“.</p>` : ""}`,
      footer: `<button class="btn ghost" data-x>Schließen</button><button class="btn danger" data-del>Löschen</button><button class="btn" data-edit>Bearbeiten</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
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

  function eventForm(e) {
    const isEdit = !!e;
    e = e || { type: "training", title: "", start: "", end: "", location: "Sporthalle SKV, Halle 1", opponent: "", description: "" };
    const toLocal = (iso) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    modal({
      title: isEdit ? "Termin bearbeiten" : "Neuer Termin",
      body: `<form id="ef"><div class="form-grid">
        <div class="field"><label>Art</label><select name="type">
          ${Object.entries(typeLabel).map(([k, v]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>Titel</label><input name="title" value="${esc(e.title)}" required></div>
        <div class="field"><label>Beginn</label><input type="datetime-local" name="start" value="${toLocal(e.start)}" required></div>
        <div class="field"><label>Ende</label><input type="datetime-local" name="end" value="${toLocal(e.end)}"></div>
        <div class="field full"><label>Ort</label><input name="location" value="${esc(e.location)}"></div>
        <div class="field full"><label>Gegner (bei Spielen)</label><input name="opponent" value="${esc(e.opponent)}"></div>
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
    const trainings = S().events.filter((e) => e.type === "training")
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const upcoming = trainings.filter((e) => daysUntil(e.start) >= -1);
    const sel = training._sel && trainings.find((t) => t.id === training._sel) ? training._sel : (upcoming[0] || trainings[0] || {}).id;
    const evt = Store.byId("events", sel);

    el.innerHTML = `
      ${head("Trainingsrückmeldung", "Spieler melden sich verbindlich zu, ab oder unsicher")}
      <div class="field" style="max-width:520px">
        <label>Trainingstermin</label>
        <select id="tsel">${trainings.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${fmtDateShort(t.start)} · ${fmtTime(t.start)} · ${esc(t.title)}</option>`).join("")}</select>
      </div>
      <div id="tbody" class="mt-lg"></div>`;

    $("#tsel", el).onchange = (ev) => { training._sel = ev.target.value; reload(); };
    renderTrainingBody($("#tbody", el), evt);
  }

  function renderTrainingBody(box, evt) {
    if (!evt) { box.innerHTML = empty("🏐", "Kein Training vorhanden"); return; }
    const roster = S().players.filter((p) => p.membershipStatus !== "inaktiv")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    const resp = {};
    S().responses.filter((r) => r.eventId === evt.id).forEach((r) => resp[r.playerId] = r.status);
    const count = { yes: 0, no: 0, maybe: 0, open: 0 };
    roster.forEach((p) => { const st = resp[p.id]; if (st) count[st]++; else count.open++; });

    box.innerHTML = `
      <div class="grid grid-4 mb">
        ${stat("✅", "Zusagen", count.yes)}
        ${stat("❌", "Absagen", count.no)}
        ${stat("❔", "Unsicher", count.maybe)}
        ${stat("⏳", "Keine Rückmeldung", count.open)}
      </div>
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Spieler</th><th>Team</th><th>Rückmeldung</th><th class="right">Aktion</th></tr></thead>
        <tbody>${roster.map((p) => {
          const st = resp[p.id] || "open";
          return `<tr>
            <td><div class="flex">${avatar(p.firstName, p.lastName)}<strong>${esc(p.firstName)} ${esc(p.lastName)}</strong></div></td>
            <td><span class="badge info">${esc(p.team)}</span></td>
            <td>${rmBadge(st)}</td>
            <td class="right nowrap">
              <button class="btn sm ${st === "yes" ? "" : "outline"}" data-set="yes" data-pl="${p.id}">Zusagen</button>
              <button class="btn sm ${st === "maybe" ? "secondary" : "outline"}" data-set="maybe" data-pl="${p.id}">Unsicher</button>
              <button class="btn sm ${st === "no" ? "danger" : "outline"}" data-set="no" data-pl="${p.id}">Absagen</button>
            </td></tr>`;
        }).join("")}</tbody>
      </table></div></div>`;

    $$("[data-set]", box).forEach((b) => b.onclick = () => {
      setResponse(evt.id, b.dataset.pl, b.dataset.set); reload();
    });
  }
  function rmBadge(st) {
    return ({ yes: '<span class="badge good">Zugesagt</span>', no: '<span class="badge bad">Abgesagt</span>',
      maybe: '<span class="badge warn">Unsicher</span>', open: '<span class="badge">offen</span>' })[st] || "";
  }
  function setResponse(eventId, playerId, status) {
    const ex = S().responses.find((r) => r.eventId === eventId && r.playerId === playerId);
    if (ex) Store.update("responses", ex.id, { status, at: new Date().toISOString() });
    else Store.add("responses", { eventId, playerId, status, at: new Date().toISOString() });
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
        <label class="list-item" style="cursor:pointer">${avatar(p.firstName, p.lastName)}
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
      </div>`;

    $$("[data-jdone]", box).forEach((b) => b.onclick = () => { const j = Store.byId("jobs", b.dataset.jdone); Store.update("jobs", j.id, { done: !j.done }); reload(); });
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
    l = l || { title: "", body: "Liebe Eltern,\n\n", deadline: "", includeHomeGames: true, includeSlip: true };
    modal({
      title: isEdit ? "Elternbrief bearbeiten" : "Neuer Elternbrief",
      wide: true,
      body: `<form id="lf"><div class="form-grid">
        <div class="field"><label>Titel</label><input name="title" value="${esc(l.title)}" required placeholder="z. B. Elternbrief zum Saisonstart"></div>
        <div class="field"><label>⏰ Rückmeldefrist</label><input type="date" name="deadline" value="${esc(l.deadline)}"></div>
        <div class="field full"><label>Brieftext <span class="soft" style="font-weight:400">(Absätze mit Leerzeile trennen; „## " = Überschrift; Platzhalter für Serienbrief: {vorname}, {nachname}, {eltern})</span></label>
          <textarea name="body" rows="14" required>${esc(l.body)}</textarea></div>
        <div class="field"><label><input type="checkbox" name="includeHomeGames" ${l.includeHomeGames ? "checked" : ""} style="width:auto"> Termine einfügen (Heim- & Auswärtsspiele je Datum zusammengefasst, Trainings-Hinweis donnerstags)</label></div>
        <div class="field"><label><input type="checkbox" name="includeSlip" ${l.includeSlip ? "checked" : ""} style="width:auto"> Rückmeldeabschnitt (E-Mail, Mobil, WhatsApp, Fahrer, Buffet) anhängen</label></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button>
        <button class="btn outline" data-p>🖨️ Vorschau/Druck</button>
        <button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        const collect = () => {
          const d = formData(m.querySelector("#lf"));
          return { title: d.title, body: d.body, deadline: d.deadline, includeHomeGames: !!d.includeHomeGames, includeSlip: !!d.includeSlip };
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
  // playersList (optional): Serienbrief – ein personalisierter Brief pro Spieler
  function printParentLetter(l, playersList) {
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
    const dateList = (evs) => groupByDate(evs).map(([day, items]) =>
      `<li><strong>${fmtDate(items[0].start)}</strong> – ${items.map((g) =>
        `${fmtTime(g.start)} Uhr ${esc(g.title)}${g.opponent ? " gegen " + esc(g.opponent) : ""}${g.location ? " (" + esc(g.location) + ")" : ""}`
      ).join(" · ")}</li>`).join("");
    const blanks = `<ul><li>______________________________</li><li>______________________________</li><li>______________________________</li></ul>`;
    const homeGames = futureOf("home");
    const awayGames = futureOf("away");
    const gamesHTML = !l.includeHomeGames ? "" : `
      <h2>📅 Unsere Termine</h2>
      <p><strong>🏐 Training:</strong> Unser regelmäßiges Training findet <strong>immer donnerstags</strong> statt.</p>
      <p style="margin-bottom:4px"><strong>Heimspiele:</strong></p>
      ${homeGames.length ? `<ul>${dateList(homeGames)}</ul>` : `<p><em>Die Heimspieltermine werden rechtzeitig bekannt gegeben bzw. hier ergänzt:</em></p>${blanks}`}
      <p style="margin-bottom:4px"><strong>Auswärtsspiele:</strong></p>
      ${awayGames.length ? `<ul>${dateList(awayGames)}</ul>` : `<p><em>Die Auswärtstermine werden rechtzeitig bekannt gegeben bzw. hier ergänzt:</em></p>${blanks}`}`;
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
      const bestEmail = pl2 ? (pl2.parentEmail || pl2.playerEmail || "") : "";
      const bestPhone = pl2 ? (pl2.parentPhone || pl2.playerPhone || "") : "";
      const pref = (val, filled) => filled ? `<div class="line">${val} <strong>${esc(filled)}</strong></div>` : `<div class="line">${val}</div>`;
      return `
      <h1>🏐 SKV Müritz – Abteilung Volleyball</h1>
      <div class="sub">www.skv-mueritz.de · ${esc(l.title || "Elternbrief zur Saison")}${l.deadline ? ` · Rückmeldung bis ${fmtDateShort(l.deadline)}` : ""}</div>
      ${pl2 ? `<div class="addr">An die Eltern von <strong>${esc(pl2.firstName)} ${esc(pl2.lastName)}</strong>${parents ? ` – ${esc(parents)}` : ""}${pl2.departmentId ? ` · ${esc(deptName(pl2.departmentId))}` : ""}</div>` : ""}
      <div style="margin-top:22px">${toBodyHTML(pl2)}</div>
      ${gamesHTML}
      <p>Mit sportlichen Grüßen<br><br>_______________________________<br>Trainer, SKV Müritz Volleyball</p>
      ${l.includeSlip ? `
      <div class="cut"></div>
      <div class="slip">
        <strong>Rückmeldung an den Trainer</strong> (${deadlineTxt})
        ${pref("Name des Kindes:", pl2 ? `${pl2.firstName} ${pl2.lastName}` : "")}
        ${pref("Name Erziehungsberechtigte/r:", parents)}
        ${pref("E-Mail-Adresse:", bestEmail)}
        ${pref("Mobilnummer:", bestPhone)}
        <div class="chk">☐ Ich stimme zu, dass der Trainer mich über E-Mail/Telefon kontaktiert.</div>
        <div class="chk">☐ Ich möchte in die WhatsApp-Elterngruppe aufgenommen werden.</div>
        <div class="chk">☐ Ich stehe grundsätzlich als Fahrer/in für Auswärtsspiele zur Verfügung (Plätze: ____ )</div>
        <div class="chk">☐ Ich helfe beim Heimspiel-Buffet (Salat / Brötchen / Kuchen / Getränke – Zutreffendes bitte einkreisen)</div>
        <div class="sign"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte/r</div></div>
      </div>` : ""}`;
    };

    const list = Array.isArray(playersList) && playersList.length ? playersList : [null];
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(l.title || "Elternbrief SKV Müritz")}</title>
      <style>
        body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:44px auto;max-width:720px;line-height:1.55;font-size:14.5px}
        h1{font-size:21px;font-family:Arial,sans-serif;color:#1e3a8a;margin-bottom:0}
        .sub{color:#666;font-family:Arial,sans-serif;font-size:12px;margin-top:2px}
        .addr{font-family:Arial,sans-serif;font-size:13px;margin-top:16px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;background:#f8f8f8}
        h2{font-size:15px;font-family:Arial,sans-serif;color:#1e3a8a;margin:22px 0 6px}
        ul{margin:6px 0;padding-left:22px}
        .cut{border-top:2px dashed #666;margin:30px 0 14px;position:relative}
        .cut::before{content:"✂";position:absolute;top:-11px;left:12px;background:#fff;padding:0 6px;color:#666}
        .slip{font-family:Arial,sans-serif;font-size:13px;border:1px solid #999;border-radius:8px;padding:16px}
        .slip .line{border-bottom:1px solid #333;margin:16px 0 4px;padding-bottom:2px}
        .chk{margin:8px 0}
        .sign{margin-top:34px;display:flex;gap:50px}.sign div{border-top:1px solid #333;padding-top:4px;font-size:11.5px;flex:1;font-family:Arial,sans-serif}
        .pagebreak{page-break-after:always}
        @media print { body{margin:12mm} }
      </style></head><body>
      ${list.map((pl2, i) => oneLetter(pl2) + (i < list.length - 1 ? '<div class="pagebreak"></div>' : "")).join("")}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken", "bad"); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
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
        <div class="field mb"><label>Abteilung</label><select id="slDept">
          <option value="">alle Abteilungen</option>
          ${s.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
        <div class="list" id="slList" style="max-height:300px;overflow-y:auto">
          ${active.map((p) => `
            <label class="list-item" data-dept="${esc(p.departmentId || "")}" style="cursor:pointer;padding:8px 10px">
              <input type="checkbox" data-slp="${p.id}" checked style="width:auto">
              <div class="grow"><div class="title" style="font-size:.88rem">${esc(p.firstName)} ${esc(p.lastName)}</div>
              <div class="sub">${esc(deptName(p.departmentId))} · ${esc(p.parentName || "ohne Elternkontakt")}</div></div>
            </label>`).join("")}
        </div>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>🖨️ Serienbrief drucken</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("#slDept").onchange = (ev) => {
          const dep = ev.target.value;
          m.querySelectorAll("#slList label").forEach((row) => {
            const match = !dep || row.dataset.dept === dep;
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
        <div class="field full"><label>Datei (PDF/Bild)</label>
          <label class="file-drop" id="fd">📎 Klicken zum Auswählen<div class="sub" id="fdname"></div>
          <input type="file" name="file" accept="application/pdf,image/*" hidden></label></div>
      </div><p class="muted" style="font-size:.8rem">Die Datei wird lokal im Browser gespeichert (DSGVO-konform ohne Server). Für den Vereinsbetrieb kann eine sichere Serverablage angebunden werden.</p></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        const fileInput = m.querySelector('input[name="file"]');
        m.querySelector("#fd").onclick = () => fileInput.click();
        let dataUrl = null, fileName = "";
        fileInput.onchange = () => {
          const f = fileInput.files[0]; if (!f) return;
          if (f.size > 4 * 1024 * 1024) { toast("Datei zu groß (max. 4 MB)", "bad"); return; }
          fileName = f.name; m.querySelector("#fdname").textContent = f.name;
          const rd = new FileReader(); rd.onload = () => dataUrl = rd.result; rd.readAsDataURL(f);
        };
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const d = formData(m.querySelector("#cf"));
          if (!fileName && !d.signedBy) { toast("Bitte Datei oder Unterschrift angeben", "bad"); return; }
          Store.add("consents", { playerId: d.playerId, type: d.type, signedBy: d.signedBy || "—",
            fileName: fileName || "manuell_erfasst.txt", dataUrl, uploadedAt: new Date().toISOString() });
          Store.update("players", d.playerId, { consentOnFile: true });
          closeModal(); toast("Einverständnis abgelegt", "good"); reload();
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
          <div class="list-item">${avatar(p.firstName, p.lastName)}
            <div class="grow"><div class="title">${esc(p.firstName)} ${esc(p.lastName)}</div>
            <div class="sub">${p.inDays === 0 ? "🎂 heute!" : fmtDateShort(p.next)} · wird ${p.turns}</div></div></div>`).join("")}</div></div>` : ""}
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Spieler</th><th>Geburtstag</th><th>Alter</th><th>Nächster</th><th>In Tagen</th></tr></thead>
        <tbody>${all.map((p) => `<tr>
          <td><div class="flex">${avatar(p.firstName, p.lastName)}<strong>${esc(p.firstName)} ${esc(p.lastName)}</strong></div></td>
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
            <div class="img">${clothingSVG(c.kind, c.color)}</div>
            <div class="body">
              <div class="flex"><strong>${esc(c.name)}</strong><span class="spacer"></span><span class="price">${fmtMoney(c.price)}</span></div>
              <p class="soft" style="font-size:.85rem;margin:0">${esc(c.description)}</p>
              <div class="chip-row" style="gap:5px">${c.sizes.map((sz) => `<span class="badge">${esc(sz)}</span>`).join("")}</div>
              <button class="btn sm mt" data-req="${c.id}">🛒 Anfordern</button>
            </div></div>`).join("")}
      </div>

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
              <dt>Web</dt><dd>${sp.website ? `<a href="${esc(sp.website)}" target="_blank" rel="noopener">Website ↗</a>` : "—"}</dd>
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
        ${stat("⭐", "Punkte SKV", (rows.find((r) => /skv/i.test(r.team)) || {}).points ?? "—")}
        ${stat("🎽", "Spiele", (rows.find((r) => /skv/i.test(r.team)) || {}).games ?? "—")}
        ${stat("📈", "Satzverhältnis", (() => { const t = rows.find((r) => /skv/i.test(r.team)); return t ? `${t.setsW}:${t.setsL}` : "—"; })())}
      </div>

      <div class="grid cols-wide">
        <div class="card" style="padding:0">
          <div class="card-head" style="padding:18px 18px 0"><h3>📊 Tabelle Verbandsliga MV</h3></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Team</th><th>Sp.</th><th>S</th><th>N</th><th>Sätze</th><th class="right">Pkt.</th></tr></thead>
            <tbody>${rows.map((r, i) => `<tr style="${/skv/i.test(r.team) ? "background:color-mix(in srgb,var(--accent) 10%,transparent)" : ""}">
              <td><strong>${i + 1}</strong></td>
              <td>${/skv/i.test(r.team) ? "🏐 " : ""}<strong>${esc(r.team)}</strong></td>
              <td>${r.games}</td><td>${r.win}</td><td>${r.loss}</td>
              <td class="soft">${r.setsW}:${r.setsL}</td>
              <td class="right"><strong>${r.points}</strong></td></tr>`).join("")}</tbody>
          </table></div>
          <p class="muted" style="padding:12px 18px;font-size:.78rem">Beispieldaten – für Live-Stände bitte den offiziellen SAMS-Spielbetrieb des VVMV verlinken.</p>
        </div>

        <div class="card">
          <div class="card-head"><h3>🔗 Links</h3><span class="spacer"></span>
            <button class="btn sm" data-lkadd>＋ Link</button></div>
          <div class="list">${linkListHTML()}</div>
        </div>
      </div>`;
    bindLinkActions(el);
  }

  /* ======================================================================
     WIKI (Volleyball erklärt)
     ====================================================================== */
  function wiki(el) {
    const articles = [
      { id: "grundlagen", h: "🏐 Grundlagen & Ziel des Spiels", html: `
        <p>Volleyball wird von zwei Teams zu je sechs Spieler über ein Netz gespielt. Ziel ist es, den Ball so über das Netz ins gegnerische Feld zu spielen, dass ihn die Gegnerinnen nicht regelkonform zurückspielen können. Ein Team darf den Ball maximal <strong>dreimal</strong> berühren (plus möglicher Block), bevor er über das Netz muss.</p>
        <ul><li>Feldgröße: 18 × 9 Meter, geteilt durch das Netz.</li>
        <li>Netzhöhe: 2,24 m (Damen) bzw. 2,43 m (Herren).</li>
        <li>Ein Satz wird bis <strong>25 Punkte</strong> gespielt (mind. 2 Punkte Vorsprung).</li>
        <li>Gewonnen hat, wer zuerst <strong>3 Sätze</strong> gewinnt (Tie-Break bis 15).</li></ul>` },
      { id: "zaehlweise", h: "🔢 Zählweise (Rally-Point-System)", html: `
        <p>Es gilt das Rally-Point-System: <strong>Jeder Ballwechsel</strong> bringt einen Punkt – egal welches Team aufgeschlagen hat. Gewinnt das annehmende Team den Ballwechsel, erhält es den Punkt <em>und</em> das Aufschlagrecht (Seitenwechsel der Aufschlagreihe → „Rotation").</p>` },
      { id: "positionen", h: "📍 Positionen & Rotation", html: `
        <p>Auf dem Feld stehen sechs Positionen. Nach Gewinn des Aufschlagrechts rotieren alle im Uhrzeigersinn um eine Position.</p>
        <ul>
        <li><strong>Zuspiel (Steller):</strong> organisiert den Angriff, spielt den zweiten Ball.</li>
        <li><strong>Außenangriff (Annahme/Außen):</strong> Hauptangriff über Position 4, stark in der Annahme.</li>
        <li><strong>Mittelblocker (Mitte):</strong> blockt in der Mitte, schnelle Angriffe.</li>
        <li><strong>Diagonal:</strong> Hauptangreiferin gegenüber dem Zuspiel.</li>
        <li><strong>Libero:</strong> Abwehrspezialistin (anderes Trikot), darf nicht angreifen/aufschlagen im Vorderfeld.</li></ul>` },
      { id: "techniken", h: "🖐️ Grundtechniken", html: `
        <ul>
        <li><strong>Pritschen (oberes Zuspiel):</strong> Ball wird mit den Fingerspitzen über dem Kopf gespielt – Basis des Zuspiels.</li>
        <li><strong>Baggern (unteres Zuspiel):</strong> Ball wird mit den gestreckten Unterarmen angenommen – für Aufschlagannahme und Abwehr.</li>
        <li><strong>Aufschlag (Service):</strong> von unten (Kinder/Anfänger) oder von oben (Tennisaufschlag, Sprungaufschlag).</li>
        <li><strong>Angriff (Schmetterschlag):</strong> Anlauf, Absprung, Schlag über das Netz.</li>
        <li><strong>Block:</strong> Sprung an der Netzkante, um den Angriff abzuwehren.</li></ul>` },
      { id: "regeln", h: "⚖️ Wichtige Regeln & typische Fehler", html: `
        <ul>
        <li><strong>Vierschlag:</strong> Ball mehr als dreimal berührt (Block zählt nicht mit).</li>
        <li><strong>Doppelberührung:</strong> zweimal hintereinander durch dieselbe Spieler (außer beim Block).</li>
        <li><strong>Netzberührung</strong> im Spielgeschehen ist ein Fehler.</li>
        <li><strong>Übertreten der Mittellinie</strong> mit dem ganzen Fuß.</li>
        <li><strong>Rotationsfehler:</strong> falsche Position beim Aufschlag.</li>
        <li><strong>Fußfehler</strong> beim Aufschlag (Übertreten der Grundlinie).</li></ul>` },
      { id: "training", h: "🎯 Trainingsaufbau (für Trainer)", html: `
        <p>Ein ausgewogenes Jugendtraining kombiniert Technik, Spielformen und Athletik:</p>
        <ul>
        <li><strong>Aufwärmen (15 min):</strong> Lauf-ABC, Ballgewöhnung, Mobilisation.</li>
        <li><strong>Technikblock (25 min):</strong> Fokus auf 1–2 Techniken, viele Wiederholungen.</li>
        <li><strong>Spielformen (30 min):</strong> Kleinfeld 2:2/3:3, Situationsspiele.</li>
        <li><strong>Abschlussspiel (15 min):</strong> 6:6 mit Aufgabenstellung.</li>
        <li><strong>Cool-down (5 min):</strong> Dehnen, Feedback, Ausblick.</li></ul>` },
      { id: "begriffe", h: "📖 Glossar", html: `
        <dl class="kv">
        <dt>Ass</dt><dd>Direkter Punkt durch den Aufschlag.</dd>
        <dt>Block</dt><dd>Abwehr des gegnerischen Angriffs am Netz.</dd>
        <dt>Dig</dt><dd>Abwehr eines harten Angriffsballs.</dd>
        <dt>Lob / Finte</dt><dd>Angetäuschter Angriff, Ball wird kurz gelegt.</dd>
        <dt>Side-Out</dt><dd>Das annehmende Team gewinnt den Ballwechsel.</dd>
        <dt>Tie-Break</dt><dd>Entscheidungssatz bis 15 Punkte.</dd></dl>` },
    ];

    el.innerHTML = `
      ${head("Volleyball-Wiki", "Regeln, Techniken und Begriffe – ideal für neue Spieler und Eltern")}
      <div class="grid cols-toc">
        <div class="card wiki-toc" style="position:sticky;top:80px">
          <h3 style="font-size:.9rem">Inhalt</h3>
          ${articles.map((a) => `<a href="#/wiki" data-goto="${a.id}">${esc(a.h)}</a>`).join("")}
          <hr style="border:none;border-top:1px solid var(--border);margin:10px 0">
          <a href="https://www.volleyball-verband.de/regelwerk" target="_blank" rel="noopener">📘 Offizielles Regelwerk (DVV) ↗</a>
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
    $$("[data-tdone]", el).forEach((cb) => cb.onchange = () => { Store.update("tasks", cb.dataset.tdone, { done: cb.checked }); reload(); });
    $$("[data-tdel]", el).forEach((b) => b.onclick = () => { Store.remove("tasks", b.dataset.tdel); toast("Gelöscht"); reload(); });
  }
  function taskRow(t) {
    const overdue = !t.done && daysUntil(t.due) < 0;
    return `<label class="list-item" style="cursor:pointer">
      <input type="checkbox" data-tdone="${t.id}" ${t.done ? "checked" : ""} style="width:auto">
      <div class="grow"><div class="title" style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</div>
        <div class="sub">${t.done ? "erledigt" : `fällig ${relDays(t.due)}`} · ${prioBadge(t.priority)} ${overdue ? '<span class="badge bad">überfällig</span>' : ""}</div></div>
      <button class="btn sm ghost" data-tdel="${t.id}">🗑️</button></label>`;
  }
  function taskForm() {
    modal({
      title: "Neue Aufgabe",
      body: `<form id="tf"><div class="form-grid">
        <div class="field full"><label>Aufgabe</label><input name="title" required></div>
        <div class="field"><label>Fällig am</label><input type="date" name="due" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Priorität</label><select name="priority"><option>hoch</option><option selected>mittel</option><option>niedrig</option></select></div>
      </div></form>`,
      footer: `<button class="btn ghost" data-x>Abbrechen</button><button class="btn" data-s>Speichern</button>`,
      onOpen(m) {
        m.querySelector("[data-x]").onclick = closeModal;
        m.querySelector("[data-s]").onclick = () => {
          const f = m.querySelector("#tf"); if (!f.reportValidity()) return;
          const d = formData(f); d.due = new Date(d.due).toISOString(); d.done = false;
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
      ${head("Abteilungen & Mannschaften", `Alle Teams des ${esc(s.club)} – Aktive, Jugend, Nachwuchs und Breitensport`, `<button class="btn" data-add>＋ Abteilung</button>`)}
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
            const members = s.players.filter((p) => p.departmentId === d.id).length;
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
      const members = S().players.filter((p) => p.departmentId === d.id).length;
      confirmDialog(`Abteilung „${d.name}" löschen?${members ? ` ${members} Spieler(nen) verlieren die Zuordnung.` : ""}`, () => {
        S().players.forEach((p) => { if (p.departmentId === d.id) Store.update("players", p.id, { departmentId: null }); });
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
      <a class="link-card mb" href="https://mv.sams-ticket.de/public/" target="_blank" rel="noopener">
        <span class="ic">🌐</span><div class="grow"><div class="title">VVMV Meldeportal (SAMS)</div>
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
          const roster = S().players.filter((p) => p.departmentId === data.departmentId && p.membershipStatus !== "inaktiv");
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
      .sort((a, b) => (a.departmentId === m.departmentId ? -1 : 1) - (b.departmentId === m.departmentId ? -1 : 1) || a.lastName.localeCompare(b.lastName));
    if (!avail.length) { toast("Alle Spieler sind bereits gemeldet"); return; }
    modal({
      title: "Spieler zur Meldung hinzufügen",
      body: `<div class="list">${avail.map((p) => `
        <label class="list-item" style="cursor:pointer">${avatar(p.firstName, p.lastName)}
          <div class="grow"><div class="title">${esc(p.firstName)} ${esc(p.lastName)}</div>
          <div class="sub">Jg. ${jahrgang(p.birthDate)} · ${esc(deptName(p.departmentId))} · ${esc(p.passNumber || "ohne Pass-Nr.")}</div></div>
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
    $("[data-empty]", el).onclick = () => confirmDialog("Alle Daten löschen und leer starten (Struktur bleibt)?", () => {
      Store.resetEmpty(); toast("Leer zurückgesetzt", "good"); reload();
    }, "Zurücksetzen");
    $("[data-demo]", el).onclick = () => confirmDialog("Alle Daten durch Demo-Beispieldaten ersetzen?", () => {
      Store.resetDemo(); toast("Demo-Daten geladen", "good"); reload();
    }, "Laden");
  }

  // ---- Export ----
  window.Views = {
    dashboard, players, departments, calendar, training, drivers, jobs, consents,
    birthdays, finances, clothing, sponsors, standings, wiki,
    announcements, tasks, inventory, verbandsmeldung, backup,
  };
})();
