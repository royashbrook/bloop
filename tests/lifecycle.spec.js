import { test, expect } from "@playwright/test";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

// the shell the house template guarantees: the ethos, the build on screen, an
// offline reopen, an update that waits for consent, and a world that holds still
// while nobody is looking.
const ETHOS =
  "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
const state = (page) => page.evaluate(() => window.__bloop.state());

test("the page and the about sheet carry the house ethos, word for word", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("meta[name=description]")).toHaveAttribute("content", new RegExp(ETHOS.replaceAll(".", "\\.")));
  await page.click("#about");
  await expect(page.locator(".ethos")).toHaveText(ETHOS);
  await expect(page.locator(".maker")).toContainText("made with love by");
  await expect(page.locator(".ladder li")).toHaveCount(11);
  await expect(page.locator(".ladder")).toContainText("big bloop");
});

test("the build is on screen, and in the about sheet", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".corner")).toHaveText(/^v\d+\.\d+\.\d+/);
  await page.click("#about");
  await expect(page.locator(".version")).toHaveText(/^version \d+\.\d+\.\d+/);
  const served = await (await page.request.get("/version.json")).json();
  await expect(page.locator(".corner")).toHaveText(`v${served.version}`);
  await expect(page.locator("meta[name=build]")).toHaveAttribute("content", served.build);
});

test("check for update says so when this is the newest", async ({ page }) => {
  await page.goto("/");
  await page.click("#about");
  await page.getByRole("button", { name: "check for update" }).click();
  await expect(page.locator(".card [role=status]")).toHaveText("you have the newest bloop");
  await expect(page.locator(".update")).toHaveCount(0);
});

test.describe("with no service worker in the way of the probe", () => {
  // webkit routes a controlled page's fetches past page.route, so the worker sits this one out
  test.use({ serviceWorkers: "block" });
  test("a newer build waits for a tap before it loads", async ({ page }) => {
    await page.route((url) => url.searchParams.has("update-probe"), (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="build" content="a-newer-build">' }),
    );
    await page.goto("/");
    await page.click("#about");
    await page.getByRole("button", { name: "check for update" }).click();
    await expect(page.locator(".card [role=status]")).toHaveText("a new version is ready");
    await page.click("#close");
    // offered, not forced: the page is still this build until the player taps
    await expect(page.locator(".update")).toHaveText("new version, tap to load");
    const build = await page.locator("meta[name=build]").getAttribute("content");
    await page.waitForTimeout(500);
    await expect(page.locator("meta[name=build]")).toHaveAttribute("content", build);
  });
});

const setHidden = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

test("a hidden page holds the world still, and it moves again on return", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => state(page).then((s) => s.steps)).toBeGreaterThan(5);
  await setHidden(page, true);
  const before = (await state(page)).steps;
  await page.waitForTimeout(600);
  expect((await state(page)).steps).toBe(before);
  await setHidden(page, false);
  await expect.poll(() => state(page).then((s) => s.steps)).toBeGreaterThan(before);
});

test("the about sheet pauses the game", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Space");
  await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  await page.click("#about");
  const before = await state(page);
  await page.waitForTimeout(500);
  expect((await state(page)).steps).toBe(before.steps);
  // space on the sheet does not drop behind it
  await page.keyboard.press("Space");
  await page.click("#close");
  expect((await state(page)).pieces.length).toBe(1);
});

// a disposable server we can really stop: webkit refuses setOffline even for
// a worker answering from its cache, and a refused connection is the real case
async function startServer() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const root = resolve("dist");
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
      if (!file.startsWith(root + "/")) return res.writeHead(403).end();
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => (server.listening ? new Promise((r) => (server.close(r), server.closeAllConnections())) : Promise.resolve()),
  };
}

test("after one visit it reopens and plays with the server gone", async ({ browser }) => {
  const server = await startServer();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await server.close();
    await page.reload();
    await expect(page.locator("#jar")).toBeVisible();
    await page.keyboard.press("Space");
    await expect.poll(() => state(page).then((s) => s.pieces.length)).toBe(1);
  } finally {
    await context.close();
    await server.close();
  }
});

// the maker's mark, the house colophon (#8): made with <heart>love by roy + ai · sponsor me,
// the heart where the word is (the word kept for screen readers), centred, and on a
// narrow phone the dot wraps with "sponsor me", never stranded at the end of a row
for (const width of [390, 320])
  test(`${width} wide: the maker's mark reads in order and sits centred`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.click("#about");
    const mark = page.locator(".maker");
    await mark.scrollIntoViewIfNeeded();
    const read = await mark.evaluate((el) => {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      const svg = el.querySelector("svg");
      const before = [];
      for (let n = svg?.previousSibling; n; n = n.previousSibling) before.unshift(n.textContent);
      const after = svg?.nextSibling;
      const links = [...el.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]);
      // every visible box on each row, to measure the gaps either side of it
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const left = box.left + parseFloat(style.paddingLeft), right = box.right - parseFloat(style.paddingRight);
      // what shows: every child but the screen-reader word, which is clipped to nothing
      const shown = [...el.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains("sr")));
      const rects = shown.flatMap((n) => {
        const range = document.createRange();
        range.selectNode(n);
        return [...range.getClientRects()];
      });
      const rows = new Map();
      for (const r of rects) {
        if (r.width <= 1 || r.height <= 1) continue;
        const key = Math.round(r.top + r.height / 2);
        const row = [...rows.keys()].find((k) => Math.abs(k - key) < 12) ?? key;
        const span = rows.get(row) ?? { l: Infinity, r: -Infinity };
        rows.set(row, { l: Math.min(span.l, r.left), r: Math.max(span.r, r.right) });
      }
      const dot = el.querySelector(".mark-dot")?.getBoundingClientRect();
      const sponsor = [...el.querySelectorAll("a")].at(-1).getBoundingClientRect();
      return {
        text,
        before: before.join("").replace(/\s+/g, " ").trim(),
        after: after?.textContent,
        afterHidden: after?.nodeType === 1 ? getComputedStyle(after).position === "absolute" : false,
        svgHidden: svg?.getAttribute("aria-hidden"),
        links,
        gaps: [...rows.values()].map((s) => [s.l - left, right - s.r]),
        dotRow: dot ? Math.abs(dot.top + dot.height / 2 - (sponsor.top + sponsor.height / 2)) : Infinity,
      };
    });
    expect(read.text).toBe("made with love by roy + ai · sponsor me");
    expect(read.before).toBe("made with");
    expect(read.after).toBe("love");
    expect(read.afterHidden, "the word is for screen readers only").toBe(true);
    expect(read.svgHidden).toBe("true");
    expect(read.links).toEqual([
      ["roy", "https://royashbrook.com"],
      ["ai", "https://royashbrook.com/agents"],
      ["sponsor me", "https://github.com/sponsors/royashbrook"],
    ]);
    expect(read.gaps.length).toBeGreaterThan(0);
    for (const [l, r] of read.gaps) expect(Math.abs(l - r), `row gaps ${l} | ${r}`).toBeLessThanOrEqual(2);
    expect(read.dotRow, "the dot rides with sponsor me").toBeLessThan(4);
  });
