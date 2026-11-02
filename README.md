# bloop

a merge-drop game for kids. drop little blobs into a jar. two the same touch
and bloop into the next one up, atom to whale. **no ads, no lives, no timers,
nothing to buy, no accounts, no cookies, nothing sold or shared.** works offline.

it will live at [bloop.royashbrook.com](https://bloop.royashbrook.com).

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
- looks are data: a skin is a list of tiers (name, radius as a fraction of the
  jar width, colour, a draw function). [cells.ts](src/lib/skins/cells.ts) is the
  only one so far. a new look is a new file, never an engine change.
- `?seed=123` plays that exact deal, every game.
- PWA: offline shell ([sw.ts](src/sw.ts)), an update you accept with one tap,
  install helper. the build shows bottom right.

## tools

```sh
npm test              # engine rules, determinism, a random bot to a full jar
npm run bot           # how far a random bot gets over 20 seeds
npm run check         # svelte-check
npm run build         # dist/, with /version.json
npx playwright install chromium webkit
npm run test:browser  # phone layout, controls, merge, full jar, offline, updates
npm run icons         # regenerate the install pngs from public/icon.svg
```

## license

MIT
