const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

test.describe("Granular permissions regression", () => {
  test("permission migration defines catalog, defaults, overrides, and admin RPCs", () => {
    const sql = fs.readFileSync(path.join(root, "SQL staff granular permissions.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.app_permissions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.role_permission_defaults");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_permission_overrides");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_my_permissions()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_set_user_permission");
    expect(sql).toContain("IF NOT public.mindup_is_admin(auth.uid())");
  });

  test("dashboard menu is connected to permission keys with role fallback", () => {
    const dashboard = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
    const client = fs.readFileSync(path.join(root, "supabaseClient.js"), "utf8");
    expect(dashboard).toContain('data-permission="page.classes"');
    expect(dashboard).toContain('data-permission="page.tuition"');
    expect(dashboard).toContain('data-permission="page.facebook"');
    expect(dashboard).toContain("await window.AppPermissions?.load?.(profile)");
    expect(client).toContain('sb.rpc("get_my_permissions")');
    expect(client).toContain("fallbackPermissions(activeRole)");
  });

  test("system page exposes per-user tri-state permission management", () => {
    const source = fs.readFileSync(path.join(root, "sourcedata.html"), "utf8");
    expect(source).toContain('data-testid="system-tab-permissions"');
    expect(source).toContain("admin_get_permission_management");
    expect(source).toContain("admin_set_user_permissions");
    expect(source).toContain("Theo chức vụ");
    expect(source).toContain("Quản lý cơ bản");
    expect(source).toContain("Mở tất cả");
    expect(source).not.toContain('<option value="accountant">Kế toán</option>');
  });

  test("detailed migration groups tab actions and protects sensitive operations", () => {
    const sql = fs.readFileSync(path.join(root, "SQL detailed staff permissions.sql"), "utf8");
    expect(sql).toContain("group_key text");
    expect(sql).toContain("access_level text");
    expect(sql).toContain("is_sensitive boolean");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.permission_change_log");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_set_user_permissions");
    expect(sql).toContain("IF NOT public.mindup_is_admin(auth.uid())");
    expect(sql).toContain("'tuition.view_assigned'");
    expect(sql).toContain("'tuition.transactions.manage'");
    expect(sql).toContain("'classes.delete'");
    expect(sql).toContain("'courses.delete'");
    expect(sql).toContain("app_permission_tuition_payments_select");
  });

  test("high-risk pages check action permissions instead of only the staff role", () => {
    const tuition = fs.readFileSync(path.join(root, "tuition.js"), "utf8");
    const courses = fs.readFileSync(path.join(root, "courses_logic.js"), "utf8");
    const tasks = fs.readFileSync(path.join(root, "tasks.js"), "utf8");
    expect(tuition).toContain('hasTuitionPermission("tuition.collect"');
    expect(tuition).toContain('hasTuitionPermission("tuition.refund"');
    expect(tuition).toContain('hasTuitionPermission("tuition.transactions.manage"');
    expect(courses).toContain("canManageCourseEnrollments()");
    expect(courses).toContain("canDeleteCourses()");
    expect(tasks).toContain("canViewStaffTasks()");
    expect(tasks).toContain("canManageTaskTemplates()");
  });
});
