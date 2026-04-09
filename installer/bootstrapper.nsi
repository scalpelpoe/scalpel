!include "MUI2.nsh"

; --- Configuration ---
Name "Scalpel"
OutFile "..\dist\Scalpel-Installer.exe"
InstallDir "$LOCALAPPDATA\Programs\Scalpel"
RequestExecutionLevel user
Unicode True

; --- UI ---
!define MUI_ICON "..\resources\icon.ico"
!define MUI_UNICON "..\resources\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_RIGHT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\Scalpel.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Scalpel"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Var ElectronVersion

; --- Installer Section ---
Section "Install"
  SetOutPath "$INSTDIR"
  SetShellVarContext current

  ; Extract bundled app files (ASAR, native modules, icon, manifest)
  File "icon.ico"
  SetOutPath "$INSTDIR\resources"
  File "app.asar"
  File /r "app.asar.unpacked"
  SetOutPath "$INSTDIR"

  ; Read electron version from bundled file
  FileOpen $0 "$INSTDIR\resources\app.asar.unpacked\.electron-version" r
  FileRead $0 $ElectronVersion
  FileClose $0

  ; Download Electron via NScurl (handles HTTPS redirects from GitHub)
  DetailPrint "Downloading Electron v$ElectronVersion..."
  NScurl::http GET "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-win32-x64.zip" "$INSTDIR\electron.zip" /CANCEL /INSIST /END
  Pop $0
  ${If} $0 != "OK"
    MessageBox MB_OK|MB_ICONSTOP "Failed to download Electron: $0"
    Abort
  ${EndIf}

  ; Extract using Windows built-in tar
  DetailPrint "Extracting Electron..."
  nsExec::ExecToLog 'tar -xf "$INSTDIR\electron.zip" -C "$INSTDIR"'
  Pop $0
  Delete "$INSTDIR\electron.zip"
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONSTOP "Failed to extract Electron."
    Abort
  ${EndIf}

  ; Rename electron.exe to Scalpel.exe (just a rename, no binary modification)
  Rename "$INSTDIR\electron.exe" "$INSTDIR\Scalpel.exe"

  ; Move icon into resources
  Rename "$INSTDIR\icon.ico" "$INSTDIR\resources\icon.ico"

  ; Write install manifest to userData
  CreateDirectory "$APPDATA\Scalpel"
  CopyFiles "$INSTDIR\resources\app.asar.unpacked\install-manifest.json" "$APPDATA\Scalpel\install-manifest.json"
  ; Clean up temp files from unpacked
  Delete "$INSTDIR\resources\app.asar.unpacked\.electron-version"
  Delete "$INSTDIR\resources\app.asar.unpacked\install-manifest.json"

  ; --- Create shortcuts and uninstaller ---
  ; Use icon.ico for the shortcut even though exe has Electron icon
  CreateDirectory "$SMPROGRAMS\Scalpel"
  CreateShortcut "$SMPROGRAMS\Scalpel\Scalpel.lnk" "$INSTDIR\Scalpel.exe" "" "$INSTDIR\resources\icon.ico"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Registry entries for Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "DisplayName" "Scalpel"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "DisplayIcon" "$INSTDIR\resources\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "Publisher" "Scalpel"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "NoModify" 1
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel" "NoRepair" 1

SectionEnd

; --- Uninstaller Section ---
Section "Uninstall"
  SetShellVarContext current

  ; Kill the app if it's running
  nsExec::ExecToLog 'taskkill /f /im Scalpel.exe'
  Sleep 1000

  RMDir /r "$INSTDIR"
  RMDir /r "$SMPROGRAMS\Scalpel"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Scalpel"
SectionEnd
