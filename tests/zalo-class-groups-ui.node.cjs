const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
test('private and class tabs, group timeline, scoped roster, queued reply and mobile layout',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync('messages.html','utf8'),between=(s,e)=>html.slice(html.indexOf(s),html.indexOf(e,html.indexOf(s)));
 await page.route('**/*',route=>route.fulfill({body:fs.readFileSync('favicon.png'),contentType:'image/png'}));
 await page.setContent(html.replace('<head>','<head><base href="http://inbox.test/">').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,''));
 await page.addStyleTag({path:'messages-workspace.css'});await page.addStyleTag({content:':root{--navy:#15375c;--ink:#172c48;--ink-mid:#65758a;--ink-light:#8190a4;--surface:#fff;--font-body:Arial;--font-display:Arial}'});
 await page.addScriptTag({content:`
 crypto.randomUUID=()=> '00000000-0000-0000-0000-000000000123';
 let activeFriend=null,currentConversationId=null,messageChannel=null,loadedMessages=[],hasOlderMessages=true,isLoadingOlderMessages=false,messageReadGeneration=0;
 const currentUser={id:'admin'},currentProfile={role:'admin'},zaloMessageStates={},parentInboxById=new Map(),_parentChildrenLabels=new Map(),activePresenceIds=new Set();
 const isTrayMode=false,isPopupMode=false,TRAY_CONVERSATION_LIMIT=5,FULL_CONVERSATION_PAGE_SIZE=10,MINDUP_BOT_ID='bot';let visibleConversationCount=10,userSearchResults=[];
 let allFriends=[{friend_id:'private',users:{full_name:'PH Minh Anh',role:'parent'},preview:'Tin nhắn riêng',lastActivity:'2026-10-26T09:00:00Z'}],friendMap=new Map();
 window.calls=[];const group={class_id:'class',conversation_id:'conv',class_name:'Toán 10 - Thầy Đắc Dương',connected:true,status:'partial',members:[{name:'Nguyễn Thu Trang',status:'joined'},{name:'Hoàng Thị Hà',status:'missing_link'}]};
 const rows=[{id:'one',created_at:'2026-10-26T09:00:00Z',content:'Ngày mai lớp học lúc 18 giờ nhé!',group_is_self:true,group_sender_name:'Trung tâm MindUp'},
 {id:'two',created_at:'2026-10-26T09:01:00Z',content:'Dạ, em cảm ơn thầy ạ.',group_is_self:false,group_sender_name:'Nguyễn Thu Trang'}];
 const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='list_zalo_class_groups'?[group]:name==='list_zalo_class_group_messages'?rows.slice().reverse():'msg'};},removeChannel:()=>{}};
 const esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),escapeJs=s=>s;
 const shouldRenderOfficialAudienceItem=()=>false,getOfficialAudienceDisplayName=u=>u.full_name,renderConversationNameHtml=(i,n)=>esc(n),formatRole=()=>'',formatListTime=()=> '16:00';
 const makeConversationListItem=(users,options)=>({friend_id:users.id,users,...options}),resetZaloSendMode=()=>{};
 ${between('function setComposerEnabled(','async function refreshZaloSendMode(')}
 ${between('function syncMobileConversationState(','window.closeMobileConversation =')}
 const renderMessageBody=text=>esc(text),formatTime=()=> '16:00',parseMessageContent=text=>({type:'text',text});
 const markMessageNotificationsRead=async()=>{},loadFriends=async()=>{},refreshLocalMessageBodies=()=>{};
 ${between('function normalizeConversationSearch(','function parseMessageContent(')}
 ${between('function sortConversationsByFamily(','function getUniqueGradeLabel(')}
 ${between('const _renderFriendListCore =','window.loadMoreConversations =')}
 function renderFriendList(list){_renderFriendListCore(list);}function filterFriends(){renderFriendList(getFilteredFriendList());}
 window.openConversation=id=>ClassGroupChats.open(friendMap.get(id));
 `});
 await page.addScriptTag({path:'class-group-chats.js'});await page.addScriptTag({path:'messages-workspace.js'});
 await page.evaluate(async()=>{allFriends.push(...await ClassGroupChats.fetchItems());friendMap=new Map(allFriends.map(i=>[i.friend_id,i]));filterFriends();});
 assert.equal(await page.locator('#friend_private').count(),1);assert.equal(await page.locator('#friend_class').count(),0);
 await page.getByRole('button',{name:'Nhóm lớp',exact:true}).click();assert.equal(await page.locator('#friend_private').count(),0);assert.equal(await page.locator('#friend_class').count(),1);
 await page.locator('#friend_class').click();assert.deepEqual(errors,[]);await page.locator('#messageList .bubble').filter({hasText:'Dạ, em cảm ơn thầy ạ.'}).waitFor();
 assert.equal(await page.locator('.message-row.mine').count(),1);assert.equal(await page.locator('.message-row:not(.mine)').count(),1);
 await page.getByRole('button',{name:'Thông tin hội thoại',exact:true}).click();await page.getByText('Hoàng Thị Hà · Chưa liên kết Zalo',{exact:true}).waitFor();
 await page.screenshot({path:'scratch/class-groups-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>syncMobileConversationState(true));await page.screenshot({path:'scratch/class-groups-mobile.png'});
 assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+1));
 await page.getByRole('button',{name:'Đóng thông tin hội thoại',exact:true}).click();
 await page.locator('#messageInput').fill('Thông báo mới');await page.evaluate(()=>ClassGroupChats.send());
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.name==='send_zalo_class_group_message').length),1);
 const send=await page.evaluate(()=>calls.find(c=>c.name==='send_zalo_class_group_message'));assert.equal(send.args.p_class,'class');assert.equal(send.args.p_content,'Thông báo mới');
 assert.deepEqual(errors,[]);
});
