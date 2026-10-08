
/* ---------- rendering ---------- */
const isLoading = () => S.mode === 'loading' || !S.ready;
let renderParts = new Set();
let renderFrame = 0;
function queueRender(...parts) {
  for (const p of parts) renderParts.add(p);
  if (S.dragging || renderFrame) return;
  renderFrame = requestAnimationFrame(flushRender);
}
function flushRender() {
  renderFrame = 0;
  if (S.dragging) return;
  const parts = renderParts; renderParts = new Set();
  if (parts.has('plan')) renderPlan();
  if (parts.has('book')) { renderBook(); renderShelf(); }
  if (parts.has('shop')) renderShop();
  renderChrome();
  if (UI.sheet && UI.sheet.refresh) UI.sheet.refresh();
}
function renderAll() { renderParts = new Set(['plan', 'book', 'shop']); if (!S.dragging) { cancelAnimationFrame(renderFrame); flushRender(); } }

function renderChrome() {
  const web = S.mode === 'shared' && window.antomWeb ? window.antomWeb.state() : null;
  const label = web && !web.online ? (web.pending ? 'Offline – kommt später' : 'Familienplan · offline')
    : web && web.pending ? 'Wird gespeichert …'
    : S.mode === 'shared' ? 'Familienplan' : S.mode === 'local' ? 'Auf diesem Gerät' : 'Verbinde …';
  for (const el of $$('[data-sync]')) el.textContent = label;
  const open = shopCounts().open;
  for (const el of $$('[data-count]')) el.textContent = open ? String(open) : '';
  const scan = canScan();
  for (const el of $$('[data-scan-entry]')) el.hidden = !scan;
}
const weekToolsHTML = () => `<button type="button" class="rbtn" data-act="week-prev" aria-label="Vorige Woche">${icon('chevron-left')}</button><button type="button" class="rbtn" data-act="week-next" aria-label="Nächste Woche">${icon('chevron-right')}</button>`;
const todayBtnHTML = () => (isCurWeek() ? '' : '<button type="button" class="capsule" data-act="week-today">Heute</button>');
const weekCap = () => (isCurWeek() ? `${dateLong(new Date())} · KW ${isoWeek(UI.week).kw}` : `KW ${isoWeek(UI.week).kw} · ${weekRange(UI.week)}`);
function setWeek(monday) {
  UI.week = monday;
  renderAll();
  const v = $('#v-plan');
  if (UI.tab === 'plan' && v.scrollTop > 200) v.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* week */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 14 ? 'Mahlzeit' : h < 18 ? 'Guten Tag' : h < 23 ? 'Guten Abend' : 'Gute Nacht';
}
function renderPlan() {
  if (+UI.builtWeek !== +UI.week) buildDays();
  const cur = isCurWeek();
  const label = weekLabel(UI.week);
  const kw = isoWeek(UI.week).kw;
  // this week: date + greeting, the bar names the week; other weeks: the title names the week, the bar its dates
  const diff = Math.round((UI.week - thisMonday()) / (7 * 86400000));
  $('#planCap').textContent = cur ? dateLong(new Date()) : Math.abs(diff) > 1 ? (diff > 0 ? `In ${diff} Wochen` : `Vor ${-diff} Wochen`) : `KW ${kw}`;
  $('#tPlan').textContent = cur ? greeting() : label;
  $('#navPlan').textContent = label;
  const mid = cur ? `${esc(label)} <small>· KW ${kw}</small>` : esc(weekRange(UI.week));
  $('#weekbar').innerHTML = `<div class="wk"><button type="button" data-act="week-prev" aria-label="Vorige Woche">${icon('chevron-left')}</button><span>${mid}</span><button type="button" data-act="week-next" aria-label="Nächste Woche">${icon('chevron-right')}</button></div>${cur ? '' : '<button type="button" class="today-btn" data-act="week-today">Heute</button>'}`;
  renderStrip();
  renderToday();
  renderSlots();
  renderPlanFoot();
}
// the week at a glance: the main dish of every day as a round photo
function renderStrip() {
  const tk = todayKey();
  $('#strip').innerHTML = weekDays(UI.week).map((d) => {
    const p = dayPlan(d.key);
    const today = d.key === tk;
    const e = p.h.find((x) => dish(x.d)) || p.f.find((x) => dish(x.d));
    const dd = e && dish(e.d);
    const what = dd ? `: ${dd.t}` : ', noch nichts geplant';
    return `<button type="button" class="dp${today ? ' is-today' : ''}${d.key < tk ? ' is-past' : ''}" data-act="goto-day" data-date="${d.key}" aria-label="${d.name}, ${dateShort(d.date)}${today ? ', heute' : ''}${what}"><small>${d.short}</small><span class="dp-ph${dd ? '' : ' is-empty'}">${dd ? `<img src="${photoSrc(dd, 's')}" alt="" draggable="false">` : ''}</span><b>${d.date.getDate()}</b></button>`;
  }).join('');
}
function miniRow(e, label, key) {
  const d = dish(e.d);
  return `<div class="row" role="button" tabindex="0" data-act="open-entry" data-uid="${esc(e.u)}">${thumbHTML(d)}<span class="mini-txt"><small>${esc(label)}</small><b>${esc(d.t)}</b></span>${icon('chevron-right', 'chev')}</div>`;
}
function renderToday() {
  const box = $('#today');
  if (!isCurWeek()) {
    const empty = !isLoading() && weekDays(UI.week).every((d) => !S.days[d.key]);
    box.hidden = !empty;
    box.innerHTML = empty ? weekEmptyHTML() : '';
    $('#band').classList.toggle('solo', !empty);
    return;
  }
  box.hidden = false;
  $('#band').classList.remove('solo');
  if (isLoading()) { box.innerHTML = '<div class="hero skeleton" aria-hidden="true"></div>'; return; }
  const tk = todayKey();
  const p = dayPlan(tk);
  const main = p.h.find((e) => dish(e.d));
  const bf = p.f.find((e) => dish(e.d));
  const hero = main || bf;
  const tomorrowKey = dkey(addDays(new Date(), 1));
  const tm = dayPlan(tomorrowKey).h.find((e) => dish(e.d));
  const sub = [];
  if (main && bf) sub.push(miniRow(bf, 'Frühstück heute', tk));
  if (bf && !main) sub.push(`<button type="button" class="row add-meal" data-act="pick" data-date="${tk}" data-slot="h"><span class="thumb">${icon('plus')}</span><span class="mini-txt"><small>Heute</small><b>Hauptessen planen</b></span></button>`);
  if (tm) sub.push(miniRow(tm, `Morgen · ${dayName(tomorrowKey)}`, tomorrowKey));
  if (!hero) {
    box.innerHTML = `<div class="hero is-empty" role="group" aria-label="Heute">
      ${imgOf('ph-haupt', 'l', ' fetchpriority="high"')}
      <div class="hero-top"><span class="gpill">${icon('calendar')}Heute</span></div>
      <div class="hero-body"><h2 class="hero-title">Was gibt’s heute?</h2><p class="hero-meta">Noch nichts geplant für ${esc(dayName(tk))}.</p>
        <div class="hero-actions"><button class="btn white" type="button" data-act="pick" data-date="${tk}" data-slot="h">${icon('plus')}Gericht wählen</button>${sampleFn ? `<button class="btn glassy" type="button" data-act="suggest">${icon('sparkle')}Vorschlag</button>` : ''}</div></div>
    </div>${sub.length ? `<div class="group hero-sub">${sub.join('')}</div>` : ''}`;
    return;
  }
  const d = dish(hero.d);
  const af = firstAf(d);
  const n = hero.s || S.settings.people;
  box.innerHTML = `<div class="hero" role="button" tabindex="0" data-act="open-entry" data-uid="${esc(hero.u)}" aria-label="Heute: ${esc(d.t)} – Rezept öffnen">
      ${photoHTML(d, 'l', true)}
      <div class="hero-top"><span class="gpill">${icon(main ? 'fork' : 'sun')}Heute · ${main ? 'Hauptessen' : 'Frühstück'}</span>${S.favs[d.id] ? `<span class="gpill" aria-label="Favorit">${icon('heart', 'fill')}</span>` : ''}</div>
      <div class="hero-body">
        <h2 class="hero-title">${esc(d.t)}</h2>
        <p class="hero-meta">${d.time ? `<span>${icon('clock')}${esc(d.time)} Min</span>` : ''}${af ? `<span>${icon('flame')}${tmCount(d) ? '' : 'Cosori '}${esc(af.c)} °C</span>` : ''}${tmCount(d) ? `<span>${icon('tm')}Thermomix</span>` : ''}<span>${icon('users')}${n}</span></p>
        <div class="hero-actions"><button class="btn white" type="button" data-act="cook" data-uid="${esc(hero.u)}" data-dish="${esc(d.id)}">${icon('play', 'fill')}Kochen</button><button class="btn glassy" type="button" data-act="open-entry" data-uid="${esc(hero.u)}">Rezept</button></div>
      </div>
    </div>${sub.length ? `<div class="group hero-sub">${sub.join('')}</div>` : ''}`;
}
function weekEmptyHTML() {
  const copy = copyBfPlan().length;
  const past = UI.week < thisMonday();
  return `<section class="promo week-empty" aria-label="Woche planen">${imgOf('ob-tisch', 'm', ' loading="lazy"')}${past ? '' : `<span class="gpill">${icon('sparkle')}Woche planen</span>`}
    <div class="promo-body"><h2>${past ? 'Hier war nichts geplant' : 'Noch nichts geplant'}</h2><p>${past ? 'In dieser Woche stehen keine Gerichte.' : 'Tippt auf einen Tag, nehmt das Frühstück von letzter Woche mit oder lasst Claude die Woche füllen.'}</p>
    ${past ? '' : `<div class="acts">${copy ? `<button class="btn white" type="button" data-act="copy-bf">${icon('repeat')}Frühstück übernehmen</button>` : ''}${sampleFn ? `<button class="btn ${copy ? 'glassy' : 'white'}" type="button" data-act="suggest">${icon('sparkle')}Vorschläge</button>` : ''}</div>`}</div></section>`;
}
function buildDays() {
  destroySlotSortables();
  const tk = todayKey();
  const days = $('#days');
  days.innerHTML = weekDays(UI.week).map((d) => `<section class="day${d.key === tk ? ' is-today' : ''}${d.key < tk ? ' is-past' : ''}" id="day-${d.key}" aria-label="${d.name}, ${dateShort(d.date)}">
      <header class="day-h"><span class="day-badge" aria-hidden="true"><small>${d.short}</small><b>${d.date.getDate()}</b></span><span class="day-tt"><h3>${d.name}</h3><span class="date">${d.date.getDate()}. ${MONTHS[d.date.getMonth()]}</span></span>${d.key === tk ? '<span class="tag">Heute</span>' : ''}<button type="button" class="rbtn add" data-act="pick" data-date="${d.key}" data-slot="h" data-choose="1" aria-label="Gericht für ${d.name} hinzufügen">${icon('plus')}</button></header>
      <div class="group days-g">${SLOTS.map((s) => `<div class="slot" data-date="${d.key}" data-slot="${s.k}" aria-label="${d.name}, ${s.name}"></div>`).join('')}</div>
    </section>`).join('');
  UI.builtWeek = UI.week;
  if (!reduceMotion) { days.classList.add('rise'); setTimeout(() => days.classList.remove('rise'), 900); }
  initSlotSortables();
}
function mealHTML(e, key, slot) {
  const d = dish(e.d);
  if (!d) {
    return `<div class="meal gone" role="button" tabindex="0" data-act="open-entry" data-uid="${esc(e.u)}"><span class="thumb">${icon('x')}</span><span class="meal-txt"><small>${SLOT[slot].name}</small><b class="nm">Gelöschtes Rezept</b><span class="meta">Antippen zum Entfernen</span></span></div>`;
  }
  const af = firstAf(d);
  const serv = e.s && e.s !== S.settings.people ? `<span>${icon('users')}${e.s}</span>` : '';
  return `<div class="meal" role="button" tabindex="0" data-act="open-entry" data-uid="${esc(e.u)}" data-dish="${esc(d.id)}" aria-label="${esc(`${dayName(key)}, ${SLOT[slot].name}: ${d.t}`)}">
    ${thumbHTML(d)}
    <span class="meal-txt"><small>${SLOT[slot].name}</small><b class="nm">${esc(d.t)}</b><span class="meta">${d.time ? `<span>${icon('clock')}${esc(d.time)} Min</span>` : ''}${af ? `<span class="heat">${icon('flame')}${esc(af.c)} °C</span>` : ''}${tmCount(d) ? `<span class="tmk" title="Mit Thermomix">${icon('tm')}TM</span>` : ''}${serv}${S.favs[d.id] ? `<span class="fav-dot" aria-label="Favorit">${icon('heart', 'fill')}</span>` : ''}</span></span>
    ${icon('chevron-right', 'chev')}
  </div>`;
}
function renderSlots() {
  for (const el of $$('#days .slot')) {
    const key = el.dataset.date, slot = el.dataset.slot;
    if (isLoading()) { el.innerHTML = '<div class="meal"><span class="thumb skeleton"></span><span class="meal-txt"><small class="skeleton" style="width:40%;height:12px"></small></span></div>'; continue; }
    const list = dayPlan(key)[slot];
    el.innerHTML = list.map((e) => mealHTML(e, key, slot)).join('')
      + (list.length ? '' : `<button type="button" class="add-meal" data-act="pick" data-date="${key}" data-slot="${slot}" aria-label="${SLOT[slot].name} am ${dayName(key)} planen"><span class="thumb">${icon('plus')}</span><span class="meal-txt"><small>${SLOT[slot].name}</small><b>Hinzufügen</b></span></button>`);
  }
}
function copyBfPlan() {
  const days = weekDays(UI.week), prev = weekDays(addDays(UI.week, -7));
  return days.map((d, i) => ({ to: d.key, from: dayPlan(prev[i].key).f })).filter((x) => !dayPlan(x.to).f.length && x.from.length);
}
const freeDays = () => weekDays(UI.week).filter((d) => d.key >= todayKey() && !dayPlan(d.key).h.length);
function renderPlanFoot() {
  if (isLoading()) { $('#planFoot').innerHTML = ''; return; }
  const copy = copyBfPlan().length;
  const free = freeDays().length;
  const rows = [];
  if (copy) rows.push(`<button type="button" class="row" data-act="copy-bf"><span class="row-ic" style="--tile:#ef9b0f">${icon('repeat')}</span><span class="grow">Frühstück wie letzte Woche</span><span class="val">${copy}×</span></button>`);
  if (sampleFn && free) rows.push(`<button type="button" class="row" data-act="suggest"><span class="row-ic" style="--tile:linear-gradient(135deg,#5c7cfa,#b15cf7)">${icon('sparkle')}</span><span class="grow">${free === 1 ? 'Freien Tag füllen' : `${free} freie Tage füllen`}</span><span class="val">Claude</span></button>`);
  rows.push(`<button type="button" class="row danger" data-act="clear-week"><span class="row-ic" style="--tile:#ff3b30">${icon('trash')}</span><span class="grow">Woche leeren …</span></button>`);
  $('#planFoot').innerHTML = `<h2 class="sec-h">Woche</h2><div class="group" style="--inset:60px">${rows.join('')}</div>`;
}

