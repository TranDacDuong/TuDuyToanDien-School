const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");

const teacherCreds = getCred("TEACHER");
const studentCreds = getCred("STUDENT");

test.describe("Role UI regression", () => {
  test("teacher can open question and exam authoring UIs", async ({ page }) => {
    test.skip(!teacherCreds, "Teacher credentials not configured");
    await loginAs(page, teacherCreds);

    await page.goto("/question.html");
    await page.locator(".quickOp").nth(3).click();
    await expect(page.locator("#questionText")).toBeVisible();

    await page.goto("/exam.html");
    await page.locator("button.btn").first().click();
    await expect(page.locator("#fTitle")).toBeVisible();
  });

  test("student sees personal tuition view and no authoring UI", async ({ page }) => {
    test.skip(!studentCreds, "Student credentials not configured");
    await loginAs(page, studentCreds);

    await page.goto("/tuition.html");
    await expect(page.getByText("Học phí của tôi")).toBeVisible();

    await page.goto("/courses.html");
    await expect(page.locator("#openCreateBtn")).toBeHidden();
  });
});
