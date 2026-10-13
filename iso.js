/*
 * ISO: the Story Map's isometric models, second edition.
 *
 * The drawing is Hairline's language (github.com/lucasmarkes/hairline, MIT,
 * Lucas Marques), carried to canvas so a model can stand on the map, on the
 * globe, in a city's tile map and in the reader's corner:
 *
 *   a solid is the convex hull of its rings, so no vertical corner is drawn;
 *   one dim crease a unit inside the lid; detail is drawn as dim marks on the
 *   faces (doors, windows, arcades, courses), never as more solids; plates
 *   are filled with the ground colour and painted back to front; the stroke is
 *   the only highlight; hit areas are the rest pose; a continuous input gets a
 *   spring, a discrete change a 700ms ease-out; no words inside a figure.
 *
 * WORLD SPACE. x runs east, y runs south, z up, in model units. At the map's
 * camera, Cam(45, 0.5, S), +x runs down to the right and +y down to the left,
 * so the south (y1) and east (x1) faces of a box are the ones you see, and a
 * door belongs on them. A model is designed about its origin in a footprint
 * of roughly 100 x 100 units (a city filler house in 40 x 40).
 *
 * A KIND is a function (R, B) => void that builds into the builder B with the
 * seeded chance R. Register it with ISO.def(name, fn, meta). See the builder
 * below for every primitive, and Build MDs/storymap-isometric.md for the
 * rules each kind keeps.
 */
