/*
 * The city kinds: the places of a city that a tale names (the palace, the bazar, the gate,
 * the khan, the bath, the garden, the square, the quarter, the wine house, the church, the
 * hospital, the prison, the wall, the tombs, the bridge, the quay, the harbour), the whole
 * city, town and village as the world map shows them from afar, and the pieces a city's
 * tile map is built from (rampart, bastion, wallgate, shop, yard, home2, stall).
 *
 * Abbasid, Fatimid and Mamluk building, the eighth to the fourteenth century, drawn in the
 * habits of the exemplars in iso-kinds-core.js: masses first, detail as dim marks on the
 * south and east faces, base, body and crown, every part named as a tale would name it.
 */
(() => {
  const { def, lens, circ, fromPts } = ISO;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* The city wall's section, shared by the wall, the gate and the tile pieces so they join. */
  const WALL_T = 8, WALL_H = 16;

  /* ---------- helpers ---------- */

  /* A date palm in two strokes: the trunk, and the crown drawn as one stroke out and back along each frond. */
  function palm(B, cx, cy, h, o) {
    o = Object.assign({ role: 'a palm', lod: 1, fronds: 7, lean: .1, z: 0 }, o);
    const R = B.R, z = o.z, lx = h * o.lean * (R() - .5) * 2, ly = h * o.lean * (R() - .5) * 2;
    const top = [cx + lx, cy + ly, z + h];
    B.line([[cx, cy, z], [cx + lx * .3, cy + ly * .3, z + h * .55], top], { role: o.role, lod: o.lod, w: 1.4 });
    const pts = [top], a0 = R() * TAU;
    for (let i = 0; i < o.fronds; i++) {
      const a = a0 + i / o.fronds * TAU + R.r(-.2, .2), L = h * R.r(.34, .46), droop = R.r(.2, .42), c = Math.cos(a), s = Math.sin(a);
      const p1 = [top[0] + c * L * .45, top[1] + s * L * .45, top[2] + L * .12], p2 = [top[0] + c * L * .85, top[1] + s * L * .85, top[2] - L * droop * .5], p3 = [top[0] + c * L, top[1] + s * L, top[2] - L * droop];
      pts.push(p1, p2, p3, p2, p1, top);
    }
    B.line(pts, { role: o.role, lod: o.lod });
  }

  /* A tree standing at height z: a round crown on a short trunk, or a cypress. */
  function tree(B, cx, cy, h, o) {
    o = Object.assign({ role: 'a tree', lod: 1, shape: 'round', z: 0 }, o);
    const z = o.z;
    if (o.shape === 'cypress') return B.lathe(cx, cy, [[h * .13, z], [h * .19, z + h * .3], [h * .16, z + h * .65], [h * .07, z + h * .9], [0, z + h]], { n: 12, role: o.role, lod: o.lod });
    B.line([[cx, cy, z], [cx, cy, z + h * .5]], { role: o.role, lod: Math.max(1, o.lod) });
    return B.sphere(cx, cy, z + h * .64, h * .34, { role: o.role, lod: o.lod });
  }

  /* ---------- the mason's kit ----------
   * The small, true parts a building is made of, after Anatomy's craft rules
   * (github.com/wheresryan22/anatomy, MIT): at 1x a kind reads as one clear building, and at 4x
   * every face and corner has something real to find. Each part sits on another part, each drawn
   * line ends on an edge, another line or a solid, and the small things are lod 2 so the far
   * drawing stays light. The map's camera looks from the south-east, so the near faces are the
   * south and the east, and a course round a solid runs over its near half. */
  const TW = [Math.SQRT1_2, Math.SQRT1_2];
  const nearOf = (nu, nv) => nu * TW[0] + nv * TW[1] >= -1e-6;

  /* The chance the small parts draw on: seeded from the masses already built, so it is fixed for a
     place, and kept apart from the kind's own R, so every seed keeps the plan, the choices and the
     mirroring it always had. */
  function smallR(B) {
    if (B.D) return B.D;
    let h = 2166136261;
    for (const p of B.parts.slice(0, 8)) for (const v of p.box) h = Math.imul(h ^ Math.round(v * 64), 16777619);
    return (B.D = ISO.rng((h >>> 0) || 7));
  }

  /* A face of a box as a frame: at(u, z) with u from 0 at its west or north end to 1, n its normal,
     len its length; s(x) turns model units along the face into u. */
  function faceOf(p, side) {
    const f = p && p.face; if (!f) return null;
    const t = f.t || 0, k = z => t * (z - f.z0) / (f.z1 - f.z0 || 1);
    const F = { p, side, len: side === 'S' || side === 'N' ? f.x1 - f.x0 : f.y1 - f.y0, z0: f.z0, z1: f.z1 };
    if (side === 'S') { F.at = (u, z) => [lerp(f.x0 + k(z), f.x1 - k(z), u), f.y1 - k(z), z]; F.n = [0, 1, 0]; }
    else if (side === 'N') { F.at = (u, z) => [lerp(f.x0 + k(z), f.x1 - k(z), u), f.y0 + k(z), z]; F.n = [0, -1, 0]; }
    else if (side === 'E') { F.at = (u, z) => [f.x1 - k(z), lerp(f.y0 + k(z), f.y1 - k(z), u), z]; F.n = [1, 0, 0]; }
    else { F.at = (u, z) => [f.x0 + k(z), lerp(f.y0 + k(z), f.y1 - k(z), u), z]; F.n = [-1, 0, 0]; }
    F.s = x => x / (F.len || 1);
    F.mark = (B, pts, o) => B.mark(pts, Object.assign({ on: p, n: F.n }, o));
    return F;
  }

  /* The near half of a solid's outline at height z, round its near corners: a course, a string
     course, a coping line. It ends on the silhouette at both sides, as a seam on a box should. */
  function belt(B, p, z, o) {
    o = Object.assign({ lod: 2, cls: 'lo', out: 0 }, o);
    if (!p || !p.L) return;
    let i0 = 0; while (i0 < p.L.length - 2 && p.L[i0 + 1][1] < z) i0++;
    const [a, za] = p.L[i0], [b, zb] = p.L[Math.min(p.L.length - 1, i0 + 1)];
    if (a.length !== b.length || a.length < 3) return;
    const k = zb > za ? (z - za) / (zb - za) : 0, n = a.length, front = i => nearOf(a[i].nu, a[i].nv);
    let s = -1; for (let i = 0; i < n; i++) if (front(i) && !front((i + n - 1) % n)) { s = i; break; }
    if (s < 0) return;
    const pts = [];
    for (let j = 0; j < n && front((s + j) % n); j++) { const q0 = a[(s + j) % n], q1 = b[(s + j) % n]; pts.push([lerp(q0.u, q1.u, k) + q0.nu * o.out, lerp(q0.v, q1.v, k) + q0.nv * o.out, z]); }
    if (pts.length > 1) B.mark(pts, { on: p, lod: o.lod, cls: o.cls });
  }

  /* An arch on a face, in the kernel's own sampling (so a ring of voussoirs lands on a door's
     vertices): c the centre along the face in model units, w its span, from z, h high. */
  function archGeo(F, u, w, z, h, shape) {
    const hw = w / 2, c = u * F.len, flat = shape === 'flat';
    const spring = flat ? h : Math.max(0, h - (shape === 'round' ? hw : w * .62)), rise = h - spring;
    const at = (s, zz) => F.at(F.s(s), zz);
    const curve = (sg, th) => at(c + sg * hw * Math.cos(th), z + spring + rise * Math.sin(th));
    const half = zz => zz <= z + spring || flat ? hw : hw * Math.cos(Math.asin(Math.min(1, (zz - z - spring) / (rise || 1))));
    const pts = [at(c - hw, z), at(c - hw, z + spring)];
    if (!flat) { for (let i = 1; i <= 4; i++) pts.push(curve(-1, i / 4 * Math.PI / 2)); for (let i = 3; i >= 0; i--) pts.push(curve(1, i / 4 * Math.PI / 2)); }
    else pts.push(at(c + hw, z + spring));
    pts.push(at(c + hw, z));
    return { c, hw, z, h, spring, rise, at, curve, half, pts };
  }

  /* The ring of an arch: an outer arch t wider all round, the voussoir joints between the two, and
     the imposts where the curve springs. Every joint runs from the arch to the ring. */
  function voussoirs(B, F, u, w, z, h, o) {
    o = Object.assign({ shape: 'pointed', t: 1, lod: 2 }, o);
    if (o.shape === 'flat') {
      // a flat lintel: its stone over the opening, the joints of its three voussoirs
      const A = archGeo(F, u, w, z, h, 'flat'), s0 = A.c - A.hw - o.t * .6, s1 = A.c + A.hw + o.t * .6;
      F.mark(B, [A.at(s0, z + h), A.at(s0, z + h + o.t), A.at(s1, z + h + o.t), A.at(s1, z + h)], { lod: o.lod });
      for (const f of [-1 / 6, 1 / 6]) F.mark(B, [A.at(A.c + f * w, z + h), A.at(A.c + f * w * 1.2, z + h + o.t)], { lod: o.lod });
      return A;
    }
    const A = archGeo(F, u, w, z, h, o.shape), O = archGeo(F, u, w + o.t * 2, z, h + o.t, o.shape);
    F.mark(B, O.pts, { lod: o.lod });
    for (const sg of [-1, 1]) for (let i = 0; i <= 3; i++) { const th = i / 4 * Math.PI / 2; F.mark(B, [A.curve(sg, th), O.curve(sg, th)], { lod: o.lod }); }
    if (o.shape === 'pointed') F.mark(B, [A.curve(1, Math.PI / 2), O.curve(1, Math.PI / 2)], { lod: o.lod });
    return A;
  }

  /* The two leaves of a door inside its arch: the line where they meet, the iron straps from jamb to
     jamb with their studs, a knocker on each leaf, and the stone sill at the foot. */
  function leaves(B, F, u, w, z, h, o) {
    o = Object.assign({ shape: 'pointed', straps: 2, studs: 3, lod: 2, knock: true }, o);
    const A = archGeo(F, u, w, z, h, o.shape);
    F.mark(B, [A.at(A.c, z), A.at(A.c, z + h)], { lod: o.lod });
    for (let k = 1; k <= o.straps; k++) {
      const zz = z + A.spring * k / (o.straps + 1) * (o.shape === 'flat' ? .9 : 1.05), hw = A.half(zz);
      F.mark(B, [A.at(A.c - hw, zz), A.at(A.c + hw, zz)], { lod: o.lod });
      for (const sg of [-1, 1]) for (let i = 1; i <= o.studs; i++) {
        const s = A.c + sg * hw * i / (o.studs + 1), d = Math.min(.22, w * .03);
        F.mark(B, [A.at(s - d, zz), A.at(s, zz + d), A.at(s + d, zz), A.at(s, zz - d)], { lod: o.lod, closed: true });
      }
    }
    // the knockers, between two straps
    const kz = z + A.spring * (Math.ceil(o.straps / 2) + .5) / (o.straps + 1) * (o.shape === 'flat' ? .9 : 1.05);
    if (o.knock) for (const sg of [-1, 1]) { const s = A.c + sg * A.hw * .32, zz = kz, r = Math.min(.5, w * .07); F.mark(B, circ(r, 8, 0, 0).map(q => A.at(s + q.u, zz + q.v)), { lod: o.lod, closed: true }); }
    return A;
  }

  /* A window of turned wood or pierced stone: its frame, the bars of the grille running frame to frame,
     and the sill under it as a closed stone. */
  function grille(B, F, u, z, w, h, o) {
    o = Object.assign({ shape: 'flat', nx: 3, ny: 2, lod: 2, sill: true, frame: true }, o);
    const A = archGeo(F, u, w, z, h, o.shape);
    if (o.frame) F.mark(B, A.pts, { lod: o.lod, closed: true });
    for (let i = 1; i <= o.nx; i++) { const s = A.c - A.hw + w * i / (o.nx + 1), top = o.shape === 'flat' ? z + h : z + A.spring + A.rise * Math.sin(Math.acos(Math.min(1, Math.abs(s - A.c) / A.hw))); F.mark(B, [A.at(s, z), A.at(s, top)], { lod: o.lod }); }
    for (let j = 1; j <= o.ny; j++) { const zz = z + (o.shape === 'flat' ? h : A.spring) * j / (o.ny + 1), hw = A.half(zz); F.mark(B, [A.at(A.c - hw, zz), A.at(A.c + hw, zz)], { lod: o.lod }); }
    if (o.sill) { const e = .5; F.mark(B, [A.at(A.c - A.hw - e, z), A.at(A.c - A.hw - e, z - .45), A.at(A.c + A.hw + e, z - .45), A.at(A.c + A.hw + e, z)], { lod: o.lod, closed: true }); }
    return A;
  }

  /* A muqarnas hood filling the crown of a pointed recess: tiers of little niches, each tier standing
     on a ledge that runs from one side of the arch to the other. */
  function muqarnas(B, F, u, w, z, h, o) {
    o = Object.assign({ tiers: 3, cell: 1.8, lod: 2 }, o);
    const A = archGeo(F, u, w, z, h, 'pointed'), fr = [0, .36, .64, .86].slice(0, o.tiers + 1);
    for (let t = 0; t < o.tiers; t++) {
      const zt = z + A.spring + A.rise * fr[t], zn = z + A.spring + A.rise * (fr[t + 1] || .96), hw = A.half(zt), m = Math.max(1, Math.round(hw * 2 / o.cell));
      F.mark(B, [A.at(A.c - hw, zt), A.at(A.c + hw, zt)], { lod: o.lod });
      const dz = (zn - zt) * .92, leg = dz * .32, pts = [A.at(A.c - hw, zt)];
      for (let i = 0; i < m; i++) {
        const a = A.c - hw + hw * 2 * i / m, b = A.c - hw + hw * 2 * (i + 1) / m, mid = (a + b) / 2, cap = Math.min(zt + dz, z + A.spring + A.rise * Math.sin(Math.acos(Math.min(1, Math.abs(mid - A.c) / A.hw))) - .15);
        pts.push(A.at(a, zt + leg), A.at(lerp(a, mid, .55), lerp(zt + leg, cap, .8)), A.at(mid, cap), A.at(lerp(b, mid, .55), lerp(zt + leg, cap, .8)), A.at(b, zt + leg));
        if (i < m - 1) F.mark(B, [A.at(b, zt), A.at(b, zt + leg)], { lod: o.lod });
      }
      pts.push(A.at(A.c + hw, zt));
      F.mark(B, pts, { lod: o.lod });
    }
    return A;
  }

  /* A band of glazed tile or carved stone between two courses that run the face edge to edge, a
     chevron running between them from course to course. */
  function tileBand(B, F, z0, z1, o) {
    o = Object.assign({ lod: 2, n: 0 }, o);
    F.mark(B, [F.at(0, z0), F.at(1, z0)], { lod: o.lod }); F.mark(B, [F.at(0, z1), F.at(1, z1)], { lod: o.lod });
    const n = o.n || Math.max(2, Math.round(F.len / ((z1 - z0) * 1.6))), pts = [];
    for (let i = 0; i <= n; i++) pts.push(F.at(i / n, i % 2 ? z1 : z0));
    F.mark(B, pts, { lod: o.lod });
  }

  /* An inscription band: its frame (a closed panel, so no rule ends on a bare face) and the upright
     strokes of the kufic standing between its rules. */
  function inscription(B, F, z0, z1, o) {
    o = Object.assign({ lod: 2, u0: 0, u1: 1, rule: 2 }, o);
    const R = smallR(B);
    F.mark(B, [F.at(o.u0, z0), F.at(o.u1, z0)], { lod: o.rule });
    F.mark(B, [F.at(o.u0, z0), F.at(o.u0, z1), F.at(o.u1, z1), F.at(o.u1, z0)], { lod: o.lod });
    const n = Math.max(4, Math.round((o.u1 - o.u0) * F.len / .9));
    for (let i = 1; i < n; i++) if (R() < .55) { const u = lerp(o.u0, o.u1, (i + R.r(-.2, .2)) / n); F.mark(B, [F.at(u, z0), F.at(u, z1)], { lod: o.lod }); }
  }

  /* Rainwater spouts (mizab) through the parapet: small square timbers or stones standing out from a
     face just under its top. Solids, lod 2. */
  function spouts(B, p, side, us, z, o) {
    o = Object.assign({ out: 1.5, w: .55, h: .5, lod: 2, role: p.role }, o);
    const F = faceOf(p, side); if (!F) return;
    for (const u of us) {
      const q = F.at(u, z), hw = o.w / 2;
      if (side === 'S' || side === 'N') B.box(q[0] - hw, side === 'S' ? q[1] : q[1] - o.out, q[0] + hw, side === 'S' ? q[1] + o.out : q[1], z - o.h, z, { r: .12, b: 0, role: o.role, lod: o.lod });
      else B.box(side === 'E' ? q[0] : q[0] - o.out, q[1] - hw, side === 'E' ? q[0] + o.out : q[0], q[1] + hw, z - o.h, z, { r: .12, b: 0, role: o.role, lod: o.lod });
    }
    B.last = p;
  }

  /* The ends of the roof beams (vigas) showing through a wall under its top: a row of small squares. */
  function vigas(B, F, z, o) {
    o = Object.assign({ lod: 2, s: .5, gap: 2.2, from: .04, to: .96 }, o);
    const n = Math.max(2, Math.round((o.to - o.from) * F.len / o.gap)), d = o.s / 2;
    for (let i = 0; i <= n; i++) { const s = lerp(o.from, o.to, i / n) * F.len; F.mark(B, [F.at(F.s(s - d), z - d), F.at(F.s(s + d), z - d), F.at(F.s(s + d), z + d), F.at(F.s(s - d), z + d)], { lod: o.lod, closed: true }); }
  }

  /* A flight of steps against a face, each a solid lower than the one behind it. Along S or E. */
  function steps(B, side, a0, a1, face, top, n, tread, o) {
    o = Object.assign({ role: 'the steps', lod: 2 }, o);
    for (let k = 0; k < n; k++) {
      const zt = top * (n - k) / n, d0 = face + k * tread, d1 = d0 + tread;
      if (side === 'S') B.box(a0, d0, a1, d1, 0, zt, { r: .15, b: 0, role: o.role, lod: o.lod });
      else B.box(d0, a0, d1, a1, 0, zt, { r: .15, b: 0, role: o.role, lod: o.lod });
    }
  }

  /* A coping on a free-standing wall: a stone course a little wider than the wall, on its top. */
  function coping(B, p, o) {
    o = Object.assign({ out: .35, h: .55, lod: 2, role: p.role }, o);
    const f = p.face, c = B.box(f.x0 - o.out, f.y0 - o.out, f.x1 + o.out, f.y1 + o.out, f.z1, f.z1 + o.h, { r: .25, b: 0, role: o.role, lod: o.lod });
    return c;
  }

  /* Battlements round the rim of a drum: a square wave, n merlons, on its near side only, so no
     merlon stands at the far rim like a flag. */
  function crenelRing(B, on, cx, cy, r, z, n, mh, lod, from, to) {
    const F0 = from || 0, F1 = to == null ? TAU : to, per = (F1 - F0) / (n * 2);
    // the near half runs from -45 to 135 degrees; keep the part of [from, to] inside it (or inside it a turn on)
    let A0 = -Math.PI / 4, A1 = 3 * Math.PI / 4;
    if (to != null) { let a = F0, b = F1; while (b < A0) { a += TAU; b += TAU; } A0 = Math.max(A0, a); A1 = Math.min(A1, b); if (A1 <= A0) return; }
    const N = Math.max(2, Math.round((A1 - A0) / per)), pts = [], P = a => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    for (let i = 0; i < N; i++) {
      const a0 = A0 + i / N * (A1 - A0), a1 = A0 + (i + 1) / N * (A1 - A0), up = i % 2 === 1;
      const p0 = P(a0), p1 = P(a1);
      if (up) pts.push([p0[0], p0[1], z], [p0[0], p0[1], z + mh], [p1[0], p1[1], z + mh], [p1[0], p1[1], z]);
      else pts.push([p0[0], p0[1], z], [p1[0], p1[1], z]);
    }
    B.mark(pts, { on, cls: 'edge', lod: lod == null ? 1 : lod });
    // the merlons of the far rim, seen from inside over the lid: each a closed stone, so none ends in the air
    const far = [[F0, to == null ? F0 + TAU : F1]];
    for (const k of [-1, 0, 1]) {
      const n0 = -Math.PI / 4 + k * TAU, n1 = 3 * Math.PI / 4 + k * TAU;
      for (let i = far.length - 1; i >= 0; i--) { const [a, b] = far[i]; if (n1 <= a || n0 >= b) continue; far.splice(i, 1, ...[[a, n0], [n1, b]].filter(([x, y]) => y - x > per)); }
    }
    // (the merlons nearest the limbs are seen edge on, and are left out rather than drawn as slivers)
    for (const [a0, b0] of far) for (let a = a0 + Math.max(per * .5, .5); a + per <= b0 - .5; a += per * 2) {
      const p0 = P(a), p1 = P(a + per);
      B.mark([[p0[0], p0[1], z], [p0[0], p0[1], z + mh], [p1[0], p1[1], z + mh], [p1[0], p1[1], z]], { on, cls: 'mid', closed: true, lod: 2 });
    }
  }

  /* Corbels under an overhang on a round body: the front faces of the brackets, each a closed tooth
     from the soffit tapering down onto the shaft, on the near side. */
  function corbelRing(B, on, cx, cy, r0, r1, z, dz, n, lod) {
    const da = TAU / n * .24;
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * TAU, c = Math.cos(a), s = Math.sin(a);
      if (c * TW[0] + s * TW[1] < .2) continue;
      const P = (aa, r, zz) => [cx + Math.cos(aa) * r, cy + Math.sin(aa) * r, zz];
      B.mark([P(a - da, r1, z), P(a + da, r1, z), P(a + da * .55, r0 * 1.004, z - dz), P(a - da * .55, r0 * 1.004, z - dz)], { on, closed: true, lod: lod == null ? 2 : lod, n: [c, s, 0] });
    }
  }

  /* An arched window on a polygonal drum, in the plane of face k of an n-sided ring (rot as the kernel's). */
  function drumWindows(B, on, cx, cy, R, n, rot, z, w, h, o) {
    o = Object.assign({ lod: 2, shape: 'round', every: 1 }, o);
    const ap = R * Math.cos(Math.PI / n);
    for (let k = 0; k < n; k += o.every) {
      const a = rot + (k + .5) / n * TAU, c = Math.cos(a), s = Math.sin(a);
      if (c * TW[0] + s * TW[1] < .1) continue;
      const F = { len: 1, s: x => x, at: (u, zz) => [cx + c * ap - s * u, cy + s * ap + c * u, zz] };
      const A = archGeo(F, 0, w, z, h, o.shape);
      B.mark(A.pts, { on, closed: true, lod: o.lod, n: [c, s, 0] });
      B.mark([A.at(0, z), A.at(0, z + h)], { on, lod: o.lod, n: [c, s, 0] });
    }
  }

  /* The finial of a dome (the alem): a ball and a crescent on the rod the kernel draws. Lod 2. */
  function alem(B, cx, cy, z, s, o) {
    o = Object.assign({ role: 'the dome', lod: 2 }, o);
    // the ball threaded on the rod, the crescent on its top, horns up, in the plane that faces you
    const b = B.sphere(cx, cy, z + s * .55, s * .32, { role: o.role, lod: o.lod });
    const cr = [], k = s * .42, zc = z + s * .87 + k, pt = (a, r, dz) => [cx + Math.sin(a) * r * Math.SQRT1_2, cy - Math.sin(a) * r * Math.SQRT1_2, zc + dz - Math.cos(a) * r];
    for (let i = 0; i <= 10; i++) cr.push(pt(-Math.PI * .8 + i / 10 * Math.PI * 1.6, k, 0));
    for (let i = 10; i >= 0; i--) cr.push(pt(-Math.PI * .8 + i / 10 * Math.PI * 1.6, k * .72, k * .28));
    B.mark(cr, { on: b, closed: true, lod: o.lod, cls: 'edge' });
    return b;
  }

  /* A ring of courses round a dome's foot: two rings and a chevron between them, its near half. */
  function domeBand(B, on, cx, cy, R, z, o) {
    o = Object.assign({ lod: 2, dz: 1.1, n: 28 }, o);
    const ring = (r, zz) => { const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, zz]); } return pts; };
    const r1 = R * Math.cos(Math.asin(Math.min(1, o.dz / R)));
    B.mark(ring(R, z + .05), { on, lod: o.lod, axis: [cx, cy] });
    B.mark(ring(r1, z + o.dz), { on, lod: o.lod, axis: [cx, cy] });
    const zz = []; for (let i = 0; i <= o.n * 2; i++) { const a = i / (o.n * 2) * TAU, up = i % 2; zz.push([cx + Math.cos(a) * (up ? r1 : R), cy + Math.sin(a) * (up ? r1 : R), up ? z + o.dz : z + .05]); }
    B.mark(zz, { on, lod: o.lod, axis: [cx, cy] });
  }

  /* A tower: round (n 20), polygonal (n 6 or 8) or square (n 4), with a corbelled cap and battlements.
     Returns the shaft. */
  function tower(B, cx, cy, r, h, o) {
    o = Object.assign({ role: 'a tower', lod: 0, n: 20, cap: 3, flare: 1.12, z: 0, merlons: 0, slits: 0, capLod: null, talus: true, course: true }, o);
    const z = o.z, capLod = o.capLod == null ? o.lod : o.capLod;
    if (o.n === 4) {
      // the battered foot, a little wider than the shaft
      if (o.talus) B.box(cx - r - .7, cy - r - .7, cx + r + .7, cy + r + .7, z, z + 2.2, { r: .9, b: 0, top: .7, role: o.role, lod: 2 });
      const shaft = B.box(cx - r, cy - r, cx + r, cy + r, z, h - o.cap, { r: .8, b: 0, role: o.role, lod: o.lod });
      const FS = faceOf(shaft, 'S'), FE = faceOf(shaft, 'E');
      for (let i = 0; i < o.slits; i++) for (const F of [FS, FE]) {
        const zz = z + (h - z) * (.3 + i * .25);
        F.mark(B, archGeo(F, .5, .9, zz, 2.6, 'flat').pts, { lod: 2, closed: true });
        F.mark(B, archGeo(F, .5, 2.2, zz + 1.6, .5, 'flat').pts, { lod: 2, closed: true });
      }
      if (o.course) { belt(B, shaft, z + (h - o.cap - z) * .52, { lod: 2 }); belt(B, shaft, z + 2.2, { lod: 2 }); }
      const f = r * o.flare;
      const cap = B.box(cx - f, cy - f, cx + f, cy + f, h - o.cap, h, { r: .6, b: .6, role: o.role, lod: capLod });
      // the corbels under the cap, closed brackets from the shaft to its soffit
      for (let i = 1; i < 5; i++) {
        const x = cx - f + 2 * f * i / 5, y = cy - f + 2 * f * i / 5, zc = h - o.cap;
        B.mark([[x, cy + r, zc - 1.2], [x, cy + f, zc], [x, cy + r, zc]], { on: cap, n: [0, 1, 0], lod: 2, closed: true });
        B.mark([[cx + r, y, zc - 1.2], [cx + f, y, zc], [cx + r, y, zc]], { on: cap, n: [1, 0, 0], lod: 2, closed: true });
      }
      B.crenels({ on: cap, every: 2.6, h: 1.5 });
      return shaft;
    }
    const rot = o.n <= 12 ? Math.PI / o.n : 0;
    if (o.talus) B.cyl(cx, cy, r * 1.09, z, z + 2.2, { n: o.n, b: 0, top: 1 / 1.09, role: o.role, lod: 2, rot });
    const shaft = B.cyl(cx, cy, r, z, h - o.cap, { n: o.n, b: 0, role: o.role, lod: o.lod, rot });
    const cap = B.cyl(cx, cy, r * o.flare, h - o.cap, h, { n: o.n, b: .5, role: o.role, lod: capLod, rot });
    // the corbels under the cap, round the near side, and the string courses of the shaft
    corbelRing(B, cap, cx, cy, r, r * o.flare, h - o.cap, 1.3, o.n > 12 ? 16 : o.n * 2, 2);
    crenelRing(B, cap, cx, cy, r * o.flare, h, o.merlons || Math.max(6, Math.round(r * 1.1)), 1.5, 1);
    if (o.course) { belt(B, shaft, z + (h - o.cap - z) * .55, { lod: 2 }); belt(B, shaft, z + 2.2, { lod: 2 }); }
    for (let i = 0; i < o.slits; i++) {
      const zz = z + (h - o.cap - z) * (.35 + i * .25);
      for (const a of [Math.PI / 4 + .5, Math.PI / 4 - .5]) {
        const c = Math.cos(a), s = Math.sin(a), px = cx + c * r * 1.005, py = cy + s * r * 1.005, d = .45;
        B.mark([[px - s * d, py + c * d, zz], [px - s * d, py + c * d, zz + 2.6], [px + s * d, py - c * d, zz + 2.6], [px + s * d, py - c * d, zz]], { on: shaft, lod: 2, closed: true, n: [c, s, 0] });
      }
    }
    return shaft;
  }

  /* A half-round tower against a face, flat side on the wall (a buttress tower), so it never cuts into the wall. */
  function halfTower(B, side, at, face, r, h, o) {
    o = Object.assign({ role: 'a tower', lod: 0, z: 0 }, o);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * Math.PI;
      if (side === 'S') pts.push([at - Math.cos(a) * r, face + Math.sin(a) * r]);
      else pts.push([face + Math.sin(a) * r, at - Math.cos(a) * r]);
    }
    const p = B.prism(pts, o.z, h, { b: .5, role: o.role, lod: o.lod });
    return p;
  }

  /* A pishtaq: the tall rectangular frame of a portal or an iwan, standing out from a face,
     with its great pointed arch, the recess of the vault inside it, and the frame round the arch. */
  function pishtaq(B, side, x0, y0, x1, y1, h, o) {
    o = Object.assign({ role: 'the portal', lod: 0, z: 0, arch: .64, rise: .74, inner: true, crest: true, leaves: false, steps: 0 }, o);
    const p = B.box(x0, y0, x1, y1, o.z, o.z + h, { r: .8, b: .7, role: o.role, lod: o.lod });
    const len = side === 'S' || side === 'N' ? x1 - x0 : y1 - y0, H = h, F = faceOf(p, side), z = o.z;
    const aw = len * o.arch, ah = H * o.rise;
    B.door(side, .5, aw, ah, { on: p, z });
    // the ring of voussoirs round the great arch
    voussoirs(B, F, .5, aw, z, ah, { t: Math.max(.8, aw * .07), lod: 2 });
    if (o.inner) {
      // the recess of the vault, its muqarnas hood, and the door at its back with its leaves
      const iw = aw * .62, ih = ah * .78;
      B.window(side, .5, z, iw, ih, { on: p, lod: 1 });
      muqarnas(B, F, .5, iw, z, ih, { tiers: iw > 8 ? 3 : 2, cell: Math.max(1.4, iw / 6), lod: 2 });
      const dw = aw * .26, dh = ah * .36;
      B.door(side, .5, dw, dh, { on: p, z, shape: 'round', lod: 2 });
      if (dw > 2.2) leaves(B, F, .5, dw, z, dh, { shape: 'round', straps: 2, studs: 2, lod: 2 });
      // the blind niches either side of the door, inside the recess
      for (const sg of [-1, 1]) { const u = .5 + sg * (iw * .3) / len; if (iw > 6) F.mark(B, archGeo(F, u, iw * .18, z + dh * .2, dh * .7, 'pointed').pts, { lod: 2, closed: true }); }
    } else if (o.leaves) leaves(B, F, .5, aw, z, ah, { straps: 3, studs: 3, lod: 2 });
    // the frame (the alfiz) round the arch, a roundel in each spandrel, and the band of the inscription over it
    const u0 = .5 - o.arch / 2 - .08, u1 = .5 + o.arch / 2 + .08, zt = z + H * (o.rise + .08);
    F.mark(B, [F.at(u0, z), F.at(u0, zt), F.at(u1, zt), F.at(u1, z)], { lod: 1 });
    const A = archGeo(F, .5, aw, z, ah, 'pointed');
    for (const sg of [-1, 1]) {
      const s = A.c + sg * A.hw * .86, zc = (zt + z + A.spring + A.rise * Math.sin(Math.acos(.86))) / 2, r = Math.min((zt - (z + A.spring + A.rise * Math.sin(Math.acos(.86)))) * .36, (u1 - .5) * len - A.hw * .86 - .3);
      if (r > .35) { F.mark(B, circ(r, 12, 0, 0).map(q => A.at(s + q.u, zc + q.v)), { lod: 2, closed: true }); F.mark(B, circ(r * .5, 8, 0, 0).map(q => A.at(s + q.u, zc + q.v)), { lod: 2, closed: true }); }
    }
    const zi = z + H - 2.2;
    if (zi - 1.6 > zt + .4) inscription(B, F, zi - 1.6, zi, { u0: 0, u1: 1, lod: 2, rule: 1 });
    else F.mark(B, [F.at(.06, zi), F.at(.94, zi)], { lod: 1 });
    // the side of the frame you see: its string course and a blind niche
    const side2 = side === 'S' ? 'E' : 'S', G = faceOf(p, side2);
    if (G && G.len > 3.4) { G.mark(B, archGeo(G, .5, Math.min(G.len * .5, 3.6), z + H * .3, H * .34, 'pointed').pts, { lod: 2, closed: true }); G.mark(B, [G.at(0, zi), G.at(1, zi)], { lod: 2 }); }
    if (o.crest) B.crenels({ on: p, every: 2.2, h: 1.2, sides: side === 'S' ? 'S' : 'E', lod: 2 });
    // the steps before the arch, if it stands raised
    if (o.steps) { const a = F.at(.5 - aw / 2 / len, 0), b = F.at(.5 + aw / 2 / len, 0); if (side === 'S') steps(B, 'S', a[0], b[0], y1, o.steps, 2, 1.3, { role: o.role }); else steps(B, 'E', a[1], b[1], x1, o.steps, 2, 1.3, { role: o.role }); }
    B.last = p;
    return p;
  }

  /* Wave marks on a water plate: short ripples, seeded. */
  function ripples(B, on, x0, y0, x1, y1, z, n, o) {
    o = Object.assign({ len: 6, amp: .5, lod: 1, along: 'x', avoid: null }, o);
    const R = o.rng || B.R;
    for (let i = 0; i < n; i++) {
      const x = R.r(x0 + 3, x1 - 3), y = R.r(y0 + 2, y1 - 2);
      if (o.avoid && o.avoid(x, y)) continue;
      const pts = [], L = o.len * R.r(.7, 1.2);
      for (let k = 0; k <= 6; k++) { const t = k / 6, w = Math.sin(t * TAU) * o.amp; pts.push(o.along === 'x' ? [x - L / 2 + t * L, y + w, z] : [x + w, y - L / 2 + t * L, z]); }
      B.mark(pts, { on, lod: o.lod, cls: 'lo' });
    }
  }
  function water(B, pts, z, o) {
    o = Object.assign({ role: 'the water', lod: 0, waves: 14 }, o);
    const p = B.plate(pts.map(q => [q[0], q[1], z]), { role: o.role, lod: o.lod, hiOK: false });
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    ripples(B, p, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), z, o.waves, { along: o.along || 'x', avoid: o.avoid, len: o.len || 6 });
    return p;
  }

  /* A boat's hull: a lens, narrow at the keel, flaring to the gunwale. along 'x' or 'y'. */
  function hullRing(cx, cy, L, W, along) {
    const r = lens(L, W, 0, 0, 10);
    return r.map(q => along === 'y' ? { u: cx + q.v, v: cy + q.u, nu: q.nv, nv: q.nu } : { u: cx + q.u, v: cy + q.v, nu: q.nu, nv: q.nv });
  }
  function boat(B, cx, cy, L, W, o) {
    o = Object.assign({ role: 'a boat', lod: 1, along: 'x', z: 0, h: 2.6 }, o);
    const p = B.ring(hullRing(cx, cy, L * .82, W * .55, o.along), o.z, o.z + o.h, { lid: hullRing(cx, cy, L, W, o.along), b: .5, role: o.role, lod: o.lod });
    belt(B, p, o.z + o.h * .62, { lod: 2 });
    return p;
  }
  /* A dhow: the hull, a raked mast and a lateen sail on its long yard. Bow toward +x (or +y). */
  function dhow(B, cx, cy, L, o) {
    o = Object.assign({ role: 'a ship', lod: 0, along: 'x', sail: true, flip: 1 }, o);
    const W = L * .3, h = L * .16, R = B.R;
    const P = (a, c, z) => o.along === 'x' ? [cx + a * o.flip, cy + c, z] : [cx + c, cy + a * o.flip, z];
    const hull = B.ring(hullRing(cx, cy, L * .78, W * .5, o.along), 0, h, { lid: hullRing(cx, cy, L, W, o.along), b: .5, role: o.role, lod: o.lod });
    // the wale and the strake under it, and the rudder hung on the stern post
    belt(B, hull, h * .72, { lod: 2 }); belt(B, hull, h * .4, { lod: 2 });
    { const a = P(-L * .5, 0, 0), dx = o.along === 'x' ? -o.flip : 0, dyy = o.along === 'y' ? -o.flip : 0, x0 = a[0] + Math.min(0, dx * 1.4), x1 = a[0] + Math.max(0, dx * 1.4), y0 = a[1] + Math.min(0, dyy * 1.4), y1 = a[1] + Math.max(0, dyy * 1.4);
      B.box(o.along === 'x' ? x0 : a[0] - .25, o.along === 'y' ? y0 : a[1] - .25, o.along === 'x' ? x1 : a[0] + .25, o.along === 'y' ? y1 : a[1] + .25, .2, h * .95, { r: .1, b: 0, role: o.role, lod: 2 }); }
    // the raised stern deck
    const st = P(-L * .34, 0, h);
    if (o.along === 'x') B.box(Math.min(st[0], st[0] + L * .16 * o.flip) , cy - W * .26, Math.max(st[0], st[0] + L * .16 * o.flip), cy + W * .26, h, h + L * .07, { r: .4, b: .3, role: o.role, lod: 1 });
    else B.box(cx - W * .26, Math.min(st[1], st[1] + L * .16 * o.flip), cx + W * .26, Math.max(st[1], st[1] + L * .16 * o.flip), h, h + L * .07, { r: .4, b: .3, role: o.role, lod: 1 });
    const mh = L * R.r(.85, 1.05), foot = P(L * .06, 0, h), head = P(L * .14, 0, h + mh);
    B.line([foot, head], { role: o.role, lod: o.lod, w: 1.2 });
    if (o.sail) {
      // the lateen: tack low by the bow, peak high astern of the mast, clew at the stern
      const tack = P(L * .42, 0, h + L * .12), peak = P(-L * .36, 0, h + mh * 1.12), clew = P(-L * .3, 0, h + L * .1);
      const belly = o.along === 'x' ? [0, W * .5, 0] : [W * .5, 0, 0];
      const mid = P(L * .02, 0, h + L * .2);
      B.plate([tack, peak, clew, [mid[0] + belly[0], mid[1] + belly[1], mid[2]]], { role: o.role, lod: o.lod });
      B.line([P(L * .5, 0, h + L * .06), tack, peak, P(-L * .42, 0, h + mh * 1.18)], { role: o.role, lod: 1 });
    } else {
      B.line([P(L * .44, 0, h + mh * .3), P(-L * .3, 0, h + mh * .9)], { role: o.role, lod: 1 });
    }
  }

  /* The kit is shared with the exemplar kinds in iso-kinds-core.js, which reach it when they build
     (after every file has loaded), so the house and the mosque are drawn with the same parts. */
  ISO.CRAFT = { faceOf, belt, archGeo, voussoirs, leaves, grille, muqarnas, tileBand, inscription, spouts, vigas, steps, coping, corbelRing, drumWindows, alem, domeBand, crenelRing, smallR, figure: (B, x, y, z, h, o) => figure(B, x, y, z, h, o) };

  /* A wine or oil jar: an amphora, round shouldered, on a pointed foot. */
  function jar(B, x, y, h, o) {
    o = Object.assign({ role: 'the jars', lod: 2, z: 0 }, o);
    const z = o.z;
    return B.lathe(x, y, [[h * .08, z], [h * .26, z + h * .25], [h * .32, z + h * .55], [h * .24, z + h * .8], [h * .12, z + h * .88], [h * .14, z + h]], { n: 12, role: o.role, lod: o.lod });
  }
  /* A sack of grain or spice: a squat round bag tied at the neck. */
  function sack(B, x, y, h, o) {
    o = Object.assign({ role: 'the goods', lod: 2, z: 0 }, o);
    return B.lathe(x, y, [[h * .32, o.z], [h * .42, o.z + h * .4], [h * .3, o.z + h * .8], [h * .12, o.z + h * .9], [h * .18, o.z + h]], { n: 12, role: o.role, lod: o.lod });
  }

  /* A qubba: a cube with a dome, a door in its south or east face, maybe an octagonal drum. */
  function qubba(B, cx, cy, s, h, o) {
    o = Object.assign({ role: 'a tomb', lod: 0, shape: 'round', drum: 0, door: 'S', dh: 1 }, o);
    const c = B.box(cx - s, cy - s, cx + s, cy + s, 0, h, { r: .6, b: .6, role: o.role, lod: o.lod });
    B.door(o.door, .5, s * .7, h * .62, { on: c });
    voussoirs(B, faceOf(c, o.door), .5, s * .7, 0, h * .62, { t: .5 });
    B.mark(archGeo(faceOf(c, o.door), .5, s * .7 * .55, 0, h * .62 * .7, 'pointed').pts, { on: c, n: faceOf(c, o.door).n, lod: 2 });
    B.band(h - 1.4, { on: c, sides: 'SE', lod: 2 });
    belt(B, c, .6);
    const dR = s * .86, dz = h + o.drum;
    const d = B.dome(cx, cy, dR, h, { shape: o.shape, drum: o.drum, drumN: 8, role: o.role, lod: o.lod, h: o.dh });
    if (o.drum) drumWindows(B, B.parts[B.parts.length - 3], cx, cy, dR * 1.04, 8, 0, h + .4, .8, o.drum - .8, { shape: 'pointed' });
    if (dR > 3) alem(B, cx, cy, dz + dR * o.dh * (o.shape === 'pointed' ? 1.45 : 1), Math.max(1.4, dR * .28), { role: o.role });
    return c;
  }

  /* A sloping awning over a shopfront on a south face (or east face). */
  function awning(B, side, a0, a1, face, z, out, drop, o) {
    o = Object.assign({ role: 'a shop', lod: 1 }, o);
    const pts = side === 'S' ? [[a0, face, z], [a1, face, z], [a1, face + out, z - drop], [a0, face + out, z - drop]]
      : [[face, a0, z], [face, a1, z], [face + out, a1, z - drop], [face + out, a0, z - drop]];
    const p = B.plate(pts, { role: o.role, lod: o.lod });
    // the stripes of the cloth and its scalloped edge
    const n = Math.max(3, Math.round((a1 - a0) / 2.2)), at = (t, f) => side === 'S' ? [lerp(a0, a1, t), face + out * f, z - drop * f] : [face + out * f, lerp(a0, a1, t), z - drop * f];
    for (let k = 1; k < n; k++) B.mark([at(k / n, 0), at(k / n, 1)], { on: p, lod: 2 });
    const val = []; for (let k = 0; k <= n * 2; k++) { const q = at(k / (n * 2), 1); q[2] -= k % 2 ? .8 : 0; val.push(q); }
    B.mark(val, { on: p, lod: 1, n: side === 'S' ? [0, 1, 0] : [1, 0, 0] });
    return p;
  }

  /* A gabled roof along y (ridge north-south) or x: two slopes and the near gable. */
  function gable(B, x0, y0, x1, y1, z, rise, o) {
    o = Object.assign({ role: 'the roof', lod: 0, along: 'y', eave: 1 }, o);
    const e = o.eave;
    if (o.along === 'y') {
      const xm = (x0 + x1) / 2;
      B.plate([[x0 - e, y0 - e, z - e * .6], [xm, y0 - e, z + rise], [xm, y1 + e, z + rise], [x0 - e, y1 + e, z - e * .6]], { role: o.role, lod: o.lod });
      const east = B.plate([[xm, y0 - e, z + rise], [x1 + e, y0 - e, z - e * .6], [x1 + e, y1 + e, z - e * .6], [xm, y1 + e, z + rise]], { role: o.role, lod: o.lod });
      const g = B.plate([[x0, y1 + e, z], [xm, y1 + e, z + rise - .6], [x1, y1 + e, z]], { role: o.role, lod: o.lod });
      return { east, gable: g };
    }
    const ym = (y0 + y1) / 2;
    B.plate([[x0 - e, y0 - e, z - e * .6], [x1 + e, y0 - e, z - e * .6], [x1 + e, ym, z + rise], [x0 - e, ym, z + rise]], { role: o.role, lod: o.lod });
    const south = B.plate([[x0 - e, ym, z + rise], [x1 + e, ym, z + rise], [x1 + e, y1 + e, z - e * .6], [x0 - e, y1 + e, z - e * .6]], { role: o.role, lod: o.lod });
    const g = B.plate([[x1 + e, y0, z], [x1 + e, ym, z + rise - .6], [x1 + e, y1, z]], { role: o.role, lod: o.lod });
    return { south, gable: g };
  }

  /* A square pyramid roof (a tent, a belfry), its near hip drawn as a dim line. */
  function pyramid(B, x0, y0, x1, y1, z0, z1, o) {
    o = Object.assign({ role: 'the roof', lod: 0 }, o);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const p = B.add({ L: [[ISO.rrect(x0, y0, x1, y1, .3, 1), z0], [[{ u: cx, v: cy, nu: 0, nv: 0 }], z1]], inner: null, role: o.role, lod: o.lod });
    B.mark([[cx, cy, z1], [x1, y1, z0]], { on: p, lod: 1 });
    B.mark([[cx, cy, z1], [x0, y1, z0]], { on: p, lod: 2 }); B.mark([[cx, cy, z1], [x1, y0, z0]], { on: p, lod: 2 });
    return p;
  }

  /* A barrel vault along x over a lane: half a cylinder as a stack of rings, its ribs and skylights drawn on it. */
  function vault(B, x0, x1, yc, w, z, o) {
    o = Object.assign({ role: 'the vault', lod: 0, ribs: 8, lights: true }, o);
    const L = [];
    for (const a of [0, 25, 50, 70, 90]) { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); L.push([ISO.rrect(x0, yc - Math.max(.06, w * c), x1, yc + Math.max(.06, w * c), .2, 1), z + w * s]); }
    const p = B.add({ L, inner: null, role: o.role, lod: o.lod });
    for (let k = 1; k < o.ribs; k++) {
      const x = lerp(x0, x1, k / o.ribs), pts = [];
      for (let i = 0; i <= 10; i++) { const a = i / 10 * 2.45; pts.push([x, yc + Math.cos(a) * w, z + Math.sin(a) * w]); }
      B.mark(pts, { on: p, lod: 1 });
      if (o.lights) B.mark(circ(.75, 8, x + (x1 - x0) / o.ribs / 2, yc).map(q => [q.u, q.v, z + w]), { on: p, closed: true, lod: 2, cls: 'mid' });
    }
    return p;
  }

  /* Oculi studding a dome: small round glass lights in rings on its surface (the dome of a bath). */
  function oculi(B, on, cx, cy, R, z0, hk, rings, o) {
    o = Object.assign({ size: .6, lod: 1 }, o);
    // the shallow and round profiles, sampled as radius fraction -> height fraction
    const prof = f => Math.sqrt(Math.max(0, 1 - f * f)) * hk;
    rings.forEach(([f, n], j) => {
      for (let i = 0; i < n; i++) {
        const a = (i + (j % 2) * .5) / n * TAU, x = cx + Math.cos(a) * R * f, y = cy + Math.sin(a) * R * f, z = z0 + prof(f) * R;
        const nz = .6 + (1 - f) * .4, nr = Math.sqrt(1 - nz * nz);
        B.mark(circ(o.size, 8, x, y).map(q => [q.u, q.v, z + .05]), { on, closed: true, lod: o.lod, n: [Math.cos(a) * nr, Math.sin(a) * nr, nz] });
      }
    });
  }

  /* A market stall facing south: an awning or a tent over a counter, the goods set out. Within w x d. */
  function stall(B, cx, cy, w, d, o) {
    o = Object.assign({ role: 'a stall', lod: 1, kind: 'awning', goods: 2 }, o);
    const R = B.R, x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2, h = o.h || 7;
    if (o.kind === 'tent') {
      const tb = B.box(x0 + .5, y0 + .5, x1 - .5, y1 - .5, 0, h * .45, { r: .4, b: .4, role: o.role, lod: o.lod });
      B.door('S', .5, w * .4, h * .42, { on: tb, shape: 'flat' });
      // the flaps of the door tied back, the seams of the cloth, the rug laid out before it
      const F = faceOf(tb, 'S'); F.mark(B, [F.at(.5, 0), F.at(.5, h * .42)], { lod: 2 });
      for (const u of [.12, .88]) F.mark(B, [F.at(u, 0), F.at(u, h * .45)], { lod: 2 });
      B.mark([[cx - w * .3, y1 + .4, 0], [cx + w * .3, y1 + .4, 0], [cx + w * .3, y1 + 3.6, 0], [cx - w * .3, y1 + 3.6, 0]], { on: tb, closed: true, lod: 2 });
      pyramid(B, x0, y0, x1, y1, h * .45, h * 1.15, { role: o.role, lod: o.lod });
    } else {
      const cb = B.box(x0 + 1, y0 + 1.4, x1 - 1, y1 - 2.4, 0, 3, { r: .4, b: .4, role: o.role, lod: o.lod });
      // the boards of the counter, its top rail, and the rug spread before it
      const F = faceOf(cb, 'S'); for (const u of [.25, .5, .75]) F.mark(B, [F.at(u, 0), F.at(u, 2.3)], { lod: 2 }); F.mark(B, [F.at(0, 2.3), F.at(1, 2.3)], { lod: 2 });
      B.mark([[cx - w * .32, y1 - 1.8, 0], [cx + w * .32, y1 - 1.8, 0], [cx + w * .32, y1 + 1.6, 0], [cx - w * .32, y1 + 1.6, 0]], { on: cb, closed: true, lod: 2 });
      B.mark([[cx - w * .26, y1 - 1.4, 0], [cx + w * .26, y1 - 1.4, 0], [cx + w * .26, y1 + 1.2, 0], [cx - w * .26, y1 + 1.2, 0]], { on: cb, closed: true, lod: 2 });
      B.line([[x0, y1, 0], [x0, y1, h], [x1, y1, h], [x1, y1, 0]], { role: o.role, lod: o.lod });
      B.line([[x0, y0, 0], [x0, y0, h + 1.6], [x1, y0, h + 1.6], [x1, y0, 0]], { role: o.role, lod: Math.max(1, o.lod) });
      const aw = B.plate([[x0 - .4, y0, h + 1.6], [x1 + .4, y0, h + 1.6], [x1 + .4, y1 + .6, h], [x0 - .4, y1 + .6, h]], { role: o.role, lod: o.lod });
      const n = Math.max(3, Math.round(w / 2.2));
      for (let k = 1; k < n; k++) { const x = lerp(x0 - .4, x1 + .4, k / n); B.mark([[x, y0, h + 1.6], [x, y1 + .6, h]], { on: aw, lod: 2 }); }
      const val = [];
      for (let k = 0; k <= n * 2; k++) { const x = lerp(x0 - .4, x1 + .4, k / (n * 2)); val.push([x, y1 + .6, h - (k % 2 ? 1 : 0)]); }
      B.mark(val, { on: aw, lod: 1, n: [0, 1, 0] });
      for (let k = 0; k < o.goods; k++) {
        const gx = lerp(x0 + 2.4, x1 - 2.4, o.goods === 1 ? .5 : k / (o.goods - 1));
        if (R.chance(.5)) sack(B, gx, (y0 + y1) / 2 - .6, 2.6, { z: 3, role: o.role });
        else jar(B, gx, (y0 + y1) / 2 - .6, 3.2, { z: 3, role: o.role });
      }
    }
  }

  const TRADES = ['the drapers', 'the spice sellers', 'the goldsmiths', 'the perfumers', 'the booksellers', 'the coppersmiths', 'the slippermakers', 'the jewellers'];

  /* Mirror a model across the line x = y: the south and east faces trade places, so every door and
     arcade stays on a face you see, and the drawing comes out reversed left to right. Square plots only. */
  function mirror(B, from) {
    const sw = q => ({ u: q.v, v: q.u, nu: q.nv, nv: q.nu }), s3 = q => [q[1], q[0], q[2]];
    for (let i = from || 0; i < B.parts.length; i++) {
      const p = B.parts[i];
      if (p.L) p.L = p.L.map(([ring, z]) => [ring.map(sw), z]);
      if (p.inner) p.inner = p.inner.map(sw);
      if (p.plate) p.plate = p.plate.map(s3);
      if (p.line) p.line = p.line.map(s3);
      if (p.cut) { p.at = s3(p.at); p.flip = !p.flip; }
      p.marks.forEach(mk => { mk.pts = mk.pts.map(s3); if (mk.n) mk.n = s3(mk.n); if (mk.axis) mk.axis = [mk.axis[1], mk.axis[0]]; });
      if (p.face) p.face = Object.assign({}, p.face, { x0: p.face.y0, y0: p.face.x0, x1: p.face.y1, y1: p.face.x1 });
      const b = p.box; p.box = [b[1], b[0], b[2], b[4], b[3], b[5]];
      [p.cx, p.cy, p.hw, p.hh] = [p.cy, p.cx, p.hh, p.hw];
    }
    B.guides = B.guides.map(g => g.map(q => [q[1], q[0]]));
    B.dots = B.dots.map(d => [d[1], d[0], d[2], d[3]]);
  }

  /* A camel, the cut-out of one, standing side-on, for the khan and the caravan. */
  /* A figure standing at height z (on a deck, a quay, a roof): the kernel's person stands on the ground only. */
  const PERSON = [[-.18, 0], [-.2, .55], [-.12, .7], [-.1, .8], [-.12, .9], [-.04, 1], [.06, 1], [.12, .9], [.1, .8], [.12, .7], [.2, .55], [.18, 0]];
  function figure(B, x, y, z, h, o) { return B.cut(PERSON, x, y, z, h, Object.assign({ role: 'a figure', lod: 2 }, o)); }
  /* An arch outline on a vertical plane: P(u, z) maps along-the-face and height to the world. */
  function archOn(P, u, w, z, h, shape) {
    const pts = [], hw = w / 2, spring = Math.max(0, shape === 'round' ? h - hw : h - w * .62), rise = h - spring;
    pts.push(P(u - hw, z), P(u - hw, z + spring));
    if (shape === 'round') for (let i = 1; i < 8; i++) { const a = Math.PI - i / 8 * Math.PI; pts.push(P(u + Math.cos(a) * hw, z + spring + Math.sin(a) * hw)); }
    else {
      for (let i = 1; i <= 4; i++) { const k = i / 4; pts.push(P(u - hw + hw * (1 - Math.cos(k * Math.PI / 2)), z + spring + rise * Math.sin(k * Math.PI / 2))); }
      for (let i = 3; i >= 0; i--) { const k = i / 4; pts.push(P(u + hw - hw * (1 - Math.cos(k * Math.PI / 2)), z + spring + rise * Math.sin(k * Math.PI / 2))); }
    }
    pts.push(P(u + hw, z));
    return pts;
  }

  const CAMEL = [[-.34, 0], [-.29, 0], [-.25, .4], [.12, .4], [.15, 0], [.2, 0], [.23, .44], [.3, .56], [.36, .8], [.4, .9], [.5, .88], [.5, .82], [.43, .79], [.38, .62], [.24, .66], [.06, .94], [-.12, .74], [-.34, .64], [-.38, .52], [-.33, .44]];

  /* =================================================================== */

  /* The palace of the caliph. Two plans, by seed: the iwan court of Ukhaidir and the Jawsaq,
     a great iwan in its pishtaq at the head of the court with the audience hall and its dome
     behind, a terrace garden to the east; or the palace of al-Mansur, the Green Dome raised
     over the audience hall in the middle of the court, its iwans opening south and east, the
     pool on the axis to the gate. Round towers at the corners, the gate on the south. */
  def('palace', (R, B) => {
    const plan = R.pick(['court', 'dome']);
    const blind = (p, side, n, z, h) => { B.arcade(side, n, z, h, { on: p, lod: 1 }); if (z > 0) belt(B, p, z, { lod: 1 }); };
    // a range of rooms: its cornice, the plinth course it stands on, the tile band of a facade, spouts through the parapet
    const range = (p, sides, hR, o) => {
      o = o || {};
      B.band(hR - 1.6, { on: p, sides, lod: 1 });
      belt(B, p, .9, { lod: 2 });
      if (o.tiles) tileBand(B, faceOf(p, o.tiles), hR - 3, hR - 2.1, { lod: 2 });
      if (o.spouts) spouts(B, p, o.spouts[0], o.spouts[1], hR - .35);
      return p;
    };
    // a fountain on a pool: its column, the bowl on top and the jet
    const fountain = (x, y, z, role) => {
      B.cyl(x, y, 1, z, z + 1.7, { n: 8, role, lod: 2 });
      B.lathe(x, y, [[.5, z + 1.7], [1.7, z + 2.3], [1.8, z + 2.6]], { n: 14, role, lod: 2 });
      B.line([[x, y, z + 2.6], [x, y, z + 4.4]], { role, lod: 2, cls: 'lo' });
    };
    if (plan === 'court') {
      const X0 = -52, X1 = R.r(16, 20), Y0 = -50, Y1 = R.r(30, 36), t = 10, hR = R.r(12, 14), tr = 6.5, xc = (X0 + X1) / 2;
      const ND = 22; // the north range is deep: the audience hall stands in it, behind the iwan
      // the corner towers
      for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) tower(B, x, y, tr, hR + 5, { role: 'the towers', slits: 1 });
      // the north range in two wings either side of the great iwan, their latticed windows on the court
      for (const [a, b] of [[X0 + tr, xc - 12], [xc + 12, X1 - tr]]) {
        const p = range(B.box(a, Y0, b, Y0 + ND, 0, hR, { r: 1, b: .8, role: 'the private rooms' }), 'SE', hR, { spouts: ['S', [.5]] });
        const F = faceOf(p, 'S');
        for (const u of [.2, .5, .8]) { B.window('S', u, hR * .45, 2.2, 3.6, { on: p, lod: 1 }); grille(B, F, u, hR * .45, 2.2, 3.6, { shape: 'pointed', nx: 2, ny: 2, frame: false }); }
      }
      // the hall of audience behind the iwan, its dome on an eight-sided drum with a window in each face
      const hall = B.box(xc - 12, Y0, xc + 12, Y0 + 12, 0, hR + 6, { r: 1, b: .8, role: 'the hall of audience' });
      B.band(hR + 4.6, { on: hall, sides: 'SE', lod: 1 });
      grille(B, faceOf(hall, 'E'), .5, hR + 1, 2.4, 2.8, { shape: 'pointed', nx: 2, ny: 1 });
      const dz = hR + 6, dR = 9.5;
      const dm = B.dome(xc, Y0 + 6, dR, dz, { shape: 'pointed', drum: 4, drumN: 8, role: 'the dome of the hall' });
      drumWindows(B, B.parts[B.parts.length - 3], xc, Y0 + 6, dR * 1.04, 8, 0, dz + .8, 1.8, 2.6);
      domeBand(B, dm, xc, Y0 + 6, dR, dz + 4, { lod: 2 });
      ribs(B, dm, xc, Y0 + 6, dR, dz + 4, 'pointed', 16, 2);
      alem(B, xc, Y0 + 6, dz + 4 + dR * 1.45, Math.max(1.4, dR * .28), { role: 'the dome of the hall' });
      // the great iwan: a vault open to the court, framed by its pishtaq, two steps up to its floor
      pishtaq(B, 'S', xc - 12, Y0 + 12, xc + 12, Y0 + ND + 3, hR + 16, { role: 'the great iwan', arch: .66, rise: .78, steps: 1.2 });
      // the side ranges and the front, the gate in the middle of the south range
      const w = range(B.box(X0, Y0 + ND, X0 + t, Y1 - tr, 0, hR, { r: 1, b: .8, role: 'the guest rooms' }), 'E', hR);
      blind(w, 'E', 5, 0, hR * .62);
      const e = range(B.box(X1 - t, Y0 + ND, X1, Y1 - tr, 0, hR, { r: 1, b: .8, role: 'the guest rooms' }), 'SE', hR, { tiles: 'E', spouts: ['E', [.15, .5, .85]] });
      blind(e, 'E', 6, 1.5, hR * .6);
      const sw = range(B.box(X0 + tr, Y1 - t, xc - 8, Y1, 0, hR, { r: 1, b: .8, role: 'the outer court' }), 'SE', hR, { tiles: 'S', spouts: ['S', [.12, .62]] });
      blind(sw, 'S', 4, 1.5, hR * .6);
      const se = range(B.box(xc + 8, Y1 - t, X1 - tr, Y1, 0, hR, { r: 1, b: .8, role: 'the outer court' }), 'SE', hR, { tiles: 'S', spouts: ['S', [.4]] });
      blind(se, 'S', 3, 1.5, hR * .6);
      pishtaq(B, 'S', xc - 8, Y1 - t, xc + 8, Y1 + 2.5, hR + 7, { role: 'the gate of the palace', arch: .58, steps: .8 });
      for (const sx of [-1, 1]) { const ht = halfTower(B, 'S', xc + sx * 11.6, Y1, 3.4, hR + 2, { role: 'the gate of the palace' }); crenelRing(B, ht, xc + sx * 11.6, Y1, 3.4, hR + 2, 3, 1.3, 1, 0, Math.PI); belt(B, ht, hR * .55); }
      for (const sx of [-1, 1]) figure(B, xc + sx * 6.4, Y1 + 4.4, 0, 5.4, { role: 'the gate of the palace' });
      // half-round towers along the east wall, as at Ukhaidir
      for (const yy of [lerp(Y0 + ND, Y1 - tr, .3), lerp(Y0 + ND, Y1 - tr, .7)]) { const ht = halfTower(B, 'E', yy, X1, 4.2, hR, { role: 'the towers' }); crenelRing(B, ht, X1, yy, 4.2, hR, 3, 1.4, 1, -Math.PI / 2, Math.PI / 2); belt(B, ht, hR * .55); }
      // the court, its pool on the axis and the channels that feed it from the iwan and run on to the gate
      const court = B.plate([[X0 + t, Y0 + ND, 0], [X1 - t, Y0 + ND, 0], [X1 - t, Y1 - t, 0], [X0 + t, Y1 - t, 0]], { cls: 'nf', role: 'the court', lod: 1 });
      for (const sx of [-1, 1]) { B.mark([[xc + sx * 1.1, Y0 + ND + 5.6, 0], [xc + sx * 1.1, Y0 + ND + 9, 0]], { on: court, lod: 1 }); B.mark([[xc + sx * 1.1, Y0 + ND + 19, 0], [xc + sx * 1.1, Y1 - t, 0]], { on: court, lod: 1 }); }
      const pool = B.box(xc - 7, Y0 + ND + 9, xc + 7, Y0 + ND + 19, 0, .9, { r: .5, b: .6, role: 'the pool', lod: 1 });
      ripples(B, pool, xc - 6.5, Y0 + ND + 9.5, xc + 6.5, Y0 + ND + 18.5, .9, 4, { rng: smallR(B), len: 2.6, amp: .25, lod: 2, avoid: (x, y) => Math.hypot(x - xc, y - Y0 - ND - 14) < 3.4 });
      fountain(xc, Y0 + ND + 14, .9, 'the pool');
      figure(B, xc + 9, Y0 + ND + 24, 0, 5.2, { role: 'the court' });
      // the terrace garden to the east: a raised platform with its steps, a long pool, cypresses and fruit trees
      const TX0 = X1 + tr + 2, TX1 = 56, TY0 = -30, TY1 = Y1 + 2;
      const ter = B.box(TX0, TY0, TX1, TY1, 0, 3.5, { r: 1, b: .7, role: 'the terrace garden' });
      B.band(2.6, { on: ter, sides: 'SE', lod: 1 });
      for (let k = 1; k < 6; k++) B.mark([[TX1, lerp(TY0, TY1, k / 6), 0], [TX1, lerp(TY0, TY1, k / 6), 2.6]], { on: ter, n: [1, 0, 0], lod: 2 });
      const mx = (TX0 + TX1) / 2;
      steps(B, 'S', mx - 3, mx + 3, TY1, 3.5, 3, 1.1, { role: 'the terrace garden' });
      const lp = B.box(mx - 3, TY0 + 17, mx + 3, TY1 - 8, 3.5, 4.1, { r: .4, b: .5, role: 'the terrace garden', lod: 1 });
      ripples(B, lp, mx - 2.6, TY0 + 18, mx + 2.6, TY1 - 9, 4.1, 3, { rng: smallR(B), len: 2, amp: .2, along: 'y', lod: 2 });
      // the kiosk at the head of the pool: a dais, four columns on their bases, a roof and a little dome
      const ky = TY0 + 9, kc = 3.6;
      B.box(mx - kc - 1.2, ky - kc - 1.2, mx + kc + 1.2, ky + kc + 1.2, 3.5, 4.2, { r: .4, b: .4, role: 'the kiosk', lod: 1 });
      for (const [x, y] of [[mx - kc, ky - kc], [mx + kc, ky - kc], [mx - kc, ky + kc], [mx + kc, ky + kc]]) {
        B.box(x - .75, y - .75, x + .75, y + .75, 4.2, 4.9, { r: .15, b: 0, role: 'the kiosk', lod: 2 });
        B.cyl(x, y, .45, 4.9, 11, { n: 6, b: 0, role: 'the kiosk', lod: 1 });
      }
      const kr = B.box(mx - kc - 1.4, ky - kc - 1.4, mx + kc + 1.4, ky + kc + 1.4, 11, 12.2, { r: .5, b: .4, role: 'the kiosk' });
      B.band(11.6, { on: kr, sides: 'SE', lod: 2 });
      B.dome(mx, ky, kc + .4, 12.2, { shape: 'onion', role: 'the kiosk' });
      alem(B, mx, ky, 12.2 + (kc + .4) * 1.5, 1.4, { role: 'the kiosk' });
      for (const yy of [TY0 + 4, TY1 - 4]) for (const xx of [TX0 + 4, TX1 - 4]) tree(B, xx, yy, 16, { shape: 'cypress', z: 3.5, role: 'the terrace garden' });
      for (const yy of [lerp(TY0, TY1, .45), lerp(TY0, TY1, .7)]) for (const xx of [TX0 + 5, TX1 - 5]) tree(B, xx, yy, 10, { z: 3.5, role: 'the orchard', lod: 1 });
      if (R.chance(.5)) mirror(B);
      return;
    }
    // the palace of the Green Dome
    const E = 50, t = 9, hR = R.r(10, 12), tr = 6.5, H = R.r(20, 23), s = 15;
    for (const [x, y] of [[-E, -E], [E, -E], [-E, E], [E, E]]) tower(B, x, y, tr, hR + 6, { role: 'the towers', n: R.chance(.5) ? 20 : 8, slits: 1 });
    const n = range(B.box(-E + tr, -E, E - tr, -E + t, 0, hR, { r: 1, b: .8, role: 'the court of the guard' }), 'SE', hR, { spouts: ['S', [.25, .75]] });
    B.arcade('S', 9, 0, hR * .66, { on: n });
    const w = range(B.box(-E, -E + t, -E + t, E - tr, 0, hR, { r: 1, b: .8, role: 'the court of the guard' }), 'E', hR);
    B.arcade('E', 9, 0, hR * .66, { on: w });
    const e = range(B.box(E - t, -E + t, E, E - tr, 0, hR, { r: 1, b: .8, role: 'the court of the guard' }), 'SE', hR, { tiles: 'E', spouts: ['E', [.2, .5, .8]] });
    blind(e, 'E', 8, 1.5, hR * .55);
    const sw = range(B.box(-E + tr, E - t, -8, E, 0, hR, { r: 1, b: .8, role: 'the court of the guard' }), 'SE', hR, { tiles: 'S', spouts: ['S', [.15, .65]] });
    blind(sw, 'S', 5, 1.5, hR * .55);
    const se = range(B.box(8, E - t, E - tr, E, 0, hR, { r: 1, b: .8, role: 'the court of the guard' }), 'SE', hR, { tiles: 'S', spouts: ['S', [.35, .85]] });
    blind(se, 'S', 5, 1.5, hR * .55);
    pishtaq(B, 'S', -8, E - t, 8, E + 2.5, hR + 8, { role: 'the Golden Gate', arch: .58, steps: .8 });
    for (const sx of [-1, 1]) { const ht = halfTower(B, 'S', sx * 11.6, E, 3.4, hR + 2.5, { role: 'the Golden Gate' }); crenelRing(B, ht, sx * 11.6, E, 3.4, hR + 2.5, 3, 1.3, 1, 0, Math.PI); belt(B, ht, hR * .55); }
    for (const sx of [-1, 1]) figure(B, sx * 6.4, E + 4.4, 0, 5.4, { role: 'the Golden Gate' });
    const court = B.plate([[-E + t, -E + t, 0], [E - t, -E + t, 0], [E - t, E - t, 0], [-E + t, E - t, 0]], { cls: 'nf', role: 'the court of the palace', lod: 1 });
    for (const [x0, y0, x1, y1] of [[-E + t + 4, s + 6, -7, E - t - 4], [7, s + 6, E - t - 4, E - t - 4], [s + 9, -E + t + 4, E - t - 4, s + 2]]) B.mark([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], { on: court, closed: true, lod: 1 });
    // the hall of audience, four small domes at its corners, the Green Dome over it on a drum of windows
    const hall = B.box(-s, -s, s, s, 0, H, { r: 1.2, b: .9, role: 'the hall of audience' });
    B.band(H - 2.2, { on: hall, sides: 'SE' });
    tileBand(B, faceOf(hall, 'E'), H - 4.4, H - 3.2, { lod: 2 });
    belt(B, hall, .9, { lod: 2 });
    for (const [x, y] of [[-s + 4.5, -s + 4.5], [s - 4.5, -s + 4.5], [-s + 4.5, s - 4.5], [s - 4.5, s - 4.5]]) B.dome(x, y, 3.6, H, { shape: 'round', role: 'the hall of audience', lod: 1, finial: false });
    const dr = 7.5, gR = s * .66;
    const drum = B.cyl(0, 0, gR, H, H + dr, { n: 16, b: .5, role: 'the Green Dome' });
    drumWindows(B, drum, 0, 0, gR, 16, 0, H + 1.6, 1.8, 3.6, { every: 2 });
    belt(B, drum, H + dr - 1.1, { lod: 2 });
    const top = H + dr + gR * 1.45;
    const gd = B.dome(0, 0, gR, H + dr, { shape: 'pointed', role: 'the Green Dome', finial: false });
    domeBand(B, gd, 0, 0, gR, H + dr, { lod: 2, dz: 1.3 });
    // the horseman on the dome, his lance turning to the quarter the next enemy will come from
    B.line([[0, 0, top], [0, 0, top + 2.4]], { role: 'the horseman on the dome', lod: 2 });
    B.cut([[-.45, 0], [-.4, .02], [-.36, .32], [-.42, .52], [-.3, .58], [-.08, .56], [.02, .62], [.02, .9], [.1, 1], [.16, .9], [.14, .62], [.3, .66], [.46, .78], [.48, .66], [.34, .5], [.28, .3], [.34, .02], [.28, 0], [.18, .3], [-.24, .3], [-.3, 0]], 0, 0, top + 2.4, 5, { w: 6.5, role: 'the horseman on the dome', lod: 2, lines: [[[.08, .7], [-.3, 1.15]]] });
    // the iwans of the hall, south toward the gate and east
    pishtaq(B, 'S', -9, s, 9, s + 5, H + 5, { role: 'the iwan', arch: .64 });
    pishtaq(B, 'E', s, -9, s + 5, 9, H + 5, { role: 'the iwan', arch: .64 });
    // the long pool on the axis to the gate, its fountain, the orchards either side
    const lp = B.box(-3.5, s + 9, 3.5, E - t - 4, 0, .8, { r: .4, b: .5, role: 'the pool', lod: 1 });
    ripples(B, lp, -3, s + 10, 3, E - t - 5, .8, 4, { rng: smallR(B), len: 2.2, amp: .2, along: 'y', lod: 2, avoid: (x, y) => Math.abs(y - ((s + E - t) / 2 + 2)) < 3 });
    fountain(0, (s + E - t) / 2 + 2, .8, 'the pool');
    for (const [x, y] of [[-32, 26], [-20, 33], [-32, 36], [30, 26], [20, 33], [33, 36], [34, -14], [34, 2], [-33, -30], [-33, -16]]) tree(B, x + R.r(-1, 1), y + R.r(-1, 1), R.r(9.5, 12), { role: 'the orchard', lod: 1 });
    for (const [x, y] of [[-8, 22], [8, 22], [-8, 32], [8, 32]]) tree(B, x, y, 14, { shape: 'cypress', role: 'the orchard', lod: 1 });
    figure(B, 12, -E + t + 5, 0, 5.2, { role: 'the court of the guard' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* A gate of the city: twin towers, round, eight-sided or square, with battlements and slits,
     the tall pointed arch of the passage between them under its frame, the box machicolation
     over the arch, and the stubs of the wall running east and west. */
  def('gate', (R, B) => {
    const form = R.pick(['round', 'round', 'poly', 'square']);
    const g = R.r(8, 9.5), r = R.r(8.5, 9.5), tx = g + r - 1.5, th = R.r(32, 35), ph0 = th - R.r(3.5, 5.5), cy = 2, fy = cy + r * .62;
    // the stubs of the wall: battlements on both faces, courses, slits, putlog holes
    for (const sgn of [-1, 1]) {
      const a = sgn < 0 ? -40 : tx + r - 1.5, b = sgn < 0 ? -tx - r + 1.5 : 40;
      const wl = B.box(a, -WALL_T / 2, b, WALL_T / 2, 0, WALL_H, { r: .6, b: .6, role: 'the city wall' });
      B.crenels({ on: wl, every: 3.4, h: 1.6, sides: 'SN' });
      B.band(WALL_H - 2.2, { on: wl, sides: 'S', lod: 2 });
      const F = faceOf(wl, 'S');
      for (const z of [3.2, 6.4, 9.6]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 });
      F.mark(B, archGeo(F, .5, .9, 10.4, 2.4, 'flat').pts, { lod: 2, closed: true });
      vigas(B, F, 7.9, { s: .45, gap: 3.4, from: .12, to: .88 });
    }
    // the gate itself: one block of masonry between the towers, as high as their shafts (so it is the
    // part the eye goes to), the great arch in it; the towers' crowns rise over it
    const cap = form === 'square' ? 3.2 : 3.4, ph = th - cap;
    const ps = B.box(-g, -WALL_T / 2 - 2, g, fy, 0, ph, { r: .6, b: .7, role: 'the gateway' });
    B.crenels({ on: ps, every: 2.6, h: 1.5, sides: 'SN' });
    const archH = ph0 * .6, archW = g * 2 * .74, F = faceOf(ps, 'S');
    B.door('S', .5, archW, archH, { on: ps });
    voussoirs(B, F, .5, archW, 0, archH, { t: 1.2, lod: 2 });
    // the recess of the arch and the iron-bound leaves of the door in it
    B.window('S', .5, 0, archW * .72, archH * .82, { on: ps, lod: 1 });
    leaves(B, F, .5, archW * .72, 0, archH * .82, { straps: 3, studs: 3, lod: 2 });
    // the frame round the arch, and the band of the inscription at its head
    const ft = archH + 3.6;
    B.mark([[-g * .9, fy, 0], [-g * .9, fy, ft], [g * .9, fy, ft], [g * .9, fy, 0]], { on: ps, n: [0, 1, 0], lod: 1 });
    inscription(B, F, archH + 2.2, ft, { u0: .05, u1: .95, lod: 2, rule: 1 });
    // the machicolation over the arch, on its corbels
    const mz = ft + 2.2;
    const mc = B.box(-g * .62, fy, g * .62, fy + 2.4, mz, mz + 3.4, { r: .3, b: .3, role: 'the gateway', lod: 1 });
    for (let k = 0; k <= 4; k++) { const x = -g * .62 + g * 1.24 * k / 4; B.mark([[x, fy + 2.4, mz], [x, fy, mz - 1.6]], { on: mc, lod: 2 }); }
    B.windows('S', 3, mz + 1, .8, 1.4, { on: mc, shape: 'flat', lod: 2 });
    // the chamber over the gate: its string course and two latticed windows
    const zc = mz + 4.6;
    if (zc + 4 < ph - 1.6) {
      B.mark([F.at(0, zc - .8), F.at(1, zc - .8)], { on: ps, n: [0, 1, 0], lod: 1 });
      for (const u of [.32, .68]) { B.window('S', u, zc, 2, 3.4, { on: ps, lod: 1 }); grille(B, F, u, zc, 2, 3.4, { shape: 'pointed', nx: 1, ny: 2, frame: false }); }
    }
    spouts(B, ps, 'S', [.12, .88], ph - .4);
    // the threshold and the guards
    B.box(-archW * .42, fy, archW * .42, fy + 1.2, 0, .35, { r: .15, b: 0, role: 'the gateway', lod: 2 });
    for (const sx of [-1, 1]) figure(B, sx * (archW * .5 + 1.4), fy + 2.4, 0, 5.4, { role: 'the gateway' });
    // the towers, and the banner on the east one
    for (const sgn of [-1, 1]) {
      if (form === 'square') tower(B, sgn * tx, cy, r * .92, th, { role: sgn < 0 ? 'the west tower' : 'the east tower', n: 4, cap, flare: 1.06, slits: 2, capLod: 1 });
      else tower(B, sgn * tx, cy, r, th, { role: sgn < 0 ? 'the west tower' : 'the east tower', n: form === 'poly' ? 8 : 20, cap, slits: 2, capLod: 1 });
    }
    const pole = B.line([[tx, cy, th], [tx, cy, th + 8]], { role: 'the east tower', lod: 2 });
    B.plate([[tx, cy, th + 8], [tx + 3.2, cy - 3.2, th + 7], [tx, cy, th + 5.8]], { role: 'the east tower', lod: 2 });
    B.last = pole;
  }, { tier: 'city', foot: [2, 1] });

  /* A stretch of the city wall, east to west: the curtain on its sloping talus, the walk behind
     the battlements, arrow slits, and two or three round bastions standing out from it. */
  def('wall', (R, B) => {
    const nb = R.pick([2, 3, 3]), br = R.r(8, 9.5), bh = WALL_H + R.r(5, 7), by = WALL_T / 2 - 1 + br * .35, L = 60;
    const xs = nb === 2 ? [-L * .45, L * .45].map(x => x + R.r(-4, 4)) : [-L * .66, 0, L * .66].map(x => x + R.r(-3, 3));
    const edges = [-L]; for (const x of xs) edges.push(x - br + 1, x + br - 1); edges.push(L);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      const t = B.box(a, -WALL_T / 2, b, WALL_T / 2 + 2.2, 0, 3.2, { r: .4, b: 0, top: 1.2, role: 'the talus', lod: 1 });
      const w = B.box(a, -WALL_T / 2, b, WALL_T / 2, 3.2, WALL_H, { r: .5, b: .6, role: 'the city wall' });
      B.crenels({ on: w, every: 3.4, h: 1.6, sides: 'SN' });
      const n = Math.max(1, Math.round((b - a) / 9));
      for (let k = 0; k < n; k++) B.window('S', (k + .5) / n, 8, .9, 3, { on: w, shape: 'flat', lod: 2 });
      B.band(WALL_H - 2.4, { on: w, sides: 'S', lod: 1 });
      // the courses of the curtain, its putlog holes, and the weep holes along the foot of the talus
      const F = faceOf(w, 'S');
      for (const z of [6.2, 11.4]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 });
      vigas(B, F, 12.6, { s: .45, gap: 3.4, from: .08, to: .92 });
      const T = faceOf(t, 'S');
      vigas(B, T, .9, { s: .5, gap: 4.5, from: .1, to: .9 });
    }
    for (const x of xs) tower(B, x, by, br, bh, { role: 'a bastion', n: 20, cap: 3, flare: 1.08, slits: 2 });
    if (R.chance(.5)) {
      // the postern, its leaves, and the steps up the talus to it
      const i = R.i(0, edges.length / 2 - 1), a = edges[i * 2], b = edges[i * 2 + 1], w = B.parts.find(p => p.role === 'the city wall' && p.face.x0 === a);
      B.door('S', .5, 4, 7, { on: w, z: 3.2, shape: 'round' });
      leaves(B, faceOf(w, 'S'), .5, 4, 3.2, 7, { shape: 'round', straps: 2, studs: 2 });
      steps(B, 'S', (a + b) / 2 - 2.2, (a + b) / 2 + 2.2, WALL_T / 2 + 2.2, 3.2, 3, 1.1, { role: 'the city wall' });
    }
    figure(B, xs[0] + br + 3, WALL_T / 2 + 5, 0, 5.4, { role: 'the city wall' });
  }, { tier: 'city', foot: [3, 1] });

  /* The covered bazar: two or three long lanes of shops under a raised roof, a run of small
     domes each with its skylight, or a barrel vault ribbed and lit from above; the lane of each
     trade; shopfronts with their shutters and awnings on the street outside, sacks and jars set
     out, and the gate of the bazar where the middle lane comes out to the east. */
  def('bazar', (R, B) => {
    const nl = R.pick([2, 3, 3]), roof = R.pick(['domes', 'vault']);
    const X0 = -56, X1 = 44, depth = nl === 3 ? 22 : 27, Y0 = -nl * depth / 2 - 4, hs = R.r(7.5, 8.5);
    const trades = TRADES.slice().sort(() => R() - .5);
    const mid = nl === 3 ? 1 : 0;
    for (let i = 0; i < nl; i++) {
      const y0 = Y0 + i * depth, y1 = y0 + depth, yc = (y0 + y1) / 2, front = i === nl - 1, role = 'the lane of ' + trades[i];
      const blk = B.box(X0, y0, X1, y1, 0, hs, { r: 1, b: .7, role });
      belt(B, blk, .8);
      // the door of the lane at its east end, its leaves and the ring of its arch
      if (i !== mid) { B.door('E', .5, 6, hs * .78, { on: blk }); leaves(B, faceOf(blk, 'E'), .5, 6, 0, hs * .78, { straps: 2, studs: 2 }); voussoirs(B, faceOf(blk, 'E'), .5, 6, 0, hs * .78, { t: .7 }); }
      if (roof === 'vault') {
        vault(B, X0 + 2, X1 - 2, yc, 5.2, hs, { role, ribs: 9 });
        // the lunette that lights the vault from its east end, under the last rib
        const ve = B.last, lw = [];
        for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; lw.push([X1 - 2, yc + Math.cos(a) * 2.6, hs + .9 + Math.sin(a) * 2.6]); }
        B.mark(lw, { on: ve, closed: true, n: [1, 0, 0], lod: 2 });
        B.mark([[X1 - 2, yc, hs + .9], [X1 - 2, yc, hs + 3.5]], { on: ve, n: [1, 0, 0], lod: 2 });
      } else {
        const big = i === mid && nl === 3, nd = 8, step = (X1 - X0 - 6) / nd;
        const xm = big ? X0 + 3 + step * Math.floor(nd / 2) : null;
        const sp = (a, b) => { const s = B.box(a, yc - 4.6, b, yc + 4.6, hs, hs + 2.2, { r: .6, b: .4, role, lod: 0 }); B.windows('S', Math.max(1, Math.round((b - a) / 7)), hs + .5, 1.2, 1.2, { on: s, shape: 'round', lod: 2 }); };
        if (big) { sp(X0 + 3, xm - 7.5); sp(xm + 7.5, X1 - 3); } else sp(X0 + 3, X1 - 3);
        for (let k = 0; k < nd; k++) {
          const x = X0 + 3 + step * (k + .5);
          if (big && Math.abs(x - xm) < 8) continue;
          B.dome(x, yc, 3.7, hs + 2.2, { shape: 'round', h: .78, role, lod: 0, finial: false });
          B.mark(circ(.7, 8, x, yc).map(q => [q.u, q.v, hs + 2.2 + 3.7 * .78]), { closed: true, lod: 1, cls: 'mid' });
        }
        if (big) {
          const d = B.box(xm - 7.5, yc - 7, xm + 7.5, yc + 7, hs, hs + 5.5, { r: .8, b: .6, role: 'the crossing of the lanes' });
          B.windows('S', 3, hs + 1.4, 1.4, 2.2, { on: d, shape: 'round', lod: 2 });
          B.band(hs + 4.8, { on: d, sides: 'SE', lod: 2 });
          const cd = B.dome(xm, yc, 6.4, hs + 5.5, { shape: 'pointed', role: 'the crossing of the lanes', finial: false });
          domeBand(B, cd, xm, yc, 6.4, hs + 5.5, { dz: .9, n: 20 });
          // the lantern on the crown that lets out the heat and lets in the light
          const lz = hs + 5.5 + 6.4 * 1.45 - .5;
          const ln = B.cyl(xm, yc, 1.3, lz, lz + 1.6, { n: 8, b: .2, role: 'the crossing of the lanes', lod: 2 });
          drumWindows(B, ln, xm, yc, 1.3, 8, 0, lz + .3, .5, 1, { shape: 'flat' });
          B.dome(xm, yc, 1.4, lz + 1.6, { shape: 'pointed', role: 'the crossing of the lanes', lod: 2, finial: false });
        }
      }
      if (front) {
        // the shopfronts on the street: openings with their folded shutters over them, the stone bench
        // (the mastaba) where the shopkeeper sits before each, awnings on their poles over some
        const n = 9, Ff = faceOf(blk, 'S');
        for (let k = 0; k < n; k++) {
          const u = (k + .5) / n, sw = (X1 - X0) / n * .62, sx = lerp(X0, X1, u);
          B.door('S', u, sw, hs * .62, { on: blk, shape: 'flat', lod: 1 });
          B.panel('S', u - .028, u + .028, hs * .68, hs * .86, { on: blk, lod: 2 });
          for (const f of [-1 / 3, 1 / 3]) Ff.mark(B, [Ff.at(u + f * .028, hs * .68), Ff.at(u + f * .028, hs * .86)], { lod: 2 });
          for (const f of [-.25, 0, .25]) Ff.mark(B, [Ff.at(u + f * sw / (X1 - X0), 0), Ff.at(u + f * sw / (X1 - X0), hs * .62)], { lod: 2 });
          B.box(sx - sw * .5, y1, sx + sw * .5, y1 + 1.8, 0, 1.1, { r: .2, b: 0, role: 'a shop', lod: 2 });
        }
        const picks = [1, 3, 4, 6, 7].filter(() => R.chance(.75));
        for (const k of picks) {
          const a = X0 + (X1 - X0) * k / n + .6, b = X0 + (X1 - X0) * (k + 1) / n - .6;
          const aw = awning(B, 'S', a, b, y1, hs * .7, 4.6, 1.6, { role: 'a shop' });
          B.line([[a, y1 + 4.6, 0], [a, y1 + 4.6, hs * .7 - 1.6], [b, y1 + 4.6, hs * .7 - 1.6], [b, y1 + 4.6, 0]], { role: 'a shop', lod: 2 });
          B.last = aw;
          const gx = (a + b) / 2;
          if (R.chance(.5)) { sack(B, gx - 1.6, y1 + 3.2, 2.2, { role: 'a shop' }); sack(B, gx + 1.4, y1 + 3.6, 2, { role: 'a shop' }); }
          else { jar(B, gx - 1.4, y1 + 3.2, 3, { role: 'a shop' }); jar(B, gx + 1.4, y1 + 3.1, 2.6, { role: 'a shop' }); }
        }
        spouts(B, blk, 'S', [.06, .94], hs - .3);
      }
    }
    // the gate of the bazar, at the east end of the middle lane
    const yc = Y0 + (mid + .5) * depth;
    pishtaq(B, 'E', X1, yc - 8, X1 + 5, yc + 8, hs + 10, { role: 'the gate of the bazar', arch: .6 });
    B.person(X1 + 9, yc + 3, 5.5, { role: 'the gate of the bazar' });
    B.person(X0 + 30, Y0 + nl * depth + 8, 5.5, { role: 'a shop' });
  }, { tier: 'city', foot: [3, 2] });

  /* The khan, the caravanserai: a square court shut in by two storeys of rooms, arcades on both
     storeys facing the court, round towers at the corners, blank outer walls with high slits,
     and the one great portal on the south. In the court a well or a little mosque raised on
     arches; bales of goods, camels kneeling and standing. */
  def('khan', (R, B) => {
    const E = 46, t = R.r(10, 11.5), H = R.r(15, 17), s1 = H * .5, tr = 5.6, court = R.pick(['well', 'mosque']);
    for (const [x, y] of [[-E, -E], [E, -E], [-E, E], [E, E]]) tower(B, x, y, tr, H + 2.5, { role: 'the towers of the khan', cap: 2.4, flare: 1.06, merlons: 6 });
    // the court fronts in two storeys: the arcade of the ground floor, the floor of the gallery, the
    // gallery's arches standing on it and the parapet of its balustrade across them
    const two = (p, side, n) => {
      B.arcade(side, n, 0, s1 * .8, { on: p }); B.band(s1 + .3, { on: p, sides: side });
      B.arcade(side, n, s1 + .3, (H - s1) * .66 + .7, { on: p, shape: 'round' });
      const F = faceOf(p, side); F.mark(B, [F.at(0, s1 + 1.6), F.at(1, s1 + 1.6)], { lod: 2 });
      B.band(H - 1.4, { on: p, sides: side, lod: 2 });
      belt(B, p, .8);
    };
    // the blank outer walls: their courses, the putlog holes of the scaffold, the high slits
    const outer = (p, side) => { const F = faceOf(p, side); for (const z of [.8, H * .36]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 }); vigas(B, F, H * .5, { s: .4, gap: 5.2, from: .08, to: .92 }); };
    const n = B.box(-E + tr, -E, E - tr, -E + t, 0, H, { r: 1, b: .8, role: 'the rooms of the merchants' });
    two(n, 'S', 9);
    spouts(B, n, 'S', [.2, .5, .8], H - .3);
    const w = B.box(-E, -E + t, -E + t, E - tr, 0, H, { r: 1, b: .8, role: 'the rooms of the merchants' });
    two(w, 'E', 8);
    const e = B.box(E - t, -E + t, E, E - tr, 0, H, { r: 1, b: .8, role: 'the storerooms' });
    B.windows('E', 6, H * .66, .9, 2.4, { on: e, shape: 'flat', lod: 1 });
    B.band(H - 2.4, { on: e, sides: 'E' });
    outer(e, 'E');
    spouts(B, e, 'E', [.25, .75], H - .3);
    for (const [a, b] of [[-E + tr, -9.5], [9.5, E - tr]]) {
      const s = B.box(a, E - t, b, E, 0, H, { r: 1, b: .8, role: 'the stables' });
      B.windows('S', 3, H * .66, .9, 2.4, { on: s, shape: 'flat', lod: 1 });
      B.band(H - 2.4, { on: s, sides: 'S' });
      outer(s, 'S');
      spouts(B, s, 'S', [.5], H - .3);
    }
    pishtaq(B, 'S', -9.5, E - t, 9.5, E + 3, H + 10, { role: 'the portal of the khan', arch: .58 });
    // the porters' benches either side of the portal
    for (const sx of [-1, 1]) B.box(sx * 7.6 - 1.4, E + 3, sx * 7.6 + 1.4, E + 4.6, 0, 1.2, { r: .2, b: 0, role: 'the portal of the khan', lod: 2 });
    B.plate([[-E + t, -E + t, 0], [E - t, -E + t, 0], [E - t, E - t, 0], [-E + t, E - t, 0]], { cls: 'nf', role: 'the court', lod: 1 });
    if (court === 'mosque') {
      const m = B.box(-6.5, -6.5, 6.5, 6.5, 0, 8, { r: .6, b: .6, role: 'the little mosque' });
      B.arcade('S', 3, 0, 5.4, { on: m }); B.arcade('E', 3, 0, 5.4, { on: m });
      B.band(7, { on: m, sides: 'SE', lod: 2 });
      const top = B.box(-5, -5, 5, 5, 8, 11.5, { r: .5, b: .5, role: 'the little mosque', lod: 1 });
      B.band(10.6, { on: top, sides: 'SE', lod: 2 });
      // the stair up the side of the arcade to the prayer room on top
      steps(B, 'E', -2.2, 2.2, 6.5, 2.4, 2, 1, { role: 'the little mosque' });
      B.dome(0, 0, 4.4, 11.5, { shape: 'round', role: 'the little mosque', lod: 1 });
      alem(B, 0, 0, 11.5 + 4.4, 1.4, { role: 'the little mosque' });
    } else {
      // the well: its curb and coping, the frame over it with the pulley on its beam, the rope and the bucket
      const wl = B.cyl(0, 0, 3.2, 0, 2.6, { n: 16, b: .6, role: 'the well' });
      belt(B, wl, .9, { lod: 2 });
      B.cyl(0, 0, 3.45, 2.6, 3.1, { n: 16, b: .5, role: 'the well', lod: 2 });
      const fr = B.line([[-3.2, 0, 3.1], [-3.2, 0, 8.4], [3.2, 0, 8.4], [3.2, 0, 3.1]], { role: 'the well', lod: 1 });
      B.mark(circ(.8, 10, 0, 0).map(q => [q.u * .7071, -q.u * .7071, 8.4 - .9 + q.v]), { on: fr, closed: true, lod: 2 });
      B.line([[0, 0, 7.5], [0, 0, 5.2]], { role: 'the well', lod: 2, cls: 'lo' });
      B.lathe(0, 0, [[.45, 4.1], [.6, 4.3], [.66, 5.2]], { n: 10, role: 'the well', lod: 2 });
      const tg = B.cyl(0, -6, 4.6, 0, .9, { n: 16, b: .4, role: 'the trough', lod: 1 });
      ripples(B, tg, -3.6, -9, 3.6, -3, .9, 2, { rng: smallR(B), len: 2.2, amp: .2, lod: 2 });
    }
    // bales stacked against the west arcade, roped, the camels of the caravan
    const bx = -E + t + 3;
    for (const bb of [[bx, -12, bx + 5, -6, 0, 3.4], [bx, -5.5, bx + 5, .5, 0, 3.4], [bx + .5, -9, bx + 4.5, -2.5, 3.4, 6.4]]) {
      const bl = B.box(...bb, { r: .8, b: .3, role: 'the bales', lod: 2 });
      belt(B, bl, (bb[4] + bb[5]) / 2, { lod: 2 });
      const Fb = faceOf(bl, 'E'); Fb.mark(B, [Fb.at(.5, bb[4]), Fb.at(.5, bb[5])], { lod: 2 });
    }
    B.cut(CAMEL, 12, 16, 0, 9, { w: 12, role: 'the camels', lod: 2 });
    B.cut(CAMEL, -16, 22, 0, 9, { w: 12, flip: true, role: 'the camels', lod: 2 });
    B.person(-6, 18, 5.6, { role: 'the camels' });
    // the caravan coming in at the portal
    for (let i = 0; i < 3; i++) B.cut(CAMEL, 16 + i * 11, E + 5 + i * 1.6, 0, 9, { w: 12, flip: true, role: 'the caravan', lod: 2 });
    B.person(8, E + 5, 5.6, { role: 'the caravan' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* The bath: the changing hall under its great dome and lantern, the warm room and the hot room
     under shallow domes studded with glass lights, the private cells in small domes about them,
     the furnace at the back with its chimney and the tank over it, and a plain door on the street. */
  def('hammam', (R, B) => {
    const tr = R.chance(.5);
    const T = (x, y) => tr ? [y + 6, x + 2] : [x + 2, y + 6];
    const T3 = (x, y, z) => [...T(x, y), z];
    const SD = s => tr ? { S: 'E', E: 'S', N: 'W', W: 'N' }[s] : s;
    const bx = (x0, y0, x1, y1, z0, z1, o) => { const [a, b] = T(x0, y0), [c, d] = T(x1, y1); return B.box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d), z0, z1, o); };
    const dome = (x, y, r, z, o) => { const [a, b] = T(x, y); return B.dome(a, b, r, z, o); };
    const lights = (on, x, y, r, z, hk, rings, o) => { const [a, b] = T(x, y); oculi(B, on, a, b, r, z, hk, rings, o); };
    const h1 = R.r(11, 13), h2 = R.r(8, 9.5), dr = R.r(11.5, 13), main = R.pick(['round', 'round', 'pointed']);
    // the changing hall, the front of the bath, its great dome on a low drum and its lantern
    const ch = bx(-34, 2, -2, 34, 0, h1, { r: 1, b: .8, role: 'the changing hall' });
    B.windows(SD('S'), 2, h1 * .62, 1.6, 2.6, { on: ch, lod: 2 });
    for (const u of [.12, .88]) grille(B, faceOf(ch, SD('S')), u, h1 * .62, 1.6, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    B.band(h1 - 1.4, { on: ch, sides: 'SE', lod: 1 });
    tileBand(B, faceOf(ch, SD('S')), h1 - 3.2, h1 - 2.3);
    belt(B, ch, .9);
    const [cx, cy] = T(-18, 18);
    const drum = B.cyl(cx, cy, dr * 1.04, h1, h1 + 2, { n: 16, b: .4, role: 'the dome of the changing hall' });
    belt(B, drum, h1 + 1, { lod: 2 });
    const dm = B.dome(cx, cy, dr, h1 + 2, { shape: main, h: main === 'round' ? .92 : .8, role: 'the dome of the changing hall', finial: false });
    oculi(B, dm, cx, cy, dr, h1 + 2, main === 'round' ? .92 : .9, [[.55, 7]], { lod: 2 });
    const lz = h1 + 2 + dr * (main === 'round' ? .92 : 1.16);
    const ln = B.cyl(cx, cy, 2.6, lz - .6, lz + 2.2, { n: 8, b: .3, role: 'the lantern', lod: 1 });
    drumWindows(B, ln, cx, cy, 2.6, 8, 0, lz + .1, .9, 1.6, { shape: 'pointed' });
    B.dome(cx, cy, 2.8, lz + 2.2, { shape: 'pointed', role: 'the lantern', lod: 1, finial: false });
    B.line([[cx, cy, lz + 2.2 + 2.8 * 1.45], [cx, cy, lz + 2.2 + 2.8 * 1.45 + 1.4]], { role: 'the lantern', lod: 2 });
    alem(B, cx, cy, lz + 2.2 + 2.8 * 1.45, 1.4, { role: 'the lantern' });
    // the entrance, a plain block with its door, the plaque over it, the bench beside it and the
    // towels hung out on their rod, the sign of a bath
    const en = bx(-2, 16, 30, 34, 0, h2, { r: 1, b: .7, role: 'the door of the bath' });
    const Fe = faceOf(en, SD('S'));
    B.door(SD('S'), .62, 5.4, 8, { on: en });
    voussoirs(B, Fe, .62, 5.4, 0, 8, { t: .8 });
    leaves(B, Fe, .62, 5.4, 0, 8, { straps: 2, studs: 2 });
    B.panel(SD('S'), .5, .74, 8.8, h2 - 1.6, { on: en, lod: 2 });
    inscription(B, Fe, 8.8 + .35, h2 - 1.6 - .35, { u0: .5, u1: .74 });
    B.door(SD('E'), .5, 4.4, 6.4, { on: en, shape: 'round', lod: 2 });
    belt(B, en, .9);
    spouts(B, en, SD('S'), [.08, .96], h2 - .3);
    const [b0x, b0y] = T(lerp(-2, 30, .12), 34), [b1x, b1y] = T(lerp(-2, 30, .36), 35.8);
    B.box(Math.min(b0x, b1x), Math.min(b0y, b1y), Math.max(b0x, b1x), Math.max(b0y, b1y), 0, 1.6, { r: .2, b: 0, role: 'the door of the bath', lod: 2 });
    const rod = B.line([T3(lerp(-2, 30, .4), 34, 7.6), T3(lerp(-2, 30, .4), 36.4, 7.6), T3(lerp(-2, 30, .4) - 6, 36.4, 7.6), T3(lerp(-2, 30, .4) - 6, 34, 7.6)], { role: 'the door of the bath', lod: 2 });
    for (const k of [0, 1, 2]) { const x = lerp(-2, 30, .4) - 1.2 - k * 1.8; B.mark([T3(x - .7, 36.4, 7.6), T3(x + .7, 36.4, 7.6), T3(x + .7, 36.4, 5.4 - k * .4), T3(x - .7, 36.4, 5.4 - k * .4)], { on: rod, closed: true, lod: 2 }); }
    // the warm room behind the hall, a shallow dome with its lights
    const wr = bx(-34, -24, -2, 2, 0, h2, { r: 1, b: .7, role: 'the warm room' });
    belt(B, wr, .9);
    const wd = dome(-18, -11, 10.5, h2, { shape: 'shallow', h: 1.3, role: 'the warm room', finial: false });
    lights(wd, -18, -11, 10.5, h2, .65, [[.35, 6], [.68, 10]], { lod: 1 });
    // the hot room, its central dome and the small domes of the private cells
    const hr = bx(-2, -34, 30, 16, 0, h2 - .5, { r: 1, b: .7, role: 'the hot room' });
    B.band(h2 - 1.6, { on: hr, sides: 'SE', lod: 2 });
    belt(B, hr, .9);
    // the small round lights high in its walls, and the vents on its roof that let the steam out
    for (const sd of 'SE') { const F = faceOf(hr, SD(sd)); for (const u of [.3, .7]) F.mark(B, circ(.55, 10, 0, 0).map(q => F.at(u + q.u / F.len, h2 - 3.2 + q.v)), { lod: 2, closed: true }); }
    for (const [x, y] of [[27, -2], [1, -18], [27, -20]]) { const [a, b2] = T(x, y); const v = B.cyl(a, b2, .7, h2 - .5, h2 + .9, { n: 8, b: .2, role: 'the hot room', lod: 2 }); belt(B, v, h2 + .5, { lod: 2 }); }
    const hk = R.pick([.6, .75]);
    const hd = dome(13, -10, 9.5, h2 - .5, { shape: 'round', h: hk, role: 'the hot room', finial: false });
    lights(hd, 13, -10, 9.5, h2 - .5, hk, [[.32, 5], [.64, 9]], { lod: 1 });
    const cells = [[24.5, 8], [3.5, 8], [24.5, -27], [3.5, -27]].filter((c, i) => i < 2 || R.chance(.7));
    for (const [x, y] of cells) {
      const c = dome(x, y, 4.4, h2 - .5, { shape: 'round', h: .72, role: 'the private cells', lod: 1, finial: false });
      lights(c, x, y, 4.4, h2 - .5, .72, [[.45, 4]], { lod: 2, size: .45 });
    }
    // the furnace with its stoking arch and the stack of wood, the tank over it with its ladder,
    // the chimney with its cap and its smoke
    const fu = bx(-30, -46, -4, -26, 0, 6, { r: .8, b: .5, role: 'the furnace' });
    B.door(SD('E'), .5, 3.4, 4, { on: fu, shape: 'round' });
    voussoirs(B, faceOf(fu, SD('E')), .5, 3.4, 0, 4, { shape: 'round', t: .7 });
    for (let k = 0; k < 3; k++) { const [a, b] = T(-3.6, -44 + k * 1.1), [c, d] = T(-1.2, -43 + k * 1.1); B.box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d), k * .55, k * .55 + .9, { r: .35, b: 0, role: 'the furnace', lod: 2 }); }
    const tk = bx(-27, -44, -13, -30, 6, 13, { r: .6, b: .6, role: 'the water tank', lod: 1 });
    B.band(11, { on: tk, sides: 'SE', lod: 2 });
    const lad = B.line([T3(-13, -31.2, 6), T3(-11.2, -31.2, 13.4), T3(-11.2, -33.6, 13.4), T3(-13, -33.6, 6)], { role: 'the water tank', lod: 2 });
    for (let k = 1; k < 6; k++) { const f = k / 6; B.mark([T3(-13 + 1.8 * f, -31.2, 6 + 7.4 * f), T3(-13 + 1.8 * f, -33.6, 6 + 7.4 * f)], { on: lad, lod: 2 }); }
    const [kx, ky] = T(-8, -40);
    const chim = B.cyl(kx, ky, 2, 6, 21, { n: 10, b: .3, role: 'the chimney' });
    for (const z of [10, 15]) belt(B, chim, z, { lod: 2 });
    B.cyl(kx, ky, 2.5, 21, 22, { n: 10, b: .3, role: 'the chimney', lod: 2 });
    const sm = []; for (let i = 0; i <= 12; i++) { const [a, b] = T(-8 + Math.sin(i * .9) * 1.4 + i * .5, -40 - i * .3); sm.push([a, b, 22 + i * 1.3]); }
    B.line(sm, { role: 'the chimney', lod: 2, cls: 'lo' });
    figure(B, ...T(lerp(-2, 30, .62) + 3, 38), 0, 5.4, { role: 'the door of the bath' });
  }, { tier: 'city', foot: [2, 2] });

  /* A walled garden in four parts, the chahar bagh: a low wall with its gate, the four beds with
     their rows of planting divided by water channels, a pool where the channels meet and a
     pavilion standing in it, cypresses at the corners, fruit trees and palms in the beds. */
  def('garden', (R, B) => {
    const E = 52, wt = 2, wh = 6, kiosk = R.pick(['dome', 'tent']);
    const ground = B.plate([[-E, -E, 0], [E, -E, 0], [E, E, 0], [-E, E, 0]], { cls: 'nf', role: 'the beds', lod: 0, hiOK: false });
    // the channels between their kerbs, the water moving in them, and the planting in rows in each bed
    const cw = 2.2, pr = 12;
    for (const [a, b] of [[-E + wt, -pr], [pr, E - wt]]) {
      B.mark([[-cw, a, 0], [-cw, b, 0]], { on: ground, cls: 'mid' }); B.mark([[cw, a, 0], [cw, b, 0]], { on: ground, cls: 'mid' });
      B.mark([[a, -cw, 0], [b, -cw, 0]], { on: ground, cls: 'mid' }); B.mark([[a, cw, 0], [b, cw, 0]], { on: ground, cls: 'mid' });
      for (let k = 0; k < 4; k++) { const t = lerp(a, b, (k + .5) / 4); B.mark([[-.8, t - 1, 0], [0, t, 0], [.8, t - 1, 0]], { on: ground, lod: 2 }); B.mark([[t - 1, -.8, 0], [t, 0, 0], [t - 1, .8, 0]], { on: ground, lod: 2 }); }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x0 = sx < 0 ? -E + 6 : cw + 4, x1 = sx < 0 ? -cw - 4 : E - 6, y0 = sy < 0 ? -E + 6 : cw + 4, y1 = sy < 0 ? -cw - 4 : E - 6;
      B.mark([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], { on: ground, closed: true, lod: 1 });
      for (let k = 1; k < 6; k++) { const y = lerp(y0, y1, k / 6); B.mark([[x0, y, 0], [x1, y, 0]], { on: ground, lod: 2 }); }
    }
    // the wall, its coping, and its gate with the leaves of the door
    const walls = [[-E, -E, E, -E + wt], [-E, -E + wt, -E + wt, E], [E - wt, -E + wt, E, E], [-E + wt, E - wt, -6.5, E], [6.5, E - wt, E - wt, E]];
    for (const [x0, y0, x1, y1] of walls) { const w = B.box(x0, y0, x1, y1, 0, wh, { r: .4, b: 0, role: 'the garden wall' }); coping(B, w, { out: .3, h: .5 }); }
    pishtaq(B, 'S', -6.5, E - wt - 1, 6.5, E + 1.6, 13, { role: 'the garden gate', arch: .58, inner: false, leaves: true });
    // the pool and the pavilion in it, the causeway out to it
    const pool = B.cyl(0, 0, pr, 0, 1.2, { n: 8, b: .8, role: 'the pool', rot: Math.PI / 8 });
    ripples(B, pool, -pr * .8, -pr * .8, pr * .8, pr * .8, 1.2, 6, { len: 3.4, amp: .3, avoid: (x, y) => Math.hypot(x, y) < 7.5 || Math.hypot(x, y) > pr * .8 });
    B.box(-1.8, 6, 1.8, pr + .4, 1.2, 1.9, { r: .2, b: .3, role: 'the pavilion', lod: 1 });
    B.cyl(0, 0, 6.4, 1.2, 2.6, { n: 8, b: .5, role: 'the pavilion', rot: Math.PI / 8 });
    const c = 4.2, ch = 11;
    for (const [x, y] of [[-c, -c], [c, -c], [-c, c], [c, c]]) {
      B.box(x - .8, y - .8, x + .8, y + .8, 2.6, 3.3, { r: .15, b: 0, role: 'the pavilion', lod: 2 });
      B.cyl(x, y, .5, 3.3, ch, { n: 6, b: 0, role: 'the pavilion', lod: 1 });
    }
    const roofp = B.box(-c - 1.6, -c - 1.6, c + 1.6, c + 1.6, ch, ch + 1.3, { r: .6, b: .5, role: 'the pavilion' });
    B.band(ch + .65, { on: roofp, sides: 'SE', lod: 2 });
    if (kiosk === 'dome') { B.dome(0, 0, c + .6, ch + 1.3, { shape: 'onion', role: 'the pavilion' }); alem(B, 0, 0, ch + 1.3 + (c + .6) * 1.5, Math.max(1.4, (c + .6) * .28), { role: 'the pavilion' }); }
    else { pyramid(B, -c - 1.6, -c - 1.6, c + 1.6, c + 1.6, ch + 1.3, ch + 7.5, { role: 'the pavilion' }); B.sphere(0, 0, ch + 7.9, .5, { role: 'the pavilion', lod: 2 }); }
    // the well in the corner path and its shaduf, the sweep that lifts the water into the channels
    const wx = -E + 15, wy = -E + 4;
    B.cyl(wx, wy, 1.5, 0, 1.6, { n: 12, b: .3, role: 'the beds', lod: 1 });
    B.line([[wx + 3, wy, 0], [wx + 3, wy, 6]], { role: 'the beds', lod: 1, w: 1.2 });
    B.line([[wx - .2, wy, 3.4], [wx + 3, wy, 6], [wx + 7, wy, 8.6], [wx + 7, wy, 6.6]], { role: 'the beds', lod: 2 });
    // cypresses at the corners, fruit trees and palms in the beds
    for (const [x, y] of [[-E + 7, -E + 7], [E - 7, -E + 7], [-E + 7, E - 7], [E - 7, E - 7]]) tree(B, x, y, R.r(17, 21) * .8, { shape: 'cypress', role: 'the cypresses', lod: 0 });
    // each bed planted in rows: fruit trees, with a palm or two among them
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const rows = [[.3, .3], [.74, .3], [.3, .74]];
      rows.forEach(([fx, fy], i) => {
        const x = sx * (cw + 4 + fx * (E - 10 - cw)) + R.r(-1.2, 1.2), y = sy * (cw + 4 + fy * (E - 10 - cw)) + R.r(-1.2, 1.2);
        if (i === 0 && sx * sy < 0) palm(B, x, y, R.r(15, 19), { role: 'the palms' });
        else tree(B, x, y, R.r(8.5, 11.5), { role: 'the fruit trees' });
      });
    }
    figure(B, 16, 26, 0, 5.2, { role: 'the gardener' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* The maidan, the open square: paving in a grid, the fountain kiosk of the sabil in the middle
     on its steps, tents and awnings of the market, and the arcaded fronts of the square on its
     north and west sides, a gate in one, a minaret at their corner, so the square opens to you. */
  def('square', (R, B) => {
    const E = 54, h = R.r(12, 14), t = 10;
    const pave = B.plate([[-E + t, -E + t, 0], [E, -E + t, 0], [E, E, 0], [-E + t, E, 0]], { role: 'the square', lod: 0, hiOK: false });
    for (let v = -E + t + 8; v < E; v += 8) { B.mark([[-E + t, v, 0], [E, v, 0]], { on: pave, lod: 2 }); B.mark([[v, -E + t, 0], [v, E, 0]], { on: pave, lod: 2 }); }
    // the fronts on the north and west: the arcade of the shops, each shop's door at the back of its
    // arch, the sill course of the upper windows, the cornice and the spouts
    const front = (p, side, n) => {
      B.arcade(side, n, 0, h * .6, { on: p }); B.band(h - 2, { on: p, sides: side === 'S' ? 'SE' : 'E' });
      const F = faceOf(p, side), span = (.96 - .04) / n;
      for (let i = 0; i < n; i++) F.mark(B, archGeo(F, .04 + span * (i + .5), span * F.len * .3, 0, h * .34, 'flat').pts, { lod: 2, closed: true });
      F.mark(B, [F.at(0, h * .7 - .4), F.at(1, h * .7 - .4)], { lod: 2 });
      belt(B, p, .8);
      return F;
    };
    const n = B.box(-E, -E, E, -E + t, 0, h, { r: 1, b: .8, role: 'the arcades of the square' });
    front(n, 'S', 11);
    B.windows('S', 11, h * .7, 1.2, 1.8, { on: n, lod: 2, shape: 'round' });
    spouts(B, n, 'S', [.12, .5, .88], h - .3);
    const w = B.box(-E, -E + t, -E + t, E, 0, h, { r: 1, b: .8, role: 'the arcades of the square' });
    front(w, 'E', 11);
    spouts(B, w, 'E', [.3, .75], h - .3);
    pishtaq(B, 'S', 4, -E + t - 2, 22, -E + t + 3, h + 9, { role: 'the gate of the mosque', arch: .6 });
    // the minaret at the corner of the two fronts: its shaft in courses, the balcony of the call to
    // prayer on its corbels with its rail, the lantern of windows over it, the onion and the alem
    const mx = -E + t / 2, my = -E + t / 2;
    tower(B, mx, my, 4.6, h + 4, { role: 'the minaret', n: 8, cap: 1.6, flare: 1.18, merlons: 6, talus: false, course: false });
    const shaft = B.cyl(mx, my, 3.2, h + 4, h + 20, { n: 8, b: .3, role: 'the minaret' });
    for (const z of [h + 9, h + 14.5]) belt(B, shaft, z, { lod: 2 });
    const bal = B.cyl(mx, my, 4.3, h + 20, h + 21.4, { n: 8, b: .3, role: 'the minaret', lod: 1 });
    corbelRing(B, bal, mx, my, 3.2, 4.3, h + 20, 1.4, 16, 2);
    const rail = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU; rail.push([mx + Math.cos(a) * 4.1, my + Math.sin(a) * 4.1, h + 22.6]); }
    const up = B.cyl(mx, my, 2.4, h + 21.4, h + 27, { n: 8, b: .3, role: 'the minaret', lod: 1 });
    B.mark(rail, { on: bal, lod: 2, axis: [mx, my] });
    for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; if (Math.cos(a) * TW[0] + Math.sin(a) * TW[1] > .1) B.mark([[mx + Math.cos(a) * 4.1, my + Math.sin(a) * 4.1, h + 21.4], [mx + Math.cos(a) * 4.1, my + Math.sin(a) * 4.1, h + 22.6]], { on: bal, lod: 2 }); }
    drumWindows(B, up, mx, my, 2.4, 8, 0, h + 23, .8, 2, { shape: 'pointed' });
    B.dome(mx, my, 2.6, h + 27, { shape: 'onion', role: 'the minaret', lod: 1 });
    B.line([[mx, my, h + 27 + 2.6 * 1.5], [mx, my, h + 27 + 2.6 * 1.5 + 1.4]], { role: 'the minaret', lod: 2 });
    alem(B, mx, my, h + 27 + 2.6 * 1.5, 1.4, { role: 'the minaret' });
    // the sabil: the fountain kiosk on its two steps, a grille in every face and the basin under it,
    // a broad eave on its brackets and a little dome with its alem
    const fx = 6, fy = 6;
    B.cyl(fx, fy, 10.4, 0, .5, { n: 8, b: .4, role: 'the fountain', rot: Math.PI / 8, lod: 2 });
    B.cyl(fx, fy, 9, 0, 1, { n: 8, b: .6, role: 'the fountain', rot: Math.PI / 8 });
    const k = B.box(fx - 4.6, fy - 4.6, fx + 4.6, fy + 4.6, 1, 8.5, { r: .5, b: .5, role: 'the fountain' });
    for (const s of 'SE') { B.window(s, .5, 3, 5, 4.4, { on: k, shape: 'round' }); for (let i = 1; i < 4; i++) B.window(s, .5 - .28 + .56 * i / 4, 3.2, .05, 3.6, { on: k, shape: 'flat', lod: 2 }); const F = faceOf(k, s); F.mark(B, [F.at(0, 2.4), F.at(1, 2.4)], { lod: 2 }); }
    B.box(fx - 3.4, fy + 4.6, fx + 3.4, fy + 6.2, 1, 2.2, { r: .3, b: .3, role: 'the fountain', lod: 2 });
    const eave = B.box(fx - 6.6, fy - 6.6, fx + 6.6, fy + 6.6, 8.5, 9.6, { r: .6, b: .5, role: 'the fountain' });
    for (let i = 1; i < 6; i++) { const u = i / 6; B.mark([[fx - 6.6 + 13.2 * u, fy + 4.6, 7.4], [fx - 6.6 + 13.2 * u, fy + 6.6, 8.5], [fx - 6.6 + 13.2 * u, fy + 4.6, 8.5]], { on: eave, n: [1, 0, 0], closed: true, lod: 2 }); B.mark([[fx + 4.6, fy - 6.6 + 13.2 * u, 7.4], [fx + 6.6, fy - 6.6 + 13.2 * u, 8.5], [fx + 4.6, fy - 6.6 + 13.2 * u, 8.5]], { on: eave, n: [0, 1, 0], closed: true, lod: 2 }); }
    const sd = B.dome(fx, fy, 4, 9.6, { shape: 'round', role: 'the fountain' });
    domeBand(B, sd, fx, fy, 4, 9.6, { dz: .7, n: 14 });
    alem(B, fx, fy, 13.6, 1.4, { role: 'the fountain' });
    // the market under its tents and awnings
    const st = [[-30, 34, 'awning'], [30, 34, 'tent'], [34, -10, 'awning'], [-26, -16, 'tent'], [2, 38, 'awning']];
    for (const [x, y, kd] of st) if (R.chance(.85)) stall(B, x + R.r(-2, 2), y + R.r(-2, 2), kd === 'tent' ? 10 : 12, 9, { kind: kd, role: 'the market', goods: 2 });
    // the storyteller on his bench, the ring of listeners about him
    const sx = -18, sy = 12;
    B.box(sx - 3.5, sy - 2.5, sx + 3.5, sy + 2.5, 0, 1.8, { r: .4, b: .3, role: 'the storyteller', lod: 1 });
    figure(B, sx, sy, 1.8, 6, { role: 'the storyteller' });
    for (let i = 0; i < 6; i++) { const a = .1 + i / 5 * 1.6; B.person(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9, 5, { role: 'the storyteller' }); }
    for (const [x, y] of [[18, 22], [22, 4], [10, -26]]) B.person(x + R.r(-3, 3), y + R.r(-3, 3), 5.6, { role: 'the crowd' });
    // the plane trees that shade the storyteller's corner
    for (const [x, y, hh] of [[-34, 0, 12], [-31, 22, 10.5]]) tree(B, x, y, hh, { role: 'the storyteller' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* A small barred window: the opening and its bars, on a box's face. */
  function barred(B, on, side, u, z, w, h, lod) {
    B.window(side, u, z, w, h, { on, shape: 'flat', lod: lod == null ? 1 : lod });
    for (const k of [.33, .66]) B.window(side, u - w / 2 / (side === 'S' || side === 'N' ? on.face.x1 - on.face.x0 : on.face.y1 - on.face.y0) + k * w / (side === 'S' || side === 'N' ? on.face.x1 - on.face.x0 : on.face.y1 - on.face.y0), z, .02, h, { on, shape: 'flat', lod: 2 });
  }
  /* A cross for a dome, a gable or a tower, in one stroke. */
  function cross(B, x, y, z, h, o) {
    o = Object.assign({ role: 'the cross', lod: 1 }, o);
    const a = h * .3, za = z + h * .7;
    B.line([[x, y, z], [x, y, z + h], [x, y, za], [x - a * .7, y + a * .7, za], [x + a * .7, y - a * .7, za]], { role: o.role, lod: o.lod });
  }

  /* A quarter of the city: courtyard houses of one, two and three storeys packed along a lane
     that winds in under the gate of the quarter, the darb, and ends at the door of the little
     mosque of the quarter with its short minaret; roof rooms, lattice bays, a tree in a court. */
  def('quarter', (R, B) => {
    const tr = R.chance(.5);
    const T = (x, y) => tr ? [y, x] : [x, y];
    const T3 = (x, y, z) => [...T(x, y), z];
    const SD = s => tr ? { S: 'E', E: 'S', N: 'W', W: 'N' }[s] : s;
    const bx = (x0, y0, x1, y1, z0, z1, o) => { const [a, b] = T(x0, y0), [c, d] = T(x1, y1); return B.box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d), z0, z1, o); };
    const j = () => R.r(-1.5, 1.5);
    const storey = () => R.pick([9, 9, 13, 13, 17]);
    let ladder = 0;
    const house = (x0, y0, x1, y1, door, o) => {
      o = o || {};
      x0 += j(); x1 += j(); y0 += j(); y1 += j();
      const h = o.h || storey();
      const p = bx(x0, y0, x1, y1, 0, h, { r: .8, b: .6, role: o.role || 'a house' });
      if (door) {
        const ds = SD(door[0]), shape = R.pick(['pointed', 'round']);
        B.door(ds, door[1], 3.4, 5.6, { on: p, shape });
        const F = faceOf(p, ds);
        leaves(B, F, door[1], 3.4, 0, 5.6, { shape, straps: 1, studs: 1 });
      }
      const ws = R.r(.2, .8), we = R.r(.2, .8);
      B.window(SD('S'), ws, h - 4.6, 1.8, 2.6, { on: p, lod: 2 });
      B.window(SD('E'), we, h - 4.6, 1.8, 2.6, { on: p, lod: 2 });
      grille(B, faceOf(p, SD('S')), ws, h - 4.6, 1.8, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false });
      grille(B, faceOf(p, SD('E')), we, h - 4.6, 1.8, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false });
      if (h > 10) B.band(h - 1.6, { on: p, sides: SD('S') + SD('E'), lod: 2 });
      // the beam ends of the roof through the wall, and a spout for the rain off it
      vigas(B, faceOf(p, SD('S')), h - .9, { s: .42, gap: 2.4 });
      belt(B, p, .7);
      spouts(B, p, SD('S'), [door && door[1] > .5 ? .12 : .88], h - .25, { out: 1.2 });
      if (o.room !== false && R.chance(.55)) {
        const rw = Math.min(9, (x1 - x0) * .4), rd = Math.min(8, (y1 - y0) * .4);
        const k = bx(x0 + 1.4, y0 + 1.4, x0 + 1.4 + rw, y0 + 1.4 + rd, h, h + 5.4, { r: .6, b: .5, role: 'a roof room', lod: 1 });
        B.door(SD('S'), .5, 2.8, 3.6, { on: k, shape: 'round', lod: 2 });
        // the ladder up to the roof room's roof, on the first that has one
        if (!ladder++) {
          const lx = x0 + 1.4 + rw, ly = y0 + 1.4 + rd * .5;
          const lad = B.line([T3(lx, ly - 1, h), T3(lx + 1.6, ly - 1, h + 5.8), T3(lx + 1.6, ly + 1, h + 5.8), T3(lx, ly + 1, h)], { role: 'a roof room', lod: 2 });
          for (let i = 1; i < 5; i++) { const f = i / 5; B.mark([T3(lx + 1.6 * f, ly - 1, h + 5.8 * f), T3(lx + 1.6 * f, ly + 1, h + 5.8 * f)], { on: lad, lod: 2 }); }
        }
      }
      if (o.wind !== false && R.chance(.4)) {
        // a wind-catcher, the malqaf, its hood open to the north wind, its slots on the sides
        const xm = lerp(x0, x1, R.r(.55, .8));
        const [a1, b1] = T(xm - 2.2, y0 + 1), [a2, b2] = T(xm + 2.2, y0 + 4.4);
        const wc = B.box(Math.min(a1, a2), Math.min(b1, b2), Math.max(a1, a2), Math.max(b1, b2), h, h + 5.5, { r: .3, b: .3, role: 'a wind-catcher', lod: 1 });
        for (const sd of 'SE') { const F = faceOf(wc, sd); for (const u of [.3, .5, .7]) F.mark(B, archGeo(F, u, .5, h + 1.2, 3, 'flat').pts, { lod: 2, closed: true }); }
        B.plate([T(xm - 2.6, y0 + .6), T(xm + 2.6, y0 + .6), T(xm + 2.6, y0 + 4.8), T(xm - 2.6, y0 + 4.8)].map(([u, v], i) => [u, v, i < 2 ? h + 7.4 : h + 5.5]), { role: 'a wind-catcher', lod: 1 });
      }
      if (o.bay && h > 10) {
        // the lattice bay over the lane on its brackets: the screen in a grid, the sill and the hood
        const [s, u] = o.bay, F = SD(s);
        const [ax, ay] = T(lerp(x0, x1, u), y1);
        const z0 = h * .5, z1 = h * .82;
        const bay = F === 'S' ? B.box(ax - 3.6, ay, ax + 3.6, ay + 2.2, z0, z1, { r: .4, b: .3, role: 'a lattice window', lod: 1 })
          : B.box(ax, ay - 3.6, ax + 2.2, ay + 3.6, z0, z1, { r: .4, b: .3, role: 'a lattice window', lod: 1 });
        const G = faceOf(bay, F);
        for (let i = 1; i < 6; i++) G.mark(B, [G.at(i / 6, z0), G.at(i / 6, z1)], { lod: 2 });
        for (let i = 1; i < 4; i++) G.mark(B, [G.at(0, lerp(z0, z1, i / 4)), G.at(1, lerp(z0, z1, i / 4))], { lod: 2 });
        for (const f of [.15, .85]) { const q = G.at(f, z0); B.mark(F === 'S' ? [[q[0], ay, z0 - 1.6], [q[0], ay + 2.2, z0], [q[0], ay, z0]] : [[ax, q[1], z0 - 1.6], [ax + 2.2, q[1], z0], [ax, q[1], z0]], { on: p, closed: true, lod: 2, n: G.n }); }
      }
      return p;
    };
    const court = (x0, y0, x1, y1, door) => {
      // an L of rooms round a small court with its tree
      const h = storey(), t = 9;
      const a = bx(x0, y0, x1, y0 + t, 0, h, { r: .8, b: .6, role: 'a courtyard house' });
      vigas(B, faceOf(a, SD('S')), h - .9, { s: .42, gap: 2.4 });
      const wing = bx(x0, y0 + t, x0 + t, y1, 0, h * .8, { r: .8, b: .6, role: 'a courtyard house' });
      // the windows of the rooms on the court, with their grilles
      for (const [q, sd, u, z] of [[a, 'S', .72, h - 4.6], [wing, 'E', .45, h * .8 - 4.4]]) { B.window(SD(sd), u, z, 1.8, 2.6, { on: q, lod: 2 }); grille(B, faceOf(q, SD(sd)), u, z, 1.8, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false }); }
      const s = bx(x0 + t, y1 - 1.6, x1, y1, 0, 4.4, { r: .4, b: 0, role: 'a courtyard house' });
      if (door) { B.door(SD('S'), .5, 3, 3.6, { on: s, shape: 'round' }); leaves(B, faceOf(s, SD('S')), .5, 3, 0, 3.6, { shape: 'round', straps: 1, studs: 1 }); }
      bx(x1 - 1.6, y0 + t, x1, y1 - 1.6, 0, 4.4, { r: .4, b: 0, role: 'a courtyard house' });
      const [cx, cy] = T((x0 + t + x1) / 2, (y0 + t + y1) / 2);
      if (R.chance(.5)) tree(B, cx, cy, R.r(10, 13), { role: 'the court of a house' }); else palm(B, cx, cy, R.r(14, 17), { role: 'the court of a house' });
    };
    // the lane, from the darb to the mosque door
    B.guide([[9, 57], [9, 18], [-11, 18], [-11, -16], [-31, -16], [-31, -21]].map(p => T(p[0], p[1])));
    house(-50, 30, -24, 52, ['S', .5], { bay: ['S', .3] });
    house(-21, 26, 2, 52, ['E', .4], { bay: ['S', .5] });
    house(16, 28, 34, 52, ['S', .5], { h: 17 });
    house(36, 32, 52, 52, ['S', .4], { room: false });
    house(16, -6, 36, 22, ['S', .3], { bay: ['S', .6] });
    court(38, -12, 54, 24, true);
    house(-4, -12, 14, 8, ['S', .5]);
    court(-52, -10, -19, 22, false);
    house(-2, -52, 22, -18, ['S', .7], { h: 17, bay: ['S', .3] });
    house(26, -52, 52, -16, ['S', .5]);
    // the darb, the gate of the quarter over the lane: its arch and leaves, the plaque over it
    const d = bx(2, 51, 16, 56, 0, 14, { r: .6, b: .6, role: 'the gate of the quarter' });
    const Fd = faceOf(d, SD('S'));
    B.door(SD('S'), .5, 8, 10.4, { on: d });
    voussoirs(B, Fd, .5, 8, 0, 10.4, { t: .8 });
    leaves(B, Fd, .5, 8 * .8, 0, 10.4 * .86, { straps: 2, studs: 2 });
    B.door(SD('S'), .5, 8 * .8, 10.4 * .86, { on: d, lod: 2 });
    B.band(12, { on: d, sides: SD('S') + SD('E'), lod: 2 });
    inscription(B, Fd, 12, 13.3, { u0: .12, u1: .88 });
    // the mosque of the quarter, its dome and its short minaret by the door
    const m = bx(-52, -52, -26, -24, 0, 11, { r: .8, b: .7, role: 'the mosque of the quarter' });
    B.door(SD('S'), .78, 4, 7, { on: m });
    leaves(B, faceOf(m, SD('S')), .78, 4, 0, 7, { straps: 2, studs: 2 });
    B.windows(SD('S'), 2, 4, 2, 3.4, { on: m, to: .5, lod: 2 });
    B.windows(SD('E'), 2, 4, 2, 3.4, { on: m, lod: 2 });
    B.band(9.6, { on: m, sides: SD('S') + SD('E'), lod: 2 });
    const [mx, my] = T(-39, -38);
    const md = B.dome(mx, my, 7.5, 11, { shape: 'pointed', drum: 2, drumN: 8, role: 'the mosque of the quarter' });
    domeBand(B, md, mx, my, 7.5, 13, { dz: .9, n: 20 });
    alem(B, mx, my, 13 + 7.5 * 1.45, Math.max(1.4, 7.5 * .28), { role: 'the mosque of the quarter' });
    const [nx, ny] = T(-21, -27.5);
    const mb = B.box(nx - 3.6, ny - 3.6, nx + 3.6, ny + 3.6, 0, 15, { r: .5, b: .5, role: 'the minaret' });
    B.band(13.6, { on: mb, sides: 'SE', lod: 2 });
    const ms = B.cyl(nx, ny, 2.5, 15, 25, { n: 8, b: .3, role: 'the minaret' });
    belt(B, ms, 20, { lod: 2 });
    const mbal = B.cyl(nx, ny, 3.3, 25, 26, { n: 8, b: .3, role: 'the minaret', lod: 1 });
    corbelRing(B, mbal, nx, ny, 2.5, 3.3, 25, 1, 16, 2);
    B.cyl(nx, ny, 1.8, 26, 29.5, { n: 8, b: .3, role: 'the minaret', lod: 1 });
    B.dome(nx, ny, 2, 29.5, { shape: 'onion', role: 'the minaret', lod: 1 });
    const [px, py] = T(9, 40), [qx, qy] = T(-6, 18);
    B.person(px, py, 5.4, { role: 'the lane' }); B.person(qx, qy, 5.4, { role: 'the lane' });
  }, { tier: 'city', foot: [3, 3] });

  /* The wine house, in the Christian quarter or down by the river: a narrow house whose upper storey
     juts over the street on its brackets, with lattice windows and a loggia open to the east; an
     awning over the door and the jug hung out for a sign; a rack of amphorae and the great jars by
     the door; and the yard under a vine trellis with its bench, where the cup goes round.
     By the river it has a landing, its steps and a boat. */
  def('tavern', (R, B) => {
    const river = R.chance(.45), dy = river ? -12 : 0, g = R.r(9.5, 10.5), h = g + R.r(7.5, 8.5), j = 2.6;
    const x0 = -34, x1 = R.r(-8, -5), y0 = -22 + dy, y1 = 2 + dy;
    const G = B.box(x0, y0, x1, y1, 0, g, { r: 1, b: .7, role: 'the wine house' });
    const du = .7, dx = lerp(x0, x1, du), FG = faceOf(G, 'S');
    B.door('S', du, 4.4, 7, { on: G, shape: 'round' });
    leaves(B, FG, du, 4.4, 0, 7, { shape: 'round', straps: 2, studs: 2 });
    B.windows('S', 2, 3, 1.8, 2.4, { on: G, from: .12, to: .4, shape: 'flat', lod: 2 });
    for (const u of [.12, .4]) grille(B, FG, u, 3, 1.8, 2.4, { nx: 2, ny: 1, frame: false });
    B.window('E', .4, 3, 1.8, 2.4, { on: G, shape: 'flat', lod: 2 });
    grille(B, faceOf(G, 'E'), .4, 3, 1.8, 2.4, { nx: 2, ny: 1, frame: false });
    belt(B, G, .7);
    // the brackets that carry the jutting storey
    for (let k = 0; k <= 8; k++) { const x = lerp(x0 + 1, x1 - 1, k / 8); B.mark([[x, y1, g - 2.2], [x, y1 + j, g]], { on: G, lod: 1 }); }
    for (let k = 0; k <= 7; k++) { const y = lerp(y0 + 1, y1 - 1, k / 7); B.mark([[x1, y, g - 2.2], [x1 + j, y, g]], { on: G, lod: 2 }); }
    // the upper storey, jutting over the street: its lattice windows in a grid, the loggia open to the
    // east with its balustrade, the beam ends of its roof and the spouts
    const U = B.box(x0, y0, x1 + j, y1 + j, g, h, { r: 1, b: .8, role: 'the upper room' });
    B.band(h - 1.6, { on: U, sides: 'SE', lod: 2 });
    for (const u of [.18, .42, .66]) {
      B.panel('S', u - .08, u + .08, g + 1.6, h - 2.6, { on: U, lod: 1 });
      for (let k = 1; k < 4; k++) B.mark([[lerp(x0, x1 + j, u - .08 + .04 * k), y1 + j, g + 1.6], [lerp(x0, x1 + j, u - .08 + .04 * k), y1 + j, h - 2.6]], { on: U, n: [0, 1, 0], lod: 2 });
      for (let k = 1; k < 3; k++) { const z = lerp(g + 1.6, h - 2.6, k / 3); B.mark([[lerp(x0, x1 + j, u - .08), y1 + j, z], [lerp(x0, x1 + j, u + .08), y1 + j, z]], { on: U, n: [0, 1, 0], lod: 2 }); }
    }
    B.arcade('E', 3, g + 1, (h - g) * .66, { on: U, shape: 'round', from: .14, to: .86 });
    const FU = faceOf(U, 'E');
    FU.mark(B, [FU.at(0, g + 1), FU.at(1, g + 1)], { lod: 2 }); FU.mark(B, [FU.at(0, g + 2.4), FU.at(1, g + 2.4)], { lod: 2 });
    vigas(B, faceOf(U, 'S'), h - .8, { s: .45, gap: 2.4 });
    spouts(B, U, 'S', [.9], h - .3); spouts(B, U, 'E', [.08], h - .3);
    // the roof terrace and its awning on four posts, the divan under it where the cup goes round on summer nights
    const ax0 = x0 + 4, ax1 = x0 + 17, ay0 = y0 + 4, ay1 = y0 + 14, ah = h + 6.5;
    B.line([[ax0, ay1, h], [ax0, ay1, ah], [ax1, ay1, ah], [ax1, ay1, h]], { role: 'the roof terrace', lod: 1 });
    B.line([[ax0, ay0, h], [ax0, ay0, ah + 1.2], [ax1, ay0, ah + 1.2], [ax1, ay0, h]], { role: 'the roof terrace', lod: 2 });
    B.box(ax0 + 1.2, ay0 + 1, ax1 - 1.2, ay0 + 3.6, h, h + 1.3, { r: .5, b: .3, role: 'the roof terrace', lod: 2 });
    const ra = B.plate([[ax0 - .6, ay0, ah + 1.2], [ax1 + .6, ay0, ah + 1.2], [ax1 + .6, ay1 + .6, ah], [ax0 - .6, ay1 + .6, ah]], { role: 'the roof terrace', lod: 1 });
    for (let k = 1; k < 6; k++) { const x = lerp(ax0 - .6, ax1 + .6, k / 6); B.mark([[x, ay0, ah + 1.2], [x, ay1 + .6, ah]], { on: ra, lod: 2 }); }
    figure(B, ax1 - 3, ay0 + 6, h, 5.2, { role: 'the roof terrace' });
    // the awning over the door on its poles, the lantern by the door, the jug hung out for a sign
    const da = awning(B, 'S', dx - 4.4, dx + 4.4, y1, g - 1.6, 4.2, 1.6, { role: 'the door of the wine house' });
    B.line([[dx - 4.4, y1 + 4.2, 0], [dx - 4.4, y1 + 4.2, g - 3.2]], { role: 'the door of the wine house', lod: 2 });
    B.last = da;
    B.line([[dx - 3.4, y1, 8.4], [dx - 3.4, y1 + 1.4, 8.4], [dx - 3.4, y1 + 1.4, 7.6]], { role: 'the door of the wine house', lod: 2 });
    B.lathe(dx - 3.4, y1 + 1.4, [[.3, 5.9], [.55, 6.3], [.55, 7.2], [.2, 7.6]], { n: 8, role: 'the door of the wine house', lod: 2 });
    B.line([[x1 + j, y1 + j - .6, g + 1.4], [x1 + j + 4.4, y1 + j - .6, g + 1.4], [x1 + j + 4.4, y1 + j - .6, g - .4]], { role: 'the sign of the jug', lod: 1 });
    B.lathe(x1 + j + 4.4, y1 + j - .6, [[.5, g - 3.8], [1.3, g - 2.9], [1.1, g - 1.4], [.5, g - 1], [.6, g - .4]], { n: 10, role: 'the sign of the jug', lod: 1 });
    // the rack of amphorae along the house, the great jars by the door
    const rx0 = x0 + 3, rx1 = dx - 6;
    B.box(rx0, y1 + 1, rx1, y1 + 3.6, 0, 1, { r: .3, b: .3, role: 'the wine jars', lod: 1 });
    const na = Math.max(3, Math.floor((rx1 - rx0) / 2.5));
    for (let k = 0; k < na; k++) B.lathe(lerp(rx0 + 1.6, rx1 - 1.6, k / (na - 1)), y1 + 2.3, [[.24, 1], [.8, 1.9], [1, 3.2], [.74, 4.3], [.34, 4.8], [.45, 5.4]], { n: 10, role: 'the wine jars', lod: k % 2 ? 2 : 1 });
    for (const [x, y] of [[dx + 5.6, y1 + 2.6], [dx + 8.2, y1 + 4.6]]) B.lathe(x, y, [[.9, 0], [1.9, .9], [2.2, 2.4], [1.8, 3.6], [1, 4.1], [1.15, 4.6]], { n: 14, role: 'the great jars', lod: 1 });
    // the yard under the vine
    const X0 = x1 + j + 4, X1 = 37, Y0 = y0 + 2, Y1 = y1 + j + 4, th = 10.5;
    const xs = [X0 + 2, (X0 + X1) / 2, X1 - 2.5];
    xs.forEach((x, i) => B.line([[x, Y1 - 1, 0], [x, Y1 - 1, th], [x, Y0 + 1, th], [x, Y0 + 1, 0]], { role: 'the vine trellis', lod: i === 1 ? 1 : 0 }));
    const sl = B.line([[xs[0], Y1 - 1, th + .2], [xs[2], Y1 - 1, th + .2]], { role: 'the vine trellis', lod: 1 });
    for (let k = 1; k <= 6; k++) { const y = lerp(Y1 - 1, Y0 + 1, k / 6); B.mark([[xs[0] - 1, y, th + .2], [xs[2] + 1, y, th + .2]], { on: sl, cls: 'mid', lod: 1 }); }
    // the vine: up the front post and along the slats, its leaves and its bunches
    const vine = [[xs[0] + .4, Y1 - .6, 0], [xs[0] - .3, Y1 - .4, th * .4], [xs[0] + .5, Y1 - .7, th * .75], [xs[0] + .2, Y1 - 1, th + .4]];
    for (let i = 1; i <= 20; i++) { const t = i / 20; vine.push([lerp(xs[0], xs[2], t), Y1 - 1 + Math.sin(t * 13) * .9, th + .5 + Math.sin(t * 7) * .3]); }
    const vl = B.line(vine, { role: 'the vine', lod: 1 });
    for (let i = 0; i < 30; i++) {
      const x = lerp(xs[0] + 1, xs[2] - 1, R()), y = lerp(Y1 - 1, Y0 + 1, Math.pow(R(), 1.6)), z = th + .4;
      B.mark(circ(R.r(1.1, 1.6), 7, x, y).map(q => [q.u, q.v, z]), { on: vl, closed: true, lod: 1, cls: 'mid' });
      if (i % 3 === 0) B.mark([[x - .6, y, z - .3], [x + .6, y, z - .3], [x, y, z - 2]], { on: vl, closed: true, lod: 2 });
    }
    B.box(X0 + 5, (Y0 + Y1) / 2 - 2, X1 - 6, (Y0 + Y1) / 2 + .8, 0, 2.2, { r: .5, b: .3, role: 'the drinking bench', lod: 1 });
    B.cyl((X0 + X1) / 2, (Y0 + Y1) / 2 + 4, 2, 0, 1.6, { n: 12, b: .3, role: 'the drinking bench', lod: 2 });
    B.lathe((X0 + X1) / 2 + .6, (Y0 + Y1) / 2 + 4, [[.3, 1.6], [.6, 2.1], [.45, 2.9], [.25, 3.2], [.32, 3.5]], { n: 8, role: 'the drinking bench', lod: 2 });
    B.person(X0 + 8, (Y0 + Y1) / 2 + 3.6, 5.4, { role: 'the drinkers' });
    B.person(X1 - 9, (Y0 + Y1) / 2 + 4.4, 5.4, { role: 'the drinkers' });
    // the yard walls and their coping
    const ew = B.box(X1, Y0 - 2, X1 + 1.6, Y1 + 1.6, 0, 3.8, { r: .3, b: 0, role: 'the yard', lod: 0 });
    const sw = B.box(X0 - 1, Y1, X1, Y1 + 1.6, 0, 3.8, { r: .3, b: 0, role: 'the yard', lod: 0 });
    B.door('S', .5, 3.2, 3.4, { on: sw, shape: 'round' });
    coping(B, ew, { out: .25, h: .45 }); coping(B, sw, { out: .25, h: .45 });
    if (river) {
      const ly = Y1 + 3;
      const q = B.box(-40, ly, 40, ly + 6, 0, 3, { r: .6, b: .5, role: 'the landing' });
      const Fq = faceOf(q, 'S'); for (let x = -36; x < 40; x += 8) Fq.mark(B, [Fq.at((x + 40) / 80, 0), Fq.at((x + 40) / 80, 3)], { lod: 2 });
      for (let k = 0; k < 2; k++) B.box(dx - 6, ly + 6 + k * 2.4, dx + 6, ly + 8.4 + k * 2.4, 0, 2 - k * .9, { r: .2, b: 0, role: 'the landing', lod: 1 });
      water(B, [[-40, ly + 6], [40, ly + 6], [40, 40], [-40, 40]], 0, { role: 'the river', waves: 12, avoid: (x, y) => Math.abs(x - dx) < 8 && y < ly + 12 });
      boat(B, dx + 20, ly + 15, 20, 5.6, { role: 'the boat of the wine house', lod: 0 });
      B.line([[dx + 11, ly + 15, 2.2], [dx + 8, ly + 6, 3]], { role: 'the boat of the wine house', lod: 2 });
      // the mooring post on the landing, and the boat's oars shipped along its sides
      const bp = B.cyl(dx + 8, ly + 4.6, .7, 3, 4.6, { n: 8, b: 0, role: 'the landing', lod: 2 });
      belt(B, bp, 4, { lod: 2 });
      B.line([[dx + 13, ly + 13.4, 2.4], [dx + 27, ly + 12.2, 1.6]], { role: 'the boat of the wine house', lod: 2 });
    }
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [2, 2] });

  /* A church of the eastern Christians, or a monastery's church: a basilica under its pitched
     roof with the lower roofs of its aisles, the porch of arches across the front, the gable with
     its round window, the transept and the crossing raised into a drum with a dome or a cone,
     the apse at the east end, and the bell tower at the corner with its belfry and pyramid. */
  def('church', (R, B) => {
    const crown = R.pick(['dome', 'cone']), side = R.chance(.5) ? 1 : -1, hn = R.r(19, 21), ha = 12;
    const YF = 36, YC0 = -30, YC1 = -12, rise = 8;
    // rows of roof tiles down a slope, ridge to eave, on the plate they lie on
    const tiles = (plate, a, b, step) => { const n = Math.max(2, Math.round(Math.hypot(b[0][0] - a[0][0], b[0][1] - a[0][1]) / step)); for (let i = 1; i < n; i++) { const f = i / n; B.mark([[lerp(a[0][0], b[0][0], f), lerp(a[0][1], b[0][1], f), lerp(a[0][2], b[0][2], f)], [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)]], { on: plate, lod: 2 }); } };
    // the porch across the front: its arches with their rings, its steps
    const nx = B.box(-20, YF, 20, YF + 8, 0, 10, { r: .8, b: .6, role: 'the porch' });
    B.arcade('S', 5, 0, 7, { on: nx, shape: 'round' });
    B.band(8.6, { on: nx, sides: 'SE', lod: 2 });
    const Fp = faceOf(nx, 'S'), span = .92 / 5;
    for (let i = 0; i < 5; i++) voussoirs(B, Fp, .04 + span * (i + .5), span * 40 * .74, 0, 7, { shape: 'round', t: .55 });
    belt(B, nx, .6);
    steps(B, 'S', -8, 8, YF + 8, 1.2, 2, 1.1, { role: 'the porch' });
    // the nave and its roof of tiles, the gable with its round window
    const nave = B.box(-10, YC1, 10, YF, 0, hn, { r: .6, b: 0, role: 'the nave' });
    B.windows('S', 3, 12, 2, 4.6, { on: nave, from: .3, to: .7, shape: 'round' });
    B.windows('E', 6, ha + 4.2, 1.6, 3.2, { on: nave, shape: 'round', lod: 1 });
    B.band(ha + 3.4, { on: nave, sides: 'E', lod: 2 });
    const gr = gable(B, -10, YC1, 10, YF, hn, rise, { role: 'the roof of the nave', along: 'y', eave: 1 });
    tiles(gr.east, [[0, YC1 - 1, hn + rise], [11, YC1 - 1, hn - .6]], [[0, YF + 1, hn + rise], [11, YF + 1, hn - .6]], 2.2);
    B.mark(circ(2.4, 16, 0, 0).map(q => [q.u, YF + 1.05, hn + 3.1 + q.v]), { on: gr.gable, closed: true, n: [0, 1, 0], lod: 1 });
    B.mark(circ(1.5, 12, 0, 0).map(q => [q.u, YF + 1.05, hn + 3.1 + q.v]), { on: gr.gable, closed: true, n: [0, 1, 0], lod: 2 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; B.mark([[Math.cos(a) * 1.5, YF + 1.05, hn + 3.1 + Math.sin(a) * 1.5], [Math.cos(a) * 2.4, YF + 1.05, hn + 3.1 + Math.sin(a) * 2.4]], { on: gr.gable, n: [0, 1, 0], lod: 2 }); B.mark([[-Math.cos(a) * 1.5, YF + 1.05, hn + 3.1 - Math.sin(a) * 1.5], [-Math.cos(a) * 2.4, YF + 1.05, hn + 3.1 - Math.sin(a) * 2.4]], { on: gr.gable, n: [0, 1, 0], lod: 2 }); }
    cross(B, 0, YF + 1, hn + rise, 4, { role: 'the roof of the nave' });
    // the aisles under their lean-to roofs, the pilasters between the windows
    for (const s of [-1, 1]) {
      const a = B.box(s < 0 ? -20 : 10, YC1, s < 0 ? -10 : 20, YF, 0, ha, { r: .6, b: 0, role: 'the aisles' });
      if (s > 0) {
        B.windows('E', 6, 4, 1.8, 4, { on: a, shape: 'round' });
        const F = faceOf(a, 'E'); for (let k = 1; k < 6; k++) F.mark(B, [F.at(k / 6, 0), F.at(k / 6, ha)], { lod: 2 });
        F.mark(B, [F.at(0, 3.4), F.at(1, 3.4)], { lod: 2 });
      }
      B.windows('S', 1, 4, 1.8, 4, { on: a, shape: 'round', lod: 2 });
      const xo = s < 0 ? -20.8 : 20.8;
      const lp = B.plate([[s < 0 ? -10 : 10, YC1 - .8, ha + 3.6], [xo, YC1 - .8, ha - .5], [xo, YF + .8, ha - .5], [s < 0 ? -10 : 10, YF + .8, ha + 3.6]], { role: 'the aisles' });
      if (s > 0) tiles(lp, [[10, YC1 - .8, ha + 3.6], [xo, YC1 - .8, ha - .5]], [[10, YF + .8, ha + 3.6], [xo, YF + .8, ha - .5]], 2.2);
    }
    // the transept and the crossing
    for (const s of [-1, 1]) {
      const t = B.box(s < 0 ? -27 : 10, YC0, s < 0 ? -10 : 27, YC1, 0, hn - 2, { r: .6, b: 0, role: 'the transept' });
      if (s > 0) B.window('E', .5, 7, 3, 7, { on: t, shape: 'round' });
      if (s > 0) {
        const g2 = gable(B, 10, YC0, 27, YC1, hn - 2, rise - 1, { role: 'the transept', along: 'x', eave: .8 });
        B.mark(circ(1.6, 12, 0, 0).map(q => [27.85, (YC0 + YC1) / 2 + q.u, hn + .3 + q.v]), { on: g2.gable, closed: true, n: [1, 0, 0], lod: 2 });
        const ym = (YC0 + YC1) / 2;
        tiles(g2.south, [[10 - .8, ym, hn - 2 + rise - 1], [10 - .8, YC1 + .8, hn - 2 - .48]], [[27 + .8, ym, hn - 2 + rise - 1], [27 + .8, YC1 + .8, hn - 2 - .48]], 2.2);
      }
      else gable(B, -27, YC0, -10, YC1, hn - 2, rise - 1, { role: 'the transept', along: 'x', eave: .8 });
    }
    const cr = B.box(-10, YC0, 10, YC1, 0, hn + rise + 1, { r: .6, b: .6, role: 'the crossing' });
    B.band(hn + rise - .4, { on: cr, sides: 'SE', lod: 2 });
    const dz = hn + rise + 1, cyR = 7.4, dh = 7;
    const drum = B.cyl(0, (YC0 + YC1) / 2, cyR, dz, dz + dh, { n: 12, b: .4, role: 'the dome', rot: Math.PI / 12 });
    for (let i = 0; i < 12; i++) { const a = (i + .5) / 12 * TAU, c = Math.cos(a), s = Math.sin(a); if (c + s > .3) B.mark([[c * cyR * .97, (YC0 + YC1) / 2 + s * cyR * .97, dz + 1.1], [c * cyR * .97, (YC0 + YC1) / 2 + s * cyR * .97, dz + dh - .8]], { lod: 1, n: [c, s, 0] }); }
    drumWindows(B, drum, 0, (YC0 + YC1) / 2, cyR, 12, Math.PI / 12, dz + 1.6, 1.2, 3.4, { every: 1 });
    belt(B, drum, dz + 1.1, { lod: 2 }); belt(B, drum, dz + dh - .8, { lod: 2 });
    let top;
    if (crown === 'dome') { const dm = B.dome(0, (YC0 + YC1) / 2, cyR, dz + dh, { shape: 'round', role: 'the dome', finial: false }); top = dz + dh + cyR; ribs(B, dm, 0, (YC0 + YC1) / 2, cyR, dz + dh, 'round', 12, 2); }
    else { B.cone(0, (YC0 + YC1) / 2, cyR * 1.06, dz + dh, dz + dh + 9, { n: 12, role: 'the dome' }); top = dz + dh + 9; }
    cross(B, 0, (YC0 + YC1) / 2, top, 4.4, { role: 'the dome' });
    // the apse at the east end
    const ap = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; ap.push([Math.cos(a) * 9, YC0 - Math.sin(a) * 9]); }
    B.prism(ap, 0, hn - 4, { b: .5, role: 'the apse' });
    // the bell tower: its courses, its door, the sill course of the belfry's arches, the bell
    const tx0 = side > 0 ? 21 : -31, tx1 = tx0 + 10, ty0 = YF - 6, ty1 = YF + 6, th = R.r(33, 36);
    const bt = B.box(tx0, ty0, tx1, ty1, 0, th, { r: .5, b: .5, role: 'the bell tower' });
    B.band(th * .4, { on: bt, sides: 'SE' }); B.band(th * .7, { on: bt, sides: 'SE' });
    B.window('S', .5, th * .5, 1.4, 3.6, { on: bt, shape: 'round', lod: 2 }); B.window('E', .5, th * .5, 1.4, 3.6, { on: bt, shape: 'round', lod: 2 });
    B.door('S', .5, 3, 5.4, { on: bt, shape: 'round', lod: 1 });
    leaves(B, faceOf(bt, 'S'), .5, 3, 0, 5.4, { shape: 'round', straps: 1, studs: 1 });
    belt(B, bt, .7);
    const bel = B.box(tx0, ty0, tx1, ty1, th, th + 7, { r: .5, b: .5, role: 'the belfry' });
    belt(B, bel, th + .6, { lod: 1 });
    for (const s of 'SE') { B.door(s, .3, 3, 5.6, { on: bel, z: th + .6, shape: 'round' }); B.door(s, .7, 3, 5.6, { on: bel, z: th + .6, shape: 'round' }); }
    B.line([[(tx0 + tx1) / 2, (ty0 + ty1) / 2, th + 6.4], [(tx0 + tx1) / 2, (ty0 + ty1) / 2, th + 3.4]], { role: 'the bell', lod: 2 });
    const py = pyramid(B, tx0 - .6, ty0 - .6, tx1 + .6, ty1 + .6, th + 7, th + 15, { role: 'the bell tower' });
    for (const f of [.25, .5, .75]) B.mark([[lerp(tx0 - .6, (tx0 + tx1) / 2, f), ty1 + .6 - (ty1 + .6 - (ty0 + ty1) / 2) * f, th + 7 + 8 * f], [lerp(tx1 + .6, (tx0 + tx1) / 2, f), ty1 + .6 - (ty1 + .6 - (ty0 + ty1) / 2) * f, th + 7 + 8 * f], [lerp(tx1 + .6, (tx0 + tx1) / 2, f), lerp(ty0 - .6, (ty0 + ty1) / 2, f), th + 7 + 8 * f]], { on: py, lod: 2 });
    cross(B, (tx0 + tx1) / 2, (ty0 + ty1) / 2, th + 15, 4, { role: 'the bell tower' });
    // the churchyard: cypresses and a few graves, each with its cross, and a monk at the door
    const gx = side > 0 ? -30 : 30;
    tree(B, gx, 20, R.r(16, 19), { shape: 'cypress', role: 'the churchyard' });
    tree(B, gx, -2, R.r(14, 17), { shape: 'cypress', role: 'the churchyard' });
    for (const yy of [8, 30]) { B.box(gx - 1.4, yy - .3, gx + 1.4, yy + .3, 0, 3.2, { r: .2, b: 0, role: 'the churchyard', lod: 2 }); cross(B, gx, yy, 3.2, 1.6, { role: 'the churchyard', lod: 2 }); }
    figure(B, 11, YF + 11, 0, 5.4, { role: 'the porch' });
  }, { tier: 'city', foot: [2, 3] });

  /* The hospital, the bimaristan of Baghdad or of Nur al-Din: a court with an iwan in the middle
     of each side, the wards between them, the hall of the physicians under a stepped muqarnas dome
     at one corner, and in the court a garden of four beds about a pool and its fountain. */
  def('hospital', (R, B) => {
    const E = 48, t = 10, h = R.r(11, 12.5), ih = h + R.r(9, 12), iw = 11, sw = R.chance(.5), H0 = 24;
    // a ward: its windows with their grilles, the cornice, the plinth course, a spout through the parapet
    const ward = (x0, y0, x1, y1, side, n) => {
      const p = B.box(x0, y0, x1, y1, 0, h, { r: 1, b: .8, role: 'the wards' });
      if (side) {
        B.windows(side, n, h * .55, 1.6, 2.6, { on: p, lod: 1 });
        const F = faceOf(p, side); for (let i = 0; i < n; i++) grille(B, F, n === 1 ? .5 : lerp(.12, .88, i / (n - 1)), h * .55, 1.6, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false });
        B.band(h - 1.5, { on: p, sides: side, lod: 1 });
        spouts(B, p, side, [n === 1 ? .2 : .5 / n], h - .3);
      }
      belt(B, p, .8);
      return p;
    };
    // the north side: two wards and the iwan open to the court
    ward(-E, -E, -iw, -E + t, 'S', 4); ward(iw, -E, sw ? E : H0, -E + t, 'S', sw ? 4 : 2);
    pishtaq(B, 'S', -iw, -E, iw, -E + t + 3, ih, { role: 'the iwan of the physicians', arch: .62 });
    // the west side
    ward(-E, -E + t, -E + t, -iw, 'E', 3); ward(-E, iw, -E + t, sw ? H0 : E, 'E', sw ? 2 : 4);
    pishtaq(B, 'E', -E, -iw, -E + t + 3, iw, ih, { role: 'the iwan of the lecture', arch: .62 });
    // the east side, its wards looking out
    ward(E - t, sw ? -E + t : -H0, E, -iw, 'E', sw ? 3 : 2); ward(E - t, iw, E, E, 'E', 4);
    const ie = B.box(E - t - 3, -iw, E, iw, 0, ih, { r: .8, b: .7, role: 'the iwan of the sick' });
    B.windows('E', 2, h * .55, 2, 3.6, { on: ie });
    for (const u of [.12, .88]) grille(B, faceOf(ie, 'E'), u, h * .55, 2, 3.6, { shape: 'pointed', nx: 1, ny: 2, frame: false });
    tileBand(B, faceOf(ie, 'E'), ih - 3.4, ih - 2.2);
    B.crenels({ on: ie, every: 2.2, h: 1.2, sides: 'E', lod: 2 });
    belt(B, ie, .8);
    // the south side: the portal is the back of the south iwan; its steps, a sick man brought to it
    ward(sw ? -H0 : -E + t, E - t, -iw, E, 'S', sw ? 1 : 3); ward(iw, E - t, E - t, E, 'S', 4);
    pishtaq(B, 'S', -iw, E - t - 3, iw, E, ih, { role: 'the portal of the hospital', arch: .56, steps: .8 });
    figure(B, -iw - 2.4, E + 4, 0, 5.4, { role: 'the portal of the hospital' }); figure(B, -iw - 4.4, E + 5, 0, 5.2, { role: 'the portal of the hospital' });
    // the hall of the physicians at a corner, its door, its stepped dome on an eight-sided drum of windows
    const [hx0, hy0, hx1, hy1] = sw ? [-E, H0, -H0, E] : [H0, -E, E, -H0];
    const hall = B.box(hx0, hy0, hx1, hy1, 0, h + 5, { r: 1, b: .8, role: 'the hall of the physicians' });
    const ds = sw ? 'S' : 'E';
    B.door(ds, .5, 4.6, 8, { on: hall }); B.windows(sw ? 'E' : 'S', 2, 8, 2, 3.4, { on: hall, lod: 2 });
    leaves(B, faceOf(hall, ds), .5, 4.6, 0, 8, { straps: 2, studs: 2 });
    voussoirs(B, faceOf(hall, ds), .5, 4.6, 0, 8, { t: .7 });
    B.band(h + 3.6, { on: hall, sides: 'SE', lod: 1 }); belt(B, hall, .8);
    for (const sd of 'SE') tileBand(B, faceOf(hall, sd), h + 1.6, h + 2.8);
    const cx = (hx0 + hx1) / 2, cy = (hy0 + hy1) / 2, z0 = h + 5, Rr = 10.5;
    const md0 = B.cyl(cx, cy, Rr, z0, z0 + 3, { n: 8, b: .4, role: 'the muqarnas dome', rot: Math.PI / 8 });
    drumWindows(B, md0, cx, cy, Rr, 8, Math.PI / 8, z0 + .5, 1.4, 2, { shape: 'pointed' });
    const tiers = R.chance(.6) ? [[1, 0], [.82, 2.6], [.66, 5], [.5, 7.2], [.34, 9.2], [.18, 11], [.04, 12.6]] : [[1, 0], [.86, 3], [.7, 5.6], [.52, 8], [.32, 10.2], [.14, 12], [.03, 13.6]];
    const md = B.lathe(cx, cy, tiers.map(([f, z]) => [Rr * f, z0 + 3 + z]), { n: 16, role: 'the muqarnas dome' });
    for (let k = 1; k < tiers.length - 1; k++) {
      const r = Rr * tiers[k][0], z = z0 + 3 + tiers[k][1], pts = [];
      for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z - (i % 2 ? .9 : 0)]); }
      B.mark(pts, { on: md, axis: [cx, cy], lod: 1 });
    }
    const ztop = z0 + 3 + tiers[tiers.length - 1][1];
    B.line([[cx, cy, ztop], [cx, cy, ztop + 1.4]], { role: 'the muqarnas dome', lod: 2 });
    alem(B, cx, cy, ztop, 1.4, { role: 'the muqarnas dome' });
    // the garden of the court: four beds about the pool and its fountain, the channels between them,
    // a tree in each bed, cypresses on the axis, benches where the sick sit in the shade
    const court = B.plate([[-E + t, -E + t, 0], [E - t, -E + t, 0], [E - t, E - t, 0], [-E + t, E - t, 0]], { cls: 'nf', role: 'the garden of the court', lod: 1 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if ((sw && sx < 0 && sy > 0) || (!sw && sx > 0 && sy < 0)) continue;
      const x0 = sx * 5, x1 = sx * 30, y0 = sy * 5, y1 = sy * 30;
      B.mark([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]].map(([a, b2]) => [Math.min(Math.max(a, -36), 36), Math.min(Math.max(b2, -36), 36), 0]), { on: court, closed: true, lod: 1 });
      tree(B, sx * 20 + R.r(-2, 2), sy * 20 + R.r(-2, 2), R.r(10, 12.5), { role: 'the garden of the court' });
    }
    for (const sg of [-1, 1]) { B.mark([[sg * 1.2, 6, 0], [sg * 1.2, E - t - 3, 0]], { on: court, lod: 2 }); B.mark([[9, sg * 1.2, 0], [E - t - 3, sg * 1.2, 0]], { on: court, lod: 2 }); }
    const pool = B.box(-9, -6, 9, 6, 0, 1, { r: 2, b: .7, role: 'the pool' });
    ripples(B, pool, -8, -5, 8, 5, 1, 5, { len: 3, amp: .3, avoid: (x, y) => Math.hypot(x, y) < 3 });
    B.lathe(0, 0, [[1.4, 1], [.6, 2.4], [2.2, 3.2], [.4, 3.6], [.3, 5]], { n: 12, role: 'the fountain', lod: 1 });
    B.line([[0, 0, 5], [0, 0, 6.6]], { role: 'the fountain', lod: 2, cls: 'lo' });
    for (const y of [-24, 24]) tree(B, 0, y, R.r(12, 14), { shape: 'cypress', role: 'the garden of the court' });
    for (const [x, y] of [[-15, 3.2], [15, -3.2]]) B.box(x - 3, y - .8, x + 3, y + .8, 0, 1.2, { r: .3, b: .2, role: 'the garden of the court', lod: 2 });
    figure(B, -15, 5.2, 0, 5, { role: 'the garden of the court' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* The prison of the citadel: high blank walls battered outward at the foot, with only small barred
     lights high up; the keep over them, square or round, with its narrow barred windows; the heavy
     iron-bound gate under its grille; the row of cells in the yard with grated doors, a chain on the
     wall; and the pit in the yard's floor under its grating, where a man is let down. */
  def('prison', (R, B) => {
    const E = 36, t = 6, h = R.r(15, 17), kh = R.r(32, 36), keepRound = R.chance(.4), east = R.chance(.5);
    // the walls, battered at the foot: their courses, the walk along the top behind the parapet
    const wl = (x0, y0, x1, y1) => {
      const p = B.box(x0, y0, x1, y1, 0, h, { r: .5, b: .5, top: 1.2, role: 'the walls of the prison' }); B.band(h - 1.4, { on: p, sides: 'SE', lod: 1 });
      for (const sd of 'SE') { const F = faceOf(p, sd); if (F.len > 8) for (const z of [h * .25, h * .5]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 }); }
      return p;
    };
    wl(-E, -E, E, -E + t); wl(-E, -E + t, -E + t, E); const ew = wl(E - t, -E + t, E, E);
    for (const u of [.2, .45, .7]) barred(B, ew, 'E', u, h * .7, 2, 2.4, 1);
    spouts(B, ew, 'E', [.08, .92], h - .3);
    const sw = wl(-E + t, E - t, -7, E); barred(B, sw, 'S', .3, h * .7, 2, 2.4, 1); barred(B, sw, 'S', .7, h * .7, 2, 2.4, 1);
    const se = wl(7, E - t, E - t, E); barred(B, se, 'S', .5, h * .7, 2, 2.4, 1);
    figure(B, E - t / 2, 4, h, 5.2, { role: 'the walls of the prison' });
    // the gatehouse and its iron-bound door, the grille over it, the guards
    const g = B.box(-7, E - t - 2, 7, E + 1.5, 0, h + 4, { r: .5, b: .5, top: .8, role: 'the gate of the prison' });
    B.crenels({ on: g, every: 2.4, h: 1.4, sides: 'SENW' });
    B.door('S', .5, 5.2, 7.6, { on: g, shape: 'round' });
    const Fg = faceOf(g, 'S');
    leaves(B, Fg, .5, 5.2, 0, 7.6, { shape: 'round', straps: 3, studs: 3 });
    voussoirs(B, Fg, .5, 5.2, 0, 7.6, { shape: 'round', t: .9 });
    const fy = E + 1.5 - .25;
    B.mark([[-2.8, fy, 9.6], [2.8, fy, 9.6], [2.8, fy, 12.6], [-2.8, fy, 12.6]], { on: g, n: [0, 1, 0], closed: true, lod: 1 });
    for (let k = -2; k <= 2; k++) B.mark([[k * 1.1, fy, 9.6], [k * 1.1, fy, 12.6]], { on: g, n: [0, 1, 0], lod: 1 });
    B.mark([[-2.8, fy, 11.1], [2.8, fy, 11.1]], { on: g, n: [0, 1, 0], lod: 2 });
    for (const sx of [-1, 1]) figure(B, sx * 4.6, E + 3.6, 0, 5.4, { role: 'the gate of the prison' });
    // the keep, in the north-west or north-east corner of the yard
    const k0 = east ? 10 : -E + t, k1 = east ? E - t : -10, kc = (k0 + k1) / 2, ky0 = -E + t, ky1 = ky0 + (k1 - k0);
    if (keepRound) {
      const kr = (k1 - k0) / 2;
      const kp = B.cyl(kc, (ky0 + ky1) / 2, kr, 0, kh, { n: 20, b: 0, role: 'the keep', top: .94 });
      for (const z of [kh * .32, kh * .56, kh * .8]) for (const a of [Math.PI / 4 - .45, Math.PI / 4 + .45]) {
        const c = Math.cos(a), s = Math.sin(a), x = kc + c * kr * .97, y = (ky0 + ky1) / 2 + s * kr * .97;
        B.mark([[x - s * .9, y + c * .9, z], [x - s * .9, y + c * .9, z + 2.4], [x + s * .9, y - c * .9, z + 2.4], [x + s * .9, y - c * .9, z]], { on: kp, closed: true, n: [c, s, 0], lod: 1 });
        B.mark([[x, y, z], [x, y, z + 2.4]], { on: kp, n: [c, s, 0], lod: 2 });
      }
      for (const z of [kh * .2, kh * .45, kh * .7]) belt(B, kp, z, { lod: 2 });
      const cap = B.cyl(kc, (ky0 + ky1) / 2, kr * 1.02, kh, kh + 3, { n: 20, b: .5, role: 'the keep' });
      corbelRing(B, cap, kc, (ky0 + ky1) / 2, kr * .94, kr * 1.02, kh, 1.4, 20, 2);
      crenelRing(B, cap, kc, (ky0 + ky1) / 2, kr * 1.02, kh + 3, 9, 1.6, 1);
    } else {
      const kp = B.box(k0, ky0, k1, ky1, 0, kh, { r: .6, b: .6, top: 1.2, role: 'the keep' });
      for (const z of [kh * .3, kh * .55, kh * .78]) { barred(B, kp, 'S', .5, z, 1.8, 2.6, 1); barred(B, kp, 'E', .5, z, 1.8, 2.6, 1); }
      for (const sd of 'SE') { const F = faceOf(kp, sd); for (const z of [kh * .2, kh * .45, kh * .7]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 }); }
      B.door('S', .5, 2.6, 4.6, { on: kp, shape: 'round', lod: 1 });
      leaves(B, faceOf(kp, 'S'), .5, 2.6, 0, 4.6, { shape: 'round', straps: 2, studs: 1 });
      const pc = B.box(k0 + .2, ky0 + .2, k1 + .2, ky1 + .2, kh, kh + 3, { r: .5, b: .6, role: 'the keep' });
      for (let i = 1; i < 7; i++) { const x = lerp(k0 + .2, k1 + .2, i / 7), y = lerp(ky0 + .2, ky1 + .2, i / 7); B.mark([[x, ky1 + .2, kh], [x, ky1 - .6, kh - 1.4]], { on: pc, lod: 2 }); B.mark([[k1 + .2, y, kh], [k1 - .6, y, kh - 1.4]], { on: pc, lod: 2 }); }
      B.crenels({ on: pc, every: 2.8, h: 1.6 });
    }
    // the row of cells, their grated doors, and a chain on its ring; the stocks in the yard
    const cx0 = east ? -E + t : 10, cx1 = east ? -10 : E - t, cy1 = -E + t + 26;
    const cl = B.box(cx0, -E + t, cx1, cy1, 0, 9, { r: .6, b: .5, role: 'the cells' });
    for (let i = 0; i < 4; i++) {
      const u = (i + .5) / 4;
      B.door('S', u, 2.6, 5.4, { on: cl, shape: 'flat', lod: 1 });
      for (const k of [-.3, 0, .3]) B.mark([[lerp(cx0, cx1, u) + k * 2.6, cy1, 0], [lerp(cx0, cx1, u) + k * 2.6, cy1, 5.4]], { on: cl, n: [0, 1, 0], lod: 2 });
      B.mark([[lerp(cx0, cx1, u) - 1.3, cy1, 2.7], [lerp(cx0, cx1, u) + 1.3, cy1, 2.7]], { on: cl, n: [0, 1, 0], lod: 2 });
    }
    B.band(7.8, { on: cl, sides: 'SE', lod: 2 });
    const ch = B.line([[cx1 - 1, cy1 + .1, 7], [cx1 - 1.4, cy1 + .1, 5.6], [cx1 - .6, cy1 + .1, 4.2], [cx1 - 1.2, cy1 + .1, 2.8]], { role: 'the cells', lod: 2 });
    B.mark(circ(.5, 8, 0, 0).map(q => [cx1 - 1 + q.u, cy1 + .1, 7.4 + q.v]), { on: ch, closed: true, lod: 2 });
    const sx0 = east ? -24 : 14, stk = B.box(sx0, cy1 + 6, sx0 + 8, cy1 + 7.2, 0, 2.2, { r: .2, b: 0, role: 'the stocks', lod: 2 });
    const Fs = faceOf(stk, 'S'); Fs.mark(B, [Fs.at(0, 1.2), Fs.at(1, 1.2)], { lod: 2 });
    for (const u of [.25, .5, .75]) Fs.mark(B, circ(.32, 8, 0, 0).map(q => Fs.at(u + q.u / 8, 1.2 + q.v)), { lod: 2, closed: true });
    // the pit under its grating
    const px = R.r(-6, 2), py = R.r(10, 16), pr = 5.4;
    const pit = B.box(px - pr, py - pr, px + pr, py + pr, 0, 1.4, { r: .6, b: 0, role: 'the pit' });
    const a = pr - 1.2;
    B.mark([[px - a, py - a, 1.4], [px + a, py - a, 1.4], [px + a, py + a, 1.4], [px - a, py + a, 1.4]], { on: pit, closed: true, cls: 'edge', lod: 1 });
    B.mark([[px - a + .4, py - a + .4, 1.4], [px - a + .4, py - a + .4, -2.2], [px + a - .4, py - a + .4, -2.2]], { on: pit, lod: 1, cls: 'mid' });
    B.mark([[px - a + .4, py - a + .4, -2.2], [px - a + .4, py + a - .4, -2.2]], { on: pit, lod: 1, cls: 'mid' });
    for (let i = 1; i < 5; i++) { const u = -a + 2 * a * i / 5; B.mark([[px + u, py - a, 1.4], [px + u, py + a, 1.4]], { on: pit, cls: 'edge', lod: 1 }); B.mark([[px - a, py + u, 1.4], [px + a, py + u, 1.4]], { on: pit, cls: 'edge', lod: 1 }); }
    for (const [x, y] of [[px - a, py - a], [px + a, py - a], [px - a, py + a], [px + a, py + a]]) B.mark(circ(.22, 6, x, y).map(q => [q.u, q.v, 1.4]), { on: pit, closed: true, lod: 2 });
    B.person(-1.5, E + 3, 5.6, { role: 'the gaoler' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [2, 2] });

  /* Ribs drawn down a dome from the crown to the foot, the near ones only (a carved Mamluk dome). */
  function ribs(B, on, cx, cy, R, z0, shape, n, lod) {
    const P = { round: [[1, 0], [.97, .26], [.87, .5], [.71, .71], [.5, .87], [.26, .97], [0, 1]], pointed: [[1, 0], [.98, .3], [.9, .58], [.74, .86], [.52, 1.1], [.26, 1.3], [0, 1.45]] }[shape];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a);
      B.mark(P.map(([r, h]) => [cx + c * r * R, cy + s * r * R, z0 + h * R]), { on, axis: [cx, cy], lod: lod == null ? 1 : lod });
    }
  }

  /* The tombs outside the gate: a walled ground of graves in rows, each with its headstone, the
     domed tombs of the saints and the great, cube and dome, and one mausoleum raised on an
     eight-sided drum under a carved dome with its portal; cypresses standing among them. */
  def('cemetery', (R, B) => {
    const E = 54, wt = 1.6, wh = 3.6;
    const ground = B.plate([[-E, -E, 0], [E, -E, 0], [E, E, 0], [-E, E, 0]], { cls: 'nf', role: 'the graves', lod: 0, hiOK: false });
    for (const [x0, y0, x1, y1] of [[-E, -E, E, -E + wt], [-E, -E + wt, -E + wt, E], [E - wt, -E + wt, E, E], [-E + wt, E - wt, 8, E], [18, E - wt, E - wt, E]]) coping(B, B.box(x0, y0, x1, y1, 0, wh, { r: .3, b: 0, role: 'the wall of the tombs' }), { out: .25, h: .45 });
    const gt = B.box(8, E - wt - .6, 18, E + .6, 0, 9, { r: .5, b: .5, role: 'the gate of the tombs' });
    B.door('S', .5, 5, 7, { on: gt, shape: 'round' });
    leaves(B, faceOf(gt, 'S'), .5, 5, 0, 7, { shape: 'round', straps: 2, studs: 2 });
    voussoirs(B, faceOf(gt, 'S'), .5, 5, 0, 7, { shape: 'round', t: .7 });
    B.band(8, { on: gt, sides: 'SE', lod: 2 });
    // the mausoleum
    const mL = R.chance(.5), mx = mL ? -27 : 24, my = -27, ms = 13, mh = R.r(17, 19);
    const mz = B.box(mx - ms, my - ms, mx + ms, my + ms, 0, mh, { r: .8, b: .7, role: 'the mausoleum' });
    B.door('S', .5, 8, 13, { on: mz });
    const Fm = faceOf(mz, 'S');
    voussoirs(B, Fm, .5, 8, 0, 13, { t: .9 });
    B.window('S', .5, 0, 8 * .62, 13 * .78, { on: mz, lod: 1 });
    muqarnas(B, Fm, .5, 8 * .62, 0, 13 * .78, { tiers: 2, cell: 1.5 });
    B.door('S', .5, 2.4, 4.4, { on: mz, shape: 'round', lod: 2 });
    B.mark([[mx - 6.2, my + ms, 0], [mx - 6.2, my + ms, 15.2], [mx + 6.2, my + ms, 15.2], [mx + 6.2, my + ms, 0]], { on: mz, n: [0, 1, 0], lod: 1 });
    belt(B, mz, .8);
    for (const u of [.25, .75]) grille(B, faceOf(mz, 'E'), u, mh * .55, 2.2, 4, { shape: 'pointed', nx: 2, ny: 2, frame: false });
    B.windows('E', 2, mh * .55, 2.2, 4, { on: mz, lod: 1 });
    B.band(mh - 1.8, { on: mz, sides: 'SE' });
    B.crenels({ on: mz, every: 2.2, h: 1.2, sides: 'SE', lod: 2 });
    const md = B.cyl(mx, my, ms * .9, mh, mh + 4.5, { n: 8, b: .4, role: 'the mausoleum', rot: Math.PI / 8 });
    drumWindows(B, md, mx, my, ms * .9, 8, Math.PI / 8, mh + .8, 1.4, 2.8, { shape: 'pointed' });
    const dshape = R.pick(['pointed', 'pointed', 'round']);
    const dm = B.dome(mx, my, ms * .78, mh + 4.5, { shape: dshape, role: 'the dome of the mausoleum' });
    ribs(B, dm, mx, my, ms * .78, mh + 4.5, dshape, 18, 1);
    domeBand(B, dm, mx, my, ms * .78, mh + 4.5, { dz: 1, n: 24 });
    alem(B, mx, my, mh + 4.5 + ms * .78 * (dshape === 'pointed' ? 1.45 : 1), Math.max(1.4, ms * .78 * .28), { role: 'the dome of the mausoleum' });
    // the small domed tombs
    const qs = mL ? [[24, -30, 6.5], [30, 12, 5.5], [-8, 4, 5], [-34, 30, 5.5]] : [[-30, -24, 6.5], [-32, 16, 5.5], [2, -8, 5], [34, 30, 5]];
    const taken = [[mx, my, ms + 4]];
    qs.forEach(([x, y, s], i) => {
      if (i === 3 && R.chance(.3)) return;
      const sh = R.pick(['round', 'pointed', 'round']);
      qubba(B, x, y, s, s * R.r(1.5, 1.8), { shape: sh, drum: i === 0 ? 2.4 : 0, role: i === 0 ? 'the tomb of the saint' : 'a domed tomb', door: R.chance(.5) ? 'S' : 'E', dh: sh === 'round' ? R.r(.9, 1.05) : 1 });
      taken.push([x, y, s + 4]);
    });
    // the cypresses
    const cyp = [[-46, -46], [46, -46], [-46, 46], [12, -42], [-14, -12], [42, -6]];
    cyp.forEach(([x, y]) => { tree(B, x, y, R.r(14, 19), { shape: 'cypress', role: 'the cypresses', lod: 0 }); taken.push([x, y, 4]); });
    // the graves in rows: a mound drawn on the ground, a headstone standing at its head
    const free = (x, y) => Math.abs(x) < E - 5 && Math.abs(y) < E - 6 && !taken.some(([a, b, r]) => Math.abs(x - a) < r + 1.5 && Math.abs(y - b) < r + 3);
    let n = 0;
    for (let row = 0; row < 9 && n < 34; row++) {
      const y = -42 + row * 10.5 + R.r(-1, 1);
      for (let x = -44 + (row % 2) * 3; x < 46 && n < 34; x += R.r(6.5, 8.5)) {
        if (!free(x, y) || R.chance(.18)) continue;
        B.mark([[x - 1.1, y, 0], [x + 1.1, y, 0], [x + 1.1, y + 5, 0], [x - 1.1, y + 5, 0]], { on: ground, closed: true, lod: 1 });
        const st = B.box(x - 1.1, y - .4, x + 1.1, y + .4, 0, R.r(2.6, 3.6), { r: .35, b: 0, role: 'the graves', lod: 1 });
        // here and there a tomb chest over the grave, its lid a step narrower
        if (n % 4 === 1) { const tc = B.box(x - 1.2, y + .9, x + 1.2, y + 5.2, 0, 1.3, { r: .3, b: .25, top: .2, role: 'the graves', lod: 2 }); belt(B, tc, .45); }
        n++;
      }
    }
    // a mourner at the saint's tomb, and the keeper at the gate
    const sq = qs[0];
    figure(B, sq[0] + sq[2] + 2.4, sq[1] + sq[2] + 2, 0, 5.2, { role: 'the tomb of the saint' });
    figure(B, 4.4, E + 2.6, 0, 5.4, { role: 'the gate of the tombs' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* A bridge over the river. Baghdad's bridge of boats: a deck of planks laid across a row of
     boats moored in the stream, chained to one another and to the stone landings on either bank,
     with a rope rail; or a bridge of masonry on pointed arches, its piers cut to a point against
     the stream, a hump in the road and a tower at its head. */
  def('bridge', (R, B) => {
    const type = R.pick(['boats', 'boats', 'stone']);
    const W = 44;
    if (type === 'boats') {
      const riv = water(B, [[-W, -20], [W, -20], [W, 20], [-W, 20]], 0, { role: 'the river', waves: 18, along: 'y', len: 5, avoid: (x, y) => Math.abs(y) < 12 });
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -60 : W, x1 = s < 0 ? -W : 60;
        const l = B.box(x0, -19, x1, 19, 0, 4.6, { r: 1, b: .7, role: 'the landing' });
        B.band(2.6, { on: l, sides: s < 0 ? 'SE' : 'S', lod: 1 });
        const F = faceOf(l, s < 0 ? 'E' : 'S');
        if (s < 0) for (let k = 1; k < 8; k++) F.mark(B, [F.at(k / 8, 0), F.at(k / 8, 2.6)], { lod: 2 });
        // the steps down the face of the landing to the water, beside the deck
        if (s < 0) for (let k = 0; k < 3; k++) B.box(-W + k * 1.2, 12, -W + (k + 1) * 1.2, 17, 0, 4.6 - (k + 1) * 1.15, { r: .15, b: 0, role: 'the landing', lod: 2 });
        for (const yy of [-8.4, 8.4]) {
          const px = s < 0 ? -W - 4.5 : W + 4.5;
          // the posts of the chains (lod 1, so the deck is the part the eye goes to), their iron bands
          const post = B.cyl(px, yy, 1.7, 4.6, 14, { n: 8, b: .3, role: 'the posts of the chains', lod: 1 });
          for (const z of [7, 12]) belt(B, post, z, { lod: 2 });
          B.dome(px, yy, 1.9, 14, { shape: 'round', role: 'the posts of the chains', lod: 2, finial: false });
        }
      }
      const nb = 7, step = (2 * W - 10) / (nb - 1), xs = [];
      for (let k = 0; k < nb; k++) xs.push(-W + 5 + k * step);
      xs.forEach(x => {
        const bt = boat(B, x, R.r(-.8, .8), R.r(21, 23), 7.6, { along: 'y', role: 'the boats of the bridge', lod: 0, h: 3.6 });
        // the stem and stern posts rising from the ends of the hull
        const y0 = bt.box[1], y1 = bt.box[4];
        B.line([[x, y0 + .2, 3.6], [x, y0 - .4, 5]], { role: 'the boats of the bridge', lod: 2 });
        B.line([[x, y1 - .2, 3.6], [x, y1 + .4, 5]], { role: 'the boats of the bridge', lod: 2 });
      });
      const deck = B.box(-W - 1, -5.4, W + 1, 5.4, 3.6, 4.8, { r: .3, b: .4, role: 'the deck of the bridge' });
      for (let x = -W + 1; x < W; x += 2.2) B.mark([[x, -5.4, 4.8], [x, 5.4, 4.8]], { on: deck, lod: 2, n: [0, 0, 1] });
      const Fd = faceOf(deck, 'S'); Fd.mark(B, [Fd.at(0, 4.2), Fd.at(1, 4.2)], { lod: 2 });
      // the rope rails on their posts
      for (const yy of [-5, 5]) {
        const pts = [], m = 8;
        for (let k = 0; k <= m; k++) { const x = -W - 1 + k * (2 * W + 2) / m; pts.push([x, yy, 8]); if (k < m) pts.push([x + (2 * W + 2) / m / 2, yy, 7]); }
        const rl = B.line(pts, { role: 'the deck of the bridge', lod: 1, cls: 'mid' });
        for (let k = 0; k <= m; k++) { const x = -W - 1 + k * (2 * W + 2) / m; B.mark([[x, yy, 4.8], [x, yy, 8]], { on: rl, cls: 'edge', lod: 1 }); }
      }
      // the chain along the bows, drawn on the water so each hull stands over it; each boat's anchor cable;
      // and the chains from the posts on the landings to the ends of the deck
      for (const s of [-1, 1]) {
        const yy = s * 9.4, pts = [];
        xs.forEach((x, i) => { pts.push([x, yy, 3]); if (i < xs.length - 1) pts.push([x + step / 2, yy, 1]); });
        B.mark(pts, { on: riv, cls: 'edge', lod: 1 });
        for (const e of [-1, 1]) B.line([[e * (W + 4.5), s * 8.4, 13], [e * (W + 1), s * 5.4, 4.8]], { role: 'the chains of the bridge', lod: 1 });
      }
      xs.forEach(x => B.line([[x, 10.6, 2.8], [x + 1, 17, 0]], { role: 'the boats of the bridge', lod: 2, cls: 'mid' }));
      figure(B, -12, 0, 4.8, 5.4, { role: 'the deck of the bridge' }); figure(B, 18, 1, 4.8, 5.4, { role: 'the deck of the bridge' });
      figure(B, W + 7, 13, 4.6, 5.4, { role: 'the landing' });
      return;
    }
    // the bridge of stone
    water(B, [[-W, -20], [W, -20], [W, 20], [-W, 20]], 0, { role: 'the river', waves: 14, along: 'y', len: 5, avoid: (x, y) => Math.abs(y) < 11 });
    for (const s of [-1, 1]) B.box(s < 0 ? -60 : W, -20, s < 0 ? -W : 60, 20, 0, 3, { r: 1, b: .6, role: 'the banks', lod: 1 });
    const n = R.pick([3, 5]), zb = 8, zt = 12.5, d = 6.5;
    const body = B.add({ L: [[ISO.rrect(-58, -d, 58, d, .6, 1), 0], [ISO.rrect(-58, -d, 58, d, .6, 1), zb], [ISO.rrect(-24, -d, 24, d, .6, 1), zt]], inner: null, role: 'the bridge', lod: 0 });
    body.face = { x0: -58, y0: -d, x1: 58, y1: d, z0: 0, z1: zb, t: 0 };
    const span = (2 * W) / n, P = (x, z) => [x, d, z];
    B.mark([[-58, d, zb - .8], [58, d, zb - .8]], { on: body, n: [0, 1, 0], lod: 1 });
    for (let k = 0; k < n; k++) {
      const xc = -W + span * (k + .5), mid = 1 - Math.abs(xc) / W;
      const ah = 6.4 + mid * 3.2, aw = span * .74;
      B.mark(archOn(P, xc, aw, 0, ah, 'pointed'), { on: body, cls: 'edge', n: [0, 1, 0], lod: 0 });
      B.mark(archOn(P, xc, aw * .8, 0, ah * .86, 'pointed'), { on: body, n: [0, 1, 0], lod: 1 });
      // the voussoirs between the two rings of the arch
      for (const sg of [-1, 1]) for (let i = 1; i < 4; i++) {
        const th = i / 4 * Math.PI / 2, A = (w, hh) => { const sp = Math.max(0, hh - w * .62); return [xc + sg * w / 2 * Math.cos(th), sp + (hh - sp) * Math.sin(th)]; };
        const a = A(aw * .8, ah * .86), b = A(aw, ah);
        B.mark([P(a[0], a[1]), P(b[0], b[1])], { on: body, n: [0, 1, 0], lod: 2 });
      }
      for (const zz of [.6, 1.6]) B.mark([[xc - aw * .3, d, zz], [xc - aw * .1, d, zz + .3], [xc + aw * .1, d, zz], [xc + aw * .3, d, zz + .3]], { on: body, n: [0, 1, 0], lod: 1 });
      if (k < n - 1) {
        const px = -W + span * (k + 1);
        B.mark(archOn(P, px, 1.8, ah * .78, 2.8, 'round'), { on: body, n: [0, 1, 0], lod: 2, closed: true });
        const cw = B.prism([[px - 2.8, d], [px + 2.8, d], [px, d + 5.5]], 0, 5.5, { b: .4, role: 'the piers of the bridge' });
        belt(B, cw, 2.6, { lod: 2 });
      }
    }
    // the road over it, paved in courses from parapet to parapet
    const zr = x => Math.abs(x) <= 24 ? zt : zt + (zb - zt) * (Math.abs(x) - 24) / 34;
    for (let x = -54; x <= 54; x += 4.5) B.mark([[x, -d, zr(x)], [x, d, zr(x)]], { on: body, lod: 2 });
    // the parapets, following the hump of the road, their coping and the drain holes at their foot
    const prof = [[-58, zb], [-24, zt], [24, zt], [58, zb]];
    for (const yy of [-d, d]) {
      const pp = B.plate(prof.map(([x, z]) => [x, yy, z]).concat(prof.slice().reverse().map(([x, z]) => [x, yy, z + 2.2])), { role: 'the bridge', lod: 0 });
      if (yy > 0) {
        B.mark(prof.map(([x, z]) => [x, yy, z + 1.7]), { on: pp, lod: 2, n: [0, 1, 0] });
        for (let x = -50; x <= 46; x += 8) B.mark([[x, yy, zr(x) + .05], [x + 1, yy, zr(x + 1) + .05], [x + 1, yy, zr(x + 1) + .55], [x, yy, zr(x) + .55]], { on: pp, closed: true, lod: 2, n: [0, 1, 0] });
      }
    }
    // the tower at the bridge head: its lower stage as high as the hump, so the bridge is the part
    // the eye goes to, the upper stage with the battlements; the gate through it, its leaves
    const tw = B.box(48, -8.5, 58, 8.5, zb, zt, { r: .5, b: .5, role: 'the tower of the bridge' });
    const tu = B.box(48, -8.5, 58, 8.5, zt, zb + 14, { r: .5, b: .5, role: 'the tower of the bridge', lod: 1 });
    B.door('E', .5, 7, 9, { on: tu, z: zb, shape: 'pointed' }); B.crenels({ on: tu, every: 2.4, h: 1.4 });
    leaves(B, faceOf(tu, 'E'), .5, 7 * .74, zb, 9 * .8, { straps: 2, studs: 2 });
    B.door('E', .5, 7 * .74, 9 * .8, { on: tu, z: zb, lod: 2 });
    B.band(zb + 12, { on: tu, sides: 'SE', lod: 2 });
    for (const u of [.3, .7]) { const F = faceOf(tu, 'S'); F.mark(B, archGeo(F, u, .7, zb + 7.6, 2.6, 'flat').pts, { lod: 2, closed: true }); }
    B.last = tw;
    const bb = boat(B, -18, 13, 13, 4.4, { role: 'a boat on the river', along: 'y', lod: 1 });
    figure(B, -18, 15, 2.2, 4.6, { role: 'a boat on the river' });
    B.line([[-17, 16, 2.4], [-14, 21, .2]], { role: 'a boat on the river', lod: 2 });
    figure(B, -12, 0, zt, 5.4, { role: 'the bridge' });
  }, { tier: 'city', foot: [3, 1] });

  /* A noria: the great water wheel in the plane of the stream, its two rims, spokes and paddles, turning
     against the wall that carries its aqueduct. Drawn as strokes at (cx, y), radius r, centre z. */
  function noria(B, cx, y, r, zc, o) {
    o = Object.assign({ role: 'the water wheel', lod: 0 }, o);
    const rim = [];
    for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; rim.push([cx + Math.cos(a) * r, y, zc + Math.sin(a) * r]); }
    const wheel = B.line(rim, { role: o.role, lod: o.lod, w: 1.2 });
    const inner = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; inner.push([cx + Math.cos(a) * r * .86, y + .1, zc + Math.sin(a) * r * .86]); }
    B.mark(inner, { on: wheel, cls: 'edge', lod: 1 });
    const sp = 12;
    for (let i = 0; i < sp; i++) { const a = i / sp * TAU; B.mark([[cx, y, zc], [cx + Math.cos(a) * r * .86, y, zc + Math.sin(a) * r * .86]], { on: wheel, cls: 'mid', lod: 1 }); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, c = Math.cos(a), s = Math.sin(a); B.mark([[cx + c * r * .86, y, zc + s * r * .86], [cx + c * r * 1.08, y, zc + s * r * 1.08]], { on: wheel, lod: 1 }); }
    B.mark(circ(1.2, 10, 0, 0).map(q => [cx + q.u, y, zc + q.v]), { on: wheel, closed: true, cls: 'edge', lod: 1 });
    return wheel;
  }

  /* The river front: the stone quay with its steps going down to the water, boats moored at them,
     a noria turning in the stream against the wall of its aqueduct, palms on the bank, the
     houses that look on the river. */
  def('river', (R, B) => {
    const qd = -2, side = R.chance(.5) ? 1 : -1;
    const q = B.box(-58, -36, 58, qd, 0, 5, { r: 1, b: .7, role: 'the quay' });
    for (let x = -54; x < 56; x += 8) B.mark([[x, qd, 0], [x, qd, 5]], { on: q, n: [0, 1, 0], lod: 2 });
    B.band(2.5, { on: q, sides: 'S', lod: 2 });
    // the mooring rings on the face of the quay
    for (let x = -50; x < 56; x += 16) B.mark(circ(.55, 10, 0, 0).map(c => [x + c.u, qd, 3.6 + c.v]), { on: q, n: [0, 1, 0], closed: true, lod: 2 });
    water(B, [[-58, qd, 0], [58, qd, 0], [58, 38, 0], [-58, 38, 0]], 0, { role: 'the river', waves: 22, len: 7, avoid: (x, y) => (Math.abs(x - side * 40) < 18 && y < 14) || y < qd + 6 });
    // the steps down to the water
    const sx = -side * 6;
    for (let k = 0; k < 4; k++) B.box(sx - 10, qd + k * 2, sx + 10, qd + (k + 1) * 2, 0, 5 - (k + 1) * 1.2, { r: .2, b: 0, role: 'the steps of the quay', lod: k < 2 ? 0 : 1 });
    // the noria and the wall that carries its aqueduct: the arches with their voussoirs, the channel
    // along the top between its kerbs, the trough the buckets pour into
    const nx = side * 38, nr = 15, wy0 = qd, wy1 = qd + 4.5;
    const wl = B.box(nx - 18, wy0, nx + 18, wy1, 0, nr * 2 + 3, { r: .6, b: .5, role: 'the aqueduct' });
    B.arcade('S', 3, 0, nr * 1.2, { on: wl, from: .02, to: .98 });
    const Fw = faceOf(wl, 'S'), spw = .96 / 3;
    for (let i = 0; i < 3; i++) voussoirs(B, Fw, .02 + spw * (i + .5), spw * 36 * .74, 0, nr * 1.2, { t: 1.1 });
    B.band(nr * 2, { on: wl, sides: 'SE', lod: 1 });
    for (const z of [nr * 1.55, nr * 2 - 2.4]) Fw.mark(B, [Fw.at(0, z), Fw.at(1, z)], { lod: 2 });
    const aq = B.box(side > 0 ? nx + 12 : nx - 18, -34, side > 0 ? nx + 18 : nx - 12, wy0, 5, nr * 2 + 3, { r: .5, b: .5, role: 'the aqueduct' });
    B.arcade('E', 3, 5, nr * 1.1, { on: aq });
    belt(B, aq, 5.8, { lod: 1 });
    const ax0 = aq.face.x0, ax1 = aq.face.x1, zc = nr * 2 + 3;
    for (const f of [.3, .7]) B.mark([[lerp(ax0, ax1, f), -34, zc], [lerp(ax0, ax1, f), wy0, zc]], { on: aq, lod: 2 });
    B.box(nx - 4, wy0 + .6, nx + 4, wy1 - .6, zc, zc + 1.4, { r: .3, b: .3, role: 'the aqueduct', lod: 2 });
    noria(B, nx, wy1 + 4, nr, nr + .6, { role: 'the water wheel' });
    B.box(nx - 1.4, wy1 + 6.4, nx + 1.4, wy1 + 9, 0, nr + .6, { r: .3, b: 0, role: 'the water wheel', lod: 1 });
    // the boats at the steps, their lines made fast on the quay, one with its mast and furled sail
    const by = qd + 14, bx1 = sx - 24 * side;
    boat(B, bx1, by, 24, 6.8, { role: 'the boats', lod: 0, h: 3 });
    B.line([[bx1, by, 3], [bx1 + 1.5, by, 18]], { role: 'the boats', lod: 1, w: 1.2 });
    B.line([[bx1 - 9, by, 5], [bx1 + 1.5, by, 17], [bx1 + 9, by, 4]], { role: 'the boats', lod: 1 });
    B.line([[bx1 + 11 * side, by, 2.6], [sx - 10 * side - 2 * side, qd - 1.6, 6.6]], { role: 'the boats', lod: 2 });
    boat(B, sx + 6 * side, by + 11, 19, 5.6, { role: 'the boats', lod: 1 });
    B.line([[sx + 6 * side - 4, by + 13.2, 2.2], [sx + 6 * side + 9, by + 15.6, .4]], { role: 'the boats', lod: 2 });
    figure(B, sx + 6 * side - 2, by + 11, 2, 4.6, { role: 'the boats' });
    for (const bxx of [sx - 12 * side, sx + 18 * side]) { const bp = B.cyl(bxx, qd - 1.6, .9, 5, 6.8, { n: 8, b: 0, role: 'the boats', lod: 2 }); belt(B, bp, 6, { lod: 2 }); }
    // the water carrier at the foot of the steps with his jar
    figure(B, sx + 4, qd + 7.2, 0, 5.2, { role: 'the steps of the quay' });
    jar(B, sx + 5.6, qd + 7.6, 2.4, { role: 'the steps of the quay', z: 0 });
    // the houses on the bank: their latticed windows, the beams of their roofs, the balcony on its brackets,
    // and the palms
    const hx = -side * 36;
    const h1 = B.box(Math.min(hx - 14 * side, hx + 4 * side), -34, Math.max(hx - 14 * side, hx + 4 * side), -14, 5, 18, { r: .8, b: .6, role: 'the houses on the river' });
    B.windows('S', 3, 12, 2, 3, { on: h1, lod: 1 }); B.door('E', .5, 3.4, 5.4, { on: h1, z: 5 });
    const F1 = faceOf(h1, 'S');
    for (let i = 0; i < 3; i++) grille(B, F1, lerp(.12, .88, i / 2), 12, 2, 3, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    leaves(B, faceOf(h1, 'E'), .5, 3.4, 5, 5.4, { straps: 1, studs: 1 });
    vigas(B, F1, 17.1, { s: .45, gap: 2.4 }); B.band(16.2, { on: h1, sides: 'SE', lod: 2 });
    spouts(B, h1, 'S', [.06], 17.7);
    const bal = B.box(h1.face.x1 - 2, -18, h1.face.x1 + 7, -14, 12, 13, { r: .3, b: 0, role: 'the houses on the river', lod: 2 });
    const Fb = faceOf(bal, 'S'); for (let i = 1; i < 6; i++) Fb.mark(B, [Fb.at(i / 6, 12), Fb.at(i / 6, 13)], { lod: 2 });
    const h2x = side > 0 ? [hx + 6, hx + 20] : [hx - 20, hx - 6];
    const h2 = B.box(h2x[0], -34, h2x[1], -20, 5, 14, { r: .8, b: .6, role: 'the houses on the river' });
    B.door('S', .5, 3.4, 5.4, { on: h2, z: 5 });
    leaves(B, faceOf(h2, 'S'), .5, 3.4, 5, 5.4, { straps: 1, studs: 1 });
    vigas(B, faceOf(h2, 'S'), 13.1, { s: .45, gap: 2.4 });
    for (const sd of 'SE') { B.window(sd, .3, 9.4, 1.6, 2.4, { on: h2, lod: 2 }); grille(B, faceOf(h2, sd), .3, 9.4, 1.6, 2.4, { shape: 'pointed', nx: 1, ny: 1, frame: false }); }
    for (const [x, y, hh] of [[-side * 22, -8, 19], [side * 8, -26, 23], [side * 28, -20, 20]]) palm(B, x, y, hh, { role: 'the palms of the bank', z: 5 });
  }, { tier: 'city', foot: [3, 2] });

  /* The harbour: the sea at the quay, the stone mole running out into it with the lighthouse at its
     end, raised in three stages like the Pharos (square, eight-sided, round) with its lantern; a
     breakwater closing the basin; ships at anchor under their lateen sails; the warehouses and the
     domed customs house of the merchants on the quay, bales and jars waiting. */
  def('harbour', (R, B) => {
    const Lw = -34, Ln = -30;
    const qn = B.box(-58, -58, 58, Ln, 0, 4, { r: 1, b: .7, role: 'the quay' });
    const qw = B.box(-58, Ln, Lw, 58, 0, 4, { r: 1, b: .7, role: 'the quay' });
    B.band(2, { on: qn, sides: 'S', lod: 2 }); B.band(2, { on: qw, sides: 'E', lod: 2 });
    for (let x = -30; x < 40; x += 7) B.mark([[x, Ln, 0], [x, Ln, 4]], { on: qn, n: [0, 1, 0], lod: 2 });
    for (let y = -24; y < 54; y += 13) B.mark(circ(.5, 10, 0, 0).map(c => [Lw, y + c.u, 3 + c.v]), { on: qw, n: [1, 0, 0], closed: true, lod: 2 });
    const lx = 47, ly = R.r(-6, 0), b = 7.6;
    water(B, [[Lw, Ln], [58, Ln], [58, 58], [Lw, 58]], 0, { role: 'the sea', waves: 26, len: 7, avoid: (x, y) => (x > lx - 14 && y < ly + 14) || (y > 40 && y < 52 && x < 6) });
    // the steps down the west quay to the boats
    for (let k = 0; k < 3; k++) B.box(Lw + k * 1.3, 4, Lw + (k + 1) * 1.3, 12, 0, 4 - (k + 1) * 1.3, { r: .15, b: 0, role: 'the quay', lod: 2 });
    // the mole out from the north quay, the lighthouse at its end
    const mole = B.box(lx - 5, Ln, lx + 5, ly - b - 3, 0, 3.2, { r: .8, b: .6, role: 'the mole' });
    belt(B, mole, 1.6, { lod: 2 });
    const base = B.box(lx - b - 2.6, ly - b - 3, lx + b + 2.6, ly + b + 3, 0, 3.6, { r: 1.2, b: .6, role: 'the lighthouse' });
    belt(B, base, 1.8, { lod: 2 });
    // the square stage, battered, in its courses, with its door and windows; the eight-sided stage with
    // a window in each face; the gallery on its corbels; the round stage; the lantern and its fire
    const t1 = B.box(lx - b, ly - b, lx + b, ly + b, 3.6, 34, { r: .6, b: .6, top: 1.6, role: 'the lighthouse' });
    const Ft = faceOf(t1, 'S');
    B.door('S', .5, 3.4, 5.6, { on: t1, z: 3.6, shape: 'round' });
    voussoirs(B, Ft, .5, 3.4, 3.6, 5.6, { shape: 'round', t: .7 });
    leaves(B, Ft, .5, 3.4, 3.6, 5.6, { shape: 'round', straps: 1, studs: 1 });
    for (const z of [11, 18, 25]) { B.window('S', .32, z, 1.2, 2.6, { on: t1, lod: 1 }); B.window('S', .68, z + 3, 1.2, 2.6, { on: t1, lod: 2 }); B.window('E', .5, z + 1.5, 1.2, 2.6, { on: t1, lod: 1 }); }
    for (const z of [9.6, 16.6, 23.6]) belt(B, t1, z, { lod: 2 });
    B.band(31.5, { on: t1, sides: 'SE', lod: 1 });
    B.crenels({ on: t1, every: 2.2, h: 1.2, lod: 2 });
    const t2 = B.cyl(lx, ly, 5.2, 34, 48, { n: 8, b: .4, role: 'the lighthouse', top: .9, rot: Math.PI / 8 });
    drumWindows(B, t2, lx, ly, 5.2 * .96, 8, Math.PI / 8, 39, 1, 2.6, { shape: 'pointed' });
    belt(B, t2, 44.5, { lod: 2 });
    const gal = B.cyl(lx, ly, 5.4, 48, 49, { n: 8, b: .3, role: 'the lighthouse', rot: Math.PI / 8, lod: 1 });
    corbelRing(B, gal, lx, ly, 4.7, 5.4, 48, 1.2, 16, 2);
    B.cyl(lx, ly, 3.3, 49, 56, { n: 16, b: .4, role: 'the lighthouse', top: .94 });
    const ln = B.cyl(lx, ly, 2.6, 56, 59.5, { n: 8, b: .3, role: 'the fire of the lighthouse', lod: 1 });
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i - 1.5) * .55; B.mark([[lx + Math.cos(a) * 2.6, ly + Math.sin(a) * 2.6, 56.4], [lx + Math.cos(a) * 2.6, ly + Math.sin(a) * 2.6, 59]], { on: ln, lod: 2, n: [Math.cos(a), Math.sin(a), 0] }); }
    // the flame in the lantern, seen between its posts
    const fl = [[0, 0], [.5, .35], [.6, .9], [.25, 1.6], [.32, 2.4], [0, 3], [-.2, 2.2], [-.5, 1.4], [-.55, .6]].map(([u, v]) => [lx + 2.66 * Math.SQRT1_2 + u * Math.SQRT1_2, ly + 2.66 * Math.SQRT1_2 - u * Math.SQRT1_2, 56.3 + v * .9]);
    B.mark(fl, { on: ln, closed: true, lod: 2, cls: 'mid', n: [Math.SQRT1_2, Math.SQRT1_2, 0] });
    B.dome(lx, ly, 2.4, 59.5, { shape: 'pointed', role: 'the fire of the lighthouse', lod: 1, finial: false });
    B.line([[lx, ly, 63], [lx, ly, 66]], { role: 'the fire of the lighthouse', lod: 2 });
    B.sphere(lx, ly, 63.6, .45, { role: 'the fire of the lighthouse', lod: 2 });
    // the breakwater closing the basin from the west quay, the rocks piled against its seaward face
    const bw = B.box(Lw, 42, R.r(0, 8), 50, 0, 2.8, { r: 1.2, b: .6, role: 'the breakwater' });
    for (let x = Lw + 5; x < 0; x += 6) B.mark([[x, 50, 0], [x, 50, 2.8]], { on: bw, n: [0, 1, 0], lod: 2 });
    for (const [x, w] of [[Lw + 7, 3.4], [Lw + 15, 2.6], [Lw + 24, 3]]) B.box(x, 50, x + w, 50 + w * .7, 0, w * .45, { r: w * .3, b: 0, top: w * .15, role: 'the breakwater', lod: 2 });
    // the ships at anchor
    dhow(B, -2, 4, R.r(28, 32), { role: 'a ship at anchor', along: 'x', flip: R.chance(.5) ? 1 : -1 });
    dhow(B, 16, 28, R.r(22, 26), { role: 'a ship at anchor', along: 'x', flip: -1, sail: R.chance(.6) });
    B.line([[15, 4, 2.4], [22, 7, 0]], { role: 'a ship at anchor', lod: 2, cls: 'lo' });
    boat(B, -27, 18, 12, 4, { role: 'a skiff', along: 'y', lod: 1 });
    // the warehouses and the customs house on the quay: their doors and leaves, the beams of their roofs
    const w1 = B.box(-54, -54, -16, -38, 4, 15, { r: 1, b: .7, role: 'the warehouses' });
    const F1 = faceOf(w1, 'S');
    for (const u of [.2, .5, .8]) { B.door('S', u, 5, 7, { on: w1, z: 4 }); leaves(B, F1, u, 5, 4, 7, { straps: 2, studs: 1 }); }
    B.band(13, { on: w1, sides: 'SE', lod: 1 });
    vigas(B, F1, 14.1, { s: .45, gap: 2.6 });
    spouts(B, w1, 'S', [.04, .96], 14.7);
    const w2 = B.box(-12, -56, 16, -38, 4, 18, { r: 1, b: .7, role: 'the customs house' });
    const F2 = faceOf(w2, 'S');
    B.door('S', .5, 6, 9, { on: w2, z: 4 }); B.windows('S', 2, 11, 2, 3.2, { on: w2, lod: 1, from: .2, to: .8 });
    voussoirs(B, F2, .5, 6, 4, 9, { t: .8 }); leaves(B, F2, .5, 6, 4, 9, { straps: 2, studs: 2 });
    for (const u of [.2, .8]) grille(B, F2, u, 11, 2, 3.2, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    B.band(16.4, { on: w2, sides: 'SE', lod: 2 }); belt(B, w2, 4.8);
    const cd = B.dome(2, -47, 6, 18, { shape: 'pointed', drum: 1.6, drumN: 8, role: 'the customs house' });
    domeBand(B, cd, 2, -47, 6, 19.6, { dz: .8, n: 18 });
    alem(B, 2, -47, 19.6 + 6 * 1.45, 1.68, { role: 'the customs house' });
    const w3 = B.box(-54, -26, -38, 10, 4, 13, { r: 1, b: .7, role: 'the warehouses' });
    for (const u of [.25, .7]) { B.door('E', u, 5, 6.5, { on: w3, z: 4 }); leaves(B, faceOf(w3, 'E'), u, 5, 4, 6.5, { straps: 2, studs: 1 }); }
    vigas(B, faceOf(w3, 'E'), 12.1, { s: .45, gap: 2.6 });
    // the crane on the quay: its post, its jib, the rope and the bale hanging from it
    const cx0 = 30, cy0 = -36;
    B.line([[cx0, cy0, 4], [cx0, cy0, 14], [cx0 + 2, cy0 + 7.5, 12.2], [cx0 + 2, cy0 + 7.5, 8.2]], { role: 'the quay', lod: 2, w: 1.2 });
    B.line([[cx0, cy0, 10.4], [cx0 + 1.4, cy0 + 5.2, 12.7]], { role: 'the quay', lod: 2 });
    B.box(cx0 + .8, cy0 + 6.4, cx0 + 3.2, cy0 + 8.6, 6.2, 8.2, { r: .5, b: .2, role: 'the goods on the quay', lod: 2 });
    // the goods on the quay, bollards at its edge
    B.box(-28, -36, -22, -32, 4, 7, { r: .8, b: .3, role: 'the goods on the quay', lod: 2 });
    B.box(-21, -36, -15, -32, 4, 7, { r: .8, b: .3, role: 'the goods on the quay', lod: 2 });
    B.box(-25, -36, -19, -32.4, 7, 10, { r: .8, b: .3, role: 'the goods on the quay', lod: 2 });
    jar(B, 22, -34, 3.6, { z: 4, role: 'the goods on the quay' }); jar(B, 25, -33, 3.6, { z: 4, role: 'the goods on the quay' });
    for (const x of [-20, 4, 28]) { const bo = B.cyl(x, Ln - 1.5, .8, 4, 5.6, { n: 8, b: 0, role: 'the quay', lod: 2 }); belt(B, bo, 5, { lod: 2 }); }
    figure(B, 10, -35, 4, 5.4, { role: 'the quay' }); figure(B, -38, -14, 4, 5.4, { role: 'the quay' }); figure(B, -12, -34, 4, 5.4, { role: 'the goods on the quay' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'city', foot: [3, 3] });

  /* A curved stretch of wall as one plate: the face you see (outer on the near side of the ring,
     inner on the far side) with the walk along its top, the top edge drawn and battlements on it. */
  function arcWall(B, cx, cy, R, t, h, a0, a1, o) {
    o = Object.assign({ role: 'the city wall', lod: 0, merlons: true }, o);
    const n = Math.max(6, Math.round((a1 - a0) / .09)), at = (r, a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    const am = (a0 + a1) / 2, front = Math.cos(am - Math.PI / 4) > 0;
    const ro = R + t / 2, ri = R - t / 2, A = [];
    for (let i = 0; i <= n; i++) A.push(a0 + (a1 - a0) * i / n);
    const pts = front ? A.map(a => at(ro, a, 0)).concat(A.slice().reverse().map(a => at(ri, a, h))) : A.map(a => at(ri, a, 0)).concat(A.slice().reverse().map(a => at(ro, a, h)));
    const p = B.plate(pts, { role: o.role, lod: o.lod });
    B.mark(A.map(a => at(front ? ro : ri, a, h)), { on: p, cls: 'edge', lod: 1 });
    if (o.merlons) {
      const m = [], k = n * 2;
      for (let i = 0; i < k; i++) { const a = a0 + (a1 - a0) * i / k, b = a0 + (a1 - a0) * (i + .5) / k, c = a0 + (a1 - a0) * (i + 1) / k; m.push(at(ro, a, h), at(ro, a, h + 1.1), at(ro, b, h + 1.1), at(ro, b, h), at(ro, c, h)); }
      B.mark(m, { on: p, cls: 'mid', lod: 1 });
    }
    return p;
  }

  /* A roof of the town seen from afar: a flat block with its parapet line, now and then a roof room. */
  function roofBlock(B, x0, y0, x1, y1, h, o) {
    o = Object.assign({ role: 'the houses', lod: 0 }, o);
    const p = B.box(x0, y0, x1, y1, 0, h, { r: .5, b: .4, role: o.role, lod: o.lod });
    if (o.door) B.door('S', .5, 1.6, 2.6, { on: p, shape: 'round', lod: 1 });
    // a window high in each near face and the parapet line, seen only up close
    if (h > 4.4) { B.window('S', o.door ? .2 : .5, h - 2.2, .8, 1.2, { on: p, shape: 'flat', lod: 2 }); B.window('E', .5, h - 2.2, .8, 1.2, { on: p, shape: 'flat', lod: 2 }); }
    B.band(h - .7, { on: p, sides: 'SE', lod: 2 });
    return p;
  }

  /* A whole city on the world map, about a hundred units across: walls round or square with their
     gates and towers, the great dome and the minaret near the middle, the palace, the roofs packed
     inside, palms outside. Round: the City of Peace of al-Mansur, four gates each under a dome. */
  def('city', (R, B) => {
    const plan = R.pick(['round', 'square', 'square']);
    if (plan === 'round') {
      const Rw = 40, t = 3, h = 9, d = .19;
      const gates = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
      for (let i = 0; i < 4; i++) {
        const a0 = gates[i] + d, a1 = gates[(i + 1) % 4] + (i === 3 ? TAU : 0) - d;
        const wp = arcWall(B, 0, 0, Rw, t, h, a0, a1, { role: 'the walls of the city' });
        // the outer wall and the moat beyond it, as the City of Peace had them, drawn on the ground
        const ring = r => { const pts = []; for (let k = 0; k <= 24; k++) { const a = a0 - d * .6 + (a1 - a0 + d * 1.2) * k / 24; pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); } return pts; };
        B.mark(ring(Rw + 5), { on: wp, lod: 1 }); B.mark(ring(Rw + 7.5), { on: wp, lod: 2, cls: 'lo' });
      }
      gates.forEach((a, i) => {
        const gx = Math.cos(a) * Rw, gy = Math.sin(a) * Rw, s = 4.6;
        const g = B.box(gx - s, gy - s, gx + s, gy + s, 0, h + 4, { r: .5, b: .5, role: ['the Khorasan gate', 'the Kufa gate', 'the Syrian gate', 'the Basra gate'][i] });
        if (i === 0) for (const sd of 'SE') { B.door(sd, .5, 3.4, 6.4, { on: g }); voussoirs(B, faceOf(g, sd), .5, 3.4, 0, 6.4, { t: .5 }); }
        B.band(h + 2.8, { on: g, sides: 'SE', lod: 2 });
        B.dome(gx, gy, 3.4, h + 4, { shape: 'pointed', role: g.role, lod: 1, finial: false });
      });
      // the palace of the Green Dome and the great mosque at the centre, the open court about them
      const pal = B.box(-8, -8, 6, 6, 0, 9, { r: .6, b: .5, role: 'the palace of the Golden Gate' });
      B.door('S', .5, 3, 5, { on: pal, lod: 1 });
      B.band(7.6, { on: pal, sides: 'SE', lod: 2 }); B.windows('E', 2, 4, 1.2, 2, { on: pal, lod: 2 });
      const gd = B.cyl(-1, -1, 5, 9, 12, { n: 12, b: .3, role: 'the Green Dome' });
      drumWindows(B, gd, -1, -1, 5, 12, 0, 9.5, .8, 1.8, { every: 2 });
      B.dome(-1, -1, 5, 12, { shape: 'pointed', role: 'the Green Dome' });
      alem(B, -1, -1, 12 + 5 * 1.45, 1.4, { role: 'the Green Dome' });
      const mq = B.box(7, -10, 19, 2, 0, 6, { r: .6, b: .5, role: 'the great mosque' });
      B.arcade('S', 4, 0, 4, { on: mq, lod: 1 }); B.band(5.2, { on: mq, sides: 'SE', lod: 2 });
      B.dome(13, -5, 3.2, 6, { shape: 'pointed', role: 'the great mosque', lod: 1, finial: false });
      const mn = B.cyl(17, 4, 1.4, 0, 24, { n: 8, b: 0, role: 'the minaret' });
      belt(B, mn, 12, { lod: 2 });
      B.cyl(17, 4, 2, 24, 25, { n: 8, b: 0, role: 'the minaret', lod: 1 });
      B.cyl(17, 4, 1, 25, 27.4, { n: 8, b: 0, role: 'the minaret', lod: 2 });
      B.dome(17, 4, 1.1, 27.4, { shape: 'onion', role: 'the minaret', lod: 2, finial: false });
      // the ring of houses between the court and the wall
      const ring = [];
      for (let i = 0; i < 14; i++) ring.push((i + R.r(-.15, .15)) / 14 * TAU + .2);
      let n = 0;
      for (const a of ring) {
        const r = R.r(22, 27), x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (gates.some(g => Math.abs(((a - g + TAU + Math.PI) % TAU) - Math.PI) < .22)) continue;
        if (n >= 11) break;
        const w = R.r(4.5, 6.5), dd = R.r(4.5, 6.5);
        roofBlock(B, x - w / 2, y - dd / 2, x + w / 2, y + dd / 2, R.r(4, 7.5), { lod: n < 6 ? 0 : 1, door: x + y > 10 });
        n++;
      }
      for (const [x, y] of [[-30, 36], [44, 20], [36, -40]]) palm(B, x, y, R.r(10, 13), { role: 'the palm gardens', lod: 1 });
      return;
    }
    // the square city: walls with towers at the corners, two gates, the citadel, the great mosque
    const X = 42, Y = 36, h = 8.5, t = 2.6, tr = 3.6;
    for (const [x, y] of [[-X, -Y], [X, -Y], [-X, Y], [X, Y]]) { const tw = B.cyl(x, y, tr, 0, h + 3, { n: 12, b: .3, role: 'the towers of the city' }); crenelRing(B, tw, x, y, tr, h + 3, 5, 1, 2); belt(B, tw, h * .5, { lod: 2 }); }
    const wl = (x0, y0, x1, y1) => { const p = B.box(x0, y0, x1, y1, 0, h, { r: .3, b: 0, role: 'the walls of the city' }); B.crenels({ on: p, every: 2.4, h: 1.1, lod: 1, sides: x1 - x0 > y1 - y0 ? 'SN' : 'EW' }); return p; };
    wl(-X + tr, -Y - t / 2, -3, -Y + t / 2); wl(3, -Y - t / 2, X - tr, -Y + t / 2);
    wl(-X - t / 2, -Y + tr, -X + t / 2, -3); wl(-X - t / 2, 3, -X + t / 2, Y - tr);
    for (const [x, y] of [[0, -Y], [-X, 0]]) B.cyl(x, y, 3, 0, h + 2.4, { n: 12, b: .3, role: 'the towers of the city' });
    wl(X - t / 2, -Y + tr, X + t / 2, -6); wl(X - t / 2, 6, X + t / 2, Y - tr);
    wl(-X + tr, Y - t / 2, -6, Y + t / 2); wl(6, Y - t / 2, X - tr, Y + t / 2);
    const gs = B.box(-6, Y - 3.5, 6, Y + 3.5, 0, h + 4, { r: .5, b: .5, role: 'the gate of the city' }); B.door('S', .5, 4, 7, { on: gs });
    const ge = B.box(X - 3.5, -6, X + 3.5, 6, 0, h + 4, { r: .5, b: .5, role: 'the gate of the city' }); B.door('E', .5, 4, 7, { on: ge });
    voussoirs(B, faceOf(gs, 'S'), .5, 4, 0, 7, { t: .6 }); voussoirs(B, faceOf(ge, 'E'), .5, 4, 0, 7, { t: .6 });
    B.crenels({ on: gs, every: 2.2, h: 1, lod: 2, sides: 'SE' }); B.crenels({ on: ge, every: 2.2, h: 1, lod: 2, sides: 'SE' });
    // the citadel in the north-west corner
    const ct = B.box(-X + 5, -Y + 5, -X + 22, -Y + 20, 0, 14, { r: .6, b: .5, role: 'the citadel' });
    B.crenels({ on: ct, every: 2.4, h: 1.2, lod: 1 });
    const kp = B.box(-X + 7, -Y + 7, -X + 13, -Y + 13, 14, 22, { r: .4, b: .4, role: 'the citadel' });
    B.crenels({ on: kp, every: 2, h: 1, lod: 2 }); B.windows('S', 1, 17, .8, 2, { on: kp, shape: 'flat', lod: 2 }); B.windows('E', 1, 17, .8, 2, { on: kp, shape: 'flat', lod: 2 });
    B.dome(-X + 17, -Y + 14.5, 3.6, 14, { shape: 'round', role: 'the palace in the citadel', lod: 1, finial: false });
    // the great mosque, its dome and minaret
    const mq = B.box(-4, -18, 18, 0, 0, 7, { r: .6, b: .5, role: 'the great mosque' });
    B.arcade('S', 5, 0, 4.4, { on: mq, lod: 1 });
    B.band(5.8, { on: mq, sides: 'SE', lod: 2 });
    const sqd = B.dome(7, -9, 7.2, 7, { shape: 'pointed', drum: 2.2, drumN: 8, role: 'the dome of the mosque' });
    ribs(B, sqd, 7, -9, 7.2, 9.2, 'pointed', 12, 2);
    alem(B, 7, -9, 9.2 + 7.2 * 1.45, Math.max(1.4, 7.2 * .28), { role: 'the dome of the mosque' });
    const smn = B.cyl(19.5, 1.5, 1.4, 0, 25, { n: 8, b: 0, role: 'the minaret' });
    belt(B, smn, 12.5, { lod: 2 });
    B.cyl(19.5, 1.5, 2, 25, 26, { n: 8, b: 0, role: 'the minaret', lod: 1 });
    B.cyl(19.5, 1.5, 1, 26, 28.4, { n: 8, b: 0, role: 'the minaret', lod: 2 });
    B.dome(19.5, 1.5, 1.1, 28.4, { shape: 'onion', role: 'the minaret', lod: 2, finial: false });
    // the roofs
    const spots = [[-28, 4], [-18, 16], [-28, 24], [-8, 10], [4, 18], [16, 24], [29, 14], [31, -6], [29, -24], [-8, -26], [-26, -10], [-14, -4]];
    spots.forEach(([x, y], i) => { const w = R.r(6, 9), dd = R.r(6, 9); roofBlock(B, x - w / 2, y - dd / 2, x + w / 2, y + dd / 2, R.r(4, 7), { lod: i < 7 ? 0 : 1, door: y > 10 }); });
    for (const [x, y] of [[-36, 46], [50, 20], [50, -18]]) palm(B, x, y, R.r(10, 13), { role: 'the palm gardens', lod: 1 });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'world' });

  /* A walled town from afar: its square wall with towers at the corners and a gate, the mosque
     with its dome and minaret, a handful of roofs, palms outside. */
  def('town', (R, B) => {
    const X = R.r(28, 32), Y = R.r(24, 28), h = 7, t = 2.2, tr = 3;
    for (const [x, y] of [[-X, -Y], [X, -Y], [-X, Y], [X, Y]]) { const tw = B.cyl(x, y, tr, 0, h + 2.5, { n: 10, b: .3, role: 'the towers of the town' }); crenelRing(B, tw, x, y, tr, h + 2.5, 4, .9, 2); belt(B, tw, h * .5, { lod: 2 }); }
    const wl = (x0, y0, x1, y1) => { const p = B.box(x0, y0, x1, y1, 0, h, { r: .3, b: 0, role: 'the walls of the town' }); B.crenels({ on: p, every: 2.4, h: 1, lod: 1, sides: x1 - x0 > y1 - y0 ? 'SN' : 'EW' }); };
    wl(-X + tr, -Y - t / 2, X - tr, -Y + t / 2); wl(-X - t / 2, -Y + tr, -X + t / 2, Y - tr); wl(X - t / 2, -Y + tr, X + t / 2, Y - tr);
    wl(-X + tr, Y - t / 2, -5, Y + t / 2); wl(5, Y - t / 2, X - tr, Y + t / 2);
    const g = B.box(-5, Y - 3, 5, Y + 3, 0, h + 3.5, { r: .5, b: .5, role: 'the gate of the town' }); B.door('S', .5, 3.6, 6, { on: g });
    voussoirs(B, faceOf(g, 'S'), .5, 3.6, 0, 6, { t: .55 }); B.crenels({ on: g, every: 2, h: .9, lod: 2, sides: 'SE' });
    const mx = R.r(-10, 0), my = R.r(-12, -6);
    const mq = B.box(mx - 8, my - 6, mx + 8, my + 6, 0, 6, { r: .6, b: .5, role: 'the mosque' });
    B.arcade('S', 4, 0, 4, { on: mq, lod: 1 }); B.band(5.2, { on: mq, sides: 'SE', lod: 2 });
    const tsh = R.pick(['pointed', 'round']);
    B.dome(mx, my, 4.6, 6, { shape: tsh, role: 'the mosque' });
    alem(B, mx, my, 6 + 4.6 * (tsh === 'pointed' ? 1.45 : 1), 1.4, { role: 'the mosque' });
    const tmn = B.cyl(mx + 9.5, my + 7.5, 1.3, 0, 20, { n: 8, b: 0, role: 'the minaret' });
    belt(B, tmn, 10, { lod: 2 });
    B.cyl(mx + 9.5, my + 7.5, 1.9, 20, 21, { n: 8, b: 0, role: 'the minaret', lod: 1 });
    B.cyl(mx + 9.5, my + 7.5, .9, 21, 23.2, { n: 8, b: 0, role: 'the minaret', lod: 2 });
    B.dome(mx + 9.5, my + 7.5, 1, 23.2, { shape: 'onion', role: 'the minaret', lod: 2, finial: false });
    const spots = [[-18, 12], [-6, 14], [8, 8], [18, 14], [18, -10], [10, -16], [-20, -6], [4, 18]];
    let n = 0;
    for (const [x, y] of spots) { if (Math.abs(x - mx) < 14 && Math.abs(y - my) < 11) continue; if (n++ > 6) break; const w = R.r(5.5, 8), d = R.r(5.5, 8); roofBlock(B, x - w / 2, y - d / 2, x + w / 2, y + d / 2, R.r(3.5, 6), { role: 'the houses', door: y > 6, lod: n < 4 ? 0 : 1 }); }
    for (const [x, y] of [[-X - 8, Y + 6], [X + 8, 4], [X + 4, -Y - 6]]) palm(B, x, y, R.r(10, 12.5), { role: 'the palms', lod: 1 });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'world' });

  /* A village from afar: four to seven houses of mud brick with their low parapets, a beehive dome
     or two, the well with its sweep, palms, the fields in strips about them. */
  def('village', (R, B) => {
    const n = R.i(4, 7), hives = R.chance(.5);
    // the fields, in strips with their furrows
    let f0 = null;
    for (const [x0, y0, x1, y1] of [[-46, 10, -14, 40], [12, 18, 46, 44], [20, -42, 48, -14]]) {
      const f = B.plate([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], { cls: 'nf', role: 'the fields', lod: 1, hiOK: false });
      f0 = f0 || f;
      const along = R.chance(.5);
      for (let k = 1; k < 7; k++) { const t = k / 7; B.mark(along ? [[lerp(x0, x1, t), y0, 0], [lerp(x0, x1, t), y1, 0]] : [[x0, lerp(y0, y1, t), 0], [x1, lerp(y0, y1, t), 0]], { on: f, lod: 2 }); }
    }
    const spots = [[-22, -18], [-6, -24], [8, -8], [-20, 0], [-4, 6], [12, 8], [-30, -32]];
    for (let i = 0; i < n; i++) {
      const [x, y] = spots[i], w = R.r(9, 13), d = R.r(8, 11), h = R.r(5, 7.5);
      const hs = B.box(x - w / 2, y - d / 2, x + w / 2, y + d / 2, 0, h, { r: 2, b: .5, top: .5, role: 'the houses of the village' });
      const du = R.r(.3, .7);
      B.door('S', du, 2.4, 3.8, { on: hs, shape: 'round', lod: 1 });
      // the palm-trunk beams of the roof showing through the mud wall, a small window under them
      vigas(B, faceOf(hs, 'S'), h - .6, { s: .4, gap: 2, from: .2, to: .8 });
      B.window('E', .5, h * .5, .9, 1.3, { on: hs, shape: 'flat', lod: 2 });
      if (hives && i % 3 === 1) B.dome(x, y, Math.min(w, d) * .36, h, { shape: 'pointed', h: 1.4, role: 'the houses of the village', lod: 0, finial: false });
      else if (i === 0) B.box(x - w / 2 + 1, y - d / 2 + 1, x - w / 2 + 6, y - d / 2 + 5, h, h + 3.6, { r: 1, b: .3, role: 'the houses of the village', lod: 1 });
    }
    // the well and its sweep
    const wx = 2, wy = 22;
    B.cyl(wx, wy, 2.4, 0, 2, { n: 12, b: .4, role: 'the well' });
    B.line([[wx + 4, wy - 2, 0], [wx + 4, wy - 2, 8]], { role: 'the well', lod: 1, w: 1.2 });
    B.line([[wx - 1, wy, 3.5], [wx + 4, wy - 2, 8], [wx + 10, wy - 4.4, 11], [wx + 10, wy - 4.4, 9]], { role: 'the well', lod: 1 });
    B.line([[wx - 1, wy, 3.5], [wx - 1, wy, 1.4]], { role: 'the well', lod: 2, cls: 'mid' });
    // the stone that weights the sweep, the bucket on its rope, a woman come for water
    B.box(wx + 9.2, wy - 5.2, wx + 10.8, wy - 3.6, 7.6, 9, { r: .4, b: 0, role: 'the well', lod: 2 });
    B.lathe(wx - 1, wy, [[.4, .4], [.7, .7], [.8, 1.4]], { n: 10, role: 'the well', lod: 2 });
    figure(B, wx - 4, wy + 2.4, 0, 5, { role: 'the well' });
    // the dovecote, its tapering tower pierced for the birds, its little dome
    const dc = B.cyl(14, -27, 3, 0, 9.5, { n: 12, b: .3, top: .74, role: 'the houses of the village', lod: 1 });
    for (const z of [5.6, 7.4]) for (let i = 0; i < 6; i++) { const a = -Math.PI / 4 + (i + .5) / 6 * Math.PI, r = 3 - .78 * z / 9.5 + .02, c = Math.cos(a), sn = Math.sin(a); B.mark(circ(.28, 6, 0, 0).map(q => [14 + c * r - sn * q.u, -27 + sn * r + c * q.u, z + q.v]), { on: dc, closed: true, lod: 2, n: [c, sn, 0] }); }
    belt(B, dc, 4.4, { lod: 2 });
    B.dome(14, -27, 2.2, 9.5, { shape: 'pointed', role: 'the houses of the village', lod: 2, finial: false });
    // the bread oven by the houses, and the threshing floor beside the fields
    B.dome(-11, 14, 1.8, 0, { shape: 'round', h: .9, role: 'the houses of the village', lod: 2, finial: false });
    B.mark(circ(5, 24, -2, 34).map(q => [q.u, q.v, 0]), { on: f0, closed: true, lod: 1 });
    B.mark(circ(4.2, 24, -2, 34).map(q => [q.u, q.v, 0]), { on: f0, closed: true, lod: 2 });
    figure(B, 30, 24, 0, 5.2, { role: 'the fields' });
    for (const [x, y, h] of [[-36, -6, 14], [26, -2, 13], [-12, 22, 15], [30, 30, 12], [-40, 30, 13]]) palm(B, x, y, h, { role: 'the palms', lod: 0 });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'world' });

  /* ---------- the pieces a city's tile map is built from (forty units, cheap) ---------- */

  /* A row of two or three shops on a street: openings with shutters, awnings over them, goods set out.
     Drawn hundreds of times, so its detail is drawn on its faces. */
  def('shop', (R, B) => {
    const n = R.pick([2, 3, 3]), h = R.r(8, 9.5), y1 = 4;
    const p = B.box(-19, -16, 19, y1, 0, h, { r: .8, b: .6, role: 'a shop' });
    const rr = B.box(-17, -14, -6, -6, h, h + 5, { r: .6, b: .4, role: 'a shop', lod: 1 });
    B.door('S', .5, 3, 3.8, { on: rr, shape: 'round', lod: 2 });
    const F = faceOf(p, 'S');
    for (let k = 0; k < n; k++) {
      const u = (k + .5) / n, a = -19 + 38 * k / n + .8, b = -19 + 38 * (k + 1) / n - .8;
      B.door('S', u, 38 / n * .64, h * .66, { on: p, shape: 'flat' });
      for (const f of [-.2, 0, .2]) B.mark([[lerp(a, b, .5 + f), y1, 0], [lerp(a, b, .5 + f), y1, h * .6]], { on: p, n: [0, 1, 0], lod: 2 });
      // the lintel over the opening and the shutter folded up under the awning
      voussoirs(B, F, u, 38 / n * .64, 0, h * .66, { shape: 'flat', t: .6 });
      awning(B, 'S', a, b, y1, h * .8, 3.8, 1.3, { role: 'a shop', lod: 0 });
    }
    // the beam ends of the roof, the cornice, the plinth course; the bench before the shops
    vigas(B, F, h - .7, { s: .4, gap: 2.4 }); B.band(h - 1.5, { on: p, sides: 'SE', lod: 2 }); belt(B, p, .6);
    B.window('E', .5, h * .55, 1.6, 2.4, { on: p, lod: 2 }); grille(B, faceOf(p, 'E'), .5, h * .55, 1.6, 2.4, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    const bn = B.box(-19, y1, 19, y1 + 2.2, 0, 1.4, { r: .3, b: .2, role: 'a shop', lod: 1 });
    const Fb = faceOf(bn, 'S'); for (let k = 1; k < 8; k++) Fb.mark(B, [Fb.at(k / 8, 0), Fb.at(k / 8, 1.4)], { lod: 2 });
    if (R.chance(.5)) { sack(B, -10, y1 + 6, 2.4, { role: 'a shop', lod: 1 }); sack(B, -7, y1 + 7, 2.2, { role: 'a shop', lod: 1 }); }
    else { jar(B, 8, y1 + 6, 3, { role: 'a shop', lod: 1 }); jar(B, 11, y1 + 6.6, 2.6, { role: 'a shop', lod: 1 }); }
    if (R.chance(.5)) mirror(B);
  }, { tier: 'filler', foot: [1, 1] });

  /* An open yard behind its walls: a gate in the south wall, a tree or a well in it. */
  def('yard', (R, B) => {
    const E = 18, t = 1.6, h = R.r(4.5, 6);
    B.box(-E, -E, E, -E + t, 0, h, { r: .4, b: 0, role: 'a yard' });
    B.box(-E, -E + t, -E + t, E, 0, h, { r: .4, b: 0, role: 'a yard' });
    const e = B.box(E - t, -E + t, E, E, 0, h, { r: .4, b: 0, role: 'a yard' });
    const s = B.box(-E + t, E - t, E - t, E, 0, h, { r: .4, b: 0, role: 'a yard' });
    const du = R.r(.3, .7);
    B.door('S', du, 4, h - .8, { on: s, shape: 'round' });
    leaves(B, faceOf(s, 'S'), du, 4, 0, h - .8, { shape: 'round', straps: 1, studs: 1 });
    // the coping of the two walls you see, and the courses of the mud brick under it
    coping(B, s, { out: .25, h: .45 }); coping(B, e, { out: .25, h: .45 });
    for (const [q, sd] of [[s, 'S'], [e, 'E']]) { const F = faceOf(q, sd); F.mark(B, [F.at(0, h * .5), F.at(1, h * .5)], { lod: 2 }); }
    if (R.chance(.6)) tree(B, R.r(-6, 4), R.r(-6, 2), R.r(13, 17), { role: 'a yard', lod: 0 });
    else {
      const wl = B.cyl(-2, -2, 2.6, 0, 2.2, { n: 12, b: .5, role: 'a well' });
      const fr = B.line([[-4.6, -2, 2.2], [-4.6, -2, 7], [.6, -2, 7], [.6, -2, 2.2]], { role: 'a well', lod: 1 });
      // the pulley on the beam, the rope down to the water
      B.mark(circ(.7, 10, 0, 0).map(q => [-2 + q.u * .7071, -2 - q.u * .7071, 6.2 + q.v]), { on: fr, closed: true, lod: 2 });
      B.mark([[-2, -2, 5.5], [-2, -2, 2.2]], { on: fr, lod: 2 });
      belt(B, wl, 1.1, { lod: 2 });
    }
    if (R.chance(.5)) mirror(B);
  }, { tier: 'filler', foot: [1, 1] });

  /* A larger house of two storeys round its court: the hall and the rooms over it, a roof room for
     the summer nights, the court with its tree behind a low wall and a door. */
  def('home2', (R, B) => {
    const h1 = R.r(8.5, 10), h2 = R.r(6, 7.5), t = R.r(13, 16);
    const n = B.box(-19, -19, 19, -19 + t, 0, h1, { r: .8, b: .6, role: 'a house' });
    B.windows('S', 3, h1 * .45, 1.8, 2.6, { on: n, lod: 2 });
    const up = B.box(-19, -19, 19, -19 + t, h1, h1 + h2, { r: .8, b: .6, role: 'a house', lod: 0 });
    B.windows('S', 3, h1 + 1.6, 2, 3, { on: up, lod: 1, shape: 'round' });
    B.windows('E', 1, h1 + 1.6, 2, 3, { on: up, lod: 2, shape: 'round' });
    // the latticed windows of the upper rooms, the beam ends under the parapet, the string course between the storeys
    const Fu = faceOf(up, 'S');
    for (const u of [.12, .5, .88]) grille(B, Fu, u, h1 + 1.6, 2, 3, { shape: 'round', nx: 1, ny: 1, frame: false });
    vigas(B, Fu, h1 + h2 - .7, { s: .4, gap: 2.4 }); belt(B, up, h1 + .4, { lod: 2 });
    const rr = B.box(-17, -17, -8, -10, h1 + h2, h1 + h2 + 5, { r: .6, b: .4, role: 'a roof room', lod: 1 });
    B.door('S', .5, 2.8, 3.6, { on: rr, shape: 'round', lod: 2 });
    const w = B.box(-19, -19 + t, -19 + t * .7, 19, 0, h1, { r: .8, b: .6, role: 'a house' });
    B.door('S', .5, 3.4, 5.6, { on: w });
    leaves(B, faceOf(w, 'S'), .5, 3.4, 0, 5.6, { straps: 1, studs: 1 });
    B.window('E', .5, h1 * .5, 1.8, 2.6, { on: w, lod: 2 }); grille(B, faceOf(w, 'E'), .5, h1 * .5, 1.8, 2.6, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    const s = B.box(-19 + t * .7, 17.4, 19, 19, 0, 4.6, { r: .4, b: 0, role: 'a house' });
    B.door('S', .6, 3.4, 3.8, { on: s, shape: 'round' });
    leaves(B, faceOf(s, 'S'), .6, 3.4, 0, 3.8, { shape: 'round', straps: 1, studs: 1 });
    B.box(17.4, -19 + t, 19, 17.4, 0, 4.6, { r: .4, b: 0, role: 'a house' });
    tree(B, (-19 + t * .7 + 17) / 2, (-19 + t + 17) / 2, R.r(12, 15), { role: 'the court of a house', lod: 1, shape: R.chance(.3) ? 'cypress' : 'round' });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'filler', foot: [1, 1] });

  /* A market stall for squares and bazars: an awning on its poles over a counter, or a tent. */
  def('stall', (R, B) => {
    const kind = R.pick(['awning', 'awning', 'tent']);
    stall(B, 0, -2, kind === 'tent' ? 16 : 20, 14, { kind, role: 'a stall', lod: 0, goods: kind === 'tent' ? 0 : 2, h: kind === 'tent' ? 9 : 8 });
    if (R.chance(.6)) { sack(B, -4, 10, 2.6, { role: 'a stall', lod: 1 }); sack(B, -1, 11.5, 2.4, { role: 'a stall', lod: 1 }); }
    else jar(B, 3, 10, 3.6, { role: 'a stall', lod: 1 });
    if (R.chance(.5)) mirror(B);
  }, { tier: 'filler', foot: [1, 1] });


  /* A forty-unit stretch of the wall: the curtain with its walk and battlements on both faces, its
     courses, the putlog holes of the scaffold that built it, the slits. One solid; the rest is drawn on it. */
  def('rampart', (R, B, a) => {
    const alongY = a && a.dir === 'y', h = WALL_H, t = WALL_T / 2;
    const w = alongY ? B.box(-t, -20, t, 20, 0, h, { r: .5, b: .6, role: 'the city wall' }) : B.box(-20, -t, 20, t, 0, h, { r: .5, b: .6, role: 'the city wall' });
    B.crenels({ on: w, every: 3.4, h: 1.6, sides: alongY ? 'EW' : 'SN' });
    B.band(h - 2.4, { on: w, sides: alongY ? 'E' : 'S', lod: 1 });
    const sd = alongY ? 'E' : 'S', F = faceOf(w, sd);
    for (const u of [.3, .75]) { B.window(sd, u, 7, .9, 3, { on: w, shape: 'flat', lod: 2 }); F.mark(B, archGeo(F, u, 2.2, 8.2, .5, 'flat').pts, { lod: 2, closed: true }); }
    B.mark(alongY ? [[t, -20, 2.4], [t, 20, 2.4]] : [[-20, t, 2.4], [20, t, 2.4]], { on: w, n: alongY ? [1, 0, 0] : [0, 1, 0], lod: 1 });
    for (const z of [5.4, 10.8]) F.mark(B, [F.at(0, z), F.at(1, z)], { lod: 2 });
    vigas(B, F, 12.4, { s: .45, gap: 3.4, from: .06, to: .94 });
  }, { tier: 'filler', foot: [1, 1] });

  /* A bastion on the wall line: a round or eight-sided tower with its corbelled battlements. */
  def('bastion', (R, B) => {
    const n = R.pick([20, 20, 8]);
    tower(B, 0, 0, 9, R.r(21, 23), { role: 'a bastion', n, cap: 3, flare: 1.08, slits: 2 });
  }, { tier: 'filler', foot: [1, 1] });

  /* A gate in the wall line: two towers and the arch between, the wall ends joining the next tiles. */
  def('wallgate', (R, B, a) => {
    const alongY = a && a.dir === 'y', r = 6.5, th = 25, ph = 20, g = 5;
    const S = alongY ? 'E' : 'S';
    const ps = alongY ? B.box(-WALL_T / 2 - 1, -g, WALL_T / 2 + 2, g, 0, ph, { r: .5, b: .6, role: 'the gate' }) : B.box(-g, -WALL_T / 2 - 1, g, WALL_T / 2 + 2, 0, ph, { r: .5, b: .6, role: 'the gate' });
    B.door(S, .5, g * 1.6, ph * .66, { on: ps });
    B.window(S, .5, 0, g * 1.1, ph * .54, { on: ps, lod: 1 });
    // the ring of the arch, the leaves of the door, the frame and the slit of the chamber over it
    const F = faceOf(ps, S);
    voussoirs(B, F, .5, g * 1.6, 0, ph * .66, { t: .8 });
    leaves(B, F, .5, g * 1.1, 0, ph * .54, { straps: 2, studs: 2 });
    F.mark(B, [F.at(.06, 0), F.at(.06, ph * .66 + 2.2), F.at(.94, ph * .66 + 2.2), F.at(.94, 0)], { lod: 2 });
    F.mark(B, archGeo(F, .5, .8, ph * .66 + 3.2, 2.4, 'flat').pts, { lod: 2, closed: true });
    B.crenels({ on: ps, every: 2.5, h: 1.4, sides: alongY ? 'EW' : 'SN' });
    for (const sgn of [-1, 1]) {
      const c = sgn * (g + r - .5);
      tower(B, alongY ? 1 : c, alongY ? c : 1, r, th, { role: 'the gate', n: 20, cap: 2.6, flare: 1.08, merlons: 7, slits: 1 });
    }
    // the wall ends, to join the rampart on either side
    const e0 = g + r * 2 - 1.5;
    if (e0 < 20) for (const sgn of [-1, 1]) {
      const p = alongY ? B.box(-WALL_T / 2, sgn < 0 ? -20 : e0, WALL_T / 2, sgn < 0 ? -e0 : 20, 0, WALL_H, { r: .4, b: .5, role: 'the city wall', lod: 0 }) : B.box(sgn < 0 ? -20 : e0, -WALL_T / 2, sgn < 0 ? -e0 : 20, WALL_T / 2, 0, WALL_H, { r: .4, b: .5, role: 'the city wall', lod: 0 });
      B.crenels({ on: p, every: 3.4, h: 1.6, sides: alongY ? 'EW' : 'SN' });
      B.band(WALL_H - 2.4, { on: p, sides: alongY ? 'E' : 'S', lod: 2 });
    }
  }, { tier: 'filler', foot: [1, 1] });
})();
