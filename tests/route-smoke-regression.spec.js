const { test, expect } = require("@playwright/test");

async function expectRouteResponds(page, path, urlPattern) {
  const response = await page.goto(path);
  expect(response === null || response.ok()).toBeTruthy();
  await expect(page).toHaveURL(urlPattern);
}

test.describe("Route smoke regression", () => {
  test("index route responds", async ({ page }) => {
    await expectRouteResponds(page, "/index.html", /index\.html/i);
  });

  test("home route responds", async ({ page }) => {
    await expectRouteResponds(page, "/home.html", /home\.html|index\.html/i);
  });

  test("courses route responds", async ({ page }) => {
    await expectRouteResponds(page, "/courses.html", /courses\.html|index\.html/i);
  });

  test("class route responds", async ({ page }) => {
    await expectRouteResponds(page, "/class.html", /class\.html|index\.html/i);
  });

  test("public exam route responds", async ({ page }) => {
    await expectRouteResponds(page, "/public_exam.html", /public_exam\.html|index\.html/i);
  });

  test("game route responds", async ({ page }) => {
    await expectRouteResponds(page, "/game.html", /game\.html|index\.html/i);
  });

  test("resources route responds", async ({ page }) => {
    await expectRouteResponds(page, "/resources.html", /resources\.html|index\.html/i);
  });

  test("messages route responds", async ({ page }) => {
    await expectRouteResponds(page, "/messages.html", /messages\.html|index\.html/i);
  });

  test("notifications route responds", async ({ page }) => {
    await expectRouteResponds(page, "/notifications.html", /notifications\.html|index\.html/i);
  });
});
