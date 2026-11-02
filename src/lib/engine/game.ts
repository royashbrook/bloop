// the rules and the physics, with no DOM: a node test can play a whole game.
// the engine knows tiers only as radii. names, colours and faces live in a skin.
import Matter from "matter-js";
import { rng } from "./rng.ts";
import { outline, reach, type Shape } from "./shapes.ts";

const { Engine, Bodies, Body, Composite } = Matter;

/** the jar in world units: x across from the left wall, y down from the rim. */
export const JAR = {
  width: 400,
  height: 540,
  /** the danger line, measured down from the rim */
  line: 84,
  /** where the held piece waits, above the line */
  dropY: 42,
} as const;
/** one physics step: the world always moves in 1/60 s slices */
export const STEP = 1 / 60;
/** drops come only from this many of the smallest tiers */
export const SPAWN_TIERS = 5;
/** steps between drops, so tapping fast cannot break it */
export const COOLDOWN = 30;
/** a fresh drop is still falling through for this many steps; it cannot end a game yet */
export const GRACE = 60;
/** a settled piece above the line this many steps in a row ends the game */
export const OVER_AFTER = 120;
/** merges resolved per step; the rest wait one step (they are still touching) */
export const MAX_MERGES = 6;
/** at most this many steps per advance() call: a long stall drops time, not frames */
const MAX_CATCHUP = 8;
const WALL = 200;
/**
 * two of a kind join once their outlines are this close, in world units: about
 * one screen pixel on a phone. any touch at all, even edge to edge, is a join.
 */
export const TOUCH = 1;

/** score for making tier index k (0-based): the triangular number k(k+1)/2 */
export const scoreFor = (k: number) => (k * (k + 1)) / 2;

/**
 * what the engine needs from a skin: the size of each tier, as a fraction of jar
 * width (a circle's radius, or the radius of a circle with the same area), and
 * its shape (a circle when left out).
 */
export interface Dims {
  radii: readonly number[];
  shapes?: readonly Shape[];
}

export interface Piece {
  id: number;
  tier: number;
  x: number;
  y: number;
  r: number;
  shape: Shape;
  angle: number;
  vx: number;
  vy: number;
  /** steps since it was dropped or made */
  age: number;
  /** the game step it appeared on */
  born: number;
  /** made by a merge, not dropped */
  made: boolean;
}

export interface Merge {
  /** the tier made, or the top tier for a pair that vanished */
  tier: number;
  x: number;
  y: number;
  points: number;
  vanish: boolean;
  /** the first time this game has seen this tier */
  first: boolean;
}

interface Live {
  id: number;
  tier: number;
  r: number;
  shape: Shape;
  age: number;
  born: number;
  made: boolean;
  body: Matter.Body;
}

export interface Game {
  readonly seed: number;
  readonly radii: number[];
  readonly shapes: Shape[];
  /** how far each tier reaches sideways from its centre, upright */
  readonly reach: number[];
  steps: number;
  score: number;
  /** the piece waiting to drop */
  held: number;
  /** the one after it, shown in the preview */
  next: number;
  /** where the player is aiming, before clamping to the held piece */
  aimX: number;
  /** steps until the next drop is allowed */
  cooldown: number;
  over: boolean;
  /** 0 when nothing settled is above the line, rising to 1 at game over */
  danger: number;
  /** the biggest tier this game has seen, dropped or made */
  top: number;
  /** the biggest tier this game has made by merging (-1 before the first merge) */
  made: number;
  drops: number;
  /** merges from the most recent step, for the screen to celebrate */
  merges: Merge[];
  live: Live[];
  // internals
  engine: Matter.Engine;
  byBody: Map<number, Live>;
  random: () => number;
  nextId: number;
  above: number;
  acc: number;
}


