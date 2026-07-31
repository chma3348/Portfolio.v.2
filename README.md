# Chris Manning — a walkable photography portfolio

Photography for people, places & projects, navigated like a small video game:
a hand-drawn map filling the whole screen, with a little hiker (and Felix) you
steer around. Plain HTML/CSS/JS — no frameworks, no build step, nothing to install.

Rebuilt from the original chrisclicks.com site: same words, same photographs,
same working contact form — different way in.

## Run it locally

```bash
python3 dev-server.py
```

…then open <http://localhost:8123>. [dev-server.py](dev-server.py) is a plain static
server with caching switched off, so an edit always shows up on reload — plain
`python3 -m http.server` will happily serve you yesterday's file. It's a local
convenience only; you don't deploy it.

## What's on the map

| Landmark | What it opens |
|---|---|
| **Peaks & Wilds** | 35 landscape photographs |
| **Journeys** | 52 travel photographs |
| **Good Company** | 34 portrait photographs |
| **About me** | your bio, with the Chinatown photo |
| **Say hello** | contact form + the email behind a sum, Boston MA |

Plus **The Whole Lot** — all 121 photographs shuffled together. It has no landmark
of its own: there's a button under each gallery's photos, a row in the Contents
sheet, and the secret way — walking off the top or bottom edge of the paper.

## How visitors use it

- **Walk**: arrow keys / WASD, or click (tap) anywhere on the map — or **hold
  and drag** and the pair follow the pointer around like it's a treat
- **Felix** follows the path you actually walked, hangs back when you stop, and
  breaks into a trot when he falls behind. **Click or tap him to pet him.**
- **Open a section**: walk into a drawing and press Enter — or just click/tap it
- **Fast travel**: `Esc` or the compass button → Contents, one click to anywhere
- **Galleries**: click a photo for full-screen; arrow keys / swipe to browse; `Esc` to close
- Visited places get a "been here" stamp — **reset on every load**, so the map
  is always worth walking again. Personal bests are the opposite and do
  persist: the stamps are an invitation, the bests are yours.
- Each game keeps your best distance across visits (`localStorage`), and shows
  it **under the live counter for the whole run** — muted, so it reads as a
  reference rather than as your score, and turning crimson to "new best!" the
  moment you pass it. A best you can only see on the game-over stamp is a best
  you can't pace yourself against. Read once per run, not per frame:
  `localStorage` is synchronous.
- Works keyboard-only, with touch, with `prefers-reduced-motion`, and has a real
  `<nav>` fallback for screen readers, search engines and no-JS visitors

## Easter eggs (don't tell anyone)

