# Codex task v3: the forecast screensaver — the dashboard woodland, seen from far away (2026-10-04)

Read all of this before you start. It is long because earlier attempts failed
in specific ways, and each rule below exists to prevent one of them.

## 1. The idea, in one paragraph

HK Frontend's dashboards show a woodland (**the dashboard art**:
`tools/sky/src/near/<theme>-v1-src.png`): two huge old ivy-clad trees framing
the screen at its left and right edges, standing at the brink of a valley,
with forested hills beyond and each holiday's things in and under them. The
**forecast screensaver** shows a landscape under a live sky. **The
screensaver must be that same place, seen from far away** — as if you had
walked a long way back across the meadow, or were approaching the woodland
from a distance: across an open meadow in the foreground, **the same two
trees** stand in the middle distance, small, whole from roots to crown, side
by side at the centre of the picture, with the valley and the forested hills
behind and around them — the same hills that the dashboard shows through the
gap between its trees. Someone who looks at the screensaver and then at a
dashboard should feel they have walked up to those two trees.

## 2. What you are making, and what you are NOT doing

You are drawing **new** screensaver landscapes — 12 season images (4 seasons ×
day, dusk, night) and from them 8 holiday images and 5 lights layers — in the
**exact format** of today's screensaver art, so they drop into the existing
pipeline with no changes to code.

You are **NOT**:

- **editing the existing screensaver images.** Earlier attempts pasted new
  trees onto the old meadow: the ground under them never matched, and the
  trees stood on rectangular pedestals of different grass, or floated, or
  looked cut out. **Do not paste trees onto any existing ground. Each season
  image is drawn as one whole picture**, trees and ground together.
- **drawing a close-up.** `tools/sky/src/land-woods/reference/rejected-v1-far-too-close.webp`
  shows a rejected attempt: the trees fill the screen. Wrong. The trees are
  **small and far away**, as today's screensaver trees are.
- **changing the dashboard art** (`near/`), the existing screensaver art
  (`land/`, `land-holiday/`), or any code.
- **using** anything in `tools/sky/src/land-woods/work*`,
  `tools/sky/src/land-woods/rejected-v2.1/`, or the `land-woods-*.png` files —
  except where §4 names one as a size reference.

## 3. Look at these first

| what | where | use it for |
|---|---|---|
| the dashboard art — **the place** | `tools/sky/src/near/{spring,summer,fall,winter,halloween,christmas,july4}-v1-src.png` | the two trees (species, ivy-clad trunks, branch shapes, how they lean toward each other), the valley and hills behind them, each season's foliage, each holiday's props |
| the dashboard on real screens | `tools/sky/src/land-woods/reference/dashboard-woodland-*.png` / `.webp` | how the place looks in use |
| **today's screensaver art — the format** | `tools/sky/src/land/land-<season>-<light>-src.png`, `tools/sky/src/land-holiday/` | the layout to keep: half sky, half land; horizon height; the calm foreground; the dark clock corner; how holidays decorate a season |
| today's screensaver on screen | `tools/sky/src/land-woods/reference/current-screensaver-*.png`, `current-screensaver-lands.jpg` | the framing the owner likes |
| its original brief | `hk_house/docs/CODEX-PROMPT-FORECAST-LANDSCAPES.md` | the light colours and edge rules (repeated in §6) |
| Apple Weather | `tools/sky/src/clouds/reference/*.webp` | the feel of sky over land |

## 4. The picture — exact layout on the 2560 × 1600 canvas

Pixel positions are fixed because code places things on this art (birthday
balloons beside the trunks, the lights, the clock and forecast text over it).

**The viewer** stands in the open meadow, roughly 150–250 m from the two trees,
eye height about 1.7 m. Lens: normal (≈ 40–50 mm equivalent). No fisheye, no
wide-angle distortion.

From top to bottom:

1. **Sky — y < 544: alpha exactly 0.** Transparent; the live sky shows there.
   Nothing may rise into it — no crown, no ridge.
2. **The far hills — ridge at y ≈ 620–760** (may rise to y ≈ 580 at the far
   left and right thirds only), fading into haze: the forested hills and
   valley the dashboard shows between its trees, here seen whole. Below the
   ridge, a semi-transparent haze band (alpha ≈ 0.15–0.35, tinted to the
   light) so the land melts into the sky.
3. **The woodland edge — y ≈ 760–990:** a band of forest across the width
   (the woodland the two big trees belong to), lower and softer toward the
   edges of the picture. **In the middle, the two trees stand in front of it,
   at its brink**, with the valley opening behind them.
