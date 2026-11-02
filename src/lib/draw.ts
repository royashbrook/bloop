// paints a game onto a canvas. it reads the game and the skin; it never changes either.
import { heldX, JAR, type Game } from "./engine/game.ts";
import { extent } from "./engine/shapes.ts";
import type { Faces } from "./faces.ts";
import { CALM, type FaceState, type Skin } from "./skins/types.ts";

/** space around the jar for its walls, in world units */
export const MARGIN = 10;
export const VIEW = { width: JAR.width + MARGIN * 2, height: JAR.height + MARGIN };

export interface Theme {
  sunk: string;
  line: string;
  dim: string;
  warn: string;
  shine: string;
}

export function theme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { sunk: v("--surface-sunk"), line: v("--line"), dim: v("--ink-dim"), warn: v("--warn"), shine: v("--glass-shine") };
}

/** a ring that grows and fades where a merge happened */
export interface Burst {
  x: number;
  y: number;
  r: number;
  colour: string;
  at: number;
}
const BURST_MS = 380;
const POP_STEPS = 8;

/**
 * one piece: the body and its markings turn with it (when the look spins), the
 * face never does. returns how far the face was turned as it was drawn, read
 * back off the canvas, so a test can hold us to "upright".
 */
export function piece(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  tier: number,
  x: number,
  y: number,
  r: number,
  angle: number,
  face: FaceState = CALM,
  scale = 1,
): number {
  const t = skin.tiers[tier];
  ctx.save();
  ctx.translate(x, y);
  if (skin.spin) ctx.rotate(angle);
  if (scale !== 1) ctx.scale(scale, scale);
  t.draw(ctx, 0, 0, r);
  ctx.restore();
  const f = t.face ?? {};
  ctx.save();
  ctx.translate(x + (f.x ?? 0) * r * scale, y + (f.y ?? 0) * r * scale);
  if (scale !== 1) ctx.scale(scale, scale);
  const m = ctx.getTransform();
  skin.face(ctx, 0, 0, r * (f.s ?? 1), face, t);
  ctx.restore();
  return Math.atan2(m.b, m.a);
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export function render(
  ctx: CanvasRenderingContext2D,
  g: Game,
  skin: Skin,
  look: Theme,
  scale: number,
  bursts: Burst[],
  now: number,
  faces: Faces,
  /** prefers-reduced-motion: no pop, no ring (the faces handle their own) */
  still = false,
) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, MARGIN * scale, 0);

  // the jar: a soft rounded inside and a thick wall
  const { width: W, height: H } = JAR;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, [0, 0, 22, 22]);
  ctx.fillStyle = look.sunk;
  ctx.fill();
  glass(ctx, look);

  // the line: dashed and quiet, red and pulsing while something sits above it
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = g.danger > 0 ? look.warn : look.dim;
  ctx.globalAlpha = g.danger > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 140)) : 0.35;
  ctx.beginPath();
  ctx.moveTo(4, JAR.line);
  ctx.lineTo(W - 4, JAR.line);
  ctx.stroke();
  ctx.restore();

  // the aim guide and the held piece
  if (!g.over) {
    const x = heldX(g);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([2, 10]);
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = look.dim;
    ctx.beginPath();
    ctx.moveTo(x, JAR.dropY);
    ctx.lineTo(x, H - 4);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    if (g.cooldown > 0) ctx.globalAlpha = 0.35;
    piece(ctx, skin, g.held, x, JAR.dropY, g.radii[g.held], 0);
    ctx.restore();
  }

  faces.update(g, now, still);
  for (const p of g.live) {
    const age = g.steps - p.born;
    const pop = !still && p.made && age < POP_STEPS ? 0.75 + 0.25 * easeOutBack(age / POP_STEPS) : 1;
    faces.drew(p.id, piece(ctx, skin, p.tier, p.body.position.x, p.body.position.y, p.r, p.body.angle, faces.get(p.id), pop));
  }

  if (!still) for (const b of bursts) {
    const t = (now - b.at) / BURST_MS;
    if (t < 0 || t > 1) continue;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * (1 + t * 0.6), 0, Math.PI * 2);
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.strokeStyle = b.colour;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // walls over everything, open at the rim
  const L = -5, R = W + 5, B = H + 5, round = 26;
  ctx.beginPath();
  ctx.moveTo(L, NECK);
  ctx.lineTo(L, B - round);
  ctx.arcTo(L, B, L + round, B, round);
  ctx.lineTo(R - round, B);
  ctx.arcTo(R, B, R, B - round, round);
  ctx.lineTo(R, NECK);
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.strokeStyle = look.line;
  ctx.stroke();
  lip(ctx, look);
}

