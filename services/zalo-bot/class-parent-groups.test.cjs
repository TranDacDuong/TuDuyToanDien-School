const test=require('node:test'),assert=require('node:assert/strict');
const {provisionGroup,encodeGroup,encodeGroupUpdate,isGroupCreationLimit}=require('./class-parent-groups');
test('daily group creation quota is distinct from message/account limits',()=>{
 assert.equal(isGroupCreationLimit(Error('Bạn đã đạt giới hạn tạo nhóm trong ngày.')),true);
 assert.equal(isGroupCreationLimit(Error('429 Too many messages')),false);assert.equal(isGroupCreationLimit(Error('Không thêm được thành viên')),false);
});
function fixture(){
 const groups={},calls=[],receipts=new Map();let seq=900;
 const store={send:async(key,identity,run)=>{if(receipts.has(key))return receipts.get(key);const result=await run();receipts.set(key,result);return result;}};
 const api={getOwnId:()=> '1',getAllGroups:async()=>({gridVerMap:Object.fromEntries(Object.keys(groups).map(id=>[id,'1']))}),getGroupInfo:async ids=>({gridInfoMap:Object.fromEntries([ids].flat().filter(id=>groups[id]).map(id=>[id,groups[id]]))}),
 createGroup:async options=>{calls.push(['create',options]);const groupId=String(seq++);groups[groupId]={groupId,name:options.name,creatorId:'1',memberIds:['1',...options.members.filter(m=>m!=='3')],currentMems:[],hasMoreMember:0};return{groupId};},
 addUserToGroup:async(uid,gid)=>{calls.push(['add',uid,gid]);return{errorMembers:[uid]};}};
 const job={id:'job',class_id:'class',group_name:'MindUp parents',members:[{user_id:'p1',uid:'2'},{user_id:'p2',uid:'3'},{user_id:'p3',uid:null}]};
 return {api,store,job,calls,groups};
}
test('creates a center group once, verifies actual membership and reports missing / rejected parents',async()=>{
 const f=fixture(),r=await provisionGroup(f.api,f.store,f.job);assert.equal(r.group_uid,'900');assert.deepEqual(r.members.map(m=>m.status),['joined','not_added','missing_link']);
 await provisionGroup(f.api,f.store,{...f.job,id:'next'});assert.equal(f.calls.filter(c=>c[0]==='create').length,1);
});
test('never adopts another creator group, never removes members, and guards fresh scope before mutation',async()=>{
 const f=fixture();f.groups['800']={groupId:'800',name:f.job.group_name,creatorId:'77',memberIds:['77','2']};
 await assert.rejects(provisionGroup(f.api,f.store,f.job,async()=>{throw Error('scope changed');}),/scope changed/);assert.equal(f.calls.length,0);
 await provisionGroup(f.api,f.store,f.job);assert.equal(f.calls[0][0],'create');assert.ok(f.groups['800']);
 f.groups['901']={...f.groups['900'],groupId:'901'};await assert.rejects(provisionGroup(f.api,f.store,f.job),/nhiều nhóm trùng tên/);
});
test('only mapped class-group messages are synchronized, with author and group type preserved',()=>{
 const event={type:1,threadId:'900',isSelf:false,data:{msgId:'10',uidFrom:'2',dName:'Parent',content:'Question'}};
 assert.equal(encodeGroup(event,new Set()),null);const row=encodeGroup(event,new Set(['900']));assert.equal(row.action,'syncClassGroup');assert.equal(row.actorUid,'2');assert.equal(row.displayName,'Parent');
 assert.equal(encodeGroup({...event,type:0},new Set(['900'])),null);
 assert.equal(encodeGroupUpdate('undo',{...event,data:{uidFrom:'2',content:{globalMsgId:'10'}}},new Set(['900'])).action,'syncClassGroup');
});
