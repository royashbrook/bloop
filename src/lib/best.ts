// the best score for each piece size and speed, and whether jiggle was on for
// it. every score keeps the settings it was made with. all of it is one record,
// written in one go, so a failed write can never keep a score and lose its
// mark, or keep one setting's best and lose another's.
//
// the record: { "1.5/1.25": { score, jiggled }, ... }, keyed by bestKey, only
// the settings that have a best. older saves move to the settings they were
// played at: a best per size ({ small, medium, big }) to sizes 1, 1.3 and 1.5,
// and one from before sizes (a plain number or one { score, jiggled }) to size 1,
// all at speed 1, the only speed there was.
import { FIRST_SIZE, OLD_SIZES, snapSize } from "./sizes.ts";
import { FIRST_SPEED, snapSpeed } from "./speeds.ts";

export interface Best {
  score: number;
  jiggled: boolean;
}
export type Bests = Readonly<Record<string, Best>>;

const NONE: Best = Object.freeze({ score: 0, jiggled: false });

/** the key a size and speed keep their best under: "1.5/1.25" */
export const bestKey = (size: number, speed: number) => `${snapSize(size).toFixed(1)}/${snapSpeed(speed).toFixed(2)}`;

/** the best made at a size and speed (no score and no mark when there is none) */
export const bestAt = (bests: Bests, size: number, speed: number): Best => bests[bestKey(size, speed)] ?? NONE;

/** the record with a new best at a size and speed, every other best kept */
export const withBest = (bests: Bests, size: number, speed: number, best: Best): Bests => ({ ...bests, [bestKey(size, speed)]: { score: best.score, jiggled: best.jiggled } });

function one(v: unknown): Best | null {
  const r = (v ?? {}) as { score?: unknown; jiggled?: unknown };
  const n = Number(r.score);
  return Number.isSafeInteger(n) && n > 0 ? { score: n, jiggled: r.jiggled === true } : null;
}

/** a key as written by bestKey, read back to the same key; anything else is null */
function ownKey(k: string): string | null {
  const m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(k);
  if (!m) return null;
  const key = bestKey(Number(m[1]), Number(m[2]));
  return key === k ? key : null;
}

/** read the saved record, moving an older one to the settings it was played at */
export function parseBests(raw: string | null, oldMark: () => boolean): Bests {
  const bests: Record<string, Best> = {};
  if (raw === null) return bests;
  const first = bestKey(FIRST_SIZE, FIRST_SPEED);
  const plain = Number(raw);
  if (raw.trim() !== "" && Number.isSafeInteger(plain)) {
    if (plain > 0) bests[first] = { score: plain, jiggled: oldMark() };
    return bests;
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return bests;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return bests;
  if ("score" in v) {
    const b = one(v);
    if (b) bests[first] = b;
    return bests;
  }
  for (const [k, entry] of Object.entries(v as Record<string, unknown>)) {
    const key = Object.hasOwn(OLD_SIZES, k) ? bestKey(OLD_SIZES[k], FIRST_SPEED) : ownKey(k);
    const b = key && one(entry);
    // two entries for one setting: the higher score wins
    if (key && b && b.score > (bests[key]?.score ?? 0)) bests[key] = b;
  }
  return bests;
}
