// The family's shared plan: one Durable Object with SQLite, holding the same documents
// the artifact database held (days/<date>, dishes/<id>, meta/*, shop/<week>, photos/<id>).
// Every write gets a growing timestamp t, so apps fetch only what changed since their last
// sync; a deletion stays as a row without data until every app has seen it.
// Stored JSON is passed on as text and backups move in parts: on the free Cloudflare plan a
// request may use only 10 ms of computing time, too little to re-encode megabytes of photos.
import { DurableObject } from 'cloudflare:workers';

const PATH_RE = /^(days|dishes|meta|shop|photos|plan|diag)\/[A-Za-z0-9_.:-]{1,100}$/;
const NOT_SYNCED = /^(photos|diag)\//; // fetched on demand, too large for every sync
const MAX_DOC = 900 * 1024;
const MAX_PART = 2 * 1024 * 1024; // one part of a backup being loaded
const EXPORT_PART = 1024 * 1024; // one part of a backup being saved
const TOMBSTONE_DAYS = 120;
const UPSERT = 'INSERT INTO docs (path, data, t) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET data = excluded.data, t = excluded.t';

const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export class Family extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT, t INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS docs_t ON docs (t)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, n INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS info (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    // a fresh database gets a new epoch, so apps notice and fetch everything again
    if (!this.sql.exec("SELECT v FROM info WHERE k = 'epoch'").toArray().length) {
      this.sql.exec("INSERT INTO info (k, v) VALUES ('epoch', ?)", crypto.randomUUID());
    }
    this.epoch = this.sql.exec("SELECT v FROM info WHERE k = 'epoch'").one().v;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const route = url.pathname.slice(1);
    try {
      if (route === 'sync' && req.method === 'GET') return this.sync(Number(url.searchParams.get('since')) || 0);
      if (route.startsWith('doc/')) return await this.doc(req, route.slice(4));
      if (route === 'export' && req.method === 'GET') return this.export(url.searchParams.get('after') || '');
      if (route === 'import/begin' && req.method === 'POST') return json({ mark: this.tick() });
      if (route === 'import/part' && req.method === 'POST') return await this.importPart(req);
      if (route === 'import/end' && req.method === 'POST') return this.importEnd(Number(url.searchParams.get('mark')) || 0);
      if (route === 'quota' && req.method === 'POST') return this.quota(Number(url.searchParams.get('limit')) || 40);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server_error' }, 500);
    }
  }

  // timestamps only grow, even if the clock jumps back
  tick() {
    const last = this.sql.exec('SELECT MAX(t) AS t FROM docs').one().t || 0;
    return Math.max(Date.now(), last + 1);
  }

  // documents changed after `since`; the stored JSON is passed through without parsing
  sync(since) {
    const parts = [];
    let now = since;
    for (const r of this.sql.exec('SELECT path, data, t FROM docs WHERE t > ? ORDER BY t', since)) {
      if (r.t > now) now = r.t;
      if (NOT_SYNCED.test(r.path) || (since === 0 && r.data === null)) continue;
      parts.push(`{"path":${JSON.stringify(r.path)},"t":${r.t},"data":${r.data === null ? 'null' : r.data}}`);
    }
    return json(`{"epoch":${JSON.stringify(this.epoch)},"now":${now},"docs":[${parts.join(',')}]}`);
  }

  async doc(req, path) {
    if (!PATH_RE.test(path)) return json({ error: 'invalid_path' }, 400);
    if (req.method === 'GET') {
      const r = this.sql.exec('SELECT data, t FROM docs WHERE path = ?', path).toArray()[0];
      return json(`{"t":${r ? r.t : 0},"data":${r && r.data !== null ? r.data : 'null'}}`);
    }
    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_DOC) return json({ error: 'too_large' }, 413);
      if (!isObject(text)) return json({ error: 'invalid_json' }, 400);
      const t = this.tick();
      this.sql.exec(UPSERT, path, text, t);
      return json({ t });
    }
    if (req.method === 'DELETE') {
      const t = this.tick();
      this.sql.exec('INSERT INTO docs (path, data, t) VALUES (?, NULL, ?) ON CONFLICT (path) DO UPDATE SET data = NULL, t = excluded.t', path, t);
      this.prune();
      return json({ t });
    }
    return json({ error: 'method' }, 405);
  }

  prune() {
    if (Math.random() > 0.05) return;
    this.sql.exec('DELETE FROM docs WHERE data IS NULL AND t < ?', Date.now() - TOMBSTONE_DAYS * 86400000);
  }

  // a backup of everything, photos included, in parts of about a megabyte (sorted by path;
  // `next` says where the following part starts)
  export(after) {
    const parts = [];
    let size = 0, last = '', more = false;
    for (const r of this.sql.exec('SELECT path, data FROM docs WHERE data IS NOT NULL AND path > ? ORDER BY path', after)) {
      parts.push(`${JSON.stringify(r.path)}:${r.data}`);
      size += r.data.length;
      last = r.path;
      if (size >= EXPORT_PART) { more = true; break; }
    }
    return json(`{"app":"antom","version":1,"exported":${Date.now()},"next":${more ? JSON.stringify(last) : 'null'},"docs":{${parts.join(',')}}}`);
  }

  // Loading a backup (or the move from the Claude version) replaces the whole plan:
  // import/begin gives a mark, import/part stores documents (one "path<TAB>json" per line),
  // import/end removes what was there before the mark and was not in the backup.
  async importPart(req) {
    const text = await req.text();
    if (text.length > MAX_PART) return json({ error: 'too_large' }, 413);
    let stored = 0, skipped = 0, t = this.tick();
    for (const line of text.split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      const path = line.slice(0, tab), data = line.slice(tab + 1);
      if (tab < 1 || !PATH_RE.test(path) || data.length > MAX_DOC || !isObject(data)) { skipped++; continue; }
      this.sql.exec(UPSERT, path, data, t++);
      stored++;
    }
    return json({ stored, skipped });
  }

  importEnd(mark) {
    if (!mark) return json({ error: 'invalid_request' }, 400);
    const removed = this.sql.exec('SELECT COUNT(*) AS n FROM docs WHERE data IS NOT NULL AND t < ?', mark).one().n;
    this.sql.exec('UPDATE docs SET data = NULL, t = ? WHERE data IS NOT NULL AND t < ?', this.tick(), mark);
    return json({ removed });
  }

  // count Claude requests per day (UTC); refuse beyond the limit
  quota(limit) {
    const day = new Date().toISOString().slice(0, 10);
    const row = this.sql.exec('SELECT n FROM usage WHERE day = ?', day).toArray()[0];
    const n = row ? row.n : 0;
    if (n >= limit) return json({ error: 'daily_limit', n }, 429);
    this.sql.exec('INSERT INTO usage (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1', day);
    this.sql.exec('DELETE FROM usage WHERE day < ?', new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10));
    return json({ n: n + 1, limit });
  }
}

// stored documents are JSON objects: they go into every sync unchanged
function isObject(text) {
  try {
    const v = JSON.parse(text);
    return !!v && typeof v === 'object' && !Array.isArray(v);
  } catch (e) {
    return false;
  }
}
