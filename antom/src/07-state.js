
/* ---------- state ---------- */
const S = { mode: 'loading', ready: false, days: {}, custom: {}, shops: {}, favs: {}, settings: { people: 2 }, dragging: false };
const UI = { tab: 'plan', week: thisMonday(), builtWeek: null, sheet: null, opener: null, query: '', filter: 'alle', shelfQuery: '', canImages: false, imgLimits: null, shopRange: prefs.get('shopRange', 'rest') };
const EMPTY_DAY = Object.freeze({ f: Object.freeze([]), h: Object.freeze([]) });
const dayPlan = (k) => S.days[k] || EMPTY_DAY;
const ensureDay = (k) => S.days[k] || (S.days[k] = { f: [], h: [] });
function pruneDay(k) { const p = S.days[k]; if (p && !p.f.length && !p.h.length) delete S.days[k]; }
const emptyShop = () => ({ checked: {}, need: {}, extras: [] });
const shopOf = (wk) => S.shops[wk] || emptyShop();
const ensureShop = (wk) => S.shops[wk] || (S.shops[wk] = emptyShop());
const isCurWeek = () => +UI.week === +thisMonday();

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.d !== 'string') return null;
  const out = { u: typeof e.u === 'string' ? e.u : rid(), d: e.d };
  const s = Number(e.s);
  if (s >= 1 && s <= 20) out.s = Math.round(s);
  return out;
}
function sanitizeDay(v) {
  const o = { f: [], h: [] };
  if (v && typeof v === 'object') for (const k of ['f', 'h']) if (Array.isArray(v[k])) o[k] = v[k].map(sanitizeEntry).filter(Boolean);
  return o;
}
function sanitizeDays(v) {
  const out = {};
  if (v && typeof v === 'object') for (const k of Object.keys(v)) if (DATE_RE.test(k)) { const d = sanitizeDay(v[k]); if (d.f.length || d.h.length) out[k] = d; }
  return out;
}
function sanitizeShop(v) {
  const o = emptyShop();
  if (!v || typeof v !== 'object') return o;
  if (v.checked && typeof v.checked === 'object') for (const k of Object.keys(v.checked)) if (v.checked[k]) o.checked[k] = true;
  if (v.need && typeof v.need === 'object') for (const k of Object.keys(v.need)) if (v.need[k]) o.need[k] = true;
  if (Array.isArray(v.extras)) o.extras = v.extras.filter((x) => x && typeof x.t === 'string').map((x) => ({ id: String(x.id || rid()), t: x.t.slice(0, 120), done: !!x.done }));
  return o;
}
function sanitizeShops(v) {
  const out = {};
  if (v && typeof v === 'object') for (const k of Object.keys(v)) if (WEEK_RE.test(k)) out[k] = sanitizeShop(v[k]);
  return out;
}
function sanitizeSettings(v) {
  const n = Number(v && v.people);
  return { people: n >= 1 && n <= 12 ? Math.round(n) : 2 };
}
function sanitizeFavs(v) {
  const out = {};
  const ids = v && typeof v === 'object' && v.ids && typeof v.ids === 'object' ? v.ids : {};
  for (const k of Object.keys(ids)) if (ids[k]) out[k] = Number(ids[k]) || 1;
  return out;
}
// the old plan was one week of weekdays ({ mo: { f, h }, … }); it becomes the days of a calendar week
function daysFromWeekPlan(plan, monday) {
  const out = {};
  for (const d of weekDays(monday)) {
    const v = plan && plan[d.k];
    if (!v) continue;
    const day = { f: [], h: [] };
    for (const s of ['f', 'h']) day[s] = (Array.isArray(v[s]) ? v[s] : []).map((e) => sanitizeEntry(typeof e === 'string' ? { d: e } : e)).filter(Boolean);
    if (day.f.length || day.h.length) out[d.key] = day;
  }
  return out;
}
function findEntry(uid) {
  for (const key of Object.keys(S.days)) for (const s of SLOTS) {
    const i = S.days[key][s.k].findIndex((e) => e.u === uid);
    if (i >= 0) return { key, slot: s.k, index: i, entry: S.days[key][s.k][i] };
  }
  return null;
}

/* ---------- history: what was cooked when (planned days up to today) ---------- */
let HIST = null;
const histDirty = () => { HIST = null; };
function hist() {
  if (HIST) return HIST;
  const today = todayKey();
  const cutoff = dkey(addDays(new Date(), -90));
  const m = new Map();
  for (const k of Object.keys(S.days).sort()) {
    const p = S.days[k];
    for (const e of p.f.concat(p.h)) {
      let h = m.get(e.d);
      if (!h) m.set(e.d, (h = { last: '', next: '', n90: 0, dates: [] }));
      if (h.dates[h.dates.length - 1] !== k) h.dates.push(k);
      if (k <= today) { h.last = k; if (k >= cutoff) h.n90++; }
      else if (!h.next) h.next = k;
    }
  }
  HIST = m;
  return m;
}
const NO_HIST = Object.freeze({ last: '', next: '', n90: 0, dates: Object.freeze([]) });
const histOf = (id) => hist().get(id) || NO_HIST;

