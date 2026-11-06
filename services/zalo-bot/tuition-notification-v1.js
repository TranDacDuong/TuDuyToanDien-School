'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const Notice=require('./tuition-notice-v1');
const Calculation=require('../../tuition-calculation');
const {downloadQrImage}=require('./zalo-image');
const {requireSendAcknowledgement,sendErrorMessage}=require('./send-acknowledgement');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const money=v=>new Intl.NumberFormat('vi-VN').format(Number(v)||0)+'đ';
const short=(value,size)=>{const chars=Array.from(String(value||''));return chars.length>size?chars.slice(0,size-1).join('')+'…':chars.join('');};
function attendanceLabel(detail,student,cls,context,today) {
  if(detail.isSupplementary) return detail.status==='absent'?'Vắng buổi bổ sung':'Học bổ sung';
  const records=(context.attData||[]).filter(a=>a.student_id===student && a.class_id===cls && String(a.date).slice(0,10)===detail.date);
  const att=records.find(a=>a.schedule_id!=null && String(a.schedule_id)===String(detail.schedule_id)) || records.find(a=>a.schedule_id==null);
  if(detail.date>today) return 'Chưa diễn ra';
  if(!att) return detail.status==='trial'?'Học thử':'Chưa điểm danh';
  return ({present:'Có mặt',absent:'Nghỉ',makeup:'Học bù',trial:'Học thử',late:'Đi muộn'})[att.status]||'Chưa xác định';
}
function statementLines(student,context,today) {
  const lines=[];
  const payment=(context.payments||[]).find(p=>p.student_id===student.id);
  const matches=payment && Math.abs(student.rows.reduce((n,r)=>n+Number(r.amount||0),0)-Number(payment.amount_due))<1;
  for(const row of student.rows) {
    const component=payment?.gross_components?.find(c=>c.class_id===row.classId);
    const amount=component?Math.round(Number(component.amount)*(1-Number(component.percent||0)/100)):row.amount;
    lines.push({classTitle:row.className,summary:`${matches?'Buổi tính phí':'Số buổi theo lịch'}: ${row.billableSessions||0} · ${component?'Học phí đã lưu':matches?'Học phí':'Dự kiến theo lịch'}: ${money(amount)}${component?.percent?` (giảm ${component.percent}%)`:''}`});
    for(const detail of row.attendanceDetails||[]) lines.push({date:detail.date,label:attendanceLabel(detail,student.id,row.classId,context,today),schedule:detail.scheduleLabel||''});
    if(!row.attendanceDetails?.length) lines.push({label:'Chưa có lịch/điểm danh của lớp trong tháng này'});
  }
  if(!lines.length) lines.push({label:'Chưa có dữ liệu lịch/điểm danh trong tháng được chọn.'});
  return lines;
}
function statementSvg(student,month,lines,page,pages,context,capturedAt) {
  const final=page===pages-1, header=220,rowHeight=58,footer=final?640:100;
  const debtLines=[];let debtLine='';
  for(const debt of student.debts){const item=`${debt.month.slice(5,7)}/${debt.month.slice(0,4)}: ${money(debt.remaining)}`;if(debtLine.length+item.length>85){debtLines.push(debtLine);debtLine='';}debtLine+=(debtLine?' · ':'')+item;}
  if(debtLine)debtLines.push(debtLine);
  const extra=final?Math.max(0,debtLines.length-1)*28:0;
  const height=header+lines.length*rowHeight+footer+extra;
  const payment=(context.payments||[]).find(p=>p.student_id===student.id);
  let y=header;
  let body='';
  for(const line of lines) {
    body+=`<rect x="36" y="${y-28}" width="1008" height="56" fill="${line.classTitle?'#eaf1ff':'#f8fafc'}"/>`;
    body+=line.classTitle?`<text x="52" y="${y}" font-weight="700">${esc(short(line.classTitle,65))}</text><text x="52" y="${y+22}" font-size="17">${esc(line.summary)}</text>`:
      `<text x="52" y="${y}" font-size="22">${esc(line.date||'')}</text><text x="245" y="${y}" font-size="22">${esc(short(line.label,50))}</text><text x="530" y="${y}" font-size="17">${esc(short(line.schedule,52))}</text>`;
    y+=rowHeight;
  }
  if(final) {
    body+=debtLines.map((line,index)=>`<text x="52" y="${y+12+index*28}" font-size="19">${index===0?'Còn thiếu: ':''}${esc(line)}</text>`).join('');
    y+=extra;
    const current=payment?`Tháng này: phải thu ${money(payment.amount_due)} · Miễn/giảm ${money(payment.discount_amount)} · Đã đóng ${money(payment.amount_paid)}`:'Tháng này chưa có học phí được lưu; QR thanh toán các khoản nợ bên trên.';
    body+=`<text x="52" y="${y+48}" font-size="19">${esc(current)}</text>
      <text x="52" y="${y+90}" font-size="30" font-weight="700">TỔNG CÒN PHẢI ĐÓNG: ${money(student.remaining)}</text>
      <text x="52" y="${y+132}" font-size="18">Số tiền thanh toán theo công nợ đã lưu; bảng tính buổi học có thể khác.</text>
      <text x="52" y="${y+164}" font-size="18">Điểm danh cập nhật: ${esc(new Date(capturedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))} (giờ Việt Nam).</text>
      <text x="52" y="${y+210}" font-size="21">Quét QR để thanh toán đúng khoản thu của học sinh.</text>
      <text x="52" y="${y+250}" font-size="18">Nội dung chuyển khoản:</text>
      <text x="52" y="${y+282}" font-size="18" font-weight="700">${esc(student.memo)}</text>
      <text x="52" y="${y+325}" font-size="17">Nếu có nợ cũ, tiền được phân bổ tháng cũ nhất trước.</text>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}"><rect width="1080" height="${height}" fill="white"/><g font-family="Arial, sans-serif" fill="#172944" font-size="24"><rect width="1080" height="94" fill="#0759ce"/><text x="42" y="58" fill="white" font-size="32" font-weight="700">MINDUP · HỌC PHÍ &amp; ĐIỂM DANH</text><text x="42" y="138" font-size="30" font-weight="700">${esc(student.name)}</text><text x="42" y="176">Tháng ${esc(month.slice(5))}/${esc(month.slice(0,4))} · Trang ${page+1}/${pages}</text>${body}</g></svg>`;
  return {svg,height,qrTop:final?y+230:null};
}
async function prepareNotification(payload,{download=downloadQrImage,outputDir,clock=()=>new Date(),startPart=0,isConfirmed=()=>false}={}) {
  const context=payload.billing_context;
  const rows=Calculation.buildRowsForMonth({...context,ym:payload.month,payments:Object.fromEntries((context.payments||[]).map(p=>[p.student_id,p]))},{discountRules:context.discountRules||[]});
  const notice=Notice.build({...payload,rows,template:payload.template});
  if(notice.text.length>10000) throw Error('Thông báo quá dài; cần giảm số học sinh trong một lượt');
  const directory=outputDir||await fs.mkdtemp(path.join(os.tmpdir(),'mindup-tuition-'));
  const cleanup=async()=>{if(!outputDir && path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)) await fs.rm(directory,{recursive:true,force:true});};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(payload.captured_at?new Date(payload.captured_at):clock());
  const identity=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const parts=[{kind:'text',content:notice.text,identity:`text:${identity}`}];
  try {
    for(const student of notice.students) {
      const lines=statementLines(student,context,today),chunks=[];let chunk=[],classHeader;
      for(const line of lines){if(chunk.length>=24){chunks.push(chunk);chunk=[];if(!line.classTitle && classHeader)chunk.push(classHeader);}if(line.classTitle)classHeader=line;chunk.push(line);}
      if(chunk.length)chunks.push(chunk);const pages=chunks.length;
      const offset=parts.length;
      const needed=chunks.map((_,page)=>offset+page>=startPart&&!isConfirmed(`statement-v1:${identity}:${student.id}:${page}`,offset+page));
      let qr;
      if(needed.some(Boolean)){
        const qrPath=path.join(directory,`${student.id}-qr.png`);await download(student.qrUrl,qrPath);
        qr=await sharp(qrPath).resize(390,390,{fit:'contain',background:'white',kernel:'nearest'}).png().toBuffer();
      }
      for(let page=0;page<pages;page++) {
        const partIdentity=`statement-v1:${identity}:${student.id}:${page}`;
        if(!needed[page]){parts.push({kind:'image',identity:partIdentity});continue;}
        const view=statementSvg(student,payload.month,chunks[page],page,pages,context,payload.captured_at);
        const file=path.join(directory,`${student.id}-statement-${page}.png`);
        let png=sharp(Buffer.from(view.svg));
        if(view.qrTop!==null) png=png.composite([{input:qr,left:650,top:view.qrTop}]);
        await png.png().toFile(file);
        parts.push({kind:'image',file,identity:partIdentity});
      }
    }
    return {text:notice.text,parts,manifest:parts.map(p=>p.identity),cleanup};
  } catch(error){await cleanup();throw error;}
}
async function sendNotification(job,{api,store,rpc,acknowledge,schedule,prepare=prepareNotification}) {
  let media,prepared=false;
  try {
    media=await prepare(job.payload,{startPart:job.next_part,isConfirmed:(identity,index)=>{
      const base=`notice:${job.id}:${index}`,keys=Array.from({length:job.revision+1},(_,n)=>base+(n?`:retry:${n}`:''));
      return store.confirmedSend(keys,{uid:job.dispatch_uid,part:identity})!=null;
    }});
    prepared=true;
    await rpc('prepareTuitionNotice',{p_id:job.id,p_token:job.token,p_manifest:media.manifest,p_text:media.text});
    for(let index=job.next_part;index<media.parts.length;index++) {
      const part=media.parts[index],base=`notice:${job.id}:${index}`,revision=job.revision;
      const key=base+(revision?`:retry:${revision}`:'');
      const reuse=Array.from({length:revision},(_,n)=>base+(n?`:retry:${n}`:''));
      const identity={uid:job.dispatch_uid,part:part.identity};
      const begin=async()=>{
          const ok=await rpc('beginTuitionNoticePart',{p_id:job.id,p_token:job.token,p_index:index,p_allowed:schedule().allowed});
          if(!ok){const e=Error('Thông báo đã tạm dừng hoặc dữ liệu đã thay đổi');e.deferred=true;throw e;}
      };
      const saved=store.confirmedSend([key,...reuse],identity);
      let externalId;
      if(saved){await begin();externalId=saved;}
      else externalId=await store.send(key,identity,async()=>{
        const response=await api.sendMessage(part.kind==='text'?part.content:{msg:part.caption||'Điểm danh và QR học phí MindUp',attachments:[part.file]},job.dispatch_uid,undefined,begin);
        return `${job.dispatch_uid}:${requireSendAcknowledgement(response,part.kind==='text'?0:1)}`;
      },reuse);
      const done=await acknowledge({action:'finishTuitionNoticePart',jobId:job.id,args:{p_id:job.id,p_token:job.token,p_index:index,p_external_id:externalId}});
      if(done===false) return;
    }
  } catch(error) {
    if(!error.deferred) await rpc('failTuitionNotice',{p_id:job.id,p_token:job.token,p_error:(prepared?'':'[Chuẩn bị ảnh] ')+sendErrorMessage(error)});
  } finally {if(media) await media.cleanup().catch(error=>console.warn('[ZaloBot] Dọn ảnh học phí:',error.message));}
}
module.exports={prepareNotification,sendNotification,attendanceLabel,statementLines,statementSvg};
