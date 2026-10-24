const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('messages.html','utf8');
const source=html.slice(html.indexOf('let localBodiesBusy ='),html.indexOf('async function queryConversationMessages('));
function fixture(){let resolve;const hydration=new Promise(done=>resolve=done);const wrap={scrollTop:10,scrollHeight:1000,clientHeight:300};
 const ctx={sb:{},window:{LocalMessageHistory:{hydrate:()=>hydration}},loadedMessages:[{id:'old',content:'__MINDUP_LOCAL_V1__:m:old'},{id:'new',content:'Recent message'}],
  activeFriend:{id:'parent'},currentConversationId:'conversation',document:{getElementById:()=>wrap},Date,console,alerts:[],renders:0,
  alert:text=>ctx.alerts.push(text),renderLoadedMessages:()=>ctx.renders++};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,resolve,wrap};}
test('recent messages remain visible while old bodies load in background, without changing cursor or scroll',async()=>{
 const {ctx,resolve,wrap}=fixture();const pending=ctx.window.refreshLocalMessageBodies();
 assert.equal(ctx.loadedMessages[1].content,'Recent message');assert.equal(ctx.renders,0);
 resolve([{id:'old',content:'Archived message'}]);await pending;
 assert.equal(ctx.loadedMessages[0].content,'Archived message');assert.equal(ctx.loadedMessages[1].content,'Recent message');
 assert.equal(wrap.scrollTop,10);assert.equal(ctx.renders,1);
});
test('a late archive response cannot repaint another parent conversation',async()=>{
 const {ctx,resolve}=fixture();const pending=ctx.window.refreshLocalMessageBodies();ctx.activeFriend={id:'other'};ctx.loadedMessages=[{id:'other',content:'Other parent'}];
 resolve([{id:'old',content:'Private old text'}]);await pending;
 assert.equal(ctx.loadedMessages[0].content,'Other parent');assert.equal(ctx.renders,0);
});
