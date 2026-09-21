# Scalpel

Path of Exile's first ever fourth-party tool. An overlay to edit your filter, price check items, generate regex and tons more.

## Features

- **Cross Game Support** - One tool, both games. Switch from PoE1 to PoE2 and back by using your hotkey. If you're in the wrong game it will prompt you to restart.
- **Filter Editor** - Edit your loot filter in-game quickly and precisely (like a Scalpel, get it)
- **Price Checker** - A price checker that works like you'd expect, when it works. But better. Sometimes.
- **Regex** - Generate, save and hotkey regex strings. Maps/Waystones, Flask & Custom for now. More coming. Powered by [poe.re](https://poe.re)
- **Economy Audit** - Bulk retier items based on current market prices from poe.ninja
- **Online Filter Sync** - Use and update your FilterBlade filter like you always do, with the speed of local edits.
- **Macros** - Create chat macros for hideout etc.
- **Cheat Sheets** - Use prefabs (PoE1 Leagues, PoE2 Leveling Guide) or add your own. Or just add pictures of Greg.
- **View in Wiki/PoEDB/Ninja** - Don't like what Scalpel has to say about an item? Try the other sites.
- **Art Mode** - Bind an app hotkey in settings to launch an artboard on top of the game - draw, add shapes, text and images. I don't know who would want this besides content creators but it's really fucking cool.
- **Plugins (beta)** - Browse and install from Settings → Plugins, or build your own.
- **And more** - Scrollable stash tabs, filter checkpoints, cool themes etc.

**PoE1 Only:**

- **Dust Explorer** - Easily filter uniques to find the best ones to dust
- **Div Card Explorer** - EV calculator for div cards on maps with live prices (drop weights powered by [wraeclast.cards](https://wraeclast.cards); s/o [Maps of Exile](https://github.com/deathbeam/maps-of-exile) and the Forbidden Library)
- **Socket Recolor** - Easily calculate cost of recoloring sockets on items

## Plugins

See [PLUGINS.md](PLUGINS.md) for information on how to build a plugin. Please join Discord if you do - I need input on how to help you make better plugins.

## Requirements

- Windows 10+, Linux

## Official Releases

Pre-built releases are available on the [Releases](https://github.com/scalpelpoe/scalpel/releases) page.

### Arch Linux (AUR)

Scalpel is also available on the AUR:

- [`scalpel-poe-bin`](https://aur.archlinux.org/packages/scalpel-poe-bin) - pre-built stable release; recommended
- [`scalpel-poe`](https://aur.archlinux.org/packages/scalpel-poe) - stable release built from source
- [`scalpel-poe-git`](https://aur.archlinux.org/packages/scalpel-poe-git) - latest development version built from Git

For example, using [`paru`](https://github.com/morganamilo/paru):

```sh
paru -S scalpel-poe-bin
```

## FAQ

[FAQ](https://scalpel.fourth.party/faq)

## Notes from Fred

The PoE2 era has begun for Scalpel. Enjoy 0.5 and all the new content and please feel free to bug me about what works and what doesn't. I have tried to smoke test PoE2 as best I can, but that is short of actually using it during gameplay.

- Adding more regex support via [poe.re gh](https://github.com/veiset/poe-vendor-string/issues)
- Smart price checking that "remembers" how you price check and adapts over time
- Better onboarding
- Make online filter sync replay better including integrating tests to make sure it never breaks blocks
- Price checker improvements: Fix lines that don't work, add settings to handle specific use cases, etc.
- Fixing all the bugs. There is an end to bugs right? Eventually you run out.
- Windows 10 might have a ram leak? Reported but it's not doing it in my VM. Works on my machine (tm).

## Discord

[Hopefully this link works](https://discord.gg/nUNcrmEAP5)

## Screenshots

| | |
| --- | --- |
| ![Filter Editor](.github/screenshots/filter-editor.png) | ![Price Check](.github/screenshots/price-check.png) |
| ![Economy Audit](.github/screenshots/audit-currency.png) | ![Dust Explorer](.github/screenshots/dust-explorer.png) |
| ![Div Card Explorer](.github/screenshots/div-cards.png) | ![Socket Recolor](.github/screenshots/sockets.png) |

## Contributing

There are two ways to contribute to Scalpel - fork this repo and make a PR (duh), or you can make a plugin (instructions above.) Plugins are a great way for you to integrate your tool into Scalpel and manage it as your own project, and it reduces bloat in the main project. Scalpel users will be able to easily add plugins in settings.

**If you want to help in the main repo:**

- Localization (All the Spanish I know is from watching Narcos)
- If you find item affixes that break in price checker (This is 50% of what is wrong with Scalpel)
- You tell me!

## Building from Source

Running it is easy:

```
npm install
npm run dev
```

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Third-Party Software

Check out [Third Party Notices](THIRD-PARTY-NOTICES.md) for the homies that make the libaries that make apps like Scalpel possible.

Special thanks to VZ and the contributors that make [poe.re](https://github.com/veiset/poe-vendor-string/issues). I genuinely could not have a functioning regex tool without their dedication to finding tens of thousands of unique regex tokens.
