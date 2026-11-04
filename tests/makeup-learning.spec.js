const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const read=name=>fs.readFileSync(name,'utf8');
const token='a'.repeat(64);
async function publicFixture(page,{completed=false,error=null}={}){
 await page.route('https://makeup.test/**',route=>{
  const pathname=new URL(route.request().url()).pathname.slice(1);
  if(pathname==='hoc-bu.html')return route.fulfill({contentType:'text/html',body:read('hoc-bu.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(pathname==='makeup-learning.css')return route.fulfill({contentType:'text/css',body:read(pathname)});
  if(pathname==='assets/mindup-logo-round.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(pathname)});
  return route.abort();
 });
 await page.goto('https://makeup.test/hoc-bu.html#'+token);
 await page.evaluate(({completed,error})=>{
  window.calls=[];window.uploads=[];window.SUPABASE_URL='https://db.invalid';window.SUPABASE_KEY='test';
  window.supabase={createClient:(url,key,options)=>{
   window.clientOptions=options;
   return {rpc:async(name,args)=>{
    window.calls.push({name,args});
    if(error)return {error:{message:error}};
    if(name==='get_makeup_learning')return {data:{id:'m1',student_name:'Nguyễn Minh Anh',class_name:'Toán 10',study_date:'2026-11-01',questions:Array.from({length:10},(_,i)=>({id:'q'+i,text:'Tính $1+1$.\nA. 1\nB. 2\nC. 3\nD. 4',answer_count:4})),draft_answers:{},score:completed?8:null,attempts:completed?1:0,completed,upload_prefix:'prefix'}};
    if(name==='submit_makeup_learning'){await new Promise(r=>setTimeout(r,100));return {data:{score:8,completed:true,attempts:1}};}
    return {data:null};
   },storage:{from:()=>({upload:async(path,file)=>{window.uploads.push(path);return {data:{path}};}})}};
  }};
 },{completed,error});
 await page.addScriptTag({content:read('word-question-content.js')});
 await page.addScriptTag({content:read('makeup-public.js')});
}
for(const width of [1280,390])test(`student public test and notebook submission at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await publicFixture(page);
 await expect(page.locator('#identity')).toContainText('Nguyễn Minh Anh');await expect(page.locator('fieldset')).toHaveCount(10);
 await page.getByRole('button',{name:'Nộp bài',exact:true}).click();await expect(page.locator('#status')).toContainText('đủ 10 câu');
 for(let i=0;i<10;i++)await page.locator(`input[name="q${i}"][value="B"]`).check();
 await page.getByRole('button',{name:'Nộp bài',exact:true}).click();await expect(page.locator('#status')).toContainText('Cần 1–5 ảnh');
 await page.locator('#notebooks').setInputFiles({name:'notebook.png',mimeType:'image/png',buffer:fs.readFileSync('assets/mindup-logo-round.png')});
 await page.screenshot({path:`test-results/makeup-student-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Nộp bài',exact:true}).click();
 await expect(page.locator('#result')).toHaveText('8/10 · Đã hoàn thành học bù');await expect(page.locator('#makeupTest')).toBeHidden();
 expect(await page.evaluate(()=>window.calls.filter(c=>c.name==='submit_makeup_learning').length)).toBe(1);
 expect(await page.evaluate(()=>window.clientOptions.auth.persistSession)).toBe(false);
 expect(await page.evaluate(()=>window.clientOptions.global.headers['x-makeup-token'])).toBe(token);
});
test('invalid link, expired link and completed result do not open editable form',async({page})=>{
 await publicFixture(page,{error:'Link không hợp lệ hoặc đã hết hạn'});await expect(page.locator('#status')).toContainText('hết hạn');await expect(page.locator('#makeupTest')).toBeHidden();
 await publicFixture(page,{completed:true});await expect(page.locator('#result')).toContainText('8/10');await expect(page.locator('#makeupTest')).toBeHidden();
});
for(const width of [1280,390])test(`staff create and inspect makeup assignment at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.route('https://makeup.test/makeup-learning.css',r=>r.fulfill({contentType:'text/css',body:read('makeup-learning.css')}));
 await page.route('https://makeup.test/class.html',r=>r.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="https://makeup.test/makeup-learning.css"><button id="open">Học bù</button>'}));
 await page.goto('https://makeup.test/class.html');
 await page.evaluate(token=>{
  window.calls=[];window.sb={rpc:async(name,args)=>{window.calls.push({name,args});
   if(name==='makeup_class_data')return {data:{absences:[{student_id:'s1',student_name:'Nguyễn Minh Anh',study_date:'2026-11-01'}],topics:[{id:'t1',name:'Mệnh đề'}],reviewers:[{id:'r1',full_name:'Giáo viên phụ trách'}],assignments:[{id:'m1',student_name:'Nguyễn Minh Anh',study_date:'2026-11-01',score:8,attempts:1,completed_at:'2026-11-02',expires_at:'2026-11-15',notebook_paths:[],questions:[{id:'q1',text:'1+1?'}],answers:{q1:'B'}}]}};
   if(name==='create_makeup_learning')return {data:{id:'m2',token}};
   return {data:{}};
  }};
 },token);
 await page.addScriptTag({content:read('makeup-learning.js')});await page.evaluate(()=>MakeupLearning.open('c1'));
 await page.locator('#makeupAbsence').selectOption('0');await page.locator('#makeupTopic').selectOption('t1');
 await page.getByRole('button',{name:'Tạo bài 10 câu & lấy link'}).click();await expect(page.getByLabel('Link học bù')).toHaveValue(new RegExp('hoc-bu.html#'+token));
 const sent=await page.evaluate(()=>window.calls.find(c=>c.name==='create_makeup_learning').args);expect(sent.p_student).toBe('s1');expect(sent.p_reviewer).toBe('r1');
 await page.getByRole('button',{name:'Xem bài nộp'}).click();await expect(page.locator('#makeupPhotos')).toContainText('Câu 1: B');
 const box=await page.locator('.makeup-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(850);
 await page.screenshot({path:`test-results/makeup-staff-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Đóng',exact:true}).click();await expect(page.locator('.makeup-dialog')).toBeHidden();
});
