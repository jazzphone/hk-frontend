# Holiday screensaver art v6

Completed both stages of CODEX-BRIEF-v6.md after the owner's `approved` reply.
All repository changes are confined to this land-v6 directory.

The output directory `land-holiday/` contains 22 PNGs, each 2560 × 1600 RGBA:
9 holiday lands (Halloween/fall, Christmas/winter, July4/summer × day/dusk/night),
3 transparent birthday props overlays, 7 transparent glow layers, and the
3 original birthday balloon overlays copied byte for byte. `land-holiday/DONE.json`
uses the original manifest structure, version 6, with hashes for every PNG,
base references for lands, overlay references and every light coordinate for
glow layers, and the original balloon entries and anchors copied verbatim.

The four Stage 1 masters remain byte-identical to the approved files. Props
were created with built-in image_gen from the dashboard references; the
prompt set is in `work/prompts-stage1.json`. Saved local silhouette masks,
small connecting wires, and unlit glass bulbs were composited over the exact
season sources. Stage 2 reuses those same prop pixels and alpha masks, changing
only their color according to the measured RGB ratios between the original
season land's light states. Birthday uses the median ratios across seasons.
No new generation or geometry changes were needed for the relighting.

Halloween has 4 hanging pumpkins (40–46 px wide) and 4 ground pumpkins
(49–68 px wide). Christmas has a 122 px tall snowman, 3 presents with visible
body widths in the specified 35–55 px range, and 58 bulbs on 4 branch strands
(6 px bulbs). July4 has 3 fans (65 px), an approximately 80 px wide flag on its
pole, two flower clumps (62/65 px), and 9 café bulbs (7 px). Birthday has 3
presents with visible widths 37–44 px and the same 9-bulb café string. Detailed
placements and solid silhouette dimensions are in `work/placements-stage1.json`.

Glow files contain light alone. Halloween's 8 irregular carved-face masks
have warm cores, small feathered halos, and restrained warm spill on nearby
bark/grass. The candle coordinate represents the centroid of each complete
carved face; its core radius encloses that face's openings. Bulb coordinates
and 1.3 px core radii come directly from the approved master string geometry.
All light sources are enumerated in the manifest. Lands and props overlays
contain no emissive cores or glow. Dusk and night glow intensity differs.

`contact-sheet.png` shows every occasion and light with glow enabled, including
birthday over summer and winter. Day and dusk skies use the brief's gradients;
night uses #030817 → #172743. July4 dusk previews its night glow at 55%, matching
the existing convention; only the requested July4 night glow file is supplied.
Birthday balloons are shown using the current page scale/placement from
holiday_webp.py; their delivered overlay files remain unchanged.
`work/birthday-all-12.png` shows birthday over all 12 season/light bases.
The `work/qa-*-3x.png` files show decorated areas with lights on at 3×.

Validation passed:

- Required command, run only with `--check` from custom_components/hk_frontend:
  `HK_HOLIDAY_SRC=tools/sky/src/land-v6/land-holiday python3 tools/sky/holiday_webp.py --check`
- Output: `all 16 checked: 2560x1600 RGBA, checksums match, top 34% clear, decorated not redrawn`
- No `PROBLEM` output. No conversion or runtime integration was run.
- Additional v6 checks cover all 22 PNGs, including Halloween day and the new
  birthday files. Every checksum, size, mode, and light-source alignment passes.
- Exact maximum channel difference outside each land's local prop mask: 0.
  Exact maximum difference below y = 1040: 0. Top 34% and clock box are clear.
- All light states share byte-identical prop alpha masks and positions.
- All 12 matching season/light birthday composites preserve pixels outside props.
- Every Stage 1 master hash matches. All recorded season, dashboard, and old
  holiday source hashes match. Balloon files and manifest entries match originals.
- Light and dark scene previews and 3× decorated-area crops were visually reviewed.

The original land alpha holes and skyline artifacts are retained exactly as
required. The old manifest's `no_alpha_holes` key is replaced by the accurate
`no_new_alpha_holes` check; every v6 check is true. No hole was added to a land.

Reproducible Stage 2 assembly and validation: `work/build_stage2.py`.
RGB relight factors: `work/relight-factors.json`.
Pixel validation: `work/validation-v6.json`.
`V6-DONE.json` is written atomically last after successful verification.
