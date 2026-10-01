// Run upstream's unchanged HTML test cases in Node without browser dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({
  assert: (value, message) => assert.ok(value, message),
  assertEquals: (a, b) => assert.equal(a, b),
  tests: cases => { for (const [name, fn] of Object.entries(cases)) test(`upstream: ${name}`, fn); },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/iputil.js'), 'utf8'), context);
const html = fs.readFileSync(path.join(__dirname, 'iputil_test.html'), 'utf8');
vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
