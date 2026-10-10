// hk-campost.js: the cached-poster sweep walks the page only on a view that
// can hold one of Home Assistant's live players. Before 2026-09-28 it walked
// ~50 times after every navigation and every pop-up (~120 ms of a wall
// tablet's main thread), on views with no camera at all.
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
load(HK_ROOT + '/tests/dom.js');
// a wall tablet: Android's WebView, which draws video outside the page (the
// rule below is Android's only -- test_campost_safari.js has the rest)
globalThis.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-X230 Build/BP2A; wv) AppleWebKit/537.36 Chrome/153.0 Safari/537.36' };
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

// NO PICTURE, NO VIDEO: a player's video out of sight until it has a
// picture, the poster painted behind it; on leaving, the frame kept
function el(tag, kids) {
  var e = { tagName: tag.toUpperCase(), children: kids || [], style: {}, _l: {}, parentNode: null,
            addEventListener: function (t, f) { (this._l[t] = this._l[t] || []).push(f); } };
  return e;
}
function fire(e, t) { (e._l[t] || []).forEach(function (f) { f({ type: t }); }); }
var video = el('video'); video.readyState = 0; video.videoWidth = 0;
var player = el('ha-web-rtc-player');
player.shadowRoot = { children: [video], querySelector: function (q) { return q === 'video' ? video : null; } };
var streamHost = { stateObj: { entity_id: 'camera.a' } };
player.getRootNode = function () { return { host: streamHost }; };
player.posterUrl = '/api/camera_proxy/camera.a?token=T';
if (!document.body) document.body = { children: [] };
document.body.children = [player];
var cache = {}, puts = [];
window.hkCards.snapCache = {
  FRESH: 120000,
  get: function (id) { return cache[id] || null; },
  put: function (id, src, force) { puts.push([id, src, force]); return 'data:image/jpeg;base64,LEFT'; }
};
location.pathname = '/dashboard-kitchen/cameras';
P.sweep();
ok('a player whose video has no picture: the video out of sight', video.style.visibility === 'hidden', video.style.visibility);
ok('...HA\'s poster painted behind it (nothing fresh cached)', /camera_proxy\/camera\.a/.test(player.style.background || ''), player.style.background);
video.readyState = 4; video.videoWidth = 1280; fire(video, 'playing');
ok('the stream has a picture: the video shown', video.style.visibility === '', video.style.visibility);
location.pathname = '/dashboard-kitchen/lights';
dispatchEvent({ type: 'location-changed' });
ok('leaving the page: the playing frame kept, whatever its age (force)', puts.length === 1 && puts[0][0] === 'camera.a' && puts[0][1] === video && puts[0][2] === true, puts);
ok('...painted behind the video', /LEFT/.test(player.style.background), player.style.background);
ok('...and the video out of sight before it is torn down', video.style.visibility === 'hidden');
location.search = '?pop=1';
video.style.visibility = '';
dispatchEvent({ type: 'location-changed' });
ok('a pop-up (same path) is not a leave', video.style.visibility === '' && puts.length === 1);
// back to the page Home Assistant kept: the left video's readyState is the old stream's
video.style.visibility = 'hidden'; video.__hkLeft = true;
location.search = ''; location.pathname = '/dashboard-kitchen/cameras';
document.body.children = [player];
dispatchEvent({ type: 'location-changed' }); P.sweep();
ok('back on a kept page: the left video stays out of sight on its old readyState', video.style.visibility === 'hidden', video.style.visibility);
fire(video, 'playing');
ok('...until its new stream plays', video.style.visibility === '', video.style.visibility);
// a fresh cached frame is the poster, behind the video too
var video2 = el('video'); video2.readyState = 0; video2.videoWidth = 0;
var player2 = el('ha-web-rtc-player');
player2.shadowRoot = { children: [video2], querySelector: function (q) { return q === 'video' ? video2 : null; } };
player2.getRootNode = function () { return { host: { stateObj: { entity_id: 'camera.b' } } }; };
cache['camera.b'] = { d: 'data:image/jpeg;base64,FRESH', t: Date.now() };
document.body.children = [player2];
location.pathname = '/dashboard-kitchen/cameras';
P.sweep();
ok('a fresh cached frame: the player\'s poster and painted behind the hidden video',
   player2.posterUrl === 'data:image/jpeg;base64,FRESH' && /FRESH/.test(player2.style.background) && video2.style.visibility === 'hidden');
document.body.children = [];
print(fail ? 'FAIL ' + fail + ' CAMPOST TESTS' : 'ALL ' + pass + ' CAMPOST TESTS PASS');
