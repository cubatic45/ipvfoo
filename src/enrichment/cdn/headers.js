"use strict";

// Store only bounded classification evidence, never header values or cookies.
IPvFooEnrichment.headerSignals = function(headers = []) {
  const signals = new Set();
  const names = new Set(headers.map(h => String(h.name || "").toLowerCase()));
  for (const header of headers) {
    const name = String(header.name || "").toLowerCase();
    if (/^(cf-ray|cf-cache-status|x-amz-cf-id|x-amz-cf-pop|x-vercel-id|x-vercel-cache|x-fastly-request-id)$/.test(name)) {
      signals.add(`header:${name}`);
    } else if (/^(x-akamai-|akamai-)/.test(name)) {
      signals.add("header:x-akamai-*");
    } else if (name === "x-served-by" && names.has("x-cache") && names.has("x-cache-hits") && /\bcache-[a-z0-9]+-[a-z0-9]+\b/i.test(header.value || "")) {
      signals.add("header:x-served-by:fastly");
    } else if (name === "server" && /^(cloudflare|akamaighost|varnish)$/i.test((header.value || "").trim())) {
      const server = header.value.trim().toLowerCase();
      if (server !== "varnish") signals.add(`header:server:${server}`);
    }
  }
  return [...signals].sort();
};
