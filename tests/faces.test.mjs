// the faces (#4): render-only, driven by real time, seeded per piece id.
import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "matter-js";
import { aim, create, drop, JAR, place, snapshot, step } from "../src/lib/engine/game.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { BLINK_MS, faces, HAPPY_STEPS } from "../src/lib/faces.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";

const DIMS = dims(cells);
const r = (t) => DIMS.radii[t] * JAR.width;
const FRAME = 1000 / 60;
const pin = (g, id) => Matter.Body.setStatic(g.live.find((p) => p.id === id).body, true);
const byId = (rep, id) => rep.list.find((f) => f.id === id);
/** a pinned pair on the floor, apart, so nothing moves or merges */
function pair(seed = 1) {
  const g = create(seed, DIMS);
  g.over = true; // no held piece to watch
  const a = place(g, 2, 100, JAR.height - r(2));
  const b = place(g, 3, 300, JAR.height - r(3));
  pin(g, a);
  pin(g, b);
  return { g, a, b };
}
/** run the faces for ms of frames, and collect what each piece did */
function watch(f, g, from, ms, still = false) {
  const seen = new Map();
  for (let t = from; t < from + ms; t += FRAME) {
    f.update(g, t, still);
    for (const p of f.report(g).list) {
      const s = seen.get(p.id) ?? { blinkFrames: 0, blinks: 0, shut: false, moods: new Set(), look: 0 };
      if (p.blink && !s.shut) s.blinks++;
      if (p.blink) s.blinkFrames++;
      s.shut = p.blink;
      s.moods.add(p.mood);
      s.look = Math.max(s.look, Math.abs(p.lx) + Math.abs(p.ly));
      seen.set(p.id, s);
    }
  }
  return seen;
}

test("faces never touch the game: a run watched by faces replays the same as one that is not", () => {
  const play = (watched) => {
    const g = create(21, DIMS);
    const f = faces();
    const hand = rng(5);
    for (let i = 0; i < 1500; i++) {
      if (i % 37 === 0) aim(g, hand() * JAR.width);
      if (i % 41 === 0) drop(g);
      step(g);
      if (watched) f.update(g, i * FRAME, false);
    }
    return snapshot(g);
  };
  const a = play(true), b = play(false);
  assert.ok(a.pieces.length > 5);
  assert.deepEqual(a, b);
});

test("each piece blinks every 2 to 6 seconds, about 120 ms at a time", () => {
  const { g } = pair();
  const seen = watch(faces(), g, 1000, 12500);
  for (const [id, s] of seen) {
    // 12.5 s holds at least two 6 s gaps and at most six 2 s ones
    assert.ok(s.blinks >= 2 && s.blinks <= 6, `piece ${id} blinked ${s.blinks} times`);
    const frames = s.blinkFrames / s.blinks;
    assert.ok(Math.abs(frames * FRAME - BLINK_MS) <= FRAME * 1.5, `piece ${id} blinks for ${frames} frames`);
  }
});

test("blinks are seeded by piece id: the same pieces at the same times blink the same", () => {
  const one = pair(), two = pair(9);
  const trace = (f, g) => {
    const out = [];
    for (let t = 0; t < 8000; t += FRAME) {
      f.update(g, t, false);
      out.push(f.report(g).list.map((p) => p.blink));
    }
    return out;
  };
  assert.deepEqual(trace(faces(), one.g), trace(faces(), two.g));
});

test("eyes glance toward the nearest neighbour", () => {
  const { g, a, b } = pair();
  const f = faces();
  watch(f, g, 0, 1000);
  const rep = f.report(g);
  assert.ok(byId(rep, a).lx > 0.8, `the left one looks right: ${byId(rep, a).lx}`);
  assert.ok(byId(rep, b).lx < -0.8, `the right one looks left: ${byId(rep, b).lx}`);
});

test("eyes look up at the piece about to drop when it hangs close above", () => {
  const g = create(3, DIMS);
  const id = place(g, 4, JAR.width / 2, JAR.dropY + 90);
  pin(g, id);
  aim(g, JAR.width / 2);
  const f = faces();
  watch(f, g, 0, 1000);
  const me = byId(f.report(g), id);
  assert.ok(me.ly < -0.8 && Math.abs(me.lx) < 0.2, `looks up: ${me.lx}, ${me.ly}`);
});

test("a piece squints with a bigger one resting on it, and relaxes when it goes", () => {
  const g = create(4, DIMS);
  g.over = true;
  const small = place(g, 1, 100, JAR.height - r(1));
  const big = place(g, 6, 100, JAR.height - 2 * r(1) - r(6) + 0.5);
  // a small one touching a big one BESIDE it on the floor (the big centre is higher) stays calm
  const wall = place(g, 6, 300, JAR.height - r(6));
  const side = place(g, 1, 300 - Math.sqrt((r(6) + r(1) + 0.5) ** 2 - (r(6) - r(1)) ** 2), JAR.height - r(1));
  for (const id of [small, big, wall, side]) pin(g, id);
  const f = faces();
  watch(f, g, 0, 200);
  assert.equal(byId(f.report(g), small).mood, "squish");
  assert.equal(byId(f.report(g), side).mood, "calm");
  Matter.Body.setPosition(g.live.find((p) => p.id === big).body, { x: 60, y: 200 });
  watch(f, g, 200, 400);
  assert.equal(byId(f.report(g), small).mood, "calm");
});

test("a piece just made by a merge beams, then settles", () => {
  const g = create(5, DIMS);
  place(g, 2, 200, JAR.height - r(2));
  place(g, 2, 200 + 2 * r(2) - 2, JAR.height - r(2));
  step(g);
  const [made] = g.live;
  const f = faces();
  f.update(g, 0, false);
  assert.equal(byId(f.report(g), made.id).mood, "happy");
  for (let i = 0; i < HAPPY_STEPS; i++) step(g);
  f.update(g, 1000, false);
  assert.notEqual(byId(f.report(g), made.id).mood, "happy");
});

test("reduced motion: no blinking and no glancing, the moods still show", () => {
  const { g } = pair();
  const f = faces();
  const seen = watch(f, g, 0, 13000, true);
  for (const [id, s] of seen) {
    assert.equal(s.blinks, 0, `piece ${id} blinked`);
    assert.equal(s.look, 0, `piece ${id} glanced`);
  }
  assert.equal(f.report(g).reduced, true);
  // a squish still shows, as a still face
  const h = create(4, DIMS);
  h.over = true;
  const small = place(h, 1, 200, JAR.height - r(1));
  pin(h, small);
  pin(h, place(h, 6, 200, JAR.height - 2 * r(1) - r(6) + 0.5));
  f.update(h, 0, true);
  assert.equal(byId(f.report(h), small).mood, "squish");
});
