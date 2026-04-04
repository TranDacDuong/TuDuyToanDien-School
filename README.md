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
