const test=require('node:test');const assert=require('node:assert/strict');
const {registerOnDemand}=require('../services/zalo-bot/zalo-on-demand');
function setup(options={}){
 const routes={};registerOnDemand({post:(name,handler)=>routes[name]=handler},{gatewayUrl:'https://project.supabase.co/functions/v1/zalo-gateway',getApi:()=>({sendMessage:async()=>({})}),isBusy:()=>false,setBusy:()=>{},requireAck:()=>1,persistResult:async()=>{},...options});
 const response=()=>({headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},type(type){this.mime=type;return this;},send(body){this.body=body;return this;}});
 return {routes,response};
}
test('media requires authenticated scoped RPC before any Zalo fetch and is never cacheable',async()=>{
 const {routes,response}=setup();const original=global.fetch;let calls=0;
 try {
  global.fetch=async()=>{calls++;return new Response('{}',{status:403});};
  let res=response();await routes['/api/zalo-media']({headers:{},body:{}},res);
  assert.equal(calls,0);assert.equal(res.code,400);assert.match(res.headers['Cache-Control'],/no-store/);
  res=response();await routes['/api/zalo-media']({headers:{authorization:'Bearer token'},body:{apiKey:'public',externalId:'a:b'}},res);
  assert.equal(calls,1);assert.equal(res.code,400);
 } finally{global.fetch=original;}
});
test('valid media is streamed from Zalo in memory and cross-host redirects are refused',async()=>{
 const {routes,response}=setup();const original=global.fetch;const req={headers:{authorization:'Bearer token'},body:{apiKey:'public',externalId:'a:b'}};
 try {
  let calls=0;global.fetch=async()=>++calls===1?new Response(JSON.stringify({url:'https://photo.zaloapp.com/a.jpg',kind:'image'})):new Response('image-bytes',{headers:{'content-type':'image/jpeg'}});
  let res=response();await routes['/api/zalo-media'](req,res);assert.equal(res.body.toString(),'image-bytes');assert.equal(res.mime,'image/jpeg');
  calls=0;global.fetch=async()=>++calls===1?new Response(JSON.stringify({url:'https://photo.zaloapp.com/a.jpg',kind:'image'})):new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});
  res=response();await routes['/api/zalo-media'](req,res);assert.equal(res.code,400);assert.equal(calls,2);
 } finally{global.fetch=original;}
});
test('an already reserved external reply is not sent a second time',async()=>{
 let sent=0;const {routes,response}=setup({getApi:()=>({sendMessage:async()=>{sent++;}})});const original=global.fetch;
 try{global.fetch=async()=>new Response(JSON.stringify({claimed:false,status:'uncertain'}));const res=response();
  await routes['/api/zalo-external-reply']({headers:{authorization:'Bearer token'},body:{apiKey:'public',threadId:'thread',id:'same',content:'Hello'}},res);
  assert.equal(sent,0);assert.equal(res.code,409);
 }finally{global.fetch=original;}
});
