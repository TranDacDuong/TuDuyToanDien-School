(function () {

  const TYPE_LABEL = {
    multi_choice: "Trắc nghiệm nhiều lựa chọn",
    true_false:   "Đúng/Sai",
    short_answer: "Trả lời ngắn",
    essay:        "Tự luận",
  };

  /* ── Fetch ảnh từ URL → base64 ── */
  async function imgToBase64(url) {
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  /* ── Gọi Claude qua Supabase Edge Function (tránh CORS) ── */
  async function callClaude(messages) {
    // URL và key hardcode từ supabaseClient.js
    const EDGE_URL = "https://lgydjaaqfxqzgbdpqvkp.supabase.co/functions/v1/ai-solution";
    const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxneWRqYWFxZnhxemdiZHBxdmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY2NDQsImV4cCI6MjA4Nzc2MjY0NH0.l6ojk0fH5wYMK4H_RIGTepatUd1Uy2KHOTiRfAS1JD4";

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey":        ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Lỗi Edge Function");
    return data.content.map(c => c.text || "").join("");
  }

  /* ── Build prompt từ câu hỏi ── */
  async function buildMessages(q, studentAnswer, correctAnswer) {
    const typeStr = TYPE_LABEL[q.question_type] || q.question_type;

    const textParts = [];

    // Phần mô tả câu hỏi
    let prompt = `Bạn là giáo viên giỏi. Hãy giải thích chi tiết từng bước cho câu hỏi sau:\n\n`;
    prompt += `Loại câu: ${typeStr}\n`;
    if (q.question_text) prompt += `Đề bài: ${q.question_text}\n`;
    if (correctAnswer)   prompt += `Đáp án đúng: ${correctAnswer}\n`;
    if (studentAnswer)   prompt += `Học sinh trả lời: ${studentAnswer}\n\n`;

    prompt += `Yêu cầu: Trình bày lời giải ngắn gọn, súc tích. Chỉ nêu các bước chính, không giải thích dài dòng. Trả lời bằng tiếng Việt.`;

    const contentParts = [];

    // Thêm ảnh nếu có
    if (q.question_img) {
      const b64 = await imgToBase64(q.question_img);
      if (b64) {
        // Detect media type
        let mediaType = "image/jpeg";
        if (q.question_img.includes(".png"))  mediaType = "image/png";
        if (q.question_img.includes(".webp")) mediaType = "image/webp";
        if (q.question_img.includes(".gif"))  mediaType = "image/gif";

        contentParts.push({
          type:   "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        });
      }
    }

    contentParts.push({ type: "text", text: prompt });

    return [{ role: "user", content: contentParts }];
  }

  /* ── Render markdown + trigger MathJax ── */
  function renderMd(text) {
    // Bảo vệ các block toán trước khi escape HTML
    const mathBlocks = [];
    let protected_text = text
      // Display math $$...$$ và \[...\]
      .replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g, (m) => {
        mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`;
      })
      // Inline math $...$ và \(...\)
      .replace(/(\$[^\$\n]+?\$|\\\([^\)]+?\\\))/g, (m) => {
        mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`;
      });

    // Escape HTML (trừ các block toán đã bảo vệ)
    protected_text = protected_text
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    // Markdown cơ bản
    protected_text = protected_text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code style='background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:.9em'>$1</code>")
      .replace(/^#{2,3}\s+(.+)$/gm, "<div style='font-weight:700;margin:8px 0 4px;color:var(--navy)'>$1</div>")
      .replace(/^\d+\.\s+(.+)$/gm,  "<div style='margin:3px 0 3px 12px'>$1</div>")
      .replace(/^[-•]\s+(.+)$/gm,   "<div style='margin:3px 0 3px 12px'>• $1</div>")
      .replace(/\n{2,}/g,"<br><br>").replace(/\n/g,"<br>");

    // Khôi phục các block toán
    mathBlocks.forEach((m, i) => {
      protected_text = protected_text.replace(`%%MATH${i}%%`, m);
    });

    return protected_text;
  }

  function triggerMathJax(el) {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    } else if (window.MathJax?.Hub) {
      window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, el]);
    }
  }

  /* ══════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════ */

  /**
   * Thêm nút "🤖 Lời giải" vào container
   * @param {HTMLElement} container  - element để append nút vào
   * @param {Object}      q          - question object {id, question_text, question_img, question_type, answer}
   * @param {string}      studentAns - đáp án học sinh đã chọn
   */
  window.aiAddSolutionBtn = function(container, q, studentAns) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:4px;padding:0 14px 12px";

    const btn = document.createElement("button");
    btn.className = "btn btn-outline btn-sm";
    btn.style.cssText = "font-size:.78rem;gap:5px;display:inline-flex;align-items:center";
    btn.innerHTML = "🤖 Xem lời giải AI";

    const resultBox = document.createElement("div");
    resultBox.style.cssText = "display:none;margin-top:10px;padding:12px 14px;"+
      "background:linear-gradient(135deg,#f0f4ff,#f8f0ff);"+
      "border:1px solid #c4b5fd;border-radius:10px;font-size:.84rem;line-height:1.7;color:var(--navy)";

    btn.onclick = async () => {
      if (resultBox.style.display !== "none") {
        resultBox.style.display = "none";
        btn.innerHTML = "🤖 Xem lời giải AI";
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite">⟳</span> Đang phân tích...`;

      // Add spin animation if not already added
      if (!document.getElementById("ai-spin-style")) {
        const style = document.createElement("style");
        style.id = "ai-spin-style";
        style.textContent = "@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}";
        document.head.appendChild(style);
      }

      try {
        const messages = await buildMessages(q, studentAns, q.answer);
        const reply    = await callClaude(messages);
        resultBox.innerHTML =
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-weight:700;color:#7c3aed;font-size:.82rem">'+
          '🤖 Lời giải từ AI</div>' + renderMd(reply);
        resultBox.style.display = "block";
        triggerMathJax(resultBox);
        btn.innerHTML = "✕ Đóng lời giải";
      } catch (err) {
        resultBox.innerHTML = '<div style="color:var(--red)">Lỗi: ' + err.message + '</div>';
        resultBox.style.display = "block";
        btn.innerHTML = "🤖 Thử lại";
      }

      btn.disabled = false;
    };

    wrap.appendChild(btn);
    wrap.appendChild(resultBox);
    container.appendChild(wrap);
  };

})();
