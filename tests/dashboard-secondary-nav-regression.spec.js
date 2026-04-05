const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Dashboard secondary navigation regression", () => {
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

  test("question bank route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "question.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /question\.html/i);
  });

  test("exam route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "exam.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /exam\.html/i);
  });

  test("system route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "sourcedata.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /sourcedata\.html/i);
  });

  test("game route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "game.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /game\.html/i);
  });

  test("tuition route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "tuition.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /tuition\.html/i);
  });

  test("messages route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "messages.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /messages\.html/i);
  });

  test("notifications route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "notifications.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /notifications\.html/i);
  });

  test("account route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "account.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /account\.html/i);
  });
});
