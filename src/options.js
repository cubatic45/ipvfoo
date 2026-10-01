/*
Copyright (C) 2017  Paul Marks  http://www.pmarks.net/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

"use strict";

// Requires <script src="common.js">

const IS_CHROMIUM = !!chrome.runtime.getManifest().background.service_worker;

window.onload = async () => {
  setupMetadataOptions();
  const ipv4pages = document.getElementById("ipv4pages");
  for (const domain of IPV4_ONLY_DOMAINS.keys()) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://${domain}`;
    a.target = "_blank";
    a.textContent = domain;
    li.appendChild(a);
    ipv4pages.appendChild(li);
  }

  // Generate radio buttons
  function makeRadioButton(value, text) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "provider";
    input.value = value;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${text}`));
    label.appendChild(document.createElement("br"));
    return label;
  }
  const providers = document.getElementById("providers");
  for (const provider in LOOKUP_PROVIDERS) {
    providers.appendChild(makeRadioButton(provider, provider));
  }
  providers.appendChild(makeRadioButton("custom", "Custom..."));

  const domainUrl = document.getElementById("domainUrl");
  const ipUrl = document.getElementById("ipUrl");

  function updateValidationAndWrite() {
    for (const field of [domainUrl, ipUrl]) {
      try {
        parseLookupUrl(field.value);
        field.classList.remove("invalid");
      } catch {
        field.classList.add("invalid");
      }
    }
    chrome.runtime.sendMessage({setStorageSyncDebounce: {
      [LOOKUP_PROVIDER]: document.querySelector("input[name='provider']:checked")?.value,
      [CUSTOM_PROVIDER_DOMAIN]: customUrlForDomains,
      [CUSTOM_PROVIDER_IP]: customUrlForIPs,
    }});
  }

  for (const radio of document.querySelectorAll("input[name='provider']")) {
    radio.addEventListener("change", () => {
      if (radio.value == "custom") {
        domainUrl.value = customUrlForDomains;
        ipUrl.value = customUrlForIPs;
      } else {
        const template = LOOKUP_PROVIDERS[radio.value];
        domainUrl.value = template.domain;
        ipUrl.value = template.ip;
      }
      updateValidationAndWrite();
    });
  }

  function handleFieldInput() {
    // If the user edits a text field, switch to Custom.
    customUrlForDomains = domainUrl.value;
    customUrlForIPs = ipUrl.value;
    document.querySelector("input[value='custom']").checked = true;
    updateValidationAndWrite();
  }
  domainUrl.addEventListener("input", handleFieldInput);
  ipUrl.addEventListener("input", handleFieldInput);

  let customUrlForDomains = undefined;
  let customUrlForIPs = undefined;

  function applyOptionsToPage(o) {
    customUrlForDomains = o[CUSTOM_PROVIDER_DOMAIN];
    customUrlForIPs = o[CUSTOM_PROVIDER_IP];
    const provider = o[LOOKUP_PROVIDER];
    const radio = document.querySelector(`input[name='provider'][value='${provider}']`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
    } else {
      console.error(`Missing radio button: ${provider}`);
    }
  }

  let isFirst = true;
  watchOptions(function(optionsChanged) {
    if (isFirst) {
      // Ignore live options changes, to prevent feedback loops.
      isFirst = false;
      applyOptionsToPage(options);
    }

    for (const option of optionsChanged) {
      if (option == NAT64_KEY) {
        const table = document.getElementById("nat64");
        removeChildren(table);
        for (const packed96 of Array.from(options[NAT64_KEY]).sort()) {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.appendChild(document.createTextNode(formatIPv6(packed96) + "/96"));
          tr.appendChild(td);
          table.appendChild(tr);
        }
      }
    }
  });

  document.getElementById("revert_btn").onclick = function() {
    revertNAT64();
    chrome.storage.local.set(ENRICHMENT_DEFAULTS).then(() => applyMetadataOptions(ENRICHMENT_DEFAULTS));
    chrome.runtime.sendMessage({setStorageSyncDebounce: DEFAULT_SYNC_OPTIONS});
    applyOptionsToPage(DEFAULT_SYNC_OPTIONS);
  };

  document.getElementById("dismiss_btn").onclick = function() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1946972
  if (!IS_CHROMIUM) {
    document.body.addEventListener("click", function(e) {
      if (e.target.tagName == "A" && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        window.open(e.target.href);
        e.preventDefault();
      }
    });
    document.body.addEventListener("auxclick", function(e) {
      if (e.target.tagName == "A" && e.button == 1) {
        window.open(e.target.href);
        e.preventDefault();
      }
    });
  }
};


function applyMetadataOptions(o) {
  for (const [key, value] of Object.entries(ENRICHMENT_DEFAULTS)) {
    const field = document.getElementById(key);
    if (typeof value === "boolean") field.checked = o[key];
    else field.value = o[key];
  }
}

async function setupMetadataOptions() {
  await optionsReady;
  applyMetadataOptions(options);
  const grantedPermissions = await chrome.permissions.getAll();
  const status = document.getElementById("metadata_status");
  document.getElementById("save_metadata").onclick = async () => {
    try {
      const settings = {};
      for (const [key, value] of Object.entries(ENRICHMENT_DEFAULTS)) {
        const field = document.getElementById(key);
        settings[key] = typeof value === "boolean" ? field.checked : field.value.trim();
      }
      settings.metadataTtlDays = Number(settings.metadataTtlDays);
      if (!Number.isInteger(settings.metadataTtlDays) || settings.metadataTtlDays < 1 || settings.metadataTtlDays > 30) {
        throw new Error("Cache TTL must be 1–30 days.");
      }
      const url = settings.metadataProvider === "custom" ?
          IPvFooEnrichment.endpointUrl(settings.metadataEndpoint, "8.8.8.8") : new URL("https://ipwho.is/");
      if (settings.enrichmentEnabled) {
        // Request only the selected origin, from the user's Save click.
        const request = {origins: [`${url.origin}/*`]};
        if (!IS_CHROMIUM && grantedPermissions.data_collection) request.data_collection = ["browsingActivity"];
        const granted = await chrome.permissions.request(request);
        if (!granted) throw new Error("Permission was not granted; settings were not saved.");
      }
      await chrome.storage.local.set(settings);
      status.textContent = "Settings saved.";
    } catch (error) { status.textContent = error.message; }
  };
  document.getElementById("clear_metadata").onclick = async () => {
    try {
      const result = await chrome.runtime.sendMessage({clearMetadataCache: true});
      status.textContent = result?.ok ? "Ownership cache cleared." : "Could not clear cache.";
    } catch { status.textContent = "Could not clear cache."; }
  };
}
