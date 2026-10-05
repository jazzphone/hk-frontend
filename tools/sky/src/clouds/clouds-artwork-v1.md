# Clouds artwork v1

45 independently generated photographic cloud shapes, five RGB lighting variants each (225 RGBA PNGs). Created with the built-in image generation tool: one generation per distinct day cloud and one relighting call per additional variant. The Apple Weather screenshots were inspected for style only; no screenshot pixels were copied into the artwork. The woodland sources were also inspected as context.

## Preparation

Whole generated clouds were fitted to the requested source canvases. Generated native-resolution art was resampled where necessary to the specified final sizes; no frontend conversions were made. Far cumulus and horizon bands use the deliberately shallow source perspective. Cirrus density and haze softness were refined for natural translucent compositing. Tiny isolated alpha components below 48 pixels were removed to prevent stray generation/resampling specks from reading as stars; connected cloud edges retain their soft alpha values. Cleanup counts and original alpha backups are in `work/speckle-cleanup.json` and `work/backup/before-speckle-cleanup/`.

Each cloud has one canonical day alpha, reused byte-for-byte for all five variants. RGB lighting was transferred as broad illumination from the individual generated relights while retaining the day cloud's photographic volume and fine vapor texture. This keeps internal features and silhouettes fixed during cross-fades. Straight-alpha RGB was filled outward with the cloud's own local colours using normalized multiresolution colour bleed; no black/white matte remains under transparency. Every PNG has an embedded sRGB profile and 8-bit RGBA channels.

## Delivery

- Manifest: `clouds-v1.json` (measured dimensions, nonzero-alpha bounds, opacity, visual base, band and variant files).
- Full contact sheet: `contact-sheet-v1.jpg`, all 45 clouds with the five variants on matching sky colours.
- Larger review pages: `work/review-pages/page-01.jpg` through `page-09.jpg`.
- Exact validation details and hashes: `work/validation.json`.
- Visual review: all nine review pages inspected; `work/scaling-edge-review.jpg` checks all ten cloud types on bright/dark skies at 75–125% scale, mirrored and tilted ±3°, including 60%-width 16:10 overcast crops. Review record: `work/visual-review.json`.
- Prompts, generated input/output provenance: `work/records/*.json`; original shape plan: `work/plan.json`.
- Reproducible preparation, isolated-speck cleanup and validation: `work/process_artwork.py`, `work/clean_speckles.py`, `work/validate_library.py`.
- Original brief backup: `work/backup/CODEX-BRIEF-v1.md`.

All requested technical checks passed. No known rule exceptions beyond the brief's stated margin exemptions for full-bleed overcast decks and horizontally feathered horizon haze. Keep full PNG canvases during conversion; do not trim each variant independently. No other repository paths were modified and no git commit was made.
