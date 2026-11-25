import koffi from 'koffi'

/** Link a managed overlay to the game without moving keyboard focus. KWin
 * keeps transients above their parent even when that parent is fullscreen. */
export function linkX11Transient(handle: Buffer, title: string): boolean {
  const lib = koffi.load('libxcb.so.1')
  const cookie = koffi.struct({ sequence: 'uint32_t' })
  const iterator = koffi.struct({ data: 'void *', rem: 'int', index: 'int' })
  const connect = lib.func('void *xcb_connect(const char *displayname, int *screenp)')
  const disconnect = lib.func('void xcb_disconnect(void *connection)')
  const connectionError = lib.func('int xcb_connection_has_error(void *connection)')
  const setup = lib.func('const void *xcb_get_setup(void *connection)')
  const roots = lib.func('xcb_setup_roots_iterator', iterator, ['void *'])
  const intern = lib.func('xcb_intern_atom', cookie, ['void *', 'uint8_t', 'uint16_t', 'str'])
  const internReply = lib.func('xcb_intern_atom_reply', 'void *', ['void *', cookie, 'void *'])
  const property = lib.func('xcb_get_property', cookie, [
    'void *',
    'uint8_t',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'uint32_t',
  ])
  const propertyReply = lib.func('xcb_get_property_reply', 'void *', ['void *', cookie, 'void *'])
  const value = lib.func('void *xcb_get_property_value(const void *reply)')
  const length = lib.func('int xcb_get_property_value_length(const void *reply)')
  const change = lib.func('xcb_change_property_checked', cookie, [
    'void *',
    'uint8_t',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'uint8_t',
    'uint32_t',
    'uint32_t *',
  ])
  const check = lib.func('xcb_request_check', 'void *', ['void *', cookie])
  const connection = connect(null, null)
  if (!connection) return false
  try {
    if (connectionError(connection)) return false
    const rootIterator = roots(setup(connection))
    if (!rootIterator.data || rootIterator.rem <= 0) return false
    const root = koffi.decode(rootIterator.data, 'uint32_t') as number
    const atom = (name: string): number => {
      const reply = internReply(connection, intern(connection, 0, name.length, name), null)
      if (!reply) return 0
      try {
        return koffi.decode(reply, 8, 'uint32_t') as number
      } finally {
        koffi.free(reply)
      }
    }
    const read = (window: number, name: number, type: number): Buffer => {
      const reply = propertyReply(connection, property(connection, 0, window, name, type, 0, 4096), null)
      if (!reply) return Buffer.alloc(0)
      try {
        const size = length(reply)
        return size > 0 ? Buffer.from(koffi.decode(value(reply), 'uint8_t', size)) : Buffer.alloc(0)
      } finally {
        koffi.free(reply)
      }
    }
    const clients = read(root, atom('_NET_CLIENT_LIST'), 33) // XCB_ATOM_WINDOW
    const name = atom('_NET_WM_NAME')
    const utf8 = atom('UTF8_STRING')
    const overlayId = handle.readUInt32LE(0)
    for (let offset = 0; offset + 4 <= clients.length; offset += 4) {
      const id = clients.readUInt32LE(offset)
      if (id === overlayId || read(id, name, utf8).toString('utf8') !== title) continue
      const error = check(connection, change(connection, 0, overlayId, 68, 33, 32, 1, [id])) // WM_TRANSIENT_FOR
      if (error) {
        koffi.free(error)
        return false
      }
      return true
    }
    return false
  } finally {
    disconnect(connection)
  }
}
