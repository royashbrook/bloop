import { test } from "node:test";
import assert from "node:assert/strict";
import { aim, create, drop, heldX, JAR, pieces, snapshot, SPAWN_TIERS, step } from "../src/lib/engine/game.ts";
import { randomBot } from "../src/lib/engine/bot.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { outline, reach } from "../src/lib/engine/shapes.ts";
import { HEADROOM } from "../src/lib/draw.ts";
import { SKINS } from "../src/lib/skins/index.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";
import { DEFAULT_SIZE, FIRST_SIZE, SIZES, sizeById } from "../src/lib/sizes.ts";
import { noBests, parseBests } from "../src/lib/best.ts";

// piece size (#10): one number scales every tier of every look, applied once when
// a game is made, so the physics, the join, the drawing and the clamp agree
const BIG = sizeById("big");

test("three sizes, small to big: small is the look's own size, medium is the default", () => {
  assert.deepEqual(SIZES.map((s) => s.id), ["small", "medium", "big"]);
  assert.equal(FIRST_SIZE.id, "small");
  assert.equal(sizeById("small").scale, 1);
  assert.equal(DEFAULT_SIZE.id, "medium");
  for (let i = 1; i < SIZES.length; i++) assert.ok(SIZES[i].scale > SIZES[i - 1].scale, `${SIZES[i].id} is bigger`);
  // a saved size that no longer exists falls back to the default
  assert.equal(sizeById("huge").id, "medium");
  assert.equal(sizeById(null).id, "medium");
});

for (const skin of SKINS)
  test(`${skin.id}: every size multiplies every radius, and the bodies and clamp follow`, () => {
    for (const size of SIZES) {
      const g = create(5, dims(skin, size.scale));
      assert.equal(g.scale, size.scale);
      skin.tiers.forEach((t, i) => {
        assert.equal(g.radii[i], t.radius * JAR.width * size.scale, `${t.name} at ${size.id}`);
        assert.equal(g.reach[i], reach(t.shape ?? "circle", g.radii[i]));
      });
      // a dropped piece is that big, in the physics too
      g.held = 4;
      drop(g);
      const [p] = pieces(g);
      assert.equal(p.r, g.radii[4]);
      const body = g.live[0].body;
      const wide = (body.bounds.max.x - body.bounds.min.x) / 2;
      assert.ok(Math.abs(wide - g.reach[4]) < 0.5, `${size.id}: body half-width ${wide} vs ${g.reach[4]}`);
    }
  });

test("a size never changes a look's own data", () => {
  const before = SKINS.map((s) => s.tiers.map((t) => t.radius));
  for (const skin of SKINS) {
    assert.deepEqual(dims(skin, BIG.scale).radii, skin.tiers.map((t) => t.radius));
    create(1, dims(skin, BIG.scale));
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
  for (const size of SIZES) {
    const a = snapshot(scripted(11, size.scale, 2400));
    const b = snapshot(scripted(11, size.scale, 2400));
    assert.ok(a.pieces.length > 5 && a.score > 0, `${size.id}: a real game`);
    assert.deepEqual(a, b, size.id);
    runs[size.id] = a;
  }
  // the size matters to the game, and the deal does not depend on it
  assert.notDeepEqual(runs.small.pieces, runs.big.pieces);
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
  assert.deepEqual(deal(1), deal(BIG.scale));
});

for (const skin of SKINS)
  test(`${skin.id} at big: the top tier is at most 60% of the jar across, and every drop is held inside the walls`, () => {
    const g = create(1, dims(skin, BIG.scale));
    const widest = Math.max(...g.reach) * 2;
    assert.ok(widest <= JAR.width * 0.6 + 1e-9, `widest piece ${widest} of ${JAR.width}`);
    for (let tier = 0; tier < SPAWN_TIERS; tier++) {
      g.held = tier;
      for (const x of [-50, 0, JAR.width, JAR.width + 50]) {
        aim(g, x);
        const at = heldX(g);
        assert.ok(at - g.reach[tier] >= 0 && at + g.reach[tier] <= JAR.width, `tier ${tier} aimed at ${x} sits at ${at}`);
      }
    }
  });

test("the held piece is drawn whole above the rim at every size", () => {
  for (const skin of SKINS)
    for (const size of SIZES) {
      const g = create(1, dims(skin, size.scale));
      for (let tier = 0; tier < SPAWN_TIERS; tier++) {
        const pts = outline(g.shapes[tier], g.radii[tier]);
        const up = pts ? -Math.min(...pts.map((p) => p.y)) : g.radii[tier];
        assert.ok(JAR.dropY - up >= -HEADROOM, `${skin.id} ${size.id} tier ${tier} reaches ${up - JAR.dropY} over the rim`);
      }
    }
});

test("bigger pieces fill the jar sooner: the random bot lasts longest on small, shortest on big", () => {
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const seeds = [1, 2, 3, 4, 5];
  const drops = {};
  for (const size of SIZES) {
    const runs = seeds.map((s) => randomBot(s, dims(cells, size.scale)));
    for (const r of runs) assert.ok(r.over, `${size.id} seed ${r.seed} never filled the jar`);
    drops[size.id] = median(runs.map((r) => r.drops));
  }
  assert.ok(drops.small > drops.medium && drops.medium > drops.big, JSON.stringify(drops));
  // medium is about half of small, big shorter again
  assert.ok(drops.medium < drops.small * 0.65, JSON.stringify(drops));
  assert.ok(drops.big < drops.medium * 0.9, JSON.stringify(drops));
});

// the saved bests: one record, a best per size. an older save was played at scale 1.
const never = () => assert.fail("only a plain-number save reads the old mark key");
test("no save, or a broken one, is no best at any size", () => {
  for (const raw of [null, "", "nope", "{", "null", "[]", "-5", "0", "{}"])
    assert.deepEqual(parseBests(raw, () => false), noBests(), String(raw));
});

test("an older plain-number best is the small best, with its mark from the old key", () => {
  assert.deepEqual(parseBests("40", () => true), { ...noBests(), small: { score: 40, jiggled: true } });
  assert.deepEqual(parseBests("40", () => false), { ...noBests(), small: { score: 40, jiggled: false } });
});

test("an older { score, jiggled } best is the small best", () => {
  assert.deepEqual(parseBests(JSON.stringify({ score: 77, jiggled: true }), never), { ...noBests(), small: { score: 77, jiggled: true } });
});

test("a best per size reads back as written, each size its own", () => {
  const bests = { small: { score: 900, jiggled: false }, medium: { score: 300, jiggled: true }, big: { score: 0, jiggled: false } };
  assert.deepEqual(parseBests(JSON.stringify(bests), never), bests);
  // a size missing or broken in the record is just no best for it
  assert.deepEqual(parseBests(JSON.stringify({ medium: { score: 12 }, big: "x" }), never), { ...noBests(), medium: { score: 12, jiggled: false } });
});
