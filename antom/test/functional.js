// Functional checks for Antom against a faked window.claude: run `node test/functional.js`.
const path = require('path');
const { launch, newPage, open, MOCK, SAMPLE_IMAGES, base } = require('./harness');
const { SEED, DAY, LAST, NEXT, TODAY, WD, WEEK, seedScript } = require('./seed');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};
const wait = (page, ms = 150) => page.waitForTimeout(ms);
const docs = (page) => page.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries(window.__docs))));
const ids = (list) => (list || []).map((e) => e.d);
const day = (d, key, slot) => ids((d['days/' + key] || { f: [], h: [] })[slot]);
const text = (page, sel) => page.locator(sel).first().innerText();
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a);
const slotSel = (key, slot) => `#days .slot[data-date="${key}"][data-slot="${slot}"]`;
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const desk = { viewport: { width: 1366, height: 900 } };
const IMG = (name) => path.join(__dirname, '..', 'img', name);
const RECIPE = {
  t: 'Kürbissuppe', name: 'Kürbissuppe mit Croutons', cat: 'haupt', time: 40, veg: true,
  ingredients: [
    { q: 800, u: 'g', n: 'Hokkaido-Kürbis', s: 'obst', p: false, x: '' },
    { q: 1, u: '', n: 'Zwiebel', s: 'obst', p: false, x: '' },
    { q: 1, u: 'EL', n: 'Olivenöl', s: 'gewuerz', p: true, x: '' },
    { q: 400, u: 'ml', n: 'Kokosmilch', s: 'konserve', p: false, x: '1 Dose' },
  ],
  steps: [
    { t: 'Kürbis und Zwiebel in den Mixtopf geben und zerkleinern.', af: null, tm: { label: 'Zerkleinern', sec: 5, temp: null, speed: 'Stufe 5', rev: false } },
    { t: 'Brotwürfel im Cosori goldbraun rösten.', af: { label: 'Croutons rösten', c: 180, m: 6, sh: [3], pre: false }, tm: null },
    { t: 'Öl und Kokosmilch zugeben und weich köcheln.', af: null, tm: { label: 'Köcheln', sec: 1200, temp: 100, speed: 1, rev: true } },
  ],
  tip: 'Mit Kernöl beträufeln.',
};
const todayIdx = WD.indexOf(TODAY);
const MAIN = { mo: 'bolo', di: 'caponata', mi: 'tikka', fr: 'fisch', sa: 'linsen' };
const freeKeys = WD.filter((k, i) => i >= todayIdx && !MAIN[k]).map((k) => DAY[k]);

