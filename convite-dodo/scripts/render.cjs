// node render.cjs stills <sceneDir> <outDir> t1 t2 ...
// node render.cjs video  <sceneDir> <out.mp4> [fps] [audio.wav]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const [mode, sceneDir, out, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await page.goto('file://' + path.resolve(sceneDir, 'index.html'));
  await page.waitForLoadState('load');
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(300);

  if (mode === 'stills') {
    for (const t of rest.map(Number)) {
      await page.evaluate(t => window.render(t), t);
      await page.screenshot({ path: path.join(out, `still_${t.toFixed(2)}.png`) });
      console.log('still', t);
    }
  } else {
    const fps = Number(rest[0] || 30), audio = rest[1];
    const dur = await page.evaluate(() => window.DURATION);
    const n = Math.round(dur * fps);
    const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
    if (audio) args.push('-i', audio);
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push(out);
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => window.render(t), i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 60 === 0) console.log(`frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
