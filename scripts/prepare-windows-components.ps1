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

$taskFrontend = Split-Path (Split-Path $taskBundle -Parent) -Parent
$taskCliVersion = (Get-Content -LiteralPath (Join-Path $taskFrontend 'node_modules/@tauri-apps/cli/package.json') -Raw | ConvertFrom-Json).version
if ($taskCliVersion -ne $taskManifest.nsisTemplate.version) { throw 'Update the pinned NSIS template to match the installed Tauri CLI' }
$taskTemplate = Get-Content -LiteralPath (Get-ComponentArchive $taskManifest.nsisTemplate) -Raw
$taskSolidCompressor = 'SetCompressor /SOLID "{{compression}}"'
if (-not $taskTemplate.Contains($taskSolidCompressor)) { throw 'Expected the upstream NSIS compressor directive' }
New-Item -ItemType Directory -Path (Join-Path $taskBundle 'runtime') -Force | Out-Null
# Per-file compression avoids mapping the complete document runtime into the 32-bit NSIS compiler.
$taskTemplate.Replace($taskSolidCompressor, 'SetCompressor "{{compression}}"') | Set-Content -LiteralPath (Join-Path $taskBundle 'runtime/installer.nsi')

$taskSevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $taskSevenZip) {
    $taskSevenZip = Join-Path $taskCache '7zip/Files/7-Zip/7z.exe'
    if (-not (Test-Path -LiteralPath $taskSevenZip)) {
        Expand-AdministrativeImage (Get-ComponentArchive $taskManifest.sevenzip) (Join-Path $taskCache '7zip')
    }
}

$taskTools = Join-Path $taskBundle 'runtime/tools'
New-Item -ItemType Directory -Path $taskTools -Force | Out-Null
# Preparation rules can change without changing the upstream component versions.
$taskLock = @(
    (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'windows-components.json') -Algorithm SHA256).Hash,
    (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
    (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'trim-windows-office.ps1') -Algorithm SHA256).Hash
) -join ':'
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


# ---------------------------------------------------------------------------
# Size trim: the backend drives LibreOffice headlessly (soffice.com) for
# document conversion only. The full upstream distribution ships UI language
# packs, spelling dictionaries, icon themes, and templates for every locale,
# none of which affect headless conversion. Keep English + Chinese (Simplified
# & Traditional) and drop the rest.
# ---------------------------------------------------------------------------
$taskKeepLangs = @('en', 'en-US', 'en-GB', 'en-ZA', 'zh-CN', 'zh-TW', 'zh')
function Test-KeepLang([string]$Name) {
    # Strip the .xcd suffix and registry prefixes so 'Langpack-en-GB.xcd' -> 'en-GB',
    # 'cjk_zh-CN.xcd' -> 'zh-CN', 'ctl_he.xcd' -> 'he', etc.
    $bare = ($Name -replace '\.xcd$', '') -replace '^(Langpack-|ctl_|cjk_|fx_)', ''
    foreach ($lang in $taskKeepLangs) {
        if ($bare -eq $lang -or $bare -like "$lang-*" -or $bare -like "$lang@*") { return $true }
    }
    return $false
}

# Spelling dictionaries: keep en/zh only (non-dict extensions are kept).
$taskExtensions = Join-Path $taskOfficeDestination 'share/extensions'
if (Test-Path -LiteralPath $taskExtensions) {
    Get-ChildItem -LiteralPath $taskExtensions -Directory | Where-Object {
        $_.Name -like 'dict-*' -and $_.Name -notin @('dict-en', 'dict-zh')
    } | Remove-Item -Recurse -Force
}

# UI resource bundles (program/resource/<lang>/): keep en/zh variants only.
$taskResources = Join-Path $taskOfficeDestination 'program/resource'
if (Test-Path -LiteralPath $taskResources) {
    Get-ChildItem -LiteralPath $taskResources -Directory | Where-Object {
        $_.Name -notin @('en_GB', 'en_ZA', 'zh_CN', 'zh_TW')
    } | Remove-Item -Recurse -Force
}

# Registry language packs and locale helpers: keep en/zh + language-neutral files.
$taskRegistry = Join-Path $taskOfficeDestination 'share/registry'
if (Test-Path -LiteralPath $taskRegistry) {
    Get-ChildItem -LiteralPath $taskRegistry -File -Filter '*.xcd' | Where-Object {
        ($_.Name -like 'Langpack-*' -or $_.Name -like 'ctl*' -or $_.Name -like 'cjk_*' -or $_.Name -like 'fx_*') -and
        -not (Test-KeepLang $_.Name)
    } | Remove-Item -Force
    # Per-locale helper files under share/registry/res/ (fcfg_langpack_<lang>.xcd,
    # registry_<lang>.xcd): keep en/zh (plus the qtz pseudo locale).
    $taskRegistryRes = Join-Path $taskRegistry 'res'
    if (Test-Path -LiteralPath $taskRegistryRes) {
        Get-ChildItem -LiteralPath $taskRegistryRes -File -Filter '*.xcd' | Where-Object {
            $_.Name -notlike 'fcfg_langpack_en*' -and $_.Name -notlike 'fcfg_langpack_zh*' -and
            $_.Name -notlike 'registry_en*' -and $_.Name -notlike 'registry_zh*' -and
            $_.Name -ne 'fcfg_langpack_qtz.xcd' -and $_.Name -ne 'registry_qtz.xcd'
        } | Remove-Item -Force
    }
}

