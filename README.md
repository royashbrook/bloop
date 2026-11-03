# bloop

a merge-drop game for kids. drop little blobs into a jar. two the same touch
and bloop into the next one up, atom to whale. **no ads, no lives, no timers,
nothing to buy, no accounts, no cookies, nothing sold or shared.** works offline.

play at [bloop.royashbrook.com](https://bloop.royashbrook.com).

## play locally

```sh
npm ci
npm run dev     # vite prints the local url
```

## what's inside

- the rules of the classic merge-drop game: 11 tiers, drops from the five
  smallest, a seeded deal, a preview of the next one, triangular-number scoring
  (a merge into tier n scores n(n-1)/2, two whales vanish for 66), and a full
  jar when anything settled stays above the dashed line for two seconds. see
  [game.ts](src/lib/engine/game.ts).
- real physics from [matter-js](https://github.com/liabru/matter-js), stepped at
  a fixed 1/60 s from an accumulator, so the same seed, size, speed and drops
  replay the same game. the engine has no DOM; node tests play whole games headless.
- one thumb: drag anywhere under the hud to aim, let go to drop, or tap to drop
  there. arrow keys aim, space drops.
- two of a kind join on the first touch: a live contact, or their outlines
  within one world unit (about a pixel on a phone). the outline is drawn inside
  the edge and nothing a piece draws reaches past it, so the edge you see is the
  edge that touches.
- looks are data: a skin is a list of tiers (name, size as a fraction of the jar
  width, colour, shape, a draw function) and a face. six ship: bubbles (the
  default, round soap bubbles with faces), numbers (rounded blocks from 2 to
  2048: two of a number make the double), cells, puppies, kitties and shapes
  ([skins/](src/lib/skins)). a player who picked a look keeps it. a shape is a circle, a rounded
  square, hexagon or triangle, built by the engine from the same outline the
  screen draws, with the area of the circle it stands in for. pick a look from
  the about sheet: an empty or finished jar switches at once, mid-game it waits
  for the next game. the pick is saved. a new look is a new file, never an
  engine change.
- faces come alive and stay upright: the body and its markings may roll, the
  eyes and mouth never turn. they blink every few seconds, glance at the nearest
  piece or the one about to drop, squint under a bigger piece and beam when just
  made. every 2 to 5.5 s each has a little moment: it looks at a neighbour (and
  nearly half the time the neighbour looks back, a hello), looks around, or
  snuggles in. a piece that comes to rest after moving gets comfy, eyes shut
  happily, and one hit by a contact that starts fast makes a face: a surprised o,
  or a squeezed >.< when hit hard. the bumps come from a read-only ear on the
  engine's collision events ([bumps.ts](src/lib/bumps.ts)). it is all
  render-only, so it never changes a game. with reduced motion on they hold
  still (no blink, no glance, no moments, no pop or ring), the squint, the beam,
  comfy and a bump still show. see [faces.ts](src/lib/faces.ts).
- sound, made on the spot with web audio (no files): a soft plop for a drop and
  a bloop for every merge, each size its own. small ones are light, high and
  quick, bigger ones lower, longer and rounder, and the biggest a deep wobbly
  glumph with a soft pop. a new biggest and two whales vanishing sparkle, quick
  merges step up a little, and a soft limiter with at most eight at once keeps it
  gentle. on by default, switch it off in the about sheet (saved). it starts on
  the first tap and goes quiet the moment the page hides. see
  [sound.ts](src/lib/sound.ts).
- size and speed: two sliders on one sheet, from the about sheet or a full
  jar's card. like a look, a change mid-game waits for the next game.
  - piece size runs 1 to 3 in tenths, 1.5 by default (the old "big"). one number
    grows every tier of every look, once, when a game is made, so the physics,
    the join, the drawing and the wall clamp all agree. up to 1.5 every piece is
    its own size times the number, so 1, 1.3 and 1.5 are the old small, medium
    and big exactly. past 1.5 the top tier has no room left to double, so each
    tier eases toward a ceiling of its own, each at least 8% over the one below,
    the biggest 62% of the jar across ([size.ts](src/lib/engine/size.ts)). the
    slider's picture shows the drops at that size as you drag. median drops to a
    full jar for the random bot over 20 seeds at speed 1.25: 193 at 1, 75 at
    1.5, 46 at 2, 38 at 2.5, 30 at 3.
  - speed runs 0.75 to 2 in quarters, 1.25 by default. speed s runs s times 60
    of the same fixed 1/60 s steps a real second: gravity, the step and every
    piece are unchanged, so a game is the same steps, only sooner, and settles
    and holds exactly as it does at 1. the full jar still takes two real
    seconds above the line at any speed.
  - every score keeps the settings it was made with: a best per size and speed,
    all in one saved record. older bests move to the settings they were played
    at, all at speed 1: small, medium and big to 1, 1.3 and 1.5, and anything
    from before sizes to 1.
- jiggle, off by default: switch it on in the about sheet and shake the phone
  to toss the pieces up (on iOS the switch is the tap that asks for motion). it
  is an input like a drop, seeded, so a replay is the same game, and a shake that
  spills the pile over the line still fills the jar. a run played with jiggle on,
  and a best made in one, carry a little phone-shake mark.
- `?seed=123` plays that exact deal, every game.
- PWA: offline shell ([sw.ts](src/sw.ts)), an update you accept with one tap,
  install helper. the build shows bottom right.

## tools

```sh
npm test              # engine rules, determinism, a random bot, looks, faces
npm run bot           # how far a random bot gets over 20 seeds (npm run bot -- 20 2.5 1.25: at a size and speed)
npm run check         # svelte-check
npm run build         # dist/, with /version.json
npx playwright install chromium webkit
npm run test:browser  # phone layout, controls, merge, looks, faces, full jar, offline, updates
npm run icons         # regenerate the install pngs from public/icon.svg (the bubble chain)
```

## license

MIT
