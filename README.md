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
of its own: there's a link at the end of each gallery, a row in the Contents
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
| **Off the right** | Walk into the **right** edge and hold. The paper slides aside to reveal a chairlift waiting, the pair get on, ride it up the mountain past the pylons, step off at the top and point downhill — an Alto's-Odyssey-style descent on **one button**. Tap to jump; **hold in the air to backflip**; let go to level out and land. Kickers throw you off without you touching anything, and timing a tap at the lip is what buys the big air. Land level and you keep your speed, land crooked and you wipe out. Felix bounds alongside the whole way — he jumps the crevasses himself and trots across the rope bridges — and when you crash he catches up, checks on you and sits down. Then they ski back onto the map together. Snow is the unfilled paper: the mountain is one ink line with nothing beneath it. Its own keepsake signpost appears on the right of the map at 150 m. |
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

## How the galleries look

Each gallery is a page of the same notebook as the map, after dark: always the
map's night paper (dot grid, grain, stars up top), whatever the map is doing.

- **The opening.** The title in the map's lettering with its crimson underline,
  your blurb, the photo count, and the landmark you walked into drawn stroke by
  stroke in the map's own pen (`dressGallery()` in [game.js](game.js) copies the
  drawing straight off the map), with its "been here" stamp. The Whole Lot,
  which has no landmark, gets the compass.
- **The bar.** "← the map" and the page number sit at the top; once the opening
  scrolls away the bar firms up with an ink rule, the landmark as a small icon,
  the title, and how far down you are ("14 / 35").
- **Featured photos.** Each gallery's `featured` list in [photos.js](photos.js)
  takes two columns; one leads the page (picked at random each visit) and the
  rest are spread through it.
- **The end.** Your trail, in the map's crimson dashes, leads to the next page
  (Peaks & Wilds → Journeys → Good Company → The Whole Lot → back to the map).
- **The way in.** Every section opens with its own short scene, then the page
  fades up around it; the galleries play theirs backwards on the way home.
  Peaks & Wilds: the ski game's own ranges (`Alps.still()` in
  [alps.js](alps.js), fetched when the map goes idle) rise one behind another
  under a moon. Journeys: the plane lays its dotted
  flight path while postcards of the gallery's first photos land on the table.
  Good Company: the camera's viewfinder opens to the screen, the first
  portrait comes into focus and the shutter fires. The Whole Lot: notebook
  pages flick past to the compass. About me: the page rises out of the
  campfire's smoke. Say hello: the envelope flies off the signpost, opens, and
  the postcard comes out. Any click or key skips; reduced motion, and deep
  links straight to a page, open plainly. `SCENES` / `SHEET_SCENES` in
  [game.js](game.js).
- **The viewer.** Hand-inked arrows, "back to the page", and under the photo
  your caption in handwriting with the place in type beside it.

## How the galleries load

Carried over from the old site, to the same numbers:

- **The mosaic.** The old site handed layout to Isotope: Bootstrap set only
  each tile's width (3 columns here, 2 under 768px, 1 under 576px), and Isotope dropped
  every tile, in shuffle order, into whichever column was currently shortest —
  flush under its neighbour, 24px gutters, every photo at its own aspect
  ratio. `placeMasonry()` in [game.js](game.js) makes the
  identical placement decisions without the library: `THUMB_SIZES` (bottom of
  [photos.js](photos.js)) supplies every aspect ratio up front, so the packing
  is computed before a single image loads — which also means lazy-loaded
  photos arrive into already-reserved spaces and the columns never shift.
  Resizing re-packs the same order into the new column count.
  Featured photos wait until two neighbouring columns are nearly level; the
  small step left over, and the step at the very bottom, are taken up by
  cropping the shorter column's last photo a touch taller, so every gutter
  stays 24px and the page ends on one straight line.

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

## Felix in the runner

