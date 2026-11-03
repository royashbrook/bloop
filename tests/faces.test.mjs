// the faces (#4): render-only, driven by real time, seeded per piece id.
import { test } from "node:test";
import assert from "node:assert/strict";
import Matter from "matter-js";
import { aim, create, drop, JAR, place, snapshot, step } from "../src/lib/engine/game.ts";
import { rng } from "../src/lib/engine/rng.ts";
import { BLINK_MS, COMFY_MS, faces, HAPPY_STEPS, SETTLE_MS } from "../src/lib/faces.ts";
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

// the moments (#17): a hello, getting comfy, and a bump

/** step the game and the faces together, frame by frame; collect each piece's moods in order */
function play(f, g, from, ms) {
  const moods = new Map();
  for (let t = from; t < from + ms; t += FRAME) {
    step(g);
    f.update(g, t, false);
    for (const p of f.report(g).list) {
      const seen = moods.get(p.id) ?? [];
      if (seen.at(-1) !== p.mood) seen.push(p.mood);
      moods.set(p.id, seen);
    }
  }
  return moods;
}
/** a piece pinned on the floor, and one dropped onto it from a height (edge to edge) */
function fall(height, seed = 1) {
  const g = create(seed, DIMS);
  aim(g, 20); // the held piece waits off to the side
  const floor = place(g, 3, 250, JAR.height - r(3));
  pin(g, floor);
  const f = faces();
  f.update(g, 0, false);
  const faller = place(g, 1, 250, JAR.height - 2 * r(3) - r(1) - height);
  return { g, f, floor, faller };
}

test("a piece hit by a fast faller makes a face: a soft hit a surprised o, a hard one >.<", () => {
  const soft = fall(30);
  const s = play(soft.f, soft.g, FRAME, 2000);
  assert.ok(s.get(soft.floor).includes("bump"), `soft: ${s.get(soft.floor)}`);
  assert.ok(!s.get(soft.floor).includes("oof"), `soft: ${s.get(soft.floor)}`);
  const hard = fall(300);
  const h = play(hard.f, hard.g, FRAME, 2000);
  assert.ok(h.get(hard.floor).includes("oof"), `hard: ${h.get(hard.floor)}`);
  // the faller felt it too
  assert.ok(h.get(hard.faller).includes("oof"), `faller: ${h.get(hard.faller)}`);
  assert.equal(hard.f.report(hard.g).counts.bump, 2);
});

test("a piece that comes to rest against another, or is set down touching, makes no bump face", () => {
  // set down a hair apart: they meet, slowly
  const g = create(2, DIMS);
  aim(g, 20);
  const low = place(g, 3, 250, JAR.height - r(3));
  const top = place(g, 1, 250, JAR.height - 2 * r(3) - r(1) - 0.5);
  const side = place(g, 2, 250 + r(3) + r(2) + 0.5, JAR.height - r(2));
  const f = faces();
  f.update(g, 0, false);
  const seen = play(f, g, FRAME, 3000);
  for (const id of [low, top, side]) {
    assert.ok(!seen.get(id).includes("bump") && !seen.get(id).includes("oof"), `piece ${id}: ${seen.get(id)}`);
  }
  assert.equal(f.report(g).counts.bump, 0);
});

test("a piece that moved gets comfy once it comes to rest, and not before", () => {
  // set down from a little way up: it moves, but lands too softly for a bump
  const { g, f, faller } = fall(8);
  const me = g.live.find((p) => p.id === faller);
  let movedLast = -1, comfyFirst = -1, still = 0, done = false;
  for (let t = FRAME; t < 4000; t += FRAME) {
    step(g);
    f.update(g, t, false);
    const speed = Math.hypot(me.body.velocity.x, me.body.velocity.y);
    if (speed > 0.15 && comfyFirst < 0) movedLast = t;
    const mood = byId(f.report(g), faller).mood;
    if (mood === "comfy" && comfyFirst < 0) comfyFirst = t;
    // the first stretch of comfy (a snuggle may come later, on its own)
    if (mood === "comfy" && !done) still++;
    else if (comfyFirst > 0) done = true;
  }
  assert.equal(f.report(g).counts.bump, 0);
  assert.ok(comfyFirst > 0, "it got comfy");
  // only once it had been still for a beat
  assert.ok(movedLast > 0 && comfyFirst - movedLast >= SETTLE_MS - FRAME, `comfy at ${comfyFirst}, last moved ${movedLast}`);
  assert.ok(Math.abs(still * FRAME - COMFY_MS) <= 2 * FRAME, `comfy for ${still * FRAME} ms`);
});

