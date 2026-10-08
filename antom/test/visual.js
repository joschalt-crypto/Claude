// Screenshots of the main screens (phone light + dark, tablet, desktop) into test/shots:
// `node test/visual.js [phone|tablet|desktop]`.
const { launch, newPage, open, settle, shot, MOCK, SAMPLE_IMAGES } = require('./harness');
const { SEED, DAY, TODAY, seedScript } = require('./seed');

const only = process.argv[2] || 'all';
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// screenshots look best with a main dish today
const seed = Object.assign({}, SEED, { [`days/${DAY[TODAY]}`]: { f: [{ u: 'v-f', d: 'porridge' }], h: [{ u: 'v-h', d: 'pizza' }] } });
const pause = (page, ms = 450) => page.waitForTimeout(ms);
const scroll = (page, sel, y) => page.evaluate(([s, top]) => document.querySelector(s).scrollTo(0, top), [sel, y]);

(async () => {
  const browser = await launch();
  const out = [];
  const snap = async (page, name, opts) => { await settle(page); out.push(await shot(page, name, opts)); };

  if (only === 'all' || only === 'phone') {
    for (const scheme of ['light', 'dark']) {
      const { page, errors, ctx } = await newPage(browser, Object.assign({ colorScheme: scheme }, phone), seedScript('', seed) + MOCK + SAMPLE_IMAGES);
      await open(page);
      await pause(page, 900);
      await snap(page, `${scheme}-week`);
      await scroll(page, '#v-plan', 640);
      await snap(page, `${scheme}-week-days`);
      await page.click('.tabbar [data-tab="book"]');
      await pause(page);
      await snap(page, `${scheme}-book`);
      await scroll(page, '#v-book', 720);
      await snap(page, `${scheme}-book-shelves`);
      await page.click('.tabbar [data-tab="shop"]');
      await pause(page);
      await snap(page, `${scheme}-shop`);
      await page.click('.tabbar [data-tab="plan"]');
      await scroll(page, '#v-plan', 0);
      await page.click('#today .hero');
      await pause(page, 900);
      await snap(page, `${scheme}-recipe`);
      await scroll(page, '#sheet', 520);
      await snap(page, `${scheme}-recipe-ingredients`);
      await page.click('#sheet [data-act="rtab"][data-tab="steps"]');
      await pause(page, 250);
      await snap(page, `${scheme}-recipe-steps`);
      await page.click('#sheet [data-act="r-cook"]');
      await pause(page, 500);
      // walk to the first Cosori step and start its timer
      for (let i = 0; i < 10 && !(await page.locator('#cook [data-act="cook-timer"]').count()); i++) await page.click('#cook [data-act="cook-next"]');
      await page.click('#cook [data-act="cook-timer"]');
      await pause(page, 1200);
      await snap(page, `${scheme}-cook`);
      await page.click('#cook [data-act="cook-close"]');
      await page.keyboard.press('Escape');
      await pause(page, 500);
      await snap(page, `${scheme}-timer`);
      await page.click('#timer [data-act="timer-stop"]');
      await page.click('#v-plan .nav [data-act="scan"]');
      await pause(page, 600);
      await snap(page, `${scheme}-scan`);
      await page.keyboard.press('Escape');
      await pause(page, 500);
      await page.click('#v-plan [data-act="week-next"]');
      await pause(page);
      await snap(page, `${scheme}-next-week`);
      console.log(scheme, 'page errors:', JSON.stringify(errors));
      await ctx.close();
    }
    const { page, ctx } = await newPage(browser, Object.assign({ onboarding: true }, phone), seedScript('', seed) + MOCK + SAMPLE_IMAGES);
    await open(page);
    await pause(page, 900);
    await snap(page, 'welcome');
    await ctx.close();
  }

  if (only === 'all' || only === 'tablet') {
    const { page, errors, ctx } = await newPage(browser, { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }, seedScript('', seed) + MOCK + SAMPLE_IMAGES);
    await open(page);
    await pause(page, 900);
    await snap(page, 'tablet-week');
    await page.click('.tabbar [data-tab="book"]');
    await pause(page);
    await snap(page, 'tablet-book');
    console.log('tablet page errors:', JSON.stringify(errors));
    await ctx.close();
  }

  if (only === 'all' || only === 'desktop') {
    for (const scheme of ['light', 'dark']) {
      const { page, errors, ctx } = await newPage(browser, { viewport: { width: 1366, height: 900 }, colorScheme: scheme }, seedScript('', seed) + MOCK + SAMPLE_IMAGES);
      await open(page);
      await pause(page, 900);
      await snap(page, `desktop-${scheme}-week`);
      await page.click('#today .hero');
      await pause(page, 900);
      await snap(page, `desktop-${scheme}-recipe`);
      await page.keyboard.press('Escape');
      await pause(page, 500);
      await page.click('.side-nav [data-tab="book"]');
      await pause(page);
      await snap(page, `desktop-${scheme}-book`);
      await page.click('.side-nav [data-tab="shop"]');
      await pause(page);
      await snap(page, `desktop-${scheme}-shop`);
      console.log(`desktop ${scheme} page errors:`, JSON.stringify(errors));
      await ctx.close();
    }
  }

  await browser.close();
  console.log(out.length, 'screenshots in test/shots');
})().catch((e) => { console.error(e); process.exit(1); });
