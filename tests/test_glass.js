// The glass look (look.glass): hk-settings.js switches the
// material variables every glass surface reads, and HkBase keeps the shared
// blur's member set (modules/hk-glass.js) -- a card joins while on the page,
// unless its config says `glass: false`.
load(HK_ROOT + '/tests/dom.js');
// A root element to receive the look's variables (the shim has none).
var rootAttrs = {};
document.documentElement = { style: new Style(), setAttribute: function (k, v) { rootAttrs[k] = v; } };
load(HK_ROOT + '/frontend/modules/hk-settings.js');
var HS = window.hkSettings;
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
var st = document.documentElement.style;
function vars() { return { plate: st.getPropertyValue('--hk-glass-plate'), chip: st.getPropertyValue('--hk-chip-plate'),
                           back: st.getPropertyValue('--hk-chip-backdrop') }; }

print('=== the look sets the material ===');
ok('by default: clear, nothing overridden', HS.glass() === 'clear' && !vars().plate && !vars().chip && !vars().back, vars());
HS._apply({ configured: true, look: { glass: 'frosted' } });
var v = vars();
ok('frosted: every plate and the chips get the frost', v.plate && v.plate === v.chip && /feTurbulence/.test(v.plate), v);
ok('frosted: the chips stop blurring themselves', v.back === 'none', v.back);
ok('the page is told which look it wears', rootAttrs['data-hk-glass'] === 'frosted');
HS._apply({ configured: true, look: { glass: 'blur' } });
v = vars();
ok('blur: the plate over the shared layer is the chips\' own gradient', /0\.16\).*0\.07\)/.test(v.plate) && !/feTurbulence/.test(v.plate), v.plate);
ok('blur: the chips keep their plate and join the shared layer (no blur of their own)', !v.chip && v.back === 'none', v);
ok('blur: the shared layer is told the strength -- 20 px at the default (the middle, 50 %)',
   st.getPropertyValue('--hk-blur-filter') === 'blur(20px) saturate(1.4) brightness(0.82)', st.getPropertyValue('--hk-blur-filter'));
HS._apply({ configured: true, look: { glass: 'blur', blur: 100 } });
ok('...40 px at 100 %', /^blur\(40px\)/.test(st.getPropertyValue('--hk-blur-filter')));
HS._apply({ configured: true, look: { glass: 'blur', blur: 0 } });
ok('...and 0 % leaves only the darkening', /^blur\(0px\) saturate\(1\.4\) brightness\(0\.82\)$/.test(st.getPropertyValue('--hk-blur-filter')));

print('\n=== blur each card ===');
HS._apply({ configured: true, look: { glass: 'blur_each', blur: 75 } });
v = vars();
ok('every plate blurs itself at the chosen strength, the chips the same',
   st.getPropertyValue('--hk-glass-backdrop') === 'blur(30px) saturate(1.4) brightness(0.82)' &&
   v.back === st.getPropertyValue('--hk-glass-backdrop'), [st.getPropertyValue('--hk-glass-backdrop'), v.back]);
ok('the plate over it is the chips\' own gradient, as with the shared layer', /0\.16\).*0\.07\)/.test(v.plate), v.plate);
ok('the view fade gives way to a hard cut', st.getPropertyValue('--hk-view-anim') === 'none');
ok('the page is told (hk-glass.js stays off: it runs for blur only)', rootAttrs['data-hk-glass'] === 'blur_each');
HS._apply({ configured: true, look: { glass: 'blur' } });
ok('leaving it takes every plate\'s blur and the hard cut back',
   !st.getPropertyValue('--hk-glass-backdrop') && !st.getPropertyValue('--hk-view-anim'));

print('\n=== the amount of frost ===');
HS._apply({ configured: true, look: { glass: 'frosted' } });
var f50 = vars().plate;
ok('50 % (the default, the middle) is the material as designed',
   /rgba\(255,255,255,0\.18\), rgba\(255,255,255,0\.09\)\), linear-gradient\(rgba\(58,60,68,0\.34\)/.test(f50), f50);
