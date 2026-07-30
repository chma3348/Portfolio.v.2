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

- **Walk**: arrow keys / WASD, or click (tap) anywhere on the map
- **Felix** follows the path you actually walked, hangs back when you stop, and
  breaks into a trot when he falls behind. **Click or tap him to pet him.**
- **Open a section**: walk into a drawing and press Enter — or just click/tap it
- **Fast travel**: `Esc` or the compass button → Contents, one click to anywhere
- **Galleries**: click a photo for full-screen; arrow keys / swipe to browse; `Esc` to close
- Visited places get a "been here" stamp (remembered between visits)
- Works keyboard-only, with touch, with `prefers-reduced-motion`, and has a real
  `<nav>` fallback for screen readers, search engines and no-JS visitors

## Easter eggs (don't tell anyone)

| Secret | How to find it |
|---|---|
| **Off the side** | Walk into the **left or right** edge and hold. A squirrel bolts across the map, Felix goes after it, and it pulls through into a Temple-Run-style run down a winding trail. <kbd>←</kbd> <kbd>→</kbd> take corners, <kbd>↑</kbd> jumps logs, <kbd>↓</kbd> sploots under branches — each is taught the first time you need it. One life; your best is kept and a signpost appears on the map showing it (click it to go again). Difficulty arrives in stages — see `PHASES` in [runner.js](runner.js) — with empty "breather" straights mixed in once it's ramping. |
| **Off the top or bottom** | The other two edges go somewhere quieter: **The Whole Lot**, every photograph on the site shuffled into one gallery. Which edge does what is `edgeGoesToGallery()` in [game.js](game.js). |
| **Throw a stick** | Press <kbd>T</kbd>. Felix sprints after it and brings it back. Also noted at the bottom of the Contents sheet. |
| **Night mode** | Click the little sun doodle — it becomes a moon, the paper goes dark, stars come out, the campfire glows. Remembered between visits. |
| **Pet the dog** | Click or tap him. First pet says his name; after that he woofs. |
| **`woof`** | Just type it anywhere on the map. |
| **Making camp** | Leave everything alone 15 seconds — the hiker sits, Felix curls up, "zzz" drifts off. |
| **Startled birds** | Walk up on the flock and they flap away off the screen — and Felix follows them right off the paper, gone for a beat, before trotting back in. |
| **Field trip complete** | Visit all five places and a rubber stamp thumps onto the map. |
| **Compass hint** | The needle in the contents button points at the nearest place you haven't been. |

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
| `photos.js` | **your details and the photo manifest** — the file you'll edit |
| `photos/` | web-sized copies of your photographs |
| `dev-server.py` | local preview server with caching off (not deployed) |
| `PRODUCT.md` | design brief / project context |
