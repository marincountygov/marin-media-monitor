#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const { loadSources, loadMonitors } = require("./config");
const { fetchSource, refreshIntervalFor } = require("./connectors");
const { normalizeItem } = require("./normalize");
const { matchItems } = require("./match");
const { dedupeItems } = require("./dedupe");

const PRUNE_DAYS = 60;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([\w-]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function loadPrevious(source) {
  if (!source) return { items: [], sources: {} };
  try {
    const text = /^https?:\/\//.test(source)
      ? await (await fetch(source)).text()
      : fs.existsSync(source)
        ? fs.readFileSync(source, "utf8")
        : null;
    if (!text) return { items: [], sources: {} };
    const parsed = JSON.parse(text);
    const sourcesById = Object.fromEntries((parsed.sources || []).map((s) => [s.id, s]));
    return { items: parsed.items || [], sources: sourcesById };
  } catch (error) {
    console.warn(`Could not load previous snapshot from ${source}: ${error.message}`);
    return { items: [], sources: {} };
  }
}

function isDue(previousHealth, refreshIntervalMinutes, now) {
  if (!previousHealth?.lastFetchedAt) return true;
  const elapsedMinutes = (now - new Date(previousHealth.lastFetchedAt).getTime()) / 60_000;
  return elapsedMinutes >= refreshIntervalMinutes;
}

async function buildOnce({ previousSnapshotPath, outPath, env = process.env }) {
  const sources = loadSources();
  const monitors = loadMonitors();
  const previous = await loadPrevious(previousSnapshotPath);
  const now = Date.now();

  const context = {
    monitors,
    apiKey: env.YOUTUBE_API_KEY,
    clientId: env.REDDIT_CLIENT_ID,
    clientSecret: env.REDDIT_CLIENT_SECRET,
  };

  const health = [];
  const allItems = [];

  for (const source of sources) {
    const previousHealth = previous.sources[source.id];
    const previousItems = previous.items.filter((item) => item.sourceId === source.id);

    if (!source.enabled) {
      health.push({ ...healthDefaults(source), status: "disabled", itemCount: 0 });
      continue;
    }

    const refreshIntervalMinutes = refreshIntervalFor(source);
    const due = isDue(previousHealth, refreshIntervalMinutes, now);

    if (!due) {
      allItems.push(...previousItems);
      health.push({
        ...healthDefaults(source),
        status: previousHealth?.status === "error" ? "error" : "connected",
        lastFetchedAt: previousHealth?.lastFetchedAt ?? null,
        itemCount: previousItems.length,
        cached: true,
      });
      continue;
    }

    try {
      const { items: rawItems } = await fetchSource(source, context);
      const normalized = rawItems.map(normalizeItem);
      allItems.push(...normalized);
      health.push({
        ...healthDefaults(source),
        status: "connected",
        lastFetchedAt: new Date(now).toISOString(),
        itemCount: normalized.length,
      });
    } catch (error) {
      console.warn(`[${source.id}] fetch failed: ${error.message}`);
      allItems.push(...previousItems);
      health.push({
        ...healthDefaults(source),
        status: "error",
        statusDetail: error.message,
        lastFetchedAt: previousHealth?.lastFetchedAt ?? null,
        itemCount: previousItems.length,
      });
    }
  }

  const matched = matchItems(allItems, monitors);
  const deduped = dedupeItems(matched);

  const cutoff = now - PRUNE_DAYS * 24 * 60 * 60 * 1000;
  const pruned = deduped.filter((item) => new Date(item.publishedAt).getTime() >= cutoff);

  pruned.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  pruned.forEach((item) => {
    delete item._contentId;
  });

  const output = {
    generatedAt: new Date(now).toISOString(),
    monitors: monitors.map((m) => ({
      id: m.id,
      name: m.name,
      group: m.group || "General",
      include: m.include,
      exclude: m.exclude || [],
    })),
    sources: health,
    items: pruned,
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output));
  }

  return output;
}

// A single human-visitable URL for the source, resolved server-side so the
// UI doesn't need type-specific knowledge of sources.yaml's shape. Not
// every source type has one worth linking (youtube/bluesky/reddit/nextdoor
// scan broadly, with no single "the source" page) — those get none.
function sourceLink(source) {
  if (source.type === "rss" && source.url) return source.url;
  if (source.type === "google-news" && source.query) {
    return `https://news.google.com/search?q=${encodeURIComponent(source.query)}&hl=en-US&gl=US&ceid=US:en`;
  }
  if (source.type === "youtube-rss" && source.channelId) {
    return `https://www.youtube.com/channel/${source.channelId}`;
  }
  return undefined;
}

function healthDefaults(source) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    region: source.region,
    enabled: source.enabled,
    costCategory: source.costCategory,
    note: source.note,
    link: sourceLink(source),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out || path.join(__dirname, "..", "dist", "data.json");
  const previousSnapshotPath = args.previous;

  const output = await buildOnce({ previousSnapshotPath, outPath });
  console.log(
    `Wrote ${output.items.length} items from ${output.sources.filter((s) => s.enabled).length} enabled sources to ${outPath}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildOnce };
