"use strict";

/* ============================================================
   OFF THE MAP — Felix's run
   ------------------------------------------------------------
   Walk into the edge of the map and hold. A squirrel breaks cover,
   Felix goes after it, and the trail takes over.

     ← →   take the corner (one press, it snaps)
     ↑     jump the log
     ↓     sploot under the branch
     esc   call him back
     touch: swipe the same four directions (fires mid-swipe, no lift
     needed) · the esc chip becomes a tappable ✕

   One life. The run ends, you get three seconds to go again, and if
   you don't he comes trotting back and you're on the map.

   DIFFICULTY comes on in stages rather than all at once — see PHASES.
   Long empty straights first, then corners, then logs, then branches,
   and only after all that does it start to tighten.

   HOW THE VIEW WORKS
   The trail is a centreline in world space (x east, z north) of straight
   runs joined by 90-degree arcs. The camera sits behind and above him
   looking along his heading; each frame the track ahead is moved into
   camera space and projected, so it genuinely bends away. Obstacles are
   projected through the same maths as the trail, so what you see is
   exactly the band the collision test uses.
   ============================================================ */

window.Runner = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const TOUCH = matchMedia("(pointer: coarse)");

  /* ---------- the view ---------- */

  const FOCAL = 520, CAM_BACK = 62, CAM_HEIGHT = 42;
  const CAM_SWING = 0.115, NEAR = 12, HALF_W = 24, SEE_AHEAD = 460;

  /* ---------- pace ---------- */

  const SPEED_0 = 128, SPEED_TOP = 320, SPEED_OVER = 7000;

  /* ---------- the moves ---------- */

  const JUMP_MS = 620, JUMP_LIFT = 26;
  const DUCK_MS = 560;
  const STAND_H = 16, DUCK_H = 7;
  const LOG = { y0: 0, y1: 11 };
  const BRANCH = { y0: 13, y1: 34 };

  /* ---------- how it gets harder ----------
     Each stage adds exactly one new thing, so there's always a stretch
     to learn it on before the next arrives. */
  const PHASES = [
    { until: 620,  straight: [420, 620], logs: false, branches: false },  // to ~155m
    { until: 1500, straight: [290, 450], logs: false, branches: false },  // to ~375m
    { until: 2700, straight: [270, 420], logs: true,  branches: false, gap: [290, 420] },
    { until: 4300, straight: [235, 370], logs: true,  branches: true,  gap: [225, 330] },
  ];
  function phaseAt(s) {
    for (const p of PHASES) if (s < p.until) return p;
    const d = Math.min(1, (s - 4300) / 4500);       // and then it tightens
    return {
      straight: [lerp(220, 145, d), lerp(340, 235, d)],
      logs: true, branches: true,
      gap: [lerp(210, 125, d), lerp(310, 175, d)],
    };
  }

  const STEP = 7, CORNER_R = 44;
  const INTRO_MS = 2700, OVER_WAIT_MS = 3000, RECALL_MS = 2600;

  /* Calling him back used to cut him straight to the far distance — he'd be
     filling the screen one frame and a speck on the horizon the next. Now it
     picks up from exactly where he's stood: he carries on a few paces and
     pulls up (still seen from behind), turns, and trots back to you. */
  const RECALL_TURN = 0.34;      // of the recall spent trotting on and turning
  const RECALL_Z_FAR = 168;      // how far up the trail he gets before he turns
  const RECALL_Z_NEAR = 46;      // and how close he ends up
  let recallZ0 = CAM_BACK, recallX0 = null;

  /* ---------- state ---------- */

  let root, svg, Lr = {}, distEl, overBox;
  let W = 0, H = 0, cx = 0, horizonY = 0;
  let raf = 0, lastT = 0, mode = "idle";   // intro | run | over | recall
  let modeT = 0;

  let track = [], corners = [], obstacles = [];
  let endX = 0, endZ = 0, endTh = 0, endS = 0, ci = 0;
  let pS = 0, prevS = 0, speed = SPEED_0;
  let px = 0, pz = 0, pth = 0, camX = 0, camZ = 0, camYaw = 0;
  let jumpT = -1, duckT = -1;
  let squirrel = { s: 0, off: 0, gone: false };
  let onExit = null, trees = [], marks = [], overTimer = 0;
  const TREE_N = 46, TREE_GAP = 19;      // the woods, either side
  const MARK_N = 110, MARK_GAP = 6.5;    // grass tufts and pebbles streaming past

  /* ---------- helpers ---------- */

  function ns(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  function wob(i, spread) { const s = Math.sin(i * 12.9898) * 43758.5453; return (s - Math.floor(s)) * spread; }
  const midP = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const P = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

  /* ---------- laying track ---------- */

  function addStraight(len, clear) {
    const startS = endS;
    let d = 0;
    while (d < len) {
      endX += Math.sin(endTh) * STEP; endZ += Math.cos(endTh) * STEP;
      endS += STEP; d += STEP;
      track.push({ x: endX, z: endZ, th: endTh, s: endS });
    }
    const ph = phaseAt(startS);
    if (clear || (!ph.logs && !ph.branches)) return;
    let at = startS + 120;
    const stop = endS - 110;                 // never crowd the corner itself
    while (at < stop) {
      const kind = ph.branches && Math.random() < 0.45 ? "branch" : "log";
      obstacles.push({ s: at, kind, passed: false });
      at += rand(ph.gap[0], ph.gap[1]);
    }
  }

  function addCorner(dir) {
    const arcLen = CORNER_R * (Math.PI / 2);
    const steps = Math.max(6, Math.round(arcLen / STEP));
    const dTh = (dir * (Math.PI / 2)) / steps, dS = arcLen / steps;
    corners.push({ s: endS, dir, taken: false });
    for (let k = 0; k < steps; k++) {
      endTh += dTh;
      endX += Math.sin(endTh) * dS; endZ += Math.cos(endTh) * dS;
      endS += dS;
      track.push({ x: endX, z: endZ, th: endTh, s: endS });
    }
  }

  let sinceBreather = 0;
  function extend() {
    while (endS < pS + SEE_AHEAD + 800) {
      const ph = phaseAt(endS);
      /* Once it's ramping, drop in an empty stretch now and then. Not as long
         as the opening run, but long enough to stop bracing and look up. */
      const earned = endS > 2200 && sinceBreather >= 2;
      if (earned && Math.random() < 0.34) {
        addStraight(rand(330, 460), true);
        sinceBreather = 0;
      } else {
        addStraight(rand(ph.straight[0], ph.straight[1]));
        sinceBreather++;
      }
      addCorner(Math.random() < 0.5 ? -1 : 1);
    }
  }

  /* The mark to beat, kept on screen while you run. Read once per run —
     localStorage is synchronous and this would otherwise be a per-frame hit. */
  let pbEl = null, pbMark = 0, pbBeaten = false;

  function resetTrack() {
    track = []; corners = []; obstacles = []; ci = 0; sinceBreather = 0;
    endX = endZ = endTh = endS = 0;
    track.push({ x: 0, z: 0, th: 0, s: 0 });
    addStraight(560);                        // the squirrel chase happens here
    extend();
  }

  function trackAt(s) {
    if (s <= 0) {
      const a = track[0];
      return { x: a.x + Math.sin(a.th) * s, z: a.z + Math.cos(a.th) * s, th: a.th };
    }
    let j = clamp(Math.floor(s / STEP), 0, track.length - 2);
    while (j < track.length - 2 && track[j + 1].s < s) j++;
    while (j > 0 && track[j].s > s) j--;
    const a = track[j], b = track[j + 1] || a;
    const t = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      th: a.th + wrapAngle(b.th - a.th) * t,
    };
  }

  const windowIn = () => Math.max(96, speed * 0.9);

  /* ---------- projection ---------- */

  function project(wx, wz, wy) {
    const dx = wx - camX, dz = wz - camZ;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const zc = dx * fx + dz * fz;
    if (zc < NEAR) return null;
    return {
      x: cx + ((dx * fz - dz * fx) / zc) * FOCAL,
      y: horizonY + ((CAM_HEIGHT - (wy || 0)) / zc) * FOCAL,
      s: FOCAL / zc,
    };
  }
  function span(s, wy) {
    const a = trackAt(s);
    const rx = Math.cos(a.th), rz = -Math.sin(a.th);
    return [project(a.x - rx * HALF_W, a.z - rz * HALF_W, wy),
            project(a.x + rx * HALF_W, a.z + rz * HALF_W, wy)];
  }

  /* ---------- stage ---------- */

  /* Felix is a German Shepherd: pale coat, black saddle, big upright ears,
     a bushy tail carried low. The old sprite drew him standing tall and
     narrow — an upright egg with a head on it, which read as a penguin or a
     cat. But the camera is above and behind him, looking DOWN onto his back,
     so what you actually see of a running dog is squat and wide: two round
     haunches, the back running away up the screen under the saddle, the
     head beyond the shoulders (so the shoulders hide its bottom), ears up,
     the tail hanging between the hind legs, and the hind paws kicking up
     with their pads showing. Legs are a pale stroke inside an ink one.
     Drawn bottom-up in depth: the far things (front legs, ears, head)
     first, the near ones (hind legs, haunches, tail) last. */
  const LIMB = (cls, d, pad) => `<g class="rk-leg ${cls}"><path class="rk-limb-o" d="${d}"/><path class="rk-limb-i" d="${d}"/>${pad || ""}</g>`;
  const EAR_L = "M-9.6,-48.6 C-11.6,-55 -13.2,-61.6 -14,-68.2 Q-14,-70.8 -11.6,-69.6 C-8.2,-65 -4.6,-60 -1.6,-55.4 C-4.4,-53.4 -7.2,-51.2 -9.6,-48.6 Z";
  const EAR_R = "M9.6,-48.6 C11.6,-55 13.2,-61.6 14,-68.2 Q14,-70.8 11.6,-69.6 C8.2,-65 4.6,-60 1.6,-55.4 C4.4,-53.4 7.2,-51.2 9.6,-48.6 Z";
  const DOG_RUN = `
    <g class="rk-bob">
      ${LIMB("rk-lf1", "M-11.5,-31 L-15,-24.5")}
      ${LIMB("rk-lf2", "M11.5,-31 L15,-24.5")}
      <path class="rk-head" d="M-10.5,-46 C-11,-52 -6.5,-55.5 0,-55.5 C6.5,-55.5 11,-52 10.5,-46 C10,-41 5.8,-38 0,-38 C-5.8,-38 -10,-41 -10.5,-46 Z"/>
      <path class="rk-ear rk-ear-l" d="${EAR_L}"/>
      <path class="rk-ear rk-ear-r" d="${EAR_R}"/>
      ${LIMB("rk-lb1", "M-11.5,-11 L-15,-4.5 L-12.5,0.5", `<ellipse class="rk-pad" cx="-12.6" cy="1.2" rx="2.7" ry="1.7"/>`)}
      ${LIMB("rk-lb2", "M11.5,-11 L15,-4.5 L12.5,0.5", `<ellipse class="rk-pad" cx="12.6" cy="1.2" rx="2.7" ry="1.7"/>`)}
      <path class="rk-dog-body" d="M-16,-8 C-19.5,-16 -17.5,-26 -12.5,-33 C-9,-38.5 -5,-40.5 0,-40.5
        C5,-40.5 9,-38.5 12.5,-33 C17.5,-26 19.5,-16 16,-8 L13.6,-4.4 L14.2,-6.4 L11,-3 L11.4,-5 L7.4,-2.6
        C4.4,-2.8 2,-4 0,-5.5 C-2,-4 -4.4,-2.8 -7.4,-2.6 L-11.4,-5 L-11,-3 L-14.2,-6.4 L-13.6,-4.4 Z"/>
      <path class="rk-dog-mantle" d="M-9.5,-35 C-12,-29 -11.5,-22 -7.5,-18 C-4,-15.5 4,-15.5 7.5,-18
        C11.5,-22 12,-29 9.5,-35 C6.5,-38.6 -6.5,-38.6 -9.5,-35 Z"/>
      <path class="rk-collar" d="M-7.5,-38.6 C-3,-36.6 3,-36.6 7.5,-38.6"/>
      <g class="rk-tail"><path class="rk-tail-fill" d="M-2.6,-12 C-5.6,-6 -5,1 -1.5,7 L-0.4,5.4 L0.4,8.6 L1.6,6.6 L3,8
        C4.6,3 5,-4 3,-12 C1,-13.4 -0.8,-13.4 -2.6,-12 Z"/></g>
    </g>`;

  /* the sploot: belly flat, both hind legs stretched straight back at you,
     pads up — the shape every shepherd owner knows */
  const DOG_SPLOOT = `
    <g class="rk-sploot-in">
      <path class="rk-head" d="M-10.5,-32 C-11,-38 -6.5,-41 0,-41 C6.5,-41 11,-38 10.5,-32 C10,-27.5 5.8,-25 0,-25 C-5.8,-25 -10,-27.5 -10.5,-32 Z"/>
      <path class="rk-ear" d="M-9.6,-34.6 C-12,-39.6 -14.4,-44.6 -15.8,-50 Q-16,-52.4 -13.8,-51.6 C-10,-48 -5.8,-44 -2.4,-40.6 C-5,-38.8 -7.4,-36.8 -9.6,-34.6 Z"/>
      <path class="rk-ear" d="M9.6,-34.6 C12,-39.6 14.4,-44.6 15.8,-50 Q16,-52.4 13.8,-51.6 C10,-48 5.8,-44 2.4,-40.6 C5,-38.8 7.4,-36.8 9.6,-34.6 Z"/>
      ${LIMB("", "M-11,-8 L-18,1.5 L-21.5,6.5", `<ellipse class="rk-pad" cx="-22" cy="7.4" rx="3.2" ry="2.1"/>`)}
      ${LIMB("", "M11,-8 L18,1.5 L21.5,6.5", `<ellipse class="rk-pad" cx="22" cy="7.4" rx="3.2" ry="2.1"/>`)}
      <path class="rk-dog-body" d="M-17,-6 C-20,-12 -18,-20 -12.5,-25 C-9,-28 -5,-29 0,-29 C5,-29 9,-28 12.5,-25
        C18,-20 20,-12 17,-6 L14.4,-3 L14.8,-5 L11.4,-2 L11.8,-4 L7.4,-1.8 C4.4,-2 2,-3 0,-4
        C-2,-3 -4.4,-2 -7.4,-1.8 L-11.8,-4 L-11.4,-2 L-14.8,-5 L-14.4,-3 Z"/>
      <path class="rk-dog-mantle" d="M-10,-24.6 C-12.6,-19.6 -12,-15 -8,-12 C-4,-10 4,-10 8,-12 C12,-15 12.6,-19.6 10,-24.6 C6.6,-27.6 -6.6,-27.6 -10,-24.6 Z"/>
      <path class="rk-collar" d="M-7.5,-27.4 C-3,-25.6 3,-25.6 7.5,-27.4"/>
      <path class="rk-tail-fill" d="M-2.6,-8.4 C-5,-3 -4.6,2.6 -1.2,8 L0,6.6 L1,9.2 L2.2,7.4 L3.4,8.2 C4.6,4 4.8,-2 3,-8.4 C1,-9.8 -0.8,-9.8 -2.6,-8.4 Z"/>
    </g>`;

  /* coming back to you: face on — big ears, the shepherd's dark forehead
     stripe and muzzle, tongue out, tail going */
  const DOG_FRONT = `
    <g class="rk-bob">
      <g class="rk-front-tail"><path class="rk-tail-fill" d="M7,-24 C14,-27 19,-34 20.5,-42 C18.6,-41 16,-36.5 12.5,-33 C10.5,-30.5 8.6,-28.4 6.6,-27.6 Z"/></g>
      ${LIMB("rk-lb1", "M-7.5,-19 L-8.5,0")}
      ${LIMB("rk-lb2", "M7.5,-19 L8.5,0")}
      <path class="rk-dog-body" d="M-15,-12 C-17,-26 -11,-36 0,-36 C11,-36 17,-26 15,-12 C9,-7 -9,-7 -15,-12 Z"/>
      <path class="rk-dog-mantle" d="M-15,-22 C-15,-31 -9,-36 0,-36 C9,-36 15,-31 15,-22 C11,-28 6,-30 0,-30 C-6,-30 -11,-28 -15,-22 Z"/>
      <path class="rk-face" d="M-11,-51 C-11.4,-58 -6.4,-62 0,-62 C6.4,-62 11.4,-58 11,-51 C10.6,-45 7,-40.5 3.6,-38.6 L-3.6,-38.6 C-7,-40.5 -10.6,-45 -11,-51 Z"/>
      <path class="rk-ear" d="M-10.4,-55 C-12.4,-61 -14,-67 -14.6,-72.8 Q-14.6,-75.2 -12.4,-74.2 C-9,-70.6 -5.8,-66.6 -2.8,-61.8 C-5.6,-60 -8.2,-57.8 -10.4,-55 Z"/>
      <path class="rk-ear" d="M10.4,-55 C12.4,-61 14,-67 14.6,-72.8 Q14.6,-75.2 12.4,-74.2 C9,-70.6 5.8,-66.6 2.8,-61.8 C5.6,-60 8.2,-57.8 10.4,-55 Z"/>
      <path class="rk-ear-in" d="M-9.4,-58.4 C-10.8,-62.6 -12,-66.8 -12.4,-71 C-10,-68.4 -7.6,-65.2 -5.4,-62.2 C-6.8,-61.2 -8.2,-59.8 -9.4,-58.4 Z"/>
      <path class="rk-ear-in" d="M9.4,-58.4 C10.8,-62.6 12,-66.8 12.4,-71 C10,-68.4 7.6,-65.2 5.4,-62.2 C6.8,-61.2 8.2,-59.8 9.4,-58.4 Z"/>
      <path class="rk-dog-mantle" d="M-5,-60.8 C-2,-62.2 2,-62.2 5,-60.8 C3,-58.8 1.4,-56.2 0,-53.2 C-1.4,-56.2 -3,-58.8 -5,-60.8 Z"/>
      <path class="rk-tongue" d="M-2.6,-41.6 C-3,-35.6 3,-35.6 2.6,-41.6 Z"/>
      <path class="rk-mask" d="M-4.6,-49.4 C-5.2,-44.8 -3,-41.2 0,-41.2 C3,-41.2 5.2,-44.8 4.6,-49.4 C2.2,-48.2 -2.2,-48.2 -4.6,-49.4 Z"/>
      <ellipse class="rk-eye-dk" cx="0" cy="-48.6" rx="2.9" ry="2.1"/>
      <ellipse class="rk-nose-hi" cx="-0.9" cy="-49.2" rx="1" ry="0.6"/>
      <circle class="rk-eye-dk" cx="-5" cy="-53.4" r="2.1"/>
      <circle class="rk-eye-dk" cx="5" cy="-53.4" r="2.1"/>
      <circle class="rk-nose-hi" cx="-4.4" cy="-54" r="0.7"/>
      <circle class="rk-nose-hi" cx="5.6" cy="-54" r="0.7"/>
      <path class="rk-collar" d="M-9,-37.4 C-4,-34.4 4,-34.4 9,-37.4"/>
    </g>`;

  /* Side on, facing right. The big tail curling up over the back is the
     whole silhouette — without it a small rodent shape reads as anything. */
  const SQUIRREL = `
    <path class="rk-sq-tail" d="M-7,-4 C-19,-7 -26,-21 -18,-32 C-11,-41 0,-38 4,-31
      C-2,-33 -9,-30 -12,-23 C-15,-15 -11,-8 -4,-5 Z"/>
    <path class="rk-ink rk-thin" d="M-5,-2 L-6,3 M3,-2 L4,3 M-1,-2 L-1,3"/>
    <ellipse class="rk-sq-body" cx="0" cy="-9" rx="9" ry="7"/>
    <circle class="rk-sq-body" cx="9" cy="-15" r="5.4"/>
    <path class="rk-sq-body" d="M13,-16 C17,-15 18,-13 13,-11 Z"/>
    <path class="rk-sq-ear" d="M7,-20 C6,-25 11,-25 10.5,-20 Z"/>
    <circle class="rk-sq-eye" cx="11" cy="-16" r="1.15"/>`;

  /* ---------- the woods ----------
     The same brush language as the ski game's firs and the ranges behind
     (alps.js), minus the snow: tiered boughs in a grey wash over an opaque
     base, each with its inked underside, so a stand of them reads as forest
     rather than a row of road signs. Mixed in: aspens (white trunks, round
     crowns), bushes and boulders. Each is drawn fresh as it comes round. */
  const F1 = (n) => n.toFixed(1);
  function brushD(pts, w0) {
    const A = [], B = [];
    for (let k = 0; k < pts.length; k++) {
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(pts.length - 1, k + 1)];
      let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const t = k / (pts.length - 1);
      const w = w0 * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.6));
      A.push(F1(pts[k][0] - dy * w / 2) + "," + F1(pts[k][1] + dx * w / 2));
      B.push(F1(pts[k][0] + dy * w / 2) + "," + F1(pts[k][1] - dx * w / 2));
    }
    return "M" + A.join("L") + "L" + B.reverse().join("L") + "Z";
  }
  const polyD = (pts) => "M" + pts.map((q) => F1(q[0]) + "," + F1(q[1])).join("L") + "Z";
  // a soft lumpy outline round an ellipse: an aspen's crown, a bush
  function blobD(cx0, cy0, rx, ry, bumps, rnd) {
    const ph = rnd() * TAU, pts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU, k = 1 + 0.1 * Math.sin(a * bumps + ph) + 0.04 * Math.sin(a * 13 + ph * 2);
      pts.push([cx0 + Math.cos(a) * rx * k, cy0 + Math.sin(a) * ry * k]);
    }
    return polyD(pts);
  }

  function treeArt(kind, seed) {
    let n = 0;
    const r = () => wob(seed * 0.731 + (n++) * 3.917, 1);
    if (kind === "aspen") {
      const H = 84 + r() * 22, lean = (r() - 0.5) * 4;
      let marks = "";
      for (let k = 0; k < 4; k++) {
        const y = -10 - k * (H * 0.12) - r() * 6, x = lean * (-y / H) + (r() < 0.5 ? -1 : 1);
        marks += brushD([[x - 2.2, y], [x, y - 1], [x + 2.2, y]], 1.6);
      }
      const trunk = polyD([[-3.2, 1], [lean * 0.5 - 2, -H * 0.55], [lean * 0.5 + 2, -H * 0.55], [3.2, 1]]);
      const crown = blobD(lean * 0.6, -H * 0.66, 19 + r() * 6, 24 + r() * 6, 7, r);
      let leaves = "";
      for (let k = 0; k < 6; k++) {
        const x = lean * 0.6 + (r() - 0.5) * 26, y = -H * 0.66 + (r() - 0.5) * 32;
        leaves += `M${F1(x - 3)},${F1(y)} Q${F1(x)},${F1(y + 3)} ${F1(x + 3)},${F1(y)} `;
      }
      return `<path class="rk-tw-base" d="${trunk}"/><path class="rk-tw-line" d="${trunk}"/><path class="rk-tw-ink" d="${marks}"/>`
        + `<path class="rk-tw-base" d="${crown}"/><path class="rk-tw-wash" d="${crown}"/><path class="rk-tw-line" d="${crown}"/>`
        + `<path class="rk-tw-tick" d="${leaves}"/>`;
    }
    if (kind === "bush") {
      const w = 18 + r() * 12, h = 11 + r() * 6;
      const d = blobD(0, -h * 0.75, w, h, 5, r);
      return `<path class="rk-tw-base" d="${d}"/><path class="rk-tw-wash rk-tw-dark" d="${d}"/><path class="rk-tw-line" d="${d}"/>`
        + `<path class="rk-tw-ink" d="${brushD([[-w * 0.8, -1], [0, 1], [w * 0.8, -1]], 2.4)}"/>`;
    }
    if (kind === "rock") {
      const w = 14 + r() * 10, h = 9 + r() * 7;
      const pts = [[-w, 1], [-w * 0.95, -h * 0.5], [-w * 0.5, -h * (0.9 + r() * 0.2)], [w * (r() - 0.5) * 0.4, -h * 1.05],
        [w * 0.55, -h * (0.8 + r() * 0.2)], [w, -h * 0.35], [w * 0.92, 1]];
      let hatch = "";
      for (let k = 0; k < 4; k++) {
        const x = w * (0.3 + k * 0.15), y = -h * (0.15 + r() * 0.35);
        hatch += `M${F1(x)},${F1(y)} L${F1(x - 3)},${F1(y + 5)} `;
      }
      return `<path class="rk-tw-base" d="${polyD(pts)}"/><path class="rk-tw-line rk-tw-heavy" d="${polyD(pts)}"/><path class="rk-tw-tick" d="${hatch}"/>`;
    }
    // a fir: tier by tier, bottom up, so each tier hangs over the top of the one below
    const spruce = kind === "spruce";
    const H = spruce ? 100 + r() * 22 : 82 + r() * 18;
    const tiers = spruce ? 7 : 5, trunk = 10;
    const w0 = (spruce ? 16 : 24) * (0.88 + r() * 0.24), lean = (r() - 0.5) * 3;
    const trunkD = brushD([[0, 1], [lean * 0.1, -trunk - 3]], 5);
    let out = `<path class="rk-tw-ink" d="${trunkD}"/>`;
    let allBough = "", allLine = "";
    for (let k = 0; k < tiers; k++) {
      const f = k / tiers;
      const yb = -trunk - (H - trunk) * f * 0.9;
      const yt = k === tiers - 1 ? -H : yb - (H - trunk) * (spruce ? 0.3 : 0.4);
      const w = w0 * (1 - f * 0.78) * (0.9 + r() * 0.2), droop = 3 + w * 0.14;
      const ax = lean * (-yt / H), cx0 = lean * (-yb / H);
      const tipL = [cx0 - w, yb + droop], tipR = [cx0 + w, yb + droop], midY = yt + (yb - yt) * 0.55;
      const bough = polyD([[ax, yt], [cx0 - w * 0.55, midY], tipL,
        [cx0 - w * 0.6, yb - 1.5], [cx0 - w * 0.25, yb + droop * 0.6], [cx0, yb - 0.5],
        [cx0 + w * 0.25, yb + droop * 0.6], [cx0 + w * 0.6, yb - 1.5], tipR, [cx0 + w * 0.55, midY]]);
      const edge = "M" + F1(tipL[0]) + "," + F1(tipL[1]) + "L" + F1(cx0 - w * 0.55) + "," + F1(midY)
        + "L" + F1(ax) + "," + F1(yt) + "L" + F1(cx0 + w * 0.55) + "," + F1(midY) + "L" + F1(tipR[0]) + "," + F1(tipR[1]);
      const under = brushD([tipL, [cx0 - w * 0.3, yb + droop * 0.5], [cx0, yb + 0.5], [cx0 + w * 0.3, yb + droop * 0.5], tipR], 2.6);
      // the shaded side: a few needle strokes down the right of the bough
      let shade = "";
      for (let j = 0; j < 3; j++) {
        const t = 0.3 + j * 0.22, x = lerp(ax, tipR[0], t) - 2, y = lerp(yt, tipR[1], t) + 2;
        shade += `M${F1(x)},${F1(y)} L${F1(x - 2)},${F1(y + w * 0.25)} `;
      }
      out += `<path class="rk-tw-base" d="${bough}"/><path class="rk-tw-wash" d="${bough}"/>`
        + `<path class="rk-tw-line" d="${edge}"/><path class="rk-tw-tick" d="${shade}"/><path class="rk-tw-ink" d="${under}"/>`;
      allBough += bough; allLine += edge;
    }
    /* Far off, a fir is a few pixels of grey — so it also comes as three
       paths instead of thirty-odd. The scene repaints every frame (the trail
       moves), and most of the wood is far off at any moment. */
    const lo = `<path class="rk-tw-ink" d="${trunkD}"/><path class="rk-tw-base" d="${allBough}"/>`
      + `<path class="rk-tw-wash" d="${allBough}"/><path class="rk-tw-line" d="${allLine}"/>`;
    return { hi: out, lo };
  }
  const TREE_KINDS = ["fir", "fir", "spruce", "spruce", "fir", "aspen", "aspen", "bush", "rock"];

  /* Is a spot in the woods actually clear of the trail? A tree set off one
     side near a corner can end up standing on the trail after it. */
  function clearOfTrail(wx, wz, s) {
    for (let d = -160; d <= 160; d += STEP) {
      const a = trackAt(s + d);
      if (Math.hypot(a.x - wx, a.z - wz) < HALF_W + 14) return false;
    }
    return true;
  }

  function build() {
    root = document.createElement("div");
    root.id = "runner";
    root.hidden = true;
    root.innerHTML = `
      <div id="rkBack" aria-hidden="true"></div>
      <svg id="rkSvg" aria-hidden="true">
        <rect id="rkSky" x="0" y="0" width="100%" height="100%"/>
        <g id="rkFar"></g>
        <path id="rkTrail" class="rk-trail"/>
        <path id="rkEdgeL" class="rk-edge"/>
        <path id="rkEdgeR" class="rk-edge"/>
        <path id="rkMid" class="rk-lane"/>
        <path id="rkPebbles" class="rk-pebble"/>
        <path id="rkTuftsFar" class="rk-tuft rk-tuft-far"/>
        <path id="rkTufts" class="rk-tuft"/>
        <g id="rkTrees"></g>
        <g id="rkObs"></g>
        <g id="rkSigns"></g>
        <g id="rkSquirrel">${SQUIRREL}</g>
        <ellipse id="rkShadow" class="rk-shadow" cx="0" cy="0" rx="17" ry="4.6"/>
        <g id="rkDust" class="rk-dust">
          <circle r="4" style="--dx:-16px;--dy:-5px"/><circle r="3.2" style="--dx:15px;--dy:-6px"/>
          <circle r="2.6" style="--dx:-7px;--dy:-10px"/><circle r="3" style="--dx:8px;--dy:-11px"/>
        </g>
        <g id="rkDog">${DOG_RUN}</g>
        <g id="rkDogSploot">${DOG_SPLOOT}</g>
        <g id="rkDogFront">${DOG_FRONT}</g>
      </svg>
      <p class="rk-dist"><span id="rkDist">0</span> m</p>
      <p class="rk-pb" id="rkPB" hidden></p>
      <button class="rk-quit" id="rkQuit" aria-label="Call Felix back and return to the map">esc</button>
      <p class="rk-shout" id="rkShout" hidden></p>
      <p class="rk-tip" id="rkTip" hidden></p>
      <div class="rk-over" id="rkOver" hidden>
        <div class="rk-stamp">
          <p class="rk-over-why" id="rkWhy"></p>
          <p class="rk-over-dist"><span id="rkFinal">0</span> m</p>
          <p class="rk-over-best" id="rkBest"></p>
          <button class="rk-call" id="rkAgain">go again</button>
          <div class="rk-timer"><i id="rkTimerBar"></i></div>
        </div>
      </div>
      <p class="rk-help">← → corner · ↑ jump · ↓ sploot</p>
    `;
    document.body.appendChild(root);

    svg = $("#rkSvg", root);
    Lr = {
      far: $("#rkFar", root), back: $("#rkBack", root), trail: $("#rkTrail", root),
      edgeL: $("#rkEdgeL", root), edgeR: $("#rkEdgeR", root), mid: $("#rkMid", root),
      trees: $("#rkTrees", root), obs: $("#rkObs", root), signs: $("#rkSigns", root),
      dog: $("#rkDog", root), sploot: $("#rkDogSploot", root), front: $("#rkDogFront", root),
      sq: $("#rkSquirrel", root), shout: $("#rkShout", root), tip: $("#rkTip", root),
      bar: $("#rkTimerBar", root),
      shadow: $("#rkShadow", root), dust: $("#rkDust", root),
      tufts: $("#rkTufts", root), tuftsFar: $("#rkTuftsFar", root), pebbles: $("#rkPebbles", root),
      // everything that keeps time with his stride, so it all speeds up together
      legs: root.querySelectorAll(".rk-lf1, .rk-lf2, .rk-lb1, .rk-lb2, .rk-bob, .rk-ear-l, .rk-ear-r"),
    };
    distEl = $("#rkDist", root);
    pbEl = $("#rkPB", root);
    overBox = $("#rkOver", root);

    for (let i = 0; i < TREE_N; i++) {
      const g = ns("g", { class: "rk-tree" });
      Lr.trees.prepend(g);
      trees.push({ el: g, s: 0, side: 1, off: 0, ok: true });
    }
    for (let i = 0; i < MARK_N; i++) marks.push({ s: 0, off: 0, kind: 0 });
    for (let i = 0; i < 4; i++) {
      const g = ns("g", { class: "rk-sign" });
      g.appendChild(ns("path", { d: "M0,0 L0,-46", class: "rk-ink rk-thick" }));
      g.appendChild(ns("path", { d: "M-30,-76 L18,-76 L34,-62 L18,-48 L-30,-48 Z", class: "rk-sign-board" }));
      g.appendChild(ns("path", { d: "M-16,-62 L8,-62 M0,-70 L10,-62 L0,-54", class: "rk-sign-arrow" }));
      g.style.display = "none";
      Lr.signs.appendChild(g);
    }
    for (let i = 0; i < 6; i++) {
      const g = ns("g", { class: "rk-obst" });
      g.innerHTML = `
        <g class="ob-log">
          <path class="log-body"/>
          <path class="log-grain"/>
          <path class="log-cap-l"/><path class="log-cap-r"/>
          <path class="log-ring-l"/><path class="log-ring-r"/>
        </g>
        <g class="ob-branch">
          <path class="br-trunk"/>
          <path class="br-limb"/>
          <path class="br-twigs"/>
          <path class="br-fol-base"/><path class="br-fol"/>
        </g>`;
      g.style.display = "none";
      Lr.obs.appendChild(g);
    }

    $("#rkQuit", root).addEventListener("click", () => startRecall());
    $("#rkAgain", root).addEventListener("click", () => { clearTimeout(overTimer); reset(); });

    if (TOUCH.matches) {
      // no keyboard here: the footer teaches swipes, and "esc" would be a lie
      $(".rk-help", root).textContent = "swipe — ← → corner · ↑ jump · ↓ sploot";
      $("#rkQuit", root).textContent = "✕";
    }
  }

  function measure() {
    const r = root.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width));
    H = Math.max(360, Math.round(r.height));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    cx = W / 2; horizonY = H * 0.40;
    drawFar();
  }

  /* The skyline is the ski game's own ranges (alps.js), as a strip exactly
     one full turn (2π × FOCAL px) long, so it comes round again when he
     does — and it slides across as the trail bends, which the old static
     zigzag never did. It lives in its own <svg> moved by a CSS transform,
     so turning composites instead of repainting every peak. Until alps.js
     has arrived, the old pencil zigzag stands in. */
  let band = null, bandP = 0, bandK = 1, bandX0 = 0, bandTx = NaN;
  function drawFar() {
    Lr.far.replaceChildren();
    Lr.back.replaceChildren();
    band = null; bandTx = NaN;
    if (window.Alps && Alps.band) {
      const hs = clamp(H / 900, 0.75, 1.25) * 0.52;
      const extra = Math.ceil((W + 700) / 520) + 1;
      // the far peaks, the nearer range, and a band of forested hills along
      // the horizon itself so the land doesn't stop dead at the skyline
      const b = Alps.band(7919, { chunks: 6, extra, VH: H,
        layers: { far: { hs }, mid: { hs: hs * 0.85 }, near: { hs: hs * 0.95 } } });
      bandK = (TAU * FOCAL) / b.period;
      bandP = TAU * FOCAL;
      const u0 = -2 * b.cw, uw = (2 + 6 + extra) * b.cw, hgt = horizonY + 6;
      bandX0 = u0 * bandK;
      band = ns("svg", {
        class: "rk-band", width: F1(uw * bandK), height: F1(hgt),
        viewBox: `${u0} ${F1(-horizonY / bandK)} ${uw} ${F1(hgt / bandK)}`,
      });
      band.innerHTML = `<g class="sk-alp-far" transform="translate(0,${F1(-H * 0.035 / bandK)})">${b.layers.far}</g>`
        + `<g class="sk-alp-mid">${b.layers.mid}</g><g class="sk-alp-near">${b.layers.near}</g>`;
      Lr.back.appendChild(band);
      placeBand();
      return;
    }
    for (const [depth, cls] of [[0.55, "rk-far rk-far-back"], [1, "rk-far"]]) {
      const peaks = []; let x = -40, i = depth * 100;
      while (x < W + 40) {
        const w = 70 + wob(i, 130), h = (22 + wob(i + 7, 62)) * depth;
        peaks.push(`L${(x + w * 0.45).toFixed(0)},${(horizonY - h).toFixed(0)} L${(x + w).toFixed(0)},${horizonY.toFixed(0)}`);
        x += w; i++;
      }
      Lr.far.appendChild(ns("path", { d: `M-40,${horizonY} ${peaks.join(" ")}`, class: cls }));
    }
    Lr.far.appendChild(ns("path", { d: `M0,${horizonY.toFixed(1)} L${W},${horizonY.toFixed(1)}`, class: "rk-horizon" }));
  }
  // a direction you face is a place on the strip: turn right, it slides left
  function placeBand() {
    if (!band) return;
    let tx = -((camYaw * FOCAL) % bandP);
    if (tx > 0) tx -= bandP;
    tx = Math.round(tx * 2) / 2;
    if (tx === bandTx) return;
    bandTx = tx;
    band.style.transform = `translate3d(${(tx + bandX0).toFixed(1)}px,0,0)`;
  }

  function placeTree(t, s, i) {
    t.s = s;
    const seed = s * 0.37 + i * 7.1;
    const kind = TREE_KINDS[Math.floor(wob(seed, TREE_KINDS.length))];
    const small = kind === "bush" || kind === "rock";
    t.side = wob(seed + 3, 1) < 0.5 ? -1 : 1;
    // most trees crowd the trail's edge; a few stand back to give the wood depth
    const back = wob(seed + 5, 1);
    t.off = HALF_W + (small ? 7 + back * 26 : 12 + back * back * 130);
    const a = trackAt(s), rx = Math.cos(a.th), rz = -Math.sin(a.th);
    t.wx = a.x + rx * t.off * t.side;
    t.wz = a.z + rz * t.off * t.side;
    t.ok = clearOfTrail(t.wx, t.wz, s);
    const art = t.ok ? treeArt(kind, seed) : "";
    // firs come in two levels of detail; everything else is simple already
    t.el.innerHTML = typeof art === "string" ? art
      : `<g class="rk-lod-hi">${art.hi}</g><g class="rk-lod-lo">${art.lo}</g>`;
    t.hi = t.el.querySelector(".rk-lod-hi");
    t.lo = t.el.querySelector(".rk-lod-lo");
    t.near = null;
  }
  // a pebble on the trail, or a tuft of grass along its edges
  function placeMark(m, s, i) {
    m.s = s;
    const r = wob(s * 0.53 + i * 2.7, 1);
    if (r < 0.26) { m.kind = 1; m.off = (wob(s * 0.91 + i, 2) - 1) * HALF_W * 0.8; }
    else { m.kind = 0; m.off = (r < 0.63 ? -1 : 1) * (HALF_W + 1 + wob(s * 0.77 + i, 17)); }
  }

  /* ---------- a run ---------- */

  function reset() {
    resetTrack();
    pS = prevS = 0; speed = 0;
    jumpT = duckT = -1;
    squirrel = { s: 90, off: 0, gone: false, fade: 1 };
    const a = trackAt(0);
    px = a.x; pz = a.z; pth = a.th;
    camYaw = pth;
    camX = px - Math.sin(camYaw) * CAM_BACK;
    camZ = pz - Math.cos(camYaw) * CAM_BACK;
    trees.forEach((t, i) => placeTree(t, 60 + i * TREE_GAP + wob(i * 1.3, 14), i));
    // farthest first in the DOM, so nearer trees stand in front of farther ones
    trees.slice().sort((a, b) => b.s - a.s).forEach((t) => Lr.trees.appendChild(t.el));
    marks.forEach((m, i) => placeMark(m, -40 + i * MARK_GAP, i));
    Lr.dust.classList.remove("on");
    overBox.hidden = true;
    root.classList.remove("rk-done");
    taught = {}; tipT = 0; Lr.tip.hidden = true;
    distEl.textContent = "0";
    pbMark = best();
    pbBeaten = false;
    pbEl.hidden = pbMark <= 0;                 // "best 0 m" is just noise
    pbEl.textContent = `best ${pbMark} m`;
    pbEl.classList.remove("rk-pb-hit");
    Lr.shout.hidden = false;
    Lr.shout.textContent = "after him!";
    setMode("intro");
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function setMode(m) { mode = m; modeT = 0; root.dataset.mode = m; }

  /* ---------- input ---------- */

  function turn(dir) {
    if (mode !== "run") return;
    const c = corners[ci];
    if (!c || c.taken || pS < c.s - windowIn()) return;
    if (dir === c.dir) c.taken = true; else finish("wrong way");
  }
  function jump() { if (mode === "run" && jumpT < 0 && duckT < 0) jumpT = 0; }
  function duck() { if (mode === "run" && duckT < 0 && jumpT < 0) duckT = 0; }

  function onKey(e) {
    // leave the browser's own shortcuts alone (Cmd+S, Ctrl+A...)
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") { startRecall(); return; }
    /* a held key auto-repeats; one press is one action, or holding an arrow
       through a corner turns again at the next one and calls it wrong way */
    if (e.repeat) { if (/^Arrow| $|^[wasdWASD]$/.test(e.key)) e.preventDefault(); return; }
    switch (e.key) {
      case "ArrowLeft": case "a": case "A": turn(-1); break;
      case "ArrowRight": case "d": case "D": turn(1); break;
      case "ArrowUp": case "w": case "W": case " ": jump(); break;
      case "ArrowDown": case "s": case "S": duck(); break;
      default: return;
    }
    e.preventDefault();
  }
  /* Touch: the gesture fires the moment the finger has travelled far enough —
     mid-swipe, finger still down. Waiting for the lift (the old way) added a
     beat of lag that felt unfair at speed. One action per touch; whatever the
     finger does after the swipe registers is ignored until it lifts. */
  let tx = null, ty = null, swiped = false;
  const SWIPE_PX = 28;

  function classifySwipe(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1);
    else if (dy < 0) jump(); else duck();
  }
  function onTouchStart(e) {
    const t = e.changedTouches[0];
    tx = t.clientX; ty = t.clientY; swiped = false;
  }
  function onTouchMove(e) {
    e.preventDefault();               // no pull-to-refresh, no rubber-banding
    if (tx === null || swiped) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    swiped = true;
    classifySwipe(dx, dy);
  }
  function onTouchEnd(e) {
    // a quick flick can lift before any touchmove crossed the threshold
    if (tx === null || swiped) { tx = ty = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    tx = ty = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    classifySwipe(dx, dy);
  }

  /* ---------- frame ---------- */

  const lift = () => jumpT < 0 ? 0
    : JUMP_LIFT * Math.sin(Math.PI * clamp(jumpT / (JUMP_MS / 1000), 0, 1));

  /* Teach each control the first time it's actually needed, rather than
     dumping the lot on a title card nobody reads. */
  let taught = {}, tipT = 0;
  function say(key, text, secs) {
    if (taught[key]) return;
    taught[key] = true;
    Lr.tip.textContent = text;
    Lr.tip.hidden = false;
    tipT = secs;
  }
  function teach() {
    if (tipT > 0) return;
    if (taught.log && taught.branch) return;   // all taught: stop scanning the obstacles
    const sw = TOUCH.matches;   // thumbs get swipe words, not key glyphs
    // the whole scheme up front, then each one again when it first matters
    if (!taught.all) {
      say("all", sw ? "swipe — ← → corners · ↑ jump · ↓ sploot"
                    : "← → corners · ↑ jump · ↓ sploot", 4);
      return;
    }
    if (!taught.corner) {
      say("corner", sw ? "swipe ← or → to take the corners"
                       : "← → to take the corners", 3.2);
      return;
    }
    const soon = (kind) => obstacles.some(
      (o) => !o.passed && o.kind === kind && o.s - pS > 40 && o.s - pS < SEE_AHEAD);
    if (soon("log")) {
      say("log", sw ? "swipe up to jump the log" : "↑ to jump the log", 3.2);
      return;
    }
    if (soon("branch")) {
      say("branch", sw ? "swipe down to sploot under the branch"
                       : "↓ to sploot under the branch", 3.4);
    }
  }

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    modeT += dt;
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) Lr.tip.hidden = true; }

    if (mode === "intro") {
      const t = clamp(modeT / (INTRO_MS / 1000), 0, 1);
      speed = SPEED_0 * t * t;                 // he winds up
      pS += speed * dt;
      /* It outruns him straight up the trail and fades into the distance —
         veering off to one side while he carried on made no sense. */
      squirrel.s = pS + lerp(70, 430, t * t);
      squirrel.off = Math.sin(modeT * 5.2) * 7 * (1 - t);
      squirrel.fade = clamp(1 - (t - 0.45) / 0.5, 0, 1);
      if (t >= 1) { squirrel.gone = true; Lr.shout.hidden = true; setMode("run"); }
    } else if (mode === "run") {
      speed = lerp(SPEED_0, SPEED_TOP, Math.min(1, pS / SPEED_OVER));
      prevS = pS; pS += speed * dt;
      extend();
      if (jumpT >= 0) { jumpT += dt; if (jumpT > JUMP_MS / 1000) { jumpT = -1; poof(); } }
      if (duckT >= 0) { duckT += dt; if (duckT > DUCK_MS / 1000) duckT = -1; }

      teach();

      const c = corners[ci];
      if (c) { if (c.taken) ci++; else if (pS > c.s + 12) finish("missed the turn"); }

      if (mode === "run") {
        const low = lift(), high = low + (duckT >= 0 ? DUCK_H : STAND_H);
        for (const o of obstacles) {
          if (o.passed || o.s <= prevS || o.s > pS) continue;
          o.passed = true;
          const band = o.kind === "log" ? LOG : BRANCH;
          if (high > band.y0 && low < band.y1) {
            finish(o.kind === "log" ? "clipped a log" : "caught a branch");
            break;
          }
        }
      }
      const metresNow = Math.floor(pS / 4);
      if (distEl.textContent !== String(metresNow)) distEl.textContent = metresNow;
      if (pbMark > 0 && !pbBeaten && metresNow > pbMark) {
        pbBeaten = true;                        // once, not every frame
        pbEl.textContent = "new best!";
        pbEl.classList.add("rk-pb-hit");
      }
    } else if (mode === "recall") {
      const t = clamp(modeT / (RECALL_MS / 1000), 0, 1);
      if (t >= 1) { quit(); return; }
    }

    if (mode !== "recall") {
      const a = trackAt(pS);
      px = a.x; pz = a.z; pth = a.th;
      camYaw += wrapAngle(pth - camYaw) * Math.min(1, dt / CAM_SWING);
      camX = px - Math.sin(camYaw) * CAM_BACK;
      camZ = pz - Math.cos(camYaw) * CAM_BACK;
    }

    draw();
    raf = requestAnimationFrame(tick);
  }

  function poof() {
    const g = project(px, pz, 0);
    if (!g) return;
    Lr.dust.setAttribute("transform", `translate(${P(g)}) scale(${(g.s * 0.24).toFixed(3)})`);
    Lr.dust.classList.remove("on");
    void Lr.dust.getBoundingClientRect();    // restart the puff
    Lr.dust.classList.add("on");
  }

  /* ---------- drawing ---------- */

  /* a quad that's thick at one end and thin at the other */
  function taper(a, b, wa, wb) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    return `M${(a.x + nx * wa).toFixed(1)},${(a.y + ny * wa).toFixed(1)}` +
           ` L${(b.x + nx * wb).toFixed(1)},${(b.y + ny * wb).toFixed(1)}` +
           ` L${(b.x - nx * wb).toFixed(1)},${(b.y - ny * wb).toFixed(1)}` +
           ` L${(a.x - nx * wa).toFixed(1)},${(a.y - ny * wa).toFixed(1)} Z`;
  }
  /* an ellipse as a path, so it can sit at any angle without a transform */
  function ovalPath(c, ux, uy, vx, vy) {
    const k = 0.5523;
    const p = (sx, sy) => `${(c.x + ux * sx + vx * sy).toFixed(1)},${(c.y + uy * sx + vy * sy).toFixed(1)}`;
    return `M${p(0, 1)} C${p(k, 1)},${p(1, k)},${p(1, 0)}` +
           ` C${p(1, -k)},${p(k, -1)},${p(0, -1)}` +
           ` C${p(-k, -1)},${p(-1, -k)},${p(-1, 0)}` +
           ` C${p(-1, k)},${p(-k, 1)},${p(0, 1)} Z`;
  }

  function drawObstacle(el, o) {
    const band = o.kind === "log" ? LOG : BRANCH;
    const [bl, br] = span(o.s, band.y0);
    const [tl, tr] = span(o.s, band.y1);
    if (!bl || !br || !tl || !tr) { el.style.display = "none"; return false; }
    el.style.display = "";
    el.setAttribute("class", "rk-obst rk-obst-" + o.kind);
    const isLog = o.kind === "log";
    el.querySelector(".ob-log").style.display = isLog ? "" : "none";
    el.querySelector(".ob-branch").style.display = isLog ? "none" : "";

    // the log's axis runs across the trail; "up" is the band's own height
    const A = midP(bl, tl), B = midP(br, tr);       // the two ends
    const upx = (tl.x - bl.x) / 2, upy = (tl.y - bl.y) / 2;
    const alongLen = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const ax = (B.x - A.x) / alongLen, ay = (B.y - A.y) / alongLen;

    if (isLog) {
      const q = el.querySelector.bind(el);
      // trunk body, with the top bowed so it reads round rather than boxy
      const midTop = { x: (tl.x + tr.x) / 2 + upx * 0.22, y: (tl.y + tr.y) / 2 + upy * 0.22 };
      q(".log-body").setAttribute("d",
        `M${P(bl)} L${P(br)} L${P(tr)} Q${P(midTop)} ${P(tl)} Z`);
      // sawn ends: the single clearest signal that this is a log
      const capW = Math.max(2.2, alongLen * 0.055);
      q(".log-cap-l").setAttribute("d", ovalPath(A, ax * capW, ay * capW, upx, upy));
      q(".log-cap-r").setAttribute("d", ovalPath(B, ax * capW, ay * capW, upx, upy));
      q(".log-ring-l").setAttribute("d", ovalPath(A, ax * capW * 0.5, ay * capW * 0.5, upx * 0.5, upy * 0.5));
      q(".log-ring-r").setAttribute("d", ovalPath(B, ax * capW * 0.5, ay * capW * 0.5, upx * 0.5, upy * 0.5));
      // bark grain running the length
      let g = "";
      for (const [f0, f1, h] of [[0.16, 0.42, 0.34], [0.52, 0.78, -0.22], [0.3, 0.62, -0.62]]) {
        const s0 = lerpP(A, B, f0), s1 = lerpP(A, B, f1);
        g += `M${(s0.x + upx * h).toFixed(1)},${(s0.y + upy * h).toFixed(1)}` +
             ` L${(s1.x + upx * h).toFixed(1)},${(s1.y + upy * h).toFixed(1)} `;
      }
      q(".log-grain").setAttribute("d", g);
      q(".log-grain").setAttribute("stroke-width", Math.max(0.8, alongLen * 0.012).toFixed(1));
    } else {
      const q = el.querySelector.bind(el);
      // the limb comes in off a tree at one side and thins as it reaches over
      const side = (Math.floor(o.s) % 2) ? 1 : -1;
      const root = side > 0 ? lerpP(A, B, 1.08) : lerpP(A, B, -0.08);
      const tip  = side > 0 ? lerpP(A, B, -0.04) : lerpP(A, B, 1.04);
      const thick = Math.max(2, Math.hypot(upx, upy) * 0.28);

      // a sagging spine, sampled so the taper curves instead of kinking
      const spine = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7, p = lerpP(root, tip, t), sag = Math.sin(Math.PI * t) * 0.26;
        spine.push({ x: p.x - upx * sag, y: p.y - upy * sag });
      }
      const L2 = [], R2 = [];
      for (let i = 0; i < spine.length; i++) {
        const t = i / (spine.length - 1);
        const w = lerp(thick, thick * 0.26, t);
        const a2 = spine[Math.max(0, i - 1)], b2 = spine[Math.min(spine.length - 1, i + 1)];
        const dx = b2.x - a2.x, dy = b2.y - a2.y, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        L2.push({ x: spine[i].x + nx * w, y: spine[i].y + ny * w });
        R2.push({ x: spine[i].x - nx * w, y: spine[i].y - ny * w });
      }
      q(".br-limb").setAttribute("d",
        `M${L2.map(P).join(" L")} L${R2.reverse().map(P).join(" L")} Z`);

      /* The tree it grows from, standing just off the trail on that side —
         without one the limb floated, a plank in mid-air. */
      const [gl, gr] = span(o.s, 0), [ul, ur] = span(o.s, BRANCH.y1 + 16);
      if (gl && gr && ul && ur) {
        const f = side > 0 ? 1.12 : -0.12;
        const foot = lerpP(gl, gr, f), top = lerpP(ul, ur, f);
        q(".br-trunk").setAttribute("d", taper(foot, top, thick * 1.5, thick * 0.9));
      } else q(".br-trunk").setAttribute("d", "");

      // twigs reaching up and out along the limb, each ending in a clump of leaves
      let tw = "", fol = "";
      const twigs = [[0.22, -0.5, 1.0], [0.42, 0.45, 0.8], [0.62, -0.35, 0.9], [0.84, 0.5, 0.7]];
      for (const [f, lean, len] of twigs) {
        const i = Math.round(f * (spine.length - 1));
        const from = spine[i];
        const to = {
          x: from.x + upx * 0.55 * len + ax * lean * alongLen * 0.08,
          y: from.y + upy * 0.55 * len + ay * lean * alongLen * 0.08,
        };
        tw += `M${P(from)} L${P(to)} `;
        const r = Math.hypot(upx, upy) * 0.34 * len;
        fol += ovalPath(to, ax * r * 1.4, ay * r * 1.4, upx / Math.hypot(upx, upy) * r, upy / Math.hypot(upx, upy) * r) + " ";
      }
      // and a couple of clumps hanging off the underside near the tip
      for (const f of [0.7, 0.92]) {
        const p = spine[Math.round(f * (spine.length - 1))];
        const r = Math.hypot(upx, upy) * 0.22;
        fol += ovalPath({ x: p.x - upx * 0.18, y: p.y - upy * 0.18 }, ax * r * 1.5, ay * r * 1.5, upx / Math.hypot(upx, upy) * r, upy / Math.hypot(upx, upy) * r) + " ";
      }
      q(".br-twigs").setAttribute("d", tw);
      q(".br-twigs").setAttribute("stroke-width", Math.max(1, thick * 0.4).toFixed(1));
      q(".br-fol-base").setAttribute("d", fol);
      q(".br-fol").setAttribute("d", fol);
    }
    return true;
  }

  function draw() {
    const pts = (arr) => arr.map(P).join(" L");

    const left = [], right = [], mid = [];
    for (let d = -44; d < SEE_AHEAD; d += STEP) {
      const [l, r] = span(pS + d, 0);
      if (l && r) { left.push(l); right.push(r); }
      const a = trackAt(pS + d), m = project(a.x, a.z, 0);
      if (m) mid.push(m);
    }
    if (left.length > 1) {
      Lr.trail.setAttribute("d", `M${pts(left)} L${pts(right.slice().reverse())} Z`);
      Lr.edgeL.setAttribute("d", `M${pts(left)}`);
      Lr.edgeR.setAttribute("d", `M${pts(right)}`);
    }
    Lr.mid.setAttribute("d", mid.length > 1 ? `M${pts(mid)}` : "");

    const obEls = Lr.obs.children;
    let oi = 0;
    for (const o of obstacles) {
      if (oi >= obEls.length) break;
      const ahead = o.s - pS;
      if (o.passed || ahead < 2 || ahead > SEE_AHEAD) continue;
      if (drawObstacle(obEls[oi], o)) oi++;
    }
    for (; oi < obEls.length; oi++) obEls[oi].style.display = "none";

    const sEls = Lr.signs.children;
    let si = 0;
    for (let k = ci; k < corners.length && si < sEls.length; k++) {
      const c = corners[k], ahead = c.s - pS;
      if (ahead < -30 || ahead > SEE_AHEAD) continue;
      const a = trackAt(c.s), rx = Math.cos(a.th), rz = -Math.sin(a.th);
      const off = (HALF_W + 15) * -c.dir;
      const p = project(a.x + rx * off, a.z + rz * off, 0);
      const el = sEls[si];
      if (!p) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.setAttribute("transform", `translate(${P(p)}) scale(${(p.s * 0.4).toFixed(3)})`);
      el.children[1].setAttribute("transform", c.dir < 0 ? "scale(-1,1)" : "");
      el.children[2].setAttribute("transform", c.dir < 0 ? "scale(-1,1)" : "");
      el.classList.toggle("rk-sign-live", pS > c.s - windowIn() && !c.taken);
      si++;
    }
    for (; si < sEls.length; si++) sEls[si].style.display = "none";

    placeBand();

    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.s < pS - 30) { placeTree(t, t.s + TREE_N * TREE_GAP, i); Lr.trees.prepend(t.el); }
      const p = t.ok && project(t.wx, t.wz, 0);
      if (!p) { t.el.style.display = "none"; continue; }
      t.el.style.display = "";
      const k = p.s * 0.32;
      t.el.setAttribute("transform", `translate(${P(p)}) scale(${k.toFixed(3)})`);
      t.el.style.opacity = clamp(p.s * 1.6, 0, 1).toFixed(2);
      const near = k > 0.55;
      if (t.hi && near !== t.near) {
        t.near = near;
        t.hi.style.display = near ? "" : "none";
        t.lo.style.display = near ? "none" : "";
      }
    }

    // grass and pebbles: near ones heavier, far ones fainter
    let tn = "", tf = "", pb = "";
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (m.s < pS - 50) placeMark(m, m.s + MARK_N * MARK_GAP, i);
      const ahead = m.s - pS;
      if (ahead > 320) continue;
      const a = trackAt(m.s);
      const p = project(a.x + Math.cos(a.th) * m.off, a.z - Math.sin(a.th) * m.off, 0);
      if (!p) continue;
      const k = p.s * 0.42;
      if (m.kind) { pb += ovalPath(p, 2.4 * k, 0, 0, 1.1 * k) + " "; continue; }
      const tuft = `M${F1(p.x - 3 * k)},${F1(p.y)}L${F1(p.x - 5.5 * k)},${F1(p.y - 6.5 * k)}`
        + `M${F1(p.x)},${F1(p.y)}L${F1(p.x + 0.6 * k)},${F1(p.y - 8.5 * k)}`
        + `M${F1(p.x + 3 * k)},${F1(p.y)}L${F1(p.x + 5.6 * k)},${F1(p.y - 5.6 * k)}`;
      if (ahead < 110) tn += tuft; else tf += tuft;
    }
    Lr.tufts.setAttribute("d", tn);
    Lr.tuftsFar.setAttribute("d", tf);
    Lr.pebbles.setAttribute("d", pb);

    // the squirrel, only during the chase
    if (mode === "intro" && !squirrel.gone) {
      const a = trackAt(squirrel.s), rx = Math.cos(a.th), rz = -Math.sin(a.th);
      const p = project(a.x + rx * squirrel.off, a.z + rz * squirrel.off, 0);
      if (p) {
        Lr.sq.style.display = "";
        Lr.sq.setAttribute("transform", `translate(${P(p)}) scale(${(p.s * 0.3).toFixed(3)})`);
        Lr.sq.style.opacity = (squirrel.fade == null ? 1 : squirrel.fade).toFixed(2);
      } else Lr.sq.style.display = "none";
    } else Lr.sq.style.display = "none";

    // Felix — running, splooted, or coming back
    const ducking = duckT >= 0;
    const recalling = mode === "recall";
    const rT = recalling ? clamp(modeT / (RECALL_MS / 1000), 0, 1) : 0;
    const goingOn = recalling && rT < RECALL_TURN;   // still seen from behind

    Lr.dog.style.display = (recalling ? goingOn : !ducking) ? "" : "none";
    Lr.sploot.style.display = !recalling && ducking ? "" : "none";
    Lr.front.style.display = recalling && !goingOn ? "" : "none";

    if (recalling) {
      let zc, ease;
      if (goingOn) {
        // pulls up as he goes, so the turn lands on a decelerating beat
        const k = rT / RECALL_TURN;
        ease = 1 - Math.pow(1 - k, 2);
        zc = lerp(recallZ0, RECALL_Z_FAR, ease);
      } else {
        const k = (rT - RECALL_TURN) / (1 - RECALL_TURN);
        ease = 1 - Math.pow(1 - k, 2.2);
        zc = lerp(RECALL_Z_FAR, RECALL_Z_NEAR, ease);
      }
      /* on the trail at that distance — the screen's middle is only the
         trail's middle on a straight, and on a bend he trotted home across
         the grass */
      const tr = trackAt(pS + zc - CAM_BACK), on = project(tr.x, tr.z, 0);
      const mid = on ? on.x : cx;
      const x = goingOn ? lerp(recallX0, mid, ease) : mid;
      const s = FOCAL / zc, gy = horizonY + (CAM_HEIGHT / zc) * FOCAL;
      (goingOn ? Lr.dog : Lr.front).setAttribute("transform",
        `translate(${x.toFixed(1)},${gy.toFixed(1)}) scale(${(s * 0.24).toFixed(3)})`);
      Lr.shadow.setAttribute("transform", `translate(${x.toFixed(1)},${gy.toFixed(1)}) scale(${(s * 0.24).toFixed(3)})`);
      Lr.shadow.style.opacity = "";
      setCadence(goingOn ? 230 : 150);
    } else {
      const shown = ducking ? Lr.sploot : Lr.dog;
      const pd = project(px, pz, lift()), gd = project(px, pz, 0);
      if (pd) shown.setAttribute("transform", `translate(${P(pd)}) scale(${(pd.s * 0.24).toFixed(3)})`);
      else shown.style.display = "none";
      // his shadow stays on the ground, shrinking and fading as he leaves it
      if (gd) {
        const up = lift() / JUMP_LIFT;
        Lr.shadow.setAttribute("transform", `translate(${P(gd)}) scale(${(gd.s * 0.24 * (1 - up * 0.3)).toFixed(3)})`);
        Lr.shadow.style.opacity = (1 - up * 0.55).toFixed(2);
      }
      setCadence(clamp(330 - (speed - SPEED_0) * 0.55, 165, 330));
    }
  }

  /* Legs speed up by PLAYBACK RATE, never by rewriting the CSS duration:
     a new duration keeps the elapsed time, so every 1 ms change jumped the
     stride to a new phase — a visible stutter several times a second while
     he speeds up. A rate change carries on from where the stride is. Re-
     applied every so often too, for legs that only just appeared (a pose
     swap starts a fresh animation at rate 1). */
  let cadRate = 1, cadTick = 0;
  function setCadence(ms) {
    const rate = 320 / ms;                      // 320 ms is the CSS default
    if (++cadTick % 20 && Math.abs(rate - cadRate) < 0.015) return;
    cadRate = rate;
    for (const el of Lr.legs) for (const a of el.getAnimations()) {
      if (a.updatePlaybackRate) a.updatePlaybackRate(rate); else a.playbackRate = rate;
    }
  }

  /* ---------- ending ---------- */

  function finish(why) {
    if (mode !== "run") return;
    setMode("over");
    root.classList.add("rk-done");

    const metres = Math.floor(pS / 4);
    let best = 0;
    try { best = parseInt(localStorage.getItem("fieldnotes-run-best") || "0", 10) || 0; } catch (_) {}
    const isBest = metres > best;
    if (isBest) { best = metres; try { localStorage.setItem("fieldnotes-run-best", String(best)); } catch (_) {} }

    $("#rkWhy", root).textContent = why;
    $("#rkFinal", root).textContent = metres;
    $("#rkBest", root).textContent = isBest && metres > 0 ? "a new best" : `best ${best} m`;
    overBox.hidden = false;
    Lr.bar.style.animation = "none";
    void Lr.bar.offsetWidth;
    Lr.bar.style.animation = `rk-drain ${OVER_WAIT_MS}ms linear forwards`;

    if (typeof window.onRunFinished === "function") window.onRunFinished(best);
    overTimer = setTimeout(() => startRecall(), OVER_WAIT_MS);
  }

  /* he comes trotting back to you, then the map */
  function startRecall() {
    clearTimeout(overTimer);
    if (mode === "recall") { quit(); return; }   // esc again skips the walk-back
    overBox.hidden = true;
    Lr.shout.hidden = false;
    Lr.shout.textContent = "Felix! here boy —";
    /* Take the baton from wherever he actually is — mid-corner he won't be
       centred, and starting anywhere else is the jump we're avoiding. */
    const here = project(px, pz, lift());
    recallX0 = here ? here.x : cx;
    recallZ0 = here ? FOCAL / here.s : CAM_BACK;
    setMode("recall");
    if (raf === 0) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function quit() {
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(overTimer);
    mode = "idle";
    overBox.hidden = true;
    Lr.shout.hidden = true;
    root.hidden = true;
    removeEventListener("keydown", onKey, true);
    root.removeEventListener("touchstart", onTouchStart);
    root.removeEventListener("touchmove", onTouchMove);
    root.removeEventListener("touchend", onTouchEnd);
    removeEventListener("resize", measure);
    document.body.classList.remove("running-game");
    if (onExit) onExit();
  }

  function start(opts) {
    if (!root) build();
    onExit = (opts && opts.onExit) || null;
    // the map at night runs into a trail at night (the palette is in CSS)
    root.classList.toggle("rk-night", !!(opts && opts.night));
    root.hidden = false;
    document.body.classList.add("running-game");
    measure();
    addEventListener("keydown", onKey, true);
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    /* passive:false so preventDefault actually blocks the browser's own
       pan/pull-to-refresh — a down-swipe must only ever mean sploot */
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    addEventListener("resize", measure);
    if (!window.Alps) {
      let sc = document.querySelector("script[data-alps]");
      if (!sc) {
        sc = document.createElement("script");
        sc.src = "alps.js"; sc.async = true; sc.dataset.alps = "1";
        document.head.appendChild(sc);
      }
      sc.addEventListener("load", () => { if (root && !root.hidden) drawFar(); }, { once: true });
    }
    reset();
  }

  function best() {
    try { return parseInt(localStorage.getItem("fieldnotes-run-best") || "0", 10) || 0; }
    catch (_) { return 0; }
  }

  return {
    start, best, KEEPSAKE_AT: 250,
    _dbg: () => ({ mode, modeT, pS, speed, corners, obstacles, ci, phase: phaseAt(pS), windowIn: windowIn(), jumpT, duckT }),
    _phaseAt: phaseAt,
    /* Build a whole track offline and hand back its layout. Used to check the
       shape of a long run without having to survive one. */
    _genTo(units) {
      const save = { track, corners, obstacles, endX, endZ, endTh, endS, ci, sinceBreather, pS };
      resetTrack();
      while (endS < units) { pS = endS - 600; extend(); }
      const out = {
        corners: corners.map((c) => ({ s: Math.round(c.s), dir: c.dir })),
        obstacles: obstacles.map((o) => ({ s: Math.round(o.s), kind: o.kind })),
      };
      ({ track, corners, obstacles, endX, endZ, endTh, endS, ci, sinceBreather, pS } = save);
      return out;
    },
  };
})();
