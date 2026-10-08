(function (root) {
  function apply(rows, rules) {
    return rows.map(row => {
      const grossAmount = Number(row.grossAmount ?? row.amount);
      const rule = rules.find(item => item.student_id === row.studentId && !item.cancelled
        && item.starts_month.slice(0, 7) <= row.ym && (!item.ends_month || item.ends_month.slice(0, 7) >= row.ym)
        && (!item.class_ids || item.class_ids.includes(row.classId)));
      const discountPercent = Number(row.frozenPercent ?? rule?.percent ?? 0);
      const discountAmount = Math.round(grossAmount * discountPercent / 100);
      return { ...row, grossAmount, discountAmount, discountPercent, amount: grossAmount - discountAmount,
        noteCalc: (row.noteCalc || '') + (discountAmount ? ` • Giảm ${discountPercent}%: -${discountAmount.toLocaleString('vi-VN')}đ` : '') };
    });
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { apply }; return; }
  let rules = [], catalog = null, editing = null, busy = false, manager = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const currentMonth = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
  };
  function dialog() { return document.getElementById('tuitionDiscountDialog'); }
  function showError(error) { document.getElementById('discountError').textContent = error.message || String(error); }
  async function rpc(name, args) {
    const { data, error } = await root.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }
  async function open() {
    if (!manager) return;
    if (!dialog()) {
      const element = document.createElement('dialog');
      element.id = 'tuitionDiscountDialog';
      element.innerHTML = `<div class="discount-header"><h3>Miễn/Giảm học phí</h3><button type="button" id="discountClose" aria-label="Đóng">×</button></div>
        <p id="discountError" role="alert"></p><div class="discount-layout"><section><h4>Danh sách miễn/giảm</h4>
        <input id="discountListSearch" type="search" placeholder="Tìm học sinh hoặc SĐT"><div id="discountList"></div></section>
        <form id="discountForm"><h4 id="discountFormTitle">Thêm miễn/giảm</h4><label>Tìm học sinh<input id="discountStudentSearch" type="search" placeholder="Tên hoặc SĐT"></label>
        <label>Học sinh<select id="discountStudent" size="5" required></select></label>
        <label>Tỷ lệ miễn/giảm (%)<input id="discountPercent" type="number" min="0.01" max="100" step="0.01" required></label>
        <label>Từ tháng<input id="discountStart" type="month" required></label>
        <label>Đến tháng<input id="discountEnd" type="month"></label>
        <label>Phạm vi<select id="discountScope"><option value="all">Tất cả lớp</option><option value="classes">Chọn lớp</option></select></label>
        <fieldset id="discountClassesLabel" hidden><legend>Lớp áp dụng</legend><div id="discountClasses"></div></fieldset>
        <label>Lý do<input id="discountReason" maxlength="1000"></label>
        <div class="discount-actions"><button type="submit" id="discountSave">Lưu</button><button type="button" id="discountNew">Thêm mới</button></div></form></div>`;
      document.body.appendChild(element);
      document.getElementById('discountClose').onclick = () => { if (!busy) element.close(); };
      element.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      document.getElementById('discountListSearch').oninput = renderList;
      document.getElementById('discountStudentSearch').oninput = renderStudents;
      document.getElementById('discountScope').onchange = () => {
        document.getElementById('discountClassesLabel').hidden = document.getElementById('discountScope').value !== 'classes';
      };
      document.getElementById('discountNew').onclick = () => edit(null);
      document.getElementById('discountForm').onsubmit = event => { event.preventDefault(); save(); };
      document.getElementById('discountList').onclick = event => {
        const button = event.target.closest('button[data-id]');
        if (!button || busy) return;
        const item = catalog.rules.find(rule => rule.id === button.dataset.id);
        if (button.dataset.action === 'stop') stop(item); else edit(item);
      };
    }
    if (!dialog().open) dialog().showModal();
    document.getElementById('discountError').textContent = '';
    document.getElementById('discountSave').disabled = true;
    try {
      catalog = await rpc('tuition_discount_catalog', {});
      document.getElementById('discountClasses').innerHTML = catalog.classes.map(c => `<label class="discount-class-option"><input type="checkbox" value="${esc(c.id)}">${esc(c.name)}</label>`).join('');
      renderList(); edit(null);
      document.getElementById('discountSave').disabled = false;
    } catch (error) { showError(error); }
  }
  function renderStudents() {
    if (!catalog) return;
    const select = document.getElementById('discountStudent');
    const selected = editing?.student_id || select.value;
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const query = normalize(document.getElementById('discountStudentSearch').value.trim());
    const matches = catalog.students.filter(s => (editing && s.id === selected) || normalize(s.name + ' ' + (s.phone || '')).includes(query));
    select.innerHTML = '<option value="" disabled>' + (matches.length ? 'Chọn học sinh' : 'Không tìm thấy học sinh') + '</option>' + matches
      .map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.phone ? ' · ' + esc(s.phone) : ''}</option>`).join('');
    select.value = selected;
  }
  function renderList() {
    if (!catalog) return;
    const query = document.getElementById('discountListSearch').value.trim().toLocaleLowerCase('vi');
    document.getElementById('discountList').innerHTML = catalog.rules.filter(r => {
      const s = catalog.students.find(s => s.id === r.student_id);
      return ((s?.name || '') + ' ' + (s?.phone || '')).toLocaleLowerCase('vi').includes(query);
    }).map(r => {
      const student = catalog.students.find(s => s.id === r.student_id);
      const ended = r.cancelled || (r.ends_month && r.ends_month.slice(0, 7) < currentMonth());
      const scope = r.class_ids ? r.class_ids.map(id => catalog.classes.find(c => c.id === id)?.name || 'Lớp cũ').join(', ') : 'Tất cả lớp';
      return `<article class="discount-item"><strong>${esc(student?.name || 'Học sinh')} · ${esc(r.percent)}%</strong><div>${esc(r.starts_month.slice(0, 7))} → ${esc(r.ends_month?.slice(0, 7) || 'Đến khi ngừng')} · ${ended ? 'Đã kết thúc' : 'Đang áp dụng / đã lên lịch'}</div><div>${esc(scope)}</div><div>${esc(r.reason)}</div>
        ${r.cancelled ? '' : `<button type="button" data-id="${esc(r.id)}" data-action="edit">Sửa</button>${ended ? '' : ` <button type="button" data-id="${esc(r.id)}" data-action="stop">Ngừng áp dụng</button>`}`}</article>`;
    }).join('') || '<p>Chưa có học sinh trong danh sách.</p>';
  }
  function edit(item) {
    if (busy) return;
    editing = item;
    document.getElementById('discountForm').reset();
    document.getElementById('discountFormTitle').textContent = item ? 'Sửa miễn/giảm' : 'Thêm miễn/giảm';
    document.getElementById('discountStart').value = item?.starts_month.slice(0, 7) || currentMonth();
    document.getElementById('discountEnd').value = item?.ends_month?.slice(0, 7) || '';
    document.getElementById('discountPercent').value = item?.percent || '';
    document.getElementById('discountReason').value = item?.reason || '';
    document.getElementById('discountScope').value = item?.class_ids ? 'classes' : 'all';
    document.getElementById('discountClassesLabel').hidden = !item?.class_ids;
    document.querySelectorAll('#discountClasses input').forEach(o => { o.checked = Boolean(item?.class_ids?.includes(o.value)); });
    renderStudents();
    document.getElementById('discountStudent').value = item?.student_id || '';
    document.getElementById('discountStudent').disabled = Boolean(item);
  }
  async function perform(args) {
    if (busy) return;
    busy = true; document.getElementById('discountSave').disabled = true;
    document.getElementById('discountError').textContent = '';
    try {
      if (args.p_action === 'save') await root.prepareTuitionDiscountBasis(args.p_student, args.p_start);
      await rpc('manage_tuition_discount', args);
      await root.loadTuition();
      catalog = await rpc('tuition_discount_catalog', {});
      renderList(); busy = false; edit(null);
    } catch (error) { showError(error); }
    finally { busy = false; document.getElementById('discountSave').disabled = false; }
  }
  function save() {
    const start = document.getElementById('discountStart').value;
    const end = document.getElementById('discountEnd').value;
    const classes = document.getElementById('discountScope').value === 'classes' ? [...document.querySelectorAll('#discountClasses input:checked')].map(o => o.value) : null;
    if ((end && end < start) || (classes && !classes.length)) { showError(new Error('Kiểm tra tháng kết thúc và lớp áp dụng.')); return; }
    perform({ p_id: editing?.id || null, p_action: 'save', p_student: document.getElementById('discountStudent').value,
      p_percent: Number(document.getElementById('discountPercent').value), p_start: start + '-01', p_end: end ? end + '-01' : null,
      p_classes: classes, p_reason: document.getElementById('discountReason').value.trim() });
  }
  function stop(item) {
    if (!confirm('Ngừng miễn/giảm từ tháng hiện tại? Các tháng cũ và tháng đã chốt vẫn giữ nguyên.')) return;
    perform({ p_id: item.id, p_action: 'stop' });
  }
  root.TuitionDiscounts = {
    apply: rows => apply(rows, rules), open,
    async load(role) {
      manager = Boolean(root.AppPermissions?.has?.('tuition.discounts.manage', role === 'admin') || role === 'admin');
      const button = document.getElementById('tuitionDiscountBtn');
      if (button) button.hidden = !manager;
      const { data, error } = await root.sb.from('tuition_discounts').select('*');
      if (error) throw error;
      rules = data || [];
    },
    async persist(ym, groups, fullScope) {
      if (!manager || !fullScope || !groups.length) return [];
      return rpc('save_tuition_discount_basis', { p_month: ym + '-01', p_rows: groups.map(g => ({ student_id: g.studentId,
        components: g.classes.map(c => ({ class_id: c.classId, amount: c.grossAmount ?? c.amount, percent: c.discountPercent || 0 })) })) });
    }
  };
})(typeof window === 'undefined' ? null : window);
