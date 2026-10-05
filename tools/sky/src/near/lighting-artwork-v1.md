# Lighting artwork v1 — delivery for conversion and wiring

Generated with the built-in image generation tool, followed by user-authorized precise Python compositing and source-derived masks. No renderer, dashboard configuration, conversion, or wiring changes were made.

## Deliverables

All files are in this directory. Preserve canvas dimensions and origins during conversion; do not trim transparent borders or independently rescale the lit/unlit pairs.

| File | Dimensions | Mode | Purpose |
| --- | --- | --- | --- |
| `halloween-lanterns-v1-src.png` | 1586 × 992 | RGBA | Four unlit hanging lanterns; transparent overlay |
| `halloween-lanterns-lit-v1-src.png` | 1586 × 992 | RGBA | Pixel-aligned candle-lit twin, faint aura and localized branch spill |
| `halloween-lit-v1-src.png` | 1586 × 992 | RGBA | Original Halloween scene with four ground pumpkins lit and localized leaf/ground spill |
| `christmas-lit-v1-src.png` | 1585 × 992 | RGBA | Original Christmas scene with its twelve visible globe bulbs lit warm white and small soft halos |
| `christmas-bulbs-v1-src.png` | 1585 × 992 | RGB | Opaque black control mask, twelve pure-white dots centered on the actual source bulbs |

The Christmas source is 1585 pixels wide. Both Christmas deliveries preserve that exact original size.

## Alignment and lighting

The hanging lanterns use these actual branch anchors in Halloween source pixel coordinates: `(246,122)`, `(380,58)`, `(1304,128)`, `(1377,262)`. Their pumpkin placement rectangles, including stalks, are `(203,172,277,246)`, `(348,138,410,204)`, `(1279,160,1343,226)`, and `(1340,281,1418,364)`; coordinates are left, top, right, bottom.

Both lantern layers are completely transparent for x=280 through x=1300 inclusive below y=230. The unlit overlay contains only pumpkin lanterns and thin suspension twine. The lit twin adds faint translucent emitted light, including spill confined to original branch pixels at the anchors. Original opaque silhouette support and every occupied pixel's alpha match exactly.

Ground candle lighting follows the original dark cavity contours; no generated pumpkin geometry was pasted over the source. Only low-frequency emitted illumination was transferred to nearby original ground/leaf texture. The Christmas illumination and mask use measured source bulb centers; sockets and snow highlights are excluded.

For future flicker, use the lit/unlit images with identical transforms. The bulb mask is a control mask, not an image to display directly over the scene.

## Verification and backups

Both source masters are byte-identical to the backups. Full lit scene variants preserve original alpha everywhere and every RGBA pixel outside their localized lighting regions. Dimensions, lantern exclusion transparency, silhouette alignment, black/white mask values and twelve dot centers passed validation.

Backups and reproducible compositing scripts: `backups/2026-10-04-near-light-artwork/` (relative to the configuration root). Detailed checks: `validation.json`. Preview: `halloween-lit-preview.png`. Coordinates: `work/christmas-bulb-centers.json`.

## Christmas bulb centers

| Measured source center | Mask dot center |
| --- | --- |
| (144.022, 81.378) | (144, 81) |
| (169.811, 101.019) | (170, 101) |
| (203.987, 175.821) | (204, 176) |
| (97.708, 244.708) | (98, 245) |
| (159.827, 260.36) | (160, 260) |
| (68.014, 483.366) | (68, 483) |
| (1427.681, 185.391) | (1428, 185) |
| (1433.794, 214.441) | (1434, 214) |
| (1488.719, 306.188) | (1489, 306) |
| (1474.141, 327.789) | (1474, 328) |
| (1441.0, 348.215) | (1441, 348) |
| (1468.257, 489.229) | (1468, 489) |

## Prompt set

The prompts below were used for generation/design; final alignment and unrelated-pixel preservation were enforced during the authorized compositing stage described above. The bulb-mask instruction was implemented deterministically.

### halloween-lanterns-v1-src.png

