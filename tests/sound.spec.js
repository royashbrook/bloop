import { test, expect } from "@playwright/test";
import { create } from "../src/lib/engine/game.ts";
import { cells } from "../src/lib/skins/cells.ts";
import { dims } from "../src/lib/skins/types.ts";
import { tone } from "../src/lib/sound.ts";

// the sounds (#18) through a stand-in for web audio: it makes no noise, it
// writes down every tone started, every suspend and every resume.
function fakeAudio() {
  const log = { made: 0, starts: [], suspends: 0, resumes: 0, state: "none" };
  window.__audio = log;
  const param = (v = 0) => ({ value: v, setValueAtTime(x) { this.value = x; return this; }, exponentialRampToValueAtTime() { return this; }, linearRampToValueAtTime() { return this; } });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, ...extra });
  window.AudioContext = class {
    constructor() {
      log.made++;
      this.state = log.state = "suspended";
      this.sampleRate = 44100;
      this.destination = node();
      this.t0 = performance.now();
    }
    get currentTime() {
      return (performance.now() - this.t0) / 1000;
    }
    resume() {
      log.resumes++;
      this.state = log.state = "running";
      return Promise.resolve();
    }
    suspend() {
      log.suspends++;
      this.state = log.state = "suspended";
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createGain() {
      return node({ gain: param(1) });
    }
    createDynamicsCompressor() {
      return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    }
    createBiquadFilter() {
      return node({ type: "lowpass", frequency: param(), Q: param() });
    }
    createBuffer(_c, length) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }
    createBufferSource() {
      return node({ buffer: null, start() {}, stop() {} });
    }
    createOscillator() {
      const o = node({ type: "sine", frequency: param(440) });
      o.start = () => log.starts.push({ type: o.type, freq: o.frequency.value });
      o.stop = () => {};
      return o;
    }
  };
}
const audio = (page) => page.evaluate(() => ({ ...window.__audio, starts: [...window.__audio.starts] }));
const state = (page) => page.evaluate(() => window.__bloop.state());
const near = (a, b) => Math.abs(a - b) < 0.01;
// the first seed whose first two drops are the same tier: two drops on one spot must merge
function twinSeed() {
  for (let seed = 1; ; seed++) {
    const g = create(seed, dims(cells));
    if (g.held === g.next) return { seed, tier: g.held };
  }
}
async function tapJar(page) {
  const box = await page.locator("#jar").boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
const setHidden = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeAudio);
});

test("sound is on by default and waits for the first tap to start", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(300);
  expect((await audio(page)).made).toBe(0);
  await tapJar(page);
  await expect.poll(() => audio(page).then((a) => a.state)).toBe("running");
  expect((await audio(page)).made).toBe(1);
  await page.click("#about");
  await expect(page.locator("#sound")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#sound")).toHaveText("sound: on");
});

test("a drop plays a plop, and a merge a bloop for the tier it makes", async ({ page }) => {
  const { seed, tier } = twinSeed();
  await page.goto(`/?seed=${seed}`);
  await tapJar(page);
  await expect.poll(() => audio(page).then((a) => a.starts.filter((s) => near(s.freq, tone("drop", tier).from)).length)).toBe(1);
  await expect.poll(() => state(page).then((s) => s.cooldown)).toBe(0);
  await tapJar(page);
  await expect.poll(() => state(page).then((s) => s.pieces.some((p) => p.tier === tier + 1))).toBe(true);
  const { starts } = await audio(page);
  expect(starts.filter((s) => near(s.freq, tone("drop", tier).from))).toHaveLength(2);
  expect(starts.filter((s) => near(s.freq, tone("merge", tier + 1).from))).toHaveLength(1);
});

test("mute stops every sound and survives a reload; sound on again plays", async ({ page }) => {
  await page.goto("/");
  await tapJar(page);
  await expect.poll(() => audio(page).then((a) => a.starts.length)).toBeGreaterThan(0);
  await page.click("#about");
  await page.click("#sound");
  await expect(page.locator("#sound")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#sound")).toHaveText("sound: off");
  expect((await audio(page)).state).toBe("suspended");
  await page.click("#close");
  const before = (await audio(page)).starts.length;
  await expect.poll(() => state(page).then((s) => s.cooldown)).toBe(0);
  await tapJar(page);
  await expect.poll(() => state(page).then((s) => s.drops)).toBe(2);
  await page.waitForTimeout(200);
  expect((await audio(page)).starts.length).toBe(before);

  await page.reload();
  await tapJar(page);
  await expect.poll(() => state(page).then((s) => s.drops)).toBe(1);
  await page.waitForTimeout(200);
  // muted from the start: no audio is even made
  expect(await audio(page)).toMatchObject({ made: 0, starts: [] });
  await page.click("#about");
  await expect(page.locator("#sound")).toHaveAttribute("aria-checked", "false");
  await page.click("#sound");
  await expect(page.locator("#sound")).toHaveAttribute("aria-checked", "true");
  await page.click("#close");
  await expect.poll(() => state(page).then((s) => s.cooldown)).toBe(0);
  await tapJar(page);
  await expect.poll(() => audio(page).then((a) => a.starts.length)).toBeGreaterThan(0);
});

test("a hidden page goes quiet at once, and picks up on return; so does a page left and come back to", async ({ page }) => {
  await page.goto("/");
  await tapJar(page);
  await expect.poll(() => audio(page).then((a) => a.state)).toBe("running");
  await setHidden(page, true);
  expect(await audio(page)).toMatchObject({ state: "suspended", suspends: 1 });
  await setHidden(page, false);
  await expect.poll(() => audio(page).then((a) => a.state)).toBe("running");
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  expect(await audio(page)).toMatchObject({ state: "suspended", suspends: 2 });
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => audio(page).then((a) => a.state)).toBe("running");
});

test.describe("with reduced motion", () => {
  test("sound still plays", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await tapJar(page);
    await expect.poll(() => audio(page).then((a) => a.starts.length)).toBeGreaterThan(0);
  });
});