window.ISO = (() => {
  'use strict';

  /* ---------- numbers ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rad = d => d * Math.PI / 180;

  /* ---------- the camera ----------
   * Cam(az, k, S): azimuth in degrees, k = sin(elevation) (0.5 is the 2:1
   * view), S = pixels per unit, ox/oy the screen point of the origin. A
   * camera may instead carry M = [a,b,c,d,e,f] (sx = ox + a x + b y + c z,
   * sy = oy + d x + e y + f z), which is how a model is put on the globe. */
  const Cam = (azDeg, k, S) => ({ az: rad(azDeg), k, S, ox: 0, oy: 0 });
  function mat(C) {
    if (C.M) return C.M;
    const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
    return [C.S * c, -C.S * s, 0, C.S * s * C.k, C.S * c * C.k, -C.S * zf];
  }
  /* The direction toward the camera, in model space: what faces it is seen. */
  function toward(C) {
    const m = mat(C);
    let tx = m[1] * m[5] - m[2] * m[4], ty = m[2] * m[3] - m[0] * m[5], tz = m[0] * m[4] - m[1] * m[3];
    if (tz < 0) { tx = -tx; ty = -ty; tz = -tz; }
    const L = Math.hypot(tx, ty, tz) || 1;
    return [tx / L, ty / L, tz / L];
  }
  function proj(C) {
    const m = mat(C), ox = C.ox, oy = C.oy;
    return (x, y, z) => [ox + m[0] * x + m[1] * y + m[2] * z, oy + m[3] * x + m[4] * y + m[5] * z];
  }
  function unproj(C, sx, sy, z) {
    const m = mat(C), rx = sx - C.ox - m[2] * z, ry = sy - C.oy - m[5] * z, det = m[0] * m[4] - m[1] * m[3];
    return [(rx * m[4] - ry * m[1]) / det, (m[0] * ry - m[3] * rx) / det];
  }
  const facing = C => { const t = toward(C); return q => q.nu * t[0] + q.nv * t[1] >= -1e-6; };

  /* ---------- rings: a closed outline on the ground, each sample with its outward normal ---------- */
  function rrect(u0, v0, u1, v1, r, n = 4) {
    r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
    const out = [];
    for (const [cu, cv, a0] of [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]])
      for (let k = 0; k <= n; k++) {
        const a = rad(a0 + 90 * k / n), ca = Math.cos(a), sa = Math.sin(a);
        out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa });
      }
    return out;
  }
  function circ(R, n = 24, cx = 0, cy = 0) {
    const out = [];
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); out.push({ u: cx + R * ca, v: cy + R * sa, nu: ca, nv: sa }); }
    return out;
  }
  /* A regular polygon (an octagonal drum, a hexagonal plinth). */
  function ngon(R, n, cx = 0, cy = 0, rot = 0) {
    const out = [];
    for (let k = 0; k < n; k++) { const a = rot + k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); out.push({ u: cx + R * ca, v: cy + R * sa, nu: ca, nv: sa }); }
    return out;
  }
  const hexring = (R, cx = 0, cy = 0) => ngon(R, 6, cx, cy, Math.PI / 6);
  /* A boat's deck: pointed at both ends, along x. */
  function lens(L, W, cx = 0, cy = 0, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) { const t = -1 + 2 * i / n; out.push([cx + t * L / 2, cy + (W / 2) * Math.pow(1 - t * t, .7)]); }
    for (let i = n - 1; i > 0; i--) { const t = -1 + 2 * i / n; out.push([cx + t * L / 2, cy - (W / 2) * Math.pow(1 - t * t, .7)]); }
    return fromPts(out);
  }
  /* A ring from plain points (convex, any order round): normals from the centre. */
  function fromPts(pts) {
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    return pts.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return { u: p[0], v: p[1], nu: dx / L, nv: dy / L }; });
  }
  const inset = (ring, b) => ring.map(q => ({ u: q.u - q.nu * b, v: q.v - q.nv * b, nu: q.nu, nv: q.nv }));
  const shift = (ring, dx, dy) => ring.map(q => ({ u: q.u + dx, v: q.v + dy, nu: q.nu, nv: q.nv }));
  const scaleRing = (ring, f, cx = 0, cy = 0) => ring.map(q => ({ u: cx + (q.u - cx) * f, v: cy + (q.v - cy) * f, nu: q.nu, nv: q.nv }));

  function hull(input) {
    if (input.length < 3) return input.slice();
    const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  /* the hull as indices into the points, so a part can keep its outline's vertices while the view keeps its azimuth */
  function hullIdx(input) {
    const n = input.length; if (n < 3) return input.map((_, i) => i);
    const ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i;
    ix.sort((a, b) => input[a][0] - input[b][0] || input[a][1] - input[b][1]);
    const x = (o, a, b) => (input[a][0] - input[o][0]) * (input[b][1] - input[o][1]) - (input[a][1] - input[o][1]) * (input[b][0] - input[o][0]);
    const lo = [], up = [];
    for (const p of ix) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = n - 1; i >= 0; i--) { const p = ix[i]; while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function run(ring, keep) {
    const n = ring.length; let s = -1;
    for (let i = 0; i < n; i++) if (keep(ring[i]) && !keep(ring[(i + n - 1) % n])) { s = i; break; }
    if (s < 0) return keep(ring[0]) ? ring.slice() : [];
    const out = [];
    for (let k = 0; k < n && keep(ring[(s + k) % n]); k++) out.push(ring[(s + k) % n]);
    return out;
  }
  function inConvex(poly, x, y) {
    let sign = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c !== 0) { const s = c > 0 ? 1 : -1; if (sign && s !== sign) return false; sign = s; }
    }
    return true;
  }
  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }

  /* ---------- the two clocks ---------- */
  function spring(x, o = {}) { return { x, v: 0, t: x, k: o.k ?? 100, c: o.c ?? 18, m: o.m ?? 1, eps: o.eps ?? 0.01 }; }
  function stepS(sp, dt) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = (-sp.k * (sp.x - sp.t) - sp.c * sp.v) / sp.m; sp.v += a * h; sp.x += sp.v * h; }
    if (Math.abs(sp.x - sp.t) < sp.eps && Math.abs(sp.v) < sp.eps * 10) { sp.x = sp.t; sp.v = 0; return false; }
    return true;
  }
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = u => ((ax * u + bx) * u + cx) * u, Y = u => ((ay * u + by) * u + cy) * u, dX = u => (3 * ax * u + 2 * bx) * u + cx;
    return t => {
      if (t <= 0) return 0; if (t >= 1) return 1;
      let u = t;
      for (let i = 0; i < 8; i++) { const e = X(u) - t; if (Math.abs(e) < 1e-5) break; const d = dX(u); if (Math.abs(d) < 1e-6) break; u -= e / d; }
      if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-4) { let lo = 0, hi = 1; u = t; for (let i = 0; i < 24; i++) { if (X(u) < t) lo = u; else hi = u; u = (lo + hi) / 2; } }
      return Y(u);
    };
  }
  const EASE_LIFT = bezier(0.32, 0.72, 0, 1);
  const tween = (v, dur = 700) => ({ from: v, to: v, t0: -1e9, dur });
  const tval = (tw, now) => { const p = clamp((now - tw.t0) / tw.dur, 0, 1); return tw.from + (tw.to - tw.from) * EASE_LIFT(p); };
  const tset = (tw, to, now, delay = 0) => { if (tw.to === to) return; tw.from = tval(tw, now); tw.to = to; tw.t0 = now + delay; };
  const tdone = (tw, now) => now >= tw.t0 + tw.dur;

  /* ---------- seeded chance ---------- */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
    const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    f.r = (a, b) => a + (b - a) * f();
    f.i = (a, b) => Math.floor(f.r(a, b + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.chance = p => f() < p;
    return f;
  }

  /* ---------- parts ----------
   * A part is one of:
   *   solid  { L: [[ring, z], ...] ascending z, inner: ring at the top z for the crease }
   *   plate  { plate: [[x,y,z], ...] } a flat polygon (a sail, a roof plane, an awning)
   *   line   { line: [[x,y,z], ...] } an open stroke (a frond, a rope, a mast)
   *   cut    { cut: [[u,v], ...] (one or more polygons), at: [x,y,z], h } a puppet cut-out
   *          that always faces the camera, h tall, its feet at `at`
   * Every part has: role (the words a tale attaches to), lod (0 always, 1 from
   * mid size, 2 up close), box [x0,y0,z0,x1,y1,z1], marks [{pts, n, closed, cls}].
   */
  function boxOf(pts3) {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of pts3) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[2] < b[2]) b[2] = p[2]; if (p[0] > b[3]) b[3] = p[0]; if (p[1] > b[4]) b[4] = p[1]; if (p[2] > b[5]) b[5] = p[2]; }
    return b;
  }
  function finish(p) {
    const pts = [];
    if (p.L) for (const [ring, z] of p.L) for (const q of ring) pts.push([q.u, q.v, z]);
    if (p.plate) pts.push(...p.plate);
    if (p.line) pts.push(...p.line);
    if (p.cut) { const [x, y, z] = p.at, w = (p.w || p.h) * .5; pts.push([x - w * .36, y + w * .36, z], [x + w * .36, y - w * .36, z + p.h]); }
    p.box = boxOf(pts);
    p.cx = (p.box[0] + p.box[3]) / 2; p.cy = (p.box[1] + p.box[4]) / 2;
    p.hw = (p.box[3] - p.box[0]) / 2; p.hh = (p.box[4] - p.box[1]) / 2;
    p.z0 = p.box[2]; p.z1 = p.box[5];
    p.marks = p.marks || [];
    p.sp = spring(0, { eps: 0.02 }); p.tw = tween(0); p.items = [];
    return p;
  }

  /* ---------- the builder ---------- */
  function Builder(R) { this.R = R; this.parts = []; this.guides = []; this.dots = []; this.last = null; }
  const BP = Builder.prototype;
  BP.add = function (p) { finish(p); p.role = p.role || ''; p.lod = p.lod || 0; this.parts.push(p); this.last = p; return p; };
  const opt = (o, d) => Object.assign({}, d, o || {});

  /* box(x0,y0,x1,y1,z0,z1,{r,b,role,lod,top}) a rounded box; top shrinks the lid (a taper). */
  BP.box = function (x0, y0, x1, y1, z0, z1, o) {
    o = opt(o, { r: 1.4, b: .9, top: 0 });
    const foot = rrect(x0, y0, x1, y1, o.r), t = o.top;
    const lid = t ? rrect(x0 + t, y0 + t, x1 - t, y1 - t, Math.max(.3, o.r - t * .5)) : foot;
    const b = Math.min(o.b, (Math.min(x1 - x0, y1 - y0) - 2 * t) / 2 - .05);
    const p = this.add({ L: [[foot, z0], [lid, z1]], inner: b > .2 ? rrect(x0 + t + b, y0 + t + b, x1 - t - b, y1 - t - b, Math.max(.3, o.r - t * .5 - b)) : null, role: o.role, lod: o.lod });
    p.face = { x0, y0, x1, y1, z0, z1, t };
    return p;
  };
  /* cyl(cx,cy,R,z0,z1,{n,b,top}) a column, a drum, a well; n sides (8 for an octagonal drum). */
  BP.cyl = function (cx, cy, R, z0, z1, o) {
    o = opt(o, { n: 20, b: .5, top: 1, rot: 0 });
    const f = o.n <= 12 ? ngon(R, o.n, cx, cy, o.rot) : circ(R, o.n, cx, cy);
    const lid = o.top === 1 ? f : (o.n <= 12 ? ngon(R * o.top, o.n, cx, cy, o.rot) : circ(R * o.top, o.n, cx, cy));
    return this.add({ L: [[f, z0], [lid, z1]], inner: o.b > 0 && R * o.top > o.b * 2 ? inset(lid, o.b) : null, role: o.role, lod: o.lod });
  };
  BP.cone = function (cx, cy, R, z0, z1, o) {
    o = opt(o, { n: 16, tip: .15 });
    return this.add({ L: [[circ(R, o.n, cx, cy), z0], [circ(Math.max(.05, o.tip), o.n, cx, cy), z1]], inner: null, role: o.role, lod: o.lod });
  };
  /* lathe(cx,cy,profile [[r,z],...],{n}) a turned solid: its silhouette is the hull of every ring. */
  BP.lathe = function (cx, cy, prof, o) {
    o = opt(o, { n: 20 });
    const L = prof.map(([r, z]) => [r > .02 ? circ(r, o.n, cx, cy) : [{ u: cx, v: cy, nu: 0, nv: 0 }], z]);
    return this.add({ L, inner: o.crease && prof[0][0] > 1 ? inset(circ(prof[0][0], o.n, cx, cy), o.crease) : null, creaseZ: prof[0][1], role: o.role, lod: o.lod });
  };
  /* dome(cx,cy,R,z0,{shape,h,drum,drumN,finial}) round | pointed | onion | shallow. */
  BP.dome = function (cx, cy, R, z0, o) {
    o = opt(o, { shape: 'round', h: 1, drum: 0, drumN: 16, finial: true });
    let z = z0;
    if (o.drum > 0) { this.cyl(cx, cy, R * 1.04, z, z + o.drum, { n: o.drumN, b: .4, role: o.role, lod: o.lod }); z += o.drum; }
    const P = { round: [[1, 0], [.97, .26], [.87, .5], [.71, .71], [.5, .87], [.26, .97], [0, 1]],
      pointed: [[1, 0], [.98, .3], [.9, .58], [.74, .86], [.52, 1.1], [.26, 1.3], [0, 1.45]],
      onion: [[.92, 0], [1.08, .28], [1.06, .55], [.86, .86], [.52, 1.12], [.2, 1.32], [0, 1.5]],
      shallow: [[1, 0], [.92, .2], [.7, .36], [.38, .46], [0, .5]] }[o.shape] || [[1, 0], [0, 1]];
    const p = this.lathe(cx, cy, P.map(([r, h]) => [r * R, z + h * R * o.h]), { n: 24, role: o.role, lod: o.lod, crease: o.drum > 0 ? 0 : .5 });
    const top = z + P[P.length - 1][1] * R * o.h;
    if (o.finial && R > 3) { this.line([[cx, cy, top], [cx, cy, top + Math.max(1.4, R * .28)]], { role: o.role, lod: 2, cls: 'edge' }); this.last = p; }
    return p;
  };
  BP.sphere = function (cx, cy, cz, R, o) {
    const P = [[.0, -1], [.5, -.87], [.87, -.5], [1, 0], [.87, .5], [.5, .87], [0, 1]];
    return this.lathe(cx, cy, P.map(([r, h]) => [r * R, cz + h * R]), opt(o, { n: 18 }));
  };
  /* prism of a convex footprint given as points (an octagonal tower, a boat). */
  BP.prism = function (pts2, z0, z1, o) {
    o = opt(o, { b: .6, top: 1 });
    const f = fromPts(pts2);
    let cx = 0, cy = 0; for (const p of pts2) { cx += p[0]; cy += p[1]; } cx /= pts2.length; cy /= pts2.length;
    const lid = o.top === 1 ? f : scaleRing(f, o.top, cx, cy);
    return this.add({ L: [[f, z0], [lid, z1]], inner: o.b > 0 ? inset(lid, o.b) : null, role: o.role, lod: o.lod });
  };
  /* ring(ring,z0,z1,{lid,b}) a solid from any convex ring (a lens for a hull, a hexagon). */
  BP.ring = function (ring, z0, z1, o) { o = opt(o, { b: .6 }); return this.add({ L: [[ring, z0], [o.lid || ring, z1]], inner: o.b > 0 ? inset(o.lid || ring, o.b) : null, role: o.role, lod: o.lod }); };
  /* plate(points3D,{cls}) a flat polygon; cls 'nf' leaves it unfilled. */
  BP.plate = function (pts3, o) { o = opt(o, {}); return this.add({ plate: pts3, cls: o.cls || '', role: o.role, lod: o.lod, hiOK: o.hiOK !== false }); };
  /* line(points3D,{cls,w}) cls 'edge' (default), 'lo', 'mid'; w multiplies the stroke. */
  BP.line = function (pts3, o) { o = opt(o, {}); return this.add({ line: pts3, cls: o.cls || 'edge', role: o.role, lod: o.lod, w: o.w }); };
  /* cut(polys [[u,v]...] in a unit box (u -0.5..0.5, v 0..1), x,y,z, h, {w,flip,lines}) a puppet cut-out. */
  BP.cut = function (polys, x, y, z, h, o) {
    o = opt(o, {});
    if (typeof polys[0][0] === 'number') polys = [polys];
    return this.add({ cut: polys, at: [x, y, z], h, w: o.w || h, flip: !!o.flip, lines: o.lines || null, role: o.role, lod: o.lod });
  };
  /* mark(points3D,{n,closed,cls,on,lod}) a dim drawing on a face of the part `on` (default the last). n is the face's normal. */
  /* With axis [cx, cy] the mark wraps a round solid (a spiral ramp, a ring of windows): only its segments on the near side are drawn. */
  /* With ns (one outward normal per segment, [nx, ny] or [nx, ny, nz]) each segment is drawn only while it faces the eye:
     a seam round a rounded box, a band round any convex body, at every turn of the board. */
  BP.mark = function (pts3, o) { o = opt(o, { closed: false, cls: 'lo' }); const p = o.on || this.last; if (p) p.marks.push({ pts: pts3, n: o.n || null, closed: o.closed, cls: o.cls, lod: o.lod || 0, axis: o.axis || null, ns: o.ns || null }); return p; };
  BP.guide = function (pts2) { this.guides.push(pts2); };
  BP.dot = function (x, y, z, cls) { this.dots.push([x, y, z, cls || 'dot']); };

  /* ---- marks on a box's faces ----
   * side: 'S' the south face (y1), 'E' the east face (x1), 'N' (y0), 'W' (x0).
   * u is the position along the face, 0 at its west / north end, 1 at the other; z is height. */
  function faceFrame(p, side) {
    const f = p && p.face; if (!f) return null;
    const t = f.t || 0, k = z => t * (z - f.z0) / (f.z1 - f.z0 || 1);
    if (side === 'S') return { at: (u, z) => [lerp(f.x0 + k(z), f.x1 - k(z), u), f.y1 - k(z), z], n: [0, 1, 0], len: f.x1 - f.x0, z0: f.z0, z1: f.z1 };
    if (side === 'N') return { at: (u, z) => [lerp(f.x0 + k(z), f.x1 - k(z), u), f.y0 + k(z), z], n: [0, -1, 0], len: f.x1 - f.x0, z0: f.z0, z1: f.z1 };
    if (side === 'E') return { at: (u, z) => [f.x1 - k(z), lerp(f.y0 + k(z), f.y1 - k(z), u), z], n: [1, 0, 0], len: f.y1 - f.y0, z0: f.z0, z1: f.z1 };
    if (side === 'W') return { at: (u, z) => [f.x0 + k(z), lerp(f.y0 + k(z), f.y1 - k(z), u), z], n: [-1, 0, 0], len: f.y1 - f.y0, z0: f.z0, z1: f.z1 };
    return null;
  }
  /* an arch outline on a face: centre u (0..1), width w and height h in model units, from z. */
  function archPts(F, u, w, z, h, shape) {
    const hw = w / 2 / F.len, pts = [];
    const spring = shape === 'flat' ? h : Math.max(0, h - (shape === 'round' ? w / 2 : w * .62));
    pts.push(F.at(u - hw, z), F.at(u - hw, z + spring));
    if (shape === 'flat') pts.push(F.at(u + hw, z + spring));
    else if (shape === 'round') { for (let i = 1; i < 8; i++) { const a = Math.PI - i / 8 * Math.PI; pts.push(F.at(u + Math.cos(a) * hw, z + spring + Math.sin(a) * (w / 2))); } pts.push(F.at(u + hw, z + spring)); }
    else {
      const rise = h - spring;
      for (let i = 1; i <= 4; i++) { const k = i / 4; pts.push(F.at(u - hw + hw * (1 - Math.cos(k * Math.PI / 2)), z + spring + rise * Math.sin(k * Math.PI / 2))); }
      for (let i = 3; i >= 0; i--) { const k = i / 4; pts.push(F.at(u + hw - hw * (1 - Math.cos(k * Math.PI / 2)), z + spring + rise * Math.sin(k * Math.PI / 2))); }
    }
    pts.push(F.at(u + hw, z));
    return pts;
  }
  /* door(side,u,w,h,{shape,z}) an open arch standing on a face's foot. */
  BP.door = function (side, u, w, h, o) {
    o = opt(o, { shape: 'pointed', on: this.last, z: null });
    const F = faceFrame(o.on, side); if (!F) return;
    this.mark(archPts(F, u, w, o.z == null ? F.z0 : o.z, h, o.shape), { n: F.n, on: o.on, lod: o.lod || 0 });
  };
  /* window(side,u,z,w,h,{shape}) a closed opening; windows(side,n,z,w,h) a row of them. */
  BP.window = function (side, u, z, w, h, o) {
    o = opt(o, { shape: 'pointed', on: this.last });
    const F = faceFrame(o.on, side); if (!F) return;
    this.mark(archPts(F, u, w, z, h, o.shape), { n: F.n, closed: true, on: o.on, lod: o.lod == null ? 1 : o.lod });
  };
  BP.windows = function (side, n, z, w, h, o) { o = opt(o, { on: this.last, from: .12, to: .88 }); for (let i = 0; i < n; i++) this.window(side, n === 1 ? .5 : lerp(o.from, o.to, i / (n - 1)), z, w, h, o); };
  /* arcade(side,n,z,h) a row of open arches along a face, piers between. */
  BP.arcade = function (side, n, z, h, o) {
    o = opt(o, { on: this.last, shape: 'pointed', from: .04, to: .96 });
    const F = faceFrame(o.on, side); if (!F) return;
    const span = (o.to - o.from) / n, w = span * F.len * .74;
    for (let i = 0; i < n; i++) this.mark(archPts(F, o.from + span * (i + .5), w, z, h, o.shape), { n: F.n, on: o.on, lod: o.lod || 1 });
  };
  /* band(z) a horizontal course along the faces (a cornice, a string course). */
  BP.band = function (z, o) {
    o = opt(o, { on: this.last, sides: 'SENW' });
    for (const s of o.sides) { const F = faceFrame(o.on, s); if (F) this.mark([F.at(0, z), F.at(1, z)], { n: F.n, on: o.on, lod: o.lod || 1 }); }
  };
  /* panel(side,u0,u1,z0,z1) a rectangle on a face (a shutter, a plaque, a recessed bay). */
  BP.panel = function (side, u0, u1, z0, z1, o) {
    o = opt(o, { on: this.last });
    const F = faceFrame(o.on, side); if (!F) return;
    this.mark([F.at(u0, z0), F.at(u0, z1), F.at(u1, z1), F.at(u1, z0)], { n: F.n, closed: true, on: o.on, lod: o.lod || 1 });
  };
  /* crenels() merlons along the top edges of the last box: small solids, seen only up close. */
  /* crenels() the battlements along the top edges of the last box: a square wave drawn on its faces
     (and, with {solid: true}, merlons as small solids, seen only up close). */
  BP.crenels = function (o) {
    if (!(o && o.solid)) {
      o = opt(o, { on: this.last, every: 4, h: 1.6, lod: 1, sides: 'SENW' });
      const f = o.on && o.on.face; if (!f) return;
      for (const side of o.sides) {
        const F = faceFrame(o.on, side); if (!F) continue;
        const n = Math.max(2, Math.round(F.len / o.every)), pts = [];
        for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + .5) / n, u2 = (i + 1) / n; pts.push(F.at(u0, F.z1), F.at(u0, F.z1 + o.h), F.at(u1, F.z1 + o.h), F.at(u1, F.z1), F.at(u2, F.z1)); }
        this.mark(pts, { n: side === 'S' || side === 'E' ? F.n : null, on: o.on, lod: o.lod, cls: 'edge' });
      }
      this.last = o.on; return;
    }
    return this.crenelSolids(o);
  };
  BP.crenelSolids = function (o) {
    o = opt(o, { on: this.last, every: 4, h: 1.6, w: .45, lod: 2, sides: 'SENW' });
    const f = o.on && o.on.face; if (!f) return;
    const z = f.z1, t = f.t || 0, x0 = f.x0 + t, x1 = f.x1 - t, y0 = f.y0 + t, y1 = f.y1 - t, s = o.every, m = s * o.w / 2;
    const add = (x, y) => this.box(x - m, y - m, x + m, y + m, z, z + o.h, { r: .3, b: 0, role: o.on.role, lod: o.lod });
    if (o.sides.includes('N')) for (let x = x0 + s / 2; x < x1; x += s) add(x, y0 + m);
    if (o.sides.includes('S')) for (let x = x0 + s / 2; x < x1; x += s) add(x, y1 - m);
    if (o.sides.includes('W')) for (let y = y0 + s * 1.5; y < y1 - s; y += s) add(x0 + m, y);
    if (o.sides.includes('E')) for (let y = y0 + s * 1.5; y < y1 - s; y += s) add(x1 - m, y);
    this.last = o.on;
  };

  /* ---- furniture every kind may use ---- */
  /* palm(cx,cy,h) a date palm: a leaning trunk and seven drooping fronds, as strokes. */
  BP.palm = function (cx, cy, h, o) {
    o = opt(o, { lean: .08, fronds: 7, role: 'a palm', lod: 1 });
    const R = this.R, lx = h * o.lean * (R() - .5) * 2, ly = h * o.lean * (R() - .5) * 2;
    const top = [cx + lx, cy + ly, h];
    this.line([[cx, cy, 0], [cx + lx * .3, cy + ly * .3, h * .55], top], { role: o.role, lod: o.lod, cls: 'edge', w: 1.5 });
    const n = o.fronds, a0 = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * 6.28 + R.r(-.2, .2), L = h * R.r(.34, .46), droop = R.r(.2, .42);
      const c = Math.cos(a), s = Math.sin(a);
      this.line([top, [top[0] + c * L * .45, top[1] + s * L * .45, h + L * .12], [top[0] + c * L * .85, top[1] + s * L * .85, h - L * droop * .5], [top[0] + c * L, top[1] + s * L, h - L * droop]], { role: o.role, lod: o.lod, cls: 'edge' });
    }
  };
  /* tree(cx,cy,h,{shape}) a round tree on a short trunk, or a cypress. */
  BP.tree = function (cx, cy, h, o) {
    o = opt(o, { role: 'a tree', lod: 1, shape: 'round' });
    if (o.shape === 'cypress') return this.lathe(cx, cy, [[h * .14, 0], [h * .2, h * .3], [h * .17, h * .65], [h * .08, h * .9], [0, h]], { n: 12, role: o.role, lod: o.lod });
    this.line([[cx, cy, 0], [cx, cy, h * .5]], { role: o.role, lod: Math.max(1, o.lod), cls: 'edge' });
    return this.sphere(cx, cy, h * .66, h * .34, { role: o.role, lod: o.lod });
  };
  /* person(x,y,h) a robed figure, the smallest puppet: for scale and life on a street. */
  BP.person = function (x, y, h, o) {
    o = opt(o, { role: 'a figure', lod: 2 });
    return this.cut([[-.18, 0], [-.2, .55], [-.12, .7], [-.1, .8], [-.12, .9], [-.04, 1], [.06, 1], [.12, .9], [.1, .8], [.12, .7], [.2, .55], [.18, 0]], x, y, 0, h, o);
  };

  /* ---------- the kinds ---------- */
  const KINDS = {};
  /* def(name, fn, meta): meta.tier 'city'|'world'|'stage'|'scene'|'filler', meta.foot [w,h] in city tiles. */
  function def(name, fn, meta) { KINDS[name] = Object.assign(fn, { meta: Object.assign({ tier: 'stage' }, meta || {}) }); }
  const PROPS = {};
  /* prop(name, fn, meta): fn(R, B, x, y, s) builds a prop or figure standing at (x, y), s units being a person's height. */
  function prop(name, fn, meta) { PROPS[name] = Object.assign(fn, { meta: Object.assign({}, meta || {}) }); }

  /* Words in a sentence that name a kind of place (the corner model's fallback). */
  const WORDS = [
    ['palace', /\b(palace|hall of audience|throne|saloon|serai|harem|haram)\b/i], ['mosque', /\b(mosque|minaret|prayer|muezzin|friday)\b/i],
    ['bazar', /\b(bazar|bazaar|market|shop|merchant|stall|souk|street of the)\b/i], ['gate', /\b(gate|portal|city wall|battlement)\b/i],
    ['khan', /\b(khan|caravanserai|inn|warehouse)\b/i], ['hammam', /\b(hammam|bath|bathe)\b/i], ['garden', /\b(garden|orchard|flower|fountain|pavilion|vine)\b/i],
    ['harbour', /\b(harbour|harbor|port|anchor|quay)\b/i], ['sea', /\b(sea|ship|sail|voyage|wave|ocean|vessel|galley|mariner|shipwreck)\b/i],
    ['river', /\b(river|tigris|nile|euphrates|bank|boat|ferry)\b/i], ['bridge', /\b(bridge)\b/i], ['cemetery', /\b(tomb|grave|cemetery|burial|sepulchre)\b/i],
    ['tavern', /\b(wine|tavern|drink|cup|feast)\b/i], ['prison', /\b(prison|dungeon|gaol|jail|chain|fetter)\b/i], ['hospital', /\b(hospital|physician|sick)\b/i],
    ['church', /\b(church|monastery|monk|convent|chapel|bell)\b/i], ['desert', /\b(desert|sand|waste|wilderness|dune)\b/i], ['oasis', /\b(oasis|spring|palm)\b/i],
    ['forest', /\b(forest|wood|thicket|grove|jungle)\b/i], ['mountain', /\b(mountain|hill|peak|cliff|crag|rock)\b/i], ['island', /\b(island|isle|shore|beach)\b/i],
    ['camp', /\b(tent|camp|encamp|caravan|bedouin|badawi)\b/i], ['cave', /\b(cave|cavern|grotto|pit|underground|vault)\b/i], ['tower', /\b(tower|castle|fort|fortress|citadel)\b/i],
    ['ruin', /\b(ruin|ruined|desolate|deserted city)\b/i], ['field', /\b(field|meadow|pasture|plain|farm|harvest)\b/i], ['well', /\b(well|cistern)\b/i],
    ['square', /\b(square|maidan|open place|crowd)\b/i], ['house', /\b(house|home|door|roof|dwelling|lodging)\b/i], ['room', /\b(room|chamber|bed|couch|divan|curtain|lamp|table|sat down)\b/i],
  ];
  function kindFromText(s, fallback = 'room') {
    if (!s) return fallback;
    for (const [k, re] of WORDS) if (re.test(s) && KINDS[k]) return k;
    return fallback;
  }
  const LOCALE_KIND = { palace: 'palace', bazar: 'bazar', gate: 'gate', river: 'river', mosque: 'mosque', khan: 'khan', garden: 'garden', square: 'square', hammam: 'hammam', quarter: 'quarter', harbour: 'harbour', bridge: 'bridge', cemetery: 'cemetery', house: 'house', tavern: 'tavern', church: 'church', hospital: 'hospital', prison: 'prison', wall: 'wall', inn: 'khan' };
  const REGION_KIND = { range: 'mountain', plateau: 'mesa', desert: 'desert', cape: 'island', coast: 'harbour', plain: 'field', delta: 'river', peninsula: 'island', basin: 'oasis', valley: 'field', lowland: 'field', tundra: 'field', gorge: 'cave', depression: 'desert', geoarea: 'forest' };

  /* ---------- a model ---------- */
  function plinthsFor(x0, y0, x1, y1) {
    const ext = Math.max(x1 - x0, y1 - y0) / 2 + 6, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const mk = (ring, inner) => finish({ L: [[ring, -2.2], [ring, 0]], inner, role: 'the ground', lod: 0 });
    return {
      hex: mk(hexring(ext * 1.08, cx, cy), hexring(ext * 1.08 - 1.8, cx, cy)),
      round: mk(rrect(x0 - 6, y0 - 6, x1 + 6, y1 + 6, Math.min(16, ext * .5)), rrect(x0 - 4.4, y0 - 4.4, x1 + 4.4, y1 + 4.4, Math.max(.3, Math.min(14.4, ext * .5 - 1.6)))),
      disc: mk(circ(ext * 1.02, 48, cx, cy), circ(ext * 1.02 - 1.6, 48, cx, cy)),
      none: null,
    };
  }
  /* make(kind, seed, {plinth, args}) builds a model once and keeps its rest pose. */
  function make(kind, seed, o = {}) {
    const fn = KINDS[kind] || KINDS.house || (() => {});
    const R = rng(seed == null ? kind : seed + '|' + kind);
    const B = new Builder(R);
    try { fn(R, B, o.args || {}); } catch (e) { console.warn('iso kind ' + kind, e); }
    if (!B.parts.length) B.box(-10, -10, 10, 10, 0, 10);
    return modelOf(B, kind, seed, o);
  }
  function modelOf(B, kind, seed, o = {}) {
    const parts = B.parts;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zt = 0;
    for (const p of parts) { x0 = Math.min(x0, p.box[0]); y0 = Math.min(y0, p.box[1]); x1 = Math.max(x1, p.box[3]); y1 = Math.max(y1, p.box[4]); zt = Math.max(zt, p.box[5]); }
    const plinths = plinthsFor(x0, y0, x1, y1);
    const m = { kind, seed, parts, plinths, plinth: plinths[o.plinth || 'round'] || null, guides: B.guides, dots: B.dots, bbox: [x0, y0, x1, y1], zt, ext: Math.max(x1 - x0, y1 - y0) / 2 + 6, over: -1, hiRest: -1, orders: {}, items: [] };
    let best = -1, bz = -1; parts.forEach((p, i) => { if (p.lod === 0 && p.L && p.box[5] > bz) { bz = p.box[5]; best = i; } });
    m.hiRest = best;
    return m;
  }

  /* ---------- the paint order ----------
   * Two parts whose boxes are apart along some axis are ordered by that axis
   * (the far one first); the rest by depth. A topological sort of that
   * relation, per side the camera stands on, cached on the model. */
  function orderFor(m, C) {
    const t = toward(C);
    const key = (t[0] >= 0 ? 'a' : 'b') + (t[1] >= 0 ? 'a' : 'b') + (Math.abs(t[0]) > Math.abs(t[1]) ? 'x' : 'y');
    if (m.orders[key]) return m.orders[key];
    const P = m.parts, n = P.length, eps = .05;
    const depth = p => (p.cx * t[0] + p.cy * t[1] + (p.z0 + p.z1) / 2 * t[2] * .5);
    const pr = proj(Object.assign({}, C, { ox: 0, oy: 0 }));
    const rects = P.map(p => { const b = p.box; let a = 1e9, c = -1e9, d = 1e9, e = -1e9; for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) { const q = pr(x, y, z); if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < d) d = q[1]; if (q[1] > e) e = q[1]; } return [a, d, c, e]; });
    const before = (A, Bp) => {
      const a = A.box, b = Bp.box;
      const sx = t[0] >= 0 ? a[3] <= b[0] + eps : a[0] >= b[3] - eps;
      const sy = t[1] >= 0 ? a[4] <= b[1] + eps : a[1] >= b[4] - eps;
      const sz = a[5] <= b[2] + eps;
      const rx = t[0] >= 0 ? b[3] <= a[0] + eps : b[0] >= a[3] - eps;
      const ry = t[1] >= 0 ? b[4] <= a[1] + eps : b[1] >= a[4] - eps;
      const rz = b[5] <= a[2] + eps;
      if ((sx || sy || sz) && !(rx || ry || rz)) return 1;
      if ((rx || ry || rz) && !(sx || sy || sz)) return -1;
      if (sz && !rz) return 1; if (rz && !sz) return -1;
      const da = depth(A), db = depth(Bp);
      return da < db ? 1 : da > db ? -1 : 0;
    };
    const adj = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ri = rects[i], rj = rects[j];
      if (ri[2] < rj[0] || rj[2] < ri[0] || ri[3] < rj[1] || rj[3] < ri[1]) continue;
      const r = before(P[i], P[j]);
      if (r > 0) { adj[i].push(j); indeg[j]++; } else if (r < 0) { adj[j].push(i); indeg[i]++; }
    }
    const out = [], ready = [], done = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
    const byDepth = (a, b) => depth(P[b]) - depth(P[a]);
    while (out.length < n) {
      if (!ready.length) {
        let best = -1, bd = 1e9; for (let i = 0; i < n; i++) if (!done[i] && indeg[i] > 0) { const d = depth(P[i]); if (d < bd) { bd = d; best = i; } }
        indeg[best] = 0; ready.push(best);
      }
      ready.sort(byDepth);
      const i = ready.pop(); if (done[i]) continue; done[i] = 1; out.push(i);
      for (const j of adj[i]) if (!done[j] && --indeg[j] === 0) ready.push(j);
    }
    m.orders[key] = out;
    return out;
  }

  /* attach(model, items): spread a place's tales over the model's roles. */
  function attach(m, items) {
    m.items = items || [];
    const roles = [], seen = new Map();
    m.parts.forEach((p, i) => { const r = p.role; if (!r || p.lod >= 2) return; if (!seen.has(r)) { seen.set(r, roles.length); roles.push({ role: r, parts: [], items: [] }); } roles[seen.get(r)].parts.push(i); });
    m.parts.forEach((p, i) => { const r = p.role; if (r && seen.has(r) && p.lod >= 2) roles[seen.get(r)].parts.push(i); });
    m.items.forEach((it, k) => { if (roles.length) roles[k % roles.length].items.push(it); });
    m.roles = roles;
    m.parts.forEach(p => { p.items = []; });
    for (const r of roles) for (const i of r.parts) m.parts[i].items = r.items;
    return roles;
  }

  /* ---------- painting ---------- */
  function cutPts(p, P, C) {
    const m = mat(C), S = Math.hypot(m[0], m[3]), zf = -m[5] / (S || 1);
    const o = P(p.at[0], p.at[1], p.at[2] + (p.lift || 0));
    const sgn = p.flip ? -1 : 1, w = p.w || p.h;
    return p.cut.map(poly => poly.map(([u, v]) => [o[0] + sgn * u * w * S, o[1] - v * p.h * S * zf]));
  }
  function silOf(p, P, lift) {
    const pts = [];
    for (const [ring, z] of p.L) for (const q of ring) pts.push(P(q.u, q.v, z + lift));
    return hull(pts);
  }
  /* ---------- light ----------
   * Faces are shaded by the way they face, as in Anatomy (github.com/wheresryan22/anatomy, MIT):
   * the light comes from over the viewer's left shoulder, so tops are lightest, the faces
   * that turn to the viewer's left are next, and the faces turned away to the right are
   * darkest. A palette that carries sh (side tones, darkest first) and top gets them;
   * one without stays the flat paper of Hairline. */
  function lightOf(C) {
    const t = toward(C), h = Math.hypot(t[0], t[1]) || 1, hx = t[0] / h, hy = t[1] / h;
    const a = 0.95, lx = hx * Math.cos(a) - hy * Math.sin(a), ly = hx * Math.sin(a) + hy * Math.cos(a);
    const L = Math.hypot(lx * .7, ly * .7, .72);
    return [lx * .7 / L, ly * .7 / L, .72 / L];
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  /* The faces of a solid between each pair of its rings that turn to the viewer, as
   * [screen points, tone index] with tone -1 for a face that looks up (the lid). Neighbouring faces of a band
   * that take the same tone are given as one strip, so a turned body is a few polygons, not hundreds. */
  function facesOf(p, SP, tw, Lt, N) {
    const out = [], LL = p.L;
    for (let k = 0; k + 1 < LL.length; k++) {
      const [R0, z0] = LL[k], [R1, z1] = LL[k + 1];
      const n0 = R0.length, n1 = R1.length;
      if (n0 < 3) continue;
      const same = n1 === n0, S0 = SP[k], S1 = SP[k + 1], tones = new Array(n0).fill(null);
      const dz = z1 - z0;
      for (let i = 0; i < n0; i++) {
        const a = R0[i], b = R0[(i + 1) % n0];
        const c = same ? R1[(i + 1) % n1] : R1[0], d = same ? R1[i] : R1[0];
        /* the face's normal from its bottom edge and its rise, without allocating */
        const ex = b.u - a.u, ey = b.v - a.v, fx = (d.u + c.u - a.u - b.u) / 2, fy = (d.v + c.v - a.v - b.v) / 2;
        let nx = ey * dz, ny = -ex * dz, nz = ex * fy - ey * fx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz); if (len < 1e-9) continue;
        nx /= len; ny /= len; nz /= len;
        const ox = (a.nu + b.nu) / 2, oy = (a.nv + b.nv) / 2;
        if (nx * ox + ny * oy < 0 || (Math.abs(ox) + Math.abs(oy) < 1e-6 && nz < 0)) { nx = -nx; ny = -ny; nz = -nz; }
        if (nx * tw[0] + ny * tw[1] + nz * tw[2] <= 1e-4) continue;
        const lit = (nx * Lt[0] + ny * Lt[1] + nz * Lt[2] + 1) / 2;
        tones[i] = nz > .985 ? -1 : Math.max(0, Math.min(N - 1, Math.floor(lit * N)));
      }
      /* runs of faces with one tone, walked from a face whose neighbour differs */
      const emit = (i0, len) => { const pts = []; for (let j = 0; j <= len; j++) pts.push(S0[(i0 + j) % n0]); if (same) for (let j = len; j >= 0; j--) pts.push(S1[(i0 + j) % n0]); else pts.push(S1[0]); out.push([pts, tones[i0]]); };
      let s = -1; for (let i = 0; i < n0; i++) if (tones[i] !== tones[(i + n0 - 1) % n0]) { s = i; break; }
      if (s < 0) { if (tones[0] != null) { const h = n0 >> 1; emit(0, h); emit(h, n0 - h); } continue; }
      for (let c = 0; c < n0;) { const i0 = (s + c) % n0, t = tones[i0]; let len = 1; while (c + len < n0 && tones[(s + c + len) % n0] === t) len++; if (t != null) emit(i0, len); c += len; }
    }
    // the lid: the top ring, if it is a face and not a point
    const RT = LL[LL.length - 1][0];
    if (RT.length >= 3) out.push([SP[LL.length - 1], -1]);
    return out;
  }

  /* draw(ctx, m, cam, pal, o): pal = {plate, edge, mid, lo, hi, sh?: [side tones, darkest first], top?, L?, cols?}; o.lw stroke px; o.maxLod;
   * pal.L, a unit vector toward the light, replaces the light over the viewer's shoulder (a lamp or a fire on the stage);
   * pal.cols[name] is the palette for every part built with .col = name (a coloured part of a model).
   * o.hiParts a Set to light; o.alpha; o.plinth 'hex'|'round'|'disc'|'none'; o.plain no highlight; o.now;
   * o.liftK multiplies every lift, so a small model's answer to the hand can still be seen.
   * Returns the screen box drawn. */
  function draw(ctx, m, C, pal, o = {}) {
    const P = proj(C), tw = toward(C), front = q => q.nu * tw[0] + q.nv * tw[1] >= -1e-6;
    const now = o.now == null ? performance.now() : o.now, lw = o.lw || 1, maxLod = o.maxLod == null ? 2 : o.maxLod;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    const grow = pts => { for (const q of pts) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < by0) by0 = q[1]; if (q[1] > by1) by1 = q[1]; } };
    const path = (pts, close) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); };
    let cur = pal;
    /* o.glow: the accent's lines glow on a real canvas (a soft light of their own colour about them) */
    const glowPx = o.glow && typeof ctx.getImageData === 'function' ? o.glow : 0;
    const stroke = (cls, hi) => { ctx.strokeStyle = hi ? cur.hi : cls === 'lo' ? cur.lo : cls === 'mid' ? cur.mid : cur.edge; ctx.lineWidth = (hi ? lw * 1.35 : cls === 'lo' ? lw * .8 : lw); if (hi && glowPx) { ctx.shadowColor = cur.hi; ctx.shadowBlur = glowPx; ctx.stroke(); ctx.shadowBlur = 0; } else ctx.stroke(); };
    const shaded = !!(pal.sh && pal.sh.length && o.shade !== false), Lt = pal.L || lightOf(C);
    const seam = typeof ctx.getImageData === 'function';      // a canvas closes the hairline between faces; an SVG recorder doesn't need it
    const root = pal;
    const fillPoly = (pts, col) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    const drawPart = (p, lift, hi) => {
      p.lift = lift;
      const cp = p.col && root.cols && root.cols[p.col], pal = cur = cp && (!shaded || cp.sh) ? cp : root;
      if (p.L) {
        /* every ring point projected once, for the outline and the faces alike */
        const SP = p.L.map(([R, z]) => R.map(q => P(q.u, q.v, z + lift))), flat = [].concat(...SP);
        /* the outline's vertices are the same points while the azimuth holds (a lift or a move only translates them) */
        const hk = C.M ? NaN : Math.round(C.az * 572.958) + '|' + C.k;
        if (p.hk !== hk || p.hn !== flat.length) { p.hidx = hullIdx(flat); p.hk = hk; p.hn = flat.length; }
        const sil = p.hidx.map(i => flat[i]); grow(sil);
        path(sil, true); ctx.fillStyle = pal.plate; ctx.fill();
        if (shaded) {
          // the faces, toned by the light; one path per tone, each face drawn a hair larger so no seam shows
          const N = pal.sh.length, faces = facesOf(p, SP, tw, Lt, N), byTone = new Map();
          for (const [pts, t] of faces) { let a = byTone.get(t); if (!a) byTone.set(t, a = []); a.push(pts); }
          const lit = hi && pal.litTop;
          for (const [t, list] of byTone) {
            const col = t < 0 ? (lit ? pal.litTop : pal.top || pal.plate) : (lit && pal.litSh ? pal.litSh : pal.sh[t]);
            ctx.beginPath();
            for (const pts of list) { for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); ctx.closePath(); }
            ctx.fillStyle = col; ctx.fill(); if (seam) { ctx.strokeStyle = col; ctx.lineWidth = .5; ctx.stroke(); }
          }
          path(sil, true);
        }
        stroke('edge', hi);
        if (p.inner && maxLod >= 1) {
          const zc = (p.creaseZ != null ? p.creaseZ : p.L[p.L.length - 1][1]) + lift;
          const cr = run(p.inner, front).map(q => P(q.u, q.v, zc));
          if (cr.length > 1) { path(cr, false); stroke('lo'); }
        }
      } else if (p.plate) {
        const pts = p.plate.map(q => P(q[0], q[1], q[2] + lift)); grow(pts);
        let col = pal.plate;
        if (shaded && p.plate.length >= 3) {
          const A = p.plate[0], Bq = p.plate[1], Cq = p.plate[2];
          let n = cross([Bq[0] - A[0], Bq[1] - A[1], Bq[2] - A[2]], [Cq[0] - A[0], Cq[1] - A[1], Cq[2] - A[2]]); const len = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / len, n[1] / len, n[2] / len];
          if (n[0] * tw[0] + n[1] * tw[1] + n[2] * tw[2] < 0) n = [-n[0], -n[1], -n[2]];
          col = n[2] > .985 ? (pal.top || pal.plate) : pal.sh[Math.max(0, Math.min(pal.sh.length - 1, Math.floor((n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2] + 1) / 2 * pal.sh.length)))];
        }
        path(pts, true); if (p.cls !== 'nf') { ctx.fillStyle = col; ctx.fill(); } stroke(p.cls === 'lo' ? 'lo' : 'edge', hi && p.hiOK);
      } else if (p.line) {
        const pts = p.line.map(q => P(q[0], q[1], q[2] + lift)); grow(pts);
        path(pts, false); ctx.strokeStyle = hi ? pal.hi : p.cls === 'lo' ? pal.lo : p.cls === 'mid' ? pal.mid : pal.edge; ctx.lineWidth = lw * (p.w || 1) * (hi ? 1.2 : 1); ctx.stroke();
      } else if (p.cut) {
        const polys = cutPts(p, P, C);
        for (const pts of polys) { grow(pts); path(pts, true); ctx.fillStyle = shaded ? pal.sh[pal.sh.length - 1] : pal.plate; ctx.fill(); stroke('edge', hi); }
        if (p.lines && maxLod >= 1) { for (const pts of cutPts({ ...p, cut: p.lines }, P, C)) { path(pts, false); stroke('lo'); } }
      }
      if (p.marks.length && maxLod >= 1) for (const mk of p.marks) {
        if (mk.lod > maxLod) continue;
        if (mk.n && mk.n[0] * tw[0] + mk.n[1] * tw[1] + mk.n[2] * tw[2] <= 0.02) continue;
        if (mk.axis || mk.ns) {
          ctx.beginPath(); let on = false;
          for (let i = 1; i < mk.pts.length; i++) {
            const a = mk.pts[i - 1], b = mk.pts[i], nn = mk.ns && mk.ns[i - 1], mx = nn ? nn[0] : (a[0] + b[0]) / 2 - mk.axis[0], my = nn ? nn[1] : (a[1] + b[1]) / 2 - mk.axis[1];
            if (mx * tw[0] + my * tw[1] + (nn && nn[2] ? nn[2] * tw[2] : 0) > 0) { const pa = P(a[0], a[1], a[2] + lift), pb = P(b[0], b[1], b[2] + lift); if (!on) ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); on = true; } else on = false;
          }
          stroke(mk.cls); continue;
        }
        path(mk.pts.map(q => P(q[0], q[1], q[2] + lift)), mk.closed); stroke(mk.cls);
      }
    };
    const pl = o.plinth ? m.plinths[o.plinth] : m.plinth;
    if (o.halo && pal.halo && 'filter' in ctx) {
      const foot = pl || m.plinths.round, ring = foot.L[0][0];
      const pts = hull(ring.map(q => P(q.u * 1.04, q.v * 1.04, 0)));
      const sc = Math.hypot(mat(C)[0], mat(C)[3]);
      ctx.save(); ctx.filter = 'blur(' + Math.max(2, Math.min(14, 9 * sc)).toFixed(1) + 'px)'; ctx.globalAlpha *= pal.haloA || .5;
      ctx.translate(0, Math.max(1, 3 * sc)); fillPoly(pts, pal.halo); ctx.restore();
    }
    if (pl && o.plinth !== 'none') drawPart(pl, 0, false);
    if (m.guides.length && maxLod >= 1) {
      ctx.setLineDash([lw * 1.5, lw * 4]);
      for (const g of m.guides) { path(g.map(q => P(q[0], q[1], 0)), false); stroke('mid'); }
      ctx.setLineDash([]);
    }
    const order = orderFor(m, C), hiSet = o.hiParts;
    for (const i of order) {
      const p = m.parts[i];
      if (p.lod > maxLod) continue;
      const lift = (p.sp.x + (tdone(p.tw, now) && p.tw.to === 0 ? 0 : tval(p.tw, now))) * (o.liftK || 1);
      const hi = hiSet ? hiSet.has(i) : (m.over >= 0 ? i === m.over : (!o.plain && i === m.hiRest));
      drawPart(p, lift, hi);
    }
    for (const d of m.dots) { const q = P(d[0], d[1], d[2] || 0); ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(.8, lw * 1.1), 0, Math.PI * 2); ctx.fillStyle = d[3] === 'dot off' ? pal.lo : d[3] === 'dot m' ? pal.edge : pal.hi; ctx.fill(); }
    ctx.restore();
    return [bx0, by0, bx1, by1];
  }

  /* The screen box of the rest pose relative to the origin, at scale S (or a camera). */
  function bbox(m, S, maxLod = 2, plinthKind) {
    const C = typeof S === 'object' ? Object.assign({}, S, { ox: 0, oy: 0 }) : Cam(45, .5, S);
    const P = proj(C);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const grow = q => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; };
    const pl = plinthKind ? m.plinths[plinthKind] : m.plinth;
    if (pl) for (const [ring, z] of pl.L) for (const q of ring) grow(P(q.u, q.v, z));
    for (const p of m.parts) {
      if (p.lod > maxLod) continue;
      if (p.L) for (const [ring, z] of p.L) for (const q of ring) grow(P(q.u, q.v, z));
      else if (p.plate) p.plate.forEach(q => grow(P(q[0], q[1], q[2])));
      else if (p.line) p.line.forEach(q => grow(P(q[0], q[1], q[2])));
      else if (p.cut) cutPts(p, P, C).forEach(poly => poly.forEach(grow));
    }
    return [x0, y0, x1, y1];
  }
  function extent(m, S) { const b = bbox(m, S); return { w: b[2] - b[0], h: b[3] - b[1] }; }

  /* ---------- the hand ---------- */
  /* hit(model, cam, sx, sy, maxLod): the part under a screen point, at rest (rule 1); -2 the model's ground; -1 none. */
  function hit(m, C, sx, sy, maxLod = 2) {
    const P = proj(C), order = orderFor(m, C);
    for (let k = order.length - 1; k >= 0; k--) {
      const p = m.parts[order[k]];
      if (p.lod > maxLod) continue;
      if (p.L) { if (inConvex(silOf(p, P, 0), sx, sy)) return order[k]; }
      else if (p.plate) { if (inPoly(p.plate.map(q => P(q[0], q[1], q[2])), sx, sy)) return order[k]; }
      else if (p.cut) { if (cutPts({ ...p, lift: 0 }, P, C).some(poly => inPoly(poly, sx, sy))) return order[k]; }
      else if (p.line) { const pts = p.line.map(q => P(q[0], q[1], q[2])); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((sx - a[0]) * dx + (sy - a[1]) * dy) / L2, 0, 1); if (Math.hypot(a[0] + dx * t - sx, a[1] + dy * t - sy) < 4) return order[k]; } }
    }
    const pl = m.plinth || m.plinths.round;
    if (pl && inConvex(silOf(pl, P, 0), sx, sy)) return -2;
    return -1;
  }
  /* hover(m, over): over is a part index, -2 for the model as a whole (its ground or its name), -1 for none */
  function hover(m, over) {
    if (m.over === over) return false;
    m.over = over;
    m.parts.forEach((p, i) => { p.sp.t = over === -2 ? .9 : i === over ? 1.6 : 0; });
    return true;
  }
  /* touch: a wave of lift from the touched part, by distance (rule 2), each part returning. */
  function touch(m, at, now) {
    const o = at >= 0 ? m.parts[at] : { cx: 0, cy: 0 };
    for (const p of m.parts) {
      const d = Math.hypot(p.cx - o.cx, p.cy - o.cy);
      p.tw.dur = 520; tset(p.tw, 3.2 + Math.min(2.5, 8 / (1 + d * .06)), now, Math.min(600, d * 6)); p.ret = true;
    }
  }
  function step(m, dt, now) {
    let moving = false;
    for (const p of m.parts) {
      if (stepS(p.sp, dt)) moving = true;
      if (p.ret && tdone(p.tw, now) && p.tw.to > 0) { p.tw.dur = 700; tset(p.tw, 0, now, 0); }
      if (!tdone(p.tw, now)) moving = true;
      else if (p.ret && p.tw.to === 0) p.ret = false;
    }
    return moving;
  }

  /* ---------- scenes: a place with the things a sentence names ----------
   * compose(baseKind, baseSeed, props [{name, seed}], {back, puppet, plinth}) builds a stage:
   * the place set back on a disc, scaled by `back`, and the props and figures standing
   * in front at puppet scale (`puppet` units to a person's height). */
  function transformPart(p, f, dx, dy) {
    const tr = q => ({ u: q.u * f + dx, v: q.v * f + dy, nu: q.nu, nv: q.nv });
    const t3 = q => [q[0] * f + dx, q[1] * f + dy, q[2] * f];
    const n = { role: p.role, lod: p.lod, cls: p.cls, w: p.w, hiOK: p.hiOK, flip: p.flip, col: p.col };
    if (p.L) { n.L = p.L.map(([ring, z]) => [ring.map(tr), z * f]); n.inner = p.inner ? p.inner.map(tr) : null; if (p.creaseZ != null) n.creaseZ = p.creaseZ * f; }
    if (p.plate) n.plate = p.plate.map(t3);
    if (p.line) n.line = p.line.map(t3);
    if (p.cut) { n.cut = p.cut; n.at = t3(p.at); n.h = p.h * f; n.w = (p.w || p.h) * f; n.lines = p.lines; }
    n.marks = (p.marks || []).map(mk => ({ ...mk, pts: mk.pts.map(t3) }));
    if (p.face) n.face = { x0: p.face.x0 * f + dx, x1: p.face.x1 * f + dx, y0: p.face.y0 * f + dy, y1: p.face.y1 * f + dy, z0: p.face.z0 * f, z1: p.face.z1 * f, t: (p.face.t || 0) * f };
    return n;
  }
  function compose(baseKind, baseSeed, props, o = {}) {
    const R = rng((baseSeed || baseKind) + '|scene|' + props.map(p => p.name).join(','));
    const B = new Builder(R);
    const fn = KINDS[baseKind];
    const f = o.back == null ? .62 : o.back, dy = o.dy == null ? -18 : o.dy;
    if (fn) {
      const inner = new Builder(rng(baseSeed == null ? baseKind : baseSeed + '|' + baseKind));
      try { fn(inner.R, inner, {}); } catch (e) { console.warn('iso kind ' + baseKind, e); }
      for (const p of inner.parts) B.add(transformPart(p, f, 0, dy));
      for (const g of inner.guides) B.guides.push(g.map(q => [q[0] * f, q[1] * f + dy]));
    }
    const slots = o.slots || [[-22, 30], [10, 34], [32, 16], [-40, 10], [40, -6], [-6, 44]];
    let si = 0;
    for (const p of props) {
      const fn2 = PROPS[p.name]; if (!fn2) continue;
      const s = p.at || slots[si++ % slots.length];
      const before = B.parts.length;
      try { fn2(rng((p.seed || '') + p.name), B, s[0], s[1], o.puppet || 30); } catch (e) { console.warn('iso prop ' + p.name, e); }
      for (let i = before; i < B.parts.length; i++) B.parts[i].prop = p.name;
    }
    return modelOf(B, 'scene:' + baseKind, baseSeed, { plinth: o.plinth || 'disc' });
  }

  /* the map's two palettes: plate is the paper a model is cut from, hi the one bright stroke */
  const PAL = {
    light: { plate: '#f5eedd', edge: 'rgba(58,38,16,.74)', mid: 'rgba(58,38,16,.42)', lo: 'rgba(58,38,16,.24)', hi: 'rgba(18,10,2,.96)',
      top: '#fefbf4', sh: ['#d3c8b0', '#dcd2bc', '#e4dbc8', '#ebe3d2', '#f1eadc', '#f6f0e5'], halo: '#8a7a5c', haloA: .34 },
    dark: { plate: '#161b17', edge: 'rgba(236,228,206,.76)', mid: 'rgba(236,228,206,.42)', lo: 'rgba(236,228,206,.2)', hi: '#fff3cf',
      top: '#242b25', sh: ['#0c100d', '#0f1410', '#121813', '#151c16', '#18201a', '#1c241d'], halo: '#000', haloA: .7 },
  };

  return {
    PAL, clamp, lerp, rad, Cam, mat, toward, proj, unproj, facing, lightOf,
    rrect, circ, ngon, hexring, lens, fromPts, inset, shift, scaleRing, hull, run, inConvex, inPoly,
    spring, stepS, bezier, EASE_LIFT, tween, tset, tval, tdone, rng, hashStr,
    Builder, KINDS, PROPS, def, prop, WORDS, kindFromText, LOCALE_KIND, REGION_KIND,
    make, modelOf, compose, attach, orderFor, draw, bbox, extent, hit, hover, touch, step,
  };
})();
