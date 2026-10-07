// Screenshots of the main screens (phone + desktop, light + dark) into test/shots:
// `node test/visual.js [phone|desktop]`.
const { launch, newPage, open, shot, MOCK } = require('./harness');
const { seedScript } = require('./seed');

const only = process.argv[2] || 'all';
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const settle = (page, ms = 450) => page.waitForTimeout(ms);

(async () => {
  const browser = await launch();
  const out = [];
  const log = (...a) => console.log(...a);

  if (only === 'all' || only === 'phone') {
    for (const scheme of ['light', 'dark']) {
      const { page, errors, ctx } = await newPage(browser, Object.assign({ colorScheme: scheme }, phone), seedScript() + MOCK);
      await open(page);
      await settle(page, 900);
      out.push(await shot(page, `${scheme}-week`));
      out.push(await shot(page, `${scheme}-week-full`, { fullPage: true }));
      await page.click('.tabbar [data-tab="book"]');
      await settle(page);
      out.push(await shot(page, `${scheme}-book`));
      await page.click('.tabbar [data-tab="shop"]');
      await settle(page);
      out.push(await shot(page, `${scheme}-shop`));
      await page.click('.tabbar [data-tab="week"]');
      await settle(page);
      await page.click('.meal[data-dish="caponata"]');
      await settle(page, 900);
      out.push(await shot(page, `${scheme}-recipe-top`));
      await page.evaluate(() => { document.getElementById('sheet').scrollTop = 420; });
      await settle(page, 200);
      out.push(await shot(page, `${scheme}-recipe-shop`));
      await page.click('#sheet [data-act="rtab"][data-tab="recipe"]');
      await settle(page, 250);
      await page.evaluate(() => { document.getElementById('sheet').scrollTop = 420; });
      await settle(page, 200);
      out.push(await shot(page, `${scheme}-recipe-steps`));
      if (scheme === 'light') {
        await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = s.scrollHeight; });
        await settle(page, 200);
        out.push(await shot(page, `${scheme}-recipe-bottom`));
        await page.click('#sheet [data-act="r-cook"]');
        await settle(page);
        out.push(await shot(page, `${scheme}-cook-prep`));
        await page.click('#cook [data-act="cook-next"]');
        await page.click('#cook [data-act="cook-next"]');
        await settle(page, 250);
        out.push(await shot(page, `${scheme}-cook-step`));
        const hasTimer = await page.$('#cook [data-act="cook-timer"]');
        if (hasTimer) { await hasTimer.click(); await settle(page, 1200); out.push(await shot(page, `${scheme}-cook-timer`)); }
        await page.click('#cook [data-act="cook-close"]');
        await page.keyboard.press('Escape');
        await settle(page, 500);
        out.push(await shot(page, `${scheme}-timer-pill`));
        await page.click('#timer [data-act="timer-stop"]');
        // picker on an empty slot
        await page.click('#days .slot[data-day="do"][data-slot="h"] .meal-empty');
        await settle(page);
        out.push(await shot(page, `${scheme}-picker`));
        await page.keyboard.press('Escape');
        await page.click('.tabbar [data-tab="book"]');
        await page.click('#book [data-act="import"]');
        await settle(page);
        out.push(await shot(page, `${scheme}-import`));
        await page.keyboard.press('Escape');
        await page.click('#viewBook [data-act="new-dish"]');
        await settle(page);
        out.push(await shot(page, `${scheme}-form`));
        await page.keyboard.press('Escape');
        await page.click('.app-bar [data-act="settings"].icon-btn');
        await settle(page);
        out.push(await shot(page, `${scheme}-settings`));
      }
      log(scheme, 'errors:', JSON.stringify(errors));
      log(scheme, 'overflow px:', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
      await ctx.close();
    }
  }

  if (only === 'all' || only === 'desktop') {
    for (const scheme of ['light', 'dark']) {
      const { page, errors, ctx } = await newPage(browser, { viewport: { width: 1366, height: 900 }, colorScheme: scheme }, seedScript() + MOCK);
      await open(page);
      await settle(page, 900);
      out.push(await shot(page, `desk-${scheme}-week`));
      if (scheme === 'light') {
        await page.click('.side-nav [data-tab="book"]');
        await settle(page);
        out.push(await shot(page, `desk-${scheme}-book`));
        await page.click('.card[data-dish="risotto"]');
        await settle(page, 900);
        out.push(await shot(page, `desk-${scheme}-recipe`));
        await page.keyboard.press('Escape');
        await page.click('.side-nav [data-tab="shop"]');
        await settle(page);
        out.push(await shot(page, `desk-${scheme}-shop`));
      }
      log('desktop', scheme, 'errors:', JSON.stringify(errors));
      await ctx.close();
    }
  }
  await browser.close();
  log(out.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
