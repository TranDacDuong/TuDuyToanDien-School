const { expect } = require("@playwright/test");

function getCred(prefix) {
  const email = process.env[`PLAYWRIGHT_${prefix}_EMAIL`];
  const password = process.env[`PLAYWRIGHT_${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

async function loginAs(page, creds) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/index.html");
    await page.locator("#email").fill(creds.email);
    await page.locator("#password").fill(creds.password);
    await page.locator("#submitBtn").click();

    try {
      await page.waitForURL(/dashboard\.html/i, { timeout: 15000 });
      return;
    } catch (error) {
      const hasInvalidMessage = await page.locator("text=Email hoặc mật khẩu không đúng").isVisible().catch(() => false);
      if (attempt === 3 || !hasInvalidMessage) throw error;
      await page.waitForTimeout(2500 * attempt);
    }
  }
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
