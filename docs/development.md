# Development

How HK Frontend is put together, how to run its tests, and how to add to it.
For using it, start with [Getting started](getting-started.md).

## Repository layout

```
custom_components/hk_frontend/     the integration HACS installs
├─ __init__.py          serves frontend/ at /hk/, registers the bootstrap modules,
│                       the settings feed and hk_frontend.show_popup; sets up
│                       each entry (the house's, or a feature's)
├─ config_flow.py       Add integration, Add feature (the features), Configure,
│                       and the items (screens, pop-ups, custom pages and chips)
├─ settings.py          the dashboard settings: their defaults, checks and feed
├─ settings_api.py      the HK Settings page's writes, checked as Configure checks them
├─ panel.py             the HK Settings page: registration and its read commands
├─ accessories.py       per-accessory settings (name, room, icon, where it shows)
├─ kinds.py             What Counts: which entities each status chip counts
├─ files.py             your files folder, served under /hk/ ahead of the bundle
├─ resources.py         adds the card files as Lovelace resources (storage mode)
├─ setup_check.py       Setup Check, and the Repairs issues
├─ themes.py            adds the HK Kiosk themes to the frontend's, and again after a reload
├─ thirdparty.py        whether WallPanel, Kiosk Mode and the radar card are ready
├─ art.py               album artwork fetched and served by Home Assistant
├─ talk.py, talk_live.py  hold-to-talk on a camera sheet
├─ switch.py, entity.py the Seasonal decorations switch
├─ rename.py            follows entity renames into the settings
├─ diagnostics.py, const.py, manifest.json, services.yaml
├─ alarm_control_panel.py, camera.py, sensor.py
│                       the features' entity platforms (each imports its feature's)
├─ features/            the optional features, one package each
│  ├─ music/  live_tv/  clean_areas/  alarm_pin/
│  └─ legacy.py         adopts entries of the old stand-alone integrations, once
├─ frontend/            everything reachable over HTTP, at /hk/
│  ├─ cards/            the Lovelace cards, one family per file; hk-strategy.js
│  │                    is the generated dashboard and the room page
│  ├─ modules/          page modules: settings, header, sky, idle, menu, glass…
│  ├─ panels/           the HK Settings page (hk-settings.js, -model, -kit, -features)
│  ├─ iconset/          hk-icons.js, the hk: iconset loader (the glyphs are the user's)
│  ├─ fonts/            sf-pro.css (the font is the user's)
│  ├─ sky/              the live sky's textures and decoration art
│  ├─ css/              hk-responsive.css
│  └─ pages/            skyprobe.html, a diagnostic page for the sky
├─ helpers/             quick_timers.yaml, an optional package
├─ theme/               hk_kiosk_theme.yaml (HK Kiosk, HK Kiosk Camera; loaded by themes.py)
├─ translations/        en.json
└─ brand/               the integration's icon
tests/                  run (JavaScript suites) and py/run (Python)
tools/                  sky/, sf_symbols/, font/, merge_translations.py, publish/
docs/                   these pages
```

Only `frontend/` and the user’s files folder are served over HTTP. Everything
else (Python, tests, tools, the theme) is unreachable from a browser by where it
lives, not by a rule.

## How the frontend loads

1. **Bootstrap modules.** `__init__.py` registers these with
   `add_extra_js_url`, so they load before any card renders, in this order:
   `hk-settings.js` (the settings every page reads at first paint),
   `hk-icons.js` (the `hk:` iconset, which must exist before the first icon
   draws), `tesla-viewport.js`, `hk-tap.js`, `hk-header.js` and
   `hk-loader.js`. Changing this list needs a Home Assistant restart; editing
   one of the files does not.
