# Codex task v6: holiday screensaver art — the season lands, decorated like the dashboards (2026-10-05)

Read all of it before starting.

## 1. The task

The forecast screensaver draws one of 12 **season landscapes** under a live
sky: `tools/sky/src/land/land-<season>-<light>-src.png` (spring, summer, fall,
winter × day, dusk, night; 2560 × 1600 RGBA). They are final and liked —
**do not change them**.

On holidays and special occasions the dashboards decorate their woodland
(`tools/sky/src/near/<theme>-v1-src.png`). The screensaver should show **the
same decorations**, on its own land. Your job: make each occasion's
screensaver art as **its season land plus that occasion's decorations, and
nothing else**. Start from the season files; do not use or edit the old
holiday art in `tools/sky/src/land-holiday/` (it is only there to show sizes
and where props once stood).

## 2. The place (measured on the season lands)

- Two trees at the centre, in the middle distance: **left trunk centred at
  x ≈ 1240, right at x ≈ 1545**, both meeting the ground at **y ≈ 990**;
  crowns from y ≈ 610 down, spanning about x 1050–1750.
- Meadow from y ≈ 990 down. The **forecast card covers everything below
  y ≈ 1030** on every screen: **nothing you add may reach below y = 1040**,
  and the meadow under the card must stay as it is.
- **Clock box x < 1150, y < 700:** add nothing bright there.
- **Top 34% (y < 544):** transparent, untouched.
- **Portrait crop:** the centre 1000 px (x ≈ 780–1780) shows on upright
  tablets — the decorations should mostly sit in it.

## 3. The decorations — the dashboards', at this distance

**Sizes are part of the brief** (an earlier attempt made every prop so small it
could not be seen). These are on-canvas sizes at 2560 × 1600:

### Halloween — base **fall**, files `land-halloween-{day,dusk,night}-src.png`

As `near/halloween-v1-src.png` and `near/halloween-lanterns-v1-src.png`:
- **4 carved jack-o'-lantern lanterns hanging on short dark cords** from the
  two trees' lower branches, 2 per tree, at about y 760–900; each lantern
  **38–48 px wide**, clearly a carved pumpkin.
- **4 jack-o'-lanterns on the ground** at the trees' feet (2 per tree, beside
  the trunks), **45–70 px wide**, sitting *in* the grass with a soft contact
  shadow, bottoms no lower than y = 1035.
- By day the candles are dark (carved faces visible). At dusk and night the
  land shows them dark too; the glow goes in the lights layer (§5).

### Christmas — base **winter**, files `land-christmas-{day,dusk,night}-src.png`

As `near/christmas-v1-src.png`:
- **Strings of warm-white bulbs** draped through both crowns, following the
  branches, bulbs **5–7 px**; unlit in the land (glass and wire visible).
- **The snowman with a red scarf and carrot nose**, standing just right of the
  **right** tree's foot (around x 1600–1680), **about 110–130 px tall**,
  banked in snow.
- **Three presents** at the right tree's foot in front of the snowman: a
  kraft-paper box with a red ribbon and bow, a red box with white spots and a
  silver ribbon, a second kraft box with a red bow; **each 35–55 px wide**,
  sitting *in* the snow.

### Fourth of July — base **summer**, files `land-july4-{day,dusk,night}-src.png`

As `near/july4-v1-src.png`:
- **Red-white-blue bunting fans** on a cord swung between the two trees at
  about y 870–930, **each fan 55–75 px wide**, 3–4 fans.
- **A US flag on a pole** just right of the right tree, the flag **70–90 px
  wide**, the pole rising from the grass.
- **A string of café-light bulbs** between the trees above the bunting, bulbs
  **6–8 px**, unlit in the land.
- **White hydrangeas and red flowers** in small clumps at both trees' feet,
  **clumps 40–70 px wide**, growing from the grass.

### Birthday — any season, overlays `birthday-props-{day,dusk,night}-src.png`

