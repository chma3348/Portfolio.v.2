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
  featured: SECTIONS.flatMap((s) => SITE.collections[s]?.featured || []),
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
      birds:   [0.560, 0.900],   // bottom-centre: clear of the boarding pan AND the contents pill
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
const fullCover = $$(".gallery-dlg, .lightbox");
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  // …unless the pair are still boarding the chair, which happens here
  if (boarding) { updateBoarding(dt); requestAnimationFrame(tick); return; }

  // the map idles while you're off running
  if (runnerActive) { requestAnimationFrame(tick); return; }

  // …and they ski back on when you're done
  if (arriving) { updateArrival(dt); requestAnimationFrame(tick); return; }

  // …but the squirrel chase plays out on the map first
  if (chase) { updateChase(dt); requestAnimationFrame(tick); return; }

  // nothing to draw under a gallery or the photo viewer: they cover the whole map
  if (fullCover.some((d) => d.open)) { requestAnimationFrame(tick); return; }

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
  /* the browser's shortcuts aren't walking: Cmd+D bookmarking walked him
     right — and macOS never sends the keyup for a key released while Cmd is
     down, so he kept walking off the edge and onto the ski lift */
  if (e.metaKey || e.ctrlKey || e.altKey) return;

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
  if (e.key === "Meta") { keys.clear(); return; }   // keyups swallowed while it was held
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
    /* a stalled connection neither loads nor errors, and the cover would
       stay up with every input ignored — give up and put them back */
    setTimeout(() => reject(new Error(g.src + " timed out")), 12000);
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

/* The cloud bank the chair climbs into, and the ski run opens out of — so
   the trip from paper to mountain reads as one journey, not a fade to white.
   Puffs roll in from the right (the way the chair travels) and out to the
   left. Used for both directions and for the quick wipe on "go again". */
const cloudWipe = (() => {
  const el = $("#cloudWipe");
  const svg = el.querySelector("svg.cw-sky");
  let k = 0;
  const rnd = () => { const v = Math.sin(++k * 91.17) * 43758.5453; return v - Math.floor(v); };
  const f = (n) => n.toFixed(1);
  /* Real cumulus, not a wall of circles: each cloud is a flat base with
     puffs piled up on top — biggest in the middle — outlined in ink only
     on its outside (ink discs under paper discs), clipped flat along the
     bottom, with a soft shadow on its underside and a pencil base line.
     They roll in at different speeds over a rising mist, and keep drifting
     while you're inside, so it reads as flying through cloud. */
  let html = "", id = 0;
  for (let row = 0; row < 6; row++) {
    const by = 14 + row * 19 + (rnd() - 0.5) * 4;
    for (let col = -1; col < 3; col++) {
      const w = 54 + rnd() * 30;
      const cx = col * 58 + (row % 2) * 29 + 20 + (rnd() - 0.5) * 12;
      const n = 4 + Math.floor(rnd() * 3);
      let inkC = "", papC = "";
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, mid = 1 - Math.abs(u - 0.5) * 2;
        const r = w * (0.12 + 0.12 * mid) * (0.85 + rnd() * 0.3);
        const x = cx - w / 2 + w * u + (rnd() - 0.5) * 3;
        const y = by - r * (0.55 + 0.35 * mid);
        inkC += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 0.6)}"/>`;
        papC += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
      }
      const x0 = cx - w / 2 - 2, x1 = cx + w / 2 + 2;
      const fd = (0.4 * (1 - (cx + 40) / 220) + 0.1 * (row / 6) + rnd() * 0.08).toFixed(3);
      const fq = (0.4 * ((cx + 40) / 220) + rnd() * 0.1).toFixed(3);
      const sp = 0.8 + rnd() * 0.5;      // parallax: some travel further, some less
      const vars = `--px:${(200 * sp).toFixed(0)}px;--py:${(-30 - rnd() * 30).toFixed(0)}px;` +
                   `--qx:${(-200 * sp).toFixed(0)}px;--qy:${(20 + rnd() * 25).toFixed(0)}px;` +
                   `--fd:${fd};--fq:${fq};--dr:${(4 + rnd() * 6).toFixed(1)}px`;
      html += `<clipPath id="cwc${id}"><rect x="${f(x0 - 30)}" y="-200" width="${f(x1 - x0 + 60)}" height="${f(by + 200)}"/></clipPath>` +
        `<g class="cw-cloud" style="${vars}"><g class="cw-drift"><g clip-path="url(#cwc${id})">` +
        `<g class="cw-ink">${inkC}</g><g class="cw-paper">${papC}</g>` +
        `<ellipse class="cw-shade" cx="${f(cx)}" cy="${f(by - 1)}" rx="${f(w * 0.48)}" ry="${f(w * 0.09)}"/>` +
        `</g><path class="cw-base" d="M${f(x0 + 6)},${f(by)} L${f(x1 - 6)},${f(by)}"/></g></g>`;
      id++;
    }
  }
  svg.innerHTML = html;
  let covered = false, token = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function cover(ms = 1700) {
    const my = ++token;
    el.style.setProperty("--cw-ms", ms + "ms");
    el.classList.add("cw-on", "cw-snap");
    el.classList.remove("cw-cover", "cw-post", "cw-full");
    void el.offsetWidth;
    el.classList.remove("cw-snap");
    el.classList.add("cw-cover");
    covered = true;
    setTimeout(() => { if (my === token) el.classList.add("cw-full"); }, ms * 0.8);
    return wait(ms + 120);
  }
  function clear(ms = 2100) {
    if (!covered) return Promise.resolve();
    const my = ++token;
    covered = false;
    el.style.setProperty("--cw-ms", ms + "ms");
    el.classList.remove("cw-full", "cw-cover");
    el.classList.add("cw-post");
    return wait(ms + 150).then(() => {
      if (my !== token) return;
      el.classList.add("cw-snap");
      el.classList.remove("cw-post", "cw-on");
    });
  }
  return { cover, clear, get covered() { return covered; } };
})();
window.cloudWipe = cloudWipe;
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
  if (runnerActive || chase || arriving) return;
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
  for (const id of ["#paperRect", "#dotsRect", "#starsRect", "#grainRect"]) $(id).setAttribute("width", v);
}

function leaveForSki() {
  // not mid-ski-in either: he boarded still in his skiing pose
  if (runnerActive || chase || boarding || arriving) return;
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
     page behind it. Widen it for the length of the shot — ALL of it, grain
     included: it's only 4%, but a strip without it is visibly whiter. */
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

  // the chair climbs into the cloud bank as it lifts away; the ski run opens out of it
  if (t > 0.7 && !b.clouded) { b.clouded = true; b.inCloud = cloudWipe.cover(1700); }
  if (t >= 1) {
    const inCloud = b.inCloud || Promise.resolve();
    boarding = null;
    document.body.classList.remove("boarding");
    world.setAttribute("viewBox", `0 0 ${layout.W} ${layout.H}`);
    actors.setAttribute("viewBox", `0 0 ${layout.W} ${layout.H}`);
    skiChair.style.display = "none";
    setPaperWidth(null);
    // switch only once we're properly inside the cloud
    inCloud.then(() => startGame("ski"));
  }
}

/* ---------- skiing back onto the map ----------
   The run ends by handing you back to the paper, and a hiker who simply
   materialises where he left is the same jump-cut the boarding scene exists
   to avoid. He comes back in from the side he left by, on skis, with Felix
   running alongside him rather than trailing on the leash. */
const ARRIVE_MS = 1900;
let arriving = null;

function startArrival(wait = 0) {
  if (!layout) return;
  setCamping(false);          // nobody skis in sitting cross-legged by a tent
  /* All the way to the middle of the paper, not just over the edge — coming
     to rest in the margin reads as stopping because the screen ran out.
     layout.start is the map's own "you are here", so it's both centre-screen
     and a sensible place to be left standing. */
  /* If the ski signpost is up, he skis to IT — glides to a stop beside the
     post, leans his skis against it, and walks the rest of the way. The
     skis just appearing on the sign meant nothing; watching him put them
     there is what makes it a keepsake. No signpost yet (under 150 m), and
     he skis all the way to the middle as before. */
  const spot = layout.signposts && layout.signposts.ski;
  const toSign = !!spot && $("#skiSign").style.display !== "none";
  if (toSign) {
    const A = layout.art;
    // the near side of the post: the sign sits right by the edge, past it there's no room
    const tx = spot.x - 36 * A, ty = clamp(spot.y + 28 * A, layout.bounds.y1, layout.bounds.y2);
    skiSignSkis.style.display = "none";           // he's still wearing them
    /* A carve, not a straight line: in from the right, a swoop up and round
       to the left, and back down into the stop moving TOWARDS the post — a
       little show of actually skiing, ending facing the thing he's about to
       lean his skis on. Kept inside the paper's bounds. */
    // sized from the SCREEN, not the drawing scale — tied to the art it was a 150 px wiggle
    const W = layout.W, H = layout.H;
    const yTop = Math.max(layout.bounds.y1 + 20, ty - 0.34 * H);
    const xLeft = Math.max(layout.bounds.x1 + 20, tx - 0.36 * W);
    const path = [[layout.bounds.x2 + 130, Math.max(layout.bounds.y1 + 20, ty - 0.24 * H)],
                  [tx - 0.06 * W, yTop], [xLeft, ty + 0.02 * H], [tx, ty]];
    arriving = { t: 0, fromX: path[0][0], fromY: path[0][1], toX: tx, toY: ty, toSign: true, path,
                 ms: 2700 };
  } else {
    arriving = { t: 0, fromX: layout.bounds.x2 + 130, fromY: pos.y,
                 toX: layout.start.x, toY: layout.start.y };
  }
  /* held just off the paper until the cloud has mostly parted, so the
     whole carve is on show rather than its last few metres */
  arriving.wait = wait;
  pos.x = arriving.fromX;
  pos.y = arriving.fromY;
  facing = -1;                       // he came off the hill, so he's heading back in
  dogFacing = -1;
  document.body.classList.add("arriving");
  hikerInner.style.transform = "scaleX(-1)";
  dogInner.style.transform = "scaleX(-1)";
  hiker.classList.remove("walking");   // he's gliding, not walking
  dog.classList.add("walking");        // Felix very much is not gliding
  dogPos.x = pos.x + 36 * layout.hik;
  dogPos.y = arriving.toY + 6;
  renderHiker();
  renderDog();
}

