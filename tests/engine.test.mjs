import { test } from "node:test";
import Matter from "matter-js";
import assert from "node:assert/strict";
import {
  aim,
  COOLDOWN,
  create,
  drop,
  GRACE,
  JAR,
  MAX_MERGES,
  pieces,
  place,
  scoreFor,
  snapshot,
  SPAWN_TIERS,
  step,
} from "../src/lib/engine/game.ts";
import { randomBot } from "../src/lib/engine/bot.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";

const DIMS = dims(cells);
const LAST = DIMS.radii.length - 1;
const r = (tier) => DIMS.radii[tier] * JAR.width;
const floorY = (tier) => JAR.height - r(tier);
const run = (g, n) => {
  const merges = [];
  for (let i = 0; i < n; i++) {
    step(g);
    merges.push(...g.merges);
  }
  return merges;
};
const wait = (g) => {
  while (g.cooldown > 0) step(g);
};

test("score per merge is the triangular number of the new tier", () => {
  // 1-based tier 2 gives 1, tier 3 gives 3, then 6, 10, 15 ... and 66 for the top pair
  assert.deepEqual([1, 2, 3, 4, 5].map(scoreFor), [1, 3, 6, 10, 15]);
  assert.equal(scoreFor(LAST + 1), 66);
});

test("two dropped pieces of one tier merge into one of the next, scoring its number", () => {
  // the first seed whose first two drops are the same tier
  let seed = 1;
  while (create(seed, DIMS).held !== create(seed, DIMS).next) seed++;
  const g = create(seed, DIMS);
  const tier = g.held;
  aim(g, JAR.width / 2);
  assert.ok(drop(g));
  wait(g);
  assert.ok(drop(g));
  const merges = run(g, 180);
  assert.equal(merges.length, 1);
  assert.equal(merges[0].tier, tier + 1);
  const left = pieces(g);
  assert.equal(left.length, 1);
  assert.equal(left[0].tier, tier + 1);
  assert.equal(left[0].made, true);
  assert.equal(g.score, scoreFor(tier + 1));
});

test("the merged piece keeps the pair's average velocity, at their midpoint", () => {
  const g = create(1, DIMS);
  // a touching pair in mid-air, both sliding right and rising
  place(g, 3, 150, 250);
  place(g, 3, 150 + r(3) * 2 - 3, 250);
  for (const p of g.live) Matter.Body.setVelocity(p.body, { x: 3, y: -2 });
  const [a, b] = pieces(g);
  step(g);
  const [made] = pieces(g);
  assert.equal(made.tier, 4);
  assert.ok(Math.abs(made.x - (a.x + b.x) / 2 - 3) < 1, `x ${made.x}`);
  assert.ok(Math.abs(made.vx - 3) < 0.3, `vx ${made.vx}`);
  assert.ok(Math.abs(made.vy + 2) < 0.6, `vy ${made.vy}`);
});

test("different tiers never merge", () => {
  const g = create(2, DIMS);
  // a row of the small tiers, each pressed into its neighbours, plus two dropped on top
  let x = 0;
  for (let t = 0; t < 6; t++) {
    x += r(t);
    place(g, t, x, floorY(t));
    x += r(t) - 3;
  }
  place(g, 7, JAR.width / 2, 200);
  place(g, 9, JAR.width / 3, 0);
  const before = pieces(g).map((p) => p.tier).sort();
  const merges = run(g, 600);
  assert.equal(merges.length, 0);
  assert.equal(g.score, 0);
  assert.deepEqual(pieces(g).map((p) => p.tier).sort(), before);
});

test("two of the top tier vanish together for 66", () => {
  const g = create(3, DIMS);
  const y = floorY(LAST);
  place(g, LAST, r(LAST), y);
  place(g, LAST, r(LAST) * 3 - 4, y);
  const merges = run(g, 2);
  assert.equal(pieces(g).length, 0);
  assert.equal(g.score, 66);
  assert.deepEqual(
    merges.map((m) => [m.vanish, m.points]),
    [[true, 66]],
  );
});