2. **Lovelace resources.** Every file in `frontend/cards/`, plus
   `fonts/sf-pro.css` and `css/hk-responsive.css`. `resources.py` adds the
   missing ones once Home Assistant has started, in storage mode only; it never
   edits or removes an entry. A new card family file is registered at the next
   start. The files load in parallel: `hk-base.js` publishes `window.hkCards`
   and fires `hk-cards-ready`, and every other card file waits for that event
   (never a poll: timers barely run in a hidden tab, which is where a wall
   tablet spends its time).
3. **The loader.** `hk-loader.js` imports the modules that have nothing to do
   before first paint: `hk-stats`, `hk-charts`, `hk-sky`, `hk-idle`,
   `hk-viewfade`, `hk-glass`, `hk-timers`, `hk-campost` and `hk-menu`. Adding
   one to its list is live on the next page load. Each module sets its
   `window.hk…` global and fires `hk-module-ready`, which redraws the cards
   waiting for it.

The HK Settings page is a custom panel at `/hk-settings`
(`frontend/panels/hk-settings.js`), registered by `panel.py`.

**`/hk/` is served with `Cache-Control: no-cache`.** Every request revalidates
(an unchanged file costs a 304), so an edited file reaches a screen on its next
load with no version numbers to bump. Home Assistant’s `/local/` caches for 31
days, which is why HK Frontend serves its own files. The user’s files folder
is answered first at the same URLs, so a file can move between it and the
bundle without any page noticing.

**Settings reach the screens live.** `hk-settings.js` subscribes to
`hk_frontend/settings/subscribe` and paints from a cached copy until the
answer arrives. A card or module never names a house’s entity: anything it
needs is a setting (a default in `settings.py`, a field on the HK Settings
page, and the same default in `hk-settings.js`).

In the browser console, `hkReload()` re-imports the loader’s modules without a
page reload (only `hk-stats` and `hk-charts` replace themselves; the rest need
a reload).

## Running the tests

### JavaScript suites

```sh
tests/run            # every suite
tests/run popup      # only the suites whose name contains "popup"
```

They run in JavaScriptCore, which ships with **macOS** (`jsc`, no Node
needed), against the files in `frontend/` with a small DOM stand-in
(`tests/dom.js`). The script works from the repository or from inside the
component. `HK_FILES=/config/hk_local tests/run` also checks a home’s own
glyph file; without it, the suites use `tests/fixtures/`.

`tests/test_editors.js` walks every registered card and holds it to the
picker and editor rules below.

### Python tests

```sh
tests/py/run                 # everything
tests/py/run -k music        # pytest arguments pass through
```

The first run builds a virtual environment at `~/.venvs/hk-ha-test` with
`pytest-homeassistant-custom-component`, so the integration is tested inside
Home Assistant’s own test harness. Each feature has its own
`test_feature_*.py` files.

## Tools

| Tool | What it does |
|---|---|
| `tools/sky/gen_sky.py` | Generates the live sky’s noise textures (clouds, stars, rain, snow, grain) in pure Python, no libraries, into `frontend/sky/`. Run it after changing a texture’s parameters; it prints each texture’s measured mean alpha, which `hk-sky.js` uses to keep the sky under its brightness cap. The decoration art’s source images are in `tools/sky/src/`. |
| `tools/sf_symbols/build_glyphs.py` | Builds a user’s `hk-glyphs.js` from the SF Symbols app, on a Mac (see its README). `manifest.json` maps every `hk:` glyph to the symbol it is drawn from; `--check <file>` compares a build with an existing file. |
| `tools/font/make_woff2.py` | Turns Apple’s variable `SF-Pro.ttf` into a woff2 about a third of the size (see its README). |
| `tools/merge_translations.py` | Merges each feature’s `translations.en.json` into `translations/en.json` (below). |
| `tools/publish/publish.py` | Builds the public repository from the component, refusing to write anything if a file contains private data (addresses, host names, tokens). `--scan` only reports. |

## Adding a card

1. **Pick its family file** in `frontend/cards/`, by what the card looks like
   and measures (a tile, a chip, a layout piece), not by what it does. A new
   family file is fine; it is registered as a resource at the next start.
