// hk-campost.js: the cached-poster sweep walks the page only on a view that
// can hold one of Home Assistant's live players. Before 2026-09-28 it walked
// ~50 times after every navigation and every pop-up (~120 ms of a wall
// tablet's main thread), on views with no camera at all.
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
load(HK_ROOT + '/tests/dom.js');
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
var CFG = { views: [
  { path: 'home', cards: [{ type: 'custom:hk-camera-mosaic-card', cameras: [] }] },
  { path: 'lights', cards: [{ type: 'custom:hk-tile-card', entity: 'light.a' }] },
  { path: 'cameras', cards: [{ type: 'picture-entity', entity: 'camera.a', camera_view: 'live' }] },
  { cards: [{ type: 'picture-entity', entity: 'camera.b', camera_view: 'auto' }] }
] };
window.hkCards = { menu: { config: function () { return CFG; } } };
location.pathname = '/dashboard-kitchen/lights';
load(HK_ROOT + '/frontend/modules/hk-campost.js');
var P = window.hkCamPost;
ok('a view of tiles: no walk', P.mayHavePlayers() === false);
location.pathname = '/dashboard-kitchen/cameras';
ok('the Cameras page (camera_view: live): walked', P.mayHavePlayers() === true);
location.pathname = '/dashboard-kitchen/home';
ok('Home with the camera strip (its live tile): walked', P.mayHavePlayers() === true);
location.pathname = '/dashboard-kitchen';
ok('the dashboard root is its first view', P.mayHavePlayers() === true);
location.pathname = '/dashboard-kitchen/3';
ok('a view by its index; stills only (camera_view: auto): no walk', P.mayHavePlayers() === false);
var saved = CFG; CFG = null;
ok('no configuration yet: walked, as before', P.mayHavePlayers() === true);
CFG = saved;

// a navigation (or a pop-up: both fire location-changed) to a view with no camera
__resetTimers();
location.pathname = '/dashboard-kitchen/lights';
dispatchEvent({ type: 'location-changed' });
ok('...starts no ramp at all', __timerCount() === 0, __timerCount());
location.pathname = '/dashboard-kitchen/cameras';
dispatchEvent({ type: 'location-changed' });
ok('...and a camera view does', __timerCount() === 1, __timerCount());
print(fail ? 'FAIL ' + fail + ' CAMPOST TESTS' : 'ALL ' + pass + ' CAMPOST TESTS PASS');
