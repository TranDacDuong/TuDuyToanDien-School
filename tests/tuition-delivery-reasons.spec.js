const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('tuition.js','utf8');
for(const width of [1280,390])test(`tuition detail reasons render safely at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 await page.setContent('<style>*{box-sizing:border-box}body{font:14px system-ui}dialog{width:min(1100px,calc(100vw - 32px));max-height:85dvh;padding:18px;border:1px solid #cbd5e1;border-radius:8px}td{max-width:320px}</style><dialog><h3>Chi tiết nhắc học phí tự động</h3><div id="automaticTuitionRows" style="overflow:auto;max-height:65dvh"></div></dialog>');
 await page.evaluate(()=>{
  window.automaticLabels={queued:'Chờ gửi',uncertain:'Chưa xác nhận gửi'};
  window.esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.automaticTuitionRows=[
   {status:'queued',parent_name:'Phụ huynh A',due_date:'2026-10-15',slot:15,completed_parts:0,total_parts:2,updated_at:'2026-10-31T12:00:00Z',waiting_reason:'Đã gửi lời mời kết bạn; hệ thống đang chờ xác nhận kết bạn.'},
   {status:'uncertain',parent_name:'Phụ huynh B',due_date:'2026-10-15',slot:15,completed_parts:0,total_parts:2,updated_at:'2026-10-31T12:00:00Z',error_message:'Zalo returned no message id'},
   {status:'uncertain',parent_name:'<img src=x onerror="window.xss=true">',due_date:'2026-10-15',slot:15,completed_parts:0,total_parts:2,updated_at:'2026-10-31T12:00:00Z',error_message:'Không thể nhận tin nhắn từ bạn.'}
  ];
 });
 const start=source.indexOf('  function automaticTuitionDeliveryNote('),end=source.indexOf('  window.openAutomaticTuitionDetails',start);
 await page.addScriptTag({content:source.slice(start,end)});
 await page.evaluate(()=>{renderAutomaticTuitionDetails();document.querySelector('dialog').showModal();});
 await expect(page.getByText(/hệ thống đang chờ xác nhận kết bạn/)).toBeVisible();
 await expect(page.getByText(/Tin có thể đã đến/)).toBeVisible();await expect(page.locator('img')).toHaveCount(0);
 expect(await page.evaluate(()=>window.xss)).toBeUndefined();
 const box=await page.locator('dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
 if(width<860){
  expect(await page.locator('#automaticTuitionRows').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.locator('#automaticTuitionRows').evaluate(el=>el.scrollLeft=el.scrollWidth);
 }
 await page.screenshot({path:`test-results/tuition-delivery-reasons-${width}.png`});
});