`DOG_RUN` in [runner.js](runner.js) is Felix seen from behind. Earlier versions
drew him standing tall and narrow — an upright egg with a head on — and read as
a cat or a penguin. The fix was the camera, not the features: it sits above and
behind him looking down onto his back, so a running shepherd from there is squat
and wide. Two pale haunches with fluffy breeches, the black saddle running away
up the screen, the head beyond the shoulders (which hide its bottom), big broad
ears, the bushy tail hanging between the hind legs, and the hind paws kicking up
with their pads showing. He gallops — body bob, hind legs tucking a beat apart,
front legs reaching, ears bouncing — all on one clock that speeds up with him.
He has a shadow, which stays on the ground when he jumps, and kicks up dust
when he lands. Splooting, both hind legs stretch back at you, pads up; coming
home he's face on, ears up, tongue out.

## The runner's world

- **Skyline**: the ski game's ranges (`Alps.band()` in [alps.js](alps.js)) as a
  strip exactly one full turn long, so it slides across as the trail bends and
  comes round again. Far peaks, a nearer range, forested hills on the horizon.
- **Woods**: brush-drawn firs and spruces (the ski game's trees without the
  snow), aspens, bushes and boulders, laid far-to-near so nearer ones cover
  farther ones, and never on the trail after a corner. Distant firs switch to a
  three-path version, because the scene repaints every frame.
- **Ground**: grass tufts along the edges and pebbles on the trail stream past;
  the trail runs off the bottom of the screen.
- **Branches** grow from a trunk beside the trail, with leafy clumps.
- **Night**: if the map's in night mode, so is the trail.

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

### And then you ride up

The map's boarding scene carries the chair off to the **right**, so the ski
side picks them up mid-cable *travelling right* — same screen direction, no
cut in the action. The first pass at this had them riding left, and it read
exactly as wrong as it sounds: they exited one shot heading right and entered
the next heading back the way they came.

The ride itself is the simple shot it should be: the pair on the chair, the
cable climbing gently, and the far ranges passing behind — nothing else. The
trick that makes it work is that **the world's ink begins at x = 0**, the
summit shelf. Left of that is blank paper, so the cruise happens high over
nothing at all, and the slope, hachures and trees are all clamped to x ≥ 0 so
no stray ground line wanders into the sky. (The ranges are drawn in screen
space, so they pass behind at any height.)

The cable rises to the right, then dips into a **return wheel** at the summit
station, the way a real top station brings the chair down to unloading height.
Felix bails first, obviously; the rider hops off after him, both landing
*past* the wheel so the parked chair and the tower are behind them, and the
run begins from the landing. The lift stays drawn through the handoff — the
station scrolls off behind you within a second, and hiding it at the mode
switch popped.

It only plays on the way in from the map (`reset(withLift)`); a retry goes
straight back to the snow. A tap skips it, `esc` leaves for the map.

Two lessons from this scene worth keeping: JS's `%` is **signed**, so a
negative x indexed `BAND_KINDS[-1]` and handed the tree spacing table
`undefined` — `bandAt()` clamps at zero now. And the seated rider rotates by
`ang`, not `slopeAt(x)`: on the chair he hangs level over ground that doesn't
exist yet, and the slope there is meaningless.

Two things worth not undoing. `setPaperWidth()` exists because `#paperRect` is
exactly one viewport wide, so sliding it over showed the page behind the map.
And `#skiChair`'s paths carry their own CSS: `.ink` is only styled inside
`.landmark` / `.ink-decor`, so a bare ink path anywhere else renders as a
zero-area fill — i.e. nothing at all.

## The way out

The ending is five beats, and it bookends the way in.

| | beat | where |
|---|---|---|
| 1 | **follow-through** — the fall keeps moving | `settleStep()` in ski.js |
| 2 | the stamp fades in: distance, best, flips | `finish()` |
| 3 | he sits up, Felix licks his face, then sits down beside him | `recall` mode |
| 4 | the snow whitens to paper | `veil` mode |
| 5 | **they ski back onto the map** from the right | `updateArrival()` in game.js |