| Secret | How to find it |
|---|---|
| **Off the left** | Walk into the **left** edge and hold. A squirrel bolts across the map, Felix goes after it, and it pulls through into a Temple-Run-style run down a winding trail. <kbd>←</kbd> <kbd>→</kbd> take corners, <kbd>↑</kbd> jumps logs, <kbd>↓</kbd> sploots under branches — on a phone, swipe in those directions instead; the swipe registers mid-gesture, Temple-Run style — and each control is taught the first time you need it. One life; your best is kept and a signpost appears on the map showing it (click it to go again). Calling him back picks up from exactly where he's stood — he carries on a few paces, pulls up, turns and trots home to you. Difficulty arrives in stages — see `PHASES` in [runner.js](runner.js) — with empty "breather" straights mixed in once it's ramping. |
| **Off the right** | Walk into the **right** edge and hold. The hiker takes a pair of skis, walks to the base station, boards a chairlift with Felix and rides up the mountain, then points them downhill — an Alto's-Odyssey-style descent on **one button**. Tap to jump; **hold in the air to backflip**; let go to level out and land. Kickers throw you off without you touching anything, and timing a tap at the lip is what buys the big air. Land level and you keep your speed, land crooked and you wipe out. Felix bounds alongside the whole way, and when you crash he catches up and checks on you. Snow is the unfilled paper: the mountain is one ink line with nothing beneath it. Its own keepsake signpost appears on the right of the map at 150 m. |
| **Off the top or bottom** | The other two edges go somewhere quieter: **The Whole Lot**, every photograph on the site shuffled into one gallery. Which edge does what is `edgeGoesToGallery()` in [game.js](game.js). |
| **Throw a stick** | Press <kbd>T</kbd> — or double-tap (double-click) Felix. He sprints after it and brings it back. Also noted at the bottom of the Contents sheet. |
| **Night mode** | Click the little sun doodle — it becomes a moon, the paper goes dark, stars come out, the campfire glows. Remembered between visits. |
| **Pet the dog** | Click or tap him. First pet says his name; after that he woofs. |
| **`woof`** | Just type it anywhere on the map. |
| **Making camp** | Leave everything alone 15 seconds — the hiker sits, Felix curls up, "zzz" drifts off. |
| **Startled birds** | Walk up on the flock and they flap away off the screen — and Felix follows them right off the paper, gone for a beat, before trotting back in. |
| **Field trip complete** | Visit all five places and a rubber stamp thumps onto the map. Re-earnable each visit, like the stamps it pays off. |
| **Compass hint** | The needle in the contents button points at the nearest place you haven't been. |
| **Re-inked tagline** | Click "Chris Manning" while nothing's open: the chip shakes, the underline redraws itself and the tagline tries out another line — which wears off after ~5 seconds and fades back to the real one. (With a page open, that click still just returns you to the map.) |
| **Spin the compass** | Click the big compass rose. The needle spins up, wobbles, and settles pointing at Felix — true north — quivering after him for a few seconds before drifting back to N. |

To reset all of it, run `localStorage.clear()` in the browser console and reload.

## How the galleries load

Carried over from the old site, to the same numbers:

- **The mosaic.** The old site handed layout to Isotope: Bootstrap set only
  each tile's width (3 columns here, 2 under 768px, 1 under 576px), and Isotope dropped
  every tile, in shuffle order, into whichever column was currently shortest —
  flush under its neighbour, 24px gutters, every photo at its own aspect
  ratio, nothing cropped. `placeMasonry()` in [game.js](game.js) makes the
  identical placement decisions without the library: `THUMB_SIZES` (bottom of
  [photos.js](photos.js)) supplies every aspect ratio up front, so the packing
  is computed before a single image loads — which also means lazy-loaded
  photos arrive into already-reserved spaces and the columns never shift.
  Resizing re-packs the same order into the new column count.

- **Shuffled on every open.** Fisher-Yates over a copy of the list, re-run each
  time you open a gallery — so it's a new order every visit, and the whole set
  gets seen rather than the same photos always leading.
- **Staggered reveal.** Each tile rises 40px and fades in over
  `0.7s cubic-bezier(.4, 0, .2, 1)`, spaced `80ms` apart top-to-bottom. A 52-photo
  gallery finishes its cascade in about 4.8 seconds; The Whole Lot, at 121 photos,
  takes 9.6 — but only the first row or two is on screen at the start, so the rest
  have arrived long before you scroll to them.

Two deliberate differences from the original:

- The reveal is driven by `setTimeout`, exactly as the old site did, rather than
  `requestAnimationFrame` — rAF is suspended in background tabs, which would leave
  a gallery opened in an unfocused tab permanently blank.
- Under `prefers-reduced-motion` the shuffle still happens but the photos arrive
  at once instead of cascading.

The knobs are `STAGGER_MS` and the `.ph` transition in
[styles.css](styles.css) — change both together if you want a different pace.

## Known: Felix's in-game drawing

`DOG_RUN` in [runner.js](runner.js) is the sprite for Felix during the runner,
seen from behind. It doesn't read as a German Shepherd — it's been described as
looking like a cat. Seven redraws (adding a muzzle, turning the head to
three-quarters, low-and-long proportions, a stripped-back silhouette) each came
out worse, so the original is what's in place.

