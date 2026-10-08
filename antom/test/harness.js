// Playwright helpers for testing Antom locally. Serves the page the way the
// artifact viewer does (document skeleton + small reset), fakes window.claude,
// and answers the CDN and Google Fonts requests from test/vendor so the tests
// run without network access.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const IMG = path.join(APP, 'img');
const VENDOR = path.join(__dirname, 'vendor');
const SHOTS = path.join(__dirname, 'shots');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

let server = null;
let baseUrl = '';

function startServer() {
  if (server) return Promise.resolve(baseUrl);
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/' || pathname === '/page.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(SKELETON + fs.readFileSync(path.join(APP, 'index.html'), 'utf8') + '</body></html>');
      return;
    }
    const file = path.join(APP, path.normalize(decodeURIComponent(pathname)));
    if (!file.startsWith(IMG + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/webp' });
    fs.createReadStream(file).pipe(res);
  });
  server.unref();
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve(baseUrl);
  }));
}

const base = () => baseUrl;

async function launch() {
  const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(preinstalled) ? preinstalled : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}

async function newPage(browser, opts = {}, init) {
  await startServer();
  const ctx = await browser.newContext(Object.assign({ deviceScaleFactor: 2 }, opts));
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ path: path.join(VENDOR, 'Sortable.min.js'), contentType: 'application/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/fonts/')) return r.fulfill({ path: path.join(VENDOR, u.pathname), contentType: 'font/woff2' });
    return r.fulfill({ path: path.join(VENDOR, 'fonts.css'), contentType: 'text/css' });
  });
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!/gstatic/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  return { ctx, page, errors };
}

async function open(page) {
  await page.goto(base() + '/page.html');
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded');
  await page.waitForTimeout(300);
}

async function shot(page, name, opts = {}) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name + '.png');
  await page.screenshot(Object.assign({ path: file }, opts));
  return file;
}

// In-memory stand-in for the artifact viewer's window.claude (db + user + sample).
// Seed docs with window.__seed; read writes from window.__writes / window.__docs;
// window.__canWrite, __denyWrites and __sampleReply steer the fakes.
const MOCK = `
(() => {
  const docs = new Map(Object.entries(window.__seed || {}));
  const listeners = new Set();
  const colOf = (p) => p.split('/').slice(0, -1).join('/');
  const freeze = (o) => JSON.parse(JSON.stringify(o));
  function snapFor(col) {
    const out = [];
    for (const [p, d] of docs) if (colOf(p) === col) out.push({ id: p.split('/').pop(), exists: true, data: () => freeze(d), metadata: { fromCache: false, hasPendingWrites: false } });
    out.sort((a, b) => a.id.localeCompare(b.id));
    return { docs: out, size: out.length, empty: !out.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notify(col) { for (const l of listeners) if (l.col === col) setTimeout(() => l.cb(snapFor(col)), 5); }
  const db = {
    doc(path) {
      return {
        path, id: path.split('/').pop(),
        async get() { const d = docs.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => d && freeze(d) }; },
        async set(data) {
          if (window.__denyWrites) throw { code: 'invalid_argument', message: 'denied' };
          window.__writes.push(['set', path]); docs.set(path, freeze(data)); notify(colOf(path));
        },
        async delete() { window.__writes.push(['delete', path]); docs.delete(path); notify(colOf(path)); },
      };
    },
    collection(col) {
      return {
        path: col,
        onSnapshot(cb) { const l = { col, cb }; listeners.add(l); setTimeout(() => cb(snapFor(col)), 20); return () => listeners.delete(l); },
        doc(id) { return db.doc(col + '/' + id); },
      };
    },
  };
  window.__writes = [];
  window.__docs = docs;
  window.__external = (path, data) => { docs.set(path, data); notify(colOf(path)); };
  const user = { can: async () => (window.__canWrite === undefined ? true : window.__canWrite), isOwner: async () => true, canEdit: async () => true };
  const sample = async () => ({ text: 'ok', truncated: false, modelTierApplied: 'default' });
  sample.json = async (input, opts) => {
    window.__lastPrompt = input;
    await new Promise((r) => setTimeout(r, 60));
    if (opts && opts.onText) opts.onText({ text: '{', delta: '{' });
    return window.__sampleReply;
  };
  window.claude = { use: async (name) => { await new Promise((r) => setTimeout(r, 30)); return name === 'db' ? db : name === 'user' ? user : name === 'sample' ? sample : null; } };
})();`;

// Lets the faked sample() accept images and remembers the options of the last call.
const SAMPLE_IMAGES = `(() => {
  const orig = window.claude.use;
  window.claude.use = async (name) => {
    const r = await orig(name);
    if (name === 'sample' && r && !r.__patched) {
      r.__patched = true;
      r.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 3, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } });
      const j = r.json;
      r.json = async (input, opts) => { window.__lastOpts = opts; return j(input, opts); };
    }
    return r;
  };
})();`;

module.exports = { launch, newPage, open, shot, MOCK, SAMPLE_IMAGES, base, SHOTS };