**The follow-through is the beat that was missing.** A crash used to be a
single frame: you hit something, the physics stopped dead, and the stamp
popped on top. It read as the game hanging rather than as a fall. Now it
branches on how you died, because "slides to a stop" is nonsense if you just
dropped down a hole:

- *caught an edge / clipped a rock* — he slides on down the slope throwing
  snow, decelerating to a standstill
- *into the crevasse* — no slide. He drops out of frame, the camera **holds on
  the lip** (`camHold`), and a puff of snow comes back up out of the hole. The
  plume is pinned to the lip rather than to him (`sprayX/sprayY`), or it would
  follow him down into the dark where nobody can see it.
- *pressing `esc` mid-run* — no tumble: he carves across the fall line into a
  hockey stop. This also fixes a freeze — leaving at 600 u/s used to turn you
  into a statue mid-glide while Felix strolled over.

The deceleration is **scaled to the speed he arrived at**, so he reaches a
standstill exactly as the beat ends however fast he was going. A fixed rate
left a fast exit still drifting at 48 when Felix walked up.

Two details worth not undoing. The distance is pinned at the moment of the
fall (`endMetres`) rather than read at the end — he slides for most of a
second afterwards, and a counter ticking up *after* you've crashed reads as
the game still giving you credit. And Felix's sit is keyed to the `saidBye`
flag, not to `mode === "recall"`: the veil is a mode of its own, so testing
the mode stood him back up for the half-second of the fade-out.

### The walk-back

Three sub-beats inside `recall`, and two of them exist because the first
version didn't read at all:

1. Felix runs up, and **the rider sits up in the snow** (`RIDER_SEATED`).
2. Felix licks his face, three times.
3. Felix drops to a sit, and calls it: *"time to call it a day, same time
   tomorrow?"*

He sits up because the crash sprawl is 60 units wide and lying down — a dog
leaning into it produced two tangled ink shapes on top of each other, and the
face wasn't anywhere his muzzle could reach. Sat up, the head is at a height
Felix can get to and the silhouettes stay separate. It happens whether you
crashed or walked away, because "time to call it a day" wants someone who has
already stopped.

**Felix draws OVER the rider.** Underneath, his muzzle and tongue disappeared
behind the rider's paper-filled head — the tongue was rendering the whole
time, just hidden. Drawn on top, his own paper fill occludes the rider cleanly
instead of tangling with it. During the run he's 96 units uphill and they never
overlap, so the order costs nothing there.

Two numbers worth keeping: `abs()` not `max(0, …)` on the lick wave —
`sin(3*pi*u)` has only **two** positive humps across the beat, so clipping the
negative one gave two licks where the shape reads as three. And the lick
reaches *up* as well as in: his nose sits 25 units off the ground and the
seated rider's face is at 40, so leaning alone never got near it.

**Falling down a crevasse needed its own handling.** He ends the settle
hundreds of units below the snow with the camera parked on the lip, so the
walk-back would have played out over an empty hole. `startRecall()` puts him
back on the near lip — he climbed out — and releases the camera, so every
ending plays the same from there.

**Bailing out now banks your distance.** `esc` skipped `finish()` entirely, so
walking away from a 900 m run recorded nothing. It's your distance either way;
only the stamp is skipped.

### Skiing back on

The map is the second half of the outro. A hiker who materialises where he
left is the same jump-cut the boarding scene exists to avoid, so he comes back
in from the side he left by, gliding, with Felix running alongside him rather
than trailing on the leash. About 1.9 seconds on an ease-out, ending at
`layout.start` — the map's own "you are here", which is both centre-screen and
a sensible place to be left standing. Stopping just over the edge read as
stopping because the screen ran out. **Any input at all takes the wheel**, so
it can never be something to sit through.

