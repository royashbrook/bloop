// the "numbers" skin: rounded number blocks, 2 to 2048. two 2s make a 4, two 4s
// make an 8: doubling, for free. each block is as big as the circle it stands in
// for, on the same ladder as the other looks, so a bigger number is a bigger
// block. the number is the face: it is drawn upright, like a face, so it reads
// the right way up however the block rolls, and it fits in the circle inside the
// block, so it never pokes out at any turn. no eyes: the number is the character.
import { block, shade, shapePath } from "./blob.ts";
import { LADDER } from "./pets.ts";
import type { Face, Skin, Tier } from "./types.ts";

const T = Math.PI * 2;
/** a bold rounded system font: the canvas text api, no web font to load */
export const FONT = `ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", system-ui, sans-serif`;
/** the number's box, as fractions of r: as wide as it may be, and its height for 1 to 4 digits */
export const TEXT_WIDTH = 1.25;
export const TEXT_SIZE = [1.0, 0.82, 0.64, 0.5];

/** a soft block with a shine, like the shapes look */
function draw(this: Tier, ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  block(ctx, "square", x, y, r, this.colour);
  ctx.save();
  shapePath(ctx, "square", x, y, r * 0.86);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.5, r * 0.24, r * 0.1, -0.5, 0, T);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fill();
  ctx.restore();
}

/** how far a bump squashes the number: a soft one, and a hard one (oof) */
export const JOLT = { bump: 0.14, oof: 0.22 };

/**
 * the number, centred, big and clear, in a deep shade of the block's own colour.
 * no eyes to show a mood with, so a bump makes the number jelly: squashed wide
 * at the hit, a stretch, a smaller squash, gone (the jolt, none with reduced
 * motion). comfy sinks it in a touch, like every face. the block never changes.
 */
export const numeral: Face = (ctx, x, y, r, f, tier) => {
  const text = tier.name;
  const px = r * TEXT_SIZE[Math.min(TEXT_SIZE.length, text.length) - 1];
  ctx.save();
  const k = f.jolt ? f.jolt * (f.mood === "oof" ? JOLT.oof : JOLT.bump) : 0;
  if (k) {
    // squash about the number's foot, so it presses down like it was sat on
    const foot = y + px * 0.5;
    ctx.translate(x, foot);
    ctx.scale(1 + k, 1 - k);
    ctx.translate(-x, -foot);
  }
  ctx.font = `800 ${px}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = shade(tier.colour, 0.66);
  ctx.fillText(text, x, y + px * 0.04, r * TEXT_WIDTH);
  ctx.restore();
};

const colours = ["#ffd1dc", "#ffe0b5", "#fff3a8", "#d4f5b0", "#b5ecd9", "#b3e0f7", "#c7cdff", "#e2c6fa", "#ffc2b0", "#ffd98f", "#ffb3c8"];

export const numbers: Skin = {
  id: "numbers",
  name: "numbers",
  tiers: colours.map((colour, i) => ({ name: String(2 ** (i + 1)), colour, radius: LADDER[i], shape: "square", draw })),
  face: numeral,
  spin: true,
};
