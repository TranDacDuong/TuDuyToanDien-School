const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const sharp=require('sharp'),QR=require('qrcode'),jsQR=require('jsqr');
const {prepareNotification,attendanceLabel,sendNotification,monthContext,statementSvg,statementLines}=require('./tuition-notification');
const {LocalDatabase}=require('./local-database');
const Notice=require('../../tuition-notice');
const S='00000000-0000-0000-0000-000000000011';
const payload={month:'2026-11',parentName:'PH Mẫu',captured_at:'2026-11-12T03:00:00Z',bank:{code:'vietinbank',bankName:'VietinBank',account:'104888332556'},
 children:[{student_id:S,student_name:'Nguyễn Minh An (DỮ LIỆU MẪU)',remaining:780000,transfer_memo:'SEVQR HP1026 1126 Minh An 1234',debts:[{month:'2026-10-01',remaining:180000},{month:'2026-11-01',remaining:600000}]}],
 billing_context:{classes:[{id:'class1',class_name:'Toán tư duy lớp 6',tuition_type:'per_session',tuition_fee:100000,class_schedules:[{id:1,weekday:4,session_no:1,start_time:'18:00',end_time:'19:30',effective_from:'2026-01-01'}]}],
 classStudents:[{student_id:S,class_id:'class1',joined_at:'2026-01-01'}],attData:[{student_id:S,class_id:'class1',date:'2026-11-05',schedule_id:1,status:'present'}],trialReqs:[],suppSessions:[],payments:[{student_id:S,month:'2026-11-01',amount_due:800000,amount_paid:200000}],discountRules:[]}};
test('statement contains only explicit attendance and a readable exact QR; retry output is stable',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'notice-test-'));t.after(async()=>{if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))await fs.rm(dir,{recursive:true,force:true});});
 const emv='SYNTHETIC-QR-780000-SEVQR-HP1026-1126';
 const download=async(url,file)=>{assert.equal(new URL(url).searchParams.get('amount'),'780000');assert.equal(new URL(url).searchParams.get('addInfo'),payload.children[0].transfer_memo);await QR.toFile(file,emv,{width:390,margin:4});};
 const result=await prepareNotification(payload,{download,outputDir:dir});
 assert.equal(result.parts.length,2);assert.match(result.text,/180\.000/);assert.match(result.text,/780\.000/);
 const {data,info}=await sharp(result.parts[1].file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height);assert.equal(decoded?.data,emv);
 const second=await prepareNotification(payload,{download,outputDir:dir,clock:()=>new Date('2026-12-01')});assert.deepEqual(second.manifest,result.manifest);
  const recovered=await prepareNotification(payload,{download:()=>{throw Error('Confirmed QR must not download again');},outputDir:dir,startPart:1,isConfirmed:()=>true});assert.deepEqual(recovered.manifest,result.manifest);assert.equal(recovered.parts[1].file,undefined);
 if(process.env.NOTICE_PREVIEW_DIR){await fs.mkdir(process.env.NOTICE_PREVIEW_DIR,{recursive:true});await fs.copyFile(result.parts[1].file,path.join(process.env.NOTICE_PREVIEW_DIR,'tuition-attendance-sample.png'));}
 const detail={date:'2026-11-12',schedule_id:1,status:'present'};
 assert.equal(attendanceLabel(detail,S,'class1',payload.billing_context,'2026-11-12'),'Có mặt');
 assert.equal(attendanceLabel({...detail,date:'2026-11-19'},S,'class1',payload.billing_context,'2026-11-12'),'Chưa diễn ra');
});

