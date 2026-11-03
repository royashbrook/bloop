// the size slider's picture: the pieces you can drop, side by side on a shelf,
// drawn at a size exactly as a game at that size would make them, and true to
// each other at every size: one scale for the whole slider, set so the biggest
// size just fills the box. drag the slider and the row grows and shrinks.
import { piece } from "./draw.ts";
import { JAR, SPAWN_TIERS } from "./engine/game.ts";
import { extent } from "./engine/shapes.ts";
import { grow } from "./engine/size.ts";
import { SIZE_MAX } from "./sizes.ts";
import type { Skin } from "./skins/types.ts";

/** world units between two pieces on the shelf */
const GAP = 6;

/** each droppable tier's half-width at a size, in world units */
function halves(skin: Skin, size: number): number[] {
  const radii = grow(skin.tiers.map((t) => t.radius), size).slice(0, SPAWN_TIERS);
  return radii.map((f, i) => f * JAR.width * extent(skin.tiers[i].shape ?? "circle"));
}

const span = (h: number[]) => h.reduce((a, b) => a + 2 * b, 0) + GAP * (h.length - 1);

/** draw the row at a size; returns the world-to-pixel scale used */
export function sample(ctx: CanvasRenderingContext2D, skin: Skin, size: number): number {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const most = halves(skin, SIZE_MAX);
  const k = Math.min(c.width / span(most), c.height / (2 * Math.max(...most)));
  const h = halves(skin, size);
  const radii = grow(skin.tiers.map((t) => t.radius), size).map((f) => f * JAR.width);
  // centred across, sitting on the bottom of the box
  let x = (c.width / k - span(h)) / 2;
  const floor = c.height / k;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  h.forEach((half, tier) => {
    piece(ctx, skin, tier, x + half, floor - half, radii[tier], 0);
    x += 2 * half + GAP;
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return k;
}
