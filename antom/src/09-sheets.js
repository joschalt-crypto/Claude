
/* ---------- sheets ---------- */
let closeTimer = 0;
function openSheet(view, opener, opts = {}) {
  const sheet = $('#sheet');
  clearTimeout(closeTimer);
  const show = (noAnim) => {
    UI.opener = opener || document.activeElement;
    UI.sheet = view;
    UI.sheetOpts = opts;
    sheet.className = 'sheet' + (opts.full ? ' full' : '') + (opts.plain ? ' plain' : '') + (opts.cls ? ' ' + opts.cls : '') + (noAnim ? ' no-anim' : '');
    sheet.style.transform = '';
    view.render();
    sheet.hidden = false;
    const scrim = $('#scrim');
    scrim.hidden = false;
    scrim.classList.remove('out');
    document.documentElement.classList.add('locked');
    document.documentElement.classList.toggle('sheet-deep', !!opts.full && phoneMQ.matches);
    sheet.scrollTop = 0;
    sheet.classList.remove('is-scrolled');
    const h = sheet.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  };
  const src = opts.from;
  if (src && document.startViewTransition && !reduceMotion) {
    UI.vtSrc = src;
    src.style.viewTransitionName = 'dish-photo';
    const t = document.startViewTransition(() => {
      src.style.viewTransitionName = '';
      show(true);
      const hero = $('#sheet .r-hero img');
      if (hero) hero.style.viewTransitionName = 'dish-photo';
    });
    t.finished.finally(() => { const hero = $('#sheet .r-hero img'); if (hero) hero.style.viewTransitionName = ''; });
  } else {
    UI.vtSrc = null;
    show(false);
  }
}
function closeSheet(opts = {}) {
  const view = UI.sheet;
  if (!view) return;
  UI.sheet = null;
  if (view.onClose) view.onClose();
  const opener = UI.opener;
  const sheet = $('#sheet');
  const finish = () => {
    if (UI.sheet) return; // a follow-up sheet already took over
    sheet.hidden = true;
    sheet.innerHTML = '';
    sheet.className = 'sheet';
    sheet.style.transform = '';
    $('#scrim').hidden = true;
    if ($('#cook').hidden && $('#onboard').hidden) document.documentElement.classList.remove('locked');
    if (!opts.instant && opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };
  document.documentElement.classList.remove('sheet-deep');
  const src = UI.vtSrc;
  const hero = $('#sheet .r-hero img');
  UI.vtSrc = null;
  if (opts.instant) { finish(); return; }
  if (src && hero && document.contains(src) && document.startViewTransition && !reduceMotion && sheet.scrollTop < 40) {
    hero.style.viewTransitionName = 'dish-photo';
    const t = document.startViewTransition(() => { hero.style.viewTransitionName = ''; finish(); src.style.viewTransitionName = 'dish-photo'; });
    t.finished.finally(() => { src.style.viewTransitionName = ''; });
    return;
  }
  if (reduceMotion) { finish(); return; }
  sheet.classList.add('out');
  $('#scrim').classList.add('out');
  closeTimer = setTimeout(finish, 300);
}
const sheetHead = (title, opts = {}) => `<div class="sh-head"><div class="grabber" aria-hidden="true"></div><div class="sh-bar"><span class="l">${opts.left || ''}</span><h2 id="sheetTitle">${esc(title)}</h2><span class="r">${opts.right === undefined ? `<button type="button" class="xbtn" data-act="close" aria-label="Schließen">${icon('x')}</button>` : opts.right}</span></div></div>`;

// sheet scroll: hairline under the header, glass bar over the recipe photo, gentle parallax
$('#sheet').addEventListener('scroll', () => {
  const sh = $('#sheet');
  const top = sh.scrollTop;
  const hero = sh.querySelector('.r-hero');
  const limit = hero ? hero.offsetHeight - 70 : 4;
  sh.classList.toggle('is-scrolled', top > limit);
  if (hero && !reduceMotion) {
    const img = hero.firstElementChild;
    if (img) img.style.transform = top < 0 ? `scale(${1 + -top / hero.offsetHeight})` : `translateY(${Math.min(top, hero.offsetHeight) * 0.38}px)`;
  }
}, { passive: true });

// swipe a sheet down to dismiss it (phones)
(() => {
  const sheet = $('#sheet');
  let y0 = 0, x0 = 0, dy = 0, t0 = 0, armed = false, dragging = false;
  sheet.addEventListener('touchstart', (e) => {
    if (!phoneMQ.matches || e.touches.length !== 1 || sheet.classList.contains('scan')) { armed = false; return; }
    if (e.target.closest('input, textarea, select, .hscroll, .daygrid, .scan-strip')) { armed = false; return; }
    armed = sheet.scrollTop <= 0;
    dragging = false;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = Date.now();
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!armed) return;
    const y = e.touches[0].clientY - y0, x = e.touches[0].clientX - x0;
    if (!dragging) {
      if (y > 8 && y > Math.abs(x) * 1.2 && sheet.scrollTop <= 0) { dragging = true; sheet.classList.add('dragging'); }
      else if (Math.abs(y) > 8 || Math.abs(x) > 8) { armed = false; return; }
    }
    if (dragging) {
      e.preventDefault();
      dy = Math.max(0, y);
      sheet.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (!dragging) { armed = false; return; }
    dragging = false; armed = false;
    sheet.classList.remove('dragging');
    const v = dy / Math.max(1, Date.now() - t0);
    if (dy > 140 || v > 0.6) {
      sheet.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
      sheet.style.transform = 'translateY(105%)';
      setTimeout(() => { sheet.style.transition = ''; closeSheet({ swiped: true }); }, 260);
      $('#scrim').classList.add('out');
      document.documentElement.classList.remove('sheet-deep');
    } else {
      sheet.classList.add('settle');
      sheet.style.transform = '';
      setTimeout(() => sheet.classList.remove('settle'), 360);
    }
  });
})();

/* dish detail */
function openEntry(uid, opener) {
  const f = findEntry(uid);
  if (!f) return;
  if (!dish(f.entry.d)) {
    const before = snapshot();
    removeEntry(uid);
    renderAll();
    toast('Gelöschtes Rezept vom Plan genommen', { undo: () => restore(before) });
    return;
  }
  openRecipe(f.entry.d, { uid }, opener);
}
function shakeList(af) {
  if (!af || !af.sh) return [];
  return (Array.isArray(af.sh) ? af.sh : [af.sh]).map(Number).filter((n) => n > 0 && n < af.m);
}
function afChips(af) {
  const sh = shakeList(af);
  return `<span class="tchip hot">${icon('flame')}${esc(af.c)} °C</span><span class="tchip">${icon('clock')}${esc(af.m)} Min</span>${af.pre ? '<span class="tchip">vorheizen</span>' : ''}${sh.length ? `<span class="tchip">${icon('shake')}schütteln nach ${sh.join(' & ')} Min</span>` : ''}`;
}
function histLine(id, key) {
  const h = histOf(id);
  const today = todayKey();
  const before = h.dates.filter((k) => k <= today && (!key || k < key)).pop();
  const next = h.dates.find((k) => k > today && k !== key);
  const parts = [];
  if (before) parts.push(`zuletzt ${relDay(before)}`);
  if (next) parts.push(`wieder geplant ${relDay(next)}`);
  if (h.n90 > 1) parts.push(`${h.n90}× in 3 Monaten`);
  if (!parts.length) return '';
  const s = parts.join(' · ');
  return `<p class="hist">${icon('clock')}<span>${esc(s.charAt(0).toUpperCase() + s.slice(1))}</span></p>`;
}
function openRecipe(id, ctx, opener) {
  if (!dish(id)) return;
  const uid = ctx && ctx.uid;
  const f0 = uid ? findEntry(uid) : null;
  const d0 = dish(id);
  const st = {
    id, tab: prefs.get('rtab2', 'ing'), servings: (f0 && f0.entry.s) || S.settings.people, picking: false,
    pickSlot: f0 ? f0.slot : d0.cat === 'fruehstueck' ? 'f' : 'h',
    pickWeek: f0 ? mondayOf(fromKey(f0.key)) : (UI.week < thisMonday() ? thisMonday() : UI.week),
    got: new Set(),
  };
  const view = {
    render() {
      const d = dish(st.id);
      const f = uid ? findEntry(uid) : null;
      if (!d || (uid && !f)) { closeSheet(); return; }
      const af = firstAf(d);
      const fav = !!S.favs[d.id];
      const otherWeek = f && +mondayOf(fromKey(f.key)) !== +thisMonday();
      const eyebrow = f ? `${dayName(f.key)}${otherWeek ? `, ${dateShort(fromKey(f.key))}` : ''} · ${SLOT[f.slot].name}` : (CAT[d.cat] || 'Gericht');
      $('#sheet').innerHTML = `
        <div class="r-top">
          <button type="button" class="gbtn" data-act="close" aria-label="Schließen">${icon('chevron-down')}</button>
          <div class="r-top-t" aria-hidden="true">${esc(d.t)}</div>
          <div class="r-top-r"><button type="button" class="gbtn${fav ? ' on' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Aus den Favoriten nehmen' : 'Zu den Favoriten'}">${icon('heart', fav ? 'fill' : '')}</button><button type="button" class="gbtn" data-act="r-edit" aria-label="Rezept bearbeiten">${icon('edit')}</button></div>
        </div>
        <div class="r-hero">${photoHTML(d, 'l', true)}</div>
        <div class="r-body" style="--c:var(--cat-${catOf(d)})">
          <p class="r-eyebrow">${esc(eyebrow)}</p>
          <h2 class="r-title" id="sheetTitle">${esc(d.t)}</h2>
          ${d.name && d.name !== d.t ? `<p class="r-name">${esc(d.name)}</p>` : ''}
          ${d.note ? `<p class="r-note">${icon('pin')}${esc(d.note)}</p>` : ''}
          ${ctx && ctx.fresh ? `<p class="fresh">${icon('sparkle')}<span>Aus deinem Foto angelegt. Bitte kurz prüfen – mit dem Stift oben lässt sich alles ändern.</span></p>` : ''}
          <div class="facts">
            <div class="fact"><small>Zeit</small><b>${d.time ? `${esc(d.time)} Min` : '–'}</b></div>
            <div class="fact"><small>Personen</small><div class="stepper"><button type="button" data-act="sv" data-d="-1" aria-label="Eine Person weniger"${st.servings <= 1 ? ' disabled' : ''}>${icon('minus')}</button><b aria-live="polite">${st.servings}</b><button type="button" data-act="sv" data-d="1" aria-label="Eine Person mehr"${st.servings >= 12 ? ' disabled' : ''}>${icon('plus')}</button></div></div>
            <div class="fact${af ? ' hot' : ''}"><small>Cosori</small><b>${af ? `${esc(af.c)} °C` : '–'}</b></div>
          </div>
          ${histLine(d.id, f && f.key)}
          ${f && st.servings !== S.settings.people ? `<p class="fine">Gilt für ${esc(dayName(f.key))} und zählt so in die Einkaufsliste.</p>` : ''}
          <div class="seg r-seg" role="tablist" aria-label="Ansicht">
            <button type="button" role="tab" data-act="rtab" data-tab="ing" aria-selected="${st.tab === 'ing'}">${icon('list')}Zutaten</button>
            <button type="button" role="tab" data-act="rtab" data-tab="steps" aria-selected="${st.tab === 'steps'}">${icon('pot')}Zubereitung</button>
          </div>
          <div class="pane" role="tabpanel">${st.tab === 'ing' ? ingPane(d, st) : stepsPane(d, st.servings)}</div>
          <div class="r-bar">${st.picking ? pickPanel(f, st.pickSlot, st.pickWeek) : f
            ? `<div class="r-acts"><button class="btn" type="button" data-act="r-pick">${icon('move')}<span class="lbl">Verschieben</span></button><button class="btn sq danger" type="button" data-act="r-remove" aria-label="Vom Plan nehmen">${icon('trash')}</button><button class="btn primary" type="button" data-act="r-cook">${icon('play', 'fill')}Kochen</button></div>`
            : `<div class="r-acts"><button class="btn" type="button" data-act="r-pick">${icon('calendar')}<span class="lbl">In den Plan</span></button><button class="btn primary" type="button" data-act="r-cook">${icon('play', 'fill')}Kochen</button></div>`}</div>
        </div>`;
      if (d.photo && st.tab === 'steps' && !photoCache.has(d.id)) loadPhoto(d.id).then(() => { if (UI.sheet === view) view.refresh(); });
    },
    refresh() {
      const sh = $('#sheet');
      const top = sh.scrollTop;
      sh.classList.add('no-anim');
      this.render();
      sh.scrollTop = top;
      sh.dispatchEvent(new Event('scroll'));
    },
    act(act, el) {
      const d = dish(st.id);
      const f = uid ? findEntry(uid) : null;
      if (act === 'rtab') { st.tab = el.dataset.tab; prefs.set('rtab2', st.tab); this.refresh(); return true; }
      if (act === 'fav') { const on = toggleFav(d.id); queueRender('plan', 'book'); this.refresh(); toast(on ? `${d.t} ist jetzt ein Favorit` : `${d.t} aus den Favoriten genommen`); return true; }
      if (act === 'ing-got') { const i = Number(el.dataset.i); if (st.got.has(i)) st.got.delete(i); else st.got.add(i); el.classList.toggle('got', st.got.has(i)); return true; }
      if (act === 'sv') {
        st.servings = Math.min(12, Math.max(1, st.servings + Number(el.dataset.d)));
        if (f) {
          if (st.servings === S.settings.people) delete f.entry.s; else f.entry.s = st.servings;
          persist(dayPaths(f.key));
          queueRender('plan', 'shop');
        }
        this.refresh();
        return true;
      }
      if (act === 'r-pick') { st.picking = true; this.refresh(); const sh = $('#sheet'); sh.scrollTop = sh.scrollHeight; return true; }
      if (act === 'pick-cancel') { st.picking = false; this.refresh(); return true; }
      if (act === 'pp-slot') { st.pickSlot = el.dataset.slot; this.refresh(); return true; }
      if (act === 'pp-week') { st.pickWeek = addDays(st.pickWeek, 7 * Number(el.dataset.d)); this.refresh(); return true; }
      if (act === 'pp-day') {
        const key = el.dataset.date;
        const before = snapshot();
        const where = `${dayName(key)}, ${dateShort(fromKey(key))} · ${SLOT[st.pickSlot].name}`;
        if (f) { moveEntry(uid, key, st.pickSlot, null); toast(`${d.t} → ${where}`, { undo: () => restore(before) }); }
        else { addEntry(key, st.pickSlot, d.id, null); toast(`${d.t}: ${where}`, { undo: () => restore(before) }); }
        haptic(10);
        renderAll();
        closeSheet();
        return true;
      }
      if (act === 'r-remove') {
        const before = snapshot();
        removeEntry(uid);
        toast(`${d.t} vom Plan genommen`, { undo: () => restore(before) });
        renderAll();
        closeSheet();
        return true;
      }
      if (act === 'r-edit') { const back = UI.opener; closeSheet({ instant: true }); openForm(st.id, back); return true; }
      if (act === 'r-cook') { openCook(st.id, st.servings); return true; }
      if (act === 'copy-dish') { copyText(dishListText(d, st.servings), el); return true; }
      if (act === 'timer') { const s = d.steps[Number(el.dataset.step)]; if (s && s.af) startTimer(d, s.af, `${d.id}:${el.dataset.step}`); return true; }
      return false;
    },
  };
  const from = opener && opener.querySelector ? opener.querySelector('.thumb img, .ph img, .hero > img') : null;
  openSheet(view, opener, { full: true, plain: true, from });
}
function pickPanel(f, slot, wk) {
  const tk = todayKey();
  return `<div class="pick">
    <div class="pick-head"><b>${f ? 'Verschieben nach …' : 'Wann gibt es das?'}</b><button type="button" class="link" data-act="pick-cancel">Abbrechen</button></div>
    <div class="seg" role="radiogroup" aria-label="Mahlzeit">${SLOTS.map((s) => `<button type="button" role="radio" data-act="pp-slot" data-slot="${s.k}" aria-checked="${slot === s.k}">${icon(s.k === 'f' ? 'sun' : 'fork')}${s.name}</button>`).join('')}</div>
    <div class="pick-week"><button type="button" class="rbtn" data-act="pp-week" data-d="-1" aria-label="Vorige Woche">${icon('chevron-left')}</button><span>${esc(weekLabel(wk))} · ${esc(weekRange(wk))}</span><button type="button" class="rbtn" data-act="pp-week" data-d="1" aria-label="Nächste Woche">${icon('chevron-right')}</button></div>
    <div class="daygrid">${weekDays(wk).map((x) => {
      const here = f && f.key === x.key && f.slot === slot;
      return `<button type="button" class="daybtn${x.key === tk ? ' is-today' : ''}${here ? ' is-here' : ''}${x.key < tk ? ' is-past' : ''}" data-act="pp-day" data-date="${x.key}" aria-label="${x.name}, ${dateShort(x.date)}"><small>${x.short}</small><b>${x.date.getDate()}</b></button>`;
    }).join('')}</div>
  </div>`;
}
function groupedIngredients(d, servings) {
  const factor = servings / (d.sv || 2);
  const reg = new Map();
  const pantry = [];
  for (const i of d.ing || []) {
    const row = Object.assign({}, i, { qty: scaleQ(i.q, i.u, factor, true) });
    if (i.p) { pantry.push(row); continue; }
    const s = AISLE[i.s] ? i.s : 'sonst';
    if (!reg.has(s)) reg.set(s, []);
    reg.get(s).push(row);
  }
  return { reg, pantry };
}
function ingPane(d, st) {
  if (!d.ing || !d.ing.length) return '<p class="lead">Für dieses Rezept sind noch keine Zutaten eingetragen. Über den Stift oben könnt ihr sie ergänzen.</p>';
  const factor = st.servings / (d.sv || 2);
  return `<div class="pane-h"><h3>Für ${persons(st.servings)}</h3><button type="button" class="link" data-act="copy-dish">${icon('copy', 'sm')} Einkaufsliste kopieren</button></div>
    <ul class="ing">${d.ing.map((i, n) => {
      const q = scaleQ(i.q, i.u, factor, false);
      return `<li class="${i.p ? 'pan' : ''}${st.got.has(n) ? ' got' : ''}" data-act="ing-got" data-i="${n}"><span class="q">${esc(amountText(q, i.u))}</span><span>${esc(ingName(i, q))}${i.x ? ` <small>(${esc(i.x)})</small>` : ''}${i.p ? ' <small>· Vorrat</small>' : ''}</span></li>`;
    }).join('')}</ul>
    <p class="ing-note">Antippen zum Abhaken. „Vorrat“ ist meist zu Hause und steht nur bei Bedarf auf der Einkaufsliste.</p>`;
}
function dishListText(d, servings) {
  const { reg, pantry } = groupedIngredients(d, servings);
  const lines = [`${d.name || d.t} – Einkauf für ${persons(servings)}`];
  for (const [k, label] of AISLES) {
    const list = reg.get(k);
    if (!list) continue;
    lines.push('', label);
    for (const i of list) lines.push('• ' + itemLine(i));
  }
  if (pantry.length) { lines.push('', 'Vorrat prüfen'); for (const i of pantry) lines.push('• ' + itemLine(i)); }
  return lines.join('\n');
}
function stepsPane(d, servings) {
  const factor = servings / (d.sv || 2);
  const afs = d.steps.filter((s) => s.af);
  const fry = afs.length ? `<section class="fry-sum">${thumbHTML({ img: 'ob-cosori', t: '' })}<div><h3>Im Cosori</h3><ol>${afs.map((s) => `<li><b>${esc(s.af.c)} °C · ${esc(s.af.m)} Min</b> – ${esc(s.af.label || 'Garen')}${shakeList(s.af).length ? `, schütteln nach ${shakeList(s.af).join(' & ')} Min` : ''}</li>`).join('')}</ol>${factor > 1.01 ? '<p>Bei mehr Personen in mehreren Durchgängen garen.</p>' : ''}</div></section>` : '';
  const steps = d.steps.length ? `<ol class="steps">${d.steps.map((s, i) => (s.af
    ? `<li><div class="af-card"><div class="chips-row">${afChips(s.af)}</div><p>${esc(s.t)}</p><button type="button" class="timer-btn" data-act="timer" data-step="${i}">${icon('play', 'fill')}Timer ${esc(s.af.m)}:00</button></div></li>`
    : `<li><p>${esc(s.t)}</p></li>`)).join('')}</ol>` : '<p class="lead">Noch keine Zubereitung eingetragen.</p>';
  const tip = d.tip ? `<p class="tip">${icon('bulb')}<span><b>Tipp:</b> ${esc(d.tip)}</span></p>` : '';
  const src = d.src && safeUrl(d.src.url);
  const q = d.ck || d.t;
  const links = `<div class="pane-h"><h3>Mehr Ideen</h3></div><div class="group links">
    ${src ? `<a class="row" href="${esc(src)}" target="_blank" rel="noopener"><span class="row-ic" style="--tile:#8e8e93">${icon('link')}</span><span class="grow"><b>Original-Rezept</b><small>${esc(src.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 48))}</small></span>${icon('external', 'chev')}</a>` : ''}
    <a class="row" href="${chefkochUrl(q)}" target="_blank" rel="noopener"><span class="row-ic" style="--tile:#3e8e41">${icon('search')}</span><span class="grow"><b>Varianten auf Chefkoch</b><small>Suche nach „${esc(q)}“</small></span>${icon('external', 'chev')}</a>
    <a class="row" href="${chefkochUrl(q.replace(/\s*airfryer\s*/i, ' ').trim() + ' Airfryer')}" target="_blank" rel="noopener"><span class="row-ic" style="--tile:#ef6c1a">${icon('flame')}</span><span class="grow"><b>Airfryer-Rezepte auf Chefkoch</b><small>Weitere Ideen für den Cosori</small></span>${icon('external', 'chev')}</a>
  </div>`;
  const photos = d.photo && d.photo.n ? `<div class="pane-h"><h3>${d.photo.n > 1 ? 'Originalfotos' : 'Originalfoto'}</h3></div><div class="orig">${photoCache.has(d.id)
    ? (photoCache.get(d.id).map((s, i) => `<button type="button" class="orig-btn" data-act="photo-view" data-id="${esc(d.id)}" data-i="${i}" aria-label="Originalfoto ${i + 1} groß zeigen"><img src="${s}" alt=""></button>`).join('') || '<p class="fine">Das Foto ist nicht mehr verfügbar.</p>')
    : '<div class="orig-skel" aria-hidden="true"></div>'}</div>` : '';
  return fry + steps + tip + photos + links;
}