4. **The two trees — the dashboard's pair:**
   - **Left trunk**: centre at **x = 1240**, where it meets the ground at
     **y = 990**. **Right trunk**: centre at **x = 1545**, meets the ground at
     **y = 992**. Each within ±8 px. Trunk width at the base ≈ 40–60 px.
   - Crown tops at about **y = 600–660**; the two crowns together span about
     **x = 1040–1760**. They lean toward each other and their crowns reach
     across the space between them, as on the dashboard — the gap between
     the trunks is where the dashboard's view of the valley was.
   - Whole trees: root flare, trunk, limbs, crown. Small, so: the right
     amount of detail for 200 m away — the same softness and atmospheric
     haze as the forest just behind them. Not crisper, more saturated or
     more contrasty than their surroundings.
5. **The meadow — y ≈ 990 to the bottom:** open grass (snow in winter),
   continuous from edge to edge, getting nearer and a little darker toward
   the bottom. A faint, low-contrast trodden path may wind through it toward
   the gap between the two trees. Nothing else in it.

**Keep clear and calm** (text is drawn over these):

- **Clock corner — x < 1150, y < 700:** a large white clock and date sit
  there. Whatever is behind it (hills, the edge of the left crown) must be
  dark, low-contrast and calm. No bright foliage, no prop.
- **Forecast panel — y > 1180:** low-contrast meadow, darker toward the
  bottom edge. No flowers, rocks, props or bright detail.
- **Portrait crop — the centre 1000 px (x ≈ 780–1780):** upright tablets
  show only this. Both trees are in it; it must be a good picture on its own.

**Size reference only:** `tools/sky/src/land-woods/land-woods-summer-day-src.png`
has the two trees at roughly the right size and position (from an earlier
attempt — look at their scale and placement only; their ground is wrong and
everything else there is to be ignored).

## 5. How a tree must meet the ground (the failure to avoid)

Every earlier attempt failed here. A tree is **planted**:

- the ground **overlaps the bottom of the trunk**: grass blades (or snow)
  come up in front of the root flare, so the trunk disappears *into* the
  ground rather than stopping on top of it;
- a soft **contact shadow** under and beside the trunk, matching the light
  (short and under the tree by day; long and toward the viewer at dusk;
  barely visible at night);
- the meadow's texture, colour and brightness **continue unbroken** through
  the area around the trunk — no patch of different grass, no straight
  edge, no rectangle, no change of grain, no lighter or darker box;
- in winter, snow banks gently against the trunk; in fall, a few fallen
  leaves at its foot are fine.

**This can only come out right if the tree and the ground are drawn in the
same picture.** That is why you generate each master as a whole image (§7).

## 6. Light, colour and edges

Match the live sky drawn behind the art:

- **day** (sun high): sky `#0d2f57 → #154272 → #256192 → #5b93b8`, horizon
  haze `#6f9dbc`. Neutral daylight from high above, soft short shadows toward
  the viewer, no strong left or right direction.
- **dusk** (sun just behind the far hills): sky `#141f3d → #26314f → #5c4460
  → #b06a4a`. Backlit and **symmetric** (the same image serves sunrise and
  sunset): a warm rim along the ridges and crowns, long shadows toward the
  viewer, purple shadows `#4a3552`, the far hills dusky mauve.
- **night** (moonlight): sky `#04070f → #060a16 → #0a0f1f → #111726`. Low
  values; ground `#0a0f1f`–`#1b2440`; cool moonlit highlights on the crowns
  and snow only. **No artificial light** in the land images.

The silhouette against the sky (ridges, crowns) has clean, soft,
anti-aliased alpha with **no halo or fringe** — check it over `#9fc3dc` and
over `#05070e`. **No enclosed transparent holes** in the crowns: every gap in
a crown must open onto the sky. Straight (not premultiplied) alpha; the RGB
under semi-transparent edges is the land's own nearby colour.

Style: photoreal and natural, like the dashboard art and today's screensaver
art. Not painterly, not cartoon, not a 3D render. Must NOT contain: sky, sun,
moon, stars, clouds, falling rain or snow, fog banks, birds, water that
reflects the sky, people, animals, buildings, fences, roads, vehicles, power
lines, text, logos, signatures or watermarks.

## 7. The steps, in order — with a gate after each

### Step A — one master: `land-summer-day-src.png`

1. Generate the **whole land** of the summer day picture as **one image**
   (sky left empty or a flat chroma colour to matte out), composed exactly as
   §4: meadow, the two dashboard trees at the brink, the woodland edge, the
   hills. Generate at your native size and resample to 2560 × 1600, or
   compose so the result lands exactly on the §4 positions; then matte the
   sky to alpha 0.
