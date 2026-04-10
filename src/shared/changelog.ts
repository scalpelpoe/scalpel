export const CHANGELOG: { version: string; notes: string[] }[] = [
  {
    version: '0.9.0',
    notes: [
      'Scalpel is now open source and distributed via GitHub',
      'Fixed issue with pricing socketed gems are supported by lines',
    ],
  },
  {
    version: '0.8.4',
    notes: [
      'Fixed a bunch of broken price check stuff (Nightmare maps, 2 line mods, mods that specify sizes, keystones, skills, negative mods, flask mods, etc. It was exhausting and not exhaustive)',
      'Fixed Searing Exarch / Eater of Worlds implicits not appearing in price checker',
      'Added transfigured gem chip to price checker',
      'Added Expedition Logbook faction and boss chips',
      'Divination cards that are corrupted no longer search by corrupted',
    ],
  },
  {
    version: '0.8.3',
    notes: ['Fixed fractured items not being searchable because I am a bonehead'],
  },
  {
    version: '0.8.2',
    notes: [
      'Fixed overlay getting stuck behind PoE after alt-tabbing (big thanks to Pandas for helping debug this)',
      'Added div card outlier detection for map EV calculations (auto-flags suspicious prices, manual flag button per card)',
      'Fixed negative mod values not appearing in price checker',
      'Fixed Blighted Incubator falling to wrong filter tier',
    ],
  },
  {
    version: '0.8.1',
    notes: [
      'Added stash tab scrolling (Ctrl + Scroll Wheel to switch tabs, on by default)',
      'Added chaos/divine exchange rate chip with hover tooltip showing tenth-of-divine conversions',
      'Added timeless jewel pricing with seed and leader chips (Any Leader / specific leader toggle)',
      'Fixed chat command hotkeys garbling messages when using key combos (sorry, I tested these with function keys)',
      'Fixed multi resist mods not applying to pseudo ele res calcs in price checker',
    ],
  },
  {
    version: '0.8.0',
    notes: [
      'Price checker updates (rarity chip, fractured chip, fixed valdos, added blueprint wing count, updated map defaults)',
      'Fixed setting for "Chaos orb equivalent" not working',
      'Filter fixes (temple mods, fractures)',
      'Fixed bad bug where overlay stopped appearing with filter hotkey after switching zones',
      'Added FAQ button to overlay settings',
      'Updated FAQ',
    ],
  },
  {
    version: '0.7.9',
    notes: [
      'Scarab tiering fix',
      "Warning message when Scalpel can't read items (usually means PoE is running as admin)",
      'Fixed hotkey modifier release crash from globalShortcut refactor',
    ],
  },
  {
    version: '0.7.8',
    notes: [
      'Added memory strand breakpoint slider for adjusting strand thresholds',
      'Fixed a some items not finding their correct tier block in the filter (6 links, memory strands, some qualitied items)',
      'Fixed some price checker things not working correctly (socketed gem supports, blueprints)',
      "Fixed tier dropdown showing for items tiered by stack size when it didn't make sense (e.g. Simulacrum Splinters)",
      'Added collapsible item hero that sticks to the top with save button when scrolling',
      'Fixed audit tab kicking back to filter tab when retiering items',
      'Added defense values and DPS in price check listing dropdowns',
      'Fractured mods now also show an unfractured version (disabled) for price comparison',
    ],
  },
  {
    version: '0.7.7',
    notes: [
      'Fixed tier dropdown showing for items tiered by stack size (Simulacrum Splinters, Gold, etc.)',
      'Added buyout price currency setting (chaos/divine or chaos equivalent)',
    ],
  },
  {
    version: '0.7.6',
    notes: [
      'Added FAQ page in settings for common issues and tips',
      "Added custom chat command hotkeys in settings as I couldn't think of a better place. This page is approaching too big.",
      'Fixed issue with hotkeys not suppressing in game events',
      'Fixed mirrored chip in pricing',
    ],
  },
  {
    version: '0.7.5',
    notes: [
      'Huge speed improvement on price checker, removed some delays that were unnecessary.',
      'Fixed some items that were matching to incorrect tiers - there are more of these that are wrong so please help by reporting',
      'Boss invitations, logbooks, incubators and div cards now use regular trade search instead of bulk',
      'Updated some trade defaults - collapsed listing, chaos/div. The basic stuff.',
      'Added trade API rate limit bar with smooth step-down decay',
    ],
  },
  {
    version: '0.7.4',
    notes: [
      'Totally reworked how filters update from your online filterblade update. Now, when you make filter updates in Scalpel those are recorded to a log and "replayed" when you update your filter. This should be much much more resilient.',
      'Custom sound support, now you can apply any mp3 in your filter folder to a sound.',
      'Added weapon DPS calculations to price checker',
      'Weapon and armour stats are normalized to 20% quality (duh)',
      'Added configurable default search percentage in settings',
      'Added "Exact Values" chip to instantly set all search filters to actual roll values',
      'Fixed abyssal socket search',
      'Fixed color picker positioning bug that made it effectively unusable',
      'Gem level and quality are now adjustable rows instead of chips',
      'Unid unique candidates are now pulled from poe.ninja at runtime and cached locally',
    ],
  },
  {
    version: '0.7.3',
    notes: ['Added ability to drag and drop the overlay around and snap to sides'],
  },
  {
    version: '0.7.2',
    notes: [
      'Fixed bug where hotkeying an item that could not be audited while on the audit tab would cause a crash, imagine that',
    ],
  },
  {
    version: '0.7.0',
    notes: [
      'FilterScalpel is now just Scalpel, I think it does a better job of not limiting the scope of the tool',
      'Totally refactored updates, app now pulls MUCH smaller package for updates, and auto-reloads!',
      'Added bulk exchange pricing for currency, scarabs, fragments, essences, fossils, div cards, and all stackable items. Greg give me access to Faustus',
      'Gem pricing fixed',
      'Map pricing fixed',
      'Cluster jewel pricing fixed',
      'Fractured mods pricing fixed',
      'Influenced items pricing fixed',
      'Memory Strands pricing fixed',
      'Open prefix/suffix pricing which is something I think matters a lot',
      'Unid unique pricing fixed',
      'Trade listing type added to settings (all vs instant)',
      'Improved UX in price checker greatly',
      "Play button for alert sound preview in filter editor, you're welcome",
      'Mounts to stash side when hotkeying from stash',
      'Added automatic scaling based on resolution. I game on 1080p lmao.',
      'We now have too many settings so i reorganized them',
      'Added trade to onboard',
    ],
  },
  {
    version: '0.6.2',
    notes: ['Added alpha and I mean ALPHA price checker. Use at your own risk.'],
  },
  {
    version: '0.6.1',
    notes: [
      "Polished the div card explorer so that I don't hate the UI",
      'Added div card results to the item hero',
      'Fixed overlay flickering when moving mouse in and out of the overlay?? I hope.',
    ],
  },
  {
    version: '0.6.0',
    notes: [
      'Added v1 of the Div Card explorer to find out scrying strategies and retier div cards',
      'Div cards now show their artwork',
      'Fixed tier switching dropdown not working',
    ],
  },
  {
    version: '0.5.6',
    notes: [
      'Fixed some items not matching the correct filter tier (Blight-ravaged maps, exotic tiers)',
      'Fixed overlay blocking clicks on other windows when alt-tabbing and tried to make transitions back smoother, less flickering',
    ],
  },
  {
    version: '0.5.5',
    notes: [
      "Added overlay scale setting for larger monitors (or make it smaller, I'm not your dad)",
      'Fixed issue with OS focus changing when moving the cursor in and out of the overlay (Thanks Fezalion)',
      'Tried to fix issue with dust tab loading in empty if API calls failed for pricing',
      'Fixed bug where settings were not synced (Thanks Fezalion, again)',
      'Added slickness',
    ],
  },
  {
    version: '0.5.3',
    notes: [
      'Updated UX of audit tier again to make it even easier to use',
      "Fixed bug where overlay wouldn't work in windowed mode. Note: FS will not work in fullscreen, so use borderless.",
    ],
  },
  {
    version: '0.5.2',
    notes: ['Bugfix: Overlay now works on devices that scale DPI (Thanks @Guitaraholic)'],
  },
  {
    version: '0.5.0',
    notes: [
      'Changed UX of tier audit based on streamer feedback',
      'Added tool to explore dust values',
      'Tried to make states more persistent across tabs',
      'Esc now closes the overlay',
      'Tried to make the sliders scale using log so they feel correct',
      'Even more UX/UI updates to make everything feel consistent across tabs',
    ],
  },
  {
    version: '0.4.4',
    notes: ['Added socket recoloring tool idk why I just wanted to'],
  },
  {
    version: '0.4.3',
    notes: [
      'Tried to fix all uniques, there are lots of exceptions to try and fall through to.',
      'Added dust/disenchant values for uniques. Will calculate based on quality and other things. Should be accurate.',
      'Added dust slider to uniques but this added a new challenge - being able to filter by both at the same time. I added an and/or selector to adjust how you filter. Hope the UX is clear enough.',
      'UI/UX improvements',
      'Default hotkey changed to Ctrl+Shift+D, as Ctrl+F is the in game default for searching stash, which breaks the tool. Whoops.',
    ],
  },
  {
    version: '0.4.2',
    notes: ['Added support for maps, what a pain!'],
  },
  {
    version: '0.4.1',
    notes: ['Made auditing UX more clear based on feedback'],
  },
  {
    version: '0.4.0',
    notes: [
      'Major update: Added new tab, tier audit, which allows you to easily change the tier of multiple items at once based on their current price on ninja.',
      "Fixed issue with effects not showing up when they didn't have a sound or map icon",
      'Maybe fixed the issue with menus not being clickable when not on the overlay',
      'No more desktop icon, my bad',
    ],
  },
  {
    version: '0.3.3',
    notes: [
      'Major update: Added ability to merge changes from your online filters to your local ones. This allows you to sync economy updates or changes made on FilterBlade with your local filter and keep the changes you made.',
      'UI/UX improvements',
      'Bug fixes',
    ],
  },
  {
    version: '0.3.2',
    notes: [
      'Added support for online filters, which are then copied locally',
      'Split onboarding filter step into folder selection + filter selection',
      'Made the UI a more pleasant and consistent feeling experience',
    ],
  },
  {
    version: '0.3.0',
    notes: [
      'Added onboarding',
      'Added standalone settings menu - will add more things outside of overlays',
      'Added app update detection & in-app updating',
      'Bug fixes: flickering/multiple click closing, overlay not clickable after alt-tab, filter file not changing',
    ],
  },
  {
    version: '0.2.2',
    notes: ['Fixed issue with quality and stack size incrementing'],
  },
  {
    version: '0.2.1',
    notes: ['Added support for qualitied item thresholds'],
  },
  {
    version: '0.2.0',
    notes: [
      'Filter versioning with auto-save and checkpoints',
      'Undo/redo for filter edits',
      'CustomAlertSound support for custom sound packs',
      'Reload-on-save setting for deferred filter reload',
      'Various UI polish and styling improvements',
    ],
  },
  { version: '0.1.0', notes: ['Initial Release'] },
]
