const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('question_list.js','utf8');
function setup(count=2,responder){
 const items=Array.from({length:count},(_,i)=>({id:'q'+i,question_type:'multi_choice',question_text:'1+1? A.1 B.2 C.3 D.4',answer:'',answer_count:4}));
 const stored=new Map(items.map(q=>[q.id,{...q}])),calls=[],writes=[],alerts=[],audits=[];
 const button={disabled:false},progress={textContent:''};
 const ctx={AI_ANSWER_BATCH_SIZE:15,QUESTION_AI_URL:'https://test.invalid/ai',aiAnswerBusy:false,AbortSignal,Set,Map,
  console:{warn(){}},hasQuestionPermission:()=>true,isAnswerMissing:q=>!String(q.answer||'').trim(),
  getBaseFilteredQuestions:()=>items,confirm:()=>true,alert:text=>alerts.push(text),
  document:{querySelector:()=>button,getElementById:()=>progress},updateQuickActionStats(){},loadQuestions:async()=>{},
  window:{AppAuth:{getAnonEdgeFunctionHeaders:()=>({'Content-Type':'application/json'})},AppAdminTools:{recordAudit:async(name,data)=>audits.push(data)}},
  fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return responder?responder(calls.length,items):new Response(JSON.stringify({content:[{text:JSON.stringify(items.map(q=>({id:q.id,answer:'B'})))}]}))},
  sb:{from:()=>{let id,patch;const query={update:value=>{patch=value;return query},eq:(key,value)=>{id=value;return query},or:filter=>{assert.equal(filter,'answer.is.null,answer.eq.');return query},select:async()=>{
   const row=stored.get(id);if(row.answer)return {data:[],error:null};Object.assign(row,patch);writes.push(id);return {data:[{id}],error:null};}};return query;}}
 };
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function buildAiAnswerPrompt('),source.indexOf('window.fillMissingAnswersWithAI =')),ctx);
 return {ctx,items,stored,calls,writes,alerts,audits,button,progress};
}
test('429 stops the 640-question run after one request and reports the real reason',async()=>{
 const s=setup(640,()=>new Response(JSON.stringify({error:'rate limited'}),{status:429}));
 await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,1);assert.equal(s.writes.length,0);
 assert.match(s.alerts[0],/HTTP 429/);assert.match(s.alerts[0],/640 câu chưa xử lý/);assert.equal(s.button.disabled,false);assert.equal(s.ctx.aiAnswerBusy,false);
 assert.equal(s.audits[0].not_started,640);
});
test('earlier batches remain saved when the next request hits the limit',async()=>{
 const s=setup(31,(n,items)=>n===1?new Response(JSON.stringify({content:[{text:JSON.stringify(items.slice(0,15).map(q=>({id:q.id,answer:'B'})))}]})):new Response('{}',{status:429}));
 await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,2);assert.equal(s.writes.length,15);assert.match(s.alerts[0],/Đã lưu 15\/31/);assert.match(s.alerts[0],/16 câu chưa xử lý/);
});
test('strict answer validation never extracts letters from prose or invents missing false statements',()=>{
 const {ctx}=setup();
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'multi_choice',answer_count:4},'Đáp án B'),'');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'multi_choice',answer_count:4},'F'),'');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'multi_choice',answer_count:4},'B, A'),'AB');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'true_false',answer_count:4},'TF'),'');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'true_false',answer_count:4},'aT bF'),'');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'true_false',answer_count:4},'FFFF'),'FFFF');
 assert.equal(ctx.normalizeAiAnswerValue({question_type:'short_answer'},0),'0');
});
test('concurrent answers are not overwritten or counted as saved',async()=>{
 const s=setup(1);s.stored.get('q0').answer='A';await s.ctx.fillMissingAnswersWithAI();
 assert.equal(s.writes.length,0);assert.equal(s.stored.get('q0').answer,'A');assert.equal(s.audits[0].updated,0);
});
test('repeat clicks cannot start overlapping AI runs',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const s=setup(1,async()=>{await pending;return new Response('[{"id":"q0","answer":"B"}]')});
 const first=s.ctx.fillMissingAnswersWithAI();await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,1);
 release();await first;assert.equal(s.writes.length,1);assert.equal(s.button.disabled,false);
});
test('malformed or mismatched responses never update the question bank',async()=>{
 for(const body of ['{"error":"provider unavailable"}','{"hello":"world"}','[{"id":"other","answer":"A"}]','[{"id":"q0","answer":"A"},{"id":"q0","answer":"B"}]','[{"id":"q0","answer":{"guess":"A"}}]']){
  const s=setup(1,()=>new Response(body));await s.ctx.fillMissingAnswersWithAI();assert.equal(s.writes.length,0);assert.match(s.alerts[0],/Đã dừng/);
 }
});
test('network and authorization failures remain visible even if audit or refresh fails',async()=>{
 for(const status of [401,403,503]){
  const s=setup(20,()=>new Response('{}',{status}));await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,1);assert.match(s.alerts[0],new RegExp('HTTP '+status));
 }
 const s=setup(20,()=>{throw new TypeError('Failed to fetch')});
 s.ctx.window.AppAdminTools.recordAudit=async()=>{throw new Error('audit failed')};s.ctx.loadQuestions=async()=>{throw new Error('refresh failed')};
 await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,1);assert.match(s.alerts[0],/Không kết nối được/);assert.equal(s.button.disabled,false);
});
test('missing connection configuration never falls back to the invalid embedded JWT',async()=>{
 const s=setup(1);delete s.ctx.window.AppAuth;await s.ctx.fillMissingAnswersWithAI();assert.equal(s.calls.length,0);assert.match(s.alerts[0],/cấu hình kết nối/);
});
