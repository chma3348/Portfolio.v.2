"use strict";

/* ============================================================
   FIELD NOTES — world engine
   steering, click-to-walk, landmarks, overlays, lightbox
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
const COARSE  = matchMedia("(pointer: coarse)");

const stage      = $(".stage");
const world      = $("#world");
const actors     = $("#actors");
const hiker      = $("#hiker");
const hikerScale = $("#hikerScale");
const hikerInner = $("#hikerInner");
const dog        = $("#dog");
const dogScaleEl = $("#dogScale");
const dogInner   = $("#dogInner");
const dogSpeak   = $("#dogSpeak");
const trailEl    = $("#trail");
const hintChip   = $("#hintChip");
const startNote  = $("#startNote");

const SECTIONS  = ["peaks", "journeys", "portraits", "about", "contact"];

/* "everything" is a gallery and a route, but not a section: it has no landmark
   on the map, no "been here" stamp and no place to park the hiker. You reach it
   by walking off the top or bottom of the paper, or from the signpost. */
SITE.collections.everything = {
  title: "The Whole Lot",
  blurb: "every photograph on this site, shuffled.",
  photos: SECTIONS.flatMap((s) => SITE.collections[s]?.photos || []),
};

const GALLERIES = ["peaks", "journeys", "portraits", "everything"];
const ROUTES    = [...SECTIONS, "everything"];

/* ------------------------------------------------------------
   The map fills the viewport exactly: the SVG user-space is CSS
   pixels (1 unit = 1 px), so nothing is ever letterboxed. Every
   position below is a FRACTION of width/height, and the artwork
   carries its own scale factor — that pairing is what keeps the
   drawings readable from a 320px phone to a 4K display.
   ------------------------------------------------------------ */

/* Decor is optional per arrangement: an omitted key is simply not drawn.
   Every position keeps clear of the three HUD corners (name top-left,
   hint bottom-left, contents bottom-right) and of the landmark bands. */
const ARRANGE = {
  // wide screens: a five-point ring you can cross in about a second
  landscape: {
    landmarks: {
      peaks:     [0.190, 0.315],
      journeys:  [0.500, 0.200],
      portraits: [0.810, 0.315],
      about:     [0.315, 0.700],
      contact:   [0.685, 0.700],
    },
    start: [0.500, 0.520],
    decor: {
      // the ring now owns the middle, so the compass moves out to the flank
      compass: [0.052, 0.545],
      sun:     [0.948, 0.545],
      birds:   [0.290, 0.120],
      scale:   [0.500, 0.930],
    },
    sig: [0.955, 0.062],
    signposts: { runner: [0.038, 0.845], ski: [0.962, 0.845] },
  },

  // tall screens: a zigzag trail down the page, using the height.
  // Consecutive stops sit on opposite sides, so they can be closer together
  // than their own height — only same-side stops need real separation.
  portrait: {
    landmarks: {
      peaks:     [0.300, 0.225],
      journeys:  [0.700, 0.370],
      portraits: [0.300, 0.515],
      about:     [0.700, 0.660],
      contact:   [0.300, 0.800],
    },
    start: [0.510, 0.443],
    decor: {
      compass: [0.855, 0.150],
      sun:     [0.120, 0.365],
      birds:   [0.870, 0.520],
    },
    signposts: { runner: [0.062, 0.885], ski: [0.938, 0.795] },
  },

  /* Small phones (a 320x568 screen, a landscape phone). Five stacked stops
     don't fit, so drop to 2 + 2 + 1 and let the route line carry the map
     character alone — decor here would only crowd the drawings the visitor
     actually needs to read. The you-are-here note goes too: at this size it
     lands on top of the first landmark. */
  compact: {
    landmarks: {
      peaks:     [0.270, 0.265],
      journeys:  [0.730, 0.275],
      portraits: [0.270, 0.515],
      about:     [0.730, 0.525],
      contact:   [0.500, 0.735],
    },
    // low enough that the dog, who trails to your left, clears the top labels
    start: [0.500, 0.430],
    decor: {},
    hideNote: true,
  },
};

const DECOR_NODES = {
  compass: "#decorCompass",
  sun:     "#decorSun",
  birds:   "#decorBirds",
  scale:   "#decorScale",
};

/* A wide screen always gets the ring — even a short one like a landscape
   phone, where stacking rows would collide but spreading sideways won't.
   Compact is for narrow-and-short only. */
function pickArrangement(W, H) {
  if (W / H >= 0.92) return ARRANGE.landscape;
  return H >= 700 ? ARRANGE.portrait : ARRANGE.compact;
}

let layout = null;   // resolved px geometry for the current viewport

function smoothLoop(pts) {
  const n = pts.length;
  let d = `M${pts[0].x},${pts[0].y} `;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ` +
         `${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y} `;
  }
  return d + "Z";
}

function place(el, [x, y], s) {
  el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)})`);
}

function applyLayout(keepPosition = false) {
  /* Keep the hiker where they were *relative* to the map. Preserving raw
     pixels would fling them into a corner on rotate or when mobile browser
     chrome collapses. */
  const held = keepPosition && layout
    ? { fx: pos.x / layout.W, fy: pos.y / layout.H }
    : null;

  const W = Math.max(320, stage.offsetWidth);
  const H = Math.max(400, stage.offsetHeight);
  const shortSide = Math.min(W, H);
  const arrangement = pickArrangement(W, H);

  /* Artwork scale. The floor is the readability guarantee, not the fit:
     at 0.68 the landmark labels render at ~22px and the drawings ~118px
     wide, legible on any phone. Short screens relax the floor to 0.60
     (~19px labels, still well above the 16px bar) so the drawings can't
     grow into each other. Big screens cap at 1.05 so the map never turns
     into a poster. */
  const floor = H < 620 ? 0.60 : 0.68;
  const art = clamp(shortSide / 880, floor, 1.05);
  const hik = clamp(shortSide / 820, 0.78, 1.2);

  const viewBox = `0 0 ${W} ${H}`;
  world.setAttribute("viewBox", viewBox);
  actors.setAttribute("viewBox", viewBox);

  const px = ([fx, fy]) => [fx * W, fy * H];

  const marks = {};
  for (const sec of SECTIONS) {
    const [x, y] = px(arrangement.landmarks[sec]);
    marks[sec] = { x, y };
    place($("#lm-" + sec), [x, y], art);
  }

  for (const [key, sel] of Object.entries(DECOR_NODES)) {
    const el = $(sel);
    const spot = arrangement.decor[key];
    el.style.display = spot ? "" : "none";
    if (spot) place(el, px(spot), art);
  }

  const sig = $("#signature");
  sig.style.display = arrangement.sig ? "" : "none";
  if (arrangement.sig) place(sig, px(arrangement.sig), art);

  /* Kept off the edges in PIXELS, not fractions. The board is a fixed 65
     units wide, so on a narrow phone a fraction that reads as "tucked into
     the corner" on a desktop puts it 3px from the edge and looks like it's
     falling off the paper. */
  const spSpots = {};
  const spHalf = 34 * art, spPad = 14;
  for (const g of ["runner", "ski"]) {
    const f = arrangement.signposts && arrangement.signposts[g];
    if (f) {
      const [sx, sy] = px(f);
      spSpots[g] = { x: clamp(sx, spPad + spHalf, W - spPad - spHalf), y: sy };
    }
  }

  // the trail threads the stops in ring order, not list order
  $("#routePath").setAttribute("d", smoothLoop([
    marks.peaks, marks.journeys, marks.portraits, marks.contact, marks.about,
  ]));

  startNote.style.display = arrangement.hideNote ? "none" : "";

  const birdsSpot = arrangement.decor.birds ? px(arrangement.decor.birds) : null;
  const compassSpot = arrangement.decor.compass ? px(arrangement.decor.compass) : null;

  hikerScale.setAttribute("transform", `scale(${hik.toFixed(3)})`);
  dogScaleEl.setAttribute("transform", `scale(${hik.toFixed(3)})`);

  const startPx = px(arrangement.start);
  place(startNote, startPx, art);

  layout = {
    W, H, art, hik,
    landmarks: marks,
    start: { x: startPx[0], y: startPx[1] },
    bounds: {
      x1: 26,
      y1: 30 + 46 * hik,          // room for the hiker's head
      x2: W - 26,
      y2: H - 26,
    },
    // scales with the drawings, so a small screen doesn't end up with every
    // landmark "in range" at once
    range: Math.max(80, 130 * art),
    keySpeed:  0.30 * Math.hypot(W, H),
    walkSpeed: 0.38 * Math.hypot(W, H),
    trailStep: Math.max(20, 0.022 * Math.hypot(W, H)),
    leash: 44 * hik,
    birds: birdsSpot ? { x: birdsSpot[0], y: birdsSpot[1] } : null,
    compass: compassSpot ? { x: compassSpot[0], y: compassSpot[1] } : null,
    signposts: spSpots,
  };

  if (held) { pos.x = held.fx * W; pos.y = held.fy * H; }
  else { pos.x = layout.start.x; pos.y = layout.start.y; }
  pos.x = clamp(pos.x, layout.bounds.x1, layout.bounds.x2);
  pos.y = clamp(pos.y, layout.bounds.y1, layout.bounds.y2);
  target = null;
  trailPts.length = 0;
  trailEl.setAttribute("points", "");
  crumbs.length = 0;
  dogPos.x = pos.x - layout.leash * facing;
  dogPos.y = pos.y + 5;
  dropStick();              // a stick mid-flight would be stranded by new geometry
  dogMode = "follow";
  chaseGoal = null;
  chaseUntil = 0;
  renderHiker();
  renderDog();
}

/* ------------------------------------------------------------
   hiker state + movement loop
   ------------------------------------------------------------ */

