import { test } from "node:test";
import assert from "node:assert/strict";
import { aim, create, drop, heldX, JAR, pieces, snapshot, SPAWN_TIERS, step } from "../src/lib/engine/game.ts";
import { randomBot } from "../src/lib/engine/bot.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { outline, reach } from "../src/lib/engine/shapes.ts";
import { grow, grown, KNEE, RATIO, TOP } from "../src/lib/engine/size.ts";
import { HEADROOM } from "../src/lib/draw.ts";
import { SKINS } from "../src/lib/skins/index.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";
import { DEFAULT_SIZE, FIRST_SIZE, OLD_SIZES, readSize, SIZE_MAX, SIZE_MIN, SIZE_STEPS, sizeLabel, sizeWord, snapSize } from "../src/lib/sizes.ts";

// piece size (#10, a slider since #15): one number grows every tier of every
// look, applied once when a game is made, so the physics, the join, the drawing
// and the clamp agree. up to 1.5 it is a plain multiple; past it the big tiers
// ease toward a ceiling (engine/size.ts)

test("the slider runs 1 to 3 in steps of 0.1, and 1.5, the old big, is the default", () => {
  assert.equal(SIZE_MIN, 1);
  assert.equal(SIZE_MAX, 3);
  assert.equal(DEFAULT_SIZE, 1.5);
  assert.equal(FIRST_SIZE, 1);
  assert.equal(SIZE_STEPS.length, 21);
  assert.deepEqual(SIZE_STEPS.slice(0, 4), [1, 1.1, 1.2, 1.3]);
  assert.equal(SIZE_STEPS.at(-1), 3);
  for (const s of SIZE_STEPS) assert.equal(snapSize(s), s, `${s} is a step`);
  assert.equal(snapSize(1.26), 1.3);
  assert.equal(snapSize(0.2), 1);
  assert.equal(snapSize(9), 3);
  assert.equal(snapSize(NaN), 1.5);
  assert.deepEqual(SIZE_STEPS.map(sizeLabel).slice(0, 2), ["1.0", "1.1"]);
  assert.equal(sizeWord(1.5), "just right");
  assert.ok(sizeWord(1) !== sizeWord(3));
});

test("a saved size reads back: a slider number, an old name, or nothing for the default", () => {
  assert.equal(readSize(null), 1.5);
  assert.equal(readSize(""), 1.5);
  assert.equal(readSize("2.3"), 2.3);
  assert.equal(readSize("2.34"), 2.3);
  assert.equal(readSize("small"), 1);
  assert.equal(readSize("medium"), 1.3);
  assert.equal(readSize("big"), 1.5);
  assert.equal(readSize("huge"), 1.5);
  assert.equal(readSize("toString"), 1.5);
  assert.deepEqual(OLD_SIZES, { small: 1, medium: 1.3, big: 1.5 });
});

// every 0.01 from 1 to 3, so the curve is held between the slider's steps too
const FINE = Array.from({ length: 201 }, (_, i) => 1 + i * 0.01);

for (const skin of SKINS)
  test(`${skin.id}: the size curve. every tier grows with the slider, stays bigger than the one under it, and the biggest stays about 60% of the jar`, () => {
    const own = skin.tiers.map((t) => t.radius);
    let before = null;
    for (const s of FINE) {
      const r = grow(own, s);
      for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1] * RATIO - 1e-12, `${skin.id} at ${s}: tier ${i} ${r[i]} vs ${r[i - 1]}`);
      // every tier grows; the top one is at its ceiling by about 2 and holds there (it grows by less than a float can show)
      if (before) r.forEach((x, i) => assert.ok(i === r.length - 1 ? x >= before[i] : x > before[i], `${skin.id} tier ${i} grows from ${before[i]} at ${(s - 0.01).toFixed(2)} to ${x} at ${s.toFixed(2)}`));
      // the widest piece, any shape, at most 62% of the jar across
      const wide = Math.max(...r.map((x, i) => (2 * reach(skin.tiers[i].shape ?? "circle", x * JAR.width)) / JAR.width));
      assert.ok(wide <= 0.62 + 1e-9, `${skin.id} at ${s}: widest ${wide}`);
      before = r;
    }
  });

test("up to 1.5 a size is a plain multiple, so 1, 1.3 and 1.5 are the old small, medium and big exactly", () => {
  for (const s of [1, 1.3, 1.5]) assert.deepEqual(grow(cells.tiers.map((t) => t.radius), s), cells.tiers.map((t) => t.radius * s));
  // past the knee it eases off smoothly: no kink, the same slope on both sides
  const b = cells.tiers[10].radius, h = 1e-6;
  const left = (grown(b, KNEE, 10, 10) - grown(b, KNEE - h, 10, 10)) / h;
  const right = (grown(b, KNEE + h, 10, 10) - grown(b, KNEE, 10, 10)) / h;
  assert.ok(Math.abs(left - right) < 1e-3, `${left} vs ${right}`);
  // and it never passes the top ceiling
  assert.ok(grown(b, SIZE_MAX, 10, 10) <= TOP && grown(b, 6, 10, 10) <= TOP);
  assert.ok(grown(b, 1.6, 10, 10) < TOP && grown(b, 1.6, 10, 10) > b * KNEE);
  // the smallest grow most: at 3 the first piece is well over twice its own size
  const at3 = grow(cells.tiers.map((t) => t.radius), 3);
  assert.ok(at3[0] / cells.tiers[0].radius > 2.5);
});

