import { test, expect } from "@playwright/test";
import { create, scoreFor, JAR } from "../src/lib/engine/game.ts";
import { grow } from "../src/lib/engine/size.ts";
import { bubbles } from "../src/lib/skins/bubbles.ts";
import { dims } from "../src/lib/skins/types.ts";

// size and speed (#15, #16): one sheet, a slider each. the size slider's picture
// follows the finger; a pick on an empty or finished jar switches now, mid-game
// it waits for the next game without touching the run; the picks survive a
// reload; and every size and speed keeps its own best in the one saved record
const state = (page) => page.evaluate(() => window.__bloop.state());
const size = (page) => page.evaluate(() => window.__bloop.size());
const speed = (page) => page.evaluate(() => window.__bloop.speed());
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bloop:best")));
async function openSettings(page) {
  await page.click("#about");
  await page.click("#settings");
  await expect(page.locator(".sheet h2")).toHaveText("size & speed");
}
/** move a slider as a finger would: the value changes (input), and on let go it is picked (change) */
const slide = (page, id, value, letGo = true) =>
  page.locator(`#${id}`).evaluate(
    (el, [v, done]) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (done) el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [value, letGo],
  );
async function pick(page, { size: z, speed: v }) {
  await openSettings(page);
  if (z !== undefined) await slide(page, "size-slider", z);
  if (v !== undefined) await slide(page, "speed-slider", v);
  await page.click("#close");
}
/** how much of the preview's width the drawn pieces take, read off its pixels */
const drawn = (page) =>
  page.locator("#size-preview").evaluate((c) => {
    const { data, width, height } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    let lo = width, hi = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
    return hi < 0 ? 0 : (hi - lo + 1) / width;
  });
// the first seed whose first two drops are the same tier (the deal is the same at every size and speed)
let twin = 1;
while (create(twin, dims(bubbles)).held !== create(twin, dims(bubbles)).next) twin++;
// two of a kind dropped on one spot: a merge, so a best. load: open the twin deal first
async function mergeTwins(page, load = true) {
  const tier = create(twin, dims(bubbles)).held;
  if (load) await page.goto(`/?seed=${twin}`);
  const box = await page.locator("#jar").boundingBox();
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.pieces.length === 1 && s.cooldown === 0)).toBe(true);
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.score)).toBe(scoreFor(tier + 1));
  return scoreFor(tier + 1);
}

test("one sheet with a size slider and a speed slider: size 1.5 and speed 1.25 by default, each with a word and its number", async ({ page }) => {
  await page.goto("/");
  expect(await size(page)).toEqual({ now: 1.5, next: null });
  expect(await speed(page)).toEqual({ now: 1.25, next: null });
  const s = await state(page);
  expect([s.scale, s.speed]).toEqual([1.5, 1.25]);
  await expect(page.locator("#best-size")).toHaveText("1.5 · 1.25×");
  await openSettings(page);
  const range = (id) => page.locator(`#${id}`).evaluate((el) => [el.min, el.max, el.step, el.value].map(Number));
  expect(await range("size-slider")).toEqual([1, 3, 0.1, 1.5]);
  expect(await range("speed-slider")).toEqual([0.75, 2, 0.25, 1.25]);
  await expect(page.locator("#size-value")).toHaveText("just right · 1.5");
  await expect(page.locator("#speed-value")).toHaveText("lively · 1.25×");
  await expect(page.locator(".sheet .hint")).toContainText("every size and speed keeps its own best");
  // the words follow the sliders
  await slide(page, "size-slider", 3, false);
  await expect(page.locator("#size-value")).toHaveText("super hard · 3.0");
  await slide(page, "speed-slider", 0.75, false);
  await expect(page.locator("#speed-value")).toHaveText("slow · 0.75×");
});