const pos = { x: 0, y: 0 };
let target = null;            // {x, y, section?}
let facing = 1;
let inRange = null;
/* You close a gallery standing right on top of its landmark. Without this,
   the next Enter (or a stray tap nearby) yanks you straight back in. The
   landmark re-arms once you step out of its radius. */
let suppressed = null;
const keys = new Set();
const ARRIVE = 8;

const trailPts = [];
let trailDist = 0, lastMoveAt = 0;

/* ------------------------------------------------------------
   the dog — follows the hiker's actual path rather than gliding
   straight at them, which is what makes it read as a dog and not
   a floating sprite
   ------------------------------------------------------------ */

const dogPos = { x: 0, y: 0 };
const crumbs = [];            // recent hiker positions, newest last
let dogFacing = 1;
let dogStillFor = 0;

/* follow → she trails you · chase / chase-exit / chase-hold → after the birds,
   off the paper, and a beat out of sight · fetch-out / fetch-back → the stick */
let dogMode = "follow";
let chaseGoal = null, chaseUntil = 0, chaseDir = 1, chaseHoldUntil = 0;

/* How far past the paper's edge she runs after the birds — enough that she's
   fully out of sight before she gives up on them. */
const CHASE_OVER = 110;

/* How much faster than a brisk walk she moves, per mood. Fetch is eager but
   still readable; the bird chase is the flat-out one. */
const SPEED = { follow: 1.3, fetch: 0.85, chase: 1.2 };

const stickWrap   = $("#stickWrap");
const stickShadow = $("#stickShadow");
const stickBody   = $("#stickBody");
let stick = null, throwCount = 0;

function dropStick() {
  stick = null;
  stickWrap.classList.remove("live");
  if (dogMode === "fetch-out" || dogMode === "fetch-back") dogMode = "follow";
}

/* Where the flock is *right now*, mid-flight. The flying is a CSS animation, so
   rather than re-deriving its easing we just read the live matrix back out. */
function birdsNow() {
  const bm = birdsEl.getScreenCTM();
  const wm = world.getScreenCTM();
  if (!bm || !wm) return null;
  const onScreen = new DOMPoint(0, 0).matrixTransform(bm);
  return new DOMPoint(onScreen.x, onScreen.y).matrixTransform(wm.inverse());
}

function renderHiker() {
  hiker.setAttribute("transform", `translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)})`);
}

function renderDog() {
  dog.setAttribute("transform", `translate(${dogPos.x.toFixed(1)},${dogPos.y.toFixed(1)})`);
}

function dropCrumb(x, y) {
  const last = crumbs[crumbs.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < 5) return;
  crumbs.push({ x, y });
  if (crumbs.length > 90) crumbs.shift();
}

/* the spot `leash` pixels back along the path the hiker actually walked */
function leashPoint() {
  const leash = layout.leash;
  let travelled = 0;
  for (let i = crumbs.length - 1; i > 0; i--) {
    const a = crumbs[i], b = crumbs[i - 1];
    const seg = Math.hypot(a.x - b.x, a.y - b.y);
    if (travelled + seg >= leash) {
      const t = (leash - travelled) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    travelled += seg;
  }
  return crumbs[0] || { x: pos.x - leash * facing, y: pos.y };
}

function updateDog(dt, hikerMoving) {
  if (REDUCED.matches) {
    dogPos.x = pos.x - layout.leash * facing;
    dogPos.y = pos.y + 5;
    dogFacing = facing;
    renderDog();
    return;
  }

  let goal, gait = "follow";

  if (dogMode === "chase") {
    // track where the birds actually are this frame, not where they started —
    // otherwise she beelines to a spot and stands there while they fly on
    const b = birdsNow();
    if (b) {
      chaseGoal = {
        // x runs free past the boundary — she follows them right off the paper
        x: clamp(b.x - chaseDir * 34 * layout.art, -CHASE_OVER, layout.W + CHASE_OVER),
        y: clamp(b.y + 44 * layout.art, layout.bounds.y1, layout.bounds.y2),
      };
    }
    const gone = b && (b.x < -80 || b.x > layout.W + 80 || b.y < -80);
    if (gone || performance.now() >= chaseUntil) {
      // the flock has cleared out; she barrels off the same edge after them
      dogMode = "chase-exit";
      chaseGoal = {
        x: chaseDir > 0 ? layout.W + CHASE_OVER : -CHASE_OVER,
        y: clamp(dogPos.y, layout.bounds.y1, layout.bounds.y2),
      };
    }
  }

  if (dogMode === "chase-exit" &&
      (dogPos.x <= -CHASE_OVER + 8 || dogPos.x >= layout.W + CHASE_OVER - 8)) {
    // out of sight — a beat off the page, then she thinks better of it
    dogMode = "chase-hold";
    chaseHoldUntil = performance.now() + 1100;
  }
  if (dogMode === "chase-hold" && performance.now() >= chaseHoldUntil) {
    dogMode = "follow";                  // and comes trotting back into view
  }

  if (dogMode === "chase" || dogMode === "chase-exit") {
    goal = chaseGoal; gait = "chase";
  } else if (dogMode === "chase-hold") {
    goal = { x: dogPos.x, y: dogPos.y };
  } else if (dogMode === "fetch-out" && stick) {
    goal = { x: stick.gx, y: stick.gy }; gait = "fetch";
  } else if (dogMode === "fetch-back") {
    goal = { x: pos.x - 18 * layout.hik * facing, y: pos.y + 3 }; gait = "fetch";
  } else if (camping) {
    // at camp she settles in close rather than keeping her following distance
    goal = { x: pos.x - layout.leash * 0.92 * facing, y: pos.y + 4 };
  } else {
    goal = leashPoint();
  }

  const dx = goal.x - dogPos.x, dy = goal.y - dogPos.y;
  const dist = Math.hypot(dx, dy);
  let moved = 0;

  if (dist > 2) {
    // hangs back when close, breaks into a run when she falls behind
    const top = layout.walkSpeed * SPEED[gait];
    const speed = gait === "follow" ? clamp(dist * 4.5, 40, top) : top;
    moved = Math.min(dist, speed * dt);
    dogPos.x += (dx / dist) * moved;
    dogPos.y += (dy / dist) * moved;
    if (Math.abs(dx) > 1.5) dogFacing = dx > 0 ? 1 : -1;
    renderDog();
  }

  if (dogMode === "fetch-out" && stick && stick.landed &&
      Math.hypot(stick.gx - dogPos.x, stick.gy - dogPos.y) < 14 * layout.hik) {
    stick.carried = true;
    dogMode = "fetch-back";
  } else if (dogMode === "fetch-back" &&
      Math.hypot(pos.x - dogPos.x, pos.y - dogPos.y) < 32 * layout.hik) {
    dropStick();                        // delivered, with great pride
    dog.classList.add("happy");
    clearTimeout(petT);
    petT = setTimeout(() => dog.classList.remove("happy"), 1300);
  }

  const trotting = moved > 0.5;
  dogStillFor = trotting ? 0 : dogStillFor + dt;
  dog.classList.toggle("walking", trotting);
  // quicker legs when she's actually running, so it reads as effort not sliding
  dog.classList.toggle("running", trotting && gait !== "follow");
  // once settled, it looks up at you and wags
  dog.classList.toggle("idle", !trotting && dogStillFor > 0.35 && !hikerMoving);
  dogInner.style.transform = `scaleX(${dogFacing})`;
}

function keyVector() {
  let dx = 0, dy = 0;
  if (keys.has("left"))  dx -= 1;
  if (keys.has("right")) dx += 1;
  if (keys.has("up"))    dy -= 1;
  if (keys.has("down"))  dy += 1;
  if (dx && dy) { const s = Math.SQRT1_2; dx *= s; dy *= s; }
  return [dx, dy];
}

let lastT = performance.now();
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  // …unless the pair are still boarding the chair, which happens here
  if (boarding) { updateBoarding(dt); requestAnimationFrame(tick); return; }

  // the map idles while you're off running
  if (runnerActive) { requestAnimationFrame(tick); return; }

  // …but the squirrel chase plays out on the map first
  if (chase) { updateChase(dt); requestAnimationFrame(tick); return; }

  let moved = false;
  let stepped = 0;
  const [kx, ky] = keyVector();

  if (kx || ky) {
    target = null;
    const step = layout.keySpeed * dt;
    pos.x += kx * step;
    pos.y += ky * step;
    if (kx) facing = kx > 0 ? 1 : -1;
    stepped = Math.hypot(kx, ky) * step;
    moved = true;
  } else if (target) {
    const dx = target.x - pos.x, dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE) {
      pos.x = target.x; pos.y = target.y;
      const sec = target.section;
      target = null;
      if (sec) openSection(sec);
    } else {
      const step = Math.min(dist, layout.walkSpeed * dt);
      pos.x += (dx / dist) * step;
      pos.y += (dy / dist) * step;
      if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
      stepped = step;
      moved = true;
    }
  }

  if (moved) {
    pos.x = clamp(pos.x, layout.bounds.x1, layout.bounds.x2);
    pos.y = clamp(pos.y, layout.bounds.y1, layout.bounds.y2);
    renderHiker();
    lastMoveAt = now;
    dropCrumb(pos.x, pos.y);

    if (!REDUCED.matches) {
      trailDist += stepped;
      if (trailDist > layout.trailStep) {
        trailDist = 0;
        trailPts.push(`${pos.x.toFixed(0)},${pos.y.toFixed(0)}`);
        if (trailPts.length > 48) trailPts.shift();
        trailEl.setAttribute("points", trailPts.join(" "));
      }
    }
  } else if (trailPts.length && now - lastMoveAt > 2400) {
    // the pencil line gets erased behind you after a pause
    if (!tick.eraseHold || now - tick.eraseHold > 40) {
      tick.eraseHold = now;
      trailPts.shift();
      trailEl.setAttribute("points", trailPts.join(" "));
    }
  }

  hiker.classList.toggle("walking", moved && !camping);
  hikerInner.style.transform = `scaleX(${facing})`;
  updateDog(dt, moved);
  updateStick(dt);
  checkBirds(now);
  updateRose(dt);
  updateNeedle();
  updateEdge(dt);

  if (!camping && !anyDialogOpen() && now - lastActivityAt > CAMP_AFTER) setCamping(true);

  // landmark proximity
  let nearest = null, nd = Infinity;
  for (const sec of SECTIONS) {
    const p = layout.landmarks[sec];
    const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (dist < nd) { nd = dist; nearest = sec; }
  }
  const nowInRange = nd < layout.range ? nearest : null;
  if (nowInRange !== suppressed && suppressed) {
    $("#lm-" + suppressed).classList.remove("suppressed");
    suppressed = null;
  }
  if (nowInRange !== inRange) {
    if (inRange) $("#lm-" + inRange).classList.remove("in-range");
    if (nowInRange) $("#lm-" + nowInRange).classList.add("in-range");
    inRange = nowInRange;
  }

  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------
   input
   ------------------------------------------------------------ */

