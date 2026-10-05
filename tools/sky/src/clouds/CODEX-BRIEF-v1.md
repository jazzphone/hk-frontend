# Realistic clouds for HK Sky — art brief v1 (2026-10-04)

You are making the cloud library for a live sky that sits behind a Home Assistant
dashboard (wall tablets, desktops, phones). The sky's gradient, sun, moon, stars,
rain and snow are drawn in code; **you are making only the clouds**, as separate
transparent cut-outs that the code places, scales, mirrors, layers and drifts
across the sky. The goal is clouds that look **photographically real** — like the
sky photography in Apple Weather (see `reference/`) — never painterly, cartoon,
"3D render", or Pixar-like.

## Where everything goes

- Work only inside `custom_components/hk_frontend/tools/sky/src/clouds/` (this
  folder). Do not touch anything else in the repository, do not convert or
  resize into `frontend/`, and do not commit to git.
- Style references (read only, do not copy from them): `reference/*.webp` —
  Apple Weather screenshots: scattered cumulus, mostly cloudy, and an overcast
  dusk. Also look at `../near/summer-v1-src.png` and `../near/fall-v1-src.png`:
  some scenes put a woodland foreground (trees, distant hills) in front of the
  sky, so the clouds must look right above and behind that kind of realistic
  scenery too.
- When everything is finished and checked, write `CODEX-DONE.json` (schema
  below) **as the very last file**. It is how completion is detected; do not
  create it early, and do not create it if you stop partway — write
  `CODEX-PARTIAL.json` with the same schema instead.

## How the clouds will be used (so you know what matters)

- The sky fills the **whole screen**, top to bottom, with cards over it. Clouds
  appear anywhere from overhead down to the horizon, not only at the top. Near
  the horizon they are small, flat and hazy (seen almost edge-on, far away);
  overhead they are larger and you see their flat undersides.
- Each cloud crosses the sky once, slowly, and is replaced by a different one.
  The code mirrors clouds horizontally, scales them ±25 %, tilts them ±3°, and
  overlaps several at different depths. So every cloud must look natural
  mirrored, and at different sizes, and against any sky colour.
- Lighting is baked into the art: every cloud comes in **five lighting
  variants**, and the code cross-fades between them as the sun moves. The code
  mirrors a cloud so its lit side faces the real sun, so side-lit variants are
  always lit **from the left**.
- The clouds are drawn over a sky gradient the code supplies (deep blue by day,
  orange/pink at sunset, near-black navy at night). **Never paint any sky,
  sun, moon, stars, ground, horizon line, birds, text or watermark into the
  art** — only cloud, on full transparency.

## The five lighting variants (same cloud, same silhouette)

| Variant | Light | Look |
|---|---|---|
| `day` | High sun from above, slightly left | Bright white sunlit tops, soft cool blue-grey shaded undersides and interiors, crisp but soft edges. |
| `grey` | Diffuse light under a heavy, overcast or rainy sky | Low contrast, mid-to-dark grey, darker bases, little to no white highlight. |
| `golden` | Low sun from the LEFT, just above the horizon | Warm gold/peach light on left-facing surfaces and edges, blue-violet shadow on the right and underneath, bright rim where the cloud is thin. |
| `dusk` | Sun just below the horizon, from the LEFT and below | Undersides lit pink/salmon/mauve, tops already cooling to grey-lavender, overall dimmer than golden. |
| `night` | Moonlight from upper left | Dim blue-grey, low contrast, a faint silvery edge on the moon-facing side; must read as a cloud against a near-black navy sky without glowing. |

**The alpha channel must be byte-identical across a cloud's five variants** —
only the colour changes. (Make the cloud once, relight it, then copy the `day`
alpha onto the other four.) The code cross-fades variants in place, so any
difference in silhouette would show as a ghost.

## The library (45 clouds × 5 variants = 225 PNGs)

All distinct — no cloud may be a crop, flip or recolour of another.

