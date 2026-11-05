import { test, expect } from "@playwright/test";

// the jar sits centred between the hud and the footer (#11): on a phone taller
// than the jar, the spare room is split above and below it, not left in one band
// under it. every size fits with no scroll, light and dark.
async function gaps(page) {
  return page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const hud = box(".hud"), jar = box("#jar"), foot = box(".foot");
    return { above: jar.top - hud.bottom, below: foot.top - jar.bottom };
  });
}

for (const size of [{ width: 390, height: 844 }, { width: 430, height: 932 }])
  test(`${size.width}x${size.height}: the jar sits centred between the hud and the footer`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator("#jar")).toBeVisible();
    const { above, below } = await gaps(page);
    // a tall phone has real room to share
    expect(above + below).toBeGreaterThan(40);
    expect(Math.abs(above - below), `above ${above}, below ${below}`).toBeLessThanOrEqual(3);
    // "careful! too high" hangs from the jar's rim, not from the empty band above it
    const hang = await page.evaluate(() => {
      const s = document.querySelector(".surface");
      return { jar: document.querySelector("#jar").getBoundingClientRect().top - s.getBoundingClientRect().top, at: parseFloat(getComputedStyle(s).getPropertyValue("--jar-top")) };
    });
    expect(Math.abs(hang.at - hang.jar), JSON.stringify(hang)).toBeLessThanOrEqual(1);
  });

for (const scheme of ["light", "dark"])
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }])
    test(`${size.width}x${size.height} ${scheme}: everything fits with no scroll either way`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      await page.goto("/");
      const fit = await page.evaluate(() => ({
        w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      }));
      expect(fit.w).toBeLessThanOrEqual(size.width);
      expect(fit.h).toBeLessThanOrEqual(size.height);
      for (const sel of ["#jar", ".hud", ".foot"]) {
        const box = await page.locator(sel).boundingBox();
        expect(box.y, sel).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, sel).toBeLessThanOrEqual(size.height);
      }
      const { above, below } = await gaps(page);
      expect(above).toBeGreaterThanOrEqual(0);
      expect(below).toBeGreaterThanOrEqual(0);
    });

// the house layout (roy 2026-11-05): logo up top on the left, the version in the
// top right corner, the jar, then the buttons along the bottom, like the other games
for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }])
  test(`${size.width}x${size.height}: logo and version up top, buttons along the bottom`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const b = (s) => page.locator(s).boundingBox();
    const jar = await b("#jar"), logo = await b(".hud .logo"), ver = await b(".hud .corner"), nav = await b(".nav");
    expect(logo.y + logo.height).toBeLessThanOrEqual(jar.y);
    expect(logo.x).toBeLessThan(size.width * 0.2);
    expect(ver.y + ver.height).toBeLessThanOrEqual(logo.y + logo.height);
    expect(ver.x + ver.width).toBeGreaterThan(size.width * 0.85);
    expect(nav.y).toBeGreaterThanOrEqual(jar.y + jar.height);
    await page.click("#nav-looks");
    await expect(page.locator(".sheet h2")).toHaveText("looks");
    await page.click("#close");
    await page.click("#nav-settings");
    await expect(page.locator(".sheet h2")).toHaveText("size & speed");
  });

// light unless the phone asks for dark
test("a phone with no colour setting gets light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "no-preference" });
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(244, 248, 255)");
});
