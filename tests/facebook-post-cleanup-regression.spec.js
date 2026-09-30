const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

test("Facebook cleanup waits until the following local day and keeps history keys", async () => {
  const sql = fs.readFileSync(path.join(root, "SQL facebook post cleanup after publishing.sql"), "utf8");
  const worker = fs.readFileSync(path.join(root, "supabase/functions/facebook-post-cleanup/index.ts"), "utf8");
  expect(sql).toContain("scheduled_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date");
  expect(sql).toContain("'5 17 * * *'");
  expect(worker).toContain("content: null");
  expect(worker).toContain("image_url: null");
  expect(worker).toContain("internal_note: null");
  expect(worker).toContain("question_fingerprint");
  expect(worker).toContain("phenomenon_fingerprint");
  expect(worker).toContain("await deleteDriveFile(fileId, accessToken)");
  expect(worker.indexOf("await deleteDriveFile(fileId, accessToken)")).toBeLessThan(worker.indexOf("content: null"));
});
