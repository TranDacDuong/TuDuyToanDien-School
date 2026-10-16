const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {chromium}=require('@playwright/test');
test('family sidebar loads lazily, preserves note drafts and fits desktop/mobile',async t=>{
  const source=fs.readFileSync('messages.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const setup=`<script>
    var activeFriend={id:'parent',name:'PH thử nghiệm',role:'parent',avatar:'favicon.png',children:[{id:'student',name:'Học sinh thử nghiệm'}]};
    var friendMap=new Map(),parentInboxById=new Map(),loadedMessages=[];
    function filterFriends(){} function parseMessageContent(){return {type:'text'}}
    window.getConversationFamilyViewer=()=>({id:'admin',role:'admin',full_name:'Admin'});
    window.familyCalls=[];window.testMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
    var sample={parent:{id:'parent',name:'Phụ huynh thử nghiệm',phone:'0900000000',linked:true},students:[{
      id:'student',name:'Học sinh thử nghiệm',birth_year:2010,school:'Trường thử nghiệm',province:'Hà Nội',
      classes:[{id:'c1',class_name:'Toán 10',joined_at:'2020-01-01',teachers:[{name:'Giáo viên thử nghiệm'}],schedules:[]}],
      attendance:[{class_id:'c1',date:window.testMonth+'-05',status:'absent'}],scores:[{title:'Kiểm tra tháng',score:8,max_score:10,test_date:window.testMonth+'-01'}],
      evaluations:[],notes:[],trials:[],upcoming:[],finance:{classes:[],classStudents:[],payments:[{student_id:'student',month:window.testMonth+'-01',amount_due:1000000,amount_paid:400000}],discountRules:[]}
    },{id:'second',name:'Học sinh thứ hai',classes:[],attendance:[],scores:[],evaluations:[],notes:[],finance:null}]};
    window.sb={rpc:(name,args)=>{window.familyCalls.push({name,args});let data;
      if(name==='get_mindup_family_info' && args.p_parent==='slow') {
        const waiting=new Promise(resolve=>window.finishSlowFamily=resolve);waiting.abortSignal=()=>waiting;return waiting;
      }
      if(name==='get_mindup_family_info') {data=structuredClone(sample);if(args.p_parent==='new') data.parent.name='Phụ huynh mới';}
      if(name==='add_mindup_family_note') data=args.p_id;
      if(name==='prepare_tuition_detail_bundle') data={remaining:600000,memo:'SEVQR HP TEST',debts:[{month:window.testMonth+'-01',remaining:600000}]};
      const result=Promise.resolve({data,error:null});result.abortSignal=()=>result;return result;
    }};
  </script><script src="tuition-discounts.js"></script><script src="tuition-calculation.js"></script><script src="conversation-family-model.js"></script><script src="conversation-family-info.js"></script><script src="messages-workspace.js"></script>`;
  const html=source.replace('</body>',setup+'</body>');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/preview') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
    if(!/^\/(messages-workspace\.(js|css)|conversation-family-(model|info)\.js|tuition-(calculation|discounts)\.js|theme\.css|favicon\.png|default-avatar\.png)$/.test(pathname)) {res.statusCode=404;return res.end();}
    const file=path.join(process.cwd(),pathname.slice(1));res.setHeader('Content-Type',path.extname(file)==='.css'?'text/css':path.extname(file)==='.js'?'application/javascript':'image/png');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());await page.goto(`http://127.0.0.1:${server.address().port}/preview`);
  assert.equal(await page.evaluate(()=>familyCalls.length),0);
  await page.getByRole('button',{name:'Thông tin hội thoại',exact:true}).click();
  await page.getByText('Trường thử nghiệm',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>familyCalls.filter(c=>c.name==='get_mindup_family_info').length),1);
  await page.getByRole('textbox',{name:'Ghi chú nội bộ về Học sinh thử nghiệm',exact:true}).fill('Bản nháp nội bộ');
  await page.evaluate(()=>{refreshMessageWorkspace();refreshMessageWorkspace();});
  assert.equal(await page.getByRole('textbox',{name:'Ghi chú nội bộ về Học sinh thử nghiệm',exact:true}).inputValue(),'Bản nháp nội bộ');
  assert.equal(await page.evaluate(()=>familyCalls.filter(c=>c.name==='get_mindup_family_info').length),1);
  await page.locator('.family-controls input').fill('2020-10');
  await page.getByRole('textbox',{name:'Ghi chú nội bộ về Học sinh thử nghiệm',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Ghi chú nội bộ về Học sinh thử nghiệm',exact:true}).inputValue(),'Bản nháp nội bộ');
  await page.locator('.family-controls input').fill(await page.evaluate(()=>testMonth));
  await page.getByRole('button',{name:'Xem QR tổng công nợ',exact:true}).waitFor();
  await page.getByRole('button',{name:'Lưu ghi chú',exact:true}).first().click();await page.getByText('Đã lưu ghi chú',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>familyCalls.filter(c=>c.name==='add_mindup_family_note').length),1);
  await page.getByRole('button',{name:'Xem QR tổng công nợ',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').getByText('600.000đ',{exact:true}).count(),2);
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
  await page.locator('#conversationInfo').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'scratch/family-info-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'scratch/family-info-mobile.png'});
  const box=await page.locator('#conversationInfo').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390);
  assert.equal(await page.locator('#conversationInfo').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.evaluate(()=>{activeFriend={id:'slow',name:'Slow',role:'parent'};refreshMessageWorkspace();});
  await page.evaluate(()=>{activeFriend={id:'new',name:'New',role:'parent'};refreshMessageWorkspace();});
  await page.getByText('Phụ huynh mới',{exact:true}).waitFor();
  await page.evaluate(()=>finishSlowFamily({data:{parent:{name:'Private old parent'},students:[]},error:null}));
  assert.equal(await page.getByText('Private old parent',{exact:true}).count(),0);
  await page.evaluate(()=>{activeFriend={id:'unlinked',name:'Zalo chưa liên kết',isZaloExternal:true,role:'zalo_external'};refreshMessageWorkspace();});
  await page.getByText('Chưa liên kết hồ sơ phụ huynh.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:/Ghi chú nội bộ về/}).count(),0);
  assert.equal(await page.evaluate(()=>familyCalls.some(c=>/send|enqueue/i.test(c.name))),false);
  assert.deepEqual(errors,[]);
});
