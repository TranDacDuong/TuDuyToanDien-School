const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const adminCreds = getCred("ADMIN");

test.describe("Dashboard primary navigation regression", () => {
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

  test("home route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "home.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /home\.html/i);
  });

  test("courses route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "courses.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /courses\.html/i);
  });

  test("class route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "class.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /class\.html/i);
  });

  test("public exam route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "public_exam.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /public_exam\.html/i);
  });

  test("resources route loads inside dashboard frame", async ({ page }) => {
    await loginAs(page, adminCreds);
    await page.goto("/dashboard.html");
    await openDashboardRoute(page, "resources.html");
    await expect(page.locator("#contentFrame")).toHaveAttribute("src", /resources\.html/i);
  });
});
