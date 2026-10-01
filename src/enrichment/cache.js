"use strict";

IPvFooEnrichment.MetadataCache = class {
  constructor(storage, {now = Date.now, limit = 512} = {}) {
    this.storage = storage;
    this.now = now;
    this.limit = limit;
    this.entries = new Map();
    this.write = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    try {
      const stored = (await this.storage.get("enrichmentCache")).enrichmentCache;
      for (const [key, value] of Object.entries(stored || {})) {
        if (value.expiresAt > this.now() && Number.isFinite(value.expiresAt)) {
          try {
            this.entries.set(key, {...value, data: IPvFooEnrichment.validateMetadata(value.data)});
          } catch { /* Discard malformed old entries. */ }
        }
      }
      this.prune();
    } catch { /* Storage failures must not affect actual IP capture. */ }
  }
  prune() {
    for (const [key, value] of this.entries) {
      if (value.expiresAt <= this.now()) this.entries.delete(key);
    }
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  async get(key) {
    await this.ready;
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Touch the entry for bounded LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.data;
  }
  async set(key, data, ttlMs) {
    await this.ready;
    this.entries.delete(key);
    this.entries.set(key, {data, expiresAt: this.now() + ttlMs});
    this.prune();
    await this.persist();
  }
  persist() {
    this.write = this.write.catch(() => {}).then(() =>
      this.storage.set({enrichmentCache: Object.fromEntries(this.entries)}));
    return this.write.catch(() => {});
  }
  async clear() {
    await this.ready;
    this.entries.clear();
    this.persist();
    await this.write; // Report persistence failures when explicitly clearing.
  }
};
