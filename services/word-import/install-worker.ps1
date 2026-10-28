$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bundled = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$python = if ($env:MINDUP_PYTHON) { $env:MINDUP_PYTHON } elseif (Test-Path -LiteralPath $bundled) { $bundled } else { (Get-Command python).Source }
$venv = Join-Path $root '.venv'
if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts/python.exe'))) {
    & $python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python environment' }
}
& (Join-Path $venv 'Scripts/python.exe') -m pip install -r (Join-Path $root 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Cannot install Word conversion dependencies' }
