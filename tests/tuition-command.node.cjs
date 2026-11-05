const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Notice=require('../tuition-notice');
test('web command stays out of chat and reuses its request key after a lost response',async()=>{
 const html=fs.readFileSync('messages.html','utf8'),start=html.lastIndexOf('window.sendMessage = async function()'),end=html.indexOf('\n};',start)+3;
 const input={value:'#hocphi 11/2026'},button={},calls=[],alerts=[];let fail=true;
 const context={window:{TuitionNotice:Notice},activeFriend:{id:'parent',role:'parent'},friendMap:new Map(),currentConversationId:'conversation',
 document:{getElementById:id=>id==='messageInput'?input:id==='messageImage'?{files:[]}:button},crypto:{randomUUID:()=> 'request-key'},alert:s=>alerts.push(s),
 sb:{rpc:async(name,args)=>{calls.push({name,args});if(fail){fail=false;return {error:{message:'lost response'}};}return {data:{queued:1}};}},
 appendOptimisticMessage:()=>{throw Error('Command leaked to chat');}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 await context.window.sendMessage();assert.equal(input.value,'#hocphi 11/2026');assert.equal(button.disabled,false);
 await context.window.sendMessage();assert.equal(input.value,'');assert.equal(calls.length,2);
 assert.equal(calls[0].name,'queue_tuition_notification');assert.equal(calls[0].args.p_month,'2026-11-01');
 assert.equal(calls[0].args.p_request,calls[1].args.p_request);assert.equal(calls[0].args.p_students,null);
 assert.ok(alerts[1].includes('Đã xếp hàng'));
});
test('parent incoming commands never execute; own Zalo command uses verified-thread gateway',async()=>{
 const source=fs.readFileSync('services/zalo-bot/server.js','utf8'),start=source.indexOf('async function handleTuitionNoticeCommand('),end=source.indexOf('async function handleParentLinkCommand',start);
 const calls=[];
 const context={TuitionNoticeCommand:Notice,gatewayRequest:async args=>{calls.push(args);return {data:{queued:1}};},zaloApi:{},console};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 await context.handleTuitionNoticeCommand({isSelf:false,type:0,threadId:'123',data:{msgId:'456',content:'#hocphi'}});assert.equal(calls.length,0);
 await context.handleTuitionNoticeCommand({isSelf:true,type:1,threadId:'123',data:{msgId:'456',content:'#hocphi'}});assert.equal(calls.length,0);
 await context.handleTuitionNoticeCommand({isSelf:true,type:0,threadId:'123',data:{msgId:'456',content:'#hocphi 11/2026'}});
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_uid,'123');assert.equal(calls[0].args.p_external_id,'456');assert.equal(calls[0].args.p_month,'2026-11-01');
});
