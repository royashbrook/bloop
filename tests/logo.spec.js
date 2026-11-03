import { test, expect } from "@playwright/test";

// the logo (#13): the about sheet's title is the drawn name, and every install
// icon is drawn from the one icon.svg

test("the about sheet's title is the drawn name: a heading called bloop, shapes only", async ({ page }) => {
  await page.goto("/");
  await page.click("#about");
  const title = page.getByRole("heading", { name: "bloop", exact: true });
  await expect(title).toBeVisible();
  const mark = title.locator("svg.wordmark");
  await expect(mark).toHaveAttribute("role", "img");
  await expect(mark).toHaveAttribute("aria-label", "bloop");
  // no font to load: no text element, just shapes
  expect(await mark.locator("text").count()).toBe(0);
  expect(await mark.locator("circle").count()).toBeGreaterThan(10);
  const box = await mark.boundingBox();
  const card = await page.locator(".card").boundingBox();
  expect(box.width).toBeGreaterThan(150);
  expect(box.x).toBeGreaterThanOrEqual(card.x);
  expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
});

test("every install icon is the bubble chain on the soft blue tile", async ({ page }) => {
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.json")).json();
  const files = ["/icon-180.png", ...manifest.icons.map((i) => i.src)];
  for (const src of files) {
    const at = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const px = (fx, fy) => [...ctx.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data.slice(0, 3)];
      // the corner is the tile, the low middle of the big bubble is lilac
      return { size: img.width, corner: px(0.02, 0.02), bubble: px(0.58, 0.72) };
    }, src);
    const near = (rgb, hex) => rgb.every((v, i) => Math.abs(v - parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)) < 12);
    expect(near(at.corner, "#dbe6f5"), `${src} corner ${at.corner}`).toBe(true);
    if (!src.includes("maskable")) expect(near(at.bubble, "#c9c4ff"), `${src} bubble ${at.bubble}`).toBe(true);
  }
  const svg = await (await page.request.get("/icon.svg")).text();
  expect(svg).toContain('fill="#c9c4ff"');
});
