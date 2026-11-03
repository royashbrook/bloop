// the faces' moments on the two new looks (#17): bubbles shows every mood with
// the blob face; numbers has no face, so a bump makes its number jelly and comfy
// sinks it in a touch. render-only: these only draw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { piece } from "../src/lib/draw.ts";
import { bubbles } from "../src/lib/skins/bubbles.ts";
import { numbers } from "../src/lib/skins/numbers.ts";

/** a canvas that writes down every call, with its numbers rounded */
function log() {
  const calls = [];
  const ctx = new Proxy(
    { getTransform: () => ({ a: 1, b: 0 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) },
    {
      get(o, k) {
        if (k in o) return o[k];
        return (...args) => calls.push(`${String(k)}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : a)).join(",")})`);
      },
      set(o, k, v) {
        calls.push(`${String(k)}=${v}`);
        return true;
      },
    },
  );
  return { ctx, calls };
}
const face = (mood, extra = {}) => ({ blink: false, lx: 0, ly: 0, mood, ...extra });
function drawFace(skin, tier, f) {
  const { ctx, calls } = log();
  skin.face(ctx, 0, 0, 30, f, skin.tiers[tier]);
  return calls.join(";");
}

test("bubbles: hello, comfy, bump and oof each draw their own face, none the calm one", () => {
  const moods = ["calm", "hello", "comfy", "bump", "oof"];
  for (const tier of [0, 4, 10]) {
    const drawn = moods.map((m) => drawFace(bubbles, tier, face(m, m === "hello" ? { lx: 1 } : {})));
    assert.equal(new Set(drawn).size, moods.length, `tier ${tier}: two moods draw the same`);
  }
});

test("numbers: the number stays put for calm, hello and a bump with no jolt (reduced motion)", () => {
  const calm = drawFace(numbers, 3, face("calm"));
  assert.ok(calm.includes("fillText(16"), calm);
  for (const f of [face("hello", { lx: 1 }), face("comfy"), face("bump"), face("oof"), face("squish")]) {
    assert.equal(drawFace(numbers, 3, f), calm, f.mood);
  }
  assert.ok(!calm.includes("scale("));
});

test("numbers: a bump squashes the number wide and short, then stretches it, a hard one more", () => {
  const scaleOf = (s) => {
    const m = /scale\(([\d.]+),([\d.]+)\)/.exec(s);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const squash = scaleOf(drawFace(numbers, 3, face("bump", { jolt: 1 })));
  assert.ok(squash && squash[0] > 1 && squash[1] < 1, `squash ${squash}`);
  const stretch = scaleOf(drawFace(numbers, 3, face("bump", { jolt: -0.5 })));
  assert.ok(stretch && stretch[0] < 1 && stretch[1] > 1, `stretch ${stretch}`);
  const oof = scaleOf(drawFace(numbers, 3, face("oof", { jolt: 1 })));
  assert.ok(oof[0] > squash[0] && oof[1] < squash[1], `oof ${oof} vs bump ${squash}`);
  // the block itself never squashes: only the face is drawn under the jolt
  const { ctx, calls } = log();
  numbers.tiers[3].draw.call(numbers.tiers[3], ctx, 0, 0, 30);
  assert.ok(!calls.some((c) => c.startsWith("scale(")));
});

test("numbers: getting comfy sinks the number in a touch, like every face", () => {
  const scales = (f) => {
    const { ctx, calls } = log();
    piece(ctx, numbers, 3, 0, 0, 30, 0, f);
    return calls.filter((c) => c.startsWith("scale("));
  };
  assert.deepEqual(scales(face("comfy")), []);
  const sunk = scales(face("comfy", { settle: 1 }));
  assert.equal(sunk.length, 1);
  assert.equal(sunk[0], "scale(1.060,0.940)");
});
