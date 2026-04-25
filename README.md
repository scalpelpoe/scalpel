# Scalpel

Path of Exile's first ever fourth-party tool. An overlay to edit your filter, price check items, generate regex and tons more.

## Features

- **Filter Editor** - Edit your loot filter in-game quickly and precisely (like a Scalpel, get it)
- **Price Checker** - A price checker that works like you'd expect, when it works. But better. Sometimes.
- **Regex** - Generate, save and hotkey regex strings. Maps & Custom for now. More coming. Powered by [poe.re](https://poe.re)
- **Economy Audit** - Bulk retier items based on current market prices from poe.ninja
- **Dust Explorer** - Easily filter uniques to find the best ones to dust
- **Div Card Explorer** - EV calculator for div cards on maps with live prices (s/o [Maps of Exile](https://github.com/deathbeam/maps-of-exile) and the Forbidden Library)
- **Socket Recolor** - Easily calculate cost of recoloring sockets on items
- **Online Filter Sync** - Use and update your FilterBlade filter like you always do, with the speed of local edits.
- **Macros** - Create chat macros for hideout etc.
- **And more** - Scrollable stash tabs, filter checkpoints etc.

## Requirements

- Windows 10+ (The Linux bois are working on it but it currently sometimes "just works")
- You're okay being an early adopter (Some of this ain't work good)

## Official Releases

Pre-built releases are available on the [Releases](https://github.com/scalpelpoe/scalpel/releases) page.

## FAQ

[FAQ](https://scalpel.fourth.party/faq)

## Notes from Fred

Scalpel is now open source. If you like Scalpel and have feedback, the Discord to do that is below. This app is in beta right now and it acts like it some times. Let me know and I will fix it, and if I can't handle it, maybe someone else can. Here is what I am working on next:

- Adding more regex support via [poe.re gh](https://github.com/veiset/poe-vendor-string/issues)
- Wiki integration
- Smart price checking that "remembers" how you price check and adapts over time
- Better onboarding
- Make online filter sync replay better including integrating tests to make sure it never breaks blocks
- Price checker improvements: Fix lines that don't work, add settings to handle specific use cases, etc.
- Fixing all the bugs. There is an end to bugs right? Eventually you run out.
- PoE2; send help

## Discord

[Hopefully this link works](https://discord.gg/nUNcrmEAP5)

## Screenshots

| | |
|---|---|
| ![Filter Editor](.github/screenshots/filter-editor.png) | ![Price Check](.github/screenshots/price-check.png) |
| ![Economy Audit](.github/screenshots/audit-currency.png) | ![Dust Explorer](.github/screenshots/dust-explorer.png) |
| ![Div Card Explorer](.github/screenshots/div-cards.png) | ![Socket Recolor](.github/screenshots/sockets.png) |

## Contributing

I'll keep PRs open until I can't manage it anymore. I don't care if you use AI tools to assist you with your work, be efficient, more power to you - I just don't want to sift through openclaw slop instead of building Scalpel.

Here are some things I need help with

- Linux support (Keyboard stuff is broken)
- Localization (All the Spanish I know is from watching Narcos)
- If you find item affixes that break in price checker (This is 50% of what is wrong with Scalpel)

## Building from Source

This is an electron app - why? I just know it better than other options. You can decide if I know it well or not. 

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
