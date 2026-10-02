// hk-sky.js - a live sky behind the weather view.
//
// WHAT IT DOES
// Replaces the flat wallpaper on the weather page with a sky that tracks the
// real one: gradient driven by sun elevation, sun glow placed by azimuth, the
// moon drawn at its actual phase, cloud decks whose density comes from
// cloud_coverage, and rain or snow when it is actually falling.
//
// WHY NOT APPLE'S OWN ART
// There is none to take. Apple's WeatherUI ships 263 individual cloud SPRITES
// (a single Cumulus puff is 613x217) plus four proprietary "aegir" .art scene
// files and two .metallib shader libraries -- the sky is COMPUTED at runtime,
// not stored. Nothing in that bundle is a background image. So this computes
// one too, from noise textures generated locally into frontend/sky/ (generator:
// tools/sky/gen_sky.py, pure Python, no PIL). ~866 KB for the set. No
// downloads, no license question, and the textures tile and recolor -- which
// a stock sky photograph cannot do.
//
// WHERE IT ATTACHES -- AND WHY THAT EXACT SPOT
// hui-root renders <hui-view-container id="view"><hui-view-background>, and
// hui-view-background is the element that paints a view's `background:` key:
//
//     :host([fixed-background]) { position: fixed; z-index: -1 }
//     :host { inset: 0; background: var(--view-background) }
//
// So the wallpaper is already a fixed, z-index:-1 layer. We insert ourselves
// as its NEXT SIBLING with the same position and z-index: equal z-index means
// paint order is document order, so we land ABOVE the wallpaper and BELOW
// every card (in-flow content paints above negative z-index). No !important,
// nothing overriding frontend styles, nothing to re-fix when hui-root changes
// -- and if this module fails to load, the wallpaper is simply still there.
//
// THE LUMINANCE CAP IS THE POINT
// The whole glass palette is tuned against a dark ground: the flat wallpaper
// this replaces measures 162/255 and sits under a scrim that brings it to ~61.
// Matching the Home app's Energy backdrop exactly would mean ~116, and lighter
// scrims than ~61 read too bright on a wall tablet. A bright blue noon sky
// throws all of that away and leaves rgba(255,255,255,0.12) plates invisible.
//
// So every sky is composited to an estimated mean luminance and scrimmed down
// to CAP. The palette below is authored deep for the same reason. CAP is the
// one knob worth touching:
//
//     61   the wallpaper this replaces
//     72   a deeper daytime blue
//     86   here
//    116   the Home app's own backdrop; too bright
//
// Past ~85 it starts costing glass-plate contrast.
//
// PERFORMANCE NOTES, because these run on wall tablets
//  - Every animation is a transform. Nothing animates background-position or
//    mask-position: those repaint the whole layer every frame, and the rain
//    runs at ~8 cycles a second.
//  - Each drifting layer overhangs on ONE side only, by exactly the distance
//    it travels, so the composited texture stays near viewport size instead of
//    three times it.
//  - Layers are only present when they have something to draw; stars do not
//    animate at all, because drift is imperceptible on a star field and it is
//    the one layer that would have to overhang a full tile to loop.
//  - Animations pause on visibilitychange. A wall tablet spends most of its
//    life behind the Fully screensaver, and a running compositor there is the
//    difference between an idle tablet and one warm to the touch all night.
(function () {
  'use strict';

  // Loaded from hk-loader.js on every page; hkReload() and a dev probe can
  // evaluate it again, so running twice has to be harmless: a second copy would own a SECOND
  // `mounted` variable, and the first copy's element would be orphaned on the
  // page with nothing left holding a reference to tear it down.
  if (window.hkSky) return;

  var CAP = 86;              // mean luminance ceiling, 0-255. See above.

  // IDLE DECKS. The kill switch for the whole optimization below: set to
  // false and every deck animates all the time, visible or not.
  //
  // The weather decks (.rain x2, .snow x2) and the cloud decks carry
  // `will-change:transform` UNCONDITIONALLY, so each one holds a composited
  // GPU layer LARGER THAN THE VIEWPORT (~1920x1720 for a rain deck, by the
  // arithmetic in the .rain/.snow note) and runs an infinite hk-fall/hk-drift
  // animation -- on a clear day, at opacity 0, for weather that is not
  // happening. That is the same waste the `.static` rule below already names:
  // "opacity:0 still composites every frame, which on a wall tablet is the
  // whole cost with none of the picture." `.bolt` is likewise already gated
  // with display:none. This extends the SAME idea to a LIVE sky in clear
  // weather, which is most of the time.
  //
  // A CLASS, never an inline style. `#hk-sky.static .cl` and friends carry no
  // !important, so an inline `animation:` would beat them and silently kill
  // the static-page optimization. The .idle rule is a class deeper than the
  // base rule, so specificity settles it and source order cannot bite.
  //
  // NO TIMER, deliberately. A deck stops mid-fall and then fades out over its
  // 3-4s opacity transition, i.e. rain hangs frozen in the air while it
  // disappears. That is accepted: it is what keeps this free of teardown
  // races (see watch()). Coming back is
  // seamless for a different reason: the class is dropped in the same paint()
  // where opacity is still 0, so the loop restarts at its origin unseen.
  var IDLE_INVISIBLE = true;
  var IDLE_BELOW = 0.04;           // decks under this opacity count as invisible
  var BASE = '/hk/sky/';
  // NO VERSION TO BUMP. /hk/ is served by custom_components/hk_frontend with
  // Cache-Control: no-cache: the browser revalidates each texture and gets a 304
  // unless gen_sky.py actually rewrote it. Regenerate and refresh; that is all.
  // (Under /local/, with its 31-day cache header, a regenerated texture at the
  // same URL never reaches a browser that already fetched the old one.)
  var VER = '';

  // Measured mean alpha of each generated texture, printed by the generator.
  // These feed the luminance estimate below -- guessing at cloud cover is what
  // would let a midday sky drift over CAP without anything noticing.
  // Re-measure whenever the textures change; the generator prints these.
  var CLOUD_ALPHA = { a: 0.200, b: 0.124, c: 0.130 };

  // ------------------------------------------------------------- seasons
  // Seasonal decoration, driven by the holiday season (hkSettings.seasonName:
  // the sensor chosen in Configure, or computed) and gated by the seasonal
  // switch chosen there. See docs/Seasonal-Decorations.md.
  //
  // EVERYTHING HERE IS A PHOTOGRAPH, and that is not an accident: drawn
  // versions -- a leaf silhouette, a bat, a tree, string lights -- do not
  // survive being looked at on a tablet. If something is added here later,
  // start from a picture.
  //
  // Measured with the same method as CLOUD_ALPHA above -- mean alpha over the
  // whole texture, mean luma over its ink -- because the scrim arithmetic is
  // only honest if these are measured rather than guessed.
  var SEASON = {
    leafA: 0.250, leafL: 123,      // mean of the six leaf faces (3 species x 2)
    branchA: 0.214, branchL: 18,   // full-frame BARE branch art (spooky only)
    canopyA: 0.084, canopyL: 99,   // the leafy autumn canopy (ordinary fall)
    moonA:  0.569, moonL: 177,     // the photographic moon, halo included
    fogA:   0.327, fogL: 161,      // one drifting mist texture
    webA:   0.019, webL: 167,      // the cobweb; almost entirely clear
    decorA: 0.105, decorL: 64,     // the one fixed Christmas decoration master
    xglowA: 0.095, xglowL: 190,    // a bulb halo BEFORE the feather mask
    snowA:  0.112, snowL: 184,     // mean of the three flake sprites
    sleighA: 0.180                 // forced to brightness(0), so luma 0
  };
  // Measured from the ENCODED .webp, not the PNG sources, with `dwebp -pam`
  // parsed in plain Python -- the cap arithmetic should describe what the page
  // actually loads. Conversion moved every figure by under 0.3 luma.
  //
  // Bats and the witch are left out of the estimate deliberately: each covers
  // well under half a percent of the frame (the witch also only 9% of the
  // time), which is below the rounding on CAP.
  //
  // WHY THE BRIGHT ONES ARE SAFE. moon, fog and web are all gated behind
  // `spooky`, which is night-only, and the night sky base is ~16 against a
  // CAP of 86. Composited in order these land at L ~= 28, so no scrim fires
  // at all. The branches actively DARKEN (luma 18 over 0.214 of the frame).

  // Three species, each a FRONT and a BACK face. The back is the real
  // underside -- paler, veined -- not the front mirrored, which is what a
  // single sprite on a rotateY gives you, and which never looks like a leaf
  // turning over.
  var LEAF_SPECIES = [
    [BASE + 'leaf-maple-f.webp', BASE + 'leaf-maple-b.webp'],
    [BASE + 'leaf-oak-f.webp',   BASE + 'leaf-oak-b.webp'],
    [BASE + 'leaf-birch-f.webp', BASE + 'leaf-birch-b.webp']
  ];
  // webp like every other sprite (the -src.png sources live in
  // tools/sky/src/).
  var BAT_FRAMES   = [BASE + 'bat1.webp', BASE + 'bat2.webp', BASE + 'bat3.webp'];
  // ONE full-viewport branch layer, not a pair hung in the corners. The art
  // reaches inward from every edge, so limbs pass BEHIND the cards instead of
  // stopping at a border -- which is the whole point of the composition.
  // Stationary by default: a sway on a full-frame bitmap repaints the entire
  // viewport every frame; a pair of corner branches only gets away with it
  // because each is under half the width.
  var BRANCH_IMG = BASE + 'branches-full.webp';
  // The leafy autumn canopy. Same full-viewport treatment as the bare
  // branches, and its OPPOSITE: one or the other, never both. Spooky nights
  // strip the leaves off the trees.
  var CANOPY_IMG = BASE + 'canopy.webp';
  var MOON_IMG   = BASE + 'moon-hallow.webp';
  var FOG_IMG    = BASE + 'fog-wisp.webp';
  var WEB_IMG    = BASE + 'web.webp';
  // The spooky moon's BOX in CSS px. The visible disc is smaller, because the
  // art carries its own halo (~315px of disc inside a 384px box), against a
  // 197px bare disc.
  var MOON_PX    = 384;
  // ...and the disc inside it: 0.85 of the box, measured on tools/sky/src/moon-hallow-src.png
  // (lit pixels span 872 of 1024 across, 860 down).
  var MOON_DISC  = 0.85;
  // The Christmas moon on the forecast screensaver: this share of MOON_PX.
  var XMAS_MOON  = 0.62;

  // THE WITCH. A solid-black silhouette with real alpha and no color to
  // correct, so she carries NO filter (no brightness(0) to blacken her).
  //   WITCH_INK    her broom tip to bristles, as a fraction of the image width
  //                (x 30..1005 of 1024); the image is 2:1.
  //   WITCH_SPAN   broom tip to bristles against the VISIBLE disc: 55-60%.
  //   WITCH_CYCLE  one flight per this many seconds of VISIBLE time. The whole
  //                sky pauses while hidden or asleep (#hk-sky.hidden), so a
  //                parked tablet never counts toward it.
  //   WITCH_FLIGHT the crossing itself, fade in to fade out.
  //   WITCH_FADE   each end of it.
  var WITCH_IMG    = BASE + 'witch-v2.webp';
  var WITCH_INK    = 975 / 1024;
  var WITCH_SPAN   = 0.575;
  var WITCH_CYCLE  = 170;
  var WITCH_FLIGHT = 13.5;
  var WITCH_FADE   = 0.9;
  //   WITCH_LINE   her flight line, from the moon's center, in discs (negative
  //                is up). NOT the center: at 1280x800 the status-chip row
  //                crosses the moon's middle, and the chips -- rightly in front
  //                of the whole sky -- would hide her body for the entire crossing.
  //                0.28 of a disc up is clear of them, and the disc is still
  //                270px wide there against her 187px.
  var WITCH_LINE   = -0.28;
  // Seconds into the witch's cycle, as a keyframe percentage.
  function pct(sec) { return (sec / WITCH_CYCLE * 100).toFixed(3); }
  // ONE fixed decoration master, full viewport: pine, ornaments, pinecones,
  // stockings, wire and steadily lit bulbs. NOT four frames.
  //
  // Separately generated "light frames" do not work: the pine edges MOVE
  // between them, because regenerating the whole frame regenerates the
  // foliage too. Four full-viewport frames would also cost ~65 MB decoded.
  // So the greenery is one stationary image and only small local halos
  // animate -- 0.4 MB decoded for the glow tile against 16 MB per extra full
  // frame, and the needles provably cannot drift.
  var XDECOR = BASE + 'xdecor.webp';
  // Every full-screen frame is painted at a wall tablet's 16:10 (2560x1600).
  var FRAME_ASPECT = 16 / 10;
  // NARROW SCREENS: each frame is drawn as its two edges, fitted to the
  // height. Each edge is NARROW_HALF of the width and solid over the outer
  // NARROW_SOLID of itself; the rest fades to nothing, so the two overlap
  // and cross-fade through the middle instead of meeting on a hard seam
  // (see .narrow in the CSS, and the bulb placement in cozyWindow).
  var NARROW_HALF = 0.66;
  var NARROW_SOLID = 0.55;
  var XGLOW  = BASE + 'xglow.webp';
  var SLEIGH = BASE + 'sleigh.webp';
  var SNOW_SPRITES = [BASE + 'xsnow1.webp', BASE + 'xsnow2.webp',
                      BASE + 'xsnow3.webp'];
  // Normalized bulb-core anchors picked off the master by inspection. The
  // glow boxes are placed on these, so they must stay in step with the art --
  // a new master means new anchors.
  var BULBS = [
    [0.035, 0.036], [0.068, 0.020], [0.119, 0.008], [0.225, 0.040],
    [0.342, 0.026], [0.410, 0.043], [0.498, 0.021], [0.559, 0.039],
    [0.704, 0.056], [0.763, 0.040], [0.818, 0.008], [0.925, 0.019],
    [0.968, 0.068], [0.013, 0.206], [0.010, 0.397], [0.010, 0.575],
    [0.015, 0.955], [0.982, 0.224], [0.988, 0.611], [0.985, 0.946]
  ];

  // Deterministic PRNG. NOT Math.random(): paint() runs every 3s and on every
  // navigation, and a random field would be rebuilt differently each time --
  // leaves would jump to new positions whenever you tapped between pages.
  function rng(seed) {
    var a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- palette
  // Keyframes by sun elevation, in degrees. Four stops top-to-bottom:
  // zenith, upper, mid, horizon. Authored deep on purpose (see CAP above) --
  // a dusk-weighted sky, not a postcard noon.
  var SKY = [
    [ 60, ['#0d2f57', '#154272', '#256192', '#5b93b8']],
    [ 25, ['#0e2d54', '#17406d', '#2a5f8b', '#6f9dbc']],
    [ 10, ['#122a4a', '#1d3d63', '#3f5c81', '#9b8a92']],
    [  4, ['#141f3d', '#26314f', '#5c4460', '#b06a4a']],
    [  0, ['#101a33', '#1e2742', '#4a3552', '#9a5238']],
    [ -4, ['#0c1428', '#161d35', '#33263f', '#5e3730']],
    [-10, ['#080e1d', '#0e1428', '#1b1a2e', '#2e2233']],
    [-18, ['#04070f', '#060a16', '#0a0f1f', '#111726']]
  ];

  // Cloud tint by elevation. Clouds lit warm from below at sunset is the
  // single cue that reads as "sunset" rather than "dark blue picture".
  var CLOUD = [
    [ 25, ['#dbe8f2', '#a8c0d4']],
    [ 10, ['#d6dbe4', '#93a2b6']],
    [  4, ['#e8b79a', '#a2708a']],
    [  0, ['#d99a76', '#7d5570']],
    [ -4, ['#8d6360', '#4b3a52']],
    [-10, ['#3d3948', '#26243a']],
    [-18, ['#1c1f2e', '#141828']]
  ];

  // ------------------------------------------------------------- color util
  function hex(c) {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16),
            parseInt(c.substr(5, 2), 16)];
  }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ','
                  + Math.round(A[1] + (B[1] - A[1]) * t) + ','
                  + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function luma(c) {
    // Rec.709. Accepts both the '#rrggbb' of the tables and the 'rgb()' that
    // mix() returns, because ramp() output feeds straight into the estimate.
    var v = c.charAt(0) === '#' ? hex(c)
                                : c.replace(/[^\d,]/g, '').split(',').map(Number);
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  // Interpolate a keyframe table at elevation `e`. Tables run high -> low.
  function ramp(table, e) {
    if (e >= table[0][0]) return table[0][1].slice();
    var last = table.length - 1;
    if (e <= table[last][0]) return table[last][1].slice();
    for (var i = 0; i < last; i++) {
      var hi = table[i], lo = table[i + 1];
      if (e <= hi[0] && e > lo[0]) {
        var t = (hi[0] - e) / (hi[0] - lo[0]);
        return hi[1].map(function (c, k) { return mix(c, lo[1][k], t); });
      }
    }
    return table[last][1].slice();
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  // ------------------------------------------------------------- conditions
  // HA's weather states, collapsed to what the sky actually has to draw.
  // The seasonal leaves read wind in MPH. A weather entity declares its own
  // wind_speed_unit -- the entity's choice, not a guarantee -- and a units
  // change in HA would silently make every drift and duration wrong rather
  // than fail. So convert from whatever it declares.
  function toMph(v, unit) {
    switch (unit) {
      case 'km/h': return v * 0.621371;
      case 'm/s':  return v * 2.236936;
      case 'kn':   return v * 1.150779;
      case 'ft/s': return v * 0.681818;
      default:     return v;                       // mph, or undeclared
    }
  }

  var WET = {
    rainy:             { kind: 'rain', rate: 0.55 },
    pouring:           { kind: 'rain', rate: 1.00 },
    'lightning-rainy': { kind: 'rain', rate: 0.85, bolt: true },
    lightning:         { kind: 'none', rate: 0,    bolt: true },
    hail:              { kind: 'rain', rate: 0.75 },
    snowy:             { kind: 'snow', rate: 0.70 },
    'snowy-rainy':     { kind: 'snow', rate: 0.50 }
  };

  // Cloud cover to fall back on when the integration gives us no number.
  var FALLBACK_COVER = {
    'clear-night': 2, sunny: 4, partlycloudy: 42, cloudy: 85, fog: 95,
    rainy: 88, pouring: 96, 'lightning-rainy': 96, lightning: 78,
    hail: 92, snowy: 92, 'snowy-rainy': 92, windy: 30, 'windy-variant': 55,
    exceptional: 60
  };

  function read(hass) {
    var sun = hass.states['sun.sun'];
    // Which weather entity, moon source and seasonal gate: Configure ->
    // Weather and Seasonal sky (hk-settings.js), with generic fallbacks when unset.
    var HS = window.hkSettings;
    var wid = HS ? HS.weatherId(hass.states) : null;
    var w = wid ? hass.states[wid] : null;
    var a = (w && w.attributes) || {};
    var cond = (w && w.state) || 'sunny';

    // cloud_coverage is an ATTRIBUTE on the weather entity, and the attribute
    // is where it is read from -- not from a sensor. OpenWeatherMap's weather
    // entity, for one, carries cloud_coverage alongside temperature,
    // humidity, wind and the rest.
    //
    // Its separate sensor.openweathermap_cloud_coverage is deliberately not
    // used: the attribute
    // and the sensor come from the same coordinator refresh, and reading one
    // entity for the whole sky rather than two keeps this function a single
    // lookup with a single failure mode.
    //
    // Fall back to the condition when the attribute is missing.
    var cover = a.cloud_coverage;
    if (cover === undefined || cover === null || !isFinite(Number(cover))) {
      cover = FALLBACK_COVER[cond];
      if (cover === undefined) cover = 40;
    }

    var out = {
      elev: num(sun && sun.attributes && sun.attributes.elevation, 0),
      azim: num(sun && sun.attributes && sun.attributes.azimuth, 180),
      cover: clamp(Number(cover), 0, 100) / 100,
      wind: clamp(toMph(num(a.wind_speed, 5), a.wind_speed_unit), 0, 40),
      cond: cond,
      fog: cond === 'fog',
      wet: WET[cond] || { kind: 'none', rate: 0 },
      moon: HS ? HS.moon(hass.states) : 0.5,
      season: seasonOf(hass),
      // seasonOf() folds this gate in already (it returns '' when the gate is
      // off), but the surprise selector needs it on its own: most surprises
      // fire on days when no season is running at all, so there is no season
      // string to carry the gate for them.
      seasonalOn: HS ? HS.seasonalOn(hass.states) : true
    };
    // DEV PIN. Null in normal operation. When set, its fields override the
    // live reading for EVERY tick -- which is the only way to hold a scene
    // still on a tablet. Driving hkSkyAt() on a short interval instead does
    // not work: the module's own 3s tick keeps painting the real, seasonless
    // state in between, so the season key flips and the whole field is torn
    // down and rebuilt every three seconds. That thrash is invisible in a
    // screenshot and shows up as a halved 5th-percentile frame rate, which
    // reads as "the decoration is expensive" when it is nothing of the kind.
    if (PIN) for (var k in PIN) if (PIN.hasOwnProperty(k)) out[k] = PIN[k];
    return out;
  }

  // ------------------------------------------------------------------- moon
  // The terminator is an ellipse whose x-radius is R*|cos(2*pi*phase)|.
  // phase 0 is new, 0.5 full; waxing (phase < 0.5) is lit on the right.
  function moonSvg(phase, R) {
    var c = Math.cos(2 * Math.PI * phase);
    var rx = Math.abs(c) * R;
    var outer = phase < 0.5 ? 1 : 0;          // which limb is lit
    // Gibbous: the terminator bulges the SAME way as the outer arc.
    // Crescent: it bulges against it. That is the whole difference.
    var inner = c < 0 ? outer : 1 - outer;
    var d = 'M 0,' + (-R)
          + ' A ' + R + ',' + R + ' 0 0,' + outer + ' 0,' + R
          + ' A ' + rx.toFixed(2) + ',' + R + ' 0 0,' + inner + ' 0,' + (-R);
    var S = R * 2 + 4;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S +
      '" viewBox="' + (-S / 2) + ' ' + (-S / 2) + ' ' + S + ' ' + S + '">' +
      '<defs><radialGradient id="g" cx="38%" cy="34%">' +
      '<stop offset="0" stop-color="#fffdf4"/>' +
      '<stop offset="1" stop-color="#d9d6c4"/></radialGradient></defs>' +
      '<path d="' + d + '" fill="url(#g)"/></svg>');
  }

  // ------------------------------------------------------------------ style
  // NOTE: this is called SHEET, not CSS. Naming it CSS would shadow the global
  // CSS object inside this IIFE and silently break CSS.registerProperty below,
  // which would cost the cross-fade with no error anywhere.
  var SHEET = [
    '#hk-sky{position:fixed;inset:0;z-index:-1;contain:strict;pointer-events:none;',
    '  background:#05070e}',
    '#hk-sky>*{position:absolute;inset:0}',

    // Sky gradient. The stops are registered custom properties (see register()),
    // so the whole gradient cross-fades on its own as the sun moves.
    '#hk-sky .grad{background:linear-gradient(to bottom,',
    '  var(--sk0) 0%,var(--sk1) 42%,var(--sk2) 72%,var(--sk3) 100%)}',

    // Sun / moon halo, placed by the sun's real azimuth and elevation, so the
    // bright side of the sky is the side it is actually on.
    '#hk-sky .glow{background:radial-gradient(circle var(--glowR) at var(--glowX) var(--glowY),',
    '  var(--glowC) 0%,transparent 70%);opacity:var(--glowO);transition:opacity 3s linear}',

    // Static: drift on a star field is imperceptible, and animating it would
    // mean overhanging a full 1024px tile to loop seamlessly.
    '#hk-sky .stars{background:url(' + BASE + 'stars.png' + VER + ') repeat;',
    '  background-size:1024px 1024px;opacity:var(--starO);transition:opacity 6s linear}',

    '#hk-sky .moon{inset:auto;width:var(--moonS);height:var(--moonS);',
    '  left:var(--moonX);top:var(--moonY);',
    '  margin:calc(var(--moonS)/-2) 0 0 calc(var(--moonS)/-2);',
    '  background:var(--moonI) center/contain no-repeat;opacity:var(--moonO);',
    '  filter:drop-shadow(0 0 12px rgba(214,226,255,.34));transition:opacity 6s linear}',

    // Cloud decks: one texture each, used as a MASK over a gradient fill, so
    // the same three files recolor from noon white through sunset pink to
    // storm gray without needing a variant per condition.
    //
    // repeat-x only, with the band height set per layer: clouds belong in the
    // sky, and tiling vertically would stack cloud bands down to the ground.
    // The overhang is on the RIGHT only and is exactly --tw, the distance the
    // layer travels -- enough to loop seamlessly, and no more texture memory
    // than that costs.
    '#hk-sky .cl{top:-3%;bottom:-3%;left:0;right:calc(-1 * var(--tw));',
    '  -webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;',
    '  -webkit-mask-size:var(--tw) var(--th);mask-size:var(--tw) var(--th);',
    '  -webkit-mask-position:0 0;mask-position:0 0;',
    '  background:linear-gradient(to bottom,var(--clTop),var(--clBot));',
    '  opacity:var(--o);will-change:transform;transition:opacity 4s linear;',
    '  animation:hk-drift var(--d) linear infinite}',
    // --tw is DOUBLE the textures' natural feature width. At 640/440/280 each
    // deck would repeat 2 / 2.9 / 4.6 times across a 1280px tablet and the
    // same cloud shapes would be recognizable more than once. The textures
    // are 2048 wide holding twice as much content at the SAME
    // feature size (gen_sky.py, xrep=2), so drawing them at double the width
    // halves the repetition without changing how big a cloud looks.
    //
    // IF YOU CHANGE THESE, change the `tw` map in paint() too -- the drift
    // duration is derived from it, and a mismatch makes the loop jump.
    '#hk-sky .cl.a{--tw:1280px;--th:66%;-webkit-mask-image:url(' + BASE + 'clouds-a.png' + VER + ');',
    '  mask-image:url(' + BASE + 'clouds-a.png' + VER + ')}',
    '#hk-sky .cl.b{--tw:880px;--th:54%;-webkit-mask-image:url(' + BASE + 'clouds-b.png' + VER + ');',
    '  mask-image:url(' + BASE + 'clouds-b.png' + VER + ')}',
    '#hk-sky .cl.c{--tw:560px;--th:42%;-webkit-mask-image:url(' + BASE + 'clouds-c.png' + VER + ');',
    '  mask-image:url(' + BASE + 'clouds-c.png' + VER + ')}',

    // Rain: two gradient sheets at slightly different angles and speeds. One
    // sheet alone reads as a moving texture; two read as depth. No per-drop
    // DOM and no canvas -- one composited layer each.
    //
    // The travel is computed in JS along the gradient's own axis and is a whole
    // number of pattern periods, which is the only way the loop is seamless at
    // an arbitrary angle. --pad is that travel, so the overhang again costs
    // exactly what the motion needs.
    // Overhang on the TOP ONLY -- the header's "overhang by exactly the
    // distance it travels" rule. These layers only move down, so padding the
    // other three sides buys nothing and costs real composited area: at a
    // 512px tile on a 1920x1200 tablet, all-sides padding is 2960x2240 per
    // deck against 1920x1720 for this. The element still covers the viewport
    // at the end of the travel, because it starts pad above the top and moves
    // down by pad-8.
    '#hk-sky .rain,#hk-sky .snow{inset:calc(-1 * var(--pad)) 0 0 0;',
    '  opacity:var(--o);will-change:transform;transition:opacity 3s linear;',
    '  animation:hk-fall var(--d) linear infinite}',
    // See IDLE_INVISIBLE. Two classes deep so it outranks the base .rain/.snow
    // and .cl rules whatever the source order; `will-change:auto` is the half
    // that actually hands the GPU layer back, since `animation:none` alone
    // stops the ticks but keeps the texture promoted.
    '#hk-sky .cl.idle,#hk-sky .rain.idle,#hk-sky .snow.idle{',
    '  animation:none;will-change:auto}',
    '#hk-sky .rain{background-repeat:repeat;background-size:var(--fS)}',
    '#hk-sky .rain.r1{background-image:url(' + BASE + 'rain-a.png' + VER + ')}',
    '#hk-sky .rain.r2{background-image:url(' + BASE + 'rain-b.png' + VER + ')}',
    '#hk-sky .snow{background:url(' + BASE + 'flakes.png' + VER + ') repeat;',
    '  background-size:var(--fS)}',

    '#hk-sky .fog{background:linear-gradient(to bottom,',
    '  rgba(178,188,198,.06),rgba(178,188,198,.26));',
    '  opacity:var(--fogO);transition:opacity 4s linear}',
    '#hk-sky .bolt{background:radial-gradient(circle at 62% 22%,',
    '  rgba(226,238,255,.85),transparent 55%);',
    '  opacity:0;animation:hk-bolt 17s linear infinite}',

    // GRAIN. The weather sky always has clouds, stars or rain moving through
    // it, so it never reads as a flat fill. A static palette is a pure
    // four-stop gradient, and a gradient that size looks like exactly what it
    // is. There is a second, duller reason too: an 8-bit gradient across
    // 1280px BANDS visibly, and grain dithers those steps away.
    //
    // `overlay` rather than a plain translucent layer: overlay lightens where
    // the texture is above mid gray and darkens where it is below, so it works
    // on the dark top and the bright horizon of the same gradient without
    // washing either out. The texture is authored around 128 for that reason
    // (tools/sky/gen_sky.py, grain()).
    //
    // ABOVE the weather layers and BELOW the scrim, so the scrim still darkens
    // everything uniformly and CAP's arithmetic is unaffected -- grain has a
    // mean of zero by construction and does not move the luminance the scrim
    // is calibrated against.
    // On /hk/ the grain revalidates like every other texture, so the URL is
    // plain and goes through BASE with the others.
    '#hk-sky .grain{background-image:url(' + BASE + 'grain.png' + VER + ');',
    '  background-repeat:repeat;background-size:512px 512px;',
    '  mix-blend-mode:overlay;opacity:var(--grainO,0);transition:opacity 1.2s linear}',

    // SNAP. Every layer in here carries a multi-second opacity/background
    // transition, which is right while a page is SITTING there -- weather
    // easing from sunny to overcast should ease. It is wrong on NAVIGATION:
    // the sky element survives a view swap (see watch()), so arriving on Timers
    // from Weather would leave the weather sky visibly melting away over the
    // new page for several seconds -- the previous page's background bleeding
    // through.
    //
    // This class is added for the single paint that follows a path change and
    // removed on the next frame, so a navigation is a clean cut and everything
    // afterwards still eases. `*` rather than a list of selectors: it must
    // catch the scrim's `background` transition and the layers' `opacity` ones
    // alike, and any layer added later gets it for free.
    '#hk-sky.hk-snap,#hk-sky.hk-snap *{transition:none !important}',

    // THE ALBUM LAYER. blur is what makes this a WASH rather than a picture:
    // at 72px nothing of the cover survives but its color fields, which is
    // the whole point: a pop of color, not wallpaper.
    //
    // inset is negative and it has to be: a blur samples beyond its own edge,
    // so a layer blurred at 72px and pinned to the viewport fades to
    // transparent for ~72px on every side. Overhanging by more than the blur
    // radius keeps the color running to the screen edge.
    //
    // saturate lifts what the blur averages away; a heavy blur pulls every
    // cover toward its mean, which is duller than any part of it.
    '#hk-sky .art{position:absolute;inset:-120px;background-size:cover;',
    '  background-position:center;filter:blur(72px) saturate(1.5);',
    '  opacity:var(--artO,0);transition:opacity 1.2s linear,background-image 0s}',

    // The scrim is what keeps the glass plates readable -- see CAP.
    '#hk-sky .scrim{background:linear-gradient(to bottom,',
    '  rgba(0,0,0,var(--scT)),rgba(0,0,0,var(--scB)));transition:background 4s linear}',

    // var() inside a keyframe resolves per element, so all the drifting and
    // falling layers share one pair of keyframes and differ only in their
    // own --tw / --fx / --fy.
    '@keyframes hk-drift{from{transform:translate3d(0,0,0)}',
    '  to{transform:translate3d(calc(-1 * var(--tw)),0,0)}}',
    '@keyframes hk-fall{from{transform:translate3d(0,0,0)}',
    '  to{transform:translate3d(var(--fx),var(--fy),0)}}',
    '@keyframes hk-bolt{0%,4.6%,100%{opacity:0}4.8%{opacity:.9}5.4%{opacity:.05}',
    '  5.8%{opacity:.7}6.6%{opacity:0}}',

    // ...and hand the GPU layers back while it is paused. animation-play-state
    // alone stops the ticks but `will-change:transform` keeps every deck's
    // composited texture resident -- each one LARGER than the viewport -- so a
    // cloudy night would hold tens of MB frozen behind the WallPanel
    // screensaver for no picture at all. Same lever as the .idle rule (see
    // IDLE_INVISIBLE); the cost is a one-off re-promotion on wake, when the
    // tablet is already re-rendering the whole page anyway.
    '#hk-sky.hidden *{animation-play-state:paused!important;',
    '  will-change:auto!important}',
    // A static page has no weather, so the drifting and falling layers are not
    // merely invisible at opacity 0 -- they are switched off. opacity:0 still
    // composites every frame, which on a wall tablet is the whole cost with
    // none of the picture. The opacity TRANSITION still runs, so arriving from
    // a weather page still cross-fades them away rather than blinking.
    '#hk-sky.static .cl,#hk-sky.static .rain,#hk-sky.static .snow{',
    // will-change too, for the same reason as the .idle and .hidden rules:
    // stopping the animation leaves the oversized composited texture resident,
    // and a static page is showing none of it.
    '  animation:none;will-change:auto}',
    // A tablet that asks for reduced motion gets a still sky, not a broken one.
    // REDUCED MOTION KILLS THE WHOLE SKY -- and on an Android tablet that flag
    // can be set without anyone having chosen it. WebView derives
    // prefers-reduced-motion:reduce from Settings.Global.ANIMATOR_DURATION_SCALE
    // == 0, which Samsung's Accessibility -> Remove animations, Power saving
    // mode, and Developer options -> Animator duration scale all write to.
    //
    // A STALE ZERO CAN OUTLIVE THE SETTING. On a Samsung tablet (SM-X210) with
    // Remove animations once on, turning it OFF does not clear it, and neither
    // does restarting Fully -- all three animation scales in Developer options
    // read 1x, yet WebView still reports reduce, and the sky is frozen while
    // every other animation on the page runs. Only a full REBOOT of the tablet
    // clears it. So if a sky is frozen on one tablet and nothing else is,
    // reboot it before touching this file.
    //
    // Diagnosing this from a screenshot is impossible (a Fully capture cannot
    // see the #hk-sky layer at all). /hk/pages/skyprobe.html
    // (frontend/pages/skyprobe.html) is the tool: load it on the tablet with
    // Fully Kiosk's load_url and read the answer back out of the tablet's
    // current-page sensor, which reports the full URL. It carries a copy of
    // the rule below, so `guard=0` means this line is what is firing rather
    // than something else.
    // ------------------------------------------------------ seasons
    // The season container sits BELOW .grain and .scrim (see build()), so
    // every seasonal layer is scrimmed with the rest of the sky instead of
    // floating over the cap. The garland is the one where this matters most:
    // it is bright and covers a third of the frame.
    '#hk-sky .season{position:absolute;inset:0;overflow:hidden;',
    '  pointer-events:none;transition:opacity 1.2s linear}',

    // Leaves are INDIVIDUAL ELEMENTS, not a tiled deck like rain and snow.
    // A tiled bitmap bakes each leaf's rotation in permanently -- the deck can
    // only translate -- so no leaf can ever twirl, flip or turn edge-on. Rain
    // gets away with that because a raindrop has no orientation to lose.
    // 20 elements of ~40px also cost far LESS than the two composited layers
    // larger than the viewport that a pair of decks would need.
    '#hk-sky .leaffield{position:absolute;inset:0;overflow:hidden;',
    '  perspective:650px;filter:brightness(var(--lbri,1)) saturate(var(--lsat,1))}',
    // preserve-3d on BOTH the faller and the tumbler, or the two faces
    // collapse into one plane and backface-visibility never gets a chance to
    // hide either of them.
    '#hk-sky .lf{position:absolute;top:-90px;will-change:transform;',
    '  transform-style:preserve-3d;',
    '  animation:hk-leaffall var(--fd) linear var(--fdel) infinite}',
    // NOTHING that groups may sit on this element. `filter` and `opacity`
    // below 1 both force a used transform-style of FLAT, which would flatten
    // the faces into it and show front and back at once. The per-leaf
    // brightness/saturation/opacity therefore live on the faces, and the
    // field-wide pair on .leaffield (whose own flattening is harmless -- it
    // has no 3D of its own, and `perspective` still projects its children).
    '#hk-sky .lf > i{display:block;width:100%;height:100%;position:relative;',
    '  transform-style:preserve-3d;',
    '  animation:hk-leaftumble var(--td) linear var(--tdel) infinite}',
    '#hk-sky .lf u{position:absolute;inset:0;display:block;',
    '  background-repeat:no-repeat;background-position:center;',
    '  background-size:contain;',
    // --a is per-leaf JITTER around 1; --lopa is the scene level, inherited
    // from .season and rewritten on every paint. Splitting them is what lets
    // dusk be gradual instead of a rebuild.
    '  filter:brightness(var(--b)) saturate(var(--s));',
    '  opacity:calc(var(--a) * var(--lopa,.64));',
    '  -webkit-backface-visibility:hidden;backface-visibility:hidden}',
    '#hk-sky .lf u.f{background-image:var(--spf)}',
    // Pre-rotated a half turn so it faces the other way from the start; the
    // tumble then carries the pair round together.
    '#hk-sky .lf u.b{background-image:var(--spb);transform:rotateY(180deg)}',
    // The sway is folded into the FALL keyframes rather than a third nested
    // div: both are translations, so one animation carries them, and it
    // returns to x=0 so the loop is seamless.
    // Sway AND net drift are folded into the fall keyframes rather than given
    // their own wrapper element: all three are translations, so one animation
    // carries them at no extra cost, and --dr/--sw can be rewritten live
    // because a custom property change re-evaluates the keyframes without
    // restarting the animation. Durations cannot, which is why wind is
    // bucketed into the season key instead of applied continuously.
    '@keyframes hk-leaffall{',
    '  0%{transform:translate3d(0,0,0)}',
    '  25%{transform:translate3d(calc(var(--dr) * .25 + var(--sw)),',
    '       calc(var(--dist) * .25),0)}',
    '  50%{transform:translate3d(calc(var(--dr) * .5),calc(var(--dist) * .5),0)}',
    '  75%{transform:translate3d(calc(var(--dr) * .75 - var(--sw)),',
    '       calc(var(--dist) * .75),0)}',
    '  100%{transform:translate3d(var(--dr),var(--dist),0)}}',
    // Spin and flip are WHOLE turns, so this loops seamlessly too. rotateY
    // under the field's perspective is what takes a leaf edge-on and shows
    // its back.
    '@keyframes hk-leaftumble{',
    '  from{transform:rotateZ(var(--z0)) rotateY(0deg) rotateX(0deg)}',
    '  to{transform:rotateZ(calc(var(--z0) + var(--spin))) rotateY(var(--flip))',
    '     rotateX(var(--tilt))}}',

    // Bats: a three-frame flap, one stacked layer per frame, each shown for
    // its quarter(s) of the beat by an OPACITY step. step-end makes each
    // frame hold; without it they cross-fade into three dissolving bats.
    // NOT a background-image keyframe list: Chrome runs an image animation
    // on the main thread, a style recalc and repaint every frame. Measured on
    // a room page at 4x CPU throttle: 59 style recalcs/s and ~10 points of
    // main-thread busy for three bats, on every sky page for the whole
    // season; as opacity steps the compositor runs them (4 recalcs/s, the
    // page's own). The layers start at opacity 0, so with animations off
    // (reduced motion) a bat is invisible.
    '#hk-sky .bat{position:absolute;left:0;will-change:transform;',
    '  animation:hk-batfly var(--bd) linear var(--bdel) infinite}',
    '#hk-sky .bat i{position:absolute;inset:0;opacity:0;',
    '  background-repeat:no-repeat;background-size:contain;',
    '  background-position:center}',
    '#hk-sky .bat .f1{animation:hk-bat1 var(--fl) step-end infinite}',
    '#hk-sky .bat .f2{animation:hk-bat2 var(--fl) step-end infinite}',
    '#hk-sky .bat .f3{animation:hk-bat3 var(--fl) step-end infinite}',
    '@keyframes hk-batfly{',
    '  0%{transform:translate3d(var(--x0),0,0)}',
    '  25%{transform:translate3d(calc(var(--x0) + var(--xd) * .25),-20px,0)}',
    '  50%{transform:translate3d(calc(var(--x0) + var(--xd) * .5),12px,0)}',
    '  75%{transform:translate3d(calc(var(--x0) + var(--xd) * .75),-15px,0)}',
    '  100%{transform:translate3d(calc(var(--x0) + var(--xd)),0,0)}}',
    // frame 1, 2, 3, 2 -- a quarter each
    '@keyframes hk-bat1{0%{opacity:1}25%,100%{opacity:0}}',
    '@keyframes hk-bat2{0%{opacity:0}25%{opacity:1}50%{opacity:0}75%,100%{opacity:1}}',
    '@keyframes hk-bat3{0%,25%{opacity:0}50%{opacity:1}75%,100%{opacity:0}}',

    // Branches: ONE full-viewport photographic layer that reaches in from
    // every edge, so limbs continue behind the cards. 100% 100% rather than
    // cover, because the art is authored at a wall tablet's 16:10 and any
    // other fit crops the inward-reaching limbs off.
    //
    // No animation and no will-change on purpose: it is the size of the
    // screen, so promoting it costs a full-viewport GPU layer to move
    // nothing, and a sway would repaint every pixel each frame.
    '#hk-sky .branches{position:absolute;inset:0;',
    '  background:url(' + BRANCH_IMG + ') center/100% 100% no-repeat;',
    '  opacity:var(--bro,.78)}',

    // The leafy canopy. Lit by the SAME inherited variables as the leaves, so
    // the tree and the leaves falling off it always agree -- and both update
    // on the 3s paint without anything being rebuilt.
    '#hk-sky .canopy{position:absolute;inset:0;',
    '  background:url(' + CANOPY_IMG + ') center/100% 100% no-repeat;',
    '  filter:brightness(var(--lbri,1)) saturate(var(--lsat,1))}',

    // The cobweb, upper right, stationary. 0.019 mean alpha -- it costs
    // essentially nothing and reads only when you look for it.
    '#hk-sky .cobweb{position:absolute;top:0;right:0;',
    '  background:url(' + WEB_IMG + ') top right/100% 100% no-repeat;',
    '  opacity:var(--weo,.28)}',

    // Ground fog: a shallower, denser band than the stock full-height .fog,
    // plus drifting wisps. The flat gradient alone read as haze, because fog
    // MOVES -- the gradient supplies the density, the wisps the life.
    '#hk-sky .gfog{position:absolute;inset:auto 0 0 0;height:62%;',
    '  background:linear-gradient(to bottom,rgba(150,164,178,0),',
    '    rgba(163,172,186,.22) 45%,rgba(186,191,200,.46) 78%,',
    '    rgba(198,200,206,.58));',
    '  opacity:var(--gfo,0);transition:opacity 4s linear}',
    // Wisps are a feathered mist texture rather than a blurred
    // radial gradient -- blur() on a moving element is a per-frame filter pass
    // over its whole box, which is exactly what not to put on a tablet.
    //
    // ALTERNATE, not a loop: the texture is not tileable, so running it one
    // way and wrapping would show a hard seam on every pass.
    '#hk-sky .fwisp{position:absolute;background-repeat:no-repeat;',
    '  background-size:100% 100%;background-image:url(' + FOG_IMG + ');',
    '  opacity:var(--wo);will-change:transform;',
    '  animation:hk-fwisp var(--wt) ease-in-out var(--wdel) infinite alternate}',
    '@keyframes hk-fwisp{from{transform:translate3d(var(--wa),0,0)}',
    '  to{transform:translate3d(var(--wb),0,0)}}',

    // DEPTH INSIDE THE SEASON, BY NUMBER, NOT BY APPEND ORDER. Appended after
    // the branches, the witch would fly IN FRONT of them. Back to
    // front: the moon (a stock layer, before .season in the sky), the mist and
    // bats (no z-index), the witch (1), the branches and cobweb (2), then the
    // cards, which sit above the whole sky. `isolation` makes .season its own
    // stacking context, so these numbers can never lift anything out of it and
    // over .grain and .scrim.
    '#hk-sky .season{isolation:isolate}',
    // BESIDE AN OPEN MENU: a page's decorations start where the page does
    // (hk-menu.js --hk-page-left: the docked menu's right edge, else
    // Home Assistant's sidebar or 0), so a canopy or a garland is never laid
    // out behind the menu; the sky itself still runs under it, blurred by
    // its glass -- the screensaver does the same beside its calendar pane.
    // Not the screensaver's own sky, which fills its screen.
    '#hk-sky:not(.own) .season{left:var(--hk-page-left,0px)}',
    '#hk-sky .season .witch{z-index:1}',
    '#hk-sky .season :is(.branches,.cobweb){z-index:2}',

    // The witch. Transform and opacity only: she is laid out once at the START
    // of her flight (left/top, see witchFly) and the keyframes move her from
    // there, fading in and out INSIDE the viewport. opacity:0 at rest, so a
    // stopped animation (a static page) leaves nothing on screen.
    '#hk-sky .witch{position:absolute;opacity:0;pointer-events:none;',
    '  background:url(' + WITCH_IMG + ') center/100% 100% no-repeat;',
    '  will-change:transform,opacity;',
    '  animation:hk-witchfly ' + WITCH_CYCLE + 's linear var(--wdel) infinite}',
    // The flight is the first WITCH_FLIGHT seconds of the cycle; she is
    // invisible for the rest. That is what makes it an EVENT, not a carousel.
    '@keyframes hk-witchfly{',
    '  0%{transform:translate3d(0,0,0);opacity:0}',
    '  ' + pct(WITCH_FADE) + '%{opacity:1}',
    '  ' + pct(WITCH_FLIGHT - WITCH_FADE) + '%{opacity:1}',
    '  ' + pct(WITCH_FLIGHT) + '%,100%{',
    '    transform:translate3d(var(--wdx),var(--wdy),0);opacity:0}}',
    // No flight at all for reduced motion -- not a witch frozen in the sky.
    '@media (prefers-reduced-motion:reduce){#hk-sky .witch{display:none}}',

    // The spooky moon is a PHOTOGRAPH with its own silver-blue halo baked in,
    // so it takes no warm sepia/hue-rotate "harvest moon" stack -- run on
    // this art that just tints the photo orange.
    // One soft cool bloom to seat it against the sky, nothing more.
    '#hk-sky .moon.hallow{filter:drop-shadow(0 0 26px rgba(186,206,238,.30))}',

    // The Christmas decoration: ONE stationary full-viewport image. inset:0,
    // NOT a cropped 2560x420 band -- the side sprigs and the stockings
    // need the full height, and a band would crop them off.
    '#hk-sky .xdecor{position:absolute;inset:0;',
    '  background:url(' + XDECOR + ') center/100% 100% no-repeat}',

    // NARROW SCREENS -- taller than wide, a phone held upright. Every
    // full-screen frame (canopy, branches, the Christmas decoration, the
    // surprise frames) is painted at a wall tablet's 16:10 and drawn 100%
    // 100%, which is exact there; a portrait phone would squeeze it to a
    // third of its width. Here each frame keeps its true shape: fitted to the HEIGHT, the
    // art's LEFT edge fills the left of the screen and its RIGHT edge the
    // right, so the limbs and corners still reach in from both sides. Only
    // the art's middle -- behind the cards on a tablet -- is left out.
    // (paintSeason sets .narrow; the edges are ::before / ::after, so the
    // layer's own opacity and filter still apply to both.)
    //
    // THE TWO EDGES OVERLAP AND CROSS-FADE. At 50% each they would meet on a
    // hard vertical line down the middle of the phone, with limbs from two
    // unrelated parts of the art cut off against each other. Each edge is
    // NARROW_HALF wide,
    // solid over its outer NARROW_SOLID and masked to nothing over the rest,
    // so through the middle third one set of limbs dissolves while the other
    // appears. Verified at 402x874: no seam, both sides still framed.
    '#hk-sky .canopy{--frame:url(' + CANOPY_IMG + ')}',
    '#hk-sky .branches{--frame:url(' + BRANCH_IMG + ')}',
    '#hk-sky .xdecor{--frame:url(' + XDECOR + ')}',
    '#hk-sky .sp-frame{--frame:var(--spf)}',
    '#hk-sky .season.narrow :is(.canopy,.branches,.xdecor,.sp-frame){background-image:none}',
    '#hk-sky .season.narrow :is(.canopy,.branches,.xdecor,.sp-frame)::before,',
    '#hk-sky .season.narrow :is(.canopy,.branches,.xdecor,.sp-frame)::after{',
    '  content:"";position:absolute;top:0;bottom:0;',
    '  width:' + (NARROW_HALF * 100) + '%;',
    '  background-image:var(--frame);background-repeat:no-repeat;',
    '  background-size:auto 100%}',
    '#hk-sky .season.narrow :is(.canopy,.branches,.xdecor,.sp-frame)::before{',
    '  left:0;background-position:left center;',
    '  -webkit-mask-image:linear-gradient(to right,#000 ' + (NARROW_SOLID * 100) + '%,transparent 100%);',
    '  mask-image:linear-gradient(to right,#000 ' + (NARROW_SOLID * 100) + '%,transparent 100%)}',
    '#hk-sky .season.narrow :is(.canopy,.branches,.xdecor,.sp-frame)::after{',
    '  right:0;background-position:right center;',
    '  -webkit-mask-image:linear-gradient(to left,#000 ' + (NARROW_SOLID * 100) + '%,transparent 100%);',
    '  mask-image:linear-gradient(to left,#000 ' + (NARROW_SOLID * 100) + '%,transparent 100%)}',

    // A bulb halo. THE MASK IS LOAD-BEARING: the raw glow art has a firm amber
    // perimeter that reads as a flat orange disc at this size, so the radial
    // mask eats the rim and keeps only the soft core. Baseline is never zero --
    // the master already contains steady emission, and these add variation on
    // top rather than switching lights on and off.
    '#hk-sky .xlight{position:absolute;width:32px;height:32px;',
    '  transform:translate(-50%,-50%);',
    '  background:url(' + XGLOW + ') center/contain no-repeat;',
    '  -webkit-mask-image:radial-gradient(circle,#000 0%,#0009 12%,',
    '    #0002 27%,transparent 40%);',
    '  mask-image:radial-gradient(circle,#000 0%,#0009 12%,',
    '    #0002 27%,transparent 40%);',
    '  opacity:.04;animation:hk-xtwinkle var(--td) ease-in-out var(--tdel)',
    '    infinite}',
    // Independently phased, so it breathes rather than chasing. No moment has
    // the whole string lit.
    '@keyframes hk-xtwinkle{0%,30%,100%{opacity:.04}',
    '  48%,55%{opacity:.55}72%{opacity:.12}}',

    // Decorative snow. Individual elements like the leaves, for the same
    // reason -- a tiled deck cannot rotate a flake. Far gentler than the
    // leaves though: snow drifts and turns, it does not tumble or flip.
    '#hk-sky .xflake{position:absolute;top:-55px;will-change:transform;',
    '  animation:hk-xfall var(--fd) linear var(--fdel) infinite}',
    '#hk-sky .xflake > i{display:block;width:100%;height:100%;',
    '  background:var(--sp) center/contain no-repeat;',
    '  animation:hk-xspin var(--sd) linear var(--sdel) infinite}',
    '@keyframes hk-xfall{',
    '  0%{transform:translate3d(0,0,0)}',
    '  25%{transform:translate3d(var(--sw),calc(var(--dist) * .25),0)}',
    '  50%{transform:translate3d(calc(var(--dr) * .5),calc(var(--dist) * .5),0)}',
    '  75%{transform:translate3d(calc(var(--dr) * .75 - var(--sw)),',
    '       calc(var(--dist) * .75),0)}',
    '  100%{transform:translate3d(var(--dr),var(--dist),0)}}',
    '@keyframes hk-xspin{from{transform:rotate(0deg)}',
    '  to{transform:rotate(var(--turn))}}',

    // Santa. Same shape as the witch: a rare crossing, parked off-screen for
    // the rest of the cycle, and brightness(0) so he is a clean silhouette
    // rather than a lit cartoon against the sky.
    '#hk-sky .sleigh{position:absolute;left:0;aspect-ratio:3 / 1;',
    '  background:url(' + SLEIGH + ') center/contain no-repeat;',
    '  filter:brightness(0);opacity:.85;will-change:transform;',
    '  animation:hk-sleigh var(--fd) linear var(--fdel) infinite}',
    '@keyframes hk-sleigh{',
    '  0%{transform:translate3d(var(--x0),0,0)}',
    '  3%{transform:translate3d(calc(var(--x0) + var(--xd) * .45),-9px,0)}',
    '  5%{transform:translate3d(calc(var(--x0) + var(--xd) * .72),4px,0)}',
    '  7%{transform:translate3d(calc(var(--x0) + var(--xd)),0,0)}',
    '  100%{transform:translate3d(calc(var(--x0) + var(--xd)),0,0)}}',

    // --------------------------------------------------- the surprises
    // A border frame with an open center. Lit by the same inherited --lbri /
    // --lsat as everything else in .season, so a surprise dims into the
    // evening with the canopy rather than glowing on its own.
    '#hk-sky .sp-frame{position:absolute;inset:0;',
    '  background-repeat:no-repeat;background-size:100% 100%;',
    '  background-image:var(--spf);opacity:.86;',
    '  filter:brightness(var(--lbri,1)) saturate(var(--lsat,1))}',

    // Particles. Individual elements, same reasoning as the leaves and the
    // snow: a tiled deck cannot rotate one.
    '#hk-sky .sp-fall{position:absolute;top:-70px;will-change:transform;',
    '  animation:hk-spfall var(--fd) linear var(--fdel) infinite}',
    '#hk-sky .sp-fall > i{display:block;width:100%;height:100%;',
    '  opacity:var(--pa);',
    '  animation:hk-spspin var(--sd) ease-in-out var(--sdel) infinite alternate}',
    // Textured kinds carry a sprite; sparkle and confetti are drawn in CSS so
    // they cost no texture at all.
    '#hk-sky .sp-fall > i.tex{background:var(--sp) center/contain no-repeat}',
    '#hk-sky .sp-fall > i.dot{border-radius:50%;background:#f4d698;',
    '  box-shadow:0 0 4px #f4d698}',
    '#hk-sky .sp-fall > i.conf{width:55%;height:30%;background:var(--cc)}',
    '@keyframes hk-spfall{',
    '  0%{transform:translate3d(0,0,0)}',
    '  25%{transform:translate3d(calc(var(--dr) * .25 + var(--sw)),',
    '       calc(var(--dist) * .25),0)}',
    '  50%{transform:translate3d(calc(var(--dr) * .5),calc(var(--dist) * .5),0)}',
    '  75%{transform:translate3d(calc(var(--dr) * .75 - var(--sw)),',
    '       calc(var(--dist) * .75),0)}',
    '  100%{transform:translate3d(var(--dr),var(--dist),0)}}',
    '@keyframes hk-spspin{',
    '  from{transform:rotateZ(-35deg) rotateY(0deg)}',
    '  to{transform:rotateZ(230deg) rotateY(280deg)}}',

    // THE RARE EVENT, as a long-cycle CSS animation that parks the element
    // off-screen for the rest of the cycle -- the witch and the sleigh again.
    // No requestAnimationFrame loop and no WAAPI: one engine, no timers.
    '#hk-sky .sp-fly{position:absolute;left:0;',
    '  background:var(--spe) center/contain no-repeat;',
    '  will-change:transform,opacity;opacity:0;',
    '  animation:hk-spfly var(--fd) linear var(--fdel) infinite}',
    '@keyframes hk-spfly{',
    '  0%{transform:translate3d(var(--x0),0,0);opacity:0}',
    '  1%{opacity:.85}',
    '  4%{transform:translate3d(calc(var(--x0) + var(--xd) * .5),-10px,0);opacity:.85}',
    '  7%{transform:translate3d(calc(var(--x0) + var(--xd)),0,0);opacity:0}',
    '  100%{transform:translate3d(calc(var(--x0) + var(--xd)),0,0);opacity:0}}',
    // A firework does not cross; it blooms in place and fades.
    '#hk-sky .sp-burst{position:absolute;',
    '  background:var(--spe) center/contain no-repeat;',
    '  will-change:transform,opacity;opacity:0;',
    '  animation:hk-spburst var(--fd) ease-out var(--fdel) infinite}',
    '@keyframes hk-spburst{',
    '  0%{opacity:0;transform:scale(.1)}',
    '  1%{opacity:.6;transform:scale(.8)}',
    '  3%{opacity:0;transform:scale(1.25)}',
    '  100%{opacity:0;transform:scale(1.25)}}',

    // Static pages (Energy, EcoFlow, Cameras) are not weather and not
    // seasonal either. Same treatment as the weather decks: fade out, then
    // stop the animations and hand the GPU layers back.
    '#hk-sky.static .season{opacity:0}',
    '#hk-sky.static .season *{animation:none!important;will-change:auto!important}',

    '@media (prefers-reduced-motion:reduce){#hk-sky *{animation:none!important}}'
  ].join('');

  // Registering the gradient stops as <color> is what lets the sky CROSS-FADE
  // instead of jumping. An unregistered custom property has no type, so it can
  // only ever swap discretely -- sunrise would step through the palette in
  // visible slabs. hk-tap.js already relies on registerProperty for --hk-ring,
  // so support is proven on the same browsers.
  var REG = ['--sk0', '--sk1', '--sk2', '--sk3', '--clTop', '--clBot', '--glowC'];
  var registered = false;
  function register() {
    if (registered || !window.CSS || !window.CSS.registerProperty) return;
    registered = true;
    REG.forEach(function (name) {
      try {
        window.CSS.registerProperty({
          name: name, syntax: '<color>', inherits: true,
          initialValue: 'rgba(0,0,0,0)'
        });
      } catch (e) { /* already registered by an earlier import; harmless */ }
    });
  }

  // ------------------------------------------------------------------ mount
  // Walk UP out of however many shadow roots the card is nested in, rather
  // than querying DOWN from <home-assistant>. The path down changes with the
  // panel wrapper and wallpanel adds its own; up from the card is always the
  // same three hops.
  function container(card) {
    var n = card;
    for (var i = 0; i < 40 && n; i++) {
      if (n.tagName === 'HUI-VIEW-CONTAINER') return n;
      n = n.parentNode || n.host;
      if (n && n.nodeType === 11) n = n.host;   // ShadowRoot -> its host
    }
    return null;
  }

  // Styles go in as a CONSTRUCTED STYLESHEET, not as a <style> element.
  //
  // A <style> appended here renders as visible text -- the whole stylesheet
  // printed down the left of the page, squeezing the real content into what
  // is left, while its rules apply as well. hui-view-container's own
  // `display: relative` is not a valid display value, so the declaration is
  // dropped and the custom element falls back to display:inline, and a
  // <style> slotted into an inline formatting context in that shadow tree
  // gets laid out as text.
  //
  // adoptedStyleSheets sidesteps the whole question: there is no node in the
  // tree to lay out, and it is the mechanism lit itself uses for every HA
  // component, so support is not in doubt. The <style> path is kept only as a
  // fallback, and appended to the shadow root rather than beside the sky.
  var sheet = null;

  function attachStyles(el) {
    var root = el.getRootNode();
    if (!root) return;
    try {
      if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(SHEET);
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat(sheet);
        return;
      }
    } catch (e) { sheet = null; }
    var tag = document.createElement('style');
    tag.id = 'hk-sky-style';
    tag.textContent = SHEET;
    (root.appendChild ? root : document.head).appendChild(tag);
  }

  function detachStyles(el) {
    var root = el && el.getRootNode();
    if (root && sheet && root.adoptedStyleSheets) {
      root.adoptedStyleSheets =
        root.adoptedStyleSheets.filter(function (s) { return s !== sheet; });
    }
    sheet = null;
    var tag = (root && root.querySelector && root.querySelector('#hk-sky-style'))
           || document.getElementById('hk-sky-style');
    if (tag) tag.remove();
  }

  // ------------------------------------------------------ season builders
  // Each returns nothing and appends into the .season container. They are
  // called ONLY when the season key changes (see paintSeason), never on the
  // 3s tick -- rebuilding 20 leaf elements every three seconds would be both
  // wasteful and visible, because every leaf would jump to a new position.

  function leafField(host, W, H, o, rnd) {
    var f = document.createElement('div');
    f.className = 'leaffield';
    // NO --lbri/--lsat here. They are set on .season every paint and
    // inherit, so dusk is a gradual change to a live variable rather than a
    // rebuild of the whole field at the moment elevation crosses -4.
    var n = Math.max(6, Math.round(o.count * (W / 1280)));
    for (var i = 0; i < n; i++) {
      var lf = document.createElement('div');
      lf.className = 'lf';
      // TWO DEPTHS from one draw. One size range for every leaf (18-43px,
      // median 27) reads, on an 800px screen, as a fall far away. So three in
      // four are the distant field (20-46px) and one in four is NEAR,
      // 52-78px, falling faster -- nearer things cross the frame quicker --
      // so the scene has depth rather than every leaf growing. One rnd()
      // decides both, so every later draw in the scene is unaffected. The
      // sprites are 256px: sharp at 78px on a 1.5x screen.
      var u = rnd(), near = u >= 0.75;
      var size = near ? 52 + (u - 0.75) / 0.25 * 26 : 20 + Math.pow(u / 0.75, 1.3) * 26;
      lf.style.left = (rnd() * 100).toFixed(2) + '%';
      lf.style.width = size.toFixed(1) + 'px';
      lf.style.height = size.toFixed(1) + 'px';
      lf.style.setProperty('--dist', (H + 190).toFixed(0) + 'px');
      // Wind shortens the fall and widens the drift. o.wind is already
      // bucketed by the caller, so these change rarely rather than on every
      // weather update.
      var fall = (o.fallMin + rnd() * (o.fallMax - o.fallMin)) *
                 (1 - 0.01 * o.wind) * (near ? 0.8 : 1);
      lf.style.setProperty('--fd', fall.toFixed(2) + 's');
      // Negative delay: the field is already mid-fall on the first frame,
      // instead of every leaf entering from the top together.
      lf.style.setProperty('--fdel', (-rnd() * fall).toFixed(2) + 's');
      lf.style.setProperty('--sw', (20 + rnd() * 40 + o.wind).toFixed(0) + 'px');
      // Net horizontal travel, signed, so the field does not all lean one way
      // in still air but does when it blows.
      var drift = (30 + 4 * o.wind) * (rnd() * 2 - 1);
      lf.style.setProperty('--dr', drift.toFixed(0) + 'px');

      var g = document.createElement('i');
      var sp = LEAF_SPECIES[Math.floor(rnd() * LEAF_SPECIES.length) % LEAF_SPECIES.length];
      var dir = rnd() < 0.5 ? -1 : 1;
      g.style.setProperty('--z0', (rnd() * 360).toFixed(0) + 'deg');
      g.style.setProperty('--spin', dir * 360 * (rnd() < 0.35 ? 2 : 1) + 'deg');
      g.style.setProperty('--flip', 360 * (rnd() < 0.3 ? 0 : (rnd() < 0.6 ? 1 : 2)) + 'deg');
      g.style.setProperty('--tilt', dir * 360 * (rnd() < 0.3 ? 1 : 0) + 'deg');
      g.style.setProperty('--td',
        ((4 + rnd() * 7) * (1 - 0.012 * o.wind)).toFixed(2) + 's');
      g.style.setProperty('--tdel', (-rnd() * 8).toFixed(2) + 's');
      // NO hue-rotate. Randomizing hue produces olive and yellow-green leaves
      // -- hue-rotate on a red sprite walks it straight through green. The
      // three photos already carry the color range.
      g.style.setProperty('--b', (0.88 + rnd() * 0.24).toFixed(2));
      g.style.setProperty('--s', (0.86 + rnd() * 0.26).toFixed(2));
      // Jitter around 1, NOT an absolute opacity -- the scene level is --lopa,
      // inherited and rewritten every paint.
      g.style.setProperty('--a', (0.82 + rnd() * 0.36).toFixed(2));
      // Two faces, same box. The URLs are set on the TUMBLING parent so both
      // faces can read them; the filter/opacity that consume --b/--s/--a sit
      // on the faces themselves, because either property here would flatten
      // the 3D and show both sides at once.
      g.style.setProperty('--spf', 'url(' + sp[0] + ')');
      g.style.setProperty('--spb', 'url(' + sp[1] + ')');
      g.appendChild(document.createElement('u')).className = 'f';
      g.appendChild(document.createElement('u')).className = 'b';
      lf.appendChild(g);
      f.appendChild(lf);
    }
    host.appendChild(f);
  }

  function batField(host, W, n, rnd) {
    for (var i = 0; i < n; i++) {
      var b = document.createElement('div');
      b.className = 'bat';
      var size = 26 + Math.pow(rnd(), 1.3) * 34;
      b.style.width = size.toFixed(0) + 'px';
      b.style.height = size.toFixed(0) + 'px';
      b.style.top = (6 + rnd() * 46).toFixed(1) + '%';
      var ltr = rnd() < 0.5;
      b.style.setProperty('--x0', (ltr ? -size - 40 : W + 40) + 'px');
      b.style.setProperty('--xd', (ltr ? W + size + 80 : -(W + size + 80)) + 'px');
      for (var k = 0; k < BAT_FRAMES.length; k++) {
        var fr = b.appendChild(document.createElement('i'));
        fr.className = 'f' + (k + 1);
        fr.style.backgroundImage = 'url(' + BAT_FRAMES[k] + ')';
      }
      b.style.setProperty('--fl', (0.30 + rnd() * 0.22).toFixed(3) + 's');
      var dur = 26 + rnd() * 26;
      b.style.setProperty('--bd', dur.toFixed(1) + 's');
      b.style.setProperty('--bdel', (-rnd() * dur).toFixed(1) + 's');
      host.appendChild(b);
    }
  }

  // ONE builder for all seven themes. The differences are data (SURPRISE), not
  // code: seven sets of settings, one runtime.
  function surpriseScene(host, W, H, id, night, heavy, rnd, landed) {
    var cfg = SURPRISE[id];
    if (!cfg) return;

    if (cfg.frame && !landed) {
      var f = document.createElement('div');
      f.className = 'sp-frame';
      f.style.setProperty('--spf', 'url(' + BASE + cfg.frame + ')');
      host.appendChild(f);
    }

    // Heavy precipitation thins the ornamental particles right down. It never
    // touches the actual weather decks -- this is decoration standing aside,
    // not a forecast being edited.
    var n = Math.max(3, Math.round((heavy ? Math.min(4, cfg.count) : cfg.count) *
                                   (W / 1280)));
    var CONF = ['#e7c986', '#eaa5b9', '#a5d7df', '#c2addf'];
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'sp-fall';
      var size = cfg.kind === 'sparkle' ? 2 + rnd() * 3 : 8 + rnd() * 12;
      p.style.left = (rnd() * 100).toFixed(2) + '%';
      p.style.width = size.toFixed(1) + 'px';
      p.style.height = size.toFixed(1) + 'px';
      p.style.setProperty('--dist', (H + 140).toFixed(0) + 'px');
      var fall = 23 + rnd() * 17;
      p.style.setProperty('--fd', fall.toFixed(1) + 's');
      p.style.setProperty('--fdel', (-rnd() * fall).toFixed(1) + 's');
      p.style.setProperty('--sw', (10 + rnd() * 30).toFixed(0) + 'px');
      p.style.setProperty('--dr', (-60 + rnd() * 120).toFixed(0) + 'px');

      var g = document.createElement('i');
      if (cfg.part) {
        g.className = 'tex';
        g.style.setProperty('--sp', 'url(' + SP_ASSET[cfg.part] + ')');
      } else if (cfg.kind === 'confetti') {
        g.className = 'conf';
        g.style.setProperty('--cc', CONF[i % CONF.length]);
      } else {
        g.className = 'dot';
      }
      // Sparkles read better against a dark sky, everything else against a
      // light one -- the same inversion the reference design uses.
      g.style.setProperty('--pa', (cfg.kind === 'sparkle'
        ? (night ? 0.55 : 0.35) : (night ? 0.28 : 0.62)).toFixed(2));
      g.style.setProperty('--sd', (6 + rnd() * 9).toFixed(1) + 's');
      g.style.setProperty('--sdel', (-rnd() * 12).toFixed(1) + 's');
      p.appendChild(g);
      host.appendChild(p);
    }

    // The flyby, and its day/night gate. Fireworks only after dark; the spring
    // butterfly only by day. Gating at BUILD time rather than at runtime is
    // what keeps this to zero timers -- `night` is in the season key, so
    // crossing dusk rebuilds the scene and the gate re-evaluates.
    if (!cfg.event) return;
    if (cfg.event === 'firework' && !night) return;
    if (cfg.event === 'butterfly' && night) return;

    var e = document.createElement('div');
    e.style.setProperty('--spe', 'url(' + SP_ASSET[cfg.event] + ')');
    // 210s of which the crossing is 7% -- about 15s, then parked. Rare on
    // purpose: a flyby you see every minute stops being a surprise.
    e.style.setProperty('--fd', '210s');
    e.style.setProperty('--fdel', (5 + rnd() * 40).toFixed(1) + 's');
    if (cfg.event === 'firework') {
      e.className = 'sp-burst';
      var bs = Math.round(Math.min(W, H) * 0.17);
      e.style.width = bs + 'px';
      e.style.height = bs + 'px';
      e.style.left = (58 + rnd() * 22).toFixed(1) + '%';
      e.style.top = (4 + rnd() * 10).toFixed(1) + '%';
    } else {
      e.className = 'sp-fly';
      var w = cfg.event === 'rocket' ? 88 : cfg.event === 'fairy' ? 30 : 34;
      e.style.width = w + 'px';
      e.style.height = Math.round(w * (cfg.event === 'rocket' ? 0.5 : 1)) + 'px';
      e.style.top = (10 + rnd() * 12).toFixed(1) + '%';
      e.style.setProperty('--x0', (-w - 120) + 'px');
      e.style.setProperty('--xd', (W + w + 260).toFixed(0) + 'px');
    }
    host.appendChild(e);
  }

  function canopyLayer(host) {
    var d = document.createElement('div');
    d.className = 'canopy';
    host.appendChild(d);
  }

  function branchLayer(host) {
    // One element, no randomization: the art is a single composed frame that
    // already reaches in from all four edges. Nothing to pick and nothing to
    // mirror -- a mirrored full-frame branch reads as mirrored immediately.
    var d = document.createElement('div');
    d.className = 'branches';
    host.appendChild(d);
  }

  function cobweb(host, W) {
    var d = document.createElement('div');
    d.className = 'cobweb';
    var w = Math.round(W * 0.13);
    d.style.width = w + 'px';
    d.style.height = w + 'px';
    host.appendChild(d);
  }

  function fogWisps(host, rnd) {
    // TWO instances, not three: each is a real texture rather than a
    // gradient, and a third only buys haze .gfog already supplies.
    for (var i = 0; i < 2; i++) {
      var w = document.createElement('div');
      w.className = 'fwisp';
      var wide = 110 + rnd() * 30;                 // 110-140% of the viewport
      w.style.width = wide.toFixed(0) + '%';
      w.style.height = (20 + rnd() * 10).toFixed(0) + '%';
      w.style.left = '0';
      w.style.bottom = (rnd() * 16).toFixed(0) + '%';
      // Drift is exactly the overhang, so neither end ever brings the
      // texture's own edge inside the viewport.
      var over = wide - 100;
      w.style.setProperty('--wa', '0px');
      w.style.setProperty('--wb', (-over).toFixed(1) + '%');
      w.style.setProperty('--wt', (85 + rnd() * 28).toFixed(0) + 's');
      w.style.setProperty('--wdel', (-rnd() * 90).toFixed(0) + 's');
      w.style.setProperty('--wo', (0.09 + rnd() * 0.09).toFixed(2));
      host.appendChild(w);
    }
  }

  // Where the witch flies, from the RESOLVED moon: its box size and its center
  // as fractions of the viewport, the same numbers paint() drew it with. Pure,
  // so the geometry is testable (hkSky._witchPath).
  //
  // Sized off the visible DISC, not the moon's box (which carries its halo) and
  // not the viewport: broom tip to bristles is WITCH_SPAN of the disc.
  //
  // Right to left, because she faces left. She fades in just clear of the
  // disc's right edge and out just clear of its left, both INSIDE the viewport
  // (never clipped by it), across the upper disc (WITCH_LINE), drifting down by 3%
  // of the distance flown -- mostly horizontal. A viewport too narrow for that
  // (a phone) keeps the margins and simply flies a shorter line.
  function witchPath(W, H, moonS, moonXf, moonYf) {
    var disc = moonS * MOON_DISC;
    var w = Math.round(disc * WITCH_SPAN / WITCH_INK);
    var h = Math.round(w / 2);
    var cx = W * moonXf, cy = H * moonYf + disc * WITCH_LINE, gap = 8, m = 16;
    var x0 = Math.min(cx + disc / 2 + gap, W - w - m);
    var x1 = Math.max(cx - disc / 2 - gap - w, m);
    var drift = (x0 - x1) * 0.03;
    var y0 = clamp(cy - h / 2 - drift / 2, m, H - h - m);
    var y1 = clamp(cy - h / 2 + drift / 2, m, H - h - m);
    return { w: w, h: h, left: Math.round(x0), top: Math.round(y0),
             dx: Math.round(x1 - x0), dy: Math.round(y1 - y0) };
  }

  function witchFly(host, W, H, moonS, moonXf, moonYf, rnd) {
    var p = witchPath(W, H, moonS, moonXf, moonYf);
    var w = document.createElement('div');
    w.className = 'witch';
    w.style.width = p.w + 'px';
    w.style.height = p.h + 'px';
    w.style.left = p.left + 'px';
    w.style.top = p.top + 'px';
    w.style.setProperty('--wdx', p.dx + 'px');
    w.style.setProperty('--wdy', p.dy + 'px');
    // NOT RIGHT AFTER A LOAD. A negative delay starts the cycle part-way
    // through its invisible stretch, so the first flight comes 45-120s of
    // visible time after the scene is built -- and after a return from a static
    // page, which restarts the animation from the same point. A short
    // positive delay would put her across the moon within seconds of every
    // reload.
    var wait = 45 + rnd() * 75;
    w.style.setProperty('--wdel', (-(WITCH_CYCLE - wait)).toFixed(1) + 's');
    host.appendChild(w);
  }

  function cozyWindow(host, W, H, rnd, snowOK, landed, moon) {
    // Order matters and mirrors the delivered layering: decoration, then the
    // halos on its bulbs, then snow in front of both, then the flyby. Over a
    // landscape (`landed`) the garland and its halos stand aside: the land's
    // own trees carry the lights.
    if (!landed) {
      var d = document.createElement('div');
      d.className = 'xdecor';
      host.appendChild(d);

      // On a narrow screen the decoration is its two edges at true shape (see
      // .narrow): a bulb sits where ITS edge of the art now is, and one in the
      // art's hidden middle -- or in the edge's fade, where the garland it
      // belongs to is dissolving -- is not drawn at all.
      var art = FRAME_ASPECT * H;                 // the art's width, fitted to H
      var solid = W * NARROW_HALF * NARROW_SOLID; // how far in each edge is solid
      BULBS.forEach(function (b) {
        var x;
        if (W < H) {
          x = b[0] < 0.5 ? b[0] * art : W - (1 - b[0]) * art;
          if (b[0] < 0.5 ? x > solid : x < W - solid) return;
        }
        var l = document.createElement('div');
        l.className = 'xlight';
        l.style.left = W < H ? x.toFixed(1) + 'px' : (b[0] * 100).toFixed(2) + '%';
        l.style.top = (b[1] * 100).toFixed(2) + '%';
        // 7-14s, each with its own negative phase, so no two peak together.
        l.style.setProperty('--td', (7 + rnd() * 7).toFixed(1) + 's');
        l.style.setProperty('--tdel', (-rnd() * 14).toFixed(1) + 's');
        host.appendChild(l);
      });
    }

    // Decorative snow is NOT a forecast. When it is genuinely snowing the
    // weather deck is already running, and adding this on top reads as a
    // doubled blizzard -- so it stands down rather than competing.
    if (snowOK) {
      var n = Math.max(8, Math.round(28 * (W / 1280)));
      for (var i = 0; i < n; i++) {
        var f = document.createElement('div');
        f.className = 'xflake';
        // Biased small: mostly 3-6px specks with the occasional real crystal,
        // which is what keeps it from looking like a field of snowflake icons.
        var size = 3 + Math.pow(rnd(), 1.7) * 7;
        f.style.left = (rnd() * 100).toFixed(2) + '%';
        f.style.width = size.toFixed(1) + 'px';
        f.style.height = size.toFixed(1) + 'px';
        f.style.opacity = (0.2 + rnd() * 0.4).toFixed(2);
        f.style.setProperty('--dist', (H + 110).toFixed(0) + 'px');
        var fall = 21 + rnd() * 22;
        f.style.setProperty('--fd', fall.toFixed(1) + 's');
        f.style.setProperty('--fdel', (-rnd() * fall).toFixed(1) + 's');
        f.style.setProperty('--sw', (8 + rnd() * 24).toFixed(0) + 'px');
        f.style.setProperty('--dr', (-45 + rnd() * 90).toFixed(0) + 'px');
        var g = document.createElement('i');
        g.style.setProperty('--sp', 'url(' + SNOW_SPRITES[i % 3] + ')');
        g.style.setProperty('--sd', (9 + rnd() * 15).toFixed(1) + 's');
        g.style.setProperty('--sdel', (-rnd() * 12).toFixed(1) + 's');
        g.style.setProperty('--turn', (rnd() < 0.5 ? -360 : 360) + 'deg');
        f.appendChild(g);
        host.appendChild(f);
      }
    }

    var sl = document.createElement('div');
    sl.className = 'sleigh';
    var sw = 180 + rnd() * 50, top = 14 + rnd() * 4;
    if (moon) {
      // ACROSS THE MOON: three-quarters of its disc wide, its runners a
      // little above the middle of the face
      var disc = moon.s * MOON_DISC;
      sw = disc * 0.75;
      sl.style.top = Math.round(H * moon.y - sw / 3 / 2 - disc * 0.1) + 'px';
    } else {
      sl.style.top = top.toFixed(1) + '%';
    }
    sl.style.width = sw.toFixed(0) + 'px';
    sl.style.setProperty('--x0', (W + 240).toFixed(0) + 'px');
    sl.style.setProperty('--xd', (-(W + sw + 480)).toFixed(0) + 'px');
    // 200s of which the crossing is 7% -- about 14s, then parked off-left.
    // Rare on purpose: a sleigh you see every minute is wallpaper.
    sl.style.setProperty('--fd', '200s');
    // Positive, and staggered, so several wall tablets do not fly him in unison
    // and he is not already mid-flight on the first frame.
    sl.style.setProperty('--fdel', (6 + rnd() * 26).toFixed(1) + 's');
    host.appendChild(sl);
  }

  // ------------------------------------------------------------- seasons
  // The season comes from hkSettings.seasonName(): the holiday sensor chosen
  // in Configure (a SEASON sensor, not a day-of one), or with none chosen the
  // same windows computed from the date:
  //   Halloween     Sep 22 - Oct 31
  //   Thanksgiving  Nov 1  - Thanksgiving Day
  //   Christmas     the day after - Dec 25
  // so there is no date arithmetic here at all.
  function seasonOf(hass) {
    if (!hass) return '';
    var HS = window.hkSettings;
    if (!HS || !HS.seasonalOn(hass.states)) return '';
    var v = HS.seasonName(hass.states);
    // A season turned off in Configure -> Seasonal sky draws nothing.
    if (HS.themeOn && !HS.themeOn(String(v).toLowerCase())) return '';
    if (v === 'Halloween') return 'halloween';
    if (v === 'Thanksgiving') return 'thanksgiving';
    if (v === 'Christmas') return 'christmas';
    return '';
  }

  // --------------------------------------------------------- the schedule
  // NOT EVERY DAY. Decoration that is simply on for the whole season stops
  // being noticed about a week in -- and the garland is the worst of it,
  // because the holiday season calls it Christmas from Thanksgiving, a solid
  // month. So each season rolls a die per day, and the odds RAMP as the
  // holiday approaches: rare and a nice surprise early, near-certain by the
  // end, and guaranteed on the day itself.
  //
  // `within` is how many days before the holiday the season is eligible AT
  // ALL. It is what keeps the garland out of early December rather than a
  // second set of dates: Christmas is eligible from the 7th, so the last ~18
  // days rather than the last ~30.
  //
  // WHERE THE DATES LIVE. A chosen holiday sensor owns which season it is, and
  // other automations (holiday lighting, say) may read that same sensor -- so
  // the window is NOT narrowed there. What is owned here is only how often
  // the SKY dresses up inside a season already declared.
  // WHEN is Configure -> Seasonal sky -> Season dates (hkSettings.skyWindow:
  // built in Halloween 09-22..10-31, Thanksgiving 11-01..US Thanksgiving,
  // Christmas 12-07..12-25), and HOW OFTEN is that page's choice per season:
  //   sometimes  (built in) a daily die whose odds ramp from pFar at the
  //              window's first day to pNear `always` days before its last,
  //              and every one of the last `always` days;
  //   every_day  every day of the window;
  //   near_end   only the last `always` days.
  // The ramp runs over the window itself, so custom dates need nothing else;
  // with the built-in dates it gives exactly the days of a fixed per-season
  // table (checked day by day over three years).
  var SCHEDULE = {
    halloween:    { pFar: 0.45, pNear: 0.90, always: 3 },
    thanksgiving: { pFar: 0.35, pNear: 0.85, always: 1 },
    christmas:    { pFar: 0.30, pNear: 0.90, always: 3 }
  };
  // The spooky night extras -- branches, bats, the witch, the big moon -- roll
  // SEPARATELY and more rarely than the leaves. Leaves are ambience; a witch
  // crossing the moon should be something you catch, not the wallpaper.
  var SPOOKY = { pFar: 0.30, pNear: 0.85, always: 3 };

  // Local calendar day as YYYYMMDD. NOT Math.floor(Date.now()/864e5), which is
  // the UTC day and therefore rolls over at 8pm local -- the field would have
  // rebuilt itself in front of you every evening, mid-Halloween.
  function dayKey(d) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  // A stable [0,1) from a day and a salt: the same answer all day, on every
  // screen, and a different one tomorrow.
  function roll(d, salt) {
    var n = (dayKey(d) ^ Math.imul(salt, 0x9E3779B1)) >>> 0;
    n = Math.imul(n ^ n >>> 15, 0x85EBCA6B) >>> 0;
    n = Math.imul(n ^ n >>> 13, 0xC2B2AE35) >>> 0;
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }

  // The season's window today (hkSettings.skyWindow), or a closed one.
  function windowOf(name, d) {
    var HS = window.hkSettings;
    return (HS && HS.skyWindow) ? HS.skyWindow(name, d) : { inside: false, daysToEnd: -1, length: 0 };
  }
  // Whole days from `d` to the last day of the season's window; -1 outside it.
  function daysUntil(name, d) { return windowOf(name, d).daysToEnd; }

  // Does the sky dress up today, and if so does tonight get the spooky set?
  // ------------------------------------------------------ the surprises
  // Seven occasional themes. They are SURPRISES, not decoration: most days
  // none of them fire at all.
  //
  // ONE SELECTOR AND ONE ENGINE -- not seven schedulers and not seven
  // animation engines. This is a port of the themes' shared schedule.js;
  // tests/test_surprise.js mirrors its assertions, so the port is checked
  // rather than assumed.
  // The household's birthdays: Configure -> Seasonal sky, as
  // [{name, month, day}]. Read per call so an edit applies the same day.
  function birthdays() {
    var HS = window.hkSettings;
    var b = HS ? HS.get('sky.birthdays', []) : [];
    return Array.isArray(b) ? b : [];
  }

  // Deterministic per LOCAL calendar day, so every screen agrees and a
  // refresh, a navigation or a weather update never re-rolls. Same shape as
  // roll() above and for the same reason.
  function sHash(date, salt) {
    var n = (date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 +
             date.getDate()) ^ salt;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  // ONE DAY PER CALENDAR MONTH, not a daily probability.
  //
  // As 1.5% and 1% daily rolls these two would give an expected 5.5 and 3.6
  // days a year -- but a coin flip that rare CLUMPS, and the salt used here
  // produces ZERO space nights in some whole years. A
  // theme you might not see for two years is not a surprise, it is a bug that
  // looks like one. So the day is picked, deterministically, from the month.
  //
  // Hashed off the FIRST of the month so every day in that month computes the
  // same answer, and clamped to the real month length so February works.
  function monthlyDay(date, salt) {
    var y = date.getFullYear(), m = date.getMonth() + 1;
    var dim = new Date(y, m, 0).getDate();
    return 1 + Math.floor(sHash(new Date(y, m - 1, 1), salt) * dim);
  }

  // Space night takes its own day, and steps aside by one if it drew the same
  // day as storybook -- otherwise a collision costs a whole month, because
  // storybook is checked first and would simply win.
  function spaceDay(date) {
    var mine = monthlyDay(date, 991);
    if (mine !== monthlyDay(date, 731)) return mine;
    var dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return (mine % dim) + 1;
  }

  // N DAYS A MONTH (Configure -> Seasonal sky: once, twice or four times).
  // The first is exactly monthlyDay's; each further one comes from its own
  // salt, stepping past days already taken, so the days are distinct and the
  // built-in once-a-month day never moves.
  function monthlyDays(date, salt, n, taken) {
    var dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    var out = [], busy = (taken || []).slice();
    for (var k = 0; k < n && out.length < dim; k++) {
      var day = monthlyDay(date, salt + k * 7919);
      while (busy.indexOf(day) !== -1) day = (day % dim) + 1;
      out.push(day); busy.push(day);
    }
    return out;
  }
  // Space night's days: once a month is spaceDay() exactly; more are drawn
  // like the storybook's, never on one of storybook's days.
  function spaceDays(date, story, n) {
    var dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    var first = spaceDay(date);                 // clear of storybook's first day
    while (story.indexOf(first) !== -1 && story.length < dim) first = (first % dim) + 1;
    if (n <= 1) return [first];
    return [first].concat(monthlyDays(date, 991 + 7919, n - 1, story.concat([first])));
  }

  var ALL_SURPRISES = ['storybook-magic', 'spring-garden', 'fourth-of-july',
                       'birthday', 'winter-wonderland', 'valentines-day',
                       'space-night'];

  // One table, seven themes. `a` and `l` are the frame's measured mean alpha
  // and ink luma, from dwebp -pam on the ENCODED webp -- same basis as SEASON
  // above, so the cap arithmetic describes what the page actually loads.
  //
  // The frames are BORDERS with open centers, which is why the coverage is so
  // much lower than the full-bleed seasonal art: the busiest, Valentine's, is
  // 0.090 against the Christmas decoration's 0.105 and the canopy's 0.084.
  //
  // `event` is a RARE flyby, built as a long-cycle CSS animation that parks the
  // element off-screen for most of the cycle -- the same shape as the witch and
  // the sleigh. Driving these from requestAnimationFrame and WAAPI would add a
  // second animation engine and a timer per theme.
  var SP_ASSET = {
    petal:     BASE + 'sp-petal.webp',
    heart:     BASE + 'sp-heart.webp',
    crystal:   BASE + 'sp-crystal.webp',
    firework:  BASE + 'sp-firework.webp',
    rocket:    BASE + 'sp-rocket.webp',
    butterfly: BASE + 'sp-butterfly.webp',
    fairy:     BASE + 'sp-fairy.webp'
  };
  // Particle mean alpha / ink luma, for the estimate. Sparkle and confetti are
  // drawn in CSS and carry no texture.
  var SP_PART = {
    petal:   { a: 0.286, l: 180 },
    heart:   { a: 0.445, l: 173 },
    crystal: { a: 0.290, l: 198 },
    sparkle: { a: 0.600, l: 244 },   // a CSS dot: small, bright, opaque
    confetti:{ a: 1.000, l: 200 }    // a CSS rectangle
  };
  var SURPRISE = {
    'birthday':          { frame: 'sp-birthday.webp',   a: 0.0775, l: 163,
                           kind: 'confetti', part: null,      count: 14, event: null },
    'fourth-of-july':    { frame: 'sp-july4.webp',      a: 0.0296, l: 94,
                           kind: 'sparkle',  part: null,      count: 5,  event: 'firework' },
    'space-night':       { frame: null,                 a: 0,      l: 0,
                           kind: 'sparkle',  part: null,      count: 7,  event: 'rocket' },
    'spring-garden':     { frame: 'sp-spring.webp',     a: 0.0714, l: 160,
                           kind: 'petal',    part: 'petal',   count: 12, event: 'butterfly' },
    'storybook-magic':   { frame: 'sp-storybook.webp',  a: 0.0496, l: 88,
                           kind: 'sparkle',  part: null,      count: 10, event: 'fairy' },
    'valentines-day':    { frame: 'sp-valentines.webp', a: 0.0899, l: 172,
                           kind: 'petal',    part: 'heart',   count: 10, event: null },
    'winter-wonderland': { frame: 'sp-winter.webp',     a: 0.0584, l: 167,
                           kind: 'crystal',  part: 'crystal', count: 8,  event: null }
  };
  // Which themes are installed. All seven; the selector only picks from this.
  var INSTALLED = ALL_SURPRISES;

  // Returns null, or {id, reason, person?}. `existingActive` is the season
  // already eligible today -- pass it ONLY when its own plan.show is true, not
  // merely because the sensor says Christmas, or a surprise would lose to a
  // season that was not going to draw anything anyway.
  function surpriseFor(date, o) {
    o = o || {};
    if (o.skyEnabled === false || o.seasonalEnabled === false) return null;
    var HS = window.hkSettings;
    var enabled = (o.enabled || ALL_SURPRISES).filter(function (id) {
      return !HS || !HS.themeOn || HS.themeOn(id);
    });
    // SOUTHERN HEMISPHERE: spring and winter are six months away.
    var south = (o.hemisphere || (HS ? HS.get('sky.hemisphere', 'north') : 'north')) === 'south';
    function on(id) { return enabled.indexOf(id) !== -1; }
    var m = date.getMonth() + 1, d = date.getDate(), md = m * 100 + d;

    var BIRTHDAYS = o.birthdays || birthdays();
    for (var i = 0; i < BIRTHDAYS.length; i++) {
      var b = BIRTHDAYS[i];
      if (b.month === m && b.day === d && on('birthday')) {
        // Deliberately an override: a 16 December birthday replaces the
        // Christmas DECORATION for the day. Not any automation, not the
        // sensor, not the weather. Normal scheduling resumes tomorrow.
        return { id: 'birthday', person: b.name, reason: 'birthday' };
      }
    }
    // WHEN and HOW OFTEN: Configure -> Seasonal sky -> Surprise dates
    // (hkSettings.skyWindow / often). Built in: the weeks Jun 28..Jul 4 and
    // Feb 8..14, spring Mar 20..Jun 20 and winter Dec 21..Mar 19 (southern:
    // six months on), storybook and space night once a month.
    function inside(key) {
      if (HS && HS.skyWindow) return HS.skyWindow(key, date).inside;
      var W = { july4: [628, 704], valentines: [208, 214],
                spring: south ? [922, 1220] : [320, 620],
                winter: south ? [621, 921] : [1221, 319] }[key];
      return W[0] <= W[1] ? (md >= W[0] && md <= W[1]) : (md >= W[0] || md <= W[1]);
    }
    function odds(key, base) {
      var how = HS && HS.often ? HS.often(key, 'sometimes') : 'sometimes';
      return base * ({ often: 2, sometimes: 1, rarely: 0.5 }[how] || 1);
    }
    function perMonth(key) {
      var n = Number(HS && HS.often ? HS.often(key, '1') : '1');
      return n > 0 ? n : 1;
    }
    if (inside('july4') && on('fourth-of-july'))
      return { id: 'fourth-of-july', reason: 'holiday-week' };
    if (inside('valentines') && on('valentines-day'))
      return { id: 'valentines-day', reason: 'holiday-week' };
    // The existing seasonal work wins over the ambient surprises below.
    if (o.existingActive) return { id: o.existingActive, reason: 'existing-season' };
    if (inside('spring') && on('spring-garden') && sHash(date, 320) < odds('spring_often', 0.14))
      return { id: 'spring-garden', reason: 'seasonal-surprise' };
    if (inside('winter') && on('winter-wonderland') && sHash(date, 1221) < odds('winter_often', 0.12))
      return { id: 'winter-wonderland', reason: 'seasonal-surprise' };
    var story = monthlyDays(date, 731, perMonth('storybook_per_month'));
    if (on('storybook-magic') && story.indexOf(d) !== -1)
      return { id: 'storybook-magic', reason: 'monthly-surprise' };
    if (on('space-night') && spaceDays(date, story, perMonth('space_per_month')).indexOf(d) !== -1)
      return { id: 'space-night', reason: 'monthly-surprise' };
    return null;
  }

  // DEV OVERRIDE. Null in normal operation. Set through hkSky._force() to
  // preview a season outside its window -- otherwise verifying Halloween in
  // September means editing SCHEDULE and remembering to put it back, which is
  // exactly the kind of temporary edit that gets left in.
  var FORCE = null;
  function plannedFor(name, d) { return FORCE || schedule(name, d); }

  // See read(). Set through hkSky._pin().
  var PIN = null;

  // DEV OVERRIDE for the surprises. Null in normal operation, like FORCE and
  // PIN. It exists because six of the seven themes fire on a handful of days a
  // year -- Space Night can go a whole year without one -- so there is no way
  // to look at them otherwise. It is not a preview control that bypasses the
  // schedule in normal use: nothing sets this but a console call.
  var SURPRISE_FORCE = null;

  // THE SETTINGS PAGE'S PREVIEW (HK Settings -> Sky, and each theme's page):
  // one theme whatever the date, in THIS window only -- the page's preview
  // frame, never a real screen. preview(id, when): id is a theme
  // (hk-settings-model.js SKY_THEMES) or null for today's own sky; when is
  // 'day', 'night' or 'spooky' (Halloween's big moon, fog, bats and witch).
  // The weather is held clear and still, so the theme is what shows -- not
  // tonight's rain over it. The three SEASONS go through FORCE and PIN; the
  // rest are surprises, through SURPRISE_FORCE.
  var PREVIEW = null;
  var PREVIEW_SEASONS = { halloween: 1, thanksgiving: 1, christmas: 1 };
  function preview(id, when) {
    FORCE = null; PIN = null; SURPRISE_FORCE = null; PREVIEW = null;
    if (id) {
      var night = when === 'night' || when === 'spooky';
      var sky = { elev: night ? -25 : 35, azim: night ? 200 : 180, cover: 0.1, wind: 6,
                  cond: night ? 'clear-night' : 'sunny', fog: false, wet: { kind: 'none', rate: 0 },
                  moon: 0.5, seasonalOn: true };
      if (PREVIEW_SEASONS[id]) {
        FORCE = { season: id, show: true, spooky: when === 'spooky', days: 0, p: 1 };
        sky.season = id;
      } else {
        SURPRISE_FORCE = id;
        sky.season = '';
      }
      PIN = sky;
      PREVIEW = { id: id, when: when || 'day' };
    }
    try { stateTick(); } catch (e) { /* not mounted yet: the next tick paints it */ }
    return PREVIEW;
  }

  // Exported as hkSky._schedule for the test suite and the console.
  function schedule(name, d) {
    d = d || new Date();
    var out = { season: name, show: false, spooky: false, days: 0, p: 0 };
    var cfg = SCHEDULE[name];
    if (!name || !cfg) return out;
    var w = windowOf(name, d);
    var days = out.days = w.daysToEnd;
    if (!w.inside) return out;                 // outside the season's dates
    var HS = window.hkSettings;
    var how = (HS && HS.often) ? HS.often(name + '_often', 'sometimes') : 'sometimes';
    var span = w.length;                       // the ramp runs over the window
    if (days <= cfg.always || how === 'every_day') {
      out.show = true; out.p = 1;
    } else if (how === 'near_end') {
      return out;
    } else {
      // Linear ramp from pFar at the window's first day to pNear at `always`.
      var t = (span - days) / Math.max(1, span - cfg.always);
      out.p = cfg.pFar + (cfg.pNear - cfg.pFar) * clamp(t, 0, 1);
      out.show = roll(d, 1) < out.p;
    }
    if (out.show && name === 'halloween') {
      // SPOOKY NIGHTS, Configure -> Seasonal sky: Sometimes (built in: its own
      // rarer die, and the last 3 nights), Every night, or Never -- leaves
      // without the bats and the witch.
      var spookyHow = (HS && HS.often) ? HS.often('spooky_often', 'sometimes') : 'sometimes';
      if (spookyHow === 'never') out.spooky = false;
      else if (spookyHow === 'every_night' || days <= SPOOKY.always) out.spooky = true;
      else {
        var st = (span - days) / Math.max(1, span - SPOOKY.always);
        out.spooky = roll(d, 2) <
          SPOOKY.pFar + (SPOOKY.pNear - SPOOKY.pFar) * clamp(st, 0, 1);
      }
    }
    return out;
  }

  // Rebuild only when the KEY changes. The key carries the season and whether
  // it is night, because the Halloween night extras (branches, bats, witch,
  // ground fog) come and go with the sun -- and nothing else, so the field is
  // stable across the 3s tick and across navigation.
  function paintSeason(el, s, W, H, moonS, moonXf, moonYf) {
    var host = el.querySelector('.season');
    if (!host) return [];
    // THE FORECAST SCREENSAVER'S OWN SKY (scene() below) stands its landscape
    // where the frames would be: it keeps everything that MOVES -- leaves,
    // bats, the witch, the sleigh, snow, the surprises' particles and flybys --
    // and leaves out the full-frame art (canopy, branches, cobweb, ground fog,
    // the Christmas garland, a surprise's frame). The land itself dresses up
    // instead (holidayLand).
    var landed = el.classList.contains('own');
    // Taller than wide: frames keep their shape (see .narrow in the CSS).
    host.classList.toggle('narrow', W < H);
    var name = s.season || '';
    var now = new Date();
    // The die is rolled here, not in read(): the key has to carry the day and
    // the outcome, so midnight re-rolls and a season that is "off" today
    // clears the container instead of leaving yesterday's field up.
    var plan = plannedFor(name, now);
    if (!plan.show) name = '';

    // ---- the surprise selector
    // ONE routing decision, in one place. `existingActive` is passed ONLY when
    // the existing season's own plan.show is true -- not merely because
    // the holiday season says Christmas -- or a rare surprise would lose to a
    // season that was not going to draw anything today anyway.
    //
    // seasonOf() already returns '' when the seasonal switch is off, so
    // the gate is carried here explicitly for the days when no season is
    // running at all and only a surprise could fire.
    var chosen = surpriseFor(now, {
      seasonalEnabled: s.seasonalOn !== false,
      enabled: INSTALLED,
      existingActive: name || null
    });
    var surprise = (chosen && chosen.reason !== 'existing-season') ? chosen.id : '';
    if (SURPRISE_FORCE) surprise = SURPRISE_FORCE;
    // previewing a season: today's own surprise (a birthday) must not replace it
    if (PREVIEW && PREVIEW_SEASONS[PREVIEW.id]) surprise = '';
    // A surprise REPLACES the seasonal scene for the day rather than stacking
    // on it. Birthday over Christmas is the deliberate case.
    if (surprise) name = '';
    var night = s.elev < -4;
    var spooky = name === 'halloween' && night && plan.spooky;
    // what the scene's land and lights follow (holidayOf)
    el._hkHoliday = { name: name, surprise: surprise, spooky: spooky };
    // Decorative snow stands down when it is actually snowing, or the weather
    // deck and this field composite into a doubled blizzard.
    var snowOK = !(s.wet && s.wet.kind === 'snow' && s.wet.rate > 0);

    // ---- scene lighting, applied EVERY paint and never baked
    // A continuous ramp on real sun elevation, not the binary `night` above:
    // dusk has to be gradual, and anything baked at build time can only change
    // by rebuilding the field, which resets every leaf mid-fall.
    var t = clamp((s.elev + 8) / 14, 0, 1);
    var dim = (s.cover > 0.75 || (s.wet && s.wet.rate >= 0.7)) ? 0.78 : 1;
    host.style.setProperty('--lbri', ((0.24 + 0.76 * t) * dim).toFixed(3));
    host.style.setProperty('--lsat', (0.46 + 0.54 * t).toFixed(3));
    host.style.setProperty('--lopa', (0.32 + 0.32 * t).toFixed(3));

    // Wind is BUCKETED, because it feeds animation durations and a duration
    // change retimes the animation -- applied continuously, every weather
    // update would visibly restart the field. 6 mph steps, clamped to 25.
    var windB = Math.round(clamp(s.wind, 0, 25) / 6) * 6;
    // Coarse density class only: heavy precipitation thins the leaves out, but
    // drizzle must not trigger a rebuild.
    var heavy = !!(s.wet && s.wet.rate >= 0.7);
    // The moon's center is in the key because the witch is laid out against
    // it: without it she would keep the trajectory from whichever paint first
    // built her. (While spooky it is a fixed 70%/24%, so it never changes.)
    //
    // Wind and heavy precipitation are NOT in a spooky key: they size the leaf
    // field, which a spooky night does not draw, and with them in the key every
    // weather update that crossed a wind bucket would rebuild the scene --
    // restarting the witch's cycle mid-flight.
    // `night` is deliberately NOT in this key. With the leaf brightness baked
    // at build it would have to be, and the entire field would be torn down
    // and rebuilt at the instant elevation crossed -4, in full view. The
    // lighting is a live variable, so only `spooky` (which implies night)
    // needs to force a rebuild, and that is a real scene change anyway.
    // the sleigh crosses the screensaver's Christmas moon (paint())
    var xmasNight = landed && name === 'christmas' && night;
    var moonKeyed = spooky || xmasNight;
    var key = name + '|' + surprise + '|' + (spooky ? 's' : '-') +
              '|' + (night ? 'n' : 'd') +
              '|' + dayKey(now) + '|' + Math.round(W) + 'x' + Math.round(H) +
              '|' + (moonKeyed ? Math.round(moonXf * 1000) + ',' +
                                 Math.round(moonYf * 1000) + ',' + moonS : 0) +
              '|' + (name === 'christmas' && snowOK ? 'w' : '-') +
              '|' + (spooky ? '-' : windB + (heavy ? 'h' : '-'));

    if (el._hkSeasonKey !== key) {
      el._hkSeasonKey = key;
      host.textContent = '';
      // One seed per season per day: stable while you navigate, different
      // tomorrow, and identical on every screen on the same day.
      // dayKey is the LOCAL day -- Date.now()/864e5 is the UTC day and rolls
      // over at 8pm local, which would rebuild the field in front of you
      // every evening.
      var rnd = rng(dayKey(now) + name.length * 7919);

      if (name === 'halloween' || name === 'thanksgiving') {
        // The leafy canopy is the ORDINARY fall treatment. Spooky nights strip
        // the tree bare, so the two are mutually exclusive -- never stacked.
        //
        // AND NO LEAVES ON A SPOOKY NIGHT EITHER, for two reasons that agree.
        //
        // The scene is already bare branches; leaves falling off a bare tree
        // does not cohere. The leaf field belongs to the ordinary fall
        // treatment, which still runs all day and all through Thanksgiving --
        // the two-sided tumble is not lost anywhere you actually watch it.
        //
        // And leaves make spooky FRAGILE. 18 leaves are 36 two-sided faces,
        // each a filtered render surface with preserve-3d and
        // backface-visibility: the most expensive construction in the sky.
        // Measured on a wall tablet under load, four runs, order
        // alternated: with leaves the MEDIAN frame rate was 30.2, 30.3, 30.2,
        // 30.2 -- half of every frame doubled -- and without them 59.9 in three
        // of four. On a cool tablet spooky holds 60.2 either way; the leaves are
        // what tip it over once the device is already working.
        if (!spooky && !landed) canopyLayer(host);
        var more = name === 'thanksgiving';
        if (!spooky) leafField(host, W, H, {
          // Heavy rain or snow thins the field right out: a full autumn fall
          // through a downpour reads as two weather systems at once.
          count: heavy ? 6 : (more ? 22 : 16),
          fallMin: more ? 16 : 19,
          fallMax: more ? 30 : 36,
          wind: windB
        }, rnd);
      }
      if (spooky) {
        fogWisps(host, rnd);
        batField(host, W, 3, rnd);
        // The RESOLVED moon center, not a guess, so she and the moon always
        // agree. Appended before the branches to match the depth order -- but
        // the z-index rules are what enforce it. The branches and cobweb draw
        // nothing random, so building her ahead of them leaves every other
        // value from rnd() unaffected.
        witchFly(host, W, H, moonS, moonXf, moonYf, rnd);
        if (!landed) {
          branchLayer(host);
          cobweb(host, W);
          var gf = document.createElement('div');
          gf.className = 'gfog';
          gf.style.setProperty('--gfo', '0.9');
          host.insertBefore(gf, host.firstChild);
        }
      }
      if (name === 'christmas') cozyWindow(host, W, H, rnd, snowOK, landed,
        xmasNight ? { s: moonS, x: moonXf, y: moonYf } : null);
      if (surprise) surpriseScene(host, W, H, surprise, night, heavy, rnd, landed);
    }

    // ---- contribution to the luminance estimate
    // Same arithmetic as the cloud decks: the texture's mean alpha times the
    // fraction of the frame the element covers is what it actually composites.
    var cover = [];
    if (name === 'halloween' || name === 'thanksgiving') {
      // The canopy DOMINATES the fall estimate -- full frame, so its mean
      // alpha is its coverage outright, no box fraction. Its luma carries the
      // same brightness ramp the layer is actually drawn with, because a lit
      // canopy and a near-silhouette one do not composite the same.
      var lit = (0.24 + 0.76 * t) * dim;
      if (!spooky && !landed) cover.push([SEASON.canopyA, SEASON.canopyL * lit]);
      // n leaves of mean box area ~1852px^2 (the two-depth size in
      // leafField: 3/4 at 20-46px, 1/4 at 52-78px; sampled). Small, but this
      // is the only seasonal layer ever lit by a DAY sky, so it is not
      // dropped.
      var n = Math.max(6, Math.round(
        (heavy ? 6 : (name === 'thanksgiving' ? 22 : 16)) * (W / 1280)));
      // Not when spooky: the field is not built then (see paintSeason).
      if (!spooky) cover.push([n * 1852 / (W * H) * SEASON.leafA * (0.32 + 0.32 * t),
                               SEASON.leafL * lit]);
    }
    if (spooky) {
      // The moon FIRST, because it is the brightest thing here and the order
      // matters to an alpha composite. Its box is MOON_PX square.
      cover.push([MOON_PX * MOON_PX / (W * H) * SEASON.moonA * 0.78, SEASON.moonL]);
      // Branches cover the WHOLE frame -- 0.214 mean alpha at 0.78 opacity.
      // Luma 18 rather than pure black, so it still darkens hard but is not a
      // hole.
      if (!landed) cover.push([SEASON.branchA * 0.78, SEASON.branchL]);
      // Two mist instances, each ~125% wide by ~25% tall at ~0.135 opacity.
      cover.push([1.25 * 0.25 * SEASON.fogA * 0.135, SEASON.fogL]);
      cover.push([1.25 * 0.25 * SEASON.fogA * 0.135, SEASON.fogL]);
      // The web is kept in the estimate only because it is trivial to carry;
      // at 0.019 alpha over 1.7% of the frame it rounds away.
      cover.push([0.13 * 0.13 * SEASON.webA * 0.28, SEASON.webL]);
    }
    if (surprise) {
      var sc = SURPRISE[surprise];
      // The frame covers the whole viewport, so its mean alpha IS its coverage,
      // scaled by the .sp-frame opacity and lit by the same ramp as everything
      // else in .season.
      var slit = (0.24 + 0.76 * t) * dim;
      if (sc.frame && !landed) cover.push([sc.a * 0.86, sc.l * slit]);
      // Particles: n boxes averaging ~14px (sparkle ~3.5px), times the kind's
      // own mean alpha. Small, and carried so its absence is not mistaken for
      // an oversight.
      var pk = SP_PART[sc.part || sc.kind] || SP_PART.sparkle;
      var pn = Math.max(3, Math.round(
        (heavy ? Math.min(4, sc.count) : sc.count) * (W / 1280)));
      var pbox = sc.kind === 'sparkle' ? 12 : 196;
      cover.push([pn * pbox / (W * H) * pk.a * 0.5, pk.l * slit]);
    }
    if (name === 'christmas') {
      // The decoration master covers the WHOLE frame, so its mean alpha IS
      // its coverage -- no box fraction to apply. At luma 64 it sits BELOW a
      // daytime sky, so it darkens by day and lifts only slightly at night.
      if (!landed) cover.push([SEASON.decorA, SEASON.decorL]);
      // 20 halos in 32px boxes. The radial mask passes only the soft core --
      // roughly 7% of each box survives it -- and the twinkle averages well
      // under its 0.55 peak. This rounds away against CAP and is carried only
      // because leaving it out would look like an oversight.
      cover.push([20 * 32 * 32 / (W * H) * SEASON.xglowA * 0.07 * 0.12,
                  SEASON.xglowL]);
      if (snowOK) {
        // ~28 flakes averaging ~5px: about 700px^2 of a 1024000px^2 frame.
        var sn = Math.max(8, Math.round(28 * (W / 1280)));
        cover.push([sn * 25 / (W * H) * SEASON.snowA * 0.4, SEASON.snowL]);
      }
      // Santa is black and crosses for 7% of a 200s cycle. Time-averaged he is
      // far below the rounding on CAP; he is here for completeness.
      cover.push([0.0144 * SEASON.sleighA * 0.85 * 0.07, 0]);
    }
    return cover;
  }

  // THE LAYERS, bottom to top. `land`: the forecast screensaver's landscape
  // (scene() below), over the clouds and under the fog, rain and snow, so
  // the weather falls in front of the hills.
  function layersHtml(land) {
    return '<div class="grad"></div>' +
    // THE ALBUM COVER, for the Play Music page. Over the gradient so the
    // palette is its floor -- a cover that fails to load, or a page with
    // nothing playing, simply leaves the purple showing -- and under
    // everything else so grain and the scrim treat it like any other sky.
    '<div class="art"></div>' +
    '<div class="glow"></div>' +
    '<div class="stars"></div>' +
    // the screensaver's own: twinkling stars and the odd shooting star
    (land ? '<div class="twk"></div>' : '') +
    '<div class="moon"></div>' +
    '<div class="cl a"></div>' +
    '<div class="cl b"></div>' +
    '<div class="cl c"></div>' +
    (land ? '<div class="land"><i></i><i></i></div>' +
            // THE LAND'S OWN BOX: the art's 2560x1600 frame as `cover` lays
            // it out, so anything placed on the land (a holiday's lights, the
            // birthday balloons, fireflies, fireworks over the hills) is
            // placed in the art's own pixels and lands where the art has it
            '<div class="lbox"><div class="hl"><b><i></i><i></i></b></div>' +
            '<div class="hx"></div><div class="bx"></div><div class="life"></div></div>' : '') +
    '<div class="fog"></div>' +
    '<div class="rain r1"></div>' +
    '<div class="rain r2"></div>' +
    '<div class="snow s1"></div>' +
    '<div class="snow s2"></div>' +
    '<div class="bolt"></div>' +
    // BEFORE grain and scrim, so the seasonal layers are capped with the
    // rest of the sky rather than floating over CAP.
    '<div class="season"></div>' +
    '<div class="grain"></div>' +
    '<div class="scrim"></div>';
  }

  function build(host) {
    var el = document.createElement('div');
    el.id = 'hk-sky';
    el.innerHTML = layersHtml(false);

    // AFTER hui-view-background, so equal z-index resolves in our favor.
    var bg = host.querySelector('hui-view-background');
    if (bg && bg.nextSibling) host.insertBefore(el, bg.nextSibling);
    else if (bg) host.appendChild(el);
    else host.insertBefore(el, host.firstChild);
    // After insertion: getRootNode() has to see the real shadow root.
    attachStyles(el);
    return el;
  }

  // A SKY OF ITS OWN (HK Frontend 1.3): the forecast screensaver's
  // (hk-saver.js). The page's sky is ONE element in the view, hidden and still
  // behind any screensaver; this is a second one, built into the screensaver's
  // own shadow root with its own stylesheet, painted by the same paint() from
  // the same read() -- so it is the same live sky, weather and all -- plus a
  // landscape (tools/sky/src/land/, frontend/sky/land-*.webp) between the
  // clouds and the falling weather. paint() keeps its per-element state on the
  // element (el._hkSeasonKey), so the two never disturb each other.
  //
  //   var sc = hkSky.scene(container);  sc.update(hass);  sc.pause(true);  sc.destroy();
  var OWN_CSS = [
    '#hk-sky.own{z-index:0}',
    '#hk-sky .land>i{position:absolute;inset:0;background-repeat:no-repeat;',
    '  background-position:center bottom;background-size:cover;opacity:0;',
    '  transition:opacity 4s ease;filter:brightness(var(--landB,1));will-change:opacity}',
    '#hk-sky .land>i.on{opacity:1}',
    // with a landscape, the horizon colour belongs where the land meets the
    // sky (the art's horizon is at ~60%), and the season's frame gives way to
    // the season's own land
    '#hk-sky.own.landed .grad{background:linear-gradient(to bottom,',
    '  var(--sk0) 0%,var(--sk1) 24%,var(--sk2) 44%,var(--sk3) 62%)}',
    // (the seasonal layer stays: paintSeason leaves its frames out here)
    // ---- twinkling stars: brighter stars over the star texture, each on its
    // own slow scintillation, faded with the stars (--starO)
    '#hk-sky .twk{opacity:var(--starO,0);transition:opacity 6s linear}',
    '#hk-sky .twk .st{position:absolute;width:var(--s);height:var(--s);',
    '  margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);border-radius:50%;',
    '  background:#f6f8ff;box-shadow:0 0 calc(var(--s) * 2.2) rgba(214,226,255,.75);',
    '  opacity:.3;animation:hk-twk1 var(--td) ease-in-out var(--tdel) infinite}',
    // LONG LOOPS, several twinkles each. Every loop's end is a trip to the
    // main thread (the animation's timing is re-synced there), so 34 stars on
    // 3-9 s loops re-styled the page ~24 times a second; on 36-64 s loops
    // holding three or four twinkles, about twice. The same goes for every
    // flame, bulb and firefly below.
    '@keyframes hk-twk1{0%,100%{opacity:.3}6.5%{opacity:.3}8%{opacity:var(--pk)}10.5%{opacity:.3}34.5%{opacity:.3}36%{opacity:var(--pk)}38.5%{opacity:.3}61.5%{opacity:.3}63%{opacity:var(--pk)}65.5%{opacity:.3}86.5%{opacity:.3}88%{opacity:var(--pk)}90.5%{opacity:.3}}',
    '@keyframes hk-twk2{0%,100%{opacity:.3}13.5%{opacity:.3}15%{opacity:var(--pk)}17.5%{opacity:.3}45.5%{opacity:.3}47%{opacity:var(--pk)}49.5%{opacity:.3}69.5%{opacity:.3}71%{opacity:var(--pk)}73.5%{opacity:.3}}',
    '@keyframes hk-twk3{0%,100%{opacity:.3}21.5%{opacity:.3}23%{opacity:var(--pk)}25.5%{opacity:.3}53.5%{opacity:.3}55%{opacity:var(--pk)}57.5%{opacity:.3}80.5%{opacity:.3}82%{opacity:var(--pk)}84.5%{opacity:.3}}',
    // ---- shooting stars: parked at opacity 0 for all but ~1.5% of a long
    // cycle, then a streak along the element's own rotated x-axis. Only on a
    // clear night (.meteors); each crossing re-aims the next (meteorAim)
    '#hk-sky .twk .ss{position:absolute;width:0;height:0;display:none;',
    '  transform:rotate(var(--a))}',
    '#hk-sky.meteors .twk .ss{display:block}',
    '#hk-sky .twk .ss i{position:absolute;right:0;top:-1px;width:var(--len);height:2px;',
    '  border-radius:2px;background:linear-gradient(to right,rgba(236,242,255,0),',
    '  rgba(236,242,255,.55) 70%,#fff);box-shadow:0 0 6px rgba(214,226,255,.6);',
    '  opacity:0;will-change:transform,opacity;',
    '  animation:hk-meteor var(--md) linear var(--mdel) infinite}',
    '@keyframes hk-meteor{0%{transform:translate3d(0,0,0);opacity:0}',
    '  .2%{opacity:1}.9%{opacity:.85}1.2%,100%{transform:translate3d(var(--run),0,0);opacity:0}}',
    // ---- the land's box (see layersHtml)
    // Centred by its LEFT, never a transform: under a transformed box the
    // flames, bulbs and fireflies stop animating on the compositor and redo
    // the page's style every frame (measured: 26 recalcs a second against 2)
    '#hk-sky .lbox{inset:auto;left:calc(50% - var(--lbw,100%) / 2);bottom:0;',
    '  width:var(--lbw,100%);height:var(--lbh,100%)}',
    '#hk-sky .lbox>*{position:absolute;inset:0}',
    // a holiday's LIGHTS LAYER: the full glow over the land's embers, two
    // layers cross-fading like the land's, dimmed with the land
    '#hk-sky .hl{opacity:var(--hlO,0);transition:opacity 4s ease;filter:brightness(var(--hlB,1))}',
    '#hk-sky .hl b,#hk-sky .hl i{position:absolute;inset:0}',
    '#hk-sky .hl i{background:center/100% 100% no-repeat;opacity:0;transition:opacity 4s ease}',
    '#hk-sky .hl i.on{opacity:1}',
    // candles gutter; café lights breathe
    '#hk-sky .hl.flick b{animation:hk-hlflick 17s linear infinite}',
    '@keyframes hk-hlflick{0%,100%{opacity:1}3%{opacity:.86}4%{opacity:.97}10%{opacity:.9}',
    '  12%{opacity:1}18%{opacity:.84}20%{opacity:.95}29%{opacity:.88}31%{opacity:1}',
    '  40%{opacity:.85}42%{opacity:.96}53%{opacity:.9}55%{opacity:1}63%{opacity:.83}',
    '  66%{opacity:.97}75%{opacity:.89}77%{opacity:1}86%{opacity:.86}89%{opacity:.98}}',
    '#hk-sky .hl.breathe b{animation:hk-hlbreathe 16s ease-in-out infinite alternate}',
    '@keyframes hk-hlbreathe{from{opacity:.84}to{opacity:1}}',
    // one candle's own flame, and one bulb's twinkle, from the art's list
    '#hk-sky .hx>*{position:absolute;aspect-ratio:1;transform:translate(-50%,-50%);',
    '  border-radius:50%;opacity:0;will-change:opacity}',
    '#hk-sky .hx .cf{background:radial-gradient(circle,rgba(255,190,96,.62) 0,',
    '  rgba(255,138,40,.26) 32%,rgba(255,110,20,0) 68%);',
    '  animation:hk-candle var(--cd) linear var(--cdl) infinite}',
    '@keyframes hk-candle{0%,100%{opacity:.55}3%{opacity:.85}5%{opacity:.5}9%{opacity:.75}',
    '  12%{opacity:.62}16%{opacity:.95}19%{opacity:.58}24%{opacity:.8}27%{opacity:.66}',
    '  31%{opacity:.9}33%{opacity:.52}38%{opacity:.7}43%{opacity:.6}46%{opacity:.92}',
    '  50%{opacity:.64}54%{opacity:.82}57%{opacity:.5}62%{opacity:.78}66%{opacity:.6}',
    '  71%{opacity:.97}74%{opacity:.62}79%{opacity:.84}83%{opacity:.55}88%{opacity:.76}',
    '  92%{opacity:.6}96%{opacity:.88}}',
    '#hk-sky .hx .tw{background:radial-gradient(circle,#fff6e6 0,rgba(255,236,200,.9) 12%,',
    '  rgba(255,196,120,.35) 30%,rgba(255,170,90,0) 60%);',
    '  animation:hk-bulb var(--td) ease-in-out var(--tdel) infinite}',
'@keyframes hk-bulb{0%,100%{opacity:0}7%{opacity:0}12%{opacity:var(--pk)}21%{opacity:0}40%{opacity:0}45%{opacity:var(--pk)}54%{opacity:0}73%{opacity:0}78%{opacity:var(--pk)}87%{opacity:0}}',
    // the birthday balloons, each cluster swaying on its own knot
    '#hk-sky .bx .bln{position:absolute;inset:auto;background:center/100% 100% no-repeat;',
    '  transform-origin:var(--ox) var(--oy);will-change:transform;',
    '  transition:background-image 4s ease;filter:brightness(var(--landB,1));',
    '  animation:hk-sway var(--sd) ease-in-out var(--sdl) infinite alternate}',
    '@keyframes hk-sway{from{transform:rotate(var(--r0))}to{transform:rotate(var(--r1))}}',
    // fireflies over the meadow on a summer night: a slow wander and a blink
    '#hk-sky .life .ff{position:absolute;width:0;height:0;will-change:transform;',
    '  animation:hk-ffwander var(--wd) ease-in-out var(--wdl) infinite}',
    '#hk-sky .life .ff i{position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;',
    '  border-radius:50%;background:#f6ffc4;',
    '  box-shadow:0 0 7px 3px rgba(220,255,120,.8),0 0 22px 8px rgba(196,255,96,.3);',
    '  opacity:0;animation:hk-ffblink1 var(--bd) ease-in-out var(--bdl) infinite}',
    '@keyframes hk-ffwander{0%,100%{transform:translate3d(0,0,0)}',
    '  17%{transform:translate3d(var(--dx1),var(--dy1),0)}',
    '  33%{transform:translate3d(var(--dx2),var(--dy2),0)}',
    '  50%{transform:translate3d(var(--dx3),var(--dy3),0)}',
    '  67%{transform:translate3d(var(--dx4),var(--dy4),0)}',
    '  83%{transform:translate3d(var(--dx5),var(--dy5),0)}}',
    '@keyframes hk-ffblink1{0%,100%{opacity:0}4.5%{opacity:0}6%{opacity:1}8%{opacity:.85}10.5%{opacity:0}17.5%{opacity:0}19%{opacity:1}21%{opacity:.85}23.5%{opacity:0}29.5%{opacity:0}31%{opacity:1}33%{opacity:.85}35.5%{opacity:0}45.5%{opacity:0}47%{opacity:1}49%{opacity:.85}51.5%{opacity:0}56.5%{opacity:0}58%{opacity:1}60%{opacity:.85}62.5%{opacity:0}71.5%{opacity:0}73%{opacity:1}75%{opacity:.85}77.5%{opacity:0}84.5%{opacity:0}86%{opacity:1}88%{opacity:.85}90.5%{opacity:0}}',
    '@keyframes hk-ffblink2{0%,100%{opacity:0}1.5%{opacity:0}3%{opacity:1}5%{opacity:.85}7.5%{opacity:0}13.5%{opacity:0}15%{opacity:1}17%{opacity:.85}19.5%{opacity:0}26.5%{opacity:0}28%{opacity:1}30%{opacity:.85}32.5%{opacity:0}38.5%{opacity:0}40%{opacity:1}42%{opacity:.85}44.5%{opacity:0}53.5%{opacity:0}55%{opacity:1}57%{opacity:.85}59.5%{opacity:0}65.5%{opacity:0}67%{opacity:1}69%{opacity:.85}71.5%{opacity:0}78.5%{opacity:0}80%{opacity:1}82%{opacity:.85}84.5%{opacity:0}91.5%{opacity:0}93%{opacity:1}95%{opacity:.85}97.5%{opacity:0}}',
    // Fourth of July fireworks over the hills: one burst per element per
    // cycle, each cycle re-placed (fireworkAim)
    '#hk-sky .life .fw{position:absolute;aspect-ratio:1;opacity:0;',
    '  background:url(' + SP_ASSET.firework + ') center/contain no-repeat;',
    '  filter:hue-rotate(var(--hue)) saturate(1.3);will-change:transform,opacity;',
    '  animation:hk-fw var(--fd) ease-out var(--fdl) infinite}',
    '@keyframes hk-fw{0%{opacity:0;transform:translate(-50%,-50%) scale(.12)}',
    '  .5%{opacity:.95;transform:translate(-50%,-50%) scale(.75)}',
    '  4.5%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}',
    '  100%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}}',
    // HELD, NOT HIDDEN: the screensaver's sky pauses between forecast slides
    // (and under Fully's dark screensaver) without dropping its layers --
    // .hidden's will-change:auto took the land and the fog off their layers
    // at every slide's start and put them back at its end, and the WebView
    // re-rastered what sits above each time (the flicker at every turn)
    '#hk-sky.own.held *{animation-play-state:paused!important}',
    '@media (prefers-reduced-motion:reduce){#hk-sky .land>i{transition:none}}'
  ].join('');
  // The season of the LAND (not the holiday seasons of seasonOf): by the
  // month, flipped south of the equator; snow falling makes it winter.
  var LAND_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
                    'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
  var LAND_SOUTH = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' };
  function landSeason(hass, s, when) {
    if (s.land) return s.land;                 // a dev pin: hkSky._pin({land:'summer'})
    if (s.wet && s.wet.kind === 'snow' && s.wet.rate > 0) return 'winter';
    var north = LAND_MONTH[(when || new Date()).getMonth()];
    var lat = hass && hass.config && Number(hass.config.latitude);
    return isFinite(lat) && lat < 0 ? LAND_SOUTH[north] : north;
  }
  // day above 6 degrees, dusk (and dawn) down to civil twilight, then night
  function landLight(elev) { return elev > 6 ? 'day' : (elev > -7 ? 'dusk' : 'night'); }
  function landFile(hass, s, when) { return 'land-' + landSeason(hass, s, when) + '-' + landLight(s.elev) + '.webp'; }

  // ------------------------------------------- the screensaver's own life
  // HK Frontend 1.5: what moves on the forecast screensaver beyond the page's
  // sky -- twinkling stars and the odd shooting star on a clear night,
  // fireflies over a summer meadow, and the holidays dressed onto the land
  // itself. All of it CSS animations on transform and opacity, built once per
  // key and held still with the rest of the scene (.held).
  var OWN_DRIFT = 1.8;               // the screensaver's clouds, x the page's
  var ART_W = 2560, ART_H = 1600;    // the landscapes' frame
  function ax(x) { return (x / ART_W * 100).toFixed(3) + '%'; }
  function ay(y) { return (y / ART_H * 100).toFixed(3) + '%'; }

  // frontend/sky/holiday.json (tools/sky/holiday_webp.py): where each
  // holiday's lights are and where the balloons are tied. Asked for once;
  // until it is here (or when it is not there at all) the lights still
  // glow, only without each flame and bulb of their own.
  var HOL = null, holAsked = false, holWait = [];
  function holData(cb) {
    if (HOL) return HOL;
    if (cb) holWait.push(cb);
    if (holAsked) return null;
    holAsked = true;
    var done = function (j) {
      HOL = j || {};
      holWait.splice(0).forEach(function (f) { try { f(); } catch (e) { /* its scene is gone */ } });
    };
    try {
      fetch(BASE + 'holiday.json' + VER, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(done, function () { done({}); });
    } catch (e) { done({}); }
    return null;
  }

  // THE HOLIDAY LANDS (tools/sky/src/land-holiday/): the season's own place,
  // decorated. Whatever paintSeason decided today (el._hkHoliday) -- a season
  // that is showing, or a surprise that replaced it -- picks the land:
  //   Halloween      its pumpkins at dusk and night (by day, plain fall)
  //   Christmas      its lights, day, dusk and night
  //   Fourth of July its bunting and flag, day, dusk and night
  //   a birthday     the season's own land, with balloons (holidayBalloons)
  function holidayLand(h, light) {
    if (!h) return null;
    if (h.surprise === 'fourth-of-july') return 'land-july4-' + light;
    if (h.surprise) return null;
    if (h.name === 'halloween') return light === 'day' ? null : 'land-halloween-' + light;
    if (h.name === 'christmas') return 'land-christmas-' + light;
    return null;
  }
  // ...and its lights layer: the full glow over the land's embers. July 4 at
  // dusk borrows the night's, fainter.
  function holidayLights(h, light) {
    if (!h || light === 'day') return null;
    var dusk = light === 'dusk';
    if (h.surprise === 'fourth-of-july') return { file: 'land-july4-night-lights', o: dusk ? 0.6 : 1, mode: 'breathe' };
    if (h.surprise) return null;
    if (h.name === 'halloween') return { file: 'land-halloween-' + light + '-lights', o: dusk ? 0.8 : 1, mode: 'flick' };
    if (h.name === 'christmas') return { file: 'land-christmas-' + light + '-lights', o: dusk ? 0.85 : 1, mode: 'twinkle' };
    return null;
  }

  // TWINKLING STARS. Brighter stars than the texture's, each scintillating
  // on its own period, and two shooting stars on long cycles (127 and 193 s,
  // so together one about every 77 s of a clear night) that re-aim at random
  // after every crossing: never the same streak twice.
  var METEOR_CYCLES = [127, 193];
  function meteorAim(ss, rnd) {
    var right = rnd() < 0.5, a = 16 + rnd() * 24;
    ss.style.left = (right ? 8 + rnd() * 52 : 40 + rnd() * 52).toFixed(1) + '%';
    ss.style.top = (3 + rnd() * 24).toFixed(1) + '%';
    ss.style.setProperty('--a', (right ? a : 180 - a).toFixed(1) + 'deg');
    ss.style.setProperty('--run', (320 + rnd() * 360).toFixed(0) + 'px');
    ss.style.setProperty('--len', (90 + rnd() * 90).toFixed(0) + 'px');
  }
  function twinkles(host, W, H, rnd) {
    host.textContent = '';
    var n = Math.round(clamp(34 * W / 1280, 18, 60));
    for (var i = 0; i < n; i++) {
      var d = document.createElement('div');
      d.className = 'st';
      d.style.left = (rnd() * 100).toFixed(2) + '%';
      // the upper sky: the land covers the rest
      d.style.top = (2 + Math.pow(rnd(), 1.3) * 50).toFixed(2) + '%';
      d.style.setProperty('--s', (1.3 + Math.pow(rnd(), 2) * 2.1).toFixed(2) + 'px');
      var td = 36 + rnd() * 28;
      d.style.animationName = 'hk-twk' + (i % 3 + 1);
      d.style.setProperty('--td', td.toFixed(1) + 's');
      d.style.setProperty('--tdel', (-rnd() * td).toFixed(1) + 's');
      d.style.setProperty('--pk', (0.6 + rnd() * 0.4).toFixed(2));
      host.appendChild(d);
    }
    METEOR_CYCLES.forEach(function (md) {
      var ss = document.createElement('div');
      ss.className = 'ss';
      var i = document.createElement('i');
      i.style.setProperty('--md', md + 's');
      // the first one 20-80 s after the scene is built, not on its first frame
      i.style.setProperty('--mdel', (-(md - 20 - rnd() * 60)).toFixed(1) + 's');
      meteorAim(ss, rnd);
      i.addEventListener('animationiteration', function () { meteorAim(ss, Math.random); });
      ss.appendChild(i);
      host.appendChild(ss);
    });
  }

  // FIREFLIES: along the foot of the tree line and over the top of the
  // meadow (the art's y 830-1080), above the forecast's own place.
  function fireflies(host, W, rnd) {
    var n = Math.round(clamp(22 * W / 1280, 14, 36));
    for (var i = 0; i < n; i++) {
      var f = document.createElement('div');
      f.className = 'ff';
      f.style.left = ax(160 + rnd() * 2240);
      f.style.top = ay(830 + rnd() * 250);
      // five waypoints around its spot, one long loop (see hk-twk1)
      for (var k = 1; k <= 5; k++) {
        f.style.setProperty('--dx' + k, (-55 + rnd() * 110).toFixed(0) + 'px');
        f.style.setProperty('--dy' + k, (-28 + rnd() * 50).toFixed(0) + 'px');
      }
      var wd = 50 + rnd() * 40, bd = 40 + rnd() * 24;
      f.style.setProperty('--wd', wd.toFixed(1) + 's');
      f.style.setProperty('--wdl', (-rnd() * wd).toFixed(1) + 's');
      var g = document.createElement('i');
      g.style.animationName = 'hk-ffblink' + (i % 2 + 1);
      g.style.setProperty('--bd', bd.toFixed(1) + 's');
      g.style.setProperty('--bdl', (-rnd() * bd).toFixed(1) + 's');
      f.appendChild(g);
      host.appendChild(f);
    }
  }

  // FIREWORKS over the hills on the Fourth's night: five shells on prime-ish
  // cycles, so they never fall into a rhythm, each re-placed and re-coloured
  // after it bursts.
  var FW_CYCLES = [17, 19, 23, 29, 31];
  var FW_HUES = [0, 35, 150, 205, 285, 330];
  function fireworkAim(e, rnd) {
    e.style.left = (14 + rnd() * 66).toFixed(1) + '%';
    e.style.top = ay(300 + rnd() * 300);
    e.style.width = (9 + rnd() * 7).toFixed(1) + '%';
    e.style.setProperty('--hue', FW_HUES[Math.floor(rnd() * FW_HUES.length)] + 'deg');
  }
  function fireworks(host, rnd) {
    FW_CYCLES.forEach(function (fd, k) {
      var e = document.createElement('div');
      e.className = 'fw';
      e.style.setProperty('--fd', fd + 's');
      e.style.setProperty('--fdl', (-(fd - 2 - k * 3.1 - rnd() * 3)).toFixed(1) + 's');
      fireworkAim(e, rnd);
      e.addEventListener('animationiteration', function () { fireworkAim(e, Math.random); });
      host.appendChild(e);
    });
  }

  // A holiday's own flames and bulbs, from holiday.json's list for its lights
  // layer: every candle flickers on its own; sixty of the bulbs, picked
  // fresh each day, twinkle one at a time over the layer's steady glow.
  function holidayGlints(host, lit, rnd) {
    var list = HOL && HOL.lights && HOL.lights[lit.file];
    if (!list || !list.length) return;
    if (lit.mode === 'flick') {
      list.forEach(function (L) {
        var c = document.createElement('div');
        c.className = 'cf';
        c.style.left = ax(L[0]);
        c.style.top = ay(L[1]);
        c.style.width = ax(Math.max(L[2] * 7, 70));
        var cd = 14 + rnd() * 8;
        c.style.setProperty('--cd', cd.toFixed(1) + 's');
        c.style.setProperty('--cdl', (-rnd() * cd).toFixed(1) + 's');
        host.appendChild(c);
      });
    } else if (lit.mode === 'twinkle') {
      var pick = list.slice();
      for (var i = pick.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1)), t = pick[i]; pick[i] = pick[j]; pick[j] = t;
      }
      pick.slice(0, 60).forEach(function (L) {
        var b = document.createElement('div');
        b.className = 'tw';
        b.style.left = ax(L[0]);
        b.style.top = ay(L[1]);
        // a bulb's own sparkle, not a halo: about four bulbs across
        b.style.width = ax(Math.max(L[2] * 5, 22));
        var td = 40 + rnd() * 30;
        b.style.setProperty('--td', td.toFixed(1) + 's');
        b.style.setProperty('--tdel', (-rnd() * td).toFixed(1) + 's');
        b.style.setProperty('--pk', (0.55 + rnd() * 0.45).toFixed(2));
        host.appendChild(b);
      });
    }
  }

  // THE BIRTHDAY BALLOONS: holiday.json's two clusters, each a sprite cut
  // from the overlay with its knot, drawn at its `scale` with the knot staked
  // at `at` (in the grass beside its tree), swaying a degree or two about it.
  function balloons(host, light, rnd) {
    var list = HOL && HOL.balloons;
    if (!list || !list.length) return;
    list.forEach(function (c) {
      var b = document.createElement('div');
      var k = c.scale || 1, at = c.at || c.knot;
      var w = c.box[2] * k, h = c.box[3] * k;
      var x = at[0] - (c.knot[0] - c.box[0]) * k, y = at[1] - (c.knot[1] - c.box[1]) * k;
      b.className = 'bln';
      b.dataset.cluster = c.cluster;
      b.style.left = ax(x);
      b.style.top = ay(y);
      b.style.width = ax(w);
      b.style.height = ay(h);
      b.style.backgroundImage = 'url("' + BASE + 'birthday-' + c.cluster + '-' + light + '.webp' + VER + '")';
      b.style.setProperty('--ox', ((at[0] - x) / w * 100).toFixed(2) + '%');
      b.style.setProperty('--oy', ((at[1] - y) / h * 100).toFixed(2) + '%');
      var r = 1.4 + rnd() * 1.2;
      b.style.setProperty('--r0', (-r).toFixed(2) + 'deg');
      b.style.setProperty('--r1', (r * (0.8 + rnd() * 0.4)).toFixed(2) + 'deg');
      var sd = 4.5 + rnd() * 2.5;
      b.style.setProperty('--sd', sd.toFixed(1) + 's');
      b.style.setProperty('--sdl', (-rnd() * sd).toFixed(1) + 's');
      host.appendChild(b);
    });
  }

  // A pair of layers that cross-fade to whatever image is asked for, once it
  // has decoded; the first of `list` that is there wins. (The land, and a
  // holiday's lights.)
  function fader(layers, shownCb) {
    var top = 0, shown = '', want = '', missing = {}, last = [];
    function show(list) {
      last = list;
      var file = null;
      for (var i = 0; i < list.length; i++) if (list[i] && !missing[list[i]]) { file = list[i]; break; }
      if (!file) {
        if (shown) { layers[top].classList.remove('on'); shown = ''; want = ''; }
        return;
      }
      if (file === shown || file === want) return;
      want = file;
      var url = BASE + file + VER, im = new Image();
      var ready = function () {
        if (want !== file || !layers[0].isConnected) return;
        var next = layers[1 - top];
        next.style.backgroundImage = 'url("' + url + '")';
        next.classList.add('on');
        layers[top].classList.remove('on');
        top = 1 - top; shown = file; want = '';
        if (shownCb) shownCb(file);
      };
      im.onload = function () { (im.decode ? im.decode().catch(function () {}) : Promise.resolve()).then(ready); };
      // art that is not there (not made yet, a 404): the next in the list
      im.onerror = function () { missing[file] = true; if (want === file) want = ''; show(last); };
      im.src = url;
    }
    return { show: show, shown: function () { return shown; } };
  }

  function scene(host) {
    var el = document.createElement('div');
    el.id = 'hk-sky';
    el.className = 'own';
    el.innerHTML = layersHtml(true);
    host.appendChild(el);
    // its OWN sheet: attachStyles() keeps one module-level handle, the page
    // sky's, and must not lose it to this one
    var root = el.getRootNode(), own = null, tag = null;
    try {
      if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') {
        own = new CSSStyleSheet();
        own.replaceSync(SHEET + OWN_CSS);
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat(own);
      }
    } catch (e) { own = null; }
    if (!own) {
      tag = document.createElement('style');
      tag.textContent = SHEET + OWN_CSS;
      (root.appendChild ? root : document.head).appendChild(tag);
    }
    // A landscape arrives decoded, then cross-fades in over the other layer.
    // Art that is not there (not installed yet, a 404) is simply no land: the
    // sky alone, with the season's frame, as on the pages. A holiday's land
    // that is not there is the season's own.
    // The saver updates the scene only when the sun or the weather changes,
    // so what arrives later -- a land, its lights, holiday.json -- carries on
    // from the last reading itself (again()).
    var last = null;
    function again() { if (last && el.isConnected) alive(last[0], last[1]); }
    var landF = fader(el.querySelectorAll('.land > i'), function () { el.classList.add('landed'); again(); });
    var hlEl = el.querySelector('.hl');
    var lightF = fader(hlEl.querySelectorAll('i'), again);
    var box = el.querySelector('.lbox');
    var twk = el.querySelector('.twk'), hx = el.querySelector('.hx');
    var bx = el.querySelector('.bx'), life = el.querySelector('.life');
    var keys = {};
    holData(again);

    // Rebuild a part only when its key changes; the day is in each key so a
    // new day re-rolls the stars, the bulbs and the balloons' sway.
    function part(name, key, build) {
      if (keys[name] === key) return;
      keys[name] = key;
      build();
    }

    function alive(hass, s) {
      last = [hass, s];
      var W = el.clientWidth || 1280, H = el.clientHeight || 800;
      var k = Math.max(W / ART_W, H / ART_H);
      box.style.setProperty('--lbw', (ART_W * k).toFixed(1) + 'px');
      box.style.setProperty('--lbh', (ART_H * k).toFixed(1) + 'px');
      var now = new Date(), day = dayKey(now), size = Math.round(W) + 'x' + Math.round(H);
      var light = landLight(s.elev), h = el._hkHoliday || {};
      var wet = !!(s.wet && s.wet.rate > 0);

      part('twk', day + '|' + size, function () { twinkles(twk, W, H, rng(day * 31 + 7)); });
      var night = clamp((-4 - s.elev) / 10, 0, 1);
      el.classList.toggle('meteors', night > 0.6 && s.cover < 0.3 && !wet && !s.fog);

      var flies = landSeason(hass, s) === 'summer' && s.elev < -5 && !wet && s.wind < 18;
      var fw = h.surprise === 'fourth-of-july' && s.elev < -4;
      part('life', day + '|' + (flies ? 'f' : '-') + (fw ? 'w' : '-') + '|' + size, function () {
        life.textContent = '';
        var rnd = rng(day * 17 + 3);
        if (flies) fireflies(life, W, rnd);
        if (fw) fireworks(life, rnd);
      });

      // the holiday's land, then -- once that land is the one showing -- its lights
      var hol = holidayLand(h, light);
      landF.show(hol ? [hol + '.webp', landFile(hass, s)] : [landFile(hass, s)]);
      var lit = hol && landF.shown() === hol + '.webp' ? holidayLights(h, light) : null;
      lightF.show(lit ? [lit.file + '.webp'] : []);
      var lightsUp = !!(lit && lightF.shown() === lit.file + '.webp');
      hlEl.style.setProperty('--hlO', lightsUp ? String(lit.o) : '0');
      hlEl.classList.toggle('flick', !!(lit && lit.mode === 'flick'));
      hlEl.classList.toggle('breathe', !!(lit && lit.mode === 'breathe'));
      part('hx', day + '|' + (lightsUp ? lit.file : '') + '|' + (HOL ? 1 : 0), function () {
        hx.textContent = '';
        if (lightsUp) holidayGlints(hx, lit, rng(day * 13 + 5));
      });

      var bday = h.surprise === 'birthday';
      part('bx', day + '|' + (bday ? 'b' : '-') + '|' + (HOL ? 1 : 0), function () {
        bx.textContent = '';
        if (bday) balloons(bx, light, rng(day * 11 + 1));
      });
      // the balloons follow the light (their background-image cross-fades)
      Array.prototype.forEach.call(bx.children, function (b) {
        var url = 'url("' + BASE + 'birthday-' + b.dataset.cluster + '-' + light + '.webp' + VER + '")';
        if (b.style.backgroundImage !== url) b.style.backgroundImage = url;
      });
    }

    return {
      el: el,
      update: function (hass) {
        if (!hass || !hass.states) return null;
        var s = read(hass);
        paint(el, s);
        // an overcast or wet day darkens the land with the sky
        var dim = 1 - 0.3 * clamp((s.cover - 0.4) / 0.6, 0, 1) - (s.wet && s.wet.rate > 0 ? 0.08 : 0);
        el.style.setProperty('--landB', dim.toFixed(3));
        hlEl.style.setProperty('--hlB', (0.85 + 0.15 * dim).toFixed(3));
        alive(hass, s);
        return s;
      },
      // the screen is dark (Fully's own screensaver, the page hidden): hold still
      pause: function (on) { el.classList.toggle('held', !!on); },
      landShown: function () { return landF.shown(); },
      lightsShown: function () { return lightF.shown(); },
      destroy: function () {
        el.remove();
        if (own && root.adoptedStyleSheets) {
          root.adoptedStyleSheets = root.adoptedStyleSheets.filter(function (x) { return x !== own; });
        }
        if (tag) tag.remove();
      }
    };
  }

  // EVERY falling layer is a TILED BITMAP, and a tiled bitmap is doubly
  // periodic -- it repeats every tile in x AND in y independently. So it loops
  // seamlessly only if BOTH components of the travel are whole multiples of
  // the tile, which is satisfied here by falling straight down exactly one.
  //
  // Aiming the travel along a CSS gradient's axis is the right rule for a
  // STRIPE pattern -- an infinite line translated along itself is invisible,
  // so only the component along the gradient axis has to divide -- but not
  // for a bitmap: a snow layer traveling (66.5, -313) on a 320px tile,
  // neither component dividing, SNAPS sideways by 66px on every loop, about
  // every 4.6 seconds.
  //
  // The lean is the deliberate casualty. Keeping one exactly seamless would
  // mean either rotating the layer -- which needs a far larger composited
  // surface than the "overhang by exactly the travel" rule in the header
  // allows -- or quantising the lean to whole tiles, which at plausible angles
  // snaps to either 0 or an absurd 45 degrees. Wind drives SPEED instead.
  // Rain falls straight too, which is wanted: angled as a full-height
  // gradient it reads as diagonal hatching rather than weather.
  function fallTiled(styleObj, tile, periods, pxPerSec) {
    var dist = tile * periods;
    styleObj.setProperty('--fx', '0px');
    styleObj.setProperty('--fy', dist.toFixed(1) + 'px');
    styleObj.setProperty('--pad', (Math.ceil(dist) + 8) + 'px');
    styleObj.setProperty('--d', (dist / pxPerSec).toFixed(3) + 's');
  }

  // ------------------------------------------------------------------ paint
  function paint(el, s) {
    var st = el.style;
    var sky = ramp(SKY, s.elev);
    for (var i = 0; i < 4; i++) st.setProperty('--sk' + i, sky[i]);
    // Clear the grain. The sky element SURVIVES navigation (see watch()), so a
    // weather page arrived at from a static one inherits whatever the static
    // page set -- the same reason every other layer here is written on every
    // paint rather than only when it changes.
    st.setProperty('--grainO', '0');

    // ---- sun / moon placement
    // Azimuth 90 (due east, sunrise) sits left, 270 (west, sunset) right, so
    // the glow crosses the frame over the day the way the real one does.
    var x = clamp((s.azim - 90) / 180, 0, 1);
    // Elevation 0 lands on the gradient's horizon stop (72%), 90 at the top.
    // Below the horizon it keeps sinking, so the glow slides off-frame instead
    // of sticking to the bottom edge.
    var y = 0.72 - (s.elev / 90) * 0.72;
    var day = clamp((s.elev + 6) / 12, 0, 1);          // 0 night .. 1 day

    st.setProperty('--glowX', (x * 100).toFixed(1) + '%');
    st.setProperty('--glowY', (y * 100).toFixed(1) + '%');
    var glowO;
    if (day > 0.5) {
      st.setProperty('--glowR', '46vmax');
      st.setProperty('--glowC', s.elev < 12 ? 'rgba(255,176,104,.50)'
                                            : 'rgba(255,231,186,.30)');
      glowO = 0.45 + 0.55 * day;
    } else {
      st.setProperty('--glowR', '30vmax');
      st.setProperty('--glowC', 'rgba(150,176,224,.16)');
      glowO = 0.5 * (1 - day);
    }
    st.setProperty('--glowO', glowO.toFixed(2));

    // ---- night sky
    // Stars fade in below civil twilight and are hidden by thick cloud.
    var night = clamp((-4 - s.elev) / 10, 0, 1);
    var clear = 1 - clamp(s.cover, 0, 1);
    st.setProperty('--starO', (night * (0.25 + 0.75 * clear)).toFixed(2));

    st.setProperty('--moonI', 'url("' + moonSvg(s.moon, 26) + '")');
    st.setProperty('--moonS', '58px');

    // ---- seasonal moon
    // A big warm moon on Halloween nights. It lives HERE rather than in
    // paintSeason because the moon is a stock layer that paint() rewrites on
    // every 3s tick -- an override applied once would be erased three seconds
    // later. The witch is sized and flown against this number.
    var moonS = 58;
    // Consult the SAME schedule paintSeason does, or the harvest moon would
    // rise on nights the branches, bats and witch had sat out -- a big warm
    // moon on its own just looks like the sky is broken.
    // schedule() is a pure function of the date, so calling it here and again
    // in paintSeason gives the same answer.
    var plan = plannedFor(s.season || '', new Date());
    var spooky = plan.show && plan.spooky && s.elev < -4;
    var moonEl = el.querySelector('.moon');
    if (moonEl) moonEl.classList.toggle('hallow', spooky);
    // Opposite the sun: roughly true near full, and the only placement that
    // never drops the moon inside the sun's own glow.
    //
    // Inset from the edges, because `x` is a CLAMPED value: every azimuth past
    // due west pins it to 1, which would put the moon at 0% and slice it in
    // half against the frame for the whole back end of the night.
    //
    // The forecast screensaver's own sky keeps it out of the top-left, where
    // its clock and date stand: there it crosses the right 54-90% instead
    // (54%: clear of the clock's AM even beside the calendar pane).
    var moonXp = el.classList.contains('own') ? 54 + (1 - x) * 36 : 12 + (1 - x) * 76;
    st.setProperty('--moonX', moonXp.toFixed(1) + '%');
    st.setProperty('--moonY', (16 + (1 - night) * 10).toFixed(1) + '%');
    var moonXf = moonXp / 100;
    var moonYf = (16 + (1 - night) * 10) / 100;
    // A new moon is not drawn at all. moonSvg would render a zero-width
    // sliver, which reads as a rendering fault rather than as a new moon.
    var lit = (1 - Math.cos(2 * Math.PI * s.moon)) / 2;
    st.setProperty('--moonO',
      (night * clear * clamp((lit - 0.04) / 0.2, 0, 1)).toFixed(2));

    // ---- seasonal moon override, LAST
    // AFTER the two assignments above, or the stock sun-opposite position
    // overwrites --moonX and --moonY and only --moonS survives: a harvest
    // moon wherever the azimuth put it, with the witch flying somewhere else.
    // Order is the whole point: set it after, and feed the SAME resolved
    // center to the witch.
    if (spooky) {
      // The forecast screensaver's own sky has its clock top-left and its
      // status top-right: there the moon is under three-quarters the size, between
      // them and clear of the trees.
      var ownSky = el.classList.contains('own');
      moonS = ownSky ? Math.round(MOON_PX * 0.72) : MOON_PX;
      st.setProperty('--moonS', moonS + 'px');
      // Swap the generated SVG disc for the photograph. One variable: the
      // .moon element, its sizing and its opacity transition are untouched,
      // so there is never a second moon on the page.
      st.setProperty('--moonI', 'url(' + MOON_IMG + ')');
      moonXf = ownSky ? 0.56 : 0.70;
      moonYf = ownSky ? 0.25 : 0.24;
      st.setProperty('--moonX', (moonXf * 100) + '%');
      st.setProperty('--moonY', (moonYf * 100) + '%');
      // Phase is deliberately ignored. This is a seasonal full moon, not a
      // phase texture -- and leaving --moonO on the stock phase ramp would
      // give a new-moon Halloween an invisible moon with a witch crossing
      // nothing. Still fades with cloud cover.
      st.setProperty('--moonO', (0.78 * clear).toFixed(2));
    }
    // ---- the Christmas moon, the forecast screensaver's own sky
    // A small phase moon gives Santa nothing to cross: on a Christmas night
    // the screensaver's sky hangs the photographic full moon, smaller than
    // Halloween's, between the clock and Home Status, and the sleigh flies
    // across its face (cozyWindow, from the same resolved center).
    var xmasMoon = !spooky && el.classList.contains('own') && plan.show &&
                   s.season === 'christmas' && s.elev < -4;
    if (xmasMoon) {
      moonS = Math.round(MOON_PX * XMAS_MOON);
      st.setProperty('--moonS', moonS + 'px');
      st.setProperty('--moonI', 'url(' + MOON_IMG + ')');
      moonXf = 0.64;
      moonYf = 0.25;
      st.setProperty('--moonX', (moonXf * 100) + '%');
      st.setProperty('--moonY', (moonYf * 100) + '%');
      st.setProperty('--moonO', (0.85 * clear).toFixed(2));
    }

    // Look the deck up, mark it idle if it is about to be invisible, and hand
    // back its .style so the callers below are unchanged. Written so that
    // flipping IDLE_INVISIBLE to false CLEARS a stale class on the next paint
    // rather than leaving decks frozen.
    // IDLE BELOW 4%. Idling a deck only at exactly zero is not enough: deck A
    // is `cover x 1.5`, so the `sunny` fallback (4%) or a cloud_coverage of
    // 1% would keep a 1280px will-change layer drifting all day at an opacity
    // nobody can see. Below IDLE_BELOW the
    // deck is idled and its --o written as 0, so the fade-out still runs.
    function deck(sel, o) {
      var n = el.querySelector(sel);
      n.classList.toggle('idle', IDLE_INVISIBLE && !(o >= IDLE_BELOW));
      return n.style;
    }
    // The opacity a deck is written with: 0 below the idle threshold.
    function vis(o) { return (o >= IDLE_BELOW ? o : 0).toFixed(2); }

    // ---- clouds
    var tint = ramp(CLOUD, s.elev);
    st.setProperty('--clTop', tint[0]);
    st.setProperty('--clBot', tint[1]);

    // Cover maps onto the three decks unevenly: the high haze arrives first
    // and the near detail last, so a 20% sky is wisps and a 90% sky is a lid.
    var cov = s.cover;
    var oA = clamp(cov * 1.5, 0, 0.85);
    var oB = clamp((cov - 0.18) * 1.5, 0, 0.92);
    var oC = clamp((cov - 0.42) * 1.7, 0, 0.95);

    // Cloud drift, authored as a SPEED in px/s and converted to a duration,
    // rather than as a duration multiplier.
    //
    // A multiplier gets two things wrong. It is far too slow -- at 2mph the
    // near deck would move 0.19 px/s, 2.8 hours to cross a 1920px tablet, so
    // the clouds never appear to move. And it gives no parallax at all: the
    // three decks tile at 640/440/280px, so multipliers of 2.4/1.5/1.0 work
    // out to 267/293/280 px per unit time -- all three within 10% of each
    // other, which is a flat field, not depth.
    //
    // Speed makes both explicit. `v` is the nearest deck; the far decks are
    // fractions of it, so the parallax is the ratio you can read here.
    // Calm is a lazy ~6 minutes to cross a 1920px screen, a gale under 2.
    var w = clamp(s.wind, 2, 26);
    var v = 4 + w * 0.55;
    // The forecast screensaver's own sky is the whole picture rather than a
    // backdrop to cards, and at the page's pace it reads as a still: its
    // clouds go OWN_DRIFT times as fast (a calm day crosses in ~3 minutes).
    if (el.classList.contains('own')) v *= OWN_DRIFT;
    [['a', oA, 0.34], ['b', oB, 0.62], ['c', oC, 1.0]].forEach(function (p) {
      var d = deck('.cl.' + p[0], p[1]);
      d.setProperty('--o', vis(p[1]));
      // Travel is exactly one tile width (the layer overhangs right by --tw),
      // so duration = tile / speed and the loop stays seamless.
      // MUST match the --tw values in the deck CSS above. Travel is exactly
      // one tile width, so duration = tile / speed keeps the px/s identical
      // whatever the tile is -- which is why a change of tile width does not
      // change how fast the clouds move.
      var tw = { a: 1280, b: 880, c: 560 }[p[0]];
      d.setProperty('--d', Math.round(tw / (v * p[2])) + 's');
    });

    // ---- weather
    st.setProperty('--fogO', s.fog ? '1' : '0');

    var rain = s.wet.kind === 'rain' ? s.wet.rate : 0;
    var snow = s.wet.kind === 'snow' ? s.wet.rate : 0;

    // Wind drives precipitation SPEED, not angle. Both decks are tiled
    // bitmaps, and a tiled bitmap can only fall straight down without
    // seaming -- see fallTiled. Up to +60% in a gale.
    var gust = 1 + clamp(s.wind, 0, 26) / 26 * 0.6;

    // Two decks, near and far. The depth comes from the CONTRAST between them
    // -- long bright streaks over short dim ones -- not from speed; a
    // gradient that leans on speed reads as hatching.
    var r1 = deck('.rain.r1', rain * 0.90);
    var r2 = deck('.rain.r2', rain * 0.55);
    r1.setProperty('--o', vis(rain * 0.90));
    r1.setProperty('--fS', '512px 512px');
    fallTiled(r1, 512, 1, (170 + rain * 130) * gust);
    r2.setProperty('--o', vis(rain * 0.55));
    r2.setProperty('--fS', '384px 384px');
    fallTiled(r2, 384, 1, (100 + rain * 80) * gust);

    var s1 = deck('.snow.s1', snow * 0.85);
    var s2 = deck('.snow.s2', snow * 0.5);
    s1.setProperty('--o', vis(snow * 0.85));
    s1.setProperty('--fS', '320px 320px');
    fallTiled(s1, 320, 1, (46 + snow * 34) * gust);
    s2.setProperty('--o', vis(snow * 0.5));
    s2.setProperty('--fS', '190px 190px');
    fallTiled(s2, 190, 1, (24 + snow * 20) * gust);

    el.querySelector('.bolt').style.display = s.wet.bolt ? '' : 'none';

    // ---- seasons
    // Built here, but only actually rebuilt when the season key changes; see
    // paintSeason. Returns what it composites, for the cap below.
    // laid out in the seasonal layer's own box (beside an open menu, the
    // page's), the moon's centre given in that box's fractions
    var sbox = el.querySelector('.season'), EW = el.clientWidth || 1280;
    var SW = (sbox && sbox.clientWidth) || EW, SL = EW - SW;
    var seasonCover = paintSeason(el, s, SW, el.clientHeight || 800, moonS,
      SW ? (moonXf * EW - SL) / SW : moonXf, moonYf);

    // ---- luminance cap
    // Estimate what all of the above actually composites to, then scrim it
    // down to CAP. Estimated rather than sampled because sampling means a
    // canvas readback on every update on a tablet that cannot spare one --
    // and the inputs (gradient stops, texture mean alpha, layer opacity) are
    // all known exactly, so the estimate is arithmetic, not a guess.
    //
    // Mean of a vertical linear gradient = the sum over segments of each
    // segment's midpoint value weighted by its share of the height.
    var pos = [0, 0.42, 0.72, 1.0];
    var L = 0;
    for (var k = 0; k < 3; k++) {
      L += (luma(sky[k]) + luma(sky[k + 1])) / 2 * (pos[k + 1] - pos[k]);
    }
    // The glow covers roughly a fifth of the frame at its stated alpha.
    L += (day > 0.5 ? 34 : 4) * glowO * 0.2;
    // Each deck is an alpha composite: the texture's mean alpha times the
    // layer opacity is the fraction of the frame it actually covers.
    var ct = (luma(tint[0]) + luma(tint[1])) / 2;
    [[CLOUD_ALPHA.a, oA], [CLOUD_ALPHA.b, oB], [CLOUD_ALPHA.c, oC]]
      .forEach(function (p) {
        var a = p[0] * p[1];
        L = L * (1 - a) + ct * a;
      });
    if (s.fog) L = L * 0.84 + 150 * 0.16;

    // Seasonal layers, same alpha-composite arithmetic as the decks. The
    // branches subtract (they are black), the garland adds.
    seasonCover.forEach(function (c) {
      var a = clamp(c[0], 0, 0.9);
      L = L * (1 - a) + c[1] * a;
    });

    applyScrim(el, L);
  }

  function applyScrim(el, L) {
    var st = el.style;
    var k2 = L > CAP ? clamp(1 - CAP / L, 0, 0.72) : 0;
    // Weight the scrim to the bottom: that is where the pills and the glass
    // plates sit, and it leaves the top of the sky its color.
    st.setProperty('--scT', (k2 * 0.72).toFixed(3));
    st.setProperty('--scB', Math.min(0.86, k2 * 1.28).toFixed(3));

    el._hkRaw = Math.round(L);                       // before scrim
    el._hkL = Math.round(L * (1 - k2 * 0.98));       // after, for verification
  }

  // ---------------------------------------------------------- static skies
  // Energy, EcoFlow and Cameras are not weather pages. Nothing on them is
  // about the sky, so they get a fixed gradient with an identity of their own
  // rather than the live one -- no sun, no moon, no stars, no clouds, no rain.
  //
  // Those layers are faded to zero rather than torn out, because every one of
  // them carries an opacity transition: arriving from the weather page melts
  // them away instead of blinking them off. The `static` class then stops
  // their animations once they are invisible.
  //
  // Stops are zenith / upper / mid / horizon at the same 0-42-72-100 the live
  // gradient uses, and each palette is authored to land UNDER cap so the scrim
  // does nothing to it (energy 81, ecoflow 75, cameras 22 against CAP 86).
  // Cameras is deliberately far darker than the other two -- it sits behind
  // live video and must not compete with it.
  //
  // The HORIZON stop is the one that matters, not the mean. The mean is what
  // CAP scrims, but all three of these land under it, so no scrim runs at all
  // and the bottom of the gradient is whatever it was authored to be -- and
  // the bottom is exactly where the pills and glass plates sit. Both colored
  // palettes are therefore calibrated to the LIVE sky's own horizon stop
  // (rgb(106,154,187), luma 146), which is the ground the glass palette was
  // tuned against: energy 132, ecoflow 148. Horizons at 160 and 181 leave the
  // plates muddy against the bright end.
  // How strong the grain is on a static page. The texture itself is authored
  // faint (gen_sky.py grain(), amplitudes 0.16 coarse / 0.085 fine) and this is
  // the last dial before it ships. The point is that you should not notice it
  // directly, only notice that the page no longer looks like a flat gradient.
  //
  // 0.18, not the ~0.5 a desktop browser suggests. On a desktop the banding
  // it exists to dither is obvious and the grain reads as a faint tooth; on a
  // 1280px wall tablet that much reads as BLOTCH -- a coarse mottle over the
  // whole page, plainly visible as its own thing rather than as a surface,
  // which is exactly the failure mode the paragraph above warns about. The
  // coarse octave is what carries at tablet viewing distance, so the ceiling
  // here is much lower than the ~0.6 a desktop suggests. 0.18 still kills
  // the 8-bit banding (that only needs roughly a half-step of dither, and
  // the coarse amplitude is 0.16 of full range before this multiplier) while
  // dropping the mottle below notice.
  // If it ever needs to go back UP, check it on a tablet, not a monitor.
  var GRAIN = 0.18;

  var STATIC = {
    energy:  ['#171d12', '#3a4020', '#7a5a24', '#b07f38'],   // olive -> amber
    ecoflow: ['#121634', '#183456', '#1e6e7c', '#5aa3ae'],   // indigo -> teal
    cameras: ['#080a0e', '#0f1219', '#171b23', '#222833'],   // near-black
    // The category pages. Each takes the hue its own chip already uses on the
    // dashboard, so arriving on the page is a continuation of the tile you
    // tapped rather than a jump. Every one is checked the same way as the
    // first three: mean under CAP, and the HORIZON stop at or under the live
    // sky's own 146, because the horizon is where the plates sit.
    lights:    ['#1c1608', '#3d3211', '#7e6320', '#bb9440'],  // warm amber
    climate:   ['#0d1a1c', '#173437', '#22646a', '#5aa8a8'],  // cool teal
    water:     ['#0c1526', '#132a4c', '#1c5a86', '#4f9dc4'],  // deep blue
    timers:    ['#1e1408', '#402713', '#864a1e', '#c07f3c'],  // ember orange
    doors:     ['#1c0e10', '#3c1a1e', '#7a2f34', '#b0605f'],  // muted crimson
    vacuums:   ['#170f14', '#341e28', '#6d3a44', '#a86a63'],  // Home app coral
    playmusic: ['#150e1f', '#2e1b42', '#5c2f76', '#9a6bb0']   // music purple
  };

  function paintStatic(el, stops) {
    var st = el.style;
    for (var i = 0; i < 4; i++) st.setProperty('--sk' + i, stops[i]);
    // Grain is a STATIC-PAGE thing. The live sky has clouds and precipitation
    // moving through it and does not need help looking like a surface; adding
    // grain there would only fight them.
    st.setProperty('--grainO', String(GRAIN));
    st.setProperty('--glowO', '0');
    st.setProperty('--starO', '0');
    st.setProperty('--moonO', '0');
    st.setProperty('--fogO', '0');
    ['.cl.a', '.cl.b', '.cl.c', '.rain.r1', '.rain.r2', '.snow.s1', '.snow.s2']
      .forEach(function (sel) {
        var n = el.querySelector(sel);
        if (n) n.style.setProperty('--o', '0');
      });
    var bolt = el.querySelector('.bolt');
    if (bolt) bolt.style.display = 'none';

    // Same gradient-mean arithmetic paint() uses, minus every layer that a
    // static page does not draw.
    var pos = [0, 0.42, 0.72, 1.0], L = 0;
    for (var k = 0; k < 3; k++) {
      L += (luma(stops[k]) + luma(stops[k + 1])) / 2 * (pos[k + 1] - pos[k]);
    }
    applyScrim(el, L);
  }

  // ---------------------------------------------------- the album backdrop
  // Play Music paints the cover of whatever is playing behind the whole page:
  // big, blurred and subdued.
  //
  // WHY IT LIVES HERE rather than in the card. This module already owns a
  // view's background -- the mounting order against hui-view-background, the
  // teardown rules, and above all the luminance CAP that keeps the glass
  // pills readable. A second module painting its own full-bleed layer would
  // have to re-derive all of it, and would sit outside the cap.
  //
  // THE CARD STILL OWNS THE LOOKUP. hk-media.js resolves which speaker is
  // selected and what its artwork is -- it has the generated speaker map --
  // and publishes the URL. Duplicating that map here would let the two drift
  // apart.
  var ART_O = 0.72;              // how much of the composite is cover
  // A FLOOR AS WELL AS A CEILING: the backdrop must not go too dark either --
  // the color is the point.
  //
  // CAP stops a bright cover washing the glass out. The floor stops the
  // opposite: a black sleeve can measure a mean luma of 9, and at a fixed
  // 0.72 it drags the composite to 21 and drowns the purple palette
  // underneath. No scrim fires -- correctly,
  // there is nothing to darken -- and the page just goes black.
  //
  // So the cover's SHARE is what gives, not its brightness. Brightening a
  // near-black sleeve only makes gray: there is no color in it to amplify.
  // Letting the palette carry more of the composite puts the page back in
  // music purple, which is the page's own identity.
  //
  // 40 and not higher because the palette itself is only 51 -- these skies are
  // authored deep (see CAP) -- so a floor near it would leave the cover
  // contributing nothing at all.
  var ART_FLOOR = 40;
  var artUrl = (typeof window !== 'undefined' && window.hkNowArt) || null;
  var artLuma = {};              // url -> mean luma 0-255, measured once

  // The card publishes; this listens. Reading window.hkNowArt above covers
  // the other order -- a sky that mounts after the card has already drawn.
  if (typeof window !== 'undefined') {
    window.addEventListener('hk-now-art', function (ev) {
      var url = (ev && ev.detail && ev.detail.url) || null;
      if (url === artUrl) return;
      artUrl = url;
      // Only the page that asked for it, and only while it is up.
      if (mounted && mounted.classList.contains('static') &&
          mountedVariant === 'playmusic') {
        paintAlbum(mounted, artUrl, mounted._hkGradL || mounted._hkRaw);
      }
    });
  }

  // MEASURED, NOT ASSUMED, and this is what keeps it from going muddy.
  //
  // The cap arithmetic needs the mean luminance of what is actually painted.
  // For a gradient that is four stops and some algebra; for a cover it is the
  // pixels. So the image is drawn to a tiny canvas and averaged.
  //
  // Keeping the color is the reason this is worth the trouble. A fixed scrim
  // would have to assume the brightest plausible cover and would then crush
  // every dark one. Measuring means a dark cover gets NO scrim at all and
  // keeps its color, and only a genuinely bright one is brought down.
  //
  // Same-origin (/api/media_player_proxy/...), so the canvas is not tainted.
  function measureArt(url, done) {
    if (artLuma[url] !== undefined) { done(artLuma[url]); return; }
    var img = new Image();
    img.onload = function () {
      var L = null;
      try {
        var N = 16, c = document.createElement('canvas');
        c.width = N; c.height = N;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, N, N);
        var d = x.getImageData(0, 0, N, N).data, sum = 0;
        for (var i = 0; i < d.length; i += 4) {
          // Rec. 709, the same weights luma() uses for the palette stops, so
          // a cover and a gradient are measured on one scale.
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        }
        L = sum / (d.length / 4);
      } catch (e) { L = null; }   // tainted or blocked: fall back below
      artLuma[url] = L;
      done(L);
    };
    img.onerror = function () { artLuma[url] = null; done(null); };
    img.src = url;
  }

  function paintAlbum(el, url, gradL) {
    if (!url) {
      el.style.setProperty('--artO', '0');
      applyScrim(el, gradL);
      return;
    }
    measureArt(url, function (L) {
      if (!el.isConnected) return;
      el.style.setProperty('--art', 'url("' + url + '")');
      el.querySelector('.art').style.backgroundImage = 'url("' + url + '")';
      // The composite the cap has to judge: the cover over the palette at
      // ART_O. A cover we could not measure is assumed BRIGHT, because the
      // failure that matters is unreadable pills, not a dull background.
      var lum = (L === null ? 200 : L);
      // Solve the composite for the cover's share:
      //     C = o*lum + (1-o)*gradL      ->      o = (gradL - C) / (gradL - lum)
      // Only meaningful when the cover is darker than the palette AND the
      // palette can actually reach the floor; otherwise keep the full share.
      var o = ART_O;
      if (lum < ART_FLOOR && gradL > lum) {
        o = Math.min(ART_O, Math.max(0.18,
              (gradL - Math.min(ART_FLOOR, gradL)) / (gradL - lum)));
      }
      el.style.setProperty('--artO', String(o));
      applyScrim(el, o * lum + (1 - o) * gradL);
      el._hkArtL = L === null ? null : Math.round(L);
      el._hkArtO = o;
    });
  }

  // ------------------------------------------------------------------- API
  var mounted = null;
  var mountedPath = null;
  // Which palette is on the mounted element. The album repaint needs it, and
  // it must not be re-derived from the URL -- a track change arrives with no
  // navigation, so there is nothing to re-resolve from.
  var mountedVariant = null;
  // Set when the next paint must be instant rather than eased -- see the
  // .hk-snap rule in SHEET.
  var snapNext = false;

  function teardown() {
    if (!mounted) return;
    detachStyles(mounted);
    mounted.remove();
    mounted = null;
    mountedPath = null;
    mountedVariant = null;
  }

  // THE SKY OUTLIVES A VIEW CHANGE, AND NOTHING HERE DECIDES WHEN IT ENDS.
  //
  // hui-root swaps views WITHOUT unmounting hui-view-container, so the sky
  // element survives a navigation untouched and the next view simply repaints
  // it -- a palette change, never an unmount. Tearing it down on every path
  // change would let the wallpaper flash through between two views.
  //
  // The only teardowns are selfRender()'s: a view whose config wants no sky,
  // and the kill switch. Both read the Lovelace config, so neither guesses.
  //
  // NO GRACE TIMER. Waiting a fixed time after a path change to see whether
  // the new view claims the sky races the view build: a tablet's first visit
  // to a page can block the main thread past 1500ms, so such a timer fires
  // before the new view is seen and the sky is torn down and rebuilt from
  // nothing -- the background loading late on page changes (reproduced with
  // a synthetic 1.7s stall: element replaced at ~2000ms). The config is the
  // authority, so nothing here has to wait.
  var watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    document.addEventListener('visibilitychange', applyHidden);
  }

  // Pausing is driven by TWO things, and the second one is what makes the
  // sky safe to leave on a room dashboard.
  //
  // document.hidden alone is not enough. On the room view -- the page a wall
  // tablet shows for its entire life -- the WallPanel screensaver is a DOM
  // overlay in the SAME document, so document.hidden stays false and the
  // compositor would keep running rain and cloud decks all night behind a
  // photo slideshow: precisely the "warm to the touch all night" failure the
  // performance notes at the top of this file warn about.
  //
  // So each dashboard can name its tablet's screensaver boolean (`sleep:` in
  // its `sky:` block -- the one the wake and sleep automations drive) and the
  // sky pauses with the screen.
  //
  // The entity is REMEMBERED rather than read from opts each time: the sky
  // survives navigation, so a plain `opts.sleep || false` would reset asleep
  // to false the moment you opened a page that does not name it.
  var asleep = false;
  var sleepEntity = null;
  // ASLEEP = the tablet's screensaver switch is on, OR HK Frontend's own
  // screensaver is showing (hk-saver.js) -- a screen with no switch (no
  // Tablet Room) still pauses behind its photos.
  function sleeping() {
    return asleep || !!(window.hkSaver && window.hkSaver.running && window.hkSaver.running());
  }
  function applyHidden() {
    var z = sleeping();
    if (mounted) mounted.classList.toggle('hidden', document.hidden || z);
    // ...and tell the cards, which pause their own animations behind the
    // screensaver too (hk-base.js, hk-asleep). Only on a change.
    if (!!window.__hkAsleep !== z) {
      window.__hkAsleep = z;
      try { window.dispatchEvent(new Event('hk-asleep')); } catch (e) { /* no window events: nothing to tell */ }
    }
  }

  window.hkSky = {
    // THE SCREEN IS ASLEEP: this tablet's screensaver boolean is on (the
    // photos are up). WallPanel is an overlay in this same document, so
    // document.hidden stays false behind it; a module with idle work of its
    // own (hk-glass's backstop) asks this too.
    asleep: function () { return sleeping(); },
    // hk-saver.js calls this when its screensaver starts or stops
    saverChanged: function () { applyHidden(); },
    // the forecast screensaver's own sky + landscape (scene() above)
    scene: scene,
    // which land and lights a holiday dresses the screensaver in (tests)
    _holidayLand: holidayLand,
    _holidayLights: holidayLights,
    _land: { season: landSeason, light: landLight, file: landFile },
    // Called by selfRender() below. Returns '' so it renders nothing of its
    // own.
    //
    // `opts` is optional and carries entity ids from the dashboard's `sky:`
    // block:
    //   enable -- an input_boolean kill switch. Off tears the sky down and
    //             restores whatever `background:` the view declares, with no
    //             config reload. Absent means always on.
    //   sleep  -- the tablet's screensaver boolean; see applyHidden.
    //   variant-- a key into STATIC. Paints that fixed gradient and no
    //             weather at all. Absent means the live sky.
    render: function (hass, card, opts) {
      try {
        if (!hass || !card) return '';
        opts = opts || {};

        // Kill switch first: an explicit `off` tears down a mounted sky rather
        // than just declining to mount one, so flipping it is immediate.
        var en = opts.enable && hass.states[opts.enable];
        if (en && en.state === 'off') { teardown(); return ''; }

        if (opts.sleep) sleepEntity = opts.sleep;
        var sl = sleepEntity && hass.states[sleepEntity];
        if (sl) asleep = sl.state === 'on';

        // Adopt a sky mounted by the PREVIOUS view rather than rebuilding.
        // hui-view-container survives the swap, so the element is still there
        // and still correct; only the path label and the palette change. This
        // is the other half of the note above watch().
        if (mounted && mounted.isConnected && location.pathname !== mountedPath) {
          mountedPath = location.pathname;
          // A different page: cut to the new palette instead of melting into
          // it over four seconds.
          snapNext = true;
        }

        if (!mounted || !mounted.isConnected) {
          var host = container(card);
          if (!host) return '';
          register();
          mounted = build(host);
          mountedPath = location.pathname;
          watch();
          // A brand new element has no previous state worth easing from
          // either, so the first paint is a cut as well.
          snapNext = true;
        }
        // A static page paints a fixed palette and draws no weather at all.
        var snapping = snapNext;
        snapNext = false;
        if (snapping) mounted.classList.add('hk-snap');

        var stops = opts.variant && STATIC[opts.variant];
        if (stops) {
          mounted.classList.add('static');
          paintStatic(mounted, stops);
          mountedVariant = opts.variant;
          // _hkRaw is the PALETTE's own luma, before any scrim. Keep it: the
          // album composite is measured against the gradient underneath it,
          // and paintStatic will not run again on a track change.
          mounted._hkGradL = mounted._hkRaw;
          // playmusic is the one static page whose backdrop is not fixed.
          if (opts.variant === 'playmusic') {
            paintAlbum(mounted, artUrl, mounted._hkGradL);
          } else {
            mounted.style.setProperty('--artO', '0');
          }
        } else {
          mounted.classList.remove('static');
          mountedVariant = null;
          mounted.style.setProperty('--artO', '0');
          paint(mounted, read(hass));
        }
        applyHidden();

        if (snapping) {
          // Force a style flush WHILE transitions are still off, so the new
          // values become the computed style rather than the start of an
          // animation. Reading offsetWidth is the standard way to do that.
          // Without it, removing the class in the same task would leave the
          // browser free to transition from the old values after all.
          var el = mounted;
          void el.offsetWidth;
          requestAnimationFrame(function () {
            if (el && el.isConnected) el.classList.remove('hk-snap');
          });
        }
      } catch (e) {
        console.error('[hk-sky]', e);
      }
      return '';
    },

    _paint: paint,
    _schedule: schedule,
    _witchPath: witchPath,
    _daysUntil: daysUntil,
    _surprise: surpriseFor,
    get _birthdays() { return birthdays(); },
    // hkSky._force({show:true, spooky:true}) then hkSkyAt(-20,{season:'halloween'})
    // previews a spooky night on any date. hkSky._force(null) restores.
    _force: function (v) { FORCE = v || null; return FORCE; },
    // hkSky._pin({season:'halloween', elev:-20, cond:'clear'}) holds a scene
    // across the 3s tick without a competing timer. _pin(null) restores.
    _pin: function (v) { PIN = v || null; return PIN; },
    // HK Settings' preview of a theme (see PREVIEW above)
    preview: preview,
    get previewing() { return PREVIEW; },
    _read: read,                // tests: what the sky reads, pins included
    _planned: function (n, d) { return plannedFor(n, d); },
    // hkSky._surpriseForce('birthday') then hkSkyAt(14) shows a theme on any
    // date. _surpriseForce(null) restores.
    _surpriseForce: function (v) { SURPRISE_FORCE = v || null; return SURPRISE_FORCE; },
    _surprises: SURPRISE,
    _paintStatic: paintStatic,
    _static: STATIC,
    _build: build,
    _mounted: function () { return mounted; },
    // For pages/dev/nav-probe.js: which page the sky is currently painted for.
    _mountedPath: function () { return mountedPath; }
  };

  // ======================================================== SELF-MOUNT
  // The sky reads its own configuration out of Lovelace instead of waiting to
  // be called by an invisible card on every view.
  //
  // WHY NO MOUNT CARD. A zero-height card whose only jobs are to hand `hass`
  // in and to exist on the right page costs a call site on every view -- and
  // with no way to see the new view's config, a path change could only be
  // answered by waiting to find out whether a card on the new view would
  // claim the sky (see watch()). Reading the config answers that
  // immediately.
  //
  // CONFIG SHAPE. A view opts in for itself; the dashboard supplies the
  // entities, beside its existing `wallpanel:` block:
  //
  //     sky:                                     # dashboard level
  //       enable: input_boolean.sky_background
  //       sleep:  input_boolean.wallpanel_screensaver_living_room
  //
  //     sky: true                                # a view: the live sky
  //     sky_variant: energy                      # a view: a fixed palette
  //
  // OPT-IN IS PER DASHBOARD. With no `sky:` block in the dashboard config this
  // driver does nothing at all -- it never mounts and, crucially, never TEARS
  // DOWN -- so a dashboard without a sky is left exactly as it is.
  function deepFind(tag) {
    var seen = new Set(), out = null;
    (function walk(root, d) {
      if (!root || d > 40 || out) return;
      var kids = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (var i = 0; i < kids.length; i++) {
        var e = kids[i];
        if (e.tagName === tag) { out = e; return; }
        if (e.shadowRoot && !seen.has(e.shadowRoot)) {
          seen.add(e.shadowRoot); walk(e.shadowRoot, d + 1);
        }
      }
    })(document, 0);
    return out;
  }

  function hassNow() {
    var ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  }

  // READ THE CONFIG, NEVER SNIFF THE DOM. A probe that looks for a marker
  // element and assumes its absence means something goes wrong.
  // lovelace.config is the authority.
  function lovelaceCfg() {
    var p = deepFind('HA-PANEL-LOVELACE');
    return (p && p.lovelace && p.lovelace.config) || null;
  }

  function currentView(cfg) {
    if (!cfg || !cfg.views) return null;
    // /<dashboard>/<view>  -- the view segment is either a path or an index
    var seg = decodeURIComponent((location.pathname.split('/')[2] || '').split('?')[0]);
    // NO SEGMENT MEANS VIEW 0, which is what Home Assistant itself does with a
    // bare dashboard URL. Without it a dashboard whose first view has
    // `path: null`, opened at /<dashboard> with no view segment, matches
    // nothing and resolve() says FALSE -- a deliberate teardown. A test that
    // always navigates to an explicit /<view> never sees it.
    if (seg === '') return cfg.views[0] || null;
    for (var i = 0; i < cfg.views.length; i++) {
      var v = cfg.views[i];
      if ((v.path != null && String(v.path) === seg) || String(i) === seg) return v;
    }
    // An unknown segment is not "no sky" -- it is a URL this code does not
    // understand, and tearing the sky down on a guess is the worse failure.
    return cfg.views[0] || null;
  }

  // null  -> this dashboard has not opted in; do nothing whatsoever
  // false -> opted in, but THIS view wants no sky; tear down
  // object-> mount with these options
  function resolve() {
    var cfg = lovelaceCfg();
    if (!cfg || !cfg.sky) return null;
    // A dashboard whose item turns its Live sky off: opted in by its
    // YAML, but no sky on any of its views.
    var M = window.hkCards && window.hkCards.menu;
    if (M && typeof M.board === 'function' && M.board().sky === false) return false;
    var v = currentView(cfg);
    if (!v) return false;
    var wants = v.sky === true || typeof v.sky_variant === 'string';
    if (!wants) return false;
    return { variant: (typeof v.sky_variant === 'string') ? v.sky_variant : null,
             enable: cfg.sky.enable || null,
             sleep: cfg.sky.sleep || null };
  }

  // Not a dashboard at all (Settings, Logs, the Map): nothing to resolve, so
  // no walk -- and no sky left behind from the dashboard before.
  function offPanel() {
    var HS = window.hkSettings;
    return !!(HS && HS.lovelacePanel && HS.lovelacePanel() === false);
  }

  function selfRender() {
    if (offPanel()) {
      if (mounted && !mounted.isConnected) teardown();
      return;
    }
    var want = resolve();
    if (want === null) {                          // not opted in: stay out --
      // -- but a sky left behind by a page that HAD one (Settings after a
      // dashboard) is torn down, not kept alive detached.
      if (mounted && !mounted.isConnected) teardown();
      return;
    }
    if (want === false) { if (mounted) teardown(); return; }
    var hass = hassNow();
    if (!hass) return;
    // hui-view-container satisfies container()'s very first test, so it is its
    // own anchor and no card is needed.
    var host = deepFind('HUI-VIEW-CONTAINER');
    if (!host) return;
    window.hkSky.render(hass, host, want);
  }

  // Three navigation signals, all proven on wall tablets: location-changed
  // is what HA's own navigate()
  // fires, popstate catches the hardware back button and Fully's navigation,
  // and the poll catches anything that changes the URL without either.
  //
  // The poll doubles as the state tick. It is deliberately NOT a websocket
  // subscription: the sky's inputs are sun, weather, moon and two booleans,
  // and re-reading five states every few seconds is cheaper than managing a
  // subscription's lifecycle across view changes. It also catches a
  // screensaver flip within a tick, where watching sun.sun alone would leave
  // the sky running until the next elevation change.
  // REPAINT WHEN THE NEW VIEW IS ON SCREEN, NOT WHEN THE URL CHANGES.
  //
  // location-changed fires the instant a navigation starts, well before HA has
  // built the incoming view. Repainting there puts the NEW page's background
  // behind the OLD page's content for a beat -- tap Climate and its palette
  // arrives while the previous page is still up. Reading the config is faster
  // than building the view, so the module has to wait for the view on
  // purpose.
  //
  // SO THE VIEW TELLS US. A generated screen's view is `custom:hk-grid-view`, which is
  // our own element, and it announces `hk-view-ready` on window the moment it
  // is attached with its cards in it -- a first build and a return to a cached
  // view alike (cards/hk-layout.js). That is exactly "the new page is up", so
  // the repaint lands in the same frame as the view, however long the build
  // took. No polling, no ceiling, nothing to race.
  //
  // POLLING every 60ms for hui-view to be replaced, with a ~2s ceiling after
  // which it repaints anyway, is wrong at both ends on a slow tablet: a first
  // build past the ceiling gets its palette early, behind the previous page,
  // and every probe walks the whole shadow DOM.
  //
  // The poll is KEPT for a view of any other type, which cannot announce
  // itself, so a stock masonry view added to a sky dashboard degrades to
  // polling rather than never repainting.
  function viewEl() { return deepFind('HUI-VIEW'); }

  var ANNOUNCING = 'custom:hk-grid-view';
  var navWait = null;
  function onNav() {
    if (navWait) { clearInterval(navWait); navWait = null; }
    if (offPanel()) { selfRender(); return; }      // tears a stale sky down; no poll
    var v = currentView(lovelaceCfg());
    if (v && v.type === ANNOUNCING) {           // hk-view-ready will come
      // A hash change (a pop-up) is not a page change and announces nothing.
      if (location.pathname !== mountedPath) navPending = Date.now();
      return;
    }
    var before = viewEl();
    var tries = 0;
    navWait = setInterval(function () {
      var now = viewEl();
      // a different element, with content in it, is the new page being up
      var swapped = now && now !== before && now.children.length > 0;
      if (swapped || ++tries > 33) {           // ~2s ceiling, then repaint anyway
        clearInterval(navWait); navWait = null;
        selfRender();
      }
    }, 60);
  }

  function onViewReady() {
    if (navWait) { clearInterval(navWait); navWait = null; }
    navPending = 0;
    selfRender();
  }

  // THE 3s STATE TICK MUST NOT JUMP A NAVIGATION. Between location-changed and
  // hk-view-ready the URL already names the new page while the old one is
  // still on screen; a tick landing there would paint the new palette behind
  // the old content -- the very artifact the event exists to prevent. So the
  // tick stands aside while a page change is pending. The 10s cap only matters
  // if an announcement is ever lost, and then it recovers instead of freezing.
  var navPending = 0;
  function stateTick() {
    if (navPending && Date.now() - navPending < 10000) return;
    navPending = 0;
    selfRender();
  }

  // THE FIRST MOUNT NEEDS ITS OWN RAMP, or a cold load shows THREE SECONDS of
  // bare background. MEASURED on a wall tablet's dashboard: the module is
  // live at 5ms, hui-root at 162ms and the view has its cards at 180ms -- but
  // without a ramp the sky appears at 3012ms.
  //
  // The reason is that selfDrive()'s single immediate selfRender() runs at
  // ~5ms, when there is no hass and no HUI-VIEW-CONTAINER yet, so it bails --
  // and the next attempt would be the 3000ms backstop tick. Nothing is slow;
  // the retry is just too far away.
  //
  // `location-changed` does not cover this: no navigation has happened on a
  // cold load, so onNav never fires.
  //
  // So: poll every 60ms until the sky actually mounts, with a ceiling. The
  // 3000ms interval stays -- it is the backstop for a URL
  // that changes with no event, and for the state tick.
  var firstWait = null;
  function firstMount() {
    if (firstWait) return;
    var tries = 0;
    firstWait = setInterval(function () {
      selfRender();
      // `mounted` is the honest test. A view that does not want a sky never
      // sets it, so the ceiling is what stops the ramp there -- 60ms x 100 is
      // 6s of two cheap DOM lookups, against a cold start that reaches the
      // view in under 200ms.
      if (mounted || ++tries > 100) {
        clearInterval(firstWait);
        firstWait = null;
      }
    }, 60);
  }

  var selfPoll = null;
  function selfDrive() {
    if (selfPoll) return;
    selfPoll = setInterval(stateTick, 3000);
    window.addEventListener('location-changed', onNav);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hk-view-ready', onViewReady);
    // A settings change: a dashboard's Live sky may have been switched.
    if (window.hkSettings && window.hkSettings.onChange) {
      window.hkSettings.onChange(function () { selfRender(); });
    }
    selfRender();
    if (!mounted) firstMount();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', selfDrive);
  } else {
    selfDrive();
  }

  // Console helper: hkSkyAt(-3) previews dusk without waiting for it, and
  // returns the composited luminance so CAP can be checked at any hour.
  window.hkSkyAt = function (elev, opts) {
    if (!mounted) return 'not mounted';
    var s = Object.assign({ elev: elev, azim: 250, cover: 0.3, wind: 6,
                            cond: 'partlycloudy', fog: false,
                            wet: { kind: 'none', rate: 0 }, moon: 0.5 },
                          opts || {});
    paint(mounted, s);
    return 'raw ' + mounted._hkRaw + ' -> capped ' + mounted._hkL;
  };
})();