test("dragging the size slider grows and shrinks the pieces in its picture as the finger moves, before it lets go", async ({ page, browserName }) => {
  await page.goto("/?seed=3");
  await openSettings(page);
  const at15 = await drawn(page);
  expect(at15).toBeGreaterThan(0.2);
  if (browserName === "chromium") {
    // a real drag: press on the thumb, slide right, and look before letting go
    const box = await page.locator("#size-slider").boundingBox();
    const y = box.y + box.height / 2;
    const xAt = (v) => box.x + 8 + ((box.width - 16) * (v - 1)) / 2;
    await page.mouse.move(xAt(1.5), y);
    await page.mouse.down();
    await page.mouse.move(xAt(2.6), y, { steps: 6 });
    await expect.poll(() => drawn(page)).toBeGreaterThan(at15 * 1.15);
    // still dragging: nothing is picked yet
    expect(await size(page)).toEqual({ now: 1.5, next: null });
    await page.mouse.move(box.x + 2, y, { steps: 8 });
    await expect.poll(() => drawn(page)).toBeLessThan(at15 * 0.85);
    expect(await size(page)).toEqual({ now: 1.5, next: null });
    await page.mouse.up();
    await expect.poll(() => size(page)).toEqual({ now: 1, next: null });
  } else {
    // webkit's touch phone has no mouse drag on a slider: move it the way a finger does, input after input
    for (const v of [1.8, 2.2, 2.6]) await slide(page, "size-slider", v, false);
    await expect.poll(() => drawn(page)).toBeGreaterThan(at15 * 1.15);
    expect(await size(page)).toEqual({ now: 1.5, next: null });
    for (const v of [2, 1.5, 1]) await slide(page, "size-slider", v, false);
    await expect.poll(() => drawn(page)).toBeLessThan(at15 * 0.85);
    expect(await size(page)).toEqual({ now: 1.5, next: null });
  }
  // the picture is drawn true to the size: the row at 3 is wider than at 1
  await slide(page, "size-slider", 1, false);
  const lo = await drawn(page);
  await slide(page, "size-slider", 3, false);
  expect(await drawn(page)).toBeGreaterThan(lo * 1.8);
});

test("a pick on an empty jar switches right away, and the pieces are that big and that fast", async ({ page }) => {
  await page.goto("/?seed=3");
  await openSettings(page);
  await slide(page, "size-slider", 2.4);
  await slide(page, "speed-slider", 2);
  expect(await size(page)).toEqual({ now: 2.4, next: null });
  expect(await speed(page)).toEqual({ now: 2, next: null });
  await expect(page.locator(".look-note")).toHaveCount(0);
  await page.click("#close");
  await expect(page.locator("#best-size")).toHaveText("2.4 · 2×");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  const s = await state(page);
  expect([s.scale, s.speed]).toEqual([2.4, 2]);
  expect(s.pieces[0].r).toBeCloseTo(grow(bubbles.tiers.map((t) => t.radius), 2.4)[s.pieces[0].tier] * JAR.width, 9);
});

test("a pick mid-game waits for the next game and leaves the run as it is", async ({ page }) => {
  await page.goto("/?seed=5");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await openSettings(page);
  const before = await state(page);
  await slide(page, "size-slider", 1);
  await slide(page, "speed-slider", 0.75);
  expect(await size(page)).toEqual({ now: 1.5, next: 1 });
  expect(await speed(page)).toEqual({ now: 1.25, next: 0.75 });
  await expect(page.locator("#size-tag")).toHaveText("next game");
  await expect(page.locator("#speed-tag")).toHaveText("next game");
  await expect(page.locator(".look-note")).toContainText("size 1.0 · speed 0.75 starts with your next game");
  // the run is untouched: same game, same size and speed, same pieces
  expect(await state(page)).toEqual(before);
  expect([before.scale, before.speed]).toEqual([1.5, 1.25]);
  await page.click("#close");
  await page.click("#about");
  await expect(page.locator("#settings")).toHaveText("size 1.5 · speed 1.25 (next game: size 1.0 · speed 0.75)");
  await page.click("#close");
  // the hud still shows this game's settings and best
  await expect(page.locator("#best-size")).toHaveText("1.5 · 1.25×");
  // sliding back to this game's size takes that change back
  await openSettings(page);
  await expect(page.locator("#size-slider")).toHaveValue("1");
  await slide(page, "size-slider", 1.5);
  expect(await size(page)).toEqual({ now: 1.5, next: null });
  await slide(page, "size-slider", 1);
  await page.click("#close");
  await page.click("#restart");
  await page.click("#confirm-restart");
  expect(await size(page)).toEqual({ now: 1, next: null });
  expect(await speed(page)).toEqual({ now: 0.75, next: null });
  const s = await state(page);
  expect([s.scale, s.speed]).toEqual([1, 0.75]);
  expect(s.pieces).toEqual([]);
  await expect(page.locator("#best-size")).toHaveText("1.0 · 0.75×");
});

