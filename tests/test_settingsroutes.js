// The HK Settings page's addresses (panels/hk-settings.js resolve): which page
// an address opens. The page draws itself; this is only the routing decision,
// with each page stubbed to say its name.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/frontend/panels/hk-settings.js');
var pass = 0, fail = 0;
function ok(name, got, want) {
  if (got === want) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + '   got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
}
var P = customElements.get('hk-settings-panel').prototype;
var page = Object.create(P);
page.p_overview = function () { return 'overview'; };
page.p_screen = function (path) { return 'screen:' + path; };
function open(hash) { return P.resolve.call(page, hash.replace(/^#\/?/, '').split('/')); }

print('=== the screens ===');
ok('a screen opens its page', open('#/screens/dashboard-kitchen'), 'screen:dashboard-kitchen');
// There is no list page of screens (the list is the menu): #/screens alone
// drew "There's no dashboard at /undefined." -- the 1.0 docs' screenshot of
// the Screens list showed exactly that.
ok('#/screens with no screen named opens the Overview, not a screen called undefined', open('#/screens'), 'overview');
ok('...and so does #/screens/ (an empty name)', open('#/screens/'), 'overview');

page.data = { settings: { sky: {}, look: {} }, choices: {} };
ok('house backdrop opens its own page', open('#/house/sky/backdrop').title, 'Backdrop');
page.dash = function (path) { return { path: path, title: 'Sky Test', item: true }; };
page.data.boards = { 'dashboard-sky': {} };
ok('screen sky opens the named page', P.p_screen.call(page, 'dashboard-sky', ['sky']).title, 'Sky / Background');
var backdrop = P.p_screen.call(page, 'dashboard-sky', ['sky', 'backdrop']);
ok('screen backdrop opens its picker', backdrop.title, 'Backdrop');
ok('screen backdrop Back returns to Sky / Background', backdrop.back[1], '#/screens/dashboard-sky/sky');

print(fail ? 'FAIL ' + fail + ' SETTINGS ROUTE TESTS' : 'ALL ' + pass + ' SETTINGS ROUTE TESTS PASS');