# Icon themes: keep colibre (LibreOffice default) + help images, drop the rest.
$taskConfig = Join-Path $taskOfficeDestination 'share/config'
if (Test-Path -LiteralPath $taskConfig) {
    Get-ChildItem -LiteralPath $taskConfig -File -Filter 'images_*.zip' | Where-Object {
        $_.Name -notlike 'images_colibre*' -and $_.Name -ne 'images_helpimg.zip'
    } | Remove-Item -Force
}

# Fonts: keep Latin + CJK-capable basics for en/zh rendering; drop fonts for
# scripts of locales we no longer bundle.
$taskFonts = Join-Path $taskOfficeDestination 'Fonts'
if (Test-Path -LiteralPath $taskFonts) {
    Get-ChildItem -LiteralPath $taskFonts -File | Where-Object {
        $_.Name -match '^(Alef|Amiri|David|DavidLibre|NotoKufiArabic|NotoNaskhArabic|NotoSansArabic|NotoSansArmenian|NotoSansGeorgian|NotoSansHebrew|NotoSansLao|NotoSansLisu|NotoSerifArmenian|NotoSerifGeorgian|NotoSerifHebrew|NotoSerifLao|NotoSerifLisu|Kacst|Farsi|Scheherazade|Lateef|NanumGothic|NanumMyeongjo)' -and
        $_.Name -notmatch '(CJK|SC|TC)'
    } | Remove-Item -Force
}

# Headless conversion never touches these:
foreach ($taskDrop in @(
        (Join-Path $taskOfficeDestination 'help'),
        (Join-Path $taskOfficeDestination 'readmes'),
        (Join-Path $taskOfficeDestination 'share/gallery'),
        (Join-Path $taskOfficeDestination 'share/template'),
        (Join-Path $taskOfficeDestination 'share/wizards'),
        (Join-Path $taskOfficeDestination 'share/autotext'),
        (Join-Path $taskOfficeDestination 'share/Scripts'),
        (Join-Path $taskOfficeDestination 'share/tipoftheday'),
        (Join-Path $taskOfficeDestination 'share/wordbook'),
        (Join-Path $taskOfficeDestination 'share/labels'),
        (Join-Path $taskOfficeDestination 'program/python-core-3.12.14'),
        (Join-Path $taskOfficeDestination 'program/python312.dll')
    )) {
    if (Test-Path -LiteralPath $taskDrop) { Remove-Item -LiteralPath $taskDrop -Recurse -Force }
}
Write-Output 'Trimmed LibreOffice to English + Chinese locales'
& (Join-Path $PSScriptRoot 'trim-windows-office.ps1') -OfficeRoot $taskOfficeDestination

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
Get-ChildItem -LiteralPath $taskPopplerRoot | Where-Object Name -NE 'Library' | Copy-Item -Destination $taskPopplerDestination -Recurse -Force
$taskPopplerLibrary = Join-Path $taskPopplerDestination 'Library'
New-Item -ItemType Directory -Path $taskPopplerLibrary -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $taskPopplerRoot 'Library') | Where-Object Name -NotIn @('include', 'lib') | Copy-Item -Destination $taskPopplerLibrary -Recurse -Force
# A cached preparation may still contain SDK files from an earlier runtime layout.
foreach ($directory in @('include', 'lib')) {
    $taskDevelopmentPath = [System.IO.Path]::GetFullPath((Join-Path $taskPopplerLibrary $directory))
    if (-not $taskDevelopmentPath.StartsWith($taskTools + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Poppler SDK cleanup must stay inside the prepared tools directory'
    }
    if (Test-Path -LiteralPath $taskDevelopmentPath) { Remove-Item -LiteralPath $taskDevelopmentPath -Recurse -Force }
}

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
LightPage PDF document components

LibreOffice 26.2.6: https://www.libreoffice.org/ (MPL-2.0; see libreoffice/licenses and CREDITS files).
Source: https://download.documentfoundation.org/libreoffice/src/26.2.6/
Tesseract 5.5.3: https://github.com/tesseract-ocr/tesseract/tree/5.5.3 (Apache-2.0; see tesseract license files, including dependency notices).
Poppler Windows 26.09.0-0: https://github.com/oschwartz10612/poppler-windows/releases/tag/v26.09.0-0
Source: https://poppler.freedesktop.org/ (GPL-2.0-or-later; see poppler/Library/share and included license files).
OCR language data: same pinned tessdata_fast files as the bundled browser OCR, Apache-2.0.

License and notice files for retained components are kept. 7-Zip is build tooling only and is not bundled.
The LibreOffice distribution is trimmed for size: only English and Chinese (Simplified and
Traditional) UI resources, dictionaries, and fonts are bundled; icon themes other than colibre
are removed, as are help files, galleries, templates, and the embedded Python scripting runtime.
Optional solver and Wiki-publishing extensions, the English thesaurus, alternate icon themes,
shell integration and standalone update helpers are omitted. Fonts and hyphenation data remain.
Poppler's development headers and import libraries are omitted; its runtime binaries,
encoding data, and license notices are retained.
'@ | Set-Content -LiteralPath (Join-Path $taskTools 'THIRD_PARTY_COMPONENTS.txt')
Set-Content -LiteralPath $taskStamp -Value $taskLock
Write-Output 'Bundled document components are ready'
