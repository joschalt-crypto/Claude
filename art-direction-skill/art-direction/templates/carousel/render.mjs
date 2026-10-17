// Renders each .slide in carousel.html to a 1080×1350 PNG in ./out
// Usage: node render.mjs   (needs Playwright: npm i -g playwright)
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.execPath, '../../lib/node_modules/playwright')); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(pathToFileURL(path.join(dir, 'carousel.html')).href);
await page.evaluate(() => document.fonts.ready);
const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  await slides[i].screenshot({ path: path.join(out, `slide-${String(i + 1).padStart(2, '0')}.png`) });
}
await browser.close();
console.log(`Rendered ${slides.length} slides to ${out}`);