`#hikerSki` is its own pose rather than the walk pose plus a CSS lean. A
splayed stride reads wrong on skis, and tilting the group lifted the ski tips
off the snow.

The handoff between the two halves is the fiddly part: the ski run's own white
rect is torn down in the same frame the map appears, so `chaseFade` has to go
up **with its transition disabled** and be released a frame later. A
transitioned fade-in shows the map straight through the seam.

## In and out of the run

**The cloud bank.** The map and the mountain are joined by one cloud
(`cloudWipe` in game.js, shared with ski.js through `window.cloudWipe`). The
chair climbs into it on the map, the ski run opens out of it, the run closes
into it at the end, and the map opens out of it again; "go again" uses a quick
puff of it too. Every puff is drawn twice — a slightly larger ink disc in a
layer underneath, a paper disc on top — so overlapping puffs only show ink on
the outside of the cloud. The puffs are grouped into proper cumulus: rows of
separate clouds, each a dome of puffs with a flat base (clipped, with a
pencil line along it) and a soft shaded belly. A loose field of round puffs
read as bubbles, not weather.

It is deliberately slow: about 1.7 s rolling in, 2.2 s parting, each puff
staggered by where it sits so it arrives and leaves as a wave, and soft
wisps drift past while you're inside it. The first version was a 0.7 s
all-at-once wipe, and it read as a glitch rather than weather. It drifts
in from the top right, where the chair is heading, and the map waits until
it's fully in before switching to the ski run.

**The pan to the chair.** The paper is one viewport wide, so for the slide
over to the chair every paper layer is widened for the shot — the grain
too. Leaving the grain out made the strip that slid in a shade whiter.

**Getting in:** the chair sways on the cable and its passengers sway with it.
The chair and the two of you on it are one drawing (`#skChair`), not the
rider's and Felix's run poses parked on a seat: you sit back against the
backrest with your knees over the bar and your skis hanging, and Felix sits
next to you. The two poses laid over a chair read as a tangle of lines.
At the top, the `dropin` mode takes a beat: the camera pulls back for a look at
the valley, Felix bounces and barks, two pushes on the poles, and you drop in.
A tap skips it.

**Getting out:** the walk-back is a short script of beats (`startRecall()`
builds it per run, `recallStep()` plays it), and it depends on how you went
down:

- **buried by the avalanche:** a heap of snow with your skis poking out, "hang
  on!", Felix digs you out, snow flying;
- **into a crevasse:** you climb out on the **far** lip — the side you were
  heading for, and the side Felix ends up on, since he leaps crevasses. He
  turns to face back across the hole, peers down, and you clamber up beside
  him. It's a real climb, not a float: `climbJoints()` poses the body
  from deep in the hole up the far wall — four pulls, hands on holds while
  the body heaves up to them, then one hand reaching for the next — then
  hanging off the lip, mantling over it, and standing, with the skis strapped
  on your back. Nothing is clipped: an earlier version hid everything below
  the lip, and the hard edge it cut across the body was all you saw. Climbing
  out on the near side read as both of you zipping backwards.
  The camera glides to the scene in the ending rather than snapping;
- **a new best:** Felix spins twice and "new best!" before the sign-off.

Every ending then gets the three licks and "time to call it a day".

**Back on the map:** the cloud parts first, and only then (`startArrival(1.5)`
holds him just off the paper) do you ski in — starting together, the cloud
hid all but the last few metres. If the ski signpost is up, you ski in on a carve (a bezier in `startArrival`, sized from the screen so it's a
proper swoop at any size): in from the right, round to the left, and back
into the stop moving towards the post. You face the way you're travelling,
so you turn through the bottom of the arc, with Felix on the same line a beat
behind. Then you stop beside the post, turn and lean your skis against it —
behind the board, tips poking over the top, so they never cover the number (they
stay there between visits), Felix shakes the snow off, a new best gets
stamped onto the sign — and then you walk the rest of the way to the middle.
Watching him put the skis there is what makes them read as a keepsake; them
simply appearing meant nothing. Without a signpost yet (under 150 m), you
ski all the way to the middle instead. The stamp animates the sign's text,
not the sign: the sign carries its own `transform` attribute, and a CSS
transform on it would replace that rather than add to it.