export function create(seed: number, dims: Dims): Game {
  if (dims.radii.length < SPAWN_TIERS + 1) throw Error("a skin needs more tiers than the spawn range");
  const engine = Engine.create({
    gravity: { x: 0, y: 1, scale: 0.001 },
    positionIterations: 10,
    velocityIterations: 8,
    enableSleeping: false,
  });
  const { width: W, height: H } = JAR;
  const wall = { isStatic: true, friction: 0.2, restitution: 0.1 };
  // walls rise far above the rim so a pop can never throw a piece out
  Composite.add(engine.world, [
    Bodies.rectangle(-WALL / 2, H / 2 - H, WALL, H * 3, wall),
    Bodies.rectangle(W + WALL / 2, H / 2 - H, WALL, H * 3, wall),
    Bodies.rectangle(W / 2, H + WALL / 2, W + WALL * 2, WALL, wall),
  ]);
  const random = rng(seed);
  const pick = () => Math.floor(random() * SPAWN_TIERS);
  const held = pick();
  const radii = dims.radii.map((f) => f * W);
  const shapes = dims.radii.map((_, i) => dims.shapes?.[i] ?? "circle");
  const g: Game = {
    seed,
    radii,
    shapes,
    reach: radii.map((r, i) => reach(shapes[i], r)),
    steps: 0,
    score: 0,
    held,
    next: pick(),
    aimX: W / 2,
    cooldown: 0,
    over: false,
    danger: 0,
    top: held,
    made: -1,
    drops: 0,
    merges: [],
    live: [],
    engine,
    byBody: new Map(),
    random,
    nextId: 1,
    above: 0,
    acc: 0,
  };
  return g;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** where the held piece is, after keeping it inside the walls */
export const heldX = (g: Game) => clamp(g.aimX, g.reach[g.held], JAR.width - g.reach[g.held]);

/** aim at x (world units). anything past a wall is held against it. */
export function aim(g: Game, x: number) {
  if (Number.isFinite(x)) g.aimX = clamp(x, 0, JAR.width);
}

const FEEL = {
  restitution: 0.12,
  friction: 0.1,
  frictionStatic: 0.5,
  frictionAir: 0.012,
  density: 0.001,
  slop: 0.02,
};

/** the body for a shape: the same points the screen draws, so the edge you see is the edge that touches */
function build(shape: Shape, x: number, y: number, r: number): Matter.Body {
  const pts = outline(shape, r);
  if (!pts) return Bodies.circle(x, y, r, FEEL);
  return Body.create({ ...FEEL, label: shape, position: { x, y }, vertices: pts });
}

function spawn(g: Game, tier: number, x: number, y: number, made: boolean): Live {
  const r = g.radii[tier], shape = g.shapes[tier];
  const body = build(shape, x, y, r);
  // a merge is born settled: in the pile, it counts toward the line at once
  const piece: Live = { id: g.nextId++, tier, r, shape, age: made ? GRACE : 0, born: g.steps, made, body };
  g.live.push(piece);
  g.byBody.set(body.id, piece);
  Composite.add(g.engine.world, body);
  if (tier > g.top) g.top = tier;
  return piece;
}

function remove(g: Game, piece: Live) {
  Composite.remove(g.engine.world, piece.body);
  g.byBody.delete(piece.body.id);
  g.live.splice(g.live.indexOf(piece), 1);
}

/**
 * put a settled piece straight into the jar, outside the rules: for tests and
 * tools that need a known pile. play never calls it.
 */
export function place(g: Game, tier: number, x: number, y: number): number {
  const piece = spawn(g, tier, x, y, false);
  piece.age = GRACE;
  return piece.id;
}

/** drop the held piece where it is aimed. false while cooling down or over. */
export function drop(g: Game): boolean {
  if (g.over || g.cooldown > 0) return false;
  spawn(g, g.held, heldX(g), JAR.dropY, false);
  g.held = g.next;
  g.next = Math.floor(g.random() * SPAWN_TIERS);
  g.cooldown = COOLDOWN;
  g.drops++;
  return true;
}

/** the widest gap between two convex outlines along any of their edge normals: below zero they overlap */
function separation(a: Matter.Body, b: Matter.Body): number {
  let gap = -Infinity;
  for (const axes of [a.axes, b.axes])
    for (const n of axes) {
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a.vertices) {
        const d = v.x * n.x + v.y * n.y;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }
      for (const v of b.vertices) {
        const d = v.x * n.x + v.y * n.y;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }
      gap = Math.max(gap, minB - maxA, minA - maxB);
    }
  return gap;
}

/** are two pieces of one shape touching, edge to edge, within TOUCH? */
export function touching(a: { shape: Shape; r: number; body: Matter.Body }, b: { r: number; body: Matter.Body }): boolean {
  const pa = a.body.position, pb = b.body.position;
  if (a.shape === "circle") return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= a.r + b.r + TOUCH;
  const A = a.body.bounds, B = b.body.bounds;
  if (A.min.x - TOUCH > B.max.x || B.min.x - TOUCH > A.max.x || A.min.y - TOUCH > B.max.y || B.min.y - TOUCH > A.max.y) return false;
  return separation(a.body, b.body) <= TOUCH;
}