test("a piece merges at most once a step: three touching make one merge, not two", () => {
  const g = create(4, DIMS);
  const t = 2, rr = r(t), y = floorY(t);
  place(g, t, 100, y);
  place(g, t, 100 + 2 * rr - 3, y);
  place(g, t, 100 + rr - 1.5, y - Math.sqrt(3) * rr + 4);
  step(g);
  assert.equal(g.merges.length, 1);
  assert.deepEqual(pieces(g).map((p) => p.tier).sort(), [t, t + 1]);
  assert.equal(g.score, scoreFor(t + 1));
});

test("merges per step are capped; the rest resolve on the next step", () => {
  const g = create(5, DIMS);
  // eight separate touching pairs of atoms along the floor
  const rr = r(0), y = floorY(0);
  for (let i = 0; i < 8; i++) {
    const x = 14 + i * 48;
    place(g, 0, x, y);
    place(g, 0, x + rr * 2 - 2, y);
  }
  step(g);
  assert.equal(g.merges.length, MAX_MERGES);
  step(g);
  assert.equal(g.merges.length, 8 - MAX_MERGES);
  assert.equal(pieces(g).filter((p) => p.tier === 1).length, 8);
});

test("drops come only from the five smallest tiers, and all five come", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = create(seed, DIMS);
    const hand = rng(seed);
    for (let d = 0; d < 25; d++) {
      seen.add(g.held).add(g.next);
      aim(g, hand() * JAR.width);
      drop(g);
      wait(g);
    }
    for (const p of pieces(g)) if (!p.made) assert.ok(p.tier < SPAWN_TIERS, `dropped tier ${p.tier}`);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4]);
});

test("a drop waits out the cooldown", () => {
  const g = create(6, DIMS);
  assert.ok(drop(g));
  assert.equal(drop(g), false);
  run(g, COOLDOWN - 1);
  assert.equal(drop(g), false);
  step(g);
  assert.ok(drop(g));
  assert.equal(g.drops, 2);
});

// a scripted player: aims from its own seeded hand and drops on fixed steps
function scripted(seed, steps) {
  const g = create(seed, DIMS);
  const hand = rng(seed * 31 + 7);
  for (let i = 0; i < steps; i++) {
    if (i % 37 === 0) aim(g, hand() * JAR.width);
    if (i % 41 === 0) drop(g);
    step(g);
  }
  return g;
}

test("the same seed and the same inputs replay the same game, to the bit", () => {
  const a = snapshot(scripted(11, 3000));
  const b = snapshot(scripted(11, 3000));
  assert.ok(a.pieces.length > 10, "a real pile, not an empty jar");
  assert.ok(a.score > 0, "merges happened");
  assert.deepEqual(a, b);
  // and the seed matters
  assert.notDeepEqual(snapshot(scripted(12, 3000)).pieces, a.pieces);
});

test("a single falling drop never raises the warning or ends the game", () => {
  for (const tier of [0, 4]) {
    const g = create(7, DIMS);
    g.held = tier;
    aim(g, JAR.width / 2);
    drop(g);
    for (let i = 0; i < 300; i++) {
      step(g);
      assert.equal(g.danger, 0, `step ${i}: the drop is falling through, not stuck`);
    }
    assert.equal(g.over, false);
    assert.ok(pieces(g)[0].y > JAR.height / 2, "it reached the bottom");
  }
});

// fill the jar dropping at the walls and the middle, the quickest way to run out of room
function fill(seed) {
  const g = create(seed, DIMS);
  const trace = [];
  while (!g.over && g.steps < 60 * 600) {
    if (g.cooldown === 0) {
      aim(g, [0, JAR.width / 2, JAR.width][g.drops % 3]);
      drop(g);
    }
    step(g);
    trace.push(g.danger > 0);
  }
  return { g, trace };
}

