import { test } from "node:test";
import assert from "node:assert/strict";
import { bestAt, bestKey, parseBests, withBest } from "../src/lib/best.ts";

// the saved bests (#16): one record, a best per size and speed, so every score
// keeps the settings it was made with. older saves move to the settings they
// were played at: small, medium and big are sizes 1, 1.3 and 1.5, and anything
// from before sizes is size 1; all of it at speed 1, the only speed there was.
const never = () => assert.fail("only a plain-number save reads the old mark key");
const none = { score: 0, jiggled: false };

test("a best is keyed by its size step and speed step", () => {
  assert.equal(bestKey(1.5, 1.25), "1.5/1.25");
  assert.equal(bestKey(1, 1), "1.0/1.00");
  assert.equal(bestKey(3, 0.75), "3.0/0.75");
  // a float that is a step reads as that step
  assert.equal(bestKey(1.1 + 0.2, 1), "1.3/1.00");
  assert.notEqual(bestKey(1.5, 1.25), bestKey(1.5, 1.5));
  assert.notEqual(bestKey(1.5, 1.25), bestKey(1.6, 1.25));
});

test("no save, or a broken one, is no best at any setting", () => {
  for (const raw of [null, "", "nope", "{", "null", "[]", "-5", "0", "{}", "[1,2]"]) {
    const b = parseBests(raw, () => false);
    assert.deepEqual(b, {}, String(raw));
    assert.deepEqual(bestAt(b, 1.5, 1.25), none);
  }
});

test("an older plain-number best is size 1 at speed 1, with its mark from the old key", () => {
  assert.deepEqual(parseBests("40", () => true), { "1.0/1.00": { score: 40, jiggled: true } });
  assert.deepEqual(parseBests("40", () => false), { "1.0/1.00": { score: 40, jiggled: false } });
});

test("an older { score, jiggled } best is size 1 at speed 1", () => {
  assert.deepEqual(parseBests(JSON.stringify({ score: 77, jiggled: true }), never), { "1.0/1.00": { score: 77, jiggled: true } });
});

test("a best per old size moves to that size at speed 1, each its own, marks kept", () => {
  const old = { small: { score: 900, jiggled: false }, medium: { score: 300, jiggled: true }, big: { score: 120, jiggled: false } };
  const b = parseBests(JSON.stringify(old), never);
  assert.deepEqual(b, { "1.0/1.00": old.small, "1.3/1.00": old.medium, "1.5/1.00": old.big });
  assert.deepEqual(bestAt(b, 1.3, 1), { score: 300, jiggled: true });
  // the new default, 1.5 at 1.25, was never played: no best there
  assert.deepEqual(bestAt(b, 1.5, 1.25), none);
  // an old size missing or broken is just no best for it
  assert.deepEqual(parseBests(JSON.stringify({ medium: { score: 12 }, big: "x", small: { score: 0 } }), never), { "1.3/1.00": { score: 12, jiggled: false } });
});

test("a best per size and speed reads back as written, and odd keys are dropped", () => {
  const bests = { "1.5/1.25": { score: 80, jiggled: false }, "2.3/2.00": { score: 9, jiggled: true }, "1.0/0.75": { score: 400, jiggled: false } };
  assert.deepEqual(parseBests(JSON.stringify(bests), never), bests);
  const odd = { ...bests, "1.55/1.25": { score: 5 }, "9.0/1.00": { score: 5 }, "1.5/1.3": { score: 5 }, __proto__x: { score: 5 }, toString: { score: 5 } };
  assert.deepEqual(parseBests(JSON.stringify(odd), never), bests);
});

test("withBest adds or replaces one setting's best and keeps every other", () => {
  const start = parseBests(JSON.stringify({ small: { score: 50, jiggled: true } }), never);
  const one = withBest(start, 1.5, 1.25, { score: 30, jiggled: false });
  assert.deepEqual(one, { "1.0/1.00": { score: 50, jiggled: true }, "1.5/1.25": { score: 30, jiggled: false } });
  const two = withBest(one, 1.5, 1.25, { score: 31, jiggled: true });
  assert.deepEqual(two["1.5/1.25"], { score: 31, jiggled: true });
  assert.deepEqual(two["1.0/1.00"], { score: 50, jiggled: true });
  // the record never changes in place: a failed write leaves the last one whole
  assert.deepEqual(start, { "1.0/1.00": { score: 50, jiggled: true } });
  // and it round-trips through the one saved string
  assert.deepEqual(parseBests(JSON.stringify(two), never), two);
});
