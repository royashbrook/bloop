// the best score for each piece size, and whether jiggle was on for it. all of
// it is one record, written in one go, so a failed write can never keep a score
// and lose its mark, or keep one size's best and lose another's.
import { FIRST_SIZE, SIZES, type SizeId } from "./sizes.ts";

export interface Best {
  score: number;
  jiggled: boolean;
}
export type Bests = Record<SizeId, Best>;

export const noBests = (): Bests =>
  Object.fromEntries(SIZES.map((s) => [s.id, { score: 0, jiggled: false }])) as Bests;

function one(v: unknown): Best {
  const r = (v ?? {}) as { score?: unknown; jiggled?: unknown };
  const n = Number(r.score);
  return Number.isSafeInteger(n) && n > 0 ? { score: n, jiggled: r.jiggled === true } : { score: 0, jiggled: false };
}

/**
 * read the saved record. a save from before sizes was played with every piece at
 * the look's own size, scale 1, so it is that size's best: a plain number (its
 * jiggle mark lived in its own key, read by oldMark) or one { score, jiggled }.
 */
export function parseBests(raw: string | null, oldMark: () => boolean): Bests {
  const bests = noBests();
  if (raw === null) return bests;
  const plain = Number(raw);
  if (raw.trim() !== "" && Number.isSafeInteger(plain)) {
    if (plain > 0) bests[FIRST_SIZE.id] = { score: plain, jiggled: oldMark() };
    return bests;
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return bests;
  }
  if (!v || typeof v !== "object") return bests;
  if ("score" in v) {
    bests[FIRST_SIZE.id] = one(v);
    return bests;
  }
  for (const s of SIZES) bests[s.id] = one((v as Record<string, unknown>)[s.id]);
  return bests;
}
