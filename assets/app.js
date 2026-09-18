// App-specific behavior only. Standard menu, dialog, and navigation behavior
// already come from shared/app-shell.js — do not reimplement them here.

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    data: null,
    search: "",
    selectedMonitors: new Set(),
    selectedPlatforms: new Set(),
    contentType: "all",
    time: "24h",
    sourceTypeFilter: "all",
    sourceSortKey: null,
    sourceSortDirection: "ascending",
  };

  const elements = {
    monitorChips: document.querySelector("#monitor-chips"),
    platformCheckboxes: document.querySelector("#platform-checkboxes"),
    contentTabs: document.querySelector("#content-tabs"),
    searchInput: document.querySelector("#filter-search"),
    timeSelect: document.querySelector("#filter-time"),
    filtersForm: document.querySelector("#filters"),
    refreshButton: document.querySelector("#refresh-button"),
    resetButton: document.querySelector("#reset-filters-button"),
    lastUpdated: document.querySelector("#last-updated"),
    activeFilters: document.querySelector("#active-filters"),
    counts: document.querySelector("#mention-counts"),
    feed: document.querySelector("#media-feed"),
    statusMessage: document.querySelector("#app-status-message"),
    sourcesWrap: document.querySelector("#sources-table-wrap"),
    sourceTypeTabs: document.querySelector("#source-type-tabs"),
    monitorsList: document.querySelector("#monitors-list"),
    copyEmailButton: document.querySelector("#copy-email-button"),
    copyFallback: document.querySelector("#copy-fallback"),
    copyFallbackText: document.querySelector("#copy-fallback-text"),
  };

  const TIME_WINDOWS_MS = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "60d": 60 * 24 * 60 * 60 * 1000,
    all: null,
  };

  const PLATFORM_LABELS = {
    rss: "News",
    "google-news": "News",
    youtube: "YouTube",
    bluesky: "Bluesky",
    reddit: "Reddit",
    nextdoor: "Nextdoor",
  };

  const SOURCE_TYPE_LABELS = {
    rss: "RSS",
    "google-news": "Google News",
    youtube: "YouTube (search)",
    "youtube-rss": "YouTube (channel)",
    bluesky: "Bluesky",
    reddit: "Reddit",
    nextdoor: "Nextdoor",
  };

  // The Sources filter shows one checkbox per platform as in the plan's
  // mockup (News / YouTube / Bluesky / Nextdoor / Reddit) even though "News"
  // is backed by two distinct source types (direct rss + google-news
  // fallback) — group them so the UI doesn't show "News" twice.
  const PLATFORM_GROUPS = [
    { key: "news", label: "News", types: ["rss", "google-news"] },
    { key: "youtube", label: "YouTube", types: ["youtube", "youtube-rss"] },
    { key: "bluesky", label: "Bluesky", types: ["bluesky"] },
    { key: "nextdoor", label: "Nextdoor", types: ["nextdoor"] },
    { key: "reddit", label: "Reddit", types: ["reddit"] },
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function announce(message) {
    if (elements.statusMessage) elements.statusMessage.textContent = message;
  }

  async function loadData({ isRefresh = false } = {}) {
    announce(isRefresh ? "Refreshing…" : "Loading media monitor data…");
    try {
      const response = await fetch(`data.json?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = await response.json();
      renderAll();
      announce(isRefresh ? "Refreshed." : "Loaded.");
    } catch (error) {
      console.error(error);
      announce("Could not load media monitor data. Try refreshing the page.");
      if (elements.feed) {
        elements.feed.innerHTML = `<li class="app-card"><p class="app-error">Could not load data.json (${escapeHtml(error.message)}).</p><p class="app-help-text">If you're developing locally, run <code>npm run dev</code> and serve this folder — don't open index.html directly.</p></li>`;
      }
    }
  }

  function renderAll() {
    renderLastUpdated();
    renderMonitorChips();
    renderPlatformCheckboxes();
    renderFeed();
    renderSourcesTable();
    renderMonitorsList();
  }

  function renderLastUpdated() {
    if (!state.data || !elements.lastUpdated) return;
    const date = new Date(state.data.generatedAt);
    elements.lastUpdated.innerHTML =
      `Last updated: <time datetime="${date.toISOString()}">${escapeHtml(
        date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      )}</time>` + ` (updates every 10&ndash;15 minutes)`;
  }

  /** Group a list by a key function, preserving first-seen group order. */
  function groupBy(list, keyFn) {
    const groups = new Map();
    list.forEach((item) => {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return groups;
  }

  function renderMonitorChips() {
    if (!state.data || !elements.monitorChips) return;
    const monitors = state.data.monitors || [];
    elements.monitorChips.dataset.loading = "false";

    if (monitors.length === 0) {
      elements.monitorChips.innerHTML =
        '<legend>Monitors</legend><p class="app-help-text">No monitors configured. Add one to config/monitors.yaml.</p>';
      return;
    }

    // Two-level filter: a simplified top-level list of groups (collapsed by
    // default, so the sidebar isn't overwhelmed by 30+ monitors at once),
    // each expanding to its individual monitor checkboxes.
    const groups = groupBy(monitors, (m) => m.group || "General");
    elements.monitorChips.innerHTML =
      "<legend>Monitors</legend>" +
      Array.from(groups.entries())
        .map(
          ([groupName, groupMonitors]) => `
        <details class="mm-facet-group">
          <summary>${escapeHtml(groupName)} <span class="app-help-text" data-group-count="${escapeHtml(groupName)}"></span></summary>
          <ul class="search-facet-list">
            ${groupMonitors
              .map((monitor) => {
                const id = `monitor-${monitor.id}`;
                const checked = state.selectedMonitors.has(monitor.id);
                return (
                  `<li><label for="${id}">` +
                  `<input type="checkbox" id="${id}" data-monitor-id="${escapeHtml(monitor.id)}" ${checked ? "checked" : ""}>` +
                  `${escapeHtml(monitor.name)} <span class="search-facet-count" data-monitor-count="${escapeHtml(monitor.id)}"></span>` +
                  `</label></li>`
                );
              })
              .join("")}
          </ul>
        </details>`
        )
        .join("");

    elements.monitorChips.querySelectorAll("input[data-monitor-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.monitorId;
        if (checkbox.checked) state.selectedMonitors.add(id);
        else state.selectedMonitors.delete(id);
        renderFeed();
      });
    });
  }

  function renderPlatformCheckboxes() {
    if (!state.data || !elements.platformCheckboxes) return;
    const sources = state.data.sources || [];
    const groups = PLATFORM_GROUPS.filter((group) => sources.some((s) => group.types.includes(s.type)));
    elements.platformCheckboxes.dataset.loading = "false";

    // Default: everything except Reddit/Nextdoor is checked — those two
    // stay opt-in even when technically enabled, since they're the least
    // proven/most access-constrained sources (see README).
    if (state.selectedPlatforms.size === 0) {
      groups.forEach((group) => {
        if (group.key !== "reddit" && group.key !== "nextdoor") state.selectedPlatforms.add(group.key);
      });
    }

    elements.platformCheckboxes.innerHTML =
      "<legend>Sources</legend>" +
      `<ul class="search-facet-list">${groups
        .map((group) => {
          const anyEnabled = sources.some((s) => group.types.includes(s.type) && s.enabled);
          const checked = state.selectedPlatforms.has(group.key);
          const id = `platform-${group.key}`;
          return (
            `<li><label for="${id}">` +
            `<input type="checkbox" id="${id}" data-platform-key="${escapeHtml(group.key)}" ${checked ? "checked" : ""} ${anyEnabled ? "" : "disabled"}>` +
            `${escapeHtml(group.label)} <span class="search-facet-count" data-platform-count="${escapeHtml(group.key)}"></span>` +
            `${anyEnabled ? "" : ' <span class="app-help-text">(disabled)</span>'}` +
            `</label></li>`
          );
        })
        .join("")}</ul>`;

    elements.platformCheckboxes.querySelectorAll("input[data-platform-key]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const key = checkbox.dataset.platformKey;
        if (checkbox.checked) state.selectedPlatforms.add(key);
        else state.selectedPlatforms.delete(key);
        renderFeed();
      });
    });
  }

  // skipMonitor/skipPlatform let the facet-count logic ask "how many items
  // would match if every OTHER filter stayed as-is" for a given dimension,
  // instead of collapsing to whatever's currently selected in that facet.
  function passesFilters(item, { skipMonitor = false, skipPlatform = false } = {}) {
    if (
      !skipMonitor &&
      state.selectedMonitors.size > 0 &&
      !item.matchedMonitors.some((id) => state.selectedMonitors.has(id))
    ) {
      return false;
    }
    if (!skipPlatform) {
      const group = PLATFORM_GROUPS.find((g) => g.types.includes(item.platform));
      if (!group || !state.selectedPlatforms.has(group.key)) return false;
    }
    if (state.contentType !== "all" && item.sourceType !== state.contentType) return false;
    if (state.time !== "all") {
      const windowMs = TIME_WINDOWS_MS[state.time];
      if (Date.now() - new Date(item.publishedAt).getTime() > windowMs) return false;
    }
    if (state.search) {
      const haystack = `${item.title || ""} ${item.text || ""}`.toLowerCase();
      if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    return true;
  }

  function matchesFilters(item) {
    return passesFilters(item);
  }

  function updateFacetCounts() {
    if (!state.data) return;

    const forMonitors = state.data.items.filter((item) => passesFilters(item, { skipMonitor: true }));
    (state.data.monitors || []).forEach((monitor) => {
      const count = forMonitors.filter((item) => item.matchedMonitors.includes(monitor.id)).length;
      const el = elements.monitorChips?.querySelector(`[data-monitor-count="${monitor.id}"]`);
      if (el) el.textContent = `(${count})`;
    });

    // Group header count = items matching ANY monitor in that group (not
    // the number of monitors it contains).
    const monitorGroups = groupBy(state.data.monitors || [], (m) => m.group || "General");
    const groupCountEls = Array.from(elements.monitorChips?.querySelectorAll("[data-group-count]") || []);
    monitorGroups.forEach((groupMonitors, groupName) => {
      const groupMonitorIds = new Set(groupMonitors.map((m) => m.id));
      const count = forMonitors.filter((item) => item.matchedMonitors.some((id) => groupMonitorIds.has(id))).length;
      // Compared in JS, not as a CSS attribute-selector string — group
      // names can contain "&", which some CSS selector engines mishandle
      // even inside a quoted attribute value.
      const el = groupCountEls.find((span) => span.dataset.groupCount === groupName);
      if (el) el.textContent = `(${count})`;
    });

    const forPlatforms = state.data.items.filter((item) => passesFilters(item, { skipPlatform: true }));
    PLATFORM_GROUPS.forEach((group) => {
      const count = forPlatforms.filter((item) => group.types.includes(item.platform)).length;
      const el = elements.platformCheckboxes?.querySelector(`[data-platform-count="${group.key}"]`);
      if (el) el.textContent = `(${count})`;
    });
  }

  function renderCard(item) {
    const date = new Date(item.publishedAt);
    const heading = item.title || item.text?.slice(0, 120) || item.source;
    const showSeparateSnippet = item.title && item.text;

    return (
      `<li class="app-card mm-card">` +
      (item.image ? `<img class="mm-card__image" src="${escapeHtml(item.image)}" alt="" loading="lazy">` : "") +
      `<div class="mm-card__body">` +
      `<div class="mm-card__meta">` +
      `<span class="app-badge">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform)}</span>` +
      `</div>` +
      `<h3 class="mm-card__title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(heading)}</a></h3>` +
      `<p class="mm-card__byline">` +
      `<time datetime="${date.toISOString()}" title="${escapeHtml(date.toLocaleString())}">${escapeHtml(
        date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      )}</time>` +
      ` — <span class="mm-card__source">${
        item.sourceUrl
          ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.source)}</a>`
          : escapeHtml(item.source)
      }</span>` +
      `</p>` +
      (showSeparateSnippet ? `<p class="mm-card__text">${escapeHtml(truncate(item.text, 220))}</p>` : "") +
      renderMonitorBadges(item.matchedMonitors) +
      `</div>` +
      `</li>`
    );
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || "";
    return `${text.slice(0, max).trim()}…`;
  }

  function describeActiveFilters() {
    const parts = [];

    const timeLabel = elements.timeSelect?.options[elements.timeSelect.selectedIndex]?.text;
    parts.push(timeLabel || state.time);

    if (state.selectedMonitors.size > 0) {
      const names = state.data.monitors
        .filter((m) => state.selectedMonitors.has(m.id))
        .map((m) => m.name);
      parts.push(names.join(", "));
    } else {
      parts.push("All monitors");
    }

    const allPlatformKeys = PLATFORM_GROUPS.map((g) => g.key);
    if (state.selectedPlatforms.size > 0 && state.selectedPlatforms.size < allPlatformKeys.length) {
      const labels = PLATFORM_GROUPS.filter((g) => state.selectedPlatforms.has(g.key)).map((g) => g.label);
      parts.push(labels.join(", "));
    }

    if (state.contentType !== "all") {
      const tabLabel = elements.contentTabs?.querySelector(`[data-content-type="${state.contentType}"]`)?.textContent;
      parts.push(tabLabel || state.contentType);
    }

    if (state.search) parts.push(`matching "${state.search}"`);

    return parts.join(" · ");
  }

  function renderFeed() {
    if (!state.data || !elements.feed) return;
    const items = state.data.items.filter(matchesFilters);
    state.lastFilteredItems = items;

    if (elements.activeFilters) elements.activeFilters.textContent = `Showing: ${describeActiveFilters()}`;

    const counts = { news: 0, video: 0, social: 0 };
    items.forEach((item) => {
      counts[item.sourceType] = (counts[item.sourceType] || 0) + 1;
    });
    if (elements.counts) {
      elements.counts.textContent =
        `${items.length} mention${items.length === 1 ? "" : "s"} — ` +
        `News ${counts.news}, Video ${counts.video}, Social ${counts.social}`;
    }

    elements.feed.innerHTML = items.length
      ? items.map(renderCard).join("")
      : '<li class="app-empty">No mentions match the current filters.</li>';

    updateFacetCounts();
  }

  function statusInfo(source) {
    if (!source.enabled) return { text: "Disabled", status: null };
    if (source.status === "error") return { text: "Temporarily unavailable", status: "error" };
    if (source.cached) return { text: "Connected (cached)", status: "success" };
    return { text: "Connected", status: "success" };
  }

  function renderSourceTypeTabs(sources) {
    if (!elements.sourceTypeTabs) return;
    const types = Array.from(new Set(sources.map((s) => s.type)));
    const tabs = [{ key: "all", label: "All" }, ...types.map((type) => ({ key: type, label: SOURCE_TYPE_LABELS[type] || type }))];

    elements.sourceTypeTabs.innerHTML = tabs
      .map(
        (tab) =>
          `<button type="button" role="tab" aria-selected="${state.sourceTypeFilter === tab.key}" data-source-type="${escapeHtml(tab.key)}" class="mm-tab">${escapeHtml(tab.label)}</button>`
      )
      .join("");

    elements.sourceTypeTabs.querySelectorAll("[data-source-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.sourceTypeFilter = button.dataset.sourceType;
        renderSourcesTable();
      });
    });
  }

  function renderSourcesTable() {
    if (!state.data || !elements.sourcesWrap) return;
    const sources = state.data.sources || [];
    renderSourceTypeTabs(sources);

    const visible =
      state.sourceTypeFilter === "all" ? sources : sources.filter((s) => s.type === state.sourceTypeFilter);

    elements.sourcesWrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th><button type="button" class="mm-sort-button" data-sort-key="name">Source</button></th>
            <th><button type="button" class="mm-sort-button" data-sort-key="region">Geography</button></th>
            <th><button type="button" class="mm-sort-button" data-sort-key="method">Ingestion</button></th>
            <th><button type="button" class="mm-sort-button" data-sort-key="status">Status</button></th>
            <th><button type="button" class="mm-sort-button" data-sort-key="lastchecked">Last checked</button></th>
            <th><button type="button" class="mm-sort-button" data-sort-key="items">Items</button></th>
          </tr>
        </thead>
        <tbody>
          ${visible
            .map((source) => {
              const { text: statusText, status } = statusInfo(source);
              const statusMarkup = status
                ? `<span class="app-status" data-status="${status}">${escapeHtml(statusText)}</span>`
                : `<span class="app-badge">${escapeHtml(statusText)}</span>`;
              const lastChecked = source.lastFetchedAt ? new Date(source.lastFetchedAt).toLocaleString() : "Never";
              const nameMarkup = source.link
                ? `<a href="${escapeHtml(source.link)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>`
                : escapeHtml(source.name);
              return `<tr
                data-sort-name="${escapeHtml(source.name)}"
                data-sort-region="${escapeHtml(source.region || "")}"
                data-sort-method="${escapeHtml(source.type)}"
                data-sort-status="${escapeHtml(statusText)}"
                data-sort-lastchecked="${escapeHtml(source.lastFetchedAt || "")}"
                data-sort-items="${source.itemCount || 0}"
              >
                <td>${nameMarkup}</td>
                <td>${escapeHtml(source.region || "—")}</td>
                <td>${escapeHtml(SOURCE_TYPE_LABELS[source.type] || source.type)}</td>
                <td>${statusMarkup}${source.statusDetail ? ` <span class="app-help-text">(${escapeHtml(source.statusDetail)})</span>` : ""}</td>
                <td>${escapeHtml(lastChecked)}</td>
                <td>${source.itemCount || 0}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

    wireSourceTableSort(elements.sourcesWrap.querySelector("table"));
  }

  // shared/app-shell.js has a generic sortable-table behavior, but it only
  // wires up tables present at page load — this one is rendered later,
  // once data.json has loaded, so it needs its own (same technique: sort
  // rows by their data-sort-<key> attribute, toggle direction on repeat
  // clicks). Persisted on state so the sort survives switching source-type
  // tabs, which re-renders this table.
  function applySourceSort(table) {
    if (!state.sourceSortKey) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    const rows = Array.from(tbody.children);
    rows.sort((a, b) => {
      const valueA = a.getAttribute(`data-sort-${state.sourceSortKey}`) ?? "";
      const valueB = b.getAttribute(`data-sort-${state.sourceSortKey}`) ?? "";
      const result = valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: "base" });
      return state.sourceSortDirection === "ascending" ? result : -result;
    });
    tbody.append(...rows);
    table.querySelectorAll(".mm-sort-button").forEach((button) => {
      button.closest("th")?.setAttribute(
        "aria-sort",
        button.dataset.sortKey === state.sourceSortKey ? state.sourceSortDirection : "none"
      );
    });
  }

  function wireSourceTableSort(table) {
    if (!table) return;
    table.querySelectorAll(".mm-sort-button").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.sortKey;
        state.sourceSortDirection =
          state.sourceSortKey === key && state.sourceSortDirection === "ascending" ? "descending" : "ascending";
        state.sourceSortKey = key;
        applySourceSort(table);
      });
    });
    applySourceSort(table);
  }

  // An include/exclude entry is normally a single phrase, but can be a list
  // of phrases meaning ALL of them must appear together (see
  // config/monitors.yaml's header comment and build/match.js).
  // "word:MCA" (see build/match.js) means "match as a whole word" — strip
  // the prefix for display, same as the build pipeline does for
  // matchedTerms.
  function stripWordPrefix(term) {
    return typeof term === "string" && term.startsWith("word:") ? term.slice(5) : term;
  }

  function entryLabel(entry) {
    return Array.isArray(entry) ? entry.map(stripWordPrefix).join(" AND ") : stripWordPrefix(entry);
  }

  function renderTermList(entries) {
    return `<div class="mm-terms">${entries.map((entry) => `<span class="mm-term">${escapeHtml(entryLabel(entry))}</span>`).join("")}</div>`;
  }

  /** A card's matched-monitor badges — each one a button that jumps the
   * sidebar filter to just that monitor, so clicking "Marin County
   * Sheriff" on a card shows every other mention that monitor caught. */
  function renderMonitorBadges(matchedMonitorIds) {
    if (!matchedMonitorIds?.length) return "";
    return `<div class="mm-terms">${matchedMonitorIds
      .map((id) => {
        const monitor = state.data.monitors.find((m) => m.id === id);
        return `<button type="button" class="mm-term mm-term--button" data-filter-monitor="${escapeHtml(id)}">${escapeHtml(monitor?.name || id)}</button>`;
      })
      .join("")}</div>`;
  }

  /** Set the sidebar filter to exactly one monitor (replacing whatever was
   * selected), used by clicking a monitor badge on a card. Syncs the
   * sidebar's own checkboxes/open state so the UI doesn't show a filter
   * that's out of sync with what's actually applied. */
  function selectOnlyMonitor(monitorId) {
    state.selectedMonitors = new Set([monitorId]);
    elements.monitorChips?.querySelectorAll("input[data-monitor-id]").forEach((checkbox) => {
      checkbox.checked = checkbox.dataset.monitorId === monitorId;
    });
    const checkbox = elements.monitorChips?.querySelector(`input[data-monitor-id="${monitorId}"]`);
    const details = checkbox?.closest("details");
    if (details) details.open = true;
    renderFeed();
  }

  function renderMonitorsList() {
    if (!state.data || !elements.monitorsList) return;
    const monitors = state.data.monitors || [];
    const groups = groupBy(monitors, (m) => m.group || "General");

    elements.monitorsList.innerHTML = Array.from(groups.entries())
      .map(
        ([groupName, groupMonitors]) => `
      <section class="mm-monitor-group">
        <h3>${escapeHtml(groupName)}</h3>
        ${groupMonitors
          .map(
            (monitor) => `
          <article class="app-card">
            <h4>${escapeHtml(monitor.name)}</h4>
            <p class="app-help-text">Include</p>
            ${renderTermList(monitor.include)}
            ${monitor.exclude.length ? `<p class="app-help-text">Exclude</p>${renderTermList(monitor.exclude)}` : ""}
          </article>`
          )
          .join("")}
      </section>`
      )
      .join("");
  }

  /** Build both clipboard flavors from the currently filtered items — the
   * exact list renderFeed() last showed on screen, same order. `text/html`
   * renders nicely when pasted into a rich-text email body; `text/plain`
   * is the fallback for plain-text clients. Mirrors what's on the cards
   * (source, time, title, snippet, link) — no matched-monitor/term detail,
   * to stay consistent with the cards themselves. */
  function matchedMonitorNames(item) {
    return item.matchedMonitors.map((id) => state.data.monitors.find((m) => m.id === id)?.name || id);
  }

  // Order (per request): heading, then date + source (date first), then
  // description, then which monitors matched.
  // "(Past 3 days)" — reuses the Time dropdown's own option text, so this
  // always matches what the sidebar/"Showing:" line say verbatim, for a
  // bounded time filter. "(since Aug 3, 2026)" for "All available data",
  // where there's no fixed window to name — derived from the oldest item
  // actually in the digest.
  function digestRangeLabel(items) {
    if (state.time !== "all") {
      const timeLabel = elements.timeSelect?.options[elements.timeSelect.selectedIndex]?.text;
      return `(${timeLabel || state.time})`;
    }
    if (!items.length) return "";
    const oldest = items.reduce((min, item) => Math.min(min, new Date(item.publishedAt).getTime()), Infinity);
    return `(since ${new Date(oldest).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })})`;
  }

  const DIGEST_EMOJI = "\u{1F514}"; // 🔔
  const COUNT_EMOJI = "\u{1F4A5}"; // 💥
  const TAG_EMOJI = "\u{1F3F7}\u{FE0F}"; // 🏷️
  const TITLE_EMOJI = "\u{1F7E2}"; // 🟢

  function buildDigest(items) {
    const now = new Date();
    const generatedDate = now.toLocaleString([], { month: "short", day: "numeric", year: "numeric" });
    const headerLine1 = `${DIGEST_EMOJI} Marin Media Monitor — ${generatedDate}`;
    const headerLine2 = `${COUNT_EMOJI} ${items.length} mention${items.length === 1 ? "" : "s"} ${digestRangeLabel(items)}`;

    const textBlocks = items.map((item) => {
      const heading = item.title || item.text?.slice(0, 120) || item.source;
      const when = new Date(item.publishedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const monitors = matchedMonitorNames(item);
      const lines = [`${TITLE_EMOJI} ${heading}`, `${when} — ${item.source}`];
      if (item.title && item.text) lines.push(truncate(item.text, 220));
      if (monitors.length) lines.push(`${TAG_EMOJI} ${monitors.join(", ")}`);
      lines.push(item.url);
      return lines.join("\n");
    });
    const text = [headerLine1, headerLine2, "", textBlocks.join("\n\n")].join("\n");

    // Gmail/Outlook/etc. paste-sanitizers routinely strip inline margin/
    // padding from pasted HTML, which silently ate the spacing here before
    // (div margins and an empty spacer div both vanished on paste). <br> is
    // structural content, not styling, so it survives — use it for every
    // gap that has to actually show up once pasted, not CSS margins. <i>/<b>
    // are plain inline formatting, not layout, so they survive too.
    const htmlBlocks = items.map((item) => {
      const heading = item.title || item.text?.slice(0, 120) || item.source;
      const when = new Date(item.publishedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const monitors = matchedMonitorNames(item);
      const fieldLines = [
        `<b>${TITLE_EMOJI} <a href="${escapeHtml(item.url)}">${escapeHtml(heading)}</a></b>`,
        `<i>${escapeHtml(when)}</i> &mdash; ${escapeHtml(item.source)}`,
      ];
      if (item.title && item.text) fieldLines.push(escapeHtml(truncate(item.text, 220)));
      if (monitors.length) fieldLines.push(`${TAG_EMOJI} ${escapeHtml(monitors.join(", "))}`);
      return fieldLines.join("<br>");
    });
    const htmlHeaderLine1 = `${DIGEST_EMOJI} Marin Media Monitor — <i>${escapeHtml(generatedDate)}</i>`;
    const html =
      `<div><b>${htmlHeaderLine1}</b><br>${escapeHtml(headerLine2)}<br><br>` +
      `${htmlBlocks.join("<br><br>")}</div>`;

    return { text, html };
  }

  function showCopyFallback(text) {
    if (!elements.copyFallback || !elements.copyFallbackText) return;
    elements.copyFallbackText.value = text;
    elements.copyFallback.hidden = false;
    elements.copyFallbackText.focus();
    elements.copyFallbackText.select();
  }

  /** Copy rich HTML to the clipboard the same way marin-magic's "Copy rich
   * text" button does: render it into a hidden contenteditable element,
   * select that element's contents, and let the browser's native
   * execCommand("copy") capture both the HTML and plain-text clipboard
   * flavors from the real selection — broader, longer-standing browser
   * support than writing multiple flavors via the async Clipboard API. */
  function copyRichTextToClipboard(html) {
    const temp = document.createElement("div");
    temp.contentEditable = "true";
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    temp.innerHTML = html;
    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand("copy");
    selection.removeAllRanges();
    document.body.removeChild(temp);
    return copied;
  }

  function copyDigestToClipboard() {
    const items = state.lastFilteredItems || [];
    if (items.length === 0) {
      announce("No mentions to copy — adjust the filters first.");
      return;
    }

    const { text, html } = buildDigest(items);
    if (elements.copyFallback) elements.copyFallback.hidden = true;

    try {
      const copied = copyRichTextToClipboard(html);
      if (!copied) throw new Error("execCommand(\"copy\") returned false");
      announce(`Copied ${items.length} mention${items.length === 1 ? "" : "s"} to clipboard.`);
    } catch (error) {
      console.error(error);
      showCopyFallback(text);
      announce("Couldn't copy automatically — select the text below and copy it manually.");
    }
  }

  elements.copyEmailButton?.addEventListener("click", copyDigestToClipboard);

  // Delegated: #media-feed's cards are fully re-rendered on every filter
  // change, so listeners are attached once here rather than per-card.
  elements.feed?.addEventListener("click", (event) => {
    const badge = event.target.closest("[data-filter-monitor]");
    if (!badge) return;
    selectOnlyMonitor(badge.dataset.filterMonitor);
  });

  elements.contentTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-content-type]");
    if (!button) return;
    state.contentType = button.dataset.contentType;
    elements.contentTabs.querySelectorAll("[data-content-type]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab === button));
    });
    renderFeed();
  });

  elements.searchInput?.addEventListener("input", () => {
    state.search = elements.searchInput.value.trim();
    renderFeed();
  });

  elements.timeSelect?.addEventListener("change", () => {
    state.time = elements.timeSelect.value;
    renderFeed();
  });

  elements.filtersForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadData({ isRefresh: true });
  });

  function resetFilters() {
    state.search = "";
    if (elements.searchInput) elements.searchInput.value = "";
    state.selectedMonitors = new Set();
    state.selectedPlatforms = new Set();
    state.time = "24h";
    if (elements.timeSelect) elements.timeSelect.value = "24h";
    state.contentType = "all";
    elements.contentTabs?.querySelectorAll("[data-content-type]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.contentType === "all"));
    });
    // Full re-render, not just renderFeed(): the monitor/platform sidebars
    // need to redraw too, since resetting to empty Sets means "recompute
    // the default selection," and the monitor groups should collapse back
    // to closed the same way they start on first load.
    renderMonitorChips();
    renderPlatformCheckboxes();
    renderFeed();
    announce("Filters reset.");
  }

  elements.resetButton?.addEventListener("click", resetFilters);

  // shared/app-shell.js's tab-section logic only syncs aria-current on
  // #app-nav (also its mobile menu-toggle target) — #page-tabs is a
  // second, always-visible nav below the header for Latest/Sources/
  // Monitors, so it needs its own sync. Don't edit the vendored
  // app-shell.js for this; mirror its logic here instead.
  const pageTabs = document.querySelector("#page-tabs");
  if (pageTabs) {
    const pageTabNames = Array.from(pageTabs.querySelectorAll("a[href^='#']"), (a) => a.getAttribute("href").slice(1));
    const syncPageTabs = () => {
      const rawHash = window.location.hash.slice(1);
      const hash = pageTabNames.includes(rawHash) ? rawHash : "latest";
      pageTabs.querySelectorAll("a[href^='#']").forEach((link) => {
        if (link.getAttribute("href") === `#${hash}`) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    };
    window.addEventListener("hashchange", syncPageTabs);
    syncPageTabs();
  }

  loadData();
});
