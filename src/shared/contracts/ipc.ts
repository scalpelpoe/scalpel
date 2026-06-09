/** Typed IPC channel name registry.
 *
 *  This is preparatory infrastructure for replacing bare channel string
 *  literals in ipcMain/ipcRenderer call sites. Runtime code does not enforce
 *  this registry yet; migrate call sites incrementally when touching an IPC
 *  domain so channel names and bridge typings converge over time.
 */

export const IPC_CHANNELS = {
  SETTINGS: {
    GET: 'get-settings',
    SET: 'set-setting',
    FINISH_ONBOARDING: 'finish-onboarding',
    SET_PROFILE_SETTING: 'set-profile-setting-for-game',
    SETTING_UPDATED_EVENT: 'setting-updated',
  },

  PROFILES: {
    LIST: 'list-profiles',
    CREATE: 'create-profile',
    RENAME: 'rename-profile',
    DUPLICATE: 'duplicate-profile',
    DELETE: 'delete-profile',
    ENSURE_FOR_GAME: 'ensure-profile-for-game',
    SET_ACTIVE: 'set-active-profile',
  },

  FILTERS: {
    PICK_FILE: 'pick-filter-file',
    PICK_DIR: 'pick-filter-dir',
    SCAN_DIR: 'scan-filter-dir',
    SCAN_SOUNDS: 'scan-sound-files',
    GET_SOUND_DATA_URL: 'get-sound-data-url',
    IMPORT_ONLINE: 'import-online-filter',
    SWITCH_INGAME: 'switch-ingame-filter',
    GET_COLOR_FREQUENCIES: 'get-color-frequencies',
    SAVE_BLOCK_EDIT: 'save-block-edit',
    RELOAD: 'reload-filter',
    GET_UNIQUE_VISIBILITY: 'get-unique-visibility',
    MOVE_ITEM_TIER: 'move-item-tier',
    BATCH_MOVE_ITEM_TIER: 'batch-move-item-tier',
    UPDATE_STACK_THRESHOLDS: 'update-stack-thresholds',
    UPDATE_QUALITY_THRESHOLDS: 'update-quality-thresholds',
    UPDATE_STRAND_THRESHOLDS: 'update-strand-thresholds',
    GET_HISTORY: 'get-history',
    UNDO_EDIT: 'undo-edit',
    LIST_VERSIONS: 'list-versions',
    CREATE_CHECKPOINT: 'create-checkpoint',
    RESTORE_VERSION: 'restore-version',
    DELETE_VERSION: 'delete-version',
    GET_FILTER_CHANGES: 'get-filter-changes',
    FILTER_CHANGED_EVENT: 'filter-changed',
  },

  ONLINE_SYNC: {
    CHECK_UPDATE: 'check-online-update',
    STATUS: 'online-sync-status',
    RESET_AVAILABILITY: 'filter-reset-availability',
    RESET_TO_ONLINE: 'reset-filter-to-online',
    QUICK_UPDATE: 'quick-update-filter',
    MERGE: 'merge-online-filter',
    ONLINE_FILTER_CHANGED_EVENT: 'online-filter-changed',
  },

  PRICES: {
    REFRESH_PRICES: 'refresh-prices',
    LOOKUP_BASE_TYPE: 'lookup-base-type',
    GET_SEARCHABLE_ITEMS: 'get-searchable-items',
    GET_UNIQUES_FOR_BASE: 'get-uniques-for-base',
    GET_DIV_CARD_TIERS: 'get-div-card-tiers',
    BATCH_LOOKUP_DIV_CARD: 'batch-lookup-div-card-prices',
    BATCH_LOOKUP_PRICES: 'batch-lookup-prices',
    BATCH_LOOKUP_REF_PRICES: 'batch-lookup-ref-prices',
    SISTER_OPEN_PRICE_CHECK: 'sister-open-price-check',
  },

  TRADE: {
    SEARCH: 'trade-search',
    BULK_EXCHANGE: 'bulk-exchange',
    CHECK_BULK_ITEM: 'check-bulk-item',
    MAP_REGEX_TRADE: 'map-regex-trade',
    WAYSTONE_REGEX_TRADE: 'waystone-regex-trade',
    TABLET_REGEX_TRADE: 'tablet-regex-trade',
    FETCH_MORE_LISTINGS: 'fetch-more-listings',
    VISIT_HIDEOUT: 'visit-hideout',
    WHISPER_SELLER: 'whisper-seller',
    POE_LOGIN: 'poe-login',
    POE_CHECK_AUTH: 'poe-check-auth',
    POE_LOGOUT: 'poe-logout',
    RATE_LIMIT_EVENT: 'rate-limit',
    TRADE_PENALTY_EVENT: 'trade-penalty',
  },

  REGEX: {
    GET_PRESETS: 'get-regex-presets',
    SAVE_PRESET: 'save-regex-preset',
    DELETE_PRESET: 'delete-regex-preset',
    REORDER_PRESETS: 'reorder-regex-presets',
    REPORT_REGEX: 'report-regex',
    PRESETS_CHANGED_EVENT: 'regex-presets-changed',
    REMOTE_APPLY: 'regex-remote:apply',
    REMOTE_CLOSE: 'regex-remote:close',
    REMOTE_HAND_FOCUS: 'regex-remote:hand-focus',
    REMOTE_MOUNT_STATE: 'regex-remote:mount-state',
    REMOTE_MOUNT_CHANGED_EVENT: 'regex-remote:mount-changed',
  },

  OVERLAY: {
    CLOSE: 'close-overlay',
    GET_STATE: 'get-overlay-state',
    GET_ICON_CACHE: 'get-icon-cache',
    ICON_CACHE_UPDATED_EVENT: 'icon-cache-updated',
    REPORT_PANEL_RECT: 'report-panel-rect',
    CLEAR_PANEL_RECT: 'clear-panel-rect',
    LOCK_INTERACTIVE: 'lock-interactive',
    UNLOCK_INTERACTIVE: 'unlock-interactive',
    SUSPEND_HOTKEYS: 'suspend-hotkeys',
    RESUME_HOTKEYS: 'resume-hotkeys',
    SUSPEND_INPUT_HOOK: 'screen-pick:suspend-hook',
    RESUME_INPUT_HOOK: 'screen-pick:resume-hook',
    SET_INPUT_FOCUSED: 'overlay-input-focused',
    OVERLAY_DATA_EVENT: 'overlay-data',
    CURSOR_SIDE_EVENT: 'cursor-side',
    NO_FILTER_LOADED_EVENT: 'no-filter-loaded',
    NO_ITEM_IN_CLIPBOARD_EVENT: 'no-item-in-clipboard',
    OPEN_SETTINGS_EVENT: 'open-settings',
    OPEN_VIEW_EVENT: 'open-view',
    OPEN_LINK_PENDING_EVENT: 'open-link-pending',
    OVERLAY_HIDE_EVENT: 'overlay-hide',
    GAME_BOUNDS_EVENT: 'game-bounds',
    OVERLAY_DETACH_EVENT: 'overlay-detach',
    OVERLAY_REATTACH_EVENT: 'overlay-reattach',
    PRICE_CHECK_EVENT: 'price-check',
    PRICE_CHECK_OPEN_EVENT: 'price-check-open',
    FILTER_HOTKEY_OPEN_EVENT: 'filter-hotkey-open',
    ZONE_CHANGED_EVENT: 'zone-changed',
    POE_VERSION_EVENT: 'poe-version',
    LEAGUE_UPDATED_EVENT: 'league-updated',
    SKIP_ANIMATION_EVENT: 'skip-animation',
    SAVE_OVERLAY_STATE: 'save-overlay-state',
  },

  CHEAT_SHEETS: {
    ADD_FROM_FILE: 'cheat-sheet:add-from-file',
    ADD_FROM_URL: 'cheat-sheet:add-from-url',
    REMOVE: 'cheat-sheet:remove',
    REMOVE_CATEGORY: 'cheat-sheet:remove-category',
    LIST_PREFABS: 'cheat-sheet:list-prefabs',
    IMPORT_PREFAB: 'cheat-sheet:import-prefab',
    CLOSE: 'cheat-sheet:close',
    MINIMIZE: 'cheat-sheet:minimize',
    RESTORE: 'cheat-sheet:restore',
    SHOW_PREVIEW: 'cheat-sheet-preview:show',
    HIDE_PREVIEW: 'cheat-sheet-preview:hide',
    FOCUS_CATEGORY_EVENT: 'cheat-sheet:focus-category',
    PREVIEW_RENDER_EVENT: 'cheat-sheet-preview:render',
  },

  PINNED_ZONE: {
    SET_VISIBLE: 'pinned-zone:set-visible',
    SET_CONTENT_HEIGHT: 'pinned-zone:set-content-height',
  },

  WHITEBOARD: {
    REQUEST_CLOSE: 'whiteboard:request-close',
    SET_MODE: 'whiteboard:set-mode',
    LOAD: 'whiteboard:load',
    SAVE_ACTIVE: 'whiteboard:save-active',
    SAVE_AS_SNAPSHOT: 'whiteboard:save-as-snapshot',
    DELETE_SNAPSHOT: 'whiteboard:delete-snapshot',
    RENAME_SNAPSHOT: 'whiteboard:rename-snapshot',
    PLEASE_FLUSH_EVENT: 'whiteboard:please-flush',
    SHOWN_EVENT: 'whiteboard:shown',
    HIDDEN_EVENT: 'whiteboard:hidden',
    REQUEST_SHOWN_STATE: 'whiteboard:request-shown-state',
    SNAP_GHOST_EVENT: 'secondary-overlay-canvas:snap-ghost',
  },

  APP_WINDOW: {
    SET_MODE: 'app-window-mode',
    OPEN_SETTINGS_TAB: 'open-settings-tab',
  },

  UPDATES: {
    DOWNLOAD: 'download-update',
    INSTALL: 'install-update',
    GET_STATE: 'get-update-state',
    UPDATE_AVAILABLE_EVENT: 'update-available',
    DOWNLOAD_PROGRESS_EVENT: 'update-download-progress',
    DOWNLOADED_EVENT: 'update-downloaded',
    RESCINDED_EVENT: 'update-rescinded',
    APPLIED_EVENT: 'update-applied',
    BRICKED_RELEASE_EVENT: 'bricked-release',
    DEV_FAKE_UPDATE: 'dev-fake-update',
  },

  DIAGNOSTICS: {
    DEV_TOOLS: 'open-devtools',
    RENDERER_ERROR: 'diagnostics:renderer-error',
    DEV_ERROR_EVENT: 'diagnostics:dev-error',
    CREATE_BUG_REPORT: 'diagnostics:create-report',
    SHOW_BUG_REPORT: 'diagnostics:show-report',
    GET_DEBUG_LOG: 'diagnostics:get-log',
    OPEN_LOG_FOLDER: 'diagnostics:open-log-folder',
  },

  CLIENT_LOG: {
    SUBSCRIBE: 'client-log:subscribe',
    UNSUBSCRIBE: 'client-log:unsubscribe',
    RECENT_LINES: 'client-log:recent-lines',
    LINE_EVENT: 'client-log:line',
  },

  PLUGINS: {
    LIST_INSTALLED: 'plugins:list-installed',
    LIST_UNPACKED: 'plugins:list-unpacked',
    GET_INSTALLED: 'plugins:get-installed',
    STORAGE_GET: 'plugins:storage-get',
    STORAGE_SET: 'plugins:storage-set',
    STORAGE_DELETE: 'plugins:storage-delete',
    STORAGE_KEYS: 'plugins:storage-keys',
    REGISTER_HOTKEY: 'plugins:register-hotkey',
    LIST_REGISTERED_HOTKEYS: 'plugins:list-registered-hotkeys',
    REGISTER_TAB: 'plugins:register-tab',
    UNREGISTER_TAB: 'plugins:unregister-tab',
    LIST_REGISTERED_TABS: 'plugins:list-registered-tabs',
    INSTALL_UNPACKED: 'plugins:install-unpacked',
    FETCH_REGISTRY: 'plugins:fetch-registry',
    INSTALL_FROM_REGISTRY: 'plugins:install-from-registry',
    UNINSTALL: 'plugins:uninstall',
    UNREGISTER_HOTKEY: 'plugins:unregister-hotkey',
    GAME_CONFIG_READ: 'plugins:game-config-read',
    GAME_CONFIG_WRITE: 'plugins:game-config-write',
    GAME_CONFIG_WATCH: 'plugins:game-config-watch',
    GAME_CONFIG_UNWATCH: 'plugins:game-config-unwatch',
    GAME_CONFIG_CHANGED_EVENT: 'plugins:game-config-changed',
    PRICES_GET: 'plugins:prices-get',
    PRICES_REFRESH: 'plugins:prices-refresh',
    PRICES_WATCH: 'plugins:prices-watch',
    PRICES_UNWATCH: 'plugins:prices-unwatch',
    PRICES_CHANGED_EVENT: 'plugins:prices-changed',
    TRIGGER_MAIN_HOTKEY: 'plugins:trigger-main-hotkey',
    SHOW_OVERLAY: 'plugins:show-overlay',
    REGISTER_OVERLAY: 'plugins:register-overlay',
    OPEN_OVERLAY: 'plugins:open-overlay',
    CLOSE_OVERLAY: 'plugins:close-overlay',
    MACRO_EVENT: 'plugin-macro',
    INSTALLED_EVENT: 'plugin-installed',
    UNINSTALLED_EVENT: 'plugin-uninstalled',
    HOTKEYS_CHANGED_EVENT: 'plugin-hotkeys-changed',
    TABS_CHANGED_EVENT: 'plugin-tabs-changed',
    OVERLAY_INIT_EVENT: 'plugin-overlay:init',
  },

  GAME_SWITCH: {
    PROMPT_EVENT: 'game-switch-prompt',
    RESPONSE: 'game-switch-response',
  },

  MANIFEST: {
    GET: 'get-manifest',
  },

  LEARNING: {
    RECORD_PREF_OBSERVATION: 'record-pref-observation',
    RESET: 'reset-learning',
  },

  LEAGUES: {
    REFRESH: 'refresh-leagues',
  },

  CLIPBOARD: {
    READ_IMAGE: 'clipboard:read-image',
    OPEN_EXTERNAL: 'open-external',
    ELEVATION_HINT_EVENT: 'elevation-hint',
  },
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS] extends infer Group
  ? Group extends Record<string, string>
    ? Group[keyof Group]
    : never
  : never
