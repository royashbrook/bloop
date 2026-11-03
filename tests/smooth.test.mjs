// smooth drawing between steps (#16): render-only, keyed by piece id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, aim, create, drop, JAR, place, snapshot, step, STEP } from "../src/lib/engine/game.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { blend, lerpAngle, share, smoother } from "../src/lib/smooth.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";

const DIMS = dims(cells);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} vs ${b}`);

test("a pose is drawn a share of the way from before the last step to now", () => {
  const from = { x: 10, y: 100, angle: 0.2 };
  const to = { x: 30, y: 140, angle: 0.6 };
  assert.deepEqual(blend(from, to, 0), from);
  assert.deepEqual(blend(from, to, 1), to);
  const mid = blend(from, to, 0.5);
  close(mid.x, 20, "x");
  close(mid.y, 120, "y");
  close(mid.angle, 0.4, "angle");
  // the share never runs past either end
  assert.deepEqual(blend(from, to, -0.3), from);
  assert.deepEqual(blend(from, to, 1.7), to);
});

test("an angle turns the short way round, across the wrap", () => {
  // 3.0 to -3.0 is a short turn of about 0.28 through pi, not 6 the long way
  const half = lerpAngle(3.0, -3.0, 0.5);
  close(Math.cos(half), Math.cos(Math.PI), "cos");
  close(Math.sin(half), Math.sin(Math.PI), "sin");
  // and the other way
  close(lerpAngle(-3.0, 3.0, 0.5), -3.0 - (2 * Math.PI - 6) / 2);
  // matter keeps counting past a full turn: still the short way
  close(lerpAngle(4 * Math.PI + 0.1, 0.3, 0.5), 4 * Math.PI + 0.2);
  close(lerpAngle(0.1, 0.5, 0.25), 0.2);
});

test("a piece with no pose before the last step draws where it is", () => {
  const to = { x: 5, y: 6, angle: 7 };
  assert.deepEqual(blend(undefined, to, 0), to);
  assert.deepEqual(blend(undefined, to, 0.5), to);
});

test("in a game: the pose before the last step, by piece id; a new piece draws where it is", () => {
  const g = create(3, DIMS, 1.25);
  const s = smoother();
  aim(g, 200);
  assert.ok(drop(g));
  // dropped, no step yet: drawn where it is
  s.frame(g);
  const p = g.live[0];
  assert.deepEqual(s.pose(p, 0.5), { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle });
  for (let i = 0; i < 5; i++) step(g);
  const y0 = p.body.position.y;
  step(g);
  const y1 = p.body.position.y;
  assert.ok(y1 > y0, "falling");
  s.frame(g);
  close(s.pose(p, 0).y, y0, "alpha 0: before the last step");
  close(s.pose(p, 0.5).y, (y0 + y1) / 2, "alpha 0.5: halfway");
  close(s.pose(p, 1).y, y1, "alpha 1: now");
  s.stop();
});

test("a piece made by a merge in the last step draws where it was made, not from either parent", () => {
  // two of a kind, set down touching, join on the first step
  const g = create(1, DIMS);
  aim(g, 20);
  const r = DIMS.radii[1] * JAR.width;
  const a = place(g, 1, 200, JAR.height - r);
  const b = place(g, 1, 200 + 2 * r, JAR.height - r);
  const s = smoother();
  s.frame(g);
  step(g);
  const made = g.live.find((p) => p.tier === 2);
  assert.ok(made, "they joined");
  assert.ok(made.id !== a && made.id !== b);
  assert.ok(!g.live.some((p) => p.id === a || p.id === b));
  s.frame(g);
  const at = s.pose(made, 0.3);
  assert.deepEqual(at, { x: made.body.position.x, y: made.body.position.y, angle: made.body.angle });
  s.stop();
});

test("the share is how far the clock has got toward the next step", () => {
  const g = create(1, DIMS, 1.25);
  advance(g, 1 / 60);
  // 1.25 of a step: one step runs, a quarter waits
  close(share(g), 0.25);
  advance(g, 1 / 60);
  close(share(g), 0.5);
  g.acc = -1e-12;
  assert.equal(share(g), 0);
  g.acc = STEP * 2;
  assert.equal(share(g), 1);
});

test("drawing smooth never touches the game: a run drawn smooth replays the same as one that is not", () => {
  const play = (smooth) => {
    const g = create(21, DIMS, 1.25);
    const s = smoother();
    const hand = rng(5);
    for (let i = 0; i < 1200; i++) {
      if (i % 37 === 0) aim(g, hand() * JAR.width);
      if (i % 41 === 0) drop(g);
      advance(g, 1 / 60);
      if (smooth) {
        s.frame(g);
        for (const p of g.live) s.pose(p, share(g));
      }
    }
    s.stop();
    return snapshot(g);
  };
  const a = play(true), b = play(false);
  assert.ok(a.pieces.length > 5);
  assert.deepEqual(a, b);
});

test("a new game starts fresh: nothing carries over from the last one", () => {
  const s = smoother();
  const g1 = create(4, DIMS);
  aim(g1, 200);
  drop(g1);
  for (let i = 0; i < 10; i++) step(g1);
  s.frame(g1);
  const g2 = create(4, DIMS);
  aim(g2, 200);
  drop(g2);
  // same ids in a new game: no pose from the old one
  s.frame(g2);
  const p = g2.live[0];
  assert.deepEqual(s.pose(p, 0.5), { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle });
  // and the old game's steps no longer write here
  for (let i = 0; i < 3; i++) step(g1);
  s.frame(g2);
  assert.deepEqual(s.pose(p, 0.5), { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle });
  s.stop();
});
