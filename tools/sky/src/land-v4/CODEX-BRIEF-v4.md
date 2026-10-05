# Codex task v4: restyle the screensaver's two trees — keep everything else (2026-10-04)

Read all of it before starting. Three earlier attempts at this failed; the
rules below are what they taught.

## 1. The task, in one paragraph

The forecast screensaver's landscapes (`tools/sky/src/land/` and
`tools/sky/src/land-holiday/`) are liked as they are: half sky, half land, a
meadow, a tree line, hills, and **a pair of trees in the middle distance at
the centre**. The dashboards' woodland (`tools/sky/src/near/<season>-v1-src.png`)
has two big old trees of its own, with **ivy climbing their trunks** and
**crowns that lean toward each other and reach across the gap between them**.
**Your job: give the screensaver's existing two trees that character — keep
them the same trees, where they are, at the size they are, standing in the
same ground — and change nothing else.** These are touch-ups to two trees, not
a new picture.

## 2. What must NOT change (checked by script, per pixel)

- **Everything at y ≥ 960 is byte-identical to the source** (RGBA): the tree
  bases, the roots, the meadow, the props on the ground. This is what keeps
  the trees planted. Earlier attempts that redrew the ground there failed.
- **Everything outside the box x 1040–1780, y 560–960 is byte-identical.**
- **The top 34% (y < 544) stays alpha 0.**
- **The trees' size, position and the rendering of the picture** — same
  softness of detail, contrast, colour grading, light and distance haze as the
  original trees. Change their *character*, not how the picture is rendered.
  A tree that looks crisper, brighter or more saturated than the forest
  behind it is wrong.
- **Not allowed**: drawing new trees, new species, new composition, cutting
  and pasting trees from anywhere, or regenerating the whole image.

## 3. What to change, inside the box only (x 1040–1780, y 560–960)

The two trees: left trunk centred at **x ≈ 1240**, right at **x ≈ 1545**.

1. **Ivy** climbing both trunks and into the lower limbs, as on the dashboard
   trees (`near/summer-v1-src.png` shows it clearly): dark-green ivy leaves
   over the bark, thicker low down. At this distance, a texture of small
   leaves over the trunk, not individual detailed leaves. In winter, ivy stays
   green but frosted and partly snow-covered; in fall it is green with a
   little red.
2. **The crowns lean toward each other** and their branches reach across the
   gap between the two trees, a little higher where they meet, as the
   dashboard pair frame the valley between them. The crowns may grow, shrink
   or change outline **only inside the box**, and their top must stay below
   y = 600.
3. **The trunks join the unchanged ground exactly.** At y = 950–960 the trunk
   you draw must have the same x position, width and colour as the original
   trunk at y = 960, so the row at y = 960 continues without a seam. Blend
   across y 940–960 only.
4. Each season keeps its foliage: spring blossom, summer green, autumn
   colours, winter bare and frosted (then the "crown" is the branch
   structure, still leaning toward the other tree).

## 4. Stage 1 — one master, then STOP for approval

1. Make **`land-v4/land/land-summer-day-src.png`** from
   `land/land-summer-day-src.png` by inpainting **only the box** (a mask that
   is the two trees above y = 940, feathered, inside the box). Up to 3
   attempts.
2. Check it with a script: §2 holds (y ≥ 960 identical, outside the box
   identical, y < 544 transparent).
3. Write `land-v4/master-compare.png`: original and yours side by side,
   (a) the whole picture at 1280 × 800 over a day sky gradient
   (`#0d2f57 → #5b93b8`), (b) the box at 2×, (c) both tree feet at 4×
   (x 1190–1290 and 1495–1595, y 920–1000).
4. Write `land-v4/MASTER-READY.json` (`{"status": "ready", "attempts": n,
   "notes": "..."}`) and **STOP. Do not make anything else** until the owner
   replies "approved". If no attempt keeps §2, write `PARTIAL-v4.json` with
   notes and stop.

## 5. Stage 2 — only after "approved"

Apply **the same restyle to the same two trees** in the other images, from
the approved master — the same ivy, the same lean, the same crown shapes
(seasonal foliage aside). Every §2 rule applies to every image.

- **11 more season lands**, `land-v4/land/land-<season>-<light>-src.png`
  (spring, summer, fall, winter × day, dusk, night), each from its own
  `land/` source. Within a season, **day, dusk and night have byte-identical
  alpha** (restyle the day image, relight it, copy its alpha).
- **8 holiday lands**, `land-v4/land-holiday/land-<holiday>-<light>-src.png`
  (halloween dusk, night; christmas day, dusk, night; july4 day, dusk,
  night): each is **its new season land** (fall for Halloween, winter for
  Christmas, summer for the Fourth) **plus that holiday's decorations from
  the original** `land-holiday/` file. Decorations on the ground (pumpkins,
  presents, snowman, hay, flag) are copied exactly from the original holiday
  file. Decorations in the trees (bulb strings, bunting, lanterns) are redrawn
  onto the restyled branches in the same style, as few pixels moved as
  possible.
- **5 lights layers**, `land-v4/land-holiday/land-<holiday>-<light>-lights.png`
  (halloween dusk, night; christmas dusk, night; july4 night): the original
  layer, with only the glows of decorations you moved redrawn to sit on them.
  **List every light** (x, y, r, `candle` or `bulb`) in `DONE.json`.
- **The 3 birthday balloon overlays**, copied unchanged from
  `land-holiday/birthday-balloons-{day,dusk,night}-src.png`, with their
  `DONE.json` entries (including `anchors`) copied as they are.

## 6. Manifests and the final check

`land-v4/land/DONE.json` and `land-v4/land-holiday/DONE.json`: the same
schemas as `tools/sky/src/land/DONE.json` and
`tools/sky/src/land-holiday/DONE.json`, every file with its sha256,
`"version": 4`, every `checks` value true (or explained in `notes`). Then run,
from `custom_components/hk_frontend/`:

```
HK_LAND_SRC=tools/sky/src/land-v4/land ~/venvs/hk-sky/bin/python3 tools/sky/land_webp.py --check
HK_LAND_SRC=tools/sky/src/land-v4/land HK_HOLIDAY_SRC=tools/sky/src/land-v4/land-holiday ~/venvs/hk-sky/bin/python3 tools/sky/holiday_webp.py --check
```

Both must print no `PROBLEM` (the first ends `all 12 checked`, the second
`all 16 checked`). Never run them without `--check`.

Also deliver `land-v4/contact-sheet.png` (all 20 lands, rows =
season/holiday, columns = day/dusk/night, 640 × 400 a cell, each over its sky
gradient: day `#0d2f57 → #5b93b8`, dusk `#141f3d → #b06a4a`, night
`#04070f → #111726`), and `land-v4/notes-v4.md`.

Last, atomically (`V4-DONE.json.tmp` → `V4-DONE.json`):
`{"version": 4, "status": "complete", "land_check": "...", "holiday_check": "...", "notes": "..."}`.
If you cannot finish, write `PARTIAL-v4.json` with what failed instead.

## 7. Where things go

In the repository, create files only inside `tools/sky/src/land-v4/`
(scratch in `land-v4/work/`). Outside the repository, your own tools'
locations ($CODEX_HOME/generated_images/, temp, caches) are fine. Change no
other repository file; no git commands that change anything. Do not use the
earlier attempts (`land-woods/`, `land-v3/`) for anything.
