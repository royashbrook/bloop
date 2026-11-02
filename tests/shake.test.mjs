// shake detection (#6): a hard jolt jiggles, walking does not, and one jiggle per gap
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAKE_AT, SHAKE_GAP_MS, shaker } from "../src/lib/shake.ts";

const motion = (x, y = 0, z = 0) => ({ acceleration: { x, y, z } });
const withGravity = (x, y, z) => ({ acceleration: null, accelerationIncludingGravity: { x, y, z } });

test("a hard jolt is a shake; walking, bumps and a still phone are not", () => {
  let t = 0;
  const got = [];
  const on = shaker((k) => got.push(k), () => t);
  // walking: peaks of a few m/s^2, for ten seconds
  for (let i = 0; i < 600; i++, t += 16) on(motion(4 * Math.sin(i / 3), 3 * Math.cos(i / 5), 2));
  // a phone lying still, gravity only
  for (let i = 0; i < 60; i++, t += 16) on(withGravity(0, 0, 9.81));
  assert.deepEqual(got, []);
  t += 1000;
  on(motion(SHAKE_AT + 5, 4, 0));
  assert.equal(got.length, 1);
  assert.ok(got[0] >= 0.6 && got[0] <= 1, `strength ${got[0]}`);
  // a jolt seen only with gravity in it still counts
  t += 1000;
  on(withGravity(0, 26, 9.81));
  assert.equal(got.length, 2);
});

test("one jiggle per gap, however hard the shaking", () => {
  let t = 0;
  const got = [];
  const on = shaker((k) => got.push(k), () => t);
  // a second of wild shaking, a reading every 16 ms
  for (let i = 0; i < 63; i++, t += 16) on(motion(40, -30, 20));
  assert.equal(got.length, Math.ceil(1000 / SHAKE_GAP_MS));
  assert.ok(got.every((k) => k === 1), "a wild shake is full strength");
});
