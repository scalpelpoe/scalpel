param(
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speeds up Invoke-WebRequest significantly

$releasesBase = "https://scalpel.fourth.party/releases"

try {
  # Step 1: Download manifest
  Write-Host "Fetching release manifest..."
  $manifest = Invoke-RestMethod "$releasesBase/stable/manifest.json"
  $electronVersion = $manifest.electronVersion
  $asarUrl = $manifest.asarUrl
  $appVersion = $manifest.version
  $unpackedUrl = $manifest.unpackedUrl

  # Step 2: Download Electron
  $electronZipUrl = "https://github.com/electron/electron/releases/download/v$electronVersion/electron-v$electronVersion-win32-x64.zip"
  $electronZip = Join-Path $InstallDir "electron.zip"
  Write-Host "Downloading Electron v$electronVersion..."
  Invoke-WebRequest -Uri $electronZipUrl -OutFile $electronZip -UseBasicParsing

  # Step 3: Extract Electron
  Write-Host "Extracting Electron..."
  Expand-Archive -Path $electronZip -DestinationPath $InstallDir -Force
  Remove-Item $electronZip

  # Rename electron.exe and patch icon
  $electronExe = Join-Path $InstallDir "electron.exe"
  $scalpelExe = Join-Path $InstallDir "Scalpel.exe"
  if (Test-Path $electronExe) {
    Rename-Item $electronExe $scalpelExe
  }

  $rcedit = Join-Path $InstallDir "rcedit.exe"
  $icon = Join-Path $InstallDir "icon.ico"
  if (Test-Path $rcedit) {
    Write-Host "Patching application icon..."
    & $rcedit $scalpelExe --set-icon $icon 2>$null
  }

  # Step 4: Create resources directory
  $resourcesDir = Join-Path $InstallDir "resources"
  New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null

  # Step 5: Download app.asar
  Write-Host "Downloading Scalpel v$appVersion..."
  $asarPath = Join-Path $resourcesDir "app.asar"
  Invoke-WebRequest -Uri "$releasesBase/stable/$asarUrl" -OutFile $asarPath -UseBasicParsing

  # Step 6: Download and extract unpacked native modules
  if ($unpackedUrl) {
    Write-Host "Downloading native modules..."
    $unpackedZip = Join-Path $InstallDir "unpacked.zip"
    Invoke-WebRequest -Uri "$releasesBase/stable/$unpackedUrl" -OutFile $unpackedZip -UseBasicParsing

    $unpackedDir = Join-Path $resourcesDir "app.asar.unpacked"
    New-Item -ItemType Directory -Path $unpackedDir -Force | Out-Null
    Expand-Archive -Path $unpackedZip -DestinationPath $unpackedDir -Force
    Remove-Item $unpackedZip
  }

  # Step 7: Write install manifest to userData
  $userDataDir = Join-Path $env:APPDATA "Scalpel"
  New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
  $manifest | ConvertTo-Json | Set-Content (Join-Path $userDataDir "install-manifest.json")

  Write-Host "Installation complete!"
  exit 0
} catch {
  Write-Host "ERROR: $_"
  exit 1
}
