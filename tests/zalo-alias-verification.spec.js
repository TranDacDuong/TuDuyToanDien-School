const {test,expect}=require('@playwright/test');
const fs=require('fs');
const vm=require('vm');

async function run({items,changeError,friend=1}){
  const calls=[];
  const ctx={zaloApi:{
    getFriendRequestStatus:async()=>({is_friend:friend}),
    changeFriendAlias:async()=>{calls.push('change');if(changeError)throw new Error(changeError);},
    getAliasList:async()=>{calls.push('read');return {items};}
  },buildParentAlias:()=> 'PH Bảo Hân 2222',isZaloLimitError:()=>false,
  gatewayRequest:async p=>calls.push(p),nextAliasSyncAt:0};
  vm.createContext(ctx);
  const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
  vm.runInContext(source.slice(source.indexOf('async function syncQueuedParentAlias('),source.indexOf('async function syncParentTuition(')),ctx);
  await ctx.syncQueuedParentAlias({job_id:'job',zalo_uid:'uid',current_alias:'PH Bảo Hân 2222'});
  return calls;
}
test('saved alias cannot skip the actual Zalo update',async()=>{
  const calls=await run({items:[{userId:'uid',alias:'PH Bảo Hân 2222'}]});
  expect(calls.slice(0,2)).toEqual(['change','read']);
  expect(calls[2].status).toBe('success');
});
test('different actual alias never reports success',async()=>{
  expect((await run({items:[{userId:'uid',alias:'Phương Nguyễn'}]})).at(-1).status).toBe('failed');
});
test('missing alias never reports success',async()=>{
  expect((await run({items:[]})).at(-1).status).toBe('failed');
});
test('change error never reports success',async()=>{
  expect((await run({changeError:'rejected'})).at(-1).status).toBe('failed');
});
test('non friends are not renamed',async()=>{
  const calls=await run({friend:0});expect(calls).toHaveLength(1);expect(calls[0].status).toBe('skipped');
});
