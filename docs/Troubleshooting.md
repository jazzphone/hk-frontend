# Troubleshooting

When something doesn’t look or work the way it should, check these first:

1. **Setup Check** in HK Settings: everything HK Frontend knows how to check, with what to do about each.
2. **Settings** → **Repairs**: the problems that affect every screen.
3. The [common problems](#common-problems) below.

If none of that helps, [report it](Diagnostics.md#reporting-a-problem) with the diagnostics attached.

## Setup Check

Setup Check reads your Home Assistant and lists what the screens need, what is ready and what to fix. It is read-only: it changes nothing.

Open it from **HK Settings** → **Overview** → **Setup Check** (also under **System** in the HK Settings list). The lines are grouped into **Needs Doing**, **Ready** and **Notes**; select **Check Again** after fixing something. The same report is under **Settings** → **Devices & services** → **HK Frontend** → **Configure** → **Setup check**, marked ⚠️ (to fix), ✅ (ready) and ℹ️ (a note).

| Line | Ready when | Otherwise |
|---|---|---|
| **Home Assistant** *(version)* | 2026.8 or newer | **Needs Doing.** Older frontends draw the screens wrongly. Update Home Assistant. Also a Repairs entry. |
| **HK Kiosk theme** | The theme is loaded | **Needs Doing.** Every screen draws in the wrong colors. HK Frontend loads the theme itself, so this means it couldn’t: the log says why, and the Repairs entry gives the `configuration.yaml` lines that load it instead. |
| **Card files** | All the card files are dashboard resources | **Needs Doing.** In storage mode they are added once Home Assistant has started; if the line persists, restart. In YAML mode the line lists the URLs to add to `lovelace: resources:` yourself ([Install → The card resources](Install.md#the-card-resources)). *Lovelace has not started yet* means Home Assistant is still starting: check again in a moment. |
| **SF Pro and the SF Symbols glyphs** | Both are in your files folder | A **note** (*Apple’s font and glyphs*): the screens use Roboto and Material Design icons meanwhile. Optional — [Your files](Your-Files.md). |
| **Devices in no area** | Every device with a tile is in an area | A **note** naming the devices. A generated screen shows them under **More**, and no room page shows them. Assign each an area. Only devices with a tile count (lights, switches, fans, covers, locks, players, thermostats and so on), not phones or trackers. |
| **Areas with no icon** | — | A **note**: the menu draws a plain room glyph for them. Pick an icon in the area’s settings. |
| **Areas with no temperature or humidity sensor** | — | A **note**: a room page’s status line leaves those readings out. Set them in the area’s *Related sensors*. |
| **Menu and room pages** | The menu is on for one or more screens, all of which exist | **Needs Doing** when the menu is on for a dashboard that has since been deleted: remove that dashboard’s item under **Settings** → **Devices & services** → **HK Frontend** (its list of dashboards). A **note** when the menu is off on every screen. |
| **Screensaver tablets** | Each screen with the photo screensaver has a Tablet User, and Home Assistant has a user of that name (shown when a screen has the photo screensaver) | **Needs Doing** when one has none, or names a user that doesn’t exist: the screensaver never shows there. Choose it under the screen’s **Behavior**. |
| **Screensaver photos** | The photos folder has photos (shown when a screen shows photos) | A **note** when the folder is empty or can’t be read: the screensaver shows the forecast instead. To show photos, check **HK Settings → Wall Tablets → Screensaver Photos**. |
| **Weather Radar Card** (and **WallPanel** or **Kiosk Mode**, for a screen that uses one instead of HK Frontend’s own) | Installed from HACS, and — for WallPanel and Kiosk Mode — loaded as a dashboard resource | A **note**. Not installed: no radar map on the Weather page, no WallPanel screensaver, or Home Assistant’s header and sidebar showing on a screen set to use the Kiosk Mode plugin. *Installed but not loaded*: the line names the URL to add under **Settings** → **Dashboards** → **⋮** → **Resources** (type *JavaScript module*). |
| **Music**, **Alarm PIN**, **Clean Areas**, **Live TV** | Added | A **note**: each is optional. Add it from **Settings** → **Devices & services** → **HK Frontend** → **Add feature**. |

## Repairs

HK Frontend raises four entries under **Settings** → **Repairs**. Each says what to do, and each clears itself once the problem is fixed.

| Repairs entry | Why | Clears |
|---|---|---|
| **Home Assistant is too old for HK Frontend** | Home Assistant is older than 2026.8. | After updating and restarting. |
| **HK Kiosk theme not loaded** | HK Frontend couldn’t load its theme (the log says why), so the screens can’t find their colors, font and glass. The entry shows how to load it from `configuration.yaml` instead. | As soon as the theme loads — HK Frontend checks again every time themes are reloaded. |
| **SF Pro font not installed** | No `fonts/SF-Pro.woff2` or `fonts/SF-Pro.ttf` in your files folder. Optional. | When HK Frontend next starts or reloads, or when you change the folder setting. |
| **SF Symbols glyphs not installed** | No `iconset/hk-glyphs.js` in your files folder. Optional. | The same. |

The font and glyph entries name the tools by their path in the HK Frontend repository (`tools/font/…`, `tools/sf_symbols/…`). They aren’t part of what HACS installs: [Your files](Your-Files.md) says where to get them and how to use them.

## A change doesn’t show on a screen

**A setting.** A change in HK Settings reaches every open screen within about a second, with no reload. A generated screen rebuilds itself within about ten seconds when something it is built from changes — its pages, favorites and cameras, Status & Chips, hidden accessories, the alarm, the weather — and stays on the page you are looking at. It also rebuilds when you move a device to another area, or rename an area or a floor.

**An update of HK Frontend.** After HACS updates HK Frontend, restart Home Assistant, then reload each screen — twice. Everything HK Frontend serves under `/hk/` is sent with `Cache-Control: no-cache`, so a browser checks for a newer copy every time it loads a screen. But the first load after an update can still be answered from Home Assistant’s service worker with the previous copy; the second load gets the new one. Judge a change only after the second reload.

To reload a wall tablet from Home Assistant, use the **Load start URL** button of the [Fully Kiosk Browser integration](https://www.home-assistant.io/integrations/fully_kiosk/).

**A dashboard kept in YAML.** Home Assistant caches a YAML-mode dashboard. After editing its file, or a file it includes, use **⋮** → **Refresh** on the dashboard, or restart.

**Your files.** Replacing a file in your files folder reaches a screen on its next load. A folder that didn’t exist when HK Frontend started isn’t served until HK Frontend reloads — see [Making Your Files, step 5](Making-Your-Files.md#step-5-reload-and-check).

## Common problems

### The screens are in the wrong colors

The HK Kiosk theme isn’t loaded, or isn’t applied.

- Check **Settings** → **Repairs** for *HK Kiosk theme not loaded*. HK Frontend loads the theme itself; that entry means it couldn’t, and gives the `configuration.yaml` lines that load it instead.
- A theme named **HK Kiosk** in your own `configuration.yaml` takes the place of the built-in one. If you copied the theme to change it, check your copy.
- A dashboard you built yourself doesn’t get the theme on its own: choose **HK Kiosk** as each view’s theme in the view’s settings.

### A card says *Custom element doesn’t exist*, or a generated screen won’t load

The card files aren’t loaded as dashboard resources.

- Open Setup Check and read the **Card files** line.
- In storage mode, the files are added once Home Assistant has finished starting. If the line still lists missing files after a restart, add them by hand under **Settings** → **Dashboards** → **⋮** → **Resources**: the two stylesheets as *Stylesheet*, every `/hk/cards/*.js` file as *JavaScript module*.
- In YAML mode, add the URLs the line lists to `lovelace: resources:`.
- Then reload the screen, twice.

### Text is Roboto and icons are Material Design

That is how HK Frontend looks without Apple’s font and glyphs, which can’t be bundled. To add them: [Your files](Your-Files.md). If you have added them and nothing changed:

- Check the paths: `fonts/SF-Pro.woff2` (or `SF-Pro.ttf`) and `iconset/hk-glyphs.js`, inside the folder named under **HK Settings** → **Advanced** → **Your Files** (default `hk_local`, which is `/config/hk_local`).
- If you created the folder after Home Assistant started, reload HK Frontend (**Settings** → **Devices & services** → **HK Frontend** → **⋮** → **Reload**).
- Reload the screen twice.

### An icon is blank

The icon’s name exists neither in your glyph file nor in Material Design Icons. Check the `icon:` of the card or accessory: `hk:` names are Material Design names (for example `hk:lightbulb`), and so are the stand-ins drawn until you add your own glyphs.

### Devices appear under *More* instead of in a room

They have no area. Assign each device an area (**Settings** → **Devices & services** → **Devices**); the screen rebuilds by itself. Setup Check lists the devices.

### A feature’s pages or controls are missing

Music, Live TV, Clean Areas and Alarm PIN appear only once they are added. Add each from **Settings** → **Devices & services** → **HK Frontend** → **Add feature**, then set it up under **Features** in HK Settings. For example, the Play Music page appears only when Music is added and has speakers. An automation calling `hk_frontend.music_play` or `hk_frontend.clean_areas` before the feature is added gets an error that says so. See [Features](Features.md).

### Live TV: a channel never starts

- **ffmpeg.** Live TV converts the tuner’s stream with ffmpeg on the Home Assistant host. Home Assistant OS and the Home Assistant container image include it; on a Python (Core) installation, install ffmpeg so it is on the `PATH` of the user Home Assistant runs as. Without it, Home Assistant’s log shows `No such file or directory: 'ffmpeg'` when a channel is opened.
- **go2rtc.** The picture reaches your screens through Home Assistant’s own go2rtc integration, which is part of `default_config:`. If you don’t use `default_config:`, add `go2rtc:` to `configuration.yaml`.
- **Busy tuners.** If every tuner in the HDHomeRun is in use (by another app, or other channels), the log shows a warning that mentions `503`.
- The first picture takes a few seconds to arrive. That is normal.

### HK Settings isn’t in the sidebar

- HK Settings is for **admins** only.
- It can be taken out of the sidebar for everyone: turn **Show HK Settings in the sidebar** back on under **Settings** → **Devices & services** → **HK Frontend** → **Configure** → **HK Settings page** (the same switch is under **Advanced** in HK Settings).
- You may have hidden it from your own sidebar in your profile’s sidebar settings.
- It is always at `/hk-settings` on your Home Assistant address.

### No screensaver on a wall tablet

- The screensaver runs only for the screen’s **Tablet User** (its **Behavior** group): check that the tablet signs in as exactly that user. A computer opening the same screen never gets it. **Setup Check → Screensaver tablets** says when a screen has none, or names a user Home Assistant doesn’t have.
- The forecast instead of your photos? The photos folder is empty or can’t be read; **Setup Check** says which. Check **HK Settings → Wall Tablets → Screensaver Photos**, and that **Show** is **Photos**.
- It waits while a detail sheet is open or Live TV is playing, and starts **Starts After** (3 minutes) after the last touch.
- `?hk_saver=off` in the page’s address turns it off for that page.
- In a browser’s console on the tablet, `hkSaver.stats()` says whether it is allowed there, how many photos it found and when it will start.

### Home Assistant’s header still shows on a wall tablet

- Check the screen’s **Appearance → Hide Home Assistant Header & Sidebar**, and under **Header & Sidebar**, **For Admins Too** if the tablet signs in as an admin.
- `?hk_kiosk=off` on the address shows them until the page is reloaded: reload it (Fully Kiosk Browser’s **Load Start URL**).
- A dashboard whose own YAML has `kiosk_mode:`, or a screen set to **Use the Kiosk Mode Plugin Instead**, is left to that plugin: Setup Check says whether it is installed and loaded.
- In a browser’s console on the screen, `hkKiosk.state()` says what is hidden and why (`settings`, `config` or `url`), or `null`.
