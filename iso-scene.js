/*
 * ISO.SCENE: the figures, beasts and things a sentence names, standing before its place.
 *
 * The corner of the reader shows the place of the sentence being read as a scene: the
 * place set back on a disc (ISO.compose), and in front of it the people, beasts and
 * objects the sentence names, as in Karagoz, the Ottoman shadow play: flat figures in
 * profile before a set. This file holds:
 *
 *   1. the figures: cut-outs (ISO.prop, meta.kind 'figure'), each one silhouette of at
 *      most three pieces and a few dim inner lines, posed to say who it is;
 *   2. the beasts: cut-outs (meta.kind 'animal');
 *   3. the things: small solids, plates and lines (meta.kind 'object'), cut-outs only for
 *      what is flat by nature (a sword, a key, a scroll);
 *   4. the lexicon: ISO.SCENE.parse(text) finds them in a sentence of Burton's Nights;
 *   5. ISO.SCENE.arrange(items, az) stands them in a row before the place, figures
 *      facing one another; ISO.SCENE.scene(text, base, seed) does all of it at once;
 *   6. window.ISO_SCENE_SAMPLES for the bench (?set=scene).
 *
 * DRAWING. A figure is posed like a puppet, in a 100-unit box: x 0..100 left to right,
 * y 0 at the head and 100 at the feet (y may run above 0 for a tall hat), facing right.
 * Each piece is a list of simple shapes (a skull, a beard, tapered limbs through the
 * joints, a robe given as path data); the cutter traces the outline of their union
 * (marching squares over a distance field) and thins it, once, on first use. The pieces
 * are laid into the kernel's unit box (u = (x - 50) / 100, v = (100 - y) / 100) with
 * w = h * 0.866, so the box keeps its proportions on screen (the camera shortens heights
 * by that much). Inner lines are path data in the same box, drawn dim by the kernel.
 * A figure stands left of the place's middle facing right, right of it facing left.
 *
 * USE in the reader's corner:
 *   const R = ISO.SCENE.reader();                      // one per reading; keeps the cast
 *   const model = ISO.SCENE.scene(sentence, base, seed, { reader: R, az });
 *   // or: items = R.next(sentence, { base }); ISO.compose(base, seed, ISO.SCENE.arrange(items, { az, base, seed }), ...)
 * Pass the azimuth the corner draws at: the row is stood before the place as seen from it.
 */
