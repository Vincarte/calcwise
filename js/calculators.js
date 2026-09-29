"use strict";

/* ==========================================================================
   Riviera — calculator registry and definitions

   ADD CALCULATOR #101 (or #6) HERE. It is a definition, never a page:
   the engine (calculator-engine.js) draws every calculator from its
   definition at calculators.html?tool=<id>.

   THE CATALOGUE IS THE SOURCE OF TRUTH FOR IDENTITY
   data/calculator-catalogue.json holds the master list of 100 calculators.
   A definition's `id` must be one of those ids, and these fields come from the
   catalogue and must NOT be repeated in a definition:
     name, question, theme, complexity, launchStage, riskLevel, offline,
     requiresExternalData
   register() merges them in and throws if a definition tries to set them.

   A DEFINITION SUPPLIES
     id              a catalogue id, unchanged
     inputs          [{ id, label, type?, unit?, description?, placeholder?, default?,
                        min?, max?, gt?, integer?, required?, options?, minCount?, maxCount? }]
                     type: number (default) | numberlist | text | textarea | date | select
     outputs         [{ id, label, unit?, decimals? | maxDecimals?, format?: "number"|"text", primary?: true }]
                     exactly one primary
     calculate(v)    pure maths: values in, { outputId: value } out. No formatting, no text.
     formula         one-line statement of the method
     assumptions     [string]   (required)
     limitations     [string]   (required)
   OPTIONAL
     shortName, keywords, popular, seoTitle, seoDescription, examples,
     validate(v)     [{ field?, message }] for invalid combinations
     steps(v, r)     [string]  the working, with the actual numbers
     interpret(v, r) [string]  what the result means (kept apart from the maths)
     sources         [{ label, url? }]  REQUIRED when the catalogue rates the tool Medium or High risk
     relatedCalculators  [catalogue ids]   planned ones are shown as "(planned)"

   Guidance rule from the catalogue: do not invent formulas for high-risk
   calculators without a source.
   ========================================================================== */

const CATALOGUE_KEYS = ["name", "question", "theme", "complexity", "launchStage", "riskLevel", "offline", "requiresExternalData"];

