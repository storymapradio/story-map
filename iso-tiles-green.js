/*
 * The ground of the Story Map, green and blue: terrain tiles for the woods and fields of Appalachia
 * and Tuscany, the olive terraces of Greece, the plateau of the Zuni, the young lava of Hawaii, the
 * rice terraces of the east, and the coasts and sea lanes between them.
 *
 * A TILE is a flat-top hexagon of radius 25 model units centred on the origin (x east, y south, z up).
 * Corner k lies at (25 cos 60k, -25 sin 60k); edge i joins corners i and i + 1 and faces the vector
 * (cos(60i + 30), -sin(60i + 30)). The map draws the hexagon itself, a faint tint and its edge; a
 * tile draws only what lies on that ground and stands on it, inside a radius of about 23.
 * A.water and A.road are six-bit masks: bit i set means the neighbour across edge i is water, or a
 * road. A tile is drawn from 18 to 55 px wide, so lod 0 is one or two clean masses, lod 1 the
 * secondary forms the map shows below S 0.6, and lod 2 the fine marks above it.
 *
 * FIELDS CONTINUE. Neighbouring centres differ by (37.5, -21.65) and (0, -43.3). A row along x every
 * 21.65 / k, or a row along y every 37.5 / k, therefore falls on the same world line in every tile,
 * and a wave along x with a period of 37.5 / k keeps its phase. Vine rows, furrows, paddy bunds and
 * waffle walls are laid on that lattice, so a field of thirty tiles reads as one field; what grows or
 * stands in it is left to the seed.
 *
 * The habits are those of iso-kinds-land.js (whose small helpers are copied here, not shared): a
 * solid is the hull of its layers, surface detail is marks, a mark on a round body is cut into
 * short runs with their own normals, and ground detail hangs on a part laid at z -0.12, which the
 * paint order puts under everything standing on it.
 */
