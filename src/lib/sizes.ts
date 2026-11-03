// how big the pieces are: one number on a slider, from 1 (each look's own size)
// to 3, in steps of 0.1 so scores group by it. it is set once when a game is
// made; the engine turns it into each tier's size (engine/size.ts): up to 1.5
// every piece is that many times its own size, past it the big tiers ease toward
// a ceiling so the biggest stays about 60% of the jar across. bigger pieces fill
// the jar sooner. calibrated with the random bot over 20 seeds
// (npm run bot -- 20 <size>): median drops to a full jar were 192 at 1, 102 at
// 1.3 and 74 at 1.5, the old small, medium and big; see the readme for the rest.

export const SIZE_MIN = 1;
export const SIZE_MAX = 3;
export const SIZE_STEP = 0.1;
/** what the old "big" was: the size that plays best */
export const DEFAULT_SIZE = 1.5;
/** the three sizes before the slider, by the name they were saved under */
export const OLD_SIZES: Readonly<Record<string, number>> = { small: 1, medium: 1.3, big: 1.5 };
/** the size every game was played at before sizes: an older best belongs to it */
export const FIRST_SIZE = 1;

/** the nearest step on the slider, kept inside it; anything else is the default */
export function snapSize(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_SIZE;
  const s = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)) / SIZE_STEP) * SIZE_STEP;
  return Number(s.toFixed(1));
}

/** a saved size: a number from the slider, or the name of one of the old three */
export function readSize(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_SIZE;
  if (Object.hasOwn(OLD_SIZES, raw)) return OLD_SIZES[raw];
  return snapSize(Number(raw));
}

/** every step of the slider, smallest first */
export const SIZE_STEPS: readonly number[] = Array.from(
  { length: Math.round((SIZE_MAX - SIZE_MIN) / SIZE_STEP) + 1 },
  (_, i) => snapSize(SIZE_MIN + i * SIZE_STEP),
);

/** how a size reads on screen: always one decimal */
export const sizeLabel = (s: number) => s.toFixed(1);

/** a plain word for how hard a size is */
export function sizeWord(s: number): string {
  if (s < 1.3) return "very easy";
  if (s < DEFAULT_SIZE) return "easy";
  if (s === DEFAULT_SIZE) return "just right";
  if (s <= 2) return "hard";
  if (s <= 2.5) return "very hard";
  return "super hard";
}
