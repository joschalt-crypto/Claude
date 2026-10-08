
/* ---------- photos of scanned recipes (db: photos/<dishId>, else this device) ---------- */
const canScan = () => !!(sampleFn && UI.canImages);
const photoCache = new Map();
const PHOTO_KEY = 'antom.photo.';
async function loadPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  let doc = null;
  try {
    if (S.mode === 'shared' && store.db) { const snap = await store.db.doc('photos/' + id).get(); doc = snap && snap.exists ? snap.data() : null; }
    else doc = JSON.parse(localStorage.getItem(PHOTO_KEY + id) || 'null');
  } catch (e) { doc = null; }
  const pages = doc && Array.isArray(doc.pages) ? doc.pages.filter(okImg).slice(0, 3) : [];
  photoCache.set(id, pages);
  return pages;
}
async function savePhoto(id, doc) {
  photoCache.set(id, doc.pages);
  try {
    if (S.mode === 'shared' && store.db) await store.db.doc('photos/' + id).set(doc);
    else localStorage.setItem(PHOTO_KEY + id, JSON.stringify(doc));
  } catch (e) {
    toast(e && e.code === 'quota_exceeded' ? 'Das Originalfoto passt nicht mehr in den Speicher. Das Rezept ist trotzdem gespeichert.' : 'Das Originalfoto ließ sich nicht speichern. Das Rezept ist trotzdem gespeichert.');
  }
}
function deletePhoto(id) {
  photoCache.delete(id);
  try {
    if (S.mode === 'shared' && store.db) store.db.doc('photos/' + id).delete().catch(() => {});
    else localStorage.removeItem(PHOTO_KEY + id);
  } catch (e) { /* already gone */ }
}
// keep the photo while "Rückgängig" is still possible, then drop it if the recipe stayed deleted
function cleanupPhotoLater(id) {
  setTimeout(() => { const c = S.custom[id]; if (!c || c.deleted) deletePhoto(id); }, 9000);
}
function openViewer(src) {
  const v = $('#viewer');
  v.innerHTML = `<button type="button" class="cbtn" aria-label="Schließen">${icon('x')}</button><img src="${src}" alt="Originalfoto">`;
  v.hidden = false;
  v.querySelector('button').focus({ preventScroll: true });
}
function closeViewer() {
  const v = $('#viewer');
  if (v.hidden) return false;
  v.hidden = true;
  v.innerHTML = '';
  return true;
}
const loadImg = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img.naturalWidth ? img : null); img.onerror = () => resolve(null); img.src = src; });
function drawScaled(img, maxEdge, square) {
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = m; sh = m; }
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
const jpegBlob = (canvas, q) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));
// shrink until the data URL fits a database document
function fitDataUrl(img, maxEdge, maxChars, square) {
  let edge = maxEdge, q = 0.8;
  for (let i = 0; i < 7; i++) {
    const url = drawScaled(img, edge, square).toDataURL('image/jpeg', q);
    if (url.length <= maxChars) return url;
    edge = Math.round(edge * 0.82);
    q = Math.max(0.5, q - 0.05);
  }
  return '';
}