const KEYMAP = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
  A: "left", D: "right", W: "up", S: "down",
};

function anyDialogOpen() { return !!$("dialog[open]"); }

let lastCloseAt = -Infinity;
$$("dialog").forEach((d) =>
  d.addEventListener("close", () => { lastCloseAt = performance.now(); })
);

addEventListener("keydown", (e) => {
  if (e.defaultPrevented || anyDialogOpen()) return;
  /* a game owns the screen while it's up; only its own keys count, or Escape
     out of the runner also opens Contents on top of it */
  if (runnerActive || chase) return;

  const dir = KEYMAP[e.key];
  if (dir) {
    keys.add(dir);
    firstInput();
    e.preventDefault();
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    if (inRange && inRange !== suppressed) { e.preventDefault(); openSection(inRange); }
    return;
  }
  if (e.key === "Escape" || e.key === "m" || e.key === "M") {
    // Escape that just dismissed a dialog shouldn't immediately open another
    if (e.key === "Escape" && performance.now() - lastCloseAt < 250) return;
    e.preventDefault();
    openContents();
  }
});

addEventListener("keyup", (e) => {
  const dir = KEYMAP[e.key];
  if (dir) keys.delete(dir);
});

addEventListener("blur", () => keys.clear());

/* click / tap to walk */
let clickMark = null;
function pingAt(x, y) {
  if (!clickMark) {
    clickMark = document.createElementNS("http://www.w3.org/2000/svg", "g");
    clickMark.id = "clickMark";
    clickMark.innerHTML = `<path d="M-9,-9 L9,9 M9,-9 L-9,9" stroke-linecap="round"/>`;
    actors.insertBefore(clickMark, hiker);
  }
  clickMark.setAttribute("transform", `translate(${x},${y})`);
  clickMark.classList.remove("ping");
  void clickMark.getBBox();
  clickMark.classList.add("ping");
}

function svgPoint(e) {
  const m = world.getScreenCTM();
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
}

world.addEventListener("pointerdown", (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  firstInput();

  const lm = e.target.closest(".landmark");
  if (lm) {
    const sec = lm.dataset.section;
    const p = layout.landmarks[sec];
    const standY = clamp(p.y + 58 * layout.art, layout.bounds.y1, layout.bounds.y2);
    if (REDUCED.matches || Math.hypot(p.x - pos.x, p.y - pos.y) < 70 * layout.art) {
      openSection(sec);
    } else {
      target = { x: p.x, y: standY, section: sec };
      pingAt(p.x, standY);
    }
    e.preventDefault();
    return;
  }

  const pt = svgPoint(e);
  const x = clamp(pt.x, layout.bounds.x1, layout.bounds.x2);
  const y = clamp(pt.y, layout.bounds.y1, layout.bounds.y2);
  if (REDUCED.matches) {
    pos.x = x; pos.y = y; renderHiker();
  } else {
    target = { x, y };
    pingAt(x, y);
  }

  /* Keep hold of this press: while the button or finger stays down, the
     walk target tracks the pointer, so you can lead the pair around the
     map rather than tapping stepping stones. */
  dragPointer = e.pointerId;
  try { world.setPointerCapture(e.pointerId); } catch (_) {}

  e.preventDefault();
});

/* --- hold and they follow: press, keep it held, and lead the way --- */

let dragPointer = null;

world.addEventListener("pointermove", (e) => {
  if (dragPointer === null || e.pointerId !== dragPointer) return;
  const pt = svgPoint(e);
  const x = clamp(pt.x, layout.bounds.x1, layout.bounds.x2);
  const y = clamp(pt.y, layout.bounds.y1, layout.bounds.y2);
  if (REDUCED.matches) {
    pos.x = x; pos.y = y; renderHiker();
  } else {
    target = { x, y };      // no ping ring — the moving pair is the feedback
  }
});

function endDrag(e) {
  if (e.pointerId === dragPointer) dragPointer = null;
}
world.addEventListener("pointerup", endDrag);
world.addEventListener("pointercancel", endDrag);

/* keyboard activation of a focused landmark drawing */
world.addEventListener("keydown", (e) => {
  const lm = e.target.closest?.(".landmark");
  if (lm && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openSection(lm.dataset.section);
  }
});

/* ------------------------------------------------------------
   easter eggs
   ------------------------------------------------------------ */

/* --- the sun doodle is a night-mode switch --- */

const sunEgg = $("#decorSun");

function setNight(on, remember = true) {
  document.body.classList.toggle("night", on);
  sunEgg.setAttribute("aria-pressed", String(on));
  sunEgg.setAttribute("aria-label", on ? "Turn the map back to day" : "Turn the map to night");
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", on ? "#22242e" : "#f4f4f5");
  if (remember) { try { localStorage.setItem("fieldnotes-night", on ? "1" : "0"); } catch (_) {} }
}

sunEgg.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  firstInput();
  setNight(!document.body.classList.contains("night"));
});
sunEgg.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault(); e.stopPropagation();
    setNight(!document.body.classList.contains("night"));
  }
});

/* --- the compass rose: give it a spin and it finds true north (Felix) --- */

const roseEl = $("#decorCompass");
const roseNeedle = $("#decorCompass .rose-needle");
let rose = null;   // { deg, vel, phase: "spin" | "track" | "settle", t }

/* rotate(0) points the needle up; screen-angle to the dog, needle-relative */
function roseAngleToDog() {
  const c = layout.compass;
  if (!c) return 0;
  return Math.atan2(dogPos.y - c.y, dogPos.x - c.x) * 180 / Math.PI + 90;
}

function arcTo(from, to) { return ((to - from + 540) % 360) - 180; }

function spinRose() {
  stirCamp();
  firstInput();
  if (REDUCED.matches) {
    // no theatrics: it just quietly finds him, then lets go
    roseNeedle.setAttribute("transform", `rotate(${roseAngleToDog().toFixed(1)})`);
    clearTimeout(spinRose._t);
    spinRose._t = setTimeout(() => roseNeedle.removeAttribute("transform"), 2600);
    return;
  }
  rose = { deg: rose ? rose.deg : 0, vel: 1400 + Math.random() * 500, phase: "spin", t: 0 };
}

function updateRose(dt) {
  if (!rose) return;
  rose.t += dt;
  if (rose.phase === "spin") {
    rose.vel *= Math.pow(0.22, dt);              // winds down quickly
    rose.deg += rose.vel * dt;
    if (rose.vel < 150) { rose.phase = "track"; rose.t = 0; }
  } else if (rose.phase === "track") {
    // it settles on Felix and holds, quivering like a real needle
    const aim = roseAngleToDog() + Math.sin(rose.t * 6.5) * 3.5;
    rose.deg += arcTo(rose.deg, aim) * Math.min(1, dt * 5);
    if (rose.t > 4.2) { rose.phase = "settle"; rose.t = 0; }
  } else {
    const back = arcTo(rose.deg, 0);
    if (Math.abs(back) < 0.8) { roseNeedle.removeAttribute("transform"); rose = null; return; }
    rose.deg += back * Math.min(1, dt * 2.5);
  }
  roseNeedle.setAttribute("transform",
    `rotate(${(((rose.deg % 360) + 360) % 360).toFixed(1)})`);
}

roseEl.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation(); spinRose();
});
roseEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault(); e.stopPropagation(); spinRose();
  }
});

/* --- making camp after a spell of stillness --- */

const CAMP_AFTER = 15000;
let lastActivityAt = performance.now();
let camping = false;

function setCamping(on) {
  if (camping === on) return;
  camping = on;
  document.body.classList.toggle("camping", on);
}

function stirCamp() {
  lastActivityAt = performance.now();
  setCamping(false);
}

/* --- lean on the edge of the paper and it gives way --- */

const edgeHint = $("#edgeHint");
const edgeHintLine = $("#edgeHintLine");
const edgeHintText = $("#edgeHintText");

/* Wider than the 8px arrival tolerance below, and deliberately so: a walk that
   ends "at" the boundary actually stops a few pixels short, and at 3px that
   left you standing on the edge with nothing happening. */
const EDGE_SLACK = 12;        // px from the boundary that counts as "against it"
const EDGE_HINT_AFTER = 0.2;  // seconds against the edge before anything shows
const EDGE_LEAVE_AFTER = 0.8; // …and before a *held key* pushes you through

let edgePush = 0, edgeDir = null;
/* After a run you land back on the map, and if you land anywhere near a
   boundary the edge would immediately start counting again and throw you
   straight back in. This holds it off for a moment. */
let edgeCooldown = 0;

/* Which boundary are we up against?
   Resting against it counts, however you got there — an earlier version
   demanded you be actively pushing, which meant clicking or tapping your way
   to the edge never triggered at all: the walk target clears the instant you
   arrive, so the intent vanished with it. Heading somewhere else cancels. */
