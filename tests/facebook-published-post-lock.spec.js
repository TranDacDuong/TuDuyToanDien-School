const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "facebook_posting.html"), "utf8");

test.describe("Published Facebook posts", () => {
  test("renders published posts as dark, disabled calendar entries", async () => {
    expect(source).toContain('if (status === "published") return "published";');
    expect(source).toMatch(/\.post-pill\.published\{background:#[0-9a-f]{6};border-color:#[0-9a-f]{6};box-shadow:none;cursor:default\}/i);
    expect(source).toContain('draggable="${published ? "false" : "true"}"');
    expect(source).toContain('aria-disabled="${published ? "true" : "false"}"');
  });

  test("does not open or attach drag behavior to published posts", async () => {
    expect(source).toContain('const published = el.dataset.postStatus === "published";');
    expect(source).toContain('if (!published) openPostModal(el.dataset.postId);');
    expect(source).toMatch(/if \(published\) return;\s*el\.addEventListener\("dragstart"/);
  });
});
