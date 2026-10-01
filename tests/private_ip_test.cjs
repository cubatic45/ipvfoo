const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./helpers.cjs');
test('private, loopback, shared, link-local, documentation and mapped addresses stay local', () => {
  for (const ip of ['127.0.0.1', '10.11.1.187', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '::', '::1', 'fc00::1',
    'fdff::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.11.1.187', '::ffff:a0b:1bb',
    '64:ff9b::10.11.1.187']) {
    assert.equal(E.classifyIp(ip).valid, true, ip);
    assert.equal(E.classifyIp(ip).public, false, ip);
  }
});
test('public IPs and private range boundaries', () => {
  for (const ip of ['8.8.8.8', '104.16.132.229', '172.15.255.255', '172.32.0.1',
    '100.63.255.255', '100.128.0.1', '2606:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.equal(E.classifyIp(ip).public, true, ip);
  }
});
test('invalid addresses fail closed', () => {
  for (const ip of ['', null, undefined, 'localhost', '999.1.1.1', '2001:::1', '::1%lo']) {
    assert.equal(E.classifyIp(ip).valid, false);
  }
});
