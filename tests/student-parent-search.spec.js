const {test,expect}=require('@playwright/test');
const fs=require('fs');
const vm=require('vm');
test('student name filter also searches all linked parents and legacy parent names',()=>{
  const source=fs.readFileSync('sourcedata.html','utf8');
  const ctx={_sAll:[
    {id:'a',full_name:'Hoàng Bảo Hân',parent_full_name:'Tên cũ'},
    {id:'b',full_name:'Mai Bảo Hân',parent_full_name:'Nguyễn Thị Lan Anh'},
    {id:'c',full_name:'Trần Minh'}
  ],_sLinkedParents:{a:[{full_name:'Nguyễn Lan Phương'},{full_name:'Hoàng Văn An'}]},
  document:{getElementById:id=>({value:id==='sSName'?ctx.query:''})},
  sMatchesZaloStatus:()=>true,sApplySort:()=>{},query:'nguyen lan phuong'};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function sRmVN('),source.indexOf('\n',source.indexOf('function sRmVN('))),ctx);
  vm.runInContext(source.slice(source.indexOf('function sApplyFilter('),source.indexOf('function sClearSearch(')),ctx);
  for(const [query,ids] of [['nguyen lan phuong',['a']],['HOÀNG VĂN AN',['a']],['lan anh',['b']],['bao han',['a','b']],['ten cu',['a']],['',['a','b','c']],['khong co',[]]]){
    ctx.query=query;ctx.sApplyFilter();expect(Array.from(ctx._sFilt,s=>s.id)).toEqual(ids);
  }
});
