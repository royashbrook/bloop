// the "shapes" skin: soft blocks with faces. circles, squares, triangles and
// hexagons, mixed up the ladder. each block is drawn from the very outline the
// engine builds its body from, and is as big as the circle it stands in for.
import type { Shape } from "../engine/shapes.ts";
import { block, blobFace, dot, shade, shapePath } from "./blob.ts";
import { LADDER } from "./pets.ts";
import type { Skin, Tier } from "./types.ts";

const T = Math.PI * 2;

/** a soft block with a little shine, plus whatever small mark this tier has */
function soft(shape: Shape, mark?: (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => void): Tier["draw"] {
  return function (this: Tier, ctx, x, y, r) {
    block(ctx, shape, x, y, r, this.colour);
    ctx.save();
    shapePath(ctx, shape, x, y, r * 0.86);
    ctx.clip();
    mark?.(ctx, x, y, r, this.colour);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.22, r * 0.11, -0.6, 0, T);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    ctx.restore();
  };
}

const freckles = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => {
  for (const [dx, dy] of [[-0.5, 0.5], [0.52, 0.42], [0.55, -0.4]]) dot(ctx, x + dx * r, y + dy * r, Math.max(0.8, r * 0.06), shade(c, 0.2));
};
const band = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => {
  ctx.fillStyle = shade(c, -0.35);
  ctx.fillRect(x - r * 2, y + r * 0.45, r * 4, r * 0.22);
};
const sparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  const sx = x + r * 0.5, sy = y - r * 0.45, s = r * 0.14;
  ctx.moveTo(sx, sy - s);
  ctx.quadraticCurveTo(sx, sy, sx + s, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy + s);
  ctx.quadraticCurveTo(sx, sy, sx - s, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy - s);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
};
const cells = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => {
  // a faint honeycomb inside the hive
  ctx.strokeStyle = shade(c, 0.12);
  ctx.lineWidth = r * 0.04;
  for (const [dx, dy] of [[-0.5, 0.55], [0, 0.72], [0.5, 0.55]]) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(x + dx * r + Math.cos((i * T) / 6) * r * 0.2, y + dy * r + Math.sin((i * T) / 6) * r * 0.2);
    ctx.closePath();
    ctx.stroke();
  }
};

const tier = (name: string, shape: Shape, colour: string, mark?: Parameters<typeof soft>[1], face: Tier["face"] = {}): Omit<Tier, "radius"> => ({
  name,
  shape,
  colour,
  draw: soft(shape, mark),
  // a triangle's middle sits low, so its face does too
  face: shape === "triangle" ? { y: 0.15, s: 0.8, ...face } : { s: 0.9, ...face },
});

const tiers: Omit<Tier, "radius">[] = [
  tier("dot", "circle", "#ffc4d6"),
  tier("cube", "square", "#ffd5a3"),
  tier("wedge", "triangle", "#fff0a0"),
  tier("hex", "hexagon", "#cdeea0", freckles),
  tier("ball", "circle", "#a6e7c8", band),
  tier("block", "square", "#a5dcf0", freckles),
  tier("peak", "triangle", "#c3c9ff", sparkle),
  tier("gem", "hexagon", "#dcbcf7", sparkle),
  tier("crate", "square", "#ffbfa6", band),
  tier("hive", "hexagon", "#f7d98a", cells),
  tier("moon", "circle", "#9cc4ee", sparkle),
];

export const shapes: Skin = {
  id: "shapes",
  name: "shapes",
  tiers: tiers.map((t, i) => ({ ...t, radius: LADDER[i] })),
  face: blobFace,
  spin: true,
};
