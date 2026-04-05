const { test, expect } = require("@playwright/test");
const { getCred, loginAs, expectRedirectedToDashboard } = require("./helpers/auth");

const teacherCreds = getCred("TEACHER");
const studentCreds = getCred("STUDENT");

test.describe("Role access regression", () => {
  test("teacher cannot access tuition or system admin page", async ({ page }) => {
    test.skip(!teacherCreds, "Teacher credentials not configured");
    await loginAs(page, teacherCreds);
    await page.goto("/courses.html");
    await expect(page.locator("#openCreateBtn")).toBeHidden();
    await expectRedirectedToDashboard(page, "/tuition.html");
    await expectRedirectedToDashboard(page, "/sourcedata.html");
  });

  test("student cannot access question bank, exam editor, or system admin page", async ({ page }) => {
    test.skip(!studentCreds, "Student credentials not configured");
    await loginAs(page, studentCreds);
    await expectRedirectedToDashboard(page, "/question.html");
    await expectRedirectedToDashboard(page, "/exam.html");
    await expectRedirectedToDashboard(page, "/sourcedata.html");
  });
});
