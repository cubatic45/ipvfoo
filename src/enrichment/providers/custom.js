"use strict";

IPvFooEnrichment.customLookup = async function(ip, endpoint, config) {
  const url = IPvFooEnrichment.endpointUrl(endpoint, ip);
  const data = await IPvFooEnrichment.fetchJson(url.href, config);
  if (data.ip != null && IPvFooEnrichment.classifyIp(data.ip).key !==
      IPvFooEnrichment.classifyIp(ip).key) throw new Error("Metadata returned a different IP.");
  return IPvFooEnrichment.validateMetadata(data);
};