(function boot() {
  'use strict';
  if (!window.ISO) { setTimeout(boot, 30); return; }
  const { def, fromPts, inset, inConvex } = ISO;
  const TAU = Math.PI * 2, PI = Math.PI, { cos, sin, abs, hypot, max, min, pow, sqrt, round, floor, atan2 } = Math;
  const lerp = (a, b, t) => a + (b - a) * t;
  const S2 = Math.SQRT1_2, R3 = sqrt(3);
  /* On the ground, EH runs across the eye's view (to the right) and EU away from the eye. */
  const EH = [S2, -S2], EU = [-S2, -S2];
  const mod = (a, m) => ((a % m) + m) % m;

  /* ---------- the hexagon ---------- */
  const AP = 25 * R3 / 2;                 // the apothem, 21.65
  const PX = 37.5, PY = AP;               // the field periods along x and along y
  const EN = [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i + 30) * PI / 180; return [cos(a), -sin(a)]; });
  const corner = (k, r = 25) => { const a = mod(k, 6) * PI / 3; return [r * cos(a), -r * sin(a)]; };
  const bit = (m, i) => ((m | 0) >> mod(i, 6)) & 1;
  /* the distance from (x, y) to the nearest edge of the hexagon of radius Rh (negative outside) */
  const room = (x, y, Rh = 23) => { let m = -1e9; for (const n of EN) m = max(m, n[0] * x + n[1] * y); return Rh * R3 / 2 - m; };
  /* the hexagon radius a point lies on, and the factor that brings a set of points inside radius Rh */
  const hexR = (x, y) => max(abs(y) * 2 / R3, abs(x) + abs(y) / R3);
  const fitScale = (P, Rh) => { let m = 0; for (const p of P) m = max(m, hexR(p[0], p[1])); return m > Rh ? Rh / m : 1; };
  const ceilTo = (v, s) => Math.ceil(v / s - 1e-9) * s;
  /* how deep (x, y) lies inside edge i */
  const depthIn = (i, x, y) => AP - (EN[i][0] * x + EN[i][1] * y);
  /* the part of the segment p-q inside the hexagon of radius r, as parameters [t0, t1] */
  function segT(p, q, r) {
    const a = r * R3 / 2, dx = q[0] - p[0], dy = q[1] - p[1]; let t0 = 0, t1 = 1;
    for (const n of EN) {
      const num = a - (n[0] * p[0] + n[1] * p[1]), den = n[0] * dx + n[1] * dy;
      if (abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = num / den;
      if (den > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t;
      if (t0 > t1) return null;
    }
    return [t0, t1];
  }
  const lerpP = (p, q, t) => p.map((v, j) => v + (q[j] - v) * t);
  /* a polyline cut to the hexagon of radius r: the runs of it that lie inside */
  function clipLine(pts, r) {
    const out = []; let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], tt = segT(p, q, r);
      if (!tt || tt[1] - tt[0] < 1e-9) { if (cur) { out.push(cur); cur = null; } continue; }
      if (!cur || tt[0] > 1e-9) { if (cur) out.push(cur); cur = [lerpP(p, q, tt[0])]; }
      cur.push(lerpP(p, q, tt[1]));
      if (tt[1] < 1 - 1e-9) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter(r => r.length > 1);
  }
  /* the runs of set bits round the hexagon, as [first edge, count] */
  function runsOf(mask) {
    mask &= 63; if (!mask) return []; if (mask === 63) return [[0, 6]];
    const out = [];
    for (let i = 0; i < 6; i++) if (bit(mask, i) && !bit(mask, i - 1)) { let L = 0; while (L < 6 && bit(mask, i + L)) L++; out.push([i, L]); }
    return out;
  }
  /* the line that follows a run of edges at depth d inside them; its ends turn out to the corners at radius rEnd */
  function shoreLine(i0, L, d, rEnd = 24.2, per = 4) {
    const rd = (AP - d) * 2 / R3, P = [];
    if (L >= 6) { for (let k = 0; k <= 12; k++) P.push(k % 2 ? EN[(k - 1) / 2 % 6].map(v => v * (AP - d)) : corner(k / 2, rd * .985)); return spline(P, per); }
    P.push(corner(i0, rEnd));
    for (let j = 0; j < L; j++) {
      const i = i0 + j, a = corner(i, rd), b = corner(i + 1, rd);
      P.push(j === 0 ? lerp2(a, b, .22) : a, lerp2(a, b, .5));
      if (j === L - 1) P.push(lerp2(a, b, .78));
    }
    P.push(corner(i0 + L, rEnd));
    return spline(P, per);
  }
  /* the edge a building should face: the road edge most turned to the eye, or a way toward the eye */
  function facing(R, mask) {
    const j = R.r(-.75, .75);
    let best = -1, bv = -9;
    for (let i = 0; i < 6; i++) if (bit(mask, i)) { const v = EN[i][0] + EN[i][1]; if (v > bv + 1e-6) { bv = v; best = i; } }
    return best >= 0 ? [atan2(EN[best][1], EN[best][0]), best] : [PI / 4 + j, -1];
  }
  /* scatter discs over the hexagon: mk() gives {r, ...}; each kept disc fits inside radius Rh and stays gap * (r1 + r2) from the rest */
  function place(R, list, n, mk, o = {}) {
    const Rh = o.Rh || 23, gap = o.gap == null ? .85 : o.gap, avoid = o.avoid || [], fit = o.fit == null ? 1 : o.fit;
    for (let t = 0; t < (o.tries || 70) && list.length < n; t++) {
      const d = mk(), x = R.r(-21, 21), y = R.r(-19, 19);
      if (room(x, y, Rh) < d.r * fit) continue;
      if (list.some(e => hypot(e.x - x, e.y - y) < (e.r + d.r) * gap)) continue;
      if (avoid.some(([ax, ay, ar]) => hypot(ax - x, ay - y) < ar + d.r * gap)) continue;
      if (o.ok && !o.ok(x, y, d)) continue;
      d.x = x; d.y = y; list.push(d);
    }
    return list;
  }

  /* ---------- outlines and curves (after iso-kinds-land.js) ---------- */
  const rotP = (x, y, a, cx = 0, cy = 0) => { const c = cos(a), s = sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  const ell = (cx, cy, rx, ry, n = 16, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; o.push(rotP(cx + rx * cos(a), cy + ry * sin(a), rot, cx, cy)); } return o; };
  const wob = (R, cx, cy, rx, ry, n = 10, jit = .1, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU, f = 1 + R.r(-jit, jit); o.push(rotP(cx + rx * f * cos(a), cy + ry * f * sin(a), rot, cx, cy)); } return o; };
  const lerpPoly = (A, Bq, t) => A.map((p, i) => [lerp(p[0], Bq[i][0], t), lerp(p[1], Bq[i][1], t)]);
  const at = (P, z) => P.map(p => [p[0], p[1], z]);
  const closed = P => P.concat([P[0]]);
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const scl = (P, f, c) => P.map(p => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
  function spline(P, per = 6) {
    const o = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[min(P.length - 1, i + 2)];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        o.push(p1.map((_, j) => .5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    o.push(P[P.length - 1].slice());
    return o;
  }
  /* a polyline offset sideways by d (positive to its left as drawn in plan) */
  function offsetLine(P, d) {
    return P.map((p, i) => { const a = P[max(0, i - 1)], b = P[min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1; return [p[0] + dy / l * d, p[1] - dx / l * d]; });
  }
  /* the stretch of a polyline between fractions t0 and t1 of its length */
  function portion(P, t0, t1) {
    const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const T = L[L.length - 1], a = t0 * T, b = t1 * T, out = [];
    for (let i = 1; i < P.length; i++) {
      if (L[i] < a || L[i - 1] > b) continue;
      const f0 = max(0, (a - L[i - 1]) / (L[i] - L[i - 1] || 1)), f1 = min(1, (b - L[i - 1]) / (L[i] - L[i - 1] || 1));
      if (!out.length) out.push(lerpP(P[i - 1], P[i], f0));
      out.push(lerpP(P[i - 1], P[i], f1));
    }
    return out;
  }

  /* ---------- solids from layers ---------- */
  function sol(B, layers, o = {}) {
    const top = layers[layers.length - 1][0];
    return B.add({ L: layers.map(([p, z]) => [fromPts(p), z]), inner: o.crease && top.length > 2 ? inset(fromPts(top), o.crease) : null, role: o.role, lod: o.lod || 0 });
  }
  function heightIn(layers, x, y) {
    if (!inConvex(layers[0][0], x, y)) return layers[0][1];
    let z = layers[0][1];
    for (let i = 0; i < layers.length - 1; i++) {
      const [A, za] = layers[i], [Bq, zb] = layers[i + 1];
      if (inConvex(Bq, x, y)) { z = zb; continue; }
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (inConvex(lerpPoly(A, Bq, m), x, y)) lo = m; else hi = m; }
      return lerp(za, zb, lo);
    }
    return z;
  }
  function sectionAt(layers, z) {
    for (let i = 0; i < layers.length - 1; i++) {
      const [A, za] = layers[i], [Bq, zb] = layers[i + 1];
      if (z <= zb) return lerpPoly(A, Bq, (z - za) / (zb - za || 1));
    }
    return layers[layers.length - 1][0].slice();
  }
  function rayHit(poly, cx, cy, a) {
    const dx = cos(a), dy = sin(a); let best = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex;
      if (abs(den) < 1e-9) continue;
      const t = ((p[0] - cx) * ey - (p[1] - cy) * ex) / den, u = ((p[0] - cx) * dy - (p[1] - cy) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = max(best, t);
    }
    return [cx + dx * best, cy + dy * best];
  }
  const clamp01 = v => max(0, min(1, v));
  function ringAt(layers, ctr, z, n = 24, a0 = 0) {
    let i = 0; while (i < layers.length - 2 && z > layers[i + 1][1]) i++;
    const [A, za] = layers[i], [Bq, zb] = layers[i + 1], t = clamp01((z - za) / (zb - za || 1)), out = [];
    for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; out.push(lerp2(rayHit(A, ctr[0], ctr[1], a), rayHit(Bq, ctr[0], ctr[1], a), t)); }
    return out;
  }
  /* a drawing on a solid's surface, each stroke shown only while the face under it turns to the eye */
  function surf(B, part, pts, ctr, o = {}) {
    const sl = o.slope == null ? .3 : o.slope, ch = sqrt(1 - sl * sl);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2 - ctr[0], my = (a[1] + b[1]) / 2 - ctr[1];
      let nx, ny;
      if (o.radial) { nx = mx; ny = my; } else { nx = b[1] - a[1]; ny = a[0] - b[0]; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } }
      const L = hypot(nx, ny) || 1;
      B.mark([a, b], { on: part, n: [nx / L * ch, ny / L * ch, sl], cls: o.cls || 'lo', lod: o.lod == null ? 1 : o.lod });
    }
  }
  function strata(B, part, layers, ctr, zs, o = {}) {
    zs.forEach((z, i) => {
      const ring = ringAt(layers, ctr, z, o.n || 30, o.a0 || 0), w = o.wave || 0;
      const pts = closed(ring).map((p, k) => [p[0], p[1], z + (w ? sin(k * 1.9 + i * 2.3) * w : 0)]);
      surf(B, part, pts, ctr, { slope: o.slope == null ? .3 : o.slope, cls: typeof o.cls === 'function' ? o.cls(i) : (o.cls || 'lo'), lod: typeof o.lod === 'function' ? o.lod(i) : (o.lod == null ? 2 : o.lod) });
    });
  }
  function fall(B, part, layers, ctr, a, z1, z0, o = {}) {
    const pts = [], k = o.k || 4;
    for (let i = 0; i <= k; i++) { const z = lerp(z1, z0, i / k), p = ringAt(layers, ctr, z, 1, a + (o.wander ? sin(i * 2.1) * o.wander : 0))[0]; pts.push([p[0], p[1], z]); }
    surf(B, part, pts, ctr, { radial: true, slope: o.slope == null ? .4 : o.slope, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
  }
  /* the faces of a layered solid turned from the light (to the right of the view) hatched with fall lines */
  function shade(B, part, layers, ctr, o = {}) {
    const base = layers[0][0], n = base.length, z0 = layers[0][1], zt = layers[layers.length - 1][1];
    const zHi = o.zHi == null ? lerp(z0, zt, .9) : o.zHi, zLo = o.zLo == null ? lerp(z0, zt, .06) : o.zLo, zMid = lerp(zLo, zHi, .55);
    const S0 = sectionAt(layers, zLo);
    for (let i = 0; i < n; i++) {
      const m = lerp2(base[i], base[(i + 1) % n], .5), dx = m[0] - ctr[0], dy = m[1] - ctr[1], d = hypot(dx, dy) || 1;
      const right = (dx * S2 - dy * S2) / d;
      if (right < (o.min == null ? .2 : o.min)) continue;
      const k = right > .6 ? (o.dense || 6) : 3;
      for (let j = 1; j < k; j++) {
        const t = j / k, zt2 = o.flat ? zHi : lerp(zHi, zMid, abs(t - .5) * 1.4), S1 = sectionAt(layers, zt2);
        const a = lerp2(S1[i], S1[(i + 1) % n], t), b = lerp2(S0[i], S0[(i + 1) % n], t);
        surf(B, part, [[a[0], a[1], zt2], [b[0], b[1], zLo]], ctr, { radial: true, slope: o.slope || .5, lod: j % 2 ? (o.lodA || 1) : 2 });
      }
    }
  }
  /* a closed ring round a round body, drawn on its near side in short runs, each with its own normal */
  function ringMark(B, part, pts, ctr, o = {}) {
    const step = o.step || 2, nz = o.nz || 0;
    for (let k = 0; k + 1 < pts.length; k += step) {
      const run = pts.slice(k, min(pts.length, k + step + 1)), m = run[run.length >> 1], dx = m[0] - ctr[0], dy = m[1] - ctr[1], L = hypot(dx, dy) || 1, ch = sqrt(max(0, 1 - nz * nz));
      B.mark(run, { on: part, n: [dx / L * ch, dy / L * ch, nz], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
    }
  }
  function hoop(B, part, cx, cy, r, z, o = {}) {
    const pts = [], n = o.n || 20; for (let k = 0; k <= n; k++) { const a = k / n * TAU; pts.push([cx + cos(a) * r, cy + sin(a) * r, z]); }
    ringMark(B, part, pts, [cx, cy], { cls: o.cls, lod: o.lod, nz: o.nz });
  }
  function staves(B, part, cx, cy, r, z0, z1, n, o = {}) {
    for (let k = 0; k < n; k++) { const a = (k + (o.off || 0)) / n * TAU, ca = cos(a), sa = sin(a), r1 = r * (o.top == null ? 1 : o.top); B.mark([[cx + ca * r, cy + sa * r, z0], [cx + ca * r1, cy + sa * r1, z1]], { on: part, n: [ca, sa, o.nz || 0], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod }); }
  }
  /* how many parts a tile shows from afar so far (lod 0 and 1), to keep within the budget of eight */
  const n01 = B => B.parts.reduce((n, p) => n + (p.lod <= 1 ? 1 : 0), 0);
  /* the ground: a stroke laid at z -0.12 that carries the ground's marks, painted under all that stands */
  function ground(B, pts, o = {}) { return B.line(at(pts, -.12), { role: o.role || 'the ground', cls: o.cls || 'lo', lod: o.lod == null ? 1 : o.lod }); }

  /* ---------- the furniture of the country ---------- */
  function rock(B, R, cx, cy, r, h, o = {}) {
    const n = R.i(5, 7), rot = R() * TAU, z = o.z || 0, a0 = R() * TAU, ox = R.r(-.3, .3) * r, oy = R.r(-.3, .3) * r;
    const layers = [
      [wob(R, cx, cy, r, r * R.r(.65, .95), n, .18, rot, a0), z],
      [wob(R, cx + ox * .4, cy + oy * .4, r * .88, r * .72, n, .12, rot, a0), z + h * .45],
      [wob(R, cx + ox, cy + oy, r * R.r(.3, .5), r * R.r(.25, .42), max(3, n - 2), .2, rot, a0), z + h],
    ];
    const p = sol(B, layers, { role: o.role || 'the rocks', lod: o.lod == null ? 1 : o.lod });
    if (o.plain !== true && r > 1.2) {
      const c = [cx + ox * .4, cy + oy * .4];
      strata(B, p, layers, c, [z + h * R.r(.22, .3), z + h * R.r(.56, .66)], { n: 14, slope: .35, lod: 2 });
      fall(B, p, layers, c, PI / 4 + R.r(-.7, .7), z + h * .92, z + h * .08, { k: 3, wander: .12, slope: .4, lod: 2 });
    }
    return p;
  }
  /* a tuft of grass or fern: blades out from one root, drawn as one stroke out and back */
  function tuftPts(R, x, y, z, h, o = {}) {
    const n = o.n || 6, pts = [[x, y, z]], a0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + R.r(-.3, .3), l = h * R.r(.62, 1), sp = l * (o.spread || .42) * R.r(.6, 1);
      const m = [x + cos(a) * sp * .35, y + sin(a) * sp * .35, z + l * .62], t = [x + cos(a) * sp, y + sin(a) * sp, z + l * R.r(.82, 1)];
      pts.push(m, t, m, [x, y, z]);
    }
    return pts;
  }
  function tuft(B, R, x, y, z, h, o = {}) { return B.line(tuftPts(R, x, y, z, h, o), { role: o.role || 'the grass', cls: o.cls || 'mid', lod: o.lod == null ? 2 : o.lod }); }
  /* a flower on its stem: a small closed head over the grass */
  function flower(B, host, R, x, y, h, lod = 2) {
    const hz = h, s = R.r(.32, .48);
    B.mark([[x, y, 0], [x + R.r(-.2, .2), y + R.r(-.2, .2), hz - s * .6]], { on: host, cls: 'lo', lod });
    B.mark([[x - EH[0] * s, y - EH[1] * s, hz], [x, y, hz + s * .8], [x + EH[0] * s, y + EH[1] * s, hz], [x, y, hz - s * .7]], { on: host, closed: true, cls: 'mid', lod });
  }
  /* pebbles: small stones as closed marks, thinning toward the rim of their patch */
  function pebbles(B, host, R, cx, cy, rx, ry, n, z, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = R() * TAU, d = pow(R(), .65), x = cx + cos(a) * rx * d, y = cy + sin(a) * ry * d, sz = R.r(.24, .6) * (1 - d * .55) * (o.s || 1), m = R.i(4, 6), pts = [];
      for (let i = 0; i < m; i++) { const b = i / m * TAU + R() * .5; pts.push([x + cos(b) * sz, y + sin(b) * sz * .8, z]); }
      B.mark(pts, { on: host, closed: true, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
    }
  }
  /* a log lying on the ground, length L, radius r, along angle a */
  function log(B, x, y, L, r, a, o = {}) {
    const ux = cos(a), uy = sin(a), vx = -uy, vy = ux, z0 = o.z || 0, layers = [];
    for (const ph of [0, .25, .5, .75, 1]) {
      const z = z0 + r * (1 - cos(ph * PI)), w = max(.08, r * sin(ph * PI));
      layers.push([[[x - ux * L / 2 - vx * w, y - uy * L / 2 - vy * w], [x + ux * L / 2 - vx * w, y + uy * L / 2 - vy * w], [x + ux * L / 2 + vx * w, y + uy * L / 2 + vy * w], [x - ux * L / 2 + vx * w, y - uy * L / 2 + vy * w]], z]);
    }
    const p = sol(B, layers, { role: o.role, lod: o.lod });
    for (const ph of [.35, .65]) { const z = z0 + r * (1 - cos(ph * PI)), w = r * sin(ph * PI) * 1.02, sd = ph < .5 ? 1 : -1; B.mark([[x - ux * L / 2 + vx * w * sd, y - uy * L / 2 + vy * w * sd, z], [x + ux * L / 2 + vx * w * sd, y + uy * L / 2 + vy * w * sd, z]], { on: p, n: [vx * sd * .7, vy * sd * .7, .7], lod: 2 }); }
    for (const sg of [1, -1]) {
      const ex = x + ux * L / 2 * sg, ey = y + uy * L / 2 * sg;
      for (const f of [1, .5]) { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12 * TAU; pts.push([ex + vx * r * f * cos(t), ey + vy * r * f * cos(t), z0 + r + r * f * sin(t)]); } B.mark(pts, { on: p, n: [ux * sg, uy * sg, 0], lod: f === 1 ? 1 : 2 }); }
    }
    return p;
  }
  /* a wave on open water: humps across the eye's view, s long */
  function waveAt(x, y, s, k = 2, z = 0) {
    const pts = [], n = 4 * k;
    for (let i = 0; i <= n; i++) { const t = i / n, along = (t - .5) * s, up = abs(sin(t * k * PI)) * (s / k) * .45; pts.push([x + EH[0] * along + EU[0] * up, y + EH[1] * along + EU[1] * up, z]); }
    return pts;
  }
  /* a robed figure; o.stoop bends it to the work */
  const FIGURE = [[-.18, 0], [-.2, .55], [-.12, .7], [-.1, .8], [-.12, .9], [-.04, 1], [.06, 1], [.12, .9], [.1, .8], [.12, .7], [.2, .55], [.18, 0]];
  const STOOP = [[-.3, 0], [-.26, .36], [-.22, .5], [-.06, .6], [.12, .6], [.2, .52], [.3, .5], [.36, .42], [.3, .34], [.2, .38], [.12, .3], [.06, .36], [-.04, .3], [-.1, 0]];
  const flipPolys = polys => polys.map(p => p.map(([u, v]) => [-u, v]));
  function figure(B, x, y, h, o = {}) {
    const polys = [o.stoop ? STOOP : FIGURE];
    if (o.hat) polys.push(o.stoop ? [[.18, .58], [.44, .56], [.34, .66]] : [[-.3, .92], [.3, .92], [.06, 1.1], [-.04, 1.1]]);
    if (o.jar) polys.push([[.1, 1.0], [.06, 1.08], [.08, 1.16], [.18, 1.16], [.2, 1.08], [.16, 1.0]]);
    if (o.basket) polys.push([[.14, .36], [.4, .36], [.36, .54], [.18, .54]]);
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h, role: o.role || 'a figure', lod: o.lod == null ? 2 : o.lod });
  }
  const leg = (u, top, w = .07) => [[u - w / 2, top], [u + w / 2, top], [u + w / 2 - .005, .04], [u + w / 2 + .01, 0], [u - w / 2, 0], [u - w / 2 + .005, .04]];
  const COW = { legs: [leg(-.3, .42), leg(-.22, .42), leg(.18, .42), leg(.26, .42)], body: [[-.36, .4], [-.4, .66], [-.32, .74], [.24, .74], [.3, .8], [.36, .8], [.48, .66], [.5, .56], [.44, .52], [.36, .6], [.3, .44], [.2, .38]], horn: [[.32, .8], [.3, .9], [.35, .86], [.37, .8]] };
  function beast(B, x, y, h, o = {}) {
    const polys = [...COW.legs, COW.body, COW.horn];
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, 0, h, { w: h * 1.6, role: o.role || 'the beasts', lod: o.lod == null ? 2 : o.lod });
  }

  /* ---------- trees ---------- */
  const radAt = (prof, t) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][1]) return lerp(prof[i - 1][0], prof[i][0], (t - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1] || 1)); return prof[prof.length - 1][0]; };
  const PROF = {
    oak: [[.58, 0], [1, .38], [.8, .74], [.3, 1]],
    chestnut: [[.6, 0], [1, .3], [.88, .64], [.38, 1]],
    poplar: [[.62, 0], [1, .26], [.82, .66], [.24, 1]],
    olive: [[.62, 0], [1, .36], [.82, .74], [.36, 1]],
    juniper: [[.66, 0], [1, .34], [.86, .7], [.38, 1]],
    pinyon: [[.74, 0], [1, .24], [.7, .62], [.2, 1]],
    shrub: [[.7, 0], [1, .4], [.7, .8], [.25, 1]],
    ohia: [[.6, 0], [1, .38], [.92, .7], [.52, 1]],
  };
  /* a broadleaf tree: a round crown over a trunk drawn as a stroke. o.prof the crown's profile [[radius, height], ...],
     o.hr the crown's height over its radius, o.clump a smaller crown on its shoulder (its lod), o.leafKind 'dash' for
     the narrow leaves of the olive */
  function crown(B, R, x, y, h, o = {}) {
    const role = o.role || 'the trees', lod = o.lod == null ? 0 : o.lod, z0 = o.z || 0, prof = o.prof || PROF.oak;
    const zc = o.zc == null ? z0 + h * .32 : o.zc, r = o.r || h * .3, sq = o.sq || .94, H = min(z0 + h - zc, r * (o.hr || 1.8));
    const rot = R() * TAU, cx = x + (o.dx == null ? R.r(-.4, .4) : o.dx), cy = y + (o.dy == null ? R.r(-.4, .4) : o.dy), jit = o.jit || .05;
    const c = sol(B, prof.map(([f, t]) => [wob(R, cx, cy, r * f, r * f * sq, 14, jit * (1 + t), rot), zc + H * t]), { role, lod });
    if (o.trunk !== false) B.mark([[x, y, z0], [cx, cy, zc + .3]], { on: c, cls: 'edge', lod: 1 });
    const nl = o.leaves == null ? 7 : o.leaves;
    for (let j = 0; j < nl; j++) {
      const a = PI / 4 + (j / max(1, nl - 1) - .5) * PI * 1.6 + R.r(-.15, .15), t = j % 2 ? .66 : .4, zz = zc + H * t, rr = r * radAt(prof, t) * .99, ca = cos(a), sa = sin(a);
      const p = [cx + ca * rr, cy + sa * rr * sq], w = r * (o.leafW || .2), tx = -sa, ty = ca;
      if (o.leafKind === 'dash') { B.mark([[p[0] - tx * w * .5, p[1] - ty * w * .5, zz - H * .03], [p[0] + tx * w * .5, p[1] + ty * w * .5, zz + H * .04]], { on: c, n: [ca * .85, sa * .85, .4], cls: 'mid', lod: 2 }); continue; }
      B.mark([[p[0] - tx * w, p[1] - ty * w, zz + H * .02], [p[0] - tx * w * .45, p[1] - ty * w * .45, zz - H * .05], [p[0] + tx * w * .45, p[1] + ty * w * .45, zz - H * .05], [p[0] + tx * w, p[1] + ty * w, zz + H * .02]], { on: c, n: [ca * .85, sa * .85, t > .5 ? .55 : .3], lod: 2 });
    }
    if (o.clump != null) {
      // a lesser crown on one shoulder, standing a little out of the silhouette, so the tree is not one smooth egg
      const a = PI / 4 + (R.chance(.5) ? 1 : -1) * R.r(1.1, 1.7), d = r * .66, rc = r * R.r(.42, .52), zb = zc + H * R.r(.18, .32), hc = H * R.r(.5, .62);
      const kx = cx + cos(a) * d, ky = cy + sin(a) * d * sq;
      const k = sol(B, prof.map(([f, t]) => [wob(R, kx, ky, rc * f, rc * f * sq, 12, jit * (1 + t), rot), zb + hc * t]), { role, lod: o.clump });
      for (let j = 0; j < 3; j++) { const b = a + (j - 1) * .7, t = j === 1 ? .62 : .4, rr = rc * radAt(prof, t), p = [kx + cos(b) * rr, ky + sin(b) * rr * sq], w = rc * .3; B.mark([[p[0] + sin(b) * w, p[1] - cos(b) * w, zb + hc * t + hc * .03], [p[0], p[1], zb + hc * t - hc * .07], [p[0] - sin(b) * w, p[1] + cos(b) * w, zb + hc * t + hc * .03]], { on: k, n: [cos(b) * .85, sin(b) * .85, .4], lod: 2 }); }
    }
    c.crownTop = zc + H; c.crownC = [cx, cy, zc]; c.crownR = r; c.crownH = H;
    return c;
  }
  /* a conifer: one slim cone from afar; up close a second tier stands out from it and the bough tips show */
  function conifer(B, R, x, y, h, o = {}) {
    const role = o.role || 'the pines', z0 = o.z || 0, zc = z0 + h * .1, H = z0 + h - zc, r = o.r || h * .2;
    const c = B.cone(x, y, r, zc, zc + H, { n: 14, tip: .06, role, lod: o.lod == null ? 0 : o.lod });
    B.mark([[x, y, z0], [x, y, zc + .2]], { on: c, cls: 'edge', lod: 1 });
    const skirt = (part, rr, zz, l, nz) => { const sk = []; for (let k = 0; k <= 22; k++) { const a = k / 22 * TAU, g = k % 2 ? .84 : 1.05; sk.push([x + cos(a) * rr * g, y + sin(a) * rr * g, zz + (k % 2 ? H * .035 : 0)]); } ringMark(B, part, sk, [x, y], { lod: l, nz }); };
    skirt(c, r, zc, 2, .3);
    skirt(c, r * .62, zc + H * .38, 1, .35);
    if (o.tiers !== false) {
      const t = B.cone(x, y, r * .8, zc + H * .32, zc + H * .84, { n: 14, tip: .06, role, lod: 2 });
      skirt(t, r * .8, zc + H * .32, 2, .3);
      for (let k = 0; k < 3; k++) { const a = PI / 4 + (k - 1) * .6 + R.r(-.12, .12), ca = cos(a), sa = sin(a); B.mark([[x + ca * r * .18, y + sa * r * .18, zc + H * .72], [x + ca * r * .5, y + sa * r * .5, zc + H * .5], [x + ca * r * .78, y + sa * r * .78, zc + H * .34]], { on: t, n: [ca * .9, sa * .9, .45], lod: 2 }); }
    }
    return c;
  }
  /* a cypress, the flame of the Tuscan roads */
  function cypress(B, R, x, y, h, o = {}) {
    const z0 = o.z || 0, w = h * (o.w || .12), role = o.role || 'the cypresses';
    const prof = [[w * .5, z0], [w * .92, z0 + h * .16], [w, z0 + h * .34], [w * .86, z0 + h * .58], [w * .5, z0 + h * .82], [0, z0 + h]];
    const c = B.lathe(x, y, prof, { n: 12, role, lod: o.lod || 0 });
    B.mark([[x, y, z0], [x, y, z0 + h * .08]], { on: c, cls: 'edge', lod: 1 });
    const rz = z => { for (let i = 1; i < prof.length; i++) if (z <= prof[i][1]) return lerp(prof[i - 1][0], prof[i][0], (z - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1])); return 0; };
    // the flames of the foliage: strokes up the near side, twisting a little as they climb to the tip
    for (let k = 0; k < 3; k++) {
      const a0 = PI / 4 + (k - 1) * .75 + R.r(-.15, .15), z1 = z0 + h * R.r(.1, .22), z2 = z0 + h * R.r(.66, .86), pts = [];
      for (let i = 0; i <= 5; i++) { const z = lerp(z1, z2, i / 5), a = a0 + sin(i * .9) * .14, rr = rz(z) * 1.01; pts.push([x + cos(a) * rr, y + sin(a) * rr, z]); }
      B.mark(pts, { on: c, n: [cos(a0) * .95, sin(a0) * .95, .2], lod: 2 });
    }
    return c;
  }
  /* a palm: the leaning trunk as one stroke, the crown drawn out and back frond by frond */
  function palm(B, R, x, y, h, o = {}) {
    const role = o.role || 'the palms', lod = o.lod == null ? 0 : o.lod, z0 = o.z || 0;
    const la = o.dir == null ? R() * TAU : o.dir, lean = (o.lean == null ? .14 : o.lean) * h;
    const tx = x + cos(la) * lean, ty = y + sin(la) * lean, tz = z0 + h, top = [tx, ty, tz];
    const trunk = B.line(spline([[x, y, z0], [lerp(x, tx, .25), lerp(y, ty, .25), lerp(z0, tz, .55)], top], 4), { role, lod, w: 1.5 });
    for (let i = 1; i < 7; i++) { const t = i / 7, q = [lerp(x, tx, t * t * .8 + t * .2), lerp(y, ty, t * t * .8 + t * .2), lerp(z0, tz, t)]; B.mark([[q[0] - EH[0] * .45, q[1] - EH[1] * .45, q[2] - .15], [q[0] + EH[0] * .45, q[1] + EH[1] * .45, q[2] + .15]], { on: trunk, cls: 'lo', lod: 2 }); }
    const n = o.fronds || 9, a0 = R() * TAU, pts = [top];
    const leaf = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + R.r(-.2, .2), L = h * R.r(.32, .4) * (o.spread || 1), dr = R.r(.22, .55) * (o.droop || 1), up = R.r(.08, .2), c = cos(a), s = sin(a);
      const f1 = [tx + c * L * .3, ty + s * L * .3, tz + L * up], f2 = [tx + c * L * .6, ty + s * L * .6, tz + L * (up * .85 - dr * .12)], f3 = [tx + c * L * .84, ty + s * L * .84, tz + L * (up * .2 - dr * .5)], f4 = [tx + c * L, ty + s * L, tz - L * dr];
      pts.push(f1, f2, f3, f4, f3, f2, f1, top);
      for (const [p, k] of [[f1, .12], [f2, .11], [f3, .08]]) for (const sd of [-1, 1]) leaf.push([p, [p[0] + (c * .4 - s * sd) * L * k, p[1] + (s * .4 + c * sd) * L * k, p[2] - L * k]]);
    }
    const cr = B.line(pts, { role, lod });
    for (const m of leaf) B.mark(m, { on: cr, cls: 'lo', lod: 2 });
    return cr;
  }

  /* ---------- buildings on a turned footprint ---------- */
  /* house(B, R, cx, cy, f, L, W, H, rh, o): the front, L long, faces the direction f; W deep, walls H high, the roof
     rising rh over the eaves. o.ridge 'v' runs the ridge from back to front (a gable to the front), o.hip hips it,
     o.gambrel breaks it. Returns the frame its faces are drawn in. */
  function house(B, R, cx, cy, f, L, W, H, rh, o = {}) {
    const role = o.role || 'the house', lod = o.lod || 0, fx = cos(f), fy = sin(f), tx = -fy, ty = fx, ov = o.ov == null ? .8 : o.ov;
    const P = (u, v, z = 0) => [cx + tx * u + fx * v, cy + ty * u + fy * v, z], P2 = (u, v) => [cx + tx * u + fx * v, cy + ty * u + fy * v];
    const rect = (a, b, c, d) => [P2(a, b), P2(c, b), P2(c, d), P2(a, d)];
    const walls = sol(B, [[rect(-L / 2, -W / 2, L / 2, W / 2), 0], [rect(-L / 2, -W / 2, L / 2, W / 2), H]], { role, lod });
    const e = rect(-L / 2 - ov, -W / 2 - ov, L / 2 + ov, W / 2 + ov), hu = L / 2 + ov, hv = W / 2 + ov;
    let roof, ridge;
    if (o.ridge === 'v') {
      const hp = o.hip ? hu * .7 : 0, rb = P2(0, -hv + hp), rf = P2(0, hv - hp);
      ridge = [P(0, -hv + hp, H + rh), P(0, hv - hp, H + rh)];
      roof = o.gambrel ? sol(B, [[e, H], [rect(-hu * .58, -hv, hu * .58, hv), H + rh * .62], [[rb, rb, rf, rf], H + rh]], { role, lod: o.roofLod || lod })
        : sol(B, [[e, H], [[rb, rb, rf, rf], H + rh]], { role, lod: o.roofLod || lod });
    } else {
      const hp = o.hip ? hv * .9 : 0, r0 = P2(-hu + hp, 0), r1 = P2(hu - hp, 0);
      ridge = [P(-hu + hp, 0, H + rh), P(hu - hp, 0, H + rh)];
      roof = o.gambrel ? sol(B, [[e, H], [rect(-hu, -hv * .58, hu, hv * .58), H + rh * .62], [[r0, r1, r1, r0], H + rh]], { role, lod: o.roofLod || lod })
        : sol(B, [[e, H], [[r0, r1, r1, r0], H + rh]], { role, lod: o.roofLod || lod });
    }
    const F = { walls, roof, P, L, W, H, rh, ov, hu, hv, f, fx, fy, tx, ty, ridge,
      nFront: [fx, fy, 0], nBack: [-fx, -fy, 0], nRight: [tx, ty, 0], nLeft: [-tx, -ty, 0] };
    // a face of the walls: side 'F' front, 'B' back, 'R' right, 'L' left; s along it from 0 to 1, z up it
    F.on = (side, s, z) => side === 'F' ? P(lerp(-L / 2, L / 2, s), W / 2, z) : side === 'B' ? P(lerp(L / 2, -L / 2, s), -W / 2, z) : side === 'R' ? P(L / 2, lerp(W / 2, -W / 2, s), z) : P(-L / 2, lerp(-W / 2, W / 2, s), z);
    F.n = side => side === 'F' ? F.nFront : side === 'B' ? F.nBack : side === 'R' ? F.nRight : F.nLeft;
    F.len = side => side === 'F' || side === 'B' ? L : W;
    F.rect = (side, s0, s1, z0, z1, lodM = 1, cls = 'lo') => B.mark([F.on(side, s0, z0), F.on(side, s0, z1), F.on(side, s1, z1), F.on(side, s1, z0)], { on: walls, n: F.n(side), closed: true, cls, lod: lodM });
    F.door = (side, s, w, h, lodM = 1) => { const dw = w / F.len(side) / 2; B.mark([F.on(side, s - dw, 0), F.on(side, s - dw, h), F.on(side, s + dw, h), F.on(side, s + dw, 0)], { on: walls, n: F.n(side), cls: 'mid', lod: lodM }); };
    F.win = (side, s, z, w, h, lodM = 1) => { const dw = w / F.len(side) / 2; F.rect(side, s - dw, s + dw, z, z + h, lodM); };
    F.course = (side, z, lodM = 2) => B.mark([F.on(side, 0, z), F.on(side, 1, z)], { on: walls, n: F.n(side), lod: lodM });
    // a line down a roof slope at u (ridge along u) or at v (ridge along v), on the slope facing sd (+1 front or right, -1 back or left)
    F.slopeLine = (t, sd, lodM = 2) => {
      // a line from the ridge (or from the hip, near a hipped end) straight down the slope to the eave
      const along = o.ridge === 'v' ? hv : hu, across = o.ridge === 'v' ? hu : hv, hp = o.hip ? (o.ridge === 'v' ? hu * .7 : hv * .9) : 0;
      const a = lerp(-along, along, t), k = hp > 0 && abs(a) > along - hp ? (abs(a) - (along - hp)) / hp : 0;
      const Q = (w, z) => o.ridge === 'v' ? P(w * sd, a, z) : P(a, w * sd, z);
      const n = o.ridge === 'v' ? [tx * sd * rh, ty * sd * rh, across] : [fx * sd * rh, fy * sd * rh, across], nl = hypot(rh, across);
      B.mark([Q(across * k, H + rh * (1 - k)), Q(across, H)], { on: roof, n: n.map(q => q / nl), lod: lodM });
    };
    if (o.ridgeMark !== false) B.mark(ridge, { on: roof, cls: 'lo', lod: 2 });
    return F;
  }
  /* a small solid on a turned footprint (a chimney, a woodpile, a shed) */
  function block(B, cx, cy, f, L, W, z0, z1, o = {}) {
    const fx = cos(f), fy = sin(f), tx = -fy, ty = fx, P2 = (u, v) => [cx + tx * u + fx * v, cy + ty * u + fy * v];
    const ft = [P2(-L / 2, -W / 2), P2(L / 2, -W / 2), P2(L / 2, W / 2), P2(-L / 2, W / 2)];
    const k = o.top || 1, tp = scl(ft, k, [cx, cy]);
    return sol(B, [[ft, z0], [tp, z1]], { role: o.role, lod: o.lod, crease: o.crease });
  }

  /* ================= the kinds ================= */

  /* A stand of broadleaf trees, oak and chestnut and tulip poplar of mixed size, with the undergrowth
     in the gaps: the Appalachian woods and the oak woods of Europe. */
  def('t:forest', (R, B) => {
    const role = 'the woods', n = R.i(4, 7), trees = [];
    place(R, trees, n, () => { const sp = R.pick(['oak', 'oak', 'chestnut', 'chestnut', 'poplar']); return { sp, r: sp === 'poplar' ? R.r(4.4, 5.2) : R.r(5.4, 8) }; }, { gap: .7, Rh: 23.5, fit: 1, tries: 160 });
    if (trees.length < 4) place(R, trees, 4, () => ({ sp: 'oak', r: R.r(4.4, 5.2) }), { gap: .66, Rh: 23.5, fit: 1, tries: 120 });
    let clumps = 0;
    for (const t of trees) {
      const pop = t.sp === 'poplar', zc = t.r * (pop ? R.r(1.1, 1.3) : R.r(.8, 1.1)), H = t.r * (pop ? R.r(2.4, 2.8) : t.sp === 'chestnut' ? R.r(1.75, 1.95) : R.r(1.5, 1.72));
      const big = !pop && t.r > 6.2 && clumps < 3;
      crown(B, R, t.x, t.y, zc + H, { r: t.r, prof: PROF[t.sp], zc, hr: 3, role, lod: 0, leaves: t.r > 6 ? 8 : 6, clump: big ? 2 : null });
      if (big) clumps++;
    }
    // the undergrowth in the gaps: low shrubs, then ferns, a fallen limb or a stump
    const avoid = trees.map(t => [t.x, t.y, t.r * .7]), bush = [];
    place(R, bush, min(2, 8 - trees.length), () => ({ r: R.r(2.2, 3.2) }), { avoid, gap: 1.1, Rh: 23 });
    for (const b of bush) crown(B, R, b.x, b.y, b.r * 1.7, { r: b.r, zc: .15, prof: PROF.shrub, hr: 1.5, role, lod: 1, leaves: 3, trunk: false, jit: .12 });
    const av2 = avoid.concat(bush.map(b => [b.x, b.y, b.r]));
    const fern = []; place(R, fern, R.i(2, 3), () => ({ r: 1.6 }), { avoid: av2, gap: 1.4, Rh: 23 });
    for (const f of fern) tuft(B, R, f.x, f.y, 0, R.r(2, 3), { n: 7, spread: 1, cls: 'lo', role, lod: 2 });
    const spot = []; place(R, spot, 1, () => ({ r: 3 }), { avoid: av2.concat(fern.map(f => [f.x, f.y, 1.5])), gap: 1, Rh: 22 });
    for (const s of spot) {
      if (R.chance(.55)) log(B, s.x, s.y, R.r(6, 8), R.r(.6, .8), R.r(0, PI), { role, lod: 2 });
      else { const sr = R.r(.9, 1.3), sh = R.r(1, 1.6), st = B.cyl(s.x, s.y, sr, 0, sh, { n: 12, b: .25, role, lod: 2 }); B.mark(at(closed(ell(s.x, s.y, sr * .5, sr * .5, 10)), sh), { on: st, lod: 2 }); staves(B, st, s.x, s.y, sr, 0, sh, 8, { lod: 2 }); }
    }
  }, { tier: 'tile', masks: false, word: 'woods' });

  /* Conifers on a mountain flank: the slope falls toward the eye from an outcrop of rock, drawn in
     hachures on the ground as the old maps drew a hillside; scree below the rock. */
  def('t:pines', (R, B) => {
    const role = 'the pines', oa = R() * TAU, od = R.r(3, 9), ox = cos(oa) * od, oy = sin(oa) * od * .8;
    const host = ground(B, [[ox + 3.4, oy + 3.4], [ox + 4.6, oy + 4.2]], { role: 'the slope', lod: 2 });
    const orr = R.r(2.8, 3.6), out = rock(B, R, ox, oy, orr, orr * R.r(.75, .95), { lod: 1, role: 'the outcrop' });
    rock(B, R, ox + cos(oa + 1.2) * orr * 1.4, oy + sin(oa + 1.2) * orr * 1.2, orr * .5, orr * .45, { lod: 2, plain: true, role: 'the outcrop' });
    void out;
    const trees = [];
    place(R, trees, R.i(4, 6), () => ({ r: R.r(2.5, 3.5) }), { avoid: [[ox, oy, orr * 1.2]], gap: .95, Rh: 23, fit: 1.05 });
    trees.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const t of trees) conifer(B, R, t.x, t.y, t.r / R.r(.19, .22), { r: t.r, role, lod: 0, tiers: true });
    // hachures: short fall lines down the slope from the outcrop, shortening and parting as it flattens
    const clearOf = (x, y) => room(x, y, 22.6) > .6 && !trees.some(t => hypot(t.x - x, t.y - y) < t.r + .6) && hypot(x - ox, y - oy) > orr + .8;
    for (let ring = 0; ring < 2; ring++) {
      const r0 = orr + 1.6 + ring * 3.4, L = 1.9 - ring * .6, nA = 6 + ring * 3;
      for (let k = 0; k < nA; k++) {
        const a = PI / 4 + (k / (nA - 1) - .5) * 1.7 + R.r(-.05, .05), p = [ox + cos(a) * r0, oy + sin(a) * r0], q = [ox + cos(a) * (r0 + L), oy + sin(a) * (r0 + L)];
        if (clearOf(p[0], p[1]) && clearOf(q[0], q[1])) B.mark([[...p, 0], [...q, 0]], { on: host, lod: 2 });
      }
    }
    pebbles(B, host, R, ox + 2.4, oy + 2.4, 2.4, 1.8, 7, 0, { lod: 2 });
  }, { tier: 'tile', masks: false, word: 'pinewood' });

  /* A grassy clearing in the woods ringed by trees, with a log cabin and its woodpile, or a woodcutter's
     pile and his block alone; the cabin faces the road when there is one. */
  def('t:clearing', (R, B, A) => {
    const [f, ri] = facing(R, A.road), fx = cos(f), fy = sin(f), tx = -fy, ty = fx, cabin = R.chance(.72), role = 'the clearing';
    const cx = -fx * 3 + R.r(-1.5, 1.5), cy = -fy * 3 + R.r(-1.5, 1.5);
    // the path from the door out to the road, two ruts in the grass
    const door = [cx + fx * 4.2, cy + fy * 4.2];
    const end = ri >= 0 ? EN[ri].map(v => v * (AP - 1.7)) : [cx + fx * 30, cy + fy * 30];
    let host;
    if (cabin) {
      const P = spline([door, [lerp(door[0], end[0], .5) + tx * R.r(-1.5, 1.5), lerp(door[1], end[1], .5) + ty * R.r(-1.5, 1.5)], end], 5);
      const runs = clipLine(P, 22.4), path = runs.length ? runs[0] : P.slice(0, 2);
      host = ground(B, offsetLine(path, .8), { role: 'the path', lod: 1 });
      B.mark(at(offsetLine(path, -.8), 0), { on: host, lod: 1 });
    } else host = ground(B, [[cx - 1.5, cy + 1], [cx + 1.5, cy + 1.5]], { lod: 1 });
    // the trees round the clearing, kept from the cabin and from the way to the road
    const trees = [];
    place(R, trees, cabin ? R.i(3, 4) : R.i(4, 5), () => ({ r: R.r(4.4, 6.2) }), { avoid: [[cx, cy, cabin ? 8 : 5], [cx + fx * 12, cy + fy * 12, 5.5]], gap: .8, Rh: 23, fit: 1 });
    for (const t of trees) {
      if (R.chance(.35)) conifer(B, R, t.x, t.y, t.r * .78 / .2, { r: t.r * .78, role: 'the trees', lod: 0 });
      else { const zc = t.r * R.r(.8, 1), H = t.r * R.r(1.5, 1.75); crown(B, R, t.x, t.y, zc + H, { r: t.r, zc, hr: 3, role: 'the trees', lod: 0, leaves: 6 }); }
    }
    if (cabin) {
      const L = R.r(9.5, 11.5), W = R.r(6.5, 7.5), H = R.r(4.6, 5.4), rh = R.r(3.4, 4.2);
      const C = house(B, R, cx, cy, f, L, W, H, rh, { role: 'the cabin', ov: .9 });
      // the logs, course on course, their ends crossing at the corners
      for (let k = 1; k * .85 < H - .2; k++) for (const sd of ['F', 'R', 'L']) C.course(sd, k * .85, k % 2 ? 2 : 1);
      for (const s of [0, 1]) for (let k = 0; k * .85 < H - .4; k++) { const p = C.on('F', s, k * .85 + .42); B.mark(at(closed(ell(p[0] + C.tx * (s ? .35 : -.35), p[1] + C.ty * (s ? .35 : -.35), .32, .32, 6)), p[2]), { on: C.walls, n: C.nFront, lod: 2 }); }
      C.door('F', .38, 1.8, 3.3, 1); C.win('F', .74, 1.6, 1.6, 1.4, 1); C.win('R', .5, 1.6, 1.4, 1.3, 2);
      B.mark([C.on('F', .74, 2.3), C.on('F', .74 + .8 / L, 2.3)], { on: C.walls, n: C.nFront, lod: 2 });
      // the shakes of the roof in rows, and the stone chimney at the gable
      for (let k = 1; k < 4; k++) { const t = k / 4; B.mark([C.P(-C.hu, C.hv * (1 - t), H + rh * t), C.P(C.hu, C.hv * (1 - t), H + rh * t)], { on: C.roof, n: [fx * rh, fy * rh, C.hv].map(q => q / hypot(rh, C.hv)), lod: 2 }); }
      const chs = R.chance(.5) ? 1 : -1, cp = C.P(chs * (L / 2 + .7), -.2);
      const ch = block(B, cp[0], cp[1], f, 1.6, 1.8, 0, H + rh + 1.2, { role: 'the cabin', lod: n01(B) < 7 ? 1 : 2, top: .86 });
      for (let z = 1.2; z < H + rh; z += 1.3) B.mark([C.P(chs * (L / 2 + .7) - .8, .9, z), C.P(chs * (L / 2 + .7) + .8, .9, z)], { on: ch, n: C.nFront, lod: 2 });
      // the woodpile along the wall on the side away from the chimney, and the chopping block
      const wp = C.P(-chs * (L / 2 + 1.6), -.4);
      const pile = block(B, wp[0], wp[1], f, 1.8, W * .8, 0, 2.2, { role: 'the woodpile', lod: 1, top: .9 });
      for (let k = 0; k < 7; k++) for (let j = 0; j < 2; j++) { const q = C.P(-chs * (L / 2 + 1.6), -W * .32 + k * W * .1, .5 + j * 1.05); B.mark(at(closed(ell(q[0] - chs * C.tx * .92, q[1] - chs * C.ty * .92, .36, .36, 6)), q[2]), { on: pile, n: [-chs * C.tx, -chs * C.ty, 0], lod: 2 }); }
      const bk = C.P(-chs * (L / 2 + 2.8), W / 2 + 3);
      const blk = B.cyl(bk[0], bk[1], .9, 0, 1.4, { n: 10, b: .2, role: 'the woodpile', lod: 2 });
      B.mark([[bk[0], bk[1], 1.4], [bk[0] + .5, bk[1] - .9, 2.5]], { on: blk, cls: 'edge', lod: 2 });
    } else {
      // a woodcutter's clearing: a long cord of wood, the block with its axe, and logs waiting
      const pile = block(B, cx, cy, f, 7.5, 1.8, 0, 2.4, { role: 'the woodpile', lod: 0, top: .92 });
      for (let k = 0; k < 9; k++) for (let j = 0; j < 2; j++) { const q = [cx + tx * (-3.3 + k * .82) + fx * .92, cy + ty * (-3.3 + k * .82) + fy * .92, .55 + j * 1.1]; B.mark(at(closed(ell(q[0], q[1], .36, .36, 6)), q[2]), { on: pile, n: [fx, fy, 0], lod: 2 }); }
      B.mark([[cx + tx * -3.75 + fx * .9, cy + ty * -3.75 + fy * .9, 1.2], [cx + tx * 3.75 + fx * .9, cy + ty * 3.75 + fy * .9, 1.2]], { on: pile, n: [fx, fy, 0], lod: 1 });
      const bk = [cx + fx * 4.5 + tx * 2, cy + fy * 4.5 + ty * 2], blk = B.cyl(bk[0], bk[1], 1, 0, 1.5, { n: 10, b: .2, role: 'the woodpile', lod: 1 });
      B.mark([[bk[0], bk[1], 1.5], [bk[0] + .6, bk[1] - .9, 2.7]], { on: blk, cls: 'edge', lod: 2 });
      log(B, cx + fx * 4 - tx * 3.5, cy + fy * 4 - ty * 3.5, 6.5, .75, f + .3, { role: 'the woodpile', lod: 2 });
    }
    // the grass of the clearing, and a few flowers along the path
    const gs = []; place(R, gs, 3, () => ({ r: 1.5 }), { avoid: [[cx, cy, 7.5]].concat(trees.map(t => [t.x, t.y, t.r * .8])), gap: 1.5, Rh: 22.5 });
    for (const g of gs) tuft(B, R, g.x, g.y, 0, R.r(1.6, 2.4), { n: 7, role, lod: 2 });
    for (let k = 0; k < 6; k++) { const x = cx + R.r(-10, 10), y = cy + R.r(-10, 10); if (room(x, y) > 1.5 && hypot(x - cx, y - cy) > 7 && !trees.some(t => hypot(t.x - x, t.y - y) < t.r + .8)) flower(B, host, R, x, y, R.r(1, 1.6)); }
  }, { tier: 'tile', masks: true, word: 'clearing' });

  /* Open grass with tufts and wildflowers, a rail fence across it or a lone spreading tree, or both. */
  def('t:meadow', (R, B) => {
    const v = R(), tree = v < .5 || (v >= .75 && v < .9), fence = v >= .5 && v < .9, role = 'the meadow';
    const g = [R.r(-12, 12), R.r(-10, 10)];
    const host = ground(B, tuftPts(R, g[0], g[1], 0, 1.3, { n: 4 }).map(p => [p[0], p[1]]), { role, lod: 2 });
    let fa = null, fb = null;
    if (fence) {
      // a rail fence from one edge to another, its end posts at the edges, the rails on posts between
      const i0 = R.i(0, 5), i1 = (i0 + R.pick([2, 3, 3, 4])) % 6;
      fa = EN[i0].map(q => q * (AP - 1.6)); fb = EN[i1].map(q => q * (AP - 1.6));
      const bend = R.r(-3, 3), mid = [lerp(fa[0], fb[0], .5) + (fb[1] - fa[1]) / 40 * bend, lerp(fa[1], fb[1], .5) - (fb[0] - fa[0]) / 40 * bend];
      const P = spline([fa, mid, fb], 6);
      const rail = B.line(at(P, 2.4), { role: 'the fence', lod: 0, cls: 'mid' });
      B.mark(at(P, 1.3), { on: rail, cls: 'lo', lod: 2 });
      const Ls = [0]; for (let i = 1; i < P.length; i++) Ls.push(Ls[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const T = Ls[Ls.length - 1], np = max(4, 2 * round(T / 7.2));
      for (let k = 1; k < np; k++) { const d = k / np * T; let i = 1; while (i < Ls.length - 1 && Ls[i] < d) i++; const q = lerp2(P[i - 1], P[i], (d - Ls[i - 1]) / (Ls[i] - Ls[i - 1] || 1)); B.mark([[q[0], q[1], 0], [q[0], q[1], 2.7]], { on: rail, cls: 'mid', lod: k % 2 ? 2 : 1 }); }
      for (const q of [fa, fb]) B.box(q[0] - .32, q[1] - .32, q[0] + .32, q[1] + .32, 0, 3, { r: .1, b: 0, role: 'the fence', lod: 1 });
    }
    const distF = (x, y) => { if (!fa) return 99; const dx = fb[0] - fa[0], dy = fb[1] - fa[1], L = hypot(dx, dy) || 1; return abs((x - fa[0]) * dy - (y - fa[1]) * dx) / L; };
    let lone = null;
    if (tree) {
      // the lone tree of the pasture: broad, low-branched, a lesser crown on one shoulder
      const t = []; place(R, t, 1, () => ({ r: R.r(6, 7.6) }), { ok: (x, y, d) => distF(x, y) > d.r + 1.5, Rh: 23.2, fit: .98 });
      if (!t.length) t.push({ x: 0, y: 0, r: 6 });
      lone = t[0];
      const zc = lone.r * R.r(.75, .9), H = lone.r * R.r(1.4, 1.6);
      crown(B, R, lone.x, lone.y, zc + H, { r: lone.r, zc, hr: 3, sq: 1, prof: PROF.oak, role: 'the lone tree', lod: 0, leaves: 9, clump: 2 });
      if (!fence) { const rq = []; place(R, rq, 1, () => ({ r: R.r(1.3, 1.9) }), { avoid: [[lone.x, lone.y, lone.r + 1]], Rh: 22 }); for (const q of rq) rock(B, R, q.x, q.y, q.r, q.r * .7, { lod: 2 }); }
    }
    if (!tree && !fence) { rock(B, R, R.r(-4, 4), R.r(-4, 4), R.r(1.8, 2.4), R.r(1.3, 1.8), { lod: 0, role: 'the stones' }); }
    // tufts of grass, and the wildflowers among them
    const tufts = []; place(R, tufts, R.i(3, 5), () => ({ r: 1.4 }), { avoid: lone ? [[lone.x, lone.y, lone.r * .9]] : [], ok: (x, y) => distF(x, y) > 1.8, gap: 2, Rh: 22.5 });
    for (const q of tufts) tuft(B, R, q.x, q.y, 0, R.r(1.6, 2.6), { n: 7, role, lod: 2 });
    for (let k = 0; k < 14; k++) { const x = R.r(-20, 20), y = R.r(-18, 18); if (room(x, y) < 1.5 || distF(x, y) < 1.2 || (lone && hypot(lone.x - x, lone.y - y) < lone.r + 1)) continue; if (k % 3) flower(B, host, R, x, y, R.r(.9, 1.6)); else B.mark([[x - EH[0] * .5, y - EH[1] * .5, 0], [x, y, .9], [x + EH[0] * .5, y + EH[1] * .5, 0]], { on: host, lod: 2 }); }
  }, { tier: 'tile', masks: false, word: 'meadow' });

  /* A farmstead: the farmhouse with a barn or a haystack, the fenced yard with a beast in it, and a tree;
     in Tuscany a hipped house with its dovecote tower. It faces the road. */
  def('t:farm', (R, B, A) => {
    const [f] = facing(R, A.road), fx = cos(f), fy = sin(f), mir = R.chance(.5) ? 1 : -1, tx = -fy * mir, ty = fx * mir;
    const L2 = (u, v) => [tx * u + fx * v, ty * u + fy * v];
    const tus = R.chance(.5), role = 'the farm';
    // the farmhouse
    const hc = L2(-4 + R.r(-.8, .8), -1.5 + R.r(-.8, .8)), hL = R.r(12, 13.5), hW = R.r(7, 7.6), hH = tus ? R.r(6.2, 7.2) : R.r(5.4, 6.2), rh = tus ? R.r(2.4, 3) : R.r(4, 5);
    const Hs = house(B, R, hc[0], hc[1], f, hL, hW, hH, rh, { role: 'the farmhouse', hip: tus, ov: tus ? .9 : .7 });
    const ds = .5 + R.r(-.15, .15);
    Hs.door('F', ds, 2, 3.6, 1);
    for (const s2 of [.17, .83]) Hs.win('F', s2, hH * .55, 1.4, 1.5, 1);
    Hs.win('R', .5, hH * .55, 1.4, 1.5, 2); Hs.win('L', .5, hH * .55, 1.4, 1.5, 2);
    if (tus) Hs.course('F', 1.2, 2);
    for (let k = 1; k < 10; k++) Hs.slopeLine(k / 10, 1, 2);
    if (tus && R.chance(.7)) {
      // the dovecote tower out of the roof, with its little pyramid cap and the pigeon holes
      const tc = Hs.P(R.r(-2, 2), -.6), tw = 2.1, th = hH + rh + R.r(2.6, 3.6);
      const tw0 = block(B, tc[0], tc[1], f, tw * 2, tw * 2, hH, th, { role: 'the dovecote', lod: 1 });
      sol(B, [[[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [tc[0] + Hs.tx * u * (tw + .5) + fx * v * (tw + .5), tc[1] + Hs.ty * u * (tw + .5) + fy * v * (tw + .5)]), th], [[[tc[0], tc[1]]], th + 1.8]], { role: 'the dovecote', lod: 2 });
      for (let k = 0; k < 3; k++) { const p = [tc[0] + Hs.tx * (-.8 + k * .8) + fx * tw, tc[1] + Hs.ty * (-.8 + k * .8) + fy * tw]; B.mark([[p[0], p[1], th - 1.2], [p[0], p[1], th - .6]], { on: tw0, n: [fx, fy, 0], cls: 'mid', lod: 2 }); }
    } else if (!tus) {
      const cp = Hs.P(hL * .3, -.4); block(B, cp[0], cp[1], f, 1.2, 1.2, hH, hH + rh + .9, { role: 'the farmhouse', lod: 2 });
    }
    // the barn, or the haystacks
    const bc = L2(8 + R.r(-.5, .5), -5.5 + R.r(-.8, .8));
    if (R.chance(.55)) {
      const Bn = house(B, R, bc[0], bc[1], f, R.r(7.5, 8.5), R.r(10, 11), R.r(5, 6), R.r(4, 5), { role: 'the barn', ridge: 'v', gambrel: !tus && R.chance(.6), ov: .6 });
      Bn.door('F', .5, 4, 4.2, 1);
      const p0 = Bn.on('F', .5 - 2 / Bn.L, 0), p1 = Bn.on('F', .5 - 2 / Bn.L, 4.2), p2 = Bn.on('F', .5 + 2 / Bn.L, 4.2), p3 = Bn.on('F', .5 + 2 / Bn.L, 0);
      B.mark([p0, p2], { on: Bn.walls, n: Bn.nFront, lod: 2 }); B.mark([p1, p3], { on: Bn.walls, n: Bn.nFront, lod: 2 });
      for (let k = 1; k < 7; k++) Bn.slopeLine(k / 7, 1, 2);
      if (tus) for (let k = 0; k < 4; k++) Bn.win('R', .2 + k * .2, Bn.H * .6, .7, .9, 2);
    } else {
      const hs = (x, y, r, l) => { const st = B.lathe(x, y, [[r, 0], [r * 1.08, r * .5], [r * .9, r * 1.2], [r * .45, r * 1.8], [0, r * 2.1]], { n: 16, role: 'the haystacks', lod: l }); for (const [z, rr] of [[r * .55, r * 1.06], [r * 1.15, r * .9]]) hoop(B, st, x, y, rr, z, { n: 20, lod: 2 }); if (tus) B.mark([[x, y, r * 2.1], [x, y, r * 2.1 + 1.6]], { on: st, cls: 'edge', lod: 2 }); return st; };
      hs(bc[0], bc[1], R.r(3, 3.6), 0);
      if (R.chance(.6)) { const b2 = L2(12.5, -.5); hs(b2[0], b2[1], R.r(2.2, 2.6), 1); }
    }
    // the yard, fenced, before the barn, its gate to the road
    const yc = [[4, 1.8], [13.5, 1.8], [13.5, 9], [4, 9]], gate = R.r(.3, .6);
    const yp = [lerp2(yc[3], yc[2], gate + .14), yc[2], yc[1], yc[0], yc[3], lerp2(yc[3], yc[2], gate)].map(([u, v]) => L2(u, v));
    const rail = B.line(at(yp, 2), { role: 'the yard', lod: 1, cls: 'mid' });
    B.mark(at(yp, 1.1), { on: rail, cls: 'lo', lod: 2 });
    for (let i = 1; i < yp.length; i++) { const a = yp[i - 1], b = yp[i], n = max(1, round(hypot(b[0] - a[0], b[1] - a[1]) / 2.6)); for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const q = lerp2(a, b, k / n); B.mark([[q[0], q[1], 0], [q[0], q[1], 2.3]], { on: rail, cls: 'mid', lod: k % 2 ? 2 : 1 }); } }
    { const q = L2(8.8, 5.4), sp = R.pick(['cow', 'cow', 'figure']); if (sp === 'cow') beast(B, q[0], q[1], 3.6, { flip: R.chance(.5), role: 'the yard', lod: 2 }); else figure(B, q[0], q[1], 5.6, { role: 'the yard', lod: 2 }); }
    // the tree by the house, or a pair of cypresses in Tuscany
    if (tus && R.chance(.5)) { for (const [u, v] of [[-13.5, 6.5], [-11, 9]]) { const q = L2(u, v + R.r(-.6, .6)); cypress(B, R, q[0], q[1], R.r(13, 16), { lod: n01(B) < 8 ? 0 : 2 }); } }
    else {
      const [u, v] = R.chance(.5) ? [-11.5, 8.5] : [-8.5, -10.5], q = L2(u + R.r(-.6, .6), v + R.r(-.6, .6)), r = min(R.r(5, 6.2), room(q[0], q[1], 22.6) / 1.1), zc = r * R.r(.85, 1.05);
      crown(B, R, q[0], q[1], zc + r * 1.7, { r, zc, hr: 3, role: 'the tree', lod: 0, leaves: 7 });
    }
    // the well before the door, the grass along the walls
    { const q = Hs.P(lerp(-hL / 2, hL / 2, ds > .5 ? .2 : .8), hW / 2 + 3); const w = B.cyl(q[0], q[1], 1.1, 0, 1.4, { n: 12, b: .3, role, lod: 2 }); staves(B, w, q[0], q[1], 1.1, 0, 1.4, 8, { lod: 2 }); }
    const tf = L2(-2, 9.5); tuft(B, R, tf[0], tf[1], 0, 2, { n: 7, role, lod: 2 });
  }, { tier: 'tile', masks: true, word: 'farm' });

  /* A vineyard: rows of vines on their posts and wires, run east and west on the lattice so the rows of
     the next tile carry on; a stone shed between the rows sometimes, a picker with her basket. */
  def('t:vines', (R, B) => {
    const sp = PY / 2, role = 'the vines', step = PX / 5;
    const extra = R(), shedK = R.pick([-1, 0, 1]), shedX = R.r(-7, 7);
    for (let k = -2; k <= 1; k++) {
      const y = (k + .5) * sp, half = 23 - abs(y) / R3 - 1.2, w = .6, ht = 2.2, yt = y - w * .4;
      // the row as one sheet of leaves leaning a little back from the eye, drawn with the light line so a field of rows stays light
      const row = B.plate([[-half, y + w, 0], [half, y + w, 0], [half - .3, yt, ht], [-half + .3, yt, ht]], { role, lod: 0, cls: 'lo' });
      const fy = z => lerp(y + w, yt, z / ht);
      // the leaves bunching along the top, the posts on the lattice standing out of them, the bunches hanging below
      const lv = []; for (let x = -half + .6, j = 0; x <= half - .6; x += .75, j++) lv.push([x, yt, ht + (j % 2 ? .4 : 0)]);
      B.mark(lv, { on: row, cls: 'lo', lod: 2 });
      for (let x = -half + 1.2, j = 0; x < half - 1; x += 1.6, j++) { const z = j % 2 ? 1.55 : .95, yy = fy(z), c = x + (j % 3) * .2; B.mark([[c - .45, yy, z + .25], [c, yy, z - .2], [c + .45, yy, z + .25]], { on: row, cls: 'lo', lod: 2 }); }
      const x0 = ceilTo(-half + .8, step), x1 = half - .8;
      for (let x = x0; x <= x1 + 1e-6; x += step) B.mark([[x, fy(0), 0], [x, fy(ht), ht + .7]], { on: row, cls: 'lo', lod: 2 });
      for (const sg of [-1, 1]) { const ex = sg * (half - .15); B.mark([[ex, y + .2, 0], [ex, y, ht + 1]], { on: row, cls: 'mid', lod: 2 }); B.mark([[ex, y, ht + .7], [ex + sg * 1, y, 0]], { on: row, cls: 'lo', lod: 2 }); }
      for (let x = x0 + step / 2, j = 0; x < x1; x += step, j++) if (mod(j + k, 2) === 0) { const yy = fy(1.1); B.mark([[x - .35, yy, 1.5], [x + .35, yy, 1.5], [x, yy + .05, .7]], { on: row, closed: true, cls: 'lo', lod: 2 }); }
    }
    const between = shedK * sp;   // the gap between two rows that the shed or the tree stands in
    if (extra < .4) {
      const S = house(B, R, shedX, between, PI / 2, R.r(5, 6.4), R.r(3.6, 4.4), R.r(3.2, 3.8), 1.7, { role: 'the shed', ov: .45 });
      S.door('F', .35, 1.4, 2.6, 1); S.win('F', .75, 1.6, .8, .8, 2);
      for (let k = 1; k < 6; k++) S.slopeLine(k / 6, 1, 2);
    } else if (extra < .65) {
      const x = shedX + R.r(-2, 2);
      if (R.chance(.5)) cypress(B, R, x, between, R.r(13, 16), { lod: 0, role: 'the cypress' });
      else crown(B, R, x, between, 6.2, { r: R.r(3.4, 4), prof: PROF.olive, zc: 2.4, hr: 1.1, sq: .9, jit: .1, role: 'the olive', lod: 0, leaves: 6, leafKind: 'dash' });
    }
    if (R.chance(.45)) { const k2 = R.pick([-1, 0, 1]), x = R.r(-10, 10); if (abs(x - shedX) > 6 || k2 !== shedK) figure(B, x, k2 * sp, 5.4, { stoop: R.chance(.5), basket: true, flip: R.chance(.5), role: 'the pickers', lod: 2 }); }
  }, { tier: 'tile', masks: false, word: 'vineyard' });

  /* An olive grove: low gnarled trees with silver crowns in loose rows on the lattice, and sometimes a
     dry-stone terrace wall across the slope: Tuscany and Greece. */
  def('t:olives', (R, B) => {
    const role = 'the olive grove', dx = PX / 4, dy = PY / 2, spots = [];
    for (let j = -1; j <= 1; j++) for (let i = -3; i <= 3; i++) { const x = (i + (mod(j, 2) ? .5 : 0)) * dx, y = j * dy; if (room(x, y, 23) >= 3.4) spots.push([x, y]); }
    const wall = R.chance(.4) ? R.pick([-1, 1]) * dy / 2 : null;
    const drop = max(R.i(0, 1), spots.length - (wall != null ? 7 : 8)); for (let k = 0; k < drop; k++) spots.splice(R.i(0, spots.length - 1), 1);
    if (wall != null) {
      const half = 23 - abs(wall) / R3 - .5, w = B.box(-half, wall - .55, half, wall + .55, 0, 1.5, { r: .3, b: 0, top: .1, role: 'the terrace wall', lod: 1 });
      for (const z of [.5, 1]) B.mark([[-half, wall + .5, z], [half, wall + .5, z]], { on: w, n: [0, 1, 0], lod: 2 });
      for (let x = -half + .9, k = 0; x < half; x += 1.1, k++) { const z0 = k % 2 ? 0 : .5, z1 = z0 + .5; B.mark([[x, wall + .52, z0], [x, wall + .52, z1]], { on: w, n: [0, 1, 0], lod: 2 }); }
    }
    for (const [sx, sy] of spots) {
      const x = sx + R.r(-1.2, 1.2), y = sy + R.r(-1, 1);
      if (wall != null && abs(y - wall) < 1.6) continue;
      const r = min(R.r(4.6, 5.8), room(x, y, 23.2) - .2), zc = R.r(2.2, 3), H = r * R.r(.9, 1.1);
      // the gnarled trunk: a stout twisted bole, forking into the crown
      const lean = R.r(-.6, .6), c = crown(B, R, x, y, zc + H, { r, zc, hr: 2, prof: PROF.olive, sq: R.r(.82, 1), jit: .11, role, lod: 0, trunk: false, leaves: 9, leafKind: 'dash', leafW: .24, dx: lean, dy: R.r(-.4, .4) });
      B.mark([[x - .5, y, 0], [x - .3 + lean * .4, y, zc * .55], [x - .8 + lean, y - .2, zc + .3]], { on: c, cls: 'mid', lod: 1 });
      B.mark([[x + .5, y + .2, 0], [x + .4 + lean * .4, y + .1, zc * .5], [x + .9 + lean, y + .3, zc + .3]], { on: c, cls: 'mid', lod: 1 });
      const tk = B.lathe(x + lean * .2, y, [[.85, 0], [.55, .45], [.42, zc * .55], [.5, zc]], { n: 10, role, lod: 2 });
      B.mark([[x + .7, y + .1, .2], [x + .2, y + .62, zc * .5], [x + .5, y + .5, zc - .1]], { on: tk, n: [.7, .7, 0], lod: 2 });
    }
    for (let k = 0; k < 2; k++) { const x = R.r(-14, 14), y = R.r(-12, 12); if (room(x, y) > 2 && !spots.some(s => hypot(s[0] - x, s[1] - y) < 5)) tuft(B, R, x, y, 0, R.r(1.4, 2), { n: 6, role, lod: 2 }); }
  }, { tier: 'tile', masks: false, word: 'olive grove' });

  /* A line of slim cypresses: along the road edge when the tile has one, else across the country. */
  def('t:cypress', (R, B, A) => {
    const role = 'the cypresses', lines = [];
    for (let i = 0; i < 6; i++) if (bit(A.road, i)) lines.push(i);
    lines.sort((a, b) => (EN[b][0] + EN[b][1]) - (EN[a][0] + EN[a][1]));
    const segs = [];
    if (lines.length) for (const i of lines.slice(0, 2)) {
      // parallel to the road edge, a few units in from it
      const d = AP - R.r(3.6, 4.6), n = EN[i], t = [-n[1], n[0]], c = [n[0] * d, n[1] * d];
      const cl = clipLine([[c[0] - t[0] * 30, c[1] - t[1] * 30], [c[0] + t[0] * 30, c[1] + t[1] * 30]], 21.4)[0];
      if (cl) segs.push(cl);
    } else {
      const a = R.pick([0, PI / 3, 2 * PI / 3]) + R.r(-.15, .15), off = R.r(-7, 7), t = [cos(a), sin(a)], c = [-t[1] * off, t[0] * off];
      const cl = clipLine([[c[0] - t[0] * 30, c[1] - t[1] * 30], [c[0] + t[0] * 30, c[1] + t[1] * 30]], 20.5)[0];
      if (cl) segs.push(cl);
    }
    const cap = segs.length > 1 ? 3 : 6;
    let host = null;
    for (const [p, q] of segs) {
      const L = hypot(q[0] - p[0], q[1] - p[1]), gap = R.r(4.2, 5.2), n = min(cap, max(2, floor(L / gap) + 1)), used = (n - 1) * gap, s0 = (L - used) / 2;
      const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L;
      if (!host) host = ground(B, [lerp2(p, q, .05), lerp2(p, q, .95)].map(v => [v[0] + uy * 1.6, v[1] - ux * 1.6]), { role: 'the verge', lod: 1 });
      else B.mark(at([lerp2(p, q, .05), lerp2(p, q, .95)].map(v => [v[0] + uy * 1.6, v[1] - ux * 1.6]), 0), { on: host, lod: 1 });
      for (let k = 0; k < n; k++) {
        const s = s0 + k * gap + R.r(-.3, .3), x = p[0] + ux * s, y = p[1] + uy * s, young = R.chance(.15);
        cypress(B, R, x, y, young ? R.r(9, 11) : R.r(14, 18), { w: R.r(.105, .13), role, lod: 0 });
        if (R.chance(.5)) B.mark(tuftPts(R, x + uy * 1.3, y - ux * 1.3, 0, 1.2, { n: 4 }), { on: host, cls: 'lo', lod: 2 });
      }
    }
    // a wayside shrine by the line sometimes: a small pier with its niche and its tiled cap
    if (segs.length && R.chance(.3)) {
      const [p, q] = segs[0], m = lerp2(p, q, R.chance(.5) ? .02 : .98), L = hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L, x = m[0] + uy * 3, y = m[1] - ux * 3;
      if (room(x, y) > 1.5) {
        const sh = B.box(x - .9, y - .7, x + .9, y + .7, 0, 3.4, { r: .2, b: 0, role: 'the shrine', lod: 1 });
        B.mark([[x - .4, y + .7, 1.6], [x - .4, y + .7, 2.4], [x, y + .7, 2.8], [x + .4, y + .7, 2.4], [x + .4, y + .7, 1.6]], { on: sh, n: [0, 1, 0], closed: true, lod: 2 });
        sol(B, [[[[x - 1.2, y - 1], [x + 1.2, y - 1], [x + 1.2, y + 1], [x - 1.2, y + 1]], 3.4], [[[x, y]], 4.3]], { role: 'the shrine', lod: 2 });
      }
    }
    if (!segs.length) cypress(B, R, 0, 0, 15, { role, lod: 0 });
  }, { tier: 'tile', masks: true, word: 'cypresses' });

  /* A butte of the Zuni plateau: an angular cliff of banded sandstone on its skirt of talus, the flat top
     with its joints, blocks fallen from the rim, junipers in the scree; sometimes a pinnacle off its flank. */
  def('t:mesa', (R, B) => {
    const role = 'the mesa', n = R.i(7, 9), a0 = R() * TAU, rot = R() * TAU, spire = R.chance(.4);
    let mx = R.r(-2, 2) - (spire ? 2.5 : 0), my = R.r(-3, 1) - (spire ? 1.5 : 0);
    const ax = spire ? R.r(10.5, 12) : R.r(12, 14), ay = ax * R.r(.62, .85);
    // the cliff's foot is angular, a few long faces; the talus spreads from it, the cliff leans in a little to the rim
    let cl = wob(R, mx, my, ax, ay, n, .13, rot, a0);
    let cs = []; cl.forEach((p, i) => cs.push(p, lerp2(p, cl[(i + 1) % n], .5)));
    const ph = R() * TAU;
    let t0 = cs.map((p, i) => { const k = 1.3 + .1 * sin(i * 1.1 + ph) + R.r(-.03, .03); return [mx + (p[0] - mx) * k, my + (p[1] - my) * (k + .05)]; });
    let c1 = cl.map(p => [mx + (p[0] - mx) * .9 - .4, my + (p[1] - my) * .9 - .4]);
    { const k = fitScale(t0, 22.6); if (k < 1) { t0 = scl(t0, k, [0, 0]); cl = scl(cl, k, [0, 0]); cs = scl(cs, k, [0, 0]); c1 = scl(c1, k, [0, 0]); mx *= k; my *= k; } }
    const zt = R.r(2.4, 3.6), zc = zt + R.r(8, 12.5), ctr = [mx, my];
    const TL = [[t0, 0], [cs, zt]], CL = [[cl, zt], [c1, zc]];
    const talus = sol(B, TL, { role: 'the talus', lod: 0 });
    const cliff = sol(B, CL, { role, lod: 0, crease: .9 });
    // the bands of sandstone, wavering a little, one hard ledge among them; the thin beds between, close up
    const bands = []; let z = zt + R.r(1.6, 2.6); while (z < zc - 1.6) { bands.push(z); z += R.r(2.2, 3.8); }
    bands.forEach((bz, i) => surf(B, cliff, closed(sectionAt(CL, bz)).map((p, k) => [p[0], p[1], bz + (k % n ? sin(k * 2.1 + i) * .25 : 0)]), ctr, { slope: .06, cls: i === 1 ? 'mid' : 'lo', lod: i % 2 ? 2 : 1 }));
    const thin = []; for (let i = 0; i + 1 < bands.length; i++) thin.push(lerp(bands[i], bands[i + 1], .5));
    strata(B, cliff, CL, ctr, thin, { n: 30, slope: .06, wave: .14, lod: 2 });
    shade(B, cliff, CL, ctr, { zHi: zc - 1, zLo: zt + .3, flat: true, slope: .06, dense: 4, min: .4 });
    // the joints of the cap rock on the flat top
    for (let k = 0; k < 2; k++) { const a = rot + k * PI / 2 + R.r(-.3, .3), p = rayHit(c1, mx - .4, my - .4, a), q = rayHit(c1, mx - .4, my - .4, a + PI), m2 = lerp2(p, q, R.r(.35, .65)); B.mark([[...lerp2(p, m2, .08), zc], [m2[0] + R.r(-.6, .6), m2[1] + R.r(-.6, .6), zc], [...lerp2(q, m2, .3), zc]], { on: cliff, lod: 2 }); }
    // the scree down the talus, and blocks fallen from the rim
    for (let j = 0; j < 2 * n; j++) for (const t of [.25, .75]) { const a = lerp2(cs[j], cs[(j + 1) % (2 * n)], t), b = lerp2(t0[j], t0[(j + 1) % (2 * n)], t); surf(B, talus, [[a[0], a[1], zt - .3], [lerp(a[0], b[0], .8), lerp(a[1], b[1], .8), zt * .2]], ctr, { radial: true, slope: .5, lod: t < .5 ? 1 : 2 }); }
    for (let i = 0; i < 2; i++) { const j = R.i(0, 2 * n - 1), p = lerp2(cs[j], t0[j], .5); if ((p[0] - mx) + (p[1] - my) > -2) rock(B, R, p[0], p[1], R.r(1.2, 1.8), R.r(1, 1.6), { z: heightIn(TL, p[0], p[1]) - .2, lod: 2, plain: true }); }
    { const j = R.i(0, 2 * n - 1), p = lerp2(cs[j], t0[j], .72); crown(B, R, p[0], p[1], 4.6, { z: heightIn(TL, p[0], p[1]) - .1, zc: heightIn(TL, p[0], p[1]) + .6, r: 1.8, hr: 1.6, prof: PROF.juniper, jit: .14, role: 'the junipers', lod: 2, leaves: 3 }); }
    if (spire) {
      // the pinnacle: a column of the same stone on its own cone of talus
      const sa = PI / 4 + R.r(-1.1, 1.1) + (R.chance(.5) ? PI / 2 : -PI / 2);
      let px = mx + cos(sa) * (ax * 1.3 + 3), py = my + sin(sa) * (ay * 1.3 + 3);
      const rr = R.r(1.8, 2.4), hh = R.r(zc * .75, zc * 1.05), qa = R() * TAU;
      for (let i = 0; i < 12 && room(px, py, 22.8) < rr * 1.9; i++) { px *= .94; py *= .94; }
      sol(B, [[wob(R, px, py, rr * 1.8, rr * 1.6, 8, .1, qa), 0], [wob(R, px, py, rr * 1.05, rr * .95, 8, .1, qa), zt * .7]], { role: 'the pinnacle', lod: 1 });
      const PL = [[wob(R, px, py, rr, rr * .9, 8, .08, qa), zt * .7], [wob(R, px + .2, py - .2, rr * .78, rr * .68, 8, .1, qa), hh]];
      const pp = sol(B, PL, { role: 'the pinnacle', lod: 1 });
      for (const fz of [.4, .65, .85]) surf(B, pp, closed(sectionAt(PL, hh * fz)).map(p => [p[0], p[1], hh * fz]), [px, py], { slope: .05, lod: fz === .65 ? 1 : 2 });
    }
  }, { tier: 'tile', masks: false, word: 'mesa' });

  /* a juniper: a squat crown of lobes on a twisted, often doubled trunk; or a pinyon, a rounded cone */
  function scrub(B, R, x, y, r, pin, lod) {
    if (pin) {
      const zc = r * .45, H = r * R.r(1.8, 2.1);
      const c = crown(B, R, x, y, zc + H, { r, zc, hr: 2.2, prof: PROF.pinyon, jit: .08, role: 'the pinyons', lod, leaves: 5, leafW: .24, trunk: false });
      B.mark([[x, y, 0], [c.crownC[0], c.crownC[1], zc + .3]], { on: c, cls: 'edge', lod: 1 });
      return c;
    }
    const zc = r * R.r(.45, .65), H = r * R.r(1.15, 1.4), lean = R.r(-.8, .8);
    const c = crown(B, R, x, y, zc + H, { r, zc, hr: 1.5, prof: PROF.juniper, jit: .15, sq: .86, role: 'the junipers', lod, trunk: false, leaves: 5, leafW: .26, dx: lean, clump: 2 });
    const [cx, cy] = c.crownC;
    B.mark([[x - .3, y, 0], [x + lean * .3 + .3, y, zc * .5], [cx - .4, cy, zc + .3]], { on: c, cls: 'mid', lod: 1 });
    B.mark([[x + .3, y + .2, 0], [x + lean * .5 - .2, y, zc * .6], [cx + .6, cy + .2, zc + .3]], { on: c, cls: 'mid', lod: 2 });
    return c;
  }
  /* Juniper and pinyon scrub on stony ground: the open country of the Southwest. */
  def('t:juniper', (R, B) => {
    const role = 'the scrub';
    const g0 = [R.r(-12, 12), R.r(-10, 10)], ga = R() * TAU;
    // a dry wash across the ground, its gravel and its banks
    const wash = R.chance(.45);
    let host;
    if (wash) {
      const a = R.pick([PI / 6, PI / 2, 5 * PI / 6]) + R.r(-.2, .2), off = R.r(-6, 6), c = [-sin(a) * off, cos(a) * off], P = [];
      for (let k = -6; k <= 6; k++) { const s = k * 5; P.push([c[0] + cos(a) * s - sin(a) * sin(k * 1.3) * 1.6, c[1] + sin(a) * s + cos(a) * sin(k * 1.3) * 1.6]); }
      const sp = clipLine(spline(P, 3), 22.4)[0] || P.slice(5, 8);
      host = ground(B, offsetLine(sp, 1.3), { role: 'the wash', lod: 1 });
      B.mark(at(offsetLine(sp, -1.3), 0), { on: host, lod: 1 });
      for (let k = 2; k < sp.length - 2; k += 2) pebbles(B, host, R, sp[k][0], sp[k][1], 1, 1, 2, 0, { lod: 2 });
      host.wash = sp;
    } else host = ground(B, [[g0[0], g0[1]], [g0[0] + cos(ga) * 2.4, g0[1] + sin(ga) * 2.4]], { role, lod: 2 });
    const nearWash = (x, y, r) => host.wash ? host.wash.some(p => hypot(p[0] - x, p[1] - y) < r + 1.8) : false;
    // the stones: flat slabs, not boulders, so they do not read as bushes
    const rk = []; place(R, rk, R.i(1, 2), () => ({ r: R.r(1.5, 2.4) }), { gap: 2, Rh: 22, ok: (x, y, d) => !nearWash(x, y, d.r) });
    rk.forEach((q, i) => { rock(B, R, q.x, q.y, q.r, q.r * R.r(.4, .55), { lod: i ? 2 : 1, role: 'the stones' }); pebbles(B, host, R, q.x + .6, q.y + .6, min(q.r * 2, room(q.x, q.y, 22.4)), min(q.r * 1.6, room(q.x, q.y, 22.4)), 7, 0, { lod: 2 }); });
    const sh = []; place(R, sh, R.i(4, 6), () => ({ r: R.r(2.3, 3.4) }), { avoid: rk.map(q => [q.x, q.y, q.r + .5]), gap: 1.2, Rh: 23, fit: 1.05, ok: (x, y, d) => !nearWash(x, y, d.r) });
    sh.sort((a, b) => b.r - a.r);
    sh.forEach((q, i) => scrub(B, R, q.x, q.y, q.r, R.chance(.4), n01(B) < 8 ? 0 : 2));
    for (let k = 0; k < 9; k++) { const x = R.r(-20, 20), y = R.r(-18, 18); if (room(x, y) < 1.4 || sh.some(q => hypot(q.x - x, q.y - y) < q.r + 1.2) || rk.some(q => hypot(q.x - x, q.y - y) < q.r + 1)) continue; if (k % 3 === 0) B.mark(tuftPts(R, x, y, 0, R.r(1, 1.5), { n: 5, spread: .6 }), { on: host, cls: 'mid', lod: 2 }); else pebbles(B, host, R, x, y, 1.2, 1, 3, 0, { lod: 2 }); }
  }, { tier: 'tile', masks: false, word: 'scrub' });

  /* Zuni gardens near a pueblo: the waffle gardens, a grid of small squares walled with earth, or corn
     planted in hills along its rows; a brush ramada or a stone field house to rest in. */
  def('t:cornfield', (R, B) => {
    const waffle = R.chance(.55), role = waffle ? 'the waffle gardens' : 'the corn';
    // the shelter: where it stands, the garden is left clear
    const ramada = R.chance(.65), sx = R.r(-8, 8), sy = R.r(-7, 5), sw = ramada ? 3.4 : 3, sd = ramada ? 2.8 : 2.6;
    const clear = (x, y) => abs(x - sx) < sw + 1 && abs(y - sy) < sd + 1;
    const cut = pts => { const out = []; let cur = []; for (const p of pts) { if (clear(p[0], p[1])) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push(p); } if (cur.length > 1) out.push(cur); return out; };
    let host = null;
    const put = (pts, lod, cls) => { for (const run of clipLine(pts, 22.8)) for (const s of cut(run)) { if (!host) host = ground(B, s, { role, lod: 1 }); else B.mark(at(s, 0), cls ? { on: host, lod, cls } : { on: host, lod }); } };
    if (waffle) {
      // the walls of earth on the lattice; up close each shows its near foot, and the sown squares their sprouts
      const gx = PX / 6, gy = PY / 4;
      for (let j = -4; j <= 4; j++) { const pts = []; for (let x = -24; x <= 24; x += 1.5) pts.push([x, j * gy]); put(pts, 1); }
      for (let i = -4; i <= 4; i++) { const pts = []; for (let y = -24; y <= 24; y += 1.5) pts.push([i * gx, y]); put(pts, 1); }
      for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
        const x = (i + .5) * gx, y = (j + .5) * gy;
        if (room(x, y, 23) < 2 || clear(x, y) || R.chance(.5)) continue;
        B.mark([[x - EH[0] * .7, y - EH[1] * .7, 1], [x, y, 0], [x + EH[0] * .7, y + EH[1] * .7, 1]], { on: host, lod: 2 });
      }
    } else {
      // the furrows, and the corn standing in hills along them
      const rs = PY / 4;
      for (let k = -4; k < 4; k++) { const pts = []; for (let x = -24; x <= 24; x += 1.5) pts.push([x, (k + .5) * rs]); put(pts, 1); }
      for (let k = -4; k < 4; k++) for (let i = -4; i <= 4; i++) {
        const x = (i + (mod(k, 2) ? .5 : 0)) * PX / 8, y = (k + .5) * rs;
        if (room(x, y, 23) < 2 || clear(x, y) || R.chance(.15)) continue;
        const h = R.r(3.4, 4.4), lean = R.r(-.25, .25);
        B.mark([[x - EH[0] * 1.3, y - EH[1] * 1.3, h * .42], [x, y, h * .62], [x, y, 0], [x, y, h * .62], [x + EH[0] * lean, y + EH[1] * lean, h], [x, y, h * .62], [x + EH[0] * 1.2, y + EH[1] * 1.2, h * .7]], { on: host, lod: 2 });
      }
    }
    if (!host) host = ground(B, [[sx + 5, sy + 4], [sx + 6, sy + 4.5]], { role, lod: 1 });
    if (ramada) {
      // four posts under a roof of brush laid on poles
      const z = R.r(4.6, 5.2), rf = B.box(sx - sw, sy - sd, sx + sw, sy + sd, z, z + .55, { r: .2, b: 0, role: 'the ramada', lod: 0 });
      for (const [cx2, cy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.mark([[sx + cx2 * (sw - .4), sy + cy2 * (sd - .4), 0], [sx + cx2 * (sw - .4), sy + cy2 * (sd - .4), z]], { on: rf, cls: 'edge', lod: 1 });
      for (let k = 1; k < 8; k++) { const x = sx - sw + k * sw / 4; B.mark([[x, sy - sd, z + .58], [x + R.r(-.3, .3), sy + sd, z + .58]], { on: rf, lod: 2 }); }
      B.mark([[sx - sw - .5, sy + sd - .3, z + .2], [sx + sw + .5, sy + sd - .3, z + .2]], { on: rf, cls: 'mid', lod: 2 });
      const ol = B.lathe(sx + 1.2, sy + .6, [[.5, 0], [1, .7], [.9, 1.5], [.4, 1.9]], { n: 12, role: 'the ramada', lod: 2 }); hoop(B, ol, sx + 1.2, sy + .6, .98, .9, { n: 12, lod: 2 });
      figure(B, sx - 1.2, sy + 1.2, 5.4, { jar: R.chance(.4), role: 'the gardeners', lod: 2 });
    } else {
      // a field house of stone and adobe, its roof beams out through the parapet, a ladder to the roof
      const hh = R.r(4, 4.6), fh = B.box(sx - sw, sy - sd, sx + sw, sy + sd, 0, hh, { r: .5, b: .45, role: 'the field house', lod: 0 });
      B.door('S', .35, 1.3, 2.4, { on: fh, shape: 'flat' });
      B.window('E', .5, 2.2, .9, .8, { on: fh, shape: 'flat', lod: 2 });
      for (let k = 0; k < 4; k++) { const x = sx - sw + .9 + k * (sw * 2 - 1.8) / 3; B.mark([[x, sy + sd, hh - .6], [x, sy + sd + .7, hh - .6]], { on: fh, cls: 'edge', lod: 2 }); }
      for (const dx2 of [.7, 1.6]) B.mark([[sx + sw * .5 + dx2, sy + sd + 1.4, 0], [sx + sw * .5 + dx2, sy + sd + .2, hh + 1.2]], { on: fh, cls: 'mid', lod: 2 });
      for (let k = 1; k < 5; k++) { const t = k / 5; B.mark([[sx + sw * .5 + .7, lerp(sy + sd + 1.4, sy + sd + .2, t), (hh + 1.2) * t], [sx + sw * .5 + 1.6, lerp(sy + sd + 1.4, sy + sd + .2, t), (hh + 1.2) * t]], { on: fh, lod: 2 }); }
      figure(B, sx + sw + 3.5, sy + 2, 5.4, { stoop: true, role: 'the gardeners', lod: 2 });
    }
    if (!waffle && R.chance(.35)) { const x = R.r(-12, 12), y = R.r(-10, 10); if (!clear(x, y) && room(x, y) > 3) B.cut([[-.04, 0], [.04, 0], [.04, .7], [.42, .72], [.42, .78], [.06, .78], [.1, .86], [.06, 1], [-.06, 1], [-.1, .86], [-.06, .78], [-.42, .78], [-.42, .72], [-.04, .7]], x, y, 0, 6, { w: 6, role: 'the scarecrow', lod: 2 }); }
  }, { tier: 'tile', masks: false, word: 'cornfield' });

  /* A young lava flow on the slopes of Hawaii: low flat lobes of pahoehoe stacked one on another, all run
     the same way downhill, their skins ropy and cracked; a cinder cone or a tumulus, and steam. */
  const FLOW = PI / 4 + .35, FX = cos(FLOW), FY = sin(FLOW);
  def('t:lava', (R, B) => {
    const role = 'the lava', cone = R.chance(.38);
    const h0 = [R.r(-8, 8), R.r(-6, 6)], host = ground(B, [h0, [h0[0] + 2.6, h0[1] - 1]], { role, lod: 1 });
    // the cinder cone at the head of the flow, upslope
    let cc = null;
    if (cone) {
      const d = R.r(8, 10.5), side = R.r(-.6, .6), x = -FX * d - FY * side * 6, y = -FY * d + FX * side * 6, r = R.r(5.8, 7), h = R.r(4.6, 6.4);
      const k = room(x, y, 23) < r ? (room(x, y, 23) - .3) / r : 1, rr = r * min(1, max(.7, k));
      const cn = B.lathe(x, y, [[rr, 0], [rr * .9, h * .18], [rr * .48, h * .9], [rr * .42, h]], { n: 18, role: 'the cinder cone', lod: 0 });
      B.mark(at(closed(ell(x + .25, y + .25, rr * .3, rr * .27, 14)), h), { on: cn, lod: 1 });
      staves(B, cn, x, y, rr * .9, h * .12, h * .86, 14, { top: .54, lod: 2, nz: .4 });
      cc = [x, y, rr];
      B.line(spline([[x + .3, y + .3, h], [x + .8, y, h + 2.6], [x - .2, y - .5, h + 5.2], [x + .9, y - 1, h + 8]], 3), { role: 'the steam', cls: 'lo', lod: 1 });
    }
    // the lobes: low flat tongues with steep toes pointing downhill, the nearer laid over the farther
    const nl = R.i(3, 4), lobes = [];
    for (let i = 0; i < nl; i++) {
      for (let t = 0; t < 40; t++) {
        const len = R.r(8, 11.5), wid = R.r(5.4, 7.6), u = R.r(-11, 11), v = R.r(-10, 10), x = FX * u - FY * v, y = FY * u + FX * v;
        if (room(x, y, 23) < wid * 1.02 || (cc && hypot(x - cc[0], y - cc[1]) < cc[2] + wid * .6) || lobes.some(l => hypot(l.x - x, l.y - y) < (l.wid + wid) * .42)) continue;
        lobes.push({ x, y, len, wid }); break;
      }
    }
    lobes.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    lobes.forEach((lb, i) => {
      const pts = [], m = 14;
      for (let k = 0; k < m; k++) { const a = k / m * TAU, c = cos(a), s = sin(a), along = c > 0 ? c * lb.len * .6 : c * lb.len, across = s * lb.wid * (c > 0 ? 1 : .8 + .2 * (1 + c)); pts.push([along, across]); }
      let W = pts.map(([u, v]) => { const f = 1 + R.r(-.07, .07); return [lb.x + (FX * u - FY * v) * f, lb.y + (FY * u + FX * v) * f]; });
      for (let j = 0; j < 10 && fitScale(W, 22.8) < 1; j++) W = scl(W, .92, [lb.x, lb.y]);
      const sc = (P, k, du) => P.map(p => [lb.x - FX * du + (p[0] - lb.x) * k, lb.y - FY * du + (p[1] - lb.y) * k]);
      const zt = R.r(.9, 1.3), top = sc(W, .9, .35), LL = [[W, 0], [sc(W, .97, .12), zt * .78], [top, zt]];
      const lp = sol(B, LL, { role, lod: i < 2 ? 0 : 1 });
      const tc = [lb.x - FX * .35, lb.y - FY * .35];
      // the ropes: arcs across the lobe, bowed downhill, close set so the skin reads dark
      const nr = round(lb.len * 1.5 / 1.5);
      for (let r = 0; r < nr; r++) {
        const u0 = lerp(-lb.len * .85, lb.len * .35, r / (nr - 1)), seg = [];
        for (let k = 0; k <= 12; k++) { const s = -1 + 2 * k / 12, u = u0 + (1 - s * s) * lb.len * .18, v = s * lb.wid * .9; const x = tc[0] + FX * u - FY * v, y = tc[1] + FY * u + FX * v; if (inConvex(top, x, y)) seg.push([x, y, zt + .02]); }
        if (seg.length > 2) B.mark(seg, { on: lp, lod: r % 2 ? 2 : 1 });
      }
      // the toe's wrinkles where it pushed out over the ground, and cracks across the skin
      const toe = []; for (let k = -4; k <= 4; k++) { const s = k / 4, u = lb.len * .58 * sqrt(max(0, 1 - s * s)) - .15, v = s * lb.wid * .92; toe.push([lb.x + FX * u - FY * v, lb.y + FY * u + FX * v, zt * .4]); }
      surf(B, lp, toe, [lb.x, lb.y], { slope: .4, lod: 2 });
      for (let k = 0; k < 2; k++) { const u = R.r(-lb.len * .5, lb.len * .2), v = R.r(-lb.wid * .4, lb.wid * .4), a = R() * PI, L = R.r(2, 3.5), x = tc[0] + FX * u - FY * v, y = tc[1] + FY * u + FX * v; const p = [x - cos(a) * L / 2, y - sin(a) * L / 2], q = [x + cos(a) * L / 2, y + sin(a) * L / 2], mm = [x + R.r(-.4, .4), y + R.r(-.4, .4)]; if (inConvex(top, p[0], p[1]) && inConvex(top, q[0], q[1])) B.mark([[...p, zt + .02], [...mm, zt + .02], [...q, zt + .02]], { on: lp, cls: 'mid', lod: 2 }); }
    });
    // between the lobes, the older flow underfoot: ropes and cracks on the ground
    for (let k = 0; k < 9; k++) {
      const u = R.r(-18, 18), v = R.r(-16, 16), x = FX * u - FY * v, y = FY * u + FX * v;
      if (room(x, y, 23) < 2.5 || lobes.some(l => hypot(l.x - x, l.y - y) < max(l.len, l.wid) + 1) || (cc && hypot(x - cc[0], y - cc[1]) < cc[2] + 1)) continue;
      for (const du of [0, 1.1]) { const seg = []; for (let j = 0; j <= 6; j++) { const s = -1 + 2 * j / 6, uu = u + du + (1 - s * s) * 1.2, vv = v + s * 2.6 * (1 - du * .2); seg.push([FX * uu - FY * vv, FY * uu + FX * vv, 0]); } B.mark(seg, { on: host, lod: du ? 2 : 1 }); }
    }
    // a tumulus where the crust was lifted and split, and the steam from a crack
    if (!cone || R.chance(.4)) {
      for (let t = 0; t < 20; t++) {
        const x = R.r(-14, 14), y = R.r(-12, 12);
        if (room(x, y, 23) < 4 || (cc && hypot(x - cc[0], y - cc[1]) < cc[2] + 3.5)) continue;
        const tr = R.r(2.4, 3.2), th = R.r(1.6, 2.2), z0 = lobes.some(l => hypot(l.x - x, l.y - y) < l.wid * .6) ? 1 : 0;
        const tm = B.lathe(x, y, [[tr, z0], [tr * .86, z0 + th * .5], [tr * .5, z0 + th * .9], [0, z0 + th]], { n: 14, role: 'the tumulus', lod: 1 });
        B.mark([[x - EH[0] * tr * .6, y - EH[1] * tr * .6, z0 + th * .62], [x - EH[0] * .3 + .2, y - EH[1] * .3 + .2, z0 + th * .98], [x + EH[0] * tr * .55, y + EH[1] * tr * .55, z0 + th * .66]], { on: tm, n: [.6, .6, .5], cls: 'mid', lod: 1 });
        if (!cone) B.line(spline([[x, y, z0 + th], [x + .5, y - .3, z0 + th + 2.2], [x - .3, y - .7, z0 + th + 4.6], [x + .6, y - 1.2, z0 + th + 6.8]], 3), { role: 'the steam', cls: 'lo', lod: 1 });
        break;
      }
    }
  }, { tier: 'tile', masks: false, word: 'lava' });

  /* Ohia trees and tree ferns on young lava: the first forest of Hawaii, its red lehua among the leaves. */
  def('t:ohia', (R, B) => {
    const role = 'the ohia';
    const h0 = [R.r(-6, 6), R.r(-6, 6)], host = ground(B, [h0, [h0[0] + 2.4, h0[1] - .8]], { role: 'the young lava', lod: 1 });
    const no = R.i(1, 3), nf = min(5 - no, R.i(2, 4)), items = [];
    place(R, items, no, () => ({ r: R.r(3.8, 5) }), { gap: .9, Rh: 23, fit: 1.05 });
    const ferns = []; place(R, ferns, nf, () => ({ r: R.r(3.8, 4.8) }), { avoid: items.map(t => [t.x, t.y, t.r * .8]), gap: 1, Rh: 23, fit: .9 });
    for (const t of items) {
      // the ohia: a crooked trunk splitting into limbs, an open crown of clumps
      const zc = R.r(5.5, 7.5), H = t.r * R.r(.95, 1.15), lean = R.r(-1.2, 1.2);
      const c = crown(B, R, t.x, t.y, zc + H, { r: t.r, zc, hr: 2, prof: PROF.ohia, jit: .08, sq: .88, role, lod: 0, trunk: false, leaves: 9, dx: lean, dy: R.r(-.6, .6), clump: 2 });
      const [cx, cy] = c.crownC, kx = lerp(t.x, cx, .4) + R.r(-.6, .6), ky = lerp(t.y, cy, .4);
      B.mark([[t.x, t.y, 0], [t.x + R.r(-.4, .4), t.y, zc * .3], [kx, ky, zc * .62], [cx, cy, zc + .3]], { on: c, cls: 'edge', lod: 1 });
      B.mark([[kx, ky, zc * .62], [cx + R.r(-1.5, 1.5), cy + R.r(-1, 1), zc + .2]], { on: c, cls: 'mid', lod: 2 });
      // the lehua: small bursts of stamens out on the near side of the crown
      for (let k = 0; k < 4; k++) {
        const a = PI / 4 + R.r(-1.1, 1.1), tt = R.r(.3, .7), rr = t.r * radAt(PROF.ohia, tt), p = [cx + cos(a) * rr, cy + sin(a) * rr * .9, zc + c.crownH * tt];
        for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; B.mark([p, [p[0] + EH[0] * cos(b) * .45, p[1] + EH[1] * cos(b) * .45, p[2] + sin(b) * .45]], { on: c, n: [cos(a) * .8, sin(a) * .8, .5], cls: 'mid', lod: 2 }); }
      }
    }
    for (const t of ferns) {
      // the tree fern: a shaggy trunk, the fronds arching up and out and over
      const h = R.r(3.6, 6), tz = h, n = R.i(6, 7), a0 = R() * TAU, top = [t.x + R.r(-.3, .3), t.y + R.r(-.3, .3), tz], pts = [[t.x, t.y, 0], top], pin = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * TAU + R.r(-.2, .2), L = t.r * R.r(.85, 1), c = cos(a), s = sin(a), up = R.r(.35, .6);
        const f1 = [top[0] + c * L * .25, top[1] + s * L * .25, tz + L * up * .7], f2 = [top[0] + c * L * .6, top[1] + s * L * .6, tz + L * up * .8], f3 = [top[0] + c * L * .88, top[1] + s * L * .88, tz + L * up * .35], f4 = [top[0] + c * L, top[1] + s * L, tz - L * .05];
        pts.push(f1, f2, f3, f4, f3, f2, f1, top);
        for (const [p, q, k] of [[f2, f3, .13]]) for (const m of [.5]) { const b = lerp3(p, q, m); for (const sd of [-1, 1]) pin.push([b, [b[0] - s * sd * L * k, b[1] + c * sd * L * k, b[2] - L * k * .5]]); }
      }
      const fr = B.line(pts, { role: 'the tree ferns', lod: 0, cls: 'mid' });
      for (const m of pin) B.mark(m, { on: fr, cls: 'lo', lod: 2 });
      // a fiddlehead unrolling from the crown
      const fa = a0 + .5, fc = [top[0] + cos(fa) * .6, top[1] + sin(fa) * .6, tz], fh = [];
      for (let k = 0; k <= 8; k++) { const t2 = k / 8, rr = .9 * (1 - t2 * .7), b = t2 * 4; fh.push([fc[0] + cos(fa) * (rr * sin(b)) * .8, fc[1] + sin(fa) * (rr * sin(b)) * .8, fc[2] + 1.6 * (1 - t2) + rr * cos(b) * .6]); }
      B.mark([fc, ...fh], { on: fr, cls: 'mid', lod: 2 });
      const tk = B.lathe(t.x, t.y, [[.85, 0], [.62, h * .4], [.7, h * .9], [.95, h]], { n: 10, role: 'the tree ferns', lod: 2 });
      for (let k = 1; k < 5; k++) hoop(B, tk, t.x, t.y, .7, h * k / 5, { n: 10, lod: 2 });
    }
    // the young lava underfoot: a few ropes, its cracks, the ferns that first take hold in them
    for (let k = 0; k < 8; k++) {
      const x = R.r(-19, 19), y = R.r(-17, 17);
      if (room(x, y) < 2 || items.some(t => hypot(t.x - x, t.y - y) < t.r) || ferns.some(t => hypot(t.x - x, t.y - y) < 2)) continue;
      if (k % 2) { const seg = []; for (let j = 0; j <= 5; j++) { const s = -1 + 2 * j / 5, u = (1 - s * s) * 1, v = s * 2.2; seg.push([x + FX * u - FY * v, y + FY * u + FX * v, 0]); } B.mark(seg, { on: host, lod: k % 4 === 1 ? 1 : 2 }); }
      else { const a = R() * PI; B.mark([[x - cos(a) * 1.6, y - sin(a) * 1.6, 0], [x + R.r(-.3, .3), y + R.r(-.3, .3), 0], [x + cos(a) * 1.6, y + sin(a) * 1.6, 0]], { on: host, cls: 'mid', lod: 2 }); B.mark(tuftPts(R, x, y, 0, 1.2, { n: 5, spread: .9 }), { on: host, lod: 2 }); }
    }
  }, { tier: 'tile', masks: false, word: 'ohia wood' });

  /* Rice terraces: the bunds run east and west on the lattice, waving gently with the contour, each one's
     face a low wall over the paddy below; water and seedlings between; a field shelter on stilts, a straw
     stack or a palm, and a farmer at the planting. */
  def('t:paddy', (R, B) => {
    const sp = PY / 2, role = 'the paddies', bunds = [];
    const wave = (x, k) => .48 * sin(TAU * x / PX + mod(k, 2) * 2.4) + .2 * sin(TAU * x / (PX / 2) + mod(k, 2) * 1.1);
    const bundY = (x, k) => (k + .5) * sp + wave(x, k);
    const extra = R(), ex = R.r(-9, 9), ek = R.pick([-1, 0, 1]);
    for (let k = -2; k <= 1; k++) {
      const pts = []; for (let x = -PX; x <= PX + 1e-9; x += PX / 24) pts.push([x, bundY(x, k)]);
      const run = clipLine(pts, 23)[0]; if (!run || run.length < 3) continue;
      // the bund's face: from its crest down to the water of the paddy below, toward the eye
      const top = run.map(p => [p[0], p[1] - .5, 1.05]), foot = run.map(p => [p[0], p[1] + .3, 0]);
      const face = B.plate([foot[0], ...top, ...foot.slice(1).reverse()], { role, lod: 0, cls: 'lo' });
      bunds.push({ k, face });
    }
    // in each paddy, hung on the bund behind it: the shine of the water, the seedlings in their row, the short cross bunds
    bunds.forEach(b => {
      const k = b.k, back = x => bundY(x, k) + .6, front = x => k < 1 ? bundY(x, k + 1) - .4 : 24;
      const row = []; for (let x = -PX; x <= PX + 1e-9; x += PX / 12) row.push([x, lerp(back(x), min(front(x), back(x) + 10), .5)]);
      for (const r2 of clipLine(row, 22.2)) for (const p of r2) if (abs(p[0] - round(p[0] / (PX / 12)) * (PX / 12)) < 1e-6) B.mark([[p[0] - .3, p[1], .7], [p[0], p[1], 0], [p[0] + .3, p[1], .7]], { on: b.face, cls: 'mid', lod: 2 });
      for (let j = 0; j < 3; j++) { const x = R.r(-17, 17), y = lerp(back(x), min(front(x), back(x) + 10), R.r(.2, .8)), l = R.r(1.8, 3.2); if (room(x - 2, y, 22.6) > .5 && room(x + 2, y, 22.6) > .5) B.mark([[x - EH[0] * l / 2, y - EH[1] * l / 2, 0], [x + EH[0] * l / 2, y + EH[1] * l / 2, 0]], { on: b.face, lod: j ? 2 : 1 }); }
      if (k < 1) for (let i = -2; i <= 2; i++) { const x = (i + mod(k, 2) * .5) * PX / 3, y0 = back(x), y1 = front(x); if (room(x, y0, 22.6) > .5 && room(x, y1, 22.6) > .5) B.mark([[x, y0, .45], [x, y1, .45]], { on: b.face, cls: 'mid', lod: 2 }); }
    });
    // what stands in the paddies
    const by = ek * sp;
    if (extra < .4) {
      const z = 2.6, hw = 2.6, hd = 2, hp = B.add({ L: [[fromPts([[ex - hw - .6, by - hd - .6], [ex + hw + .6, by - hd - .6], [ex + hw + .6, by + hd + .6], [ex - hw - .6, by + hd + .6]]), z], [fromPts([[ex - hw * .5, by], [ex + hw * .5, by], [ex + hw * .5, by], [ex - hw * .5, by]]), z + 3.2]], inner: null, role: 'the field shelter', lod: 0 });
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.mark([[ex + a * hw, by + b * hd, 0], [ex + a * hw, by + b * hd, z]], { on: hp, cls: 'edge', lod: 1 });
      B.mark([[ex - hw, by + hd, 1.2], [ex + hw, by + hd, 1.2]], { on: hp, cls: 'mid', lod: 1 });
      for (let k = 1; k < 8; k++) { const t = k / 8, x = lerp(ex - hw - .6, ex + hw + .6, t); B.mark([[x, by + hd + .6, z], [lerp(x, ex, .4), by + hd * .4, z + 3.2 * .6]], { on: hp, n: [0, .7, .7], lod: 2 }); }
    } else if (extra < .7) {
      for (const [dx2, s] of [[0, 1], [3.6, .75]]) { if (s < 1 && R.chance(.4)) continue; const r = 1.8 * s, st = B.lathe(ex + dx2, by + dx2 * .3, [[r, 0], [r * 1.1, r * .7], [r * .8, r * 1.6], [0, r * 2.2]], { n: 14, role: 'the straw', lod: s < 1 ? 2 : 0 }); for (const z of [r * .6, r * 1.2]) hoop(B, st, ex + dx2, by + dx2 * .3, r * (z < r ? 1.08 : .92), z, { n: 16, lod: 2 }); }
    } else {
      const x = R.chance(.5) ? R.r(-12, -8) : R.r(8, 12), y = R.r(-4, 4);
      palm(B, R, x, y, R.r(14, 17), { role: 'the palm', lod: 0, lean: .12 });
    }
    // the farmer bent to the planting, a buffalo sometimes
    const fx2 = R.r(-12, 12), fk = R.pick([-1, 0, 1]), fy2 = fk * sp + wave(fx2, fk) * .3;
    if (abs(fx2 - ex) > 5 || fk !== ek) figure(B, fx2, fy2, 5.4, { stoop: true, hat: true, flip: R.chance(.5), role: 'the farmer', lod: n01(B) < 8 ? 1 : 2 });
    if (R.chance(.3)) { const bx = R.r(-12, 12), bk = R.pick([-1, 0, 1]), byy = bk * sp; if (abs(bx - fx2) > 6 && (abs(bx - ex) > 6 || bk !== ek)) beast(B, bx, byy, 3.4, { role: 'the buffalo', lod: 2, flip: R.chance(.5) }); }
  }, { tier: 'tile', masks: false, word: 'paddies' });

  /* A beach: the sand, and along the edges that face the water its swash line, the foam and the wet sand;
     a dune with its grass, driftwood on the wrack line, a palm leaning to the sea. */
  def('t:beach', (R, B, A) => {
    const wm = (A.water | 0) & 63, rs = runsOf(wm), role = 'the beach';
    let ux = 0, uy = 0; for (let i = 0; i < 6; i++) if (bit(wm, i)) { ux -= EN[i][0]; uy -= EN[i][1]; }
    const ga = R() * TAU, ul = hypot(ux, uy); if (ul < .3) { ux = cos(ga); uy = sin(ga); } else { ux /= ul; uy /= ul; }
    const shore = (x, y) => { let d = 99; for (let i = 0; i < 6; i++) if (bit(wm, i)) d = min(d, depthIn(i, x, y)); return d; };
    let host = null;
    for (const [i0, L] of rs) {
      // the swash: how far the last wave ran up, lacy at its edge
      const sw = shoreLine(i0, L, 3.4, 24.2, 6);
      const lacy = sw.map((p, k) => { const a = sw[max(0, k - 1)], b = sw[min(sw.length - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1, w = (k === 0 || k === sw.length - 1) ? 0 : .32 * sin(k * 1.7); return [p[0] - dy / l * w, p[1] + dx / l * w, 0]; });
      const ln = B.line(lacy, { role: 'the surf', lod: 0, cls: 'mid' });
      host = host || ln;
      // the foam of the broken wave between the swash and the water, in pieces
      const fm = shoreLine(i0, L, 1.5, 23.8, 6), T = fm.length;
      for (let k = 1; k < T - 3; k += 4) { if (mod(k, 8) === 5) continue; B.mark(at(fm.slice(k, min(T, k + 3)), 0), { on: ln, lod: 1 }); }
      // the line of wet sand above the swash, shortening to nothing at the ends
      B.mark(at(portion(shoreLine(i0, L, 6.4, 23, 6), L >= 6 ? 0 : .14, L >= 6 ? 1 : .86), 0), { on: ln, lod: 2 });
      // the wrack: weed and shells strewn along the high line
      const wr = portion(shoreLine(i0, L, 8.6, 22.5, 4), .2, .8);
      for (let k = 1; k < wr.length - 1; k += 2) { const p = wr[k], s = R.r(.2, .45); B.mark([[p[0] - s, p[1], 0], [p[0], p[1] - s * .8, 0], [p[0] + s * .9, p[1] + s * .2, 0], [p[0], p[1] + s * .7, 0]], { on: ln, closed: true, lod: 2 }); }
    }
    if (!host) host = ground(B, [[-3, 4], [-1, 3.6], [1, 4.2]], { role, lod: 1 });
    // the dry sand up the beach: ripples the wind laid across the view
    for (let k = 0; k < 9; k++) {
      const x = ux * 10 + R.r(-10, 10), y = uy * 10 + R.r(-10, 10), l = R.r(2.4, 4.2);
      const a = [x - EH[0] * l / 2, y - EH[1] * l / 2], b = [x + EH[0] * l / 2, y + EH[1] * l / 2];
      if (room(a[0], a[1], 22.6) < .5 || room(b[0], b[1], 22.6) < .5 || shore(x, y) < 9) continue;
      B.mark([[...a, 0], [x - EU[0] * .25, y - EU[1] * .25, 0], [...b, 0]], { on: host, lod: k % 3 ? 2 : 1 });
    }
    // the dune behind the beach, a long uneven ridge with its grass
    const dc = [ux * R.r(9, 12), uy * R.r(9, 12)], da = atan2(uy, ux) + PI / 2, drx = R.r(7, 9.5), dry = R.r(3.2, 4.2);
    const dk = room(dc[0], dc[1], 23) < drx ? max(.6, (room(dc[0], dc[1], 23) - .5) / drx) : 1;
    const DL = [[wob(R, dc[0], dc[1], drx * dk, dry * dk, 12, .1, da), 0], [wob(R, dc[0] - ux * .8, dc[1] - uy * .8, drx * dk * .7, dry * dk * .5, 12, .14, da), 1.4], [wob(R, dc[0] - ux * 1.3 + R.r(-1.5, 1.5) * -uy, dc[1] - uy * 1.3 + R.r(-1.5, 1.5) * ux, drx * dk * .34, dry * dk * .2, 12, .16, da), 2.2]];
    const dune = sol(B, DL, { role: 'the dune', lod: 0 });
    for (let k = 0; k < 3; k++) { const q = lerp2(DL[1][0][R.i(0, 11)], dc, R.r(.1, .5)); tuft(B, R, q[0], q[1], heightIn(DL, q[0], q[1]), R.r(1.8, 2.6), { n: 6, spread: .35, role: 'the dune', lod: 2 }); }
    strata(B, dune, DL, [dc[0] - ux * .8, dc[1] - uy * .8], [.7], { n: 22, slope: .4, wave: .12, lod: 2 });
    // driftwood on the wrack line, and a palm up the beach leaning out over the sand
    if (rs.length && R.chance(.75)) {
      const i = rs[0][0] + floor(rs[0][1] / 2), n = EN[mod(i, 6)], d = AP - R.r(8, 10), t = [-n[1], n[0]], s = R.r(-5, 5), x = n[0] * d + t[0] * s, y = n[1] * d + t[1] * s;
      if (room(x, y, 23) > 3.6) log(B, x, y, R.r(5.5, 7.5), R.r(.45, .6), atan2(t[1], t[0]) + R.r(-.4, .4), { role: 'the driftwood', lod: 1 });
    }
    if (R.chance(.45)) {
      const pa = da + R.pick([-1, 1]) * R.r(.3, .6), x = dc[0] + cos(pa) * drx * .9, y = dc[1] + sin(pa) * drx * .9;
      if (room(x, y, 23) > 2) palm(B, R, x, y, R.r(14, 18), { dir: atan2(-uy, -ux) + R.r(-.4, .4), lean: .2, role: 'the palm', lod: 0, droop: 1.2 });
    }
    if (!rs.length) rock(B, R, -ux * 9 + R.r(-3, 3), -uy * 9 + R.r(-3, 3), R.r(1.6, 2.4), R.r(1.4, 2), { lod: 1 });
  }, { tier: 'tile', masks: true, word: 'beach' });

  /* A coral reef in shallow water: the heads of coral and the patches between them, a sandy islet with a
     palm sometimes, and on the edges that face the open water the breakers on the reef's rim. */
  def('t:reef', (R, B, A) => {
    const wm = (A.water | 0) & 63, rs = runsOf(wm), role = 'the reef';
    const outer = (x, y) => { let d = 99; for (let i = 0; i < 6; i++) if (bit(wm, i)) d = min(d, depthIn(i, x, y)); return d; };
    const h0 = [R.r(-6, 6), R.r(-6, 6)], host = ground(B, [[h0[0] - EH[0] * 1.4, h0[1] - EH[1] * 1.4], [h0[0] + EH[0] * 1.4, h0[1] + EH[1] * 1.4]], { role: 'the lagoon', lod: 1 });
    for (const [i0, L] of rs) {
      // the breakers: two lines of crests along the rim, curling over toward the reef, foam behind them
      for (const [d, lod, amp, cls] of [[2.6, 1, .75, 'edge'], [1, 2, .5, 'mid']]) {
        const cr = d < 2 ? portion(shoreLine(i0, L, d, 24, 8), L >= 6 ? 0 : .12, L >= 6 ? 1 : .88) : shoreLine(i0, L, d, 24, 8), T = cr.length;
        B.mark(cr.map((p, k) => { const a = cr[max(0, k - 1)], b = cr[min(T - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1, w = amp * abs(sin(k * .55 + d)) * sin(PI * k / (T - 1)); return [p[0] + dy / l * w, p[1] - dx / l * w, 0]; }), { on: host, cls, lod });
      }
      const fm = shoreLine(i0, L, 4.8, 23.5, 6);
      for (let k = 2; k < fm.length - 3; k += 3) if (mod(k, 9) !== 8) B.mark(at(fm.slice(k, k + 2), 0), { on: host, lod: k % 2 ? 2 : 1 });
      // the rim of coral just inside, lumpy
      const rim = portion(shoreLine(i0, L, 7.2, 22.6, 6), L >= 6 ? 0 : .1, L >= 6 ? 1 : .9);
      for (let k = 0; k + 2 < rim.length; k += 3) { const p = rim[k], q = rim[k + 2]; B.mark([[p[0], p[1], 0], [lerp(p[0], q[0], .5) - .3, lerp(p[1], q[1], .5) - .3, 0], [q[0], q[1], 0]], { on: host, cls: 'mid', lod: 2 }); }
    }
    // the islet, set back from the open water
    let isl = null;
    if (R.chance(.4)) {
      for (let t = 0; t < 30; t++) { const x = R.r(-12, 12), y = R.r(-11, 11), r = R.r(4.8, 6.4); if (room(x, y, 23) > r + 1 && outer(x, y) > r + 5) { isl = [x, y, r]; break; } }
      if (isl) {
        const [x, y, r] = isl, rot = R() * TAU;
        const IL = [[wob(R, x, y, r, r * .78, 12, .06, rot), 0], [wob(R, x - .3, y - .3, r * .72, r * .52, 12, .08, rot), .8], [wob(R, x - .6, y - .6, r * .36, r * .24, 12, .1, rot), 1.3]];
        const s = sol(B, IL, { role: 'the islet', lod: 0 });
        B.mark(at(closed(ell(x, y, r * 1.18, r * .95, 18, rot)), 0), { on: host, lod: 1 });
        strata(B, s, IL, [x - .3, y - .3], [.45], { n: 18, slope: .3, lod: 2 });
        palm(B, R, x - .5, y - .5, R.r(13, 16), { z: 1, lean: .18, dir: PI / 4 + R.r(-1.2, 1.2), role: 'the islet', lod: 0 });
      }
    }
    // the coral heads, just awash
    const hd = []; place(R, hd, R.i(3, 4), () => ({ r: R.r(1.5, 2.5) }), { avoid: isl ? [[isl[0], isl[1], isl[2] + 2]] : [], gap: 1.6, Rh: 22, ok: (x, y, d) => outer(x, y) > d.r + 3.5 });
    hd.forEach((q, i) => {
      const c = B.lathe(q.x, q.y, [[q.r, -.1], [q.r * .92, .35], [q.r * .6, .7], [0, .85]], { n: 14, role, lod: i < 2 ? 0 : (n01(B) < 8 ? 1 : 2) });
      for (let k = 0; k < 5; k++) { const a = PI / 4 + R.r(-1.2, 1.2), rr = q.r * R.r(.4, .8), p = [q.x + cos(a) * rr, q.y + sin(a) * rr, .45 + (1 - rr / q.r) * .35]; B.mark(at(closed(ell(p[0], p[1], .22, .2, 6)), p[2]), { on: c, n: [cos(a) * .6, sin(a) * .6, .8], lod: 2 }); }
    });
    // the patches of coral under the water: lobed outlines, and branching staghorn
    for (let k = 0; k < 10; k++) {
      const x = R.r(-17, 17), y = R.r(-15, 15), r = R.r(1.2, 2.4);
      if (room(x, y, 22.5) < r + .5 || outer(x, y) < r + 3 || (isl && hypot(x - isl[0], y - isl[1]) < isl[2] + r + 1) || hd.some(q => hypot(q.x - x, q.y - y) < q.r + r)) continue;
      if (k % 2) B.mark(at(closed(wob(R, x, y, r, r * .8, 9, .25)), 0), { on: host, cls: 'mid', lod: k % 4 === 1 ? 1 : 2 });
      else for (let j = 0; j < 3; j++) { const a = -PI / 2 + (j - 1) * .7, b = [x + cos(a) * r * .9, y + sin(a) * r * .5, 0]; B.mark([[x, y, 0], b, [b[0] + cos(a - .5) * .6, b[1] + sin(a - .5) * .4, 0]], { on: host, lod: 2 }); }
    }
    // the lagoon's shine
    for (let k = 0; k < 6; k++) { const x = R.r(-16, 16), y = R.r(-14, 14), l = R.r(1.6, 3.2); if (room(x, y, 22) < 2 || outer(x, y) < 5 || (isl && hypot(x - isl[0], y - isl[1]) < isl[2] + 2)) continue; B.mark([[x - EH[0] * l / 2, y - EH[1] * l / 2, 0], [x + EH[0] * l / 2, y + EH[1] * l / 2, 0]], { on: host, lod: k < 2 ? 1 : 2 }); }
  }, { tier: 'tile', masks: true, word: 'reef' });

  /* ---------- ships ---------- */
  function hullPts(L, W, n = 12, x0 = 0) {
    const half = t => (W / 2) * (t > 0 ? pow(max(0, 1 - t * t), .72) : pow(max(0, 1 - pow(-t, 3.4)), .5)), up = [], dn = [];
    for (let i = 0; i <= n; i++) { const t = -.97 + 1.97 * i / n; up.push([x0 + t * L / 2, half(t)]); }
    for (let i = n; i >= 0; i--) { const t = -.97 + 1.97 * i / n; dn.push([x0 + t * L / 2, -half(t)]); }
    return up.concat(dn);
  }
  /* a dhow under its lateen sail, after the dhow of iso-kinds-land.js, pared to a tile's budget */
  function dhow(B, R, x, y, L, hd, host) {
    const role = 'the ship', W = L * .27, fb = L * .1, c = cos(hd), s = sin(hd);
    const T = (X, Y, Z = 0) => [x + X * c - Y * s, y + X * s + Y * c, Z], T2 = p => T(p[0], p[1]).slice(0, 2);
    const lee = (c - s) > 0 ? -1 : 1;
    const wlL = hullPts(L * .82, W * .84, 12, -L * .05), dkL = hullPts(L, W, 12, 0), wl = wlL.map(T2), dk = dkL.map(T2);
    const hull = sol(B, [[wl, 0], [dk, fb]], { role, lod: 0, crease: .6 });
    for (const [f, ml, cl] of [[.3, 2, 'lo'], [.6, 1, 'lo'], [.85, 2, 'mid']]) surf(B, hull, closed(lerpPoly(wl, dk, f)).map(p => [p[0], p[1], fb * f]), [x, y], { slope: .15, cls: cl, lod: ml });
    const cutX = -L * .24, sternL = dkL.filter(p => p[0] < cutX), wq = (W / 2) * pow(max(0, 1 - pow(-cutX / (L / 2), 3.4)), .5);
    const poopPts = [[cutX, wq], ...sternL, [cutX, -wq]].map(T2);
    const poop = sol(B, [[poopPts, fb], [poopPts, fb + L * .065]], { role, lod: 1, crease: .4 });
    B.mark([T(-L * .48, 0, fb + L * .065), T(-L * .5, 0, .1)], { on: poop, cls: 'edge', lod: 2 });
    B.plate([T(-L * .486, 0, fb * .95), T(-L * .55, 0, fb * .7), T(-L * .55, 0, .15), T(-L * .5, 0, .15)], { role, lod: 2 });
    B.line([T(L * .485, 0, fb), T(L * .53, 0, fb + L * .07)], { role, lod: 2, w: 1.2 });
    const mX = L * .06, mHt = L * .46, tX = L * .5, head = [mX + L * .02, mHt];
    B.line([T(mX, 0, fb), T(head[0], 0, head[1] + L * .02)], { role, lod: 0, w: 1.6 });
    const tack = [tX, fb + L * .03], peak = [head[0] + (head[0] - tack[0]) * 1.2, head[1] + (head[1] - tack[1]) * 1.2];
    const clew = [peak[0] + L * .1, fb + L * .16], bl = lee * L * .1;
    const S3 = (p, Y = 0) => T(p[0], Y, p[1]);
    const yardPts = [S3(tack)], leech = [], foot = [];
    for (let k = 1; k < 4; k++) yardPts.push(S3([lerp(tack[0], peak[0], k / 4), lerp(tack[1], peak[1], k / 4)]));
    yardPts.push(S3(peak));
    for (let k = 1; k < 4; k++) { const t = k / 4; leech.push(S3([lerp(peak[0], clew[0], t) - sin(t * PI) * L * .035, lerp(peak[1], clew[1], t)], bl * sin(t * PI) * .6)); }
    for (let k = 0; k < 5; k++) { const t = k / 5; foot.push(S3([lerp(clew[0], tack[0], t), lerp(clew[1], tack[1], t) - sin(t * PI) * L * .04], bl * (k === 0 ? .4 : sin(t * PI) + .2))); }
    const sail = B.plate([...yardPts, ...leech, ...foot], { role: 'the sail', lod: 0 });
    for (const [f, ml] of [[.22, 2], [.38, 1], [.54, 2], [.7, 1], [.86, 2]]) B.mark([S3([lerp(tack[0], peak[0], f), lerp(tack[1], peak[1], f)]), S3([lerp(tack[0], clew[0], f), lerp(tack[1], clew[1], f) - sin(f * PI) * L * .03], bl * sin(f * PI))], { on: sail, lod: ml });
    B.mark([S3(clew, bl * .4), T(-L * .41, lee * W * .25, fb + L * .065)], { on: sail, cls: 'mid', lod: 1 });
    B.mark([S3(head), T(mX - L * .26, -lee * W * .4, fb)], { on: sail, cls: 'mid', lod: 1 });
    B.line([S3(tack), S3(peak)], { role, lod: 1, w: 1.3 });
    for (const [X, Y, z] of [[-L * .34, W * .12, fb + L * .065], [L * .2, -W * .1, fb]]) { const q = T(X, Y); figure(B, q[0], q[1], 4.6, { z, role: 'the sailors', lod: 2 }); }
    wake(B, host, T, L, W);
    return hull;
  }
  /* a round-bellied trader of the middle sea under one square sail, its yard braced round to the wind,
     high stem and stern curling inboard, the steering oar at the quarter */
  function trader(B, R, x, y, L, hd, host) {
    const role = 'the ship', W = L * .31, fb = L * .1, c = cos(hd), s = sin(hd);
    const T = (X, Y, Z = 0) => [x + X * c - Y * s, y + X * s + Y * c, Z], T2 = p => T(p[0], p[1]).slice(0, 2);
    const wlL = hullPts(L * .84, W * .82, 12, 0), dkL = hullPts(L, W, 12, 0);
    const hull = sol(B, [[wlL.map(T2), 0], [dkL.map(T2), fb]], { role, lod: 0, crease: .6 });
    for (const [f, ml] of [[.35, 2], [.7, 1]]) surf(B, hull, closed(lerpPoly(wlL.map(T2), dkL.map(T2), f)).map(p => [p[0], p[1], fb * f]), [x, y], { slope: .15, lod: ml });
    // the stern deck and the curling posts at either end
    const aft = dkL.filter(p => p[0] < -L * .28), wq = (W / 2) * pow(max(0, 1 - pow(.56, 3.4)), .5), ap = [[-L * .28, wq], ...aft, [-L * .28, -wq]].map(T2);
    sol(B, [[ap, fb], [ap, fb + L * .06]], { role, lod: 1, crease: .4 });
    B.line(spline([T(-L * .48, 0, fb), T(-L * .55, 0, fb + L * .1), T(-L * .52, 0, fb + L * .2), T(-L * .45, 0, fb + L * .22), T(-L * .43, 0, fb + L * .18)], 3), { role, lod: 1, w: 1.3 });
    B.line(spline([T(L * .48, 0, fb), T(L * .53, 0, fb + L * .08), T(L * .5, 0, fb + L * .13), T(L * .46, 0, fb + L * .12)], 3), { role, lod: 2, w: 1.2 });
    B.mark([T(L * .44, W * .26, fb * .7), T(L * .41, W * .3, fb * .62), T(L * .44, W * .33, fb * .7)], { on: hull, n: [-s, c, 0], cls: 'mid', lod: 2 });
    B.mark([T(L * .44, -W * .26, fb * .7), T(L * .41, -W * .3, fb * .62), T(L * .44, -W * .33, fb * .7)], { on: hull, n: [s, -c, 0], cls: 'mid', lod: 2 });
    // the steering oar
    B.line([T(-L * .3, W * .5, fb + L * .08), T(-L * .44, W * .62, -.1)], { role, lod: 2, w: 1.4 });
    // the mast, the yard braced across the ship, the sail bellied forward under it
    const mx = L * .04, mh = L * .62, brace = R.r(.55, .8) * (R.chance(.5) ? 1 : -1), ya = PI / 2 + brace, yl = L * .36;
    B.line([T(mx, 0, fb), T(mx, 0, mh + L * .04)], { role, lod: 0, w: 1.7 });
    const Y = (u, z, fwd = 0) => T(mx + cos(ya) * u + fwd, sin(ya) * u, z);
    const zt = mh - L * .02, zb = fb + L * .13, belly = L * .09;
    const top = [], bot = [];
    for (let k = 0; k <= 6; k++) { const u = lerp(-yl, yl, k / 6); top.push(Y(u, zt, belly * .25 * sin(k / 6 * PI))); }
    for (let k = 6; k >= 0; k--) { const u = lerp(-yl, yl, k / 6) * .94; bot.push(Y(u, zb + sin(k / 6 * PI) * L * .015, belly * sin(k / 6 * PI))); }
    const sail = B.plate([...top, ...bot], { role: 'the sail', lod: 0 });
    // the brails down the sail and the seams across it
    for (let k = 1; k < 6; k++) { const u = lerp(-yl, yl, k / 6), sb = sin(k / 6 * PI); B.mark([Y(u, zt, belly * .25 * sb), Y(u * .97, lerp(zt, zb, .5), belly * .8 * sb), Y(u * .94, zb + sb * L * .015, belly * sb)], { on: sail, lod: k % 2 ? 1 : 2 }); }
    for (const f of [.33, .66]) { const row = []; for (let k = 0; k <= 6; k++) { const u = lerp(-yl, yl, k / 6) * lerp(1, .94, f), sb = sin(k / 6 * PI); row.push(Y(u, lerp(zt, zb, f), belly * lerp(.25, 1, f) * sb)); } B.mark(row, { on: sail, lod: 2 }); }
    B.line([Y(-yl - L * .03, zt + .2), Y(yl + L * .03, zt + .2)], { role, lod: 1, w: 1.4 });
    // the stays to the stem and the stern, the sheets from the sail's foot
    B.mark([T(mx, 0, mh), T(L * .5, 0, fb + L * .04)], { on: sail, cls: 'mid', lod: 1 });
    B.mark([T(mx, 0, mh), T(-L * .46, 0, fb + L * .1)], { on: sail, cls: 'mid', lod: 2 });
    for (const sg of [-1, 1]) B.mark([Y(sg * yl * .94, zb), T(-L * .2, sg * W * .42, fb)], { on: sail, cls: 'lo', lod: 2 });
    { const q = T(-L * .36, -W * .1); figure(B, q[0], q[1], 4.6, { z: fb + L * .06, role: 'the sailors', lod: 2 }); }
    wake(B, host, T, L, W);
    return hull;
  }
  /* the wake astern and the bow wave, on the water, kept inside the tile */
  function wake(B, host, T, L, W) {
    for (const sg of [-1, 1]) for (const run of clipLine(spline([T(-L * .5, sg * W * .3), T(-L * .78, sg * W * .75), T(-L * 1.05, sg * W * 1.3)], 4), 22.6)) B.mark(at(run, 0), { on: host, lod: 1 });
    for (const sg of [-1, 1]) for (const run of clipLine(spline([T(L * .47, sg * W * .18), T(L * .36, sg * W * .62), T(L * .2, sg * W * .82)], 3), 22.6)) B.mark(at(run, 0), { on: host, lod: 2 });
    for (const run of clipLine([T(-L * .62, 0), T(-L * .92, 0)], 22.6)) B.mark(at(run, 0), { on: host, cls: 'lo', lod: 2 });
  }
  /* A ship on the open water under sail: a dhow under its lateen, or a square-sailed trader of the middle
     sea; its wake and its bow wave, and the waves about it. */
  def('t:ship', (R, B) => {
    const square = R.chance(.45), L = square ? R.r(26, 30) : R.r(28, 32);
    // a lateen is seen best across the view; the trader's braced square sail reads from any quarter
    const hd = !square || R.chance(.7) ? (R.chance(.5) ? -PI / 4 : PI * .75) + R.r(-.35, .35) : (R.chance(.5) ? PI / 4 : -PI * .75) + R.r(-.45, .45);
    const sx = cos(hd) * 1.2 + R.r(-1.2, 1.2), sy = sin(hd) * 1.2 + R.r(-1.2, 1.2);
    const w0 = [sx + cos(hd + PI / 2) * 13, sy + sin(hd + PI / 2) * 13];
    const host = ground(B, waveAt(w0[0], w0[1], 4, 2).map(p => [p[0], p[1]]), { role: 'the sea', lod: 1 });
    if (square) trader(B, R, sx, sy, L, hd, host); else dhow(B, R, sx, sy, L, hd, host);
    // the waves, crests across the view, clear of the hull and the wake
    const c = cos(hd), s = sin(hd), clear = (x, y) => { const u = (x - sx) * c + (y - sy) * s, v = -(x - sx) * s + (y - sy) * c; return abs(v) > L * .24 + 2.5 || u > L * .62 || u < -L * 1.1; };
    for (let k = 0, n = 0; k < 24 && n < 7; k++) {
      const x = R.r(-19, 19), y = R.r(-17, 17), ws = R.r(3.4, 5.6);
      if (room(x, y, 22.4) < ws * .6 || !clear(x, y) || !clear(x + EH[0] * ws / 2, y + EH[1] * ws / 2) || !clear(x - EH[0] * ws / 2, y - EH[1] * ws / 2)) continue;
      B.mark(waveAt(x, y, ws, R.pick([1, 2, 2])), { on: host, lod: n % 3 === 2 ? 2 : 1 });
      B.mark([[x - EH[0] * ws * .3 - EU[0] * .9, y - EH[1] * ws * .3 - EU[1] * .9, 0], [x + EH[0] * ws * .3 - EU[0] * .9, y + EH[1] * ws * .3 - EU[1] * .9, 0]], { on: host, lod: 2 });
      n++;
    }
  }, { tier: 'tile', masks: false, word: 'ship' });
})();
