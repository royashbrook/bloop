// how fast the world runs: a slider from 0.75 to 2 in steps of 0.25, so scores
// group by it. speed s runs s times 60 fixed steps a real second; the step, the
// gravity and every piece are the same at every speed, so the physics settles
// and holds exactly as it does at 1, only sooner (see engine/game.ts).

export const SPEED_MIN = 0.75;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.25;
/** a little snappier than before speeds */
export const DEFAULT_SPEED = 1.25;
/** the speed every game was played at before speeds: an older best belongs to it */
export const FIRST_SPEED = 1;

/** the nearest step on the slider, kept inside it; anything else is the default */
export function snapSpeed(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_SPEED;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) / SPEED_STEP) * SPEED_STEP;
}

/** a saved speed; nothing saved, or nonsense, is the default */
export const readSpeed = (raw: string | null): number => (raw === null || raw.trim() === "" ? DEFAULT_SPEED : snapSpeed(Number(raw)));

/** every step of the slider, slowest first */
export const SPEED_STEPS: readonly number[] = Array.from(
  { length: Math.round((SPEED_MAX - SPEED_MIN) / SPEED_STEP) + 1 },
  (_, i) => SPEED_MIN + i * SPEED_STEP,
);

/** how a speed reads on screen: 0.75, 1, 1.25 ... (quarters are exact) */
export const speedLabel = (s: number) => String(s);

/** a plain word for how fast a speed is */
export function speedWord(s: number): string {
  if (s < 1) return "slow";
  if (s < DEFAULT_SPEED) return "steady";
  if (s === DEFAULT_SPEED) return "lively";
  if (s < 1.75) return "fast";
  if (s < 2) return "faster";
  return "fastest";
}