test("the jar is full when a settled piece stays above the line for two seconds", () => {
  const { g, trace } = fill(4);
  assert.ok(g.over, "the jar filled up");
  // the warning was up for exactly the last 120 steps (2 s), not one fewer
  let streak = 0;
  for (let i = trace.length - 1; i >= 0 && trace[i]; i--) streak++;
  assert.equal(streak, 120);
  // nothing moves once it is over
  const frozen = snapshot(g);
  run(g, 60);
  assert.deepEqual(snapshot(g), frozen);
  assert.equal(drop(g), false);
});

// a piece pinned in place, so the clock is tested without a long physics run
// that plays out differently on another node version
test("a warning that clears in time restarts the two second clock", () => {
  const g = create(1, DIMS);
  const id = place(g, 0, JAR.width / 2, JAR.line - 20);
  const body = g.live.find((p) => p.id === id).body;
  Matter.Body.setStatic(body, true);
  run(g, 100);
  assert.ok(g.danger > 0 && !g.over, "over the line, warning up");
  Matter.Body.setPosition(body, { x: JAR.width / 2, y: JAR.height / 2 });
  run(g, 1);
  assert.equal(g.danger, 0, "back under the line, warning gone");
  Matter.Body.setPosition(body, { x: JAR.width / 2, y: JAR.line - 20 });
  run(g, 119);
  assert.equal(g.over, false, "a fresh 2 s, not the 100 steps already spent");
  run(g, 1);
  assert.equal(g.over, true);
});

test("the pile settles: no jitter once the drops stop", () => {
  const g = create(8, DIMS);
  const hand = rng(8);
  while (g.drops < 80 && !g.over) {
    if (g.cooldown === 0) {
      aim(g, hand() * JAR.width);
      drop(g);
    }
    step(g);
  }
  assert.ok(pieces(g).length > 12, `${pieces(g).length} pieces`);
  run(g, 60 * 10);
  const fastest = Math.max(...pieces(g).map((p) => Math.hypot(p.vx, p.vy)));
  // world units per step: 0.05 is 3 units a second, under a pixel on a phone
  assert.ok(fastest < 0.05, `fastest piece still moving at ${fastest}`);
});

test("a random bot plays whole games to a full jar and makes at least tier 5", () => {
  for (const seed of [1, 2, 3]) {
    const result = randomBot(seed, DIMS);
    assert.ok(result.over, `seed ${seed} never filled the jar`);
    assert.ok(result.made >= 4, `seed ${seed} only made tier index ${result.made}`);
    assert.ok(result.score > 0);
  }
});

test("a merge made in the pile counts toward the line at once", () => {
  const g = create(9, DIMS);
  place(g, 1, 200, floorY(1));
  place(g, 1, 200 + r(1) * 2 - 3, floorY(1));
  step(g);
  const [made] = pieces(g);
  assert.ok(made.made && made.age > GRACE);
});

test("a merge says when it makes a tier this game has not seen yet", () => {
  const g = create(10, DIMS);
  const pair = (t, x) => {
    place(g, t, x, floorY(t));
    place(g, t, x + r(t) * 2 - 3, floorY(t));
  };
  pair(5, r(5));
  step(g);
  assert.deepEqual(g.merges.map((m) => [m.tier, m.first]), [[6, true]]);
  assert.equal(g.top, 6);
  // the same tier again is no news
  pair(5, JAR.width - r(5) * 3);
  run(g, 1);
  assert.deepEqual(g.merges.map((m) => [m.tier, m.first]), [[6, false]]);
});

// merge on the first touch (#5): two of a kind join as soon as their outlines meet
const pin = (g, id) => Matter.Body.setStatic(g.live.find((p) => p.id === id).body, true);

test("two of a kind resting with their outlines half a unit apart join within two steps", () => {
  for (const t of [0, 3, 7]) {
    const g = create(12, DIMS);
    const x = JAR.width / 2 - r(t) - 0.25;
    place(g, t, x, floorY(t));
    place(g, t, x + r(t) * 2 + 0.5, floorY(t));
    const merges = run(g, 2);
    assert.deepEqual(merges.map((m) => m.tier), [t + 1], `tier ${t}`);
  }
});