| Set | Type | Count | Source size (px, W × H, approx.) | Notes |
|---|---|---:|---|---|
| `cumulus-near` | Fair-weather cumulus, close, overhead | 8 | 2000–2600 × 800–1200 | Full volume, cauliflower tops, flat darker bases seen from slightly below. The hero clouds. |
| `cumulus-mid` | Cumulus, middle distance | 6 | 1200–1700 × 450–700 | Smaller, softer detail, a little atmospheric haze. |
| `cumulus-far` | Small distant cumulus near the horizon | 8 | 500–1000 × 120–260 | Flattened, seen nearly edge-on, hazy, low contrast. Some in loose rows of two or three puffs. |
| `stratocumulus` | Broken lumpy cloud sheets with gaps | 5 | 2600–3400 × 900–1400 | For mostly-cloudy skies; irregular gaps where sky shows through (transparent). |
| `altocumulus` | Mid-level patches of small rounded cloudlets ("mackerel sky") | 3 | 2400–3200 × 700–1100 | Thin, delicate, partly translucent. |
| `cirrus` | High wispy streaks and hooks | 5 | 2400–3600 × 500–900 | Very translucent, fibrous; mostly semi-transparent alpha, nothing solid. |
| `cumulonimbus` | A distant towering storm cloud with an anvil | 2 | 1600–2000 × 1400–1800 | Far away near the horizon; dark base, bright tower; shown on thunderstorm days. |
| `overcast-deck` | A full overcast/nimbostratus layer | 2 | 4096 × 2304 | Full-bleed: covers the whole sky. Mostly opaque (alpha 0.85–1.0) with real structure — darker rain-bearing areas, lighter thin areas, soft undulation — never a flat grey fill. Must look natural when any 16:10 crop of at least 60 % of its width is shown; no edge feathering or margins (exempt from the margin rule below). |
| `overcast-patch` | Darker cloud masses / scud that drift over the overcast deck | 4 | 1800–2600 × 500–900 | Ragged, soft, darker than the deck; break up a uniform overcast. |
| `horizon-haze` | Soft low stratus / haze band | 2 | 4096 × 600 | Very soft, fades out top and bottom; the far edge of the sky above the horizon. Exempt from the left/right margin rule (its ends fade to alpha 0 over the outer 400 px instead). |

## File names

`<set>-<nn>-<variant>-v1-src.png`, e.g. `cumulus-near-03-golden-v1-src.png`,
`overcast-deck-01-night-v1-src.png`. `nn` is two digits from 01. RGBA PNG,
8 bits per channel, sRGB.

## Technical rules (each is checked)

1. **Transparent margin.** Every pixel within 64 px of any edge has alpha 0, so
   no cloud is ever cut by its canvas edge. (Exceptions: `overcast-deck`
   entirely; `horizon-haze` top/bottom margin only, ends feathered as above.)
2. **Soft, natural edges.** Real cloud edges: wispy, semi-transparent, varied.
   No hard cut-out outline, no thresholded edge, no uniform glow around the
   cloud.
3. **No halos.** Straight (not premultiplied) alpha. The RGB under
   semi-transparent and fully transparent pixels must be the cloud's own
   nearby colour (bleed the colour outward), never black or white — the art
   is downscaled and composited over bright and dark skies, and a background
   colour under the edge shows as a dark or light ring.
4. **Identical alpha across the five variants** of a cloud (byte-identical).
5. **Lighting consistency.** `golden` and `dusk` lit from the left; `day` from
   above-left; `night` from upper left. Shadows on the opposite side.
6. **Photoreal.** No painterly brush texture, no stylised outlines, no 3D-render
   smoothness, no visible noise pattern or repetition inside a cloud.
7. **Nothing but cloud**: no sky, sun, moon, stars, landscape, birds, aircraft,
   text, signature or watermark.

## Also deliver

- `clouds-v1.json` — the manifest:

  ```json
  {
    "version": 1,
    "variants": ["day", "grey", "golden", "dusk", "night"],
    "clouds": [
      {
        "id": "cumulus-near-01",
        "set": "cumulus-near",
        "width": 2400, "height": 1000,
        "base_y": 860,
        "bbox": [64, 120, 2336, 900],
        "band": "overhead",
        "lit_from": "left",
        "mean_alpha": 0.41,
        "files": {"day": "cumulus-near-01-day-v1-src.png", "grey": "...", "golden": "...", "dusk": "...", "night": "..."}
      }
    ]
  }
  ```

  `base_y`: the y (px) of the cloud's visual base (its flat underside, ignoring
  stray wisps). `bbox`: [x0, y0, x1, y1] of pixels with alpha > 0.
  `band`: one of `overhead`, `mid`, `low`, `horizon`, `high` (cirrus), `full`
  (overcast deck). `mean_alpha`: mean alpha over the whole canvas, 0–1.
- `clouds-artwork-v1.md` — short notes: how you made them, anything that does
  not meet a rule above and why, and a contact-sheet image path.
- `contact-sheet-v1.jpg` — every cloud's five variants side by side, each over a
  matching sky colour (day blue, overcast grey-blue, golden orange, dusk pink,
  night navy), labelled with its id.

## Completion marker

Write last, after checking every rule — `CODEX-DONE.json`, or
`CODEX-PARTIAL.json` (with `"status": "partial"`) if not everything was made:

```json
{
  "status": "complete",
  "finished_at": "<ISO 8601 time>",
  "clouds": 45,
  "files": 225,
  "checks": {
    "margins_ok": true,
    "alpha_identical_across_variants": true,
    "no_halo_rgb_bleed": true,
    "file_names_ok": true
  },
  "problems": []
}
```

List anything that failed a check in `problems` (with the file name) rather
than leaving it out.