/* Home again: Felix shakes the snow off, the skis go up against the
   signpost, and if it was a new best the number on it gets stamped over. */
let arrivalNewBest = false;
const skiSignSkis = $("#skiSignSkis");
function afterArrival(toSign) {
  // the skis come off and go up against the post, right where he's standing
  if (toSign) {
    // he turns round to the post to lean them on it
    facing = 1; hikerInner.style.transform = "scaleX(1)";
    try { localStorage.setItem("fieldnotes-ski-planted", "1"); } catch (_) {}
    skiSignSkis.style.display = "";
    skiSignSkis.classList.remove("planting"); void skiSignSkis.getBoundingClientRect();
    skiSignSkis.classList.add("planting");
  }
  setTimeout(() => {
    dog.classList.remove("shaking"); void dog.getBoundingClientRect();
    dog.classList.add("shaking");
    setTimeout(() => dog.classList.remove("shaking"), 700);
  }, toSign ? 380 : 0);
  let linger = toSign ? 1100 : 0;
  if (arrivalNewBest) {
    arrivalNewBest = false;
    const sign = $("#skiSign");
    setTimeout(() => {
      sign.classList.remove("sp-stamp"); void sign.getBoundingClientRect();
      sign.classList.add("sp-stamp");
      setTimeout(() => sign.classList.remove("sp-stamp"), 3200);
    }, toSign ? 650 : 1000);
    if (toSign) linger = 1900;           // stay to see the number stamped
  }
  // then on to the middle of the paper, on foot, Felix on the leash again
  if (toSign) setTimeout(() => {
    if (!arriving && !runnerActive && !target && !keyVector()[0] && !keyVector()[1])
      target = { x: layout.start.x, y: layout.start.y };
  }, linger);
}
try { if (localStorage.getItem("fieldnotes-ski-planted") === "1") skiSignSkis.style.display = ""; } catch (_) {}

function endArrival() {
  if (!arriving) return;
  const toSign = !!arriving.toSign;
  setTimeout(() => afterArrival(toSign), 60);
  pos.x = arriving.toX;
  pos.y = arriving.toY;
  dropCrumb(pos.x, pos.y);       // give the leash a point to hang off
  arriving = null;
  document.body.classList.remove("arriving");
  hiker.classList.remove("walking");
  dog.classList.remove("walking");
  dogPos.x = pos.x - layout.leash * facing;
  dogPos.y = pos.y + 5;
  renderHiker();
  renderDog();
}

function updateArrival(dt) {
  const a = arriving;
  // any input at all takes the wheel — this can never be something to sit through
  const [kx, ky] = keyVector();
  if (kx || ky || target) { endArrival(); return; }
  if (a.wait > 0) { a.wait -= dt; return; }

  a.t += dt;
  const t = clamp(a.t / ((a.ms || ARRIVE_MS) / 1000), 0, 1);
  if (a.path) {
    /* along the carve: quick in, easing into the stop; he faces the way
       he's travelling, so he turns through the bottom of the arc, and
       Felix runs the same line a beat behind */
    const bez = (q, u) => { const v = 1 - u; return [
      v * v * v * q[0][0] + 3 * v * v * u * q[1][0] + 3 * v * u * u * q[2][0] + u * u * u * q[3][0],
      v * v * v * q[0][1] + 3 * v * v * u * q[1][1] + 3 * v * u * u * q[2][1] + u * u * u * q[3][1]]; };
    const e = 1 - Math.pow(1 - t, 1.9);
    const [nx, ny] = bez(a.path, e);
    const dx = nx - pos.x;
    if (Math.abs(dx) > 0.3) {
      facing = dx > 0 ? 1 : -1;
      hikerInner.style.transform = `scaleX(${facing})`;
    }
    pos.x = nx; pos.y = ny;
    const [fx, fy] = bez(a.path, Math.max(0, e - 0.09));
    if (Math.abs(fx - dogPos.x) > 0.3) {
      dogFacing = fx > dogPos.x ? 1 : -1;
      dogInner.style.transform = `scaleX(${dogFacing})`;
    }
    dogPos.x = fx; dogPos.y = fy + 6;
  } else {
    const e = 1 - Math.pow(1 - t, 2.6);          // comes in fast, settles gently
    pos.x = lerp(a.fromX, a.toX, e);
    pos.y = lerp(a.fromY, a.toY, e);
    /* He closes up as they slow: level with him at speed, tucked in beside him
       once they stop. */
    dogPos.x = pos.x + lerp(36, 26, e) * layout.hik;
    dogPos.y = pos.y + 6;
  }
  renderHiker();
  renderDog();
  if (t >= 1) endArrival();
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
/* which run we're coming back from — only the ski run skis back on */
let lastGame = null;

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
  updateSignpost();

  if (lastGame === "ski") {
    /* The ski run whitens out before it hands back, so the cover has to be
       already up in THIS frame — a transitioned fade-in would show the map
       through the seam. Put it up with the transition off, then let it fade
       away over the arrival. */
    arrivalNewBest = bestFor("ski") > bestBefore;
    if (cloudWipe.covered) {
      // the run closed into the cloud bank; the map opens out of it
      chaseFade.classList.remove("on");
      // the cloud parts first, THEN he skis in — not hidden behind it
      startArrival(1.5);
      cloudWipe.clear(2200);
    } else {
      chaseFade.classList.add("instant", "on");
      void chaseFade.offsetWidth;
      chaseFade.classList.remove("instant");
      startArrival();
      requestAnimationFrame(() => chaseFade.classList.remove("on"));
    }
  } else {
    chaseFade.classList.remove("on");
  }
  lastGame = null;
}

let bestBefore = 0;