2. Measure the two trunk-to-ground points; they must be at (1240, 990) and
   (1545, 992) ± 8 px. If not, regenerate or re-frame the **whole image** —
   never move the trees by cutting and pasting.

**Gate A** (all must hold, else redo Step A):
- the land check (§9) passes for this one file's rules: 2560 × 1600 RGBA,
  y < 544 alpha 0;
- the trunk points are within ±8 px;
- `contact-feet-master.png`: 3× crops of both feet (x 1170–1310 and
  1475–1615, y 940–1030) beside the same crops of
  `tools/sky/src/land/land-summer-day-src.png` — every §5 point holds, and you
  have written down why for each foot in `notes-v3.md`;
- a 1280 × 800 downscale over the day sky gradient looks like today's
  screensaver framing — half sky, half land, small distant trees — and
  **not** like the rejected close-up.

**You may attempt Step A at most 3 times.** If no attempt passes Gate A,
**stop**: deliver your best master, `contact-feet-master.png` and
`notes-v3.md`, write `PARTIAL-v3.json` (§10), and do nothing else. Do not
continue with a master that fails.

### Step B — the other 11 season images

From the master, make `land-<season>-<light>-src.png` for spring, summer,
fall, winter × day, dusk, night. **Same geometry**: hills, ground, path,
trunks and main limbs identical; only foliage, snow, the season's colour and
the light change. Use structure-preserving image-to-image / relighting from
the master — do not generate new scenes.

- Seasons follow the dashboard art for that season: spring blossom (white and
  pink, as `near/spring-v1`), full summer green, autumn colour (as
  `near/fall-v1`), winter bare and frosted with snow on the ground and
  branches (as `near/winter-v1`).
- **Within a season, the alpha of day, dusk and night is byte-identical**
  (make the day image, relight it, copy its alpha to the other two).
- Across seasons the outline changes only where foliage or snow changes it.

**Gate B**: the land check (§9) passes for all 12; `contact-feet.png` (3×
crops of both feet in all 12) shows every §5 point in every image. If one
image fails, redo that image; if a whole season fails twice, stop and write
`PARTIAL-v3.json`.

### Step C — the holidays: decorate, don't redraw

Each holiday image is **its base season image with the holiday's things
added, and nothing else changed** — every pixel outside the things you add
(and their own shadow and contact with the ground) stays within 2 per channel
of the base. Add each thing with a small, irregular, feathered mask around
it; **never a rectangle**. A thing standing on the ground is drawn in contact
with it (its own small shadow, grass or snow overlapping its base), exactly
as §5 asks of the trees. Nothing new below y = 1060. Keep everything in §4's
calm areas calm.

The things are the dashboard's, seen from far away, where the dashboard has
them:

| file | base | add |
|---|---|---|
| `land-halloween-dusk-src.png`, `land-halloween-night-src.png` | fall dusk, fall night | as `near/halloween-v1` (and `near/halloween-lanterns-v1`): **4 carved lanterns** hanging from the two trees' lower branches (2 per tree); **4 jack-o'-lanterns** on the ground at the two trees' feet (2 per tree), candles **unlit** |
| `land-christmas-day-src.png`, `-dusk-`, `-night-` | winter day, dusk, night | as `near/christmas-v1`: **strings of bulbs** through both trees' crowns (unlit); the dashboard's **snowman with its red scarf**, standing just right of the **right** tree's foot (≈ x 1600–1640); the dashboard's **presents** — a kraft-paper box with a red ribbon and bow, a red box with white spots and a silver ribbon, a second kraft box with a red bow — at the right tree's foot in front of the snowman (≈ x 1560–1625), all sitting **in** the snow |
| `land-july4-day-src.png`, `-dusk-`, `-night-` | summer day, dusk, night | as `near/july4-v1`: red-white-blue **bunting fans** on a string swung between the two trees at about y = 880–930; a **flag on a pole** just right of the right tree; a string of **café lights** between the trees (unlit) |

