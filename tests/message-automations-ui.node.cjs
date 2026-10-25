const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('@playwright/test');
test('automation editor previews, groups, validates, schedules and fits desktop/mobile without real sends',async t=>{
 const source=fs.readFileSync('message-automations.html','utf8').replace(/<script src="https:[^>]+><\/script>/,'').replace(/<script src="supabaseClient.js"[^>]*><\/script>/,'');
 const stub=`<script>
 window.calls=[];window.campaigns=[];window.manualAttempts=0;
 const targets=[{parent_id:'p1',parent_name:'PH thử nghiệm',students:'An và Bình',classes:'Toán 10',linked:true},{parent_id:'p2',parent_name:'PH chưa liên kết',students:'Chi',classes:'Lý 10',linked:false}];
 window.sb={rpc:(name,args={})=>{calls.push({name,args});let data,error=null;
 if(name==='message_automation_console')data={campaigns:window.campaigns,classes:[{id:'c1',name:'Toán 10'},{id:'c2',name:'Lý 10'}],system_admin:true};
 if(name==='preview_message_campaign')data=targets.filter(r=>(!args.p_class_ids.length||args.p_class_ids.includes(r.parent_id==='p1'?'c1':'c2'))&&(!args.p_parent_ids.length||args.p_parent_ids.includes(r.parent_id))&&!args.p_excluded_ids.includes(r.parent_id)).map(r=>({...r,content:args.p_template.replaceAll('[Ten_hoc_sinh]',r.students).replaceAll('[Ten_phu_huynh]',r.parent_name)}));
 if(name==='save_message_campaign'){window.campaigns=[{id:args.p_id,name:args.p_name,template:args.p_template,author:'Admin',send_at:args.p_send_at,recurrence:args.p_recurrence,window_hours:args.p_window_hours,class_ids:args.p_class_ids,parent_ids:args.p_parent_ids,excluded_ids:args.p_excluded_ids,state:'draft',total:0,sent:0,failed:0}];data=args.p_id;}
 if(name==='control_message_campaign'){campaigns[0].state=args.p_action==='publish'?'scheduled':args.p_action==='pause'?'paused':args.p_action==='cancel'?'cancelled':'scheduled';data={success:true};}
 if(name==='message_automation_systems')data={admin:true,tuition:{paused:false,template:'Học phí {TenHS}'},templates:[{id:'tuition_overdue_notice',name:'Nhắc học phí quá hạn',content:'Học phí tháng [Thang_hoc_phi] của [Ten_hoc_sinh], hạn [Han_thanh_toan], hôm nay [Ngay_hien_tai].',is_enabled:false},{id:'session_evaluation_notice',name:'Đánh giá buổi học',content:'Keep {{message}}',is_enabled:true}],history:[]};
 if(name==='overdue_tuition_settings')data={send_day:16};
 if(name==='preview_overdue_tuition_notices')data={month:'2026-10-01',overdue:true,manual:true,recipients:[{parent_id:'p1',parent_name:'PH thử nghiệm',remaining:500000,linked:true,can_send:true,content:'Học phí tháng 10/2026 của An, hạn 15/10/2026, hôm nay 19/10/2026.',qrs:[{student_name:'An',remaining:500000,memo:'SEVQR HP0926 1026 An 1234',qr_url:'https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount=500000&addInfo=SEVQR%20HP0926%201026%20An%201234'}]}]};
 if(name==='save_overdue_tuition_template')data=null;
 if(name==='queue_overdue_tuition_manual'){window.manualAttempts++;if(manualAttempts===1)error={message:'Mất kết nối thử nghiệm'};else data={queued:1,skipped:0};}
 if(name==='message_campaign_details')data={recipients:[{parent:'PH thử nghiệm',content:'Hello An và Bình',scheduled_at:new Date().toISOString(),status:'uncertain',error:'Chưa xác nhận từ Zalo'}],runs:[]};
 return Promise.resolve({data,error});}};
 </script>`;
 const html=source.replace('<script src="message-automations.js',stub+'<script src="message-automations.js');
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1);
 if(file==='preview'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(!['message-automations.js','message-automations.css'].includes(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1365,height:950},timezoneId:'America/New_York'}),errors=[];let acceptDialogs=true;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>acceptDialogs?d.accept():d.dismiss());
 const {createRequire}=require('node:module'),path=require('node:path');
 const testQr=await createRequire(path.resolve('services/zalo-bot/package.json'))('qrcode').toBuffer('TEST overdue tuition preview; not for payment',{width:180});
 await page.route('https://img.vietqr.io/**',route=>route.fulfill({contentType:'image/png',body:testQr}));
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
 await page.locator('#systemEditor [data-close]').click();
 await page.locator('.system-row').filter({hasText:'Nhắc học phí quá hạn'}).getByRole('button',{name:'Cài đặt',exact:true}).click();
 assert.equal(await page.locator('#systemEnabledWrap').isVisible(),false);assert.equal(await page.locator('#overdueSendDay').count(),0);
 await page.getByRole('button',{name:'Xem người nhận & nội dung',exact:true}).click();await page.getByText('Học phí tháng 10/2026 của An, hạn 15/10/2026, hôm nay 19/10/2026.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>calls.some(c=>c.name==='queue_overdue_tuition_manual')),false);
 assert.equal(await page.getByRole('img',{name:'QR học phí An'}).count(),1);
 assert.match(await page.locator('#detailBody').innerText(),/SEVQR HP0926 1026 An 1234/);
 await page.setViewportSize({width:1365,height:950});await page.getByRole('img',{name:'QR học phí An'}).scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#details img')?.naturalWidth>0);await page.screenshot({path:'scratch/overdue-tuition-preview-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#details').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'scratch/overdue-tuition-preview-mobile.png'});
 acceptDialogs=false;await page.getByRole('button',{name:'Gửi cho 1 phụ huynh',exact:true}).click();assert.equal(await page.evaluate(()=>manualAttempts),0);
 acceptDialogs=true;await page.getByRole('button',{name:'Gửi cho 1 phụ huynh',exact:true}).click();await page.getByText('Mất kết nối thử nghiệm',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Gửi cho 1 phụ huynh',exact:true}).click();await page.getByText(/Đã xếp hàng 1 tin/).waitFor();
 const attempts=await page.evaluate(()=>calls.filter(c=>c.name==='queue_overdue_tuition_manual'));assert.equal(attempts.length,2);assert.equal(attempts[0].args.p_request,attempts[1].args.p_request);
 assert.equal(await page.getByRole('button',{name:'Gửi cho 1 phụ huynh',exact:true}).isDisabled(),true);
 await page.locator('#details [data-close]').click();await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
 await page.locator('#systemEditor').waitFor({state:'hidden'});
 const overdueSaved=await page.evaluate(()=>calls.find(c=>c.name==='save_overdue_tuition_template').args);assert.match(overdueSaved.p_content,/Thang_hoc_phi/);
 assert.deepEqual(errors,[]);
});
