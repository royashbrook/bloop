// the shared look of a piece: a soft round blob, a shine, a sleepy-happy face.
// skins compose these; each tier adds one small hint of what it is.

const INK = "#3d3230";

/** mix a hex colour toward black (amount > 0) or white (amount < 0) */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 0 : 255, k = Math.abs(amount);
  // hex in, hex out, so a shade can be shaded again
  return "#" + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * (1 - k) + to * k).toString(16).padStart(2, "0")).join("");
}

export const line = (r: number) => Math.max(1, r * 0.07);

/** the body: a circle, or a wobbly one with `wobble` bumps */
export function body(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, wobble = 0) {
  ctx.beginPath();
  if (!wobble) ctx.arc(x, y, r, 0, Math.PI * 2);
  else
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = r * (0.95 + 0.06 * Math.sin(a * wobble));
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = line(r);
  ctx.strokeStyle = shade(colour, 0.28);
  ctx.stroke();
}

/** keep the next drawing inside the body circle */
export function inside(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paint: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - line(r) / 2, 0, Math.PI * 2);
  ctx.clip();
  paint();
  ctx.restore();
}

export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.24, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
}

/** two dot eyes, a small smile, rosy cheeks. dy moves the whole face down. */
export function face(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dy = 0) {
  const fy = y + dy * r;
  const eye = Math.max(0.9, r * 0.085);
  ctx.fillStyle = "rgba(255,120,140,0.35)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.46, fy + r * 0.14, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * r * 0.26, fy - r * 0.04, eye, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, fy + r * 0.08, r * 0.13, Math.PI * 0.2, Math.PI * 0.8);
  ctx.lineWidth = Math.max(0.8, r * 0.055);
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}
