const test = require('node:test');
const assert = require('node:assert/strict');
const { sendTuitionQr } = require('./tuition-qr');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('QR-only repair does not resend tuition text', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const fn = source.slice(source.indexOf('async function sendQueuedTuition(job)'), source.indexOf('async function sendQueuedTuitionReceipt(job)'));
  let textCalls=0, qrCalls=0;
  const results=[];
  const context={__dirname, path, fs:{mkdirSync(){},unlinkSync(){}},
    zaloApi:{sendMessage:async()=>{textCalls++;}},
    gatewayRequest:async()=>({sendAt:new Date().toISOString()}),dispatchPacing:()=>({}),
    retryPreparation:async fn=>fn(),sleep:async()=>{},downloadImage:async()=>{},
    sendTuitionQr:async()=>{qrCalls++;return '123';},
    acknowledgeDispatch:async result=>results.push(result),isZaloLimitError:()=>false};
  vm.createContext(context); vm.runInContext(fn,context);
  await context.sendQueuedTuition({job_id:'repair',zalo_uid:'parent',content:null,qr_url:'https://img.vietqr.io/image/test.png'});
  assert.equal(textCalls,0); assert.equal(qrCalls,1);
  assert.equal(results[0].status,'sent'); assert.equal(results[0].qrSent,true);
  assert.equal(results[0].externalId,null);
});
test('retries file upload but publishes QR exactly once and restores SDK', async () => {
  let uploads=0, publications=0;
  const api={uploadAttachment:async () => { if (++uploads<3) throw new Error('fetch failed'); return []; }};
  const original=api.uploadAttachment;
  api.sendMessage=async payload => { await api.uploadAttachment(payload.attachments); publications++; return {message:null,attachment:[{msgId:44}]}; };
  assert.equal(await sendTuitionQr(api,'parent','qr.png',async()=>{}),'44');
  assert.equal(uploads,3); assert.equal(publications,1); assert.equal(api.uploadAttachment,original);
});
test('never retries an ambiguous image publication', async () => {
  let publications=0;
  const api={uploadAttachment:async()=>[],sendMessage:async()=>{ publications++; throw new Error('fetch failed'); }};
  await assert.rejects(sendTuitionQr(api,'parent','qr.png',async()=>{}),error=>error.qrStage==='Gửi ảnh QR qua Zalo');
  assert.equal(publications,1);
});