/* picker for a day */
function openPicker(key, slot, opener, choose) {
  const st = { q: '', slot };
  const view = {
    render() {
      const date = fromKey(key);
      $('#sheet').innerHTML = `${sheetHead(`${dayName(key)}, ${dateShort(date)}`)}<div class="pad">
        ${choose ? `<div class="seg" role="radiogroup" aria-label="Mahlzeit">${SLOTS.map((s) => `<button type="button" role="radio" data-act="pk-slot" data-slot="${s.k}" aria-checked="${st.slot === s.k}">${icon(s.k === 'f' ? 'sun' : 'fork')}${s.name}</button>`).join('')}</div>` : `<p class="big-title" style="font-size:24px">${esc(SLOT[st.slot].name)} wählen</p>`}
        <label class="search"><span class="vh">Rezept suchen</span>${icon('search')}<input id="pickSearch" type="search" placeholder="Rezept suchen" autocomplete="off"></label>
        <div class="quick">${canScan() ? `<button type="button" class="qtile" data-act="scan" data-date="${key}" data-slot="${st.slot}"><span class="q-ic" style="--tile:#0b0b10">${icon('camera')}</span>Foto scannen</button>` : ''}<button type="button" class="qtile" data-act="new-dish"><span class="q-ic" style="--tile:var(--accent)">${icon('edit')}</span>Neues Rezept</button><button type="button" class="qtile" data-act="import"><span class="q-ic" style="--tile:#3e8e41">${icon('download')}</span>Von Chefkoch</button></div>
        <div id="pickList" style="display:grid;gap:16px"></div>
      </div>`;
      const input = $('#pickSearch');
      input.value = st.q;
      input.addEventListener('input', () => { st.q = input.value; this.list(); });
      this.list();
    },
    list() {
      const q = st.q.trim().toLowerCase();
      const ds = allDishes().filter((d) => matches(d, q));
      const row = (d, cap) => `<button type="button" class="row pick-row" data-act="pick-dish" data-id="${esc(d.id)}">${thumbHTML(d)}<span class="grow"><b style="display:block;font-weight:600">${esc(d.t)}</b><small style="display:block;font-size:13px;color:var(--label-2)">${esc(cap)}</small></span><span class="plus" aria-hidden="true">${icon('plus')}</span></button>`;
      const capOf = (d) => { const h = histOf(d.id); return h.last ? `zuletzt ${relDay(h.last)}` : [d.time ? `${d.time} Min` : '', firstAf(d) ? 'Cosori' : ''].filter(Boolean).join(' · ') || (CAT[d.cat] || ''); };
      const groups = [];
      if (!q) {
        const recent = ds.map((d) => ({ d, h: histOf(d.id) })).filter((x) => x.h.last && (st.slot === 'f' ? x.d.cat === 'fruehstueck' : x.d.cat !== 'fruehstueck')).sort((a, b) => (a.h.last < b.h.last ? 1 : -1)).slice(0, 5).map((x) => x.d);
        if (recent.length) groups.push(['Zuletzt gegessen', recent]);
        const favs = ds.filter((d) => S.favs[d.id]);
        if (favs.length) groups.push(['Favoriten', favs]);
      }
      const order = st.slot === 'f' ? ['fruehstueck', 'haupt', 'leicht', 'suess'] : ['haupt', 'leicht', 'suess', 'fruehstueck'];
      for (const k of order) { const list = ds.filter((d) => (CAT[d.cat] ? d.cat : 'haupt') === k); if (list.length) groups.push([CAT[k], list]); }
      $('#pickList').innerHTML = groups.map(([t, list]) => `<div><p class="sub-h" style="margin:0 0 7px">${esc(t)}</p><div class="group">${list.map((d) => row(d, capOf(d))).join('')}</div></div>`).join('')
        || `<div class="empty"><p>Nichts gefunden.</p><button class="btn primary small" type="button" data-act="new-dish" data-title="${esc(st.q.trim())}">${icon('plus')}Neues Rezept</button></div>`;
    },
    act(act, el) {
      if (act === 'pk-slot') { st.slot = el.dataset.slot; this.render(); return true; }
      if (act !== 'pick-dish') return false;
      const before = snapshot();
      addEntry(key, st.slot, el.dataset.id, null);
      const d = dish(el.dataset.id);
      haptic(10);
      renderAll();
      closeSheet();
      toast(`${d ? d.t : 'Gericht'}: ${dayName(key)}, ${SLOT[st.slot].name}`, { undo: () => restore(before) });
      return true;
    },
  };
  openSheet(view, opener, { full: phoneMQ.matches });
}

