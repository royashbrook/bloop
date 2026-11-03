import { test, expect } from "@playwright/test";
import { create, scoreFor, JAR } from "../src/lib/engine/game.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";
import { sizeById } from "../src/lib/sizes.ts";

// piece size (#10): a pick on an empty or finished jar switches now, mid-game it
// waits for the next game without touching the run, the pick survives a reload,
// and each size keeps its own best in the one saved record
const state = (page) => page.evaluate(() => window.__bloop.state());
const size = (page) => page.evaluate(() => window.__bloop.size());
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bloop:best")));
const none = { score: 0, jiggled: false };
async function openSizes(page) {
  await page.click("#about");
  await page.click("#size");
  await expect(page.locator(".sheet h2")).toHaveText("piece size");
}
async function pick(page, id) {
  await openSizes(page);
  await page.click(`#size-${id}`);
  await page.click("#close");
}
// the first seed whose first two drops are the same tier (the deal is the same at every size)
let twin = 1;
while (create(twin, dims(cells)).held !== create(twin, dims(cells)).next) twin++;
// two of a kind dropped on one spot: a merge, so a best. load: open the twin deal first
async function mergeTwins(page, load = true) {
  const tier = create(twin, dims(cells)).held;
  if (load) await page.goto(`/?seed=${twin}`);
  const box = await page.locator("#jar").boundingBox();
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.pieces.length === 1 && s.cooldown === 0)).toBe(true);
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(() => state(page).then((s) => s.score)).toBe(scoreFor(tier + 1));
  return scoreFor(tier + 1);
}

test("the size sheet offers small, medium and big pieces, medium on by default, and says big is harder", async ({ page }) => {
  await page.goto("/");
  expect(await size(page)).toEqual({ now: "medium", next: null });
  expect((await state(page)).scale).toBe(sizeById("medium").scale);
  await expect(page.locator("#best-size")).toHaveText("medium");
  await openSizes(page);
  await expect(page.locator(".sheet .hint")).toContainText("bigger pieces fill the jar faster, so big is harder");
  for (const id of ["small", "medium", "big"]) {
    await expect(page.locator(`#size-${id} .look-name`)).toHaveText(`${id} pieces`);
    await expect(page.locator(`#size-${id} canvas`)).toHaveCount(3);
  }
  await expect(page.locator("#size-medium")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#size-medium .look-tag")).toHaveText("on");
});

test("picking a size on an empty jar switches right away, and the pieces are that big", async ({ page }) => {
  await page.goto("/?seed=3");
  await openSizes(page);
  await page.click("#size-big");
  expect(await size(page)).toEqual({ now: "big", next: null });
  await expect(page.locator("#size-big")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".look-note")).toHaveCount(0);
  await page.click("#close");
  await expect(page.locator("#best-size")).toHaveText("big");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  const s = await state(page);
  expect(s.scale).toBe(1.5);
  expect(s.pieces[0].r).toBe(cells.tiers[s.pieces[0].tier].radius * JAR.width * 1.5);
});

test("picking a size mid-game waits for the next game and leaves the run as it is", async ({ page }) => {
  await page.goto("/?seed=5");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await openSizes(page);
  const before = await state(page);
  await page.click("#size-small");
  expect(await size(page)).toEqual({ now: "medium", next: "small" });
  await expect(page.locator(".look-note")).toContainText("small pieces start with your next game");
  await expect(page.locator("#size-small .look-tag")).toHaveText("next game");
  await expect(page.locator("#size-medium .look-tag")).toHaveText("this game");
  // the run is untouched: same game, same size, same pieces
  expect(await state(page)).toEqual(before);
  expect(before.scale).toBe(1.3);
  await page.click("#close");
  await page.click("#about");
  await expect(page.locator("#size")).toHaveText("pieces: medium (next game: small)");
  await page.click("#close");
  // the hud still shows this game's size and best
  await expect(page.locator("#best-size")).toHaveText("medium");
  await page.click("#restart");
  await page.click("#confirm-restart");
  expect(await size(page)).toEqual({ now: "small", next: null });
  const s = await state(page);
  expect(s.scale).toBe(1);
  expect(s.pieces).toEqual([]);
  await expect(page.locator("#best-size")).toHaveText("small");
});

test("the size pick survives a reload, even one made mid-game", async ({ page }) => {
  await page.goto("/");
  await pick(page, "big");
  await page.reload();
  expect(await size(page)).toEqual({ now: "big", next: null });
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await pick(page, "small");
  expect(await size(page)).toEqual({ now: "big", next: "small" });
  await page.reload();
  expect(await size(page)).toEqual({ now: "small", next: null });
  expect((await state(page)).scale).toBe(1);
});