/* ---------- storage: shared db when the viewer may write, else this device ---------- */
const LS_KEY = 'antom.v4';
const LS_OLD = 'antom.v1';
const store = { db: null, unsub: [], queue: new Map(), lsTimer: 0 };
function lsLoad(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function lsSave() {
  clearTimeout(store.lsTimer);
  store.lsTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ days: S.days, custom: S.custom, shops: S.shops, favs: S.favs, settings: S.settings })); } catch (e) { /* storage unavailable */ }
  }, 150);
}
function startLocal(reason) {
  S.mode = 'local';
  S.localReason = reason || 'device';
  const monday = thisMonday();
  const saved = lsLoad(LS_KEY);
  const old = saved ? null : lsLoad(LS_OLD);
  if (saved) {
    S.days = sanitizeDays(saved.days);
    S.custom = saved.custom && typeof saved.custom === 'object' ? saved.custom : {};
    S.shops = sanitizeShops(saved.shops);
    S.favs = sanitizeFavs({ ids: saved.favs });
    S.settings = sanitizeSettings(saved.settings);
  } else if (old && old.plan) {
    S.days = daysFromWeekPlan(old.plan, monday);
    S.custom = old.custom && typeof old.custom === 'object' ? old.custom : {};
    S.shops = old.shop ? { [weekKey(monday)]: sanitizeShop(old.shop) } : {};
    S.settings = sanitizeSettings(old.settings);
    lsSave();
  } else {
    S.days = daysFromWeekPlan(STARTER, monday);
  }
  S.ready = true;
  histDirty();
  renderAll();
}
function startShared(db) {
  S.mode = 'shared';
  store.db = db;
  const got = { days: false, meta: false, dishes: false };
  const fail = (err) => onDbError(err);
  const sub = (col, fn) => store.unsub.push(db.collection(col).onSnapshot(fn, fail));
  const settle = () => {
    if (S.ready || !got.days || !got.meta || !got.dishes) return;
    S.ready = true;
    migrateShared();
  };
  sub('days', (snap) => {
    const out = {};
    for (const doc of snap.docs) if (DATE_RE.test(doc.id)) { const v = sanitizeDay(clone(doc.data())); if (v.f.length || v.h.length) out[doc.id] = v; }
    S.days = out;
    histDirty();
    got.days = true;
    settle();
    queueRender('plan', 'shop', 'book');
  });
  sub('dishes', (snap) => {
    const c = {};
    for (const doc of snap.docs) c[doc.id] = clone(doc.data());
    S.custom = c;
    got.dishes = true;
    settle();
    queueRender('plan', 'book', 'shop');
  });
  sub('meta', (snap) => {
    for (const doc of snap.docs) {
      if (doc.id === 'settings') S.settings = sanitizeSettings(clone(doc.data()));
      if (doc.id === 'favs') S.favs = sanitizeFavs(clone(doc.data()));
      if (doc.id === 'shop') S.legacyShop = sanitizeShop(clone(doc.data()));
    }
    got.meta = true;
    settle();
    queueRender('plan', 'book', 'shop');
  });
  sub('shop', (snap) => {
    const out = {};
    for (const doc of snap.docs) if (WEEK_RE.test(doc.id)) out[doc.id] = sanitizeShop(clone(doc.data()));
    S.shops = out;
    queueRender('shop');
  });
  renderAll();
}
// Antom 3 kept one week of weekdays in plan/<mo…so> and the list in meta/shop.
// Move that onto the calendar days of the current week once, then tidy up.
async function migrateShared() {
  if (Object.keys(S.days).length || !store.db) return;
  let snap = null;
  try { snap = await store.db.collection('plan').get(); } catch (e) { return; }
  const docs = (snap && snap.docs) || [];
  if (!docs.length && !S.legacyShop) return;
  const monday = thisMonday();
  const old = {};
  for (const doc of docs) old[doc.id] = clone(doc.data());
  const days = daysFromWeekPlan(old, monday);
  if (Object.keys(S.days).length) return; // someone else was quicker
  Object.assign(S.days, days);
  const paths = Object.keys(days).map((k) => 'days/' + k);
  const wk = weekKey(monday);
  if (S.legacyShop && !S.shops[wk]) { S.shops[wk] = S.legacyShop; paths.push('shop/' + wk); }
  persist(paths);
  renderAll();
  for (const doc of docs) store.db.doc('plan/' + doc.id).delete().catch(() => {});
  if (S.legacyShop) store.db.doc('meta/shop').delete().catch(() => {});
  S.legacyShop = null;
}
// one note per device in the shared database: do the published photo files load in this view?
function reportBig(src) {
  if (BIG.sent || S.mode !== 'shared' || !store.db || window.antomWeb) return; // only the artifact view needs this note
  BIG.sent = true;
  let dev = prefs.get('dev', '');
  if (!dev) { dev = rid() + rid(); prefs.set('dev', dev); }
  const doc = { v: 5, at: Date.now(), ok: BIG.ok, fail: BIG.fail, src, page: location.origin + location.pathname, base: String(document.baseURI || '').replace(/[?#].*$/, ''), ua: String(navigator.userAgent || '').slice(0, 180) };
  try { store.db.doc('diag/' + dev).set(doc).catch(() => {}); } catch (e) { /* not important */ }
}
function onDbError(err) {
  const code = err && err.code;
  if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
    toLocal('Der Familienplan ist gerade nicht erreichbar. Änderungen bleiben auf diesem Gerät.');
  }
}
function toLocal(message) {
  if (S.mode === 'local') return;
  for (const u of store.unsub) { try { u(); } catch (e) { /* already closed */ } }
  store.unsub = [];
  S.mode = 'local';
  S.localReason = 'readonly';
  S.ready = true;
  lsSave();
  renderAll();
  if (message) toast(message);
}
function docData(path) {
  const [col, id] = path.split('/');
  if (col === 'days') { const p = S.days[id]; return p && (p.f.length || p.h.length) ? clone(p) : null; }
  if (col === 'shop') { const v = S.shops[id]; return v && (Object.keys(v.checked).length || Object.keys(v.need).length || v.extras.length) ? clone(v) : null; }
  if (col === 'meta' && id === 'settings') return clone(S.settings);
  if (col === 'meta' && id === 'favs') return { ids: clone(S.favs) };
  if (col === 'dishes') return S.custom[id] ? clone(S.custom[id]) : null;
  return undefined;
}
function persist(paths) {
  if (paths.some((p) => p.startsWith('days/'))) histDirty();
  if (S.mode === 'local') { lsSave(); return; }
  if (S.mode !== 'shared') return;
  for (const p of new Set(paths)) {
    let w = store.queue.get(p);
    if (!w) store.queue.set(p, (w = { busy: false, dirty: false }));
    w.dirty = true;
    if (!w.busy) pump(p, w);
  }
}
async function pump(path, w) {
  w.busy = true;
  let retried = false;
  while (w.dirty && S.mode === 'shared') {
    w.dirty = false;
    const data = docData(path);
    if (data === undefined) continue;
    try {
      const ref = store.db.doc(path);
      if (data === null) await ref.delete(); else await ref.set(data);
      retried = false;
    } catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') {
        toLocal('Für den gemeinsamen Plan fehlen dir die Bearbeitungsrechte. Änderungen werden jetzt auf diesem Gerät gespeichert.');
        break;
      }
      if (code === 'quota_exceeded') { toast('Der Speicher ist voll. Bitte ein paar eigene Rezepte löschen.'); continue; }
      if (!retried) { retried = true; w.dirty = true; await sleep(500 + Math.random() * 900); continue; }
      toast('Speichern hat gerade nicht geklappt. Bitte gleich noch einmal versuchen.');
    }
  }
  w.busy = false;
}
const dayPaths = (...keys) => keys.map((k) => 'days/' + k);

