// the "kitties" skin: kitten to lion. round heads with ears, stripes, spots and a
// mane, all inside the circle. heads stay upright as they roll.
import { body, kitFace, shade } from "./blob.ts";
import { head, LADDER, muzzle, patch, pointy, spots, stripes } from "./pets.ts";
import type { Skin, Tier } from "./types.ts";

const WHITE = "#fffaf3";
const kit = (name: string, colour: string, marks: Tier["draw"], extra: Partial<Tier> = {}): Omit<Tier, "radius"> => ({
  name,
  colour,
  draw: marks,
  face: { y: 0.05 },
  ...extra,
});

const tiers: Omit<Tier, "radius">[] = [
  kit("kitten", "#fde1e5", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => pointy(ctx, x, y, r, shade(this.colour, 0.05), "#f7a8b8", 1, 0.62));
  }),
  kit("tabby", "#f6b46c", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#ffc8b5", 1, 0.62);
      stripes(ctx, x, y, r, shade(this.colour, 0.22));
      muzzle(ctx, x, y, r, "#ffe4c6", 0.32, 0.22);
    });
  }),
  kit("calico", "#fbf2e7", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      patch(ctx, x - r * 0.6, y - r * 0.5, r * 0.5, r * 0.42, "#f2a457", -0.4);
      patch(ctx, x + r * 0.62, y - r * 0.45, r * 0.45, r * 0.4, "#5f5450", 0.4);
      patch(ctx, x + r * 0.7, y + r * 0.55, r * 0.3, r * 0.25, "#f2a457");
      pointy(ctx, x, y, r, this.colour, "#f7b3c0", 1, 0.62);
    });
  }),
  kit("siamese", "#f5e7d4", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, "#8b6b59", "#b48b76", 1, 0.62);
      // the dark points: a soft mask round the nose
      muzzle(ctx, x, y, r, "#a27f6c", 0.38, 0.34, 0.2);
    });
  }, { eyes: "#76b6ec" }),
  kit("tuxedo", "#575766", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#e9a6b4", 1, 0.62);
      patch(ctx, x, y - r * 0.2, r * 0.09, r * 0.3, WHITE);
      muzzle(ctx, x, y, r, WHITE, 0.46, 0.4, 0.38);
    });
  }, { eyes: "#9ad37c" }),
  kit("persian", "#ebe6f2", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, shade(this.colour, 0.06), "#f4c2cf", 0.6, 0.72);
      muzzle(ctx, x, y, r, "#faf8fd", 0.4, 0.28);
    }, 11);
  }, { eyes: "#f0b24a" }),
  kit("maine coon", "#c49a6e", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#f0d5bd", 1.2, 0.6);
      // ear tufts and a fluffy ruff
      spots(ctx, x, y, r, "#4f3b2e", [[-0.56, -0.86, 0.06], [0.56, -0.86, 0.06]]);
      stripes(ctx, x, y, r, shade(this.colour, 0.25), true, 2);
      spots(ctx, x, y, r, "#f0dcc4", [[-0.62, 0.55, 0.26], [0.62, 0.55, 0.26], [0, 0.78, 0.3]]);
      muzzle(ctx, x, y, r, "#f0dcc4", 0.3, 0.2);
    }, 13);
  }, { eyes: "#c9cf5a" }),
  kit("lynx", "#dbb690", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#f2e0cc", 1.3, 0.55);
      // black ear tips, spots, and a pale cheek ruff
      spots(ctx, x, y, r, "#3d3230", [[-0.5, -0.86, 0.07], [0.5, -0.86, 0.07]]);
      spots(ctx, x, y, r, shade(this.colour, 0.3), [[-0.45, -0.3, 0.05], [0.45, -0.3, 0.05], [-0.62, 0.05, 0.05], [0.62, 0.05, 0.05], [0, -0.55, 0.05]]);
      spots(ctx, x, y, r, "#f6ebdf", [[-0.7, 0.55, 0.28], [0.7, 0.55, 0.28]]);
      muzzle(ctx, x, y, r, "#f6ebdf", 0.32, 0.22);
    });
  }, { eyes: "#d2b24a" }),
  kit("cheetah", "#f5ce6c", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#fbe7b8", 0.7, 0.72);
      spots(ctx, x, y, r, "#5a4636", [
        [-0.5, -0.5, 0.06], [0.5, -0.5, 0.06], [-0.2, -0.65, 0.05], [0.2, -0.65, 0.05], [-0.75, 0, 0.06], [0.75, 0, 0.06], [-0.62, 0.45, 0.05], [0.62, 0.45, 0.05], [0, -0.42, 0.05],
      ]);
      // the tear lines from eye to mouth
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * r * 0.24, y + r * 0.02);
        ctx.quadraticCurveTo(x + s * r * 0.24, y + r * 0.25, x + s * r * 0.14, y + r * 0.38);
      }
      ctx.lineWidth = r * 0.045;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#5a4636";
      ctx.stroke();
      muzzle(ctx, x, y, r, "#fff2cf", 0.24, 0.18, 0.3);
    });
  }, { eyes: "#d6a23c" }),
  kit("tiger", "#f69e4a", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, WHITE, 0.75, 0.68);
      muzzle(ctx, x, y, r, WHITE, 0.5, 0.36, 0.3);
      spots(ctx, x, y, r, WHITE, [[-0.32, -0.32, 0.12], [0.32, -0.32, 0.12]]);
      stripes(ctx, x, y, r, "#3d3230", true, 3);
    });
  }, { eyes: "#e7c04a" }),
  kit("lion", "#f3c672", function (ctx, x, y, r) {
    // a big mane fills the circle, the face sits in the middle
    body(ctx, x, y, r, "#d38c3e", 14);
    const f = r * 0.7;
    for (const s of [-1, 1]) body(ctx, x + s * f * 0.68, y - f * 0.72, f * 0.24, this.colour);
    body(ctx, x, y + r * 0.04, f, this.colour);
    muzzle(ctx, x, y, r, "#fbe5bd", 0.3, 0.2, 0.26);
  }, { face: { y: 0.06, s: 0.72 }, eyes: "#c98a2e" }),
];

export const kitties: Skin = {
  id: "kitties",
  name: "kitties",
  tiers: tiers.map((t, i) => ({ ...t, radius: LADDER[i] })),
  face: kitFace,
  spin: false,
};
