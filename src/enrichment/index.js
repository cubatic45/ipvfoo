"use strict";

IPvFooEnrichment.LookupService = class {
  constructor(cache, {lookup, now = Date.now, concurrency = 4} = {}) {
    this.cache = cache;
    this.lookup = lookup || ((ip, settings, signal) => settings.metadataProvider === "custom" ?
      IPvFooEnrichment.customLookup(ip, settings.metadataEndpoint, {signal}) :
      IPvFooEnrichment.defaultLookup(ip, {signal}));
    this.now = now;
    this.concurrency = concurrency;
    this.inflight = new Map();
    this.failures = new Map();
    this.controllers = new Set();
    this.queue = [];
    this.active = 0;
    this.generation = 0;
    this.pausedUntil = 0;
  }
  cancel() {
    ++this.generation;
    for (const controller of this.controllers) controller.abort();
    for (const task of this.queue.splice(0)) task.reject(new Error("Settings changed."));
    this.inflight.clear();
    this.failures.clear();
    this.pausedUntil = 0;
  }
  async slot(signal) {
    if (signal.aborted) throw new Error("Cancelled.");
    if (this.active < this.concurrency) { ++this.active; return; }
    if (this.queue.length >= 256) throw new Error("Lookup queue full.");
    await new Promise((resolve, reject) => this.queue.push({resolve, reject}));
    if (signal.aborted) { this.release(); throw new Error("Cancelled."); }
  }
  release() {
    const next = this.queue.shift();
    if (next) next.resolve();
    else --this.active;
  }
  async lookupIp(ip, settings) {
    const classification = IPvFooEnrichment.classifyIp(ip);
    if (!classification.valid) return {status: "invalid"};
    if (!classification.public) return {status: "private"};
    if (settings.enrichmentEnabled !== true) return {status: "disabled"};
    if (!["default", "custom"].includes(settings.metadataProvider)) return {status: "unavailable"};
    const generation = this.generation;
    const identity = settings.metadataProvider === "custom" ? settings.metadataEndpoint : "ipwho.is:v1";
    // Namespace providers without storing custom endpoint tokens in cache keys.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    const namespace = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
    const ttlDays = Math.min(30, Math.max(1, Number(settings.metadataTtlDays) || 7));
    const key = `${namespace}:${ttlDays}:ip:${classification.key}`;
    const cached = await this.cache.get(key);
    if (generation !== this.generation) return {status: "disabled"};
    if (cached) return {status: "ok", ...cached};
    if (this.pausedUntil > this.now() || (this.failures.get(key) || 0) > this.now()) {
      return {status: "unavailable"};
    }
    if (this.inflight.has(key)) return this.inflight.get(key);
    const controller = new AbortController();
    this.controllers.add(controller);
    const promise = (async () => {
      let acquired = false;
      try {
        await this.slot(controller.signal);
        acquired = true;
        if (generation !== this.generation || this.pausedUntil > this.now()) throw new Error("Cancelled or rate limited.");
        const data = IPvFooEnrichment.validateMetadata(await this.lookup(ip, settings, controller.signal));
        if (generation !== this.generation) return {status: "disabled"};
        await this.cache.set(key, data, ttlDays * 86400000);
        if (generation !== this.generation) return {status: "disabled"};
        return {status: "ok", ...data};
      } catch (error) {
        if (generation === this.generation) {
          this.failures.set(key, this.now() + 60000);
          while (this.failures.size > 512) this.failures.delete(this.failures.keys().next().value);
          if (error.rateLimited) this.pausedUntil = this.now() + 3600000;
        }
        return {status: generation === this.generation ? "unavailable" : "disabled"};
      } finally {
        if (acquired) this.release();
        this.controllers.delete(controller);
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
};
