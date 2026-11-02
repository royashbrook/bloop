import { test, expect } from "@playwright/test";
import { create, scoreFor } from "../src/lib/engine/game.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";

// jiggle (#6): off by default, turned on with a tap that asks for motion, a shake
// tosses the pieces, and a run or a best made with it on carries a mark
const state = (page) => page.evaluate(() => window.__bloop.state());
/** stand in for the iOS motion prompt: the real one cannot be driven from a test */
const answer = (page, reply) =>
  page.addInitScript((r) => {
    window.DeviceMotionEvent ??= class extends Event {};
    window.DeviceMotionEvent.requestPermission = async () => r;
  }, reply);
/** a hard shake, as the phone would report it */
const shake = (page) =>
  page.evaluate(() => {
    const e = new Event("devicemotion");
    Object.defineProperty(e, "acceleration", { value: { x: 32, y: -18, z: 6 } });
    dispatchEvent(e);
  });
async function turnOn(page) {
  await page.click("#about");
  await page.click("#jiggle");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "true");
  await page.click("#close");
}
async function mergeTwins(page) {
  let seed = 1;
  while (create(seed, dims(cells)).held !== create(seed, dims(cells)).next) seed++;
  const tier = create(seed, dims(cells)).held;
  await page.goto(`/?seed=${seed}`);
  const box = await page.locator("#jar").boundingBox();
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.pieces.length === 1 && s.cooldown === 0)).toBe(true);
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.score)).toBe(scoreFor(tier + 1));
}

test("jiggle is off by default, and a shake does nothing then", async ({ page }) => {
  await page.goto("/");
  await page.click("#about");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#jiggle")).toHaveText("jiggle: off");
  await page.click("#close");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await shake(page);
  const s = await state(page);
  expect([s.jiggled, s.jiggles]).toEqual([false, 0]);
});

test("allowed: jiggle turns on, marks the run, and a shake tosses the pieces up", async ({ page }) => {
  await answer(page, "granted");
  await page.goto("/");
  await page.keyboard.press("Space");
  // at rest on the floor (a fresh drop also has no speed, at the top, so check where it is)
  await expect.poll(() => state(page).then((s) => s.pieces.length === 1 && s.pieces[0].y > 400 && Math.abs(s.pieces[0].vy) < 0.05)).toBe(true);
  expect((await state(page)).jiggled).toBe(false);
  await turnOn(page);
  expect((await state(page)).jiggled).toBe(true);
  // not while a sheet is up
  await page.click("#about");
  await shake(page);
  expect((await state(page)).jiggles).toBe(0);
  await page.click("#close");
  const before = (await state(page)).pieces[0];
  await shake(page);
  const after = await state(page);
  expect(after.jiggles).toBe(1);
  expect(after.pieces[0].vy).toBeLessThan(-3);
  // the piece really leaves the floor
  await expect.poll(() => state(page).then((s) => s.pieces[0].y), { timeout: 2000 }).toBeLessThan(before.y - 20);
  // a second shake straight after is the same shake
  await shake(page);
  expect((await state(page)).jiggles).toBe(1);
});

test("denied: the switch says so and stays off", async ({ page }) => {
  await answer(page, "denied");
  await page.goto("/");
  await page.click("#about");
  await page.click("#jiggle");
  await expect(page.locator(".jiggle-note")).toHaveText("motion was not allowed, so jiggle stays off");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "false");
  expect((await state(page)).jiggled).toBe(false);
  await page.reload();
  await page.click("#about");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "false");
});

test("no motion at all: the switch says so and stays off", async ({ page }) => {
  await page.addInitScript(() => delete window.DeviceMotionEvent);
  await page.goto("/");
  await page.click("#about");
  await page.click("#jiggle");
  await expect(page.locator(".jiggle-note")).toHaveText("this device can't jiggle");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "false");
});

test("a best made with jiggle on is marked, and a reload keeps the switch and the mark", async ({ page }) => {
  await answer(page, "granted");
  await page.goto("/");
  await turnOn(page);
  await expect(page.locator("#best .shake-mark")).toHaveCount(0);
  await mergeTwins(page);
  expect((await state(page)).jiggled).toBe(true);
  await expect(page.locator("#best .shake-mark")).toHaveCount(1);
  await expect(page.locator("#best .shake-mark")).toHaveAttribute("aria-label", "made with jiggle on");
  await page.reload();
  await expect(page.locator("#best .shake-mark")).toHaveCount(1);
  expect((await state(page)).jiggled).toBe(true);
  await page.click("#about");
  await expect(page.locator("#jiggle")).toHaveAttribute("aria-checked", "true");
  // switched off, a new run is not marked
  await page.click("#jiggle");
  await page.click("#close");
  await page.click("#restart");
  expect((await state(page)).jiggled).toBe(false);
});

test("a full jar played with jiggle on says so on the card", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the card is the same page in both engines; one long run is enough");
  test.setTimeout(480000);
  await answer(page, "granted");
  await page.clock.install();
  await page.goto("/?seed=4");
  await turnOn(page);
  const box = await page.locator("#jar").boundingBox();
  const spots = [0.05, 0.5, 0.95].map((f) => ({ x: box.x + box.width * f, y: box.y + box.height / 2 }));
  for (let i = 0; i < 600 && !(await page.locator("#over").isVisible()); i++) {
    await page.mouse.click(spots[i % 3].x, spots[i % 3].y);
    await page.clock.runFor(520);
  }
  await expect(page.locator("#over .jiggled")).toHaveText("jiggle on");
});