The blocker is that a dog viewed from directly astern hides every feature that
identifies it: no muzzle, no profile, no body length. Any of these would fix it:

- a reference sketch or image to work from
- a hand-drawn SVG dropped in to replace the `DOG_RUN` template string
- changing the camera angle so he's seen from the side, where the map's own
  Felix drawing already reads correctly

## The two games load only if you go looking

`runner.js` and `ski.js` are **not** in the initial page load. `loadGame()` in
[game.js](game.js) injects whichever one you need the moment you lean on an
edge — the edge hint is the cue, and the runner's squirrel chase then gives the
fetch five seconds of cover. That keeps the map's first paint at ~46 KB gzipped
rather than ~71 KB, for a game most visitors never open, and it means a third
game would cost the map nothing. If a fetch fails you land back on the paper
instead of staring at a covered screen.

Bests are read straight from `localStorage`, not from the modules, so the
keepsake signposts still appear for someone who hasn't loaded a game this visit.

## The way in

Getting on the lift happens **on the map**, not inside the game — see
`leaveForSki()` / `updateBoarding()` in [game.js](game.js). The paper itself
slides left to reveal a chair waiting just off the edge, the pair walk over and
get on, and it carries them away. About four seconds, and you're never cut from
the map to the game; you just follow them out of it.

An earlier attempt built a whole base station *inside* ski.js — pan, bull wheel,
walk-on, the lot — and it was worse in every way: it cut hard from the map, it
had its own coordinate space and camera to keep in sync, and the pair snapped
from the ground to the chair. The map already has the paper, the pair, their
walk cycle and a seated pose; using them is both simpler and more continuous.

Two things worth not undoing. `setPaperWidth()` exists because `#paperRect` is
exactly one viewport wide, so sliding it over showed the page behind the map.
And `#skiChair`'s paths carry their own CSS: `.ink` is only styled inside
`.landmark` / `.ink-decor`, so a bare ink path anywhere else renders as a
zero-area fill — i.e. nothing at all.

## Reading the mountain

Three rules keep the hazards legible, all of them learned the hard way:

- **Hazards outrank scenery.** Rocks are solid ink, 42-120 units wide, with a
  crimson tick at the base — crimson being the only saturated thing on the page.
  Trees are pencil-weight outlines with nothing filled. The distinction is
  *treatment*, not brightness, which is why the trees can stay visible: before
  this the tree was bigger and nearly as dark as the rock, and obstacles
  vanished into the background.
- **Different shapes, not just different sizes.** Trees are tall narrow
  triangles, rocks are wide low domes. Silhouette reads faster than size at speed.
- **A gap looks like a hole.** Both lips get a stepped cliff face falling into
  shade. Without them the ride line just stopped, which reads as a rendering
  glitch rather than as somewhere you must jump.

The hillside also has things to pass rather than just texture: three tree
silhouettes at varied sizes (a wide fir, a tall spruce, a bare wind-killed
snag), and set pieces every 1,800-3,400 units — a cairn, a piste hut, a line of
marker flags, a frozen tarn.

## Three verbs, not one

