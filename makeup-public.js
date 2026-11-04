(function () {
  const token = location.hash.slice(1);
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status = text => { byId('status').textContent = text; };
  let client, model, answers = {}, paths = [], busy = false, draftTimer;
  const localKey = 'makeup-draft:' + token;
  const rpc = async (name, params) => {
    const {data,error} = await client.rpc(name, params);
    if (error) throw new Error(error.message);
    return data;
  };
  function remember() {
    try { sessionStorage.setItem(localKey, JSON.stringify({answers,paths})); } catch (_) {}
  }
  async function saveDraft() {
    if(busy||model?.completed)return;
    try { await rpc('save_makeup_draft',{p_token:token,p_answers:answers}); if(!busy&&!model?.completed)status('Đã lưu bài đang làm.'); }
    catch (_) { if(!busy&&!model?.completed)status('Chưa lưu được lên hệ thống. Bài đang làm được giữ trong tab này; hãy kiểm tra mạng.'); }
  }
  async function init() {
    if (!/^[a-f0-9]{64}$/.test(token)) { status('Link học bù không hợp lệ. Hãy mở đầy đủ link giáo viên đã gửi.'); return; }
    client = window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{'x-makeup-token':token}}
    });
    try {
      model = await rpc('get_makeup_learning',{p_token:token});
      answers = model.draft_answers || {};
      try { const saved=JSON.parse(sessionStorage.getItem(localKey)||'null'); if(saved){answers=saved.answers||answers;paths=Array.isArray(saved.paths)?saved.paths:[];} } catch (_) {}
      byId('identity').textContent = `${model.student_name} · ${model.class_name} · Buổi ${model.study_date}`;
      byId('questions').innerHTML = model.questions.map((q,i)=>`<fieldset class="makeup-question"><legend>Câu ${i+1}</legend><div class="stem">${window.WordQuestionContent.render(q.text)}</div>${/^https:\/\//.test(q.image||'')?`<img src="${esc(q.image)}" alt="Hình câu ${i+1}">`:''}<div class="makeup-options">${Array.from({length:q.answer_count},(_,n)=>String.fromCharCode(65+n)).map(letter=>`<label><input type="radio" name="${esc(q.id)}" value="${letter}" ${answers[q.id]===letter?'checked':''}>${letter}</label>`).join('')}</div></fieldset>`).join('');
      byId('makeupTest').hidden = !!model.completed || model.attempts>=3;
      if(model.completed){byId('result').textContent=`${model.score}/10 · Đã hoàn thành học bù`;status('Đã ghi nhận kết quả và điểm danh Học bù.');}
      else if(model.attempts>=3) status(`Điểm gần nhất: ${model.score}/10. Đã hết 3 lượt, hãy liên hệ giáo viên.`);
      else status(`Cần nộp ảnh vở và đạt ít nhất 7/10. Còn ${3-model.attempts} lượt làm bài.`);
      byId('uploads').textContent=paths.length?`Đã tải lên ${paths.length} ảnh vở trong tab này.`:'';
      window.MathJax?.typesetPromise?.([byId('questions')]).catch(()=>{});
    } catch(error){status(error.message);}
  }
  byId('questions').addEventListener('change',event=>{
    if(event.target.type!=='radio')return;
    answers[event.target.name]=event.target.value;remember();clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,800);
  });
  byId('makeupTest').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(model.questions.some(q=>!answers[q.id])){status('Hãy trả lời đủ 10 câu trước khi nộp.');return;}
    const files=[...byId('notebooks').files];
    if((!files.length&&!paths.length)||files.length>5||files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5242880)){
      status('Cần 1–5 ảnh vở JPG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB.');return;
    }
    busy=true;byId('submit').disabled=true;byId('makeupTest').querySelectorAll('input').forEach(input=>input.disabled=true);clearTimeout(draftTimer);
    try {
      if(files.length){
        paths=[];
        for(const file of files){
          status(`Đang tải ảnh ${paths.length+1}/${files.length}…`);
          const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
          const path=model.upload_prefix+'/'+crypto.randomUUID()+'.'+ext;
          const {error}=await client.storage.from('makeup-notebooks').upload(path,file,{contentType:file.type,upsert:false});
          if(error)throw new Error('Chưa tải được ảnh vở: '+error.message);
          paths.push(path);remember();
        }
        byId('notebooks').value='';
      }
      status('Đang chấm bài và ghi nhận…');
      const result=await rpc('submit_makeup_learning',{p_token:token,p_answers:answers,p_paths:paths});
      model.attempts=result.attempts;model.completed=result.completed;
      byId('result').textContent=`${result.score}/10${result.completed?' · Đã hoàn thành học bù':''}`;
      if(result.completed){byId('makeupTest').hidden=true;status('Đã ghi nhận điểm danh Học bù.');try{sessionStorage.removeItem(localKey);}catch(_){}}
      else if(result.attempts>=3){byId('makeupTest').hidden=true;status('Đã hết lượt làm bài. Hãy liên hệ giáo viên để được hỗ trợ.');}
      else status(`Chưa đạt 7/10. Em có thể xem lại bài và làm lại; còn ${3-result.attempts} lượt.`);
    } catch(error){status(error.message);}
    finally{busy=false;byId('submit').disabled=false;byId('makeupTest').querySelectorAll('input').forEach(input=>input.disabled=false);}
  });
  init();
})();
