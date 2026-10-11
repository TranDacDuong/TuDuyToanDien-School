$ErrorActionPreference = 'Stop'
try {
    $port = 3456
    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)["'']?\s*(?:#.*)?$') { $port = [int]$Matches[1] }
        }
    }
    if ($env:PORT) { $port = [int]$env:PORT }
    if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid bot port.' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if (!$listeners.Count) { exit 0 }
    $owners = @($listeners.OwningProcess | Sort-Object -Unique)
    if ($owners.Count -ne 1) { throw 'Multiple processes own the bot port.' }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
    $server = Join-Path $PSScriptRoot 'server.js'
    $absolute = '"?' + [regex]::Escape($server) + '"?\s*$'
    $legacy = '\bnode(?:\.exe)?"?\s+server\.js\s*$'
    if ($owner.Name -ne 'node.exe' -or ($owner.CommandLine -notmatch $absolute -and $owner.CommandLine -notmatch $legacy)) {
        throw 'Port belongs to another application. It will not be stopped.'
    }
    $base = "http://127.0.0.1:$port/api"
    $status = Invoke-RestMethod -Uri "$base/status" -TimeoutSec 5
    if (!$status.botStatus) { throw 'Service is not recognized as Zalo Bot.' }
    Write-Host 'Dang dung Zalo Bot cu...'
    try {
        Invoke-RestMethod -Method Post -Uri "$base/shutdown" -TimeoutSec 130 | Out-Null
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        # Older releases have no graceful shutdown endpoint.
        Write-Host 'Bot cu chua ho tro dung an toan; dang dung dung tien trinh bot.'
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.ProcessId)"
        if ($current -and $current.CreationDate -eq $owner.CreationDate) {
            Stop-Process -Id $owner.ProcessId -ErrorAction Stop
        }
    }
    $deadline = (Get-Date).AddSeconds(15)
    do {
        if (!(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { exit 0 }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw 'Bot port is still occupied. New bot was not started.'
} catch {
    Write-Host "Khong the khoi dong lai: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
