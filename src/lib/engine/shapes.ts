// the outlines a piece can have. one function makes the points, and both the
// physics body and the drawing use them, so what you see is what touches.
// every outline is centred on (0, 0) and has the area of a circle of radius r,
// so a square of one tier feels as big as the circle it stands in for.

export type Shape = "circle" | "square" | "hexagon" | "triangle";
export const SHAPES: readonly Shape[] = ["circle", "square", "hexagon", "triangle"];

export interface Point {
  x: number;
  y: number;
}

const POLY: Record<Exclude<Shape, "circle">, { sides: number; start: number }> = {
  // flat top and bottom, so a block or a hive sits on its side
  square: { sides: 4, start: Math.PI / 4 },
  hexagon: { sides: 6, start: 0 },
  // a point up, a flat bottom
  triangle: { sides: 3, start: -Math.PI / 2 },
};
/** corner rounding as a fraction of the corner radius: soft, not sharp */
const ROUND = 0.28;
/** points per rounded corner */
const ARC = 6;

function area(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const unit = new Map<Shape, Point[]>();
/** the outline at area pi (r = 1), clockwise on screen, built once per shape */
function unitOutline(shape: Exclude<Shape, "circle">): Point[] {
  const hit = unit.get(shape);
  if (hit) return hit;
  const { sides, start } = POLY[shape];
  const half = Math.PI / sides;
  // a regular polygon of corner radius 1, each corner replaced by an arc of radius c
  const c = ROUND;
  const centre = 1 - c / Math.sin(Math.PI / 2 - half);
  const pts: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = start + i * 2 * half;
    const cx = Math.cos(a) * centre, cy = Math.sin(a) * centre;
    for (let k = 0; k <= ARC; k++) {
      const t = a - half + (2 * half * k) / ARC;
      pts.push({ x: cx + Math.cos(t) * c, y: cy + Math.sin(t) * c });
    }
  }
  const s = Math.sqrt(Math.PI / area(pts));
  const scaled = pts.map((p) => ({ x: p.x * s, y: p.y * s }));
  unit.set(shape, scaled);
  return scaled;
}

/** the outline of a piece of this shape and size, as points; null for a circle */
export function outline(shape: Shape, r: number): Point[] | null {
  if (shape === "circle") return null;
  return unitOutline(shape).map((p) => ({ x: p.x * r, y: p.y * r }));
}

/** how far the shape reaches sideways from its centre, upright: what keeps it inside the walls */
export function reach(shape: Shape, r: number): number {
  const pts = outline(shape, r);
  return pts ? Math.max(...pts.map((p) => Math.abs(p.x))) : r;
}

/** the area of an outline, for tests */
export const outlineArea = area;
