(function () {
  let statuses = [];
  let templates = [];
  const getSb = () => window.sb;
  const esc = value => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sectionLabel = value => ({
    opening: "Mở đầu", status: "Trạng thái",
    expectation: "Kỳ vọng", closing: "Kết thúc",
  }[value] || value);

  function syncStatusVisibility() {
    const section = document.getElementById("evaluationTemplateSection")?.value;
    const wrap = document.getElementById("evaluationTemplateStatusWrap");
    if (wrap) wrap.style.display = ["status", "expectation"].includes(section) ? "" : "none";
  }

  function renderFilters() {
    [["evaluationTemplateStatus", "-- Chọn trạng thái --"], ["evaluationTemplateStatusFilter", "Tất cả trạng thái"]]
      .forEach(([id, label]) => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = `<option value="">${label}</option>`
          + statuses.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
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
    if (["status", "expectation"].includes(section) && !statusId) return alert("Hãy chọn trạng thái.");
    const { error } = await getSb().from("evaluation_message_templates").insert({
      section_type: section, status_id: ["opening", "closing"].includes(section) ? null : statusId,
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
})();
