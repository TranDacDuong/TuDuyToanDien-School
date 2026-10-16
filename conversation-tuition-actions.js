(function () {
  const labels={queued:'Đang chờ gửi',processing:'Đang gửi',sent:'Đã gửi nội dung',failed:'Gửi lỗi',cancelled:'Đã hủy',uncertain:'Chưa xác nhận'};
  const pending=new Set(['queued','processing','not_found','not_friend','invited','greeted']);
  const bank={bankName:'VietinBank',account:'104888332556'};
  function el(tag,text) {const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
  function button(text,action) {const n=el('button',text);n.type='button';n.className='family-action';n.onclick=action;return n;}
  async function rpc(name,args) {
    let request=window.sb.rpc(name,args);
    if(request.abortSignal) request=request.abortSignal(AbortSignal.timeout(20000));
    const {data,error}=await request;if(error)throw error;return data;
  }
  async function history(student,parent,month) {
    const {data,error}=await window.sb.from('zalo_tuition_deliveries')
      .select('id,status,created_at,sent_at,qr_sent_at,error_message,qr_url,qr_only_requested')
      .eq('student_id',student).eq('parent_id',parent).eq('month',month+'-01').order('created_at',{ascending:false}).limit(10);
    if(error)throw error;return data || [];
  }
  function when(value) {return new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});}
  function describe(row) {
    return (labels[row.status] || row.status)+' · '+when(row.created_at)+
      (row.sent_at?' · '+(row.qr_sent_at?'Đã gửi QR':'Chưa xác nhận ảnh QR'):'')+
      (row.error_message?' · '+row.error_message:'');
  }
  async function mount(host,student,state) {
    const sequence=state.sequence, month=state.month;
    const alive=()=>host.isConnected && state.sequence===sequence;
    try {
      if(!await rpc('has_app_permission',{p_permission_key:'tuition.zalo_queue.manage'}) || !alive())return;
      const wrap=el('div');wrap.className='family-tuition-actions';host.append(wrap);
      const feedback=el('p');feedback.setAttribute('role','status');
      const send=button('Gửi thông báo học phí',()=>preview());
      const latest=el('p');latest.className='family-muted';
      wrap.append(send,latest,feedback);
      async function refresh() {
        const rows=await history(student.id,state.parent,month);
        if(!alive())return rows;
        latest.textContent=rows.length?'Lần thông báo gần nhất: '+describe(rows[0]):'Chưa có lịch sử gửi tháng '+month;
        return rows;
      }
      const reload=button('Cập nhật trạng thái gửi',async()=>{
        reload.disabled=true;try{await refresh();feedback.textContent='';}catch(e){feedback.textContent=e.message;}finally{reload.disabled=false;}
      });wrap.append(reload);
      try {await refresh();} catch(e) {latest.textContent='Chưa tải được lịch sử: '+e.message;}
      async function preview() {
        send.disabled=true;feedback.textContent='Đang kiểm tra công nợ và lịch sử gửi…';
        try {
          const fresh=await rpc('get_mindup_family_info',{p_parent:state.parent,p_month:month+'-01'});
          if(!alive())return;
          if(!fresh.parent?.linked)throw new Error('Cần liên kết Zalo của phụ huynh trước khi gửi.');
          const current=fresh.students.find(s=>s.id===student.id);
          const totals=current && window.ConversationFamilyModel.summarize(current,month,window.TuitionCalculation);
          if(!totals)throw new Error('Không có quyền xem công nợ.');
          const bundle=await rpc('prepare_tuition_detail_bundle',{p_student:student.id,p_month:month+'-01',p_amount_due:totals.due});
          if(!alive())return;
          if(!(Number(bundle.remaining)>0) || !bundle.memo)throw new Error('Đã thanh toán đủ công nợ đến tháng '+month+'.');
          const template=await rpc('tuition_notice_template',{});
          const rows=await refresh();if(!alive())return;
          const item={studentName:current.name,parentName:fresh.parent.name,remaining:Number(bundle.remaining),debts:bundle.debts,
            transferMemo:bundle.memo,className:totals.rows.map(r=>r.className).filter(Boolean).join(', ') || (current.classes || []).map(c=>c.class_name).join(', '),
            sessionsCount:totals.rows.reduce((n,r)=>n+Number(r.billableSessions || r.totalSessions || 0),0)};
          const content=window.TuitionNotice.render(item,month,bank,template || window.TuitionNotice.DEFAULT_TEMPLATE);
          const qr='https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount='+bundle.remaining+'&addInfo='+encodeURIComponent(bundle.memo);
          const payload={request_key:crypto.randomUUID(),batch_id:crypto.randomUUID(),student_id:student.id,parent_id:state.parent,
            content,qr_url:qr,remaining:Number(bundle.remaining),debts:bundle.debts,memo:bundle.memo,encoded_memo:encodeURIComponent(bundle.memo)};
          const dialog=el('dialog');dialog.className='family-qr-dialog';
          const header=el('header');header.append(el('strong',current.name+' · '+month),button('Đóng',()=>dialog.close()));dialog.append(header);
          const text=el('p',content);text.style.whiteSpace='pre-wrap';dialog.append(text);
          const image=el('img');image.src=qr;image.alt='QR tổng công nợ';dialog.append(image);
          image.onerror=()=>{image.hidden=true;dialog.append(el('p','Không tải được ảnh xem trước. Bot vẫn sẽ thử lấy QR khi gửi.'));};
          const status=el('p');status.setAttribute('role','status');dialog.append(status);
          const active=rows.some(r=>pending.has(r.status));
          if(rows.length)dialog.append(el('p','Đã có lịch sử gửi tháng này. '+describe(rows[0])));
          const acknowledge=el('input');acknowledge.type='checkbox';
          if(rows.length && !active) {const label=el('label',' Tôi đã kiểm tra lịch sử và muốn gửi thêm một thông báo.');label.prepend(acknowledge);dialog.append(label);}
          let busy=false,done=false;
          const confirm=button('Xác nhận gửi thông báo',async()=>{
            if(busy || done || !alive())return;
            if(rows.length && !acknowledge.checked){status.textContent='Vui lòng kiểm tra và xác nhận trước khi gửi lại.';return;}
            busy=true;confirm.disabled=true;
            try {
              // Reusing the request key on network retries prevents duplicate jobs.
              const result=await rpc('queue_grouped_tuition',{p_month:month+'-01',p_items:[payload],p_replace:false});
              done=true;status.textContent=Number(result?.queued)>0?'Đã xếp hàng. Bot sẽ gửi nội dung và ảnh QR; chưa phải xác nhận đã gửi.':'Đã có lượt đang xử lý; không tạo thêm để tránh trùng.';
              await refresh();
            }catch(e){status.textContent='Chưa xác nhận xếp hàng: '+e.message;}
            finally{busy=false;confirm.disabled=done;}
          });confirm.disabled=active;if(active)status.textContent='Có lượt đang chờ hoặc đang gửi. Không xếp thêm thông báo trùng.';dialog.append(confirm);
          const repair=rows.find(r=>r.status==='sent' && r.sent_at && !r.qr_sent_at && r.qr_url);
          if(repair)dialog.append(button('Gửi bù riêng ảnh QR',async event=>{
            if(!alive())return;
            if(!window.confirm('Chỉ gửi bù ảnh QR của lượt cũ. Bạn đã kiểm tra phụ huynh chưa nhận ảnh để tránh gửi trùng?'))return;
            const btn=event.currentTarget;btn.disabled=true;
            try{const ok=await rpc('request_tuition_qr_repair',{p_job_id:repair.id});status.textContent=ok?'Đã yêu cầu gửi bù QR, không gửi lại nội dung.':'Công nợ hoặc trạng thái đã thay đổi. Hãy tải lại hồ sơ.';await refresh();}
            catch(e){status.textContent=e.message;btn.disabled=false;}
          }));
          dialog.append(button('Cập nhật kết quả',async()=>{
            try{const list=await refresh();status.textContent=list.length?describe(list[0]):'Chưa có lịch sử gửi.';}catch(e){status.textContent=e.message;}
          }));
          dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();feedback.textContent='';
        }catch(e){if(alive())feedback.textContent=e.message;}
        finally{send.disabled=false;}
      }
    }catch(e){if(alive())host.append(el('p','Chưa kiểm tra được quyền gửi học phí: '+e.message));}
  }
  window.ConversationTuitionActions={mount};
})();
