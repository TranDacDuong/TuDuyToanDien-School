const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Dashboard menu regression", () => {
  test.skip(!adminCreds, "Admin credentials not configured");

  async function openDashboardRoute(page, target) {
    await page.evaluate(() => {
      document.querySelector(".content")?.classList.remove("hidden");
      document.getElementById("opsHub")?.classList.remove("show");
    });
    await page.evaluate((pageName) => {
      if (typeof window.openDashboardPage === "function") window.openDashboardPage(pageName);
    }, target);
  }

  test("admin menu opens question bank inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "question.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /question\.html/i);
  });

  test("admin menu opens exam manager inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "exam.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /exam\.html/i);
  });

  test("admin menu opens system page inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "sourcedata.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /sourcedata\.html/i);
  });
});
