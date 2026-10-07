// A realistic shared week for screenshots and tests.
const e = (d, u) => ({ u: u || d + Math.random().toString(36).slice(2, 6), d });
const SEED = {
  'plan/mo': { f: [e('joghurt', 'u-mo-f')], h: [e('bolo', 'u-mo-h')] },
  'plan/di': { f: [e('joghurt', 'u-di-f')], h: [e('caponata', 'u-di-h')] },
  'plan/mi': { f: [e('bircher', 'u-mi-f')], h: [e('tikka', 'u-mi-h')] },
  'plan/do': { f: [e('porridge', 'u-do-f')], h: [] },
  'plan/fr': { f: [e('bircher', 'u-fr-f')], h: [e('fisch', 'u-fr-h')] },
  'plan/sa': { f: [e('porridge', 'u-sa-f')], h: [e('linsen', 'u-sa-h')] },
  'plan/so': { f: [e('joghurt', 'u-so-f')], h: [] },
};
module.exports = { SEED, seedScript: (extra = '') => `window.__seed = ${JSON.stringify(SEED)};${extra}` };
