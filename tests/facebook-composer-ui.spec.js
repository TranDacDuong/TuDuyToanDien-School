const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function composerMarkup(){
  const source = fs.readFileSync(path.join(root, "facebook_posting.html"), "utf8");
  const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join("\n");
  const modal = source.match(/<div class="modal" id="postModal">[\s\S]*?(?=<div class="modal" id="typeModal">)/i)?.[0];
  if(!modal) throw new Error("Post composer modal not found");
  return `<style>:root{--font-body:Arial,sans-serif;--ink:#17233d}${styles}</style>${modal}`;
}

async function showComposer(page){
  await page.setContent(composerMarkup());
  await page.evaluate(() => document.getElementById("postModal").classList.add("show"));
}

test.describe("Facebook-like post composer", () => {
  test("keeps the post surface and tools in a two-column desktop layout", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await showComposer(page);

    await expect(page.getByRole("heading", { name:"Soạn bài đăng" })).toBeVisible();
    await expect(page.getByPlaceholder("Bạn đang nghĩ gì?")).toBeVisible();
    await expect(page.getByText("Thêm ảnh vào bài viết")).toBeVisible();
    await expect(page.getByText("Chi tiết bài đăng")).toBeVisible();
    await expect(page.getByText("AI hỗ trợ soạn bài")).toBeVisible();

    const columns = await page.locator(".fb-compose-layout").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(2);
    const overflow = await page.locator(".facebook-composer-card").evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if(process.env.CAPTURE_COMPOSER) await page.screenshot({ path:testInfo.outputPath("composer-desktop.png"), fullPage:true });
  });

  test("collapses cleanly to one column on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await showComposer(page);

    const columns = await page.locator(".fb-compose-layout").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(1);
    const overflow = await page.locator(".facebook-composer-card").evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name:"Hẹn lịch Facebook" })).toBeVisible();
  });
});