HS._apply({ configured: true, look: { glass: 'frosted', frost: 100 } });
ok('100 %: twice the sheen and tint', /rgba\(255,255,255,0\.36\), rgba\(255,255,255,0\.18\)\), linear-gradient\(rgba\(58,60,68,0\.68\)/.test(vars().plate), vars().plate);
HS._apply({ configured: true, look: { glass: 'frosted', frost: 0 } });
ok('0 %: the grain alone', /feTurbulence/.test(vars().plate) && /rgba\(255,255,255,0\), rgba\(255,255,255,0\)\)/.test(vars().plate), vars().plate);
HS._apply({ configured: true, look: { glass: 'frosted', frost: 'lots' } });
ok('a value that is not a number is the default', vars().plate === f50);

HS._apply({ configured: true, look: { glass: 'sparkly' } });
ok('an unknown look is clear', HS.glass() === 'clear' && !vars().plate && !vars().back, vars());
HS._apply({ configured: true, look: { glass: 'clear' } });
ok('back to clear removes every override', !vars().plate && !vars().chip && !vars().back, vars());
var heard = 0, off = HS.onChange(function () { heard++; });
HS.previewGlass('blur');
ok('a preview wears the look on this page only', HS.glass() === 'blur' && vars().back === 'none' && heard === 1);
ok('...without touching the setting', HS.get('look.glass') === 'clear');
HS.previewGlass(null);
ok('ending the preview returns to the setting', HS.glass() === 'clear' && !vars().back && heard === 2);
off();

print('\n=== every glass surface carries the material AND the marker ===');
load(HK_ROOT + '/frontend/cards/hk-base.js');
var M = window.hkCards.M;
ok('M.glass is a whole declaration: material + marker + its own blur, off unless a look sets it',
   M.glass === 'background:' + M.bg + ';--hk-glass-surface:1;' +
     'backdrop-filter:var(--hk-glass-backdrop,none);-webkit-backdrop-filter:var(--hk-glass-backdrop,none)', M.glass);
var gsrc0 = readFile(HK_ROOT + '/frontend/modules/hk-glass.js');
ok('the shared layer blurs at the chosen strength, 20 px without one',
   /var f = 'var\(--hk-blur-filter,' \+ MAT \+ '\)';/.test(gsrc0) && /backdrop-filter:' \+ f/.test(gsrc0) &&
   /var MAT = 'blur\(20px\) saturate\(1\.4\) brightness\(0\.82\)'/.test(gsrc0));
var tsrc = readFile(HK_ROOT + '/frontend/cards/hk-tile.js'), bsrc = readFile(HK_ROOT + '/frontend/cards/hk-base.js');
ok('a lit (opaque white) pill never blurs behind itself', /\[data-on="1"\]\{background:white;--hk-glass-backdrop:none\}/.test(tsrc));
ok('a card set glass: false is out of "Blur each card" too, with everything inside it',
   /if \(off\) card\.style\.setProperty\('--hk-glass-backdrop', 'none'\)/.test(bsrc));
