import { describe, expect, it } from 'vitest'
import { resolveClientLogPath, unixPathFromWineExe, type PathResolverFs } from './path-resolver'

function fakeFs(files: Record<string, string | 'dir' | 'link:'>): PathResolverFs {
  return {
    existsSync: (path) => path in files,
    readdirSync: (path) =>
      Object.keys(files)
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map((p) => p.slice(path.length + 1)),
    readFileSync: (path) => {
      const v = files[path]
      if (typeof v !== 'string' || v.startsWith('link:')) throw new Error('not a file')
      return v
    },
    readlinkSync: (path) => {
      const v = files[path]
      if (typeof v !== 'string' || !v.startsWith('link:')) throw new Error('not a link')
      return v.slice(5)
    },
  }
}

describe('unixPathFromWineExe', () => {
  it('passes through Unix paths', () => {
    expect(unixPathFromWineExe('/home/t/.steam/steamapps/common/Path of Exile 2/PathOfExileSteam.exe')).toBe(
      '/home/t/.steam/steamapps/common/Path of Exile 2/PathOfExileSteam.exe',
    )
  })

  it('maps Proton Z: to the Unix root', () => {
    expect(
      unixPathFromWineExe(
        'Z:\\home\\t\\.local\\share\\Steam\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe',
      ),
    ).toBe('/home/t/.local/share/Steam/steamapps/common/Path of Exile 2/PathOfExileSteam.exe')
  })

  it('returns null for unrelated Windows paths', () => {
    expect(unixPathFromWineExe('C:\\windows\\system32\\steam.exe')).toBeNull()
  })
})

describe('resolveClientLogPath', () => {
  it('honors SCALPEL_CLIENT_LOG when the file exists', () => {
    const fs = fakeFs({ '/tmp/Client.txt': '' })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: { SCALPEL_CLIENT_LOG: '/tmp/Client.txt' },
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBe('/tmp/Client.txt')
  })

  it('finds Client.txt next to a Proton game exe via /proc cmdline', () => {
    const log = '/home/t/.local/share/Steam/steamapps/common/Path of Exile 2/logs/Client.txt'
    const fs = fakeFs({
      '/proc': 'dir',
      '/proc/42': 'dir',
      '/proc/42/cmdline': `wine64\0Z:\\home\\t\\.local\\share\\Steam\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe\0`,
      '/proc/42/exe': 'link:/home/t/.steam/steamapps/common/Proton 9.0/files/bin/wine64',
      [log]: '',
    })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: {},
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBe(log)
  })

  it('falls back to Steam libraryfolders.vdf', () => {
    const log = '/mnt/games/SteamLibrary/steamapps/common/Path of Exile 2/logs/Client.txt'
    const fs = fakeFs({
      '/proc': 'dir',
      '/home/t/.local/share/Steam/steamapps': 'dir',
      '/home/t/.local/share/Steam/steamapps/libraryfolders.vdf': `"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"/mnt/games/SteamLibrary"\n\t}\n}`,
      [log]: '',
    })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: {},
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBe(log)
  })

  it('prefers the attached game over a nearer wrong-game install', () => {
    const poe1 = '/home/t/.local/share/Steam/steamapps/common/Path of Exile/logs/Client.txt'
    const poe2 = '/mnt/games/SteamLibrary/steamapps/common/Path of Exile 2/logs/Client.txt'
    const fs = fakeFs({
      '/proc': 'dir',
      '/home/t/.local/share/Steam/steamapps': 'dir',
      '/home/t/.local/share/Steam/steamapps/libraryfolders.vdf': `"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"/mnt/games/SteamLibrary"\n\t}\n}`,
      [poe1]: '',
      [poe2]: '',
    })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: {},
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBe(poe2)
  })

  it('returns null when only the other game is installed', () => {
    const poe1 = '/home/t/.local/share/Steam/steamapps/common/Path of Exile/logs/Client.txt'
    const fs = fakeFs({
      '/proc': 'dir',
      '/home/t/.local/share/Steam/steamapps': 'dir',
      [poe1]: '',
    })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: {},
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBeNull()
  })

  it('picks the attached game when both games are running on Windows', () => {
    const poe1 = 'C:\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt'
    const poe2 = 'C:\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
    const fs = fakeFs({ [poe1]: '', [poe2]: '' })
    expect(
      resolveClientLogPath({
        platform: 'win32',
        env: {},
        homedir: 'C:\\Users\\t',
        fs,
        execUtf8: () =>
          'C:\\Steam\\steamapps\\common\\Path of Exile\\PathOfExileSteam.exe\r\n' +
          'C:\\Steam\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe\r\n',
        poeVersion: 2,
      }),
    ).toBe(poe2)
  })

  it('still resolves a lone install whose directory names neither game', () => {
    const log = 'D:\\Games\\poe\\logs\\Client.txt'
    const fs = fakeFs({ [log]: '' })
    expect(
      resolveClientLogPath({
        platform: 'win32',
        env: {},
        homedir: 'C:\\Users\\t',
        fs,
        execUtf8: () => 'D:\\Games\\poe\\PathOfExileSteam.exe\n',
        poeVersion: 2,
      }),
    ).toBe(log)
  })

  it('prefers the attached game across /proc processes', () => {
    const poe1 = '/home/t/.steam/steamapps/common/Path of Exile/logs/Client.txt'
    const poe2 = '/home/t/.steam/steamapps/common/Path of Exile 2/logs/Client.txt'
    const fs = fakeFs({
      '/proc': 'dir',
      '/proc/41': 'dir',
      '/proc/41/cmdline': `/home/t/.steam/steamapps/common/Path of Exile/PathOfExile_x64\0`,
      '/proc/41/exe': 'link:/home/t/.steam/steamapps/common/Path of Exile/PathOfExile_x64',
      '/proc/42': 'dir',
      '/proc/42/cmdline': `/home/t/.steam/steamapps/common/Path of Exile 2/PathOfExileSteam\0`,
      '/proc/42/exe': 'link:/home/t/.steam/steamapps/common/Path of Exile 2/PathOfExileSteam',
      [poe1]: '',
      [poe2]: '',
    })
    expect(
      resolveClientLogPath({
        platform: 'linux',
        env: {},
        homedir: '/home/t',
        fs,
        poeVersion: 2,
      }),
    ).toBe(poe2)
  })

  it('uses PowerShell on Windows', () => {
    const log = 'C:\\PoE\\logs\\Client.txt'
    const fs = fakeFs({ [log]: '' })
    expect(
      resolveClientLogPath({
        platform: 'win32',
        env: {},
        homedir: 'C:\\Users\\t',
        fs,
        execUtf8: () => 'C:\\PoE\\PathOfExileSteam.exe\n',
        poeVersion: 2,
      }),
    ).toBe(log)
  })
})