test("the picks survive a reload, even ones made mid-game, and an old size name reads as its number", async ({ page }) => {
  await page.goto("/");
  await pick(page, { size: 2, speed: 1.75 });
  await page.reload();
  expect(await size(page)).toEqual({ now: 2, next: null });
  expect(await speed(page)).toEqual({ now: 1.75, next: null });
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await pick(page, { size: 1.2, speed: 1 });
  expect(await size(page)).toEqual({ now: 2, next: 1.2 });
  await page.reload();
  expect(await size(page)).toEqual({ now: 1.2, next: null });
  expect(await speed(page)).toEqual({ now: 1, next: null });
  expect((await state(page)).scale).toBe(1.2);
  // a size saved before the slider, by name
  await page.evaluate(() => localStorage.setItem("bloop:size", "medium"));
  await page.reload();
  expect(await size(page)).toEqual({ now: 1.3, next: null });
});

test("every size and speed keeps its own best, all in one record written in one go", async ({ page }) => {
  await page.addInitScript(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("bloop:best")) window.__writes.push(k);
      return set.call(this, k, v);
    };
  });
  const points = await mergeTwins(page);
  await expect(page.locator("#best b")).toHaveText(String(points));
  expect(await record(page)).toEqual({ "1.5/1.25": { score: points, jiggled: false } });
  expect(new Set(await page.evaluate(() => window.__writes))).toEqual(new Set(["bloop:best"]));
  // another speed starts next game, with its own best: none yet
  await pick(page, { speed: 2 });
  await page.click("#restart");
  await page.click("#confirm-restart");
  await expect(page.locator("#best-size")).toHaveText("1.5 · 2×");
  await expect(page.locator("#best b")).toHaveText("0");
  await page.reload();
  await expect(page.locator("#best b")).toHaveText("0");
  // another size too
  await pick(page, { size: 1.6, speed: 1.25 });
  await expect(page.locator("#best b")).toHaveText("0");
  // and 1.5 at 1.25 still has its own
  await pick(page, { size: 1.5 });
  await expect(page.locator("#best-size")).toHaveText("1.5 · 1.25×");
  await expect(page.locator("#best b")).toHaveText(String(points));
  // a best at a second setting joins the record; the first stays
  await pick(page, { size: 2.2 });
  const more = await mergeTwins(page, false);
  expect(await record(page)).toEqual({ "1.5/1.25": { score: points, jiggled: false }, "2.2/1.25": { score: more, jiggled: false } });
});

