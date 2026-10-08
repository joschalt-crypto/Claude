
/* ---------- dish model ---------- */
function normSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((s) => {
    if (Array.isArray(s)) return { t: String(s[1] || ''), af: s[0] || null };
    if (typeof s === 'string') return { t: s, af: null };
    return { t: String((s && s.t) || ''), af: (s && s.af) || null };
  }).filter((s) => s.t || s.af);
}
const BASE = {};
for (const d of BUILTIN) {
  BASE[d.id] = Object.assign({ b: '', note: '', sub: '', sv: 2, img: d.id, tip: '', veg: true, ck: d.t }, d, DISH_META[d.id] || {}, { steps: normSteps(d.steps), builtin: true });
}
const BUILTIN_IDS = BUILTIN.map((d) => d.id);

function dish(id) {
  const c = S.custom[id];
  if (c && c.deleted) return null;
  if (c) {
    const base = BASE[id];
    return Object.assign(
      { b: '', note: '', sub: '', sv: 2, tip: '', cat: 'haupt', ing: [], time: null, veg: false, ck: c.t },
      base ? { veg: base.veg, ck: base.ck } : {},
      c,
      { id, steps: normSteps(c.steps), img: base ? base.img : null, builtin: !!base, edited: !!base },
    );
  }
  return BASE[id] || null;
}
function allDishIds() {
  const ids = BUILTIN_IDS.filter((id) => !(S.custom[id] && S.custom[id].deleted));
  for (const id of Object.keys(S.custom)) if (!BASE[id] && !S.custom[id].deleted) ids.push(id);
  return ids;
}
const allDishes = () => allDishIds().map(dish).filter(Boolean);
const firstAf = (d) => { const s = d && d.steps.find((x) => x.af); return s ? s.af : null; };

/* photos: Higgsfield pictures for the cookbook, the scanned photo for a photographed dish,
   otherwise a laid table for the category with the dish's initial on the plate.
   The medium and small sizes are embedded (PHOTOS) and shown as blob URLs, so they never
   depend on the network; the large heroes come from the published files on top (data-big). */
const IMG_DIMS = { l: 'width="540" height="675"', m: 'width="540" height="675"', s: 'width="200" height="200"' };
const blobUrls = new Map();
function photoUrl(name, size) {
  const key = name + ':' + size;
  if (blobUrls.has(key)) return blobUrls.get(key);
  const p = PHOTOS[name];
  const b64 = p && (p[size] || p.m);
  if (!b64) return '';
  let url = '';
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  } catch (e) { url = 'data:image/webp;base64,' + b64; }
  blobUrls.set(key, url);
  return url;
}
const photoName = (d) => (d && d.img ? d.img : `ph-${d && CAT[d.cat] ? d.cat : 'haupt'}`);
function photoSrc(d, size) {
  if (d && okImg(d.thumb)) return d.thumb;
  return photoUrl(photoName(d), size === 's' ? 's' : 'm');
}
function photoHTML(d, size, eager) {
  const own = d && okImg(d.thumb);
  const name = photoName(d);
  const mono = d && !d.img && !own ? `<span class="mono" aria-hidden="true">${esc((d.t || '?').trim().charAt(0).toUpperCase())}</span>` : '';
  const big = size === 'l' && !own ? ` data-big="img/${name}.webp"` : '';
  return `<img src="${photoSrc(d, size)}" alt="" ${IMG_DIMS[size]}${eager ? '' : ' loading="lazy"'} decoding="async" draggable="false" data-name="${own ? 'foto' : name}"${big}>${mono}`;
}
const thumbHTML = (d, cls = '') => `<span class="thumb ${cls}">${photoHTML(d, 's')}</span>`;
const imgOf = (name, size, extra = '') => `<img src="${photoUrl(name, size === 's' ? 's' : 'm')}" alt="" ${IMG_DIMS[size]} decoding="async" draggable="false" data-name="${name}"${size === 'l' ? ` data-big="img/${name}.webp"` : ''}${extra}>`;

// sharper heroes: swap in the large published file once it has loaded; if files do not load
// in this view, stay with the embedded pictures (and note it once, see reportBig)
const BIG = { ok: 0, fail: 0, sent: false };
function upgradeBig() {
  if (BIG.fail >= 2 && !BIG.ok) return;
  for (const img of document.querySelectorAll('img[data-big]')) {
    const src = img.dataset.big;
    img.removeAttribute('data-big');
    const pre = new Image();
    pre.onload = () => { BIG.ok++; if (img.isConnected && pre.naturalWidth) img.src = src; reportBig(src); };
    pre.onerror = () => { BIG.fail++; reportBig(src); };
    pre.src = src;
  }
}
new MutationObserver(() => { if (document.querySelector('img[data-big]')) requestAnimationFrame(upgradeBig); }).observe(document.body, { childList: true, subtree: true });

/* ---------- quantities ---------- */
const FRAC = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
function fmtNum(q) {
  if (q == null || !isFinite(q)) return '';
  const whole = Math.floor(q + 1e-9);
  const rest = q - whole;
  if (rest < 0.05) return String(whole);
  if (rest > 0.95) return String(whole + 1);
  for (const [v, s] of FRAC) if (Math.abs(rest - v) < 0.05) return (whole ? String(whole) : '') + s;
  return String(Math.round(q * 10) / 10).replace('.', ',');
}
function scaleQ(q, u, factor, shopping) {
  if (q == null) return null;
  let v = q * factor;
  if (u === 'g' || u === 'ml') v = v >= 100 ? Math.round(v / 10) * 10 : v >= 20 ? Math.round(v / 5) * 5 : Math.max(1, Math.round(v));
  else if (shopping && COUNTABLE.has(u || '')) v = Math.max(1, Math.ceil(v - 0.05));
  return v;
}
function amountText(q, u) {
  if (q == null) return '';
  const dec = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  if (u === 'g' && q >= 1000) return dec(q / 1000) + ' kg';
  if (u === 'ml' && q >= 1000) return dec(q / 1000) + ' l';
  const unit = !u ? '' : (q > 1 ? (UNIT_PL[u] || u) : u);
  return fmtNum(q) + (unit ? ' ' + unit : '');
}
const ingName = (i, q) => (!i.u && q != null && q > 1 && i.pl ? i.pl : i.n);
const ingKey = (i) => i.n.trim().toLowerCase() + '|' + (i.u || '');
const persons = (n) => plural(n, 'Person', 'Personen');

