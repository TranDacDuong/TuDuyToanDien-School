(function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let overlay, classId, data, busy=false, previousFocus;
  const rpc=async(name,args)=>{const {data,error}=await window.sb.rpc(name,args);if(error)throw new Error(error.message);return data;};
  const message=text=>{overlay.querySelector('[role="status"]').textContent=text;};
  function close(){if(busy)return;overlay.hidden=true;previousFocus?.focus();}
  function build(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.className='makeup-dialog';overlay.hidden=true;
    overlay.innerHTML='<section class="makeup-panel" role="dialog" aria-modal="true" aria-labelledby="makeupTitle"><header><h2 id="makeupTitle">Học bù qua video</h2><button type="button" aria-label="Đóng">×</button></header><p role="status" aria-live="polite"></p><div id="makeupBody"></div></section>';
    document.body.append(overlay);overlay.querySelector('header button').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape')close();
      if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input,select,a')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
  }
  async function reload(){data=await rpc('makeup_class_data',{p_class:classId});render();}
  function render(){
    overlay.querySelector('#makeupBody').innerHTML=`<form class="makeup-form"><label>Học sinh / Buổi vắng<select id="makeupAbsence" required><option value="">Chọn buổi vắng</option>${data.absences.map((a,i)=>`<option value="${i}">${esc(a.student_name)} · ${esc(a.study_date)}</option>`).join('')}</select></label><label>Chủ đề bài kiểm tra<select id="makeupTopic" required><option value="">Chọn chủ đề</option>${data.topics.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label><label>Người kiểm tra vở<select id="makeupReviewer" required>${data.reviewers.map(u=>`<option value="${esc(u.id)}">${esc(u.full_name)}</option>`).join('')}</select></label><button class="primary" type="submit">Tạo bài 10 câu & lấy link</button></form><div id="makeupLink"></div><h3>Bài học bù đã giao</h3>${data.assignments.length?data.assignments.map(a=>`<article class="makeup-row" data-id="${esc(a.id)}"><div><strong>${esc(a.student_name)}</strong><div>Buổi ${esc(a.study_date)} · ${a.score===null?'Chưa nộp':esc(a.score)+'/10'}${a.completed_at?' · Học bù':''}${a.revoked_at?' · Link đã thu hồi':''}</div><small>${a.attempts}/3 lượt · Link đến ${esc(new Date(a.expires_at).toLocaleDateString('vi-VN'))}</small></div><div class="makeup-actions">${!a.completed_at?'<button data-action="renew" type="button">Cấp lại link</button>':''}<button data-action="photos" type="button">Xem bài nộp</button><button data-action="revoke" type="button">Thu hồi link</button></div></article>`).join(''):'<p>Chưa giao bài học bù.</p>'}<div id="makeupPhotos"></div>`;
    overlay.querySelector('form').onsubmit=create;
    overlay.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>control(button));
  }
  function showLink(token){
    const wrap=overlay.querySelector('#makeupLink');wrap.innerHTML='<label>Link riêng của học sinh<input readonly aria-label="Link học bù"></label><button type="button">Sao chép link</button>';
    const url=new URL('hoc-bu.html',location.href);url.hash=token;wrap.querySelector('input').value=url.href;
    wrap.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);message('Đã sao chép link.');}catch(_){wrap.querySelector('input').select();message('Chọn và sao chép link trong ô.');}};
    wrap.querySelector('input').focus();
  }
  async function create(event){
    event.preventDefault();if(busy)return;const form=event.currentTarget;
    const a=data.absences[form.querySelector('#makeupAbsence').value];if(!a)return;
    busy=true;const button=form.querySelector('button');button.disabled=true;message('Đang tạo bài học bù…');
    try{const result=await rpc('create_makeup_learning',{p_class:classId,p_student:a.student_id,p_date:a.study_date,p_topic:form.querySelector('#makeupTopic').value,p_reviewer:form.querySelector('#makeupReviewer').value});await reload();showLink(result.token);message('Đã tạo bài 10 câu. Link có hiệu lực 14 ngày.');}
    catch(error){message(error.message);}finally{busy=false;button.disabled=false;}
  }
  async function control(button){
    if(busy)return;const id=button.closest('[data-id]').dataset.id;const action=button.dataset.action;
    if(action==='photos'){
      const a=data.assignments.find(a=>a.id===id),target=overlay.querySelector('#makeupPhotos');target.innerHTML='';
      try{
        const heading=document.createElement('h3');heading.textContent=`${a.student_name} · ${a.study_date} · ${a.score===null?'Chưa nộp':a.score+'/10'}`;target.append(heading);
        const grid=document.createElement('div');grid.className='makeup-photos';target.append(grid);
        for(const path of a.notebook_paths){const {data:photo,error}=await window.sb.storage.from('makeup-notebooks').createSignedUrl(path,300);if(error)throw error;const img=document.createElement('img');img.src=photo.signedUrl;img.alt='Vở học bù';grid.append(img);}
        if(!a.notebook_paths.length)grid.textContent='Chưa có ảnh vở.';
        const detail=document.createElement('div');detail.innerHTML=a.questions.map((q,i)=>`<p><strong>Câu ${i+1}: ${esc(a.answers?.[q.id]||'—')}</strong><br>${window.WordQuestionContent?.render(q.text)||esc(q.text)}</p>`).join('');target.append(detail);
        window.MathJax?.typesetPromise?.([detail]).catch(()=>{});target.scrollIntoView({block:'start',behavior:'smooth'});
      }catch(error){message(error.message);}return;
    }
    if(!confirm(action==='renew'?'Cấp link mới? Link cũ sẽ không dùng được nữa.':'Thu hồi link học bù này?'))return;
    busy=true;button.disabled=true;
    try{const result=await rpc('control_makeup_link',{p_id:id,p_action:action});await reload();if(result.token)showLink(result.token);message(action==='renew'?'Đã cấp lại link.':'Đã thu hồi link.');}
    catch(error){message(error.message);}finally{busy=false;button.disabled=false;}
  }
  window.MakeupLearning={open:async id=>{build();previousFocus=document.activeElement;classId=id;overlay.hidden=false;overlay.querySelector('header button').focus();message('Đang tải…');try{await reload();message('');const selected=new URLSearchParams(location.search).get('makeup');if(selected)overlay.querySelector(`[data-id="${CSS.escape(selected)}"] [data-action="photos"]`)?.click();}catch(error){message(/function.*does not exist|schema cache/i.test(error.message)?'Chưa cập nhật dữ liệu học bù. Cần triển khai SQL makeup learning links.sql.':error.message);}}};
})();
