param([switch]$Setup)
$ErrorActionPreference = 'Stop'
$engineRoot = Split-Path -Parent $PSScriptRoot
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
$uvPath = if ($uvCommand) { $uvCommand.Source } else { Join-Path $env:USERPROFILE '.local/bin/uv.exe' }
if (-not (Test-Path -LiteralPath $uvPath)) { throw 'Please install uv, then run this script again.' }
$env:UV_PROJECT_ENVIRONMENT = Join-Path $engineRoot '.venv-redaction'
$env:PYTHONPATH = Join-Path $engineRoot 'src'
Push-Location $engineRoot
try {
    if ($Setup -or -not (Test-Path -LiteralPath "$env:UV_PROJECT_ENVIRONMENT/Scripts/python.exe")) {
        & $uvPath sync --locked --group redaction
        if ($LASTEXITCODE -ne 0) { throw 'Local recognition dependencies could not be installed.' }
        & $uvPath run --locked --group redaction python -m stirling.redaction.download
        if ($LASTEXITCODE -ne 0) { throw 'The Chinese model could not be installed.' }
    }
    & $uvPath run --locked --group redaction python -m stirling.redaction.server
} finally {
    Pop-Location
}
