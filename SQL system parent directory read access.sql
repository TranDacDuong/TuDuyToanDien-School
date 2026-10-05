BEGIN;
DROP POLICY IF EXISTS parent_students_system_directory_read ON public.parent_students;
CREATE POLICY parent_students_system_directory_read ON public.parent_students FOR SELECT TO authenticated
  USING (public.has_app_permission('system.students.view'));
DROP POLICY IF EXISTS users_system_parent_directory_read ON public.users;
CREATE POLICY users_system_parent_directory_read ON public.users FOR SELECT TO authenticated
  USING (role::text='parent' AND public.has_app_permission('system.students.view'));
DROP POLICY IF EXISTS zalo_contacts_system_directory_read ON public.zalo_parent_contacts;
CREATE POLICY zalo_contacts_system_directory_read ON public.zalo_parent_contacts FOR SELECT TO authenticated
  USING (public.has_app_permission('system.students.view'));
DROP POLICY IF EXISTS zalo_alias_jobs_system_manage_read ON public.zalo_parent_alias_jobs;
CREATE POLICY zalo_alias_jobs_system_manage_read ON public.zalo_parent_alias_jobs FOR SELECT TO authenticated
  USING (public.has_app_permission('system.zalo.manage'));
NOTIFY pgrst,'reload schema';
COMMIT;