function edgePressed() {
  const b = layout.bounds;
  const [kx, ky] = keyVector();
  if (target && Math.hypot(target.x - pos.x, target.y - pos.y) > 8) return null;

  if (pos.x >= b.x2 - EDGE_SLACK && kx >= 0) return "right";
  if (pos.x <= b.x1 + EDGE_SLACK && kx <= 0) return "left";
  if (pos.y <= b.y1 + EDGE_SLACK && ky <= 0) return "up";
  if (pos.y >= b.y2 - EDGE_SLACK && ky >= 0) return "down";
  return null;
}

function updateEdge(dt) {
  if (edgeCooldown > 0) {
    edgeCooldown -= dt;
    edgePush = 0;
    edgeHint.classList.remove("on");
    hideTrailPrompt();
    return;
  }
  if (runnerActive || chase || anyDialogOpen()) {
    edgePush = 0; edgeHint.classList.remove("on"); hideTrailPrompt(); return;
  }
  /* Mid-drag the pointer often sweeps along a boundary; that's steering, not
     leaving. The edge only starts counting once the press is released. */
  if (dragPointer !== null) {
    edgePush = 0; edgeHint.classList.remove("on"); hideTrailPrompt(); return;
  }

  const dir = edgePressed();
  if (!dir) {
    edgePush = 0;
    edgeDir = null;
    edgeHint.classList.remove("on");
    hideTrailPrompt();
    return;
  }

  if (dir !== edgeDir) { edgeDir = dir; edgePush = 0; }
  edgePush += dt;

  const [kx, ky] = keyVector();
  const pushingWithKeys = !!(kx || ky);

  if (edgePush > EDGE_HINT_AFTER) {
    const out = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[dir];
    edgeHintText.textContent = edgeGoesToGallery(dir) ? "every photo" : "off the map";
    // earliest moment we know a game is on their mind — start fetching it
    if (!edgeGoesToGallery(dir)) prefetchGame(gameForEdge(dir));
    const len = 54 * layout.art;
    const x1 = pos.x + out[0] * 22 * layout.hik;
    const y1 = pos.y - 20 * layout.hik + out[1] * 20 * layout.hik;
    edgeHintLine.setAttribute("d",
      `M${x1.toFixed(0)},${y1.toFixed(0)} L${(x1 + out[0] * len).toFixed(0)},${(y1 + out[1] * len).toFixed(0)}`);
    const tx = clamp(x1 + out[0] * (len + 8), 80, layout.W - 80);
    const ty = clamp(y1 + out[1] * (len + 8) - 10, 40, layout.H - 30);
    edgeHintText.setAttribute("x", tx.toFixed(0));
    edgeHintText.setAttribute("y", ty.toFixed(0));
    edgeHintText.setAttribute("text-anchor", out[0] < 0 ? "start" : out[0] > 0 ? "end" : "middle");
    edgeHint.classList.add("on");

    /* Two ways through, because the two ways of moving want different things.
       Leaning on a key is a deliberate shove, so it just goes. Arriving by
       click is passive — you're stood there, not pushing — so nothing should
       happen behind your back; you get a button instead. */
    if (!pushingWithKeys) showTrailPrompt(tx, ty, out);
  }

  if (pushingWithKeys && edgePush > EDGE_LEAVE_AFTER) {
    edgePush = 0;
    edgeHint.classList.remove("on");
    stepOffTheEdge();
  }
}

/* The two edges do different things: walk out the side and the trail carries
   you into the run; walk off the top or bottom and you land in the whole
   collection at once. */
function edgeGoesToGallery(dir) { return dir === "up" || dir === "down"; }

function stepOffTheEdge() {
  if (edgeGoesToGallery(edgeDir)) {
    hideTrailPrompt();
    edgeHint.classList.remove("on");
    openSection("everything");
  } else if (edgeDir === "right") {
    leaveForSki();
  } else {
    leaveTheMap();
  }
}

/* ---------- the "hit the trail" button, for anyone using a mouse ---------- */

const trailPrompt = $("#trailPrompt");
let promptShown = false;

function showTrailPrompt(x, y, out) {
  if (promptShown) return;
  promptShown = true;
  trailPrompt.textContent =
    edgeGoesToGallery(edgeDir) ? "see every photo →"
      : edgeDir === "left" ? "← hit the trail" : "hit the slopes →";
  const r = stage.getBoundingClientRect();
  const px2 = clamp(x + out[0] * 6, 90, layout.W - 90);
  const py2 = clamp(y + out[1] * 22 + 26, 44, layout.H - 44);
  trailPrompt.style.left = (r.left + px2) + "px";
  trailPrompt.style.top = (r.top + py2) + "px";
  trailPrompt.hidden = false;
  requestAnimationFrame(() => trailPrompt.classList.add("on"));
}
function hideTrailPrompt() {
  if (!promptShown) return;
  promptShown = false;
  trailPrompt.classList.remove("on");
  trailPrompt.hidden = true;
}
trailPrompt.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  stepOffTheEdge();
});

let runnerActive = false;

/* ------------------------------------------------------------
   The games load on demand.

   They used to be plain <script> tags, so every visitor parsed the
   whole of a game they'd probably never open before the map could
   appear. Now the fetch starts the moment someone leans on an edge,
   and the squirrel chase gives it five seconds of cover — a dozen
   kilobytes lands long before anything needs it.

   Bests are read straight from localStorage rather than from the
   module, so the keepsake signposts still show up for a returning
   visitor who hasn't loaded a game this session.
   ------------------------------------------------------------ */

const GAMES = {
  runner: { src: "runner.js", global: "Runner", bestKey: "fieldnotes-run-best", keepsakeAt: 250 },
  ski:    { src: "ski.js",    global: "Ski",    bestKey: "fieldnotes-ski-best", keepsakeAt: 150 },
};

/* which way off the paper leads where */
const gameForEdge = (dir) => (dir === "left" ? "runner" : "ski");

const gameLoads = {};

function loadGame(name) {
  const g = GAMES[name];
  if (window[g.global]) return Promise.resolve(window[g.global]);
  if (gameLoads[name]) return gameLoads[name];

  const p = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = g.src;
    el.async = true;
    el.onload = () => (window[g.global] ? resolve(window[g.global]) : reject(new Error(g.src)));
    el.onerror = () => reject(new Error(g.src));
    document.head.appendChild(el);
  });
  gameLoads[name] = p;
  // a failed fetch mustn't poison the cache — let the next attempt try again
  p.catch(() => { delete gameLoads[name]; });
  return p;
}

/* start fetching as soon as the edge hint shows, which is the earliest
   moment we know a game is even on their mind */
function prefetchGame(name) { loadGame(name).catch(() => {}); }

function bestFor(name) {
  try { return parseInt(localStorage.getItem(GAMES[name].bestKey) || "0", 10) || 0; }
  catch (_) { return 0; }
}

/* ---------------------------------------------------------------
   The chase starts here, on the map. A squirrel breaks across the
   paper, Felix leaves your side to go after it, they both run off
   the edge, and only then does the trail take over — so the change
   of scene is something you watch happen rather than a cut.
   --------------------------------------------------------------- */

const mapSquirrel = $("#mapSquirrel");
const chaseFade = $("#chaseFade");
const CHASE_MS = 5200;
/* How far behind it he runs. Not a flat pixel count: what decides whether he
   ends up nose-to-nose with it is how much *curve* sits between them, so the
   gap is capped both by a slice of the route and by the map's tight side —
   a narrow phone turns the loop far sharper than a desktop does. */
const DOG_GAP_F = 0.035, DOG_GAP_SIDE = 0.10;
const DOG_GAP_MIN = 40, DOG_GAP_MAX = 150;
let chase = null;

function lerp(a, b, t) { return a + (b - a) * t; }

/* A proper little chase: it breaks cover on the far side, sweeps the top,
   dives past his nose, loops the bottom and the far flank, cuts back across
   the middle and bolts out the edge with him at its heels.

   Every waypoint is a THROUGH-pass — the route never doubles back on itself.
   That matters more than it sounds: Felix follows a fixed distance back down
   this same line, so at any hairpin he'd be on the far side of the turn,
   spatially right on top of the squirrel and pointing straight at it. The
   old route darted at the hiker and reversed, and the two of them met
   head-on at 18px every single run. Turn angles here stay wide enough that
   the gap between them never closes below about half a leash. */
function chaseRoute(out) {
  const b = layout.bounds;
  const W = b.x2 - b.x1, H = b.y2 - b.y1;
  const s = out[0] >= 0 ? 1 : -1;                    // mirror the lot for a left exit
  const m = (fx, fy) => ({ x: b.x1 + W * (s > 0 ? fx : 1 - fx), y: b.y1 + H * fy });
  /* The loop is pure map fractions — pinning waypoints to the hiker used to
     wrench the shape about depending on where they'd stopped, which is what
     put a kink in it. The close pass comes free instead: they're stood
     against the exit edge, and the last two points run level with them and
     straight out, so it goes right past their nose without ever turning back. */
  /* Sharp turns are only a problem where x has stopped advancing — that's
     what puts Felix, a fixed distance back down the line, on the far side of
     a fold and nose-to-nose with it. So the one genuine U-turn (the far
     flank) is drawn as a two-point arc rather than a single corner, and the
     tail keeps driving sideways while it eases towards the hiker's height. */
  return [
    m(0.06, 0.55),          // breaks cover, far side
    m(0.19, 0.19),          // up
    m(0.45, 0.11),          // across the top
    m(0.71, 0.21),          // curving down, still travelling out
    m(0.88, 0.44),          // brushes the exit edge, right past them
    m(0.79, 0.73),          // carries on down
    m(0.51, 0.88),          // across the bottom
    m(0.22, 0.80),
    m(0.09, 0.63),          // into the far flank…
    m(0.09, 0.40),          // …apex, running straight up
    m(0.30, 0.36),          // …and out of it, turning wide
    m(0.62, 0.44),
    {                       // and gone, easing to their height on the way
      x: clamp(pos.x + out[0] * 1100, b.x1 - 200, b.x2 + 200),
      y: lerp(b.y1 + H * 0.44, pos.y, 0.55),
    },
  ];
}

