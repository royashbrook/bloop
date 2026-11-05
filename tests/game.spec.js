import { test, expect } from "@playwright/test";
import { create, scoreFor, JAR } from "../src/lib/engine/game.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";
import { MARGIN } from "../src/lib/draw.ts";

// the page keeps a read-only window onto the engine: window.__bloop.state()
const state = (page) => page.evaluate(() => window.__bloop.state());
const count = (page) => state(page).then((s) => s.pieces.length);
// a point on the jar at a fraction of its width (and of its height)
async function at(page, fx, fy = 0.5) {
  const box = await page.locator("#jar").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}
// the first seed whose first two drops are the same tier: two drops on one spot must merge
function twinSeed() {
  let seed = 1;
  for (;;) {
    const g = create(seed, dims(cells));
    if (g.held === g.next) return { seed, tier: g.held };
    seed++;
  }
}
async function mergeTwins(page) {
  const { seed, tier } = twinSeed();
  await page.goto(`/?seed=${seed}`);
  const centre = await at(page, 0.5);
  await page.touchscreen.tap(centre.x, centre.y);
  await expect.poll(() => count(page)).toBe(1);
  await expect.poll(() => state(page).then((s) => s.cooldown)).toBe(0);
  await page.touchscreen.tap(centre.x, centre.y);
  return tier;
}

test("the page loads and plays with no console or page errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.locator("#jar")).toBeVisible();
  const p = await at(page, 0.3);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => count(page)).toBe(1);
  await page.waitForTimeout(800);
  await page.click("#about");
  await page.click("#close");
  expect(errors).toEqual([]);
});

test("a tap drops a piece where it lands, and it falls into the jar", async ({ page }) => {
  await page.goto("/");
  expect(await count(page)).toBe(0);
  const p = await at(page, 0.3, 0.6);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => count(page)).toBe(1);
  const [piece] = (await state(page)).pieces;
  // the canvas shows the glass margin each side of the 400 unit floor
  expect(Math.abs(piece.x - (0.3 * (JAR.width + 2 * MARGIN) - MARGIN))).toBeLessThan(3);
  await expect.poll(() => state(page).then((s) => s.pieces[0].y), { timeout: 4000 }).toBeGreaterThan(JAR.height * 0.7);
});

test("drag anywhere aims, and letting go drops at the finger", async ({ page }) => {
  await page.goto("/");
  const from = await at(page, 0.2, 0.8);
  const to = await at(page, 0.75, 0.9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y);
  // still held: aimed, nothing dropped yet
  expect(await count(page)).toBe(0);
  expect((await state(page)).x).toBeGreaterThan(JAR.width * 0.6);
  await page.mouse.up();
  await expect.poll(() => count(page)).toBe(1);
  expect((await state(page)).pieces[0].x).toBeGreaterThan(JAR.width * 0.6);
});

test("the held piece stays inside the walls however far the finger goes", async ({ page }) => {
  await page.goto("/");
  const start = await at(page, 0.5, 0.8);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // the finger keeps the piece while it slides off the jar, to the screen edges
  await page.mouse.move(1, start.y);
  const s = await state(page);
  // the held piece's own size, at the game's piece size
  const r = cells.tiers[s.held].radius * JAR.width * s.scale;
  expect(s.x).toBeCloseTo(r, 5);
  await page.mouse.move(389, start.y);
  expect((await state(page)).x).toBeCloseTo(JAR.width - r, 5);
  await page.mouse.up();
});

test("tapping fast drops one piece per cooldown, not one per tap", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.clock.pauseAt(Date.now() + 1000);
  const p = await at(page, 0.5);
  for (let i = 0; i < 8; i++) await page.touchscreen.tap(p.x, p.y);
  expect(await count(page)).toBe(1);
  await page.clock.runFor(600);
  await page.touchscreen.tap(p.x, p.y);
  expect(await count(page)).toBe(2);
});

test("arrow keys aim and space drops", async ({ page }) => {
  await page.goto("/");
  const start = (await state(page)).x;
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect((await state(page)).x).toBeLessThan(start);
  await page.keyboard.press("Space");
  await expect.poll(() => count(page)).toBe(1);
});

test("two of the same dropped on each other merge into the next one up", async ({ page }) => {
  const tier = await mergeTwins(page);
  await expect.poll(() => state(page).then((s) => s.pieces.map((p) => p.tier)), { timeout: 5000 }).toEqual([tier + 1]);
  await expect(page.locator("#score b")).toHaveText(String(scoreFor(tier + 1)));
});

test("the best score survives a reload", async ({ page }) => {
  const tier = await mergeTwins(page);
  const points = String(scoreFor(tier + 1));
  await expect(page.locator("#best b")).toHaveText(points);
  await page.reload();
  await expect(page.locator("#score b")).toHaveText("0");
  await expect(page.locator("#best b")).toHaveText(points);
});

