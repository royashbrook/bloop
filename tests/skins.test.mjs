import { test } from "node:test";
import assert from "node:assert/strict";
import { create, JAR } from "../src/lib/engine/game.ts";
import { outline, SHAPES } from "../src/lib/engine/shapes.ts";
import { CALM } from "../src/lib/skins/types.ts";
import { TEXT_SIZE, TEXT_WIDTH } from "../src/lib/skins/numbers.ts";
import { DEFAULT_SKIN, SKINS, skinById } from "../src/lib/skins/index.ts";
import { dims } from "../src/lib/skins/types.ts";

test("six looks, bubbles first and the default, then numbers, then the four from before", () => {
  assert.deepEqual(SKINS.map((s) => s.id), ["bubbles", "numbers", "cells", "puppies", "kitties", "shapes"]);
  assert.equal(DEFAULT_SKIN.id, "bubbles");
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  // a saved look is kept
  for (const id of ["cells", "puppies", "kitties", "shapes", "numbers"]) assert.equal(skinById(id).id, id);
  // a saved look that no longer exists, or none, falls back to the default
  assert.equal(skinById("dragons").id, "bubbles");
  assert.equal(skinById(null).id, "bubbles");
});

test("bubbles: round bubbles that stay upright, a pastel each, with a face", () => {
  const b = skinById("bubbles");
  assert.equal(b.spin, false);
  assert.ok(b.tiers.every((t) => (t.shape ?? "circle") === "circle"));
  assert.equal(new Set(b.tiers.map((t) => t.colour)).size, 11, "a colour per tier");
  // the same face as the blobs: it draws eyes (arcs) on any piece
  let arcs = 0;
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === "arc" ? () => arcs++ : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) });
  b.face(ctx, 0, 0, 20, CALM, b.tiers[0]);
  assert.ok(arcs >= 2, "two eyes");
});

test("numbers: doubling from 2 to 2048, rounded blocks, each number drawn as written", () => {
  const n = skinById("numbers");
  assert.deepEqual(n.tiers.map((t) => t.name), ["2", "4", "8", "16", "32", "64", "128", "256", "512", "1024", "2048"]);
  assert.ok(n.tiers.every((t) => t.shape === "square"));
  for (const t of n.tiers) {
    const drawn = [];
    const ctx = { save() {}, restore() {}, fillText: (text, x, y, w) => drawn.push({ text, x, y, w }) };
    n.face(ctx, 5, 7, 30, CALM, t);
    assert.equal(drawn.length, 1, t.name);
    assert.equal(drawn[0].text, t.name);
    assert.ok(Math.abs(drawn[0].x - 5) < 1e-9 && Math.abs(drawn[0].y - 7) < 30 * 0.05, `${t.name} is centred`);
    assert.ok(/\b(800|bold)\b/.test(ctx.font) && /rounded/i.test(ctx.font), `${t.name}: a bold rounded font, ${ctx.font}`);
  }
});

test("numbers: the number fits the circle inside its block, so it never pokes out however the block turns", () => {
  // the square's flat sides are its nearest edge: the circle that fits inside
  const inner = Math.max(...outline("square", 1).map((p) => p.y));
  for (let digits = 1; digits <= 4; digits++) {
    const reach = Math.hypot(TEXT_WIDTH / 2, TEXT_SIZE[digits - 1] / 2);
    assert.ok(reach <= inner, `${digits} digits reach ${reach.toFixed(3)} of r, the block's inner circle is ${inner.toFixed(3)}`);
  }
});

for (const skin of SKINS)
  test(`${skin.id}: 11 tiers, tiny to big, each named once, with a real shape and colour`, () => {
    assert.equal(skin.tiers.length, 11);
    const names = skin.tiers.map((t) => t.name);
    assert.equal(new Set(names).size, 11, `names repeat: ${names}`);
    for (const t of skin.tiers) {
      assert.ok(t.name.length > 0 && t.name === t.name.toLowerCase(), `${t.name}: a lowercase name`);
      assert.ok(SHAPES.includes(t.shape ?? "circle"), `${t.name}: shape ${t.shape}`);
      assert.match(t.colour, /^#[0-9a-f]{6}$/, `${t.name}: colour`);
      assert.equal(typeof t.draw, "function");
      assert.ok(t.radius > 0 && t.radius * 2 < 0.5, `${t.name}: fits the jar`);
    }
    for (let i = 1; i < 11; i++)
      assert.ok(skin.tiers[i].radius > skin.tiers[i - 1].radius, `${skin.tiers[i].name} is bigger than ${skin.tiers[i - 1].name}`);
    assert.equal(typeof skin.face, "function");
    // a look that keeps its heads upright must be all circles: a turned square would not match its body
    if (!skin.spin) assert.ok(skin.tiers.every((t) => (t.shape ?? "circle") === "circle"), "upright looks are round");
    // and the engine takes it
    const g = create(1, dims(skin));
    assert.deepEqual(g.shapes, skin.tiers.map((t) => t.shape ?? "circle"));
    assert.deepEqual(g.radii, skin.tiers.map((t) => t.radius * JAR.width));
  });

test("the shapes look mixes every shape up the ladder", () => {
  const shapes = skinById("shapes").tiers.map((t) => t.shape);
  for (const s of SHAPES) assert.ok(shapes.includes(s), s);
});
