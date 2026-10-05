const {test,expect}=require('@playwright/test');
const fs=require('fs');
const vm=require('vm');
test('learning fanout sends only active linked parent IDs',async()=>{
  const calls=[];
  const sb={from:()=>({select:()=>({eq:()=>({is:async()=>({data:[{parent_id:'p1'},{parent_id:'p1'},{parent_id:'p2'}]})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:2};}};
  const ctx={window:{sb},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('learning_messages.js','utf8'),ctx);
  await ctx.window.LearningMessages.sendToAllAudiences({studentId:'student',content:'hello',messageKey:'score'});
  expect(Array.from(calls[0].args.p_audience_user_ids)).toEqual(['p1','p2']);
});
test('removed automatic templates do not fall back to old defaults',async()=>{
  const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('learning_messages.js','utf8'),ctx);
  for(const id of ['course_created','class_session_added','welcome_new_student','birthday_wish']){
    expect(await ctx.window.LearningMessages.getTemplate(id,'old content')).toBeNull();
  }
});
