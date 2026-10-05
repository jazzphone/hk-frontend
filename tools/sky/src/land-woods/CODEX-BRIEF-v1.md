> **Superseded by CODEX-BRIEF-v2.md** (2026-10-04): v1's wide redraw came out far too close. v2 edits the existing screensaver landscapes in place.

# Codex task: the forecast screensaver as a wide view of the dashboard woodland (v1, 2026-10-04)

## What this is for

HK Frontend is a Home Assistant frontend for wall tablets. Behind every
dashboard it draws a **live sky** (a gradient that follows the real sun, the
sun and moon, realistic clouds, rain, snow, fog), and with **New Decorations**
a **woodland** in front of it: two big trees framing the screen at the left
and right edges, a valley with distant hills between them, and each holiday's
props in and under the trees (Halloween lanterns and pumpkins, Christmas bulbs,
café lights, birthday presents). That art is in
`tools/sky/src/near/<theme>-v1-src.png` (1586 × 992), and it is good.

The **forecast screensaver** shows the same live sky full-screen, with a big
clock, today's weather and a forecast band over it — and under the sky, a
landscape. Today that landscape is a *different place*: an open meadow with a
line of trees (`tools/sky/src/land/`, see `reference/current-screensaver-*.png`).
It does not match the woodland, so the screensaver and the dashboards feel
like two unrelated scenes.

**Your job: redraw the screensaver's landscape as a WIDE VIEW OF THE SAME
WOODLAND** — the same place as the dashboard art, the camera pulled back. The
same two trees (same species, bark, ivy, branch shapes, the same props hanging
in the same branches), the same valley and hills between them, the same
ground — but seen from further away, so the whole of both trees is in view,
trunks and roots and all, with more valley, meadow and sky between them.
Someone who sees the dashboard and then the screensaver should recognise the
dashboard as a close-up of the screensaver: **lined up**, one place.

## Look at these first

- `tools/sky/src/near/<theme>-v1-src.png` — the dashboard woodland for each
  theme (summer, fall, winter, spring, halloween, christmas, july4, birthday).
  **This is the place.** Also `halloween-lanterns-v1-src.png` /
  `halloween-lanterns-lit-v1-src.png` / `halloween-lit-v1-src.png`,
  `christmas-lit-v1-src.png` and `lighting-artwork-v1.md` (how its lights were
  made).
- `tools/sky/src/land-woods/reference/` (this folder): renders of today's
  screens — the dashboard woodland on a desk and a tablet (summer, Halloween,
  birthday) and today's screensaver.
- `tools/sky/src/land/` and `hk_house/docs/CODEX-PROMPT-FORECAST-LANDSCAPES.md`
  — today's screensaver art and the brief it was made to. Its **layout rules
  still hold** (below); its scene does not.
- `tools/sky/src/clouds/reference/` — Apple Weather screenshots: the feel of
  sky + land we are after. Style references only.

## The scene, wide

- **Composition**: the left tree's trunk and crown in roughly the left 20–30%
  of the width, the right tree's in the right 20–30%, both whole (crowns
  allowed to run off the top edge and the outer edges, as in the dashboard
  art), standing on the same ground. Between them, the open valley: the
  meadow or path in front, the forest and the rolling hills behind, fading
  into haze — the dashboard art's middle, wider.
- **The props, where the dashboard has them**: Halloween's lanterns hanging in
  the same branches and its jack-o'-lanterns at the trees' feet; Christmas's
  strings of bulbs on the same branches; the café lights strung between the
  trees (summer, Fourth of July, birthday — as in those dashboard images); the
  birthday's presents at the right tree's foot and the mossy rock at the left.
  Smaller, because further away, but the same objects in the same relation to
  their trees.
- **Same geometry in every image**: one place. The trees, hills, ground and
  props stay put across all themes and lights; only foliage (green, autumn,
  bare and frosted, blossom), snow, the holiday props and the light change.
- **Style**: the dashboard art's — photoreal natural, crisp, real bark, leaves,
  grass and snow, atmospheric perspective. Not cartoon, not painterly.

## What to make

