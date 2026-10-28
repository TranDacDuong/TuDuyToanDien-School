const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {parseSource}=require('../services/word-import/parse-questions.cjs');
const root=path.resolve(__dirname,'..');
test('real DOCX sample: all questions, formulas and images render on desktop/mobile',async({page})=>{
  test.skip(!process.env.WORD_IMPORT_SAMPLE_PATH,'Set WORD_IMPORT_SAMPLE_PATH to a local sample DOCX.');
  test.setTimeout(120000);
  const python=path.join(root,'services/word-import/.venv/Scripts/python.exe');
  const code="import sys,json,base64;sys.path.insert(0,sys.argv[2]);from docx_source import DocxSource;images={};s=DocxSource(sys.argv[1],'00000000-0000-4000-8000-000000000000',lambda n,p:images.update({n:base64.b64encode(p).decode()})).read();print(json.dumps(dict(source=s,images=images)))";
  const {source,images}=JSON.parse(execFileSync(python,['-c',code,process.env.WORD_IMPORT_SAMPLE_PATH,path.join(root,'services/word-import')],{encoding:'utf8',maxBuffer:40*1024*1024}));
  const items=parseSource(source);
  expect(source.stats.formulas).toBe(128);expect(source.stats.formula_errors).toBe(0);expect(source.stats.image_errors).toBe(0);
  expect(items).toHaveLength(22);expect(items[12].payload.question_text).toContain('a.');expect(items[12].payload.question_text).toContain('d.');
  await page.route('**/storage/v1/object/public/word-question-media/**',route=>{
    const name=route.request().url().split('/').pop();return images[name]?route.fulfill({status:200,contentType:'image/png',body:Buffer.from(images[name],'base64')}):route.abort();
  });
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px;font:16px/1.7 system-ui;color:#172b43}article{padding:16px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere}main{max-width:1000px;margin:auto}</style></head><body><main id="sample"></main></body></html>');
  await page.addScriptTag({path:path.join(root,'word-question-content.js')});
  await page.evaluate(items=>{
    window.MathJax={tex:{inlineMath:[['$','$']]},startup:{typeset:false}};
    document.querySelector('main').innerHTML=items.map(i=>`<article><h3>Câu ${i.ordinal}</h3>${window.WordQuestionContent.render(i.payload.question_text)}</article>`).join('');
  },items);
  await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js'});
  await page.evaluate(async()=>{await window.MathJax.startup.promise;await window.MathJax.typesetPromise([document.querySelector('main')]);});
  await expect(page.locator('mjx-merror,[data-mjx-error]')).toHaveCount(0);
  expect(await page.locator('mjx-container').count()).toBeGreaterThan(100);
  await page.locator('.word-question-image').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));
  await expect.poll(()=>page.locator('.word-question-image').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  const imgs=await page.locator('.word-question-image').evaluateAll(imgs=>imgs.map(i=>({loaded:i.complete&&i.naturalWidth>0})));
  expect(imgs.length).toBeGreaterThan(0);expect(imgs.every(i=>i.loaded)).toBe(true);
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:path.join(root,'test-results',`word-sample-${width}.png`),fullPage:true});
    await page.screenshot({path:path.join(root,'test-results',`word-sample-viewport-${width}.png`)});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
