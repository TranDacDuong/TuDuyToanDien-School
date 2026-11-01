const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('question_list.js','utf8');
const html=fs.readFileSync('question.html','utf8');
async function setup(page){
 const button=html.match(/<button[^>]*data-testid="question-quick-ai-answer"[\s\S]*?<\/button>/)[0];
 await page.setContent(`<style>body{font:14px system-ui;margin:24px}button{max-width:360px;padding:16px;text-align:left}button span{display:block;margin-top:8px}#result{white-space:pre-wrap;max-width:600px}</style>${button}<p id="result" role="status"></p>`);
 await page.evaluate(()=>{
  window.aiAnswerBusy=false;window.AI_ANSWER_BATCH_SIZE=15;window.QUESTION_AI_URL='https://test.invalid/ai';
  window._requests=0;window._writes=[];window._questions=Array.from({length:30},(_,i)=>({id:'q'+i,question_type:'multi_choice',answer_count:4,answer:'',question_text:'1+1? A.1 B.2 C.3 D.4'}));
  window.AppAuth={getAnonEdgeFunctionHeaders:()=>({'Content-Type':'application/json'})};
  window.hasQuestionPermission=()=>true;window.isAnswerMissing=q=>!q.answer;window.getBaseFilteredQuestions=()=>window._questions;
  window.confirm=()=>true;window.alert=text=>document.querySelector('#result').textContent=text;
  window.loadQuestions=async()=>{};window.updateQuickActionStats=()=>{};
  window.fetch=async()=>{window._requests++;return new Promise(resolve=>window._respond=resolve)};
  window.sb={from:()=>{let id,patch;const q={update:p=>{patch=p;return q},eq:(key,value)=>{id=value;return q},or:()=>q,select:async()=>{window._writes.push({id,...patch});return {data:[{id}],error:null}}};return q}};
 });
 await page.addScriptTag({content:source.slice(source.indexOf('function buildAiAnswerPrompt('),source.indexOf('window.fillMissingAnswersWithAI ='))});
}
test('AI answer button shows progress, blocks double clicks and displays quota error',async({page})=>{
 await setup(page);await page.getByTestId('question-quick-ai-answer').click();
 await expect(page.getByTestId('question-quick-ai-answer')).toBeDisabled();await expect(page.locator('#quickAiAnswerCount')).toContainText('0/30');
 await page.evaluate(()=>fillMissingAnswersWithAI());expect(await page.evaluate(()=>window._requests)).toBe(1);
 await page.evaluate(()=>window._respond(new Response(JSON.stringify({error:'rate limited'}),{status:429})));
 await expect(page.locator('#result')).toContainText('HTTP 429');await expect(page.locator('#result')).toContainText('30 câu chưa xử lý');
 await expect(page.getByTestId('question-quick-ai-answer')).toBeEnabled();expect(await page.evaluate(()=>window._writes)).toHaveLength(0);
});
test('successful first batch stays saved when next batch stops on quota',async({page})=>{
 await setup(page);await page.getByTestId('question-quick-ai-answer').click();
 await page.evaluate(()=>window._respond(new Response(JSON.stringify({content:[{text:JSON.stringify(window._questions.slice(0,15).map(q=>({id:q.id,answer:'B'})))}]}))));
 await expect.poll(()=>page.evaluate(()=>window._requests)).toBe(2);
 await expect(page.locator('#quickAiAnswerCount')).toContainText('Đã lưu 15');
 await page.evaluate(()=>window._respond(new Response('{}',{status:429})));
 await expect(page.locator('#result')).toContainText('Đã lưu 15/30');expect(await page.evaluate(()=>window._writes)).toHaveLength(15);
});
