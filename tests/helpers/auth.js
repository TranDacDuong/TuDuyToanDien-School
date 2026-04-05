const { expect } = require("@playwright/test");

function getCred(prefix) {
  const email = process.env[`PLAYWRIGHT_${prefix}_EMAIL`];
  const password = process.env[`PLAYWRIGHT_${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

async function loginAs(page, creds) {
  await page.goto("/index.html");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator("#submitBtn").click();
  await page.waitForURL(/dashboard\.html/i, { timeout: 30000 });
}

async function expectRedirectedToDashboard(page, targetPath) {
  await page.goto(targetPath);
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/dashboard\.html/i);
}

module.exports = {
  getCred,
  loginAs,
  expectRedirectedToDashboard,
};