for (const skin of SKINS)
  test(`${skin.id}: every size grows every radius by the curve, and the bodies and clamp follow`, () => {
    for (const size of [1, 1.3, 1.5, 2, 2.5, 3]) {
      const g = create(5, dims(skin, size));
      assert.equal(g.scale, size);
      const want = grow(skin.tiers.map((t) => t.radius), size);
      skin.tiers.forEach((t, i) => {
        // up to 1.5 in the old order (radius * width * size), so old seeded games replay exactly
        const exact = size <= 1.5 ? t.radius * JAR.width * size : want[i] * JAR.width;
        assert.equal(g.radii[i], exact, `${t.name} at ${size}`);
        assert.equal(g.reach[i], reach(t.shape ?? "circle", g.radii[i]));
      });
      // a dropped piece is that big, in the physics too
      g.held = 4;
      drop(g);
      const [p] = pieces(g);
      assert.equal(p.r, g.radii[4]);
      const body = g.live[0].body;
      const wide = (body.bounds.max.x - body.bounds.min.x) / 2;
      assert.ok(Math.abs(wide - g.reach[4]) < 0.01 * g.reach[4], `${size}: body half-width ${wide} vs ${g.reach[4]}`);
    }
  });

test("a size never changes a look's own data", () => {
  const before = SKINS.map((s) => s.tiers.map((t) => t.radius));
  for (const skin of SKINS) {
    assert.deepEqual(dims(skin, 3).radii, skin.tiers.map((t) => t.radius));
    create(1, dims(skin, 3));
  }
  assert.deepEqual(SKINS.map((s) => s.tiers.map((t) => t.radius)), before);
  // and with no size the engine plays the look's own size
  assert.deepEqual(create(1, { radii: dims(cells).radii }).radii, create(1, dims(cells, 1)).radii);
});

test("a size must be a positive number", () => {
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => create(1, dims(cells, bad)));
});

function scripted(seed, scale, steps) {
  const g = create(seed, dims(cells, scale));
  const hand = rng(seed + 99);
  for (let i = 0; i < steps; i++) {
    if (i % 37 === 0) aim(g, hand() * JAR.width);
    if (i % 41 === 0) drop(g);
    step(g);
  }
  return g;
}

test("the same seed, size and inputs replay the same game, at every size", () => {
  const runs = {};
  for (const size of [1, 1.5, 2.2, 3]) {
    const a = snapshot(scripted(11, size, 2400));
    const b = snapshot(scripted(11, size, 2400));
    assert.ok(a.pieces.length > 3 && a.score > 0, `${size}: a real game`);
    assert.deepEqual(a, b, String(size));
    runs[size] = a;
  }
  // the size matters to the game, and the deal does not depend on it
  assert.notDeepEqual(runs[1].pieces, runs[3].pieces);
  const deal = (scale) => {
    const g = create(21, dims(cells, scale));
    const seen = [g.held, g.next];
    for (let i = 0; i < 12; i++) {
      g.cooldown = 0;
      drop(g);
      seen.push(g.next);
    }
    return seen;
  };
  assert.deepEqual(deal(1), deal(3));
});

for (const skin of SKINS)
  test(`${skin.id} at every slider step: every drop is held inside the walls and drawn whole above the rim`, () => {
    for (const size of SIZE_STEPS) {
      const g = create(1, dims(skin, size));
      // how far each piece reaches, worked out here from the look and the curve, not read back from the engine
      const r = grow(skin.tiers.map((t) => t.radius), size).map((f) => f * JAR.width);
      for (let tier = 0; tier < SPAWN_TIERS; tier++) {
        const shape = skin.tiers[tier].shape ?? "circle";
        const wide = reach(shape, r[tier]);
        g.held = tier;
        for (const x of [-50, 0, JAR.width, JAR.width + 50]) {
          aim(g, x);
          const at = heldX(g);
          assert.ok(at - wide >= -1e-9 && at + wide <= JAR.width + 1e-9, `${skin.id} ${size} tier ${tier} aimed at ${x} sits at ${at}`);
        }
        const pts = outline(shape, r[tier]);
        const up = pts ? -Math.min(...pts.map((p) => p.y)) : r[tier];
        assert.ok(JAR.dropY - up >= -HEADROOM, `${skin.id} ${size} tier ${tier} reaches ${up - JAR.dropY} over the rim`);
      }
    }
  });

test("bigger pieces fill the jar sooner: the random bot lasts longer at every smaller size", () => {
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const seeds = [1, 2, 3, 4, 5, 6, 7];
  const drops = {};
  for (const size of [1, 1.5, 2, 3]) {
    const runs = seeds.map((s) => randomBot(s, dims(cells, size)));
    for (const r of runs) assert.ok(r.over, `${size} seed ${r.seed} never filled the jar`);
    drops[size] = median(runs.map((r) => r.drops));
  }
  assert.ok(drops[1] > drops[1.5] && drops[1.5] > drops[2] && drops[2] > drops[3], JSON.stringify(drops));
  // and the hardest end is still a game, not a jar full in a few drops
  assert.ok(drops[3] >= 15, JSON.stringify(drops));
});
