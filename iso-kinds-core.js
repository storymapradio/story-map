/*
 * The exemplar kinds: the house, the mosque and the city's filler homes.
 * Every other kind follows the habits these show:
 *
 *   - Big, plain masses first; detail is marks on the faces you see (south, east).
 *   - Every opening is an arch drawn as a dim mark: door(), window(), arcade().
 *   - A building has a base, a body and a crown: a plinth course, its walls, then
 *     a parapet band, a dome or a roof room.
 *   - One part per role, named as a tale would name it ("the prayer hall").
 *   - lod 0 for the masses that make the silhouette, 1 for secondary masses and
 *     the main marks, 2 for small things seen only up close (merlons, finials).
 *   - Seeded variation changes proportions and one or two choices, never the type.
 *   - At 4x every face and corner has something true to find, after Anatomy's craft
 *     rules (github.com/wheresryan22/anatomy, MIT): the parts a real building has
 *     (voussoirs, door leaves and their studs, grilles, beam ends, spouts, copings),
 *     each sitting on another part and every drawn line ending on an edge or a line.
 *     The kit for them lives in iso-kinds-city.js as ISO.CRAFT; the kinds here reach
 *     it when they build, and still build plainly where it is missing.
 */
(() => {
  const { def } = ISO;

  /* A town house of the Abbasid and Mamluk cities: a flat-roofed block on the street with a
     wooden lattice bay over the door, a roof room for the summer nights, a walled yard and its palm. */
  def('house', (R, B) => {
    const K = ISO.CRAFT;
    const w = R.r(30, 38), d = R.r(24, 30), h = R.r(15, 19);
    const main = B.box(-w / 2, -d / 2, w / 2, d / 2, 0, h, { r: 1.2, b: .9, role: 'the house' });
    B.band(h - 2.4, { on: main, sides: 'SE' });
    B.door('S', .72, 6.4, 10, { on: main });
    B.window('S', .2, 10, 3, 4.6, { on: main });
    B.windows('E', 2, 9.5, 3, 4.6, { on: main });
    if (K) {
      // the ring of the door's arch and its leaves; the grilles of the windows; the beam ends of the roof
      // under the parapet, the plinth course, the spouts that throw the rain clear of the walls
      const FS = K.faceOf(main, 'S'), FE = K.faceOf(main, 'E');
      K.voussoirs(B, FS, .72, 6.4, 0, 10, { t: .8 });
      K.leaves(B, FS, .72, 6.4, 0, 10, { straps: 2, studs: 2 });
      K.grille(B, FS, .2, 10, 3, 4.6, { shape: 'pointed', nx: 2, ny: 2, frame: false });
      for (const u of [.12, .88]) K.grille(B, FE, u, 9.5, 3, 4.6, { shape: 'pointed', nx: 2, ny: 2, frame: false });
      K.vigas(B, FS, h - 1.1, { s: .5, gap: 2.6 }); K.vigas(B, FE, h - 1.1, { s: .5, gap: 2.6 });
      K.belt(B, main, .9);
      K.spouts(B, main, 'S', [.06], h - .4); K.spouts(B, main, 'E', [.94], h - .4);
      // the stone bench by the door where the master of the house sits in the evening
      B.box(w * .22 - 4.2, d / 2, w * .22 - 1, d / 2 + 1.7, 0, 1.2, { r: .2, b: 0, role: 'the house', lod: 2 });
    }
    // the mashrabiya: a lattice bay over the street, on brackets, the grid of its turned wood edge to edge
    const bx = -w * .12, z0 = h * .46, z1 = h * .8;
    const mb = B.box(bx - 5.5, d / 2, bx + 5.5, d / 2 + 3, z0, z1, { r: .5, b: .4, role: 'the lattice window', lod: 1 });
    for (let i = 1; i < 5; i++) B.mark([[bx - 5.5 + 2.2 * i, d / 2 + 3, z0], [bx - 5.5 + 2.2 * i, d / 2 + 3, z1]], { on: mb, n: [0, 1, 0], lod: 2 });
    B.mark([[bx - 5.5, d / 2 + 3, h * .63], [bx + 5.5, d / 2 + 3, h * .63]], { on: mb, n: [0, 1, 0], lod: 2 });
    if (K) {
      for (const z of [lerp(z0, z1, .25), lerp(z0, z1, .75)]) B.mark([[bx - 5.5, d / 2 + 3, z], [bx + 5.5, d / 2 + 3, z]], { on: mb, n: [0, 1, 0], lod: 2 });
      for (const x of [bx - 4, bx + 4]) B.mark([[x, d / 2, z0 - 2], [x, d / 2 + 3, z0], [x, d / 2, z0]], { on: main, n: [0, 1, 0], closed: true, lod: 2 });
      B.box(bx - 6, d / 2, bx + 6, d / 2 + 3.6, z1, z1 + .6, { r: .2, b: 0, role: 'the lattice window', lod: 2 });
    }
    // the roof room, open to the north wind
    const k = B.box(-w / 2 + 2, -d / 2 + 2, -w / 2 + 13, -d / 2 + 11, h, h + 7, { r: .8, b: .6, role: 'the roof room', lod: 1 });
    B.door('S', .5, 4.2, 5.4, { on: k, shape: 'round' });
    B.door('E', .5, 4.2, 5.4, { on: k, shape: 'round' });
    if (K) {
      B.band(h + 6.2, { on: k, sides: 'SE', lod: 2 });
      // the water jar cooling in the wind on the roof
      B.lathe(-w / 2 + 16, -d / 2 + 6, [[.5, h], [1.3, h + 1], [1.4, h + 2.2], [.8, h + 3], [.5, h + 3.3], [.6, h + 3.7]], { n: 10, role: 'the roof room', lod: 2 });
    }
    // the yard: three low walls, a gate, a palm
    const yx0 = w / 2, yx1 = w / 2 + R.r(14, 20), wy = 4.6;
    const ys = B.box(yx0, d / 2 - 1.6, yx1, d / 2, 0, wy, { r: .5, b: 0, role: 'the yard' });
    B.door('S', .55, 3.4, 4.2, { shape: 'round' });
    const ye = B.box(yx1 - 1.6, -d / 2, yx1, d / 2 - 1.6, 0, wy, { r: .5, b: 0, role: 'the yard' });
    B.box(yx0, -d / 2, yx1 - 1.6, -d / 2 + 1.6, 0, wy, { r: .5, b: 0, role: 'the yard' });
    if (K) {
      K.leaves(B, K.faceOf(ys, 'S'), .55, 3.4, 0, 4.2, { shape: 'round', straps: 1, studs: 1 });
      K.coping(B, ys, { out: .25, h: .45 }); K.coping(B, ye, { out: .25, h: .45 });
    }
    B.palm((yx0 + yx1) / 2, -2, R.r(20, 26), { role: 'the yard' });
    if (K) K.figure(B, w * .22 + 4.6, d / 2 + 3, 0, 5.4, { role: 'the house' });
  }, { tier: 'city', foot: [2, 2] });

  /* The congregational mosque: a court of arcades, the prayer hall on the qibla side under its
     dome, a fountain for the ablutions, and a minaret at the corner: round with a balcony, square
     in the Syrian manner, or the spiral of Samarra. */
  def('mosque', (R, B) => {
    const K = ISO.CRAFT;
    const X = 42, Y = 34, hh = R.r(15, 18), ph = 10;
    const style = R.pick(['round', 'square', 'spiral']);
    // the court's paving, with the qibla line across it
    const court = B.plate([[-X, -Y, 0], [X, -Y, 0], [X, Y, 0], [-X, Y, 0]], { role: 'the courtyard', cls: 'nf' });
    if (K) for (let x = -X + 16; x < X - 8; x += 8) B.mark([[x, -Y + 24, 0], [x, Y - 8, 0]], { on: court, lod: 2 });
    // the prayer hall along the north side, its arcade open to the court
    const hall = B.box(-X, -Y, X, -Y + 24, 0, hh, { r: 1.6, b: 1, role: 'the prayer hall' });
    B.arcade('S', 9, 0, hh * .62, { on: hall });
    B.band(hh - 2, { on: hall, sides: 'SE' });
    B.crenels({ on: hall, every: 3.6, h: 1.4, sides: 'SE' });
    if (K) {
      const F = K.faceOf(hall, 'S'), sp = .92 / 9;
      for (let i = 0; i < 9; i++) K.voussoirs(B, F, .04 + sp * (i + .5), sp * 2 * X * .74, 0, hh * .62, { t: .8 });
      K.inscription(B, F, hh - 3.6, hh - 2.6);
      K.belt(B, hall, .8);
      K.spouts(B, hall, 'S', [.1, .5, .9], hh - .3);
    }
    // the dome over the mihrab bay, on an octagonal drum with a window in each face
    const dm = B.dome(0, -Y + 12, 10, hh, { shape: 'pointed', drum: 4, drumN: 8, role: 'the dome' });
    const drum = B.parts[B.parts.length - 3];
    if (K) {
      K.drumWindows(B, drum, 0, -Y + 12, 10.4, 8, 0, hh + .7, 1.6, 2.6, { shape: 'round' });
      K.domeBand(B, dm, 0, -Y + 12, 10, hh + 4, { dz: 1.1, n: 26 });
      K.alem(B, 0, -Y + 12, hh + 4 + 14.5, 2.8, { role: 'the dome' });
    } else B.window('S', .5, hh + .8, 2.4, 2.6, { on: drum, shape: 'round', lod: 2 });
    // the porticos round the other three sides
    const pe = B.box(X - 8, -Y + 24, X, Y - 8, 0, ph, { r: 1, b: .7, role: 'the arcades' });
    B.arcade('W', 6, 0, ph * .7, { on: pe });
    B.arcade('E', 6, 0, ph * .7, { on: pe, lod: 2 });
    const pw = B.box(-X, -Y + 24, -X + 8, Y - 8, 0, ph, { r: 1, b: .7, role: 'the arcades' });
    B.arcade('E', 6, 0, ph * .7, { on: pw });
    const ps = B.box(-X, Y - 8, X, Y, 0, ph, { r: 1, b: .7, role: 'the arcades' });
    B.arcade('N', 9, 0, ph * .7, { on: ps });
    B.arcade('S', 9, 0, ph * .55, { on: ps, lod: 2 });
    if (K) for (const [p, sd] of [[pe, 'E'], [pw, 'E'], [ps, 'S']]) { B.band(ph - 1.2, { on: p, sides: sd, lod: 2 }); K.belt(B, p, .7); }
    // the gate: a portal raised over the south portico, the leaves of its door, the inscription over it, its steps
    const gate = B.box(-8, Y - 9, 8, Y + 1.5, 0, ph + 7, { r: 1, b: .7, role: 'the gate of the mosque' });
    B.door('S', .5, 7, 12.5, { on: gate });
    B.panel('S', .14, .86, ph + 1.4, ph + 5.6, { on: gate });
    if (K) {
      const F = K.faceOf(gate, 'S');
      K.voussoirs(B, F, .5, 7, 0, 12.5, { t: .9 });
      B.window('S', .5, 0, 7 * .62, 12.5 * .78, { on: gate, lod: 1 });
      K.muqarnas(B, F, .5, 7 * .62, 0, 12.5 * .78, { tiers: 2, cell: 1.4 });
      K.leaves(B, F, .5, 7 * .3, 0, 12.5 * .4, { shape: 'round', straps: 1, studs: 1 });
      B.door('S', .5, 7 * .3, 12.5 * .4, { on: gate, shape: 'round', lod: 2 });
      K.inscription(B, F, ph + 1.4 + .4, ph + 5.6 - .4, { u0: .14, u1: .86 });
      B.crenels({ on: gate, every: 2.2, h: 1.2, sides: 'SE', lod: 2 });
      K.steps(B, 'S', -3.6, 3.6, Y + 1.5, 1, 2, 1.1, { role: 'the gate of the mosque' });
    }
    // the fountain of the ablutions in the court: its basin and rim, the dome over it, the water
    B.cyl(0, 6, 5, 0, 2.4, { n: 8, b: .5, role: 'the fountain' });
    B.dome(0, 6, 2.6, 2.4, { shape: 'round', role: 'the fountain', lod: 1, finial: false });
    if (K) {
      B.cyl(0, 6, 5.5, 2.4, 2.9, { n: 8, b: .4, role: 'the fountain', lod: 2 });
      for (const a of [Math.PI / 4 - .6, Math.PI / 4, Math.PI / 4 + .6]) B.line([[Math.cos(a) * 2.7, 6 + Math.sin(a) * 2.7, 3.2], [Math.cos(a) * 4.2, 6 + Math.sin(a) * 4.2, 2.6]], { role: 'the fountain', lod: 2, cls: 'lo' });
      K.figure(B, 6.6, 9.4, 0, 5.2, { role: 'the fountain' });
      K.figure(B, -14, -4, 0, 5.2, { role: 'the courtyard' });
    }
    // the minaret at the south-east corner
    const mx = X - 4, my = Y - 4;
    if (style === 'spiral') {
      const base = B.box(mx - 7, my - 7, mx + 7, my + 7, 0, 4, { r: .8, b: .6, role: 'the minaret' });
      const top = 52;
      B.lathe(mx, my, [[6.5, 4], [5.4, 16], [4.2, 28], [3.1, 40], [2.4, top]], { n: 20, role: 'the minaret' });
      // the ramp, winding up round the cone
      const pts = []; for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * Math.PI * 2 * 4.5 + .8, z = 4 + t * (top - 4), r = 6.5 + (2.4 - 6.5) * t; pts.push([mx + Math.cos(a) * r, my + Math.sin(a) * r, z]); }
      B.mark(pts, { lod: 1, cls: 'mid', axis: [mx, my] });
      B.cyl(mx, my, 2, top, top + 4, { n: 8, role: 'the minaret', lod: 1 });
      if (K) {
        B.door('S', .5, 2.4, 3.4, { on: base, shape: 'round', lod: 2 });
        K.drumWindows(B, B.last, mx, my, 2, 8, 0, top + .8, .7, 2.2, { shape: 'pointed' });
        B.dome(mx, my, 2.1, top + 4, { shape: 'pointed', role: 'the minaret', lod: 2, finial: false });
      }
    } else if (style === 'square') {
      const s = 4.2;
      const t = B.box(mx - s, my - s, mx + s, my + s, 0, 40, { r: .6, b: .6, role: 'the minaret' });
      B.band(16, { on: t, sides: 'SE' }); B.band(28, { on: t, sides: 'SE' });
      B.window('S', .5, 30, 2.2, 5, { on: t, shape: 'round' }); B.window('E', .5, 30, 2.2, 5, { on: t, shape: 'round' });
      B.window('S', .5, 19, 1.6, 4, { on: t, lod: 2 });
      if (K) { for (const sd of 'SE') K.grille(B, K.faceOf(t, sd), .5, 30, 2.2, 5, { shape: 'round', nx: 1, ny: 2, frame: false }); for (const z of [5, 10.5, 22]) B.band(z, { on: t, sides: 'SE', lod: 2 }); }
      B.box(mx - s - .8, my - s - .8, mx + s + .8, my + s + .8, 40, 41.4, { r: .4, b: 0, role: 'the minaret', lod: 1 });
      const lt = B.box(mx - s + 1.2, my - s + 1.2, mx + s - 1.2, my + s - 1.2, 41.4, 47, { r: .4, b: .4, role: 'the minaret', lod: 1 });
      if (K) for (const sd of 'SE') B.door(sd, .5, 2, 4, { on: lt, z: 41.4, shape: 'round', lod: 2 });
      B.cone(mx, my, 3.6, 47, 52, { tip: .2, role: 'the minaret', lod: 1 });
      if (K) B.sphere(mx, my, 52.5, .55, { role: 'the minaret', lod: 2 });
    } else {
      const base = B.box(mx - 5, my - 5, mx + 5, my + 5, 0, 12, { r: .8, b: .6, role: 'the minaret' });
      const shaft = B.cyl(mx, my, 3.4, 12, 40, { n: 8, b: .4, role: 'the minaret' });
      const bal = B.cyl(mx, my, 5, 40, 41.6, { n: 16, b: .4, role: 'the minaret', lod: 1 });
      const up = B.cyl(mx, my, 2.7, 41.6, 51, { n: 8, b: .3, role: 'the minaret', lod: 1 });
      B.dome(mx, my, 3, 51, { shape: 'onion', role: 'the minaret', lod: 1 });
      if (K) {
        B.band(10.6, { on: base, sides: 'SE', lod: 2 }); B.door('S', .5, 2.4, 4, { on: base, shape: 'round', lod: 2 });
        for (const z of [20, 30]) K.belt(B, shaft, z, { lod: 2 });
        K.drumWindows(B, shaft, mx, my, 3.4, 8, 0, 33, .9, 2.6, { shape: 'pointed' });
        K.corbelRing(B, bal, mx, my, 3.4, 5, 40, 1.6, 16, 2);
        K.drumWindows(B, up, mx, my, 2.7, 8, 0, 44, .9, 2.6, { shape: 'pointed' });
        B.line([[mx, my, 55.5], [mx, my, 56.9]], { role: 'the minaret', lod: 2 });
        K.alem(B, mx, my, 55.5, 1.4, { role: 'the minaret' });
      }
    }
  }, { tier: 'city', foot: [3, 3] });

  /* The city's homes: the plots no tale names, which make a city read as a city.
     Forty units square: one tile of a city's map. Flat roofs, parapets, a door to the lane,
     here and there a roof room, a small dome, a court with a tree. Drawn hundreds of times, so
     its small parts are drawn on its faces. */
  def('home', (R, B) => {
    const K = ISO.CRAFT;
    const type = R.pick(['block', 'block', 'two', 'court', 'dome', 'tall']);
    const pad = R.r(2.5, 5), x0 = -20 + pad, y0 = -20 + pad, x1 = 20 - pad * R.r(.6, 1), y1 = 20 - pad * R.r(.6, 1);
    const h = R.r(9, 14);
    if (type === 'court') {
      const t = 6;
      const n = B.box(x0, y0, x1, y0 + t, 0, h, { r: .8, b: .6, role: 'a house' });
      B.box(x0, y0 + t, x0 + t, y1, 0, h * .8, { r: .8, b: .6, role: 'a house' });
      const s = B.box(x0 + t, y1 - 2, x1, y1, 0, h * .55, { r: .5, b: 0, role: 'a house' });
      B.door('S', .6, 3.2, 5, { on: s, shape: 'round' });
      if (K) { K.leaves(B, K.faceOf(s, 'S'), .6, 3.2, 0, 5, { shape: 'round', straps: 1, studs: 1 }); K.vigas(B, K.faceOf(n, 'S'), h - .8, { s: .4, gap: 2.2 }); }
      B.box(x1 - 2, y0 + t, x1, y1 - 2, 0, h * .55, { r: .5, b: 0, role: 'a house' });
      B.tree((x0 + x1) / 2 + 3, (y0 + y1) / 2 + 3, R.r(12, 16), { role: 'a court', lod: 1 });
      return;
    }
    const main = B.box(x0, y0, x1, y1, 0, h, { r: 1, b: .7, role: 'a house' });
    const du = R.r(.25, .75);
    B.door('S', du, 3.6, 6, { on: main });
    const win = R.chance(.7), wu = win ? R.r(.3, .7) : 0;
    if (win) B.window('E', wu, h * .6, 2.2, 3.2, { on: main, lod: 2 });
    if (K) {
      // the leaves of the door, the grille of the window, the beam ends of the roof, the plinth course, a spout
      const FS = K.faceOf(main, 'S');
      K.leaves(B, FS, du, 3.6, 0, 6, { straps: 1, studs: 1 });
      if (win) K.grille(B, K.faceOf(main, 'E'), wu, h * .6, 2.2, 3.2, { shape: 'pointed', nx: 1, ny: 1, frame: false });
      const FE = K.faceOf(main, 'E');
      K.vigas(B, FS, h - .8, { s: .42, gap: 2.4 }); K.vigas(B, FE, h - .8, { s: .42, gap: 2.4 }); K.belt(B, main, .7);
      if (!win) FE.mark(B, K.archGeo(FE, .5, 1.6, h * .62, .7, 'flat').pts, { lod: 2, closed: true });
      // the hatch of the stair that comes up onto the roof
      const hx = x1 - 6, hy = y0 + 3;
      B.mark([[hx, hy, h], [hx + 3, hy, h], [hx + 3, hy + 3, h], [hx, hy + 3, h]], { on: main, closed: true, lod: 2 });
      B.mark([[hx + .5, hy + .5, h], [hx + 2.5, hy + .5, h], [hx + 2.5, hy + 2.5, h], [hx + .5, hy + 2.5, h]], { on: main, closed: true, lod: 2 });
      K.spouts(B, main, 'S', [du > .5 ? .1 : .9], h - .3, { out: 1.2 });
    }
    if (type === 'two') {
      const m2 = B.box(x0, y0, x0 + (x1 - x0) * R.r(.45, .6), y0 + (y1 - y0) * R.r(.45, .6), h, h + R.r(6, 8), { r: .8, b: .6, role: 'a house', lod: 1 });
      B.window('S', .5, h + 2, 2.2, 3.2, { on: m2, lod: 2 });
      if (K) K.grille(B, K.faceOf(m2, 'S'), .5, h + 2, 2.2, 3.2, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    } else if (type === 'dome') {
      const dR = Math.min(x1 - x0, y1 - y0) * .26;
      const dd = B.dome((x0 + x1) / 2, (y0 + y1) / 2, dR, h, { shape: R.pick(['round', 'shallow']), role: 'a house', lod: 1, finial: false });
      if (K) K.domeBand(B, dd, (x0 + x1) / 2, (y0 + y1) / 2, dR, h, { dz: .6, n: 16 });
    } else if (type === 'tall') {
      const m2 = B.box(x0 + 2, y0 + 2, x1 - 2, y1 - 2, h, h + R.r(7, 10), { r: .8, b: .6, role: 'a house', lod: 1 });
      B.windows('S', 2, h + 2.5, 2, 3.4, { on: m2, lod: 2 });
      if (K) for (const u of [.12, .88]) K.grille(B, K.faceOf(m2, 'S'), u, h + 2.5, 2, 3.4, { shape: 'pointed', nx: 1, ny: 1, frame: false });
    } else if (R.chance(.5)) {
      const rr = B.box(x0 + 1.5, y0 + 1.5, x0 + 8, y0 + 8, h, h + 5, { r: .5, b: .4, role: 'a roof room', lod: 2 });
      if (K) B.door('S', .5, 2.4, 3.2, { on: rr, shape: 'round', lod: 2 });
    }
  }, { tier: 'filler', foot: [1, 1] });

  /* A palm drawn as one stroke: the trunk, then each frond out and back to the crown. It takes the
     same chances as the kernel's palm, so a grove keeps its trees where they always stood. */
  function palmStroke(B, cx, cy, h, o) {
    const R = B.R, lean = .08, n = 7, lx = h * lean * (R() - .5) * 2, ly = h * lean * (R() - .5) * 2;
    const top = [cx + lx, cy + ly, h], pts = [[cx, cy, 0], [cx + lx * .3, cy + ly * .3, h * .55], top];
    const a0 = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * 6.28 + R.r(-.2, .2), L = h * R.r(.34, .46), droop = R.r(.2, .42), c = Math.cos(a), s = Math.sin(a);
      const p1 = [top[0] + c * L * .45, top[1] + s * L * .45, h + L * .12], p2 = [top[0] + c * L * .85, top[1] + s * L * .85, h - L * droop * .5], p3 = [top[0] + c * L, top[1] + s * L, h - L * droop];
      pts.push(p1, p2, p3, p2, p1, top);
    }
    return B.line(pts, { role: o.role, lod: o.lod, w: 1.25 });
  }

  /* A palm grove tile: the gardens of a river city, three to five date palms on the irrigated ground,
     the channel that waters them between its banks, a climber's ladder against one trunk at the harvest. */
  def('grove', (R, B) => {
    const g = B.plate([[-19, -19, 0], [19, -19, 0], [19, 19, 0], [-19, 19, 0]], { cls: 'nf', role: 'the palm gardens', lod: 1 });
    const n = R.i(3, 5);
    let first = null;
    for (let i = 0; i < n; i++) { const x = R.r(-14, 14), y = R.r(-14, 14), h = R.r(18, 26); palmStroke(B, x, y, h, { role: 'the palm gardens', lod: 0 }); if (!first) first = [x, y, h]; }
    // the channel across the tile and the basins dug round the trees it feeds
    for (const dx of [-1.2, 1.2]) B.mark([[-19, 6 + dx, 0], [19, 6 + dx, 0]], { on: g, lod: 1 });
    for (let k = 0; k < 5; k++) { const x = -15 + k * 7.5; B.mark([[x - 1.2, 6, 0], [x, 6.5, 0], [x + 1.2, 6, 0]], { on: g, lod: 2 }); }
    if (first) {
      const [x, y, h] = first, lad = B.line([[x + 3.2, y + 3.2, 0], [x + .9, y + .9, h * .62], [x + .9 - .9, y + .9 + .9, h * .62], [x + 3.2 - .9, y + 3.2 + .9, 0]], { role: 'the palm gardens', lod: 2 });
      for (let k = 1; k < 7; k++) { const f = k / 7; B.mark([[lerp(x + 3.2, x + .9, f), lerp(y + 3.2, y + .9, f), h * .62 * f], [lerp(x + 2.3, x, f), lerp(y + 4.1, y + 1.8, f), h * .62 * f]], { on: lad, lod: 2 }); }
    }
  }, { tier: 'filler', foot: [1, 1] });
  const lerp = (a, b, t) => a + (b - a) * t;
})();
