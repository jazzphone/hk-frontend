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

print('\n=== leaving the page: nothing of it keeps running ===');
(function () {
  var pg = Object.create(P), calls = [];
  var sr = { addEventListener: function () {}, removeEventListener: function () {} };
  Object.defineProperty(pg, 'shadowRoot', { value: sr });
  var connected = true;
  Object.defineProperty(pg, 'isConnected', { get: function () { return connected; } });
  var resolveSub = null, unsubbed = 0;
  pg._hass = { connection: { subscribeMessage: function () {
    return new Promise(function (r) { resolveSub = r; }); } } };
  P.subscribe.call(pg);
  P.subscribe.call(pg);
  ok('one subscription asked for, however often subscribe() runs while it is on its way', typeof resolveSub, 'function');
  pg._soonT = setTimeout(function () { calls.push('soon'); }, 0);
  pg._stT = setTimeout(function () { calls.push('status'); }, 0);
  pg._skyWait = setInterval(function () { calls.push('sky'); }, 0);
  pg._saverWait = setInterval(function () { calls.push('saver'); }, 0);
  connected = false;
  P.disconnectedCallback.call(pg);
  ok('its timers are cleared', [pg._soonT, pg._stT, pg._skyWait, pg._saverWait].every(function (t) { return t == null; }), true);
  resolveSub(function () { unsubbed++; });
  drainMicrotasks();
  ok('a subscription that arrives after the page left is ended at once', unsubbed, 1);
  ok('...and not kept', pg._unsub == null, true);
  // back on the page: a fresh one is kept
  connected = true;
  P.subscribe.call(pg);
  resolveSub(function () { unsubbed++; });
  drainMicrotasks();
  ok('on the page again: the new subscription is kept', typeof pg._unsub, 'function');
  __runTimers();
  ok('...and the old timers never fire', calls.length, 0);
})();

print(fail ? 'FAIL ' + fail + ' SETTINGS ROUTE TESTS' : 'ALL ' + pass + ' SETTINGS ROUTE TESTS PASS');
