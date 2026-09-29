"use strict";

/* ==========================================================================
   Riviera: Life & Numbers — application shell

   Load order (every page): app.js, calculator-engine.js, calculators.js,
   workspace.js, pwa.js. Classic deferred scripts sharing one global scope.

   WHERE THINGS LIVE
     Site structure, brand, base URL ...... SITE (this file)
     Calculator planning data (100) ....... data/calculator-catalogue.json
     Guides ............................... data/guides.json
     Calculator definitions ............... js/calculators.js
     Calculation + calculator UI .......... js/calculator-engine.js
     Saved calculations, export ........... js/workspace.js
     Install / update ..................... js/pwa.js, sw.js
     Styling .............................. css/style.css

   HOW PAGES USE THIS FILE
   Each page declares <body data-page="money"> and empty slots (#site-header,
   #site-footer). Any element in <main> such as
       <div data-component="tool-grid" data-area="money"></div>
   is filled by the matching function in App.components. To add a component,
   add one function there.
   ========================================================================== */

const SITE = {
  name: "Riviera",
  subtitle: "Life & Numbers",
  fullName: "Riviera: Life & Numbers",
  tagline: "Calculate. Understand. Plan.",

  // PUBLIC BASE URL: the one place the deployed address is set. It must end
  // with "/", e.g. "https://username.github.io/calcwise/". While it is empty
  // the app derives the address from where it is being served, so a GitHub
  // Pages project path (/calcwise/) works without any edit. It feeds the
  // canonical URL, Open Graph URLs and JSON-LD written by App.applySeo().
  baseUrl: "",

  // The six pages. Ids match <body data-page="...">. Order is the nav order.
  pages: [
    { id: "home", href: "index.html", label: "Home" },
    { id: "calculators", href: "calculators.html", label: "Calculators" },
    { id: "money", href: "money.html", label: "Money & Work" },
    { id: "life", href: "life.html", label: "Life" },
    { id: "science", href: "science.html", label: "Science" },
    { id: "information", href: "information.html", label: "Information" },
  ],

  // User-facing levels. Values match the catalogue's Complexity column.
  levels: [
    { id: "basic", label: "Basic", summary: "Everyday sums, dates, measurements and conversions." },
    { id: "advanced", label: "Advanced", summary: "Loans, salary, savings, property and other tools with several moving parts." },
    { id: "scientific", label: "Scientific", summary: "Scientific calculation, equations and logarithms." },
  ],

  // Catalogue themes are used exactly as the catalogue spells them. Labels are for display only.
  themeLabels: {
    everyday: "Everyday", money: "Money", work: "Work", travel: "Travel", property: "Property",
    health: "Health", math: "Mathematics", statistics: "Statistics", science: "Science",
    digital: "Digital", household: "Household", agriculture: "Agriculture",
  },

  // An area is a page that groups catalogue themes. This is the ONLY place a
  // theme is mapped to a page. Area ids equal page ids.
  areas: [
    { id: "money", label: "Money & Work", image: "images/money-tools.svg", themes: ["money", "work"],
      summary: "Loans, savings, salary and the other numbers behind household and work plans." },
    { id: "life", label: "Life", image: "images/life-tools.svg", themes: ["everyday", "health", "travel", "property", "household", "agriculture"],
      summary: "Everyday sums, health measures, travel costs, property and home." },
    { id: "science", label: "Mathematics, statistics & science", image: "images/science-tools.svg", themes: ["math", "statistics", "science", "digital"],
      summary: "Mathematics, statistics, physics and digital tools, with the formula always shown." },
    { id: "information", label: "Information & guides", image: "images/information-guides.svg", themes: [],
      summary: "Short, evidence-conscious guides that explain the numbers and link to the tool that works them out." },
  ],

  // Shown on calculators the catalogue rates Medium or High risk (by theme).
  riskNotes: {
    default: "This is a calculation from the numbers you enter. It is not professional advice.",
    health: "This is a calculation, not a diagnosis or medical advice. A health professional can interpret it alongside other information.",
    money: "This is an estimate from the numbers you enter. It is not financial advice or an offer of credit.",
    work: "This is an estimate from the numbers you enter. It is not financial, tax or legal advice.",
    property: "This is an estimate from the numbers you enter. It is not financial, legal or surveying advice.",
  },

  // Shown on calculators whose catalogue row says they use changing data.
  currentDataNote: "This calculator uses a value that changes over time, such as a price or rate. Enter the current figure yourself; Riviera does not look it up.",
};

