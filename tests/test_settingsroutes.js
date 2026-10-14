// The HK Settings page's addresses (panels/hk-settings.js resolve): which page
// an address opens. The page draws itself; this is only the routing decision,
// with each page stubbed to say its name.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
load(HK_ROOT + '/tests/dom.js');
// the panel as the page has it: its model, kit and features first (the page
// imports them before it draws), so routes that read the model resolve
load(HK_ROOT + '/frontend/panels/hk-settings-model.js');
load(HK_ROOT + '/frontend/panels/hk-settings-kit.js');
load(HK_ROOT + '/frontend/panels/hk-settings-features.js');
(0, eval)(read(HK_ROOT + '/frontend/panels/hk-settings.js').replace('  var M = null, K = null, h = null, F = null;',
  '  var M = window.hkSettingsModel, K = window.hkSettingsKit, h = K.h, F = window.hkSettingsFeatures; F.use(K);'));
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
ok('house backdrop opens its own page (Sky Colors)', open('#/house/sky/backdrop').title, 'Sky Colors');
page.dash = function (path) { return { path: path, title: 'Sky Test', item: true }; };
page.data.boards = { 'dashboard-sky': {} };
ok('screen sky opens the named page', P.p_screen.call(page, 'dashboard-sky', ['sky']).title, 'Sky / Background');
var backdrop = P.p_screen.call(page, 'dashboard-sky', ['sky', 'backdrop']);
ok('screen backdrop opens its picker (Sky Colors)', backdrop.title, 'Sky Colors');
ok('screen backdrop Back returns to Sky / Background', backdrop.back[1], '#/screens/dashboard-sky/sky');
// SKY LIVELINESS (2026-10-08): a woodland season has its own page now, Back
// to the seasons; the night sky has one too
ok('a woodland season opens its own page', open('#/house/sky/woodland/fall').title, 'Autumn');
ok('...Back to the seasons', open('#/house/sky/woodland/fall').back[1], '#/house/sky/woodland');
ok('...an unknown one is the seasons\' list', open('#/house/sky/woodland/monsoon').title, 'Woodland Between Occasions');
ok('the night sky opens its page', open('#/house/sky/night').title, 'Night Sky');

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

print('=== accessories by type (2026-10-13) ===');
(function () {
  var pg = Object.create(P);
  pg.data = { settings: { sky: {}, look: {}, generated: {} }, choices: {}, counts: {}, accessories: {} };
  pg._hass = { states: {}, entities: {}, devices: {}, areas: {} };
  pg.p_overview = function () { return 'overview'; };
  var go = function (hash) { return P.resolve.call(pg, hash.replace(/^#\/?/, '').split('/')); };
  ok('a type opens its page', go('#/accessories/type/lights').title, 'Lights');
  ok('...whose Back is Accessories', go('#/accessories/type/lights').back[1], '#/accessories');
  ok('What Counts’ old kind address opens the type', go('#/house/counts/locks').title, 'Locks');
  ok('...and What Counts itself opens Accessories', go('#/house/counts').title, 'Accessories');
  ok('a type’s Tile Order', go('#/accessories/type/locks/order').title, 'Tile Order');
  ok('...comes back to its type', go('#/accessories/type/locks/order').back[1], '#/accessories/type/locks');
  ok('the old page-order address is Tile Order too', go('#/accessories/page/vacuums').title, 'Tile Order');
  ok('Added Accessories (was Also Shown)', go('#/accessories/added').title, 'Added Accessories');
  ok('...and its old address still opens it', go('#/accessories/also').title, 'Added Accessories');
  ok('an unknown type is not a type page', go('#/accessories/type/nope').title !== 'nope', true);
  ok('All Screens \u2192 Status Chips', go('#/house/chips').title, 'Status Chips');
  ok('...and one chip across the screens', go('#/house/chips/lights').title, 'Lights Chip');
  ok('...whose Back is Status Chips', go('#/house/chips/lights').back[1], '#/house/chips');
  // THE CHIP PAGES DRAW (2026-10-13: one read a list before it was made)
  pg.data.chip_kinds = ['lights', 'energy', 'doors_windows'];
  pg.data.boards = { 'dashboard-a': { chips_row: true, chips: [], chips_quiet: ['doors_windows'], chips_custom: ['mail'], home_page: true } };
  pg.data.custom_chips = [{ key: 'mail', name: 'Mail', after: 'end', card: { type: 'conditional', card: { type: 'custom:hk-status-chip-card', entity: 'sensor.m' } } }];
  pg.dash = function (p) { return { path: p, title: 'Screen A' }; };
  pg.hasAttribute = function () { return true; };
  pg.setB = function () { return Promise.resolve(true); };
  // (the stub DOM, enough for a page to draw)
  if (!document.createTextNode) document.createTextNode = function (t) { var e = document.createElement('#text'); e.textContent = String(t); return e; };
  // (its innerHTML makes no nodes: an icon's svg comes back undefined)
  var EP = document.createElement('div').constructor.prototype, ap = EP.appendChild;
  EP.appendChild = function (c) { return c ? ap.call(this, c) : c; };
  ['#/house/chips', '#/house/chips/lights', '#/house/chips/energy', '#/house/chips/doors_windows', '#/house/chips/chip%3Amail'].forEach(function (hash) {
    var err = null, box = document.createElement('div');
    try { go(hash).body(box); } catch (e) { err = String(e); }
    ok(hash + ' draws', err, null);
  });
  ok('every kind has a type of the same id', window.hkSettingsModel.COUNT_KINDS.every(function (k) { return !!window.hkSettingsModel.accType(k[0]); }), true);
})();

print('\n=== Screensaver and Wall Tablets (2026-10-13) ===');
(function () {
  var pg = Object.create(P);
  pg.p_overview = function () { return 'overview'; };
  pg.hs = function () { return null; };
  pg.data = { settings: { tablets: {} }, boards: {}, tablets: { living_room: { name: 'Living Room', screen: 'dashboard-livingroom', sleep: {} } } };
  var go = function (hash) { return P.resolve.call(pg, hash.replace(/^#\/?/, '').split('/')); };
  ok('Screensaver is its own page', go('#/house/screensaver').title, 'Screensaver');
  ok('...its clock style below it', go('#/house/screensaver/clock-style').back[1], '#/house/screensaver');
  var replaced = null;
  if (typeof history === 'undefined') (0, eval)('var history = {}');
  var saved = history.replaceState;
  history.replaceState = function (_s, _t, u) { replaced = u; };
  ok('its old address under Wall Tablets opens it', go('#/house/tablets/screensaver').title, 'Screensaver');
  ok('...and the address becomes its own', replaced, '#/house/screensaver');
  history.replaceState = saved;
  ok('Wall Tablets is the tablets', go('#/house/tablets').title, 'Wall Tablets');
  ok('a tablet opens its own page', go('#/house/tablets/living_room').title, 'Living Room');
  ok('...back to Wall Tablets', go('#/house/tablets/living_room').back[1], '#/house/tablets');
  ok('its Sleep Screen', go('#/house/tablets/living_room/sleep').back[1], '#/house/tablets/living_room');
  ok('a Sleep Screen list', go('#/house/tablets/living_room/sleep/presence').title, 'Presence');
  ok('Add Tablet', go('#/house/tablets/add').title, 'Add Tablet');
  ok('a tablet that isn\'t there is Wall Tablets', go('#/house/tablets/nope').title, 'Wall Tablets');
})();

print(fail ? 'FAIL ' + fail + ' SETTINGS ROUTE TESTS' : 'ALL ' + pass + ' SETTINGS ROUTE TESTS PASS');
