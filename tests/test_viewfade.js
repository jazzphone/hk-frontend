// hk-viewfade.js must not leave its animation applied after the fade.
//
// With `animation: ... both`, the finished fade keeps hui-view's opacity
// animation-driven for the life of the page, Chromium makes hui-view a
// compositing surface (a backdrop root), and every backdrop-filter inside it
// -- the chips' glass -- blurs an empty surface instead of the sky, which sits
// outside hui-view. Nothing looks broken; the glass is just flat.
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
var src = readFile(HK_ROOT + '/frontend/modules/hk-viewfade.js');
var rule = /animation:var\(--hk-view-anim,hk-view-in[^}]*\}/.exec(src);
print('=== the view fade ===');
ok('the fade rule is there', !!rule);
ok('its fill mode is backwards (holds opacity:0 before the first frame only)', !!rule && / backwards\)\}/.test(rule[0]), rule && rule[0]);
ok('"Blur each card" turns it off through a variable (the sheet is in hui-root\'s shadow root)',
   !!rule && rule[0].indexOf('animation:var(--hk-view-anim,') === 0);
ok('it never fills forwards (both/forwards would keep hui-view a backdrop root)', !!rule && !/\b(both|forwards)\b/.test(rule[0]), rule && rule[0]);
ok('it animates opacity only (a transform changes what backdrop-filter samples too)', /@keyframes hk-view-in\{from\{opacity:0\}to\{opacity:1\}\}/.test(src));
print(fail ? 'FAIL ' + fail + ' VIEWFADE TESTS' : 'ALL ' + pass + ' VIEWFADE TESTS PASS');
if (fail) throw new Error('viewfade tests failed');