The run opens by teaching all three, one line at a time, in the order you will
need them — jump, then hold-to-flip, then *let go early, you must land level
with the slope*, then what a red warning triangle means, then what flips are
actually for. A single "tap to jump" told you the control and none of the game;
every death after that was a rule you had to infer. Crevasses, bridges and
rails each add their own line the first time you meet one, because none of them
are guessable from the terrain (see [Bridged crevasses](#bridged-crevasses) —
the bridge tip has to tell you to *stop* trying to jump).

- **Jump.** Tap. Kickers also throw you off with no input at all, so reading the
  terrain is worth something.
- **Flip.** Keep holding. Raises the multiplier; see below.
- **Grind.** Land on a piste fence and ride it — they run from a short hop-on
  to 900 units. A rail holds the combo window
  open while you're on it and counts as a trick when you leave, so it's the glue
  between jumps rather than a thing off to one side. Press to pop off early.

Kickers come in three sizes (punchy / standard / long), and a launcher never
follows straight on from another — landing one ramp into the run-in of the next
is what made them feel awkwardly placed. Rails come in three lengths too, up to
a preposterous 900-unit one that runs a whole shelf.

And **big air**: signposted mega-kickers with a 400-500 unit cliff behind the
lip, plus a rarer **BIG AIR** that doubles it. About 1.5 seconds of hang, 270 units above the snow, and the camera pulls
the frame back to 1.27x while you're up there — that pull-back is the whole
reason it reads as enormous rather than as a long hop.

Three things about the big jumps that took several passes and are worth not undoing:

- A kicker's **run-in is convex**, so if its rise in slope is steep relative to
  its length the run-in itself launches you — onto the up-ramp, which is tilted
  the other way, and you catch an edge in a single frame. Keep each size's
  compression gentle relative to its length.
- The cliff behind a BIG AIR is capped at ~700-900 units. At 1,600 the ground
  outran the camera: the skier ended up three thousand units above a hillside
  that had left the screen entirely. The camera's reaction is now hard-clamped
  as well, so no future terrain can do it again.

And two on the mega itself:
the lip must end in a **corner, not a curve** (a 67-unit blend into the cliff
meant the launch fired partway down the bend at near-zero angle, and you
dribbled off the edge), and the cliff needs **two knots at the same steep
slope** — heights are integrated by trapezoid, so a single knot from the up-lip
to a down-slope averages the two and nets about four units of drop.

## Why you'd risk a flip

A flip is credited **liberally**: the auto-aim that levels you out on release is
counted as part of the rotation (it takes the short way round, so it continues
the flip rather than unwinding it), and the count rounds up from about
three-quarters of a turn. Being three degrees short of a textbook 360 is not an
interesting distinction — if you committed and put it down matching the slope,
that's a flip. Landing one also throws up a rooster tail of snow, which is the
only moment spray appears.

Straight from the source game: a landed trick raises a **multiplier**, and the
multiplier makes you **faster** — up to +44% at ×8. Speed is distance and
distance is the keepsake, so flipping buys something real instead of being
decoration. The combo holds for 4.2 seconds after a landing, so chaining across
features is the skilful thing; a crash takes the lot.

The other half of that bargain is that going fast costs you reaction time on the
rocks. It never costs you a chasm — the clearance proof below is against the
speed *floor*, so overspeed only ever makes gaps easier. You are always risking
the thing you can see.

## How the ski run stays fair

The terrain generator makes one promise, asserted where it's generated:

> **Every crevasse is too wide to coast and narrow enough to jump — both
> measured at the speed floor.**

For a long time the promise was the other one: *clearable by a skier who
presses nothing at all*. It was provable, it was honestly enforced, and it was
the wrong promise. A hazard you cannot fall into is scenery drawn as a hole.
The button now has to be pressed, and a crevasse is a thing you can die in.

Fairness is the *window*, not the free ride. What holds it open:

- **A speed floor.** `SPEED_MIN` is clamped on every grounded frame. Both ends
  of the window are computed at it, so overspeed only ever helps — carry enough
  and you can coast one, which is the combo paying out rather than the hazard
  failing. Measured: 40 of 41 crevasses swallow a pilot who never presses; the
  one survivor was carrying speed.
- **A clean launch.** A crest's slope is strictly non-increasing and ends in an
  exactly straight ramp, so the take-off point, angle and speed are all pinned
  down rather than approximate — which makes the ballistic exact rather than
  hopeful.
- **A shallow lip, and that is the whole design.** `s_lip` is −0.04 to −0.14,
  where it used to be −0.20 to −0.34. A steep up-kick throws you a long free
  arc; that arc was the reason crevasses were impossible to fall into, because
  the terrain jumped them for you. Shallow, the coasting arc collapses while
  the jump impulse still carries you just as far — a press is worth about **4×**
  doing nothing rather than 2.6× — and that ratio is the room the window lives
  in. Every degree you steepen the lip narrows it.
- **Closed form at both ends.** Coasting is `gap ≤ u²(g_land − s_lip)/G`;
  jumping applies `pop()` to *both* velocity components (on an up-lip the
  normal pushes you slightly backward) and solves the same ballistic. A gap is
  generated between **1.9×** the coasting arc and **0.74×** the jumped one, and
  `Ski._audit(n)` replays the generator offline to check both. Across four
  independent 4,500 m generations: 0 unjumpable, 0 coastable, every gap needing
  at least 1.96× the free arc and leaving at least 1.35× in hand once jumped.
- **Reserved landings.** Anything that throws you into the air books the stretch
  you will come down on (`noRocks()`), because a rock met while already
  committed to a flight is a death you could not have avoided — the one kind
  this game must never hand out. A chasm books its whole approach too, so you
  are never dodging a rock while lining up a gap.
- **Warned hazards.** Rock clusters and crevasses both get a piste-style
  warning triangle planted 300-430 units ahead, far enough out to be a
  decision. The crevasse needs its sign more than the rocks do: a shallow lip
  reads as ordinary slope right up until it isn't there, and you have to have
  chosen before you can see the hole.
- **A void you cannot climb out of.** Falling in used to be survivable: the
  touchdown test fired as you crossed the far lip, checked your angle, and if
  it happened to match it put you back on the snow having passed *through* the
  mountain. Two tests close it — crossing out below the far lip is a wall
  strike, and `VOID_DEPTH` below it you are gone regardless. Both measure from
  the far lip, not from `groundAt()`: over a void that returns the near lip's
  own line, which on a 700-unit bridged span sits hundreds of units above the
  far side, and measuring from it killed you for riding a bridge correctly.

The timing window that buys you is roughly 80 units before the lip to 30 past
it — about 0.22 s, with `BUFFER` and `COYOTE` doing the work at the edges.
Played with realistic human jitter (σ ≈ 0.09 s) that clears 97% of crevasses;
deliberately sloppy (σ ≈ 0.15 s), 82%.

The phase tables' `gap: [a, b]` numbers are **a difficulty dial, not a
measurement** — they say where in a crevasse's own window to sit, so the run
escalates without any phase being able to author an unfair one.

### Two things that will bite whoever changes this next

**The trapezoid.** `reach()` had a factor of two in it for most of this game's
life. `knot()` integrates a span as `y += dx*(m_in + m_out)/2`, so a void
entered off a lip at `s_lip` and left at `g_land` drops the **mean of the
two**, not `gap*g_land`. Sizing gaps against the latter certified jumps nobody
could make: a measured 165-unit "crevasse" whose far lip came out seven units
*higher* than the near one, while the function promised 246 units of range. It
cost about one run in five. If you change how a void is knotted, re-derive
this — it is the number the whole fairness promise rests on.

**The ring's resolution.** The tempting fix for the above — a short corner knot
inside the void to swing the slope over, so the long span really does drop
`gap*g_land` — does not work, and fails *silently*. The ring samples every 6
units and `slopeAt()` lerps between samples, so a 10-unit corner is under two
samples wide and the launch angle it hands you is most of the way to `g_land`
already. The lip stops kicking, you leave it heading downhill, and gaps get
*less* clearable while looking more correct. Measured: launch velocity +161
where the model said −149. Anything shorter than about five samples is
invisible to the ring.


### Bridged crevasses

Some chasms are 620-900 units — far past anything the arithmetic above will
ever certify, and deliberately so. A rope bridge spans them, and it is a rail:
you land on the deck and grind across. The tip that fires the first time you
meet one says exactly that, because there is no reading of the terrain that
would tell you to *stop trying to jump*.

`_audit()` knows the difference. A bridged mark is not measured for
jumpability — it is checked for a deck (`bridgesWithoutADeck`), which is the
promise it actually makes. Across 60 played runs: 14 met, 14 grinded, 0 deaths.
Bailing off the deck mid-span with a jump lands you back on it, which is a
bunny hop rather than a mistake, and is fine.

The deck is anchored 30 units *past* the far lip. Ending it flush left you
stepping off the last plank still over the hole.

The one thing that scales with your screen is the *speed*, not the terrain:
the cap is tied to how much runway is visible ahead, so a portrait phone and a
desktop both give you about 1.2 seconds of warning.

## Your photos

`photos/` holds two web-sized copies of each photograph:

- `photos/full/` — 1600px, for the full-screen viewer
- `photos/thumb/` — 700px, for the gallery grid

**Your originals were not touched.** They're still in
`Portfolio-V1.1-main/images/` at full 2048px resolution. The derivatives here
total ~44MB versus 280MB of originals, which is what makes the galleries quick.

Six photographs appeared in both the Landscape and Travel folders. Each is now
in one gallery only, chosen by what it actually shows:

| Duplicate pair | Kept in | Because |
|---|---|---|
| Landscape-03 = Travel-05 | Peaks & Wilds | Colorado ranch land |
| Landscape-02 = Travel-04 | Peaks & Wilds | Mount Garfield |
| Landscape-23 = Travel-40 | Journeys | Himalayan stupa |
| Landscape-30 = Travel-45 | Journeys | Himalayan hillside |
| Landscape-12 = Travel-23 | Journeys | Kata Tjuta, Australia |
| Landscape-31 = Travel-47 | Journeys | Nepali village |

(Banner-1, -2 and -3 are also duplicates of Travel-03, -06 and -49, so they
aren't used. Banner-4 — you outside the restaurant — is the About photo.)

### Adding photos

1. Make the two sizes:

```bash
sips -Z 1600 -s format jpeg -s formatOptions 60 NEW.jpg --out photos/full/NEW.jpg
```

```bash
sips -Z 700 -s format jpeg -s formatOptions 60 NEW.jpg --out photos/thumb/NEW.jpg
```

2. Add a `p("NEW.jpg")` line to the right list in [photos.js](photos.js).
3. Add the thumb's pixel size to `THUMB_SIZES` at the bottom of the same file
   (`sips -g pixelWidth -g pixelHeight photos/thumb/NEW.jpg`). Skipping this
   won't break anything — that photo just loads without its space reserved.

### Captioning

`p("Travel-12.jpg", "morning ferry", "Sydney Harbour")` — caption, then where.
Both optional. Captions show under the photo in the full-screen viewer.

## Editing your details

Everything personal lives at the top of [photos.js](photos.js): your name,
tagline, email, location, copyright, Felix's name, and the contact-form
endpoint. The About text is in [index.html](index.html).

## Deploying

Currently set up to run locally only. To put it online you'd add a `CNAME` file
and a GitHub Pages workflow, the same way `Portfolio-V1.1-main` does it — say
the word and I'll wire that up.

## Files

| file | what it is |
|---|---|
| `index.html` | page structure + all the hand-drawn SVG artwork |
| `styles.css` | design system (paper/ink/crimson palette, dialogs, galleries) |
| `game.js` | the world engine: layout/scaling, steering, routing, lightbox, contact |
| `runner.js` | the run off the right edge (fetched on demand) |
| `ski.js` | the ski run off the left edge (fetched on demand) |
| `photos.js` | **your details and the photo manifest** — the file you'll edit |
| `photos/` | web-sized copies of your photographs |
| `dev-server.py` | local preview server with caching off (not deployed) |
| `PRODUCT.md` | design brief / project context |
