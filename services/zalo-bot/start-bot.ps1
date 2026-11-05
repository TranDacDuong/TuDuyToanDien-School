$ErrorActionPreference = 'Stop'
try {
    # A separate process is necessary: restart-bot intentionally exits after its
    # port checks. Never attach the worker to the interactive batch console.
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'restart-bot.ps1') -RecoverUnresponsive
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the existing bot safely.' }
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $port = 3456
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)["'']?\s*(?:#.*)?$') { $port = [int]$Matches[1] }
        }
    }
    if ($env:PORT) { $port = [int]$env:PORT }
    if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid bot port.' }
    $logDir = Join-Path $PSScriptRoot 'session'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $outLog = Join-Path $logDir "worker-$stamp.stdout.log"
    $errLog = Join-Path $logDir "worker-$stamp.stderr.log"
    $worker = Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $deadline = (Get-Date).AddSeconds(20)
    do {
        if ($worker.HasExited) { throw "Bot exited. See $errLog" }
        try {
            $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 2
            if ($status.botStatus) { Write-Host "Bot dang chay nen (PID $($worker.Id)). Co the dong cua so nay. Log: $outLog"; exit 0 }
        } catch { Start-Sleep -Milliseconds 250 }
    } while ((Get-Date) -lt $deadline)
    throw "Bot has not answered yet. See $errLog"
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
