const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Admin regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("dashboard shows updated duplicate wording", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await expect(page.getByText("Kiểm tra câu trùng", { exact: true })).toBeVisible();
  });

  test("class cards show action buttons in list view", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/class.html");
    await page.waitForTimeout(2500);
    const cards = page.locator(".class-card");
    await expect(cards.first()).toBeVisible({ timeout: 20000 });
    await expect(cards.first().locator(".class-actions button, .edit-btn, .delete-btn").first()).toBeVisible();
  });

  test("duplicate review opens from quick action", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/question.html");
    await page.locator(".quickOp").nth(1).click();
    await expect(page.locator("#duplicateReview")).toBeVisible();
  });

  test("system logs tab can open via URL and render content", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/sourcedata.html?tab=adminLogs&logStatus=error");
    await expect(page.locator("#adminLogs")).toBeVisible();
    await expect(page.locator("#adminLogTable")).toBeVisible();
  });
});
