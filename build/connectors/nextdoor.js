"use strict";

/**
 * Nextdoor has no public, self-serve API for searching or reading
 * neighborhood post content. Its published developer surfaces (the
 * Creator/Ads API, the Local Deals API) cover advertising and business
 * listings, not keyword monitoring of resident posts. There is currently
 * no activation path for this connector — see README.md "Nextdoor" for
 * what would need to change (a partner/approval relationship with
 * Nextdoor granting content read access) before this can be implemented.
 *
 * Left as a stub so the connector architecture has a slot for it, per the
 * plan's requirement that Nextdoor be addable later without restructuring
 * the app. config/sources.yaml keeps this source `enabled: false`.
 */
async function fetchNextdoorSource() {
  throw new Error("Nextdoor has no public content API — connector not implemented, see README.md");
}

module.exports = { fetchNextdoorSource };
