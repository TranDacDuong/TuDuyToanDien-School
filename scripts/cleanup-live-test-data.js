const { chromium } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "https://tuduytoandien.vercel.app";
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const prefixes = (process.env.CLEANUP_PREFIXES || "TEST-CODEX-,TEST-ROLE-,PW-REG-")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!adminEmail || !adminPassword) {
  console.error("Missing PLAYWRIGHT_ADMIN_EMAIL or PLAYWRIGHT_ADMIN_PASSWORD");
  process.exit(1);
}

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
  const result = await page.evaluate(async ({ prefixes }) => {
    const client = window.sb;
    const matchesPrefix = (value) => prefixes.some((prefix) => String(value || "").startsWith(prefix));
    const summary = { classes: 0, courses: 0, exams: 0, questions: 0, users: 0 };

    const { data: classes } = await client.from("classes").select("id,class_name");
    const classIds = (classes || []).filter((row) => matchesPrefix(row.class_name)).map((row) => row.id);
    if (classIds.length) {
      await client.from("class_schedules").delete().in("class_id", classIds);
      await client.from("class_students").delete().in("class_id", classIds);
      await client.from("class_teachers").delete().in("class_id", classIds);
      await client.from("classes").delete().in("id", classIds);
      summary.classes = classIds.length;
    }

    const { data: courses } = await client.from("courses").select("id,name");
    const courseIds = (courses || []).filter((row) => matchesPrefix(row.name)).map((row) => row.id);
    if (courseIds.length) {
      const { data: sessions } = await client.from("course_sessions").select("id,lesson_id").in("course_id", courseIds);
      const lessonIds = [...new Set((sessions || []).map((row) => row.lesson_id).filter(Boolean))];
      await client.from("course_registration_requests").delete().in("course_id", courseIds);
      await client.from("course_enrollments").delete().in("course_id", courseIds);
      await client.from("course_managers").delete().in("course_id", courseIds);
      await client.from("course_sessions").delete().in("course_id", courseIds);
      if (lessonIds.length) await client.from("lessons").delete().in("id", lessonIds);
      await client.from("courses").delete().in("id", courseIds);
      summary.courses = courseIds.length;
    }

    const { data: exams } = await client.from("exams").select("id,title");
    const examIds = (exams || []).filter((row) => matchesPrefix(row.title)).map((row) => row.id);
    if (examIds.length) {
      await client.from("class_exams").delete().in("exam_id", examIds);
      await client.from("exam_questions").delete().in("exam_id", examIds);
      await client.from("exams").delete().in("id", examIds);
      summary.exams = examIds.length;
    }

    const { data: questions } = await client.from("question_bank").select("id,question_text");
    const questionIds = (questions || []).filter((row) => matchesPrefix(row.question_text)).map((row) => row.id);
    if (questionIds.length) {
      await client.from("exam_answers").delete().in("question_id", questionIds);
      await client.from("question_bank").delete().in("id", questionIds);
      summary.questions = questionIds.length;
    }

    const { data: users } = await client.from("users").select("id,full_name,role").in("role", ["student", "teacher"]);
    const matchedUsers = (users || []).filter((row) => matchesPrefix(row.full_name));
    for (const user of matchedUsers) {
      if (user.role === "teacher") {
        await client.from("class_teachers").delete().eq("teacher_id", user.id);
        await client.from("course_managers").delete().eq("teacher_id", user.id);
        const downgradeResult = await client.from("users").update({ role: "student", subject: null }).eq("id", user.id);
        if (downgradeResult?.error) throw downgradeResult.error;
      }
      const { error: deleteError } = await client.rpc("admin_delete_student_cascade", { p_student_id: user.id });
      if (deleteError) throw deleteError;
    }
    summary.users = matchedUsers.length;

    return summary;
  }, { prefixes });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
