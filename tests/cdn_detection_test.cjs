const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./helpers.cjs');
const header = (name, value = 'test') => ({name, value});
test('Cloudflare headers plus ASN produce high confidence and explain evidence', () => {
  const result = E.detectCdn({asn: 13335, responseHeaders: [header('CF-Ray')]});
  assert.equal(result.provider, 'Cloudflare');
  assert.equal(result.confidence, 'high');
  assert.deepEqual([...result.reasons], ['header:cf-ray', 'asn:13335']);
  assert.equal(E.detectCdn({asn: 13335}).confidence, 'medium');
});
test('CloudFront is distinguished from EC2/ALB; Google/Azure are not CDN ASNs', () => {
  for (const asn of [16509, 15169, 8075]) assert.equal(E.detectCdn({asn}).detected, false);
  const result = E.detectCdn({asn: 16509, responseHeaders: [header('x-amz-cf-id')]});
  assert.equal(result.provider, 'CloudFront');
  assert.equal(result.confidence, 'high');
  assert.deepEqual([...result.reasons], ['header:x-amz-cf-id', 'asn:16509']);
});
test('host matching respects label boundaries and never performs DNS queries', () => {
  assert.equal(E.detectCdn({hostname: 'd123.cloudfront.net'}).provider, 'CloudFront');
  for (const hostname of ['evilcloudfront.net', 'cloudfront.net.evil.com', 'example-alb.amazonaws.com']) {
    assert.equal(E.detectCdn({hostname}).detected, false);
  }
});
test('generic cache headers are not sufficient evidence; specific vendors are recognized', () => {
  assert.equal(E.detectCdn({responseHeaders: [header('x-cache', 'HIT'), header('server', 'Varnish'), header('x-served-by', 'proxy')]}).detected, false);
  for (const [name, provider] of [['x-vercel-id', 'Vercel'], ['x-akamai-request-id', 'Akamai'], ['x-fastly-request-id', 'Fastly']]) {
    assert.equal(E.detectCdn({responseHeaders: [header(name)]}).provider, provider);
  }
});
test('conflicting CDN signals are explained rather than picking an arbitrary vendor', () => {
  const result = E.detectCdn({responseHeaders: [header('cf-ray'), header('x-amz-cf-id')]});
  assert.equal(result.confidence, 'unknown');
  assert.ok(result.reasons.includes('conflicting-signals'));
});
test('detection toggles work independently and unrelated/sensitive values are not retained', () => {
  assert.equal(E.detectCdn({asn: 13335, asnEnabled: false}).detected, false);
  assert.equal(E.detectCdn({responseHeaders: [header('cf-ray')], headersEnabled: false}).detected, false);
  assert.equal(E.detectCdn({hostname: 'a.cloudfront.net', hostEnabled: false}).detected, false);
  const signals = E.headerSignals([header('set-cookie', 'secret'), header('cf-ray', 'secret-id')]);
  assert.deepEqual([...signals], ['header:cf-ray']);
});

test('Fastly cache-node evidence requires corroborating cache headers', () => {
  const node = header('x-served-by', 'cache-iad-kjyo7100123-IAD');
  assert.equal(E.detectCdn({responseHeaders: [node]}).detected, false);
  assert.equal(E.detectCdn({responseHeaders: [node, header('x-cache', 'HIT'), header('x-cache-hits', '1')]}).provider, 'Fastly');
});
