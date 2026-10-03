<h1 align="center">HK Frontend</h1>

<p align="center">
Home Assistant dashboards inspired by Apple’s Home app.<br>
Built from your own rooms and devices, and set up entirely in the UI.
</p>

<p align="center">
<a href="https://github.com/jazzphone/hk-frontend/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/jazzphone/hk-frontend?style=flat-square&label=release&color=0a84ff"></a>
<a href="https://hacs.xyz"><img alt="HACS custom repository" src="https://img.shields.io/badge/HACS-custom-41BDF5?style=flat-square"></a>
<img alt="Home Assistant 2026.8 or newer" src="https://img.shields.io/badge/Home%20Assistant-2026.8%2B-18BCF2?style=flat-square">
<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/jazzphone/hk-frontend?style=flat-square&color=8e8e93"></a>
</p>

<p align="center">
<img src="docs/images/hero.webp" width="900" alt="The Home screen on a wall tablet at a fall sunset, leaves falling behind the tiles, and on a phone on a starry fall night">
</p>

<p align="center">
<b><a href="https://github.com/jazzphone/hk-frontend/wiki/Install">Install</a></b> ·
<b><a href="https://github.com/jazzphone/hk-frontend/wiki">Documentation</a></b> ·
<b><a href="https://github.com/jazzphone/hk-frontend/wiki/Gallery">Gallery</a></b> ·
<b><a href="https://github.com/jazzphone/hk-frontend/releases">What’s new</a></b>
</p>

## Screens that build themselves

Add a screen and HK Frontend builds it from your floors, areas and devices: the clock and weather, status chips, cameras, scenes, favorites, a section for every room, a page for each room and each kind of device, and a [calendar](https://github.com/jazzphone/hk-frontend/wiki/Calendar) of the month, week or day. A new light shows up on its own. The same screen works on a wall tablet, a computer, an iPad and a phone.

<p align="center">
<img src="docs/images/tablet-lights.png" width="49%" alt="The Lights page">
<img src="docs/images/tablet-climate.jpg" width="49%" alt="The Climate page">
</p>

## Tap for the controls

The [Climate page](https://github.com/jazzphone/hk-frontend/wiki/Climate) has the same status row as a room: temperature and humidity
ranges across the included rooms, plus blinds and fans. Tap a summary to open
its accessory pills; close an accessory’s controls to return to the list.
**HK Settings → All Screens → Climate Status** chooses which summaries and
rooms participate. **What Counts → Temperature / Humidity** lets you leave
sources out or add others. Automatic readings use Home Assistant’s area
Related sensors, falling back to a thermostat’s current reading when an area
has no designated sensor. Unavailable readings stay in the list and do not
affect the range. Thermostats sit side by side when space permits and stack
on narrower pages.

Tap a light, thermostat, lock, garage door, speaker or vacuum and a sheet opens with the controls it needs. Pop-ups show the doorbell camera or the alarm keypad, and an automation can open one on chosen screens. Its gear holds the accessory’s own settings: its name, its icon (any of Apple’s Home glyphs, or Home Assistant’s), a regular or tall tile, and its place among the tiles beside it.

<p align="center">
<img src="docs/images/sheet-light.png" width="49%" alt="A light’s detail sheet with a brightness slider">
<img src="docs/images/sheet-thermostat.png" width="49%" alt="A thermostat’s detail sheet">
</p>

## A live sky

Behind every page, a sky that follows the weather and the time of day, with seasonal decorations for the holidays.

<p align="center">
<img src="docs/images/sky-rain.png" width="49%" alt="The live sky in the rain">
<img src="docs/images/sky-halloween.png" width="49%" alt="A spooky Halloween night: a big moon, fog and bats">
</p>

## Set up in the UI

**HK Settings** in the sidebar holds everything, with a live preview of each screen as a phone, an iPad, a wall tablet, a desktop or a car. A Setup Assistant makes your first screen, and Setup Check says what is missing. There is nothing to add to `configuration.yaml`.

<p align="center">
<img src="docs/images/settings-screen.png" width="100%" alt="A screen’s settings in HK Settings, beside a live preview of it at wall-tablet size">
</p>

## Install

You need **Home Assistant 2026.8** or newer and **[HACS](https://hacs.xyz)**.

1. In **HACS**, open **⋮** → **Custom repositories**, add `https://github.com/jazzphone/hk-frontend` as an **Integration**, then download **HK Frontend**.
2. Restart Home Assistant.
3. In **Settings** → **Devices & services**, select **Add integration** and choose **HK Frontend**.
4. Open **HK Settings** in the sidebar. The Setup Assistant starts on its own.

Step by step, with what you should see: **[Install](https://github.com/jazzphone/hk-frontend/wiki/Install)**. Apple’s font and glyphs are optional and can’t be bundled; **[Your files](https://github.com/jazzphone/hk-frontend/wiki/Your-Files)** shows how to add your own.

## Optional features

Add each from **Settings** → **Devices & services** → **HK Frontend** → **Add feature**.

| | |
|---|---|
| **[Music](https://github.com/jazzphone/hk-frontend/wiki/Music)** | Whole-home music through Music Assistant: rooms, speaker groups and playlists |
| **[Live TV](https://github.com/jazzphone/hk-frontend/wiki/Live-TV)** | An HDHomeRun tuner’s channels and guide, full screen on any screen |
| **[Clean Areas](https://github.com/jazzphone/hk-frontend/wiki/Clean-Areas)** | Pick rooms and send the vacuums that reach them |
| **[Alarm PIN](https://github.com/jazzphone/hk-frontend/wiki/Alarm-PIN)** | A PIN in front of an alarm panel that takes no code of its own |
| **[Wall tablets](https://github.com/jazzphone/hk-frontend/wiki/Wall-Tablets)** | Return to Home when idle, a photo screensaver or the forecast over a landscape that dresses up for the holidays (with the coming events beside it, if you like) and a full-screen kiosk look |

## Help

Start with **[Troubleshooting](https://github.com/jazzphone/hk-frontend/wiki/Troubleshooting)**. To report a problem, [open an issue](https://github.com/jazzphone/hk-frontend/issues) and attach the diagnostics (**Settings** → **Devices & services** → **HK Frontend** → **⋮** → **Download diagnostics**).

---

<sub>Screenshots are of one home that has added Apple’s font and glyphs; camera pictures are blurred. HK Frontend is an independent project, not affiliated with or endorsed by Apple Inc. Apple, HomeKit, SF Pro and SF Symbols are trademarks of Apple Inc. The seasonal sky illustrations were generated with OpenAI’s image tools, and the cloud, rain and snow textures by `tools/sky/gen_sky.py`; until you add your own glyphs, icons come from [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0). [MIT license](LICENSE).</sub>
