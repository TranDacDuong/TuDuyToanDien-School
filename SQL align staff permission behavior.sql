-- Keep the default teacher/assistant income surface limited to their own salary.
-- Explicit per-user overrides can still grant any of the administrative rights below.
INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT role_name, permission_key, permission_key IN ('page.income', 'income.self.view')
FROM (VALUES ('teacher'), ('assistant')) AS roles(role_name)
CROSS JOIN (VALUES
  ('page.income'),
  ('income.self.view'),
  ('income.all.view'),
  ('income.ledger.create'),
  ('income.ledger.update'),
  ('income.ledger.delete'),
  ('income.reconcile'),
  ('income.payroll.view'),
  ('income.payroll.configure'),
  ('income.payroll.calculate'),
  ('income.bonus.manage')
) AS permissions(permission_key)
ON CONFLICT (role_name, permission_key)
DO UPDATE SET allowed = EXCLUDED.allowed;

-- Home administration must follow explicit permissions instead of the legacy
-- admin role check. Existing owner/admin policies remain intact.
DROP POLICY IF EXISTS app_permission_site_settings_insert ON public.site_settings;
CREATE POLICY app_permission_site_settings_insert ON public.site_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_site_settings_update ON public.site_settings;
CREATE POLICY app_permission_site_settings_update ON public.site_settings
FOR UPDATE TO authenticated
USING (public.has_app_permission('home.info.update'))
WITH CHECK (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_home_teachers_insert ON public.home_teachers;
CREATE POLICY app_permission_home_teachers_insert ON public.home_teachers
FOR INSERT TO authenticated
WITH CHECK (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_home_teachers_update ON public.home_teachers;
CREATE POLICY app_permission_home_teachers_update ON public.home_teachers
FOR UPDATE TO authenticated
USING (public.has_app_permission('home.info.update'))
WITH CHECK (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_home_teachers_delete ON public.home_teachers;
CREATE POLICY app_permission_home_teachers_delete ON public.home_teachers
FOR DELETE TO authenticated
USING (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_exam_events_insert ON public.exam_events;
CREATE POLICY app_permission_exam_events_insert ON public.exam_events
FOR INSERT TO authenticated
WITH CHECK (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_exam_events_delete ON public.exam_events;
CREATE POLICY app_permission_exam_events_delete ON public.exam_events
FOR DELETE TO authenticated
USING (public.has_app_permission('home.info.update'));

DROP POLICY IF EXISTS app_permission_posts_update ON public.posts;
CREATE POLICY app_permission_posts_update ON public.posts
FOR UPDATE TO authenticated
USING (
  public.has_app_permission('home.info.update')
  OR public.has_app_permission('home.discussion.moderate')
)
WITH CHECK (
  public.has_app_permission('home.info.update')
  OR public.has_app_permission('home.discussion.moderate')
);

DROP POLICY IF EXISTS app_permission_posts_delete ON public.posts;
CREATE POLICY app_permission_posts_delete ON public.posts
FOR DELETE TO authenticated
USING (
  public.has_app_permission('home.info.update')
  OR public.has_app_permission('home.discussion.moderate')
);

DROP POLICY IF EXISTS app_permission_comments_update ON public.comments;
CREATE POLICY app_permission_comments_update ON public.comments
FOR UPDATE TO authenticated
USING (public.has_app_permission('home.discussion.moderate'))
WITH CHECK (public.has_app_permission('home.discussion.moderate'));

DROP POLICY IF EXISTS app_permission_comments_delete ON public.comments;
CREATE POLICY app_permission_comments_delete ON public.comments
FOR DELETE TO authenticated
USING (public.has_app_permission('home.discussion.moderate'));
