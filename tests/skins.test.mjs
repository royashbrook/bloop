import { test } from "node:test";
import assert from "node:assert/strict";
import { create, JAR } from "../src/lib/engine/game.ts";
import { SHAPES } from "../src/lib/engine/shapes.ts";
import { DEFAULT_SKIN, SKINS, skinById } from "../src/lib/skins/index.ts";
import { dims } from "../src/lib/skins/types.ts";

test("there are four looks, cells first and the default", () => {
  assert.deepEqual(SKINS.map((s) => s.id), ["cells", "puppies", "kitties", "shapes"]);
  assert.equal(DEFAULT_SKIN.id, "cells");
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  assert.equal(skinById("kitties").id, "kitties");
  // a saved look that no longer exists falls back to the default
  assert.equal(skinById("dragons").id, "cells");
  assert.equal(skinById(null).id, "cells");
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
