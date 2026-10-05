# Realistic clouds — art brief v2: more clouds, rows, streaks (2026-10-05)

Read all of it, and `CODEX-BRIEF-v1.md` beside it (its format and technical
rules still apply unless this brief changes them).

## 1. Why

The v1 library (45 clouds) is in use: a live sky behind a Home Assistant
dashboard places the cut-outs **in perspective** — fair-weather cumulus share
one base height, so near clouds are big and high on the screen and far ones
small, low and many, crowding toward the horizon. Placed that way the sky is
close to real, but three things still give it away (compare
`reference/hk-realistic-now.jpg` with the photographs
`reference/photo-*.jpg`):

1. **Too few small and mid clouds.** v1 has 6 mid-distance cumulus, so the
   far and middle sky repeats the same puffs.
2. **No banks near the horizon.** In the photographs, far off the clouds
   merge into rows and banks along the skyline. v1 has only single clouds and
   a thin haze.
3. **Cirrus look like single feathers**, not long streaks.

And one thing to do better than v1: **edges.** v1's cut-outs go from solid to
clear in a pixel or two and read as paper stickers. Real cloud edges dissolve.

## 2. Look at these first

- `reference/photo-field-cumulus.jpg`, `photo-cumulus-rows.jpg`,
  `photo-cumulus-towers.jpg`, `photo-city-scattered.jpg` — the target: real
  skies. Note the level, slightly darker bases; bright sunlit tops; how the
  clouds shrink and crowd into rows toward the horizon; how far ones are
  hazier and bluer.
- `reference/hk-realistic-now.jpg` — what our sky draws now, and
  `reference/hk-realistic-before.webp` — the sticker look to avoid.
- The v1 library (`*-v1-src.png`, `contact-sheet-v1.jpg`) — the style and
  lighting to match, so v1 and v2 clouds mix in one sky.
- `reference/apple-*.webp` — Apple Weather, the overall feel.

## 3. What to make (v2 sets)

All photoreal. Every cloud distinct (no crop, flip or recolour of another,
v1 included). Five lighting variants each, exactly as v1: `day`, `grey`,
`golden`, `dusk`, `night` — golden and dusk lit **from the left**, day from
above-left, night by moonlight from upper left. **Alpha byte-identical across
a cloud's five variants.**

| set | what | count | source size (W × H) | notes |
|---|---|---:|---|---|
| `cumulus-small` | single fair-weather cumulus seen at a distance: one puff, two or three merged, flat-topped, a little ragged | 24 | 700–1100 × 260–450 | the middle and far sky. **Level, flat base**, seen from slightly below; tops sunlit. Vary the shapes a lot — this set exists to stop repetition |
| `cumulus-large` | big near cumulus, overhead | 8 | 2200–2800 × 900–1300 | like v1 `cumulus-near` but more varied: broken edges, a pair merging, one with a towering top. Flat bases |
| `cumulus-row` | a row/bank of many distant cumulus near the horizon, overlapping, on one common base line | 8 | 3600 × 420–620 | seen at a low angle from far off: many small heads along a flat base, hazier and slightly bluer than the near clouds, thinning out at both ends (ends feather to alpha 0 over the outer 300 px). Rows of different density, some broken into groups |
| `cirrus-streak` | long, thin, fibrous high cirrus streaks | 8 | 4000 × 300–600 | very translucent (mostly alpha 0.1–0.5), gently curved, running most of the width, frayed ends. Not a feather or a single tuft |
| `cumulus-fractus` | small ragged wisps and fragments, torn from cumulus | 8 | 400–700 × 150–300 | very soft, mostly semi-transparent; drift among the others |

## 4. Edges — the main quality rule

- **Every edge dissolves**: from the cloud body to fully clear over roughly
  **8–25 px** at source size for cumulus (more on the sunlit, wispy side;
  tighter along the flat base), more for fractus and cirrus. No hard
  cut-out line anywhere, no uniform glow ring.
- The interior stays crisp and photographic — softness is at the rim only.
- Check it: every cloud over `#2a5b9a` (day sky) at 50% size must not look
  cut out; include that view in the contact sheet.

## 5. Technical rules (as v1)

1. 64 px fully transparent margin on every edge (`cumulus-row`: top and
   bottom only; its ends feather out as above).
2. Straight alpha; RGB under semi-transparent and transparent pixels is the
   cloud's own nearby colour (bled outward) — no black or white halo.
3. Identical alpha across the five variants (byte-identical).
4. The visual **base is level** (horizontal) in every cumulus, cumulus-small,
   cumulus-large and cumulus-row: report its y as `base_y`.
5. Nothing but cloud: no sky, sun, moon, ground, birds, aircraft, text or
   watermark.
6. RGBA PNG, 8-bit, sRGB. Names: `<set>-<nn>-<variant>-v2-src.png`, e.g.
   `cumulus-small-07-golden-v2-src.png`, `nn` from 01.

## 6. Stage 1 — a sample, then STOP for approval

Make **2 clouds of each set** (10 clouds, 50 files), then:

- `contact-sheet-v2.jpg`: every cloud × its 5 variants over matching sky
  colours (day `#2a5b9a`, grey `#5a6878`, golden `#d0845c`, dusk `#8a5a78`,
  night `#0b1424`), and the day variant again at 50% over `#2a5b9a`.
- `sample-sky-v2.jpg`: a 1280 × 800 mock sky (day gradient `#0d2f57 →
  #5b93b8`, horizon at y = 576) with your v2 samples placed in perspective —
  a cumulus-large high up, cumulus-small shrinking toward the horizon, a
  cumulus-row along it, a cirrus-streak across the top — to show they mix.
- `SAMPLE-READY-v2.json` (`{"status": "ready", "notes": "..."}`), then
  **STOP** until the owner replies "approved".

## 7. Stage 2 — only after "approved"

The rest of every set (to the counts in §3), then:

- `clouds-v2.json` — the manifest, the schema of `clouds-v1.json`, listing
  **only the v2 clouds**: `id`, `set`, `width`, `height`, `base_y`, `bbox`,
  `band` (`overhead` for cumulus-large, `mid` for cumulus-small, `horizon`
  for cumulus-row, `high` for cirrus-streak, `mid` for cumulus-fractus),
  `lit_from`, `mean_alpha`, `files`.
- `contact-sheet-v2.jpg` (all v2 clouds) and `clouds-artwork-v2.md` (how you
  made them, anything that breaks a rule and why).
- **`CODEX-DONE-v2.json` last** (atomically), as v1's `CODEX-DONE.json`
  with `"version": 2`, `"clouds": 56`, `"files": 280`, and checks
  `margins_ok`, `alpha_identical_across_variants`, `no_halo_rgb_bleed`,
  `file_names_ok`, `edges_dissolve`, `bases_level`. If you stop early, write
  `CODEX-PARTIAL-v2.json`.

## 8. Where things go

Only in `custom_components/hk_frontend/tools/sky/src/clouds/` (scratch in
`work/`). Your own tools' locations outside the repository
($CODEX_HOME/generated_images/, temp, caches) are fine. Do **not** change or
delete any v1 file, any other repository file, or run git commands that
change anything.
