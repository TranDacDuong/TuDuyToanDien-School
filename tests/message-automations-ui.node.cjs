const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('@playwright/test');
test('automation editor previews, groups, validates, schedules and fits desktop/mobile without real sends',async t=>{
 const source=fs.readFileSync('message-automations.html','utf8').replace(/<script src="https:[^>]+><\/script>/,'').replace(/<script src="supabaseClient.js"[^>]*><\/script>/,'');
 const stub=`<script>
 window.calls=[];window.campaigns=[];
 const targets=[{parent_id:'p1',parent_name:'PH thử nghiệm',students:'An và Bình',classes:'Toán 10',linked:true},{parent_id:'p2',parent_name:'PH chưa liên kết',students:'Chi',classes:'Lý 10',linked:false}];
 window.sb={rpc:(name,args={})=>{calls.push({name,args});let data;
 if(name==='message_automation_console')data={campaigns:window.campaigns,classes:[{id:'c1',name:'Toán 10'},{id:'c2',name:'Lý 10'}],system_admin:true};
 if(name==='preview_message_campaign')data=targets.filter(r=>(!args.p_class_ids.length||args.p_class_ids.includes(r.parent_id==='p1'?'c1':'c2'))&&(!args.p_parent_ids.length||args.p_parent_ids.includes(r.parent_id))&&!args.p_excluded_ids.includes(r.parent_id)).map(r=>({...r,content:args.p_template.replaceAll('[Ten_hoc_sinh]',r.students).replaceAll('[Ten_phu_huynh]',r.parent_name)}));
 if(name==='save_message_campaign'){window.campaigns=[{id:args.p_id,name:args.p_name,template:args.p_template,author:'Admin',send_at:args.p_send_at,recurrence:args.p_recurrence,window_hours:args.p_window_hours,class_ids:args.p_class_ids,parent_ids:args.p_parent_ids,excluded_ids:args.p_excluded_ids,state:'draft',total:0,sent:0,failed:0}];data=args.p_id;}
 if(name==='control_message_campaign'){campaigns[0].state=args.p_action==='publish'?'scheduled':args.p_action==='pause'?'paused':args.p_action==='cancel'?'cancelled':'scheduled';data={success:true};}
 if(name==='message_automation_systems')data={admin:true,tuition:{paused:false,template:'Học phí {TenHS}'},templates:[{id:'session_evaluation_notice',name:'Đánh giá buổi học',content:'Keep {{message}}',is_enabled:true}],history:[]};
 if(name==='message_campaign_details')data={recipients:[{parent:'PH thử nghiệm',content:'Hello An và Bình',scheduled_at:new Date().toISOString(),status:'uncertain',error:'Chưa xác nhận từ Zalo'}],runs:[]};
 return Promise.resolve({data,error:null});}};
 </script>`;
 const html=source.replace('<script src="message-automations.js',stub+'<script src="message-automations.js');
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1);
 if(file==='preview'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(!['message-automations.js','message-automations.css'].includes(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1365,height:950},timezoneId:'America/New_York'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(`http://127.0.0.1:${server.address().port}/preview`);
 await page.getByRole('button',{name:'Tạo tin nhắn',exact:true}).click();await page.getByText('2 phụ huynh đã chọn · 1 đã liên kết Zalo',{exact:true}).waitFor();
 assert.match(await page.locator('#previewText').innerText(),/An và Bình/);
 assert.equal(await page.evaluate(()=>calls.some(c=>/save|control/.test(c.name))),false);
 await page.getByLabel('Tên đợt gửi',{exact:true}).fill('Chúc mừng 20/10');await page.locator('#sendAt').fill('2030-10-20T08:00');
 await page.locator('#template').fill('Kính gửi ');await page.locator('#variable').selectOption('Ten_phu_huynh');assert.equal(await page.locator('#template').inputValue(),'Kính gửi [Ten_phu_huynh]');
 await page.locator('#template').fill('Chúc mẹ của [Ten_hoc_sinh] một ngày hạnh phúc.');
 await page.screenshot({path:'scratch/message-automations-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 const dialog=await page.locator('#editor').boundingBox();assert.ok(dialog.x>=0&&dialog.width+dialog.x<=390);
 assert.ok(await page.locator('#editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.screenshot({path:'scratch/message-automations-mobile.png'});
 await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await page.getByText('Đã lưu bản nháp.',{exact:true}).waitFor();
 const saved=await page.evaluate(()=>calls.find(c=>c.name==='save_message_campaign').args);assert.equal(saved.p_send_at,'2030-10-20T01:00:00.000Z');
 await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();await page.getByText('2 phụ huynh đã chọn · 1 đã liên kết Zalo',{exact:true}).waitFor();
 await page.getByRole('checkbox',{name:/^PH chưa liên kết/}).uncheck();
 await page.getByRole('button',{name:'Xem trước & lên lịch',exact:true}).click();await page.getByText('Đã lên lịch gửi.',{exact:true}).waitFor();
 const lastSave=await page.evaluate(()=>calls.filter(c=>c.name==='save_message_campaign').at(-1).args);assert.deepEqual(lastSave.p_parent_ids,['p1']);assert.equal(lastSave.p_id,saved.p_id);
 await page.getByRole('button',{name:'Chi tiết',exact:true}).click();await page.getByText('Chưa xác nhận từ Zalo',{exact:true}).waitFor();await page.locator('#details [data-close]').click();
 await page.getByRole('button',{name:'Thông báo hệ thống',exact:true}).click();await page.getByText('Nhắc nộp học phí',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cài đặt',exact:true}).last().click();assert.equal(await page.locator('#systemContent').inputValue(),'Keep {{message}}');assert.equal(await page.locator('#systemContent').getAttribute('readonly'),'');
 assert.deepEqual(errors,[]);
});
