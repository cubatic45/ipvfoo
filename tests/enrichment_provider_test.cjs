const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./helpers.cjs');
test('custom endpoints require HTTPS and a placeholder outside the authority', () => {
  assert.equal(E.endpointUrl('https://example.com/ip?ip={ip}', '2606:4700::1111').searchParams.get('ip'), '2606:4700::1111');
  for (const template of ['http://example.com/{ip}', 'https://{ip}.example.com/', 'https://user:pass@example.com/{ip}',
    'https://example.com/ip', 'https://example.com/{ip}#fragment', 'file:///{ip}']) assert.throws(() => E.endpointUrl(template, '8.8.8.8'));
});
test('schema validation drops extra fields and rejects bad ASN, string types, and country codes', () => {
  const result = E.validateMetadata({asn: 16509, asnOrg: 'Amazon', ignored: 'secret'});
  assert.equal(result.asn, 16509);
  assert.equal(result.ignored, undefined);
  for (const data of [{}, [], {asn: 'AS13335'}, {asn: 0}, {asn: 4294967296}, {asnOrg: {}},
    {countryCode: 'us'}, {asnOrg: 'x'.repeat(257)}, {countryName: 'US\nsecret'}]) assert.throws(() => E.validateMetadata(data));
});
test('fetch omits credentials and referrer, rejects redirects, and parses bounded JSON', async () => {
  let options;
  const value = await E.fetchJson('https://example.com', {fetchImpl: async (url, config) => {
    options = config; return new Response('{"asn":13335}');
  }});
  assert.equal(value.asn, 13335);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer');
  await assert.rejects(E.fetchJson('https://example.com', {fetchImpl: async () => new Response('x'.repeat(65537))}), /too large/);
  await assert.rejects(E.fetchJson('https://example.com', {fetchImpl: async () => new Response('bad JSON')}));
  await assert.rejects(E.fetchJson('https://example.com', {fetchImpl: async () => new Response('{}', {status: 429})}), error => error.rateLimited);
});
test('timeout aborts stalled fetch', async () => {
  await assert.rejects(E.fetchJson('https://example.com', {timeoutMs: 10, fetchImpl: (url, config) =>
    new Promise((resolve, reject) => config.signal.addEventListener('abort', () => reject(new Error('aborted'))))}), /aborted/);
});
test('default and custom providers normalize responses and validate returned IP', async () => {
  const result = await E.defaultLookup('8.8.8.8', {fetchImpl: async () => new Response(JSON.stringify({
    ip: '8.8.8.8', success: true, connection: {asn: 15169, org: 'Google'}, country_code: 'US', country: 'United States',
  }))});
  assert.equal(result.asn, 15169);
  await assert.rejects(E.defaultLookup('8.8.8.8', {fetchImpl: async () => new Response('{"success":true,"ip":"1.1.1.1"}')}), /different IP/);
  assert.equal((await E.customLookup('8.8.8.8', 'https://example.com/{ip}', {fetchImpl: async () => new Response('{"asn":15169}')})).asn, 15169);
  await assert.rejects(E.customLookup('8.8.8.8', 'https://example.com/{ip}', {fetchImpl: async () => new Response('{"ip":"1.1.1.1","asn":15169}')}), /different IP/);
});

test('timeout also aborts a response after headers and partial body arrive', async () => {
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.write('{"asn":');
    // Deliberately never finish the body.
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(E.fetchJson(`http://127.0.0.1:${server.address().port}`, {timeoutMs: 100}));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
