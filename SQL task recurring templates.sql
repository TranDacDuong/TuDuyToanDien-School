-- Admin-created recurring task templates with N required result items.
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  recurrence text NOT NULL CHECK (recurrence IN ('daily', 'weekly')),
  weekday int CHECK (weekday BETWEEN 1 AND 7),
  action_url text,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_templates_active_idx
  ON public.task_templates (active, recurrence, weekday);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_templates_admin_all ON public.task_templates;
CREATE POLICY task_templates_admin_all
ON public.task_templates
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.task_period_key(p_day date, p_recurrence text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_recurrence = 'weekly' THEN to_char(date_trunc('week', p_day::timestamp), 'YYYY-MM-DD')
    ELSE to_char(p_day, 'YYYY-MM-DD')
  END
$$;

CREATE OR REPLACE FUNCTION public.materialize_admin_task_templates(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_from date := COALESCE(p_from, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_to date := COALESCE(p_to, v_from);
  v_day date;
  v_template public.task_templates;
  v_task_id uuid;
  v_user_id uuid;
  v_count integer := 0;
  v_due_at timestamptz;
  v_source_key text;
BEGIN
  FOR v_day IN SELECT generate_series(v_from, v_to, interval '1 day')::date LOOP
    FOR v_template IN
      SELECT *
      FROM public.task_templates
      WHERE active = true
        AND (
          recurrence = 'daily'
          OR (recurrence = 'weekly' AND weekday = EXTRACT(ISODOW FROM v_day)::int)
        )
    LOOP
      v_task_id := gen_random_uuid();
      v_source_key := 'template:' || v_template.id || ':' || public.task_period_key(v_day, v_template.recurrence);
      v_due_at := (v_day::timestamp + interval '23 hours 59 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh';

      INSERT INTO public.daily_tasks (
        id, title, description, task_type, source_type, source_id, source_key,
        priority, available_on, due_at, action_url, auto_generated,
        verification_mode, created_by, metadata
      ) VALUES (
        v_task_id, v_template.title, v_template.description, 'manual',
        'task_template', v_template.id::text, v_source_key,
        v_template.priority, v_day, v_due_at, v_template.action_url,
        true, 'manual', v_template.created_by,
        jsonb_build_object(
          'requires_result', true,
          'requirements', v_template.requirements,
          'template_id', v_template.id,
          'recurrence', v_template.recurrence
        )
      )
      ON CONFLICT (source_key) DO NOTHING
      RETURNING id INTO v_task_id;

      IF v_task_id IS NULL THEN
        SELECT id INTO v_task_id FROM public.daily_tasks WHERE source_key = v_source_key LIMIT 1;
      ELSE
        v_count := v_count + 1;
      END IF;

      FOREACH v_user_id IN ARRAY v_template.assignee_ids LOOP
        INSERT INTO public.task_assignments (task_id, user_id, assigned_by)
        VALUES (v_task_id, v_user_id, v_template.created_by)
        ON CONFLICT DO NOTHING;
        INSERT INTO public.task_preferences (user_id) VALUES (v_user_id)
        ON CONFLICT (user_id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_task(
  p_title text,
  p_description text,
  p_priority text,
  p_due_at timestamptz,
  p_action_url text,
  p_user_ids uuid[],
  p_requirements jsonb DEFAULT '[]'::jsonb,
  p_recurrence text DEFAULT 'once',
  p_weekday int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid := gen_random_uuid();
  v_template_id uuid;
  v_user_id uuid;
  v_recurrence text := COALESCE(NULLIF(p_recurrence, ''), 'once');
  v_requirements jsonb := COALESCE(p_requirements, '[]'::jsonb);
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF trim(COALESCE(p_title, '')) = '' OR COALESCE(array_length(p_user_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Title and assignees are required';
  END IF;

  IF v_recurrence IN ('daily', 'weekly') THEN
    INSERT INTO public.task_templates (
      title, description, priority, recurrence, weekday, action_url,
      requirements, assignee_ids, created_by
    ) VALUES (
      trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
      COALESCE(p_priority, 'normal'), v_recurrence,
      CASE WHEN v_recurrence = 'weekly' THEN COALESCE(p_weekday, EXTRACT(ISODOW FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int) ELSE NULL END,
      NULLIF(trim(COALESCE(p_action_url, '')), ''),
      v_requirements, p_user_ids, auth.uid()
    )
    RETURNING id INTO v_template_id;

    PERFORM public.materialize_admin_task_templates(
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 31
    );
    RETURN v_template_id;
  END IF;

  INSERT INTO public.daily_tasks (
    id, title, description, task_type, source_type, source_id, source_key,
    priority, available_on, due_at, action_url, auto_generated,
    verification_mode, created_by, metadata
  ) VALUES (
    v_task_id, trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
    'manual', 'manual', v_task_id::text, 'manual:' || v_task_id,
    COALESCE(p_priority, 'normal'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    p_due_at, NULLIF(trim(COALESCE(p_action_url, '')), ''), false, 'manual', auth.uid(),
    jsonb_build_object('requires_result', true, 'requirements', v_requirements)
  );

  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    INSERT INTO public.task_assignments (task_id, user_id, assigned_by)
    VALUES (v_task_id, v_user_id, auth.uid());
    INSERT INTO public.task_preferences (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.task_events (task_id, actor_id, event_type, metadata)
  VALUES (v_task_id, auth.uid(), 'created', jsonb_build_object('assignee_count', array_length(p_user_ids, 1)));
  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_admin_task_templates(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_task(text, text, text, timestamptz, text, uuid[], jsonb, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_admin_task_templates(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_task(text, text, text, timestamptz, text, uuid[], jsonb, text, int) TO authenticated;
