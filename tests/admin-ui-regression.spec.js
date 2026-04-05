const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Admin UI regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  test("question quick-create opens the editor modal", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/question.html");
    await page.locator(".quickOp").nth(3).click();
    await expect(page.locator("#questionText")).toBeVisible();
    await expect(page.locator("#grade")).toBeVisible();
    await expect(page.locator("#subject")).toBeVisible();
    await expect(page.locator("#chapter")).toBeVisible();
  });

  test("class detail opens from the list card", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/class.html");
    await page.waitForTimeout(2500);
    const card = page.locator(".class-card").first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.click();
    await expect(page.getByText("THÔNG TIN LỚP")).toBeVisible();
  });

  test("course detail opens from course card", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/courses.html");
    const detailButton = page.locator(".course-card button[data-open], .course-card button").filter({ hasText: /Xem chi tiết|Xem/i }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();
    await expect(page.locator("#courseScreen.show")).toBeVisible();
  });

  test("exam editor opens from create button", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/exam.html");
    const createButton = page.locator("button.btn").first();
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.locator("#fTitle")).toBeVisible();
  });
});
