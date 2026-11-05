// the jar, drawn only. the physics jar is a plain box (0..W across, 0..H down from
// the rim); everything here sits behind the pieces (back) or outside the walls and
// over them (front), so it never changes where a piece can go.
import { JAR } from "./engine/game.ts";

export interface JarTheme {
  sunk: string;
  line: string;
  dim: string;
  shine: string;
  glass: string;
  edge: string;
  label: string;
  labelInk: string;
  floor: string;
}

const W = JAR.width;
const H = JAR.height;
/** the glass: how far the neck, the body and the floor reach past the walls */
const NECK_OUT = 10;
const BODY_OUT = 24;
const BASE = 16;
/** the neck runs from the rim down to here, the shoulder from here to SHOULDER */
const NECK = 34;
const SHOULDER = 92;
const FOOT = 46;
/** the opening seen a little from above: an ellipse this tall */
const RIM_RY = 9;
/** the inside's bottom corners, drawn soft */
const INSIDE_R = 22;

// ---- shared shapes -------------------------------------------------------------

/** the outside of the glass, rim to rim the long way round */
function outside(ctx: CanvasRenderingContext2D) {
  const n = NECK_OUT, b = BODY_OUT, f = H + BASE, k = SHOULDER - NECK;
  ctx.moveTo(-n, 0);
  ctx.lineTo(-n, NECK);
  ctx.bezierCurveTo(-n, NECK + k * 0.55, -b, NECK + k * 0.45, -b, SHOULDER);
  ctx.lineTo(-b, f - FOOT);
  ctx.quadraticCurveTo(-b, f, -b + FOOT, f);
  ctx.lineTo(W + b - FOOT, f);
  ctx.quadraticCurveTo(W + b, f, W + b, f - FOOT);
  ctx.lineTo(W + b, SHOULDER);
  ctx.bezierCurveTo(W + b, NECK + k * 0.45, W + n, NECK + k * 0.55, W + n, NECK);
  ctx.lineTo(W + n, 0);
}

/** the inside, the long way back to where outside() started */
function inside(ctx: CanvasRenderingContext2D) {
  const r = INSIDE_R;
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H - r);
  ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H);
  ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, 0);
  ctx.closePath();
}

function insideFill(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, [0, 0, INSIDE_R, INSIDE_R]);
  ctx.fillStyle = t.sunk;
  ctx.fill();
}

/** a soft shadow on the table under the jar */
function floorShadow(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.fillStyle = t.floor;
  ctx.beginPath();
  ctx.ellipse(W / 2, H + BASE + 3, W / 2 + BODY_OUT - 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** the back half of the rolled lip: the far edge of the opening, behind everything */
function rimBack(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.strokeStyle = t.edge;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(W / 2, 0, W / 2 + NECK_OUT, RIM_RY, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** the near half of the rolled lip, a fat rounded ring, over the pieces */
function rimFront(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.ellipse(W / 2, 0, W / 2 + NECK_OUT + 2, RIM_RY, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 6;
  ctx.stroke();
  // a catch of light along the lip
  ctx.strokeStyle = t.shine;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(W / 2, -1, W / 2 + NECK_OUT + 2, RIM_RY, 0, Math.PI * 0.62, Math.PI * 0.92);
  ctx.stroke();
  ctx.restore();
}

/** the glass walls and floor, thick, with an outline and light along them */
function glassWalls(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.beginPath();
  outside(ctx);
  inside(ctx);
  ctx.fillStyle = t.glass;
  ctx.fill();
  // the outline: strong on the outside, a thin bright line on the inside
  ctx.beginPath();
  outside(ctx);
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W, NECK);
  ctx.lineTo(W, H - INSIDE_R);
  ctx.quadraticCurveTo(W, H, W - INSIDE_R, H);
  ctx.lineTo(INSIDE_R, H);
  ctx.quadraticCurveTo(0, H, 0, H - INSIDE_R);
  ctx.lineTo(0, NECK);
  ctx.strokeStyle = t.shine;
  ctx.lineWidth = 2;
  ctx.stroke();
  // light down the thick glass: long on the left, short low on the right, along the floor
  ctx.strokeStyle = t.shine;
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-BODY_OUT / 2 - 2, SHOULDER + 24);
  ctx.lineTo(-BODY_OUT / 2 - 2, H - 90);
  ctx.moveTo(W + BODY_OUT / 2 + 2, H - 150);
  ctx.lineTo(W + BODY_OUT / 2 + 2, H - 70);
  ctx.moveTo(FOOT + 10, H + BASE / 2);
  ctx.lineTo(W * 0.42, H + BASE / 2);
  ctx.stroke();
  ctx.restore();
}

/** light on the front of the glass, faint, over the pieces */
function frontShine(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.fillStyle = t.shine;
  ctx.globalAlpha = 0.55;
  for (const [x, y, w, h] of [[14, SHOULDER + 30, 10, 250], [30, SHOULDER + 60, 4, 120], [W - 22, H - 170, 6, 80]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w / 2);
    ctx.fill();
  }
  ctx.restore();
}

/** the screw threads on the neck: two slanted rings, on the glass, over the pieces */
function threads(ctx: CanvasRenderingContext2D, t: JarTheme) {
  ctx.save();
  ctx.strokeStyle = t.edge;
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  for (const y of [13, 25]) {
    // the bumps where a thread turns round the side of the neck
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-NECK_OUT - 3, y + 1);
    ctx.lineTo(-NECK_OUT + 1, y - 1);
    ctx.moveTo(W + NECK_OUT + 3, y - 3);
    ctx.lineTo(W + NECK_OUT - 1, y - 5);
    ctx.stroke();
    // the thread across the front, curved like the rim, faint so a piece reads through it
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(-NECK_OUT, y);
    ctx.quadraticCurveTo(W / 2, y + RIM_RY * 2 + 2, W + NECK_OUT, y - 4);
    ctx.stroke();
  }
  ctx.restore();
}

/** a paper label wrapped round the jar, behind the pieces */
function label(ctx: CanvasRenderingContext2D, t: JarTheme) {
  const lw = 210, lh = 74, x = (W - lw) / 2, y = H * 0.54, sag = 10;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(W / 2, y + sag * 2, x + lw, y);
  ctx.lineTo(x + lw, y + lh);
  ctx.quadraticCurveTo(W / 2, y + lh + sag * 2, x, y + lh);
  ctx.closePath();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = t.label;
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = t.labelInk;
  ctx.font = "800 34px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("bloop", W / 2, y + lh / 2 + sag);
  ctx.restore();
}

// ---- the looks ---------------------------------------------------------------

/** behind the pieces: the table shadow, the inside, the far rim, the label */
export function jarBack(ctx: CanvasRenderingContext2D, t: JarTheme) {
  floorShadow(ctx, t);
  insideFill(ctx, t);
  rimBack(ctx, t);
  label(ctx, t);
}

/** over the pieces: the thick glass, its shine, the threads, the near rim */
export function jarFront(ctx: CanvasRenderingContext2D, t: JarTheme) {
  glassWalls(ctx, t);
  frontShine(ctx, t);
  threads(ctx, t);
  rimFront(ctx, t);
}
