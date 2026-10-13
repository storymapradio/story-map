/* local-supabase.js: a stand-in for supabase-js that keeps everything on this device.
 *
 * The open instruments are the same code as the instruments on asynchronousinstruments.com. Where the site
 * talks to its database, these talk to this file instead: the same calls (from, select, insert, update,
 * upsert, delete and their filters; storage uploads and links; auth sessions; rpc; functions), answered
 * from IndexedDB in this browser. There is no server, no account and no network. One person, you, is
 * always signed in.
 *
 *   window.supabase.createClient()  returns the one local client, whatever url or key it is given
 *   LocalSupabase.configure(cfg)     the instrument's own part (open/instruments/<name>/local.js):
 *     name        the IndexedDB name for this instrument's data
 *     you         { display_name, email } for the person on this device
 *     pk          { table: 'id' | ['a', 'b'] }   primary keys, 'id' unless named
 *     defaults    { table: { column: value | '$uid' | '$now' | '$uuid' } }   what the database fills in
 *     relations   { table: { rel: { table, local, foreign, many } } }       for embedded selects
 *     rpc         { name: async (args, db) => data }
 *     functions   { name: async (body, db) => data }
 *     seed        { version, tables: { table: rows[] } }   starter content, merged in by key once per version
 *     seedUrl     the same, as a JSON file beside the page (copied there by the recipe's copy list)
 *     events      { 'INITIAL_SESSION' }   the auth events to announce on subscribe
 *   LocalSupabase.ready, .db, .export(), .reset()
 */
