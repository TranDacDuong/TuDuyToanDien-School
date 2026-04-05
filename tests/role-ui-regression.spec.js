const { test, expect } = require("@playwright/test");
const { getCred, loginAs } = require("./helpers/auth");
const { firstVisible } = require("./helpers/ui");

const teacherCreds = getCred("TEACHER");
const studentCreds = getCred("STUDENT");

test.describe("Role UI regression", () => {
  test("teacher can open question and exam authoring UIs", async ({ page }) => {
    test.skip(!teacherCreds, "Teacher credentials not configured");
    await loginAs(page, teacherCreds);

    await page.goto("/question.html");
    await firstVisible(page, [
      '[data-testid="question-quick-create"]',
      '.quickOps .quickOp:nth-of-type(4)',
    ]).click();
    await expect(page.locator("#questionText")).toBeVisible();

    await page.goto("/exam.html");
    await firstVisible(page, [
      '[data-testid="exam-create-button"]',
      'button[onclick="openEditor(null)"]',
    ]).click();
    await expect(page.locator("#fTitle")).toBeVisible();
  });

  test("student sees personal tuition view and no authoring UI", async ({ page }) => {
    test.skip(!studentCreds, "Student credentials not configured");
    await loginAs(page, studentCreds);

    await page.goto("/tuition.html");
    await expect(page.locator("body")).toContainText(/học phí|hoc phi/i);

    await page.goto("/courses.html");
    await expect(firstVisible(page, ['[data-testid="course-create-button"]', '#openCreateBtn'])).toBeHidden();
  });
});