function startGame(name) {
  lastGame = name;
  bestBefore = bestFor(name);
  runnerActive = true;
  loadGame(name).then((mod) => {
    mod.start({
      night: document.body.classList.contains("night"),
      onExit: backFromGame,
    });
    // hold the cover a moment so the trail is already drawn behind it
    setTimeout(() => chaseFade.classList.remove("on"), 260);
    // a beat inside the cloud, then it parts and the chair rides out of it
    if (name === "ski") setTimeout(() => cloudWipe.clear(2200), 450);
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
  /* The fifth visit opens that section's dialog, and the stamp used to
     thump away underneath it, unseen. Wait till it's closed. */
  const open = $("dialog[open]");
  if (open) { open.addEventListener("close", () => setTimeout(checkComplete, 300), { once: true }); return; }
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

  if (k === "t") { if (!busy() && !arriving) { e.preventDefault(); throwStick(); } return; }

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

/* a game, or the hand-over into or out of one, owns the screen */
function busy() { return !!(runnerActive || chase || boarding); }

function openSection(sec) {
  if (!ROUTES.includes(sec)) return;
  if (busy()) return;      // mid-handover the paper is covered, not gone
  if (arriving) endArrival();             // skiing in can be cut short; it'd fight the dialog
  if (location.hash === "#/" + sec) { route(); return; }
  location.hash = "#/" + sec;      // route() opens the dialog
}

function closeAllDialogs() {
  $$("dialog[open]").forEach((d) => d.close());
}

function route() {
  const sec = location.hash.replace(/^#\//, "");
  if (!ROUTES.includes(sec)) { closeAllDialogs(); return; }
  if (busy()) return;                     // Back/Forward mid-game: not over the top of it
  if (arriving) endArrival();

  keys.clear(); target = null;
  hiker.classList.remove("walking");
  const dlg = $("#dlg-" + sec);
  const scene = dlg.open ? null : sceneFor(sec);   // before the others close
  const sheetScene = dlg.open ? null : sheetSceneFor(sec);
  $$("dialog[open]").forEach((d) => { if (d.id !== "dlg-" + sec) d.close(); });
  if (!dlg.open) {
    if (scene) dlg.classList.add("fx", "arriving", "dusk");
    if (sheetScene) dlg.classList.add("fx");
    /* open first, build second: the mosaic measures the grid's real width,
       and a closed <dialog> is display:none — it measures 0 */
    dlg.showModal();
    if (GALLERIES.includes(sec)) {
      buildGallery(sec);
      if (scene) playIn(sec, scene);
      else { dlg.classList.add("shown"); revealGallery(sec); }
    } else if (sheetScene) playSheet(dlg, sheetScene);
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
  if (busy()) return;
  if (arriving) endArrival();
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

/* ---------- the pages around the photos ----------
   Every gallery is a page of the same notebook as the map, after dark: the
   landmark you walked into is drawn at the top in the map's own pen, a bar
   with its icon follows you down, and your trail leads on to the next page.
   Built once, from the map's landmark drawings themselves. */

const GAL_ART = {
  // viewBox for the big drawing, a tight one for the icon, and where the
  // "been here" stamp lands (x, y, tilt)
  peaks:      { vb: "-110 -96 240 156", icon: "-100 -64 182 116", stamp: [98, -62, -12] },
  journeys:   { vb: "-110 -96 240 156", icon: "-104 -58 214 116", stamp: [104, -66, 9] },
  portraits:  { vb: "-120 -84 240 156", icon: "-44 -46 92 116",   stamp: [80, -52, -10] },
  everything: { vb: "-120 -78 240 156", icon: "-50 -50 100 100",  stamp: null },
};
const GAL_NEXT = { peaks: "journeys", journeys: "portraits", portraits: "everything", everything: null };

/* The Whole Lot has no landmark; it gets the compass from the map's corner. */
const COMPASS_ART = `
  <circle class="ink thin" r="46"/>
  <circle class="ink hairline" r="37" stroke-dasharray="1 7"/>
  <path class="ink hairline" d="M0,-46 L8,0 L0,46 L-8,0 Z"/>
  <path class="ink hairline" d="M-46,0 L0,8 L46,0 L0,-8 Z"/>
  <path class="crimson-fill" d="M0,-33 L7,0 L-7,0 Z"/>`;

function galArt(sec) {
  return sec === "everything" ? COMPASS_ART : $(`#lm-${sec} .lm-art`).innerHTML;
}
/* a drawing in the map's pen, at any size: --k keeps the line weight */
function galDrawing(sec, cls, vb, filter, k) {
  return `<svg class="${cls} gal-pen" viewBox="${vb}" style="--k:${k}" aria-hidden="true">
    <g filter="url(#${filter})">${galArt(sec)}</g></svg>`;
}

const ARROW_D = "M32 10.6 C24 10.2 14 10 4 10.5 M10.5 3.5 C8.5 6 6.4 8.4 3.6 10.5 C6.2 12.6 8.4 14.8 10.8 17.4";
const TRAIL_D = "M210 0 C210 40 120 48 140 92 C160 136 300 110 260 160 C248 175 222 180 210 190";

const galUI = {};

function dressGallery(sec) {
  const dlg = $("#dlg-" + sec);
  const col = SITE.collections[sec];
  const art = GAL_ART[sec];
  const head = dlg.querySelector(".gal-open");
  const words = head.querySelector(".gal-words");
  const page = CONTENTS_META[sec].page;

  // the bar
  const iconK = (2 / 4.4) * (+art.icon.split(" ")[3] / 26);
  head.insertAdjacentHTML("beforebegin", `
    <div class="gal-bar">
      <button class="gal-back" type="button" aria-label="Back to the map">
        <svg viewBox="0 0 34 20" aria-hidden="true"><g filter="url(#roughen-sm)"><path class="mark" d="${ARROW_D}"/></g></svg>
        the map
      </button>
      <span class="gal-bar-title" aria-hidden="true">
        ${galDrawing(sec, "gal-icon", art.icon, "roughen", iconK.toFixed(2))}${col.title}
      </span>
      <span class="gal-bar-meta"><span class="m-page">p.${page}</span><span class="m-prog" aria-hidden="true"></span></span>
      <svg class="gal-rule" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true">
        <path class="mark" pathLength="1" d="M0 4 C120 3 210 5.5 330 4.2 S560 2.6 690 4.4 S900 5.2 1000 3.6"/>
      </svg>
    </div>`);

  // the opening: underline, count, the landmark drawn in, "start here"
  words.querySelector(".gal-title").insertAdjacentHTML("afterend", `
    <svg class="gal-uline draw" viewBox="0 0 360 22" aria-hidden="true">
      <path class="mark ink" pathLength="1" style="--d:500ms" d="M4 12 C80 19 200 15 356 9"/>
    </svg>`);
  words.insertAdjacentHTML("beforeend", `<p class="gal-meta"></p>`);
  const stamp = art.stamp ? `
    <g class="gal-stamp" transform="translate(${art.stamp[0]},${art.stamp[1]}) rotate(${art.stamp[2]})">
      <circle r="24"/><text y="-2">been</text><text y="11">here</text>
    </g>` : "";
  head.insertAdjacentHTML("beforeend",
    galDrawing(sec, "gal-art draw", art.vb, "roughen-lg", 0.75).replace("</svg>", stamp + "</svg>") + `
    <div class="gal-here" aria-hidden="true">
      <svg viewBox="0 0 40 44"><g filter="url(#roughen-sm)">
        <path class="mark" d="M6 4 C8 18 16 30 30 38"/><path class="mark" d="M21 38.5 L30.5 38.5 L28 29.5"/>
      </g></svg>
      <span>start here</span>
    </div>`);
  // dotted lines (the flight path) keep their dots and just appear
  head.querySelectorAll(".gal-art .ink:not([stroke-dasharray])").forEach((el, i) => {
    el.setAttribute("pathLength", "1");
    el.style.setProperty("--d", i * 140 + "ms");
  });

  // the end: your trail, on to the next page
  const next = GAL_NEXT[sec];
  const all = SITE.collections.everything.photos.length;
  const nextBlock = next ? `
    <button class="gal-next" type="button" data-next="${next}">
      ${galDrawing(next, "gal-next-art", GAL_ART[next].vb, "roughen", 1)}
      <span class="gal-next-kick">next page · p.${CONTENTS_META[next].page}</span>
      <span class="gal-next-name">${SITE.collections[next].title}</span>
      <svg class="gal-uline" viewBox="0 0 150 14" aria-hidden="true"><path class="mark" pathLength="1" d="M4 6 C40 12 110 9 146 5"/></svg>
      <span class="gal-next-blurb">${SITE.collections[next].blurb}</span>
    </button>` : `
    <button class="gal-next" type="button" data-map>
      <span class="gal-next-kick">that's the lot</span>
      <span class="gal-next-name">Back to the map</span>
      <svg class="gal-uline" viewBox="0 0 150 14" aria-hidden="true"><path class="mark" pathLength="1" d="M4 6 C40 12 110 9 146 5"/></svg>
    </button>`;
  const links = next ? `
    <nav class="gal-links" aria-label="Elsewhere">
      <button type="button" data-map>← back to the map</button>
      ${sec === "everything" || next === "everything" ? "" :
        `<button type="button" data-next="everything">the whole lot — all ${all} photographs →</button>`}
    </nav>` : "";
  dlg.insertAdjacentHTML("beforeend", `
    <footer class="gal-end">
      <svg class="gal-trail" viewBox="0 0 420 190" aria-hidden="true">
        <defs><mask id="trail-${sec}" maskUnits="userSpaceOnUse"><path pathLength="1" d="${TRAIL_D}"/></mask></defs>
        <path class="walked" mask="url(#trail-${sec})" d="${TRAIL_D}"/>
      </svg>
      ${nextBlock}${links}
    </footer>`);

  dlg.querySelector(".gal-back").addEventListener("click", () => dlg.close());
  dlg.querySelectorAll(".gal-end [data-map]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.querySelectorAll(".gal-end [data-next]").forEach((b) =>
    b.addEventListener("click", () => openSection(b.dataset.next)));
  dlg.insertAdjacentHTML("afterbegin", `<div class="gal-night" aria-hidden="true"></div>`);

  const ui = galUI[sec] = {
    dlg, head,
    bar:  dlg.querySelector(".gal-bar"),
    prog: dlg.querySelector(".m-prog"),
    meta: dlg.querySelector(".gal-meta"),
    grid: dlg.querySelector(".gal-grid"),
    end:  dlg.querySelector(".gal-end"),
    night: dlg.querySelector(".gal-night"),
  };
  dlg.addEventListener("scroll", () => galScrolled(ui, sec), { passive: true });
  wireScenes(sec);
}

/* ---------- the way in: each gallery's own little scene ----------
   Opening a gallery from the map plays a short scene drawn from that
   section's own subject, in the map's pen — then the page fades up around
   it. Closing plays it back the other way. Any click or key skips to the
   end; reduced motion, and deep links straight to a gallery, open plainly.
   The scenes themselves are further down (peaksScene and friends). */

/* the scene a gallery should play as it opens, or null to open plainly */
function sceneFor(sec) {
  if (!SCENES[sec] || REDUCED.matches) return null;
  if (!document.body.classList.contains("loaded")) return null;   // a deep link: no map yet
  if ($$(".gallery-dlg[open], .lightbox[open]").length) return null;
  return SCENES[sec];
}

/* any click or key during a scene finishes it */
function skippable(anims) {
  const skip = () => anims.forEach((a) => { try { a.finish(); } catch (_) {} });
  addEventListener("pointerdown", skip, true);
  addEventListener("keydown", skip, true);
  return () => {
    removeEventListener("pointerdown", skip, true);
    removeEventListener("keydown", skip, true);
  };
}

/* Start on a quiet frame. Opening a gallery builds its whole mosaic in the
   same frame its scene is made, and an animation's clock starts when it's
   created — so the first slice of motion played out during that work and the
   scene seemed to jump in. Hold everything on its first frame, then go two
   frames later, once the page has painted. (A skip in between finishes them,
   and a finished animation must not be restarted.) */
function runClean(anims) {
  anims.forEach((a) => a.pause());
  requestAnimationFrame(() => requestAnimationFrame(() =>
    anims.forEach((a) => { if (a.playState === "paused") a.play(); })));
}

function sceneStage(parent) {
  const stage = document.createElement("div");
  stage.className = "scene";
  stage.setAttribute("aria-hidden", "true");
  parent.appendChild(stage);
  return stage;
}

function playIn(sec, scene) {
  const ui = galUI[sec];
  const stage = sceneStage(ui.dlg);
  const anims = scene.in(stage, ui.night, sec);
  runClean(anims);
  const unskip = skippable(anims);
  ui.scene = { stage, anims, unskip };
  Promise.all(anims.map((a) => a.finished)).then(() => land(sec), () => {});
}

/* the scene's done: the page fades up, and the scene fades off it */
function land(sec) {
  const ui = galUI[sec], sc = ui.scene;
  if (!sc) return;
  ui.scene = null;
  sc.unskip();
  ui.dlg.classList.remove("arriving", "dusk");
  ui.dlg.classList.add("shown");
  revealGallery(sec);
  /* let go of the scene's animations only once it's faded: cancelled, every
     piece jumps back to where it was laid out (postcards unrotated, flicked
     pages back in the middle) — in plain view, for the length of the fade */
  const clear = () => { sc.anims.forEach((a) => a.cancel()); sc.stage.remove(); };
  sc.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: "ease-out" })
    .finished.then(clear, clear);
}

/* back to the map: the scene plays over it the other way, then lifts */
function playOut(sec) {
  const scene = SCENES[sec];
  const o = document.createElement("div");
  o.className = "gal-return";
  o.setAttribute("aria-hidden", "true");
  const night = document.createElement("div");
  night.className = "gal-night";
  o.appendChild(night);
  document.body.appendChild(o);
  const anims = scene.out(sceneStage(o), night, sec);
  runClean(anims);
  const unskip = skippable(anims);
  const done = () => { unskip(); o.remove(); };
  Promise.all(anims.map((a) => a.finished)).then(done, done);
}

function wireScenes(sec) {
  const ui = galUI[sec], dlg = ui.dlg;

  /* The way out has to start in the same frame the gallery closes, or the map
     flashes up first — so it starts from close() itself (and from Esc's
     cancel), not from the close event, which comes a moment later. */
  const leaving = () => {
    if (ui.leaving || !dlg.open || ui.scene || !SCENES[sec] || REDUCED.matches) return;
    const going = location.hash.replace(/^#\//, "");
    if (going && going !== sec) return;      // off to another gallery, not the map
    ui.leaving = true;
    playOut(sec);
  };
  const nativeClose = HTMLDialogElement.prototype.close;
  dlg.close = function (v) { leaving(); return nativeClose.call(this, v); };
  dlg.addEventListener("cancel", leaving);

  dlg.addEventListener("close", () => {
    ui.leaving = false;
    if (ui.scene) {                   // closed mid-scene
      ui.scene.unskip();
      ui.scene.anims.forEach((a) => a.cancel());
      ui.scene.stage.remove();
      ui.scene = null;
    }
    dlg.classList.remove("fx", "arriving", "dusk", "shown");
  });
}

/* --- shared: hand-inked lines without a live filter ---
   The map roughens its ink with an SVG filter; re-running that on shapes this
   size every frame is what makes phones stutter. So the wobble is baked into
   the path instead: every straight stroke gets a couple of small kinks. */
function inkLine(pts, rnd, wob = 1.4) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (const f of [0.33, 0.67]) {
      const o = (rnd() - 0.5) * 2 * wob;
      d += `L${(x0 + (x1 - x0) * f + nx * o).toFixed(1)},${(y0 + (y1 - y0) * f + ny * o).toFixed(1)}`;
    }
    d += `L${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/* the transform that puts an element laid out at F over the screen box S,
   scaling about its centre */
function overRect(F, S) {
  const dx = S.left + S.width / 2 - (F.left + F.width / 2);
  const dy = S.top + S.height / 2 - (F.top + F.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${S.width / F.width})`;
}
/* where something on the map is on screen, or null if it isn't showing */
function onMap(sel) {
  const el = $(sel), r = el && el.getBoundingClientRect();
  return r && r.width > 2 ? r : null;
}
const rndIn = (a, b) => a + Math.random() * (b - a);
const fadeNight = (night, from, to, delay, duration) =>
  night.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: "ease-in-out", fill: "both" });

/* ---------- Peaks & Wilds: walking into the range ----------
   Three ranges, drawn as the landmark is — overlapping peaks, each one's
   paper hiding the lines of the one behind, pen shading down the shadow
   side, snow on the tall ones, pines at their feet — rise from the bottom
   of the screen one behind another, the far range last, climbing over the
   others, while night and a moon come up behind them. Going home, they sink. */

function snowline(p, rnd) {
  const at = (d, xb) => p.ax + (xb - p.ax) * d;
  const y1 = p.ay + p.h * 0.3, y2 = p.ay + p.h * 0.2;
  const xl = at(0.3, p.x0), xr = at(0.3, p.x1), st = (xr - xl) / 4;
  return inkLine([[xl, y1], [xl + st, y2], [xl + 2 * st, y1], [xl + 3 * st, y2], [xr, y1]], rnd, 0.5);
}

/* short strokes down the right-hand (shadow) face, parallel to the left one */
function hatching(p, base, rnd) {
  const lx = p.x0 - p.ax, ly = base - p.ay, ll = Math.hypot(lx, ly);
  const dx = lx / ll, dy = ly / ll;
  const n = Math.min(7, 3 + Math.floor(p.h / 70));
  let d = "";
  for (let k = 0; k < n; k++) {
    const t = 0.32 + 0.6 * (k + rnd() * 0.5) / n;
    const px = p.ax + (p.x1 - p.ax) * t + dx * 4, py = p.ay + (base - p.ay) * t + dy * 4;
    const len = Math.min(p.h * rndIn(0.1, 0.2), (base - 4 - py) / dy);
    if (len < 6) continue;
    d += `M${px.toFixed(1)},${py.toFixed(1)} L${(px + dx * len).toFixed(1)},${(py + dy * len).toFixed(1)} `;
  }
  return d;
}

function pine(x, y, s) {
  return `M${x - 8 * s},${y} L${x},${y - 22 * s} L${x + 8 * s},${y} M${x - 5 * s},${y - 9 * s} L${x},${y - 20 * s} L${x + 5 * s},${y - 9 * s} M${x},${y} L${x},${y + 6 * s} `;
}

function ridges(W, H) {
  const rnd = Math.random;
  const layers = [
    // far → near: where the feet of the peaks sit, how tall they are, the pen
    { base: 0.47, tall: [0.22, 0.38], stroke: 2.3, snow: 0.24 },
    { base: 0.7,  tall: [0.16, 0.28], stroke: 2.8, snow: 0.25, trees: 0.4 },
    { base: 0.9,  tall: [0.13, 0.22], stroke: 3.3, trees: 1 },
  ];
  return layers.map((L) => {
    const base = L.base * H, bottom = H * 1.4;
    const peaks = [];
    let x = -rnd() * 120;
    while (x < W + 60) {
      const h = Math.max(60, (L.tall[0] + (L.tall[1] - L.tall[0]) * rnd()) * H);
      const w = h * (1.1 + rnd() * 0.45);
      peaks.push({ x0: x - w / 2, ax: x + (rnd() - 0.5) * w * 0.14, ay: base - h, x1: x + w / 2, h });
      x += w * (0.6 + rnd() * 0.35);         // overlap the next one, as the landmark does
    }
    // who stands in front: mostly the tall ones, with a little shuffle
    peaks.sort((a, b) => a.h + rnd() * H * 0.12 - (b.h + rnd() * H * 0.12));

    let ink = "";
    for (const p of peaks) {
      ink += `<path class="ridge" style="stroke-width:${L.stroke}" d="${inkLine([[p.x0, base], [p.ax, p.ay], [p.x1, base]], rnd)}"/>`;
      let marks = hatching(p, base, rnd);
      if (L.snow && p.h > L.snow * H) marks += snowline(p, rnd);
      ink += `<path class="ridge-mark" style="stroke-width:${L.stroke * 0.7}" d="${marks}"/>`;
    }
    // pines in little stands at the feet of the range
    if (L.trees) {
      let trees = "";
      for (let tx = rnd() * 140; tx < W + 20; tx += rndIn(110, 260)) {
        if (rnd() > L.trees) continue;
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) trees += pine(tx + j * rndIn(13, 19), base + 4 + rnd() * 3, rndIn(0.8, 1.35) * (L.trees < 1 ? 0.7 : 1));
      }
      ink += `<path class="ridge ridge-trees" style="stroke-width:${L.stroke * 0.7}" d="${trees}"/>`;
    }

    const svg = `<svg width="${W}" height="${bottom}" viewBox="0 0 ${W} ${bottom}">
      <rect class="ridge-ground" x="-200" y="${base - 1}" width="${W + 400}" height="${bottom - base + 1}"/>
      ${ink}</svg>`;
    const top = Math.min(...peaks.map((p) => p.ay));
    return { svg, below: H - top + 40 };     // far enough down to start fully off screen
  });
}

/* the sky behind: a crescent moon, a few stars, three birds heading home */
function nightSky(W, H) {
  const rnd = Math.random;
  const r = clamp(Math.min(W, H) * 0.045, 18, 34), mx = W * 0.8, my = H * 0.13;
  let stars = "";
  for (let i = 0; i < 16; i++) {
    stars += `<circle class="sky-star" cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H * 0.32).toFixed(0)}" r="${rndIn(0.8, 1.8).toFixed(1)}"/>`;
  }
  let birds = "";
  for (let i = 0; i < 3; i++) {
    const bx = W * 0.2 + i * rndIn(26, 40), by = H * 0.07 + rndIn(-10, 10), s = rndIn(0.9, 1.3);
    birds += `M${bx - 9 * s},${by - 4 * s} Q${bx - 4 * s},${by - 7 * s} ${bx},${by} Q${bx + 4 * s},${by - 7 * s} ${bx + 9 * s},${by - 4 * s} `;
  }
  return `<svg class="sky" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${stars}
    <path class="ridge-mark" style="stroke-width:2.4" d="M${mx},${my - r} A${r},${r} 0 0 0 ${mx},${my + r} A${r * 1.25},${r * 1.25} 0 0 1 ${mx},${my - r} Z"/>
    <path class="ridge-mark" style="stroke-width:2" d="${birds}"/></svg>`;
}

/* The ski game's ranges (alps.js), drawn still for this doorway. A full
   range is a lot of path to generate in the frame you click, so the next one
   is built ahead whenever the page is idle — a new range every visit. Until
   alps.js has arrived, the plain pen ranges above stand in. */
const whenIdle = (fn) =>
  (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300));
