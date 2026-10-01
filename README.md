# IPvFoo Enhanced

Fork of [pmarks-net/ipvfoo](https://github.com/pmarks-net/ipvfoo). Keeps the browser's
actual connection IP capture and adds optional IP ownership and local CDN detection.

- ASN, organization/ISP and country, loaded asynchronously after IPs are displayed.
- CDN provider, confidence and evidence tooltip using response headers, request hostname
  and a small ASN rule set. Amazon AS16509, Google AS15169 and Azure AS8075 alone are
  **not** classified as CDNs. Conflicting provider signals are shown as unknown.
- Ownership lookup **off by default**. Header/hostname detection needs no network lookup.
- IP-based memory and local storage cache (7 days by default, configurable 1–30 days),
  concurrent request deduplication, four simultaneous queries, bounded queue/cache,
  failure cooldown, and cancellation when provider settings change or lookup is disabled.
- Private, loopback, link-local, shared, multicast, documentation and other special-use
  addresses are never sent to a provider, including IPv4-mapped IPv6 private addresses.
- Shared Chrome/Firefox business code, separate manifests and a separate Firefox add-on ID.

## Try it

Run `make` to produce `build/ipvfoo-2.36.0.zip` for Chrome/Edge and
`build/ipvfoo-2.36.0.xpi` for Firefox. The Firefox package is unsigned and intended
for temporary loading during development; normal distribution requires signing.

For Chrome, extract the ZIP, open `chrome://extensions`, enable Developer mode and
choose **Load unpacked**. For Firefox, extract the XPI into a directory, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and select
its `manifest.json`. You can also load `src` after selecting a manifest with the
scripts under `src/manifest`.

Open **Options** from the popup to enable ownership lookup, configure display and
CDN signals, choose a provider, or clear the cache. Saving an enabled provider asks
for access to that origin. Firefox versions with built-in data consent also request
optional browsing activity transmission consent; revoking it disables ownership lookup.
On older versions the explicit opt-in in Options is the consent step.

The default provider is [ipwho.is](https://ipwhois.io/documentation), using HTTPS
without an API token. Its limits and availability are controlled by the service.
The extension backs off on HTTP 429 and keeps showing captured IPs if a query fails.

## Custom metadata service

Set an HTTPS URL with `{ip}` in the path or query, for example:

```text
https://internal.example.com/ip-info?ip={ip}
```

The JSON response uses the following fields (at least one must be present):

```json
{
  "ip": "104.16.132.229",
  "asn": 13335,
  "asnOrg": "Cloudflare, Inc.",
  "countryCode": "US",
  "countryName": "United States"
}
```

`ip` is optional but must match the queried IP when supplied. `asn` is an integer
from 1 to 4294967295. Text fields have a 256-character limit; country codes must be
two uppercase letters. Other fields are ignored. Endpoint configuration is local
and cannot be set by visited pages. Credentials/cookies and redirects are disabled;
responses have a 5-second timeout and 64 KiB size limit. Use a trusted endpoint.
Provider cache keys are isolated with a hash of the endpoint, so one service's
answers cannot leak into another service's results.

## Privacy and limitations

Only public connection IPs are sent when the user enables lookup and opens a popup.
Page URLs, hostnames, response headers and cookie values are not included in these
queries. The service also sees the network address making the API request.
Ownership settings and cached results stay in local browser storage. Existing
upstream context menu settings continue to use sync storage.

The existing all-sites host permission is required for IP capture; enrichment adds
no broader host access. Private addresses are excluded even for custom providers.
CDN evidence is specific to each displayed domain/IP and is never cached globally
by IP. Headers are heuristic signals and can be spoofed; an ASN indicates network
ownership, not necessarily that every response was CDN-served. Only bounded signal
names are retained. Upstream's single preferred IP per domain and cached-IP/NAT64
presentation are preserved. There is no new DNS lookup or CNAME resolver, CIDR data,
traceroute, speed test, or backend service in this version.

## Development

```sh
make test               # Node 20+, includes upstream IP parsing cases
make                    # Both browser packages
# origin: personal fork; upstream: pmarks-net/ipvfoo
git fetch upstream
git rebase upstream/master
```

The test suite covers private addresses, provider validation and failures, cache
expiry/isolation, deduplication/concurrency/cancellation, CDN confidence and cloud
hosting false positives. GitHub Actions runs the tests and uploads both packages.

Optional browser smoke tests (development dependencies can stay outside the checkout):

```sh
npm install --prefix /tmp/ipvfoo-dev-tools playwright web-ext
/tmp/ipvfoo-dev-tools/node_modules/.bin/playwright install --with-deps chromium firefox
cp src/manifest/chrome-manifest.json src/manifest.json
NODE_PATH=/tmp/ipvfoo-dev-tools/node_modules node tests/browser/chrome_smoke.cjs
NODE_PATH=/tmp/ipvfoo-dev-tools/node_modules WEB_EXT_BIN=/tmp/ipvfoo-dev-tools/node_modules/.bin/web-ext node tests/browser/firefox_smoke.cjs
```

Both smoke tests capture an IP from a real local HTTP server and check popup rendering.
Public IP rows use deterministic fixtures; the Chrome ownership provider is mocked,
so these tests do not transmit the fixture IPs to a metadata service. The Firefox
smoke test installs a temporary test copy without modifying the checkout.

---

## Upstream README

**IPvFoo** is a Chrome/Firefox extension that adds an icon to indicate whether the current page was fetched using IPv4 or IPv6. When you click the icon, a pop-up appears, listing the IP address for each domain that served the page elements.

Everything is captured privately using the webRequest API, without creating any additional network traffic.

## Screenshots
![Screenshot](/misc/screenshot_webstore_1_640x400.png?raw=true)

![Screenshot](/misc/screenshot_options.png?raw=true)

## Add to Chrome
https://chrome.google.com/webstore/detail/ipvfoo/ecanpcehffngcegjmadlcijfolapggal

<picture><img src="https://badgen.net/chrome-web-store/v/ecanpcehffngcegjmadlcijfolapggal"></picture>
<picture><img src="https://badgen.net/chrome-web-store/users/ecanpcehffngcegjmadlcijfolapggal"></picture>
<picture><img src="https://badgen.net/chrome-web-store/rating/ecanpcehffngcegjmadlcijfolapggal"></picture>

## Add to Firefox
https://addons.mozilla.org/addon/ipvfoo/  

<picture><img src="https://badgen.net/amo/v/ipvfoo"></picture>
<picture><img src="https://badgen.net/amo/users/ipvfoo"></picture>
<picture><img src="https://badgen.net/amo/rating/ipvfoo"></picture>

To use IPvFoo with Firefox's default search engine, uncheck **Settings > Search > Show search terms in the address bar on results pages**

## Add to Edge
https://microsoftedge.microsoft.com/addons/detail/ipvfoo/dphnkggpaicipkljebciobedeiaiofod  

<picture><img src="https://badgen.net/edge-addons/v/dphnkggpaicipkljebciobedeiaiofod"></picture>
<picture><img src="https://badgen.net/edge-addons/users/dphnkggpaicipkljebciobedeiaiofod"></picture>
<picture><img src="https://badgen.net/edge-addons/rating/dphnkggpaicipkljebciobedeiaiofod"></picture>

*(You can also run the Chrome version on Edge, as they are identical.)*

## Safari?

IPvFoo cannot be [ported to Safari](https://github.com/pmarks-net/ipvfoo/issues/39) because the `webRequest` API does not report IP addresses.  In theory, a Safari extension could do its own DNS lookups, but this would create additional network traffic, and may disagree with the browser's address selection.

## Running IPvFoo unpacked from git

IPvFoo shares a common codebase for Chrome and Firefox, but `manifest.json` is browser specific.

Firefox shows this error when running the Chrome version:

> There was an error during the temporary add-on installation.  
> background.service_worker is currently disabled. Add background.scripts.

Chrome shows this error when running the Firefox version:

> 'background.scripts' requires manifest version of 2 or lower.  
> 'page_action' requires manifest version of 2 or lower.

The `use_*_manifest.sh.bat` scripts in the [manifest](src/manifest/) directory may be used to switch between versions.

<br><br><br>
Donate: https://liberapay.com/pmarks
