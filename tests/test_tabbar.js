// The tab bar (modules/hk-tabbar.js): how many tabs fit a width and what
// goes in More, the state it moves through while the page scrolls, and its
// material. Nothing here names a real house.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
var root = HK_ROOT;
load(root + '/tests/dom.js');
window.customCards = [];
window.loadCardHelpers = function () { return new Promise(function () {}); };

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}

var SETTINGS = {};
window.hkSettings = { get: function (path, fb) {
  var v = SETTINGS, p = String(path).split('.');
  for (var i = 0; i < p.length; i++) { if (v == null) break; v = v[p[i]]; }
  return v == null ? fb : v;
} };
location.pathname = '/dashboard-hall/0';
document.querySelector = function () { return null; };
window.innerWidth = 402;

load(root + '/frontend/cards/hk-base.js');
load(root + '/frontend/modules/hk-menu.js');
var threw = null;
try { load(root + '/frontend/modules/hk-tabbar.js'); } catch (e) { threw = e; }
ok('loads beside the menu without a page to draw on', !threw && !!window.hkTabBar, String(threw));
var T = window.hkTabBar._, fit = T.fit, parts = T.parts, step = T.scrollStep;

print('=== the fit ===');
// a generated phone screen: Home and eight categories, three pages at the top
var f = fit(9, 3, 402, true);
ok('a 402 px iPhone with a Rooms button: Home, two categories and More',
   f.shown === 3 && f.more === true, JSON.stringify(f));
ok('...the pill fills what is left beside the Rooms button', f.width === 402 - 2 * T.SIZES.GUTTER - 72, String(f.width));
ok('without the Rooms button there is room for one more tab', fit(9, 3, 402, false).shown === 4);
ok('a 320 px phone still gets Home, one more and More', fit(9, 3, 320, true).shown === 2);
ok('an iPad upright (820): seven tabs and More -- never more than eight in all',
   fit(9, 3, 820, true).shown === 7 && fit(9, 3, 820, true).more);
ok('a wall tablet (1280): the same eight', fit(9, 3, 1280, true).shown === 7);
var few = fit(3, 0, 1280, true);
ok('everything fits and nothing is at the top: no More', few.shown === 3 && few.more === false, JSON.stringify(few));
ok('...and the pill is only as wide as its tabs (96 px each, 4 px apart, plus its padding)', few.width === 3 * 96 + 2 * 4 + 8, String(few.width));
ok('the pages at the top always bring More, even with room to spare', fit(3, 1, 1280, true).more === true);
var fm = fit(9, 3, 402, false, true);
ok('the rooms In More: a 402 px phone has Home, three categories and More -- five, as Apple Music has',
   fm.shown === 4 && fm.more === true && fm.plate === true, JSON.stringify(fm));
ok('...an iPad held upright is not a phone: up to eight', fit(9, 3, 820, false, true).shown === 7);
ok('...and the rooms alone bring More, even when every page fits', fit(3, 0, 1280, false, true).more === true &&
   fit(3, 0, 1280, false, false).more === false);
var rm = T.roomsMode;
ok('the Rooms setting: In More by default; a boolean from the first form read as In More / Off',
   rm(undefined) === 'more' && rm(true) === 'more' && rm(false) === 'off' && rm('off') === 'off' && rm('button') === 'button');
ok('tabs too narrow for the highlight\'s capsule (a 320 px phone with a Rooms button) are tinted instead',
   fit(9, 3, 320, true).plate === false && fit(9, 3, 1280, true).plate === true);
ok('a screen with only Home: one tab', fit(1, 0, 402, true).shown === 1 && !fit(1, 0, 402, true).more);

var MODEL = {
  home: { title: 'Home', path: '/d/0', kind: 'home', paths: ['0'] },
  top: [{ title: 'Weather', path: '/d/weather', kind: 'top', paths: ['weather'] }],
  categories: ['Lights', 'Climate', 'Security', 'Music', 'Timers'].map(function (t) {
    return { title: t, path: '/d/' + t.toLowerCase(), kind: 'category', paths: [t.toLowerCase()] };
  }),
  rooms: [{ title: 'Den', path: '/d/den', kind: 'room', paths: ['den'] }]
};
var titles = function (xs) { return xs.map(function (x) { return x.title; }).join(','); };
var p = parts(MODEL, fit(6, 1, 402, true));
ok('the tabs: Home, then the categories in the menu\'s order', titles(p.tabs) === 'Home,Lights,Climate', titles(p.tabs));
ok('More: the pages at the top first, then the categories that did not fit',
   titles(p.more) === 'Weather,Security,Music,Timers', titles(p.more));
ok('the rooms are the menu\'s rooms', titles(p.rooms) === 'Den');
ok('no More: nothing listed in it', parts(MODEL, { shown: 6, more: false }).more.length === 0);

print('=== position ===');
ok('a phone keeps a rail\'s bar at the bottom; a tablet has the rail', T.position('left', 390) === 'bottom' &&
   T.position('right', 1280) === 'right' && T.position('top', 390) === 'top' && T.position('sideways', 1280) === 'bottom');
var rf = T.railFit(9, 3, 800, true);
ok('an 800 px tablet\'s rail holds Home, six more and More -- eight, as the bottom bar', rf.shown === 7 && rf.more, JSON.stringify(rf));
ok('...a short window fewer', T.railFit(9, 3, 500, true).shown === 5);

