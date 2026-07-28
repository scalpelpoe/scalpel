import { describe, expect, it } from 'vitest'
import { buildUpdateBatch, getUpdateLaunchSpec, type UpdateBatchPlan } from './apply-update'

const plan = (overrides: Partial<UpdateBatchPlan> = {}): UpdateBatchPlan => ({
  stagingDir: 'C:\\Users\\Test\\AppData\\Roaming\\scalpel\\update-staging',
  userDataDir: 'C:\\Users\\Test\\AppData\\Roaming\\scalpel',
  installDir: 'C:\\Program Files\\Scalpel',
  resourcesDir: 'C:\\Program Files\\Scalpel\\resources',
  exePath: 'C:\\Program Files\\Scalpel\\Scalpel.exe',
  version: '1.0.1-rc1',
  isFullUpgrade: false,
  electronZip: 'C:\\staging\\electron.zip',
  fullUpgradeAsar: 'C:\\staging\\app.asar.staged',
  asarNew: 'C:\\staging\\app.asar.new',
  pendingManifest: 'C:\\staging\\manifest.pending.json',
  copyUnpacked: false,
  asarUnpackedSrc: 'C:\\staging\\app.asar.unpacked',
  asarUnpackedDest: 'C:\\Program Files\\Scalpel\\resources\\app.asar.unpacked',
  ...overrides,
})

describe('buildUpdateBatch', () => {
  it('checks the ASAR and manifest copies before declaring the update applied', () => {
    const batch = buildUpdateBatch(plan())

    expect(batch).toContain('copy /y "C:\\staging\\app.asar.new" "C:\\Program Files\\Scalpel\\resources\\app.asar"')
    expect(batch.match(/if errorlevel 1 goto :apply_failed/g)).toHaveLength(2)
    expect(batch.indexOf('just-updated.json')).toBeGreaterThan(batch.indexOf('install-manifest.json'))
    expect(batch.indexOf('rmdir /s /q')).toBeGreaterThan(batch.indexOf('just-updated.json'))
    expect(batch).toContain('start "" explorer.exe "C:\\Program Files\\Scalpel\\Scalpel.exe"')
  })

  it('preserves staging and relaunches the installed executable on failure', () => {
    const batch = buildUpdateBatch(plan())
    const failureBlock = batch.slice(batch.lastIndexOf('\r\n:apply_failed'))

    expect(failureBlock).toContain('update-apply-error.json')
    expect(failureBlock).toContain('start "" explorer.exe "C:\\Program Files\\Scalpel\\Scalpel.exe"')
    expect(failureBlock).not.toContain('rmdir /s /q')
    expect(failureBlock).not.toContain('just-updated.json')
  })

  it('checks full-upgrade extraction, executable move, ASAR, unpacked files, and manifest', () => {
    const batch = buildUpdateBatch(plan({ isFullUpgrade: true, copyUnpacked: true }))

    expect(batch).toContain('Expand-Archive')
    expect(batch).toContain('move /y')
    expect(batch).toContain('xcopy /y /e /i')
    expect(batch.match(/if errorlevel 1 goto :apply_failed/g)).toHaveLength(5)
  })
})

describe('getUpdateLaunchSpec', () => {
  it('uses the packaged elevation helper on Windows', () => {
    expect(
      getUpdateLaunchSpec(
        'C:\\Users\\Test\\apply-update.bat',
        'C:\\Program Files\\Scalpel\\resources',
        'win32',
        true,
        false,
      ),
    ).toEqual({
      command: 'C:\\Program Files\\Scalpel\\resources\\elevate.exe',
      args: ['cmd.exe', '/d', '/s', '/c', 'C:\\Users\\Test\\apply-update.bat'],
      elevated: true,
    })
  })

  it('falls back to cmd when the helper is unavailable', () => {
    expect(getUpdateLaunchSpec('C:\\apply-update.bat', 'C:\\resources', 'win32', false, false)).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'C:\\apply-update.bat'],
      elevated: false,
    })
  })

  it('does not elevate a writable per-user installation', () => {
    expect(getUpdateLaunchSpec('C:\\apply-update.bat', 'C:\\resources', 'win32', true, true)).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'C:\\apply-update.bat'],
      elevated: false,
    })
  })
})
