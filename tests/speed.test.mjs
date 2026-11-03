import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "matter-js";
import { advance, aim, create, drop, jiggle, JAR, OVER_AFTER, pieces, place, snapshot } from "../src/lib/engine/game.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { bubbles } from "../src/lib/skins/bubbles.ts";
import { shapes } from "../src/lib/skins/shapes.ts";
import { dims } from "../src/lib/skins/types.ts";
import { DEFAULT_SPEED, FIRST_SPEED, readSpeed, snapSpeed, SPEED_MAX, SPEED_MIN, SPEED_STEPS, speedLabel, speedWord } from "../src/lib/speeds.ts";
import { SIZE_MAX } from "../src/lib/sizes.ts";

// speed (#16): speed s runs s times 60 fixed 1/60 s steps a real second. the
// step, gravity and every piece are the same at every speed, so a game is the
// same steps, only sooner; the full-jar clock counts real seconds.
const FRAME = 1 / 60;
const frames = (g, n, each) => {
  for (let i = 0; i < n; i++) {
    advance(g, FRAME);
    each?.(i);
  }
};

test("the speed slider runs 0.75 to 2 in quarters, 1.25 by default, and 1 is the speed before speeds", () => {
  assert.deepEqual(SPEED_STEPS, [0.75, 1, 1.25, 1.5, 1.75, 2]);
  assert.equal(SPEED_MIN, 0.75);
  assert.equal(SPEED_MAX, 2);
  assert.equal(DEFAULT_SPEED, 1.25);
  assert.equal(FIRST_SPEED, 1);
  assert.equal(snapSpeed(1.3), 1.25);
  assert.equal(snapSpeed(0.1), 0.75);
  assert.equal(snapSpeed(7), 2);
  assert.equal(readSpeed(null), 1.25);
  assert.equal(readSpeed("1.75"), 1.75);
  assert.equal(readSpeed("fast"), 1.25);
  assert.deepEqual(SPEED_STEPS.map(speedLabel), ["0.75", "1", "1.25", "1.5", "1.75", "2"]);
  assert.equal(new Set(SPEED_STEPS.map(speedWord)).size, SPEED_STEPS.length);
});

test("a speed must be a positive number", () => {
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => create(1, dims(bubbles), bad));
  assert.equal(create(1, dims(bubbles)).speed, 1);
});

test("a second of real time is speed times 60 steps", () => {
  for (const speed of SPEED_STEPS) {
    const g = create(3, dims(bubbles, 1.5), speed);
    frames(g, 60);
    assert.equal(g.steps, Math.round(60 * speed), `speed ${speed}`);
    // a slow frame catches up the same way
    const h = create(3, dims(bubbles, 1.5), speed);
    for (let i = 0; i < 20; i++) advance(h, 0.05);
    assert.equal(h.steps, Math.round(60 * speed), `speed ${speed}, 20 fps`);
  }
});

/** a scripted player on real frames: aims and drops on set frames */
function played(seed, size, speed, n = 900) {
  const g = create(seed, dims(bubbles, size), speed);
  const hand = rng(seed + 7);
  frames(g, n, (i) => {
    if (i % 23 === 0) aim(g, hand() * JAR.width);
    if (i % 29 === 0) drop(g);
  });
  return g;
}

test("the same seed, size, speed and inputs replay the same game, at every speed", () => {
  for (const speed of SPEED_STEPS)
    for (const size of [1, 1.5, SIZE_MAX]) {
      const a = snapshot(played(9, size, speed));
      const b = snapshot(played(9, size, speed));
      assert.ok(a.pieces.length > 3, `${size} ${speed}: a real game`);
      assert.deepEqual(a, b, `size ${size} speed ${speed}`);
    }
  // and the speed matters: the same frames are more of the game
  assert.ok(snapshot(played(9, 1.5, 2)).steps > snapshot(played(9, 1.5, 1)).steps);
});