const Calculators = {
  catalogue: new Map(), // id -> catalogue entry (all 100)
  registry: new Map(), // id -> merged definition (calculators that are built)

  // Called once the catalogue has loaded.
  init(entries) {
    Calculators.catalogue.clear();
    Calculators.registry.clear();
    entries.forEach((e) => Calculators.catalogue.set(e.id, e));
    DEFINITIONS.forEach((d) => Calculators.register(d));
  },

  register(def) {
    const fail = (why) => { throw new Error(`Calculator "${def && def.id}": ${why}`); };
    const isText = (v) => typeof v === "string" && v.trim() !== "";
    const isList = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);

    if (!def || typeof def !== "object") throw new Error("Calculator definition must be an object");
    const entry = Calculators.catalogue.get(def.id);
    if (!entry) fail("id is not in the master catalogue (data/calculator-catalogue.json)");
    for (const key of CATALOGUE_KEYS) if (key in def) fail(`"${key}" comes from the catalogue; remove it from the definition`);
    if (Calculators.registry.has(def.id)) fail("id is already registered");

    if (!Array.isArray(def.inputs) || !def.inputs.length) fail("inputs must be a non-empty array");
    const inputIds = new Set();
    for (const input of def.inputs) {
      if (!input || typeof input.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(input.id)) fail("every input needs an alphanumeric id");
      if (inputIds.has(input.id)) fail(`input id "${input.id}" is used twice`);
      inputIds.add(input.id);
      if (!isText(input.label)) fail(`input "${input.id}" needs a label`);
      if (input.type && !Engine.INPUT_TYPES.includes(input.type)) fail(`input "${input.id}" has unknown type "${input.type}"`);
      if (input.type === "select" && (!Array.isArray(input.options) || !input.options.length || !input.options.every((o) => isText(o.value) && isText(o.label)))) {
        fail(`select input "${input.id}" needs options with a value and a label`);
      }
    }

    if (!Array.isArray(def.outputs) || !def.outputs.length) fail("outputs must be a non-empty array");
    const outputIds = new Set();
    for (const output of def.outputs) {
      if (!output || typeof output.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(output.id)) fail("every output needs an alphanumeric id");
      if (outputIds.has(output.id)) fail(`output id "${output.id}" is used twice`);
      outputIds.add(output.id);
      if (!isText(output.label)) fail(`output "${output.id}" needs a label`);
      if (output.format && !Engine.OUTPUT_FORMATS.includes(output.format)) fail(`output "${output.id}" has unknown format "${output.format}"`);
    }
    if (def.outputs.filter((o) => o.primary).length !== 1) fail("exactly one output must be primary");

    if (typeof def.calculate !== "function") fail("calculate must be a function");
    if (!isText(def.formula)) fail("formula is required");
    if (!isList(def.assumptions)) fail("assumptions must be a non-empty list of text");
    if (!isList(def.limitations)) fail("limitations must be a non-empty list of text");

    const sources = def.sources || [];
    if (entry.riskLevel !== "low" && !sources.length) fail(`the catalogue rates this ${entry.riskLevel} risk, so it must cite at least one source`);
    for (const s of sources) {
      if (!isText(s.label)) fail("every source needs a label");
      if (s.url !== undefined && !/^https:\/\//.test(s.url)) fail("source urls must start with https://");
    }
    for (const id of def.relatedCalculators || []) if (!Calculators.catalogue.has(id)) fail(`related calculator "${id}" is not in the catalogue`);
    for (const example of def.examples || []) {
      if (!isText(example.label)) fail("every example needs a label");
      for (const key of Object.keys(example.values)) if (!inputIds.has(key)) fail(`example refers to unknown input "${key}"`);
    }

    Calculators.registry.set(def.id, { ...entry, ...def });
  },

  get(id) {
    return Calculators.registry.get(id);
  },

  // The catalogue entry, whether or not the calculator is built yet.
  entry(id) {
    return Calculators.catalogue.get(id);
  },

  // filter: { level, area, theme, popular } — all optional. Built calculators only, sorted by name.
  list({ level, area, theme, popular } = {}) {
    return [...Calculators.registry.values()]
      .filter((d) => !level || d.complexity === level)
      .filter((d) => !area || App.area(area).themes.includes(d.theme))
      .filter((d) => !theme || d.theme === theme)
      .filter((d) => !popular || d.popular === true)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};

/* ---- Shared helpers for definitions ------------------------------------------ */

const num = (n, options = { maxDecimals: 6 }) => Engine.fmt(n, options);

// Neumaier compensated sum: keeps 0.1 + 0.2 + ... exact enough for long lists.
const sum = (values) => {
  let total = 0;
  let compensation = 0;
  for (const x of values) {
    const t = total + x;
    compensation += Math.abs(total) >= Math.abs(x) ? total - t + x : x - t + total;
    total = t;
  }
  return total + compensation;
};

/* ---- DEFINITIONS ---------------------------------------------------------------
   The first five calculators. They were chosen to test the engine against five
   different structures: arithmetic, a health formula with interpretation,
   financial amortisation, a unit-based practical calculation, and a dataset.
   -------------------------------------------------------------------------- */

const LOAN_FREQUENCIES = [
  { value: "12", label: "Monthly", perYear: 12 },
  { value: "26", label: "Every two weeks", perYear: 26 },
  { value: "52", label: "Weekly", perYear: 52 },
  { value: "4", label: "Quarterly", perYear: 4 },
  { value: "1", label: "Yearly", perYear: 1 },
];

// Number of payments and the interest rate per payment period.
const loanPlan = (v) => {
  const perYear = Number(v.frequency);
  const years = v.termUnit === "years" ? v.term : v.term / 12;
  const exact = years * perYear;
  return { perYear, exact, n: Math.round(exact), i: v.rate / 100 / perYear };
};

const BMI_BANDS = [
  { below: 18.5, label: "Underweight", range: "below 18.5" },
  { below: 25, label: "Normal range", range: "18.5 to 24.9" },
  { below: 30, label: "Overweight (pre-obese)", range: "25 to 29.9" },
  { below: Infinity, label: "Obese", range: "30 or above" },
];

const DEFINITIONS = [
  /* 1. Simple arithmetic ------------------------------------------------------- */
  {
    id: "percentage",
    shortName: "Percentage",
    popular: true,
    keywords: ["percent of", "percentage of a number", "what is x% of y", "per cent"],
    seoTitle: "Percentage Calculator: What Is X% of Y? | Riviera",
    seoDescription: "Work out X% of any number. See the calculation step by step, the formula used and what the result means.",
    inputs: [
      { id: "percent", label: "Percentage (X)", unit: "%", min: 0, placeholder: "e.g. 15", description: "The percentage you want to find." },
      { id: "value", label: "Number (Y)", placeholder: "e.g. 2400", description: "The whole amount you are taking the percentage of." },
    ],
    outputs: [{ id: "result", label: "X% of Y", maxDecimals: 6, primary: true }],
    formula: "Result = X ÷ 100 × Y",
    calculate: ({ percent, value }) => ({ result: (percent * value) / 100 }),
    steps: ({ percent, value }, r) => [
      `Turn the percentage into a fraction: ${num(percent)} ÷ 100 = ${num(percent / 100, { maxDecimals: 8 })}.`,
      `Multiply by the number: ${num(percent / 100, { maxDecimals: 8 })} × ${num(value)} = ${num(r.result)}.`,
    ],
    interpret: ({ percent, value }, r) => {
      const lines = [`${num(percent)}% means ${num(percent)} parts in every 100. Applied to ${num(value)}, that is ${num(r.result)}.`];
      if (percent > 0 && percent < 100) lines.push(`The remaining ${num(100 - percent)}% is ${num(value - r.result)}.`);
      if (percent > 100) lines.push("A percentage above 100 gives more than the original number.");
      return lines;
    },
    assumptions: ["X is a percentage, so 50 means 50%.", "X is zero or more. Y can be any number, including decimals and negative numbers."],
    limitations: [
      "This finds X% of Y only. Comparing an old and a new value is a different question (percentage change).",
      "Results are shown to at most 6 decimal places.",
    ],
    examples: [{ label: "15% of 2,400", values: { percent: "15", value: "2400" } }],
    relatedCalculators: ["percent-change", "discount", "ratio"],
  },

  /* 2. Health formula with interpretation (High risk: sourced) -------------------- */
  {
    id: "bmi",
    shortName: "BMI",
    popular: true,
    keywords: ["body mass index", "weight and height", "healthy weight"],
    seoTitle: "BMI Calculator: Work Out Your Body Mass Index | Riviera",
    seoDescription: "Calculate body mass index (BMI) from weight and height, see the working and read what the adult BMI ranges do and do not tell you.",
    inputs: [
      { id: "weight", label: "Weight", unit: "kg", gt: 0, max: 500, placeholder: "e.g. 68", description: "Your weight in kilograms." },
      { id: "height", label: "Height", unit: "cm", min: 50, max: 275, placeholder: "e.g. 170", description: "Your height in centimetres." },
    ],
    outputs: [{ id: "bmi", label: "Body mass index (BMI)", unit: "kg/m²", decimals: 2, primary: true }],
    formula: "BMI = weight (kg) ÷ height (m)²",
    calculate: ({ weight, height }) => ({ bmi: weight / (height / 100) ** 2 }),
    steps: ({ weight, height }, r) => {
      const metres = height / 100;
      return [
        `Convert height to metres: ${num(height)} cm ÷ 100 = ${num(metres, { maxDecimals: 4 })} m.`,
        `Square the height: ${num(metres, { maxDecimals: 4 })} × ${num(metres, { maxDecimals: 4 })} = ${num(metres ** 2, { maxDecimals: 6 })} m².`,
        `Divide weight by that: ${num(weight)} ÷ ${num(metres ** 2, { maxDecimals: 6 })} = ${num(r.bmi, { decimals: 2 })} kg/m².`,
      ];
    },
    interpret: (v, r) => {
      const shown = Number(r.bmi.toFixed(2)); // classify the value as displayed
      const band = BMI_BANDS.find((b) => shown < b.below);
      const lines = [
        `For adults, a BMI of ${num(shown, { decimals: 2 })} is in the "${band.label}" range (${band.range}).`,
        "BMI is a screening measure. It does not measure body fat, and it cannot tell you about your own health. A health professional can interpret it alongside other information.",
      ];
      if (shown < 12 || shown > 70) lines.push("This value is unusual. Check that weight is in kilograms and height in centimetres.");
      return lines;
    },
    assumptions: [
      "Weight is in kilograms and height in centimetres.",
      "The person is an adult aged 18 or over.",
      "Adult ranges: below 18.5, 18.5 to 24.9, 25 to 29.9, and 30 or above. The range is chosen from the BMI rounded to two decimal places, as shown.",
    ],
    limitations: [
      "BMI does not measure body fat, muscle, bone or where fat is carried.",
      "It is not used this way for children and adolescents, who are assessed against age- and sex-specific growth references.",
      "Some countries and groups use different cut-offs, and results can be less informative for older adults and for people with a lot of muscle.",
      "It is a calculation, not a diagnosis or medical advice.",
    ],
    sources: [
      { label: "World Health Organization: Obesity and overweight (fact sheet)", url: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight" },
      { label: "Eurostat, Statistics Explained: Glossary: Body mass index (BMI)" },
    ],
    examples: [{ label: "68 kg, 170 cm", values: { weight: "68", height: "170" } }],
    relatedCalculators: ["bmr", "ideal-weight", "body-surface-area", "tdee"],
  },

  /* 3. Financial amortisation (Medium risk: sourced) ---------------------------------- */
  {
    id: "loan-payment",
    shortName: "Loan payment",
    popular: true,
    keywords: ["loan repayment", "monthly payment", "instalment", "amortisation", "interest", "borrowing"],
    seoTitle: "Loan Payment Calculator: Payments and Interest | Riviera",
    seoDescription: "Work out the regular payment, total interest and total repayment on a fixed-rate loan, with the formula and assumptions shown.",
    inputs: [
      { id: "principal", label: "Amount borrowed", gt: 0, placeholder: "e.g. 500000", description: "In your own currency." },
      { id: "rate", label: "Annual interest rate", unit: "% per year", min: 0, max: 100, placeholder: "e.g. 14", description: "The yearly rate quoted by the lender." },
      { id: "term", label: "Loan term", gt: 0, placeholder: "e.g. 5", description: "How long you will take to repay, in the unit chosen below." },
      { id: "termUnit", label: "Term is in", type: "select", default: "years", options: [{ value: "years", label: "Years" }, { value: "months", label: "Months" }] },
      { id: "frequency", label: "Payment frequency", type: "select", default: "12", options: LOAN_FREQUENCIES.map(({ value, label }) => ({ value, label })) },
    ],
    outputs: [
      { id: "payment", label: "Payment each period", decimals: 2, primary: true },
      { id: "totalInterest", label: "Total interest", decimals: 2 },
      { id: "totalRepayment", label: "Total repayment", decimals: 2 },
    ],
    formula: "Payment = P × i ÷ (1 − (1 + i)^−n), where P = amount borrowed, i = interest rate per payment period, n = number of payments. At 0% interest, Payment = P ÷ n.",
    validate: (v) => {
      const { exact, n } = loanPlan(v);
      const label = LOAN_FREQUENCIES.find((f) => f.value === v.frequency).label.toLowerCase();
      if (Math.abs(exact - n) > 1e-6 * Math.max(1, exact)) {
        return [{ field: "term", message: `A term of ${num(v.term)} ${v.termUnit} with ${label} payments gives ${num(exact, { maxDecimals: 4 })} payments. Choose a term that gives a whole number of payments.` }];
      }
      if (n < 1) return [{ field: "term", message: "The term is shorter than one payment period. Enter a longer term or pay more often." }];
      if (n > 12000) return [{ field: "term", message: "That is more than 12,000 payments. Enter a shorter term." }];
      return [];
    },
    calculate: (v) => {
      const { n, i } = loanPlan(v);
      // expm1/log1p keep the result accurate when the rate per period is very small.
      const payment = i === 0 ? v.principal / n : (v.principal * i) / -Math.expm1(-n * Math.log1p(i));
      const totalRepayment = i === 0 ? v.principal : payment * n;
      return { payment, totalRepayment, totalInterest: i === 0 ? 0 : totalRepayment - v.principal };
    },
    steps: (v, r) => {
      const { perYear, n, i } = loanPlan(v);
      const money = { decimals: 2 };
      return [
        `Number of payments: ${num(v.term)} ${v.termUnit} with ${perYear} payments a year gives n = ${num(n)}.`,
        `Interest rate per payment period: ${num(v.rate)}% ÷ ${perYear} = ${num(i * 100, { maxDecimals: 8 })}%, so i = ${num(i, { maxDecimals: 10 })}.`,
        i === 0
          ? `With no interest, each payment is ${num(v.principal, money)} ÷ ${num(n)} = ${num(r.payment, money)}.`
          : `Payment = ${num(v.principal, money)} × ${num(i, { maxDecimals: 10 })} ÷ (1 − (1 + ${num(i, { maxDecimals: 10 })})^−${num(n)}) = ${num(r.payment, money)}.`,
        `Total repayment = ${num(r.payment, money)} × ${num(n)} = ${num(r.totalRepayment, money)}.`,
        `Total interest = ${num(r.totalRepayment, money)} − ${num(v.principal, money)} = ${num(r.totalInterest, money)}.`,
      ];
    },
    interpret: (v, r) => {
      const { n } = loanPlan(v);
      const money = { decimals: 2 };
      return [
        `You would make ${num(n)} payments of ${num(r.payment, money)}, repaying ${num(r.totalRepayment, money)} in total for ${num(v.principal, money)} borrowed.`,
        `Interest makes up ${num(r.totalInterest, money)} of that, which is ${num((r.totalInterest / v.principal) * 100, { decimals: 1 })}% of the amount borrowed.`,
        "Interest is charged on the balance still owed, so early payments are mostly interest and later payments mostly repay the amount borrowed.",
        "This shows what the numbers say. It does not show whether the loan is affordable for you or how it compares with other offers.",
      ];
    },
    assumptions: [
      "The interest rate is fixed for the whole term.",
      "Payments are equal and made at the end of each payment period.",
      "Interest is charged each period at the yearly rate divided by the number of payments a year.",
      "The full amount is borrowed at the start, with no extra repayments and no payment holiday.",
    ],
    limitations: [
      "Fees, insurance, taxes and other charges are not included, so a lender's total cost may be higher.",
      "Variable-rate, interest-only and balloon loans work differently.",
      "Lenders may round payments, count days differently or use another compounding rule, so their figures can differ slightly.",
      "It is an estimate, not a loan offer or financial advice.",
    ],
    sources: [{ label: "Math Central, University of Regina: Loan payment formula", url: "https://mathcentral.uregina.ca/QandQ/topics/payment" }],
    examples: [{ label: "500,000 over 5 years at 14%, paid monthly", values: { principal: "500000", rate: "14", term: "5", termUnit: "years", frequency: "12" } }],
    relatedCalculators: ["loan-balance", "extra-payment", "compound-interest", "debt-to-income"],
  },

  /* 4. Practical unit-based calculation (uses a changing value: price) ------------------ */
  {
    id: "fuel-cost",
    shortName: "Fuel cost",
    popular: true,
    keywords: ["petrol cost", "diesel cost", "trip fuel", "fuel budget", "journey cost"],
    seoTitle: "Fuel Cost Calculator: Trip Fuel and Cost | Riviera",
    seoDescription: "Estimate the fuel a trip needs and what it will cost from distance, fuel consumption and fuel price, with the working shown.",
    inputs: [
      { id: "distance", label: "Trip distance", unit: "km", gt: 0, max: 100000, placeholder: "e.g. 120", description: "The total distance you will drive. Double it for a return trip." },
      { id: "consumption", label: "Fuel consumption", gt: 0, max: 1000, placeholder: "e.g. 12", description: "How much fuel the vehicle uses, in the unit chosen below." },
      {
        id: "consumptionUnit", label: "Consumption is measured in", type: "select", default: "kmpl",
        options: [{ value: "kmpl", label: "Kilometres per litre (km/L)" }, { value: "l100", label: "Litres per 100 km (L/100 km)" }],
      },
      { id: "price", label: "Fuel price per litre", min: 0, placeholder: "e.g. 180", description: "The current price where you will buy fuel, in your own currency." },
    ],
    outputs: [
      { id: "cost", label: "Trip fuel cost", decimals: 2, primary: true },
      { id: "litres", label: "Fuel needed", unit: "litres", decimals: 2 },
    ],
    formula: "Fuel needed = distance ÷ km per litre (or distance × L per 100 km ÷ 100). Trip cost = fuel needed × price per litre.",
    calculate: (v) => {
      const litres = v.consumptionUnit === "kmpl" ? v.distance / v.consumption : (v.distance * v.consumption) / 100;
      return { litres, cost: litres * v.price };
    },
    steps: (v, r) => [
      v.consumptionUnit === "kmpl"
        ? `Fuel needed = distance ÷ consumption = ${num(v.distance)} ÷ ${num(v.consumption)} = ${num(r.litres, { decimals: 2 })} litres.`
        : `Fuel needed = distance × consumption ÷ 100 = ${num(v.distance)} × ${num(v.consumption)} ÷ 100 = ${num(r.litres, { decimals: 2 })} litres.`,
      `Trip cost = fuel needed × price = ${num(r.litres, { decimals: 2 })} × ${num(v.price)} = ${num(r.cost, { decimals: 2 })}.`,
    ],
    interpret: (v, r) => {
      const lines = [`The trip needs about ${num(r.litres, { decimals: 2 })} litres of fuel, costing ${num(r.cost, { decimals: 2 })}. That is ${num(r.cost / v.distance, { decimals: 2 })} per kilometre.`];
      if (v.consumptionUnit === "kmpl" && v.consumption > 40) lines.push("A figure this high is unusual for kilometres per litre. Check you have not entered litres per 100 km.");
      if (v.consumptionUnit === "l100" && v.consumption < 3) lines.push("A figure this low is unusual for litres per 100 km. Check you have not entered kilometres per litre.");
      return lines;
    },
    assumptions: [
      "Fuel consumption stays the same for the whole trip.",
      "The price you enter applies to all the fuel used.",
      "The distance is the total distance driven.",
    ],
    limitations: [
      "Real consumption changes with speed, load, traffic, terrain, weather and the condition of the vehicle.",
      "Fuel prices change. Riviera does not look them up, so the result is only as current as the price you enter.",
      "Tolls, parking, maintenance and other running costs are not included.",
    ],
    examples: [{ label: "120 km at 12 km/L and 180 per litre", values: { distance: "120", consumption: "12", consumptionUnit: "kmpl", price: "180" } }],
    relatedCalculators: ["fuel-efficiency", "fuel-range", "trip-budget", "vehicle-running-cost"],
  },

  /* 5. Dataset statistic ------------------------------------------------------------- */
  {
    id: "mean",
    shortName: "Mean",
    popular: true,
    keywords: ["average", "arithmetic mean", "statistics", "average of numbers"],
    seoTitle: "Mean Calculator: Find the Average of Numbers | Riviera",
    seoDescription: "Find the mean (average) of a list of numbers, with the count, the total and the working shown.",
    inputs: [
      {
        id: "dataset", label: "Numbers", type: "numberlist", minCount: 1, maxCount: 10000, placeholder: "e.g. 12, 15, 9, 20",
        description: "Separate numbers with spaces, commas or new lines. Use a full stop for decimals and no thousands separators.",
      },
    ],
    outputs: [
      { id: "mean", label: "Mean", maxDecimals: 6, primary: true },
      { id: "count", label: "How many numbers (n)", decimals: 0 },
      { id: "total", label: "Total (Σx)", maxDecimals: 6 },
    ],
    formula: "Mean = Σx ÷ n, the total of the numbers divided by how many there are.",
    calculate: ({ dataset }) => {
      const total = sum(dataset);
      return { mean: total / dataset.length, count: dataset.length, total };
    },
    steps: (v, r) => [
      `Add the ${num(r.count)} numbers: Σx = ${num(r.total)}.`,
      `Divide by how many there are: ${num(r.total)} ÷ ${num(r.count)} = ${num(r.mean)}.`,
    ],
    interpret: (v, r) => {
      if (r.count === 1) return ["With only one number, the mean is that number."];
      return [
        `The mean is the value each of the ${num(r.count)} numbers would have if the total were shared out equally: ${num(r.mean)}.`,
        "A few very large or very small values can pull the mean up or down. When your data has extreme values, the median can describe the middle better (a median calculator is planned).",
      ];
    },
    assumptions: [
      "Every number counts equally (an unweighted mean).",
      "All the numbers are in the same unit.",
      "The list is the complete set you want the average of.",
    ],
    limitations: [
      "The mean is affected by extreme values.",
      "It does not show how spread out the numbers are.",
      "Enter plain numbers only: no units, currency symbols or thousands separators.",
    ],
    examples: [{ label: "12, 15, 9, 20", values: { dataset: "12, 15, 9, 20" } }],
    relatedCalculators: ["median", "mode", "standard-deviation", "range"],
  },
];
