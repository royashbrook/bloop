// smooth drawing between steps. the world moves in whole 1/60 s steps, and at a
// speed that is not a whole number a screen frame runs one step, then two, then
// one: drawn as they are, the pieces stutter. so the screen draws each piece a
// share of the way from where it was before the last step to where it is now,
// the share being how far the clock has got toward the next step. render-only:
// this listens to the engine's own events and never writes to a body or the
// game, so a game drawn smooth plays and replays exactly like one that is not.
import Matter from "matter-js";
import { STEP, type Game } from "./engine/game.ts";

const T = Math.PI * 2;

export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/** a share t of the way from angle a to angle b, the short way round */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % T;
  if (d > Math.PI) d -= T;
  else if (d < -Math.PI) d += T;
  return a + d * t;
}

/**
 * where to draw: a share alpha (0..1) of the way from `from` to `to`. a piece
 * with no pose before the last step (dropped or made since) draws where it is.
 */
export function blend(from: Pose | undefined, to: Pose, alpha: number): Pose {
  if (!from) return to;
  const t = Math.min(1, Math.max(0, alpha));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle: lerpAngle(from.angle, to.angle, t) };
}

/** how far the clock has got toward the next step, 0..1 */
export const share = (g: Game) => Math.min(1, Math.max(0, g.acc / STEP));

/**
 * keep each piece's pose from before the latest step, keyed by piece id, and
 * say where to draw it. follows one game at a time: a new game starts fresh.
 */
export function smoother() {
  let game: Game | null = null;
  let before = new Map<number, Pose>();
  /** what was drawn last frame, by piece id, for tests and the curious */
  const drawn = new Map<number, Pose>();
  // the engine says beforeUpdate at the start of every step: the poses then are
  // the poses after the step before, merges and drops included
  const remember = () => {
    const m = new Map<number, Pose>();
    for (const p of game!.live) m.set(p.id, { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle });
    before = m;
  };
  function follow(g: Game) {
    if (game === g) return;
    if (game) Matter.Events.off(game.engine, "beforeUpdate", remember);
    game = g;
    before = new Map();
    drawn.clear();
    Matter.Events.on(g.engine, "beforeUpdate", remember);
  }
  return {
    /** start of a frame: follow this game, forget what was drawn */
    frame(g: Game) {
      follow(g);
      drawn.clear();
    },
    /** where to draw a live piece this frame; off: draw it where it is */
    pose(p: Game["live"][number], alpha: number): Pose {
      const now = { x: p.body.position.x, y: p.body.position.y, angle: p.body.angle };
      const at = blend(before.get(p.id), now, alpha);
      drawn.set(p.id, at);
      return at;
    },
    /** a plain copy of last frame's drawn poses */
    report: () => [...drawn].map(([id, p]) => ({ id, ...p })),
    stop() {
      if (game) Matter.Events.off(game.engine, "beforeUpdate", remember);
      game = null;
      before = new Map();
      drawn.clear();
    },
  };
}
export type Smoother = ReturnType<typeof smoother>;
