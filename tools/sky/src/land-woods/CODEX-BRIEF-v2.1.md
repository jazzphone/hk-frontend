# Codex task v2.1: fix the v2 woodland lands — no pedestals, and blend the trees in (2026-10-04)

v2 is close and its rules all held: nothing outside the edit box changed, the
trunks are where they should be, the alpha matches across lights. Two things
are wrong, and this pass fixes **only those**, editing your own v2 files in
place (same names, same folder). Every rule of `CODEX-BRIEF-v2.md` still
applies.

## 1. The trees stand on pedestals

At each trunk's foot there is a **rectangle of different ground**: a box of
grass or snow with straight, hard edges and its own texture and brightness,
so each tree looks as if it stands on a little plinth. Plain in fall and
winter, fainter in summer and spring, and in the holiday lands built from
them. (Compare `land/land-fall-day-src.png` and your
`land-woods-fall-day-src.png` around x 1100–1800, y 920–1050.)

Fix: the trees must **stand in the meadow**, not on a patch of it.

- The ground around and between the trunks continues the **original meadow**
  (the source's grass or snow) **seamlessly**: the same texture, scale,
  brightness and color as the ground either side; no straight edges, no
  rectangle, no change of grain.
- Where the trunk meets the ground: a natural foot — the grass growing up
  around it, a little soft contact shadow, in snow a gentle drift — as the
  original trees had. Nothing that reads as a block.
- Use the source's own meadow pixels wherever the new trees and props don't
  cover them; where they must be blended, feather irregularly, never along a
  straight line.

## 2. The trees look pasted on

The new trees are **crisper, more contrasty and more saturated** than the
original tree line and hills around them, so at screensaver size they read
as cut out and laid on top. They are in the middle distance: match the
**original image's own rendering** around them — the same softness of fine
detail, the same contrast, the same color grading and the same light
direction, and the same distance haze over them as over the tree line just
behind. Compare a crop of the new pair with the original pair it replaced:
the detail level should be the same.

Optional, only if it makes the likeness to the dashboard pair
(`tools/sky/src/near/<season>-v1-src.png`) stronger: let the two crowns lean
and reach toward each other a little more, as the dashboard trees do over the
valley — **without moving the trunks' feet** ([1240, 990] and [1545, 992])
and staying inside the edit box.

## Keep

The holiday props and their lights layers on the corrected trees (redo the
lights layers if a lantern or bulb moves); alpha byte-identical across each
theme's lights; everything outside x 960–1840 / y 560–1060 byte-identical to
the **original** sources in `land/` and `land-holiday/`; top 34% clear;
nothing new below y = 1060.

## Deliver

- The 20 lands and 5 lights layers, overwritten in place.
- `contact-sheet.png`, `contact-lineup.png` and the `diff-*.png` again.
- `contact-bases.png` (new): for each season, the original's ground at the
  trunks (x 1100–1800, y 920–1050) beside yours, at 2× — to show no pedestal
  remains.
- `notes-v2.1.md`.
- **`DONE-v2.1.json`, written LAST** (atomically), same schema as `DONE.json`
  with `"version": "2.1"` and two more checks:
  `"no_ground_patch_at_trunks": true` and
  `"tree_detail_matches_surroundings": true`. Leave the v2 `DONE.json` as it
  is. If you stop early, write `PARTIAL-v2.1.json`.

Only create or overwrite files inside `tools/sky/src/land-woods/`; change
nothing else; no git.
