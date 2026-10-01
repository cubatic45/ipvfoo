const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');
const root = require('node:path').resolve(__dirname, '../..');
(async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'ipvfoo-firefox-'));
  fs.cpSync(`${root}/src`, source, {recursive: true});
  let finish;
  const result = new Promise(resolve => {finish = resolve;});
  const server = http.createServer((req, res) => {
    if (req.url === '/report') {
      let body = '';
      req.on('data', data => body += data);
      req.on('end', () => {finish(JSON.parse(body)); res.end('ok');});
    } else {res.setHeader('x-amz-cf-id', 'fixture');res.end('<title>Firefox capture fixture</title>');}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = JSON.parse(fs.readFileSync(`${source}/manifest/firefox-manifest.json`));
  manifest.background.scripts.push('test-driver.js');
  fs.writeFileSync(`${source}/manifest.json`, JSON.stringify(manifest));
  fs.writeFileSync(`${source}/test-driver.js`, `
    (async () => {
      try {
        await storageReady;
        const tab = await chrome.tabs.create({url: ${JSON.stringify(base)}});
        for (let i = 0; i < 100 && !tabMap[tab.id]?.domains['127.0.0.1']; ++i) await sleep(100);
        const captured = tabMap[tab.id]?.domains['127.0.0.1'];
        if (captured?.addr !== '127.0.0.1') throw new Error('Actual IP not captured');
        if (!captured.signals.includes('header:x-amz-cf-id')) throw new Error('Response header missing');
        let calls = 0;
        metadataService.lookup = async () => {++calls; return {asn: 13335, asnOrg: 'Cloudflare, Inc.', countryCode: 'US'};};
        const privateResult = await metadataService.lookupIp('10.11.1.187', {...options, enrichmentEnabled: true});
        if (privateResult.status !== 'private' || calls !== 0) throw new Error('Private IP was queried');
        tabMap[tab.id].addDomain('cloudflare.example', 0x400, '104.16.132.229', 0, ['header:cf-ray']);
        tabMap[tab.id].addDomain('alb.example', 0x400, '54.1.2.3', 0, []);
        await chrome.tabs.create({url: chrome.runtime.getURL('popup.html') + '#' + tab.id});
      } catch (error) {
        await fetch(${JSON.stringify(base + '/report')}, {method: 'POST', body: JSON.stringify({ok: false, error: String(error)}), credentials: 'omit'});
      }
    })();
  `);
  fs.appendFileSync(`${source}/popup.html`, '<script src="test-popup.js"></script>');
  fs.writeFileSync(`${source}/test-popup.js`, `
    (async () => {
      try {
        for (let i = 0; i < 100 && !document.body.textContent.includes('CDN: Cloudflare'); ++i) await sleep(100);
        const text = document.body.textContent;
        if (!text.includes('127.0.0.1') || !text.includes('Private / special-use network') || !text.includes('CDN: Cloudflare') || !text.includes('CDN: unknown')) throw new Error('Popup failed: ' + text);
        await fetch(${JSON.stringify(base + '/report')}, {method: 'POST', body: JSON.stringify({ok: true, text: text.trim()}), credentials: 'omit'});
      } catch (error) {
        await fetch(${JSON.stringify(base + '/report')}, {method: 'POST', body: JSON.stringify({ok: false, error: String(error)}), credentials: 'omit'});
      }
    })();
  `);
  const child = spawn(process.env.WEB_EXT_BIN || 'web-ext', ['run', '--source-dir', source,
    '--firefox', require('playwright').firefox.executablePath(), '--args=-headless', '--no-reload', '--no-input']);
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  let timer;
  try {
    const report = await Promise.race([result, new Promise((resolve, reject) => {timer = setTimeout(() => reject(new Error('Firefox smoke timed out')), 45000);})]);
    if (!report.ok) throw new Error(report.error);
    console.log('Firefox smoke passed: temporary load, real IP capture, response-header signals, private exclusion, popup CDN and ALB negative.');
  } finally {
    clearTimeout(timer); child.kill('SIGTERM');
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(source, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