let alpsStill = null;

function buildAlpsStill() {
  if (!window.Alps || !Alps.still) return null;
  const W = innerWidth, H = innerHeight, tall = Math.round(H * 1.4);
  const layers = Alps.still(W, H, (Math.random() * 2147483647) | 0).map((l) => ({
    svg: `<svg class="sk-alp-${l.name}" width="${W}" height="${tall}" viewBox="0 0 ${W} ${tall}">${l.svg}</svg>`,
    below: H - l.top + 40,
  }));
  return { W, H, layers };
}
function stillRanges(W, H) {
  const r = alpsStill && alpsStill.W === W && alpsStill.H === H ? alpsStill : buildAlpsStill();
  alpsStill = null;
  whenIdle(() => { alpsStill = buildAlpsStill(); });
  return r ? r.layers : ridges(W, H);
}
function loadAlps() {
  if (window.Alps || document.querySelector("script[data-alps]")) return;
  const sc = document.createElement("script");
  sc.src = "alps.js";
  sc.async = true;
  sc.dataset.alps = "1";          // ski.js looks for this and won't fetch it twice
  sc.onload = () => whenIdle(() => { alpsStill = buildAlpsStill(); });
  document.head.appendChild(sc);
}

const peaksScene = {
  in(stage, night) {
    const W = innerWidth, H = innerHeight;
    const rs = stillRanges(W, H);
    stage.innerHTML = nightSky(W, H) + rs.map((r) => r.svg).join("");
    const [sky, ...els] = stage.children;
    const anims = els.map((el, i) => el.animate(
      [{ transform: `translateY(${rs[i].below}px)` }, { transform: "none" }],
      // near ridge first; the far one starts last and climbs over the others
      { duration: 700, delay: (2 - i) * 95, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
    anims.push(fadeNight(night, 0, 1, 400, 320));
    anims.push(sky.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
      { duration: 420, delay: 380, easing: "ease-out", fill: "both" }));
    return anims;
  },
  out(stage, night) {
    const W = innerWidth, H = innerHeight;
    const rs = stillRanges(W, H);
    stage.innerHTML = nightSky(W, H) + rs.map((r) => r.svg).join("");
    const [sky, ...els] = stage.children;
    const anims = els.map((el, i) => el.animate(
      [{ transform: "none" }, { transform: `translateY(${rs[i].below}px)` }],
      // near ridge drops first; the far one last, uncovering the map
      { duration: 440, delay: 90 + (2 - i) * 70, easing: "cubic-bezier(0.5, 0, 0.75, 0.4)", fill: "both" }));
    anims.push(fadeNight(night, 1, 0, 60, 260));
    anims.push(sky.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "both" }));
    return anims;
  },
};

