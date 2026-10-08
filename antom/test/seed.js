// A realistic shared plan for screenshots and tests, laid on the current calendar week,
// with last week and a few older dishes as cooking history.
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = (offset) => dkey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));
const WD = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const DAY = Object.fromEntries(WD.map((k, i) => [k, day(i)]));            // this week
const LAST = Object.fromEntries(WD.map((k, i) => [k, day(i - 7)]));       // last week
const NEXT = Object.fromEntries(WD.map((k, i) => [k, day(i + 7)]));       // next week
const TODAY = WD[(now.getDay() + 6) % 7];
// ISO week of the current week, the key of its shopping list (shop/<YYYY-Www>)
const thu = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
const kw = 1 + Math.floor(Math.round((thu - new Date(thu.getFullYear(), 0, 1)) / 86400000) / 7);
const WEEK = `${thu.getFullYear()}-W${pad(kw)}`;
const e = (d, u) => ({ u: u || d + Math.random().toString(36).slice(2, 6), d });

const SEED = {
  [`days/${DAY.mo}`]: { f: [e('joghurt', 'u-mo-f')], h: [e('bolo', 'u-mo-h')] },
  [`days/${DAY.di}`]: { f: [e('joghurt', 'u-di-f')], h: [e('caponata', 'u-di-h')] },
  [`days/${DAY.mi}`]: { f: [e('bircher', 'u-mi-f')], h: [e('tikka', 'u-mi-h')] },
  [`days/${DAY.do}`]: { f: [e('porridge', 'u-do-f')], h: [] },
  [`days/${DAY.fr}`]: { f: [e('bircher', 'u-fr-f')], h: [e('fisch', 'u-fr-h')] },
  [`days/${DAY.sa}`]: { f: [e('porridge', 'u-sa-f')], h: [e('linsen', 'u-sa-h')] },
  [`days/${DAY.so}`]: { f: [e('joghurt', 'u-so-f')], h: [] },
  [`days/${LAST.mo}`]: { f: [e('joghurt')], h: [e('risotto')] },
  [`days/${LAST.di}`]: { f: [e('bircher')], h: [e('asianudeln')] },
  [`days/${LAST.mi}`]: { f: [e('joghurt')], h: [] },
  [`days/${LAST.fr}`]: { f: [e('porridge')], h: [e('zitronenpasta')] },
  [`days/${LAST.so}`]: { f: [e('bircher')], h: [e('pizza')] },
  [`days/${day(-29)}`]: { f: [], h: [e('ricotta')] },
  [`days/${day(-36)}`]: { f: [], h: [e('quinoa')] },
  [`days/${day(-40)}`]: { f: [], h: [e('pizza')] },
  'meta/favs': { ids: { pizza: 3, tikka: 2, joghurt: 1 } },
};
const seedScript = (extra = '', seed = SEED) => `window.__seed = ${JSON.stringify(seed)};${extra}`;
module.exports = { SEED, DAY, LAST, NEXT, TODAY, WD, WEEK, day, seedScript };