print('=== scrolling ===');
function run(setting, moves, max) {
  var st = { mode: 'full' }, y = 0;
  moves.forEach(function (dy) { y += dy; st = step(st, dy, y, max === undefined ? 4000 : max, setting); });
  return st.mode;
}
ok('shrink: scrolling down folds it into the small button', run('shrink', [10, 10, 10]) === 'small');
ok('...a nudge (under 28 px) does not', run('shrink', [10, 10]) === 'full');
ok('...any scroll up of 12 px brings it back, anywhere on the page', run('shrink', [200, 300, -6, -6]) === 'full');
ok('...6 px up is not yet a scroll up', run('shrink', [200, 300, -6]) === 'small');
ok('...a reversal starts the count again', run('shrink', [200, -8, 8, -8]) === 'small');
ok('hide: scrolling down slides it away', run('hide', [40]) === 'gone');
ok('...and up brings it back', run('hide', [400, -20]) === 'full');
ok('stay: never moves', run('stay', [400, 400, 400]) === 'full');
ok('the end of the page brings it back', run('shrink', [3000, 996], 4000) === 'full');
ok('the top of the page (an iPhone\'s rubber band past it) brings it back', run('shrink', [300, -296]) === 'full' &&
   step({ mode: 'small' }, -10, -30, 4000, 'shrink').mode === 'full');
ok('a page too short to scroll never folds it', run('shrink', [20, 20], 40) === 'full');

function runRest(moves, start) {
  var st = { mode: start || 'small' }, y = 0;
  moves.forEach(function (dy) { y += dy; st = step(st, dy, y, 4000, 'shrink', 'small'); });
  return st.mode;
}
ok('Start Small: scrolling up, or reaching the top, does not open it', runRest([300, -290]) === 'small' && runRest([-10]) === 'small');
ok('...opened by a tap, scrolling down folds it again', runRest([200, 20, 20], 'full') === 'small');
ok('...and the end of the page leaves it as it is', runRest([3996], 'small') === 'small');

var rr = T.room;
ok('Adjust Content: a rail that shrinks or hides eases the page aside; the top slides it; the bottom and Stay keep room',
   rr('left', 'shrink', true) === 'scale' && rr('right', 'hide', true) === 'scale' && rr('top', 'shrink', true) === 'shift' &&
   rr('bottom', 'hide', true) === 'pad' && rr('right', 'stay', true) === 'pad' && rr('top', 'stay', true) === 'pad');
ok('...off, the bar floats over the page everywhere', ['left', 'right', 'top', 'bottom'].every(function (p) {
   return rr(p, 'shrink', false) === 'none' && rr(p, 'stay', false) === 'none'; }));

print('=== the material ===');
var mat = T.material;
ok('the screen\'s look: frosted stays frosted', mat('house', 'frosted') === 'frosted');
ok('...every other look is one blur (the chips blur themselves on Clear)',
   mat('house', 'clear') === 'blur' && mat('house', 'blur_each') === 'blur' && mat('house', null) === 'blur');
ok('its own choice wins', mat('clear', 'blur') === 'clear' && mat('frosted', 'blur') === 'frosted' &&
   mat('blur', 'frosted') === 'blur');

print('=== where it shows: the menu\'s other form (hkCards.menu.tabBar) ===');
var C = window.hkCards, M = C.menu;
function at(w, board) {
  window.innerWidth = w;
  SETTINGS.boards = { 'dashboard-hall': board };
  return { bar: M.tabBar(), menu: M.on(), docked: M.docked(), style: M.style() };
}
var t = at(1440, { menu: 'tabbar' });
ok('Menu: Tab Bar -- the bar at every width, and no side menu', t.bar && !t.menu && t.style === null &&
   at(402, { menu: 'tabbar' }).bar, JSON.stringify(t));
t = at(1440, { menu: 'open', narrow: 'tabbar' });
ok('Always Open with Tab Bar when folded: the menu docked on a computer, no bar', !t.bar && t.docked && t.style === 'docked',
   JSON.stringify(t));
t = at(900, { menu: 'open', narrow: 'tabbar' });
ok('...folded (under Keep Open Down To): the bar, and no side menu at all', t.bar && !t.menu && !t.docked && t.style === null,
   JSON.stringify(t));
t = at(1280, { menu: 'auto', narrow: 'tabbar' });
ok('A button with Tab Bar on narrow screens: the button from 1,024 px', !t.bar && t.menu, JSON.stringify(t));
t = at(820, { menu: 'auto', narrow: 'tabbar' });
ok('...under 1,024 px: the bar instead of the button', t.bar && !t.menu && t.style === null, JSON.stringify(t));
ok('no swipe and no clock tap where the bar is', (function () {
  at(820, { menu: 'auto', narrow: 'tabbar', swipe: true, clock: true });
  return !M.swipe() && !M.clock();
})());
ok('Off: neither', (function () { var x = at(402, { menu: 'off', narrow: 'tabbar' }); return !x.bar && !x.menu; })());
ok('a narrow choice of chip: never the bar', !at(402, { menu: 'auto', narrow: 'chip' }).bar);
SETTINGS.boards = { 'dashboard-other': { menu: 'tabbar' } };
ok('a dashboard with no item of its own: no tab bar', M.tabBar() === false);

print('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'ALL ' + pass + ' TAB BAR TESTS PASS'));
if (fail) throw new Error(fail + ' failed');
