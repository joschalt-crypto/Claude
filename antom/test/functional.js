// Functional checks for Antom against a faked window.claude: run `node test/functional.js`.
const path = require('path');
const { launch, newPage, open, MOCK, base } = require('./harness');
const { seedScript } = require('./seed');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};
const wait = (page, ms = 150) => page.waitForTimeout(ms);
const docs = (page) => page.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries(window.__docs))));
const ids = (list) => (list || []).map((e) => e.d);
const text = (page, sel) => page.locator(sel).first().innerText();
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const desk = { viewport: { width: 1366, height: 900 } };
// page-side extras: image limits for sample, remember the options of the last call
const SAMPLE_PLUS = `(() => {
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
const RECIPE = {
  t: 'Kürbissuppe', name: 'Kürbissuppe mit Croutons', cat: 'haupt', time: 40, veg: true,
  ingredients: [
    { q: 800, u: 'g', n: 'Hokkaido-Kürbis', s: 'obst', p: false, x: '' },
    { q: 1, u: '', n: 'Zwiebel', s: 'obst', p: false, x: '' },
    { q: 1, u: 'EL', n: 'Olivenöl', s: 'gewuerz', p: true, x: '' },
    { q: 400, u: 'ml', n: 'Kokosmilch', s: 'konserve', p: false, x: '1 Dose' },
  ],
  steps: [
    { t: 'Kürbis und Zwiebel würfeln und in Öl anschwitzen.', af: null },
    { t: 'Brotwürfel im Cosori goldbraun rösten.', af: { label: 'Croutons rösten', c: 180, m: 6, sh: [3], pre: false } },
  ],
  tip: 'Mit Kernöl beträufeln.',
};

const ghostAt = (page, at) => page.evaluate(([day, slot, idx]) => {
  const g = document.querySelector('.is-ghost');
  if (!g) return false;
  if (day === 'trash') return !!g.parentElement && g.parentElement.id === 'trash';
  const s = g.closest('.slot');
  return !!s && s.dataset.day === day && s.dataset.slot === slot && (idx == null || [...s.querySelectorAll('.meal, .shelf-row')].indexOf(g) === idx);
}, at);
async function drag(page, fromSel, toSel, { yFrac = 0.5, until = null } = {}) {
  // move toward the target, re-measuring as the list reflows, and let go once the
  // placeholder sits where we want it - the way a person watches the gap open up
  const a = await page.locator(fromSel).first().boundingBox();
  let x = a.x + a.width / 2, y = a.y + a.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y + 6, { steps: 4 });
  x += 6; y += 6;
  await wait(page, 120);
  for (let i = 0; i < 80; i++) {
    if (until && await ghostAt(page, until)) break;
    const b = await page.locator(toSel).first().boundingBox();
    const tx = b.x + b.width / 2, ty = b.y + b.height * yFrac;
    const dx = tx - x, dy = ty - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) { if (!until) break; y += (i % 2 ? -8 : 8); } else { const st = Math.min(1, 30 / dist); x += dx * st; y += dy * st; }
    await page.mouse.move(x, y, { steps: 2 });
    await wait(page, 40);
  }
  await wait(page, 120);
  await page.mouse.up();
  await wait(page, 350);
}
async function touchDrag(page, fromSel, toSel) {
  const cdp = await page.context().newCDPSession(page);
  const a = await page.locator(fromSel).first().boundingBox();
  const p0 = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p0] });
  await wait(page, 450);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + 3, y: p0.y + 8 }] });
  await wait(page, 100);
  const b = await page.locator(toSel).first().boundingBox();
  const p1 = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + (p1.x - p0.x) * i / 16, y: p0.y + (p1.y - p0.y) * i / 16 }] });
    await wait(page, 20);
  }
  await wait(page, 150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(page, 400);
}

(async () => {
  const browser = await launch();
  const todayKey = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][new Date().getDay()];

  console.log('A. shared plan on a phone');
  {
    const { page, errors, ctx } = await newPage(browser, Object.assign({ colorScheme: 'light' }, phone), seedScript() + MOCK + SAMPLE_PLUS);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base() });
    await open(page);
    await wait(page, 600);
    ok(await page.locator('#days .meal').count() === 12, 'renders the 12 planned meals');
    ok((await text(page, '.app-bar .sync')).includes('Familie'), 'sync pill says Familie');
    const seedToday = { mo: 'Bolo', di: 'Caponata', mi: 'Tikka Masala', do: 'Porridge', fr: 'Fisch', sa: 'Linsen mit Spätzle', so: 'Joghurt' }[todayKey];
    ok((await text(page, '#today h2')).includes(seedToday), 'today card shows today\'s dish', [todayKey, await text(page, '#today h2')]);
    ok(await page.locator('#strip .daypill.is-today').count() === 1, 'day strip marks today');

    await page.click('#days .meal[data-dish="caponata"]');
    await wait(page, 700);
    ok(await page.locator('#sheet').isVisible(), 'tapping a meal opens the recipe');
    ok((await text(page, '#sheetTitle')) === 'Caponata', 'recipe title');
    ok((await text(page, '#sheet .r-eyebrow')) === 'DIENSTAG · HAUPTESSEN' || (await text(page, '#sheet .r-eyebrow')).toLowerCase() === 'dienstag · hauptessen', 'eyebrow names day and meal');
    await page.click('#sheet [data-act="rtab"][data-tab="shop"]');
    await wait(page);
    const qty = async (name) => page.evaluate((n) => { const li = [...document.querySelectorAll('#sheet .pane .items li')].find((x) => x.querySelector('.nm').textContent === n); return li ? li.querySelector('.qty').textContent : null; }, name);
    ok(await qty('Auberginen') === '2', 'dish shopping list for 2 people', await qty('Auberginen'));
    await page.click('#sheet [data-act="sv"][data-d="1"]');
    await wait(page);
    ok(await qty('Auberginen') === '3', 'servings +1 scales the list', await qty('Auberginen'));
    let d = await docs(page);
    ok(d['plan/di'].h[0].s === 3, 'servings saved on the plan entry', d['plan/di'].h[0]);
    await page.click('#sheet [data-act="sv"][data-d="-1"]');
    await wait(page);
    d = await docs(page);
    ok(d['plan/di'].h[0].s === undefined, 'back to default servings removes the override', d['plan/di'].h[0]);
    await page.click('#sheet [data-act="rtab"][data-tab="recipe"]');
    await wait(page);
    ok(await page.locator('#sheet .steps > li').count() >= 4 && await page.locator('#sheet .af-card').count() >= 1, 'recipe tab shows steps with a Cosori card');
    const ck = await page.locator('#sheet .ck-link').first().getAttribute('href');
    ok(ck === 'https://www.chefkoch.de/rs/s0/Caponata/Rezepte.html', 'Chefkoch search link', ck);

    await page.click('#sheet [data-act="r-pick"]');
    await wait(page);
    await page.click('#sheet [data-act="pp-day"][data-day="do"]');
    await wait(page, 400);
    d = await docs(page);
    ok(ids(d['plan/do'].h).join() === 'caponata' && !d['plan/di'].h.length, 'Verschieben moves it to Thursday', [d['plan/do'].h, d['plan/di'].h]);
    ok(await page.locator('#sheet').isHidden(), 'sheet closes after moving');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    d = await docs(page);
    ok(ids(d['plan/di'].h).join() === 'caponata' && !d['plan/do'].h.length, 'undo puts it back', [d['plan/do'].h, d['plan/di'].h]);

    await page.click('#days .meal[data-dish="caponata"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-remove"]');
    await wait(page, 300);
    d = await docs(page);
    ok(!d['plan/di'].h.length, 'remove from plan');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    d = await docs(page);
    ok(ids(d['plan/di'].h).join() === 'caponata', 'undo remove');

    await page.click('#days .slot[data-day="do"][data-slot="h"] .meal-empty');
    await wait(page, 400);
    await page.fill('#pickSearch', 'risotto');
    await wait(page);
    ok(await page.locator('#sheet .pick-row').count() === 1, 'picker search filters');
    await page.click('#sheet .pick-row');
    await wait(page, 300);
    d = await docs(page);
    ok(ids(d['plan/do'].h).join() === 'risotto', 'picker adds to the empty slot', d['plan/do']);

    // keyboard: Enter opens, Escape closes
    await page.focus('#days .meal[data-dish="fisch"]');
    await page.keyboard.press('Enter');
    await wait(page, 600);
    ok((await text(page, '#sheetTitle')) === 'Fisch', 'Enter opens a focused meal');
    await page.keyboard.press('Escape');
    await wait(page, 500);
    ok(await page.locator('#sheet').isHidden(), 'Escape closes the sheet');

    // shopping list
    await page.click('.tabbar [data-tab="shop"]');
    await wait(page, 300);
    const badge = Number(await text(page, '.tabbar [data-count]'));
    const openItems = await page.locator('#shop .items li:not(.done)').count();
    ok(badge === openItems && badge > 20, 'badge counts open items', [badge, openItems]);
    const firstKey = await page.locator('#shop [data-act="toggle-item"]').first().getAttribute('data-key');
    await page.locator('#shop [data-act="toggle-item"]').first().check();
    await wait(page, 500);
    d = await docs(page);
    ok(d['meta/shop'] && d['meta/shop'].checked[firstKey] === true, 'ticking an item is saved', d['meta/shop']);
    ok((await text(page, '.shop-progress')).startsWith('1 von'), 'progress counts it');
    await page.fill('#extraInput', 'Kaffee');
    await page.press('#extraInput', 'Enter');
    await wait(page, 300);
    d = await docs(page);
    ok(d['meta/shop'].extras.length === 1 && d['meta/shop'].extras[0].t === 'Kaffee', 'own item added', d['meta/shop'].extras);
    ok(await page.locator('#extraInput').evaluate((el) => document.activeElement === el), 'input keeps focus for the next item');
    await page.click('#shop .fold[data-fold="pantryOpen"] > summary');
    await wait(page);
    const pantryKey = await page.locator('#shop [data-act="need"]').first().getAttribute('data-key');
    await page.locator('#shop [data-act="need"]').first().click();
    await wait(page, 300);
    ok(await page.locator(`#shop [data-act="toggle-item"][data-key="${pantryKey}"]`).count() === 1, 'pantry item moves onto the list');
    await page.click('#shop [data-act="copy-week"]');
    await wait(page, 300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith('Einkaufsliste KW') && clip.includes('• Kaffee') && clip.includes('Obst & Gemüse'), 'share copies a readable list', clip.slice(0, 120));

    // cookbook
    await page.click('.tabbar [data-tab="book"]');
    await wait(page, 300);
    ok(await page.locator('#book .card').count() === 25, '25 recipes in the cookbook');
    await page.click('#chips [data-f="veg"]');
    await wait(page);
    ok(await page.locator('#book .card').count() === 21, 'vegetarian filter', await page.locator('#book .card').count());
    await page.click('#chips [data-f="quick"]');
    await wait(page);
    const quick = await page.locator('#book .card .card-m').allInnerTexts();
    ok(quick.length > 0 && quick.every((t) => Number(t.split(' ')[0]) <= 20), 'quick filter only shows ≤ 20 min', quick);
    await page.click('#chips [data-f="alle"]');
    await page.fill('#bookSearch', 'spätzle');
    await wait(page);
    ok(await page.locator('#book .card').count() === 1 && (await text(page, '#book .card-t')) === 'Linsen mit Spätzle', 'search finds by ingredient/title');
    await page.fill('#bookSearch', 'Wiener Schnitzel');
    await wait(page);
    const ckEmpty = await page.locator('#book .empty-box a').getAttribute('href');
    ok(ckEmpty === 'https://www.chefkoch.de/rs/s0/Wiener+Schnitzel/Rezepte.html', 'empty search offers Chefkoch', ckEmpty);
    await page.fill('#bookSearch', '');
    await wait(page);

    // cookbook card → plan
    await page.click('#book .card[data-dish="mozza"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-pick"]');
    await page.click('#sheet [data-act="pp-slot"][data-slot="h"]');
    await page.click('#sheet [data-act="pp-day"][data-day="so"]');
    await wait(page, 300);
    d = await docs(page);
    ok(ids(d['plan/so'].h).join() === 'mozza', 'cookbook → "In den Plan" → Sunday', d['plan/so']);

    // new recipe by hand
    await page.click('#viewBook [data-act="new-dish"]');
    await wait(page, 400);
    await page.fill('#f-t', 'Gefüllte Paprika');
    await page.fill('#f-time', '50');
    await page.fill('#f-ing', '4 Paprika\n300 g Rinderhack\n1 Zwiebel\n½ TL Paprikapulver\nSalz, Pfeffer');
    await page.fill('#f-step-0', 'Paprika füllen und in den Korb setzen.');
    await page.check('#sheet .step-edit [data-af-on]');
    await page.fill('#sheet .step-edit [data-af-c]', '180');
    await page.fill('#sheet .step-edit [data-af-m]', '20');
    await page.fill('#sheet .step-edit [data-af-sh]', '10');
    await page.fill('#sheet .step-edit [data-af-label]', 'Paprika garen');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 400);
    d = await docs(page);
    const newId = Object.keys(d).find((k) => k.startsWith('dishes/c'));
    const nd = newId && d[newId];
    ok(nd && nd.t === 'Gefüllte Paprika' && nd.time === 50, 'new recipe saved', nd);
    const ing = (nd && nd.ing) || [];
    const byName = Object.fromEntries(ing.map((i) => [i.n, i]));
    ok(byName.Paprika && byName.Paprika.q === 4 && byName.Paprika.u === '' && byName.Paprika.s === 'obst', 'parses "4 Paprika"', byName.Paprika);
    ok(byName.Rinderhack && byName.Rinderhack.q === 300 && byName.Rinderhack.u === 'g' && byName.Rinderhack.s === 'fleisch', 'parses "300 g Rinderhack" into the meat aisle', byName.Rinderhack);
    ok(byName.Paprikapulver && byName.Paprikapulver.q === 0.5 && byName.Paprikapulver.u === 'TL' && byName.Paprikapulver.p === 1, 'parses ½ TL into the pantry', byName.Paprikapulver);
    ok(byName['Salz, Pfeffer'] && byName['Salz, Pfeffer'].p === 1 && byName['Salz, Pfeffer'].q === null, 'line without amount', byName['Salz, Pfeffer']);
    ok(nd && nd.steps[0].af && nd.steps[0].af.c === 180 && nd.steps[0].af.m === 20 && nd.steps[0].af.sh === 10, 'Cosori step saved', nd && nd.steps);
    const cardSel = `#book .card[data-dish="${newId.split('/')[1]}"]`;
    ok(await page.locator(cardSel).count() === 1 && (await text(page, `${cardSel} .tag`)) === 'Eigenes', 'card appears with "Eigenes" tag');
    await page.click(cardSel);
    await wait(page, 600);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 400);
    ok(await page.inputValue('#f-ing') === '4 Paprika\n300 g Rinderhack\n1 Zwiebel\n½ TL Paprikapulver\nSalz, Pfeffer', 'edit form shows the ingredient lines', await page.inputValue('#f-ing'));
    await page.click('#sheet [data-act="delete-dish"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="really-delete"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!d[newId] && await page.locator(cardSel).count() === 0, 'delete own recipe');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!!d[newId] && await page.locator(cardSel).count() === 1, 'undo delete');

    // edit a built-in recipe, then restore the original
    await page.click('#book .card[data-dish="pizza"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 300);
    await page.fill('#f-time', '25');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 400);
    ok((await page.locator('#book .card[data-dish="pizza"] .tag').allInnerTexts()).includes('angepasst'), 'edited built-in gets "angepasst"');
    await page.click('#book .card[data-dish="pizza"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="restore-dish"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!d['dishes/pizza'] && await page.locator('#book .card[data-dish="pizza"] .tag').count() === 0, 'restore original');

    // Claude writes a recipe in the form
    await page.evaluate((r) => { window.__sampleReply = r; }, RECIPE);
    await page.click('#viewBook [data-act="new-dish"]');
    await wait(page, 400);
    await page.fill('#f-t', 'Kürbissuppe');
    await page.fill('#f-wish', 'mit Croutons');
    await page.click('#sheet [data-act="claude"]');
    await page.waitForFunction(() => /Fertig/.test((document.querySelector('#sheet .ai-box .status') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
    ok(/Fertig/.test(await text(page, '#sheet .ai-box .status')), 'Claude fills the form');
    ok((await page.inputValue('#f-ing')).includes('800 g Hokkaido-Kürbis') && (await page.inputValue('#f-ing')).includes('400 ml Kokosmilch (1 Dose)'), 'ingredient lines from Claude', await page.inputValue('#f-ing'));
    ok(await page.inputValue('#f-t') === 'Kürbissuppe' && await page.inputValue('#f-wish') === 'mit Croutons', 'name and wish survive the re-render');
    ok(await page.locator('#sheet .step-edit').count() === 2 && await page.locator('#sheet .step-edit').nth(1).locator('[data-af-on]').isChecked(), 'Cosori step from Claude');
    const prompt = await page.evaluate(() => window.__lastPrompt);
    ok(prompt.includes('"Kürbissuppe"') && prompt.includes('mit Croutons') && prompt.includes('200 °C'), 'prompt carries name, wish and Cosori limit');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 400);
    d = await docs(page);
    const soup = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Kürbissuppe');
    ok(soup && soup[1].name === 'Kürbissuppe mit Croutons' && soup[1].ing.find((i) => i.n === 'Olivenöl').p === 1 && soup[1].ing.find((i) => i.n === 'Kokosmilch').s === 'konserve', 'Claude recipe saved with aisles and pantry', soup && soup[1].ing);
    ok(soup && soup[1].steps[1].af && soup[1].steps[1].af.sh === 3, 'Claude Cosori step saved', soup && soup[1].steps);

    // Chefkoch import from pasted text
    await page.evaluate((r) => { window.__sampleReply = Object.assign({}, r, { t: 'Ofen-Kürbis' }); }, RECIPE);
    await page.click('#book [data-act="import"]');
    await wait(page, 400);
    await page.fill('#ckQ', 'Kürbis Ofen');
    ok(await page.getAttribute('#ckGo', 'href') === 'https://www.chefkoch.de/rs/s0/K%C3%BCrbis+Ofen/Rezepte.html', 'import search builds a Chefkoch link', await page.getAttribute('#ckGo', 'href'));
    await page.click('#sheet [data-act="imp-mode"][data-mode="text"]');
    await page.fill('#impText', 'Kürbis halbieren, entkernen, in Spalten schneiden. Im Ofen bei 200 Grad 25 Minuten backen. Zutaten: 1 Hokkaido, 2 EL Öl, Salz.');
    await page.fill('#impUrl', 'https://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html');
    await page.click('#sheet [data-act="imp-go"]');
    await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
    await wait(page, 300);
    ok(await page.inputValue('#f-t') === 'Ofen-Kürbis' && await page.inputValue('#f-src') === 'https://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html', 'import opens the form with name and source');
    const ip = await page.evaluate(() => window.__lastPrompt);
    ok(ip.includes('Ofen bei 200 Grad') && ip.includes('auf 2 Personen'), 'import prompt contains the pasted text');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 400);
    d = await docs(page);
    const imp = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Ofen-Kürbis');
    ok(imp && imp[1].src && imp[1].src.url.includes('chefkoch.de'), 'imported recipe keeps its source');
    const impSel = `#book .card[data-dish="${imp[0].split('/')[1]}"]`;
    ok((await text(page, `${impSel} .tag`)) === 'Chefkoch', 'card is tagged Chefkoch');
    await page.click(impSel);
    await wait(page, 600);
    await page.click('#sheet [data-act="rtab"][data-tab="recipe"]');
    await wait(page);
    ok(await page.locator('#sheet .ck-link').first().getAttribute('href') === 'https://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html', 'recipe links to the original');
    await page.keyboard.press('Escape');
    await wait(page, 400);

    // screenshot import (images)
    await page.click('#book [data-act="import"]');
    await wait(page, 400);
    await page.click('#sheet [data-act="imp-mode"][data-mode="shots"]');
    await wait(page);
    await page.setInputFiles('#impFiles', path.join(__dirname, '..', 'img', 'kochbuch-s.webp'));
    await wait(page);
    ok(await page.locator('#impThumbs img').count() === 1, 'screenshot preview');
    await page.click('#sheet [data-act="imp-go"]');
    await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
    const imgs = await page.evaluate(() => (window.__lastOpts && window.__lastOpts.images ? window.__lastOpts.images.length : 0));
    ok(imgs === 1 && await page.locator('#dishForm').count() === 1, 'screenshots are sent to Claude', imgs);
    await page.keyboard.press('Escape');
    await wait(page, 400);

    // settings: people
    await page.click('.app-bar .icon-btn[data-act="settings"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="people"][data-d="1"]');
    await wait(page, 300);
    d = await docs(page);
    ok(d['meta/settings'] && d['meta/settings'].people === 3, 'people setting saved');
    await page.keyboard.press('Escape');
    await page.click('.tabbar [data-tab="shop"]');
    await wait(page, 300);
    ok((await text(page, '#shop .view-sub')).includes('für 3 Personen'), 'shopping list follows the household size');

    // external change arrives live
    await page.click('.tabbar [data-tab="week"]');
    await page.evaluate(() => window.__external('plan/mo', { f: [{ u: 'x-1', d: 'joghurt' }], h: [{ u: 'x-2', d: 'pizza' }] }));
    await wait(page, 300);
    ok(await page.locator('#days .slot[data-day="mo"][data-slot="h"] .meal[data-dish="pizza"]').count() === 1, 'changes from the other phone show up live');

    // a deleted built-in disappears from the plan too
    await page.click('#days .meal[data-dish="caponata"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="delete-dish"]');
    await page.click('#sheet [data-act="really-delete"]');
    await wait(page, 400);
    d = await docs(page);
    ok(d['dishes/caponata'] && d['dishes/caponata'].deleted === true && !ids(d['plan/di'].h).includes('caponata'), 'deleting a built-in hides it and clears the plan');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!d['dishes/caponata'] && ids(d['plan/di'].h).includes('caponata'), 'undo brings it back');

    // cook mode + timer
    await page.click('#days .meal[data-dish="caponata"]');
    await wait(page, 600);
    await page.click('#sheet [data-act="r-cook"]');
    await wait(page, 300);
    ok(await page.locator('#cook').isVisible() && (await text(page, '#cook .cook-title')) === 'Caponata', 'cook mode opens on the prep page');
    const titleBox = await page.locator('#cook .cook-title').boundingBox();
    ok(titleBox && titleBox.y > 40, 'cook title is not cut off', titleBox);
    await page.click('#cook [data-act="cook-next"]');
    await page.click('#cook [data-act="cook-next"]');
    await wait(page);
    await page.click('#cook [data-act="cook-timer"]');
    await wait(page, 1300);
    const t1 = await text(page, '#cook .ring .t b');
    ok(/^14:5\d$/.test(t1), 'timer ring counts down', t1);
    await page.click('#cook [data-act="timer-pause"]');
    await wait(page, 1200);
    ok((await text(page, '#cook .ring .t b')) === (await text(page, '#cook .ring .t b')) && /Pausiert/.test(await text(page, '#cook [data-info]')), 'pause');
    await page.click('#cook [data-act="timer-pause"]');
    await page.click('#cook [data-act="cook-close"]');
    await page.keyboard.press('Escape');
    await wait(page, 400);
    ok(await page.locator('#timer').isVisible() && (await text(page, '#timer .t-label')).includes('Caponata'), 'timer pill keeps running outside cook mode');
    await page.click('#timer [data-act="timer-stop"]');
    await wait(page);
    ok(await page.locator('#timer').isHidden(), 'stop timer');

    // new week
    await page.click('#weekFoot [data-act="clear-week"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="clear-main"]');
    await wait(page, 400);
    d = await docs(page);
    ok(['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].every((k) => !d['plan/' + k].h.length && d['plan/' + k].f.length), 'new week clears mains, keeps breakfast');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(ids(d['plan/mi'].h).join() === 'tikka', 'undo new week');

    console.log('  page errors:', JSON.stringify(errors));
    ok(!errors.length, 'no page errors (A)');
    await ctx.close();
  }

  console.log('B. Claude fills free days');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    ok((await text(page, '#weekFoot [data-act="suggest"]')).includes('2 freie Tage'), 'offers to fill the two free days');
    await page.evaluate(() => { window.__sampleReply = { vorschlaege: [{ tag: 'do', id: 'risotto', grund: 'cremig und schnell' }, { tag: 'so', id: 'pizza', grund: 'Sonntagsklassiker' }, { tag: 'mo', id: 'bolo' }, { tag: 'so', id: 'fisch' }, { tag: 'do', id: 'gibtsnicht' }] }; });
    await page.click('#weekFoot [data-act="suggest"]');
    await page.waitForSelector('#sheet .sug', { timeout: 4000 }).catch(() => {});
    ok(await page.locator('#sheet .sug').count() === 2, 'keeps only valid suggestions for free days', await page.locator('#sheet .sug').count());
    const sp = await page.evaluate(() => window.__lastPrompt);
    ok(sp.includes('do, so') && sp.includes('risotto: Risotto'), 'prompt lists free days and the cookbook');
    await page.click('#sheet [data-act="sug-ok"]');
    await wait(page, 400);
    const d = await docs(page);
    ok(ids(d['plan/do'].h).join() === 'risotto' && ids(d['plan/so'].h).join() === 'pizza', 'suggestions planned');
    ok(await page.locator('#weekFoot [data-act="suggest"]').count() === 0, 'button disappears when the week is full');
    ok(!errors.length, 'no page errors (B)', errors);
    await ctx.close();
  }

  console.log('C. view-only, refused writes, no Claude');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript('window.__canWrite = false;') + MOCK);
    await open(page);
    await wait(page, 500);
    ok((await text(page, '.app-bar .sync')).includes('Dieses Gerät'), 'view-only viewer works on this device');
    ok(await page.locator('#days .slot[data-day="sa"][data-slot="h"] .meal[data-dish="linsen"]').count() === 1 && await page.locator('#days .meal').count() === 8, 'starts from the fridge week');
    await page.click('#days .slot[data-day="mo"][data-slot="h"] .meal-empty');
    await wait(page, 300);
    await page.click('#sheet .pick-row[data-id="bolo"]');
    await wait(page, 400);
    const w = await page.evaluate(() => window.__writes.length);
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('antom.v1') || 'null'));
    ok(w === 0 && ls && ls.plan.mo.h[0].d === 'bolo', 'saves locally, never writes shared data', [w, ls && ls.plan.mo]);
    ok(!errors.length, 'no page errors (C1)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript('window.__denyWrites = true;') + MOCK);
    await open(page);
    await wait(page, 500);
    await page.click('#days .slot[data-day="do"][data-slot="h"] .meal-empty');
    await wait(page, 300);
    await page.click('#sheet .pick-row[data-id="bolo"]');
    await wait(page, 600);
    ok((await text(page, '#toast')).includes('Bearbeitungsrechte') && (await text(page, '.app-bar .sync')).includes('Dieses Gerät'), 'refused write falls back to this device with a note');
    ok(await page.locator('#days .slot[data-day="do"][data-slot="h"] .meal[data-dish="bolo"]').count() === 1, 'the change is kept locally');
    ok(!errors.length, 'no page errors (C2)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone);
    await open(page);
    await wait(page, 300);
    ok((await text(page, '.app-bar .sync')).includes('Dieses Gerät') && await page.locator('#weekFoot [data-act="suggest"]').count() === 0, 'outside Claude: local mode, no Claude buttons');
    await page.click('#days .slot[data-day="fr"][data-slot="h"] .meal-empty');
    await wait(page, 300);
    await page.click('#sheet .pick-row[data-id="fisch"]');
    await wait(page, 400);
    await page.reload();
    await page.waitForTimeout(500);
    ok(await page.locator('#days .slot[data-day="fr"][data-slot="h"] .meal[data-dish="fisch"]').count() === 1, 'local plan survives a reload');
    await page.click('.tabbar [data-tab="book"]');
    await page.click('#book [data-act="import"]');
    await wait(page, 300);
    ok(await page.locator('#sheet [data-act="imp-manual"]').count() === 1, 'import offers manual entry without Claude');
    ok(!errors.length, 'no page errors (C3)', errors);
    await ctx.close();
  }

  console.log('D. drag & drop');
  {
    const { page, errors, ctx } = await newPage(browser, desk, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    await page.evaluate(() => { document.getElementById('day-mo').scrollIntoView(); });
    await wait(page, 200);
    await drag(page, '#days .slot[data-day="mo"][data-slot="h"] .meal', '#days .slot[data-day="mi"][data-slot="h"] .meal[data-dish="tikka"]:not(.is-ghost)', { yFrac: 0.85, until: ['mi', 'h', 1] });
    let d = await docs(page);
    ok(ids(d['plan/mi'].h).join() === 'tikka,bolo' && !d['plan/mo'].h.length, 'mouse drag moves a meal to another day (after)', [d['plan/mo'].h, d['plan/mi'].h]);
    await page.evaluate(() => { document.getElementById('day-mo').scrollIntoView(); });
    await drag(page, '#days .slot[data-day="di"][data-slot="h"] .meal', '#trash', { until: ['trash'] });
    d = await docs(page);
    ok(!d['plan/di'].h.length && (await text(page, '#toast')).includes('vom Plan genommen'), 'drop on the bin removes it', d['plan/di']);
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    await page.fill('#shelfSearch', 'risotto');
    await wait(page, 200);
    await page.evaluate(() => { document.getElementById('day-mo').scrollIntoView(); });
    await drag(page, '#shelfList .shelf-row[data-dish="risotto"]', '#days .slot[data-day="mo"][data-slot="h"]', { until: ['mo', 'h', 0] });
    d = await docs(page);
    ok(ids(d['plan/mo'].h).join() === 'risotto', 'drag from the cookbook shelf onto an empty day', d['plan/mo']);
    await page.fill('#shelfSearch', 'pizza');
    await wait(page, 200);
    await page.evaluate(() => { document.getElementById('day-mo').scrollIntoView(); });
    await drag(page, '#shelfList .shelf-row[data-dish="pizza"]', '#days .slot[data-day="mi"][data-slot="h"] .meal[data-dish="tikka"]:not(.is-ghost)', { yFrac: 0.8, until: ['mi', 'h', 1] });
    d = await docs(page);
    ok(ids(d['plan/mi'].h).join() === 'tikka,pizza,bolo', 'shelf drop lands at the drop position (between two meals)', d['plan/mi']);
    ok(await page.locator('#shelfList .shelf-row').count() === 1, 'shelf keeps its card after a drag');
    ok(!errors.length, 'no page errors (D1)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    await page.evaluate(() => { document.getElementById('day-mo').scrollIntoView(); });
    await wait(page, 200);
    await touchDrag(page, '#days .slot[data-day="mo"][data-slot="h"] .meal', '#days .slot[data-day="di"][data-slot="f"] .meal');
    const d = await docs(page);
    ok(!d['plan/mo'].h.length && ids(d['plan/di'].f).includes('bolo'), 'long-press drag on a phone moves a meal', [d['plan/mo'], d['plan/di']]);
    ok(await page.locator('#sheet').isHidden(), 'drag does not open the recipe');
    ok(!errors.length, 'no page errors (D2)', errors);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
