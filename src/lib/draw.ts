// paints a game onto a canvas. it reads the game and the skin; it never changes either.
import { heldX, JAR, type Game } from "./engine/game.ts";
import { extent } from "./engine/shapes.ts";
import type { Faces } from "./faces.ts";
import { share, type Smoother } from "./smooth.ts";
import { CALM, type FaceState, type Skin } from "./skins/types.ts";
import { jarBack, jarFront, type JarTheme } from "./jar.ts";

/** space around the jar for its walls, in world units */
export const MARGIN = 30;
/**
 * room above the rim, in world units, so the biggest piece the biggest size can
 * drop is drawn whole while it waits (at size 3 it reaches about 32 units over the rim)
 */
export const HEADROOM = 34;
export const VIEW = { width: JAR.width + MARGIN * 2, height: HEADROOM + JAR.height + MARGIN };

export interface Theme extends JarTheme {
  warn: string;
}

export function theme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    sunk: v("--surface-sunk"),
    line: v("--line"),
    dim: v("--ink-dim"),
    warn: v("--warn"),
    shine: v("--glass-shine"),
    glass: v("--jar-glass"),
    edge: v("--jar-edge"),
    label: v("--label"),
    labelInk: v("--label-ink"),
    floor: v("--shadow-floor"),
  };
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
  // getting comfy: the face sinks in a touch and spreads, then comes back
  const sink = face.settle ?? 0;
  if (sink) {
    ctx.translate(0, r * 0.05 * sink);
    ctx.scale(1 + 0.06 * sink, 1 - 0.06 * sink);
  }
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
  /** draw each piece between its last two steps (smooth.ts); left out: where it is */
  smooth?: Smoother,
) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, MARGIN * scale, HEADROOM * scale);

  // the jar behind the pieces: the inside, the far rim, the label
  const { width: W, height: H } = JAR;
  jarBack(ctx, look);

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
  smooth?.frame(g);
  const alpha = share(g);
  for (const p of g.live) {
    const age = g.steps - p.born;
    const pop = !still && p.made && age < POP_STEPS ? 0.75 + 0.25 * easeOutBack(age / POP_STEPS) : 1;
    const at = smooth ? smooth.pose(p, alpha) : { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle };
    faces.drew(p.id, piece(ctx, skin, p.tier, at.x, at.y, p.r, at.angle, faces.get(p.id), pop));
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

  // the glass over everything, open at the rim
  jarFront(ctx, look);
}

/** the next piece, centred in a small canvas, at the game's own sizes */
export function preview(ctx: CanvasRenderingContext2D, skin: Skin, radii: readonly number[], tier: number) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  // the biggest drop fills most of the box; the smallest stay small, so size reads true
  const biggest = radii[4];
  // a shape that reaches past its circle (a triangle) shrinks to stay in the box
  const s = (Math.min(c.width, c.height) * 0.4) / biggest / Math.max(1, extent(skin.tiers[tier].shape ?? "circle") / 1.2);
  ctx.setTransform(s, 0, 0, s, c.width / 2, c.height / 2);
  piece(ctx, skin, tier, 0, 0, radii[tier], 0);
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
