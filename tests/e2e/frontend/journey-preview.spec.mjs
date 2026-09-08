import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Journey preview preserves local choices and keeps external services off at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    const apiCalls = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiCalls.push(request.url()); });
    await page.goto("/journey/plan");
    await expect(page.getByRole("link", { name: "Early Access ↗", exact: true })).toHaveAttribute("href", "https://form.jotform.com/cjttttt/visepanda-early-access");
    const note = "A quiet afternoon for tea";
    await page.getByRole("textbox", { name: "Write a trip note", exact: true }).fill(note);
    await page.getByRole("button", { name: "Send note", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Confirm note", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveValue(note);
    await page.getByRole("button", { name: "◫ Copilot", exact: true }).click();
    await page.getByRole("button", { name: "✦ Ask VisePanda", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveValue(note);
    await page.getByRole("button", { name: /3 changes waiting for you/ }).click();
    await page.getByRole("button", { name: "Reject", exact: true }).first().click();
    await page.getByRole("button", { name: "Accept all", exact: true }).click();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Accepted", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Reset choices", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(3);
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator(".demo-mini-map:visible")).toBeVisible();
    await page.getByRole("button", { name: "Bookings", exact: true }).click();
    await expect(page.locator(".demo-bookings:visible")).toBeVisible();
    for (const name of ["◉ Today", "⚒ Tools", "◇ Explore", viewport.width < 800 ? "○ User" : "User"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".demo-workspace")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "✦ Ask VisePanda", exact: true }).click();
    await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("textbox", { name: "编辑备注", exact: true })).toHaveValue(note);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    if (viewport.width < 800) await page.getByRole("button", { name: "Trip Canvas", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "编辑备注", exact: true })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Journey landing keeps the signup link and Chinese preview route", async ({ page }) => {
  await page.goto("/?lang=zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator('a[href="https://form.jotform.com/cjttttt/visepanda-early-access"]').first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator('a[href="/journey/plan?lang=zh"]').first()).toBeVisible();
  const images = await page.locator(".journey img").count();
  expect(images).toBeGreaterThan(0);
});

test("Explore requires note confirmation and tool requests are consumed once", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journey/plan");
  await page.getByRole("button", { name: "Trip Canvas", exact: true }).click();
  await page.getByRole("button", { name: "Open ride tool", exact: true }).click();
  await page.locator(".vp-tool-list button").first().click();
  await expect(page.getByRole("heading", { name: "Translation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "✦ Ask VisePanda", exact: true }).click();
  await page.getByRole("button", { name: "⚒ Tools", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Translation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "◇ Explore", exact: true }).click();
  await page.locator(".poi-card-grid button").first().click();
  const bounds = await page.locator(".poi-detail-drawer").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Propose a Canvas note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm note", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveValue("The Bund");
  await page.getByRole("button", { name: "◇ Explore", exact: true }).click();
  await page.getByRole("button", { name: "✦ Ask VisePanda", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm note", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Edit note", exact: true })).toHaveCount(1);
});
