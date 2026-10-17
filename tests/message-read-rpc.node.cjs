const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
const sql = fs.readFileSync('SQL optimize message reads.sql','utf8');
const html = fs.readFileSync('messages.html','utf8');

test('message read RPC retains caller RLS, pagination, limits and rejects anonymous reads', async t => {
  const db = new PGlite(); t.after(() => db.close());
  const owner='00000000-0000-0000-0000-000000000011', other='00000000-0000-0000-0000-000000000012';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),conversation_id uuid,owner_id uuid,created_at timestamptz,content text);
    ALTER TABLE messages ENABLE ROW LEVEL SECURITY; GRANT SELECT ON messages TO authenticated;
    CREATE POLICY own_messages ON messages FOR SELECT TO authenticated USING(owner_id=auth.uid());
    INSERT INTO messages(conversation_id,owner_id,created_at,content)
      SELECT '${owner}','${owner}',now()-n*interval '1 minute',n::text FROM generate_series(1,60) n;
    INSERT INTO messages(conversation_id,owner_id,created_at,content) VALUES('${owner}','${other}',now(),'private');`);
  await db.exec(sql); await db.exec(sql);
  const cursorSql=fs.readFileSync('SQL conversation message cursor.sql','utf8');
  await db.exec(cursorSql);await db.exec(cursorSql);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`);
  const latest=(await db.query('SELECT * FROM list_mindup_conversation_messages($1)',[owner])).rows;
  assert.equal(latest.length,10); assert.equal(latest[0].content,'1');
  assert.equal((await db.query('SELECT * FROM list_mindup_conversation_messages($1,NULL,1000)',[owner])).rows.length,50);
  const older=(await db.query('SELECT * FROM list_mindup_conversation_messages($1,$2,10)',[owner,latest[9].created_at])).rows;
  assert.equal(older[0].content,'11');
  await db.exec(`RESET ROLE;INSERT INTO messages(conversation_id,owner_id,created_at,content)
    SELECT '${owner}','${owner}',now(),'tied-'||n FROM generate_series(1,25) n;SET ROLE authenticated;`);
  let before=null,beforeId=null,seen=[];
  while(true){
    const page=(await db.query('SELECT * FROM list_mindup_conversation_messages_v2($1,$2,$3,10)',[owner,before,beforeId])).rows;
    if(!page.length)break;
    seen.push(...page);before=page.at(-1).created_at;beforeId=page.at(-1).id;
  }
  assert.equal(seen.length,85);assert.equal(new Set(seen.map(row=>row.id)).size,85);
  assert.equal(seen.filter(row=>row.content.startsWith('tied-')).length,25);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false);`);
  assert.deepEqual((await db.query('SELECT content FROM list_mindup_conversation_messages($1)',[owner])).rows.map(r=>r.content),['private']);
  assert.deepEqual((await db.query('SELECT content FROM list_mindup_conversation_messages_v2($1)',[owner])).rows.map(r=>r.content),['private']);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','',false);`);
  await assert.rejects(db.query('SELECT * FROM list_mindup_conversation_messages($1)',[owner]),/Authentication required/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM list_mindup_conversation_messages($1)',[owner]),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM list_mindup_conversation_messages_v2($1)',[owner]),/permission denied/);
});

test('frontend only falls back for an undeployed RPC, never repeats a timed out read', async () => {
  let result={data:null,error:{code:'57014',message:'timeout'}}, fallback=0;
  const ctx={MESSAGE_PAGE_SIZE:10,sb:{rpc:()=>({select:async()=>result}),from:()=>{fallback++;return query;}}};
  const query={select:()=>query,eq:()=>query,lt:()=>query,order:()=>query,limit:async()=>({data:[]})};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('async function queryConversationMessages('),html.indexOf('window.retryConversationMessages')),ctx);
  assert.equal((await ctx.queryConversationMessages('id')).error.code,'57014'); assert.equal(fallback,0);
  result={error:{code:'PGRST202'}};
  await ctx.queryConversationMessages('id'); assert.equal(fallback,1);
});
