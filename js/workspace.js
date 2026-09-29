"use strict";

/* ==========================================================================
   Riviera — My Workspace

   Local-first: everything is stored in this browser (localStorage, one key).
   No account, no server. Available from every page via the header button.

   ONE generic object serves every calculator. Saving, comparing, printing and
   exporting all read this shape, so a new calculator is saveable and
   exportable with no extra code:

     {
       id, timestamp,                          // added by Workspace
       calculatorId, calculatorName,           // catalogue id and display name
       name,                                   // the user's own title (defaults to calculatorName)
       inputs:  [{ label, value, unit?, display? }],   value = raw, display = as shown
       outputs: [{ label, value, unit?, display? }],
       assumptions:    [string],
       interpretation: [string],
       notes: string
     }

   Stored state: { version, name, items: [ ...the objects above ] }
   Reading corrupt data throws; the drawer shows the error and offers Clear.
   All text is treated as untrusted and escaped wherever it is displayed.
   The storage key keeps its original name so existing data is not lost.
   ========================================================================== */

const Workspace = {
  KEY: "calcwise.workspace",
  VERSION: 1,
  dialog: null,

  /* ---- Data --------------------------------------------------------------- */

  emptyState() {
    return { version: Workspace.VERSION, name: "My workspace", items: [] };
  },

  isItem(item) {
    const text = (v) => typeof v === "string";
    const rows = (v) => Array.isArray(v) && v.every((r) => r && text(r.label) && (text(r.value) || typeof r.value === "number"));
    return Boolean(item) && text(item.id) && text(item.timestamp) && text(item.calculatorId) && text(item.calculatorName) && text(item.name)
      && rows(item.inputs) && rows(item.outputs) && Array.isArray(item.assumptions) && Array.isArray(item.interpretation) && text(item.notes);
  },

  load() {
    const raw = localStorage.getItem(Workspace.KEY);
    if (raw === null) return Workspace.emptyState();
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new Error("The saved data is not valid JSON.");
    }
    if (!state || state.version !== Workspace.VERSION || typeof state.name !== "string" || !Array.isArray(state.items) || !state.items.every(Workspace.isItem)) {
      throw new Error("The saved data has an unexpected format.");
    }
    return state;
  },

  write(state) {
    localStorage.setItem(Workspace.KEY, JSON.stringify(state));
    document.dispatchEvent(new CustomEvent("workspace:change"));
  },

  // Rows are { label, value, unit?, display? }. Returns clean copies so nothing else is stored.
  cleanRows(rows, field, { allowEmpty }) {
    if (!Array.isArray(rows) || (!allowEmpty && !rows.length)) throw new Error(`Workspace.save: ${field} must be ${allowEmpty ? "an array" : "a non-empty array"}`);
    return rows.map((row) => {
      if (!row || typeof row.label !== "string" || !row.label.trim()) throw new Error(`Workspace.save: every ${field} row needs a label`);
      if (typeof row.value !== "string" && typeof row.value !== "number") throw new Error(`Workspace.save: ${field} "${row.label}" needs a string or number value`);
      const clean = { label: row.label, value: row.value };
      if (row.unit) clean.unit = String(row.unit);
      if (row.display !== undefined) clean.display = String(row.display);
      return clean;
    });
  },

  cleanStrings(list, field) {
    if (!Array.isArray(list) || !list.every((s) => typeof s === "string")) throw new Error(`Workspace.save: ${field} must be a list of text`);
    return [...list];
  },

  // Validates a calculation and stamps it with an id and time. Used by save() and by exports.
  record(calculation) {
    const c = calculation;
    if (!c || typeof c.calculatorId !== "string" || !c.calculatorId || typeof c.calculatorName !== "string" || !c.calculatorName.trim()) {
      throw new Error("Workspace.save: calculatorId and calculatorName are required");
    }
    if (c.notes !== undefined && typeof c.notes !== "string") throw new Error("Workspace.save: notes must be text");
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      calculatorId: c.calculatorId,
      calculatorName: c.calculatorName,
      name: (typeof c.name === "string" && c.name.trim() ? c.name.trim() : c.calculatorName).slice(0, 80),
      inputs: Workspace.cleanRows(c.inputs, "inputs", { allowEmpty: true }),
      outputs: Workspace.cleanRows(c.outputs, "outputs", { allowEmpty: false }),
      assumptions: Workspace.cleanStrings(c.assumptions ?? [], "assumptions"),
      interpretation: Workspace.cleanStrings(c.interpretation ?? [], "interpretation"),
      notes: (c.notes ?? "").slice(0, 200),
    };
  },

  save(calculation) {
    const item = Workspace.record(calculation);
    const state = Workspace.load();
    state.items.push(item);
    Workspace.write(state);
    return item.id;
  },

  remove(id) {
    const state = Workspace.load();
    if (!state.items.some((i) => i.id === id)) throw new Error(`Workspace.remove: no saved calculation "${id}"`);
    state.items = state.items.filter((i) => i.id !== id);
    Workspace.write(state);
  },

  rename(name) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Workspace.rename: name is required");
    const state = Workspace.load();
    state.name = name.trim();
    Workspace.write(state);
  },

  clear() {
    localStorage.removeItem(Workspace.KEY);
    document.dispatchEvent(new CustomEvent("workspace:change"));
  },

  /* ---- Export (generic: reads saved calculation objects only) ---------------- */

  // items defaults to everything saved. filename defaults to one made from the workspace name.
  exportCSV(items, filename) {
    const state = Workspace.load();
    const list = items ?? state.items;
    if (!list.length) throw new Error("Workspace.exportCSV: there is nothing to export");

    // Text cells that start with = + - @ are prefixed so spreadsheets do not run them as formulas.
    const cell = (v) => {
      let s = v === undefined ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = [["Workspace", "Calculation", "Calculator", "Saved", "Type", "Label", "Value", "Unit"]];
    for (const item of list) {
      const base = [state.name, item.name, item.calculatorId, item.timestamp];
      for (const [type, group] of [["Input", item.inputs], ["Result", item.outputs]]) {
        for (const r of group) rows.push([...base, type, r.label, r.value, r.unit]);
      }
      for (const text of item.assumptions) rows.push([...base, "Assumption", "", text, ""]);
      for (const text of item.interpretation) rows.push([...base, "Meaning", "", text, ""]);
      if (item.notes) rows.push([...base, "Note", "", item.notes, ""]);
    }
    // BOM so Excel reads UTF-8 correctly.
    const csv = "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = filename || `riviera-${slug || "workspace"}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  },

  // Prints the drawer only (see @media print in style.css). Browsers offer "Save as PDF" here.
  print() {
    window.print();
  },

  /* ---- Drawer ------------------------------------------------------------- */

  init() {
    const dialog = document.createElement("dialog");
    dialog.className = "workspace";
    dialog.setAttribute("aria-label", "My Workspace");
    dialog.innerHTML = `
      <div class="workspace__head">
        <div class="workspace__bar">
          <h2 class="workspace__title" tabindex="-1">My Workspace</h2>
          <button type="button" class="btn btn--quiet" data-ws-close>Close</button>
        </div>
        <label class="workspace__label" for="ws-name">Workspace name</label>
        <input id="ws-name" class="workspace__name" type="text" maxlength="60" autocomplete="off">
      </div>
      <div class="workspace__body" data-ws-body></div>
      <div class="workspace__actions">
        <button type="button" class="btn btn--outline" data-ws-print>Print or save as PDF</button>
        <button type="button" class="btn btn--outline" data-ws-csv>Download CSV</button>
        <button type="button" class="btn btn--quiet btn--danger" data-ws-clear>Clear</button>
      </div>`;
    document.body.append(dialog);
    Workspace.dialog = dialog;

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-ws-close]")) dialog.close();
      if (e.target.closest("[data-ws-print]")) Workspace.print();
      if (e.target.closest("[data-ws-csv]")) Workspace.exportCSV();
      if (e.target.closest("[data-ws-clear]") && window.confirm("Remove everything saved in this workspace?")) Workspace.clear();
      const remove = e.target.closest("[data-ws-remove]");
      if (remove) {
        Workspace.remove(remove.dataset.wsRemove);
        dialog.querySelector(".workspace__title").focus();
      }
    });

    dialog.querySelector("#ws-name").addEventListener("change", (e) => {
      if (e.target.value.trim()) Workspace.rename(e.target.value);
      else Workspace.refresh(); // blank names are not allowed: show the stored name again
    });

    document.addEventListener("workspace:change", Workspace.refresh);
    window.addEventListener("storage", (e) => {
      if (e.key === Workspace.KEY || e.key === null) Workspace.refresh();
    });
    Workspace.refresh();
  },

  open() {
    if (!Workspace.dialog.open) Workspace.dialog.showModal();
  },

  refresh() {
    const dialog = Workspace.dialog;
    const body = dialog.querySelector("[data-ws-body]");
    const csvButton = dialog.querySelector("[data-ws-csv]");
    const printButton = dialog.querySelector("[data-ws-print]");
    const nameInput = dialog.querySelector("#ws-name");
    let state;

    try {
      state = Workspace.load();
    } catch (err) {
      console.error(err);
      body.innerHTML = App.errorBox("Your saved workspace could not be read.", `${err.message} Use Clear to remove it and start again.`);
      csvButton.disabled = printButton.disabled = true;
      nameInput.disabled = true;
      Workspace.updateBadge(0);
      return;
    }

    nameInput.disabled = false;
    nameInput.value = state.name;
    csvButton.disabled = printButton.disabled = !state.items.length;
    Workspace.updateBadge(state.items.length);

    if (!state.items.length) {
      body.innerHTML = `<div class="empty">
        <strong class="empty__title">Nothing saved yet</strong>
        <p class="empty__text">Save a calculation from any calculator and it will appear here. You can then print it or download it as a CSV file.</p>
      </div><p class="workspace__note">Your workspace stays on this device. Nothing is uploaded.</p>`;
      return;
    }

    const rows = (list) => list.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.display ?? r.value)}${r.unit ? ` ${esc(r.unit)}` : ""}</dd></div>`).join("");
    const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

    body.innerHTML = `<ul class="ws-list">${state.items
      .map((item) => `<li class="ws-item">
        <div class="ws-item__head">
          <div><span class="ws-item__name">${esc(item.name)}</span><span class="ws-item__date">${item.name !== item.calculatorName ? `${esc(item.calculatorName)} &middot; ` : ""}Saved ${esc(date(item.timestamp))}</span></div>
          <button type="button" class="btn btn--quiet" data-ws-remove="${esc(item.id)}" aria-label="Remove ${esc(item.name)} from workspace">Remove</button>
        </div>
        <p class="ws-item__heading">Result</p><dl class="ws-rows">${rows(item.outputs)}</dl>
        ${item.inputs.length ? `<p class="ws-item__heading">Inputs</p><dl class="ws-rows">${rows(item.inputs)}</dl>` : ""}
        ${item.notes ? `<p class="ws-item__heading">Note</p><p class="ws-item__note">${esc(item.notes)}</p>` : ""}
      </li>`)
      .join("")}</ul><p class="workspace__note">Your workspace stays on this device. Nothing is uploaded.</p>`;
  },

  updateBadge(count) {
    document.querySelectorAll("[data-workspace-count]").forEach((badge) => {
      badge.hidden = count === 0;
      badge.innerHTML = `${count}<span class="visually-hidden"> saved</span>`;
    });
  },
};