/* ---------- camera scan: photo → recipe in the cookbook ---------- */
const SCAN_JSON = '{"art":"rezept|gericht|name|nichts","grund":"",' + RECIPE_JSON.slice(1);
const SCAN_STEPS = ['Claude liest das Foto …', 'Zutaten werden sortiert …', 'Cosori und Thermomix werden eingeplant …', 'Gleich fertig …'];
function scanPrompt(n, hint, people) {
  return `Du bekommst ${n === 1 ? 'ein Foto' : `${n} Fotos`} aus der Handykamera, für Antom, eine deutsche Familien-App zur Wochenplanung.${n > 1 ? ' Die Fotos gehören zum selben Rezept, zum Beispiel zwei Seiten.' : ''}
Bestimme zuerst, was zu sehen ist, und setze "art":
- "rezept": ein gedrucktes oder geschriebenes Rezept (Kochbuch, Zeitschrift, Rezeptkarte, handschriftlicher Zettel, Bildschirm, Packung). Übernimm es möglichst genau: keine Zutaten erfinden oder weglassen, nur fehlende Mengen sinnvoll ergänzen.
- "gericht": ein fertiges Gericht oder Essen. Erkenne es und schreibe ein passendes, alltagstaugliches Rezept dafür.
- "name": nur der Name eines Gerichts, etwa auf einem Kühlschrank-Magneten oder Zettel. Schreibe ein typisches Rezept dafür.
- "nichts": weder Essen noch ein Rezept erkennbar. Dann antworte nur {"art":"nichts","grund":"kurzer Grund"}.
${hint ? `Hinweis der Familie zum Foto: ${hint.slice(0, 200)}\n` : ''}Weitere Regeln:
- Mengen auf ${persons(people)} umrechnen.
- ${DEVICES} Schreibe Schritte für Backofen, Rösten oder Aufbacken auf den Cosori um – mit Temperatur, Minuten und wann geschüttelt wird – und Topf- und Pfannenschritte wie Zerkleinern, Andünsten, Köcheln, Pürieren oder Kneten auf den Thermomix. Sonst "af": null und "tm": null.
Antworte nur mit JSON in genau diesem Format:
${SCAN_JSON}
${RECIPE_RULES}`;
}
const maxShots = () => Math.max(1, Math.min(3, (UI.imgLimits && UI.imgLimits.maxCount) || 3));
function openScan(opener, ctx = {}) {
  const people = S.settings.people;
  const max = maxShots();
  const st = { shots: [], cur: 0, busy: false, status: '', ctl: null, hint: '', timer: 0, perm: false };
  const fileInput = (attrs) => `<input type="file" accept="image/*" class="vh" data-scan-add ${attrs}>`;
  const view = {
    render() {
      const n = st.shots.length;
      const shot = st.shots[st.cur];
      const shutterLabel = coarsePointer ? 'Foto aufnehmen' : 'Foto wählen';
      $('#sheet').innerHTML = `
        <div class="scan-top"><button type="button" class="cbtn" data-act="close" aria-label="Schließen">${icon('x')}</button><h2 id="sheetTitle">Rezept scannen</h2><span class="scan-count">${n ? `${n} / ${max}` : ''}</span></div>
        ${ctx.date ? `<p class="scan-for">${icon('calendar')}Für ${esc(dayName(ctx.date))}, ${esc(SLOT[ctx.slot].name)}</p>` : ''}
        <div class="scan-stage${st.busy ? ' busy' : ''}">
          ${shot ? `<img class="scan-photo" src="${shot.url}" alt="Foto ${st.cur + 1} von ${n}">` : `${imgOf('scan-card', 'm', ' class="bg"')}<div class="scan-empty">${icon('camera')}<p>Fotografiere ein Rezept aus dem Kochbuch, einer Zeitschrift oder eine Rezeptkarte – oder einfach ein fertiges Gericht.</p><div class="scan-kinds"><span>Kochbuch</span><span>Zeitschrift</span><span>Rezeptkarte</span><span>Gericht</span></div></div>`}
          <div class="viewfinder" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>
        ${n ? `<div class="scan-strip">${st.shots.map((x, i) => `<div class="scan-thumb${i === st.cur ? ' on' : ''}"><button type="button" class="pick" data-act="scan-show" data-i="${i}" aria-label="Foto ${i + 1} zeigen"><img src="${x.url}" alt=""></button>${st.busy ? '' : `<button type="button" class="del" data-act="scan-del" data-i="${i}" aria-label="Foto ${i + 1} entfernen">${icon('x')}</button>`}</div>`).join('')}${n < max && !st.busy ? `<label class="scan-add">${icon('plus')}<small>Seite</small>${fileInput('aria-label="Weitere Seite hinzufügen"')}</label>` : ''}</div>
        <label class="field scan-hint">Hinweis für Claude <span class="opt">(optional)</span><input id="scanHint" maxlength="200" placeholder="z. B. nur das Rezept unten rechts" value="${esc(st.hint)}"${st.busy ? ' disabled' : ''}></label>` : ''}
        <p class="scan-status" aria-live="polite">${esc(st.status)}</p>${st.perm ? '<div style="display:grid;padding:8px 16px 0"><button type="button" class="scan-cancel" data-act="perm">Claude erlauben</button></div>' : ''}
        <div class="scan-actions">${!n
          ? `<label class="scan-side left"><span class="bubble">${icon('image')}</span>Aus Fotos${fileInput('multiple id="scanPick"')}</label>
            <label class="shutter-wrap"><span class="shutter"></span>${shutterLabel}${fileInput(`capture="environment" id="scanCam" aria-label="${shutterLabel}"`)}</label>
            <button type="button" class="scan-side right" data-act="import"><span class="bubble">${icon('download')}</span>Von Chefkoch</button>`
          : st.busy
            ? '<button type="button" class="scan-cancel" data-act="scan-stop">Abbrechen</button>'
            : `<button type="button" class="scan-go" data-act="scan-go">${icon('sparkle')}Rezept anlegen</button>`}</div>`;
      const hint = $('#scanHint');
      if (hint) hint.addEventListener('input', () => { st.hint = hint.value; });
    },
    add(files) {
      let skipped = 0;
      for (const file of files) {
        if (st.shots.length >= max) { skipped++; continue; }
        if (file.type && !/^image\//.test(file.type)) continue;
        st.shots.push({ file, url: URL.createObjectURL(file) });
      }
      st.cur = Math.max(0, st.shots.length - 1);
      st.status = skipped ? `Höchstens ${max} Fotos pro Rezept.` : '';
      this.render();
    },
    act(act, el) {
      if (act === 'scan-show') { st.cur = Number(el.dataset.i); this.render(); return true; }
      if (act === 'scan-del') {
        const [gone] = st.shots.splice(Number(el.dataset.i), 1);
        if (gone) URL.revokeObjectURL(gone.url);
        st.cur = Math.min(st.cur, Math.max(0, st.shots.length - 1));
        st.status = '';
        this.render();
        return true;
      }
      if (act === 'scan-go') { run(); return true; }
      if (act === 'scan-stop') { if (st.ctl) st.ctl.abort(); return true; }
      return false;
    },
    onClose() {
      if (st.ctl) st.ctl.abort();
      clearInterval(st.timer);
      for (const x of st.shots) URL.revokeObjectURL(x.url);
    },
  };
  async function run() {
    if (!sampleFn || !st.shots.length || st.busy) return;
    st.busy = true;
    st.perm = false;
    st.status = SCAN_STEPS[0];
    st.ctl = new AbortController();
    const signal = st.ctl.signal;
    let step = 0;
    st.timer = setInterval(() => {
      step = Math.min(step + 1, SCAN_STEPS.length - 1);
      st.status = SCAN_STEPS[step];
      const p = $('#sheet .scan-status');
      if (p && UI.sheet === view) p.textContent = st.status;
    }, 2600);
    view.render();
    try {
      const imgs = await Promise.all(st.shots.map((x) => loadImg(x.url)));
      // phone photos are huge: send Claude a sharp but light JPEG of each
      const images = await Promise.all(st.shots.map(async (x, i) => (imgs[i] ? (await jpegBlob(drawScaled(imgs[i], 2000, false), 0.86)) || x.file : x.file)));
      if (signal.aborted) throw { code: 'cancelled' };
      const data = await askJSON(scanPrompt(st.shots.length, st.hint.trim(), people), { signal, images });
      const art = data && typeof data.art === 'string' ? data.art.toLowerCase() : 'rezept';
      const draft = Object.assign(draftDefaults(people), fromClaude(data, people));
      if (art === 'nichts' || (!draft.ingPrev.length && !draft.steps.some((x) => x.t))) {
        throw { code: 'no_recipe', why: data && typeof data.grund === 'string' ? data.grund.trim().slice(0, 160) : '' };
      }
      if (!draft.t) draft.t = (draft.name || 'Neues Rezept').split(/\s+/).slice(0, 4).join(' ');
      const kind = ['rezept', 'gericht', 'name'].includes(art) ? art : 'rezept';
      const dishData = dishFromDraft(draft);
      dishData.origin = 'scan';
      const pages = imgs.map((img) => (img ? fitDataUrl(img, 1400, Math.floor(240000 / imgs.length)) : '')).filter(okImg);
      if (pages.length) dishData.photo = { kind, n: pages.length };
      if (kind === 'gericht' && imgs[0]) {
        // the photographed dish becomes the recipe's picture
        const thumb = fitDataUrl(imgs[0], 720, 150000, true);
        if (okImg(thumb)) dishData.thumb = thumb;
      }
      finish(dishData, pages, kind);
    } catch (e) {
      st.perm = !!(e && e.code === 'not_granted');
      st.status = e && e.code === 'no_recipe'
        ? `Auf ${st.shots.length > 1 ? 'den Fotos' : 'dem Foto'} war kein Rezept zu erkennen${e.why ? ` (${e.why})` : ''}. Am besten mit mehr Licht und dem ganzen Rezept im Bild noch einmal versuchen.`
        : claudeError(e);
    } finally {
      clearInterval(st.timer);
      st.busy = false;
      st.ctl = null;
      if (UI.sheet === view) view.render();
    }
  }
  function finish(dishData, pages, kind) {
    const id = 'c' + Date.now().toString(36) + rid().slice(0, 3);
    const before = snapshot();
    S.custom[id] = dishData;
    persist(['dishes/' + id]);
    if (pages.length) savePhoto(id, { kind, pages, at: Date.now() });
    const uid = ctx.date ? addEntry(ctx.date, ctx.slot, id, null) : null;
    renderAll();
    const back = UI.opener;
    closeSheet({ instant: true });
    openRecipe(id, { uid, fresh: true }, back);
    haptic(18);
    toast(ctx.date ? `${dishData.t} angelegt und für ${dayName(ctx.date)} geplant` : `${dishData.t} ist jetzt im Kochbuch`, {
      undo: () => { closeSheet(); restore(before); cleanupPhotoLater(id); },
    });
  }
  openSheet(view, opener, { full: true, cls: 'scan' });
}

/* ---------- recipe from elsewhere: a link, pasted text or screenshots ---------- */
const URL_RE = /https?:\/\/[^\s"'<>]+/i;
// path parts that are not a dish: "recipes", "rezepte", "de-DE", "r145196" (Cookidoo links carry no name)
const URL_GENERIC = /^(recipes?|rezepte?|rezept|recette|ricetta|collection|collections|search|suche|r\d+|rs|s\d+|amp|print|[a-z]{2}(-[a-z]{2})?)$/i;
// "https://www.chefkoch.de/rezepte/123/Kuerbissuppe-mit-Ingwer.html" → "Kuerbissuppe mit Ingwer"
function nameFromUrl(u) {
  try {
    const segs = new URL(u).pathname.split('/').filter(Boolean).reverse();
    const seg = segs.map((x) => decodeURIComponent(x).replace(/\.(html?|php|aspx?)$/i, '')).find((x) => /[a-zäöüß]{3}/i.test(x) && !URL_GENERIC.test(x)) || '';
    return seg.replace(/[-_+]+/g, ' ').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
  } catch (e) { return ''; }
}
const isCookidoo = (u) => /(^|\.)cookidoo\.|thermomix\./i.test((() => { try { return new URL(u).hostname; } catch (e) { return ''; } })());
// a pasted share text is not a recipe: "Schau dir dieses Rezept an: Gulaschsuppe https://…"
const looksLikeRecipe = (t) => t.length >= 160 || t.split(/\n+/).filter((x) => x.trim()).length >= 4 || /\d+\s*(g|kg|ml|l|el|tl|stück|prise|dose|bund)\b/i.test(t);
function readPaste(text) {
  const link = safeUrl((String(text).match(URL_RE) || [])[0] || '');
  const rest = String(text).replace(URL_RE, '').trim();
  const linkOnly = !!link && !looksLikeRecipe(rest);
  const said = rest.replace(/^[^:]*(rezept|gefunden|schau|sieh|guck|probier)[^:]*:\s*/i, '').replace(/\s*[|–-]\s*(chefkoch|cookidoo)\b.*$/i, '').replace(/^[„“"']+|[„“"'.!]+$/g, '').trim();
  const name = !link ? '' : (linkOnly && said.length >= 3 && said.length <= 80 ? said : '') || nameFromUrl(link);
  return { link, rest, linkOnly, name, tm: !!link && isCookidoo(link) };
}
// screenshots for Claude: JPEG (also from HEIC where the browser can read it), long ones cut
// into a few readable pieces from top to bottom
function sliceCanvas(img, n) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (n <= 1) return [drawScaled(img, 2000, false)];
  const step = Math.ceil(h / n), overlap = Math.round(w * 0.06);
  return Array.from({ length: n }, (_, i) => {
    const y0 = Math.max(0, i * step - overlap), y1 = Math.min(h, (i + 1) * step + overlap);
    const k = Math.min(1, 2000 / Math.max(w, y1 - y0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round((y1 - y0) * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, y0, w, y1 - y0, 0, 0, c.width, c.height);
    return c;
  });
}
async function prepareShots(files, max) {
  const items = [];
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const img = await loadImg(url);
    URL.revokeObjectURL(url);
    if (img) items.push({ img, n: img.naturalHeight > img.naturalWidth * 1.9 ? Math.min(4, Math.ceil(img.naturalHeight / (img.naturalWidth * 1.4))) : 1 });
    else if (/^image\/(jpeg|png|webp|gif)$/.test(f.type)) items.push({ file: f, n: 1 });
    else throw { code: 'image_format' };
  }
  if (items.reduce((t, x) => t + x.n, 0) > max) for (const x of items) x.n = 1;
  const out = [];
  for (const x of items.slice(0, max)) {
    if (x.file) { out.push(x.file); continue; }
    for (const c of sliceCanvas(x.img, Math.min(x.n, max - out.length))) out.push((await jpegBlob(c, 0.85)) || x.img);
  }
  return { images: out.slice(0, max), sliced: items.some((x) => x.n > 1) };
}
function importPrompt(kind, people, body, sliced) {
  const head = kind === 'link'
    ? `Die Familie hat nur einen Link zu einem Rezept geschickt: ${body.link}
Du kannst die Seite nicht öffnen. Das Gericht heißt: "${body.name}" (in Adressen stehen Umlaute oft als ae, oe, ue und ss – bitte richtig schreiben).
${body.tm ? 'Es ist ein Thermomix-Rezept von Cookidoo: Schreibe ein typisches Thermomix-Rezept dafür, mit den Einstellungen in "tm".' : 'Schreibe dafür ein typisches, alltagstaugliches Rezept, so wie man es auf Chefkoch für dieses Gericht findet.'}`
    : `Du bekommst ein Rezept ${kind === 'shots' ? (sliced ? 'als Screenshot, in mehrere Bilder von oben nach unten geteilt' : 'als Screenshot(s)') : 'als kopierten Text'}, zum Beispiel von Chefkoch. Übernimm es möglichst genau: keine Zutaten erfinden oder weglassen.`;
  return `${head} Wandle es für Antom um, eine deutsche Familien-App zur Wochenplanung.
- Mengen auf ${persons(people)} umrechnen.
- Die Zubereitung in klaren Schritten schreiben. ${DEVICES} Wo es sinnvoll ist, schreibe Schritte für Backofen, Rösten oder Aufbacken auf den Cosori um (mit Temperatur, Minuten und wann geschüttelt wird) und Topf- und Pfannenschritte auf den Thermomix. Sonst "af": null und "tm": null.
- Werbung, Kommentare und Nährwerte weglassen.
Antworte nur mit JSON in genau diesem Format:
${RECIPE_JSON}
${RECIPE_RULES}${kind === 'text' ? `\n\nRezepttext:\n"""\n${body.text.slice(0, 12000)}\n"""` : ''}`;
}
function openImport(opener) {
  const st = { mode: prefs.get('impMode2', 'paste'), files: [], busy: false, status: '', perm: false, failed: false, ctl: null, q: '', text: '' };
  const hintFor = (text) => {
    const r = readPaste(text);
    if (r.linkOnly) {
      if (r.name) return `Link erkannt: „${r.name}“. Claude schreibt das Rezept nach diesem Namen – für das genaue Original lieber den Text oder einen Screenshot einfügen.`;
      return r.tm ? 'Cookidoo-Links verraten den Namen des Gerichts nicht. Bitte den Namen dazuschreiben – oder einen Screenshot vom Rezept nehmen, dann übernimmt Antom auch die Thermomix-Einstellungen genau.' : 'Aus diesem Link lässt sich kein Gericht erkennen. Bitte den Namen dazuschreiben oder den Rezepttext oder einen Screenshot einfügen.';
    }
    return 'Am einfachsten: den Link einfügen. Ganz genau wird es mit dem Rezepttext oder einem Screenshot.';
  };
  const view = {
    render() {
      const can = !!sampleFn;
      const shots = st.mode === 'shots' && UI.canImages;
      $('#sheet').innerHTML = `${sheetHead('Rezept übernehmen')}<div class="pad">
        <div class="imp-hero">${imgOf('scan-card', 'm')}<p>Von Chefkoch, Cookidoo oder jeder anderen Seite – Antom macht daraus ein Rezept mit Einkaufsliste und Schritten für Cosori und Thermomix.</p></div>
        ${UI.canImages ? `<div class="seg" role="tablist" aria-label="Art"><button type="button" role="tab" data-act="imp-mode" data-mode="paste" aria-selected="${!shots}">${icon('link')}Link oder Text</button><button type="button" role="tab" data-act="imp-mode" data-mode="shots" aria-selected="${shots}">${icon('image')}Screenshots</button></div>` : ''}
        ${shots
          ? `<label class="drop">${icon('image')}<span>Screenshots auswählen<br><small>Lange Screenshots teilt Antom automatisch.</small></span><input type="file" id="impFiles" accept="image/*" multiple></label><div class="thumbs" id="impThumbs"></div>`
          : `<label class="field">Link oder Rezepttext<textarea id="impText" rows="6" placeholder="Link (Chefkoch, Cookidoo …) oder Zutaten und Zubereitung hier einfügen …">${esc(st.text)}</textarea></label><p class="fine" id="impHint">${esc(hintFor(st.text))}</p>`}
        ${can
          ? `<button class="btn primary wide" type="button" data-act="imp-go"${st.busy ? ' disabled' : ''}>${icon('sparkle')}Mit Claude umwandeln</button>${st.busy ? '<button class="btn wide" type="button" data-act="imp-stop">Stopp</button>' : ''}${statusHTML(st)}${st.failed && !st.busy ? `<button class="btn wide" type="button" data-act="imp-manual">${icon('edit')}Selbst eintragen</button>` : ''}`
          : `<p class="tip">${icon('info')}<span>Zum automatischen Umwandeln Antom angemeldet bei Claude öffnen. Ihr könnt das Rezept aber auch selbst eintragen.</span></p><button class="btn primary wide" type="button" data-act="imp-manual">${icon('edit')}Selbst eintragen</button>`}
        <section class="step-box"><h3>${icon('search')}Auf Chefkoch suchen</h3>
          <div class="search-row"><label class="vh" for="ckQ">Suchbegriff</label><input id="ckQ" class="input" placeholder="z. B. Kürbissuppe" value="${esc(st.q)}" autocomplete="off"><a class="btn primary small" id="ckGo" href="${st.q ? chefkochUrl(st.q) : 'https://www.chefkoch.de/'}" target="_blank" rel="noopener">Suchen</a></div>
          <p class="fine">Öffnet Chefkoch in einem neuen Tab. Dort beim Rezept auf „Teilen“ und „Link kopieren“ tippen – und den Link oben einfügen.</p>
        </section>
      </div>`;
      const q = $('#ckQ'), go = $('#ckGo');
      q.addEventListener('input', () => { st.q = q.value; go.href = st.q.trim() ? chefkochUrl(st.q) : 'https://www.chefkoch.de/'; });
      const files = $('#impFiles');
      if (files) files.addEventListener('change', () => { st.files = Array.from(files.files || []).slice(0, 6); this.thumbs(); });
      const ta = $('#impText');
      if (ta) ta.addEventListener('input', () => { st.text = ta.value; const h = $('#impHint'); if (h) h.textContent = hintFor(st.text); });
      this.thumbs();
    },
    thumbs() {
      const box = $('#impThumbs');
      if (!box) return;
      box.innerHTML = '';
      for (const f of st.files) { const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(f); box.append(img); }
    },
    act(act, el) {
      if (act === 'imp-mode') { st.mode = el.dataset.mode; prefs.set('impMode2', st.mode); st.status = ''; this.render(); return true; }
      if (act === 'imp-stop') { if (st.ctl) st.ctl.abort(); return true; }
      if (act === 'imp-manual') {
        const r = readPaste(st.text);
        const back = UI.opener;
        closeSheet({ instant: true });
        openForm(null, back, { t: r.name, src: r.link, steps: r.rest ? [{ t: r.rest.slice(0, 1200), af: null }] : [{ t: '', af: null }] });
        return true;
      }
      if (act === 'imp-go') { convert(); return true; }
      return false;
    },
    onClose() { if (st.ctl) st.ctl.abort(); },
  };
  const say = (text) => { st.status = text; const p = $('#sheet .status'); if (p) p.textContent = text; };
  async function convert() {
    if (st.busy) return;
    const shots = st.mode === 'shots' && UI.canImages;
    const r = readPaste(st.text);
    if (shots && !st.files.length) { say('Bitte zuerst einen Screenshot wählen.'); return; }
    if (!shots && r.linkOnly && !r.name) { say(r.tm ? 'Cookidoo-Links verraten den Namen nicht. Bitte den Namen des Gerichts dazuschreiben oder einen Screenshot nehmen.' : 'Aus diesem Link lässt sich kein Gericht erkennen. Bitte den Namen dazuschreiben oder den Rezepttext oder einen Screenshot einfügen.'); return; }
    if (!shots && !r.linkOnly && st.text.trim().length < 30) { say('Bitte einen Link oder den Rezepttext (Zutaten und Zubereitung) einfügen.'); return; }
    const people = S.settings.people;
    st.ctl = new AbortController();
    const signal = st.ctl.signal;
    st.busy = true; st.perm = false; st.failed = false;
    st.status = shots ? 'Claude liest die Screenshots …' : r.linkOnly ? `Claude schreibt „${r.name}“ …` : 'Claude liest das Rezept …';
    view.render();
    if (shots) view.thumbs();
    try {
      let opts = { signal };
      let prompt;
      if (shots) {
        const prep = await prepareShots(st.files, maxShots());
        if (signal.aborted) throw { code: 'cancelled' };
        opts = { signal, images: prep.images };
        prompt = importPrompt('shots', people, null, prep.sliced);
      } else {
        prompt = r.linkOnly ? importPrompt('link', people, r) : importPrompt('text', people, { text: st.text.trim() });
      }
      const data = await askJSON(prompt, opts);
      const preset = fromClaude(data, people);
      if (!preset.ingPrev && !preset.steps) throw { code: 'no_recipe' };
      if (!preset.t) preset.t = (preset.name || r.name || 'Neues Rezept').split(/\s+/).slice(0, 4).join(' ');
      if (r.link) preset.src = r.link;
      st.busy = false; st.ctl = null;
      const back = UI.opener;
      closeSheet({ instant: true });
      openForm(null, back, preset);
      toast(r.linkOnly && !shots ? 'Nach dem Namen geschrieben – bitte kurz prüfen und sichern.' : 'Fertig! Bitte kurz durchlesen und sichern.');
    } catch (e) {
      st.busy = false; st.ctl = null;
      st.perm = !!(e && e.code === 'not_granted');
      st.failed = !(e && e.code === 'cancelled');
      st.status = e && e.code === 'no_recipe' ? 'Darin war kein Rezept zu erkennen. Bitte Zutaten und Zubereitung einfügen oder einen anderen Screenshot wählen.'
        : e && e.code === 'image_format' ? 'Dieses Bildformat lässt sich hier nicht lesen. Bitte einen Screenshot (PNG oder JPEG) wählen.'
        : claudeError(e);
      if (UI.sheet === view) { view.render(); if (shots) view.thumbs(); }
    }
  }
  openSheet(view, opener, { full: true });
}

/* ---------- Claude fills free days ---------- */
function openSuggest(opener) {
  const free = freeDays().map((d) => d.key);
  if (!free.length) { toast('Alle Tage dieser Woche haben schon ein Hauptessen.'); return; }
  const st = { busy: true, status: 'Claude stellt die Woche zusammen …', list: [], ctl: new AbortController(), perm: false };
  const view = {
    render() {
      $('#sheet').innerHTML = `${sheetHead('Vorschläge')}<div class="pad">
        <p class="lead">Aus eurem Kochbuch – abwechslungsreich, passend zur Jahreszeit und nichts, was es gerade erst gab.</p>
        ${st.list.length ? `<div class="group">${st.list.map((s, i) => { const d = dish(s.id); return `<div class="row sug">${thumbHTML(d)}<span class="grow"><span class="day-tag">${esc(dayName(s.key))}</span><b>${esc(d.t)}</b><small>${esc(s.why || '')}</small></span><button type="button" class="mini" data-act="sug-del" data-i="${i}" aria-label="Vorschlag für ${esc(dayName(s.key))} entfernen">${icon('x')}</button></div>`; }).join('')}</div>` : ''}
        ${statusHTML(st)}
        <div class="acts-col">${st.list.length ? `<button class="btn primary wide" type="button" data-act="sug-ok">${icon('check')}Übernehmen</button>` : ''}${st.busy ? '<button class="btn wide" type="button" data-act="sug-stop">Stopp</button>' : ''}</div>
      </div>`;
    },
    act(act, el) {
      if (act === 'sug-del') { st.list.splice(Number(el.dataset.i), 1); this.render(); return true; }
      if (act === 'sug-stop') { st.ctl.abort(); return true; }
      if (act === 'sug-ok') {
        const before = snapshot();
        for (const s of st.list) if (!dayPlan(s.key).h.length) addEntry(s.key, 'h', s.id, null);
        renderAll();
        closeSheet();
        toast(`${plural(st.list.length, 'Gericht', 'Gerichte')} eingeplant`, { undo: () => restore(before) });
        return true;
      }
      return false;
    },
    onClose() { st.ctl.abort(); },
  };
  openSheet(view, opener);
  const tk = todayKey();
  const book = allDishes().filter((d) => d.cat !== 'fruehstueck').map((d) => {
    const h = histOf(d.id);
    return `${d.id}: ${d.t} (${CAT[d.cat] || 'Gericht'}${d.time ? `, ${d.time} Min` : ''}${d.veg ? ', vegetarisch' : ''}${firstAf(d) ? ', Cosori' : ''}${tmCount(d) ? ', Thermomix' : ''}${S.favs[d.id] ? ', Lieblingsgericht' : ''}${h.last ? `, zuletzt vor ${dayDiff(tk, h.last)} Tagen` : ''})`;
  }).join('\n');
  const planned = weekDays(UI.week).map((d) => `${d.key} (${d.name}): ${dayPlan(d.key).h.map((e) => (dish(e.d) || {}).t).filter(Boolean).join(', ') || 'frei'}`).join('\n');
  const prompt = `Plane die Hauptessen für eine Familie (${persons(S.settings.people)}) aus ihrem eigenen Kochbuch. Monat: ${MONTHS[new Date().getMonth()]}.
Kochbuch (id: Name, Infos):
${book}
Diese Woche (Datum: Hauptessen):
${planned}
Schlage für genau diese freien Tage je ein Gericht vor: ${free.join(', ')}.
Regeln: nur ids aus dem Kochbuch; kein Gericht doppelt und keins, das schon in der Woche steht; möglichst nichts, was es in den letzten 10 Tagen gab; Lieblingsgerichte gern öfter; abwechslungsreich (nicht zweimal hintereinander Pasta oder Salat); unter der Woche eher schnell, am Wochenende gern aufwändiger; passend zur Jahreszeit.
Antworte nur mit JSON: {"vorschlaege":[{"tag":"${free[0]}","id":"caponata","grund":"kurzer Grund, höchstens 8 Wörter"}]}`;
  (async () => {
    try {
      const data = await askJSON(prompt, { signal: st.ctl.signal, cache: false });
      const used = new Set(weekDays(UI.week).flatMap((d) => dayPlan(d.key).h.map((e) => e.d)));
      const list = [];
      for (const v of (data && Array.isArray(data.vorschlaege) ? data.vorschlaege : [])) {
        const key = String((v && v.tag) || '').trim();
        const id = String((v && v.id) || '');
        if (!free.includes(key) || !dish(id) || used.has(id) || list.some((x) => x.key === key)) continue;
        used.add(id);
        list.push({ key, id, why: typeof v.grund === 'string' ? v.grund.slice(0, 80) : '' });
      }
      list.sort((a, b) => (a.key < b.key ? -1 : 1));
      st.list = list;
      st.status = list.length ? 'Einzelne Vorschläge könnt ihr vor dem Übernehmen entfernen.' : 'Claude hatte diesmal keinen passenden Vorschlag.';
    } catch (e) {
      st.status = claudeError(e);
      st.perm = !!(e && e.code === 'not_granted');
    } finally {
      st.busy = false;
      if (UI.sheet === view) view.render();
    }
  })();
}

/* ---------- week tools ---------- */
function copyBreakfasts() {
  const plan = copyBfPlan();
  if (!plan.length) return;
  const before = snapshot();
  let n = 0;
  for (const x of plan) { ensureDay(x.to).f = x.from.map((e) => Object.assign({}, e, { u: rid() })); n += x.from.length; }
  persist(dayPaths(...plan.map((x) => x.to)));
  renderAll();
  haptic(10);
  toast(`${n}× Frühstück übernommen`, { undo: () => restore(before) });
}
function openClearWeek(opener) {
  const tk = todayKey();
  const keys = weekDays(UI.week).map((d) => d.key).filter((k) => !isCurWeek() || k >= tk);
  const from = isCurWeek() ? 'ab heute' : weekLabel(UI.week) === 'Letzte Woche' ? 'der letzten Woche' : `der ${weekLabel(UI.week)}`;
  const clear = (all) => {
    const before = snapshot();
    for (const k of keys) { if (!S.days[k]) continue; S.days[k].h = []; if (all) S.days[k].f = []; pruneDay(k); }
    const wk = weekKey(UI.week);
    const paths = dayPaths(...keys);
    if (S.shops[wk]) { const sh = S.shops[wk]; sh.checked = {}; sh.need = {}; sh.extras = sh.extras.filter((x) => !x.done); paths.push('shop/' + wk); }
    persist(paths);
    renderAll();
    closeSheet();
    toast(all ? 'Woche geleert' : 'Hauptessen geleert', { undo: () => restore(before) });
  };
  confirmSheet(opener, {
    title: 'Woche leeren?',
    text: `Nimmt die Gerichte ${from} vom Plan und setzt die Häkchen der Einkaufsliste zurück. Die Rezepte bleiben im Kochbuch.`,
    icon: 'calendar',
    actions: [
      { act: 'clear-main', label: 'Nur Hauptessen – Frühstück bleibt', cls: 'primary', run: () => clear(false) },
      { act: 'clear-all', label: 'Alles leeren', cls: 'danger', run: () => clear(true) },
    ],
  });
}

/* ---------- settings ---------- */
function openSettings(opener) {
  openSheet({
    render() {
      const n = S.settings.people;
      const shareText = S.mode === 'shared'
        ? 'Alle, die dieses Antom bearbeiten dürfen, sehen dieselbe Woche, dieselben Rezepte und dieselbe Einkaufsliste. Änderungen erscheinen sofort auf allen Geräten.'
        : S.localReason === 'readonly'
          ? 'Ihr dürft den gemeinsamen Plan nur ansehen. Deshalb speichert Antom eure Änderungen auf diesem Gerät. Für einen gemeinsamen Plan braucht ihr Bearbeitungsrechte.'
          : window.ANTOM_STANDALONE
            ? 'Diese Antom-Datei speichert den Plan in diesem Browser auf diesem Gerät. Jedes Gerät hat seinen eigenen Plan – gemeinsam geht es über Antom in Claude.'
            : 'Antom speichert den Plan auf diesem Gerät. Geteilt wird er, wenn ihr Antom angemeldet bei Claude öffnet und Bearbeitungsrechte dafür habt.';
      $('#sheet').innerHTML = `${sheetHead('Einstellungen')}<div class="pad" style="gap:0">
        <div class="about"><img class="appicon" src="${photoUrl('icon', 'm')}" alt="" width="76" height="76"><h2>Antom</h2><p>Euer Wochenplan fürs Essen</p></div>
        <h3 class="sec-h">Haushalt</h3>
        <div class="group"><div class="row"><span class="row-ic" style="--tile:#34a853">${icon('users')}</span><span class="grow">Personen</span><span class="set-stepper"><span class="stepper"><button type="button" data-act="people" data-d="-1" aria-label="Eine Person weniger"${n <= 1 ? ' disabled' : ''}>${icon('minus')}</button><output aria-live="polite">${n}</output><button type="button" data-act="people" data-d="1" aria-label="Eine Person mehr"${n >= 12 ? ' disabled' : ''}>${icon('plus')}</button></span></span></div></div>
        <p class="sec-f">Standard für Einkaufsliste und Rezepte. Einzelne Tage passt ihr direkt im Rezept an.</p>
        <h3 class="sec-h">Speichern &amp; Teilen</h3>
        <div class="group"><div class="row"><span class="row-ic" style="--tile:${S.mode === 'shared' ? '#2f7ff0' : '#8e8e93'}">${icon(S.mode === 'shared' ? 'cloud' : 'phone')}</span><span class="grow">Gespeichert</span><span class="val" data-sync></span></div></div>
        <p class="sec-f">${esc(shareText)}</p>
        <h3 class="sec-h">Woche</h3>
        <div class="group" style="--inset:60px">
          ${copyBfPlan().length ? `<button type="button" class="row" data-act="copy-bf"><span class="row-ic" style="--tile:#ef9b0f">${icon('repeat')}</span><span class="grow">Frühstück wie letzte Woche</span></button>` : ''}
          <button type="button" class="row danger" data-act="clear-week"><span class="row-ic" style="--tile:#ff3b30">${icon('trash')}</span><span class="grow">Woche leeren …</span></button>
        </div>
        <h3 class="sec-h">Hilfe</h3>
        <div class="group"><button type="button" class="row" data-act="onboard"><span class="row-ic" style="--tile:var(--accent)">${icon('info')}</span><span class="grow">Einführung ansehen</span>${icon('chevron-right', 'chev')}</button></div>
        <h3 class="sec-h">Cosori-Grundregeln</h3>
        <ol class="group rules">${COSORI_RULES.map((r, i) => `<li><span class="n">${i + 1}</span><span>${esc(r)}</span></li>`).join('')}</ol>
        <h3 class="sec-h">Thermomix-Grundregeln</h3>
        <ol class="group rules tm">${TM_RULES.map((r, i) => `<li><span class="n">${i + 1}</span><span>${esc(r)}</span></li>`).join('')}</ol>
        <p class="sec-f" style="padding-bottom:8px">Die Rezepte sind für 2 Personen geschrieben, die Garzeiten für einen Cosori mit etwa 5,5 Litern und einen Thermomix TM5, TM6 oder TM7. Die Fotos hat Higgsfield erzeugt.</p>
      </div>`;
      renderChrome();
    },
    refresh() { const sh = $('#sheet'); const top = sh.scrollTop; this.render(); sh.scrollTop = top; },
    act(act, el) {
      if (act === 'onboard') { closeSheet({ instant: true }); showOnboarding(); return true; }
      if (act !== 'people') return false;
      S.settings.people = Math.min(12, Math.max(1, S.settings.people + Number(el.dataset.d)));
      persist(['meta/settings']);
      queueRender('plan', 'shop');
      this.refresh();
      return true;
    },
  }, opener, { full: true });
}

/* ---------- clipboard ---------- */
async function copyText(text, btn) {
  if (!text) { toast('Die Liste ist leer.'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast('Liste kopiert – jetzt z. B. in WhatsApp einfügen');
  } catch (e) {
    const back = UI.sheet ? UI.opener : btn;
    closeSheet({ instant: true });
    openSheet({
      render() {
        $('#sheet').innerHTML = `${sheetHead('Liste zum Kopieren')}<div class="pad"><p class="lead">Der Text ist markiert – jetzt kopieren und z. B. in WhatsApp einfügen.</p><textarea class="copy-fallback" readonly>${esc(text)}</textarea></div>`;
        const ta = $('#sheet textarea');
        setTimeout(() => { ta.focus(); ta.select(); }, 30);
      },
    }, back);
  }
}

/* ---------- toast ---------- */
let toastTimer = 0;
let undoFn = null;
function toast(msg, opts = {}) {
  const el = $('#toast');
  undoFn = opts.undo || null;
  el.innerHTML = `<span>${esc(msg)}</span>${undoFn ? `<button type="button" data-act="undo">${icon('undo')}Rückgängig</button>` : ''}`;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; undoFn = null; }, undoFn ? 6500 : 3200);
}

/* ---------- timer for a Cosori or Thermomix step ---------- */
const T = { iv: 0, end: 0, total: 0, label: '', key: '', dishId: '', kind: 'af', temp: 0, tm: null, shakes: [], fired: new Set(), audio: null, wake: null, done: false, paused: false, left: 0, alertUntil: 0 };
function beep(times = 1) {
  try {
    if (!T.audio) T.audio = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = T.audio;
    if (ctx.state === 'suspended') ctx.resume();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.35;
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.27);
    }
  } catch (e) { /* audio unavailable */ }
  try { if (navigator.vibrate) navigator.vibrate(times > 1 ? [200, 120, 200, 120, 200] : 200); } catch (e) { /* no vibration */ }
}
async function wakeOn() { try { if (navigator.wakeLock && !T.wake) T.wake = await navigator.wakeLock.request('screen'); } catch (e) { T.wake = null; } }
function wakeOff() { if (!$('#cook').hidden || T.iv) return; try { if (T.wake) T.wake.release(); } catch (e) { /* released */ } T.wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (T.iv || !$('#cook').hidden)) { T.wake = null; wakeOn(); } });
// what the Thermomix should show besides the time: "100 °C · Linkslauf · Stufe 1";
// in cook mode the temperature (or the speed without heat) is already shown big
const tmSub = (tm) => [tmTemp(tm.temp), tm.rev ? 'Linkslauf' : '', tmSpeed(tm.speed)].filter(Boolean).join(' · ');
const tmCookSub = (tm) => (tm.temp ? [tm.rev ? 'Linkslauf' : '', tmSpeed(tm.speed)].filter(Boolean).join(' · ') : tm.rev ? 'Linkslauf' : 'ohne Hitze');
function startTimer(d, step, key) {
  const af = step.af, tm = af ? null : step.tm;
  if (!af && !tm) return;
  try { if (!T.audio) T.audio = new (window.AudioContext || window.webkitAudioContext)(); if (T.audio.state === 'suspended') T.audio.resume(); } catch (e) { T.audio = null; }
  clearInterval(T.iv);
  const total = tm ? tm.sec : af.m * 60;
  Object.assign(T, {
    total, end: Date.now() + total * 1000, label: `${d.t} · ${(tm ? tm.label : af.label) || (tm ? 'Thermomix' : 'Cosori')}`, key, dishId: d.id,
    kind: tm ? 'tm' : 'af', temp: af ? af.c : 0, tm, shakes: af ? shakeList(af) : [], fired: new Set(), done: false, paused: false, alertUntil: 0,
  });
  T.iv = setInterval(tickTimer, 250);
  wakeOn();
  tickTimer();
  haptic(12);
  if ($('#cook').hidden) toast(tm ? `Timer läuft: ${tmLine(tm)}` : `Timer läuft: ${af.m} Min bei ${af.c} °C`);
}
function pauseTimer() {
  if (!T.iv && !T.paused) return;
  if (T.paused) { T.end = Date.now() + T.left * 1000; T.paused = false; T.iv = setInterval(tickTimer, 250); }
  else { T.left = Math.max(0, (T.end - Date.now()) / 1000); T.paused = true; clearInterval(T.iv); T.iv = 0; }
  tickTimer();
}
const mmss = (sec) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function timerState() {
  const left = T.paused ? T.left : (T.end - Date.now()) / 1000;
  const elapsed = T.total - left;
  const next = T.shakes.find((m) => !T.fired.has(m));
  const alert = T.alertUntil && Date.now() < T.alertUntil;
  return { left: Math.max(0, left), elapsed, next, alert };
}
function tickTimer() {
  if (!T.key) return;
  const { left, elapsed } = timerState();
  if (!T.paused && !T.done) {
    for (const m of T.shakes) if (elapsed >= m * 60 && !T.fired.has(m)) { T.fired.add(m); beep(1); T.alertUntil = Date.now() + 15000; }
    if (left <= 0) { T.done = true; beep(3); clearInterval(T.iv); T.iv = 0; }
  }
  const s = timerState();
  const info = T.done ? 'Fertig! Bitte nachsehen.' : s.alert ? 'Jetzt schütteln oder wenden!' : T.paused ? 'Pausiert' : s.next ? `Schütteln in ${mmss(s.next * 60 - s.elapsed)}` : T.kind === 'tm' ? tmSub(T.tm) : `${T.temp} °C`;
  const pill = $('#timer');
  const showPill = $('#cook').hidden;
  pill.hidden = !showPill;
  if (showPill) {
    pill.classList.toggle('alert', !!s.alert || T.done);
    pill.classList.toggle('tm', T.kind === 'tm');
    pill.innerHTML = `${T.kind === 'tm' ? `<span class="thumb tm-tile" aria-hidden="true">${icon('tm')}</span>` : thumbHTML({ img: 'ob-cosori', t: '' })}<div class="t-main" data-act="timer-open" role="button" tabindex="0" aria-label="Kochmodus öffnen"><span class="t-label">${esc(T.label)}</span><span class="t-time" role="timer">${T.done ? '0:00' : mmss(s.left)}</span><span class="t-next" aria-live="polite">${esc(info)}</span></div><div class="t-btns">${T.done ? '' : '<button type="button" data-act="timer-plus" aria-label="Eine Minute mehr">+1</button>'}<button type="button" data-act="timer-stop">${T.done ? 'OK' : 'Stopp'}</button></div>`;
  }
  const ring = $('#cook [data-ring]');
  if (ring && ring.dataset.ring === T.key) updateRing(ring, s, T.kind === 'tm' && !T.done && !T.paused ? tmCookSub(T.tm) : info);
}
function updateRing(ring, s, info) {
  const circ = 2 * Math.PI * 70;
  const prog = ring.querySelector('.prog');
  prog.style.strokeDasharray = String(circ);
  prog.style.strokeDashoffset = String(circ * (1 - (T.total ? s.left / T.total : 0)));
  ring.querySelector('.t b').textContent = T.done ? '0:00' : mmss(s.left);
  const fry = ring.closest('.fry');
  if (fry) {
    fry.classList.toggle('alert', !!s.alert || T.done);
    const lbl = fry.querySelector('[data-info]'); if (lbl) lbl.textContent = info;
    const btns = fry.querySelector('.fry-btns');
    if (btns) btns.innerHTML = T.done ? `<button type="button" data-act="timer-stop">${icon('check')}OK</button>` : `<button type="button" data-act="timer-pause">${icon(T.paused ? 'play' : 'pause', 'fill')}${T.paused ? 'Weiter' : 'Pause'}</button><button type="button" class="sec2" data-act="timer-plus">+1 Min</button>`;
  }
}
function stopTimer() {
  clearInterval(T.iv);
  Object.assign(T, { iv: 0, key: '', done: false, paused: false });
  $('#timer').hidden = true;
  wakeOff();
  if (!$('#cook').hidden) renderCook();
}

