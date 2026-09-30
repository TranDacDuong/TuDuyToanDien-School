const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "facebook_posting.html"), "utf8");
const enrollmentAssets = fs.readFileSync(path.join(root, "assets", "enrollment", "enrollment_images.js"), "utf8");

test.describe("Facebook posting initial page and loading", () => {
  test("prefers the fanpage assigned to the signed-in staff member", async () => {
    expect(source).toContain("function preferredPageId(pages, profile)");
    expect(source).toContain('String(page.assigned_staff_id || "") === String(profile?.id || "")');
    expect(source).toContain("S.activePageId = preferredPageId(S.pages, S.profile);");
  });

  test("falls back to the main MindUp fanpage when there is no assignment", async () => {
    expect(source).toContain("const MAIN_FACEBOOK_PAGE_ID = DEFAULT_PAGES[0].page_id;");
    expect(source).toContain('page.page_id || "") === MAIN_FACEBOOK_PAGE_ID');
  });

  test("keeps heavy authoring assets out of the initial parser-blocking path", async () => {
    const head = source.slice(0, source.indexOf("</head>"));
    expect(head).not.toContain('<script src="assets/enrollment/enrollment_images.js"></script>');
    expect(head).not.toContain('<script src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"></script>');
    expect(head).not.toContain('<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>');
    expect(source).toContain('await loadScriptOnce("assets/enrollment/enrollment_images.js");');
    expect(source).toContain("await ensureQuizRenderingDependencies();");
    expect(enrollmentAssets.startsWith("window.ENROLLMENT_BASE64_IMAGES = {")).toBeTruthy();
  });

  test("renders before server maintenance and only fetches the visible week", async () => {
    expect(source).toContain("const weekEnd = dateKey(addDays(S.weekStart, 6));");
    expect(source).toMatch(/renderAll\(\);\s*window\.setTimeout\(\(\) => runBackgroundMaintenance\(\), 0\);/);
    expect(source).toContain('sb.rpc("sync_facebook_fanpage_weekly_tasks")');
  });
});
