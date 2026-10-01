const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./helpers.cjs');
const settings = {enrichmentEnabled: true, metadataProvider: 'default', metadataTtlDays: 7};
const metadata = {asn: 13335, asnOrg: 'Cloudflare, Inc.', countryCode: 'US'};
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
test('cache persists, expires, evicts oldest entries, and clears across restart', async () => {
  let time = 100;
  const storage = E.memoryStorage();
  const make = () => new E.MetadataCache(storage, {now: () => time, limit: 2});
  const cache = make();
  await cache.set('a', metadata, 10);
  assert.equal((await make().get('a')).asn, 13335);
  time = 110;
  assert.equal(await cache.get('a'), null);
  await cache.set('b', metadata, 100);
  await cache.set('c', metadata, 100);
  await cache.set('d', metadata, 100);
  assert.equal(await cache.get('b'), null);
  await cache.clear();
  assert.equal(await make().get('d'), null);
});
test('simultaneous lookups deduplicate; provider and TTL changes have isolated cache keys', async () => {
  let calls = 0;
  const storage = E.memoryStorage();
  const service = new E.LookupService(new E.MetadataCache(storage), {lookup: async () => { ++calls; await tick(); return metadata; }});
  const results = await Promise.all(Array.from({length: 30}, () => service.lookupIp('104.16.132.229', settings)));
  assert.equal(calls, 1);
  assert.ok(results.every(x => x.asn === 13335));
  await service.lookupIp('104.16.132.229', settings);
  assert.equal(calls, 1);
  await service.lookupIp('104.16.132.229', {...settings, metadataProvider: 'custom', metadataEndpoint: 'https://internal.example/api?ip={ip}&token=secret'});
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(storage.data).includes('secret'));
  await service.lookupIp('104.16.132.229', {...settings, metadataTtlDays: 1});
  assert.equal(calls, 3);
});
test('disabled and private lookups do not invoke provider, even with cached metadata', async () => {
  let calls = 0;
  const service = new E.LookupService(new E.MetadataCache(E.memoryStorage()), {lookup: async () => { ++calls; return metadata; }});
  assert.equal((await service.lookupIp('10.11.1.187', settings)).status, 'private');
  assert.equal((await service.lookupIp('8.8.8.8', {...settings, enrichmentEnabled: false})).status, 'disabled');
  assert.equal(calls, 0);
});
test('failure cooldown prevents retry storms and does not alter captured IPs', async () => {
  let calls = 0, time = 0;
  const service = new E.LookupService(new E.MetadataCache(E.memoryStorage()), {now: () => time, lookup: async () => { ++calls; throw new Error('timeout'); }});
  const ip = '8.8.8.8';
  assert.equal((await service.lookupIp(ip, settings)).status, 'unavailable');
  await service.lookupIp(ip, settings);
  assert.equal(calls, 1);
  time = 60001;
  await service.lookupIp(ip, settings);
  assert.equal(calls, 2);
  assert.equal(ip, '8.8.8.8');
});
test('lookups have bounded concurrency and cancellation prevents stale cache writes', async () => {
  let active = 0, peak = 0;
  const cache = new E.MetadataCache(E.memoryStorage());
  const service = new E.LookupService(cache, {concurrency: 2, lookup: async () => {
    peak = Math.max(peak, ++active); await tick(); --active; return metadata;
  }});
  const pending = Promise.all(Array.from({length: 10}, (_, i) => service.lookupIp(`8.8.8.${i + 1}`, settings)));
  await new Promise(resolve => setTimeout(resolve, 10));
  service.cancel();
  assert.ok((await pending).every(x => x.status === 'disabled'));
  assert.equal(peak, 2);
  assert.equal(cache.entries.size, 0);
  assert.equal(service.active, 0);
});
test('HTTP 429 pauses the service for different IPs', async () => {
  let calls = 0;
  const service = new E.LookupService(new E.MetadataCache(E.memoryStorage()), {lookup: async () => {
    ++calls; const error = new Error('rate limit'); error.rateLimited = true; throw error;
  }});
  await service.lookupIp('8.8.8.8', settings);
  await service.lookupIp('1.1.1.1', settings);
  assert.equal(calls, 1);
});
test('storage failures do not break lookups, but explicit clear reports a write failure', async () => {
  const storage = {get: async () => {throw new Error('storage unavailable');}, set: async () => {throw new Error('quota');}};
  const cache = new E.MetadataCache(storage);
  const service = new E.LookupService(cache, {lookup: async () => metadata});
  assert.equal((await service.lookupIp('8.8.8.8', settings)).status, 'ok');
  await assert.rejects(cache.clear(), /quota/);
});
