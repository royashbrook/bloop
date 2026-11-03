// the edge you see is the edge that touches (#5): no look may draw past its
// piece's outline, or two pieces would look touching while their bodies are not.
// a recording canvas checks every fill, stroke and clip of every tier and every
// face mood against the outline the engine builds its body from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JAR } from "../src/lib/engine/game.ts";
import { outline } from "../src/lib/engine/shapes.ts";
import { SKINS } from "../src/lib/skins/index.ts";

/** how far a point (with a pad round it) pokes past the outline; <= 0 is inside */
function poke(shape, r, x, y, pad) {
  const pts = outline(shape, r);
  if (!pts) return Math.hypot(x, y) + pad - r;
  let worst = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    // outward normal of a clockwise-on-screen edge
    let nx = b.y - a.y, ny = a.x - b.x;
    const len = Math.hypot(nx, ny);
    nx /= len;
    ny /= len;
    if (nx * a.x + ny * a.y < 0) (nx = -nx), (ny = -ny);
    worst = Math.max(worst, (x - a.x) * nx + (y - a.y) * ny + pad);
  }
  return worst;
}

/**
 * moves: a face may squash itself (numbers on a bump): translate and scale are
 * followed, so every point is checked where it really lands. a body may not move.
 */
function recorder(shape, r, where, moves = false) {
  let path = [], clipped = false;
  // the canvas's own scale and shift: x' = sx x + tx, y' = sy y + ty
  let m = { sx: 1, sy: 1, tx: 0, ty: 0 };
  const at = (x, y, pad) => ({ x: m.sx * x + m.tx, y: m.sy * y + m.ty, pad: pad * Math.max(Math.abs(m.sx), Math.abs(m.sy)) });
  const stack = [];
  const fails = [];
  const check = (what, extra = 0) => {
    for (const p of path) {
      const d = poke(shape, r, p.x, p.y, p.pad + extra);
      if (d > 1e-6) fails.push(`${where}: ${what} reaches ${d.toFixed(3)} past the edge at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
  };
  const ctx = {
    lineWidth: 1,
    fillStyle: "",
    strokeStyle: "",
    lineCap: "",
    lineJoin: "",
    beginPath: () => (path = []),
    closePath() {},
    moveTo: (x, y) => path.push(at(x, y, 0)),
    lineTo: (x, y) => path.push(at(x, y, 0)),
    // a curve stays inside the hull of its points
    quadraticCurveTo: (cx, cy, x, y) => path.push(at(cx, cy, 0), at(x, y, 0)),
    arc: (x, y, rad) => path.push(at(x, y, rad)),
    ellipse: (x, y, rx, ry) => path.push(at(x, y, Math.max(rx, ry))),
    fill: () => clipped || check("a fill"),
    stroke: () => clipped || check("a line", (ctx.lineWidth / 2) * Math.max(Math.abs(m.sx), Math.abs(m.sy))),
    fillRect: (x, y, w, h) => {
      if (clipped) return;
      path = [at(x, y, 0), at(x + w, y, 0), at(x, y + h, 0), at(x + w, y + h, 0)];
      check("a block");
    },
    // a gradient is only a colour: it paints nothing by itself
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    // text (the numbers look): the whole em box, as wide as its max width, centred.
    // a look that draws text must centre it and give a max width.
    font: "",
    textAlign: "",
    textBaseline: "",
    fillText: (text, x, y, maxWidth) => {
      if (clipped) return;
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1]);
      if (ctx.textAlign !== "center" || ctx.textBaseline !== "middle" || !(maxWidth > 0) || !(px > 0)) {
        fails.push(`${where}: text "${text}" must be centred, with a max width and a font size`);
        return;
      }
      const w = maxWidth / 2, h = px / 2;
      path = [at(x - w, y - h, 0), at(x + w, y - h, 0), at(x - w, y + h, 0), at(x + w, y + h, 0)];
      check(`text "${text}"`);
    },
    clip: () => {
      // a clip is only safe if it is itself inside the outline
      if (!clipped) check("a clip");
      clipped = true;
    },
    save: () => stack.push({ clipped, m: { ...m } }),
    restore: () => ({ clipped, m } = stack.pop()),
  };
  for (const no of moves ? ["rotate", "setTransform"] : ["translate", "rotate", "scale", "setTransform"])
    ctx[no] = () => fails.push(`${where}: a tier must not move the canvas (${no})`);
  if (moves) {
    ctx.translate = (x, y) => ((m.tx += m.sx * x), (m.ty += m.sy * y));
    ctx.scale = (x, y) => ((m.sx *= x), (m.sy *= y));
  }
  return { ctx, fails };
}

const MOODS = [
  { blink: false, lx: 0, ly: 0, mood: "calm" },
  { blink: true, lx: 0, ly: 0, mood: "calm" },
  { blink: false, lx: 1, ly: -1, mood: "calm" },
  { blink: false, lx: -1, ly: 1, mood: "calm" },
  { blink: false, lx: 0, ly: 0, mood: "squish" },
  { blink: false, lx: 0, ly: 0, mood: "happy" },
  { blink: false, lx: 1, ly: 0, mood: "hello" },
  { blink: false, lx: 0, ly: 0, mood: "comfy" },
  { blink: false, lx: 0, ly: 0, mood: "bump" },
  { blink: false, lx: 0, ly: 0, mood: "oof" },
  // a bump's jolt at its squash and at its stretch
  { blink: false, lx: 0, ly: 0, mood: "bump", jolt: 1 },
  { blink: false, lx: 0, ly: 0, mood: "oof", jolt: 1 },
  { blink: false, lx: 0, ly: 0, mood: "oof", jolt: -1 },
];

for (const skin of SKINS)
  test(`${skin.id}: every tier and every face stays inside its outline`, () => {
    const fails = [];
    for (const t of skin.tiers) {
      const shape = t.shape ?? "circle";
      const r = t.radius * JAR.width;
      const body = recorder(shape, r, `${t.name} body`);
      t.draw.call(t, body.ctx, 0, 0, r);
      fails.push(...body.fails);
      const f = t.face ?? {};
      for (const m of MOODS) {
        const face = recorder(shape, r, `${t.name} ${m.mood}${m.blink ? " blink" : ""}${m.lx ? " look" : ""}${m.jolt ? ` jolt ${m.jolt}` : ""}`, true);
        skin.face(face.ctx, (f.x ?? 0) * r, (f.y ?? 0) * r, r * (f.s ?? 1), m, t);
        fails.push(...face.fails);
      }
    }
    assert.deepEqual(fails, []);
  });
