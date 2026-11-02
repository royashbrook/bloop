// the faces come alive: they blink, glance at a neighbour or the piece about to
// drop, scrunch up under a heavy piece, and beam when they are just made.
// render-only. this reads the game and never writes to it, so the physics and
// every replay stay exactly the same. memory is keyed by piece id, driven by
// real time, and every random choice is seeded by the piece id.
import { heldX, JAR, type Game } from "./engine/game.ts";
import { rng } from "./engine/rng.ts";
import { CALM, type FaceState } from "./skins/types.ts";

/** how long a blink keeps the eyes shut */
export const BLINK_MS = 120;
/** a blink comes every 2 to 6 s, at random per piece */
const BLINK_GAP = [2000, 4000] as const;
/** how long a new piece beams after a merge, in game steps */
export const HAPPY_STEPS = 45;
/** a squint lasts this long after the weight goes, so it does not flicker */
const SQUISH_HOLD = 250;
/** the piece about to drop is watched when it is this close (edge to edge, world units) */
const WATCH = 140;

interface Memory {
  random: () => number;
  /** when the next blink starts, and when the current one ends */
  next: number;
  shut: number;
  lx: number;
  ly: number;
  squish: number;
  state: FaceState;
}

export interface FaceReport {
  id: number;
  blink: boolean;
  lx: number;
  ly: number;
  mood: FaceState["mood"];
  /** how far the face was turned when it was drawn, radians: 0 is upright */
  turn: number;
  /** how far the body was turned */
  angle: number;
}

export function faces() {
  const memory = new Map<number, Memory>();
  const turns = new Map<number, number>();
  // running totals since the page loaded, for the curious and for tests
  const counts = { frames: 0, blink: 0, look: 0 };
  let reduced = false;
  let last = 0;

  function wake(id: number, now: number): Memory {
    const random = rng(id * 0x9e3779b1);
    return { random, next: now + BLINK_GAP[0] + random() * BLINK_GAP[1], shut: 0, lx: 0, ly: 0, squish: 0, state: CALM };
  }

  /** work out every face for this frame */
  function update(g: Game, now: number, still: boolean) {
    reduced = still;
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0;
    last = now;
    counts.frames++;
    const live = g.live;
    const ids = new Set<number>();
    const hx = heldX(g), hr = g.radii[g.held];
    for (const p of live) {
      ids.add(p.id);
      let m = memory.get(p.id);
      if (!m) memory.set(p.id, (m = wake(p.id, now)));
      const px = p.body.position.x, py = p.body.position.y;

      // the nearest neighbour, and whether something bigger sits on top of this one
      let tx = 0, ty = 0, near = Infinity, heavy = false;
      for (const q of live) {
        if (q === p) continue;
        const qx = q.body.position.x, qy = q.body.position.y;
        const d = Math.hypot(qx - px, qy - py);
        const gap = d - p.r - q.r;
        if (gap < near) (near = gap), (tx = (qx - px) / (d || 1)), (ty = (qy - py) / (d || 1));
        // resting ON it: touching, bigger, and sitting mostly above (not just beside it)
        if (gap < 2 && q.tier > p.tier && (py - qy) / (d || 1) > 0.7) heavy = true;
      }
      // the piece about to drop wins when it hangs close above
      if (!g.over) {
        const d = Math.hypot(hx - px, JAR.dropY - py);
        if (JAR.dropY < py && d - hr - p.r < WATCH) (tx = (hx - px) / (d || 1)), (ty = (JAR.dropY - py) / (d || 1));
      }
      if (heavy) m.squish = now + SQUISH_HOLD;

      let blink = false;
      if (still) {
        m.lx = m.ly = 0;
      } else {
        // a long gap (a hidden page) restarts the blink clock instead of blinking at once
        if (now - m.next > 1000) m.next = now + m.random() * BLINK_GAP[1];
        if (now >= m.next) {
          m.shut = m.next + BLINK_MS;
          m.next += BLINK_GAP[0] + m.random() * BLINK_GAP[1];
        }
        blink = now < m.shut;
        const k = Math.min(1, dt * 8);
        m.lx += (tx - m.lx) * k;
        m.ly += (ty - m.ly) * k;
      }
      const mood: FaceState["mood"] = p.made && g.steps - p.born < HAPPY_STEPS ? "happy" : now < m.squish ? "squish" : "calm";
      m.state = { blink, lx: m.lx, ly: m.ly, mood };
      if (blink) counts.blink++;
      if (Math.abs(m.lx) + Math.abs(m.ly) > 0.05) counts.look++;
    }
    for (const id of memory.keys()) if (!ids.has(id)) memory.delete(id), turns.delete(id);
  }

  return {
    update,
    /** the face a piece shows this frame */
    get: (id: number): FaceState => memory.get(id)?.state ?? CALM,
    /** the renderer says how it drew a face, so a test can see it stayed upright */
    drew: (id: number, turn: number) => turns.set(id, turn),
    /** a plain copy for the test window: read-only, it changes nothing */
    report(g: Game) {
      return {
        reduced,
        counts: { ...counts },
        list: g.live.map((p): FaceReport => {
          const s = memory.get(p.id)?.state ?? CALM;
          return { id: p.id, blink: s.blink, lx: s.lx, ly: s.ly, mood: s.mood, turn: turns.get(p.id) ?? NaN, angle: p.body.angle };
        }),
      };
    },
    reset() {
      memory.clear();
      turns.clear();
    },
  };
}
export type Faces = ReturnType<typeof faces>;
