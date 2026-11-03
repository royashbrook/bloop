// the faces come alive: they blink, glance at a neighbour or the piece about to
// drop, scrunch up under a heavy piece, and beam when they are just made. every
// few seconds each one has a little moment: it looks at a neighbour (and now and
// then the neighbour looks back, a hello), looks around, or snuggles in. a piece
// that comes to rest after moving gets comfy, and one that is bumped makes a face.
// render-only. this reads the game and never writes to it, so the physics and
// every replay stay exactly the same. memory is keyed by piece id, driven by
// real time, and every random choice is seeded by the piece id.
import { listen, type Ear } from "./bumps.ts";
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

/** a little moment comes every 2 to 5.5 s, at random per piece */
export const MOMENT_GAP = [2000, 3500] as const;
/** a look at a neighbour, or around, lasts this long */
export const GLANCE_MS = 1000;
/** a neighbour is this close, edge to edge (world units) */
export const NEAR = 24;
/** how often a look at a neighbour is looked back at: a hello */
export const HELLO_CHANCE = 0.45;
/** how often a moment is a snuggle (a piece at rest, touching another), or a look around */
const SNUGGLE_CHANCE = 0.18;
const AROUND_CHANCE = 0.17;
/** a bump shows this long */
export const BUMP_MS = 520;
/** a bump at least this hard squeezes the eyes shut (>.<), a softer one is a surprised o */
export const OOF_SPEED = 7;
/** comfy: eyes shut happily for this long, once a piece that moved comes to rest */
export const COMFY_MS = 1100;
/** moving faster than this (world units per step) counts as on the move */
const MOVING = 1.2;
/** at rest: slower than this for SETTLE_MS */
const REST = 0.15;
export const SETTLE_MS = 240;
/** the face sinks in a little as it gets comfy, over this long */
const SINK_MS = 420;

interface Memory {
  random: () => number;
  /** the moments' own stream, so a moment never moves a blink */
  fun: () => number;
  /** when the next blink starts, and when the current one ends */
  next: number;
  shut: number;
  lx: number;
  ly: number;
  squish: number;
  /** when the next moment comes */
  moment: number;
  /** a look held until then: at a piece (with), or a fixed way (gx, gy) */
  gaze: number;
  with: number;
  gx: number;
  gy: number;
  hello: number;
  comfy: number;
  comfyAt: number;
  bump: number;
  oof: boolean;
  /** it has moved since it last came to rest, and since when it has been still */
  moved: boolean;
  rest: number;
  state: FaceState;
}

export interface FaceReport {
  id: number;
  blink: boolean;
  lx: number;
  ly: number;
  mood: FaceState["mood"];
  /** the piece it is looking at in a glance or a hello (0: none) */
  with: number;
  /** how far the face was turned when it was drawn, radians: 0 is upright */
  turn: number;
  /** how far the body was turned */
  angle: number;
}

