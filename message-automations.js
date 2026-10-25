(function () {
  const $ = id => document.getElementById(id);
  const labels = {draft:'Bản nháp',scheduled:'Đã lên lịch',paused:'Tạm dừng',cancelled:'Đã hủy',finished:'Hoàn tất',pending:'Đang chờ',queued:'Đang chờ',processing:'Đang gửi',sent:'Đã gửi',failed:'Gửi lỗi',uncertain:'Chưa xác nhận',skipped:'Đã bỏ qua',expired:'Hết hạn'};
  const systemInfo = {
    tuition:{name:'Nhắc nộp học phí',condition:'Ngày 5, 10, 15 hằng tháng; lịch tránh đầu tháng âm lịch. Gộp công nợ các tháng trước. Không yêu cầu chốt học phí.'},
    tuition_overdue_notice:{condition:'Gửi thủ công sau hạn ngày 15, gồm toàn bộ học phí còn nợ đến tháng hiện tại và QR thanh toán tổng nợ của từng học sinh. Kiểm tra lại công nợ trước khi gửi; bỏ qua tin đang gửi hoặc chưa xác nhận.'},
    tuition_confirmed:{condition:'Khi hệ thống ghi nhận thanh toán học phí.'},
    absent_notification:{condition:'Sau khi buổi học kết thúc, dựa trên điểm danh vắng đã lưu.'},
    session_evaluation_notice:{condition:'Nhận xét buổi học và đánh giá định kỳ theo điều kiện nghiệp vụ. Nội dung chi tiết lấy từ bộ mẫu đánh giá.',pool:true},
    session_score_notice:{condition:'Khi công bố điểm bài tập / đề luyện tập buổi học.'},
    offline_test_score_notice:{condition:'Khi công bố điểm bài kiểm tra trên lớp.'},
    exam_score_notice:{condition:'Khi công bố điểm đề luyện tập sau khi chấm.'},
    parent_greeting:{condition:'Sau khi liên kết Zalo phụ huynh; mỗi liên kết chỉ chào một lần. Để trống nội dung để giữ các mẫu chào của bot.'}
  };
  let consoleData, tab='custom', refreshing=false, currentId=null, candidates=[], selected=new Set(), selectionMode='all', generation=0, systemId=null, managerVisible=true;
  function el(tag,text,className) {const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;}
  function button(text,action,className) {const node=el('button',text,className);node.type='button';node.onclick=async()=>{node.disabled=true;try{await action();}catch(e){$('feedback').textContent=errorText(e);}finally{node.disabled=false;}};return node;}
  function errorText(e) {return /PGRST202|does not exist|schema cache/.test((e?.code||'')+' '+e?.message)?'Chức năng chưa được cập nhật đầy đủ trên máy chủ. Hãy liên hệ admin.':(e?.message||'Không thực hiện được. Vui lòng thử lại.');}
  async function rpc(name,args={}) {let req=window.sb.rpc(name,args);if(req.abortSignal)req=req.abortSignal(AbortSignal.timeout(25000));const {data,error}=await req;if(error)throw error;return data;}
  function when(date) {return date?new Date(date).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';}
  function localTime(date) {return new Date(new Date(date).getTime()+7*3600000).toISOString().slice(0,16);}
  function sendTime() {const value=$('sendAt').value;if(!value)throw new Error('Chọn thời gian gửi.');return new Date(value+':00+07:00').toISOString();}
  function status(value) {return el('span',labels[value]||value,'status '+value);}
  function table(headers) {const wrap=el('div',null,'table-scroll'), table=el('table'),head=el('thead'),row=el('tr'),body=el('tbody');headers.forEach(h=>row.append(el('th',h)));head.append(row);table.append(head,body);wrap.append(table);return {wrap,body};}
  function cell(row,value) {const td=el('td');td.append(value instanceof Node?value:document.createTextNode(String(value??'')));row.append(td);return td;}
  function normalize(text) {return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();}
  async function refresh(quiet=false) {
    if(refreshing)return;refreshing=true;
    try {
      consoleData=await rpc('message_automation_console');$('create').disabled=false;
      if(tab==='custom')renderCampaigns();else await renderSystems();
      if(!quiet)$('feedback').textContent='';
    } catch(e) {$('feedback').textContent=errorText(e);} finally {refreshing=false;}
  }
  function renderCampaigns() {
    const host=$('list');host.replaceChildren();
    if(!consoleData.campaigns.length){host.append(el('p','Chưa có tin nhắn theo lịch.','empty'));return;}
    const {wrap,body}=table(['Đợt gửi','Lịch gửi (Việt Nam)','Trạng thái','Kết quả','Thao tác']);
    for(const c of consoleData.campaigns) {
      const row=el('tr'),name=el('div');name.append(el('strong',c.name),el('small',c.author));cell(row,name);
      const date=el('div');date.append(el('span',when(c.next_run_at||c.send_at)),el('small',c.recurrence==='yearly'?'Hằng năm':'Một lần'));cell(row,date);
      cell(row,status(c.state==='scheduled'&&Number(c.processing)>0?'processing':c.state==='scheduled'&&Number(c.pending)>0?'pending':c.state));
      cell(row,Number(c.total)>0?`${c.sent}/${c.total} đã gửi · ${c.failed} lỗi / chưa xác nhận`:'Chưa có lượt gửi');
      const actions=el('div',null,'commands');
      if(c.state==='draft')actions.append(button('Chỉnh sửa',()=>openEditor(c)));
      actions.append(button('Chi tiết',()=>showDetails(c)),button('Tạo bản sao',()=>openEditor(c,true)));
      if(c.state==='scheduled')actions.append(button('Tạm dừng',()=>control(c,'pause')));
      if(c.state==='paused')actions.append(button('Tiếp tục',()=>control(c,'resume')));
      if(['scheduled','finished'].includes(c.state)&&Number(c.failed)>0)actions.append(button('Thử lại tin lỗi',()=>control(c,'retry')));
      if(!['cancelled','finished'].includes(c.state))actions.append(button('Hủy',()=>control(c,'cancel'),'danger'));
      cell(row,actions);body.append(row);
    }
    host.append(wrap);
  }
  async function control(c,action) {
    const question={pause:'Tạm dừng đợt gửi? Tin đang gửi có thể vẫn hoàn tất.',resume:'Tiếp tục gửi các tin còn chờ trong thời hạn? Tin đã gửi không được gửi lại.',cancel:'Hủy đợt gửi? Tin đang gửi có thể vẫn hoàn tất.',retry:'Chỉ thử lại tin lỗi rõ ràng còn trong thời hạn. Không gửi lại tin đã gửi hoặc chưa xác nhận. Tiếp tục?'}[action];
    if(!confirm(question))return;
    await rpc('control_message_campaign',{p_id:c.id,p_action:action});await refresh();
  }
  async function showDetails(c) {
    $('detailsTitle').textContent=c.name;$('detailBody').textContent='Đang tải…';$('details').showModal();
    try {
      const data=await rpc('message_campaign_details',{p_id:c.id});
      const {wrap,body}=table(['Phụ huynh','Lượt gửi','Kết quả','Chi tiết']);
      for(const r of data.recipients){const tr=el('tr');cell(tr,r.parent);cell(tr,when(r.scheduled_at));cell(tr,status(r.status));const info=el('div');info.append(el('p',r.error|| (r.sent_at?'Đã gửi '+when(r.sent_at):'—')));const more=el('details');more.append(el('summary','Nội dung'),el('pre',r.content));info.append(more);cell(tr,info);body.append(tr);}
      $('detailBody').replaceChildren();
      if(!data.recipients.length)$('detailBody').append(el('p',data.runs.some(r=>r.state==='expired')?'Lượt gửi đã hết hạn, không phát tin.':'Chưa đến lịch gửi hoặc không có người nhận trong phạm vi.'));
      else {
        const label=el('label','Lọc kết quả'),filter=el('select');
        for(const value of ['all','pending','processing','sent','failed','uncertain','cancelled','skipped']){const option=el('option',value==='all'?'Tất cả':labels[value]);option.value=value;filter.append(option);}
        filter.onchange=()=>Array.from(body.rows).forEach((row,i)=>row.hidden=filter.value!=='all'&&data.recipients[i].status!==filter.value);
        label.append(filter);$('detailBody').append(label,wrap);
      }
    }catch(e){$('detailBody').textContent=errorText(e);}
  }
  function chosenClasses() {return $('allClasses').checked?[]:Array.from($('classes').selectedOptions,o=>o.value);}
  function args(template=$('template').value) {
    if(!$('allClasses').checked&&!chosenClasses().length)throw new Error('Chọn ít nhất một lớp hoặc bật tất cả lớp.');
    return {p_template:template,p_send_at:sendTime(),p_class_ids:chosenClasses(),p_parent_ids:[],p_excluded_ids:[]};
  }
  async function loadCandidates(initial) {
    const seq=++generation;$('recipients').textContent='Đang tải người nhận…';$('publish').disabled=true;
    try {
      const rows=await rpc('preview_message_campaign',args('[Ten_hoc_sinh]'));
      if(seq!==generation||!$('editor').open)return;
      candidates=rows;
      if(initial) {selectionMode=initial.parent_ids?.length?'selected':'all';selected=new Set(rows.filter(r=>initial.parent_ids?.length?initial.parent_ids.includes(r.parent_id):!initial.excluded_ids?.includes(r.parent_id)).map(r=>r.parent_id));}
      else if(selectionMode==='all')selected=new Set(rows.map(r=>r.parent_id));
      renderRecipients();updatePreviewLocal();
    }catch(e){if(seq===generation){candidates=[];$('recipients').textContent=errorText(e);}}finally{if(seq===generation)$('publish').disabled=false;}
  }
  function renderRecipients() {
    const host=$('recipients');host.replaceChildren();const search=normalize($('recipientSearch').value);
    for(const r of candidates.filter(r=>normalize(r.parent_name+' '+r.students+' '+r.classes).includes(search))) {
      const label=el('label',null,'recipient'),input=el('input');input.type='checkbox';input.checked=selected.has(r.parent_id);
      input.onchange=()=>{selectionMode='selected';input.checked?selected.add(r.parent_id):selected.delete(r.parent_id);updatePreviewLocal();};
      const title=el('span',r.parent_name);title.append(el('small',r.students),el('small',r.linked?r.classes:'Chưa liên kết Zalo'));
      label.append(input,title);host.append(label);
    }
    if(!host.children.length)host.append(el('p','Không có phụ huynh phù hợp.'));
  }
  function renderTemplate(text,r,date) {
    const values={Ten_hoc_sinh:r.students,Ten_phu_huynh:r.parent_name,Ten_lop:r.classes,Ngay_gui:new Date(date).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),Ten_trung_tam:'Trung tâm MindUp'};
    return text.replace(/\[([^\[\]]+)\]/g,(token,key)=>values[key]??token);
  }
  function updatePreviewLocal() {
    const previous=$('previewParent').value,rows=candidates.filter(r=>selected.has(r.parent_id));
    $('previewParent').replaceChildren(...rows.map(r=>{const o=el('option',r.parent_name);o.value=r.parent_id;return o;}));
    if(rows.some(r=>r.parent_id===previous))$('previewParent').value=previous;
    $('recipientCount').textContent=`${rows.length} phụ huynh đã chọn · ${rows.filter(r=>r.linked).length} đã liên kết Zalo`;
    const parent=rows.find(r=>r.parent_id===$('previewParent').value);
    try {$('previewText').textContent=parent?renderTemplate($('template').value,parent,sendTime()):'Chưa chọn người nhận.';}catch(_){$('previewText').textContent='Chọn thời gian gửi.';}
  }
  async function openEditor(c=null,copy=false) {
    currentId=c&&!copy?c.id:crypto.randomUUID();$('draftForm').reset();$('editorTitle').textContent=c&&!copy?'Chỉnh sửa bản nháp':'Tạo tin nhắn';
    $('campaignName').value=c?(copy?c.name+' (bản sao)':c.name):'';
    $('template').value=c?.template||'Nhân ngày 20/10, trung tâm kính chúc phụ huynh, mẹ của con [Ten_hoc_sinh] có một ngày Phụ nữ Việt Nam thật hạnh phúc. Cảm ơn quý phụ huynh đã tin tưởng khi cho con theo học trung tâm.';
    $('sendAt').value=localTime(c&&!copy?c.send_at:Date.now()+3600000);$('recurrence').value=c?.recurrence||'once';$('windowHours').value=c?.window_hours||24;
    $('classes').replaceChildren(...consoleData.classes.map(cl=>{const o=el('option',cl.name);o.value=cl.id;o.selected=c?.class_ids?.includes(cl.id)||false;return o;}));
    $('allClasses').checked=!c?.class_ids?.length;$('classes').disabled=$('allClasses').checked;
    candidates=[];selected=new Set();selectionMode='all';$('editorFeedback').textContent='';$('editor').showModal();await loadCandidates(c);
  }
  async function save(publish=false) {
    if(!$('draftForm').reportValidity())return;
    $('saveDraft').disabled=true;$('publish').disabled=true;
    try {
      const previewArgs=args();
      if(sendTime()<new Date().toISOString()&&publish)throw new Error('Chọn thời gian gửi trong tương lai.');
      const ids=candidates.filter(r=>selected.has(r.parent_id)).map(r=>r.parent_id);
      if(!ids.length)throw new Error('Chọn ít nhất một phụ huynh.');
      // Keep all-in-scope semantics for recurring sends, with explicit exclusions.
      if(selectionMode==='all')previewArgs.p_excluded_ids=candidates.filter(r=>!selected.has(r.parent_id)).map(r=>r.parent_id);
      else previewArgs.p_parent_ids=ids;
      const preview=await rpc('preview_message_campaign',previewArgs);
      const linked=preview.filter(r=>r.linked);
      if(publish&&!linked.length)throw new Error('Không có người nhận đã liên kết Zalo.');
      const chosen=preview.find(r=>r.parent_id===$('previewParent').value)||preview[0];
      if(chosen)$('previewText').textContent=chosen.content;
      if(publish&&!confirm(`Lên lịch ${when(previewArgs.p_send_at)}${$('recurrence').value==='yearly'?' hằng năm':''} cho ${linked.length} phụ huynh đã liên kết (${preview.length-linked.length} chưa liên kết)?\nMỗi phụ huynh nhận một tin, gộp tên các con. Danh sách được kiểm tra lại khi đến lịch.\n\nMẫu: ${chosen?.parent_name||''}\n${chosen?.content||''}`))return;
      await rpc('save_message_campaign',{...previewArgs,p_id:currentId,p_name:$('campaignName').value,p_recurrence:$('recurrence').value,p_window_hours:Number($('windowHours').value)});
      if(publish)await rpc('control_message_campaign',{p_id:currentId,p_action:'publish'});
      $('editor').close();await refresh();$('feedback').textContent=publish?'Đã lên lịch gửi.':'Đã lưu bản nháp.';
    }catch(e){$('editorFeedback').textContent=errorText(e);}finally{$('saveDraft').disabled=false;$('publish').disabled=false;}
  }
  async function renderSystems() {
    const data=await rpc('message_automation_systems'),host=$('list');if(tab!=='system')return;host.replaceChildren();
    const rows=[{id:'tuition',name:'Nhắc nộp học phí',content:data.tuition?.template||'',is_enabled:!data.tuition?.paused},...data.templates];
    const grid=el('div',null,'system-grid');
    for(const row of rows){const info=systemInfo[row.id]||{},section=el('section',null,'system-row'),name=el('div');name.append(el('h3',row.name),row.id==='tuition_overdue_notice'?el('span','Gửi thủ công','status'):status(row.is_enabled?'scheduled':'paused'));section.append(name,el('p',info.condition||''));
      const actions=el('div',null,'commands');actions.append(button(data.admin?'Cài đặt':'Xem mẫu',async()=>{
        systemId=row.id;$('systemTitle').textContent=row.name;$('systemCondition').textContent=info.condition||'';$('systemEnabled').checked=row.is_enabled;$('systemEnabled').disabled=!data.admin;$('systemContent').value=row.content;$('systemContent').readOnly=!data.admin||!!info.pool;$('saveSystem').hidden=!data.admin;$('systemFeedback').textContent='';$('systemEditor').showModal();
        const overdue=row.id==='tuition_overdue_notice';$('overdueOptions').hidden=!overdue;$('previewOverdue').hidden=!overdue||!data.admin;$('systemEnabledWrap').hidden=overdue;$('overdueVariable').disabled=!data.admin;
      }));
      if(row.id==='tuition_overdue_notice'&&data.admin)actions.append(button('Gửi',()=>openOverduePreview(row.content),'primary'));
      if(info.pool&&data.admin)actions.append(button('Bộ mẫu đánh giá',()=>{window.open('sourcedata.html?tab=evaluationTemplates','_blank','noopener');}));
      section.append(actions);grid.append(section);
    }host.append(grid,el('h3','Lịch sử hàng gửi Zalo gần nhất'));
    const {wrap,body}=table(['Phụ huynh','Thời gian','Kết quả','Chi tiết']);
    for(const r of data.history){const tr=el('tr');cell(tr,r.parent);cell(tr,when(r.created_at));cell(tr,status(r.status));const more=el('details');more.append(el('summary',r.error_message||'Nội dung'),el('pre',r.content));cell(tr,more);body.append(tr);}host.append(wrap);
    host.append(el('p','Lịch sử học phí gộp và ảnh QR: xem “Chi tiết” trong tab Học phí.'));
  }
  $('draftForm').onsubmit=e=>{e.preventDefault();save();};$('publish').onclick=()=>save(true);
  $('create').onclick=()=>openEditor();$('refresh').onclick=()=>refresh();
  $('customTab').onclick=()=>{tab='custom';$('customTab').setAttribute('aria-pressed','true');$('systemTab').setAttribute('aria-pressed','false');if(consoleData)renderCampaigns();};
  $('systemTab').onclick=async()=>{tab='system';$('customTab').setAttribute('aria-pressed','false');$('systemTab').setAttribute('aria-pressed','true');try{await renderSystems();}catch(e){$('feedback').textContent=errorText(e);}};
  $('allClasses').onchange=()=>{$('classes').disabled=$('allClasses').checked;loadCandidates();};$('classes').onchange=()=>loadCandidates();
  $('sendAt').onchange=updatePreviewLocal;$('template').oninput=updatePreviewLocal;$('previewParent').onchange=updatePreviewLocal;
  $('recipientSearch').oninput=renderRecipients;
  $('selectAll').onclick=()=>{selectionMode='all';selected=new Set(candidates.map(r=>r.parent_id));renderRecipients();updatePreviewLocal();};
  $('selectNone').onclick=()=>{selectionMode='selected';selected.clear();renderRecipients();updatePreviewLocal();};
  $('variable').onchange=()=>{if(!$('variable').value)return;const field=$('template');field.setRangeText('['+$('variable').value+']',field.selectionStart,field.selectionEnd,'end');$('variable').value='';field.focus();updatePreviewLocal();};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('editor').addEventListener('close',()=>generation++);
  $('overdueVariable').onchange=()=>{if(!$('overdueVariable').value)return;const field=$('systemContent');field.setRangeText('['+$('overdueVariable').value+']',field.selectionStart,field.selectionEnd,'end');$('overdueVariable').value='';field.focus();};
  async function openOverduePreview(template){
      const data=await rpc('preview_overdue_tuition_notices',{p_template:template});
      $('detailsTitle').textContent=(data.overdue?'Phụ huynh còn công nợ đến tháng ':'Dự kiến nhắc quá hạn tháng ')+data.month.slice(0,7);
      const {wrap,body}=table(['Phụ huynh','Tổng còn thiếu','Zalo','Nội dung','QR thanh toán']),selected=new Set(data.recipients.filter(r=>r.can_send).map(r=>r.parent_id));
      wrap.classList.add('overdue-preview');
      const feedback=el('p');feedback.setAttribute('role','status');
      const requestId=crypto.randomUUID();let complete=false,submittedIds=null;
      const send=button('Gửi',async()=>{
        const ids=submittedIds||Array.from(selected);if(!ids.length)return;
        const repeated=data.recipients.filter(r=>selected.has(r.parent_id)&&r.last_sent_at).length;
        if(!confirm('Gửi thông báo quá hạn cho '+ids.length+' phụ huynh đã chọn?'+(repeated?' '+repeated+' phụ huynh đã được nhắc trong tháng; bạn xác nhận gửi thêm lần nữa?':'')+' Công nợ sẽ được kiểm tra lại trước khi gửi.'))return;
        submittedIds=ids;wrap.querySelectorAll('input').forEach(input=>input.disabled=true);
        try{
          const result=await rpc('queue_overdue_tuition_manual',{p_request:requestId,p_template:template,p_parent_ids:ids});
          complete=true;feedback.textContent='Đã xếp hàng '+result.queued+' tin · '+result.skipped+' phụ huynh đã bỏ qua. Xem kết quả trong lịch sử hàng gửi Zalo.';
          await refresh();
        }catch(e){feedback.textContent=errorText(e);}finally{send.disabled=complete;}
      },'primary');
      // The shared button helper re-enables on return; keep the completed batch inert.
      const sendAction=send.onclick;send.onclick=async()=>{await sendAction();if(complete)send.disabled=true;};
      function updateSelection(){send.textContent='Gửi cho '+selected.size+' phụ huynh';send.disabled=complete||!selected.size;}
      for(const r of data.recipients){const tr=el('tr'),label=el('label',null,'recipient'),check=el('input');check.type='checkbox';check.checked=selected.has(r.parent_id);check.disabled=!r.can_send;
        check.onchange=()=>{check.checked?selected.add(r.parent_id):selected.delete(r.parent_id);updateSelection();};label.append(check,el('span',r.parent_name));
        cell(tr,label);cell(tr,Number(r.remaining).toLocaleString('vi-VN')+'đ');const state=el('div',r.blocked?'Đang gửi / chưa xác nhận':r.linked?'Đã liên kết':'Chưa liên kết');if(r.last_sent_at)state.append(el('small','Đã nhắc '+when(r.last_sent_at)));cell(tr,state);cell(tr,el('pre',r.content));
        const images=el('div');for(const qr of r.qrs||[]){
          let url;try{url=new URL(qr.qr_url);}catch{continue;}
          if(url.origin!=='https://img.vietqr.io'||!/^\/image\/[a-z0-9]+-[0-9]{6,30}-compact2\.png$/i.test(url.pathname))continue;
          const figure=el('figure'),img=el('img');img.src=url.href;img.alt='QR học phí '+qr.student_name;img.width=180;img.height=180;img.loading='lazy';img.style.objectFit='contain';
          figure.style.margin='0 0 12px';figure.append(img,el('figcaption',qr.student_name+' · '+Number(qr.remaining).toLocaleString('vi-VN')+'đ'),el('small',qr.memo));images.append(figure);
        }cell(tr,images);body.append(tr);}
      const footer=el('footer');footer.append(send);updateSelection();
      $('detailBody').replaceChildren(el('p',data.overdue?data.recipients.length+' phụ huynh còn thiếu · '+selected.size+' có thể gửi':'Chưa quá hạn ngày 15; chưa thể gửi thông báo quá hạn.'),wrap,feedback,footer);$('details').showModal();
  }
  $('previewOverdue').onclick=async()=>{
    $('previewOverdue').disabled=true;try{await openOverduePreview($('systemContent').value);}catch(e){$('systemFeedback').textContent=errorText(e);}finally{$('previewOverdue').disabled=false;}
  };
  $('systemForm').onsubmit=async e=>{
    e.preventDefault();$('saveSystem').disabled=true;
    try{
      if(systemId==='tuition_overdue_notice'){
        await rpc('save_overdue_tuition_template',{p_content:$('systemContent').value});
      }else await rpc('update_message_automation_system',{p_id:systemId,p_content:$('systemContent').value,p_enabled:$('systemEnabled').checked});
      $('systemEditor').close();await refresh();
    }catch(err){$('systemFeedback').textContent=errorText(err);}finally{$('saveSystem').disabled=false;}
  };
  window.MessageAutomationModel={renderTemplate,localTime};
  refresh();
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='message-automations-visibility')return;
    managerVisible=event.data.visible===true;
  });
  setInterval(()=>{if(managerVisible&&!document.hidden&&!$('editor').open&&!$('systemEditor').open&&!$('details').open)refresh(true);},15000);
})();
