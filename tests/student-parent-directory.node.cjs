const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sourcedata.html','utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const directory=extract('async function sLoadLinkedParentsForStudents(', 'async function sLoadMobileStatusesForStudents(');
const students=extract(source.includes('async function loadStudents(){')?'async function loadStudents(){':'function loadStudents(){','function sZaloPauseNotice(');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const parent={id:'parent',full_name:'Phụ huynh mẫu',email:'parent@example.test',role:'parent'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function context(sb,extra={}){const c={sb,console,_sLinkedParents:{},_sParentDirectoryError:false,_sParentDirectoryVersion:0,...extra};vm.createContext(c);vm.runInContext(directory,c);return c;}
function chain(result){const q={select:()=>q,in:()=>q,is:()=>q,eq:()=>q,order:()=>q,then:(...args)=>Promise.resolve(result).then(...args)};return q;}
test('overlapping parent-directory requests do not append the same parent twice',async()=>{
 const responses=[deferred(),deferred()];let n=0;
 const c=context({from:table=>chain(table==='parent_students'?{data:[{parent_id:'parent',student_id:'student'}]}:responses[n++].promise)});
 const a=c.sLoadLinkedParentsForStudents([{id:'student'}]);await tick();const b=c.sLoadLinkedParentsForStudents([{id:'student'}]);await tick();
 responses[1].resolve({data:[parent]});await b;responses[0].resolve({data:[parent]});await a;
 assert.equal(c._sLinkedParents.student.length,1);
});
test('older parent response cannot overwrite the latest student selection',async()=>{
 const responses=[deferred(),deferred()];let link=0,parents=0;
 const c=context({from:table=>chain(table==='parent_students'?{data:[{parent_id:'parent',student_id:link++?'new':'old'}]}:responses[parents++].promise)});
 const old=c.sLoadLinkedParentsForStudents([{id:'old'}]);await tick();const latest=c.sLoadLinkedParentsForStudents([{id:'new'}]);await tick();
 responses[1].resolve({data:[parent]});await latest;responses[0].resolve({data:[parent]});await old;
 assert.deepEqual(Object.keys(c._sLinkedParents),['new']);
});
test('deduplicates repeated link rows by ID without hiding distinct parent identities',async()=>{
 const other={...parent,id:'other'};
 const links=[{student_id:'student',parent_id:'parent'},{student_id:'student',parent_id:'parent'},{student_id:'student',parent_id:'other'}];
 const c=context({from:table=>chain({data:table==='parent_students'?links:[parent,other]})});
 await c.sLoadLinkedParentsForStudents([{id:'student'}]);assert.equal(c._sLinkedParents.student.length,2);
 assert.equal(new Set(c._sLinkedParents.student.map(p=>p.id)).size,2);
});
test('an old failed response cannot clear the latest parent directory',async()=>{
 const requests=[deferred(),deferred()];let n=0;
 const c=context({from:table=>chain(table==='parent_students'?requests[n++].promise:{data:[parent]})});
 const old=c.sLoadLinkedParentsForStudents([{id:'student'}]),latest=c.sLoadLinkedParentsForStudents([{id:'student'}]);
 requests[1].resolve({data:[{student_id:'student',parent_id:'parent'}]});await latest;
 requests[0].resolve({error:{message:'old request failed'}});await old;
 assert.equal(c._sParentDirectoryError,false);assert.equal(c._sLinkedParents.student.length,1);
});
test('student-page initialization shares one in-flight load and permits later refresh',async()=>{
 let fetches=0;const first=deferred();
 const c=context({from:()=>{fetches++;return chain(fetches===1?first.promise:{data:[]});}},{_sStudentsLoadPromise:null,_sAll:[],_sZaloBulkTimer:1,
 document:{getElementById:()=>({textContent:''})},sLoadMobileStatusesForStudents:async()=>{},sLoadZaloContactsForStudents:async()=>{},sLoadZaloBulkStatus:async()=>{},sLoadZaloAliasStatus:async()=>{},sApplyFilter:()=>{}});
 vm.runInContext(students,c);c.sLoadLinkedParentsForStudents=async()=>{};
 const a=c.loadStudents(),b=c.loadStudents();assert.equal(fetches,1);first.resolve({data:[]});await Promise.all([a,b]);
 await c.loadStudents();assert.equal(fetches,2);
});
