// how big the pieces are: one number that scales every tier of every look, set
// once when a game is made. bigger pieces fill the jar sooner, so big is hard and
// small is easy. calibrated with the random bot over 20 seeds
// (npm run bot -- 20 <scale>): median drops to a full jar were 192 at 1, 102 at
// 1.3 and 74 at 1.5. at 1.5 the top tier is 60% of the jar across.

export type SizeId = "small" | "medium" | "big";

export interface Size {
  id: SizeId;
  /** times the look's own size */
  scale: number;
  /** a short line for the picker */
  hint: string;
}

export const SIZES: readonly Size[] = [
  { id: "small", scale: 1, hint: "easy. lots of room, long games, big scores" },
  { id: "medium", scale: 1.3, hint: "just right" },
  { id: "big", scale: 1.5, hint: "hard. the jar fills up fast" },
];
export const DEFAULT_SIZE = SIZES[1];
/** the size every game was played at before sizes: an older best belongs to it */
export const FIRST_SIZE = SIZES.find((s) => s.scale === 1)!;
export const sizeById = (id: string | null): Size => SIZES.find((s) => s.id === id) ?? DEFAULT_SIZE;
