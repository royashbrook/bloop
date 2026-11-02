// paints a game onto a canvas. it reads the game and the skin; it never changes either.
import { heldX, JAR, type Game } from "./engine/game.ts";
import type { Skin } from "./skins/types.ts";

/** space around the jar for its walls, in world units */
export const MARGIN = 10;
export const VIEW = { width: JAR.width + MARGIN * 2, height: JAR.height + MARGIN };

export interface Theme {
  sunk: string;
  line: string;
  dim: string;
  warn: string;
}

export function theme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { sunk: v("--surface-sunk"), line: v("--line"), dim: v("--ink-dim"), warn: v("--warn") };
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

function piece(ctx: CanvasRenderingContext2D, skin: Skin, tier: number, x: number, y: number, angle: number, scale = 1) {
  const t = skin.tiers[tier];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (scale !== 1) ctx.scale(scale, scale);
  t.draw(ctx, 0, 0, t.radius * JAR.width);
  ctx.restore();
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
    piece(ctx, skin, g.held, x, JAR.dropY, 0);
    ctx.restore();
  }

  for (const p of g.live) {
    const age = g.steps - p.born;
    const pop = p.made && age < POP_STEPS ? 0.75 + 0.25 * easeOutBack(age / POP_STEPS) : 1;
    piece(ctx, skin, p.tier, p.body.position.x, p.body.position.y, p.body.angle, pop);
  }

  for (const b of bursts) {
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
  ctx.moveTo(L, 4);
  ctx.lineTo(L, B - round);
  ctx.arcTo(L, B, L + round, B, round);
  ctx.lineTo(R - round, B);
  ctx.arcTo(R, B, R, B - round, round);
  ctx.lineTo(R, 4);
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.strokeStyle = look.line;
  ctx.stroke();
}

/** the next piece, centred in a small canvas */
export function preview(ctx: CanvasRenderingContext2D, skin: Skin, tier: number) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  // the biggest drop fills most of the box; the smallest stay small, so size reads true
  const biggest = skin.tiers[4].radius * JAR.width;
  const s = (Math.min(c.width, c.height) * 0.4) / biggest;
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.height / 2);
  piece(ctx, skin, tier, 0, 0, 0);
}

export const BURST_LIFE = BURST_MS;
