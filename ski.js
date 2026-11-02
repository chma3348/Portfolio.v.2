"use strict";

/* ============================================================
   THE SKI RUN — off the left edge of the map
   ------------------------------------------------------------
   Walk into the left edge and hold. The hiker takes a pair of skis,
   rides the chairlift up with Felix, and points them downhill.

     tap / click / space   jump          (grounded)
     hold                  backflip      (airborne)
     release               stop spinning, level out
     esc / the X chip      call it a day

   ONE BUTTON. That is the whole control scheme, and it is the reason
   this genre was chosen: it plays identically with a thumb, a mouse
   and a keyboard, with no tilt and no permission prompt.

   THE PROMISE THE TERRAIN MAKES
   Every chasm is clearable by a skier who presses nothing at all.
   The button is only ever upside. So the tension is entirely in the
   LANDING — stop rotating level with a slope you can see — never in
   a gap you might not have been fast enough for. generate() asserts
   this at generation time; see fairness() and the SPEED_MIN clamp.

   AXES. y increases DOWNHILL (SVG's own axis), so gravity is +y and
   slope m = dy/dx is positive downhill. The intuition "a hill launches
   you" points the wrong way here: the ground falls away from you when
   the slope is INCREASING (m' > 0), so that is where you get air.
   runner.js uses y-up because it projects a 3D camera; this is a true
   side view, and using SVG's axis deletes every sign flip.

   SCALE. 20 world units = 1 metre. The skier is 36u tall, a 300u
   chasm is 15m, and the readout is Math.floor(x / 20).
   ============================================================ */

