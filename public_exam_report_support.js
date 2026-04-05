(function () {
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAnalyticsPanels({
    analytics,
    totalPoints,
    peId,
    essayReviewQueue,
  }) {
    const avgScoreText = analytics?.averageScore === null ? "—" : `${analytics.averageScore}/${totalPoints}`;
    const progressRows = (analytics?.studentProgress || []).slice(0, 5);
    const hardQuestions = analytics?.hardestQuestions || [];

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
        <div style="background:var(--white);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:.75rem;color:var(--ink-light);text-transform:uppercase;font-weight:800">Điểm trung bình</div>
          <div style="margin-top:8px;font-size:1.45rem;font-weight:800;color:var(--navy)">${avgScoreText}</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:.75rem;color:var(--ink-light);text-transform:uppercase;font-weight:800">Độ khó đề</div>
          <div style="margin-top:8px;font-size:1.45rem;font-weight:800;color:${analytics?.difficulty?.tone || "var(--ink-light)"}">${analytics?.difficulty?.label || "—"}</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:.75rem;color:var(--ink-light);text-transform:uppercase;font-weight:800">Tự luận chờ chấm</div>
          <div style="margin-top:8px;font-size:1.45rem;font-weight:800;color:var(--amber)">${analytics?.pendingEssayCount || 0}</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:.75rem;color:var(--ink-light);text-transform:uppercase;font-weight:800">Bài đã nộp</div>
          <div style="margin-top:8px;font-size:1.45rem;font-weight:800;color:var(--navy)">${analytics?.submittedCount || 0}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:18px">
        <div style="background:var(--white);border:1px solid var(--border);border-radius:18px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
            <strong style="color:var(--navy)">Chấm tự luận hàng loạt</strong>
            <span style="font-size:.76rem;color:var(--ink-light)">${essayReviewQueue.length} bài chờ</span>
          </div>
          ${essayReviewQueue.length
            ? `<div style="display:grid;gap:8px">${essayReviewQueue.slice(0, 6).map((item, index) => `
                <button class="btn btn-outline btn-sm" style="justify-content:flex-start;text-align:left" onclick="openExamDetailAdmin('${esc(item.resultId)}','${esc(item.studentName)}','${esc(peId)}',${totalPoints},${index})">
                  ${index + 1}. ${esc(item.studentName)}
                </button>`).join("")}</div>`
            : `<div style="font-size:.82rem;color:var(--ink-mid);line-height:1.6">Hiện không còn bài tự luận nào đang chờ chấm.</div>`}
        </div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:18px;padding:16px">
          <strong style="color:var(--navy)">Câu hay sai nhất</strong>
          <div style="display:grid;gap:8px;margin-top:10px">
            ${hardQuestions.length
              ? hardQuestions.map((item) => `<div style="padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px">
                  <div style="font-size:.78rem;font-weight:800;color:#9a3412">Câu ${item.index} • đúng ${Math.round(item.correctRate * 100)}%</div>
                  <div style="font-size:.82rem;color:var(--ink-mid);margin-top:4px;line-height:1.55">${esc(item.stem || "Nội dung câu hỏi")}</div>
                </div>`).join("")
              : `<div style="font-size:.82rem;color:var(--ink-mid)">Chưa đủ dữ liệu để xếp hạng câu hỏi.</div>`}
          </div>
        </div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:18px;padding:16px">
          <strong style="color:var(--navy)">Tiến độ học sinh cần chú ý</strong>
          <div style="display:grid;gap:8px;margin-top:10px">
            ${progressRows.length
              ? progressRows.map((item) => `<div style="padding:10px 12px;background:#f8fafc;border:1px solid var(--border);border-radius:14px">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                    <div>
                      <div style="font-size:.84rem;font-weight:800;color:var(--navy)">${esc(item.name)}</div>
                      <div style="font-size:.76rem;color:var(--ink-light)">${esc(item.className || "Chưa gắn lớp")}${item.submittedAt ? ` • ${esc(item.submittedAt)}` : ""}</div>
                    </div>
                    <div style="font-size:.95rem;font-weight:800;color:${item.ratio < 0.5 ? "var(--red)" : "var(--amber)"}">${item.score}/${totalPoints}</div>
                  </div>
                </div>`).join("")
              : `<div style="font-size:.82rem;color:var(--ink-mid)">Chưa có dữ liệu tiến độ học sinh.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  window.PublicExamReportSupport = {
    renderAnalyticsPanels,
  };
})();
