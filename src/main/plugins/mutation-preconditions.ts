export function validateRegistryMutationPrecondition(
  mode: 'install' | 'update',
  pluginId: string,
  installedIds: ReadonlySet<string>,
  unpackedIds: ReadonlySet<string>,
): string | null {
  if (mode === 'install' && installedIds.has(pluginId)) {
    return `plugin "${pluginId}" is already installed; use update instead`
  }
  if (mode === 'update' && !installedIds.has(pluginId)) {
    return `plugin "${pluginId}" is not installed; use install instead`
  }
  if (mode === 'update' && unpackedIds.has(pluginId)) {
    return 'unpacked plugins must be reloaded from their source directory'
  }
  return null
}

export function validateUninstallPrecondition(
  pluginId: string,
  installedIds: ReadonlySet<string>,
  unpackedIds: ReadonlySet<string>,
): string | null {
  if (!installedIds.has(pluginId)) return `plugin "${pluginId}" is not installed`
  if (unpackedIds.has(pluginId)) return 'unpacked plugins must be removed from Developer settings'
  return null
}