test("a piece that never moved never gets comfy from settling", () => {
  const { g } = pair();
  const f = faces();
  const seen = watch(f, g, 0, 20000);
  for (const [id, s] of seen) assert.ok(!s.moods.has("comfy"), `piece ${id} got comfy`);
  assert.equal(f.report(g).counts.comfy, 0);
});

/** two pinned pieces side by side, a hair apart */
function neighbours(seed = 1) {
  const g = create(seed, DIMS);
  g.over = true;
  const a = place(g, 3, 150, JAR.height - r(3));
  const b = place(g, 3, 150 + 2 * r(3) + 4, JAR.height - r(3));
  pin(g, a);
  pin(g, b);
  return { g, a, b };
}

test("neighbours look at each other, often both at once: a hello", () => {
  const { g, a, b } = neighbours();
  const f = faces();
  let both = 0, one = 0;
  const MIN = 3;
  for (let t = 0; t < MIN * 60000; t += FRAME) {
    f.update(g, t, false);
    const rep = f.report(g);
    const A = byId(rep, a), B = byId(rep, b);
    if (A.mood === "hello" || B.mood === "hello") {
      // a hello is always mutual: both say it, each looking at the other
      assert.equal(A.mood, B.mood, `at ${t}`);
      assert.equal(A.with, b);
      assert.equal(B.with, a);
      both++;
    } else if (A.with || B.with) one++;
  }
  const { counts } = f.report(g);
  const perMinute = counts.hello / MIN;
  // a moment every 2 to 5.5 s each, about two thirds a look at the neighbour, nearly half looked back
  assert.ok(perMinute >= 5 && perMinute <= 14, `${perMinute} hellos a minute`);
  assert.ok(counts.glance >= counts.hello * 1.5, `glances ${counts.glance}, hellos ${counts.hello}`);
  assert.ok(both > 0 && one > 0);
  // the eyes really meet: by the end of a hello the left looks right and the right looks left
  const f2 = faces();
  let met = false;
  for (let t = 0; t < 60000 && !met; t += FRAME) {
    f2.update(g, t, false);
    const rep = f2.report(g);
    const A = byId(rep, a), B = byId(rep, b);
    if (A.mood === "hello" && A.lx > 0.8 && B.lx < -0.8) met = true;
  }
  assert.ok(met, "their eyes met");
});

test("pieces far apart never say hello; the moments are seeded by piece id", () => {
  const { g } = pair();
  const f = faces();
  watch(f, g, 0, 60000);
  const { counts } = f.report(g);
  assert.equal(counts.hello, 0);
  assert.equal(counts.glance, 0);
  assert.ok(counts.around > 5, `looked around ${counts.around} times`);
  const trace = (seed) => {
    const { g } = neighbours(seed);
    const f = faces();
    const out = [];
    for (let t = 0; t < 30000; t += FRAME) {
      f.update(g, t, false);
      out.push(f.report(g).list.map((p) => `${p.mood}${p.with}`).join());
    }
    return out;
  };
  assert.deepEqual(trace(1), trace(8));
});

test("reduced motion: no glance, no hello, no look around; a bump and comfy still show, still", () => {
  const { g } = neighbours();
  const f = faces();
  watch(f, g, 0, 30000, true);
  const { counts } = f.report(g);
  assert.deepEqual([counts.glance, counts.hello, counts.around, counts.snuggle, counts.look], [0, 0, 0, 0, 0]);
  const hard = fall(300);
  const moods = new Map();
  for (let t = FRAME; t < 4000; t += FRAME) {
    step(hard.g);
    hard.f.update(hard.g, t, true);
    for (const p of hard.f.report(hard.g).list) (moods.get(p.id) ?? moods.set(p.id, new Set()).get(p.id)).add(p.mood);
    for (const p of hard.g.live) assert.equal(hard.f.get(p.id).settle ?? 0, 0);
  }
  assert.ok(moods.get(hard.floor).has("oof"));
  assert.ok(moods.get(hard.faller).has("comfy"));
});

test("a moment never moves a blink: close neighbours blink just as far-apart ones do", () => {
  const blinks = ({ g }) => {
    const f = faces();
    const out = [];
    for (let t = 0; t < 20000; t += FRAME) {
      f.update(g, t, false);
      out.push(f.report(g).list.map((p) => p.blink).join());
    }
    return { out, counts: f.report(g).counts };
  };
  const near = blinks(neighbours()), far = blinks(pair());
  const { glance, around, snuggle } = near.counts;
  assert.ok(glance > 0 && glance + around + snuggle > 5, JSON.stringify(near.counts));
  assert.deepEqual(near.out, far.out);
});