const ghostAt = (page, at) => page.evaluate(([key, slot, idx]) => {
  const g = document.querySelector('.is-ghost');
  if (!g) return false;
  if (key === 'trash') return !!g.parentElement && g.parentElement.id === 'trash';
  const s = g.closest('.slot');
  return !!s && s.dataset.date === key && s.dataset.slot === slot && (idx == null || [...s.querySelectorAll('.meal, .shelf-row')].indexOf(g) === idx);
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
  await wait(page, 480);
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
const scrollTo = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
const closeSheet = async (page) => { await page.keyboard.press('Escape'); await wait(page, 450); };

(async () => {
  const browser = await launch();

  console.log('A. shared plan on a phone');
  {
    const { page, errors, ctx } = await newPage(browser, Object.assign({ colorScheme: 'light' }, phone), seedScript() + MOCK + SAMPLE_IMAGES);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base() });
    await open(page);
    await wait(page, 600);
    ok(await page.locator('#days .meal').count() === 12, 'renders the 12 meals of this week');
    ok((await page.evaluate(() => document.querySelector('[data-sync]').textContent)) === 'Familienplan', 'saves to the shared family plan');
    const expectHero = { mo: 'Bolo', di: 'Caponata', mi: 'Tikka Masala', do: 'Porridge', fr: 'Fisch', sa: 'Linsen mit Spätzle', so: 'Joghurt' }[TODAY];
    ok((await text(page, '#today .hero-title')) === expectHero, 'today card shows today\'s dish', [TODAY, await text(page, '#today .hero-title')]);
    if (!MAIN[TODAY]) ok(await page.locator(`#today [data-act="pick"][data-date="${DAY[TODAY]}"]`).count() === 1, 'no main dish yet: offers to plan one');
    ok(await page.locator('#strip .dp.is-today').count() === 1 && (await attr(page, '#strip .dp.is-today', 'data-date')) === DAY[TODAY], 'day strip marks today');
    ok((await text(page, '#weekbar .wk span')).startsWith('Diese Woche'), 'week bar names the week');
    ok(['Guten Morgen', 'Mahlzeit', 'Guten Tag', 'Guten Abend', 'Gute Nacht'].includes(await text(page, '#tPlan')), 'greets by the time of day', await text(page, '#tPlan'));
    ok(await page.locator('#strip .dp-ph img').count() === 7 && await page.locator('#strip .dp-ph.is-empty').count() === 0, 'week strip shows a photo for every planned day');
    ok(await page.evaluate(() => [...document.querySelectorAll('#strip img, #days img')].every((i) => i.complete && i.naturalWidth > 0)), 'all photos in the week are loaded');

    await scrollTo(page, `${slotSel(DAY.di, 'h')} .meal`);
    await page.click(`${slotSel(DAY.di, 'h')} .meal[data-dish="caponata"]`);
    await wait(page, 700);
    ok(await page.locator('#sheet').isVisible(), 'tapping a meal opens the recipe');
    ok((await text(page, '#sheetTitle')) === 'Caponata', 'recipe title');
    ok((await text(page, '#sheet .r-eyebrow')).toLowerCase() === 'dienstag · hauptessen', 'eyebrow names day and meal');
    ok(await page.locator('#sheet .r-hero img[data-name="caponata"]').count() === 1, 'big photo on top of the recipe');
    await page.click('#sheet [data-act="rtab"][data-tab="ing"]');
    await wait(page);
    const qty = async (name) => page.evaluate((n) => { const li = [...document.querySelectorAll('#sheet .ing li')].find((x) => x.children[1].textContent.startsWith(n)); return li ? li.querySelector('.q').textContent : null; }, name);
    ok(await qty('Auberginen') === '2', 'ingredients for 2 people', await qty('Auberginen'));
    await page.click('#sheet [data-act="sv"][data-d="1"]');
    await wait(page);
    ok(await qty('Auberginen') === '3', 'servings +1 scales the ingredients', await qty('Auberginen'));
    let d = await docs(page);
    ok(d['days/' + DAY.di].h[0].s === 3, 'servings saved on the plan entry', d['days/' + DAY.di].h[0]);
    await page.click('#sheet [data-act="sv"][data-d="-1"]');
    await wait(page);
    d = await docs(page);
    ok(d['days/' + DAY.di].h[0].s === undefined, 'back to default servings removes the override', d['days/' + DAY.di].h[0]);
    await page.locator('#sheet .ing li').first().click();
    ok(await page.locator('#sheet .ing li.got').count() === 1, 'an ingredient can be ticked off');
    await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
    await wait(page);
    ok(await page.locator('#sheet .steps > li').count() >= 4 && await page.locator('#sheet .af-card').count() >= 1 && await page.locator('#sheet .fry-sum:not(.tm-sum)').count() === 1, 'steps with the Cosori card and summary');
    ok(await page.locator('#sheet .tm-card').count() === 4 && await page.locator('#sheet .tm-sum').count() === 1, 'and the Thermomix steps with their summary');
    ok((await attr(page, '#sheet .links a.row', 'href')) === 'https://www.chefkoch.de/rs/s0/Caponata/Rezepte.html', 'Chefkoch search link', await attr(page, '#sheet .links a.row', 'href'));
    ok(await page.locator('#sheet .hist').count() === 0, 'no history line for a first-time dish');

    await page.click('#sheet [data-act="r-pick"]');
    await wait(page);
    ok(await page.locator('#sheet .daygrid .daybtn').count() === 7 && (await text(page, '#sheet .pick-week span')).startsWith('Diese Woche'), 'move panel shows this week');
    await page.click(`#sheet [data-act="pp-day"][data-date="${DAY.do}"]`);
    await wait(page, 450);
    d = await docs(page);
    ok(day(d, DAY.do, 'h').join() === 'caponata' && !day(d, DAY.di, 'h').length, 'Verschieben moves it to Thursday', [d['days/' + DAY.do], d['days/' + DAY.di]]);
    ok(await page.locator('#sheet').isHidden(), 'sheet closes after moving');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    d = await docs(page);
    ok(day(d, DAY.di, 'h').join() === 'caponata' && !day(d, DAY.do, 'h').length, 'undo puts it back', [d['days/' + DAY.do], d['days/' + DAY.di]]);

    // move into next week
    await page.click(`${slotSel(DAY.di, 'h')} .meal[data-dish="caponata"]`);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-pick"]');
    await page.click('#sheet [data-act="pp-week"][data-d="1"]');
    await wait(page);
    ok((await text(page, '#sheet .pick-week span')).startsWith('Nächste Woche'), 'move panel can switch to next week');
    await page.click(`#sheet [data-act="pp-day"][data-date="${NEXT.mo}"]`);
    await wait(page, 450);
    d = await docs(page);
    ok(day(d, NEXT.mo, 'h').join() === 'caponata' && !day(d, DAY.di, 'h').length, 'moved to Monday next week');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);

    await page.click(`${slotSel(DAY.di, 'h')} .meal[data-dish="caponata"]`);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-remove"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!day(d, DAY.di, 'h').length, 'remove from plan');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    d = await docs(page);
    ok(day(d, DAY.di, 'h').join() === 'caponata', 'undo remove');

    await scrollTo(page, `${slotSel(DAY.do, 'h')} .add-meal`);
    await page.click(`${slotSel(DAY.do, 'h')} .add-meal`);
    await wait(page, 600);
    ok(await page.locator('#sheet .pick-row').count() > 25 && (await page.locator('#sheet .sub-h').allInnerTexts()).map((t) => t.toLowerCase()).includes('zuletzt gegessen'), 'picker lists recent dishes first');
    await page.fill('#pickSearch', 'risotto');
    await wait(page);
    ok(await page.locator('#sheet .pick-row').count() === 1, 'picker search filters');
    await page.click('#sheet .pick-row');
    await wait(page, 450);
    d = await docs(page);
    ok(day(d, DAY.do, 'h').join() === 'risotto', 'picker adds to the empty slot', d['days/' + DAY.do]);
    ok((await text(page, '#toast')).includes('Rückgängig'), 'with undo in the toast');

    // the day header's plus asks which meal
    await scrollTo(page, `#day-${DAY.so} .day-h`);
    await page.click(`#day-${DAY.so} .day-h [data-act="pick"]`);
    await wait(page, 600);
    await page.click('#sheet [data-act="pk-slot"][data-slot="f"]');
    await page.fill('#pickSearch', 'bircher');
    await wait(page);
    await page.click('#sheet .pick-row');
    await wait(page, 450);
    d = await docs(page);
    ok(day(d, DAY.so, 'f').join() === 'joghurt,bircher', 'a second breakfast via the day\'s plus', d['days/' + DAY.so]);
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);

    // keyboard: Enter opens, Escape closes
    await page.focus(`${slotSel(DAY.fr, 'h')} .meal[data-dish="fisch"]`);
    await page.keyboard.press('Enter');
    await wait(page, 700);
    ok((await text(page, '#sheetTitle')) === 'Fisch', 'Enter opens a focused meal');
    await closeSheet(page);
    ok(await page.locator('#sheet').isHidden(), 'Escape closes the sheet');

    // favourites
    await page.click(`${slotSel(DAY.fr, 'h')} .meal[data-dish="fisch"]`);
    await wait(page, 700);
    await page.click('#sheet [data-act="fav"]');
    await wait(page, 300);
    d = await docs(page);
    ok(d['meta/favs'] && d['meta/favs'].ids.fisch > 0 && (await attr(page, '#sheet [data-act="fav"]', 'aria-pressed')) === 'true', 'heart makes it a favourite', d['meta/favs']);
    await closeSheet(page);
    ok(await page.locator(`${slotSel(DAY.fr, 'h')} .meal .fav-dot`).count() === 1, 'favourite shows a heart in the week');

    // shopping list
    await page.click('.tabbar [data-tab="shop"]');
    await wait(page, 400);
    const badge = Number(await text(page, '.tabbar [data-count]'));
    const openItems = await page.locator('#shop .item:not(.done)').count();
    ok(badge === openItems && badge > 5, 'badge counts open items', [badge, openItems]);
    ok((await text(page, '#shop .sum-txt small')).includes('ab heute'), 'list starts with today');
    await page.click('#shop [data-act="shop-range"][data-r="week"]');
    await wait(page, 300);
    const whole = await page.locator('#shop .item:not(.done)').count();
    ok(whole >= openItems && (await text(page, '#shop .sum-txt small')).includes('ganze Woche'), 'whole week adds the earlier days', [openItems, whole]);
    const firstKey = await attr(page, '#shop [data-act="toggle-item"]', 'data-key');
    await page.locator('#shop .item .check').first().click();
    await wait(page, 500);
    d = await docs(page);
    ok(d['shop/' + WEEK] && d['shop/' + WEEK].checked[firstKey] === true, 'ticking an item is saved for this week', d['shop/' + WEEK]);
    ok((await text(page, '#shop .sum-txt b')) === `${whole - 1} offen`, 'summary counts it', await text(page, '#shop .sum-txt b'));
    await page.fill('#extraInput', 'Kaffee');
    await page.press('#extraInput', 'Enter');
    await wait(page, 300);
    d = await docs(page);
    ok(d['shop/' + WEEK].extras.length === 1 && d['shop/' + WEEK].extras[0].t === 'Kaffee', 'own item added', d['shop/' + WEEK].extras);
    ok(await page.locator('#extraInput').evaluate((el) => document.activeElement === el), 'input keeps focus for the next item');
    await page.click('#shop .fold[data-fold="pantryOpen"] > summary');
    await wait(page);
    const pantryKey = await attr(page, '#shop [data-act="need"]', 'data-key');
    await page.locator('#shop [data-act="need"]').first().click();
    await wait(page, 300);
    ok(await page.locator(`#shop [data-act="toggle-item"][data-key="${pantryKey}"]`).count() === 1, 'pantry item moves onto the list');
    await page.click('#v-shop .nav [data-act="copy-week"]');
    await wait(page, 300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith('Einkaufsliste KW') && clip.includes('• Kaffee') && clip.includes('Obst & Gemüse'), 'share copies a readable list', clip.slice(0, 120));
    await page.click('#v-shop [data-act="week-next"]');
    await wait(page, 300);
    ok((await text(page, '#shop .shop-empty h2')) === 'Noch nichts zu kaufen' && await page.locator('#shopNavL [data-act="week-today"]').count() === 1, 'next week has its own (empty) list');
    await page.click('#shopNavL [data-act="week-today"]');
    await wait(page, 300);

    // cookbook
    await page.click('.tabbar [data-tab="book"]');
    await wait(page, 400);
    ok(await page.locator('#book .grid .card').count() === 25, '25 recipes in the cookbook');
    ok(await page.locator('#book .feature').count() === 1 && (await text(page, '#book .feature .tag')).includes('Rezept der Woche'), 'a recipe of the week on top');
    await page.click('#cats [data-f="fruehstueck"]');
    await wait(page);
    ok(await page.locator('#book .grid .card').count() === 3 && (await attr(page, '#cats .cat-tile[aria-pressed="true"]', 'data-f')) === 'alle', 'category tile filters (and tapping again shows all)', await page.locator('#book .grid .card').count());
    await page.click('#cats .cat-tile[aria-pressed="true"]');
    await wait(page);
    ok(await page.locator('#book .grid .card').count() === 25, 'back to all recipes');
    ok(await page.locator('#book .hscroll .card[data-dish="pizza"] .fav-badge').count() === 1, 'favourites shelf with hearts');
    ok(await page.locator('#book .hscroll .card[data-dish="quinoa"]').count() === 1 && await page.locator('#book .hscroll .card[data-dish="ricotta"]').count() === 1, '"lange nicht gegessen" remembers old dishes');
    await page.click('#chips [data-f="veg"]');
    await wait(page);
    ok(await page.locator('#book .grid .card').count() === 21, 'vegetarian filter', await page.locator('#book .grid .card').count());
    await page.click('#chips [data-f="quick"]');
    await wait(page);
    const quick = await page.locator('#book .grid .card .card-m').allInnerTexts();
    ok(quick.length > 0 && quick.every((t) => Number(t.split(' ')[0]) <= 20), 'quick filter only shows ≤ 20 min', quick);
    await page.click('#chips [data-f="fav"]');
    await wait(page);
    ok((await page.locator('#book .grid .card').count()) === 4, 'favourites filter', await page.locator('#book .grid .card').count());
    await page.click('#chips [data-f="alle"]');
    await page.fill('#bookSearch', 'spätzle');
    await wait(page);
    ok(await page.locator('#book .grid .card').count() === 1 && (await text(page, '#book .grid .card-t')) === 'Linsen mit Spätzle', 'search finds by ingredient/title');
    await page.fill('#bookSearch', 'Wiener Schnitzel');
    await wait(page);
    ok((await attr(page, '#book .empty a', 'href')) === 'https://www.chefkoch.de/rs/s0/Wiener+Schnitzel/Rezepte.html', 'empty search offers Chefkoch');
    await page.fill('#bookSearch', '');
    await wait(page);

    // cookbook card → plan
    await page.click('#book .grid .card[data-dish="mozza"]');
    await wait(page, 700);
    await page.click('#sheet [data-act="r-pick"]');
    await page.click('#sheet [data-act="pp-slot"][data-slot="h"]');
    await page.click(`#sheet [data-act="pp-day"][data-date="${DAY.so}"]`);
    await wait(page, 450);
    d = await docs(page);
    ok(day(d, DAY.so, 'h').join() === 'mozza', 'cookbook → "In den Plan" → Sunday', d['days/' + DAY.so]);
    await page.click('#book .grid .card[data-dish="pizza"]');
    await wait(page, 700);
    ok(/^Zuletzt /.test(await text(page, '#sheet .hist')), 'recipe tells when it was last cooked', await text(page, '#sheet .hist'));
    await closeSheet(page);

    // new recipe by hand
    await page.click('#v-book .nav [data-act="new-dish"]');
    await wait(page, 500);
    await page.fill('#f-t', 'Gefüllte Paprika');
    await page.fill('#f-time', '50');
    await page.fill('#f-ing', '4 Paprika\n300 g Rinderhack\n1 Zwiebel\n½ TL Paprikapulver\nSalz, Pfeffer');
    await page.fill('#f-step-0', 'Paprika füllen und in den Korb setzen.');
    await page.check('#sheet .step-edit [data-dev][value="af"]');
    await page.fill('#sheet .step-edit [data-af-c]', '180');
    await page.fill('#sheet .step-edit [data-af-m]', '20');
    await page.fill('#sheet .step-edit [data-af-sh]', '10');
    await page.fill('#sheet .step-edit [data-af-label]', 'Paprika garen');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
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
    const cardSel = `#book .grid .card[data-dish="${newId.split('/')[1]}"]`;
    ok(await page.locator(cardSel).count() === 1 && (await text(page, `${cardSel} .gpill`)) === 'Eigenes', 'card appears with "Eigenes" tag');
    ok((await attr(page, `${cardSel} img`, 'data-name')) === 'ph-haupt' && (await text(page, `${cardSel} .mono`)) === 'G', 'own recipe gets a laid table with its initial');
    await page.click(cardSel);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 500);
    ok(await page.inputValue('#f-ing') === '4 Paprika\n300 g Rinderhack\n1 Zwiebel\n½ TL Paprikapulver\nSalz, Pfeffer', 'edit form shows the ingredient lines', await page.inputValue('#f-ing'));
    await page.click('#sheet [data-act="delete-dish"]');
    await wait(page, 400);
    await page.click('#sheet [data-act="really-delete"]');
    await wait(page, 500);
    d = await docs(page);
    ok(!d[newId] && await page.locator(cardSel).count() === 0, 'delete own recipe');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!!d[newId] && await page.locator(cardSel).count() === 1, 'undo delete');

    // edit a built-in recipe, then restore the original
    await page.click('#book .grid .card[data-dish="pizza"]');
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 400);
    await page.fill('#f-time', '25');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
    d = await docs(page);
    ok(d['dishes/pizza'] && d['dishes/pizza'].time === 25 && (await text(page, '#book .grid .card[data-dish="pizza"] .card-m')).startsWith('25 Min'), 'edited built-in is saved');
    await page.click('#book .grid .card[data-dish="pizza"]');
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 400);
    await page.click('#sheet [data-act="restore-dish"]');
    await wait(page, 500);
    d = await docs(page);
    ok(!d['dishes/pizza'] && (await text(page, '#book .grid .card[data-dish="pizza"] .card-m')).startsWith('30 Min'), 'restore original');

    // Claude writes a recipe in the form
    await page.evaluate((r) => { window.__sampleReply = r; }, RECIPE);
    await page.click('#v-book .nav [data-act="new-dish"]');
    await wait(page, 500);
    await page.fill('#f-t', 'Kürbissuppe');
    await page.fill('#f-wish', 'mit Croutons');
    await page.click('#sheet [data-act="claude"]');
    await page.waitForFunction(() => /Fertig/.test((document.querySelector('#sheet .ai-box .status') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
    ok(/Fertig/.test(await text(page, '#sheet .ai-box .status')), 'Claude fills the form');
    ok((await page.inputValue('#f-ing')).includes('800 g Hokkaido-Kürbis') && (await page.inputValue('#f-ing')).includes('400 ml Kokosmilch (1 Dose)'), 'ingredient lines from Claude', await page.inputValue('#f-ing'));
    ok(await page.inputValue('#f-t') === 'Kürbissuppe' && await page.inputValue('#f-wish') === 'mit Croutons', 'name and wish survive the re-render');
    ok(await page.locator('#sheet .step-edit').count() === 3 && await page.locator('#sheet .step-edit').nth(1).locator('[data-dev][value="af"]').isChecked(), 'Cosori step from Claude');
    const tm0 = page.locator('#sheet .step-edit').first();
    ok(await tm0.locator('[data-dev][value="tm"]').isChecked() && await tm0.locator('[data-tm-sec]').inputValue() === '5' && await tm0.locator('[data-tm-speed]').inputValue() === '5' && await tm0.locator('[data-tm-temp]').inputValue() === '', 'Thermomix step from Claude, "Stufe 5" read as speed 5');
    const prompt = await page.evaluate(() => window.__lastPrompt);
    ok(prompt.includes('"Kürbissuppe"') && prompt.includes('mit Croutons') && prompt.includes('200 °C'), 'prompt carries name, wish and Cosori limit');
    ok(prompt.includes('Thermomix') && prompt.includes('Linkslauf') && prompt.includes('"tm"'), 'prompt asks for Thermomix steps too');
    await page.click('#sheet .sh-bar button[type="submit"]');
    await wait(page, 500);
    d = await docs(page);
    const soup = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Kürbissuppe');
    ok(soup && soup[1].name === 'Kürbissuppe mit Croutons' && soup[1].ing.find((i) => i.n === 'Olivenöl').p === 1 && soup[1].ing.find((i) => i.n === 'Kokosmilch').s === 'konserve', '"Sichern" in the header saves the Claude recipe with aisles and pantry', soup && soup[1].ing);
    ok(soup && soup[1].steps[1].af && soup[1].steps[1].af.sh === 3, 'Claude Cosori step saved', soup && soup[1].steps);
    ok(soup && soup[1].steps[2].tm && soup[1].steps[2].tm.sec === 1200 && soup[1].steps[2].tm.temp === 100 && soup[1].steps[2].tm.rev === true && !soup[1].steps[2].af, 'Claude Thermomix step saved', soup && soup[1].steps);

    // Chefkoch import from pasted text
    await page.evaluate((r) => { window.__sampleReply = Object.assign({}, r, { t: 'Ofen-Kürbis' }); }, RECIPE);
    await page.click('#book .promo [data-act="import"]');
    await wait(page, 500);
    await page.fill('#ckQ', 'Kürbis Ofen');
    ok(await page.getAttribute('#ckGo', 'href') === 'https://www.chefkoch.de/rs/s0/K%C3%BCrbis+Ofen/Rezepte.html', 'import search builds a Chefkoch link', await page.getAttribute('#ckGo', 'href'));
    await page.click('#sheet [data-act="imp-mode"][data-mode="paste"]');
    await page.fill('#impText', 'Kürbis halbieren, entkernen, in Spalten schneiden. Im Ofen bei 200 Grad 25 Minuten backen. Zutaten: 1 Hokkaido, 2 EL Öl, Salz.\nhttps://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html');
    await page.click('#sheet [data-act="imp-go"]');
    await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
    await wait(page, 300);
    ok(await page.inputValue('#f-t') === 'Ofen-Kürbis' && await page.inputValue('#f-src') === 'https://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html', 'import opens the form with name and source');
    const ip = await page.evaluate(() => window.__lastPrompt);
    ok(ip.includes('Ofen bei 200 Grad') && ip.includes('auf 2 Personen'), 'import prompt contains the pasted text');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
    d = await docs(page);
    const imp = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Ofen-Kürbis');
    ok(imp && imp[1].src && imp[1].src.url.includes('chefkoch.de'), 'imported recipe keeps its source');
    const impSel = `#book .grid .card[data-dish="${imp[0].split('/')[1]}"]`;
    ok((await text(page, `${impSel} .gpill`)) === 'Chefkoch', 'card is tagged Chefkoch');
    await page.click(impSel);
    await wait(page, 700);
    await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
    await wait(page);
    ok((await attr(page, '#sheet .links a.row', 'href')) === 'https://www.chefkoch.de/rezepte/123456/Ofenkuerbis.html', 'recipe links to the original');
    await closeSheet(page);

    // screenshot import (images)
    await page.click('#book .promo [data-act="import"]');
    await wait(page, 500);
    await page.click('#sheet [data-act="imp-mode"][data-mode="shots"]');
    await wait(page);
    await page.setInputFiles('#impFiles', IMG('scan-card.webp'));
    await wait(page);
    ok(await page.locator('#impThumbs img').count() === 1, 'screenshot preview');
    await page.click('#sheet [data-act="imp-go"]');
    await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
    const imgs = await page.evaluate(() => (window.__lastOpts && window.__lastOpts.images ? window.__lastOpts.images.length : 0));
    ok(imgs === 1 && await page.locator('#dishForm').count() === 1, 'screenshots are sent to Claude', imgs);
    await closeSheet(page);

    // settings: people
    await page.click('.tabbar [data-tab="plan"]');
    await page.click('#v-plan .nav [data-act="settings"]');
    await wait(page, 500);
    await page.click('#sheet [data-act="people"][data-d="1"]');
    await wait(page, 300);
    d = await docs(page);
    ok(d['meta/settings'] && d['meta/settings'].people === 3, 'people setting saved');
    ok((await text(page, '#sheet .row .val[data-sync]')) === 'Familienplan', 'settings say where the plan is saved');
    await closeSheet(page);
    await page.click('.tabbar [data-tab="shop"]');
    await wait(page, 300);
    ok((await text(page, '#shop .sum-txt small')).includes('3 Personen'), 'shopping list follows the household size');

    // external change arrives live
    await page.click('.tabbar [data-tab="plan"]');
    await page.evaluate((k) => window.__external('days/' + k, { f: [{ u: 'x-1', d: 'joghurt' }], h: [{ u: 'x-2', d: 'pizza' }] }), DAY.mo);
    await wait(page, 300);
    ok(await page.locator(`${slotSel(DAY.mo, 'h')} .meal[data-dish="pizza"]`).count() === 1, 'changes from the other phone show up live');

    // a deleted built-in disappears from the plan too
    await scrollTo(page, `${slotSel(DAY.di, 'h')} .meal`);
    await page.click(`${slotSel(DAY.di, 'h')} .meal[data-dish="caponata"]`);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 400);
    await page.click('#sheet [data-act="delete-dish"]');
    await wait(page, 300);
    await page.click('#sheet [data-act="really-delete"]');
    await wait(page, 500);
    d = await docs(page);
    ok(d['dishes/caponata'] && d['dishes/caponata'].deleted === true && !day(d, DAY.di, 'h').includes('caponata'), 'deleting a built-in hides it and clears the plan');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(!d['dishes/caponata'] && day(d, DAY.di, 'h').includes('caponata'), 'undo brings it back');

    // cook mode + timer
    await page.click(`${slotSel(DAY.di, 'h')} .meal[data-dish="caponata"]`);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-cook"]');
    await wait(page, 400);
    ok(await page.locator('#cook').isVisible() && (await text(page, '#cook .cook-title')) === 'Caponata', 'cook mode opens on the prep page');
    const titleBox = await page.locator('#cook .cook-title').boundingBox();
    ok(titleBox && titleBox.y > 40, 'cook title is not cut off', titleBox);
    await page.locator('#cook .prep input').first().check();
    ok(await page.locator('#cook .prep input:checked').count() === 1, 'ingredients can be ticked in cook mode');
    await page.click('#cook [data-act="cook-next"]');
    await page.click('#cook [data-act="cook-next"]');
    await wait(page);
    await page.click('#cook [data-act="cook-timer"]');
    await wait(page, 1300);
    const t1 = await text(page, '#cook .ring-big .t b');
    ok(/^14:5\d$/.test(t1), 'timer ring counts down', t1);
    await page.click('#cook [data-act="timer-pause"]');
    await wait(page, 1200);
    ok(/Pausiert/.test(await text(page, '#cook [data-info]')), 'pause');
    await page.click('#cook [data-act="timer-pause"]');
    await page.click('#cook [data-act="cook-close"]');
    await closeSheet(page);
    ok(await page.locator('#timer').isVisible() && (await text(page, '#timer .t-label')).includes('Caponata'), 'timer pill keeps running outside cook mode');
    await page.click('#timer [data-act="timer-stop"]');
    await wait(page);
    ok(await page.locator('#timer').isHidden(), 'stop timer');

    // clearing the week keeps what is past
    await scrollTo(page, '#planFoot');
    await page.click('#planFoot [data-act="clear-week"]');
    await wait(page, 500);
    await page.click('#sheet [data-act="clear-main"]');
    await wait(page, 500);
    d = await docs(page);
    const kept = WD.filter((k, i) => i < todayIdx && MAIN[k]).every((k) => day(d, DAY[k], 'h').length);
    const cleared = WD.filter((k, i) => i >= todayIdx).every((k) => !day(d, DAY[k], 'h').length);
    ok(kept && cleared && WD.every((k) => day(d, DAY[k], 'f').length), 'clearing mains from today on keeps past days and breakfasts', WD.map((k) => [k, day(d, DAY[k], 'h')]));
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(day(d, DAY.di, 'h').join() === 'caponata' && day(d, DAY.do, 'h').join() === 'risotto', 'undo clearing');

    // next week: empty start, breakfast like last week
    await page.click('#v-plan [data-act="week-next"]');
    await wait(page, 400);
    ok((await text(page, '#tPlan')) === 'Nächste Woche' && (await attr(page, '#strip .dp', 'data-date')) === NEXT.mo, 'week arrows go to next week');
    ok(await page.locator('#today .week-empty').count() === 1, 'an empty week invites to plan');
    await page.click('#today .week-empty [data-act="copy-bf"]');
    await wait(page, 400);
    d = await docs(page);
    ok(WD.every((k) => day(d, NEXT[k], 'f').join() === day(d, DAY[k], 'f').join()), 'breakfasts copied from this week', WD.map((k) => day(d, NEXT[k], 'f')));
    ok(/7× Frühstück/.test(await text(page, '#toast')), 'toast counts them');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 400);
    d = await docs(page);
    ok(WD.every((k) => !d['days/' + NEXT[k]]), 'undo copying removes the days again');
    await page.click('#weekbar [data-act="week-today"]');
    await wait(page, 400);
    ok((await text(page, '#weekbar .wk span')).startsWith('Diese Woche') && await page.locator('#weekbar [data-act="week-today"]').count() === 0, '"Heute" goes back to this week');

    console.log('  page errors:', JSON.stringify(errors));
    ok(!errors.length, 'no page errors (A)');
    await ctx.close();
  }

  console.log('B. Claude fills free days');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    const label = freeKeys.length === 1 ? 'Freien Tag füllen' : `${freeKeys.length} freie Tage füllen`;
    ok(!freeKeys.length || (await text(page, '#planFoot [data-act="suggest"]')).includes(label), 'offers to fill the free days from today on', [freeKeys, label]);
    ok(await page.locator('#v-plan .nav [data-act="scan"]').isHidden(), 'no camera button without image access to Claude');
    const reply = { vorschlaege: freeKeys.map((k, i) => ({ tag: k, id: ['risotto', 'pizza', 'quinoa'][i % 3], grund: 'passt gut' })).concat([{ tag: DAY.mo, id: 'bolo' }, { tag: freeKeys[0] || DAY.so, id: 'gibtsnicht' }]) };
    await page.evaluate((r) => { window.__sampleReply = r; }, reply);
    if (freeKeys.length) {
      await scrollTo(page, '#planFoot');
      await page.click('#planFoot [data-act="suggest"]');
      await page.waitForSelector('#sheet .sug', { timeout: 4000 }).catch(() => {});
      ok(await page.locator('#sheet .sug').count() === freeKeys.length, 'keeps only valid suggestions for free days', await page.locator('#sheet .sug').count());
      const sp = await page.evaluate(() => window.__lastPrompt);
      ok(sp.includes(freeKeys.join(', ')) && sp.includes('risotto: Risotto') && sp.includes('Lieblingsgericht') && sp.includes('zuletzt vor'), 'prompt lists free days, favourites and history');
      await page.click('#sheet [data-act="sug-ok"]');
      await wait(page, 500);
      const d = await docs(page);
      ok(freeKeys.every((k) => day(d, k, 'h').length === 1), 'suggestions planned');
      ok(await page.locator('#planFoot [data-act="suggest"]').count() === 0, 'button disappears when the week is full');
    }
    ok(!errors.length, 'no page errors (B)', errors);
    await ctx.close();
  }

  console.log('C. view-only, refused writes, no Claude, old data');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript('window.__canWrite = false;') + MOCK);
    await open(page);
    await wait(page, 500);
    ok((await page.evaluate(() => document.querySelector('[data-sync]').textContent)) === 'Auf diesem Gerät', 'view-only viewer works on this device');
    ok(await page.locator(`${slotSel(DAY.sa, 'h')} .meal[data-dish="linsen"]`).count() === 1 && await page.locator('#days .meal').count() === 8, 'starts from the fridge week');
    await scrollTo(page, `${slotSel(DAY.mo, 'h')} .add-meal`);
    await page.click(`${slotSel(DAY.mo, 'h')} .add-meal`);
    await wait(page, 500);
    await page.click('#sheet .pick-row[data-id="bolo"]');
    await wait(page, 500);
    const w = await page.evaluate(() => window.__writes.length);
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('antom.v4') || 'null'));
    ok(w === 0 && ls && ls.days[DAY.mo].h[0].d === 'bolo', 'saves locally, never writes shared data', [w, ls && ls.days[DAY.mo]]);
    ok(!errors.length, 'no page errors (C1)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript('window.__denyWrites = true;') + MOCK);
    await open(page);
    await wait(page, 500);
    await scrollTo(page, `${slotSel(DAY.so, 'h')} .add-meal`);
    await page.click(`${slotSel(DAY.so, 'h')} .add-meal`);
    await wait(page, 500);
    await page.click('#sheet .pick-row[data-id="bolo"]');
    await wait(page, 700);
    ok((await text(page, '#toast')).includes('Bearbeitungsrechte') && (await page.evaluate(() => document.querySelector('[data-sync]').textContent)) === 'Auf diesem Gerät', 'refused write falls back to this device with a note');
    ok(await page.locator(`${slotSel(DAY.so, 'h')} .meal[data-dish="bolo"]`).count() === 1, 'the change is kept locally');
    ok(!errors.length, 'no page errors (C2)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone);
    await open(page);
    await wait(page, 300);
    ok((await page.evaluate(() => document.querySelector('[data-sync]').textContent)) === 'Auf diesem Gerät' && await page.locator('#planFoot [data-act="suggest"]').count() === 0, 'outside Claude: local mode, no Claude buttons');
    await scrollTo(page, `${slotSel(DAY.fr, 'h')} .add-meal`);
    await page.click(`${slotSel(DAY.fr, 'h')} .add-meal`);
    await wait(page, 500);
    await page.click('#sheet .pick-row[data-id="fisch"]');
    await wait(page, 500);
    await page.reload();
    await page.waitForTimeout(600);
    ok(await page.locator(`${slotSel(DAY.fr, 'h')} .meal[data-dish="fisch"]`).count() === 1, 'local plan survives a reload');
    await page.click('.tabbar [data-tab="book"]');
    await page.click('#book .promo [data-act="import"]');
    await wait(page, 400);
    ok(await page.locator('#sheet [data-act="imp-manual"]').count() === 1, 'import offers manual entry without Claude');
    ok(!errors.length, 'no page errors (C3)', errors);
    await ctx.close();
  }
  {
    // Antom 3 kept one week of weekdays in plan/<day> and the list in meta/shop
    const old = { 'plan/mo': { f: [{ u: 'o1', d: 'joghurt' }], h: [] }, 'plan/do': { f: [{ u: 'o2', d: 'joghurt' }], h: [{ u: 'o3', d: 'pizza' }] }, 'plan/fr': { f: [], h: [] }, 'meta/settings': { people: 2 }, 'meta/shop': { checked: { 'mozzarella|kugel': true }, need: {}, extras: [{ id: 'e1', t: 'Kaffee', done: false }] } };
    const { page, errors, ctx } = await newPage(browser, phone, seedScript('', old) + MOCK);
    await open(page);
    await wait(page, 900);
    const d = await docs(page);
    ok(day(d, DAY.do, 'h').join() === 'pizza' && day(d, DAY.mo, 'f').join() === 'joghurt' && !d['days/' + DAY.fr], 'old weekday plan moves onto this week\'s dates', Object.keys(d));
    ok(!Object.keys(d).some((k) => k.startsWith('plan/')) && !d['meta/shop'], 'old documents are tidied up', Object.keys(d));
    ok(d['shop/' + WEEK] && d['shop/' + WEEK].extras[0].t === 'Kaffee' && d['shop/' + WEEK].checked['mozzarella|kugel'], 'old shopping list becomes this week\'s list', d['shop/' + WEEK]);
    ok(await page.locator(`${slotSel(DAY.do, 'h')} .meal[data-dish="pizza"]`).count() === 1, 'and shows up in the week');
    ok(!errors.length, 'no page errors (C4)', errors);
    await ctx.close();
  }
  {
    const oldLocal = `localStorage.setItem('antom.v1', JSON.stringify({ plan: { di: { f: [{ u: 'l1', d: 'bircher' }], h: [{ u: 'l2', d: 'risotto' }] } }, custom: {}, shop: { checked: {}, need: {}, extras: [] }, settings: { people: 3 } }));`;
    const { page, errors, ctx } = await newPage(browser, phone, oldLocal);
    await open(page);
    await wait(page, 400);
    ok(await page.locator(`${slotSel(DAY.di, 'h')} .meal[data-dish="risotto"]`).count() === 1 && await page.locator('#days .meal').count() === 2, 'a phone\'s old local plan is kept too');
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('antom.v4') || 'null'));
    ok(ls && ls.settings.people === 3 && ls.days[DAY.di], 'and saved in the new format');
    ok(!errors.length, 'no page errors (C5)', errors);
    await ctx.close();
  }

  console.log('D. drag & drop');
  {
    const { page, errors, ctx } = await newPage(browser, desk, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView(); }, DAY.mo);
    await wait(page, 200);
    await drag(page, `${slotSel(DAY.mo, 'h')} .meal`, `${slotSel(DAY.mi, 'h')} .meal[data-dish="tikka"]:not(.is-ghost)`, { yFrac: 0.85, until: [DAY.mi, 'h', 1] });
    let d = await docs(page);
    ok(day(d, DAY.mi, 'h').join() === 'tikka,bolo' && !day(d, DAY.mo, 'h').length, 'mouse drag moves a meal to another day (after)', [d['days/' + DAY.mo], d['days/' + DAY.mi]]);
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView(); }, DAY.mo);
    await drag(page, `${slotSel(DAY.di, 'h')} .meal`, '#trash', { until: ['trash'] });
    d = await docs(page);
    ok(!day(d, DAY.di, 'h').length && (await text(page, '#toast')).includes('vom Plan genommen'), 'drop on the bin removes it', d['days/' + DAY.di]);
    await page.click('#toast [data-act="undo"]');
    await wait(page, 300);
    await page.fill('#shelfSearch', 'risotto');
    await wait(page, 200);
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView(); }, DAY.mo);
    await drag(page, '#shelfList .shelf-row[data-dish="risotto"]', slotSel(DAY.mo, 'h'), { until: [DAY.mo, 'h', 0] });
    d = await docs(page);
    ok(day(d, DAY.mo, 'h').join() === 'risotto', 'drag from the cookbook shelf onto an empty day', d['days/' + DAY.mo]);
    await page.fill('#shelfSearch', 'pizza');
    await wait(page, 200);
    // keep the target day away from the edges, where the list would start scrolling
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView({ block: 'center' }); }, DAY.mi);
    await wait(page, 200);
    await drag(page, '#shelfList .shelf-row[data-dish="pizza"]', `${slotSel(DAY.mi, 'h')} .meal[data-dish="tikka"]:not(.is-ghost)`, { yFrac: 0.8, until: [DAY.mi, 'h', 1] });
    d = await docs(page);
    ok(day(d, DAY.mi, 'h').join() === 'tikka,pizza,bolo', 'shelf drop lands at the drop position (between two meals)', d['days/' + DAY.mi]);
    ok(await page.locator('#shelfList .shelf-row').count() === 1, 'shelf keeps its card after a drag');
    // drag still works after switching weeks (new day lists)
    await page.click('#v-plan [data-act="week-next"]');
    await wait(page, 400);
    await page.click('#v-plan [data-act="week-prev"]');
    await wait(page, 400);
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView(); }, DAY.fr);
    await drag(page, `${slotSel(DAY.fr, 'h')} .meal`, `${slotSel(DAY.sa, 'h')} .meal[data-dish="linsen"]:not(.is-ghost)`, { yFrac: 0.85, until: [DAY.sa, 'h', 1] });
    d = await docs(page);
    ok(day(d, DAY.sa, 'h').join() === 'linsen,fisch', 'drag works after switching weeks', d['days/' + DAY.sa]);
    ok(!errors.length, 'no page errors (D1)', errors);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK);
    await open(page);
    await wait(page, 600);
    await page.evaluate((k) => { document.getElementById('day-' + k).scrollIntoView(); }, DAY.mo);
    await wait(page, 200);
    await touchDrag(page, `${slotSel(DAY.mo, 'h')} .meal`, `${slotSel(DAY.di, 'f')} .meal`);
    const d = await docs(page);
    ok(!day(d, DAY.mo, 'h').length && day(d, DAY.di, 'f').includes('bolo'), 'long-press drag on a phone moves a meal', [d['days/' + DAY.mo], d['days/' + DAY.di]]);
    ok(await page.locator('#sheet').isHidden(), 'drag does not open the recipe');
    ok(!errors.length, 'no page errors (D2)', errors);
    await ctx.close();
  }

  console.log('E. camera scan');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK + SAMPLE_IMAGES);
    await open(page);
    await wait(page, 600);
    ok(await page.locator('#v-plan .nav [data-act="scan"]').isVisible(), 'camera button in the navigation bar');

    // a finished dish: recipe plus photo, saved straight away
    await page.evaluate((r) => { window.__sampleReply = Object.assign({}, r, { art: 'gericht', t: 'Kürbissuppe' }); }, RECIPE);
    await page.click('#v-plan .nav [data-act="scan"]');
    await wait(page, 500);
    ok(await page.locator('#sheet.scan .shutter-wrap').count() === 1 && await page.locator('#sheet .scan-empty').count() === 1, 'scanner opens with shutter and hints');
    await page.setInputFiles('#scanCam', IMG('tikka.webp'));
    await wait(page, 300);
    ok(await page.locator('#sheet .scan-photo').count() === 1 && await page.locator('#sheet .scan-thumb').count() === 1, 'photo shows in the scanner');
    await page.setInputFiles('#sheet .scan-add input', IMG('caponata.webp'));
    await wait(page, 300);
    ok(await page.locator('#sheet .scan-thumb').count() === 2 && (await text(page, '#sheet .scan-count')) === '2 / 3', 'a second page can be added');
    await page.click('#sheet [data-act="scan-go"]');
    await page.waitForSelector('#sheet .r-title', { timeout: 6000 }).catch(() => {});
    await wait(page, 300);
    let d = await docs(page);
    const made = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Kürbissuppe');
    ok(made && made[1].origin === 'scan' && made[1].photo && made[1].photo.kind === 'gericht' && made[1].photo.n === 2 && /^data:image\/jpeg;base64,/.test(made[1].thumb || ''), 'scan saves the recipe with its photo', made && Object.keys(made[1]));
    ok(made && JSON.stringify(made[1]).length < 200 * 1024, 'the recipe document stays small', made && JSON.stringify(made[1]).length);
    const sid = made ? made[0].split('/')[1] : '';
    const ph = d['photos/' + sid];
    ok(ph && ph.pages.length === 2 && JSON.stringify(ph).length < 256 * 1024, 'original photos stored under the 256 KiB document limit', ph && JSON.stringify(ph).length);
    ok(made && made[1].ing.find((i) => i.n === 'Kokosmilch').s === 'konserve' && made[1].steps[1].af.c === 180, 'ingredients and Cosori step come from Claude');
    const sent = await page.evaluate(() => window.__lastOpts.images.map((b) => b.type));
    ok(sent.length === 2 && sent.every((t) => t === 'image/jpeg'), 'both photos go to Claude as JPEG', sent);
    ok((await page.evaluate(() => window.__lastPrompt)).includes('2 Fotos'), 'prompt knows there are two pages');
    ok((await text(page, '#sheetTitle')) === 'Kürbissuppe' && await page.locator('#sheet .fresh').count() === 1, 'the new recipe opens with a check-it hint');
    ok((await text(page, '#toast')).includes('Kürbissuppe ist jetzt im Kochbuch'), 'toast confirms');
    ok(/^data:image\/jpeg/.test(await attr(page, '#sheet .r-hero img', 'src')), 'recipe hero shows the dish photo');
    await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
    await page.waitForSelector('#sheet .orig-btn img', { timeout: 3000 }).catch(() => {});
    ok(await page.locator('#sheet .orig-btn img').count() === 2, 'steps tab shows the original photos');
    await page.locator('#sheet .orig-btn').first().click();
    await wait(page);
    ok(await page.locator('#viewer img').isVisible(), 'a photo opens large');
    await page.keyboard.press('Escape');
    await wait(page);
    ok(await page.locator('#viewer').isHidden() && await page.locator('#sheet').isVisible(), 'Escape closes just the photo');
    await closeSheet(page);
    await page.click('.tabbar [data-tab="book"]');
    await wait(page, 400);
    const cardSel = `#book .grid .card[data-dish="${sid}"]`;
    ok(/^data:image\/jpeg/.test(await attr(page, `${cardSel} img`, 'src')) && (await text(page, `${cardSel} .gpill`)) === 'Foto', 'card shows the photo and a "Foto" tag');
    await page.click(cardSel);
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 400);
    await page.fill('#f-time', '45');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
    d = await docs(page);
    ok(d['dishes/' + sid].time === 45 && d['dishes/' + sid].origin === 'scan' && !!d['dishes/' + sid].thumb && !!d['dishes/' + sid].photo, 'editing keeps photo and origin');

    // scanning from a day plans the recipe there
    await page.click('.tabbar [data-tab="plan"]');
    await scrollTo(page, `${slotSel(DAY.do, 'h')} .add-meal`);
    await page.click(`${slotSel(DAY.do, 'h')} .add-meal`);
    await wait(page, 500);
    await page.click('#sheet .qtile[data-act="scan"]');
    await wait(page, 500);
    ok((await text(page, '#sheet .scan-for')).includes('Donnerstag, Hauptessen'), 'scanner knows the day');
    await page.evaluate((r) => { window.__sampleReply = Object.assign({}, r, { art: 'rezept', t: 'Omas Gulasch', name: 'Omas Rindergulasch' }); }, RECIPE);
    await page.setInputFiles('#scanCam', IMG('linsen.webp'));
    await wait(page, 200);
    await page.fill('#scanHint', 'nur das Rezept links');
    await page.click('#sheet [data-act="scan-go"]');
    await page.waitForSelector('#sheet .r-title', { timeout: 6000 }).catch(() => {});
    await wait(page, 300);
    d = await docs(page);
    const g = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Omas Gulasch');
    const gid = g ? g[0].split('/')[1] : '';
    ok(g && !g[1].thumb && g[1].photo.kind === 'rezept' && day(d, DAY.do, 'h').includes(gid), 'written recipe: no dish photo, planned on Thursday', d['days/' + DAY.do]);
    ok((await text(page, '#sheet .r-eyebrow')).toLowerCase() === 'donnerstag · hauptessen', 'recipe opens in its day');
    ok((await page.evaluate(() => window.__lastPrompt)).includes('nur das Rezept links'), 'hint reaches Claude');
    await page.click('#toast [data-act="undo"]');
    await wait(page, 500);
    d = await docs(page);
    ok(!d['dishes/' + gid] && !day(d, DAY.do, 'h').includes(gid) && await page.locator('#sheet').isHidden(), 'undo removes recipe and plan entry');
    await wait(page, 9500);
    d = await docs(page);
    ok(!d['photos/' + gid] && !!d['photos/' + sid], 'its photo is cleaned up afterwards, others stay');

    // nothing to read on the photo
    await page.evaluate(() => { window.__sampleReply = { art: 'nichts', grund: 'nur eine leere Wand' }; });
    await page.click('#v-plan .nav [data-act="scan"]');
    await wait(page, 500);
    await page.setInputFiles('#scanCam', IMG('ph-leicht.webp'));
    await wait(page, 200);
    const count = Object.keys(await docs(page)).length;
    await page.click('#sheet [data-act="scan-go"]');
    await page.waitForFunction(() => /kein Rezept/.test((document.querySelector('#sheet .scan-status') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
    ok((await text(page, '#sheet .scan-status')).includes('nur eine leere Wand') && Object.keys(await docs(page)).length === count, 'no recipe found: explains and saves nothing');
    ok(await page.locator('#sheet .scan-go').count() === 1, 'can try again right away');
    await page.click('#sheet [data-act="scan-del"]');
    await wait(page);
    ok(await page.locator('#sheet .scan-empty').count() === 1, 'removing the photo goes back to the camera');
    await closeSheet(page);
    ok(!errors.length, 'no page errors (E)', errors);
    await ctx.close();
  }

  console.log('G. recipes from links and screenshots, older apps, photos');
  {
    const fs = require('fs');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antom-'));
    const tall = path.join(tmp, 'tall.png');
    const ready = (async () => {
      const b = await launch();
      const pg = await (await b.newContext()).newPage();
      const png = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 2400; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 2400); g.fillStyle = '#000'; for (let y = 30; y < 2400; y += 40) g.fillText('200 g Mehl, Zeile ' + y, 20, y); return c.toDataURL('image/png').split(',')[1]; });
      fs.writeFileSync(tall, Buffer.from(png, 'base64'));
      await b.close();
    })();
    await ready;
    const REPLY = Object.assign({}, RECIPE, { t: 'Kürbissuppe', name: 'Kürbissuppe mit Ingwer' });
    // an older Claude app: no sample.json, the answer comes as text with a JSON block
    const OLD_APP = `(() => { const orig = window.claude.use; window.claude.use = async (n) => { const r = await orig(n); if (n === 'sample' && r && !r.__old) { const f = async (p, o) => { window.__lastPrompt = p; window.__lastOpts = o; return { text: 'Gern!\\n\\x60\\x60\\x60json\\n' + JSON.stringify(window.__sampleReply) + '\\n\\x60\\x60\\x60' }; }; f.__old = true; f.limits = r.limits; return f; } return r; }; })();`;
    for (const variant of ['current', 'old app']) {
      const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK + SAMPLE_IMAGES + (variant === 'old app' ? OLD_APP : ''));
      await open(page);
      await wait(page, 600);
      await page.evaluate((r) => { window.__sampleReply = r; }, REPLY);
      await page.click('.tabbar [data-tab="book"]');
      await page.click('#book .promo [data-act="import"]');
      await wait(page, 500);
      await page.click('#sheet [data-act="imp-mode"][data-mode="paste"]');
      await page.fill('#impText', 'https://www.chefkoch.de/rezepte/1234567890/Kuerbissuppe-mit-Ingwer.html');
      ok((await text(page, '#impHint')).includes('„Kuerbissuppe mit Ingwer“'), `${variant}: a pasted link is recognised`);
      await page.click('#sheet [data-act="imp-go"]');
      await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
      const lp = await page.evaluate(() => window.__lastPrompt || '');
      ok(await page.locator('#dishForm').count() === 1 && await page.inputValue('#f-src') === 'https://www.chefkoch.de/rezepte/1234567890/Kuerbissuppe-mit-Ingwer.html' && (await page.inputValue('#f-ing')).includes('Hokkaido'), `${variant}: a link alone becomes a recipe`);
      ok(lp.includes('"Kuerbissuppe mit Ingwer"') && lp.includes('nicht öffnen'), `${variant}: Claude writes it from the name in the link`);
      await closeSheet(page);
      await page.click('#book .promo [data-act="import"]');
      await wait(page, 500);
      await page.click('#sheet [data-act="imp-mode"][data-mode="shots"]');
      await page.setInputFiles('#impFiles', tall);
      await wait(page, 200);
      await page.click('#sheet [data-act="imp-go"]');
      await page.waitForSelector('#dishForm', { timeout: 5000 }).catch(() => {});
      const sent = await page.evaluate(() => (window.__lastOpts && window.__lastOpts.images ? window.__lastOpts.images.map((x) => x.type) : []));
      ok(sent.length === 3 && sent.every((t) => t === 'image/jpeg') && (await page.evaluate(() => window.__lastPrompt)).includes('von oben nach unten'), `${variant}: a long screenshot goes to Claude in readable pieces`, sent);
      await closeSheet(page);
      await page.click('#book .promo [data-act="import"]');
      await wait(page, 500);
      await page.click('#sheet [data-act="imp-mode"][data-mode="shots"]');
      await page.setInputFiles('#impFiles', { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('0000001866747970686569630000000068656963', 'hex') });
      await page.click('#sheet [data-act="imp-go"]');
      await wait(page, 800);
      ok((await text(page, '#sheet .status')).includes('Bildformat'), `${variant}: an unreadable photo format gets a clear note`);
      await closeSheet(page);
      ok(!errors.length, `no page errors (G ${variant})`, errors);
      await ctx.close();
    }
    {
      const DENY = `(() => { const orig = window.claude.use; window.claude.use = async (n) => { const r = await orig(n); if (n === 'sample' && r && !r.__deny) { r.__deny = true; r.json = async () => { throw { code: 'not_granted', message: 'no' }; }; } return r; }; })();`;
      const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK + SAMPLE_IMAGES + DENY);
      await open(page);
      await wait(page, 600);
      await page.click('.tabbar [data-tab="book"]');
      await page.click('#book .promo [data-act="import"]');
      await wait(page, 500);
      await page.click('#sheet [data-act="imp-mode"][data-mode="paste"]');
      await page.fill('#impText', 'Zutaten: 500 g Kartoffeln, 1 Zwiebel. Die Kartoffeln schälen, würfeln und im Ofen goldbraun backen.');
      await page.click('#sheet [data-act="imp-go"]');
      await wait(page, 800);
      ok((await text(page, '#sheet .status')).includes('noch nicht erlaubt') && await page.locator('#sheet [data-act="perm"]').count() === 1, 'not allowed yet: explains it and offers "Claude erlauben"');
      await page.click('#sheet [data-act="imp-manual"]');
      await wait(page, 600);
      ok(await page.locator('#sheet #f-step-0').count() === 1 && (await page.inputValue('#sheet #f-step-0')).includes('Kartoffeln'), 'after a failed import "Selbst eintragen" carries the text into the form');
      ok(!errors.length, 'no page errors (G denied)', errors);
      await ctx.close();
    }
    {
      // the photos are part of the page: they show even where no image file can be loaded
      const { page, ctx } = await newPage(browser, phone, seedScript() + MOCK + SAMPLE_IMAGES);
      await page.route('**/img/**', (r) => r.abort());
      await open(page);
      await wait(page, 900);
      const okWeek = await page.evaluate(() => { const v = [...document.querySelectorAll('img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width && r.top < innerHeight && r.bottom > 0; }); return v.length > 3 && v.every((i) => i.naturalWidth > 0); });
      await page.click('.tabbar [data-tab="book"]');
      await wait(page, 600);
      const okBook = await page.evaluate(() => { const v = [...document.querySelectorAll('#v-book img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width && r.top < innerHeight && r.bottom > 0; }); return v.length > 3 && v.every((i) => i.naturalWidth > 0); });
      ok(okWeek && okBook, 'photos show even when the image files cannot be loaded');
      await ctx.close();
    }
  }

  console.log('H. Thermomix');
  {
    const { page, errors, ctx } = await newPage(browser, phone, seedScript() + MOCK + SAMPLE_IMAGES);
    await open(page);
    await wait(page, 600);
    ok(await page.locator('#days .meal[data-dish="bolo"] .tmk').count() >= 1, 'week rows mark Thermomix dishes');
    await page.click('.tabbar [data-tab="book"]');
    await wait(page, 400);
    ok(/17 Thermomix/i.test(await text(page, '#bookCap')), 'cookbook counts the Thermomix recipes', await text(page, '#bookCap'));
    await page.click('#v-book [data-act="filter"][data-f="tm"]');
    await wait(page, 300);
    ok(await page.locator('#book .grid .card').count() === 17 && await page.locator('#book .grid .card[data-dish="pizza"]').count() === 0, 'filter "Mit Thermomix"');
    // recipe: facts, summary, step cards, timer
    await page.click('#book .grid .card[data-dish="risotto"]');
    await wait(page, 700);
    ok((await text(page, '#sheet .fact.tmf')).includes('5 Schritte') && await page.locator('#sheet .facts.four').count() === 1, 'facts show Cosori and Thermomix');
    await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
    await wait(page);
    ok(await page.locator('#sheet .tm-card').count() === 5 && await page.locator('#sheet .tm-sum li').count() === 5, 'five Thermomix steps with a summary');
    ok((await text(page, '#sheet .tm-sum li:last-child')).startsWith('14 Min/100 °C/Linkslauf/Stufe 1'), 'settings written the way the Thermomix shows them', await text(page, '#sheet .tm-sum li:last-child'));
    ok((await page.locator('#sheet .tm-card').nth(3).innerText()).includes('Linkslauf'), 'Linkslauf has its own chip');
    ok(await page.locator('#sheet .tm-card .timer-btn').count() === 3, 'timer only for steps of a minute or more');
    ok(await page.locator('#sheet .links a.row[href*="Thermomix"]').count() === 1, 'link to Thermomix recipes on Chefkoch');
    await page.locator('#sheet .tm-card .timer-btn').last().click();
    await wait(page, 400);
    await closeSheet(page);
    ok((await text(page, '#timer .t-next')) === '100 °C · Linkslauf · Stufe 1' && /^1[34]:\d\d$/.test(await text(page, '#timer .t-time')), 'Thermomix timer runs', [await text(page, '#timer .t-next'), await text(page, '#timer .t-time')]);
    await page.click('#timer [data-act="timer-stop"]');
    // cook mode
    await page.click('#book .grid .card[data-dish="milchreis"]');
    await wait(page, 700);
    await page.click('#sheet [data-act="r-cook"]');
    await wait(page, 400);
    await page.click('#cook [data-act="cook-next"]');
    await wait(page);
    ok(await page.locator('#cook .fry.tmx').count() === 1 && (await text(page, '#cook .fry.tmx .temp')) === '90 °C' && (await text(page, '#cook .fry.tmx [data-info]')) === 'Linkslauf · Stufe 1' && (await text(page, '#cook .ring-big .t b')) === '35:00', 'cook mode shows the Thermomix settings', [await text(page, '#cook .fry.tmx .temp'), await text(page, '#cook .fry.tmx [data-info]')]);
    await page.click('#cook [data-act="cook-timer"]');
    await wait(page, 500);
    ok(/^3[45]:\d\d$/.test(await text(page, '#cook .ring-big .t b')) && await page.locator('#cook [data-act="timer-pause"]').count() === 1 && (await text(page, '#cook .fry.tmx [data-info]')) === 'Linkslauf · Stufe 1', 'Thermomix timer in cook mode');
    await page.click('#cook [data-act="cook-close"]');
    await wait(page, 300);
    await closeSheet(page);
    await page.click('#timer [data-act="timer-stop"]');
    // form: edit a Thermomix step, add one
    await page.click('#book .grid .card[data-dish="milchreis"]');
    await wait(page, 700);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 500);
    const first = page.locator('#sheet .step-edit').first();
    ok(await first.locator('[data-dev][value="tm"]').isChecked() && await first.locator('[data-tm-min]').inputValue() === '35' && await first.locator('[data-tm-temp]').inputValue() === '90' && await first.locator('[data-tm-speed]').inputValue() === '1' && await first.locator('[data-tm-rev]').isChecked(), 'form shows the Thermomix settings');
    await first.locator('[data-tm-min]').fill('30');
    await page.click('#sheet [data-act="add-step"]');
    await wait(page, 300);
    const last = page.locator('#sheet .step-edit').last();
    await last.locator('textarea').fill('Zimt und Zucker mischen.');
    await last.locator('[data-dev][value="tm"]').check();
    ok(await last.locator('.tm-fields').isVisible() && !(await last.locator('.af-fields:not(.tm-fields)').isVisible()), 'choosing Thermomix shows its fields');
    await last.locator('[data-tm-min]').fill('0');
    await last.locator('[data-tm-sec]').fill('10');
    await last.locator('[data-tm-temp]').selectOption('');
    await last.locator('[data-tm-speed]').selectOption('turbo');
    await last.locator('[data-tm-label]').fill('Zimtzucker');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
    let d = await docs(page);
    const mr = d['dishes/milchreis'];
    const lastStep = mr && mr.steps[mr.steps.length - 1];
    ok(mr && mr.steps[0].tm && mr.steps[0].tm.sec === 1800 && mr.steps[0].tm.temp === 90 && mr.steps[0].tm.rev === true, 'edited Thermomix step saved', mr && mr.steps[0]);
    ok(lastStep && lastStep.tm && lastStep.tm.sec === 10 && lastStep.tm.temp === null && lastStep.tm.speed === 'turbo' && lastStep.tm.label === 'Zimtzucker', 'new Thermomix step saved', lastStep);
    ok(mr && mr.steps[2] && mr.steps[2].af && !mr.steps[2].tm, 'the Cosori step stays a Cosori step', mr && mr.steps[2]);
    // Cookidoo links carry no name
    await page.click('#v-book [data-act="filter"][data-f="alle"]');
    await wait(page, 300);
    await page.click('#book .promo [data-act="import"]');
    await wait(page, 500);
    await page.click('#sheet [data-act="imp-mode"][data-mode="paste"]');
    await page.fill('#impText', 'https://cookidoo.de/recipes/recipe/de-DE/r145196');
    ok((await text(page, '#impHint')).startsWith('Cookidoo-Links verraten den Namen'), 'a Cookidoo link alone asks for the name', await text(page, '#impHint'));
    await page.click('#sheet [data-act="imp-go"]');
    await wait(page, 200);
    ok((await text(page, '#sheet .status')).includes('Namen'), 'converting it asks for the name first', await text(page, '#sheet .status'));
    await page.evaluate((r) => { window.__sampleReply = Object.assign({}, r, { t: 'Gulaschsuppe', name: 'Gulaschsuppe' }); }, RECIPE);
    await page.fill('#impText', 'Schau dir dieses Rezept an: Gulaschsuppe https://cookidoo.de/recipes/recipe/de-DE/r145196');
    ok((await text(page, '#impHint')).includes('„Gulaschsuppe“'), 'the name next to the link is used', await text(page, '#impHint'));
    await page.click('#sheet [data-act="imp-go"]');
    await page.waitForSelector('#dishForm', { timeout: 4000 }).catch(() => {});
    const p2 = await page.evaluate(() => window.__lastPrompt);
    ok(p2.includes('"Gulaschsuppe"') && p2.includes('Thermomix-Rezept von Cookidoo'), 'prompt asks for a Thermomix recipe', p2.slice(0, 300));
    ok(await page.locator('#sheet .step-edit [data-dev][value="tm"]:checked').count() === 2, 'Thermomix steps from Claude land in the form');
    await page.click('#dishForm button[type="submit"]');
    await wait(page, 500);
    d = await docs(page);
    const gu = Object.entries(d).find(([k, v]) => k.startsWith('dishes/') && v.t === 'Gulaschsuppe');
    ok(gu && gu[1].src && /cookidoo/.test(gu[1].src.url) && gu[1].steps[0].tm && gu[1].steps[0].tm.speed === 5, 'saved with its source and Thermomix steps', gu && gu[1].steps);
    ok(gu && (await text(page, `#book .grid .card[data-dish="${gu[0].split('/')[1]}"] .gpill`)) === 'Cookidoo', 'card is tagged Cookidoo');
    // settings
    await page.click('.tabbar [data-tab="plan"]');
    await page.locator('#v-plan .nav [data-act="settings"]').click();
    await wait(page, 600);
    ok(await page.locator('#sheet .rules.tm li').count() === 7, 'settings list the Thermomix basics');
    await closeSheet(page);
    ok(!errors.length, 'no page errors (H)', errors);
    await ctx.close();
  }

  console.log('I. Antom.html, the single file');
  {
    const { page, errors, ctx } = await newPage(browser, phone);
    const net = [];
    page.on('request', (r) => { if (/^https?:/i.test(r.url())) net.push(r.url()); });
    const reopen = async (go) => { await go(); await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded'); await wait(page, 600); };
    await reopen(() => page.goto('file://' + path.join(__dirname, '..', 'Antom.html')));
    ok(await page.title() === 'Antom' && await page.evaluate(() => document.characterSet) === 'UTF-8' && await page.evaluate(() => document.compatMode) === 'CSS1Compat', 'a complete document: title, UTF-8, standards mode');
    ok(await page.evaluate(() => document.fonts.check('700 30px Fraunces') && typeof window.Sortable === 'function'), 'font and drag & drop are built in');
    ok(await page.locator('#days .meal').count() >= 7 && (await page.textContent('#days')).includes('Frühstück'), 'starts with the fridge plan, umlauts intact');
    ok(await page.evaluate(() => { const v = [...document.querySelectorAll('img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width && r.top < innerHeight && r.bottom > 0; }); return v.length > 3 && v.every((i) => i.naturalWidth > 0); }), 'photos show');
    ok(await page.locator('#v-plan .nav [data-act="scan"]').isHidden(), 'no Claude features without Claude');
    const key = (await page.locator('#days .day').first().getAttribute('id')).slice(4);
    await page.click(`#day-${key} [data-act="pick"]`);
    await wait(page, 600);
    await page.click('#sheet .pick-row[data-id="tikka"]');
    await wait(page, 500);
    ok(await page.locator(`${slotSel(key, 'h')} .meal[data-dish="tikka"]`).count() === 1, 'plan a dish');
    await reopen(() => page.reload());
    ok(await page.locator(`${slotSel(key, 'h')} .meal[data-dish="tikka"]`).count() === 1, 'still planned after reopening the file (kept in the browser)');
    await page.locator('#v-plan .nav [data-act="settings"]').click();
    await wait(page, 600);
    ok((await page.locator('#sheet .sec-f').allInnerTexts()).some((t) => t.startsWith('Diese Antom-Datei')), 'settings say where the plan is kept');
    await closeSheet(page);
    ok(!net.length, 'loads nothing from the network', net);
    ok(!errors.length, 'no page errors (I)', errors);
    await ctx.close();
  }

  console.log('F. first start and layout');
  {
    const { page, errors, ctx } = await newPage(browser, Object.assign({ onboarding: true }, phone), seedScript() + MOCK + SAMPLE_IMAGES);
    await open(page);
    await wait(page, 500);
    ok(await page.locator('#onboard').isVisible() && await page.locator('#onboard .ob-page').count() === 4, 'first start shows the welcome tour');
    for (let i = 0; i < 3; i++) { await page.click('#onboard [data-act="ob-next"]'); await wait(page, 700); }
    ok((await text(page, '#onboard [data-act="ob-next"]')) === 'Los geht’s', 'last page says "Los geht’s"');
    await page.click('#onboard [data-act="ob-next"]');
    await wait(page, 600);
    ok(await page.locator('#onboard').isHidden() && (await page.evaluate(() => localStorage.getItem('antom.onboarded'))) === '1', 'tour closes and is remembered');
    await page.reload();
    await wait(page, 600);
    ok(await page.locator('#onboard').isHidden(), 'not shown again');
    await page.evaluate(() => localStorage.removeItem('antom.onboarded'));
    await page.reload();
    await wait(page, 600);
    await page.click('#onboard [data-act="ob-done"]');
    await wait(page, 600);
    ok(await page.locator('#onboard').isHidden(), '"Überspringen" closes it');
    await page.click('#v-plan .nav [data-act="settings"]');
    await wait(page, 500);
    await page.click('#sheet [data-act="onboard"]');
    await wait(page, 400);
    ok(await page.locator('#onboard').isVisible(), 'settings can show the tour again');
    await page.keyboard.press('Escape');
    await wait(page, 600);
    ok(!errors.length, 'no page errors (F1)', errors);
    await ctx.close();
  }
  for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1366, height: 900 }]) {
    const { page, errors, ctx } = await newPage(browser, { viewport: vp, isMobile: vp.width < 900, hasTouch: vp.width < 900 }, seedScript() + MOCK + SAMPLE_IMAGES);
    await open(page);
    await wait(page, 600);
    const over = [];
    for (const tab of ['plan', 'book', 'shop']) {
      await page.evaluate((t) => { const b = document.querySelector(`.tabbar [data-tab="${t}"], .side-nav [data-tab="${t}"]`); if (b) b.click(); }, tab);
      await wait(page, 300);
      const o = await page.evaluate((t) => { const v = document.getElementById('v-' + t); return v.scrollWidth - v.clientWidth; }, tab);
      if (o > 1) over.push([tab, o]);
    }
    await page.evaluate(() => { const b = document.querySelector('.tabbar [data-tab="plan"], .side-nav [data-tab="plan"]'); if (b) b.click(); });
    await page.click(`#days .meal[data-dish="tikka"]`);
    await wait(page, 700);
    const so = await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth - s.clientWidth; });
    if (so > 1) over.push(['sheet', so]);
    await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
    await wait(page, 200);
    const ss = await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth - s.clientWidth; });
    if (ss > 1) over.push(['steps', ss]);
    await page.click('#sheet [data-act="r-edit"]');
    await wait(page, 600);
    const fo = await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth - s.clientWidth + Math.max(0, ...[...document.querySelectorAll('#sheet .step-bar')].map((b) => b.scrollWidth - b.clientWidth)); });
    if (fo > 1) over.push(['form', fo]);
    ok(!over.length && !errors.length, `no sideways scrolling at ${vp.width}px`, [over, errors]);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
