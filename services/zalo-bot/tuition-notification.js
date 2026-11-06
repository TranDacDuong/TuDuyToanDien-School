'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const Notice=require('../../tuition-notice'),Calculation=require('../../tuition-calculation');
const {downloadQrImage}=require('./zalo-image');
const legacy=require('./tuition-notification-v1');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const money=v=>new Intl.NumberFormat('vi-VN').format(Number(v)||0)+'đ';
const short=(v,n)=>Array.from(String(v||'')).length>n?Array.from(String(v)).slice(0,n-1).join('')+'…':String(v||'');

function attendanceLabel(detail,student,cls,context,today) {
  if(detail.date>today)return 'Chưa diễn ra';
  // Use the same resolved status as the attendance/tuition screens: a scheduled
  // membership defaults to present, with saved overrides and trials resolved by
  // TuitionCalculation. Looking only for explicit rows discards that default.
  return {present:'Có mặt',absent:'Vắng',makeup:'Học bù',trial:'Học thử',late:'Đi muộn'}[detail.status]||'Chưa xác định';
}

function statementLines(student,context,today) {
  const lines=[];
  const payment=(context.payments||[]).find(p=>p.student_id===student.id);
  const matches=payment&&Math.abs(student.rows.reduce((n,r)=>n+Number(r.amount||0),0)-Number(payment.amount_due))<1;
  for(const row of student.rows) {
    const component=payment?.gross_components?.find(c=>c.class_id===row.classId);
    const amount=component?Math.round(Number(component.amount)*(1-Number(component.percent||0)/100)):row.amount;
    lines.push({classTitle:row.className,summary:`${matches?'Buổi tính phí':'Số buổi theo lịch'}: ${row.billableSessions||0} · ${component?'Học phí đã lưu':matches?'Học phí':'Dự kiến theo lịch'}: ${money(amount)}${component?.percent?` (giảm ${component.percent}%)`:''}`});
    for(const detail of row.attendanceDetails||[])lines.push({date:detail.date,label:attendanceLabel(detail,student.id,row.classId,context,today),schedule:detail.scheduleLabel||''});
    if(!row.attendanceDetails?.length)lines.push({label:'Chưa có lịch/điểm danh của lớp trong tháng này'});
  }
  if(!lines.length)lines.push({label:'Chưa có dữ liệu lịch/điểm danh trong tháng được chọn.'});
  return lines;
}

function monthContext(payload,month,studentId) {
  const source=payload.statement_context||payload.billing_context;
  const attendance=(source.attData||[]).filter(r=>r.student_id===studentId&&String(r.date).slice(0,7)===month);
  const memberships=(source.classStudents||[]).filter(r=>r.student_id===studentId);
  // A removed enrollment must not hide the child's recorded historical classes.
  for(const record of attendance)if(record.class_id&&!memberships.some(r=>r.class_id===record.class_id))memberships.push({student_id:studentId,class_id:record.class_id,joined_at:month+'-01'});
  return {...source,
    classStudents:memberships,
    chosenSchedules:(source.chosenSchedules||[]).filter(r=>r.student_id===studentId),
    attData:attendance,
    payments:(source.payments||[]).filter(r=>r.student_id===studentId&&String(r.month).slice(0,7)===month),
    suppSessions:(source.suppSessions||[]).filter(r=>String(r.session_date).slice(0,7)===month).map(r=>({...r,students:(r.students||[]).filter(s=>s.student_id===studentId)})),
    trialReqs:(source.trialReqs||[]).filter(r=>r.student_id===studentId),
    discountRules:(source.discountRules||[]).filter(r=>r.student_id===studentId)};
}

function statementSvg(student,month,lines,page,pages,context,capturedAt,remaining) {
  const header=220,rowHeight=58,height=header+lines.length*rowHeight+330;
  const payment=context.payments.find(p=>p.student_id===student.id);
  let y=header,body='';
  for(const line of lines) {
    body+=`<rect x="36" y="${y-28}" width="1008" height="56" fill="${line.classTitle?'#eaf1ff':'#f8fafc'}"/>`;
    body+=line.classTitle?`<text x="52" y="${y}" font-weight="700">${esc(short(line.classTitle,65))}</text><text x="52" y="${y+22}" font-size="17">${esc(line.summary)}</text>`:
      `<text x="52" y="${y}" font-size="22">${esc(line.date?.split('-').reverse().join('/')||'')}</text><text x="245" y="${y}" font-size="22">${esc(short(line.label,50))}</text><text x="530" y="${y}" font-size="17">${esc(short(line.schedule,52))}</text>`;
    y+=rowHeight;
  }
  const financial=payment?`Học phí: ${money(payment.amount_due)} · Miễn/giảm: ${money(payment.discount_amount)} · Đã nộp: ${money(payment.amount_paid)}`:'Chưa có thông tin học phí được lưu cho tháng này.';
  body+=`<text x="52" y="${y+48}" font-size="22">${esc(financial)}</text>
    <text x="52" y="${y+100}" font-size="30" font-weight="700">CẦN THANH TOÁN THÁNG ${Number(month.slice(5))}/${month.slice(0,4)}: ${money(remaining)}</text>
    <text x="52" y="${y+148}" font-size="18">Số tiền theo thông tin học phí đã lưu của tháng này.</text>
    <text x="52" y="${y+182}" font-size="18">Điểm danh cập nhật: ${esc(new Date(capturedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))} (giờ Việt Nam).</text>
    <text x="52" y="${y+232}" font-size="20">Ảnh QR gửi riêng ở cuối, dùng thanh toán tổng các tháng trong thông báo.</text>`;
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}"><rect width="1080" height="${height}" fill="white"/><g font-family="Arial, sans-serif" fill="#172944" font-size="24"><rect width="1080" height="94" fill="#0759ce"/><text x="42" y="58" fill="white" font-size="32" font-weight="700">MINDUP · HỌC PHÍ &amp; ĐIỂM DANH</text><text x="42" y="138" font-size="30" font-weight="700">${esc(student.name)}</text><text x="42" y="176">Tháng ${Number(month.slice(5))}/${month.slice(0,4)} · Trang ${page+1}/${pages}</text>${body}</g></svg>`,height};
}

