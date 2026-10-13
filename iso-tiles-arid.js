/*
 * Terrain tiles of the Story Map, the dry country: the sand and the sand sea, rock, steppe, hills and
 * peaks, the salt pans of the depressions; the watered land at the edge of the towns (palm groves,
 * gardens under the shaduf, strip fields, walled orchards, the reed marshes); the places on the roads
 * (a black tent, a well, a khan, the tombs outside the walls); and the water, open and shallow.
 *
 * A tile is a flat-top hexagon of radius 25 on the origin (x east, y south, z up; corner k at
 * (25 cos 60k, -25 sin 60k), edge i between corners i and i+1, looking out along
 * (cos(60i+30), -sin(60i+30))). The map draws the hexagon of ground itself; a tile draws what lies on it
 * and stands on it, inside a radius of about 23. A.water and A.road are six bits, one an edge, set where
 * the neighbour across that edge is water or a road.
 *
 * The habits are those of iso-kinds-land.js, and its small helpers are copied here. The ground of a tile
 * is a part that draws nothing (an empty cut-out laid at z -0.2 across the hex): it carries the marks on
 * the ground, and the paint order puts it under all that stands on the tile, so a ripple running under a
 * rock is hidden by the rock. Textures that make a field run in fixed directions of the world (ripples and
 * wave crests across the wind from the north-west, dune horns downwind, furrows east and west on the
 * spacing of the hex lattice, the garden's bunds and the orchard's rows on the lattice too), so
 * neighbours of one kind read as one field. Every count, place and size is drawn from R alone.
 *
 * The budget follows the map's scale (a hex 18 to 55 px wide): lod 0 is one or two clean masses, lod 1
 * the secondary forms, lod 2 the fine marks; at most 8 parts in lod 0 and 1, and 18 in all.
 */