/* shelf (wide screens): drag a dish onto a day */
function matches(d, q) {
  if (!q) return true;
  const hay = [d.t, d.name, d.note, d.sub, CAT[d.cat], ...(d.ing || []).map((i) => i.n)].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
function renderShelf() {
  const q = UI.shelfQuery.trim().toLowerCase();
  const ds = allDishes().filter((d) => matches(d, q));
  $('#shelfList').innerHTML = ds.map((d) => `<div class="shelf-row" role="button" tabindex="0" data-act="open-dish" data-dish="${esc(d.id)}" aria-label="${esc(d.t)} öffnen oder auf einen Tag ziehen">${thumbHTML(d)}<span><b>${esc(d.t)}</b><small>${esc(CAT[d.cat] || '')}${d.time ? ` · ${esc(d.time)} Min` : ''}</small></span>${icon('grip')}</div>`).join('')
    || '<p class="fine" style="padding:12px">Nichts gefunden.</p>';
}

/* cookbook */
function srcTag(d) {
  if (d.builtin) return '';
  const t = d.origin === 'scan' ? 'Foto' : d.src && /chefkoch\.de/i.test(d.src.url || '') ? 'Chefkoch' : d.src && /cookidoo\./i.test(d.src.url || '') ? 'Cookidoo' : d.src && d.src.url ? 'Import' : 'Eigenes';
  return `<span class="gpill">${t}</span>`;
}
const CAT_ONE = { fruehstueck: 'Frühstück', haupt: 'Hauptgericht', leicht: 'Salat & Brotzeit', suess: 'Süßes' };
const catOf = (d) => (CAT[d.cat] ? d.cat : 'haupt');
function cardHTML(d, cap) {
  const meta = cap || [d.time ? `${d.time} Min` : '', d.veg ? 'vegetarisch' : '', firstAf(d) && !d.veg ? `Cosori ${firstAf(d).c} °C` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="card" data-act="open-dish" data-dish="${esc(d.id)}" aria-label="${esc(d.t)} öffnen" style="--c:var(--cat-${catOf(d)})">
    <span class="ph">${photoHTML(d, 'm')}${srcTag(d)}${S.favs[d.id] ? `<span class="fav-badge">${icon('heart', 'fill')}</span>` : ''}</span>
    <span class="card-k">${esc(CAT_ONE[catOf(d)])}</span><span class="card-t">${esc(d.t)}</span><span class="card-m">${esc(meta)}</span>
  </button>`;
}
const filterOk = (d, f) => f === 'alle' || d.cat === f || (f === 'fav' && S.favs[d.id]) || (f === 'veg' && d.veg) || (f === 'quick' && d.time && d.time <= 20) || (f === 'cosori' && firstAf(d)) || (f === 'tm' && tmCount(d)) || (f === 'eigene' && !d.builtin);
function promoHTML() {
  if (canScan()) {
    return `<section class="promo" aria-label="Rezept scannen">${imgOf('scan-card', 'm', ' loading="lazy"')}<span class="gpill">${icon('sparkle')}Mit Claude</span>
      <div class="promo-body"><h2>Rezept scannen</h2><p>Kochbuch, Zeitschrift, Rezeptkarte oder ein fertiges Gericht – Antom legt das Rezept mit Einkaufsliste und den Schritten für Cosori und Thermomix an.</p>
      <div class="acts"><button class="btn white" type="button" data-act="scan">${icon('camera')}Foto aufnehmen</button><button class="btn glassy" type="button" data-act="import">Von Chefkoch</button></div></div></section>`;
  }
  return `<section class="promo" aria-label="Rezept übernehmen">${imgOf('scan-card', 'm', ' loading="lazy"')}<span class="gpill">${icon('book')}Kochbuch</span>
    <div class="promo-body"><h2>Neue Rezepte</h2><p>Von Chefkoch oder Cookidoo übernehmen oder selbst eintragen – mit Einkaufsliste und Schritten für Cosori und Thermomix.</p>
    <div class="acts"><button class="btn white" type="button" data-act="import">${icon('download')}Von Chefkoch</button><button class="btn glassy" type="button" data-act="new-dish">Selbst eintragen</button></div></div></section>`;
}
function shelfHTML(title, list, capFn, more) {
  if (list.length < 2) return '';
  return `<h2 class="sec-title">${esc(title)}${more ? `<button type="button" class="link" data-act="filter" data-f="${more}" style="font-size:15px">Alle</button>` : ''}</h2><div class="hscroll">${list.map((d) => cardHTML(d, capFn && capFn(d))).join('')}</div>`;
}
// "Rezept der Woche": the same pick for the whole week, something not eaten lately
function weeklyPick(all) {
  const tk = todayKey();
  const wk = weekKey(thisMonday());
  const pool = all.filter((d) => d.cat !== 'fruehstueck' && d.builtin).filter((d) => { const h = histOf(d.id); return !(h.last && dayDiff(tk, h.last) < 21) && !h.next; });
  const list = pool.length ? pool : all.filter((d) => d.cat !== 'fruehstueck');
  if (!list.length) return null;
  let n = 0;
  for (const ch of wk) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return list[n % list.length];
}
function featureHTML(d) {
  const af = firstAf(d);
  return `<button type="button" class="feature" data-act="open-dish" data-dish="${esc(d.id)}" aria-label="Rezept der Woche: ${esc(d.t)}">${photoHTML(d, 'l')}<span class="tag">${icon('sparkle')}Rezept der Woche</span>
    <h2>${esc(d.name && d.name.length < 34 ? d.name : d.t)}</h2><p>${[d.time ? `${d.time} Min` : '', af ? `Cosori ${af.c} °C` : '', tmCount(d) ? 'Thermomix' : '', d.veg ? 'vegetarisch' : ''].filter(Boolean).join(' · ')}</p></button>`;
}
const CAT_PHOTO = { fruehstueck: 'joghurt', haupt: 'tikka', leicht: 'mozza', suess: 'milchreis' };
const CAT_TILE = { fruehstueck: 'Frühstück', haupt: 'Hauptgerichte', leicht: 'Salate & Brotzeit', suess: 'Süßes' };
function renderBook() {
  const q = UI.query.trim().toLowerCase();
  const all = allDishes();
  const own = all.some((d) => !d.builtin);
  const favs = all.filter((d) => S.favs[d.id]).sort((a, b) => S.favs[b.id] - S.favs[a.id]);
  if (UI.filter === 'eigene' && !own) UI.filter = 'alle';
  if (UI.filter === 'fav' && !favs.length) UI.filter = 'alle';
  $('#bookCap').textContent = `${plural(all.length, 'Rezept', 'Rezepte')} · ${all.filter((d) => firstAf(d)).length} Cosori · ${all.filter((d) => tmCount(d)).length} Thermomix`;
  $('#cats').innerHTML = CATS.map(([k]) => `<button type="button" class="cat-tile" data-act="filter" data-f="${UI.filter === k ? 'alle' : k}" aria-pressed="${UI.filter === k}" style="--c:var(--cat-${k})">${imgOf(CAT_PHOTO[k], 'm')}<b>${CAT_TILE[k]}</b><small>${plural(all.filter((d) => catOf(d) === k).length, 'Rezept', 'Rezepte')}</small></button>`).join('');
  $('#chips').innerHTML = FILTERS.filter(([k]) => !CAT[k] && (k !== 'eigene' || own) && (k !== 'fav' || favs.length))
    .map(([k, l]) => `<button type="button" class="chip" data-act="filter" data-f="${k}" aria-pressed="${UI.filter === k}">${k === 'fav' ? icon('heart', 'fill') : ''}${l}</button>`).join('');
  const f = UI.filter;
  const ds = all.filter((d) => matches(d, q) && filterOk(d, f));
  let html = '';
  if (!q && f === 'alle' && !isLoading()) {
    const pick = weeklyPick(all);
    if (pick) html += featureHTML(pick);
    html += promoHTML();
    html += shelfHTML('Favoriten', favs, null, 'fav');
    const tk = todayKey();
    const again = all.map((d) => ({ d, h: histOf(d.id) })).filter((x) => x.h.last && dayDiff(tk, x.h.last) >= 14 && !x.h.next).sort((a, b) => (a.h.last < b.h.last ? -1 : 1)).map((x) => x.d);
    html += shelfHTML('Lange nicht gegessen', again.slice(0, 10), (d) => `zuletzt ${relDay(histOf(d.id).last)}`);
    html += shelfHTML('Schnell gemacht', all.filter((d) => d.time && d.time <= 20 && d.cat !== 'fruehstueck'), null, 'quick');
    html += '<h2 class="sec-title">Alle Rezepte</h2>';
  } else {
    html += `<p class="result-n">${plural(ds.length, 'Rezept', 'Rezepte')}${q ? ` für „${esc(UI.query.trim())}“` : ''}</p>`;
  }
  html += ds.length
    ? `<div class="grid">${ds.map((d) => cardHTML(d)).join('')}</div>`
    : `<div class="empty"><span class="ph">${imgOf('ph-haupt', 's')}</span><p>Nichts gefunden${q ? ` für „${esc(UI.query.trim())}“` : ''}.</p><div class="acts"><button class="btn primary small" type="button" data-act="new-dish" data-title="${esc(UI.query.trim())}">${icon('plus')}Neues Rezept</button>${q ? `<a class="btn small" href="${chefkochUrl(UI.query)}" target="_blank" rel="noopener">Auf Chefkoch suchen${icon('external')}</a>` : ''}</div></div>`;
  $('#book').innerHTML = html;
}

/* shopping */
function shopDays() {
  const tk = todayKey();
  const cur = isCurWeek();
  return weekDays(UI.week).filter((d) => !(cur && UI.shopRange === 'rest' && d.key < tk));
}
function weekItems() {
  const map = new Map();
  let dishes = 0;
  for (const day of shopDays()) for (const slot of SLOTS) for (const e of dayPlan(day.key)[slot.k]) {
    const d = dish(e.d);
    if (!d) continue;
    dishes++;
    const factor = (e.s || S.settings.people) / (d.sv || 2);
    for (const i of d.ing || []) {
      if (!i || !i.n) continue;
      const key = ingKey(i);
      let it = map.get(key);
      if (!it) map.set(key, (it = { key, n: i.n, pl: i.pl, u: i.u || '', q: 0, hasQ: false, s: AISLE[i.s] ? i.s : 'sonst', p: !!i.p, from: new Map() }));
      if (i.q != null) { it.q += i.q * factor; it.hasQ = true; }
      it.from.set(d.t, (it.from.get(d.t) || 0) + 1);
    }
  }
  const items = [...map.values()].map((it) => Object.assign(it, { qty: it.hasQ ? scaleQ(it.q, it.u, 1, true) : null }));
  return { items, dishes };
}
function shopCounts() {
  if (isLoading()) return { open: 0 };
  const sh = shopOf(weekKey(UI.week));
  const { items } = weekItems();
  return { open: items.filter((i) => (!i.p || sh.need[i.key]) && !sh.checked[i.key]).length + sh.extras.filter((x) => !x.done).length };
}
const fromText = (map) => [...map.entries()].map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(' · ');
const itemLine = (i) => { const a = amountText(i.qty, i.u); return `${a ? a + ' ' : ''}${ingName(i, i.qty)}`; };
function itemHTML(i, done) {
  return `<label class="item${done ? ' done' : ''}"><input type="checkbox" data-act="toggle-item" data-key="${esc(i.key)}"${done ? ' checked' : ''}><span class="check">${icon('check')}</span><span class="item-txt"><span class="nm">${esc(ingName(i, i.qty))}</span><span class="from">${esc(fromText(i.from))}</span></span><span class="qty">${esc(amountText(i.qty, i.u))}</span>${i.p ? `<button type="button" class="mini" data-act="unneed" data-key="${esc(i.key)}" aria-label="${esc(i.n)} zurück in den Vorrat">${icon('undo')}</button>` : ''}</label>`;
}
function extraHTML(x) {
  return `<label class="item${x.done ? ' done' : ''}"><input type="checkbox" data-act="toggle-extra" data-id="${esc(x.id)}"${x.done ? ' checked' : ''}><span class="check">${icon('check')}</span><span class="item-txt"><span class="nm">${esc(x.t)}</span></span><button type="button" class="mini" data-act="del-extra" data-id="${esc(x.id)}" aria-label="${esc(x.t)} löschen">${icon('x')}</button></label>`;
}
function ringHTML(done, total) {
  const r = 24, c = 2 * Math.PI * r;
  const p = total ? done / total : 0;
  const inner = total && done === total ? icon('check') : done ? Math.round(p * 100) + '%' : icon('basket');
  return `<div class="ring${total && done === total ? ' done' : ''}" aria-hidden="true"><svg viewBox="0 0 58 58"><circle class="tr" cx="29" cy="29" r="${r}"/><circle class="pr" cx="29" cy="29" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/></svg><b>${inner}</b></div>`;
}
function renderShop() {
  const box = $('#shop');
  const active = document.activeElement;
  const keep = active && active.id === 'extraInput' ? { v: active.value, at: active.selectionStart } : null;
  $('#shopCap').textContent = `KW ${isoWeek(UI.week).kw} · ${weekRange(UI.week)}`;
  $('#shopTools').innerHTML = weekToolsHTML();
  $('#shopNavL').innerHTML = todayBtnHTML();
  if (isLoading()) { box.innerHTML = '<div class="group skeleton" style="height:90px"></div>'; return; }
  const wk = weekKey(UI.week);
  const sh = shopOf(wk);
  const { items, dishes } = weekItems();
  const regular = items.filter((i) => !i.p || sh.need[i.key]);
  const pantry = items.filter((i) => i.p && !sh.need[i.key]).sort((a, b) => a.n.localeCompare(b.n, 'de'));
  const open = regular.filter((i) => !sh.checked[i.key]);
  const done = regular.filter((i) => sh.checked[i.key]);
  const xOpen = sh.extras.filter((x) => !x.done), xDone = sh.extras.filter((x) => x.done);
  const total = regular.length + sh.extras.length, doneN = done.length + xDone.length, openN = total - doneN;
  const cur = isCurWeek();
  const rangeTxt = cur && UI.shopRange === 'rest' ? 'ab heute' : 'für die ganze Woche';
  let html = `<div class="sum-card${total && !openN ? ' done' : ''}"><div class="sum">${ringHTML(doneN, total)}<div class="sum-txt"><b>${openN ? `${openN} offen` : total ? 'Alles erledigt' : 'Nichts zu kaufen'}</b><small>${plural(dishes, 'Gericht', 'Gerichte')} ${rangeTxt} · ${persons(S.settings.people)}</small></div></div>${cur ? `<div class="seg-wrap"><div class="seg" role="tablist" aria-label="Zeitraum"><button type="button" role="tab" data-act="shop-range" data-r="rest" aria-selected="${UI.shopRange === 'rest'}">Ab heute</button><button type="button" role="tab" data-act="shop-range" data-r="week" aria-selected="${UI.shopRange !== 'rest'}">Ganze Woche</button></div></div>` : ''}</div>`;
  html += `<form class="group add-item" id="extraForm" style="margin-top:14px"><span class="plus" aria-hidden="true">${icon('plus')}</span><label class="vh" for="extraInput">Eigenen Artikel hinzufügen</label><input id="extraInput" maxlength="120" placeholder="Artikel hinzufügen, z. B. Kaffee" autocomplete="off" enterkeyhint="done"></form>`;
  if (xOpen.length) html += `<h2 class="aisle-h"><span class="tile" style="--tile:var(--accent)">${icon('bag')}</span>Eigene Artikel<em>${xOpen.length}</em></h2><div class="group">${xOpen.map(extraHTML).join('')}</div>`;
  for (const [k, label] of AISLES) {
    const list = open.filter((i) => i.s === k).sort((a, b) => a.n.localeCompare(b.n, 'de'));
    if (!list.length) continue;
    html += `<h2 class="aisle-h"><span class="tile" style="--tile:${AISLE_COLOR[k]}">${icon(AISLE_ICON[k])}</span>${esc(label)}<em>${list.length}</em></h2><div class="group">${list.map((i) => itemHTML(i, false)).join('')}</div>`;
  }
  if (!open.length && !xOpen.length) {
    html += `<div class="shop-empty">${imgOf('ob-einkauf', 'm', ' loading="lazy"')}<h2>${total ? 'Alles im Korb' : 'Noch nichts zu kaufen'}</h2><p>${total ? 'Schönen Einkauf gehabt – alles ist abgehakt.' : 'Plant Gerichte für die Woche, dann landen die Zutaten automatisch hier, sortiert nach Abteilung.'}</p></div>`;
  }
  if (doneN) {
    html += `<details class="fold"${prefs.get('doneOpen', false) ? ' open' : ''} data-fold="doneOpen"><summary>${icon('chevron-right', 'chev')}Erledigt <small>${doneN}</small></summary><div class="group">${xDone.map(extraHTML).join('')}${done.map((i) => itemHTML(i, true)).join('')}</div><div style="margin-top:12px"><button class="btn small" type="button" data-act="clear-checked">${icon('trash')}Erledigte entfernen</button></div></details>`;
  }
  if (pantry.length) {
    html += `<details class="fold"${prefs.get('pantryOpen', false) ? ' open' : ''} data-fold="pantryOpen"><summary>${icon('chevron-right', 'chev')}Vorrat <small>${pantry.length} · meist zu Hause</small></summary><p class="fine" style="margin:0 4px 10px">Tippt an, was fehlt – dann kommt es auf die Liste.</p><div class="pantry">${pantry.map((i) => `<button type="button" class="pchip" data-act="need" data-key="${esc(i.key)}" aria-label="${esc(i.n)} fehlt – auf die Liste">${icon('plus')}${esc(i.n)}</button>`).join('')}</div></details>`;
  }
  box.innerHTML = html;
  if (keep) {
    const input = $('#extraInput');
    input.value = keep.v;
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(keep.at, keep.at); } catch (e) { /* not a text field */ }
  }
}
function weekListText() {
  const { items } = weekItems();
  const sh = shopOf(weekKey(UI.week));
  const days = shopDays();
  const span = days.length === 7 ? `KW ${isoWeek(UI.week).kw}` : `${days[0] ? days[0].short : ''}–So, KW ${isoWeek(UI.week).kw}`;
  const lines = [`Einkaufsliste ${span}`];
  const extras = sh.extras.filter((x) => !x.done);
  if (extras.length) { lines.push('', 'Eigene Artikel'); for (const x of extras) lines.push('• ' + x.t); }
  for (const [k, label] of AISLES) {
    const list = items.filter((i) => i.s === k && (!i.p || sh.need[i.key]) && !sh.checked[i.key]);
    if (!list.length) continue;
    lines.push('', label);
    for (const i of list.sort((a, b) => a.n.localeCompare(b.n, 'de'))) lines.push('• ' + itemLine(i));
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/* ---------- drag & drop ---------- */
const sortables = { slots: [], shelf: null, trash: null };
let lastDragEnd = 0;
const HAS_SORTABLE = typeof window.Sortable === 'function';
const dragGuard = () => Date.now() - lastDragEnd < 400;
const dragBase = {
  animation: reduceMotion ? 0 : 200,
  easing: 'cubic-bezier(.2, .8, .2, 1)',
  delay: 320,
  delayOnTouchOnly: true,
  touchStartThreshold: 6,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 4,
  ghostClass: 'is-ghost',
  chosenClass: 'is-chosen',
  dragClass: 'is-drag',
  fallbackClass: 'is-fallback',
  scroll: true,
  scrollSensitivity: 90,
  scrollSpeed: 14,
  bubbleScroll: true,
  emptyInsertThreshold: 24,
};
function onDragStart(evt) {
  S.dragging = true;
  document.documentElement.classList.add('is-dragging');
  if (evt.from.classList.contains('slot')) $('#trash').hidden = false;
  haptic(14);
}
function onDragEnd(evt) {
  S.dragging = false;
  lastDragEnd = Date.now();
  document.documentElement.classList.remove('is-dragging');
  const trash = $('#trash');
  trash.hidden = true;
  trash.classList.remove('is-over');
  const from = evt.from, to = evt.to, item = evt.item;
  const fromSlot = from.classList.contains('slot');
  const toSlot = to.classList.contains('slot');
  let at = 0;
  for (let el = item.previousElementSibling; el; el = el.previousElementSibling) if (el.classList.contains('meal')) at++;
  if (!fromSlot) {
    if (to !== from && item.parentNode === to) item.remove();
    if (toSlot && item.dataset.dish) {
      const before = snapshot();
      addEntry(to.dataset.date, to.dataset.slot, item.dataset.dish, at);
      const d = dish(item.dataset.dish);
      toast(`${d ? d.t : 'Gericht'}: ${dayName(to.dataset.date)}, ${SLOT[to.dataset.slot].name}`, { undo: () => restore(before) });
    }
    setTimeout(renderAll, 0);
    return;
  }
  const uid = item.dataset.uid;
  if (to === trash) {
    item.remove();
    const before = snapshot();
    const f = removeEntry(uid);
    if (f) { const d = dish(f.entry.d); toast(`${d ? d.t : 'Gericht'} vom Plan genommen`, { undo: () => restore(before) }); }
    setTimeout(renderAll, 0);
    return;
  }
  if (toSlot && uid && (to !== from || evt.oldDraggableIndex !== evt.newDraggableIndex)) {
    moveEntry(uid, to.dataset.date, to.dataset.slot, at);
    haptic(8);
  }
  setTimeout(renderAll, 0);
}
function destroySlotSortables() {
  for (const s of sortables.slots) { try { s.destroy(); } catch (e) { /* gone */ } }
  sortables.slots = [];
}
function initSlotSortables() {
  if (!HAS_SORTABLE) return;
  for (const el of $$('#days .slot')) {
    sortables.slots.push(window.Sortable.create(el, Object.assign({}, dragBase, {
      group: { name: 'plan', pull: true, put: true },
      draggable: '.meal',
      filter: '.add-meal, .skeleton',
      preventOnFilter: false,
      onStart: onDragStart,
      onEnd: onDragEnd,
      onMove: (evt) => { $('#trash').classList.toggle('is-over', evt.to.id === 'trash'); return true; },
    })));
  }
}
function initSortables() {
  if (!HAS_SORTABLE) return;
  sortables.trash = window.Sortable.create($('#trash'), Object.assign({}, dragBase, { group: { name: 'plan', pull: false, put: true }, sort: false, draggable: '.meal' }));
  sortables.shelf = window.Sortable.create($('#shelfList'), Object.assign({}, dragBase, {
    group: { name: 'plan', pull: 'clone', put: false },
    sort: false,
    draggable: '.shelf-row',
    disabled: !wideMQ.matches,
    onStart: onDragStart,
    onEnd: onDragEnd,
  }));
}
wideMQ.addEventListener('change', () => { if (sortables.shelf) sortables.shelf.option('disabled', !wideMQ.matches); });

/* ---------- tabs and the collapsing title ---------- */
function setTab(tab) {
  const view = $(`#v-${tab}`);
  if (UI.tab === tab) { if (view.scrollTop > 0) view.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
  UI.tab = tab;
  $('#app').dataset.tab = tab;
  for (const b of $$('.tabbar [data-tab], .side-nav [data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
  view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  onViewScroll(view);
}
function onViewScroll(v) {
  const h1 = v.querySelector('.lt h1, .band h1');
  const nav = v.querySelector('.nav');
  if (!h1 || !nav) return;
  v.classList.toggle('is-scrolled', h1.getBoundingClientRect().bottom < nav.getBoundingClientRect().bottom + 2);
}
for (const v of $$('.view')) {
  let raf = 0;
  v.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; onViewScroll(v); }); }, { passive: true });
}

