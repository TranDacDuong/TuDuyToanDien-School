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
    expect(source).toContain("admin_set_user_permission");
    expect(source).toContain("Theo chức vụ");
    expect(source).not.toContain('<option value="accountant">Kế toán</option>');
  });
});