/* ---------- cook mode ---------- */
const C = { id: '', servings: 2, i: 0, ing: false };
function cookPages(d) { return [{ type: 'prep' }, ...d.steps.map((s, i) => ({ type: 'step', s, i }))]; }
function openCook(id, servings) {
  const d = dish(id);
  if (!d) return;
  Object.assign(C, { id, servings: servings || S.settings.people, i: 0, ing: false });
  const cook = $('#cook');
  cook.hidden = false;
  document.documentElement.classList.add('locked');
  renderCook();
  wakeOn();
  const btn = cook.querySelector('.cook-nav .go');
  if (btn) btn.focus({ preventScroll: true });
}
function closeCook() {
  $('#cook').hidden = true;
  $('#cook').innerHTML = '';
  if (!UI.sheet) document.documentElement.classList.remove('locked');
  wakeOff();
  if (T.key) tickTimer();
}
function renderCook() {
  const d = dish(C.id);
  if (!d) { closeCook(); return; }
  const pages = cookPages(d);
  C.i = Math.max(0, Math.min(pages.length - 1, C.i));
  const p = pages[C.i];
  const factor = C.servings / (d.sv || 2);
  let main = '';
  if (p.type === 'prep') {
    main = `<p class="cook-eyebrow">Bereitlegen · ${persons(C.servings)}</p><h2 class="cook-title">${esc(d.t)}</h2>
      <ul class="prep">${(d.ing || []).map((i, n) => { const q = scaleQ(i.q, i.u, factor, false); return `<li><label><input type="checkbox" id="prep-${n}"><span class="q">${esc(amountText(q, i.u))}</span><span>${esc(ingName(i, q))}${i.x ? ` (${esc(i.x)})` : ''}</span></label></li>`; }).join('')}</ul>`;
  } else {
    const af = p.s.af;
    const tm = af ? null : p.s.tm;
    const key = `${d.id}:${p.i}`;
    const active = T.key === key;
    const sh = shakeList(af);
    const ring = (label, unit) => `<div class="ring-big" data-ring="${esc(key)}"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="track" cx="80" cy="80" r="70"/><circle class="prog" cx="80" cy="80" r="70" style="stroke-dasharray:440;stroke-dashoffset:0"/></svg><div class="t"><b>${active ? '' : esc(label)}</b><small>${unit}</small></div></div>`;
    main = `<p class="cook-eyebrow">Schritt ${C.i} von ${pages.length - 1}</p>
      ${tm ? `<div class="fry tmx">
        ${ring(tm.sec < 60 ? String(tm.sec) : tmClock(tm.sec), tm.sec < 60 ? 'Sekunden' : 'Minuten')}
        <div class="fry-info"><span class="lbl">${icon('tm')}${esc(tm.label || 'Thermomix')}</span><span class="temp">${esc(tm.temp ? tmTemp(tm.temp) : tmSpeed(tm.speed))}</span><span class="lbl" data-info>${esc(tmCookSub(tm))}</span>
          <div class="fry-btns">${active || tm.sec < 60 ? '' : `<button type="button" data-act="cook-timer" data-step="${p.i}">${icon('play', 'fill')}Timer starten</button>`}</div></div>
      </div>` : ''}
      ${af ? `<div class="fry">
        <div class="ring-big" data-ring="${esc(key)}"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="track" cx="80" cy="80" r="70"/><circle class="prog" cx="80" cy="80" r="70" style="stroke-dasharray:440;stroke-dashoffset:0"/></svg><div class="t"><b>${active ? '' : `${esc(af.m)}:00`}</b><small>Minuten</small></div></div>
        <div class="fry-info"><span class="lbl">${esc(af.label || 'Cosori')}${af.pre ? ' · vorheizen' : ''}</span><span class="temp">${esc(af.c)} °C</span><span class="lbl" data-info>${sh.length ? `Schütteln nach ${sh.join(' & ')} Min` : 'Nicht schütteln nötig'}</span>
          <div class="fry-btns">${active ? '' : `<button type="button" data-act="cook-timer" data-step="${p.i}">${icon('play', 'fill')}Timer starten</button>`}</div></div>
      </div>` : ''}
      <p class="cook-step">${esc(p.s.t)}</p>`;
  }
  const bg = photoSrc(d, 'm');
  $('#cook').innerHTML = `<div class="cook-bg" style="background-image:url('${bg}')"></div><div class="cook-top"><button type="button" class="cbtn" data-act="cook-close" aria-label="Kochmodus beenden">${icon('x')}</button><div class="segs" aria-hidden="true">${pages.map((_, i) => `<i class="${i <= C.i ? 'on' : ''}"></i>`).join('')}</div><button type="button" class="cbtn" data-act="cook-ing" aria-label="Zutaten zeigen">${icon('list')}</button></div>
    <div class="cook-main"><div class="cook-inner">${main}</div></div>
    <div class="cook-nav"><button type="button" data-act="cook-prev"${C.i === 0 ? ' disabled' : ''}>${icon('chevron-left')}Zurück</button><button type="button" class="go" data-act="cook-next">${C.i === pages.length - 1 ? `${icon('check')}Fertig` : `Weiter${icon('chevron-right')}`}</button></div>
    ${C.ing ? `<div class="cook-ing"><div class="ih"><span>Zutaten für ${persons(C.servings)}</span><button type="button" class="cbtn" data-act="cook-ing" aria-label="Zutaten schließen">${icon('x')}</button></div><ul class="prep">${(d.ing || []).map((i) => { const q = scaleQ(i.q, i.u, factor, false); return `<li><label><span></span><span class="q">${esc(amountText(q, i.u))}</span><span>${esc(ingName(i, q))}</span></label></li>`; }).join('')}</ul></div>` : ''}`;
  if (T.key) tickTimer();
}
function cookAct(act, el) {
  const d = dish(C.id);
  if (act === 'cook-close') { closeCook(); return; }
  if (act === 'cook-ing') { C.ing = !C.ing; renderCook(); return; }
  if (act === 'cook-prev') { C.i--; C.ing = false; renderCook(); return; }
  if (act === 'cook-next') {
    if (C.i >= cookPages(d).length - 1) { closeCook(); toast('Guten Appetit!'); return; }
    C.i++; C.ing = false; renderCook(); return;
  }
  if (act === 'cook-timer') { const s = d.steps[Number(el.dataset.step)]; if (s && (s.af || s.tm)) { startTimer(d, s, `${d.id}:${el.dataset.step}`); renderCook(); } return; }
  if (act === 'timer-pause') { pauseTimer(); return; }
  if (act === 'timer-plus') { T.end += 60000; T.left += 60; T.total += 60; tickTimer(); return; }
  if (act === 'timer-stop') { stopTimer(); return; }
}
(() => {
  let x0 = null, y0 = 0;
  const cook = $('#cook');
  cook.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  cook.addEventListener('touchend', (e) => {
    if (x0 == null || C.ing) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) cookAct(dx < 0 ? 'cook-next' : 'cook-prev');
  });
})();

