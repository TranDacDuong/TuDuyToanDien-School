const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");
const { firstVisible } = require("./helpers/ui");

const adminCreds = getCred("ADMIN");

test.describe("Dashboard ops regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("missing-answer quick action loads question bank filter", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await firstVisible(page, [
      '[data-testid="dashboard-ops-missing-answer"]',
      '#opsHub .ops-action:nth-of-type(1)',
    ]).click();
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /question\.html\?answer=missing/i);
  });

  test("duplicate quick action loads question duplicate focus", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await firstVisible(page, [
      '[data-testid="dashboard-ops-duplicates"]',
      '#opsHub .ops-action:nth-of-type(2)',
    ]).click();
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /question\.html\?focus=duplicates/i);
  });

  test("exam quick action loads exam manager", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await firstVisible(page, [
      '[data-testid="dashboard-ops-exams"]',
      '#opsHub .ops-action:nth-of-type(3)',
    ]).click();
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /exam\.html/i);
  });

  test("log quick action loads system logs deep link", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await firstVisible(page, [
      '[data-testid="dashboard-ops-logs"]',
      '#opsHub .ops-action:nth-of-type(4)',
    ]).click();
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /sourcedata\.html\?tab=adminLogs&logStatus=error/i);
  });
});
