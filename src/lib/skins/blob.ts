// the shared look of a piece: a soft blob (or a soft block), a shine, and a face.
// skins compose these; each tier adds one small hint of what it is.
import { outline, type Shape } from "../engine/shapes.ts";
import type { FaceState, Tier } from "./types.ts";

const INK = "#3d3230";
const T = Math.PI * 2;

/** mix a hex colour toward black (amount > 0) or white (amount < 0) */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 0 : 255, k = Math.abs(amount);
  // hex in, hex out, so a shade can be shaded again
  return "#" + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * (1 - k) + to * k).toString(16).padStart(2, "0")).join("");
}

export const line = (r: number) => Math.max(1, r * 0.07);

/** fill the current path, then draw its outline INSIDE it: clip, stroke twice as wide, the outer half falls away */
function fillAndLine(ctx: CanvasRenderingContext2D, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = line(r) * 2;
  ctx.strokeStyle = shade(colour, 0.28);
  ctx.stroke();
  ctx.restore();
}

/**
 * the body: a circle, or a wobbly one with `wobble` bumps. the outline is drawn
 * inside the edge, so the outer edge of the line is the edge physics touches.
 * nothing a piece draws reaches past r.
 */
export function body(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, wobble = 0) {
  ctx.beginPath();
  if (!wobble) ctx.arc(x, y, r, 0, T);
  else
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * T;
      const rr = r * (0.95 + 0.05 * Math.sin(a * wobble));
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  ctx.closePath();
  fillAndLine(ctx, r, colour);
}

/** the path of a shape's outline: the very points the engine built its body from */
export function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath();
  const pts = outline(shape, r);
  if (!pts) ctx.arc(x, y, r, 0, T);
  else for (const p of pts) ctx.lineTo(x + p.x, y + p.y);
  ctx.closePath();
}

/** a soft block of any shape, outline inside its edge */
export function block(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number, colour: string) {
  shapePath(ctx, shape, x, y, r);
  fillAndLine(ctx, r, colour);
}

/** keep the next drawing inside the body circle, inside its outline */
export function inside(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paint: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - line(r), 0, T);
  ctx.clip();
  paint();
  ctx.restore();
}

export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.24, r * 0.13, -0.6, 0, T);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, T);
  ctx.fillStyle = colour;
  ctx.fill();
}

function stroke(ctx: CanvasRenderingContext2D, width: number, colour = INK) {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colour;
  ctx.stroke();
}

function cheeks(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dx: number, dy: number, f: FaceState) {
  ctx.fillStyle = f.mood === "happy" ? "rgba(255,110,135,0.5)" : "rgba(255,120,140,0.35)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * dx, y + r * dy, r * 0.12, r * 0.08, 0, 0, T);
    ctx.fill();
  }
}

/**
 * two eyes at (x +- dx, y), size e. open: `open` paints one, nudged where it
 * looks. shut (a blink): a short line. squish: squeezed > <. happy: ^ ^.
 */
function eyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  e: number,
  f: FaceState,
  w: number,
  open: (cx: number, cy: number) => void,
) {
  for (const s of [-1, 1]) {
    const cx = x + s * dx;
    ctx.beginPath();
    if (f.mood === "squish") {
      // each eye squeezed shut toward the nose
      ctx.moveTo(cx - s * e, y - e);
      ctx.lineTo(cx + s * e * 0.7, y);
      ctx.lineTo(cx - s * e, y + e);
      stroke(ctx, w);
    } else if (f.mood === "happy") {
      ctx.arc(cx, y + e * 0.55, e * 1.1, Math.PI * 1.15, Math.PI * 1.85);
      stroke(ctx, w);
    } else if (f.blink) {
      ctx.moveTo(cx - e * 1.1, y);
      ctx.lineTo(cx + e * 1.1, y);
      stroke(ctx, w);
    } else open(cx + f.lx * e * 0.7, y + f.ly * e * 0.55);
  }
}

/** a shiny eye: a dark oval (or a coloured iris round a dark pupil) with a white glint */
function shiny(ctx: CanvasRenderingContext2D, cx: number, cy: number, e: number, iris?: string) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, e, e * 1.12, 0, 0, T);
  ctx.fillStyle = iris ?? INK;
  ctx.fill();
  if (iris) dot(ctx, cx, cy + e * 0.08, e * 0.58, INK);
  dot(ctx, cx + e * 0.32, cy - e * 0.38, Math.max(0.5, e * 0.34), "#ffffff");
}

