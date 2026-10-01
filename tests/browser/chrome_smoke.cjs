const {chromium} = require('playwright');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '../..');
(async () => {
  require('node:fs').mkdirSync(`${root}/build`, {recursive: true});
  const server = http.createServer((req,res) => {res.setHeader('cf-ray','fixture');res.end('<title>IPvFoo capture fixture</title>');});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext('', {channel: 'chromium', headless: true, args: [
      `--disable-extensions-except=${root}/src`, `--load-extension=${root}/src`, '--no-sandbox',
    ]});
    const errors = [];
    context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {await storageReady;});
    const id = worker.url().split('/')[2];
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tab = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url?.startsWith('http://127.0.0.1:')));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html#${tab.id}`);
    await popup.waitForSelector('.metadata');
    assert.match(await popup.locator('#addr_table').innerText(), /127\.0\.0\.1/);
    assert.match(await popup.locator('#addr_table').innerText(), /Private \/ special-use network/);
    await worker.evaluate(async () => {
      await storageReady;
      const tab = Object.values(tabMap).find(t => Object.keys(t.domains).includes('127.0.0.1'));
      tab.addDomain('cloudflare.example', 0x400, '104.16.132.229', 0, ['header:cf-ray']);
      tab.addDomain('alb.example', 0x400, '54.1.2.3', 0, []);
      tab.addDomain('d123.cloudfront.net', 0x400, '18.160.10.21', 0, ['header:x-amz-cf-id']);
    });
    await popup.waitForFunction(() => document.body.textContent.includes('CDN: CloudFront'));
    assert.match(await popup.locator('tr').filter({hasText: 'alb.example'}).innerText(), /CDN: unknown/);
    assert.match(await popup.locator('tr').filter({hasText: 'cloudflare.example'}).innerText(), /CDN: Cloudflare/);
    assert.equal(await worker.evaluate(() => metadataService.inflight.size), 0);
    // Keep metadata test deterministic and avoid transmitting fixture addresses.
    await worker.evaluate(() => {
      metadataService.lookup = async ip => ({asn: ip.startsWith('104.') ? 13335 : 16509, asnOrg: ip.startsWith('104.') ? 'Cloudflare, Inc.' : 'Amazon.com, Inc.', countryCode: 'US'});
    });
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await options.waitForSelector('#save_metadata');
    await options.check('#enrichmentEnabled');
    await options.click('#save_metadata');
    await options.waitForFunction(() => document.getElementById('metadata_status').textContent === 'Settings saved.');
    await popup.waitForFunction(() => document.body.textContent.includes('AS13335'));
    assert.match(await popup.locator('tr').filter({hasText: 'alb.example'}).innerText(), /AS16509/);
    assert.match(await popup.locator('tr').filter({hasText: 'alb.example'}).innerText(), /CDN: unknown/);
    await popup.screenshot({path: `${root}/build/popup-chrome.png`});
    await options.screenshot({path: `${root}/build/options-chrome.png`, fullPage: true});
    // API failure leaves the actual IP and header-only CDN evidence visible.
    await options.click('#clear_metadata');
    await worker.evaluate(() => { metadataService.lookup = async () => {throw new Error('timeout');}; });
    await popup.reload();
    await popup.waitForFunction(() => document.body.textContent.includes('ASN: unavailable'));
    assert.match(await popup.locator('#addr_table').innerText(), /104\.16\.132\.229/);
    await options.uncheck('#enrichmentEnabled');
    await options.click('#save_metadata');
    await popup.waitForFunction(() => !document.body.textContent.includes('ASN: unavailable'));
    assert.deepEqual(errors, []);
    console.log('Chrome smoke passed: real capture, private exclusion, default-off, local CDN, settings, metadata display, ALB negative, cache clear, failure fallback, disable.');
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
