$ErrorActionPreference = 'Stop'
$botDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $botDir '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Configure services/zalo-bot/.env before enabling autostart.'
}
$node = (Get-Command node -ErrorAction Stop).Source
$taskName = 'MindUp Zalo Gateway'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $node -Argument 'server.js' -WorkingDirectory $botDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Start the local MindUp Zalo gateway when this user signs in' -Force -ErrorAction Stop | Out-Null
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  throw 'Scheduled task registration could not be verified.'
}
Write-Host "Installed scheduled task: $taskName"
