-- Teachers and assistants use the Tasks page for their own assignments and
-- attendance history by default. Center-wide views and management require an
-- explicit per-user grant from the permission editor.
INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT role_name, permission_key,
       permission_key IN ('page.tasks', 'tasks.self.view', 'tasks.self.update', 'tasks.self_update')
FROM (VALUES ('teacher'), ('assistant')) AS roles(role_name)
CROSS JOIN (VALUES
  ('page.tasks'),
  ('tasks.self.view'),
  ('tasks.self.update'),
  ('tasks.self_update'),
  ('tasks.staff_overview'),
  ('tasks.create'),
  ('tasks.assign'),
  ('tasks.update'),
  ('tasks.delete'),
  ('tasks.templates.view'),
  ('tasks.templates.manage'),
  ('tasks.manage')
) AS permissions(permission_key)
ON CONFLICT (role_name, permission_key)
DO UPDATE SET allowed = EXCLUDED.allowed;

NOTIFY pgrst, 'reload schema';
