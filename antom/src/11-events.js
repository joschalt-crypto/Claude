
/* ---------- events ---------- */
const backTo = (a) => (UI.sheet ? UI.opener : a);
document.addEventListener('click', (e) => {
  const t = e.target;
  const tab = t.closest('.tabbar [data-tab], .side-nav [data-tab]');
  if (tab) { setTab(tab.dataset.tab); return; }
  if (t.closest('#scrim')) { closeSheet(); return; }
  if (t.closest('#viewer')) { closeViewer(); return; }
  const a = t.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'undo') { const fn = undoFn; undoFn = null; $('#toast').hidden = true; if (fn) fn(); return; }
  if (act === 'ob-next') { const box = $('#onboard'); if (box.obNext) box.obNext(); return; }
  if (act === 'ob-done') { hideOnboarding(); return; }
  if (act === 'timer-stop') { stopTimer(); return; }
  if (act === 'timer-plus') { T.end += 60000; T.left += 60; T.total += 60; tickTimer(); return; }
  if (act === 'timer-open') { if (T.dishId && dish(T.dishId)) { openCook(T.dishId, S.settings.people); const idx = Number(T.key.split(':')[1]); if (idx >= 0) { C.i = idx + 1; renderCook(); } } return; }
  if (a.closest('#cook')) { cookAct(act, a); return; }
  if (act === 'close') { closeSheet(); return; }
  if (a.closest('#sheet') && UI.sheet && UI.sheet.act && UI.sheet.act(act, a, e)) return;
  switch (act) {
    case 'open-dish': if (!dragGuard()) openRecipe(a.dataset.dish, null, a); return;
    case 'open-entry': if (!dragGuard()) openEntry(a.dataset.uid, a); return;
    case 'pick': { const back = backTo(a); closeSheet({ instant: true }); openPicker(a.dataset.date, a.dataset.slot, back, !!a.dataset.choose); return; }
    case 'cook': { const f = a.dataset.uid && findEntry(a.dataset.uid); openCook(a.dataset.dish, (f && f.entry.s) || S.settings.people); return; }
    case 'goto-day': { const el = $(`#day-${a.dataset.date}`); if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); return; }
    case 'week-prev': setWeek(addDays(UI.week, -7)); return;
    case 'week-next': setWeek(addDays(UI.week, 7)); return;
    case 'week-today': setWeek(thisMonday()); return;
    case 'filter': UI.filter = a.dataset.f; renderBook(); if (a.closest('.sec-title')) $('#v-book').scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); return;
    case 'new-dish': { const back = backTo(a); closeSheet({ instant: true }); openForm(null, back, { t: a.dataset.title || '' }); return; }
    case 'import': { const back = backTo(a); closeSheet({ instant: true }); openImport(back); return; }
    case 'scan': {
      if (!canScan()) return;
      const back = backTo(a);
      closeSheet({ instant: true });
      openScan(back, a.dataset.date ? { date: a.dataset.date, slot: a.dataset.slot } : {});
      return;
    }
    case 'photo-view': { const src = (photoCache.get(a.dataset.id) || [])[Number(a.dataset.i)]; if (okImg(src)) openViewer(src); return; }
    case 'suggest': if (sampleFn) { const back = backTo(a); closeSheet({ instant: true }); openSuggest(back); } return;
    case 'settings': openSettings(a); return;
    case 'perm': openPermissions(); return;
    case 'clear-week': { const back = backTo(a); closeSheet({ instant: true }); openClearWeek(back); return; }
    case 'copy-bf': closeSheet(); copyBreakfasts(); return;
    case 'copy-week': copyText(weekListText(), a); return;
    case 'shop-range': UI.shopRange = a.dataset.r; prefs.set('shopRange', UI.shopRange); renderShop(); renderChrome(); return;
    case 'clear-checked': {
      const before = snapshot();
      const wk = weekKey(UI.week);
      const sh = ensureShop(wk);
      sh.checked = {}; sh.extras = sh.extras.filter((x) => !x.done);
      persist(['shop/' + wk]); renderShop(); renderChrome();
      toast('Erledigte entfernt', { undo: () => restore(before) });
      return;
    }
    case 'need': { const wk = weekKey(UI.week); ensureShop(wk).need[a.dataset.key] = true; persist(['shop/' + wk]); renderShop(); renderChrome(); return; }
    case 'unneed': { e.preventDefault(); const wk = weekKey(UI.week); const sh = ensureShop(wk); delete sh.need[a.dataset.key]; delete sh.checked[a.dataset.key]; persist(['shop/' + wk]); renderShop(); renderChrome(); return; }
    case 'del-extra': { e.preventDefault(); const wk = weekKey(UI.week); const sh = ensureShop(wk); sh.extras = sh.extras.filter((x) => x.id !== a.dataset.id); persist(['shop/' + wk]); renderShop(); renderChrome(); return; }
    default:
  }
});
function afterCheck(input) {
  const row = input.closest('.item');
  if (input.checked) haptic(8);
  if (row && input.checked && !reduceMotion) { row.classList.add('leaving'); setTimeout(() => { renderShop(); renderChrome(); }, 300); }
  else { renderShop(); renderChrome(); }
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-act="toggle-item"]')) {
    const wk = weekKey(UI.week);
    const sh = ensureShop(wk);
    if (t.checked) sh.checked[t.dataset.key] = true; else delete sh.checked[t.dataset.key];
    persist(['shop/' + wk]);
    afterCheck(t);
  } else if (t.matches('[data-scan-add]')) {
    const files = Array.from(t.files || []);
    t.value = '';
    if (files.length && UI.sheet && UI.sheet.add) UI.sheet.add(files);
  } else if (t.matches('[data-act="toggle-extra"]')) {
    const wk = weekKey(UI.week);
    const x = ensureShop(wk).extras.find((i) => i.id === t.dataset.id);
    if (x) { x.done = t.checked; persist(['shop/' + wk]); afterCheck(t); }
  }
});
document.addEventListener('toggle', (e) => {
  const el = e.target;
  if (el.matches && el.matches('[data-fold]')) prefs.set(el.dataset.fold, el.open);
}, true);
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'extraForm') return;
  e.preventDefault();
  const input = $('#extraInput');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const wk = weekKey(UI.week);
  ensureShop(wk).extras.push({ id: rid(), t: text.slice(0, 120), done: false });
  persist(['shop/' + wk]);
  input.value = '';
  renderShop(); renderChrome();
  const again = $('#extraInput'); if (again) again.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (closeViewer()) return;
    if (!$('#onboard').hidden) { hideOnboarding(); return; }
    if (!$('#cook').hidden) { if (C.ing) { C.ing = false; renderCook(); } else closeCook(); return; }
    if (UI.sheet) { closeSheet(); return; }
  }
  if (!$('#cook').hidden && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('input, textarea')) { cookAct(e.key === 'ArrowRight' ? 'cook-next' : 'cook-prev'); return; }
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && t.dataset.act && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
});
$('#bookSearch').addEventListener('input', (e) => { UI.query = e.target.value; renderBook(); });
$('#shelfSearch').addEventListener('input', (e) => { UI.shelfQuery = e.target.value; renderShelf(); });
phoneMQ.addEventListener('change', () => { if (!phoneMQ.matches) document.documentElement.classList.remove('sheet-deep'); });
// a new day starts while the app stays open: move "today" along
let lastDay = todayKey();
setInterval(() => { if (todayKey() !== lastDay) { const wasCur = +UI.week === +mondayOf(fromKey(lastDay)); lastDay = todayKey(); if (wasCur) UI.week = thisMonday(); histDirty(); UI.builtWeek = null; renderAll(); } }, 60000);

/* ---------- boot ---------- */
document.documentElement.lang = 'de';
for (const el of $$('img[data-photo]')) el.src = photoUrl(el.dataset.photo, 'm');
initSortables();
renderAll();
maybeOnboard();

(async () => {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') { startLocal('device'); return; }
  c.use('sample').then(async (fn) => {
    sampleFn = typeof fn === 'function' ? fn : null;
    if (sampleFn && typeof sampleFn.limits === 'function') {
      try { const lim = await sampleFn.limits(); UI.canImages = !!(lim && lim.images); UI.imgLimits = (lim && lim.images) || null; } catch (e) { UI.canImages = false; }
    }
    queueRender('plan', 'book');
  }).catch(() => { sampleFn = null; });
  let db = null, user = null;
  try { [db, user] = await Promise.all([c.use('db'), c.use('user').catch(() => null)]); } catch (e) { db = null; }
  if (!db) { startLocal('device'); return; }
  let can = null;
  try { can = user && typeof user.can === 'function' ? await user.can('data.write') : null; } catch (e) { can = null; }
  if (can === false) { startLocal('readonly'); return; }
  startShared(db);
})();
})();
</script>