**24 landscapes: 8 themes × 3 lights** (day, dusk, night), each
`land-woods-<theme>-<light>-src.png`:

| theme | based on (the dashboard art) | season of the trees | props |
|---|---|---|---|
| `spring` | `spring-v1-src.png` | spring blossom | — |
| `summer` | `summer-v1-src.png` | full summer green | café lights (unlit by day) |
| `fall` | `fall-v1-src.png` | autumn color | — |
| `winter` | `winter-v1-src.png` | bare, frost and snow | — |
| `halloween` | `halloween-v1-src.png` | autumn, as Halloween's | lanterns in the trees, jack-o'-lanterns at their feet (candles unlit by day) |
| `christmas` | `christmas-v1-src.png` | winter, as Christmas's | bulbs on the branches (unlit by day) |
| `july4` | `july4-v1-src.png` | summer, as the Fourth's | bunting/flag and café lights as in its art |
| `birthday` | `birthday-v1-src.png` | summer, as the birthday's | presents at the right tree's foot, mossy rock at the left, café lights |

And **10 lights layers**, `land-woods-<theme>-<light>-lights.png`, for the
themes whose lights glow after dark: `halloween`, `christmas`, `summer`,
`july4`, `birthday` × `dusk`, `night`. Each is the **glow alone** (candle
flames and their warm light on the leaves and ground, a lit bulb's core and
halo) on full transparency, pixel-aligned with its landscape, so the page can
fade it in and flicker or twinkle each light on its own. In the landscapes
themselves the lights are **unlit** (dark candles, dark bulbs) — the lights
layer is what lights them.

## Light (match the live sky behind it)

As in `CODEX-PROMPT-FORECAST-LANDSCAPES.md`:

- **day** (sun high): sky `#0d2f57 → #154272 → #256192 → #5b93b8`, horizon
  haze `#6f9dbc`. Neutral daylight from high above, soft shadows toward the
  viewer, no strong side.
- **dusk** (sun just behind the far hills): sky `#141f3d → #26314f → #5c4460 →
  #b06a4a`. Backlit and **symmetric** (the same image serves sunrise at the
  left and sunset at the right): a warm rim along ridges and crowns, purple
  shadows `#4a3552`, the far hills dusky mauve.
- **night** (moonlight): sky `#04070f → #060a16 → #0a0f1f → #111726`. Low
  values, ground `#0a0f1f`–`#1b2440`, cool moonlit edges on the crowns and
  snow only. No artificial light except in the lights layers.

## Layout on the 2560 × 1600 canvas (text sits on top — this matters)

- **The sky is yours to leave empty.** Everywhere that is sky — above the hills
  and between and around the crowns — is **fully transparent** (alpha 0): the
  live sky, sun, moon and clouds show there. The middle of the top half must be
  open sky: **x 900–1660 is transparent for y < 700** (the moon and clouds
  live there). The crowns may fill the top corners.
- **Top-left (x < 1150, y < 700) holds a big white clock and date.** Whatever
  is there — the left tree's crown — must be **dark and calm** behind it: shaded
  foliage, no bright sunlit leaves, no lantern or bulb in that box.
- **The far hills' ridge** at about y = 760–900, the **valley floor / horizon**
  at about y = 940–1000 (58–62% height).
- **The bottom 26% (y > 1180) is the forecast panel's place**: calm and
  low-contrast — grass, path or snow in soft shadow, darker toward the bottom
  edge. No bright, busy or lit detail there (no pumpkin, present or bulb below
  y = 1180).
- **Portrait crop**: upright tablets show the **centre 1000 px** of the width.
  It must still be a good picture: the valley and a hint of both trees.
- **Edges**: the silhouette against the sky (crowns, ridges) has clean, soft,
  anti-aliased alpha, no halo of any color (the sky behind goes blue → orange →
  near-black). A gentle haze band along the far hills (alpha 0.15–0.35, tinted
  to the light) so the land melts into the sky.
- Rain and snow are drawn **in front**; on overcast days the page darkens the
  art by up to 35%. Keep midtones healthy.

