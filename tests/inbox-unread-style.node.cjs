const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('messages.html','utf8');
const between=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));

test('official parent unread notifications are counted by conversation even when the actor is the bot',()=>{
 const ctx=vm.createContext({directConversations:[],parentInboxItems:[{friend_id:'parent',conversationId:'chat'}],
  unreadNotifications:[{actor_id:'bot',ref_id:'chat'},{actor_id:'bot',ref_id:'chat'}],learningItems:[],mindUpTeacherItems:[]});
 vm.runInContext(between('  const partnerIdByConversationId =','  let participantIds')+between('  const unreadMap =','  const conversationIds ='),ctx);
 assert.equal(ctx.parentInboxItems[0].unreadCount,2);
});
test('read acknowledgements are scoped to the viewer and conversation; failures and newer messages preserve the badge',async()=>{
 let failure=false,renders=0;const filters=[];
 const item={unreadCount:2,lastActivity:'2026-01-01'};
 const query={update:()=>query,eq:(...args)=>{filters.push(args);return query;},lte:(...args)=>{filters.push(args);return query;},then:resolve=>resolve({error:failure?Error('offline'):null})};
 const ctx=vm.createContext({Date,currentUser:{id:'viewer'},friendMap:new Map([['parent',item]]),sb:{from:()=>query},
  renderFriendList:()=>renders++,getFilteredFriendList:()=>[]});
 vm.runInContext(between('async function markMessageNotificationsRead(','async function ensureConversation('),ctx);
 failure=true;await assert.rejects(()=>ctx.markMessageNotificationsRead('parent','chat'),/offline/);assert.equal(item.unreadCount,2);
 failure=false;await ctx.markMessageNotificationsRead('parent','chat');assert.equal(item.unreadCount,0);assert.equal(renders,1);
 assert.ok(filters.some(([key,value])=>key==='user_id'&&value==='viewer'));
 assert.ok(filters.some(([key,value])=>key==='ref_id'&&value==='chat'));
 assert.ok(filters.some(([key])=>key==='created_at'));
 item.unreadCount=1;item.lastActivity='2999-01-01';await ctx.markMessageNotificationsRead('parent','chat');assert.equal(item.unreadCount,1);
 const open=between('window.openConversation = async','window.openLearningConversation = async');
 assert.ok(open.includes('if (messagesLoaded !== false) markMessageNotificationsRead'));
});
test('unread rows have bold previews and red counters; reply labels cannot filter or decorate conversations',async t=>{
 const {chromium}=require('@playwright/test');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.route('**/default-avatar.png',route=>route.fulfill({body:fs.readFileSync('default-avatar.png'),contentType:'image/png'}));
 const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+fs.readFileSync('messages-workspace.css','utf8');
 await page.setContent(`<base href="http://inbox.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--font-body:Arial;--font-display:Arial;--navy:#15375c;--ink:#172c48;--ink-mid:#65758a;--ink-light:#8190a4;--surface:#fff} ${css} body{background:#fff}.test-inbox{width:320px;max-width:100vw} </style><aside class="test-inbox"><div id="friendListTopActions"></div><input id="friendSearch" hidden><div id="friendList"></div></aside>`);
 await page.addScriptTag({content:`
 const isTrayMode=false,TRAY_CONVERSATION_LIMIT=5,FULL_CONVERSATION_PAGE_SIZE=10,MINDUP_BOT_ID='bot';
 let visibleConversationCount=10,activeFriend=null,allFriends=[
 {friend_id:'one',users:{full_name:'PH Minh Anh'},preview:'Thầy kiểm tra giúp em với ạ',unreadCount:2,waitingReply:true,lastActivity:'2026-10-25T10:08:00Z'},
 {friend_id:'two',users:{full_name:'PH Gia Huy'},preview:'Em cảm ơn trung tâm',unreadCount:0,waitingReply:true,lastActivity:'2026-10-25T10:07:00Z'},
 {friend_id:'three',users:{full_name:'PH Hà Anh'},preview:'Mai con xin phép nghỉ ạ',unreadCount:1,lastActivity:'2026-10-25T10:06:00Z'}];
 const activePresenceIds=new Set();window.inboxUnreadOnly=false;window.inboxWaitingOnly=true;
 const shouldRenderOfficialAudienceItem=()=>false,getOfficialAudienceDisplayName=u=>u.full_name;
 const esc=v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const renderConversationNameHtml=(item,name)=>'<span class="name-primary">'+esc(name)+'</span>';
 const formatRole=()=>'',escapeJs=v=>v,formatListTime=()=> '17:08';
 ${between('function sortConversationsByFamily(','function getUniqueGradeLabel(')}
 ${between('const _renderFriendListCore =','window.loadMoreConversations =')}
 function render(){_renderFriendListCore(allFriends);}render();
 `});
 assert.equal(await page.locator('.friend-card').count(),3);assert.equal(await page.getByText('Chưa phản hồi',{exact:true}).count(),0);
 assert.equal(await page.locator('#friend_one .friend-badge').innerText(),'2');
 assert.equal(await page.locator('#friend_one .preview').evaluate(n=>getComputedStyle(n).fontWeight),'600');
 assert.equal(await page.locator('#friend_one .name-primary').evaluate(n=>getComputedStyle(n).fontWeight),'700');
 assert.equal(await page.locator('#friend_two .name-primary').evaluate(n=>getComputedStyle(n).fontWeight),'500');
 assert.equal(await page.locator('#friend_two .friend-badge').isVisible(),false);
 assert.equal(await page.locator('#friend_one .friend-badge').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(239, 68, 68)');
 await page.screenshot({path:'scratch/inbox-unread-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'scratch/inbox-unread-mobile.png'});
 await page.evaluate(()=>{allFriends[0].unreadCount=0;render();});
 assert.equal(await page.locator('#friend_one').getAttribute('class').then(c=>c.includes('unread')),false);
 assert.equal(await page.locator('#friend_one .friend-badge').isVisible(),false);
 assert.equal(await page.locator('.friend-card').first().getAttribute('id'),'friend_one');
 assert.ok(!html.includes('waiting-reply-label'));
});
