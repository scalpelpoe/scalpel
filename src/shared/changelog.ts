export const CHANGELOG: { version: string; notes: string[] }[] = [
  {
    version: '0.9.6',
    notes: [
      'Major changes to tier section in filter page',
      'Audit page ux improvements',
      'Added support for showing related items for certain items like fragments etc.',
      'Added settings chip when price checking to adjust search parameters on the fly',
      'Added setting to price checker to change default display of results',
      'Updated meter that displays api timeouts in price checker and made warnings... exist',
      'Attempted to return clipboard data after item and regex hotkeys',
      'Improved search, more items and much, much faster',
      'Added custom scaling button (Thanks KnoT)',
      'Added crit chance and attack speed accumulators to price checker (off by default)',
      'Added warning to map searching about too many results making travel to hideout button not work well. Just the way it be.',
      'Added option in settings to decide where Scalpel mounts by default',
      'Made Faustus a jerk',
      'Fixed issue with alt-tabbing for some users (Thanks Pandas)',
      'Added crafted mods to empty affix count in price checker chip (big brains ailu)',
      'Fixed more bugs with price checker',
      'Fixed bug where esc key outside poe could cause poe to focus',
      'Fixed issue where Scalpel would appear on top of login screen',
      'Added bugs',
    ],
  },
  {
    version: '0.9.5',
    notes: [
      'Added regex tab powered by poe.re. Starting with Map & Custom',
      'Added macro in settings to hotkey most recent regex or any "macro" tagged regex',
      'Added feature to quickly input decent numbers in non filled price check fields on click',
      'Added scrubber inputs to price checker',
      'Added ability to load more items in trade results windows',
      "Added 3 trade settings: default to base, never auto-search, and don't hide mods",
      'Added "base" to unique and corrupted stretching the definition of base but it works nicely',
      'Added tiers and roll ranges to price checker rows',
      'Added color hints to unique roll ranges and fixed low value inputs',
      'Moved history tab to settings',
      'Added error banner for hotkey collisions',
      'Added warning banner for poe hotkeys like ctrl+f',
      'Added hotkey to close scalpel',
      'Added search to empty filter page - you can now update gold on your filter',
      'Fixed issue where price check tab could be clicked when there was no data',
      'Fixed so many stupid price checker item lines - hey Greg why is supported by Chance To Bleed 3 different trade inputs',
    ],
  },
  {
    version: '0.9.4',
    notes: [
      'Fixed every reported price checking issue (contracts, beasts, 2 line fractures, map implicits, foulborn mods, more)',
      'Added dust value to price checker for uniques',
    ],
  },
  {
    version: '0.9.3',
    notes: [
      "Changed update process to allow electron updates so we aren't stuck on an old version",
      'Added beta update channel for the brave & patient',
    ],
  },
  {
    version: '0.9.1h',
    notes: ['Fixed awful bug with poe2 compatibility causing interface to become completely nonfunctional in poe1'],
  },
  {
    version: '0.9.1g',
    notes: [
      'Updated the way PoE windows are detected to prevent firing in the wrong game',
      'Fixed another z-index issue if the windowed settings was open',
    ],
  },
  {
    version: '0.9.1f',
    notes: ['Fixed hotkeys getting stuck and right side keys in hotkey issues, you know, maybe'],
  },
  {
    version: '0.9.1e',
    notes: ['Fixed issue with right modifiers not releasing'],
  },
  {
    version: '0.9.1d',
    notes: [
      'Fixed issue with certain hotkey combos breaking macros',
      'Fixed issue with held keys not being restored after hotkeys',
      "Fixed issue with windows toolbar hiding in borderless fullscreen no you aren't crazy",
    ],
  },
  {
    version: '0.9.1c',
    notes: [
      "Fixed issue price checking items that don't have tiers on mods",
      'Fixed hotkeys now not working outside of the game, always something, amazing',
    ],
  },
  {
    version: '0.9.1',
    notes: [
      'Added tiers and advanced mods to price check results',
      "Reworked how negative mods get defaulted to min/max based on if they're beneficial or not but it's a judgement call",
      'Added stack pricing support',
      'Added support for price checking facetors',
      'Added "Base" chip to non-mirrored/corrupted/unique that searches for the item base',
      'Moved socket details to rows in price checker because who really cares',
      "Settings panel split into tabs so I don't hate it",
      'Overlay scale changed from slider to preset buttons',
      'Added auto-submit/press enter toggle per chat macro',
      'Added ability to bind more hotkeys to other app tabs',
      'Totally reworked hotkeying and chat macros',
      'Added warning when price checking items that are best sold on Faustus',
      'Fixed chronicle of atzoatl room price check',
      'Fixed issue with fractured mods not showing on items in trade results',
      'Fixed issue with +X for Y mods rolling into pseudos improperly for price checker',
      'Fixed crash when retiering all items out of a tier block (Thanks Liemander)',
      'Fixed empty tiers not being navigable or usable as retier targets, removed "rest" as usable tier',
      "Fixed issue with some gems not exact searching and transfigured gems work now so that's nice",
      'Fixed issue with implicit defaults in price check being poorly prioritized',
      'Fixed crafted mods acting like regular mods when price checking. Silly crafted mods.',
      'Fixed implicit modifiers that multiply affixes',
      'Updated FAQ',
    ],
  },
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
