// the "cells" skin: life from tiny to huge. each tier is a pastel blob with a face
// and one small hint of what it is. radii are fractions of the jar width, growing
// smoothly (r = 0.028 + 0.172 * (i/10)^1.25) to a whale 40% of the jar across.
import { body, dot, face, inside, line, shade, shine } from "./blob.ts";
import type { Skin, Tier } from "./types.ts";

const T = Math.PI * 2;

const tiers: Tier[] = [
  {
    name: "atom",
    radius: 0.028,
    colour: "#ffc4d6",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // a tiny orbit ring with its electron
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r * 0.3, -0.5, 0, T);
      ctx.lineWidth = line(r);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
      dot(ctx, x + Math.cos(-0.5) * r * 0.8, y + Math.sin(-0.5) * r * 0.8, Math.max(1, r * 0.12), "#ffffff");
      face(ctx, x, y, r, 0.12);
    },
  },
  {
    name: "molecule",
    radius: 0.038,
    colour: "#ffd5a3",
    draw(ctx, x, y, r) {
      // three little atoms stuck on, drawn behind the body
      for (const a of [-2.3, -0.8, 1.1]) body(ctx, x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.3, shade(this.colour, -0.25));
      body(ctx, x, y, r * 0.94, this.colour);
      shine(ctx, x, y, r);
      face(ctx, x, y, r * 0.94, 0.05);
    },
  },
  {
    name: "spore",
    radius: 0.051,
    colour: "#fff0a0",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // speckles
      const s = shade(this.colour, 0.22);
      for (const [dx, dy] of [[-0.55, 0.45], [0.5, 0.5], [0.05, -0.7], [0.62, -0.2], [-0.6, -0.25]])
        dot(ctx, x + dx * r, y + dy * r, Math.max(0.8, r * 0.07), s);
      shine(ctx, x, y, r);
      face(ctx, x, y, r);
    },
  },
  {
    name: "cell",
    radius: 0.066,
    colour: "#cdeea0",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // the membrane and a nucleus
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, T);
      ctx.lineWidth = line(r) * 0.7;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.stroke();
      dot(ctx, x + r * 0.42, y + r * 0.5, r * 0.16, shade(this.colour, 0.3));
      shine(ctx, x, y, r);
      face(ctx, x, y, r, -0.05);
    },
  },
  {
    name: "amoeba",
    radius: 0.083,
    colour: "#a6e7c8",
    draw(ctx, x, y, r) {
      // a wobbly edge, and a little snack inside
      body(ctx, x, y, r, this.colour, 5);
      dot(ctx, x - r * 0.48, y + r * 0.45, r * 0.12, shade(this.colour, 0.25));
      dot(ctx, x + r * 0.5, y - r * 0.5, r * 0.08, shade(this.colour, 0.2));
      shine(ctx, x, y, r);
      face(ctx, x, y, r);
    },
  },
  {
    name: "colony",
    radius: 0.1,
    colour: "#a5dcf0",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // a ring of little cells living together
      const c = shade(this.colour, -0.45);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * T + 0.3;
        body(ctx, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.17, c);
      }
      face(ctx, x, y, r * 0.85);
    },
  },
  {
    name: "jellyfish",
    radius: 0.119,
    colour: "#c3c9ff",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // tentacle scallops along the bottom
      inside(ctx, x, y, r, () => {
        const top = y + r * 0.5, n = 5, w = (r * 2) / n;
        ctx.beginPath();
        ctx.moveTo(x - r, y + r);
        ctx.lineTo(x - r, top);
        for (let i = 0; i < n; i++) ctx.arc(x - r + w * (i + 0.5), top, w / 2, Math.PI, 0, true);
        ctx.lineTo(x + r, y + r);
        ctx.closePath();
        ctx.fillStyle = shade(this.colour, 0.14);
        ctx.fill();
      });
      shine(ctx, x, y, r);
      face(ctx, x, y, r, -0.1);
    },
  },
  {
    name: "tadpole",
    radius: 0.138,
    colour: "#dcbcf7",
    draw(ctx, x, y, r) {
      // a wiggly tail out the back
      ctx.beginPath();
      ctx.moveTo(x + r * 0.7, y - r * 0.3);
      ctx.quadraticCurveTo(x + r * 1.25, y - r * 0.05, x + r * 1.18, y + r * 0.42);
      ctx.quadraticCurveTo(x + r * 1.0, y + r * 0.1, x + r * 0.7, y + r * 0.3);
      ctx.closePath();
      ctx.fillStyle = shade(this.colour, 0.15);
      ctx.fill();
      body(ctx, x, y, r, this.colour);
      shine(ctx, x, y, r);
      face(ctx, x - r * 0.12, y, r);
    },
  },
  {
    name: "fish",
    radius: 0.158,
    colour: "#ffbfa6",
    draw(ctx, x, y, r) {
      // a tail fin behind, a small side fin in front
      ctx.beginPath();
      ctx.moveTo(x + r * 0.8, y);
      ctx.lineTo(x + r * 1.2, y - r * 0.32);
      ctx.lineTo(x + r * 1.2, y + r * 0.32);
      ctx.closePath();
      ctx.fillStyle = shade(this.colour, 0.15);
      ctx.fill();
      body(ctx, x, y, r, this.colour);
      ctx.beginPath();
      ctx.moveTo(x + r * 0.15, y + r * 0.42);
      ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.35, x + r * 0.55, y + r * 0.62);
      ctx.quadraticCurveTo(x + r * 0.3, y + r * 0.62, x + r * 0.15, y + r * 0.42);
      ctx.fillStyle = shade(this.colour, 0.18);
      ctx.fill();
      shine(ctx, x, y, r);
      face(ctx, x - r * 0.15, y, r * 0.95);
    },
  },
  {
    name: "turtle",
    radius: 0.179,
    colour: "#b7dfa2",
    draw(ctx, x, y, r) {
      body(ctx, x, y, r, this.colour);
      // a shell on top with a few plates
      const shell = shade(this.colour, 0.2);
      inside(ctx, x, y, r, () => {
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.25, r * 1.05, r * 0.72, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.lineWidth = line(r) * 0.8;
        ctx.strokeStyle = shade(this.colour, 0.35);
        for (const dx of [-0.42, 0, 0.42]) {
          ctx.beginPath();
          ctx.arc(x + dx * r, y - r * 0.55, r * 0.17, 0, T);
          ctx.stroke();
        }
      });
      face(ctx, x, y, r * 0.85, 0.35);
    },
  },
  {
    name: "whale",
    radius: 0.2,
    colour: "#9cc4ee",
    draw(ctx, x, y, r) {
      // a spout above, a lighter belly, a fluke behind
      ctx.beginPath();
      ctx.moveTo(x + r * 0.85, y + r * 0.1);
      ctx.quadraticCurveTo(x + r * 1.18, y - r * 0.1, x + r * 1.2, y - r * 0.38);
      ctx.quadraticCurveTo(x + r * 1.0, y - r * 0.25, x + r * 0.8, y - r * 0.2);
      ctx.closePath();
      ctx.fillStyle = shade(this.colour, 0.15);
      ctx.fill();
      body(ctx, x, y, r, this.colour);
      inside(ctx, x, y, r, () => {
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.95, r * 0.95, r * 0.55, 0, 0, T);
        ctx.fillStyle = shade(this.colour, -0.45);
        ctx.fill();
      });
      for (const [dx, dy, s] of [[-0.12, -1.18, 0.09], [0.08, -1.28, 0.07], [0, -1.12, 0.1]])
        dot(ctx, x + dx * r, y + dy * r, r * s, shade(this.colour, -0.3));
      shine(ctx, x, y, r);
      face(ctx, x, y, r);
    },
  },
];

export const cells: Skin = { id: "cells", name: "cells", tiers };
