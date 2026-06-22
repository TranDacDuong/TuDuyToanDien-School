import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "Mau_tin_nhan_nhan_xet_buoi_hoc_gui_phu_huynh.txt");
const baselinePath = path.join(root, "SQL session evaluations.sql");
const migrationPath = path.join(root, "SQL update session evaluation templates.sql");
const sourceLines = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);

const statusDefinitions = [
  ["TIẾP THU KIẾN THỨC TỐT", "knowledge_good", "positive"],
  ["TẬP TRUNG VÀO BÀI GIẢNG", "focused", "positive"],
  ["SÔI NỔI", "enthusiastic", "positive"],
  ["TIẾP THU KIẾN THỨC CÒN CHẬM", "knowledge_slow", "needs_attention"],
  ["MẤT TẬP TRUNG", "distracted", "needs_attention"],
  ["ÍT TƯƠNG TÁC", "low_interaction", "needs_attention"],
  ["NÓI CHUYỆN RIÊNG", "private_talking", "needs_attention"],
  ["SỬ DỤNG ĐIỆN THOẠI", "phone_use", "needs_attention"],
  ["CHƯA LÀM BÀI TẬP", "homework_incomplete", "needs_attention"],
  ["ĐI HỌC MUỘN", "late", "needs_attention"],
  ["LỖI KHÁC", "other_behavior", "needs_attention"],
];
const cleanClosingHeading = "MẪU CÂU KẾT THÚC KHI KHÔNG CÓ LỖI";
const attentionClosingHeading = "MẪU CÂU KẾT THÚC KHI CÓ LỖI CẦN KHẮC PHỤC";
const headings = new Set([
  ...statusDefinitions.map(([heading]) => heading),
  cleanClosingHeading,
  attentionClosingHeading,
]);

function numberedItemsAfter(heading) {
  const start = sourceLines.findIndex(line => line.trim() === heading);
  if (start < 0) throw new Error(`Không tìm thấy mục "${heading}" trong file mẫu.`);
  const items = [];
  for (let index = start + 1; index < sourceLines.length; index += 1) {
    const line = sourceLines[index].trim();
    if (headings.has(line)) break;
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) items.push(match[1].trim());
  }
  if (items.length !== 5) throw new Error(`Mục "${heading}" cần có đúng 5 mẫu, hiện có ${items.length}.`);
  return items;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const statusRows = statusDefinitions.map(([name, code, category], index) =>
  `  (${sql(code)}, ${sql(name)}, ${sql(category)}, ${index + 1}, true)`
);
const templateDefinitions = [];
for (const [heading, code] of statusDefinitions) {
  for (const content of numberedItemsAfter(heading)) {
    templateDefinitions.push(["status", code, content]);
  }
}
for (const content of numberedItemsAfter(cleanClosingHeading)) {
  // The fixed opening is now assembled in JavaScript. The legacy "opening" slot stores clean closings.
  templateDefinitions.push(["opening", null, content]);
}
for (const content of numberedItemsAfter(attentionClosingHeading)) {
  templateDefinitions.push(["closing", null, content]);
}

const templateRows = templateDefinitions.map(([section, code, content]) => {
  const statusId = code
    ? `(SELECT id FROM public.evaluation_statuses WHERE code = ${sql(code)})`
    : "NULL";
  return `  (${sql(section)}, ${statusId}, ${sql(content)}, true, 1)`;
});
const dataSql = `-- Phiên bản mẫu nhận xét buổi học 2: khung tin nhắn cố định, cụm trạng thái và hai loại câu kết.
UPDATE public.evaluation_statuses SET active = false WHERE active;

INSERT INTO public.evaluation_statuses (code, name, category, display_order, active)
VALUES
${statusRows.join(",\n")}
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

DELETE FROM public.evaluation_message_templates;

INSERT INTO public.evaluation_message_templates
  (section_type, status_id, content, active, weight)
VALUES
${templateRows.join(",\n")}
ON CONFLICT DO NOTHING;
`;

const migrationSql = `-- Cập nhật hệ thống nhận xét buổi học sang mẫu gửi phụ huynh phiên bản 2.
-- Có thể chạy lại an toàn; nhận xét đã gửi và bản nháp cũ không bị xóa.
BEGIN;

${dataSql}
COMMIT;

SELECT
  (SELECT count(*) FROM public.evaluation_statuses WHERE active) AS active_statuses,
  (SELECT count(*) FROM public.evaluation_message_templates WHERE active) AS active_templates;
`;

const baseline = fs.readFileSync(baselinePath, "utf8");
const dataMarker = "-- Phiên bản mẫu nhận xét buổi học 2:";
const markerStart = baseline.indexOf(dataMarker);
const dataStart = markerStart >= 0 ? markerStart : baseline.indexOf("INSERT INTO public.evaluation_statuses");
const summaryMatch = /SELECT\r?\n\s*\(SELECT count\(\*\) FROM public\.evaluation_statuses/.exec(baseline.slice(dataStart));
const summaryStart = summaryMatch ? dataStart + summaryMatch.index : -1;
if (dataStart < 0 || summaryStart < 0) throw new Error("Không xác định được vùng dữ liệu mẫu trong SQL nền.");
const updatedBaseline = baseline.slice(0, dataStart) + dataSql + "\n" + baseline.slice(summaryStart);

fs.writeFileSync(baselinePath, updatedBaseline, "utf8");
fs.writeFileSync(migrationPath, migrationSql, "utf8");
console.log(`Đã tạo ${path.basename(migrationPath)}: ${statusDefinitions.length} trạng thái, ${templateDefinitions.length} mẫu.`);