```text
Use case: photorealistic-natural / compositing.
Create a NEW transparent RGBA overlay, precisely 1586x992, intended to sit over Input 1 halloween-v1-src.png. Input 1 is placement and photographic style reference ONLY; do not include any of its scenery in the output.
Exactly four ominous real carved pumpkin lanterns hanging by thin dark twine from the ACTUAL upper corner branches of this reference: two on the left, two on the right. Placement in source pixel coordinates: left first thin twine anchor (260,75) descending to pumpkin center (245,172), pumpkin about 74x68; left second anchor (420,61) descending to center (395,163), pumpkin about 62x58. Right first anchor (1240,64) descending to center (1240,169), pumpkin about 64x59. Right second anchor (1380,132) descending to pumpkin center (1390,245), about 78x72. Match bark/leaf photograph perspective and real ground pumpkin material, subdued weathered burnt orange skin, realistic ridges and stalks, sharp sinister hand-carved triangular eyes and angular jagged mouths, hollow BLACK DARK openings with absolutely no light inside. Restrained ominous realism, not cartoon smiling pumpkins.
Output contains ONLY these four pumpkins and their thin suspension twine, natural cutout edges, true alpha transparency everywhere else. No trees, branches, leaves, mountains, ground, sky, backdrop, text or watermark. Keep the entire central region x280 through1300 at all y greater than230 absolutely empty transparent. Keep all content at y<300. Preserve full empty canvas, do not crop or center the objects, no contact sheet.
```

### halloween-lit-v1-src.png

```text
Use case: lighting-weather / precise-object-edit.
Input 1 is the edit target halloween-v1-src.png, 1586x992 RGBA. Produce halloween-lit-v1-src.png at exactly that size. Preserve the original RGBA transparency and every original pixel except lighting at the FOUR existing ground jack-o-lanterns. Do NOT add hanging lanterns.
Light their existing eyes, noses and mouths from candles inside. Locations: large left pumpkin around(71,724), small left(293,749), small right(1435,790), large right(1540,762). Each carved cavity should have a luminous hot amber gold core, richer deep orange at actual cut walls, uneven candle-real interior, restrained warm rim on skin. Soft orange localized light spills onto the immediately surrounding existing ground leaves/roots. Ominous photographic autumn twilight, not cheerful. Preserve each pumpkin's exact carved hole contours, geometry, position, stalk and ribs. Keep the forest, branches, sky transparency, mountains, ground texture, framing and all other objects EXACTLY unchanged. No additional pumpkins, moon, fog, stars, bulbs, labels. No overall relighting. Only localized candle light at those four pumpkins. This is a pixel aligned lit/unlit pair for animation, so absolutely no structural movement.
```

### christmas-lit-v1-src.png

```text
Use case: lighting-weather / precise-object-edit.
Input 1 christmas-v1-src.png is the edit target, a 1585x992 RGBA transparent foreground scenery. Produce a pixel-aligned Christmas lit variant. Change ONLY each EXISTING string light bulb into a lit 2700K warm white bulb, bright ivory core and small softly feathered warm golden halo. Light ALL the existing bulbs at their EXACT original centers; preserve each globe diameter, wire, tree bark, snow, branch contours and original alpha. Do not add or remove bulbs or wires. Leave the snowman, presents, forest, mountains, snow, central transparent sky and every other object unchanged. No overall scene relighting. The small halo may gently warm the immediate nearest bark/snow around each bulb. No starbursts, large glowing orbs, colored lights, floating dots or new decoration. Output 1585x992 RGBA matching source geometry exactly.
```

### halloween-lanterns-lit-v1-src.png

```text
Use case: lighting-weather / precise-object-edit.
Input 1 is EDIT TARGET halloween-lanterns-v1-src.png: exactly four small hanging pumpkin lanterns on a 1586x992 transparent canvas with thin dark vertical twine. Input 2 halloween-v1-src.png is branch-position/lighting style REFERENCE ONLY and MUST NOT appear in output.
Produce the pixel-aligned LIT twin of Input 1: keep the four lanterns, every outline, actual carving shape, position, size and twine identical. Change only candle lighting: hot amber golden core in the exact existing eyes/noses/mouths fading deep orange toward actual carved cut edges, warm rim on nearest pumpkin skin, extremely soft faint local aura. Real ominous candle-lit carved pumpkins, detailed photographic ridged skin, no cheerful cartoon. Add a very faint localized translucent amber light spill at nearest branch anchors (246,122),(380,58),(1304,128),(1377,262) WITHOUT drawing any branch or scenery itself. Everything else remains transparent. Keep x280..1300 at all y>230 completely transparent, no contents at all there. No text, trees, branch silhouettes, background, extra pumpkins, extra cords, framing changes, crop or repositioning. Output RGBA exact1586x992.
```

### christmas-bulbs-v1-src.png

```text
Deterministic source-derived mask: preserve Christmas source canvas 1585×992; opaque black RGB background; twelve pure-white 5-pixel-diameter disks centered at the measured centroids of the twelve visible original globe bulbs. No halos, sockets, snow marks or additional dots.
```
