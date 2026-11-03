// the "bubbles" skin, the default: round soap bubbles with faces. two the same
// touch and bloop into a bigger one. each is a pastel, lighter in the middle
// like a bubble, with a thin rim, a soft film just inside it and a shine up top.
// all circles on the same ladder as the other looks, kept upright as they roll
// (the shine stays where the light is). everything is drawn inside the circle.
import { blobFace, dot, shade } from "./blob.ts";
import { LADDER } from "./pets.ts";
import type { Skin, Tier } from "./types.ts";

const T = Math.PI * 2;

function bubble(this: Tier, ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const c = this.colour;
  // the body: pale in the middle, the full pastel toward the edge
  ctx.beginPath();
  ctx.arc(x, y, r, 0, T);
  const fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  fill.addColorStop(0, shade(c, -0.6));
  fill.addColorStop(0.7, shade(c, -0.15));
  fill.addColorStop(1, c);
  ctx.fillStyle = fill;
  ctx.fill();
  // a thin rim, inside the edge
  ctx.beginPath();
  ctx.arc(x, y, r - Math.max(0.5, r * 0.025), 0, T);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = shade(c, 0.3);
  ctx.stroke();
  // the soap film: a faint light ring just inside the rim
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, T);
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();
  // the shine: a curved streak up and to the left, and a little sparkle under it
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, Math.PI * 1.08, Math.PI * 1.38);
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
  dot(ctx, x - r * 0.62, y - r * 0.05, Math.max(0.6, r * 0.06), "rgba(255,255,255,0.8)");
}

const tiers: [string, string][] = [
  ["fizz", "#ffc8dd"],
  ["pip", "#ffd6a5"],
  ["pop", "#fff3a0"],
  ["blip", "#caffbf"],
  ["plop", "#9bf6ff"],
  ["boop", "#a0c4ff"],
  ["bobble", "#bdb2ff"],
  ["bubble", "#ffc6ff"],
  ["splash", "#ffadad"],
  ["puff", "#b9fbc0"],
  ["big bloop", "#8fd8ff"],
];

export const bubbles: Skin = {
  id: "bubbles",
  name: "bubbles",
  tiers: tiers.map(([name, colour], i) => ({ name, colour, radius: LADDER[i], draw: bubble, face: { y: 0.1, s: 0.95 } })),
  face: blobFace,
  spin: false,
};
