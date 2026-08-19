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
    auto_normal: "Mẫu tự động (Học sinh bình thường)",
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

  window.sync31AutoNormalTemplates = async function () {
    if (!confirm("Bổ sung 31 mẫu đánh giá tự động vào cơ sở dữ liệu Supabase?")) return;
    const button = document.getElementById("seed31AutoTemplatesBtn");
    if (button) { button.disabled = true; button.textContent = "Đang nạp mẫu..."; }
    try {
      const client = getSb();
      const templates31 = [
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} học tập rất ngoan, chú ý nghe giảng và theo kịp bài giảng của thầy cô. Con hoàn thành tốt các bài tập trên lớp theo đúng tiến độ.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô gửi nhận xét buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} tiếp thu bài ổn định, tự giác làm bài tập và nắm chắc các kiến thức trọng tâm trong buổi học hôm nay.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} có thái độ học tập nghiêm túc, tập trung lắng nghe hướng dẫn và ghi chép bài đầy đủ.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} theo sát bài học, hiểu bài tốt và thực hành các dạng bài tập cẩn thận.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} duy trì phong độ học tập tốt, hoàn thành đầy đủ các bài tập được giao trên lớp và hiểu rõ kiến thức mới.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô gửi thông tin buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} học tập chăm chỉ, hợp tác tốt với thầy cô và các bạn trong lớp, nắm vững nội dung bài học.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} chủ động làm bài, theo kịp tiến độ bài giảng của lớp và hoàn thành bài tập đạt yêu cầu.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra rất thuận lợi. Con nắm vững các lý thuyết và dạng bài cơ bản của buổi học.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tập trung cao độ, chịu khó tư duy và hoàn thành tốt phần luyện tập tại lớp.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô ghi nhận em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} có ý thức học tập tốt, tiếp thu bài đều đặn và thao tác làm bài ngày càng vững vàng.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} lắng nghe giảng bài chu đáo, khi gặp dạng bài mới con chủ động theo dõi ví dụ mẫu và vận dụng làm bài rất ổn định.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} học tập nghiêm túc, làm bài tập thực hành đạt kết quả tốt và hiểu rõ phương pháp giải.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} có thái độ tích cực, tập trung làm bài và nắm trọn vẹn các ý chính của bài học.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô đánh giá em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} giữ nhịp độ học tập ổn định, nghe giảng tốt và áp dụng kiến thức vào bài tập thành thạo.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} ghi chép bài cẩn thận, làm đủ các bài tập tự luyện và tiếp thu nội dung bài mới rất tự nhiên.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra tích cực. Con tiếp thu kiến thức nhanh, hoàn thành bài tập nhẹ nhàng và chính xác.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} chấp hành tốt nội quy lớp học, tập trung nghe thầy cô chữa bài và nắm chắc các bước giải.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô ghi nhận em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} học tập cẩn thận, luôn kiên nhẫn hoàn thành đầy đủ các câu hỏi trong phiếu bài tập.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tiếp thu bài đều đặn, tích cực lắng nghe bài giảng và thực hành đúng yêu cầu của giáo viên.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} nắm chắc phương pháp bài học, trình bày cẩn thận và hoàn thành bài tập đúng thời gian.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô phản hồi buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} tự tin làm bài, đạt đầy đủ các mục tiêu kiến thức của buổi học hôm nay.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tập trung chú ý, duy trì thói quen làm bài cẩn thận và tiếp thu kiến thức khá tốt.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra ổn định. Con chăm chú nghe giảng và giải các bài tập luyện tập tại lớp suôn sẻ.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} theo sát mạch bài giảng, nắm được các quy tắc/công thức chính và vận dụng vào bài tập chuẩn xác.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô gửi nhận xét em {ten_hoc_sinh} buổi học môn {mon_hoc} ngày {ngay_hoc}: Con đi học đúng giờ, tập trung trong suốt giờ học và hoàn thành tốt phần luyện tập tại lớp.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tiếp thu tốt nội dung cốt lõi của bài học, thái độ học tập ngoan và rất hợp tác.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} theo dõi kỹ phần giáo viên chữa bài, chữa lại các lỗi sai nhỏ và nắm chắc kiến thức.",
        "Kính gửi anh/chị {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tiếp tục duy trì phong độ học tập đều đặn, nghe giảng chú ý và làm bài tập đầy đủ.",
        "Kính gửi anh/chị {ten_phu_huynh}, thầy/cô đánh giá em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tiếp thu lý thuyết nhanh và vận dụng giải các câu hỏi trên lớp mượt mà.",
        "Kính gửi anh/chị {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} học tập tích cực, tập trung làm xong các phiếu bài tập và có tinh thần tự giác cao.",
        "Kính gửi anh/chị {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra trọn vẹn và hiệu quả. Con nắm vững toàn bộ kiến thức trọng tâm của buổi học."
      ];

      const payload = templates31.map(content => ({
        section_type: "auto_normal",
        status_id: null,
        content: content,
        weight: 1,
        active: true,
      }));

      const { error } = await client.from("evaluation_message_templates").insert(payload);
      if (error) throw error;

      await window.loadEvaluationTemplatesAdmin();
      window.toast?.("Đã nạp 31 mẫu tự động thành công!");
    } catch (error) {
      alert(`Lỗi nạp mẫu: ${error.message}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Nạp 31 mẫu tự động"; }
    }
  };
})();
