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
| Frost | 50% | Shown when the Glass Style is Frosted. How milky it is, 0 to 100%. |
| Tint from Background | Off | Shown when the Glass Style is Frosted. On: each card's frost takes the color of the page behind it (the sky at the card's height, the scenery's ground lower down) instead of one gray, at one darkness so white text reads the same on every page. It changes with the live sky through the day. Cards in pop-ups, the screensaver and Play Music (album art) keep the gray. Costs nothing per frame. |
| Blur | 50% | Shown when the Glass Style is Blur or Blur Each Card. How strong the blur is, 0 to 100%: 50% is 20 px, 100% is 40 px. |
| Page Pills | Default | Every page pill: the pills in a screen’s Scenes row that open a page. Tap one to set its name, icon and color, the same on every screen ([Home Page](Home-Page.md#scenes-and-page-pills)). |

A card can stay out of the shared blur with `glass: false`. Whether tapping an
accessory opens an HK detail sheet is **HK Detail Sheets**, under
[Library → Accessories](Accessories.md#accessories-settings).

## One screen

**Screens → (a screen) → Appearance.**

| Setting | Default | What it does |
|---|---|---|
| Glass Style | Same as All Screens | **Same as All Screens** (the row says *Same as All Screens* under its name, and the glass it follows, *Clear*), or under **Just This Screen** **Clear**, **Frosted**, **Blur** or **Blur Each Card**. See [Appearance](#every-screen) for what each looks like. |
| Frost / Blur | Same as All Screens | Shown for the amount this screen’s glass uses. Moving it gives this screen its own amount. |
| Reset to All Screens (50%) | — | Shown once the screen has its own amount, with All Screens’ amount. Goes back to following All Screens. |
| Tint from Background | Same as All Screens | Shown when this screen uses Frosted. Turning it on or off gives this screen its own; **Reset to All Screens** goes back to following All Screens. |
| Sky / Background | On | The screen’s [Sky / Background](Live-Sky.md#choose-its-look) page, which starts with its **Live Sky** switch. Reads **Off** when the live sky is off: a plain background instead of the animated sky. A YAML screen’s sky comes from its YAML; Live Sky can only turn it off. |

## Home Assistant header & sidebar

**Screens → (a screen) → Header → Home Assistant Header & Sidebar.** Whether
Home Assistant’s own header and sidebar show around the screen. The row reads
**Off**, **Both Hidden**, **Header Hidden**, **Sidebar Hidden** or **Kiosk
Mode Plugin**.

![A screen's Header & Sidebar page in HK Settings](images/settings-header-sidebar.png)

| Setting | Default | What it does |
|---|---|---|
| Hide Header & Sidebar | Off (Wall Tablet, Car and Energy Display presets: on) | The whole window is the screen. HK Frontend does it itself, on any screen, an existing dashboard too. The menu’s Home Assistant section still reaches Home Assistant (Show Menu). The settings below show only while it is on. |
| Hide Header | On | Hides Home Assistant’s header: the bar with the dashboard’s name, its views and its menu. |
| Hide Sidebar | On | Hides Home Assistant’s sidebar. |
| For Admins Too | On | Off: someone signed in as an admin still sees them. |
| Use the Kiosk Mode Plugin Instead | Off | *A generated screen, where [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) is installed from HACS.* The plugin hides them instead, with its own **Kiosk Mode Options**: Hide Header, Hide Sidebar, Show Header for Admins, and any other of its options in YAML. A screen that had Kiosk Mode Options of its own before 1.3 moves over to these settings when they can say the same (hiding the header, the sidebar, and admins seeing both), and otherwise keeps the plugin. |

Leaving the screen, for Settings say, always brings them back. `?hk_kiosk=off`
on a screen’s address shows them until the page is reloaded (a tablet you are
working on).
