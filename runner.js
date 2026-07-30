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
  const INTRO_MS = 2700, OVER_WAIT_MS = 3000, RECALL_MS = 2100;

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
  let onExit = null, trees = [], overTimer = 0;

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

  function resetTrack() {
    track = []; corners = []; obstacles = []; ci = 0; sinceBreather = 0;
    endX = endZ = endTh = endS = 0;
    track.push({ x: 0, z: 0, th: 0, s: 0 });
    addStraight(560);                        // the squirrel chase happens here
    extend();
  }

  function trackAt(s) {
    if (s <= 0) return track[0];
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

  /* Seen from behind and above. The muzzle poking out past the head is what
     stops him reading as a cat — a round skull with two pointed ears and no
     snout is a cat every time. Broad shoulders, low bushy tail, big
     wide-set ears do the rest. */
  /* Three-quarters from behind, not dead astern. Straight-on you see a round
     skull and two pointed ears and the brain says "cat" — turning him lets
     the muzzle show in profile, which is the thing that says "dog". */
  /* NOTE: this is the pre-existing drawing, restored. Seven attempts at
     redrawing it from behind (adding a muzzle, turning the head to 3/4,
     going low-and-long, stripping it right back) each came out worse — a
     horn, a beak, a beetle, an owl. Left as-is pending a reference to work
     from; see the README. */
  const DOG_RUN = `
    <path class="rk-tail-thick rk-tail" d="M0,-4 C5,7 11,15 17,21"/>
    <path class="rk-ink rk-thick rk-leg rk-lb1" d="M-16,-10 L-23,7"/>
    <path class="rk-ink rk-thick rk-leg rk-lb2" d="M16,-10 L23,7"/>
    <path class="rk-ink rk-thin rk-leg rk-lf1" d="M-14,-46 L-20,-33"/>
    <path class="rk-ink rk-thin rk-leg rk-lf2" d="M14,-46 L20,-33"/>
    <path class="rk-dog-body" d="M-19,-4 C-22,-22 -19,-40 -14,-50 C-10,-58 -6,-62 0,-62
      C6,-62 10,-58 14,-50 C19,-40 22,-22 19,-4 C12,4 -12,4 -19,-4 Z"/>
    <path class="rk-dog-mantle" d="M-12,-8 C-15,-24 -12,-40 -8,-49 C-5,-56 -3,-59 0,-59
      C3,-59 5,-56 8,-49 C12,-40 15,-24 12,-8 C6,-2 -6,-2 -12,-8 Z"/>
    <path class="rk-collar" d="M-9,-56 C-4,-52 4,-52 9,-56"/>
    <path class="rk-nape" d="M-7,-74 L-11,-88 L-1,-76 Z"/>
    <path class="rk-nape" d="M7,-74 L11,-88 L1,-76 Z"/>
    <circle class="rk-nape" cx="0" cy="-69" r="8.5"/>`;

  /* belly down, hind legs splayed flat out to the sides — a sploot */
  const DOG_SPLOOT = `
    <path class="rk-ink rk-thick" d="M-13,-8 L-30,-2 L-38,2"/>
    <path class="rk-ink rk-thick" d="M13,-8 L30,-2 L38,2"/>
    <path class="rk-tail-thick" d="M0,-2 C3,6 7,11 12,15"/>
    <path class="rk-dog-body" d="M-17,-6 C-19,-18 -15,-28 -9,-33 C-5,-36 -3,-37 0,-37
      C3,-37 5,-36 9,-33 C15,-28 19,-18 17,-6 C10,1 -10,1 -17,-6 Z"/>
    <path class="rk-dog-mantle" d="M-11,-9 C-13,-19 -10,-27 -6,-31 C-3,-34 -2,-35 0,-35
      C2,-35 3,-34 6,-31 C10,-27 13,-19 11,-9 C6,-4 -6,-4 -11,-9 Z"/>
    <path class="rk-collar" d="M-8,-33 C-4,-30 4,-30 8,-33"/>
    <path class="rk-nape" d="M-8,-44 L-18,-49 L-2,-45 Z"/>
    <path class="rk-nape" d="M8,-44 L18,-49 L2,-45 Z"/>
    <ellipse class="rk-nape" cx="0" cy="-42" rx="8.5" ry="7"/>`;

  /* coming back to you: face on, ears up, tail going */
  const DOG_FRONT = `
    <path class="rk-tail-thick rk-front-tail" d="M0,-16 C10,-22 16,-30 18,-38"/>
    <path class="rk-ink rk-thick rk-leg rk-lb1" d="M-11,-20 L-13,2"/>
    <path class="rk-ink rk-thick rk-leg rk-lb2" d="M11,-20 L13,2"/>
    <path class="rk-dog-body" d="M-17,-14 C-19,-32 -12,-46 0,-46 C12,-46 19,-32 17,-14
      C10,-6 -10,-6 -17,-14 Z"/>
    <path class="rk-dog-mantle" d="M-15,-24 C-16,-38 -9,-46 0,-46 C9,-46 16,-38 15,-24
      C9,-33 -9,-33 -15,-24 Z"/>
    <path class="rk-collar" d="M-11,-44 C-5,-39 5,-39 11,-44"/>
    <path class="rk-nape" d="M-10,-58 L-16,-76 L-2,-61 Z"/>
    <path class="rk-nape" d="M10,-58 L16,-76 L2,-61 Z"/>
    <circle class="rk-nape" cx="0" cy="-56" r="13"/>
    <path class="rk-muzzle" d="M-7,-50 C-7,-43 7,-43 7,-50 C4,-46 -4,-46 -7,-50 Z"/>
    <circle class="rk-eye" cx="-5" cy="-60" r="1.9"/>
    <circle class="rk-eye" cx="5" cy="-60" r="1.9"/>
    <ellipse class="rk-eye" cx="0" cy="-52" rx="2.4" ry="1.8"/>`;

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

  function build() {
    root = document.createElement("div");
    root.id = "runner";
    root.hidden = true;
    root.innerHTML = `
      <svg id="rkSvg" aria-hidden="true">
        <rect id="rkSky" x="0" y="0" width="100%" height="100%"/>
        <g id="rkFar"></g>
        <path id="rkTrail" class="rk-trail"/>
        <path id="rkEdgeL" class="rk-edge"/>
        <path id="rkEdgeR" class="rk-edge"/>
        <path id="rkMid" class="rk-lane"/>
        <g id="rkTrees"></g>
        <g id="rkObs"></g>
        <g id="rkSigns"></g>
        <g id="rkSquirrel">${SQUIRREL}</g>
        <g id="rkDog">${DOG_RUN}</g>
        <g id="rkDogSploot">${DOG_SPLOOT}</g>
        <g id="rkDogFront">${DOG_FRONT}</g>
      </svg>
      <p class="rk-dist"><span id="rkDist">0</span> m</p>
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
      far: $("#rkFar", root), trail: $("#rkTrail", root),
      edgeL: $("#rkEdgeL", root), edgeR: $("#rkEdgeR", root), mid: $("#rkMid", root),
      trees: $("#rkTrees", root), obs: $("#rkObs", root), signs: $("#rkSigns", root),
      dog: $("#rkDog", root), sploot: $("#rkDogSploot", root), front: $("#rkDogFront", root),
      sq: $("#rkSquirrel", root), shout: $("#rkShout", root), tip: $("#rkTip", root),
      bar: $("#rkTimerBar", root),
    };
    distEl = $("#rkDist", root);
    overBox = $("#rkOver", root);

    for (let i = 0; i < 16; i++) {
      const g = ns("g", { class: "rk-tree" });
      g.appendChild(ns("path", { d: "M0,0 L0,-34", class: "rk-ink rk-thick" }));
      g.appendChild(ns("path", { d: "M0,-96 L-30,-16 L30,-16 Z", class: "rk-ink rk-thick" }));
      Lr.trees.appendChild(g);
      trees.push({ el: g, s: 0, side: i % 2 ? 1 : -1, off: 0 });
    }
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
          <path class="br-limb"/>
          <path class="br-twigs"/>
          <path class="br-leaves"/>
        </g>`;
      g.style.display = "none";
      Lr.obs.appendChild(g);
    }

    $("#rkQuit", root).addEventListener("click", () => startRecall());
    $("#rkAgain", root).addEventListener("click", () => { clearTimeout(overTimer); reset(); });
  }

  function measure() {
    const r = root.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width));
    H = Math.max(360, Math.round(r.height));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    cx = W / 2; horizonY = H * 0.40;
    drawFar();
  }

  function drawFar() {
    Lr.far.replaceChildren();
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
    trees.forEach((t, i) => { t.s = 90 + i * 42; t.off = HALF_W + 22 + wob(i * 3.1, 80); });
    overBox.hidden = true;
    root.classList.remove("rk-done");
    taught = {}; tipT = 0; Lr.tip.hidden = true;
    distEl.textContent = "0";
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
    if (e.key === "Escape") { startRecall(); return; }
    switch (e.key) {
      case "ArrowLeft": case "a": case "A": turn(-1); break;
      case "ArrowRight": case "d": case "D": turn(1); break;
      case "ArrowUp": case "w": case "W": case " ": jump(); break;
      case "ArrowDown": case "s": case "S": duck(); break;
      default: return;
    }
    e.preventDefault();
  }
  let tx = null, ty = null;
  function onTouchStart(e) { const t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; }
  function onTouchEnd(e) {
    if (tx === null) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    tx = ty = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1);
    else if (dy < 0) jump(); else duck();
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
    // the whole scheme up front, then each one again when it first matters
    if (!taught.all) { say("all", "← → corners · ↑ jump · ↓ sploot", 4); return; }
    if (!taught.corner) { say("corner", "← → to take the corners", 3.2); return; }
    const soon = (kind) => obstacles.some(
      (o) => !o.passed && o.kind === kind && o.s - pS > 40 && o.s - pS < SEE_AHEAD);
    if (soon("log")) { say("log", "↑ to jump the log", 3.2); return; }
    if (soon("branch")) { say("branch", "↓ to sploot under the branch", 3.4); return; }
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
      if (jumpT >= 0) { jumpT += dt; if (jumpT > JUMP_MS / 1000) jumpT = -1; }
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
      distEl.textContent = Math.floor(pS / 4);
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

      // twigs at varied angles, each with a fork and a bit of foliage
      let tw = "", lv = "";
      const twigs = [[0.18, -0.55, 1.0], [0.4, 0.4, 0.78], [0.6, -0.35, 0.9], [0.8, 0.5, 0.62]];
      for (const [f, lean, len] of twigs) {
        const i = Math.round(f * (spine.length - 1));
        const from = spine[i];
        const to = {
          x: from.x - upx * 0.8 * len + ax * lean * alongLen * 0.07,
          y: from.y - upy * 0.8 * len + ay * lean * alongLen * 0.07,
        };
        tw += `M${P(from)} L${P(to)} `;
        const mid = lerpP(from, to, 0.5);
        tw += `M${P(mid)} L${P({ x: mid.x - ax * lean * alongLen * 0.04, y: mid.y - upy * 0.26 })} `;
        lv += ovalPath(to, ax * alongLen * 0.03, ay * alongLen * 0.03, upx * 0.16, upy * 0.16) + " ";
      }
      q(".br-twigs").setAttribute("d", tw);
      q(".br-twigs").setAttribute("stroke-width", Math.max(1, thick * 0.34).toFixed(1));
      q(".br-leaves").setAttribute("d", lv);
    }
    return true;
  }

  function draw() {
    const pts = (arr) => arr.map(P).join(" L");

    const left = [], right = [], mid = [];
    for (let d = -22; d < SEE_AHEAD; d += STEP) {
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

    for (const t of trees) {
      if (t.s < pS - 40) { t.s += trees.length * 42; t.off = HALF_W + 22 + wob(t.s * 0.07, 80); }
      const a = trackAt(t.s), rx = Math.cos(a.th), rz = -Math.sin(a.th);
      const p = project(a.x + rx * t.off * t.side, a.z + rz * t.off * t.side, 0);
      if (!p) { t.el.style.display = "none"; continue; }
      t.el.style.display = "";
      t.el.setAttribute("transform", `translate(${P(p)}) scale(${(p.s * 0.32).toFixed(3)})`);
      t.el.style.opacity = clamp(p.s * 1.6, 0, 1);
    }

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
    Lr.dog.style.display = mode !== "recall" && !ducking ? "" : "none";
    Lr.sploot.style.display = mode !== "recall" && ducking ? "" : "none";
    Lr.front.style.display = mode === "recall" ? "" : "none";

    if (mode === "recall") {
      const t = clamp(modeT / (RECALL_MS / 1000), 0, 1);
      const eased = 1 - Math.pow(1 - t, 2.2);
      const zc = lerp(340, 46, eased);
      const s = FOCAL / zc;
      Lr.front.setAttribute("transform",
        `translate(${cx.toFixed(1)},${(horizonY + (CAM_HEIGHT / zc) * FOCAL).toFixed(1)}) scale(${(s * 0.2).toFixed(3)})`);
      root.style.setProperty("--rk-cadence", "150ms");
    } else {
      const shown = ducking ? Lr.sploot : Lr.dog;
      const pd = project(px, pz, lift());
      if (pd) shown.setAttribute("transform", `translate(${P(pd)}) scale(${(pd.s * 0.2).toFixed(3)})`);
      else shown.style.display = "none";
      root.style.setProperty("--rk-cadence",
        clamp(330 - (speed - SPEED_0) * 0.55, 165, 330).toFixed(0) + "ms");
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
    root.removeEventListener("touchend", onTouchEnd);
    removeEventListener("resize", measure);
    document.body.classList.remove("running-game");
    if (onExit) onExit();
  }

  function start(opts) {
    if (!root) build();
    onExit = (opts && opts.onExit) || null;
    root.hidden = false;
    document.body.classList.add("running-game");
    measure();
    addEventListener("keydown", onKey, true);
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    addEventListener("resize", measure);
    reset();
  }

  function best() {
    try { return parseInt(localStorage.getItem("fieldnotes-run-best") || "0", 10) || 0; }
    catch (_) { return 0; }
  }

  return {
    start, best, KEEPSAKE_AT: 250,
    _dbg: () => ({ mode, modeT, pS, speed, corners, obstacles, ci, phase: phaseAt(pS), windowIn: windowIn() }),
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
