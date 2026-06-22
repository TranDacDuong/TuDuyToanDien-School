const path = require("path");
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addScriptTag({ path: path.join(__dirname, "..", "class_evaluations.js") });
});

test("ghép nhận xét có cả điểm tốt và điểm cần khắc phục", async ({ page }) => {
  const message = await page.evaluate(() => window.SessionEvaluationMessage.build({
    parentName: "Nguyễn Văn A",
    subject: "Toán",
    date: "22/06/2026",
    studentName: "Minh",
    positivePhrases: ["hiểu bài nhanh", "duy trì sự tập trung tốt"],
    attentionPhrases: ["đôi lúc còn mất tập trung", "chưa hoàn thành đầy đủ bài tập"],
    closing: "Mong anh/chị tiếp tục đồng hành cùng giáo viên.",
  }));

  expect(message).toBe([
    "Kính gửi anh/chị Nguyễn Văn A,",
    "Trong buổi học môn Toán ngày 22/06/2026, em Minh hiểu bài nhanh và duy trì sự tập trung tốt.",
    "Tuy nhiên, con đôi lúc còn mất tập trung và chưa hoàn thành đầy đủ bài tập.",
    "Mong anh/chị tiếp tục đồng hành cùng giáo viên.",
  ].join("\n\n"));
});

test("dùng câu ghi nhận chung khi chỉ có điểm cần khắc phục", async ({ page }) => {
  const message = await page.evaluate(() => window.SessionEvaluationMessage.build({
    parentName: "",
    subject: "Vật Lý",
    date: "21/06/2026",
    studentName: "An",
    positivePhrases: [],
    attentionPhrases: ["cần mạnh dạn hơn khi tham gia các hoạt động trên lớp"],
    closing: "Hy vọng em sẽ sớm cải thiện những điểm còn hạn chế",
  }));

  expect(message).toContain("Kính gửi Quý phụ huynh,");
  expect(message).toContain("giáo viên đã theo dõi và ghi nhận quá trình học tập của em An.");
  expect(message).toContain("Tuy nhiên, con cần mạnh dạn hơn khi tham gia các hoạt động trên lớp.");
});

test("không thêm đoạn Tuy nhiên khi không có điểm cần khắc phục", async ({ page }) => {
  const message = await page.evaluate(() => window.SessionEvaluationMessage.build({
    parentName: "Trần Thị B",
    subject: "Toán",
    date: "20/06/2026",
    studentName: "Hà",
    positivePhrases: ["hiểu bài nhanh", "chú ý lắng nghe", "tích cực tham gia phát biểu"],
    attentionPhrases: [],
    closing: "Cảm ơn anh/chị đã luôn đồng hành.",
  }));

  expect(message).toContain("hiểu bài nhanh, chú ý lắng nghe và tích cực tham gia phát biểu.");
  expect(message).not.toContain("Tuy nhiên");
  expect(message).not.toContain("..");
});