async function prepareNotification(payload,options={}) {
  // Frozen/partially sent jobs keep their original manifest and text on retries.
  if(Number(payload.version||1)<2)return legacy.prepareNotification(payload,options);
  const {download=downloadQrImage,outputDir,clock=()=>new Date(),startPart=0,isConfirmed=()=>false}=options;
  const current=payload.billing_context;
  const rows=Calculation.buildRowsForMonth({...current,ym:payload.month,payments:Object.fromEntries((current.payments||[]).map(p=>[p.student_id,p]))},{discountRules:current.discountRules||[]});
  const notice=Notice.build({...payload,rows});
  if(notice.text.length>10000)throw Error('Thông báo quá dài; cần giảm số học sinh trong một lượt');
  const directory=outputDir||await fs.mkdtemp(path.join(os.tmpdir(),'mindup-tuition-'));
  const cleanup=async()=>{if(!outputDir&&path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))await fs.rm(directory,{recursive:true,force:true});};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(payload.captured_at?new Date(payload.captured_at):clock());
  const identity=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const parts=[{kind:'text',content:notice.text,identity:`text-v2:${identity}`}];
  async function addImage(partIdentity,name,caption,render) {
    const index=parts.length;
    if(index<startPart||isConfirmed(partIdentity,index)){parts.push({kind:'image',identity:partIdentity,caption});return;}
    const file=path.join(directory,name);await render(file);parts.push({kind:'image',file,identity:partIdentity,caption});
  }
  try {
    for(const student of notice.students) {
      const months=[...new Set(student.debts.map(d=>d.month.slice(0,7)))].sort();
      if(!months.length)throw Error('Thiếu danh sách tháng cần thanh toán');
      for(const month of months) {
        const context=monthContext(payload,month,student.id);
        const rows=Calculation.buildRowsForMonth({...context,ym:month,payments:Object.fromEntries(context.payments.map(p=>[p.student_id,p]))},{discountRules:context.discountRules});
        const lines=statementLines({...student,rows},context,today),chunks=[];let chunk=[],classHeader;
        for(const line of lines){if(chunk.length>=24){chunks.push(chunk);chunk=[];if(!line.classTitle&&classHeader)chunk.push(classHeader);}if(line.classTitle)classHeader=line;chunk.push(line);}
        if(chunk.length)chunks.push(chunk);
        const remaining=student.debts.filter(d=>d.month.slice(0,7)===month).reduce((n,d)=>n+Number(d.remaining),0);
        for(let page=0;page<chunks.length;page++)await addImage(`statement-v2:${identity}:${student.id}:${month}:${page}`,`${student.id}-${month}-${page}.png`,
          `Điểm danh và học phí ${student.name} tháng ${Number(month.slice(5))}/${month.slice(0,4)}`,
          file=>sharp(Buffer.from(statementSvg(student,month,chunks[page],page,chunks.length,context,payload.captured_at,remaining).svg)).png().toFile(file));
      }
    }
    // All monthly statements precede all QR images, also for multi-child families.
    for(const student of notice.students)await addImage(`qr-v2:${identity}:${student.id}`,`${student.id}-qr.png`,
      `QR chuyển khoản chung các tháng của ${student.name} · ${money(student.remaining)}`,
      file=>download(student.qrUrl,file));
    return {text:notice.text,parts,manifest:parts.map(p=>p.identity),cleanup};
  }catch(error){await cleanup();throw error;}
}

async function sendNotification(job,options) {
  return legacy.sendNotification(job,{...options,prepare:options.prepare||prepareNotification});
}
module.exports={prepareNotification,sendNotification,monthContext,statementSvg,attendanceLabel,statementLines};
