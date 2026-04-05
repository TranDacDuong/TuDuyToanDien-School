const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");
const { firstVisible } = require("./helpers/ui");

const adminCreds = getCred("ADMIN");

test.describe("UI selector regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("question page exposes stable quick action hooks", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/question.html");
    await expect(firstVisible(page, ['[data-testid="question-quick-missing-answer"]', '.quickOps .quickOp:nth-of-type(1)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="question-quick-duplicate-audit"]', '.quickOps .quickOp:nth-of-type(2)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="question-quick-import-word"]', '.quickOps .quickOp:nth-of-type(3)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="question-quick-create"]', '.quickOps .quickOp:nth-of-type(4)'])).toBeVisible();
  });

  test("system page exposes stable tab hooks", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/sourcedata.html");
    await expect(firstVisible(page, ['[data-testid="system-tab-rooms"]', '.tabs .tab:nth-of-type(1)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="system-tab-teachers"]', '.tabs .tab:nth-of-type(5)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="system-tab-students"]', '.tabs .tab:nth-of-type(6)'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="system-tab-logs"]', '.tabs .tab:nth-of-type(7)'])).toBeVisible();
  });

  test("course detail exposes stable action hooks when opened", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/courses.html");
    const detailButton = page.locator(".course-card button[data-open], .course-card button").filter({ hasText: /Xem/i }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();
    await expect(firstVisible(page, ['[data-testid="course-screen-back"]', '#courseScreen .stop button:first-child'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="course-edit-button"]', '#screenEditBtn'])).toBeVisible();
    await expect(firstVisible(page, ['[data-testid="course-add-session"]', '#openSessionBtn'])).toBeVisible();
  });
});
