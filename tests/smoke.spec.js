const { test, expect } = require("@playwright/test");

test.describe("TuDuyToanDien live smoke", () => {
  test("landing page loads and shows login form", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page).toHaveTitle(/TuDuy|Tư Duy|School/i);
    await expect(page.locator("input[type='email'], input[placeholder*='mail' i], input[name='email']").first()).toBeVisible();
    await expect(page.locator("input[type='password'], input[name='password']").first()).toBeVisible();
  });

  test("question bank page redirects or renders a protected shell", async ({ page }) => {
    const response = await page.goto("/question.html");
    expect(response === null || response.ok()).toBeTruthy();
    await expect(page).toHaveURL(/question\.html|index\.html/i);
  });

  test("dashboard route responds", async ({ page }) => {
    const response = await page.goto("/dashboard.html");
    expect(response === null || response.ok()).toBeTruthy();
    await expect(page).toHaveURL(/dashboard\.html|index\.html/i);
  });
});
