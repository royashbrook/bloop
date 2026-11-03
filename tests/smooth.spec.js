import { test, expect } from "@playwright/test";

// smooth drawing between steps (#16): at speed 1.25 a 60 Hz screen runs one
// step a frame, then two every fourth or fifth. drawn as they are, a falling
// piece jumps double on those frames. drawn between its last two steps it falls
// smoothly. a fake clock gives even 16 ms frames, one at a time.
const drawnY = (page, id) => page.evaluate((i) => window.__bloop.drawn().find((p) => p.id === i)?.y ?? null, id);
const state = (page) => page.evaluate(() => window.__bloop.state());

for (const speed of ["1.25", "0.75"])
  test(`at speed ${speed} a falling piece moves smoothly from frame to frame`, async ({ page }) => {
    await page.addInitScript((s) => localStorage.setItem("bloop:speed", s), speed);
    await page.clock.install();
    await page.goto("/?seed=7");
    await page.clock.pauseAt(Date.now() + 1000);
    await page.clock.runFor(100);
    expect((await state(page)).speed).toBe(Number(speed));
    const box = await page.locator("#jar").boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    const { pieces } = await state(page);
    expect(pieces).toHaveLength(1);
    const id = pieces[0].id;

    // sample the drawn height once a frame while it is in free fall
    const ys = [];
    const steps = [];
    let lastVy = -Infinity;
    for (let i = 0; i < 60; i++) {
      await page.clock.runFor(16);
      const s = await state(page);
      const p = s.pieces.find((q) => q.id === id);
      // it hit something: free fall is over
      if (!p || p.vy < lastVy - 0.01) break;
      lastVy = p.vy;
      ys.push(await drawnY(page, id));
      steps.push(s.steps);
    }
    expect(ys.length).toBeGreaterThan(20);
    // the world really did run an uneven number of steps a frame
    const perFrame = steps.slice(1).map((s, i) => s - steps[i]);
    expect(new Set(perFrame).size, `steps a frame: ${perFrame}`).toBeGreaterThan(1);

    // frame to frame, once it is moving: each move within 1.6x of the one before,
    // and none more than 1.6x the median of its neighbours
    const d = ys.slice(1).map((y, i) => y - ys[i]);
    const moving = d.filter((x, i) => i > 0 && d[i - 1] > 1.5);
    expect(moving.length).toBeGreaterThan(10);
    const jumps = [];
    for (let i = 1; i < d.length; i++) {
      if (d[i - 1] <= 1.5) continue;
      const r = d[i] / d[i - 1];
      if (r > 1.6 || r < 1 / 1.6) jumps.push(`frame ${i}: ${d[i - 1].toFixed(2)} then ${d[i].toFixed(2)}`);
    }
    for (let i = 2; i < d.length - 2; i++) {
      const around = [d[i - 2], d[i - 1], d[i + 1], d[i + 2]].sort((a, b) => a - b);
      const median = (around[1] + around[2]) / 2;
      if (median > 1.5 && d[i] > 1.6 * median) jumps.push(`frame ${i}: ${d[i].toFixed(2)} against ${median.toFixed(2)}`);
    }
    expect(jumps, `moves: ${d.map((x) => x.toFixed(2)).join(" ")}`).toEqual([]);
  });