/* ---------- recipe form ---------- */
const PANTRY_RE = /^(salz|pfeffer|zucker|mehl|butter|senf|honig|zimt|oregano|muskat|lorbeer|paprikapulver|chili|balsamico|gemüsebrühe|brühe|essig|.*öl$|.*essig$|salz &|salz,)/i;
const AISLE_RULES = [
  [/kichererbse|kidneybohne|dose|passiert|tomatenmark|kapern|olive|sojasauce|austernsauce|hoisin|pesto|kokosmilch|ketchup|sriracha|currypaste/i, 'konserve'],
  [/tk-|tiefkühl|gefroren/i, 'tk'],
  [/hähnchen|huhn|pute|rind|hack|schwein|schinken|speck|wurst|würstle|würstchen|salami|lachs|fisch|kabeljau|seelachs|garnele|forelle|thunfisch/i, 'fleisch'],
  [/milch|joghurt|quark|sahne|schmand|crème|creme|butter|käse|mozzarella|feta|parmesan|ricotta|\bei\b|eier|tofu|frischkäse|spätzle|gnocchi|teig|hefe|skyr|burrata|mascarpone|halloumi/i, 'kuehl'],
  [/brot|brötchen|baguette|ciabatta|toast|fladen|tortilla|wrap|laugen/i, 'brot'],
  [/nudel|spaghetti|pasta|penne|linguine|fusilli|lasagne|reis|quinoa|couscous|bulgur|linsen|haferflocken|müsli|semmelbrösel|paniermehl|panko|polenta|hirse|graupen/i, 'trocken'],
  [/zucker|honig|sirup|nuss|nüsse|mandel|pinienkern|kerne|sesam|rosine|schokolade|kakao|backpulver|vanille|stärke|gelatine|marmelade|mehl/i, 'backen'],
  [/salz|pfeffer|öl|essig|gewürz|pulver|curry|zimt|kümmel|kurkuma|oregano|chili|muskat|lorbeer|masala|brühe|senf/i, 'gewuerz'],
  [/wein|bier|saft|wasser|limo/i, 'getraenke'],
  [/.*/, 'obst'],
];
const UNIT_RE = /^(kg|g|ml|l|EL|TL|Stück|Stk\.?|Bund|Dosen?|Pck\.?|Packung(?:en)?|Päckchen|Kugeln?|Töpfe|Topf|Zehen?|Prisen?|Scheiben?|Stangen?|Rollen?|Knollen?|Becher|Gläser|Glas|Handvoll|Kästchen)$/i;
const UNIT_CANON = { stk: 'Stück', 'stk.': 'Stück', 'stück': 'Stück', dosen: 'Dose', dose: 'Dose', pck: 'Pck', 'pck.': 'Pck', päckchen: 'Pck', packung: 'Packung', packungen: 'Packung', kugeln: 'Kugel', kugel: 'Kugel', töpfe: 'Topf', topf: 'Topf', zehen: 'Zehe', zehe: 'Zehe', prisen: 'Prise', prise: 'Prise', scheiben: 'Scheibe', scheibe: 'Scheibe', stangen: 'Stange', stange: 'Stange', rollen: 'Rolle', rolle: 'Rolle', knollen: 'Knolle', knolle: 'Knolle', gläser: 'Glas', glas: 'Glas', el: 'EL', tl: 'TL', g: 'g', kg: 'kg', ml: 'ml', l: 'l', bund: 'Bund', becher: 'Becher', handvoll: 'Handvoll', kästchen: 'Kästchen' };
function parseQty(s) {
  if (!s) return null;
  const map = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  let m = s.match(/^(\d+)?([½¼¾⅓⅔])$/);
  if (m) return (m[1] ? Number(m[1]) : 0) + map[m[2]];
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+)[–-](\d+)$/);
  if (m) return Number(m[2]);
  const n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : null;
}
function ingToLine(i) {
  const amount = i.q != null ? amountText(i.q, i.u) + ' ' : '';
  return `${amount}${ingName(i, i.q)}${i.x ? ` (${i.x})` : ''}`.trim();
}
function parseIngLines(text, previous) {
  const prev = new Map();
  for (const i of previous || []) { prev.set(ingName(i, i.q).toLowerCase(), i); prev.set(i.n.toLowerCase(), i); }
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    let x = '';
    const xm = line.match(/\(([^)]*)\)\s*$/);
    if (xm) { x = xm[1].trim(); line = line.slice(0, xm.index).trim(); }
    const parts = line.split(/\s+/);
    let q = null, u = '';
    const maybeQ = parts.length > 1 ? parseQty(parts[0]) : null;
    if (maybeQ != null) {
      q = maybeQ; parts.shift();
      if (parts.length > 1 && UNIT_RE.test(parts[0])) u = UNIT_CANON[parts.shift().toLowerCase()] || '';
    }
    if (u === 'kg') { q = q != null ? q * 1000 : q; u = 'g'; }
    if (u === 'l') { q = q != null ? q * 1000 : q; u = 'ml'; }
    const name = parts.join(' ');
    const old = prev.get(name.toLowerCase());
    const out = { q, u, n: name, s: 'obst' };
    if (old) {
      out.s = old.s; if (old.p) out.p = 1;
      if (old.pl && old.pl.toLowerCase() === name.toLowerCase()) { out.n = old.n; out.pl = old.pl; } else if (old.pl) out.pl = old.pl;
    } else {
      out.s = (AISLE_RULES.find(([re]) => re.test(name)) || [null, 'obst'])[1];
      if (PANTRY_RE.test(name)) out.p = 1;
    }
    if (x) out.x = x;
    return out;
  });
}
let sampleFn = null;
function fromClaude(data, people) {
  if (!data || typeof data !== 'object') throw { code: 'invalid_json' };
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const out = {};
  if (str(data.t, 40)) out.t = str(data.t, 40);
  if (str(data.name, 80)) out.name = str(data.name, 80);
  if (CAT[data.cat]) out.cat = data.cat;
  if (Number(data.time) > 0) out.time = Math.round(Number(data.time));
  if (typeof data.veg === 'boolean') out.veg = data.veg;
  out.sv = people;
  const ing = (Array.isArray(data.ingredients) ? data.ingredients : []).filter((i) => i && str(i.n, 60)).slice(0, 40).map((i) => {
    const o = { q: i.q !== null && i.q !== '' && Number.isFinite(Number(i.q)) ? Number(i.q) : null, u: typeof i.u === 'string' ? (UNIT_CANON[i.u.toLowerCase()] || (i.u === '' ? '' : i.u.slice(0, 10))) : '', n: str(i.n, 60), s: AISLE[i.s] ? i.s : 'sonst' };
    if (i.p) o.p = 1;
    if (str(i.x, 60)) o.x = str(i.x, 60);
    return o;
  });
  if (ing.length) { out.ingPrev = ing; out.ingText = ing.map(ingToLine).join('\n'); }
  const steps = (Array.isArray(data.steps) ? data.steps : []).filter((s) => s && str(s.t, 600)).slice(0, 14).map((s) => ({
    t: str(s.t, 600),
    af: s.af && typeof s.af === 'object' && Number(s.af.m) > 0
      ? { label: str(s.af.label, 40), c: Math.min(200, Math.max(40, Number(s.af.c) || 180)), m: Math.min(120, Math.round(Number(s.af.m))), sh: (Array.isArray(s.af.sh) ? s.af.sh : [s.af.sh]).map(Number).filter((n) => n > 0).join(', '), pre: !!s.af.pre }
      : null,
  }));
  if (steps.length) out.steps = steps;
  if (str(data.tip, 300)) out.tip = str(data.tip, 300);
  return out;
}
// Ask Claude for JSON. Older Claude apps have no sample.json: then ask for text and read the
// JSON out of the answer; a reply that is almost JSON is rescued from e.text.
function parseLooseJSON(text) {
  let t = String(text || '').trim();
  if (!t) throw { code: 'empty_completion' };
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw { code: 'invalid_json', text };
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { throw { code: 'invalid_json', text }; }
}
const normErr = (e) => (e && typeof e.code === 'string' ? e : { code: 'page_error', message: String((e && e.message) || e) });
async function askJSON(prompt, opts = {}) {
  if (!sampleFn) throw { code: 'not_granted' };
  if (typeof sampleFn.json === 'function') {
    try { return await sampleFn.json(prompt, opts); } catch (e) {
      if (e && e.code === 'invalid_json' && e.text) return parseLooseJSON(e.text);
      if (!(e && e.code === 'capability_removed')) throw normErr(e);
    }
  }
  let r;
  try { r = await sampleFn(prompt, opts); } catch (e) { throw normErr(e); }
  return parseLooseJSON(typeof r === 'string' ? r : r && r.text);
}
const statusHTML = (st) => `<p class="status${st.busy ? ' busy' : ''}" aria-live="polite">${esc(st.status)}</p>${st.perm ? `<button class="btn small" type="button" data-act="perm" style="justify-self:start">${icon('sparkle')}Claude erlauben</button>` : ''}`;
async function openPermissions() {
  try {
    const p = await window.claude.use('permissions');
    if (!p) throw { code: 'unavailable' };
    await p.manage();
    const s = await p.state('sample');
    if (s === 'granted' || s === 'prompt') {
      const fn = await window.claude.use('sample');
      if (typeof fn === 'function') sampleFn = fn;
      queueRender('plan', 'book');
      toast('Claude ist freigegeben – bitte noch einmal tippen.');
    }
  } catch (e) {
    toast('Bitte im Menü dieses Artifacts unter „Berechtigungen“ Claude erlauben.');
  }
}
const RECIPE_JSON = `{"t":"kurzer Name für die Wochenplan-Karte, höchstens 4 Wörter","name":"vollständiger Rezeptname","cat":"fruehstueck|haupt|leicht|suess","time":35,"veg":true,"ingredients":[{"q":200,"u":"g","n":"Spaghetti","s":"trocken","p":false,"x":""}],"steps":[{"t":"Schritt in 1–3 Sätzen","af":null},{"t":"Schritt im Cosori","af":{"label":"Gemüse rösten","c":200,"m":15,"sh":[7],"pre":false}}],"tip":"kurzer Tipp"}`;
const RECIPE_RULES = `Regeln: "s" ist die Supermarkt-Abteilung, einer von: obst (Obst & Gemüse, frische Kräuter), brot, kuehl (Milchprodukte, Käse, Eier, Tofu), fleisch (auch Fisch), trocken (Nudeln, Reis, Getreide, Linsen), konserve (Dosen, Gläser, Saucen), backen (Zucker, Nüsse, Backzutaten), gewuerz (Gewürze, Öl, Essig), tk, getraenke. "p": true nur für Vorratszutaten, die fast jeder zu Hause hat (Salz, Pfeffer, Öl, Zucker, Mehl, Butter, Brühe, Essig, Senf, Honig, Paprikapulver, Zimt). "q" ist eine Zahl oder null, "u" eine Einheit aus g, ml, EL, TL, Bund, Dose, Pck, Kugel, Topf, Zehe, Prise, Scheibe, Stange oder "" für Stück. "n" im Singular, "x" eine kurze Zusatzinfo oder "". Im Cosori höchstens 200 °C, "m" in Minuten, "sh" = Minuten, nach denen geschüttelt oder gewendet wird ([] wenn nie), "pre" = vorheizen. Schreibe die Schritte in einfachen, klaren Sätzen im Kochbuch-Stil (z. B. „Zwiebel fein würfeln und in Öl glasig dünsten.“).`;

