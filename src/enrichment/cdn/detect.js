"use strict";

IPvFooEnrichment.detectCdn = function({asn, hostname = "", signals = [],
    responseHeaders, headersEnabled = true, asnEnabled = true, hostEnabled = true} = {}) {
  if (responseHeaders) signals = IPvFooEnrichment.headerSignals(responseHeaders);
  const found = new Map();
  const add = (provider, confidence, reason) => {
    const entry = found.get(provider) || {provider, confidence, reasons: []};
    if (confidence === "high") entry.confidence = confidence;
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    found.set(provider, entry);
  };
  if (headersEnabled) {
    for (const signal of signals) {
      if (/^header:(cf-|server:cloudflare)/.test(signal)) add("Cloudflare", "high", signal);
      if (/^header:x-amz-cf-/.test(signal)) add("CloudFront", "high", signal);
      if (/^header:x-vercel-/.test(signal)) add("Vercel", "high", signal);
      if (/^header:(x-akamai-|server:akamaighost)/.test(signal)) add("Akamai", "high", signal);
      if (/^header:(x-served-by:fastly|x-fastly-request-id)/.test(signal)) add("Fastly", "high", signal);
    }
  }
  if (hostEnabled) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    for (const [suffix, provider] of [
      ["cloudfront.net", "CloudFront"], ["akamaiedge.net", "Akamai"],
      ["akamaihd.net", "Akamai"], ["fastly.net", "Fastly"], ["vercel.app", "Vercel"],
    ]) {
      if (host === suffix || host.endsWith(`.${suffix}`)) add(provider, "medium", `host:${suffix}`);
    }
  }
  const asnProvider = asnEnabled && IPvFooEnrichment.cdnAsns[asn];
  // Response/host evidence takes precedence over a generic network inference.
  if (asnProvider && (!found.size || found.has(asnProvider))) {
    add(asnProvider, "medium", `asn:${asn}`);
  }
  if (found.has("CloudFront") && asnEnabled && asn === 16509) {
    add("CloudFront", "medium", "asn:16509");
  }
  if (found.size === 1) return {detected: true, ...found.values().next().value};
  return {detected: false, provider: null, confidence: "unknown",
    reasons: found.size ? ["conflicting-signals", ...[...found.values()].flatMap(x => x.reasons)] : []};
};