// the look of a jar, drawn only: the walls, the floor and the line stay where
// the physics has them. a threaded neck, a thick rounded lip, a glass shine and a
// little label, all behind the pieces (or outside the walls) so pieces read clearly.

/** the threaded neck runs from the rim down to here */
const NECK = 30;

function glass(ctx: CanvasRenderingContext2D, look: Theme) {
  const { width: W, height: H } = JAR;
  ctx.save();
  // the neck: a deeper band of glass, a thick rim along the top, two screw threads
  ctx.beginPath();
  ctx.rect(0, 0, W, NECK);
  ctx.fillStyle = look.line;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect(-10, 0, W + 20, 8, 4);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = look.line;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const y of [14, 23]) {
    ctx.beginPath();
    ctx.moveTo(2, y + 2);
    ctx.quadraticCurveTo(W / 2, y - 3, W - 2, y + 2);
    ctx.stroke();
  }
  // a shoulder where the neck meets the body
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(0, NECK);
  ctx.lineTo(W, NECK);
  ctx.lineWidth = 2;
  ctx.stroke();
  // glass shine: two soft streaks down the left, a short one low on the right
  ctx.globalAlpha = 1;
  ctx.fillStyle = look.shine;
  for (const [x, y, w, h] of [[12, 110, 9, 300], [27, 140, 4, 150], [W - 18, H - 150, 5, 90]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w / 2);
    ctx.fill();
  }
  // a little label, faint, low on the glass
  const lw = 112, lh = 40, lx = (W - lw) / 2, ly = H * 0.56;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.roundRect(lx, ly, lw, lh, 12);
  ctx.fillStyle = look.line;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = look.dim;
  ctx.font = "700 22px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("bloop", W / 2, ly + lh / 2 + 1);
  ctx.restore();
}

/** a thick rounded lip on top of each wall, the rim of the jar */
function lip(ctx: CanvasRenderingContext2D, look: Theme) {
  const { width: W } = JAR;
  ctx.save();
  ctx.fillStyle = look.line;
  for (const x of [-10, W]) {
    ctx.beginPath();
    ctx.roundRect(x, 0, 10, NECK, 5);
    ctx.fill();
  }
  ctx.restore();
}

/** the next piece, centred in a small canvas */
export function preview(ctx: CanvasRenderingContext2D, skin: Skin, tier: number) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  // the biggest drop fills most of the box; the smallest stay small, so size reads true
  const biggest = skin.tiers[4].radius * JAR.width;
  // a shape that reaches past its circle (a triangle) shrinks to stay in the box
  const s = (Math.min(c.width, c.height) * 0.4) / biggest / Math.max(1, extent(skin.tiers[tier].shape ?? "circle") / 1.2);
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.height / 2);
  piece(ctx, skin, tier, 0, 0, skin.tiers[tier].radius * JAR.width, 0);
}

/** a small picture of one tier, filling a share of a square canvas */
export function icon(ctx: CanvasRenderingContext2D, skin: Skin, tier: number, fill = 0.36) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const r = skin.tiers[tier].radius * JAR.width;
  // a triangle reaches further than its circle; keep every shape in the box
  const s = (Math.min(c.width, c.height) * fill) / r / Math.max(1, extent(skin.tiers[tier].shape ?? "circle") / 1.3);
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.height / 2);
  piece(ctx, skin, tier, 0, 0, r, 0);
}

export const BURST_LIFE = BURST_MS;
