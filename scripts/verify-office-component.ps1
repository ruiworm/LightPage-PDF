[CmdletBinding()]
param([string]$CacheDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) 'lightpage-office-release'))

$ErrorActionPreference = 'Stop'
$taskComponent = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../frontend/editor/src-tauri/office-component.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
$taskArchive = Join-Path $CacheDirectory ([System.IO.Path]::GetFileName(([uri]$taskComponent.url).AbsolutePath))
if (-not (Test-Path -LiteralPath $taskArchive)) {
    Invoke-WebRequest -Uri $taskComponent.url -OutFile $taskArchive -TimeoutSec 1800
}
if ((Get-Item -LiteralPath $taskArchive).Length -ne $taskComponent.bytes -or
    (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne $taskComponent.sha256) {
    throw 'Optional Office release checksum or size mismatch'
}
Write-Output "Verified optional Office release: $($taskComponent.version)"
if ($env:GITHUB_ENV) {
    "LIGHTPAGE_OFFICE_ARCHIVE=$taskArchive" | Add-Content -LiteralPath $env:GITHUB_ENV
}