export function faces() {
  const memory = new Map<number, Memory>();
  const turns = new Map<number, number>();
  // running totals since the page loaded, for the curious and for tests.
  // frames, blink and look count frames; the rest count moments as they start.
  const counts = { frames: 0, blink: 0, look: 0, glance: 0, hello: 0, around: 0, snuggle: 0, comfy: 0, bump: 0 };
  let reduced = false;
  let last = 0;
  let ear: Ear | null = null;

  function wake(id: number, now: number): Memory {
    const random = rng(id * 0x9e3779b1);
    const fun = rng((id * 0x85ebca6b + 0x2545f491) >>> 0);
    return {
      random,
      fun,
      next: now + BLINK_GAP[0] + random() * BLINK_GAP[1],
      shut: 0,
      lx: 0,
      ly: 0,
      squish: 0,
      moment: now + MOMENT_GAP[0] / 2 + fun() * MOMENT_GAP[1],
      gaze: 0,
      with: 0,
      gx: 0,
      gy: 0,
      hello: 0,
      comfy: 0,
      comfyAt: 0,
      bump: 0,
      oof: false,
      moved: false,
      rest: now,
      state: CALM,
    };
  }

  const free = (m: Memory, now: number) => now >= m.gaze && now >= m.bump && now >= m.comfy;

  /** work out every face for this frame */
  function update(g: Game, now: number, still: boolean) {
    reduced = still;
    if (ear?.game !== g) {
      ear?.stop();
      ear = listen(g);
    }
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0;
    last = now;
    counts.frames++;
    const live = g.live;
    const ids = new Map<number, (typeof live)[number]>();
    for (const p of live) {
      ids.set(p.id, p);
      if (!memory.has(p.id)) memory.set(p.id, wake(p.id, now));
    }
    // bumps first: a piece just hit makes a face, still or not
    for (const b of ear.take()) {
      const m = memory.get(b.id);
      if (!m) continue;
      if (now >= m.bump) counts.bump++;
      m.bump = now + BUMP_MS;
      m.oof = b.speed >= OOF_SPEED;
      // a bump breaks a moment
      m.gaze = Math.min(m.gaze, now);
      m.comfy = Math.min(m.comfy, now);
    }
    const hx = heldX(g), hr = g.radii[g.held];
    const aims = new Map<number, [number, number, boolean]>();

    // first every piece's timers, so a hello lands on both faces in the same frame
    for (const p of live) {
      const m = memory.get(p.id)!;
      const px = p.body.position.x, py = p.body.position.y;

      // the nearest neighbour, the ones close by, and whether something bigger sits on top of this one
      let tx = 0, ty = 0, near = Infinity, heavy = false;
      const close: number[] = [];
      for (const q of live) {
        if (q === p) continue;
        const qx = q.body.position.x, qy = q.body.position.y;
        const d = Math.hypot(qx - px, qy - py);
        const gap = d - p.r - q.r;
        if (gap < near) (near = gap), (tx = (qx - px) / (d || 1)), (ty = (qy - py) / (d || 1));
        if (gap < NEAR) close.push(q.id);
        // resting ON it: touching, bigger, and sitting mostly above (not just beside it)
        if (gap < 2 && q.tier > p.tier && (py - qy) / (d || 1) > 0.7) heavy = true;
      }
      // the piece about to drop wins when it hangs close above
      let watching = false;
      if (!g.over) {
        const d = Math.hypot(hx - px, JAR.dropY - py);
        if (JAR.dropY < py && d - hr - p.r < WATCH) (tx = (hx - px) / (d || 1)), (ty = (JAR.dropY - py) / (d || 1)), (watching = true);
      }
      aims.set(p.id, [tx, ty, watching]);
      if (heavy) m.squish = now + SQUISH_HOLD;

      // comfy: on the move, then still for a beat
      const speed = Math.hypot(p.body.velocity.x, p.body.velocity.y);
      if (speed > MOVING) m.moved = true;
      if (speed > REST) m.rest = now;
      else if (m.moved && now - m.rest >= SETTLE_MS && now >= m.bump) {
        m.moved = false;
        m.comfy = now + COMFY_MS;
        m.comfyAt = now;
        m.gaze = Math.min(m.gaze, now);
        counts.comfy++;
      }

      // a moment, now and then. reduced motion keeps them all still
      if (still) {
        m.moment = now + MOMENT_GAP[0];
        continue;
      }
      // a long gap (a hidden page) restarts the clock instead of firing at once
      if (now - m.moment > 1000) m.moment = now + m.fun() * MOMENT_GAP[1];
      if (now < m.moment) continue;
      m.moment = now + MOMENT_GAP[0] + m.fun() * MOMENT_GAP[1];
      if (!free(m, now) || (p.made && g.steps - p.born < HAPPY_STEPS)) continue;
      const roll = m.fun();
      if (roll < SNUGGLE_CHANCE && close.length && speed <= REST) {
        m.comfy = now + COMFY_MS;
        m.comfyAt = now;
        counts.snuggle++;
      } else if (roll < SNUGGLE_CHANCE + AROUND_CHANCE || !close.length) {
        // look somewhere else for a moment: up, or off to one side
        const a = -Math.PI * (0.1 + 0.8 * m.fun());
        m.gaze = now + GLANCE_MS;
        m.with = 0;
        m.gx = Math.cos(a);
        m.gy = Math.sin(a);
        counts.around++;
      } else {
        const who = close[Math.floor(m.fun() * close.length)];
        m.gaze = now + GLANCE_MS;
        m.with = who;
        counts.glance++;
        const o = memory.get(who)!;
        const q = ids.get(who)!;
        if (m.fun() < HELLO_CHANCE && free(o, now) && !(q.made && g.steps - q.born < HAPPY_STEPS)) {
          // they look back: a hello, both at once
          m.hello = o.hello = now + GLANCE_MS;
          o.gaze = now + GLANCE_MS;
          o.with = p.id;
          o.moment = Math.max(o.moment, o.gaze + MOMENT_GAP[0] / 2);
          counts.hello++;
        }
      }
    }

    // then what every face shows
    for (const p of live) {
      const m = memory.get(p.id)!;
      let [tx, ty] = aims.get(p.id)!;
      if (now < m.gaze) {
        const q = m.with ? ids.get(m.with) : undefined;
        if (q) {
          const dx = q.body.position.x - p.body.position.x, dy = q.body.position.y - p.body.position.y;
          const d = Math.hypot(dx, dy) || 1;
          (tx = dx / d), (ty = dy / d);
        } else if (!m.with) (tx = m.gx), (ty = m.gy);
        else m.gaze = m.hello = now; // the one it looked at is gone
      }
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
        const k = Math.min(1, dt * (now < m.gaze ? 12 : 8));
        m.lx += (tx - m.lx) * k;
        m.ly += (ty - m.ly) * k;
      }
      const mood: FaceState["mood"] =
        p.made && g.steps - p.born < HAPPY_STEPS ? "happy"
        : now < m.bump ? (m.oof ? "oof" : "bump")
        : now < m.squish ? "squish"
        : now < m.comfy ? "comfy"
        : now < m.hello && now < m.gaze ? "hello"
        : "calm";
      // the comfy sink: a soft dip of the face, there and back
      const t = (now - m.comfyAt) / SINK_MS;
      const settle = mood === "comfy" && !still && t < 1 ? Math.sin(Math.PI * t) : 0;
      m.state = settle ? { blink, lx: m.lx, ly: m.ly, mood, settle } : { blink, lx: m.lx, ly: m.ly, mood };
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
          const m = memory.get(p.id);
          const s = m?.state ?? CALM;
          const looking = m && last < m.gaze ? m.with : 0;
          return { id: p.id, blink: s.blink, lx: s.lx, ly: s.ly, mood: s.mood, with: looking, turn: turns.get(p.id) ?? NaN, angle: p.body.angle };
        }),
      };
    },
    reset() {
      memory.clear();
      turns.clear();
      ear?.stop();
      ear = null;
    },
  };
}
export type Faces = ReturnType<typeof faces>;
