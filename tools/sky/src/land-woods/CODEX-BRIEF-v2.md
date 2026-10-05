# Codex task v2: put the dashboard woodland's trees into the forecast screensaver's landscapes — seen from a distance (2026-10-04)

**This replaces `CODEX-BRIEF-v1.md`.** v1 asked for a new wide scene, and the
result was far too close (`reference/rejected-v1-far-too-close.webp`: the
trees fill the screen). **Do not make that.** Ignore `work/` from the v1 run.

## What this is for

HK Frontend draws a live sky (sun, moon, realistic clouds, rain, snow) behind
Home Assistant dashboards. Two places show landscape art under it:

1. **The dashboards** (New Decorations): a close-up woodland — two big trees
   framing the screen at the edges, the valley between them, each holiday's
   props in and under them. Art: `tools/sky/src/near/<theme>-v1-src.png`
   (1586 × 992). See `reference/dashboard-woodland-*.png`.
2. **The forecast screensaver**: the sky full-screen with a big clock, the
   day's weather and a forecast panel over it, and under the sky a landscape
   that takes **about half the screen** — a meadow, a tree line, rolling hills,
   and **a pair of trees in the middle distance at the centre**. Art:
   `tools/sky/src/land/land-<season>-<light>-src.png` (12 season lands) and
   `tools/sky/src/land-holiday/land-<holiday>-<light>-src.png` (8 holiday
   lands) plus their `-lights.png` layers, 2560 × 1600. See
   `reference/current-screensaver-lands.jpg` and
   `reference/current-screensaver-*.png`.

The screensaver's format is right and the owner likes it: half sky, half land,
the land seen **from a distance**. What is wrong: its **centre pair of trees
is not the dashboard's pair**. They should be the same two trees — the
woodland on the dashboard is the close-up, the screensaver the same trees
seen from far across the meadow, framing the valley between them.

**Your job: edit the existing screensaver images IN PLACE. Replace only the
centre pair of trees (and each holiday's props on and under them) with the
dashboard woodland's two trees, seen from a distance. Change nothing else.**

## The edit, exactly

- **Start from each existing image** and change pixels **only inside the edit
  box: x 960–1840, y 560–1060** (the current centre trees are at x ≈ 1050–1750,
  crowns topping out near y = 616, trunks meeting the ground near y ≈ 990).
  **Every pixel outside the box stays byte-identical to the source** — RGB and
  alpha. Inside the box, blend seamlessly into the existing tree line, hills,
  haze and meadow; no seam may show at the box's edge.
- **The two trunks stay where they are**: the left trunk centred at
  **x ≈ 1240**, the right at **x ≈ 1545**, both meeting the ground at
  **y ≈ 985–995** (other art is tied to those points: birthday balloons are
  knotted to the trunks). The crowns may change shape and size within the box.
- **The trees are the dashboard's** (compare `tools/sky/src/near/summer-v1-src.png`,
  `fall-…`, `winter-…`, `spring-…`): the same species and character — the
  massive ivy-clad trunks, the way the two lean and their crowns reach toward
  each other over the space between them — scaled down to the size the
  current pair has, with the same distance haze and light as the rest of the
  landscape. Seen from far away: no bark detail you couldn't see at that
  distance. Season by season, their foliage matches the dashboard's for that
  season (summer green, autumn colour, bare and frosted in winter, blossom in
  spring), and the season land's light (day, dusk, night).
- **The holiday props**, smaller and at that distance, where the dashboard
  has them, **on and under these two trees only**:
  - **Halloween** (from `land-holiday/land-halloween-*`, compare
    `near/halloween-v1-src.png` and its lanterns): lanterns hanging in the two
    trees' branches; jack-o'-lanterns at their feet (as today, y ≤ 1060).
  - **Christmas** (`land-christmas-*`, compare `near/christmas-v1-src.png`):
    strings of bulbs through the two trees' branches; today's snowman and
    presents stay as they are (they are outside the trees or move with them —
    keep them where they are unless a new branch covers them).
  - **Fourth of July** (`land-july4-*`, compare `near/july4-v1-src.png`):
    its bunting and café lights strung between the two trees.
- **The lights layers** (`land-<holiday>-<light>-lights.png`): redo each so
  its glows sit on the new lanterns and bulbs — the glow alone, on full
  transparency, pixel-aligned with its land. In the lands the lights are
  unlit (dark candles, dark bulbs); the layer lights them.

## What to deliver

Into `tools/sky/src/land-woods/` (create nothing anywhere else):

