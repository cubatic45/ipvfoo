"use strict";

// Shared classic scripts work in Firefox background pages and Chrome workers.
const IPvFooEnrichment = {};

IPvFooEnrichment.classifyIp = function(ip) {
  let packed;
  try { packed = parseIP(ip); } catch { return {valid: false, public: false}; }
  if (packed.length === 32 && packed.startsWith("00000000000000000000ffff")) {
    packed = packed.slice(24); // IPv4-mapped IPv6 must inherit IPv4 restrictions.
  }
  if (packed.length === 8) {
    const n = Number.parseInt(packed, 16);
    const inRange = (base, bits) => Math.floor(n / 2 ** (32 - bits)) ===
        Math.floor(Number.parseInt(base, 16) / 2 ** (32 - bits));
    const blocked = [
      ["00000000", 8], ["0a000000", 8], ["64400000", 10],
      ["7f000000", 8], ["a9fe0000", 16], ["ac100000", 12],
      ["c0000000", 24], ["c0000200", 24], ["c0586300", 24],
      ["c0a80000", 16], ["c6120000", 15], ["c6336400", 24],
      ["cb007100", 24], ["e0000000", 3],
    ].some(([base, bits]) => inRange(base, bits));
    return {valid: true, public: !blocked, key: packed};
  }
  // Only global unicast IPv6; exclude documentation and special-use blocks.
  const global = /^[23]/.test(packed) &&
      !packed.startsWith("20010db8") && !packed.startsWith("3fff0") &&
      !packed.startsWith("2001000") && !packed.startsWith("2001001") &&
      !packed.startsWith("2001002");
  return {valid: true, public: global, key: packed};
};
