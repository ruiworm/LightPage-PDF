[CmdletBinding()]
param(
    [string]$CacheDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) 'lightpage-component-cache'),
    [string]$BundleRoot = 'frontend/editor/src-tauri'
)

$ErrorActionPreference = 'Stop'
$taskCache = [System.IO.Path]::GetFullPath($CacheDirectory)
$taskBundle = [System.IO.Path]::GetFullPath($BundleRoot)
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
$taskManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-components.json') -Raw | ConvertFrom-Json

function Get-ComponentArchive($Component) {
    $archive = Join-Path $taskCache $Component.file
    if (-not (Test-Path -LiteralPath $archive)) {
        Write-Output "Downloading $($Component.file)" | Out-Host
        Invoke-WebRequest -UseBasicParsing -Uri $Component.url -OutFile $archive -TimeoutSec 900
    }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    if ($hash -ne $Component.sha256) { throw "Component checksum mismatch: $($Component.file)" }
    return $archive
}

function Expand-AdministrativeImage([string]$Archive, [string]$Destination) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $image = Start-Process -FilePath "$env:WINDIR\System32\msiexec.exe" -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
        '/a', ('"' + $Archive + '"'), '/qn', '/norestart', ('TARGETDIR="' + $Destination + '"')
    )
    if ($image.ExitCode -ne 0) { throw "Administrative extraction failed: $($image.ExitCode) ($Archive)" }
}

$taskSevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $taskSevenZip) {
    $taskSevenZip = Join-Path $taskCache '7zip/Files/7-Zip/7z.exe'
    if (-not (Test-Path -LiteralPath $taskSevenZip)) {
        Expand-AdministrativeImage (Get-ComponentArchive $taskManifest.sevenzip) (Join-Path $taskCache '7zip')
    }
}

$taskTools = Join-Path $taskBundle 'runtime/tools'
New-Item -ItemType Directory -Path $taskTools -Force | Out-Null
$taskLock = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'windows-components.json') -Algorithm SHA256).Hash
$taskStamp = Join-Path $taskTools 'components.lock'
$taskRequired = @('libreoffice/program/soffice.exe', 'libreoffice/program/soffice.com', 'tesseract/tesseract.exe', 'poppler/Library/bin/pdftohtml.exe', 'tesseract/tessdata/chi_sim.traineddata', 'tesseract/tessdata/eng.traineddata', 'tesseract/tessdata/osd.traineddata')
if ((Test-Path -LiteralPath $taskStamp) -and (Get-Content -LiteralPath $taskStamp -Raw).Trim() -eq $taskLock -and
    @($taskRequired | Where-Object { -not (Test-Path -LiteralPath (Join-Path $taskTools $_)) }).Count -eq 0) {
    Write-Output 'Bundled document components are ready'
    return
}

$taskOfficeDestination = Join-Path $taskTools 'libreoffice'
Write-Output 'Preparing bundled LibreOffice'
Expand-AdministrativeImage (Get-ComponentArchive $taskManifest.libreoffice) $taskOfficeDestination
if (-not (Test-Path -LiteralPath (Join-Path $taskOfficeDestination 'program/soffice.exe'))) { throw 'Expected an extracted LibreOffice runtime' }
$taskNestedMsi = Join-Path $taskOfficeDestination $taskManifest.libreoffice.file
if (Test-Path -LiteralPath $taskNestedMsi) { Remove-Item -LiteralPath $taskNestedMsi -Force }
Get-ChildItem -LiteralPath (Join-Path $taskOfficeDestination 'System64') -Filter '*.dll' -File | Copy-Item -Destination (Join-Path $taskOfficeDestination 'program') -Force

$taskTesseract = Join-Path $taskTools 'tesseract'
Write-Output 'Preparing bundled Tesseract'
& $taskSevenZip x (Get-ComponentArchive $taskManifest.tesseract) "-o$taskTesseract" -y -bso0 -bsp0
if ($LASTEXITCODE -ne 0) { throw 'Tesseract extraction failed' }
$taskPopplerImage = Join-Path $taskCache 'poppler-image'
Write-Output 'Preparing bundled Poppler'
Expand-Archive -LiteralPath (Get-ComponentArchive $taskManifest.poppler) -DestinationPath $taskPopplerImage -Force
$taskPopplerExe = @(Get-ChildItem -LiteralPath $taskPopplerImage -Recurse -File -Filter pdftohtml.exe)
if ($taskPopplerExe.Count -ne 1) { throw 'Expected one extracted Poppler runtime' }
$taskPopplerRoot = $taskPopplerExe[0].Directory.Parent.Parent.FullName
$taskPopplerDestination = Join-Path $taskTools 'poppler'
New-Item -ItemType Directory -Path $taskPopplerDestination -Force | Out-Null
Get-ChildItem -LiteralPath $taskPopplerRoot | Copy-Item -Destination $taskPopplerDestination -Recurse -Force

$taskLanguages = Join-Path (Split-Path $taskBundle -Parent) 'public/vendor/redaction-ocr/lang'
foreach ($language in @('chi_sim', 'eng')) {
    Copy-Item -LiteralPath (Join-Path $taskLanguages "$language.traineddata") -Destination (Join-Path $taskTesseract 'tessdata') -Force
}
Copy-Item -LiteralPath (Get-ComponentArchive $taskManifest.osd) -Destination (Join-Path $taskTesseract 'tessdata') -Force
Copy-Item -LiteralPath (Join-Path (Split-Path $taskLanguages -Parent) 'LICENSE-TESSDATA.txt') -Destination $taskTesseract -Force
foreach ($required in $taskRequired) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskTools $required))) { throw "Bundled component missing: $required" }
}
@'
LightPage PDF document components (unmodified upstream distributions)

LibreOffice 26.2.6: https://www.libreoffice.org/ (MPL-2.0; see libreoffice/licenses and CREDITS files).
Source: https://download.documentfoundation.org/libreoffice/src/26.2.6/
Tesseract 5.5.3: https://github.com/tesseract-ocr/tesseract/tree/5.5.3 (Apache-2.0; see tesseract license files, including dependency notices).
Poppler Windows 26.09.0-0: https://github.com/oschwartz10612/poppler-windows/releases/tag/v26.09.0-0
Source: https://poppler.freedesktop.org/ (GPL-2.0-or-later; see poppler/Library/share and included license files).
OCR language data: same pinned tessdata_fast files as the bundled browser OCR, Apache-2.0.

All upstream license and notice files are retained. 7-Zip is build tooling only and is not bundled.
'@ | Set-Content -LiteralPath (Join-Path $taskTools 'THIRD_PARTY_COMPONENTS.txt')
Set-Content -LiteralPath $taskStamp -Value $taskLock
Write-Output 'Bundled document components are ready'
