import { test, expect } from "@playwright/test";

// the looks (#3): a pick on an empty jar switches now, mid-game it waits for the
// next game without touching the run, and the pick survives a reload
const state = (page) => page.evaluate(() => window.__bloop.state());
const look = (page) => page.evaluate(() => window.__bloop.look());
async function openLooks(page) {
  await page.click("#about");
  await page.click("#looks");
  await expect(page.locator(".sheet h2")).toHaveText("looks");
}

test("the looks sheet shows every look with a few of its pieces, cells on by default", async ({ page }) => {
  await page.goto("/");
  expect(await look(page)).toEqual({ now: "cells", next: null });
  await openLooks(page);
  for (const id of ["cells", "puppies", "kitties", "shapes"]) {
    await expect(page.locator(`#look-${id} .look-name`)).toHaveText(id);
    await expect(page.locator(`#look-${id} canvas`)).toHaveCount(4);
  }
  await expect(page.locator("#look-cells")).toHaveAttribute("aria-pressed", "true");
});

test("picking a look on an empty jar switches right away", async ({ page }) => {
  await page.goto("/?seed=3");
  await openLooks(page);
  await page.click("#look-shapes");
  expect(await look(page)).toEqual({ now: "shapes", next: null });
  await expect(page.locator("#look-shapes")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".look-note")).toHaveCount(0);
  await page.click("#close");
  // the jar plays with the new look's shapes
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  const [piece] = (await state(page)).pieces;
  const shapes = ["circle", "square", "triangle", "hexagon", "circle"];
  expect(piece.shape).toBe(shapes[piece.tier]);
  await page.click("#about");
  await expect(page.locator(".ladder")).toContainText("hive");
});

test("picking a look mid-game waits for the next game and leaves the run as it is", async ({ page }) => {
  await page.goto("/?seed=5");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await openLooks(page);
  const before = await state(page);
  await page.click("#look-kitties");
  expect(await look(page)).toEqual({ now: "cells", next: "kitties" });
  await expect(page.locator(".look-note")).toContainText("kitties starts with your next game");
  await expect(page.locator("#look-kitties .look-tag")).toHaveText("next game");
  await expect(page.locator("#look-cells .look-tag")).toHaveText("this game");
  await expect(page.locator("#look-kitties")).toHaveAttribute("aria-pressed", "true");
  // the run is untouched: same game, same pieces, nothing moved while the sheet was up
  expect(await state(page)).toEqual(before);
  await page.click("#close");
  await page.click("#about");
  await expect(page.locator("#looks")).toHaveText("looks: cells (next game: kitties)");
  await expect(page.locator(".ladder")).toContainText("whale");
  await page.click("#close");
  // picking the look you have takes the change back
  await openLooks(page);
  await page.click("#look-cells");
  expect(await look(page)).toEqual({ now: "cells", next: null });
  await page.click("#look-kitties");
  await page.click("#close");
  // the next game is kitties
  await page.click("#restart");
  await page.click("#confirm-restart");
  expect(await look(page)).toEqual({ now: "kitties", next: null });
  expect((await state(page)).pieces).toEqual([]);
});

test("the pick survives a reload, even one made mid-game", async ({ page }) => {
  await page.goto("/");
  await openLooks(page);
  await page.click("#look-puppies");
  await page.reload();
  expect(await look(page)).toEqual({ now: "puppies", next: null });
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await openLooks(page);
  await page.click("#look-shapes");
  expect(await look(page)).toEqual({ now: "puppies", next: "shapes" });
  await page.reload();
  expect(await look(page)).toEqual({ now: "shapes", next: null });
});

test("320 wide: the looks sheet fits with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await openLooks(page);
  const wide = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector(".card").scrollWidth));
  expect(wide).toBeLessThanOrEqual(320);
  for (const id of ["cells", "puppies", "kitties", "shapes"]) {
    const box = await page.locator(`#look-${id}`).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
});
