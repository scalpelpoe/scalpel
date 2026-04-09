param([string]$InstallDir, [string]$Version)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try {
    $url = "https://github.com/electron/electron/releases/download/v$Version/electron-v$Version-win32-x64.zip"
    $zip = Join-Path $InstallDir "electron.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -LiteralPath $zip -DestinationPath $InstallDir -Force
    Remove-Item $zip
    exit 0
} catch {
    Write-Host "ERROR: $_"
    exit 1
}