/* ---- turning those waypoints into something actually runnable ----

   The first version walked the waypoints as straight segments and eased
   *within each one*, which meant the squirrel braked to a dead stop at all
   eight corners — the stutter. Worse, Felix trailed it by a fixed amount of
   TIME along the same waypoints, so while it was stopped-and-turning he was
   still barrelling at where it had been: they met head-on and ran through
   each other.

   So: the waypoints become one continuous curve, sampled once and then
   walked by ARC LENGTH. Nothing stops at a corner, the pace is even end to
   end, and Felix follows a fixed *distance* back down the very same line —
   which makes overtaking it geometrically impossible. */

/* Centripetal Catmull-Rom (alpha = 0.5). The centripetal flavour matters
   here: the route deliberately doubles back past the hiker's nose, and the
   plain uniform version ties itself in a loop at corners that sharp. */
function crPoint(p0, p1, p2, p3, t) {
  const knot = (ti, a, b) => ti + Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y));
  const t0 = 0, t1 = knot(t0, p0, p1), t2 = knot(t1, p1, p2), t3 = knot(t2, p2, p3);
  if (t1 <= t0 || t2 <= t1 || t3 <= t2) return { x: p1.x, y: p1.y };
  const tt = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => ({
    x: ((tb - tt) * a.x + (tt - ta) * b.x) / (tb - ta),
    y: ((tb - tt) * a.y + (tt - ta) * b.y) / (tb - ta),
  });
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

/* Sample the curve and tabulate cumulative length, so a distance along it
   can be looked up directly. */
function buildChasePath(pts) {
  const last = pts.length - 1;
  const P = (i) => {
    // phantom endpoints, so the curve keeps its shape right to the ends
    if (i < 0) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    if (i > last) return { x: 2 * pts[last].x - pts[last - 1].x, y: 2 * pts[last].y - pts[last - 1].y };
    return pts[i];
  };
  const SEG = 26;
  const s = [];
  for (let i = 0; i < last; i++) {
    for (let k = 0; k < SEG; k++) s.push(crPoint(P(i - 1), P(i), P(i + 1), P(i + 2), k / SEG));
  }
  s.push(pts[last]);

  const cum = [0];
  for (let i = 1; i < s.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y));
  }
  return { s, cum, len: cum[cum.length - 1] };
}

/* the point `d` pixels along the curve */
function atDistance(path, d) {
  const { s, cum, len } = path;
  d = clamp(d, 0, len);
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const k = span > 0 ? (d - cum[lo]) / span : 0;
  return { x: lerp(s[lo].x, s[hi].x, k), y: lerp(s[lo].y, s[hi].y, k) };
}

/* One even sprint, with just enough ramp at the start that it reads as
   breaking from cover rather than snapping straight to full speed.
   Area-matched so it still finishes the curve exactly as the clock runs out. */
function chasePace(t) {
  const A = 0.2;
  const d = t <= A ? (t * t) / (2 * A) : A / 2 + (t - A);
  return d / (1 - A / 2);
}

function leaveTheMap() {
  if (runnerActive || chase) return;
  loadGame("runner").catch(() => {});     // fetches under cover of the chase
  setCamping(false);          // same for the run: nobody chases a squirrel asleep
  keys.clear();
  target = null;
  edgePush = 0;
  edgeHint.classList.remove("on");
  hideTrailPrompt();
  hiker.classList.remove("walking");

  /* Always out the LEFT, which is the run's side of the paper now. Hard-coded
     rather than read from edgeDir, which the signpost can fire with a stale
     (or vertical) value. */
  const out = [-1, 0];
  const path = buildChasePath(chaseRoute(out));
  chase = {
    t: 0,
    path,
    gap: clamp(
      Math.min(path.len * DOG_GAP_F,
               DOG_GAP_SIDE * Math.min(layout.bounds.x2 - layout.bounds.x1,
                                       layout.bounds.y2 - layout.bounds.y1)),
      DOG_GAP_MIN, DOG_GAP_MAX),
    dogFrom: { x: dogPos.x, y: dogPos.y },
    sqFlip: out[0] < 0 ? -1 : 1,
    dogFlip: dogFacing,
  };
  mapSquirrel.style.display = "";
}

/* No squirrel out this side. Instead the paper itself slides over to reveal a
   chair waiting just off the edge, the pair walk to it and get on, and it
   carries them away — so you're never cut from the map to the game, you just
   follow them out of it. */
const skiChair = $("#skiChair");
const BOARD_MS = 4200, BOARD_PAN = 300;
let boarding = null;

function setPaperWidth(w) {
  const v = w == null ? "100%" : w.toFixed(0);
  for (const id of ["#paperRect", "#dotsRect", "#starsRect"]) $(id).setAttribute("width", v);
}

function leaveForSki() {
  if (runnerActive || chase || boarding) return;
  loadGame("ski").catch(() => {});
  setCamping(false);          // or they board the lift asleep, zzz and all
  keys.clear();
  target = null;
  edgePush = 0;
  edgeHint.classList.remove("on");
  hideTrailPrompt();
  dropStick();
  dogMode = "follow";
  // a teleport onto the seat would otherwise rule one long dash across the map
  trailPts.length = 0;
  trailEl.setAttribute("points", "");
  runnerActive = true;
  boarding = { t: 0, from: { x: pos.x, y: pos.y }, seatX: layout.bounds.x2 + 96 };
  skiChair.style.display = "";
  /* The paper is exactly one viewport wide, so sliding it over would show the
     page behind it. Widen it for the length of the shot. (Not the grain — it
     sits at 4% and nobody will miss it in a strip they see for two seconds.) */
  setPaperWidth(layout.W + BOARD_PAN + 60);
}

function updateBoarding(dt) {
  const b = boarding;
  b.t += dt;
  const t = clamp(b.t / (BOARD_MS / 1000), 0, 1);
  const seg = (a, c) => clamp((t - a) / (c - a), 0, 1);
  const sm = (v) => v * v * (3 - 2 * v);
  const A = layout.art;

  // the paper slides left to find the chair
  const pan = sm(seg(0, 0.32)) * BOARD_PAN;
  const vb = `${pan.toFixed(1)} 0 ${layout.W} ${layout.H}`;
  world.setAttribute("viewBox", vb);
  actors.setAttribute("viewBox", vb);

  // it waits, then swings away up the cable
  const rise = sm(seg(0.74, 1));
  const cx = b.seatX + rise * layout.W * 1.15;
  const cy = b.from.y - rise * layout.H * 0.9;
  place(skiChair, [cx, cy], A);

  const aboard = t >= 0.66;
  if (!aboard) {
    const walk = sm(seg(0.28, 0.62));
    pos.x = lerp(b.from.x, b.seatX - 30 * A, walk);
    pos.y = lerp(b.from.y, b.from.y, walk);
    facing = 1;
    hikerInner.style.transform = "scaleX(1)";
    hiker.classList.toggle("walking", walk > 0.02 && walk < 0.98);
    dogFacing = 1;
    dogPos.x = pos.x - 42 * layout.hik;
    dogPos.y = pos.y + 4;
    dogInner.style.transform = "scaleX(1)";
    dog.classList.toggle("walking", walk > 0.02 && walk < 0.98);
  } else {
    // sat on the seat, riding with it
    document.body.classList.add("boarding");
    hiker.classList.remove("walking");
    dog.classList.remove("walking");
    // sat on the seat itself, which is 29 units up — not floating above it
    pos.x = cx - 7 * A;
    pos.y = cy - 29 * A;
    dogPos.x = cx + 17 * A;
    dogPos.y = cy - 29 * A;
  }
  renderHiker();
  renderDog();

  if (t > 0.88) chaseFade.classList.add("on");
  if (t >= 1) {
    boarding = null;
    document.body.classList.remove("boarding");
    world.setAttribute("viewBox", `0 0 ${layout.W} ${layout.H}`);
    actors.setAttribute("viewBox", `0 0 ${layout.W} ${layout.H}`);
    skiChair.style.display = "none";
    setPaperWidth(null);
    startGame("ski");
  }
}

function updateChase(dt) {
  if (!chase) return;
  chase.t += dt;
  const dur = CHASE_MS / 1000;
  const t = clamp(chase.t / dur, 0, 1);

  const path = chase.path;
  const d = chasePace(t) * path.len;

  const sq = atDistance(path, d);
  mapSquirrel.setAttribute("transform",
    `translate(${sq.x.toFixed(1)},${sq.y.toFixed(1)}) scale(${(layout.art * 1.15).toFixed(3)})`);
  /* face along the tangent, with a deadband so it doesn't flicker back and
     forth while the curve runs nearly straight up or down */
  const tan = atDistance(path, Math.min(path.len, d + 10));
  if (Math.abs(tan.x - sq.x) > 0.6) chase.sqFlip = tan.x < sq.x ? -1 : 1;
  mapSquirrel.style.setProperty("--sq-flip", chase.sqFlip);

  // Felix: same curve, a fixed gap back, eased out of wherever he was stood
  const want = atDistance(path, d - chase.gap);
  const blend = Math.min(1, chase.t / 0.55);
  const nx = lerp(chase.dogFrom.x, want.x, blend);
  const ny = lerp(chase.dogFrom.y, want.y, blend);
  if (Math.abs(nx - dogPos.x) > 0.6) chase.dogFlip = nx > dogPos.x ? 1 : -1;
  dogFacing = chase.dogFlip;
  dogPos.x = nx; dogPos.y = ny;
  dog.classList.add("walking", "running");
  dogInner.style.transform = `scaleX(${dogFacing})`;
  renderDog();

  if (t > 0.9) chaseFade.classList.add("on");

  if (t >= 1) {
    chase = null;
    mapSquirrel.style.display = "none";
    startRunner();
  }
}

