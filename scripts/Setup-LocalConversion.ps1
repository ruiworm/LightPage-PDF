param(
    [string]$Destination = (Join-Path $env:LOCALAPPDATA 'QingyePDF/LibreOffice'),
    [string]$PackagePath
)

$ErrorActionPreference = 'Stop'
$version = '26.8.1'
$expectedHash = 'c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312'
$converter = Join-Path $Destination 'program/soffice.com'
function Install-UnoConverter {
    $python = Join-Path $Destination 'program/python.exe'
    & $python -m pip install --no-deps --only-binary=:all: --require-hashes --disable-pip-version-check --no-warn-script-location -r (Join-Path $PSScriptRoot 'conversion-requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'The local UNO conversion component could not be installed.' }
    & $python (Join-Path $PSScriptRoot 'prepare-conversion-launcher.py') $python
    if ($LASTEXITCODE -ne 0) { throw 'The Windows conversion launcher could not be prepared.' }
}
if (Test-Path -LiteralPath $converter) {
    & $converter --headless --version
    if ($LASTEXITCODE -ne 0) { throw 'The local converter could not start.' }
    Install-UnoConverter
    return
}

$Destination = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
if (-not $PackagePath) {
    $PackagePath = Join-Path $Destination "LibreOffice_$($version)_Win_x86-64.msi"
    $downloadUrl = "https://download.documentfoundation.org/libreoffice/stable/$version/win/x86_64/LibreOffice_$($version)_Win_x86-64.msi"
    Write-Host 'Downloading the official LibreOffice conversion component...'
    Invoke-WebRequest -Uri $downloadUrl -OutFile $PackagePath
}
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
if ((Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'LibreOffice checksum mismatch. The package will not be executed.'
}

# Administrative extraction keeps file associations and the installed Office suite untouched.
$extractLog = Join-Path $Destination 'setup.log'
$installer = Start-Process -FilePath 'msiexec.exe' -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
    '/a', ('"' + $PackagePath + '"'), '/qn',
    ('TARGETDIR="' + $Destination + '"'), '/L*v', ('"' + $extractLog + '"')
)
if ($installer.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $converter)) {
    throw "LibreOffice extraction failed ($($installer.ExitCode)). See $extractLog."
}
& $converter --headless --version
if ($LASTEXITCODE -ne 0) { throw 'The extracted converter could not start.' }
Install-UnoConverter
Write-Host "Local conversion is ready at $Destination."