## Alignment rules (the page cross-fades between these)

1. **Within a theme**, the three lights have **byte-identical alpha**: make the
   scene once, relight it, copy the day alpha onto dusk and night.
2. **Across themes**, the geometry is the same place: hills, ground, trunks
   and branches identical; outlines may differ only where foliage, snow or a
   holiday prop genuinely changes them (say where in `notes`).
3. A **lights layer** lines up with its landscape to the pixel.
4. **`birthday`** also gets `land-woods-birthday-front-mask.png`: a grayscale
   mask (white = in front) of **the presents and the mossy rock** (and the
   grass in front of them), identical for all three lights — the page draws
   balloons rising from behind them. Report in `DONE.json` a ground point
   behind the presents and one behind the rock where a bunch of balloons'
   ribbons can end (`balloon_anchors`).

## Format

PNG, **RGBA, 2560 × 1600, 8-bit, sRGB**, straight (not premultiplied) alpha;
the RGB under semi-transparent edge pixels is the land's own nearby color (no
black or white matte). If your tool can't make transparency, render over a
chroma color absent from the scene and matte it out; check the edges over
`#9fc3dc` and `#05070e`.

## It must NOT contain

Any sky, sun, moon, stars, clouds, rain, snow falling, fog banks or birds;
water that would reflect the sky; people, animals, buildings, roads, vehicles,
power lines; text, logos, signatures or watermarks. Original work, not a real
identifiable place or anyone's photograph.

## Where to save

Only in this folder: `custom_components/hk_frontend/tools/sky/src/land-woods/`

- the 24 landscapes and 10 lights layers, named as above; the birthday mask;
- `contact-sheet.png`: 8 rows (themes) × 3 columns (lights), each over its
  sky gradient, 640 × 400 per cell, lights layers on for dusk/night;
- `contact-lineup.png`: for each theme, the dashboard art beside its new wide
  view at the same height, the dashboard's frame outlined on the wide view —
  to show they line up;
- `notes-v1.md`: how you made them, and anything that breaks a rule above, and
  why;
- **`DONE.json`, written LAST** (atomically: `DONE.json.tmp`, then rename), only
  when everything is finished and checked. Its appearance is the signal; the
  other side is watching for it. If you stop before finishing, write
  `PARTIAL.json` instead, same schema.

```json
{
  "version": 1,
  "task": "hk-forecast-woodland",
  "files": [
    {"name": "land-woods-summer-day-src.png", "theme": "summer", "light": "day", "kind": "land",
     "width": 2560, "height": 1600, "mode": "RGBA", "sha256": "..."},
    {"name": "land-woods-halloween-night-lights.png", "theme": "halloween", "light": "night", "kind": "lights",
     "sha256": "...", "lights": [{"x": 412, "y": 610, "r": 18, "kind": "candle"}]}
  ],
  "balloon_anchors": {"presents": [0, 0], "rock": [0, 0]},
  "checks": {
    "sky_transparent": true,
    "centre_top_open": true,
    "clock_box_calm": true,
    "forecast_band_calm": true,
    "alpha_identical_across_lights": true,
    "same_place_across_themes": true,
    "lights_layers_aligned": true,
    "no_text_or_watermark": true,
    "edges_checked_light_and_dark": true
  },
  "notes": "..."
}
```

List every file. List **every light** in its lights layer (centre, core radius,
`candle` or `bulb`). Every check must be true; if one cannot be, say why in
`notes` instead.

## Before writing DONE.json, check with a script (not by eye)

- all 24 + 10 + 1 files exist, 2560 × 1600 RGBA (the mask: L);
- alpha identical across each theme's three lights;
- alpha 0 for x 900–1660, y < 700; nothing lit or bright in x < 1150, y < 700;
  nothing lit below y = 1180;
- each lights layer is transparent wherever its landscape is;
- the contact sheets exist.

## Rules

Only create files inside `tools/sky/src/land-woods/`. Do not edit, move or
delete anything else; do not change any code; do not commit or run git
commands that change anything. Don't create `DONE.json` early, and don't
delete it once written (if you redo work, write it again when finished).