(() => {
  'use strict';
  const { prop } = ISO;
  const ZF = Math.sqrt(1 - .25); // the camera's shortening of heights at k = 0.5

  /* ---------- paths: SVG path data sampled into point lists ---------- */
  const STEP = 3.6; // design units per sampled segment of a curve
  function parsePath(d) {
    const tk = d.match(/[MmLlHhVvCcSsQqTtZz]|-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g) || [];
    const subs = []; let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, pc = '';
    const num = () => +tk[i++];
    const push = (X, Y) => { const l = cur[cur.length - 1]; if (!l || Math.abs(l[0] - X) > 1e-6 || Math.abs(l[1] - Y) > 1e-6) cur.push([X, Y]); };
    const cubic = (x1, y1, x2, y2, X, Y) => {
      const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(X - x2, Y - y2);
      const n = Math.max(2, Math.min(14, Math.ceil(len / STEP)));
      for (let k = 1; k <= n; k++) { const t = k / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, e = t ** 3; push(a * x + b * x1 + c * x2 + e * X, a * y + b * y1 + c * y2 + e * Y); }
    };
    const quad = (x1, y1, X, Y) => cubic(x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), X + 2 / 3 * (x1 - X), Y + 2 / 3 * (y1 - Y), X, Y);
    while (i < tk.length) {
      if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++];
      const C = cmd.toUpperCase(), rel = cmd !== C;
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; cur = [[x, y]]; subs.push(cur); cmd = rel ? 'l' : 'L'; pc = 'M'; continue; }
      if (C === 'Z') { if (cur) cur.closed = true; x = sx; y = sy; pc = 'Z'; continue; }
      if (C === 'L') { x = ox + num(); y = oy + num(); push(x, y); }
      else if (C === 'H') { x = ox + num(); push(x, y); }
      else if (C === 'V') { y = oy + num(); push(x, y); }
      else if (C === 'C') { const a = ox + num(), b = oy + num(), c = ox + num(), e = oy + num(), X = ox + num(), Y = oy + num(); cubic(a, b, c, e, X, Y); px = c; py = e; x = X; y = Y; pc = 'C'; continue; }
      else if (C === 'S') { const a = pc === 'C' ? 2 * x - px : x, b = pc === 'C' ? 2 * y - py : y, c = ox + num(), e = oy + num(), X = ox + num(), Y = oy + num(); cubic(a, b, c, e, X, Y); px = c; py = e; x = X; y = Y; pc = 'C'; continue; }
      else if (C === 'Q') { const a = ox + num(), b = oy + num(), X = ox + num(), Y = oy + num(); quad(a, b, X, Y); px = a; py = b; x = X; y = Y; pc = 'Q'; continue; }
      else if (C === 'T') { const a = pc === 'Q' ? 2 * x - px : x, b = pc === 'Q' ? 2 * y - py : y, X = ox + num(), Y = oy + num(); quad(a, b, X, Y); px = a; py = b; x = X; y = Y; pc = 'Q'; continue; }
      else { i++; continue; }
      pc = C;
    }
    for (const s of subs) if (s.length > 2) { const a = s[0], b = s[s.length - 1]; if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) s.pop(); }
    return subs;
  }
  const toUV = pts => pts.map(([x, y]) => [(x - 50) / 100, (100 - y) / 100]);
  const f1 = v => Math.round(v * 100) / 100;
  /* a circle as path data (an eye on a peacock's tail, the rim of a shield) */
  const ring = (cx, cy, r) => `M ${cx + r} ${cy} C ${cx + r} ${f1(cy + r * .552)} ${f1(cx + r * .552)} ${cy + r} ${cx} ${cy + r} C ${f1(cx - r * .552)} ${cy + r} ${cx - r} ${f1(cy + r * .552)} ${cx - r} ${cy} C ${cx - r} ${f1(cy - r * .552)} ${f1(cx - r * .552)} ${cy - r} ${cx} ${cy - r} C ${f1(cx + r * .552)} ${cy - r} ${cx + r} ${f1(cy - r * .552)} ${cx + r} ${cy} Z`;

  /* ---------- the cutter: a puppet piece as the outline of a union of simple shapes ----------
   * A piece is a list of shapes in the 100-unit box: circles, ellipses, tapered limbs, polygons
   * (from points or from path data), each a signed distance (negative inside). Their union, less
   * any shape marked `cut`, and softened where a shape asks (`k`), is sampled on a half-unit grid
   * and its outline traced (marching squares), then thinned (Douglas-Peucker). So a figure is
   * posed by its joints, like a puppet, and its silhouette comes out smooth. */
  const hyp = Math.hypot;
  function Fr(x = 0, y = 0, k = 1, a = 0, m = false) { const r = a * Math.PI / 180; return { x, y, k, a, c: Math.cos(r), s: Math.sin(r), m }; }
  const ID = Fr();
  const T = (F, x, y) => { if (F.m) x = -x; return [F.x + F.k * (x * F.c - y * F.s), F.y + F.k * (x * F.s + y * F.c)]; };
  /* circle */
  function Ci(x, y, r, F = ID) { const [cx, cy] = T(F, x, y), R = r * F.k; return { d: (px, py) => hyp(px - cx, py - cy) - R, b: [cx - R, cy - R, cx + R, cy + R] }; }
  /* ellipse, turned by rot degrees */
  function El(x, y, rx, ry, rot = 0, F = ID) {
    const [cx, cy] = T(F, x, y), a = ((F.m ? -rot : rot) + (F.m ? -F.a : F.a)) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), RX = rx * F.k, RY = ry * F.k, mn = Math.min(RX, RY), M = Math.max(RX, RY);
    return { d: (px, py) => { const dx = px - cx, dy = py - cy, u = dx * c + dy * s, v = -dx * s + dy * c; return (hyp(u / RX, v / RY) - 1) * mn; }, b: [cx - M, cy - M, cx + M, cy + M] };
  }
  /* a limb: a capsule tapering from radius r1 at (x1, y1) to r2 at (x2, y2) */
  function Li(x1, y1, r1, x2, y2, r2, F = ID) {
    const [ax, ay] = T(F, x1, y1), [bx, by] = T(F, x2, y2), R1 = r1 * F.k, R2 = r2 * F.k, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, M = Math.max(R1, R2);
    return { d: (px, py) => { let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return hyp(px - ax - dx * t, py - ay - dy * t) - (R1 + (R2 - R1) * t); }, b: [Math.min(ax, bx) - M, Math.min(ay, by) - M, Math.max(ax, bx) + M, Math.max(ay, by) + M] };
  }
  /* a chain of limbs through [x, y, r] joints */
  const Ch = (pts, F = ID) => pts.slice(1).map((p, i) => Li(pts[i][0], pts[i][1], pts[i][2], p[0], p[1], p[2], F));
  /* a polygon: an array of [x, y] or SVG path data (absolute or relative) */
  function Po(src, F = ID) {
    let pts = typeof src === 'string' ? (parsePath(src)[0] || []) : src;
    pts = pts.map(([x, y]) => T(F, x, y));
    const n = pts.length; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { d: (px, py) => {
      let best = 1e9, inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-9;
        let t = ((px - ax) * ex + (py - ay) * ey) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dd = (px - ax - ex * t) ** 2 + (py - ay - ey * t) ** 2; if (dd < best) best = dd;
        if (((ay > py) !== (by > py)) && (px < ex * (py - ay) / (ey || 1e-9) + ax)) inside = !inside;
      }
      return inside ? -Math.sqrt(best) : Math.sqrt(best);
    }, b: [x0, y0, x1, y1] };
  }
  const cut = p => Object.assign(p, { cut: true });
  const soft = (p, k) => Object.assign(p, { k });
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };

  function field(prims) {
    const fl = prims.flat(Infinity);
    return (x, y) => {
      let d = 1e9;
      for (const p of fl) {
        const b = p.b, ox = Math.max(b[0] - x, 0, x - b[2]), oy = Math.max(b[1] - y, 0, y - b[3]), far = hyp(ox, oy);
        if (p.cut) { if (far > 0) continue; d = Math.max(d, -p.d(x, y)); continue; }
        const v = far > 6 ? far : p.d(x, y);
        d = p.k ? smin(d, v, p.k) : Math.min(d, v);
      }
      return d;
    };
  }
  /* trace(prims, step): the outlines of the union, as closed point lists in the 100-unit box. */
  function trace(prims, g = .5, tol = .2) {
    const fl = prims.flat(Infinity).filter(p => !p.cut);
    let X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
    for (const p of fl) { X0 = Math.min(X0, p.b[0]); Y0 = Math.min(Y0, p.b[1]); X1 = Math.max(X1, p.b[2]); Y1 = Math.max(Y1, p.b[3]); }
    X0 -= 2; Y0 -= 2; X1 += 2; Y1 += 2;
    const f = field(prims), nx = Math.ceil((X1 - X0) / g) + 1, ny = Math.ceil((Y1 - Y0) / g) + 1, V = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = f(X0 + i * g, Y0 + j * g); V[j * nx + i] = v === 0 ? 1e-6 : v; }
    const H = (i, j) => (j * nx + i) * 2, Vk = (i, j) => (j * nx + i) * 2 + 1;
    const pt = key => { const e = key & 1, idx = key >> 1, i = idx % nx, j = (idx / nx) | 0, a = V[idx], b = e ? V[idx + nx] : V[idx + 1], t = a / (a - b); return e ? [X0 + i * g, Y0 + (j + t) * g] : [X0 + (i + t) * g, Y0 + j * g]; };
    /* each segment runs with the inside on its right, so every edge point has one way in and one
       way out and the loops close (corners a top-left, b top-right, c bottom-right, d bottom-left) */
    const next = new Map();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = V[j * nx + i], b = V[j * nx + i + 1], c = V[(j + 1) * nx + i + 1], d = V[(j + 1) * nx + i];
      const k = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const Te = H(i, j), Be = H(i, j + 1), Le = Vk(i, j), Re = Vk(i + 1, j), s = (p, q) => next.set(p, q);
      const mid = (a + b + c + d) / 4 < 0;
      switch (k) {
        case 1: s(Le, Be); break; case 14: s(Be, Le); break;
        case 2: s(Be, Re); break; case 13: s(Re, Be); break;
        case 4: s(Re, Te); break; case 11: s(Te, Re); break;
        case 8: s(Te, Le); break; case 7: s(Le, Te); break;
        case 3: s(Le, Re); break; case 12: s(Re, Le); break;
        case 6: s(Be, Te); break; case 9: s(Te, Be); break;
        case 5: if (mid) { s(Le, Te); s(Re, Be); } else { s(Re, Te); s(Le, Be); } break;
        case 10: if (mid) { s(Te, Re); s(Be, Le); } else { s(Te, Le); s(Be, Re); } break;
      }
    }
    const loops = [], seen = new Set();
    for (const k0 of next.keys()) {
      if (seen.has(k0)) continue;
      const loop = []; let k = k0, guard = 0;
      while (k != null && !seen.has(k) && guard++ < 1e6) { seen.add(k); loop.push(pt(k)); k = next.get(k); }
      if (loop.length > 4 && k === k0) loops.push(loop);
    }
    const area = l => { let s = 0; for (let i = 0, j = l.length - 1; i < l.length; j = i++) s += (l[j][0] - l[i][0]) * (l[j][1] + l[i][1]); return s / 2; };
    let big = 0; for (const l of loops) if (Math.abs(area(l)) > Math.abs(big)) big = area(l);
    return loops.filter(l => Math.sign(area(l)) === Math.sign(big) && Math.abs(area(l)) > 1.5).map(l => thin(l, tol));
  }
  /* Douglas-Peucker on a closed loop */
  function thin(l, tol) {
    const n = l.length; if (n < 8) return l;
    let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = hyp(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (d > fd) { fd = d; far = i; } }
    const dp = pts => {
      if (pts.length < 3) return pts;
      const a = pts[0], b = pts[pts.length - 1], ex = b[0] - a[0], ey = b[1] - a[1], L = hyp(ex, ey) || 1e-9;
      let mi = 0, md = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * ey - (pts[i][1] - a[1]) * ex) / L; if (d > md) { md = d; mi = i; } }
      if (md <= tol) return [a, b];
      const L1 = dp(pts.slice(0, mi + 1)), L2 = dp(pts.slice(mi));
      return L1.slice(0, -1).concat(L2);
    };
    const A = dp(l.slice(0, far + 1)), B = dp(l.slice(far).concat([l[0]]));
    return A.slice(0, -1).concat(B.slice(0, -1)).map(p => [f1(p[0]), f1(p[1])]);
  }

  /* ---------- a puppet ----------
   * def: { pieces: [ () => [shapes], ... ], lines: [path data, ...] }, made once on first use.
   * The pieces are drawn in order, a later one over the earlier (the near arm over the body). */
  function shape(def) {
    if (def._s) return def._s;
    const s = { polys: [], lines: [] };
    for (const mk of def.pieces) for (const poly of trace(typeof mk === 'function' ? mk() : mk, def.g || .5, def.tol || .3)) s.polys.push(toUV(poly));
    for (const d of def.lines || []) for (const sub of parsePath(d)) if (sub.length > 1) s.lines.push(toUV(sub.closed ? sub.concat([sub[0]]) : sub));
    return (def._s = s);
  }
  /* ---------- where a puppet stands and faces ----------
   * The scene is seen from azimuth AZ (45, the reader's corner, unless arrange() was told
   * otherwise). The place stands at (0, -18); a figure left of its middle faces right, one right
   * of it faces left, so two figures face one another and one alone faces the middle. */
  const S = { az: 45 };
  const axes = az => { const r = az * Math.PI / 180; return { c: Math.cos(r), s: Math.sin(r) }; };
  const lateral = (x, y, az = S.az) => { const { c, s } = axes(az); return x * c - y * s; };
  const depth = (x, y, az = S.az) => { const { c, s } = axes(az); return x * s + y * c; };
  const worldAt = (a, d, az = S.az) => { const { c, s } = axes(az); return [a * c + d * s, -a * s + d * c]; };
  const PLACE = [0, -18];
  const facesLeft = (x, y) => lateral(x, y) > lateral(PLACE[0], PLACE[1]) + 2;
  /* The kernel's default slots bunch up on the left at azimuth 45; a prop handed one of them
     stands instead in a row before the place: slot 0 left of the middle, 1 right of it, 2 in
     the middle a step nearer, 3 and 4 further out, 5 behind on the left. So a list given to
     compose as [figure, figure, thing, thing, thing] stands as arrange() would stand it. */
  const KSLOTS = [[-22, 30], [10, 34], [32, 16], [-40, 10], [40, -6], [-6, 44]];
  const ROW = [[-17, 0], [17, 0], [0, 9], [-37, 6], [37, 6], [-52, -4]];
  function restSpot(x, y) {
    const i = KSLOTS.findIndex(q => q[0] === x && q[1] === y); if (i < 0) return [x, y];
    const a0 = lateral(PLACE[0], PLACE[1]), d0 = depth(PLACE[0], PLACE[1]) + 54;
    return worldAt(a0 + ROW[i][0], d0 + ROW[i][1]);
  }
  function puppet(B, x, y, s, def, o = {}) {
    const sh = shape(def), h = s * (o.H || 1);
    const flip = o.flip != null ? o.flip : (o.fixed ? false : facesLeft(x, y));
    return B.cut(sh.polys, x, y, (o.z || 0) + (o.zs || 0) * s, h, { w: h * ZF, flip, lines: sh.lines.length ? sh.lines : null, role: o.role, lod: o.lod || 0 });
  }
  const FIG = {};
  const figure = (name, role, def, o = {}) => {
    FIG[name] = def;
    prop(name, (R, B, x, y, s) => { [x, y] = restSpot(x, y); return puppet(B, x, y, s, def, Object.assign({ role }, o)); }, { kind: o.kind || 'figure', role, H: o.H || 1, has: o.has || [], w: o.w });
  };

  /* ---------- the body parts ----------
   * All in the 100-unit box, the figure facing right. A head is written about the middle of the
   * skull; F = Fr(x, y, k, a) places it (k its size, a its tilt in degrees). */
  function headParts(F, face = 'beard', hat = 'turban') {
    const P = [Ci(0, 0, 7, F), El(3.6, 3.6, 5.6, 6.2, 0, F), Po([[6.6, -1.6], [13.2, 5.2], [11.8, 6.2], [8, 6.2]], F), Li(.6, 6, 3.9, 1.4, 14, 4.6, F)];
    P.push(cut(Ci(9.6, -.4, 1.5, F)));
    if (face === 'beard') P.push(Po('M 2.4 6.4 L 10.6 7.4 C 11.8 10 11.6 13 11 15 L 9.4 21 C 7.4 18 5.4 16 3.6 13.6 Z', F));
    if (face === 'short') P.push(Po('M 2.4 6.4 L 10.6 7.4 C 11.8 9.6 11.4 12.4 10.2 13.8 C 7.8 14.6 5 13.6 3 11.6 Z', F));
    if (face === 'bare') P.push(Po([[7.4, 6.6], [10.4, 7.4], [9.4, 10.6], [6, 11]], F));
    if (face === 'hook') P.push(Po([[6.6, -1.6], [14.6, 7.6], [12.4, 8], [8, 6.2]], F), Po([[6, 9], [11.6, 11.6], [9, 12.4], [4, 11]], F));
    if (face === 'veil') P.push(Po('M 6.6 3 L 11.6 3.4 C 12.2 7 11.4 10 9.6 12.6 L 4 15.6 L 1.6 10 Z', F));
    if (face === 'mask') P.push(Po('M 4 1.6 L 12.6 2.6 C 13.2 6 12.4 9.4 10 12 L 3 14 L 0 8 Z', F));
    if (hat === 'turban' || hat === 'tall' || hat === 'crown') P.push(El(-.8, -6.8, 11.6, 7.8, -6, F), El(5.6, -4.6, 5.6, 4.2, -20, F));
    if (hat === 'small') P.push(El(-.6, -5.6, 9.6, 6.2, -6, F), El(5, -3.8, 4.4, 3.4, -20, F));
    if (hat === 'cap') P.push(El(-.6, -3.6, 8, 5.6, -8, F));
    if (hat === 'tall') P.push(Po('M -6 -12 L 5.2 -12.6 C 4.4 -20 2.6 -28 -.2 -36 C -2.8 -28 -5 -20 -6 -12 Z', F), Ci(-.2, -35.4, 1.3, F));
    if (hat === 'crown') P.push(Po([[-9.4, -10], [-10.6, -23], [-5, -16.6], [-.4, -27], [4.4, -16.6], [10, -23], [9.2, -10]], F));
    if (hat === 'kalpak') P.push(Po('M -8.6 -5 C -9.4 -14 -9.4 -23 -8 -28.6 C -2.4 -30.6 4.4 -30.6 8.8 -28.6 C 10.2 -23 10 -14 8.8 -5 Z', F));
    if (hat === 'onion') P.push(El(-.4, -10, 10.4, 11.6, 0, F), El(5, -4.6, 5.2, 4, -20, F), Ci(-.4, -22, 1.6, F));
    if (hat === 'helmet') P.push(Po('M -9 -2.6 C -9.6 -10 -6 -15.6 0 -16.6 C 6 -15.6 9.6 -10 9 -2.6 Z', F), Li(0, -16, 1.4, 0, -24, .6, F), Po('M -9 -4 L -3 -3 L -4 10 L -11 8 Z', F));
    if (hat === 'kufiya') P.push(Po('M 9.4 -2 C 10 -8 6 -12.4 0 -12.6 C -6.6 -12.4 -9.6 -8 -10 -2 C -10.6 6 -12 13 -14 19 L -4 18 L -2.4 8 L 5 -1.6 Z', F));
    if (hat === 'hood') P.push(Po('M 10.4 0 C 11 -8 6 -12.6 0 -12.8 C -7 -12.6 -11 -7 -11.4 0 L -12 14 L 0 14 L 4 4 Z', F));
    if (hat === 'scarf') P.push(El(-.6, -3.8, 8.4, 6, -8, F), Ci(-8.6, -3, 2.6, F), Li(-9, -2, 1.4, -14, 5, .8, F), Li(-9, -2, 1.2, -12.4, 7.6, .7, F));
    if (hat === 'bald') { /* the shaven head is the skull itself */ }
    return P;
  }
  /* an arm from the shoulder through the elbow to the wrist; the hand a fist, an open palm or none;
     a wide sleeve hangs from the forearm as a bell. */
  function armParts(sh, el, wr, o = {}) {
    const P = [Li(sh[0], sh[1], o.r || 4.4, el[0], el[1], 3.7), Li(el[0], el[1], 3.6, wr[0], wr[1], o.cuff || 3)];
    const dx = wr[0] - el[0], dy = wr[1] - el[1], L = hyp(dx, dy) || 1, ux = dx / L, uy = dy / L;
    if (o.hand !== 'none') {
      if (o.hand === 'open') P.push(Po([[wr[0] - uy * 2.4, wr[1] + ux * 2.4], [wr[0] + ux * 6.6 - uy * 1.6, wr[1] + uy * 6.6 + ux * 1.6], [wr[0] + ux * 7.2 + uy * 1, wr[1] + uy * 7.2 - ux * 1], [wr[0] + uy * 2.4, wr[1] - ux * 2.4]]), Li(wr[0], wr[1], 1.2, wr[0] + ux * 2 + uy * 3.6, wr[1] + uy * 2 - ux * 3.6, 1));
      else P.push(Ci(wr[0] + ux * 2.6, wr[1] + uy * 2.6, o.fist || 2.9));
    }
    if (o.sleeve) { const w = o.sleeve; P.push(Po([[el[0] - uy * 3, el[1] + ux * 3], [wr[0] - ux * 1 + uy * 1, wr[1] - uy * 1 - ux * 1], [wr[0] - ux * 1 - uy * w * .5, wr[1] - uy * 1 + ux * w * .5], [wr[0] - ux * 5 - uy * w, wr[1] - uy * 5 + ux * w], [el[0] - ux * 2 - uy * 4, el[1] - uy * 2 + ux * 4]])); }
    return P;
  }
  /* a leg from the hip through the knee to the ankle, the foot pointing along +x (or -x with back). */
  function legParts(hip, kn, an, o = {}) {
    const dir = o.back ? -1 : 1, toe = o.toe || 7;
    return [Li(hip[0], hip[1], o.r || 5, kn[0], kn[1], 3.8), Li(kn[0], kn[1], 3.6, an[0], an[1], 2.4), Po([[an[0] - 2.6 * dir, an[1] - 1.6], [an[0] + 1.6 * dir, an[1] - 2.4], [an[0] + toe * dir, 99], [an[0] + (toe + 1.6) * dir, 97.6], [an[0] + (toe + 1) * dir, 100], [an[0] - 3 * dir, 100]])];
  }

  /* =====================================================================
   * 1. THE FIGURES. Each faces right; the comment says what makes it itself.
   * ===================================================================== */
  const SLIPPER = x => Po([[x - 2, 95.4], [x + 3, 95.4], [x + 9, 98.6], [x + 10, 96.8], [x + 9.8, 100], [x - 2, 100]]);
  const ROBE = 'M 44 25 C 39 27 37 32 36.8 40 C 36.4 56 34.4 78 29 99.6 L 64 99.6 C 62.6 84 61.6 66 61.6 52 C 61.6 44 61.4 37 58.6 31 C 56.6 27.6 53 25.6 50 25 Z';
  const SHOULDER = () => El(49, 33, 11, 7);
  const EYE = (x, y) => `M ${x - 1.2} ${y} L ${x + 1.2} ${y - .2}`;
  const SASH = 'M 37.6 52 C 46 53.6 54 53.8 61.6 52.4', FOLD = 'M 59.6 56 C 59 70 60.6 84 63.4 98';

  /* The Caliph, Harun al-Rashid: the tall cap of the Abbasids rising from a great turban, a long
     beard, his right hand raised in its wide sleeve, a robe that trails behind. */
  figure('caliph', 'the Caliph', {
    pieces: [
      () => [headParts(Fr(51, 16, 1.06), 'beard', 'tall'), Po('M 44 25 C 39 27 36.6 32 36.4 40 C 35.6 56 32 78 25 99.6 L 64 99.6 C 62.6 84 61.6 66 61.6 52 C 61.6 44 61.4 37 58.6 31 C 56.6 27.6 53 25.6 50 25 Z'), SHOULDER(), SLIPPER(60)],
      () => [armParts([50, 32], [59, 45], [67, 31], { hand: 'open', sleeve: 9 })],
    ],
    lines: ['M 39.6 10.6 C 46 12.8 55 12.6 62 10', SASH, FOLD, EYE(58.6, 15.6)],
  }, { H: 1.04 });

  /* The King: a round turban crowned with three points, a mantle flaring behind, the sceptre. */
  figure('king', 'the King', {
    pieces: [
      () => [headParts(Fr(51, 16, 1.06), 'beard', 'crown'), Po(ROBE), SHOULDER(), Po('M 47 25 C 40 26 36 32 34 42 C 31 58 27 80 21 99.6 L 46 99.6 L 46 36 Z'), SLIPPER(60)],
      () => [Li(71, 22, 1.3, 71.4, 95, 1.3), Ci(71, 19, 3.6), Li(71, 15.6, .8, 71, 12, .8)],
      () => [armParts([50, 32], [52, 48], [67, 46], { sleeve: 5 })],
    ],
    lines: ['M 40.6 5 C 47 7 55 7 61.4 4.6', 'M 46.6 27 C 41 46 37.4 72 34 99', SASH, FOLD, EYE(58.6, 15.6)],
  }, { H: 1.06 });

  /* The Wazir (Ja'afar the Barmecide): the tall round hat of office, a long beard, the scroll of
     the state held up before him. */
  figure('wazir', 'the Wazir', {
    pieces: [
      () => [headParts(Fr(51, 16, 1.06), 'beard', 'kalpak'), Po(ROBE), SHOULDER(), SLIPPER(60)],
      () => [Li(59.6, 38.6, 2.2, 75, 38.6, 2.2), Po([[61.6, 38.6], [73, 38.6], [73, 64], [61.6, 64]]), Li(59.6, 64, 2.2, 75, 64, 2.2)],
      () => [armParts([50, 32], [51, 47], [61, 40], {})],
    ],
    lines: ['M 42 0 L 60.6 -4.4', 'M 42.4 4 L 60.4 -.2', SASH, FOLD, EYE(58.6, 15.6), 'M 64 46 L 70.6 46', 'M 64 52 L 70.6 52'],
  }, { H: 1.02 });

  /* The Merchant: a full belly under the sash, a broad turban, the purse held out on its string. */
  figure('merchant', 'the merchant', {
    pieces: [
      () => [headParts(Fr(51, 18, 1.06), 'short', 'turban'), Po(ROBE), SHOULDER(), El(57, 60, 10.6, 13), SLIPPER(60)],
      () => [Li(68.4, 52, .9, 68.4, 56, .9), El(68.4, 62, 5.4, 6.2), El(68.4, 56.6, 2.6, 1.4)],
      () => [armParts([50, 33], [52, 48], [65.6, 48], {})],
    ],
    lines: ['M 39.6 12.6 C 46 14.8 55 14.6 62 12', 'M 39.2 7.6 C 45.4 10.4 54.6 10.2 61.6 6.6', 'M 37 50 C 46 52.6 56 53 65.6 50', FOLD, EYE(58.6, 17.6)],
  });

  /* The Fisherman (Khalifah): skirts tucked up, legs set wide in the shallows, leaning into the
     cast; the net flies open from his hands, its hem hung with weights. */
  figure('fisherman', 'the fisherman', {
    pieces: [
      () => [headParts(Fr(58, 22, 1.04, 6), 'short', 'cap'),
        Po('M 52 30 C 46 32 42 40 41 50 C 40 58 39.6 66 39 72 C 46 74 58 74 66 71 C 65.4 62 65.4 52 64.6 44 C 63.6 38 61 33 57 30 Z'),
        legParts([47, 68], [43, 82], [38, 96], { back: true }), legParts([57, 68], [62, 82], [63, 96])],
      () => {
        const cx = 76, cy = 26, r = 24, P = [armParts([55, 34], [63, 37], [71, 28], { hand: 'none' })];
        const pts = [[71, 26]]; for (let i = 0; i <= 30; i++) { const a = (-50 + i * 100 / 30) * Math.PI / 180, rr = r + Math.sin(i / 30 * Math.PI) * 2; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
        P.push(Po(pts)); for (let i = 0; i <= 5; i++) { const a = (-50 + i * 20) * Math.PI / 180, rr = r + Math.sin((i * 20) / 100 * Math.PI) * 2; P.push(Ci(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 1.6)); }
        return P;
      },
    ],
    lines: ['M 74 26 L 96.6 18', 'M 74 26 L 97 34', 'M 84 12 Q 89 26 84 40', 'M 91 10 Q 97 26 91 43', 'M 40 62 C 48 63.6 57 63.6 65.6 61.6', EYE(65.4, 21.4)],
  }, { has: ['net'] });

  /* The Porter, the hammal of Baghdad: bent under the great crate on his back, a short staff in his
     fist, his legs mid-stride. */
  figure('porter', 'the porter', {
    pieces: [
      () => [Po('M 22 8 C 33 4.6 48 3.6 59 6.4 L 56.4 19 C 54.6 32 51.6 44 46.6 52 C 40 54 34 53 29.4 50.4 C 26.4 38 23.4 22 22 8 Z'), El(40.6, 5.6, 18.6, 2.6, -3)],
      () => [headParts(Fr(65, 32, 1.04, 14), 'short', 'cap'),
        Po('M 59 37 C 52 38 46 44 44 52 C 42 60 41.6 66 41.4 71 C 48 73 58 73 66 70.4 C 66.4 62 67.6 54 67.6 47 C 67 42 64 39 59 37 Z'),
        legParts([49, 68], [45, 82], [40, 96], { back: true }), legParts([59, 68], [63, 82], [64, 96])],
      () => [armParts([60, 42], [64, 56], [74, 52], {}), Li(76.6, 47, 1.3, 81, 99.6, 1.3)],
    ],
    lines: ['M 24 19 C 34 18 45 18.4 55.6 20', 'M 25.6 31 C 35 31 44 31.6 53 33', 'M 27.4 43 C 35 43.6 42 44 49.4 44.6', 'M 36.6 6 L 38.6 52.6', 'M 48.6 5.6 L 49.6 48', 'M 56 19 C 60.6 22 63 26 64 28', 'M 42 62 C 49 63 57 63 66 61.4', EYE(72.4, 32.6)],
  }, { has: ['basket'] });

  /* The Lady: wrapped head to foot in the izar, the wrap rising over her crown and falling down her
     back to trail behind, her face veiled below the eyes, a hand gathering the wrap. */
  figure('lady', 'the lady', {
    pieces: [
      () => [headParts(Fr(55, 17.4, .92), 'veil', 'none'),
        Po('M 55 5.4 C 48 5.4 43.4 9.6 42.4 16.6 C 41 27 37.6 40 35 54 C 32 70 25 88 13 99.6 L 66 99.6 C 64.6 88 62.4 76 61.4 64 C 60.6 56 61.2 48 61.4 42 C 61.6 36 60 31.4 58.6 28.4 C 61 25 62.4 20.6 62.2 15.6 C 62 9.6 59.4 5.4 55 5.4 Z'), SLIPPER(58)],
      () => [armParts([51.6, 34], [53.6, 47], [60.6, 40.6], { fist: 2.4, sleeve: 5, cuff: 2.6, r: 3.8 })],
    ],
    lines: ['M 62 14.6 C 57.4 14 53.4 16 51.4 20 C 49.6 24 50 28.4 51.6 31.6', 'M 43.6 17 C 40.6 38 36.6 68 32 99', 'M 52.6 60 C 54.6 72 56 86 58 99', EYE(60.4, 17.2), 'M 40.6 52 C 46 53.4 54 53.4 61 52'],
  });

  /* The singing girl: seated cross-legged on her cushion, her hair falling loose down her back,
     the lute in her lap with its neck raised and its pegbox bent back. */
  figure('singer', 'the singing girl', {
    pieces: [
      () => [headParts(Fr(51, 28, .96), 'bare', 'cap'), Po('M 44 21 C 41 28 39 36 38.6 46 L 44 46 L 45 30 Z'),
        Po('M 46 36 C 41 38 39 44 39 52 C 39 60 40.6 68 42 76 C 34 79 27 87 24 99.6 L 79 99.6 C 80.6 96 79 93 75 92 L 66 90 C 66 84 63 78 60.6 74 C 61 66 61.6 56 60.6 48 C 60 42 57 38 53 36 Z'), El(51, 97, 29, 3.6)],
      () => [El(55.6, 74.6, 9.6, 7.8, -28), Li(60.6, 70.6, 1.9, 84.6, 54.6, 1.4), Li(84.4, 54.6, 1.7, 89.4, 58.4, 1.2)],
      () => [armParts([50.6, 40], [49.6, 56], [55.6, 66], { fist: 2.4, cuff: 2.6, r: 3.6 })],
    ],
    lines: ['M 50.4 76.6 Q 51.6 74 54.4 75.4 Q 55.6 78 53 79.2 Q 50.6 79.4 50.4 76.6', 'M 57.6 71 L 84.6 53.6', 'M 26 95 C 44 94 60 94 77 94', EYE(57.4, 27.6)],
  }, { H: 0.8, has: ['lute'] });

  /* The old man, the Shaykh: bowed with years, a long pointed beard, a turban, and a staff taller
     than his stoop, gripped before him. */
  figure('oldman', 'the old man', {
    pieces: [
      () => [headParts(Fr(57, 25, 1.04, 14), 'beard', 'small'), Po('M 50 30 C 42 31 38 38 37.6 48 C 37 62 35 80 31 99.6 L 64 99.6 C 63 86 63 70 64 58 C 64.6 48 63.6 40 59 34 C 56.6 31 53.6 30 50 30 Z'), SLIPPER(60)],
      () => [Li(73.6, 36, 1.4, 75.6, 99.6, 1.3), Ci(73.4, 35, 2.2)],
      () => [armParts([54, 36], [57, 51], [70.4, 48], { sleeve: 5 })],
    ],
    lines: ['M 38.4 58 C 46 59.6 54 59.8 64 58.4', 'M 62.6 62 C 62 74 63 86 65.4 98', EYE(64, 25.4)],
  }, { H: 0.96 });

  /* The youth: slender, beardless, a small turban whose end hangs behind him, a short coat to the
     knee over trousers and soft boots, a hand set on his hip. */
  figure('youth', 'the youth', {
    pieces: [
      () => [headParts(Fr(51, 17, 1), 'bare', 'small'), Ch([[43, 12, 2], [39, 18, 1.8], [37.6, 26, 1.4], [39, 33, .9]]),
        Po('M 45 25 C 41 27 40 33 40.4 42 C 40.6 52 39.6 62 38.6 74 L 62 74 C 61 64 60.6 52 60.4 42 C 60.2 34 58 28 54 25.6 Z'),
        legParts([45, 70], [45.6, 84], [44.6, 96]), legParts([55, 70], [56, 84], [56.6, 96])],
      () => [armParts([49, 31], [40.6, 44], [48, 52], { hand: 'none', r: 3.8, cuff: 2.6 }), Ci(50, 52.6, 2.6)],
    ],
    lines: ['M 41.6 9.6 C 47.6 11.4 54 11.4 60 9.4', 'M 40.6 50 C 47 51.4 54 51.4 60.6 50', 'M 50.6 30 C 53 44 54.6 58 56 74', EYE(58.4, 16.6)],
  }, { H: 0.95 });

  /* The Kalandar: the wandering dervish, shaven of head, beard and brows, blind of one eye under its
     patch; his robe hangs in rags and he holds out the boat-shaped begging bowl. */
  figure('kalandar', 'the Kalandar', {
    pieces: [
      () => [headParts(Fr(51, 18, 1.04), 'bare', 'bald'),
        Po('M 44 26 C 39 28 37.6 33 37.4 41 C 37 56 35.6 76 33 96 L 36.6 100 L 39.6 95.4 L 43 100 L 46.6 95.6 L 50 100 L 53.6 95.4 L 57 100 L 60.4 95.6 L 63.6 99.6 L 66 96 C 64 84 62 66 61.6 52 C 61.4 44 61.4 37 58.6 31 C 56.6 28 53 26 50 26 Z'), SHOULDER()],
      () => [Po('M 63 41 C 68 43 76 43 82 40 C 81.4 45.6 77.4 49.6 71 49.8 C 65.6 50 62.6 46 63 41 Z')],
      () => [armParts([50, 33], [52, 48], [63, 45], {})],
    ],
    lines: ['M 61.6 13.6 L 43.6 22', 'M 57.6 16.6 L 61.4 16.4 L 61 20 L 57.8 20 Z', 'M 41.4 62 L 46.6 62.4 L 46.4 68 L 41.2 67.6 Z', 'M 52 78 L 57.6 77.6 L 58 83.6 L 52.4 84 Z', 'M 64.6 45 C 70 46.6 75.6 46 80.6 43.6'],
  });

  /* The physician (the sage Duban): the scholar's shawl laid over his turban and down his back;
     he holds the flask up before his eyes to read it. */
  figure('physician', 'the physician', {
    pieces: [
      () => [headParts(Fr(51, 16, 1.06), 'beard', 'turban'), Po('M 45 6 C 39 8 36 14 35.6 22 C 35.4 30 36 36 37 40 L 45 36 L 46 20 Z'), Po(ROBE), SHOULDER(), SLIPPER(60)],
      () => [Li(69.6, 8, 1.2, 69.8, 16, 1.2), El(69.8, 7.6, 2.2, .9), Ci(70, 21, 4.8)],
      () => [armParts([50, 32], [58, 42], [67, 18], { sleeve: 6 })],
    ],
    lines: ['M 39.6 10.6 C 46 12.8 55 12.6 62 10', SASH, FOLD, EYE(58.6, 15.6), 'M 65.6 22 L 74.4 22'],
  });

  /* The barber of Baghdad: a short robe and an apron; he holds his astrolabe up high by its ring to
     take the height of the sun, his head thrown back to watch it. */
  figure('barber', 'the barber', {
    pieces: [
      () => [headParts(Fr(51.4, 19, 1.04, -10), 'short', 'small'), Po('M 44 28 C 39 30 37.6 35 37.4 43 C 37 58 36 78 33 99.6 L 63 99.6 C 62 84 61.6 68 61.6 54 C 61.6 46 61.4 40 58.6 34 C 56.6 30 53 28 50 28 Z'), El(49, 35, 11, 7), SLIPPER(58)],
      () => [armParts([51, 34], [63, 26], [72, 9], { sleeve: 5 })],
      () => [Ci(77, 17, 7), Ci(75, 8.6, 2.2), cut(Ci(75, 8.6, .9))],
    ],
    lines: ['M 77 11.4 L 77 22.6', 'M 71.4 17 L 82.6 17', 'M 40.6 50 L 61.4 50 M 61.4 50 C 62 62 62.6 74 63 84', 'M 40.6 50 C 40 62 39.4 74 38.6 84 L 63 84', EYE(57.6, 16.6)],
  });

  /* The eunuch, Masrur the Sworder: a broad, beardless man under a tall wrapped turban, a wide sash,
     the drawn scimitar held upright before him. */
  figure('eunuch', 'the eunuch', {
    pieces: [
      () => [headParts(Fr(52, 17, 1.08), 'bare', 'onion'), Po('M 44 26 C 37 28 33.6 34 33.4 44 C 33 60 31 80 26 99.6 L 67 99.6 C 66 84 66.6 68 66.6 56 C 66.6 46 64 38 60 32 C 57 28 54 26 50 26 Z'), El(49, 34, 13.6, 8), El(57, 58, 11, 13), SLIPPER(62)],
      () => [Po('M 72.4 50.6 C 71.4 37 74 22 80.6 8 C 82 6.4 83.2 7.4 82.6 9.4 C 79 22 77.4 36 76.4 50.6 Z'), Li(68.4, 51.6, 1.3, 80.4, 51.6, 1.3), Li(73.4, 52, 1.6, 73.6, 60, 1.6), Ci(73.6, 61, 2)],
      () => [armParts([50, 33], [53, 49], [68.6, 53], {})],
    ],
    lines: ['M 38.4 6.6 C 45 9 56 9 64 6', 'M 39.6 -1.6 C 46 1 55 1 62 -2', 'M 33.6 50 C 46 52.6 58 52.6 67 50', 'M 33.6 56 C 46 58.6 58 58.6 67 56', EYE(59.6, 16.6)],
  }, { H: 1.04 });

  /* The Jinni, the Ifrit: risen from the smoke of the jar, huge, bald but for his topknot, his
     arms folded on his chest; below the sash he is a column of smoke narrowing to a wisp. */
  figure('jinni', 'the Jinni', {
    pieces: [
      () => {
        const P = [];
        const pts = [[51, 50, 10.6], [56.6, 58, 9.4], [52, 66, 8.6], [45.6, 72, 7.4], [49, 79, 6.2], [54, 84, 5], [51, 89.6, 3.8], [47.6, 94, 2.8], [49, 97.6, 2], [52, 99.4, 1.2]];
        for (let i = 0; i < pts.length; i++) { const [x, y, r] = pts[i]; P.push(soft(Ci(x, y, r), 3)); if (i) P.push(soft(Li(pts[i - 1][0], pts[i - 1][1], pts[i - 1][2] * .72, x, y, r * .72), 2)); }
        return P;
      },
      () => [headParts(Fr(52, 10, 1.16), 'short', 'bald'), Po('M 47.6 4 C 46 0 46 -4 48.4 -7.6 C 48.6 -4 49.6 -1 51.6 2 Z'), Po('M 55.6 2.6 C 56.4 -1 58.6 -4 61.6 -5.6 C 60.4 -2.6 59.6 0 59.4 3.6 Z'), Po([[45, 9], [40.6, 5.6], [46.4, 6.6]]),
        Po('M 34 22 C 40 18.6 46 18 52 18 C 58 18 64 18.6 70 22 C 72.6 24 72 28 69.6 30 C 66 38 62.6 44 60.6 50 L 43.4 50 C 41.4 44 38 38 34.4 30 C 32 28 31.4 24 34 22 Z'), El(52, 50, 11.6, 3.4)],
      () => [Li(35.6, 28, 5.6, 64, 36.4, 4.4), Ci(66.4, 37, 4), Li(68.6, 28, 5.6, 40, 36.4, 4.4), Ci(37.6, 37, 4)],
    ],
    lines: ['M 42 46.6 C 48 48.4 56 48.4 62 46.6', 'M 46 60 C 50 64 56 62.6 58 58.6', 'M 44 72 C 47.6 76 53 75.4 55.6 71.6', 'M 47 85 C 49.6 87 52.6 86.6 54.4 84', 'M 44 41 C 48 43 56 43 60 41', EYE(60.4, 9.6)],
  }, { H: 1.75 });

  /* The sailor: a cloth knotted round his head, wide breeches to the knee, bare shins; the long oar
     over his shoulder, its blade behind him. */
  figure('sailor', 'the sailor', {
    pieces: [
      () => [Li(30.6, 9, 1.3, 75, 59, 1.3), El(30, 8.6, 3, 9.6, -42)],
      () => [headParts(Fr(52, 18, 1.04), 'short', 'scarf'),
        Po('M 45 26 C 40 28 39 34 39.4 42 C 39.6 50 38 58 37.6 64 C 37 70 37.6 76 40 78 L 51 78 L 51.6 72 L 53 78 L 63.6 78 C 65 74 64.6 68 63.6 62 C 63 54 62.6 46 62 40 C 61 33 58 28 54 26 Z'),
        legParts([46, 72], [44.6, 84], [42, 96], { back: true }), legParts([57, 72], [59.6, 84], [61.6, 96])],
      () => [armParts([51, 33], [56, 48], [62, 43], {})],
    ],
    lines: ['M 39 52 C 46 53.6 55 53.6 62.6 52', 'M 51.6 72 L 51.4 60', EYE(59, 17.6)],
  }, { H: 0.97 });

  /* The thief, one of the Forty: crouched and creeping on his toes, his face muffled to the eyes,
     the sack of his plunder over his back, a dagger held low before him. */
  figure('thief', 'the thief', {
    pieces: [
      () => [El(41, 38, 9.6, 12, -24), Li(47.6, 30, 1.6, 51, 27, 1.2), Ci(51.6, 26.6, 1.8)],
      () => [headParts(Fr(64, 33, 1.02, 16), 'mask', 'cap'),
        Po('M 57 38 C 51 40 46 46 44 54 C 42.6 60 42.6 64 43.6 68 L 56 68 C 58 62 61 54 63.6 48 C 65 44 63 40 57 38 Z'),
        legParts([47, 64], [59, 72], [60, 96]), Li(46, 64, 5, 35, 78, 3.8), Li(35, 78, 3.6, 30, 94, 2.4), Po([[27, 93], [32.6, 92.6], [29, 100], [24.6, 100]])],
      () => [armParts([58, 44], [66, 56], [76, 53], {}), Po('M 79 52 C 84 50 90 50 94 52 C 90 52.6 85 54.4 80.6 55.6 Z')],
    ],
    lines: ['M 45 56 C 50 57.6 55 57.6 60 56', 'M 36 32 C 40 36 42 42 41 48', EYE(70.6, 32)],
  }, { H: 0.9 });

  /* Sindbad the Seaman, the traveller: striding out, his bundle on a stick over his shoulder, a
     turban, a short coat, soft boots. */
  figure('sindbad', 'Sindbad', {
    pieces: [
      () => [Li(27, 13, 1.2, 67, 41, 1.2), El(26, 20, 7.6, 7), Po([[24, 12], [28, 12.6], [26.4, 15.6]]), Li(26.4, 13, .9, 24, 9, .7)],
      () => [headParts(Fr(53, 17, 1.04), 'beard', 'turban'),
        Po('M 46 25 C 41 27 40 33 40.4 42 C 40.6 52 39 62 37.6 72 L 64 72 C 63 62 62.6 52 62.4 42 C 62.2 34 60 28 56 25.6 Z'),
        legParts([46, 68], [41, 82], [36, 96], { back: true }), legParts([56, 68], [62.6, 82], [66, 96])],
      () => [armParts([51, 32], [56, 46], [63, 39], {})],
    ],
    lines: ['M 41.6 10.6 C 48 12.8 56 12.6 63.4 10', 'M 41.4 6.4 C 47.6 9.2 56.6 9 63 5.6', 'M 40.4 50 C 47 51.6 55 51.6 62.6 50', 'M 52 26 C 52.6 42 53 58 53 72', EYE(60.6, 15.6)],
  });

  /* The old woman, the go-between: hunched under her hood, a hooked nose and chin, her staff. */
  figure('oldwoman', 'the old woman', {
    pieces: [
      () => [headParts(Fr(62, 36, 1.02, 20), 'hook', 'hood'),
        Po('M 47 30 C 39 31 34.6 38 34 50 C 33.4 64 32 80 29 99.6 L 64 99.6 C 63 86 63 72 64 62 C 64.6 54 64.6 48 62 44 C 59 36 54 30 47 30 Z')],
      () => [Li(74.6, 46, 1.3, 77, 99.6, 1.2), Ci(74.4, 45.4, 1.8)],
      () => [armParts([56, 45], [59, 60], [71.6, 57], { sleeve: 5 })],
    ],
    lines: ['M 36.4 62 C 44 64 54 64 63.6 62', 'M 47 32 C 42 46 40.6 72 40 99', EYE(68.6, 36.6)],
  }, { H: 0.9 });

  /* The Badawi, the man of the desert: the headcloth falling to his shoulders under its cord, the
     broad cloak, and the long lance upright in his fist. */
  figure('badawi', 'the Badawi', {
    pieces: [
      () => [Li(70.6, 99.6, 1, 70.6, -6, 1), Po('M 70.6 -20 C 72.6 -15 72.8 -10 70.6 -5 C 68.4 -10 68.6 -15 70.6 -20 Z'), Li(70.6, -4, .7, 67.6, 4, .5)],
      () => [headParts(Fr(51, 17, 1.06), 'beard', 'kufiya'), Po('M 42 26 C 35 27 33 32 33 40 C 33 58 32 80 30 99.6 L 64 99.6 C 63 84 62.6 66 62.6 52 C 62.6 42 61.6 35 58.6 30 C 56 27 53 26 50 26 Z'), El(48.6, 33, 13, 7)],
      () => [armParts([50, 32], [53, 47], [67.4, 44], { sleeve: 6 })],
    ],
    lines: ['M 41.6 6 C 47 7.6 54 7.6 60.4 5.6', 'M 41.6 8.6 C 47 10.2 54 10.2 60.6 8.2', 'M 44 30 C 40 50 38 76 36.6 99', EYE(58.6, 15.6)],
  });

  /* The guard, the Wali's man: a pointed helmet with its spike, the round shield on his arm with
     its rim and boss, the mace held up behind it. */
  figure('guard', 'the guard', {
    pieces: [
      () => [Li(46, 46, 1.3, 36.6, 2, 1.3), El(35.8, -1.4, 4, 5, -14), Po([[31.6, -2.6], [40, -2.4], [35.2, -8.6]])],
      () => [headParts(Fr(51, 18, 1.04), 'short', 'helmet'), Po(ROBE), SHOULDER(), SLIPPER(60)],
      () => [Ci(60.6, 53, 13), Ci(60.6, 53, 3.4)],
    ],
    lines: [ring(60.6, 53, 10.6), ring(60.6, 53, 3.4), EYE(58.6, 17.6)],
  }, { H: 1.02 });

  /* The servant: carrying the covered tray of the feast on his head, one hand raised to steady it. */
  figure('servant', 'the servant', {
    pieces: [
      () => [Li(34, 6, 1.6, 68, 6, 1.6), Po('M 41 5 C 41 -3 46 -7.6 51 -7.6 C 56 -7.6 61 -3 61 5 Z'), Ci(51, -9, 1.8), El(38.6, 3.4, 3, 2), El(63.4, 3.4, 3, 2)],
      () => [headParts(Fr(51, 17, 1.02), 'short', 'cap'), Po('M 45 25 C 40 27 38.6 33 38.6 42 C 38.6 56 37 76 34 99.6 L 64 99.6 C 63 84 62 66 62 52 C 62 42 61 35 58 30 C 56 27 53 25.6 50 25 Z'), SHOULDER(), SLIPPER(60)],
      () => [armParts([50, 31], [61, 24], [63.6, 11], {})],
    ],
    lines: ['M 38.6 50 C 46 51.6 54 51.6 62 50', 'M 43 0 C 48 -1.4 54 -1.4 59 0', EYE(58.6, 16.6)],
  }, { H: 0.95 });

  /* =====================================================================
   * 2. THE BEASTS, in profile facing right; the far legs are a piece of their own behind.
   * ===================================================================== */
  const beast = (name, role, def, o = {}) => figure(name, role, def, Object.assign({ kind: 'animal' }, o));
  const hoof = (x, y = 100, w = 2.6) => Po([[x - w * .8, y - 4.4], [x + w * .7, y - 4.4], [x + w * 1.2, y], [x - w * 1.1, y]]);
  const pad = (x, w = 3.4) => El(x + .6, 98.4, w, 1.8);

  /* the horse's body, put where a rider needs it (dy moves it down the box) */
  const horseBody = (dy = 0) => [El(50, 54 + dy, 21, 10.6), El(68, 54 + dy, 8.6, 10.6), El(63, 50 + dy, 9, 11, 20), El(33, 52 + dy, 11.4, 11.6),
    Po(`M 56 ${47 + dy} C 59 ${37 + dy} 65 ${27 + dy} 73 ${20 + dy} C 76 ${17.4 + dy} 80 ${17 + dy} 82.4 ${19.4 + dy} L 88 ${31 + dy} C 84 ${35 + dy} 80 ${42 + dy} 76 ${54 + dy} Z`),
    El(88.4, 31 + dy, 10.4, 4.6, 54), El(83.6, 26.6 + dy, 5, 4.4), Po([[77.6, 20 + dy], [78.4, 11 + dy], [81.6, 19 + dy]]),
    Po(`M 23 ${48 + dy} C 16 ${52 + dy} 13.6 ${64 + dy} 15 ${80 + dy} C 17.4 ${75 + dy} 19.6 ${68 + dy} 21.4 ${61 + dy} C 22.4 ${56 + dy} 23.6 ${52 + dy} 25 ${50 + dy} Z`),
    Ch([[69, 60 + dy, 4.6], [70, 77, 2.8]]), Li(70, 77, 2.3, 70.6, 95, 1.9), hoof(71.2), Ch([[33, 58 + dy, 7], [27.6, 73, 3.6]]), Li(27.6, 73, 2.6, 31, 95, 1.9), hoof(31.6)];
  const horseFar = (dy = 0) => [Ch([[63, 60 + dy, 4.2], [61.6, 77, 2.6]]), Li(61.6, 77, 2.2, 60.6, 95, 1.9), hoof(61.2), Ch([[38, 58 + dy, 6], [35, 73, 3.4]]), Li(35, 73, 2.4, 38, 95, 1.9), hoof(38.6)];

  /* The horse, saddled and bridled, standing square. */
  beast('horse', 'the horse', {
    pieces: [() => horseFar(), () => [horseBody(), Po('M 42 44.6 C 46 42.6 54 42.6 58 44.6 L 58.6 51 L 41.4 51 Z')]],
    lines: ['M 57.4 44 C 61 35 67 26.6 74 20.6', 'M 50 51 L 50 62', 'M 50 62 L 48.6 67 L 51.6 67 Z', 'M 84 24.6 L 93.6 37 L 79 34', 'M 86 27.6 L 87.6 27.8', 'M 41 52.6 C 46 54 54 54 59 52.6'],
  }, { H: 1.25 });

  /* The rider: a horseman in his turban, lance couched, his foot in the stirrup. */
  beast('rider', 'the horseman', {
    pieces: [() => horseFar(8), () => [horseBody(8)],
      () => [headParts(Fr(50, 11, 1), 'beard', 'turban'), Po('M 44 19 C 40 21 39 28 40 36 L 42 48 L 58 48 C 58 40 58 30 56 24 C 54 20 51 19 48 19 Z'), Ch([[52, 46, 5.6], [60, 52, 4.2], [57.6, 64, 3]]), Po([[54, 62], [61.4, 63.6], [62.4, 66.6], [54.6, 66.6]]),
        Li(36, 44, 1, 99, 18, 1), Po('M 99 18 L 106 14 L 100.4 20.4 Z'), armParts([50, 26], [53, 40], [62, 38], {})],
    ],
    lines: ['M 57.4 52 C 61 43 67 34.6 74 28.6', 'M 84 32.6 L 93.6 45 L 62 38', 'M 41 34 C 46 35.6 52 35.6 57.6 34', EYE(57.6, 10.6)],
  }, { H: 1.45, has: ['horse'] });

  /* The camel, the dromedary: one hump, the long neck dipping and rising, the knobbed knees. */
  beast('camel', 'the camel', {
    pieces: [
      () => [Ch([[60, 58, 4], [58.6, 77, 2.2], [58, 96, 2]]), pad(58), Ch([[38, 58, 4.6], [37, 77, 2.4], [38, 96, 2]]), pad(38)],
      () => [El(47, 52, 21, 10.6), soft(El(45, 38, 12.6, 12), 6), El(63, 52, 8, 9.6), El(30, 52, 8, 9),
        Ch([[66, 50, 6.4], [77, 52, 4.6], [84, 42, 3.8], [86.6, 30, 3.4]]).map(p => soft(p, 3)),
        El(91, 27.4, 6.6, 3.6, 14), Po([[86, 26], [85.4, 21], [88.6, 25.4]]), Po([[95, 27.6], [98.6, 29.6], [96.6, 31.4], [93.6, 30.4]]),
        Ch([[66, 58, 4.4], [67, 77, 2.6], [67, 96, 2.2]]), Ci(67, 77, 2.8), pad(67), Ch([[30, 56, 5.4], [27.6, 77, 2.8], [29, 96, 2.2]]), Ci(27.6, 77, 2.9), pad(29),
        Ch([[23, 47, 1.6], [21, 58, 1.2]]), Po([[19.6, 57], [22.6, 57], [21.6, 63]])],
    ],
    lines: ['M 34 42 C 38 47 54 47 58 42', 'M 36 46 L 34 56 M 56 46 L 58 56', 'M 92 26.6 L 93.6 26.6'],
  }, { H: 1.42 });

  /* The ass: a small beast, long of ear and big of head, a tufted tail; the mule wears a saddle-cloth. */
  const assPieces = mule => [
    () => [Ch([[61, 66, 3.4], [60, 82, 2], [59.6, 96, 1.8]]), hoof(60, 100, 2), Ch([[40, 64, 4], [39.6, 82, 2.2], [40.6, 96, 1.8]]), hoof(41, 100, 2)],
    () => [El(50, 60, 19, 10), El(64, 58, 8, 9), El(36, 58, 9, 9.6), Po('M 60 52 C 64 46 69 40 74 35 L 81 40 C 78 46 75 54 72 62 Z'),
      El(81.6, 44.6, 8, 4.8, 48), Po('M 74 35 C 72 26 72 20 74.6 16 C 76 21 77 28 77.6 36 Z'), Po('M 76.6 36 C 77 28 79 22 82 19 C 82 24 81 30 80 37.6 Z'),
      Ch([[67, 66, 3.6], [67.6, 82, 2], [68, 96, 1.8]]), hoof(68.4, 100, 2), Ch([[36, 64, 5], [33, 80, 2.6], [35, 96, 1.8]]), hoof(35.4, 100, 2),
      Ch([[27, 56, 1.4], [24, 68, 1.2]]), El(23.6, 71, 1.8, 3.4, 10)],
  ].concat(mule ? [() => [Po('M 41 50 C 47 47 55 47 61 50 L 61.6 64 L 40.4 64 Z')]] : []);
  beast('ass', 'the ass', { pieces: assPieces(false), lines: ['M 84 43 L 85.6 43.4', 'M 62.6 50 C 66 46 70 41 74.6 36.6'] }, { H: 0.82 });
  beast('mule', 'the mule', { pieces: assPieces(true), lines: ['M 84 43 L 85.6 43.4', 'M 42 60 C 48 61.6 54 61.6 60.6 60', 'M 51 64 L 51 74'] }, { H: 0.9 });

  /* The dog: a saluki of the desert, deep in the chest and narrow in the loin, long of leg, its
     feathered ear hanging and its tail curled low. */
  beast('dog', 'the dog', {
    pieces: [
      () => [Ch([[62, 64, 3], [61.6, 80, 1.8], [61.6, 97, 1.4]]), pad(62.2, 2.4), Ch([[38, 60, 4], [33, 74, 2.2], [37, 86, 1.6], [37, 97, 1.4]]), pad(37.6, 2.4)],
      () => [El(65, 57, 9.4, 11), soft(Li(58, 52, 5.6, 38, 52, 4.2), 5), El(35, 54, 8, 7.6), Li(68, 51, 5, 77, 37, 3.2),
        El(81, 34.6, 6, 3.6, 12), Po([[83.6, 33], [93, 36.6], [92, 38.8], [83.6, 38.6]]), Po('M 76 30 C 73.6 33 72.6 40 73.6 46 C 76 43 78 38 78.6 32 Z'),
        Ch([[68, 64, 3.2], [69, 80, 1.8], [69.6, 97, 1.4]]), pad(70.2, 2.4), Ch([[34, 58, 4.6], [27.6, 74, 2.2], [31.6, 86, 1.6], [31.2, 97, 1.4]]), pad(31.8, 2.4),
        Ch([[28, 52, 1.6], [21, 58, 1.3], [19.6, 68, 1], [23.6, 72, .8]])],
    ],
    lines: ['M 84.4 33 L 86 33', 'M 60 50 C 58 56 58 62 60 66'],
  }, { H: 0.62 });

  /* The lion: the great mane about his head, a heavy stride, the tuft at the end of his tail. */
  beast('lion', 'the lion', {
    pieces: [
      () => [Ch([[60, 60, 4.4], [58, 80, 3.4], [58, 96, 3]]), pad(58.6, 3.6), Ch([[38, 58, 5], [42, 76, 3.2], [40, 96, 3]]), pad(40.6, 3.6)],
      () => {
        const P = [El(48, 54, 21, 10), El(30, 53, 9, 10), El(64, 52, 9, 11)];
        for (let i = 0; i < 9; i++) { const a = (-120 + i * 30) * Math.PI / 180; P.push(soft(Ci(70 + 10.6 * Math.cos(a), 40 + 10.6 * Math.sin(a), 5), 3)); }
        P.push(soft(Ci(70, 40, 11), 3), El(80, 43, 7, 5.6, 8), Po([[84, 42], [89.6, 44], [88.4, 49], [83, 48.6]]),
          Ch([[67, 62, 4.6], [69.6, 80, 3.4], [70, 96, 3]]), pad(70.6, 3.6), Ch([[30, 58, 5.6], [24.6, 76, 3.4], [29, 96, 3]]), pad(29.6, 3.6),
          Ch([[22, 50, 1.8], [13, 56, 1.4], [8, 50, 1.2], [8.4, 43, 1]]), El(9, 40, 2.6, 3.6));
        return P;
      },
    ],
    lines: ['M 82 40.6 L 83.6 40.4', 'M 62 34 C 60 40 60 46 63 51'],
  }, { H: 0.82 });

  /* The ape: squatting, long arms to the ground, a muzzle; he holds the rod of ivory. */
  beast('ape', 'the ape', {
    pieces: [
      () => [El(48, 62, 14, 18, -18), El(60, 39, 7, 6.6), El(67.4, 43, 6, 4.6, 10), El(61, 34, 6.4, 2.4, -6), Ch([[42, 74, 6], [40, 88, 4], [44, 97, 3]]), El(48, 98.4, 7, 1.8),
        Ch([[54, 78, 5], [60, 88, 3.4], [58, 97, 2.6]]), El(61, 98.4, 5, 1.8)],
      () => [Li(70, 50, 1.4, 82, 98, 1.4), Ci(69.6, 49.4, 2)],
      () => [Ch([[54, 46, 4.4], [62, 60, 3.4], [72, 60, 2.8]]), Ci(74.4, 60.6, 3)],
    ],
    lines: ['M 63.4 37.4 L 65 37.4', 'M 52 50 C 54 58 54 66 51 74', 'M 68.6 44.6 L 72.6 44.6'],
  }, { H: 0.72 });

  /* The bull: a heavy body and short legs, the hump over his shoulders, the dewlap, the horns. */
  beast('bull', 'the bull', {
    pieces: [
      () => [Ch([[64, 62, 4.6], [63, 80, 3], [62.6, 96, 2.6]]), hoof(63, 100, 3), Ch([[36, 60, 5], [36, 80, 3], [37, 96, 2.6]]), hoof(37.6, 100, 3)],
      () => [El(48, 54, 24, 13.6), El(66, 50, 10, 13), soft(El(64, 39, 8, 6), 4), El(30, 52, 10, 12), Po('M 70 46 C 74 46 79 46 82 48 L 84 62 L 80 64 C 76 62 72 60 70 56 Z'),
        El(82, 54, 7, 8, -10), Po([[83, 58], [89.6, 61], [88, 66], [82, 64]]), Ch([[79, 47, 2.2], [84, 44, 1.8], [87, 39, 1.2], [86, 35, .7]]), Ch([[78, 47, 1.6], [76, 42, 1.2], [78, 38, .7]]),
        Po('M 66 62 C 70 66 74 70 78 66 L 78 60 Z'),
        Ch([[70, 64, 5], [70, 80, 3], [70.6, 96, 2.6]]), hoof(71, 100, 3), Ch([[30, 60, 6], [28, 80, 3.2], [29, 96, 2.6]]), hoof(29.6, 100, 3),
        Ch([[24, 46, 1.4], [20, 60, 1.2], [19.6, 72, 1]]), El(19.6, 75, 2, 3.4)],
    ],
    lines: ['M 84.6 52.6 L 86.2 52.8', 'M 63 40 C 60 46 60 54 63 60'],
  }, { H: 0.86 });

  /* The gazelle: slender and alert, the lyre of her horns, the great ears, legs like reeds. */
  beast('gazelle', 'the gazelle', {
    pieces: [
      () => [Ch([[60, 58, 2.6], [61, 78, 1.4], [61.6, 97, 1.1]]), hoof(61.8, 100, 1.4), Ch([[40, 56, 3.4], [36, 72, 1.8], [40, 84, 1.3], [40.6, 97, 1.1]]), hoof(41, 100, 1.4)],
      () => [El(50, 52, 16, 8), El(62, 51, 6, 7), El(37, 51, 6.4, 7), Li(63, 48, 3.6, 70, 28, 2.4), El(74, 27, 5.6, 3.2, 26), Po([[78, 28], [81.6, 32], [79.6, 33.4], [76, 31]]),
        Po('M 69 24 C 66 20 64.6 16 65.6 12 C 67.6 15 69 19 71 22 Z'),
        Ch([[71, 23, 1.2], [69.6, 16, 1], [71.6, 10, .8], [70.6, 4, .6]]), Ch([[72.6, 23, 1.2], [72.6, 16, 1], [75, 10, .8], [74.4, 4, .6]]),
        Ch([[64, 58, 2.6], [66, 78, 1.4], [66.6, 97, 1.1]]), hoof(66.8, 100, 1.4), Ch([[36, 56, 3.6], [31, 72, 1.8], [35, 84, 1.3], [35.4, 97, 1.1]]), hoof(35.8, 100, 1.4),
        Li(33, 47, 1.4, 30.6, 50, 1)],
    ],
    lines: ['M 75.6 25.4 L 77 25.4', 'M 40 55 C 48 57 56 57 62 55'],
  }, { H: 0.82 });

  /* The bird: a dove on a perch, as the birds of the tales are kept. */
  beast('bird', 'the bird', {
    pieces: [
      () => [El(50, 99, 12, 1.8), Li(50, 98, 1.4, 50, 46, 1.4), Li(38, 46, 1.4, 62, 46, 1.4)],
      () => [El(52, 36, 11, 7, -14), Ci(62, 26, 4.6), Po([[65.6, 25], [70, 27], [65.6, 28.4]]), Po('M 43 38 L 28 44 L 30 48 L 46 42 Z'), Li(52, 42, .8, 51, 46, .8), Li(55, 41, .8, 55, 46, .8)],
    ],
    lines: ['M 45 33 C 50 31 56 32 59 36', 'M 63 24.6 L 64.4 24.4'],
  }, { H: 0.66 });

  /* The falcon: upright on its block, the hooked beak, the hood off. */
  beast('falcon', 'the falcon', {
    pieces: [
      () => [El(50, 97, 10, 3), Li(50, 96, 2.4, 50, 72, 2.4), El(50, 70, 9, 3)],
      () => [El(50, 48, 9, 15, 10), Ci(55, 30, 6), Po([[59, 28], [63, 30], [61, 35], [58.6, 32]]), Po('M 42 56 L 38 78 L 44 79 L 48 60 Z'), Li(49, 62, 1, 48, 68, .8), Li(53, 62, 1, 53, 68, .8)],
    ],
    lines: ['M 45 40 C 48 48 50 56 49 62', 'M 56.6 28.6 L 58 28.4', 'M 53 33 L 58 36'],
  }, { H: 0.7, has: ['bird'] });

  /* The peacock: his tail spread as a great fan behind him, the crest on his small head. */
  beast('peacock', 'the peacock', {
    pieces: [
      () => { const pts = []; for (let i = 0; i <= 40; i++) { const a = (-180 + i * 4.5) * Math.PI / 180, r = 36 + (i % 4 === 2 ? 2 : 0); pts.push([46 + r * Math.cos(a), 72 + r * Math.sin(a)]); } pts.push([46, 72]); return [Po(pts)]; },
      () => [El(56, 68, 8, 10, 10), Ch([[60, 60, 3], [64, 48, 2], [63, 38, 2]]), Ci(64, 36, 3.2), Po([[66.6, 35], [70.6, 36.6], [66.6, 38]]),
        Li(64, 33, .5, 61, 26, .5), Ci(61, 25.6, 1), Li(64.6, 33, .5, 64.6, 26, .5), Ci(64.6, 25.6, 1), Li(52, 76, 1, 52, 98, .8), Li(58, 76, 1, 59, 98, .8)],
    ],
    lines: [ring(30, 52, 3), ring(46, 44, 3), ring(62, 52, 3), ring(22, 66, 3), ring(36, 60, 2.6), 'M 46 72 L 14 54 M 46 72 L 46 38 M 46 72 L 22 44'],
  }, { H: 0.8, has: ['bird'] });

  /* The Rukh: the bird so great it darkens the sun, wings spread, talons hanging, hooked beak. */
  beast('rukh', 'the Rukh', {
    pieces: [
      () => [Po('M 40 46 C 32 34 22 22 6 10 C 10 18 12 22 10 26 C 14 30 16 32 14 36 C 20 38 24 42 24 46 C 30 48 34 50 38 54 Z')],
      () => [El(50, 50, 16, 7.6, -12), Ci(68, 42, 6.6), Po([[73, 40], [80, 43], [77, 49], [73.4, 46]]), Po('M 36 54 L 18 60 L 20 66 L 24 62 L 26 68 L 30 63 L 34 66 L 40 58 Z'),
        Ch([[48, 56, 2], [46, 66, 1.4], [44, 70, 1]]), Ch([[54, 55, 2], [54, 66, 1.4], [52, 70, 1]])],
      () => [Po('M 46 46 C 54 34 66 18 90 4 C 86 12 86 16 90 18 C 84 22 82 26 86 28 C 78 30 74 34 76 38 C 68 40 62 44 56 52 Z')],
    ],
    lines: ['M 52 40 C 62 30 74 20 86 12', 'M 56 44 C 64 38 72 32 80 28', 'M 70.6 40.6 L 72 40.4', 'M 28 44 C 22 36 16 28 10 20'],
  }, { H: 1.6, zs: .3, has: ['bird'] });

  /* The fish: leaping from the water in an arc, its tail flung up, a splash below. */
  beast('fish', 'the fish', {
    pieces: [
      () => { const P = []; const pts = [[70, 46, 6], [62, 40, 8.6], [52, 40, 9], [43, 44, 7.6], [35, 52, 5.6], [30, 60, 3.4], [28, 64, 1.6]]; for (let i = 1; i < pts.length; i++) P.push(soft(Li(pts[i - 1][0], pts[i - 1][1], pts[i - 1][2], pts[i][0], pts[i][1], pts[i][2]), 3));
        P.push(Po([[29, 62], [18, 60], [22, 68], [20, 76], [30, 68]]), Po([[46, 33], [52, 26], [58, 31], [58, 34]]), Po([[75.6, 48.6], [78, 49], [76, 51.4]]), Po([[50, 49], [46, 58], [54, 50]])); return P; },
      () => [Po('M 40 80 C 44 72 50 72 52 78 C 56 70 62 70 64 80 C 60 78 58 82 56 84 L 44 84 C 42 82 41 80 40 80 Z')],
    ],
    lines: ['M 68 42 L 69.4 42', 'M 63 38 C 66 42 66 48 63 52', 'M 30 88 C 40 85 60 85 74 88', 'M 36 93 C 46 91 56 91 66 93'],
  }, { H: 0.6 });

  /* The serpent: coiled upon itself, its neck raised in an S, the forked tongue out. */
  beast('serpent', 'the serpent', {
    pieces: [
      () => [El(50, 92, 22, 6.6), soft(El(48, 84, 16, 5.6), 2), soft(El(51, 77, 11, 4.6), 2),
        ...Ch([[56, 74, 4.4], [60, 62, 3.8], [53, 50, 3.4], [56, 38, 3.2], [61, 32, 3]]).map(p => soft(p, 3)), El(65.6, 31, 6, 3.6, 8)],
    ],
    lines: ['M 71.6 32 L 76 33 L 78 31.6 M 76 33 L 78 34.6', 'M 66.6 29.4 L 68 29.4', 'M 30 90 C 40 94 60 94 70 90', 'M 34 82 C 42 86 54 86 62 82'],
  }, { H: 0.7 });

  /* The great fish, the whale that Sindbad took for an island: its back out of the sea, the flukes
     raised behind, the spout before. */
  beast('whale', 'the great fish', {
    pieces: [
      () => [El(52, 76, 42, 20), cut(Po([[0, 80], [100, 80], [100, 110], [0, 110]])), Po('M 12 78 C 10 70 8 64 2 58 C 8 60 12 62 14 64 C 14 58 16 54 20 50 C 20 58 20 66 22 74 Z')],
      () => [Po('M 82 58 C 80 52 80 46 82 42 C 84 46 86 50 84 58 Z'), Po('M 82 44 C 78 40 74 40 72 42 C 75 42 78 43 81 46 Z'), Po('M 83 44 C 86 40 90 40 92 42 C 89 42 86 43 84 46 Z')],
    ],
    lines: ['M 4 82 C 20 79 40 79 54 81 C 70 83 86 82 98 80', 'M 14 88 C 30 86 50 86 66 88 C 76 89 86 88 92 86', 'M 78 70 L 79.6 70', 'M 70 76 C 76 78 82 78 88 76'],
  }, { H: 2 });

  /* The fox: the brush of his tail, his pricked ears and sharp muzzle. */
  beast('fox', 'the fox', {
    pieces: [
      () => [Ch([[62, 66, 2.4], [62, 82, 1.4], [62, 97, 1.2]]), pad(62.6, 2.2), Ch([[40, 64, 3], [38, 80, 1.6], [40, 97, 1.2]]), pad(40.6, 2.2)],
      () => [El(52, 62, 15, 7), El(64, 60, 6, 6.4), Li(66, 56, 3.6, 72, 46, 3), El(76, 46, 5.6, 4, 10), Po([[79, 45], [88, 48], [80, 50]]), Po([[71, 43], [72, 34], [75, 42]]), Po([[74, 42.6], [77, 35], [77.6, 43.4]]),
        Ch([[66, 66, 2.4], [67, 82, 1.4], [67.6, 97, 1.2]]), pad(68.2, 2.2), Ch([[38, 62, 3.4], [34, 80, 1.6], [36, 97, 1.2]]), pad(36.6, 2.2),
        Po('M 38 60 C 30 62 22 66 16 74 C 14 78 18 80 22 78 C 28 74 34 70 40 66 Z')],
    ],
    lines: ['M 78 44 L 79.4 44', 'M 17 76 L 21 73'],
  }, { H: 0.55 });

  /* =====================================================================
   * 3. THE THINGS. Solids where a thing has bulk (it turns with the camera like the place behind
   * it); cut-outs where a thing is flat by nature (a sword, a key, a scroll). Sizes are emblems,
   * larger than life, so a lamp still reads in the corner: k = s / 30 is a person's height / 30.
   *
   * CRAFT, after Anatomy (github.com/wheresryan22/anatomy, MIT). Each thing is built the way the
   * real one is built: feet under it, rims and lips, bands, hinges, pins, the parts that hold the
   * parts. A round body is turned from many rings, so the kernel's tones change smoothly down it;
   * a concave turn (a neck, a stem, a waist) is stacked from convex pieces, since a solid is drawn
   * as the hull of its rings. Small detail is dim marks on the part it sits on (studs as small
   * rings, seams, courses, engraving), mostly seen up close (lod 2), and every such line ends on
   * an edge or on another line. A thing keeps to 24 parts; marks are free.
   * ===================================================================== */
  const object = (name, role, fn, o = {}) => prop(name, (R, B, x, y, s) => { [x, y] = restSpot(x, y); return fn(R, B, x, y, s / 30, role); }, { kind: 'object', role, w: o.w || 16, big: !!o.big });
  const emblem = (name, role, def, o = {}) => figure(name, role, def, Object.assign({ kind: 'object', fixed: true }, o));
  const TAU = Math.PI * 2;
  const circ3 = (x, y, z, r, n = 28) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU; p.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); } return p; };
  /* a band drawn round a round solid at height z (only its near half shows) */
  const girdle = (B, x, y, z, r, on, cls = 'lo', lod = 1) => B.mark(circ3(x, y, z, r, 36), { axis: [x, y], cls, on, lod });
  /* the direction across the line of sight (screen right) at the scene's azimuth, for things that
     turn a side to the eye: a spout, a handle, the band of a ring; and the direction toward the eye */
  const lat = () => { const { c, s } = axes(S.az); return [c, -s]; };
  const fwd = () => { const { c, s } = axes(S.az); return [s, c]; };
  /* a frame about (x, y): u across the line of sight, v toward the eye, z up, all in design units */
  const frameAt = (x, y, k) => { const L = lat(), F = fwd(); return (u, v, z) => [x + (L[0] * u + F[0] * v) * k, y + (L[1] * u + F[1] * v) * k, z * k]; };
  const rr = (x0, y0, x1, y1, r) => ISO.rrect(x0, y0, x1, y1, r, 4);

  /* turn(B, x, y, k, rz, z0, z1, rings): a turned body whose radius is rz(z), in design units,
     sampled in rings spaced closer toward the ends where a profile turns fastest; the bottom ring
     is kept a hair wide so the lowest band is toned too. */
  function turn(B, x, y, k, rz, z0, z1, rings, o = {}) {
    const prof = [];
    for (let i = 0; i <= rings; i++) { const t = o.even ? i / rings : (1 - Math.cos(i / rings * Math.PI)) / 2, z = z0 + (z1 - z0) * t; prof.push([Math.max(i ? 0 : .04, rz(z)) * k, z * k]); }
    return B.lathe(x, y, prof, { n: o.n || 40, role: o.role, lod: o.lod });
  }
  /* the radius of an ellipse of half-width a and half-height h about zc (a ball, a squat body) */
  const ell = (a, zc, h) => z => a * Math.sqrt(Math.max(0, 1 - ((z - zc) / h) ** 2));
  const ball = (B, x, y, k, zc, r, o = {}) => turn(B, x, y, k, ell(r, zc, r), zc - r, zc + r, o.rings || 10, { n: o.n || 28, role: o.role, lod: o.lod });
  /* a solid swept through rings: at(t) -> [ring, z], z rising with t */
  function sweep(B, steps, at, o = {}) {
    const L = []; for (let i = 0; i <= steps; i++) L.push(at(i / steps));
    return B.add({ L, inner: o.crease ? ISO.inset(L[L.length - 1][0], o.crease) : null, role: o.role, lod: o.lod || 0 });
  }
  /* a stuffed or swelling block (a cushion, a bale): plan x0..x1, y0..y1 and heights in model units;
     its sides swell out by `bulge` toward `mid` of its height and draw in by `top` more at the lid */
  function pillow(B, x0, y0, x1, y1, z0, z1, o = {}) {
    const bulge = o.bulge ?? 1, top = o.top ?? 0, r = o.r ?? 1, mid = o.mid ?? .45;
    return sweep(B, o.steps || 8, t => {
      const a = t < mid ? (1 - t / mid) ** 2 * bulge : ((t - mid) / (1 - mid)) ** 2 * (bulge + top);
      return [rr(x0 + a, y0 + a, x1 - a, y1 - a, Math.max(.2, r - a * .3)), z0 + (z1 - z0) * t];
    }, o);
  }
  /* a round bar lying along x or y (a bolster, a pole, a bolt of cloth, a shrouded body): its axis
     at c across and z up, from a0 to a1 along, radius R (sq squashes its height), the plan's
     corners rounded by `end`. Rings go round it in even angles, so it shades as a cylinder. */
  function bar(B, axis, a0, a1, c, z, R, o = {}) {
    const arc = o.arc || 1.36, sq = o.sq || 1, e = o.end || 0;
    return sweep(B, o.steps || 10, t => {
      const ang = (-1 + 2 * t) * arc, h = R * Math.cos(ang), rc = Math.min(e, h);
      return [axis === 'x' ? rr(a0, c - h, a1, c + h, rc) : rr(c - h, a0, c + h, a1, rc), z + R * sq * Math.sin(ang)];
    }, o);
  }
  /* the points of a section round a bar along x (at x = a) or y, from angle f0 to f1 (0 is the side
     toward +y or +x, 90 the top): a tie round a shroud, the band of a bolster */
  const barArc = (axis, a, c, z, R, f0, f1, sq = 1, n = 14) => { const P = []; for (let i = 0; i <= n; i++) { const f = (f0 + (f1 - f0) * i / n) * Math.PI / 180, h = c + R * Math.cos(f), zz = z + R * sq * Math.sin(f); P.push(axis === 'x' ? [a, h, zz] : [h, a, zz]); } return P; };

  /* the near side of a closed plan outline (points [x, y]) at height z, judged by its true normals and
     run one point past each end so it reaches the silhouette: a piping, a seam, a strake */
  function nearRun(pts, z) {
    const F = fwd(), n = pts.length; let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
    const keep = i => { const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], p = pts[i]; let nx = b[1] - a[1], ny = a[0] - b[0]; if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; } return nx * F[0] + ny * F[1] > 0; };
    let s0 = -1; for (let i = 0; i < n; i++) if (keep(i) && !keep((i + n - 1) % n)) { s0 = i; break; }
    if (s0 < 0) return [];
    const out = [pts[(s0 + n - 1) % n]]; let j = 0; while (j < n && keep((s0 + j) % n)) out.push(pts[(s0 + j++) % n]); out.push(pts[(s0 + j) % n]);
    return out.map(p => [p[0], p[1], z]);
  }
  const ringPts = ring => ring.map(q => [q.u, q.v]);
  /* stud(B, on, c, r, n): a stud, rivet, nail head or bead, a small ring lying across the normal n */
  function stud(B, on, c, r, n, o = {}) {
    const up = Math.abs(n[2]) > .7, L = Math.hypot(n[0], n[1]) || 1, ux = up ? 1 : -n[1] / L, uy = up ? 0 : n[0] / L, pts = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r; pts.push(up ? [c[0] + ca, c[1] + sa, c[2]] : [c[0] + ux * ca, c[1] + uy * ca, c[2] + sa]); }
    B.mark(pts, { closed: true, n: o.always ? null : n, on, cls: o.cls || 'mid', lod: o.lod ?? 2 });
  }
  /* a closed ring lying flat at height z (an inner rim, a ripple, a stamp on a coin) */
  const flatRing = (B, on, x, y, z, r, o = {}) => B.mark(circ3(x, y, z, r, o.n || 32).slice(0, -1), { closed: true, n: [0, 0, 1], on, cls: o.cls || 'lo', lod: o.lod ?? 2 });
  /* the south (y1) or east (x1) face of a box part, as the kernel lays marks on it: at(u, z), u 0..1 */
  function faceOf(p, side) {
    const f = p.face, t = f.t || 0, d = z => t * (z - f.z0) / (f.z1 - f.z0 || 1);
    if (side === 'S') return { at: (u, z) => [ISO.lerp(f.x0 + d(z), f.x1 - d(z), u), f.y1 - d(z), z], n: [0, 1, 0], len: f.x1 - f.x0, p };
    return { at: (u, z) => [f.x1 - d(z), ISO.lerp(f.y0 + d(z), f.y1 - d(z), u), z], n: [1, 0, 0], len: f.y1 - f.y0, p };
  }
  /* a mark on a face from [u, z] points; dim and seen up close unless told */
  const onFace = (B, F, uz, o = {}) => B.mark(uz.map(([u, z]) => F.at(u, z)), { n: F.n, on: F.p, closed: !!o.closed, cls: o.cls || 'lo', lod: o.lod ?? 2 });
  /* a line along a face from edge to edge at height z (a plank joint, a course, an inlay) */
  const course = (B, F, z, o) => onFace(B, F, [[0, z], [1, z]], o);
  /* a strap or a panel: a closed rectangle on a face */
  const strap = (B, F, u0, u1, z0, z1, o = {}) => onFace(B, F, [[u0, z0], [u0, z1], [u1, z1], [u1, z0]], Object.assign({ closed: true }, o));
  const studOn = (B, F, u, z, r, o) => stud(B, F.p, F.at(u, z), r, F.n, o);
  const ringOn = (B, F, u, z, r, o = {}) => { const P = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; P.push([u + r * Math.cos(a) / F.len, z + r * Math.sin(a)]); } onFace(B, F, P, Object.assign({ closed: true, cls: 'mid' }, o)); };

  /* a pointed arch on a face: centre u, half-width hw (model units), its jambs from z0 up to the
     spring zs and its head rising `rise` to the point; at height zs + rise s its half-width is
     hw cos(s pi / 2), so the two curves meet at an angle */
  function archPts(F, uc, hw, z0, zs, rise, n = 8) {
    const d = hw / F.len, L = [], Rt = [];
    for (let i = 0; i <= n; i++) { const s = i / n, w = d * Math.cos(s * Math.PI / 2); L.push([uc - w, zs + rise * s]); Rt.push([uc + w, zs + rise * s]); }
    return [[uc - d, z0]].concat(L, Rt.reverse().slice(1), [[uc + d, z0]]);
  }
  const archZ = (hw, zs, rise, d) => zs + rise * (2 / Math.PI) * Math.acos(Math.min(1, Math.abs(d) / hw));
  /* a doorway on a wall face: the opening, its frame of dressed stone with the voussoir joints and
     jamb stones, and a pair of leaves with their planks, iron straps, studs and ring knockers.
     Returns gap(z): the frame's half-width in u at height z, so masonry courses stop on it. */
  function portal(B, F, uc, hw, z0, zs, rise, k, o = {}) {
    const fw = (o.frame || 1.4) * k, ho = hw + fw, ro = rise + fw * 1.3, du = v => v / F.len;
    onFace(B, F, archPts(F, uc, hw, z0, zs, rise), { cls: 'edge', lod: 0 });
    onFace(B, F, archPts(F, uc, ho, z0, zs, ro), { lod: 1 });
    for (const s of [.2, .42, .64, .86]) for (const sg of [-1, 1]) { const a = s * Math.PI / 2; onFace(B, F, [[uc + sg * du(hw * Math.cos(a)), zs + rise * s], [uc + sg * du(ho * Math.cos(a)), zs + ro * s]]); }
    for (let z = z0 + 2.6 * k; z < zs - .5 * k; z += 2.6 * k) for (const sg of [-1, 1]) onFace(B, F, [[uc + sg * du(hw), z], [uc + sg * du(ho), z]]);
    // the leaves: where they meet, the planks, two iron straps studded along, the knockers
    onFace(B, F, [[uc, z0], [uc, zs + rise]], { cls: 'mid', lod: 1 });
    for (const f of [-.66, -.33, .33, .66]) onFace(B, F, [[uc + du(f * hw), z0], [uc + du(f * hw), archZ(hw, zs, rise, f * hw)]]);
    for (const zb of [z0 + (zs - z0) * .24, z0 + (zs - z0) * .72]) {
      strap(B, F, uc - du(hw), uc + du(hw), zb, zb + .8 * k, { cls: 'mid', lod: 1 });
      for (let d = -hw + .7 * k; d < hw - .5 * k; d += 1.15 * k) if (Math.abs(d) > .45 * k) studOn(B, F, uc + du(d), zb + .4 * k, .22 * k);
    }
    const zk = z0 + (zs - z0) * .5;
    for (const sg of [-1, 1]) { studOn(B, F, uc + sg * du(1.1 * k), zk + .9 * k, .3 * k); ringOn(B, F, uc + sg * du(1.1 * k), zk, .75 * k, { lod: 1 }); }
    return z => { if (z <= zs) return du(ho); if (z >= zs + ro) return 0; return du(ho * Math.cos((z - zs) / ro * Math.PI / 2)); };
  }
  /* masonry on a face: courses every `step` from z0 to z1, broken by a frame `gap` at uc, and the
     upright joints between them laid in bond, each ending on the courses */
  function masonry(B, F, z0, z1, step, k, gap, uc = .5) {
    let row = 0;
    for (let z = z0 + step; z < z1 - .3 * k; z += step, row++) {
      const g = gap ? gap(z) : 0, g2 = gap ? Math.max(gap(z - step), g) : 0;
      if (g > 0) { onFace(B, F, [[0, z], [uc - g, z]]); onFace(B, F, [[uc + g, z], [1, z]]); } else course(B, F, z);
      const jw = 4.2 * k / F.len;
      for (let u = (row % 2 ? jw / 2 : jw); u < 1 - jw * .3; u += jw) if (!(g2 > 0 && Math.abs(u - uc) < g2 + .02)) onFace(B, F, [[u, z - step], [u, z]]);
    }
  }
  /* the hexagram of Sulayman's seal, lying flat: two triangles of radius r */
  const seal6 = (B, on, x, y, z, r, o = {}) => { for (const a0 of [90, 270]) { const P = []; for (let i = 0; i < 3; i++) { const a = (a0 + i * 120) * Math.PI / 180; P.push([x + r * Math.cos(a), y + r * Math.sin(a), z]); } B.mark(P, { closed: true, n: [0, 0, 1], on, cls: o.cls || 'mid', lod: o.lod ?? 1 }); } };

  /* a flame: a cut-out teardrop with its inner tongue */
  const FLAME = { pieces: [() => [Po('M 50 100 C 40 98 38 88 43 80 C 46 74 49 68 50 58 C 53 66 58 74 59 82 C 62 90 58 98 50 100 Z')]], lines: ['M 50 96 C 46 92 47 86 50 80'] };

  /* The fishing net, hung to dry from its pole: the pole on its stake, the yard lashed across it,
     the floats on the head rope, the diamond mesh, the hem weighted with leads. */
  {
    const top = u => [34 + 36 * u, 12 + u], bot = u => [30 + 52 * u, 86 - 2 * u + 3 * Math.sin(u * Math.PI)];
    const at = (u, v) => { const a = top(u), b = bot(u); return [f1(a[0] + (b[0] - a[0]) * v), f1(a[1] + (b[1] - a[1]) * v)]; };
    const edge = []; for (let i = 0; i <= 8; i++) edge.push(at(i / 8, 0)); for (let i = 1; i <= 8; i++) edge.push(at(1, i / 8)); for (let i = 7; i >= 0; i--) edge.push(at(i / 8, 1)); for (let i = 7; i > 0; i--) edge.push(at(0, i / 8));
    // the mesh: diagonals u + v = c and u - v = c of the net's own (u, v), each from edge to edge
    const mesh = [];
    for (const sg of [1, -1]) for (let c = sg > 0 ? .25 : -.75; sg > 0 ? c < 1.9 : c < .9; c += .25) {
      const P = []; for (let i = 0; i <= 12; i++) { const v = i / 12, u = sg > 0 ? c - v : c + v; if (u >= -1e-6 && u <= 1 + 1e-6) P.push(at(u, v)); }
      if (P.length > 1) mesh.push('M ' + P.map(p => p.join(' ')).join(' L '));
    }
    emblem('net', 'the net', {
      pieces: [
        () => [Li(30, 99.6, 1.4, 30, 8, 1.4), Li(30, 10, 1.2, 72, 12, 1.2), Ci(30, 7, 2), Po([[27.4, 99.6], [32.6, 99.6], [31.6, 95], [28.4, 95]]), El(30, 10.4, 2.4, 2)],
        () => { const P = [Po(edge)]; for (let i = 0; i <= 6; i++) P.push(Ci(...bot(i / 6), 1.8)); for (let i = 1; i <= 5; i++) P.push(El(...top(i / 6), 1.5, 2.2)); return P; },
      ],
      lines: mesh,
    }, { H: 0.95 });
  }

  /* A basket of palm leaf, wider at the mouth: the foot ring, the stakes and the rows woven through
     them, a braided band, the rolled rim, two withy handles, and the fruit heaped in it. */
  object('basket', 'the basket', (R, B, x, y, k) => {
    const role = 'the basket', A = frameAt(x, y, k), rb = z => 4.4 + 2.9 * Math.pow(Math.max(0, (z - .9) / 8.9), .8);
    B.cyl(x, y, 4.6 * k, 0, .9 * k, { n: 28, b: .3, role });
    const body = turn(B, x, y, k, rb, .9, 9.8, 12, { role, even: true, n: 48 });
    for (let z = 1.9; z < 9.4; z += 1.05) girdle(B, x, y, z * k, (rb(z) + .02) * k, body, 'lo', 2);
    girdle(B, x, y, 5.6 * k, (rb(5.6) + .02) * k, body, 'mid', 1); girdle(B, x, y, 6.8 * k, (rb(6.8) + .02) * k, body, 'mid', 1);
    { const P = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, z = i % 2 ? 6.7 : 5.7; P.push([x + (rb(z) + .03) * k * Math.cos(a), y + (rb(z) + .03) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: body, cls: 'lo', lod: 2 }); }
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, P = []; for (let j = 0; j <= 6; j++) { const z = .9 + 8.9 * j / 6; P.push([x + (rb(z) + .02) * k * Math.cos(a), y + (rb(z) + .02) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: body, cls: 'lo', lod: 2 }); }
    const rim = B.lathe(x, y, [[7.2 * k, 9.8 * k], [7.75 * k, 10.15 * k], [7.9 * k, 10.6 * k], [7.65 * k, 11.05 * k], [7.1 * k, 11.25 * k]], { n: 48, role });
    { const P = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU, z = i % 2 ? 11.1 : 9.9, r = i % 2 ? 7.6 : 7.3; P.push([x + r * k * Math.cos(a), y + r * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: rim, cls: 'lo', lod: 2 }); }
    turn(B, x, y, k, ell(6.7, 11.0, 1.7), 11.0, 12.7, 6, { role, n: 40 });
    for (const [u, v, r] of [[-3, 1.4, 1.35], [-.4, 2.8, 1.25], [2.4, 1.6, 1.3], [.8, -1.2, 1.4], [-2.6, -1.8, 1.2]]) ball(B, ...A(u, v, 0).slice(0, 2), k, 12.5 + r * .5, r, { role, lod: 1, n: 20, rings: 8 });
    for (const sg of [-1, 1]) { const P = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI; P.push(A(sg * (7.75 + Math.cos(a) * 1.5), 0, 9.6 + Math.sin(a) * 1.2)); } B.line(P, { w: 1.7, role, lod: 1 }); }
  });

  /* The lamp: a low oil lamp of brass on its foot ring. The filling hole under a domed lid with its
     knob, the long spout rising to the wick and its flame, the ring handle behind, and engraving
     round the shoulder. */
  object('lamp', 'the lamp', (R, B, x, y, k) => {
    const role = 'the lamp', A = frameAt(x, y, k);
    B.cyl(x, y, 3 * k, 0, .45 * k, { n: 28, b: .3, role });
    const rb = ell(6, 2.4, 2.2), body = turn(B, x, y, k, rb, .45, 4.4, 16, { role, n: 56 });
    girdle(B, x, y, 3.3 * k, (rb(3.3) + .02) * k, body, 'mid', 1); girdle(B, x, y, 3.85 * k, (rb(3.85) + .02) * k, body, 'lo', 2);
    { const P = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, z = i % 2 ? 3.75 : 3.38; P.push([x + (rb(z) + .03) * k * Math.cos(a), y + (rb(z) + .03) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: body, cls: 'lo', lod: 2 }); }
    girdle(B, x, y, 1.3 * k, (rb(1.3) + .02) * k, body, 'lo', 2);
    B.cyl(x, y, 2.1 * k, 4.3 * k, 5 * k, { n: 24, b: .3, role });
    turn(B, x, y, k, ell(2.3, 5, 1.6), 5, 6.5, 7, { role, n: 24 });
    B.cyl(x, y, .45 * k, 6.45 * k, 7.05 * k, { n: 12, b: 0, role, lod: 1 });
    ball(B, x, y, k, 7.85, .9, { role, n: 16 });
    // the spout: three turned lengths rising out across the line of sight, the wick in its mouth
    const sp = [[4.9, 2.5, 1.4], [7.4, 3.5, 1.1], [9.6, 4.9, .85], [11.1, 6.3, .66]];
    for (let i = 0; i + 1 < sp.length; i++) { const [u0, z0, r0] = sp[i], [u1, z1, r1] = sp[i + 1], p0 = A(u0, 0, 0), p1 = A(u1, 0, 0); B.ring(ISO.circ(r0 * k, 16, p0[0], p0[1]), z0 * k, z1 * k, { lid: ISO.circ(r1 * k, 16, p1[0], p1[1]), b: 0, role }); }
    stud(B, B.last, A(11.1, 0, 6.3), .3 * k, [0, 0, 1], { lod: 1 });
    B.line([A(11.1, 0, 6.3), A(11.3, 0, 6.9), A(11.5, 0, 7.3)], { w: 1.4, role, lod: 1 });
    puppet(B, ...A(11.5, 0, 0).slice(0, 2), 6.4 * k, FLAME, { z: 7.1 * k, fixed: true, role });
    // the ring handle behind, from the shoulder round to the belly, and the palmette over it
    const cu = -6.6, cz = 2.4, hr = Math.hypot(1.4, 1.1), a0 = Math.atan2(1.1, 1.4), hp = [];
    for (let i = 0; i <= 16; i++) { const a = a0 + i / 16 * (TAU - 2 * a0); hp.push(A(cu + hr * Math.cos(a), 0, cz + hr * Math.sin(a))); }
    B.line(hp, { w: 2, role });
  });

  /* The jar of yellow copper, the cucurbit sealed with lead under Sulayman's seal: the foot ring,
     the egg of the body with its engraved bands, the shoulder ring, the neck, the rolled lip, two
     ear handles, and the lead stopper stamped with the six-pointed seal. */
  object('jar', 'the jar', (R, B, x, y, k) => {
    const role = 'the jar', A = frameAt(x, y, k);
    B.cyl(x, y, 3.7 * k, 0, .7 * k, { n: 28, b: .3, role });
    const rb = ell(6.7, 7.6, 8.6), body = turn(B, x, y, k, rb, .7, 15.6, 24, { role, n: 64 });
    for (const [z, c, l] of [[3.4, 'mid', 1], [3.9, 'lo', 2], [10.9, 'mid', 1], [12.4, 'mid', 1]]) girdle(B, x, y, z * k, (rb(z) + .02) * k, body, c, l);
    { const P = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * TAU, z = i % 2 ? 12.3 : 11; P.push([x + (rb(z) + .03) * k * Math.cos(a), y + (rb(z) + .03) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: body, cls: 'lo', lod: 2 }); }
    B.cyl(x, y, 2.9 * k, 15.4 * k, 16.1 * k, { n: 28, b: .25, role });
    B.cyl(x, y, 2 * k, 16.1 * k, 19 * k, { n: 24, b: 0, role });
    B.lathe(x, y, [[2.2 * k, 19 * k], [3.1 * k, 19.4 * k], [3.3 * k, 19.9 * k], [3 * k, 20.4 * k]], { n: 28, role });
    B.cyl(x, y, 2.5 * k, 20.4 * k, 21.2 * k, { n: 24, b: .3, role });
    const cap = turn(B, x, y, k, ell(2.5, 21.2, .9), 21.2, 21.9, 4, { role, n: 24 });
    seal6(B, cap, x, y, 21.9 * k, 1.25 * k);
    for (const sg of [-1, 1]) { const P = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3; P.push(A(sg * (a * 2 + b * 4.6 + c * 6.4 + d * rb(13.4)), 0, a * 18.4 + b * 19 + c * 15.8 + d * 13.4)); } B.line(P, { w: 2, role }); }
  });

  /* Oil jars, three tall ones together, each big enough to hide a man: each on its foot, its belly
     ringed with a thumbed band and a rope sling, a rolled lip and a lid with a knob. */
  object('jars', 'the jars', (R, B, x, y, k) => {
    const role = 'the jars';
    for (const [dx, dy, f] of [[-9, -6, 1], [0, 0, 1.08], [9, 6, .94]]) {
      const X = x + dx * k, Y = y + dy * k, q = k * f, rb = ell(5.8, 10, 11);
      B.cyl(X, Y, 3.2 * q, 0, .6 * q, { n: 24, b: .25, role });
      const body = turn(B, X, Y, q, rb, .6, 19.6, 14, { role, n: 40 });
      girdle(B, X, Y, 14.6 * q, (rb(14.6) + .02) * q, body, 'mid', 1); girdle(B, X, Y, 15.6 * q, (rb(15.6) + .02) * q, body, 'mid', 1);
      { const P = []; for (let i = 0; i <= 44; i++) { const a = i / 44 * TAU, z = i % 2 ? 15.5 : 14.7; P.push([X + (rb(z) + .03) * q * Math.cos(a), Y + (rb(z) + .03) * q * Math.sin(a), z * q]); } B.mark(P, { axis: [X, Y], on: body, cls: 'lo', lod: 2 }); }
      girdle(B, X, Y, 6 * q, (rb(6) + .02) * q, body, 'lo', 2);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3, P = []; for (let j = 0; j <= 5; j++) { const z = 6 + 8.6 * j / 5; P.push([X + (rb(z) + .03) * q * Math.cos(a), Y + (rb(z) + .03) * q * Math.sin(a), z * q]); } B.mark(P, { axis: [X, Y], on: body, cls: 'lo', lod: 2 }); }
      B.lathe(X, Y, [[2.9 * q, 19.6 * q], [3.5 * q, 20 * q], [3.6 * q, 20.7 * q], [3.3 * q, 21.2 * q]], { n: 28, role });
      const lid = B.cyl(X, Y, 3.1 * q, 21.2 * q, 21.8 * q, { n: 24, b: .3, role });
      flatRing(B, lid, X, Y, 21.8 * q, 2 * q);
      ball(B, X, Y, q, 22.4, .75, { role, lod: 1, n: 14, rings: 6 });
    }
  }, { w: 26, big: true });

  /* A chest of cedar bound with iron: square feet, the planks of its sides, iron angles at the
     corners and bands across, studded; a barrel lid with its bands and end straps, the hasp
     hanging over the lock plate and its keyhole, and a drop ring at the end. */
  object('chest', 'the chest', (R, B, x, y, k) => {
    const role = 'the chest', X0 = x - 9.6 * k, X1 = x + 9.6 * k, Y0 = y - 5.4 * k, Y1 = y + 5.4 * k, zb = 1 * k, zt = 7.4 * k;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const fx = x + sx * 8.5 * k, fy = y + sy * 4.3 * k; B.box(fx - .9 * k, fy - .9 * k, fx + .9 * k, fy + .9 * k, 0, zb, { r: .2, b: 0, role, lod: 1 }); }
    const c = B.box(X0, Y0, X1, Y1, zb, zt, { r: .4, b: .4, role });
    const S_ = faceOf(c, 'S'), E_ = faceOf(c, 'E'), cw = 1.3 * k;
    for (const F of [S_, E_]) {
      for (const z of [3.1, 5.2]) course(B, F, z * k);
      const w = cw / F.len;
      strap(B, F, 0, w, zb, zt, { cls: 'mid', lod: 1 }); strap(B, F, 1 - w, 1, zb, zt, { cls: 'mid', lod: 1 });
      const bands = F === S_ ? [.3, .7] : [.5];
      for (const u of bands) strap(B, F, u - .5 * k / F.len, u + .5 * k / F.len, zb, zt, { cls: 'mid', lod: 1 });
      for (const z of [1.9, 3.6, 5.3, 6.8]) { for (const u of bands) studOn(B, F, u, z * k, .26 * k); studOn(B, F, w / 2, z * k, .24 * k); studOn(B, F, 1 - w / 2, z * k, .24 * k); }
    }
    // the lock plate with its keyhole, and the hasp hanging over it from the lid
    const lp = B.box(x - 1.7 * k, Y1, x + 1.7 * k, Y1 + .3 * k, 3.9 * k, 6.9 * k, { r: .3, b: .15, role, lod: 1 });
    const LF = faceOf(lp, 'S');
    { const P = []; for (let i = 0; i <= 10; i++) { const a = -.35 * Math.PI + i / 10 * 1.7 * Math.PI; P.push([.5 + .38 * k * Math.cos(a) / LF.len, 5.2 * k + .38 * k * Math.sin(a)]); } P.push([.5 - .18 * k / LF.len, 4.3 * k], [.5 + .18 * k / LF.len, 4.3 * k]); onFace(B, LF, P, { closed: true, cls: 'mid', lod: 1 }); }
    for (const [u, z] of [[.15, 4.3], [.85, 4.3], [.15, 6.5], [.85, 6.5]]) studOn(B, LF, u, z * k, .2 * k);
    const hs = B.box(x - .6 * k, Y1 + .3 * k, x + .6 * k, Y1 + .55 * k, 5.8 * k, 8.5 * k, { r: .2, b: 0, role, lod: 1 });
    stud(B, hs, [x, Y1 + .56 * k, 6.3 * k], .3 * k, [0, 1, 0], { lod: 1 });
    // the barrel lid: a skirt, then a curve over in even steps
    const LX0 = X0 - .2 * k, LX1 = X1 + .2 * k, D = 5.6 * k, zs = zt + .8 * k, H = 2.8 * k;
    const ths = [0, 15, 30, 45, 60, 74].map(d => d * Math.PI / 180);
    const LL = [[rr(LX0, y - D, LX1, y + D, .5 * k), zt]].concat(ths.map(a => [rr(LX0, y - D * Math.cos(a), LX1, y + D * Math.cos(a), Math.min(.5 * k, D * Math.cos(a))), zs + H * Math.sin(a)]));
    const lid = B.add({ L: LL, inner: ISO.inset(LL[LL.length - 1][0], .3 * k), role });
    const over = xb => { const P = [[xb, y + D, zt]]; for (const a of ths) P.push([xb, y + D * Math.cos(a), zs + H * Math.sin(a)]); for (let d = 74; d >= 50; d -= 8) { const a = d * Math.PI / 180; P.push([xb, y - D * Math.cos(a), zs + H * Math.sin(a)]); } return P; };
    for (const xb of [x - 3.84 * k, x + 3.84 * k, x - 8.95 * k, x + 8.95 * k]) for (const sg of [-1, 1]) B.mark(over(xb + sg * (Math.abs(xb - x) > 8 * k ? .65 : .5) * k), { on: lid, cls: 'mid', lod: 1 });
    for (const xb of [x - 3.84 * k, x + 3.84 * k]) for (const d of [8, 38, 66]) { const a = d * Math.PI / 180; stud(B, lid, [xb, y + D * Math.cos(a) + .02 * k, zs + H * Math.sin(a)], .26 * k, [0, Math.cos(a), Math.sin(a)]); }
    { const P = [], e = .55 * k; P.push([LX1, y + D - e, zt + e * .6]); for (const a of ths) P.push([LX1, y + (D - e) * Math.cos(a), zs + (H - e * .6) * Math.sin(a)]); for (let i = ths.length - 1; i >= 0; i--) P.push([LX1, y - (D - e) * Math.cos(ths[i]), zs + (H - e * .6) * Math.sin(ths[i])]); P.push([LX1, y - D + e, zt + e * .6]); B.mark(P, { on: lid, n: [1, 0, 0], closed: true, cls: 'mid', lod: 1 }); }
    // a drop ring at the east end, hung from its mount
    B.box(X1, y - .5 * k, X1 + .3 * k, y + .5 * k, 5.2 * k, 6.2 * k, { r: .2, b: 0, role, lod: 1 });
    B.line(circ3(0, 0, 0, .9 * k, 20).map(([a, b]) => [X1 + .35 * k, y + a, 4.3 * k + b]), { w: 1.2, role, lod: 1 });
  }, { w: 22, big: true });

  /* The scimitar, drawn and planted on its point: the curve of the blade with its fuller and the
     bevel of the edge, the guard with its langet and ball ends, the bound grip, the pommel. */
  emblem('sword', 'the sword', {
    pieces: [
      () => [Po('M 50.6 99.6 C 42 84 41 62 46 37 L 56 37 C 53 58 54 80 52.6 99.6 Z')],
      () => [Li(38.6, 36, 2.2, 63.4, 36, 2.2), Ci(38.6, 36, 2.6), Ci(63.4, 36, 2.6), Po([[47.6, 37], [54.4, 37], [51, 44.6]]), Li(51, 34.6, 2.6, 51.4, 21, 2.2), Ci(51.4, 18.6, 3.4), Ci(51.4, 14.2, 1.5)],
    ],
    lines: ['M 53.6 39.4 C 51.8 58 52 80 51.6 98.6', 'M 46.4 38.4 C 43.4 62 44.4 84 50.4 99', 'M 48.8 31.6 L 53.6 29.4', 'M 48.9 28 L 53.6 25.8', 'M 49 24.4 L 53.6 22.4', 'M 41.2 36 L 61 36'],
  }, { H: 0.75 });

  /* The throne on its dais of three steps, a runner coming down the front: the seat on bun feet
     with its carved panels and buttoned cushion, the arms with their finials, the high back with
     a pointed arch, a cushion against it, balls at its shoulders and an onion crest. */
  object('throne', 'the throne', (R, B, x, y, k) => {
    const role = 'the throne', steps = [[13.4, 11.4, 0, 1.4], [11.8, 10, 1.4, 2.8], [10.4, 9, 2.8, 4]], rw = 3 * k;
    steps.forEach(([hx, hy, z0, z1], i) => {
      const st = B.box(x - hx * k, y - hy * k, x + hx * k, y + hy * k, z0 * k, z1 * k, { r: .6, b: .5, role });
      const S_ = faceOf(st, 'S'), E_ = faceOf(st, 'E'), zm = (z0 + z1) / 2 * k, gu = rw / E_.len;
      course(B, S_, zm);
      onFace(B, E_, [[0, zm], [.5 - gu, zm]]); onFace(B, E_, [[.5 + gu, zm], [1, zm]]);
      strap(B, E_, .5 - gu, .5 + gu, z0 * k, z1 * k, { cls: 'lo', lod: 1 });
      const xin = (i < 2 ? steps[i + 1][0] : 7.2) * k;
      B.mark([[x + xin, y - rw, z1 * k], [x + hx * k, y - rw, z1 * k], [x + hx * k, y + rw, z1 * k], [x + xin, y + rw, z1 * k]], { on: st, n: [0, 0, 1], cls: 'lo', lod: 1 });
    });
    for (const [fx, fy] of [[-4.2, -7.2], [6.2, -7.2], [-4.2, 7.2], [6.2, 7.2]]) ball(B, x + fx * k, y + fy * k, k, 4.6, .7, { role, lod: 1, rings: 6, n: 14 });
    const seat = B.box(x - 5 * k, y - 8 * k, x + 7 * k, y + 8 * k, 5 * k, 9 * k, { r: .5, b: .4, role });
    { const S_ = faceOf(seat, 'S'), E_ = faceOf(seat, 'E'); strap(B, S_, .08, .92, 5.8 * k, 8.2 * k); strap(B, E_, .06, .94, 5.8 * k, 8.2 * k); studOn(B, E_, .5, 7 * k, .5 * k); studOn(B, S_, .5, 7 * k, .5 * k); }
    pillow(B, x - 4.8 * k, y - 5.6 * k, x + 6.8 * k, y + 5.6 * k, 9 * k, 10.8 * k, { bulge: .45 * k, top: .6 * k, r: .9 * k, steps: 5, role });
    { const z = (9 + .45 * 1.8) * k; B.mark(nearRun(ringPts(rr(x - 4.8 * k, y - 5.6 * k, x + 6.8 * k, y + 5.6 * k, .9 * k)), z), { on: B.last, cls: 'lo', lod: 2 }); for (const dy of [-2.8, 0, 2.8]) stud(B, B.last, [x + 1 * k, y + dy * k, 10.8 * k], .3 * k, [0, 0, 1]); }
    const back = B.box(x - 8.6 * k, y - 8 * k, x - 5 * k, y + 8 * k, 4 * k, 26 * k, { r: .5, b: .4, role });
    { const E_ = faceOf(back, 'E'), S_ = faceOf(back, 'S');
      onFace(B, E_, archPts(E_, .5, 6.2 * k, 10.8 * k, 18 * k, 6.4 * k), { lod: 1 }); onFace(B, E_, archPts(E_, .5, 5 * k, 10.8 * k, 18 * k, 5.2 * k));
      studOn(B, E_, .5, 21.4 * k, .6 * k); studOn(B, E_, .5, 21.4 * k, .25 * k);
      onFace(B, S_, [[.5, 4 * k], [.5, 26 * k]]); }
    pillow(B, x - 5 * k, y - 5.4 * k, x - 3.2 * k, y + 5.4 * k, 10.8 * k, 19.6 * k, { bulge: .3 * k, top: .6 * k, r: .6 * k, steps: 6, role });
    stud(B, B.last, [x - 3.2 * k, y, 15.2 * k], .35 * k, [1, 0, 0]);
    for (const sg of [-1, 1]) {
      const arm = B.box(x - 5 * k, y + (sg < 0 ? -8 : 5.8) * k, x + 7 * k, y + (sg < 0 ? -5.8 : 8) * k, 9 * k, 14.2 * k, { r: .4, b: .3, role });
      if (sg > 0) { const S_ = faceOf(arm, 'S'); strap(B, S_, .1, .9, 10 * k, 13.2 * k); studOn(B, S_, .5, 11.6 * k, .55 * k); }
      B.cyl(x + 6.1 * k, y + sg * 6.9 * k, .5 * k, 14.2 * k, 15.1 * k, { n: 12, b: 0, role, lod: 1 });
      ball(B, x + 6.1 * k, y + sg * 6.9 * k, k, 15.9, .9, { role, n: 16 });
    }
    B.cyl(x - 6.8 * k, y, 2.2 * k, 26 * k, 26.8 * k, { n: 24, b: .3, role });
    turn(B, x - 6.8 * k, y, k, z => 2.7 * Math.sin(Math.PI * (.22 + .78 * (z - 26.8) / 4.8)), 26.8, 31.6, 10, { role, n: 28 });
    B.line([[x - 6.8 * k, y, 31.6 * k], [x - 6.8 * k, y, 33 * k]], { role, lod: 2 });
    for (const sg of [-1, 1]) ball(B, x - 6.8 * k, y + sg * 7.2 * k, k, 27, 1, { role, n: 16 });
  }, { w: 30, big: true });

  /* The divan: a low couch on bun feet, carved panels and rosettes along its front, the mattress
     with its piping and buttons, three cushions against the back, and the bolsters at either end. */
  object('couch', 'the couch', (R, B, x, y, k) => {
    const role = 'the couch';
    for (const [fx, fy] of [[-16.6, -5.6], [16.6, -5.6], [-16.6, 5.6], [16.6, 5.6]]) turn(B, x + fx * k, y + fy * k, k, z => .55 + .55 * Math.sin(Math.PI * z / 1.2), 0, 1.2, 4, { n: 14, role, lod: 1, even: true });
    const base = B.box(x - 18 * k, y - 7 * k, x + 18 * k, y + 7 * k, 1.2 * k, 4.4 * k, { r: .8, b: .5, role });
    { const S_ = faceOf(base, 'S'), E_ = faceOf(base, 'E');
      for (let i = 0; i < 4; i++) { strap(B, S_, .03 + i * .24, .21 + i * .24, 1.8 * k, 3.8 * k); studOn(B, S_, .12 + i * .24, 2.8 * k, .45 * k); }
      strap(B, E_, .1, .9, 1.8 * k, 3.8 * k); studOn(B, E_, .5, 2.8 * k, .45 * k); }
    const mat = pillow(B, x - 17.4 * k, y - 6.6 * k, x + 17.4 * k, y + 6.6 * k, 4.4 * k, 7.2 * k, { bulge: .5 * k, top: .4 * k, r: 1.4 * k, steps: 5, role });
    { const z = (4.4 + .45 * 2.8) * k; B.mark(nearRun(ringPts(rr(x - 17.4 * k, y - 6.6 * k, x + 17.4 * k, y + 6.6 * k, 1.4 * k)), z), { on: mat, cls: 'lo', lod: 2 });
      for (let dx = -12; dx <= 12; dx += 6) for (const dy of [1.6, 4.4]) stud(B, mat, [x + dx * k, y + dy * k, 7.2 * k], .28 * k, [0, 0, 1]); }
    for (const [a, b] of [[-14, -5], [-4.5, 4.5], [5, 14]]) {
      const cu = pillow(B, x + a * k, y - 6.4 * k, x + b * k, y - 2.4 * k, 7.2 * k, 14 * k, { bulge: .4 * k, top: .8 * k, r: .9 * k, steps: 6, role });
      stud(B, cu, [x + (a + b) / 2 * k, y - 2.4 * k, 10.6 * k], .35 * k, [0, 1, 0]);
      B.mark([[x + a * k, y - 2.4 * k, 10.3 * k], [x + b * k, y - 2.4 * k, 10.3 * k]], { on: cu, n: [0, 1, 0], cls: 'lo', lod: 2 });
    }
    for (const sg of [-1, 1]) {
      const cx = x + sg * 15.6 * k, R2 = 2.2 * k, zc = 7.2 * k + R2 * .98, y1 = y + 5.6 * k;
      const bo = bar(B, 'y', y - 4.6 * k, y1, cx, zc, R2, { end: .8 * k, steps: 8, role });
      B.mark(circ3(0, 0, 0, 1.45 * k, 20).map(([a, b]) => [cx + a, y1 + .01 * k, zc + b]), { on: bo, n: [0, 1, 0], cls: 'lo', lod: 2 });
      stud(B, bo, [cx, y1 + .01 * k, zc], .3 * k, [0, 1, 0]);
      for (const yb of [y1 - 1.1 * k, y - 3.6 * k]) B.mark(barArc('y', yb, cx, zc, R2, -76, 140), { on: bo, cls: 'lo', lod: 2 });
    }
  }, { w: 40, big: true });

  /* A carpet spread on the ground: its outer and inner borders with a running border between guard
     stripes, the corner pieces of the field, the lozenge medallion with its pendants and rosette,
     and the fringes knotted at both ends. */
  object('carpet', 'the carpet', (R, B, x, y, k) => {
    const c = B.box(x - 16 * k, y - 10.6 * k, x + 16 * k, y + 10.6 * k, 0, .8 * k, { r: .3, b: 0, role: 'the carpet' });
    const z = .8 * k, top = [0, 0, 1], M = (P, cls, lod, closed = true) => B.mark(P.map(([a, b]) => [x + a * k, y + b * k, z]), { on: c, closed, n: top, cls, lod });
    const rect = (a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]];
    M(rect(15, 9.6), 'mid', 0); M(rect(12.6, 7.2), 'mid', 0); M(rect(14.4, 9), 'lo', 2); M(rect(13.2, 7.8), 'lo', 2);
    { const P = []; const side = (a0, b0, a1, b1, n) => { for (let i = 0; i < n; i++) { const t = (i + .5) / n, s = i % 2 ? -1 : 1; const px = a0 + (a1 - a0) * t, py = b0 + (b1 - b0) * t, nx = -(b1 - b0), ny = a1 - a0, L = Math.hypot(nx, ny); P.push([px + nx / L * .3 * s, py + ny / L * .3 * s]); } };
      side(-13.8, -8.4, 13.8, -8.4, 22); side(13.8, -8.4, 13.8, 8.4, 14); side(13.8, 8.4, -13.8, 8.4, 22); side(-13.8, 8.4, -13.8, -8.4, 14); M(P, 'lo', 2); }
    M([[-7.2, 0], [0, -4.8], [7.2, 0], [0, 4.8]], 'mid', 1); M([[-4.6, 0], [0, -3], [4.6, 0], [0, 3]], 'lo', 2);
    M(circ3(0, 0, 0, 1.2, 8).slice(0, -1).map(p => [p[0], p[1]]), 'lo', 2);
    for (const s of [-1, 1]) M([[s * 7.2, 0], [s * 8.6, -.9], [s * 10, 0], [s * 8.6, .9]], 'lo', 2);
    for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) M([[sa * 12.6, sb * 7.2], [sa * 8.6, sb * 7.2], [sa * 12.6, sb * 4.4]], 'lo', 2);
    for (let i = 0; i <= 12; i++) { const yy = y + (-9.9 + i * 1.65) * k; for (const s of [-1, 1]) B.mark([[x + s * 16 * k, yy, .4 * k], [x + s * 17.8 * k, yy + .2 * k, 0]], { on: c, lod: 1 }); }
  }, { w: 36, big: true });

  /* The tray of the feast on its kursi, the six-sided stand with an arch in each face: the brass tray
     with its engraved rim, the covered dish (a fluted cover, a knob on a neck), a bowl of rice, a
     bowl of pomegranates, and a round loaf stamped with a ring of marks. */
  object('tray', 'the tray', (R, B, x, y, k) => {
    const role = 'the tray';
    const st = B.cyl(x, y, 7 * k, 0, 5.8 * k, { n: 6, b: .5, rot: Math.PI / 6, role });
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI / 6 + i / 6 * TAU, a1 = a0 + TAU / 6, P0 = [x + 7 * k * Math.cos(a0), y + 7 * k * Math.sin(a0)], P1 = [x + 7 * k * Math.cos(a1), y + 7 * k * Math.sin(a1)];
      const F = { at: (u, z) => [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u, z], n: [Math.cos(a0 + TAU / 12), Math.sin(a0 + TAU / 12), 0], len: 7 * k, p: st };
      onFace(B, F, archPts(F, .5, 1.8 * k, 0, 1.1 * k, 1.4 * k), { lod: 1 }); course(B, F, 3.2 * k);
    }
    const tr = B.lathe(x, y, [[11.2 * k, 5.8 * k], [12 * k, 6.1 * k], [12.3 * k, 6.6 * k], [12.2 * k, 7 * k]], { n: 44, role });
    flatRing(B, tr, x, y, 7 * k, 11.3 * k, { cls: 'mid', lod: 1, n: 48 }); flatRing(B, tr, x, y, 7 * k, 10.3 * k, { n: 48 });
    B.lathe(x, y, [[2.6 * k, 7 * k], [4.2 * k, 7.5 * k], [4.8 * k, 8.1 * k], [4.9 * k, 8.4 * k]], { n: 32, role });
    const rc = ell(4.6, 8.4, 4), cov = turn(B, x, y, k, rc, 8.4, 11.8, 12, { role, n: 48 });
    girdle(B, x, y, 9.3 * k, (rc(9.3) + .02) * k, cov, 'mid', 1);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, P = []; for (let j = 0; j <= 6; j++) { const z = 9.3 + 2.5 * j / 6; P.push([x + (rc(z) + .02) * k * Math.cos(a), y + (rc(z) + .02) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: cov, cls: 'lo', lod: 2 }); }
    B.cyl(x, y, .55 * k, 11.8 * k, 12.5 * k, { n: 12, b: 0, role, lod: 1 });
    ball(B, x, y, k, 13.3, .9, { role, n: 16 });
    const b1x = x + 7 * k, b1y = y + 3 * k;
    B.lathe(b1x, b1y, [[1.4 * k, 7 * k], [2.5 * k, 7.4 * k], [3.1 * k, 8.3 * k], [3.25 * k, 9 * k]], { n: 28, role });
    turn(B, b1x, b1y, k, ell(2.9, 9, 1.6), 9, 10.6, 6, { role, n: 24 });
    const b2x = x - 6.2 * k, b2y = y + 5 * k;
    const b2 = B.lathe(b2x, b2y, [[1.2 * k, 7 * k], [2.2 * k, 7.35 * k], [2.7 * k, 8.1 * k], [2.8 * k, 8.7 * k]], { n: 28, role });
    girdle(B, b2x, b2y, 8.1 * k, 2.72 * k, b2, 'lo', 2);
    for (const [dx, dy, r, zc] of [[-.7, -.5, 1.1, 9.5], [.8, .7, 1, 9.3]]) { const p = ball(B, b2x + dx * k, b2y + dy * k, k, zc, r, { role, n: 16 }); stud(B, p, [b2x + dx * k, b2y + dy * k, (zc + r) * k], .28 * k, [0, 0, 1]); }
    const lx = x + 1 * k, ly = y - 8 * k, rl = ell(3.4, 7, 1.6), loaf = turn(B, lx, ly, k, rl, 7, 8.5, 7, { role, n: 28 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, zz = 7 + 1.6 * Math.sqrt(1 - (2.2 / 3.4) ** 2); stud(B, loaf, [lx + 2.2 * k * Math.cos(a), ly + 2.2 * k * Math.sin(a), zz * k], .22 * k, [Math.cos(a) * .55, Math.sin(a) * .55, .83]); }
    stud(B, loaf, [lx, ly, 8.5 * k], .35 * k, [0, 0, 1]);
  }, { w: 26, big: true });

  /* The cup: a goblet on a domed foot, the stem with its knop, a collar, the bowl engraved with two
     bands and a wave between, and the lip. */
  object('cup', 'the cup', (R, B, x, y, k) => {
    k *= .82; const role = 'the cup';
    B.cyl(x, y, 3.4 * k, 0, .5 * k, { n: 32, b: .3, role });
    turn(B, x, y, k, ell(3.1, .5, 1.6), .5, 1.9, 8, { role, n: 48 });
    B.cyl(x, y, .8 * k, 1.9 * k, 3.4 * k, { n: 16, b: 0, role });
    ball(B, x, y, k, 4.1, 1.05, { role, n: 20 });
    B.cyl(x, y, .7 * k, 5 * k, 6.4 * k, { n: 16, b: 0, role });
    B.lathe(x, y, [[.7 * k, 6.4 * k], [1.5 * k, 6.8 * k], [1.5 * k, 7.1 * k]], { n: 20, role });
    const rb = z => 1.4 + 3.2 * (1 - (1 - (z - 7.1) / 5) ** 2.2), bowl = turn(B, x, y, k, rb, 7.1, 12.1, 16, { role, n: 56, even: true });
    girdle(B, x, y, 9 * k, (rb(9) + .02) * k, bowl, 'mid', 1); girdle(B, x, y, 10.9 * k, (rb(10.9) + .02) * k, bowl, 'mid', 1);
    { const P = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, z = 9.95 + .55 * Math.sin(a * 8); P.push([x + (rb(z) + .03) * k * Math.cos(a), y + (rb(z) + .03) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: bowl, cls: 'lo', lod: 2 }); }
    const lip = B.lathe(x, y, [[4.6 * k, 12.1 * k], [4.85 * k, 12.3 * k], [4.8 * k, 12.6 * k]], { n: 36, role });
    flatRing(B, lip, x, y, 12.6 * k, 4.3 * k, { lod: 1 });
  });

  /* The ewer: a pear-shaped body on its foot with engraved bands, the shoulder ring, a neck with its
     knop, the flaring mouth under a domed lid and finial; the long spout rising in four turned
     lengths, stayed to the neck, and the handle with its thumb-piece. */
  object('ewer', 'the ewer', (R, B, x, y, k) => {
    const role = 'the ewer', A = frameAt(x, y, k);
    B.cyl(x, y, 3.3 * k, 0, .45 * k, { n: 28, b: .3, role });
    B.lathe(x, y, [[3.1 * k, .45 * k], [3.15 * k, .8 * k], [2.7 * k, 1.3 * k]], { n: 28, role });
    const rb = ell(5.8, 4.8, 6.6), body = turn(B, x, y, k, rb, 1.2, 11, 20, { role, n: 56 });
    for (const [z, c, l] of [[3, 'mid', 1], [7.9, 'mid', 1], [9.1, 'mid', 1]]) girdle(B, x, y, z * k, (rb(z) + .02) * k, body, c, l);
    { const P = []; for (let i = 0; i <= 44; i++) { const a = i / 44 * TAU, z = i % 2 ? 9 : 8; P.push([x + (rb(z) + .03) * k * Math.cos(a), y + (rb(z) + .03) * k * Math.sin(a), z * k]); } B.mark(P, { axis: [x, y], on: body, cls: 'lo', lod: 2 }); }
    B.cyl(x, y, 2.3 * k, 10.8 * k, 11.4 * k, { n: 24, b: .2, role });
    B.cyl(x, y, 1.4 * k, 11.4 * k, 14.2 * k, { n: 18, b: 0, role });
    turn(B, x, y, k, ell(1.9, 14.9, .8), 14.1, 15.7, 6, { role, n: 20 });
    B.cyl(x, y, 1.3 * k, 15.6 * k, 17.2 * k, { n: 18, b: 0, role });
    B.lathe(x, y, [[1.3 * k, 17.2 * k], [2.9 * k, 18.5 * k], [2.9 * k, 18.9 * k]], { n: 24, role });
    turn(B, x, y, k, ell(2.7, 18.9, 1.4), 18.9, 20.1, 5, { role, n: 24 });
    ball(B, x, y, k, 20.8, .7, { role, n: 14, rings: 6 });
    // the spout, in four lengths each a turned piece between two rings
    const sp = [[5.2, 4.4, 1.15], [7, 7.4, .95], [8.4, 11, .8], [9.4, 14.2, .66], [11.1, 16.3, .56]];
    for (let i = 0; i + 1 < sp.length; i++) { const [u0, z0, r0] = sp[i], [u1, z1, r1] = sp[i + 1], p0 = A(u0, 0, 0), p1 = A(u1, 0, 0); B.ring(ISO.circ(r0 * k, 14, p0[0], p0[1]), z0 * k, z1 * k, { lid: ISO.circ(r1 * k, 14, p1[0], p1[1]), b: 0, role }); }
    B.line([A(8.75, 0, 12.4), A(1.4, 0, 13.2)], { role, lod: 1 });
    const hp = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3; hp.push(A(a * -2.9 + b * -7.6 + c * -8 + d * -4.74, 0, a * 18.3 + b * 18.6 + c * 10.4 + d * 8.6)); }
    B.line(hp, { w: 2.2, role });
    ball(B, ...A(-3.1, 0, 0).slice(0, 2), k, 18.85, .55, { role, n: 16, rings: 6, lod: 1 });
  });

  /* The lute, the oud, set on its end: the round body with its purfling, the rose, the bridge the
     strings run from, the neck with its frets and nut, the pegbox bent back with its pegs. */
  {
    const pegs = []; for (const t of [.25, .5, .75]) { pegs.push(Li(47.6 + 7 * t, 19 - 15 * t, .7, 47.6 + 7 * t - 2.2, 19 - 15 * t - 1, .6), Ci(47.6 + 7 * t - 2.5, 19 - 15 * t - 1.1, .9)); pegs.push(Li(52.4 + 5.6 * t, 19 - 13 * t, .7, 52.4 + 5.6 * t + 2.2, 19 - 13 * t + 1, .6), Ci(52.4 + 5.6 * t + 2.5, 19 - 13 * t + 1.1, .9)); }
    const ellD = (cx, cy, rx, ry) => `M ${cx + rx} ${cy} C ${cx + rx} ${f1(cy + ry * .552)} ${f1(cx + rx * .552)} ${cy + ry} ${cx} ${cy + ry} C ${f1(cx - rx * .552)} ${cy + ry} ${cx - rx} ${f1(cy + ry * .552)} ${cx - rx} ${cy} C ${cx - rx} ${f1(cy - ry * .552)} ${f1(cx - rx * .552)} ${cy - ry} ${cx} ${cy - ry} C ${f1(cx + rx * .552)} ${cy - ry} ${cx + rx} ${f1(cy - ry * .552)} ${cx + rx} ${cy} Z`;
    const nw = y => 2.4 + .6 * (y - 18) / 34;
    emblem('lute', 'the lute', {
      pieces: [() => [El(50, 74, 15, 22), Li(50, 52, 3, 50, 18, 2.4), Po([[47.6, 19], [52.4, 19], [58, 6], [54.6, 4]]), ...pegs], () => [Po([[44, 88.2], [56, 88.2], [56.6, 90.6], [43.4, 90.6]])]],
      lines: [ellD(50, 74, 13.4, 20.4), ring(50, 69, 3.6), ring(50, 69, 1.8), 'M 47.6 19.6 L 52.4 19.6', ...[26, 31.6, 37.2].map(y => `M ${f1(50 - nw(y))} ${y} L ${f1(50 + nw(y))} ${y}`), 'M 48.6 88.2 L 49.2 19.6', 'M 50 88.2 L 50 19.6', 'M 51.4 88.2 L 50.8 19.6'],
    }, { H: 0.7 });
  }

  /* The book on its folding stand, the rahl, open, its cover showing round the pages, a ribbon
     hanging from the gutter and the hinge pin at the crossing; at its foot two closed books, one
     on another, each with its boards, the page edges, the rounded spine with its raised bands, the
     clasp, and the corner pieces and medallion of the binding. */
  const RAHL = { pieces: [
    () => [Li(32, 99.6, 2.4, 66, 50, 2.4), Li(68, 99.6, 2.4, 34, 50, 2.4), Po([[29, 99.6], [35.6, 99.6], [34, 97], [30, 97]]), Po([[64.4, 99.6], [71, 99.6], [70, 97], [66, 97]])],
    () => [Po('M 17 57.4 C 30 51 42 51 50 59.4 C 58 51 70 51 83 57.4 L 85.4 43.4 C 72 37 58 37 50 45 C 42 37 28 37 14.6 43.4 Z')],
    () => [Po('M 18 56 C 30 50 42 50 50 58 C 58 50 70 50 82 56 L 84 44 C 72 38 58 38 50 46 C 42 38 28 38 16 44 Z')],
    () => [Ci(50, 73.3, 1.9), Po([[49.2, 57], [50.8, 57], [51.4, 69], [50, 67.4], [48.6, 69]])],
  ], lines: ['M 50 46 L 50 58', 'M 23 47.4 C 31 44.6 39 44.6 45.4 48', 'M 54.6 48 C 61 44.6 69 44.6 77 47.4', 'M 23.4 50.4 C 31 47.6 39 47.6 45 51', 'M 55 51 C 61 47.6 69 47.6 76.6 50.4', 'M 24 53.4 C 30 51.2 36 51 40 52', 'M 60 52 C 64 51 70 51.2 76 53.4', 'M 18.6 54.6 C 30 48.8 42 48.8 50 56.6', 'M 50 56.6 C 58 48.8 70 48.8 81.4 54.6'] };
  object('book', 'the book', (R, B, x, y, k) => {
    const role = 'the book', A = frameAt(x, y, k);
    puppet(B, x, y, 15 * k, RAHL, { fixed: true, role });
    const closed = (cx, cy, z0, hx, hy, h) => {
      const X0 = cx - hx * k, X1 = cx + hx * k, Y0 = cy - hy * k, Y1 = cy + hy * k, t = .28 * k, zt = z0 + h * k, sr = (h / 2) * k;
      const lo = B.box(X0, Y0, X1 - sr * .4, Y1, z0, z0 + t, { r: .2, b: 0, role, lod: 1 });
      const pg = B.box(X0 + .3 * k, Y0 + .3 * k, X1 - sr, Y1 - .3 * k, z0 + t, zt - t, { r: .1, b: 0, role, lod: 1 });
      const PS = faceOf(pg, 'S'); for (let i = 1; i <= 3; i++) course(B, PS, z0 + t + (h * k - 2 * t) * i / 4);
      const up = B.box(X0, Y0, X1 - sr * .4, Y1, zt - t, zt, { r: .2, b: .25, role });
      for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const ax = cx + sa * (hx - .3) * k - (sa > 0 ? sr * .4 : 0), ay = cy + sb * (hy - .3) * k; B.mark([[ax, ay, zt], [ax - sa * 1.6 * k, ay, zt], [ax, ay - sb * 1.6 * k, zt]], { on: up, closed: true, n: [0, 0, 1], cls: 'lo', lod: 2 }); }
      B.mark([[cx - 1.6 * k, cy, zt], [cx - .2 * k, cy - hy * .5 * k, zt], [cx + 1.2 * k, cy, zt], [cx - .2 * k, cy + hy * .5 * k, zt]], { on: up, closed: true, n: [0, 0, 1], cls: 'mid', lod: 1 });
      const sp = bar(B, 'y', Y0 + .1 * k, Y1 - .1 * k, X1 - sr * 1.25, z0 + sr, sr * .98, { steps: 8, arc: 1.5, role, lod: 1 });
      for (let i = 1; i <= 3; i++) B.mark(barArc('y', Y0 + (Y1 - Y0) * i / 4, X1 - sr * 1.25, z0 + sr, sr, -84, 84, 1, 8), { on: sp, cls: 'lo', lod: 2 });
      const cl = B.box(cx - .5 * k, Y1, cx + .5 * k, Y1 + .22 * k, z0 + .1 * k, zt - .05 * k, { r: .1, b: 0, role, lod: 2 });
      stud(B, cl, [cx, Y1 + .23 * k, z0 + h * k * .5], .22 * k, [0, 1, 0]);
    };
    const [bx, by] = A(8.2, 2.6, 0);
    closed(bx, by, 0, 3.6, 2.6, 1.6);
    closed(bx - .3 * k, by + .2 * k, 1.6 * k, 3.1, 2.2, 1.3);
  });

  /* The letter: a scroll unrolled between its two rollers with their knobs, the paper turning over
     each roller, a heading and lines of writing and a signature, and the seal hanging on two cords. */
  emblem('scroll', 'the letter', {
    pieces: [() => { const P = [Po([[35, 22], [65, 22], [64, 80], [36, 80]])]; for (const yy of [22, 80]) P.push(Li(33, yy, 2.6, 67, yy, 2.6), Li(28, yy, 1.1, 72, yy, 1.1), Ci(27, yy, 2.1), Ci(73, yy, 2.1)); return P; },
      () => { const P = [Li(47.6, 82.6, .7, 49.4, 91, .7), Li(52.4, 82.6, .7, 50.6, 91, .7), Ci(50, 94, 3.6)]; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; P.push(Ci(50 + 3.6 * Math.cos(a), 94 + 3.6 * Math.sin(a), 1)); } return P; }],
    lines: ['M 35.2 26.4 L 64.8 26.4', 'M 36.2 75.6 L 63.8 75.6', 'M 42 32.6 L 58 32.6', 'M 39.6 39.4 L 60.4 39.4', 'M 39.6 45.4 L 60.4 45.4', 'M 39.6 51.4 L 58 51.4', 'M 39.6 57.4 L 60.4 57.4', 'M 46 66 C 49 62.6 52 69.4 56 65', ring(50, 94, 2.3)],
  }, { H: 0.42 });

  /* A great key, standing on its bit: the bow with three lobes about its hole and an engraved ring,
     two collars on the shank, and a bit cut with three wards. */
  emblem('key', 'the key', {
    pieces: [() => [Ci(50, 20, 12.4), Ci(50, 6.8, 3.6), Ci(37, 21, 3.6), Ci(63, 21, 3.6), cut(Ci(50, 20, 6.2)), Li(50, 32, 4, 50, 96, 4), Li(44, 38, 2, 56, 38, 2), Li(45.4, 43.6, 1.5, 54.6, 43.6, 1.5),
      Po([[50, 72], [67, 72], [67, 77.4], [61.4, 77.4], [61.4, 80.4], [67, 80.4], [67, 85.4], [61.4, 85.4], [61.4, 88.4], [67, 88.4], [67, 96], [50, 96]])]],
    lines: [ring(50, 20, 9.4), 'M 50 45.4 L 50 72', 'M 54 74.4 L 54 96'],
  }, { H: 0.45 });

  /* The purse of gold tied at the neck, its folds and an embroidered roundel, the string with its
     tassel; dinars stacked beside it, two lying loose and one rolled up on its edge, each stamped. */
  const POUCH = { pieces: [() => [El(50, 75, 23, 24.6), Po('M 39.6 56 L 60.4 56 L 56 46 L 44 46 Z'), Po('M 37 46.6 C 38 38.6 43.6 38 46 43.6 C 46.6 36 53.4 36 54 43.6 C 56.4 38 62 38.6 63 46.6 Z'), Li(40, 49, 1.8, 60, 49, 1.8), Ch([[60, 49, 1], [66, 55, .8], [65, 63, .6]]), Po([[63.4, 62.6], [66.6, 62.6], [67.6, 70], [62.4, 70]])]],
    lines: ['M 43 56 C 37.6 70 37 84 41 97.6', 'M 57 56 C 62.4 70 63 84 59 97.6', ring(50, 78, 5.4), ring(50, 78, 2.4), 'M 41.2 47.4 L 44.2 50.6', 'M 55.8 47.4 L 58.8 50.6'] };
  object('purse', 'the purse', (R, B, x, y, k) => {
    const role = 'the purse', A = frameAt(x, y, k);
    puppet(B, x, y, 17 * k, POUCH, { fixed: true, role });
    const coin = (cx, cy, z0, top) => { const p = B.cyl(cx, cy, 1.8 * k, z0, z0 + .62 * k, { n: 22, b: .2, role }); if (top) { flatRing(B, p, cx, cy, z0 + .62 * k, 1.05 * k, { cls: 'lo', lod: 2, n: 18 }); stud(B, p, [cx, cy, z0 + .62 * k], .3 * k, [0, 0, 1]); } return p; };
    const [cx, cy] = A(8.6, 1.6, 0);
    for (let i = 0; i < 4; i++) coin(cx + (i % 2 ? .22 : -.1) * k, cy + (i === 2 ? .15 : 0) * k, i * .62 * k, i === 3);
    for (const [u, v] of [[4, 5], [-5, 4.4]]) { const [px, py] = A(u, v, 0); coin(px, py, 0, true); }
    const P = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; P.push(A(12.4 + Math.cos(a) * 1.8, 3.2, 1.8 + Math.sin(a) * 1.8)); }
    B.plate(P, { role, lod: 1 });
    B.mark(circ3(0, 0, 0, 1.05, 16).map(([a, b]) => A(12.4 + a, 3.2, 1.8 + b)), { on: B.last, cls: 'lo', lod: 2 });
  });

  /* A heap of gold: dinars poured into a mound, a necklace of pearls over it, two stacks beside, two
     ingots stamped and laid crosswise, coins loose and one on its edge. */
  object('gold', 'the gold', (R, B, x, y, k) => {
    const role = 'the gold', A = frameAt(x, y, k), hz = r => 6.6 * (1 - (r / 10) ** 2);
    const h = turn(B, x, y, k, z => 10 * Math.sqrt(Math.max(0, 1 - z / 6.6)), 0, 6.6, 14, { role, n: 56, even: true });
    for (let i = 0; i < 16; i++) { const a = i * 2.39996, r = 1.6 + (i % 4) * 2 + (i % 3) * .5, cx = x + r * k * Math.cos(a), cy = y + r * k * Math.sin(a), s = 6.6 * 2 * r / 100, L = Math.hypot(s, 1); B.mark(circ3(cx, cy, hz(r) * k + .05 * k, 1.05 * k, 12), { on: h, closed: true, n: [Math.cos(a) * s / L, Math.sin(a) * s / L, 1 / L], cls: i % 3 ? 'lo' : 'mid', lod: i % 2 ? 2 : 1 }); }
    { const P = []; for (let i = 0; i <= 18; i++) { const t = i / 18, a = -.4 + t * 2.4, r = 3.2 + 3.4 * Math.sin(t * Math.PI); P.push([x + r * k * Math.cos(a), y + r * k * Math.sin(a), hz(r) * k + .25 * k]); } B.line(P, { w: 1.4, role, lod: 1 }); for (let i = 1; i < P.length; i++) stud(B, B.last, P[i], .25 * k, [0, 0, 1], { always: true }); }
    const stack = (cx, cy, n) => { for (let i = 0; i < n; i++) { const p = B.cyl(cx + (i % 2 ? .2 : -.1) * k, cy + (i % 3 === 1 ? .15 : 0) * k, 2 * k, i * .7 * k, (i + 1) * .7 * k, { n: 22, b: .2, role }); if (i === n - 1) { flatRing(B, p, cx + (i % 2 ? .2 : -.1) * k, cy, (i + 1) * .7 * k, 1.2 * k, { n: 18 }); } } };
    stack(x + 12 * k, y + 2 * k, 5); stack(x + 9.4 * k, y + 7.6 * k, 3);
    const ig = B.box(x - 12.8 * k, y + 4.6 * k, x - 7.6 * k, y + 7 * k, 0, 1.3 * k, { r: .2, b: .2, top: .45 * k, role });
    B.mark([[x - 11.4 * k, y + 5.4 * k, 1.3 * k], [x - 9 * k, y + 5.4 * k, 1.3 * k], [x - 9 * k, y + 6.2 * k, 1.3 * k], [x - 11.4 * k, y + 6.2 * k, 1.3 * k]], { on: ig, closed: true, n: [0, 0, 1], cls: 'mid', lod: 2 });
    B.box(x - 11.4 * k, y + 3.4 * k, x - 9 * k, y + 8.4 * k, 1.3 * k, 2.6 * k, { r: .2, b: .2, top: .45 * k, role });
    for (const [u, v] of [[6, 10], [-9, 8.4]]) { const [px, py] = [x + u * k, y + v * k]; const p = B.cyl(px, py, 2 * k, 0, .6 * k, { n: 22, b: .2, role }); flatRing(B, p, px, py, .6 * k, 1.2 * k, { n: 18 }); }
    const P = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; P.push(A(-2.6 + Math.cos(a) * 2, 11.6, 2 + Math.sin(a) * 2)); }
    B.plate(P, { role, lod: 1 }); B.mark(circ3(0, 0, 0, 1.2, 16).map(([a, b]) => A(-2.6 + a, 11.6, 2 + b)), { on: B.last, cls: 'lo', lod: 2 });
  }, { w: 24, big: true });

  /* A casket of jewels on ball feet: the corner mounts and the moulding round its top, a cartouche
     and the lock plate with its keyhole; the lid thrown back on its hinge, lined, with a roundel;
     cut stones and cabochons heaped above the rim, a string of pearls over the edge and down on to
     the ground, and two stones spilled before it. */
  object('jewels', 'the jewels', (R, B, x, y, k) => {
    const role = 'the jewels';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ball(B, x + sx * 6 * k, y + sy * 3.7 * k, k, .7, .7, { role, lod: 1, n: 12, rings: 6 });
    const c = B.box(x - 7 * k, y - 4.6 * k, x + 7 * k, y + 4.6 * k, 1.2 * k, 6.2 * k, { r: .4, b: .4, role });
    for (const F of [faceOf(c, 'S'), faceOf(c, 'E')]) {
      course(B, F, 5.5 * k, { lod: 1 }); course(B, F, 1.9 * k);
      const w = 1.6 * k / F.len;
      for (const [u0, u1] of [[0, w], [1, 1 - w]]) { onFace(B, F, [[u0, 5.5 * k], [u1, 5.5 * k], [u0, 3.9 * k]], { closed: true, cls: 'mid', lod: 1 }); onFace(B, F, [[u0, 1.9 * k], [u1, 1.9 * k], [u0, 3.5 * k]], { closed: true, cls: 'mid', lod: 1 }); }
      if (F.n[0]) { strap(B, F, .25, .75, 2.4 * k, 4.8 * k); studOn(B, F, .5, 3.6 * k, .45 * k); }
    }
    const lp = B.box(x - 1.2 * k, y + 4.6 * k, x + 1.2 * k, y + 4.9 * k, 3.4 * k, 5.6 * k, { r: .3, b: .15, role, lod: 1 });
    { const LF = faceOf(lp, 'S'), P = []; for (let i = 0; i <= 10; i++) { const a = -.35 * Math.PI + i / 10 * 1.7 * Math.PI; P.push([.5 + .3 * k * Math.cos(a) / LF.len, 4.8 * k + .3 * k * Math.sin(a)]); } P.push([.5 - .14 * k / LF.len, 4.1 * k], [.5 + .14 * k / LF.len, 4.1 * k]); onFace(B, LF, P, { closed: true, cls: 'mid', lod: 1 }); }
    const lid = B.ring(rr(x - 7 * k, y - 4.6 * k, x + 7 * k, y - 3.7 * k, .3 * k), 6.2 * k, 13.8 * k, { lid: rr(x - 7 * k, y - 7.2 * k, x + 7 * k, y - 6.3 * k, .3 * k), b: 0, role });
    { const at = (ux, s) => [x + ux * k, y - 3.7 * k - 2.6 * k * s + .02 * k, 6.2 * k + 7.6 * k * s], n = [0, .946, .324];
      B.mark([at(-6, .1), at(6, .1), at(6, .9), at(-6, .9)], { on: lid, closed: true, n, cls: 'lo', lod: 1 });
      B.mark([at(-5.4, .16), at(5.4, .16), at(5.4, .84), at(-5.4, .84)], { on: lid, closed: true, n, cls: 'lo', lod: 2 });
      B.mark(circ3(0, 0, 0, 1.8, 20).map(([a, b]) => at(a, .5 + b / 7.9)), { on: lid, n, cls: 'mid', lod: 1 }); }
    const gem = (gx, gy, z0, r, n = 8) => { const p = B.lathe(gx, gy, [[.06 * k, z0], [r, z0 + .9 * r], [r * .62, z0 + 1.35 * r]], { n, role }); return p; };
    for (const [dx, dy, r] of [[-3.8, -1.2, 1.9], [2.6, -1.6, 1.7], [-.6, 1.4, 2]]) gem(x + dx * k, y + dy * k, 5.4 * k, r * k);
    for (const [dx, dy, r] of [[4.6, 1.6, 1.3], [-4.6, 2.2, 1.2]]) turn(B, x + dx * k, y + dy * k, k, ell(r, 6.2, r), 6.2 - r * .6, 6.2 + r, 6, { role, n: 16 });
    const Lj = lat(), Fj = fwd(), P = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; P.push([x + 2.2 * k, y + (4.72 + .5 * Math.sin(t * Math.PI / 2)) * k, (6.25 - 5.95 * t) * k]); }
    for (let i = 1; i <= 9; i++) { const t = i / 9, u = 7.4 * t, v = 1.6 * t + .9 * Math.sin(t * Math.PI * 1.6); P.push([x + 2.2 * k + (Lj[0] * u + Fj[0] * v) * k, y + 5.22 * k + (Lj[1] * u + Fj[1] * v) * k, .25 * k]); }
    B.line(P, { w: 1.3, role, lod: 1 });
    for (let i = 1; i < P.length; i++) stud(B, B.last, P[i], .28 * k, [0, 1, 0], { always: true, cls: 'edge' });
    for (const [dx, dy, r] of [[9.4, 3.6, 1.2], [-5.4, 7.6, 1.1]]) gem(x + dx * k, y + dy * k, 0, r * k);
  });

  /* The ring, the seal of Sulayman, standing in a dimple of its cushion: the cushion stuffed and
     piped, tassels at its corners; the band with a line engraved round it, the eight-sided bezel,
     and the stone cut flat and stamped with the six-pointed seal. */
  object('ring', 'the ring', (R, B, x, y, k) => {
    const role = 'the ring', A = frameAt(x, y, k), F = fwd();
    const cu = pillow(B, x - 5.4 * k, y - 5.4 * k, x + 5.4 * k, y + 5.4 * k, 0, 3.2 * k, { bulge: .9 * k, top: 1.5 * k, r: 2.2 * k, steps: 8, mid: .3, role });
    B.mark(nearRun(ringPts(rr(x - 5.4 * k, y - 5.4 * k, x + 5.4 * k, y + 5.4 * k, 2.2 * k)), .96 * k), { on: cu, cls: 'lo', lod: 2 });
    flatRing(B, cu, x, y, 3.2 * k, .9 * k, { cls: 'lo', lod: 2 });
    for (const [sx, sy] of [[1, -1], [-1, 1], [1, 1]]) { const cx = x + sx * 5.15 * k, cy = y + sy * 5.15 * k; B.cone(cx, cy, .55 * k, 0, 1.1 * k, { n: 10, tip: .12 * k, role, lod: 1 }); }
    const zc = 6.8, R0 = 4.2, R1 = 3.2, n = [F[0], F[1], 0];
    for (const [a0, a1] of [[-90, 90], [90, 270]]) {
      const P = []; for (let i = 0; i <= 12; i++) { const a = (a0 + (a1 - a0) * i / 12) * Math.PI / 180; P.push(A(R0 * Math.cos(a), 0, zc + R0 * Math.sin(a))); }
      for (let i = 12; i >= 0; i--) { const a = (a0 + (a1 - a0) * i / 12) * Math.PI / 180; P.push(A(R1 * Math.cos(a), 0, zc + R1 * Math.sin(a))); }
      B.plate(P, { role });
      const M = []; for (let i = 0; i <= 12; i++) { const a = (a0 + (a1 - a0) * i / 12) * Math.PI / 180; M.push(A(3.7 * Math.cos(a), .01, zc + 3.7 * Math.sin(a))); }
      B.mark(M, { on: B.last, n, cls: 'lo', lod: 2 });
    }
    const bz = B.cyl(x, y, 1.9 * k, 10.6 * k, 11.6 * k, { n: 8, b: .2, role });
    for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU, r = 1.9 * k * Math.cos(Math.PI / 8); B.mark([[x + r * Math.cos(a), y + r * Math.sin(a), 10.6 * k], [x + r * Math.cos(a), y + r * Math.sin(a), 11.6 * k]], { on: bz, axis: [x, y], cls: 'lo', lod: 2 }); }
    const stone = B.lathe(x, y, [[1.65 * k, 11.6 * k], [1.75 * k, 12.1 * k], [1.35 * k, 12.6 * k]], { n: 24, role });
    seal6(B, stone, x, y, 12.6 * k, 1.05 * k);
  });

  /* The candle on its tall candlestick: the base and domed foot, the stem with two knops, the drip
     pan and the socket; the candle with wax run down its side, the wick, the flame. */
  object('candle', 'the candle', (R, B, x, y, k) => {
    const role = 'the candle';
    const base = B.cyl(x, y, 4.6 * k, 0, .6 * k, { n: 32, b: .4, role });
    flatRing(B, base, x, y, .6 * k, 3.7 * k, { lod: 2 });
    turn(B, x, y, k, ell(4.2, .6, 2.4), .6, 2.6, 9, { role, n: 48 });
    B.cyl(x, y, .9 * k, 2.5 * k, 5.5 * k, { n: 16, b: 0, role });
    turn(B, x, y, k, ell(1.6, 6.2, .9), 5.3, 7.1, 6, { role, n: 20 });
    B.cyl(x, y, .8 * k, 7 * k, 10.2 * k, { n: 16, b: 0, role });
    turn(B, x, y, k, ell(1.3, 10.9, .8), 10.1, 11.7, 6, { role, n: 20 });
    B.cyl(x, y, .8 * k, 11.6 * k, 12.8 * k, { n: 16, b: 0, role });
    const pan = B.lathe(x, y, [[1 * k, 12.8 * k], [3.2 * k, 13.3 * k], [3.4 * k, 13.8 * k]], { n: 32, role });
    flatRing(B, pan, x, y, 13.8 * k, 2.9 * k, { lod: 1 });
    B.cyl(x, y, 1.5 * k, 13.8 * k, 15.4 * k, { n: 20, b: .2, role });
    const cd = B.cyl(x, y, 1.2 * k, 15.4 * k, 21.4 * k, { n: 20, b: .25, role });
    const F = fwd(), a0 = Math.atan2(F[1], F[0]);
    for (const [da, len] of [[-.5, 2.2], [.15, 3.4], [.75, 1.6]]) { const a = a0 + da, ca = Math.cos(a), sa = Math.sin(a), r = 1.21 * k, z1 = (21.4 - len) * k;
      B.mark([[x + r * ca, y + r * sa, 21.4 * k], [x + r * ca, y + r * sa, z1]], { on: cd, axis: [x, y], cls: 'mid', lod: 1 });
      stud(B, cd, [x + r * ca, y + r * sa, z1 - .15 * k], .2 * k, [ca, sa, 0], { cls: 'mid' }); }
    B.line([[x, y, 21.4 * k], [x + .1 * k, y, 22.2 * k]], { role, lod: 1 });
    puppet(B, x, y, 5 * k, FLAME, { z: 21.8 * k, fixed: true, role });
  });

  /* The bier: a litter on four turned legs braced by stretchers, its frame with the carrying poles
     run through beside it, and the body laid on it in its shroud, bound with ties at the neck, the
     waist and the knees. */
  object('coffin', 'the bier', (R, B, x, y, k) => {
    const role = 'the bier';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turn(B, x + sx * 12.6 * k, y + sy * 4.6 * k, k, z => .65 + .4 * Math.sin(Math.PI * z / 4.4), 0, 4.4, 6, { n: 14, role, even: true });
    for (const sy of [-1, 1]) B.box(x - 12.6 * k, y + sy * 4.6 * k - .3 * k, x + 12.6 * k, y + sy * 4.6 * k + .3 * k, 1.1 * k, 1.7 * k, { r: .2, b: 0, role, lod: 1 });
    const fr = B.box(x - 14.6 * k, y - 5.6 * k, x + 14.6 * k, y + 5.6 * k, 4.4 * k, 5.4 * k, { r: .3, b: .3, role });
    course(B, faceOf(fr, 'S'), 4.9 * k); course(B, faceOf(fr, 'E'), 4.9 * k);
    for (const sy of [-1, 1]) bar(B, 'x', x - 18.6 * k, x + 18.6 * k, y + sy * 6.2 * k, 5 * k, .55 * k, { end: .5 * k, steps: 6, role });
    const zc = 5.4 * k + 2.9 * k * .8 * .98, Rb = 2.9 * k, X0 = x - 12.6 * k, X1 = x + 9.8 * k, taper = xx => .6 + .4 * (xx - X0) / (X1 - X0);
    const body = sweep(B, 10, t => { const a = (-1 + 2 * t) * 1.36, h = Rb * Math.cos(a), e = Math.min(1.8 * k, h * 1.4);
      return [ISO.fromPts([[X0, y - h * .36], [X0 + e, y - h * .6], [X1 - e, y - h], [X1, y - h * .6], [X1, y + h * .6], [X1 - e, y + h], [X0 + e, y + h * .6], [X0, y + h * .36]]), zc + Rb * .8 * Math.sin(a)]; }, { role });
    for (const xb of [-9.2, -4, 1.4, 6.4, 9.2]) { const xx = x + xb * k, ty = Rb * taper(xx) * 1.01, P = []; for (let i = 0; i <= 14; i++) { const fa = (-76 + 204 * i / 14) * Math.PI / 180; P.push([xx, y + ty * Math.cos(fa), zc + Rb * .8 * 1.01 * Math.sin(fa)]); } B.mark(P, { on: body, cls: 'mid', lod: 1 }); }
    ball(B, x + 11.6 * k, y, k, (zc / k) + .2, 2.7, { role, n: 22 });
  }, { w: 38, big: true });

  /* A door standing in a piece of wall: the plinth and the coping, coursed masonry laid in bond, the
     pointed arch in its frame of dressed stone, the two studded leaves with their straps and
     knockers, the step before it, a grille above, and a lantern on its bracket. */
  object('door', 'the door', (R, B, x, y, k) => {
    const role = 'the door';
    B.box(x - 10.4 * k, y - 2.4 * k, x + 10.4 * k, y + 2.4 * k, 0, 1.6 * k, { r: .4, b: .4, role });
    const w = B.box(x - 10 * k, y - 2 * k, x + 10 * k, y + 2 * k, 1.6 * k, 26 * k, { r: .5, b: .5, role });
    const S_ = faceOf(w, 'S'), E_ = faceOf(w, 'E');
    const gap = portal(B, S_, .5, 5.5 * k, 1.6 * k, 12 * k, 7 * k, k);
    masonry(B, S_, 1.6 * k, 26 * k, 2.2 * k, k, z => (z > 21.4 * k && z < 25.4 * k) ? Math.max(gap(z), 1.9 * k / S_.len) : gap(z));
    masonry(B, E_, 1.6 * k, 26 * k, 2.2 * k, k, null);
    { const u0 = .5 - 1.6 * k / S_.len, u1 = .5 + 1.6 * k / S_.len; strap(B, S_, u0, u1, 21.8 * k, 25 * k, { cls: 'mid', lod: 1 }); for (const f of [1 / 3, 2 / 3]) onFace(B, S_, [[u0 + (u1 - u0) * f, 21.8 * k], [u0 + (u1 - u0) * f, 25 * k]]); onFace(B, S_, [[u0, 23.4 * k], [u1, 23.4 * k]]); }
    B.box(x - 10.6 * k, y - 2.6 * k, x + 10.6 * k, y + 2.6 * k, 26 * k, 27.4 * k, { r: .4, b: .4, top: .5 * k, role });
    B.box(x - 6.4 * k, y + 2 * k, x + 6.4 * k, y + 3.4 * k, 0, .8 * k, { r: .3, b: .3, role });
    B.line([[x + 7.6 * k, y + 2 * k, 15.4 * k], [x + 7.6 * k, y + 3.8 * k, 15.6 * k], [x + 7.6 * k, y + 3.8 * k, 13.6 * k]], { role, lod: 1 });
    B.cone(x + 7.6 * k, y + 3.8 * k, 1.2 * k, 12.8 * k, 13.6 * k, { n: 6, tip: .3 * k, role, lod: 1 });
    B.cyl(x + 7.6 * k, y + 3.8 * k, .9 * k, 10.8 * k, 12.8 * k, { n: 6, b: .15, top: .82, role, lod: 1 });
  }, { w: 22, big: true });

  /* A city gate: two towers on battered plinths with arrow slits, a string course, corbels under the
     battlements and a banner on the right; between them the pointed arch in its frame, its leaves
     studded and strapped, an inscription plate above, and masonry laid in bond all over. */
  object('gate', 'the gate', (R, B, x, y, k) => {
    const role = 'the gate';
    const g = B.box(x - 9 * k, y - 5 * k, x + 9 * k, y + 5 * k, 0, 24 * k, { r: .6, b: .5, role });
    const GS = faceOf(g, 'S'), GE = faceOf(g, 'E');
    const gap = portal(B, GS, .5, 5 * k, 0, 10 * k, 7 * k, k, { frame: 1.6 });
    const pu0 = .5 - 4.2 * k / GS.len, pu1 = .5 + 4.2 * k / GS.len;
    masonry(B, GS, 0, 24 * k, 2.8 * k, k, z => (z > 18.6 * k && z < 22.8 * k) ? Math.max(gap(z), 4.3 * k / GS.len) : gap(z));
    masonry(B, GE, 0, 24 * k, 2.8 * k, k, null);
    strap(B, GS, pu0, pu1, 19.2 * k, 22.2 * k, { cls: 'mid', lod: 1 });
    for (const [z, f] of [[21.3, .8], [20.6, .65], [19.9, .72]]) onFace(B, GS, [[.5 - (pu1 - .5) * f, z * k], [.5 + (pu1 - .5) * f, z * k]], { lod: 1 });
    B.crenels({ on: g, every: 3 * k, h: 1.6 * k, sides: 'SE' });
    for (const s of [-1, 1]) {
      const cx = x + s * 13.6 * k;
      B.box(cx - 5.2 * k, y - 6.6 * k, cx + 5.2 * k, y + 6.6 * k, 0, 3.2 * k, { r: .6, b: .5, top: .6 * k, role });
      const t = B.box(cx - 4.6 * k, y - 6 * k, cx + 4.6 * k, y + 6 * k, 3.2 * k, 31 * k, { r: .6, b: .5, role });
      for (const side of ['S', 'E']) {
        const F = faceOf(t, side);
        masonry(B, F, 3.2 * k, 26.4 * k, 2.8 * k, k, z => ((z > 8.8 * k && z < 11.7 * k) || (z > 14.4 * k && z < 17.3 * k)) ? .7 * k / F.len : 0);
        course(B, F, 20 * k, { cls: 'mid', lod: 1 }); course(B, F, 26.4 * k, { cls: 'lo', lod: 1 }); course(B, F, 27.6 * k, { cls: 'mid', lod: 1 });
        for (let u = .06; u < .99; u += .11) onFace(B, F, [[u, 26.4 * k], [u, 27.6 * k]]);
        if (side === 'S' || s > 0) for (const z0 of [9, 14.6]) strap(B, F, .5 - .4 * k / F.len, .5 + .4 * k / F.len, z0 * k, (z0 + 2.4) * k, { cls: 'edge', lod: 1 });
      }
      B.crenels({ on: t, every: 3 * k, h: 1.6 * k, sides: 'SE' });
    }
    const top = [x + 13.6 * k, y, 32.6 * k];
    B.line([[top[0], top[1], 31 * k], [top[0], top[1], 38.6 * k]], { w: 1.2, role, lod: 1 });
    const L = lat(); B.plate([[top[0], top[1], 38.4 * k], [top[0] + L[0] * 6 * k, top[1] + L[1] * 6 * k, 37.2 * k], [top[0], top[1], 35.6 * k]], { role, lod: 1 });
  }, { w: 40, big: true });

  /* A tree, by chance a cypress in its stone curb (for a grave or a garden's edge), its foliage in
     scalloped tiers, or a round-headed sycamore on its flared trunk, its crown in four masses. */
  object('tree', 'the tree', (R, B, x, y, k) => {
    const role = 'the tree';
    if (R() < .5) {
      const curb = B.cyl(x, y, 3.6 * k, 0, 1 * k, { n: 24, b: .5, role });
      flatRing(B, curb, x, y, 1 * k, 2 * k);
      B.cyl(x, y, .9 * k, 1 * k, 2.4 * k, { n: 12, b: 0, role });
      const rc = z => 6.2 * Math.pow(Math.sin(Math.PI * (.3 + .7 * (z - 1.8) / 32.2)), .8) * (1 - .25 * (z - 1.8) / 32.2);
      const cr = turn(B, x, y, k, rc, 1.8, 34, 22, { role, n: 40 });
      for (let z = 6; z < 31; z += 3.2) { const P = []; for (let i = 0; i <= 56; i++) { const a = i / 56 * TAU, zz = z + .7 * Math.abs(Math.sin(a * 5)); P.push([x + (rc(zz) + .04) * k * Math.cos(a), y + (rc(zz) + .04) * k * Math.sin(a), zz * k]); } B.mark(P, { axis: [x, y], on: cr, cls: 'lo', lod: z % 2 < 1 ? 1 : 2 }); }
      return;
    }
    B.lathe(x, y, [[2 * k, 0], [1.3 * k, 1.1 * k]], { n: 16, role });
    const tr = B.lathe(x, y, [[1.3 * k, 1.1 * k], [1 * k, 12 * k]], { n: 16, role });
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .4, P = []; for (let j = 0; j <= 4; j++) { const z = 1.4 + 9 * j / 4; P.push([x + 1.25 * k * Math.cos(a + j * .12), y + 1.25 * k * Math.sin(a + j * .12), z * k]); } B.mark(P, { axis: [x, y], on: tr, cls: 'lo', lod: 2 }); }
    for (const [dx, dy, z] of [[-3, 1.4, 17], [3, -1.6, 18]]) B.line([[x, y, 10 * k], [x + dx * k, y + dy * k, z * k]], { w: 1.8, role, lod: 1 });
    for (const [dx, dy, zc, r] of [[0, 0, 20, 6.2], [-3.6, 2, 16.6, 4.4], [3.4, -2.4, 17.4, 4.8], [1.4, 3.6, 15.6, 4]]) {
      const p = ball(B, x + dx * k, y + dy * k, k, zc, r, { role, n: 36, rings: 14 });
      for (let i = 0; i < 7; i++) { const a = i * 2.4 + dx, e = .2 + (i % 3) * .25, nx = Math.cos(a) * Math.cos(e), ny = Math.sin(a) * Math.cos(e), nz = Math.sin(e), cx = x + dx * k + nx * r * k, cy = y + dy * k + ny * r * k, cz = (zc + nz * r) * k;
        const P = []; for (let j = 0; j <= 6; j++) { const t = j / 6 * Math.PI; P.push([cx - ny * .9 * k * Math.cos(t), cy + nx * .9 * k * Math.cos(t), cz + .5 * k * Math.sin(t)]); } B.mark(P, { on: p, n: [nx, ny, nz], cls: 'lo', lod: 2 }); }
    }
  }, { w: 16, big: true });

  /* A date palm: the trunk in leaning lengths ringed with old leaf bases, a boss at the crown, seven
     fronds drooping, each a blade with its midrib and leaflets, and two clusters of dates. */
  object('palm', 'the palm', (R, B, x, y, k) => {
    const role = 'the palm', h = 50 * k, lx = h * .06 * (R() - .5) * 2, ly = h * .06 * (R() - .5) * 2;
    B.lathe(x, y, [[2.4 * k, 0], [1.6 * k, 1.2 * k]], { n: 16, role });
    const N = 5, at = t => [x + lx * t * t, y + ly * t * t, 1.2 * k + (h - 1.2 * k) * t], rad = t => (1.6 - .6 * t) * k;
    for (let i = 0; i < N; i++) {
      const a = at(i / N), b = at((i + 1) / N), p = B.ring(ISO.circ(rad(i / N), 14, a[0], a[1]), a[2], b[2], { lid: ISO.circ(rad((i + 1) / N), 14, b[0], b[1]), b: 0, role });
      for (let j = 1; j < 3; j++) { const t = (i + j / 3) / N, c = at(t), r = rad(t) + .03 * k, P = []; for (let q = 0; q <= 28; q++) { const an = q / 28 * TAU; P.push([c[0] + r * Math.cos(an), c[1] + r * Math.sin(an), c[2] + (q % 2 ? .5 : -.5) * k]); } B.mark(P, { axis: [c[0], c[1]], on: p, cls: 'lo', lod: 2 }); }
    }
    const T = at(1);
    ball(B, T[0], T[1], k, T[2] / k + .6, 1.8, { role, n: 16 });
    const n = 7, a0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + R.r(-.2, .2), Lf = h * R.r(.36, .46), droop = R.r(.2, .42), c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
      const C = t => [T[0] + c * Lf * t, T[1] + s * Lf * t, T[2] + .9 * k + Lf * (.42 * t - (.42 + droop) * t * t)], W = t => Lf * .15 * Math.sin(Math.PI * Math.pow(t, .7));
      const left = [], right = [];
      for (let j = 0; j <= 10; j++) { const t = j / 10, p = C(t), w = W(t); left.push([p[0] + px * w, p[1] + py * w, p[2] - .35 * w]); right.push([p[0] - px * w, p[1] - py * w, p[2] - .35 * w]); }
      const fr = B.plate(left.concat(right.slice(1, -1).reverse()), { role });
      B.mark([0, .25, .5, .75, 1].map(C), { on: fr, cls: 'lo', lod: 1 });
      for (let j = 1; j < 9; j++) { const t = j / 10, p = C(t), q = C(t + .07), w = W(t + .07); for (const sg of [-1, 1]) B.mark([p, [q[0] + sg * px * w, q[1] + sg * py * w, q[2] - .35 * w]], { on: fr, cls: 'lo', lod: 2 }); }
    }
    for (const [da, dz] of [[.8, -2.4], [3.6, -2.8]]) { const cx = T[0] + Math.cos(a0 + da) * 1.6 * k, cy = T[1] + Math.sin(a0 + da) * 1.6 * k; turn(B, cx, cy, k, z => 1.4 * Math.sin(Math.PI * (.12 + .88 * (z - (T[2] / k + dz - 2.6)) / 2.6)), T[2] / k + dz - 2.6, T[2] / k + dz, 6, { role, n: 14, lod: 1 }); }
  }, { w: 30, big: true });

  /* A well: the round curb of coursed stone laid in bond, the wide coping round the mouth and the
     water ringed below; two posts with caps and the beam across, the pulley wheel hung in its
     fork, the rope over it to the bucket with its staves, bands and bail, its end made fast to a post. */
  object('well', 'the well', (R, B, x, y, k) => {
    const role = 'the well', A = frameAt(x, y, k), F = fwd(), nF = [F[0], F[1], 0];
    const curb = B.cyl(x, y, 8 * k, 0, 5.4 * k, { n: 32, b: 0, role });
    const cz = [0, 1.8, 3.6, 5.4];
    for (let i = 1; i < 3; i++) girdle(B, x, y, cz[i] * k, 8.02 * k, curb, 'lo', 1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 12; j++) { const a = (j + (i % 2) * .5) / 12 * TAU; B.mark([[x + 8.02 * k * Math.cos(a), y + 8.02 * k * Math.sin(a), cz[i] * k], [x + 8.02 * k * Math.cos(a), y + 8.02 * k * Math.sin(a), cz[i + 1] * k]], { on: curb, axis: [x, y], cls: 'lo', lod: 2 }); }
    const cop = B.cyl(x, y, 8.6 * k, 5.4 * k, 6.4 * k, { n: 36, b: 1.6 * k, role });
    for (const r of [1.4, 2.8, 4.4]) flatRing(B, cop, x, y, 6.4 * k, r * k);
    for (const s of [-1, 1]) { const [px, py] = A(s * 10.2, 0, 0); B.box(px - .9 * k, py - .9 * k, px + .9 * k, py + .9 * k, 0, 19 * k, { r: .3, b: .2, role }); }
    const beam = []; for (const [u, v] of [[-11.4, -.8], [11.4, -.8], [11.4, .8], [-11.4, .8]]) beam.push(A(u, v, 0).slice(0, 2));
    B.prism(beam, 19 * k, 20.4 * k, { b: .3, role });
    for (const s of [-1, 1]) { const [px, py] = A(s * 10.2, 0, 0); turn(B, px, py, k, z => z < 21 ? 1 : 1 - (z - 21) / 1.6, 20.4, 22.6, 4, { role, n: 4, even: true }); }
    const pz = 17, pr = 1.8, disc = []; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; disc.push(A(pr * Math.cos(a), 0, pz + pr * Math.sin(a))); }
    const pw = B.plate(disc, { role });
    B.mark(circ3(0, 0, 0, .45, 12).map(([a, b]) => A(a, .01, pz + b)), { on: pw, n: nF, cls: 'mid', lod: 1 });
    B.mark(circ3(0, 0, 0, 1.4, 24).map(([a, b]) => A(a, .01, pz + b)), { on: pw, n: nF, cls: 'lo', lod: 1 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.mark([A(.45 * Math.cos(a), .01, pz + .45 * Math.sin(a)), A(1.4 * Math.cos(a), .01, pz + 1.4 * Math.sin(a))], { on: pw, n: nF, cls: 'lo', lod: 2 }); }
    for (const v of [-.5, .5]) B.line([A(0, v, pz), A(0, v, 19)], { role, lod: 1 });
    B.line([A(1.8, 0, pz), A(1.8, 0, 13.9)], { role });
    B.line([A(-1.8, 0, pz), A(-5.6, 0, 11.6), A(-9.3, 0, 9)], { role });
    const bx = A(1.8, 0, 0), rb = z => 1.8 + .5 * (z - 9.6) / 2.8;
    const bk = turn(B, bx[0], bx[1], k, rb, 9.6, 12.4, 4, { role, n: 22, even: true });
    for (const z of [10, 12]) girdle(B, bx[0], bx[1], z * k, (rb(z) + .02) * k, bk, 'mid', 1);
    for (let j = 0; j < 10; j++) { const a = j / 10 * TAU; B.mark([[bx[0] + (rb(10) + .02) * k * Math.cos(a), bx[1] + (rb(10) + .02) * k * Math.sin(a), 10 * k], [bx[0] + (rb(12) + .02) * k * Math.cos(a), bx[1] + (rb(12) + .02) * k * Math.sin(a), 12 * k]], { on: bk, axis: [bx[0], bx[1]], cls: 'lo', lod: 2 }); }
    const bl = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; bl.push(A(1.8 + Math.cos(a) * 2.3, 0, 12.4 + Math.sin(a) * 1.5)); } B.line(bl, { role, lod: 1 });
  }, { w: 24, big: true });

  /* A boat: the hull in strakes, the gunwale and the deck ribs between it, stem and sternpost, two
     thwarts, two oars in their tholes on the near side, the mast with its cap, stays to stem and
     stern, the lateen yard and the sail with its seams, the sheet, and the rudder with its tiller. */
  object('boat', 'the boat', (R, B, x, y, k) => {
    const role = 'the boat', L = 40 * k, W = 12 * k, zg = 5.4 * k;
    const hl = sweep(B, 8, t => { const e = Math.sin(t * Math.PI / 2); return [ISO.lens(L * (.7 + .3 * e), W * (.38 + .62 * e), x, y, 16), zg * t]; }, { role });
    for (const t of [.3, .55, .8]) { const e = Math.sin(t * Math.PI / 2); B.mark(nearRun(ringPts(ISO.lens(L * (.7 + .3 * e) + .05 * k, W * (.38 + .62 * e) + .05 * k, x, y, 24)), zg * t), { on: hl, cls: 'lo', lod: t === .55 ? 1 : 2 }); }
    const gw = B.ring(ISO.lens(L + .4 * k, W + .4 * k, x, y, 10), zg, zg + .6 * k, { lid: ISO.lens(L + .5 * k, W + .5 * k, x, y, 10), b: .8 * k, role });
    const hw = dx => (W + .5 * k) / 2 * Math.pow(Math.max(0, 1 - (dx / ((L + .5 * k) / 2)) ** 2), .7);
    for (let dx = -14; dx <= 14; dx += 3.5) { const h = hw(dx * k) - .9 * k; if (h > .3 * k) B.mark([[x + dx * k, y - h, zg + .6 * k], [x + dx * k, y + h, zg + .6 * k]], { on: gw, n: [0, 0, 1], cls: 'lo', lod: 2 }); }
    B.line([[x + L / 2, y, zg - 2 * k], [x + L / 2 + 1.4 * k, y, zg + 1.6 * k], [x + L / 2 + 2.2 * k, y, zg + 4.8 * k]], { w: 2, role });
    B.line([[x - L / 2, y, zg - 2 * k], [x - L / 2 - .9 * k, y, zg + 1.6 * k], [x - L / 2 - 1.3 * k, y, zg + 3.6 * k]], { w: 2, role });
    for (const dx of [-7, 7]) { const h = hw(dx * k) - .7 * k; B.box(x + dx * k - .8 * k, y - h, x + dx * k + .8 * k, y + h, zg + .6 * k, zg + 1.2 * k, { r: .2, b: .15, role, lod: 1 }); }
    for (const dx of [-3.4, 9.4]) {
      const yy = y + hw(dx * k) - .2 * k;
      B.cyl(x + dx * k, yy, .3 * k, zg + .6 * k, zg + 1.8 * k, { n: 8, b: 0, role, lod: 2 });
      const tip = [x + (dx + 4.2) * k, y + hw(dx * k) + 8.6 * k, .3 * k];
      B.line([[x + (dx - 1.4) * k, yy - 2.8 * k, zg + 1.6 * k], [x + dx * k, yy, zg + 1.3 * k], tip], { w: 1.3, role, lod: 1 });
      const d = [tip[0] - (x + dx * k), tip[1] - yy], dl = Math.hypot(d[0], d[1]), ux = d[0] / dl, uy = d[1] / dl;
      B.plate([[tip[0] - ux * 2.6 * k - uy * .7 * k, tip[1] - uy * 2.6 * k + ux * .7 * k, .9 * k], [tip[0] - uy * .9 * k, tip[1] + ux * .9 * k, .1 * k], [tip[0] + ux * .6 * k, tip[1] + uy * .6 * k, .05 * k], [tip[0] + uy * .9 * k, tip[1] - ux * .9 * k, .1 * k], [tip[0] - ux * 2.6 * k + uy * .7 * k, tip[1] - uy * 2.6 * k - ux * .7 * k, .9 * k]], { role, lod: 1 });
    }
    B.cyl(x, y, .55 * k, zg + .6 * k, 34 * k, { n: 10, b: 0, role });
    B.cyl(x, y, .8 * k, 34 * k, 35 * k, { n: 10, b: .2, role, lod: 1 });
    B.line([[x, y, 34.4 * k], [x + L / 2 + 2.1 * k, y, zg + 4.6 * k]], { role, lod: 1 });
    B.line([[x, y, 34.4 * k], [x - L / 2 - 1.2 * k, y, zg + 3.4 * k]], { role, lod: 1 });
    const y0 = [x - 17 * k, y + .3 * k, 11.4 * k], y1 = [x + 15 * k, y + .3 * k, 37.4 * k];
    const sl = [x - 16 * k, y + .3 * k, 12.2 * k], sh = [x + 14 * k, y + .3 * k, 36.2 * k], cl = [x + 6 * k, y + .3 * k, 8.4 * k];
    const sail = B.plate([sl, sh, cl], { role });
    for (const t of [.2, .4, .6, .8]) B.mark([[sl[0] + (sh[0] - sl[0]) * t, sl[1], sl[2] + (sh[2] - sl[2]) * t], [sl[0] + (cl[0] - sl[0]) * t, sl[1], sl[2] + (cl[2] - sl[2]) * t]], { on: sail, cls: 'lo', lod: 2 });   // seams along the leech
    B.line([y0, y1], { w: 1.6, role });
    B.line([cl, [x - 13 * k, y + hw(-13 * k), zg + .6 * k]], { role, lod: 1 });
    B.plate([[x - L / 2 - .6 * k, y, zg - .4 * k], [x - L / 2 - 3.2 * k, y, 2.6 * k], [x - L / 2 - 3.4 * k, y, .2 * k], [x - L / 2 - 1 * k, y, .2 * k]], { role, lod: 1 });
    B.line([[x - L / 2 - .9 * k, y, zg + .2 * k], [x - L / 2 + 3 * k, y, zg + 1.4 * k]], { w: 1.3, role, lod: 1 });
  }, { w: 44, big: true });

  /* The anchor: the ring with a hawser bent through it, the stock with its knobs, the shank to the
     crown, the arms and their broad flukes; and the hawser, laid over the stock's end, falling beside the fluke to its coil. */
  const ANCHOR = { pieces: [
    () => [Ci(50, 10, 6), cut(Ci(50, 10, 3.4)), Li(34, 22, 2, 66, 22, 2), Ci(33, 22, 2.8), Ci(67, 22, 2.8), Li(50, 15, 2.4, 50, 86, 3), Ci(50, 88, 3.6),
      Ch([[50, 88, 2.6], [40, 84, 2.2], [30, 74, 1.8], [26, 66, 1.4]]), Ch([[50, 88, 2.6], [60, 84, 2.2], [70, 74, 1.8], [74, 66, 1.4]]),
      Po([[19.6, 71], [25.4, 57.6], [32.6, 70.4], [27.4, 75]]), Po([[80.4, 71], [74.6, 57.6], [67.4, 70.4], [72.6, 75]])]],
    lines: ['M 50 24 L 50 84.4', 'M 23 70 L 27.4 61.6', 'M 77 70 L 72.6 61.6', ring(50, 10, 4.7)] };
  object('anchor', 'the anchor', (R, B, x, y, k) => {
    const role = 'the anchor', A = frameAt(x, y, k);
    puppet(B, x, y, 18 * k, ANCHOR, { fixed: true, role });
    const [cx, cy] = A(-6.2, 5.4, 0), co = B.cyl(cx, cy, 3.4 * k, 0, 1.8 * k, { n: 40, b: 1.2 * k, role });
    for (const z of [.6, 1.2]) girdle(B, cx, cy, z * k, 3.42 * k, co, 'lo', 1);
    { const P = []; for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * 3 * TAU, r = 2.2 + 1.05 * t; P.push([cx + r * k * Math.cos(a), cy + r * k * Math.sin(a), 1.8 * k]); } B.mark(P, { on: co, n: [0, 0, 1], cls: 'lo', lod: 1 }); }
    B.line([A(-.8, .1, 16.1), A(-1.9, .3, 15.3), A(-2.8, .5, 14.7), A(-3.4, .7, 13.6), A(-4.5, 1.1, 9.4), A(-5.4, 1.5, 5.6), A(-6.1, 1.9, 3), A(-6.4, 2.1, 1.8)], { w: 1.6, role });
  }, { w: 18 });

  /* Bales of goods: two on the ground and one across them, each a swelling bundle in its canvas,
     corded both ways with a knot where the cords cross, the merchant's mark on the front one; and
     a bolt of cloth before them, its rolled end showing. */
  object('bales', 'the bales', (R, B, x, y, k) => {
    const role = 'the bales', bulge = .9 * k;
    const bale = (x0, y0, x1, y1, z0, z1, mark) => {
      const ins = t => bulge * (2 * t - 1) ** 2, b = sweep(B, 10, t => [rr(x0 + ins(t), y0 + ins(t), x1 - ins(t), y1 - ins(t), 1.6 * k), z0 + (z1 - z0) * t], { role });
      const h = z1 - z0, ys = t => y1 - ins(t), xs = t => x1 - ins(t);
      for (const f of [.3, .7]) { const xc = x0 + (x1 - x0) * f, P = []; for (let i = 0; i <= 10; i++) P.push([xc, ys(i / 10), z0 + h * i / 10]); P.push([xc, y0 + bulge + .6 * k, z1]); B.mark(P, { on: b, cls: 'mid', lod: 1 }); }
      { const yc = (y0 + y1) / 2, P = []; for (let i = 0; i <= 10; i++) P.push([xs(i / 10), yc, z0 + h * i / 10]); P.push([x0 + bulge + .6 * k, yc, z1]); B.mark(P, { on: b, cls: 'mid', lod: 1 }); }
      for (const f of [.3, .7]) stud(B, b, [x0 + (x1 - x0) * f, (y0 + y1) / 2, z1], .35 * k, [0, 0, 1]);
      if (mark) { const mx = (x0 + x1) / 2, my = y1 - .02 * k, mz = z0 + h * .5; B.mark(circ3(0, 0, 0, 1.3 * k, 18).map(([a, c]) => [mx + a, my, mz + c]), { on: b, n: [0, 1, 0], cls: 'mid', lod: 1 }); B.mark([[mx, my, mz - 1.3 * k], [mx, my, mz + 2.6 * k], [mx + 1 * k, my, mz + 2 * k]], { on: b, n: [0, 1, 0], cls: 'mid', lod: 1 }); B.mark([[mx - 1.3 * k, my, mz], [mx + 1.3 * k, my, mz]], { on: b, n: [0, 1, 0], cls: 'mid', lod: 1 }); }
    };
    bale(x - 11 * k, y - 4 * k, x - .4 * k, y + 4 * k, 0, 7 * k, false);
    bale(x + .4 * k, y - 4 * k, x + 11 * k, y + 4 * k, 0, 7 * k, true);
    bale(x - 6 * k, y - 3.6 * k, x + 6 * k, y + 3.6 * k, 7 * k, 13.4 * k, false);
    const ry0 = y + 4.6 * k, ry1 = y + 12.4 * k, rx = x + 6 * k, Rr = 1.5 * k;
    const bo = bar(B, 'y', ry0, ry1, rx, Rr * .98, Rr, { steps: 8, end: .2 * k, role });
    { const P = []; for (let i = 0; i <= 50; i++) { const t = i / 50, a = t * 2.6 * TAU, r = .15 * k + 1.25 * k * t; P.push([rx + r * Math.cos(a), ry1 + .02 * k, Rr * .98 + r * Math.sin(a)]); } B.mark(P, { on: bo, n: [0, 1, 0], cls: 'lo', lod: 1 }); }
  }, { w: 26, big: true });

  /* A sack, lumpy and full, tied at the neck with a cord wound round it, its folds, the seam above
     the base and a merchant's mark stencilled on it; grain spilled before it and the measure. */
  const SACK = { pieces: [() => [Po('M 30 99.6 C 21 90 21 72 27 58 C 31 48 37 41 43.6 37 L 42.6 31 L 57.4 31 L 56.4 37 C 63 41 69 48 73 58 C 79 72 79 90 70 99.6 Z'), Po('M 42 31 C 37 24 40 16 45.6 21.6 C 47 13 53 13 54.4 21.6 C 60 16 63 24 58 31 Z'), Li(41, 33, 2, 59, 33, 2)]],
    lines: ['M 36 60 C 42 66 46 76 46 88', 'M 64 56 C 62 66 62 78 66 90', 'M 50 42 C 50 50 52 56 56 60', 'M 41.6 31.6 L 58.4 34', 'M 41.4 34.4 L 58.6 32', 'M 25.6 94.6 C 40 96.6 60 96.6 74.4 94.6', ring(52, 72, 6), 'M 52 66 L 52 78', 'M 46 72 L 58 72'] };
  object('sack', 'the sack', (R, B, x, y, k) => {
    const role = 'the sack', A = frameAt(x, y, k);
    puppet(B, x, y, 17 * k, SACK, { fixed: true, role });
    const [gx, gy] = A(3, 6.4, 0), heap = turn(B, gx, gy, k, z => 3.6 * Math.sqrt(Math.max(0, 1 - z / 1.5)), 0, 1.5, 6, { role, n: 24, even: true });
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = .6 + (i % 3) * .9, z = 1.5 * (1 - (r / 3.6) ** 2), s = 1.5 * 2 * r / 12.96, L = Math.hypot(s, 1); stud(B, heap, [gx + r * k * Math.cos(a), gy + r * k * Math.sin(a), z * k], .2 * k, [Math.cos(a) * s / L, Math.sin(a) * s / L, 1 / L], { cls: 'lo' }); }
    const [mx, my] = A(-5.4, 5.2, 0), ms = B.lathe(mx, my, [[1.5 * k, 0], [1.9 * k, 2.6 * k], [2 * k, 3 * k]], { n: 24, role });
    girdle(B, mx, my, .8 * k, 1.62 * k, ms, 'mid', 1); girdle(B, mx, my, 2.3 * k, 1.87 * k, ms, 'mid', 1);
    flatRing(B, ms, mx, my, 3 * k, 1.6 * k, { lod: 1 });
  });

  /* A fire on its hearth: a ring of stones, the bed of ash and embers, four logs leant together, the
     flames rising with sparks flying up. */
  object('fire', 'the fire', (R, B, x, y, k) => {
    const role = 'the fire';
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .2, r = 6.6 * k, s = 1.25 + .45 * Math.sin(i * 2.7); turn(B, x + r * Math.cos(a), y + r * Math.sin(a), k, ell(s, .55 * s, .9 * s), 0, 1.45 * s, 5, { role, n: 9 }); }
    const ash = turn(B, x, y, k, ell(5, 0, .7), 0, .6, 4, { role, n: 28 });
    for (let i = 0; i < 10; i++) { const a = i * 2.4, r = 1.2 + (i % 4) * .9; stud(B, ash, [x + r * k * Math.cos(a), y + r * k * Math.sin(a), .55 * k], .22 * k, [0, 0, 1], { cls: 'lo' }); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .45, c = Math.cos(a), s = Math.sin(a); const p = B.ring(ISO.circ(.62 * k, 12, x + c * 4.4 * k, y + s * 4.4 * k), .3 * k, 4.4 * k, { lid: ISO.circ(.45 * k, 12, x + c * 1.3 * k, y + s * 1.3 * k), b: 0, role }); stud(B, p, [x + c * 4.6 * k, y + s * 4.6 * k, .7 * k], .35 * k, [c, s, .3], { cls: 'lo', lod: 2 }); }
    puppet(B, x, y, 19 * k, { pieces: [() => [Po('M 50 100 C 28 98 22 84 30 70 C 33 64 31 56 36 48 C 38 56 42 60 45 64 C 44 50 48 36 46 20 C 56 34 62 48 60 62 C 63 58 66 52 66 44 C 73 56 76 70 74 80 C 72 92 64 100 50 100 Z'), Po('M 38 14 C 36 10 38 6 40 4 C 41 7 42 10 38 14 Z'), Po('M 62 30 C 61 26 63 23 65 22 C 65.4 25 65 28 62 30 Z'), Po('M 54 6 C 53 3 54.6 1 56 0 C 56.4 2.4 56 4.4 54 6 Z')]],
      lines: ['M 50 94 C 44 88 44 80 48 72', 'M 56 92 C 60 86 60 80 58 76', 'M 40 90 C 36 84 37 78 40 74'] }, { z: 1.4 * k, fixed: true, role });
  });

  /* A fountain: the octagonal basin with a carved panel in each face and a moulding over them, the
     coping round the water and its ripples, the baluster column on its base, the bowl and its lip,
     a pine cone on top whose jets fall back into the bowl, and the bowl overflowing in curtains. */
  object('fountain', 'the fountain', (R, B, x, y, k) => {
    const role = 'the fountain';
    const bs = B.cyl(x, y, 12 * k, 0, 3.4 * k, { n: 8, b: 0, rot: Math.PI / 8, role });
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI / 8 + i / 8 * TAU, a1 = a0 + TAU / 8, P0 = [x + 12 * k * Math.cos(a0), y + 12 * k * Math.sin(a0)], P1 = [x + 12 * k * Math.cos(a1), y + 12 * k * Math.sin(a1)];
      const F = { at: (u, z) => [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u, z], n: [Math.cos(a0 + TAU / 16), Math.sin(a0 + TAU / 16), 0], len: 9.2 * k, p: bs };
      strap(B, F, .14, .86, .7 * k, 2.6 * k); course(B, F, 2.9 * k, { lod: 1 });
    }
    const cop = B.cyl(x, y, 12.8 * k, 3.4 * k, 4.2 * k, { n: 8, b: 1.4 * k, rot: Math.PI / 8, role });
    for (const r of [4, 6.4, 8.8]) flatRing(B, cop, x, y, 4.2 * k, r * k, { n: 40 });
    B.cyl(x, y, 2.4 * k, 4.2 * k, 5 * k, { n: 20, b: .3, role });
    turn(B, x, y, k, z => .9 + 1 * Math.sin(Math.PI * (z - 5) / 3.6), 5, 8.6, 8, { role, n: 20, even: true });
    B.cyl(x, y, .8 * k, 8.6 * k, 10.2 * k, { n: 16, b: 0, role });
    B.lathe(x, y, [[.8 * k, 10.2 * k], [2 * k, 10.8 * k]], { n: 20, role });
    const rb = z => 1.6 + 4 * (1 - (1 - (z - 10.8) / 1.8) ** 2.4);
    turn(B, x, y, k, rb, 10.8, 12.6, 8, { role, n: 48, even: true });
    const lip = B.lathe(x, y, [[5.6 * k, 12.6 * k], [5.9 * k, 12.9 * k], [5.8 * k, 13.2 * k]], { n: 32, role });
    flatRing(B, lip, x, y, 13.2 * k, 5.3 * k, { lod: 1 });
    turn(B, x, y, k, z => 1 * Math.sin(Math.PI * (.15 + .85 * (z - 13.2) / 2.2)), 13.2, 15.4, 6, { role, n: 14 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .6, c = Math.cos(a), s = Math.sin(a); B.line([[x, y, 15.4 * k], [x + c * 1.6 * k, y + s * 1.6 * k, 16.6 * k], [x + c * 3.2 * k, y + s * 3.2 * k, 15.6 * k], [x + c * 4.4 * k, y + s * 4.4 * k, 13.2 * k]], { role, cls: 'mid' }); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .25, c = Math.cos(a), s = Math.sin(a); B.line([[x + c * 5.9 * k, y + s * 5.9 * k, 12.9 * k], [x + c * 6.8 * k, y + s * 6.8 * k, 11.4 * k], [x + c * 7.3 * k, y + s * 7.3 * k, 7.4 * k], [x + c * 7.4 * k, y + s * 7.4 * k, 4.2 * k]], { role, cls: 'lo', lod: 1 }); }
  }, { w: 26, big: true });

  /* The three apples of Bassorah on a dish: the foot and the dish with its rim and an engraved ring,
     three apples each with its stem, and a leaf on one. */
  object('apples', 'the apples', (R, B, x, y, k) => {
    const role = 'the apples';
    B.cyl(x, y, 4 * k, 0, .5 * k, { n: 28, b: .2, role });
    const d = B.lathe(x, y, [[4.2 * k, .5 * k], [7 * k, 1.2 * k], [8 * k, 1.8 * k], [8.2 * k, 2 * k]], { n: 40, role });
    flatRing(B, d, x, y, 2 * k, 7.4 * k, { cls: 'mid', lod: 1, n: 40 }); flatRing(B, d, x, y, 2 * k, 5.4 * k, { n: 40 });
    const ra = z => 2.6 * Math.pow(Math.sin(Math.PI * (.1 + .82 * (z - 1.8) / 4.4)), .7);
    for (const [dx, dy, i] of [[-3, -1.6, 0], [2.6, -2, 1], [0, 2.6, 2]]) {
      const ax = x + dx * k, ay = y + dy * k;
      const ap = turn(B, ax, ay, k, ra, 1.8, 6.2, 14, { role, n: 40 });
      flatRing(B, ap, ax, ay, 6.2 * k, .55 * k, { n: 14 });
      B.line([[ax, ay, 6.2 * k], [ax + .25 * k, ay, 7 * k], [ax + .6 * k, ay - .2 * k, 7.5 * k]], { w: 1.4, role, lod: 1 });
      if (i === 2) { const L = lat(), f = fwd(), b = [ax + .5 * k, ay - .15 * k, 7.3 * k], t = [b[0] + L[0] * 2.4 * k + f[0] * .6 * k, b[1] + L[1] * 2.4 * k + f[1] * .6 * k, 6.9 * k], m = [(b[0] + t[0]) / 2, (b[1] + t[1]) / 2];
        const leaf = B.plate([b, [m[0] + f[0] * .75 * k, m[1] + f[1] * .75 * k, 7.15 * k], t, [m[0] - f[0] * .75 * k, m[1] - f[1] * .75 * k, 7.3 * k]], { role, lod: 1 });
        B.mark([b, t], { on: leaf, cls: 'lo', lod: 2 }); }
    }
  });

  /* =====================================================================
   * 4. THE LEXICON: the words of Burton's Nights that name a figure, a beast or a thing.
   * [prop, words, weight, plural]. The weight says how much the word shows: a concrete,
   * particular noun (the Ifrit, the lamp, the net) outweighs a vague one (a woman, the door).
   * Words for the place itself (the sea, the palace, the garden) belong to the base, not here.
   * ===================================================================== */
  const W = (s, flags) => new RegExp('\\b(?:' + s + ')\\b', 'gi');
  const LEX = [
    // the people
    ['caliph', W("caliph|caliphs|khalifah of the age|commander of the faithful|harun|haroun|al-rashid|rashid|al-maamun|al-mamun|mamun|al-mutawakkil|mutawakkil|al-hakim|hisham|al-amin"), 3.2],
    ['king', W("king|sultan|shah|shahryar|shahriyar|shah zaman|monarch|kisra|anushirwan|al-malik|kings|emir|amir|governor|lord of the land"), 2.4],
    ['wazir', W("wazir|wazirs|vizier|minister|ministers|ja'afar|jaafar|ja'far|barmecide|barmaki|barmakis|shimas|kazi|kadi|cadi|judge"), 2.8],
    ['merchant', W("merchant|merchants|trader|traders|broker|brokers|shroff|jeweller|jewellers|money-changer|druggist|chapman|draper|clothier"), 2.5],
    ['merchant', W("tailor|cook|butcher|grocer|fruiterer|confectioner|perfumer|smith|blacksmith|carpenter|water-carrier|dyer|cobbler|weaver|baker|gardener|shopkeeper"), 1.6],
    ['fisherman', W("fisherman|fishermen|fisher|khalifah|khalif"), 3.4],
    ['porter', W("porter|porters|hammal|zurayk"), 3.2],
    ['lady', W("lady|damsel|maiden|maid|princess|queen|bride|dame|mistress|portress|cateress|shahrazad|scheherazade|dunyazad|zubaydah|sitt|houri"), 2.4],
    ['lady', W("ladies|damsels|maidens|princesses|queens|portresses"), 2.4, 2],
    ['lady', W("wife|daughter|woman|girl|sister|mother|concubine|spouse|handmaid"), 1.6],
    ['lady', W("women|girls|sisters|daughters|wives|concubines"), 1.5, 2],
    ['singer', W("slave-girl|slave girl|singing-girl|singing girl|songstress|singer|lutanist|lute-player|slave-girls|slave girls|singing-women"), 2.8],
    ['oldman', W("shaykh|sheikh|old man|elder|ancient man|greybeard|grey-beard|hermit|devotee|ascetic|sage|imam|pilgrim|anchorite|recluse"), 2.4],
    ['oldman', W("shaykhs|old men|elders|hermits|sages"), 2.4, 2],
    ['youth', W("youth|young man|youngster|stripling|lad|boy|prince|son of the king|king's son|kamar al-zaman|nur al-din|ala al-din|badr al-din|taj al-muluk"), 2.2],
    ['youth', W("youths|young men|boys|lads|princes"), 2.2, 2],
    ['youth', W("son|sons|child|children"), 1],
    ['kalandar', W("kalandar|dervish|darwaysh|fakir|santon|mendicant|beggar"), 3.2],
    ['kalandar', W("kalandars|dervishes|fakirs|beggars"), 3.2, 2],
    ['physician', W("physician|physicians|doctor|leech|hakim|duban|mediciner|apothecary|leechcraft"), 3],
    ['barber', W("barber|barber-surgeon|astrolabe|razor"), 3.2],
    ['eunuch', W("eunuch|eunuchs|masrur|kafur|castrato|headsman|sworder|executioner|blackamoor"), 3],
    ['jinni', W("ifrit|ifritah|ifrits|jinni|jinniyah|jinn|jann|marid|marids|ghul|ghulah|genie|demon|devil|evil spirit|contumacious one|ogress|ogre|sakhr"), 4],
    ['sailor', W("sailor|seaman|mariner|captain|rais|boatman|ferryman|helmsman|skipper"), 2.6],
    ['sailor', W("sailors|seamen|mariners|crew|boatmen"), 2.6, 2],
    ['thief', W("thief|robber|sharper|brigand|highwayman|footpad|cutpurse|rogue|housebreaker|knave"), 3],
    ['thief', W("thieves|robbers|sharpers|brigands|highwaymen|rogues"), 3, 2],
    ['sindbad', W("sindbad|traveller|wayfarer|voyager"), 3.2],
    ['oldwoman', W("old woman|old wife|crone|hag|beldam|duenna|go-between|dalilah|old women|ancient dame"), 3],
    ['badawi', W("badawi|badawin|bedouin|bedouins|wild arab|wild arabs|arab of the desert|sons of the desert"), 2.8],
    ['badawi', W("arab|arabs"), 1.6],
    ['guard', W("chief of police|wali|police|guard|watchman|chamberlain|soldier|trooper|warder|gatekeeper|janitor|mameluke|champion|warrior"), 2.4],
    ['guard', W("guards|watchmen|soldiers|troops|troopers|mamelukes|warriors|champions|police-men"), 2.4, 2],
    ['servant', W("slave|servant|page|bondsman|thrall|attendant|cupbearer|cup-bearer|serving-man|black slave|negro"), 1.8],
    ['servant', W("slaves|servants|pages|attendants|thralls|negroes"), 1.8, 2],
    // the beasts
    ['rider', W("horseman|horsemen|rider|riders|cavalier|knight|knights|mounted (?:his|her|the|a|on|upon) (?:horse|steed|mare|charger|courser)"), 3.2],
    ['rider', W("rode|riding|rode forth|mounted and rode"), 1.5],
    ['horse', W("horse|horses|steed|steeds|mare|mares|stallion|charger|chargers|colt|foal|courser|coursers|ebony horse|filly"), 2.9],
    ['camel', W("camel|camels|dromedary|dromedaries|she-camel|she-camels|camel-driver"), 3.1],
    ['ass', W("ass|asses|donkey|donkeys|jackass|he-ass|she-ass|donkey-boy"), 2.9],
    ['mule', W("mule|mules|he-mule|she-mule"), 2.7],
    ['dog', W("dog|dogs|hound|hounds|bitch|cur|curs|greyhound|greyhounds|puppy|wolf|wolves"), 2.7],
    ['lion', W("lion|lions|lioness|lionesses"), 3.1],
    ['ape', W("ape|apes|monkey|monkeys|baboon|baboons"), 3.1],
    ['bull', W("bull|bulls|ox|oxen|cow|cows|calf|calves|heifer|heifers|bullock|steer|kine|cattle|buffalo"), 2.9],
    ['gazelle', W("gazelle|gazelles|antelope|antelopes|deer|roe|fawn|oryx|ibex|wild cow"), 2.9],
    ['bird', W("bird|birds|dove|doves|pigeon|pigeons|sparrow|sparrows|crow|crows|raven|ravens|nightingale|fowl|fowls|cock|hen|parrot|parrots|ukab|eagle|kite|hoopoe|ring-dove|turtle-dove|water-fowl|duck|geese|goose|crane"), 2.5],
    ['falcon', W("falcon|falcons|hawk|hawks|saker|goshawk|falconer"), 3.1],
    ['peacock', W("peacock|peacocks|peahen"), 3.1],
    ['rukh', W("rukh|rukhs|roc|simurgh|anka"), 4.2],
    ['fish', W("fish|fishes|cat-fish|carp|mullet|fishing"), 2.7],
    ['serpent', W("serpent|serpents|snake|snakes|dragon|dragons|viper|vipers|asp|adder|basilisk|worm"), 3.1],
    ['whale', W("whale|whales|great fish|leviathan|sea-monster|monster of the sea"), 3.8],
    ['fox', W("fox|foxes|jackal|jackals"), 2.9],
    // the things
    ['net', W("net|nets|meshes|casting-net|fishing-net|toils"), 3.1],
    ['basket', W("basket|baskets|crate|crates|hamper|hampers|frail|pannier|panniers|creel"), 2.8],
    ['lamp', W("lamp|lamps|lantern|lanterns|cresset|cressets|oil-lamp"), 3.3],
    ['jar', W("jar|pitcher|pitchers|cucurbit|vase|jug|jugs|bottle|bottles|flask|flasks|cruse|amphora|gugglet|vessel of brass|vessel of copper"), 3.1],
    ['jars', W("jars|vases|amphorae|oil-jars"), 3.1],
    ['chest', W("chest|chests|coffer|coffers|box|boxes|casket|caskets|trunk|trunks|strong-box|trunk-market"), 3],
    ['jewels', W("jewel|jewels|gem|gems|pearl|pearls|ruby|rubies|emerald|emeralds|diamond|diamonds|jacinth|jacinths|precious stones|necklace|necklaces|carcanet|carcanets|jewellery|jewelry"), 2.7],
    ['sword', W("sword|swords|scymitar|scymitars|scimitar|scimitars|sabre|sabres|blade|blades|glaive|falchion|drawn sword|brand"), 2.9],
    ['sword', W("dagger|daggers|knife|knives|poniard|hanger|whittle|lance|spear|mace"), 1.8],
    ['throne', W("throne|thrones|chair of state|seat of estate|kingly seat|kingly throne"), 2.9],
    ['couch', W("couch|couches|divan|divans|sofa|sofas|bedstead|mattress|pallet|carpet-bed|settle"), 2.6],
    ['couch', W("bed|beds|cushion|cushions|pillow|pillows|bolster|bolsters"), 2],
    ['carpet', W("carpet|carpets|rug|rugs|prayer-rug|prayer rug|prayer-carpet|mat|mats|matting"), 2.3],
    ['tray', W("tray|trays|table|tables|table-cloth|platter|platters|trencher|trenchers|dish|dishes|food-tray"), 2.5],
    ['tray', W("food|meat|meats|viands|banquet|feast|supper|breakfast|repast|loaves|loaf|sweetmeats|victual|victuals|provaunt|provisions|eat|ate|eaten|eating"), 1.4],
    ['cup', W("cup|cups|goblet|goblets|bowl|bowls|beaker|beakers|cupful|tankard"), 2.7],
    ['cup', W("wine|wines|drank|drink|drinking|carouse|carousing|draught|sherbet"), 1.7],
    ['ewer', W("ewer|ewers|flagon|flagons|water-skin|decanter|basin and ewer|wine-flagon"), 2.7],
    ['lute', W("lute|lutes|oud|harp|harps|lyre|tambourine|tabret|tabrets|flute|flutes|reed-pipe|pipe|pipes|psaltery|dulcimer|kanun|viol|smote the strings|played upon"), 3.1],
    ['lute', W("sang|singing|song|songs|music|melody|minstrelsy"), 1.3],
    ['book', W("book|books|koran|volume|volumes|chronicle|chronicles|scriptures|tome"), 2.5],
    ['scroll', W("letter|letters|missive|missives|scroll|scrolls|writ|epistle|marriage-contract|contract|deed|bond|petition|note|billet"), 2.5],
    ['scroll', W("wrote|write|writing|written|paper|ink|inkcase|pen"), 1.3],
    ['key', W("key|keys|lock|locks|padlock|padlocks|unlocked|unlock"), 2.7],
    ['purse', W("purse|purses|dinar|dinars|diner|diners|dirham|dirhams|gold pieces|gold piece|golden dinars|sequin|sequins|ashrafi|ashrafis|coin|coins|bag of gold|bag of money"), 2.6],
    ['purse', W("money|monies|cash|wage|wages|price|paid|pay|alms|hire|reward"), 1.4],
    ['gold', W("treasure|treasures|hoard|hoards|riches|heap of gold|heaps of gold|ingots|treasury|wealth"), 2.5],
    ['gold', W("gold|silver"), .9],
    ['ring', W("ring|rings|seal-ring|seal ring|signet|signet-ring|bezel"), 2.9],
    ['candle', W("candle|candles|taper|tapers|wax-candle|wax candles|wax-candles|candlestick|candlesticks|candelabra|torch|torches|flambeau|flambeaux|links"), 2.7],
    ['candle', W("per ?ceived the dawn of day"), 2.2],
    ['coffin', W("coffin|coffins|bier|biers|shroud|shrouds|shrouded|corpse|corpses|dead body|funeral|winding-sheet|grave-clothes|bury|buried|burial"), 2.9],
    ['door', W("door|doors|doorway|wicket|door-keeper|knocked|rapped|threshold"), 1.3],
    ['gate', W("gate|gates|gateway|city gate|portal|palace-gate"), 1.7],
    ['tree', W("tree|trees|sycamore|sycamores|cypress|cypresses|tamarisk|willow|fig-tree|fig tree|bough|boughs|branch|branches|lote-tree"), 2.1],
    ['palm', W("palm-tree|palm-trees|palm tree|palm trees|date-palm|date-tree|date-trees|palms|date palm"), 2.4],
    ['palm', W("dates|date-stones"), 1.3],
    ['well', W("a well|the well|this well|that well|into the well|of the well|well-mouth|well-head|cistern|cisterns"), 2.9],
    ['boat', W("boat|boats|skiff|skiffs|bark|barque|canoe|raft|ferry-boat|ferry boat|dinghy|galley|galleys"), 2.8],
    ['boat', W("ship|ships|galleon|galleons"), 1.9],
    ['boat', W("sailed|embarked|took ship|set sail|voyage|voyaging"), 1.4],
    ['anchor', W("anchor|anchors|anchored|cast anchor|moored|anchorage"), 2.9],
    ['bales', W("bale|bales|goods|merchandise|wares|stuffs|bundle|bundles|loads|packs|cargo|stock-in-trade"), 2.3],
    ['sack', W("sack|sacks|bag|bags|saddle-bags|saddle-bag|wallet|scrip|knapsack|sack-cloth|budget"), 2.5],
    ['fire', W("fire|fires|flame|flames|brazier|braziers|blaze|bonfire|kindled|fire-temple|embers|furnace"), 2.3],
    ['fountain', W("fountain|fountains|jet of water|jets of water|jet d'eau|basin|basins|tank|tanks|piscine"), 2.4],
    ['apples', W("apple|apples|quince|quinces|pomegranate|pomegranates|fruit|fruits|peaches|oranges|citrons"), 2.2],
    ['apples', W("three apples"), 3.4],
  ];
  /* a figure or thing named after a word of likeness ("like a lion", "as the gazelle") is an image, not a presence */
  const SIMILE = /(?:\b(?:like|as|than|unto|resembl\w*|seem\w*|as it were|even as|liken\w*|similitude of|semblance of)\s+(?:[\w']{1,6}\s+){0,3}|\b(?:grace|eyes?|glances?|neck|throat|gait|cheeks?|form|shape|face|beauty|strength|courage|heart|roar|voice|wrath|fury|might|valour|eye-?lashes|brows?|waist|stature|swiftness|fierceness)\s+of\s+(?:a|an|the)\s+(?:\w+\s+)?)$/i;
  const POSSESS = /\b(?:his|her|my|thy|their|your|its)\s+$/i;
  const ADDRESS = /\bO\s+(?:auspicious\s+|august\s+|happy\s+|great\s+|my\s+lord\s+the\s+|)king(?:\s+of\s+the\s+(?:age|time)(?:\s+and\s+lord\s+of\s+the\s+time(?:\s+and\s+of\s+these\s+days)?)?)?\b/gi;
  /* the dawn formula that ends a night: the scene of the sentence before it keeps the stage */
  const DAWN = /[\s,.;:!?"']*and shahrazad per\s?ceived the dawn of day,? and ceased (?:to say|saying) her permitted say\.?\s*$/i;
  const clean0 = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2014|\u2013/g, ', ').replace(ADDRESS, ' ').replace(/\s+/g, ' ');
  const clean = t => { const s = clean0(t), m = s.match(DAWN); return m && m.index > 24 ? s.slice(0, m.index) : s; };
  const PLACE_DUP = { gate: ['gate', 'door'], well: ['well'], oasis: ['palm', 'well'], forest: ['tree'], grove: ['palm', 'tree'], ship: ['boat', 'anchor'], harbour: ['anchor'], hammam: ['fountain'], cemetery: ['coffin'], house: ['door'], tavern: [] };
  const kindOf = name => ((ISO.PROPS[name] || {}).meta || {}).kind || 'object';

  /* parse(text, {base, beings, things, min}) -> [{name, w, kind}] best first: at most two beings
     (figures and beasts) and three things, the strongest words, each once, never what a chosen
     figure carries already (the fisherman's net, the porter's crate), never the place itself. */
  function parse(text, o = {}) {
    const t = clean(text), L = Math.max(1, t.length), best = new Map();
    for (const [name, re, w, plural] of LEX) {
      if (!ISO.PROPS[name]) continue;
      re.lastIndex = 0; let m, top = 0, first = -1, n = 0, pl = false;
      while ((m = re.exec(t))) {
        const before = t.slice(Math.max(0, m.index - 40), m.index);
        let v = w;
        if (SIMILE.test(before)) v *= .25;
        if (name === 'chest' && POSSESS.test(before) && /chest$/i.test(m[0])) v *= .2;
        n++; if (first < 0) first = m.index;
        if (v > top) { top = v; pl = !!plural; }
      }
      if (!n) continue;
      const score = top + .2 * Math.min(2, n - 1) + .35 * (1 - first / L);
      const prev = best.get(name);
      if (!prev || prev.w < score) best.set(name, { name, w: Math.round(score * 100) / 100, kind: kindOf(name), plural: pl || (prev && prev.plural) || false, at: first });
      else if (pl) prev.plural = true;
    }
    let list = [...best.values()].filter(h => h.w >= (o.min || 1.4)).sort((a, b) => b.w - a.w || a.at - b.at);
    const dup = PLACE_DUP[o.base] || [];
    list = list.filter(h => !dup.includes(h.name));
    const beings = [], things = [], carried = new Set();
    for (const h of list) {
      if (h.kind === 'object') continue;
      if (beings.length >= (o.beings == null ? 2 : o.beings) || carried.has(h.name)) continue;
      beings.push(h); for (const c of (ISO.PROPS[h.name].meta.has || [])) carried.add(c);
    }
    for (const h of list) if (h.kind === 'object' && !carried.has(h.name) && things.length < (o.things == null ? 3 : o.things)) things.push(h);
    // a crowd named in the plural shows two of its kind when the stage has room
    if (beings.length === 1 && beings[0].plural && (o.beings == null || o.beings > 1)) beings.push(Object.assign({}, beings[0], { w: beings[0].w - .01, twin: true }));
    return beings.concat(things).map(h => Object.assign({ name: h.name, w: h.w, kind: h.kind }, h.plural ? { plural: true } : null, h.twin ? { twin: true } : null));
  }

  /* reader({hold}): a reading's memory. It keeps the cast: the last two people named. While the
     sentences go on with "he" and "she", the cast stays on the stage beside whoever is newly
     named (up to two beings), so the fisherman stays while he hauls his net and the porter while
     the lady fills his crate. Beasts and things are shown only when named. After `hold`
     sentences without a person named, the stage empties. next(text, {base}) -> as parse(). */
  const PRONOUN = /\b(?:he|she|him|her|his|hers|himself|herself|i|me|my|we|us|our|they|them|their|thou|thee|thy)\b/i;
  function reader(ro = {}) {
    let cast = [], age = 0;
    const hold = ro.hold || 12;
    return {
      next(text, o = {}) {
        const items = parse(text, o), beings = items.filter(i => i.kind !== 'object'), things = items.filter(i => i.kind === 'object');
        const named = beings.filter(b => b.kind === 'figure' && !b.twin && b.w >= (ro.strong || 2.3));
        if (named.length) { for (const b of named.slice().reverse()) cast = [b].concat(cast.filter(c => c.name !== b.name)); cast = cast.slice(0, 2); age = 0; } else age++;
        const room = (o.beings == null ? 2 : o.beings) - beings.length;
        if (room <= 0 || age > hold || !PRONOUN.test(clean(text))) return items;
        const add = cast.filter(c => !beings.some(b => b.name === c.name)).slice(0, room).map(c => Object.assign({}, c, { carried: true }));
        if (!add.length) return items;
        const held = new Set(); for (const b of beings.concat(add)) for (const h of (ISO.PROPS[b.name].meta.has || [])) held.add(h);
        return beings.concat(add, things.filter(t => !held.has(t.name)));
      },
      cast: () => cast.map(c => c.name),
      reset() { cast = []; age = 0; },
    };
  }

  /* =====================================================================
   * 5. THE STAGE: arrange(items, {az, base, seed, front}) -> [{name, at, seed}] for ISO.compose.
   * The things stand in one row before the place, across the line of sight: the first figure
   * left of the middle, the second right of it, a thing between them, more things outside. The
   * row stands just before the front of the place (measured when the base kind is given).
   * ===================================================================== */
  /* measure(base, seed, az) -> {back, front, edge}: how far to shrink the place so it stands as a
     set about two persons wide behind the row (never more than the kernel's 0.62), how far toward
     the eye its front comes, and edge(a0, a1): how far it comes between two lateral positions
     (a place seen from 45 degrees is a diamond, nearest in the middle). */
  const SET_WIDTH = 48;
  function measure(base, seed, az = S.az) {
    const fn = ISO.KINDS[base]; if (!fn) return null;
    const B = new ISO.Builder(ISO.rng(seed == null ? base : seed + '|' + base));
    try { fn(B.R, B, {}); } catch (e) { return null; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of B.parts) { x0 = Math.min(x0, p.box[0]); y0 = Math.min(y0, p.box[1]); x1 = Math.max(x1, p.box[3]); y1 = Math.max(y1, p.box[4]); }
    if (x0 > x1) return null;
    const back = Math.min(.62, SET_WIDTH / Math.max(1, x1 - x0, y1 - y0));
    const pts = [];
    for (const p of B.parts) {
      if (p.lod > 1) continue;
      const b = p.box, n = 6;
      for (let i = 0; i <= n; i++) for (const [x, y] of [[b[0] + (b[3] - b[0]) * i / n, b[1]], [b[0] + (b[3] - b[0]) * i / n, b[4]], [b[0], b[1] + (b[4] - b[1]) * i / n], [b[3], b[1] + (b[4] - b[1]) * i / n]]) {
        const X = x * back, Y = y * back + PLACE[1]; pts.push([lateral(X, Y, az), depth(X, Y, az)]);
      }
    }
    let front = -1e9; for (const q of pts) front = Math.max(front, q[1]);
    const edge = (a0, a1) => { let d = -1e9; for (const q of pts) if (q[0] >= a0 && q[0] <= a1) d = Math.max(d, q[1]); return d > -1e8 ? d : null; };
    return { back, front, edge };
  }
  const widthOf = name => { const m = (ISO.PROPS[name] || {}).meta || {}; if (m.kind === 'object') return m.w || 16; if (m.kind === 'animal') return Math.max(18, 30 * (m.H || 1) * .62); return 16 * Math.min(1.4, m.H || 1); };
  function arrange(items, o = {}) {
    const az = S.az = o.az == null ? 45 : o.az;
    const list = items.map(i => typeof i === 'string' ? { name: i } : i).filter(i => ISO.PROPS[i.name]);
    const beings = list.filter(i => kindOf(i.name) !== 'object'), things = list.filter(i => kindOf(i.name) === 'object');
    // the row, left to right: [thing 2] being 1 [thing 1] being 2 [thing 3]
    const row = [];
    if (things[1]) row.push(things[1]);
    if (beings[0]) row.push(beings[0]);
    if (things[0]) row.push(things[0]);
    if (beings[1]) row.push(beings[1]);
    if (things[2]) row.push(things[2]);
    for (const b of beings.slice(2)) row.push(b);
    const gap = 3, ws = row.map(i => widthOf(i.name)), total = ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    const a0 = lateral(PLACE[0], PLACE[1], az), dMin = depth(PLACE[0], PLACE[1], az) + 24;
    const m = o.measure || (o.front == null && o.base ? measure(o.base, o.seed, az) : null);
    let a = a0 - total / 2;
    return row.map((it, i) => {
      const w = ws[i], meta = ISO.PROPS[it.name].meta || {}, small = meta.kind === 'object' && !meta.big;
      // stand just before the place where this thing stands, across its own width
      // (but never far behind the place's nearest point, so the row stays a row)
      let d = o.front != null ? o.front + 8 : m ? Math.max(m.edge(a - 2, a + w + 2) ?? -1e9, m.front - 14) + (meta.big ? 4 + w * .22 : 7) : dMin + 30;
      d = Math.max(d, dMin) + (small ? 3 : 0);
      const at = worldAt(a + w / 2, d, az); a += w + gap;
      return { name: it.name, at, seed: (o.seed || '') + '|' + i };
    });
  }
  /* scene(text, base, seed, {az, reader}) -> a composed model: the place and what the sentence names. */
  function scene(text, base, seed, o = {}) {
    const items = Array.isArray(text) ? text : o.reader ? o.reader.next(text, { base }) : parse(text, { base });
    const az = S.az = o.az == null ? 45 : o.az, m = measure(base, seed, az);
    return ISO.compose(base, seed, arrange(items, { az, measure: m }), Object.assign({ back: m ? m.back : .62, dy: PLACE[1] }, o.compose || {}));
  }

  ISO.SCENE = { lexicon: LEX, parse, reader, arrange, scene, measure, clean, shape: n => FIG[n] ? shape(FIG[n]) : null };

  /* =====================================================================
   * 6. SAMPLES for the bench (iso-bench.html?set=scene): real sentences, the place each would
   * stand in, and what the reader (parse with the cast carried) puts before it, in the order the
   * kernel's slots take them (see ROW): the figures, then the things.
   * ===================================================================== */
  const has = k => !!ISO.KINDS[k];
  const SAMPLES = [
    { label: "The Fisherman and the Jinni", base: 'sea', seed: 's07#62', props: ['fisherman', 'jar', 'ring'], text: 'Then he opened the meshes and found therein a cucumber shaped jar of yellow copper, evidently full of something, whose mouth was made fast with a leaden cap, stamped with the seal ring of our Lord Sulayman son of David (Allah accept the twain!).' },
    { label: "The Fisherman and the Jinni", base: 'sea', seed: 's07#70', props: ['jinni', 'fisherman'], text: 'Now when the Fisherman saw the Ifrit his side muscles quivered, his teeth chattered, his spittle dried up and he became blind about what to do.' },
    { label: "The Porter and the Three Ladies", base: 'bazar', seed: 's13#1', props: ['lady', 'porter'], text: 'It came to pass on a certain day, as he stood about the street leaning idly upon his crate, behold, there stood before him an honourable woman in a mantilla of Mosul silk, broidered with gold and bordered with brocade; her walking shoes were also purfled with gold and her hair floated in long plaits.' },
    { label: "The Porter and the Three Ladies", base: 'room', seed: 's13#33', props: ['jewels', 'fountain', 'couch'], text: 'In the midst stood a great basin full of water surrounding a fine fountain, and at the upper end on the raised dais was a couch of juniper wood set with gems and pearls, with a canopy like mosquito curtains of red satin silk looped up with pearls as big as filberts and bigger.' },
    { label: "The Porter and the Three Ladies", base: 'room', seed: 's13#83', props: ['porter', 'lady', 'ewer', 'cup'], text: 'Then sat she down, she and her sisters, placing amidst them the Porter who kept deeming himself in a dream; and she took up the wine flagon, and poured out the first cup and drank it off, and likewise a second and a third.' },
    { label: "The Three Apples", base: 'quarter', seed: 's20#2', props: ['caliph', 'eunuch', 'net', 'basket'], text: 'So the Caliph went down with Ja’afar and Eunuch Masrur to the town and walked about the streets and markets and, as they were threading a narrow alley, they came upon a very old man with a fishing-net and crate to carry small fish on his head, and in his hand a staff; and, as he walked at a leisurely pace, he repeated these lines:\u2014' },
    { label: "The Three Apples", base: 'palace', seed: 's20#27', props: ['caliph', 'fisherman', 'chest', 'purse', 'candle'], text: 'The Caliph examined it and lifted it finding it weighty; so he gave the fisherman two hundred dinars and sent him about his business; whilst Masrur, aided by the Caliph, carried the chest to the palace and set it down and lighted the candles.' },
    { label: "The Three Apples", base: 'garden', seed: 's20#67', props: ['merchant', 'caliph', 'apples', 'purse'], text: 'So I gat me ready and set out and travelled fifteen days and nights, going and coming, and brought her three apples which I bought from the gardener for three dinars.' },
    { label: "Khalifah the Fisherman", base: 'river', seed: 'v10s06#16', props: ['ape', 'fisherman'], text: 'Then with a Bismillah he cast his net a third time, and presently drawing it ashore found therein an ape scurvy and one-eyed, mangy, and limping, hending an ivory rod in forehand.' },
    { label: "Khalifah the Fisherman", base: 'river', seed: 'v10s06#112', props: ['caliph', 'wazir'], text: 'Now the Caliph Harun al-Rashid had gone a-hunting and chasing that day; and, returning at the time of the noon heat, was oppressed thereby and thirsted; so he looked for water from afar and seeing a naked man standing on the mound said to Ja’afar, “Seest thou what I see?”' },
    { label: "Khalifah the Fisherman", base: 'bazar', seed: 'v10s06#178', props: ['porter', 'chest'], text: 'The porters disputed awhile about who should carry the chest and presently all said, “By Allah, none shall carry this chest but Zurayk!”' },
    { label: "The Trader and the Jinni", base: 'garden', seed: 's03#30', props: ['gazelle', 'oldman'], text: 'As he sat weeping over what had befallen him, behold, a Shaykh, a very ancient man, drew near leading a chained gazelle; and he saluted that merchant and wishing him long life said, “What is the cause of thy sitting in this place and thou alone and this be a resort of evil spirits?”' },
    { label: "King Shahryar and his Brother", base: 'palace', seed: 's01#30', props: ['lady', 'wazir', 'sword', 'carpet'], text: 'So he drew his scymitar and, cutting the two in four pieces with a single blow, left them on the carpet and returned presently to his camp without letting anyone know of what had happened.' },
    { label: "King Sindibad and his Falcon", base: 'field', seed: 's09#1', props: ['falcon', 'king', 'cup'], text: 'He had reared a falcon which he carried all night on his fist, and whenever he went a chasing he took with him this bird; and he bade make for her a golden cuplet hung around her neck to give her drink therefrom.' },
    { label: "The Tailor’s Tale", base: 'room', seed: 's26#52', props: ['barber', 'oldman'], text: 'So he rose and put forth his hand in most leisurely way and took out a kerchief and unfolded it, and lo! it contained an astrolabe with seven parallel plates mounted in silver.' },
    { label: "Sindbad, the Fifth Voyage", base: 'island', seed: 'v7s08#9', props: ['rukh', 'merchant', 'boat'], text: 'So I looked and seeing the merchants beating it with stones, called out to them, “Stop, stop! do not meddle with that egg, or the bird Rukh will come out and break our ship and destroy us.”' },
    { label: "The Birds and Beasts and the Carpenter", base: 'mountain', seed: 'v3s02#72', props: ['camel', 'lion', 'basket', 'tree'], text: 'Now whilst the camel was speaking with the lion whelp, behold, there rose a cloud of dust which, after a time, opened and showed an old man scanty of stature and lean of limb; and he bore on his shoulder a basket of carpenter’s tools and on his head a branch of a tree and eight planks.' },
    { label: "Ali bin Bakkar and Shams al-Nahar", base: 'room', seed: 'v3s04#49', props: ['lady', 'lady', 'lute', 'couch'], text: 'Presently she commanded the damsels, one and all, to be seated, each in her rank and place, and all sat on a couch before one of the windows, and she bade them sing; whereupon one of them took up the lute and began caroling,' },
    { label: "The Bull and the Ass", base: 'field', seed: 's02#4', props: ['bull', 'ass', 'cup', 'tray'], text: 'As the merchant was sitting near hand one day with his servants and his children were playing about him, he heard the Bull say to the Ass, “Hail and health to thee O Father of Waking! for that thou enjoyest rest and good ministering; all under thee is clean swept and fresh sprinkled; men wait upon thee and feed thee, and thy provaunt is sifted barley and thy drink pure spring water, while I (unhappy creature!) am led forth in the middle of the night, when they set on my neck the plough and a something called Yoke; and I tire at cleaving the earth from dawn of day till set of sun.' },
    { label: "The Barber’s Tale of Himself", base: 'river', seed: 's27#5', props: ['thief', 'thief'], text: 'They rowed across to the opposite bank, where they landed and there came up the watch and guardians of the peace with chains, which they put round the robbers’ necks.' },
  ];
  /* the kind files load side by side, so a missing place is looked for when the bench draws, not now */
  for (const s of SAMPLES) { const want = s.base; Object.defineProperty(s, 'base', { enumerable: true, get: () => has(want) ? want : has('house') ? 'house' : Object.keys(ISO.KINDS)[0] }); }
  window.ISO_SCENE_SAMPLES = SAMPLES;
})();
