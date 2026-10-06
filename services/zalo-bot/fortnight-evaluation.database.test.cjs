// Offline PostgreSQL only: no live Supabase connection or Zalo sends.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  test = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "../..");
const read = (f) =>
  fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
const migration = read("SQL fortnight parent evaluation fallback.sql");
const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function functionSource(file, name, crlf) {
  const source = read(file),
    start = source.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
  assert(start >= 0, name);
  const end = source.indexOf("$$;", start);
  assert(end >= 0, name);
  const body = source.slice(start, end + 3);
  return crlf ? body.replace(/\n/g, "\r\n") : body;
}
for (const crlf of [false, true]) {
  test(
    "fortnight fallback / atomic draft RPC (" + (crlf ? "CRLF" : "LF") + ")",
    { timeout: 120000 },
    async (t) => {
      const db = new PGlite();
      try {
        await db.exec(
          read("services/zalo-bot/fixtures/parent-evaluations.sql"),
        );
        const schema = read("SQL session evaluations.sql");
        await db.exec(
          schema.slice(
            schema.indexOf(
              "CREATE TABLE IF NOT EXISTS public.evaluation_statuses",
            ),
            schema.indexOf(
              "CREATE OR REPLACE FUNCTION public.set_session_evaluation_updated_at",
            ),
          ),
        );
        await db.exec(
          schema.slice(
            schema.indexOf(
              "UPDATE public.evaluation_statuses SET active = false",
            ),
            schema.lastIndexOf("SELECT\n  (SELECT count(*)"),
          ),
        );
        await db.exec(
          "ALTER TABLE session_student_evaluations ALTER COLUMN generated_message SET NOT NULL; ALTER TABLE session_student_evaluations ALTER COLUMN final_message SET NOT NULL",
        );
        for (const name of [
          "send_student_learning_message",
          "send_student_learning_message_to_audience",
        ]) {
          await db.exec(
            functionSource(
              "SQL unify MindUp official conversations.sql",
              name,
              crlf,
            ).replace(
              "conversation_id, sender_id, content, real_sender_id)",
              "conversation_id, sender_id, content, real_sender_id, context_student_id)",
            ),
          );
        }
        for (const [file, name] of [
          [
            "SQL upsert learning score messages.sql",
            "upsert_student_learning_message",
          ],
          [
            "SQL auto session evaluations function.sql",
            "auto_send_session_evaluations_after_30m",
          ],
          [
            "SQL Zalo tuition payment receipts.sql",
            "enqueue_zalo_tuition_receipt",
          ],
          [
            "SQL Zalo tuition payment receipts.sql",
            "claim_zalo_tuition_receipt",
          ],
          ["SQL Zalo web bridge.sql", "finish_mindup_zalo_message"],
          [
            "SQL unified Zalo dispatch.sql",
            "enqueue_mindup_official_message_trigger",
          ],
        ])
          await db.exec(functionSource(file, name, crlf));
        await db.exec(
          "CREATE TRIGGER enqueue AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION enqueue_mindup_official_message_trigger()",
        );
        await db.query(
          "INSERT INTO users(id,role,full_name) VALUES($1,'admin','Admin'),($2,'parent','Parent'),($3,'teacher','Unassigned')",
          [uuid(1), uuid(2), uuid(3)],
        );
        await db.query(
          "INSERT INTO zalo_verified_links VALUES($1,'parent-zalo',true)",
          [uuid(2)],
        );
        await db.query("SELECT set_config('test.uid',$1,false)", [uuid(1)]);
        await db.exec(
          "INSERT INTO message_templates(id,content,is_enabled) VALUES('session_evaluation_notice','Enabled',true),('session_evaluation','Alias',true)",
        );
        await db.exec(read("SQL parent notification policy.sql"));
        await db.exec(read("SQL automatic evaluation Zalo bridge.sql"));
        await db.exec(migration);
        await db.exec(
          "INSERT INTO evaluation_message_templates(section_type,content,active,weight) VALUES('auto_normal','FORBIDDEN_AUTO_NORMAL',true,1000000)",
        );
        const statusIds = Object.fromEntries(
          (await db.query("SELECT code,id FROM evaluation_statuses")).rows.map(
            (r) => [r.code, r.id],
          ),
        );
        let next = 100;
        const count = async (table) =>
          (await db.query("SELECT count(*)::int n FROM " + table)).rows[0].n;
        const newClass = async () => {
          const id = uuid(next++);
          await db.query("INSERT INTO classes VALUES($1,'Math class',NULL)", [
            id,
          ]);
          return id;
        };
        const student = async (c, options = {}) => {
          const id = uuid(next++);
          await db.query(
            "INSERT INTO users(id,role,full_name) VALUES($1,'student','Student')",
            [id],
          );
          await db.query(
            "INSERT INTO class_students(class_id,student_id,joined_at,left_at) VALUES($1,$2,$3,$4)",
            [
              c,
              id,
              options.joined || "2020-01-01T00:00:00Z",
              options.left || null,
            ],
          );
          await db.query("INSERT INTO parent_students VALUES($1,$2,NULL)", [
            id,
            uuid(2),
          ]);
          return id;
        };
        const session = async (c, date, ends) => {
          const id = uuid(next++);
          await db.query(
            "INSERT INTO class_sessions VALUES($1,$2,$3,$4,NULL)",
            [id, c, date, ends],
          );
          return id;
        };
        const attended = async (
          c,
          s,
          date,
          status = "present",
          overridden = false,
        ) =>
          db.query(
            "INSERT INTO attendance(class_id,student_id,date,status,schedule_id,session_no,status_overridden) VALUES($1,$2,$3,$4,1,1,$5)",
            [c, s, date, status, overridden],
          );
        const saveQuery =
          "SELECT save_session_evaluation_draft($1,$2,$3::uuid[],$4,$5::jsonb,$6,$7) saved";
        const draft = async (
          cs,
          s,
          ids,
          message = null,
          expected = null,
          requestId = uuid(next++),
        ) => {
          const params = [cs, s, ids, message, {}, requestId, expected];
          return {
            saved: (await db.query(saveQuery, params)).rows[0].saved,
            params,
          };
        };
        const scan = async (now) =>
          (
            await db.query(
              "SELECT send_fortnight_evaluation_fallback($1) result",
              [now],
            )
          ).rows[0].result;
        await t.test(
          "idempotent migration baseline and exact seven-argument RPC",
          async () => {
            const baseline = (
              await db.query(
                "SELECT installed_at FROM fortnight_evaluation_installation",
              )
            ).rows[0].installed_at;
            await db.exec(migration);
            assert.deepEqual(
              (
                await db.query(
                  "SELECT installed_at FROM fortnight_evaluation_installation",
                )
              ).rows[0].installed_at,
              baseline,
            );
            const f = (
              await db.query(
                "SELECT pronargs,proargnames FROM pg_proc WHERE proname='save_session_evaluation_draft'",
              )
            ).rows;
            assert.equal(f.length, 1);
            assert.equal(f[0].pronargs, 7);
            assert.deepEqual(f[0].proargnames, [
              "p_class_session_id",
              "p_student_id",
              "p_status_ids",
              "p_message",
              "p_template_selection",
              "p_request_id",
              "p_expected_updated_at",
            ]);
            assert.equal(await count("messages"), 0);
          },
        );
        await t.test(
          "NULL text under NOT NULL schema, [] clear, idempotent retries and stale timestamp rejection",
          async () => {
            const c = await newClass(),
              s = await student(c),
              cs = await session(c, "2028-01-10", "2028-01-10T14:00:00Z");
            const initial = await draft(cs, s, [
              statusIds.knowledge_good,
              statusIds.focused,
            ]);
            assert.equal(initial.saved.final_message, "");
            assert.equal(initial.saved.generated_message, "");
            assert.deepEqual(
              (await db.query(saveQuery, initial.params)).rows[0].saved,
              initial.saved,
            );
            const clear = await draft(
              cs,
              s,
              [],
              null,
              initial.saved.updated_at,
            );
            assert.deepEqual(clear.saved.status_ids, []);
            await db.query(saveQuery, initial.params);
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM session_student_evaluation_statuses WHERE evaluation_id=$1",
                  [initial.saved.id],
                )
              ).rows[0].n,
              0,
            );
            await assert.rejects(
              draft(cs, s, [statusIds.focused], null, "1950-01-01T00:00:00Z"),
              /reload before saving/,
            );
            await assert.rejects(
              draft(cs, s, [uuid(9999)], null, clear.saved.updated_at),
              /Active evaluation statuses/,
            );
            const changed = [...initial.params];
            changed[3] = "different";
            await assert.rejects(
              db.query(saveQuery, changed),
              /reused with different/,
            );
            await db.query("SELECT set_config('test.uid',$1,false)", [uuid(3)]);
            await assert.rejects(draft(cs, s, []), /Assigned class staff/);
            await db.query("SELECT set_config('test.uid',$1,false)", [uuid(1)]);
          },
        );
        await t.test(
          "evidence-free failed drafts retry with refreshed timestamp, published failures cannot",
          async () => {
            const c = await newClass(),
              s = await student(c),
              cs = await session(c, "2028-01-11", "2028-01-11T14:00:00Z");
            const initial = await draft(cs, s, [statusIds.focused]);
            const failed = (
              await db.query(
                "UPDATE session_student_evaluations SET state='failed',updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
                [initial.saved.id],
              )
            ).rows[0];
            await assert.rejects(
              draft(cs, s, [statusIds.focused], null, initial.saved.updated_at),
              /reload before saving/,
            );
            const retried = await draft(
              cs,
              s,
              [statusIds.focused],
              null,
              failed.updated_at,
            );
            assert.equal(retried.saved.state, "draft");
            const published = (
              await db.query(
                "UPDATE session_student_evaluations SET state='failed',notification_published_at=now(),updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
                [initial.saved.id],
              )
            ).rows[0];
            await assert.rejects(
              draft(cs, s, [], null, published.updated_at),
              /publication evidence/,
            );
          },
        );
        await t.test(
          "positive-only AND attention selections dispatch individually after 30m, never auto_normal",
          async () => {
            const c = await newClass(),
              s = await student(c),
              s2 = await student(c);
            const day = (
              await db.query(
                "SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS value",
              )
            ).rows[0].value;
            const cs = await session(
              c,
              day,
              new Date(Date.now() - 20 * 60000).toISOString(),
            );
            const positive = await draft(cs, s, [
              statusIds.knowledge_good,
              statusIds.focused,
            ]);
            await draft(cs, s2, [statusIds.knowledge_slow]);
            let result = (
              await db.query(
                "SELECT auto_send_session_evaluations_after_30m($1) result",
                [cs],
              )
            ).rows[0].result;
            assert.equal(result.evaluations_published, 0);
            await db.query(
              "UPDATE class_sessions SET ends_at=now()-interval '31 minutes' WHERE id=$1",
              [cs],
            );
            result = (
              await db.query(
                "SELECT auto_send_session_evaluations_after_30m($1) result",
                [cs],
              )
            ).rows[0].result;
            assert.equal(result.evaluations_published, 2);
            const e = (
              await db.query(
                "SELECT * FROM session_student_evaluations WHERE id=$1",
                [positive.saved.id],
              )
            ).rows[0];
            assert.equal(e.state, "sent");
            assert(e.final_message.includes("Trong buổi học môn"));
            assert(!e.final_message.includes("FORBIDDEN_AUTO_NORMAL"));
            assert.equal(e.template_selection.positive_descriptions.length, 2);
            assert.equal(e.template_selection.attention_descriptions.length, 0);
            assert.equal(
              (
                await db.query(
                  "SELECT zalo_delivery_status FROM evaluation_zalo_publications WHERE evaluation_id=$1",
                  [e.id],
                )
              ).rows[0].zalo_delivery_status,
              "pending",
            );
            assert.equal(
              (
                await db.query(
                  "SELECT section_type FROM evaluation_message_templates WHERE id=$1",
                  [e.template_selection.closing],
                )
              ).rows[0].section_type,
              "opening",
            );
            const attention = (
              await db.query(
                "SELECT template_selection FROM session_student_evaluations WHERE student_id=$1",
                [s2],
              )
            ).rows[0].template_selection;
            assert.equal(
              (
                await db.query(
                  "SELECT section_type FROM evaluation_message_templates WHERE id=$1",
                  [attention.closing],
                )
              ).rows[0].section_type,
              "closing",
            );
          },
        );
        await t.test(
          "weighted chooser avoids previous IDs; teacher-authored text is preserved",
          async () => {
            const c = await newClass(),
              s = await student(c),
              day = (
                await db.query(
                  "SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS value",
                )
              ).rows[0].value;
            const cs = await session(
                c,
                day,
                new Date(Date.now() - 35 * 60000).toISOString(),
              ),
              e = await draft(
                cs,
                s,
                [statusIds.focused],
                "Teacher authored message",
              );
            await db.query(
              "SELECT auto_send_session_evaluations_after_30m($1)",
              [cs],
            );
            assert.equal(
              (
                await db.query(
                  "SELECT final_message FROM session_student_evaluations WHERE id=$1",
                  [e.saved.id],
                )
              ).rows[0].final_message,
              "Teacher authored message",
            );
            const templates = (
              await db.query(
                "SELECT id FROM evaluation_message_templates WHERE status_id=$1 AND active",
                [statusIds.focused],
              )
            ).rows;
            await db.query(
              "UPDATE evaluation_message_templates SET weight=1000000 WHERE id=$1",
              [templates[0].id],
            );
            const chosen = (
              await db.query(
                "SELECT (pick_parent_evaluation_template('status',$1,$2::jsonb)).id id",
                [statusIds.focused, JSON.stringify([templates[0].id])],
              )
            ).rows[0].id;
            assert.notEqual(chosen, templates[0].id);
          },
        );
        await t.test(
          "closed fortnight, 07:00 window, full final lesson+30m, imports, departed students, durable dedupe and ack",
          async () => {
            const c = await newClass(),
              s = await student(c),
              absent = await student(c),
              stopped = await student(c, { left: "2028-01-10T00:00:00Z" }),
              future = await student(c, { joined: "2028-01-14T00:00:00Z" });
            await session(c, "2028-01-05", "2028-01-05T14:00:00Z");
            await session(c, "2028-01-15", "2028-01-16T00:15:00Z");
            await attended(c, s, "2028-01-05");
            await attended(c, absent, "2028-01-05", "absent", true);
            await attended(c, stopped, "2028-01-05");
            await attended(c, future, "2028-01-05");
            const oldAttendance = (
              await db.query(
                "SELECT * FROM attendance ORDER BY class_id,student_id,date",
              )
            ).rows;
            const before = await count("messages");
            await scan("2028-01-15T01:00:00Z");
            assert.equal(await count("messages"), before);
            assert.equal(
              (await scan("2028-01-15T17:00:00Z")).skipped,
              "outside_delivery_window",
            );
            assert.equal(
              (await scan("2028-01-16T00:00:00Z")).evaluations_published,
              0,
            );
            const result = await scan("2028-01-16T01:00:00Z");
            assert.equal(result.period_start, "2028-01-01");
            assert.equal(result.period_end, "2028-01-15");
            const ledgers = (
              await db.query(
                "SELECT * FROM fortnight_evaluation_publications WHERE class_id=$1",
                [c],
              )
            ).rows;
            assert.equal(ledgers.length, 1);
            assert.equal(ledgers[0].student_id, s);
            const e = (
              await db.query(
                "SELECT * FROM session_student_evaluations WHERE id=$1",
                [ledgers[0].evaluation_id],
              )
            ).rows[0];
            assert(e.final_message.includes("Trong 2 tuần vừa qua"));
            assert(!e.final_message.includes("FORBIDDEN_AUTO_NORMAL"));
            assert.equal(e.template_selection.positive_descriptions.length, 2);
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM session_student_evaluation_statuses WHERE evaluation_id=$1",
                  [e.id],
                )
              ).rows[0].n,
              0,
            );
            assert.deepEqual(
              (
                await db.query(
                  "SELECT * FROM attendance ORDER BY class_id,student_id,date",
                )
              ).rows,
              oldAttendance,
            );
            const after = await count("messages");
            await scan("2028-01-16T02:00:00Z");
            await db.exec(migration);
            await scan("2028-01-17T01:00:00Z");
            assert.equal(await count("messages"), after);
            const job = (
              await db.query(
                "SELECT outbox_id FROM evaluation_zalo_publications WHERE evaluation_id=$1",
                [e.id],
              )
            ).rows[0].outbox_id;
            await db.query(
              "UPDATE zalo_outbox SET status='processing' WHERE id=$1",
              [job],
            );
            await db.query(
              "SELECT set_config('test.role','service_role',false)",
            );
            await db.query(
              "SELECT finish_mindup_zalo_message($1,'sent',NULL)",
              [job],
            );
            assert.equal(
              (
                await db.query(
                  "SELECT zalo_delivery_status FROM evaluation_zalo_publications WHERE evaluation_id=$1",
                  [e.id],
                )
              ).rows[0].zalo_delivery_status,
              "sent",
            );
            await db.query(
              "SELECT set_config('test.role','authenticated',false)",
            );
          },
        );
        await t.test(
          "ALL individual statuses/reviews and pending, error, uncertain or sent evidence suppress generic fallback",
          async () => {
            const c = await newClass(),
              cs = await session(c, "2028-01-10", "2028-01-10T14:00:00Z");
            for (const kind of [
              "positive_pending",
              "attention_pending",
              "review",
              "failed",
              "queued",
              "uncertain",
              "sent",
            ]) {
              const s = await student(c);
              await attended(c, s, "2028-01-10");
              const record = await draft(
                cs,
                s,
                kind === "review"
                  ? []
                  : [
                      kind === "attention_pending"
                        ? statusIds.knowledge_slow
                        : statusIds.knowledge_good,
                    ],
                kind === "review" ? "Individual written review" : null,
              );
              if (kind === "failed")
                await db.query(
                  "UPDATE session_student_evaluations SET state='failed' WHERE id=$1",
                  [record.saved.id],
                );
              if (["queued", "uncertain", "sent"].includes(kind)) {
                await db.query(
                  "UPDATE session_student_evaluations SET state='sent',sent_at=clock_timestamp() WHERE id=$1",
                  [record.saved.id],
                );
                await db.query(
                  "INSERT INTO notifications(user_id,type,message,meta) VALUES($1,'session_evaluation','Individual',$2::jsonb)",
                  [
                    uuid(2),
                    JSON.stringify({
                      student_id: s,
                      evaluation_id: record.saved.id,
                    }),
                  ],
                );
                const status = kind === "queued" ? "pending" : kind;
                await db.query(
                  "UPDATE zalo_outbox SET status=$1,sent_at=CASE WHEN $1='sent' THEN now() ELSE NULL END WHERE message_id IN(SELECT message_id FROM evaluation_zalo_publications WHERE evaluation_id=$2)",
                  [status, record.saved.id],
                );
              }
            }
            await scan("2028-01-16T01:00:00Z");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM fortnight_evaluation_publications WHERE class_id=$1",
                  [c],
                )
              ).rows[0].n,
              0,
            );
          },
        );
        await t.test(
          "leap-year second-half and following first-half calendar boundaries dedupe independently",
          async () => {
            const c = await newClass(),
              s = await student(c);
            await session(c, "2028-02-29", "2028-02-29T14:00:00Z");
            await attended(c, s, "2028-02-29", "makeup");
            let result = await scan("2028-03-01T00:00:00Z");
            assert.equal(result.period_start, "2028-02-16");
            assert.equal(result.period_end, "2028-02-29");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM fortnight_evaluation_publications WHERE class_id=$1",
                  [c],
                )
              ).rows[0].n,
              1,
            );
            await session(c, "2028-03-15", "2028-03-15T14:00:00Z");
            await attended(c, s, "2028-03-15");
            result = await scan("2028-03-16T00:00:00Z");
            assert.equal(result.period_start, "2028-03-01");
            assert.equal(result.period_end, "2028-03-15");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM fortnight_evaluation_publications WHERE class_id=$1",
                  [c],
                )
              ).rows[0].n,
              2,
            );
          },
        );
        await t.test(
          "installation cutoff prevents historical backlog; canonical switch and missing templates defer safely",
          async () => {
            await db.exec(
              "UPDATE fortnight_evaluation_installation SET installed_at='2028-01-16T00:00:00+07'",
            );
            const before = await count("messages");
            assert.equal(
              (await scan("2028-01-16T00:00:00Z")).skipped,
              "pre_installation_period",
            );
            await db.exec(migration);
            assert.equal(
              (await scan("2028-01-17T00:00:00Z")).skipped,
              "pre_installation_period",
            );
            assert.equal(await count("messages"), before);
            await db.exec(
              "UPDATE fortnight_evaluation_installation SET installed_at='2020-01-01T00:00:00Z'; UPDATE message_templates SET is_enabled=false WHERE id='session_evaluation_notice'",
            );
            assert.equal(
              (await scan("2028-04-01T00:00:00Z")).skipped,
              "template_disabled",
            );
            await db.exec(
              "UPDATE message_templates SET is_enabled=true WHERE id='session_evaluation_notice'",
            );
            const c = await newClass(),
              s = await student(c);
            await session(c, "2028-04-10", "2028-04-10T14:00:00Z");
            await attended(c, s, "2028-04-10");
            await db.query(
              "UPDATE evaluation_message_templates SET active=false WHERE status_id=$1",
              [statusIds.focused],
            );
            await scan("2028-04-16T00:00:00Z");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM fortnight_evaluation_publications WHERE class_id=$1",
                  [c],
                )
              ).rows[0].n,
              0,
            );
            await db.query(
              "UPDATE evaluation_message_templates SET active=true WHERE status_id=$1",
              [statusIds.focused],
            );
            await scan("2028-04-16T01:00:00Z");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int n FROM fortnight_evaluation_publications WHERE class_id=$1",
                  [c],
                )
              ).rows[0].n,
              1,
            );
            assert(!migration.includes("'auto_normal'"));
          },
        );
        await t.test(
          "untrusted callers cannot invoke the fortnight dispatcher",
          async () => {
            await db.exec("SET ROLE authenticated");
            await assert.rejects(
              db.query(
                "SELECT send_fortnight_evaluation_fallback('2028-05-01T00:00:00Z')",
              ),
              /permission denied/,
            );
            await db.exec("RESET ROLE");
          },
        );
      } finally {
        await db.close();
      }
    },
  );
}