(() => {
  'use strict';
  const boot = () => { if (window.ISO && window.ISO.def) tiles(window.ISO); else setTimeout(boot, 20); };
  boot();

  function tiles(ISO) {
    const { def, fromPts, inset, hull, inConvex, inPoly } = ISO;
    const TAU = Math.PI * 2, PI = Math.PI, { cos, sin, abs, hypot, max, min, pow, sqrt, round, atan2, floor, ceil } = Math;
    const S2 = Math.SQRT1_2;
    /* On the ground, EH runs across the eye's view (to the right), EU away from the eye, and WD downwind:
       the wind blows from the north-west, toward the eye. */
    const EH = [S2, -S2], EU = [-S2, -S2], WD = [S2, S2];
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const rotP = (x, y, a, cx = 0, cy = 0) => { const c = cos(a), s = sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
    const ell = (cx, cy, rx, ry, n = 16, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; o.push(rotP(cx + rx * cos(a), cy + ry * sin(a), rot, cx, cy)); } return o; };
    const wob = (R, cx, cy, rx, ry, n = 10, jit = .1, rot = 0, a0 = 0) => { const o = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU, f = 1 + R.r(-jit, jit); o.push(rotP(cx + rx * f * cos(a), cy + ry * f * sin(a), rot, cx, cy)); } return o; };
    const lerpPoly = (A, Bq, t) => A.map((p, i) => [lerp(p[0], Bq[i][0], t), lerp(p[1], Bq[i][1], t)]);
    const at = (P, z) => P.map(p => [p[0], p[1], z]);
    const closed = P => P.concat([P[0]]);
    const scl = (P, f, c) => P.map(p => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
    const ctrOf = P => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
    /* a point given across the wind (a) and downwind (b) */
    const along = (a, b) => [EH[0] * a + WD[0] * b, EH[1] * a + WD[1] * b];

    /* ---------- the hexagon ---------- */
    const HR = 25, K3 = sqrt(3) / 2, AP = HR * K3;
    const NRM = [0, 1, 2, 3, 4, 5].map(i => { const a = (60 * i + 30) * PI / 180; return [cos(a), -sin(a)]; });
    /* the radius of the smallest tile-shaped hexagon through (x, y): a footprint stays under 23 */
    const hr = (x, y) => { let m = -1e9; for (const n of NRM) m = max(m, x * n[0] + y * n[1]); return m / K3; };
    /* how far from (x, y) along the unit (dx, dy) to the hexagon of radius r */
    const reach = (x, y, dx, dy, r) => { let t = 1e9; for (const n of NRM) { const d = dx * n[0] + dy * n[1]; if (d > 1e-9) t = min(t, (r * K3 - x * n[0] - y * n[1]) / d); } return t; };
    /* the road edge a place turns to: of the road edges, the one most in view; -1 for none */
    const FRONT = [5, 4, 0, 3, 1, 2];
    const roadEdge = A => { const m = (A && A.road) | 0; for (const i of FRONT) if ((m >> i) & 1) return i; return -1; };
    /* the largest hex radius of a set of points */
    const hrMax = P => { let m = 0; for (const p of P) m = max(m, hr(p[0], p[1])); return m; };
    /* an outline pulled in about the origin until it lies inside the hexagon of radius r */
    const fitPoly = (P, r) => { const m = hrMax(P); return m > r ? scl(P, r / m, [0, 0]) : P; };
    /* a centre pulled in until a thing of radius rad about it lies inside the hexagon of radius r */
    const fitIn = (x, y, rad, r = 22.5) => { for (let k = 0; k < 40 && hr(x, y) + rad / K3 > r; k++) { x *= .9; y *= .9; } return [x, y]; };
    /* a free place for a thing of radius rad inside the hexagon of radius rmax, clear of the discs in occ
       (which it then joins); null when there is none */
    function spot(R, occ, rad, rmax = 20, tries = 30) {
      for (let t = 0; t < tries; t++) {
        const x = R.r(-rmax, rmax), y = R.r(-rmax, rmax);
        if (hr(x, y) + rad / K3 > rmax) continue;
        if (occ.some(o => hypot(x - o[0], y - o[1]) < o[2] + rad)) continue;
        occ.push([x, y, rad]); return [x, y];
      }
      return null;
    }
    /* the ground: the map draws the hexagon, so this part draws nothing. Laid at z -0.2 across the whole hex,
       it carries the marks on the ground and is painted before everything that stands on the tile. */
    const ground = (B, role) => B.add({ cut: [], at: [0, 0, -.2], h: .02, w: 24.5 / .18, role: role || 'the ground', lod: 0 });

    /* ---------- lines and outlines (after iso-kinds-land.js) ---------- */
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
    /* a closed outline drawn smooth through its points */
    const smooth = (P, per = 3) => spline([P[P.length - 1], ...P, P[0], P[1]], per).slice(per, per * (P.length + 1));
    /* a band of width w0 to w1 along a centre line: a channel, a track */
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
    /* parallel strokes across an outline, sp apart, running at angle ang */
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

    /* ---------- solids from layers (after iso-kinds-land.js) ---------- */
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
    const clamp01 = v => max(0, min(1, v));
    function ringAt(layers, ctr, z, n = 24, a0 = 0) {
      let i = 0; while (i < layers.length - 2 && z > layers[i + 1][1]) i++;
      const [A, za] = layers[i], [Bq, zb] = layers[i + 1], t = clamp01((z - za) / (zb - za || 1)), out = [];
      const hitOf = (P, a) => { if (P.length > 2) return rayHit(P, ctr[0], ctr[1], a); let mx = 0, my = 0; for (const p of P) { mx += p[0]; my += p[1]; } return [mx / P.length, my / P.length]; };
      for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; out.push(lerp2(hitOf(A, a), hitOf(Bq, a), t)); }
      return out;
    }
    /* contour lines round a layered solid, each wrapping the face in view and ending on the silhouette */
    function strata(B, part, layers, ctr, zs, o = {}) {
      zs.forEach((z, i) => {
        const ring = ringAt(layers, ctr, z, o.n || 30, o.a0 || 0), w = o.wave || 0;
        const pts = closed(ring).map((p, k) => [p[0], p[1], z + (w ? sin(k * 1.9 + i * 2.3) * w : 0)]);
        surf(B, part, pts, ctr, { slope: o.slope == null ? .3 : o.slope, cls: typeof o.cls === 'function' ? o.cls(i) : (o.cls || 'lo'), lod: typeof o.lod === 'function' ? o.lod(i) : (o.lod == null ? 2 : o.lod) });
      });
    }
    /* a fall line down a layered solid at angle a from its centre, from height z1 to z0 */
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
        const k = right > .6 ? (o.dense || 7) : 4;
        for (let j = 1; j < k; j++) {
          const t = j / k, zt2 = o.flat ? zHi : lerp(zHi, zMid, abs(t - .5) * 1.4), S1 = sectionAt(layers, zt2);
          const a = lerp2(S1[i], S1[(i + 1) % n], t), b = lerp2(S0[i], S0[(i + 1) % n], t);
          surf(B, part, [[a[0], a[1], zt2], [b[0], b[1], zLo]], ctr, { radial: true, slope: o.slope || .5, lod: o.lod != null ? o.lod : (j % 2 ? 1 : 2) });
        }
      }
    }

    /* ---------- the small parts of open country (after iso-kinds-land.js) ---------- */
    /* ripples across the wind: rows along EH stacked downwind, the middle rows longest and the outer rows
       shortening to nothing, every row kept inside the hexagon of radius o.r */
    function ripples(B, host, R, cx, cy, rows, len, gap, z, o = {}) {
      const mid = (rows - 1) / 2, amp = o.amp == null ? gap * .2 : o.amp, lam = o.lam || gap * 3.2, r = o.r || 21.5, u = o.dir || EH, v = [-u[1], u[0]];
      for (let k = 0; k < rows; k++) {
        const f = rows > 1 ? abs(k - mid) / (mid + .6) : 0, off = (k - mid) * gap, px = cx + v[0] * off, py = cy + v[1] * off;
        if (hr(px, py) > r - 1) continue;
        const L = min(len * pow(max(0, 1 - f * f), .6) * R.r(.82, 1.08), 2 * min(reach(px, py, u[0], u[1], r), reach(px, py, -u[0], -u[1], r)) - 1);
        if (L < gap * 1.2) continue;
        const ph = R() * TAU, n = max(4, round(L / (lam / 4))), pts = [];
        for (let i = 0; i <= n; i++) {
          const s = -L / 2 + L * i / n, w = amp * sin(s / lam * TAU + ph) * (.4 + .6 * sin(PI * i / n)), x = px + u[0] * s + v[0] * w, y = py + u[1] * s + v[1] * w;
          pts.push([x, y, typeof z === 'function' ? z(x, y) : z]);
        }
        B.mark(pts, { on: host, cls: o.cls || 'lo', lod: o.lod1 && k === round(mid) ? 1 : (o.lod == null ? 2 : o.lod) });
      }
    }
    /* small stones as closed marks, thinning and shrinking toward the rim of their patch */
    function pebbles(B, host, R, cx, cy, rx, ry, n, z, o = {}) {
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, d = pow(R(), .65), x = cx + cos(a) * rx * d, y = cy + sin(a) * ry * d, sz = R.r(.24, .55) * (1 - d * .55) * (o.s || 1), m = R.i(4, 6), pts = [];
        if (hr(x, y) > 22.5) continue;
        for (let i = 0; i < m; i++) { const b = i / m * TAU + R() * .5; pts.push([x + cos(b) * sz, y + sin(b) * sz * .8, z]); }
        B.mark(pts, { on: host, closed: true, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
      }
    }
    /* a tuft of desert grass, blades out from one root and back, as a mark on the ground */
    function tuft(B, host, R, x, y, z, h, o = {}) {
      const n = o.n || 6, pts = [[x, y, z]], a0 = R() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * TAU + R.r(-.3, .3), l = h * R.r(.62, 1), sp = l * (o.spread || .42) * R.r(.6, 1);
        const m = [x + cos(a) * sp * .35, y + sin(a) * sp * .35, z + l * .62], t = [x + cos(a) * sp, y + sin(a) * sp, z + l * R.r(.82, 1)];
        pts.push(m, t, m, [x, y, z]);
      }
      if (o.line) return B.line(pts, { role: o.role || 'the grass', cls: o.cls || 'mid', lod: o.lod == null ? 2 : o.lod });
      B.mark(pts, { on: host, cls: o.cls || 'mid', lod: o.lod == null ? 2 : o.lod });
    }
    function rope(B, host, a, b, sag, o = {}) {
      const pts = [], k = o.k || 6;
      for (let i = 0; i <= k; i++) { const t = i / k; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]); }
      B.mark(pts, { on: host, cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
    }
    /* a closed ring of points round a round body, drawn on its near side in short runs */
    function ringMark(B, part, pts, ctr, o = {}) {
      const step = o.step || 2, nz = o.nz || 0;
      for (let k = 0; k + 1 < pts.length; k += step) {
        const run = pts.slice(k, min(pts.length, k + step + 1)), m = run[run.length >> 1], dx = m[0] - ctr[0], dy = m[1] - ctr[1], L = hypot(dx, dy) || 1, ch = sqrt(max(0, 1 - nz * nz));
        B.mark(run, { on: part, n: [dx / L * ch, dy / L * ch, nz], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod });
      }
    }
    function hoop(B, part, cx, cy, r, z, o = {}) {
      const pts = [], n = o.n || 16; for (let k = 0; k <= n; k++) { const a = k / n * TAU; pts.push([cx + cos(a) * r, cy + sin(a) * r, z + (o.zig ? (k % 2 ? o.zig : -o.zig) : 0)]); }
      ringMark(B, part, pts, [cx, cy], { cls: o.cls, lod: o.lod, nz: o.nz });
    }
    function staves(B, part, cx, cy, r, z0, z1, n, o = {}) {
      for (let k = 0; k < n; k++) { const a = (k + (o.off || 0)) / n * TAU, ca = cos(a), sa = sin(a); B.mark([[cx + ca * r, cy + sa * r, z0], [cx + ca * r, cy + sa * r, z1]], { on: part, n: [ca, sa, 0], cls: o.cls || 'lo', lod: o.lod == null ? 2 : o.lod }); }
    }
    /* a wave on open water: humps across the eye's view, s long */
    function waveAt(x, y, s, k = 2, z = 0) {
      const pts = [], n = 5 * k;
      for (let i = 0; i <= n; i++) { const t = i / n, a = (t - .5) * s, up = abs(sin(t * k * PI)) * (s / k) * .5; pts.push([x + EH[0] * a + EU[0] * up, y + EH[1] * a + EU[1] * up, z]); }
      return pts;
    }
    /* short level strokes across the eye's view, the shine on still water, inside an outline */
    function shine(B, host, R, poly, n, z, o = {}) {
      const c = ctrOf(poly);
      for (let i = 0, t = 0; i < n && t < n * 5; t++) {
        const a = R() * TAU, e = rayHit(poly, c[0], c[1], a), d = sqrt(R()) * .8, x = lerp(c[0], e[0], d), y = lerp(c[1], e[1], d), l = R.r(1.2, 2.8) * (o.len || 1);
        const p0 = [x - EH[0] * l / 2, y - EH[1] * l / 2], p1 = [x + EH[0] * l / 2, y + EH[1] * l / 2];
        if (!inPoly(poly, p0[0], p0[1]) || !inPoly(poly, p1[0], p1[1])) continue;
        B.mark([[p0[0], p0[1], z], [p1[0], p1[1], z]], { on: host, cls: o.cls || 'lo', lod: i % 3 === 0 ? (o.lod1 === false ? 2 : 1) : 2 });
        i++;
      }
    }

    /* ---------- the puppets: cut-outs that always face the eye (after iso-kinds-land.js) ---------- */
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
      eye: CU([[115, 92], [117, 92]]),
    };
    const CAMEL_DOWN = {
      body: CU([[4, 0], [2, 18], [6, 34], [16, 46], [30, 60], [44, 66], [58, 60], [70, 50], [78, 54], [86, 66], [92, 80], [96, 90], [100, 96], [108, 98], [118, 92], [120, 86], [110, 84], [102, 82], [96, 72], [90, 56], [86, 44], [84, 30], [90, 16], [94, 8], [92, 0]], 120),
      lines: [CU([[20, 16], [34, 6], [50, 3]], 120), CU([[84, 22], [70, 12], [62, 3]], 120), CU([[109, 93], [111, 93]], 120)],
      saddle: CU([[28, 57], [31, 71], [36, 68], [52, 68], [57, 72], [61, 57], [52, 61], [38, 61]], 120),
      saddleLines: [CU([[24, 52], [44, 58], [66, 50]], 120), CU([[33, 69], [36, 64], [52, 64], [56, 69]], 120)],
    };
    const GOAT = {
      legs: [CU([[20, 46], [25, 46], [24, 2], [26, 0], [21, 0], [21, 2]], 100), CU([[27, 46], [32, 46], [31, 2], [33, 0], [28, 0], [28, 2]], 100), CU([[60, 46], [65, 46], [64, 2], [66, 0], [61, 0], [61, 2]], 100), CU([[67, 46], [72, 46], [71, 2], [73, 0], [68, 0], [68, 2]], 100)],
      body: CU([[16, 60], [9, 72], [12, 73], [19, 66], [58, 66], [68, 70], [74, 80], [72, 92], [66, 102], [76, 95], [81, 86], [89, 86], [99, 78], [97, 73], [89, 73], [85, 64], [86, 56], [82, 56], [79, 62], [74, 50], [64, 43], [24, 43], [17, 50]], 100),
    };
    const FIGURE = [[-.18, 0], [-.2, .55], [-.12, .7], [-.1, .8], [-.12, .9], [-.04, 1], [.06, 1], [.12, .9], [.1, .8], [.12, .7], [.2, .55], [.18, 0]];
    const FLAME = [[-.3, 0], [-.38, .3], [-.22, .56], [-.18, .34], [-.04, .76], [0, 1], [.08, .6], [.2, .82], [.32, .4], [.36, .14], [.3, 0]];
    const flipPolys = polys => polys.map(p => p.map(([u, v]) => [-u, v]));
    function camel(B, x, y, h, o = {}) {
      const polys = [...CAMEL.legs, CAMEL.tail, CAMEL.body], lines = [CAMEL.eye];
      if (o.load) { polys.push(CAMEL.load); lines.push(...CAMEL.loadLines); }
      return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.3, lines: o.flip ? flipPolys(lines) : lines, role: o.role || 'the camels', lod: o.lod == null ? 1 : o.lod });
    }
    function camelDown(B, x, y, h, o = {}) {
      const polys = [CAMEL_DOWN.body], lines = CAMEL_DOWN.lines.slice();
      if (o.saddle) { polys.push(CAMEL_DOWN.saddle); lines.push(...CAMEL_DOWN.saddleLines); }
      return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h * 1.2, lines: o.flip ? flipPolys(lines) : lines, role: o.role || 'the camels', lod: o.lod == null ? 1 : o.lod });
    }
    function goat(B, x, y, h, o = {}) { const polys = [...GOAT.legs, GOAT.body]; return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h, role: o.role || 'the flock', lod: o.lod == null ? 2 : o.lod }); }
    function figure(B, x, y, h, o = {}) {
      const polys = [FIGURE];
      if (o.staff) polys.unshift([[.22, 0], [.25, 0], [.3, 1.08], [.27, 1.08]]);
      if (o.jar) polys.push([[.1, 1.0], [.06, 1.08], [.08, 1.16], [.18, 1.16], [.2, 1.08], [.16, 1.0]]);
      return B.cut(o.flip ? flipPolys(polys) : polys, x, y, o.z || 0, h, { w: h, role: o.role || 'a traveller', lod: o.lod == null ? 2 : o.lod });
    }

    /* ---------- the furniture ---------- */
    /* a boulder: an irregular faceted stone, broad in the middle, its bedding and a crack up close */
    function rock(B, R, cx, cy, r, h, o = {}) {
      const n = R.i(5, 7), rot = R() * TAU, z = o.z || 0, a0 = R() * TAU;
      const ox = R.r(-.3, .3) * r, oy = R.r(-.3, .3) * r;
      const layers = [
        [hull(wob(R, cx, cy, r, r * R.r(.65, .95), n, .18, rot, a0)), z],
        [hull(wob(R, cx + ox * .4, cy + oy * .4, r * .88, r * .72, n, .12, rot, a0)), z + h * .45],
        [hull(wob(R, cx + ox, cy + oy, r * R.r(.3, .5), r * R.r(.25, .42), max(3, n - 2), .2, rot, a0)), z + h],
      ];
      const p = sol(B, layers, { role: o.role || 'the rocks', lod: o.lod == null ? 1 : o.lod });
      if (r > 1.6) {
        const c = [cx + ox * .4, cy + oy * .4];
        strata(B, p, layers, c, [z + h * R.r(.22, .3), z + h * R.r(.56, .66)], { n: 14, slope: .35, lod: 2 });
        fall(B, p, layers, c, PI / 4 + R.r(-.7, .7), z + h * .92, z + h * .08, { k: 3, wander: .12, slope: .4, lod: 2 });
      }
      p.layers = layers;
      return p;
    }
    /* a date palm for a tile: the trunk and the crown in one stroke (up the trunk's left side, then each
       frond out and back), and up close the trunk as a tapering column ringed with leaf scars, the leaflets
       down every rib and the bunches of dates under the crown */
    function palm(B, R, x, y, h, o = {}) {
      const role = o.role || 'the palms', lod = o.lod == null ? 0 : o.lod, z0 = o.z || 0;
      const la = o.dir == null ? R() * TAU : o.dir, lean = (o.lean == null ? .09 : o.lean) * h;
      const tx = x + cos(la) * lean, ty = y + sin(la) * lean, tz = z0 + h, top = [tx, ty, tz];
      const r0 = max(.32, min(.6, h * .033)), rb = r0 * 1.3, rt = r0 * .8;
      const b0 = [x - EH[0] * rb, y - EH[1] * rb, z0], t0 = [tx - EH[0] * rt, ty - EH[1] * rt, tz - .2];
      const pts = [b0, t0, top], leaf = [];
      const n = o.fronds || 8, a0 = R() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * TAU + R.r(-.2, .2), L = h * R.r(.3, .38) * (o.spread || 1), dr = R.r(.2, .55), up = R.r(.08, .2), c = cos(a), s = sin(a);
        const f1 = [tx + c * L * .3, ty + s * L * .3, tz + L * up], f2 = [tx + c * L * .6, ty + s * L * .6, tz + L * (up * .85 - dr * .12)], f3 = [tx + c * L * .84, ty + s * L * .84, tz + L * (up * .2 - dr * .5)], f4 = [tx + c * L, ty + s * L, tz - L * dr];
        pts.push(f1, f2, f3, f4, f3, f2, f1, top);
        for (const [p, q, k] of [[f1, f2, .12], [f2, f3, .09]]) { const m = lerp3(p, q, .5); for (const sd of [-1, 1]) leaf.push([m, [m[0] + (c * .4 - s * sd) * L * k, m[1] + (s * .4 + c * sd) * L * k, m[2] - L * k]]); }
      }
      const cr = B.line(pts, { role, lod });
      for (const m of leaf) B.mark(m, { on: cr, cls: 'lo', lod: 2 });
      const tr = sol(B, [[ell(x, y, rb, rb, 8), z0], [ell(tx, ty, rt, rt, 8), tz - .2]], { role, lod: 2 });
      for (let i = 1, ns = max(3, round(h / 3.2)); i < ns; i++) { const t = i / ns; hoop(B, tr, lerp(x, tx, t), lerp(y, ty, t), lerp(rb, rt, t), lerp(z0, tz - .2, t), { n: 8, zig: .14, lod: 2 }); }
      if (h > 13 && o.dates !== false) for (let k = 0; k < 2; k++) {
        const a = PI / 4 + (k ? .9 : -.9) + R.r(-.3, .3), c = [tx + cos(a) * r0 * 2, ty + sin(a) * r0 * 2], zz = tz - .9, E = (u, dz) => [c[0] + EH[0] * u, c[1] + EH[1] * u, zz + dz];
        B.mark([[tx, ty, tz - .2], E(0, 0)], { on: cr, cls: 'lo', lod: 2 });
        B.mark([E(-.5, 0), E(-.4, -.8), E(0, -1.4), E(.4, -.8), E(.5, 0)], { on: cr, closed: true, cls: 'lo', lod: 2 });
      }
      cr.trunk = tr;
      return cr;
    }
    /* an umbrella acacia: a crooked trunk forking into a flat, wide crown */
    function acacia(B, R, x, y, h, o = {}) {
      const role = o.role || 'the acacia', lod = o.lod == null ? 0 : o.lod, cz = h * .78, r = h * R.r(.5, .58);
      const fx = x + R.r(-1, 1), fy = y + R.r(-1, 1), fz = h * .36, pts = [[x, y, 0], [fx, fy, fz]];
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + R.r(-.3, .3), rr = r * R.r(.45, .65); pts.push([fx + cos(a) * rr * .4, fy + sin(a) * rr * .4, lerp(fz, cz, .55)], [fx + cos(a) * rr, fy + sin(a) * rr, cz + .2], [fx + cos(a) * rr * .4, fy + sin(a) * rr * .4, lerp(fz, cz, .55)], [fx, fy, fz]); }
      B.line(pts, { role, lod, w: 1.4 });
      const rot = R() * TAU, ux = fx + R.r(-.2, .2) * r, uy = fy + R.r(-.2, .2) * r;
      const c = sol(B, [[wob(R, fx, fy, r * .8, r * .66, 12, .1, rot), cz], [wob(R, fx, fy, r, r * .82, 12, .12, rot), cz + h * .07], [wob(R, fx, fy, r * .86, r * .7, 12, .1, rot), cz + h * .12]], { role, lod });
      sol(B, [[wob(R, ux, uy, r * .5, r * .42, 10, .1, rot), cz + h * .11], [wob(R, ux, uy, r * .58, r * .48, 10, .12, rot), cz + h * .17], [wob(R, ux, uy, r * .42, r * .34, 10, .1, rot), cz + h * .22]], { role, lod: max(lod, 1) });
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + rot, rr = r * R.r(.55, .8), px = fx + cos(a) * rr, py = fy + sin(a) * rr * .82; B.mark([[px - EH[0] * .9, py - EH[1] * .9, cz + h * .125], [px, py, cz + h * .1], [px + EH[0] * .9, py + EH[1] * .9, cz + h * .125]], { on: c, lod: 2 }); }
      const rim = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU, rr = r * (k % 2 ? .93 : 1) * .99; rim.push([fx + cos(a) * rr, fy + sin(a) * rr * .82, cz + h * .07 + (k % 2 ? -.2 : 0)]); }
      ringMark(B, c, rim, [fx, fy], { lod: 2 });
      return c;
    }
    /* a tamarisk: a rounded, feathery crown on a short trunk of several stems */
    function tamarisk(B, R, x, y, h, o = {}) {
      const role = o.role || 'the tamarisk', lod = o.lod || 0, r = h * R.r(.44, .52), zc = h * .26, H = h - zc, rot = R() * TAU, n = 14;
      const c = sol(B, [[wob(R, x, y, r * .66, r * .6, n, .08, rot), zc], [wob(R, x, y, r, r * .9, n, .1, rot), zc + H * .36], [wob(R, x, y, r * .84, r * .76, n, .1, rot), zc + H * .72], [wob(R, x, y, r * .32, r * .28, n, .12, rot), h]], { role, lod });
      for (const dx of [-.6, 0, .6]) B.mark([[x + EH[0] * dx * .4, y + EH[1] * dx * .4, 0], [x + EH[0] * dx * r * .45, y + EH[1] * dx * r * .45, zc + .4]], { on: c, cls: 'edge', lod: 1 });
      // the drooping sprays round the side in view, each a short stroke down from under the crown's swell
      for (let k = 0; k < 9; k++) { const a = PI / 4 + (k / 8 - .5) * PI * 1.5, ca = cos(a), sa = sin(a), z = zc + H * R.r(.25, .55), p = [x + ca * r * .97, y + sa * r * .87]; B.mark([[p[0], p[1], z], [p[0] + ca * .3, p[1] + sa * .3, z - R.r(.9, 1.6)]], { on: c, n: [ca * .9, sa * .9, .2], lod: 2 }); }
      return c;
    }
    /* a low bush of the steppe: a small dome, twigs drawn on its side in view */
    function bush(B, R, x, y, r, h, o = {}) {
      const rot = R() * TAU, n = 10;
      const p = sol(B, [[wob(R, x, y, r * .85, r * .75, n, .1, rot), 0], [wob(R, x, y, r, r * .9, n, .12, rot), h * .45], [wob(R, x, y, r * .45, r * .4, n, .15, rot), h]], { role: o.role || 'the scrub', lod: o.lod || 0 });
      for (let k = 0; k < 4; k++) { const a = PI / 4 + (k - 1.5) * .55, ca = cos(a), sa = sin(a); B.mark([[x + ca * r * .3, y + sa * r * .3, h * .2], [x + ca * r * .9, y + sa * r * .8, h * .55]], { on: p, n: [ca * .8, sa * .8, .5], lod: 2 }); }
      return p;
    }
    /* a box turned to the angle a (its length along a), as a solid; p.F(u, v, z) is a point in its frame */
    function obox(B, cx, cy, L, W, a, z0, z1, o = {}) {
      const c = cos(a), s = sin(a), F = (u, v, z = 0) => [cx + u * c - v * s, cy + u * s + v * c, z];
      const r = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([u, v]) => F(u, v).slice(0, 2));
      const p = sol(B, [[r, z0], [r, z1]], { role: o.role, lod: o.lod, crease: o.crease == null ? .25 : o.crease });
      p.F = F; p.L2 = L; p.W2 = W;
      return p;
    }

    /* ======================= the desert ======================= */
    /* a barchan, the crescent dune, its horns drawn out downwind to points (with o.horn 0, a low ridge across
       the wind with no horns). In plan the back is a round arc to the wind and the horns its two arms; the
       brink of the slip face runs from horn tip to horn tip. The windward back is one plate and the slip face
       another. The light comes over the eye's left shoulder, so the slip face is hatched with fall lines on
       its left half, which turns from the light, and the back on its right flank; ripples run up the back. */
    function barchan(B, R, cx, cy, W, ang, o = {}) {
      const role = o.role || 'the dunes', lod = o.lod || 0, horn = o.horn == null ? 1 : o.horn;
      const fh = o.hf || R.r(.1, .12), fb = R.r(.34, .4), fl = R.r(.52, .62) * horn + .08, fT = R.r(.78, .86);
      // no barchan is quite even: one horn runs out further than the other, and the brink is highest off the middle
      const aL = 1 + R.r(-.22, .22) * horn, aR = 2 - aL, k0 = R.r(-.18, .18);
      const ca = cos(ang), sa = sin(ang), K = 12, pw = horn ? 2.4 : 2, pf = horn ? 1.5 : 1.6, arm = [[.62, .99], [.3, 1.03], [0, 1.04]];
      let h, hw, Lb, Lh, T, sf, P, crest, foot, cs, zc, outer;
      // the plan at width W; drawn smaller until it lies inside the footprint
      const plan = () => {
        h = W * fh; hw = W / 2; Lb = W * fb; Lh = W * fl; T = hw * fT; sf = h * 1.8;
        const s0 = (Lh - Lb) / 2, side = k => (k < 0 ? aR : aL) * Lh;
        P = (s, t, z = 0) => [cx + (s - s0) * ca - t * sa, cy + (s - s0) * sa + t * ca, z];
        crest = []; foot = []; cs = []; zc = []; outer = [];
        for (let i = 0; i <= K; i++) {
          const k = -1 + 2 * i / K, ak = abs(k), t = k * T, Ls = side(k), kk = k < k0 ? (k - k0) / (1 + k0) : (k - k0) / (1 - k0);
          cs.push(-h * .3 + (Ls + h * .3) * pow(ak, pw)); zc.push(h * pow(max(0, 1 - pow(abs(kk), 1.6)), .8));
          crest.push(P(cs[i], t, zc[i])); foot.push(P(sf + (Ls - sf) * pow(ak, pf), t, 0));
        }
        // the outer edge: from the right horn's tip back along its arm, round the back, and out along the left arm
        for (const [fs, ft] of arm) outer.push(P(side(-1) * fs, -hw * ft));
        for (let j = 1; j < 10; j++) { const a = 1.5 * PI - j / 10 * PI; outer.push(P(Lb * cos(a), hw * 1.04 * sin(a))); }
        for (const [fs, ft] of arm.slice().reverse()) outer.push(P(side(1) * fs, hw * ft));
      };
      plan();
      for (let k = 0; k < 30 && hrMax(outer.concat(crest)) > (o.fit || 22.6); k++) { W *= .97; plan(); }
      const stoss = B.plate([crest[0], ...outer, ...crest.slice(1).reverse()], { role, lod });
      const slip = B.plate([...crest, ...foot.slice(1, -1).reverse()], { role, lod, cls: 'lo' });
      B.mark(crest, { on: slip, cls: 'edge', lod: 1 });
      // the slip face in shade on its left half: fall lines close together; the lit half left clean
      for (let i = 1; i < K; i++) {
        const k = -1 + 2 * i / K, fs = k > .1 ? [0, .34, .67] : k > -.1 ? [0] : [];
        for (const f of fs) {
          const a = crest[i], b = crest[i + 1], c = foot[i], d = foot[i + 1];
          B.mark([lerp3(a, b, f), [lerp(c[0], d[0], f), lerp(c[1], d[1], f), 0]], { on: slip, lod: f === 0 && i % 2 === 0 && k > -.2 ? 1 : 2 });
        }
      }
      // the back's right flank, turned from the light: fall lines from the brink out to the foot of the arm
      const out2 = outer.map(p => [p[0], p[1]]);
      for (let i = 1; i < K / 2 - 1; i++) {
        const a = crest[i], dir = atan2(-ca, sa), e = rayHit(out2, a[0], a[1], dir);
        if (hypot(e[0] - a[0], e[1] - a[1]) < .6) continue;
        B.mark([a, [e[0], e[1], 0]], { on: stoss, lod: 2 });
      }
      // the ripples up the back, parallel to the brink, the rows near it shortening toward the middle
      const NR = o.rows || 6;
      for (let r = 0; r < NR; r++) {
        const f = .14 + .76 * r / max(1, NR - 1), span = r < NR - 2 ? .96 : (r === NR - 2 ? .7 : .45), pts = [], M = 2 * K;
        for (let m = 0; m <= M; m++) {
          const k = (-1 + 2 * m / M) * span, t = k * T, ik = (k + 1) / 2 * K, i0 = min(K - 1, floor(ik)), ft = ik - i0;
          const csk = lerp(cs[i0], cs[i0 + 1], ft), zck = lerp(zc[i0], zc[i0 + 1], ft), sb = -Lb * sqrt(max(0, 1 - pow(t / (hw * 1.04), 2)));
          pts.push(P(lerp(sb, csk, f) + sin(m * .9 + r * 2.1) * h * .05, t, zck * pow(f, 1.2) + .05));
        }
        B.mark(pts, { on: stoss, lod: r === round(NR / 2) || (o.field && r % 2 === 0) ? 1 : 2 });
      }
      // the tongues of sand slid from the brink, their toes on the floor
      for (let i = 3; i < K - 2; i += 3) { const a = crest[i], c = foot[i], m = lerp3(a, c, .5); B.mark([[m[0] - EH[0] * W * .025, m[1] - EH[1] * W * .025, m[2]], [lerp(m[0], c[0], .75), lerp(m[1], c[1], .75), lerp(m[2], 0, .75) + .05], [m[0] + EH[0] * W * .025, m[1] + EH[1] * W * .025, m[2]]], { on: slip, closed: true, lod: 2 }); }
      stoss.foot = foot; stoss.h = h; stoss.ext = (Lh + Lb) / 2;
      return stoss;
    }
    /* a nebkha: a mound of sand caught round a bush, its tail drawn out downwind, the bush on its crown */
    function nebkha(B, R, x, y, r, h, o = {}) {
      const rot = -PI / 4, a0 = R() * TAU, lod = o.lod || 0;
      const layers = [[wob(R, x + WD[0] * r * .35, y + WD[1] * r * .35, r * 1.3, r * .85, 10, .06, rot + PI / 2, a0), 0], [wob(R, x, y, r * .62, r * .52, 10, .08, rot, a0), h * .7], [ell(x - WD[0] * .2, y - WD[1] * .2, r * .22, r * .18, 10, rot, a0), h]];
      const p = sol(B, layers, { role: 'the sand', lod });
      strata(B, p, layers, [x, y], [h * .35], { n: 20, slope: .3, lod: 2 });
      tuft(B, null, R, x - WD[0] * .2, y - WD[1] * .2, h - .1, R.r(1.6, 2.2), { line: true, n: 7, spread: .6, lod: max(1, lod), role: 'the bush on the nebkha' });
      return p;
    }
    /* a low sand ridge across the wind (a zibar): a long, gently waving crest that fades to nothing at either
       end, the windward back a lens of ripples behind it, the short lee in front hatched where it turns from
       the light; drawn shorter until it lies inside the footprint */
    function ridge(B, R, cx, cy, L, o = {}) {
      const role = o.role || 'the sand', K = 14, h = L * (o.hf || R.r(.05, .065)), bow = L * R.r(-.04, .05), wv = L * R.r(.01, .025), ph = R() * TAU, fb = R.r(.2, .3);
      let crest, foot, back, cs, zc, Lb, T;
      const P = (s, t, z = 0) => [cx + s * WD[0] + t * EH[0], cy + s * WD[1] + t * EH[1], z];
      const plan = () => {
        T = L / 2; Lb = L * fb; crest = []; foot = []; back = []; cs = []; zc = [];
        for (let i = 0; i <= K; i++) {
          const k = -1 + 2 * i / K, ak = abs(k), s = bow * (k * k - .35) + wv * sin(k * 2.4 + ph), z = h * pow(max(0, 1 - pow(ak, 2.2)), .8);
          cs.push(s); zc.push(z);
          crest.push(P(s, k * T, z)); foot.push(P(s + h * 2.2 * (1 - pow(ak, 3)), k * T, 0)); back.push(P(s - Lb * sqrt(max(0, 1 - k * k)), k * T, 0));
        }
      };
      plan();
      for (let k = 0; k < 30 && hrMax(back.concat(foot)) > 22.6; k++) { L *= .97; plan(); }
      const stoss = B.plate([...crest, ...back.slice(1, -1).reverse()], { role, lod: o.lod || 0, cls: 'lo' });
      const lee = B.plate([...crest, ...foot.slice(1, -1).reverse()], { role, lod: o.lod || 0, cls: 'lo' });
      B.mark(crest, { on: lee, cls: 'edge', lod: 1 });
      // the lee: fall lines where it turns from the light (to the right along the crest, the left of the view)
      for (let i = 2; i < K - 1; i++) { const k = -1 + 2 * i / K; if (k > -.3 && i % (k > .2 ? 1 : 2) === 0) B.mark([crest[i], foot[i]], { on: lee, lod: k > .2 && i % 2 === 0 ? 1 : 2 }); }
      // the ripples up the back, parallel to the crest, shortening toward the ends
      const NR = o.rows || 6;
      for (let r = 0; r < NR; r++) {
        const f = .16 + .74 * r / max(1, NR - 1), span = .9 - .25 * r / NR, pts = [];
        for (let m = 0; m <= 2 * K; m++) {
          const k = (-1 + 2 * m / (2 * K)) * span, ik = (k + 1) / 2 * K, i0 = min(K - 1, floor(ik)), ft = ik - i0, s = lerp(cs[i0], cs[i0 + 1], ft), z = lerp(zc[i0], zc[i0 + 1], ft);
          pts.push(P(lerp(s - Lb * sqrt(max(0, 1 - k * k)), s, f) + sin(m * .9 + r * 2.1) * h * .08, k * T, z * pow(f, 1.2) + .05));
        }
        B.mark(pts, { on: stoss, lod: r % 2 === 0 ? 1 : 2 });
      }
      stoss.ext = L / 2;
      return stoss;
    }
    def('t:sand', (R, B) => {
      const g = ground(B, 'the sand'), occ = [];
      // the sand sheet rises into one or two long, low ridges across the wind: a field of ripples up their backs
      // to crests that read from afar
      const two = R.chance(.35);
      for (let i = 0, n = two ? 2 : 1; i < n; i++) {
        const L = two ? R.r(24, 32) : R.r(36, 44), c = along(R.r(-3, 3), two ? (i ? R.r(5, 8) : R.r(-8, -5)) : R.r(-3, 2));
        const rd = ridge(B, R, c[0], c[1], L, { lod: 0, rows: two ? 4 : 6 });
        occ.push([c[0] + WD[0] * 1.5, c[1] + WD[1] * 1.5, 4], [c[0] + EH[0] * rd.ext * .5, c[1] + EH[1] * rd.ext * .5, 4], [c[0] - EH[0] * rd.ext * .5, c[1] - EH[1] * rd.ext * .5, 4]);
      }
      // before it the open flat: ripples in runs that fade at their ends, a nebkha now and then
      for (let i = 0, n = R.i(1, 2); i < n; i++) { const p = spot(R, occ, 5, 21); if (p) ripples(B, g, R, p[0], p[1], R.i(4, 6), R.r(9, 14), R.r(1.5, 1.8), 0, { lod1: true, amp: .3 }); }
      if (R.chance(.4)) { const r = R.r(1.8, 2.6), p = spot(R, occ, r * 1.6, 21); if (p) nebkha(B, R, p[0], p[1], r, R.r(1, 1.5), { lod: 1 }); }
      // a pebble or two, a lag of gravel where the wind has carried the sand off, a dry tuft
      for (let i = 0, n = R.i(1, 2); i < n; i++) { const p = spot(R, occ, 2.4, 21); if (p) rock(B, R, p[0], p[1], R.r(.9, 1.5), R.r(.7, 1.1), { lod: 2, role: 'a stone' }); }
      if (R.chance(.5)) { const p = spot(R, occ, 4, 20); if (p) pebbles(B, g, R, p[0], p[1], R.r(3.5, 5.5), R.r(2.5, 3.5), R.i(9, 15), 0); }
      if (R.chance(.5)) { const p = spot(R, occ, 1.5, 21); if (p) tuft(B, g, R, p[0], p[1], 0, R.r(1.4, 2.2), { lod: 2 }); }
    }, { tier: 'tile', masks: false, word: 'sand' });
    def('t:dunes', (R, B) => {
      const g = ground(B, 'the sand sea'), occ = [], ds = [];
      if (R.chance(.45)) {
        // two crescents in echelon, the lesser downwind and to one side of the greater, its back on the greater's horn
        const W1 = R.r(27, 31), W2 = R.r(18, 22), sd = R.chance(.5) ? 1 : -1;
        const c1 = along(-sd * R.r(3, 5), R.r(-6, -4)), c2 = along(sd * R.r(7, 9), R.r(6, 8));
        ds.push(barchan(B, R, c1[0], c1[1], W1, PI / 4 + R.r(-.06, .06), { role: 'the great dune' }));
        ds.push(barchan(B, R, c2[0], c2[1], W2, PI / 4 + R.r(-.06, .06)));
        occ.push([c1[0], c1[1], W1 * .45], [c2[0], c2[1], W2 * .45]);
      } else {
        const W = R.r(34, 39), c = along(R.r(-2, 2), R.r(-2, 2));
        ds.push(barchan(B, R, c[0], c[1], W, PI / 4 + R.r(-.06, .06), { role: 'the great dune' }));
        occ.push([c[0], c[1], W * .45]);
      }
      // the sand floor between the dunes, rippled across the wind
      for (let i = 0, n = R.i(1, 2); i < n; i++) { const p = spot(R, occ, 4, 20); if (p) ripples(B, g, R, p[0], p[1], R.i(4, 6), R.r(9, 14), R.r(1.5, 1.8), 0, { lod1: i === 0, amp: .28 }); }
      // a tuft in the hollow under a slip face
      if (R.chance(.6)) { const d = ds[R.i(0, ds.length - 1)], f = d.foot[R.i(3, 7)]; tuft(B, g, R, f[0] + WD[0] * 1.5, f[1] + WD[1] * 1.5, 0, R.r(1.4, 2), { lod: 2 }); }
    }, { tier: 'tile', masks: false, word: 'dunes' });

    /* a butte: a cliff of bedded rock on its apron of talus, the cap a little smaller than the brow */
    function butte(B, R, cx, cy, r, h, o = {}) {
      const n = 11, rot = R() * TAU, a0 = R() * TAU, ox = R.r(-.12, .12) * r, oy = R.r(-.12, .12) * r, role = o.role || 'the outcrop';
      // a broad apron of talus, then the cliff rising nearly sheer from it to a flat cap
      const L1 = wob(R, cx + ox * .8, cy + oy * .8, r * .68, r * R.r(.48, .56), n, .12, rot, a0), L2 = wob(R, cx + ox, cy + oy, r * .62, r * R.r(.44, .5), n, .1, rot, a0);
      const layers = [[wob(R, cx, cy, r, r * R.r(.74, .88), n, .08, rot, a0), 0], [L1, h * .3], [L2, h * .94], [scl(L2, .96, [cx + ox, cy + oy]), h]];
      const p = sol(B, layers, { role, lod: o.lod || 0, crease: .45 });
      const ctr = [cx + ox * .6, cy + oy * .6], nb = R.i(3, 4), zs = [];
      for (let k = 0; k < nb; k++) zs.push(lerp(h * .34, h * .84, (k + .5) / nb) + R.r(-.15, .15));
      strata(B, p, layers, ctr, zs, { n: 36, slope: .2, wave: .06, lod: i => i === 0 || i === nb - 1 ? 1 : 2 });
      for (let k = 0; k < 5; k++) fall(B, p, layers, ctr, PI / 4 + (k - 2) * .5 + R.r(-.15, .15), h * .89, h * .32, { k: 3, wander: .05, slope: .2, lod: 2 });
      for (let k = 0; k < 9; k++) fall(B, p, layers, ctr, PI / 4 + (k - 4) * .32 + R.r(-.1, .1), h * .28, h * .02, { k: 2, slope: .55, lod: k % 3 === 1 ? 1 : 2 });
      shade(B, p, layers, ctr, { zHi: h * .89, zLo: h * .32, lod: 2, dense: 6, flat: true, slope: .2 });
      p.layers = layers;
      return p;
    }
    def('t:rocks', (R, B) => {
      const g = ground(B, 'the rocks'), occ = [];
      if (R.chance(.65)) {
        // an outcrop of bedded rock some twenty across, with blocks fallen from its cliff
        const r = R.r(11, 13), h = R.r(6.5, 9.5), c = fitIn(R.r(-3, 3), R.r(-4, 2), r * 1.04);
        butte(B, R, c[0], c[1], r, h, { lod: 0 });
        occ.push([c[0], c[1], r * 1.02]);
        for (let i = 0, n = R.i(2, 3); i < n; i++) {
          const a = PI / 4 + R.r(-1.5, 1.5), d = r * R.r(1.05, 1.25), rr = R.r(1.6, 2.8), x = c[0] + cos(a) * d, y = c[1] + sin(a) * d;
          if (hr(x, y) + rr / K3 > 22.4) continue;
          rock(B, R, x, y, rr, rr * R.r(.7, .95), { lod: i ? 2 : 1 }); occ.push([x, y, rr]);
        }
      } else {
        // a pile of great boulders, heaped together some twenty across
        const c = [R.r(-2, 2), R.r(-2, 2)], big = R.r(5.5, 6.8);
        rock(B, R, c[0], c[1], big, big * R.r(.8, 1), { lod: 0 }); occ.push([c[0], c[1], big]);
        for (let i = 0, n = R.i(3, 4); i < n; i++) {
          const a = PI / 4 + (i / n - .5) * TAU * .9 + R.r(-.3, .3), rr = R.r(3, 4.6), d = big + rr * R.r(.45, .7), x = c[0] + cos(a) * d, y = c[1] + sin(a) * d;
          if (hr(x, y) + rr / K3 > 22.4) continue;
          rock(B, R, x, y, rr, rr * R.r(.7, .95), { lod: i < 2 ? 0 : 1 }); occ.push([x, y, rr]);
        }
      }
      // the scree and the gravel of the hamada
      for (let k = 0, n = R.i(2, 3); k < n; k++) { const p = spot(R, occ, 3, 20); if (p) pebbles(B, g, R, p[0], p[1], R.r(3, 5), R.r(2, 3.5), R.i(8, 14), 0); }
      if (R.chance(.4)) { const p = spot(R, occ, 1.5, 20); if (p) tuft(B, g, R, p[0], p[1], 0, R.r(1.3, 2), { lod: 2 }); }
    }, { tier: 'tile', masks: false, word: 'rocks' });

    /* a tussock: a clump of steppe grass grown into a low mound, its blades fanning down the side in view and
       a fringe of blade tips standing over its crown */
    function tussock(B, R, x, y, r, h, o = {}) {
      const rot = R() * TAU, n = 12;
      const layers = [[wob(R, x, y, r * .86, r * .76, n, .1, rot), 0], [wob(R, x, y, r, r * .88, n, .12, rot), h * .36], [wob(R, x, y, r * .62, r * .54, n, .14, rot), h * .8], [wob(R, x, y, r * .26, r * .22, n, .2, rot), h]];
      const p = sol(B, layers, { role: o.role || 'the tussocks', lod: o.lod || 0 });
      for (let k = 0; k < 9; k++) {
        const a = PI / 4 + (k / 8 - .5) * PI * 1.5 + R.r(-.1, .1), ca = cos(a), sa = sin(a);
        B.mark([[x + ca * r * .3, y + sa * r * .27, h * .9], [x + ca * r * 1.01, y + sa * r * .92, h * R.r(.22, .45)]], { on: p, n: [ca * .8, sa * .8, .6], lod: k % 2 ? 2 : 1 });
      }
      const fr = [];
      for (let k = 0; k <= 7; k++) { const u = (k / 7 - .5) * r * 1.3, v = R.r(-.25, .25) * r, w = R.r(-.4, .4); fr.push([x + EH[0] * u + EU[0] * v, y + EH[1] * u + EU[1] * v, h * .8], [x + EH[0] * (u + w) + EU[0] * v, y + EH[1] * (u + w) + EU[1] * v, h + R.r(.3, .7)]); }
      B.mark(fr.slice(0, -1), { on: p, n: [0, 0, 1], cls: 'mid', lod: 1 });
      return p;
    }
    def('t:scrub', (R, B) => {
      const g = ground(B, 'the steppe'), occ = [];
      // one small tree, an acacia or a tamarisk, and two or three clumps of tussock grass, clear from afar
      const tr = R.chance(.55) ? 'acacia' : 'tamarisk', p = spot(R, occ, 6.5, 16) || [0, 0];
      if (tr === 'acacia') acacia(B, R, p[0], p[1], R.r(10, 13), { lod: 0 });
      else tamarisk(B, R, p[0], p[1], R.r(7, 9), { lod: 0 });
      for (let i = 0, n = R.i(2, 3); i < n; i++) { const r = R.r(3, 4), q = spot(R, occ, r + 1.2, 20.5); if (q) tussock(B, R, q[0], q[1], r, R.r(1.4, 1.9), { lod: i < 2 ? 0 : 1 }); }
      // a stone or two, the small tufts between, and gravel
      for (let i = 0, n = R.i(1, 2); i < n; i++) { const q = spot(R, occ, 2.2, 20.5); if (q) rock(B, R, q[0], q[1], R.r(1, 1.7), R.r(.7, 1.2), { lod: 2 }); }
      for (let k = 0, n = R.i(4, 7); k < n; k++) { const q = spot(R, occ, 1.6, 21); if (q) tuft(B, g, R, q[0], q[1], 0, R.r(1.3, 2.1), { lod: k < 2 ? 1 : 2 }); }
      if (R.chance(.6)) { const q = spot(R, occ, 3.5, 20); if (q) pebbles(B, g, R, q[0], q[1], R.r(3, 4.5), R.r(2, 3), R.i(7, 12), 0); }
    }, { tier: 'tile', masks: false, word: 'steppe' });

    /* a low rounded hill: four layers, a contour in lod 1, the rest of its contours and its shaded side up close */
    /* a low rounded hill, longer than it is broad, its back a short ridge; drawn smaller until it lies inside
       the footprint. A contour in lod 1; the others and the shaded side up close */
    function hill(B, R, cx, cy, r, h, o = {}) {
      const n = 14, rot = o.rot == null ? R() * TAU : o.rot, e = R.r(.62, .78), a0 = R() * TAU, fo = [R.r(-.15, .15), R.r(-.15, .15)], jit = [];
      for (let k = 0; k < 4 * n; k++) jit.push(R.r(-.05, .05));
      let layers;
      const mk = () => {
        const ox = fo[0] * r, oy = fo[1] * r, L = (k0, rx, ry, ofs) => { const o2 = []; for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU, j = 1 + jit[k0 * n + k]; o2.push(rotP(cx + ox * ofs + rx * j * cos(a), cy + oy * ofs + ry * j * sin(a), rot, cx + ox * ofs, cy + oy * ofs)); } return o2; };
        layers = [[L(0, r, r * e, 0), 0], [L(1, r * .8, r * e * .66, .4), h * .36], [L(2, r * .5, r * e * .36, .8), h * .76], [L(3, r * .24, r * e * .1, 1), h]];
      };
      mk();
      for (let k = 0; k < 30 && hrMax(layers[0][0]) > (o.fit || 22.4); k++) { r *= .96; h *= .97; mk(); }
      const p = sol(B, layers, { role: o.role || 'the hills', lod: o.lod || 0 });
      const ctr = [cx + fo[0] * r * .5, cy + fo[1] * r * .5];
      strata(B, p, layers, ctr, [h * .32], { n: 34, slope: .4, wave: .12, lod: 1 });
      strata(B, p, layers, ctr, [h * .6], { n: 34, slope: .45, wave: .12, lod: 2 });
      shade(B, p, layers, ctr, { zHi: h * .84, zLo: h * .06, dense: 4, lod: 2 });
      p.layers = layers;
      return p;
    }
    def('t:hills', (R, B) => {
      const g = ground(B, 'the hills');
      // a broad hill behind, one or two lesser before it to either side; the ridges all lie roughly one way
      const n = R.chance(.5) ? 2 : 3, turn = R.r(-.4, .4), rot0 = -PI / 4 + R.r(-.5, .5), slots = [[-2.5, -4, 15, 8], [8, 7, 10, 5.5], [-9, 8, 8, 4.5]];
      if (R.chance(.5)) for (const s of slots) s[0] = -s[0];
      const hs = [];
      for (let i = 0; i < n; i++) {
        const [sx, sy, r0, h0] = slots[i], q = rotP(sx, sy, turn), r = r0 * R.r(.9, 1.1), h = h0 * R.r(.85, 1.2);
        hs.push(hill(B, R, q[0] + R.r(-1.5, 1.5), q[1] + R.r(-1.5, 1.5), r, h, { lod: i < 2 ? 0 : 1, rot: rot0 + R.r(-.3, .3) }));
      }
      // stones and tussocks at their feet
      const occ = hs.map(p => [p.cx, p.cy, max(p.hw, p.hh) * .85]);
      for (let k = 0, m = R.i(2, 4); k < m; k++) { const q = spot(R, occ, 1.5, 21); if (q) tuft(B, g, R, q[0], q[1], 0, R.r(1.3, 2), { lod: 2 }); }
      if (R.chance(.6)) { const q = spot(R, occ, 2, 20); if (q) rock(B, R, q[0], q[1], R.r(1, 1.7), R.r(.8, 1.3), { lod: 2 }); }
    }, { tier: 'tile', masks: false, word: 'hills' });

    /* a faceted peak (after iso-kinds-land.js): a broad foot, an offset shoulder and a small summit; ridges
       down from the summit, a snow line dipping in the gullies (o.snow) or a crown of bare crags (o.cap) */
    function peak(B, R, cx, cy, Rb, h, o = {}) {
      const n = 9, rot = R() * TAU, a0 = R() * TAU, z0 = 0;
      // the shoulders long and set off to one side, so the mass is a ridge rising to a summit, not a cone
      const sa = R() * TAU, sr = R.r(.18, .28) * Rb, sx = cos(sa) * sr, sy = sin(sa) * sr, z1 = h * R.r(.26, .34), z2 = h * R.r(.6, .7);
      let base = wob(R, cx, cy, Rb, Rb * R.r(.8, .95), n, .12, rot, a0);
      let s1 = wob(R, cx + sx * .7, cy + sy * .7, Rb * R.r(.64, .74), Rb * R.r(.4, .5), n, .2, rot, a0);
      let s2 = wob(R, cx + sx * 1.4, cy + sy * 1.4, Rb * R.r(.32, .42), Rb * R.r(.16, .24), n, .28, rot, a0);
      let top = wob(R, cx + sx * 1.9, cy + sy * 1.9, Rb * .09, Rb * .05, n, .3, rot, a0);
      // drawn smaller about its centre until its foot lies inside the footprint
      for (let k = 0; k < 30 && hrMax(base) > (o.fit || 22.6); k++) { const f = .97, c = [cx, cy]; base = scl(base, f, c); s1 = scl(s1, f, c); s2 = scl(s2, f, c); top = scl(top, f, c); }
      const layers = [[base, z0], [s1, z0 + z1], [s2, z0 + z2], [top, z0 + h]], sh = s1, zs = z1;
      const p = sol(B, layers, { role: o.role || 'the peak', lod: o.lod || 0 });
      const ctr = [cx + sx, cy + sy];
      // the ridges down from the summit over the shoulders, ending on the lower slopes
      for (let i = 0; i < n; i++) {
        if (!R.chance(.55)) continue;
        const end = lerp2(s1[i], base[i], R.r(.45, .8));
        surf(B, p, [[top[i][0], top[i][1], z0 + h], [s2[i][0], s2[i][1], z0 + z2], [s1[i][0], s1[i][1], z0 + z1], [end[0], end[1], z0 + z1 * .35]], ctr, { radial: true, slope: .55, cls: 'mid', lod: 1 });
      }
      const snowZ = o.snow ? z0 + h * o.snow : null;
      if (snowZ) {
        const pts = [];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const t = k / 3, z = snowZ + (k === 0 ? h * .05 : -h * (k === 1 ? .08 : .03)), S = sectionAt(layers, z), a = S[i], b = S[(i + 1) % n]; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), z]); }
        pts.push(pts[0]);
        surf(B, p, pts, ctr, { slope: .5, cls: 'mid', lod: 1 });
        for (let i = 0; i < n; i += 2) { const z1 = snowZ - h * .07, z2 = z1 - h * R.r(.08, .16), a = lerp2(sectionAt(layers, z1)[i], sectionAt(layers, z1)[(i + 1) % n], .5), b = lerp2(sectionAt(layers, z2)[i], sectionAt(layers, z2)[(i + 1) % n], .5); surf(B, p, [[a[0], a[1], z1], [b[0], b[1], z2]], ctr, { radial: true, slope: .5, cls: 'mid', lod: 2 }); }
      } else if (o.cap) {
        // bare crags round the summit: a ledge, and short clefts down from the top
        strata(B, p, layers, ctr, [h * .84], { n: 24, slope: .5, wave: h * .015, cls: 'mid', lod: 1 });
        for (let k = 0; k < 6; k++) fall(B, p, layers, ctr, PI / 4 + (k - 2.5) * .45 + R.r(-.12, .12), h * .97, h * R.r(.7, .8), { k: 2, wander: .1, slope: .5, cls: 'mid', lod: 2 });
      }
      shade(B, p, layers, ctr, { zHi: snowZ ? snowZ - h * .09 : h * .82, zLo: h * .06, dense: 6 });
      const zTop = snowZ ? snowZ - h * .12 : h * .76, nb = max(2, round(zTop / max(4, h * .11))), bz = [];
      for (let k = 1; k <= nb; k++) bz.push(lerp(h * .08, zTop, k / (nb + .3)));
      strata(B, p, layers, ctr, bz, { n: 30, slope: .45, wave: h * .012, lod: 2 });
      p.layers = layers; p.ctr = ctr;
      return p;
    }
    def('t:peak', (R, B) => {
      const g = ground(B, 'the mountain'), pair = R.chance(.7), snow = R.chance(.55);
      const rb = pair ? R.r(13.5, 15.5) : R.r(16, 18.5), h = rb * (pair ? R.r(1.3, 1.6) : R.r(1.15, 1.5));
      const sd = R.chance(.5) ? 1 : -1, off = pair ? along(-sd * rb * .3, -rb * .12) : [0, 0];
      const c = fitIn(R.r(-2, 2) + off[0], R.r(-2, 2) + off[1], rb * (pair ? 1.05 : 1.12));
      const P = peak(B, R, c[0], c[1], rb, h, { snow: snow ? R.r(.6, .7) : 0, cap: !snow, role: 'the peak' });
      if (pair) {
        // a lesser summit on its shoulder, to the side and nearer the eye
        const r2 = rb * R.r(.52, .62), q = fitIn(c[0] + EH[0] * sd * rb * .62 + WD[0] * rb * .3, c[1] + EH[1] * sd * rb * .62 + WD[1] * rb * .3, r2 * 1.12);
        peak(B, R, q[0], q[1], r2, h * R.r(.5, .62), { snow: snow ? .8 : 0, cap: !snow, role: 'the peak' });
      }
      // the scree at the foot: fans of stones spilling from the gullies on the side in view, blocks fallen from above
      const base = P.layers[0][0];
      for (let k = 0, m = R.i(2, 3); k < m; k++) {
        const a = PI / 4 + (k - (m - 1) / 2) * .9 + R.r(-.2, .2), e = rayHit(base, c[0], c[1], a), x = e[0] + cos(a) * 1.6, y = e[1] + sin(a) * 1.6;
        if (hr(x, y) > 21.5) continue;
        pebbles(B, g, R, x, y, R.r(2.4, 3.6), R.r(1.4, 2.2), R.i(7, 12), 0);
        if (k < 2 && hr(x, y) < 20.5) rock(B, R, x + cos(a) * 1.2, y + sin(a) * 1.2, R.r(.9, 1.5), R.r(.7, 1.1), { lod: 2 });
      }
    }, { tier: 'tile', masks: false, word: 'peak' });

    /* the polygons of a salt crust: a jittered net of bricks, turned at random and clipped to the crust;
       the bricks in lod 1, each split in two up close, so every crack ends on another or on the edge */
    function saltNet(B, host, R, poly, z, cell) {
      const ang = R() * PI, ca = cos(ang), sa = sin(ang), ext = 23, n = ceil(2 * ext / cell) + 1, N = [];
      for (let j = 0; j <= n; j++) { const row = []; for (let i = 0; i <= n; i++) { const u = -ext + i * cell + R.r(-.24, .24) * cell, v = -ext + j * cell * .8 + R.r(-.2, .2) * cell * .8; row.push([u * ca - v * sa, u * sa + v * ca]); } N.push(row); }
      const seg = (a, b, lod) => {
        const ia = inPoly(poly, a[0], a[1]), ib = inPoly(poly, b[0], b[1]);
        if (!ia && !ib) return;
        const A2 = ia ? a : clipTo(poly, b, a), B2 = ib ? b : clipTo(poly, a, b), mm = lerp2(A2, B2, .5), bend = R.r(-.12, .12) * hypot(B2[0] - A2[0], B2[1] - A2[1]);
        const dx = B2[1] - A2[1], dy = A2[0] - B2[0], dl = hypot(dx, dy) || 1;
        B.mark([[A2[0], A2[1], z], [mm[0] + dx / dl * bend, mm[1] + dy / dl * bend, z], [B2[0], B2[1], z]], { on: host, cls: 'lo', lod });
      };
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        if (i < n) seg(N[j][i], N[j][i + 1], 1);
        if (j < n) seg(N[j][i], N[j + 1][i], (i + j) % 2 === 0 ? 1 : 2);
      }
    }
    def('t:salt', (R, B) => {
      // the rim of the depression: the ground sloping down to the pan, drawn as hachures that run under the crust
      const cx = R.r(-1.5, 1.5), cy = R.r(-1.5, 1.5), rx = R.r(17, 20.5), ry = rx * R.r(.76, .94), rot = R() * PI;
      const rim = fitPoly(smooth(wob(R, cx, cy, rx, ry, 11, .08, rot), 4), 22.4);
      const rp = B.plate(at(rim, -.12), { role: 'the rim of the pan', cls: 'lo', lod: 0 });
      const c0 = ctrOf(rim), w = R.r(2.2, 3.2), ph = R() * TAU;
      const crust = rim.map((p, i) => { const dx = p[0] - c0[0], dy = p[1] - c0[1], d = hypot(dx, dy) || 1, ww = w * (1 + .35 * sin(i * .45 + ph)); return [p[0] - dx / d * ww, p[1] - dy / d * ww]; });
      rim.forEach((p, i) => { const dx = p[0] - c0[0], dy = p[1] - c0[1], d = hypot(dx, dy) || 1; B.mark([[p[0], p[1], -.12], [p[0] - dx / d * w * 1.6, p[1] - dy / d * w * 1.6, -.12]], { on: rp, cls: i % 2 ? 'lo' : 'mid', lod: i % 2 ? 2 : 1 }); });
      // the pale crust, broken into its polygons
      const cr = B.plate(at(crust, 0), { role: 'the salt', lod: 0 });
      saltNet(B, cr, R, crust, 0, R.r(3.6, 4.4));
      // now and then the prints of a camel that crossed it
      if (R.chance(.35)) {
        const a = R() * PI, ux = cos(a), uy = sin(a), e0 = rayHit(crust, c0[0], c0[1], a + PI), e1 = rayHit(crust, c0[0], c0[1], a);
        const L = hypot(e1[0] - e0[0], e1[1] - e0[1]);
        for (let s = 1.5, k = 0; s < L - 1.5; s += 1.3, k++) { const sd = k % 2 ? .55 : -.55, x = e0[0] + ux * s - uy * sd, y = e0[1] + uy * s + ux * sd; B.mark(at(closed(ell(x, y, .38, .3, 6, a)), 0), { on: cr, cls: 'mid', lod: 2 }); }
      }
    }, { tier: 'tile', masks: false, word: 'salt pan' });

    /* ======================= the watered land ======================= */
    def('t:palms', (R, B) => {
      const g = ground(B, 'the grove');
      const gx = R.r(-3, 3), gy = R.r(-2.5, 3), rx = R.r(14.5, 18), ry = rx * R.r(.78, .94), rot = R() * PI;
      const wg = fitPoly(smooth(wob(R, gx, gy, rx, ry, 10, .1, rot), 3), 22);
      const wet = B.plate(at(wg, -.12), { role: 'the watered ground', cls: 'lo', lod: 0 });
      // two to five date palms, spread over the watered ground
      const n = R.i(3, 5), pp = [];
      for (let t = 0; t < 90 && pp.length < n; t++) { const a = R() * TAU, d = sqrt(R()) * .64, x = gx + cos(a) * rx * d, y = gy + sin(a) * ry * d; if (hr(x, y) > 14.5 || pp.some(q => hypot(q[0] - x, q[1] - y) < 6.8)) continue; pp.push([x, y]); }
      if (!pp.length) pp.push([gx, gy]);
      pp.forEach(([x, y], i) => { const young = pp.length > 3 && i === pp.length - 1 && R.chance(.6); palm(B, R, x, y, young ? R.r(11, 13) : R.r(17, 21), { lod: i < 3 ? 0 : 1, lean: young ? .05 : R.r(.06, .12), spread: 1.1, role: 'the date palms' }); });
      // each palm in its basin, the basins joined by little bunds of earth
      const bas = pp.map(([x, y], i) => [x, y, R.r(1.9, 2.5), atan2(y - gy, x - gx)]).sort((a, b) => a[3] - b[3]);
      for (const [x, y, r] of bas) B.mark(at(closed(ell(x, y, r, r * .9, 14)), -.12), { on: wet, lod: 2 });
      for (let i = 0; i < bas.length && bas.length > 1; i++) { const [x0, y0, r0] = bas[i], [x1, y1, r1] = bas[(i + 1) % bas.length], d = hypot(x1 - x0, y1 - y0); if (d < r0 + r1 + 1 || d > 15 || (bas.length === 2 && i)) continue; const ux = (x1 - x0) / d, uy = (y1 - y0) / d; B.mark([[x0 + ux * r0, y0 + uy * r0, -.12], [x1 - ux * r1, y1 - uy * r1, -.12]], { on: wet, lod: 2 }); }
      // the channel that brings the water in from the edge of the grove to the nearest basin
      if (R.chance(.65)) {
        const a = R() * TAU, s0 = rayHit(wg, gx, gy, a);
        let best = bas[0]; for (const b of bas) if (hypot(b[0] - s0[0], b[1] - s0[1]) < hypot(best[0] - s0[0], best[1] - s0[1])) best = b;
        const dx = s0[0] - best[0], dy = s0[1] - best[1], d = hypot(dx, dy) || 1, e = [best[0] + dx / d * best[2], best[1] + dy / d * best[2]];
        if (d > best[2] + 3) {
          const m = lerp2(s0, e, .5), bend = R.r(-1.5, 1.5), cl = spline([s0, [m[0] - dy / d * bend, m[1] + dx / d * bend], e], 4), rb = ribbon(cl, 1.2);
          for (const sd of ['left', 'right']) { const L = rb[sd], a0 = inPoly(wg, L[0][0], L[0][1]) ? clipTo(wg, L[0], [L[0][0] + dx / d * 3, L[0][1] + dy / d * 3]) : L[0]; B.mark(at([a0, ...L.slice(1)], -.12), { on: wet, lod: 1 }); }
          for (let i = 1; i < cl.length - 2; i += 2) { const q = cl[i], r2 = cl[i + 1]; B.mark(at([lerp2(q, r2, .1), lerp2(q, r2, .8)], -.12), { on: wet, lod: 2 }); }
        }
      }
      // fallen fronds on the ground
      for (let k = 0, m = R.i(0, 2); k < m; k++) { const [x, y] = pp[R.i(0, pp.length - 1)], a = R() * TAU, L = R.r(3.5, 5), c = cos(a), s = sin(a), q = [x + c * 2.6, y + s * 2.6]; if (!inPoly(wg, q[0] + c * L, q[1] + s * L)) continue; B.mark([[q[0], q[1], -.12], [q[0] + c * L, q[1] + s * L, -.12]], { on: wet, lod: 2 }); for (let j = 1; j < 5; j++) { const mm = [q[0] + c * L * j / 5, q[1] + s * L * j / 5]; for (const sd of [-1, 1]) B.mark([[mm[0], mm[1], -.12], [mm[0] + (c * .5 - s * sd) * .8, mm[1] + (s * .5 + c * sd) * .8, -.12]], { on: wet, lod: 2 }); } }
    }, { tier: 'tile', masks: false, word: 'palm grove' });

    /* the lattice of the gardens and fields: a plot is a fifth of the lattice across (7.5) and a third of
       it down (7.22), so the bunds of one tile run on into the next; a furrow is a sixth of a plot */
    const CX = 37.5 / 5, CY = AP / 3, SP = AP / 18;
    def('t:garden', (R, B) => {
      const g = ground(B, 'the gardens');
      const ok = (x0, y0) => [[x0, y0], [x0 + CX, y0], [x0, y0 + CY], [x0 + CX, y0 + CY]].every(p => hr(p[0], p[1]) <= 22.6);
      const key = (i, j) => i + ',' + j, cells = new Map();
      for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) if (ok(i * CX, j * CY)) cells.set(key(i, j), [i, j]);
      // the channel: down the middle from the north, or across it from the west; the shaduf at its head
      const ns = R.chance(.5);
      // one or two plots at the rim left out, for a palm or a heap of earth
      const rimCells = [...cells.values()].filter(([i, j]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !cells.has(key(i + a, j + b))) && !(ns ? (i === -1 || i === 0) && j === -2 : (j === -1 || j === 0) && i === -2));
      const gone = [];
      for (let k = 0, m = R.i(0, 2); k < m && rimCells.length; k++) { const c = rimCells.splice(R.i(0, rimCells.length - 1), 1)[0]; cells.delete(key(c[0], c[1])); gone.push(c); }
      // the bunds: every side of every plot once, those on the channel's line left to the channel
      const onChan = (x0, y0, x1, y1) => ns ? (abs(x0) < .01 && abs(x1) < .01) : (abs(y0) < .01 && abs(y1) < .01);
      for (const [i, j] of cells.values()) {
        const x0 = i * CX, y0 = j * CY, x1 = x0 + CX, y1 = y0 + CY;
        for (const [ax, ay, bx, by, ni, nj] of [[x0, y0, x1, y0, 0, -1], [x1, y0, x1, y1, 1, 0], [x0, y1, x1, y1, 0, 1], [x0, y0, x0, y1, -1, 0]]) {
          const other = cells.has(key(i + ni, j + nj));
          if (other && (ni < 0 || nj < 0)) continue;
          if (onChan(ax, ay, bx, by)) continue;
          B.mark([[ax, ay, 0], [bx, by, 0]], { on: g, cls: other ? 'lo' : 'mid', lod: 1 });
        }
        // what grows in the plot
        const kind = R.pick(['rows', 'rows', 'furrows', 'flooded', 'melons', 'fallow']), m = .7;
        if (kind === 'rows') for (let y = y0 + 1.3; y < y1 - .8; y += 1.25) { B.mark([[x0 + m, y, 0], [x1 - m, y, 0]], { on: g, lod: 2 }); for (let x = x0 + 1.3; x < x1 - 1; x += 1.4) B.mark([[x - .3, y, 0], [x, y, .6], [x + .3, y, 0]], { on: g, lod: 2 }); }
        else if (kind === 'furrows') for (let x = x0 + .9; x < x1 - .6; x += .9) B.mark([[x, y0 + m, 0], [x, y1 - m, 0]], { on: g, lod: 2 });
        else if (kind === 'flooded') for (let k = 0; k < 4; k++) { const x = R.r(x0 + 1.8, x1 - 1.8), y = R.r(y0 + 1.2, y1 - 1.2); B.mark([[x - EH[0] * .9, y - EH[1] * .9, 0], [x + EH[0] * .9, y + EH[1] * .9, 0]], { on: g, lod: 2 }); }
        else if (kind === 'melons') { for (let k = 0; k < 5; k++) { const x = R.r(x0 + 1.2, x1 - 1.2), y = R.r(y0 + 1.2, y1 - 1.2); B.mark(at(closed(ell(x, y, .5, .42, 7)), 0), { on: g, lod: 2 }); } }
      }
      // the channel, a ribbon of water between the plots, from the sump under the shaduf to the far bund
      const head = ns ? [0, -2 * CY - 3.2] : [-2 * CX - 3.4, 0], tail = ns ? [0, 2 * CY] : [2 * CX, 0], u = ns ? [0, 1] : [1, 0], v = [-u[1], u[0]], hw = .65;
      const s0 = [head[0] + u[0] * 1.6, head[1] + u[1] * 1.6];
      const chan = B.plate([[s0[0] - v[0] * hw, s0[1] - v[1] * hw, .02], [tail[0] - v[0] * hw, tail[1] - v[1] * hw, .02], [tail[0] + v[0] * hw, tail[1] + v[1] * hw, .02], [s0[0] + v[0] * hw, s0[1] + v[1] * hw, .02]], { role: 'the channel', cls: 'lo', lod: 0 });
      const Lc = hypot(tail[0] - s0[0], tail[1] - s0[1]);
      for (let s = 1.5; s < Lc - 1; s += 2.6) { const x = s0[0] + u[0] * s, y = s0[1] + u[1] * s; B.mark([[x - u[0] * .5, y - u[1] * .5, .02], [x + u[0] * .5, y + u[1] * .5, .02]], { on: chan, lod: 2 }); }
      // the sluices where each row of plots takes its water
      for (const t of ns ? [-CY, 0, CY] : [-CX, 0, CX]) { const q = ns ? [0, t] : [t, 0]; for (const sd of [-1, 1]) B.mark([[q[0] + v[0] * hw * sd, q[1] + v[1] * hw * sd, .02], [q[0] + v[0] * (hw + .9) * sd, q[1] + v[1] * (hw + .9) * sd, .02]], { on: chan, cls: 'mid', lod: 2 }); }
      // the sump, and the shaduf straddling the channel: two mud pillars, the sweep with its weight and its bucket
      const sump = B.plate(at(ell(head[0], head[1], 1.7, 1.5, 12), .01), { role: 'the channel', cls: 'lo', lod: 1 });
      B.mark([[head[0] - EH[0] * .7, head[1] - EH[1] * .7, .01], [head[0] + EH[0] * .7, head[1] + EH[1] * .7, .01]], { on: sump, lod: 2 });
      const piv = [head[0] + u[0] * 3.4, head[1] + u[1] * 3.4], pz = 4.4, pw = 1.7;
      const pil = [-1, 1].map(sd => B.box(piv[0] + v[0] * pw * sd - .45, piv[1] + v[1] * pw * sd - .45, piv[0] + v[0] * pw * sd + .45, piv[1] + v[1] * pw * sd + .45, 0, pz, { r: .2, b: 0, top: .1, role: 'the shaduf', lod: 0 }));
      B.mark([[piv[0] - v[0] * (pw + .5), piv[1] - v[1] * (pw + .5), pz + .15], [piv[0] + v[0] * (pw + .5), piv[1] + v[1] * (pw + .5), pz + .15]], { on: pil[1], cls: 'edge', lod: 1 });
      const tipZ = R.r(6.5, 8), cw = [piv[0] + u[0] * 2.6, piv[1] + u[1] * 2.6, pz + .4 - 2.6 * (tipZ - pz - .4) / 3.4], tip = [head[0], head[1], tipZ], bz = R.r(1.6, 3.2);
      B.line([cw, [piv[0], piv[1], pz + .4], tip, [head[0], head[1], bz + 1.1]], { role: 'the shaduf', lod: 1, w: 1.2 });
      sol(B, [[ell(cw[0], cw[1], .5, .5, 8), cw[2] - 1.5], [ell(cw[0], cw[1], .9, .8, 8), cw[2] - .8], [ell(cw[0], cw[1], .35, .35, 8), cw[2] - .1]], { role: 'the shaduf', lod: 2 });
      const bu = B.lathe(head[0], head[1], [[.45, bz], [.7, bz + .5], [.65, bz + 1.1]], { n: 10, role: 'the shaduf', lod: 2 });
      hoop(B, bu, head[0], head[1], .68, bz + .8, { n: 10, lod: 2 });
      figure(B, head[0] + v[0] * 2.2, head[1] + v[1] * 2.2, 5.6, { role: 'the gardener', flip: R.chance(.5), lod: 2 });
      // a palm or two on the rim of the plots
      const corners = [[-2 * CX, -CY], [-2 * CX, CY], [2 * CX, -CY], [2 * CX, CY], [-CX, -2 * CY], [CX, -2 * CY], [-CX, 2 * CY], [CX, 2 * CY]].filter(([x, y]) => hypot(x - piv[0], y - piv[1]) > 6 && hypot(x - head[0], y - head[1]) > 6);
      for (const c of gone) corners.push([(c[0] + .5) * CX, (c[1] + .5) * CY]);
      for (let k = 0, m = R.i(1, 2); k < m && corners.length; k++) { const c = corners.splice(R.i(0, corners.length - 1), 1)[0]; palm(B, R, c[0], c[1], R.r(13, 17), { lod: k ? 1 : 0, lean: R.r(.05, .12), role: 'the palms' }); }
    }, { tier: 'tile', masks: false, word: 'gardens' });

    def('t:crops', (R, B) => {
      const g = ground(B, 'the fields'), rim = 22.4 * K3, strips = [];
      // the strips run east and west on the lattice, a furrow every sixth of a strip; their ends are ragged
      for (let j = -3; j < 3; j++) {
        const ya = max(j * CY + .3, -rim + 1.2), yb = min((j + 1) * CY - .3, rim - 1.2);
        if (yb - ya < SP * 2.2) continue;
        const yo = max(abs(ya), abs(yb)), xm = (rim - .5 * yo) / K3 - .8;
        if (xm < 6) continue;
        const xa = -xm + (R.chance(.55) ? R.r(.5, 5) : 0), xb = xm - (R.chance(.55) ? R.r(.5, 5) : 0);
        strips.push({ j, ya, yb, xa, xb, kind: R.pick(['grain', 'grain', 'stubble', 'ploughed', 'ploughed', 'young', 'fallow']) });
      }
      if (!strips.some(s => s.kind === 'grain')) strips[R.i(1, strips.length - 2)].kind = 'grain';
      // a threshing floor at the end of one strip, now and then
      let floor0 = null;
      if (R.chance(.35)) {
        const s = strips.filter(q => q.kind !== 'grain' && q.yb - q.ya > CY * .8)[0];
        if (s) { const left = R.chance(.5), r = 3.3, cx = left ? s.xa + r + .3 : s.xb - r - .3, cy = (s.ya + s.yb) / 2; if (left) s.xa += 2 * r + 1; else s.xb -= 2 * r + 1; floor0 = [cx, cy, r]; }
      }
      let grains = 0;
      for (const s of strips) {
        const { ya, yb, xa, xb, kind } = s, rect = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
        const furrows = (lodOf, dz = 0, host = g) => { for (let k = ceil(ya / SP + .3); k * SP < yb - .3; k++) B.mark([[xa + .3, k * SP, dz], [xb - .3, k * SP, dz]], { on: host, lod: lodOf(k) }); };
        if (kind === 'grain') {
          const hg = R.r(1.2, 1.7), gp = sol(B, [[rect, 0], [rect, hg]], { role: 'the standing grain', lod: grains++ ? 1 : 0 });
          furrows(k => k % 2 ? 2 : 1, hg, gp);
          for (let x = xa + 1; x < xb - .3; x += 1.4) B.mark([[x, yb, .25], [x + .2, yb, hg - .25]], { on: gp, n: [0, 1, 0], lod: 2 });
          for (let y = ya + .8; y < yb - .3; y += 1.4) B.mark([[xb, y, .25], [xb, y + .2, hg - .25]], { on: gp, n: [1, 0, 0], lod: 2 });
          continue;
        }
        B.mark(at(closed(rect), 0), { on: g, cls: 'mid', lod: 1 });
        if (kind === 'ploughed') { furrows(k => k % 2 ? 2 : 1); for (let k = ceil(ya / SP); (k + .5) * SP < yb - .3; k++) if ((k + .5) * SP > ya + .3) B.mark([[xa + .3, (k + .5) * SP, 0], [xb - .3, (k + .5) * SP, 0]], { on: g, lod: 2 }); }
        else if (kind === 'young') { furrows(k => 2); for (let k = ceil(ya / SP + .3); k * SP < yb - .3; k++) for (let x = xa + 1; x < xb - .6; x += 1.5) B.mark([[x - .3, k * SP, 0], [x, k * SP, .55], [x + .3, k * SP, 0]], { on: g, lod: 2 }); }
        else if (kind === 'stubble') {
          for (let k = ceil(ya / SP + .3); k * SP < yb - .3; k++) for (let x = xa + .8 + (k % 2) * .4; x < xb - .4; x += .8) B.mark([[x, k * SP, 0], [x, k * SP, .4]], { on: g, lod: 2 });
          // the sheaves stooked in the stubble
          for (let k = 0, m = R.i(2, 4), y = (ya + yb) / 2; k < m; k++) { const x = lerp(xa + 2, xb - 2, (k + .5) / m) + R.r(-.8, .8); const sk = B.lathe(x, y, [[.95, 0], [.75, 1.1], [.85, 1.5], [0, 2.5]], { n: 9, role: 'the sheaves', lod: k ? 2 : 1 }); hoop(B, sk, x, y, .76, 1.1, { n: 9, lod: 2 }); }
        } else if (kind === 'fallow') { for (let k = 0, m = R.i(2, 4); k < m; k++) tuft(B, g, R, R.r(xa + 1, xb - 1), R.r(ya + .8, yb - .8), 0, R.r(.9, 1.4), { lod: 2, n: 5 }); }
      }
      if (floor0) {
        // the threshing floor: beaten earth ringed with stones, the heap of grain, the oxen treading it out
        const [x, y, r] = floor0, fl = B.plate(at(ell(x, y, r, r, 20), .02), { role: 'the threshing floor', cls: 'lo', lod: 1 });
        B.mark(at(closed(ell(x, y, r * .82, r * .82, 20)), .02), { on: fl, lod: 2 });
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; B.mark(at(closed(ell(x + cos(a) * r * .91, y + sin(a) * r * .91, .3, .25, 5)), .02), { on: fl, lod: 2 }); }
        B.lathe(x - EH[0] * 1.2, y - EH[1] * 1.2, [[1.4, .02], [1.1, .6], [.5, 1.1], [0, 1.3]], { n: 12, role: 'the threshing floor', lod: 1 });
        if (R.chance(.6)) figure(B, x + EH[0] * 1.6, y + EH[1] * 1.6, 5.6, { staff: true, role: 'the thresher', flip: R.chance(.5), lod: 2 });
      }
    }, { tier: 'tile', masks: false, word: 'fields' });

    /* a fruit tree of the orchards (a pomegranate, a fig): a round crown on a short trunk, fruit on the side in view */
    function fruitTree(B, R, x, y, o = {}) {
      const role = o.role || 'the orchard', fig = o.fig, r = (fig ? R.r(2.9, 3.4) : R.r(2.5, 3)) * (o.k || 1), zc = R.r(1.5, 1.9), H = r * (fig ? 1.2 : 1.45), rot = R() * TAU, n = 12, sq = fig ? .9 : 1;
      const c = sol(B, [[wob(R, x, y, r * .55, r * .5 * sq, n, .06, rot), zc], [wob(R, x, y, r, r * .92 * sq, n, .07, rot), zc + H * .38], [wob(R, x, y, r * .8, r * .72 * sq, n, .08, rot), zc + H * .75], [wob(R, x, y, r * .28, r * .25 * sq, n, .1, rot), zc + H]], { role, lod: o.lod || 0 });
      B.mark([[x, y, 0], [x, y, zc + .3]], { on: c, cls: 'edge', lod: 1 });
      for (let k = 0; k < 5; k++) { const a = PI / 4 + (k - 2) * .55 + R.r(-.12, .12), ca = cos(a), sa = sin(a), z = zc + H * (k % 2 ? .62 : .42), p = [x + ca * r * .9, y + sa * r * .85], w = r * .2; B.mark([[p[0] + sa * w, p[1] - ca * w, z + .15], [p[0], p[1], z - .2], [p[0] - sa * w, p[1] + ca * w, z + .15]], { on: c, n: [ca * .85, sa * .85, .5], lod: 2 }); }
      if (!fig) for (let k = 0; k < 3; k++) { const a = PI / 4 + (k - 1) * .7 + R.r(-.15, .15), ca = cos(a), sa = sin(a), z = zc + H * R.r(.3, .6), p = [x + ca * r * .93, y + sa * r * .88]; B.mark(at(closed(ell(p[0], p[1], .28, .28, 6)), z), { on: c, n: [ca * .85, sa * .85, .4], lod: 2 }); }
      return c;
    }
    def('t:orchard', (R, B) => {
      const g = ground(B, 'the orchard'), fig = R.chance(.45), GX = 37.5 / 4;
      // the wall: a rectangle inside the footprint, a gate in its south side
      let wx = R.r(12.5, 15), wy = R.r(10.5, 12.5); const ox = R.r(-1, 1), oy = R.r(-.8, .8);
      while (hrMax([[ox - wx, oy - wy], [ox + wx, oy - wy], [ox + wx, oy + wy], [ox - wx, oy + wy]]) > 21.6) { wx *= .96; wy *= .98; }
      const x0 = ox - wx, x1 = ox + wx, y0 = oy - wy, y1 = oy + wy, t = .8, wh = R.r(1.7, 2.1), gx = ox + R.r(-wx * .5, wx * .5);
      B.mark([[gx - 1.5, y1, 0], [x0, y1, 0], [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [gx + 1.5, y1, 0]], { on: g, cls: 'mid', lod: 1 });
      for (const [a, b, c, d] of [[x0, y0, x1, y0 + t], [x0, y0 + t, x0 + t, y1 - t], [x1 - t, y0 + t, x1, y1 - t], [x0, y1 - t, gx - 1.5, y1], [gx + 1.5, y1 - t, x1, y1]]) {
        const w = B.box(a, b, c, d, 0, wh, { r: .25, b: 0, top: .08, role: 'the orchard wall', lod: 2 });
        B.band(wh * .45, { on: w, sides: 'SE', lod: 2 });
      }
      // the trees on the lattice, in rows or in quincunx; some places left empty
      const quin = R.chance(.5), spots = [];
      for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) { const x = i * GX + (quin && j % 2 ? GX / 2 : 0), y = j * CY; if (x > x0 + 2.8 && x < x1 - 2.8 && y > y0 + 2.6 && y < y1 - 2.6) spots.push([x, y]); }
      const keep = spots.slice();
      while (keep.length > 7 || (keep.length > 4 && R.chance(.25))) keep.splice(R.i(0, keep.length - 1), 1);
      keep.forEach(([x, y], i) => { fruitTree(B, R, x, y, { fig, lod: i < 4 ? 0 : 1, k: R.r(.9, 1.08) }); B.mark(at(closed(ell(x, y, 1.6, 1.4, 12)), 0), { on: g, lod: 2 }); });
      // the irrigation furrows along the rows, from the wall to the wall
      const rowsY = [...new Set(keep.map(p => p[1]))];
      for (const y of rowsY) B.mark([[x0 + t, y + 2, 0], [x1 - t, y + 2, 0]], { on: g, lod: 2 });
      // in an empty place a well head, or someone at work
      const empty = spots.filter(p => !keep.includes(p));
      if (empty.length && R.chance(.6)) { const [x, y] = empty[0], wl = B.cyl(x, y, 1.1, 0, .9, { n: 12, b: .25, role: 'the orchard well', lod: 2 }); staves(B, wl, x, y, 1.1, 0, .9, 8, { lod: 2 }); }
      if (R.chance(.35)) figure(B, gx + R.r(-1, 1), y1 - 2.4, 5.6, { role: 'the gardener', flip: R.chance(.5), lod: 2 });
    }, { tier: 'tile', masks: false, word: 'orchard' });

    /* a bed of reeds standing in the water: a low mass with upright sides, the stems drawn round the side in
       view and the plumes along its top up close */
    function reedbed(B, R, cx, cy, r, h, o = {}) {
      const n = 12, rot = R() * TAU, c = [cx, cy], top = wob(R, cx, cy, r, r * R.r(.55, .8), n, .12, rot), base = scl(top, .8, c);
      const layers = [[base, 0], [top, h * .8], [scl(top, .88, c), h]];
      const p = sol(B, layers, { role: o.role || 'the reeds', lod: o.lod || 0 });
      // the stems, from the water up the side in view, splaying as they rise
      for (let k = 0, m = round(r * 2.6); k < m; k++) {
        const a = PI / 4 + (k / (m - 1) - .5) * PI * 1.4, e0 = rayHit(base, cx, cy, a), e1 = rayHit(top, cx, cy, a), zt = h * .8 * R.r(.9, 1.04);
        B.mark([[e0[0], e0[1], 0], [e1[0], e1[1], zt]], { on: p, n: [cos(a), sin(a), -.1], lod: k % 3 === 0 ? 1 : 2 });
      }
      // the plumes, a fringe of heads standing over the top and nodding outward
      for (let k = 0; k < 11; k++) {
        const a = PI / 4 + (k / 10 - .5) * PI * 1.6, ca = cos(a), sa = sin(a), e = rayHit(layers[2][0], cx, cy, a), z = h - .15, l = R.r(.8, 1.5);
        B.mark([[e[0], e[1], z], [e[0] + ca * l * .35, e[1] + sa * l * .35, z + l], [e[0] + ca * l * .6, e[1] + sa * l * .6, z + l * .8]], { on: p, n: [ca * .3, sa * .3, .9], cls: 'mid', lod: k % 3 === 1 ? 1 : 2 });
      }
      return p;
    }
    /* a mudhif, the reed guest house of the marshes: a long barrel vault of bundled reed arches on its island,
       its end in view closed by a lattice screen round the door, a tall bundled pillar at either corner */
    function mudhif(B, R, cx, cy, L, W, H, alongX, o = {}) {
      const role = o.role || 'the reed house', lod = o.lod || 0, ax = alongX ? [1, 0] : [0, 1], bx = alongX ? [0, 1] : [1, 0];
      const Pt = (a, b, z) => [cx + ax[0] * a + bx[0] * b, cy + ax[1] * a + bx[1] * b, z];
      const prof = [[1, 0], [.97, .3], [.86, .58], [.66, .8], [.38, .94], [.08, 1]];
      const layers = prof.map(([w, zf]) => [[[-L / 2, -W / 2 * w], [L / 2, -W / 2 * w], [L / 2, W / 2 * w], [-L / 2, W / 2 * w]].map(([a, b]) => Pt(a, b, 0).slice(0, 2)), zf * H]);
      const p = sol(B, layers, { role, lod });
      // the arches across the vault, each segment shown while its side of the vault faces the eye
      const nr = max(5, round(L / 1.6));
      for (let k = 1; k < nr; k++) {
        const a = -L / 2 + L * k / nr, pts = [];
        for (const [w, zf] of prof) pts.push([-w, zf]);
        for (let i = prof.length - 1; i >= 0; i--) pts.push([prof[i][0], prof[i][1]]);
        for (let i = 1; i < pts.length; i++) {
          const [w0, z0] = pts[i - 1], [w1, z1] = pts[i], mb = (w0 + w1) / 2, mz = (z0 + z1) / 2, nb = mb / .5, nz = mz * 1.2, l = hypot(nb, nz) || 1;
          B.mark([Pt(a, w0 * W / 2, z0 * H), Pt(a, w1 * W / 2, z1 * H)], { on: p, n: [bx[0] * nb / l, bx[1] * nb / l, nz / l], lod: k % 2 ? 2 : 1 });
        }
      }
      // the end in view: the door under its arch, the lattice of the screen about it
      const e = L / 2, nE = [ax[0], ax[1], 0], dw = W * .17, dh = H * .55;
      const door = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * PI; door.push(Pt(e, -cos(t) * dw, dh * .55 + sin(t) * dh * .45)); }
      B.mark([Pt(e, -dw, 0), ...door, Pt(e, dw, 0)], { on: p, n: nE, lod: 1 });
      const wAt = zf => { for (let i = 1; i < prof.length; i++) if (zf <= prof[i][1]) return lerp(prof[i - 1][0], prof[i][0], (zf - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1])); return 0; };
      for (const bf of [-.62, -.4, .4, .62]) { const zf = (() => { for (let z = 0; z <= 1; z += .02) if (wAt(z) < abs(bf)) return z - .02; return 1; })(); B.mark([Pt(e, bf * W / 2, 0), Pt(e, bf * W / 2, zf * H)], { on: p, n: nE, lod: 2 }); }
      for (const zf of [.72, .86]) { const w = wAt(zf) * W / 2; B.mark([Pt(e, -w, zf * H), Pt(e, w, zf * H)], { on: p, n: nE, lod: 2 }); }
      // the pillars of bundled reed at the corners of the entrance, standing above the vault
      for (const sd of [-1, 1]) { const q = Pt(e + .35, sd * (W / 2 + .1), 0), pl = B.lathe(q[0], q[1], [[.62, 0], [.55, H * .7], [.42, H * 1.16], [.6, H * 1.22], [0, H * 1.3]], { n: 10, role, lod: 2 }); for (const z of [H * .3, H * .62, H * .92]) hoop(B, pl, q[0], q[1], .58, z, { n: 10, lod: 2 }); }
      return p;
    }
    function canoe(B, R, x, y, L, ang, o = {}) {
      const c = cos(ang), s = sin(ang), pts = [];
      for (let i = 0; i <= 8; i++) { const t = -1 + 2 * i / 8; pts.push([t * L / 2, L * .08 * pow(1 - t * t, .6)]); }
      for (let i = 7; i > 0; i--) { const t = -1 + 2 * i / 8; pts.push([t * L / 2, -L * .08 * pow(1 - t * t, .6)]); }
      const P = pts.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
      const p = sol(B, [[scl(P, .9, [x, y]), 0], [P, .6]], { role: o.role || 'the canoe', lod: o.lod == null ? 1 : o.lod, crease: .15 });
      for (const sd of [-1, 1]) B.mark([[x + c * L / 2 * sd, y + s * L / 2 * sd, .6], [x + c * (L / 2 + .5) * sd, y + s * (L / 2 + .5) * sd, 1.3]], { on: p, cls: 'edge', lod: 2 });
      return p;
    }
    def('t:reeds', (R, B) => {
      // the open water, wide among the reeds
      const wx = R.r(-2, 2), wy = R.r(-2, 2), rot = R() * PI;
      const water = fitPoly(smooth(wob(R, wx, wy, R.r(16, 20), R.r(13, 17), 9, .14, rot), 3), 22.2);
      const wp = B.plate(at(water, 0), { role: 'the marsh', cls: 'lo', lod: 0 });
      shine(B, wp, R, water, R.i(7, 10), 0);
      const occ = [], house = R.chance(.55);
      if (house) {
        // the reed house on its island of reeds and mud
        const alongX = R.chance(.5), L = R.r(11, 13), W = R.r(5.2, 6), H = R.r(4.8, 5.6), c = fitIn(R.r(-4, 3), R.r(-5, 1), L * .62);
        const isl = smooth(wob(R, c[0], c[1], (alongX ? L / 2 + 2.6 : W / 2 + 2.6), (alongX ? W / 2 + 2.6 : L / 2 + 2.6), 8, .08, 0), 3);
        const ip = B.plate(at(isl, .3), { role: 'the island', lod: 1 });
        for (let k = 0; k < isl.length; k += 2) { const q = isl[k], dx = q[0] - c[0], dy = q[1] - c[1], d = hypot(dx, dy) || 1; if (dx + dy < 0) continue; B.mark([[q[0], q[1], .3], [q[0] + dx / d * .5, q[1] + dy / d * .5, 0]], { on: ip, lod: 2 }); }
        mudhif(B, R, c[0], c[1], L, W, H, alongX, { lod: 0 });
        occ.push([c[0], c[1], L * .62]);
      }
      // the reed beds round the water
      for (let i = 0, n = R.i(house ? 2 : 3, house ? 3 : 4); i < n; i++) {
        const r = R.r(4.5, 7), p = spot(R, occ, r * .85, 21.5) || (i ? null : [R.r(-6, 6), R.r(-6, 6)]);
        if (p) reedbed(B, R, p[0], p[1], r, R.r(4.2, 5.8), { lod: i < 2 ? 0 : 1 });
      }
      // a canoe on the open water, its man standing with his pole
      if (!house || R.chance(.45)) {
        const p = spot(R, occ, 5.5, 18);
        if (p) {
          const a = R.chance(.5) ? -PI / 4 + R.r(-.3, .3) : R.r(-.3, .3), L = R.r(8.5, 10.5);
          canoe(B, R, p[0], p[1], L, a, { lod: 1 });
          const fx = p[0] - cos(a) * L * .28, fy = p[1] - sin(a) * L * .28;
          figure(B, fx, fy, 5.6, { role: 'the boatman', flip: R.chance(.5), z: .6, lod: 2 });
          B.line([[fx + EH[0] * 1.6, fy + EH[1] * 1.6, -.6], [fx - EH[0] * .6, fy - EH[1] * .6, 8.2]], { role: 'the boatman', lod: 2 });
        }
      }
    }, { tier: 'tile', masks: false, word: 'marsh' });

    /* ======================= on the roads ======================= */
    /* a Bedouin black tent turned to face fa: a long low roof of goat-hair strips sagging between its poles,
       the back and the ends walled, the front open on its poles into the shade inside; ropes to stakes */
    function tent(B, R, cx, cy, Lx, D, H, fa, host, o = {}) {
      const role = o.role || 'the black tent', lod = o.lod || 0, fx = cos(fa), fy = sin(fa), lx = sin(fa), ly = -cos(fa);
      const T = (X, Y, Z) => [cx + lx * X + fx * Y, cy + ly * X + fy * Y, Z];
      const bays = R.i(2, 3), eave = H * .5, sag = H * .16, zb = .9, He = H * .8, K = bays * 4, yc = -D * .1;
      const ridge = [], front = [], back = [];
      for (let i = 0; i <= K; i++) { const X = lerp(-Lx / 2, Lx / 2, i / K), ph = (i % 4) / 4, end = i === 0 || i === K; ridge.push(T(X, yc, end ? He : H - sag * sin(ph * PI))); front.push(T(X, D / 2, eave - sag * .45 * sin(ph * PI))); back.push(T(X, -D / 2, zb)); }
      const endPts = sx => [T(sx, -D / 2, 0), T(sx, -D / 2, zb), T(sx, yc, He), T(sx, D / 2, eave), T(sx, D / 2, 0)];
      const seeA = -lx - ly > 0;
      B.plate([...ridge, ...back.slice().reverse()], { role, lod });
      const eA = B.plate(endPts(-Lx / 2), { role, lod: seeA ? lod : 2 });
      const roof = B.plate([...ridge, ...front.slice().reverse()], { role, lod });
      const eB = B.plate(endPts(Lx / 2), { role, lod: seeA ? 2 : lod });
      const curt = B.plate([T(-Lx / 2, D / 2, 0), ...front, T(Lx / 2, D / 2, 0)], { role, lod });
      // the strips of goat hair along the roof, and the straps across it at each pole
      for (const [f, ml] of [[.25, 2], [.5, 1], [.75, 2]]) B.mark(ridge.map((r, i) => lerp3(r, front[i], f)), { on: roof, lod: ml });
      for (let i = 4; i < K; i += 4) B.mark([ridge[i], front[i]], { on: roof, cls: 'mid', lod: 2 });
      // the poles along the front; the shade inside the open bays, drawn close
      const open = R.i(1, bays);
      for (let i = 0; i <= K; i++) {
        const f = front[i];
        if (i % 4 === 0) B.mark([[f[0], f[1], 0], [f[0], f[1], f[2]]], { on: curt, cls: 'edge', lod: 1 });
        if (i < K && floor(i / 4) < open) for (const t of [.25, .5, .75]) { const a = front[i], b = front[i + 1], x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t); B.mark([[x, y, .15], [x, y, z - .3]], { on: curt, lod: t === .5 ? 1 : 2 }); }
      }
      // the guy ropes out to their stakes, each rope ending on its stake's head
      const stakes = [];
      for (let i = 0; i <= K; i += 4) stakes.push([front[i], T(lerp(-Lx / 2, Lx / 2, i / K) + R.r(-.5, .5), D / 2 + 2.6, 0), curt]);
      stakes.push([T(-Lx / 2, yc, He), T(-Lx / 2 - 2.4, yc, 0), eA], [T(Lx / 2, yc, He), T(Lx / 2 + 2.4, yc, 0), eB]);
      for (const [a, s, on] of stakes) { rope(B, on, a, [s[0], s[1], .6], .2, { lod: 2 }); B.mark([[s[0], s[1], 0], [s[0], s[1], .7]], { on: host, cls: 'edge', lod: 2 }); }
      return roof;
    }
    function hearth(B, R, x, y, o = {}) {
      const role = 'the hearth', hz = .45, rr = 1.4;
      const h = B.cyl(x, y, rr, 0, hz, { n: 9, b: .3, role, lod: o.lod == null ? 1 : o.lod });
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + .35; B.mark([[x + cos(a) * rr, y + sin(a) * rr, 0], [x + cos(a) * rr, y + sin(a) * rr, hz]], { on: h, n: [cos(a), sin(a), 0], lod: 2 }); }
      B.cut([FLAME], x, y, hz, 1.8, { w: 1.5, role, lod: 2 });
      B.line(spline([[x, y, 2.5], [x + .5, y - .4, 4.2], [x - .3, y - .8, 6], [x + .6, y - 1.3, 8]], 3), { role, cls: 'lo', lod: 2 });
      return h;
    }
    def('t:camp', (R, B, A) => {
      const g = ground(B, 'the camp'), e = roadEdge(A);
      // the tent looks to the road, or to the south or the east
      const d = e >= 0 ? NRM[e] : NRM[R.chance(.5) ? 4 : 5], fa = atan2(d[1], d[0]), l = [sin(fa), -cos(fa)];
      const Lx = R.r(16, 19), D = R.r(8.5, 9.5), H = R.r(5.2, 6), bk = R.r(2.5, 4.5), sl = R.r(-1.5, 1.5);
      const tc = [-d[0] * bk + l[0] * sl, -d[1] * bk + l[1] * sl];
      tent(B, R, tc[0], tc[1], Lx, D, H, fa, g, { role: 'the black tent' });
      // the hearth before the open front, the coffee pot by it
      const hs = R.r(-3, 3), hx = tc[0] + d[0] * (D / 2 + R.r(3.6, 5)) + l[0] * hs, hy = tc[1] + d[1] * (D / 2 + R.r(3.6, 5)) + l[1] * hs;
      hearth(B, R, hx, hy);
      const pot = B.lathe(hx + EH[0] * 2.2, hy + EH[1] * 2.2, [[.5, 0], [.62, .45], [.38, 1], [.24, 1.25], [.42, 1.5], [0, 1.85]], { n: 10, role: 'the hearth', lod: 2 });
      B.mark([[hx + EH[0] * 2.65, hy + EH[1] * 2.65, 1], [hx + EH[0] * 3.2, hy + EH[1] * 3.2, 1.55]], { on: pot, cls: 'edge', lod: 2 });
      // a camel or two, couched by the tent or standing
      const nc = R.i(1, 2);
      for (let i = 0; i < nc; i++) {
        const sd = i ? -Math.sign(hs || 1) : Math.sign(hs || 1), q = fitIn(tc[0] + l[0] * sd * (Lx / 2 + R.r(1.5, 3.5)) + d[0] * R.r(3, 6), tc[1] + l[1] * sd * (Lx / 2 + R.r(1.5, 3.5)) + d[1] * R.r(3, 6), 3.5, 21);
        if (R.chance(.6)) camelDown(B, q[0], q[1], 4.8, { flip: R.chance(.5), saddle: R.chance(.5), lod: 1 });
        else camel(B, q[0], q[1], 7.4, { flip: R.chance(.5), lod: 1 });
      }
      // the people of the tent, and their goats
      figure(B, hx - EH[0] * 2, hy - EH[1] * 2, 5.8, { role: 'the sheikh', flip: R.chance(.5), lod: 2 });
      for (let k = 0, m = R.i(0, 2); k < m; k++) { const q = fitIn(hx + d[0] * R.r(3, 6) + l[0] * R.r(-6, 6), hy + d[1] * R.r(3, 6) + l[1] * R.r(-6, 6), 2, 21); goat(B, q[0], q[1], 3.2, { flip: R.chance(.5), lod: 2 }); }
      // the ground about the hearth, trodden and scattered with ash
      pebbles(B, g, R, hx, hy, 3, 2.4, 6, 0, { cls: 'lo' });
    }, { tier: 'tile', masks: true, word: 'camp' });

    def('t:well', (R, B, A) => {
      const g = ground(B, 'the well'), e = roadEdge(A), d = e >= 0 ? NRM[e] : null;
      // by the road if there is one, the trough along it on the road side; else in the open
      const k0 = R.r(4, 6.5), sl = R.r(-2.5, 2.5);
      const [wx, wy] = d ? [d[0] * k0 - d[1] * sl, d[1] * k0 + d[0] * sl] : [R.r(-2.5, 2.5), R.r(-3, 1)];
      const td = d || WD, ta = atan2(td[0], -td[1]);
      const apr = fitPoly(smooth(wob(R, wx + td[0] * 3, wy + td[1] * 3, R.r(10.5, 12.5), R.r(8, 9.5), 9, .1, ta), 3), 22.4);
      const ap = B.plate(at(apr, -.12), { role: 'the trodden ground', cls: 'lo', lod: 0 });
      // the curb of stone, the dark of the shaft within it
      const cr = R.r(3.4, 3.9), ch = R.r(2, 2.4);
      const curb = B.cyl(wx, wy, cr, 0, ch, { n: 14, b: .55, role: 'the well', lod: 0 });
      for (const l of hatch(ell(wx, wy, cr - .75, cr - .75, 14), PI / 4, .5)) B.mark(at(l, ch), { on: curb, lod: 1 });
      staves(B, curb, wx, wy, cr, 0, ch / 2, 12, { lod: 2 }); staves(B, curb, wx, wy, cr, ch / 2, ch, 12, { off: .5, lod: 2 });
      hoop(B, curb, wx, wy, cr, ch / 2, { n: 20, lod: 2 });
      // the frame across the curb, the pulley on its beam, the rope down into the shaft
      // the frame: two posts forked at the top, the beam laid in the forks and running out past them, the
      // pulley wheel hung from the beam, the rope down into the shaft
      const fz = R.r(8, 9), pa = [wx - EH[0] * (cr + .3), wy - EH[1] * (cr + .3)], pb = [wx + EH[0] * (cr + .3), wy + EH[1] * (cr + .3)], E3 = (q, u, z) => [q[0] + EH[0] * u, q[1] + EH[1] * u, z];
      const fr = B.line([[pa[0], pa[1], 0], [pa[0], pa[1], fz], [pb[0], pb[1], fz], [pb[0], pb[1], 0]], { role: 'the frame', lod: 0, w: 1.4 });
      B.mark([E3(pa, -1.3, fz + .15), E3(pb, 1.3, fz + .15)], { on: fr, cls: 'edge', lod: 1 });
      for (const [q, sd] of [[pa, -1], [pb, 1]]) B.mark([E3(q, sd * .55, fz + .9), [q[0], q[1], fz], E3(q, -sd * .55, fz + .9)], { on: fr, cls: 'edge', lod: 2 });
      const pr = 1, pul = []; for (let k = 0; k <= 14; k++) { const a = k / 14 * TAU; pul.push([wx + EH[0] * cos(a) * pr, wy + EH[1] * cos(a) * pr, fz - pr - .25 + sin(a) * pr]); }
      B.mark(pul, { on: fr, lod: 1 });
      B.mark([[wx, wy, fz - pr - .25], [wx, wy, fz]], { on: fr, lod: 2 });
      B.mark([[wx - EH[0] * pr, wy - EH[1] * pr, fz - pr - .25], [wx - EH[0] * pr, wy - EH[1] * pr, ch - .3]], { on: fr, cls: 'mid', lod: 1 });
      // the bucket set down on the curb
      const bx = wx + EH[0] * (cr - .6) + WD[0] * .4, by = wy + EH[1] * (cr - .6) + WD[1] * .4, bu = B.lathe(bx, by, [[.45, ch], [.7, ch + .5], [.62, ch + 1]], { n: 10, role: 'the bucket', lod: 2 });
      B.mark([[bx - EH[0] * .62, by - EH[1] * .62, ch + 1], [bx, by, ch + 1.6], [bx + EH[0] * .62, by + EH[1] * .62, ch + 1]], { on: bu, cls: 'edge', lod: 2 });
      // the trough, along the road on the road side of the curb, and the runnel to it
      const tx = wx + td[0] * (cr + 3), ty = wy + td[1] * (cr + 3), tr = obox(B, tx, ty, R.r(7.5, 9), 2.2, ta, 0, 1.3, { role: 'the trough', lod: 1, crease: .35 });
      for (let k = -1; k <= 1; k++) B.mark([tr.F(k * 2 - .6, 0, 1.3), tr.F(k * 2 + .6, 0, 1.3)], { on: tr, lod: 2 });
      for (const sd of [-.4, .4]) B.mark([[wx + td[0] * cr - td[1] * sd, wy + td[1] * cr + td[0] * sd, -.12], [tx - td[0] * .85 - td[1] * sd, ty - td[1] * .85 + td[0] * sd, -.12]], { on: ap, lod: 2 });
      // the prints of the beasts that came to drink
      for (let k = 0; k < 9; k++) { const a = R() * TAU, rr = R.r(cr + 2, 7), x = wx + cos(a) * rr, y = wy + sin(a) * rr; if (!inPoly(apr, x, y)) continue; B.mark(at(closed(ell(x, y, .36, .28, 6, a)), -.12), { on: ap, lod: 2 }); }
      // who has stopped here: a camel at the trough, or a traveller with his staff
      const side = R.chance(.5) ? 1 : -1, tl = [cos(ta), sin(ta)];
      if (R.chance(.6)) { const q = fitIn(tx + td[0] * 2.6 + tl[0] * side * 2.5, ty + td[1] * 2.6 + tl[1] * side * 2.5, 3.5, 21.5); camel(B, q[0], q[1], 8, { flip: side > 0, load: R.chance(.5), lod: 1 }); }
      else { const q = fitIn(tx + td[0] * 1.8 + tl[0] * side * 4, ty + td[1] * 1.8 + tl[1] * side * 4, 1.5, 21.5); figure(B, q[0], q[1], 6, { staff: true, flip: side > 0, role: 'a traveller', lod: 1 }); }
      // a palm behind the well, now and then
      if (R.chance(.35)) { const q = fitIn(wx - td[0] * R.r(5, 7) + R.r(-2, 2), wy - td[1] * R.r(5, 7) + R.r(-2, 2), 4, 20); palm(B, R, q[0], q[1], R.r(13, 17), { lod: 1 }); }
    }, { tier: 'tile', masks: true, word: 'well' });

    def('t:khan', (R, B, A) => {
      const g = ground(B, 'the khan'), e = roadEdge(A);
      // the gate looks to the road: the face nearest the road edge; else south or east
      const face = e < 0 ? (R.chance(.5) ? 'S' : 'E') : ['E', 'N', 'W', 'W', 'S', 'E'][e];
      let E = R.r(11, 12.2); const ox = R.r(-1, 1), oy = R.r(-1, 1), tr = 2, t = 2.2, H = R.r(5.6, 6.6);
      while (hrMax([[ox - E, oy - E], [ox + E, oy - E], [ox + E, oy + E], [ox - E, oy + E]]) + tr * 1.2 > 22.4) E *= .97;
      const x0 = ox - E, x1 = ox + E, y0 = oy - E, y1 = oy + E;
      const walls = {
        N: B.box(x0, y0, x1, y0 + t, 0, H, { r: .4, b: .5, role: 'the walls of the khan' }),
        W: B.box(x0, y0 + t, x0 + t, y1 - t, 0, H, { r: .4, b: .5, role: 'the walls of the khan' }),
        E: B.box(x1 - t, y0 + t, x1, y1 - t, 0, H, { r: .4, b: .5, role: 'the walls of the khan' }),
        S: B.box(x0, y1 - t, x1, y1, 0, H, { r: .4, b: .5, role: 'the walls of the khan' }),
      };
      // the walls: the courses outside, the slits of the upper rooms, the battlements; the arcades round the court
      for (const [s, w] of Object.entries(walls)) {
        B.crenels({ on: w, every: 1.8, h: .7, sides: s === 'N' || s === 'S' ? 'SN' : 'EW', lod: 2 });
        if (s === 'S' || s === 'E') { B.band(H * .3, { on: w, sides: s, lod: 2 }); if (s !== face) B.windows(s, 4, H * .62, .45, 1.2, { on: w, shape: 'flat', lod: 2 }); }
      }
      B.arcade('S', 5, 0, H * .62, { on: walls.N, lod: 2 }); B.arcade('E', 5, 0, H * .62, { on: walls.W, lod: 2 });
      // the gate: a tall portal block projecting from its wall, the arch of the entrance in its face
      const gw = 3.4, gd = 1.3, GH = H + R.r(2.6, 3.4), gu = R.r(-.2, .2);
      let gb, gp;
      if (face === 'S' || face === 'N') { const gx = ox + gu * E, yy = face === 'S' ? y1 : y0; gb = B.box(gx - gw, face === 'S' ? yy - t - .4 : yy - gd, gx + gw, face === 'S' ? yy + gd : yy + t + .4, 0, GH, { r: .4, b: .5, role: 'the gate of the khan' }); gp = [gx, yy + (face === 'S' ? gd : -gd)]; }
      else { const gy = oy + gu * E, xx = face === 'E' ? x1 : x0; gb = B.box(face === 'E' ? xx - t - .4 : xx - gd, gy - gw, face === 'E' ? xx + gd : xx + t + .4, gy + gw, 0, GH, { r: .4, b: .5, role: 'the gate of the khan' }); gp = [xx + (face === 'E' ? gd : -gd), gy]; }
      B.door(face, .5, 3.1, H * .78, { on: gb, shape: 'pointed', lod: 1 });
      B.panel(face, .14, .86, .4, GH - .7, { on: gb, lod: 2 });
      B.band(GH - 1.1, { on: gb, sides: face, lod: 2 });
      B.crenels({ on: gb, every: 1.6, h: .7, sides: face, lod: 2 });
      // the towers at the corners
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { const tw = B.cyl(x + (x < ox ? .9 : -.9), y + (y < oy ? .9 : -.9), tr, 0, H + 1.6, { n: 12, b: .4, role: 'the towers of the khan', lod: 2 }); hoop(B, tw, tw.cx, tw.cy, tr, H * .5, { n: 14, lod: 2 }); }
      // the way from the gate out to the road: two ruts on the ground, the prints of the camels between them
      const out = face === 'S' ? [0, 1] : face === 'N' ? [0, -1] : face === 'E' ? [1, 0] : [-1, 0];
      const end = e >= 0 ? [NRM[e][0] * 23.4 * K3, NRM[e][1] * 23.4 * K3] : (() => { const k = reach(gp[0], gp[1], out[0], out[1], 23.4); return [gp[0] + out[0] * k, gp[1] + out[1] * k]; })();
      const mid = [gp[0] + out[0] * 3, gp[1] + out[1] * 3];
      const way = spline([gp, mid, end], 5), rb = ribbon(way, 2.6);
      if (hypot(end[0] - gp[0], end[1] - gp[1]) > 2) {
        for (const sd of ['left', 'right']) B.mark(at(rb[sd], 0), { on: g, lod: 1 });
        for (let i = 1; i < way.length - 1; i++) { const p = way[i]; if (hr(p[0], p[1]) > 22) continue; B.mark(at(closed(ell(p[0] + R.r(-.5, .5), p[1] + R.r(-.5, .5), .34, .27, 6, R() * PI)), 0), { on: g, lod: 2 }); }
      }
      // the bales of the caravan by the gate, a camel being unloaded, its driver
      const side = [-out[1], out[0]], bs = R.chance(.5) ? 1 : -1, bx = gp[0] + side[0] * bs * (gw + 2.2) + out[0] * 1.6, by = gp[1] + side[1] * bs * (gw + 2.2) + out[1] * 1.6;
      const bale = obox(B, bx, by, 2.4, 1.5, atan2(side[1], side[0]), 0, 1.4, { role: 'the bales', lod: 1, crease: .2 });
      B.mark([bale.F(0, -.75, 0), bale.F(0, -.75, 1.4)], { on: bale, lod: 2 }); B.mark([bale.F(0, .75, 0), bale.F(0, .75, 1.4)], { on: bale, lod: 2 });
      if (R.chance(.6)) obox(B, bx + side[0] * bs * .2, by + side[1] * bs * .2, 2, 1.3, atan2(side[1], side[0]) + .2, 1.4, 2.6, { role: 'the bales', lod: 2, crease: .2 });
      const cq = fitIn(gp[0] - side[0] * bs * (gw + 3) + out[0] * 3.2, gp[1] - side[1] * bs * (gw + 3) + out[1] * 3.2, 3.5, 21.5);
      camel(B, cq[0], cq[1], 8.4, { flip: R.chance(.5), load: true, lod: 2 });
      figure(B, gp[0] + out[0] * 2.4 + side[0] * bs * 1.4, gp[1] + out[1] * 2.4 + side[1] * bs * 1.4, 5.8, { role: 'the keeper of the khan', flip: R.chance(.5), lod: 2 });
    }, { tier: 'tile', masks: true, word: 'caravanserai' });

    /* a qubba: a whitewashed cube with a battlemented top under a dome, the door on a face in view */
    function qubba(B, R, x, y, s, h, o = {}) {
      const role = o.role || 'a domed tomb', lod = o.lod || 0, door = o.door || 'S';
      const cube = B.box(x - s, y - s, x + s, y + s, 0, h, { r: .35, b: .45, role, lod });
      B.door(door, .5, s * .62, h * .62, { on: cube, shape: 'pointed', lod: 1 });
      B.window(door === 'S' ? 'E' : 'S', .5, h * .45, s * .32, s * .55, { on: cube, shape: 'pointed', lod: 2 });
      B.band(h - .7, { on: cube, sides: 'SE', lod: 2 });
      B.crenels({ on: cube, every: 1.4, h: .55, sides: 'SE', lod: 2 });
      const shape = o.shape || 'round', dr = s * .84, dm = B.dome(x, y, dr, h, { shape, finial: false, role, lod: o.domeLod == null ? lod : o.domeLod });
      const top = h + dr * (shape === 'pointed' ? 1.45 : 1);
      B.mark([[x, y, top], [x, y, top + max(1, dr * .3)]], { on: dm, cls: 'edge', lod: 2 });
      ringMark(B, dm, closed(ell(x, y, dr * .99, dr * .99, 20)).map(p => [p[0], p[1], h + dr * .2]), [x, y], { lod: 2, nz: .2 });
      return cube;
    }
    def('t:tombs', (R, B) => {
      const g = ground(B, 'the graves');
      // the enclosure: a low wall, its foot drawn from afar and its stones up close, an opening on the south
      let wx = R.r(15, 17.5), wy = R.r(13, 15.5); const ox = R.r(-1, 1), oy = R.r(-1, 1);
      while (hrMax([[ox - wx, oy - wy], [ox + wx, oy - wy], [ox + wx, oy + wy], [ox - wx, oy + wy]]) > 22) { wx *= .96; wy *= .98; }
      const x0 = ox - wx, x1 = ox + wx, y0 = oy - wy, y1 = oy + wy, gx = ox + R.r(-wx * .4, wx * .4), t = .7, wh = R.r(1.3, 1.7);
      B.mark([[gx - 1.6, y1, 0], [x0, y1, 0], [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [gx + 1.6, y1, 0]], { on: g, cls: 'mid', lod: 1 });
      for (const [a, b, c, d] of [[x0, y0, x1, y0 + t], [x0, y0 + t, x0 + t, y1 - t], [x1 - t, y0 + t, x1, y1 - t], [x0, y1 - t, gx - 1.6, y1], [gx + 1.6, y1 - t, x1, y1]]) B.box(a, b, c, d, 0, wh, { r: .2, b: 0, top: .06, role: 'the wall of the graves', lod: 2 });
      // the tombs: a greater one behind, one or two lesser ones before it
      const nt = R.chance(.5) ? 2 : 3, flip = R.chance(.5) ? 1 : -1, occ = [];
      const slots = [[-5 * flip, -5, R.r(3.6, 4.3)], [6 * flip, 3, R.r(2.8, 3.3)], [-7 * flip, 7, R.r(2.3, 2.7)]];
      for (let i = 0; i < nt; i++) {
        const [sx, sy, s] = slots[i], x = ox + sx + R.r(-1.5, 1.5), y = oy + sy + R.r(-1.2, 1.2), h = s * R.r(1.45, 1.75);
        qubba(B, R, x, y, s, h, { shape: R.pick(['round', 'round', 'pointed']), door: R.chance(.6) ? 'S' : 'E', lod: i < 2 ? 0 : 1, role: i ? 'a domed tomb' : 'the tomb of the saint' });
        occ.push([x, y, s * 1.6 + 1.2]);
      }
      // a cypress, now and then
      if (R.chance(.4)) { const p = spot(R, occ, 2, 17); if (p) { const ch = R.r(8, 11); B.lathe(p[0], p[1], [[ch * .09, 0], [ch * .13, ch * .22], [ch * .12, ch * .5], [ch * .07, ch * .8], [0, ch]], { n: 10, role: 'the cypress', lod: 1 }); } }
      // the graves in rows, east and west, each a low mound with a stone at its head
      let n = 0;
      for (let y = y0 + 3.2; y < y1 - 4.6; y += 5.2) for (let x = x0 + 2.2 + R.r(0, 1); x < x1 - 1.6; x += R.r(2.6, 3.4)) {
        if (occ.some(([a, b, r]) => abs(x - a) < r && y + 4 > b - r && y < b + r) || R.chance(.25) || n > 16) continue;
        B.mark(at(closed([[x - .6, y + .4], [x + .6, y + .4], [x + .7, y + 3.4], [x - .7, y + 3.4]]), 0), { on: g, lod: n < 5 ? 1 : 2 });
        B.mark([[x - .45, y, 0], [x - .45, y, 1.1], [x, y, 1.4], [x + .45, y, 1.1], [x + .45, y, 0]], { on: g, closed: false, cls: 'edge', lod: 2 });
        n++;
      }
      if (R.chance(.35)) { const p = spot(R, occ, 1.4, 16); if (p) figure(B, p[0], p[1], 5.6, { role: 'a mourner', flip: R.chance(.5), lod: 2 }); }
    }, { tier: 'tile', masks: false, word: 'tombs' });

    /* ======================= the water ======================= */
    /* a long thin streak of foam on a crest, across the eye's view */
    function streak(B, R, x, y, L, W, o = {}) {
      const bow = R.r(-.5, .5), pts = [];
      for (let i = 0; i <= 10; i++) { const t = -1 + 2 * i / 10, w = W / 2 * pow(max(0, 1 - t * t), .7), b = bow * (1 - t * t); pts.push([x + EH[0] * t * L / 2 + WD[0] * (b + w), y + EH[1] * t * L / 2 + WD[1] * (b + w), .02]); }
      for (let i = 9; i > 0; i--) { const t = -1 + 2 * i / 10, w = W / 2 * pow(max(0, 1 - t * t), .7), b = bow * (1 - t * t); pts.push([x + EH[0] * t * L / 2 + WD[0] * (b - w), y + EH[1] * t * L / 2 + WD[1] * (b - w), .02]); }
      return B.plate(pts, { role: o.role || 'the foam', cls: o.cls == null ? 'lo' : o.cls, lod: o.lod || 0 });
    }
    def('t:waves', (R, B) => {
      const g = ground(B, 'the sea'), occ = [];
      // a crest or two of the swell, its foam a long streak across the eye's view
      for (let i = 0, n = R.chance(.5) ? 2 : 3; i < n; i++) { const L = i ? R.r(10, 16) : R.r(18, 26), p = spot(R, occ, L * .45, 21.5) || (i ? null : [R.r(-2, 2), R.r(-2, 2)]); if (p) streak(B, R, p[0], p[1], L, i ? R.r(.9, 1.2) : R.r(1.2, 1.6), { lod: i > 1 ? 1 : 0, cls: '' }); }
      // the waves: humps across the eye's view, the troughs behind them fading
      for (let i = 0, n = R.i(8, 13), placed = 0; i < n * 3 && placed < n; i++) {
        const ws = R.r(3.5, 6), p = spot(R, occ, ws * .55, 21); if (!p) continue;
        const wk = R.pick([1, 2, 2, 3]);
        B.mark(waveAt(p[0], p[1], ws, wk), { on: g, cls: 'mid', lod: placed % 3 === 0 ? 1 : 2 });
        for (const [f, dd] of [[.6, .8], [.3, 1.5]]) B.mark([[p[0] - EH[0] * ws * f / 2 - EU[0] * dd, p[1] - EH[1] * ws * f / 2 - EU[1] * dd, 0], [p[0] + EH[0] * ws * f / 2 - EU[0] * dd, p[1] + EH[1] * ws * f / 2 - EU[1] * dd, 0]], { on: g, lod: 2 });
        placed++;
      }
      // the long swell under them, rows that shorten to nothing at either side
      for (let k = 0, m = R.i(1, 2); k < m; k++) ripples(B, g, R, R.r(-8, 8), R.r(-8, 8), 3, R.r(16, 24), 3.2, 0, { amp: .4, lam: 9 });
      // a whitecap, now and then: the lip of a crest breaking, and its spray
      if (R.chance(.25)) {
        const p = spot(R, occ, 3, 19);
        if (p) {
          const F = (u, z) => [p[0] + EH[0] * u, p[1] + EH[1] * u, z];
          const wc = B.plate([F(-2.6, 0), F(-1.4, .5), F(-.2, 1.1), F(.6, 1.35), F(1.3, 1.05), F(.9, .75), F(1.7, .35), F(2.8, 0)], { role: 'the whitecap', lod: 1 });
          for (const [u, z] of [[.9, 1.7], [1.5, 1.6], [.3, 1.8]]) B.mark([F(u, z), F(u + .2, z + .25)], { on: wc, cls: 'lo', lod: 2 });
        }
      }
    }, { tier: 'tile', masks: false, word: 'sea' });

    /* the band at distances d1..d2 from the land edges of a run of consecutive land edges, from the boundary
       of the hexagon of radius rb at one end of the run to the other (a run of all six closes on itself) */
    function band(run, d1, d2, rb) {
      const line = (i, d) => ({ n: NRM[(i + 6) % 6], c: AP - d }), bound = i => ({ n: NRM[(i + 6) % 6], c: rb * K3 });
      const meet = (a, b) => { const det = a.n[0] * b.n[1] - a.n[1] * b.n[0]; return [(a.c * b.n[1] - b.c * a.n[1]) / det, (a.n[0] * b.c - b.n[0] * a.c) / det]; };
      const side = d => {
        if (run.length === 6) return run.map((i, k) => meet(line(i, d), line(run[(k + 1) % 6], d)));
        const pts = [meet(line(run[0], d), bound(run[0] - 1))];
        for (let k = 0; k + 1 < run.length; k++) pts.push(meet(line(run[k], d), line(run[k + 1], d)));
        pts.push(meet(line(run[run.length - 1], d), bound(run[run.length - 1] + 1)));
        return pts;
      };
      return { a: side(d1), b: side(d2) };
    }
    /* a polyline resampled every step, bent by a swell that vanishes at both ends */
    function wavy(P, step, amp, lam, ph) {
      const seg = []; let tot = 0;
      for (let i = 1; i < P.length; i++) { const l = hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); tot += l; }
      const out = [], n = max(2, round(tot / step));
      for (let k = 0; k <= n; k++) {
        let s = tot * k / n, i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
        const a = P[i], b = P[i + 1], t = seg[i] ? s / seg[i] : 0, dx = (b[0] - a[0]) / (seg[i] || 1), dy = (b[1] - a[1]) / (seg[i] || 1);
        const w = amp * sin(tot * k / n / lam * TAU + ph) * sin(PI * k / n);
        out.push([lerp(a[0], b[0], t) - dy * w, lerp(a[1], b[1], t) + dx * w]);
      }
      return out;
    }
    def('t:shallows', (R, B, A) => {
      const g = ground(B, 'the shallows'), wm = A && A.water != null ? A.water | 0 : 63;
      const land = [0, 1, 2, 3, 4, 5].filter(i => !((wm >> i) & 1));
      // the runs of land edges, each a stretch of coast with its surf
      const runs = [];
      if (land.length === 6) runs.push([0, 1, 2, 3, 4, 5]);
      else if (land.length) { let s = 0; while (land.includes(s)) s++; let cur = null; for (let k = 1; k <= 6; k++) { const i = (s + k) % 6; if (land.includes(i)) { if (!cur) runs.push(cur = []); cur.push(i); } else cur = null; } }
      const d1 = 1.9, d2 = d1 + R.r(1.2, 1.6), rb = 24;
      const fP = (x, y) => { let m = 1e9; for (const i of land) m = min(m, AP - (x * NRM[i][0] + y * NRM[i][1])); return m; };
      for (const run of runs) {
        const { a, b } = band(run, d1, d2, rb);
        // the surf: a band of foam along the coast, its seaward edge scalloped by the breakers
        const sea = wavy(b, .8, .3, 2.6, R() * TAU);
        const pts = run.length === 6 ? [...closed(a), ...closed(sea).reverse()] : [...a, ...sea.slice().reverse()];
        B.plate(at(pts, .02), { role: 'the surf', cls: 'lo', lod: 0 });
        // the lines of the swell coming in, parallel to the coast, shorter and fainter as they go out
        for (const [dd, lo, k0, k1] of [[d2 + 2.4, 1, .04, .96], [d2 + 5.2, 2, .15, .85], [d2 + 8.5, 2, .3, .7]]) {
          const { a: L } = band(run, dd, dd, rb - .6), P = wavy(L, .9, .35, 3.4, R() * TAU), n0 = round(P.length * k0), n1 = round(P.length * k1);
          const Q = run.length === 6 ? P : P.slice(n0, n1);
          if (Q.length > 2) B.mark(at(Q, 0), { on: g, cls: lo === 1 ? 'mid' : 'lo', lod: lo });
        }
      }
      // a sandbar in the shallows, now and then (always where there is no coast to show)
      const occ = [];
      if (!land.length || R.chance(.35)) {
        let p = null;
        for (let t = 0; t < 30 && !p; t++) { const x = R.r(-12, 12), y = R.r(-12, 12); if (hr(x, y) < 13 && (!land.length || fP(x, y) > d2 + 8)) p = [x, y]; }
        if (!p) p = [0, 0];
        const ang = land.length ? atan2(NRM[land[0]][0], -NRM[land[0]][1]) : -PI / 4 + R.r(-.2, .2), L = R.r(9, 14), Wb = R.r(2.2, 3.2), c = cos(ang), s = sin(ang), pts = [];
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, u = cos(a) * L / 2, v = sin(a) * Wb / 2 * (1 + .25 * cos(a * 2)); pts.push([p[0] + u * c - v * s, p[1] + u * s + v * c]); }
        const bar = fitPoly(pts, 21);
        const bp = B.plate(at(bar, .05), { role: 'the sandbar', lod: land.length ? 1 : 0 });
        for (let k = -1; k <= 1; k++) { const u = k * L * .22; B.mark([[p[0] + u * c - Wb * .22 * s, p[1] + u * s + Wb * .22 * c, .05], [p[0] + (u + L * .12) * c - Wb * .22 * s, p[1] + (u + L * .12) * s + Wb * .22 * c, .05]], { on: bp, lod: 2 }); }
        B.mark(at(closed(scl(bar, 1.18, p)), 0), { on: g, cls: 'lo', lod: 2 });
        occ.push([p[0], p[1], L * .6]);
      }
      // the ripples over the sand of the bottom, across the eye's view, away from the surf
      for (let k = 0, m = R.i(2, 3), placed = 0; k < 12 && placed < m; k++) {
        const x = R.r(-14, 14), y = R.r(-14, 14);
        if (hr(x, y) > 17 || (land.length && fP(x, y) < d2 + 6) || occ.some(([a, b, r]) => hypot(x - a, y - b) < r)) continue;
        ripples(B, g, R, x, y, R.i(3, 5), R.r(7, 11), 1.4, 0, { lod1: placed === 0, amp: .25, r: 20 });
        occ.push([x, y, 6]); placed++;
      }
    }, { tier: 'tile', masks: true, word: 'shallows' });
  }
})();
