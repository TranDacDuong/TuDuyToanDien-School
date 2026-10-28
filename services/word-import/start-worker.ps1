$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Chua cai bo xu ly Word. Hay chay install-worker.ps1 truoc.'
}
& $python (Join-Path $root 'worker.py')