test("two of a kind held three units apart never join", () => {
  for (const t of [0, 3, 7]) {
    const g = create(13, DIMS);
    const x = JAR.width / 2 - r(t) - 1.5;
    pin(g, place(g, t, x, floorY(t)));
    pin(g, place(g, t, x + r(t) * 2 + 3, floorY(t)));
    assert.equal(run(g, 120).length, 0, `tier ${t}`);
    assert.equal(pieces(g).length, 2);
  }
});

// shapes (#3): a skin may make a tier a square, a hexagon or a triangle
import { outline, outlineArea, reach, SHAPES } from "../src/lib/engine/shapes.ts";
const shaped = (shape) => ({ radii: DIMS.radii, shapes: DIMS.radii.map(() => shape) });
const lowest = (shape, rr) => Math.max(...(outline(shape, rr) ?? [{ y: rr }]).map((p) => p.y));

test("every shape builds a body with the outline the screen draws, as big as its circle", () => {
  for (const shape of SHAPES) {
    const g = create(14, shaped(shape));
    const t = 5, rr = r(t);
    const id = place(g, t, 200, 300);
    const body = g.live.find((p) => p.id === id).body;
    // the same area as the circle it stands in for, within a few percent (a matter circle is a polygon)
    assert.ok(Math.abs(body.area / (Math.PI * rr * rr) - 1) < 0.03, `${shape} area ${body.area}`);
    const pts = outline(shape, rr);
    if (!pts) continue;
    assert.ok(Math.abs(outlineArea(pts) / (Math.PI * rr * rr) - 1) < 1e-9, `${shape} outline area`);
    assert.equal(body.vertices.length, pts.length);
    pts.forEach((p, i) => {
      assert.ok(Math.abs(body.vertices[i].x - 200 - p.x) < 1e-6 && Math.abs(body.vertices[i].y - 300 - p.y) < 1e-6, `${shape} vertex ${i}`);
    });
  }
});

test("every shape joins on the first touch, and only then", () => {
  for (const shape of SHAPES) {
    for (const t of [1, 6]) {
      const rr = r(t), w = reach(shape, rr), y = JAR.height - lowest(shape, rr);
      const near = create(15, shaped(shape));
      place(near, t, 150, y);
      place(near, t, 150 + 2 * w + 0.5, y);
      assert.deepEqual(run(near, 2).map((m) => m.tier), [t + 1], `${shape} tier ${t} at 0.5`);
      const far = create(15, shaped(shape));
      pin(far, place(far, t, 150, y));
      pin(far, place(far, t, 150 + 2 * w + 3, y));
      assert.equal(run(far, 60).length, 0, `${shape} tier ${t} at 3`);
    }
  }
});

test("a dropped shape stays inside the walls, and two dropped together merge", () => {
  for (const shape of SHAPES) {
    let seed = 1;
    while (create(seed, shaped(shape)).held !== create(seed, shaped(shape)).next) seed++;
    const g = create(seed, shaped(shape));
    const tier = g.held;
    aim(g, 0);
    assert.ok(drop(g));
    // held against the wall, the whole outline is inside it, not just a circle of its size
    const left = Math.min(...g.live[0].body.vertices.map((v) => v.x));
    assert.ok(left >= -1e-9, `${shape} pokes ${-left} into the wall`);
    wait(g);
    aim(g, 0);
    assert.ok(drop(g));
    const merges = run(g, 240);
    assert.deepEqual(merges.map((m) => m.tier), [tier + 1], shape);
    for (const p of pieces(g)) assert.ok(p.x > 0 && p.x < JAR.width, `${shape} inside`);
  }
});

test("a shape counts toward the line by the top of its outline", () => {
  const g = create(16, shaped("triangle"));
  const t = 3, rr = r(t);
  // the centre is under the line; the point of the triangle is over it
  const tip = -Math.min(...outline("triangle", rr).map((p) => p.y));
  const id = place(g, t, 200, JAR.line + tip - 4);
  pin(g, id);
  // as a circle of the same size it would sit wholly under the line
  assert.ok(JAR.line + tip - 4 - rr > JAR.line);
  run(g, 130);
  assert.equal(g.over, true, "the tip over the line fills the jar");
});
