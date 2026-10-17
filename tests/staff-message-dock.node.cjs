const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');

test('staff dock is role restricted, lazy, persistent when minimized and fits desktop/mobile', async t => {
  const source = fs.readFileSync('messages.html','utf8');
  const preview = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
    .replace(/<div class="empty"><strong>Đang tải<\/strong>[\s\S]*?<\/div>/,
      '<div class="friend-card"><img class="avatar" src="favicon.png" alt=""><div class="friend-main"><div class="name">Phụ huynh thử nghiệm</div><div class="preview">Tin nhắn thử nghiệm</div></div></div>')
    .replace('<html lang="vi">','<html lang="vi" class="popup-mode">');
  const app = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="staff-message-dock.css"></head><body><h1>Workspace</h1><script src="staff-message-dock.js"></script></body></html>';
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    if(pathname==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(app);}
    if(pathname==='/messages.html') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(preview);}
    const allowed = /^\/(staff-message-dock\.(css|js)|messages-workspace\.css|theme\.css|favicon\.png|default-avatar\.png|assets\/icons\/[a-z0-9-]+\.svg)$/;
    if(!allowed.test(pathname)) {res.statusCode=404;return res.end();}
    const file=path.join(process.cwd(),pathname.slice(1));
    const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
    res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true}); t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('https://**/*',route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const role of ['student','parent','guest']) {
    await page.evaluate(role=>window.StaffMessageDock.configure({id:'viewer',role}),role);
    assert.equal(await page.locator('#staffMessageLauncher').count(),0);
  }
  for(const role of ['admin','teacher','assistant','marketing','accountant','staff']) {
    await page.evaluate(role=>window.StaffMessageDock.configure({id:role,role}),role);
    assert.equal(await page.locator('#staffMessageLauncher').count(),1);
  }
  await page.evaluate(()=>window.StaffMessageDock.configure({id:'admin',role:'admin'}));
  const launcher=await page.locator('#staffMessageLauncher').boundingBox();
  assert.equal(1440-launcher.x-launcher.width,16);
  assert.equal(await page.locator('#staffMessagePanel iframe').getAttribute('src'),null);
  await page.getByRole('button',{name:'Mở tin nhắn',exact:true}).click();
  await page.frameLocator('#staffMessagePanel iframe').getByText('Phụ huynh thử nghiệm',{exact:true}).waitFor();
  const src=await page.locator('#staffMessagePanel iframe').getAttribute('src');
  await page.locator('#staffMessagePanel iframe').evaluate(frame=>frame.dataset.draft='kept');
  await page.screenshot({path:'scratch/staff-dock-desktop.png'});
  await page.getByRole('button',{name:'Thu nhỏ tin nhắn',exact:true}).click();
  assert.equal(await page.locator('#staffMessagePanel').isVisible(),false);
  await page.getByRole('button',{name:'Mở tin nhắn',exact:true}).click();
  assert.equal(await page.locator('#staffMessagePanel iframe').getAttribute('src'),src);
  assert.equal(await page.locator('#staffMessagePanel iframe').getAttribute('data-draft'),'kept');
  await page.getByRole('button',{name:'Phóng to hoặc thu gọn tin nhắn'}).click();
  assert.equal(await page.locator('#staffMessagePanel').evaluate(node=>node.classList.contains('expanded')),true);
  await page.setViewportSize({width:390,height:844});
  const mobileLauncher=await page.locator('#staffMessageLauncher').boundingBox();
  assert.equal(390-mobileLauncher.x-mobileLauncher.width,12);
  const box=await page.locator('#staffMessagePanel').boundingBox();
  assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=390 && box.y+box.height<=844);
  await page.screenshot({path:'scratch/staff-dock-mobile.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#staffMessagePanel').isVisible(),false);
  await page.evaluate(()=>window.StaffMessageDock.configure(null));
  assert.equal(await page.locator('#staffMessageDock').count(),0);
});