/* Escape any text placed into an HTML string. Use it for ALL dynamic text. */
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let uidCounter = 0;

const App = {
  data: null, // { catalogue, guides } once loaded

  async init() {
    App.renderShell();
    App.applySeo();
    Workspace.init();
    PWA.init();
    try {
      await App.loadData();
      Calculators.init(App.data.catalogue.calculators);
      App.mountComponents(document);
    } catch (err) {
      console.error(err);
      document.getElementById("main").insertAdjacentHTML(
        "afterbegin",
        `<div class="container section">${App.errorBox("Riviera could not load its data.", `${err.message} Reload the page. If you opened the file directly from disk, serve the folder over http instead.`)}</div>`
      );
    }
  },

  async loadData() {
    const get = async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
      return response.json();
    };
    const [catalogue, guides] = await Promise.all([get("data/calculator-catalogue.json"), get("data/guides.json")]);
    App.data = { catalogue, guides };
  },

  /* ---- Lookups (single implementations; other files call these) ---------- */

  page(id) {
    const page = SITE.pages.find((p) => p.id === id);
    if (!page) throw new Error(`Unknown page id "${id}"`);
    return page;
  },

  area(id) {
    const area = SITE.areas.find((a) => a.id === id);
    if (!area) throw new Error(`Unknown area "${id}"`);
    return area;
  },

  areaOfTheme(theme) {
    return SITE.areas.find((a) => a.themes.includes(theme));
  },

  level(id) {
    const level = SITE.levels.find((l) => l.id === id);
    if (!level) throw new Error(`Unknown level "${id}"`);
    return level;
  },

  query() {
    return new URLSearchParams(window.location.search);
  },

  uid(prefix) {
    uidCounter += 1;
    return `${prefix}-${uidCounter}`;
  },

  // Absolute URL for a path inside the site, from SITE.baseUrl (or the address being served).
  url(path = "") {
    if (SITE.baseUrl && !/^https?:\/\/[^/]+.*\/$/.test(SITE.baseUrl)) throw new Error('SITE.baseUrl must be an http(s) URL ending in "/"');
    return new URL(path, SITE.baseUrl || new URL(".", document.baseURI).href).href;
  },

  toolUrl(id) {
    return `calculators.html?tool=${encodeURIComponent(id)}`;
  },

  /* ---- SEO written at runtime from SITE.baseUrl ---------------------------- */

  setHead(selector, tag, attrs) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(tag);
      document.head.append(el);
    }
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  },

  setJsonLd(data) {
    let script = document.getElementById("ld-json");
    if (!script) {
      script = document.createElement("script");
      script.id = "ld-json";
      script.type = "application/ld+json";
      document.head.append(script);
    }
    script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  },

  // Canonical URL, Open Graph URL and image, and JSON-LD for the six main pages.
  applySeo() {
    const page = App.page(document.body.dataset.page);
    const url = App.url(page.id === "home" ? "" : page.href);
    const description = document.querySelector('meta[name="description"]').content;
    App.setHead('link[rel="canonical"]', "link", { rel: "canonical", href: url });
    App.setHead('meta[property="og:url"]', "meta", { property: "og:url", content: url });
    App.setHead('meta[property="og:image"]', "meta", { property: "og:image", content: App.url("images/og-image.png") });
    App.setHead('meta[property="og:image:width"]', "meta", { property: "og:image:width", content: "1200" });
    App.setHead('meta[property="og:image:height"]', "meta", { property: "og:image:height", content: "630" });
    App.setHead('meta[property="og:image:alt"]', "meta", { property: "og:image:alt", content: `${SITE.fullName}. ${SITE.tagline}` });

    const website = { "@type": "WebSite", name: SITE.fullName, url: App.url(""), description, inLanguage: "en" };
    App.setJsonLd(
      page.id === "home"
        ? { "@context": "https://schema.org", ...website, potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${App.url("calculators.html")}?q={search_term_string}` }, "query-input": "required name=search_term_string" } }
        : { "@context": "https://schema.org", "@type": "CollectionPage", name: page.label, description, url,
            isPartOf: website,
            breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: App.url("") },
              { "@type": "ListItem", position: 2, name: page.label, item: url } ] } }
    );
  },

  /* ---- Shell -------------------------------------------------------------- */

  renderShell() {
    const current = App.page(document.body.dataset.page).id;
    const navLinks = SITE.pages
      .map((p) => `<li><a href="${p.href}"${p.id === current ? ' aria-current="page"' : ""}>${esc(p.label)}</a></li>`)
      .join("");

    document.body.insertAdjacentHTML("afterbegin", '<a class="skip-link" href="#main">Skip to main content</a>');

    document.getElementById("site-header").innerHTML = `
      <div class="container site-header__bar">
        <a class="brand" href="index.html">
          <img src="images/riviera-logo.svg" width="32" height="32" alt="">
          <span class="brand__text"><span class="brand__name">${esc(SITE.name)}</span><span class="brand__sub">${esc(SITE.subtitle)}</span></span>
        </a>
        <button type="button" class="btn btn--quiet menu-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav id="site-nav" class="site-nav" aria-label="Main"><ul>${navLinks}</ul></nav>
        <button type="button" class="btn btn--outline workspace-btn" data-workspace-open>
          <span class="workspace-btn__my">My </span>Workspace <span class="badge" data-workspace-count hidden></span>
        </button>
      </div>`;

    document.getElementById("site-footer").innerHTML = `
      <div class="container site-footer__grid">
        <div>
          <p class="site-footer__brand">${esc(SITE.name)}</p>
          <p>${esc(SITE.subtitle)}</p>
          <p class="site-footer__note">${esc(SITE.tagline)} Calculations run in your browser. Nothing you enter is sent to a server.</p>
        </div>
        <nav aria-label="Footer">
          <h2 class="site-footer__heading">Explore</h2>
          <ul>${SITE.pages.map((p) => `<li><a href="${p.href}">${esc(p.label)}</a></li>`).join("")}</ul>
        </nav>
        <div>
          <h2 class="site-footer__heading">Good to know</h2>
          <p class="site-footer__note">Riviera gives general calculations and information. It is not financial, medical or legal advice.</p>
          <button type="button" class="btn btn--light site-footer__install" data-install hidden>Install Riviera</button>
        </div>
      </div>
      <div class="container site-footer__legal">&copy; ${new Date().getFullYear()} ${esc(SITE.fullName)}</div>`;

    const toggle = document.querySelector(".menu-toggle");
    const nav = document.getElementById("site-nav");
    const setMenu = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-workspace-open]")) Workspace.open();
    });
  },

  /* ---- Notices (used by the PWA update prompt; reusable) ------------------- */

  notify({ message, actionLabel, onAction }) {
    let region = document.getElementById("notices");
    if (!region) {
      region = document.createElement("div");
      region.id = "notices";
      region.className = "notices";
      region.setAttribute("role", "status");
      document.body.append(region);
    }
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.innerHTML = `<span>${esc(message)}</span>`;
    if (actionLabel) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "btn btn--light";
      action.textContent = actionLabel;
      action.addEventListener("click", onAction);
      notice.append(action);
    }
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "btn btn--light";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => notice.remove());
    notice.append(dismiss);
    region.append(notice);
  },

  /* ---- Reusable fragments -------------------------------------------------- */

  emptyState(title, text) {
    return `<div class="empty">
      <strong class="empty__title">${esc(title)}</strong>
      <p class="empty__text">${esc(text)}</p>
      <a class="empty__action" href="index.html#areas">See what is planned</a>
    </div>`;
  },

  errorBox(title, detail) {
    return `<div class="error-box" role="alert"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
  },

  // The two reusable cards. Every grid on the site renders through these.
  calculatorCard(def) {
    return `<a class="card" href="${App.toolUrl(def.id)}">
      <span class="card__meta"><span class="chip-mode" data-level="${def.complexity}">${esc(App.level(def.complexity).label)}</span></span>
      <span class="card__title">${esc(def.name)}</span>
      <span class="card__text">${esc(def.question)}</span>
    </a>`;
  },

  informationCard(guide) {
    const links = guide.calculators.map((id) => {
      const entry = Calculators.entry(id);
      if (!entry) throw new Error(`Guide "${guide.id}" links to "${id}", which is not in the catalogue`);
      return Calculators.get(id)
        ? `<li><a href="${App.toolUrl(id)}">Open the ${esc(entry.name)}</a></li>`
        : `<li>${esc(entry.name)} <span class="card__planned">(planned)</span></li>`;
    });
    return `<article class="card">
      <span class="card__meta">${guide.status === "planned" ? '<span class="chip-demo">Planned guide</span>' : ""}</span>
      <h3 class="card__title">${esc(guide.title)}</h3>
      ${guide.status === "planned" ? "" : `<p class="card__text">${esc(guide.summary)}</p>`}
      ${links.length ? `<ul class="card__links">${links.join("")}</ul>` : ""}
    </article>`;
  },

  /* ---- Search ------------------------------------------------------------- */

  // One flat index over the whole catalogue (live and planned) and the pages.
  // Rebuilt per search so newly registered calculators are included automatically.
  searchIndex() {
    const tools = [...Calculators.catalogue.values()].map((e) => {
      const live = Calculators.get(e.id);
      const area = App.areaOfTheme(e.theme);
      return {
        kind: live ? "Calculator" : "Planned",
        label: e.name,
        context: SITE.themeLabels[e.theme],
        href: live ? App.toolUrl(e.id) : `${App.page(area.id).href}#theme-${e.theme}`,
        haystack: [e.name, e.question, e.plannedInputs, e.plannedOutputs, SITE.themeLabels[e.theme], ...((live && live.keywords) || [])].join(" ").toLowerCase(),
      };
    });
    const pages = SITE.pages
      .filter((p) => p.id !== "home")
      .map((p) => ({ kind: "Page", label: p.label, context: "", href: p.href, haystack: p.label.toLowerCase() }));
    return [...tools, ...pages];
  },

  search(query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const rank = { Calculator: 0, Planned: 1, Page: 2 };
    return App.searchIndex()
      .filter((item) => tokens.every((t) => item.haystack.includes(t)))
      .sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label))
      .slice(0, 8);
  },

  /* ---- Components --------------------------------------------------------- */

  mountComponents(root) {
    root.querySelectorAll("[data-component]").forEach((el) => {
      const render = App.components[el.dataset.component];
      if (!render) throw new Error(`Unknown component "${el.dataset.component}"`);
      try {
        render(el);
      } catch (err) {
        console.error(err);
        el.innerHTML = App.errorBox("This section could not be shown.", err.message);
      }
    });
  },

  components: {
    // <div data-component="tool-search"></div>
    "tool-search"(el) {
      const inputId = App.uid("search");
      el.innerHTML = `
        <form class="search" role="search">
          <label class="visually-hidden" for="${inputId}">Search calculators, tools or topics</label>
          <div class="search__field">
            <svg class="search__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
            <input id="${inputId}" class="search__input" type="search" placeholder="Search calculators, tools or topics..." autocomplete="off" enterkeyhint="search">
            <button type="submit" class="btn btn--primary">Search</button>
          </div>
          <p class="visually-hidden" role="status" aria-live="polite"></p>
          <ul class="search__results" hidden></ul>
        </form>`;
      const form = el.querySelector("form");
      const input = el.querySelector("input");
      const status = el.querySelector("[role=status]");
      const list = el.querySelector("ul");
      let results = [];

      const run = () => {
        const query = input.value.trim();
        results = App.search(query);
        list.hidden = !query;
        if (!query) {
          list.innerHTML = "";
          status.textContent = "";
          return;
        }
        list.innerHTML = results.length
          ? results
              .map((r) => `<li><a class="search__result" href="${r.href}"><span class="search__result-label">${esc(r.label)}</span><span class="search__result-context">${esc([r.kind, r.context].filter(Boolean).join(": "))}</span></a></li>`)
              .join("")
          : `<li class="search__none">No matches for “${esc(query)}”. Try a shorter word, or browse the topic pages.</li>`;
        status.textContent = results.length ? `${results.length} results` : "No results";
      };

      input.addEventListener("input", run);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        run();
        if (results.length) window.location.href = results[0].href;
      });

      const initial = App.query().get("q");
      if (initial) {
        input.value = initial;
        run();
      }
    },

    // <div data-component="level-selector" data-all></div>   (data-all adds an "All" card)
    "level-selector"(el) {
      const current = App.query().get("level");
      if (current) App.level(current);
      const cards = SITE.levels.map((l) => ({ ...l, href: `calculators.html?level=${l.id}`, active: current === l.id }));
      if (el.hasAttribute("data-all")) {
        cards.unshift({ id: "all", label: "All calculators", summary: "Every calculator, from everyday sums to statistics.", href: "calculators.html", active: !current });
      }
      el.innerHTML = `<ul class="grid">${cards
        .map((c) => `<li><a class="level-card" data-level="${c.id}" href="${c.href}"${c.active ? ' aria-current="true"' : ""}><span class="level-card__title">${esc(c.label)}</span><span class="level-card__summary">${esc(c.summary)}</span></a></li>`)
        .join("")}</ul>`;
    },

    // <div data-component="tool-grid" data-area="money" data-level="basic|query" data-popular></div>
    "tool-grid"(el) {
      const filter = {};
      if (el.dataset.area) filter.area = App.area(el.dataset.area).id;
      if (el.dataset.level === "query") {
        const level = App.query().get("level");
        if (level) filter.level = App.level(level).id;
      } else if (el.dataset.level) {
        filter.level = App.level(el.dataset.level).id;
      }
      if (el.hasAttribute("data-popular")) filter.popular = true;

      const tools = Calculators.list(filter);
      el.innerHTML = tools.length
        ? `<ul class="grid">${tools.map((t) => `<li>${App.calculatorCard(t)}</li>`).join("")}</ul>`
        : App.emptyState("No calculators here yet", "Calculators are added in stages. The topic lists show what is planned.");
    },

    // <div data-component="area-cards" data-exclude-current></div>
    "area-cards"(el) {
      const current = document.body.dataset.page;
      const areas = SITE.areas.filter((a) => !(el.hasAttribute("data-exclude-current") && a.id === current));
      el.innerHTML = `<ul class="grid">${areas
        .map((a) => `<li><a class="area-card" href="${App.page(a.id).href}"><img src="${a.image}" width="640" height="400" loading="lazy" alt=""><span class="area-card__body"><span class="area-card__title">${esc(a.label)}</span><span class="area-card__summary">${esc(a.summary)}</span></span></a></li>`)
        .join("")}</ul>`;
    },

    // <div data-component="topic-list" data-area="life"></div>
    // Lists every catalogue calculator in the area: live ones link, planned ones are marked.
    "topic-list"(el) {
      const area = App.area(el.dataset.area);
      if (!area.themes.length) {
        el.innerHTML = `<ul class="chips">${App.data.guides.topics.map((t) => `<li><span class="chip">${esc(t)}</span></li>`).join("")}</ul>`;
        return;
      }
      el.innerHTML = area.themes
        .map((theme) => {
          const chips = [...Calculators.catalogue.values()]
            .filter((e) => e.theme === theme)
            .map((e) => {
              const label = esc(e.name.replace(/ Calculator$/, ""));
              return Calculators.get(e.id)
                ? `<li><a class="chip chip--live" href="${App.toolUrl(e.id)}">${label}</a></li>`
                : `<li><span class="chip chip--planned">${label}<span class="visually-hidden"> (planned)</span></span></li>`;
            });
          return `<div class="topic-group" id="theme-${theme}"><h3 class="topic-group__title">${esc(SITE.themeLabels[theme])}</h3><ul class="chips">${chips.join("")}</ul></div>`;
        })
        .join("");
    },

    // <div data-component="guide-list" data-area="money" data-limit="3"></div>
    "guide-list"(el) {
      let guides = App.data.guides.guides;
      if (el.dataset.area) guides = guides.filter((g) => App.areaOfTheme(g.theme).id === App.area(el.dataset.area).id);
      if (el.dataset.limit) guides = guides.slice(0, Number(el.dataset.limit));
      el.innerHTML = guides.length
        ? `<ul class="grid">${guides.map((g) => `<li>${App.informationCard(g)}</li>`).join("")}</ul>`
        : App.emptyState("No guides in this area yet", "Each guide will explain one practical topic and link straight to the calculator that works it out.");
    },

    // calculators.html only. Draws one calculator when ?tool= is present.
    // Everything marked [data-directory] is the directory view and is removed in tool view,
    // so a tool page has exactly one <h1>.
    "tool-view"(el) {
      const id = App.query().get("tool");
      if (!id) return;
      document.querySelectorAll("[data-directory]").forEach((n) => n.remove());

      const def = Calculators.get(id);
      if (def) {
        Engine.applyMeta(def);
        Engine.render(def, el);
        return;
      }

      // Not built: either planned (in the catalogue) or unknown. Neither is indexed.
      const entry = Calculators.entry(id);
      const robots = document.createElement("meta");
      robots.name = "robots";
      robots.content = "noindex";
      document.head.append(robots);
      document.title = `${entry ? entry.name : "Calculator not found"} | ${SITE.fullName}`;
      el.innerHTML = `<section class="section"><div class="container">
        <h1 class="section__title">${entry ? esc(entry.name) : "Calculator not found"}</h1>
        <p class="section__intro">${entry ? `${esc(entry.question)} This calculator is planned but not available yet.` : `There is no calculator called “${esc(id)}”.`}</p>
        <p class="section__more"><a href="calculators.html">Browse the available calculators</a></p>
      </div></section>`;
    },
  },
};

document.addEventListener("DOMContentLoaded", App.init);
