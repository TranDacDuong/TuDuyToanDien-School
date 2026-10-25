'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),vm=require('node:vm');
const {prepareOverdueTuitionMedia:prepare,MARKER}=require('./overdue-tuition-media');
const qr=n=>({student_id:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,qr_url:`https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount=${n*100000}&addInfo=SEVQR%20HP0926%201026%20Child%20${n}`});
const wire=()=> 'Outstanding tuition'+MARKER+JSON.stringify([qr(1),qr(2)]);
test('prepares every child QR before publication and cleans all temporary images',async()=>{
 const downloaded=[];assert.equal(await prepare('Normal message'),null);
 const media=await prepare(wire(),{download:async(url,file)=>{downloaded.push(url);await fs.writeFile(file,'test-image');}});
 assert.equal(media.text,'Outstanding tuition');assert.equal(media.attachments.length,2);assert.deepEqual(media.qrUrls,downloaded);
 for(const file of media.attachments)await fs.access(file);
 await media.cleanup();for(const file of media.attachments)await assert.rejects(fs.access(file));
});
test('invalid or duplicate QR is rejected before download; a partial download failure removes all images',async()=>{
 for(const qrs of [[qr(1),qr(1)],[{...qr(1),qr_url:'https://evil.invalid/qr.png'}],[],[{...qr(1),student_id:'-'.repeat(36)}]]){
  await assert.rejects(prepare('Body'+MARKER+JSON.stringify(qrs),{download:()=>assert.fail('must not download')}));
 }
 const files=[];await assert.rejects(prepare(wire(),{download:async(url,file)=>{files.push(file);if(files.length===2)throw Error('download failed');await fs.writeFile(file,'test');}}),/download failed/);
 for(const file of files)await assert.rejects(fs.access(file));
});
async function worker({valid=true,downloadFails=false,uncertain=false}={}){
 const source=await fs.readFile(__dirname+'/server.js','utf8'),calls=[],files=[],sent=[],finished=[];
 const context={console,process,Date,Map,gatewayBusy:false,zaloApi:{sendMessage:async(message)=>{sent.push(message);return {attachment:[{msgId:'123'},{msgId:'124'}]};}},
 listenerConnected:true,GATEWAY_URL:'test',GATEWAY_TOKEN:'test',campaignStatus:'idle',nextDispatchPollAt:0,pendingIncoming:new Map(),nextAutomaticTuitionTickAt:Infinity,emptyDispatchPolls:0,
 automaticTuitionScheduler:{schedule:()=>({})},dispatchPacing:()=>({}),gatewayRequest:async payload=>{calls.push(payload.action);return payload.action==='claimDispatch'?{job:{kind:'web',job_id:'job',zalo_uid:'parent',content:wire()}}:{valid};},
 prepareOverdueTuitionMedia:content=>prepare(content,{download:async(url,file)=>{calls.push('download');files.push(file);if(downloadFails)throw Error('download failed');await fs.writeFile(file,'test');}}),
 prepareScoreMessageMedia:()=>assert.fail('must use tuition QR preparation'),localStore:{send:async(key,identity,operation)=>{assert.equal(identity.qrUrls.length,2);return operation();}},
 requireSendAcknowledgement:()=>{if(uncertain)throw Error('no message id');return '123';},isZaloLimitError:()=>false,isUncertainSendError:()=>false,acknowledgeDispatch:async a=>finished.push(a)};
 vm.runInNewContext(source.slice(source.indexOf('async function syncGatewayOutbox()'),source.indexOf('async function sendQueuedAutomaticTuition(')),context);
 await context.syncGatewayOutbox();for(const file of files)await assert.rejects(fs.access(file));return{calls,sent,finished};
}
test('worker sends text plus all QR attachments once, only after final debt validation',async()=>{
 const result=await worker();assert.equal(result.sent.length,1);assert.equal(result.sent[0].msg,'Outstanding tuition');assert.equal(result.sent[0].attachments.length,2);
 assert.deepEqual(result.calls,['claimDispatch','download','download','validateOverdueTuition']);assert.equal(result.finished[0].status,'sent');
});
test('worker never sends text alone on image failure or changed debt, and never retries ambiguous delivery',async()=>{
 for(const options of [{valid:false},{downloadFails:true}]){const r=await worker(options);assert.equal(r.sent.length,0);assert.equal(r.finished[0].status,'failed');}
 const r=await worker({uncertain:true});assert.equal(r.sent.length,1);assert.equal(r.finished[0].status,'uncertain');
});