test("a full jar shows the card, and play again starts fresh", async ({ page }) => {
  // a whole game through the page: ~50s locally, and a busy ci runner has taken over 3x that
  test.setTimeout(480000);
  // a fake clock runs the game as fast as the browser can draw it
  await page.clock.install();
  await page.goto("/?seed=4");
  const spots = [await at(page, 0.05), await at(page, 0.5), await at(page, 0.95)];
  let warned = false;
  for (let i = 0; i < 600 && !(await page.locator("#over").isVisible()); i++) {
    const s = spots[i % 3];
    await page.mouse.click(s.x, s.y);
    await page.clock.runFor(520);
    warned ||= await page.locator(".careful").isVisible();
  }
  await expect(page.locator("#over")).toBeVisible();
  expect(warned).toBe(true);
  const final = await state(page);
  expect(final.over).toBe(true);
  await expect(page.locator("#over")).toContainText(`score ${final.score}`);
  await expect(page.locator("#over h2")).toHaveText("jar's full!");
  // a tap on the jar, under the card, does nothing now
  const below = await at(page, 0.5, 0.95);
  await page.mouse.click(below.x, below.y);
  expect(await count(page)).toBe(final.pieces.length);
  await page.click("#again");
  await expect(page.locator("#over")).toHaveCount(0);
  await expect(page.locator("#score b")).toHaveText("0");
  const fresh = await state(page);
  expect(fresh.pieces).toEqual([]);
  expect(fresh.over).toBe(false);
  expect(fresh.score).toBe(0);
  await expect(page.locator("#best b")).toHaveText(String(final.score));
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }])
  test(`${size.width}x${size.height}: no sideways scroll, the jar and the hud fit`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const fit = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(fit.doc).toBeLessThanOrEqual(size.width);
    expect(fit.body).toBeLessThanOrEqual(size.width);
    for (const sel of ["#jar", "#about", "#restart", "#next", "#score", "#best"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box.x, sel).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, sel).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, sel).toBeLessThanOrEqual(size.height);
    }
    // the canvas draws at the screen's real density
    const dpr = await page.evaluate(() => devicePixelRatio);
    const jar = await page.locator("#jar").evaluate((c) => ({ w: c.width, css: c.getBoundingClientRect().width }));
    expect(Math.abs(jar.w - jar.css * Math.min(3, dpr))).toBeLessThanOrEqual(1);
  });

test("start over on an empty jar is one tap, no question", async ({ page }) => {
  await page.goto("/");
  await page.click("#restart");
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect((await state(page)).pieces).toEqual([]);
});

test("start over mid-game asks first; keep playing leaves the exact run, start over clears it", async ({ page }) => {
  await mergeTwins(page);
  await expect.poll(() => state(page).then((s) => s.score)).toBeGreaterThan(0);
  await page.click("#restart");
  await expect(page.locator(".sheet h2")).toHaveText("start over?");
  // the world holds still while it asks
  const asked = await state(page);
  await page.waitForTimeout(600);
  expect(await state(page)).toEqual(asked);
  await page.click("#close");
  await expect(page.locator(".sheet")).toHaveCount(0);
  // the same game and the same deal: seed, drops, held and next all unchanged
  const kept = await state(page);
  for (const k of ["seed", "drops", "score", "held", "next", "made"]) expect(kept[k], k).toBe(asked[k]);
  expect(kept.pieces.map((p) => p.tier)).toEqual(asked.pieces.map((p) => p.tier));
  const best = await page.locator("#best b").textContent();
  await page.click("#restart");
  await page.click("#confirm-restart");
  await expect(page.locator(".sheet")).toHaveCount(0);
  const s = await state(page);
  expect(s.pieces).toEqual([]);
  expect(s.score).toBe(0);
  await expect(page.locator("#score b")).toHaveText("0");
  await expect(page.locator("#best b")).toHaveText(best);
});

// merge on the first touch (#5): a pair that lands with its outlines a hair apart
// joins. under the old rule (a physics contact only) they sat side by side forever.
test("two of a kind that land with their outlines touching join", async ({ page }) => {
  // a wide jar: under a unit per css pixel, so a whole-pixel aim can land inside the 1 unit window
  await page.setViewportSize({ width: 520, height: 900 });
  // the two smallest tiers land flat (an even-sided body), so nothing rolls
  let seed = 1;
  for (;; seed++) {
    const g = create(seed, dims(cells));
    if (g.held === g.next && g.held <= 1) break;
  }
  const tier = create(seed, dims(cells)).held;
  await page.goto(`/?seed=${seed}`);
  const box = await page.locator("#jar").boundingBox();
  const perUnit = box.width / (JAR.width + 2 * MARGIN);
  expect(perUnit).toBeGreaterThan(1.05);
  const y = box.y + box.height * 0.6;
  // the first against the left wall
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => state(page).then((s) => s.pieces.length === 1 && Math.abs(s.pieces[0].vy) < 0.01 && s.cooldown === 0)).toBe(true);
  const first = (await state(page)).pieces[0];
  // its size in this game, at the piece size the game was made with
  const r = first.r;
  // aim the second so its edge sits half a unit from the first one's
  const want = first.x + 2 * r + 0.5;
  const guess = Math.round(box.x + (want + MARGIN) * perUnit);
  await page.mouse.move(guess, y);
  await page.mouse.down();
  let best = { gap: Infinity, at: guess };
  for (let px = guess - 2; px <= guess + 2; px++) {
    await page.mouse.move(px, y);
    const gap = (await state(page)).x - first.x - 2 * r;
    if (gap > 0.05 && gap < 0.95 && Math.abs(gap - 0.5) < Math.abs(best.gap - 0.5)) best = { gap, at: px };
  }
  expect(best.gap, "an aim inside the window").toBeLessThan(1);
  await page.mouse.move(best.at, y);
  await page.mouse.up();
  // they do not overlap on the way down, so only the touch rule can join them
  await expect.poll(() => state(page).then((s) => s.pieces.map((p) => p.tier)), { timeout: 5000 }).toEqual([tier + 1]);
});