/* Coming back from any game: put the pair down safely inside the paper,
   not against the boundary they left by, and let the edge settle. */
function backFromGame() {
  runnerActive = false;
  boarding = null;
  document.body.classList.remove("boarding");
  skiChair.style.display = "none";
  setPaperWidth(null);
  if (layout) {
    const vb = `0 0 ${layout.W} ${layout.H}`;
    world.setAttribute("viewBox", vb);
    actors.setAttribute("viewBox", vb);
  }
  edgePush = 0;
  edgeDir = null;
  edgeCooldown = 1.4;
  hideTrailPrompt();
  keys.clear();
  target = null;
  const m = 90;
  pos.x = clamp(pos.x, layout.bounds.x1 + m, layout.bounds.x2 - m);
  pos.y = clamp(pos.y, layout.bounds.y1 + m, layout.bounds.y2 - m);
  crumbs.length = 0;
  dropStick();
  dogMode = "follow";                     // he came back with you, not still after the birds
  chaseGoal = null;
  chaseUntil = 0;
  dogPos.x = pos.x - layout.leash * facing;
  dogPos.y = pos.y + 5;
  renderHiker();
  renderDog();
  dog.classList.remove("running");
  lastT = performance.now();
  chaseFade.classList.remove("on");
  updateSignpost();
}

function startGame(name) {
  runnerActive = true;
  loadGame(name).then((mod) => {
    mod.start({
      night: document.body.classList.contains("night"),
      onExit: backFromGame,
    });
    // hold the cover a moment so the trail is already drawn behind it
    setTimeout(() => chaseFade.classList.remove("on"), 260);
  }).catch(() => {
    // offline, or the file's missing: put them back on the paper rather
    // than leaving the screen covered forever
    backFromGame();
  });
}
const startRunner = () => startGame("runner");

/* the keepsakes: one signpost per way off the paper, each earned separately
   and each pointing the way you'd go to beat it */
const SIGNS = {
  runner: {
    el: $("#signpost"), txt: $("#signpostText"), go: () => leaveTheMap(),
    label: (m) => `Your best walk off the map: ${m} metres. Activate to go again.`,
  },
  ski: {
    el: $("#skiSign"), txt: $("#skiSignText"), go: () => leaveForSki(),
    label: (m) => `Your best ski run: ${m} metres. Activate to go again.`,
  },
};

function updateSignpost() {
  for (const [name, s] of Object.entries(SIGNS)) {
    const best = bestFor(name);
    const spot = layout.signposts && layout.signposts[name];
    /* the display test has to include the spot: compact deliberately has no
       room for these, and without this an earned board rendered untransformed
       at the SVG origin */
    const show = best >= GAMES[name].keepsakeAt && !!spot;
    s.el.style.display = show ? "" : "none";
    if (!show) continue;
    s.txt.textContent = `${best} m`;
    s.el.setAttribute("transform",
      `translate(${spot.x.toFixed(1)},${spot.y.toFixed(1)}) scale(${layout.art.toFixed(3)})`);
    s.el.setAttribute("aria-label", s.label(best));
  }
}

for (const s of Object.values(SIGNS)) {
  s.el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); s.go(); });
  s.el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); s.go(); }
  });
}

window.onRunFinished = () => updateSignpost();

/* --- throw a stick, press T --- */

function renderStick() {
  const sc = layout.hik;
  const shrink = 1 - stick.lift / 320;      // the shadow tightens as it rises
  stickShadow.setAttribute("transform",
    `translate(${stick.gx.toFixed(1)},${stick.gy.toFixed(1)}) scale(${(sc * shrink).toFixed(3)})`);
  stickBody.setAttribute("transform",
    `translate(${stick.gx.toFixed(1)},${(stick.gy - stick.lift).toFixed(1)}) ` +
    `rotate(${stick.spin.toFixed(0)}) scale(${sc.toFixed(3)})`);
}

function updateStick(dt) {
  if (!stick) return;
  if (!stick.landed) {
    stick.t += dt;
    const p = Math.min(1, stick.t / stick.dur);
    stick.gx = stick.sx + (stick.tx - stick.sx) * p;
    stick.gy = stick.sy + (stick.ty - stick.sy) * p;
    stick.lift = stick.arc * Math.sin(Math.PI * p);
    stick.spin += dt * 760 * (stick.tx >= stick.sx ? 1 : -1);
    if (p >= 1) { stick.landed = true; stick.lift = 0; dogMode = "fetch-out"; }
  } else if (stick.carried) {
    const sc = layout.hik;
    stick.gx = dogPos.x + 13 * sc * dogFacing;
    stick.gy = dogPos.y;
    stick.lift = 16 * sc;               // held at mouth height
    stick.spin = dogFacing > 0 ? -14 : 14;
  }
  renderStick();
}

function throwStick() {
  if (REDUCED.matches || stick) return;
  stirCamp();
  firstInput();

  hiker.classList.add("throwing");
  setTimeout(() => hiker.classList.remove("throwing"), 620);

  // released as the arm comes forward, not the instant you press the key
  setTimeout(() => {
    if (stick) return;
    const sc = layout.hik;
    throwCount++;
    const reach = clamp(0.3 * Math.min(layout.W, layout.H), 130, 340);
    const drift = (throwCount % 2 ? 1 : -1) * 32 * sc;
    stick = {
      sx: pos.x + 11 * sc * facing,
      sy: pos.y - 26 * sc,
      tx: clamp(pos.x + reach * facing, layout.bounds.x1 + 24, layout.bounds.x2 - 24),
      ty: clamp(pos.y + drift, layout.bounds.y1 + 24, layout.bounds.y2 - 24),
      gx: pos.x, gy: pos.y,
      t: 0, dur: 0.62, arc: 44 * sc, lift: 0, spin: 0,
      landed: false, carried: false,
    };
    stickWrap.classList.add("live");
    renderStick();
  }, 170);
}

/* --- birds startle when you walk up on them --- */

const birdsEl = $("#decorBirds");
let birdsGoneAt = 0;

function checkBirds(now) {
  if (!layout.birds) return;
  const near = Math.hypot(layout.birds.x - pos.x, layout.birds.y - pos.y);

  if (birdsEl.classList.contains("scattered")) {
    // they only come back once you've wandered off — otherwise standing in the
    // same spot would startle them again the instant they land
    if (now - birdsGoneAt > 17000 && near > 190 * layout.art) {
      birdsEl.classList.remove("scattered");
      birdsEl.style.removeProperty("--fly-x");
      birdsEl.style.removeProperty("--fly-y");
    }
    return;
  }
  if (near >= 108 * layout.art) return;

  // out over the nearest side, far enough to clear any viewport
  const dirX = layout.birds.x < layout.W / 2 ? -1 : 1;
  const flyX = dirX * (layout.W * 0.8 + 280);
  const flyY = -(layout.birds.y + 280);
  birdsEl.style.setProperty("--fly-x", `${flyX.toFixed(0)}px`);
  birdsEl.style.setProperty("--fly-y", `${flyY.toFixed(0)}px`);
  birdsEl.classList.add("scattered");
  birdsGoneAt = now;

  // she gives chase, tracking them until they clear the paper
  if (!REDUCED.matches && dogMode === "follow") {
    chaseDir = dirX;
    chaseGoal = { x: layout.birds.x, y: layout.birds.y };
    chaseUntil = now + 3200;
    dogMode = "chase";
  }
}

/* --- the compass points at what you haven't seen --- */

const needleSpin = $(".needle-spin");
let needleDeg = 0;

function updateNeedle() {
  const left = SECTIONS.filter((s) => !visited.has(s));
  let deg = 0;
  if (left.length) {
    // nearest unvisited landmark, so the hint is always the shortest walk
    let best = null, bestD = Infinity;
    for (const s of left) {
      const p = layout.landmarks[s];
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    deg = (Math.atan2(best.y - pos.y, best.x - pos.x) * 180) / Math.PI + 90;
  }
  if (Math.abs(deg - needleDeg) < 3) return;   // don't thrash the DOM
  needleDeg = deg;
  needleSpin.style.rotate = `${deg.toFixed(0)}deg`;
}

/* --- field trip complete --- */

const doneStamp = $("#doneStamp");
/* Session-only, to match the stamps it pays off. Persisting this while the
   stamps reset would be the worst of both: a returning visitor re-collects
   all five and gets nothing at the end for it. */
let doneShown = false;
try { localStorage.removeItem("fieldnotes-done"); } catch (_) {}

function checkComplete() {
  if (doneShown || SECTIONS.some((s) => !visited.has(s))) return;
  doneShown = true;
  doneStamp.classList.add("thump");
  setTimeout(() => doneStamp.classList.remove("thump"), 3000);
}

/* --- type "woof" --- */

let typed = "";
addEventListener("keydown", (e) => {
  if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
  if (anyDialogOpen()) return;
  const k = e.key.toLowerCase();

  if (k === "t") { e.preventDefault(); throwStick(); return; }

  typed = (typed + k).slice(-4);
  if (typed === "woof") { typed = ""; petDog(); }
});

/* ------------------------------------------------------------
   petting (the whole reason to have a dog)
   ------------------------------------------------------------ */

const SAYS = ["woof!", "woof woof!", "arf!", "boof.", "*tail thump*"];
let petCount = 0, petT = null, sayT = null;

function petDog() {
  firstInput();
  petCount++;
  dog.classList.add("happy");
  clearTimeout(petT);
  petT = setTimeout(() => dog.classList.remove("happy"), 1700);

  const say = $(".dog-say");
  say.textContent = petCount === 1
    ? `${SITE.dogName}!`
    : SAYS[(petCount - 2) % SAYS.length];

  const lift = 38 * (layout ? layout.hik : 1);
  dogSpeak.setAttribute("transform",
    `translate(${dogPos.x.toFixed(1)},${(dogPos.y - lift).toFixed(1)})`);
  dogSpeak.classList.remove("say");
  void dogSpeak.getBBox();
  dogSpeak.classList.add("say");
  clearTimeout(sayT);
  sayT = setTimeout(() => dogSpeak.classList.remove("say"), 1450);
}

/* One tap pets him; a second tap inside a blink throws the stick — the same
   throw the T key does, so touch visitors get that easter egg too. */
let dogTapAt = 0;
dog.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  const t = performance.now();
  if (t - dogTapAt < 340) { dogTapAt = 0; throwStick(); return; }
  dogTapAt = t;
  petDog();
});
dog.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); petDog(); }
});