## The extras: juice, goals, the avalanche

Everything in the "THE EXTRAS" section of ski.js sits on top of the run. None
of it changes the terrain, so the fairness audit never sees it.

- **Perfect landings.** Land within `PERFECT_TOL` of the slope after real
  airtime and you get "perfect!", a powder burst, a 4% speed kick, points, and
  the combo window refilled. Tuned to about a quarter of airborne landings —
  at 43% it stopped feeling special.
- **Juice.** Powder kicks off the skis in proportion to speed; wind streaks
  appear once the multiplier passes ×3; big landings dip the camera (a spring
  on top of the camera, never into it, and never a shake). Callouts like
  "perfect!" ride along with you, or at speed they vanish behind you.
- **Close calls.** Clear a rock by under `CLOSE_CALL` units for a bonus.
- **Snowflakes.** A hop's worth strung over clean stretches, plus a line
  through every crevasse jump and big-air arc. They sit a hop above the
  snow, so you have to jump for them.
- **Felix** barks and leaps at every 500 m marker, and at the **mountain
  goat** that stands on the slope ahead and bolts when you get close. The
  goat is pencil grey with no ink fill — scenery that runs away must never
  read as a hazard.
- **Goals.** Three at a time, shown on the chair ride and on the end stamp
  with progress. Finish all three and the next run brings a new set. Six
  authored sets, then the same kinds of goal at rising (capped) bars. Saved
  in `localStorage` as `fieldnotes-ski-goals`.
