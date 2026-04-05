const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("UI selector regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("question page exposes stable quick action hooks", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/question.html");
    await expect(page.getByTestId("question-quick-missing-answer")).toBeVisible();
    await expect(page.getByTestId("question-quick-duplicate-audit")).toBeVisible();
    await expect(page.getByTestId("question-quick-import-word")).toBeVisible();
    await expect(page.getByTestId("question-quick-create")).toBeVisible();
  });

  test("system page exposes stable tab hooks", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/sourcedata.html");
    await expect(page.getByTestId("system-tab-rooms")).toBeVisible();
    await expect(page.getByTestId("system-tab-teachers")).toBeVisible();
    await expect(page.getByTestId("system-tab-students")).toBeVisible();
    await expect(page.getByTestId("system-tab-logs")).toBeVisible();
  });

  test("course detail exposes stable action hooks when opened", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/courses.html");
    const detailButton = page.locator(".course-card button[data-open], .course-card button").filter({ hasText: /Xem/i }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();
    await expect(page.getByTestId("course-screen-back")).toBeVisible();
    await expect(page.getByTestId("course-edit-button")).toBeVisible();
    await expect(page.getByTestId("course-add-session")).toBeVisible();
  });
});
