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
| Hide Home Assistant Header & Sidebar | Off (Wall Tablet and Car presets: on) | *Generated.* The whole window is the screen. Needs Kiosk Mode from HACS. The menu’s Home Assistant section still reaches it (Show Menu). |
| Kiosk Mode Options | Default | *Generated, with the switch above on.* See below. |

**Kiosk Mode Options**

| Setting | Default | What it does |
|---|---|---|
| Hide Header | On | Hides Home Assistant’s header. |
| Hide Sidebar | On | Hides Home Assistant’s sidebar. |
| Show Header for Admins | Off | Administrators still see the header. |
| Options in YAML | None | Any other [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) option. Only what you write changes; `key: null` removes a key from the tuned setup. |
| Use the Tuned Setup… | — | Shown once anything is changed. Clears every change. |
