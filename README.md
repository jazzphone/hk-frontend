# HK Frontend

Home Assistant dashboards inspired by Apple’s Home app — built from your own rooms and devices, and set up entirely in the UI.

![A wall tablet showing the Home screen: the clock and weather at the top, status chips, then glass tiles for each room over a live sky](docs/images/tablet-home.png)

| | | | |
|---|---|---|---|
| ![The Home screen on a phone](docs/images/phone-home.png) | ![A light’s detail sheet with a brightness slider](docs/images/sheet-light.png) | ![The live sky at night](docs/images/sky-night.png) | ![The HK Settings page](docs/images/settings-overview.png) |
| Phone | Detail sheet | Live sky | HK Settings |

<sub>Screenshots are of a home that has added Apple’s font and glyphs (see [Your files](docs/your-files.md)); camera pictures are blurred.</sub>

## What you get

- **Screens that build themselves.** A new screen is generated from your floors, areas and devices: a header with the clock, weather and alarm state, a row of status chips, a section of tiles per room, and a page per room. A new light shows up on its own.
- **Pages for what your home has.** Weather, Cameras, Security, Doors & Windows, Climate, Lights, Water, Timers and Vacuums — each only when there is something to show.
- **One screen for every device.** The same screen works on a wall tablet, a computer, an iPad and a phone; tiles and the weather reflow below 640 px.
- **A live sky** behind every page that follows the weather and the time of day, with optional seasonal decorations.
- **Glass tiles and detail sheets.** Tap a light, thermostat, lock, garage door, speaker or vacuum and a sheet opens with the controls it needs.
- **A menu of pages and rooms**, open beside the page or behind a button, with an optional **Home Assistant section**: Integrations, Automations, Settings and Notifications with their counts, and the rest of your Home Assistant sidebar.
- **Pop-ups** for a doorbell camera, the alarm keypad or a set of accessories, which an automation can open on chosen screens (`hk_frontend.show_popup`).
- **HK Settings**, a settings page in the sidebar with a live preview of each screen -- as a phone, an iPad, a wall tablet, a desktop or a car -- a Setup Assistant and a Setup Check.
- **A card library** for dashboards you build yourself.
- **Wall tablet support:** return to Home when idle, a photo screensaver, and a full-screen kiosk look.

## Requirements

- **Home Assistant 2026.8** or newer
- **[HACS](https://hacs.xyz)**

Optional:

| For | You need |
|---|---|
| Music | [Music Assistant](https://www.music-assistant.io) and its Home Assistant integration |
| Live TV | An HDHomeRun tuner, and ffmpeg on the Home Assistant host (Home Assistant OS and Container already include it) |
| Clean Areas | Vacuums with room maps in Home Assistant |
| Wall tablets | [WallPanel](https://github.com/j-a-n/lovelace-wallpanel) and [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) from HACS; [Fully Kiosk Browser](https://www.fully-kiosk.com) on the tablets |
| A radar map on the Weather page | [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card) from HACS |

## Install

1. In Home Assistant, open **HACS** → **⋮** (top right) → **Custom repositories**.
2. Enter `https://github.com/jazzphone/hk-frontend`, choose the type **Integration**, and select **Add**.
3. Search HACS for **HK Frontend**, open it and select **Download**.
4. Restart Home Assistant.
5. Go to **Settings** → **Devices & services** → **Add integration**, search for **HK Frontend** and select **Submit**. It asks nothing, and it loads its **HK Kiosk** theme by itself — there is nothing to add to `configuration.yaml`.
6. Open **HK Settings** in the sidebar. The **Setup Assistant** starts on its own: a few questions about your home, then your first screen.
7. *Optional:* add Apple’s font and glyphs. Put these three files in `/config/hk_local` (you make them from Apple’s downloads with the tools in this repository — see **[Your files](docs/your-files.md)**):

   | File | Made from |
   |---|---|
   | `fonts/SF-Pro.woff2` (or Apple’s `SF-Pro.ttf` as is) | `SF-Pro.ttf` from Apple’s [SF Pro](https://developer.apple.com/fonts/) download — the upright variable font, not the italic or the `.otf` files |
   | `iconset/hk-glyphs.js` | 155 symbols from Apple’s [SF Symbols](https://developer.apple.com/sf-symbols/) app — listed in [Glyph names](docs/glyph-names.md) |

The full walk-through, with what you should see at each step: **[Getting started](docs/getting-started.md)**.

## Optional features

Each feature is added separately from **Settings** → **Devices & services** → **HK Frontend** → **Add feature**, and each can be removed again without touching your screens.

| Feature | What it does |
|---|---|
| **Music** | Whole-home music through Music Assistant: rooms, speaker groups and playlists on a Play Music page, plus actions for automations. |
| **Live TV** | An HDHomeRun tuner’s channels, with an optional program guide, played full screen on any screen. |
| **Clean Areas** | Pick rooms and send each vacuum that reaches them to clean them. |
| **Alarm PIN** | A PIN in front of an alarm panel that takes no code of its own. |

More: [Features](docs/features.md).

## Your files

Apple’s SF Pro font and SF Symbols glyphs can’t be bundled with HK Frontend, so out of the box the screens use Home Assistant’s own font (Roboto) and the standard Material Design icons — everything works. To use Apple’s font and glyphs, put your own copies in a folder under `/config`: see **[Your files](docs/your-files.md)**.

## Documentation

| Guide | What’s in it |
|---|---|
| [Getting started](docs/getting-started.md) | From installing to your first screen |
| [Settings](docs/settings.md) | Every page of HK Settings |
| [Screens](docs/screens.md) | Generated screens, the menu, pages and rooms |
| [Features](docs/features.md) | Music, Live TV, Clean Areas and Alarm PIN |
| [Wall tablets](docs/wall-tablets.md) | Fully Kiosk, a user per tablet, the screensaver, idle return |
| [Sky](docs/sky.md) | The live sky and its seasonal decorations |
| [Cards](docs/cards.md) | The card library, for dashboards you build yourself |
| [Your files](docs/your-files.md) | Adding Apple’s font and glyphs, with or without a Mac |
| [Glyph names](docs/glyph-names.md) | Every `hk:` icon and the SF Symbol it is drawn from |
| [Troubleshooting](docs/troubleshooting.md) | Setup Check, Repairs, caching, diagnostics, reporting a problem |
| [Development](docs/development.md) | Code layout, tests and contributing |
| [Gallery](docs/gallery.md) | Every screen, as it looks in one home |

## Help and feedback

Open an issue at [github.com/jazzphone/hk-frontend/issues](https://github.com/jazzphone/hk-frontend/issues) and attach the diagnostics (**Settings** → **Devices & services** → **HK Frontend** → **⋮** → **Download diagnostics**). See [Troubleshooting](docs/troubleshooting.md) first.

## Disclaimer

HK Frontend is an independent project, not affiliated with or endorsed by Apple Inc. Apple, HomeKit, SF Pro and SF Symbols are trademarks of Apple Inc.

## Credits

- The seasonal sky illustrations were generated with OpenAI’s image tools.
- The cloud, rain and snow textures are generated procedurally by `tools/sky/gen_sky.py`.
- Until you add your own glyphs, icons are drawn from [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), read from Home Assistant’s own copy.

## License

[MIT](LICENSE)
