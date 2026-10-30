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
    window._calls=[];window._liveQuestion=liveQuestion;window.AppPermissions={has:()=>true};
    window.sb={
      from(table){let result={data:table==='word_question_imports'?[job]:table==='topics'?[{id:'topic',name:'Vectơ',subjects:{name:'Toán',grades:{name:'10'}}}]:table==='word_question_worker_state'?{last_seen:new Date().toISOString()}:table==='question_bank'?liveQuestion:data,count:1};
        const query={select(){return this},order(){return this},limit(){return Promise.resolve(result)},eq(){return this},maybeSingle(){return Promise.resolve(result)},range(){return Promise.resolve(result)},then(resolve){return Promise.resolve(result).then(resolve)}};return query;},
      rpc(name,args){window._calls.push({name,args});if(name==='review_word_question_import'){data[0].review_status=args.p_approve?'approved':'rejected';Object.assign(liveQuestion,args.p_payload,{hidden:!args.p_approve});}return Promise.resolve({data:'question-id'});},
    };
  });
  await page.addScriptTag({path:path.join(root,'word-question-content.js')});
  await page.addScriptTag({path:path.join(root,'word-question-imports.js')});
  await page.locator('#open').evaluate(b=>b.onclick=()=>window.WordQuestionImports.open());
  await page.getByRole('button',{name:'Nhập Word / Chờ kiểm duyệt'}).click();
  await page.locator('[data-job]').click();
}
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
