// the "puppies" skin: teacup to great dane. round heads, ears and markings that
// tell them apart, all inside the circle. heads stay upright as they roll.
import { pupFace, shade } from "./blob.ts";
import { floppy, head, LADDER, muzzle, patch, pointy, spots } from "./pets.ts";
import type { Skin, Tier } from "./types.ts";

const CREAM = "#fff6ea";
const pup = (name: string, colour: string, marks: Tier["draw"], extra: Partial<Tier> = {}): Omit<Tier, "radius"> => ({
  name,
  colour,
  draw: marks,
  face: { y: 0.04 },
  ...extra,
});

const tiers: Omit<Tier, "radius">[] = [
  pup("teacup", "#fde7cf", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y, r, "#f1c596", 0.8);
      muzzle(ctx, x, y, r, CREAM);
    });
  }),
  pup("chihuahua", "#f3c48a", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, shade(this.colour, 0.06), "#f7b3c0", 1.3, 0.75);
      muzzle(ctx, x, y, r, CREAM, 0.34, 0.24);
    });
  }),
  pup("pomeranian", "#f8b267", function (ctx, x, y, r) {
    head(
      ctx, x, y, r, this.colour,
      () => {
        pointy(ctx, x, y, r, shade(this.colour, 0.08), "#ffd9b0", 0.7, 0.55);
        muzzle(ctx, x, y, r, "#ffe2bf", 0.5, 0.34, 0.22);
      },
      9,
    );
  }),
  pup("pug", "#f1d6a6", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y - r * 0.25, r, "#5e4c48", 0.5);
      // a dark mask round the nose, and a worried brow
      muzzle(ctx, x, y, r, "#7a6560", 0.42, 0.32, 0.22);
      ctx.beginPath();
      ctx.arc(x, y - r * 0.15, r * 0.3, Math.PI * 1.25, Math.PI * 1.75);
      ctx.arc(x, y - r * 0.05, r * 0.42, Math.PI * 1.75, Math.PI * 1.25, true);
      ctx.lineWidth = r * 0.04;
      ctx.strokeStyle = shade(this.colour, 0.2);
      ctx.stroke();
    });
  }),
  pup("corgi", "#f4a35a", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, this.colour, "#ffd4c4", 1.25, 0.66);
      // a white stripe down the middle into a white muzzle
      patch(ctx, x, y - r * 0.4, r * 0.1, r * 0.4, CREAM);
      muzzle(ctx, x, y, r, CREAM, 0.48, 0.36, 0.3);
    });
  }),
  pup("beagle", "#cf9358", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y, r, "#7a5236", 1.25);
      patch(ctx, x, y - r * 0.4, r * 0.11, r * 0.45, CREAM);
      muzzle(ctx, x, y, r, CREAM, 0.38, 0.3, 0.28);
    });
  }),
  pup("poodle", "#eaae78", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y, r, shade(this.colour, 0.06), 1.1, true);
      // a curly topknot
      spots(ctx, x, y, r, shade(this.colour, -0.2), [
        [-0.42, -0.72, 0.17], [-0.15, -0.82, 0.18], [0.15, -0.82, 0.18], [0.42, -0.72, 0.17], [0, -0.62, 0.16], [-0.28, -0.55, 0.13], [0.28, -0.55, 0.13],
      ]);
      muzzle(ctx, x, y, r, shade(this.colour, -0.25), 0.34, 0.24);
    });
  }),
  pup("husky", "#9fb2c7", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      pointy(ctx, x, y, r, shade(this.colour, 0.12), "#f3f5f9", 1.1, 0.62);
      // a white mask: the lower face, a blaze, and little brows
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.05);
      ctx.quadraticCurveTo(x - r * 0.4, y - r * 0.05, x - r * 0.1, y - r * 0.55);
      ctx.lineTo(x + r * 0.1, y - r * 0.55);
      ctx.quadraticCurveTo(x + r * 0.4, y - r * 0.05, x + r, y + r * 0.05);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fillStyle = "#f5f7fb";
      ctx.fill();
      spots(ctx, x, y, r, "#f5f7fb", [[-0.3, -0.32, 0.08], [0.3, -0.32, 0.08]]);
    });
  }, { eyes: "#6fb6ea" }),
  pup("golden", "#f2c169", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y, r, "#dd9b47", 1.15);
      muzzle(ctx, x, y, r, "#fbdca0", 0.4, 0.3);
    });
  }),
  pup("newfoundland", "#6e5d55", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y, r, "#54453f", 1.1);
      muzzle(ctx, x, y, r, "#93807a", 0.42, 0.3);
    });
  }, { eyes: "#d39a5c" }),
  pup("great dane", "#f4f0ea", function (ctx, x, y, r) {
    head(ctx, x, y, r, this.colour, () => {
      floppy(ctx, x, y - r * 0.15, r, "#4b4448", 0.75);
      // harlequin patches
      spots(ctx, x, y, r, "#57505a", [[-0.55, -0.45, 0.2], [0.5, 0.45, 0.17], [0.2, -0.7, 0.13], [-0.62, 0.42, 0.12], [0.68, -0.1, 0.1]]);
    });
  }),
];

export const puppies: Skin = {
  id: "puppies",
  name: "puppies",
  tiers: tiers.map((t, i) => ({ ...t, radius: LADDER[i] })),
  face: pupFace,
  spin: false,
};
