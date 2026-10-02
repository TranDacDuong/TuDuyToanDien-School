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
    expect(source).toContain("Khôi phục theo chức vụ");
    expect(source).toContain("applyAllPermissionPreset");
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

  test("fine-grained migration separates subtabs and CRUD actions", () => {
    const sql = fs.readFileSync(path.join(root, "SQL fine grained action permissions.sql"), "utf8");
    const source = fs.readFileSync(path.join(root, "sourcedata.html"), "utf8");
    const resources = fs.readFileSync(path.join(root, "resources.html"), "utf8");
    const trials = fs.readFileSync(path.join(root, "trial_requests.html"), "utf8");

    expect(sql).toContain("subgroup_key text");
    expect(sql).toContain("action_key text");
    expect(sql).toContain("'system.grades.view'");
    expect(sql).toContain("'system.grades.create'");
    expect(sql).toContain("'system.grades.update'");
    expect(sql).toContain("'system.grades.delete'");
    expect(sql).toContain("'facebook.assignments.manage'");
    expect(sql).toContain("mindup_permission_map");
    expect(source).toContain("permissionSubgroupKey");
    expect(source).toContain('data-permission="system.grades.view"');
    expect(source).toContain("require?.('system.grades.delete')");
    expect(resources).toContain("canCreateResources");
    expect(resources).toContain("canDeleteResources");
    expect(trials).toContain('data-permission="trial.class.assign"');
    expect(trials).not.toContain('data-permission="trial.manage"');
  });

  test("exam, question, public exam, and task actions enforce their dedicated permissions", () => {
    const exam = fs.readFileSync(path.join(root, "exam.js"), "utf8");
    const publicExam = fs.readFileSync(path.join(root, "public_exam.js"), "utf8");
    const questions = fs.readFileSync(path.join(root, "question_list.js"), "utf8");
    const questionCreate = fs.readFileSync(path.join(root, "question_create.js"), "utf8");
    const tasks = fs.readFileSync(path.join(root, "tasks.js"), "utf8");

    expect(exam).toContain('hasExamPermission("exam.create")');
    expect(exam).toContain('hasExamPermission("exam.delete")');
    expect(exam).toContain('hasExamPermission("exam.questions.manage")');
    expect(exam).not.toContain('"exam.manage"');
    expect(publicExam).toContain('"public_exam.publish"');
    expect(publicExam).toContain('"public_exam.delete"');
    expect(publicExam).not.toContain('"public_exam.manage"');
    expect(questions).toContain('hasQuestionPermission("question.archive")');
    expect(questions).toContain('hasQuestionPermission("question.ai.generate")');
    expect(questionCreate).toContain('editingQuestionId ? "question.update" : "question.create"');
    expect(tasks).toContain('hasTaskPermission("tasks.delete"');
    expect(tasks).not.toContain('hasTaskPermission("tasks.manage"');
  });

  test("full staff grants switch role-shaped pages into their administrative views", () => {
    const dashboard = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
    const home = fs.readFileSync(path.join(root, "home.html"), "utf8");
    const courses = fs.readFileSync(path.join(root, "courses_logic.js"), "utf8");
    const classes = fs.readFileSync(path.join(root, "class_list.js"), "utf8");
    const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
    const income = fs.readFileSync(path.join(root, "income.html"), "utf8");

    expect(dashboard).toContain('"ops.overview.view", "ops.learning.view", "ops.staff.view"');
    expect(home).toContain('hasHomePermission("home.info.update"');
    expect(home).toContain("await window.AppPermissions?.load?.({ id: user.id, role })");
    expect(courses).toContain("canViewAllCourses()");
    expect(courses).toContain("assignedIds.has(course.id)");
    expect(courses).not.toContain("$1\n");
    expect(classes).toContain('has?.("classes.all.view"');
    expect(game).toContain('"game.content.create", "game.content.update", "game.content.delete"');
    expect(income).toContain('hasIncomePermission("income.all.view"');
    expect(income).not.toContain('hasIncomePermission("income.manage"');
  });

  test("teacher and assistant income defaults only expose personal income", () => {
    const sql = fs.readFileSync(path.join(root, "SQL align staff permission behavior.sql"), "utf8");
    const client = fs.readFileSync(path.join(root, "supabaseClient.js"), "utf8");
    expect(sql).toContain("permission_key IN ('page.income', 'income.self.view')");
    expect(sql).toContain("('income.all.view')");
    expect(sql).toContain("('income.payroll.view')");
    expect(client).not.toContain('"income.manage", "facebook.manage"');
  });
});
