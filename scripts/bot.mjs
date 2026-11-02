// how far a random player gets: aims anywhere, drops as soon as it may.
// usage: npm run bot [-- seeds]   (default 20 seeds)
import { randomBot } from "../src/lib/engine/bot.ts";
import { DEFAULT_SKIN } from "../src/lib/skins/index.ts";
import { dims } from "../src/lib/skins/types.ts";

const seeds = Number(process.argv[2] || 20);
const skin = DEFAULT_SKIN;
const runs = [];
for (let seed = 1; seed <= seeds; seed++) {
  const run = randomBot(seed, dims(skin));
  runs.push(run);
  const tier = run.made >= 0 ? `${skin.tiers[run.made].name} (tier ${run.made + 1})` : "none";
  console.log(`seed ${String(seed).padStart(3)}: score ${String(run.score).padStart(5)}, top ${tier}, ${run.drops} drops, ${(run.steps / 60).toFixed(0)}s${run.over ? "" : ", never filled"}`);
}
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const scores = sorted(runs.map((r) => r.score));
const median = scores[Math.floor(scores.length / 2)];
const tops = {};
for (const r of runs) tops[skin.tiers[r.made]?.name ?? "none"] = (tops[skin.tiers[r.made]?.name ?? "none"] || 0) + 1;
console.log(`\nscore median ${median}, range ${scores[0]}-${scores.at(-1)}`);
console.log(`top tier made: ${Object.entries(tops).map(([k, v]) => `${k} x${v}`).join(", ")}`);
