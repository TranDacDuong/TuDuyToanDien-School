'use strict';
const { safeRemote, PREFIX } = require('./zalo-sync-content');
const { isSvgImage, normalizeImage } = require('./zalo-image');
function registerOnDemand(app, {gatewayUrl,persistResult,getApi,isBusy,setBusy,requireAck}) {
  const base = new URL(gatewayUrl).origin;
  async function userRpc(req,name,args) {
    const auth=req.headers.authorization, key=req.body?.apiKey;
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(auth || '') || typeof key!=='string' || key.length>2000) throw new Error('Authentication required');
    const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{Authorization:auth,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Không có quyền truy cập hội thoại hoặc phiên đăng nhập đã hết hạn');
    return response.json();
  }
  app.post('/api/zalo-media',async(req,res)=>{
    res.set('Cache-Control','no-store, private, max-age=0');res.set('Pragma','no-cache');res.set('X-Content-Type-Options','nosniff');
    try {
      const ref=await userRpc(req,'resolve_zalo_media',{p_external_id:req.body?.externalId});
      if(!ref || !safeRemote(ref.url)) return res.status(404).json({error:'Ảnh/tệp đã thu hồi hoặc không còn truy xuất được trên Zalo'});
      let url=ref.url,response;
      for(let i=0;i<4;i++) {
        if(!safeRemote(url)) throw new Error('Nguồn media Zalo không hợp lệ');
        response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000),cache:'no-store'});
        if([301,302,303,307,308].includes(response.status)) {url=new URL(response.headers.get('location'),url).href;await response.body?.cancel();continue;} break;
      }
      if(!response.ok) throw new Error('Zalo không còn cung cấp ảnh/tệp này. Nội dung có thể đã hết hạn');
      const limit=50*1024*1024, chunks=[];let size=0;
      if(Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw new Error('Tệp vượt quá giới hạn xem 50 MB');}
      for await(const chunk of response.body) {size+=chunk.length;if(size>limit) throw new Error('Tệp vượt quá giới hạn xem 50 MB');chunks.push(chunk);}
      const type=(response.headers.get('content-type') || '').split(';')[0];
      const buffer=Buffer.concat(chunks);
      if(ref.kind==='image' && isSvgImage(buffer)) {
        return res.type('image/png').send(await normalizeImage(buffer));
      }
      if(!/^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm)|audio\/[a-z0-9.+-]+|application\/(pdf|octet-stream|zip|vnd\.[a-z0-9.+-]+))$/i.test(type)) throw new Error('Định dạng media không được hỗ trợ');
      res.type(type).send(buffer);
    } catch(error) {if(!res.headersSent) res.status(400).json({error:error.message});}
  });
  app.post('/api/zalo-external-reply',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!getApi()) return res.status(503).json({error:'Bot Zalo chưa kết nối'});
    if(isBusy()) return res.status(409).json({error:'Bot đang xử lý một tin khác. Vui lòng gửi lại sau ít giây'});
    setBusy(true);let claimed;
    try {
      claimed=await userRpc(req,'reserve_zalo_external_reply',{p_thread:req.body?.threadId,p_id:req.body?.id,p_content:req.body?.content});
      if(!claimed?.claimed) return res.status(409).json({error:'Tin này đã được xử lý. Kiểm tra hội thoại trước khi gửi lại'});
      let status='sent',externalId,errorText;
      try {const sent=await getApi().sendMessage(req.body.content,claimed.uid);externalId=`${claimed.uid}:${requireAck(sent,0)}`;}
      catch(error){status='uncertain';errorText=String(error.message).slice(0,500);}
      await persistResult({action:'syncMessage',externalId:`${claimed.uid}:reply:${req.body.id}`,zaloUid:claimed.uid,
        content:PREFIX+JSON.stringify({version:2,event:'reply_result',reply_id:req.body.id,status,external_id:externalId,error:errorText}),
        displayName:'',isSelf:true,isHistory:false,sentAt:new Date().toISOString()});
      if(status!=='sent') return res.status(409).json({error:'Chưa xác nhận gửi. Kiểm tra trên Zalo trước khi gửi lại để tránh trùng'});
      res.json({success:true});
    } catch(error) {res.status(400).json({error:claimed?.claimed?'Không xác nhận được kết quả. Kiểm tra Zalo trước khi gửi lại':error.message});}
    finally {setBusy(false);}
  });
}
module.exports={registerOnDemand};
