// the sounds (#18), as numbers: tone() maps a cue, a tier and a chain step to a
// sound, so the design is pinned here without any audio at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAIN_CAP, tone } from "../src/lib/sound.ts";

const MERGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const key = (t) => JSON.stringify(t);

test("every merge tier has its own bloop", () => {
  const all = MERGES.map((k) => tone("merge", k));
  assert.equal(new Set(all.map(key)).size, MERGES.length);
  // and not just a different number somewhere: each differs in pitch and length
  assert.equal(new Set(all.map((t) => Math.round(t.from))).size, MERGES.length);
  assert.equal(new Set(all.map((t) => t.length.toFixed(3))).size, MERGES.length);
});

test("pitch goes down as the tier goes up, length goes up, and the top tier is the longest", () => {
  for (const k of MERGES.slice(1)) {
    const a = tone("merge", k - 1), b = tone("merge", k);
    assert.ok(b.from < a.from, `tier ${k} starts lower than ${k - 1}`);
    assert.ok(b.to < a.to, `tier ${k} ends lower than ${k - 1}`);
    assert.ok(b.length > a.length, `tier ${k} is longer than ${k - 1}`);
  }
  const top = tone("merge", 10);
  for (const k of MERGES.slice(0, -1)) assert.ok(top.length > tone("merge", k).length);
  for (const k of [0, 1, 2, 3, 4]) assert.ok(top.length > tone("drop", k).length);
});

test("a bloop rises; small ones are light and bright, the big ones a wobbly glumph with a body and a soft pop", () => {
  for (const k of MERGES) {
    const t = tone("merge", k);
    assert.ok(t.to > t.from, `tier ${k} rises`);
  }
  const small = tone("merge", 1), big = tone("merge", 10);
  assert.ok(small.from > 800 && small.length < 0.2);
  assert.ok(small.bright > big.bright);
  assert.deepEqual([small.wobble, small.body, small.pop, small.blubs], [0, 0, 0, 0]);
  assert.ok(big.from < 150 && big.wobble > 0.1 && big.body > 0.5 && big.pop > 0 && big.blubs >= 2);
  // soft: nothing is loud, and a pop is gentle
  for (const k of MERGES) {
    const t = tone("merge", k);
    assert.ok(t.level <= 0.8 && t.pop <= 0.5);
    // the lowest pitch any part plays stays where a phone speaker can still say something
    assert.ok(t.from / 2 > 50);
  }
});

test("a drop is a soft plop: short, gliding down, quieter than any merge", () => {
  for (const k of [0, 1, 2, 3, 4]) {
    const d = tone("drop", k);
    assert.ok(d.to < d.from && d.length < 0.15);
    for (const m of MERGES) assert.ok(d.level < tone("merge", m).level);
  }
  assert.ok(tone("drop", 4).from < tone("drop", 0).from);
});

test("a chain steps up a little each time, and stops stepping at the cap", () => {
  for (const k of MERGES) {
    const steps = [0, 1, 2, 3, 4, 5, 9, 50].map((c) => tone("merge", k, c));
    for (let c = 1; c <= CHAIN_CAP; c++) assert.ok(steps[c].from > steps[c - 1].from, `tier ${k} step ${c}`);
    // two semitones a step, never more than the cap's worth
    assert.ok(Math.abs(steps[1].from / steps[0].from - 2 ** (2 / 12)) < 1e-9);
    for (const t of steps.slice(CHAIN_CAP + 1)) assert.deepEqual(t, steps[CHAIN_CAP]);
    assert.ok(steps[CHAIN_CAP].level === steps[0].level, "a chain never gets louder");
  }
});

test("a new biggest and two of the biggest gone get a sparkle; a plain merge and a drop do not", () => {
  assert.equal(tone("merge", 6).sparkle, false);
  assert.equal(tone("drop", 2).sparkle, false);
  assert.equal(tone("new", 6).sparkle, true);
  const vanish = tone("vanish", 10);
  assert.equal(vanish.sparkle, true);
  assert.ok(vanish.length > tone("merge", 10).length);
});

// the player, with a stand-in for web audio whose clock the test moves by hand
function fake() {
  const log = { starts: [], clock: 0 };
  const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime() {} });
  const node = (extra) => ({ connect: (n) => n, ...extra });
  globalThis.document = { hidden: false };
  globalThis.AudioContext = class {
    state = "running";
    sampleRate = 8000;
    destination = node({});
    get currentTime() { return log.clock; }
    resume() { this.state = "running"; return Promise.resolve(); }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
    createBuffer(_c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
    createBufferSource() { return node({ start() {}, stop() {} }); }
    createOscillator() {
      const o = node({ type: "sine", frequency: param() });
      o.start = () => o.type === "sine" && log.starts.push(o.frequency.value);
      o.stop = () => {};
      return o;
    }
  };
  return log;
}
const merge = (tier) => ({ tier, vanish: false, first: false, big: false });

test("at most eight sounds at once: a pile of merges in one frame plays eight, the rest are let go", async () => {
  const { createSound, MAX_VOICES } = await import("../src/lib/sound.ts");
  const log = fake();
  const s = createSound(true);
  s.wake();
  s.merges(Array.from({ length: 12 }, () => merge(1)));
  assert.equal(MAX_VOICES, 8);
  assert.equal(s.report().played, MAX_VOICES);
  assert.equal(s.report().voices, MAX_VOICES);
  // once they ring out there is room again
  log.clock = 5;
  s.merges([merge(1)]);
  assert.equal(s.report().played, MAX_VOICES + 1);
});

test("merges close together step up as a chain; a pause starts it over", async () => {
  const { createSound } = await import("../src/lib/sound.ts");
  const log = fake();
  const s = createSound(true);
  s.wake();
  const at = (t) => {
    log.clock = t;
    log.starts.length = 0;
    s.merges([merge(3)]);
    return log.starts[0];
  };
  const steps = [0, 0.3, 0.6, 0.9].map(at);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(steps[i] - tone("merge", 3, i).from) < 1e-6, `step ${i}`);
  assert.ok(Math.abs(at(3) - tone("merge", 3, 0).from) < 1e-6, "a pause starts over");
});

test("muted, nothing plays and no audio is made", async () => {
  const { createSound } = await import("../src/lib/sound.ts");
  let made = 0;
  fake();
  const Real = globalThis.AudioContext;
  globalThis.AudioContext = class extends Real { constructor() { super(); made++; } };
  const s = createSound(false);
  s.wake();
  s.drop(2);
  s.merges([merge(4)]);
  assert.equal(made, 0);
  assert.equal(s.report().played, 0);
});
