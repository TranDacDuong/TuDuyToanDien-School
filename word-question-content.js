(function (root) {
  const mediaBase = 'https://lgydjaaqfxqzgbdpqvkp.supabase.co/storage/v1/object/public/word-question-media/';
  const pathPattern = /^[0-9a-f-]{36}\/[a-f0-9]{64}\.png$/i;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(text, depth = 0) {
    if (depth > 3) return escape(text);
    let html = '', last = 0;
    const regex = /\[\[(WIMG|WTABLE):([^\]]+)\]\]/g;
    for (const m of String(text || '').matchAll(regex)) {
      html += escape(text.slice(last, m.index)).replace(/\n/g, '<br>');
      let result = '';
      if (m[1] === 'WIMG' && pathPattern.test(m[2])) {
        result = `<img class="word-question-image" loading="lazy" src="${mediaBase}${m[2]}" alt="Hình trong câu hỏi">`;
      } else if (m[1] === 'WTABLE' && m[2].length <= 250000) {
        try {
          const rows = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))));
          if (!Array.isArray(rows) || rows.length > 200 || rows.some(row => !Array.isArray(row) || row.length > 50)) throw new Error('Invalid table');
          result = '<span class="word-question-table-scroll"><table class="word-question-table"><tbody>' + rows.map(row => '<tr>' + row.map(cell => {
            if (typeof cell.text !== 'string' || cell.text.length > 50000) throw new Error('Invalid cell');
            const span = n => Math.max(1, Math.min(200, Number(n) || 1));
            return `<td rowspan="${span(cell.rowspan)}" colspan="${span(cell.colspan)}">${render(cell.text, depth+1)}</td>`;
          }).join('') + '</tr>').join('') + '</tbody></table></span>';
        } catch (_) { result = '<span class="word-question-error">[Bảng cần kiểm tra]</span>'; }
      }
      html += result || escape(m[0]);
      last = m.index + m[0].length;
    }
    return html + escape(String(text || '').slice(last)).replace(/\n/g, '<br>');
  }
  root.WordQuestionContent = { render };
  if (typeof module === 'object' && module.exports) module.exports = { render };
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = '.word-question-image{display:inline-block;max-width:100%;max-height:520px;height:auto;object-fit:contain;vertical-align:middle}.word-question-table-scroll{display:block;max-width:100%;overflow-x:auto;margin:8px 0}.word-question-table{border-collapse:collapse;width:auto!important;min-width:0!important;table-layout:auto!important;color:inherit}.word-question-table td{border:1px solid #cbd5e1;padding:8px;vertical-align:middle;min-width:40px;white-space:normal}.word-question-error{color:#b91c1c}';
  document.head.append(style);
  function enhance(node) {
    if (!node || !node.isConnected) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    if (node.nodeType === Node.TEXT_NODE) texts.push(node);
    else while (walker.nextNode()) texts.push(walker.currentNode);
    const changed = new Set();
    for (const text of texts) {
      if (!/\[\[(?:WIMG|WTABLE):/.test(text.data) || text.parentElement?.closest('textarea,input,script,style,mjx-container')) continue;
      const template = document.createElement('template');
      template.innerHTML = render(text.data);
      const parent = text.parentElement;
      text.replaceWith(template.content);
      if (parent) changed.add(parent);
    }
    if (changed.size && root.MathJax?.typesetPromise) root.MathJax.typesetPromise([...changed]).catch(() => {});
  }
  function init() {
    enhance(document.body);
    const pending = new Set();
    let queued = false;
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') pending.add(record.target);
        else record.addedNodes.forEach(node => pending.add(node));
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; pending.forEach(enhance); pending.clear(); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})(globalThis);
