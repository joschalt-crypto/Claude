<script>
/* Antom web app: window.claude for the family server. It offers the same db, user and
   sample interface the Claude artifact gives the page, backed by /f/<key>/api. The plan is
   also kept on the phone, so the app opens without internet; changes wait in a queue until
   the server has them, and other phones' changes arrive every few seconds. */
(() => {
  'use strict';
  const m = location.pathname.match(/^\/f\/([A-Za-z0-9_-]{16,128})\//);
  if (!m) return;
  const BASE = `/f/${m[1]}/`;
  const API = BASE + 'api/';
  const CACHE_KEY = 'antom.web.cache';
  const QUEUE_KEY = 'antom.web.queue';
  const POLL_MS = 4000;
  const LARGE = /^(photos|diag)\//; // fetched when needed, not kept in the copy on the phone
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const colOf = (p) => p.slice(0, p.lastIndexOf('/'));
  const idOf = (p) => p.slice(p.lastIndexOf('/') + 1);

  let cache = read(CACHE_KEY) || { epoch: '', t: 0, docs: {} };
  let queue = read(QUEUE_KEY) || {}; // path → { data } (null data = delete), in order of the first change
  const listeners = new Map();
  const status = { online: navigator.onLine !== false, ready: false };

  const value = (p) => (p in queue ? queue[p].data : cache.docs[p]);
  const pending = () => Object.keys(queue).length;
  function announce() {
    window.dispatchEvent(new CustomEvent('antom-sync', { detail: { online: status.online, pending: pending() } }));
  }
  function setOnline(v) { if (status.online !== v) { status.online = v; announce(); } }

  function snapshot(col) {
    const paths = new Set();
    for (const p of Object.keys(cache.docs)) if (colOf(p) === col) paths.add(p);
    for (const p of Object.keys(queue)) if (colOf(p) === col) paths.add(p);
    const docs = [];
    for (const p of paths) {
      const v = value(p);
      if (v != null) docs.push({ id: idOf(p), exists: true, data: () => clone(v) });
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !status.online, hasPendingWrites: !!pending() } };
  }
  function emit(col) {
    for (const cb of listeners.get(col) || []) { try { cb(snapshot(col)); } catch (e) { console.error(e); } }
  }

  // body: an object is sent as JSON, a string as plain text
  async function call(method, route, body) {
    const text = typeof body === 'string';
    let res;
    try {
      res = await fetch(API + route, {
        method, cache: 'no-store',
        headers: body === undefined ? {} : { 'content-type': text ? 'text/plain;charset=utf-8' : 'application/json' },
        body: body === undefined ? undefined : text ? body : JSON.stringify(body),
      });
    } catch (e) { setOnline(false); throw { code: 'offline' }; }
    setOnline(true);
    if (res.status === 404 || res.status === 401) throw { code: 'not_granted' };
    if (res.status === 413) throw { code: 'too_large' };
    if (!res.ok) throw { code: 'unavailable', status: res.status };
    return res.json();
  }

  // what changed on the server since the last time
  async function pull() {
    const res = await call('GET', `sync?since=${cache.epoch ? cache.t : 0}`);
    const touched = new Set();
    if (res.epoch !== cache.epoch) {
      for (const p of Object.keys(cache.docs)) touched.add(colOf(p));
      cache = { epoch: res.epoch, t: 0, docs: {} };
    }
    for (const d of res.docs) {
      if (d.path in queue) continue; // our own newer change wins until it is sent
      if (d.data == null) delete cache.docs[d.path]; else cache.docs[d.path] = d.data;
      touched.add(colOf(d.path));
    }
    cache.t = res.now;
    store(CACHE_KEY, cache);
    for (const col of touched) emit(col);
  }

  // send waiting changes in order; stop at the first one the server can't take yet
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    const run = (async () => {
      for (const p of Object.keys(queue)) {
        const w = queue[p];
        try {
          if (w.data == null) await call('DELETE', 'doc/' + p); else await call('PUT', 'doc/' + p, w.data);
        } catch (e) {
          if (e.code !== 'too_large') throw e; // offline or server trouble: keep it for later
        }
        if (queue[p] === w) {
          delete queue[p];
          if (!LARGE.test(p)) { if (w.data == null) delete cache.docs[p]; else cache.docs[p] = w.data; store(CACHE_KEY, cache); }
          store(QUEUE_KEY, queue);
        }
        announce();
      }
    })();
    // cleared only after the assignment, even when there was nothing to send
    flushing = run;
    const done = () => { if (flushing === run) flushing = null; };
    run.then(done, done);
    return run;
  }
  function change(path, data) {
    queue[path] = { data: data == null ? null : clone(data) };
    store(QUEUE_KEY, queue);
    if (!LARGE.test(path)) emit(colOf(path));
    announce();
    flush().catch(() => {});
  }

  let timer = 0;
  function schedule(ms) {
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') return;
    timer = setTimeout(tick, ms);
  }
  async function tick() {
    try { await flush(); await pull(); } catch (e) { /* offline: try again later */ }
    schedule(status.online ? POLL_MS : 15000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0); });
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => setOnline(false));

  const ready = (async () => {
    try { await pull(); } catch (e) {
      if (e.code === 'not_granted' || !cache.epoch) return false; // no plan yet and no connection
    }
    status.ready = true;
    flush().catch(() => {});
    schedule(POLL_MS);
    announce();
    return true;
  })();

  const db = {
    doc(path) {
      const id = idOf(path);
      return {
        path, id,
        async get() {
          if (LARGE.test(path) && !(path in queue)) {
            try { const r = await call('GET', 'doc/' + path); return { id, exists: r.data != null, data: () => clone(r.data) }; } catch (e) { return { id, exists: false, data: () => undefined }; }
          }
          const v = value(path);
          return { id, exists: v != null, data: () => clone(v) };
        },
        async set(data) { change(path, data); },
        async delete() { change(path, null); },
      };
    },
    collection(col) {
      return {
        path: col,
        onSnapshot(cb) {
          if (!listeners.has(col)) listeners.set(col, new Set());
          listeners.get(col).add(cb);
          setTimeout(() => cb(snapshot(col)), 0);
          return () => listeners.get(col).delete(cb);
        },
        async get() { return snapshot(col); },
        doc(id) { return db.doc(col + '/' + id); },
      };
    },
  };

  const user = { can: async () => true, isOwner: async () => true, canEdit: async () => true };

  // Claude: the server asks Claude with the family's API key and returns the answer as text;
  // photos travel as files
  async function ask(input, opts = {}) {
    const prompt = typeof input === 'string' ? input
      : Array.isArray(input) ? input.filter((x) => x && x.role === 'user').map((x) => String(x.content)).join('\n\n') : '';
    const form = new FormData();
    form.append('prompt', prompt);
    for (const b of opts.images || []) {
      const type = /^image\/(jpeg|png|webp|gif)$/.test(b.type) ? b.type : 'image/jpeg';
      form.append('image', new File([b], 'foto.' + type.slice(6), { type }));
    }
    let res;
    try {
      res = await fetch(API + 'claude', { method: 'POST', body: form, signal: opts.signal });
    } catch (e) {
      throw { code: opts.signal && opts.signal.aborted ? 'cancelled' : 'offline' };
    }
    let body = {};
    try { body = await res.json(); } catch (e) { body = {}; }
    if (!res.ok) throw { code: body.error || 'upstream_error' };
    if (opts.onText) { try { opts.onText({ text: body.text, delta: body.text }); } catch (e) { /* page callback */ } }
    return body;
  }
  const sample = async (input, opts) => { const r = await ask(input, opts); return { text: r.text, truncated: !!r.truncated }; };
  sample.json = async (input, opts) => {
    const r = await ask(input, opts);
    const t = String(r.text || '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { throw { code: 'invalid_json', text: t }; }
  };
  sample.limits = async () => ({ images: { maxCount: 3 } });

  window.claude = {
    use: async (name) => {
      if (name === 'db') return (await ready) ? db : null;
      if (name === 'user') return user;
      if (name === 'sample') return sample;
      return null;
    },
  };
  // Backups move in parts of about half a megabyte, so the server never has to handle a
  // whole plan with all its photos in one request.
  const PART = 512 * 1024;
  const PATH = /^(days|dishes|meta|shop|photos|plan|diag)\/[A-Za-z0-9_.:-]{1,100}$/;
  async function exportData() {
    const docs = {};
    for (let after = '', more = true; more;) {
      const r = await call('GET', 'export?after=' + encodeURIComponent(after));
      Object.assign(docs, r.docs);
      more = !!r.next;
      after = r.next || '';
    }
    return { app: 'antom', version: 1, exported: Date.now(), docs };
  }
  // replaces the plan for everyone; documents that are not in the backup disappear
  async function importData(data) {
    if (!data || data.app !== 'antom' || !data.docs || typeof data.docs !== 'object') throw { code: 'not_antom' };
    await flush();
    const { mark } = await call('POST', 'import/begin');
    let lines = [], size = 0, stored = 0;
    const send = async () => {
      if (!lines.length) return;
      stored += (await call('POST', 'import/part', lines.join('\n'))).stored;
      lines = [];
      size = 0;
    };
    for (const [p, v] of Object.entries(data.docs)) {
      if (!PATH.test(p) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const line = p + '\t' + JSON.stringify(v);
      if (size && size + line.length > PART) await send();
      lines.push(line);
      size += line.length + 1;
    }
    await send();
    await call('POST', 'import/end?mark=' + mark);
    queue = {};
    store(QUEUE_KEY, queue);
    await pull();
    announce();
    return { imported: stored };
  }

  // for the settings: invite link, backups, sync state
  window.antomWeb = {
    invite: () => location.origin + BASE,
    state: () => ({ online: status.online, pending: pending(), ready: status.ready }),
    exportData,
    importData,
  };
})();
</script>
