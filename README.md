# TuDuyToanDien-School

## Playwright E2E

Run smoke tests against the deployed site:

```powershell
"C:\Program Files\nodejs\npm.cmd" install
"C:\Program Files\nodejs\npx.cmd" playwright install chromium
"C:\Program Files\nodejs\npm.cmd" run test:e2e
```

Optional custom target:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://tuduytoandien.vercel.app"
"C:\Program Files\nodejs\npm.cmd" run test:e2e
```

Role-based regression tests can use credentials from environment variables:

```powershell
$env:PLAYWRIGHT_ADMIN_EMAIL="admin@example.com"
$env:PLAYWRIGHT_ADMIN_PASSWORD="secret"
$env:PLAYWRIGHT_TEACHER_EMAIL="teacher@example.com"
$env:PLAYWRIGHT_TEACHER_PASSWORD="secret"
$env:PLAYWRIGHT_STUDENT_EMAIL="student@example.com"
$env:PLAYWRIGHT_STUDENT_PASSWORD="secret"
"C:\Program Files\nodejs\npm.cmd" run test:e2e
```

Clean temporary live test data by prefix:

```powershell
$env:PLAYWRIGHT_ADMIN_EMAIL="admin@example.com"
$env:PLAYWRIGHT_ADMIN_PASSWORD="secret"
$env:CLEANUP_PREFIXES="TEST-CODEX-,TEST-ROLE-,PW-REG-"
"C:\Program Files\nodejs\npm.cmd" run cleanup:e2e
```