/* ---------- Journeys: the plane, and the postcards ----------
   The landmark's plane takes off across the screen, laying its dotted flight
   path behind it, while postcards of the first photos in the gallery are
   tossed down onto the table. Going home, they're swept away. */

/* the landmark's own plane, solid this time: wings and tail first, so the
   fuselage lies on top of them */
function planeSvg() {
  const g = $("#lm-journeys .lm-art g[transform]");
  const parts = g ? [...g.children].map((c) => c.outerHTML) : [];
  if (parts.length) parts.push(parts.shift());
  return `<svg class="plane-fly gal-pen" viewBox="-40 -40 80 80" style="--k:0.5"><g>${parts.join("")}</g></svg>`;
}

function postcards(stage, sec, n) {
  const W = innerWidth, H = innerHeight;
  const list = (shownOrder[sec] || []).slice(0, n);
  const cw = clamp(Math.min(W, H * 1.2) * 0.3, 140, 300);
  return list.map((ph, i) => {
    const el = document.createElement("div");
    el.className = "postcard-fly";
    const img = new Image();
    img.src = ph.thumb || ph.src;
    img.alt = "";
    img.decoding = "async";
    const ar = ph.ar || 1.5;
    img.style.aspectRatio = String(ar);
    el.style.width = (ar < 1 ? cw * 0.7 : cw) + "px";
    el.appendChild(img);
    // scattered round the middle of the table, each at its own angle
    const a = (i / list.length) * Math.PI * 2 + rndIn(-0.4, 0.4);
    const rr = Math.min(W, H) * rndIn(0.12, 0.3);
    el.style.left = W / 2 + Math.cos(a) * rr * 1.6 + "px";
    el.style.top = H / 2 + Math.sin(a) * rr + "px";
    stage.appendChild(el);
    return { el, rot: rndIn(-14, 14) };
  });
}

const flightPath = (W, H, back) => back
  ? `M${W + 220},${H * 0.3} C${W * 0.66},${H * 0.12} ${W * 0.34},${H * 0.6} -220,${H * 0.46}`
  : `M-220,${H * 0.74} C${W * 0.3},${H * 0.8} ${W * 0.62},${H * 0.2} ${W + 220},${H * 0.24}`;

