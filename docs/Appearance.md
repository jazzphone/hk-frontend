# Appearance

How the glass looks, for every screen and for one screen, and whether Home
Assistant’s header and sidebar show.

## Every screen

**All Screens → Appearance.** How the glass looks on every screen that doesn’t
choose its own.

![The Appearance page in HK Settings](images/settings-appearance.png)

| Setting | Default | What it does |
|---|---|---|
| Glass Style | Clear | How pills, tiles, chips, scenes and keypads look: **Clear**, the original glass, with the status chips blurring what’s behind them. **Frosted**, a frosted material with no blur: it costs a tablet nothing per frame. **Blur**, what’s behind the glass blurred as one shared layer, so wall tablets keep their frame rate. **Blur Each Card**, every surface blurs what’s behind it: for phones, iPads and computers, too heavy for a wall tablet. |
| Frost | 50 % | Shown when a screen uses Frosted. How milky it is, 0 to 100 %. |
| Blur | 50 % | Shown when a screen uses Blur or Blur Each Card. How strong the blur is, 0 to 100 %: 50 % is 20 px, 100 % is 40 px. |
| HK Detail Sheets | On | Tapping an accessory’s name opens a Home app–style detail sheet (a slider, the thermostat, the player, a graph). Off: Home Assistant’s own more-info dialog. Either way, locks, the alarm, garage doors and thermostats never change from a single tap. |

A card can keep Home Assistant’s dialog with `detail: false` in its YAML, and a
card can stay out of the shared blur with `glass: false`.

## One screen

| Setting | Default | What it does |
|---|---|---|
| Glass | Same as All Screens | **Same as All Screens**, or for this screen only **Clear**, **Frosted**, **Blur** or **Blur Each Card**. See [Appearance](#every-screen) for what each looks like. |
| Frost / Blur | Same as All Screens | Shown for the amount this screen’s glass uses. Moving it gives this screen its own amount. |
| Use All-Screens Frost / Blur | — | Shown once the screen has its own amount. Goes back to following All Screens. |
| Live Sky | On | Off: a plain background instead of the animated sky. A YAML screen’s sky comes from its YAML; this can only turn it off. |
| Hide Home Assistant Header & Sidebar | Off (Wall Tablet and Car presets: on) | The whole window is the screen. HK Frontend does it itself, on any screen, an existing dashboard too. The menu’s Home Assistant section still reaches Home Assistant (Show Menu). |
| Header & Sidebar | Both Hidden | *With the switch above on.* See below. |

**Header & Sidebar**

![A screen's Header & Sidebar page in HK Settings](images/settings-header-sidebar.png)

| Setting | Default | What it does |
|---|---|---|
| Hide Header | On | Hides Home Assistant’s header: the bar with the dashboard’s name, its views and its menu. |
| Hide Sidebar | On | Hides Home Assistant’s sidebar. |
| For Admins Too | On | Off: someone signed in as an admin still sees them. |
| Use the Kiosk Mode Plugin Instead | Off | *A generated screen, where [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) is installed from HACS.* The plugin hides them instead, with its own **Kiosk Mode Options**: Hide Header, Hide Sidebar, Show Header for Admins, and any other of its options in YAML. A screen that had Kiosk Mode Options of its own before 1.3 moves over to these settings when they can say the same (hiding the header, the sidebar, and admins seeing both), and otherwise keeps the plugin. |

Leaving the screen, for Settings say, always brings them back. `?hk_kiosk=off`
on a screen’s address shows them until the page is reloaded (a tablet you are
working on).
