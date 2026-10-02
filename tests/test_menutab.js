// The menu's edge tab stays level with the date line however the page is
// scrolled when the menu re-syncs (hk-base.js viewTop, hk-menu.js place).
// A sync happens on any change in the page's height, a resize or a
// navigation; the document is what scrolls, so the dashboard panel's rect
// moves with it. A sync that ignored the scroll would put the tab 400 px up
// at scrollY 400, off the screen, and leave it there after scrolling back.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
var root = HK_ROOT;
load(root + '/tests/dom.js');
El.prototype.attachShadow = function () { this.shadowRoot = new El('#shadow'); return this.shadowRoot; };
var _ap = El.prototype.appendChild;
El.prototype.appendChild = function (c) { c.isConnected = true; return _ap.call(this, c); };
El.prototype.focus = function () {};
document.documentElement = new El('html');
window.customCards = [];
window.loadCardHelpers = function () { return new Promise(function () {}); };

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}

var SETTINGS = { boards: { 'dashboard-hall': { menu: 'tab' } } };
window.hkSettings = { get: function (path, fb) {
  var v = SETTINGS, p = String(path).split('.');
  for (var i = 0; i < p.length; i++) { if (v == null) break; v = v[p[i]]; }
  return v == null ? fb : v;
} };
location.pathname = '/dashboard-hall/0';
var CFG = { views: [{ title: 'Hall', path: 'hall', cards: [] }] };
// The panel is as tall as the page and sits at the top of the document: its
// viewport top is minus the document's scroll.
window.scrollY = 0;
var panel = { get lovelace() { return { config: CFG }; }, shadowRoot: null, getBoundingClientRect: function () {
  var t = -window.scrollY;
  return { left: 0, top: t, width: 1280, height: 9000, right: 1280, bottom: t + 9000 }; } };
var main = { shadowRoot: { querySelector: function (s) { return s === 'ha-panel-lovelace' ? panel : null; } } };
var haSR = document.createElement('div');
var haQS = haSR.querySelector.bind(haSR);
haSR.querySelector = function (s) { return s === 'home-assistant-main' ? main : haQS(s); };
var ha = { shadowRoot: haSR };
document.querySelector = function (s) { return s === 'home-assistant' ? ha : null; };
window.innerWidth = 1280; window.innerHeight = 800;
load(root + '/frontend/cards/hk-base.js');
load(root + '/frontend/modules/hk-menu.js');
var M = window.hkCards.menu;

ok('a wall tablet dashboard draws the edge tab', M.style() === 'tab', M.style());
ok('the page top at rest does not move with the scroll',
   (function () { window.scrollY = 0; var a = M.viewTop(); window.scrollY = 400; var b = M.viewTop(); window.scrollY = 0; return a === b; })());

M.publishDate(118);                              // the date line, 118 px below the page top
window.hkMenu.sync();
var S = window.hkMenu._.state();
function tabY() { return S.root && S.root.style.getPropertyValue('--tab-y'); }
var rest = tabY();
function tabH() { return parseFloat(S.root.style.getPropertyValue('--tab-h')); }
ok('at rest the tab is centred on the date line', parseFloat(rest) + tabH() / 2 === 118, rest + ' h ' + tabH());
ok('a tablet gets the Large tab by default', tabH() === 86 && S.root.style.getPropertyValue('--tab-w') === '36px',
   tabH() + ' ' + S.root.style.getPropertyValue('--tab-w'));
window.scrollY = 400;
window.hkMenu.sync();                            // the page's height changed while scrolled
ok('a sync while scrolled leaves the tab where it was', tabY() === rest, tabY() + ' vs ' + rest);
window.scrollY = 0;
ok('back at the top, the tab is on the date line', tabY() === rest, tabY());

// ---- THE MIXES: the chip, and the tab once it is scrolled past;
// the chip on Home, the tab elsewhere
SETTINGS.boards['dashboard-hall'].menu = 'chip_scroll';
location.pathname = '/dashboard-hall/0';
ok('chip then tab: the chip style', M.style() === 'chip', M.style());
ok('...a round button on Home and beside the back chevron', M.round('home') && M.round('page'));
ok('...and the tab only once scrolled past', M.tab() === 'scrolled', M.tab());
// a chip card: its <ha-card> at a place the test moves
var chipTop = 150;
var chipEl = { isConnected: true, getBoundingClientRect: function () {
  return { top: chipTop, bottom: chipTop + 44, width: 44, left: 16, right: 60 }; } };
var chipCard = { shadowRoot: { querySelector: function (s) { return s === '[data-hk-role="menu"]' ? chipEl : null; } } };
M.chipShown(chipCard);
window.hkMenu.sync();
function cls() { return ' ' + S.root.className + ' '; }
ok('the chip in sight: the tab waits out past the edge', cls().indexOf(' tabscroll ') >= 0 && cls().indexOf(' tabbed ') < 0, cls());
function scrollTo(y) {
  chipTop = 150 - y; window.scrollY = y;
  // a page scroll is fired at the DOCUMENT (and reaches the window after);
  // the menu listens there, capturing, to hear any scroller
  __resetTimers(); document.dispatchEvent(new Event('scroll')); __runTimersUnder(1);
}
scrollTo(400);
ok('scrolled past the chip: the tab slides in', cls().indexOf(' tabbed ') >= 0, cls());
scrollTo(180);                                   // chip 44 px tall at 150: half gone past 172
ok('...and in once half the chip is gone above the top', cls().indexOf(' tabbed ') >= 0, cls());
scrollTo(100);
ok('the chip back in sight: the tab goes', cls().indexOf(' tabbed ') < 0, cls());
window.hkMenu.sync();
ok('...and a sync keeps it gone', cls().indexOf(' tabscroll ') >= 0 && cls().indexOf(' tabbed ') < 0, cls());
scrollTo(0);
chipEl.isConnected = false;                      // the view left the page
window.hkMenu.sync();
ok('no chip on the page yet: the tab waits a moment before counting it missing', cls().indexOf(' tabbed ') < 0, cls());
chipEl.isConnected = true;

