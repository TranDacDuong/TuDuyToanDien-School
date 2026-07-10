DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reference_materials',
    'courses',
    'course_sessions',
    'lessons',
    'course_enrollments',
    'course_registration_requests',
    'question_bank',
    'question_issue_reports',
    'rooms',
    'grades',
    'subjects',
    'chapters',
    'trial_lesson_requests',
    'classes',
    'class_schedules',
    'class_teachers',
    'class_students',
    'conversations',
    'conversation_members',
    'messages',
    'notifications'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = table_name
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.conversations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.messages REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;
