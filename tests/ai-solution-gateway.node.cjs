const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function setup(env={},fetcher=async()=>new Response('{}',{status:429})){
 let handler;const calls=[];
 vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/ai-solution/index.ts','utf8'),{mode:'transform'}),{
  Deno:{env:{get:name=>env[name]},serve:fn=>handler=fn},Response,Request,AbortSignal,
  fetch:async(url,options)=>{calls.push({url,options});return fetcher(calls.length,url,options)}
 });
 return {calls,send:body=>handler(new Request('https://test.invalid/ai',{method:'POST',body:JSON.stringify(body)})),handler};
}
const input={messages:[{role:'user',content:'1+1?'}]};
test('Gemini uses plural and legacy key configurations without duplicates and retains old response shape',async()=>{
 const g=setup({GEMINI_API_KEYS:'["first","second","first"]',GEMINI_API_KEY:'second',GEMINI_TEXT_MODEL:'other-model'},async n=>n===1?new Response('{}',{status:429}):new Response(JSON.stringify({candidates:[{content:{parts:[{text:'private thought',thought:true},{text:'[{"answer":'},{text:'"B"}]'}]}}]})));
 const r=await g.send(input);assert.equal(r.status,200);assert.equal(g.calls.length,2);
 assert.equal(g.calls[0].options.headers['x-goog-api-key'],'first');assert.equal(g.calls[1].options.headers['x-goog-api-key'],'second');
 assert.match(g.calls[1].url,/gemini-2.5-flash/);assert.ok(!g.calls[1].url.includes('second'));
 assert.equal((await r.json()).content[0].text,'[{"answer":"B"}]');
});
test('newline and comma key lists work, while all exhausted keys return a real 429 without secret values',async()=>{
 const g=setup({GEMINI_API_KEYS:'first,second\nthird',GEMINI_API_KEY:'["first"]'});
 const r=await g.send(input),body=await r.text();assert.equal(r.status,429);assert.equal(g.calls.length,3);
 assert.doesNotMatch(body,/"first"|"second"|"third"/);assert.match(body,/hạn mức/);
});
test('legacy image requests remain compatible',async()=>{
 const g=setup({GEMINI_API_KEY:'legacy'},async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Image answer'}]}}]})));
 const r=await g.send({messages:[{role:'user',content:[{type:'text',text:'Read image'},{type:'image',source:{type:'base64',media_type:'image/png',data:'AA=='}}]}]});
 assert.equal(r.status,200);const parts=JSON.parse(g.calls[0].options.body).contents[0].parts;
 assert.equal(parts[1].inline_data.mime_type,'image/png');assert.equal(parts[1].inline_data.data,'AA==');
});
test('missing keys, invalid input and non-quota failures are not disguised as success',async()=>{
 assert.equal((await setup().send(input)).status,503);
 const g=setup({GEMINI_API_KEY:'test'},async()=>new Response('{}',{status:403}));
 assert.equal((await g.send(input)).status,502);assert.equal((await g.send({messages:[]})).status,400);
 assert.equal((await g.handler(new Request('https://test.invalid/ai',{method:'OPTIONS'}))).status,200);
 assert.equal((await g.handler(new Request('https://test.invalid/ai'))).status,405);
});
test('blocked or truncated output cannot look like a valid generated answer',async()=>{
 const blocked=setup({GEMINI_API_KEY:'test'},async()=>new Response(JSON.stringify({candidates:[{content:{parts:[]}}]})));
 assert.equal((await blocked.send(input)).status,422);
 const cut=setup({GEMINI_API_KEY:'test'},async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'half output'}]}}]})));
 assert.equal((await cut.send(input)).status,502);
});

test('answer filling prefers current Flash-Lite models and falls back across models on quota',async()=>{
 const g=setup({GEMINI_API_KEYS:'first,second'},async n=>n<3?new Response('{}',{status:429}):new Response(JSON.stringify({candidates:[{content:{parts:[{text:'[{"answer":"B"}]'}]}}]})));
 const r=await g.send({...input,purpose:'question_answers'});
 assert.equal(r.status,200);assert.equal((await r.json()).model,'gemini-3.1-flash-lite');
 assert.match(g.calls[0].url,/gemini-3.5-flash-lite/);assert.match(g.calls[1].url,/gemini-3.5-flash-lite/);
 assert.match(g.calls[2].url,/gemini-3.1-flash-lite/);
});

test('unavailable models skip remaining keys; quota cooldowns avoid hammering exhausted keys',async()=>{
 const g=setup({GEMINI_API_KEYS:'first,second'},async()=>new Response('{}',{status:404}));
 assert.equal((await g.send({...input,purpose:'question_answers'})).status,502);assert.equal(g.calls.length,4);
 const limited=setup({GEMINI_API_KEY:'test'});
 let r=await limited.send({...input,purpose:'question_answers'});assert.equal((await r.json()).retry_after_seconds,60);
 assert.equal(limited.calls.length,4);r=await limited.send({...input,purpose:'question_answers'});
 assert.equal(r.status,429);assert.equal(limited.calls.length,4);
});

test('daily quota does not invite an immediate retry and provider secrets remain hidden',async()=>{
 const g=setup({GEMINI_API_KEY:'secret'},async()=>new Response(JSON.stringify({error:{details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]},{retryDelay:'1s'}]}}),{status:429}));
 const body=await (await g.send({...input,purpose:'question_answers'})).json();
 assert.equal(body.retry_after_seconds,86400);assert.ok(!JSON.stringify(body).includes('secret'));
});
