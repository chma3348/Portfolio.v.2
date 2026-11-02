/* alps.js — the mountain ranges behind the ski run.

   The technique is after LingDong Huang's {Shan, Shui}*
   (github.com/LingDong-/shan-shui-inf, MIT): silhouettes built from noise,
   brush outlines drawn as variable-width polygons, short texture strokes for
   rock, and mist made by letting the ink thin out toward each layer's foot.
   The code is written fresh for this game, and the subject is alpine rather
   than shan shui — the snow is left as bare paper, the same way the run
   itself draws snow.

   Three layers, far to near. Each is its own endless downhill: it slopes
   down to the right at its own grade, and slides up-left along that grade as
   you descend, so the descent reads through the whole picture rather than
   just the slope line. The vertical scroll is tied to how far along the run
   you are, never to the camera's absolute height — an earlier version of the
   backdrop used the absolute height and the ranges marched off the top of the
   screen within a few hundred metres (see draw() in ski.js).

   Performance: each layer is its own <svg>, and per frame it is only ever
   moved with a CSS transform, which the browser composites without
   repainting. The ink is regenerated only when a new stretch of mountains
   comes into view, a few hundred units ahead of the camera. */
window.Alps = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const CW = 520;             // a chunk of mountains, in layer units
  const MARGIN = 580;         // big peaks spill this far past their own chunk
  const LIFT_K = 0.9;         // on the chair the layers sink past you as you climb

  /* Far to near. `off` is how far the layer's foot sits above the run's own
     line at mid-screen; `s` is its downhill grade, flatter with distance —
     the far skyline is all but level, the near forest nearly as steep as
     the piste. `rise` slides the far peaks up over the course of a run: you
     start up among the summits and finish in the valley looking up at them. */
  const LAYERS = [
    { name: "far", fx: 0.07, s: 0.03, off: 120, amp: 14, freq: 760,
      kind: "peak", n: [2, 3], H: [190, 270], Wk: [0.95, 1.35], snow: [0.55, 0.72],
      hatch: 0.8, trees: 0, gTrees: 0, glacier: 0.3, outline: false, rise: 0.10 },
    { name: "mid", fx: 0.19, s: 0.12, off: 40, amp: 24, freq: 540,
      kind: "peak", n: [2, 3], H: [140, 220], Wk: [0.85, 1.25], snow: [0.38, 0.56],
      hatch: 1, trees: 0.42, gTrees: 0.25, glacier: 0.4, outline: true, rise: 0.05 },
    { name: "near", fx: 0.40, s: 0.23, off: 55, amp: 30, freq: 360,
      kind: "hill", n: [2, 4], H: [50, 118], Wk: [1.3, 2.0], snow: [0, 0],
      hatch: 0.35, trees: 1, gTrees: 1, glacier: 0, outline: true, rise: 0,
      chalet: 0.22, lift: 0.16, slopeForest: 240 },
  ];

  /* ---------- randomness: its own, never Math.random ---------- */

  function hash32(a, b) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) | 0;
  }
  const hash01 = (a, b) => (hash32(a, b) >>> 0) / 4294967296;
  function mulberry(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function vnoise(x, s) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = hash01(i, s), b = hash01(i + 1, s);
    return a + (b - a) * u;
  }
  function fbm(x, s) {
    return vnoise(x, s) * 0.57 + vnoise(x * 2.03, s + 17) * 0.29 + vnoise(x * 4.1, s + 31) * 0.14;
  }
  // sharp crests rather than rolling ones: what makes a peak read as alpine
  const ridged = (x, s) => 1 - Math.abs(2 * vnoise(x, s) - 1);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- drawing primitives: path strings, built once per chunk ---------- */

  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const pt = (x, y) => f1(x) + "," + f1(y);
  function poly(pts) {
    let s = "M" + pt(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) s += "L" + pt(pts[k][0], pts[k][1]);
    return s + "Z";
  }
  function line(pts) {
    let s = "M" + pt(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) s += "L" + pt(pts[k][0], pts[k][1]);
    return s;
  }
  /* A brush stroke: a polygon whose width swells through the middle and
     tapers at both ends, with a little noise in the pressure. This is the
     single thing that makes it read as ink rather than as a pen line. */
  function brush(pts, w0, seed) {
    const n = pts.length;
    if (n < 2) return "";
    const A = [], B = [];
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const t = k / (n - 1);
      const w = w0 * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * t), 0.6))
                   * (0.7 + 0.6 * vnoise(k * 0.45, seed));
      A.push([pts[k][0] - dy * w * 0.5, pts[k][1] + dx * w * 0.5]);
      B.push([pts[k][0] + dy * w * 0.5, pts[k][1] - dx * w * 0.5]);
    }
    return poly(A.concat(B.reverse()));
  }
  /* A fir: jagged tiers, filled ink. Whole-unit coordinates — there are
     thousands of these, they're a few pixels tall, and the decimals were
     most of the backdrop's weight, which is what the browser re-rasterises
     each time a new stretch of range arrives. */
  const ip = (x, y) => Math.round(x) + "," + Math.round(y);
  function fir(x, y, h) {
    const w = h * 0.32;
    return "M" + ip(x, y + 1) + "L" + ip(x - w, y + 1) + "L" + ip(x - w * 0.38, y - h * 0.34)
         + "L" + ip(x - w * 0.72, y - h * 0.36) + "L" + ip(x - w * 0.22, y - h * 0.66)
         + "L" + ip(x - w * 0.46, y - h * 0.68) + "L" + ip(x, y - h)
         + "L" + ip(x + w * 0.46, y - h * 0.68) + "L" + ip(x + w * 0.22, y - h * 0.66)
         + "L" + ip(x + w * 0.72, y - h * 0.36) + "L" + ip(x + w * 0.38, y - h * 0.34)
         + "L" + ip(x + w, y + 1) + "Z";
  }
  const el = (cls, d) => (d ? `<path class="${cls}" d="${d}"/>` : "");

  /* ---------- a peak (or, nearer, a forested hill) ---------- */

  /* Two sides, each running foot -> summit, so a height fraction t means the
     same thing on both. Peaks are concave — steepening toward a sharp top —
     with ridged noise along the crest and sometimes a shoulder; hills are
     convex and soft. */
  function shape(rng, seed, cx, by, H, W, skew, hill) {
    const sumX = cx + skew * W, N = hill ? 12 : 18;
    const L = [], R = [];
    const shSide = rng() < 0.6 ? (rng() < 0.5 ? -1 : 1) : 0;
    const shT = 0.42 + rng() * 0.22, shH = 0.05 + rng() * 0.09;
    for (let k = 0; k <= N; k++) {
      const t = k / N, env = Math.pow(Math.sin(Math.PI * t), 0.7);
      for (const side of [-1, 1]) {
        const footX = cx + side * W;
        let h = hill ? 1 - (1 - t) * (1 - t) : Math.pow(t, 1.45);
        h += hill ? (vnoise(t * 4 + (side + 1) * 15, seed) - 0.5) * 0.10 * env
                  : (ridged(t * 7 + (side + 1) * 25, seed) - 0.5) * 0.16 * env;
        if (side === shSide) h += shH * Math.exp(-Math.pow((t - shT) / 0.07, 2));
        const x = footX + (sumX - footX) * t + (vnoise(t * 5 + side * 9, seed + 3) - 0.5) * W * 0.06 * env;
        (side < 0 ? L : R).push([x, by - H * Math.max(0, h)]);
      }
    }
    return { L, R, N, sumX, sumY: by - H };
  }
  function at(S, N, t) {
    const k = clamp(t, 0, 1) * N, i = Math.min(N - 1, Math.floor(k)), f = k - i;
    return [lerp(S[i][0], S[i + 1][0], f), lerp(S[i][1], S[i + 1][1], f)];
  }

  function peak(spec, rng, seed, cx, by, H, W, hs, groundY) {
    const hill = spec.kind === "hill";
    const sh = shape(rng, seed, cx, by, H, W, (rng() - 0.5) * 0.35, hill);
    const { L, R, N } = sh;
    const outline = L.concat(R.slice(0, N).reverse());
    const snow = hill ? 0 : lerp(spec.snow[0], spec.snow[1], rng());
    const snowT = 1 - snow;
    const shadow = 1;                          // the light comes from the left
    let fill = poly(outline.concat([[cx + W, by + 4], [cx - W, by + 4]]));

    /* Shade on the far face. It covers the snow too, because snow in shadow
       is grey, not white — that's what gives the peak a second side. */
    const aFoot = cx + (sh.sumX - cx) * 0.35 + W * 0.12;
    const arete = [];
    for (let k = N; k >= 0; k--) {
      const t = k / N;
      arete.push([lerp(aFoot, sh.sumX, t) + (vnoise(t * 6, seed + 7) - 0.5) * W * 0.05 * Math.sin(Math.PI * t),
                  by - H * Math.pow(t, 1.25)]);
    }
    const wash = poly(R.concat(arete));

    /* Rock texture: strokes down the fall line, with the odd strata tick
       across it. Nothing above a ragged snowline — snow is bare paper — and
       thinning out toward the foot, which is where the mist comes from. */
    let hatch = "";
    const hl = clamp(H / 170, 0.6, 1.4) * hs;
    for (const side of [-1, 1]) {
      const S = side < 0 ? L : R, O = side < 0 ? R : L;
      const count = Math.round(H * (side === shadow ? 0.30 : 0.13) * spec.hatch);
      for (let c = 0; c < count; c++) {
        const t = 0.04 + rng() * 0.92;
        if (rng() > smooth(0.04, 0.32, t)) continue;
        const p = at(S, N, t), q = at(O, N, t);
        const x = p[0] + (q[0] - p[0]) * rng() * (side === shadow ? 0.5 : 0.35);
        const y = p[1] + 2 + rng() * 4;
        if (y > groundY(x) - 2) continue;
        if (!hill && t > snowT + (fbm(x / 22, seed + 11) - 0.5) * 0.22) continue;
        let dx, dy, len = (5 + rng() * 13) * hl;
        if (rng() < 0.28) { dx = -side; dy = 0.2; len *= 0.6; }
        else { dx = side * 0.35 + (rng() - 0.5) * 0.3; dy = 1; }
        const m = Math.hypot(dx, dy);
        hatch += "M" + pt(x, y) + "L" + pt(x + dx / m * len, y + dy / m * len);
      }
    }

    /* A glacier: a pale tongue down the lit face from the snowfield into the
       rock, edged in a fine line with a few crevasses across it. Its paper
       fill wipes out the rock texture underneath, which is the point. */
    let glacier = "", glacierEdge = "";
    if (!hill && rng() < spec.glacier) {
      const tTop = Math.min(0.95, snowT + 0.14), tBot = Math.max(0.06, snowT - 0.22);
      const lft = [], rgt = [];
      for (let k = 0; k <= 8; k++) {
        const t = lerp(tTop, tBot, k / 8);
        const edge = at(L, N, t), mid = lerp(edge[0], lerp(cx, sh.sumX, t), 0.5);
        const hw = W * 0.07 * (0.45 + 0.55 * (1 - k / 8)) + (vnoise(k * 0.9, seed + 21) - 0.5) * 3;
        lft.push([mid - hw, edge[1] + 3]);
        rgt.push([mid + hw, edge[1] + 3]);
      }
      glacier = poly(lft.concat(rgt.slice().reverse()));
      glacierEdge = line(lft.slice(3)) + line(rgt.slice(3));
      for (let k = 2; k <= 7; k += 2) {
        const a = lft[k], b = rgt[k];
        glacierEdge += "M" + pt(a[0] + 2, a[1] + 1) + "Q" + pt((a[0] + b[0]) / 2, a[1] + 4) + " " + pt(b[0] - 2, b[1] + 1);
      }
    }

    /* Ink: the outline, plus a couloir or two scored down the shadow face. */
    let ink = brush(outline, (hill ? 2.2 : 2.6) * hs, seed + 5);
    if (!hill) {
      const n = 1 + (rng() < 0.5 ? 1 : 0);
      for (let c = 0; c < n; c++) {
        const t0 = 0.86 - c * 0.08, t1 = Math.max(0.12, snowT - 0.14);
        const u0 = 0.35 + rng() * 0.2, u1 = u0 + 0.15;
        const g = [];
        for (let k = 0; k <= 6; k++) {
          const t = lerp(t0, t1, k / 6), u = lerp(u0, u1, k / 6);
          const a = at(R, N, t), ax = lerp(aFoot, sh.sumX, t);
          g.push([lerp(ax, a[0], u) + (vnoise(k * 1.3, seed + 40 + c) - 0.5) * 4, a[1] + 2]);
        }
        ink += brush(g, 1.4 * hs, seed + 50 + c);
      }
    }

    /* Firs up the lower slopes, in clumps, stopping at the treeline. On the
       near hills that's the whole hill. */
    let trees = "";
    if (spec.trees > 0) {
      const treeT = hill ? 1.01 : Math.min(snowT - 0.12, 0.38);
      for (const S of [L, R]) {
        for (let k = 0; k < N; k++) {
          const t0 = k / N;
          if (t0 > treeT) break;
          const a = S[k], b = S[k + 1];
          const steps = Math.max(1, Math.round(Math.abs(b[0] - a[0]) / 7));
          for (let j = 0; j < steps; j++) {
            const x = lerp(a[0], b[0], j / steps), y = lerp(a[1], b[1], j / steps);
            if (y > groundY(x) - 3) continue;
            const clump = fbm(x / 34, seed + 60);
            if (clump < (hill ? 0.36 : 0.55) || rng() > spec.trees) continue;
            const th = (hill ? 9 + rng() * 11 : 6 + rng() * 6) * hs;
            trees += fir(x + (rng() - 0.5) * 3, y + 1, th);
          }
        }
      }
    }

    return el("sk-alp-fill", fill) + el("sk-alp-wash", wash) + el("sk-alp-hatch", hatch)
         + el("sk-alp-fill", glacier) + el("sk-alp-hatch", glacierEdge)
         + el("sk-alp-ink", ink) + el("sk-alp-tree", trees);
  }

  /* ---------- the near valley's inhabitants ---------- */

  function chalet(x, gy, hs) {
    const w = 11 * hs, h = 12 * hs, r = 4 * hs;
    const body = [[x - w, gy + 2], [x - w, gy - h], [x + w, gy - h], [x + w, gy + 2]];
    const roof = [[x - w - r, gy - h + 2], [x, gy - h - 13 * hs], [x + w + r, gy - h + 2]];
    // the roof is left white: it's under snow
    return el("sk-alp-fill", poly(body) + poly(roof))
         + el("sk-alp-line", line(body) + line(roof)
              + "M" + pt(x + w * 0.45, gy - h - 7 * hs) + "L" + pt(x + w * 0.45, gy - h - 12 * hs))
         + el("sk-alp-ink", poly([[x - 3 * hs, gy - h * 0.62], [x + 3 * hs, gy - h * 0.62],
                                  [x + 3 * hs, gy - h * 0.18], [x - 3 * hs, gy - h * 0.18]]));
  }

  // a far-off lift line: three pylons, a sagging cable, a couple of chairs
  function liftLine(x0, groundY, hs) {
    const tops = [];
    let d = "";
    for (let k = 0; k < 3; k++) {
      const px = x0 + k * 82 * hs, gy = groundY(px), ty = gy - 44 * hs;
      tops.push([px, ty]);
      d += "M" + pt(px, gy) + "L" + pt(px, ty) + "M" + pt(px - 6 * hs, ty) + "L" + pt(px + 6 * hs, ty);
    }
    const sag = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(Math.PI * t) * 7 * hs];
    for (let k = 0; k < 2; k++) {
      const a = tops[k], b = tops[k + 1];
      d += "M" + pt(a[0], a[1]) + "Q" + pt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 14 * hs) + " " + pt(b[0], b[1]);
      const c = sag(a, b, k ? 0.62 : 0.38);
      d += "M" + pt(c[0], c[1]) + "L" + pt(c[0], c[1] + 7 * hs)
         + "M" + pt(c[0] - 4 * hs, c[1] + 7 * hs) + "L" + pt(c[0] + 4 * hs, c[1] + 7 * hs);
    }
    return el("sk-alp-line", d);
  }

  /* ---------- a chunk ---------- */

  /* `key` is what the chunk's randomness is seeded from — normally its own
     index; band() repeats keys so a strip of range loops seamlessly. */
  function chunk(spec, seed, i, hs, VH, key = i) {
    const rng = mulberry(hash32(seed, key * 7 + 3));
    const B = (lx) => spec.s * lx + spec.amp * hs * (fbm(lx / spec.freq, seed) - 0.5) * 2;
    const x0 = i * CW, x1 = x0 + CW;

    let pk = "";
    const n = spec.n[0] + Math.floor(rng() * (spec.n[1] - spec.n[0] + 1));
    const ps = [];
    for (let j = 0; j < n; j++) {
      const H = lerp(spec.H[0], spec.H[1], rng()) * hs;
      ps.push({ cx: x0 + (j + 0.15 + rng() * 0.7) * CW / n, H,
                W: H * lerp(spec.Wk[0], spec.Wk[1], rng()), s: hash32(seed, key * 31 + j) });
    }
    // biggest first, so the smaller ones stand in front of them
    ps.sort((a, b) => b.H - a.H);
    for (const p of ps) pk += peak(spec, mulberry(p.s), p.s, p.cx, B(p.cx) + p.H * 0.1, p.H, p.W, hs, B);

    // the layer's own ground: opaque paper, so it hides the feet of
    // everything behind it, and the farther ranges float in their mist
    /* Neighbouring chunks OVERLAP by a clear margin. They used to stop a few
       units short — the sample loop never reached its last point — so two
       fills met along a near-shared edge and the antialiasing left a hairline
       the farther ranges showed through. */
    const g = [];
    for (let lx = x0 - 8; lx < x1 + 8; lx += 10) g.push([lx, B(lx)]);
    g.push([x1 + 8, B(x1 + 8)]);
    const deep = VH * 3;
    let gd = el("sk-alp-fill", poly(g.concat([[x1 + 8, B(x1 + 8) + deep], [x0 - 8, B(x0 - 8) + deep]])));
    if (spec.outline) gd += el("sk-alp-line", line(g));

    let dc = "";
    /* The near valley side is forest, thinning into mist as it falls away.
       Mostly hidden under the run's snow while you ski — it's what you look
       down on from the chair, which would otherwise be blank paper. */
    if (spec.slopeForest) {
      const D = spec.slopeForest * hs;
      let t = "";
      for (let lx = x0 + 4; lx < x1; lx += 13) {
        for (let d = 16; d < D; d += 15) {
          const fade = Math.pow(1 - d / D, 1.4);
          if (fbm(lx / 46 + d / 61, seed + 91) < 0.45 || rng() > fade * 0.85) continue;
          const h = (8 + rng() * 9) * hs * (1 - 0.35 * d / D);
          t += fir(lx + (rng() - 0.5) * 7, B(lx) + d + (rng() - 0.5) * 6, h);
        }
      }
      dc += el("sk-alp-tree sk-alp-forest", t);
    }
    if (spec.gTrees > 0) {
      let t = "";
      for (let lx = x0; lx < x1; lx += 6) {
        const clump = fbm(lx / 40, seed + 77);
        if (clump < (spec.kind === "hill" ? 0.42 : 0.62) || rng() > spec.gTrees) continue;
        const h = (spec.kind === "hill" ? 10 + rng() * 12 : 6 + rng() * 5) * hs;
        t += fir(lx + (rng() - 0.5) * 3, B(lx) + 1, h);
      }
      dc += el("sk-alp-tree", t);
    }
    if (spec.lift && rng() < spec.lift) dc += liftLine(x0 + rng() * CW * 0.4, B, hs);
    if (spec.chalet && rng() < spec.chalet) {
      const cx = x0 + (0.2 + rng() * 0.6) * CW;
      dc += chalet(cx, Math.max(B(cx - 11 * hs), B(cx + 11 * hs)), hs);
    }
    return { pk, gd, dc };
  }

  /* ---------- the layers ---------- */

  function create(wrap) {
    const mk = (tag, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute("class", cls); return e; };
    const mist = document.createElement("div");
    mist.className = "sk-alp-mist";
    const layers = LAYERS.map((spec) => {
      const svg = mk("svg", "sk-alp sk-alp-" + spec.name);
      svg.setAttribute("aria-hidden", "true");
      const base = mk("g"), pk = mk("g"), gd = mk("g"), dc = mk("g");
      base.append(pk, gd, dc);
      svg.appendChild(base);
      wrap.appendChild(svg);
      return { spec, svg, base, pk, gd, dc, chunks: new Map(), bx: 0, by: 0, seed: 0, fresh: true };
    });
    wrap.appendChild(mist);

    let VW = 1150, VH = 800, hs = 1;

    function reset(seed, vw, vh) {
      VW = vw; VH = vh;
      hs = clamp(VH / 760, 0.9, 1.45);
      layers.forEach((L, k) => {
        L.pk.textContent = ""; L.gd.textContent = ""; L.dc.textContent = "";
        L.chunks.clear();
        L.seed = hash32(seed, k + 1);
        L.fresh = true;
        // twice the viewport each way, so the layer can slide a long way
        // between repaints without its edges ever showing
        L.svg.setAttribute("viewBox", `${f1(-VW / 2)} ${f1(-VH / 2)} ${f1(VW * 2)} ${f1(VH * 2)}`);
      });
    }

    function add(L, i) {
      const c = chunk(L.spec, L.seed, i, hs, VH);
      const parts = {};
      let next = null;
      for (const [k, v] of L.chunks) if (k > i && (next === null || k < next)) next = k;
      for (const key of ["pk", "gd", "dc"]) {
        const g = mk("g");
        g.innerHTML = c[key];
        L[key].insertBefore(g, next === null ? null : L.chunks.get(next)[key]);
        parts[key] = g;
      }
      L.chunks.set(i, parts);
    }

    /* st: camX (the camera, world units), refX (how far along the run, 0 at
       the summit, negative on the chair), slopeMid (where the run's line
       crosses mid-screen when the camera sits nominally), drift (the camera's
       bob around that, smoothed), ppu (CSS px per unit), veil (1 clear,
       lower in a whiteout). */
    function update(st) {
      const prog = smooth(0, 36000, st.refX);
      for (const L of layers) {
        const sp = L.spec;
        const V = st.refX >= 0 ? sp.s * sp.fx * st.refX : -LIFT_K * sp.s * sp.fx * st.refX;
        const rise = sp.rise * VH * (0.55 - prog);
        const T = st.slopeMid - sp.off * hs + rise;
        const tx = -st.camX * sp.fx;
        const ty = T - sp.s * VW / 2 - sp.s * sp.fx * (st.camX - st.refX) - V
                 - clamp(st.drift * sp.fx, -VH * 0.3, VH * 0.3);

        // keep the chunks under the camera, a little either side
        const lo = Math.floor((-tx - MARGIN) / CW), hi = Math.floor((-tx + VW + MARGIN) / CW);
        let changed = false, budget = L.fresh ? 99 : 2;
        for (const [k, parts] of L.chunks) {
          if (k < lo - 1 || k > hi + 1) {
            parts.pk.remove(); parts.gd.remove(); parts.dc.remove();
            L.chunks.delete(k); changed = true;
          }
        }
        for (let i = lo; i <= hi && budget > 0; i++) {
          if (!L.chunks.has(i)) { add(L, i); budget--; changed = true; }
        }
        L.fresh = false;

        /* Repaint only when the content changed or the layer has slid far
           enough that its edge might show; otherwise the move is a pure
           compositor transform. */
        if (changed || Math.abs(tx - L.bx) > VW * 0.42 || Math.abs(ty - L.by) > VH * 0.42) {
          L.bx = tx; L.by = ty;
          L.base.setAttribute("transform", `translate(${f1(tx)},${f1(ty)})`);
        }
        L.svg.style.transform =
          `translate3d(${((tx - L.bx) * st.ppu).toFixed(2)}px,${((ty - L.by) * st.ppu).toFixed(2)}px,0)`;
      }
      mist.style.opacity = (1 - st.veil).toFixed(3);
    }

    return { reset, update };
  }

  /* ---------- a still range, for the map's Peaks & Wilds doorway ----------
     The same three layers and the same drawing, laid level across a W x H
     screen instead of scrolling (game.js lifts them into view one behind
     another). Far to near, each as SVG markup, with the y its tallest summit
     can reach, so the scene knows how far down to start it. */
  function still(W, H, seed) {
    // a phone gets the same ranges a little smaller, so more than two peaks fit
    const hs = clamp(H / 760, 0.9, 1.45) * 1.3 * clamp(W / 1100, 0.7, 1);
    const BASE = { far: 0.5, mid: 0.72, near: 0.93 };
    return LAYERS.map((spec0, k) => {
      // level ground, and no ski lift in somebody's gallery
      const spec = Object.assign({}, spec0, { s: 0, lift: 0, slopeForest: 0 });
      const lseed = hash32(seed, k + 1), base = BASE[spec.name] * H;
      let pk = "", gd = "", dc = "";
      for (let i = Math.floor(-MARGIN / CW); i <= Math.floor((W + MARGIN) / CW); i++) {
        const c = chunk(spec, lseed, i, hs, H);
        pk += c.pk; gd += c.gd; dc += c.dc;
      }
      return {
        name: spec.name,
        svg: `<g transform="translate(0,${f1(base)})">${pk}${gd}${dc}</g>`,
        top: base - (spec.H[1] * 1.2 + spec.amp) * hs,
      };
    });
  }

  /* ---------- a looping strip, for the runner's horizon ----------
     The trail game turns through full circles, so its skyline has to come
     back round to where it started. Chunks are seeded from their index
     modulo `chunks`, which makes the whole strip repeat exactly every
     chunks x CW units; enough extra is drawn past the end that any window
     of `extra` chunks' width starting inside one period is complete. Level
     ground, no lifts or chalets. Returns markup per layer and the period. */
  function band(seed, opts) {
    const N = opts.chunks, out = {};
    LAYERS.forEach((spec0, k) => {
      const want = opts.layers[spec0.name];
      if (!want) return;
      const spec = Object.assign({}, spec0, { s: 0, amp: 0, lift: 0, chalet: 0, slopeForest: 0 });
      const lseed = hash32(seed, k + 1);
      let pk = "", gd = "", dc = "";
      for (let i = -2; i < N + opts.extra; i++) {
        const c = chunk(spec, lseed, i, want.hs, opts.VH, ((i % N) + N) % N);
        pk += c.pk; gd += c.gd; dc += c.dc;
      }
      out[spec0.name] = pk + gd + dc;
    });
    return { period: N * CW, cw: CW, layers: out };
  }

  return { create, still, band };
})();