const draftDefaults = (people) => ({ t: '', b: '', note: '', sub: '', cat: 'haupt', name: '', time: '', sv: people, veg: true, src: '', ingText: '', ingPrev: [], steps: [{ t: '', af: null }], tip: '' });
function dishFromDraft(F) {
  const steps = (F.steps || []).filter((x) => String(x.t || '').trim() || x.af).map((x) => {
    const t = String(x.t || '').trim();
    if (!x.af) return { t, af: null };
    const sh = String(x.af.sh || '').split(/[,;& ]+/).map(Number).filter((n) => n > 0);
    return { t, af: { label: String(x.af.label || '').trim(), c: Math.min(200, Math.max(40, Number(x.af.c) || 180)), m: Math.min(120, Math.max(1, Number(x.af.m) || 10)), sh: sh.length > 1 ? sh : sh[0] || null, pre: !!x.af.pre } };
  });
  const data = {
    t: String(F.t || '').trim().slice(0, 40), b: String(F.b || '').trim().slice(0, 2), note: String(F.note || '').trim(), sub: F.sub || '', cat: CAT[F.cat] ? F.cat : 'haupt',
    name: String(F.name || '').trim(), time: Number(F.time) > 0 ? Math.round(Number(F.time)) : null, sv: Math.min(12, Math.max(1, Math.round(Number(F.sv) || 2))),
    veg: !!F.veg, ing: parseIngLines(F.ingText || '', F.ingPrev), steps, tip: String(F.tip || '').trim(), updated: Date.now(),
  };
  const src = safeUrl(F.src);
  if (src) data.src = { url: src };
  return data;
}
function openForm(id, opener, preset) {
  const existing = id ? dish(id) : null;
  const F = existing ? {
    t: existing.t, b: existing.b || '', note: existing.note || '', sub: existing.sub || '',
    cat: existing.cat || 'haupt', name: existing.name || '', time: existing.time || '', sv: existing.sv || 2,
    veg: !!existing.veg, src: (existing.src && existing.src.url) || '',
    ingText: (existing.ing || []).map(ingToLine).join('\n'), ingPrev: existing.ing || [],
    steps: existing.steps.map((s) => ({ t: s.t, af: s.af ? Object.assign({}, s.af, { sh: shakeList(s.af).join(', ') }) : null })),
    tip: existing.tip || '',
  } : Object.assign(draftDefaults(S.settings.people), preset || {});
  const st = { ctl: null, status: '', busy: false, wish: '', perm: false };
  const read = () => {
    const v = (sel) => { const el = $(sel); return el ? el.value : ''; };
    F.t = v('#f-t'); F.b = v('#f-b'); F.note = v('#f-note'); F.cat = v('#f-cat'); F.name = v('#f-name');
    F.time = v('#f-time'); F.sv = v('#f-sv'); F.ingText = v('#f-ing'); F.tip = v('#f-tip'); F.src = v('#f-src');
    F.veg = !!($('#f-veg') && $('#f-veg').checked);
    F.steps = $$('.step-edit').map((row) => {
      const t = row.querySelector('textarea').value;
      if (!row.querySelector('[data-af-on]').checked) return { t, af: null };
      const num = (s) => Number(row.querySelector(s).value);
      return { t, af: { c: num('[data-af-c]') || 180, m: num('[data-af-m]') || 10, sh: row.querySelector('[data-af-sh]').value, pre: row.querySelector('[data-af-pre]').checked, label: row.querySelector('[data-af-label]').value } };
    });
  };
  const view = {
    render() {
      $('#sheet').innerHTML = `${sheetHead(existing ? 'Rezept bearbeiten' : 'Neues Rezept', { left: '<button type="button" class="link" data-act="close">Abbrechen</button>', right: '<button type="submit" class="link b" form="dishForm">Sichern</button>' })}<div class="pad">
        <div class="ai-box"${sampleFn ? '' : ' hidden'}>
          <p><b>${icon('sparkle')} Claude schreibt das Rezept</b><br>Namen eintragen, dann schlägt Claude Zutaten, Zubereitung und Cosori-Schritte vor.</p>
          <label class="field">Wünsche <span class="opt">(optional)</span><input id="f-wish" placeholder="z. B. vegetarisch, schnell, mit Reis" value="${esc(st.wish)}"></label>
          <div class="acts-row"><button class="btn primary small" type="button" data-act="claude"${st.busy ? ' disabled' : ''}>${icon('sparkle')}Vorschlag holen</button>${st.busy ? '<button class="btn small" type="button" data-act="claude-stop">Stopp</button>' : ''}${!existing && canScan() && !st.busy ? `<button class="btn small" type="button" data-act="scan">${icon('camera')}Lieber scannen</button>` : ''}</div>
          ${statusHTML(st)}
        </div>
        <form class="form" id="dishForm" novalidate>
          <label class="field">Name<input id="f-t" maxlength="40" required value="${esc(F.t)}" placeholder="z. B. Gefüllte Paprika"></label>
          <label class="field">Rezeptname <span class="opt">(optional, ausführlicher)</span><input id="f-name" maxlength="80" value="${esc(F.name)}"></label>
          <label class="field">Kategorie<select id="f-cat">${CATS.map(([k, l]) => `<option value="${k}"${F.cat === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <div class="row2">
            <label class="field">Minuten<input id="f-time" type="number" inputmode="numeric" min="1" max="600" value="${esc(F.time)}"></label>
            <label class="field">Portionen<input id="f-sv" type="number" inputmode="numeric" min="1" max="12" value="${esc(F.sv)}"></label>
          </div>
          <label class="toggle">Vegetarisch<input type="checkbox" id="f-veg"${F.veg ? ' checked' : ''}></label>
          <label class="field">Zutaten <span class="opt">– eine pro Zeile, z. B. „200 g Spaghetti“</span><textarea id="f-ing" rows="8">${esc(F.ingText)}</textarea></label>
          <fieldset class="form" style="border:0;padding:0;margin:0"><legend class="field" style="padding:0;margin-bottom:8px">Zubereitung</legend>
            ${F.steps.map((s, i) => `<div class="step-edit">
              <label class="vh" for="f-step-${i}">Schritt ${i + 1}</label>
              <textarea id="f-step-${i}" rows="3" placeholder="Schritt ${i + 1}">${esc(s.t)}</textarea>
              <div class="step-bar"><label class="toggle mini"><input type="checkbox" data-af-on data-act="af-toggle"${s.af ? ' checked' : ''}>Cosori-Schritt</label><button type="button" class="mini" data-act="del-step" data-i="${i}" aria-label="Schritt ${i + 1} löschen">${icon('trash')}</button></div>
              <div class="af-fields"${s.af ? '' : ' hidden'}>
                <label class="field">°C<input data-af-c type="number" inputmode="numeric" min="40" max="200" value="${esc(s.af ? s.af.c : 180)}"></label>
                <label class="field">Minuten<input data-af-m type="number" inputmode="numeric" min="1" max="120" value="${esc(s.af ? s.af.m : 10)}"></label>
                <label class="field">Schütteln<input data-af-sh inputmode="numeric" placeholder="z. B. 5" value="${esc(s.af && s.af.sh ? s.af.sh : '')}"></label>
                <label class="field wide">Kurzname<input data-af-label maxlength="40" placeholder="z. B. Gemüse rösten" value="${esc(s.af && s.af.label ? s.af.label : '')}"></label>
                <label class="toggle mini wide"><input type="checkbox" data-af-pre${s.af && s.af.pre ? ' checked' : ''}>Vorheizen</label>
              </div>
            </div>`).join('')}
            <button type="button" class="btn small" data-act="add-step" style="justify-self:start">${icon('plus')}Schritt hinzufügen</button>
          </fieldset>
          <label class="field">Tipp <span class="opt">(optional)</span><textarea id="f-tip" rows="2" style="min-height:76px">${esc(F.tip)}</textarea></label>
          <div class="row2">
            <label class="field">Kürzel <span class="opt">(z. B. A)</span><input id="f-b" maxlength="2" value="${esc(F.b)}"></label>
            <label class="field">Notiz <span class="opt">(optional)</span><input id="f-note" maxlength="30" value="${esc(F.note)}" placeholder="z. B. dazu Rote Bete"></label>
          </div>
          <label class="field">Quelle <span class="opt">(Link, optional)</span><input id="f-src" type="url" inputmode="url" value="${esc(F.src)}" placeholder="https://www.chefkoch.de/rezepte/…"></label>
          <div class="acts-col">
            <button class="btn primary wide" type="submit">${icon('check')}Sichern</button>
            ${existing && existing.edited ? `<button class="btn wide" type="button" data-act="restore-dish">${icon('undo')}Originalrezept wiederherstellen</button>` : ''}
            ${existing ? `<button class="btn wide danger" type="button" data-act="delete-dish">${icon('trash')}Rezept löschen</button>` : ''}
          </div>
        </form>
      </div>`;
      $('#dishForm').addEventListener('submit', (e) => { e.preventDefault(); read(); save(); });
    },
    act(act, el) {
      if (act === 'add-step') { read(); F.steps.push({ t: '', af: null }); this.render(); const ta = $$('.step-edit textarea').pop(); if (ta) ta.focus(); return true; }
      if (act === 'del-step') { read(); F.steps.splice(Number(el.dataset.i), 1); if (!F.steps.length) F.steps.push({ t: '', af: null }); this.render(); return true; }
      if (act === 'af-toggle') { el.closest('.step-edit').querySelector('.af-fields').hidden = !el.checked; return true; }
      if (act === 'claude') { read(); askClaude(); return true; }
      if (act === 'claude-stop') { if (st.ctl) st.ctl.abort(); return true; }
      if (act === 'delete-dish') { const back = UI.opener; closeSheet({ instant: true }); confirmDelete(id, back); return true; }
      if (act === 'restore-dish') {
        const before = snapshot();
        delete S.custom[id];
        persist(['dishes/' + id]);
        renderAll();
        closeSheet();
        toast('Originalrezept wiederhergestellt', { undo: () => restore(before) });
        return true;
      }
      return false;
    },
    onClose() { if (st.ctl) st.ctl.abort(); },
  };
  function save() {
    const t = F.t.trim();
    if (!t) { const el = $('#f-t'); el.focus(); el.setCustomValidity('Bitte einen Namen eingeben.'); el.reportValidity(); el.addEventListener('input', () => el.setCustomValidity(''), { once: true }); return; }
    const data = dishFromDraft(F);
    const prev = id ? S.custom[id] : null;
    if (prev) for (const k of ['origin', 'photo', 'thumb']) if (prev[k] !== undefined) data[k] = prev[k];
    const newId = id || 'c' + Date.now().toString(36) + rid().slice(0, 3);
    S.custom[newId] = data;
    persist(['dishes/' + newId]);
    renderAll();
    closeSheet();
    toast(id ? `${t} gesichert` : `${t} steht jetzt im Kochbuch`);
  }
  function setStatus(text, busy) {
    st.status = text; st.busy = busy;
    const p = $('#sheet .ai-box .status');
    if (p) { p.textContent = text; p.classList.toggle('busy', !!busy); }
  }
  async function askClaude() {
    if (!sampleFn) return;
    if (!F.t.trim()) { setStatus('Bitte zuerst den Namen eintragen – zum Beispiel „Gefüllte Paprika“.', false); return; }
    st.wish = ($('#f-wish') && $('#f-wish').value) || '';
    const wish = st.wish.trim();
    st.ctl = new AbortController();
    st.busy = true; st.status = 'Claude schreibt das Rezept …';
    view.render();
    const people = Number(F.sv) || S.settings.people;
    const prompt = `Du schreibst Rezepte für Antom, eine deutsche Familien-App zur Wochenplanung.
Gericht: "${F.t.trim()}"${wish ? `\nWünsche der Familie: ${wish}` : ''}
Rezept für ${people} Personen. Die Familie kocht mit einem Cosori Airfryer (Heißluftfritteuse, Korb ca. 5,5 L, höchstens 200 °C). Nutze den Cosori für mindestens einen sinnvollen Schritt (z. B. Gemüse rösten, Kartoffeln, Croutons, Nüsse, Fisch, Hähnchen, Brot aufbacken). Nur wenn er wirklich keinen Sinn ergibt, setze bei allen Schritten "af": null.
Antworte nur mit JSON in genau diesem Format:
${RECIPE_JSON}
${RECIPE_RULES}`;
    try {
      const data = await askJSON(prompt, { signal: st.ctl.signal });
      read();
      const out = fromClaude(data, people);
      delete out.t;
      Object.assign(F, out);
      st.status = 'Fertig! Bitte kurz durchlesen und dann sichern.';
    } catch (e) {
      st.status = claudeError(e);
      st.perm = !!(e && e.code === 'not_granted');
    } finally {
      st.busy = false; st.ctl = null;
      if (UI.sheet === view) view.render();
    }
  }
  openSheet(view, opener, { full: true });
}
function claudeError(e) {
  const code = (e && e.code) || 'page_error';
  if (code === 'cancelled') return 'Abgebrochen.';
  if (code === 'not_granted') return 'Claude ist für dieses Antom noch nicht erlaubt. Mit „Claude erlauben“ lässt sich das einschalten.';
  if (code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled') { sampleFn = null; queueRender('plan', 'book'); return 'Claude ist hier nicht verfügbar. Ihr könnt das Rezept trotzdem selbst eintragen.'; }
  if (code === 'capability_removed') return 'Diese Version der Claude-App kann das noch nicht. Bitte die App aktualisieren oder Antom im Browser öffnen.';
  if (code === 'rate_limited') return 'Claude ist gerade ausgelastet. Bitte in ein paar Minuten noch einmal versuchen.';
  if (code === 'session_expired') return 'Bitte bei Claude neu anmelden und dann noch einmal versuchen.';
  if (code === 'invalid_json') return 'Die Antwort war unvollständig. Bitte noch einmal versuchen.';
  if (code === 'image_rejected') return 'Ein Bild ließ sich nicht lesen (zum Beispiel ein HEIC-Foto). Bitte einen Screenshot oder ein anderes Foto wählen.';
  if (code === 'images_unavailable') { UI.canImages = false; queueRender('plan', 'book'); return 'Bilder gehen hier gerade nicht. Bitte den Link oder Rezepttext einfügen.'; }
  if (code === 'refused') return 'Claude konnte damit nichts anfangen. Bitte nur Zutaten und Zubereitung einfügen.';
  if (code === 'empty_completion') return 'Claude hat nichts geantwortet. Bitte noch einmal versuchen.';
  if (code === 'prompt_too_large') return 'Der Text ist zu lang. Bitte nur Zutaten und Zubereitung einfügen.';
  if (code === 'upstream_error') return 'Claude ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.';
  return `Das hat gerade nicht geklappt (Code: ${code}). Bitte noch einmal versuchen.`;
}
function confirmSheet(opener, { title, text, icon: ic, actions }) {
  openSheet({
    render() {
      $('#sheet').innerHTML = `<div class="sh-head"><div class="grabber" aria-hidden="true"></div></div><div class="pad" style="padding-top:14px">
        <div class="confirm-ic" aria-hidden="true">${icon(ic || 'trash')}</div>
        <div class="confirm-t"><h2 id="sheetTitle">${esc(title)}</h2><p>${esc(text)}</p></div>
        <div class="acts-col">${actions.map((a) => `<button class="btn wide ${a.cls || ''}" type="button" data-act="${a.act}">${esc(a.label)}</button>`).join('')}<button class="btn wide" type="button" data-act="close" style="color:var(--label)">Abbrechen</button></div>
      </div>`;
    },
    act(act) {
      const a = actions.find((x) => x.act === act);
      if (!a) return false;
      a.run();
      return true;
    },
  }, opener);
}
function confirmDelete(id, opener) {
  const d = dish(id);
  if (!d) return;
  const keys = Object.keys(S.days).filter((k) => S.days[k].f.concat(S.days[k].h).some((e) => e.d === id));
  const future = keys.filter((k) => k >= todayKey());
  confirmSheet(opener, {
    title: `„${d.t}“ löschen?`,
    text: `Das Rezept verschwindet aus dem Kochbuch${future.length ? ` und aus dem Plan (${future.map(dateMid).join(', ')})` : ''}. Direkt danach könnt ihr das noch rückgängig machen.`,
    actions: [{
      act: 'really-delete', label: 'Rezept löschen', cls: 'danger',
      run() {
        const before = snapshot();
        for (const k of keys) {
          for (const s of ['f', 'h']) S.days[k][s] = S.days[k][s].filter((e) => e.d !== id);
          pruneDay(k);
        }
        if (BASE[id]) S.custom[id] = { deleted: true }; else delete S.custom[id];
        if (S.favs[id]) { delete S.favs[id]; persist(['meta/favs']); }
        persist(['dishes/' + id, ...dayPaths(...keys)]);
        if (d.photo) cleanupPhotoLater(id);
        renderAll();
        closeSheet();
        toast(`${d.t} gelöscht`, { undo: () => restore(before) });
      },
    }],
  });
}

