'use strict';
const {createHash}=require('node:crypto');
const {PREFIX,safeRemote}=require('./zalo-sync-content');
async function readContacts(api) {
  const response=await api.getAllFriends();
  const friends=Array.isArray(response)?response:response?.data;
  if(!Array.isArray(friends))throw new Error('Invalid Zalo contact list');
  const aliases=new Map();let aliasesKnown=false,stamp;
  if(typeof api.getAliasList==='function') {
    try {
      for(let page=1;page<=100;page++) {
        const result=await api.getAliasList(100,page);
        if(!Array.isArray(result?.items))throw new Error('Invalid Zalo alias page');
        if(page>1 && stamp!==result.updateTime)throw new Error('Alias snapshot changed while paging');
        stamp=result.updateTime;
        for(const item of result.items)if(item.userId)aliases.set(String(item.userId),String(item.alias || '').slice(0,200));
        if(result.items.length<100){aliasesKnown=true;break;}
      }
    }catch {aliasesKnown=false;}
  }
  return {friends,aliases,aliasesKnown};
}
function contactPayload(uid,profile) {
  const data={version:2,event:'contact_profile',name:String(profile.displayName || profile.zaloName || '').slice(0,200),
    avatar:safeRemote(profile.avatar),alias_known:profile.aliasKnown===true,
    alias:profile.aliasKnown?String(profile.alias || '').slice(0,200):null};
  const content=PREFIX+JSON.stringify(data);
  const fingerprint=createHash('sha256').update(content).digest('hex').slice(0,32);
  return {action:'syncMessage',externalId:`${uid}:profile:${fingerprint}`,zaloUid:String(uid),content,
    displayName:data.name,isSelf:true,isHistory:false,sentAt:new Date().toISOString()};
}
module.exports={readContacts,contactPayload};
