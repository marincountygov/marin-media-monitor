"use strict";

/** Lowercase, normalize curly quotes/dashes to straight ones, and collapse
 * whitespace, so "Marin's" / "Marin’s" and multi-space runs all match
 * the same way. Deliberately simple string matching — no NLP. */
function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function textFieldsOf(item) {
  return [item.title, item.text].filter(Boolean).join(" ");
}

// Opt-in prefix for a single term: "word:MCA" matches "MCA" only as a whole
// word, not as a substring of anything else (plain "MCA" would also match
// inside "MCAL", the athletic league — a real false positive found in
// production). Every other term keeps the default plain-substring behavior
// unchanged; this only applies where a term is short/ambiguous enough that
// substring matching causes collisions like that one.
const WORD_BOUNDARY_PREFIX = "word:";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function singleTermMatches(term, haystack) {
  if (typeof term === "string" && term.startsWith(WORD_BOUNDARY_PREFIX)) {
    const word = normalizeForMatch(term.slice(WORD_BOUNDARY_PREFIX.length));
    return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(haystack);
  }
  return haystack.includes(normalizeForMatch(term));
}

/** An include/exclude entry is normally a single phrase (string). It can
 * also be a list of phrases, e.g. `["word:MCA", "Marin"]`, meaning ALL of
 * those phrases must be present — a compound AND clause for terms too
 * generic to use alone (a bare "MCA" would match unrelated content; "MCA"
 * appearing alongside "Marin" is specific enough). */
function entryMatches(entry, haystack) {
  const terms = Array.isArray(entry) ? entry : [entry];
  return terms.every((term) => singleTermMatches(term, haystack));
}

function stripWordPrefix(term) {
  return typeof term === "string" && term.startsWith(WORD_BOUNDARY_PREFIX)
    ? term.slice(WORD_BOUNDARY_PREFIX.length)
    : term;
}

function labelFor(entry) {
  return Array.isArray(entry) ? entry.map(stripWordPrefix).join(" + ") : stripWordPrefix(entry);
}

/**
 * Apply every configured monitor to one normalized item, mutating
 * item.matchedTerms / item.matchedMonitors. Matching order per monitor:
 * normalize -> check include terms -> check exclude terms -> include/discard.
 * A monitor matches if ANY include entry is found and NO exclude entry is
 * found.
 */
function applyMonitors(item, monitors) {
  const haystack = normalizeForMatch(textFieldsOf(item));
  const matchedTerms = new Set();
  const matchedMonitors = [];

  for (const monitor of monitors) {
    const excluded = (monitor.exclude || []).some((entry) => entryMatches(entry, haystack));
    if (excluded) continue;

    const hits = (monitor.include || []).filter((entry) => entryMatches(entry, haystack));
    if (hits.length === 0) continue;

    matchedMonitors.push(monitor.id);
    hits.forEach((entry) => matchedTerms.add(labelFor(entry)));
  }

  item.matchedTerms = Array.from(matchedTerms);
  item.matchedMonitors = matchedMonitors;
  return matchedMonitors.length > 0;
}

/** Filter a list of normalized items down to those matching at least one
 * monitor, annotating each with matchedTerms/matchedMonitors. */
function matchItems(items, monitors) {
  return items.filter((item) => applyMonitors(item, monitors));
}

module.exports = { matchItems, applyMonitors, normalizeForMatch };