let hintDismissed = false;
function firstInput() {
  stirCamp();
  if (hintDismissed) return;
  hintDismissed = true;
  hintChip.classList.add("hidden");
  startNote.classList.add("gone");
}

/* any sign of life breaks camp, including moving the mouse over the map */
["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((evt) =>
  addEventListener(evt, stirCamp, { passive: true })
);

/* ------------------------------------------------------------
   sections, routing, visited stamps
   ------------------------------------------------------------ */

/* Deliberately NOT persisted. A returning visitor arrives with every stamp
   blank and the whole map worth walking again — the point of the stamps is to
   pull you round the places you haven't been, and a fully-stamped map on
   arrival is a map that says you're finished. Session-only keeps the nudge.
   (Bests are a different thing and do persist: those are yours.) */
const visited = new Set();
try { localStorage.removeItem("fieldnotes-visited"); } catch (_) {}

function markVisited(sec, instant = false) {
  visited.add(sec);
  const stamp = $("#lm-" + sec + " .stamp");
  if (!stamp) return;
  if (instant) {
    stamp.style.transition = "none";
    stamp.classList.add("stamped");
    requestAnimationFrame(() => (stamp.style.transition = ""));
  } else {
    stamp.classList.add("stamped");
  }
}

function openSection(sec) {
  if (!ROUTES.includes(sec)) return;
  if (runnerActive || chase) return;      // mid-handover the paper is covered, not gone
  if (location.hash === "#/" + sec) { route(); return; }
  location.hash = "#/" + sec;      // route() opens the dialog
}

function closeAllDialogs() {
  $$("dialog[open]").forEach((d) => d.close());
}

function route() {
  const sec = location.hash.replace(/^#\//, "");
  if (!ROUTES.includes(sec)) { closeAllDialogs(); return; }

  keys.clear(); target = null;
  hiker.classList.remove("walking");
  $$("dialog[open]").forEach((d) => { if (d.id !== "dlg-" + sec) d.close(); });
  const dlg = $("#dlg-" + sec);
  if (!dlg.open) {
    /* open first, build second: the mosaic measures the grid's real width,
       and a closed <dialog> is display:none — it measures 0 */
    dlg.showModal();
    if (GALLERIES.includes(sec)) buildGallery(sec);
  }

  if (SECTIONS.includes(sec)) {
    // park the hiker at that landmark so closing feels continuous
    const p = layout.landmarks[sec];
    pos.x = p.x;
    pos.y = clamp(p.y + 58 * layout.art, layout.bounds.y1, layout.bounds.y2);
    moveDogAlong();
    markVisited(sec);
    checkComplete();
  } else {
    /* Reached by stepping off the top or bottom, which leaves you pinned to a
       boundary. Step back onto the paper so closing the gallery doesn't drop
       you straight back through the same edge. */
    pos.y = clamp(pos.y, layout.bounds.y1 + 90, layout.bounds.y2 - 90);
    moveDogAlong();
    edgeDir = null;
    edgePush = 0;
    edgeCooldown = 1.2;
  }
  firstInput();
}

/* Bring the hiker's own rendering and the dog up to a position set directly —
   no leaving Felix behind on the other side of the map. */
function moveDogAlong() {
  renderHiker();
  /* Jumping across the map would otherwise leave one long dash ruled straight
     between where you were and where you now are. */
  trailPts.length = 0;
  trailEl.setAttribute("points", "");
  dogMode = "follow";   // cancel any bird chase — she's beside you now
  crumbs.length = 0;
  dropCrumb(pos.x, pos.y);
  dogPos.x = pos.x - layout.leash * facing;
  dogPos.y = pos.y + 5;
  renderDog();
}
addEventListener("hashchange", route);

/* clear the hash when a dialog is dismissed (Esc / close button) */
for (const sec of ROUTES) {
  $("#dlg-" + sec).addEventListener("close", () => {
    if (location.hash === "#/" + sec) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    /* Suppression stops the landmark you just closed from reopening under the
       hiker still standing on it. "everything" has no landmark to stand on. */
    if (!SECTIONS.includes(sec)) { edgeCooldown = 1.2; return; }
    suppressed = sec;
    $("#lm-" + sec).classList.add("suppressed");
  });
}

$$("[data-close]").forEach((btn) =>
  btn.addEventListener("click", () => btn.closest("dialog").close())
);

/* click on the paper around a sheet closes it */
$$(".paper-dlg").forEach((dlg) =>
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); })
);

/* The name in the corner. With something open it's the way back to the map;
   on the bare map it shakes, re-inks itself and tries out another tagline —
   which wears off after a few seconds and fades back to the real one. */
const TAGLINES = [
  "people, places & projects",
  "have camera, will travel",
  "will walk for good light",
  `${SITE.dogName.toLowerCase()} did the scouting`,
];
const TAG_WEARS_OFF = 5000;
let tagIdx = 0, brandT = 0;

$("#brandBtn").addEventListener("click", () => {
  const wasOpen = anyDialogOpen();
  closeAllDialogs();
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (wasOpen) return;                  // that click meant "back to the map"

  const chip = $("#brandBtn");
  const span = $("#brandBtn span");
  clearTimeout(brandT);
  chip.classList.remove("fade");

  tagIdx = (tagIdx % (TAGLINES.length - 1)) + 1;   // cycle the fun ones only
  span.textContent = TAGLINES[tagIdx];
  chip.classList.remove("reink");
  void chip.offsetWidth;                // restart the animation from zero
  chip.classList.add("reink");

  brandT = setTimeout(() => {
    /* drop .reink first: its finished animation still pins the span's
       opacity, and the fade transition would lose to it */
    chip.classList.remove("reink");
    chip.classList.add("fade");
    brandT = setTimeout(() => {
      tagIdx = 0;
      span.textContent = TAGLINES[0];
      chip.classList.remove("fade");
    }, 420);
  }, TAG_WEARS_OFF);
});

/* ------------------------------------------------------------
   contents (fast travel)
   ------------------------------------------------------------ */

const contentsDlg = $("#dlg-contents");

const CONTENTS_META = {
  peaks:      { name: "Peaks & Wilds", page: 12 },
  journeys:   { name: "Journeys",      page: 24 },
  portraits:  { name: "Good Company",  page: 36 },
  everything: { name: "The Whole Lot", page: 42 },
  about:      { name: "About me",      page: 48 },
  contact:    { name: "Say hello",     page: 60 },
};

const CONTENTS_ORDER =
  ["peaks", "journeys", "portraits", "everything", "about", "contact"];

function openContents() {
  if (contentsDlg.open) { contentsDlg.close(); return; }
  const list = $("#contentsList");
  list.innerHTML = "";
  for (const sec of CONTENTS_ORDER) {
    const col = SITE.collections[sec];
    const meta = CONTENTS_META[sec];
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.innerHTML =
      `<span class="c-name">${meta.name}</span>` +
      (col ? `<span class="c-count">${col.photos.length} photos</span>` : "") +
      `<span class="c-leader"></span>` +
      (visited.has(sec) ? `<span class="c-seen">seen</span>` : "") +
      `<span class="c-page">p.${meta.page}</span>`;
    btn.addEventListener("click", () => { contentsDlg.close(); openSection(sec); });
    li.appendChild(btn);
    list.appendChild(li);
  }
  contentsDlg.showModal();
}

$("#compassBtn").addEventListener("click", openContents);

/* ------------------------------------------------------------
   galleries + lightbox
   ------------------------------------------------------------ */

/* The order a gallery is currently showing. Reshuffled on every open, so the
   lightbox has to walk this rather than the source list. */
const shownOrder = {};

/* Fisher-Yates, the same shuffle the old site used. */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Rebuilt from scratch each time you open it: new random order, and the tiles
   cascade 80ms apart in shuffle order — the reveal from the old site, kept to
   its original timing (0.7s, cubic-bezier(.4,0,.2,1), 40px rise). */
const STAGGER_MS = 80;
const revealTimers = {};

/* ---------- the mosaic ----------
   The old site handed layout to Isotope (script.js ran
   $('.grid').isotope(...) at window.load): Bootstrap set only each tile's
   width, then Isotope placed every tile, in DOM order, into whichever column
   was currently shortest — flush under that column's last photo. Same rule
   here, minus the library: THUMB_SIZES gives every aspect ratio up front, so
   the very same placement decisions can happen synchronously, before a single
   image has loaded. */

const GAL_GAP = 24;              // Bootstrap's gutter, as on the old site
const tileOrder = {};            // tiles per section, in shuffle order

/* Three columns at most — Chris prefers the bigger photos — then the old
   site's narrower breakpoints (2 under 768px, 1 under 576px). */
function galColumns(w) {
  return w >= 768 ? 3 : w >= 576 ? 2 : 1;
}