Then the **5 lights layers** — `land-halloween-dusk-lights.png`,
`land-halloween-night-lights.png`, `land-christmas-dusk-lights.png`,
`land-christmas-night-lights.png`, `land-july4-night-lights.png`: the glow
alone (candle light in the lanterns' and pumpkins' carved openings and their
warm light on the bark and ground; each bulb's core and small halo) on full
transparency, pixel-aligned with its land, transparent wherever the land is.
**List every light** (centre x, y, core radius r, `candle` or `bulb`).

Finally copy the **3 birthday balloon overlays** unchanged:
`tools/sky/src/land-holiday/birthday-balloons-{day,dusk,night}-src.png` →
`land-v3/land-holiday/`, with their entries (including `anchors`) copied
from `tools/sky/src/land-holiday/DONE.json`. (The page stakes the balloons in
the meadow at about (1158, 1016) and (1632, 1024): that ground must be open
meadow in every season — no rock or prop there.)

**Gate C**: the holiday check (§9) passes.

## 8. Where to save — exactly

```
custom_components/hk_frontend/tools/sky/src/land-v3/
  land/            land-<season>-<light>-src.png × 12, DONE.json
  land-holiday/    land-<holiday>-<light>-src.png × 8, land-<holiday>-<light>-lights.png × 5,
                   birthday-balloons-<light>-src.png × 3, DONE.json
  contact-sheet.png        all 20 lands, rows = season/holiday, columns = day/dusk/night,
                           each over its sky gradient, 640 × 400 a cell, lights on at dusk/night
  contact-lineup.png       per season: the dashboard art beside the screensaver land at the
                           same height — the same two trees, close up and far away
  contact-feet-master.png  (Gate A)
  contact-feet.png         (Gate B) 3× crops of both feet in all 20 lands
  notes-v3.md              how you made them; the Gate A foot notes; anything that breaks a rule, and why
  V3-DONE.json             LAST (§10)
```

**In the repository**, create nothing outside `land-v3/` (your scratch files
go in `land-v3/work/`). **Outside the repository**, your own tools' working
locations are fine — the image generator's output folder
(`$CODEX_HOME/generated_images/`), temp folders, caches: copy what you keep
into `land-v3/`. Do not change any other repository file. Do not run git
commands that change anything.

## 9. The checks — run these yourself, they must print no PROBLEM

These are the converters that will turn your files into what the page loads;
`--check` only reads. From `custom_components/hk_frontend/`:

```
HK_LAND_SRC=tools/sky/src/land-v3/land ~/venvs/hk-sky/bin/python3 tools/sky/land_webp.py --check
HK_LAND_SRC=tools/sky/src/land-v3/land HK_HOLIDAY_SRC=tools/sky/src/land-v3/land-holiday ~/venvs/hk-sky/bin/python3 tools/sky/holiday_webp.py --check
```

The first ends `all 12 checked: …`; the second `all 16 checked: …`. They need
each folder's `DONE.json` (schemas below) with every file's sha256 — write the
`DONE.json` files after the images are final. **Do not run them without
`--check`.**

## 10. The manifests

`land-v3/land/DONE.json`:

```json
{
  "version": 3,
  "task": "hk-forecast-landscapes",
  "files": [
    {"name": "land-spring-day-src.png", "season": "spring", "light": "day",
     "width": 2560, "height": 1600, "mode": "RGBA", "sha256": "..."}
  ],
  "trunks": {"left": [1240, 990], "right": [1545, 992]},
  "checks": {
    "top_34_percent_transparent": true,
    "same_geometry_all_12": true,
    "trees_planted_not_pasted": true,
    "no_text_or_watermark": true,
    "edges_checked_light_and_dark": true
  },
  "notes": "..."
}
```

`land-v3/land-holiday/DONE.json`: the schema of
`tools/sky/src/land-holiday/DONE.json` / `hk_house/docs/CODEX-PROMPT-HOLIDAY-LANDSCAPES.md`
— every land with `"base"`, every lights layer with `"over"` and its
`"lights"`, the 3 balloon overlays as copied — with `"version": 3` and checks:

```json
{
  "top_34_percent_transparent": true,
  "nothing_added_below_y_1060": true,
  "unchanged_outside_decorations": true,
  "same_decorations_in_every_light": true,
  "balloon_ground_open_all_12": true,
  "no_alpha_holes": true,
  "no_text_or_watermark": true,
  "edges_checked_light_and_dark": true
}
```

`land-v3/V3-DONE.json` — **written last, atomically** (write
`V3-DONE.json.tmp`, then rename), only when Gates A, B and C have passed and
both §9 commands print no PROBLEM:

```json
{"version": 3, "status": "complete", "gates": {"A": true, "B": true, "C": true},
 "land_check": "all 12 checked: ...", "holiday_check": "all 16 checked: ...",
 "trunks": {"left": [0, 0], "right": [0, 0]}, "notes": "..."}
```

If you stop early (Gate A failed 3 times, a season failed twice, or anything
else you cannot meet), write `land-v3/PARTIAL-v3.json` instead, same shape,
`"status": "partial"`, the gates that passed set true, and in `notes` exactly
what failed and what you tried. **Stopping with an honest partial is better
than finishing with art that breaks a rule.**