test('monthly report uses the same resolved session statuses as attendance and tuition, including default presence and trial overrides',()=>{
 const Calculation=require('../../tuition-calculation');
 const context=structuredClone(payload.billing_context);
 context.attData=[
  {student_id:S,class_id:'class1',date:'2026-11-05',schedule_id:1,status:'absent'},
  {student_id:S,class_id:'class1',date:'2026-11-12',schedule_id:null,status:'makeup'},
  {student_id:S,class_id:'class1',date:'2026-11-19',schedule_id:1,status:'present'}];
 context.trialReqs=[{student_id:S,trial_class_id:'class1',trial_sessions:[{date:'2026-11-19',schedule_id:1}]}];
 const rows=Calculation.buildRowsForMonth({...context,ym:'2026-11',payments:{}},{});
 const lines=statementLines({id:S,rows},context,'2026-11-30');
 const byDate=Object.fromEntries(lines.filter(l=>l.date).map(l=>[l.date,l.label]));
 assert.equal(byDate['2026-11-05'],'Vắng');assert.equal(byDate['2026-11-12'],'Học bù');
 assert.equal(byDate['2026-11-19'],'Học thử');assert.equal(byDate['2026-11-26'],'Có mặt');
 assert.ok(lines.every(l=>l.label!=='Chưa điểm danh'));
 const future=statementLines({id:S,rows},context,'2026-11-06');assert.equal(future.find(l=>l.date==='2026-11-12').label,'Chưa diễn ra');
 context.attData[2].status_overridden=true;
 const overridden=Calculation.buildRowsForMonth({...context,ym:'2026-11',payments:{}},{});
 assert.equal(statementLines({id:S,rows:overridden},context,'2026-11-30').find(l=>l.date==='2026-11-19').label,'Có mặt');
});
test('commands are exact and use Vietnam month boundaries',()=>{
 assert.deepEqual(Notice.parseCommand('#hocphi',new Date('2026-10-31T18:00:00Z')),{month:'2026-11'});
 assert.deepEqual(Notice.parseCommand(' #HOCPHI 1/2026 '),{month:'2026-01'});
 assert.equal(Notice.parseCommand('Nói về #hocphi'),null);
 assert.throws(()=>Notice.parseCommand('#hocphi 13/2026'),/Dùng/);
});
test('delivery labels distinguish rejection, partial sends and missing acknowledgement',()=>{
 assert.equal(Notice.deliveryState({status:'uncertain',error_message:'Chưa tìm thấy Zalo'}),'Không gửi được');
 assert.equal(Notice.deliveryState({status:'uncertain',error_message:'Zalo returned no message id'}),'Chưa xác nhận gửi');
 assert.equal(Notice.deliveryState({status:'uncertain',completed_parts:1,error_message:'Upload failed'}),'Chưa gửi đủ nội dung/ảnh');
 assert.equal(Notice.deliveryState({status:'uncertain',error_message:'[Chuẩn bị ảnh] timeout'}),'Không gửi được');
 assert.equal(Notice.deliveryState({status:'uncertain',error_message:'[Chuẩn bị ảnh] timeout',possibly_delivered:true}),'Chưa xác nhận gửi');
});
test('lost cloud ACK reuses a verified publication; explicit retry sends only an unconfirmed image',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'notice-send-')),store=new LocalDatabase(path.join(dir,'receipts.sqlite'),'test');
 t.after(async()=>{store.close();if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))await fs.rm(dir,{recursive:true,force:true});});
 let sends=0,ackFail=true,begins=0;
 const parts=[{kind:'text',content:'Common text',identity:'text'},{kind:'image',file:'fake.png',identity:'image'}];
 const options={store,schedule:()=>({allowed:true}),prepare:async()=>({text:'Common text',parts,manifest:['text','image'],cleanup:async()=>{}}),
  rpc:async action=>{if(action==='beginTuitionNoticePart')begins++;return true;},acknowledge:async()=>{if(ackFail){ackFail=false;return false;}return true;},
  api:{sendMessage:async(msg,uid,type,guard)=>{await guard();sends++;return typeof msg==='string'?{message:{msgId:100}}:{attachment:[{msgId:200}]};}}};
 const job={id:'job',token:'token',payload:{},next_part:0,revision:0,dispatch_uid:'123'};
 await sendNotification(job,options);assert.equal(sends,1);
 await sendNotification({...job,revision:1},options);assert.equal(sends,2);assert.equal(begins,3); // replay also begins a new cloud part
});
module.exports={payload};

test('three monthly statements have isolated saved amounts and attendance, followed by a single total QR',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'monthly-notice-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const sample=structuredClone(payload);sample.version=2;sample.template=Notice.DEFAULT_TEMPLATE;
 sample.children[0]={...sample.children[0],student_name:'Nguyễn Tùng Anh (DỮ LIỆU MẪU)',remaining:1800000,
  debts:['09','10','11'].map(m=>({month:`2026-${m}-01`,remaining:600000}))};
 sample.statement_context={...sample.billing_context,
  payments:['09','10','11'].map((m,i)=>({student_id:S,month:`2026-${m}-01`,amount_due:700000+i*100000,amount_paid:100000+i*100000,discount_amount:0})),
  attData:[{student_id:S,class_id:'class1',date:'2026-09-03',schedule_id:1,status:'absent'},...sample.billing_context.attData]};
 let downloads=0;const qr='SYNTHETIC-TOTAL-1800000';
 const download=async(url,file)=>{downloads++;assert.equal(new URL(url).searchParams.get('amount'),'1800000');await QR.toFile(file,qr,{width:500,margin:4});};
 const result=await prepareNotification(sample,{download,outputDir:dir});
 assert.equal(result.parts.length,5);assert.equal(downloads,1);
 assert.match(result.text,/tháng 11 năm 2026/);assert.match(result.text,/1\.800\.000đ bao gồm học phí của các tháng 9, 10, 11/);
 assert.match(result.text,/Ảnh điểm danh tháng 9, Ảnh điểm danh tháng 10, Ảnh điểm danh tháng 11/);
 assert.doesNotMatch(result.text,/còn thiếu|còn nợ|gạch nợ|công nợ/i);
 for(let i=1;i<=3;i++){
  assert.match(result.parts[i].identity,new RegExp(`:2026-${String(i+8).padStart(2,'0')}:0$`));
  const {data,info}=await sharp(result.parts[i].file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(jsQR(new Uint8ClampedArray(data),info.width,info.height),null);
 }
 const context=monthContext(sample,'2026-09',S);assert.equal(context.attData.length,1);assert.equal(context.payments.length,1);
 assert.equal(context.payments[0].amount_paid,100000);
 const svg=statementSvg({id:S,name:'Mẫu'},'2026-09',[],0,1,context,sample.captured_at,600000).svg;
 assert.match(svg,/Đã nộp: 100\.000đ/);assert.match(svg,/CẦN THANH TOÁN THÁNG 9\/2026: 600\.000đ/);assert.doesNotMatch(svg,/còn thiếu|còn nợ|công nợ|qrTop/i);
 const {data,info}=await sharp(result.parts[4].file).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data,qr);
 const retry=await prepareNotification(sample,{download:()=>{throw Error('Confirmed QR downloaded again');},outputDir:dir,startPart:3,isConfirmed:()=>true});assert.deepEqual(retry.manifest,result.manifest);
 if(process.env.NOTICE_PREVIEW_DIR){for(let i=1;i<=4;i++)await fs.copyFile(result.parts[i].file,path.join(process.env.NOTICE_PREVIEW_DIR,`monthly-tuition-sample-${i}.png`));await fs.writeFile(path.join(process.env.NOTICE_PREVIEW_DIR,'monthly-tuition-message.txt'),result.text);}
});
