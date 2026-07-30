# Product

## Register

brand

## Users

The photographer's personal audience: friends, fellow photography lovers, and anyone who lands on a shared link. They arrive curious, on laptop or phone, with no task pressure — the job to be done is *wander and enjoy the photographs*. A secondary "user" is the photographer themself: the site should be easy to update (drop new photos in, no build tools).

## Product Purpose

A personal art showcase for landscape & travel photography, navigated like a small video game: a hand-drawn map filling the whole screen, with a steerable avatar. Success = visitors smile at the interface, then spend their time in the photographs — and the whole thing loads near-instantly.

## Brand Personality

Hand-made, wandering, quietly playful. The site should feel like one person's field notebook come to life — warm and personal, never corporate, never loud. The game layer is charm, not spectacle.

## Anti-references

- The toy-car portfolio site that inspired this: spiritual ancestor, not a template. Don't copy the car or its world.
- Heavy WebGL "experience" sites with loading bars — violates the #1 requirement (fast load).
- Generic template portfolios (Squarespace-style photo grids with a hamburger menu) — the reason this project exists.
- Game navigation that traps visitors: any design where reaching a section takes more than a couple of seconds or a single click is a failure.

## Design Principles

1. **Photos are the destination; the game is the journey.** The map stays paper-and-ink; the photographs are the only full-color, full-bleed thing on the site. The map must never compete.
2. **Never more than a click from anywhere.** Fast travel is first-class: an always-visible contents button (and Esc), clickable landmarks, brisk walk speed. Charm may add ~1 second, never ten.
3. **Featherweight world.** The map is drawn in code (SVG/CSS), not image assets; photos lazy-load. First paint should be near-instant on a phone connection.
4. **Hand of the maker.** Wobbly lines, handwritten labels, personal captions. Imperfection is the aesthetic; nothing should look machine-perfect except the photographs.
5. **No wasted screen, no unreadable drawing.** The map is edge-to-edge at every size, and the artwork carries its own scale factor so labels and icons stay legible from a 320px phone to a 4K display. When a screen is too small for the full arrangement, the map re-composes rather than shrinking into illegibility.
6. **Works for every hand.** Keyboard, mouse, and touch all steer; reduced-motion visitors get instant travel; a plain HTML menu fallback exists for accessibility and SEO.

## Accessibility & Inclusion

- WCAG AA contrast for all text (ink-on-paper world palette must be tested, not assumed).
- Full keyboard operation: arrows/WASD to steer, Enter to enter a location, Esc for fast travel, Tab-reachable everything.
- `prefers-reduced-motion`: avatar teleports instead of walking; no ambient animation.
- A standard semantic nav (skip link + real `<nav>`) renders for screen readers and search engines.
- Touch: tap-to-walk plus the fast-travel menu; no hover-only functionality.
