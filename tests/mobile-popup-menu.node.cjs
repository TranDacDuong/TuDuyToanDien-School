const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require('@playwright/test');
test('mobile menu replaces bottom navigation, respects roles and sits below messages',async t=>{
  const original=fs.readFileSync('dashboard.html','utf8');
  for(const match of original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if(!match[1].includes('src='))new vm.Script(match[2]);
  }
  const sidebar=original.slice(original.indexOf('const sidebar  ='),original.indexOf('/* ── Dashboard init'));
  const roles=original.slice(original.indexOf('function applyRoleMenu('),original.indexOf('function setActiveMenuItem('));
  let html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  html=html.replace('</body>',`<script src="staff-message-dock.js"></script><script>
    document.body.style.visibility='visible';document.getElementById('mindupEntrySplash').remove();
    const mobileNavItems=[...document.querySelectorAll('#mobileNav .mobile-nav-item')],MOBILE_NAV_ORDER={};
    window.AppPermissions={has:(key,fallback)=>fallback};
    ${sidebar}\n${roles}
    document.querySelectorAll('#menu li').forEach(item=>{item.tabIndex=0;item.onclick=()=>closeSidebar();});
    applyRoleMenu('admin');StaffMessageDock.configure({id:'staff',role:'admin'});
    </script></body>`);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost').pathname;
    if(url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
    if(!/^\/(staff-message-dock\.(css|js)|theme\.css|assets\/icons\/[\w-]+\.svg|default-avatar\.png)$/.test(url)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',url.endsWith('.css')?'text/css':url.endsWith('.js')?'application/javascript':url.endsWith('.svg')?'image/svg+xml':'image/png');
    res.end(fs.readFileSync(path.join(process.cwd(),url.slice(1))));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await page.locator('#mobileNav').isVisible(),false);
  const menu=page.getByRole('button',{name:'Mở menu',exact:true});
  const menuBox=await menu.boundingBox(),messageBox=await page.locator('#staffMessageLauncher').boundingBox();
  assert.equal(menuBox.x,messageBox.x);assert.ok(messageBox.y+messageBox.height<menuBox.y);
  await menu.click();await page.getByRole('dialog',{name:'Menu điều hướng'}).waitFor();
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  const box=await page.locator('#sidebar').boundingBox();assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=390 && box.y+box.height<menuBox.y);
  assert.equal(await page.locator('#menu').evaluate(n=>n.scrollHeight>n.clientHeight),true);
  await page.screenshot({path:'scratch/mobile-menu-open.png'});
  await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.equal(await menu.evaluate(n=>n===document.activeElement),true);
  await menu.click();await page.mouse.click(2,5);assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.click();await page.locator('#menu li[data-page="home.html"]').click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>{applyRoleMenu('parent');StaffMessageDock.configure(null);});
  await menu.click();assert.equal(await page.locator('#menu li[data-page="ops-center"]').isVisible(),false);
  assert.equal(await page.locator('#menu li[data-page="tuition.html"]').isVisible(),true);
  await page.screenshot({path:'scratch/mobile-menu-parent.png'});
  for(const viewport of [{width:320,height:568},{width:667,height:375}]) {
    await page.setViewportSize(viewport);await page.evaluate(()=>openSidebar());
    const popup=await page.locator('#sidebar').boundingBox();
    assert.ok(popup.x>=0 && popup.y>=0 && popup.x+popup.width<=viewport.width && popup.y+popup.height<=viewport.height);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{applyRoleMenu('admin');openSidebar();});
  const desktop=await page.locator('#sidebar').boundingBox();assert.equal(desktop.x,0);assert.equal(desktop.width,240);
  assert.deepEqual(errors,[]);
});
