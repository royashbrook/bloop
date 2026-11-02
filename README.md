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
  a fixed 1/60 s from an accumulator, so the same seed and the same drops replay
  the same game. the engine has no DOM; node tests play whole games headless.
- one thumb: drag anywhere under the hud to aim, let go to drop, or tap to drop
  there. arrow keys aim, space drops.
- two of a kind join on the first touch: a live contact, or their outlines
  within one world unit (about a pixel on a phone). the outline is drawn inside
  the edge and nothing a piece draws reaches past it, so the edge you see is the
  edge that touches.
- looks are data: a skin is a list of tiers (name, size as a fraction of the jar
  width, colour, shape, a draw function) and a face. four ship: cells, puppies,
  kitties and shapes ([skins/](src/lib/skins)). a shape is a circle, a rounded
  square, hexagon or triangle, built by the engine from the same outline the
  screen draws, with the area of the circle it stands in for. pick a look from
  the about sheet: an empty or finished jar switches at once, mid-game it waits
  for the next game. the pick is saved. a new look is a new file, never an
  engine change.
- faces come alive and stay upright: the body and its markings may roll, the
  eyes and mouth never turn. they blink every few seconds, glance at the nearest
  piece or the one about to drop, squint under a bigger piece and beam when just
  made. it is all render-only, so it never changes a game. with reduced motion
  on they hold still (no blink, no glance, no pop or ring), the squint and the
  beam still show. see [faces.ts](src/lib/faces.ts).
- `?seed=123` plays that exact deal, every game.
- PWA: offline shell ([sw.ts](src/sw.ts)), an update you accept with one tap,
  install helper. the build shows bottom right.

## tools

```sh
npm test              # engine rules, determinism, a random bot, looks, faces
npm run bot           # how far a random bot gets over 20 seeds
npm run check         # svelte-check
npm run build         # dist/, with /version.json
npx playwright install chromium webkit
npm run test:browser  # phone layout, controls, merge, looks, faces, full jar, offline, updates
npm run icons         # regenerate the install pngs from public/icon.svg
```

## license

MIT
