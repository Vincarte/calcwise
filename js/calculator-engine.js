"use strict";

/* ==========================================================================
   Riviera — calculator engine

   The engine turns a calculator DEFINITION (js/calculators.js) into a working
   calculator. It contains no calculator-specific code. Improve something here
   and every calculator benefits.

   PIPELINE
     raw form text  ->  Engine.parse     (required, numeric, range checks)
                    ->  def.validate     (invalid combinations)
                    ->  Engine.calculate (deterministic maths from the definition)
                    ->  Engine.describe  (formatted results, inputs, steps, meaning)
   Engine.run() performs the whole pipeline and needs no DOM, so it can be
   tested and reused (for example by a future assistant layer) without the UI.

   The maths (def.calculate) never formats text or interprets. Interpretation
   lives in def.interpret and runs after the numbers exist.

   CURRENT DATA: calculate() receives plain values. A price or rate is an
   ordinary input today. A future data source can pre-fill an input without
   the calculation changing.
   ========================================================================== */

const Engine = {
  INPUT_TYPES: ["number", "numberlist", "text", "textarea", "date", "select"],
  OUTPUT_FORMATS: ["number", "text"],
  MAX_ABS: 1e15,
  NUMBER_RE: /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
  GROUPED_RE: /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/,

  /* ---- Formatting ---------------------------------------------------------- */

  // Fixed locale ("en") so results read the same on every device.
  // decimals = exactly this many; otherwise up to maxDecimals (default 6).
  fmt(value, { decimals, maxDecimals = 6 } = {}) {
    if (!Number.isFinite(value)) throw new Error("Engine.fmt: value is not a finite number");
    const max = decimals ?? maxDecimals;
    const min = decimals ?? 0;
    const zero = Math.abs(value) < 0.5 * 10 ** -max; // never print "-0.00"
    return new Intl.NumberFormat("en", { minimumFractionDigits: min, maximumFractionDigits: max }).format(zero ? 0 : value);
  },

  formatOutput(output, value) {
    return output.format === "text" ? String(value) : Engine.fmt(value, output);
  },

  formatInput(input, value) {
    if (value === undefined) return "not given";
    const type = input.type || "number";
    if (type === "select") return input.options.find((o) => o.value === value).label;
    if (type === "number") return Engine.fmt(value, { maxDecimals: 6 });
    if (type === "numberlist") return value.length <= 12 ? value.join(", ") : `${value.slice(0, 12).join(", ")} … (${value.length} numbers)`;
    return String(value);
  },

  // The value stored in the Workspace: a number, or text for everything else.
  storedInput(input, value) {
    if (value === undefined) return "";
    return (input.type || "number") === "numberlist" ? value.join(", ") : value;
  },

  /* ---- Parsing and validation ---------------------------------------------- */

  // Accepts 1250.5 and 1,250.5 (valid thousands grouping only). "1,5" is rejected on
  // purpose: it could mean one and a half or fifteen.
  parseNumberText(raw) {
    const text = raw.trim();
    const cleaned = Engine.GROUPED_RE.test(text) ? text.replace(/,/g, "") : text;
    if (!Engine.NUMBER_RE.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  },

  boundsError(input, n) {
    const label = `“${input.label}”`;
    const unit = input.unit ? ` ${input.unit}` : "";
    const show = (v) => Engine.fmt(v, { maxDecimals: 6 });
    if (Math.abs(n) > Engine.MAX_ABS) return `${label} is too large. Enter a number below ${show(Engine.MAX_ABS)}.`;
    if (input.integer && !Number.isInteger(n)) return `${label} must be a whole number.`;
    if (input.gt !== undefined && !(n > input.gt)) return `${label} must be greater than ${show(input.gt)}${unit}.`;
    if (input.min !== undefined && n < input.min) return `${label} must be at least ${show(input.min)}${unit}.`;
    if (input.max !== undefined && n > input.max) return `${label} must be at most ${show(input.max)}${unit}.`;
    return null;
  },

  // Returns { value } or { error }.
  parseInput(input, raw) {
    const label = `“${input.label}”`;
    const text = (raw ?? "").trim();
    const type = input.type || "number";
    if (!text) return input.required === false ? { value: undefined } : { error: `Enter a value for ${label}.` };

    if (type === "select") {
      return input.options.some((o) => o.value === text) ? { value: text } : { error: `Choose one of the listed options for ${label}.` };
    }
    if (type === "text" || type === "textarea") return { value: text };
    if (type === "date") {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text));
      return valid ? { value: text } : { error: `Enter ${label} as a valid date.` };
    }
    if (type === "number") {
      const n = Engine.parseNumberText(text);
      if (n === null) return { error: `${label} must be a number, for example 1250.5. Use a full stop for decimals and no letters or symbols.` };
      const problem = Engine.boundsError(input, n);
      return problem ? { error: problem } : { value: n };
    }
    // numberlist: numbers separated by spaces, commas, semicolons or new lines.
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    const bad = tokens.filter((t) => !Engine.NUMBER_RE.test(t) || !Number.isFinite(Number(t)));
    if (bad.length) {
      const shown = bad.slice(0, 5).map((t) => `“${t}”`).join(", ");
      return { error: `${label} contains entries that are not numbers: ${shown}${bad.length > 5 ? " and more" : ""}. Separate numbers with spaces, commas or new lines, and use a full stop for decimals.` };
    }
    const numbers = tokens.map(Number);
    const minCount = input.minCount ?? 1;
    const maxCount = input.maxCount ?? 10000;
    if (numbers.length < minCount) return { error: `Enter at least ${minCount} ${minCount === 1 ? "number" : "numbers"} in ${label}.` };
    if (numbers.length > maxCount) return { error: `${label} can hold at most ${maxCount} numbers.` };
    if (numbers.some((n) => Math.abs(n) > Engine.MAX_ABS)) return { error: `${label} contains a number that is too large.` };
    return { value: numbers };
  },

  // raw: { inputId: text }. Returns { values, errors: [{ field, message }] }.
  parse(def, raw) {
    const values = {};
    const errors = [];
    for (const input of def.inputs) {
      const parsed = Engine.parseInput(input, raw[input.id]);
      if (parsed.error) errors.push({ field: input.id, message: parsed.error });
      else values[input.id] = parsed.value;
    }
    return { values, errors };
  },

  calculate(def, values) {
    const results = def.calculate(values);
    for (const output of def.outputs) {
      const v = results[output.id];
      const valid = output.format === "text" ? typeof v === "string" : Number.isFinite(v);
      if (!valid) throw new Error(`Calculator "${def.id}" produced an invalid value for output "${output.id}"`);
    }
    return results;
  },

  // Everything the UI, Workspace and exports need, derived once.
  describe(def, values, results) {
    return {
      outputs: def.outputs.map((o) => ({ id: o.id, label: o.label, unit: o.unit, primary: Boolean(o.primary), value: results[o.id], display: Engine.formatOutput(o, results[o.id]) })),
      inputs: def.inputs.map((i) => ({ id: i.id, label: i.label, unit: i.unit, value: Engine.storedInput(i, values[i.id]), display: Engine.formatInput(i, values[i.id]) })),
      steps: def.steps ? def.steps(values, results) : [],
      interpretation: def.interpret ? def.interpret(values, results) : [],
    };
  },

  // The whole pipeline. Returns { ok: false, errors } or { ok: true, values, results, outputs, inputs, steps, interpretation }.
  run(def, raw) {
    const { values, errors } = Engine.parse(def, raw);
    if (errors.length) return { ok: false, errors };
    const combined = def.validate ? def.validate(values) : [];
    if (combined.length) return { ok: false, errors: combined };
    const results = Engine.calculate(def, values);
    return { ok: true, values, results, ...Engine.describe(def, values, results) };
  },

  /* ---- Saved calculations ---------------------------------------------------- */

  // The generic object the Workspace stores and exports (see js/workspace.js).
  toCalculation(def, outcome, { name, notes }) {
    const row = ({ label, value, unit, display }) => ({ label, value, unit, display });
    return {
      calculatorId: def.id,
      calculatorName: def.name,
      name: name || def.name,
      inputs: outcome.inputs.map(row),
      outputs: outcome.outputs.map(row),
      assumptions: def.assumptions,
      interpretation: outcome.interpretation,
      notes: notes || "",
    };
  },

  // HTML table comparing the current calculation with saved ones for the same calculator.
  compare(current, saved) {
    const cols = [{ title: "This calculation", item: current }, ...saved.map((s) => ({ title: s.name, item: s }))];
    const cell = (item, list, label) => {
      const row = item[list].find((r) => r.label === label);
      return row ? `${esc(row.display ?? row.value)}${row.unit ? ` ${esc(row.unit)}` : ""}` : "&ndash;";
    };
    const section = (heading, list) => {
      const labels = [...new Set(cols.flatMap((c) => c.item[list].map((r) => r.label)))];
      return `<tr class="compare__section"><th scope="colgroup" colspan="${cols.length + 1}">${heading}</th></tr>${labels
        .map((label) => `<tr><th scope="row">${esc(label)}</th>${cols.map((c) => `<td>${cell(c.item, list, label)}</td>`).join("")}</tr>`)
        .join("")}`;
    };
    return `<div class="compare__scroll"><table class="compare__table">
      <caption class="visually-hidden">Comparison of this calculation with saved calculations</caption>
      <thead><tr><th scope="col"><span class="visually-hidden">Item</span></th>${cols.map((c) => `<th scope="col">${esc(c.title)}</th>`).join("")}</tr></thead>
      <tbody>${section("Results", "outputs")}${section("Inputs", "inputs")}</tbody>
    </table></div>`;
  },

  /* ---- Page metadata (generated from the definition) --------------------------- */

  applyMeta(def) {
    const title = def.seoTitle || `${def.name} | ${SITE.name}`;
    const description = def.seoDescription || def.question;
    const url = App.url(App.toolUrl(def.id));
    document.title = title;
    App.setHead('meta[name="description"]', "meta", { name: "description", content: description });
    App.setHead('link[rel="canonical"]', "link", { rel: "canonical", href: url });
    App.setHead('meta[property="og:title"]', "meta", { property: "og:title", content: title });
    App.setHead('meta[property="og:description"]', "meta", { property: "og:description", content: description });
    App.setHead('meta[property="og:url"]', "meta", { property: "og:url", content: url });
    App.setJsonLd({
      "@context": "https://schema.org", "@type": "WebPage", name: def.name, description, url,
      isPartOf: { "@type": "WebSite", name: SITE.fullName, url: App.url("") },
      breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: App.url("") },
        { "@type": "ListItem", position: 2, name: "Calculators", item: App.url("calculators.html") },
        { "@type": "ListItem", position: 3, name: def.name, item: url } ] },
    });
  },

  /* ---- Calculator UI --------------------------------------------------------- */

  // One form control per input descriptor. Labels are always real <label>s.
  inputField(input) {
    const id = `field-${input.id}`;
    const type = input.type || "number";
    const initial = input.default !== undefined ? String(input.default) : "";
    const describedBy = `${input.description ? `${id}-hint ` : ""}${id}-error`;
    const attrs = `id="${id}" name="${esc(input.id)}" class="field__control" aria-describedby="${describedBy}"`;
    let control;
    if (type === "select") {
      const chosen = initial || input.options[0].value;
      control = `<select ${attrs}>${input.options.map((o) => `<option value="${esc(o.value)}"${o.value === chosen ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    } else if (type === "textarea" || type === "numberlist") {
      control = `<textarea ${attrs} rows="4"${input.placeholder ? ` placeholder="${esc(input.placeholder)}"` : ""} spellcheck="false">${esc(initial)}</textarea>`;
    } else if (type === "date") {
      control = `<input ${attrs} type="date" value="${esc(initial)}">`;
    } else {
      // Numbers use a text field so "1,250" can be pasted; the phone keypad shows digits when negatives are not allowed.
      const nonNegative = (input.min ?? -1) >= 0 || (input.gt ?? -1) >= 0;
      const mode = type === "number" ? ` inputmode="${nonNegative ? "decimal" : "text"}" autocomplete="off"` : "";
      control = `<input ${attrs} type="text"${mode} value="${esc(initial)}"${input.placeholder ? ` placeholder="${esc(input.placeholder)}"` : ""}>`;
    }
    return `<div class="field">
      <label class="field__label" for="${id}">${esc(input.label)}${input.unit ? ` <span class="field__unit">(${esc(input.unit)})</span>` : ""}</label>
      ${input.description ? `<p class="field__hint" id="${id}-hint">${esc(input.description)}</p>` : ""}
      ${control}
      <p class="field__error" id="${id}-error" hidden></p>
    </div>`;
  },

  // Result panel before any calculation. The same panel serves every calculator.
  resultPlaceholder() {
    return `<p class="result__value result__value--empty"><span aria-hidden="true">&mdash;</span><span class="visually-hidden">No result yet</span></p>
      <p class="result__caption">Enter your numbers and choose Calculate. The result, the working and what it means will appear here.</p>`;
  },

  // Result panel after a calculation.
  resultBody(def, outcome) {
    const primary = outcome.outputs.find((o) => o.primary);
    const secondary = outcome.outputs.filter((o) => !o.primary);
    const unit = (u) => (u ? ` <span class="result__unit">${esc(u)}</span>` : "");
    const rows = (list) => list.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.display)}${r.unit ? ` ${esc(r.unit)}` : ""}</dd></div>`).join("");
    return `<p class="print-only">${esc(SITE.fullName)} &middot; ${esc(def.name)} &middot; ${esc(new Date().toLocaleDateString())}</p>
      <p class="result__label">${esc(primary.label)}</p>
      <p class="result__value"><span class="result__number">${esc(primary.display)}</span>${unit(primary.unit)}</p>
      ${secondary.length ? `<dl class="result__more">${rows(secondary)}</dl>` : ""}
      <div class="result__block"><h3>What you entered</h3><dl class="result__more">${rows(outcome.inputs)}</dl></div>
      <div class="result__block"><h3>How we calculated</h3>
        <p class="result__formula">${esc(def.formula)}</p>
        ${outcome.steps.length ? `<ol class="result__steps">${outcome.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      </div>
      ${outcome.interpretation.length ? `<div class="result__block"><h3>What this means</h3>${outcome.interpretation.map((p) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
      <div class="result__save">
        <div class="field"><label class="field__label" for="save-name">Name this calculation</label>
          <input id="save-name" class="field__control" type="text" maxlength="80" autocomplete="off" value="${esc(def.name)}"></div>
        <div class="field"><label class="field__label" for="save-note">Note (optional)</label>
          <input id="save-note" class="field__control" type="text" maxlength="200" autocomplete="off"></div>
      </div>
      <div class="result__actions">
        <button type="button" class="btn btn--primary" data-action="save">Save to workspace</button>
        <button type="button" class="btn btn--outline" data-action="compare" aria-expanded="false" aria-controls="compare-panel">Compare</button>
        <button type="button" class="btn btn--outline" data-action="export">Download CSV</button>
        <button type="button" class="btn btn--outline" data-action="print">Print</button>
      </div>
      <p class="result__status" role="status" data-status></p>
      <div class="compare" id="compare-panel" hidden></div>`;
  },

  // Draws one calculator into `host`. The only place calculator UI is built.
  render(def, host) {
    const list = (items) => `<ul class="bullets">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    const relatedItems = (def.relatedCalculators || []).map((id) => {
      const entry = Calculators.entry(id);
      return Calculators.get(id)
        ? `<li><a href="${App.toolUrl(id)}">${esc(entry.name)}</a></li>`
        : `<li>${esc(entry.name)} <span class="card__planned">(planned)</span></li>`;
    });
    const sources = (def.sources || []).map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`);
    const notes = [
      def.riskLevel !== "low" ? SITE.riskNotes[def.theme] || SITE.riskNotes.default : "",
      def.requiresExternalData ? SITE.currentDataNote : "",
    ].filter(Boolean);

    host.innerHTML = `<section class="section"><div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol>
        <li><a href="index.html">Home</a></li><li><a href="calculators.html">Calculators</a></li><li aria-current="page">${esc(def.name)}</li>
      </ol></nav>
      <h1 class="tool__title">${esc(def.name)}</h1>
      <p class="lead">${esc(def.question)}</p>
      ${notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
      <div class="tool">
        <form class="tool__form" novalidate>
          <div class="form-errors" tabindex="-1" hidden></div>
          ${(def.examples || []).length ? `<p class="tool__examples">${def.examples.map((e, i) => `<button type="button" class="btn btn--quiet" data-example="${i}">Try an example: ${esc(e.label)}</button>`).join("")}</p>` : ""}
          ${def.inputs.map(Engine.inputField).join("")}
          <div class="tool__buttons">
            <button type="submit" class="btn btn--primary">Calculate</button>
            <button type="reset" class="btn btn--outline">Reset</button>
          </div>
        </form>
        <section class="result" aria-labelledby="result-h">
          <h2 class="result__title" id="result-h" tabindex="-1">Result</h2>
          <div class="result__body" data-result>${Engine.resultPlaceholder()}</div>
        </section>
      </div>
      <div class="tool__extras" data-print="keep">
        <div><h2 class="tool__extra-title">Formula</h2><p class="result__formula">${esc(def.formula)}</p></div>
        <div><h2 class="tool__extra-title">Assumptions</h2>${list(def.assumptions)}</div>
        <div><h2 class="tool__extra-title">Limitations</h2>${list(def.limitations)}</div>
        ${sources.length ? `<div><h2 class="tool__extra-title">Sources</h2><ul class="bullets">${sources.join("")}</ul></div>` : ""}
        ${relatedItems.length ? `<div data-print="skip"><h2 class="tool__extra-title">Related calculators</h2><ul class="bullets">${relatedItems.join("")}</ul></div>` : ""}
      </div>
    </div></section>`;
    Engine.bind(def, host);
  },

  // Wires the form and the result actions. All behaviour is generic.
  bind(def, host) {
    const form = host.querySelector("form");
    const summary = host.querySelector(".form-errors");
    const body = host.querySelector("[data-result]");
    const heading = host.querySelector("#result-h");
    let outcome = null;

    const readRaw = () => Object.fromEntries(def.inputs.map((i) => [i.id, form.elements[i.id].value]));
    const control = (id) => form.elements[id];

    const clearErrors = () => {
      summary.hidden = true;
      summary.innerHTML = "";
      for (const input of def.inputs) {
        control(input.id).removeAttribute("aria-invalid");
        const p = host.querySelector(`#field-${input.id}-error`);
        p.hidden = true;
        p.textContent = "";
      }
    };

    const showErrors = (errors) => {
      clearErrors();
      for (const e of errors) {
        if (!e.field) continue;
        control(e.field).setAttribute("aria-invalid", "true");
        const p = host.querySelector(`#field-${e.field}-error`);
        p.hidden = false;
        p.textContent = e.message;
      }
      summary.hidden = false;
      summary.setAttribute("role", "alert");
      summary.innerHTML = `<strong>${errors.length === 1 ? "There is 1 thing to fix" : `There are ${errors.length} things to fix`}</strong><ul>${errors
        .map((e) => `<li>${e.field ? `<a href="#field-${esc(e.field)}">${esc(e.message)}</a>` : esc(e.message)}</li>`).join("")}</ul>`;
      const first = errors.find((e) => e.field);
      if (first) control(first.field).focus();
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearErrors();
      let result;
      try {
        result = Engine.run(def, readRaw());
      } catch (err) {
        console.error(err);
        body.innerHTML = App.errorBox("This calculation could not be completed.", err.message);
        outcome = null;
        return;
      }
      if (!result.ok) {
        outcome = null;
        body.innerHTML = Engine.resultPlaceholder();
        showErrors(result.errors);
        return;
      }
      outcome = result;
      body.innerHTML = Engine.resultBody(def, outcome);
      heading.focus();
      heading.scrollIntoView({ block: "start" });
    });

    form.addEventListener("reset", () => {
      clearErrors();
      outcome = null;
      body.innerHTML = Engine.resultPlaceholder();
      requestAnimationFrame(() => control(def.inputs[0].id).focus());
    });

    host.querySelectorAll("[data-example]").forEach((button) =>
      button.addEventListener("click", () => {
        const example = def.examples[Number(button.dataset.example)];
        clearErrors();
        for (const input of def.inputs) if (example.values[input.id] !== undefined) control(input.id).value = String(example.values[input.id]);
      })
    );

    // Result actions (rendered with each result, so delegate).
    body.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]");
      if (!action || !outcome) return;
      const status = body.querySelector("[data-status]");
      const calculation = () => Engine.toCalculation(def, outcome, { name: body.querySelector("#save-name").value.trim(), notes: body.querySelector("#save-note").value.trim() });
      try {
        if (action.dataset.action === "save") {
          Workspace.save(calculation());
          status.textContent = `Saved to My Workspace as “${calculation().name}”.`;
        } else if (action.dataset.action === "export") {
          Workspace.exportCSV([Workspace.record(calculation())], `riviera-${def.id}.csv`);
          status.textContent = "CSV downloaded.";
        } else if (action.dataset.action === "print") {
          Engine.printResult();
        } else if (action.dataset.action === "compare") {
          const panel = body.querySelector("#compare-panel");
          const open = panel.hidden;
          panel.hidden = !open;
          action.setAttribute("aria-expanded", String(open));
          if (open) {
            const saved = Workspace.load().items.filter((i) => i.calculatorId === def.id);
            panel.innerHTML = saved.length
              ? Engine.compare(Workspace.record(calculation()), saved)
              : '<p class="result__caption">No saved calculations for this calculator yet. Save this one, change the numbers, calculate again, then compare.</p>';
          }
        }
      } catch (err) {
        console.error(err);
        status.textContent = `That did not work: ${err.message}`;
      }
    });
  },

  // Prints the result and the calculator's assumptions and limitations (see @media print).
  printResult() {
    document.body.dataset.print = "result";
    window.addEventListener("afterprint", () => { delete document.body.dataset.print; }, { once: true });
    window.print();
  },
};
