/*
 * The land and the stages of the Story Map: the open country a tale passes through (the
 * desert, an oasis, a pass in the mountains, an island, the open sea, a camp, a caravan on
 * the road), the legendary sites (the cave of the forty thieves, Iram of the Columns, a
 * fortress on its crag), the landscapes of the other books (the Appalachian forest and the
 * townhouse mound of the Cherokee, the Zuni mesa, the Hawaiian shield volcano, the Tuscan
 * villa of the Decameron, the Doric temple of the Odyssey) and the room every indoor scene
 * stands in.
 *
 * The habits are those of iso-kinds-core.js. Terrain is built from several convex solids
 * (a mountain is two to four faceted peaks, a mesa is its talus and its cliff), never one
 * blob. What a convex solid cannot show (a dune's crescent, a stream, a field, the sea) is a
 * plate. Surface detail (ridges, strata, furrows, waves, the cloths of a sail) is marks, and
 * a mark on a slope is turned away with the face it lies on.
 *
 * The small parts (after Anatomy, github.com/wheresryan22/anatomy, MIT): at 1x each stage is one
 * clear scene; at 4x every region has something true to find. Detail comes from the real parts a
 * place has (kerbs and sluices, guy ropes on their stakes, strakes and cleats, drum joints, leaf
 * scars), each sitting on another part, nearly all of it lod 2. A texture ends on a real edge or
 * fades: ripple fields and wave troughs shorten to nothing, strata wrap a face to its silhouette,
 * furrows end on the bund. Ground detail lives on a plate laid at z -0.12, which the paint order
 * puts under everything that stands on it. Rings round round things are short runs with their own
 * normals, never an axis, so they stay right when a scene moves and scales the model.
 */
