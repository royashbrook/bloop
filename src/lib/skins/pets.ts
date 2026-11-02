// bits the puppies and kitties share: round heads with ears, patches, stripes
// and spots, all drawn ON the head circle. an ear never sticks out past the
// rim, so the round edge you see is still the edge that touches.
import { body, inside, line, shade } from "./blob.ts";

type Ctx = CanvasRenderingContext2D;
const T = Math.PI * 2;

/** the same ladder of sizes as cells: tiny to 40% of the jar across */
export const LADDER = [0.028, 0.038, 0.051, 0.066, 0.083, 0.1, 0.119, 0.138, 0.158, 0.179, 0.2];

function blot(ctx: Ctx, x: number, y: number, rx: number, ry: number, colour: string, turn = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, turn, 0, T);
  ctx.fillStyle = colour;
  ctx.fill();
}

/** a head: a full circle (or a fluffy one), then whatever marks go on it, kept inside */
export function head(ctx: Ctx, x: number, y: number, r: number, colour: string, marks: () => void, fluff = 0) {
  body(ctx, x, y, r, colour, fluff);
  inside(ctx, x, y, r, marks);
}

/** pointy ears up at the rim, with a pink (or given) inside */
export function pointy(ctx: Ctx, x: number, y: number, r: number, colour: string, inner = "#f7b3c0", size = 1, spread = 0.62) {
  for (const s of [-1, 1]) {
    const tip = -Math.PI / 2 + s * spread;
    const tx = x + Math.cos(tip) * r * 1.02, ty = y + Math.sin(tip) * r * 1.02;
    const bx1 = x + s * r * 0.12, by1 = y - r * (0.62 + 0.1 * size);
    const bx2 = x + s * r * (0.62 + 0.18 * size), by2 = y - r * 0.18;
    ctx.beginPath();
    ctx.moveTo(bx1, by1);
    ctx.quadraticCurveTo(tx - s * r * 0.08 * size, ty + r * 0.05, tx, ty);
    ctx.quadraticCurveTo(tx + s * r * 0.02, ty + r * 0.2 * size, bx2, by2);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = line(r) * 0.8;
    ctx.strokeStyle = shade(colour, 0.3);
    ctx.stroke();
    // the inner ear, a smaller copy pulled in toward the middle
    const k = 0.6;
    const cx = (bx1 + bx2 + tx) / 3, cy = (by1 + by2 + ty) / 3;
    ctx.beginPath();
    ctx.moveTo(cx + (bx1 - cx) * k, cy + (by1 - cy) * k);
    ctx.lineTo(cx + (tx - cx) * k, cy + (ty - cy) * k);
    ctx.lineTo(cx + (bx2 - cx) * k, cy + (by2 - cy) * k);
    ctx.closePath();
    ctx.fillStyle = inner;
    ctx.fill();
  }
}

/** floppy ears hanging down the sides */
export function floppy(ctx: Ctx, x: number, y: number, r: number, colour: string, length = 1, curls = false) {
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.72, ey = y - r * 0.08 + r * 0.12 * (length - 1);
    blot(ctx, ex, ey, r * 0.3, r * 0.5 * length, colour, -s * 0.28);
    if (curls)
      for (const [dx, dy] of [[0, -0.3], [-0.1, 0], [0.08, 0.25], [-0.05, 0.45]])
        blot(ctx, ex + s * dx * r, ey + dy * r * length, r * 0.11, r * 0.11, shade(colour, -0.18));
  }
}

/** a lighter muzzle round the nose and mouth */
export function muzzle(ctx: Ctx, x: number, y: number, r: number, colour: string, w = 0.4, h = 0.28, dy = 0.24) {
  blot(ctx, x, y + r * dy, r * w, r * h, colour);
}

/** a soft patch of colour */
export const patch = blot;

/** stripes in from the sides, and an M on the forehead */
export function stripes(ctx: Ctx, x: number, y: number, r: number, colour: string, forehead = true, n = 3) {
  ctx.lineCap = "round";
  ctx.strokeStyle = colour;
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  for (const s of [-1, 1])
    for (let i = 0; i < n; i++) {
      const yy = y + r * (0.0 + i * 0.2);
      ctx.moveTo(x + s * r * 1.0, yy - r * 0.05);
      ctx.quadraticCurveTo(x + s * r * 0.8, yy, x + s * r * 0.66, yy + r * 0.06);
    }
  if (forehead) {
    ctx.moveTo(x - r * 0.18, y - r * 0.42);
    ctx.lineTo(x - r * 0.1, y - r * 0.62);
    ctx.moveTo(x, y - r * 0.4);
    ctx.lineTo(x, y - r * 0.66);
    ctx.moveTo(x + r * 0.18, y - r * 0.42);
    ctx.lineTo(x + r * 0.1, y - r * 0.62);
  }
  ctx.stroke();
}

/** a scatter of spots, the same every time */
export function spots(ctx: Ctx, x: number, y: number, r: number, colour: string, at: number[][]) {
  for (const [dx, dy, s] of at) blot(ctx, x + dx * r, y + dy * r, r * s, r * s * 0.85, colour);
}