function placeMasonry(sec) {
  const grid = $("#grid-" + sec);
  const tiles = tileOrder[sec];
  if (!tiles || !tiles.length) return;

  const cs = getComputedStyle(grid);
  const inner = (grid.clientWidth || innerWidth)
    - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const n = galColumns(innerWidth);
  const colW = (inner - (n - 1) * GAL_GAP) / n;

  grid.replaceChildren();
  const cols = [], heights = [];
  for (let c = 0; c < n; c++) {
    const div = document.createElement("div");
    div.className = "gal-col";
    grid.appendChild(div);
    cols.push(div);
    heights.push(0);
  }

  for (const t of tiles) {
    let best = 0;
    for (let c = 1; c < n; c++) if (heights[c] < heights[best]) best = c;
    cols[best].appendChild(t);
    heights[best] += colW / t._ar + GAL_GAP;
  }
}

/* Re-pack any open gallery when the viewport changes shape — same tiles,
   same order, new column count. No reshuffle. */
function replaceOpenGalleries() {
  for (const sec of GALLERIES) {
    if ($("#dlg-" + sec).open) placeMasonry(sec);
  }
}

/* The way in from the other galleries — the map itself keeps quiet about it
   (walking off the top or bottom of the paper is the secret way). Modelled on
   the old site's centred "Gallery" button under its home grid. */
$$(".gal-more-btn").forEach((btn) => {
  btn.textContent =
    `the whole lot — all ${SITE.collections.everything.photos.length} photographs →`;
  btn.addEventListener("click", () => openSection("everything"));
});

function buildGallery(sec) {
  const col = SITE.collections[sec];
  const order = shuffle(col.photos.slice());
  shownOrder[sec] = order;

  $("#sub-" + sec).textContent = `${order.length} photographs · ${col.blurb}`;

  (revealTimers[sec] || []).forEach(clearTimeout);   // a half-run cascade from last time
  revealTimers[sec] = [];

  const tiles = order.map((ph, i) => {
    const btn = document.createElement("button");
    btn.className = "ph";
    btn.setAttribute("aria-label", `View photo ${i + 1} of ${order.length}`);
    btn._ar = ph.ar || 1.5;

    const img = document.createElement("img");
    if (i > 5) img.loading = "lazy";
    /* Every photo shows at its own shape, so reserve that shape before the
       jpeg arrives — otherwise the lazy loads below the fold would reshuffle
       the columns as they stream in. */
    if (ph.ar) img.style.aspectRatio = String(ph.ar);
    img.src = ph.thumb || ph.src;
    img.alt = ph.alt || "";
    btn.appendChild(img);

    btn.addEventListener("click", () => openLightbox(sec, i));
    return btn;
  });

  tileOrder[sec] = tiles;
  placeMasonry(sec);

  if (REDUCED.matches) {
    tiles.forEach((t) => t.classList.add("visible"));
    return;
  }

  /* setTimeout rather than a rAF chain on purpose: rAF is suspended while the
     tab is in the background, which would leave a gallery opened in a hidden
     tab permanently blank. This is also exactly how the old site did it. */
  tiles.forEach((t, i) => {
    revealTimers[sec].push(setTimeout(() => t.classList.add("visible"), i * STAGGER_MS));
  });
}

const lightbox = $("#dlg-lightbox");
const lbImg = $("#lbImg"), lbCap = $("#lbCap"), lbPlace = $("#lbPlace"), lbCount = $("#lbCount");
let lbSec = null, lbIdx = 0;

/* walks the order currently on screen, not the source list */
function lbPhotos() { return shownOrder[lbSec] || SITE.collections[lbSec].photos; }

function preload(i) {
  const list = lbPhotos();
  const ph = list[(i + list.length) % list.length];
  if (ph) new Image().src = ph.src;
}

function renderLightbox() {
  const ph = lbPhotos()[lbIdx];
  // show the (already cached) thumb immediately, then swap in full-res
  lbImg.src = ph.thumb || ph.src;
  lbImg.alt = ph.alt || ph.caption;
  const next = new Image();
  next.onload = () => {
    if (lbPhotos()[lbIdx] !== ph) return;   // user already moved on
    lbImg.src = next.src;
  };
  next.src = ph.src;
  lbCap.textContent = ph.caption;
  lbPlace.textContent = ph.place || "";
  lbPlace.style.display = ph.place ? "" : "none";
  lbCount.textContent = `${lbIdx + 1} / ${lbPhotos().length}`;
  preload(lbIdx + 1); preload(lbIdx - 1);
}

function openLightbox(sec, i) {
  lbSec = sec; lbIdx = i;
  renderLightbox();
  lightbox.showModal();
}

function lbStep(delta) {
  lbIdx = (lbIdx + delta + lbPhotos().length) % lbPhotos().length;
  renderLightbox();
  if (!REDUCED.matches) {
    lbImg.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }
}

$("#lbPrev").addEventListener("click", () => lbStep(-1));
$("#lbNext").addEventListener("click", () => lbStep(1));
lbImg.style.cursor = "pointer";

lightbox.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { e.preventDefault(); lbStep(1); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); lbStep(-1); }
});

/* one pointer handler covers desktop click-to-advance, swipe, and edge taps */
let swipeX = null, swipeY = null;
lightbox.addEventListener("pointerdown", (e) => { swipeX = e.clientX; swipeY = e.clientY; });
lightbox.addEventListener("pointerup", (e) => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX, dy = e.clientY - swipeY;
  swipeX = swipeY = null;

  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    lbStep(dx < 0 ? 1 : -1);          // swipe
    return;
  }
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;   // drag, not a tap
  if (e.target.closest("button") || e.target.closest("figcaption")) return;

  if (COARSE.matches) {
    const third = innerWidth / 3;      // edge taps on touch
    if (e.clientX < third) lbStep(-1);
    else if (e.clientX > innerWidth - third) lbStep(1);
  } else if (e.target === lbImg) {
    lbStep(1);                         // click the photo to advance
  }
});

/* ------------------------------------------------------------
   fill static content from the manifest
   ------------------------------------------------------------ */

const aboutPh = SITE.about.photo;
const aboutImg = $("#aboutPhoto");
aboutImg.src = aboutPh.thumb || aboutPh.src;
aboutImg.alt = aboutPh.alt || "";
$("#aboutCaption").textContent = aboutPh.caption || "";
$("#addrLocation").textContent = SITE.location;
dog.setAttribute("aria-label", `Pet ${SITE.dogName}, the dog`);
$("#dogNameTip").textContent = SITE.dogName;
$("#colophon").textContent = SITE.copyright;

/* ------------------------------------------------------------
   contact — the email stays behind a sum so scrapers don't get it,
   exactly as it works on chrisclicks.com today
   ------------------------------------------------------------ */

const revealBtn = $("#revealBtn");
const captchaBox = $("#captchaBox");
const captchaQ = $("#captchaQuestion");
const captchaAnswer = $("#captchaAnswer");
const captchaError = $("#captchaError");
const emailBox = $("#emailBox");
let sumAnswer = 0;

revealBtn.addEventListener("click", () => {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  sumAnswer = a + b;
  captchaQ.textContent = `To show the address, what is ${a} + ${b}?`;
  captchaBox.hidden = false;
  revealBtn.hidden = true;
  captchaError.hidden = true;
  captchaAnswer.value = "";
  captchaAnswer.focus();
});

function checkSum() {
  if (parseInt(captchaAnswer.value, 10) === sumAnswer) {
    captchaBox.hidden = true;
    const link = $("#mailLink");
    link.href = "mailto:" + SITE.email;
    link.textContent = SITE.email;
    emailBox.hidden = false;
    link.focus();
  } else {
    captchaError.hidden = false;
    captchaAnswer.value = "";
    captchaAnswer.focus();
  }
}

$("#captchaSubmit").addEventListener("click", checkSum);
captchaAnswer.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); checkSum(); }
});

/* the form posts to the same Google Apps Script the old site used */
const contactForm = $("#contactForm");
const cfStatus = $("#cfStatus");

contactForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = contactForm.elements.name.value.trim();
  const email = contactForm.elements.email.value.trim();
  const message = contactForm.elements.message.value.trim();

  if (!name || !email || !message) {
    cfStatus.textContent = "Please fill in all three boxes first.";
    cfStatus.className = "form-status bad";
    return;
  }

  const btn = $("#cfSend");
  btn.disabled = true;
  cfStatus.className = "form-status";
  cfStatus.textContent = "Sending…";

  fetch(SITE.formEndpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, email, message }),
  })
    .then((r) => r.json())
    .then(() => {
      cfStatus.textContent = "Thank you — message sent.";
      cfStatus.className = "form-status good";
      contactForm.reset();
    })
    .catch(() => {
      cfStatus.textContent =
        "That didn't send. You can reach me directly using the address on the right.";
      cfStatus.className = "form-status bad";
    })
    .finally(() => { btn.disabled = false; });
});

/* ------------------------------------------------------------
   boot
   ------------------------------------------------------------ */

/* The hint keeps its keycap markup at full size, but narrow screens get
   plain short copy — a nowrap keycap run would otherwise slide under the
   contents button. Re-run while it's still on screen so rotating works. */
function setHint() {
  if (hintDismissed) return;
  const narrow = innerWidth < 620;
  if (COARSE.matches) {
    hintChip.textContent = narrow
      ? "tap to walk · hold to lead"
      : "tap to walk, hold to lead · tap a drawing to open it";
  } else if (narrow) {
    hintChip.textContent = "arrow keys to walk · esc for contents";
  }
}

if (COARSE.matches) {
  $$(".enter-tip text").forEach((t) => (t.textContent = "tap to open"));
}
setHint();

applyLayout();
updateSignpost();
try { setNight(localStorage.getItem("fieldnotes-night") === "1", false); } catch (_) {}

/* ResizeObserver rather than window.resize: it also catches mobile
   browser chrome collapsing, which changes dvh without a resize event. */
let resizeT = null;
new ResizeObserver(() => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    applyLayout(true); setHint(); updateSignpost();
    replaceOpenGalleries();
  }, 140);
}).observe(stage);

route();                       // honor deep links like index.html#/peaks
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(tick); });
requestAnimationFrame(() => document.body.classList.add("loaded"));