/* ---------- mutations ---------- */
function snapshot() { return { days: clone(S.days), custom: clone(S.custom), shops: clone(S.shops), favs: clone(S.favs) }; }
function restore(snap) {
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  const paths = [];
  for (const k of new Set([...Object.keys(S.days), ...Object.keys(snap.days)])) if (!same(S.days[k], snap.days[k])) paths.push('days/' + k);
  for (const id of new Set([...Object.keys(S.custom), ...Object.keys(snap.custom)])) if (!same(S.custom[id], snap.custom[id])) paths.push('dishes/' + id);
  for (const k of new Set([...Object.keys(S.shops), ...Object.keys(snap.shops)])) if (!same(S.shops[k], snap.shops[k])) paths.push('shop/' + k);
  if (!same(S.favs, snap.favs)) paths.push('meta/favs');
  S.days = snap.days; S.custom = snap.custom; S.shops = snap.shops; S.favs = snap.favs;
  persist(paths);
  renderAll();
}
function addEntry(key, slot, dishId, index) {
  const list = ensureDay(key)[slot];
  const at = index == null || index < 0 || index > list.length ? list.length : index;
  const entry = { u: rid(), d: dishId };
  list.splice(at, 0, entry);
  persist(dayPaths(key));
  return entry.u;
}
function moveEntry(uid, key, slot, index) {
  const f = findEntry(uid);
  if (!f) return;
  S.days[f.key][f.slot].splice(f.index, 1);
  const list = ensureDay(key)[slot];
  const at = index == null || index < 0 || index > list.length ? list.length : index;
  list.splice(at, 0, f.entry);
  pruneDay(f.key);
  persist(dayPaths(f.key, key));
}
function removeEntry(uid) {
  const f = findEntry(uid);
  if (!f) return null;
  S.days[f.key][f.slot].splice(f.index, 1);
  pruneDay(f.key);
  persist(dayPaths(f.key));
  return f;
}
function toggleFav(id) {
  if (S.favs[id]) delete S.favs[id]; else S.favs[id] = Date.now();
  persist(['meta/favs']);
  haptic(8);
  return !!S.favs[id];
}

