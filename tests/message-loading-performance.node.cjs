const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('messages.html','utf8');
function between(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}

test('scoped inbox paints before metadata; supplemental requests run together and retain external contacts',async()=>{
  const gates=new Map(),calls=[];let painted;
  const ctx={console,currentUser:{id:'staff'},currentProfile:{role:'admin'},Date,Promise,
    friendMap:new Map(),parentReplyPriorityCache:new Map(),allFriends:[],parentInboxById:new Map(),
    isMindUpStaffRole:()=>true,getMessagePreview:v=>v,
    makeConversationListItem:(user,options)=>({friend_id:user.id,users:user,...options}),
    document:{querySelector:()=>({})},window:{setInboxFilter(){}},
    sb:{rpc:name=>{calls.push(name);const gate=deferred();gates.set(name,gate);return gate.promise;}}};
  vm.createContext(ctx);vm.runInContext(between('const inboxMetadataRequests','async function fetchLearningConversationItems'),ctx);
  const request=ctx.fetchMindupParentInboxItems(items=>{painted=items;});
  gates.get('list_mindup_parent_inbox').resolve({data:[{parent_id:'parent',parent_name:'Parent',conversation_id:'conversation',children:[{id:'child',name:'Child'}],last_content:'Hello'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(painted[0].conversationId,'conversation');
  assert.equal(painted[0].children[0].id,'child');
  assert.deepEqual(calls,['list_mindup_parent_inbox','list_mindup_parent_zalo_aliases','list_mindup_parent_reply_priority','list_zalo_contact_profiles','list_zalo_external_inbox']);
  gates.get('list_mindup_parent_zalo_aliases').resolve({data:[{parent_id:'parent',zalo_alias:'Nickname'}]});
  gates.get('list_mindup_parent_reply_priority').resolve({data:[{parent_id:'parent',waiting_reply:true}]});
  gates.get('list_zalo_contact_profiles').resolve({data:[]});
  gates.get('list_zalo_external_inbox').resolve({data:[{id:'external',display_name:'Unlinked',last_content:'Hi'}]});
  const items=await request;
  assert.equal(items[0].users.zalo_alias,'Nickname');assert.equal(items[0].waitingReply,true);
  assert.equal(items[1].isZaloExternal,true);
  await ctx.inboxMetadata('list_mindup_parent_zalo_aliases');
  assert.equal(calls.filter(n=>n==='list_mindup_parent_zalo_aliases').length,1);
  ctx.currentUser={id:'other-staff'};
  const other=ctx.inboxMetadata('list_mindup_parent_zalo_aliases');
  assert.equal(calls.filter(n=>n==='list_mindup_parent_zalo_aliases').length,2);
  gates.get('list_mindup_parent_zalo_aliases').resolve({data:[]});await other;
});

test('overlapping inbox refreshes share one request and schedule one trailing refresh',async()=>{
  const gate=deferred();let runs=0,trailing=0;
  const ctx={loadFriendsNow:()=>{runs++;return gate.promise;},scheduleFriendsReload:()=>trailing++};
  vm.createContext(ctx);vm.runInContext(between('let friendsLoading','async function loadFriendsNow'),ctx);
  const first=ctx.loadFriends();const second=ctx.loadFriends();ctx.loadFriends();
  assert.equal(first,second);assert.equal(runs,1);
  gate.resolve();await first;assert.equal(trailing,1);
});

test('unreadable sender profiles do not trigger an infinite render/fetch loop',async()=>{
  const gate=deferred();let queries=0,renders=0;
  const ctx={Date,console,activeFriend:{id:'parent'},currentConversationId:'conversation',
    loadedMessages:[{sender_id:'not-visible',real_sender_id:'not-visible'}],
    _realSenderProfiles:new Map(),_realSenderNames:new Map(),prefetchUserContextProfiles:async()=>{},
    renderLoadedMessages:()=>renders++,sb:{from:()=>({select:()=>({in:()=>{queries++;return gate.promise;}})})}};
  vm.createContext(ctx);vm.runInContext(between('const senderProfilesLoading','// Render markdown'),ctx);
  const first=ctx.prefetchRealSenderProfiles();await ctx.prefetchRealSenderProfiles();assert.equal(queries,1);
  gate.resolve({data:[]});await first;
  await ctx.prefetchRealSenderProfiles();assert.equal(queries,1);assert.equal(renders,0);
});

test('known inbox conversations avoid duplicate legacy previews and send does not wait for inbox refresh',()=>{
  const load=between('async function loadFriendsNow','async function searchUsersForConversation');
  assert.match(load,/!coveredParents.has\(item.partnerId\)/);
  assert.match(load,/!coveredParents.has\(item.friend_id\)/);
  assert.doesNotMatch(load,/await prefetchUserContextProfiles\(merged/);
  const send=html.slice(html.lastIndexOf('window.sendMessage = async'),html.indexOf('window.previewMessageImage'));
  assert.doesNotMatch(send,/await loadFriends/);
  assert.match(html,/if \(document.hidden\) return/);
});
