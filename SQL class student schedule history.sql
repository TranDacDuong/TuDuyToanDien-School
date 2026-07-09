-- Keep historical student schedule choices.
-- After this migration, changing a student's schedule inserts a new effective_from version
-- instead of overwriting/deleting the previous schedule choice.

ALTER TABLE public.class_student_schedules
ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT DATE '2000-01-01';

DELETE FROM public.class_student_schedules a
USING public.class_student_schedules b
WHERE a.ctid < b.ctid
  AND a.class_id = b.class_id
  AND a.student_id = b.student_id
  AND a.session_no = b.session_no
  AND a.effective_from = b.effective_from;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.class_student_schedules'::regclass
      AND contype IN ('p', 'u')
      AND (
        SELECT array_agg(att.attname ORDER BY u.ord)
        FROM unnest(conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = conrelid
         AND att.attnum = u.attnum
      ) = ARRAY['class_id','student_id','session_no']
  LOOP
    EXECUTE format('ALTER TABLE public.class_student_schedules DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT idx.indexrelid::regclass::text AS index_name
    FROM pg_index idx
    JOIN pg_class tbl ON tbl.oid = idx.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'class_student_schedules'
      AND idx.indisunique
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.conindid = idx.indexrelid
      )
      AND (
        SELECT array_agg(att.attname ORDER BY u.ord)
        FROM unnest(idx.indkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = idx.indrelid
         AND att.attnum = u.attnum
      ) = ARRAY['class_id','student_id','session_no']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', r.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS class_student_schedules_effective_unique
ON public.class_student_schedules(class_id, student_id, session_no, effective_from);
