(function () {
  let dialog, timer, jobs = [], selected = null, page = 0, busy = false, items = [], requestVersion = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {queued:'Đang chờ laptop',processing:'Đang xử lý',paused:'Tạm dừng',completed:'Đã xử lý xong',failed:'Xử lý lỗi',cancelled:'Đã hủy',pending:'Chưa kiểm duyệt',needs_attention:'Cần kiểm tra',approved:'Đã duyệt',rejected:'Đã bỏ qua'};
  const $ = id => dialog.querySelector('#'+id);
  const client = () => typeof sb !== 'undefined' ? sb : window.sb;
  function status(message, error = false) { $('wiStatus').textContent = message; $('wiStatus').classList.toggle('error', error); }
  async function rpc(name, args) { const result = await client().rpc(name,args); if(result.error) throw result.error; return result.data; }
  async function refresh() {
    const result = await client().from('word_question_imports').select('*').order('created_at',{ascending:false}).limit(30);
    if (result.error) throw result.error;
    jobs = result.data || [];
    $('wiJobs').innerHTML = jobs.length ? jobs.map(j => `<button class="wi-job ${j.id===selected?'active':''}" data-job="${j.id}"><strong>${esc(j.file_name)}</strong><small>${esc(labels[j.status])} · ${Number(j.progress?.saved)||0}/${Number(j.progress?.total)||'—'} câu<br>${Number(j.progress?.converted)||0} công thức đã chuyển</small></button>`).join('') : 'Chưa có đợt nhập Word.';
    const worker = await client().from('word_question_worker_state').select('last_seen').eq('id',1).maybeSingle();
    if (!worker.error && !busy) {
      const online = worker.data && Date.now()-Date.parse(worker.data.last_seen)<90000;
      status(online ? 'Bộ xử lý Word trên laptop đang hoạt động.' : 'Bộ xử lý Word trên laptop chưa kết nối. File đã xếp hàng sẽ chờ đến khi dịch vụ hoạt động.');
    }
    if (selected && !dialog.querySelector('.wi-editor')) await showItems(false);
  }
  async function showItems(reset = true) {
    if (reset) page=0;
    const version = ++requestVersion, id = selected;
    const result = await client().from('word_question_import_items').select('*',{count:'exact'}).eq('job_id',id).order('ordinal').range(page*10,page*10+9);
    if (version !== requestVersion || id !== selected) return;
    if (result.error) throw result.error;
    items = result.data || [];
    const job = jobs.find(j=>j.id===id);
    const active = job && ['queued','processing'].includes(job.status);
    $('wiMain').innerHTML = `<div class="wi-actions"><strong>${esc(labels[job?.status]||'')}</strong>
      ${active?'<button class="wi-button" data-control="pause">Tạm dừng</button>':''}
      ${job&&['paused','failed'].includes(job.status)?'<button class="wi-button" data-control="resume">Tiếp tục</button>':''}
      ${job&&!['completed','cancelled'].includes(job.status)?'<button class="wi-button" data-control="cancel">Hủy đợt nhập</button>':''}
      <button class="wi-button" data-source>File gốc</button></div>
      ${job?.error_message?`<p class="wi-warning">${esc(job.error_message)}</p>`:''}
      ${items.map(i=>`<section class="wi-item"><div class="wi-item-head"><strong>Câu ${i.ordinal} · ${esc(labels[i.review_status])}</strong>${['pending','needs_attention'].includes(i.review_status)?`<button class="wi-button" data-review="${i.ordinal}">Kiểm duyệt</button>`:''}</div><div class="wi-item-summary">${esc(i.payload.question_text.replace(/\[\[W(?:IMG|TABLE):[^\]]+\]\]/g,'[Hình/Bảng]'))}</div><div class="wi-warning">${esc(i.warnings.join('\n'))}</div><div data-editor="${i.ordinal}"></div></section>`).join('')||'<p>Chưa có câu hỏi được lưu trong đợt này.</p>'}
      <div class="wi-actions"><button class="wi-button" data-page="-1" ${page===0?'disabled':''}>Trước</button><span>Trang ${page+1} · ${result.count||0} câu</span><button class="wi-button" data-page="1" ${(page+1)*10>=(result.count||0)?'disabled':''}>Sau</button></div>`;
    const cards=$('wiMain').querySelectorAll('.wi-item');
    items.forEach((item,index)=>{if(item.linked_question_id)cards[index].querySelector('strong').append(item.review_status==='rejected'?' · Đã ẩn trong ngân hàng':' · Đã lưu ngân hàng');});
  }
  async function edit(ordinal) {
    if (dialog.querySelector('.wi-editor')) { status('Hãy hoàn tất hoặc đóng câu đang kiểm duyệt.',true); return; }
    const jobId=selected, item = items.find(i=>i.ordinal===ordinal);
    if(!item)return;
    let q=item.payload;
    if(item.linked_question_id){
      const {data,error}=await client().from('question_bank').select('id,question_type,difficulty,question_text,answer_text,answer,answer_count').eq('id',item.linked_question_id).maybeSingle();
      if(error)throw error;
      if(!data){status('Câu hỏi đã bị xóa khỏi ngân hàng.',true);return;}
      q={...q,...data};
    }
    if(selected!==jobId || !dialog.open || dialog.querySelector('.wi-editor'))return;
    const mount=dialog.querySelector(`[data-editor="${ordinal}"]`);
    if(!mount)return;
    mount.innerHTML=`<form class="wi-editor" data-ordinal="${ordinal}"><div class="wi-editor-meta"><label>Loại câu<select name="question_type">${[['multi_choice','Nhiều lựa chọn'],['true_false','Đúng/Sai'],['short_answer','Trả lời ngắn'],['essay','Tự luận']].map(([v,t])=>`<option value="${v}" ${q.question_type===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Độ khó<input name="difficulty" type="number" min="1" max="10" value="${Number(q.difficulty)||5}" required></label><label>Số đáp án<input name="answer_count" type="number" min="1" max="6" value="${Number(q.answer_count)||1}" required></label></div><label>Nội dung<textarea name="question_text" required>${esc(q.question_text)}</textarea></label><label>Đáp án<input name="answer" value="${esc(q.answer)}"></label><label>Lời giải<textarea name="answer_text">${esc(q.answer_text)}</textarea></label><div class="wi-preview"></div><div class="wi-actions"><button class="wi-button primary" type="submit">Duyệt vào ngân hàng</button><button class="wi-button" type="button" data-reject="${ordinal}">Bỏ qua câu</button><button class="wi-button" type="button" data-close-editor>Đóng</button></div></form>`;
    const form=mount.querySelector('form');
    form.querySelector('[type=submit]').textContent='Lưu và duyệt';
    const rejectButton=form.querySelector('[data-reject]');
    rejectButton.textContent=item.linked_question_id?'Ẩn câu khỏi ngân hàng':'Bỏ qua câu';
    rejectButton.hidden=!!item.linked_question_id&&!window.AppPermissions?.has?.('question.archive',false);
    const previewEl=form.querySelector('.wi-preview');
    form.querySelector('.wi-editor-meta').after(previewEl);
    const preview=()=>{ form.querySelector('.wi-preview').innerHTML=window.WordQuestionContent.render(form.elements.question_text.value); window.MathJax?.typesetPromise?.([form.querySelector('.wi-preview')]).catch(()=>{}); };
    form.elements.question_text.addEventListener('input',preview); preview();
  }
  async function review(form, approve) {
    if (busy) return;
    busy=true;
    const payload=Object.fromEntries(new FormData(form));
    payload.difficulty=Number(payload.difficulty); payload.answer_count=Number(payload.answer_count);
    form.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      await rpc('review_word_question_import',{p_job:selected,p_ordinal:Number(form.dataset.ordinal),p_payload:payload,p_approve:approve});
      form.remove(); await showItems(false); window.loadQuestions?.(); status(approve?'Đã cập nhật và kiểm duyệt câu hỏi trong ngân hàng.':'Đã loại câu hỏi khỏi danh sách sử dụng.');
    } catch(e){status(e.message,true);} finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function enqueue(event) {
    event.preventDefault(); if(busy)return;
    if(!window.AppPermissions?.has?.('question.create',false)){status('Bạn chưa có quyền tạo câu hỏi trong ngân hàng.',true);return;}
    const file=$('wiFile').files[0], topic=$('wiTopic').value;
    if(!file||!topic){status('Chọn chủ đề và file Word trước.',true);return;}
    if(!/\.docx$/i.test(file.name)||file.size>20*1024*1024){status('Chỉ nhận DOCX tối đa 20 MB.',true);return;}
    busy=true;$('wiUpload').disabled=true;status('Đang tải file lên…');
    try{
      const {data,error}=await client().auth.getUser();if(error||!data?.user)throw new Error('Cần đăng nhập lại.');
      const id=crypto.randomUUID(),path=`${data.user.id}/${id}/source.docx`;
      const upload=await client().storage.from('word-question-sources').upload(path,file,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false});
      if(upload.error)throw upload.error;
      await rpc('enqueue_word_question_import',{p_id:id,p_topic:topic,p_file_name:file.name});
      selected=id;$('wiFile').value='';await refresh();await showItems();status('Đã xếp hàng. Câu hỏi xử lý xong sẽ lưu thẳng vào ngân hàng, dùng được ngay và chờ kiểm duyệt sau.');
    }catch(e){status(e.message,true);}finally{busy=false;$('wiUpload').disabled=false;}
  }
  async function open() {
    if(!window.AppPermissions?.has?.('question.import',false)){alert('Bạn không có quyền nhập câu hỏi.');return;}
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='wordImportsDialog';
      dialog.innerHTML='<header class="wi-header"><h3>Nhập Word và kiểm duyệt câu hỏi</h3><button class="wi-icon" type="button" aria-label="Đóng" title="Đóng" data-close>×</button></header><form class="wi-toolbar" id="wiForm"><label>Khối · Môn · Chủ đề<select id="wiTopic" required><option value="">Chọn chủ đề</option></select></label><label>File Word<input id="wiFile" type="file" accept=".docx" required></label><button class="wi-button primary" id="wiUpload" type="submit">Xếp hàng xử lý</button><button class="wi-button" type="button" data-refresh>Tải lại</button></form><div id="wiStatus" class="wi-status" role="status"></div><div class="wi-layout"><aside class="wi-jobs" id="wiJobs"></aside><main class="wi-main" id="wiMain">Chọn đợt nhập để xem các câu chờ kiểm duyệt.</main></div>';
      document.body.append(dialog);
      $('wiForm').addEventListener('submit',enqueue);
      dialog.addEventListener('close',()=>{clearInterval(timer);window.loadQuestions?.();});
      dialog.addEventListener('submit',e=>{if(e.target.matches('.wi-editor')){e.preventDefault();review(e.target,true);}});
      dialog.addEventListener('click',async e=>{
        const b=e.target.closest('button');if(!b)return;
        try{
          if(b.hasAttribute('data-close'))dialog.close();
          if(b.hasAttribute('data-refresh'))await refresh();
          if(b.dataset.job){selected=b.dataset.job;await showItems();await refresh();}
          if(b.dataset.review)await edit(Number(b.dataset.review));
          if(b.hasAttribute('data-close-editor'))b.closest('form').remove();
          if(b.dataset.reject){if(!confirm('Loại câu này khỏi danh sách sử dụng? Câu đã lưu trong ngân hàng sẽ được ẩn, không xóa khỏi các đề đã tạo.'))return;await review(b.closest('form'),false);}
          if(b.dataset.control){if(b.dataset.control==='cancel'&&!confirm('Hủy phần chưa xử lý? Các câu đã lưu vẫn được giữ.'))return;await rpc('control_word_question_import',{p_id:selected,p_action:b.dataset.control});await refresh();}
          if(b.dataset.page){page+=Number(b.dataset.page);await showItems(false);}
          if(b.hasAttribute('data-source')){const j=jobs.find(j=>j.id===selected);const {data,error}=await client().storage.from('word-question-sources').createSignedUrl(j.source_path,300);if(error)throw error;window.open(data.signedUrl,'_blank','noopener');}
        }catch(err){status(err.message,true);}
      });
    }
    if(!dialog.open)dialog.showModal();
    try{
      if($('wiTopic').options.length===1){const {data,error}=await client().from('topics').select('id,name,subjects(name,grades(name))').order('name');if(error)throw error;
        for(const t of data||[])$('wiTopic').add(new Option(`${t.subjects?.grades?.name||''} · ${t.subjects?.name||''} · ${t.name}`,t.id));}
      await refresh();clearInterval(timer);timer=setInterval(()=>refresh().catch(e=>status(e.message,true)),10000);
    }catch(e){status('Chưa mở được nhập Word: '+e.message,true);}
  }
  window.WordQuestionImports={open};
})();
