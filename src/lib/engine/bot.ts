// a headless player with no plan: it aims at random and drops as soon as it may.
// it proves a whole game runs end to end, and gives a floor for how far play gets.
import { aim, create, drop, JAR, step, type Dims } from "./game.ts";
import { rng } from "./rng.ts";

export interface BotRun {
  seed: number;
  over: boolean;
  steps: number;
  drops: number;
  score: number;
  /** the biggest tier made by merging, 0-based (-1: none) */
  made: number;
}

export function randomBot(seed: number, dims: Dims, maxSteps = 60 * 60 * 20): BotRun {
  const g = create(seed, dims);
  const hand = rng(seed ^ 0x9e3779b9);
  aim(g, hand() * JAR.width);
  while (!g.over && g.steps < maxSteps) {
    if (g.cooldown === 0) {
      drop(g);
      aim(g, hand() * JAR.width);
    }
    step(g);
  }
  return { seed, over: g.over, steps: g.steps, drops: g.drops, score: g.score, made: g.made };
}
