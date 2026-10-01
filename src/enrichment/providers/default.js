"use strict";

IPvFooEnrichment.defaultLookup = async function(ip, config) {
  const data = await IPvFooEnrichment.fetchJson(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=ip,success,connection,country_code,country`, config);
  if (data.success !== true || IPvFooEnrichment.classifyIp(data.ip).key !==
      IPvFooEnrichment.classifyIp(ip).key) throw new Error("Metadata lookup failed or returned a different IP.");
  return IPvFooEnrichment.validateMetadata({
    asn: data.connection?.asn, asnOrg: data.connection?.org || data.connection?.isp,
    countryCode: data.country_code, countryName: data.country,
  });
};
