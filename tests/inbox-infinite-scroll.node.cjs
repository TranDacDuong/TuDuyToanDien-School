const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('@playwright/test');
test('inbox scroll reveals ten more locally and retains chronological order and scroll position',async t=>{
  const html=fs.readFileSync('messages.html','utf8');
  const sort=html.slice(html.indexOf('function sortConversationsByFamily('),html.indexOf('function getUniqueGradeLabel('));
  const render=html.slice(html.indexOf('const _renderFriendListCore ='),html.indexOf('window.openFullMessagesPage ='));
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<input id="friendSearch" aria-label="Tìm hội thoại"><div id="friendListTopActions"></div><div id="friendList" style="height:500px;overflow:auto"></div>');
  await page.addStyleTag({content:'.friend-card{height:90px;box-sizing:border-box;display:flex;gap:12px;padding:12px;border-bottom:1px solid #ddd;font:14px sans-serif}.avatar{display:none}.friend-time{font-size:11px}.name{font-weight:600}'});
  await page.addScriptTag({content:`
    const isTrayMode=false,TRAY_CONVERSATION_LIMIT=5,FULL_CONVERSATION_PAGE_SIZE=10,MINDUP_BOT_ID='bot';
    let visibleConversationCount=10,activeFriend=null,friendsLoading=null,allFriends=Array.from({length:35},(_,i)=>({
      friend_id:'parent-'+i,users:{full_name:'Phụ huynh '+i},lastActivity:new Date(Date.UTC(2026,9,17,0,i)).toISOString(),
      waitingReply:i===0,unreadCount:i===1?3:0,preview:'Tin nhắn '+i
    }));
    const windowCalls=[];const currentProfile={role:'admin'},activePresenceIds=new Set();
    window.inboxUnreadOnly=false;window.inboxWaitingOnly=false;
    const sb={rpc:()=>{windowCalls.push('network');return Promise.resolve({data:[]});}};
    let friendMap=new Map();
    const shouldRenderOfficialAudienceItem=()=>false;
    const getOfficialAudienceDisplayName=u=>u.full_name;
    const renderConversationNameHtml=(item,name)=>name;
    const formatRole=()=>'',esc=v=>String(v||''),escapeJs=v=>v,formatListTime=v=>v;
    function getFilteredFriendList(){return allFriends;}
    ${sort}\n${render}
    function renderFriendList(list){_renderFriendListCore(list);}
    renderFriendList(allFriends);
  `});
  assert.equal(await page.locator('.friend-card').count(),10);
  assert.equal(await page.getByText(/Xem thêm/).count(),0);
  const first=await page.locator('.friend-card').first().getAttribute('id');assert.equal(first,'friend_parent-34');
  const scroll=page.locator('#friendList');
  await scroll.evaluate(n=>{n.scrollTop=n.scrollHeight;});
  await page.waitForFunction(()=>document.querySelectorAll('.friend-card').length===20);
  assert.equal(await page.locator('.friend-card').first().getAttribute('id'),first);
  const position=await scroll.evaluate(n=>n.scrollTop);assert.ok(position>0);
  await page.evaluate(()=>renderFriendList(allFriends));
  assert.equal(await page.locator('.friend-card').count(),20);assert.equal(await scroll.evaluate(n=>n.scrollTop),position);
  await scroll.evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForFunction(()=>document.querySelectorAll('.friend-card').length===30);
  await scroll.evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForFunction(()=>document.querySelectorAll('.friend-card').length===35);
  await scroll.evaluate(n=>{n.scrollTop=n.scrollHeight;});
  assert.equal(await page.locator('.friend-card').count(),35);
  assert.equal(await page.evaluate(()=>windowCalls.length),0);
  assert.equal(await page.locator('.friend-card').last().getAttribute('id'),'friend_parent-0');
  assert.equal(await page.locator('.friend-card').evaluateAll(nodes=>new Set(nodes.map(n=>n.id)).size),35);
  await page.screenshot({path:'scratch/inbox-infinite-scroll-mobile.png'});
  assert.match(html,/table:'messages'/);
  assert.match(html,/refreshExternalInbox\(\).catch/);
});
