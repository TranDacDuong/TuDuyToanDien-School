(function(root){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=v=>/^[0-9a-f-]{36}$/i.test(v||'');
  function sessions(request){return Array.isArray(request?.trial_sessions)?request.trial_sessions:[];}
  function finished(request,now=Date.now()){
    const values=sessions(request).map(s=>Date.parse(s.ends_at)).filter(Number.isFinite);
    return values.length>0 && now>=Math.max(...values);
  }
  if(typeof module==='object'&&module.exports){module.exports={sessions,finished};return;}
  let context={},frameDialog;
  const canManage=()=>['trial.class.assign','class.students.add'].every(p=>root.AppPermissions?.has?.(p,false));
  function setContext(value){context=value;}
  function studentActions(student){
    if(!student.is_trial)return '';
    const request=(context.requests||[]).find(r=>r.student_id===student.student_id&&r.managed_in_class&&!['enrolled','closed','cancelled'].includes(r.status));
    const done=finished(request);
    return `<div class="class-trial-note"><b>${student.left_at?'Học thử · đã dừng':done?'Học thử xong · đang chuyển chính thức':'Học thử · chưa tính phí'}</b>${request?'<br>'+sessions(request).map(s=>esc(s.date)).join(' · '):''}</div>`+
      (request&&canManage()?`<div class="class-trial-actions"><button type="button" class="btn btn-outline btn-sm" onclick="ClassTrials.decide('${request.id}')">${done?'Kết quả học thử':'Quản lý học thử'}</button></div>`:'');
  }
  function openAdd(){openForm();}
  async function stopStudent(studentId){
    const request=(context.requests||[]).find(r=>r.student_id===studentId&&r.managed_in_class&&!['enrolled','closed','cancelled'].includes(r.status));
    if(!request||!canManage()||!confirm('Kết thúc học thử, không chuyển sang học chính thức?'))return;
    const {error}=await(root.sb||sb).rpc('control_class_trial',{p_id:request.id,p_action:'stop',p_date:null,p_schedule:null});
    if(error){alert(error.message);return;}await context.refresh?.();
  }
  function openForm(id){
    if(!canManage()||!uuid(context.classId)||id&&!uuid(id))return;
    frameDialog?.remove();
    frameDialog=document.createElement('dialog');frameDialog.className='class-trial-frame';
    const frame=document.createElement('iframe');frame.title='Học sinh học thử';
    frame.src='trial_requests.html?classTrial='+encodeURIComponent(context.classId)+(id?'&trialId='+encodeURIComponent(id):'');
    frameDialog.append(frame);document.body.append(frameDialog);frameDialog.showModal();
    const openedDialog=frameDialog;
    openedDialog.addEventListener('close',()=>{openedDialog.remove();if(frameDialog===openedDialog)frameDialog=null;});
  }
  root.addEventListener('message',async event=>{
    if(event.origin!==location.origin||event.source!==frameDialog?.querySelector('iframe')?.contentWindow)return;
    if(!['class-trial-saved','class-trial-close'].includes(event.data?.type))return;
    frameDialog.close();
    if(event.data.type==='class-trial-saved')await context.refresh?.();
  });
  function decide(id){
    const request=(context.requests||[]).find(r=>r.id===id);
    if(!request||!canManage())return;
    const dialog=document.createElement('dialog');dialog.className='class-trial-decision';
    const lastDay=sessions(request).map(s=>s.date).sort().at(-1);
    const next=lastDay?new Date(lastDay+'T12:00:00Z'):new Date();next.setUTCDate(next.getUTCDate()+1);
    const min=next.toISOString().slice(0,10);
    dialog.innerHTML=`<header><h3>Quản lý học thử</h3><button type="button" aria-label="Đóng" title="Đóng" data-close>×</button></header><p>${sessions(request).map(s=>esc(s.date)).join(' · ')}</p>
      <p>Tự chuyển chính thức sau buổi học thử cuối · Thu phí từ ${min}</p>
      <form><label>Ngày học thử bổ sung<input name="date" type="date" min="${min}"></label><label>Lịch học<select name="schedule"><option value="">Chọn lịch</option>${(context.schedules||[]).map(s=>`<option value="${Number(s.id)}">Buổi ${Number(s.session_no)||1} · Thứ ${s.weekday===7?'CN':Number(s.weekday)+1} ${esc(s.start_time?.slice(0,5))}–${esc(s.end_time?.slice(0,5))}</option>`).join('')}</select></label>
      <button class="btn btn-outline" name="action" value="extend">Gia hạn học thử</button><button class="btn btn-outline" name="action" value="stop">Không tiếp tục</button><p role="status"></p></form>`;
    document.body.append(dialog);dialog.showModal();
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.target,action=event.submitter?.value;
      const date=action==='extend'?form.elements.date.value:null;
      const schedule=action==='extend'?Number(form.elements.schedule.value):null;
      if(action==='extend'&&(!date||!schedule)){form.querySelector('[role=status]').textContent='Chọn ngày và lịch gia hạn.';return;}
      if(action==='stop'&&!confirm('Kết thúc học thử, không chuyển sang học chính thức?'))return;
      form.querySelectorAll('button').forEach(b=>b.disabled=true);
      let error;
      try{({error}=await(root.sb||sb).rpc('control_class_trial',{p_id:id,p_action:action,p_date:date||null,p_schedule:schedule}));}
      catch(cause){error=cause;}
      if(error){form.querySelector('[role=status]').textContent=error.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);return;}
      dialog.close();await context.refresh?.();
    };
  }
  root.ClassTrials={setContext,canManage,studentActions,openAdd,decide,finished,sessions,stopStudent};
})(globalThis);
