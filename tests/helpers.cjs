const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const files = [
  'iputil.js', 'enrichment/private_ip.js', 'enrichment/cdn/headers.js',
  'enrichment/cdn/asn_rules.js', 'enrichment/cdn/detect.js', 'enrichment/provider.js',
  'enrichment/providers/default.js', 'enrichment/providers/custom.js',
  'enrichment/cache.js', 'enrichment/index.js',
];
const context = vm.createContext({
  console, URL, AbortController, TextEncoder, TextDecoder, Uint8Array,
  setTimeout, clearTimeout, fetch, crypto: require('node:crypto').webcrypto,
});
for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context, {filename: file});
module.exports = vm.runInContext('IPvFooEnrichment', context);
module.exports.memoryStorage = () => {
  const data = {};
  return {get: async key => ({[key]: structuredClone(data[key])}),
    set: async items => Object.assign(data, structuredClone(items)), data};
};