window.Ski = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const TAU = Math.PI * 2;
  const TOUCH = matchMedia("(pointer: coarse)");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- the view ----------
     The viewBox honours the real aspect ratio. Clamping width against a
     fixed height letterboxes every portrait phone, so we clamp whichever
     axis we actually mean and let the other follow. */
  let W = 0, H = 0, VW = 1150, VH = 800;
  let camX = 0, camY = 0;
  const CAM_X_FRAC = 0.30;          // skier sits this far across the screen
  /* Everyone gets the same warning. The world window is sized in world units
     rather than from the viewport, and the speed is then capped so the runway
     visible ahead is always about READ_S seconds — otherwise the game is fair
     on a laptop and unfair on a portrait phone, which sees far less of it. */
  const READ_S = 1.15;
  let SPEED_CAP = 700;
  /* The camera follows the HILL, not the skier.

     It used to have two heights — one grounded, one airborne, a fifth of a
     screen apart — and switch between them on state. Once the terrain started
     launching you off every little roll, that switch fired 4.5 times a second
     and the whole frame juddered. Tracking a smoothed ground line instead
     means a small pop moves the camera by nothing at all, because the hill
     did not move. Only genuine height above the snow eases it back, ramped on
     the height itself so there is no snap anywhere. */
  const CAM_Y_GROUND = 0.52;
  const CAM_TAU = 0.22;
  const CAM_AHEAD = 0.14;           // of a screen, so it leans into what's coming
  const CAM_AIR_DEAD = 46;          // height above the snow that still counts as a hop
  const CAM_AIR_GAIN = 0.55, CAM_AIR_MAX = 340;
  const CAM_AIR_BIG = 290, CAM_ZOOM = 0.42;  // tuned to the ~270u a mega actually reaches
  let zoom = 1, lastZoom = 1;

  /* ---------- pace ----------
     SPEED_MIN is load-bearing: the generator's clearance proof assumes it.
     See fairness(). Do not "optimise" the clamp away. */
  const G = 980;                    // u/s^2 — a touch floaty, and it buys jump range
  const SPEED_MIN = 470, SPEED_0 = 490, SPEED_MAX = 1000;
  const GRAV_ALONG = 900;           // along-slope acceleration coefficient
  const DRAG = 0.16, EDGE_DRAG = 34;

  /* ---------- the moves ---------- */
  const JUMP_V = 385, JUMP_V_SPD = 0.10, JUMP_V_MAX = 470;
  const NORMAL_MIX = 0.62;          // how much of the pop goes along the slope normal
  const SPIN_W = 11.0;              // rad/s — a whole turn takes 0.69s of air, so a
                                  // plain jump can just land one and a crest can double
  const SPIN_RAMP = 0.09, SPIN_STOP = 0.10;
  const COYOTE = 0.09, BUFFER = 0.11, LAUNCH_LOCK = 0.07;
  const AIM_TAU = 0.20, AIM_LOOK = 0.16, AIM_TERRAIN = 0.78;
  const AIR_DRAG = 0.06, VY_MAX = 1500;
  const WALL_TOL = 10;      // below the far lip by this much = you hit the face
  const VOID_DEPTH = 260;   // and this far down the hole, you're gone regardless

  /* ---------- landing ----------
     Magnitudes only; the signs live in the formula so they can't drift. */
  const TOL_0 = 0.60;
  const TOL_AIR = 0.11, TOL_AIR_MAX = 0.17;
  const TOL_FAST = 0.09, TOL_FAST_MAX = 0.22, TOL_FAST_FROM = 700;
  const TOL_FLIP = 0.07, TOL_FLIP_MAX = 0.14;
  const TOL_MIN = 0.40, TOL_MAX = 0.86;
  const LAND_KEEP = 0.72, LAND_FLOOR = 0.86, LAND_BOOST = 1.05, LAND_FLIP = 0.08;

  /* ---------- the trick economy ----------
     The point of the source game: a landed trick raises a multiplier, and the
     multiplier makes you FASTER. Speed is distance, distance is the keepsake,
     so risking a flip buys something real instead of being decoration. The
     combo holds for a few seconds after landing, so chaining across features
     is the skilful thing; a crash takes the lot. */
  const COMBO_HOLD = 4.2;           // seconds a combo survives without a trick
  const COMBO_MAX = 8;
  const COMBO_SPEED = 0.055;        // +5.5% top speed per step, so x8 is +44%
  const TRICK_BASE = 100;
  /* Grinding: the third verb. Jump and flip are both about leaving the ground;
     a rail is the one thing that rewards staying ON something, and it holds the
     combo window open while you do, so it's the glue between tricks. */
  const RAIL_GRAV = 0.5, RAIL_DRAG = 0.45, RAIL_SCORE = 0.4, RAIL_MIN = 70;

  const KEEPSAKE_AT = 150;          // metres, comparable effort to the runner's 250

  /* ---------- timing (SECONDS, except the two that feed CSS) ---------- */
  const OVER_WAIT_MS = 3000, RECALL_MS = 4400;
  /* The beat between the fall and the stamp. A crash that simply freezes the
     world reads as the game hanging rather than as a fall, so every ending
     gets follow-through — and it differs by how you died, because "slides to
     a stop" is nonsense if you just dropped down a hole. */
  const SETTLE = { slide: 0.85, hole: 0.95, stop: 0.55, buried: 1.0 };
  const SETTLE_DECEL_MIN = 240, STOP_LEAN = 0.38;
  const VEIL_MS = 520;              // the world whitens, and the map is under it
  /* The ride up. The map's boarding scene carries them off to the RIGHT, so
     the shot picks them up mid-cable travelling right — same screen
     direction, no cut in the action. The world's ink begins at x = 0 (the
     summit shelf); left of that is blank paper, so the cruise happens high
     over nothing at all, with only the far ranges passing behind. */
  const LIFT_MS = 3600, LIFT_SEAT = 58, LIFT_ZOOM = 0.60;
  const STAT_X = 14;                 // the return wheel, up on the summit shelf
  const CABLE_BEND = STAT_X - 240;   // the rising line dips toward the wheel from here
  const CABLE_RISE = 0.105;          // the climb, in screen truth
  const LIFT_PARK = STAT_X - 12;     // where the chair stops, behind the run's start
  const RIDE_LEN = 1250;
  const LIFT_START = LIFT_PARK - RIDE_LEN;
  const FELIX_HOP = 0.74;            // he bails first, obviously
  const HOP_AT = 0.84, HOP_LEN = 0.10;
  const FLAND_X = 24, LAND_X = 40;   // both land past the wheel, clear of the rig
  /* The walk-back in three beats: he runs up, he licks your face, he sits
     down and calls it. Fractions of RECALL_MS. */
  const R_ARRIVE = 0.30, R_LICK_END = 0.70, SIT_AT = 0.74;
  /* ...and since the endings now differ by how you went down, the walk-back
     is a little script of beats, in SECONDS, built per run in startRecall(). */
  const BEAT_ARRIVE = 1.3, BEAT_DIG = 1.8, BEAT_PEER = 1.0, BEAT_CLIMB = 3.8,
        BEAT_LICK = 1.75, BEAT_SPIN = 1.0, BEAT_SIT = 1.3;
  const DROP_MS = 2300;              // the summit: a look at the valley, then push off

  /* There is no intro in here. Getting on the chair happens on the MAP — the
     paper slides over to reveal it, the pair walk on, and it carries them off
     the edge (see leaveForSki / updateBoarding in game.js). By the time this
     module starts they are already moving, so it opens straight into the ride
     rather than cutting to a scene that explains itself twice. */

  /* ---------- terrain storage ----------
     Knots are variable-spaced because features want different widths, so
     they're resampled once onto a uniform ring at generation time. That
     turns groundAt() into two array reads and a lerp — no search, no
     branch on the hot path. */
  const DX = 6, N = 2048, MASK = N - 1;
  const Y = new Float32Array(N);    // height at that sample
  const M = new Float32Array(N);    // analytic slope there
  const GAP = new Uint8Array(N);    // 1 = there is no ground here
  let bakeI = 0;                    // next unbaked sample; world x = bakeI * DX

  /* ---------- state ---------- */
  let root, svg, L = {}, distEl, overBox;
  let raf = 0, lastT = 0, mode = "idle", modeT = 0;
  let onExit = null, overTimer = 0;
  let settleKind = "slide", settleNext = null, endMetres = 0, settleV0 = 0;
  let sprayX = null, sprayY = null;   // pin the plume when the rider has left it behind
  let camHold = false;                // the frame stays on the lip while he drops past it
  let saidBye = false, felixLick = 0, seated = false;
  let chairX = 0, liftK = 0, hopped = false, fHopped = false;
  let veilClouded = false, retrying = false;
  let endKind = "slide", endBest = false, buried = false, riderHidden = false;
  let moundX = 0, moundScale = 1, climbFade = 1, felixTilt = 0, felixSpin = 0;
  let plan = null, liftSwing = 0, dropFrom = 0;
  /* Which side of the rider Felix ends up on: 1 = uphill (the usual), -1 =
     downhill, for the crevasse — he leaps them, so he's on the far side. */
  let side = 1, crevFar = 0, felixOnChair = false;

  let K = [], cur = null;           // knots, and the generation head
  let rocks = [], marks = [], trees = [];
  let grade = 0.30, sinceBreather = 0, sinceChasm = 1e9, sinceLaunch = 99;
  /* Ground reserved for landing on. Anything that throws you into the air
     books the stretch you'll come down on, because a rock you meet while
     already committed to a flight is a death you could not have avoided —
     and that is the one kind this game must never hand out. */
  let clearZones = [];

  let x = 0, y = 0, vx = 0, vy = 0, speed = SPEED_0, ang = 0;
  let state = "snow";               // snow | air | rail | crashed
  let rails = [], onRail = null, railDist = 0;
  let airT = 0, spun = 0, spinW = 0, launchSpeed = 0, coyote = 0, buffer = 0;
  let flips = 0, combo = 0, comboT = 0, score = 0, best = 0, banked = 0, bankT = 0;
  const SPRAY_MS = 0.75;
  let sprayT = 0, spraySeed = 0;
  let held = false, flipArmed = false, wantStop = false;
  let lastDusk = "", shownMetres = -1, shownScore = -1;     // HUD writes only on change
  let felixX = 0, felixY = 0, felixV = 0, felixVX = 0, felixAir = false;
  let felixLeapFor = null;         // the chasm he's mid-bound over, so it fires once
  let bandSeed = 0, dusk = 0, whiteout = 0;
  let lastFar = -1e9;
  /* The ranges behind the run (alps.js). Null until that file lands; until
     then the old pencil ridgelines stand in. */
  let alps = null, alpSeed = 1, alpVeil = 1, alpDrift = 0, summitY = 0, alpVW = 0, alpVH = 0;
  /* Fetched the moment this file runs — which is during the map's boarding
     scene or earlier, on the edge prefetch — so it's here by the time the
     chair is. Relative to the page, same as ski.js itself. */
  if (!window.Alps && !document.querySelector("script[data-alps]")) {
    const sc = document.createElement("script");
    sc.src = "alps.js" + (window.BUILD || ""); sc.async = true; sc.dataset.alps = "1";
    document.head.appendChild(sc);
  }

  /* ============================================================
     THE EXTRAS — juice, goals, avalanches, snowflakes, the goat
     ------------------------------------------------------------
     Everything here sits ON TOP of the run: none of it changes the terrain,
     and the fairness audit never sees it. The one thing that can kill you
     is the avalanche, and it's beatable by keeping your speed up — which is
     what the flip economy is for.
     ============================================================ */

  const PERFECT_TOL = 0.06;        // rad off the slope for a "perfect" landing
  const PERFECT_AIR = 0.38;        // ...and only after real airtime
  const CLOSE_CALL = 26;           // units of clearance over a rock
  const FLAKE_R = 30;              // collection radius: generous in the air, out of reach on the snow
  const AV_FIRST = [6500, 9500], AV_EVERY = [11000, 17000];
  /* The avalanche is a scene in three acts. It rolls into view and settles
     close behind you at YOUR speed, so you get a good look at it; it warns
     you; then it creeps up on you by a fixed amount each second, and your
     COMBO pushes it back. No combo, it closes; x1, it barely gains; x2 and
     up, you pull away. It's tied to the thing the game wants you doing, not
     to whether the chase happened to start on a flat or a steep stretch —
     at a fixed pace, burial swung from 0% to 50% on terrain alone. */
  const AV_ENTER = 1.5, AV_HOLD = 1.7, AV_CHASE = 8.0;
  const AV_GAP_IN = 760, AV_GAP_HOLD = 200;   // starts off-screen, settles in view
  const AV_CREEP = 40, AV_PUSH = 34;          // units/s it gains, units/s each combo step buys back

  let stats = null, goalSet = 0, goalDone = [0, 0, 0], goalCardT = 0;
  let flakes = [], nextFlakeX = 0;
  let floaters = [], puffs = [];
  let dip = 0, dipV = 0;
  let av = null, nextAvX = 0;
  let goat = null, nextGoatX = 0, nextBarkX = 0;
  let flightGap = false, lastOff = 0, lastLandAir = 0, prevX = 0, avLastX = 0;

  function freshStats() {
    return { flips: 0, maxFlip: 0, perfects: 0, gaps: 0, grindM: 0, metres: 0, maxCombo: 0,
             closeCalls: 0, flakes: 0, avalanches: 0, bigAir: 0, bridges: 0 };
  }

  /* ---------- goals: three at a time, kept between visits ---------- */

  const GOAL_SETS = [
    [["flips", 1, "land a backflip"], ["metres", 300, "ski 300 m"], ["flakes", 5, "collect 5 snowflakes"]],
    [["perfects", 2, "land 2 perfect landings"], ["gaps", 2, "jump 2 crevasses"], ["grindM", 40, "grind 40 m of rail"]],
    [["maxFlip", 2, "land a double backflip"], ["maxCombo", 3, "reach a ×3 multiplier"], ["closeCalls", 1, "pull off a close call over a rock"]],
    [["avalanches", 1, "outrun an avalanche"], ["metres", 1000, "ski 1,000 m in one run"], ["flakes", 20, "collect 20 snowflakes in one run"]],
    [["bridges", 1, "grind across a rope bridge"], ["bigAir", 1.4, "stay airborne for 1.4 seconds"], ["perfects", 6, "land 6 perfect landings in one run"]],
    [["maxCombo", 5, "reach a ×5 multiplier"], ["flips", 8, "land 8 flips in one run"], ["metres", 2000, "ski 2,000 m in one run"]],
  ];
  /* Past the authored sets, the same kinds of goal at steadily rising bars. */
  /* Cached: checkGoals() runs every frame, and building the procedural sets
     (closures, toLocaleString) every frame was most of the extras' cost. */
  const goalCache = new Map();
  function goalsFor(set) {
    if (!goalCache.has(set)) goalCache.set(set, buildGoals(set));
    return goalCache.get(set);
  }
  function buildGoals(set) {
    if (set < GOAL_SETS.length) return GOAL_SETS[set];
    const k = set - GOAL_SETS.length + 1;
    const pool = [
      ["metres", Math.min(4500, 2000 + 250 * k), (n) => `ski ${n.toLocaleString()} m in one run`],
      ["flips", Math.min(20, 8 + k), (n) => `land ${n} flips in one run`],
      ["perfects", Math.min(16, 6 + k), (n) => `land ${n} perfect landings in one run`],
      ["flakes", Math.min(50, 20 + 3 * k), (n) => `collect ${n} snowflakes in one run`],
      ["avalanches", Math.min(3, 1 + Math.floor(k / 3)), (n) => n > 1 ? `outrun ${n} avalanches in one run` : "outrun an avalanche"],
      ["closeCalls", Math.min(6, 1 + Math.ceil(k / 2)), (n) => `pull off ${n} close calls in one run`],
      ["gaps", Math.min(12, 3 + k), (n) => `jump ${n} crevasses in one run`],
      ["maxCombo", Math.min(8, 5 + Math.ceil(k / 3)), (n) => `reach a \u00d7${n} multiplier`],
    ];
    const a = (k * 3) % pool.length, b = (k * 3 + 3) % pool.length, c = (k * 3 + 5) % pool.length;
    return [pool[a], pool[b === a ? (b + 1) % pool.length : b], pool[c === a || c === b ? (c + 2) % pool.length : c]]
      .map(([key, n, text]) => [key, n, text(n)]);
  }
  function loadGoals() {
    try {
      const g = JSON.parse(localStorage.getItem("fieldnotes-ski-goals") || "null");
      // a whole, non-negative set number: anything else threw in start() and the run never opened
      if (g && Number.isInteger(g.set) && g.set >= 0 && g.set < 1e4) { goalSet = g.set; goalDone = [0, 1, 2].map((i) => (g.done && g.done[i]) ? 1 : 0); return; }
    } catch (_) {}
    goalSet = 0; goalDone = [0, 0, 0];
  }
  function saveGoals() {
    try { localStorage.setItem("fieldnotes-ski-goals", JSON.stringify({ set: goalSet, done: goalDone })); } catch (_) {}
  }
  function goalProgress(g) {
    const v = stats[g[0]];
    return g[0] === "bigAir" ? `${Math.min(v, g[1]).toFixed(1)} / ${g[1]} s` : `${Math.min(Math.floor(v), g[1])} / ${g[1]}`;
  }
  function renderGoalList(el, live) {
    const gs = goalsFor(goalSet);
    el.innerHTML = `<p class="sk-goals-head">goals · set ${goalSet + 1}</p>` + gs.map((g, i) =>
      `<p class="sk-goal${goalDone[i] ? " sk-goal-done" : ""}"><b>${goalDone[i] ? "✓" : "○"}</b> ${g[2]}` +
      (!goalDone[i] && live && stats ? ` <i>${goalProgress(g)}</i>` : "") + `</p>`).join("");
  }
  function checkGoals() {
    if (!stats || mode !== "ride") return;
    const gs = goalsFor(goalSet);
    for (let i = 0; i < 3; i++) {
      if (goalDone[i] || stats[gs[i][0]] < gs[i][1]) continue;
      goalDone[i] = 1;
      saveGoals();
      const all = goalDone.every(Boolean);
      L.goalToast.innerHTML = `<b>✓</b> ${gs[i][2]}` + (all ? `<span>all three — new goals next run</span>` : "");
      L.goalToast.hidden = false;
      L.goalToast.classList.remove("sk-stamped"); void L.goalToast.offsetWidth;
      L.goalToast.classList.add("sk-stamped");
      goalToastT = all ? 3.2 : 2.4;
      score += 250; banked += 250;
    }
  }
  let goalToastT = 0;
  /* Called when a run ends, however it ends: all three done moves you on. */
  function bankGoals() {
    if (!stats) return false;
    checkGoals();
    if (!goalDone.every(Boolean)) return false;
    goalSet++; goalDone = [0, 0, 0]; saveGoals();
    return true;
  }

  /* ---------- floating words, in the world ---------- */

  function floatText(wx, wy, text, big) {
    // the big callouts ride along with you, or at speed they're gone behind you in a blink
    floaters.push({ wx, wy, text, t: 0, life: big ? 1.25 : 0.9, big, x0: x, y0: y });
    if (floaters.length > 8) floaters.shift();
  }

  /* ---------- powder ---------- */

  function puff(n, up, spread) {
    for (let k = 0; k < n; k++) {
      if (puffs.length > 90) puffs.shift();
      puffs.push({ x: x - 8 - Math.random() * 10, y: y - 2,
        vx: -speed * (0.05 + Math.random() * 0.18) + (Math.random() - 0.5) * spread,
        vy: -(up * (0.4 + Math.random() * 0.8)), t: 0, life: 0.45 + Math.random() * 0.35,
        r: 1.4 + Math.random() * 2.2 + Math.min(2.5, Math.max(0, speed - 520) / 120) });
    }
  }

  /* ---------- landings: the hook touchdown() calls once it's clean ---------- */

  function onLand(f, off) {
    lastOff = off; lastLandAir = airT;
    stats.bigAir = Math.max(stats.bigAir, airT);
    if (f > 0) { stats.flips += f; stats.maxFlip = Math.max(stats.maxFlip, f); }
    if (flightGap) { stats.gaps++; flightGap = false; }

    /* the thump: scaled to how far you fell, never a shake */
    if (airT > 0.5) {
      dipV += Math.min(230, airT * 140);
      puff(Math.min(22, 6 + airT * 10), 150, 120);
    }
    if (off < PERFECT_TOL && airT >= PERFECT_AIR) {
      stats.perfects++;
      speed = Math.min(comboCeil(), speed * 1.04);
      const pts = 50 * Math.max(1, combo);
      score += pts; banked += pts;
      if (combo > 0) comboT = COMBO_HOLD;     // a clean landing keeps the chain alive
      floatText(x, y - 70, "perfect!", true);
      puff(10, 190, 160);
    }
  }

  /* ---------- the per-frame part ---------- */

  function extrasStep(dt) {
    stats.metres = Math.max(stats.metres, Math.floor(x / 20));
    stats.maxCombo = Math.max(stats.maxCombo, combo);
    if (state === "air" && overGap(x)) { const m = voidAt(x); if (m && !m.bridged) flightGap = true; }
    if (state === "snow") flightGap = false;

    // close calls: a rock passed under you by a hair
    for (const r of rocks) {
      if (r.hit || r.cc || r.x <= prevX || r.x > x) continue;
      r.cc = true;
      if (state !== "air") continue;
      const clear = (groundAt(r.x) - r.r * 1.15) - y;
      if (clear >= 0 && clear < CLOSE_CALL) {
        stats.closeCalls++;
        const pts = 75 * Math.max(1, combo);
        score += pts; banked += pts;
        if (combo > 0) comboT = COMBO_HOLD;
        floatText(x, y - 64, "close call!", true);
      }
    }
    prevX = x;

    // powder off the skis, more of it the faster you go
    if (state === "snow" && speed > 480 && Math.random() < (speed - 440) / 260) puff(1, 60, 30);

    // snowflakes: a hop's worth strung over clean stretches, and the line
    // through every crevasse and big-air jump
    while (nextFlakeX < x + VW * zoom + 700) {
      const base = nextFlakeX;
      nextFlakeX += 900 + Math.random() * 700;
      if (base < 400) continue;
      let clean = true;
      for (let px = base - 60; px < base + 480; px += 18) if (overGap(px)) { clean = false; break; }
      if (clean) for (const r of rocks) if (r.x > base - 120 && r.x < base + 520) { clean = false; break; }
      if (clean) for (const m of megas) if (Math.abs(m.x - base) < 900) { clean = false; break; }
      if (!clean) continue;
      for (let k = 1; k <= 4; k++) {
        const u = k / 5, px = base + 420 * u;
        flakes.push({ x: px, y: groundAt(px) - 58 - 4 * 52 * u * (1 - u), got: false });   // a hop's height: you have to jump for them
      }
    }
    for (const m of marks) {
      if (m.flaked || m.bridged) continue;
      m.flaked = true;
      const s = slopeAt(m.x - 4), th = Math.atan(s), c = Math.cos(th), sn = Math.sin(th);
      const nx = sn * NORMAL_MIX, ny = -c * NORMAL_MIX - (1 - NORMAL_MIX), len = Math.hypot(nx, ny) || 1;
      const v = 580, vxx = v * c + (nx / len) * JUMP_V, vyy = v * sn + (ny / len) * JUMP_V;
      for (let k = 1; k <= 4; k++) {
        const t = ((m.gap * (0.15 + 0.2 * k)) / vxx);
        flakes.push({ x: m.x + vxx * t, y: m.y + vyy * t + 0.5 * G * t * t - 22, got: false });
      }
    }
    for (const m of megas) {
      if (m.flaked) continue;
      m.flaked = true;
      const th = Math.atan(slopeAt(m.x - 4)), v = 640;
      for (let k = 1; k <= 5; k++) {
        const t = 0.14 * k;
        flakes.push({ x: m.x + v * Math.cos(th) * t, y: groundAt(m.x) + v * Math.sin(th) * t + 0.5 * G * t * t - 22, got: false });
      }
    }
    for (const fl of flakes) {
      if (fl.got || Math.abs(fl.x - x) > FLAKE_R) continue;
      if (Math.hypot(fl.x - x, fl.y - (y - 24)) < FLAKE_R) {
        fl.got = true;
        stats.flakes++;
        const pts = 25 * Math.max(1, combo);
        score += pts; banked += pts;
        floatText(fl.x, fl.y - 18, "+" + pts, false);
      }
    }
    if (flakes.length > 80) flakes = flakes.filter((f) => f.x > camX - 200);

    // Felix marks every 500 m
    if (x >= nextBarkX) {
      nextBarkX += SIGN_EVERY;
      floatText(felixX + 8, felixY - 46, "woof!", false);
      if (!felixAir && !overGap(felixX)) { felixAir = true; felixV = -340; }
    }

    // the goat: stands on the slope ahead, bolts when you get close
    if (!goat && x > nextGoatX - 900) {
      const gx = nextGoatX;
      nextGoatX = gx + 6500 + Math.random() * 6000;
      let ok = true;
      for (let px = gx - 40; px < gx + 700; px += 20) if (overGap(px)) { ok = false; break; }
      if (ok) goat = { x: gx, y: groundAt(gx), run: false, t: 0, hop: 0 };
    }
    if (goat) {
      goat.t += dt;
      if (!goat.run && x > goat.x - 430) {
        goat.run = true; goat.t = 0;
        floatText(felixX + 8, felixY - 46, "woof!", false);
      }
      if (goat.run) {
        goat.x += Math.max(820, speed * 1.35) * dt;
        goat.hop = Math.abs(Math.sin(goat.t * 8.5)) * 16;
      }
      goat.y = (overGap(goat.x) ? goat.y : groundAt(goat.x));
      if (goat.x > camX + VW * zoom + 200 || goat.t > 7) goat = null;
    }

    // the avalanche
    avLastX = x;
    if (!av && x > nextAvX && state !== "rail") {
      av = { phase: "enter", t: 0, gap: AV_GAP_IN, front: x - AV_GAP_IN };
      L.alert.textContent = "avalanche!";
      L.alert.hidden = false;
      floatText(felixX + 8, felixY - 46, "woof!", false);
    }
    if (av) {
      av.t += dt;
      if (av.phase === "enter") {
        // rolls in from the left and settles behind you, matched to your pace
        const k = Math.min(1, av.t / AV_ENTER), e = 1 - Math.pow(1 - k, 3);
        av.gap = AV_GAP_IN + (AV_GAP_HOLD - AV_GAP_IN) * e;
        if (k >= 1) {
          av.phase = "hold"; av.t = 0;
          L.alert.textContent = "it's speeding up \u2014 land flips to pull away!";
        }
      } else if (av.phase === "hold") {
        if (av.t >= AV_HOLD) { av.phase = "chase"; av.t = 0; L.alert.hidden = true; }
      } else if (av.phase === "chase") {
        // eased in over a second, so the surge is felt rather than sprung
        const ramp = Math.min(1, av.t / 1.0);
        av.gap -= (AV_CREEP - AV_PUSH * Math.min(combo, 4)) * ramp * dt;
        av.gap = Math.min(av.gap, 760);
        if (av.gap <= 4) { av.phase = "bury"; av.t = 0; crash("buried by an avalanche"); }
        else if (av.t >= AV_CHASE) {
          av.phase = "fade"; av.t = 0;
          stats.avalanches++;
          combo = Math.min(COMBO_MAX, combo + 1); comboT = COMBO_HOLD;
          const pts = 500 * Math.max(1, combo);
          score += pts; banked += pts;
          say("outran it!", combo);
        }
      } else if (av.phase === "fade") {
        av.gap += SPEED_CAP * 0.5 * dt;          // it runs out of steam behind you
        if (av.t > 1.6) { av = null; nextAvX = x + AV_EVERY[0] + Math.random() * (AV_EVERY[1] - AV_EVERY[0]); }
      }
      // locked to you: the front moves exactly as far as you do, plus whatever it gains
      if (av && av.phase !== "bury") av.front = x - av.gap;
    }
    // where it is, when you can't see it
    if (av && (av.phase === "chase" || av.phase === "hold") && av.front < camX) {
      L.avEdge.hidden = false;
      L.avEdge.textContent = `◀ avalanche · ${Math.max(1, Math.round((x - av.front) / 20))} m`;
      L.avEdge.classList.toggle("sk-close", av.gap < 140);
    } else L.avEdge.hidden = true;

    if (goalToastT > 0) { goalToastT -= dt; if (goalToastT <= 0) L.goalToast.hidden = true; }
    checkGoals();
  }

  /* things that keep moving whatever the mode: words, powder, the camera's
     landing dip, and an avalanche finishing what it started */
  function extrasAlways(dt) {
    for (const f of floaters) f.t += dt;
    floaters = floaters.filter((f) => f.t < f.life);
    for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; }
    puffs = puffs.filter((p) => p.t < p.life);
    dipV += (-150 * dip - 15 * dipV) * dt;
    dip += dipV * dt;
    if (goalCardT > 0) { goalCardT -= dt; if (goalCardT <= 0) L.goalCard.classList.remove("sk-show"); }
    // once it has rolled over him it thins out and goes, or it hangs over the whole ending
    if (av && av.phase === "bury") { av.t += dt; av.front += 300 * dt; if (av.t > 1.2) { av.phase = "fade"; av.t = 0; } }
    // the run ended some other way: let it run out of steam and go
    if (av && mode !== "ride" && av.phase !== "bury") {
      if (av.phase !== "fade") { av.phase = "fade"; av.t = 0; L.alert.hidden = true; }
      else { av.t += dt; if (av.t > 1.6) av = null; }
    }
  }

  /* ---------- drawing ---------- */

  function extrasDraw() {
    // snowflakes
    let fd = "";
    const x0 = camX - 60, x1 = camX + VW * zoom + 60;
    for (const fl of flakes) {
      if (fl.got || fl.x < x0 || fl.x > x1) continue;
      const sx = SX(fl.x), sy = SY(fl.y), r = 7;
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        fd += `M${P(sx - dx, sy - dy)}L${P(sx + dx, sy + dy)}`;
      }
    }
    L.flakes.setAttribute("d", fd);

    // powder
    let pd = "";
    for (const p of puffs) {
      const r = p.r * (1 - p.t / p.life * 0.7), sx = SX(p.x), sy = SY(p.y);
      pd += `M${P(sx - r, sy)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
    }
    L.puffs.setAttribute("d", pd);

    // speed streaks once the chain is cooking
    const heat = clamp((combo - 3) / 3, 0, 1);
    if (heat > 0 && mode === "ride") {
      const th = Math.atan(slopeAt(x)), span = VW * zoom + 300, c = Math.cos(th), sn = Math.sin(th);
      let sd = "";
      for (let i = 0; i < 11; i++) {
        const len = 60 + wob(i * 5.1) * 130;
        const sx = ((wob(i * 3.3) * span - camX * 1.7) % span + span) % span - 150;
        const sy = wob(i * 7.1) * VH * zoom * 0.9 + 20;
        sd += `M${P(sx, sy)}L${P(sx + c * len, sy + sn * len)}`;
      }
      L.streaks.setAttribute("d", sd);
      L.streaks.style.opacity = (0.16 + 0.34 * heat).toFixed(2);
    } else L.streaks.setAttribute("d", "");

    // the goat
    if (goat) {
      L.goat.style.display = "";
      L.goat.setAttribute("transform", `translate(${P(SX(goat.x), SY(goat.y - goat.hop))}) rotate(${(Math.atan(slopeAt(goat.x)) * 57.3).toFixed(1)}) scale(1.2)`);
    } else L.goat.style.display = "none";

    // the avalanche: a billowing wall of snow, paper-filled so it swallows
    // the slope and trees behind it, outlined and washed in ink
    if (av) {
      const F = av.front, t = performance.now() / 1000;
      const a = Math.max(camX - 80, F - 2600);
      if (F > a) {
        const fade = av.phase === "fade" ? clamp(1 - av.t / 1.6, 0, 1) : 1;
        /* A rolling powder cloud: the nose rises in a rounded bulge, and the
           top is a run of scallops — cauliflower, not a wall. */
        const H = 165 + 25 * Math.sin(t * 1.7);
        const prof = (px) => {
          const back = F - px, nose = Math.min(1, back / 150);
          return H * Math.pow(Math.sin(nose * Math.PI / 2), 0.7) + 14 * Math.sin(px * 0.013 - t * 1.3) * nose;
        };
        const pts = [], ipts = [];
        for (let px = a; px < F; px += 30) pts.push(px);
        pts.push(F);
        const scallop = (scale, lift) => {
          let d = "";
          for (let i = 0; i < pts.length; i++) {
            const px = pts[i], gy = groundAt(px), py = gy - prof(px) * scale + lift;
            if (!i) { d = `M${P(SX(px), SY(py))}`; continue; }
            const qx = pts[i - 1], qy = groundAt(qx) - prof(qx) * scale + lift;
            const bump = (14 + 12 * Math.abs(Math.sin(i * 1.7 + t * 3.1))) * Math.min(1, (F - px) / 90 + 0.2) * scale;
            d += `Q${P((SX(qx) + SX(px)) / 2, Math.min(SY(qy), SY(py)) - bump)} ${P(SX(px), SY(py))}`;
          }
          return d;
        };
        const topD = scallop(1, 0);
        const bottom = `L${P(SX(F), SY(groundAt(F) + 70))}L${P(SX(a), SY(groundAt(a) + 70))}Z`;
        L.avFill.setAttribute("d", topD + `L${P(SX(F), SY(groundAt(F)))}` + bottom);
        // the wash stops at the snow line — below it, it showed as a grey box
        let groundBack = "";
        for (let i = pts.length - 1; i >= 0; i--) groundBack += `L${P(SX(pts[i]), SY(groundAt(pts[i])))}`;
        L.avWash.setAttribute("d", scallop(0.55, 8) + groundBack + "Z");
        L.avInk.setAttribute("d", topD + `L${P(SX(F), SY(groundAt(F)))}`);
        let tum = "";
        for (let k = 0; k < 7; k++) {
          const px = F - 40 - ((k * 97 + t * 260) % 520);
          if (px < a) continue;
          const sx = SX(px), sy = SY(groundAt(px) - 30 - wob(k * 2.3) * 70);
          tum += `M${P(sx, sy)}l${(6 + wob(k) * 8).toFixed(1)},${(-4 - wob(k * 1.9) * 6).toFixed(1)}`;
        }
        L.avTumble.setAttribute("d", tum);
        L.aval.style.opacity = fade.toFixed(2);
        L.aval.style.display = "";
      } else L.aval.style.display = "none";
    } else L.aval.style.display = "none";

    // floating words
    const fEls = L.floaters.children;
    for (let i = 0; i < fEls.length; i++) {
      const f = floaters[i], e = fEls[i];
      if (!f) { e.style.display = "none"; continue; }
      const k = f.t / f.life;
      e.style.display = "";
      e.textContent = f.text;
      e.setAttribute("class", f.big ? "sk-float sk-float-big" : "sk-float");
      const fx = f.big ? f.wx + (x - f.x0) * 0.85 : f.wx, fy = f.big ? f.wy + (y - f.y0) * 0.85 : f.wy;
      e.setAttribute("x", SX(fx).toFixed(1));
      e.setAttribute("y", SY(fy - 34 * k).toFixed(1));
      e.style.opacity = (k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.55) / 0.45).toFixed(2);
    }
  }

  function extrasReset(withLift) {
    stats = freshStats();
    loadGoals();
    flakes = []; nextFlakeX = 300;
    floaters = []; puffs = [];
    dip = 0; dipV = 0;
    av = null; nextAvX = AV_FIRST[0] + Math.random() * (AV_FIRST[1] - AV_FIRST[0]);
    goat = null; nextGoatX = 3200 + Math.random() * 3000;
    nextBarkX = SIGN_EVERY;
    flightGap = false; prevX = x; avLastX = x; goalToastT = 0;
    L.alert.hidden = true; L.avEdge.hidden = true; L.goalToast.hidden = true;
    L.aval.style.display = "none"; L.goat.style.display = "none";
    L.streaks.setAttribute("d", ""); L.flakes.setAttribute("d", ""); L.puffs.setAttribute("d", "");
    renderGoalList(L.goalCard, false);
    L.goalCard.classList.add("sk-show");
    goalCardT = withLift ? 0 : 3.2;        // on the chair it shows for the whole ride
  }

  /* ---------- the trees you ski past ----------
     Snow-laden firs in the same brush language as the ranges behind
     (alps.js): tiered drooping boughs, each with snow lying on top — bare
     paper, outlined in ink — and a dark band of needles underneath. Every
     tree is drawn fresh, so a hillside never repeats.

     They must stay a different register from the hazards: a rock is one
     solid black mass with a crimson tick, low on the snow. A tree is tall,
     grey, and broken up by white — never solid ink. */
  function treeArt(kind, seed) {
    let n = 0;
    const r = () => wob(seed * 0.731 + (n++) * 3.917);
    const brushD = (pts, w0) => {
      const A = [], B = [];
      for (let k = 0; k < pts.length; k++) {
        const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(pts.length - 1, k + 1)];
        let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const t = k / (pts.length - 1);
        const w = w0 * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.6));
        A.push(P(pts[k][0] - dy * w / 2, pts[k][1] + dx * w / 2));
        B.push(P(pts[k][0] + dy * w / 2, pts[k][1] - dx * w / 2));
      }
      return "M" + A.join("L") + "L" + B.reverse().join("L") + "Z";
    };
    const poly = (pts) => "M" + pts.map((q) => P(q[0], q[1])).join("L") + "Z";

    if (kind === 2) {
      // a bare, wind-killed snag: a tapering trunk, a few broken limbs,
      // snow caught along the tops of them
      const lean = (r() - 0.5) * 6, H = 50 + r() * 14;
      let ink = brushD([[0, 0], [lean * 0.4, -H * 0.5], [lean, -H]], 5.5);
      let snow = "";
      for (let k = 0; k < 4; k++) {
        const y = -H * (0.38 + k * 0.15), side = k % 2 ? 1 : -1, L = (8 + r() * 8) * (1 - k * 0.12);
        const bx = lean * (-y / H), tip = [bx + side * L, y - 4 - r() * 6];
        ink += brushD([[bx, y], [bx + side * L * 0.55, y - 2], tip], 2.6);
        snow += "M" + P(bx + side * 1.5, y - 2.5) + "L" + P(tip[0] - side * 1, tip[1] - 2);
      }
      return `<path class="sk-tw-ink" d="${ink}"/><path class="sk-tw-snowline" d="${snow}"/>`;
    }

    const spruce = kind === 1;
    const H = spruce ? 92 + r() * 18 : 70 + r() * 16;
    const tiers = spruce ? 7 : 5, trunk = 10;
    const w0 = (spruce ? 15 : 23) * (0.88 + r() * 0.24);
    const lean = (r() - 0.5) * 3;
    /* Tier by tier, bottom up, each one complete before the next: an upper
       tier hangs in front of the top of the one below, like stacked skirts.
       Drawing all the needles first and all the snow second let each tier's
       snow paint over the needle band of the tier above, so only the bottom
       band survived. And each tier gets an opaque base, or the ranges behind
       showed through the needles. */
    let out = "";
    for (let k = 0; k < tiers; k++) {
      const f = k / tiers;
      const yb = -trunk - (H - trunk) * f * 0.9;
      const yt = k === tiers - 1 ? -H : yb - (H - trunk) * (spruce ? 0.3 : 0.4);
      const w = w0 * (1 - f * 0.78) * (0.9 + r() * 0.2), droop = 3 + w * 0.14;
      const ax = lean * (-yt / H), cx = lean * (-yb / H);
      const tipL = [cx - w, yb + droop], tipR = [cx + w, yb + droop];
      const midY = yt + (yb - yt) * 0.55;
      // the whole bough: needles
      const bough = poly([[ax, yt], [cx - w * 0.55, midY], tipL,
        [cx - w * 0.6, yb - 1.5], [cx - w * 0.25, yb + droop * 0.6], [cx, yb - 0.5],
        [cx + w * 0.25, yb + droop * 0.6], [cx + w * 0.6, yb - 1.5], tipR,
        [cx + w * 0.55, midY]]);
      // snow lying on top of it, down to a soft wavy line
      /* Low: the next tier up hides the top half of this one, so snow that
         stopped two thirds of the way down showed as little white points. */
      const sl = (u) => yt + (yb - yt) * (0.8 + (r() - 0.5) * 0.1) + u;
      const snow = poly([[ax, yt - 0.5], [cx - w * 0.56, midY - 0.4], [cx - w * 0.92, yb + droop * 0.55],
        [cx - w * 0.55, sl(1.5)], [cx - w * 0.15, sl(-1)], [cx + w * 0.2, sl(1.5)],
        [cx + w * 0.58, sl(-0.5)], [cx + w * 0.92, yb + droop * 0.55], [cx + w * 0.56, midY - 0.4]]);
      // the silhouette of the snow, so white-on-white still has an edge
      const edge = "M" + P(cx - w * 0.92, yb + droop * 0.55) + "L" + P(cx - w * 0.56, midY - 0.4)
            + "L" + P(ax, yt - 0.5) + "L" + P(cx + w * 0.56, midY - 0.4) + "L" + P(cx + w * 0.92, yb + droop * 0.55);
      // and the shadow line under the bough, which is what makes it read
      const under = brushD([tipL, [cx - w * 0.3, yb + droop * 0.5], [cx, yb + 0.5],
                       [cx + w * 0.3, yb + droop * 0.5], tipR], 2.4);
      out += `<path class="sk-tw-snow" d="${bough}"/><path class="sk-tw-needles" d="${bough}"/>`
           + `<path class="sk-tw-snow" d="${snow}"/><path class="sk-tw-edge" d="${edge}"/>`
           + `<path class="sk-tw-ink" d="${under}"/>`;
    }
    const trunkD = brushD([[0, 1], [lean * 0.1, -trunk - 2]], 5);
    return `<path class="sk-tw-ink" d="${trunkD}"/>` + out;
  }

  /* ---------- helpers ---------- */
  function ns(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  /* deterministic hash noise — the ink wobble must not boil between frames */
  function wob(i) { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }
  const P = (px, py) => `${px.toFixed(1)},${py.toFixed(1)}`;

  /* ============================================================
     TERRAIN
     ============================================================ */

  /* Cubic Hermite over x, with slopes AUTHORED rather than inferred.
     Catmull-Rom (which game.js uses for the squirrel) is wrong here on
     three counts: it is parametric so there is no closed form for y given
     x, its centripetal knot spacing is not x-monotone, and it can only be
     asked for a lip angle and hoped at. Authoring the tangent makes the
     lip angle literally the number the fairness arithmetic uses. */
  function hermY(a, b, t) {
    const h = b.x - a.x, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * a.m
         + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * b.m;
  }
  function hermM(a, b, t) {
    const h = b.x - a.x, t2 = t * t;
    return ((6 * t2 - 6 * t) * a.y + (3 * t2 - 4 * t + 1) * h * a.m
          + (-6 * t2 + 6 * t) * b.y + (3 * t2 - 2 * t) * h * b.m) / h;
  }

  const SLOPE_CAP = 1.25;
  /* Append a knot dx further on, ending at slope m. y is integrated by
     trapezoid so the heights stay consistent with the slopes. */
  function knot(dx, m, isGap) {
    m = clamp(m, -SLOPE_CAP, SLOPE_CAP);
    const a = cur;
    const b = { x: a.x + dx, y: a.y + dx * (a.m + m) / 2, m, gap: !!isGap };
    K.push(b);
    cur = b;
    return b;
  }

  /* Resample every fully-authored span onto the uniform ring. */
  function bake() {
    for (let s = 1; s < K.length; s++) {
      const a = K[s - 1], b = K[s];
      if (b.x <= bakeI * DX) continue;
      while (bakeI * DX < b.x) {
        const wx = bakeI * DX;
        if (wx < a.x) { bakeI++; continue; }
        const i = bakeI & MASK, t = (wx - a.x) / (b.x - a.x);
        if (b.gap) { Y[i] = a.y + (wx - a.x) * a.m; M[i] = a.m; GAP[i] = 1; }
        else { Y[i] = hermY(a, b, t); M[i] = hermM(a, b, t); GAP[i] = 0; }
        bakeI++;
      }
    }
  }

  /* O(1). Note the gap is a FLAG, never a height: giving the void a
     huge y would poison slopeAt(), which the launch angle, the air-aim
     and the landing test all read. Over a gap the stored height stays
     the lip's own line, so every one of those keeps working. */
  function groundAt(wx) {
    const f = wx / DX, i = Math.floor(f), k = f - i;
    const a = i & MASK, b = (i + 1) & MASK;
    return Y[a] + (Y[b] - Y[a]) * k;
  }
  function slopeAt(wx) {
    const f = wx / DX, i = Math.floor(f), k = f - i;
    const a = i & MASK, b = (i + 1) & MASK;
    return M[a] + (M[b] - M[a]) * k;
  }
  function overGap(wx) { return GAP[Math.floor(wx / DX) & MASK] === 1; }

  /* ---------- how it gets harder ----------
     Each stage adds exactly one new thing, so there is always a stretch
     to learn it on before the next arrives. Same philosophy, and the same
     shape, as runner.js's PHASES. */
  const PHASES = [
    // rolling, nothing on it: learn that the button makes you jump
    { until: 1600,  bag: ["roll", "roll", "trough", "roll"], rocks: false, chasm: false },
    // the kicker arrives — the first thing worth timing, and worth flipping off
    { until: 4200,  bag: ["roll", "trough", "kicker", "roll", "bump"], rocks: false, chasm: false },
    // gaps arrive here, at ~350 m, while it's still just you and the terrain
    { until: 8000,  bag: ["roll", "kicker", "trough", "bump"], rocks: false, chasm: true, gap: [130, 210] },
    // now something to hit
    { until: 11500, bag: ["roll", "trough", "kicker", "bump", "shelf"], rocks: true, rockP: 0.38, rockKinds: 1, chasm: true, gap: [140, 230] },
    // rails: the third verb, on its own for a while
    { until: 15500, bag: ["roll", "shelf", "kicker", "shelf", "bump", "trough", "huge"], rocks: true, rockP: 0.32, rockKinds: 1, chasm: true, gap: [140, 230], rails: true },
    // and the big air, early enough that an ordinary run actually gets one
    { until: 22000, bag: ["roll", "shelf", "kicker", "mega", "bump", "trough", "huge", "bridge"], rocks: true, rockP: 0.36, rockKinds: 2, chasm: true, gap: [150, 250], rails: true },
    // drops
    { until: 32000, bag: ["roll", "trough", "kicker", "mega", "bump", "drop", "shelf", "huge", "bridge"], rocks: true, rockP: 0.42, rockKinds: 2, chasm: true, gap: [150, 250], rails: true },
    // and the gaps
    { until: 44000, bag: ["roll", "kicker", "mega", "bump", "drop", "crest", "shelf"], rocks: true, rockP: 0.46, rockKinds: 3, chasm: true, gap: [160, 280], rails: true },
  ];
  function phaseAt(wx) {
    for (const p of PHASES) if (wx < p.until) return p;
    const d = Math.min(1, (wx - 44000) / 40000);
    return {
      bag: ["roll", "kicker", "mega", "bump", "drop", "crest", "shelf", "trough", "huge", "bridge"],
      rails: true,
      rocks: true, rockP: lerp(0.48, 0.60, d), rockKinds: 3, chasm: true,
      gap: [lerp(180, 300, d), lerp(300, 420, d)],
      breather: lerp(0.30, 0.15, d),
    };
  }

  /* Cosmetic bands, on their own schedule and deliberately independent of the
     difficulty PHASES: the mountain should change character because you have
     descended, not because the game has decided to get harder. */
  const BAND_LEN = 7000, BAND_KINDS = ["piste", "glade", "open", "whiteout"];
  function bandAt(wx) {
    /* Clamped at zero: JS's % is signed, so a negative wx (the chair on its
       way in) indexed BAND_KINDS[-1] and handed the trees an undefined
       spacing table. The world starts at 0; before that it's all one band. */
    wx = Math.max(0, wx);
    const i = Math.floor(wx / BAND_LEN), f = (wx % BAND_LEN) / BAND_LEN;
    return { kind: BAND_KINDS[i % BAND_KINDS.length],
             blend: clamp(Math.min(f, 1 - f) / 0.14, 0, 1) };   // crossfade the seams
  }
  const TREE_SPACING = { piste: [260, 900], glade: [90, 260], open: [1400, 3000], whiteout: [400, 1200] };

  /* A fence line to grind. Sits above the snow on a stretch that is neither a
     launch nor a landing, so aiming for it is a choice you make rather than
     something you fall onto. */
  function addRail(from, len, lift) {
    const x0 = from, x1 = from + len;
    if (overGap(x0) || overGap(x1)) return;
    rails.push({ x0, x1, kind: "fence",
                 y0: groundAt(x0) - lift, y1: groundAt(x1) - lift * 0.82 });
  }

  const SIGN_EVERY = 10000;        // a marker every 500 m
  let nextSign = SIGN_EVERY, signs = [];
  let warns = [];                  // hazard signs planted ahead of rock clusters
  let props = [], nextProp = 1600;  // scenery you pass: a cairn, a hut, a line of flags
  let megas = [];                   // big-air lips, so they can be signposted
  let railsOn = false;

  const CHASM_SPACING = 1700, CHASM_P = 0.72, GAP_ABS_MAX = 460;
  /* A crevasse must be too wide to coast and narrow enough to jump. 1.9x the
     free arc means coasting fails until you are doing ~648 — most of the
     speed band — and 0.74 of the jumped arc leaves a quarter in hand for a
     mistimed press. */
  const COAST_MARGIN = 1.9, GAP_JUMP_SAFETY = 0.74;

  /* The clearance arithmetic, closed form.
       take-off at slope s with speed v: u = v/sqrt(1+s^2), w = s*u
       ballistic  y(t) = w t + G t^2 / 2,  x(t) = u t

     The far lip is NOT gap*gLand below the near one. knot() integrates a
     span as a trapezoid — y += dx*(m_in + m_out)/2 — so a void entered off
     an up-kicked lip at s and left at gLand drops the MEAN of the two:
         far lip = gap * (s + gLand) / 2
     Sizing gaps against gap*gLand instead was certifying jumps nobody could
     make: measured a 165-unit "crevasse" whose far lip came out seven units
     HIGHER than the near one, while this function promised 246 units of
     range. Clearing the real lip:
         s*gap + G*gap^2/(2u^2) <= gap*(s + gLand)/2
         => gap <= u^2 (gLand - s) / G
     — exactly half what the wrong model claimed. A steeper kicker and a
     steeper landing still each buy range, just half as much of it. */
  function reach(v, s, gLand) {
    const u2 = (v * v) / (1 + s * s);
    return u2 * (gLand - s) / G;
  }

  /* The same arithmetic with the jump's impulse added at the lip, which is
     what a crevasse is actually sized against. pop() fires along a blend of
     the slope normal and straight up, so on an up-kicked lip it pushes you
     slightly BACKWARD as well as up — it has to be applied to both
     components, not bolted onto vy. */
  function reachJump(v, s, gLand) {
    const th = Math.atan(s), c = Math.cos(th), sn = Math.sin(th);
    const nx = sn * NORMAL_MIX, ny = -c * NORMAL_MIX - (1 - NORMAL_MIX);
    const len = Math.hypot(nx, ny) || 1;
    const jv = JUMP_V;                    // at the floor; speed only ever adds
    const vx = v * c + (nx / len) * jv;
    const vy = v * sn + (ny / len) * jv;
    const D = (s + gLand) / 2;            // the void's real mean slope; see reach()
    return 2 * vx * (vx * D - vy) / G;
  }

  /* Emitters. Every one is a slope profile, and every one has a mean
     slope near `grade`, so the descent stays honest. */
  function emitRoll() {
    const a = rand(0.10, 0.24);
    knot(rand(80, 160), grade + a);
    knot(rand(80, 160), grade - a);
  }
  function emitTrough() {          // m decreasing throughout: builds speed, can't launch you
    knot(rand(90, 150), grade + rand(0.26, 0.44));
    knot(rand(90, 150), grade - rand(0.10, 0.20));
  }
  function emitBump() {            // compress, then off an upturned lip
    knot(rand(50, 90), grade + rand(0.20, 0.32));
    knot(rand(45, 80), grade - rand(0.30, 0.50));
    noRocks(cur.x, 620);
    knot(rand(60, 110), grade + rand(0.05, 0.18));
  }
  function emitShelf() {           // the breather
    const a = cur.x;
    const long = railsOn && Math.random() < 0.3;
    knot(rand(60, 100), grade * 0.5);
    knot(long ? rand(620, 900) : rand(140, 240), rand(0.06, 0.13));
    knot(rand(70, 120), grade);
    if (railsOn && Math.random() < 0.55) {
      bake();
      const r = Math.random();
      // short hop-on, standard, or an absurd one that runs the whole shelf
      const len = r < 0.3 ? rand(120, 190) : r < 0.82 ? rand(210, 330) : rand(560, 900);
      addRail(a + 80, len, rand(46, 84));
    }
  }

  /* THE BIG ONE. A long steep run-in, a lip that throws you almost straight
     up, and then the mountain simply drops away underneath — so the flight is
     enormous, there is time for three rotations, and the camera pulls back far
     enough to show you the whole hillside you are sailing over. Mostly it is
     spectacle, which is the point: a run needs somewhere to gasp. */
  function emitMega() {
    const a = cur.x;
    knot(rand(230, 300), grade + rand(0.55, 0.72));   // a long compression to build speed on
    const lip = -rand(0.82, 1.02);
    knot(rand(65, 90), lip);                           // short ramp: a long one just bleeds speed
    knot(rand(40, 55), lip);                           // straight, so the launch is exact
    megas.push({ x: cur.x, from: a, huge: false });
    noRocks(cur.x, 2400);
    /* The cliff. This has to be TWO knots at the same steep slope: y is
       integrated by trapezoid, so a single knot from the up-lip straight to a
       down-slope averages the two and nets about four units of drop. The pair
       gives a genuine straight fall of 250-350 units, which is what turns the
       hang time into a spectacle. */
    /* The lip has to end in a CORNER, not a curve. A 67-unit blend from the
       up-lip to the cliff meant the launch test fired partway down the bend,
       at near-zero angle — he dribbled off the edge instead of being thrown
       off it, and a 0.2 s hop is what came out. Eight units is a cliff edge. */
    knot(rand(7, 12), SLOPE_CAP);
    /* A real cliff: ~400-540 units of fall. The first attempt dropped 150 and
       the whole thing was over in a second — the hang time IS the spectacle,
       and hang time comes from how far the ground has gone, not from how hard
       the lip kicked. */
    knot(rand(320, 430), SLOPE_CAP);
    /* and then a long, moderate landing ramp. The first version dropped away
       at 50 degrees and kept going, which is steeper than the launch: the
       skier met the wall almost immediately and the "big" air lasted half a
       second. You need something shallow enough to fly past and land on. */
    knot(rand(280, 380), rand(0.46, 0.58));
    knot(rand(160, 220), grade);
    sinceLaunch = 0;
  }
  /* The launch ramp. m is strictly non-increasing through the approach,
     so ground contact cannot be lost early, and it ends in an exactly
     straight ramp — two knots with equal m collapse the Hermite to a
     line identically — so the take-off point, angle and speed are all
     pinned down rather than approximate. */
  function emitCrest(sLip) {
    const s = sLip == null ? -rand(0.10, 0.28) : sLip;
    knot(rand(110, 170), grade + rand(0.30, 0.46));
    knot(rand(90, 130), s);
    knot(90, s);                  // the straight ramp
    noRocks(cur.x);
    return s;
  }

  /* A proper kicker. Steepens in, then throws a hard up-lip at you — the
     one feature big enough to hang a double flip on, and obvious enough from
     a long way out that timing it is a decision rather than a surprise. */
  /* Three sizes, because one shape repeated is the definition of stale, and a
     short punchy pop wants completely different timing from a long drawn-out
     one. The run-in length is what you're reading when you decide when to tap. */
  const KICKERS = [
    // comp is the compression's rise in slope; it must stay gentle relative to
    // runIn or the run-in itself throws you, onto the ramp, at the wrong angle
    { runIn: [110, 150], comp: [0.24, 0.34], lip: [0.40, 0.58], ramp: [42, 60],  out: [140, 200] },
    { runIn: [150, 210], comp: [0.38, 0.52], lip: [0.54, 0.80], ramp: [60, 84],  out: [180, 250] },
    { runIn: [250, 340], comp: [0.52, 0.72], lip: [0.66, 0.92], ramp: [84, 114], out: [240, 340] },
  ];
  function emitKicker() {
    const k = KICKERS[(Math.random() * KICKERS.length) | 0];
    knot(rand(k.runIn[0], k.runIn[1]), grade + rand(k.comp[0], k.comp[1]));
    const lip = -rand(k.lip[0], k.lip[1]);
    knot(rand(k.ramp[0], k.ramp[1]), lip);
    knot(rand(k.ramp[0] * 0.7, k.ramp[1] * 0.8), lip);   // straight: exact launch
    knot(rand(22, 34), grade + rand(0.42, 0.66));         // a corner, but not a cliff
    noRocks(cur.x);
    knot(rand(k.out[0], k.out[1]), grade + rand(0.18, 0.34));
    /* Room to breathe. Landing one ramp straight into the run-in of the next
       is what made them feel awkwardly placed — you never got to set up. */
    knot(rand(160, 280), grade);
    sinceLaunch = 0;
  }

  /* A step down. Air without a ramp, and it reads instantly as a drop. */
  function emitDrop() {
    knot(rand(90, 140), grade + rand(0.10, 0.20));
    knot(rand(46, 70), rand(0.85, 1.15));              // the face
    noRocks(cur.x, 700);
    knot(rand(120, 190), grade + rand(0.05, 0.16));
  }

  /* THE BIG ONE. Not realistic and not trying to be: a cliff the better part
     of two thousand units deep, four seconds of hang, and the camera hauled
     right back so the mountain you launched off is a shape in the corner.
     Rare enough to still be an event when it turns up. */
  function emitHuge() {
    const a = cur.x;
    knot(rand(300, 380), grade + rand(0.62, 0.80));    // a long, long compression
    const lip = -rand(0.95, 1.15);
    knot(rand(90, 120), lip);
    knot(rand(60, 80), lip);
    megas.push({ x: cur.x, from: a, huge: true });
    noRocks(cur.x, 5200);
    knot(rand(8, 14), SLOPE_CAP);                       // a corner, so it throws you
    /* 700-900 units of fall. The first go at this was 1,600 and it broke the
       world — the ground outran the camera, the skier ended up three thousand
       units above a hillside that had left the screen, and the hachures drew
       as a picket fence. Big enough to gasp at, small enough that the frame
       can still hold both of you. */
    knot(rand(560, 720), SLOPE_CAP);
    knot(rand(420, 560), rand(0.42, 0.54));             // a very long run-out
    knot(rand(220, 300), grade);
    sinceLaunch = 0;
  }

  /* Too wide to jump — a rope bridge is strung across it and catching that is
     the only way over. It is guaranteed catchable: the deck hangs just below
     the lip line and spans the whole void, so anyone who leaves the lip at all
     must come down through it. Clearing the entire thing in the air is
     possible at top speed, which is the show-off line. */
  function emitBridge() {
    const sLip = -rand(0.05, 0.12);          // shallow, or you sail over the deck
    const gLand = clamp(grade + rand(0.04, 0.14), 0.22, 0.46);
    const gap = rand(620, 900);
    const runIn = cur.x;
    emitCrest(sLip);
    const lip = cur;
    clearZones.push([runIn - 420, lip.x]);
    knot(gap, gLand, true);
    const farK = cur;
    knot(170, gLand);
    knot(rand(140, 220), grade);
    noRocks(lip.x + gap, 800);
    bake();
    /* The deck is anchored PAST the far lip on purpose. Ending it short left
       you stepping off the last plank still over the hole, which is a death
       for riding the thing correctly. */
    rails.push({ x0: lip.x + 8, x1: lip.x + gap + 30, kind: "bridge",
                 y0: lip.y - 5, y1: farK.y + 30 * gLand - 5 });
    marks.push({ x: lip.x, y: lip.y, gap, far: lip.x + gap, bridged: true,
                 farY: farK.y });
    sinceLaunch = 0;
    return true;
  }

  function emitChasm(ph) {
    /* A SHALLOW lip, and that is the whole design. A steep up-kick throws you
       a long free arc, which is why crevasses used to be impossible to fall
       into — the terrain jumped them for you and the hazard was decoration.
       Shallow, the coasting arc collapses while the jump impulse still
       carries you the same distance, so a press is worth 4x doing nothing
       instead of 2.6x, and there is room to put the far lip in between. */
    const sLip = -rand(0.04, 0.14);
    const gLand = clamp(Math.max(grade, 0.26) + rand(0.10, 0.24), 0.30, 0.58);
    const vFloor = SPEED_MIN;
    /* The window: too wide to coast, comfortably inside a timed jump. Both
       ends are measured at the speed FLOOR, so overspeed only ever helps —
       carry enough of it and you can clear one without pressing, which is
       the combo paying out rather than the hazard failing. */
    const floorGap = COAST_MARGIN * reach(vFloor, sLip, gLand);
    const cap = Math.min(GAP_ABS_MAX, GAP_JUMP_SAFETY * reachJump(vFloor, sLip, gLand));
    if (cap <= floorGap) return false;      // no honest gap fits these slopes
    /* The phase's gap range is a difficulty dial, not a measurement: it says
       where in this crevasse's own window to sit, so the run still escalates
       without any phase being able to author an unfair one. */
    const frac = clamp((rand(ph.gap[0], ph.gap[1]) - 130) / 170, 0, 1);
    const gap = lerp(floorGap, cap, frac);
    if (gap < 85) return false;             // not worth drawing; fall back to a feature

    noRocks(cur.x, 0);                     // placeholder, widened below
    const runIn = cur.x;
    emitCrest(sLip);
    const lip = cur;
    clearZones.push([runIn - 420, lip.x]);  // the whole approach stays clean
    /* Signed, like the rocks. A shallow lip reads as ordinary slope right up
       until it isn't there, and now that coasting into one is fatal you need
       to have decided about it before you can see the hole. */
    warns.push({ x: lip.x - rand(300, 420), for: lip.x, kind: "gap" });
    /* The void is TWO flagged spans, not one. knot() integrates a span as a
       trapezoid — y += dx*(m_in + m_out)/2 — so a single span running from
       the up-kicked lip straight to the landing slope averages the two and
       drops almost nothing. Measured: a 165-unit "crevasse" whose far lip
       came out seven units HIGHER than the near one, while reach() was
       sizing it for a full gap*gLand drop. You had to fly uphill to make a
       jump the generator had certified as clearable at the speed floor.
       A short corner inside the void swings the slope over first, so the
       long span integrates gLand-to-gLand and the far lip lands exactly
       where the proof says it does. */
    knot(gap, gLand, true);
    const farK = cur;
    knot(140, gLand);                        // straight landing ramp, angle unambiguous
    knot(rand(80, 140), gLand - rand(0.06, 0.16));
    knot(rand(120, 200), grade);
    noRocks(lip.x + gap, 900);              // and the far side you land on
    marks.push({ x: lip.x, y: lip.y, gap, far: lip.x + gap, farY: farK.y });
    return true;
  }

  const LANDING_CLEAR = 1050;      // covers the longest flight at the top speed
  function noRocks(from, len) { clearZones.push([from, from + (len || LANDING_CLEAR)]); }
  function inClearZone(px) {
    for (let i = 0; i < clearZones.length; i++) {
      if (px >= clearZones[i][0] && px <= clearZones[i][1]) return true;
    }
    return false;
  }

  function stepGrade() {
    grade = clamp(grade + rand(-0.05, 0.05), 0.22, 0.46);
  }

  function emitFeature() {
    const ph = phaseAt(cur.x);
    railsOn = !!ph.rails;
    stepGrade();
    const x0 = cur.x;

    if (ph.chasm && cur.x - sinceChasm > CHASM_SPACING && Math.random() < CHASM_P) {
      if (emitChasm(ph)) { sinceChasm = cur.x; sinceBreather++; sprinkle(x0, ph); return; }
    }
    const earned = cur.x > 6000 && sinceBreather >= 3;
    if (earned && Math.random() < (ph.breather ?? 0.30)) { emitShelf(); sinceBreather = 0; }
    else {
      let kind = pick(ph.bag);
      // a launcher needs a plain stretch in front of it to be read from
      if ((kind === "kicker" || kind === "mega" || kind === "huge") && sinceLaunch < 2) kind = "roll";
      if (kind !== "kicker" && kind !== "mega" && kind !== "huge") sinceLaunch++;
      if (kind === "roll") emitRoll();
      else if (kind === "trough") emitTrough();
      else if (kind === "bump") emitBump();
      else if (kind === "crest") emitCrest();
      else if (kind === "kicker") emitKicker();
      else if (kind === "mega") emitMega();
      else if (kind === "huge") emitHuge();
      else if (kind === "drop") emitDrop();
      else if (kind === "bridge") { if (!emitBridge()) emitRoll(); }
      else emitShelf();
      sinceBreather++;
    }
    sprinkle(x0, ph);
  }

  /* Rocks go on stretches that are neither a launch nor a landing, so they
     never turn a jump you were committed to into an ambush. Three sizes, and
     they cluster: a lone pebble every few hundred units is not a mountain.
     Size matters for reading them — see drawRock, where they're solid ink. */
  const ROCK_KINDS = [
    { r: [21, 27], w: 0.42 },     // stones   — 42-54u wide
    { r: [31, 41], w: 0.38 },     // rocks    — 62-82u
    { r: [47, 60], w: 0.20 },     // boulders — 94-120u, these you must jump
  ];
  /* Sizes arrive in stages too — stones first, boulders only once you've
     learned to read the small ones. */
  function pickRock(maxKind) {
    const pool = ROCK_KINDS.slice(0, maxKind);
    let n = Math.random() * pool.reduce((a, k) => a + k.w, 0);
    for (const k of pool) { if ((n -= k.w) <= 0) return k; }
    return pool[0];
  }
  function sprinkle(x0, ph) {
    if (!ph.rocks) return;
    /* The knots for this feature exist but have not been resampled yet, and
       every guard below reads the ring. Without this the probes land past the
       bake head and return whatever was there a lap ago — 12,288 units of
       unrelated hillside — so the void and slope tests silently passed on
       garbage and rocks got authored inside chasms. bake() is idempotent. */
    bake();
    const x1 = cur.x;
    let planted = false;
    for (let rx = x0 + 110; rx < x1 - 110; rx += rand(360, 760)) {
      if (Math.random() > (ph.rockP ?? 0.4)) continue;
      const cluster = Math.random() < 0.22 ? 2 : 1;
      for (let c = 0; c < cluster; c++) {
        const px = rx + c * rand(44, 68);
        if (px > x1 - 70) break;
        if (overGap(px) || overGap(px + 60) || overGap(px - 60)) continue;
      if (inClearZone(px)) continue;
        if (Math.abs(slopeAt(px)) > 0.62) continue;
        const k = pickRock(ph.rockKinds ?? 3);
        rocks.push({ x: px, r: rand(k.r[0], k.r[1]), hit: false, seed: wob(px) });
        planted = true;
      }
      /* A piste warns you before it hurts you. One sign per cluster, far
         enough out to be a decision rather than a jump-scare. */
      if (planted) {
        /* The sign goes far enough ahead of the cluster to be a decision, which
           usually means it lands in the PREVIOUS feature — features are only a
           couple of hundred units long. Requiring it to fit inside this one
           rejected every single sign. */
        const wx = rx - rand(300, 430);
        if (wx > 260 && !overGap(wx)) warns.push({ x: wx, for: rx });
        planted = false;
      }
    }
  }

  function ensure(toX) {
    let guard = 0;
    while (cur.x < toX && guard++ < 200) { emitFeature(); bake(); }
    /* Something to pass. Without these the hillside is texture rather than
       places, and 30 seconds of texture is 30 seconds of the same thing. */
    while (nextProp < cur.x - 300) {
      if (!overGap(nextProp)) props.push({ x: nextProp, kind: (Math.random() * 4) | 0 });
      nextProp += rand(1800, 3400);
    }
    if (props.length > 6) props.splice(0, props.length - 6);
    if (rails.length > 8) rails.splice(0, rails.length - 8);
    if (megas.length > 4) megas.splice(0, megas.length - 4);
    while (nextSign < cur.x - 200) {
      if (!overGap(nextSign)) signs.push({ x: nextSign, m: Math.round(nextSign / 20) });
      nextSign += SIGN_EVERY;
    }
    if (signs.length > 6) signs.splice(0, signs.length - 6);
    if (warns.length > 8) warns.splice(0, warns.length - 8);
    if (clearZones.length > 24) clearZones = clearZones.filter((z) => z[1] > x - 600);
    // cull what's behind
    while (K.length > 3 && K[1].x < x - 900) K.shift();
    if (rocks.length > 60) rocks.splice(0, rocks.length - 60);
    if (marks.length > 12) marks.splice(0, marks.length - 12);
  }

  /* The mark to beat, shown while you ride rather than only on the stamp at
     the end — you cannot pace yourself against a number you can't see. Read
     once per run, not per frame: localStorage is synchronous. */
  let pbEl = null, pbMark = 0, pbBeaten = false;

  function resetTerrain() {
    sinceLaunch = 99;
    K = []; rocks = []; marks = []; signs = []; warns = []; props = []; clearZones = [];
    rails = []; megas = []; onRail = null; railDist = 0; bakeI = 0;
    nextSign = SIGN_EVERY; nextProp = 1600;
    grade = 0.30; sinceBreather = 0; sinceChasm = -1e9;
    Y.fill(0); M.fill(0); GAP.fill(0);
    cur = { x: 0, y: 0, m: 0.06, gap: false };
    K.push(cur);
    // the opening: a near-flat shelf off the lift that tips over
    knot(120, 0.10); knot(160, 0.24); knot(200, 0.34); knot(240, 0.32);
    bake();
    ensure(2600);
  }

  /* ============================================================
     PHYSICS
     ============================================================ */

  function jumpImpulse() {
    return Math.min(JUMP_V_MAX, JUMP_V + JUMP_V_SPD * Math.max(0, speed - SPEED_MIN));
  }

  /* An impulse along a blend of the slope normal and straight up, added
     to the velocity you already had — rebuilding the velocity from
     scratch here would throw away the air a coyote jump had earned. */
  function pop(th, jv) {
    let nx = Math.sin(th) * NORMAL_MIX;
    let ny = -Math.cos(th) * NORMAL_MIX - (1 - NORMAL_MIX);
    const len = Math.hypot(nx, ny) || 1;
    vx += (nx / len) * jv;
    vy += (ny / len) * jv;
  }

  function leaveSnow(th, jv) {
    vx = speed * Math.cos(th);
    vy = speed * Math.sin(th);
    if (jv) pop(th, jv);
    state = "air"; airT = 0; spun = 0; spinW = 0;
    launchSpeed = Math.hypot(vx, vy);
    coyote = jv ? 0 : COYOTE;
  }

  /* The combo's whole payoff. Overspeed only ever makes gaps easier to clear
     (the clearance proof is against the floor, not the ceiling) — what it costs
     you is reaction time on the rocks, which is the right thing to be risking. */
  const comboCeil = () => SPEED_CAP * (1 + Math.min(combo, COMBO_MAX) * COMBO_SPEED);

  function snowStep(dt) {
    const th = Math.atan(slopeAt(x));
    // gravity along the slope, minus drag and edge friction
    speed += (GRAV_ALONG * Math.sin(th) - DRAG * speed - EDGE_DRAG * Math.abs(Math.sin(th))) * dt;
    speed = clamp(speed, SPEED_MIN, comboCeil());    // <- the generator's proof needs this floor
    ang = th;

    const nx = x + speed * Math.cos(th) * dt;
    if (buffer > 0) { buffer = 0; flipArmed = held; leaveSnow(th, jumpImpulse()); x = nx; return; }

    x = nx;
    if (overGap(x)) { leaveSnow(Math.atan(slopeAt(x)), 0); y = groundAt(x); return; }

    /* The ground can throw you off on its own, and it must: a kicker that
       only launches you if you happen to press is not a kicker, it's
       scenery. Fly a short free arc from here — if it clears the ground,
       the hill has fallen away faster than you could follow it, so you're
       already airborne. This is what makes reading the terrain worth
       anything, and it hands you COYOTE so a late press still counts. */
    const look = 0.065;
    const bx = x + speed * Math.cos(th) * look;
    const by = y + speed * Math.sin(th) * look + 0.5 * G * look * look;
    if (!overGap(bx) && by < groundAt(bx) - 4.5) { leaveSnow(th, 0); return; }

    y = groundAt(x);
    felixFollow(dt);
  }

  function airStep(dt) {
    airT += dt;
    if (coyote > 0) coyote -= dt;
    if (buffer > 0) buffer -= dt;

    if (held && flipArmed && airT > LAUNCH_LOCK)
      spinW = Math.max(spinW - (SPIN_W / SPIN_RAMP) * dt, -SPIN_W);
    else spinW = Math.min(0, spinW + (SPIN_W / SPIN_STOP) * dt);
    if (spinW) { ang += spinW * dt; spun += spinW * dt; }

    /* As the spin decays, hand the attitude back to an auto-aim that
       points the skis at the slope they're about to meet. Without this
       a released flip lands on whatever angle it happened to stop at,
       which the player reads as random. */
    const w = 1 - Math.abs(spinW) / SPIN_W;
    if (w > 0) {
      const land = Math.atan(slopeAt(x + vx * AIM_LOOK));
      const want = lerp(Math.atan2(vy, vx), land, AIM_TERRAIN);
      const turn = wrapAngle(want - ang) * Math.min(1, w * dt / AIM_TAU);
      ang += turn;
      /* Once a rotation is underway, the aim finishing it off is still you
         rotating — it takes the short way round, which continues the flip
         rather than unwinding it. Not counting it meant releasing a
         three-quarter flip and landing it clean scored nothing. */
      if (Math.abs(spun) > 0.8) spun += turn;
    }

    vy = Math.min(VY_MAX, vy + G * dt);
    vx -= vx * AIR_DRAG * dt;

    /* Substep the flight so a fast fall can't tunnel through a thin lip. */
    const steps = Math.min(9, 1 + Math.floor(Math.hypot(vx, vy) * dt / 11));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const py = y, pOver = overGap(x);
      x += vx * h; y += vy * h;
      if (vy > 0) {
        for (const r of rails) {
          if (x < r.x0 || x > r.x1) continue;
          const ry = r.y0 + (r.y1 - r.y0) * ((x - r.x0) / (r.x1 - r.x0));
          if (py <= ry && y >= ry) { mountRail(r, ry); return; }
        }
      }
      const over = overGap(x);
      /* Crossing out of a void BELOW its far lip means you hit the wall, not
         the snow. Without this the touchdown test below fires anyway, checks
         your angle, and — if it happens to match — lets you fall into a
         crevasse and come out the other side alive.

         Measure against the far lip PROPERLY: right at the boundary the ring
         lerps between the last void sample (which holds the near lip's
         tangent, well above the far lip) and the first real one, so reading
         groundAt(x) there fails perfectly good jumps. Sample clear of the
         seam instead. */
      if (pOver && !over) {
        const farY = groundAt(x + DX * 2);
        if (y > farY + WALL_TOL) { crash("into the crevasse"); return; }
      }
      if (!over && y >= groundAt(x)) { touchdown(); return; }
      if (over) {
        /* Depth from the FAR lip, not from groundAt() — over a void that
           reads the near lip's tangent, which on a 700-unit bridged span
           sits hundreds of units above the far side. Measuring from it
           killed you for riding the deck all the way across. */
        const m = voidAt(x);
        const ref = m ? Math.max(groundAt(x), m.farY) : groundAt(x);
        if (y > ref + VOID_DEPTH) { crash("into the crevasse"); return; }
      }
    }
    felixFollow(dt);
  }

  /* Which void, if any, x is inside. Scanned from the back: the one you're
     in is always the most recently emitted. */
  function voidAt(px) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (px >= m.x && px <= m.far) return m;
      if (m.far < px) break;
    }
    return null;
  }

  /* The cable rises to the RIGHT — the direction of travel — then dips
     into the return wheel at the summit, the way a real top station brings
     the chair down to unloading height. It's anchored only at the summit
     end; the other end runs off into the blank, which is the point. */
  function cableY(px) {
    const yW = groundAt(STAT_X) - 86;          // where it meets the wheel
    if (px >= CABLE_BEND) {
      const t = clamp((px - CABLE_BEND) / (STAT_X - CABLE_BEND), 0, 1);
      return (yW - 46) + t * t * (3 - 2 * t) * 46;
    }
    return (yW - 46) + (CABLE_BEND - px) * CABLE_RISE;
  }

  function liftStep(dt) {
    liftK = clamp(modeT / (LIFT_MS / 1000), 0, 1);
    const t = liftK;
    /* No ease-in: the shot opens mid-ride, and a lift doesn't hurry or
       dawdle — a constant crawl, then it slows into the wheel. */
    const sTravel = t < 0.72 ? (t / 0.72) * 0.84
                             : 0.84 + (1 - Math.pow(1 - (t - 0.72) / 0.28, 2)) * 0.16;
    chairX = LIFT_START + (LIFT_PARK - LIFT_START) * sTravel;
    const seatY = cableY(chairX) + LIFT_SEAT;
    /* A chair on a cable sways — and dead-level passengers read as pasted
       on. Settles as it slows into the wheel. */
    liftSwing = Math.sin(modeT * 2.2) * 0.07 * (1 - smoothstep(0.6, 0.84, t));
    // a point on the chair (in its own drawing's units) out in the world
    const CS = 1.25;
    const onChair = (lx, ly) => [chairX + (lx * Math.cos(liftSwing) - ly * Math.sin(liftSwing)) * CS,
                                 cableY(chairX) + (lx * Math.sin(liftSwing) + ly * Math.cos(liftSwing)) * CS];
    void seatY;

    if (t < HOP_AT) {
      // sat in the chair drawing; x/y just track his seat for the camera
      [x, y] = onChair(-6, 50); ang = liftSwing;
      riderHidden = true; seated = false;
    } else {
      /* The hop off: a small arc down onto the shelf, landing past the
         wheel so the parked chair and the tower are both behind them. On
         his feet for it — a seated figure hopping reads as a glitch. */
      riderHidden = false; seated = false;
      const d = clamp((t - HOP_AT) / HOP_LEN, 0, 1);
      const e = 1 - Math.pow(1 - d, 2);
      const [sx0, sy0] = onChair(-6, 50);
      x = lerp(sx0, LAND_X, e);
      y = lerp(sy0, groundAt(LAND_X), e) - Math.sin(e * Math.PI) * 14;
      ang = Math.atan(slopeAt(LAND_X)) * e;
      if (d >= 1 && !hopped) { hopped = true; sprayT = SPRAY_MS * 0.55; spraySeed = Math.floor(x); }
    }

    felixOnChair = t < FELIX_HOP;
    if (felixOnChair) { [felixX, felixY] = onChair(15, 50); }
    else if (!fHopped) {
      const d = clamp((t - FELIX_HOP) / 0.09, 0, 1);
      const [fx0, fy0] = onChair(15, 50);
      felixX = lerp(fx0, FLAND_X, d);
      felixY = lerp(fy0, groundAt(FLAND_X), d) - Math.sin(d * Math.PI) * 14;
      if (d >= 1) fHopped = true;
    } else {
      felixY = groundAt(felixX);
    }

    if (liftK >= 1) beginRun();
  }

  /* Off the chair. Ridden to the top, there's a beat at the summit — the
     camera pulls back for a look at the valley you're about to ski into,
     then two pushes on the poles and you drop in. A tap skips straight in. */
  function beginRun(skipDrop) {
    x = LAND_X; y = groundAt(x); ang = Math.atan(slopeAt(x));
    vx = vy = 0; speed = SPEED_0; state = "snow";
    seated = false; liftSwing = 0; riderHidden = false; felixOnChair = false;
    /* Skipped from the chair? Put the pair down at the station rather than
       leaving Felix hanging off the cable. */
    if (!fHopped) { felixX = FLAND_X; felixY = groundAt(felixX); fHopped = true; }
    felixV = 0; felixAir = false;
    if (skipDrop) { dropIn(); return; }
    dropFrom = x;
    setMode("dropin");
  }

  function dropIn() {
    root.classList.remove("sk-riding-up");
    goalCardT = 2.4;                     // the goals linger a moment into the run
    x = Math.max(x, LAND_X); y = groundAt(x);
    speed = SPEED_0; state = "snow";
    prevX = x; avLastX = x;
    setMode("ride");
  }

  function dropStep(dt) {
    const t = clamp(modeT / (DROP_MS / 1000), 0, 1);
    // two pole pushes, each a lean forward and a shove down the shelf
    const push = (c) => { const v = (t - c) / 0.09; return v > 0 && v < 1 ? Math.sin(v * Math.PI) : 0; };
    const p1 = push(0.62), p2 = push(0.76);
    const shove = smoothstep(0.62, 0.71, t) * 14 + smoothstep(0.76, 0.85, t) * 22 + smoothstep(0.86, 1, t) * 26;
    x = dropFrom + shove;
    y = groundAt(x);
    ang = Math.atan(slopeAt(x)) + 0.32 * (p1 + p2);
    // Felix can't stand still
    if (!felixAir && ((t > 0.12 && !plan0) || (t > 0.5 && plan0 === 1))) {
      plan0 = (plan0 || 0) + 1; felixAir = true; felixV = -300;
      if (plan0 === 1) floatText(felixX + 8, felixY - 46, "woof!", false);
    }
    if (felixAir) {
      felixV += G * dt; felixY += felixV * dt;
      if (felixY >= groundAt(felixX) && felixV > 0) { felixAir = false; felixV = 0; felixY = groundAt(felixX); }
    } else felixY = groundAt(felixX);
    if (t >= 1) { plan0 = 0; dropIn(); }
  }
  let plan0 = 0;

  function mountRail(r, ry) {
    onRail = r; railDist = 0;
    state = "rail";
    y = ry;
    ang = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
    spun = 0; spinW = 0; flipArmed = false;
    say("grinding", Math.max(1, combo));
  }

  function leaveRail(jv) {
    const r = onRail; onRail = null;
    const th = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
    if (stats) {
      stats.grindM += railDist / 20;
      if (r.kind === "bridge" && x >= r.x1 - 30) stats.bridges++;
    }
    /* A grind counts as a trick, so it chains with flips instead of sitting
       outside the economy — which is the whole reason to aim for one. */
    if (railDist > RAIL_MIN) {
      combo = Math.min(COMBO_MAX, combo + 1);
      comboT = COMBO_HOLD;
      const pts = Math.round(railDist * RAIL_SCORE) * combo;
      banked += pts; score += pts;
      say("grind", combo);
      L.meterWrap.classList.remove("sk-refill");
      void L.meterWrap.offsetWidth;
      L.meterWrap.classList.add("sk-refill");
    }
    leaveSnow(th, jv);
  }

  function railStep(dt) {
    const r = onRail;
    const th = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
    speed += (GRAV_ALONG * Math.sin(th) * RAIL_GRAV - DRAG * RAIL_DRAG * speed) * dt;
    speed = clamp(speed, SPEED_MIN, comboCeil());
    const step = speed * Math.cos(th) * dt;
    x += step; railDist += Math.abs(step);
    ang = th;
    comboT = COMBO_HOLD;               // grinding holds the chain open
    if (buffer > 0) { buffer = 0; flipArmed = held; return leaveRail(jumpImpulse()); }
    if (x >= r.x1) { x = r.x1; return leaveRail(0); }
    y = r.y0 + (r.y1 - r.y0) * ((x - r.x0) / (r.x1 - r.x0));
    felixFollow(dt);
  }

  function touchdown() {
    const th = Math.atan(slopeAt(x));
    y = groundAt(x);
    /* Liberal on purpose. If you committed to a rotation and put it down
       matching the slope, that's a flip — being three degrees short of a
       textbook 360 is not the interesting distinction. */
    const f = Math.floor(Math.abs(spun) / TAU + 0.28);

    /* Tolerance widens with airtime and with flips landed (both mean you
       committed), and narrows with speed. Signs live here, once. */
    const tol = clamp(
      TOL_0
      + Math.min(TOL_AIR_MAX, TOL_AIR * airT)
      - Math.min(TOL_FAST_MAX, TOL_FAST * Math.max(0, launchSpeed - TOL_FAST_FROM) / 100)
      + Math.min(TOL_FLIP_MAX, TOL_FLIP * f),
      TOL_MIN, TOL_MAX);

    /* Judge the landing against BOTH the slope underfoot and the slope the
       auto-aim was pointing you at (a beat further on) — right on a lip
       corner they differ by up to 35 degrees, and being punished for
       matching the slope the game aimed you at is the definition of an
       unfair fall. */
    const thAhead = Math.atan(slopeAt(x + Math.max(24, vx * AIM_LOOK)));
    const off = Math.min(Math.abs(wrapAngle(ang - th)),
                         Math.abs(wrapAngle(ang - thAhead)));
    if (off > tol) { crash(f > 0 ? "landed it wrong" : "caught an edge"); return; }

    // clean: keep the along-slope component, with a small reward
    const landOff = off;
    const along = vx * Math.cos(th) + vy * Math.sin(th);
    speed = Math.max(along * LAND_KEEP, launchSpeed * LAND_FLOOR)
          * (LAND_BOOST + LAND_FLIP * f);
    speed = clamp(speed, SPEED_MIN, comboCeil());

    if (f > 0) {
      flips += f;
      combo = Math.min(COMBO_MAX, combo + f);
      comboT = COMBO_HOLD;                    // every trick refills the window
      banked += f * TRICK_BASE * combo;
      score += f * TRICK_BASE * combo;
      const name = f === 1 ? "backflip" : f === 2 ? "double backflip" : f + "x backflip";
      say(name, combo);
      L.meterWrap.classList.remove("sk-refill");
      void L.meterWrap.offsetWidth;
      L.meterWrap.classList.add("sk-refill");  // so the refill is something you SEE
      // the surge you actually feel for taking the risk
      speed = Math.min(comboCeil(), speed * (1 + 0.05 * f));
      sprayT = SPRAY_MS; spraySeed = Math.floor(x);
    }
    onLand(f, landOff);
    state = "snow"; ang = th; spun = 0; spinW = 0;
    flipArmed = false;
    /* buffer is deliberately NOT cleared: press() only ever sets it while
       airborne, so this is exactly the late tap the grace window exists for.
       snowStep consumes it on the next grounded frame. */
  }

  function crash(why) {
    if (mode !== "ride") return;
    state = "crashed";
    combo = 0; comboT = 0;
    L.meterWrap.hidden = true; L.mult.hidden = true;
    endKind = why === "into the crevasse" ? "crevasse" : /avalanche/.test(why) ? "buried" : "slide";
    beginSettle(endKind === "crevasse" ? "hole" : endKind === "buried" ? "buried" : "slide", () => finish(why));
  }

  /* The follow-through. `next` is what the fall hands off to — the stamp for
     a crash, the walk-back for a deliberate exit. */
  function beginSettle(kind, next) {
    settleKind = kind;
    settleNext = next;
    settleV0 = speed;
    endMetres = Math.floor(x / 20);
    sprayX = sprayY = null;
    camHold = false;
    if (kind === "hole") {
      /* Pin the plume to the lip he went over rather than to him: he is on
         his way down, and the puff wants to come back UP out of the hole.
         The camera stays put for the same reason — following him into the
         dark is following nothing. */
      const m = voidAt(x) || voidAt(x - 24);
      crevFar = m ? m.far : x + 140;
      sprayX = m ? m.x : x;
      sprayY = m ? m.y : y;
      camHold = true;
    }
    sprayT = SPRAY_MS;
    spraySeed = Math.floor(x);
    setMode("settle");
  }

  function settleStep(dt) {
    const k = clamp(modeT / SETTLE[settleKind], 0, 1);

    if (settleKind === "buried") {
      /* Stops dead where it caught him. The cloud rolls on over the top, and
         once it has, all that's left is a heap of snow with his skis
         sticking out of it. */
      speed = 0;
      if (!buried && k > 0.35) {
        buried = true; moundX = x; moundScale = 1;
        puff(14, 160, 200);
      }
    } else if (settleKind === "hole") {
      vy = Math.min(VY_MAX, vy + G * dt);
      x += vx * dt; y += vy * dt;
      ang += 3.4 * dt;                                  // tumbling as he goes
      if (k > 0.26 && k < 0.5) { sprayT = SPRAY_MS * 0.85; }   // the puff comes back up
    } else {
      const th = Math.atan(slopeAt(x));
      /* Scaled to the speed he arrived at, so he reaches a standstill exactly
         as the beat ends however fast he was going. A fixed rate left a fast
         exit still drifting at 48 when Felix walked up. */
      const decel = Math.max(SETTLE_DECEL_MIN, settleV0 / SETTLE[settleKind]);
      speed = Math.max(0, speed - decel * dt);
      /* Never slide out over a void — he pulls up at the lip instead of
         hanging in the air off the end of the snow. */
      const nx = x + speed * Math.cos(th) * dt;
      if (overGap(nx)) speed = 0;
      else { x = nx; y = groundAt(x); }
      // digging the edges in leans him back, then he comes upright
      ang = settleKind === "stop" ? th - STOP_LEAN * Math.sin(Math.PI * k) : th;
      if (speed > 40) { sprayT = SPRAY_MS; spraySeed = Math.floor(x); }
    }
    felixFollow(dt);
    if (k >= 1) { const n = settleNext; settleNext = null; if (n) n(); }
  }

  /* ---------- Felix ----------
     He is company, not a mechanic: he runs the terrain a fixed distance
     behind, bounds over the same crests, and never affects anything. */
  const FELIX_GAP = 96;

  /* What Felix can stand on — which includes a bridge deck. He trots across
     those rather than leaping them; they are 620-900 units and no dog is
     clearing that. */
  function felixGround(px) {
    if (!overGap(px)) return groundAt(px);
    for (const r of rails) {
      if (r.kind !== "bridge") continue;
      /* Reach back past x0 and clamp: the deck starts 8 units inside the
         void, and that sliver used to read as open air — long enough for
         Felix to decide to LEAP a 700-unit bridged chasm. */
      if (px >= r.x0 - 16 && px <= r.x1) {
        const t = clamp((px - r.x0) / (r.x1 - r.x0), 0, 1);
        return r.y0 + (r.y1 - r.y0) * t;
      }
    }
    return null;                      // a real hole, and he has to jump it
  }

  function felixFollow(dt) {
    const want = Math.max(x - FELIX_GAP, 30);
    const prev = felixX;
    felixX += (want - felixX) * Math.min(1, dt * 6);
    felixVX = dt > 0 ? (felixX - prev) / dt : felixVX;

    /* The bound over a hole is decided a stride out and applied ONCE per
       crevasse, whether he is running or already in mid-air. Gating it on
       "he's on the ground" was the bug: he pops off lips on his own, so he
       routinely arrived at a lip already airborne, sailed past the check,
       and free-fell into the void — vy climbing all the way down — until
       his x cleared the far side and he snapped up onto the snow. That
       snap is exactly what read as falling and reappearing. */
    {
      const look = clamp(felixVX * 0.10, 16, 90);
      const ahead = felixGround(felixX + look);
      const m = ahead == null ? voidAt(felixX + look) : null;
      if (m && !m.bridged && felixLeapFor !== m) {
        felixLeapFor = m;
        const vxEst = Math.max(felixVX, speed * 0.85, 240);
        const t = clamp((m.far + 45 - felixX) / vxEst, 0.14, 1.6);
        felixV = clamp(((m.farY - felixY) - 0.5 * G * t * t) / t * 1.06, -900, -140);
        felixAir = true;
      }
    }

    if (!felixAir) {
      const here = felixGround(felixX);
      if (here != null) felixY = here;
      /* Take off BEFORE the hole, never into it. He used to simply start
         falling the moment the ground stopped, drop into the crevasse, and
         get snapped back onto the snow once his x cleared the far lip —
         which read as him falling through the world and respawning. Look a
         stride ahead instead, and if the ground runs out, bound it with an
         arc solved to land on the far lip: he clears every gap the same way
         you do, under his own steam. */
      /* Bridged spans are never leapt — felixGround() hands him the deck.
         The arc aims well PAST the far lip and off a floored speed estimate:
         his x is lerped toward the skier, so felixVX lags whenever the run
         speeds up, and an arc solved off a stale speed lands him short.
         Overshooting costs nothing; he just lands further down the ramp. */
      if (here != null && state === "air" && Math.random() < dt * 3) {
        felixAir = true; felixV = -320;   // he pops off the same lips you do
      }
    }

    if (felixAir) {
      felixV += G * dt;
      felixY += felixV * dt;
      const gy = felixGround(felixX);
      /* Strictly BELOW the surface, not "descending and below it". Waiting
         for felixV > 0 let a rising Felix burrow into an up-ramp that
         climbed faster than he did — measured 43 units deep — and then pop
         out at his apex. `>` rather than `>=` keeps the launch frame, where
         he is exactly on the ground, from landing him instantly. */
      if (gy != null && felixY > gy) {
        felixAir = false; felixV = 0; felixY = gy; felixLeapFor = null;
      }
    }
  }

  /* ============================================================
     INPUT — one button
     ============================================================ */

  const down = new Set();

  /* One continuous press does both jobs, which is the whole one-button
     idea: it launches you, and if you keep holding it rolls you into a
     flip. LAUNCH_LOCK gives a plain tap a moment of grace so a slightly
     long press hops rather than starting to spin. */
  function press() {
    // a beat before a press means "again": mashing jump through the crash skipped the score
    if (mode === "over") { if (modeT > 0.6) retry(); return; }
    if (mode === "lift") { beginRun(true); return; }  // a tap starts the run early
    if (mode === "dropin") { plan0 = 0; dropIn(); return; }
    if (mode !== "ride") return;
    held = true;
    flipArmed = true;
    if (state === "rail") leaveRail(jumpImpulse());
    else if (state === "snow") leaveSnow(Math.atan(slopeAt(x)), jumpImpulse());
    else if (coyote > 0) { pop(Math.atan(slopeAt(x)), jumpImpulse()); coyote = 0; airT = 0; spun = 0; }
    else buffer = BUFFER;
  }
  function release() { held = false; flipArmed = false; }

  function onDown(e) {
    if (e.target.closest && e.target.closest("button")) return;   // the X chip isn't a jump
    // the main button only: a right-click's menu swallows the release and left him held
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    down.add(e.pointerId);
    press();
  }
  function onUp(e) { down.delete(e.pointerId); if (!down.size) release(); }
  function onBlur() { down.clear(); release(); }
  /* One list, so the down and up filters can't drift apart — they did, and a
     capital W (shift or caps lock) stranded held=true for the rest of the run. */
  const JUMP_KEY = (k) => k === " " || k === "ArrowUp" || k === "Enter" || k === "w" || k === "W";

  function onKey(e) {
    /* No bail on BUTTON: the quit chip is the only focusable thing in here,
       so bailing on it took the entire one-button scheme away from anyone
       who had tabbed to it — Escape included. */
    if (e.key === "Escape") { e.preventDefault(); leaveRun(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;     // the browser's shortcuts, not a jump
    if (!JUMP_KEY(e.key)) return;
    e.preventDefault();
    if (!e.repeat && !down.has("key")) { down.add("key"); press(); }
  }
  function onKeyUp(e) {
    if (!JUMP_KEY(e.key)) return;
    down.delete("key");
    if (!down.size) release();
  }

  /* ============================================================
     ART
     ============================================================ */

  /* The rider, facing right, origin at the ski contact point. The
     silhouette has to survive being turned upside down, so it is built
     from four unmistakable pieces: the ski line, a bent leg, the crimson
     pack, and the head. */
  const RIDER = `
    <g class="sk-rider-in">
      <path class="sk-ski" d="M-27,1 L17,1 C23,1 27,-2 28,-6"/>
      <path class="sk-ink sk-thick" d="M-1,0 L4,-12 L-5,-23"/>
      <path class="sk-ink sk-thin sk-pole" d="M12,-33 L-6,-14 L-11,-8"/>
      <path class="sk-ink sk-thick sk-leg-f" d="M2,0 L7,-12 L-3,-23"/>
      <rect class="sk-pack" x="-13" y="-35" width="10" height="13" rx="3.5"/>
      <path class="sk-ink sk-thick" d="M-3,-23 L5,-36"/>
      <path class="sk-ink sk-thin" d="M4,-35 L12,-33"/>
      <path class="sk-ink sk-thin" d="M5,-36 L14,-31"/>
      <path class="sk-ink sk-thin sk-pole" d="M14,-31 L-4,-12 L-9,-6"/>
      <circle class="sk-head" cx="8" cy="-43" r="6.5"/>
      <path class="sk-ink sk-thin" d="M2,-46 C5.4,-50 11.2,-50 14.7,-46"/>
    </g>`;

  const RIDER_CRASH = `
    <path class="sk-ski" d="M-22,-3 L14,-14 M14,-14 C18,-15 20,-17 20,-20"/>
    <path class="sk-ski" d="M-16,3 L20,-2"/>
    <path class="sk-ink sk-thick" d="M-4,-4 L-16,-6 L-24,-2"/>
    <path class="sk-ink sk-thick" d="M-4,-4 L-8,-14"/>
    <rect class="sk-pack" x="-2" y="-20" width="12" height="10" rx="3.5"/>
    <path class="sk-ink sk-thick" d="M-8,-14 L4,-18"/>
    <circle class="sk-head" cx="14" cy="-20" r="6.5"/>
    <path class="sk-ink sk-thin sk-pole" d="M-18,-18 L-2,-24"/>`;

  /* Sat up in the snow at the end of the run, turned back up the hill to
     face the dog. The crash sprawl is 60 units wide and lying down, so a
     dog leaning in to lick it just produced two tangled ink shapes on top
     of each other — this is compact, upright, and puts the face where
     Felix's nose can actually reach it. */
  const RIDER_SEATED = `
    <path class="sk-ski" d="M-27,2.5 L11,2.5"/>
    <path class="sk-ski" d="M-24,5.5 L14,5.5"/>
    <rect class="sk-pack" x="13" y="-12" width="9.5" height="9.5" rx="3"/>
    <path class="sk-ink sk-thick" d="M0,-8 L-10,-16 L-15,-1"/>
    <path class="sk-ink sk-thick" d="M0,-8 L1,-23"/>
    <path class="sk-ink sk-thick" d="M1,-22 L11,-10 L15,-6"/>
    <path class="sk-ink sk-thick" d="M1,-22 L-7,-16"/>
    <circle class="sk-head" cx="1.5" cy="-30" r="6.5"/>
    <path class="sk-ink sk-thin" d="M-4.5,-33 C-1,-37.2 5.5,-37.2 8.5,-33"/>`;

  /* A mountain goat, side on, in pencil grey — scenery that runs away, so it
     must never read as a hazard: no solid ink, no crimson. */
  const GOAT = `
    <path class="sk-goat-body" d="M-13,-14 C-13,-21 10,-22 12,-16 L16,-21 L19,-26
      C21,-28 25,-27 24,-23 L22,-18 L19,-15 C17,-11 13,-9 10,-9 L-9,-9
      C-12,-9 -14,-11 -13,-14 Z"/>
    <path class="sk-goat-line" d="M-9,-9 L-10,0 M-5,-9 L-4,0 M6,-9 L6,0 M10,-9 L11,0"/>
    <path class="sk-goat-line" d="M19,-26 C17,-33 11,-33 12,-27"/>
    <path class="sk-goat-line" d="M23,-18 L22,-13 M-13,-15 L-16,-18"/>`;

  /* Felix, side on, adapted from the map's #dog — the drawing that is
     already proven to read as a German Shepherd. The tells are the wedge
     muzzle, the two upright ears, the sloping back and the low bushy
     tail; keep all four and it survives being 40px wide. */
  const FELIX = `
    <g class="sk-felix-in">
      <g class="sk-f-leg sk-f-lb"><path d="M-10.4,-9.8 L-12.6,-4.5 L-10.6,0"/></g>
      <g class="sk-f-leg sk-f-lf"><path d="M6,-9.4 L5.2,0"/></g>
      <g class="sk-f-tail"><path class="sk-f-fur" d="M-13.2,-12.5 C-17,-11.5 -20,-8.5 -21.5,-4
        C-19.5,-3.6 -17,-5 -15.6,-7.4 C-14.4,-9.6 -13.6,-11.2 -13.2,-12.5 Z"/></g>
      <path class="sk-f-body" d="M19.8,-19.9 C19,-21 17.3,-21.5 15,-21.6
        L13.6,-22.4 L15,-28.4 L11.9,-23.1 L11.4,-23.2 L10.4,-27.9 L9,-23.4
        C8.6,-22.4 7,-19.6 4.2,-18.2 C-0.5,-17.4 -6,-16.6 -10.5,-15.6
        C-13,-15 -14,-13.5 -13.4,-11.8 C-12.8,-10.4 -11.6,-9.6 -10.6,-9.4
        C-5,-8.8 1,-8.9 6,-9.4 C8.4,-9.7 10.4,-11 11.6,-13.2
        C12.6,-15 13.4,-16.5 14.8,-17.4 C16.4,-18 18,-18.4 18.9,-18.7
        C19.6,-19 20,-19.4 19.8,-19.9 Z"/>
      <path class="sk-f-mantle" d="M15,-21.6 L13.6,-22.4 L15,-28.4 L11.9,-23.1
        L11.4,-23.2 L10.4,-27.9 L9,-23.4 C8.6,-22.4 7,-19.6 4.2,-18.2
        C-0.5,-17.4 -6,-16.6 -10.5,-15.6 C-13,-15 -14,-13.5 -13.4,-11.8
        C-12.6,-12.2 -11,-12.6 -9,-12.9 C-4,-13.6 1,-14.4 6,-15.9
        C10,-17.1 13,-19.2 15,-21.6 Z"/>
      <path class="sk-f-tongue" d="M20.2,-18.6 C22.8,-18.2 24.6,-16.8 25.2,-15
        C23.6,-15.2 21.6,-16.2 20.2,-17.6 Z"/>
      <circle class="sk-f-eye" cx="15.4" cy="-19.9" r="0.8"/>
      <g class="sk-f-leg sk-f-lb2"><path d="M-8,-10 L-10,-5 L-8,0"/></g>
      <g class="sk-f-leg sk-f-lf2"><path d="M9,-9.5 L8,0"/></g>
    </g>`;

  /* Sat down at the end of the run: haunches on the snow, front legs
     straight, head up. Same conventions as FELIX — nose to the right,
     ground at y=0 — so the two poses swap without moving him. */
  const FELIX_SIT = `
    <g class="sk-felix-in">
      <g class="sk-f-tail"><path class="sk-f-fur" d="M-14.5,-3 C-18.5,-2.6 -22.5,-1 -25,1.6
        C-22.4,2.6 -19,1.8 -17,0.1 C-15.7,-1 -14.9,-2.1 -14.5,-3 Z"/></g>
      <path class="sk-f-body" d="M20.5,-30.8
        C19.4,-32.6 17,-33.6 14.2,-33.9
        L12.9,-34.7 L14.1,-40.6 L11.3,-35.5
        L10.8,-35.6 L9.9,-40.2 L8.6,-35.7
        C7.9,-34.1 6.6,-31.8 4.4,-29.9
        C1.2,-27.1 -2.2,-23.3 -4.8,-19.3
        C-7.8,-14.7 -10.6,-9.2 -13.4,-4.8
        C-14.8,-2.6 -15.4,-1 -14.2,-0.3
        C-10.6,0.5 -5,0.5 -1.6,-0.7
        C1.4,-1.9 3.2,-4.5 4.2,-7.7
        C5.2,-11.1 6.4,-14.7 8.4,-17.5
        C10,-19.9 11.8,-21.9 12.6,-24.4
        C13.1,-26 13.2,-27.4 13.6,-28.3
        C14.4,-29.8 17,-30.6 20.5,-30.8 Z"/>
      <path class="sk-f-mantle" d="M14.2,-33.9 L12.9,-34.7 L14.1,-40.6 L11.3,-35.5
        L10.8,-35.6 L9.9,-40.2 L8.6,-35.7
        C7.9,-34.1 6.6,-31.8 4.4,-29.9
        C1.2,-27.1 -2.2,-23.3 -4.8,-19.3
        C-7.8,-14.7 -10.6,-9.2 -13.4,-4.8
        C-14.8,-2.6 -15.4,-1 -14.2,-0.3
        C-13.6,-2.7 -12,-6.2 -9.6,-10.2
        C-7,-14.6 -3.6,-19.2 -0.6,-22.8
        C2.4,-26.4 6.4,-30.2 9.8,-32.4
        C11,-33.2 12.9,-33.8 14.2,-33.9 Z"/>
      <circle class="sk-f-eye" cx="12.2" cy="-31.6" r="0.8"/>
      <g class="sk-f-leg"><path d="M-6.5,-12 L-10,-5 L-4,-1.5"/></g>
      <g class="sk-f-leg"><path d="M8.6,-16 L9.4,-0.4"/></g>
      <g class="sk-f-leg"><path d="M11.2,-15 L12,-0.4"/></g>
    </g>`;

  /* a cairn, a piste hut, a line of marker flags, a frozen tarn */
  const PROP_ART = [
      `<path class="sk-pw" d="M-13,0 L13,0"/><path class="sk-pw" d="M-10,-1 C-11,-9 -4,-11 0,-11 C5,-11 11,-9 10,-1 Z"/>
       <path class="sk-pw" d="M-7,-11 C-8,-18 -2,-20 1,-20 C5,-20 9,-18 7,-11 Z"/>
       <path class="sk-pw" d="M-4,-20 C-5,-26 3,-27 4,-20 Z"/>`,
      `<path class="sk-pw" d="M-24,0 L-24,-20 L0,-34 L24,-20 L24,0 Z"/>
       <path class="sk-pw" d="M-28,-19 L0,-38 L28,-19"/>
       <path class="sk-pw" d="M-9,0 L-9,-13 L7,-13 L7,0"/>`,
      `<path class="sk-pw" d="M-30,0 L-30,-30 M-6,0 L-6,-30 M18,0 L18,-30"/>
       <path class="sk-pw-flag" d="M-30,-30 L-16,-26 L-30,-22 Z"/>
       <path class="sk-pw-flag" d="M-6,-30 L8,-26 L-6,-22 Z"/>
       <path class="sk-pw-flag" d="M18,-30 L32,-26 L18,-22 Z"/>`,
      `<path class="sk-pw" d="M-46,0 C-30,-9 24,-10 46,-1"/>
       <path class="sk-pw" d="M-30,-4 L-14,-4 M-4,-6 L18,-6 M24,-3 L36,-3"/>`,
    ];

  function build() {
    root = document.createElement("div");
    root.id = "skirun";
    root.hidden = true;
    root.innerHTML = `
      <div id="skAlpsWrap" aria-hidden="true"><svg id="skAlpsSky"></svg></div>
      <svg id="skSvg" aria-hidden="true">
        <defs>
          <linearGradient id="skFog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--paper)" stop-opacity="0"/>
            <stop offset="1" stop-color="var(--paper)" stop-opacity="0.92"/>
          </linearGradient>
        </defs>
        <rect id="skSky" x="0" y="0" width="100%" height="100%"/>
        <g id="skStars"></g>
        <path id="skFar3" class="sk-ridge sk-ridge-3"/>
        <path id="skFar2" class="sk-ridge sk-ridge-2"/>
        <path id="skFar1" class="sk-ridge sk-ridge-1"/>
        <!-- the snow under the run, opaque, so the ranges stop at the slope -->
        <path id="skSnow" class="sk-snow"/>
        <g id="skTrees"></g>
        <path id="skHach" class="sk-hach"/>
        <path id="skChasmShade" class="sk-chasm-shade"/>
        <path id="skFaces" class="sk-face"/>
        <path id="skSlope" class="sk-slope"/>
        <path id="skSpray" class="sk-spray"/>
        <g id="skRails"></g>
        <g id="skRocks"></g>
        <g id="skSigns"></g>
        <g id="skWarns"></g>
        <g id="skBigs"></g>
        <g id="skProps"></g>
        <!-- the ride up: cable, towers, and the chair they're sat on -->
        <g id="skLift" style="display:none">
          <path id="skCable" class="sk-cable"/>
          <g id="skTowers"></g>
          <!-- The chair is drawn WITH its passengers, as one picture: him sat
               back against the backrest, thighs on the seat, shins and skis
               dangling; Felix sat up beside him looking ahead. Two separate
               figures scaled down onto a bench read as a tangle of lines. -->
          <g id="skChair">
            <path class="sk-ink sk-thin" d="M2,0 L2,13 C2,15 1,16 -1,16 L-29,16"/>
            <path class="sk-ink sk-thick" d="M-29,16 L-32,50"/>
            <g id="skChairRider">
              <rect class="sk-pack" x="-29" y="26" width="9" height="12" rx="3"/>
              <path class="sk-ski" d="M-7,66 L19,61 C22,60.5 24,59 25,56"/>
              <path class="sk-ink sk-thick" d="M-15,44 L-16,29"/>
              <path class="sk-ink sk-thick" d="M-15,44 L4,43 L8,63"/>
              <path class="sk-ink" d="M-16,32 L-7,39 L1,37"/>
              <circle class="sk-head" cx="-15" cy="21.5" r="6.5"/>
              <path class="sk-ink sk-thin" d="M-21.5,18.5 C-18,14.5 -12,14.5 -8.5,18.5"/>
            </g>
            <g id="skChairFelix" transform="translate(15,50) scale(0.6)">${FELIX_SIT}</g>
            <path class="sk-ink sk-thick" d="M-33,50 L31,50"/>
          </g>
        </g>
        <g id="skAval" style="display:none">
          <path id="skAvFill" class="sk-av-fill"/>
          <path id="skAvWash" class="sk-av-wash"/>
          <path id="skAvInk" class="sk-av-ink"/>
          <path id="skAvTumble" class="sk-av-ink"/>
        </g>
        <path id="skPuffs" class="sk-puff"/>
        <path id="skFlakes" class="sk-flake"/>
        <g id="skGoat" class="sk-goat" style="display:none">${GOAT}</g>
        <g id="skMound" style="display:none">
          <path class="sk-mound" d="M-42,3 C-38,-8 -26,-24 -6,-27 C14,-30 32,-17 42,3 Z"/>
          <path class="sk-mound-hatch" d="M-24,-10 l-4,9 M-12,-18 l-3,10 M2,-20 l-1,11 M15,-17 l1,10 M27,-9 l3,8"/>
          <path class="sk-ski" d="M-4,-20 L-15,-50 C-16,-53 -15,-56 -12,-57"/>
          <path class="sk-ski" d="M5,-21 L16,-48 C17,-51 19,-53 22,-53"/>
        </g>
        <!-- climbing out of a crevasse: posed every frame from joints -->
        <g id="skClimber" style="display:none">
          <path id="skClimbSkis" class="sk-ski"/>
          <path id="skClimbBody" class="sk-ink sk-climb"/>
          <circle id="skClimbHead" class="sk-head" r="8.5"/>
        </g>
        <g id="skRider">${RIDER}</g>
        <g id="skRiderCrash" style="display:none">${RIDER_CRASH}</g>
        <g id="skRiderSeated" style="display:none">${RIDER_SEATED}</g>
        <!-- Felix draws OVER the rider. He is on the near side, and when he
             leans in to lick, his paper-filled body occludes the rider
             cleanly instead of tangling with it — drawn underneath, his
             muzzle and tongue vanished behind the rider's head. During the
             run he is 96 units uphill and they never overlap, so the order
             costs nothing there. -->
        <g id="skFelix">${FELIX}</g>
        <g id="skFelixSit" style="display:none">${FELIX_SIT}</g>
        <path id="skStreaks" class="sk-streak"/>
        <g id="skFloaters"></g>
        <rect id="skWhite" x="0" y="0" width="100%" height="100%" fill="var(--paper)" opacity="0"/>
      </svg>
      <p class="sk-dist"><span id="skDist">0</span> m</p>
      <p class="sk-pb" id="skPB" hidden></p>
      <p class="sk-combo" id="skCombo" hidden></p>
      <p class="sk-mult" id="skMult" hidden></p>
      <div class="sk-meter" id="skMeterWrap" hidden><i id="skMeter"></i></div>
      <p class="sk-bank" id="skBank" hidden></p>
      <p class="sk-score"><span id="skScore">0</span></p>
      <button class="sk-quit" id="skQuit" aria-label="Head back to the map">esc</button>
      <p class="sk-shout" id="skShout" hidden></p>
      <p class="sk-tip" id="skTip" hidden></p>
      <p class="sk-alert" id="skAlert" hidden></p>
      <p class="sk-av-edge" id="skAvEdge" hidden></p>
      <div class="sk-goal-toast" id="skGoalToast" hidden></div>
      <div class="sk-goals" id="skGoalCard"></div>
      <div class="sk-over" id="skOver" hidden>
        <div class="sk-stamp">
          <p class="sk-over-why" id="skWhy"></p>
          <p class="sk-over-dist"><span id="skFinal">0</span> m</p>
          <p class="sk-over-best" id="skBest"></p>
          <div class="sk-over-goals" id="skOverGoals"></div>
          <button class="sk-call" id="skAgain">go again</button>
          <div class="sk-timer"><i id="skTimerBar"></i></div>
        </div>
      </div>
      <p class="sk-help">tap to jump · hold in the air to flip</p>
    `;
    document.body.appendChild(root);

    svg = $("#skSvg", root);
    L = {
      sky: $("#skSky", root), stars: $("#skStars", root),
      alpsWrap: $("#skAlpsWrap", root), alpsSky: $("#skAlpsSky", root), snow: $("#skSnow", root),
      far1: $("#skFar1", root), far2: $("#skFar2", root), far3: $("#skFar3", root),
      trees: $("#skTrees", root), slope: $("#skSlope", root), rocks: $("#skRocks", root),
      hach: $("#skHach", root), signs: $("#skSigns", root), warns: $("#skWarns", root),
      bigs: $("#skBigs", root),
      faces: $("#skFaces", root), chasmShade: $("#skChasmShade", root),
      props: $("#skProps", root), railsG: $("#skRails", root), spray: $("#skSpray", root),
      lift: $("#skLift", root), cable: $("#skCable", root),
      chairRider: $("#skChairRider", root), chairFelix: $("#skChairFelix", root),
      towers: $("#skTowers", root), chair: $("#skChair", root),
      felix: $("#skFelix", root), felixSit: $("#skFelixSit", root),
      rider: $("#skRider", root), crash: $("#skRiderCrash", root),
      seated: $("#skRiderSeated", root),
      white: $("#skWhite", root), shout: $("#skShout", root), tip: $("#skTip", root),
      aval: $("#skAval", root), avFill: $("#skAvFill", root), avWash: $("#skAvWash", root),
      avInk: $("#skAvInk", root), avTumble: $("#skAvTumble", root),
      puffs: $("#skPuffs", root), flakes: $("#skFlakes", root), goat: $("#skGoat", root),
      streaks: $("#skStreaks", root), floaters: $("#skFloaters", root),
      alert: $("#skAlert", root), avEdge: $("#skAvEdge", root),
      goalToast: $("#skGoalToast", root), goalCard: $("#skGoalCard", root),
      overGoals: $("#skOverGoals", root),
      mound: $("#skMound", root),
      climber: $("#skClimber", root), climbSkis: $("#skClimbSkis", root),
      climbBody: $("#skClimbBody", root), climbHead: $("#skClimbHead", root),
      combo: $("#skCombo", root), bar: $("#skTimerBar", root),
      meter: $("#skMeter", root), meterWrap: $("#skMeterWrap", root),
      mult: $("#skMult", root), bank: $("#skBank", root),
      score: $("#skScore", root),
    };
    distEl = $("#skDist", root);
    pbEl = $("#skPB", root);
    overBox = $("#skOver", root);

    for (let i = 0; i < 26; i++) {
      const g = ns("g", { class: "sk-tree" });
      const kind = i % 7 === 0 ? 2 : i % 2;      // snags are the rare one
      g.innerHTML = treeArt(kind, i * 977 + 13);
      g.style.display = "none";
      L.trees.appendChild(g);
      trees.push({ el: g, x: 0, back: i % 3 === 0, kind, sc: 0 });
    }
    for (let i = 0; i < 14; i++) {
      const g = ns("g", { class: "sk-rock-g" });
      g.appendChild(ns("ellipse", { class: "sk-rock-shadow" }));
      g.appendChild(ns("path", { class: "sk-rock" }));
      g.appendChild(ns("path", { class: "sk-rock-face" }));
      g.appendChild(ns("path", { class: "sk-rock-mark" }));
      g.style.display = "none";
      L.rocks.appendChild(g);
    }
    for (let i = 0; i < 4; i++) {
      const g = ns("g", { class: "sk-rail" });
      g.appendChild(ns("path", { class: "sk-rail-post" }));
      g.appendChild(ns("path", { class: "sk-rail-bar" }));
      g.style.display = "none";
      L.railsG.appendChild(g);
    }
    for (let i = 0; i < 4; i++) {
      const g = ns("g", { class: "sk-prop" });
      g.style.display = "none";
      L.props.appendChild(g);
    }
    for (let i = 0; i < 3; i++) {
      const g = ns("g", { class: "sk-big" });
      g.innerHTML = `<path class="sk-ink sk-thick" d="M0,0 L0,-44"/>
        <path class="sk-big-plate" d="M-34,-46 L34,-46 L34,-82 L-34,-82 Z"/>
        <path class="sk-big-arc" d="M-22,-54 C-14,-76 14,-76 22,-54"/>
        <text x="0" y="-51">big air</text>`;
      g.style.display = "none";
      L.bigs.appendChild(g);
    }
    for (let i = 0; i < 4; i++) {
      const g = ns("g", { class: "sk-warn" });
      g.innerHTML = `<path class="sk-ink sk-thick" d="M0,0 L0,-40"/>
        <path class="sk-warn-plate" d="M0,-86 L26,-40 L-26,-40 Z"/>
        <path class="sk-warn-bang" d="M0,-76 L0,-56"/>
        <circle class="sk-warn-bang-dot" cx="0" cy="-48" r="2.6"/>
        <text x="0" y="-22">rocks</text>`;
      g.style.display = "none";
      L.warns.appendChild(g);
    }
    for (let i = 0; i < 4; i++) {
      const g = ns("g", { class: "sk-marker" });
      g.innerHTML = `<path class="sk-ink sk-thick" d="M0,0 L0,-44"/>
        <path class="sk-board" d="M0,-46 L44,-46 L52,-34 L44,-22 L0,-22 Z"/>
        <text x="26" y="-30">0</text>`;
      g.style.display = "none";
      L.signs.appendChild(g);
    }
    for (let i = 0; i < 8; i++) {
      const t = ns("text", { class: "sk-float", "text-anchor": "middle" });
      t.style.display = "none";
      L.floaters.appendChild(t);
    }
    for (let i = 0; i < 40; i++) {
      L.stars.appendChild(ns("circle", {
        cx: (wob(i * 3.1) * 100).toFixed(1) + "%", cy: (wob(i * 7.7) * 42).toFixed(1) + "%",
        r: (0.6 + wob(i * 5.3) * 1.2).toFixed(2), class: "sk-star",
      }));
    }

    $("#skQuit", root).addEventListener("click", () => leaveRun());
    $("#skAgain", root).addEventListener("click", () => retry());

    if (TOUCH.matches) $("#skQuit", root).textContent = "✕";
  }

  function measure() {
    const r = root.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width));
    H = Math.max(360, Math.round(r.height));
    const ar = W / H;
    VW = 1150; VH = VW / ar;
    if (VH < 700) { VH = 700; VW = VH * ar; }      // very wide: don't keep widening
    if (VH > 1500) { VH = 1500; VW = VH * ar; }    // very tall: don't shrink the width away
    svg.setAttribute("viewBox", `0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}`);
    lastZoom = -1;               // so the next frame puts the current zoom back on it
    SPEED_CAP = clamp(VW * (1 - CAM_X_FRAC) / READ_S, SPEED_MIN, SPEED_MAX);
    /* Only when the shape actually changed: resize fires for all sorts of
       reasons (a phone's address bar, the window being re-shown), and each
       reset throws away every mountain and redraws them all in one frame. */
    if (alps && (VW !== alpVW || VH !== alpVH)) alps.reset(alpSeed, VW, VH);
    alpVW = VW; alpVH = VH;
  }

  /* ============================================================
     DRAW
     ============================================================ */

  const SX = (wx) => wx - camX;
  const SY = (wy) => wy - camY;

  /* The back of the mountain, for the few hundred units left of the summit
     the camera can see: rounded over the top, then falling away steeply. It
     exists only once the ranges are behind it — against blank paper, blank
     paper back there was the right answer. */
  function backY(wx) {
    const u = -wx;
    return summitY + (u < 240 ? u * u / 480 : 120 + (u - 240));
  }
  function backSlope(wx) { const u = -wx; return -(u < 240 ? u / 240 : 1); }

  /* The top of the snow, for the opaque fill under the run. Over a crevasse
     it's the chord from lip to lip, so the void stays a void — without it
     the far mountains showed through the hole. */
  function snowTop(wx) {
    if (wx < 0) return backY(wx);
    if (overGap(wx)) {
      const m = voidAt(wx);
      if (m && m.farY != null && m.gap > 0) return m.y + (m.farY - m.y) * clamp((wx - m.x) / m.gap, 0, 1);
    }
    return groundAt(wx);
  }

  function ensureAlps() {
    if (alps || !window.Alps || !root) return;
    alps = window.Alps.create(L.alpsWrap);
    // stars go behind the mountains, not over them
    L.alpsSky.appendChild(L.stars);
    root.classList.add("sk-alps");
    L.far1.style.display = L.far2.style.display = L.far3.style.display = "none";
    alps.reset(alpSeed, VW, VH);
  }

  function draw() {
    ensureAlps();
    const x0 = camX - 60, x1 = camX + VW * zoom + 120;

    /* the ride surface: one ink line, nothing beneath it — the paper is
       the snow. Chasms are simply a break in the path. */
    let d = "", pen = false;
    for (let wx = x0; wx < x1; wx += DX * 2) {
      /* the world begins at the summit; left of it is the back of the
         mountain — blank paper, unless the ranges are behind it */
      if ((wx < 0 && !alps) || (wx >= 0 && overGap(wx))) { pen = false; continue; }
      const sx = SX(wx), sy = SY(wx < 0 ? backY(wx) : groundAt(wx));
      d += (pen ? " L" : " M") + P(sx, sy);
      pen = true;
    }
    L.slope.setAttribute("d", d);

    if (alps) {
      let sd = "", sxa = 0, sxb = 0;
      for (let wx = x0; wx < x1 + DX * 2; wx += DX * 2) {
        const sx = SX(wx);
        if (!sd) sxa = sx;
        sd += (sd ? " L" : "M") + P(sx, SY(snowTop(wx)));
        sxb = sx;
      }
      const bot = (VH * zoom + 80).toFixed(1);
      L.snow.setAttribute("d", `${sd} L${sxb.toFixed(1)},${bot} L${sxa.toFixed(1)},${bot}Z`);

      alps.update({
        camX, refX: camX + VW * CAM_X_FRAC,
        slopeMid: VH * CAM_Y_GROUND + 0.30 * (0.5 - CAM_X_FRAC) * VW,
        drift: alpDrift, ppu: W / VW, veil: alpVeil,
      });
    }

    /* Cliff faces. Without these a gap is just an absence — the ink stops and
       starts again, which reads as a rendering glitch rather than as a hole
       you have to clear. A near lip falling into shadow and a far wall coming
       back up makes it unmistakable from a long way out. */
    let faces = "", shade = "";
    for (const m of marks) {
      if (m.far < x0 - 40 || m.x > x1) continue;
      const nx = SX(m.x), ny = SY(groundAt(m.x - 4));
      const fx = SX(m.far), fy = SY(groundAt(m.far + 4));
      // short and blunt reads as a rock wall; long and thin read as a flagpole
      const depth = 78 + m.gap * 0.26;
      faces += `M${P(nx, ny)} L${P(nx - 5, ny + depth * 0.55)} L${P(nx - 13, ny + depth)}`
             + `M${P(fx, fy)} L${P(fx + 6, fy + depth * 0.5)} L${P(fx + 14, fy + depth * 0.86)}`;
      shade += `M${P(nx, ny)} L${P(nx - 13, ny + depth)} L${P(nx + 26, ny + depth * 0.92)}`
             + ` L${P(nx + 12, ny + 3)} Z`
             + `M${P(fx, fy)} L${P(fx + 14, fy + depth * 0.86)} L${P(fx + 30, fy + depth * 0.5)}`
             + ` L${P(fx + 16, fy + 2)} Z`;
    }
    L.faces.setAttribute("d", faces);
    L.chasmShade.setAttribute("d", shade);

    /* Hachures: short strokes down the fall line, the way a pencil map shows
       steepness. They give the empty paper below the piste something to be —
       which matters most on a tall phone, where the ride line otherwise
       leaves two thirds of the screen blank. Anchored to WORLD x, or they
       crawl across the hill as you move. */
    const HACH = 40;
    let h = "";
    for (let k = Math.ceil(x0 / HACH); k * HACH < x1; k++) {
      const wx = k * HACH;
      if ((wx < 0 && !alps) || (wx >= 0 && overGap(wx))) continue;
      const m = wx < 0 ? backSlope(wx) : slopeAt(wx), th = Math.atan(m);
      const len = (16 + 30 * Math.min(1, Math.abs(m))) * (0.55 + wob(k * 1.7) * 0.9);
      const sx = SX(wx), sy = SY(wx < 0 ? backY(wx) : groundAt(wx));
      h += `M${P(sx, sy)} L${P(sx - Math.sin(th) * len, sy + Math.cos(th) * len)}`;
    }
    L.hach.setAttribute("d", h);

    /* parallax ridgelines: depth by LINE WEIGHT, which is how a pencil
       drawing does depth. They scroll at a fraction of the camera. */
    if (!alps) for (const [el, f, amp, step, seed] of [
      [L.far1, 0.55, 46, 150, 11], [L.far2, 0.34, 68, 210, 29], [L.far3, 0.18, 96, 300, 53],
    ]) {
      const off = camX * f;
      /* The vertical term has to be the camera's DEVIATION from its nominal
         ground line, never camY itself — camY is an absolute world y that
         grows without bound as you descend, so an absolute term marched the
         ranges off the top of the screen after a few hundred metres. */
      const drift = clamp((camY - (y - VH * CAM_Y_GROUND)) * f * 0.35, -VH * 0.3, VH * 0.3);
      const base = VH * (0.52 - (1 - f) * 0.12) - drift;
      let p = "";
      const i0 = Math.floor((off - 100) / step);
      for (let i = i0; i < i0 + Math.ceil(VW * zoom / step) + 4; i++) {
        const px = i * step - off, h = amp * (0.45 + wob(i * seed));
        p += (p ? " L" : "M") + P(px, base - h) + " L" + P(px + step * 0.5, base);
      }
      el.setAttribute("d", p);
    }

    /* Rocks, in solid ink. Outlined ones vanished against white paper —
       the one thing that kills you has to be the darkest thing on screen. */
    const rEls = L.rocks.children;
    let ri = 0;
    for (const r of rocks) {
      if (ri >= rEls.length) break;
      if (r.x < x0 - 60 || r.x > x1) continue;
      const sx = SX(r.x), gy = SY(groundAt(r.x));
      const th = Math.atan(slopeAt(r.x));
      const w = r.r, h = r.r * (0.80 + r.seed * 0.45);
      const g = rEls[ri];
      g.style.display = "";
      g.setAttribute("transform",
        `translate(${P(sx, gy)}) rotate(${(th * 180 / Math.PI).toFixed(1)})`);
      // sitting in the snow rather than floating on the line
      const sh = g.children[0];
      sh.setAttribute("cx", 0); sh.setAttribute("cy", 1);
      sh.setAttribute("rx", (w * 1.15).toFixed(1)); sh.setAttribute("ry", (w * 0.22).toFixed(1));
      // a lumpy silhouette, seeded so it doesn't boil
      const k1 = 0.55 + r.seed * 0.5, k2 = 0.45 + wob(r.x * 1.7) * 0.6;
      g.children[1].setAttribute("d",
        `M${P(-w, 2)} C${P(-w * 1.02, -h * k1)},${P(-w * 0.45, -h * 1.12)},${P(-w * 0.05, -h)}` +
        ` C${P(w * 0.42, -h * 1.06)},${P(w * 0.98, -h * k2)},${P(w, 2)} Z`);
      // one paper-coloured facet, so a big boulder reads as rock not a blob
      g.children[2].setAttribute("d",
        `M${P(-w * 0.42, -h * 0.66)} L${P(-w * 0.05, -h * 0.94)} L${P(w * 0.2, -h * 0.55)} Z`);
      g.children[3].setAttribute("d", `M${P(-w * 0.8, 6)} L${P(w * 0.8, 6)}`);
      ri++;
    }
    for (; ri < rEls.length; ri++) rEls[ri].style.display = "none";

    // the 500 m markers, in the map's own fingerpost idiom
    const sEls = L.signs.children;
    let si = 0;
    for (const m of signs) {
      if (si >= sEls.length || m.x < x0 || m.x > x1) continue;
      const el = sEls[si];
      el.style.display = "";
      el.setAttribute("transform", `translate(${P(SX(m.x), SY(groundAt(m.x)))})`);
      const tx = el.querySelector("text"), want = String(m.m);
      if (tx.textContent !== want) tx.textContent = want;
      si++;
    }
    for (; si < sEls.length; si++) sEls[si].style.display = "none";

    /* Rails, drawn as a piste fence: posts down to the snow and a bar across
       the top. The bar is exactly the line the collision test uses. */
    const railEls = L.railsG.children;
    let li = 0;
    for (const r of rails) {
      if (li >= railEls.length || r.x1 < x0 || r.x0 > x1) continue;
      const el = railEls[li];
      el.style.display = "";
      const ax = SX(r.x0), ay = SY(r.y0), bx = SX(r.x1), by = SY(r.y1);
      el.children[1].setAttribute("d", `M${P(ax, ay)} L${P(bx, by)}`);
      const bridge = r.kind === "bridge";
      el.classList.toggle("sk-rail-bridge", bridge);
      let rig = "";
      const nPost = Math.max(2, Math.round((r.x1 - r.x0) / (bridge ? 46 : 62)));
      for (let k = 0; k <= nPost; k++) {
        const f = k / nPost, wx = r.x0 + (r.x1 - r.x0) * f;
        const tx = SX(wx), ty = SY(r.y0 + (r.y1 - r.y0) * f);
        /* A fence stands on the snow; a bridge hangs over a hole, so posts
           down to a ground that isn't there would look absurd. Planks and a
           sag line instead. */
        rig += bridge
          ? `M${P(tx, ty - 7)} L${P(tx, ty + 6)}`
          : `M${P(tx, ty)} L${P(tx, SY(groundAt(wx)))}`;
      }
      if (bridge) {
        // a handrail sagging between the two lips
        const mid = { x: (ax + bx) / 2, y: (ay + by) / 2 + 26 };
        rig += `M${P(ax, ay - 30)} Q${P(mid.x, mid.y - 30)} ${P(bx, by - 30)}`;
      }
      el.children[0].setAttribute("d", rig);
      el.classList.toggle("sk-rail-live", onRail === r);
      li++;
    }
    for (; li < railEls.length; li++) railEls[li].style.display = "none";

    /* Snow off the edges when you're carving. Nothing communicates speed like
       something being thrown off the back of you. */
    /* Snow off the edges — but only as the payoff for landing a trick, and
       big enough to actually see. A constant trickle read as nothing; a
       rooster tail thrown up the instant you stomp a flip reads as speed. */
    let spray = "";
    if (sprayT > 0 && (state === "snow" || state === "crashed")) {
      const px = sprayX == null ? x : sprayX, py = sprayY == null ? y : sprayY;
      const th = Math.atan(slopeAt(px)), sx = SX(px), sy = SY(py);
      const life = sprayT / SPRAY_MS;
      for (let k = 0; k < 18; k++) {
        const sd = wob(spraySeed + k * 7.7), sd2 = wob(spraySeed + k * 3.3 + 41);
        const age = clamp(life * 1.5 - sd * 0.5, 0, 1);
        if (age <= 0) continue;
        const back = 14 + k * 7 + sd2 * 26;
        const up = (30 + sd * 150) * age;
        const drift = (sd2 - 0.5) * 40 * (1 - age);
        const bx = sx - Math.cos(th) * back, by = sy - Math.sin(th) * back;
        spray += `M${P(bx, by)} Q${P(bx - back * 0.25 + drift, by - up * 0.7)} ` +
                 `${P(bx - back * 0.5 + drift * 1.7, by - up)}`;
      }
      L.spray.style.opacity = (0.75 * Math.min(1, life * 1.6)).toFixed(2);
    }
    L.spray.setAttribute("d", spray);

    // the set pieces
    const pEls = L.props.children;
    let pi = 0;
    for (const pr of props) {
      if (pi >= pEls.length || pr.x < x0 || pr.x > x1) continue;
      const el = pEls[pi];
      if (el.dataset.kind !== String(pr.kind)) { el.innerHTML = PROP_ART[pr.kind]; el.dataset.kind = pr.kind; }
      el.style.display = "";
      el.setAttribute("transform",
        `translate(${P(SX(pr.x), SY(groundAt(pr.x)))}) rotate(${(Math.atan(slopeAt(pr.x)) * 180 / Math.PI).toFixed(1)})`);
      pi++;
    }
    for (; pi < pEls.length; pi++) pEls[pi].style.display = "none";

    // a marker before every big-air lip, so it's a decision not an ambush
    const bEls = L.bigs.children;
    let bi = 0;
    for (const m of megas) {
      const wx = m.from - 240;
      if (bi >= bEls.length || wx < x0 || wx > x1) continue;
      bEls[bi].style.display = "";
      bEls[bi].classList.toggle("sk-big-huge", !!m.huge);
      const bt = bEls[bi].querySelector("text"), bw = m.huge ? "BIG AIR" : "big air";
      if (bt.textContent !== bw) bt.textContent = bw;
      bEls[bi].setAttribute("transform",
        `translate(${P(SX(wx), SY(groundAt(wx)))}) scale(${m.huge ? 1.5 : 1})`);
      bi++;
    }
    for (; bi < bEls.length; bi++) bEls[bi].style.display = "none";

    // hazard signs, planted before each rock cluster
    const wEls = L.warns.children;
    let wi = 0;
    for (const w of warns) {
      if (wi >= wEls.length || w.x < x0 || w.x > x1) continue;
      wEls[wi].style.display = "";
      wEls[wi].setAttribute("transform", `translate(${P(SX(w.x), SY(groundAt(w.x)))})`);
      const label = wEls[wi].lastElementChild;
      const want = w.kind === "gap" ? "crevasse" : "rocks";
      if (label.textContent !== want) label.textContent = want;
      wi++;
    }
    for (; wi < wEls.length; wi++) wEls[wi].style.display = "none";

    // trees, recycled as they pass, at the density the band asks for
    const band = bandAt(x);
    const sp = TREE_SPACING[band.kind];
    for (const t of trees) {
      /* The far bound has to clear the widest spacing (3000, "open"): it
         used to be x1 + 400, so any tree placed more than ~520 past the edge
         was re-placed — and redrawn — every frame, and never arrived. */
      if (t.x < camX - 200 || t.x > x1 + 3400) {
        t.x = camX + VW * zoom + rand(sp[0], sp[1]);
        t.sc = 0;                                 // re-roll its size when it comes round again
        t.el.innerHTML = treeArt(t.kind, Math.floor(t.x));   // and its drawing
      }
      if (t.x < 30 || overGap(t.x)) { t.el.style.display = "none"; continue; }
      if (!t.sc) t.sc = (t.back ? 0.5 : 0.8) + wob(t.x * 0.31) * 0.45;
      const sx = SX(t.x), sy = SY(groundAt(t.x));
      t.el.style.display = "";
      t.el.setAttribute("transform", `translate(${P(sx, sy)}) scale(${t.sc.toFixed(2)})`);
      t.el.style.opacity = t.back ? "0.55" : "";
    }

    /* The lift. Kept visible after the dismount too — the station scrolls
       off behind you within a second, and hiding it at the handoff popped. */
    if (mode === "lift" || L.lift.style.display !== "none") {
      if (mode !== "lift" && x0 > STAT_X + 700) {
        L.lift.style.display = "none";
      } else {
        const a = Math.min(x0 - 60, STAT_X - 1);
        let cd = `M${P(SX(a), SY(cableY(a)))}`;
        if (a < CABLE_BEND) cd += ` L${P(SX(CABLE_BEND), SY(cableY(CABLE_BEND)))}`;
        for (let px = Math.max(a, CABLE_BEND) + 30; px < STAT_X; px += 30)
          cd += ` L${P(SX(px), SY(cableY(px)))}`;
        cd += ` L${P(SX(STAT_X), SY(cableY(STAT_X)))}`;
        L.cable.setAttribute("d", cd);
        /* the top station: one tower and the return wheel */
        const wy = groundAt(STAT_X) - 76;
        // made once and moved, not re-parsed from a string every frame
        if (!L.towers.firstChild) L.towers.innerHTML = `<path class="sk-tower"/><circle class="sk-wheel" r="10"/>`;
        L.towers.firstChild.setAttribute("d", `M${P(SX(STAT_X), SY(groundAt(STAT_X)))} L${P(SX(STAT_X), SY(wy))}`);
        L.towers.lastChild.setAttribute("cx", SX(STAT_X).toFixed(1));
        L.towers.lastChild.setAttribute("cy", SY(wy).toFixed(1));
        L.chair.setAttribute("transform",
          `translate(${P(SX(chairX), SY(cableY(chairX)))}) rotate(${(liftSwing * 57.3).toFixed(1)}) scale(1.25)`);
      }
    }

    if (stats) extrasDraw();

    // the rider
    /* Smaller on the chair, and pushed apart along the seat. At full size two
       ~80-unit passengers on a 60-unit seat are one shape; Felix draws last,
       so his paper fill cuts a clean silhouette over the rider. */
    const rs = mode === "lift" ? 1.0 : 1.35;
    L.rider.setAttribute("transform",
      `translate(${P(SX(x), SY(y))}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(${rs})`);
    L.crash.setAttribute("transform", L.rider.getAttribute("transform"));
    /* Sat up, he isn't on the slope's angle any more — he's on the snow. */
    /* By `ang`, not the slope under him: on the chair he hangs level over
       ground that doesn't exist yet, and slopeAt() there is meaningless. */
    L.seated.setAttribute("transform",
      `translate(${P(SX(x), SY(y))}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(${(1.35 * side).toFixed(2)},1.35)`);
    const crashed = state === "crashed";
    const hide = riderHidden || buried;
    L.rider.style.display  = (!hide && !seated && !crashed) ? "" : "none";
    L.crash.style.display  = (!hide && !seated && crashed) ? "" : "none";
    L.seated.style.display = (!hide && seated) ? "" : "none";
    // climbing out of the crevasse
    if (climbPose) {
      const j = climbPose, q = (p) => P(SX(p[0]), SY(p[1]));
      L.climber.style.display = "";
      L.climbBody.setAttribute("d",
        `M${q(j.P)}L${q(j.S)}M${q(j.S)}L${q(j.H1)}M${q(j.S)}L${q(j.H2)}` +
        `M${q(j.P)}L${q(j.K)}L${q(j.F)}M${q(j.P)}L${q(j.K2)}L${q(j.F2)}`);
      L.climbHead.setAttribute("cx", SX(j.head[0]).toFixed(1));
      L.climbHead.setAttribute("cy", SY(j.head[1]).toFixed(1));
      // the skis, strapped on his back: along his spine, offset behind him
      const tx = j.S[0] - j.P[0], ty = j.S[1] - j.P[1], tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl, uy = ty / tl, bx = uy, by = -ux;     // "behind" him: he faces right
      const ski = (o, a0, a1) => `M${q([j.P[0] - ux * a0 + bx * o, j.P[1] - uy * a0 + by * o])}` +
                                 `L${q([j.S[0] + ux * a1 + bx * o, j.S[1] + uy * a1 + by * o])}`;
      L.climbSkis.setAttribute("d", ski(5, 8, 20) + ski(8.5, 5, 23));
      L.climber.style.opacity = climbFade < 1 ? climbFade.toFixed(2) : "";
    } else L.climber.style.display = "none";

    // the heap of snow he's buried under, skis poking out
    if (buried) {
      L.mound.style.display = "";
      L.mound.setAttribute("transform", `translate(${P(SX(moundX), SY(groundAt(moundX)))}) rotate(${(Math.atan(slopeAt(moundX)) * 57.3).toFixed(1)}) scale(${(1.35 * moundScale).toFixed(2)})`);
    } else L.mound.style.display = "none";
    root.classList.toggle("sk-airborne", state === "air");

    // Felix
    /* Mid-bound he points along his own arc. Borrowing the skier's angle
       meant a dog rotating with your backflip while he was simply jumping. */
    const fth = mode === "lift" && !fHopped ? liftSwing
              : felixAir ? clamp(Math.atan2(felixV, Math.max(60, felixVX)), -0.9, 0.9)
              : Math.atan(slopeAt(felixX));
    /* Reaching UP as well as in: his nose sits 25 units off the ground and
       the seated rider's face is at 40, so leaning alone never got near it. */
    const fs = mode === "lift" ? 0.92 : 1.25;
    const ftf = `translate(${P(SX(felixX), SY(felixY - felixLick * 14))}) ` +
                `rotate(${(fth * 180 / Math.PI + (felixTilt - felixLick * 11) * side).toFixed(1)}) ` +
                `scale(${(fs * side).toFixed(2)},${fs})` +
                (felixSpin ? ` rotate(${felixSpin.toFixed(1)} 4 -14)` : "");
    L.felix.classList.toggle("sk-licking", felixLick > 0.35);
    L.felix.setAttribute("transform", ftf);
    L.felixSit.setAttribute("transform", ftf);
    /* Keyed to the flag, not to the mode: he sits down in `recall` and the
       veil is a mode of its own, so testing the mode stood him back up for
       the half-second of the fade-out. */
    const felixSat = saidBye;
    L.felix.style.display = felixSat || felixOnChair ? "none" : "";
    L.felixSit.style.display = felixSat && !felixOnChair ? "" : "none";
    L.chairRider.style.display = mode === "lift" && liftK < HOP_AT ? "" : "none";
    L.chairFelix.style.display = felixOnChair ? "" : "none";

    const metresNow = Math.floor(x / 20);
    if (mode === "ride" && metresNow !== shownMetres) distEl.textContent = shownMetres = metresNow;
    if (mode === "ride" && pbMark > 0 && !pbBeaten && metresNow > pbMark) {
      pbBeaten = true;                          // once, not every frame
      pbEl.textContent = "new best!";
      pbEl.classList.add("sk-pb-hit");
    }
    const sc = Math.round(score);
    if (sc !== shownScore) L.score.textContent = (shownScore = sc).toLocaleString();
  }

  /* ============================================================
     THE LIFT — the way in
     ============================================================ */

  /* The way in. Towers rise from the snow, the cable runs over them, and
     the chair hangs beneath it climbing away up the mountain — the exact
     opposite energy to the runner's squirrel, which drags you off sideways
     in a panic. Deliberate, calm, and going up before you come down. */
  /* ============================================================
     LIFECYCLE
     ============================================================ */

  function setMode(m) { mode = m; modeT = 0; root.dataset.mode = m; }

  function say(text, mult) {
    L.combo.innerHTML = text + (mult > 1 ? ` <b>&times;${mult}</b>` : "");
    labelT = 1.6;                 // how long the words show — not the chain window
    L.combo.hidden = false;
    L.combo.classList.remove("sk-pop");
    void L.combo.offsetWidth;
    L.combo.classList.add("sk-pop");
  }

  let taught = {}, tipT = 0, labelT = 0, introI = 0;
  function tip(key, text, secs) {
    if (taught[key]) return;
    taught[key] = true;
    L.tip.textContent = text;
    L.tip.hidden = false;
    tipT = secs;
  }
  /* Told properly, in order, over the first few seconds — the old version was
     one line about the button and then nothing, which left rocks, crevasses
     and rails to be discovered by dying at them. Situational tips still fire
     the first time each thing actually turns up. */
  function introTips() {
    const t = TOUCH.matches;
    return [
      [t ? "tap to jump" : "press space to jump", 2.8],
      ["hold it down in the air to backflip", 3.0],
      ["let go early — you must land level with the slope", 3.4],
      ["a red ⚠ sign means rocks ahead: jump them", 3.4],
      ["flips build a multiplier, and the multiplier makes you faster", 3.6],
    ];
  }

  function teach() {
    if (tipT > 0) return;

    // the briefing, one line at a time
    const intro = introTips();
    if (introI < intro.length) {
      const [text, secs] = intro[introI];
      introI++;
      tip("intro" + introI, text, secs);
      return;
    }

    const t = TOUCH.matches;
    if (state === "air" && airT > 0.35 && !taught.flip) {
      tip("flip", "hold to flip — let go to land level", 3.0);
      return;
    }
    const soonMark = marks.find((m) => m.x - x > 240 && m.x - x < 1100);
    if (soonMark && soonMark.bridged && !taught.bridge) {
      tip("bridge", "too wide to jump — land on the bridge and grind across", 3.8);
      return;
    }
    if (soonMark && !taught.gap) {
      tip("gap", "a crevasse — too wide to coast: jump it", 3.4);
      return;
    }
    const railSoon = rails.some((r) => r.kind !== "bridge" && r.x0 - x > 200 && r.x0 - x < 900);
    if (railSoon && !taught.rail) {
      tip("rail", "land on the fence to grind it — it keeps your combo alive", 3.6);
    }
  }

  /* `withLift` only on the way in from the map. Riding up is the theatrics
     of arriving; sitting through it again on every retry is a toll. */
  /* "go again": a quick puff of cloud over the cut, rather than snapping
     straight from the stamp to the top of the hill */
  function retry() {
    clearTimeout(overTimer);
    if (retrying) return;
    if (!window.cloudWipe) { reset(); return; }
    retrying = true;
    window.cloudWipe.cover(1000).then(() => {
      if (!retrying) return;               // quit while the cloud came in
      retrying = false;
      reset();
      setTimeout(() => window.cloudWipe.clear(1300), 150);
    });
  }

  function reset(withLift) {
    wantStop = false;
    resetTerrain();
    summitY = groundAt(0);
    alpSeed = (Math.random() * 2147483647) | 0;
    alpVeil = 1; alpDrift = 0;
    if (alps) alps.reset(alpSeed, VW, VH);
    x = 40; y = groundAt(x); ang = Math.atan(slopeAt(x));
    vx = vy = 0; speed = SPEED_0;
    state = "snow"; airT = 0; spun = 0; spinW = 0; coyote = 0; buffer = 0;
    flips = 0; combo = 0; comboT = 0; score = 0; banked = 0; bankT = 0; sprayT = 0;
    L.meterWrap.hidden = true; L.mult.hidden = true; L.bank.hidden = true;
    held = false; flipArmed = false; down.clear();
    felixX = x - FELIX_GAP; felixY = groundAt(felixX); felixV = 0; felixVX = 0; felixAir = false; felixLeapFor = null;
    /* Spread the trees down the hill. They were all created at x = 0 and only
       moved once they scrolled out behind you, so the first screen of every
       run was one stack of trees at the start gate and then bare snow. */
    onRail = null; railDist = 0;
    L.spray.setAttribute("d", "");
    /* Every bit of ending state, or a replay inherits the last run's — the
       white still up, Felix still sat down, the camera still parked on a
       crevasse two thousand metres back. */
    settleNext = null; endMetres = 0; saidBye = false; felixLick = 0; seated = false;
    veilClouded = false;
    endKind = "slide"; endBest = false; buried = false; riderHidden = false;
    moundScale = 1; climbFade = 1; felixTilt = 0; felixSpin = 0; plan = null; side = 1; climbPose = null;
    L.felix.classList.remove("sk-licking");
    /* Put the poses back too, or the first frame of a replay renders with
       whatever the ending left showing. */
    L.seated.style.display = "none";
    L.crash.style.display = "none";
    L.rider.style.display = "";
    L.lift.style.display = "none";
    root.classList.remove("sk-riding-up");
    sprayX = sprayY = null; camHold = false;
    L.white.setAttribute("opacity", "0");
    L.felix.style.display = ""; L.felixSit.style.display = "none";
    trees.forEach((t, i) => {
      t.x = x + 120 + (i / trees.length) * VW * 2.4 + wob(i * 4.7) * 180;
      t.sc = 0;
    });
    dusk = 0; whiteout = 0; bandSeed = Math.random() * 1000;
    // none of this is undone anywhere else, so a replay inherited the last run's night
    root.classList.remove("sk-night");
    L.stars.style.setProperty("--sk-dusk", "0"); lastDusk = "0.00";
    root.style.removeProperty("--sk-cadence");
    L.far1.style.opacity = L.far2.style.opacity = L.far3.style.opacity = "";
    L.hach.style.opacity = L.slope.style.opacity = L.trees.style.opacity = "";
    zoom = 1; lastZoom = 1;
    svg.setAttribute("viewBox", `0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}`);
    camX = x - VW * CAM_X_FRAC; camY = y - VH * CAM_Y_GROUND;
    taught = {}; tipT = 0; introI = 0; L.tip.hidden = true; L.combo.hidden = true;
    overBox.hidden = true;
    root.classList.remove("sk-done");
    distEl.textContent = "0"; shownMetres = 0; shownScore = -1;
    pbMark = bestOf();
    pbBeaten = false;
    pbEl.hidden = pbMark <= 0;                 // "best 0 m" is just noise
    pbEl.textContent = `best ${pbMark} m`;
    pbEl.classList.remove("sk-pb-hit");
    L.shout.hidden = true;
    extrasReset(withLift);
    if (withLift) {
      /* Open mid-cable, sat down, travelling RIGHT — the same direction the
         map's boarding scene carried them off in. */
      seated = false; riderHidden = true; felixOnChair = true;   // both drawn as part of the chair
      chairX = LIFT_START; liftK = 0; hopped = false; fHopped = false;
      x = chairX + 2; y = cableY(chairX) + LIFT_SEAT; ang = 0;
      felixX = chairX + 26; felixY = y;
      L.lift.style.display = "";
      root.classList.add("sk-riding-up");
      setMode("lift");
    } else {
      felixOnChair = false;
      setMode("ride");
    }
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    step(dt);
    if (mode !== "idle") raf = requestAnimationFrame(tick);
  }

  function step(dt) {
    modeT += dt;
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) L.tip.hidden = true; }
    if (labelT > 0) { labelT -= dt; if (labelT <= 0) L.combo.hidden = true; }
    if (comboT > 0) {
      comboT -= dt;
      L.meter.style.transform = `scaleX(${(comboT / COMBO_HOLD).toFixed(3)})`;
      L.meterWrap.hidden = combo < 1;
      /* The multiplier stays up for the whole window, not just while the
         words are showing — otherwise you're watching a bar drain with no
         idea what it's counting down or what you lose when it does. */
      L.mult.hidden = combo < 2;
      const mt = "\u00d7" + combo;
      if (L.mult.textContent !== mt) L.mult.textContent = mt;
      if (comboT <= 0) {
        // bank it, visibly, so the chain paid for something
        if (banked > 0) { L.bank.textContent = "+" + Math.round(banked).toLocaleString();
                          L.bank.hidden = false; bankT = 1.3; }
        banked = 0; combo = 0;
        L.meterWrap.hidden = true; L.mult.hidden = true;
      }
    }
    if (bankT > 0) { bankT -= dt; if (bankT <= 0) L.bank.hidden = true; }
    if (sprayT > 0) sprayT -= dt;
    if (stats) extrasAlways(dt);


    if (mode === "ride") {
      if (state === "snow") snowStep(dt);
      else if (state === "rail") railStep(dt);
      else if (state === "air") airStep(dt);
      if (wantStop && mode === "ride" && state === "snow") { wantStop = false; leaveRun(); }
      ensure(x + VW + 1400);
      teach();

      // rocks
      for (const r of rocks) {
        if (r.hit || Math.abs(r.x - x) > r.r * 0.8 + 12 + speed * dt * 0.5) continue;
        if (state === "rail") continue;
        if (state === "air" && y < groundAt(r.x) - r.r * 1.15) continue;
        r.hit = true;
        crash("clipped a rock");
        break;
      }
      if (mode === "ride") extrasStep(dt);
      score = Math.max(score, 0);

      /* A whiteout thins the ink toward the paper so you read the slope by
         feel. It never touches the rider or Felix — losing yourself is not
         a difficulty, it's a bug. */
      const b = bandAt(x);
      whiteout = b.kind === "whiteout" ? b.blend : 0;
      const veil = 1 - whiteout * 0.82;
      /* Multiply into each layer's AUTHORED alpha. Writing the veil straight
         on beat .sk-ridge-1/2/3's own opacities and flattened the parallax
         into one flat grey for the ~75% of a run that isn't a whiteout. */
      L.far1.style.opacity = (0.62 * veil).toFixed(3);
      L.far2.style.opacity = (0.40 * veil).toFixed(3);
      L.far3.style.opacity = (0.24 * veil).toFixed(3);
      L.hach.style.opacity = (0.30 * (1 - whiteout * 0.95)).toFixed(3);
      L.slope.style.opacity = (1 - whiteout * 0.45).toFixed(3);
      L.trees.style.opacity = veil.toFixed(3);
      alpVeil = veil;

      // light drifts as you descend
      dusk = clamp((x - 9000) / 26000, 0, 1);
      /* on the stars, the only thing that reads it, and only when it moves:
         set on the root every frame it restyled the whole run, every frame */
      const dk = dusk.toFixed(2);
      if (dk !== lastDusk) { lastDusk = dk; L.stars.style.setProperty("--sk-dusk", dk); }
      root.classList.toggle("sk-night", dusk > 0.55);
    } else if (mode === "lift") {
      liftStep(dt);
    } else if (mode === "dropin") {
      dropStep(dt);
    } else if (mode === "settle") {
      settleStep(dt);
    } else if (mode === "veil") {
      /* Out through the cloud bank the run opened from, and the map opens
         out of it on the other side. Falls back to whitening to paper if
         the map's cloud isn't there. */
      if (window.cloudWipe) {
        if (!veilClouded) { veilClouded = true; window.cloudWipe.cover(1700); }
        if (modeT >= 1.85) { quit(); return; }
      } else {
        L.white.setAttribute("opacity", clamp(modeT / (VEIL_MS / 1000), 0, 1).toFixed(3));
        if (modeT >= VEIL_MS / 1000) { quit(); return; }
      }
    } else if (mode === "recall") {
      recallStep(dt);
    }

    // camera
    /* Zoom out with height. On a mega lip you end up hundreds of units above
       the snow, and pulling the frame back is the whole reason it reads as
       enormous rather than just as a long hang — you can suddenly see the
       hillside you're sailing over. */
    /* Hard-clamped: whatever the terrain does, the frame stays somewhere the
       skier and the hill are both in it. */
    const above = clamp((groundAt(x) - y) - CAM_AIR_DEAD, 0, CAM_AIR_BIG);
    if (mode === "lift") {
      /* Close enough to see two of them sat in a chair, opening out to the
         run's own framing by the time they step off. At full zoom the whole
         rig is thirty pixels of ink and reads as a smudge on a wire. */
      zoom = lerp(LIFT_ZOOM, 1, clamp((liftK - 0.55) / 0.45, 0, 1));
    } else if (mode === "dropin") {
      // out for a look at the valley, then back in for the run
      const t = clamp(modeT / (DROP_MS / 1000), 0, 1);
      zoom = 1 + 0.6 * smoothstep(0, 0.35, t) * (1 - smoothstep(0.58, 0.9, t));
    } else {
      const wantZoom = 1 + (above / CAM_AIR_BIG) * CAM_ZOOM;
      zoom += (wantZoom - zoom) * Math.min(1, dt / (wantZoom > zoom ? 0.32 : 0.85));
    }
    if (Math.abs(zoom - lastZoom) > 0.004) {
      lastZoom = zoom;
      svg.setAttribute("viewBox",
        `0 0 ${(VW * zoom).toFixed(0)} ${(VH * zoom).toFixed(0)}`);
    }
    const zw = VW * zoom, zh = VH * zoom;
    if (mode === "lift") {
      /* Track the RIDER (who is the seat until the hop), blending into the
         run's own framing over the last stretch — at liftK 1 the two
         formulas give the same number, so the handoff has nothing to snap. */
      const runY = groundAt(x + zw * CAM_AHEAD) - zh * CAM_Y_GROUND;
      const b = clamp((liftK - 0.70) / 0.30, 0, 1);
      const sm = b * b * (3 - 2 * b);
      camX = x - zw * CAM_X_FRAC;
      camY = lerp((cableY(chairX) + LIFT_SEAT) - zh * 0.42, runY, sm);
    } else if (!camHold) {
      /* In the ending the camera GLIDES to its spot: climbing out of a
         crevasse moves him a few hundred units from where the frame was
         parked, and setting camX outright snapped the whole scene across. */
      const wantX = x - zw * CAM_X_FRAC;
      camX = (mode === "recall" || mode === "veil") ? camX + (wantX - camX) * Math.min(1, dt / 0.55) : wantX;
      const hill = groundAt(x + zw * CAM_AHEAD);
      const targetY = hill - zh * CAM_Y_GROUND - Math.min(above, CAM_AIR_MAX) * CAM_AIR_GAIN;
      camY += (targetY - camY) * Math.min(1, dt / CAM_TAU);
    }
    /* Only while riding — a fall down a crevasse leaves the rider hundreds of
       units below a parked camera, and the ranges would lurch with him. */
    if (mode === "ride") {
      const tgt = clamp((camY - (y - VH * CAM_Y_GROUND)) * 0.35, -VH, VH);
      alpDrift += (tgt - alpDrift) * Math.min(1, dt / 0.4);
    }

    /* the landing thump rides on top of the camera, never into it */
    camY += dip;
    draw();
    camY -= dip;
  }

  /* ---------- ending ---------- */

  function finish(why) {
    setMode("over");
    root.classList.add("sk-done");
    /* endMetres is pinned at the moment of the fall, not read now — he
       slides on for most of a second afterwards and the counter ticking up
       after you've crashed reads as the game still giving you credit. */
    const { metres, best: b, isBest } = recordBest();
    endBest = isBest && metres > 0;
    const levelled = bankGoals();
    L.goalToast.hidden = true; goalToastT = 0;
    L.alert.hidden = true; L.avEdge.hidden = true;
    distEl.textContent = metres;            // the HUD and the stamp agree
    if (levelled) {
      L.overGoals.innerHTML = `<p class="sk-goals-head">all three done!</p><p class="sk-goal sk-goal-new">new goals unlocked — set ${goalSet + 1}</p>`;
    } else renderGoalList(L.overGoals, true);

    $("#skWhy", root).textContent = why;
    $("#skFinal", root).textContent = metres;
    $("#skBest", root).textContent =
      (isBest && metres > 0 ? "a new best" : `best ${b} m`) +
      (flips ? ` · ${flips} flip${flips > 1 ? "s" : ""} · ${Math.round(score).toLocaleString()} pts` : "");
    overBox.hidden = false;
    L.bar.style.animation = "none";
    void L.bar.offsetWidth;
    L.bar.style.animation = `sk-drain ${OVER_WAIT_MS}ms linear forwards`;
    overTimer = setTimeout(() => startRecall(), OVER_WAIT_MS);
  }

  /* He skids to a stop and comes back to check on you — the mirror of the
     runner's ending, where you are the one calling him. */
  /* Leaving on purpose: carve to a stop first, then he comes over. Pressing
     it again at any point skips whatever beat is playing. */
  function leaveRun() {
    /* already on the way out (the closing cloud), or already on the way
       back in (the "go again" cloud): nothing to do. Falling through to
       startRecall() here replayed the whole walk-back under the cloud, and
       quitting mid-retry left a hidden run going that later re-covered the
       map in cloud for good. */
    if (mode === "veil" || mode === "idle" || retrying) return;
    if (mode === "lift" || mode === "dropin") { quit(); return; }   // nothing skied, nothing to sign off
    /* mid-air or on a rail, the stop waits for the landing: carving to a halt
       from there dropped him to the snow in one frame, or left him hanging
       over a crevasse */
    if (mode === "ride" && state !== "snow") { wantStop = true; return; }
    if (mode === "ride") { endKind = "stop"; beginSettle("stop", startRecall); endBest = recordBest().isBest; bankGoals(); return; }
    if (mode === "settle") { const n = settleNext; settleNext = null; if (n) n(); return; }
    startRecall();
  }

  /* Your distance is yours whether you crashed or walked away — bailing out
     at 900 m used to bank nothing at all. */
  function recordBest() {
    const metres = endMetres || Math.floor(x / 20);
    let b = 0;
    try { b = parseInt(localStorage.getItem("fieldnotes-ski-best") || "0", 10) || 0; } catch (_) {}
    const isBest = metres > b;
    if (isBest) { b = metres; try { localStorage.setItem("fieldnotes-ski-best", String(b)); } catch (_) {} }
    best = b;
    if (typeof window.onRunFinished === "function") window.onRunFinished(b);
    return { metres, best: b, isBest };
  }

  let recallFromX = 0;
  function startRecall() {
    clearTimeout(overTimer);
    if (mode === "recall") { quit(); return; }
    overBox.hidden = true;
    const kind = endKind;
    let lipX = null;
    side = 1;
    if (camHold) {
      /* Down a crevasse. He climbs out on the FAR lip — the side he was
         heading for, and the side Felix (who leaps them) ends up on — not
         back on the near one. Hidden just under the far lip to start, and
         the camera glides over rather than jumping (see the camera). */
      lipX = crevFar;
      x = lipX - 6;
      y = groundAt(lipX + 2) + 70;
      vx = 0; vy = 0; speed = 0;
      ang = 0;
      side = -1;
      camHold = false;
    } else {
      y = buried ? groundAt(moundX) : groundAt(x);
      if (buried) x = moundX;
    }
    seated = true;
    riderHidden = buried || kind === "crevasse";
    /* The script, in seconds. Every ending runs up, licks and sits; the
       crevasse and the avalanche each add a beat of their own before the
       lick, and a new best adds a celebration before the sign-off. */
    const beats = [["arrive", BEAT_ARRIVE]];
    if (kind === "buried") beats.push(["dig", BEAT_DIG]);
    if (kind === "crevasse") beats.push(["peer", BEAT_PEER], ["climb", BEAT_CLIMB]);
    beats.push(["lick", BEAT_LICK]);
    if (endBest) beats.push(["spin", BEAT_SPIN]);
    beats.push(["sit", BEAT_SIT]);
    let at = 0;
    plan = { kind, lipX, beats: beats.map(([name, len]) => { const b0 = at; at += len; return { name, t0: b0, t1: at }; }),
             total: at, fired: {} };
    if (kind === "crevasse") {
      // on the far lip, facing back across the hole, to peer down into it
      plan.felixSpot = lipX + 40;
      plan.felixY0 = felixY;
      plan.leap = felixX < lipX;          // still on the near side: he jumps it
    } else if (kind === "buried") {
      plan.felixSpot = moundX - 38;
    } else {
      plan.felixSpot = x - 44;
    }
    L.shout.hidden = false;
    L.shout.textContent = kind === "stop" ? "good run" : kind === "buried" ? "hang on!" : "you alright?";
    saidBye = false; felixLick = 0; felixTilt = 0; felixSpin = 0;
    recallFromX = felixX;
    setMode("recall");
    if (raf === 0) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }

  /* The climber's joints, in world units, for progress u through the climb.
     E is the far lip's edge; the hole is to the left of it. Four phases:
     up the wall from deep in the hole, hand over hand with his feet
     scrabbling for holds; hanging off the lip and hauling; a knee over
     onto the snow; and up onto his feet. Nothing is clipped — you see all
     of him the whole way up, against the far wall. */
  let climbPose = null;
  const CLIMB_WALL = 0.5, CLIMB_HAUL = 0.65, CLIMB_KNEE = 0.84;
  function climbJoints(ex, ey, u) {
    const ez = (v) => v * v * (3 - 2 * v);
    const L2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const W = clamp(u / CLIMB_WALL, 0, 1);
    const A = ez(clamp((u - CLIMB_WALL) / (CLIMB_HAUL - CLIMB_WALL), 0, 1));
    const B = ez(clamp((u - CLIMB_HAUL) / (CLIMB_KNEE - CLIMB_HAUL), 0, 1));
    const C = ez(clamp((u - CLIMB_KNEE) / (1 - CLIMB_KNEE), 0, 1));
    let S, P, K, F, K2, F2, H1, H2, head;
    if (u < CLIMB_WALL) {                  // up the wall, one reach at a time
      /* four pulls, like a ladder of holds: a heave (his body comes up to
         his hands, which stay put on their holds) and then a reach (one
         hand lets go and goes up to the next hold). Hands alternate, and
         he starts deep enough that you watch him come all the way up. */
      const N = 4, n = W * N, k = Math.min(N - 1, Math.floor(n)), f = n - k, h = 80 / N;
      const lift = k + ez(clamp(f / 0.55, 0, 1));
      S = [ex - 8, ey + 98 - h * lift];
      P = [S[0] - 4, S[1] + 22];
      const rz = (T0) => ez(clamp((n - T0) / 0.45, 0, 1));
      const arcs = (T0) => Math.sin(Math.PI * clamp((n - T0) / 0.45, 0, 1)) * 5;   // off the wall as it reaches
      const hand = (first) => {
        let l = 0, off = 0;
        for (let j = first; j < N; j += 2) { l = lerp(l, j + 1, rz(j + 0.55)); off += arcs(j + 0.55); }
        return [ex - 1 + first * 2 - off, ey + 98 - 17 - h * l];
      };
      H1 = hand(0); H2 = hand(1);
      // the last pull ends with both hands on the lip, where the haul starts
      const g = ez(clamp((W - 0.85) / 0.15, 0, 1));
      H1 = L2(H1, [ex + 4, ey - 1], g); H2 = L2(H2, [ex + 10, ey - 1], g);
      // feet kicking for holds on the wall, alternating with the hands
      const kick = Math.sin(n * Math.PI * 2) * 4;
      K = [P[0] + 7, P[1] + 10 + kick]; F = [ex - 2, P[1] + 22 + kick];
      K2 = [P[0] + 5, P[1] + 12 - kick]; F2 = [ex - 3, P[1] + 25 - kick];
      // and into the hanging pose the haul starts from
      K = L2(K, [P[0] + 3, P[1] + 13], g); F = L2(F, [P[0], P[1] + 26], g);
      K2 = L2(K2, [P[0] - 2, P[1] + 13], g); F2 = L2(F2, [P[0] - 1, P[1] + 26], g);
      head = [S[0] + 3, S[1] - 11];
    } else if (u < CLIMB_HAUL) {           // hanging off the lip, hauling up
      S = [ex - 8, ey + 18 - 24 * A];
      S[0] = lerp(ex - 8, ex - 7, A);
      P = [S[0] - 4, S[1] + 22];
      K = [P[0] + 3, P[1] + 13]; F = [K[0] - 3, K[1] + 13];
      K2 = [P[0] - 2, P[1] + 13]; F2 = [K2[0] + 1, K2[1] + 13];
      H1 = [ex + 4, ey - 1]; H2 = [ex + 10, ey - 1];
      head = [S[0] + 3, S[1] - 11];
    } else if (u < CLIMB_KNEE) {           // over the edge, a knee onto the snow
      S = L2([ex - 7, ey - 6], [ex + 14, ey - 13], B);
      P = L2([ex - 11, ey + 16], [ex, ey - 5], B);
      K = L2([ex - 8, ey + 29], [ex + 7, ey - 2], B); F = L2([ex - 11, ey + 42], [ex + 1, ey - 1], B);
      K2 = L2([ex - 13, ey + 29], [ex - 2, ey + 6], B); F2 = L2([ex - 12, ey + 42], [ex - 6, ey + 12], B);
      H1 = L2([ex + 4, ey - 1], [ex + 18, ey - 1], B); H2 = L2([ex + 10, ey - 1], [ex + 24, ey - 1], B);
      head = [S[0] + 5, S[1] - 9];
    } else {                               // and up onto his feet
      P = L2([ex, ey - 5], [ex + 16, ey - 22], C);
      S = [P[0] + lerp(14, 1, C), P[1] + lerp(-8, -18, C)];
      K = L2([ex + 7, ey - 2], [ex + 19, ey - 11], C); F = L2([ex + 1, ey - 1], [ex + 18, ey], C);
      K2 = L2([ex - 2, ey + 6], [ex + 13, ey - 11], C); F2 = L2([ex - 6, ey + 12], [ex + 12, ey], C);
      H1 = L2([ex + 18, ey - 1], [S[0] + 5, S[1] + 13], C); H2 = L2([ex + 24, ey - 1], [S[0] - 3, S[1] + 13], C);
      head = [S[0] + lerp(5, 1, C), S[1] + lerp(-9, -11, C)];
    }
    return { S, P, K, F, K2, F2, H1, H2, head };
  }

  /* One frame of the walk-back. */
  function recallStep(dt) {
    const t = modeT;
    const beat = plan.beats.find((b) => t < b.t1) || plan.beats[plan.beats.length - 1];
    const u = clamp((t - beat.t0) / (beat.t1 - beat.t0), 0, 1);
    const once = (key, fn) => { if (!plan.fired[key]) { plan.fired[key] = true; fn(); } };
    felixLick = 0; felixTilt = 0; felixSpin = 0;
    const home = x - 44 * side;
    let airborne = false;

    /* the climb's last frame is never u = 1 — the next beat takes over first
       — so whichever beat follows it finishes him getting up */
    const sitUp = () => once("sat", () => { climbPose = null; riderHidden = false; puff(8, 120, 120); });
    if (climbPose && beat.name !== "climb") sitUp();

    if (beat.name === "arrive") {
      const e = 1 - Math.pow(1 - u, 2.4);
      felixX = lerp(recallFromX, plan.felixSpot, e);
      if (plan.leap) {
        // a bound across the crevasse, not a float
        airborne = u < 1;
        felixY = lerp(plan.felixY0, groundAt(plan.felixSpot), e) - Math.sin(Math.PI * e) * 70;
      }
    } else if (beat.name === "dig") {
      /* Head down, paws going, snow flying out behind him; the heap shrinks
         until the rider pops out of it. */
      felixX = plan.felixSpot;
      felixTilt = 16 + 8 * Math.sin(t * 34);
      moundScale = lerp(1, 0.5, u);
      if (Math.random() < 0.7) {
        if (puffs.length > 90) puffs.shift();
        puffs.push({ x: felixX + 20, y: felixY - 8, vx: -120 - Math.random() * 160, vy: -150 - Math.random() * 140,
                     t: 0, life: 0.5, r: 1.8 + Math.random() * 2 });
      }
      if (u > 0.92) once("pop", () => {
        buried = false; riderHidden = false;
        x = moundX; y = groundAt(x);
        puff(16, 200, 220);
        L.shout.textContent = "you alright?";
      });
    } else if (beat.name === "peer") {
      // at the lip, nose down into the hole
      felixX = plan.felixSpot;
      felixTilt = 24 * Math.min(1, u * 4);
      once("q", () => floatText(felixX + 30 * side, felixY - 50, "?", true));
    } else if (beat.name === "climb") {
      /* A real climb, with his skis strapped to his back: hands find the
         lip, he hauls his shoulders up, swings a knee over, and stands up
         on the far side. Then he plonks down in the snow for Felix. */
      // Felix keeps watching him come up the wall, then backs off to give him room
      felixX = lerp(plan.felixSpot, plan.lipX + 62, smoothstep(0.5, 0.78, u));
      felixTilt = 24 * (1 - smoothstep(0.42, 0.58, u));
      riderHidden = true;
      climbPose = climbJoints(plan.lipX, groundAt(plan.lipX + 2), u);
      climbFade = smoothstep(0, 0.07, u);      // up out of the dark at the bottom of the hole
      x = plan.lipX + 16; y = groundAt(x);
      if (u >= 1) sitUp();
    } else if (beat.name === "lick") {
      // step in to his spot first, then three licks (abs(): sin(3*pi*u) has
      // only two positive humps, and three is what the shape reads as)
      if (plan.lickFrom == null) plan.lickFrom = felixX;
      const into = 1 - Math.pow(1 - Math.min(1, u * 5), 2);
      felixLick = Math.abs(Math.sin(u * Math.PI * 3)) * (0.58 + 0.42 * Math.sin(u * Math.PI)) * into;
      felixX = lerp(plan.lickFrom, home, into) + felixLick * 11 * side;
    } else if (beat.name === "spin") {
      // a new best: two spins on the spot and a burst of powder
      felixX = home;
      felixSpin = -720 * (1 - Math.pow(1 - u, 2));
      once("best", () => { floatText(x, y - 80, "new best!", true); puff(18, 230, 240); });
    } else if (beat.name === "sit") {
      felixX = home;
      once("bye", () => { saidBye = true; L.shout.textContent = "time to call it a day, same time tomorrow?"; });
    }

    if (!airborne) { const g = felixGround(felixX); if (g != null) felixY = g; }
    root.style.setProperty("--sk-cadence", beat.name === "arrive" ? "200ms" : beat.name === "dig" ? "90ms" : "620ms");
    if (t >= plan.total) { setMode("veil"); return; }
  }

  function quit() {
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(overTimer);
    retrying = false;
    mode = "idle";
    overBox.hidden = true;
    L.shout.hidden = true;
    L.tip.hidden = true;
    L.combo.hidden = true;
    root.hidden = true;
    removeEventListener("keydown", onKey, true);
    removeEventListener("keyup", onKeyUp, true);
    root.removeEventListener("pointerdown", onDown);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp);
    removeEventListener("blur", onBlur);
    removeEventListener("resize", measure);
    document.body.classList.remove("running-game");
    if (onExit) onExit();
  }

  function start(opts) {
    if (!root) build();
    onExit = (opts && opts.onExit) || null;
    root.hidden = false;
    root.classList.toggle("sk-night-start", !!(opts && opts.night));
    document.body.classList.add("running-game");
    measure();
    addEventListener("keydown", onKey, true);
    addEventListener("keyup", onKeyUp, true);
    root.addEventListener("pointerdown", onDown);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
    addEventListener("blur", onBlur);
    addEventListener("resize", measure);
    reset(true);
  }

  function bestOf() {
    try { return parseInt(localStorage.getItem("fieldnotes-ski-best") || "0", 10) || 0; }
    catch (_) { return 0; }
  }

  return {
    start, best: bestOf, KEEPSAKE_AT,
    _step: (dt) => step(dt),
    /* what's coming, so a test can autopilot the run */
    _probe: () => {
      let rock = Infinity;
      for (const r of rocks) if (!r.hit && r.x > x) rock = Math.min(rock, r.x - x);
      let gap = Infinity, gm = null;
      for (const m of marks) if (m.x > x && m.x - x < gap) { gap = m.x - x; gm = m; }
      let rail = Infinity, railLift = 0;
      for (const r of rails) if (r.x0 > x && r.x0 - x < rail) { rail = r.x0 - x; railLift = groundAt(r.x0) - r.y0; }
      let mega = Infinity;
      for (const m of megas) if (m.x > x && m.x - x < mega) mega = m.x - x;
      return { rock, gap, gapLen: gm ? Math.round(gm.gap) : 0, gapBridged: !!(gm && gm.bridged),
               rail, railLift, mega, over: overGap(x), state, x, speed, y,
               above: Math.round(groundAt(x) - y), ground: Math.round(groundAt(x)),
               metres: Math.floor(x / 20) };
    },
    _press: () => press(), _release: () => release(),
    _forceAvalanche: (gap) => { av = { phase: "chase", t: 0, gap, front: x - gap }; },
    /* Felix's footing, so a test can prove he never drops through the world */
    _felix: () => ({ x: felixX, y: felixY, vy: felixV, air: felixAir,
                     over: overGap(felixX), ground: felixGround(felixX),
                     bridged: (() => { const m = voidAt(felixX); return !!(m && m.bridged); })() }),
    _dbg: () => ({ mode, modeT, state, x, y, vx, vy, speed, ang, spun, airT, flips, score,
                   settleKind, settleHasNext: !!settleNext, saidBye,
                   stats: stats && { ...stats }, goalSet, goalDone: goalDone.slice(), lastOff, lastLandAir,
                   av: av && { phase: av.phase, gap: Math.round(av.gap), t: +av.t.toFixed(2) },
                   combo, comboT: +comboT.toFixed(2),
                   flakesLive: flakes.filter((f) => !f.got).length, goat: !!goat,
                   grade, knots: K.length, rocks: rocks.length, marks: marks.length }),
    /* Build terrain offline and report it, so the fairness of a long run
       can be checked without having to survive one. */
    _audit(toX) {
      /* resetTerrain() zeroes the ring, so a mid-run audit would leave the
         player reading terrain that no longer exists. Snapshot it too. */
      const save = { x, K, cur, rocks, marks, signs, warns, clearZones, grade,
                     sinceBreather, sinceChasm, bakeI, nextSign,
                     Y: Y.slice(), M: M.slice(), GAP: GAP.slice() };
      resetTerrain();
      x = 0;
      const gaps = [], bridged = [];
      let guard = 0;
      while (cur.x < toX && guard++ < 4000) {
        const before = marks.length;
        emitFeature(); bake();
        for (let i = before; i < marks.length; i++) {
          const m = marks[i];
          const sLip = slopeAt(m.x - 2);
          const gLand = slopeAt(m.x + m.gap + 40);
          /* A bridged crevasse is unjumpable ON PURPOSE — the promise it makes
             is that a rail spans it, not that you can clear it. Check the
             thing it actually promises. */
          if (m.bridged) {
            const deck = rails.find((r) => r.kind === "bridge" && r.x0 <= m.x + 20 && r.x1 >= m.far - 20);
            bridged.push({ x: Math.round(m.x), gap: Math.round(m.gap), spanned: !!deck });
            continue;
          }
          gaps.push({ x: Math.round(m.x), gap: Math.round(m.gap), sLip: +sLip.toFixed(3),
                      gLand: +gLand.toFixed(3),
                      coast: Math.round(reach(SPEED_MIN, sLip, gLand)),
                      jumped: Math.round(reachJump(SPEED_MIN, sLip, gLand)) });
        }
      }
      const out = {
        toX, gaps: gaps.length,
        bridges: bridged.length,
        bridgesWithoutADeck: bridged.filter((b) => !b.spanned).length,
        /* Both ends of the promise. Nothing may be unjumpable, and nothing may
           be so narrow the hill clears it for you — a free crevasse is not a
           hazard, it's scenery that happens to be drawn as a hole. */
        unjumpableFromFloor: gaps.filter((g) => g.gap > g.jumped).length,
        coastableFromFloor: gaps.filter((g) => g.gap <= g.coast).length,
        tightest: gaps.length ? +Math.min(...gaps.map((g) => g.jumped / g.gap)).toFixed(2) : null,
        mustJumpBy: gaps.length ? +Math.min(...gaps.map((g) => g.gap / g.coast)).toFixed(2) : null,
        sample: gaps.slice(0, 8),
      };
      ({ x, K, cur, rocks, marks, signs, warns, clearZones, grade,
         sinceBreather, sinceChasm, bakeI, nextSign } = save);
      Y.set(save.Y); M.set(save.M); GAP.set(save.GAP);
      return out;
    },
  };
})();
