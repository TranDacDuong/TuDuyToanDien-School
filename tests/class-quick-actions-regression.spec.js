const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test.describe("Class quick actions regression", () => {
  test("dashboard asks staff what to do whenever the plain Classes tab opens", async () => {
    const source = read("dashboard.html");
    expect(source).toContain('page === "class.html"');
    expect(source).toContain('type: "class:open-quick-actions"');
    expect(source).toContain('["admin","teacher","assistant"]');
  });

  test("class launcher exposes create, attendance, and full management choices", async () => {
    const html = read("class.html");
    const source = read("class_quick_actions.js");
    expect(html).toContain('id="classQuickOverlay"');
    expect(source).toContain("Bạn muốn sử dụng chức năng gì?");
    expect(source).toContain("Tạo buổi học");
    expect(source).toContain("Điểm danh");
    expect(source).toContain("Quản lý lớp học");
  });

  test("attendance checks today's session and returns to attendance after creation", async () => {
    const quickActions = read("class_quick_actions.js");
    const classManage = read("class_manage.js");
    expect(quickActions).toContain('.from("class_sessions")');
    expect(quickActions).toContain('.eq("session_date",today)');
    expect(quickActions).toContain('afterSave: returnToAttendance ? "attendance" : "exams"');
    expect(classManage).toContain('options.afterSave === "attendance"');
    expect(classManage).toContain('data-attendance-date=');
  });

  test("missing session offers creation or skipping into attendance", async ({ page }) => {
    await page.setContent(`
      <style>.hidden{display:none}.popup-overlay{display:block}</style>
      <div id="classQuickOverlay" class="hidden popup-overlay">
        <div><h2 id="classQuickTitle"></h2><p id="classQuickSubtitle"></p><div id="classQuickBody"></div></div>
      </div>`);
    await page.evaluate(() => {
      window._currentRole = "admin";
      window.getClassQuickActionData = () => [
        { id:"today-class", class_name:"Vật lý 10", subject_name:"Vật lý", grade_name:"10", is_today:true, today_times:[{start_time:"18:00",end_time:"19:30",room_name:"P1"}] },
        { id:"later-class", class_name:"Toán 11", subject_name:"Toán", grade_name:"11", is_today:false, today_times:[] }
      ];
      const query = { select(){return this;}, eq(){return this;}, limit(){return Promise.resolve({data:[],error:null});} };
      window.sb = { from(){ return query; } };
      window.__calls = [];
      window.openClassView = async (id) => window.__calls.push("open:"+id);
      window.cvSwitchTab = async (tab) => window.__calls.push("tab:"+tab);
      window.cvFocusAttendanceDate = () => window.__calls.push("focus");
    });
    await page.addScriptTag({ path:path.join(root,"class_quick_actions.js") });
    await page.evaluate(() => window.postMessage({type:"class:open-quick-actions"},"*"));

    await expect(page.getByRole("heading", {name:"Bạn muốn sử dụng chức năng gì?"})).toBeVisible();
    await page.getByRole("button", {name:/Điểm danh/}).click();
    const classButtons = page.locator(".class-quick-class");
    await expect(classButtons.first()).toContainText("Vật lý 10");
    await expect(classButtons.first()).toContainText("Hôm nay");
    await classButtons.first().click();
    await expect(page.getByRole("heading", {name:"Hôm nay chưa tạo buổi học"})).toBeVisible();
    await expect(page.getByRole("button", {name:"Tạo buổi học"})).toBeVisible();
    await page.getByRole("button", {name:"Bỏ qua"}).click();
    await expect.poll(() => page.evaluate(() => window.__calls)).toEqual(["open:today-class","tab:attendance"]);
  });

  test("create action opens the create interface with class as its first field", async ({ page }) => {
    await page.setContent(`
      <style>.hidden{display:none}.popup-overlay{display:block}</style>
      <div id="classQuickOverlay" class="hidden popup-overlay">
        <div><h2 id="classQuickTitle"></h2><p id="classQuickSubtitle"></p><div id="classQuickBody"></div></div>
      </div>`);
    await page.evaluate(() => {
      window._currentRole = "teacher";
      window.getClassQuickActionData = () => [
        { id:"class-a", class_name:"Toán 10", is_today:true, today_times:[] },
        { id:"class-b", class_name:"Vật lý 11", is_today:false, today_times:[] }
      ];
      window.__calls = [];
      window.openClassView = async (id) => window.__calls.push(`open:${id}:inPlace=${window._openingClassFromUrl}`);
      window.cvSwitchTab = async (tab) => window.__calls.push(`tab:${tab}`);
      window.cvOpenAddClassSession = async (_id, options) => window.__calls.push(`form:${options.afterSave}`);
    });
    await page.addScriptTag({ path:path.join(root,"class_quick_actions.js") });
    await page.evaluate(() => window.postMessage({type:"class:open-quick-actions"},"*"));
    await page.getByRole("button", {name:/Tạo buổi học/}).click();

    await expect(page.getByRole("heading", {name:"Tạo buổi học"})).toBeVisible();
    await expect(page.getByLabel("Lớp học")).toBeVisible();
    await expect(page.getByLabel("Lớp học").locator("option")).toHaveCount(3);
    await page.getByLabel("Lớp học").selectOption("class-a");
    await expect.poll(() => page.evaluate(() => window.__calls)).toEqual([
      "open:class-a:inPlace=true",
      "tab:exams",
      "form:exams"
    ]);
  });
});
