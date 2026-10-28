const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseSource}=require('./parse-questions.cjs');
const {render}=require('../../word-question-content.js');
test('1000 questions retain boundaries and inline formulas',()=>{
  const source={text:Array.from({length:1000},(_,i)=>`Câu ${i+1}: Tính WORDBLOCK1TOKEN?\nA. 1\nB. 2\nC. 3\nD. 4\nĐáp án: B`).join('\n'),blocks:{WORDBLOCK1TOKEN:{text:'$\\frac{x}{2}$',warnings:[]}}};
  const items=parseSource(source);
  assert.equal(items.length,1000);
  for(const item of items){assert.equal(item.payload.answer,'B');assert.equal(item.payload.answer_count,4);assert.match(item.payload.question_text,/\\frac\{x\}\{2\}/);}
});
test('true/false option content and warnings are not lost',()=>{
  const [q]=parseSource({text:'Câu 1: Đánh giá\na. WORDBLOCK1TOKEN\nb. Hai\nc. Ba\nd. Bốn',blocks:{WORDBLOCK1TOKEN:{text:'$x^2$',warnings:['Cần kiểm tra']}}});
  assert.equal(q.payload.question_type,'true_false');assert.match(q.payload.question_text,/a\. \$x\^2\$/);assert.ok(q.warnings.includes('Cần kiểm tra'));assert.equal(q.payload.answer,'');
});
test('partial true/false answers never invent F for an unknown answer',()=>{
  const [q]=parseSource({text:'Câu 1: Đánh giá\na. Một\nb. Hai\nc. Ba\nd. Bốn\nĐáp án: a đúng',blocks:{}});
  assert.equal(q.payload.answer,'');
});
test('explanations remain separate from answer D',()=>{
  const [q]=parseSource({text:'Câu 1: Tính\nA. 1\nB. 2\nC. 3\nD. 4\nĐáp án: A\nLời giải: Vì WORDBLOCK1TOKEN',blocks:{WORDBLOCK1TOKEN:{text:'$1+0=1$',warnings:[]}}});
  assert.doesNotMatch(q.payload.question_text,/Vì/);assert.equal(q.payload.answer_text,'Vì $1+0=1$');
});
test('media retain inline order and do not become a separate figure',()=>{
  const [q]=parseSource({text:'Câu 1: trước WORDBLOCK1TOKEN giữa WORDBLOCK2TOKEN sau',blocks:{WORDBLOCK1TOKEN:{text:'[[WIMG:path1]]'},WORDBLOCK2TOKEN:{text:'[[WIMG:path2]]'}}});
  assert.match(q.payload.question_text,/trước \[\[WIMG:path1\]\] giữa \[\[WIMG:path2\]\] sau/);
});
test('rich tables escape script content and clamp spans',()=>{
  const table=Buffer.from(JSON.stringify([[{text:'<script>alert(1)</script>',colspan:999,rowspan:-1}]])).toString('base64');
  const html=render('[[WTABLE:'+table+']]');
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/colspan="200"/);
});
test('untrusted image URLs are not rendered',()=>{
  assert.doesNotMatch(render('[[WIMG:javascript:alert(1)]]'),/<img/);
  assert.match(render('[[WIMG:00000000-0000-4000-8000-000000000000/'+'a'.repeat(64)+'.png]]'),/<img/);
});
test('invalid table data displays a warning',()=>{assert.match(render('[[WTABLE:invalid]]'),/Bảng cần kiểm tra/);});
test('five-option questions retain the fifth option',()=>{
  const [q]=parseSource({text:'Câu 1: Tính\nA. 1\nB. 2\nC. 3\nD. 4\nE. 5\nĐáp án: E',blocks:{}});
  assert.equal(q.payload.question_type,'multi_choice');assert.equal(q.payload.answer_count,5);assert.match(q.payload.question_text,/E\. 5/);
});
