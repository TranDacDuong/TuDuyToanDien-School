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
    await page.getByTestId("question-quick-duplicate-audit").click();
    await expect(page.locator("#duplicateReview")).toBeVisible();
    await page.locator("#duplicateReview button").last().click();
    await expect(page.locator("#duplicateReview")).toBeHidden();
  });

  test("system page opens logs tab and supports switching back to student tab", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/sourcedata.html?tab=adminLogs");
    await expect(page.locator("#adminLogs.active")).toBeVisible();
    await page.getByTestId("system-tab-students").click();
    await expect(page.locator("#students.active")).toBeVisible();
  });

  test("tuition page loads overview table for admin", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/tuition.html");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("table tbody")).toBeVisible();
  });

  test("class page exposes create button for admin", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/class.html");
    await expect(page.getByTestId("class-create-button")).toBeVisible();
  });

  test("courses page exposes create button for admin", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/courses.html");
    await expect(page.getByTestId("course-create-button")).toBeVisible();
  });
});