A birthday can fall in any season, so its props are a **separate transparent
overlay** that the page lays over whichever season land is showing (as the
existing balloon overlay is). As `near/birthday-v1-src.png`:
- **A string of café-light bulbs** between the two trees (as July 4th's).
- **Three wrapped presents** at the right tree's foot, **each 35–55 px wide**,
  with a soft contact shadow drawn into the overlay.
- Fully transparent everywhere else. It must look right over **all 12** season
  lands (summer grass and winter snow alike).

The **balloons** stay as they are (`land-holiday/birthday-balloons-*`); copy
those three files unchanged into the output folder.

## 4. How to build each image (so the season stays untouched)

1. Start from the season file for that light.
2. Add the props with small, irregular, feathered masks around each prop —
   **never a rectangle** — so only the prop, its cord or stems, its own shadow
   and the grass or snow it touches change. Everything else stays within 2 per
   channel of the season file.
3. Match the land's rendering: the same softness, haze, colour grading and
   light as the trees and ground around the prop. Not crisper, brighter or
   more saturated than its surroundings.
4. Day, dusk and night of an occasion: **the same props in the same places**,
   relit (make day first, then relight those props for dusk and night).

## 5. Lights layers

`land-halloween-{dusk,night}-lights.png`, `land-christmas-{dusk,night}-lights.png`,
`land-july4-night-lights.png`, and `birthday-props-{dusk,night}-lights.png`:
the **glow alone** on full transparency, pixel-aligned with its image —
candle light in each lantern's and pumpkin's carved face with a little warm
light on the bark and grass; each bulb's bright core and small halo. List
every light (x, y, core radius r, `candle` or `bulb`) in `DONE.json`.

## 6. Stage 1 — four masters, then STOP for approval

Make **`land-halloween-dusk-src.png`, `land-christmas-day-src.png`,
`land-july4-day-src.png`** and **`birthday-props-day-src.png`**, then:

- `masters-compare.png`: for each, the season base and yours side by side —
  the whole picture at 1280 × 800 over its sky gradient (day `#0d2f57 →
  #5b93b8`, dusk `#141f3d → #b06a4a`), and every decorated area at 3×; the
  birthday overlay shown over summer-day and winter-day.
- `MASTERS-READY.json` (`{"status": "ready", "notes": "..."}`), then **STOP**
  until the owner replies "approved".

## 7. Stage 2 — only after "approved"

The other lights of each occasion (same props, relit), the lights layers,
the three balloon files copied, then:

- `land-v6/land-holiday/DONE.json`: the schema of
  `tools/sky/src/land-holiday/DONE.json` — every file with sha256, each land
  with its `"base"`, each lights layer with `"over"` and its `"lights"`, the
  balloon entries copied as they are (with `anchors`), new birthday-props
  entries with `"kind": "overlay"` — `"version": 6`, every check true.
- From `custom_components/hk_frontend/`, this must print no `PROBLEM`
  (`--check` only reads; never run it without `--check`). It covers the
  original 16 files; the new Halloween day and birthday-props files are
  checked by the owner's side:

  ```
  HK_HOLIDAY_SRC=tools/sky/src/land-v6/land-holiday ~/venvs/hk-sky/bin/python3 tools/sky/holiday_webp.py --check
  ```
- `land-v6/contact-sheet.png` (every occasion × light over its sky, lights
  on), `land-v6/notes-v6.md`.
- **`V6-DONE.json` last**, atomically: `{"version": 6, "status": "complete",
  "holiday_check": "...", "notes": "..."}`; or `PARTIAL-v6.json`.

## 8. Where things go

In the repository, create files only in `tools/sky/src/land-v6/` (scratch in
`land-v6/work/`). Your own tools' locations outside the repository
($CODEX_HOME/generated_images/, temp, caches) are fine. Change no other
repository file — not the season lands, not the old holiday art — and run no
git commands that change anything. Ignore earlier attempts (`land-woods/`,
`land-v3/`, `land-v4/`, `land-v5/`).