const journeysScene = {
  in(stage, night, sec) {
    const W = innerWidth, H = innerHeight, d = flightPath(W, H);
    const cards = postcards(stage, sec, 5);
    stage.insertAdjacentHTML("beforeend", `
      <svg class="trail-fly" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs><mask id="flightMask" maskUnits="userSpaceOnUse"><path class="trail-mask" pathLength="1" d="${d}"/></mask></defs>
        <path class="trail-dots" mask="url(#flightMask)" d="${d}"/>
      </svg>${planeSvg()}`);
    const plane = stage.querySelector(".plane-fly");
    plane.style.offsetPath = `path("${d}")`;
    // the plane crosses at an even pace, so you can actually watch it go
    const fly = { duration: 1150, easing: "cubic-bezier(0.35, 0, 0.65, 1)", fill: "both" };
    const anims = cards.map((c, i) => c.el.animate(
      [{ transform: `translate(${rndIn(-0.3, 0.3) * W}px, ${H * rndIn(0.75, 1)}px) rotate(${c.rot + rndIn(-50, 50)}deg)` },
       { transform: `rotate(${c.rot}deg)` }],
      { duration: 540, delay: 240 + i * 85, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
    anims.push(plane.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], fly));
    anims.push(stage.querySelector(".trail-mask").animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], fly));
    anims.push(fadeNight(night, 0, 1, 0, 380));
    return anims;
  },
  out(stage, night, sec) {
    const W = innerWidth, H = innerHeight, d = flightPath(W, H, true);
    const cards = postcards(stage, sec, 5);
    stage.insertAdjacentHTML("beforeend", planeSvg());
    const plane = stage.querySelector(".plane-fly");
    plane.style.offsetPath = `path("${d}")`;
    const anims = cards.map((c, i) => c.el.animate(
      [{ transform: `rotate(${c.rot}deg)` },
       { transform: `translate(${rndIn(-0.4, 0.4) * W}px, ${H * 1.1}px) rotate(${c.rot + rndIn(-40, 40)}deg)` }],
      { duration: 400, delay: i * 40, easing: "cubic-bezier(0.55, 0, 0.8, 0.4)", fill: "both" }));
    anims.push(plane.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
      { duration: 700, easing: "cubic-bezier(0.35, 0, 0.65, 1)", fill: "both" }));
    anims.push(fadeNight(night, 1, 0, 200, 300));
    return anims;
  },
};

/* ---------- Good Company: taking the picture ----------
   You're pulled into the landmark camera's viewfinder: its corners open out
   to the edges of the screen, the focus ring hunts and locks, the exposure
   reads out along the bottom — and the shutter fires. The gallery is the
   picture. Going home, the flash fires first and the frame closes back down
   onto the camera. */

const VF_CORNERS = [
  // the L of each corner, and where its vertex sits in a 70px box
  { d: "M4,64 L4,4 L64,4",   v: [4, 4],   at: (W, H, m) => [m, m] },
  { d: "M6,4 L66,4 L66,64",  v: [66, 4],  at: (W, H, m) => [W - m - 70, m] },
  { d: "M4,6 L4,66 L64,66",  v: [4, 66],  at: (W, H, m) => [m, H - m - 70] },
  { d: "M6,66 L66,66 L66,6", v: [66, 66], at: (W, H, m) => [W - m - 70, H - m - 70] },
];

function viewfinder(stage, sec) {
  const W = innerWidth, H = innerHeight, m = clamp(W * 0.04, 16, 44);
  const ph = (shownOrder[sec] || [])[0];
  const cam = onMap("#lm-portraits .lm-art") ||
    { left: W / 2 - 40, top: H / 2 - 40, right: W / 2 + 40, bottom: H / 2 + 40 };
  const camAt = [[cam.left, cam.top], [cam.right, cam.top], [cam.left, cam.bottom], [cam.right, cam.bottom]];
  stage.innerHTML = VF_CORNERS.map((c) => {
    const [x, y] = c.at(W, H, m);
    return `<svg class="vf-corner" viewBox="0 0 70 70" style="left:${x}px;top:${y}px;transform-origin:${c.v[0]}px ${c.v[1]}px">
      <path d="${c.d}"/></svg>`;
  }).join("") + (ph ? `<img class="vf-subject" alt="" src="${ph.thumb || ph.src}" style="aspect-ratio:${ph.ar || 1.5}">` : "") + `
    <svg class="vf-focus" viewBox="-60 -60 120 120">
      <circle r="34"/><path d="M-50,0 L-40,0 M40,0 L50,0 M0,-50 L0,-40 M0,40 L0,50"/>
      <circle class="vf-lock" cx="44" cy="-44" r="4.5"/>
    </svg>
    <p class="vf-read">1/250 &nbsp;·&nbsp; f/2.8 &nbsp;·&nbsp; ISO 200</p>
    <div class="vf-flash"></div>`;
  const corners = [...stage.querySelectorAll(".vf-corner")];
  // from each corner's place round the camera on the map, to the screen's corner
  const shut = corners.map((el, i) => {
    const [x, y] = VF_CORNERS[i].at(W, H, m), [vx, vy] = VF_CORNERS[i].v;
    return `translate(${camAt[i][0] - (x + vx)}px, ${camAt[i][1] - (y + vy)}px) scale(0.35)`;
  });
  // the subject sits behind everything else in the frame
  const subject = stage.querySelector(".vf-subject");
  if (subject) stage.prepend(subject);
  return { corners, shut, subject, focus: stage.querySelector(".vf-focus"), lock: stage.querySelector(".vf-lock"),
    read: stage.querySelector(".vf-read"), flash: stage.querySelector(".vf-flash") };
}

const portraitsScene = {
  in(stage, night, sec) {
    const v = viewfinder(stage, sec);
    const anims = v.corners.map((el, i) => el.animate([{ transform: v.shut[i] }, { transform: "none" }],
      { duration: 620, easing: "cubic-bezier(0.25, 1, 0.4, 1)", fill: "both" }));
    anims.push(fadeNight(night, 0, 1, 100, 360));
    anims.push(v.focus.animate(
      [{ opacity: 0, transform: "scale(1.6)" }, { opacity: 1, transform: "scale(0.88)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }],
      { duration: 380, delay: 260, easing: "ease-out", fill: "both" }));
    anims.push(v.lock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, delay: 600, fill: "both" }));
    // the focus pull: soft, hunting, then sharp just as the lock lights
    if (v.subject) anims.push(v.subject.animate(
      [{ opacity: 0, filter: "blur(16px)", transform: "scale(1.06)" },
       { opacity: 0.95, filter: "blur(9px)", transform: "scale(1.03)", offset: 0.4 },
       { opacity: 1, filter: "blur(2px)", transform: "scale(0.995)", offset: 0.75 },
       { opacity: 1, filter: "blur(0px)", transform: "none" }],
      { duration: 520, delay: 120, easing: "ease-out", fill: "both" }));
    anims.push(v.read.animate([{ opacity: 0 }, { opacity: 0.8 }], { duration: 240, delay: 320, fill: "both" }));
    // the shutter: the flash peaks as the scene ends, and fades with it
    anims.push(v.flash.animate([{ opacity: 0 }, { opacity: 0.85 }],
      { duration: 110, delay: 700, easing: "ease-in", fill: "both" }));
    return anims;
  },
  out(stage, night, sec) {
    const v = viewfinder(stage, sec);
    const anims = [v.flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: "ease-out", fill: "both" })];
    anims.push(...v.corners.map((el, i) => el.animate([{ transform: "none" }, { transform: v.shut[i] }],
      { duration: 460, delay: 120, easing: "cubic-bezier(0.55, 0, 0.8, 0.4)", fill: "both" })));
    for (const el of [v.focus, v.read, v.subject].filter(Boolean)) {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay: 60, fill: "both" }));
    }
    anims.push(fadeNight(night, 1, 0, 180, 320));
    return anims;
  },
};

/* ---------- The Whole Lot: flicking through the notebook ----------
   Pages of the notebook riffle past — the mountains, the plane, the camera —
   and the last one stays: the compass, its needle spinning round to settle. */

function notebookPage(stage, sec, page) {
  const el = document.createElement("div");
  el.className = "page-fly";
  if (sec === "everything") {
    el.innerHTML = `<svg class="gal-pen" viewBox="-60 -60 120 120" style="--k:1"><g filter="url(#roughen)">
      <circle class="ink thin" r="46"/><circle class="ink hairline" r="37" stroke-dasharray="1 7"/>
      <path class="ink hairline" d="M0,-46 L8,0 L0,46 L-8,0 Z"/><path class="ink hairline" d="M-46,0 L0,8 L46,0 L0,-8 Z"/></g>
      <g class="needle-fly"><path class="crimson-fill" d="M0,-33 L7,0 L-7,0 Z"/><path class="ink hairline" d="M0,33 L7,0 L-7,0 Z"/></g></svg>`;
  } else {
    el.innerHTML = `<svg class="gal-pen" viewBox="${GAL_ART[sec].vb}" style="--k:0.8"><g filter="url(#roughen)">${galArt(sec)}</g></svg>`;
  }
  el.insertAdjacentHTML("beforeend", `<span class="page-no">p.${page}</span>`);
  stage.appendChild(el);
  return el;
}

const everythingScene = {
  in(stage, night) {
    const H = innerHeight;
    const flick = ["peaks", "journeys", "portraits"].map((s) => notebookPage(stage, s, CONTENTS_META[s].page));
    const last = notebookPage(stage, "everything", CONTENTS_META.everything.page);
    const anims = flick.map((el, i) => el.animate(
      [{ transform: `translateY(${H}px) rotate(${7 - i * 3}deg)` }, { transform: `translateY(${-H}px) rotate(${-6 + i * 2}deg)` }],
      { duration: 460, delay: i * 115, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "both" }));
    anims.push(last.animate([{ transform: `translateY(${H}px) rotate(5deg)` }, { transform: "rotate(-1.5deg)" }],
      { duration: 460, delay: 330, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
    anims.push(last.querySelector(".needle-fly").animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(790deg)", offset: 0.75 }, { transform: "rotate(720deg)" }],
      { duration: 620, delay: 420, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "both" }));
    anims.push(fadeNight(night, 0, 1, 40, 340));
    return anims;
  },
  out(stage, night) {
    const H = innerHeight;
    const last = notebookPage(stage, "everything", CONTENTS_META.everything.page);
    return [
      last.animate([{ transform: "rotate(-1.5deg)" }, { transform: `translateY(${H}px) rotate(6deg)` }],
        { duration: 420, delay: 60, easing: "cubic-bezier(0.55, 0, 0.8, 0.4)", fill: "both" }),
      last.querySelector(".needle-fly").animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-360deg)" }],
        { duration: 480, easing: "ease-in", fill: "both" }),
      fadeNight(night, 1, 0, 160, 300),
    ];
  },
};