2. **Extend `HkBase`** (from `window.hkCards`) inside the file’s
   `hk-cards-ready` handler. Gating, the tap rules and actions come with it.
   Implement `_render()`, build the markup once (`this._built`) and update it
   in place after that.
3. **Redraw when the inputs change, and only then.** `_sigOf()` must cover
   every entity `_render()` reads (the default covers `entity`, `entities` and
   `group`). A card that reads no entity returns `'static'`; the default
   `null` means “always render,” on every state change in the house.
4. **Glass.** Write a glass surface with `M.glass` (never a background of your
   own), and never put `backdrop-filter` on a card: the Blur look is one
   shared layer (`hk-glass.js`), and a blur per card is what slows a tablet
   down. `glass: false` in a card’s config keeps it out of the shared layer.
5. **Register it**:

   ```js
   C.register('hk-example-card', HkExampleCard, 'HK Example',
     'One plain sentence saying what it is for.',
     [ { name: 'entity', required: true, selector: { entity: {} } },
       C.section('Appearance', [ { name: 'icon', selector: { icon: {} } } ]) ],
     function (hass) { return { entity: C.firstOf(hass, 'light') }; });
   ```

   The arguments are the tag, the class, the card picker’s name (starting
   “HK ”), its description, the editor’s `ha-form` schema, and a starting
   config that names an entity the house has. Labels and help text come from
   `HK_LABELS`, `HK_HELPERS` and `HK_OPTION_LABELS` in `hk-base.js` (or a
   `label` / `helper` on the field); dropdowns use `C.selOptions(...)`, and
   `C.section(title, fields)` groups fields without changing the YAML’s
   shape.
6. **Test it.** `tests/run editors` checks the picker entry, the starting
   config and the editor; add the card’s behavior to a suite
   (`tests/card_harness.js` builds a card against a fake `hass`).

## A feature package

Each optional feature is a package under `features/` with the same shape (the
full contract is the docstring of `features/__init__.py`):

| Part | What it is |
|---|---|
| `PLATFORMS` | The entity platforms its entries forward to. Each needs a one-line module at the component’s top level (`camera.py`, `sensor.py`…) that imports the feature’s `async_setup_entry`. |
| `async_setup(hass)` | Called once at start, whether or not the feature is added: registers its actions and websocket commands, so a call made before it is added gets a clear error, and HK Settings can ask what it has. |
| `async_setup_entry`, `async_unload_entry` | Its entry’s life. |
| `FlowSteps` | Its config-flow steps, mixed into the integration’s flow. Every step id starts with the feature’s kind (`alarm_pin_…`). |
| `options_flow(entry)` | Its Configure. |
| `subentry_types(entry)` | Its items (Music’s presets and playlists), or `{}`. |
| `settings_ws.py` | The commands its HK Settings page reads and saves through, checked the same way as Configure and stored in the same place. |
| `translations.en.json` | Its strings, as a fragment of `translations/en.json`. |

An entry’s `data["kind"]` says which feature it is; the house’s own entry has
no kind. Music, Live TV and Clean Areas allow one entry per house; Alarm PIN
one per protected alarm.

To add a feature: add its kind to `KINDS` and `TITLES` in
`features/__init__.py`, mix its `FlowSteps` into the flow class in
`config_flow.py`, add its menu option under `config.step.feature` in its
translations, add it to `COMPANIONS` in `setup_check.py` (Setup Check and the
HK Settings Features list read it), and give it a page in
`frontend/panels/hk-settings-features.js`.

**Translations.** Home Assistant reads only `translations/en.json`. After
changing a feature’s `translations.en.json`, run:

```sh
python3 tools/merge_translations.py
```

It deep-merges every feature’s fragment into `translations/en.json` and
reports any key two fragments both set. Strings people read use US spelling
and typographic apostrophes (’); never put a `<` in one.
