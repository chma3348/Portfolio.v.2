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
  const OVER_WAIT_MS = 3000, RECALL_MS = 2400;

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
  let held = false, flipArmed = false;
  let felixX = 0, felixY = 0, felixV = 0, felixAir = false;
  let bandSeed = 0, dusk = 0, whiteout = 0;
  let lastFar = -1e9;

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
    finish(why);
  }

  /* ---------- Felix ----------
     He is company, not a mechanic: he runs the terrain a fixed distance
     behind, bounds over the same crests, and never affects anything. */
  const FELIX_GAP = 96;
  function felixFollow(dt) {
    const want = x - FELIX_GAP;
    felixX += (want - felixX) * Math.min(1, dt * 6);
    const gy = overGap(felixX) ? null : groundAt(felixX);
    if (gy == null) { felixAir = true; felixV += G * dt; felixY += felixV * dt; }
    else if (felixAir) {
      if (felixY >= gy) { felixAir = false; felixV = 0; felixY = gy; }
      else { felixV += G * dt; felixY += felixV * dt; }
    } else {
      felixY = gy;
      // he pops off the same lips the skier does
      if (state === "air" && Math.random() < dt * 3) { felixAir = true; felixV = -320; }
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
    if (mode === "over") { clearTimeout(overTimer); reset(); return; }
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
    if (e.key === "Escape") { e.preventDefault(); startRecall(); return; }
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
      <circle class="sk-f-eye" cx="15.4" cy="-19.9" r="0.8"/>
      <g class="sk-f-leg sk-f-lb2"><path d="M-8,-10 L-10,-5 L-8,0"/></g>
      <g class="sk-f-leg sk-f-lf2"><path d="M9,-9.5 L8,0"/></g>
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
        <g id="skFelix">${FELIX}</g>
        <g id="skRider">${RIDER}</g>
        <g id="skRiderCrash" style="display:none">${RIDER_CRASH}</g>
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
      <div class="sk-over" id="skOver" hidden>
        <div class="sk-stamp">
          <p class="sk-over-why" id="skWhy"></p>
          <p class="sk-over-dist"><span id="skFinal">0</span> m</p>
          <p class="sk-over-best" id="skBest"></p>
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
      far1: $("#skFar1", root), far2: $("#skFar2", root), far3: $("#skFar3", root),
      trees: $("#skTrees", root), slope: $("#skSlope", root), rocks: $("#skRocks", root),
      hach: $("#skHach", root), signs: $("#skSigns", root), warns: $("#skWarns", root),
      bigs: $("#skBigs", root),
      faces: $("#skFaces", root), chasmShade: $("#skChasmShade", root),
      props: $("#skProps", root), railsG: $("#skRails", root), spray: $("#skSpray", root),
      felix: $("#skFelix", root),
      rider: $("#skRider", root), crash: $("#skRiderCrash", root),
      white: $("#skWhite", root), shout: $("#skShout", root), tip: $("#skTip", root),
      combo: $("#skCombo", root), bar: $("#skTimerBar", root),
      meter: $("#skMeter", root), meterWrap: $("#skMeterWrap", root),
      mult: $("#skMult", root), bank: $("#skBank", root),
      score: $("#skScore", root),
    };
    distEl = $("#skDist", root);
    pbEl = $("#skPB", root);
    overBox = $("#skOver", root);

    /* Three silhouettes, so a hillside doesn't read as one stamp repeated:
       a wide fir, a tall narrow spruce, and a bare wind-killed snag. */
    const TREE_ART = [
      `<path class="sk-tw" d="M0,0 L0,-22"/>
       <path class="sk-tw" d="M0,-70 L-20,-14 L20,-14 Z"/>
       <path class="sk-tw" d="M0,-58 L-15,-26 L15,-26 Z"/>`,
      `<path class="sk-tw" d="M0,0 L0,-26"/>
       <path class="sk-tw" d="M0,-96 L-13,-18 L13,-18 Z"/>
       <path class="sk-tw" d="M0,-78 L-9,-40 L9,-40 Z"/>`,
      `<path class="sk-tw" d="M0,0 L1,-52"/>
       <path class="sk-tw" d="M1,-30 L-13,-42 M1,-38 L14,-46 M1,-46 L-9,-58 M1,-24 L11,-31"/>`,
    ];
    for (let i = 0; i < 26; i++) {
      const g = ns("g", { class: "sk-tree" });
      const kind = i % 7 === 0 ? 2 : i % 2;      // snags are the rare one
      g.innerHTML = TREE_ART[kind];
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
    for (let i = 0; i < 40; i++) {
      L.stars.appendChild(ns("circle", {
        cx: (wob(i * 3.1) * 100).toFixed(1) + "%", cy: (wob(i * 7.7) * 42).toFixed(1) + "%",
        r: (0.6 + wob(i * 5.3) * 1.2).toFixed(2), class: "sk-star",
      }));
    }

    $("#skQuit", root).addEventListener("click", () => startRecall());
    $("#skAgain", root).addEventListener("click", () => { clearTimeout(overTimer); reset(); });

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
    SPEED_CAP = clamp(VW * (1 - CAM_X_FRAC) / READ_S, SPEED_MIN, SPEED_MAX);
  }

  /* ============================================================
     DRAW
     ============================================================ */

  const SX = (wx) => wx - camX;
  const SY = (wy) => wy - camY;

  function draw() {
    const x0 = camX - 60, x1 = camX + VW * zoom + 120;

    /* the ride surface: one ink line, nothing beneath it — the paper is
       the snow. Chasms are simply a break in the path. */
    let d = "", pen = false;
    for (let wx = x0; wx < x1; wx += DX * 2) {
      if (overGap(wx)) { pen = false; continue; }
      const sx = SX(wx), sy = SY(groundAt(wx));
      d += (pen ? " L" : " M") + P(sx, sy);
      pen = true;
    }
    L.slope.setAttribute("d", d);

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
      if (overGap(wx)) continue;
      const m = slopeAt(wx), th = Math.atan(m);
      const len = (16 + 30 * Math.min(1, Math.abs(m))) * (0.55 + wob(k * 1.7) * 0.9);
      const sx = SX(wx), sy = SY(groundAt(wx));
      h += `M${P(sx, sy)} L${P(sx - Math.sin(th) * len, sy + Math.cos(th) * len)}`;
    }
    L.hach.setAttribute("d", h);

    /* parallax ridgelines: depth by LINE WEIGHT, which is how a pencil
       drawing does depth. They scroll at a fraction of the camera. */
    for (const [el, f, amp, step, seed] of [
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
      el.querySelector("text").textContent = m.m;
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
    if (sprayT > 0 && state === "snow") {
      const th = Math.atan(slopeAt(x)), sx = SX(x), sy = SY(y);
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
      bEls[bi].querySelector("text").textContent = m.huge ? "BIG AIR" : "big air";
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
      if (t.x < camX - 200 || t.x > x1 + 400) {
        t.x = camX + VW * zoom + rand(sp[0], sp[1]);
        t.sc = 0;                                 // re-roll its size when it comes round again
      }
      if (overGap(t.x)) { t.el.style.display = "none"; continue; }
      if (!t.sc) t.sc = (t.back ? 0.5 : 0.8) + wob(t.x * 0.31) * 0.45;
      const sx = SX(t.x), sy = SY(groundAt(t.x));
      t.el.style.display = "";
      t.el.setAttribute("transform", `translate(${P(sx, sy)}) scale(${t.sc.toFixed(2)})`);
      t.el.style.opacity = (t.back ? 0.5 : 0.8).toFixed(2);
    }

    // the rider
    const rs = 1.35;
    L.rider.setAttribute("transform",
      `translate(${P(SX(x), SY(y))}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(${rs})`);
    L.crash.setAttribute("transform", L.rider.getAttribute("transform"));
    const crashed = state === "crashed";
    L.rider.style.display = crashed ? "none" : "";
    L.crash.style.display = crashed ? "" : "none";
    root.classList.toggle("sk-airborne", state === "air");

    // Felix
    const fth = overGap(felixX) ? ang : Math.atan(slopeAt(felixX));
    L.felix.setAttribute("transform",
      `translate(${P(SX(felixX), SY(felixY))}) rotate(${(fth * 180 / Math.PI).toFixed(1)}) scale(1.25)`);

    const metresNow = Math.floor(x / 20);
    distEl.textContent = metresNow;
    if (pbMark > 0 && !pbBeaten && metresNow > pbMark) {
      pbBeaten = true;                          // once, not every frame
      pbEl.textContent = "new best!";
      pbEl.classList.add("sk-pb-hit");
    }
    L.score.textContent = Math.round(score).toLocaleString();
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

  function reset() {
    resetTerrain();
    x = 40; y = groundAt(x); ang = Math.atan(slopeAt(x));
    vx = vy = 0; speed = SPEED_0;
    state = "snow"; airT = 0; spun = 0; spinW = 0; coyote = 0; buffer = 0;
    flips = 0; combo = 0; comboT = 0; score = 0; banked = 0; bankT = 0; sprayT = 0;
    L.meterWrap.hidden = true; L.mult.hidden = true; L.bank.hidden = true;
    held = false; flipArmed = false; down.clear();
    felixX = x - FELIX_GAP; felixY = groundAt(felixX); felixV = 0; felixAir = false;
    /* Spread the trees down the hill. They were all created at x = 0 and only
       moved once they scrolled out behind you, so the first screen of every
       run was one stack of trees at the start gate and then bare snow. */
    onRail = null; railDist = 0;
    L.spray.setAttribute("d", "");
    trees.forEach((t, i) => {
      t.x = x + 120 + (i / trees.length) * VW * 2.4 + wob(i * 4.7) * 180;
      t.sc = 0;
    });
    dusk = 0; whiteout = 0; bandSeed = Math.random() * 1000;
    // none of this is undone anywhere else, so a replay inherited the last run's night
    root.classList.remove("sk-night");
    root.style.setProperty("--sk-dusk", "0");
    root.style.removeProperty("--sk-cadence");
    L.far1.style.opacity = L.far2.style.opacity = L.far3.style.opacity = "";
    L.hach.style.opacity = L.slope.style.opacity = L.trees.style.opacity = "";
    zoom = 1; lastZoom = 1;
    svg.setAttribute("viewBox", `0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}`);
    camX = x - VW * CAM_X_FRAC; camY = y - VH * CAM_Y_GROUND;
    taught = {}; tipT = 0; introI = 0; L.tip.hidden = true; L.combo.hidden = true;
    overBox.hidden = true;
    root.classList.remove("sk-done");
    distEl.textContent = "0";
    pbMark = bestOf();
    pbBeaten = false;
    pbEl.hidden = pbMark <= 0;                 // "best 0 m" is just noise
    pbEl.textContent = `best ${pbMark} m`;
    pbEl.classList.remove("sk-pb-hit");
    L.shout.hidden = true;
    setMode("ride");
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
      L.mult.textContent = "\u00d7" + combo;
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


    if (mode === "ride") {
      if (state === "snow") snowStep(dt);
      else if (state === "rail") railStep(dt);
      else if (state === "air") airStep(dt);
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

      // light drifts as you descend
      dusk = clamp((x - 9000) / 26000, 0, 1);
      root.style.setProperty("--sk-dusk", dusk.toFixed(3));
      root.classList.toggle("sk-night", dusk > 0.55);
    } else if (mode === "recall") {
      /* He was running behind you; now he catches up, pulls in alongside
         and checks on you. The mirror of the runner's ending, where you
         are the one doing the calling. */
      const t = clamp(modeT / (RECALL_MS / 1000), 0, 1);
      const e = 1 - Math.pow(1 - t, 2.4);
      felixX = lerp(recallFromX, x - 38, e);
      if (!overGap(felixX)) felixY = groundAt(felixX);
      root.style.setProperty("--sk-cadence", t < 0.8 ? "200ms" : "460ms");
      if (t >= 1) { quit(); return; }
    }

    // camera
    /* Zoom out with height. On a mega lip you end up hundreds of units above
       the snow, and pulling the frame back is the whole reason it reads as
       enormous rather than just as a long hang — you can suddenly see the
       hillside you're sailing over. */
    /* Hard-clamped: whatever the terrain does, the frame stays somewhere the
       skier and the hill are both in it. */
    const above = clamp((groundAt(x) - y) - CAM_AIR_DEAD, 0, CAM_AIR_BIG);
    const wantZoom = 1 + (above / CAM_AIR_BIG) * CAM_ZOOM;
    zoom += (wantZoom - zoom) * Math.min(1, dt / (wantZoom > zoom ? 0.32 : 0.85));
    if (Math.abs(zoom - lastZoom) > 0.004) {
      lastZoom = zoom;
      svg.setAttribute("viewBox",
        `0 0 ${(VW * zoom).toFixed(0)} ${(VH * zoom).toFixed(0)}`);
    }
    const zw = VW * zoom, zh = VH * zoom;
    camX = x - zw * CAM_X_FRAC;
    const hill = groundAt(x + zw * CAM_AHEAD);
    const targetY = hill - zh * CAM_Y_GROUND - Math.min(above, CAM_AIR_MAX) * CAM_AIR_GAIN;
    camY += (targetY - camY) * Math.min(1, dt / CAM_TAU);

    draw();
  }

  /* ---------- ending ---------- */

  function finish(why) {
    setMode("over");
    root.classList.add("sk-done");
    const metres = Math.floor(x / 20);
    let b = 0;
    try { b = parseInt(localStorage.getItem("fieldnotes-ski-best") || "0", 10) || 0; } catch (_) {}
    const isBest = metres > b;
    if (isBest) { b = metres; try { localStorage.setItem("fieldnotes-ski-best", String(b)); } catch (_) {} }
    best = b;

    $("#skWhy", root).textContent = why;
    $("#skFinal", root).textContent = metres;
    $("#skBest", root).textContent =
      (isBest && metres > 0 ? "a new best" : `best ${b} m`) +
      (flips ? ` · ${flips} flip${flips > 1 ? "s" : ""} · ${Math.round(score).toLocaleString()} pts` : "");
    overBox.hidden = false;
    L.bar.style.animation = "none";
    void L.bar.offsetWidth;
    L.bar.style.animation = `sk-drain ${OVER_WAIT_MS}ms linear forwards`;
    if (typeof window.onRunFinished === "function") window.onRunFinished(b);
    overTimer = setTimeout(() => startRecall(), OVER_WAIT_MS);
  }

  /* He skids to a stop and comes back to check on you — the mirror of the
     runner's ending, where you are the one calling him. */
  let recallFromX = 0;
  function startRecall() {
    clearTimeout(overTimer);
    if (mode === "recall") { quit(); return; }
    overBox.hidden = true;
    L.shout.hidden = false;
    L.shout.textContent = "you alright?";
    recallFromX = felixX;
    setMode("recall");
    if (raf === 0) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function quit() {
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(overTimer);
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
    reset();
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
    _dbg: () => ({ mode, state, x, y, vx, vy, speed, ang, spun, airT, flips, score,
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