/* which galleries have a scene */
const SCENES = { peaks: peaksScene, journeys: journeysScene, portraits: portraitsScene, everything: everythingScene };

/* ---------- the two paper pages: a little flourish as they open ----------
   About me and Say hello are sheets laid over the map, so their scenes are
   short and play around the sheet as it arrives. They just close. */

/* About me: sparks fly off the campfire, smoke billows up behind, and the
   page rises out of the fire, opening out as it comes */
function aboutScene(back, front, sheet) {
  const W = innerWidth, H = innerHeight;
  const fire = onMap("#lm-about .ember") || { left: W / 2, top: H * 0.7, width: 10, height: 10 };
  const fx = fire.left + fire.width / 2, fy = fire.top;

  // soft puffs, not pen lines: drawn as lines they read as a stray scribble
  // across the page. They rise and spread behind the page as it comes up.
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const p = document.createElement("div");
    p.className = "puff-fly";
    const size = rndIn(70, 140);
    p.style.cssText = `left:${fx - size / 2}px;top:${fy - size / 2}px;width:${size}px;height:${size}px`;
    back.appendChild(p);
    puffs.push(p);
  }
  let sparks = "";
  for (let i = 0; i < 7; i++) sparks += `<circle class="spark-fly" cx="${fx + rndIn(-8, 8)}" cy="${fy}" r="${rndIn(1.6, 2.8)}"/>`;
  front.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sparks}</svg>`;

  const anims = puffs.map((p, i) => p.animate(
    [{ transform: "translate(0, 0) scale(0.3)", opacity: 0 },
     { opacity: 0.75, offset: 0.25 },
     { transform: `translate(${rndIn(-70, 70)}px, ${-H * rndIn(0.25, 0.45)}px) scale(${rndIn(1.4, 2.1)})`, opacity: 0 }],
    { duration: rndIn(800, 1000), delay: i * 45, easing: "cubic-bezier(0.2, 0.6, 0.35, 1)", fill: "both" }));
  anims.push(...[...front.querySelectorAll(".spark-fly")].map((c) => c.animate(
    [{ transform: "none", opacity: 1 }, { transform: `translate(${rndIn(-40, 40)}px, ${-rndIn(90, 220)}px)`, opacity: 0 }],
    { duration: rndIn(550, 850), delay: rndIn(0, 220), easing: "cubic-bezier(0.2, 0.6, 0.4, 1)", fill: "both" })));
  const F = sheet.getBoundingClientRect();
  const ember = { left: fx - 24, top: fy - 16, width: 48, height: 32 };
  anims.push(sheet.animate(
    [{ transform: `${overRect(F, ember)} rotate(6deg)`, opacity: 0 },
     { opacity: 1, offset: 0.2 },
     { transform: "translateY(-6px) rotate(-1deg)", offset: 0.8 },
     { transform: "none", opacity: 1 }],
    { duration: 720, delay: 80, easing: "cubic-bezier(0.33, 0.9, 0.3, 1)", fill: "backwards" }));
  return anims;
}

/* Say hello: the envelope off the signpost flies in, its flap folds open, the
   postcard is drawn up out of it, and the envelope drops away. It comes in
   two halves so the card can come out from between them: the back (and the
   flap, once it's folded open) behind the card, the front pocket (and the
   flap while it's shut) in front of it. */
function contactScene(back, front, sheet) {
  const box = `class="env-fly" viewBox="0 -110 260 290"`;
  back.innerHTML = `<svg ${box}>
      <path class="env-inside" d="M6,6 L254,6 L254,174 L6,174 Z"/>
      <path class="env-open" d="M6,6 L130,-92 L254,6 Z"/></svg>`;
  front.innerHTML = `<svg ${box}>
      <path class="env-pocket" d="M6,6 L130,96 L254,6 L254,174 L6,174 Z"/>
      <path class="env-fold" d="M6,174 L104,96 M254,174 L156,96"/>
      <g class="env-flap"><path d="M6,6 L130,104 L254,6 Z"/><circle class="env-seal" cx="130" cy="88" r="13"/></g></svg>`;
  const envs = [back.firstElementChild, front.firstElementChild];
  const B = back.querySelector(".env-inside").getBoundingClientRect();
  const from = onMap("#lm-contact .lm-art g");
  const fly = from ? `${overRect(B, from)} rotate(-12deg)` : "translateY(30vh) scale(0.4)";

  const anims = envs.map((e) => e.animate(
    [{ transform: fly, opacity: from ? 1 : 0 }, { transform: "none", opacity: 1 }],
    { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
  // the flap folds: shut half shrinks to its hinge, open half grows up from it
  anims.push(front.querySelector(".env-flap").animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }],
    { duration: 110, delay: 400, easing: "ease-in", fill: "both" }));
  anims.push(back.querySelector(".env-open").animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
    { duration: 130, delay: 510, easing: "ease-out", fill: "both" }));

  // the card: tucked inside, drawn up out of the opening, then out to full size
  const F = sheet.getBoundingClientRect();
  const s0 = Math.min((B.width * 0.82) / F.width, (B.height * 0.86) / F.height);
  const dx = B.left + B.width / 2 - (F.left + F.width / 2);
  const inY = B.top + B.height / 2 - (F.top + F.height / 2);
  const outY = B.top - F.height * s0 * 0.22 - (F.top + F.height / 2);
  // once it's clear of the pocket it comes to the front, so the envelope
  // falls away behind it rather than across the form
  anims.push(sheet.animate(
    [{ transform: `translate(${dx}px, ${inY}px) scale(${s0})`, opacity: 0, zIndex: 0 },
     { opacity: 1, offset: 0.01 },
     { transform: `translate(${dx}px, ${outY}px) scale(${s0 * 1.04})`, zIndex: 0, offset: 0.42 },
     { zIndex: 2, offset: 0.43 },
     { transform: "none", opacity: 1, zIndex: 2 }],
    { duration: 560, delay: 580, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "backwards" }));
  // and the envelope, empty, drops away as the card opens out
  anims.push(...envs.map((e) => e.animate(
    [{ translate: "-50% -50%", opacity: 1 }, { translate: "-50% calc(-50% + 30vh)", opacity: 0 }],
    { duration: 320, delay: 830, easing: "cubic-bezier(0.55, 0, 0.8, 0.4)", fill: "forwards" })));
  return anims;
}

const SHEET_SCENES = { about: aboutScene, contact: contactScene };

function sheetSceneFor(sec) {
  if (!SHEET_SCENES[sec] || REDUCED.matches) return null;
  if (!document.body.classList.contains("loaded")) return null;
  if ($$(".gallery-dlg[open], .lightbox[open]").length) return null;
  return SHEET_SCENES[sec];
}

function playSheet(dlg, scene) {
  const mk = () => {
    const st = document.createElement("div");
    st.className = "scene";
    st.setAttribute("aria-hidden", "true");
    return st;
  };
  const back = mk(), front = mk();
  dlg.prepend(back);              // behind the sheet
  dlg.append(front);              // in front of it
  const anims = scene(back, front, dlg.querySelector(".sheet"));
  /* the map dims in step with the page arriving, not all at once before it
     (not every browser can animate a backdrop; those just dim) */
  try {
    anims.push(dlg.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 360, easing: "ease-out", pseudoElement: "::backdrop" }));
  } catch (_) {}
  runClean(anims);
  const unskip = skippable(anims);
  const done = () => { unskip(); back.remove(); front.remove(); };
  dlg._scene = { anims, done };
  Promise.all(anims.map((a) => a.finished)).then(done, done);
}

for (const sec of Object.keys(SHEET_SCENES)) {
  const dlg = $("#dlg-" + sec);
  dlg.addEventListener("close", () => {
    if (dlg._scene) { dlg._scene.anims.forEach((a) => a.cancel()); dlg._scene.done(); dlg._scene = null; }
    dlg.classList.remove("fx");
  });
}

/* the bar firms up once the opening has scrolled away; the count says how far
   down the page you are; the trail draws itself when you reach the end */
function galScrolled(ui, sec) {
  const top = ui.dlg.scrollTop, h = ui.dlg.clientHeight;
  ui.bar.classList.toggle("solid", top > ui.head.offsetTop + ui.head.offsetHeight - ui.bar.offsetHeight - 40);
  const tiles = tileOrder[sec] || [];
  const line = top + h * 0.6 - ui.grid.offsetTop;
  let seen = 0;
  for (const t of tiles) if (t._top < line) seen++;
  const txt = `${clamp(seen, 1, tiles.length)} / ${tiles.length}`;
  if (ui.prog.textContent !== txt) ui.prog.textContent = txt;
  if (top + h > ui.end.offsetTop + 120) ui.end.classList.add("seen");
}

/* paper grain, made once — the map's #grain filter, as a tile the galleries
   and the viewer can repeat for free */
{
  const c = document.createElement("canvas");
  c.width = c.height = 220;
  const x = c.getContext("2d"), d = x.createImageData(220, 220);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() * 14;
  }
  x.putImageData(d, 0, 0);
  document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`);
}

