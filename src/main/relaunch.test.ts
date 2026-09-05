import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ app: { isPackaged: true, relaunch: vi.fn() } }))
vi.mock('electron', () => electron)
import { relaunchApp } from './relaunch'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  electron.app.relaunch.mockClear()
  electron.app.isPackaged = true
})

describe('relaunchApp', () => {
  it('restarts the outer AppImage with the X11 arguments intact', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    vi.stubEnv('APPIMAGE', '/opt/Scalpel With Spaces.AppImage')
    relaunchApp(['--ozone-platform=x11'])
    expect(electron.app.relaunch).toHaveBeenCalledWith({
      execPath: '/opt/Scalpel With Spaces.AppImage',
      args: ['--ozone-platform=x11'],
    })
  })

  it('keeps the normal executable for unpacked installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    vi.stubEnv('APPIMAGE', '')
    relaunchApp(['--ozone-platform=x11'])
    expect(electron.app.relaunch).toHaveBeenCalledWith({ args: ['--ozone-platform=x11'] })
  })

  it('does not use inherited AppImage variables in development', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    vi.stubEnv('APPIMAGE', '/another-app.AppImage')
    electron.app.isPackaged = false
    relaunchApp(['.'])
    expect(electron.app.relaunch).toHaveBeenCalledWith({ args: ['.'] })
  })
})
