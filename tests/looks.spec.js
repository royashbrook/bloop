import { test, expect } from "@playwright/test";

// the looks (#3, #14): bubbles for a fresh player, a saved look kept; a pick on an
// empty jar switches now, mid-game it waits for the next game without touching
// the run, and the pick survives a reload
const state = (page) => page.evaluate(() => window.__bloop.state());
const look = (page) => page.evaluate(() => window.__bloop.look());
async function openLooks(page) {
  await page.click("#about");
  await page.click("#looks");
  await expect(page.locator(".sheet h2")).toHaveText("looks");
}

const LOOKS = ["bubbles", "numbers", "cells", "puppies", "kitties", "shapes"];

test("the looks sheet shows every look with a few of its pieces, bubbles first and on for a fresh player, numbers next", async ({ page }) => {
  await page.goto("/");
  expect(await look(page)).toEqual({ now: "bubbles", next: null });
  await openLooks(page);
  await expect(page.locator(".looks .look")).toHaveCount(LOOKS.length);
  expect(await page.locator(".looks .look").evaluateAll((els) => els.map((e) => e.id))).toEqual(LOOKS.map((id) => `look-${id}`));
  for (const id of LOOKS) {
    await expect(page.locator(`#look-${id} .look-name`)).toHaveText(id);
    await expect(page.locator(`#look-${id} canvas`)).toHaveCount(4);
  }
  await expect(page.locator("#look-bubbles")).toHaveAttribute("aria-pressed", "true");
  await page.click("#close");
  await page.click("#about");
  await expect(page.locator(".ladder")).toContainText("big bloop");
});

for (const id of ["cells", "puppies", "kitties", "shapes"])
  test(`a player who picked ${id} before bubbles keeps ${id}`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.getItem("bloop:look") ?? localStorage.setItem("bloop:look", l), id);
    await page.goto("/");
    expect(await look(page)).toEqual({ now: id, next: null });
    await page.reload();
    expect(await look(page)).toEqual({ now: id, next: null });
  });

test("numbers: every block shows its number, 2 up to 2048, drawn on the jar as it plays", async ({ page }) => {
  // every bit of text any canvas draws, so the test sees the numbers themselves
  await page.addInitScript(() => {
    window.__texts = new Set();
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) {
      window.__texts.add(String(t));
      return fill.call(this, t, ...rest);
    };
  });
  await page.goto("/?seed=3");
  await openLooks(page);
  await page.click("#look-numbers");
  expect(await look(page)).toEqual({ now: "numbers", next: null });
  await page.click("#close");
  // forget what the sheet drew: from here on, only the jar and the hud draw
  await page.evaluate(() => (window.__texts = new Set()));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Space");
    await expect.poll(() => state(page).then((s) => s.pieces.length === i + 1 && s.cooldown === 0)).toBe(true);
  }
  const s = await state(page);
  expect(s.pieces.every((p) => p.shape === "square")).toBe(true);
  const texts = await page.evaluate(() => [...window.__texts]);
  for (const t of [...s.pieces.map((p) => p.tier), s.held, s.next]) expect(texts, `tier ${t}`).toContain(String(2 ** (t + 1)));
  await page.click("#about");
  await expect(page.locator(".ladder")).toContainText("2048");
  expect(await page.locator(".ladder li").allTextContents()).toEqual(["2", "4", "8", "16", "32", "64", "128", "256", "512", "1024", "2048"]);
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
  expect(await look(page)).toEqual({ now: "bubbles", next: "kitties" });
  await expect(page.locator(".look-note")).toContainText("kitties starts with your next game");
  await expect(page.locator("#look-kitties .look-tag")).toHaveText("next game");
  await expect(page.locator("#look-bubbles .look-tag")).toHaveText("this game");
  await expect(page.locator("#look-kitties")).toHaveAttribute("aria-pressed", "true");
  // the run is untouched: same game, same pieces, nothing moved while the sheet was up
  expect(await state(page)).toEqual(before);
  await page.click("#close");
  await page.click("#about");
  await expect(page.locator("#looks")).toHaveText("looks: bubbles (next game: kitties)");
  await expect(page.locator(".ladder")).toContainText("big bloop");
  await page.click("#close");
  // picking the look you have takes the change back
  await openLooks(page);
  await page.click("#look-bubbles");
  expect(await look(page)).toEqual({ now: "bubbles", next: null });
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
  for (const id of LOOKS) {
    const box = await page.locator(`#look-${id}`).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
});
