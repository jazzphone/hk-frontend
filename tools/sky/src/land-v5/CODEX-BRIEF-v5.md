# Codex task v5: make the screensaver's holiday decorations match the dashboards' (2026-10-04)

Read all of it before starting.

## 1. The task

The forecast screensaver has holiday versions of its landscape
(`tools/sky/src/land-holiday/land-<holiday>-<light>-src.png`, 2560 × 1600):
the season's landscape with the holiday's decorations added. The dashboards
have their own holiday art (`tools/sky/src/near/<holiday>-v1-src.png`), and
the two should feel like the same occasion. They mostly do already. **Your
job is three small, precise changes to the screensaver's holiday art so its
decorations match the dashboards' — and nothing else.** The landscape, the
trees, the ground and every other decoration stay exactly as they are.

This is careful prop work in existing pictures. Earlier attempts that redrew
ground or trees left visible seams ("pedestals", floating trunks). Each rule
below prevents that.

## 2. The three changes

### A. Halloween — lanterns in the trees (`land-halloween-dusk-src.png`, `land-halloween-night-src.png`)

The dashboard hangs **carved jack-o'-lantern lanterns from the trees' branches
on cords** (`near/halloween-lanterns-v1-src.png`; at night lit from inside,
`near/halloween-lanterns-lit-v1-src.png`). The screensaver has jack-o'-lanterns
only on the ground. Add **4 hanging lanterns**, 2 in each of the two centre
trees, each hanging on a short dark cord from a visible branch:

- inside **x 1150–1700, y 700–930** only, not in the clock corner
  (x < 1150, y < 700);
- small, as the trees are far away: about **14–20 px wide** each;
- unlit (dark carved faces) in the land images — the glow goes in the lights
  layer (§4).

Keep the ground pumpkins, hay bales and corn stalks exactly as they are.

### B. Christmas — snowman and presents together at the right tree (`land-christmas-day/dusk/night-src.png`)

The dashboard has **the snowman and the presents together at the foot of the
right tree** (`near/christmas-v1-src.png`): a snowman with a red scarf and a
carrot nose, and three presents — a kraft-paper box with a red ribbon and bow,
a red box with white spots and a silver ribbon, a second kraft box with a red
bow. The screensaver has its snowman far to the left (about x 668–792,
y 912–1048) and its presents at the left tree (about x 1160–1252,
y 944–1048).

1. **Remove** the screensaver's snowman and presents, filling those places
   with the **surrounding snow** — the same texture, brightness, colour and
   shadow as the snow beside them, no patch or straight edge. Look at it at
   4×: you must not be able to tell where they were.
2. **Add** the dashboard's snowman and three presents, at this distance (the
   snowman ≈ 60–75 px tall, the presents ≈ 18–30 px each), standing together
   at the **right tree's foot**, just right of its trunk: inside
   **x 1570–1720, y 880–1035**. Their bases sit *in* the snow — snow banked
   against them, a soft contact shadow matching the light — not on top of it.

Keep the strings of bulbs on the trees exactly as they are.

### C. Fourth of July — flowers at the trees' feet (`land-july4-day/dusk/night-src.png`)

The dashboard has **white hydrangeas and red flowers** at its trees' feet
(`near/july4-v1-src.png`). Add a few small clumps of them at each of the two
centre trees' feet, in the grass, inside **x 1170–1320 and x 1480–1610,
y 955–1030** only, growing *from* the meadow (stems into the grass, no patch
of different ground). Keep the bunting, the flag and the lights exactly as
they are.

**Birthdays: no change.** The screensaver's birthday balloons are an overlay
the page places over whichever season it is; copy them unchanged (§5).

## 3. Rules — checked by script

- **Outside the zones named in §2, every pixel is byte-identical** (RGBA) to
  the source file. For Christmas that means outside x 650–810 / y 900–1060
  (the old snowman), x 1140–1270 / y 930–1060 (the old presents) and
  x 1570–1720 / y 880–1035 (the new ones).