/**
 * resolve touching same-tier pairs: each piece merges at most once a step. a
 * pair joins on a live contact, or as soon as their outlines come within TOUCH,
 * so a kid never sees two of a kind touching that do not bloop.
 */
function merge(g: Game) {
  const found: [Live, Live][] = [];
  const seen = new Set<string>();
  const add = (a: Live, b: Live) => {
    const [x, y] = a.id < b.id ? [a, b] : [b, a];
    const key = x.id + ":" + y.id;
    if (!seen.has(key)) seen.add(key), found.push([x, y]);
  };
  for (const pair of g.engine.pairs.list) {
    if (!pair.isActive) continue;
    const a = g.byBody.get(pair.bodyA.id), b = g.byBody.get(pair.bodyB.id);
    if (a && b && a.tier === b.tier) add(a, b);
  }
  for (let i = 0; i < g.live.length; i++)
    for (let j = i + 1; j < g.live.length; j++) {
      const a = g.live[i], b = g.live[j];
      if (a.tier === b.tier && touching(a, b)) add(a, b);
    }
  // oldest first, by our own ids, so a replay resolves them in the same order
  found.sort(([a1, b1], [a2, b2]) => a1.id - a2.id || b1.id - b2.id);
  const used = new Set<Live>();
  const last = g.radii.length - 1;
  for (const [a, b] of found) {
    if (g.merges.length >= MAX_MERGES) break;
    if (used.has(a) || used.has(b)) continue;
    used.add(a).add(b);
    const pa = a.body.position, pb = b.body.position;
    const va = a.body.velocity, vb = b.body.velocity;
    const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2;
    remove(g, a);
    remove(g, b);
    if (a.tier === last) {
      // two of the biggest: both vanish, the biggest prize
      const points = scoreFor(last + 1);
      g.score += points;
      g.merges.push({ tier: last, x, y, points, vanish: true, first: false });
      continue;
    }
    const tier = a.tier + 1;
    const first = tier > g.top;
    const w = g.reach[tier];
    const made = spawn(g, tier, clamp(x, w, JAR.width - w), y, true);
    Body.setVelocity(made.body, { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 });
    const points = scoreFor(tier);
    g.score += points;
    if (tier > g.made) g.made = tier;
    g.merges.push({ tier, x, y, points, vanish: false, first });
  }
}

/** the highest point of a piece: a circle's exact top, or the top of a shape's turned outline */
function top(p: Live): number {
  if (p.shape === "circle") return p.body.position.y - p.r;
  let y = Infinity;
  for (const v of p.body.vertices) if (v.y < y) y = v.y;
  return y;
}

/** one fixed 1/60 s step of the world and the rules */
export function step(g: Game) {
  g.merges = [];
  if (g.over) return;
  g.steps++;
  if (g.cooldown > 0) g.cooldown--;
  Engine.update(g.engine, STEP * 1000);
  merge(g);
  let high = false;
  for (const p of g.live) {
    p.age++;
    if (p.age > GRACE && top(p) < JAR.line) high = true;
  }
  g.above = high ? g.above + 1 : 0;
  g.danger = Math.min(1, g.above / OVER_AFTER);
  if (g.above >= OVER_AFTER) g.over = true;
}

/**
 * real time in, whole steps out: the accumulator keeps the world on 1/60 s
 * slices at any frame rate. returns the merges made during this call.
 */
export function advance(g: Game, seconds: number): Merge[] {
  const made: Merge[] = [];
  g.acc += Math.min(Math.max(seconds, 0), 0.25);
  let n = 0;
  while (g.acc >= STEP && n < MAX_CATCHUP) {
    step(g);
    made.push(...g.merges);
    g.acc -= STEP;
    n++;
  }
  if (g.acc >= STEP) g.acc = 0;
  return made;
}

/** a plain copy of everything a player could see */
export function snapshot(g: Game) {
  return {
    seed: g.seed,
    steps: g.steps,
    score: g.score,
    held: g.held,
    next: g.next,
    x: heldX(g),
    cooldown: g.cooldown,
    over: g.over,
    danger: g.danger,
    top: g.top,
    made: g.made,
    drops: g.drops,
    pieces: pieces(g),
  };
}

export function pieces(g: Game): Piece[] {
  return g.live.map((p) => ({
    id: p.id,
    tier: p.tier,
    x: p.body.position.x,
    y: p.body.position.y,
    r: p.r,
    shape: p.shape,
    angle: p.body.angle,
    vx: p.body.velocity.x,
    vy: p.body.velocity.y,
    age: p.age,
    born: p.born,
    made: p.made,
  }));
}
