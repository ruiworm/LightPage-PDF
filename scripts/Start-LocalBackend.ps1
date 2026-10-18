param(
    [int]$Port = 8080,
    [string]$SofficePath,
    [string]$JarPath,
    [string]$JavaPath,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$desktopRoot = Join-Path $env:LOCALAPPDATA 'Stirling PDF'
if (-not $JarPath) {
    $jars = @(Get-ChildItem -LiteralPath (Join-Path $desktopRoot 'libs') -Filter 'lightpage-pdf-*.jar')
    if (-not $jars.Count) { $jars = @(Get-ChildItem -LiteralPath (Join-Path $desktopRoot 'libs') -Filter 'stirling-pdf-*.jar') }
    if ($jars.Count -ne 1) { throw 'Specify -JarPath for the local processing service.' }
    $JarPath = $jars[0].FullName
}
$JarPath = (Resolve-Path -LiteralPath $JarPath).Path
if (-not $JavaPath) { $JavaPath = Join-Path $desktopRoot 'runtime/jre/bin/java.exe' }
$JavaPath = (Resolve-Path -LiteralPath $JavaPath).Path
if (-not $SofficePath) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'QingyePDF/LibreOffice/program/soffice.com'),
        (Join-Path $env:ProgramFiles 'LibreOffice/program/soffice.com')
    )
    $SofficePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $SofficePath) { throw 'Run scripts/Setup-LocalConversion.ps1 first, or specify -SofficePath.' }
$SofficePath = (Resolve-Path -LiteralPath $SofficePath).Path

$logDirectory = Join-Path $env:LOCALAPPDATA 'QingyePDF/logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$officeProgram = Split-Path $SofficePath -Parent
$unoPython = Join-Path $officeProgram 'python.exe'
$unoClient = $null
if (Test-Path -LiteralPath $unoPython) {
    $unoClient = (& $unoPython -c "import os, sysconfig; print(os.path.join(sysconfig.get_path('scripts'), 'unoconvert.exe'))").Trim()
    if (-not (Test-Path -LiteralPath $unoClient)) { throw 'Run scripts/Setup-LocalConversion.ps1 to install the UNO client.' }
    $unoListeners = @(Get-NetTCPConnection -LocalPort 2003 -State Listen -ErrorAction SilentlyContinue)
    if ($unoListeners.Count -gt 0) {
        $unoInterpreter = (Resolve-Path -LiteralPath (Join-Path (Split-Path (Split-Path $unoClient -Parent) -Parent) 'bin/python.exe')).Path
        foreach ($listener in $unoListeners) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
            if ($owner.ExecutablePath -notin @($unoPython, $unoInterpreter) -or -not $owner.CommandLine.Contains('unoserver.server')) {
                throw 'Port 2003 belongs to another service; it will not be reused.'
            }
        }
    } else {
        $unoServer = Start-Process -FilePath $unoPython -WindowStyle Hidden -PassThru -ArgumentList @(
            '-m', 'unoserver.server', '--interface', '127.0.0.1', '--uno-interface', '127.0.0.1',
            '--port', '2003', '--uno-port', '2002', '--executable', ('"' + (Join-Path $officeProgram 'soffice.exe') + '"'),
            '--conversion-timeout', '120'
        ) -RedirectStandardOutput (Join-Path $logDirectory 'uno.log') -RedirectStandardError (Join-Path $logDirectory 'uno.stderr.log')
        Write-Host "Local conversion worker started (PID $($unoServer.Id))."
    }
}

$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
foreach ($processId in ($listeners.OwningProcess | Select-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if (-not $Restart) { throw "Port $Port is already in use. Use -Restart to restart this processing service." }
    if ($process.ExecutablePath -ne $JavaPath -or -not $process.CommandLine.Contains($JarPath.Replace('\', '/')) -and -not $process.CommandLine.Contains($JarPath)) {
        throw "Port $Port belongs to another process; it will not be stopped."
    }
    Stop-Process -Id $processId
}

$backendArguments = @(
    '-jar', ('"' + $JarPath + '"'), '--server.address=127.0.0.1', "--server.port=$Port",
    ('"--system.customPaths.operations.soffice=' + $SofficePath + '"')
)
if ($unoClient) { $backendArguments += ('"--system.customPaths.operations.unoconvert=' + $unoClient + '"') }
$backend = Start-Process -FilePath $JavaPath -WindowStyle Hidden -PassThru -WorkingDirectory $repositoryRoot -ArgumentList @(
    $backendArguments
) -RedirectStandardOutput (Join-Path $logDirectory "backend-$Port.log") -RedirectStandardError (Join-Path $logDirectory "backend-$Port.stderr.log")
Write-Host "Processing service started on 127.0.0.1:$Port (PID $($backend.Id))."
