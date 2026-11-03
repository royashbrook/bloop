// who got bumped: a read-only ear on the physics, for the faces. it listens to
// the engine's own collision events and never writes to a body, so a game with
// an ear on it plays exactly like one without.
import Matter from "matter-js";
import type { Game } from "./engine/game.ts";

/** a piece that was hit, and how hard (relative speed, world units per step) */
export interface Bump {
  id: number;
  speed: number;
}

/** a contact that starts at least this fast is a bump; a resting touch is far below it */
export const BUMP_SPEED = 3;
/** a piece whose speed jumps this much in one step (gravity aside) was jolted */
export const JOLT = 4;
/** gravity's own change in speed per step, so a free fall is no jolt */
const FALL = 0.001 * (1000 / 60) ** 2;
/** at most this many waiting, so a hidden page cannot pile them up */
const KEEP = 64;

export function listen(g: Game) {
  const heard: Bump[] = [];
  const before = new Map<number, { x: number; y: number }>();
  const hit = (id: number, speed: number) => {
    if (heard.length < KEEP) heard.push({ id, speed });
  };
  const start = (e: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of e.pairs) {
      const a = g.byBody.get(pair.bodyA.id), b = g.byBody.get(pair.bodyB.id);
      if (!a && !b) continue;
      // the speeds here are from before the contact is solved: how fast they met
      const n = pair.collision.normal, va = pair.bodyA.velocity, vb = pair.bodyB.velocity;
      const speed = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
      if (speed < BUMP_SPEED) continue;
      if (a) hit(a.id, speed);
      if (b) hit(b.id, speed);
    }
  };
  const was = () => {
    before.clear();
    for (const p of g.live) before.set(p.id, { x: p.body.velocity.x, y: p.body.velocity.y });
  };
  const after = () => {
    for (const p of g.live) {
      const v = before.get(p.id);
      if (!v) continue;
      const jolt = Math.hypot(p.body.velocity.x - v.x, p.body.velocity.y - v.y - FALL);
      if (jolt >= JOLT) hit(p.id, jolt);
    }
  };
  Matter.Events.on(g.engine, "collisionStart", start);
  Matter.Events.on(g.engine, "beforeUpdate", was);
  Matter.Events.on(g.engine, "afterUpdate", after);
  return {
    game: g,
    /** every bump since the last take, each piece once at its hardest */
    take(): Bump[] {
      const most = new Map<number, number>();
      for (const b of heard) most.set(b.id, Math.max(most.get(b.id) ?? 0, b.speed));
      heard.length = 0;
      return [...most].map(([id, speed]) => ({ id, speed }));
    },
    stop() {
      Matter.Events.off(g.engine, "collisionStart", start);
      Matter.Events.off(g.engine, "beforeUpdate", was);
      Matter.Events.off(g.engine, "afterUpdate", after);
      heard.length = 0;
    },
  };
}
export type Ear = ReturnType<typeof listen>;
