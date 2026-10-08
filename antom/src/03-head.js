<script>
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 9);
const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wideMQ = matchMedia('(min-width: 1000px)');
const phoneMQ = matchMedia('(max-width: 699px)');
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const prefs = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('antom.prefs') || '{}') || {}; } catch (e) { p = {}; }
  return {
    get: (k, d) => (k in p ? p[k] : d),
    set: (k, v) => { p[k] = v; try { localStorage.setItem('antom.prefs', JSON.stringify(p)); } catch (e) { /* storage unavailable */ } },
  };
})();
const okImg = (v) => typeof v === 'string' && v.length < 300000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v);
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : '');
const chefkochUrl = (q) => `https://www.chefkoch.de/rs/s0/${encodeURIComponent(String(q || '').trim()).replace(/%20/g, '+')}/Rezepte.html`;
const haptic = (ms = 10) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no vibration */ } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- dates: plans are stored per calendar day ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const todayKey = () => dkey(new Date());
const thisMonday = () => mondayOf(new Date());
const dayDiff = (a, b) => Math.round((fromKey(a) - fromKey(b)) / 86400000);
function isoWeek(monday) {
  const thu = addDays(monday, 3);
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  return { year: thu.getFullYear(), kw: 1 + Math.floor(Math.round((thu - jan1) / 86400000) / 7) };
}
const weekKey = (monday) => { const w = isoWeek(monday); return `${w.year}-W${pad2(w.kw)}`; };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;

/* ---------- vocabulary ---------- */
const DAYS = [
  { k: 'mo', short: 'Mo', name: 'Montag' }, { k: 'di', short: 'Di', name: 'Dienstag' }, { k: 'mi', short: 'Mi', name: 'Mittwoch' },
  { k: 'do', short: 'Do', name: 'Donnerstag' }, { k: 'fr', short: 'Fr', name: 'Freitag' }, { k: 'sa', short: 'Sa', name: 'Samstag' },
  { k: 'so', short: 'So', name: 'Sonntag' },
];
const SLOTS = [{ k: 'f', name: 'Frühstück' }, { k: 'h', name: 'Hauptessen' }];
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.k, s]));
const CATS = [['fruehstueck', 'Frühstück'], ['haupt', 'Hauptgerichte'], ['leicht', 'Salate & Brotzeit'], ['suess', 'Süßes & Shakes']];
const CAT = Object.fromEntries(CATS);
const AISLES = [
  ['obst', 'Obst & Gemüse', 'leaf', '#34a853'], ['brot', 'Brot & Backwaren', 'bread', '#c9782c'], ['kuehl', 'Kühlregal', 'milk', '#2f7ff0'],
  ['fleisch', 'Fleisch & Fisch', 'fish', '#e5484d'], ['trocken', 'Nudeln, Reis & Getreide', 'wheat', '#c79a1d'], ['konserve', 'Dosen, Gläser & Saucen', 'can', '#8b5cf6'],
  ['backen', 'Backen, Nüsse & Süßes', 'nut', '#9a6b47'], ['gewuerz', 'Gewürze, Öl & Essig', 'spice', '#ef6c1a'], ['tk', 'Tiefkühl', 'snow', '#24a8d8'],
  ['getraenke', 'Getränke', 'glass', '#5b5bd6'], ['sonst', 'Sonstiges', 'bag', '#8e8e93'],
];
const AISLE = Object.fromEntries(AISLES.map(([k, l]) => [k, l]));
const AISLE_ICON = Object.fromEntries(AISLES.map(([k, , i]) => [k, i]));
const AISLE_COLOR = Object.fromEntries(AISLES.map(([k, , , c]) => [k, c]));
const UNIT_PL = { Dose: 'Dosen', Kugel: 'Kugeln', Zehe: 'Zehen', Scheibe: 'Scheiben', Stange: 'Stangen', Packung: 'Packungen', Rolle: 'Rollen', Knolle: 'Knollen', Topf: 'Töpfe', Glas: 'Gläser', Prise: 'Prisen' };
const COUNTABLE = new Set(['', 'Stück', 'Bund', 'Dose', 'Pck', 'Kugel', 'Topf', 'Rolle', 'Kästchen', 'Becher', 'Glas', 'Packung', 'Knolle']);
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const FILTERS = [['alle', 'Alle'], ['fav', 'Favoriten'], ['fruehstueck', 'Frühstück'], ['haupt', 'Hauptgerichte'], ['leicht', 'Salate & Brotzeit'], ['suess', 'Süßes'], ['veg', 'Vegetarisch'], ['quick', 'Bis 20 Min'], ['cosori', 'Mit Cosori'], ['tm', 'Mit Thermomix'], ['eigene', 'Eigene']];

const dayOf = (date) => DAYS[(date.getDay() + 6) % 7];
const dayName = (key) => dayOf(fromKey(key)).name;
const dateShort = (date) => `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}`;
const dateLong = (date) => `${dayOf(date).name}, ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
const dateMid = (key) => { const d = fromKey(key); return `${dayOf(d).short}., ${dateShort(d)}`; };
function weekRange(monday) {
  const a = monday, b = addDays(monday, 6);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}.–${b.getDate()}. ${MONTHS[b.getMonth()]}`
    : `${a.getDate()}. ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()}. ${MONTHS_SHORT[b.getMonth()]}`;
}
function weekLabel(monday) {
  const diff = Math.round((monday - thisMonday()) / (7 * 86400000));
  if (diff === 0) return 'Diese Woche';
  if (diff === 1) return 'Nächste Woche';
  if (diff === -1) return 'Letzte Woche';
  return `KW ${isoWeek(monday).kw}`;
}
function weekDays(monday) {
  return DAYS.map((d, i) => { const date = addDays(monday, i); return Object.assign({}, d, { i, date, key: dkey(date) }); });
}
// "heute", "vor 3 Tagen", "vor 2 Wochen" … for the cooking history
function relDay(key) {
  const n = dayDiff(key, todayKey());
  if (n === 0) return 'heute';
  if (n === -1) return 'gestern';
  if (n === 1) return 'morgen';
  if (n < 0 && n > -7) return `vor ${-n} Tagen`;
  if (n <= -7 && n > -63) { const w = Math.floor(-n / 7); return w === 1 ? 'vor einer Woche' : `vor ${w} Wochen`; }
  if (n > 1 && n < 7) return `am ${dayName(key)}`;
  return `am ${dateShort(fromKey(key))}`;
}