test("each size keeps its own best, all in one record written in one go", async ({ page }) => {
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
  expect(await record(page)).toEqual({ small: none, medium: { score: points, jiggled: false }, big: none });
  expect(new Set(await page.evaluate(() => window.__writes))).toEqual(new Set(["bloop:best"]));
  // big starts next game, with its own best: none yet
  await pick(page, "big");
  await page.click("#restart");
  await page.click("#confirm-restart");
  await expect(page.locator("#best-size")).toHaveText("big");
  await expect(page.locator("#best b")).toHaveText("0");
  await page.reload();
  await expect(page.locator("#best b")).toHaveText("0");
  // and medium still has its own
  await pick(page, "medium");
  await expect(page.locator("#best-size")).toHaveText("medium");
  await expect(page.locator("#best b")).toHaveText(String(points));
});

// before sizes every game was played at the look's own size, scale 1: small
for (const [label, raw, mark, jiggled] of [
  ["a plain-number save", "40", "1", true],
  ["a { score, jiggled } save", JSON.stringify({ score: 40, jiggled: true }), null, true],
  ["an unmarked { score, jiggled } save", JSON.stringify({ score: 40, jiggled: false }), null, false],
])
  test(`${label} from before sizes is the small best, and a new best keeps it`, async ({ page }) => {
    await page.addInitScript(([r, m]) => {
      if (localStorage.getItem("bloop:size")) return;
      localStorage.setItem("bloop:best", r);
      if (m) localStorage.setItem("bloop:best-jiggled", m);
    }, [raw, mark]);
    await page.goto(`/?seed=${twin}`);
    // medium, the default, has none of it
    await expect(page.locator("#best b")).toHaveText("0");
    await pick(page, "small");
    await expect(page.locator("#best-size")).toHaveText("small");
    await expect(page.locator("#best b")).toContainText("40");
    await expect(page.locator("#best .shake-mark")).toHaveCount(jiggled ? 1 : 0);
    // a medium best rewrites the record whole, the small best with it
    await pick(page, "medium");
    const points = await mergeTwins(page, false);
    expect(await record(page)).toEqual({ small: { score: 40, jiggled }, medium: { score: points, jiggled: false }, big: none });
  });

test("a failed best write keeps the last complete record, every size's best and mark, after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    // seeded once, on the first load only: a reload must find whatever the page left
    if (!localStorage.getItem("test:seeded")) {
      localStorage.setItem("test:seeded", "1");
      localStorage.setItem("bloop:best", JSON.stringify({ small: { score: 9, jiggled: false }, medium: { score: 1, jiggled: false }, big: { score: 3, jiggled: true } }));
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
  await pick(page, "big");
  await expect(page.locator("#best b")).toContainText("3");
  await expect(page.locator("#best .shake-mark")).toHaveCount(1);
  await pick(page, "small");
  await expect(page.locator("#best b")).toHaveText("9");
});

test("a finished jar's card switches size at once", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the card is the same page in both engines; one long run is enough");
  test.setTimeout(480000);
  await page.clock.install();
  await page.goto("/?seed=4");
  await pick(page, "big");
  const box = await page.locator("#jar").boundingBox();
  const spots = [0.05, 0.5, 0.95].map((f) => ({ x: box.x + box.width * f, y: box.y + box.height / 2 }));
  for (let i = 0; i < 400 && !(await page.locator("#over").isVisible()); i++) {
    await page.mouse.click(spots[i % 3].x, spots[i % 3].y);
    await page.clock.runFor(520);
  }
  await expect(page.locator("#over")).toBeVisible();
  await page.click("#over-size");
  await page.click("#size-small");
  expect(await size(page)).toEqual({ now: "small", next: null });
  await expect(page.locator(".look-note")).toHaveCount(0);
  await page.click("#close");
  await expect(page.locator("#over")).toHaveCount(0);
  const s = await state(page);
  expect(s.scale).toBe(1);
  expect(s.pieces).toEqual([]);
  expect(s.over).toBe(false);
});

test("320 wide: the size sheet and the hud's size fit with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const tag = await page.locator("#best-size").boundingBox();
  const best = await page.locator("#best").boundingBox();
  const next = await page.locator("#next").boundingBox();
  expect(tag.x).toBeGreaterThanOrEqual(best.x - 1);
  expect(tag.x + tag.width).toBeLessThanOrEqual(next.x);
  await openSizes(page);
  const wide = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector(".card").scrollWidth));
  expect(wide).toBeLessThanOrEqual(320);
  for (const id of ["small", "medium", "big"]) {
    const b = await page.locator(`#size-${id}`).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
  }
});
