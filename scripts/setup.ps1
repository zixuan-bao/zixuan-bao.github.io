$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
$toolFolder = Join-Path $siteRoot '.tools\hugo'
if (Test-Path -LiteralPath (Join-Path $toolFolder 'hugo.exe')) {
    Write-Host 'The local Hugo executable is already available.'
    exit 0
}
New-Item -ItemType Directory -Path $toolFolder -Force | Out-Null
$archiveFile = Join-Path $siteRoot '.tools\hugo.zip'
Invoke-WebRequest -Uri 'https://github.com/gohugoio/hugo/releases/download/v0.168.0/hugo_extended_0.168.0_windows-amd64.zip' -OutFile $archiveFile
Expand-Archive -LiteralPath $archiveFile -DestinationPath $toolFolder -Force
Write-Host 'Hugo is ready. Run npm run dev in the website folder.'
