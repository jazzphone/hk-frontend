# HK Settings

**HK Settings** is the page where you set up everything HK Frontend draws: each
screen, the settings every screen shares, how your accessories show up, and the
optional features. It is in Home Assistant’s sidebar as **HK Settings**, at
`/hk-settings`. Only administrators can open it.

Each topic’s settings are on that topic’s page (the menu’s on [Menu](Menu.md),
the weather’s on [Weather](Weather.md), and so on). This page is how HK Settings
itself works.

![HK Settings: the list of screens and settings on the left, the Overview page on the right](images/settings-overview.png)

## Open it

1. In Home Assistant’s sidebar, select **HK Settings**.
2. If it isn’t in the sidebar, go to **Settings → Devices & services →
   HK Frontend → Configure → HK Settings page** and use the link there.

The first time you open it, before any screen has settings, it starts the
**Setup Assistant** (see [Your First Screen](Your-First-Screen.md#run-the-setup-assistant)).

On a wide window the list sits on the left and the page you pick on the
right. On a phone the list is its own page, and each page has a back button.
The address in the browser follows the page you are on, so Back, reload and
bookmarks work.

## How it is organized

| Group | Pages | Applies to |
|---|---|---|
| **Overview** | Where settings live, the Setup Check status, and counts of your screens, customized accessories, pop-ups and custom pages | — |
| **Screens** | One page per screen, then **Add Screen** | That screen only |
| **All Screens** | **General**, **What Counts**, **[Climate Status](Climate.md)**, **Weather**, **Calendar**, **Appearance**, **Sky / Background**, **Menu**, **[Rooms](Rooms.md)**, **Wall Tablets** | Every screen |
| **Features** | **Music**, **Live TV**, **Alarm PIN**, **Clean Areas** | Every screen |
| **Library** | **Accessories**, **Pop-ups**, **Custom Pages**, **Custom Chips** | Every screen that uses them |
| **System** | **Advanced**, **Setup Check** | — |

![The Screens list in HK Settings](images/settings-screen.png)

A screen’s page shows a live preview of that screen beside its settings (above
them on a narrower window). Changes show in the preview within seconds.
Under it, pick the size to look at -- **Phone** (390 × 844), **Tablet
Portrait** (an iPad upright, 820 × 1180), **Tablet Landscape** (1280 × 800,
a wall tablet), **Desktop** (1440 × 900), and **Car** (804 × 638, with the
car’s zoom) on a screen with Car Browser on. The preview is that size, so it
shows the layout that device really gets. It opens on the size the screen is
used at, and remembers your last choice for each screen in that browser.
When the preview column is too narrow for the full names, the two tablet
sizes read **Portrait** and **Landscape**.

![A screen’s preview at phone size](images/settings-preview-phone.png)
**Open Screen** opens the screen itself in a new tab.

## How the controls behave

- **Every control saves as you change it.** There is no Save button, except on
  pages where you type YAML. The top bar says **Saved**, or says what went
  wrong beside the field. A value that can’t be saved is never quietly swapped
  for a default.
- **Changes reach open screens within about a second**, without a reload. A
  generated screen (see [Screens](Screens.md#two-kinds-of-screen)) rebuilds
  itself within about ten seconds when something it is built from changes, and
  stays on the page you were looking at. Nothing here needs a restart.
- **A screen setting that can follow All Screens says so.** A screen’s Glass
  reads *Same as All Screens (Blur)* until you choose one for that screen, and
  its amount sliders are marked *Same as All Screens* until you move them.
- **Lists work the same way everywhere** (status chips, cameras, scenes,
  favorites, rooms, pages, Discover rows, a room’s tile order):
  - An **Automatic** switch at the top. On, the list follows your home: a
    light you add tomorrow shows up tomorrow. Turn it off to choose.
  - **Shown**: what is on the screen, in order. Drag a row by its handle to
    move it, or focus the handle and press the up and down arrow keys. Tap
    the red minus to remove a row.
  - **More**: what you can add. Tap the green plus.
  - **Add…** opens a searchable list. Tap one to add it, or tap **Select** to
    tick several (they stay ticked while you change the search), or **Select
    All** to tick everything the search matches, then **Add**. Hiding a
    dozen sensors from your screens is one search and two taps.
- **Removing, deleting and going back to Automatic ask first.**
- **Back returns to the page you came from.** A page you reached from a link on
  another page (a screen’s link to What Counts, say) goes back there.

## Search

Type in **Search** at the top of the list to find any setting by name or by a
word you might use for it (“blur”, “doorbell”, “idle”). A setting that every
screen has is listed once per screen. Search also finds screens, pop-ups,
custom pages, rooms and the features’ settings. Selecting a result opens its
page and highlights the setting.

## Which setting wins

When the same thing can be set in more than one place, the most specific wins:

1. A screen’s own setting (Screens → the screen).
2. A card’s own YAML (a weather card’s `entity:`, a keypad’s alarm).
3. The All Screens setting.
4. The default.

## General

**All Screens → General.** What your home has, for every screen.

| Setting | Default | What it does |
|---|---|---|
| Alarm Panel | No Alarm | The alarm for the header’s security line, the Security chip and page, and every alarm keypad that names no panel of its own. When none is chosen, the page offers **Use (your first alarm panel)**; a generated screen’s Security page uses the first alarm panel until you choose. |
| Indoor Temperature | First Thermostat’s | A temperature sensor for the Climate chip. |
| Power Use | None | A power sensor for the Energy chip, which needs it. W or kW; shown in kW. |
| House Timers | None | Timer helpers people start themselves (a nap, bedtime), shown as one-tap pills on the Timers page, in order. Each starts for its own duration and is named as the timer is, less a trailing “Timer”. |

## Advanced

**System → Advanced.** What almost nobody changes. Everything here works when
left empty.

| Setting | Default | What it does |
|---|---|---|
| Time Sensor | `sensor.time` | Home Assistant’s Time & Date sensor, which keeps every screen’s clock in step. Without it, each screen uses its own clock. |
| Date Sensor | `sensor.date` | The same, for the date. |
| Clean-Areas Script | None (the Clean Areas feature) | Only for a home whose own script should receive `areas: [area ids]` instead of the Clean Areas feature sending the vacuums. |
| Wrong-Code Indicator | Automatic | Only for an alarm panel that fails silently on a wrong code (a template panel that checks the code itself): an input boolean or binary sensor your automation turns on briefly. Most panels refuse a wrong code, and the keypad shows “Wrong Code” by itself. For an alarm that takes no code at all, use [Alarm PIN](Alarm-PIN.md#settings). |
| Show in Sidebar | On | Off: HK Settings leaves the sidebar for everyone. It is still reachable from Configure (below). Each person can also hide it from their own sidebar in their profile. |
| Your Files → Folder | `hk_local` | A folder under `/config` for the files that can’t ship with HK Frontend: Apple’s SF Pro font (`fonts/SF-Pro.woff2`) and the SF Symbols glyphs (`iconset/hk-glyphs.js`). **SF Pro Font** and **SF Symbols Glyphs** say whether each is found. See [Your files](Your-Files.md). |
| Your Own Dashboards → YAML Reference | — | What a dashboard you write yourself can use, each ready to copy and filled in from your home: hiding Home Assistant’s header, the photo screensaver, the live sky, views in the menu, HK cards for Live TV, Clean Areas and Music, and HK Frontend’s actions. The same as [Your Own Dashboard](Your-Own-Dashboard.md). A dashboard of your own links to it from the bottom of its page. |
| Setup Assistant | — | Runs the [Setup Assistant](Your-First-Screen.md#run-the-setup-assistant) again. |

## Configure on the integration

**Settings → Devices & services → HK Frontend → Configure** is only the way to
HK Settings, plus two things you may need before it works:

| Page | Setting | Default | What it does |
|---|---|---|---|
| HK Settings page | (a link) | — | Opens HK Settings. |
| HK Settings page | Show HK Settings in the sidebar | On | The same as [Advanced → Show in Sidebar](#advanced). |
| Your files | Folder (under /config) | `hk_local` | The same as Advanced → Your Files. It is served without sign-in, like `/local/`, so use a folder that holds nothing else. A folder containing Home Assistant’s own files is refused. |
| Setup check | — | — | The same report as [Setup Check](Troubleshooting.md#setup-check). Submitting it goes back. |

The integration’s page also lists each screen, pop-up, custom page and custom
chip as an item. A screen’s gear links to its page in HK Settings.
**Download diagnostics** exports every setting (birthdays and PIN hashes are
left out). Features are added from **Add feature** on the same page.

## Settings that point at your own entities

Several settings can point at helpers or sensors you make yourself. All are
optional, and each has a fallback.

| Setting | Typically points at | Left empty |
|---|---|---|
| Advanced → Time Sensor, Date Sensor | `sensor.time`, `sensor.date` (Time & Date) | Each screen’s own clock |
| General → Indoor Temperature | Any temperature sensor (an average, say) | The first thermostat’s reading |
| General → Power Use | A whole-home power sensor | No Energy chip |
| Weather → Sensors → forecasts | Template sensors over `weather.get_forecasts` | Read from the weather entity |
| Weather → Sensors → Weather Alerts | The NWS Alerts integration (HACS) | No alerts chip or card |
| Sky → Sky Switch | An input boolean | Always on |
| Sky → Advanced → Holiday Season, Moon Phase | Template sensors | Worked out from the date |
| Sky → Advanced → Also Needs | An input boolean | Only the Seasonal decorations switch decides |
| Wall Tablets → Default Idle Time | An input number | 60 seconds |
| A screen’s Tablet Room → its helpers | `input_select`, `input_number`, `binary_sensor` per room | 50-second return |
| A screen’s Cameras → Live Camera Follows | An input select set by your automation | The first camera is live |
| Advanced → Clean-Areas Script | A script that takes `areas` | The Clean Areas feature sends the vacuums |
| Advanced → Wrong-Code Indicator | An input boolean your alarm automation flashes | Refused codes are shown automatically |


## Sky / Background

Under **All Screens → Sky / Background**, choose whether the sky animates,
shows weather, or adds seasonal decorations. **Backdrop** offers Live sky,
eight curated palettes, and Custom with four Day colors and four Night colors.

A screen has the same controls under **Appearance → Sky / Background**.
Each flag follows All Screens until changed; **Use All-Screens…** restores
that relationship. Its Backdrop picker offers **Same as All Screens** or a
backdrop just for that screen. Copy Settings includes these appearance settings.
See [Live Sky](Live-Sky.md#choose-its-look) for what each switch changes.
