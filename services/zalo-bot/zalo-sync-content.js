'use strict';
const { createHash } = require('node:crypto');
const PREFIX = '__ZALO_SYNC_V2__';
const labels = { image:'[Hình ảnh]',video:'[Video]',audio:'[Tin nhắn thoại]',file:'[Tệp đính kèm]',sticker:'[Sticker]',other:'[Nội dung Zalo]' };
function safeRemote(value) {
  try {
    if(typeof value!=='string' || value.length>2000) return null;
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && /(^|\.)(zdn\.vn|zadn\.vn|zaloapp\.com|zaloapp\.vn|zalo\.me)$/.test(u.hostname) ? u.href : null;
  } catch { return null; }
}
function time(value) {
  const n=Number(value); if(!Number.isFinite(n)||n<=0) return null;
  const d=new Date(n<1e12?n*1000:n); return Number.isNaN(+d)?null:d.toISOString();
}
function encodeMessage(message, profile={}) {
  if (message?.type!==0) return null;
  const d=message.data || {}, uid=String(message.threadId || ''), id=String(d.msgId || d.cliMsgId || '');
  if(!uid || !id) return null;
  const raw=d.content, type=String(d.msgType || '');
  let text=typeof raw==='string'?raw.trim():'', kind='text', ref=null;
  const inferred=/photo|image/i.test(type)?'image':/video/i.test(type)?'video':/voice|audio/i.test(type)?'audio':/sticker/i.test(type)?'sticker':/file/i.test(type)?'file':'other';
  if (raw && typeof raw==='object') {
    kind=inferred;
    let params={}; try {params=typeof raw.params==='string'?JSON.parse(raw.params):raw.params || {};} catch {}
    const url=safeRemote(raw.href || raw.url || params.url || params.originalUrl || params.hd || params.src);
    ref=url && ['image','video','audio','file'].includes(kind)?{url,kind,name:String(raw.title || raw.fileName || '').slice(0,180)}:null;
    text=labels[kind];
    if(kind==='file' && raw.title) text+=' '+String(raw.title).slice(0,180);
    if(kind==='other') {
      const parts=[raw.title,raw.description].filter(v=>typeof v==='string').map(v=>v.slice(0,1500));
      try {const link=new URL(raw.href);if(['https:','http:'].includes(link.protocol)) parts.push(link.href.slice(0,2000));}catch{}
      if(parts.length) text+='\n'+parts.join('\n');
    }
  } else if(inferred!=='other') {
    kind=inferred;
    const url=safeRemote(raw);
    if(url && ['image','video','audio','file'].includes(kind)) ref={url,kind,name:''};
    text=labels[kind];
  }
  if(!text) return null;
  const metadata={kind};
  if(d.quote) metadata.quote={id:String(d.quote.globalMsgId || d.quote.cliMsgId || ''),text:String(d.quote.msg || '').slice(0,800),name:String(d.quote.fromD || '').slice(0,160)};
  if(profile.avatar && safeRemote(profile.avatar)) metadata.avatar=profile.avatar;
  if(['image','video','audio','file'].includes(kind)) metadata.media={kind,name:ref?.name || ''};
  const envelope=PREFIX+JSON.stringify({version:2,event:'message',text,metadata,media:ref});
  if(envelope.length>10000 && text.startsWith(PREFIX)) return null;
  return {action:'syncMessage',externalId:`${uid}:${id}`,zaloUid:uid,
    content:envelope.length<=10000?envelope:text,
    displayName:String(profile.displayName || profile.zaloName || (!message.isSelf?d.dName:'') || '').slice(0,200),
    isSelf:message.isSelf===true,sentAt:time(d.ts),isHistory:false};
}
function encodeUpdate(kind, event) {
  if(!event || event.isGroup || (event.type!=null && event.type!==0)) return null;
  const d=event.data || {}, uid=String(event.threadId || ''); if(!uid) return null;
  const targets=kind==='reaction'?(d.content?.rMsg || []).map(m=>String(m.gMsgID || m.cMsgID || ''))
    :kind==='undo'?[String(d.content?.globalMsgId || d.content?.cliMsgId || '')]:[String(d.msgId || d.realMsgId || '')];
  const ids=targets.filter(Boolean).slice(0,50); if(!ids.length) return null;
  const data={version:2,event:kind,targets:ids,actor:String(d.uidFrom || (event.isSelf?'self':'peer')),
    icon:kind==='reaction'?String(d.content?.rIcon || '').slice(0,50):'',at:time(d.ts || d.mSTs)};
  const key=createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,32);
  return {action:'syncMessage',externalId:`${uid}:event:${key}`,zaloUid:uid,content:PREFIX+JSON.stringify(data),displayName:'',isSelf:event.isSelf===true,sentAt:data.at,isHistory:false};
}
module.exports={PREFIX,encodeMessage,encodeUpdate,safeRemote};
