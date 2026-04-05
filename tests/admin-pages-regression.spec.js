const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Admin page regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("dashboard opens in ops center by default for admin", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await expect(page.locator("#opsHub.show")).toBeVisible();
    await expect(page.locator(".ops-actions .ops-action")).toHaveCount(4);
  });

  test("duplicate review modal opens and closes cleanly", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/question.html");
    await page.locator(".quickOp").nth(1).click();
    await expect(page.locator("#duplicateReview")).toBeVisible();
    await page.getByRole("button", { name: /Đóng/i }).click();
    await expect(page.locator("#duplicateReview")).toBeHidden();
  });

  test("system page opens logs tab and supports switching back to student tab", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/sourcedata.html?tab=adminLogs");
    await expect(page.locator("#adminLogs.active")).toBeVisible();
    await page.locator(".tabs .tab", { hasText: /Học sinh/i }).click();
    await expect(page.locator("#students.active")).toBeVisible();
  });

  test("tuition page loads overview table for admin", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/tuition.html");
    await expect(page.getByRole("heading", { level: 1, name: /Thu học phí/i })).toBeVisible();
    await expect(page.locator("table tbody")).toBeVisible();
  });
});