| new file | edited from |
|---|---|
| `land-woods-<season>-<light>-src.png` × 12 (spring, summer, fall, winter × day, dusk, night) | `land/land-<season>-<light>-src.png` |
| `land-woods-<holiday>-<light>-src.png` × 8 (halloween dusk, night; christmas day, dusk, night; july4 day, dusk, night) | `land-holiday/land-<holiday>-<light>-src.png` |
| `land-woods-<holiday>-<light>-lights.png` × 5 (halloween dusk, night; christmas dusk, night; july4 night) | `land-holiday/land-<holiday>-<light>-lights.png` |

Same format as the sources: **PNG, RGBA, 2560 × 1600, 8-bit, sRGB**, straight
alpha.

## Rules that still hold (from the sources' briefs)

- **Top 34% (y < 544) fully transparent.** The live sky, sun, moon and clouds
  are there. Nothing may rise into it.
- **The three lights of a season share one silhouette**: within a season (and
  within a holiday), the alpha of day, dusk and night is **byte-identical**.
- **Across seasons the trees stand in the same place** (trunks, main limbs,
  crown centres), the outline changing only with foliage and snow.
- The **forecast panel** lies over the bottom of the screen: nothing new below
  y = 1060, nothing bright or busy below y = 1180.
- The **clock** sits top-left (x < 1150, y < 700): keep anything new there
  low and dark (the left tree's crown may reach x < 1150 — keep that part in
  shade).
- **Portrait crop**: upright tablets show the centre 1000 px; the pair of trees
  is in it, as today.
- Clean, soft, anti-aliased crown edges against the sky — no halo; check over
  `#9fc3dc` and `#05070e`. No square holes in the crowns (the old art had
  some; see `tools/sky/land_webp.py` repair_alpha): any gap in a crown must
  open onto the sky.
- **Must NOT contain**: sky, sun, moon, stars, clouds, falling rain or snow,
  fog banks, birds, people, animals, buildings, text or watermarks.

## Also deliver

- `contact-sheet.png`: the 20 new lands in a grid (rows = season or holiday,
  columns = day, dusk, night), each over its sky gradient (day `#0d2f57 →
  #5b93b8`, dusk `#141f3d → #b06a4a`, night `#04070f → #111726`), 640 × 400 per
  cell, lights layers on.
- `contact-lineup.png`: for each season, the dashboard art (`near/<season>-v1`)
  beside a crop of the new land's edit box at the same height — the same two
  trees, close up and far away.
- `diff-<name>.png` for each land: where it differs from its source (white),
  so it can be seen that nothing outside the box changed.
- `notes-v2.md`: how you made them, anything that breaks a rule and why.
- **`DONE.json`, written LAST** (atomically: write `DONE.json.tmp`, rename),
  only when everything is finished and checked — the other side watches for
  it. If you stop before finishing, write `PARTIAL.json` instead.

```json
{
  "version": 2,
  "task": "hk-forecast-woodland-in-place",
  "files": [
    {"name": "land-woods-summer-day-src.png", "from": "land/land-summer-day-src.png", "kind": "land",
     "width": 2560, "height": 1600, "mode": "RGBA", "sha256": "...", "changed_box": [960, 560, 1840, 1060]},
    {"name": "land-woods-halloween-night-lights.png", "kind": "lights", "sha256": "...",
     "lights": [{"x": 1180, "y": 760, "r": 9, "kind": "candle"}]}
  ],
  "trunks": {"left": [1240, 990], "right": [1545, 992]},
  "checks": {
    "unchanged_outside_box": true,
    "top_34_percent_transparent": true,
    "alpha_identical_across_lights": true,
    "trunks_in_place": true,
    "same_trees_across_seasons": true,
    "nothing_new_below_1060": true,
    "lights_layers_aligned": true,
    "no_square_holes": true,
    "edges_checked_light_and_dark": true,
    "no_text_or_watermark": true
  },
  "notes": "..."
}
```

List every file and every light (centre, core radius, `candle` or `bulb`).
Every check must be true; if one cannot be, say why in `notes`.

## Before writing DONE.json, check with a script (not by eye)

- every pixel outside x 960–1840 / y 560–1060 equals its source exactly (RGBA);
- y < 544 is alpha 0 everywhere;
- day / dusk / night alpha byte-identical within each season and holiday;
- each lights layer is transparent wherever its land is.

## Rules

Only create files inside `tools/sky/src/land-woods/`. Do not edit, move or
delete anything else (the sources in `land/` and `land-holiday/` stay as they
are); do not change code; do not commit or run git commands that change
anything. Don't write `DONE.json` early or delete it once written.
