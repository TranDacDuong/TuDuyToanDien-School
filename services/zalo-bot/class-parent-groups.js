'use strict';
const {encodeMessage,encodeUpdate,safeRemote}=require('./zalo-sync-content');
function isGroupCreationLimit(error){
  const message=String(error?.message||error).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  return /gioi han.*tao nhom|group creation.*limit|limit.*creat.*group/.test(message);
}
function groupMembers(info){
  const members=new Set([...(info.memberIds||[]),...(info.memVerList||[])].map(id=>String(id).split('_')[0]));
  for(const m of info.currentMems||[])members.add(String(m.id).split('_')[0]);members.add(String(info.creatorId));
  if(info.hasMoreMember && (!info.totalMember || members.size<Number(info.totalMember)))throw Error('Danh sách thành viên Zalo chưa đầy đủ; chưa thêm thành viên');
  return members;
}
async function readGroup(api,id){
  const result=await api.getGroupInfo(id),info=result?.gridInfoMap?.[id];
  if(!info || (info.groupId && String(info.groupId)!==id))throw Error('Không đọc được nhóm Zalo');return {...info,groupId:id};
}
async function provisionGroup(api,store,job,guard=async()=>{}){
  const own=String(api.getOwnId()),desired=[...new Set(job.members.map(m=>m.uid).filter(Boolean))].filter(uid=>uid!==own);
  if(!desired.length)throw Error('Lớp chưa có phụ huynh được liên kết Zalo');
  let uid=job.group_uid;
  if(!uid){
    const all=await api.getAllGroups(),ids=Object.keys(all?.gridVerMap||{}),matches=[];
    for(let i=0;i<ids.length;i+=20){
      const result=await api.getGroupInfo(ids.slice(i,i+20));
      for(const info of Object.values(result?.gridInfoMap||{}))if(info.name===job.group_name && String(info.creatorId)===own)matches.push(info);
    }
    if(matches.length>1)throw Error('Có nhiều nhóm trùng tên; cần admin đối chiếu trước khi liên kết');
    if(matches.length===1)uid=String(matches[0].groupId);
    else {await guard();uid=await store.send(`class-group:create:${job.class_id}`,{name:job.group_name,members:desired},async()=>{
      const created=await api.createGroup({name:job.group_name,members:desired});
      if(!created?.groupId)throw Error('Uncertain group creation: Zalo không trả mã nhóm');return String(created.groupId);
    });}
  }
  let info=await readGroup(api,uid),actual=groupMembers(info);
  if(!actual.has(own))throw Error('Tài khoản bot không còn trong nhóm');
  for(const member of desired){
    if(actual.has(member))continue;
    await guard();
    try{await store.send(`class-group:add:${job.id}:${member}`,{uid,member},()=>api.addUserToGroup(member,uid));}
    catch(error){if(/429|too many|rate.limit|timeout|uncertain|network|fetch failed/i.test(String(error.message)))throw error;}
  }
  info=await readGroup(api,uid);actual=groupMembers(info);
  return {group_uid:uid,name:info.name,avatar:safeRemote(info.avt)||'',members:job.members.map(m=>({user_id:m.user_id,status:!m.uid?'missing_link':actual.has(m.uid)?'joined':'not_added'}))};
}
function encodeGroup(message,known){
  const uid=String(message?.threadId||'');if(message?.type!==1 || !known.has(uid))return null;
  const payload=encodeMessage({...message,type:0},{displayName:message.data?.dName||''});
  return payload&&{...payload,action:'syncClassGroup',actorUid:String(message.data?.uidFrom||''),displayName:String(message.data?.dName||'').slice(0,200)};
}
function encodeGroupUpdate(kind,event,known){
  if(!known.has(String(event?.threadId||'')) || !(event?.isGroup || event?.type===1))return null;
  const payload=encodeUpdate(kind,{...event,type:0,isGroup:false});return payload&&{...payload,action:'syncClassGroup',actorUid:String(event.data?.uidFrom||'')};
}
module.exports={provisionGroup,encodeGroup,encodeGroupUpdate,groupMembers,isGroupCreationLimit};
