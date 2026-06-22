from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Mau_tin_nhan_nhan_xet_buoi_hoc_gui_phu_huynh.txt"
JS_GENERATOR = ROOT / "scripts" / "generate-session-evaluation-sql.mjs"
OUTPUT = ROOT / "SQL session evaluations.sql"

STATUSES = [
    ("RẤT TỐT", "very_good", "positive"),
    ("ỔN ĐỊNH", "stable", "neutral"),
    ("MẤT TẬP TRUNG", "distracted", "needs_attention"),
    ("ÍT TƯƠNG TÁC", "low_interaction", "needs_attention"),
    ("NÓI CHUYỆN RIÊNG", "private_talking", "needs_attention"),
    ("MẤT TRẬT TỰ", "disruptive", "needs_attention"),
    ("SỬ DỤNG ĐIỆN THOẠI", "phone_use", "needs_attention"),
    ("CHƯA LÀM BÀI TẬP THEO YÊU CẦU", "homework_incomplete", "needs_attention"),
    ("ĐI HỌC MUỘN", "late", "needs_attention"),
    ("HÀNH VI CHƯA PHÙ HỢP KHÁC", "other_behavior", "needs_attention"),
]


def numbered_lines(block):
    return [item.strip() for item in re.findall(r"^\s*\d+\.\s+(.+?)\s*$", block, re.M)]


def sql(value):
    return "'" + str(value).replace("'", "''") + "'"


source = SOURCE.read_text(encoding="utf-8-sig")
generator = JS_GENERATOR.read_text(encoding="utf-8")

opening = numbered_lines(source.split("## THƯ VIỆN MỞ ĐẦU", 1)[1].split("## THƯ VIỆN KẾT THÚC", 1)[0])
closing = numbered_lines(source.split("## THƯ VIỆN KẾT THÚC", 1)[1].split("# TRẠNG THÁI:", 1)[0])

private_block = re.search(
    r"const privateTalking = \{(.*?)\n\};",
    generator,
    re.S,
).group(1)
private_description_block, private_expectation_block = private_block.split("expectation:", 1)
private_description = [
    json.loads(item)
    for item in re.findall(r'"(?:[^"\\]|\\.)*"', private_description_block)
]
private_expectation = [
    json.loads(item)
    for item in re.findall(r'"(?:[^"\\]|\\.)*"', private_expectation_block)
]

status_blocks = {}
parts = re.split(r"^# TRẠNG THÁI:\s*", source, flags=re.M)
for part in parts[1:]:
    lines = part.splitlines()
    name = lines[0].strip()
    body = "\n".join(lines[1:])
    description, expectation = body.split("KỲ VỌNG", 1)
    status_blocks[name] = {
        "description": numbered_lines(description),
        "expectation": numbered_lines(expectation),
    }
status_blocks["NÓI CHUYỆN RIÊNG"] = {
    "description": private_description,
    "expectation": private_expectation,
}

if len(opening) != 10 or len(closing) != 10:
    raise RuntimeError("File cần có đúng 10 mẫu mở đầu và 10 mẫu kết thúc.")
for name, _, _ in STATUSES:
    item = status_blocks.get(name, {})
    if len(item.get("description", [])) != 10 or len(item.get("expectation", [])) != 10:
        raise RuntimeError(f'Trạng thái "{name}" chưa đủ 10 mẫu mô tả và 10 mẫu kỳ vọng.')

schema = re.search(
    r"const schema = String\.raw`(.*?)`;\n\nconst seed",
    generator,
    re.S,
).group(1).strip()

status_rows = [
    f"({sql(code)}, {sql(name)}, {sql(category)}, {index}, true)"
    for index, (name, code, category) in enumerate(STATUSES, 1)
]


def template_row(section, code, content):
    status_id = (
        f"(SELECT id FROM public.evaluation_statuses WHERE code = {sql(code)})"
        if code
        else "NULL"
    )
    return f"({sql(section)}, {status_id}, {sql(content)}, true, 1)"


template_rows = [
    *[template_row("opening", None, item) for item in opening],
    *[template_row("closing", None, item) for item in closing],
]
for name, code, _ in STATUSES:
    template_rows.extend(
        template_row("status", code, item)
        for item in status_blocks[name]["description"]
    )
    template_rows.extend(
        template_row("expectation", code, item)
        for item in status_blocks[name]["expectation"]
    )

status_values = ",\n  ".join(status_rows)
template_values = ",\n  ".join(template_rows)
seed = f"""
INSERT INTO public.evaluation_statuses (code, name, category, display_order, active)
VALUES
  {status_values}
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

INSERT INTO public.evaluation_message_templates
  (section_type, status_id, content, active, weight)
VALUES
  {template_values}
ON CONFLICT DO NOTHING;

SELECT
  (SELECT count(*) FROM public.evaluation_statuses WHERE active) AS active_statuses,
  (SELECT count(*) FROM public.evaluation_message_templates WHERE active) AS active_templates;
""".strip()

OUTPUT.write_text(f"{schema}\n\n{seed}\n", encoding="utf-8")
print(f"Generated {OUTPUT.name}: {len(status_rows)} statuses, {len(template_rows)} templates.")