ok('the material reads the look first, then the theme', /^var\(--hk-glass-plate, var\(--hk-glass-bg,/.test(M.bg), M.bg);
var bare = [];
['hk-base', 'hk-chip', 'hk-energy', 'hk-home', 'hk-layout', 'hk-library', 'hk-media', 'hk-security',
 'hk-stat', 'hk-tile', 'hk-weather'].forEach(function (f) {
  var src = readFile(HK_ROOT + '/frontend/cards/' + f + '.js');
  // A glass background written without M.glass has no marker, so the shared
  // blur would never cut to it: the surface would look clear in Blur mode.
  if (/background:' \+ (window\.hkCards\.)?M\.bg \+ '/.test(src.replace("M.glass = 'background:' + M.bg", ''))) bare.push(f);
});
ok('no card writes the glass background without the marker', bare.length === 0, bare);
var chip = readFile(HK_ROOT + '/frontend/cards/hk-chip.js');
ok('the status chip blurs through --hk-chip-backdrop and is marked', /backdrop-filter:var\(--hk-chip-backdrop,/.test(chip) && /--hk-glass-surface:1/.test(chip));

print('\n=== cards join and leave the shared blur ===');
load(HK_ROOT + '/frontend/cards/hk-tile.js');
var changed = 0;
window.hkGlass = { changed: function () { changed++; } };
var set = window.__hkGlassCards;
var Tile = customElements.get('hk-tile-card');
// The shim cannot run a full render (see test_tile.js); membership needs none.
var a = new Tile(); a._render = function () {}; a.setConfig({ entity: 'light.a' });
ok('not on the page: not a member', !set.has(a));
a.isConnected = true; a.connectedCallback();
ok('on the page: a member, and the layer is told', set.has(a) && changed === 1, { has: set.has(a), changed: changed });
a.setConfig({ entity: 'light.a', glass: false });
ok('glass: false leaves', !set.has(a) && changed === 2);
a.setConfig({ entity: 'light.a' });
ok('...and dropping it joins again', set.has(a) && changed === 3);
a.isConnected = false; a.disconnectedCallback();
ok('off the page: gone', !set.has(a) && changed === 4);
a.disconnectedCallback();
ok('leaving twice tells nobody twice', changed === 4);

print('\n=== the shared layer\'s shapes ===');
delete window.hkGlass;
load(HK_ROOT + '/frontend/modules/hk-glass.js');
var r = window.hkGlass._rrect(92, 328.3, 192, 70, 23.5);
ok('a pill is its own rounded rectangle', r.indexOf('M115.5,328.3H260.5A23.5,23.5 0 0 1 284,351.8') === 0, r);
ok('a radius larger than the shape is capped at half its height', window.hkGlass._rrect(0, 0, 100, 20, 50).indexOf('M10,0') === 0);

print('\n=== big layers are cut into bands (GPU max texture) ===');
var B = window.hkGlass._bands;
// A tall room view: 1280 x 5904 CSS px at dpr 1.5 = 1920 x 8856 device px,
// over a tablet's 8192 max texture -- a layer that size is not drawn at all.
var view = [];
for (var row = 0; row < 70; row++) for (var col = 0; col < 6; col++)
  view.push({ x: 20 + col * 204, y: 40 + row * 82, w: 192, h: 70, r: 23.5 });
var bs = B(view, 1280, 5904, 1.5);
var tooBig = bs.filter(function (b) { return Math.max(b.len, b.cross) * 1.5 > 4096; });
ok('the view is cut into several horizontal bands', bs.length > 2 && bs.every(function (b) { return b.axis === 'y'; }), bs.length);
ok('no band is over 4096 device px on either side', tooBig.length === 0, tooBig.map(function (b) { return [b.len, b.cross]; }));
var split = view.filter(function (sh) {
  return !bs.some(function (b) { return sh.y >= b.start && sh.y + sh.h <= b.start + b.len; });
});
ok('every pill lies wholly inside one band (cuts only in gaps)', split.length === 0, split.length);
var n = bs.reduce(function (t, b) { return t + b.shapes.length; }, 0);
ok('every pill is in exactly one band', n === view.length, [n, view.length]);
// From the first pill to the last, not from 0 to the extent: glass-free
// space above or below the pills is never in a band.
var lastBottom = 40 + 69 * 82 + 70;
ok('the bands tile the pills, first to last, with no gap or overlap',
   bs[0].start === 40 && bs.every(function (b, i) { return i === 0 || Math.abs(bs[i - 1].start + bs[i - 1].len - b.start) < 0.01; }) &&
   Math.abs(bs[bs.length - 1].start + bs[bs.length - 1].len - lastBottom) < 0.01,
   [bs[0].start, bs[bs.length - 1].start + bs[bs.length - 1].len]);
var rowOnly = B([{ x: 0, y: 7, w: 192, h: 70, r: 23.5 }, { x: 204, y: 7, w: 192, h: 70, r: 23.5 }], 1265, 104, 1.5);
ok('a normal row stays one layer', rowOnly.length === 1, rowOnly.length);
var longRow = [];
for (var k = 0; k < 20; k++) longRow.push({ x: k * 204, y: 7, w: 192, h: 70, r: 23.5 });
var lr = B(longRow, 20 * 204, 104, 1.5);
ok('a row wider than 4096 device px is cut into vertical bands', lr.length > 1 && lr.every(function (b) { return b.axis === 'x' && b.len * 1.5 <= 4096; }), lr.map(function (b) { return [b.axis, b.len]; }));

print('\n=== a layer is drawn at full strength from its first frame (no fade) ===');
var gsrc = readFile(HK_ROOT + '/frontend/modules/hk-glass.js');
// A bloom (opacity 0 -> 1) would run on every return to a page HA has kept,
// so the frost would visibly fade in going back to Home.
ok('a layer is never created transparent or with a transition',
   !/opacity:0/.test(gsrc) && !/transition:opacity/.test(gsrc) && !/BLOOM_MS/.test(gsrc));
ok('nothing sets a layer\'s opacity later either', !/layer\.style\.opacity/.test(gsrc) && !/function reveal/.test(gsrc));
ok('no bloom length is exported', window.hkGlass._bloomMs === undefined);

print('\n=== a pop-up opening from scale(.98) is measured in its own layout ===');
var TS = window.hkGlass._transformScale;
ok('no transform is scale 1', TS('none').x === 1 && TS('').y === 1 && TS(undefined).x === 1);
var s98 = TS('matrix(0.98, 0, 0, 0.98, 0, 24)');
ok('the sheet\'s closed state reads .98 (the translate is ignored)', Math.abs(s98.x - 0.98) < 1e-9 && Math.abs(s98.y - 0.98) < 1e-9, s98);
var s3 = TS('matrix3d(0.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)');
ok('matrix3d reads x and y from its own columns', s3.x === 0.5 && s3.y === 2, s3);
ok('the anchor\'s lengths are divided by zoom TIMES the transforms on and above it',
   /var ts = scaleOf\(A\);[\s\S]{0,80}kx = k \* ts\.x; ky = k \* ts\.y;/.test(gsrc) &&
   /function scaleOf\(A\)[\s\S]{0,400}n = flatParent\(n\);/.test(gsrc) &&
   /\(v - b\.left\) \/ kx/.test(gsrc) && /\(v - b\.top\) \/ ky/.test(gsrc));

print('\n=== every new view is held until it is frosted (a hard cut, no fade) ===');
ok('a joining card holds the view unpainted (visibility) and cancels its fade',
   /function hold\(card\)[\s\S]*visibility = 'hidden'[\s\S]*animation = 'none'/.test(gsrc));
ok('update() releases it once the layers are placed and the joins have settled',
   /stats\.lastMs[^\n]*\n\s*settled\(\);/.test(gsrc) && /SETTLE_MS - \(performance\.now\(\) - lastJoin\)/.test(gsrc));
ok('turning the blur off releases it too', /function stop\(\)[\s\S]{0,120}release\(\);/.test(gsrc));
ok('a view is held once (the attribute remembers), with a backstop',
   /v\.hasAttribute\('data-hk-frost'\)\) return;[\s\S]*setTimeout\(release, HOLD_MS\)/.test(gsrc) && window.hkGlass._holdMs === 2500);
ok('a newer view lets a still-held one go', /if \(gate\) release\(\);\n\s*gate = v;/.test(gsrc));
ok('HkBase passes the card and direction to changed()', /hkGlass\.changed\(card, join\)/.test(readFile(HK_ROOT + '/frontend/cards/hk-base.js')));

// The press loop, the row promotions, the hold of a view already painted and
// the layer sizes are BEHAVIOUR, run for real in test_glass_behaviour.js;
// only their wiring is checked here.
(function () {
  var g = readFile(HK_ROOT + '/frontend/modules/hk-glass.js');
  ok('a pressed card\'s frost follows its shrink: pointer listeners on while the blur is, off with it',
     /document\.addEventListener\('pointerdown', onDown, true\)/.test(g) && /PRESS_TAIL_MS = 300/.test(g) &&
     /document\.removeEventListener\('pointerdown', onDown, true\)/.test(g) &&
     /document\.removeEventListener\('pointercancel', onUp, true\)/.test(g));
  ok('the press pass never falls back to a full update', !/pressUpdate[\s\S]{0,40}\{ update\(\); return; \}/.test(g) &&
     !/if \(!touched\.size\) \{ update\(\);/.test(g));
  ok('each card in a SIDEWAYS row gets its own layer, in the same update as the row\'s frost -- one path, every engine',
     /if \(p\.sideways\) promote\(p\);/.test(g) && /n\.style\.willChange = 'transform';/.test(g) &&
     !/webkit-touch-callout|\bIOS\b/.test(g));
  ok('turning the blur off gives the promotions back', /promoted\.forEach\(unpromote\);/.test(g));
})();

print(fail ? 'FAIL ' + fail + ' GLASS TESTS' : 'ALL ' + pass + ' GLASS TESTS PASS');
if (fail) throw new Error('glass tests failed');