/* ---------- onboarding (first start on a device) ---------- */
const OB_KEY = 'antom.onboarded';
const OB = [
  { img: 'ob-tisch', t: 'Euer Essen für die ganze Woche', p: 'Frühstück und Hauptessen für jeden Tag – wie die Magnettafel am Kühlschrank, nur immer dabei.' },
  { img: 'scan-card', t: 'Rezepte einfach abfotografieren', p: 'Kochbuch, Zeitschrift oder Omas Rezeptkarte: Foto machen, Antom legt das Rezept an.' },
  { img: 'ob-einkauf', t: 'Die Einkaufsliste schreibt sich selbst', p: 'Alle Zutaten der Woche zusammengerechnet und nach Supermarkt-Abteilungen sortiert.' },
  { img: 'ob-cosori', t: 'Kochen mit Cosori und Thermomix', p: 'Jeder Schritt mit Temperatur, Zeit und Stufe – mit Timer, Linkslauf und Schüttel-Erinnerung.' },
];
function showOnboarding() {
  const box = $('#onboard');
  let page = 0;
  box.innerHTML = `<button type="button" class="capsule ob-skip" data-act="ob-done">Überspringen</button>
    <div class="ob-pages" id="obPages">${OB.map((o, i) => `<section class="ob-page" aria-label="${i + 1} von ${OB.length}"><div class="ob-photo">${imgOf(o.img, 'l', i ? ' loading="lazy"' : ' fetchpriority="high"')}</div><div class="ob-text">${i === 0 ? `<p class="ob-brand"><img src="${photoUrl('icon', 'm')}" alt="" width="26" height="26">Antom</p>` : ''}<h2>${esc(o.t)}</h2><p>${esc(o.p)}</p></div></section>`).join('')}</div>
    <div class="ob-foot"><div class="ob-dots" aria-hidden="true">${OB.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><button type="button" class="btn primary wide" data-act="ob-next">Weiter</button></div>`;
  box.hidden = false;
  box.classList.remove('out');
  document.documentElement.classList.add('locked');
  const pages = $('#obPages');
  const sync = () => {
    page = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
    $$('.ob-dots i', box).forEach((d, i) => d.classList.toggle('on', i === page));
    $('[data-act="ob-next"]', box).textContent = page >= OB.length - 1 ? 'Los geht’s' : 'Weiter';
  };
  pages.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  box.obNext = () => {
    if (page >= OB.length - 1) { hideOnboarding(); return; }
    pages.scrollTo({ left: (page + 1) * pages.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  setTimeout(() => { const h = $('.ob-text h2', box); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }, 50);
}
function hideOnboarding() {
  const box = $('#onboard');
  if (box.hidden) return;
  try { localStorage.setItem(OB_KEY, '1'); } catch (e) { /* storage unavailable */ }
  const done = () => { box.hidden = true; box.innerHTML = ''; if (!UI.sheet && $('#cook').hidden) document.documentElement.classList.remove('locked'); };
  if (reduceMotion) { done(); return; }
  box.classList.add('out');
  setTimeout(done, 420);
}
function maybeOnboard() {
  let seen = true;
  try { seen = !!localStorage.getItem(OB_KEY); } catch (e) { seen = true; }
  if (!seen) showOnboarding();
}

