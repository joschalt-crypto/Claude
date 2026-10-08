// End-to-end checks for the family's own web app: the real server (wrangler dev, local
// Durable Object) with a stand-in for the Claude API, and two iPhones in Chromium.
// Needs `npm ci` in server/ first; run `node test/web.js`.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { devices } = require('playwright');
const { launch } = require('./harness');

const APP = path.resolve(__dirname, '..');
const SERVER = path.join(APP, 'server');
const KEY = 'test-family-key-0123456789abcdef';
const PORT = 8788, MOCK_PORT = 8798;
const LIMIT = 20; // Claude requests per day in this test
const BASE = `http://127.0.0.1:${PORT}`;
const URL_APP = `${BASE}/f/${KEY}/`;
const iPhone = devices['iPhone 13'];

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 250) {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch (e) { /* not yet */ }
    if (Date.now() > end) return false;
    await wait(step);
  }
}

function start(cmd, args, opts) {
  const p = spawn(cmd, args, Object.assign({ detached: true, stdio: ['ignore', 'pipe', 'pipe'] }, opts));
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.log = () => out;
  return p;
}
const stop = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* gone */ } };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antom-web-'));
  const mockLog = path.join(tmp, 'anthropic.jsonl');
  fs.mkdirSync(path.join(SERVER, 'public', 'img'), { recursive: true });
  for (const f of fs.readdirSync(path.join(APP, 'img'))) fs.copyFileSync(path.join(APP, 'img', f), path.join(SERVER, 'public', 'img', f));
  const mock = start(process.execPath, [path.join(__dirname, 'mock-anthropic.mjs'), String(MOCK_PORT), mockLog]);
  const server = start(path.join(SERVER, 'node_modules', '.bin', 'wrangler'), [
    'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', path.join(tmp, 'state'), '--show-interactive-dev-session=false',
    '--var', `FAMILY_KEY:${KEY}`, '--var', 'ANTHROPIC_API_KEY:sk-ant-test', '--var', `ANTHROPIC_BASE_URL:http://127.0.0.1:${MOCK_PORT}`, '--var', `CLAUDE_DAILY_LIMIT:${LIMIT}`,
  ], { cwd: SERVER, env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false', CI: '1' }) });
  const up = await until(async () => (await fetch(BASE + '/')).ok, 60000, 500);
  if (!up) { console.error(server.log()); stop(server); stop(mock); process.exit(1); }
  const browser = await launch();
  const phone = async (name, opts = {}) => {
    const ctx = await browser.newContext(Object.assign({}, iPhone, { deviceScaleFactor: 2 }));
    await ctx.addInitScript(({ hint }) => {
      try { localStorage.setItem('antom.onboarded', '1'); if (!hint) localStorage.setItem('antom.installHint', '1'); } catch (e) { /* storage */ }
    }, { hint: !!opts.hint });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    return { ctx, page, errors };
  };
  const label = async (page) => {
    await page.locator('#v-plan .nav [data-act="settings"]').click();
    await wait(500);
    const t = await page.textContent('#sheet [data-sync]');
    await page.keyboard.press('Escape');
    await wait(450);
    return t;
  };
  // everything on the server, read in parts like the app does
  const docs = async () => {
    const all = {};
    for (let after = '', more = true; more;) {
      const r = await (await fetch(`${URL_APP}api/export?after=${encodeURIComponent(after)}`)).json();
      Object.assign(all, r.docs);
      more = !!r.next;
      after = r.next || '';
    }
    return all;
  };
  const forwarded = () => (fs.existsSync(mockLog) ? fs.readFileSync(mockLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const askServer = (prompt, files = []) => {
    const form = new FormData();
    if (prompt != null) form.append('prompt', prompt);
    for (const f of files) form.append('image', f, 'foto');
    return fetch(URL_APP + 'api/claude', { method: 'POST', body: form });
  };
  const bigPhoto = () => ({ pages: ['data:image/jpeg;base64,' + crypto.randomBytes(420 * 1024).toString('base64')] });
  const today = new Date();
  const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const TODAY = dkey(today);

  try {
    console.log('A. server');
    {
      ok((await fetch(BASE + '/')).status === 200, 'start page without a key');
      ok((await fetch(`${BASE}/f/wrong-key-0123456789abcdef/`)).status === 404 && (await fetch(`${BASE}/f/wrong-key-0123456789abcdef/api/export`)).status === 404, 'a wrong key sees nothing');
      const res = await fetch(URL_APP);
      ok(res.status === 200 && res.headers.get('referrer-policy') === 'no-referrer', 'the app, and the key never leaves as a referrer');
      const man = await (await fetch(URL_APP + 'manifest.webmanifest')).json();
      ok(man.start_url === `/f/${KEY}/` && man.display === 'standalone' && man.icons.length === 3, 'home screen manifest opens the family link', man);
      ok((await fetch(URL_APP + 'img/caponata.webp')).headers.get('content-type') === 'image/webp', 'large photos are served');
      const icons = await Promise.all(['/icons/apple-touch-icon.png', ...man.icons.map((i) => i.src)].map((src) => fetch(BASE + src)));
      ok(icons.every((r) => r.status === 200 && r.headers.get('content-type') === 'image/png'), 'home screen and manifest symbols load', icons.map((r) => r.status));
      ok((await fetch(BASE + '/app.html')).status === 404 && (await fetch(BASE + '/sw.js')).status === 404 && (await fetch(BASE + '/img/caponata.webp')).status === 404, 'nothing of the app without the key');
      const jpeg = new Blob([fs.readFileSync(path.join(APP, 'test', 'fixtures', 'page.jpg'))], { type: 'image/jpeg' });
      const pdf = await askServer('Rezept bitte', [new Blob(['%PDF-1.4'], { type: 'application/pdf' })]);
      const four = await askServer('Rezept bitte', [jpeg, jpeg, jpeg, jpeg]);
      const empty = await askServer('');
      const asJson = await fetch(URL_APP + 'api/claude', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'Rezept bitte' }) });
      ok(pdf.status === 400 && (await pdf.json()).error === 'image_rejected' && four.status === 400 && empty.status === 400 && asJson.status === 400 && !forwarded().length,
        'Claude only gets a prompt with up to three photos', [pdf.status, four.status, empty.status, asJson.status]);
      const three = await askServer('Rezept bitte', [jpeg, jpeg, jpeg]);
      const sent3 = forwarded().pop();
      const imgs = sent3 && sent3.body ? sent3.body.messages[0].content.filter((c) => c.type === 'image') : [];
      ok(three.status === 200 && (await three.json()).text.includes('Gulaschsuppe') && imgs.length === 3 && imgs.every((c) => c.source.media_type === 'image/jpeg' && c.source.data === Buffer.from(fs.readFileSync(path.join(APP, 'test', 'fixtures', 'page.jpg'))).toString('base64')),
        'three photos arrive at Claude unchanged', sent3 && sent3.body === null ? 'body was not JSON' : imgs.length);
    }

    console.log('B. two phones share one plan');
    const a = await phone('A');
    const b = await phone('B');
    await a.page.goto(URL_APP);
    await b.page.goto(URL_APP);
    await wait(1500);
    ok((await label(a.page)) === 'Familienplan' && (await label(b.page)) === 'Familienplan', 'both phones use the family plan');
    ok(await a.page.locator('#v-plan .nav [data-act="scan"]').isVisible(), 'camera scan is there (Claude through the server)');
    await a.page.click('#today [data-act="pick"]');
    await wait(700);
    await a.page.click('#sheet .pick-row[data-id="tikka"]');
    await wait(400);
    ok(await until(async () => (await docs())[`days/${TODAY}`]?.h?.some((e) => e.d === 'tikka')), 'phone A saves on the server');
    ok(await until(() => b.page.locator(`#days .slot[data-date="${TODAY}"][data-slot="h"] .meal[data-dish="tikka"]`).count().then((n) => n === 1), 12000), 'phone B shows it a few seconds later');

    console.log('C. without internet');
    const tomorrow = dkey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    await a.ctx.setOffline(true);
    await a.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await a.page.click(`#day-${tomorrow} [data-act="pick"]`).catch(async () => {
      await a.page.click('#v-plan [data-act="week-next"]');
      await wait(400);
      await a.page.click(`#day-${tomorrow} [data-act="pick"]`);
    });
    await wait(700);
    await a.page.click('#sheet .pick-row[data-id="caponata"]');
    await wait(500);
    ok(await a.page.locator(`#days .slot[data-date="${tomorrow}"] .meal[data-dish="caponata"]`).count() === 1, 'planning works offline');
    ok((await label(a.page)) === 'Offline – kommt später', 'settings say it will be sent later');
    await wait(1500);
    ok(!(await docs())[`days/${tomorrow}`], 'nothing reached the server yet');
    await a.ctx.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    ok(await until(async () => (await docs())[`days/${tomorrow}`]?.h?.some((e) => e.d === 'caponata'), 12000), 'back online: the change is sent');
    ok(await until(() => b.page.evaluate((k) => { const s = document.querySelector(`#days .slot[data-date="${k}"][data-slot="h"]`); return !!s && !!s.querySelector('.meal[data-dish="caponata"]'); }, tomorrow), 12000)
      || await until(async () => { await b.page.click('#v-plan [data-act="week-next"]').catch(() => {}); return b.page.locator(`#days .meal[data-dish="caponata"]`).count().then((n) => n > 0); }, 6000), 'and phone B gets it');

    console.log('D. Claude through the server');
    await a.page.click('.tabbar [data-tab="book"]');
    await wait(400);
    await a.page.click('#book .promo [data-act="import"]');
    await wait(500);
    await a.page.click('#sheet [data-act="imp-mode"][data-mode="paste"]').catch(() => {});
    await a.page.fill('#impText', 'Gulaschsuppe: 400 g Rindergulasch, 2 Zwiebeln. Zwiebeln hacken, Fleisch anbraten, mit Brühe 1 Stunde köcheln.');
    await a.page.click('#sheet [data-act="imp-go"]');
    ok(await until(() => a.page.locator('#dishForm').count().then((n) => n === 1), 15000), 'the recipe comes back from Claude');
    ok(await a.page.locator('#sheet .step-edit [data-dev][value="tm"]:checked').count() === 2, 'with its Thermomix steps');
    const sent = fs.readFileSync(mockLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const last = sent[sent.length - 1];
    ok(last.body.model === 'claude-opus-5-5' && last.body.fallbacks === 'default' && last.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01' && last.headers['x-api-key'] === 'sk-ant-test', 'the server adds model, fallback and its API key', [last.body.model, last.headers['anthropic-beta']]);
    ok(last.body.max_tokens === 16000 && last.body.output_config && last.body.output_config.effort === 'medium' && last.body.messages[0].content.length === 1 && last.body.messages[0].content[0].text.includes('Gulaschsuppe: 400 g'), 'with the text of the recipe and fixed limits', last.body.output_config);
    await a.page.click('#dishForm button[type="submit"]');
    await wait(600);
    ok(await until(async () => Object.values(await docs()).some((d) => d && d.t === 'Gulaschsuppe' && d.steps && d.steps[1].tm && d.steps[1].tm.sec === 3600)), 'saved for the family');
    await b.page.click('.tabbar [data-tab="book"]');
    ok(await until(() => b.page.locator('#book .grid .card .card-t', { hasText: 'Gulaschsuppe' }).count().then((n) => n === 1), 12000), 'phone B has it in the cookbook');

    console.log('E. camera scan');
    await a.page.click('#v-book .nav [data-act="scan"]');
    await wait(600);
    await a.page.setInputFiles('#scanCam', path.join(APP, 'img', 'scan-card.webp'));
    await wait(500);
    await a.page.click('#sheet [data-act="scan-go"]');
    ok(await until(() => a.page.locator('#sheet .r-title').count().then((n) => n === 1), 20000), 'the scanned recipe opens');
    const scan = fs.readFileSync(mockLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop();
    const img = scan.body.messages[0].content.find((c) => c.type === 'image');
    ok(img && img.source.media_type === 'image/jpeg' && img.source.data.startsWith('/9j/') && img.source.data.length > 1000, 'the photo goes to Claude as JPEG');
    const scanned = Object.entries(await docs()).find(([p, d]) => p.startsWith('dishes/') && d.origin === 'scan');
    ok(scanned && await until(async () => !!(await docs())['photos/' + scanned[0].split('/')[1]]), 'the original photo is kept on the server');
    await a.page.keyboard.press('Escape');
    await wait(500);

    console.log('F. backups');
    // three large photos: saving and loading the plan then need several parts
    for (const id of ['big1', 'big2', 'big3']) {
      await fetch(`${URL_APP}api/doc/photos/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bigPhoto()) });
    }
    const part1 = await (await fetch(`${URL_APP}api/export`)).json();
    ok(part1.app === 'antom' && typeof part1.next === 'string' && Object.keys(part1.docs).length < Object.keys(await docs()).length, 'a large plan is handed out in parts');
    await a.page.click('.tabbar [data-tab="plan"]');
    await a.page.locator('#v-plan .nav [data-act="settings"]').click();
    await wait(500);
    const [download] = await Promise.all([a.page.waitForEvent('download', { timeout: 15000 }), a.page.click('#sheet [data-act="backup-save"]')]);
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    ok(saved.app === 'antom' && /^antom-sicherung-\d{4}-\d\d-\d\d\.json$/.test(download.suggestedFilename()) && ['big1', 'big2', 'big3'].every((id) => saved.docs['photos/' + id] && saved.docs['photos/' + id].pages[0].length > 500000)
      && Object.values(saved.docs).some((d) => d && d.t === 'Gulaschsuppe') && Object.keys(saved.docs).some((p) => p.startsWith('days/')), 'the app saves everything, photos too', download.suggestedFilename());
    const backup = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'backup.json'), 'utf8'));
    for (const id of ['load1', 'load2', 'load3']) backup.docs['photos/' + id] = bigPhoto();
    const backupFile = path.join(tmp, 'antom-sicherung.json');
    fs.writeFileSync(backupFile, JSON.stringify(backup));
    let parts = 0;
    a.page.on('request', (r) => { if (r.url().includes('/api/import/part')) parts++; });
    const [chooser] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.click('#sheet [data-act="backup-load"]')]);
    await chooser.setFiles(backupFile);
    await wait(600);
    ok((await a.page.textContent('#sheet .confirm-t p')).includes('1 eigenes Rezept'), 'loading asks first and says what is in it');
    await a.page.click('#sheet [data-act="restore-backup"]');
    ok(await until(async () => {
      const d = await docs();
      return d['dishes/cbackup01'] && !Object.values(d).some((x) => x && x.t === 'Gulaschsuppe') && !d['photos/big1'] && ['load1', 'load2', 'load3'].every((id) => d['photos/' + id] && d['photos/' + id].pages[0].length > 500000);
    }, 15000), 'the backup replaces the plan on the server, photos too');
    ok(parts >= 3, 'loaded in parts', parts);
    await b.page.click('.tabbar [data-tab="book"]');
    ok(await until(() => b.page.locator('#book .grid .card[data-dish="cbackup01"]').count().then((n) => n === 1), 12000), 'phone B shows the restored recipes');

    console.log('G. on the iPhone');
    const c = await phone('C', { hint: true });
    await c.page.goto(URL_APP);
    ok(await until(() => c.page.locator('#sheet', { hasText: 'Zum Home-Bildschirm' }).count().then((n) => n === 1), 5000), 'Safari shows how to put Antom on the home screen');
    await c.page.click('#sheet [data-act="close"]');
    ok(await until(() => c.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }), 8000), 'the app keeps itself for offline starts');
    await c.page.reload();
    await wait(1200);
    await c.ctx.setOffline(true);
    await c.page.reload();
    await wait(1500);
    const offLabel = await label(c.page);
    await c.page.click('.tabbar [data-tab="book"]');
    await wait(400);
    ok(offLabel === 'Familienplan · offline' && await c.page.locator('#book .grid .card[data-dish="cbackup01"]').count() === 1, 'opens without internet with the family\'s last plan', offLabel);
    await c.ctx.setOffline(false);

    console.log('H. daily limit for Claude');
    const broke = await askServer('MOCK:NO_CREDIT Rezept bitte');
    ok(broke.status === 402 && (await broke.json()).error === 'no_credit', 'an empty Claude account is reported as such');
    let refused = null;
    for (let i = 0; i < LIMIT + 5 && !refused; i++) {
      const r = await askServer('Noch ein Rezept bitte');
      if (r.status !== 200) refused = { status: r.status, error: (await r.json()).error };
    }
    ok(refused && refused.status === 429 && refused.error === 'daily_limit' && forwarded().length === LIMIT, 'stops at the daily limit, and not a request more reaches Claude', [refused, forwarded().length]);
    await a.page.click('.tabbar [data-tab="book"]');
    await wait(400);
    await a.page.click('#book .promo [data-act="import"]');
    await wait(500);
    await a.page.click('#sheet [data-act="imp-mode"][data-mode="paste"]').catch(() => {});
    await a.page.fill('#impText', 'Kartoffelsuppe: 1 kg Kartoffeln, 1 l Brühe. Alles kochen und pürieren.');
    await a.page.click('#sheet [data-act="imp-go"]');
    ok(await until(() => a.page.locator('#sheet', { hasText: 'Für heute sind die Claude-Anfragen aufgebraucht' }).count().then((n) => n === 1), 8000), 'the app says so in plain words');
    await a.page.keyboard.press('Escape');

    const errors = [...a.errors, ...b.errors, ...c.errors];
    ok(!errors.length, 'no page errors', errors);
    await c.ctx.close();
    await a.ctx.close();
    await b.ctx.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    await browser.close();
    stop(server);
    stop(mock);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
