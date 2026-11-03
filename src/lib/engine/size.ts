// how big each tier is at a piece size s, as a fraction of the jar width.
//
// up to s = 1.5 every tier is the look's own size times s, exactly as before, so
// 1, 1.3 and 1.5 play the very games small, medium and big did. past 1.5 the
// whale is already 60% of the jar across and cannot double, so each tier eases
// toward a ceiling of its own instead of growing straight on:
//
//   r(s) = b s                                     for s <= KNEE
//   r(s) = K + D (1 - exp(-b (s - KNEE) / D))      for s > KNEE
//   where K = b KNEE (where it was at the knee) and D = ceiling - K (room left)
//
// that is a soft saturation: it leaves the knee at the same slope (no kink),
// it always grows as s grows, and it never passes the ceiling. the ceilings
// step down from the top one by RATIO a tier, so near the top, where the room
// runs out, every tier stays at least RATIO bigger than the one under it, and
// down low, where there is room, the small pieces keep growing almost straight
// on: at s = 3 the smallest is about 2.7 times its own size, the biggest 1.55
// (with only 1% of the jar left to grow, it is at its ceiling by about s = 2).

/** below this every tier is just s times its own size */
export const KNEE = 1.5;
/** the top tier's ceiling: 31% of the jar width as a radius, 62% across */
export const TOP = 0.31;
/** each tier's ceiling is this much under the next one's */
export const RATIO = 1.08;

/** one tier's size at piece size s: b is its own size, tier its place, last the top tier's place */
export function grown(b: number, s: number, tier: number, last: number): number {
  if (s <= KNEE) return b * s;
  const K = b * KNEE;
  const D = TOP * Math.pow(RATIO, tier - last) - K;
  // a look already at its ceiling by the knee holds there
  if (!(D > 0)) return K;
  return K + D * (1 - Math.exp((-b * (s - KNEE)) / D));
}

/** every tier's size at piece size s, as fractions of the jar width */
export const grow = (radii: readonly number[], s: number): number[] => radii.map((b, i) => grown(b, s, i, radii.length - 1));