// older saves move to the settings they were played at, all at speed 1
for (const [label, raw, mark, at, jiggled] of [
  ["a plain-number save from before sizes", "40", "1", { size: 1, speed: 1 }, true],
  ["a { score, jiggled } save from before sizes", JSON.stringify({ score: 40, jiggled: true }), null, { size: 1, speed: 1 }, true],
  ["a medium best from before the slider", JSON.stringify({ small: { score: 3, jiggled: false }, medium: { score: 40, jiggled: false }, big: { score: 0, jiggled: false } }), null, { size: 1.3, speed: 1 }, false],
])
  test(`${label} is the best at size ${at.size}, speed ${at.speed}, and a new best keeps it`, async ({ page }) => {
    await page.addInitScript(([r, m]) => {
      if (localStorage.getItem("bloop:speed")) return;
      localStorage.setItem("bloop:best", r);
      if (m) localStorage.setItem("bloop:best-jiggled", m);
    }, [raw, mark]);
    await page.goto(`/?seed=${twin}`);
    // the new defaults have none of it
    await expect(page.locator("#best b")).toHaveText("0");
    await pick(page, at);
    await expect(page.locator("#best b")).toContainText("40");
    await expect(page.locator("#best .shake-mark")).toHaveCount(jiggled ? 1 : 0);
    // a best at the defaults rewrites the record whole, the old best with it
    await pick(page, { size: 1.5, speed: 1.25 });
    const points = await mergeTwins(page, false);
    const old = `${at.size.toFixed(1)}/${at.speed.toFixed(2)}`;
    const rec = await record(page);
    expect(rec[old]).toEqual({ score: 40, jiggled });
    expect(rec["1.5/1.25"]).toEqual({ score: points, jiggled: false });
  });

test("a failed best write keeps the last complete record, every setting's best and mark, after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    // seeded once, on the first load only: a reload must find whatever the page left
    if (!localStorage.getItem("test:seeded")) {
      localStorage.setItem("test:seeded", "1");
      localStorage.setItem("bloop:best", JSON.stringify({ "1.0/1.00": { score: 9, jiggled: false }, "1.5/1.25": { score: 1, jiggled: false }, "2.0/2.00": { score: 3, jiggled: true } }));
    }
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("bloop:best")) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  const points = await mergeTwins(page);
  await expect(page.locator("#best b")).toHaveText(String(points));
  await expect(page.locator(".warn")).toBeVisible();
  await page.reload();
  await expect(page.locator("#best b")).toHaveText("1");
  await pick(page, { size: 2, speed: 2 });
  await expect(page.locator("#best b")).toContainText("3");
  await expect(page.locator("#best .shake-mark")).toHaveCount(1);
  await pick(page, { size: 1, speed: 1 });
  await expect(page.locator("#best b")).toHaveText("9");
});

test("a finished jar's card says the size and speed, and switches them at once", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the card is the same page in both engines; one long run is enough");
  test.setTimeout(480000);
  await page.clock.install();
  await page.goto("/?seed=4");
  await pick(page, { size: 3, speed: 2 });
  const box = await page.locator("#jar").boundingBox();
  const spots = [0.05, 0.5, 0.95].map((f) => ({ x: box.x + box.width * f, y: box.y + box.height / 2 }));
  for (let i = 0; i < 400 && !(await page.locator("#over").isVisible()); i++) {
    await page.mouse.click(spots[i % 3].x, spots[i % 3].y);
    await page.clock.runFor(300);
  }
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#over-settings-line")).toHaveText("size 3.0 · speed 2");
  await page.click("#over-settings");
  await expect(page.locator(".sheet h2")).toHaveText("size & speed");
  await slide(page, "size-slider", 1);
  expect(await size(page)).toEqual({ now: 1, next: null });
  await expect(page.locator(".look-note")).toHaveCount(0);
  await page.click("#close");
  await expect(page.locator("#over")).toHaveCount(0);
  const s = await state(page);
  expect([s.scale, s.speed]).toEqual([1, 2]);
  expect(s.pieces).toEqual([]);
  expect(s.over).toBe(false);
});

test("320 wide: the settings sheet and the hud's settings fit with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await pick(page, { size: 2.5, speed: 1.75 });
  const tag = await page.locator("#best-size").boundingBox();
  const best = await page.locator("#best").boundingBox();
  const next = await page.locator("#next").boundingBox();
  expect(tag.x).toBeGreaterThanOrEqual(best.x - 1);
  expect(tag.x + tag.width).toBeLessThanOrEqual(next.x);
  await openSettings(page);
  const wide = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector(".card").scrollWidth));
  expect(wide).toBeLessThanOrEqual(320);
  for (const sel of ["#size-slider", "#speed-slider", "#size-preview"]) {
    const b = await page.locator(sel).boundingBox();
    expect(b.x, sel).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(320);
  }
});
