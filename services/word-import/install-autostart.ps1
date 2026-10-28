$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'start-worker.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MindUp Word Question Worker' -Action $action -Trigger $trigger -Settings $settings -Description 'Convert Word questions locally; never auto-approve questions.' -Force | Out-Null
Start-ScheduledTask -TaskName 'MindUp Word Question Worker'