- **The avalanche.** First at about 325–475 m, then every 550–850 m. A scene
  in three acts: it **rolls into view** and settles 200 units behind you,
  matched to your speed so you get a good look at it; it **warns** you ("it's
  speeding up — land flips to pull away!"); then for 8 seconds it **creeps up**
  on you at `AV_CREEP` units a second, and every step of your combo buys back
  `AV_PUSH`. Outrun it for a big bonus and +1 multiplier; get caught and
  you're buried.

  It went through two failed designs first, both worth not repeating. At a
  fixed pace, burial was terrain luck — 0% to 50% depending on whether the
  chase began on a flat or steep stretch — and a pace tuned on autopilots was
  unbeatable for a real player, who loses more speed on landings. Then, eased
  off, it never came close enough to be seen. Tying it to the combo makes it
  about the thing the game wants you doing. Measured with autopilots that
  flip on demand: no flips, buried every time; one flip, always survives, with
  it 40–150 units behind you; two or more, comfortable at 160–200.

`checkGoals()` runs every frame, so `goalsFor()` is cached — rebuilding the
procedural sets (closures, `toLocaleString`) every frame quintupled the frame
cost. Test hooks: `Ski._forceAvalanche(gap)`, and `_dbg()` reports `stats`,
goals, the avalanche and the last landing's angle.

## The trees you ski past

`treeArt()` in ski.js draws them in the same brush language as the ranges:
firs and tall spruces built tier by tier, snow lying on each bough (bare
paper, outlined in ink) over a dark band of needles, and the odd bare snag
with snow along its limbs. Every tree is drawn fresh as it comes back into
view, so a hillside never repeats.

Two things worth not undoing. **The tiers are drawn bottom up, each one
complete before the next**, with an opaque base: drawing all the needles
first and all the snow second let each tier's snow paint over the needle
band of the tier above, and without the base the ranges showed through. And
**the snow line sits low on each tier**, because the tier above hides its top
half; snow that stopped two thirds of the way down showed only as small white
points. Trees are never solid ink across an area, so rocks stay the only
solid black mass on the snow.

## The ranges behind

`alps.js` draws the mountains behind the run: snow-capped peaks, forested
foothills, glaciers, the odd chalet and a distant lift line, in three layers.
The technique is after LingDong Huang's
[{Shan, Shui}*](https://github.com/LingDong-/shan-shui-inf) (MIT): silhouettes
built from noise, brush outlines as variable-width polygons, short texture
strokes for rock, and mist made by letting the ink thin out toward each
layer's foot. The code is written fresh, and the subject is alpine rather than
shan shui: snow is left as bare paper, the same way the run itself draws snow.
It's about 8 KB compressed and arrives with `ski.js`, never on the first page
load. Each run gets its own range.

**Each layer is its own endless downhill.** The far skyline is almost level,
the middle range slopes gently, and the near forest nearly as steeply as the
piste. As you ski, each one slides up and to the left along its own slope at
its own speed, so the descent reads through the whole picture rather than just
the slope line. (Measured over one second of skiing: grades 0.04 / 0.12 / 0.23,
moving 39 / 105 / 222 px.) On the chair they sink past you instead, which is
what makes the ride read as climbing, and at the summit they reverse. Over a
long run the far peaks also rise slowly, so you start up among the summits and
finish in the valley looking up at them.

The vertical scroll is tied to **how far along the run you are**, never to the
camera's absolute height. The old pencil ridgelines were pinned flat because
using the absolute height marched them off the top of the screen within a few
hundred metres; tying each layer to its own slope instead is stable by
construction. A small, smoothed share of the camera's bob (jumps, drops) is
added on top.

Things worth not undoing:

- **They live on their own layers, under the game's svg,** and per frame they
  only ever move by a CSS transform, which the browser composites without
  repainting. Each layer's svg is twice the viewport in each direction, so it
  can slide a long way before it needs re-anchoring. The ink is only
  rasterised again when a new stretch of range arrives (every couple of
  seconds). JS cost: 0.1 ms median per frame, about 5 ms on a frame that
  generates a new stretch.
- **Depth is ink strength, not layer opacity.** The paper fills must stay fully
  opaque or the farther ranges ghost through the nearer ones. `--k` caps how
  much ink each layer gets, and that's well under full strength so the rocks
  stay the darkest thing on screen.
- **The snow under the run is now an opaque fill** (`#skSnow`) so the ranges
  stop at the slope. Over a crevasse it runs lip to lip, so the hole stays a
  hole instead of showing the far valley through it.
- **Neighbouring chunks overlap generously.** They used to stop a few units
  short (an off-by-one in the sampling) and met along a near-shared edge; the
  antialiasing left hairlines the farther range showed through.
- **The forest falling away under the chair (`.sk-alp-forest`) fades out when
  you start skiing.** On the chair it fills what would otherwise be blank
  paper below the cable; on the run, the same band sits right above the slope
  where you read the rocks coming.
- **Whiteouts are mist rolling over the ranges** (an overlay), not the ranges
  going translucent. At night everything uses `--paper`/`--ink`, so the ranges
  invert with the rest of the run and fade on the same 3-second clock as the
  sky.
- **The back of the summit is drawn now.** With blank paper behind it, leaving
  the left of x = 0 empty was right. With ranges behind it, it read as a hole
  in the world, so a rounded back face falls away to the left.

If `alps.js` ever fails to load, the old pencil ridgelines are still there and
take over.

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

The hillside also has things to pass rather than just texture: snow-laden firs, tall spruces and the odd bare snag, and set pieces every 1,800-3,400 units — a cairn, a piste hut, a line of
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


### Felix crosses under his own steam

He is company, not a mechanic — he affects nothing and can't be lost. But once
crevasses became real holes he started falling into them, free-falling to the
bottom and then snapping back onto the snow the moment his x cleared the far
lip, which read as him dropping through the world and respawning.

He now bounds them. The arc is solved, not animated: given the gap's far lip
and his own horizontal speed, `felixFollow()` picks the launch velocity that
lands him on the other side. Three details that each cost a round of
debugging:

- **The decision fires whether he is running or already airborne.** Gating it
  on "he's on the ground" was the original bug — he pops off lips on his own,
  so he routinely reached a lip already in the air, sailed past the check and
  fell in with `vy` climbing all the way down.
- **Bridged spans are never leapt.** `felixGround()` hands him the deck and he
  trots across. It also reaches 16 units back past the deck's start: the deck
  begins 8 units inside the void, and that sliver read as open air — long
  enough for him to decide to jump a 700-unit chasm.
- **He lands when he is strictly below the surface**, not when he is
  "descending and below it". Waiting for `vy > 0` let a rising Felix burrow 43
  units into an up-ramp that climbed faster than he did, then pop out at his
  apex.

Measured over 40 runs: 182 crevasses and 26 bridges crossed, 0 frames
underground, 0 position snaps, and touchdown corrections of 7 units median /
21 max — one frame of ordinary falling.

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
Both optional, and they only show in the full-screen viewer: the caption in
handwriting, the place in type. Without them the viewer shows the gallery's name.

### Choosing the big ones

Each gallery has a `featured` list in [photos.js](photos.js) — file names of the
photos that get two columns. Landscape-shaped photos work best (portrait-shaped
ones are skipped); three to five per gallery is plenty. The Whole Lot features
all of them.

## Editing your details

Everything personal lives at the top of [photos.js](photos.js): your name,
tagline, email, location, copyright, Felix's name, and the contact-form
endpoint. The About text is in [index.html](index.html).

## Deploying

The site lives at **https://chrisinthewild.com**, hosted on Netlify and built
straight from `main` on GitHub: push to `main` and it's live a minute later
(Netlify keeps every deploy, so any one can be rolled back from its dashboard).

- **Domain**: registered at Porkbun. Its DNS has an `A` record (blank host →
  `75.2.60.5`) and a `CNAME` (`www` → `chrisinthewild.netlify.app`); the MX and
  SPF records are Porkbun's email forwarding. Netlify issues the HTTPS
  certificate itself.
- **[netlify.toml](netlify.toml)**: sends `chrisinthewild.netlify.app` to the real
  domain, hides the repo's working files (this README, notes, the dev server),
  and lets browsers keep photos for a week. The page, scripts and styles are
  re-checked on every visit.
- **Bump the build tag on every deploy.** In [index.html](index.html), the links
  to `styles.css`, `photos.js` and `game.js` end in `?v=…` — change it (the date
  and a letter will do) whenever you push. `game.js` passes it on to everything
  it loads later. Netlify already makes browsers re-check files, but the tag
  also covers anyone sitting on a cached copy from before.
- **Link previews** (`og:` tags in `index.html`) use full `chrisinthewild.com`
  addresses and `photos/share.jpg`, a 1200×630 crop of Travel-49 made for
  previews (they crop to about 1.9:1). To change it, make a new 1200×630 image
  and replace that file, or point `og:image` at another one.

## Files

| file | what it is |
|---|---|
| `index.html` | page structure + all the hand-drawn SVG artwork |
| `styles.css` | design system (paper/ink/crimson palette, dialogs, galleries) |
| `game.js` | the world engine: layout/scaling, steering, routing, lightbox, contact |
| `runner.js` | the run off the right edge (fetched on demand) |
| `ski.js` | the ski run off the left edge (fetched on demand) |
| `alps.js` | the mountain ranges behind the ski run (fetched with `ski.js`) |
| `photos.js` | **your details and the photo manifest** — the file you'll edit |
| `photos/` | web-sized copies of your photographs |
| `dev-server.py` | local preview server with caching off (not deployed) |
| `PRODUCT.md` | design brief / project context |
