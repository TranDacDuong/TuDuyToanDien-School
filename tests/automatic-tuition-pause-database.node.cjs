const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const {PGlite} = createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
test('pause SQL never confuses control id with returned job id', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE automatic_tuition_control(id int,paused boolean);
      INSERT INTO automatic_tuition_control VALUES(1,false);
      CREATE FUNCTION claim_automatic_tuition_reminder(date,integer) RETURNS TABLE(id uuid) LANGUAGE plpgsql AS $$
      BEGIN IF EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused) THEN RETURN; END IF;
      RETURN QUERY SELECT '00000000-0000-0000-0000-000000000001'::uuid; END; $$;`);
    await assert.rejects(db.query("SELECT * FROM claim_automatic_tuition_reminder(current_date,15)"), /ambiguous/);
    await db.exec(fs.readFileSync('SQL fix automatic tuition pause ambiguity.sql','utf8'));
    await db.exec(fs.readFileSync('SQL fix automatic tuition pause ambiguity.sql','utf8'));
    assert.equal((await db.query('SELECT * FROM claim_automatic_tuition_reminder(current_date,15)')).rows.length,1);
    await db.exec('UPDATE automatic_tuition_control SET paused=true');
    assert.equal((await db.query('SELECT * FROM claim_automatic_tuition_reminder(current_date,15)')).rows.length,0);
    await db.exec('UPDATE automatic_tuition_control SET paused=false');
    assert.equal((await db.query('SELECT * FROM claim_automatic_tuition_reminder(current_date,15)')).rows.length,1);
  } finally { await db.close(); }
});
