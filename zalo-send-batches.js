(() => {
  const labels = { tuition: 'Học phí', score: 'Báo điểm', evaluation: 'Nhận xét', absence: 'Báo vắng', receipt: 'Xác nhận thanh toán', campaign: 'Tin theo lịch', other: 'Tin khác' };
  const states = { pending: 'Chờ gửi', queued: 'Chờ gửi', processing: 'Đang gửi', sent: 'Đã gửi', failed: 'Gửi lỗi', uncertain: 'Chưa xác nhận', cancelled: 'Đã bỏ qua', not_queued: 'Chưa xếp hàng', not_found: 'Chờ tìm Zalo', not_friend: 'Chờ kết nối', invited: 'Đã mời kết bạn', greeted: 'Chờ gửi' };
  const actions = { pause: 'Tạm dừng', resume: 'Tiếp tục', skip: 'Bỏ qua', retry: 'Gửi lại' };
  const waiting = new Set(['pending', 'queued', 'not_found', 'not_friend', 'invited', 'greeted']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
  let sb, dialog, batch, batchOffset = 0, itemOffset = 0, revision = 0, busy = false;
  let rows = [], items = [], timer;

  function button(label, command, value = '') {
    return `<button type="button" data-command="${command}" data-value="${escape(value)}">${escape(label)}</button>`;
  }

  function pager(offset, limit, count) {
    return `<div class="zalo-dispatch-controls zalo-batch-pager">${offset ? button('Trang trước', 'page', -limit) : ''}${count === limit ? button('Trang sau', 'page', limit) : ''}</div>`;
  }

  function makeDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'zalo-dispatch-dialog zalo-batches';
    dialog.setAttribute('aria-labelledby', 'zaloBatchesTitle');
    dialog.innerHTML = `<header><h2 id="zaloBatchesTitle">Đợt gửi Zalo</h2>${button('Đóng', 'close')}</header>
      <div class="zalo-dispatch-controls">
        <label>Loại tin <select data-filter="category"><option value="">Tất cả</option>${Object.entries(labels).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <label>Trạng thái <select data-filter="state"><option value="">Tất cả</option><option value="active">Còn việc chờ</option><option value="errors">Có lỗi</option></select></label>
        ${button('Tải lại', 'refresh')}${button('Kiểm tra hàng đợi ngay', 'wake')}
      </div>
      <div class="zalo-dispatch-controls" data-global></div>
      <div class="zalo-batch-status" role="status"></div>
      <div class="zalo-dispatch-table-wrap" data-content></div>`;
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('change', event => {
      if (!event.target.dataset.filter) return;
      batch = null;
      batchOffset = 0;
      load();
    });
    dialog.addEventListener('close', () => { revision++; clearInterval(timer); });
    document.body.appendChild(dialog);
  }

  const status = message => { dialog.querySelector('[role=status]').textContent = message; };

  function batchList() {
    if (!rows.length) return '<p>Không có đợt gửi phù hợp.</p>';
    return `<table><thead><tr><th>Đợt gửi</th><th>Phụ huynh</th><th>Tiến độ</th><th></th></tr></thead><tbody>${rows.map(row => `
      <tr><td><strong>${escape(row.title)}</strong><br>${escape(labels[row.category])} · ${escape(date(row.started))}</td>
      <td>${row.recipients}</td><td><strong>${row.sent}/${row.total} đã gửi</strong><br>${row.waiting} chờ · ${row.processing} đang gửi · ${row.errors} lỗi · ${row.skipped} bỏ qua${row.paused ? ` · ${row.paused} tạm dừng` : ''}</td>
      <td>${button('Xem đợt', 'open', row.batch_key)}</td></tr>`).join('')}</tbody></table>${pager(batchOffset,40,rows.length)}`;
  }

  function itemActions(item) {
    const out = [];
    if (waiting.has(item.status) || (['web', 'notice'].includes(item.queue) && ['failed', 'uncertain'].includes(item.status))) out.push(button('Bỏ qua', 'skip', item.id));
    if (item.queue === 'evaluation_missing' || (item.status === 'failed' && (item.queue !== 'tuition' || item.completed_parts === 0)) || (item.queue === 'notice' && item.status === 'uncertain' && !item.awaiting_second_scan)) out.push(button('Gửi lại', 'retry', item.id));
    if (item.queue === 'tuition' && item.status === 'sent' && item.completed_parts < item.total_parts && item.error_message) out.push(button('Gửi bù QR', 'repairQr', item.id));
    if (item.parent_id) out.push(button('Mở hội thoại', 'thread', item.parent_id));
    return out.join(' ');
  }

  function partStatus(item) {
    if (item.category === 'score' && item.total_parts != null) {
      return `<br>Tin chữ: ${item.completed_parts > 0 ? 'Đã xác nhận' : 'Chưa xác nhận'}${item.total_parts > 1 ? `<br>Ảnh: ${Math.max(0, item.completed_parts - 1)}/${item.total_parts - 1} đã xác nhận` : ''}`;
    }
    if (item.total_parts != null) return `<br>${item.completed_parts}/${item.total_parts} phần được xác nhận`;
    return item.category === 'score' && item.status === 'sent' ? '<br>Chưa có xác nhận từng phần' : '';
  }

  function batchDetails() {
    const title = items[0]?.title || rows.find(row => row.batch_key === batch)?.title || 'Chi tiết đợt gửi';
    const canPause = ['web','notice','tuition','campaign','session_evaluation','offline_test_score','session_score','exam_score','absence'].includes(batch.split(':')[0]);
    const controls = `<div class="zalo-dispatch-controls">${button('← Tất cả đợt', 'back')}
      ${canPause ? button('Tạm dừng đợt', 'pause') + button('Tiếp tục đợt', 'resume') : ''}
      ${button('Bỏ qua lượt đang chờ', 'skip')}${button('Gửi lại lượt lỗi', 'retry')}</div>`;
    return `<h3>${escape(title)}</h3>${controls}${items.length ? `<table><thead><tr><th>Người nhận</th><th>Trạng thái</th><th>Chi tiết</th><th>Thao tác</th></tr></thead><tbody>${items.map(item => `
      <tr><td><strong>${escape(item.parent_name || 'Chưa có tên Zalo')}</strong><br>${escape(item.student_name || '')}<br>${escape(date(item.updated_at))}</td>
      <td>${escape(item.paused && (waiting.has(item.status) || item.awaiting_second_scan) ? 'Tạm dừng' : item.awaiting_second_scan ? 'Chờ quét lượt 2' : states[item.status] || item.status)}
      ${partStatus(item)}</td>
      <td>${item.error_message ? `<div class="zalo-batch-error">${escape(item.error_message)}</div>` : ''}${item.body ? `<details><summary>Xem nội dung</summary><div class="zalo-batch-body">${escape(item.body)}</div></details>` : ''}</td>
      <td>${itemActions(item)}</td></tr>`).join('')}</tbody></table>` : '<p>Không tìm thấy lượt gửi trong đợt này.</p>'}${pager(itemOffset,100,items.length)}`;
  }

  async function load() {
    const request = ++revision;
    const content = dialog.querySelector('[data-content]');
    const selectedBatch = batch;
    const category = dialog.querySelector('[data-filter=category]').value || null;
    const state = dialog.querySelector('[data-filter=state]').value || null;
    content.setAttribute('aria-busy', 'true');
    const [result, dispatch, automatic] = await Promise.all([selectedBatch
      ? sb.rpc('list_zalo_send_batch_items', { p_batch: selectedBatch, p_offset: itemOffset })
      : sb.rpc('list_zalo_send_batches', { p_category: category, p_state: state, p_offset: batchOffset }),
      sb.rpc('get_mindup_zalo_dispatch_status'),
      sb.rpc('control_automatic_tuition', { p_action: 'status' })
    ]);
    if (request !== revision || !dialog.open) return;
    content.removeAttribute('aria-busy');
    dialog.querySelector('[data-global]').innerHTML = [
      dispatch.data ? button(dispatch.data.paused ? 'Tiếp tục hàng gửi chung' : 'Tạm dừng hàng gửi chung', 'global', dispatch.data.paused ? 'resume' : 'pause') : '',
      dispatch.data?.paused && dispatch.data.reason ? `<span>${escape(dispatch.data.reason)}</span>` : '',
      automatic.data ? button(automatic.data.paused ? 'Bật nhắc học phí tự động' : 'Dừng nhắc học phí tự động', 'automatic', automatic.data.paused ? 'resume' : 'pause') : ''
    ].join('');
    if (result.error) { content.textContent = 'Không tải được đợt gửi. ' + result.error.message; return; }
    if (selectedBatch) { items = result.data || []; content.innerHTML = batchDetails(); }
    else { rows = result.data || []; content.innerHTML = batchList(); }
  }

  async function onClick(event) {
    const target = event.target.closest('button[data-command]');
    if (!target || busy) return;
    const command = target.dataset.command;
    const value = target.dataset.value;
    if (command === 'close') return dialog.close();
    if (command === 'open') { batch = value; itemOffset = 0; return load(); }
    if (command === 'back') { batch = null; return load(); }
    if (command === 'refresh') return load();
    if (command === 'page') {
      if (batch) itemOffset += Number(value);
      else batchOffset += Number(value);
      return load();
    }
    if (command === 'thread') { location.href = `messages.html?user=${encodeURIComponent(value)}`; return; }
    const item = value && items.find(row => row.id === value);
    const ambiguous = command === 'retry' && item?.status === 'uncertain';
    if (ambiguous && !confirm('Bạn đã kiểm tra hội thoại Zalo và xác nhận phần này chưa được gửi?')) return;
    if (command === 'repairQr' && !confirm('Bạn đã kiểm tra hội thoại và xác nhận phụ huynh chưa nhận ảnh QR?')) return;
    if (command === 'skip' && !confirm(value ? 'Bỏ qua lượt gửi này?' : 'Bỏ qua các lượt chưa gửi trong đợt?')) return;
    if (command === 'retry' && !value && !confirm('Xếp lại những lượt xác định gửi lỗi trong đợt?')) return;
    busy = true;
    target.disabled = true;
    try {
      if (command === 'wake') {
        const response = await fetch('http://127.0.0.1:3456/api/check-work', { method: 'POST', signal: AbortSignal.timeout(8000) });
        const result = await response.json();
        if (!response.ok || !result.accepted) throw new Error(result.error || 'Bot chưa nhận tín hiệu.');
        status('Bot đã nhận tín hiệu kiểm tra.');
      } else if (command === 'repairQr') {
        const { data, error } = await sb.rpc('request_tuition_qr_repair', { p_job_id: value });
        if (error) throw error;
        status(data ? 'Đã xếp hàng gửi bù QR.' : 'QR đã gửi hoặc học phí đã thay đổi.');
      } else if (command === 'global' || command === 'automatic') {
        const { error } = await (command === 'global'
          ? sb.rpc('set_mindup_zalo_dispatch_paused', { p_paused: value === 'pause' })
          : sb.rpc('control_automatic_tuition', { p_action: value }));
        if (error) throw error;
        status('Đã cập nhật trạng thái.');
      } else {
        const { data, error } = await sb.rpc('control_zalo_send_batch', { p_batch: batch, p_action: command, p_job: value || null, p_checked: !!ambiguous });
        if (error) throw error;
        status(data ? `${actions[command]}: đã cập nhật ${data} lượt.` : 'Không có lượt đủ điều kiện cho thao tác này.');
      }
      await load();
    } catch (error) { status(error.message || 'Không thực hiện được thao tác.'); }
    finally { busy = false; target.disabled = false; }
  }

  window.ZaloSendBatches = {
    async configure(client, profile) {
      if (!profile || ['parent', 'student'].includes(profile.role)) return;
      if (profile.role !== 'admin') {
        const { data, error } = await client.rpc('can_manage_zalo_send_batches');
        if (error || data !== true) return;
      }
      sb = client;
      document.getElementById('zaloBatchesEntry').hidden = false;
      const params = new URLSearchParams(location.search);
      if (params.get('zaloBatches') === '1') this.open(params.get('batch'), params.get('category'));
    },
    open(batchKey, category) {
      if (!sb) return;
      if (!dialog) makeDialog();
      batch = batchKey || null;
      batchOffset = itemOffset = 0;
      if (category && labels[category]) dialog.querySelector('[data-filter=category]').value = category;
      status('');
      if (!dialog.open) dialog.showModal();
      clearInterval(timer);
      timer = setInterval(() => {
        if (dialog.open && !busy && !document.hidden && !dialog.querySelector('details[open]') && !dialog.querySelector('[data-content]').contains(document.activeElement)) load();
      }, 15000);
      load();
    }
  };
})();
