// Offline PostgreSQL fixtures only; never connects to Supabase or sends Zalo messages.
// Run from repo root: node --test services/zalo-bot/parent-notification-policy.database.test.cjs
const fs = require("fs"),
  assert = require("assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "../..");
const read = (f) =>
  fs.readFileSync(root + "/" + f, "utf8").replace(/\r\n/g, "\n");
for (const crlf of [false, true]) {
  test(
    "parent notification policy and evaluation bridge (" +
      (crlf ? "CRLF" : "LF") +
      ")",
    { timeout: 60000 },
    async () => {
      const fn = (file, name) => {
        const s = read(file);
        const start = s.indexOf(
          "CREATE OR REPLACE FUNCTION public." + name + "(",
        );
        assert(start >= 0, name);
        const end = s.indexOf("$$;", start);
        assert(end >= 0);
        const result = s.slice(start, end + 3);
        return crlf ? result.replace(/\n/g, "\r\n") : result;
      };
      const id = (n) =>
        "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
      const db = new PGlite();
      try {
        await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'authenticated') $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,full_name text,phone text,created_at timestamptz DEFAULT now());
CREATE TABLE parent_students(student_id uuid,parent_id uuid,revoked_at timestamptz);
CREATE TABLE subjects(id uuid PRIMARY KEY,name text);
CREATE TABLE classes(id uuid PRIMARY KEY,class_name text,subject_id uuid);
CREATE TABLE class_teachers(class_id uuid,teacher_id uuid);
CREATE TABLE class_students(class_id uuid,student_id uuid,joined_at timestamptz,left_at timestamptz);
CREATE TABLE attendance(class_id uuid,student_id uuid,date date,status text,status_overridden boolean DEFAULT false);
CREATE TABLE class_schedules(class_id uuid,weekday integer,end_time time,effective_from date);
CREATE TABLE class_sessions(id uuid PRIMARY KEY,class_id uuid,session_date date,ends_at timestamptz,auto_eval_sent_at timestamptz);
CREATE TABLE session_student_evaluations(id uuid PRIMARY KEY,student_id uuid,evaluator_id uuid,class_session_id uuid,state text,final_message text,generated_message text,sent_at timestamptz,updated_at timestamptz);
CREATE TABLE session_student_evaluation_statuses(evaluation_id uuid);
CREATE TABLE message_templates(id text PRIMARY KEY,name text,content text,is_enabled boolean,updated_at timestamptz);
CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),direct_key text UNIQUE);
CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,content text,real_sender_id uuid,context_student_id uuid,message_key text,created_at timestamptz DEFAULT now(),transport text DEFAULT 'web',zalo_dispatch_source text DEFAULT 'automatic');
CREATE UNIQUE INDEX msg_key ON messages(conversation_id,message_key) WHERE message_key IS NOT NULL;
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,actor_id uuid,type text,title text,message text,ref_id uuid,target_url text,meta jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE zalo_verified_links(audience_user_id uuid,zalo_uid text,enabled boolean);
CREATE TABLE zalo_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid UNIQUE REFERENCES messages(id),conversation_id uuid,audience_user_id uuid,zalo_uid text,content text,dispatch_priority integer,status text DEFAULT 'pending',sent_at timestamptz,error_message text,updated_at timestamptz DEFAULT now(),locked_until timestamptz);
CREATE TABLE tuition_payments(id uuid PRIMARY KEY,student_id uuid,month date);
CREATE TABLE zalo_parent_contacts(parent_id uuid,phone text,zalo_uid text,status text,greeting_sent_at timestamptz);
CREATE TABLE zalo_automation_state(id integer,paused boolean); INSERT INTO zalo_automation_state VALUES(1,false);
CREATE TABLE zalo_tuition_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text UNIQUE,payment_id uuid,student_id uuid,parent_id uuid,month date,received_amount numeric,content text,status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),lease_until timestamptz,error_message text,attempts integer DEFAULT 0,sent_at timestamptz);
CREATE FUNCTION is_class_staff_for_student(s uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM class_students cs JOIN class_teachers ct ON ct.class_id=cs.class_id WHERE cs.student_id=s AND ct.teacher_id=auth.uid()) $$;
CREATE FUNCTION can_access_learning_thread(s uuid,a uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()=a OR auth.uid()=s OR is_class_staff_for_student(s) OR EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role='admin') $$;
CREATE FUNCTION ensure_mindup_official_audience_conversation(a uuid) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE c uuid; BEGIN INSERT INTO conversations(direct_key) VALUES(a::text) ON CONFLICT(direct_key) DO UPDATE SET direct_key=excluded.direct_key RETURNING id INTO c; RETURN c; END $$;
CREATE FUNCTION mindup_official_audience_id(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT k::uuid $$;
CREATE FUNCTION is_mindup_official_direct_key(k text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION list_student_learning_audiences(s uuid) RETURNS TABLE(user_id uuid) LANGUAGE sql AS $$ SELECT s UNION ALL SELECT parent_id FROM parent_students WHERE student_id=s AND revoked_at IS NULL $$;
`);
        for (const name of [
          "send_student_learning_message",
          "send_student_learning_message_to_audience",
        ]) {
          let body = fn("SQL unify MindUp official conversations.sql", name);
          // Reproduce exact live broken 5-column / 4-value definitions.
          body = body.replace(
            "conversation_id, sender_id, content, real_sender_id)",
            "conversation_id, sender_id, content, real_sender_id, context_student_id)",
          );
          await db.exec(body);
        }
        await db.exec(
          fn(
            "SQL upsert learning score messages.sql",
            "upsert_student_learning_message",
          ),
        );
        await db.exec(
          fn(
            "SQL auto session evaluations function.sql",
            "auto_send_session_evaluations_after_30m",
          ),
        );
        await db.exec(
          fn(
            "SQL Zalo tuition payment receipts.sql",
            "enqueue_zalo_tuition_receipt",
          ),
        );
        await db.exec(
          fn(
            "SQL Zalo tuition payment receipts.sql",
            "claim_zalo_tuition_receipt",
          ),
        );
        await db.exec(
          fn("SQL Zalo web bridge.sql", "finish_mindup_zalo_message"),
        );
        await db.exec(
          fn(
            "SQL unified Zalo dispatch.sql",
            "enqueue_mindup_official_message_trigger",
          ),
        );
        await db.exec(
          "CREATE TRIGGER enqueue AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION enqueue_mindup_official_message_trigger()",
        );
        await db.query("SELECT set_config('test.uid',$1,false)", [id(1)]);
        await db.query(
          "INSERT INTO users(id,role,full_name,phone) VALUES($1,'admin','Admin',''),($2,'student','Student',''),($3,'parent','Parent','123'),($4,'teacher','Other teacher',''),($5,'parent','Unverified',''),($6,'parent','Revoked','')",
          [id(1), id(2), id(3), id(4), id(5), id(6)],
        );
        await db.query("INSERT INTO classes VALUES($1,'Class',NULL)", [id(10)]);
        await db.query(
          "INSERT INTO class_students VALUES($1,$2,now()-interval '5 days',NULL)",
          [id(10), id(2)],
        );
        await db.query(
          "INSERT INTO parent_students VALUES($1,$2,NULL),($1,$3,NULL),($1,$1,NULL),($1,$4,now())",
          [id(2), id(3), id(5), id(6)],
        );
        await db.query(
          "INSERT INTO zalo_verified_links VALUES($1,'zalo-parent',true)",
          [id(3)],
        );
        await db.exec(
          "INSERT INTO message_templates(id,content,is_enabled) VALUES ('absent_notification','Absent {{student_name}} {{class_name}} {{session_date}}',false),('tuition_reminder','Tuition',false),('tuition_confirmed','Receipt',false),('session_evaluation','Evaluation',true),('session_evaluation_notice','Evaluation',true),('birthday_wish','Birthday',true)",
        );
        await db.query(
          "INSERT INTO class_sessions VALUES($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,now()-interval '40 minutes',NULL)",
          [id(11), id(10)],
        );
        await db.query(
          "INSERT INTO session_student_evaluations VALUES($1,$2,$3,$4,'draft','Evaluation message',NULL,NULL,now()),($5,$2,$3,$4,'sent','Historical',NULL,now()-interval '1 day',now())",
          [id(12), id(2), id(1), id(11), id(13)],
        );
        await db.query(
          "INSERT INTO session_student_evaluation_statuses VALUES($1),($2)",
          [id(12), id(13)],
        );
        const policy = read("SQL parent notification policy.sql"),
          bridge = read("SQL automatic evaluation Zalo bridge.sql");
        await db.exec(policy);
        await db.exec(bridge);
        console.log("PASS migrations compile and execute");
        await db.exec(policy);
        await db.exec(bridge);
        console.log("PASS idempotent rerun");
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM message_templates WHERE id IN ('absent_notification','tuition_reminder','tuition_confirmed') AND is_enabled",
            )
          ).rows[0].n,
          3,
        );
        assert.equal(
          (
            await db.query(
              "SELECT content FROM message_templates WHERE id='tuition_reminder'",
            )
          ).rows[0].content,
          "Tuition",
        );
        await db.exec(
          "UPDATE message_templates SET is_enabled=false WHERE id='session_evaluation'",
        );
        const defs = await db.query(
          "SELECT proname,pg_get_functiondef(oid) d FROM pg_proc WHERE proname IN ('send_student_learning_message','send_student_learning_message_to_audience','upsert_student_learning_message','auto_send_session_evaluations_after_30m')",
        );
        for (const r of defs.rows)
          assert(
            r.d.includes(
              r.proname.startsWith("auto_")
                ? "parent_evaluation_delivery_guard"
                : "parent_learning_actor_guard_v2",
            ),
          );
        assert(
          defs.rows
            .find((r) => r.proname.startsWith("upsert"))
            .d.includes("context_student_id = EXCLUDED.context_student_id"),
        );
        console.log("PASS read-back context/actor/evaluation guards");
        let r = await db.query(
          "SELECT send_student_learning_message($1,$2,NULL,$3::uuid[]) n",
          [id(2), "Fanout", [id(2), id(3), id(6)]],
        );
        assert.equal(r.rows[0].n, 1);
        r = await db.query(
          "SELECT context_student_id FROM messages WHERE content=$1",
          ["Fanout"],
        );
        assert.equal(r.rows[0].context_student_id, id(2));
        await assert.rejects(
          db.query(
            "SELECT send_student_learning_message_to_audience($1,$2,$3)",
            [id(2), id(2), "Reject"],
          ),
        );
        await db.query("SELECT set_config('test.uid',$1,false)", [id(4)]);
        await assert.rejects(
          db.query(
            "SELECT send_student_learning_message_to_audience($1,$2,$3)",
            [id(2), id(3), "Crossclass"],
          ),
        );
        await db.query("SELECT set_config('test.uid',$1,false)", [id(1)]);
        await db.query("SELECT upsert_student_learning_message($1,$2,$3)", [
          id(2),
          "Score",
          "score-key",
        ]);
        await db.query("SELECT upsert_student_learning_message($1,$2,$3)", [
          id(2),
          "Score corrected",
          "score-key",
        ]);
        r = await db.query(
          "SELECT count(*)::int n FROM messages WHERE message_key=$1 AND context_student_id=$2",
          ["score-key", id(2)],
        );
        assert.equal(r.rows[0].n, 2);
        console.log(
          "PASS live INSERT repair, parent fanout, student/crossclass rejection, score context upsert",
        );
        const chartContent =
          'Chart notice __CHART__{"type":"score_distribution","buckets":[{"label":"9","count":2}]} __ACTION__{"type":"reply"} __EVALUATION__{"sessionId":"fixture"}';
        await db.query(
          "SELECT send_student_learning_message_to_audience($1,$2,$3)",
          [id(2), id(3), chartContent],
        );
        assert.equal(
          (
            await db.query("SELECT content FROM zalo_outbox WHERE content=$1", [
              chartContent,
            ])
          ).rows[0].content,
          chartContent,
        );
        console.log(
          "PASS official outbox preserves CHART/ACTION/EVALUATION payloads for worker parsing",
        );
        r = await db.query(
          "SELECT auto_send_session_evaluations_after_30m() result",
        );
        assert.equal(r.rows[0].result.evaluations_published, 1);
        r = await db.query(
          "SELECT * FROM evaluation_zalo_publications ORDER BY parent_id",
        );
        assert.equal(r.rows.length, 2);
        assert.equal(r.rows[0].zalo_delivery_status, "pending");
        assert.equal(r.rows[1].zalo_delivery_status, "not_queued");
        assert.equal(r.rows[0].zalo_delivered_at, null);
        const job = r.rows[0].outbox_id;
        await db.query(
          "UPDATE zalo_outbox SET status='processing' WHERE id=$1",
          [job],
        );
        await db.query("SELECT set_config('test.role','service_role',false)");
        await db.query("SELECT finish_mindup_zalo_message($1,'sent',NULL)", [
          job,
        ]);
        r = await db.query(
          "SELECT zalo_delivery_status,zalo_delivered_at FROM evaluation_zalo_publications WHERE outbox_id=$1",
          [job],
        );
        assert.equal(r.rows[0].zalo_delivery_status, "sent");
        assert(r.rows[0].zalo_delivered_at);
        const count = async (t) =>
          (await db.query("SELECT count(*)::int n FROM " + t)).rows[0].n;
        const before = await count("messages");
        await db.query("SELECT auto_send_session_evaluations_after_30m()");
        await db.exec(bridge);
        assert.equal(await count("messages"), before);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM evaluation_zalo_publications WHERE evaluation_id=$1",
              [id(13)],
            )
          ).rows[0].n,
          0,
        );
        console.log(
          "PASS in-app publication != pending != acknowledged sent; historical evaluations/reruns not resent",
        );
        await db.query(
          "INSERT INTO session_student_evaluations VALUES($1,$2,$3,$4,'sent','Manual evaluation',NULL,clock_timestamp(),now())",
          [id(40), id(2), id(1), id(11)],
        );
        const manualMeta = JSON.stringify({
          evaluation_id: id(40),
          student_id: id(2),
        });
        await db.query(
          "INSERT INTO notifications(user_id,type,message,meta) VALUES($1,'session_evaluation','Manual evaluation',$2::jsonb)",
          [id(3), manualMeta],
        );
        await db.query(
          "INSERT INTO notifications(user_id,type,message,meta) VALUES($1,'session_evaluation','Duplicate manual evaluation',$2::jsonb)",
          [id(3), manualMeta],
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM evaluation_zalo_publications WHERE evaluation_id=$1",
              [id(40)],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "SELECT notification_delivery_state FROM session_student_evaluations WHERE id=$1",
              [id(40)],
            )
          ).rows[0].notification_delivery_state,
          "published",
        );
        await db.query(
          "INSERT INTO notifications(user_id,type,message,meta) VALUES($1,'session_evaluation','Historical manual',$2::jsonb)",
          [id(3), JSON.stringify({ evaluation_id: id(13), student_id: id(2) })],
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM evaluation_zalo_publications WHERE evaluation_id=$1",
              [id(13)],
            )
          ).rows[0].n,
          0,
        );
        await db.query(
          "INSERT INTO notifications(user_id,type,message,meta) VALUES($1,'session_evaluation','Malformed',$2::jsonb)",
          [
            id(3),
            JSON.stringify({ evaluation_id: "not-a-uuid", student_id: id(2) }),
          ],
        );
        console.log(
          "PASS NEW manual notifications bridge once; historical sent and malformed UUID notifications do not queue",
        );
        await db.query("INSERT INTO users(id,role) VALUES($1,'student')", [
          id(20),
        ]);
        await db.query(
          "INSERT INTO session_student_evaluations VALUES($1,$2,$3,$4,'draft','No parent',NULL,NULL,now())",
          [id(21), id(20), id(1), id(11)],
        );
        await db.query(
          "INSERT INTO session_student_evaluation_statuses VALUES($1)",
          [id(21)],
        );
        await db.query("SELECT auto_send_session_evaluations_after_30m()");
        r = await db.query(
          "SELECT state,sent_at,notification_delivery_state FROM session_student_evaluations WHERE id=$1",
          [id(21)],
        );
        assert.equal(r.rows[0].state, "draft");
        assert.equal(r.rows[0].sent_at, null);
        assert.equal(r.rows[0].notification_delivery_state, "awaiting_parent");
        assert.equal(
          (
            await db.query(
              "SELECT auto_eval_sent_at FROM class_sessions WHERE id=$1",
              [id(11)],
            )
          ).rows[0].auto_eval_sent_at,
          null,
        );
        console.log(
          "PASS zero-recipient drafts retained and session completion marker reopened",
        );
        await db.exec(
          "UPDATE message_templates SET is_enabled=false WHERE id='session_evaluation_notice'",
        );
        assert.equal(
          (
            await db.query(
              "SELECT auto_send_session_evaluations_after_30m() result",
            )
          ).rows[0].result.skipped,
          "template_disabled",
        );
        await db.exec(
          "UPDATE message_templates SET is_enabled=true WHERE id='session_evaluation_notice'",
        );
        await db.query(
          "INSERT INTO tuition_payments VALUES($1,$2,current_date)",
          [id(30), id(2)],
        );
        await db.query(
          "INSERT INTO zalo_parent_contacts VALUES($1,'123','zalo-parent','friend',now())",
          [id(3)],
        );
        await db.query("SELECT set_config('test.role','service_role',false)");
        await db.query(
          "SELECT enqueue_zalo_tuition_receipt($1,100,'partial-receipt')",
          [id(30)],
        );
        await db.exec(
          "UPDATE message_templates SET is_enabled=false WHERE id='tuition_confirmed'",
        );
        assert.equal(
          (
            await db.query(
              "SELECT enqueue_zalo_tuition_receipt($1,200,'disabled') id",
              [id(30)],
            )
          ).rows[0].id,
          null,
        );
        assert.equal(
          (await db.query("SELECT * FROM claim_zalo_tuition_receipt()")).rows
            .length,
          0,
        );
        await db.exec(
          "UPDATE message_templates SET is_enabled=true WHERE id='tuition_confirmed'",
        );
        assert.equal(
          (await db.query("SELECT * FROM claim_zalo_tuition_receipt()")).rows
            .length,
          1,
        );
        console.log(
          "PASS canonical evaluation flag ignores obsolete alias; receipt enqueue AND claim respect disablement",
        );
        await db.query("SELECT set_config('test.role','authenticated',false)");
        await db.query(
          "INSERT INTO attendance VALUES($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'absent',false)",
          [id(10), id(2)],
        );
        r = await db.query(
          "SELECT notify_explicit_attendance_absence($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) n",
          [id(10), id(2)],
        );
        assert.equal(r.rows[0].n, 0);
        await db.exec("UPDATE attendance SET status_overridden=true");
        r = await db.query(
          "SELECT notify_explicit_attendance_absence($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) n",
          [id(10), id(2)],
        );
        assert.equal(r.rows[0].n, 2);
        r = await db.query(
          "SELECT notify_explicit_attendance_absence($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) n",
          [id(10), id(2)],
        );
        assert.equal(r.rows[0].n, 0);
        console.log(
          "PASS synthetic absence rejection and explicit absence per-parent dedupe",
        );
        await db.query(
          "INSERT INTO attendance VALUES($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+1,'absent',true),($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-10,'absent',true)",
          [id(10), id(2)],
        );
        for (const days of [1, -10])
          assert.equal(
            (
              await db.query(
                "SELECT notify_explicit_attendance_absence($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+$3::int) n",
                [id(10), id(2), days],
              )
            ).rows[0].n,
            0,
          );
        await db.query("SELECT set_config('test.uid',$1,false)", [id(4)]);
        await assert.rejects(
          db.query(
            "SELECT notify_explicit_attendance_absence($1,$2,current_date)",
            [id(10), id(2)],
          ),
        );
        await db.query("SELECT set_config('test.uid',$1,false)", [id(1)]);
        console.log(
          "PASS future/pre-enrollment absence and unassigned staff rejected",
        );
        await db.exec("BEGIN");
        await db.exec(
          "UPDATE message_templates SET is_enabled=false WHERE id='tuition_confirmed'",
        );
        await db.exec(
          "CREATE OR REPLACE FUNCTION send_student_learning_message(p_student_id uuid,p_content text,p_real_sender_id uuid DEFAULT NULL,p_audience_user_ids uuid[] DEFAULT NULL) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$",
        );
        await db.exec("COMMIT");
        await assert.rejects(db.exec(policy));
        await db.exec("ROLLBACK");
        assert.equal(
          (
            await db.query(
              "SELECT is_enabled FROM message_templates WHERE id='tuition_confirmed'",
            )
          ).rows[0].is_enabled,
          false,
        );
        console.log(
          "PASS unknown function version fails closed and rollback restores pre-migration data",
        );
      } finally {
        await db.close();
      }
    },
  );
}
