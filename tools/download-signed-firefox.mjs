// Reuse a previously approved version rather than submitting the same version twice.
import {createHmac, createHash} from 'node:crypto';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';

const manifest = JSON.parse(await readFile('src/manifest/firefox-manifest.json', 'utf8'));
const issuer = process.env.WEB_EXT_API_KEY;
const secret = process.env.WEB_EXT_API_SECRET;
if (!issuer || !secret) throw new Error('Mozilla signing credentials are required.');
function authorization() {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({iss: issuer, iat: now, exp: now + 300})}`;
  return `JWT ${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}
async function output(value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `downloaded=${value}\n`);
}
const id = encodeURIComponent(manifest.browser_specific_settings.gecko.id);
const version = encodeURIComponent(manifest.version);
const response = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${id}/versions/${version}/`, {
  headers: {Authorization: authorization(), Accept: 'application/json'}, signal: AbortSignal.timeout(60000),
});
if (response.status === 404) {
  await output(false);
  console.log('This version is not on Mozilla yet; proceed with a new signing submission.');
} else {
  if (!response.ok) throw new Error(`Mozilla version lookup failed: HTTP ${response.status}.`);
  const data = await response.json();
  if (data.channel !== 'unlisted' || data.version !== manifest.version || data.file?.status !== 'public') {
    throw new Error('The version already exists but is not an approved unlisted release; do not resubmit it.');
  }
  const url = new URL(data.file.url);
  if (url.protocol !== 'https:' || !['addons.mozilla.org', 'addons.cdn.mozilla.net'].includes(url.hostname)) {
    throw new Error('Unexpected Mozilla download origin.');
  }
  const download = await fetch(url, {
    headers: url.hostname === 'addons.mozilla.org' ? {Authorization: authorization()} : {},
    signal: AbortSignal.timeout(60000),
  });
  if (!download.ok) throw new Error(`Signed XPI download failed: HTTP ${download.status}.`);
  const bytes = Buffer.from(await download.arrayBuffer());
  const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (hash !== data.file.hash) throw new Error('Downloaded XPI hash differs from Mozilla API metadata.');
  await mkdir('build/signed', {recursive: true});
  const filename = `build/signed/ipvfoo-enhanced-${manifest.version}-signed.xpi`;
  await writeFile(filename, bytes);
  await output(true);
  console.log(`Downloaded previously approved signed XPI: ${filename}`);
}