(() => {
  'use strict';
  const { def, fromPts, inset, hull, rrect, inConvex } = ISO;
  const TAU = Math.PI * 2, PI = Math.PI, { cos, sin, abs, hypot, max, min, pow, sqrt, round } = Math;
  const lerp = (a, b, t) => a + (b - a) * t;
  const S2 = Math.SQRT1_2;
  /* On the ground, EH runs across the eye's view (to the right) and EU away from the eye. */
  const EH = [S2, -S2], EU = [-S2, -S2];

  /* ---------- outlines on the ground (plain [x, y] points) ---------- */
  const rotP = (x, y, a, cx = 0, cy = 0) => { const c = cos(a), s = sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  /* an ellipse of n points, turned by rot */
  const ell = (cx, cy, rx, ry, n = 16, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; o.push(rotP(cx + rx * cos(a), cy + ry * sin(a), rot, cx, cy)); } return o; };
  /* an ellipse whose radius wanders a little, vertex by vertex (keeps its count, for layered solids) */
  const wob = (R, cx, cy, rx, ry, n = 10, jit = .1, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU, f = 1 + R.r(-jit, jit); o.push(rotP(cx + rx * f * cos(a), cy + ry * f * sin(a), rot, cx, cy)); } return o; };
  const lerpPoly = (A, Bq, t) => A.map((p, i) => [lerp(p[0], Bq[i][0], t), lerp(p[1], Bq[i][1], t)]);
  const at = (P, z) => P.map(p => [p[0], p[1], z]);
  const closed = P => P.concat([P[0]]);
  const add2 = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  /* a smooth curve through points (Catmull-Rom), per samples a span; works for 2D and 3D */
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
  /* a band of width w0 to w1 along a centre line: a stream, a road, a channel */
  function ribbon(pts, w0, w1 = w0) {
    const A = [], C = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = lerp(w0, w1, i / (n - 1)) / 2;
      A.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); C.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    return { poly: A.concat(C.slice().reverse()), left: A, right: C };
  }
  /* parallel strokes across an outline, sp apart, running at angle ang: furrows, paving, hatching */
  function hatch(poly, ang, sp, off = .5) {
    const dx = cos(ang), dy = sin(ang), nx = -dy, ny = dx, out = [];
    let lo = 1e9, hi = -1e9; for (const p of poly) { const s = p[0] * nx + p[1] * ny; lo = min(lo, s); hi = max(hi, s); }
    for (let s = lo + sp * off; s < hi; s += sp) {
      const ts = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], sa = a[0] * nx + a[1] * ny - s, sb = b[0] * nx + b[1] * ny - s;
        if ((sa > 0) === (sb > 0)) continue;
        const k = sa / (sa - sb); ts.push((a[0] + (b[0] - a[0]) * k) * dx + (a[1] + (b[1] - a[1]) * k) * dy);
      }
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) out.push([[nx * s + dx * ts[i], ny * s + dy * ts[i]], [nx * s + dx * ts[i + 1], ny * s + dy * ts[i + 1]]]);
    }
    return out;
  }
  /* ---------- solids from layers ---------- */
  /* sol(B, [[points, z], ...], {role, lod, crease}): the hull of its layers; crease draws the dim line inside the top */
  function sol(B, layers, o = {}) {
    const top = layers[layers.length - 1][0];
    return B.add({ L: layers.map(([p, z]) => [fromPts(p), z]), inner: o.crease && top.length > 2 ? inset(fromPts(top), o.crease) : null, role: o.role, lod: o.lod || 0 });
  }
  /* the height of a layered solid's surface over (x, y), for setting things on a slope (layers of equal count) */
  function heightIn(layers, x, y) {
    if (!inConvex(layers[0][0], x, y)) return layers[0][1];
    let z = layers[0][1];
    for (let i = 0; i < layers.length - 1; i++) {
      const [A, za] = layers[i], [Bq, zb] = layers[i + 1];
      if (inConvex(Bq, x, y)) { z = zb; continue; }
      let lo = 0, hi = 1;
      for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (inConvex(lerpPoly(A, Bq, m), x, y)) lo = m; else hi = m; }
      return lerp(za, zb, lo);
    }
    return z;
  }
  /* the cross-section of a layered solid at height z (layers of equal count) */
  function sectionAt(layers, z) {
    for (let i = 0; i < layers.length - 1; i++) {
      const [A, za] = layers[i], [Bq, zb] = layers[i + 1];
      if (z <= zb) return lerpPoly(A, Bq, (z - za) / (zb - za || 1));
    }
    return layers[layers.length - 1][0].slice();
  }
  /* shade(B, part, layers, [cx, cy], {zHi, zLo, every}): the faces of a layered solid turned away from
     the light (to the right of the view) hatched with close fall lines, the rest left clean */
  function shade(B, part, layers, ctr, o = {}) {
    const base = layers[0][0], n = base.length, z0 = layers[0][1], zt = layers[layers.length - 1][1];
    const zHi = o.zHi == null ? lerp(z0, zt, .9) : o.zHi, zLo = o.zLo == null ? lerp(z0, zt, .06) : o.zLo, zMid = lerp(zLo, zHi, .55);
    const S0 = sectionAt(layers, zLo);
    for (let i = 0; i < n; i++) {
      const m = lerp2(base[i], base[(i + 1) % n], .5), dx = m[0] - ctr[0], dy = m[1] - ctr[1], d = hypot(dx, dy) || 1;
      const right = (dx * S2 - dy * S2) / d;
      if (right < (o.min == null ? .2 : o.min)) continue;
      const k = right > .6 ? (o.dense || 7) : 4;
      for (let j = 1; j < k; j++) {
        const t = j / k, zt2 = o.flat ? zHi : lerp(zHi, zMid, abs(t - .5) * 1.4), S1 = sectionAt(layers, zt2);
        const a = lerp2(S1[i], S1[(i + 1) % n], t), b = lerp2(S0[i], S0[(i + 1) % n], t);
        surf(B, part, [[a[0], a[1], zt2], [b[0], b[1], zLo]], ctr, { radial: true, slope: o.slope || .5, lod: j % 2 ? 1 : 2 });
      }
    }
  }
  /* where a ray from (cx, cy) at angle a leaves an outline */
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
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  /* surf(B, part, pts3, [cx, cy], {slope, radial, cls, lod}): a drawing on a solid's surface, each
     stroke shown only while the face under it turns toward the eye. A contour (strata, a snow line)
     faces across its run; a fall line (a ridge, a gully) faces along it, out from the centre. */
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

  /* ---------- the furniture of open country ---------- */
  /* a boulder: an irregular faceted stone, broad in the middle */
  function rock(B, R, cx, cy, r, h, o = {}) {
    const n = R.i(5, 7), rot = R() * TAU, z = o.z || 0, a0 = R() * TAU;
    const ox = R.r(-.3, .3) * r, oy = R.r(-.3, .3) * r;
    const layers = [
      [hull(wob(R, cx, cy, r, r * R.r(.65, .95), n, .18, rot, a0)), z],
      [hull(wob(R, cx + ox * .4, cy + oy * .4, r * .88, r * .72, n, .12, rot, a0)), z + h * .45],
      [hull(wob(R, cx + ox, cy + oy, r * R.r(.3, .5), r * R.r(.25, .42), max(3, n - 2), .2, rot, a0)), z + h],
    ];
    const p = sol(B, layers, { role: o.role || 'the rocks', lod: o.lod == null ? 1 : o.lod });
    // up close: the bedding of the stone round its face, and a crack down it toward the eye
    if (o.plain !== true && r > 1.2) {
      const c = [cx + ox * .4, cy + oy * .4];
      strata(B, p, layers, c, [z + h * R.r(.22, .3), z + h * R.r(.56, .66)], { n: 16, slope: .35, lod: 2 });
      fall(B, p, layers, c, PI / 4 + R.r(-.7, .7), z + h * .92, z + h * .08, { k: 3, wander: .12, slope: .4, lod: 2 });
    }
    p.layers = layers;
    return p;
  }
  /* a date palm in two strokes: the leaning trunk, and the crown drawn out and back frond by frond */
  function palm(B, R, x, y, h, o = {}) {
    const role = o.role || 'the palms', lod = o.lod == null ? 1 : o.lod, z0 = o.z || 0;
    const la = o.dir == null ? R() * TAU : o.dir, lean = (o.lean == null ? .1 : o.lean) * h;
    const tx = x + cos(la) * lean, ty = y + sin(la) * lean, tz = z0 + h, top = [tx, ty, tz];
    // from afar the trunk is one stroke; up close it is a tapering column. The stroke runs down the column's
    // left silhouette, so whichever is painted last the two read as one outline.
    const r0 = o.trunk || max(.4, min(.85, h * .031)), rb = r0 * 1.25, rt = r0 * .8;
    B.line([[x - EH[0] * rb, y - EH[1] * rb, z0], [tx - EH[0] * rt, ty - EH[1] * rt, tz - .2]], { role, lod });
    const trunkAt = t => [lerp(x, tx, t), lerp(y, ty, t), lerp(z0, tz - .2, t)];
    const tr = sol(B, [[ell(x, y, rb, rb, 10), z0], [ell(tx, ty, rt, rt, 10), tz - .2]], { role, lod: max(lod, 1) });
    // the leaf scars, ring above ring up the trunk in a shallow zigzag, seen on its near side
    const nsc = max(5, round(h / 1.25));
    for (let i = 1; i < nsc; i++) { const t = i / nsc, c = trunkAt(t), rr = lerp(rb, rt, t); hoop(B, tr, c[0], c[1], rr, c[2], { n: 12, zig: .16, lod: 2 }); }
    const n = o.fronds || 12, a0 = R() * TAU, pts = [top], leaf = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + R.r(-.2, .2), L = h * R.r(.3, .38) * (o.spread || 1), dr = R.r(.18, .55) * (o.droop || 1), up = R.r(.08, .2), c = cos(a), s = sin(a);
      const f1 = [tx + c * L * .3, ty + s * L * .3, tz + L * up], f2 = [tx + c * L * .6, ty + s * L * .6, tz + L * (up * .85 - dr * .12)], f3 = [tx + c * L * .84, ty + s * L * .84, tz + L * (up * .2 - dr * .5)], f4 = [tx + c * L, ty + s * L, tz - L * dr];
      pts.push(f1, f2, f3, f4, f3, f2, f1, top);
      // the leaflets, paired down the rib and shortening toward its tip
      for (const [p, q, k] of [[f1, f2, .13], [f2, f2, .12], [lerp3(f2, f3, .5), f3, .1], [f3, f3, .08], [lerp3(f3, f4, .5), f4, .05]]) for (const sd of [-1, 1]) leaf.push([p, [p[0] + (c * .4 - s * sd) * L * k, p[1] + (s * .4 + c * sd) * L * k, p[2] - L * k]]);
    }
    const cr = B.line(pts, { role, lod });
    leaf.forEach((m, i) => B.mark(m, { on: cr, cls: 'lo', lod: 2 }));
    // under the crown, the old frond bases and, on a grown palm, the hanging bunches of dates
    for (let k = 0; k < 5; k++) { const a = a0 + k / 5 * TAU + .3; B.mark([[tx + cos(a) * r0 * .9, ty + sin(a) * r0 * .9, tz - .3], [tx + cos(a) * r0 * 2.2, ty + sin(a) * r0 * 2.2, tz - 1.6]], { on: cr, cls: 'lo', lod: 2 }); }
    if (h > 15 && o.dates !== false) for (let k = 0; k < 2; k++) {
      const a = PI / 4 + (k ? .9 : -.9) + R.r(-.3, .3), c = [tx + cos(a) * r0 * 2, ty + sin(a) * r0 * 2], zz = tz - 1.1, E = (u, dz) => [c[0] + EH[0] * u, c[1] + EH[1] * u, zz + dz];
      B.mark([[tx, ty, tz - .2], E(0, 0)], { on: cr, cls: 'lo', lod: 2 });
      B.mark([E(-.7, 0), E(-.55, -1.1), E(0, -1.9), E(.55, -1.1), E(.7, 0)], { on: cr, closed: true, cls: 'lo', lod: 2 });
    }
    cr.trunk = tr;
    return cr;
  }
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  /* a broadleaf tree (oak, chestnut, tulip poplar, the sidr of the shrines): a round crown on a trunk
     drawn as a mark; o.clumps adds smaller crowns on its shoulders, so a lone tree reads as foliage */
  function leafy(B, R, x, y, h, o = {}) {
    const role = o.role || 'the trees', lod = o.lod == null ? 1 : o.lod, z0 = o.z || 0, zc = o.zc == null ? z0 + h * .32 : o.zc;
    const r = o.r || h * .3, n = 16, rot = R() * TAU, H = z0 + h - zc, sq = o.sq || 1;
    const cx = x + R.r(-.6, .6), cy = y + R.r(-.6, .6);
    const crown = (px, py, rr, zb, hh, l) => sol(B, [
      [wob(R, px, py, rr * .58, rr * .52 * sq, n, .05, rot), zb],
      [wob(R, px, py, rr, rr * .92 * sq, n, .05, rot), zb + hh * .38],
      [wob(R, px, py, rr * .78, rr * .72 * sq, n, .06, rot), zb + hh * .76],
      [wob(R, px, py, rr * .3, rr * .26 * sq, n, .08, rot), zb + hh],
    ], { role, lod: l });
    const k = o.clumps || 0, sub = [];
    for (let i = 0; i < k; i++) { const a = R() * TAU, d = r * R.r(.55, .75); sub.push([cx + cos(a) * d, cy + sin(a) * d * sq, r * R.r(.5, .62), zc + H * R.r(.2, .45), H * R.r(.45, .6)]); }
    // a tree that matters stands on a real trunk, flared at the root; the others on a stroke under the crown
    let tk = null;
    if (o.trunk) { const tr = o.trunk; tk = B.lathe(x, y, [[tr * 1.7, z0], [tr * 1.15, z0 + .9], [tr, z0 + (zc - z0) * .5], [tr * .85, zc + .04]], { n: 14, role, lod }); }
    const c = crown(cx, cy, r, zc, H, lod);
    for (const [px, py, rr, zb, hh] of sub) crown(px, py, rr, zb, hh, max(lod, 1));
    if (tk) { const tr = o.trunk; for (const a of [PI * .1, PI * .4]) B.mark([[x + cos(a) * tr * 1.6, y + sin(a) * tr * 1.6, z0 + .05], [x + cos(a) * tr * 1.02, y + sin(a) * tr * 1.02, z0 + (zc - z0) * .45], [x + cos(a) * tr * .86, y + sin(a) * tr * .86, zc]], { on: tk, n: [cos(a), sin(a), .1], lod: 2 }); }
    else B.mark([[x, y, z0], [cx, cy, zc + .4]], { on: c, cls: 'edge', lod: 1 });
    // the leaf masses: small scallops over the crown, each seen only while its side of the crown faces the eye
    if (o.leaves !== false) {
      const nl = o.leaves || 11;
      for (let j = 0; j < nl; j++) {
        const a = PI / 4 + (j / nl - .5) * PI * 1.9 + R.r(-.15, .15), f = j % 3 === 0 ? .82 : j % 3 === 1 ? .62 : .42, zz = zc + H * f, rr = r * (f > .7 ? .72 : f > .5 ? .94 : .92) * .98, ca = cos(a), sa = sin(a), p = [cx + ca * rr, cy + sa * rr * sq], w = r * (f > .7 ? .16 : .22);
        const tx2 = -sa, ty2 = ca;
        B.mark([[p[0] - tx2 * w, p[1] - ty2 * w, zz + H * .02], [p[0] - tx2 * w * .45, p[1] - ty2 * w * .45, zz - H * .045], [p[0] + tx2 * w * .45, p[1] + ty2 * w * .45, zz - H * .045], [p[0] + tx2 * w, p[1] + ty2 * w, zz + H * .02]], { on: c, n: [ca * .8, sa * .8, f > .7 ? .7 : .35], lod: 2 });
      }
      // the shadow line under the crown, where the leaves turn under
      const und = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU, rr = r * .74; und.push([cx + cos(a) * rr, cy + sin(a) * rr * sq, zc + H * .12 + sin(k * 2.7) * H * .02]); }
      ringMark(B, c, und, [cx, cy], { lod: 2, nz: -.2 });
    }
    return c;
  }
  /* a conifer (hemlock, spruce, pine): two or three stacked cones, the trunk a mark below */
  function conifer(B, R, x, y, h, o = {}) {
    const role = o.role || 'the trees', lod = o.lod == null ? 1 : o.lod, z0 = o.z || 0, zc = o.zc == null ? z0 + h * .14 : o.zc;
    const H = z0 + h - zc, r = o.r || h * .22, tiers = o.tiers || 3;
    const T = tiers === 3 ? [[0, .52, 1], [.3, .78, .72], [.56, 1, .46]] : [[0, .62, 1], [.42, 1, .64]];
    let first = null, ph = R() * TAU;
    for (const [a, b, f] of T) {
      const p = B.cone(x, y, r * f, zc + H * a, zc + H * b, { n: 14, tip: .1, role, lod }); first = first || p;
      // the bough tips round the skirt of each tier, and the boughs falling to them on the side in view
      const rr = r * f, zb = zc + H * a, zt = zc + H * b, sk = [];
      for (let k = 0; k <= 22; k++) { const ang = k / 22 * TAU; sk.push([x + cos(ang) * rr * (k % 2 ? .9 : 1), y + sin(ang) * rr * (k % 2 ? .9 : 1), zb + (k % 2 ? H * .03 : 0)]); }
      ringMark(B, p, sk, [x, y], { lod: 2, nz: .3 });
      for (let k = 0; k < 4; k++) { const ang = PI / 4 + (k - 1.5) * .55 + sin(ph + k) * .12, ca = cos(ang), sa = sin(ang); B.mark([[x + ca * rr * .3, y + sa * rr * .3, zb + (zt - zb) * .66], [x + ca * rr * .64, y + sa * rr * .64, zb + (zt - zb) * .32], [x + ca * rr * .96, y + sa * rr * .96, zb + H * .015]], { on: p, n: [ca * .9, sa * .9, .45], lod: 2 }); }
    }
    B.mark([[x, y, z0], [x, y, zc + .4]], { on: first, cls: 'edge', lod: 1 });
    return first;
  }
  /* a cypress, the flame-shaped tree of Tuscany and of the cemeteries */
  function cypress(B, R, x, y, h, o = {}) {
    const z0 = o.z || 0, w = h * (o.w || .13);
    return B.lathe(x, y, [[w * .7, z0], [w, z0 + h * .22], [w * .92, z0 + h * .5], [w * .55, z0 + h * .8], [0, z0 + h]], { n: 12, role: o.role || 'the cypresses', lod: o.lod == null ? 1 : o.lod });
  }
  /* an umbrella acacia: a crooked trunk forking into a flat, wide crown, the tree of the open desert */
  function acacia(B, R, x, y, h, o = {}) {
    const role = o.role || 'the acacia', lod = o.lod == null ? 1 : o.lod, z0 = o.z || 0, cz = z0 + h * .8, r = h * R.r(.5, .58);
    const fx = x + R.r(-1.5, 1.5), fy = y + R.r(-1.5, 1.5), fz = z0 + h * .38, pts = [[x, y, z0], [fx, fy, fz]];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + R.r(-.3, .3), rr = r * R.r(.45, .7); pts.push([fx + cos(a) * rr * .4, fy + sin(a) * rr * .4, lerp(fz, cz, .55)], [fx + cos(a) * rr, fy + sin(a) * rr, cz + .2], [fx + cos(a) * rr * .4, fy + sin(a) * rr * .4, lerp(fz, cz, .55)], [fx, fy, fz]); }
    B.line(pts, { role, lod, w: 1.6 });
    // the canopy in two flat tiers, the upper smaller and set to one side
    const rot = R() * TAU, ux = fx + R.r(-.2, .2) * r, uy = fy + R.r(-.2, .2) * r;
    const c = sol(B, [[wob(R, fx, fy, r * .8, r * .66, 12, .1, rot), cz], [wob(R, fx, fy, r, r * .82, 12, .12, rot), cz + h * .06], [wob(R, fx, fy, r * .86, r * .7, 12, .1, rot), cz + h * .11]], { role, lod });
    sol(B, [[wob(R, ux, uy, r * .5, r * .42, 10, .1, rot), cz + h * .1], [wob(R, ux, uy, r * .58, r * .48, 10, .12, rot), cz + h * .16], [wob(R, ux, uy, r * .42, r * .34, 10, .1, rot), cz + h * .21]], { role, lod: max(lod, 1) });
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rot, rr = r * R.r(.55, .8), px = fx + cos(a) * rr, py = fy + sin(a) * rr * .82; B.mark([[px - EH[0] * 1.2, py - EH[1] * 1.2, cz + h * .115], [px, py, cz + h * .09], [px + EH[0] * 1.2, py + EH[1] * 1.2, cz + h * .115]], { on: c, lod: 2 }); }
    // the scalloped rim of the flat crown where its sprays of leaves end, seen on the side in view
    const rim2 = []; for (let k = 0; k <= 28; k++) { const a = k / 28 * TAU, rr = r * (k % 2 ? .93 : 1) * .99; rim2.push([fx + cos(a) * rr, fy + sin(a) * rr * .82, cz + h * .06 + (k % 2 ? -.25 : 0)]); }
    ringMark(B, c, rim2, [fx, fy], { lod: 2 });
    return c;
  }
  /* a log or a fallen column drum lying on the ground, length L, radius r, along angle a */
  function log(B, x, y, L, r, a, o = {}) {
    const ux = cos(a), uy = sin(a), vx = -uy, vy = ux, z0 = o.z || 0, layers = [];
    for (const ph of [0, .25, .5, .75, 1]) {
      const z = z0 + r * (1 - cos(ph * PI)), w = max(.08, r * sin(ph * PI));
      layers.push([[[x - ux * L / 2 - vx * w, y - uy * L / 2 - vy * w], [x + ux * L / 2 - vx * w, y + uy * L / 2 - vy * w], [x + ux * L / 2 + vx * w, y + uy * L / 2 + vy * w], [x - ux * L / 2 + vx * w, y - uy * L / 2 + vy * w]], z]);
    }
    const p = sol(B, layers, { role: o.role, lod: o.lod });
    // the bark (or the drum's tooling) in lines from end to end along its upper side
    for (const ph of o.bark || [.32, .5, .68]) { const z = z0 + r * (1 - cos(ph * PI)), w = r * sin(ph * PI) * 1.02; for (const sd of [-1, 1]) if (ph !== .5 || sd > 0) B.mark([[x - ux * L / 2 + vx * w * sd * (ph === .5 ? 0 : 1), y - uy * L / 2 + vy * w * sd * (ph === .5 ? 0 : 1), z], [x + ux * L / 2 + vx * w * sd * (ph === .5 ? 0 : 1), y + uy * L / 2 + vy * w * sd * (ph === .5 ? 0 : 1), z]], { on: p, n: [vx * sd * (ph === .5 ? 0 : .7), vy * sd * (ph === .5 ? 0 : .7), .7], lod: 2 }); }
    // the end that faces the eye shows its rings
    for (const sgn of [1, -1]) {
      const ex = x + ux * L / 2 * sgn, ey = y + uy * L / 2 * sgn;
      for (const f of o.rings || [1, .55]) { const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16 * TAU; pts.push([ex + vx * r * f * cos(t), ey + vy * r * f * cos(t), z0 + r + r * f * sin(t)]); } B.mark(pts, { on: p, n: [ux * sgn, uy * sgn, 0], lod: f === 1 ? 1 : 2 }); }
    }
    return p;
  }
  /* a wave on open water: humps across the eye's view, s long */
  function waveAt(x, y, s, k = 2, z = 0) {
    const pts = [], n = 5 * k;
    for (let i = 0; i <= n; i++) { const t = i / n, along = (t - .5) * s, up = abs(sin(t * k * PI)) * (s / k) * .5; pts.push([x + EH[0] * along + EU[0] * up, y + EH[1] * along + EU[1] * up, z]); }
    return pts;
  }
  /* the shine on still water: short strokes across the eye's view, inside an ellipse */
  function shine(B, part, R, cx, cy, rx, ry, n, z, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = sqrt(R()) * .85, x = cx + cos(a) * rx * d, y = cy + sin(a) * ry * d, l = R.r(1.6, 4) * (o.len || 1);
      B.mark([[x - EH[0] * l / 2, y - EH[1] * l / 2, z], [x + EH[0] * l / 2, y + EH[1] * l / 2, z]], { on: part, lod: i % 3 === 2 ? 2 : (o.lod || 1) });
    }
  }
  /* glints along running water: short level strokes scattered down a centre line */
  function streamShine(B, part, R, pts, w, z, every = 3) {
    for (let i = 1; i < pts.length - 1; i += every) {
      const p = pts[i], q = pts[i + 1], d = hypot(q[0] - p[0], q[1] - p[1]) || 1, off = R.r(-.3, .3) * w, x = p[0] - (q[1] - p[1]) / d * off, y = p[1] + (q[0] - p[0]) / d * off, l = R.r(1.4, 2.6);
      B.mark([[x - EH[0] * l / 2, y - EH[1] * l / 2, z], [x + EH[0] * l / 2, y + EH[1] * l / 2, z]], { on: part, lod: i % (every * 2) === 1 ? 1 : 2 });
    }
  }
  /* the sea: a plate within the plinth, its waves as marks (avoid: [x, y, r] circles left calm) */
  function seaPlate(B, R, o = {}) {
    const e = o.e || 48, sea = B.plate(rrect(-e, -e, e, e, o.r || 16, 4).map(q => [q.u, q.v, 0]), { role: o.role || 'the sea', cls: 'lo', lod: 0 });
    const avoid = o.avoid || [], n = o.n || 34;
    let placed = 0;
    for (let tries = 0; tries < n * 6 && placed < n; tries++) {
      const x = R.r(-e + 6, e - 6), y = R.r(-e + 6, e - 6);
      if (avoid.some(([ax, ay, ar, ary]) => hypot((x - ax) / ar, (y - ay) / (ary || ar)) < 1)) continue;
      const ws = R.r(4, 7), wk = R.pick([1, 2, 2, 3]);
      B.mark(waveAt(x, y, ws, wk), { on: sea, lod: placed % 3 === 2 ? 2 : 1 });
      // the troughs behind each crest, shorter and shorter, so the wave fades back into the sea
      for (const [f, d] of [[.62, .9], [.3, 1.7]]) B.mark([[x - EH[0] * ws * f / 2 - EU[0] * d, y - EH[1] * ws * f / 2 - EU[1] * d, 0], [x + EH[0] * ws * f / 2 - EU[0] * d, y + EH[1] * ws * f / 2 - EU[1] * d, 0]], { on: sea, lod: 2 });
      placed++;
    }
    // the long swell under the waves, in rows that shorten to nothing at either side
    for (let k = 0; k < 2; k++) { const x = R.r(-e * .5, e * .5), y = R.r(-e * .5, e * .5); if (avoid.some(([ax, ay, ar, ary]) => hypot((x - ax) / ar, (y - ay) / (ary || ar)) < 1.1)) continue; ripples(B, sea, R, x, y, Math.atan2(EH[1], EH[0]), 3, e * .45, 3.4, 0, { amp: .45, lam: 9 }); }
    return sea;
  }

  /* ---------- the small parts of open country ----------
   * Anatomy's 4x rule (github.com/wheresryan22/anatomy, MIT): at 1x one clear scene, at 4x every
   * region has something true to find. Each part sits on another part, and a texture ends on a real
   * edge or fades (rows that shorten to nothing). Flat detail is marks; things with volume are small
   * solids, nearly all of them lod 2. */
  const clamp01 = v => max(0, min(1, v));
  /* the outline of a layered convex solid at height z, found along rays from ctr (layers may differ in count) */
  function ringAt(layers, ctr, z, n = 24, a0 = 0) {
    let i = 0; while (i < layers.length - 2 && z > layers[i + 1][1]) i++;
    const [A, za] = layers[i], [Bq, zb] = layers[i + 1], t = clamp01((z - za) / (zb - za || 1)), out = [];
    const hitOf = (P, a) => { if (P.length > 2) return rayHit(P, ctr[0], ctr[1], a); let mx = 0, my = 0; for (const p of P) { mx += p[0]; my += p[1]; } return [mx / P.length, my / P.length]; };
    for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; out.push(lerp2(hitOf(A, a), hitOf(Bq, a), t)); }
    return out;
  }
  /* strata: contour lines round a layered solid at each height, drawn only where the face turns to the
     eye, so each one wraps the face and ends on the silhouette */
  function strata(B, part, layers, ctr, zs, o = {}) {
    zs.forEach((z, i) => {
      const ring = ringAt(layers, ctr, z, o.n || 30, o.a0 || 0), w = o.wave || 0;
      const pts = closed(ring).map((p, k) => [p[0], p[1], z + (w ? sin(k * 1.9 + i * 2.3) * w : 0)]);
      surf(B, part, pts, ctr, { slope: o.slope == null ? .3 : o.slope, cls: typeof o.cls === 'function' ? o.cls(i) : (o.cls || 'lo'), lod: typeof o.lod === 'function' ? o.lod(i) : (o.lod == null ? 2 : o.lod) });
    });
  }
  /* a fall line down a layered solid at angle a from its centre, from height z1 to z0 (a crack, a gully, a joint) */
  function fall(B, part, layers, ctr, a, z1, z0, o = {}) {
    const pts = [], k = o.k || 4;
    for (let i = 0; i <= k; i++) { const z = lerp(z1, z0, i / k), p = ringAt(layers, ctr, z, 1, a + (o.wander ? sin(i * 2.1) * o.wander : 0))[0]; pts.push([p[0], p[1], z]); }
    surf(B, part, pts, ctr, { radial: true, slope: o.slope == null ? .4 : o.slope, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
  }
  /* ripples: rows of sinuous lines across ang, gap apart, the middle rows longest and the outer rows
     shortening to nothing, so the field fades out instead of stopping */
  function ripples(B, host, R, cx, cy, ang, rows, len, gap, z, o = {}) {
    const ux = cos(ang), uy = sin(ang), vx = -uy, vy = ux, mid = (rows - 1) / 2, amp = o.amp == null ? gap * .2 : o.amp, lam = o.lam || gap * 3.2;
    for (let r = 0; r < rows; r++) {
      const f = rows > 1 ? abs(r - mid) / (mid + .6) : 0, L = len * pow(max(0, 1 - f * f), .6) * R.r(.82, 1.08);
      if (L < gap * .9) continue;
      const sh = R.r(-.12, .12) * len, ph = R() * TAU, n = max(4, round(L / (lam / 4))), pts = [];
      for (let i = 0; i <= n; i++) {
        const u = -L / 2 + L * i / n, env = sin(PI * i / n), v = (r - mid) * gap + amp * sin(u / lam * TAU + ph) * (.4 + .6 * env);
        pts.push([cx + ux * (u + sh) + vx * v, cy + uy * (u + sh) + vy * v, typeof z === 'function' ? z(cx + ux * (u + sh) + vx * v, cy + uy * (u + sh) + vy * v) : z]);
      }
      B.mark(pts, { on: host, cls: o.cls || 'lo', lod: o.lod1 && r === round(mid) ? 1 : (o.lod == null ? 2 : o.lod) });
    }
  }
  /* where the segment a-b crosses a polygon's edge (a inside, b outside) */
  function clipTo(poly, a, b) {
    let best = 1;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], dx = b[0] - a[0], dy = b[1] - a[1], den = dx * ey - dy * ex;
      if (abs(den) < 1e-9) continue;
      const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) best = min(best, t);
    }
    return lerp2(a, b, best);
  }
  /* cracked earth (dried mud, a salt pan, flagstones): a jittered brick net, so the cracks meet in
     T-junctions, every crack ending on another crack or on the edge of the patch */
  function cracks(B, host, R, poly, z, cell, o = {}) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of poly) { x0 = min(x0, p[0]); y0 = min(y0, p[1]); x1 = max(x1, p[0]); y1 = max(y1, p[1]); }
    const ang = o.ang || 0, c = cos(ang), s = sin(ang), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = hypot(x1 - x0, y1 - y0) / 2;
    const nx = Math.ceil(ext * 2 / cell) + 1, ny = Math.ceil(ext * 2 / (cell * (o.aspect || .7))) + 1, N = [];
    for (let i = 0; i <= nx; i++) { N.push([]); for (let j = 0; j <= ny; j++) { const u = -ext + i * cell + R.r(-.28, .28) * cell, v = -ext + j * cell * (o.aspect || .7) + R.r(-.22, .22) * cell * (o.aspect || .7); N[i].push([cx + u * c - v * s, cy + u * s + v * c]); } }
    const inside = p => ISO.inPoly(poly, p[0], p[1]);
    const seg = (a, b, lod) => {
      const ia = inside(a), ib = inside(b);
      if (!ia && !ib) return;
      const A2 = ia ? a : clipTo(poly, b, a), B2 = ib ? b : clipTo(poly, a, b), mm = lerp2(A2, B2, .5), bend = R.r(-.12, .12) * hypot(B2[0] - A2[0], B2[1] - A2[1]);
      const dx = B2[1] - A2[1], dy = A2[0] - B2[0], dl = hypot(dx, dy) || 1;
      B.mark([[A2[0], A2[1], z], [mm[0] + dx / dl * bend, mm[1] + dy / dl * bend, z], [B2[0], B2[1], z]], { on: host, cls: o.cls || 'lo', lod });
    };
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      if (i < nx) seg(N[i][j], N[i + 1][j], o.lod == null ? 2 : o.lod);
      if (j < ny && (i + j) % 2 === 0) seg(N[i][j], N[i][j + 1], o.lod == null ? 2 : o.lod);
    }
  }
  /* pebbles: small stones as closed marks, thinning and shrinking toward the rim of their patch */
  function pebbles(B, host, R, cx, cy, rx, ry, n, z, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = R() * TAU, d = pow(R(), .65), x = cx + cos(a) * rx * d, y = cy + sin(a) * ry * d, sz = R.r(.24, .6) * (1 - d * .55) * (o.s || 1), m = R.i(4, 6), pts = [];
      for (let i = 0; i < m; i++) { const b = i / m * TAU + R() * .5; pts.push([x + cos(b) * sz, y + sin(b) * sz * .8, typeof z === 'function' ? z(x, y) : z]); }
      B.mark(pts, { on: host, closed: true, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
    }
  }
  /* a tuft of desert grass or reeds: blades out from one root, drawn as one stroke out and back */
  function tuft(B, R, x, y, z, h, o = {}) {
    const n = o.n || 7, pts = [[x, y, z]], a0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + R.r(-.3, .3), l = h * R.r(.62, 1), sp = l * (o.spread || .42) * R.r(.6, 1);
      const m = [x + cos(a) * sp * .35, y + sin(a) * sp * .35, z + l * .62], t = [x + cos(a) * sp, y + sin(a) * sp, z + l * R.r(.82, 1)];
      pts.push(m, t, m, [x, y, z]);
    }
    return B.line(pts, { role: o.role || 'the grass', cls: o.cls || 'mid', lod: o.lod == null ? 2 : o.lod });
  }
  /* a stake driven into the ground, where a rope ends */
  function stake(B, x, y, o = {}) { const s = o.s || .2; return B.box(x - s, y - s, x + s, y + s, o.z || 0, (o.z || 0) + (o.h || .85), { r: .08, b: 0, top: s * .25, role: o.role, lod: o.lod == null ? 2 : o.lod }); }
  /* a rope from a to b, sagging by sag in the middle */
  function rope(B, host, a, b, sag, o = {}) {
    const pts = [], k = o.k || 8;
    for (let i = 0; i <= k; i++) { const t = i / k; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]); }
    B.mark(pts, { on: host, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
  }
  /* a closed ring of points round a round body, drawn on its near side: cut into short runs, each with
     the outward normal of its middle, so the ring ends at the silhouette from any side and stays right
     when a scene moves and scales the model (a mark's normal travels with it; an axis would not) */
  function ringMark(B, part, pts, ctr, o = {}) {
    const step = o.step || 2, nz = o.nz || 0;
    for (let k = 0; k + 1 < pts.length; k += step) {
      const run = pts.slice(k, min(pts.length, k + step + 1)), m = run[run.length >> 1], dx = m[0] - ctr[0], dy = m[1] - ctr[1], L = hypot(dx, dy) || 1, ch = sqrt(max(0, 1 - nz * nz));
      B.mark(run, { on: part, n: [dx / L * ch, dy / L * ch, nz], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
    }
  }
  /* a ring of marks round a round solid at height z, seen on its near side (a joint, a hoop, a course) */
  function hoop(B, part, cx, cy, r, z, o = {}) {
    const pts = [], n = o.n || 20; for (let k = 0; k <= n; k++) { const a = k / n * TAU; pts.push([cx + cos(a) * r, cy + sin(a) * r, z + (o.zig ? (k % 2 ? o.zig : -o.zig) : 0)]); }
    ringMark(B, part, pts, [cx, cy], { cls: o.cls, lod: o.lod, step: o.zig ? 2 : 2, nz: o.nz });
  }
  /* upright joints round a round solid between z0 and z1 (flutes, staves, the stones of a curb), on its near side */
  function staves(B, part, cx, cy, r, z0, z1, n, o = {}) {
    for (let k = 0; k < n; k++) { const a = (k + (o.off || 0)) / n * TAU, ca = cos(a), sa = sin(a), r1 = r * (o.top == null ? 1 : o.top); B.mark([[cx + ca * r, cy + sa * r, z0], [cx + ca * r1, cy + sa * r1, z1]], { on: part, n: [ca, sa, 0], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod }); }
  }

  /* ---------- the puppets: cut-outs that always face the eye (u -0.5..0.5, v 0..1, facing right) ---------- */
  const leg = (u, top, w = .06, knee = 0) => [[u - w / 2, top], [u + w / 2, top], [u + w / 2 - .005, .3], [u + w / 2 - .01 + knee, .04], [u + w / 2 + .02 + knee, 0], [u - w / 2 + knee, 0], [u - w / 2 + knee, .04], [u - w / 2 + .005, .3]];
  /* drawn in camel units (rump at x 0, muzzle at x 130; ground y 0, hump y 100), then fitted to the unit box */
  const CU = (pts, W = 130) => pts.map(([x, y]) => [x / W - .5, y / 100]);
  const CAMEL = {
    legs: [
      CU([[20, 50], [28, 50], [28, 36], [27, 28], [29, 4], [33, 0], [24, 0], [25, 4], [24, 28], [22, 36]]),
      CU([[60, 48], [67, 48], [65, 34], [66, 28], [65, 4], [69, 0], [60, 0], [61, 4], [61, 28], [60, 34]]),
      CU([[12, 52], [22, 50], [21, 36], [19, 28], [20, 4], [24, 0], [15, 0], [16, 4], [15, 28], [14, 36]]),
      CU([[66, 50], [74, 52], [72, 34], [73, 28], [72, 4], [76, 0], [67, 0], [68, 4], [68, 28], [67, 34]]),
    ],
    tail: CU([[8, 70], [3, 58], [2, 46], [5, 45], [6, 56], [10, 68]]),
    body: CU([[8, 72], [5, 66], [6, 58], [12, 52], [16, 48], [22, 46], [36, 44], [50, 44], [66, 47], [74, 52], [78, 60], [80, 64], [88, 60], [98, 62], [104, 70], [108, 78], [112, 84], [122, 84], [128, 88], [127, 92], [118, 96], [112, 96], [108, 92], [102, 82], [96, 72], [88, 70], [78, 76], [66, 88], [54, 100], [40, 98], [28, 88], [18, 78]]),
    load: CU([[24, 58], [22, 92], [28, 104], [68, 104], [74, 92], [72, 58]]),
    loadLines: [CU([[23, 78], [73, 78]]), CU([[48, 104], [48, 58]])],
    litter: CU([[24, 80], [24, 112], [30, 124], [48, 134], [66, 124], [72, 112], [72, 80]]),
    litterLines: [CU([[24, 112], [72, 112]]), CU([[48, 112], [48, 82]])],
    rider: CU([[40, 96], [42, 118], [46, 124], [45, 130], [49, 137], [55, 137], [58, 130], [56, 124], [60, 118], [62, 96]]),
    eye: CU([[115, 92], [117, 92]]),
    // the girth under the load, the halter on the head
    gear: [CU([[46, 58], [47, 45]]), CU([[52, 58], [53, 45]]), CU([[111, 94], [114, 86], [121, 84]]), CU([[117, 96], [120, 85]])],
  };
  const CAMEL_DOWN = {
    body: CU([[4, 0], [2, 18], [6, 34], [16, 46], [30, 60], [44, 66], [58, 60], [70, 50], [78, 54], [86, 66], [92, 80], [96, 90], [100, 96], [108, 98], [118, 92], [120, 86], [110, 84], [102, 82], [96, 72], [90, 56], [86, 44], [84, 30], [90, 16], [94, 8], [92, 0]], 120),
    lines: [CU([[20, 16], [34, 6], [50, 3]], 120), CU([[84, 22], [70, 12], [62, 3]], 120), CU([[109, 93], [111, 93]], 120)],
    // the shadad: the saddle tree over the hump on its blanket, the girth round the belly
    saddle: CU([[28, 57], [31, 71], [36, 68], [52, 68], [57, 72], [61, 57], [52, 61], [38, 61]], 120),
    saddleLines: [CU([[24, 52], [44, 58], [66, 50]], 120), CU([[42, 60], [45, 24]], 120), CU([[48, 60], [51, 24]], 120), CU([[33, 69], [36, 64], [52, 64], [56, 69]], 120)],
  };
  const HORSE = {
    legs: [leg(-.27, .5, .045), leg(-.21, .5, .045), leg(.15, .5, .045), leg(.21, .5, .045)],
    tail: [[-.36, .66], [-.43, .56], [-.45, .34], [-.41, .36], [-.39, .54], [-.35, .6]],
    body: [[-.3, .47], [-.37, .54], [-.38, .64], [-.3, .7], [-.1, .68], [.08, .7], [.15, .76], [.22, .86], [.27, .95], [.29, 1], [.31, .97], [.33, .95], [.46, .8], [.48, .74], [.43, .72], [.33, .77], [.25, .68], [.21, .56], [.15, .48], [0, .46]],
  };
  const DONKEY = {
    legs: [leg(-.24, .46, .045), leg(-.18, .46, .045), leg(.12, .46, .045), leg(.18, .46, .045)],
    tail: [[-.33, .58], [-.38, .48], [-.38, .36], [-.355, .36], [-.355, .48], [-.32, .55]],
    body: [[-.27, .43], [-.34, .5], [-.34, .6], [-.26, .64], [-.06, .62], [.1, .64], [.2, .72], [.26, .8], [.25, .97], [.28, .97], [.31, .84], [.34, .96], [.37, .95], [.35, .8], [.47, .64], [.48, .58], [.42, .56], [.32, .64], [.25, .56], [.19, .46], [.0, .42]],
    load: [[-.26, .5], [-.28, .74], [-.22, .8], [.06, .8], [.1, .74], [.09, .5]],
    loadLines: [[[-.27, .64], [.095, .64]]],
  };
  const OX = {
    legs: [leg(.04, .42, .07), leg(.1, .42, .07), leg(.34, .42, .07), leg(.4, .42, .07)],
    body: [[.0, .38], [-.02, .6], [.04, .68], [.3, .7], [.36, .74], [.42, .74], [.48, .66], [.5, .56], [.45, .5], [.42, .4], [.36, .36]],
    horn: [[.38, .74], [.36, .84], [.39, .82], [.42, .74]],
    plough: [[-.02, .5], [-.3, .16], [-.36, .02], [-.33, .0], [-.27, .14], [.0, .46]],
    man: [[-.48, 0], [-.49, .5], [-.44, .62], [-.43, .7], [-.45, .78], [-.41, .86], [-.36, .86], [-.33, .78], [-.35, .7], [-.31, .62], [-.28, .5], [-.3, 0]],
  };
  const FIGURE = [[-.18, 0], [-.2, .55], [-.12, .7], [-.1, .8], [-.12, .9], [-.04, 1], [.06, 1], [.12, .9], [.1, .8], [.12, .7], [.2, .55], [.18, 0]];
  const flipPolys = polys => polys.map(p => p.map(([u, v]) => [-u, v]));
  /* a standing camel; o.load 'bales' | 'litter' | 'rider' | none; o.flip faces it left */
  function camel(B, x, y, h, o = {}) {
    const polys = [...CAMEL.legs, CAMEL.tail, CAMEL.body], lines = [];
    if (o.load === 'bales' || o.load === 'rider') { polys.push(CAMEL.load); lines.push(...CAMEL.loadLines); }
    if (o.load === 'litter') { polys.push(CAMEL.litter); lines.push(...CAMEL.litterLines); }
    if (o.load === 'rider') polys.push(CAMEL.rider);
    lines.push(CAMEL.eye);
    if (o.load) lines.push(...CAMEL.gear);
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.3, lines: o.flip ? flipPolys(lines) : lines, role: o.role || 'the camels', lod: o.lod == null ? 1 : o.lod });
  }
  function camelDown(B, x, y, h, o = {}) {
    const polys = [CAMEL_DOWN.body], lines = CAMEL_DOWN.lines.slice();
    if (o.saddle) { polys.push(CAMEL_DOWN.saddle); lines.push(...CAMEL_DOWN.saddleLines); }
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.2, lines: o.flip ? flipPolys(lines) : lines, role: o.role || 'the camels', lod: o.lod == null ? 1 : o.lod });
  }
  function horse(B, x, y, h, o = {}) {
    const polys = [...HORSE.legs, HORSE.tail, HORSE.body];
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.15, role: o.role || 'the horse', lod: o.lod == null ? 1 : o.lod });
  }
  function donkey(B, x, y, h, o = {}) {
    const polys = [...DONKEY.legs, DONKEY.tail, DONKEY.body, DONKEY.load];
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.15, lines: o.flip ? flipPolys(DONKEY.loadLines) : DONKEY.loadLines, role: o.role || 'the donkey', lod: o.lod == null ? 1 : o.lod });
  }
  /* a robed figure, standing on any height (the kernel's person stands on the ground) */
  function figure(B, x, y, h, o = {}) {
    const polys = [FIGURE];
    if (o.staff) polys.unshift([[.22, 0], [.25, 0], [.3, 1.08], [.27, 1.08]]);
    if (o.jar) polys.push([[.1, 1.0], [.06, 1.08], [.08, 1.16], [.18, 1.16], [.2, 1.08], [.16, 1.0]]);
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h, role: o.role || 'a traveller', lod: o.lod == null ? 2 : o.lod });
  }
  /* a ploughing team, ox and plough and the ploughman following, facing right */
  function plough(B, x, y, h, o = {}) {
    const polys = [...OX.legs, OX.body, OX.horn, OX.plough, OX.man], lines = [[[-.33, .48], [-.06, .48], [-.02, .5]]];
    return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 2.2, lines: o.flip ? flipPolys(lines) : lines, role: o.role || 'the ploughman', lod: o.lod == null ? 1 : o.lod });
  }
  /* the screen offset of a point on a cut-out, as a world point (the rope between two camels) */
  const onCut = (x, y, z, h, w, u, v) => [x + EH[0] * u * w, y + EH[1] * u * w, z + v * h];

  /* ---------- the dhow ---------- */
  /* a hull outline in plan, bow at +X: fine at the bow, full in the quarters */
  function hullPts(L, W, n = 12, x0 = 0) {
    const half = t => (W / 2) * (t > 0 ? pow(max(0, 1 - t * t), .72) : pow(max(0, 1 - pow(-t, 3.4)), .5)), up = [], dn = [];
    for (let i = 0; i <= n; i++) { const t = -.97 + 1.97 * i / n; up.push([x0 + t * L / 2, half(t)]); }
    for (let i = n; i >= 0; i--) { const t = -.97 + 1.97 * i / n; dn.push([x0 + t * L / 2, -half(t)]); }
    return up.concat(dn);
  }
  /* dhow(B, R, x, y, L, heading, {sail: 'set'|'furled'|'none', masts, boat, role, lod}) */
  function dhow(B, R, x, y, L, hd, o = {}) {
    const role = o.role || 'the ship', lod = o.lod || 0, W = L * .27, fb = L * .1;
    const c = cos(hd), s = sin(hd), T = (X, Y, Z = 0) => [x + X * c - Y * s, y + X * s + Y * c, Z];
    const T2 = p => T(p[0], p[1]).slice(0, 2);
    const lee = (c - s) > 0 ? -1 : 1;   // the sail bellies away from the eye
    const wlL = hullPts(L * .82, W * .84, 12, -L * .05), dkL = hullPts(L, W, 12, 0);
    const wl = wlL.map(T2), dk = dkL.map(T2);
    const hull = sol(B, [[wl, 0], [dk, fb]], { role, lod, crease: .7 });
    // the planking: strake above strake from the waterline to the wale under the gunwale
    for (const [f, ml, cl] of [[.2, 2, 'lo'], [.42, 1, 'lo'], [.6, 2, 'lo'], [.75, 2, 'lo'], [.88, 2, 'mid']]) surf(B, hull, closed(lerpPoly(wl, dk, f)).map(p => [p[0], p[1], fb * f]), [x, y], { slope: .15, cls: cl, lod: ml });
    // the rail round the deck on its stanchions, the stem head rising over the bow
    if (L > 30) {
      const rl = dkL.map(p => T(p[0] * .985, p[1] * .94, fb + L * .022)), deck = hull;
      B.mark(rl.filter((p, i) => i <= 12), { on: deck, cls: 'lo', lod: 2 }); B.mark(rl.filter((p, i) => i > 12), { on: deck, cls: 'lo', lod: 2 });
      for (let i = 1; i < dkL.length; i += 2) { const q = dkL[i]; if (q[0] < -L * .24) continue; B.mark([T(q[0] * .985, q[1] * .94, fb), T(q[0] * .985, q[1] * .94, fb + L * .022)], { on: deck, cls: 'lo', lod: 2 }); }
      B.line([T(L * .485, 0, fb), T(L * .53, 0, fb + L * .07)], { role, lod: 2, w: 1.2 });
    }
    // the poop: a raised deck over the stern
    const cutX = -L * .24, sternL = dkL.filter(p => p[0] < cutX), wq = (W / 2) * pow(max(0, 1 - pow(-cutX / (L / 2), 3.4)), .5);
    const poopPts = [[cutX, wq], ...sternL, [cutX, -wq]].map(T2);
    const poop = sol(B, [[poopPts, fb], [poopPts, fb + L * .065]], { role, lod: max(lod, 1), crease: .5 });
    B.mark([T(-L * .48, 0, fb + L * .065), T(-L * .5, 0, .1)], { on: poop, cls: 'edge', lod: 2 });   // the rudder post
    if (L > 30) {
      // the rudder blade hung on the sternpost, and the tiller over the poop to the helm
      B.plate([T(-L * .486, 0, fb * .95), T(-L * .55, 0, fb * .7), T(-L * .55, 0, .15), T(-L * .5, 0, .15)], { role, lod: 2 });
      B.line([T(-L * .485, 0, fb + L * .075), T(-L * .38, -W * .05, fb + L * .085)], { role, lod: 2, w: 1.1 });
    }
    if (o.house) {
      // the deck house on the poop, with its door and the helmsman's rail
      const hz = fb + L * .065, hx0 = -L * .4, hx1 = -L * .27, hw = W * .3;
      const hp = [[hx0, -hw], [hx1, -hw], [hx1, hw], [hx0, hw]].map(T2);
      const dh = sol(B, [[hp, hz], [hp, hz + L * .07]], { role: 'the deck house', lod: 1, crease: .4 });
      B.mark([T(hx1, -hw * .4, hz), T(hx1, -hw * .4, hz + L * .05), T(hx1, hw * .4, hz + L * .05), T(hx1, hw * .4, hz)], { on: dh, lod: 2 });
      const rail = []; for (const p of sternL) rail.push(T(p[0], p[1] * .92, hz + L * .03));
      B.mark(rail, { on: dh, cls: 'mid', lod: 2 });
    }
    if (o.cargo) {
      // the cargo lashed amidships: bales and the great water jars
      for (const [X, Y, w2, d2, h2] of [[L * .02, -W * .16, L * .07, W * .2, L * .045], [L * .11, W * .1, L * .06, W * .18, L * .04], [-L * .06, W * .12, L * .05, W * .16, L * .035]]) { const q = T(X, Y); sol(B, [[[[q[0] - w2 / 2, q[1] - d2 / 2], [q[0] + w2 / 2, q[1] - d2 / 2], [q[0] + w2 / 2, q[1] + d2 / 2], [q[0] - w2 / 2, q[1] + d2 / 2]].map(p => rotP(p[0], p[1], hd, q[0], q[1])), fb], [[[q[0] - w2 / 2, q[1] - d2 / 2], [q[0] + w2 / 2, q[1] - d2 / 2], [q[0] + w2 / 2, q[1] + d2 / 2], [q[0] - w2 / 2, q[1] + d2 / 2]].map(p => rotP(p[0], p[1], hd, q[0], q[1])), fb + h2]], { role: 'the cargo', lod: 2, crease: .2 }); }
      for (const [X, Y] of [[L * .2, -W * .12], [L * .23, W * .02]]) { const q = T(X, Y); const jr = B.lathe(q[0], q[1], [[.5, fb], [1.2, fb + 1], [1.1, fb + 2.2], [.5, fb + 3], [.6, fb + 3.3]], { n: 12, role: 'the cargo', lod: 2 }); hoop(B, jr, q[0], q[1], 1.18, fb + 1.4, { n: 14, lod: 2 }); }
    }
    if (o.crew) for (const [X, Y] of [[-L * .3, W * .2], [L * .12, -W * .15], [L * .3, W * .1]]) { const q = T(X, Y); figure(B, q[0], q[1], L * .09, { z: X < -L * .2 ? fb + L * .065 : fb, role: 'the sailors', lod: 2 }); }
    const masts = o.masts || 1, mx = L * .06;
    const rig = (mX, mHt, tX, scale) => {
      const head = [mX + L * .02, mHt];
      const mast = B.line([T(mX, 0, fb), T(head[0], 0, head[1] + L * .02)], { role, lod, w: 1.6 });
      if (o.sail === 'none') return mast;
      if (o.sail === 'furled') {
        const fu = B.line([T(tX * .62, 0, head[1] * .7), T(-L * .36, 0, head[1] * .86)], { role, lod, w: 2.4 });
        // the gaskets that hold the furled sail to its yard
        for (let k = 1; k < 8; k++) { const f = k / 8, c = [lerp(tX * .62, -L * .36, f), lerp(head[1] * .7, head[1] * .86, f)]; B.mark([T(c[0] - L * .004, -W * .07, c[1] - L * .012), T(c[0] + L * .004, W * .07, c[1] + L * .012)], { on: fu, cls: 'edge', lod: 2 }); }
        return mast;
      }
      // the yard hangs from the masthead: its tack at the stem head, its peak high over the stern
      const tack = [tX, fb + L * .03], peak = [head[0] + (head[0] - tack[0]) * 1.25, head[1] + (head[1] - tack[1]) * 1.25];
      const clew = [peak[0] + L * .1 * scale, fb + L * .16 * scale], bl = lee * L * .1 * scale;
      const S3 = (p, Y = 0) => T(p[0], Y, p[1]);
      const yardPts = [S3(tack)], leech = [], foot = [];
      for (let k = 1; k < 4; k++) yardPts.push(S3([lerp(tack[0], peak[0], k / 4), lerp(tack[1], peak[1], k / 4)]));
      yardPts.push(S3(peak));
      for (let k = 1; k < 4; k++) { const t = k / 4; leech.push(S3([lerp(peak[0], clew[0], t) - sin(t * PI) * L * .035, lerp(peak[1], clew[1], t)], bl * sin(t * PI) * .6)); }
      for (let k = 0; k < 5; k++) { const t = k / 5; foot.push(S3([lerp(clew[0], tack[0], t), lerp(clew[1], tack[1], t) - sin(t * PI) * L * .04], bl * (k === 0 ? .4 : sin(t * PI) + .2))); }
      const sail = B.plate([...yardPts, ...leech, ...foot], { role: o.sailRole || 'the sail', lod });
      // the cloths run down parallel to the leech
      for (const [f, ml] of [[.22, 2], [.38, 1], [.54, 2], [.7, 1], [.86, 2]]) B.mark([S3([lerp(tack[0], peak[0], f), lerp(tack[1], peak[1], f)]), S3([lerp(tack[0], clew[0], f), lerp(tack[1], clew[1], f) - sin(f * PI) * L * .03], bl * sin(f * PI))], { on: sail, lod: ml });
      // the sheet made fast on the poop, the runner on the main deck, each inside the gunwale
      const shE = T(-L * .41, lee * W * .25, fb + L * .065), ruE = T(mX - L * .26, -lee * W * .4, fb);
      B.mark([S3(clew, bl * .4), shE], { on: sail, cls: 'mid', lod: 1 });   // the sheet
      B.mark([S3(head), ruE], { on: sail, cls: 'mid', lod: 1 });     // the runner
      if (L > 30) {
        // the cleats the sheet and the runner are made fast to
        for (const q of [shE, ruE]) B.box(q[0] - .45, q[1] - .45, q[0] + .45, q[1] + .45, q[2], q[2] + .7, { r: .15, b: 0, role, lod: 2 });
        // the halyard down the mast from its block at the masthead, and the lashings of the yard
        const hb = T(head[0] + L * .012, 0, head[1] + L * .005); B.box(hb[0] - .5, hb[1] - .5, hb[0] + .5, hb[1] + .5, hb[2] - .8, hb[2] + .6, { r: .2, b: 0, role, lod: 2 });
        B.mark([T(head[0] + L * .02, 0, head[1]), T(mX + L * .03, W * .06, fb)], { on: sail, cls: 'lo', lod: 2 });
        for (const f of [.22, .5, .78]) { const c = [lerp(tack[0], peak[0], f), lerp(tack[1], peak[1], f)]; B.mark([S3([c[0] - L * .006, c[1] - L * .012], -W * .06), S3([c[0] + L * .006, c[1] + L * .012], W * .06)], { on: sail, cls: 'edge', lod: 2 }); }
      }
      if (o.shrouds) for (const sd of [-1, 1]) B.mark([S3(head), T(mX - L * .05, sd * W * .5, fb)], { on: sail, cls: 'lo', lod: 2 });
      B.line([S3(tack), S3(peak)], { role, lod, w: 1.3 });                                         // the yard
      return mast;
    };
    rig(mx, L * .46, L * .5, 1);
    if (masts > 1) rig(-L * .27, L * .32, -L * .02, .62);
    if (o.boat) {
      const bx = -L * .82, by = lee * -L * .06, bL = L * .2, bW = bL * .36;
      const bwl = hullPts(bL * .85, bW * .8, 8, bx - bL * .02).map(p => T2([p[0], p[1] + by])), bdk = hullPts(bL, bW, 8, bx).map(p => T2([p[0], p[1] + by]));
      const boat = sol(B, [[bwl, 0], [bdk, bL * .14]], { role: 'the boat', lod: 1, crease: .4 });
      B.mark([T(bx + bL * .5, by, bL * .14), T(-L * .48, 0, fb * .8)], { on: boat, cls: 'mid', lod: 1 });   // the tow line
    }
    if (o.anchor) B.mark([T(L * .5, 0, fb), T(L * .7, 0, 0)], { on: hull, cls: 'mid', lod: 1 });
    // the wake and the bow wave, on the water
    if (o.wake && o.sea) {
      for (const sg of [-1, 1]) B.mark(spline([T(-L * .5, sg * W * .3), T(-L * .8, sg * W * .7), T(-L * 1.05, sg * W * 1.2)], 4), { on: o.sea, lod: 1 });
      for (const sg of [-1, 1]) B.mark(spline([T(L * .48, sg * W * .2), T(L * .38, sg * W * .62), T(L * .22, sg * W * .8)], 3), { on: o.sea, lod: 2 });
    }
    return hull;
  }

  /* ---------- open country ---------- */
  const scl = (P, f, c) => P.map(p => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
  const shiftP = (P, dx, dy) => P.map(p => [p[0] + dx, p[1] + dy]);
  /* a barchan, the crescent dune: the windward slope is a plate from its back foot up to the crest,
     the slip face a plate from the crest down to its hollow foot between the horns */
  function dune(B, R, cx, cy, W, ang, o = {}) {
    const role = o.role || 'the dunes', lod = o.lod || 0;
    const h = W * (o.hf || R.r(.19, .23)), hw = W / 2, Lb = W * R.r(.42, .52), Lh = W * R.r(.36, .46), sf = h * 1.7;
    const ca = cos(ang), sa = sin(ang), P = (s, t, z = 0) => [cx + s * ca - t * sa, cy + s * sa + t * ca, z];
    const K = 12, crest = [], foot = [], cs = [], zc = [];
    for (let i = 0; i <= K; i++) {
      const k = -1 + 2 * i / K, ak = abs(k), t = k * hw * .84;
      cs.push(-h * .3 + (Lh + h * .3) * pow(ak, 2.2)); zc.push(h * pow(max(0, 1 - k * k), .75));
      crest.push(P(cs[i], t, zc[i]));
      foot.push(P(sf + (Lh - sf) * pow(ak, 1.7), t, 0));
    }
    const outer = [P(Lh * .62, -hw * .98)];
    for (let j = 0; j <= 10; j++) { const a = 1.5 * PI - j / 10 * PI; outer.push(P(Lb * cos(a), hw * 1.02 * sin(a))); }
    outer.push(P(Lh * .62, hw * .98));
    const stoss = B.plate([crest[0], ...outer, ...crest.slice(1).reverse()], { role, lod });
    const slip = B.plate([...crest, ...foot.slice(1, -1).reverse()], { role, lod, cls: 'lo' });
    B.mark(crest, { on: slip, cls: 'edge', lod: 1 });
    // the slip face, steep and in shade: fall lines from the brink
    for (let i = 1; i < K; i++) for (const f of [0, .5]) { if (f && i === K - 1) continue; const a = crest[i], b = crest[i + 1], c = foot[i], d = foot[i + 1]; const t = (i + f) / K; B.mark([[lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)], [lerp(c[0], d[0], f), lerp(c[1], d[1], f), 0]], { on: slip, lod: f === 0 && i % 2 === 0 ? 1 : 2 }); }
    // the wind ripples up the windward back, parallel to the crest: each row runs from horn to horn, and
    // the rows near the brink shorten toward the middle, so the ripples fade out under the crest
    const NR = o.rows || 8;
    for (let r = 0; r < NR; r++) {
      const f = .1 + .8 * r / (NR - 1), span = r < NR - 2 ? 1 : (r === NR - 2 ? .7 : .45), pts = [], M = 3 * K;
      for (let m = 0; m <= M; m++) {
        const k = (-1 + 2 * m / M) * span, t = k * hw * .84, ik = (k + 1) / 2 * K, i0 = min(K - 1, Math.floor(ik)), ft = ik - i0;
        const csk = lerp(cs[i0], cs[i0 + 1], ft), zck = lerp(zc[i0], zc[i0 + 1], ft), sb = -Lb * sqrt(max(0, 1 - pow(t / (hw * 1.02), 2)));
        pts.push(P(lerp(sb, csk, f) + sin(m * .9 + r * 2.1) * h * .05, t, zck * pow(f, 1.2) + .05));
      }
      B.mark(pts, { on: stoss, lod: r % 3 === 1 ? 1 : 2 });
    }
    // on the slip face, the tongues of sand that slid from the brink, their toes on the floor
    for (let i = 2; i < K - 1; i += 3) { const a = crest[i], c = foot[i], m = lerp3(a, c, .55); B.mark([[m[0] - EH[0] * W * .03, m[1] - EH[1] * W * .03, m[2]], [lerp(m[0], c[0], .7), lerp(m[1], c[1], .7), lerp(m[2], 0, .7) + .05], [m[0] + EH[0] * W * .03, m[1] + EH[1] * W * .03, m[2]]], { on: slip, closed: true, lod: 2 }); }
    stoss.crest = crest; stoss.foot = foot; stoss.h = h;
    return stoss;
  }
  /* bones bleaching on the sand: a spine, its ribs, a skull */
  function bones(B, R, x, y, s) {
    const a = R() * TAU, c = cos(a), sn = sin(a), P = (u, v, z = .3) => [x + u * c - v * sn, y + u * sn + v * c, z];
    const spine = B.line(spline([P(-s * .5, 0), P(-s * .1, s * .05), P(s * .3, 0), P(s * .52, -s * .04)], 3), { role: 'the bones', lod: 1 });
    for (let i = 0; i < 6; i++) { const u = lerp(-s * .22, s * .32, i / 5), L = s * (.2 - abs(i - 2.5) * .02); for (const sg of [-1, 1]) B.mark([P(u, 0, .4), P(u + s * .03, sg * L * .6, 1.3), P(u + s * .08, sg * L, .2)], { on: spine, cls: 'edge', lod: 1 }); }
    for (const sg of [-1, 1]) B.mark([P(-s * .42, sg * s * .06), P(-s * .55, sg * s * .26), P(-s * .62, sg * s * .3)], { on: spine, lod: 2 });
    B.plate([P(s * .52, -s * .1, .2), P(s * .64, -s * .12, .6), P(s * .74, -s * .06, .5), P(s * .7, s * .04, .3), P(s * .56, s * .03, .2)], { role: 'the bones', lod: 1 });
  }
  /* the open desert: barchan dunes marching before the wind, a camel track between them, a few rocks,
     and one sign of life: a couched camel, a bleached skeleton or a lone acacia */
  def('desert', (R, B, A) => {
    // the wind blows across the eye's view, so each crescent shows its slip face and its back
    const wind = A.wind != null ? A.wind : (R.chance(.5) ? R.r(2.2, 2.6) : R.r(-1, -.62)), n = A.n || R.i(2, 4);
    const spots = [[-14, -14, 58, 0], [26, -8, 44, 0], [-22, 24, 34, 1], [20, 28, 26, 1]];
    let first = null;
    for (let i = 0; i < n; i++) { const [x, y, W, lod] = spots[i]; const d = dune(B, R, x + R.r(-3, 3), y + R.r(-3, 3), W * R.r(.9, 1.08), wind + R.r(-.12, .12), { role: i === 0 ? 'the great dune' : 'the dunes', lod }); first = first || d; }
    // the camel track between the dunes: the sand trodden into a band, the pads of the camels printed in it
    const gp = spline([[-46, 4], [-30, 6], [-8, 18], [8, 10], [26, 20], [46, 12]], 5);
    B.guide(gp);
    const trk = ribbon(gp, 2.6), track = B.plate(at(trk.poly, .02), { role: 'the camel track', cls: 'lo', lod: 1 });
    for (let i = 1; i < gp.length - 1; i++) for (const f of [.25, .75]) {
      const p = lerp2(gp[i], gp[i + 1], f), q = gp[i + 1], d = hypot(q[0] - gp[i][0], q[1] - gp[i][1]) || 1, ux = (q[0] - gp[i][0]) / d, uy = (q[1] - gp[i][1]) / d, sd = f < .5 ? -1 : 1;
      const c = [p[0] - uy * sd * .55, p[1] + ux * sd * .55];
      B.mark(closed(ell(c[0], c[1], .42, .3, 6, Math.atan2(uy, ux))).map(v => [v[0], v[1], .02]), { on: track, lod: 2 });
    }
    // the open sand: fields of wind ripples across the wind, a gravel lag, a salt pan in a hollow, tussocks
    const placed = B.parts.filter(p => p.role === 'the great dune' || p.role === 'the dunes').map(p => [p.cx, p.cy, max(p.hw, p.hh) * .9]);
    const rocks = [[38, -36], [-44, -24], [2, 40]], lifeAt = [R.r(0, 10), R.r(-2, 4)];
    const clear = (x, y, r) => hypot(x, y) < 44 && !placed.some(([px, py, pr]) => hypot(x - px, y - py) < pr + r) && !rocks.some(([px, py]) => hypot(x - px, y - py) < r + 6) && hypot(x - lifeAt[0], y - lifeAt[1] - 20) > r + 7;
    const spotsFree = []; for (let tries = 0; tries < 160 && spotsFree.length < 7; tries++) { const x = R.r(-42, 42), y = R.r(-42, 42); if (clear(x, y, 7) && spotsFree.every(([sx, sy]) => hypot(sx - x, sy - y) > 15)) spotsFree.push([x, y]); }
    spotsFree.slice(0, 3).forEach(([x, y], i) => ripples(B, track, R, x, y, wind + PI / 2 + R.r(-.15, .15), R.i(6, 8), R.r(13, 17), 1.7, .02, { lod1: i === 0, amp: .28 }));
    if (spotsFree[3]) { const [x, y] = spotsFree[3]; pebbles(B, track, R, x, y, 7, 5, 26, .02); }
    if (spotsFree[4]) {
      // the sabkha: a hollow where water stood after rain and dried to a crust that broke into plates
      const [x, y] = spotsFree[4], pan = wob(R, x, y, 7.5, 5, 12, .12, R() * TAU), sab = B.plate(at(pan, .03), { role: 'the salt pan', cls: 'lo', lod: 1 });
      cracks(B, sab, R, scl(pan, .985, [x, y]), .03, 2.2, { ang: R() * PI });
    }
    for (const [x, y] of spotsFree.slice(5)) tuft(B, R, x, y, 0, R.r(1.8, 2.6), { role: 'the dunes' });
    for (const p of B.parts.filter(q => q.role === 'the great dune' || q.role === 'the dunes').slice(0, 4)) if (p.foot) { const f = p.foot[R.i(3, 9)]; tuft(B, R, f[0] + R.r(-1, 1), f[1] + R.r(-1, 1), 0, R.r(1.6, 2.4), { role: 'the dunes' }); }
    for (let i = 0; i < 2 + (n < 4 ? 1 : 0); i++) {
      const [x, y] = rocks[i], rr = R.r(3, 4.5); rock(B, R, x, y, rr, R.r(2.6, 4));
      if (R.chance(.6)) rock(B, R, x + R.r(3, 5), y + R.r(-1, 3), R.r(1.6, 2.4), R.r(1.4, 2.2), { lod: 2 });
      // the sand tail in the rock's lee, tapering downwind
      const ux = cos(wind), uy = sin(wind), vx = -uy, vy = ux, t0 = [x + ux * rr * .9, y + uy * rr * .9];
      B.mark([[t0[0] + vx * rr * .6, t0[1] + vy * rr * .6, .02], [t0[0] + ux * rr * .9 + vx * rr * .36, t0[1] + uy * rr * .9 + vy * rr * .36, .02], [t0[0] + ux * rr * 1.9, t0[1] + uy * rr * 1.9, .02], [t0[0] + ux * rr * .9 - vx * rr * .36, t0[1] + uy * rr * .9 - vy * rr * .36, .02], [t0[0] - vx * rr * .6, t0[1] - vy * rr * .6, .02]], { on: track, lod: 2 });
    }
    const life = R.pick(['camel', 'bones', 'acacia']), lx = lifeAt[0], ly = lifeAt[1];
    if (life === 'camel') camelDown(B, lx, ly + 20, 9.5, { role: 'a camel', lod: 1, flip: R.chance(.5), saddle: true });
    else if (life === 'bones') bones(B, R, lx, ly + 22, 12);
    else acacia(B, R, lx + 26, ly - 30, R.r(20, 24), { role: 'the acacia', lod: 0 });
  });

  /* An oasis: a spring welling up in a pool ringed by date palms, a mud-brick hamlet of flat roofs,
     and a channel carrying the water out to a tilled patch */
  def('oasis', (R, B) => {
    const px = R.r(-16, -10), py = R.r(-2, 4), rx = R.r(14, 16), ry = rx * R.r(.62, .74), rot = R.r(-.5, 0);
    // the watered ground of the grove, its edge where the desert begins (laid lowest, so all else stands on it)
    const gw = wob(R, px + 1, py + 1, (rx + 3) * 1.8, (ry + 3) * 1.95, 18, .05, rot), grove = B.plate(at(gw, -.12), { role: 'the date palms', cls: 'lo', lod: 1 });
    const rim = sol(B, [[wob(R, px, py, rx + 3.2, ry + 3.2, 18, .03, rot), 0], [ell(px, py, rx + 1.4, ry + 1.4, 18, rot), .9]], { role: 'the spring' });
    // the stones of the kerb round the pool, joint by joint
    for (let k = 0; k < 30; k++) { const t = k / 30 * TAU, c = cos(t), sn = sin(t), q0 = rotP(px + (rx + 3.1) * c, py + (ry + 3.1) * sn, rot, px, py), q1 = rotP(px + (rx + 1.45) * c, py + (ry + 1.45) * sn, rot, px, py), nn = rotP(c / (rx + 3), sn / (ry + 3), rot); B.mark([[q0[0], q0[1], 0], [q1[0], q1[1], .9]], { on: rim, n: [nn[0], nn[1], .25], lod: 2 }); }
    const water = B.plate(at(ell(px, py, rx, ry, 28, rot), .9), { role: 'the spring' });
    shine(B, water, R, px, py, rx, ry, 9, .9);
    // the eye of the spring, welling up in rings that widen and fade
    const ex = px + R.r(-3, 1), ey = py + R.r(-1, 1);
    for (const [f, ml] of [[.07, 1], [.13, 2], [.2, 2], [.28, 2]]) B.mark(at(closed(ell(ex, ey, rx * f, ry * f, 18, rot)), .9), { on: water, lod: ml });
    // reeds where the pool's edge is shallow
    for (let k = 0; k < 4; k++) { const t = R.r(.6, 2.6) + (k > 1 ? PI : 0), q = rotP(px + (rx + .4) * cos(t), py + (ry + .4) * sin(t), rot, px, py); tuft(B, R, q[0], q[1], .9, R.r(3.2, 4.4), { n: 9, spread: .22, role: 'the spring', lod: 2 }); }
    // the date palms round the water, each in its own basin, the basins joined by little bunds of earth
    const np = R.i(8, 10), a0 = R() * TAU, bas = [];
    for (let i = 0; i < np; i++) {
      const a = a0 + i / np * TAU + R.r(-.2, .2), d = R.r(1.22, 1.6), young = i % 4 === 3, x = px + cos(a) * (rx + 3) * d, y = py + sin(a) * (ry + 3) * d * 1.15;
      palm(B, R, x, y, young ? R.r(9, 12) : R.r(20, 28), { role: 'the date palms', lod: young ? 1 : 0, lean: young ? .05 : .13, dir: a + R.r(-.4, .4), spread: young ? 1.5 : 1 });
      const br = young ? 1.6 : 2.4; bas.push([x, y, br, a]);
      B.mark(at(closed(ell(x, y, br, br * .9, 14)), -.12), { on: grove, lod: 2 });
    }
    bas.sort((p, q) => p[3] - q[3]);
    for (let i = 0; i < bas.length; i++) { const [x0, y0, r0] = bas[i], [x1, y1, r1] = bas[(i + 1) % bas.length], d = hypot(x1 - x0, y1 - y0); if (d < r0 + r1 + 1 || d > 22) continue; const ux = (x1 - x0) / d, uy = (y1 - y0) / d; B.mark([[x0 + ux * r0, y0 + uy * r0, -.12], [x1 - ux * r1, y1 - uy * r1, -.12]], { on: grove, lod: 2 }); }
    // a fallen frond on the ground, and the stones of the path to the water
    for (let k = 0; k < 2; k++) { const [x, y] = bas[R.i(0, bas.length - 1)], a = R() * TAU, L = R.r(5, 7), c = cos(a), sn = sin(a), q = [x + c * 3, y + sn * 3]; B.mark([[q[0], q[1], -.12], [q[0] + c * L, q[1] + sn * L, -.12]], { on: grove, lod: 2 }); for (let j = 1; j < 6; j++) { const m = [q[0] + c * L * j / 6, q[1] + sn * L * j / 6]; for (const sd of [-1, 1]) B.mark([[m[0], m[1], -.12], [m[0] + (c * .5 - sn * sd) * 1.1, m[1] + (sn * .5 + c * sd) * 1.1, -.12]], { on: grove, lod: 2 }); } }
    // the hamlet: low mud-brick houses with soft corners and flat roofs
    const hs = [[14, -40, 30, -27, R.r(8, 9.5)], [28, -22, 41, -10, R.r(7, 8.5)], [12, -22, 24, -12, R.r(6.5, 7.5)]];
    const nh = R.i(2, 3);
    for (let i = 0; i < nh; i++) {
      const [x0, y0, x1, y1, h] = hs[i];
      const m = B.box(x0, y0, x1, y1, 0, h, { r: 2, b: .7, top: .5, role: 'the village' });
      B.band(h - 1.4, { on: m, sides: 'SE' });
      for (const z of [h * .24, h * .5]) B.band(z, { on: m, sides: 'SE', lod: 2 });
      const du = R.r(.3, .7);
      B.door('S', du, 2.8, 4.6, { on: m, shape: 'round' });
      B.panel('S', du - 2.4 / (x1 - x0), du + 2.4 / (x1 - x0), 4.6, 5.3, { on: m, lod: 2 });   // the palm-log lintel over the door
      B.window('E', .5, h * .55, 1.6, 1.6, { on: m, shape: 'flat', lod: 2 });
      for (const u of [.2, .8]) B.mark([[lerp(x0, x1, u), y1 - .5, h - .8], [lerp(x0, x1, u), y1 + 1.4, h - 1.1]], { on: m, n: [0, 1, 0], cls: 'edge', lod: 2 });
      // a water jar by the door
      const jx = lerp(x0, x1, du) + (du < .5 ? 3.2 : -3.2), jy = y1 + 1.4;
      B.lathe(jx, jy, [[.5, 0], [1.1, .9], [1, 1.9], [.45, 2.6], [.55, 2.9]], { n: 12, role: 'the village', lod: 2 });
      if (i === 0 && R.chance(.6)) { const rr = B.box(x0 + 1.5, y0 + 1.5, x0 + 7, y0 + 6.5, h, h + 4, { r: 1, b: .5, top: .3, role: 'the village', lod: 1 }); B.door('S', .5, 2, 2.8, { on: rr, shape: 'round', lod: 2 }); }
      if (i === 1 && R.chance(.5)) B.dome((x0 + x1) / 2, (y0 + y1) / 2, 3.6, h, { shape: 'round', role: 'the village', lod: 1, finial: false });
      if (i === 0) {
        // the ladder of palm wood up to the roof, its poles standing above the parapet
        const lx = x1 + .2, ly0 = lerp(y0, y1, .3), lad = B.line([[lx + 2.4, ly0, 0], [lx + .1, ly0, h + 2]], { role: 'the village', lod: 2, w: 1.1 });
        B.mark([[lx + 2.4, ly0 + 1.6, 0], [lx + .1, ly0 + 1.6, h + 2]], { on: lad, cls: 'edge', lod: 2 });
        for (let k = 1; k < 7; k++) { const f = k / 7.6, xx = lerp(lx + 2.4, lx + .1, f), zz = lerp(0, h + 2, f); B.mark([[xx, ly0, zz], [xx, ly0 + 1.6, zz]], { on: lad, lod: 2 }); }
      }
    }
    // the channel, out of the pool to the tilled patch, between kerbs of stone, a sluice board at its head
    const sx = px + rx * cos(rot) * 1.05, sy = py + rx * sin(rot) * 1.05;
    const ch = spline([[sx + 1, sy], [sx + 9, sy + 6], [10, 20], [16, 23]], 5), rb = ribbon(ch, 2.2), kb = ribbon(ch, 3.4);
    const chan = B.plate(at(rb.poly, .2), { role: 'the channel', cls: 'lo', lod: 1 });
    for (let i = 2; i < ch.length - 2; i += 3) { const q = ch[i], r2 = ch[i + 1]; B.mark(at([[lerp(q[0], r2[0], .1), lerp(q[1], r2[1], .1)], [lerp(q[0], r2[0], .7), lerp(q[1], r2[1], .7)]], .05), { on: chan, lod: 2 }); }
    for (const sd of ['left', 'right']) { B.mark(at(kb[sd].slice(2, -1), .2), { on: chan, lod: 2 }); for (let i = 3; i < ch.length - 1; i += 2) B.mark(at([rb[sd][i], kb[sd][i]], .2), { on: chan, lod: 2 }); }
    { const i = 2, q = ch[i], a = rb.left[i], c = rb.right[i];
      for (const p of [a, c]) B.box(p[0] - .45, p[1] - .45, p[0] + .45, p[1] + .45, .2, 2.6, { r: .15, b: 0, role: 'the channel', lod: 2 });
      sol(B, [[[[a[0] - .1, a[1] - .1], [a[0] + .1, a[1] + .1], [c[0] + .1, c[1] + .1], [c[0] - .1, c[1] - .1]], .2], [[[a[0] - .1, a[1] - .1], [a[0] + .1, a[1] + .1], [c[0] + .1, c[1] + .1], [c[0] - .1, c[1] - .1]], 1.6]], { role: 'the channel', lod: 2 });
      B.mark([[q[0], q[1], 1.6], [q[0], q[1], 2.9]], { on: B.last, cls: 'edge', lod: 2 }); }
    // the tilled patch, in beds within its bund, young plants in the beds
    const fr = R.r(-.15, .15), F = [[16, 20], [44, 18], [44, 42], [14, 42]].map(p => rotP(p[0], p[1], fr, 30, 30));
    const patch = B.plate(at(F, 0), { role: 'the gardens', cls: 'lo', lod: 1 });
    B.mark(at(closed(scl(F, .94, ctr4(F))), 0), { on: patch, lod: 2 });
    const fa = fr + (R.chance(.5) ? 0 : PI / 2);
    hatch(scl(F, .94, ctr4(F)), fa, 2.4).forEach((l, i) => {
      B.mark(at(l, 0), { on: patch, lod: i % 2 ? 2 : 1 });
      if (i % 2 === 0) { const L = hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]), n = Math.floor(L / 2.2); for (let m = 1; m < n; m++) { const q = lerp2(l[0], l[1], m / n); B.mark([[q[0] - EH[0] * .5, q[1] - EH[1] * .5, 0], [q[0], q[1], .9], [q[0] + EH[0] * .5, q[1] + EH[1] * .5, 0]], { on: patch, lod: 2 }); } }
    });
    B.mark(at([lerp2(F[0], F[1], .5), lerp2(F[3], F[2], .5)], 0), { on: patch, cls: 'mid', lod: 1 });
    const life = R.pick(['jar', 'camel', 'none']);
    if (life === 'jar') figure(B, px + rx * .7, py + ry + 4, 8, { jar: true, role: 'a woman at the spring', lod: 2 });
    if (life === 'camel') camelDown(B, px - rx * .2, py + ry + 7, 7, { role: 'a camel', lod: 1, flip: true, saddle: true });
  });

  /* A forest of the southern Appalachians, the Cherokee country: broadleaf oaks, chestnuts and
     poplars among dark hemlocks, climbing a gentle rise; a stream at its foot with a fallen log across it */
  def('forest', (R, B) => {
    const rot = R.r(-.25, .25);
    const layers = [[wob(R, -6, -12, 46, 34, 14, .05, rot), 0], [wob(R, -12, -20, 32, 22, 14, .07, rot), 6.5], [wob(R, -16, -24, 17, 11, 14, .1, rot), 10]];
    const hill = sol(B, layers, { role: 'the hillside' });
    const top = 10;
    // the hillside's ledges of rock where the slope steepens, and the bank of earth under the trees
    strata(B, hill, layers, [-12, -20], [3.2, 7.8], { n: 40, slope: .45, wave: .35, lod: 2 });
    // the long rounded ridge of the mountains behind, worn down and wooded
    const rx0 = -18 + R.r(-3, 3), ry0 = -20 + R.r(-3, 3), ra = -PI / 4 + R.r(-.12, .12), rH = R.r(32, 38);
    const RL = [[ell(rx0, ry0, 42, 12, 18, ra), 0], [ell(rx0 - 1, ry0 - 1, 33, 8, 18, ra), rH * .6], [ell(rx0 - 3, ry0 - 3, 16, 3, 18, ra), rH]];
    const ridge = sol(B, RL, { role: 'the ridge' });
    strata(B, ridge, RL, [rx0 - 1, ry0 - 1], [rH * .32, rH * .5, rH * .72, rH * .86], { n: 36, slope: .35, wave: .5, lod: i => i === 1 ? 1 : 2 });
    // treetops along its flank, small scallops in rows that thin toward the crest
    for (let k = 0; k < 26; k++) { const t = (k % 13 + .5) / 13 - .5, bx = rx0 + cos(ra) * t * 50, by = ry0 + sin(ra) * t * 50, off = k < 13 ? R.r(2, 5) : R.r(6, 9), px = bx - EU[0] * off, py = by - EU[1] * off, z = heightIn(RL, px, py), s1 = z > rH * .7 ? 1 : 1.6; if (z < 2) continue; B.mark([[px - EH[0] * s1, py - EH[1] * s1, z - .4], [px - EH[0] * s1 * .5, py - EH[1] * s1 * .5, z + .8], [px, py, z + 1.1], [px + EH[0] * s1 * .5, py + EH[1] * s1 * .5, z + .8], [px + EH[0] * s1, py + EH[1] * s1, z - .4]], { on: ridge, lod: 2 }); }
    // the stream, out of the woods at the foot of the rise
    const sc = spline([[-50, 20], [-30, 28], [-8, 36], [16, 34], [40, 44]], 6), rb = ribbon(sc, 3.4, 6.4);
    const stream = B.plate(at(rb.poly, .05), { role: 'the stream', cls: 'lo' });
    streamShine(B, stream, R, sc, 4, .05, 2);
    // the fallen log across it
    const li = round(sc.length * .45), lp = sc[li], lq = sc[li + 1], la = Math.atan2(lq[1] - lp[1], lq[0] - lp[0]) + PI / 2 + R.r(-.3, .3);
    log(B, lp[0], lp[1], 15, 1.5, la, { role: 'the fallen log', lod: 1 });
    rock(B, R, sc[li + 9][0] + 2, sc[li + 9][1] - 3, 2.6, 2.2, { lod: 2 });
    rock(B, R, sc[6][0] - 1, sc[6][1] + 4, 3, 2.4, { lod: 2 });
    // stepping stones across the stream downstream of the log, the water parting round each in a V that fades
    const si = round(sc.length * .78), sp0 = sc[si], sp1 = sc[si + 1], sd = hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]) || 1, fx = (sp1[0] - sp0[0]) / sd, fy = (sp1[1] - sp0[1]) / sd, wS = lerp(3.4, 6.4, si / (sc.length - 1));
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) / 1.5 * wS * .62, x = sp0[0] - fy * off + R.r(-.3, .3), y = sp0[1] + fx * off + R.r(-.3, .3);
      sol(B, [[ell(x, y, 1.15, .9, 8, R() * TAU), .05], [ell(x, y, .8, .62, 8, R() * TAU), .9]], { role: 'the stream', lod: 2, crease: .2 });
      for (const sg of [-1, 1]) B.mark([[x + fx * .9 - fy * sg * .7, y + fy * .9 + fx * sg * .7, .05], [x + fx * 2.6 - fy * sg * 1.4, y + fy * 2.6 + fx * sg * 1.4, .05]], { on: stream, lod: 2 });
    }
    // on the banks: ferns, pebbles in the shallows, a stump with its rings
    for (let k = 0; k < 5; k++) { const i = R.i(3, sc.length - 4), side = k % 2 ? rb.left : rb.right, p = side[i], c = sc[i], d = hypot(p[0] - c[0], p[1] - c[1]) || 1; tuft(B, R, p[0] + (p[0] - c[0]) / d * 2, p[1] + (p[1] - c[1]) / d * 2, 0, R.r(2.2, 3), { n: 8, spread: .9, cls: 'lo', role: 'the stream', lod: 2 }); }
    for (let k = 0; k < 3; k++) { const i = R.i(4, sc.length - 5), c = sc[i]; pebbles(B, stream, R, c[0], c[1], 2.4, 1.6, 7, .05); }
    for (const [i, side] of [[round(sc.length * .25), 'right'], [round(sc.length * .62), 'left']]) {
      const p = rb[side][i], c = sc[i], d = hypot(p[0] - c[0], p[1] - c[1]) || 1, x = p[0] + (p[0] - c[0]) / d * 4.5, y = p[1] + (p[1] - c[1]) / d * 4.5, sr = R.r(1.3, 1.7), sh = R.r(1.6, 2.4);
      const st = B.cyl(x, y, sr, 0, sh, { n: 14, b: .3, role: 'the stream', lod: 2 });
      for (const f of [.3, .6]) B.mark(at(closed(ell(x, y, sr * f, sr * f, 12)), sh), { on: st, lod: 2 });
      staves(B, st, x, y, sr, 0, sh, 9, { lod: 2 });
    }
    // the great chestnut, the giant of these woods, on the brow of the rise
    const gx = -6 + R.r(-3, 3), gy = -6 + R.r(-2, 2), gz = heightIn(layers, gx, gy), gh = rH + 6 - gz;
    leafy(B, R, gx, gy, gh, { z: gz, zc: gz + gh * .36, r: gh * .3, role: 'the great chestnut', lod: 0, trunk: 1.3, clumps: 2, leaves: 14 });
    // the trees, oaks and hemlocks mixed, the hemlocks thicker by the water, none so tall as the chestnut
    const cand = [];
    for (let gx2 = -42; gx2 <= 42; gx2 += 12) for (let gy2 = -42; gy2 <= 42; gy2 += 12) cand.push([gx2 + R.r(-4, 4), gy2 + R.r(-4, 4), R()]);
    cand.sort((a, b) => a[2] - b[2]);
    const nearStream = (x, y) => sc.some(p => hypot(p[0] - x, p[1] - y) < 6.5);
    let parts = 6;
    for (const [x, y] of cand) {
      if (hypot(x / 48, y / 46) > 1 || nearStream(x, y) || hypot(x - lp[0], y - lp[1]) < 9 || hypot(x - gx, y - gy) < 13) continue;
      const zg = heightIn(layers, x, y), inBox = x > -54 && x < 42 && y > -48 && y < 24;
      const con = R.chance(zg > 5 ? .35 : .55), h = min(R.r(26, 36) * (con ? 1.05 : 1), rH + 2 - zg);
      if (parts + (con ? 3 : 1) > 44) continue;
      if (con) conifer(B, R, x, y, h, { z: zg, zc: max(zg + h * .12, inBox ? top + .4 : 0), role: 'the hemlocks', lod: 0 });
      else leafy(B, R, x, y, h * .92, { z: zg, zc: max(zg + h * .3, inBox ? top + .4 : 0), r: h * R.r(.3, .36), role: 'the oaks', lod: 0 });
      parts += con ? 3 : 1;
    }
    // the undergrowth on the open floor before the trees: ferns, and a mossy boulder
    for (let k = 0, placed = 0; k < 30 && placed < 5; k++) { const x = R.r(4, 44), y = R.r(-4, 30); if (hypot(x / 48, y / 46) > .95 || nearStream(x, y) || heightIn(layers, x, y) > .2 || B.parts.some(p => p.role !== 'the stream' && p.L && p.lod < 2 && hypot(p.cx - x, p.cy - y) < 5 && p.box[2] < 1)) continue; tuft(B, R, x, y, 0, R.r(2.2, 3.2), { n: 9, spread: 1, cls: 'lo', role: 'the hillside', lod: 2 }); placed++; }
  });

  /* Cultivated land: three or four fields in a patchwork (ploughed, standing grain, young rows),
     a canal along the far edge with a shaduf or a waterwheel lifting water into the field channel,
     a farmhouse with its dovecote, and a row of trees along the canal */
  def('field', (R, B) => {
    const e = 42, sx = R.r(-6, 6), sy = R.r(-4, 6), ty = -e + 8;
    // the canal along the far edge
    const cn = [[-e - 4, ty - 3], [e + 4, ty - 7]], crb = ribbon(cn, 5.5);
    const canal = B.plate(at(crb.poly, .05), { role: 'the canal', cls: 'lo' });
    for (let i = 0; i < 9; i++) { const t = (i + R.r(.2, .8)) / 9, x = lerp(cn[0][0], cn[1][0], t), y = lerp(cn[0][1], cn[1][1], t) + R.r(-1.2, 1.2), l = R.r(2, 4); B.mark([[x - EH[0] * l / 2, y - EH[1] * l / 2, .05], [x + EH[0] * l / 2, y + EH[1] * l / 2, .05]], { on: canal, lod: i % 2 ? 2 : 1 }); }
    // the canal's banks faced with stone, course by course, and reeds where the facing has fallen
    const ckb = ribbon(cn, 7.3);
    for (const sd of ['left', 'right']) { B.mark(at(ckb[sd], .05), { on: canal, lod: 2 }); for (let k = 1; k < 34; k++) { const t = k / 34; B.mark(at([lerp2(crb[sd][0], crb[sd][1], t), lerp2(ckb[sd][0], ckb[sd][1], t)], .05), { on: canal, lod: 2 }); } }
    for (let k = 0; k < 3; k++) { const t = R.r(.08, .92), q = lerp2(ckb.right[0], ckb.right[1], t); tuft(B, R, q[0] + .6, q[1] + .6, 0, R.r(3, 4), { n: 9, spread: .22, role: 'the canal', lod: 2 }); }
    // the fields
    const j = () => R.r(-2, 2);
    const X = [-e, sx + j(), e], Y = [ty + 4, sy + j(), e];
    const quads = [];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) quads.push([[X[a] + 2, Y[b] + 2], [X[a + 1] - 2, Y[b] + 2 + (a ? j() : 0)], [X[a + 1] - 2, Y[b + 1] - 2], [X[a] + 2, Y[b + 1] - 2 + (b ? 0 : j())]]);
    const house = R.i(0, 3), kinds = ['plough', 'grain', 'rows', 'plough'].sort(() => R() - .5);
    quads.forEach((q, i) => {
      if (i === house) return;
      const kind = kinds[i], ang = R.pick([PI / 4, -PI / 4, 0, PI / 2]) + R.r(-.08, .08);
      quads[i].kind = kind;
      if (kind === 'grain') {
        // the standing wheat, and along its near edge the strip already reaped: stubble, and the sheaves stooked in it
        const cut = .78, gq = [q[0], q[1], lerp2(q[1], q[2], cut), lerp2(q[0], q[3], cut)], sq = [gq[3], gq[2], q[2], q[3]];
        const g = sol(B, [[scl(gq, .96, ctr4(gq)), 0], [scl(gq, .94, ctr4(gq)), 3.4]], { role: 'the wheat', crease: .8 });
        hatch(scl(gq, .94, ctr4(gq)), ang, 2.5).forEach((l, k) => B.mark(at(l, 3.4), { on: g, lod: k % 2 ? 2 : 1 }));
        const s0 = scl(gq, .96, ctr4(gq)), sE = s0[2], w = s0[3], s1 = s0[1];
        for (let k = 1; k < 18; k++) { const p = lerp2(w, sE, k / 18); B.mark([[p[0], p[1], .3], [p[0] + .3, p[1], 3.1]], { on: g, n: [0, 1, 0], lod: 2 }); }
        for (let k = 1; k < 14; k++) { const p = lerp2(s1, sE, k / 14); B.mark([[p[0], p[1], .3], [p[0], p[1] + .3, 3.1]], { on: g, n: [1, 0, 0], lod: 2 }); }
        const st = B.plate(at(sq, 0), { role: 'the wheat', cls: 'lo', lod: 1 });
        hatch(scl(sq, .94, ctr4(sq)), ang + PI / 2, 1.2).forEach(l => B.mark(at(l, 0), { on: st, lod: 2 }));
        B.mark(at(closed(scl(sq, .94, ctr4(sq))), 0), { on: st, lod: 2 });
        for (let k = 0; k < 4; k++) { const pq = lerp2(lerp2(sq[0], sq[3], .5), lerp2(sq[1], sq[2], .5), .16 + k * .22); const sk = B.lathe(pq[0], pq[1], [[.95, 0], [.7, 1.2], [.85, 1.7], [0, 2.7]], { n: 8, role: 'the wheat', lod: 2 }); hoop(B, sk, pq[0], pq[1], .74, 1.25, { n: 10, lod: 2 }); }
      } else {
        const f = B.plate(at(q, 0), { role: 'the fields', lod: 0 });
        B.mark(at(closed(scl(q, .96, ctr4(q))), 0), { on: f, lod: 2 });
        const sp = kind === 'plough' ? 2.2 : 4.4;
        if (kind === 'plough' && !quads.ploughed) { quads.ploughed = 1; const c = ctr4(q); plough(B, c[0] + 4, c[1] + 4, 7.5, { flip: R.chance(.5), lod: 1 }); }
        hatch(scl(q, .96, ctr4(q)), ang, sp).forEach((l, k) => {
          B.mark(at(l, 0), { on: f, lod: kind === 'plough' && k % 2 ? 2 : 1 });
          if (kind === 'rows') { const L = hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]), n = Math.floor(L / 3); for (let m = 1; m < n; m++) { const p = lerp2(l[0], l[1], m / n); B.mark([[p[0] - .6, p[1] + .6, 0], [p[0], p[1], 1.2], [p[0] + .6, p[1] - .6, 0]], { on: f, lod: 2 }); } }
        });
      }
    });
    // the field channel, from the canal down between the fields
    const fc = [[sx - 1, ty - 1], [sx - 1, e]], frb = ribbon(fc, 1.8);
    const fch = B.plate(at(frb.poly, .06), { role: 'the channel', cls: 'lo', lod: 1 });
    for (let k = 1; k < 16; k++) { const yy = lerp(ty + 2, e - 1, k / 16); B.mark([[sx - 1.4, yy, .06], [sx - .6, yy + .5, .06]], { on: fch, lod: 2 }); }
    { const gy = ty + 1.6, ga = [sx - 2, gy], gb = [sx, gy];
      for (const q of [ga, gb]) B.box(q[0] - .4, q[1] - .4, q[0] + .4, q[1] + .4, 0, 3, { r: .12, b: 0, role: 'the channel', lod: 2 });
      const gt = B.box(ga[0] + .4, gy - .12, gb[0] - .4, gy + .12, .06, 1.8, { r: .05, b: 0, role: 'the channel', lod: 2 });
      B.mark([[sx - 1, gy + .12, 1.8], [sx - 1, gy + .12, 3.4]], { on: gt, cls: 'edge', lod: 2 }); }
    // the farmhouse in its quarter
    const hq = quads[house], [hx, hy] = ctr4(hq), w = R.r(14, 17), d = R.r(10, 12), h = R.r(8, 10);
    const fh = B.box(hx - w / 2, hy - d / 2, hx + w / 2, hy + d / 2, 0, h, { r: 1.4, b: .7, top: .3, role: 'the farmhouse' });
    B.band(h - 1.4, { on: fh, sides: 'SE' }); B.door('S', .3, 3, 5, { on: fh, shape: 'round' }); B.window('S', .72, h * .5, 1.8, 1.8, { on: fh, shape: 'flat' }); B.window('E', .5, h * .5, 1.8, 1.8, { on: fh, shape: 'flat', lod: 2 });
    for (const z of [h * .3, h * .62]) B.band(z, { on: fh, sides: 'SE', lod: 2 });
    B.panel('S', .3 - 2.2 / w, .3 + 2.2 / w, 5, 5.6, { on: fh, lod: 2 });
    // the bread oven by the door, a mastaba bench along the wall
    B.lathe(hx - w / 2 - 3.2, hy + d / 2 - 2.5, [[2, 0], [2.2, 1.2], [1.6, 2.6], [.6, 3.2], [0, 3.3]], { n: 14, role: 'the farmhouse', lod: 2 });
    B.box(hx - w / 2 + 6.5, hy + d / 2, hx + w / 2 - 1.5, hy + d / 2 + 1.6, 0, 1.4, { r: .3, b: .2, role: 'the farmhouse', lod: 2 });
    // the dovecote: a tapering tower pocked with pigeon holes
    const dx = hx - w / 2 + 3.5, dy = hy - d / 2 + 3.5;
    const dH = 14, dv = B.box(dx - 3.2, dy - 3.2, dx + 3.2, dy + 3.2, h, h + dH, { r: 1.4, b: .5, top: 1.1, role: 'the dovecote', lod: 0 });
    // the rows of pots built into its walls, their mouths the pigeon holes, perches between the rows
    for (let r = 0; r < 5; r++) { const z = h + 2.2 + r * 2.3, k = 1.1 * (z - h) / dH; for (let c = 0; c < 3; c++) { B.mark([[dx - 1.6 + c * 1.6, dy + 3.2 - k, z], [dx - 1.2 + c * 1.6, dy + 3.2 - k, z]], { on: dv, n: [0, 1, 0], cls: 'edge', lod: 2 }); B.mark([[dx + 3.2 - k, dy - 1.6 + c * 1.6, z], [dx + 3.2 - k, dy - 1.2 + c * 1.6, z]], { on: dv, n: [1, 0, 0], cls: 'edge', lod: 2 }); } if (r) B.band(z - 1.1, { on: dv, sides: 'SE', lod: 2 }); }
    B.dome(dx, dy, 2.1, h + dH, { shape: 'round', role: 'the dovecote', lod: 1, finial: false });
    const hs = B.lathe(hx + w / 2 + 5, hy + d / 2 - 1, [[3.6, 0], [3.9, 2], [3.2, 4.6], [1.5, 6.4], [0, 7]], { n: 16, role: 'the haystack', lod: 1 });
    for (const [z, rr] of [[1.8, 3.92], [3.6, 3.55], [5.4, 2.5]]) hoop(B, hs, hx + w / 2 + 5, hy + d / 2 - 1, rr, z, { n: 22, lod: 2 });
    // the lift at the canal: a shaduf or a waterwheel
    const wx = sx + 6, wy = ty - 1;
    if (R.chance(.5)) {
      // the shaduf: two mud pillars, the beam across them, the sweep with its counterweight and bucket
      const pz = 10, pa = [wx - EH[0] * 3, wy - EH[1] * 3], pb = [wx + EH[0] * 3, wy + EH[1] * 3];
      for (const q of [pa, pb]) B.box(q[0] - 1.3, q[1] - 1.3, q[0] + 1.3, q[1] + 1.3, 0, pz, { r: .6, b: 0, top: .3, role: 'the shaduf', lod: 1 });
      B.line([[pa[0] - EH[0] * 1.4, pa[1] - EH[1] * 1.4, pz + .4], [pb[0] + EH[0] * 1.4, pb[1] + EH[1] * 1.4, pz + .4]], { role: 'the shaduf', lod: 1, w: 1.6 });
      const piv = [wx, wy, pz + .6], up = R.r(.25, .45), L1 = 8, L2 = 18, d = [EU[0] * .3 + S2 * .2, EU[1] * .3 + S2 * .2];
      const cw = [wx - (S2 * .9) * L1 * .6, wy - (S2 * .9) * L1 * .6, piv[2] - L1 * sin(-up)], bk = [wx + S2 * L2 * .55 + d[0], wy + S2 * L2 * .55 + d[1], piv[2] - L2 * sin(up) * .9];
      B.line([cw, piv, bk], { role: 'the shaduf', lod: 1, w: 1.5 });
      B.sphere(cw[0], cw[1], cw[2] - 1.8, 2, { role: 'the shaduf', lod: 1 });
      B.line([bk, [bk[0], bk[1], 1.8]], { role: 'the shaduf', lod: 1, cls: 'mid' });
      const bu = B.lathe(bk[0], bk[1], [[1, .5], [1.5, 1.4], [1.3, 2.4]], { n: 10, role: 'the shaduf', lod: 2 });
      hoop(B, bu, bk[0], bk[1], 1.42, 1.5, { n: 12, lod: 2 });
      // the pivot pin through the beam, and the ropes lashing the counterweight stone
      B.mark([[wx - EH[0] * .8, wy - EH[1] * .8, pz + .6], [wx + EH[0] * .8, wy + EH[1] * .8, pz + .6]], { on: B.parts[B.parts.length - 4], cls: 'edge', lod: 2 });
      figure(B, bk[0] + 4, bk[1] + 2, 8, { role: 'the shaduf', lod: 2 });
    } else {
      const Rw = 8.5, zc = Rw * .82, wheel = [];
      for (let k = 0; k <= 28; k++) { const a = k / 28 * TAU, z = zc + Rw * sin(a); if (z >= 0) wheel.push([wx + Rw * cos(a), wy, z]); }
      for (const px of [wx - 1.6, wx + 1.6]) B.box(px - .6, wy - 3.2, px + .6, wy - 1.4, 0, zc + 1, { r: .3, b: 0, role: 'the waterwheel', lod: 1 });
      const wp = B.plate(wheel, { role: 'the waterwheel', cls: 'nf' });
      const inner = []; for (let k = 0; k <= 28; k++) { const a = k / 28 * TAU, z = zc + Rw * .82 * sin(a); if (z >= .2) inner.push([wx + Rw * .82 * cos(a), wy, z]); }
      B.mark(inner, { on: wp, lod: 1 });
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + .2, z1 = zc + Rw * .82 * sin(a); if (z1 > .2) B.mark([[wx, wy, zc], [wx + Rw * .82 * cos(a), wy, z1]], { on: wp, lod: 1 }); }
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, z1 = zc + Rw * .91 * sin(a); if (z1 > .5) B.mark([[wx + Rw * .82 * cos(a), wy, z1], [wx + Rw * cos(a), wy, zc + Rw * sin(a)]], { on: wp, cls: 'edge', lod: 2 }); }
      B.box(wx + Rw * .3, wy + .4, wx + Rw * .3 + 2, wy + 7, zc + Rw * .7, zc + Rw * .7 + 1.4, { r: .3, b: 0, role: 'the waterwheel', lod: 2 });
    }
    // the row of trees on the far bank
    const tk = R.pick(['palm', 'poplar', 'round']), nt = R.i(5, 7);
    for (let i = 0; i < nt; i++) {
      const t = (i + .5) / nt, x = lerp(-e, e, t) + R.r(-2, 2), y = lerp(ty - 11, ty - 15, t);
      if (abs(x - wx) < 6) continue;
      if (tk === 'palm') palm(B, R, x, y, R.r(20, 25), { role: 'the trees', lod: 0, lean: .08 });
      else if (tk === 'poplar') cypress(B, R, x, y, min(R.r(19, 23), h + dH - 1), { w: .1, role: 'the poplars', lod: 0 });
      else leafy(B, R, x, y, min(R.r(16, 20), h + dH - 1), { role: 'the trees', lod: 0, r: R.r(5, 6.5) });
    }
  });
  const ctr4 = q => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];

  /* a faceted peak: a broad foot, an offset shoulder and a small summit. Ridges run down from the
     summit; the faces turned away from the light (to the right of the view) are hatched; o.snow is
     the height of the snow line as a fraction, drawn as a jagged line that dips in the gullies */
  function peak(B, R, cx, cy, Rb, h, o = {}) {
    const n = 9, rot = R() * TAU, a0 = R() * TAU, z0 = o.z || 0;
    const sx = R.r(-.2, .2) * Rb, sy = R.r(-.2, .2) * Rb, zs = h * R.r(.36, .5);
    const base = wob(R, cx, cy, Rb, Rb * R.r(.78, .95), n, .12, rot, a0);
    const sh = wob(R, cx + sx, cy + sy, Rb * R.r(.44, .54), Rb * R.r(.36, .46), n, .22, rot, a0);
    const top = wob(R, cx + sx * 1.8, cy + sy * 1.8, Rb * .09, Rb * .06, n, .3, rot, a0);
    const layers = [[base, z0], [sh, z0 + zs], [top, z0 + h]];
    const p = sol(B, layers, { role: o.role || 'the mountains', lod: o.lod || 0 });
    const ctr = [cx + sx, cy + sy];
    for (let i = 0; i < n; i++) {
      if (!R.chance(.55)) continue;
      const end = lerp2(sh[i], base[i], R.r(.55, .9));
      surf(B, p, [[top[i][0], top[i][1], z0 + h], [sh[i][0], sh[i][1], z0 + zs], [end[0], end[1], z0 + zs * .3]], ctr, { radial: true, slope: .55, cls: 'mid', lod: 1 });
    }
    const snowZ = o.snow ? z0 + h * o.snow : null;
    if (snowZ) {
      const pts = [];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        const t = k / 3, z = snowZ + (k === 0 ? h * .05 : -h * (k === 1 ? .08 : .03)), S = sectionAt(layers, z);
        const a = S[i], b = S[(i + 1) % n]; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), z]);
      }
      pts.push(pts[0]);
      surf(B, p, pts, ctr, { slope: .5, cls: 'mid', lod: 1 });
    }
    // the shaded faces, to the right of the view
    shade(B, p, layers, ctr, { zHi: snowZ ? snowZ - h * .09 : z0 + h * .9, zLo: z0 + h * .06 });
    // up close: the bedding of the rock in bands round the peak, below the snow
    const zTop = snowZ ? snowZ - h * .12 : z0 + h * .78, nb = max(2, round((zTop - z0) / max(4.5, h * .11)));
    const bz = []; for (let k = 1; k <= nb; k++) bz.push(lerp(z0 + h * .08, zTop, k / (nb + .3)));
    strata(B, p, layers, ctr, bz, { n: 36, slope: .45, wave: h * .012, lod: 2 });
    // the snow running down the gullies below its line, each streak thinning to nothing
    if (snowZ) for (let i = 0; i < n; i++) { if (i % 2) continue; const z1 = snowZ - h * .07, z2 = z1 - h * R.r(.08, .16), a = lerp2(sectionAt(layers, z1)[i], sectionAt(layers, z1)[(i + 1) % n], .5), b = lerp2(sectionAt(layers, z2)[i], sectionAt(layers, z2)[(i + 1) % n], .5); surf(B, p, [[a[0], a[1], z1], [b[0], b[1], z2]], ctr, { radial: true, slope: .5, cls: 'mid', lod: 2 }); }
    p.layers = layers; p.ctr = ctr;
    return p;
  }
  /* The mountains: two to four rocky peaks crowding together, each with a lesser summit on its
     shoulder, snow on the tallest, a path in switchbacks up to the pass, and scree at their feet */
  def('mountain', (R, B) => {
    const n = R.i(2, 4);
    // two great peaks either side of a pass, a valley open toward the eye, foothills at its mouth
    const spec = [[-18, -14, 30, R.r(58, 68), -1], [22, -20, 23, R.r(36, 44), 1], [-34, 22, 16, R.r(22, 28), -1], [32, 24, 13, R.r(15, 20), 1]];
    const ps = [];
    for (let i = 0; i < n; i++) {
      const [x, y, r, h, sd] = spec[i], px = x + R.r(-2, 2), py = y + R.r(-2, 2);
      if (i < 2) { const ox = px + (EH[0] * sd * .62 + EU[0] * .2) * r, oy = py + (EH[1] * sd * .62 + EU[1] * .2) * r; peak(B, R, ox, oy, r * .6, h * R.r(.55, .7), { role: i === 0 ? 'the high peak' : 'the mountains', snow: i === 0 ? .8 : 0, lod: 0 }); }
      ps.push(peak(B, R, px, py, r, h, { role: i === 0 ? 'the high peak' : 'the mountains', snow: i === 0 ? R.r(.56, .66) : (i === 1 && R.chance(.4) ? .76 : 0), lod: i < 3 ? 0 : 1 }));
    }
    // the path: up the valley, then in switchbacks across the high peak's flank to the pass
    const P0 = ps[0], P1 = ps[1], c0 = [P0.cx, P0.cy];
    const col = lerp2(c0, [P1.cx, P1.cy], .52), start = [col[0] + 10, col[1] + 26], zz = [];
    let x = start[0], y = start[1];
    for (let k = 0; k < 6; k++) { const sd = k % 2 ? 1 : -1; zz.push([x, y]); x += EH[0] * sd * 5 + (col[0] - x) * .2; y += EH[1] * sd * 5 + (col[1] - y) * .2; }
    zz.push(col);
    const hz = (qx, qy) => max(heightIn(P0.layers, qx, qy), heightIn(P1.layers, qx, qy));
    const trail = spline(zz, 4).map(q => [q[0], q[1], hz(q[0], q[1]) + .4]);
    B.line(trail, { role: 'the path to the pass', cls: 'mid', lod: 1 });
    B.guide(spline([[start[0] + 6, 48], [start[0] + 2, start[1] + 12], start], 5));
    // the stones set along the edge of the path where it crosses the slope, and the cairn at the pass
    for (let i = 2; i < trail.length - 1; i += 2) { const a = trail[i], b = trail[i + 1], d = hypot(b[0] - a[0], b[1] - a[1]) || 1, ox = (b[1] - a[1]) / d * .9, oy = -(b[0] - a[0]) / d * .9; B.mark([[a[0] + ox, a[1] + oy, a[2]], [a[0] + ox * 1.5, a[1] + oy * 1.5, a[2] + .5]], { on: trail.part || B.parts[B.parts.length - 1], cls: 'lo', lod: 2 }); }
    { let z = hz(col[0], col[1]); for (const [r, hh] of [[1.6, 1], [1.25, .9], [.9, .8], [.55, .7]]) { rock(B, R, col[0] + .6, col[1] + .6, r, hh, { z, role: 'the path to the pass', lod: 2, plain: true }); z += hh * .85; } }
    // the scree fans at the feet of the two great peaks, the stones thinning out toward their toes
    for (const [pk, da] of [[ps[0], -.35], [ps[0], .45], [ps[1], .2]]) {
      if (!pk) continue;
      const fa = PI / 4 + da, tip = ringAt(pk.layers, pk.ctr, pk.layers[0][1] + .2, 1, fa)[0], L = pk === ps[0] ? 13 : 10, fan = [[tip[0] - cos(fa) * 2, tip[1] - sin(fa) * 2]];
      for (let k = 0; k <= 6; k++) { const a = fa - .42 + .84 * k / 6, l = L * (1 + sin(k * 1.3) * .1); fan.push([tip[0] + cos(a) * l, tip[1] + sin(a) * l]); }
      const sf = B.plate(at(fan, -.12), { role: 'the mountains', cls: 'lo', lod: 1 });
      for (let k = 0; k < 26; k++) { const a = fa + R.r(-.38, .38), d = pow(R(), 1.3) * L * .92, x = tip[0] + cos(a) * d, y = tip[1] + sin(a) * d, sz = lerp(.8, .22, d / L); B.mark([[x - sz, y, -.12], [x, y - sz * .8, -.12], [x + sz * .9, y + sz * .2, -.12], [x, y + sz * .7, -.12]], { on: sf, closed: true, lod: 2 }); }
    }
    // the meltwater stream out of the pass, down across the valley floor
    const ms = spline([[col[0] + 4, col[1] + 8], [col[0] + 12, col[1] + 18], [col[0] + 8, col[1] + 30], [col[0] + 16, 46]], 4).map(q => [q[0], q[1]]);
    const mst = B.plate(at(ribbon(ms, 1.4, 3.4).poly, -.12), { role: 'the path to the pass', cls: 'lo', lod: 1 });
    streamShine(B, mst, R, ms, 1.4, -.12, 2);
    pebbles(B, mst, R, ms[ms.length - 3][0], ms[ms.length - 3][1], 2.6, 2, 8, -.12);
    // the boulders the mountain has shed, and the scrub pines on the foothills
    const feet = [[8, 34], [-10, 30], [-44, -2], [44, 2]];
    for (let i = 0; i < 4; i++) { const [fx, fy] = feet[i]; rock(B, R, fx + R.r(-3, 3), fy + R.r(-3, 3), R.r(2.4, 3.8), R.r(2, 3.4), { lod: i < 2 ? 1 : 2 }); }
    for (let k = 0; k < 6; k++) { const a = R() * TAU, d = R.r(4, 9), f = feet[k % 2]; rock(B, R, f[0] + cos(a) * d, f[1] + sin(a) * d, R.r(.9, 1.6), R.r(.8, 1.4), { lod: 2, plain: true }); }
    for (let k = 0; k < 3; k++) { const q = ps[min(ps.length - 1, 2 + (k % 2))] || ps[1], a = PI / 4 + (k - 1) * .7, x = q.cx + cos(a) * 14, y = q.cy + sin(a) * 14, z = heightIn(q.layers, x, y); conifer(B, R, x, y, R.r(8, 11), { z, tiers: 2, role: 'the mountains', lod: 2 }); }
  });

  /* An island in the open sea: a beach round a low rocky land, a hill, palms; and, by seed, Sindbad's
     ship riding at anchor, a wreck on the sand, or the rukh's great white egg */
  def('island', (R, B) => {
    const ix = R.r(-8, -2), iy = R.r(-10, -4), irx = R.r(27, 31), iry = irx * R.r(.64, .76), rot = R.r(-.8, -.3);
    const v = R.pick(['ship', 'wreck', 'egg']);
    const shipAt = [26, 26];
    const sea = seaPlate(B, R, { avoid: [[ix, iy, irx + 5, irx + 5], ...(v === 'ship' ? [[shipAt[0], shipAt[1], 18, 14]] : [])], n: 28 });
    const shore = wob(R, ix, iy, irx, iry, 16, .06, rot), c = [ix, iy];
    // the wash of the waves along the beach
    const wash = closed(scl(shore, 1.12, c)).map((p, i) => [p[0], p[1], .05]);
    B.mark(wash, { on: sea, lod: 1 });
    // the reef offshore, where the swell breaks: short crests in a broken ring
    for (let k = 0; k < 16; k++) { const t = k / 16, q = lerp2(shore[Math.floor(t * 16) % 16], shore[(Math.floor(t * 16) + 1) % 16], .5), d = 1.3 + .05 * sin(k * 2.3), x = c[0] + (q[0] - c[0]) * d, y = c[1] + (q[1] - c[1]) * d; if (k % 3 === 2) continue; B.mark(waveAt(x, y, R.r(3, 5.5), 2), { on: sea, lod: 2 }); }
    const beach = sol(B, [[shore, 0], [scl(shore, .9, c), 1]], { role: 'the shore' });
    // on the sand: the tide line of weed, shells and pebbles thinning up the beach
    B.mark(closed(scl(shore, .945, c)).map((p, i) => [p[0] + sin(i * 2.7) * .4, p[1] + cos(i * 1.9) * .4, 1]), { on: beach, lod: 2 });
    for (let k = 0; k < 4; k++) { const q = scl(shore, .935, c)[R.i(0, 15)]; pebbles(B, beach, R, q[0], q[1], 1.6, 1.1, 6, 1); }
    const LL = [[scl(shore, .82, c), 1], [shiftP(scl(shore, .62, c), -2, -2), 4]];
    const land = sol(B, LL, { role: 'the island', crease: .8 });
    surf(B, land, closed(scl(shore, .86, c)).map(p => [p[0], p[1], 1.2]), c, { slope: .1, lod: 2 });
    // driftwood thrown up by a storm, and beach grass on the dunes behind the sand
    { const q = scl(shore, .9, c)[R.i(3, 7)]; log(B, q[0], q[1], R.r(5, 7), .55, R() * PI, { z: 1, role: 'the shore', lod: 2, rings: [1], bark: [.5] }); }
    for (let k = 0; k < 3; k++) { const q = scl(shore, .8, c)[R.i(1, 8)]; tuft(B, R, q[0], q[1], heightIn(LL, q[0], q[1]), R.r(1.8, 2.6), { role: 'the island', lod: 2 }); }
    // the hill
    const hx = ix - irx * .25, hy = iy - iry * .3;
    const hr = irx * .48, hh = R.r(8, 10.5), hrot = R() * TAU;
    const HL = [[wob(R, hx, hy, hr, hr * .78, 12, .06, hrot), 4], [wob(R, hx + .5, hy - .5, hr * .74, hr * .56, 12, .07, hrot), 4 + hh * .5], [wob(R, hx + 1, hy - 1, hr * .34, hr * .26, 12, .1, hrot), 4 + hh]];
    const hill = sol(B, HL, { role: 'the hill' });
    shade(B, hill, HL, [hx, hy], { dense: 5, min: .1 });
    strata(B, hill, HL, [hx + .5, hy - .5], [4 + hh * .25, 4 + hh * .5, 4 + hh * .72], { n: 30, slope: .4, wave: .25, lod: 2 });
    // palms on the beach and the land
    const np = R.i(3, 5);
    for (let i = 0; i < np; i++) { const a = PI * .1 + i / np * PI * .9 + R.r(-.15, .15), d = R.r(.68, .82); const px = ix + cos(a + rot) * irx * d, py = iy + sin(a + rot) * iry * d; palm(B, R, px, py, R.r(17, 23), { z: heightIn(LL, px, py) || 1, role: 'the palms', lod: 0, lean: .16, dir: a + rot }); }
    for (let i = 0; i < 3; i++) { const a = R.r(-1, 2.6) + rot, p = [ix + cos(a) * irx * 1.02, iy + sin(a) * iry * 1.02]; rock(B, R, p[0], p[1], R.r(2, 3.2), R.r(1.6, 2.8), { lod: i ? 2 : 1 }); }
    if (v === 'ship') { const sh = dhow(B, R, shipAt[0], shipAt[1], 36, -PI / 4 + R.r(-.3, .3), { sail: 'furled', anchor: true, role: 'the ship at anchor' }); }
    else if (v === 'wreck') {
      const wx = ix + irx * .55, wy = iy + iry * .75, a = R.r(-.6, .6) - PI / 4, L = 26, W = 7;
      const c2 = cos(a), s2 = sin(a), T = (X, Y, Z = 0) => [wx + X * c2 - Y * s2, wy + X * s2 + Y * c2, Z];
      const hb = hullPts(L * .8, W * .8, 10).map(p => T(p[0], p[1]).slice(0, 2)), hd = hullPts(L, W, 10).map(p => T(p[0], p[1] + W * .45).slice(0, 2));
      const wr = sol(B, [[hb, 0], [hd, 3.2]], { role: 'the wreck', crease: .5 });
      for (let k = -3; k <= 3; k++) B.mark([T(k * 3, -W * .35, .3), T(k * 3, W * .2, 2.4), T(k * 3 + .2, W * .55, 3.2)], { on: wr, cls: 'mid', lod: 1 });
      B.line([T(2, W * .3, 3), T(-4, W * 1.6, 12)], { role: 'the wreck', lod: 1, w: 1.5 });
      B.plate([T(-1, W * .9, 7), T(-4, W * 1.6, 12), T(-9, W * 1.2, 4), T(-5, W * .9, 3.5)], { role: 'the wreck', lod: 2 });
      // her planking, sprung where she struck; a cask and loose planks the sea brought ashore
      for (const f of [.3, .55, .8]) B.mark(hullPts(L * lerp(.8, 1, f), W * lerp(.8, 1, f), 10).slice(0, 11).map(p => T(p[0], p[1] + W * .45 * f, 3.2 * f)), { on: wr, lod: 2 });
      const ck = T(L * .62, W * 1.1); const cask = B.lathe(ck[0], ck[1], [[1, 0], [1.25, .9], [1.25, 1.7], [1, 2.6]], { n: 12, role: 'the wreck', lod: 2 }); for (const z of [.4, 2.2]) hoop(B, cask, ck[0], ck[1], 1.12, z, { n: 14, lod: 2 });
      for (const [X, Y, A2] of [[-L * .7, W * .6, .5], [-L * .55, -W * .4, -.3]]) { const q = T(X, Y), aa = a + A2, ux = cos(aa), uy = sin(aa); sol(B, [[[[q[0] - ux * 3 - uy * .45, q[1] - uy * 3 + ux * .45], [q[0] + ux * 3 - uy * .45, q[1] + uy * 3 + ux * .45], [q[0] + ux * 3 + uy * .45, q[1] + uy * 3 - ux * .45], [q[0] - ux * 3 + uy * .45, q[1] - uy * 3 - ux * .45]], 0], [[[q[0] - ux * 3 - uy * .45, q[1] - uy * 3 + ux * .45], [q[0] + ux * 3 - uy * .45, q[1] + uy * 3 + ux * .45], [q[0] + ux * 3 + uy * .45, q[1] + uy * 3 - ux * .45], [q[0] - ux * 3 + uy * .45, q[1] - uy * 3 - ux * .45]], .4]], { role: 'the wreck', lod: 2 }); }
    } else {
      const ex = ix + irx * .3, ey = iy + iry * .05, er = 7.5;
      const egg = B.lathe(ex, ey, [[er * .8, 4], [er, 4 + er * .5], [er * .92, 4 + er * 1.05], [er * .6, 4 + er * 1.5], [0, 4 + er * 1.72]], { n: 24, role: 'the egg of the rukh' });
      // the speckles of the shell, and the hollow it lies in
      for (let k = 0; k < 18; k++) { const a = R() * TAU, f = R.r(.15, .9), rr = f < .45 ? er * lerp(.82, 1, f / .45) : er * lerp(1, .62, (f - .45) / .55), z = 4 + er * 1.6 * f, q = [ex + cos(a) * rr, ey + sin(a) * rr], sz = R.r(.18, .4); B.mark([[q[0] - sin(a) * sz, q[1] + cos(a) * sz, z], [q[0], q[1], z + sz * .7], [q[0] + sin(a) * sz, q[1] - cos(a) * sz, z], [q[0], q[1], z - sz * .7]], { on: egg, closed: true, n: [cos(a), sin(a), .3], lod: 2 }); }
      figure(B, ex + er + 3, ey + 4, 6.5, { z: 4, role: 'the egg of the rukh', lod: 2 });
    }
  });

  /* The open sea: a dhow running under its lateen sail, the waves, the wake; by seed a second
     ship on the horizon, the island-whale of Sindbad with palms on its back, or the rukh's shadow */
  def('sea', (R, B, A) => {
    const v = A.v || R.pick(['two', 'whale', 'rukh', 'one']), right = R.chance(.5), hd = (right ? -PI / 4 : PI * .75) + R.r(-.15, .15);
    const sx = -4, sy = -6, L = 50;
    const avoid = []; for (let k = -1; k <= 1; k++) avoid.push([sx + cos(hd) * k * L * .45, sy + sin(hd) * k * L * .45, 12, 12]);
    const fx = sx + cos(hd) * 30 + EU[0] * 26, fy = sy + sin(hd) * 30 + EU[1] * 26;
    if (v === 'two') avoid.push([fx, fy, 12, 12]);
    if (v === 'whale') avoid.push([24, 28, 22, 14]);
    const sea = seaPlate(B, R, { avoid, n: 38 });
    dhow(B, R, sx, sy, L, hd, { sail: 'set', masts: R.chance(.4) ? 2 : 1, sea, wake: true });
    if (v === 'two') dhow(B, R, fx, fy, 22, hd + R.r(-.3, .3), { sail: 'set', role: 'the other ship', lod: 1 });
    else if (v === 'whale') {
      const ox = 22, oy = 28, a = R.r(-.25, .25) - PI / 4, sh = [ell(ox, oy, 20, 8, 18, a), ell(ox, oy, 15, 5.6, 18, a), ell(ox - 1, oy - 1, 8, 3.2, 18, a)];
      const wh = sol(B, [[sh[0], 0], [sh[1], 3.2], [sh[2], 5]], { role: 'the island-whale' });
      for (let i = 0; i < 2; i++) palm(B, R, ox + R.r(-5, 3), oy + R.r(-2, 2), R.r(11, 14), { z: 4.6, role: 'the island-whale', lod: 1, lean: .12 });
      const tx = ox - cos(a) * 25, ty = oy - sin(a) * 25;
      const F = (u, z) => [tx + EH[0] * u, ty + EH[1] * u, z];
      B.plate([F(-1.1, 0), F(-.8, 3.4), F(-3.2, 5.6), F(-6, 7.8), F(-4.2, 8.2), F(-1.8, 7.4), F(0, 6.4), F(1.8, 7.4), F(4.2, 8.2), F(6, 7.8), F(3.2, 5.6), F(.8, 3.4), F(1.1, 0)], { role: 'the island-whale', lod: 1 });
      B.mark(waveAt(tx, ty, 9, 3, .05), { on: sea, lod: 1 });
      for (const f of [.4, .55]) B.mark(at(closed(ell(ox, oy, 20 / f * .5 + 4, 8 / f * .5 + 2, 22, a)), .05), { on: sea, lod: 2 });
      B.mark(spline([[ox + 3, oy, 5.2], [ox + 3.6, oy - .6, 9], [ox + 2.6, oy - 1.2, 13], [ox + 3.8, oy - 1.6, 17]], 3), { on: wh, lod: 2 });
    } else if (v === 'rukh') {
      const bx = 14, by = 26, P = (u, w) => [bx + (u * EH[0] + w * EU[0]) * 1.1, by + (u * EH[1] + w * EU[1]) * 1.1, .05];
      const shadow = [P(0, 8), P(4, 4), P(16, 9), P(30, 6), P(22, 1), P(6, -1), P(3, -8), P(0, -11), P(-3, -8), P(-6, -1), P(-22, 1), P(-30, 6), P(-16, 9), P(-4, 4)];
      const sp = B.plate(shadow, { role: 'the shadow of the rukh', cls: 'lo', lod: 1 });
      for (const l of hatch(shadow.map(p => [p[0], p[1]]), PI / 4, 1.8)) B.mark(at(l, .06), { on: sp, lod: 1 });
    }
  });

  /* ---------- on the way: camps, caravans, wells, roads and the places a tale stops at ---------- */
  const GOAT = {
    legs: [CU([[20, 46], [25, 46], [24, 2], [26, 0], [21, 0], [21, 2]], 100), CU([[27, 46], [32, 46], [31, 2], [33, 0], [28, 0], [28, 2]], 100), CU([[60, 46], [65, 46], [64, 2], [66, 0], [61, 0], [61, 2]], 100), CU([[67, 46], [72, 46], [71, 2], [73, 0], [68, 0], [68, 2]], 100)],
    body: CU([[16, 60], [9, 72], [12, 73], [19, 66], [58, 66], [68, 70], [74, 80], [72, 92], [66, 102], [76, 95], [81, 86], [89, 86], [99, 78], [97, 73], [89, 73], [85, 64], [86, 56], [82, 56], [79, 62], [74, 50], [64, 43], [24, 43], [17, 50]], 100),
  };
  const FLAME = [[-.3, 0], [-.38, .3], [-.22, .56], [-.18, .34], [-.04, .76], [0, 1], [.08, .6], [.2, .82], [.32, .4], [.36, .14], [.3, 0]];
  function goat(B, x, y, h, o = {}) { const polys = [...GOAT.legs, GOAT.body]; return B.cut(o.flip ? flipPolys(polys) : polys, x, y, 0, h, { w: h, role: o.role || 'the flock', lod: o.lod == null ? 2 : o.lod }); }

  /* a Bedouin black tent, the bayt al-sha'r: a long low roof of goat-hair strips sagging between its
     poles, the back and the ends walled, the front open on its poles into the shade inside */
  function tent(B, R, cx, cy, Lx, D, H, o = {}) {
    const role = o.role || 'the black tents', lod = o.lod || 0;
    const x0 = cx - Lx / 2, x1 = cx + Lx / 2, y0 = cy - D / 2, y1 = cy + D / 2, yc = cy - D * .1;
    const bays = o.bays || R.i(3, 4), eave = H * .5, sag = H * .17, zb = 1.2, He = H * .8, K = bays * 4;
    const ridge = [], front = [], back = [];
    for (let i = 0; i <= K; i++) {
      const x = lerp(x0, x1, i / K), ph = (i % 4) / 4, end = i === 0 || i === K;
      ridge.push([x, yc, end ? He : H - sag * sin(ph * PI)]); front.push([x, y1, eave - sag * .45 * sin(ph * PI)]); back.push([x, y0, zb]);
    }
    B.plate([...ridge, ...back.slice().reverse()], { role, lod });
    B.plate([[x0, y0, 0], [x0, y0, zb], [x0, yc, He], [x0, y1, eave], [x0, y1, 0]], { role, lod: 2 });
    const roof = B.plate([...ridge, ...front.slice().reverse()], { role, lod });
    // the woven strips run the length of the roof
    for (const [f, ml] of [[.25, 2], [.5, 1], [.75, 2]]) B.mark(ridge.map((r, i) => [lerp(r[0], front[i][0], f), lerp(r[1], front[i][1], f), lerp(r[2], front[i][2], f)]), { on: roof, lod: ml });
    const endE = B.plate([[x1, y0, 0], [x1, y0, zb], [x1, yc, He], [x1, y1, eave], [x1, y1, 0]], { role, lod });
    for (const f of [.33, .66]) B.mark([[x1, lerp(y0, y1, f), 0], [x1, lerp(y0, y1, f), lerp(f < .5 ? zb : He, f < .5 ? He : eave, f < .5 ? f / .4 : (f - .4) / .6) - .4]], { on: endE, lod: 2 });
    const curt = B.plate([[x0, y1, 0], ...front, [x1, y1, 0]], { role, lod });
    // the open front: poles, and the shade inside drawn close
    const shut = o.shut == null ? bays - 1 : o.shut;
    for (let i = 0; i <= K; i++) {
      const f = front[i];
      if (i % 4 === 0) B.mark([[f[0], y1, 0], [f[0], y1, f[2] + .6]], { on: curt, cls: 'edge', lod: 1 });
      if (i < shut * 4) for (const dx of [.35, .7]) { const x = lerp(f[0], front[min(K, i + 1)][0], dx), z = lerp(f[2], front[min(K, i + 1)][2], dx); if (i % 4 || dx > .4) B.mark([[x, y1, .3], [x, y1, z - .5]], { on: curt, lod: 1 }); }
    }
    // the guy ropes out to their stakes, each rope ending on its stake's head
    for (let i = 0; i <= K; i += 4) { const f = front[i], sx = f[0] + R.r(-1, 1), sy = y1 + 6; rope(B, curt, [f[0], y1, f[2]], [sx, sy, .8], .25, { lod: 2 }); if (lod < 2 && Lx > 24) stake(B, sx, sy, { role, lod: 2 }); }
    { const sx = x1 + 6, sy = yc + R.r(-1, 1); rope(B, endE, [x1, yc, He], [sx, sy, .8], .3, { lod: 2 }); if (lod < 2 && Lx > 24) stake(B, sx, sy, { role, lod: 2 }); }
    // the straps across the roof at each pole, where the strips are tensioned, and the woven band of the back wall
    for (let i = 4; i < K; i += 4) B.mark([ridge[i], front[i]], { on: roof, cls: 'mid', lod: 2 });
    for (let i = 0; i < K; i++) if (i % 4 === 2) B.mark([lerp3(ridge[i], front[i], .08), lerp3(ridge[i], front[i], .92)], { on: roof, lod: 2 });
    return roof;
  }
  /* A Bedouin camp: two or three long black tents in an arc, a hearth with its coffee pot, couched
     camels, a tethered mare, and a few goats */
  def('camp', (R, B) => {
    const nt = R.i(2, 3);
    tent(B, R, -12, -24, R.r(36, 42), 14, R.r(9, 10.5), { role: 'the sheikh\'s tent' });
    tent(B, R, 26, -4, R.r(26, 30), 12, R.r(7.5, 8.5));
    if (nt > 2) tent(B, R, -32, 14, R.r(20, 24), 10, R.r(6.5, 7.5), { lod: 1, shut: 0 });
    // the hearth
    const fx = R.r(0, 6), fy = R.r(10, 16);
    const hearth = B.cyl(fx, fy, 3.6, 0, 1.1, { n: 11, b: .7, role: 'the fire' });
    for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, p = [fx + cos(a) * 3.6, fy + sin(a) * 3.6]; B.mark([[p[0], p[1], 0], [p[0], p[1], 1.1]], { on: hearth, n: [cos(a), sin(a), 0], lod: 2 }); }
    B.cut([FLAME], fx, fy, 1, 4.2, { w: 3.4, role: 'the fire', lod: 1 });
    B.line(spline([[fx, fy, 5.2], [fx + .8, fy - .6, 8.5], [fx - .4, fy - 1, 12], [fx + 1.2, fy - 2, 16], [fx + .4, fy - 3, 20]], 3), { role: 'the fire', cls: 'lo', lod: 1 });
    const pot = B.lathe(fx + 5, fy + 1.5, [[1, 0], [1.3, .9], [.8, 2.2], [.5, 2.6], [.9, 3.2], [0, 3.8]], { n: 12, role: 'the coffee pot', lod: 2 });
    B.mark([[fx + 5 + .9, fy + 1.5 + .9, 2.4], [fx + 5 + 2, fy + 1.5 + 2, 3.4]], { on: pot, cls: 'edge', lod: 2 });   // its beak
    // the mortar for the coffee beans with its pestle, the firewood stacked by the hearth, the embers' ring
    const mo = B.cyl(fx - 4.2, fy - 2.2, 1, 0, 2.2, { n: 12, b: .25, top: .85, role: 'the coffee pot', lod: 2 });
    B.mark([[fx - 4.2, fy - 2.2, 2.2], [fx - 3.7, fy - 2.6, 4.4]], { on: mo, cls: 'edge', lod: 2 });
    for (let k = 0; k < 3; k++) log(B, fx + R.r(-1, 1) - 6.5, fy + 2.5 + k * .9, R.r(3.6, 4.6), .35, -PI / 4 + R.r(-.2, .2), { z: k === 2 ? .7 : 0, role: 'the fire', lod: 2, rings: [1], bark: [.5] });
    B.mark(at(closed(ell(fx, fy, 2.4, 2.4, 14)), 1.1), { on: hearth, lod: 2 });
    // before the sheikh's tent the rug of welcome, its borders and its field
    const rgx = -12 + R.r(-3, 3), rgy = -24 + 7 + 3.6, rug = B.plate([[rgx - 9, rgy, .04], [rgx + 9, rgy, .04], [rgx + 9, rgy + 6.5, .04], [rgx - 9, rgy + 6.5, .04]], { role: 'the sheikh\'s tent', lod: 1 });
    for (const g of [.7, 1.6]) B.mark(at(closed([[rgx - 9 + g, rgy + g], [rgx + 9 - g, rgy + g], [rgx + 9 - g, rgy + 6.5 - g], [rgx - 9 + g, rgy + 6.5 - g]]), .04), { on: rug, lod: 2 });
    for (let k = 0; k < 5; k++) { const cx2 = rgx - 6 + k * 3; B.mark(at(closed([[cx2 - 1, rgy + 3.25], [cx2, rgy + 2.3], [cx2 + 1, rgy + 3.25], [cx2, rgy + 4.2]]), .04), { on: rug, lod: 2 }); }
    // the camel saddles set down by the tent, the waterskins hung on their tripod
    for (const [sx2, sy2] of [[rgx + 13, rgy + 2], [rgx + 16.5, rgy + 3.5]]) { const sd = B.box(sx2 - 1.6, sy2 - 1, sx2 + 1.6, sy2 + 1, 0, 1.2, { r: .4, b: .2, role: 'the sheikh\'s tent', lod: 2 }); for (const dx of [-1.1, 1.1]) B.mark([[sx2 + dx, sy2 + 1, 1.2], [sx2 + dx * .8, sy2 + 1, 3], [sx2 + dx * .4, sy2 + 1, 3.3]], { on: sd, cls: 'edge', lod: 2 }); }
    { const tx2 = fx + 10, ty2 = fy - 6, tz = 7.5, tp = B.line([[tx2 - 2, ty2 + 1, 0], [tx2, ty2, tz], [tx2 + 2, ty2 + 1, 0], [tx2, ty2, tz], [tx2, ty2 - 2.2, 0]], { role: 'the fire', lod: 2, w: 1.1 });
      B.mark([[tx2, ty2, tz - .3], [tx2, ty2, tz - 1.6]], { on: tp, lod: 2 });
      sol(B, [[ell(tx2, ty2 + .2, .5, .5, 8), tz - 4.6], [ell(tx2, ty2 + .2, 1.3, 1, 8), tz - 3.4], [ell(tx2, ty2 + .2, .4, .4, 8), tz - 1.6]], { role: 'the fire', lod: 2 }); }
    // couched camels and the mare at her picket
    const nc = R.i(2, 3), cam = [[-18, 6], [24, 18], [-4, 30]];
    for (let i = 0; i < nc; i++) camelDown(B, cam[i][0] + R.r(-2, 2), cam[i][1] + R.r(-2, 2), 8, { flip: R.chance(.5), lod: 1 });
    const hx = 34 + R.r(-3, 2), hy = 30 + R.r(-2, 2);
    horse(B, hx, hy, 9.5, { flip: R.chance(.5), role: 'the mare', lod: 1 });
    B.line([[hx - 9, hy - 1, 0], [hx - 9, hy - 1, 2.4], [hx - 3, hy, 7.6]], { role: 'the mare', cls: 'mid', lod: 2 });
    for (let k = 0; k < 3; k++) goat(B, -26 + k * 5 + R.r(-1, 1), 30 + R.r(-3, 3), 4, { flip: R.chance(.5) });
    figure(B, fx - 5, fy + 4, 8, { role: 'the sheikh', lod: 2 });
  });

  /* A caravan on the road: four to six laden camels roped nose to tail, one bearing a litter, led
     by a man on foot along the track, past a cairn or a milestone, low dunes behind */
  def('caravan', (R, B) => {
    const nc = R.i(4, 6), away = R.chance(.5), h = 15, w = h * 1.3;
    // the track runs across the view, rising away to the right
    const dir = [EH[0] * .86 + EU[0] * .5, EH[1] * .86 + EU[1] * .5], d0 = hypot(dir[0], dir[1]); dir[0] /= d0; dir[1] /= d0;
    const P = t => [dir[0] * t + EU[1] * sin(t / 30) * 3, dir[1] * t + EU[0] * sin(t / 30) * 3];
    const tr = []; for (let t = -58; t <= 58; t += 6) tr.push(P(t));
    B.guide(tr);
    // the track itself, beaten into the sand by the camels before these, their pads printed down it in pairs
    const tband = []; for (let t = -50; t <= 50; t += 4) tband.push(P(t));
    const track = B.plate(at(ribbon(tband, 7).poly, -.12), { role: 'the caravan track', cls: 'lo', lod: 1 });
    for (let t = -48; t <= 48; t += 2.6) { const p = P(t), q = P(t + 1), d = hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d, sd = round(t / 2.6) % 2 ? 1 : -1, off = (t % 7.8 < 2.6 ? 2.2 : -1.6); B.mark(at(closed(ell(p[0] - uy * (sd * .7 + off), p[1] + ux * (sd * .7 + off), .5, .42, 7, Math.atan2(uy, ux))), -.12), { on: track, lod: 2 }); }
    // the wind's ripples and a gravel lag on the open sand either side, and the tussocks
    for (const [t, side] of [[-34, 1], [8, -1], [30, 1]]) { const p = P(t), x = p[0] - EU[0] * side * 16, y = p[1] - EU[1] * side * 16; if (hypot(x, y) < 44) ripples(B, track, R, x, y, Math.atan2(EU[1], EU[0]) + R.r(-.2, .2), R.i(5, 7), R.r(10, 14), 1.6, -.12, { amp: .26 }); }
    { const p = P(-6), x = p[0] + EU[0] * 15, y = p[1] + EU[1] * 15; pebbles(B, track, R, x, y, 6, 4, 22, -.12); }
    for (let k = 0; k < 4; k++) { const p = P(R.r(-40, 40)), sd = k % 2 ? 1 : -1; tuft(B, R, p[0] - EU[0] * sd * R.r(8, 13), p[1] - EU[1] * sd * R.r(8, 13), 0, R.r(1.8, 2.6), { role: 'the caravan track' }); }
    // the camels, from the back of the line to its head
    const sp = 20, t0 = -((nc - 1) * sp) / 2 - 8, litter = R.i(1, nc - 2);
    const at2 = [];
    for (let i = 0; i < nc; i++) {
      const t = away ? t0 + i * sp : -t0 - i * sp, [x, y] = P(t);
      at2.push([x, y]);
      camel(B, x, y, h, { load: i === litter ? 'litter' : (i === nc - 1 && R.chance(.5) ? 'rider' : 'bales'), flip: !away, role: i === litter ? 'the litter' : 'the camels', lod: 0 });
    }
    // the lead ropes, nose to tail
    const sg = away ? 1 : -1;
    for (let i = 1; i < nc; i++) { const [x, y] = at2[i], [px, py] = at2[i - 1]; B.mark([onCut(x, y, 0, h, w, -.4 * sg, .58), onCut(px, py, 0, h, w, .47 * sg, .8)], { on: B.parts[B.parts.length - (nc - i)], cls: 'mid', lod: 1 }); }
    const [lx, ly] = P(away ? t0 + (nc - 1) * sp + 15 : -t0 - (nc - 1) * sp - 15);
    const lead = figure(B, lx, ly, 9.5, { staff: true, flip: !away, role: 'the leader', lod: 1 });
    const [cx0, cy0] = at2[nc - 1];
    B.mark([onCut(lx, ly, 0, 9.5, 9.5, -.15 * sg, .62), onCut(cx0, cy0, 0, h, w, .47 * sg, .8)], { on: lead, cls: 'mid', lod: 1 });
    // a cairn or a milestone by the track
    const [mx, my] = P(R.r(-20, 10)), ox = mx + EU[0] * -10, oy = my + EU[1] * -10;
    if (R.chance(.5)) { let z = 0; for (const [r, hh] of [[3.6, 2.2], [2.9, 2], [2.2, 1.8], [1.4, 1.6]]) { rock(B, R, ox, oy, r, hh, { z, role: 'the cairn', lod: 1 }); z += hh * .9; } }
    else {
      // the milestone on its square footing: an engraved band round the shaft, the miles cut within it
      B.box(ox - 2.6, oy - 2.6, ox + 2.6, oy + 2.6, 0, .8, { r: .3, b: .2, role: 'the milestone', lod: 2 });
      const ms = B.lathe(ox, oy, [[1.8, .8], [1.8, 5.8], [1.4, 6.8], [0, 7.3]], { n: 14, role: 'the milestone', lod: 1 });
      for (const z of [4.8, 3.2]) hoop(B, ms, ox, oy, 1.8, z, { n: 18, cls: 'mid', lod: 2 });
      for (const z of [4.3, 3.7]) B.mark([[ox + .5, oy + 1.73, z], [ox + 1.73, oy + .5, z]], { on: ms, n: [S2, S2, 0], lod: 2 });
      staves(B, ms, ox, oy, 1.8, .8, 3.2, 10, { lod: 2 });
    }
    // the low dunes behind, the stones beside
    dune(B, R, -30, -24, 26, 2.4, { lod: 1, hf: .16 });
    dune(B, R, 16, -34, 20, 2.4, { lod: 1, hf: .16 });
    for (let k = 0; k < 3; k++) rock(B, R, R.r(-40, 40), R.r(24, 40), R.r(1.6, 2.6), R.r(1.2, 2), { lod: 2 });
  });

  /* The cave of the forty thieves: a hill of rock whose south face is a cliff with a dark mouth in it,
     the stone that shuts it rolled aside, boulders at the threshold, the treasure glinting within,
     and the tree Ali Baba climbed to watch */
  def('cave', (R, B) => {
    const yf = 4, j = () => R.r(-2, 2), cm = R.r(-6, 0);
    const L0 = [[-28, yf], [26, yf], [38 + j(), yf - 16], [30 + j(), yf - 40], [-6 + j(), yf - 50], [-36 + j(), yf - 34], [-40, yf - 12 + j()]];
    const L1 = [[-24, yf - 2], [22, yf - 2], [30 + j(), yf - 16], [22 + j(), yf - 33], [-4 + j(), yf - 41], [-28 + j(), yf - 29], [-32, yf - 12 + j()]];
    const L2 = scl(L1, .46, [-1, yf - 22]).map(p => [p[0] + j(), p[1] + j()]);
    const zt = R.r(36, 42), layers = [[L0, 0], [L1, 26], [L2, zt]];
    const hill = sol(B, layers, { role: 'the hill of the cave' });
    shade(B, hill, layers, [-1, yf - 22], { zHi: zt * .9, zLo: 1, dense: 6 });
    // the beds of the rock wrapping the hill, the cliff's courses above the mouth
    strata(B, hill, layers, [-1, yf - 22], [6.5, 12, 30, 34], { n: 40, slope: .35, wave: .4, lod: 2 });
    // crags breaking the skyline: one on the crown, one on the western shoulder
    for (const [qx, qy, qr, qz, qh] of [[R.r(-8, 4), yf - 26, 15, zt - 13, R.r(10, 12.4)], [-26, yf - 22, 9, 14, R.r(14, 18)]]) {
      const qa = R() * TAU, ql = [[wob(R, qx, qy, qr, qr * .8, 8, .14, qa), qz], [wob(R, qx + 1, qy - 1, qr * .62, qr * .5, 8, .2, qa), qz + qh * .6], [wob(R, qx + 2, qy - 2, qr * .2, qr * .16, 8, .2, qa), qz + qh]];
      const q = sol(B, ql, { role: 'the hill of the cave' }); shade(B, q, ql, [qx, qy], { dense: 5 });
    }
    // the face of the cliff: ledges and cracks
    const F = (u, z) => [u, yf - 2 * z / 26 + .06, z], nF = [0, 1, .08];
    for (const [u0, u1, z] of [[-22, -12, 19], [8, 20, 22], [-18, -6, 8], [12, 19, 11]]) B.mark([F(u0, z), F(lerp(u0, u1, .4), z + .6), F(u1, z - .4)], { on: hill, n: nF, lod: 2 });
    for (const [u, z0, z1] of [[-17, 2, 10], [16, 13, 21], [-9, 17, 24]]) B.mark([F(u, z0), F(u + .8, (z0 + z1) / 2), F(u - .3, z1)], { on: hill, n: nF, lod: 2 });
    // the mouth, rough-edged, the dark inside drawn close
    const mw = R.r(18, 21), mh = R.r(17, 20), sh = mh * .42, edge = [], top = u => { const k = (u - cm) / (mw / 2); return abs(k) >= 1 ? 0 : sh + (mh - sh) * sqrt(1 - k * k); };
    edge.push(F(cm - mw / 2, 0));
    for (let k = 0; k <= 12; k++) { const a = PI - k / 12 * PI, jj = k % 2 ? R.r(.86, .96) : 1; edge.push(F(cm + cos(a) * mw / 2 * (k === 0 || k === 12 ? 1 : jj), sh + sin(a) * (mh - sh) * jj)); }
    edge.push(F(cm + mw / 2, 0));
    B.mark(edge, { on: hill, n: nF, cls: 'edge', lod: 1 });
    B.mark(edge.map(p => [cm + (p[0] - cm) * .66, p[1] - .1, p[2] * .72]), { on: hill, n: nF, lod: 1 });
    for (let u = cm - mw / 2 + .9; u < cm + mw / 2 - .5; u += 1) B.mark([F(u, .2), F(u, max(.4, top(u) - .7))], { on: hill, n: nF, lod: 1 });
    // the treasure at the threshold
    for (const [dx, r, hh] of [[-3, 1.2, 3], [-.6, .9, 2.4]]) B.lathe(cm + dx, yf + .6, [[r * .6, 0], [r, hh * .4], [r * .7, hh * .8], [r * .45, hh]], { n: 10, role: 'the treasure', lod: 2 });
    const chest = B.box(cm + 1.5, yf - .2, cm + 5, yf + 1.8, 0, 2, { r: .3, b: .3, role: 'the treasure', lod: 2 });
    for (const u of [.25, .75]) B.mark([[lerp(cm + 1.5, cm + 5, u), yf + 1.8, 0], [lerp(cm + 1.5, cm + 5, u), yf + 1.8, 2]], { on: chest, n: [0, 1, 0], lod: 2 });
    B.panel('S', .44, .56, 1, 1.6, { on: chest, lod: 2 });
    // the threshold before the mouth, trodden bare; the groove the great stone rolls in; coins spilled on it
    const th = B.plate(at([[cm - mw / 2 - 2, yf + .4], [cm + mw / 2 + 12, yf + .4], [cm + mw / 2 + 9, yf + 9], [cm + 4, yf + 12], [cm - mw / 2 - 1, yf + 8]], -.12), { role: 'the stone door', cls: 'lo', lod: 1 });
    for (const dy of [3.2, 4.8]) B.mark([[cm + mw / 2 - 3, yf + dy, -.12], [cm + mw / 2 + 11, yf + dy, -.12]], { on: th, lod: 2 });
    for (let k = 0; k < 9; k++) { const x = cm + R.r(-5, 6), y = yf + R.r(1.5, 6); B.mark(at(closed(ell(x, y, .38, .3, 7)), -.12), { on: th, lod: 2 }); }
    pebbles(B, th, R, cm - mw / 2 + 1, yf + 6, 3, 2, 8, -.12);
    // the stone that shuts the cave, rolled aside
    const dx0 = cm + mw / 2 + 2.5;
    const door = B.box(dx0, yf + .6, dx0 + 9.5, yf + 4.4, 0, mh * 1.04, { r: 2.6, b: .7, top: .4, role: 'the stone door' });
    // the dressing of the stone: chisel courses across its face, and the iron ring it is hauled by
    for (let z = 2.2; z < mh * .98; z += 2.6) B.mark([[dx0 + .5, yf + 4.4, z], [dx0 + 9, yf + 4.4, z + .2]], { on: door, n: [0, 1, 0], lod: 2 });
    B.mark(closed(ell(0, 0, 1, 1, 12)).map(([u, v]) => [dx0 + 2.4 + u * .9, yf + 4.42, mh * .5 + v * .9]), { on: door, n: [0, 1, 0], cls: 'mid', lod: 2 });
    B.mark([[dx0 + 3, yf + 4.4, 2], [dx0 + 4, yf + 4.4, 7], [dx0 + 3.4, yf + 4.4, 11]], { on: door, n: [0, 1, 0], lod: 2 });
    // the rocks either side, boulders before the mouth
    const er = [[wob(R, 36, -2, 14, 12, 10, .1), 0], [wob(R, 35, -3, 10, 8, 10, .12), 9], [wob(R, 34, -4, 4, 3, 10, .15), 14]];
    const east = sol(B, er, { role: 'the rocks' });
    shade(B, east, er, [35, -3], { dense: 5 });
    rock(B, R, -36, 10, 7, 7, { lod: 0 });
    rock(B, R, cm - mw / 2 - 5, yf + 6, 3.8, 3.6, { role: 'the boulders' });
    rock(B, R, cm - mw / 2 - 9, yf + 3, 2.4, 2.2, { role: 'the boulders', lod: 2 });
    rock(B, R, dx0 + 14, yf + 8, 2.8, 2.6, { role: 'the boulders' });
    // the tree Ali Baba climbed to watch the thieves
    leafy(B, R, 40, 30, R.r(22, 26), { role: 'the tree', lod: 0, r: 7.5, clumps: 2, trunk: .9 });
    // tufts of thorn in the clefts of the hill
    for (const [u, z] of [[-20, 9], [14, 6], [-6, 26]]) { const y = yf - 2 * z / 26; tuft(B, R, u, y - .4, z, R.r(1.8, 2.4), { role: 'the hill of the cave' }); }
    B.guide(spline([[cm + 8, 48], [cm + 3, 26], [cm, yf + 2]], 5));
    if (R.chance(.5)) { horse(B, 22, 32, 9, { role: "the thieves' horses", flip: true }); horse(B, 13, 38, 9, { role: "the thieves' horses", flip: true }); }
    else { donkey(B, 18, 34, 8, { role: 'the donkeys of Ali Baba', flip: true }); donkey(B, 8, 40, 8, { role: 'the donkeys of Ali Baba', flip: true }); }
  });

  /* A lone fortress on its crag: a tapering rock, a tall keep with battlements and arrow slits,
     a round tower at the other corner, curtain walls with the gate, and a path winding up to it */
  def('tower', (R, B) => {
    const n = 12, a0 = R() * TAU, cz = R.r(24, 28);
    const L0 = wob(R, 2, 4, 40, 34, n, .07, 0, a0), L1 = wob(R, -1, 0, 30, 25, n, .07, 0, a0), L2 = wob(R, -3, -3, 24, 20, n, .04, 0, a0);
    const layers = [[L0, 0], [L1, cz * .55], [L2, cz]];
    const crag = sol(B, layers, { role: 'the crag', crease: 1.2 });
    shade(B, crag, layers, [0, 0], { zHi: cz * .92, zLo: 1 });
    // the strata of the rock, along the faces in view
    for (const [f, ml] of [[.3, 1], [.62, 1], [.82, 2]]) surf(B, crag, closed(sectionAt(layers, cz * f)).map((p, i) => [p[0], p[1], cz * f + (i % 2 ? .6 : -.3)]), [0, 0], { slope: .3, lod: ml });
    // a buttress of rock on the east
    const bl = [[wob(R, 30, 12, 15, 12, 9, .12, .4), 0], [wob(R, 28, 10, 10, 7, 9, .15, .4), cz * .4], [wob(R, 25, 7, 4, 3, 9, .2, .4), cz * .6]];
    const bt = sol(B, bl, { role: 'the crag' }); shade(B, bt, bl, [28, 10], { dense: 5 });
    strata(B, bt, bl, [28, 10], [cz * .14, cz * .28, cz * .44], { n: 24, slope: .35, wave: .3, lod: 2 });
    // the joints that split the crag top to bottom, and its fallen blocks at the foot
    for (const a of [PI * .12, PI * .38, PI * .62]) fall(B, crag, layers, [0, 0], a + R.r(-.08, .08), cz * .95, cz * .08, { k: 5, wander: .05, slope: .3, lod: 2 });
    for (let k = 0; k < 4; k++) { const a = PI * .15 + k * .32 + R.r(-.1, .1), p = rayHit(L0, 2, 4, a); rock(B, R, p[0] + cos(a) * 2.5, p[1] + sin(a) * 2.5, R.r(1.3, 2.3), R.r(1.1, 2), { lod: 2 }); }
    // the keep at the back corner
    const kx = R.r(-18, -14), ky = R.r(-18, -14), ks = R.r(6.5, 7.5), kh = R.r(40, 48);
    const keep = B.box(kx - ks, ky - ks, kx + ks, ky + ks, cz, cz + kh, { r: .7, b: .8, role: 'the keep' });
    B.crenels({ on: keep, every: 2.6, h: 2, sides: 'SENW' });
    B.band(cz + kh - 3, { on: keep, sides: 'SE' });
    B.window('S', .5, cz + kh - 10, 1.4, 4.6, { on: keep, shape: 'round' }); B.window('E', .5, cz + kh - 10, 1.4, 4.6, { on: keep, shape: 'round' });
    // the courses of its masonry, the corbels of the gallery under the battlements, the plinth's batter line
    for (let z = cz + 3.2; z < cz + kh - 4; z += 3.2) B.band(z, { on: keep, sides: 'SE', lod: 2 });
    for (const side of ['S', 'E']) for (let i = 1; i < 8; i++) B.panel(side, i / 8 - .02, i / 8 + .02, cz + kh - 4.4, cz + kh - 3, { on: keep, lod: 2 });
    // the banner on its staff over the keep
    { const fx = kx + ks * .5, fy = ky + ks * .5, ft = cz + kh + 2, st = B.line([[fx, fy, ft], [fx, fy, ft + 9]], { role: 'the keep', lod: 1, w: 1.2 });
      const fl = B.plate([[fx, fy, ft + 9], [fx + EH[0] * 5.5, fy + EH[1] * 5.5, ft + 8.2], [fx + EH[0] * 5, fy + EH[1] * 5, ft + 6.6], [fx, fy, ft + 6.8]], { role: 'the keep', lod: 1 });
      B.mark([[fx + EH[0] * 2.6, fy + EH[1] * 2.6, ft + 8.6], [fx + EH[0] * 2.5, fy + EH[1] * 2.5, ft + 6.7]], { on: fl, lod: 2 }); }
    for (const z of [cz + 10, cz + 20]) { B.window('S', .5, z, .8, 3.2, { on: keep, shape: 'flat', lod: 2 }); B.window('E', .5, z, .8, 3.2, { on: keep, shape: 'flat', lod: 2 }); }
    // the round tower at the front corner
    const rx = R.r(8, 11), ry = R.r(6, 9), rr = 5, rh = R.r(20, 24);
    const rt = B.cyl(rx, ry, rr, cz, cz + rh, { n: 18, b: .5, role: 'the tower' });
    B.cyl(rx, ry, rr + .9, cz + rh, cz + rh + 2.2, { n: 18, b: .5, role: 'the tower', lod: 1 });
    const mer = []; for (let k = 0; k <= 36; k++) { const a = k / 36 * TAU, up = Math.floor(k / 2) % 2; mer.push([rx + cos(a) * (rr + .9), ry + sin(a) * (rr + .9), cz + rh + 2.2 + (up ? 1.6 : 0)]); }
    ringMark(B, B.last, mer, [rx, ry], { cls: 'edge', lod: 2 });
    B.mark([[rx + rr * S2, ry + rr * S2, cz + rh * .6], [rx + rr * S2, ry + rr * S2, cz + rh * .6 + 3]], { on: rt, n: [S2, S2, 0], lod: 1 });
    for (let z = cz + 2.8; z < cz + rh - 1; z += 2.8) hoop(B, rt, rx, ry, rr, z, { n: 24, lod: 2 });
    for (const a of [PI * .05, PI * .45]) B.mark([[rx + cos(a) * rr, ry + sin(a) * rr, cz + rh * .35], [rx + cos(a) * rr, ry + sin(a) * rr, cz + rh * .35 + 2.4]], { on: rt, n: [cos(a), sin(a), 0], lod: 2 });
    // the curtain walls and the gate
    const wh = 9, wy0 = ry - 1.6, wx0 = kx + ks;
    const wS = B.box(kx - ks + 1, wy0, rx - rr + .6, wy0 + 3, cz, cz + wh, { r: .4, b: .5, role: 'the walls' });
    B.crenels({ on: wS, every: 2.4, h: 1.5, sides: 'SN' });
    const gx = (kx + rx) / 2 + R.r(-3, 3);
    const gate = B.box(gx - 4, wy0 - .6, gx + 4, wy0 + 4, cz, cz + wh + 4, { r: .5, b: .6, role: 'the gate' });
    B.door('S', .5, 3.8, 7, { on: gate, shape: 'round' }); B.crenels({ on: gate, every: 2, h: 1.4, sides: 'SE' });
    // the portcullis down in the gateway, and the voussoirs round its arch
    for (let i = 1; i < 5; i++) { const off = -1.9 + i * .76; B.mark([[gx + off, wy0 + 4, cz], [gx + off, wy0 + 4, cz + 5.1 + sqrt(max(0, 1.9 * 1.9 - off * off))]], { on: gate, n: [0, 1, 0], lod: 2 }); }
    for (const z of [cz + 2, cz + 4]) B.mark([[gx - 1.9, wy0 + 4, z], [gx + 1.9, wy0 + 4, z]], { on: gate, n: [0, 1, 0], lod: 2 });
    for (let i = 0; i <= 6; i++) { const a = PI - i / 6 * PI, c = [gx + cos(a) * 1.9, cz + 5.1 + sin(a) * 1.9], d = [gx + cos(a) * 2.9, cz + 5.1 + sin(a) * 2.9]; B.mark([[c[0], wy0 + 4, c[1]], [d[0], wy0 + 4, d[1]]], { on: gate, n: [0, 1, 0], lod: 2 }); }
    for (let z = cz + 2.6; z < cz + wh; z += 2.6) B.band(z, { on: wS, sides: 'S', lod: 2 });
    const wE = B.box(rx - 1.5, ky - ks + 1, rx + 1.5, ry - rr + .6, cz, cz + wh, { r: .4, b: .5, role: 'the walls' });
    B.crenels({ on: wE, every: 2.4, h: 1.5, sides: 'EW' });
    // the path winding up the crag to the gate
    const path = [];
    const legs = [[.42, .02, 0, .3], [.02, .62, .3, .64], [.62, .4, .64, .96]];
    for (const [a1, a2, z1, z2] of legs) for (let k = 0; k <= 8; k++) { const t = k / 8, ang = lerp(a1, a2, t) * PI, z = lerp(z1, z2, t) * cz, S = sectionAt(layers, z), p = rayHit(S, 0, 0, ang); path.push([p[0] + cos(ang) * .8, p[1] + sin(ang) * .8, z + .3]); }
    path.push([gx, wy0 + 4.5, cz]);
    const pth = B.line(path, { role: 'the path', cls: 'mid', lod: 1, w: 1.5 });
    // the steps cut in the steep legs of the path
    for (let i = 10; i < path.length - 1; i += 1) { const a = path[i], b = path[i + 1]; if (b[2] - a[2] < .5) continue; const m = lerp3(a, b, .5), d = hypot(b[0] - a[0], b[1] - a[1]) || 1, ox = -(b[1] - a[1]) / d * .9, oy = (b[0] - a[0]) / d * .9; B.mark([[m[0] - ox, m[1] - oy, m[2]], [m[0] + ox, m[1] + oy, m[2]]], { on: pth, lod: 2 }); }
    B.guide(spline([[path[0][0] + 6, 48], [path[0][0] + 2, path[0][1] + 6], [path[0][0], path[0][1]]], 4));
    if (R.chance(.5)) figure(B, path[0][0] + 4, path[0][1] + 8, 8, { staff: true, role: 'a traveller', lod: 2 });
  });

  /* a column of stone: n=10 drum, broken at its top on a slant unless whole */
  function column(B, R, x, y, r, h, o = {}) {
    const role = o.role || 'the columns', lod = o.lod || 0, z0 = o.z || 0;
    const ring = (rr, a0, a1, k) => { const p = []; for (let i = 0; i <= k; i++) { const a = lerp(a0, a1, i / k); p.push([x + cos(a) * rr, y + sin(a) * rr]); } return p; };
    let c;
    if (o.whole) c = B.cyl(x, y, r, z0, z0 + h, { n: 10, b: 0, top: .88, role, lod });
    else {
      const ba = R() * TAU, drop = r * R.r(1, 2.2);
      c = sol(B, [[ring(r, 0, TAU * .9, 9), z0], [ring(r * .9, ba, ba + PI, 5), z0 + h], [ring(r * .9, ba + PI, ba + TAU, 5), z0 + h - drop]], { role, lod });
      B.mark([[x + cos(ba) * r * .9, y + sin(ba) * r * .9, z0 + h], [x, y, z0 + h - drop * .3 + .6], [x - cos(ba) * r * .3, y - sin(ba) * r * .3, z0 + h - drop * .7], [x + cos(ba + PI) * r * .9, y + sin(ba + PI) * r * .9, z0 + h - drop]], { on: c, cls: 'edge', lod: 1 });
    }
    const zf = z0 + h * (o.whole ? .97 : .82);
    for (const a of [-PI * .15, PI * .05, PI * .25, PI * .45, PI * .65]) B.mark([[x + cos(a) * r, y + sin(a) * r, z0 + .4], [x + cos(a) * r * (o.whole ? .88 : .91), y + sin(a) * r * (o.whole ? .88 : .91), zf]], { on: c, n: [cos(a), sin(a), 0], lod: a < 0 || a > PI / 2 ? 2 : 1 });
    // the joints between its drums, the shaft narrowing as it rises
    for (let z = z0 + 4.2; z < zf - 1; z += 4.2 + (o.whole ? 0 : .3)) hoop(B, c, x, y, r * lerp(1, o.whole ? .88 : .9, (z - z0) / h), z, { n: 12, lod: 2 });
    return c;
  }
  /* sand banked against a wall from A to B, spreading toward the eye; free: a low drift in the open,
     its back from the line A to B up to a soft crest, its face down to the toe */
  function drift(B, R, ax, ay, bx, by, depth, hd, free) {
    let nx = -(by - ay), ny = bx - ax; const L = hypot(nx, ny) || 1; nx /= L; ny /= L; if (nx + ny < 0) { nx = -nx; ny = -ny; }
    const K = 10, base = [], out = [], crest = [];
    for (let i = 0; i <= K; i++) {
      const t = i / K, b = pow(sin(t * PI), .45), x = lerp(ax, bx, t), y = lerp(ay, by, t), d = depth * b * R.r(.9, 1.06);
      base.push([x, y, free ? 0 : hd * pow(b, .7)]); out.push([x + nx * d, y + ny * d, 0]);
      crest.push([x + nx * d * .4, y + ny * d * .4, hd * pow(b, .8)]);
    }
    const role = 'the sand';
    if (!free) {
      const pl = B.plate([...base, ...out.slice(1, -1).reverse()], { role, lod: 1 });
      for (const f of [.35, .65]) B.mark(base.map((p, i) => [lerp(p[0], out[i][0], f), lerp(p[1], out[i][1], f), p[2] * (1 - f) * .85 + .05]).slice(1, -1), { on: pl, lod: 2 });
      return pl;
    }
    B.plate([...base, ...crest.slice(1, -1).reverse()], { role, lod: 1 });
    const face = B.plate([...crest, ...out.slice(1, -1).reverse()], { role, lod: 1 });
    B.mark(crest, { on: face, lod: 1 });
    B.mark(crest.map((p, i) => [lerp(p[0], out[i][0], .5), lerp(p[1], out[i][1], .5), p[2] * .45]).slice(1, -1), { on: face, lod: 2 });
    return face;
  }
  /* A ruined city in the sands, Iram of the Columns or the City of Brass: a colonnade of broken
     columns, two still carrying their stone beam, a half-fallen arcade, a dome broken open, drums
     and blocks scattered, sand drifted against it all; by seed the brass horseman on his pillar */
  def('ruin', (R, B) => {
    const brass = R.chance(.4);
    // the colonnade, across the back
    const nC = 7, cr = 2.4, spc = 10.5, ax = -36, ay = -26;
    const hs = [R.r(26, 30), R.r(26, 30), R.r(12, 20), R.r(6, 10), R.r(18, 24), R.r(3, 6), R.r(14, 20)];
    const whole = R.chance(.5) ? [0, 1] : [4, 5];
    for (let i = 0; i < nC; i++) {
      const x = ax + i * spc * S2 * 1.15, y = ay - i * spc * S2 * .55;
      const isW = whole.includes(i), h = isW ? 28 : hs[i];
      column(B, R, x, y, cr, h, { whole: isW, role: 'the columns', lod: 0 });
      B.box(x - cr * .9, y - cr * .9, x + cr * .9, y + cr * .9, 0, 1.2, { r: .3, b: 0, role: 'the columns', lod: 2 });
      if (isW) { B.lathe(x, y, [[cr * .86, 26.6], [cr * 1.02, 27.2], [cr * 1.3, 28]], { n: 14, role: 'the columns', lod: 1 }); B.box(x - cr * 1.25, y - cr * 1.25, x + cr * 1.25, y + cr * 1.25, 28, 29.6, { r: .3, b: .3, role: 'the columns', lod: 1 }); }
    }
    { const i = whole[0], x = ax + i * spc * S2 * 1.15, y = ay - i * spc * S2 * .55, x2 = x + spc * S2 * 1.15, y2 = y - spc * S2 * .55;
      const beam = sol(B, [[[[x - 2.6, y + 1.4], [x - 1.4, y - 2.6], [x2 + 2.6, y2 - 1.4], [x2 + 1.4, y2 + 2.6]], 29.6], [[[x - 2.6, y + 1.4], [x - 1.4, y - 2.6], [x2 + 2.6, y2 - 1.4], [x2 + 1.4, y2 + 2.6]], 33.6]], { role: 'the colonnade' });
      // the three fasciae of the architrave, edge to edge along its face, and the crack where it settled
      const fa = [x - 2.6, y + 1.4], fb2 = [x2 + 1.4, y2 + 2.6], nb = [fb2[1] - fa[1], fa[0] - fb2[0]], nl = hypot(nb[0], nb[1]) || 1;
      for (const z of [30.9, 32.2]) B.mark([[fa[0], fa[1], z], [fb2[0], fb2[1], z]], { on: beam, n: [-nb[0] / nl, -nb[1] / nl, 0], lod: 2 });
      B.mark([[lerp(fa[0], fb2[0], .58), lerp(fa[1], fb2[1], .58), 29.6], [lerp(fa[0], fb2[0], .6), lerp(fa[1], fb2[1], .6), 31.2], [lerp(fa[0], fb2[0], .57), lerp(fa[1], fb2[1], .57), 33.6]], { on: beam, n: [-nb[0] / nl, -nb[1] / nl, 0], lod: 2 }); }
    // the half-fallen arcade, to the left and forward
    const segs = [[-46, -32, R.r(18, 22), 2], [-32, -22, R.r(11, 14), 1], [-22, -14, R.r(4, 6), 0]];
    for (const [x0, x1, h, na] of segs) {
      const w = B.box(x0, 4, x1, 8, 0, h, { r: .5, b: .6, role: 'the arcade' });
      if (na) B.arcade('S', na, 0, min(h - 3, 13), { on: w, shape: 'pointed', lod: 1 });
      const jag = []; for (let k = 0; k <= 6; k++) jag.push([lerp(x0, x1, k / 6), 8, h - (k % 2 ? R.r(.6, 1.6) : 0)]);
      B.mark(jag, { on: w, n: [0, 1, 0], cls: 'edge', lod: 1 });
      B.band(h * .45, { on: w, sides: 'S', lod: 2 });
      for (let z = 2.4; z < h - 1.4; z += 2.4) if (abs(z - h * .45) > .8) B.band(z, { on: w, sides: 'S', lod: 2 });
    }
    // the broken dome on its cube, open toward the right of the view
    const dx = 18, dy = -2, cs = 8;
    const cube = B.box(dx - cs, dy - cs, dx + cs, dy + cs, 0, 13, { r: .7, b: .7, role: 'the dome' });
    B.door('S', .5, 5, 9, { on: cube }); B.window('E', .5, 6, 2.6, 4, { on: cube, lod: 2 });
    for (let z = 2.6; z < 12; z += 2.6) B.band(z, { on: cube, sides: 'SE', lod: 2 });
    // over the door, the inscription that no one now can read, in its frame
    B.panel('S', .3, .7, 10, 12.2, { on: cube, lod: 2 });
    for (const [z, u1] of [[11.6, .66], [10.9, .6], [10.4, .52]]) B.mark([[lerp(dx - cs, dx + cs, .34), dy + cs, z], [lerp(dx - cs, dx + cs, u1), dy + cs, z]], { on: cube, n: [0, 1, 0], lod: 2 });
    const gap = R.r(-.15, .45), half = R.r(.95, 1.15), prof = [[1, 0], [.94, .3], [.8, .58], [.58, .8], [.3, .95]], dr = cs * .95;
    const L = prof.map(([r, hh], k) => { const pts = [], m = k >= prof.length - 2 ? 1.6 : 1; for (let i = 0; i <= 14; i++) { const a = gap + half * m + i / 14 * (TAU - 2 * half * m); pts.push([dx + cos(a) * r * dr, dy + sin(a) * r * dr]); } return [pts, 13 + hh * dr]; });
    const dome = sol(B, L, { role: 'the dome' });
    const brk = []; for (let k = 0; k <= 8; k++) { const f = k / 8, a = gap + half * (1 - f * .45) * (k % 2 ? .9 : 1), r = (1 - f * .7) * dr, z = 13 + f * dr * .95; brk.push([dx + cos(a) * r, dy + sin(a) * r, z]); }
    for (let k = 8; k >= 0; k--) { const f = k / 8, a = gap - half * (1 - f * .45) * (k % 2 ? .9 : 1), r = (1 - f * .7) * dr, z = 13 + f * dr * .95; brk.push([dx + cos(a) * r, dy + sin(a) * r, z]); }
    B.mark(brk, { on: dome, cls: 'edge', lod: 1 });
    const inner = []; for (let k = 0; k <= 10; k++) { const a = gap - half + k / 10 * half * 2, r = dr * .88; inner.push([dx - cos(a) * r * .2 + cos(a) * r * .3, dy - sin(a) * r * .2 + sin(a) * r * .3, 13 + dr * .35 + sin(k / 10 * PI) * dr * .3]); }
    B.mark(inner, { on: dome, lod: 2 });
    // drums and blocks scattered, sand drifted
    log(B, -6, 26, 9, 2.4, R.r(-.6, .6), { role: 'the fallen columns', lod: 1, rings: [1] });
    log(B, 6, 34, 7, 2.4, R.r(.4, 1.4), { role: 'the fallen columns', lod: 1, rings: [1] });
    for (let k = 0; k < 5; k++) { const x = R.r(-40, 40), y = R.r(14, 40), s = R.r(2, 3.6), a = R() * TAU, q = [[-s, -s * .7], [s, -s * .7], [s, s * .7], [-s, s * .7]].map(p => rotP(x + p[0], y + p[1], a, x, y)); const sh2 = s * R.r(.8, 1.2), st = sol(B, [[q, 0], [q, sh2]], { role: 'the stones', lod: k < 2 ? 1 : 2, crease: .3 }); B.mark(at(closed(scl(q, .72, [x, y])), sh2), { on: st, lod: 2 }); }
    const d1 = drift(B, R, -46, 8, -24, 8, 9, 4.5);
    const d2 = drift(B, R, dx - cs, dy + cs, dx + cs, dy + cs, 7, 3.2);
    // the wind's ripples on the drifts' backs
    for (const [dd, x0, x1, y0, dep] of [[d1, -46, -24, 8, 9], [d2, dx - cs, dx + cs, dy + cs, 7]]) for (const f of [.15, .82]) B.mark([[lerp(x0, x1, .25), y0 + dep * f, .1], [lerp(x0, x1, .5), y0 + dep * f + .4, .1], [lerp(x0, x1, .75), y0 + dep * f, .1]], { on: dd, lod: 2 });
    // a capital fallen on its face, and the weeds that root in the joints of the stones
    { const fx = R.r(-30, -18), fy = R.r(26, 34); B.box(fx - 3.1, fy - 3.1, fx + 3.1, fy + 3.1, 0, 1.5, { r: .3, b: .3, role: 'the fallen columns', lod: 2 }); const ec = B.lathe(fx, fy, [[cr * 1.3, 1.5], [cr * 1.02, 2.3], [cr * .86, 2.9]], { n: 14, role: 'the fallen columns', lod: 2 }); hoop(B, ec, fx, fy, cr * .86, 2.9, { n: 14, lod: 2 }); }
    for (let k = 0; k < 4; k++) { const i = R.i(0, nC - 1), x = ax + i * spc * S2 * 1.15 + R.r(2.4, 3.6), y = ay - i * spc * S2 * .55 + R.r(2.4, 3.6); tuft(B, R, x, y, 0, R.r(1.6, 2.4), { role: 'the columns' }); }
    if (brass) {
      // the horseman of brass on his pillar, his lance pointing the way
      const bx = 34, by = -30, ph = 26;
      B.cyl(bx, by, 3, 0, ph, { n: 12, b: .5, top: .92, role: 'the horseman of brass' });
      B.box(bx - 4, by - 4, bx + 4, by + 4, ph, ph + 1.4, { r: .3, b: .3, role: 'the horseman of brass' });
      B.cut([...HORSE.legs, HORSE.tail, HORSE.body, [[-.08, .62], [-.1, .86], [-.06, .94], [-.04, 1.06], [.02, 1.06], [.04, .94], [.06, .82], [.08, .66]]], bx, by, ph + 1.4, 11, { w: 12.6, lines: [[[-.05, .9], [.62, 1.2]]], role: 'the horseman of brass' });
    }
  });

  /* A desert well: a stone curb on a paved apron, a timber frame with its pulley and the rope down,
     a leather bucket, a stone trough for the beasts, a palm or two, jars and a waterskin */
  def('well', (R, B) => {
    const wx = R.r(-4, 0), wy = R.r(-4, 0);
    const apr = ell(wx + 3, wy + 3, 25, 21, 24, R.r(-.3, .3)), ap = B.plate(at(apr, 0), { role: 'the well', cls: 'lo', lod: 1 });
    const cr = 8, ch = 4.4;
    // the paving of the apron: two rings of flags round the curb, the joints staggered, the outer flags out to the edge
    for (const rr of [cr + 3.5, cr + 8]) B.mark(closed(ell(wx, wy, rr, rr, 32)).map(p => [p[0], p[1], 0]), { on: ap, lod: 2 });
    for (const [r0, r1, nj, off] of [[cr, cr + 3.5, 14, 0], [cr + 3.5, cr + 8, 18, .5], [cr + 8, null, 22, .25]]) for (let k = 0; k < nj; k++) { const a = (k + off) / nj * TAU, e1 = r1 == null ? rayHit(apr, wx, wy, a) : [wx + cos(a) * r1, wy + sin(a) * r1]; B.mark([[wx + cos(a) * r0, wy + sin(a) * r0, 0], [e1[0], e1[1], 0]], { on: ap, lod: 2 }); }
    const curb = B.cyl(wx, wy, cr, 0, ch, { n: 16, b: 1.1, role: 'the well' });
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + (k % 2) * .2; B.mark([[wx + cos(a) * cr, wy + sin(a) * cr, k % 2 ? ch / 2 : 0], [wx + cos(a) * cr, wy + sin(a) * cr, k % 2 ? ch : ch / 2]], { on: curb, n: [cos(a), sin(a), 0], lod: 2 }); }
    ringMark(B, curb, closed(ell(wx, wy, cr, cr, 24)).map(p => [p[0], p[1], ch / 2]), [wx, wy], { lod: 2 });
    // the dark of the shaft
    for (const l of hatch(ell(wx, wy, cr - 2, cr - 2, 18), PI / 4, .9)) B.mark(at(l, ch), { on: curb, lod: 1 });
    // the frame, the pulley, the rope, the bucket
    const pa = [wx - EH[0] * 9.5, wy - EH[1] * 9.5], pb = [wx + EH[0] * 9.5, wy + EH[1] * 9.5], fz = 19;
    // two pillars of coursed stone, and the beam across them (the one bright part: the well-head itself)
    for (const q of [pa, pb]) { const po = B.box(q[0] - 1.2, q[1] - 1.2, q[0] + 1.2, q[1] + 1.2, 0, fz, { r: .3, b: 0, role: 'the frame' }); for (let z = 2.4; z < fz - 1; z += 2.4) B.band(z, { on: po, sides: 'SE', lod: 2 }); }
    const bm = (u, v) => [wx + EH[0] * u - EU[0] * v, wy + EH[1] * u - EU[1] * v], bmr = [bm(-11.6, -.7), bm(11.6, -.7), bm(11.6, .7), bm(-11.6, .7)];
    const beam = sol(B, [[bmr, fz], [bmr, fz + 1.4]], { role: 'the frame', crease: .2 });
    for (const u of [-9.5, 9.5]) B.mark([[...bm(u - 1.2, .72), fz + .2], [...bm(u + 1.2, .72), fz + .2]], { on: beam, lod: 2 });
    // the axle of the pulley in its bearings under the beam
    for (const u of [-1, 1]) B.box(wx + EH[0] * u * 1.4 - .3, wy + EH[1] * u * 1.4 - .3, wx + EH[0] * u * 1.4 + .3, wy + EH[1] * u * 1.4 + .3, fz - 2.6, fz, { r: .1, b: 0, role: 'the pulley', lod: 2 });
    const pr = 2.2, pul = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU; pul.push([wx + EH[0] * cos(a) * pr, wy + EH[1] * cos(a) * pr, fz - pr - .2 + sin(a) * pr]); }
    const pp = B.plate(pul, { role: 'the pulley', lod: 1 });
    B.mark([[wx, wy, fz - pr - .2], [wx, wy, fz]], { on: pp, lod: 2 });
    B.line([[wx - EH[0] * pr, wy - EH[1] * pr, fz - pr], [wx - EH[0] * pr, wy - EH[1] * pr, ch]], { role: 'the rope', cls: 'mid', lod: 1 });
    const bz = R.r(8, 11), bx = wx + EH[0] * pr, by = wy + EH[1] * pr;
    B.line([[bx, by, fz - pr], [bx, by, bz + 2.8]], { role: 'the bucket', cls: 'mid', lod: 1 });
    const bu = B.lathe(bx, by, [[1.4, bz], [2, bz + 1.1], [1.9, bz + 2.5]], { n: 12, role: 'the bucket', lod: 1 });
    for (const z of [bz + .7, bz + 2]) hoop(B, bu, bx, by, z < bz + 1 ? 1.75 : 1.95, z, { n: 14, lod: 2 });
    B.mark([[bx - EH[0] * 1.9, by - EH[1] * 1.9, bz + 2.5], [bx, by, bz + 3.6], [bx + EH[0] * 1.9, by + EH[1] * 1.9, bz + 2.5]], { on: bu, cls: 'edge', lod: 2 });   // its bail
    // the trough
    const tx = wx + 11, ty = wy + 11;
    const tr = B.box(tx, ty, tx + 18, ty + 5.2, 0, 3, { r: .7, b: 1, role: 'the trough' });
    for (let k = 0; k < 5; k++) B.mark([[tx + 2 + k * 3.2, ty + 2, 3], [tx + 3.6 + k * 3.2, ty + 2, 3]], { on: tr, lod: 2 });
    for (const u of [1 / 3, 2 / 3]) B.mark([[lerp(tx, tx + 18, u), ty + 5.2, 0], [lerp(tx, tx + 18, u), ty + 5.2, 3]], { on: tr, n: [0, 1, 0], lod: 2 });
    // the runnel cut in the paving from the curb to the trough, and the post the beasts are tied to
    for (const sd of [-.7, .7]) B.mark([[wx + cr * S2 + sd * S2, wy + cr * S2 - sd * S2, 0], [tx + sd * S2, ty - sd * S2, 0]], { on: ap, lod: 2 });
    const hp = B.cyl(tx + 21, ty - 3, .55, 0, 4.4, { n: 10, b: 0, role: 'the trough', lod: 2 }); hoop(B, hp, tx + 21, ty - 3, .75, 3.6, { n: 12, lod: 2 });
    // palms, jars, the waterskin
    palm(B, R, wx - 14, wy - 10, R.r(24, 28), { role: 'the palms', lod: 0, lean: .1 });
    if (R.chance(.6)) palm(B, R, wx - 21, wy + 3, R.r(16, 20), { role: 'the palms', lod: 1, lean: .14 });
    for (const [dx, dy] of [[-11, 7], [-8.6, 9.4]]) { const jr = B.lathe(wx + dx, wy + dy, [[.9, 0], [1.9, 1.6], [1.8, 3.2], [.8, 4.4], [.9, 5]], { n: 12, role: 'the jars', lod: 1 }); hoop(B, jr, wx + dx, wy + dy, 1.86, 2.4, { n: 14, zig: .2, lod: 2 }); }
    sol(B, [[ell(wx + 2, wy + 11.5, 3, 1.9, 10, .4), 0], [ell(wx + 2.2, wy + 11.5, 2.8, 1.7, 10, .4), 1.6], [ell(wx + 2.4, wy + 11.5, 1.4, .9, 10, .4), 2.5]], { role: 'the waterskin', lod: 2 });
    const life = R.pick(['camel', 'woman', 'goats']);
    if (life === 'camel') camel(B, tx + 10, ty + 10, 14, { role: 'a camel at the trough', flip: true, lod: 1 });
    else if (life === 'woman') figure(B, wx + EH[0] * 12 + 4, wy + EH[1] * 12 + 7, 10, { jar: true, role: 'a woman drawing water', lod: 1 });
    else for (let k = 0; k < 3; k++) goat(B, tx + 3 + k * 5.5, ty + 10 + R.r(-1, 2), 5.5, { flip: R.chance(.5), lod: 1 });
    B.guide(spline([[wx + 30, wy + 46], [wx + 22, wy + 26], [wx + 10, wy + 15]], 4));
  });

  /* A saint's tomb in open country, a qubba: a whitewashed cube with a crenellated parapet, an
     octagonal drum and a pointed dome, inside a low walled enclosure with graves; the lone tree hung
     with the rags of vows, and a well by the gate */
  def('shrine', (R, B) => {
    const e0 = -24, e1 = 22, t = 1.6, wh = 4.2;
    B.box(e0, e0, e1, e0 + t, 0, wh, { r: .4, b: .4, role: 'the enclosure' });
    B.box(e0, e0 + t, e0 + t, e1, 0, wh, { r: .4, b: .4, role: 'the enclosure' });
    const ws = B.box(e0 + t, e1 - t, e1, e1, 0, wh, { r: .4, b: .4, role: 'the enclosure' });
    B.door('S', .62, 4.6, wh + 1.4, { on: ws, shape: 'pointed' });
    const we = B.box(e1 - t, e0 + t, e1, e1 - t, 0, wh, { r: .4, b: .4, role: 'the enclosure' });
    B.crenels({ on: ws, every: 2.2, h: .9, sides: 'S', lod: 2 }); B.crenels({ on: we, every: 2.2, h: .9, sides: 'E', lod: 2 });
    for (const w of [ws, we]) B.band(wh * .5, { on: w, sides: w === ws ? 'S' : 'E', lod: 2 });
    // the piers either side of the gate, each with its ball finial
    for (const u of [.62 - 3.4 / (e1 - e0 - t), .62 + 3.4 / (e1 - e0 - t)]) { const gx = lerp(e0 + t, e1, u), gp = B.box(gx - .9, e1 - t - .2, gx + .9, e1 + .2, 0, wh + 2.2, { r: .2, b: .2, role: 'the enclosure', lod: 1 }); B.sphere(gx, e1 - t / 2, wh + 2.9, .7, { role: 'the enclosure', lod: 2 }); }
    // the court paved in flags, laid lowest
    const court = [[e0 + t, e0 + t], [e1 - t, e0 + t], [e1 - t, e1 - t], [e0 + t, e1 - t]], cp = B.plate(at(court, -.12), { role: 'the enclosure', cls: 'lo', lod: 1 });
    cracks(B, cp, R, court, -.12, 4.4, { aspect: .8, lod: 2 });
    // the tomb
    const cx = R.r(-6, -3), cy = R.r(-8, -5), s = 9, ch = R.r(14, 16);
    const cube = B.box(cx - s, cy - s, cx + s, cy + s, 0, ch, { r: .9, b: .8, role: 'the tomb' });
    B.door('S', .5, 5.2, 9.6, { on: cube }); B.panel('S', .3, .7, 0, 11.6, { on: cube });
    B.window('E', .3, 7, 2, 3.6, { on: cube }); B.window('E', .7, 7, 2, 3.6, { on: cube });
    B.band(ch - 2, { on: cube, sides: 'SE' });
    B.crenels({ on: cube, every: 2.6, h: 1.5, sides: 'SENW' });
    const shape = R.pick(['pointed', 'pointed', 'round']);
    const drum = B.cyl(cx, cy, s * .86, ch, ch + 3.2, { n: 8, b: .5, rot: PI / 8, role: 'the dome' });
    // a little arched window in each face of the drum
    for (let k = 0; k < 8; k++) { const a = PI / 8 + (k + .5) / 8 * TAU, ca = cos(a), sn = sin(a), rr = s * .86 * cos(PI / 8), c = [cx + ca * rr, cy + sn * rr], E = (u, z) => [c[0] - sn * u, c[1] + ca * u, z]; B.mark([E(-.5, ch + .7), E(-.5, ch + 1.9), E(0, ch + 2.5), E(.5, ch + 1.9), E(.5, ch + .7)], { on: drum, n: [ca, sn, 0], closed: true, lod: 2 }); }
    const dome = B.dome(cx, cy, s * .8, ch + 3.2, { shape, role: 'the dome' });
    // the ribs of the dome from its foot to the finial, and the crescent on the finial
    { const top = ch + 3.2 + s * .8 * (shape === 'pointed' ? 1.45 : 1), fz = top + max(1.4, s * .8 * .28); B.plate([[cx - EH[0] * .8, cy - EH[1] * .8, fz + .9], [cx - EH[0] * .2, cy - EH[1] * .2, fz + .2], [cx + EH[0] * .6, cy + EH[1] * .6, fz + .5], [cx + EH[0] * .2, cy + EH[1] * .2, fz + .7], [cx - EH[0] * .3, cy - EH[1] * .3, fz + .6]], { role: 'the dome', lod: 2 }); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, pts = []; for (let i = 0; i <= 6; i++) { const f = i / 6, rr = s * .8 * cos(f * PI / 2) * (shape === 'pointed' ? 1 - f * .1 : 1); pts.push([cx + cos(a) * rr, cy + sin(a) * rr, ch + 3.2 + sin(f * PI / 2) * s * .8 * (shape === 'pointed' ? 1.4 : 1)]); } B.mark(pts, { on: dome, n: [cos(a) * .94, sin(a) * .94, .34], lod: 2 }); }
    // the graves of those buried near the saint
    for (let k = 0; k < 3; k++) { const gx = cx + 14 + k * 1, gy = cy + 6 + k * 6; const gv = B.box(gx - 3, gy - 1, gx + 3, gy + 1, 0, 1, { r: .4, b: .3, role: 'the graves', lod: 2 }); B.mark([[gx - 2.4, gy, 1], [gx + 1.8, gy, 1]], { on: gv, lod: 2 }); const hs = B.box(gx + 2.2, gy - .8, gx + 3, gy + .8, 1, 3.2, { r: .3, b: 0, role: 'the graves', lod: 2 }); for (const z of [2.6, 2.1, 1.6]) B.mark([[gx + 3, gy - .5, z], [gx + 3, gy + .5, z]], { on: hs, n: [1, 0, 0], lod: 2 }); if (k !== 1) B.sphere(gx + 2.6, gy, 3.6, .5, { role: 'the graves', lod: 2 }); }
    // the tree of vows outside the wall, its branches hung with rags
    const tx = e1 + 12, ty = e1 - 2, th = R.r(19, 23);
    const tree = leafy(B, R, tx, ty, th, { role: 'the tree of rags', lod: 0, r: th * .4, zc: th * .42, sq: .9 });
    for (let k = 0; k < 11; k++) { const a = PI * .1 + k / 11 * PI * 1.2 - PI * .35, rr = th * .4 * R.r(.6, .92), px = tx + cos(a) * rr, py = ty + sin(a) * rr * .9, pz = th * .44 + R.r(-.5, 1.5); B.mark([[px, py, pz], [px + .3, py + .2, pz - 1.4], [px - .1, py, pz - 2.6]], { on: tree, cls: 'mid', lod: 1 }); }
    // the well by the gate
    const wx2 = e1 - 6, wy2 = e1 + 10;
    const wc = B.cyl(wx2, wy2, 2.8, 0, 2.4, { n: 12, b: .5, role: 'the well', lod: 1 });
    staves(B, wc, wx2, wy2, 2.8, 0, 2.4, 12, { off: .5, lod: 2 });
    B.mark([[wx2 - EH[0] * .8, wy2 - EH[1] * .8, 6], [wx2 - EH[0] * .8, wy2 - EH[1] * .8, 2.6]], { on: wc, cls: 'mid', lod: 2 });   // the rope down the shaft
    B.line([[wx2 - EH[0] * 3.4, wy2 - EH[1] * 3.4, 0], [wx2 - EH[0] * 3.4, wy2 - EH[1] * 3.4, 6], [wx2 + EH[0] * 3.4, wy2 + EH[1] * 3.4, 6], [wx2 + EH[0] * 3.4, wy2 + EH[1] * 3.4, 0]], { role: 'the well', lod: 1, w: 1.2 });
    B.guide(spline([[e1 - 8, 48], [lerp(e0, e1, .62), e1 + 8], [lerp(e0, e1, .62), e1]], 4));
    if (R.chance(.6)) figure(B, lerp(e0, e1, .62) + 2, e1 + 7, 8, { role: 'a pilgrim', lod: 2 });
    // the oil lamps the pilgrims leave on the tomb's step
    for (const u of [-3.6, 3.6]) B.lathe(cx + u, cy + s + 1.2, [[.45, 0], [.6, .4], [.25, .6], [.3, 1]], { n: 8, role: 'the tomb', lod: 2 });
  });

  /* A stretch of road through open country: paved and kerbed, or beaten into ruts; a milestone at the
     side, a roadside well or the ruin of a khan, a few trees, low hills, and a traveller with his donkey */
  def('road', (R, B) => {
    const paved = R.chance(.5);
    const c = spline([[-56, 30], [-30, 18], [-6, 10], [16, 0], [36, -18], [56, -30]], 5), rb = ribbon(c, 10);
    const road = B.plate(at(rb.poly, .04), { role: 'the road', cls: paved ? '' : 'lo' });
    if (paved) {
      for (let i = 1; i < c.length - 1; i++) B.mark(at([rb.left[i], rb.right[i]], .04), { on: road, lod: i % 3 ? 2 : 1 });
      // the long joints between the setts, staggered course by course, each ending on a cross joint
      for (let i = 0; i < c.length - 1; i++) for (const f of i % 2 ? [.25, .5, .75] : [.375, .625]) B.mark(at([lerp2(rb.left[i], rb.right[i], f), lerp2(rb.left[i + 1], rb.right[i + 1], f)], .04), { on: road, lod: 2 });
      // the kerbstones along both edges, block by block
      const kb = ribbon(c, 12);
      for (const sd of ['left', 'right']) { B.mark(at(kb[sd], .04), { on: road, lod: 2 }); for (let i = 0; i < c.length; i += 2) B.mark(at([rb[sd][i], kb[sd][i]], .04), { on: road, lod: 2 }); }
    } else {
      for (const f of [.3, .7]) B.mark(at(rb.left.map((p, i) => lerp2(p, rb.right[i], f)), .04), { on: road, lod: 1 });
      // the grass of the crown between the ruts, and the hollows where the rain stands
      for (let i = 1; i < c.length - 1; i += 2) { const q = lerp2(rb.left[i], rb.right[i], .5); B.mark([[q[0] - EH[0] * .4, q[1] - EH[1] * .4, .04], [q[0], q[1], .9], [q[0] + EH[0] * .4, q[1] + EH[1] * .4, .04]], { on: road, lod: 2 }); }
      for (const [i, f] of [[7, .3], [19, .7], [24, .32]]) if (i < c.length) { const q = lerp2(rb.left[i], rb.right[i], f); B.mark(at(closed(ell(q[0], q[1], 1.4, .8, 10, -PI / 6)), .04), { on: road, lod: 2 }); }
    }
    // the ditches either side, where the road's water runs off
    { const db = ribbon(c, 16); for (const sd of ['left', 'right']) B.mark(at(db[sd].slice(1, -1), .04), { on: road, lod: 2 }); }
    // the milestone
    const mi = round(c.length * .4), mp = rb.right[mi], mx = mp[0] + EU[0] * 3, my = mp[1] + EU[1] * 3;
    B.box(mx - 2.8, my - 2.8, mx + 2.8, my + 2.8, 0, .9, { r: .3, b: .2, role: 'the milestone', lod: 2 });
    const ms = B.lathe(mx, my, [[1.9, .9], [1.9, 5.8], [1.5, 6.8], [0, 7.3]], { n: 14, role: 'the milestone', lod: 0 });
    // the engraved band round the shaft, the miles cut within it, the joints of the stone below
    for (const z of [5, 2.2]) hoop(B, ms, mx, my, 1.9, z, { n: 18, cls: 'mid', lod: 2 });
    for (const z of [4.4, 3.6, 2.8]) B.mark([[mx + .5, my + 1.83, z], [mx + 1.83, my + .5, z]], { on: ms, n: [S2, S2, 0], lod: 2 });
    staves(B, ms, mx, my, 1.9, .9, 2.2, 10, { lod: 2 });
    // a well or the ruin of a khan by the road
    if (R.chance(.5)) {
      const kx = 4, ky = -30, ks = 13;
      const walls = [[kx - ks, ky - ks, kx + ks, ky - ks + 2.4, R.r(9, 11)], [kx - ks, ky - ks, kx - ks + 2.4, ky + ks, R.r(6, 9)], [kx + ks - 2.4, ky - ks, kx + ks, ky + ks * .2, R.r(4, 7)]];
      for (const [x0, y0, x1, y1, h] of walls) { const wb = B.box(x0, y0, x1, y1, 0, h, { r: .4, b: .5, role: 'the ruined khan' }); for (let z = 2; z < h - 1; z += 2) B.band(z, { on: wb, sides: 'SE', lod: 2 }); }
      const gw = B.box(kx - ks, ky + ks - 2.4, kx + ks * .3, ky + ks, 0, R.r(11, 13), { r: .4, b: .5, role: 'the ruined khan' });
      B.door('S', .55, 5.4, 8.4, { on: gw, shape: 'pointed' });
      for (let z = 2; z < gw.face.z1 - 2; z += 2) B.band(z, { on: gw, sides: 'S', lod: 2 });
      const jag = []; for (let k = 0; k <= 6; k++) jag.push([lerp(kx - ks, kx + ks * .3, k / 6), ky + ks, gw.face.z1 - (k % 2 ? R.r(.6, 2) : 0)]);
      B.mark(jag, { on: gw, n: [0, 1, 0], cls: 'edge', lod: 1 });
      for (let k = 0; k < 3; k++) { const x = kx + ks * .5 + k * 3, y = ky + ks * .6 + R.r(-2, 2), s = R.r(1.2, 2); sol(B, [[[[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], 0], [[[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], s * 1.4]], { role: 'the ruined khan', lod: 2, crease: .2 }); }
    } else {
      const wx = 8, wy = -22;
      const wc = B.cyl(wx, wy, 4, 0, 2.8, { n: 12, b: .6, role: 'the well' });
      staves(B, wc, wx, wy, 4, 0, 2.8, 12, { off: .5, lod: 2 }); hoop(B, wc, wx, wy, 4, 1.4, { n: 24, lod: 2 });
      B.mark([[wx, wy, 9], [wx, wy, 3.2]], { on: wc, cls: 'mid', lod: 2 });
      B.line([[wx - EH[0] * 5, wy - EH[1] * 5, 0], [wx - EH[0] * 5, wy - EH[1] * 5, 9], [wx + EH[0] * 5, wy + EH[1] * 5, 9], [wx + EH[0] * 5, wy + EH[1] * 5, 0]], { role: 'the well', lod: 1, w: 1.3 });
      B.box(wx + 5, wy + 4, wx + 15, wy + 7, 0, 2, { r: .5, b: .6, role: 'the well', lod: 1 });
      palm(B, R, wx - 10, wy - 6, R.r(20, 24), { role: 'the well', lod: 0 });
    }
    // a strip of ploughland on the near side of the road
    const near = [S2, S2], ia = round(c.length * .4), ib = c.length - 4, fq = [];
    for (let i = ia; i <= ib; i++) fq.push(add2(rb.left[i][1] > rb.right[i][1] ? rb.left[i] : rb.right[i], near, 3));
    for (let i = ib; i >= ia; i--) fq.push(add2(rb.left[i][1] > rb.right[i][1] ? rb.left[i] : rb.right[i], near, 24 - 6 * abs((i - ia) / (ib - ia) - .5)));
    const fp = B.plate(at(fq, 0), { role: 'the fields', lod: 1 });
    const fqc = fq.reduce((a, p) => [a[0] + p[0] / fq.length, a[1] + p[1] / fq.length], [0, 0]), fqi = scl(fq, .95, fqc);
    B.mark(at(closed(fqi), 0), { on: fp, lod: 2 });
    hatch(fqi, PI / 4 + R.r(-.1, .1), 2.4).forEach((l, i) => B.mark(at(l, 0), { on: fp, lod: i % 2 ? 2 : 1 }));
    // the stones of the roadside, and the trees; the hills behind
    for (let k = 0; k < 3; k++) rock(B, R, R.r(-30, 0), R.r(26, 40), R.r(1.4, 2.6), R.r(1.2, 2.2), { lod: k < 2 ? 1 : 2 });
    const tk = R.pick(['cypress', 'round', 'palm']);
    for (const [i, side] of [[6, -1], [12, 1], [26, -1], [31, 1]]) {
      if (i >= c.length) continue;
      const p = side < 0 ? rb.left[i] : rb.right[i], q = [p[0] + EU[0] * -side * 5, p[1] + EU[1] * -side * 5];
      // the trees stand back from the road as secondary masses, so the milestone or the khan is the lit part
      if (tk === 'cypress') cypress(B, R, q[0], q[1], R.r(18, 24), { role: 'the trees', lod: 1 });
      else if (tk === 'palm') palm(B, R, q[0], q[1], R.r(18, 23), { role: 'the trees', lod: 1 });
      else leafy(B, R, q[0], q[1], R.r(14, 18), { role: 'the trees', lod: 1, r: 5.6, trunk: .6 });
    }
    // tussocks along the verges
    for (const [i, side] of [[4, 'left'], [10, 'right'], [17, 'left'], [22, 'right'], [28, 'left']]) if (i < c.length) { const p = rb[side][i], q = c[i], d = hypot(p[0] - q[0], p[1] - q[1]) || 1; tuft(B, R, p[0] + (p[0] - q[0]) / d * 4.2, p[1] + (p[1] - q[1]) / d * 4.2, 0, R.r(1.8, 2.6), { role: 'the road' }); }
    for (const [hx, hy, hr, hh] of [[-30, -34, 20, 14]]) { const rot = R.r(-.3, .3) - PI / 4, hl = [[ell(hx, hy, hr, hr * .66, 18, rot), 0], [ell(hx - 1, hy - 1, hr * .72, hr * .44, 18, rot), hh * .62], [ell(hx - 2, hy - 2, hr * .3, hr * .16, 18, rot), hh]]; const hp = sol(B, hl, { role: 'the hills', lod: 1 }); shade(B, hp, hl, [hx, hy], { dense: 5, min: .1 }); strata(B, hp, hl, [hx - 1, hy - 1], [hh * .22, hh * .45, hh * .7], { n: 30, slope: .4, wave: .25, lod: 2 }); }
    // the traveller and his donkey on the way
    const ti = round(c.length * .62), tp = c[ti], fl = R.chance(.5);
    figure(B, tp[0] + EH[0] * (fl ? 4 : -4), tp[1] + EH[1] * (fl ? 4 : -4), 9, { staff: true, flip: fl, role: 'the traveller', lod: 1 });
    donkey(B, tp[0] - EH[0] * (fl ? 6 : -6), tp[1] - EH[1] * (fl ? 6 : -6), 8.5, { flip: fl, role: 'the traveller', lod: 1 });
  });

  /* ---------- the other books, the ship and the room ---------- */
  /* A villa in the Tuscan hills, where the ten of the Decameron told their tales: a two-storey house
     under a pitched roof of curved tiles with a dovecote tower, a loggia of round arches, an avenue
     of cypresses to the door, a walled garden with its fountain, and olives */
  def('villa', (R, B) => {
    const x0 = -30, x1 = 10, y0 = -32, y1 = -12, h = R.r(20, 23), rp = R.r(6, 7.5), ov = 1.5, ym = (y0 + y1) / 2, zr = h + rp;
    const house = B.box(x0, y0, x1, y1, 0, h, { r: .5, b: .8, role: 'the villa' });
    B.band(h * .52, { on: house, sides: 'SE' });
    B.windows('S', 5, h * .62, 2.2, 4, { on: house, shape: 'flat', from: .1, to: .9 });
    for (const u of [.1, .3, .7, .9]) B.window('S', u, h * .16, 2.2, 3.6, { on: house, shape: 'flat' });
    B.door('S', .5, 4.4, 8.4, { on: house, shape: 'round' }); B.panel('S', .42, .58, 0, 9.6, { on: house, lod: 2 });
    // the shutters folded back beside each upper window, the quoins at the corners, the stone plinth course
    for (let i = 0; i < 5; i++) { const u = lerp(.1, .9, i / 4), du = 1.1 / (x1 - x0) + .5 * 2.2 / (x1 - x0); for (const sd of [-1, 1]) B.panel('S', u + sd * du - .5 / (x1 - x0), u + sd * du + .5 / (x1 - x0), h * .62, h * .62 + 4, { on: house, lod: 2 }); }
    for (let z = 1.6; z < h - 1; z += 2.2) for (const [side, u0, u1] of [['S', 0, 1.6 / (x1 - x0)], ['S', 1 - 1.6 / (x1 - x0), 1], ['E', 0, 1.6 / (y1 - y0)]]) B.panel(side, u0, u1, z, z + 1.1, { on: house, lod: 2 });
    B.band(1.2, { on: house, sides: 'SE', lod: 2 });
    for (const z of [h * .62, h * .16]) B.windows('E', 2, z, 2.2, z > 5 ? 4 : 3.6, { on: house, shape: 'flat', from: .28, to: .72 });
    // the roof: one wedge of coppi, its gable to the east with a small round window
    const run = y1 + ov - ym, sl = hypot(run, rp), nS = [0, rp / sl, run / sl];
    const roof = sol(B, [[[[x0 - ov, y0 - ov], [x1 + ov, y0 - ov], [x1 + ov, y1 + ov], [x0 - ov, y1 + ov]], h], [[[x0 - ov, ym], [x1 + ov, ym]], zr]], { role: 'the roof' });
    for (let k = 1, nk = 22; k < nk; k++) { const x = lerp(x0 - ov, x1 + ov, k / nk); B.mark([[x, ym + .3, zr - .2], [x, y1 + ov, h]], { on: roof, n: nS, lod: k % 3 ? 2 : 1 }); }
    // the ridge capped with a row of coppi, and the chimney stack with its little roof
    B.mark([[x0 - ov, ym + .5, zr - .15], [x1 + ov, ym + .5, zr - .15]], { on: roof, n: nS, lod: 2 });
    { const cx2 = lerp(x0, x1, .78), cz0 = zr - rp * .3, chm = B.box(cx2 - 1.1, ym + 1.2, cx2 + 1.1, ym + 3.4, cz0, zr + 3, { r: .2, b: 0, role: 'the roof', lod: 2 }); B.box(cx2 - 1.5, ym + .8, cx2 + 1.5, ym + 3.8, zr + 3, zr + 3.6, { r: .1, b: 0, role: 'the roof', lod: 2 }); }
    for (const f of [.33, .66]) B.mark([[x0 - ov, lerp(ym, y1 + ov, f), lerp(zr, h, f)], [x1 + ov, lerp(ym, y1 + ov, f), lerp(zr, h, f)]], { on: roof, n: nS, lod: 2 });
    B.mark(closed(ell(0, 0, 1, 1, 12)).map(([u, v]) => [x1 + ov, ym + u * 1.1, h + rp * .32 + v * 1.1]), { on: roof, n: [1, 0, 0], lod: 2 });
    // the dovecote tower rising from the roof
    if (R.chance(.8)) {
      const tx = lerp(x0, x1, R.r(.2, .35)), tw = 4.2, zf = zr - rp * tw / (y1 + ov - ym), th = R.r(10, 12);
      const tw_ = B.box(tx - tw, ym - tw, tx + tw, ym + tw, zf, zr + th, { r: .4, b: .5, role: 'the tower' });
      B.door('S', .5, 3, 4.6, { on: tw_, shape: 'round', z: zr + th - 6 }); B.door('E', .5, 3, 4.6, { on: tw_, shape: 'round', z: zr + th - 6 });
      B.band(zr + th - 1.2, { on: tw_, sides: 'SE' });
      for (const side of ['S', 'E']) for (let i = 0; i < 6; i++) B.panel(side, .2 + i * .12, .24 + i * .12, zr + th - 7.6, zr + th - 7.2, { on: tw_, lod: 2 });   // the pigeons' ledge and holes
      const sq = [[tx - tw - .8, ym - tw - .8], [tx + tw + .8, ym - tw - .8], [tx + tw + .8, ym + tw + .8], [tx - tw - .8, ym + tw + .8]];
      const cap = sol(B, [[sq, zr + th], [[[tx, ym]], zr + th + 7]], { role: 'the tower', lod: 1 });
      for (let k = 1; k < 5; k++) { const f = k / 5; B.mark([[lerp(tx - tw - .8, tx, f), lerp(ym + tw + .8, ym, f), zr + th + 7 * f], [lerp(tx + tw + .8, tx, f), lerp(ym + tw + .8, ym, f), zr + th + 7 * f]], { on: cap, n: [0, .7, .7], lod: 2 }); }
    }
    // the loggia: a wing of round arches on the east, under a lean-to roof
    const lx0 = x1, lx1 = x1 + R.r(18, 22), ly0 = y0 + 3, ly1 = y1 + 3, lh = 10.5;
    const lg = B.box(lx0, ly0, lx1, ly1, 0, lh, { r: .4, b: .6, role: 'the loggia' });
    B.arcade('S', 4, 0, lh * .78, { on: lg, shape: 'round', lod: 0 }); B.arcade('E', 3, 0, lh * .78, { on: lg, shape: 'round', lod: 1 });
    B.band(lh * .86, { on: lg, sides: 'SE', lod: 2 });
    // the lemon trees in their great pots along the loggia
    for (let i = 0; i < 3; i++) { const px2 = lerp(lx0 + 3, lx1 - 2, i / 2), py2 = ly1 + 3.4, pot = B.lathe(px2, py2, [[1, 0], [1.5, 1.8], [1.6, 2.2]], { n: 12, role: 'the loggia', lod: 2 }); hoop(B, pot, px2, py2, 1.38, 1.4, { n: 14, lod: 2 }); leafy(B, R, px2, py2, 6, { z: 2.2, zc: 3.6, r: 1.8, role: 'the loggia', lod: 2, leaves: 5 }); }
    const lr = B.plate([[lx0, ly0 - ov, lh + 3.6], [lx0, ly1 + ov, lh + 3.6], [lx1 + ov, ly1 + ov, lh - .3], [lx1 + ov, ly0 - ov, lh - .3]], { role: 'the loggia' });
    for (let k = 1; k < 9; k++) { const y = lerp(ly0 - ov, ly1 + ov, k / 9); B.mark([[lx0 + .4, y, lh + 3.5], [lx1 + ov, y, lh - .3]], { on: lr, lod: k % 2 ? 2 : 1 }); }
    // the avenue of cypresses to the door
    const ax = (x0 + x1) / 2, nC = R.i(3, 4);
    for (let i = 0; i < nC; i++) for (const sd of [-1, 1]) cypress(B, R, ax + sd * 6.5, -2 + i * 12, R.r(19, 23), { role: 'the cypresses', lod: 0 });
    B.guide([[ax, y1 + 1], [ax, 48]]);
    // the walled garden and its fountain
    const g0 = -48, g1 = -16, gy0 = -4, gy1 = 30, wt = 1.3, wh = 3.4;
    B.box(g0, gy0, g1, gy0 + wt, 0, wh, { r: .3, b: .3, role: 'the garden', lod: 1 });
    B.box(g0, gy0 + wt, g0 + wt, gy1, 0, wh, { r: .3, b: .3, role: 'the garden', lod: 1 });
    const gs = B.box(g0 + wt, gy1 - wt, g1, gy1, 0, wh, { r: .3, b: .3, role: 'the garden' });
    const ge = B.box(g1 - wt, gy0 + wt, g1, gy1 - wt, 0, wh, { r: .3, b: .3, role: 'the garden' });
    B.door('E', .5, 3, 4.6, { on: ge, shape: 'round' });
    for (const w of [gs, ge]) B.band(wh - .5, { on: w, sides: w === gs ? 'S' : 'E', lod: 2 });
    const fx = (g0 + g1) / 2, fy = (gy0 + gy1) / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const hx = fx + sx * 8, hy = fy + sy * 9, bd = B.box(hx - 5, hy - 5.5, hx + 5, hy + 5.5, 0, 1.4, { r: .8, b: .4, role: 'the garden', lod: 1 }); B.mark(at(closed([[hx - 3.4, hy], [hx, hy - 3.9], [hx + 3.4, hy], [hx, hy + 3.9]]), 1.4), { on: bd, lod: 2 }); B.mark(at(closed(ell(hx, hy, 1.1, 1.1, 10)), 1.4), { on: bd, lod: 2 }); }
    const basin = B.cyl(fx, fy, 3.8, 0, 1.4, { n: 18, b: .6, role: 'the fountain' });
    B.cyl(fx, fy, .6, 1.4, 4.6, { n: 8, b: 0, role: 'the fountain', lod: 1 });
    B.lathe(fx, fy, [[.4, 4.4], [2, 5], [2.2, 5.5]], { n: 14, role: 'the fountain', lod: 1 });
    for (const a of [0, 1.6, 3.2, 4.8]) B.mark([[fx, fy, 5.8], [fx + cos(a) * 1.4, fy + sin(a) * 1.4, 6.6], [fx + cos(a) * 2.6, fy + sin(a) * 2.6, 3], [fx + cos(a) * 3, fy + sin(a) * 3, 1.5]], { on: basin, lod: 2 });
    // olives on the slope below
    for (const [ox, oy] of [[30, 20], [40, 4]]) leafy(B, R, ox + R.r(-2, 2), oy + R.r(-2, 2), R.r(10, 13), { role: 'the olive trees', lod: 1, r: R.r(4.6, 5.6), zc: 3.6, clumps: 1, sq: .9, trunk: .55 });
    // the vines on the slope in rows across the view, each row's wire running from end post to end post, the stakes and the vines tied along it
    for (let r = 0; r < 3; r++) {
      const b = [22 + EU[0] * 5 * r, 38 + EU[1] * 5 * r], a0 = [b[0] - EH[0] * 7, b[1] - EH[1] * 7], a1 = [b[0] + EH[0] * 7, b[1] + EH[1] * 7];
      const vl = B.line([[a0[0], a0[1], 0], [a0[0], a0[1], 3.4], [a1[0], a1[1], 3.4], [a1[0], a1[1], 0]], { role: 'the olive trees', lod: 2, w: 1 });
      for (let k = 1; k < 7; k++) { const q = lerp2(a0, a1, k / 7); B.mark([[q[0], q[1], 0], [q[0], q[1], 3.4]], { on: vl, lod: 2 }); B.mark([[q[0] - EH[0] * .9, q[1] - EH[1] * .9, 3.4], [q[0], q[1], 2.2], [q[0] + EH[0] * .9, q[1] + EH[1] * .9, 3.4]], { on: vl, cls: 'mid', lod: 2 }); }
    }
  });

  /* A Doric temple of the Odyssey's Greece, facing the sunrise: three steps, a peristyle of six
     columns by eleven, the cella with its door behind, the frieze of triglyphs, a low pitched roof
     with its pediment, and the altar in front of the east end */
  def('temple', (R, B) => {
    const nS = R.pick([11, 12, 13]), nE = 6, sp = 7.4 * 10 / (nS - 1) * (nS === 11 ? 1 : 1.06), cr = 2, x0 = -(nS - 1) * sp / 2 - 4, x1 = x0 + (nS - 1) * sp, y0 = -(nE - 1) * sp / 2 - 6, y1 = y0 + (nE - 1) * sp;
    const m = cr + 1.8;
    for (let i = 0; i < 3; i++) {
      const g = m + (2 - i) * 1.5, st = B.box(x0 - g, y0 - g, x1 + g, y1 + g, i * 1.4, (i + 1) * 1.4, { r: .3, b: .5, role: 'the steps' });
      // the joints between the blocks of each step, staggered course to course, from the step's foot to its tread
      const bl2 = 3.7, z0s = i * 1.4, z1s = (i + 1) * 1.4;
      for (let x = x0 - g + bl2 * (i % 2 ? .5 : 1); x < x1 + g - .5; x += bl2) B.mark([[x, y1 + g, z0s], [x, y1 + g, z1s]], { on: st, n: [0, 1, 0], lod: 2 });
      for (let y = y0 - g + bl2 * (i % 2 ? .5 : 1); y < y1 + g - .5; y += bl2) B.mark([[x1 + g, y, z0s], [x1 + g, y, z1s]], { on: st, n: [1, 0, 0], lod: 2 });
    }
    // the ramp up to the east front, where the procession went in
    { const ymr = (y0 + y1) / 2, xr0 = x1 + m + 3, xr1 = x1 + m + 3 + 10, rw2 = 4.4, rp2 = sol(B, [[[[xr1, ymr - rw2], [xr1, ymr + rw2], [xr0, ymr + rw2], [xr0, ymr - rw2]], 0], [[[xr0, ymr - rw2], [xr0, ymr + rw2]], 4.2]], { role: 'the steps' }); for (let k = 1; k < 5; k++) { const f = k / 5; B.mark([[lerp(xr1, xr0, f), ymr - rw2, 4.2 * f], [lerp(xr1, xr0, f), ymr + rw2, 4.2 * f]], { on: rp2, n: [.7, 0, .7], lod: 2 }); } }
    const zs = 4.2, ch = R.r(17, 19), ze = zs + ch;
    const cella = B.box(x0 + sp * .9, y0 + sp * .8, x1 - sp * 1.4, y1 - sp * .8, zs, ze, { r: .3, b: 0, role: 'the cella' });
    B.door('E', .5, 5, ch * .7, { on: cella, shape: 'flat' });
    B.band(zs + 1, { on: cella, sides: 'SE', lod: 2 });
    for (let z = zs + 2.6; z < ze - 1; z += 1.6) B.band(z, { on: cella, sides: 'SE', lod: 2 });
    // the columns, eight-sided and tapering, with their fluting
    const col = (x, y, lod) => {
      const c = B.cyl(x, y, cr, zs, ze, { n: 8, b: 0, top: .8, rot: PI / 8, role: 'the columns', lod });
      // a flute down each face in view, ending on the stylobate and under the capital
      for (const a of [-PI * .13, PI * .12, PI * .37, PI * .62]) B.mark([[x + cos(a) * cr * .95, y + sin(a) * cr * .95, zs], [x + cos(a) * cr * .78, y + sin(a) * cr * .78, ze - 1.7]], { on: c, n: [cos(a), sin(a), 0], lod: 2 });
      // the joints between its drums, round the octagon on its near side
      for (const z of [zs + ch * .3, zs + ch * .6]) { const rr = cr * lerp(1, .8, (z - zs) / ch), pts = []; for (let k = 0; k <= 8; k++) { const a = PI / 8 + k / 8 * TAU; pts.push([x + cos(a) * rr, y + sin(a) * rr, z]); } ringMark(B, c, pts, [x, y], { step: 1, lod: 2 }); }
      return c;
    };
    const cols = [];
    for (let i = 0; i < nS; i++) cols.push([x0 + i * sp, y1, 0]);
    for (let j = 0; j < nE - 1; j++) cols.push([x1, y0 + j * sp, 0]);
    // the north flank stands hidden behind the cella and the roof; the west front is drawn up close
    for (let j = 0; j < nE - 1; j++) cols.push([x0, y0 + j * sp, 2]);
    for (const [x, y, l] of cols) col(x, y, l);
    // the entablature: architrave, the frieze of triglyphs, the cornice
    const ent = B.box(x0 - cr - .6, y0 - cr - .6, x1 + cr + .6, y1 + cr + .6, ze, ze + 5, { r: .2, b: .5, role: 'the frieze' });
    B.band(ze + 2.2, { on: ent, sides: 'SE' });
    // the capitals under it: the echinus and the abacus of each column in view
    for (const [x, y, l] of cols) { if (l) continue; const P = (u, z) => [x + EH[0] * u, y + EH[1] * u, z]; B.mark([P(-cr * .8, ze - 1.7), P(-cr * 1.3, ze - .55), P(cr * 1.3, ze - .55), P(cr * .8, ze - 1.7)], { on: ent, lod: 1 }); B.mark([P(-cr * 1.3, ze - .55), P(-cr * 1.3, ze), P(cr * 1.3, ze), P(cr * 1.3, ze - .55)], { on: ent, lod: 2 }); }
    const tri = (side, u) => { const F = side === 'S' ? (uu, z) => [lerp(x0 - cr - .6, x1 + cr + .6, uu), y1 + cr + .6, z] : (uu, z) => [x1 + cr + .6, lerp(y0 - cr - .6, y1 + cr + .6, uu), z]; for (const d of [-.006, 0, .006]) B.mark([F(u + d, ze + 2.4), F(u + d, ze + 4.6)], { on: ent, n: side === 'S' ? [0, 1, 0] : [1, 0, 0], lod: d ? 2 : 1 }); };
    const LS = x1 - x0 + 2 * cr + 1.2, LE = y1 - y0 + 2 * cr + 1.2;
    for (let i = 0; i < nS * 2 - 1; i++) tri('S', (cr + .6 + i * sp / 2) / LS);
    for (let j = 0; j < nE * 2 - 1; j++) tri('E', (cr + .6 + j * sp / 2) / LE);
    // the regulae and their guttae under each triglyph, where the architrave meets the frieze
    for (let i = 0; i < nS * 2 - 1; i++) { const u = (cr + .6 + i * sp / 2) / LS, x = lerp(x0 - cr - .6, x1 + cr + .6, u); B.mark([[x - .7, y1 + cr + .6, ze + 2.2], [x - .7, y1 + cr + .6, ze + 1.7], [x + .7, y1 + cr + .6, ze + 1.7], [x + .7, y1 + cr + .6, ze + 2.2]], { on: ent, n: [0, 1, 0], lod: 2 }); }
    const cor = B.box(x0 - cr - 1.3, y0 - cr - 1.3, x1 + cr + 1.3, y1 + cr + 1.3, ze + 5, ze + 6.2, { r: .2, b: 0, role: 'the frieze', lod: 1 });
    B.band(ze + 5.5, { on: cor, sides: 'SE', lod: 2 });
    // the roof and the pediment
    const zr = ze + 6.2, ov = cr + 1.3, ymid = (y0 + y1) / 2, rh = (y1 - y0 + 2 * ov) * .17;
    const run = y1 + ov - ymid, sl = hypot(run, rh), nR = [0, rh / sl, run / sl];
    const roof = sol(B, [[[[x0 - ov, y0 - ov], [x1 + ov, y0 - ov], [x1 + ov, y1 + ov], [x0 - ov, y1 + ov]], zr], [[[x0 - ov, ymid], [x1 + ov, ymid]], zr + rh]], { role: 'the roof' });
    for (let k = 1; k < 26; k++) { const x = lerp(x0 - ov, x1 + ov, k / 26); B.mark([[x, ymid + .2, zr + rh - .1], [x, y1 + ov, zr]], { on: roof, n: nR, lod: 2 }); }
    // the antefixes standing along the eave, one at the foot of each row of cover tiles
    for (let k = 1; k < 26; k += 2) { const x = lerp(x0 - ov, x1 + ov, k / 26); B.mark([[x - .45, y1 + ov, zr], [x, y1 + ov + .1, zr + 1.1], [x + .45, y1 + ov, zr]], { on: roof, cls: 'edge', lod: 2 }); }
    // the pediment: the tympanum within its raking cornice, the acroteria
    B.mark([[x1 + ov, y0 - ov + 2.4, zr + .7], [x1 + ov, ymid, zr + rh - 1], [x1 + ov, y1 + ov - 2.4, zr + .7], [x1 + ov, y0 - ov + 2.4, zr + .7]], { on: roof, n: [1, 0, 0], lod: 1 });
    for (const [yy, zz] of [[ymid, zr + rh], [y0 - ov, zr], [y1 + ov, zr]]) B.mark([[x1 + ov, yy, zz], [x1 + ov, yy, zz + 1.6]], { on: roof, cls: 'edge', lod: 2 });
    // the altar before the east front, and a sacred olive
    const ax = x1 + 17, ay = ymid + R.r(-3, 3);
    const alt = B.box(ax - 3.5, ay - 5, ax + 3.5, ay + 5, 0, 3.8, { r: .3, b: .5, role: 'the altar' });
    B.band(3, { on: alt, sides: 'SE', lod: 2 });
    B.box(ax - 5, ay - 6.5, ax + 5, ay + 6.5, 0, .6, { r: .2, b: 0, role: 'the altar', lod: 1 });
    B.panel('E', .2, .8, 1, 2.4, { on: alt, lod: 2 }); B.panel('S', .25, .75, 1, 2.4, { on: alt, lod: 2 });
    // the votive stelae set up beside the way to the altar
    for (const [dx2, dy2] of [[-6, 9], [-1.5, 11]]) { const sx2 = ax + dx2, sy2 = ay + dy2; B.box(sx2 - 1.3, sy2 - 1.3, sx2 + 1.3, sy2 + 1.3, 0, .8, { r: .2, b: 0, role: 'the altar', lod: 2 }); const sb = B.box(sx2 - .9, sy2 - .45, sx2 + .9, sy2 + .45, .8, 5.6, { r: .15, b: 0, top: .08, role: 'the altar', lod: 2 }); for (const z of [4.6, 4, 3.4]) B.mark([[sx2 - .6, sy2 + .45, z], [sx2 + .6, sy2 + .45, z]], { on: sb, n: [0, 1, 0], lod: 2 }); }
    if (R.chance(.6)) B.cut([FLAME], ax, ay, 3.8, 3.6, { w: 3, role: 'the altar', lod: 2 });
    leafy(B, R, x1 + 10, y1 + 18, R.r(12, 15), { role: 'the sacred olive', lod: 1, r: 5.6, zc: 4, clumps: 2, sq: .9, trunk: .65 });
  });

  /* a pueblo of stepped terraces, its rooms stacked back from the plaza, with T doors, the beam ends
     of the roofs, ladders up from roof to roof and a beehive oven */
  function pueblo(B, R, px, py, z0, role = 'the pueblo') {
    const tiers = [[R.r(28, 32), 15, 6], [R.r(20, 23), 10, 5.6], [R.r(10, 13), 6, 5.4]], X0 = px - 15, Y0 = py - 8;
    let z = z0; const boxes = [];
    tiers.forEach(([w, d, h], k) => {
      const b = B.box(X0 + k * 1.2, Y0, X0 + k * 1.2 + w, Y0 + d, z, z + h, { r: .5, b: .6, role, lod: k < 2 ? 0 : 1 });
      // T-shaped doors and small windows on the south, the vigas jutting under the roof
      const F = (u, zz) => [lerp(X0 + k * 1.2, X0 + k * 1.2 + w, u), Y0 + d, zz];
      for (const u of k === 0 ? [.2, .62] : [.4]) { const hw = .05 * 30 / w; B.mark([F(u - hw * .5, z), F(u - hw * .5, z + 2.6), F(u - hw, z + 2.6), F(u - hw, z + 4.2), F(u + hw, z + 4.2), F(u + hw, z + 2.6), F(u + hw * .5, z + 2.6), F(u + hw * .5, z)], { on: b, n: [0, 1, 0], lod: 1 }); }
      B.window('S', k === 0 ? .82 : .75, z + 2.6, 1.3, 1.3, { on: b, shape: 'flat', lod: 2 });
      B.window('E', .5, z + 2.6, 1.3, 1.3, { on: b, shape: 'flat', lod: 2 });
      // the parapet's coping, and the plaster's courses of puddled adobe
      B.band(z + h - .45, { on: b, sides: 'SE', lod: 2 }); B.band(z + h * .45, { on: b, sides: 'SE', lod: 2 });
      for (let i = 0; i < Math.floor(w / 3); i++) { const u = (i + .5) / Math.floor(w / 3); const p = F(u, z + h - .9); B.mark([p, [p[0], p[1] + 1.3, p[2] - .1]], { on: b, n: [0, 1, 0], cls: 'edge', lod: 2 }); }
      boxes.push(b); z += h;
    });
    // the ladders, their poles standing above the roof they reach
    const ladder = (x, yb, zb, yt, zt, lod) => {
      const top = zt + 3.2;
      const rail = B.line([[x, yb, zb], [x, yt - (top - zt) * (yb - yt) / (zt - zb), top]], { role: 'the ladders', lod, w: 1.1 });
      B.mark([[x + 1.6, yb, zb], [x + 1.6, yt - (top - zt) * (yb - yt) / (zt - zb), top]], { on: rail, cls: 'edge', lod });
      for (let i = 1; i < 7; i++) { const f = i / 7 * (zt - zb) / (top - zb), yy = lerp(yb, yt - (top - zt) * (yb - yt) / (zt - zb), f), zz = lerp(zb, top, f); B.mark([[x, yy, zz], [x + 1.6, yy, zz]], { on: rail, lod: 2 }); }
    };
    const [w0, d0, h0] = tiers[0], [, d1, h1] = tiers[1];
    ladder(X0 + w0 * .42, Y0 + d0 + 2.6, z0, Y0 + d0 + .2, z0 + h0, 0);
    ladder(X0 + 1.2 + tiers[1][0] * .7, Y0 + d1 + 2.2, z0 + h0, Y0 + d1 + .2, z0 + h0 + h1, 1);
    // the chimneys of broken pots stacked mouth to foot, and the hatch of the room below with its ladder poles
    for (const [cx2, cy2, cz, k2] of [[X0 + 4, Y0 + 3, z0 + h0, 0], [X0 + 1.2 + tiers[1][0] - 3, Y0 + 2.5, z0 + h0 + h1, 1]]) { const cm = B.lathe(cx2, cy2, [[.75, cz], [.95, cz + .5], [.7, cz + 1], [.95, cz + 1.5], [.7, cz + 2], [.9, cz + 2.6]], { n: 10, role, lod: 2 }); hoop(B, cm, cx2, cy2, .7, cz + 1, { n: 10, lod: 2 }); }
    { const hx2 = X0 + w0 * .7, hy2 = Y0 + 4, hz = z0 + h0; B.mark(at(closed([[hx2 - 1.4, hy2 - 1], [hx2 + 1.4, hy2 - 1], [hx2 + 1.4, hy2 + 1], [hx2 - 1.4, hy2 + 1]]), hz), { on: boxes[0], lod: 2 }); const lp = B.line([[hx2 - .8, hy2, hz], [hx2 - .8, hy2 - .4, hz + 4], [hx2 + .8, hy2 - .4, hz + 4], [hx2 + .8, hy2, hz]], { role: 'the ladders', lod: 2, w: 1 }); for (const zz of [1.2, 2.4]) B.mark([[hx2 - .8, hy2 - .12 * zz, hz + zz], [hx2 + .8, hy2 - .12 * zz, hz + zz]], { on: lp, lod: 2 }); }
    // the beehive oven on the first roof
    const ox = X0 + w0 - 4, oy = Y0 + d0 - 4;
    const ov = B.lathe(ox, oy, [[2.4, z0 + h0], [2.6, z0 + h0 + 1.3], [2.1, z0 + h0 + 2.7], [1.1, z0 + h0 + 3.5], [0, z0 + h0 + 3.8]], { n: 14, role: 'the oven', lod: 1 });
    B.mark([[ox - .6, oy + 2.5, z0 + h0], [ox - .6, oy + 2.5, z0 + h0 + 1.2], [ox + .6, oy + 2.5, z0 + h0 + 1.2], [ox + .6, oy + 2.5, z0 + h0]], { on: ov, n: [0, 1, 0], lod: 2 });
    return boxes[0];
  }
  /* A mesa of the Zuni country: a flat-topped rock with banded cliffs over its talus, the pueblo
     of stepped terraces on its summit (Dowa Yalanne) or at its foot by the waffle gardens */
  def('mesa', (R, B) => {
    const onTop = R.chance(.55), n = 11, a0 = R() * TAU, mx = onTop ? -4 : -14, my = onTop ? -4 : -16, rot = R.r(-.2, .3);
    const k = onTop ? 1 : .88;
    const t0 = wob(R, mx, my, 46 * k, 37 * k, n, .06, rot, a0), t1 = wob(R, mx - 1, my - 1, 37 * k, 28 * k, n, .07, rot, a0), zt = R.r(7, 9);
    const talus = sol(B, [[t0, 0], [t1, zt]], { role: 'the talus' });
    const c1 = t1.map(p => [mx - 1.5 + (p[0] - mx + 1) * .93, my - 1.5 + (p[1] - my + 1) * .93]), zc = zt + R.r(19, 24);
    const CL = [[t1, zt], [c1, zc]];
    const cliff = sol(B, CL, { role: 'the mesa', crease: 1.3 });
    // the cliff's bands of sandstone, a hard ledge among them, and the joints
    const bands = []; let z = zt + R.r(2, 3.5); while (z < zc - 2.5) { bands.push(z); z += R.r(3, 6.5); }
    bands.forEach((bz, i) => surf(B, cliff, closed(sectionAt(CL, bz)).map(p => [p[0], p[1], bz]), [mx, my], { slope: .06, cls: i === 1 ? 'mid' : 'lo', lod: i % 2 ? 2 : 1 }));
    for (let j = 0; j < n; j++) { if (!R.chance(.5)) continue; const za = bands[R.i(0, max(0, bands.length - 2))] || zt + 3, zb = min(za + R.r(3, 7), zc - 1), A = sectionAt(CL, za)[j], Bq = sectionAt(CL, zb)[j], f = R.r(.2, .8), nj = (j + 1) % n, A2 = sectionAt(CL, za)[nj], B2 = sectionAt(CL, zb)[nj]; surf(B, cliff, [[lerp(A[0], A2[0], f), lerp(A[1], A2[1], f), za], [lerp(Bq[0], B2[0], f), lerp(Bq[1], B2[1], f), zb]], [mx, my], { radial: true, slope: .06, lod: 2 }); }
    // the twin pillars of rock standing off the mesa's flank
    const sd = R.chance(.5) ? 1 : -1, px0 = mx + EH[0] * sd * 44 * k + EU[0] * 6, py0 = my + EH[1] * sd * 44 * k + EU[1] * 6;
    for (const [dx, hh, rr] of [[-4, R.r(30, 36), 3.8], [4.5, R.r(24, 30), 3.2]]) {
      const qx = px0 + EH[0] * dx, qy = py0 + EH[1] * dx, qa = R() * TAU;
      sol(B, [[wob(R, qx, qy, rr * 2.4, rr * 2.1, 9, .1, qa), 0], [wob(R, qx, qy, rr * 1.15, rr, 9, .1, qa), hh * .25]], { role: 'the pillars', lod: 1 });
      const pl = [[wob(R, qx, qy, rr * 1.1, rr * .95, 9, .08, qa), hh * .25], [wob(R, qx + .3, qy - .3, rr * .8, rr * .7, 9, .12, qa), hh]];
      const pp = sol(B, pl, { role: 'the pillars', lod: 0 }); shade(B, pp, pl, [qx, qy], { flat: true, zLo: hh * .27, zHi: hh - .6, dense: 5, slope: .05 });
      for (const fz of [.45, .7]) surf(B, pp, closed(sectionAt(pl, hh * fz)).map(p => [p[0], p[1], hh * fz]), [qx, qy], { slope: .05, lod: 2 });
    }
    shade(B, cliff, CL, [mx, my], { zHi: zc - 1.5, zLo: zt + .4, flat: true, slope: .06, dense: 9 });
    // the streaks of desert varnish run down from the rim, and two shallow alcoves the wind has scooped in the cliff
    for (let j = 0; j < n; j++) for (const f of [.3, .7]) { if ((j + (f > .5 ? 1 : 0)) % 3) continue; const A = sectionAt(CL, zc - .3), A2 = sectionAt(CL, zc - 6), a = lerp2(A[j], A[(j + 1) % n], f), b = lerp2(A2[j], A2[(j + 1) % n], f); surf(B, cliff, [[a[0], a[1], zc - .3], [b[0], b[1], zc - R.r(4, 7)]], [mx, my], { radial: true, slope: .06, lod: 2 }); }
    // the thin beds between the bands, so the cliff reads as stacked sandstone up close
    const thin = []; for (let i = 0; i + 1 < bands.length; i++) thin.push(lerp(bands[i], bands[i + 1], .5)); if (bands.length) thin.push(lerp(zt, bands[0], .5));
    strata(B, cliff, CL, [mx, my], thin, { n: 44, slope: .06, wave: .12, lod: 2 });
    const faceJ = da => { let bj = 0, bd = 1e9; for (let j = 0; j < n; j++) { const q = lerp2(t1[j], t1[(j + 1) % n], .5), a = Math.atan2(q[1] - my, q[0] - mx), d = abs(Math.atan2(sin(a - PI / 4 - da), cos(a - PI / 4 - da))); if (d < bd) { bd = d; bj = j; } } return bj; };
    for (const [j, f, za] of [[faceJ(-.55), .4, zt + (zc - zt) * .35], [faceJ(.5), .6, zt + (zc - zt) * .55]]) { const pts = []; for (let k2 = 0; k2 <= 8; k2++) { const t = k2 / 8, zz = za + sin(t * PI) * 2.6, S = sectionAt(CL, zz), q = lerp2(S[j], S[(j + 1) % n], f - .08 + t * .16); pts.push([q[0], q[1], zz]); } pts.push(pts[0]); surf(B, cliff, pts, [mx, my], { slope: .06, cls: 'mid', lod: 2 }); }
    // the scree down the talus
    for (let j = 0; j < n; j++) for (const t of [.3, .7]) { const a = lerp2(t1[j], t1[(j + 1) % n], t), b = lerp2(t0[j], t0[(j + 1) % n], t); surf(B, talus, [[a[0], a[1], zt - .3], [lerp(a[0], b[0], .8), lerp(a[1], b[1], .8), zt * .2]], [mx, my], { radial: true, slope: .5, lod: t < .5 ? 1 : 2 }); }
    for (let i = 0; i < 4; i++) { const a = PI * .1 + i * .45, p = [mx + cos(a + rot) * 47 * k, my + sin(a + rot) * 38 * k]; rock(B, R, p[0], p[1], R.r(2, 3.2), R.r(1.8, 2.8), { lod: 2 }); }
    // blocks fallen from the cliff, lying on the talus where they stopped; junipers in the talus
    for (let i = 0; i < 3; i++) { const j = 1 + i * 2, p = lerp2(t1[j], t0[j], .3); rock(B, R, p[0], p[1], R.r(1.6, 2.4), R.r(1.4, 2.2), { z: heightIn([[t0, 0], [t1, zt]], p[0], p[1]) - .2, lod: 2, plain: true }); }
    for (let i = 0; i < 2; i++) { const j = 2 + i * 3, p = lerp2(t1[j], t0[j], .72); leafy(B, R, p[0], p[1], R.r(6, 7.5), { z: heightIn([[t0, 0], [t1, zt]], p[0], p[1]), r: 2.4, role: 'the talus', lod: 2, leaves: 6 }); }
    if (onTop) {
      // the old trail up the talus and through the cleft to the town on top
      const ta = PI / 4 + .25, p0 = rayHit(t0, mx, my, ta), p1 = rayHit(t1, mx, my, ta + .12), pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, q = lerp2(p0, p1, t), sw = (i % 2 ? 1 : -1) * 2.2 * (1 - t); pts.push([q[0] - sin(ta) * sw, q[1] + cos(ta) * sw, zt * t + .3]); }
      B.mark(pts, { on: talus, cls: 'mid', lod: 2 });
    }
    if (onTop) pueblo(B, R, mx + 1, my + 2, zc);
    else {
      pueblo(B, R, 28, 24, 0);
      // the waffle gardens: small walled squares of earth by the water
      const gx = -26, gy = 32, gs = 3.2, g = B.plate(at([[gx - 12, gy - 7], [gx + 12, gy - 7], [gx + 12, gy + 7], [gx - 12, gy + 7]], 0), { role: 'the waffle gardens', cls: 'lo', lod: 1 });
      for (let i = 1; i < 8; i++) B.mark([[gx - 12 + i * 24 / 8, gy - 7, 0], [gx - 12 + i * 24 / 8, gy + 7, 0]], { on: g, lod: 2 });
      for (let i = 1; i < 5; i++) B.mark([[gx - 12, gy - 7 + i * 14 / 5, 0], [gx + 12, gy - 7 + i * 14 / 5, 0]], { on: g, lod: 2 });
      // the young plants, one in the middle of each square that is sown
      for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { if ((i * 3 + j) % 4 === 0) continue; const x = gx - 12 + (i + .5) * 3, y = gy - 7 + (j + .5) * 2.8; B.mark([[x - EH[0] * .5, y - EH[1] * .5, 0], [x, y, .9], [x + EH[0] * .5, y + EH[1] * .5, 0]], { on: g, lod: 2 }); }
      B.guide(spline([[gx + 12, gy], [6, 30], [12, 24]], 4));
    }
  });

  /* A townhouse mound of the Cherokee: the flat-topped earthen mound with its ramp of log steps, the
     seven-sided council house on top with the smoke of the sacred fire, the plaza before it with the
     chunkey pole and the summer houses, and the palisade all round */
  def('mound', (R, B) => {
    const mx0 = -40, mx1 = 2, my0 = -42, my1 = -8, mh = R.r(12, 15), tp = 8;
    const mound = B.box(mx0, my0, mx1, my1, 0, mh, { r: 5.5, b: 1, top: tp, role: 'the mound' });
    // the grass and the slope of the mound, a few strokes down its faces
    for (let k = 1; k < 7; k++) { const x = lerp(mx0 + 10, mx1 - 4, k / 7); B.mark([[x, my1 - tp + .6, mh - .4], [x, my1 - 1.2, 2.2]], { on: mound, n: [0, .7, .7], lod: 2 }); }
    // the ramp up its south face, with steps of logs
    const rx = lerp(mx0, mx1, .5) + R.r(-4, 4), rw = 4.6, rL = 13;
    const ramp = sol(B, [[[[rx - rw, my1 - .5], [rx + rw, my1 - .5], [rx + rw, my1 + rL], [rx - rw, my1 + rL]], 0], [[[rx - rw * .8, my1 - tp + 1], [rx + rw * .8, my1 - tp + 1]], mh]], { role: 'the ramp' });
    for (let i = 1; i < 8; i++) { const f = i / 8, yy = lerp(my1 + rL, my1 - tp + 1, f), ww = lerp(rw, rw * .8, f); B.mark([[rx - ww, yy, f * mh + .1], [rx + ww, yy, f * mh + .1]], { on: ramp, n: [0, .55, .83], lod: i % 2 ? 1 : 2 }); }
    // the council house on top: seven walls, a bark roof, the smoke hole
    const tx = (mx0 + mx1) / 2 - 1, ty = (my0 + my1) / 2 - 1, tr = 8.6;
    const wall = B.cyl(tx, ty, tr, mh, mh + 4.6, { n: 7, b: .5, rot: PI / 2, role: 'the council house' });
    B.mark([[tx - 1.2, ty + tr * .9, mh], [tx - 1.2, ty + tr * .9, mh + 3.2], [tx + 1.2, ty + tr * .9, mh + 3.2], [tx + 1.2, ty + tr * .9, mh]], { on: wall, n: [0, 1, 0], lod: 1 });
    // the wattle of its walls between the posts, daubed over, the posts showing
    staves(B, wall, tx, ty, tr * .95, mh, mh + 4.6, 14, { lod: 2 }); hoop(B, wall, tx, ty, tr * .96, mh + 2.3, { n: 21, lod: 2 });
    const roof = B.cone(tx, ty, tr + 1.4, mh + 4.6, mh + 12, { n: 7, tip: 1, role: 'the council house' });
    // the courses of bark shingles round the roof
    for (const f of [.28, .55, .78]) hoop(B, roof, tx, ty, lerp(tr + 1.4, 1, f), mh + 4.6 + 7.4 * f, { n: 21, lod: 2 });
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + PI / 2; B.mark([[tx + cos(a) * 1.1, ty + sin(a) * 1.1, mh + 11.8], [tx + cos(a) * (tr + 1.3), ty + sin(a) * (tr + 1.3), mh + 4.7]], { on: roof, n: [cos(a) * .6, sin(a) * .6, .8], lod: 2 }); }
    B.line(spline([[tx, ty, mh + 12.5], [tx + .8, ty - .4, mh + 16], [tx - .4, ty - 1, mh + 19.5], [tx + 1, ty - 1.8, mh + 23]], 3), { role: 'the sacred fire', cls: 'lo', lod: 1 });
    // the plaza: the chunkey pole, and the summer houses along its side
    const px = 16 + R.r(-3, 3), py = 12 + R.r(-3, 3);
    B.line([[px, py, 0], [px, py, 26]], { role: 'the chunkey pole', lod: 0, w: 1.6 });
    B.mark([[px - 1.2, py + 1.2, 25.4], [px + 1.2, py - 1.2, 25.4]], { on: B.last, cls: 'edge', lod: 2 });
    const plaza = B.plate(at(ell(px - 2, py - 2, 18, 14, 20, -PI / 4), 0), { role: 'the plaza', cls: 'lo', lod: 1 });
    // the chunkey alley worn across the plaza, its stone and the players' poles lying at its end
    { const ca = -PI / 4 + .1, ux = cos(ca), uy = sin(ca), L = 13; for (const sd of [-1.6, 1.6]) B.mark([[px - 2 - ux * L - uy * sd, py - 2 - uy * L + ux * sd, 0], [px - 2 + ux * L - uy * sd, py - 2 + uy * L + ux * sd, 0]], { on: plaza, lod: 2 });
      B.cyl(px - 2 + ux * 6, py - 2 + uy * 6, .9, 0, .5, { n: 12, b: .2, role: 'the chunkey pole', lod: 2 });
      for (const sd of [-.6, .6]) B.mark([[px - 2 + ux * 9 - uy * sd, py - 2 + uy * 9 + ux * sd, .1], [px - 2 + ux * 15 - uy * (sd + .8), py - 2 + uy * 15 + ux * (sd + .8), .1]], { on: plaza, cls: 'mid', lod: 2 }); }
    for (const [hx, hy] of [[34, -18], [36, -2], [-30, 18]].slice(0, R.i(2, 3))) {
      const r4 = [[hx - 6, hy - 4], [hx + 6, hy - 4], [hx + 6, hy + 4], [hx - 6, hy + 4]];
      const hs = sol(B, [[r4, 0], [r4, 4], [[[hx - 6, hy], [hx + 6, hy]], 7.4]], { role: 'the summer houses' });
      B.mark([[hx - 1, hy + 4, 0], [hx - 1, hy + 4, 3], [hx + 1, hy + 4, 3], [hx + 1, hy + 4, 0]], { on: hs, n: [0, 1, 0], lod: 2 });
      B.mark([[hx - 6, hy + 4, 4], [hx + 6, hy + 4, 4]], { on: hs, n: [0, .5, .86], lod: 1 });
      // the bark of the roof in sheets down the slope, the posts of the open walls
      for (let k = 1; k < 8; k++) { const x = lerp(hx - 6, hx + 6, k / 8); B.mark([[x, hy + .2, 7.3], [x, hy + 4, 4]], { on: hs, n: [0, .5, .86], lod: 2 }); }
      for (const u of [-3, 3]) B.mark([[hx + u, hy + 4, 0], [hx + u, hy + 4, 4]], { on: hs, n: [0, 1, 0], lod: 2 });
    }
    // the palisade of sharpened posts, all round but for the gate toward the river
    const prx = 47, pry = 45, pcx = -1, pcy = -1, gate = PI / 4 + R.r(-.2, .2), N = 11;
    for (let k = 0; k < N; k++) {
      const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, mid = (a0 + a1) / 2;
      const dg = Math.atan2(sin(mid - gate), cos(mid - gate));
      if (abs(dg) < .22) continue;
      const pts = [], np = 9;
      for (let i = 0; i <= np; i++) { const a = lerp(a0, a1, i / np); if (abs(Math.atan2(sin(a - gate), cos(a - gate))) < .12) continue; const x = pcx + cos(a) * prx, y = pcy + sin(a) * pry; pts.push([x, y, 0], [x, y, 6], [x, y, 6.9], [x, y, 0]); }
      if (pts.length > 1) { const pl = B.line(pts, { role: 'the palisade', lod: 1 }); const bt = pts.filter((p, i) => i % 4 === 1); for (const zz of [2, 4.6]) if (bt.length > 1) B.mark(bt.map(p => [p[0], p[1], zz]), { on: pl, lod: 2 }); }
    }
    B.guide(spline([[pcx + cos(gate) * 56, pcy + sin(gate) * 54], [pcx + cos(gate) * 40, pcy + sin(gate) * 38], [px + 4, py + 6]], 4));
    // inside the palisade: a patch of corn in its hills, and the crib that keeps the harvest up on its posts
    const cx0 = -28, cy0 = 26, cf = B.plate(at([[cx0 - 9, cy0 - 5], [cx0 + 9, cy0 - 5], [cx0 + 9, cy0 + 5], [cx0 - 9, cy0 + 5]], 0), { role: 'the plaza', cls: 'lo', lod: 2 });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = cx0 - 7.5 + i * 3, y = cy0 - 3 + j * 3; B.mark(at(closed(ell(x, y, .8, .6, 8)), 0), { on: cf, lod: 2 }); if ((i + j) % 2 === 0) tuft(B, R, x, y, 0, 2.6, { n: 4, spread: .25, role: 'the plaza', lod: 2 }); }
    { const kx = -12, ky = 34; for (const [dx, dy] of [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]]) B.box(kx + dx - .25, ky + dy - .25, kx + dx + .25, ky + dy + .25, 0, 3, { r: .08, b: 0, role: 'the plaza', lod: 2 });
      const crib = B.box(kx - 2.4, ky - 2, kx + 2.4, ky + 2, 3, 6.4, { r: .2, b: .2, role: 'the plaza', lod: 2 }); for (let z = 3.6; z < 6.2; z += .6) B.band(z, { on: crib, sides: 'SE', lod: 2 });
      sol(B, [[[[kx - 2.9, ky - 2.5], [kx + 2.9, ky - 2.5], [kx + 2.9, ky + 2.5], [kx - 2.9, ky + 2.5]], 6.4], [[[kx - 2.9, ky], [kx + 2.9, ky]], 8.4]], { role: 'the plaza', lod: 2 }); }
  });

  /* A shield volcano of Hawaii: a broad low dome rising from the sea to its caldera, the fire pit of
     Pele within it steaming, a lava flow running down the flank to the shore, cinder cones on the
     rift, and on the beach the coconut palms and an outrigger canoe */
  def('volcano', (R, B) => {
    const sea = seaPlate(B, R, { avoid: [[-2, -4, 50, 46]], n: 14 });
    const n = 20, a0 = R() * TAU, vx = R.r(-4, 0), vy = R.r(-8, -4), ro = R.r(-.1, .3);
    const beach = sol(B, [[ell(vx, vy, 45, 40, n, ro, a0), 0], [ell(vx, vy, 42.5, 37.8, n, ro, a0), .8]], { role: 'the shore' });
    const LS = [[ell(vx, vy, 42.5, 37.8, n, ro, a0), .8], [wob(R, vx - .5, vy - .5, 33, 29.4, n, .02, ro, a0), 11], [wob(R, vx - 1, vy - 1, 23.5, 21, n, .02, ro, a0), 19.5], [ell(vx - 1.5, vy - 1.5, 16, 14.2, n, ro, a0), 24]];
    const shield = sol(B, LS, { role: 'the volcano', crease: 1.1 });
    shade(B, shield, LS, [vx, vy], { zHi: 22.5, zLo: 1.6, dense: 6, min: .3 });
    // the old flows of the shield, lobe on lobe, their fronts wrapping the flank in view
    strata(B, shield, LS, [vx, vy], [4.5, 8, 13.5, 17], { n: 48, slope: .5, wave: .45, lod: 2 });
    // the black-sand beach: its wet line, and the surf breaking on it in crests that fade away
    B.mark(closed(ell(vx, vy, 41, 36.4, 40, ro, a0)).map(p => [p[0], p[1], .8]), { on: beach, lod: 2 });
    for (let k = 0; k < 18; k++) { const t = a0 + k / 18 * TAU, q = [vx + cos(t) * 47.6, vy + sin(t) * 42.6], rq = rotP(q[0], q[1], ro, vx, vy); if (k % 4 === 3) continue; B.mark(waveAt(rq[0], rq[1], R.r(3.5, 5.5), 2), { on: sea, lod: 2 }); }
    // the caldera: its far wall falling to the floor, and the fire pit in the floor
    const cx = vx - 1.5, cy = vy - 1.5, zr = 24, zf = 20;
    const rim = ell(cx, cy, 14.8, 13.1, 28, ro), flo = ell(cx + .9, cy + .9, 12.6, 11, 28, ro);
    const far = i => (rim[i][0] - cx) + (rim[i][1] - cy) < 0;
    const fl = []; for (let i = 0; i < 28; i++) if (far(i)) fl.push([flo[i][0], flo[i][1], zf]);
    B.mark(fl, { on: shield, lod: 1 });
    for (let i = 0; i < 28; i += 2) if (far(i)) B.mark([[rim[i][0], rim[i][1], zr - .3], [flo[i][0], flo[i][1], zf]], { on: shield, lod: i % 4 ? 2 : 1 });
    const pxx = cx + 3, pyy = cy + 2.4;
    B.mark(at(closed(ell(pxx, pyy, 3.6, 3, 16, ro)), zf), { on: shield, cls: 'mid', lod: 1 });
    // the lava lake within the pit, its crust broken into plates; the ledges of the caldera's far wall
    cracks(B, shield, R, ell(pxx, pyy, 3.3, 2.7, 16, ro), zf, 1.3, { lod: 2 });
    for (const f of [.35, .7]) { const pts = []; for (let i = 0; i < 28; i++) if (far(i)) pts.push([lerp(rim[i][0], flo[i][0], f), lerp(rim[i][1], flo[i][1], f), lerp(zr - .3, zf, f)]); B.mark(pts, { on: shield, lod: 2 }); }
    for (let i = 0; i < 4; i++) { const a = PI * 1.1 + i * .3, p = [pxx + cos(a) * 3.4, pyy + sin(a) * 2.8]; B.mark([[p[0], p[1], zf], [p[0] + .5, p[1] + .5, zf - 1.4]], { on: shield, lod: 2 }); }
    B.line(spline([[pxx, pyy, zf + .5], [pxx + 1, pyy - .4, zf + 5], [pxx - .2, pyy - 1.2, zf + 10], [pxx + 1.4, pyy - 2, zf + 15], [pxx + .6, pyy - 3, zf + 20]], 3), { role: 'the fire pit of Pele', cls: 'lo', lod: 1 });
    // the lava flow, from the rim down the flank in view to the sea
    const th = PI / 4 + R.r(-.45, .45), cen = [], hz = (x, y) => heightIn(LS, x, y);
    for (let k = 0; k <= 14; k++) { const t = k / 14, a = th + sin(t * 5 + a0) * .09, r = lerp(14.5, 47, t); cen.push([vx + cos(a) * r, vy + sin(a) * r * .9]); }
    const lf = [], rt = [];
    cen.forEach((p, k) => { const q = cen[min(cen.length - 1, k + 1)], o = cen[max(0, k - 1)], dx = q[0] - o[0], dy = q[1] - o[1], d = hypot(dx, dy) || 1, w = 1.4 + 4.2 * pow(k / 14, 1.4), wl = w * (1 + .28 * sin(k * 2.3 + a0)), wr = w * (1 + .28 * sin(k * 1.9 + 2 + a0)); lf.push([p[0] - dy / d * wl, p[1] + dx / d * wl]); rt.push([p[0] + dy / d * wr, p[1] - dx / d * wr]); });
    const lift = p => [p[0], p[1], max(.05, hz(p[0], p[1]) + .25)];
    const fine = P => spline(P, 3).map(lift);
    surf(B, shield, fine(lf), [vx, vy], { radial: true, slope: .5, cls: 'edge', lod: 1 });
    surf(B, shield, fine(rt), [vx, vy], { radial: true, slope: .5, cls: 'edge', lod: 1 });
    // the ropes of the pahoehoe, bowed downhill across the flow
    for (let k = 2; k < 14; k++) { const a = lift(lerp2(lf[k], cen[k], .15)), b = lift(lerp2(rt[k], cen[k], .15)), m = lift(cen[min(14, k + 1)]); B.mark([a, [lerp(a[0], m[0], .5), lerp(a[1], m[1], .5), lerp(a[2], m[2], .5) + .1], m, [lerp(b[0], m[0], .5), lerp(b[1], m[1], .5), lerp(b[2], m[2], .5) + .1], b], { on: shield, lod: k % 2 ? 1 : 2 }); }
    // the toe of the flow in the sea, and its steam
    B.mark(spline([lf[14], lerp2(lf[14], cen[14], .2).map((v, i) => v + (i ? 2.6 : 2.6)), lerp2(rt[14], cen[14], .2).map(v => v + 2.6), rt[14]], 3).map(p => [p[0], p[1], .05]), { on: sea, cls: 'mid', lod: 1 });
    // cinder cones on the rift, on the flank in view
    for (const [f, a] of [[.52, th + .7], [.7, th + .95]]) { const r = lerp(14, 40, f), x = vx + cos(a) * r, y = vy + sin(a) * r * .9, z = hz(x, y); const cc = B.lathe(x, y, [[4.4, z - .4], [1.7, z + 3.6]], { n: 14, role: 'the cinder cones', lod: 1 }); B.mark(at(closed(ell(x + .2, y + .2, 1.2, 1, 12)), z + 3.4), { on: cc, lod: 1 }); staves(B, cc, x, y, 4.4, z - .4, z + 3.4, 16, { top: .42, lod: 2 }); }
    // the steam rising from the cracks along the rim, and the ohia trees on the lower slope
    for (let k = 0; k < 3; k++) { const i = (k * 9 + 3) % 28, q = rim[i]; B.line(spline([[q[0], q[1], zr], [q[0] + .6, q[1] - .3, zr + 2.5], [q[0] - .2, q[1] - .8, zr + 5], [q[0] + .7, q[1] - 1.4, zr + 7.5]], 3), { role: 'the fire pit of Pele', cls: 'lo', lod: 2 }); }
    for (let k = 0; k < 4; k++) { const a = th - .72 - k * .3, r = lerp(33, 39, k % 2), x = vx + cos(a) * r, y = vy + sin(a) * r * .9; leafy(B, R, x, y, R.r(7, 9), { z: hz(x, y) - .2, r: 2.6, role: 'the volcano', lod: 2, leaves: 6 }); }
    // the beach: coconut palms leaning to the sea, an outrigger canoe drawn up
    for (const [a, hh] of [[PI * .62, 22], [PI * .72, 18], [PI * .02, 20]]) { const x = vx + cos(a + ro) * 44, y = vy + sin(a + ro) * 39.5; palm(B, R, x, y, hh, { z: .8, role: 'the coconut palms', lod: 0, lean: .3, dir: a + ro, droop: 1.3 }); }
    const ca = PI * .45 + ro, cxx = vx + cos(ca) * 46, cyy = vy + sin(ca) * 41.5, cd = ca + PI / 2;
    const hullC = ISO.lens(13, 2, 0, 0, 8).map(q => rotP(q.u, q.v, cd)).map(p => [p[0] + cxx, p[1] + cyy]);
    const can = sol(B, [[hullC, .8], [hullC, 2]], { role: 'the canoe', lod: 1 });
    const ox = cxx + cos(ca) * 4, oy = cyy + sin(ca) * 4.2;
    B.mark(ISO.lens(9, 1, 0, 0, 6).map(q => rotP(q.u, q.v, cd)).map(p => [p[0] + ox, p[1] + oy, 1.2]).concat([[0, 0, 0]].slice(1)), { on: can, closed: true, lod: 2 });
    for (const s of [-2.4, 2.4]) B.mark([[cxx + cos(cd) * s, cyy + sin(cd) * s, 2], [ox + cos(cd) * s, oy + sin(cd) * s, 1.4]], { on: can, cls: 'edge', lod: 2 });
    // the paddles laid across her gunwales, the lashings of the booms
    for (const s of [-1, 1]) B.mark([[cxx + cos(cd) * s * 3 - cos(ca) * 1.6, cyy + sin(cd) * s * 3 - sin(ca) * 1.6, 2.1], [cxx + cos(cd) * s * 3 + cos(ca) * 2.2, cyy + sin(cd) * s * 3 + sin(ca) * 2.2, 2.1]], { on: can, cls: 'mid', lod: 2 });
    B.mark(ISO.lens(12, 1.4, 0, 0, 8).map(q => rotP(q.u, q.v, cd)).map(p => [p[0] + cxx, p[1] + cyy, 2]), { on: can, closed: true, lod: 2 });
  });

  /* A room, the base of every indoor scene, cut away toward the eye: the north and west walls with
     their arched windows and niches, a carpet on the floor, a divan of cushions along the wall, a
     brass tray on its low stand, a lamp and a chest; the front of the floor left clear for figures */
  def('room', (R, B) => {
    const e = 44, t = 3, H = R.r(30, 34), w0 = -e + t;
    const floor = B.plate([[-e, -e, 0], [e, -e, 0], [e, e, 0], [-e, e, 0]], { role: 'the floor', cls: 'lo' });
    for (let k = 1; k < 11; k++) { const v = -e + k * 8; B.mark([[v, -e, 0], [v, e, 0]], { on: floor, lod: 2 }); B.mark([[-e, v, 0], [e, v, 0]], { on: floor, lod: 2 }); }
    // the carpet: its border, its field, the medallion
    const cx = -4, cy = -2, cw = 22, cd = 15;
    const rug = B.plate([[cx - cw, cy - cd, .3], [cx + cw, cy - cd, .3], [cx + cw, cy + cd, .3], [cx - cw, cy + cd, .3]], { role: 'the carpet' });
    for (const g of [1.4, 4.2]) B.mark(at(closed([[cx - cw + g, cy - cd + g], [cx + cw - g, cy - cd + g], [cx + cw - g, cy + cd - g], [cx - cw + g, cy + cd - g]]), .3), { on: rug, lod: 1 });
    B.mark(at(closed([[cx - 10, cy], [cx, cy - 6.5], [cx + 10, cy], [cx, cy + 6.5]]), .3), { on: rug, lod: 1 });
    B.mark(at(closed([[cx - 5, cy], [cx, cy - 3.2], [cx + 5, cy], [cx, cy + 3.2]]), .3), { on: rug, lod: 2 });
    // the field's lattice of lozenges out to the inner border, and the running motif in the border between its two lines
    const inner = [[cx - cw + 4.2, cy - cd + 4.2], [cx + cw - 4.2, cy - cd + 4.2], [cx + cw - 4.2, cy + cd - 4.2], [cx - cw + 4.2, cy + cd - 4.2]];
    const inMed = p => abs(p[0] - cx) / 10 + abs(p[1] - cy) / 6.5 < 1;
    for (const ang of [Math.atan2(6.5, 10), -Math.atan2(6.5, 10)]) hatch(inner, ang, 4.4, .5).forEach(l => {
      // each lozenge line runs from the border to the medallion's edge, and on from its far edge back to the border
      let run = [];
      for (let i = 0; i <= 48; i++) { const p = lerp2(l[0], l[1], i / 48); if (inMed(p)) { if (run.length > 1) B.mark(at(run, .3), { on: rug, lod: 2 }); run = []; } else run.push(p); }
      if (run.length > 1) B.mark(at(run, .3), { on: rug, lod: 2 });
    });
    for (let k = 0; k < 14; k++) for (const yb of [cy - cd + 2.8, cy + cd - 2.8]) { const x = lerp(cx - cw + 4, cx + cw - 4, (k + .5) / 14); B.mark(at(closed([[x - .9, yb], [x, yb - .9], [x + .9, yb], [x, yb + .9]]), .3), { on: rug, lod: 2 }); }
    for (let k = 0; k <= 12; k++) for (const sx of [-1, 1]) { const y = lerp(cy - cd + 1, cy + cd - 1, k / 12), x = cx + sx * cw; B.mark([[x, y, .3], [x + sx * 1.4, y, .3]], { on: rug, lod: 2 }); }
    // the walls, cut away
    const wn = B.box(-e, -e, e, w0, 0, H, { r: .3, b: .7, role: 'the walls' });
    const ww = B.box(-e, w0, w0, e, 0, H, { r: .3, b: .7, role: 'the walls' });
    for (const [side, on] of [['S', wn], ['E', ww]]) {
      B.band(7, { on, sides: side }); B.band(H - 3, { on, sides: side });
      // the tiled dado below the band, joint by joint from the floor; the little arches of the cornice above
      B.band(3.5, { on, sides: side, lod: 2 });
      const L2 = side === 'S' ? 2 * e : e - w0, F = side === 'S' ? (u, z) => [lerp(-e, e, u), w0, z] : (u, z) => [w0, lerp(w0, e, u), z], nn = side === 'S' ? [0, 1, 0] : [1, 0, 0];
      for (let x = 2.75; x < L2 - 1; x += 2.75) B.mark([F(x / L2, 0), F(x / L2, 7)], { on, n: nn, lod: 2 });
      for (let x = 0; x < L2 - 2; x += 2.4) { const pts = []; for (let i = 0; i <= 6; i++) { const a = PI - i / 6 * PI; pts.push(F((x + 1.2 + cos(a) * 1.2) / L2, H - 3 + 1.1 + sin(a) * 1.2)); } pts.unshift(F(x / L2, H - 3)); pts.push(F((x + 2.4) / L2, H - 3)); B.mark(pts, { on, n: nn, lod: 2 }); }
    }
    const lattice = (F, u, z, w, h) => { for (let i = 1; i < 4; i++) { const uu = u - w / 2 / F.len + i * w / 4 / F.len; B.mark([F.at(uu, z + .4), F.at(uu, z + h - w * .45)], { on: F.on, n: F.n, lod: 2 }); } for (let i = 1; i < 4; i++) { const zz = z + i * (h - w * .3) / 4; B.mark([F.at(u - w / 2 / F.len, zz), F.at(u + w / 2 / F.len, zz)], { on: F.on, n: F.n, lod: 2 }); } };
    const FS = { at: (u, z) => [lerp(-e, e, u), w0, z], len: 2 * e, n: [0, 1, 0], on: wn }, FE = { at: (u, z) => [w0, lerp(w0, e, u), z], len: e - w0, n: [1, 0, 0], on: ww };
    for (const u of [.42, .7]) { B.window('S', u, 11, 8, 13, { on: wn, shape: 'pointed', lod: 1 }); lattice(FS, u, 11, 8, 13); }
    B.window('S', .16, 9, 6, 10, { on: wn, shape: 'pointed', lod: 1 }); B.mark([FS.at(.16 - .034, 13), FS.at(.16 + .034, 13)], { on: wn, n: [0, 1, 0], lod: 2 });
    B.door('E', .78, 10, 18, { on: ww, shape: 'pointed' });
    // the curtain drawn half across the doorway on its rod, falling in folds
    { const yd = lerp(w0, e, .78), zr = 13.6; B.mark([[w0, yd - 5.4, zr], [w0, yd + 5.4, zr]], { on: ww, n: [1, 0, 0], cls: 'mid', lod: 2 }); for (let k = 0; k < 4; k++) { const y = yd - 4.6 + k * 1.3; B.mark([[w0, y, zr], [w0, y + .3, zr * .5], [w0, y - .1, 0]], { on: ww, n: [1, 0, 0], lod: 2 }); } }
    // a niche in the north wall, its little arch, a vase standing in it
    { const un = .88, F = (u, z) => [lerp(-e, e, u), w0, z]; B.window('S', un, 12, 4.4, 7, { on: wn, shape: 'pointed', lod: 2 }); const vx2 = lerp(-e, e, un); B.mark([[vx2 - .6, w0, 12], [vx2 - 1.1, w0, 13.4], [vx2 - .4, w0, 15], [vx2 - .5, w0, 15.6], [vx2 + .5, w0, 15.6], [vx2 + .4, w0, 15], [vx2 + 1.1, w0, 13.4], [vx2 + .6, w0, 12]], { on: wn, n: [0, 1, 0], closed: true, lod: 2 }); }
    B.window('E', .34, 10, 6, 10, { on: ww, shape: 'pointed', lod: 1 }); B.mark([FE.at(.34 - .07, 14), FE.at(.34 + .07, 14)], { on: ww, n: [1, 0, 0], lod: 2 });
    // the divan along the north wall, its cushions against the wall, and its return along the west
    const dv = B.box(w0 + .5, w0, 26, w0 + 10, 0, 4.2, { r: .9, b: .6, role: 'the divan' });
    for (let k = 0; k < 9; k++) { const x = lerp(w0 + 1, 26, (k + .5) / 9); B.mark([[x - 2.2, w0 + 10, 3.4], [x, w0 + 10, 2.6], [x + 2.2, w0 + 10, 3.4]], { on: dv, n: [0, 1, 0], lod: 2 }); }
    const nc = R.i(3, 4);
    for (let k = 0; k < nc; k++) { const x = lerp(w0 + 3, 22, (k + .5) / nc); B.box(x - 4.6, w0 + .3, x + 4.6, w0 + 3.2, 4.2, 10.4, { r: 1.2, b: .5, top: .3, role: 'the cushions', lod: 1 }); }
    B.box(w0, w0 + 10, w0 + 10, -6, 0, 4.2, { r: .9, b: .6, role: 'the divan', lod: 1 });
    // the brass tray on its folding stand
    const tx = -16 + R.r(-2, 2), ty = -14 + R.r(-2, 2);
    const st = B.cyl(tx, ty, 3.6, 0, 5.4, { n: 8, b: 0, rot: PI / 8, role: 'the tray' });
    for (const a of [PI / 4, 0, PI / 2]) { const c = [tx + cos(a) * 3.3, ty + sin(a) * 3.3]; B.mark([[c[0] - sin(a) * 1, c[1] + cos(a) * 1, 0], [c[0], c[1], 3.4], [c[0] + sin(a) * 1, c[1] - cos(a) * 1, 0]], { on: st, n: [cos(a), sin(a), 0], lod: 2 }); }
    const tray = B.cyl(tx, ty, 7.4, 5.4, 6.1, { n: 28, b: .7, role: 'the tray' });
    // the chased rings and the star engraved in the brass
    for (const rr of [4.6, 2.4]) B.mark(at(closed(ell(tx, ty, rr, rr, 24)), 6.1), { on: tray, lod: 2 });
    { const st8 = []; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, rr = k % 2 ? 1.1 : 2.3; st8.push([tx + cos(a) * rr, ty + sin(a) * rr]); } B.mark(at(closed(st8), 6.1), { on: tray, lod: 2 }); }
    B.lathe(tx + 2, ty - 1, [[.8, 6.1], [1.3, 7.2], [.6, 8.6], [.9, 9.4]], { n: 10, role: 'the tray', lod: 2 });
    for (const [dx, dy] of [[-3, 2], [-1, 3.6]]) B.lathe(tx + dx, ty + dy, [[.6, 6.1], [.9, 7.3]], { n: 10, role: 'the tray', lod: 2 });
    // the lamp: hung from its bracket, or standing on its foot
    if (R.chance(.5)) {
      const lx = w0 + 7, ly = 6, lz = 17;
      B.line([[w0, ly, lz + 9], [lx, ly, lz + 9], [lx, ly, lz + 8.2]], { role: 'the lamp', lod: 1, w: 1.3 });
      for (const a of [0, 2.1, 4.2]) B.line([[lx, ly, lz + 8.2], [lx + cos(a) * 2, ly + sin(a) * 2, lz + 4.4]], { role: 'the lamp', cls: 'lo', lod: 2 });
      B.lathe(lx, ly, [[.6, lz], [2.2, lz + 1.6], [1.8, lz + 3.4], [2.3, lz + 4.4]], { n: 14, role: 'the lamp' });
      B.cut([FLAME], lx, ly, lz + 2, 1.6, { w: 1.4, role: 'the lamp', lod: 2 });
    } else {
      const lx = w0 + 6, ly = 2;
      B.cyl(lx, ly, 2.4, 0, .9, { n: 14, b: .4, role: 'the lamp' });
      B.cyl(lx, ly, .45, .9, 15, { n: 8, b: 0, role: 'the lamp' });
      B.lathe(lx, ly, [[.6, 15], [1.8, 15.8], [1.6, 16.6]], { n: 12, role: 'the lamp' });
      B.cut([FLAME], lx, ly, 16.6, 2.4, { w: 1.8, role: 'the lamp', lod: 1 });
    }
    // the chest against the west wall
    const ch = B.box(w0 + .5, 10, w0 + 7.5, 22, 0, 6.2, { r: .5, b: .5, role: 'the chest' });
    B.panel('E', .42, .58, 3.6, 5.4, { on: ch, lod: 1 }); for (const u of [.15, .85]) B.mark([[w0 + 7.5, lerp(10, 22, u), 0], [w0 + 7.5, lerp(10, 22, u), 6.2]], { on: ch, n: [1, 0, 0], lod: 2 });
    for (const z of [1, 5.2]) B.mark([[w0 + 7.5, 10, z], [w0 + 7.5, 22, z]], { on: ch, n: [1, 0, 0], lod: 2 });
    for (const u of [.15, .85]) for (const z of [1.6, 3.1, 4.6]) B.mark(at(closed(ell(w0 + 7.5, lerp(10, 22, u), .18, .18, 6)), z).map(p => [w0 + 7.52, p[1], z + (p[0] - w0 - 7.5)]), { on: ch, n: [1, 0, 0], closed: true, lod: 2 });
    // by the divan's end the ewer and its basin; the brazier of coals; the folding stand with its open book
    { const ex = -24, ey = 17, bs = B.lathe(ex, ey, [[1.4, 0], [2.6, .9], [2.9, 1.4]], { n: 16, role: 'the divan', lod: 2 }); hoop(B, bs, ex, ey, 2.2, 1.4, { n: 16, lod: 2 }); const ew = B.lathe(ex + 4.2, ey + .6, [[.8, 0], [1.3, 1.4], [.5, 3.2], [.4, 4.2], [.7, 4.6]], { n: 12, role: 'the divan', lod: 2 }); B.mark([[ex + 4.2 + .9, ey + .6 + .9, 2.4], [ex + 4.2 + 2.2, ey + .6 + 1.6, 4]], { on: ew, cls: 'edge', lod: 2 }); }
    { const bx = -27, by = -4, br = B.lathe(bx, by, [[1.2, 0], [1.4, 2], [2.4, 2.6], [2.6, 3.4]], { n: 14, role: 'the lamp', lod: 2 }); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; B.mark(at(closed(ell(bx + cos(a) * 1.2, by + sin(a) * 1.2, .5, .4, 6)), 3.4), { on: br, lod: 2 }); } }
    { const kx = 8, ky = -28, kp = B.box(kx - 1.3, ky - .9, kx + 1.3, ky + .9, 0, 3.6, { r: .2, b: 0, top: .2, role: 'the divan', lod: 2 }); B.panel('S', .2, .8, .6, 3, { on: kp, lod: 2 }); const bk2 = B.plate([[kx - 2.4, ky - .9, 3.6], [kx, ky - .3, 3.5], [kx + 2.4, ky - .9, 3.6], [kx + 2.4, ky + .7, 4.5], [kx, ky + 1, 4.1], [kx - 2.4, ky + .7, 4.5]], { role: 'the divan', lod: 2 }); B.mark([[kx, ky - .3, 3.5], [kx, ky + 1, 4.1]], { on: bk2, lod: 2 }); for (const f of [.3, .55, .8]) for (const sd of [-1, 1]) B.mark([[kx + sd * .3, ky - .9 + 1.6 * f, 3.6 + .9 * f], [kx + sd * 2.1, ky - .9 + 1.6 * f, 3.6 + .9 * f]], { on: bk2, lod: 2 }); }
    const lidR = [[w0 + .5, 10], [w0 + 7.5, 10], [w0 + 7.5, 22], [w0 + .5, 22]];
    sol(B, [[lidR, 6.2], [[[w0 + 1.5, 10.2], [w0 + 6.5, 10.2], [w0 + 6.5, 21.8], [w0 + 1.5, 21.8]], 7.6], [[[w0 + 4, 10.4], [w0 + 4, 21.6]], 8.2]], { role: 'the chest', lod: 1 });
  }, { tier: 'scene' });

  /* A ship as its own stage, for a tale's days at sea: a large dhow under its lateen sails with the
     deck house on its raised stern, its rigging, the sailors, and the small boat towed behind */
  def('ship', (R, B) => {
    const hd = (R.chance(.5) ? -PI / 4 : PI * .75) + R.r(-.1, .1), L = 64;
    const avoid = []; for (let k = -1; k <= 1; k++) avoid.push([cos(hd) * k * L * .45, 6 + sin(hd) * k * L * .45, 13, 13]);
    avoid.push([-cos(hd) * L * .8, 6 - sin(hd) * L * .8, 9, 9]);
    const sea = seaPlate(B, R, { avoid, n: 30 });
    dhow(B, R, 0, 6, L, hd, { sail: 'set', masts: R.chance(.6) ? 2 : 1, boat: true, sea, wake: true, house: true, crew: true, shrouds: true, cargo: true, role: 'the ship' });
  });
})();
