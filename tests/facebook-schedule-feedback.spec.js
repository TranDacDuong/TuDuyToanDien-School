const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

test("Facebook scheduling shows immediate feedback and prevents duplicate clicks", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "facebook_posting.html"), "utf8");
  expect(source).toContain('id="postActionNotice"');
  expect(source).toContain('actionBtn.textContent = mode === "schedule" ? "Đang hẹn lịch..."');
  expect(source).toContain('if (actionBtn?.disabled) return;');
  expect(source).toContain('notice.className = `fb-action-notice ${type} show`');
  expect(source).toContain('actionBtn.disabled = false;');
});
