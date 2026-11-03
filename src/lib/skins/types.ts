// a skin is data: the engine reads only the sizes and shapes, the screen reads the rest.
// a new look is a new file next to cells.ts, never an engine change.
import type { Shape } from "../engine/shapes.ts";

/**
 * draws one piece's body and markings centred on (x, y), size r. the caller has
 * already turned the canvas if the look spins. nothing may reach past the edge
 * (r for a circle, the shape's outline otherwise): the edge you see is the edge
 * that touches. the face is not drawn here; the screen draws it upright.
 */
export type Draw = (this: Tier, ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void;

/** how a face looks this frame. render-only: nothing here ever touches the game. */
export interface FaceState {
  /** eyes shut, mid-blink */
  blink: boolean;
  /** where the eyes look, each -1..1 (0, 0 is straight ahead) */
  lx: number;
  ly: number;
  /** squish: something heavy is on it. happy: it was just made. */
  mood: "calm" | "squish" | "happy";
}
export const CALM: FaceState = { blink: false, lx: 0, ly: 0, mood: "calm" };

/** draws a face, upright, centred on (x, y), size r */
export type Face = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: FaceState, tier: Tier) => void;

export interface Tier {
  name: string;
  /** size as a fraction of the jar width: a circle's radius, or the radius of a circle with the same area */
  radius: number;
  colour: string;
  /** the outline (a circle when left out) */
  shape?: Shape;
  draw: Draw;
  /** where the face sits, as fractions of r from the centre, and its size (default 0, 0, 1) */
  face?: { x?: number; y?: number; s?: number };
  /** eye colour for a look whose faces have coloured eyes */
  eyes?: string;
}

export interface Skin {
  id: string;
  name: string;
  /** smallest first; drops come from the first five */
  tiers: Tier[];
  face: Face;
  /**
   * the body and its markings turn as the piece rolls. a look of round heads
   * keeps them upright instead (a circle looks the same either way). faces never turn.
   */
  spin: boolean;
}

/** the part of a skin the engine needs, at a piece size (1: the skin's own) */
export const dims = (skin: Skin, scale = 1) => ({
  radii: skin.tiers.map((t) => t.radius),
  shapes: skin.tiers.map((t) => t.shape ?? "circle"),
  scale,
});
