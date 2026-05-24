import { describe, expect, it } from 'vitest'
import { parsePluginUrl, pluginEntryUrl } from './plugin-protocol'

describe('parsePluginUrl', () => {
  it('extracts id from scalpel-plugin://<id>/plugin.js', () => {
    expect(parsePluginUrl('scalpel-plugin://hello-world/plugin.js')).toEqual({
      id: 'hello-world',
      file: 'plugin.js',
    })
    expect(parsePluginUrl('scalpel-plugin://plugin-examples/plugin.js')).toEqual({
      id: 'plugin-examples',
      file: 'plugin.js',
    })
  })

  it('rejects ids that do not match PLUGIN_ID_PATTERN', () => {
    expect(parsePluginUrl('scalpel-plugin://Hello-World/plugin.js')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://ab/plugin.js')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://1foo/plugin.js')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://foo_bar/plugin.js')).toBeNull()
  })

  it('rejects pathnames other than /plugin.js', () => {
    expect(parsePluginUrl('scalpel-plugin://hello-world/')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://hello-world/plugin.js.map')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://hello-world/../etc/passwd')).toBeNull()
    expect(parsePluginUrl('scalpel-plugin://hello-world/sub/plugin.js')).toBeNull()
  })

  it('rejects wrong schemes', () => {
    expect(parsePluginUrl('file:///C:/foo/plugin.js')).toBeNull()
    expect(parsePluginUrl('scalpel-internal://sdk.js')).toBeNull()
    expect(parsePluginUrl('http://hello-world/plugin.js')).toBeNull()
  })

  it('rejects unparseable URLs', () => {
    expect(parsePluginUrl('not a url')).toBeNull()
    expect(parsePluginUrl('')).toBeNull()
  })
})

describe('pluginEntryUrl', () => {
  it('builds the entry URL the renderer dynamic-imports', () => {
    expect(pluginEntryUrl('hello-world')).toBe('scalpel-plugin://hello-world/plugin.js')
    expect(pluginEntryUrl('plugin-examples')).toBe('scalpel-plugin://plugin-examples/plugin.js')
  })
})