GALLERIES.forEach(dressGallery);

/* ---------- the mosaic ----------
   The old site handed layout to Isotope: every tile, in order, dropped into
   whichever column was currently shortest — flush under that column's last
   photo. Same rule here, minus the library: THUMB_SIZES gives every aspect
   ratio up front, so it all happens synchronously, before a single image
   has loaded.

   On top of that, a gallery's featured photos take two columns. A feature
   waits until two neighbouring columns are nearly level, and the small step
   left over is taken up by the shorter column's last photo (cropped a touch
   taller) — so every gutter stays 24px. The bottom is squared off the same
   way, after trying a few orders of the last photos to keep that crop tiny. */

const GAL_GAP = 24;              // Bootstrap's gutter, as on the old site
const tileOrder = {};            // tiles per section, in placement order

/* Three columns at most — Chris prefers the bigger photos — then the old
   site's narrower breakpoints (2 under 768px, 1 under 576px). */
function galColumns(w) {
  return w >= 768 ? 3 : w >= 576 ? 2 : 1;
}

/* dry: measure only. Returns how ragged the bottom was before squaring. */
function packTiles(tiles, w, n, dry) {
  const cw = (w - (n - 1) * GAL_GAP) / n;
  const H = new Array(n).fill(0), last = new Array(n).fill(null);
  const put = (t, c, y, tw, th) => { t._left = c * (cw + GAL_GAP); t._top = y; t._w = tw; t._h = th; };

  const normal = (t) => {
    let c = 0;
    for (let k = 1; k < n; k++) if (H[k] < H[c]) c = k;
    const th = cw / t._ar;
    put(t, c, H[c], cw, th);
    last[c] = t;
    H[c] += th + GAL_GAP;
  };
  const feature = (t, force) => {
    let best = null;
    for (let c = 0; c + 2 <= n; c++) {
      const top = Math.max(H[c], H[c + 1]), diff = Math.abs(H[c] - H[c + 1]);
      const score = top + diff * 2;
      if (!best || score < best.score) best = { c, top, diff, score };
    }
    if (best.diff > 70 && !force) return false;
    for (let k = best.c; k < best.c + 2; k++) {
      if (best.top > H[k] && last[k]) last[k]._h += best.top - H[k];
    }
    const tw = 2 * cw + GAL_GAP, th = tw / t._ar;
    put(t, best.c, best.top, tw, th);
    for (let k = best.c; k < best.c + 2; k++) { H[k] = best.top + th + GAL_GAP; last[k] = null; }
    return true;
  };

  const waiting = [];
  for (const t of tiles) {
    if (t._big && n > 1) { if (!feature(t)) waiting.push(t); continue; }
    normal(t);
    if (waiting.length && feature(waiting[0])) waiting.shift();
  }
  waiting.forEach((t) => feature(t, true));

  const end = Math.max(...H), ragged = end - Math.min(...H);
  if (dry) return ragged;
  for (let k = 0; k < n; k++) if (end > H[k] && last[k]) last[k]._h += end - H[k];
  for (const t of tiles) {
    t.style.left = t._left + "px";
    t.style.top = t._top + "px";
    t.style.width = t._w + "px";
    t.style.height = t._h + "px";
  }
  return ragged;
}

function placeMasonry(sec) {
  const grid = $("#grid-" + sec);
  const tiles = tileOrder[sec];
  if (!tiles || !tiles.length) return;

  const w = grid.clientWidth || innerWidth;
  const n = galColumns(innerWidth);

  const tail = Math.max(1, tiles.length - 8), base = tiles.slice(tail);
  let best = base, bestScore = packTiles(tiles, w, n, true);
  for (let k = 0; k < 60 && bestScore > 1; k++) {
    const t = shuffle(base.slice());
    tiles.splice(tail, t.length, ...t);
    const score = packTiles(tiles, w, n, true);
    if (score < bestScore) { bestScore = score; best = t; }
  }
  tiles.splice(tail, best.length, ...best);
  packTiles(tiles, w, n, false);

  const end = Math.max(...tiles.map((t) => t._top + t._h));
  grid.style.height = end + "px";
  /* the viewer walks the photos in the order they're laid out */
  shownOrder[sec] = tiles.map((t) => t._ph);
  tiles.forEach((t, i) => t.setAttribute("aria-label", `View photo ${i + 1} of ${tiles.length}`));
  grid.append(...tiles);   // keeps Tab order the same as the order on screen
}

/* Re-pack any open gallery when the viewport changes shape — same tiles,
   new column count. No reshuffle. */
function replaceOpenGalleries() {
  for (const sec of GALLERIES) {
    if ($("#dlg-" + sec).open) { placeMasonry(sec); galScrolled(galUI[sec], sec); }
  }
}

const fileName = (ph) => (ph.thumb || ph.src).split("/").pop();

function buildGallery(sec) {
  const col = SITE.collections[sec];
  const ui = galUI[sec];

  /* one featured photo leads, the others are spread through the page give or
     take a couple of places, and everything else is shuffled around them */
  const feat = new Set(col.featured || []);
  const big = shuffle(col.photos.filter((ph) => feat.has(fileName(ph)) && (ph.ar || 1.5) >= 1));
  const order = shuffle(col.photos.filter((ph) => !big.includes(ph)));
  if (big.length) order.unshift(big[0]);
  big.slice(1).forEach((ph, k, rest) => {
    const at = Math.round((k + 1) * order.length / (rest.length + 1)) + Math.floor(Math.random() * 5) - 2;
    order.splice(clamp(at, 2, order.length), 0, ph);
  });

  $("#sub-" + sec).textContent = col.blurb;
  ui.meta.textContent = `${order.length} photographs`;
  ui.dlg.scrollTop = 0;
  ui.bar.classList.remove("solid");
  ui.end.classList.remove("seen");

  (revealTimers[sec] || []).forEach(clearTimeout);   // a half-run cascade from last time
  revealTimers[sec] = [];

  const wide = galColumns(innerWidth) > 1;
  const tiles = order.map((ph, i) => {
    const btn = document.createElement("button");
    btn.className = "ph";
    btn._ph = ph;
    btn._ar = ph.ar || 1.5;
    btn._big = big.includes(ph);

    const img = document.createElement("img");
    if (i > 5) img.loading = "lazy";
    img.decoding = "async";
    // a featured photo shows at two columns, wider than the 700px thumb
    img.src = (btn._big && wide ? ph.src : ph.thumb) || ph.src;
    img.alt = ph.alt || "";
    btn.appendChild(img);

    btn.addEventListener("click", () => openLightbox(sec, tileOrder[sec].indexOf(btn)));
    return btn;
  });

  tileOrder[sec] = tiles;
  ui.grid.replaceChildren();
  placeMasonry(sec);
  galScrolled(ui, sec);
}

/* the photos arrive: straight away, or once a carried drawing has landed */
function revealGallery(sec) {
  const tiles = tileOrder[sec] || [];
  if (REDUCED.matches) {
    tiles.forEach((t) => t.classList.add("visible"));
    return;
  }

  /* setTimeout rather than a rAF chain on purpose: rAF is suspended while the
     tab is in the background, which would leave a gallery opened in a hidden
     tab permanently blank. This is also exactly how the old site did it. */
  tiles.forEach((t, i) => {
    /* capped: uncapped, the 121st tile of The Whole Lot waited 9.6 s, and
       anyone scrolling fast saw rows of empty cards */
    revealTimers[sec].push(setTimeout(() => t.classList.add("visible"), Math.min(i, 12) * STAGGER_MS));
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
  lbImg.classList.toggle("lb-sized", !!ph.ar);
  if (ph.ar) lbImg.style.setProperty("--ar", String(ph.ar));
  const next = new Image();
  next.onload = () => {
    if (lbPhotos()[lbIdx] !== ph) return;   // user already moved on
    lbImg.src = next.src;
  };
  next.src = ph.src;
  lbCap.textContent = ph.caption;
  lbCap.dataset.gallery = SITE.collections[lbSec].title;   // shown when there's no caption
  lbPlace.textContent = ph.place || "";
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
whenIdle(loadAlps);            // the Peaks & Wilds doorway draws with the ski game's ranges
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(tick); });
requestAnimationFrame(() => document.body.classList.add("loaded"));
