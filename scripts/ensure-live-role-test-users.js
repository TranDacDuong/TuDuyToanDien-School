const { chromium } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "https://tuduytoandien.vercel.app";
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const prefix = process.env.ROLE_TEST_PREFIX || "PW-ROLE-";
const timestamp = Date.now();

if (!adminEmail || !adminPassword) {
  console.error("Missing PLAYWRIGHT_ADMIN_EMAIL or PLAYWRIGHT_ADMIN_PASSWORD");
  process.exit(1);
}

const teacherCreds = {
  full_name: `${prefix}Teacher ${timestamp}`,
  email: `pw-role-teacher-${timestamp}@gmail.com`,
  phone: `09${String(timestamp).slice(-8)}`,
  password: "Codex123!",
  birth_year: 1995,
  province: "Ha Noi",
  school: "PW Role School",
  subject: "Toán",
};

const studentCreds = {
  full_name: `${prefix}Student ${timestamp}`,
  email: `pw-role-student-${timestamp}@gmail.com`,
  phone: `08${String(timestamp).slice(-8)}`,
  password: "Codex123!",
  birth_year: 2010,
  province: "Ha Noi",
  school: "PW Role School",
};

async function login(page) {
  await page.goto(`${baseURL}/index.html`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(adminEmail);
  await page.locator("#password").fill(adminPassword);
  await page.locator("#submitBtn").click();
  await page.waitForURL(/dashboard\.html/i, { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page);

  const result = await page.evaluate(async ({ teacherCreds, studentCreds }) => {
    const client = window.sb;
    const rows = [teacherCreds, studentCreds];
    const { error: importError } = await client.rpc("admin_import_students_batch", { p_rows: rows });
    if (importError) throw importError;

    const { data: importedUsers, error: usersError } = await client
      .from("users")
      .select("id,email,role")
      .in("email", [teacherCreds.email, studentCreds.email]);
    if (usersError) throw usersError;

    const teacherUser = (importedUsers || []).find((item) => item.email === teacherCreds.email);
    if (!teacherUser) throw new Error("Teacher test account was not created");

    const { error: teacherUpdateError } = await client
      .from("users")
      .update({
        role: "teacher",
        subject: teacherCreds.subject,
        birth_year: teacherCreds.birth_year,
        phone: teacherCreds.phone,
      })
      .eq("id", teacherUser.id);
    if (teacherUpdateError) throw teacherUpdateError;

    return {
      teacher: { email: teacherCreds.email, password: teacherCreds.password },
      student: { email: studentCreds.email, password: studentCreds.password },
    };
  }, { teacherCreds, studentCreds });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
