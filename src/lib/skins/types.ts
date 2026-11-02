// a skin is data: the engine reads only the radii, the screen reads the rest.
// a new look is a new file next to cells.ts, never an engine change.

/** draws one piece centred on (x, y) with radius r. the caller has already rotated the canvas. */
export type Draw = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void;

export interface Tier {
  name: string;
  /** radius as a fraction of the jar width */
  radius: number;
  colour: string;
  draw: Draw;
}

export interface Skin {
  id: string;
  name: string;
  /** smallest first; drops come from the first five */
  tiers: Tier[];
}

/** the part of a skin the engine needs */
export const dims = (skin: Skin) => ({ radii: skin.tiers.map((t) => t.radius) });
