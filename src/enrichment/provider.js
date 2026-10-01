"use strict";

IPvFooEnrichment.endpointUrl = function(template, ip) {
  if (typeof template !== "string" || !template.includes("{ip}")) {
    throw new Error("Endpoint must contain {ip}.");
  }
  const url = new URL(template.replaceAll("{ip}", encodeURIComponent(ip)));
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      url.hostname.includes("{ip}") || template.split("/").slice(0, 3).join("/").includes("{ip}")) {
    throw new Error("Use an HTTPS endpoint with {ip} in the path or query and no credentials or fragment.");
  }
  return url;
};

IPvFooEnrichment.validateMetadata = function(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid metadata.");
  const result = {asn: null, asnOrg: null, countryCode: null, countryName: null};
  if (data.asn != null) {
    if (!Number.isInteger(data.asn) || data.asn < 1 || data.asn > 4294967295) throw new Error("Invalid ASN.");
    result.asn = data.asn;
  }
  for (const key of ["asnOrg", "countryCode", "countryName"]) {
    if (data[key] != null) {
      if (typeof data[key] !== "string" || data[key].length > 256 || /[\x00-\x1f\x7f]/.test(data[key])) {
        throw new Error(`Invalid ${key}.`);
      }
      result[key] = data[key].trim() || null;
    }
  }
  if (result.countryCode && !/^[A-Z]{2}$/.test(result.countryCode)) throw new Error("Invalid country code.");
  if (!Object.values(result).some(value => value != null)) throw new Error("Empty metadata.");
  return result;
};

IPvFooEnrichment.fetchJson = async function(url, {signal, timeoutMs = 5000, fetchImpl = fetch} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, {once: true});
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal, credentials: "omit", redirect: "error",
      referrerPolicy: "no-referrer", cache: "no-store",
    });
    if (!response.ok) {
      const error = new Error(`Metadata service returned HTTP ${response.status}.`);
      error.rateLimited = response.status === 429;
      throw error;
    }
    const limit = 64 * 1024;
    if (Number(response.headers.get("content-length")) > limit) throw new Error("Metadata response too large.");
    if (!response.body) throw new Error("Missing response body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, text = "";
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Metadata response too large.");
        text += decoder.decode(value, {stream: true});
      }
      text += decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};
