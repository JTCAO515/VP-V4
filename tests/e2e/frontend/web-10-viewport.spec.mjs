import { expect, test } from "@playwright/test";

const surfaces = [
  ["Homepage", "/"],
  ["Sign in", "/auth/sign-in"],
  ["Product", "/visepanda"],
];

const viewports = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

test("WEB-10: core surfaces fit the required viewport matrix", async ({ browser, baseURL }) => {
  for (const [name, path] of surfaces) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${name} overflows at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
      await context.close();
    }
  }
});

test("WEB-10: product supports keyboard focus and RTL locale direction", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/visepanda`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");

  await page.getByLabel("Interface language").selectOption("ar");
  await expect.poll(() => page.locator("html").getAttribute("dir")).toBe("rtl");
  await expect(page.getByLabel("Mobile product destinations")).toBeVisible();
  await context.close();
});

test("WEB-10: sign-in keeps an announced error region and password controls", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/auth/sign-in`, { waitUntil: "networkidle" });
  await expect(page.locator("input[type=password]")).toBeVisible();
  await expect.poll(() => page.locator('[aria-live="polite"], [role="alert"]').count()).toBeGreaterThan(0);
});
