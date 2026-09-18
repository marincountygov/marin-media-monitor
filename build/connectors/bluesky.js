"use strict";

const { fetchJson } = require("../http");

// api.bsky.app is the AppView host that actually serves unauthenticated
// searchPosts right now (verified 2026-09-18 by direct request: 200 with
// real results). public.api.bsky.app — this connector's original host —
// returned 403 from every network path tested, apparently blocked by
// bot-protection rather than a real authentication requirement; it is
// NOT that unauthenticated search itself now requires auth (a claim found
// while researching this, but contradicted by api.bsky.app working fine
// unauthenticated). If this connector starts failing again, re-check both
// hosts directly before assuming auth is now required.
const SEARCH_URL = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";

/**
 * Bluesky's public AppView exposes app.bsky.feed.searchPosts without
 * authentication for public post search — no API key/app password needed
 * for the MVP's read-only monitoring use case. No pagination (cursor) is
 * implemented — one page of up to 25 results per term per refresh, which
 * matches the plan's "don't overbuild" guidance; revisit if that proves
 * too shallow in practice.
 */
async function fetchBlueskySource(source, { monitors }) {
  // A monitor's include list can mix plain phrases with compound AND
  // clauses (an array of phrases — see match.js). For an upstream search
  // query we want each phrase as its own candidate term; match.js is what
  // actually enforces the AND requirement afterward, so widening here
  // just means a few more candidates get checked, not false positives.
  const terms = Array.from(new Set(monitors.flatMap((monitor) => monitor.include || []).flat()));
  if (terms.length === 0) return { items: [] };

  const results = await Promise.allSettled(
    terms.map((term) =>
      fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(term)}&limit=25&sort=latest`)
    )
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length === results.length) {
    throw new Error(failures[0].reason?.message || "all Bluesky searches failed");
  }

  const items = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const post of result.value.posts || []) {
      const handle = post.author?.handle;
      const rkey = post.uri?.split("/").pop();
      items.push({
        title: undefined,
        link: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : post.uri,
        description: post.record?.text,
        publishedAt: post.record?.createdAt,
        author: post.author?.displayName || handle,
        image: post.embed?.images?.[0]?.thumb,
        sourceId: source.id,
        sourceName: "Bluesky",
        sourceMethod: "bluesky",
        region: source.region,
        _contentId: post.uri,
        _engagement: {
          likes: post.likeCount,
          reposts: post.repostCount,
          replies: post.replyCount,
        },
        _authorHandle: handle,
      });
    }
  }
  return { items };
}

module.exports = { fetchBlueskySource };
