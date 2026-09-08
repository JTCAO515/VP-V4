import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`VPJ-01: release discovery and legacy locale escape at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Isolate locale rendering from unavailable identity infrastructure.
    await page.route("**/api/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto("/visepanda");
    const picker = page.locator("select").first();
    const values = () => picker.locator("option").evaluateAll((options) => options.map((option) => option.value));
    await expect(picker).toHaveValue("zh");
    await expect(page).toHaveTitle("聊天线程 | VisePanda");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://go2china.space/visepanda");
    await expect(page.locator("body")).not.toContainText(/product preview/i);
    expect(await values()).toEqual(["zh", "en"]);
    await picker.selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    for (const locale of ["es", "ru", "ar"]) {
      await page.goto(`/visepanda?locale=${locale}`);
      await expect(picker).toHaveValue(locale);
      expect(await values()).toEqual(["zh", "en", locale]);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      if (locale === "ar") {
        await expect(picker.locator("option:checked")).toContainText("العربية");
        await expect(page).toHaveTitle("سلاسل المحادثة | VisePanda");
      }
      const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
      await picker.selectOption("en");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      expect(await values()).toEqual(["zh", "en"]);
      await picker.selectOption("zh");
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    }
    await page.goto("/visepanda?locale=ar&locale=en");
    await expect(picker).toHaveValue("ar");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page).toHaveTitle("سلاسل المحادثة | VisePanda");
    expect(errors).toEqual([]);
  });
}
