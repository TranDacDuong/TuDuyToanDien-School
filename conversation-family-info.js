(function () {
  const bindings=new WeakMap();
  const statuses={present:'Có mặt',absent:'Vắng',makeup:'Học bù',trial:'Học thử'};
  const money=n=>new Intl.NumberFormat('vi-VN').format(Math.round(Number(n)||0))+'đ';
  const date=value=>value?new Date(String(value).length===10?value+'T12:00:00+07:00':value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
  function currentMonth() {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
  }
  function node(tag,text,cls) {const el=document.createElement(tag);if(text!=null) el.textContent=text;if(cls) el.className=cls;return el;}
  function button(text,action) {const el=node('button',text,'family-action');el.type='button';el.onclick=action;return el;}
  function pair(target,label,value,cls) {const row=node('div',null,'family-pair');row.append(node('span',label),node('strong',value ?? 'Chưa có',cls));target.append(row);}
  function group(target,title) {const el=node('div',null,'family-group');el.append(node('h4',title));target.append(el);return el;}
  function navigate(page) {
    if(window.top!==window && typeof window.top.openDashboardPage==='function') window.top.openDashboardPage(page,{syncMenu:true,syncMobile:true});
    else location.href='dashboard.html?page='+encodeURIComponent(page);
  }
  function scheduleLabel(rows,month) {
    const eligible=(rows || []).filter(r=>String(r.effective_from || '2000-01-01').slice(0,7)<=month);
    const latest=eligible.reduce((max,r)=>String(r.effective_from || '2000-01-01').slice(0,10)>max?String(r.effective_from).slice(0,10):max,'2000-01-01');
    return eligible.filter(r=>String(r.effective_from || '2000-01-01').slice(0,10)===latest)
      .map(r=>(Number(r.weekday)===7?'CN':'T'+(Number(r.weekday)+1))+' '+String(r.start_time || '').slice(0,5)+'–'+String(r.end_time || '').slice(0,5)).join(' · ') || 'Chưa có lịch';
  }
  async function rpc(name,args) {
    let request=window.sb.rpc(name,args);
    if(typeof request.abortSignal==='function') request=request.abortSignal(AbortSignal.timeout(20000));
    const {data,error}=await request;if(error) throw error;return data;
  }
  function linkToClass(id,name) {return button(name || 'Xem lớp',()=>navigate('class.html?openClassId='+encodeURIComponent(id)));}
  function renderStudent(target,student,state,index) {
    const detail=node('details',null,'family-student');detail.open=index===0;
    detail.append(node('summary',student.name || 'Học sinh'));target.append(detail);
    const profile=group(detail,'Thông tin học sinh');
    pair(profile,'Năm sinh',student.birth_year);pair(profile,'Trường',student.school);pair(profile,'Tỉnh/thành',student.province);
    if(student.phone) pair(profile,'SĐT học sinh',student.phone);
    const classes=group(detail,'Lớp tham gia');
    if(!student.classes?.length) classes.append(node('p','Chưa có lớp trong phạm vi phụ trách.'));
    for(const item of student.classes || []) {
      const block=node('div',null,'family-class');classes.append(block);block.append(linkToClass(item.id,item.class_name));
      const active=String(item.joined_at || '').slice(0,7)<=state.month && (!item.left_at || String(item.left_at).slice(0,7)>=state.month);
      block.append(node('p',active?'Đang học trong kỳ':'Ngoài kỳ học đang xem'));
      block.append(node('p',(item.teachers || []).map(t=>t.name+(t.role==='assistant'?' (Trợ giảng)':'')).join(' · ') || 'Chưa phân công giáo viên'));
      block.append(node('p',scheduleLabel(item.schedules,state.month)));
      block.append(node('p','Vào lớp: '+date(item.joined_at)+(item.left_at?' · Rời lớp: '+date(item.left_at):'')));
    }
    const attendance=group(detail,'Điểm danh · '+state.month);
    for(const item of student.classes || []) {
      const rows=(student.attendance || []).filter(a=>a.class_id===item.id);
      if(!rows.length) continue;
      const table=node('details',null,'family-attendance');table.append(node('summary',item.class_name));
      for(const [status,label] of Object.entries(statuses)) pair(table,label,rows.filter(a=>a.status===status).length);
      for(const row of rows) table.append(node('p',date(row.date)+' · '+(statuses[row.status] || row.status)));
      attendance.append(table);
    }
    if(!student.attendance?.length) attendance.append(node('p','Chưa có điểm danh được ghi nhận trong tháng.'));
    const finance=group(detail,'Học phí & công nợ · '+state.month);
    const totals=window.ConversationFamilyModel.summarize(student,state.month,window.TuitionCalculation);
    if(!totals) finance.append(node('p','Không có quyền xem tổng công nợ của học sinh.'));
    else {
      pair(finance,'Học phí tháng',money(totals.due));pair(finance,'Miễn/giảm',money(totals.discount));pair(finance,'Đã nộp tháng này',money(totals.paid));
      pair(finance,'Còn thiếu tháng này',money(totals.remaining));
      for(const debt of totals.debts) pair(finance,'Nợ '+debt.month,money(debt.remaining));
      pair(finance,'Tổng cần thanh toán đến '+state.month,money(totals.total),'family-debt');
      pair(finance,'Tiền dư các kỳ đến '+state.month,money(totals.credit),'family-credit');
      finance.append(node('p','Tiền dư được hiển thị riêng, chưa tự trừ vào công nợ.','family-muted'));
      if(!totals.calculated) finance.append(node('p','Học phí tháng theo bản ghi đã lưu.','family-muted'));
      finance.append(button('Xem học phí',()=>navigate('tuition.html?month='+state.month+'&student='+encodeURIComponent(student.id))));
      if(totals.total>0) finance.append(button('Xem QR tổng công nợ',event=>showQr(student,state,event.currentTarget)));
      const payments=group(detail,'Thanh toán đã ghi nhận theo kỳ');
      const paid=totals.payments.filter(p=>Number(p.amount_paid)>0).sort((a,b)=>String(b.paid_at || b.month).localeCompare(String(a.paid_at || a.month))).slice(0,10);
      if(!paid.length) payments.append(node('p','Chưa có khoản thu được ghi nhận.'));
      for(const p of paid) pair(payments,String(p.month).slice(0,7)+' · '+date(p.paid_at),money(p.amount_paid));
      if(Array.isArray(student.finance.transactions)) {
        const transactions=group(detail,'Giao dịch ngân hàng đã khớp');
        if(!student.finance.transactions.length) transactions.append(node('p','Chưa có giao dịch ngân hàng đã khớp.'));
        for(const transaction of student.finance.transactions) pair(transactions,date(transaction.created_at)+' · '+transaction.gateway,money(transaction.amount));
      }
    }
    const learning=group(detail,'Học tập gần nhất đến '+state.month);
    if(!student.scores?.length) learning.append(node('p','Chưa có điểm kiểm tra.'));
    for(const score of student.scores || []) learning.append(node('p',date(score.test_date)+' · '+score.title+': '+score.score+'/'+score.max_score));
    if(!student.evaluations?.length) learning.append(node('p','Chưa có nhận xét.'));
    for(const evaluation of student.evaluations || []) {
      const item=node('details');item.append(node('summary',(evaluation.sent_at?'Đã ghi nhận gửi '+date(evaluation.sent_at):'Bản nhận xét '+date(evaluation.updated_at))));
      item.append(node('p',evaluation.content || 'Chưa có nội dung nhận xét.'));learning.append(item);
    }
    const pending=group(detail,'Việc cần xử lý & lịch sắp tới');
    if(!student.trials?.length && !student.upcoming?.length) pending.append(node('p','Không có mục chờ xử lý được ghi nhận.'));
    for(const trial of student.trials || []) pending.append(button('Học thử chưa hoàn tất · '+date(trial.trial_session_1_at),()=>navigate('trial_requests.html')));
    for(const session of student.upcoming || []) pending.append(linkToClass(session.parent_class_id,date(session.session_date)+' · '+(session.topic || 'Buổi bổ sung')));
    renderNotes(detail,student,state);
  }
  function renderNotes(target,student,state) {
    const notes=group(target,window.getConversationFamilyViewer()?.role==='admin'?'Ghi chú nội bộ':'Ghi chú nội bộ của bạn');
    notes.append(node('p','Không gửi sang Zalo.','family-muted'));
    const history=node('div');notes.append(history);
    const renderHistory=()=>{history.replaceChildren();for(const item of student.notes || []) {
      const note=node('div',null,'family-note');note.append(node('p',item.content),node('small',(item.author || 'Nhân viên')+' · '+date(item.created_at)));history.append(note);
    }};renderHistory();
    const input=node('textarea');input.maxLength=2000;input.rows=3;input.placeholder='Ghi chú nội bộ';input.setAttribute('aria-label','Ghi chú nội bộ về '+student.name);
    input.value=state.drafts.get(student.id) || '';input.oninput=()=>state.drafts.set(student.id,input.value);
    const feedback=node('p');feedback.setAttribute('role','status');let saving=false,attempt;
    const save=button('Lưu ghi chú',async()=>{
      const content=input.value.trim();if(!content || saving) return;
      if(!attempt || attempt.content!==content) attempt={content,id:crypto.randomUUID()};
      saving=true;save.disabled=true;
      try {
        await rpc('add_mindup_family_note',{p_parent:state.parent,p_student:student.id,p_content:content,p_id:attempt.id});
        if(!student.notes?.some(n=>n.id===attempt.id)) student.notes=[{id:attempt.id,content,author:window.getConversationFamilyViewer()?.full_name || 'Bạn',created_at:new Date().toISOString()},...(student.notes || [])];
        if(input.value.trim()===content) {input.value='';state.drafts.delete(student.id);}renderHistory();feedback.textContent='Đã lưu ghi chú';attempt=null;
      } catch(error) {feedback.textContent='Chưa lưu được: '+error.message;}
      finally {saving=false;save.disabled=false;}
    });notes.append(input,save,feedback);
  }
  async function showQr(student,state,trigger) {
    trigger.disabled=true;const sequence=state.sequence, month=state.month;
    try {
      const fresh=await rpc('get_mindup_family_info',{p_parent:state.parent,p_month:month+'-01'});
      if(state.sequence!==sequence || !state.host.isConnected) return;
      const current=fresh.students.find(s=>s.id===student.id);
      const totals=current && window.ConversationFamilyModel.summarize(current,month,window.TuitionCalculation);
      if(!totals) throw new Error('Không có quyền xem công nợ');
      const bundle=await rpc('prepare_tuition_detail_bundle',{p_student:student.id,p_month:month+'-01',p_amount_due:totals.due});
      if(state.sequence!==sequence || !state.host.isConnected) return;
      const dialog=node('dialog',null,'family-qr-dialog');const header=node('header');header.append(node('strong',student.name),button('Đóng',()=>dialog.close()));dialog.append(header);
      if(Number(bundle.remaining)>0 && bundle.memo) {
        pair(dialog,'Tổng cần thanh toán',money(bundle.remaining));
        pair(dialog,'Ngân hàng','VietinBank');pair(dialog,'Số tài khoản','104888332556');
        for(const debt of bundle.debts || []) pair(dialog,String(debt.month).slice(0,7),money(debt.remaining));
        const image=node('img');image.alt='Mã QR tổng công nợ';image.src='https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount='+encodeURIComponent(bundle.remaining)+'&addInfo='+encodeURIComponent(bundle.memo);dialog.append(image,node('p',bundle.memo));
      } else dialog.append(node('p','Đã thanh toán đủ công nợ đến tháng '+month));
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
    } catch(error) {if(state.sequence===sequence) alert('Không lấy được QR: '+error.message);}
    finally {trigger.disabled=false;}
  }
  function mount(host,friend) {
    const viewer=window.getConversationFamilyViewer?.();
    if(!viewer || !['admin','teacher','assistant','marketing','accountant','staff'].includes(viewer.role)) return;
    if(bindings.get(host)?.parent===friend.id) return;
    host.replaceChildren();
    if(friend.isZaloExternal) {host.append(node('p','Chưa liên kết hồ sơ phụ huynh.'));bindings.set(host,{parent:friend.id});return;}
    if(friend.role!=='parent') return;
    const state={host,parent:friend.id,month:currentMonth(),sequence:0,drafts:new Map()};bindings.set(host,state);
    const controls=node('div',null,'family-controls'),label=node('label','Kỳ xem hồ sơ');
    const month=node('input');month.type='month';month.min='2000-01';month.max=currentMonth();month.value=state.month;label.append(month);
    const refresh=button('Tải lại',()=>load());controls.append(label,refresh);host.append(controls);
    const body=node('div');host.append(body);
    month.onchange=()=>{if(month.validity.valid && /^\d{4}-\d{2}$/.test(month.value)) {state.month=month.value;load();}};
    async function load() {
      const sequence=++state.sequence;body.replaceChildren(node('p','Đang tải hồ sơ…'));refresh.disabled=true;
      try {
        const data=await rpc('get_mindup_family_info',{p_parent:state.parent,p_month:state.month+'-01'});
        if(sequence!==state.sequence || !host.isConnected) return;
        body.replaceChildren();const parent=group(body,'Phụ huynh');pair(parent,'Họ tên',data.parent?.name);pair(parent,'SĐT',data.parent?.phone);pair(parent,'Zalo',data.parent?.linked?'Đã liên kết':'Chưa liên kết');
        if(data.students?.length && data.students.every(student=>student.finance)) {
          const totals=data.students.map(student=>window.ConversationFamilyModel.summarize(student,state.month,window.TuitionCalculation));
          pair(parent,'Tổng công nợ gia đình đến '+state.month,money(totals.reduce((n,item)=>n+item.total,0)),'family-debt');
        }
        if(!data.students?.length) body.append(node('p','Chưa có học sinh trong phạm vi phụ trách.'));
        (data.students || []).forEach((student,index)=>renderStudent(body,student,state,index));
      } catch(error) {if(sequence===state.sequence && host.isConnected) body.replaceChildren(node('p','Không tải được hồ sơ: '+error.message),button('Thử lại',load));}
      finally {if(sequence===state.sequence) refresh.disabled=false;}
    }
    load();
  }
  window.FamilyConversationInfo={mount};
})();
