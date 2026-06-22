(function () {
  let statuses = [];
  let templates = [];
  const getSb = () => window.sb;
  const esc = value => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sectionLabel = value => ({
    opening: "Kết thúc – không có lỗi", status: "Cụm trạng thái",
    expectation: "Mẫu cũ – không sử dụng", closing: "Kết thúc – có lỗi cần khắc phục",
  }[value] || value);
  const defaultStatusDefinitions = [
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

  function syncStatusVisibility() {
    const section = document.getElementById("evaluationTemplateSection")?.value;
    const wrap = document.getElementById("evaluationTemplateStatusWrap");
    if (wrap) wrap.style.display = section === "status" ? "" : "none";
  }

  function renderFilters() {
    [["evaluationTemplateStatus", "-- Chọn trạng thái --", true], ["evaluationTemplateStatusFilter", "Tất cả trạng thái", false]]
      .forEach(([id, label, activeOnly]) => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = `<option value="">${label}</option>`
          + statuses.filter(item => !activeOnly || item.active).map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
      });
    syncStatusVisibility();
  }

  function renderList() {
    const list = document.getElementById("evaluationTemplateList");
    if (!list) return;
    const section = document.getElementById("evaluationTemplateSectionFilter")?.value || "";
    const statusId = document.getElementById("evaluationTemplateStatusFilter")?.value || "";
    const statusMap = new Map(statuses.map(item => [item.id, item.name]));
    const visible = templates.filter(item =>
      (!section || item.section_type === section) && (!statusId || item.status_id === statusId));
    const count = document.getElementById("evaluationTemplateCount");
    if (count) count.textContent = visible.length;
    if (!visible.length) {
      list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink-light)">Không có mẫu phù hợp.</div>';
      return;
    }
    list.innerHTML = visible.map(item => `
      <div style="padding:13px 14px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start">
        <div>
          <div style="font-size:.72rem;font-weight:800;color:var(--ink-light);margin-bottom:7px">${sectionLabel(item.section_type)}${item.status_id ? ` · ${esc(statusMap.get(item.status_id) || "")}` : ""}</div>
          <textarea id="evaluation-template-${item.id}" style="width:100%;min-height:78px;resize:vertical;border:1px solid var(--border);border-radius:7px;padding:9px 10px;font:inherit;line-height:1.5">${esc(item.content)}</textarea>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-outline btn-sm" type="button" onclick="updateEvaluationTemplate('${item.id}')">Lưu</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="toggleEvaluationTemplate('${item.id}',${item.active ? "false" : "true"})">${item.active ? "Tạm ẩn" : "Bật lại"}</button>
        </div>
      </div>`).join("");
  }

  window.loadEvaluationTemplatesAdmin = async function () {
    const list = document.getElementById("evaluationTemplateList");
    if (list) list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink-light)">Đang tải...</div>';
    const [statusResult, templateResult] = await Promise.all([
      getSb().from("evaluation_statuses").select("*").order("display_order"),
      getSb().from("evaluation_message_templates").select("*").order("section_type").order("created_at"),
    ]);
    const error = statusResult.error || templateResult.error;
    if (error) {
      if (list) list.innerHTML = `<div style="padding:28px;text-align:center;color:var(--red)">Chưa tải được thư viện mẫu: ${esc(error.message)}</div>`;
      return;
    }
    statuses = statusResult.data || [];
    templates = templateResult.data || [];
    renderFilters();
    renderList();
  };

  window.filterEvaluationTemplates = renderList;
  window.changeEvaluationTemplateSection = syncStatusVisibility;
  window.addEvaluationTemplate = async function () {
    const section = document.getElementById("evaluationTemplateSection").value;
    const statusId = document.getElementById("evaluationTemplateStatus").value || null;
    const contentEl = document.getElementById("evaluationTemplateContent");
    const content = contentEl.value.trim();
    if (!content) return alert("Hãy nhập nội dung mẫu.");
    if (section === "status" && !statusId) return alert("Hãy chọn trạng thái.");
    const { error } = await getSb().from("evaluation_message_templates").insert({
      section_type: section, status_id: section === "status" ? statusId : null,
      content, active: true, weight: 1,
    });
    if (error) return alert(`Chưa thêm được mẫu: ${error.message}`);
    contentEl.value = "";
    await window.loadEvaluationTemplatesAdmin();
    window.toast?.("Đã thêm mẫu nhận xét.");
  };
  window.updateEvaluationTemplate = async function (id) {
    const content = document.getElementById(`evaluation-template-${id}`)?.value.trim();
    if (!content) return alert("Nội dung mẫu không được để trống.");
    const { error } = await getSb().from("evaluation_message_templates").update({ content }).eq("id", id);
    if (error) return alert(`Chưa lưu được: ${error.message}`);
    const item = templates.find(row => row.id === id);
    if (item) item.content = content;
    window.toast?.("Đã lưu nội dung mẫu.");
  };
  window.toggleEvaluationTemplate = async function (id, active) {
    const { error } = await getSb().from("evaluation_message_templates").update({ active }).eq("id", id);
    if (error) return alert(`Chưa cập nhật được: ${error.message}`);
    const item = templates.find(row => row.id === id);
    if (item) item.active = active;
    renderList();
  };

  function parseDefaultTemplateFile(source) {
    const lines = String(source || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    const headings = new Set([
      ...defaultStatusDefinitions.map(([name]) => name),
      cleanClosingHeading,
      attentionClosingHeading,
    ]);
    const readFive = heading => {
      const start = lines.findIndex(line => line.trim() === heading);
      if (start < 0) throw new Error(`Không tìm thấy mục “${heading}”.`);
      const items = [];
      for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (headings.has(line)) break;
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match) items.push(match[1].trim());
      }
      if (items.length !== 5) throw new Error(`Mục “${heading}” phải có đúng 5 mẫu.`);
      return items;
    };
    const library = [];
    defaultStatusDefinitions.forEach(([heading, code]) => {
      readFive(heading).forEach(content => library.push({ section_type: "status", code, content }));
    });
    readFive(cleanClosingHeading).forEach(content => library.push({ section_type: "opening", code: null, content }));
    readFive(attentionClosingHeading).forEach(content => library.push({ section_type: "closing", code: null, content }));
    return library;
  }

  window.syncDefaultEvaluationTemplates = async function () {
    if (!confirm("Thay thế toàn bộ trạng thái và mẫu nhận xét bằng nội dung trong file mặc định?")) return;
    const button = document.getElementById("syncDefaultEvaluationTemplatesBtn");
    if (button) { button.disabled = true; button.textContent = "Đang đồng bộ..."; }
    try {
      const response = await fetch("Mau_tin_nhan_nhan_xet_buoi_hoc_gui_phu_huynh.txt", { cache: "no-store" });
      if (!response.ok) throw new Error("Không tải được file mẫu mặc định.");
      const library = parseDefaultTemplateFile(await response.text());
      const client = getSb();
      const statusPayload = defaultStatusDefinitions.map(([name, code, category], index) => ({
        name, code, category, display_order: index + 1, active: true,
      }));
      const deactivateStatuses = await client.from("evaluation_statuses").update({ active: false }).eq("active", true);
      if (deactivateStatuses.error) throw deactivateStatuses.error;
      const upsertStatuses = await client.from("evaluation_statuses").upsert(statusPayload, { onConflict: "code" });
      if (upsertStatuses.error) throw upsertStatuses.error;
      const statusResult = await client.from("evaluation_statuses").select("id,code").in("code", defaultStatusDefinitions.map(([, code]) => code));
      if (statusResult.error) throw statusResult.error;
      const statusIds = new Map((statusResult.data || []).map(item => [item.code, item.id]));
      if (statusIds.size !== defaultStatusDefinitions.length) throw new Error("Chưa tạo đủ trạng thái nhận xét.");

      const desired = library.map(item => ({
        section_type: item.section_type,
        status_id: item.code ? statusIds.get(item.code) : null,
        content: item.content,
        active: true,
        weight: 1,
      }));
      const deleteResult = await client.from("evaluation_message_templates").delete().not("id", "is", null);
      if (deleteResult.error) throw deleteResult.error;
      const insertResult = await client.from("evaluation_message_templates").insert(desired);
      if (insertResult.error) throw insertResult.error;
      await window.loadEvaluationTemplatesAdmin();
      window.toast?.(`Đã đồng bộ ${defaultStatusDefinitions.length} trạng thái và ${library.length} mẫu nhận xét.`);
    } catch (error) {
      alert(`Chưa đồng bộ được thư viện: ${error.message}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Đồng bộ mẫu mặc định"; }
    }
  };
})();
