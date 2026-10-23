const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

test('profile failure stays signed in and retry restores the role menu on desktop and mobile', async t => {
  const source = fs.readFileSync('dashboard.html', 'utf8');
  const init = source.slice(source.indexOf('function showDashboardAuthState('), source.indexOf('function loadUserInfo('));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  await page.addScriptTag({ content: fs.readFileSync('dashboard-auth.js', 'utf8') });
  await page.addScriptTag({ content: `
    let dashboardInitGeneration=0,currentDashboardUser=null,currentDashboardProfile=null;
    window.profileAllowed=false;window.logoutCalls=0;window.navigations=[];
    const user={id:'user'};
    window.AppAuth={getUser:async()=>user};
    window.AppPermissions={load:async()=>{},has:()=>false};
    const sb={from:()=>({select(){return this},eq(){return this},abortSignal(){return this},
      maybeSingle:async()=>window.profileAllowed?{data:{id:'user',role:'admin'}}:{status:401,error:{code:'PGRST301'}}}),
      auth:{refreshSession:async()=>({data:{session:{user}}})}};
    function logout(){window.logoutCalls++}
    function applyGuestMenu(){}
    function setupMenu(){}
    function updateFacebookPostingMenuAccess(){}
    function applyRoleMenu(role){document.body.dataset.loadedRole=role}
    function checkProfile(){}
    function loadUserInfo(){}
    function loadFriendRequestBadge(){}
    function loadMessageBadge(){}
    function subscribeBadgeChanges(){}
    function loadRecentMessagesPopup(){}
    function getDashboardUrlPage(){return 'tuition.html'}
    function openDashboardPage(page){window.navigations.push(page)}
    ${init}
    document.getElementById('mindupEntrySplash')?.remove();
    initDashboard();
  ` });
  await page.getByText('Mã kiểm tra: PGRST301', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.logoutCalls), 0);
  for (const size of [{width:1440,height:900}, {width:390,height:844}, {width:320,height:568}]) {
    await page.setViewportSize(size);
    const box = await page.locator('#dashboardAuthRecovery > div').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height);
  }
  await page.screenshot({ path: 'scratch/dashboard-auth-recovery-mobile.png' });
  await page.evaluate(() => { window.profileAllowed = true; });
  await page.getByRole('button', {name:'Thử lại',exact:true}).click();
  await page.locator('#dashboardAuthRecovery').waitFor({state:'hidden'});
  assert.equal(await page.locator('body').getAttribute('data-loaded-role'), 'admin');
  assert.deepEqual(await page.evaluate(() => window.navigations), ['tuition.html']);
  assert.equal(await page.evaluate(() => window.logoutCalls), 0);
  assert.deepEqual(errors, []);
});
