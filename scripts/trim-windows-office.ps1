[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$OfficeRoot
)

$ErrorActionPreference = 'Stop'
$taskOfficeRoot = (Resolve-Path -LiteralPath $OfficeRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskOfficeRoot 'program/soffice.com'))) {
    throw 'Expected a prepared LibreOffice runtime'
}
if ((Get-Item -LiteralPath $taskOfficeRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'LibreOffice trimming requires a directory rather than a junction'
}
$taskOfficePrefix = $taskOfficeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Get-OfficePath([string]$RelativePath) {
    $path = [IO.Path]::GetFullPath((Join-Path $taskOfficeRoot $RelativePath))
    if (-not $path.StartsWith($taskOfficePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'LibreOffice cleanup must stay inside its runtime directory'
    }
    return $path
}

$taskDictionary = Get-OfficePath 'share/extensions/dict-en/dictionaries.xcu'
if (Test-Path -LiteralPath $taskDictionary) {
    $taskXml = [Xml.XmlDocument]::new()
    $taskXml.PreserveWhitespace = $true
    $taskXml.Load($taskDictionary)
    $taskNamespaces = [Xml.XmlNamespaceManager]::new($taskXml.NameTable)
    $taskNamespaces.AddNamespace('oor', 'http://openoffice.org/2001/registry')
    $taskThesaurus = $taskXml.SelectSingleNode("//node[@oor:name='ThesDic_en-US']", $taskNamespaces)
    if ($taskThesaurus) {
        $taskThesaurus.ParentNode.RemoveChild($taskThesaurus) | Out-Null
        $taskXml.Save($taskDictionary)
    }
}

# Keep hyphenation dictionaries: removing them can change document line breaks.
foreach ($taskRelativePath in @(
    'share/extensions/dict-en/th_en_US_v2.dat',
    'share/extensions/dict-en/th_en_US_v2.idx',
    'share/extensions/nlpsolver',
    'share/extensions/wiki-publisher',
    'share/config/images_colibre_dark.zip',
    'share/config/images_colibre_dark_svg.zip',
    'share/config/images_colibre_svg.zip',
    'share/config/images_helpimg.zip',
    'program/shlxthdl',
    'program/updater.exe',
    'program/update_service.exe',
    'program/mar.exe',
    'program/minidump_upload.exe',
    'program/quickstart.exe',
    'program/senddoc.exe',
    'program/gengal.exe'
)) {
    $taskPath = Get-OfficePath $taskRelativePath
    if (Test-Path -LiteralPath $taskPath) {
        Remove-Item -LiteralPath $taskPath -Recurse -Force
    }
}

$taskSystem64 = Get-OfficePath 'System64'
if (Test-Path -LiteralPath $taskSystem64) {
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskSystem64 -File -Filter '*.dll') {
        $taskCopy = Get-OfficePath ('program/' + $taskFile.Name)
        if ((Test-Path -LiteralPath $taskCopy) -and
            (Get-FileHash -LiteralPath $taskFile.FullName).Hash -eq (Get-FileHash -LiteralPath $taskCopy).Hash) {
            Remove-Item -LiteralPath (Get-OfficePath ('System64/' + $taskFile.Name)) -Force
        }
    }
    if (@(Get-ChildItem -LiteralPath $taskSystem64 -Force).Count -eq 0) {
        Remove-Item -LiteralPath $taskSystem64
    }
}
Write-Output 'Trimmed optional Office extensions, thesaurus, alternate icons and desktop helpers'
