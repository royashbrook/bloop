import { test, expect } from "@playwright/test";

// the faces (#4), seen through a read-only window: window.__bloop.faces()
const faces = (page) => page.evaluate(() => window.__bloop.faces());
async function fill(page, look, drops = 14) {
  await page.addInitScript((l) => localStorage.setItem("bloop:look", l), look);
  await page.clock.install();
  await page.goto("/?seed=7");
  const box = await page.locator("#jar").boundingBox();
  const xs = [0.15, 0.5, 0.85, 0.3, 0.7];
  for (let i = 0; i < drops; i++) {
    await page.mouse.click(box.x + box.width * xs[i % xs.length], box.y + box.height * 0.5);
    await page.clock.runFor(600);
  }
}

for (const look of ["shapes", "cells", "puppies"])
  test(`${look}: faces stay upright while the pieces roll`, async ({ page }) => {
    await fill(page, look);
    await page.clock.runFor(2000);
    const { list } = await faces(page);
    expect(list.length).toBeGreaterThan(4);
    // the bodies really did turn
    expect(Math.max(...list.map((f) => Math.abs(f.angle)))).toBeGreaterThan(0.05);
    for (const f of list) expect(Math.abs(f.turn), `piece ${f.id}`).toBeLessThan(1e-9);
  });

test("faces blink and glance while they play", async ({ page }) => {
  await fill(page, "cells", 6);
  await page.clock.runFor(8000);
  const { reduced, counts } = await faces(page);
  expect(reduced).toBe(false);
  expect(counts.blink).toBeGreaterThan(0);
  expect(counts.look).toBeGreaterThan(0);
});

test.describe("with reduced motion", () => {
  test("no blinking and no glancing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fill(page, "cells", 6);
    await page.clock.runFor(8000);
    const { reduced, counts, list } = await faces(page);
    expect(reduced).toBe(true);
    expect(counts.frames).toBeGreaterThan(100);
    expect(counts.blink).toBe(0);
    expect(counts.look).toBe(0);
    for (const f of list) expect([f.blink, f.lx, f.ly]).toEqual([false, 0, 0]);
  });
});
