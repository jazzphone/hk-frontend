# Cloud artwork v2

The library contains 56 distinct photographic cloud shapes: 24 cumulus-small, 8 cumulus-large, 8 cumulus-row, 8 cirrus-streak and 8 cumulus-fractus. Each has day, grey, golden, dusk and night lightings, for 280 source PNGs. The 50 approved Stage 1 PNGs are retained unchanged.

## Artwork and references

Each day shape was independently generated with the built-in image_gen tool. The photographs, current and previous HK sky, Apple Weather references, v1 clouds and nearby woodland foregrounds were inspected for photographic texture, horizontal condensation bases, perspective, atmospheric distance and lighting. Reference and v1 pixels were not copied into the new art. Whole independently generated clouds were fitted and resampled onto their specified source canvases; no library shape is a crop, flip or recolour of another.

Each additional lighting received its own built-in imagegen relighting call using that shape's prepared day image as the edit target. Generated broad illumination is transferred onto the canonical day detail, preserving photographic vapor structure and volume. Day is lit above-left; grey is diffuse and subdued; golden is warm from the left with violet shadows; dusk is dim salmon/mauve from below-left; night is low-contrast blue-grey with faint upper-left moonlight. Night RGB is limited to prevent glowing.

## Alpha, bases and colour

One prepared day alpha is reused byte-for-byte in all five lightings. Cumulus rims have varied 3–7 px Gaussian alpha diffusion, giving approximately 8–25 px body-to-clear transitions. The sunlit wispy side is softer; the horizontal underside uses a tighter smooth fade. Interior RGB photographic detail is retained. Cirrus and fractus use 8.5 px alpha diffusion and partial vapor density. Cirrus extraction retains bright photographic ice fibers while rejecting a low-density coloured veil.

The common dense condensation plane is measured for each cumulus, reported as base_y, and faded horizontally. Three new shapes needed a slightly higher plane to keep their dense underside level. Rows preserve shallow panoramic proportions, carry atmospheric translucency, and taper to alpha zero with a smooth fade over their outer 300 px. All non-row sprites have 64 px fully transparent margins on all sides; rows have top and bottom margins.

RGB is straight, not premultiplied. A normalized multiresolution colour bleed fills partial and fully transparent pixels from nearby cloud colours. One fractus day candidate was discarded after a smoke-like tail appeared in review; the selected replacement uses a brightness-based vapor density. Subsequent inspection traced dark RGB in sparse regions to an empty quadrant in the colour-bleed pyramid. The Stage 2 pyramid now reduces to a weighted 1 × 1 cloud-colour seed before pulling nearby finer colours outward. All 230 new PNGs were checked after this repair, with alpha unchanged; the 50 approved PNGs needed no repair. The final fractus image was reviewed over blue, navy and pale backgrounds. All source PNGs are 8-bit RGBA with an embedded sRGB profile.

## Review and provenance

The full contact sheet is [contact-sheet-v2.jpg](contact-sheet-v2.jpg). It shows every shape's five lightings over the specified matching sky colours, followed by day at exactly 50% source size over #2a5b9a. The final perspective example is [sample-sky-v2.jpg](sample-sky-v2.jpg), a 1280 × 800 day gradient (#0d2f57 to #5b93b8) with virtual horizon y=576. It keeps the approved hero shapes and adds all 24 distinct small cumulus, shrinking and crowding toward the horizon, with new banks, long cirrus and fractus from the completed library.

Exact generation and relighting prompts, input paths, generated source paths and the discarded candidate are recorded in work/v2/records/ and work/v2/prompts-full.json. Reproducible preparation and delivery scripts are in work/v2/. Measurements, alpha and file hashes, set counts, dimensions, margins, base flatness, edge gradients and protected-file comparisons are in work/v2/validation-full.json; visual review evidence is in work/v2/visual-review-full.json. Additional day and edge review panels are in work/v2/day-review/ and work/v2/edge-review-full/.

No known artwork exceptions to the final brief. All task writes are within clouds/, with scratch in work/v2/. All protected v1 files and the 50 approved Stage 1 PNGs retain their original hashes. No Git mutation command was run. The protected-file audit detected a concurrent external edit to clouds/.gitignore: two ignore entries, sample-sky-v2.jpg and SAMPLE-READY-v2.json, were appended at 09:05:08 local time. This task did not edit that file and preserved the external edit. The overall existing-files comparison therefore remains false and is reported in validation and the completion marker; work/v2/external-change-audit.json records exact hashes and confirms that removing those two lines recovers the original hash.
