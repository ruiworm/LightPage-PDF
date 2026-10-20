[CmdletBinding()]
param(
    [string]$BundleRoot = 'frontend/editor/src-tauri',
    [int]$StartupTimeoutSeconds = 60,
    [switch]$RequireDocumentComponents,
    [switch]$RequireBaseComponents,
    [string]$OfficeExecutable
)

$ErrorActionPreference = 'Stop'
$taskBundleRoot = (Resolve-Path -LiteralPath $BundleRoot).Path
$taskJavaPath = Join-Path $taskBundleRoot 'runtime/jre/bin/java.exe'
$taskJars = @(Get-ChildItem -LiteralPath (Join-Path $taskBundleRoot 'libs') -Filter 'lightpage-pdf-*.jar' -File)
if (-not (Test-Path -LiteralPath $taskJavaPath) -or $taskJars.Count -ne 1) {
    throw 'Expected one bundled backend JAR and a Windows Java runtime'
}

$taskListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$taskListener.Start()
$taskPort = $taskListener.LocalEndpoint.Port
$taskListener.Stop()
# Leave room for LibreOffice's deeply nested extension registry paths on Windows.
$taskWorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ('lp-' + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $taskWorkDir | Out-Null
$taskTempDir = Join-Path $taskWorkDir 'tmp'
New-Item -ItemType Directory -Path $taskTempDir | Out-Null
$taskStdout = Join-Path $taskWorkDir 'stdout.log'
$taskStderr = Join-Path $taskWorkDir 'stderr.log'
$taskArguments = @(
    '-Xmx1g',
    '-DBROWSER_OPEN=false',
    '-DSTIRLING_PDF_TAURI_MODE=true',
    '-Dserver.address=127.0.0.1',
    ('"-Djava.io.tmpdir=' + $taskTempDir + '"'),
    "-Dserver.port=$taskPort"
)
$taskTools = Join-Path $taskBundleRoot 'runtime/tools'
$taskOfficePath = if ($OfficeExecutable) { $OfficeExecutable } else { Join-Path $taskTools 'libreoffice/program/soffice.com' }
$taskPreviousPath = $env:PATH
$taskPreviousTessdata = $env:TESSDATA_PREFIX
if (Test-Path -LiteralPath $taskTools) {
    $env:PATH = @((Join-Path $taskTools 'tesseract'), (Join-Path $taskTools 'poppler/Library/bin'), (Split-Path $taskOfficePath -Parent), $env:PATH) -join ';'
    $env:TESSDATA_PREFIX = Join-Path $taskTools 'tesseract/tessdata'
    $taskArguments += '"-Dsystem.customPaths.operations.soffice=' + $taskOfficePath + '"'
}
$taskArguments += @('-jar', ('"' + $taskJars[0].FullName + '"'))
$taskWatch = [System.Diagnostics.Stopwatch]::StartNew()
$taskProcess = Start-Process -FilePath $taskJavaPath -ArgumentList $taskArguments -WorkingDirectory $taskWorkDir -WindowStyle Hidden -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr -PassThru
try {
    while ($taskWatch.Elapsed.TotalSeconds -lt $StartupTimeoutSeconds) {
        $taskProcess.Refresh()
        if ($taskProcess.HasExited) {
            throw "Bundled backend exited during startup (exit code $($taskProcess.ExitCode))"
        }
        try {
            $taskHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/api/v1/info/status" -TimeoutSec 2
            if ($taskHealth.status -eq 'UP') {
                $taskStartupMilliseconds = $taskWatch.ElapsedMilliseconds
                if ($RequireBaseComponents) {
                    $taskAvailability = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/api/v1/config/endpoints-availability" -TimeoutSec 5
                    foreach ($endpoint in @('ocr-pdf', 'auto-rotate-pdf', 'pdf-to-html')) {
                        if ($taskAvailability.$endpoint.enabled -ne $true) { throw "Base tool unavailable: $endpoint" }
                    }
                    if ($taskAvailability.'file-to-pdf'.enabled -eq $true) { throw 'Office conversion should require the optional component' }
                    & node (Join-Path $PSScriptRoot 'smoke-document-tools.mjs') "http://127.0.0.1:$taskPort" --base-only
                    if ($LASTEXITCODE -ne 0) { throw 'Base document operation smoke test failed' }
                }
                if ($RequireDocumentComponents) {
                    $taskAvailability = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/api/v1/config/endpoints-availability" -TimeoutSec 5
                    foreach ($endpoint in @('file-to-pdf', 'pdf-to-word', 'pdf-to-presentation', 'ocr-pdf', 'auto-rotate-pdf', 'pdf-to-html')) {
                        if ($taskAvailability.$endpoint.enabled -ne $true) { throw "Bundled tool unavailable: $endpoint" }
                    }
                    $taskLanguages = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/api/v1/ui-data/ocr-pdf" -TimeoutSec 5
                    foreach ($language in @('chi_sim', 'eng')) {
                        if ($language -notin $taskLanguages.languages) { throw "Bundled OCR language unavailable: $language" }
                    }
                    Write-Output 'Bundled Word, spreadsheet, OCR, orientation and HTML components are available'
                    & node (Join-Path $PSScriptRoot 'smoke-document-tools.mjs') "http://127.0.0.1:$taskPort"
                    if ($LASTEXITCODE -ne 0) { throw 'Bundled document operation smoke test failed' }
                }
                Write-Output "Bundled backend started and returned UP in $taskStartupMilliseconds ms"
                return
            }
        } catch {
            if ($taskHealth.status -eq 'UP') { throw }
            # The HTTP endpoint can refuse connections or return errors while startup is in progress.
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Bundled backend did not become healthy within $StartupTimeoutSeconds seconds"
} catch {
    Get-Content -LiteralPath $taskStdout -Tail 40 -ErrorAction SilentlyContinue | Write-Output
    Get-Content -LiteralPath $taskStderr -Tail 20 -ErrorAction SilentlyContinue | Write-Output
    throw
} finally {
    $env:PATH = $taskPreviousPath
    $env:TESSDATA_PREFIX = $taskPreviousTessdata
    if (-not $taskProcess.HasExited) {
        Stop-Process -Id $taskProcess.Id
        $taskProcess.WaitForExit()
    }
}