test("a speed is the same steps, only sooner: n frames at 2 play like 2n frames at 1", () => {
  const fast = create(4, dims(bubbles, 1.5), 2);
  const slow = create(4, dims(bubbles, 1.5), 1);
  const hand = rng(5);
  for (let i = 0; i < 400; i++) {
    if (i % 25 === 0) {
      const x = hand() * JAR.width;
      aim(fast, x);
      aim(slow, x);
      drop(fast);
      drop(slow);
    }
    advance(fast, FRAME);
    advance(slow, FRAME);
    advance(slow, FRAME);
  }
  assert.ok(fast.score > 0, "merges happened");
  assert.deepEqual(pieces(fast), pieces(slow));
  assert.equal(fast.score, slow.score);
});

for (const skin of [bubbles, shapes])
  for (const size of [1, SIZE_MAX])
    test(`${skin.id} at size ${size} and top speed: nothing goes through a wall or the floor, even shaken`, () => {
      const g = create(12, dims(skin, size), SPEED_MAX);
      const hand = rng(12);
      let worst = 0;
      frames(g, 60 * 40, (i) => {
        if (g.over) return;
        if (g.cooldown === 0) {
          aim(g, hand() * JAR.width);
          drop(g);
        }
        if (i % 90 === 45) jiggle(g, 1);
        for (const p of pieces(g)) {
          // how far the centre is past a wall or the floor: a piece pushed in that deep has gone through
          worst = Math.max(worst, -p.x, p.x - JAR.width, p.y - JAR.height);
        }
      });
      assert.ok(g.drops > 10, `${g.drops} drops`);
      assert.ok(worst <= 0, `a piece's centre went ${worst} units past a wall or the floor`);
    });

test("at top speed the pile settles and holds still: no jitter", () => {
  const g = create(8, dims(bubbles, 1.5), SPEED_MAX);
  const hand = rng(8);
  while (g.drops < 40 && !g.over) {
    if (g.cooldown === 0) {
      aim(g, hand() * JAR.width);
      drop(g);
    }
    advance(g, FRAME);
  }
  assert.ok(pieces(g).length > 10, `${pieces(g).length} pieces`);
  frames(g, 60 * 10);
  const rest = pieces(g);
  const fastest = Math.max(...rest.map((p) => Math.hypot(p.vx, p.vy)));
  assert.ok(fastest < 0.05, `fastest piece still moving at ${fastest}`);
  // and a second later every piece is where it was, within a tenth of a unit
  frames(g, 60);
  const later = new Map(pieces(g).map((p) => [p.id, p]));
  for (const p of rest) assert.ok(Math.hypot(later.get(p.id).x - p.x, later.get(p.id).y - p.y) < 0.1, `piece ${p.id} crept`);
});

test("the full-jar clock is two real seconds at every speed", () => {
  for (const speed of SPEED_STEPS) {
    const g = create(1, dims(bubbles, 1.5), speed);
    assert.equal(g.overAfter, Math.round(OVER_AFTER * speed));
    const id = place(g, 0, JAR.width / 2, JAR.line - 20);
    Matter.Body.setStatic(g.live.find((p) => p.id === id).body, true);
    frames(g, 119);
    assert.ok(g.danger > 0 && !g.over, `speed ${speed}: warning up at 1.98 s, not over`);
    frames(g, 1);
    assert.ok(g.over, `speed ${speed}: over at 2 s`);
  }
});

test("a fresh drop's grace is the time it takes to fall, the same steps at every speed", () => {
  for (const speed of SPEED_STEPS)
    for (const tier of [0, 4]) {
      const g = create(7, dims(bubbles, 1.5), speed);
      g.held = tier;
      aim(g, JAR.width / 2);
      drop(g);
      frames(g, 300, () => assert.equal(g.danger, 0, `speed ${speed}: a falling drop never warns`));
      assert.ok(pieces(g)[0].y > JAR.height / 2, "it reached the bottom");
    }
});