/** the blob face: two dot eyes, a small smile, rosy cheeks */
export function blobFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState) {
  const e = Math.max(0.9, r * 0.085), w = Math.max(0.8, r * 0.05);
  cheeks(ctx, x, y, r, 0.46, 0.14, f);
  eyes(ctx, x, y - r * 0.04, r * 0.26, e, f, w, (cx, cy) => dot(ctx, cx, cy, e, INK));
  mouth(ctx, x, y, r, f, 0.08, 0.13);
}

/** a smile, an open happy mouth, or a squished wobbly one, centred under the eyes */
function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState, dy: number, size: number) {
  const w = Math.max(0.8, r * 0.055), my = y + r * dy, m = r * size;
  ctx.beginPath();
  if (f.mood === "happy") {
    ctx.arc(x, my + m * 0.2, m * 1.05, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, my + m * 0.85, m * 0.5, m * 0.3, 0, 0, T);
    ctx.fillStyle = "#ff8fa3";
    ctx.fill();
  } else if (f.mood === "squish") {
    // a tight wavy line: not happy about the weight
    ctx.moveTo(x - m, my + m * 0.7);
    ctx.quadraticCurveTo(x - m * 0.5, my + m * 0.2, x, my + m * 0.7);
    ctx.quadraticCurveTo(x + m * 0.5, my + m * 1.2, x + m, my + m * 0.7);
    stroke(ctx, w);
  } else {
    ctx.arc(x, my, m, Math.PI * 0.2, Math.PI * 0.8);
    stroke(ctx, w);
  }
}

/** a nose and a little w of a mouth, for the pets */
function muzzle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState, nose: string, nw: number) {
  const w = Math.max(0.7, r * 0.04);
  const ny = y + r * 0.14;
  // a soft rounded triangle of a nose
  ctx.beginPath();
  ctx.moveTo(x - r * nw, ny);
  ctx.quadraticCurveTo(x, ny - r * nw * 0.35, x + r * nw, ny);
  ctx.quadraticCurveTo(x + r * nw * 0.3, ny + r * nw * 0.9, x, ny + r * nw * 0.95);
  ctx.quadraticCurveTo(x - r * nw * 0.3, ny + r * nw * 0.9, x - r * nw, ny);
  ctx.fillStyle = nose;
  ctx.fill();
  const my = ny + r * nw * 0.95;
  if (f.mood === "squish") {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.13, my + r * 0.09);
    ctx.quadraticCurveTo(x - r * 0.06, my + r * 0.03, x, my + r * 0.09);
    ctx.quadraticCurveTo(x + r * 0.06, my + r * 0.15, x + r * 0.13, my + r * 0.09);
    stroke(ctx, w);
    return;
  }
  if (f.mood === "happy") {
    // a little tongue out
    ctx.beginPath();
    ctx.ellipse(x, my + r * 0.1, r * 0.075, r * 0.1, 0, 0, T);
    ctx.fillStyle = "#ff8fa3";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, my - r * 0.01);
  ctx.lineTo(x, my + r * 0.03);
  ctx.arc(x - r * 0.075, my + r * 0.03, r * 0.075, 0, Math.PI * 0.85);
  ctx.moveTo(x, my + r * 0.03);
  ctx.arc(x + r * 0.075, my + r * 0.03, r * 0.075, Math.PI, Math.PI * 0.15, true);
  stroke(ctx, w);
}

/** the puppy face: big shiny eyes, a dark nose, a w mouth, a tongue when happy */
export function pupFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState, tier: Tier) {
  const e = Math.max(1, r * 0.105), w = Math.max(0.8, r * 0.05);
  cheeks(ctx, x, y, r, 0.48, 0.2, f);
  eyes(ctx, x, y - r * 0.08, r * 0.3, e, f, w, (cx, cy) => shiny(ctx, cx, cy, e, tier.eyes));
  muzzle(ctx, x, y, r, f, INK, 0.13);
}

/** the kitty face: shiny eyes, a small pink nose, a w mouth, whiskers */
export function kitFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState, tier: Tier) {
  const e = Math.max(1, r * 0.1), w = Math.max(0.8, r * 0.05);
  cheeks(ctx, x, y, r, 0.5, 0.2, f);
  eyes(ctx, x, y - r * 0.08, r * 0.3, e, f, w, (cx, cy) => shiny(ctx, cx, cy, e, tier.eyes));
  muzzle(ctx, x, y, r, f, "#f28b9b", 0.085);
  ctx.beginPath();
  for (const s of [-1, 1])
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x + s * r * 0.3, y + r * (0.2 + k * 0.05));
      ctx.lineTo(x + s * r * 0.74, y + r * (0.17 + k * 0.13));
    }
  stroke(ctx, Math.max(0.5, r * 0.022), "rgba(61,50,48,0.55)");
}
