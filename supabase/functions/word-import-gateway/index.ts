import { wordImportAction } from './word-import.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-zalo-gateway-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
async function rpc(name: string, body: Record<string,unknown>) {
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw new Error('Not configured');
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Word database operation failed');
  return response.json();
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const expected=Deno.env.get('ZALO_GATEWAY_TOKEN')||'';
  const actual=request.headers.get('x-zalo-gateway-token')||'';
  let diff=expected.length^actual.length;
  for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);
  if(!expected||diff)return json({error:'Unauthorized'},401);
  if(Number(request.headers.get('content-length')||0)>6000000)return json({error:'Too large'},413);
  try{return json(await wordImportAction(await request.json(),rpc));}
  catch(_){return json({error:'Word import service temporarily unavailable'},500);}
});
