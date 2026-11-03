// how far a random player gets: aims anywhere, drops as soon as it may.
// usage: npm run bot [-- seeds [size [speed]]]   (default 20 seeds, size 1: the skin's own size, speed 1)
// the bot drops on the step its cooldown ends, so speed changes only the full-jar
// timer, which counts real seconds: two seconds is more steps at a higher speed.
import { randomBot } from "../src/lib/engine/bot.ts";
import { DEFAULT_SKIN } from "../src/lib/skins/index.ts";
import { dims } from "../src/lib/skins/types.ts";

const seeds = Number(process.argv[2] || 20);
const scale = Number(process.argv[3] || 1);
const speed = Number(process.argv[4] || 1);
const skin = DEFAULT_SKIN;
const runs = [];
for (let seed = 1; seed <= seeds; seed++) {
  const run = randomBot(seed, dims(skin, scale), speed);
  runs.push(run);
  const tier = run.made >= 0 ? `${skin.tiers[run.made].name} (tier ${run.made + 1})` : "none";
  console.log(`seed ${String(seed).padStart(3)}: score ${String(run.score).padStart(5)}, top ${tier}, ${run.drops} drops, ${(run.steps / 60).toFixed(0)}s${run.over ? "" : ", never filled"}`);
}
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const scores = sorted(runs.map((r) => r.score));
const median = scores[Math.floor(scores.length / 2)];
const drops = sorted(runs.map((r) => r.drops));
console.log(`\npiece size ${scale}, speed ${speed}`);
console.log(`drops median ${drops[Math.floor(drops.length / 2)]}, range ${drops[0]}-${drops.at(-1)}`);
const tops = {};
for (const r of runs) tops[skin.tiers[r.made]?.name ?? "none"] = (tops[skin.tiers[r.made]?.name ?? "none"] || 0) + 1;
console.log(`score median ${median}, range ${scores[0]}-${scores.at(-1)}`);
console.log(`top tier made: ${Object.entries(tops).map(([k, v]) => `${k} x${v}`).join(", ")}`);
