const {test,expect}=require('@playwright/test');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
async function setup(page){
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h2>Ngân hàng câu hỏi</h2><button id="open">Nhập Word / Chờ kiểm duyệt</button></body></html>');
  await page.addStyleTag({path:path.join(root,'word-question-imports.css')});
  await page.evaluate(()=>{
    const job={id:'00000000-0000-4000-8000-000000000000',file_name:'Mẫu tài liệu sách.docx',status:'completed',progress:{saved:22,total:22,converted:128}};
    const table=btoa(JSON.stringify([[{text:'x',colspan:1,rowspan:1},{text:'$\\frac{1}{2}$',colspan:1,rowspan:1}]]));
    const data=[{job_id:job.id,ordinal:1,review_status:'needs_attention',warnings:['Kiểm tra công thức và đáp án trước khi duyệt.'],payload:{question_text:'Cho tam giác $ABC$.\nA. $\\vec{AB}+\\vec{BC}=\\vec{AC}$\nB. 2\nC. 3\nD. 4\n[[WTABLE:'+table+']]',question_type:'multi_choice',answer:'B',answer_count:4,difficulty:5}}];
    data[0].linked_question_id='question-id';
    const liveQuestion={...data[0].payload,id:'question-id',answer:'C'};
    const jobs=[job];
    const catalog={
      grades:[{id:'g11',name:'11'},{id:'g2',name:'2'},{id:'g10',name:'10'},{id:'g12',name:'12'}],
      subjects:[{id:'math10',grade_id:'g10',name:'Toán'},{id:'physics10',grade_id:'g10',name:'Vật lý'},{id:'math11',grade_id:'g11',name:'Toán'},{id:'chemistry11',grade_id:'g11',name:'Hóa học'}],
      topics:[{id:'topic',subject_id:'math10',name:'Vectơ'},{id:'physics-topic',subject_id:'physics10',name:'Chuyển động'},{id:'topic11',subject_id:'math11',name:'Vectơ'}]
    };
    window._calls=[];window._uploads=[];window._liveQuestion=liveQuestion;window.AppPermissions={has:()=>true};
    if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-000000000001';
    window.sb={
      auth:{getUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000002'}}})},
      storage:{from:bucket=>({upload:async(path,file)=>{window._uploads.push({bucket,path,name:file.name});return {data:{path}}}})},
      from(table){let result={data:table==='word_question_imports'?jobs:catalog[table]|| (table==='word_question_worker_state'?{last_seen:new Date().toISOString()}:table==='question_bank'?liveQuestion:data),count:1};
        const query={select(){return this},order(){return this},limit(){return Promise.resolve(result)},eq(column,value){if(table==='word_question_import_items'&&column==='job_id'){result.data=data.filter(i=>i.job_id===value);result.count=result.data.length;}return this},maybeSingle(){return Promise.resolve(result)},range(){return Promise.resolve(result)},then(resolve){return Promise.resolve(result).then(resolve)}};return query;},
      rpc(name,args){window._calls.push({name,args});if(name==='review_word_question_import'){data[0].review_status=args.p_approve?'approved':'rejected';Object.assign(liveQuestion,args.p_payload,{hidden:!args.p_approve});}if(name==='enqueue_word_question_import')jobs.unshift({id:args.p_id,file_name:args.p_file_name,status:'queued',progress:{}});return Promise.resolve({data:'question-id'});},
    };
  });
  await page.addScriptTag({path:path.join(root,'word-question-content.js')});
  await page.addScriptTag({path:path.join(root,'word-question-imports.js')});
  await page.locator('#open').evaluate(b=>b.onclick=()=>window.WordQuestionImports.open());
  await page.getByRole('button',{name:'Nhập Word / Chờ kiểm duyệt'}).click();
  await page.locator('[data-job]').click();
}

test('Word classification follows grade, subject, topic and clears stale selections',async({page})=>{
  await setup(page);
  const grade=page.locator('#wiGrade'),subject=page.locator('#wiSubject'),topic=page.locator('#wiTopic');
  await expect(subject).toBeDisabled();await expect(topic).toBeDisabled();
  expect(await grade.locator('option').evaluateAll(rows=>rows.map(r=>r.value))).toEqual(['','g2','g10','g11','g12']);
  await grade.selectOption('g10');await expect(subject).toBeEnabled();await expect(topic).toBeDisabled();
  expect(await subject.locator('option').evaluateAll(rows=>rows.map(r=>r.value))).toEqual(['','math10','physics10']);
  await subject.selectOption('math10');await topic.selectOption('topic');
  await subject.selectOption('physics10');await expect(topic).toHaveValue('');
  expect(await topic.locator('option').evaluateAll(rows=>rows.map(r=>r.value))).toEqual(['','physics-topic']);
  await topic.selectOption('physics-topic');await grade.selectOption('g11');
  await expect(subject).toHaveValue('');await expect(topic).toHaveValue('');await expect(topic).toBeDisabled();
  await subject.selectOption('math11');
  expect(await topic.locator('option').evaluateAll(rows=>rows.map(r=>r.value))).toEqual(['','topic11']);
  await grade.selectOption('g12');await expect(subject).toBeDisabled();await expect(topic).toBeDisabled();
  await grade.selectOption('g11');await subject.selectOption('chemistry11');await expect(topic).toBeDisabled();
  await expect(topic).toHaveValue('');expect(await page.evaluate(()=>window._calls)).toHaveLength(0);
});

test('Word enqueue uses only the chosen topic and rejects a topic from another subject',async({page})=>{
  await setup(page);
  await page.locator('#wiGrade').selectOption('g11');await page.locator('#wiSubject').selectOption('math11');
  await page.locator('#wiTopic').evaluate(el=>{el.add(new Option('Stale topic','topic'));el.value='topic';});
  await page.locator('#wiFile').setInputFiles({name:'questions.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('mock DOCX')});
  await page.getByRole('button',{name:'Xếp hàng xử lý',exact:true}).click();
  await expect(page.locator('#wiStatus')).toContainText('Chọn đủ Khối, Môn, Chủ đề');
  expect(await page.evaluate(()=>window._uploads)).toHaveLength(0);
  await page.locator('#wiTopic').selectOption('topic11');
  await page.getByRole('button',{name:'Xếp hàng xử lý',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window._calls.filter(c=>c.name==='enqueue_word_question_import').length)).toBe(1);
  const call=await page.evaluate(()=>window._calls.find(c=>c.name==='enqueue_word_question_import'));
  expect(call.args.p_topic).toBe('topic11');expect(call.args.p_file_name).toBe('questions.docx');
});
test('already published Word questions stay reviewable and use the latest bank content',async({page})=>{
  await setup(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>window._calls)).toHaveLength(0);
  await page.getByRole('button',{name:'Kiểm duyệt',exact:true}).click();
  await expect(page.locator('[name="answer"]')).toHaveValue('C');
  await expect(page.locator('.wi-preview table td')).toHaveCount(2);
  await page.locator('[name="answer"]').fill('A');
  await page.getByRole('button',{name:'Lưu và duyệt',exact:true}).click();
  await expect(page.locator('.wi-item-head')).toContainText('Đã duyệt');
  const calls=await page.evaluate(()=>window._calls);
  expect(calls).toHaveLength(1);expect(calls[0].args.p_payload.answer).toBe('A');expect(calls[0].args.p_approve).toBe(true);
});

test('rejecting an imported bank question asks before hiding it',async({page})=>{
  await setup(page);await expect(page.locator('.wi-item-head')).toContainText('Đã lưu ngân hàng');
  await page.getByRole('button',{name:'Kiểm duyệt',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ẩn câu khỏi ngân hàng',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window._liveQuestion.hidden)).toBe(true);
  await expect(page.locator('.wi-item-head')).toContainText('Đã ẩn trong ngân hàng');
});
test('review popup fits desktop and mobile without horizontal overflow',async({page})=>{
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await setup(page);
    await page.getByRole('button',{name:'Kiểm duyệt',exact:true}).click();
    const layout=await page.getByRole('dialog').evaluate(d=>({width:d.getBoundingClientRect().width,viewport:innerWidth,height:d.getBoundingClientRect().height,viewportHeight:innerHeight}));
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight);
    expect(await page.locator('.wi-main').evaluate(el=>el.clientHeight)).toBeGreaterThan(80);
    await page.screenshot({path:path.join(root,'test-results',`word-import-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Đóng',exact:true}).first().click();
  }
});
test('late-loaded question content expands on exam surfaces, not in edit fields',async({page})=>{
  await page.setContent('<main id="question"></main><textarea id="editor"></textarea>');
  await page.addScriptTag({path:path.join(root,'word-question-content.js')});
  await page.evaluate(()=>{
    const t='[[WTABLE:'+btoa(JSON.stringify([[{text:'Dữ liệu'.normalize('NFD').replace(/[\u0300-\u036f]/g,''),colspan:1,rowspan:1}]]))+']]';
    document.querySelector('#question').textContent=t;document.querySelector('#editor').value=t;
  });
  await expect(page.locator('#question table')).toHaveCount(1);expect(await page.locator('#editor').inputValue()).toContain('[[WTABLE:');
});