SETTINGS.boards['dashboard-hall'].menu = 'chip_home';
ok('chip on Home: the chip on Home', M.style() === 'chip' && M.tab() === 'scrolled', M.style() + ' ' + M.tab());
location.pathname = '/dashboard-hall/lights';
ok('...the tab on every other page', M.style() === 'tab' && M.tab() === 'always', M.style() + ' ' + M.tab());
ok('...no round button beside the back chevron', M.round('page') === false);
ok('...while Home, cached, keeps its chip', M.round('home') === true);
window.hkMenu.sync();
ok('...and the tab is drawn outright', cls().indexOf(' tabbed ') >= 0 && cls().indexOf(' tabscroll ') < 0, cls());
window.innerWidth = 800;
ok('no room for a tab (an iPad upright): the chip everywhere, never the tab',
   M.style() === 'chip' && M.round('page') && M.tab() === 'never', M.style() + ' ' + M.tab());
// ON NARROW SCREENS: the screen's own setting says what happens there
SETTINGS.boards['dashboard-hall'].narrow = 'chip_scroll';
ok('narrow, "chip then tab": the chip, and the tab once scrolled past',
   M.style() === 'chip' && M.round('home') && M.tab() === 'scrolled', M.style() + ' ' + M.tab());
SETTINGS.boards['dashboard-hall'].narrow = 'tab';
ok('narrow, "edge tab": the tab, no round buttons',
   M.style() === 'tab' && M.tab() === 'always' && !M.round('home') && !M.round('page'), M.style() + ' ' + M.tab());
// an always-open menu folds into the same choice -- even wider than 1,024
SETTINGS.boards['dashboard-hall'].menu = 'open';
SETTINGS.boards['dashboard-hall'].dock_min = 1500;
window.innerWidth = 1280;
ok('an always-open menu folded (narrower than its fold width): the narrow choice',
   M.style() === 'tab' && M.tab() === 'always', M.style() + ' ' + M.tab());
SETTINGS.boards['dashboard-hall'].narrow = 'chip';
ok('...the chip by default', M.style() === 'chip' && M.round('page') && M.tab() === 'never', M.style() + ' ' + M.tab());
delete SETTINGS.boards['dashboard-hall'].narrow;
delete SETTINGS.boards['dashboard-hall'].dock_min;
window.innerWidth = 1280;
SETTINGS.boards['dashboard-hall'].menu = 'chip';
ok('the plain chip never draws the tab', M.tab() === 'never' && M.round('page'));
SETTINGS.boards['dashboard-hall'].menu = 'tab';
ok('the plain tab has no round buttons', M.tab() === 'always' && !M.round('home') && !M.round('page'));

// THE TAB'S SIZE (board tab_size): the screen's choice on a tablet, and
// always the slim one on a phone, where it lies over the first column
SETTINGS.boards['dashboard-hall'].tab_size = 'standard';
window.hkMenu.sync();
ok('Standard is the slim 26 x 62 tab', tabH() === 62 && S.root.style.getPropertyValue('--tab-w') === '26px');
ok('...still centred on the date line', parseFloat(tabY()) + 31 === 118, tabY());
SETTINGS.boards['dashboard-hall'].tab_size = 'xl';
window.hkMenu.sync();
ok('Extra Large is 46 x 110, with a larger glyph', tabH() === 110 && S.root.style.getPropertyValue('--tab-ic') === '24px');
window.innerWidth = 390;
window.hkMenu.sync();
ok('a phone keeps the slim tab by default, whatever the tablet\'s size', tabH() === 62, tabH());
// ...and has three sizes of its own (tab_size_phone), apart from the tablet's
SETTINGS.boards['dashboard-hall'].tab_size_phone = 'large';
window.hkMenu.sync();
ok('a phone\'s Large is 36 x 86', tabH() === 86 && S.root.style.getPropertyValue('--tab-w') === '36px', tabH());
SETTINGS.boards['dashboard-hall'].tab_size_phone = 'xl';
window.hkMenu.sync();
ok('a phone\'s Extra Large is 46 x 110', tabH() === 110, tabH());
SETTINGS.boards['dashboard-hall'].tab_size_phone = 'huge';
window.hkMenu.sync();
ok('an unknown phone size is Standard', tabH() === 62, tabH());
SETTINGS.boards['dashboard-hall'].tab_size_phone = 'large';
window.innerWidth = 1280;
window.hkMenu.sync();
ok('the phone\'s size leaves the tablet\'s alone', tabH() === 110, tabH());
delete SETTINGS.boards['dashboard-hall'].tab_size_phone;
SETTINGS.boards['dashboard-hall'].tab_size = 'huge';
window.hkMenu.sync();
ok('an unknown size is Large', tabH() === 86, tabH());
delete SETTINGS.boards['dashboard-hall'].tab_size;

print('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'ALL ' + pass + ' MENU TAB TESTS PASS'));
if (fail) throw new Error(fail + ' failed');