- **Inside a zone, change only what the prop needs**: the prop, its cord or
  stems, its own shadow and the snow or grass in contact with it. Use
  small, irregular, feathered masks around each prop — **never a rectangle**.
- **Top 34% (y < 544) alpha 0**; alpha otherwise as the source (props sit on
  opaque land; a lantern against sky between branches may add alpha within
  its zone).
- **Same props in the same places in every light** of a holiday: make the day
  (or dusk) version first, then relight the same props for the others. Their
  outlines must match across the lights.
- **Rendering**: match the picture — the same softness, haze, colour grading
  and light as the trees and ground around the prop. A prop crisper,
  brighter or more saturated than its surroundings is wrong.
- The page's own checks (§6) must pass.

## 4. Lights layers

`land-halloween-dusk-lights.png`, `land-halloween-night-lights.png`: the
existing layer **plus** a candle glow in each new lantern (its carved face,
and a little warm light on the branch and leaves around it); the existing
glows stay byte-identical. List all lights, old and new, in `DONE.json`
(x, y, r, `candle`).

`land-christmas-dusk/night-lights.png` and `land-july4-night-lights.png`:
**unchanged** (copy them), unless a new prop now covers one of their lights —
then remove only that light's glow, and say so in notes.

## 5. Stage 1 — three masters, then STOP for approval

1. Make **`land-halloween-dusk-src.png`** (A), **`land-christmas-day-src.png`**
   (B) and **`land-july4-day-src.png`** (C) into
   `tools/sky/src/land-v5/land-holiday/`. Up to 3 attempts each.
2. Check §3 with a script for each.
3. Write `land-v5/masters-compare.png`: for each of the three, the original
   and yours side by side — (a) the whole picture at 1280 × 800 over its sky
   gradient (day `#0d2f57 → #5b93b8`, dusk `#141f3d → #b06a4a`), (b) every
   changed zone at 4×. For Christmas include the two emptied places at 4×.
4. Write `land-v5/MASTERS-READY.json` (`{"status": "ready", "attempts":
   {"halloween": n, "christmas": n, "july4": n}, "notes": "..."}`) and
   **STOP** until the owner replies "approved". If one cannot meet §3 in 3
   attempts, say which in notes and still stop.

## 6. Stage 2 — only after "approved"

- The other lights of each holiday, with the **same props in the same
  places**, relit: halloween night; christmas dusk, night; july4 dusk, night.
- The lights layers (§4).
- **Copy unchanged** into `land-v5/land-holiday/`: the 3
  `birthday-balloons-{day,dusk,night}-src.png`, and any lights layer §4 says
  to copy — so the folder holds the full set of 16 files.
- `land-v5/land-holiday/DONE.json`: the schema of
  `tools/sky/src/land-holiday/DONE.json`, every file with its sha256, its
  `base`/`over` and `lights` as there (balloon entries and `anchors` copied
  as they are), `"version": 5`, every `checks` value true (or explained in
  `notes`).
- Then, from `custom_components/hk_frontend/`, run — it must print no
  `PROBLEM` and end `all 16 checked`:

  ```
  HK_HOLIDAY_SRC=tools/sky/src/land-v5/land-holiday ~/venvs/hk-sky/bin/python3 tools/sky/holiday_webp.py --check
  ```

  Never run it without `--check`.
- `land-v5/contact-sheet.png` (all 8 holiday lands, rows = holiday, columns =
  day/dusk/night, over their sky gradients, 640 × 400 a cell, lights on at
  dusk/night) and `land-v5/notes-v5.md`.
- Last, atomically (`V5-DONE.json.tmp` → `V5-DONE.json`):
  `{"version": 5, "status": "complete", "holiday_check": "...", "notes": "..."}`;
  or `PARTIAL-v5.json` with what failed.

## 7. Where things go

In the repository, create files only inside `tools/sky/src/land-v5/`
(scratch in `land-v5/work/`). Your own tools' locations outside the
repository ($CODEX_HOME/generated_images/, temp, caches) are fine. Change no
other repository file; no git commands that change anything. Do not use the
earlier attempts (`land-woods/`, `land-v3/`, `land-v4/`).
