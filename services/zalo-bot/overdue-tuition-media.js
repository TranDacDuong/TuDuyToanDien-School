'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {downloadQrImage}=require('./zalo-image');
const MARKER='\n__TUITION_QRS__';
async function prepareOverdueTuitionMedia(content,{download=downloadQrImage}={}) {
  const at=content.indexOf(MARKER);
  if(at<0) return null;
  const text=content.slice(0,at).trim(),qrs=JSON.parse(content.slice(at+MARKER.length));
  if(!text || text.length>5000 || !Array.isArray(qrs) || !qrs.length || qrs.length>20) throw new Error('Nội dung hoặc danh sách QR quá hạn không hợp lệ');
  const students=new Set();
  for(const qr of qrs) {
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(qr.student_id || '') || students.has(qr.student_id.toLowerCase())) throw new Error('QR học sinh bị trùng hoặc không hợp lệ');
    students.add(qr.student_id.toLowerCase());
    const url=new URL(qr.qr_url);
    if(url.origin!=='https://img.vietqr.io' || !/^\/image\/[a-z0-9]+-[0-9]{6,30}-compact2[.]png$/i.test(url.pathname)
      || !/^[1-9][0-9]*$/.test(url.searchParams.get('amount') || '') || !/^SEVQR HP[0-9]/.test(url.searchParams.get('addInfo') || '')) throw new Error('QR công nợ không hợp lệ');
  }
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mindup-overdue-'));
  const cleanup=()=>fs.rm(directory,{recursive:true,force:true});
  try {
    const attachments=[];
    for(let i=0;i<qrs.length;i++) {
      const file=path.join(directory,`qr-${i}.png`);
      await download(qrs[i].qr_url,file);attachments.push(file);
    }
    return {text,attachments,qrUrls:qrs.map(qr=>qr.qr_url),errors:[],cleanup};
  } catch(error) {await cleanup();throw error;}
}
module.exports={prepareOverdueTuitionMedia,MARKER};
