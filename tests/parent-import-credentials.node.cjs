const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sourcedata.html','utf8');
const body=source.slice(source.indexOf('async function sSyncParentAccountForStudent('),source.indexOf('async function sEditStudent('));
for(const sameEmail of [false,true])test('linking siblings '+(sameEmail?'keeps the existing explicit credential edit':'preserves a reused parent login'),async()=>{
 const fields={seParentEmail:{value:'new-alias@example.test'},seParentPassword:{value:'new-child-default'}};
 let credentialEdits=0,requests=0;
 const parent={id:'canonical-parent',email:sameEmail?'new-alias@example.test':'original@example.test'};
 const sandbox={document:{getElementById:id=>fields[id]},sSuggestParentEmail:async()=>'',sCheckParentEmail:async()=>null,sParentDefaultPassword:()=>'',
  sb:{rpc:async(name,args)=>{requests++;assert.equal(name,'admin_import_parents_batch');assert.equal(args.p_rows[0].student_id,'child');return {error:null};}},
  sLoadLinkedParentForStudent:async()=>parent,updateManagedCredentials:async(id,email)=>{credentialEdits++;assert.equal(id,'canonical-parent');assert.equal(email,parent.email);}};
 vm.createContext(sandbox);vm.runInContext(body,sandbox);
 await sandbox.sSyncParentAccountForStudent('child',{parent_full_name:'Parent',parent_phone:'0912345678'});
 assert.equal(requests,1);assert.equal(credentialEdits,sameEmail?1:0);assert.equal(fields.seParentEmail.value,parent.email);
});
