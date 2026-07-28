import { join } from 'node:path'

export interface UpdateBatchPlan {
  stagingDir: string
  userDataDir: string
  installDir: string
  resourcesDir: string
  exePath: string
  version: string
  isFullUpgrade: boolean
  electronZip: string
  fullUpgradeAsar: string
  asarNew: string
  pendingManifest: string
  copyUnpacked: boolean
  asarUnpackedSrc: string
  asarUnpackedDest: string
}

export interface UpdateLaunchSpec {
  command: string
  args: string[]
  elevated: boolean
}

function checked(command: string): string[] {
  return [command, 'if errorlevel 1 goto :apply_failed']
}

/**
 * Build the out-of-process Windows update transaction.
 *
 * The installed executable must be stopped before app.asar can be replaced. Every
 * mutating step is checked so an ACL/AV/filesystem failure preserves the staged
 * update and relaunches the known-good installed executable instead of reporting a
 * false successful update.
 */
export function buildUpdateBatch(plan: UpdateBatchPlan): string {
  const asarPath = join(plan.resourcesDir, 'app.asar')
  const electronExe = join(plan.installDir, 'electron.exe')
  const installedExe = plan.isFullUpgrade ? join(plan.installDir, 'Scalpel.exe') : plan.exePath
  const localManifest = join(plan.userDataDir, 'install-manifest.json')
  const justUpdated = join(plan.userDataDir, 'just-updated.json')
  const applyError = join(plan.userDataDir, 'update-apply-error.json')
  // The swap itself may run elevated for Program Files. Hand relaunch to the
  // interactive desktop shell so Scalpel does not inherit the helper's High
  // integrity token while a normally launched game is running at Medium.
  const relaunch = `start "" explorer.exe "${installedExe}"`
  const fallbackRelaunch = `start "" explorer.exe "${plan.exePath}"`

  const lines = ['@echo off', 'setlocal', 'ping -n 3 127.0.0.1 > nul']

  if (plan.isFullUpgrade) {
    lines.push(
      ...checked(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${plan.electronZip}' -DestinationPath '${plan.installDir}' -Force"`,
      ),
      `if exist "${electronExe}" (`,
      `  move /y "${electronExe}" "${plan.exePath}"`,
      '  if errorlevel 1 goto :apply_failed',
      ')',
      ...checked(`copy /y "${plan.fullUpgradeAsar}" "${asarPath}" > nul`),
    )
  } else {
    lines.push(...checked(`copy /y "${plan.asarNew}" "${asarPath}" > nul`))
  }

  if (plan.copyUnpacked) {
    lines.push(...checked(`xcopy /y /e /i "${plan.asarUnpackedSrc}" "${plan.asarUnpackedDest}" > nul`))
  }

  lines.push(
    ...checked(`copy /y "${plan.pendingManifest}" "${localManifest}" > nul`),
    `> "${justUpdated}" echo {"version":"${plan.version}"}`,
    `if exist "${applyError}" del /q "${applyError}"`,
    `rmdir /s /q "${plan.stagingDir}"`,
    relaunch,
    'del "%~f0"',
    'exit /b 0',
    '',
    ':apply_failed',
    `> "${applyError}" echo {"version":"${plan.version}","message":"The staged update could not replace the installed files."}`,
    fallbackRelaunch,
    'del "%~f0"',
    'exit /b 1',
  )

  return lines.join('\r\n')
}

/**
 * Packaged Windows builds ship electron-builder's elevation helper. Use it only
 * when a real write probe has shown that the current launch cannot replace files
 * in the install directory; per-user installs keep the direct, prompt-free path.
 */
export function getUpdateLaunchSpec(
  batPath: string,
  resourcesDir: string,
  platform: NodeJS.Platform,
  elevateExists: boolean,
  installWritable: boolean,
): UpdateLaunchSpec {
  if (platform === 'win32' && elevateExists && !installWritable) {
    return {
      command: join(resourcesDir, 'elevate.exe'),
      args: ['cmd.exe', '/d', '/s', '/c', batPath],
      elevated: true,
    }
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', batPath],
    elevated: false,
  }
}