(function () {
  'use strict';
  var CFG = { name: 'instrument', you: {}, pk: {}, defaults: {}, relations: {}, rpc: {}, functions: {}, seed: null, events: ['INITIAL_SESSION'] };
  var LOCAL_HOST = 'local-supabase.invalid';

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }

  /* ── the person on this device ── */
  var uid;
  try { uid = localStorage.getItem('local-supabase:uid'); if (!uid) { uid = uuid(); localStorage.setItem('local-supabase:uid', uid); } } catch (e) { uid = uuid(); }
  var bornAt;
  try { bornAt = localStorage.getItem('local-supabase:since'); if (!bornAt) { bornAt = nowIso(); localStorage.setItem('local-supabase:since', bornAt); } } catch (e) { bornAt = nowIso(); }
  function user() {
    var y = CFG.you || {};
    return { id: uid, aud: 'authenticated', role: 'authenticated', email: y.email || 'you@this.device', phone: '',
      app_metadata: { provider: 'local', providers: ['local'] }, user_metadata: { display_name: y.display_name || 'You', full_name: y.display_name || 'You' },
      created_at: bornAt, updated_at: bornAt, last_sign_in_at: bornAt, identities: [] };
  }
  function session() {
    return { access_token: 'local', refresh_token: 'local', token_type: 'bearer', expires_in: 315360000,
      expires_at: Math.floor(Date.now() / 1000) + 315360000, user: user() };
  }

  /* ── IndexedDB: one record per table, one per stored file ── */
  var T = {}, F = {}, URLS = {}, idb = null;
  function openIdb() {
    return new Promise(function (res) {
      if (!window.indexedDB) { res(null); return; }
      var rq;
      try { rq = indexedDB.open('local-supabase:' + CFG.name, 1); } catch (e) { res(null); return; }
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains('tables')) d.createObjectStore('tables');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { res(null); };
      rq.onblocked = function () { res(null); };
    });
  }
  function all(store) {
    return new Promise(function (res) {
      if (!idb) { res({}); return; }
      var out = {}, tx = idb.transaction(store, 'readonly'), os = tx.objectStore(store), rq = os.openCursor();
      rq.onsuccess = function () { var c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      rq.onerror = function () { res(out); };
    });
  }
  function put(store, key, val) {
    return new Promise(function (res) {
      if (!idb) { res(); return; }
      try {
        var tx = idb.transaction(store, 'readwrite');
        if (val === undefined) tx.objectStore(store).delete(key); else tx.objectStore(store).put(val, key);
        tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; tx.onabort = function () { res(); };
      } catch (e) { res(); }
    });
  }
  function saveTable(t) { return put('tables', t, T[t] || []); }
  function rows(t) { if (!T[t]) T[t] = []; return T[t]; }
  function pkOf(t) { var k = CFG.pk[t] || 'id'; return Array.isArray(k) ? k : [k]; }
  function keyOf(t, r) { return pkOf(t).map(function (k) { return JSON.stringify(r[k]); }).join('|'); }

  var readyResolve, configured = false;
  var ready = new Promise(function (res) { readyResolve = res; });
  async function boot() {
    idb = await openIdb();
    T = await all('tables');
    F = await all('files');
    var meta = await all('meta');
    /* starter content can sit beside the page as a file (seedUrl), so a large seed never has to be inlined */
    if (!CFG.seed && CFG.seedUrl) {
      try { var sr = await (realFetch || window.fetch)(CFG.seedUrl); if (sr.ok) CFG.seed = await sr.json(); } catch (e) { console.warn('local-supabase: no seed at ' + CFG.seedUrl); }
    }
    var s = CFG.seed;
    if (s && s.tables && meta.seed !== s.version) {
      Object.keys(s.tables).forEach(function (t) {
        var have = {}; rows(t).forEach(function (r) { have[keyOf(t, r)] = true; });
        s.tables[t].forEach(function (r) {
          var row = clone(r);
          Object.keys(row).forEach(function (c) { if (row[c] === '$uid') row[c] = uid; if (row[c] === '$now') row[c] = nowIso(); });
          if (!have[keyOf(t, row)]) rows(t).push(row);
        });
      });
      await Promise.all(Object.keys(s.tables).map(saveTable));
      await put('meta', 'seed', s.version);
    }
    readyResolve();
  }
  /* boot once the instrument has said who it is (local.js), or once the page has read all its scripts if it never does */
  function fallback() { if (!configured) { configured = true; boot(); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fallback); else setTimeout(fallback, 0);

  /* ── reading a column: plain names, json paths (meta->a->>b), casts (col::text) ── */
  function colGet(row, path) {
    var p = String(path).trim().replace(/::\w+$/, '');
    if (p.indexOf('->') < 0) return row == null ? undefined : row[p];
    var parts = p.split(/->>?/), v = row == null ? undefined : row[parts[0].trim()];
    for (var i = 1; i < parts.length && v != null; i++) { var k = parts[i].trim().replace(/^'|'$/g, ''); v = v[k]; }
    return v;
  }
  function likeRe(pat, ci) {
    var s = String(pat).replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.').replace(/\*/g, '.*');
    return new RegExp('^' + s + '$', ci ? 'i' : '');
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0; if (a == null) return -1; if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    var na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && typeof a !== 'object' && typeof b !== 'object' && !/^\d{4}-\d\d-\d\d/.test(String(a))) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function eqv(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return String(a) === String(b);
  }
  function parseList(v) {
    if (Array.isArray(v)) return v;
    var s = String(v).trim().replace(/^\(|\)$/g, '').replace(/^\{|\}$/g, '');
    return s ? s.split(',').map(function (x) { return x.trim().replace(/^"|"$/g, ''); }) : [];
  }
  function lit(v) {
    if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false;
    return v;
  }
  function test(row, op, col, val) {
    var v = colGet(row, col);
    switch (op) {
      case 'eq': return eqv(v, val);
      case 'neq': return !eqv(v, val);
      case 'gt': return v != null && cmp(v, val) > 0;
      case 'gte': return v != null && cmp(v, val) >= 0;
      case 'lt': return v != null && cmp(v, val) < 0;
      case 'lte': return v != null && cmp(v, val) <= 0;
      case 'like': return v != null && likeRe(val).test(String(v));
      case 'ilike': return v != null && likeRe(val, true).test(String(v));
      case 'is': return val === null || val === 'null' ? v == null : val === 'not.null' ? v != null : eqv(!!v, val === true || val === 'true');
      case 'in': return parseList(val).some(function (x) { return eqv(v, x); });
      case 'cs': {
        if (v == null) return false;
        if (Array.isArray(v)) return parseList(val).every(function (x) { return v.some(function (y) { return eqv(y, x); }); });
        if (typeof v === 'object') { var o = typeof val === 'string' ? JSON.parse(val) : val; return Object.keys(o).every(function (k) { return eqv(v[k], o[k]); }); }
        return String(v).indexOf(String(val)) >= 0;
      }
      case 'cd': return Array.isArray(v) && v.every(function (y) { return parseList(val).some(function (x) { return eqv(x, y); }); });
      case 'ov': return Array.isArray(v) && parseList(val).some(function (x) { return v.some(function (y) { return eqv(y, x); }); });
      case 'fts': case 'plfts': case 'phfts': case 'wfts':
        return v != null && String(val).toLowerCase().split(/[\s&|!]+/).filter(Boolean).every(function (w) { return String(v).toLowerCase().indexOf(w.replace(/'/g, '')) >= 0; });
      case 'match': return v != null && new RegExp(val).test(String(v));
      case 'imatch': return v != null && new RegExp(val, 'i').test(String(v));
    }
    return true;
  }
  /* PostgREST's or=(a.eq.1,and(b.gt.2,c.is.null)) */
  function splitTop(s) {
    var out = [], depth = 0, cur = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') q = !q;
      if (!q && ch === '(') depth++;
      if (!q && ch === ')') depth--;
      if (!q && ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  function parseCond(s) {
    s = s.trim();
    var m = /^(and|or|not\.and|not\.or)\((.*)\)$/.exec(s);
    if (m) { var kids = splitTop(m[2]).map(parseCond); return { group: m[1].replace('not.', ''), not: m[1].indexOf('not.') === 0, kids: kids }; }
    var dot = s.indexOf('.'), col = s.slice(0, dot), rest = s.slice(dot + 1), neg = false;
    if (rest.indexOf('not.') === 0) { neg = true; rest = rest.slice(4); }
    var d2 = rest.indexOf('.'), op = rest.slice(0, d2), val = rest.slice(d2 + 1);
    return { col: col, op: op, val: op === 'in' ? val : lit(val.replace(/^"|"$/g, '')), not: neg };
  }
  function evalCond(row, c) {
    var r;
    if (c.group) r = c.group === 'and' ? c.kids.every(function (k) { return evalCond(row, k); }) : c.kids.some(function (k) { return evalCond(row, k); });
    else r = test(row, c.op, c.col, c.val);
    return c.not ? !r : r;
  }
  function passes(row, f) {
    for (var i = 0; i < f.length; i++) {
      var x = f[i];
      if (x.or) { if (!evalCond(row, { group: 'or', kids: splitTop(x.or).map(parseCond) })) return false; continue; }
      var r = test(row, x.op, x.col, x.val);
      if (x.not ? r : !r) return false;
    }
    return true;
  }

  /* ── select strings: '*', 'a, b:c', 'rel(*)', 'alias:rel!inner(a, b)', 'count' ── */
  function parseSelect(s) {
    var parts = splitTop(String(s == null ? '*' : s).replace(/\s+/g, ' ')), out = [];
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      var m = /^(?:([\w]+):)?([\w-]+)(?:!([\w]+))?\s*\((.*)\)$/.exec(p);
      if (m) { out.push({ embed: true, alias: m[1] || m[2], rel: m[2], hint: m[3] || '', inner: m[3] === 'inner', cols: m[4] }); return; }
      var a = /^(?:([\w]+):)?(.+)$/.exec(p), col = a[2].replace(/::\w+$/, '').trim();
      out.push({ alias: a[1] || col.split(/->>?/).pop().replace(/'/g, ''), col: col });
    });
    return out;
  }
  function singular(w) { return w.replace(/ies$/, 'y').replace(/ses$/, 's').replace(/s$/, ''); }
  function relationOf(table, rel) {
    var r = (CFG.relations[table] || {})[rel];
    if (r) return r;
    var bare = function (t) { return t.replace(/^[a-z]+_/, ''); };
    var sample = rows(table)[0] || {}, other = rows(rel)[0] || {};
    var cands = [singular(rel) + '_id', singular(bare(rel)) + '_id', rel + '_id'];
    for (var i = 0; i < cands.length; i++) if (cands[i] in sample) return { table: rel, local: cands[i], foreign: 'id', many: false };
    var back = [singular(table) + '_id', singular(bare(table)) + '_id'];
    for (i = 0; i < back.length; i++) if (back[i] in other) return { table: rel, local: 'id', foreign: back[i], many: true };
    return { table: rel, local: singular(bare(rel)) + '_id', foreign: 'id', many: false };
  }
  function project(table, row, spec, embedOpts) {
    var sel = parseSelect(spec), out = {}, keep = true;
    sel.forEach(function (s) {
      if (s.embed) {
        var R = relationOf(table, s.rel), them = rows(R.table).filter(function (o) { return eqv(o[R.foreign], row[R.local]); });
        var eo = (embedOpts || {})[s.alias] || (embedOpts || {})[s.rel] || {};
        if (eo.order) them = them.slice().sort(function (a, b) { var c = cmp(colGet(a, eo.order.col), colGet(b, eo.order.col)); return eo.order.asc ? c : -c; });
        if (eo.limit != null) them = them.slice(0, eo.limit);
        var proj = them.map(function (o) { return project(R.table, o, s.cols); });
        if (s.inner && !proj.length) keep = false;
        out[s.alias] = R.many ? proj : (proj[0] || null);
      } else if (s.col === '*') {
        Object.keys(row).forEach(function (k) { out[k] = clone(row[k]); });
      } else if (s.col === 'count') {
        out.count = 1;
      } else {
        out[s.alias] = clone(colGet(row, s.col));
      }
    });
    return keep ? out : null;
  }

  /* ── the query builder ── */
  function Q(client, table) {
    this.c = client; this.t = table; this.op = 'select'; this.cols = '*'; this.f = []; this.ord = []; this.lim = null; this.off = 0;
    this.one = 0; this.ret = null; this.payload = null; this.opts = {}; this.eopts = {};
  }
  var QP = Q.prototype;
  QP.select = function (cols, opts) { if (this.op === 'select') { this.cols = cols || '*'; this.opts = opts || {}; } else this.ret = cols || '*'; return this; };
  QP.insert = function (v, opts) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; this.opts = opts || {}; return this; };
  QP.upsert = function (v, opts) { this.op = 'upsert'; this.payload = Array.isArray(v) ? v : [v]; this.opts = opts || {}; return this; };
  QP.update = function (v, opts) { this.op = 'update'; this.payload = v || {}; this.opts = opts || {}; return this; };
  QP.delete = function (opts) { this.op = 'delete'; this.opts = opts || {}; return this; };
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'].forEach(function (op) {
    QP[op] = function (col, val) { this.f.push({ op: op, col: col, val: val }); return this; };
  });
  QP.likeAnyOf = function (col, pats) { return this.or(pats.map(function (p) { return col + '.like.' + p; }).join(',')); };
  QP.in = function (col, vals) { this.f.push({ op: 'in', col: col, val: vals }); return this; };
  QP.contains = function (col, v) { this.f.push({ op: 'cs', col: col, val: v }); return this; };
  QP.containedBy = function (col, v) { this.f.push({ op: 'cd', col: col, val: v }); return this; };
  QP.overlaps = function (col, v) { this.f.push({ op: 'ov', col: col, val: v }); return this; };
  QP.textSearch = function (col, q) { this.f.push({ op: 'fts', col: col, val: q }); return this; };
  QP.match = function (o) { var self = this; Object.keys(o || {}).forEach(function (k) { self.f.push({ op: 'eq', col: k, val: o[k] }); }); return this; };
  QP.not = function (col, op, val) { this.f.push({ op: op, col: col, val: op === 'is' ? lit(String(val)) : val, not: true }); return this; };
  QP.or = function (s, opts) { if (!(opts && (opts.foreignTable || opts.referencedTable))) this.f.push({ or: s }); return this; };
  QP.filter = function (col, op, val) {
    var neg = false; if (String(op).indexOf('not.') === 0) { neg = true; op = op.slice(4); }
    this.f.push({ op: op, col: col, val: op === 'in' ? val : lit(String(val).replace(/^"|"$/g, '')), not: neg }); return this;
  };
  QP.order = function (col, o) {
    o = o || {};
    var ft = o.foreignTable || o.referencedTable;
    if (ft) { (this.eopts[ft] = this.eopts[ft] || {}).order = { col: col, asc: o.ascending !== false }; return this; }
    this.ord.push({ col: col, asc: o.ascending !== false, nullsFirst: o.nullsFirst }); return this;
  };
  QP.limit = function (n, o) {
    var ft = o && (o.foreignTable || o.referencedTable);
    if (ft) { (this.eopts[ft] = this.eopts[ft] || {}).limit = n; return this; }
    this.lim = n; return this;
  };
  QP.range = function (a, b) { this.off = a; this.lim = b - a + 1; return this; };
  QP.single = function () { this.one = 1; return this; };
  QP.maybeSingle = function () { this.one = 2; return this; };
  QP.abortSignal = QP.returns = QP.throwOnError = QP.csv = QP.explain = function () { return this; };
  QP.then = function (res, rej) { return run(this).then(res, rej); };
  QP.catch = function (rej) { return run(this).catch(rej); };
  QP.finally = function (fn) { return run(this).finally(fn); };

  function fail(message, code) { return { data: null, error: { message: message, code: code || 'LOCAL', details: '', hint: '' }, count: null, status: 400, statusText: 'Bad Request' }; }
  function fillDefaults(t, r) {
    var d = CFG.defaults[t] || {};
    Object.keys(d).forEach(function (k) {
      if (r[k] !== undefined) return;
      var v = d[k];
      r[k] = v === '$uid' ? uid : v === '$now' ? nowIso() : v === '$uuid' ? uuid() : typeof v === 'function' ? v(r) : clone(v);
    });
    pkOf(t).forEach(function (k) { if (r[k] === undefined && k === 'id') r[k] = uuid(); });
    if (r.created_at === undefined && !CFG.noTimestamps) r.created_at = nowIso();
    return r;
  }
  function shape(q, list) {
    var spec = q.op === 'select' ? q.cols : q.ret;
    if (spec == null) return null;
    return list.map(function (r) { return project(q.t, r, spec, q.eopts); }).filter(function (r) { return r !== null; });
  }
  function finish(q, list, count) {
    var data = shape(q, list);
    if (q.op !== 'select' && q.ret == null) data = null;
    if (q.one && data) {
      if (data.length === 1) data = data[0];
      else if (data.length === 0 && q.one === 2) data = null;
      else return fail(data.length ? 'JSON object requested, multiple (or no) rows returned' : 'JSON object requested, multiple (or no) rows returned', 'PGRST116');
    }
    return { data: data, error: null, count: count == null ? null : count, status: q.op === 'insert' ? 201 : 200, statusText: 'OK' };
  }
  async function run(q) {
    await ready;
    var t = q.t, list = rows(t);
    try {
      if (q.op === 'select') {
        var hit = list.filter(function (r) { return passes(r, q.f); });
        /* as PostgREST orders: empty values last going up and first coming down, unless told otherwise */
        if (q.ord.length) hit = hit.slice().sort(function (a, b) {
          for (var i = 0; i < q.ord.length; i++) {
            var o = q.ord[i], va = colGet(a, o.col), vb = colGet(b, o.col);
            var nf = o.nullsFirst != null ? o.nullsFirst : !o.asc;
            if (va == null && vb != null) return nf ? -1 : 1;
            if (vb == null && va != null) return nf ? 1 : -1;
            var c = cmp(va, vb); if (c) return o.asc ? c : -c;
          }
          return 0;
        });
        var count = q.opts.count ? hit.length : null;
        if (q.off) hit = hit.slice(q.off);
        if (q.lim != null) hit = hit.slice(0, q.lim);
        if (q.opts.head) return { data: null, error: null, count: count, status: 200, statusText: 'OK' };
        return finish(q, hit, count);
      }
      if (q.op === 'insert' || q.op === 'upsert') {
        var made = [], dirty = false;
        var conflict = q.opts.onConflict ? String(q.opts.onConflict).split(',').map(function (s) { return s.trim(); }) : pkOf(t);
        for (var i = 0; i < q.payload.length; i++) {
          var r = fillDefaults(t, clone(q.payload[i]));
          var same = list.filter(function (o) { return conflict.every(function (k) { return r[k] !== undefined && eqv(o[k], r[k]); }); })[0];
          if (q.op === 'insert' && list.some(function (o) { return keyOf(t, o) === keyOf(t, r); })) return fail('duplicate key value violates unique constraint "' + t + '_pkey"', '23505');
          if (same && q.op === 'upsert') {
            if (q.opts.ignoreDuplicates) continue;
            var patch = clone(q.payload[i]);
            Object.keys(patch).forEach(function (k) { same[k] = patch[k]; });
            made.push(same); dirty = true;
          } else { list.push(r); made.push(r); dirty = true; }
        }
        if (dirty) await saveTable(t);
        return finish(q, made, q.opts.count ? made.length : null);
      }
      if (q.op === 'update') {
        var ch = list.filter(function (r) { return passes(r, q.f); });
        ch.forEach(function (r) {
          Object.keys(q.payload).forEach(function (k) { r[k] = clone(q.payload[k]); });
          if ('updated_at' in r && q.payload.updated_at === undefined) r.updated_at = nowIso();
        });
        if (ch.length) await saveTable(t);
        return finish(q, ch, q.opts.count ? ch.length : null);
      }
      if (q.op === 'delete') {
        var gone = list.filter(function (r) { return passes(r, q.f); });
        if (gone.length) { T[t] = list.filter(function (r) { return gone.indexOf(r) < 0; }); await saveTable(t); }
        return finish(q, gone, q.opts.count ? gone.length : null);
      }
    } catch (e) { return fail(String(e && e.message || e)); }
    return fail('unknown operation');
  }

  /* ── what the handlers in local.js get to work with ── */
  var DB = {
    get uid() { return uid; },
    user: user,
    uuid: uuid,
    now: nowIso,
    rows: rows,
    save: saveTable,
    from: function (t) { return client.from(t); },
    file: function (bucket, path) { var f = F[bucket + '/' + path]; return f ? f.blob : null; }
  };

  /* ── storage: files kept as Blobs, handed out as object URLs ── */
  function fileUrl(key) {
    if (URLS[key]) return URLS[key];
    var f = F[key]; if (!f) return null;
    URLS[key] = URL.createObjectURL(f.blob);
    return URLS[key];
  }
  function Bucket(name) { this.b = name; }
  var BP = Bucket.prototype;
  function k(b, p) { return b + '/' + String(p).replace(/^\/+/, ''); }
  BP.upload = async function (path, file, opts) {
    await ready; var key = k(this.b, path);
    if (F[key] && !(opts && opts.upsert)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
    var blob = file instanceof Blob ? file : new Blob([file], { type: (opts && opts.contentType) || 'application/octet-stream' });
    F[key] = { blob: blob, type: blob.type || (opts && opts.contentType) || '', size: blob.size, at: nowIso() };
    if (URLS[key]) { URL.revokeObjectURL(URLS[key]); delete URLS[key]; }
    await put('files', key, F[key]);
    return { data: { path: path, id: key, fullPath: key }, error: null };
  };
  BP.update = function (path, file, opts) { return this.upload(path, file, Object.assign({}, opts, { upsert: true })); };
  BP.download = async function (path) { await ready; var f = F[k(this.b, path)]; return f ? { data: f.blob, error: null } : { data: null, error: { message: 'Object not found', statusCode: '404' } }; };
  BP.createSignedUrl = async function (path) { await ready; var u = fileUrl(k(this.b, path)); return u ? { data: { signedUrl: u }, error: null } : { data: null, error: { message: 'Object not found', statusCode: '404' } }; };
  BP.createSignedUrls = async function (paths) {
    await ready; var b = this.b;
    return { data: (paths || []).map(function (p) { var u = fileUrl(k(b, p)); return { path: p, signedUrl: u, error: u ? null : 'Object not found' }; }), error: null };
  };
  BP.getPublicUrl = function (path) { return { data: { publicUrl: fileUrl(k(this.b, path)) || '' } }; };
  BP.remove = async function (paths) {
    await ready; var b = this.b, out = [];
    for (var i = 0; i < (paths || []).length; i++) {
      var key = k(b, paths[i]);
      if (F[key]) { out.push({ name: paths[i] }); delete F[key]; if (URLS[key]) { URL.revokeObjectURL(URLS[key]); delete URLS[key]; } await put('files', key, undefined); }
    }
    return { data: out, error: null };
  };
  BP.list = async function (prefix, opts) {
    await ready; var b = this.b, pre = k(b, prefix || ''), out = [];
    if (pre.slice(-1) !== '/' && prefix) pre += '/';
    Object.keys(F).forEach(function (key) {
      if (key.indexOf(pre) !== 0) return;
      var rest = key.slice(pre.length); if (!rest || rest.indexOf('/') >= 0) return;
      if (opts && opts.search && rest.indexOf(opts.search) < 0) return;
      out.push({ name: rest, id: key, created_at: F[key].at, updated_at: F[key].at, metadata: { size: F[key].size, mimetype: F[key].type } });
    });
    var off = (opts && opts.offset) || 0, lim = (opts && opts.limit) || 100;
    return { data: out.slice(off, off + lim), error: null };
  };
  BP.move = async function (a, b) { await ready; var ka = k(this.b, a), kb = k(this.b, b); if (!F[ka]) return { data: null, error: { message: 'Object not found' } }; F[kb] = F[ka]; delete F[ka]; await put('files', kb, F[kb]); await put('files', ka, undefined); return { data: { message: 'Successfully moved' }, error: null }; };
  BP.copy = async function (a, b) { await ready; var ka = k(this.b, a), kb = k(this.b, b); if (!F[ka]) return { data: null, error: { message: 'Object not found' } }; F[kb] = F[ka]; await put('files', kb, F[kb]); return { data: { path: b }, error: null }; };

  /* ── auth: you, always ── */
  var listeners = [];
  var auth = {
    getSession: async function () { return { data: { session: session() }, error: null }; },
    getUser: async function () { return { data: { user: user() }, error: null }; },
    refreshSession: async function () { return { data: { session: session(), user: user() }, error: null }; },
    setSession: async function () { return { data: { session: session(), user: user() }, error: null }; },
    onAuthStateChange: function (cb) {
      var sub = { id: uuid(), callback: cb, unsubscribe: function () { listeners = listeners.filter(function (x) { return x !== sub; }); } };
      listeners.push(sub);
      setTimeout(function () { (CFG.events || []).forEach(function (ev) { try { cb(ev, session()); } catch (e) { console.error(e); } }); }, 0);
      return { data: { subscription: sub } };
    },
    signOut: async function () { return { error: null }; },
    signInWithOtp: async function () { return { data: { user: null, session: null }, error: null }; },
    verifyOtp: async function () { return { data: { user: user(), session: session() }, error: null }; },
    signInWithPassword: async function () { return { data: { user: user(), session: session() }, error: null }; },
    signInWithOAuth: async function () { return { data: {}, error: null }; },
    signUp: async function () { return { data: { user: user(), session: session() }, error: null }; },
    updateUser: async function (attrs) {
      if (attrs && attrs.data) CFG.you = Object.assign({}, CFG.you, attrs.data);
      return { data: { user: user() }, error: null };
    },
    resetPasswordForEmail: async function () { return { data: {}, error: null }; },
    exchangeCodeForSession: async function () { return { data: { session: session(), user: user() }, error: null }; },
    getUserIdentities: async function () { return { data: { identities: [] }, error: null }; },
    startAutoRefresh: function () {}, stopAutoRefresh: function () {}
  };

  function rpc(name, args) {
    var p = (async function () {
      await ready;
      var h = CFG.rpc[name];
      if (!h) return { data: null, error: { message: 'The open version keeps "' + name + '" out: it belongs to the shared site.', code: 'LOCAL' }, status: 404 };
      try { return { data: clone(await h(args || {}, DB)), error: null, status: 200 }; }
      catch (e) { return { data: null, error: { message: String(e && e.message || e) }, status: 400 }; }
    })();
    var wrap = { then: function (a, b) { return p.then(a, b); }, catch: function (b) { return p.catch(b); }, finally: function (f) { return p.finally(f); } };
    ['select', 'eq', 'order', 'limit', 'abortSignal', 'returns'].forEach(function (m) { wrap[m] = function () { return wrap; }; });
    wrap.single = function () { var q = p.then(function (r) { if (r.error) return r; return Object.assign({}, r, { data: Array.isArray(r.data) ? (r.data[0] || null) : r.data }); }); return { then: q.then.bind(q), catch: q.catch.bind(q) }; };
    wrap.maybeSingle = wrap.single;
    return wrap;
  }
  var functions = {
    invoke: async function (name, opts) {
      await ready;
      var h = CFG.functions[name];
      if (!h) return { data: null, error: { message: 'The open version keeps "' + name + '" out: it belongs to the shared site.' } };
      try { return { data: clone(await h((opts && opts.body) || {}, DB)), error: null }; }
      catch (e) { return { data: null, error: { message: String(e && e.message || e) } }; }
    }
  };
  function Channel(name) { this.topic = name; }
  Channel.prototype.on = function () { return this; };
  Channel.prototype.subscribe = function (cb) { var self = this; if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 0); return self; };
  Channel.prototype.send = async function () { return 'ok'; };
  Channel.prototype.track = async function () { return 'ok'; };
  Channel.prototype.untrack = async function () { return 'ok'; };
  Channel.prototype.unsubscribe = async function () { return 'ok'; };
  Channel.prototype.presenceState = function () { return {}; };

  var client = {
    from: function (t) { return new Q(client, t); },
    schema: function () { return client; },
    rpc: rpc,
    storage: { from: function (b) { return new Bucket(b); }, listBuckets: async function () { return { data: [], error: null }; } },
    auth: auth,
    functions: functions,
    channel: function (n) { return new Channel(n); },
    removeChannel: async function () { return 'ok'; },
    removeAllChannels: async function () { return []; },
    getChannels: function () { return []; },
    realtime: { setAuth: function () {} }
  };

  window.supabase = { createClient: function () { return client; } };

  /* anything that still reaches for the old address by hand is answered here, on the device */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(LOCAL_HOST) < 0) return realFetch(input, init);
    var u = new URL(url), m = /\/rest\/v1\/rpc\/([\w]+)/.exec(u.pathname);
    var json = function (v, s) { return new Response(JSON.stringify(v), { status: s || 200, headers: { 'Content-Type': 'application/json' } }); };
    if (m) {
      var body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      var r = await rpc(m[1], body);
      return r.error ? json({ message: r.error.message }, 404) : json(r.data);
    }
    var tm = /\/rest\/v1\/([\w]+)/.exec(u.pathname);
    if (tm && (!init || !init.method || init.method === 'GET')) {
      var q = client.from(tm[1]).select(u.searchParams.get('select') || '*');
      u.searchParams.forEach(function (v, key) {
        if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') return;
        var d = v.indexOf('.'); q.filter(key, v.slice(0, d), v.slice(d + 1));
      });
      if (u.searchParams.get('limit')) q.limit(+u.searchParams.get('limit'));
      var res = await q;
      return json(res.data || []);
    }
    return json({}, 200);
  };

  window.LocalSupabase = {
    configure: function (cfg) {
      Object.keys(cfg || {}).forEach(function (key) {
        if (key === 'rpc' || key === 'functions' || key === 'defaults' || key === 'relations' || key === 'pk') CFG[key] = Object.assign({}, CFG[key], cfg[key]);
        else CFG[key] = cfg[key];
      });
      if (!configured) { configured = true; boot(); }
    },
    ready: ready,
    db: DB,
    client: client,
    /* everything kept on this device, as one JSON document (files as data URLs) */
    export: async function () {
      await ready;
      var files = {};
      for (var key in F) {
        files[key] = await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(F[key].blob); });
      }
      return { instrument: CFG.name, you: uid, exported_at: nowIso(), tables: clone(T), files: files };
    },
    reset: async function () {
      await ready;
      if (idb) idb.close();
      await new Promise(function (res) { var rq = indexedDB.deleteDatabase('local-supabase:' + CFG.name); rq.onsuccess = rq.onerror = rq.onblocked = function () { res(); }; });
    }
  };
})();
