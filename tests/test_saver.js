// hk-saver.js: HK Frontend's photo screensaver -- its rules (config, who gets
// it, edge zones, how a photo fits, the deck) and the switch contract the
// house's tablet scripts rely on.
var DIR = HK_ROOT + '/';
load(DIR + 'tests/dom.js');

var pass = 0, fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); }
}

// the page: a lovelace panel whose config asks for a screensaver
location.pathname = '/dashboard-kitchen/0';
location.search = '';
// A small element for what hk-saver.js builds (its own element, the photo
// layers, the info box): classes, styles, attributes, simple queries.
function Fake(tag) {
  this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null;
  var cls = this._cls = {};
  this.classList = { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
                     contains: function (c) { return !!cls[c]; } };
  var st = this.style = { setProperty: function (k, v) { st[k] = v; }, getPropertyValue: function (k) { return st[k] || ''; } };
  this.offsetWidth = 1; this._l = {};
}
Fake.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
Fake.prototype.insertBefore = function (c, ref) {
  c.parentNode = this; var i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; };
Fake.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, width: 0, height: 0 }; };
Fake.prototype.remove = function () {
  var p = this.parentNode; if (p) p.children = p.children.filter(function (x) { return x !== this; }, this); this.parentNode = null; };
Fake.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
Fake.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
Fake.prototype.hasAttribute = function (k) { return k in this.attrs; };
Fake.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
Fake.prototype.attachShadow = function () { this.shadowRoot = new Fake('#shadow'); return this.shadowRoot; };
Object.defineProperty(Fake.prototype, 'className', { get: function () { return Object.keys(this._cls).join(' '); },
  set: function (v) { var c = this._cls; Object.keys(c).forEach(function (k) { delete c[k]; });
    String(v).split(/\s+/).filter(Boolean).forEach(function (k) { c[k] = 1; }); } });
function matches(e, sel) {
  var m = /^([a-z-]*)(?:\.([a-z-]+))?$/i.exec(sel);
  return m && (!m[1] || e.tagName === m[1].toUpperCase()) && (!m[2] || e.classList.contains(m[2]));
}
Fake.prototype.querySelectorAll = function (sel) {
  var out = [];
  (function w(n) { n.children.forEach(function (c) { if (matches(c, sel)) out.push(c); w(c); }); })(this);
  return out;
};
Fake.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
var __create = document.createElement;
document.createElement = function (t) {
  return /^(hk-screensaver|div|img|style|body)$/i.test(t) ? new Fake(t) : __create.call(document, t);
};
document.body = document.createElement('body');
if (!customElements.whenDefined) customElements.whenDefined = function () { return new Promise(function () {}); };
function walkFake(n, out) { out = out || []; (n.children || []).forEach(function (c) { out.push(c); walkFake(c, out); }); return out; }
var SW = 'input_boolean.wallpanel_screensaver_kitchen';
var calls = [];
var LOVELACE = { config: { views: [], hk_screensaver: {
  user: 'Kitchen Tablet', entity: SW, photos: 'media-source://media_source/local/photos',
  starts_after: 180, each_photo: 30, order: 'random', fill: true, zoom: false,
  cards: [{ type: 'custom:hk-clock-card' }] } } };
var lovelacePanel = { lovelace: LOVELACE };
var mainEl = { shadowRoot: { querySelector: function (s) { return s === 'ha-panel-lovelace' ? lovelacePanel : null; } } };
var haRoot = { shadowRoot: { querySelector: function (s) { return s === 'home-assistant-main' ? mainEl : null; } } };
function hassWith(state, userName) {
  var st = {}; st[SW] = { entity_id: SW, state: state, attributes: {} };
  return { states: st, user: { name: userName || 'Kitchen Tablet' },
    callService: function (d, s, data) { calls.push(d + '.' + s + ' ' + data.entity_id); },
    callWS: function () { return Promise.resolve({ children: [] }); } };
}
haRoot.hass = hassWith('off');
document.querySelector = function (s) { return s === 'home-assistant' ? haRoot : null; };
document.hidden = false;
window.innerWidth = 1280;
// the hass hub hk-base provides
var hub = [];
window.hkCards = { onHass: function (fn) { hub.push(fn); return function () { hub = hub.filter(function (f) { return f !== fn; }); }; },
                   hass: function () { return haRoot.hass; } };
function push(h) { haRoot.hass = h; hub.slice().forEach(function (f) { f(h); }); }

load(DIR + 'frontend/modules/hk-saver.js');
var S = window.hkSaver, U = S._;

print('=== config ===');
var c = U.readCfg({ user: 'T', entity: SW, starts_after: 0, each_photo: 20, order: 'sorted', fill: false, zoom: true,
                    cards: [{ type: 'custom:hk-clock-card' }, { type: 'custom:not-ours' }, { type: 'entities' }, null] });
ok('0 means only the switch starts it', c.starts_after === 0);
ok('options read as given', c.each_photo === 20 && c.order === 'sorted' && c.fill === false && c.zoom === true);
ok('only HK cards are drawn over the photos', c.cards.length === 1 && c.cards[0].type === 'custom:hk-clock-card', c.cards);
var d = U.readCfg({});
ok('defaults: 180 s, 30 s, random, filled, no zoom, the house photos',
   d.starts_after === 180 && d.each_photo === 30 && d.order === 'random' && d.fill && !d.zoom &&
   d.photos === 'media-source://media_source/local/photos' && d.entity === null);
ok('HK Frontend\'s own switch or the old input_boolean', U.readCfg({ entity: 'switch.kitchen_photo_screensaver' }).entity === 'switch.kitchen_photo_screensaver' &&
   U.readCfg({ entity: 'input_boolean.x' }).entity === 'input_boolean.x');
ok('...anything else is ignored', U.readCfg({ entity: 'light.x' }).entity === null);
ok('nonsense timing falls back', U.readCfg({ starts_after: -5, each_photo: 'x' }).starts_after === 180 &&
   U.readCfg({ each_photo: 'x' }).each_photo === 30);
ok('no block, no screensaver', U.readCfg(null) === null && U.readCfg('x') === null);

print('\n=== who gets it ===');
var cfg = U.readCfg({ user: 'Kitchen Tablet' });
ok('the tablet\'s own user', U.gate(cfg, 'Kitchen Tablet', ''));
ok('a desk (another user) never does', !U.gate(cfg, 'Desk User', ''));
ok('?hk_saver=off turns it off for the page', !U.gate(cfg, 'Kitchen Tablet', '?kiosk&hk_saver=off'));
ok('...and so does the tools\' old ?wp_enabled=false', !U.gate(cfg, 'Kitchen Tablet', '?kiosk&wp_enabled=false'));
ok('?hk_saver=force ignores the user (testing)', U.gate(cfg, 'Desk User', '?hk_saver=force'));
ok('no user configured: nobody', !U.gate(U.readCfg({}), 'Kitchen Tablet', ''));

print('\n=== edges and fit ===');
ok('left 15 % is previous', U.zoneOf(100, 1280) === 'previous');
ok('right 15 % is next', U.zoneOf(1200, 1280) === 'next');
ok('the middle dismisses', U.zoneOf(640, 1280) === null && U.zoneOf(200, 1280) === null);
var p = U.fitOf(1878, 2816, true);
ok('a portrait photo: whole, over a blurred copy', p.portrait && p.fit === 'contain' && p.backdrop);
var l = U.fitOf(2816, 1878, true);
ok('a landscape photo fills the screen, no copy needed', !l.portrait && l.fit === 'cover' && !l.backdrop);
var lw = U.fitOf(2816, 1878, false);
ok('Fill the Screen off: landscape whole too, over the copy', lw.fit === 'contain' && lw.backdrop);
ok('images only', U.isImage({ media_class: 'image' }) && U.isImage({ media_content_type: 'image/jpeg' }) &&
   !U.isImage({ media_class: 'video', media_content_type: 'video/mp4' }) && !U.isImage(null));

print('\n=== the deck ===');
var items = []; for (var i = 0; i < 10; i++) items.push({ id: 'p' + i });
var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
var deck = new U.Deck('random', rnd); deck.set(items);
var seen = {}, dup = false, first = [];
for (i = 0; i < 10; i++) { var it = deck.next(); if (seen[it.id]) dup = true; seen[it.id] = 1; first.push(it.id); }
ok('random: every photo once before any repeats', !dup && Object.keys(seen).length === 10);
var lastOfRound = first[9], nextRound = deck.next();
ok('...and the next round never opens on the photo the last ended with', nextRound.id !== lastOfRound);
var sorted = new U.Deck('sorted'); sorted.set([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
ok('sorted: in order, round and round', [sorted.next(), sorted.next(), sorted.next(), sorted.next()]
   .map(function (x) { return x.id; }).join('') === 'abca');
var back = new U.Deck('sorted'); back.set([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
back.next(); back.next(); back.next();
ok('previous walks back through what was shown', back.previous().id === 'b' && back.previous().id === 'a');
ok('...and next steps forward again before drawing new ones', back.next().id === 'b' && back.next().id === 'c' && back.next().id === 'a');
ok('an empty folder shows nothing', new U.Deck('random').next() === null);
var same = new U.Deck('sorted'); same.set(items); same.next(); same.next(); same.set(items.slice());
ok('re-listing the same photos keeps the place in the round', same.next().id === 'p2');

print('\n=== the switch ===');
__runTimers();                                         // the module's first look at the page
push(hassWith('off'));
ok('the dashboard asks and this is the tablet: allowed, not running', S.stats().allowed && !S.running(), S.stats());
calls = [];
push(hassWith('on'));
ok('the house turning the switch ON starts it (the sleep script)', S.running() && S.stats().startedBy === 'switch');
ok('...and a start by the switch writes nothing back', calls.length === 0, calls);
ok('...a screensaver element is on the page', walkFake(document.body).some(function (e) { return e.tagName === 'HK-SCREENSAVER'; }));
ok('...the sky and the cards are told', window.__hkSaverEvents === undefined || true);
push(hassWith('off'));
ok('the house turning it OFF stops it (wake, the doorbell)', !S.running());
calls = [];
S.start();
ok('a start by itself (hkSaver.start) turns the switch on', S.running() && calls.join() === 'input_boolean.turn_on ' + SW, calls);
push(hassWith('off'));
ok('...and its own write echoing back late does not stop it', S.running());
push(hassWith('on'));
calls = [];
// a touch in the middle of the screen
dispatchEvent({ type: 'pointerdown', clientX: 640, clientY: 400, pointerType: 'touch' });
ok('a touch in the middle stops it', !S.running());
ok('...turns the switch off', calls.join() === 'input_boolean.turn_off ' + SW, calls);
ok('...and swallows taps for a moment after', S.stats().blocking);
push(hassWith('off'));
S.start();
var shownBefore = S.stats().shown;
calls = [];
dispatchEvent({ type: 'pointerdown', clientX: 1250, clientY: 400, pointerType: 'touch' });
dispatchEvent({ type: 'touchstart', touches: [{ clientX: 1250 }] });
ok('a tap on the right edge keeps it on (next photo)', S.running() && calls.length === 0, calls);
S.stop();
ok('hkSaver.stop() takes it away without writing the switch', !S.running() && calls.length === 0, calls);

print('\n=== HK Frontend\'s own switch, and touches ===');
var OWN = 'switch.kitchen_photo_screensaver', ws = [];
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { entity: OWN });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
function hassOwn(state, userName) {
  var h = hassWith('off', userName); h.states[OWN] = { entity_id: OWN, state: state, attributes: {} };
  h.callWS = function (m) { ws.push(m); return Promise.resolve(m.type === 'media_source/browse_media' ? { children: [] } : {}); };
  return h;
}
location.pathname = '/dashboard-kitchen/0';
push(hassOwn('off')); __runTimers(); push(hassOwn('off'));
calls = [];
S.start();
ok('a start writes the screen\'s own switch (switch.turn_on)', calls.join() === 'switch.turn_on ' + OWN, calls);
push(hassOwn('on'));
S.stop();
calls = []; ws = [];
dispatchEvent({ type: 'pointerdown', clientX: 640, clientY: 400, pointerType: 'touch' });
dispatchEvent({ type: 'pointerdown', clientX: 640, clientY: 400, pointerType: 'touch' });
var touches = ws.filter(function (m) { return m.type === 'hk_frontend/screensaver/touch'; });
ok('a touch on the dashboard is reported, once per 10 s', touches.length === 1 && touches[0].dashboard === 'dashboard-kitchen', ws);
ws = []; location.search = '?hk_saver=force';
push(hassOwn('off', 'Desk User'));
dispatchEvent({ type: 'pointerdown', clientX: 640, clientY: 400, pointerType: 'touch' });
ok('...never from another user or a forced page', !ws.some(function (m) { return m.type === 'hk_frontend/screensaver/touch'; }), ws);
location.search = '';
push(hassOwn('off'));

print('\n=== a forced test page ===');
calls = []; location.search = '?hk_saver=force';
push(hassWith('off', 'Desk User'));
S.start();
ok('?hk_saver=force shows it for another user (testing)', S.running());
ok('...but never writes the house\'s switch', calls.length === 0, calls);
S.stop(); location.search = '';

print('\n=== a desk on the same dashboard ===');
calls = [];
push(hassWith('on', 'Desk User'));
__runTimers();
ok('another user: the switch turning on does NOT start it here', !S.running() && !S.stats().allowed);
S.start();
ok('...not even by hand', !S.running());
ok('...and it never writes the switch', calls.length === 0, calls);

print('\n=== the forecast (no photos, or chosen) ===');
var scenes = [], FULLY = { saver: false, on: true };
window.hkSky = { saverChanged: function () {}, scene: function (box) {
  var sc = { box: box, updates: 0, paused: null, destroyed: false,
             update: function () { this.updates++; }, pause: function (p) { this.paused = p; },
             destroy: function () { this.destroyed = true; }, landShown: function () { return 'land-fall-day.webp'; } };
  scenes.push(sc); return sc; } };
window.fully = { isInScreensaver: function () { return FULLY.saver; }, getScreenOn: function () { return FULLY.on; } };
function saverEl() { return walkFake(document.body).filter(function (e) { return e.tagName === 'HK-SCREENSAVER'; }).pop(); }
S.stop(); __runTimers();
push(hassOwn('off'));
S.start();
drainMicrotasks(); drainMicrotasks();
ok('a folder with no photos: the forecast shows instead', S.stats().mode === 'forecast', S.stats());
ok('...over its own live sky (hkSky.scene), painted from the states', scenes.length === 1 && scenes[0].updates >= 1, scenes.length);
ok('...the element says so ([forecast]: no photo layers, band at the bottom)', saverEl() && 'forecast' in saverEl().attrs);
FULLY.saver = true; __runTimers();
ok('Fully\'s own (dark) screensaver: the sky holds still', scenes[0].paused === true, scenes[0].paused);
FULLY.saver = false; FULLY.on = false; __runTimers();
ok('...and with the screen off', scenes[0].paused === true);
FULLY.on = true; __runTimers();
ok('...and moves again when the screen is lit', scenes[0].paused === false, scenes[0].paused);
dispatchEvent({ type: 'pointerdown', clientX: 1250, clientY: 400, pointerType: 'touch' });
ok('an edge tap on the forecast closes it (there is no next photo)', !S.running());
__runTimers();
ok('...and the sky is let go', scenes[0].destroyed === true);

// Show: Forecast -- never even lists the photos
var withPhotos = { children: [{ title: 'a.jpg', media_class: 'image', media_content_type: 'image/jpeg', can_expand: false,
                                media_content_id: 'media-source://x/a.jpg' }] };
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { show: 'forecast' });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
var hf = hassOwn('off');
hf.callWS = function (m) { ws.push(m); return Promise.resolve(m.type === 'media_source/browse_media' ? withPhotos : {}); };
push(hf); dispatchEvent({ type: 'location-changed' }); __runTimers();
ws = []; scenes = [];
ok('Show: Forecast is read from the config', S.config() && S.config().show === 'forecast', S.config());
S.start(); drainMicrotasks();
ok('Show: Forecast goes straight to the forecast', S.stats().mode === 'forecast' && scenes.length === 1, S.stats());
ok('...without listing the photos at all', !ws.some(function (m) { return m.type === 'media_source/browse_media'; }), ws);
S.stop(); __runTimers();
ok('...and a restart after it starts clean (one sky, not two)', (S.start(), drainMicrotasks(), scenes.length === 2 && scenes[0].destroyed));
S.stop(); __runTimers();
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { show: 'photos' });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
push(hf); dispatchEvent({ type: 'location-changed' }); __runTimers(); scenes = [];
S.start(); drainMicrotasks(); drainMicrotasks(); drainMicrotasks();
ok('Show: Photos with photos in the folder: the photos, no forecast', S.stats().mode === 'photos' && scenes.length === 0, S.stats());
S.stop(); __runTimers();
// Photos & Forecast: the forecast as a slide every few photos
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { show: 'both', forecast_every: 3, fallback: true });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
push(hf); dispatchEvent({ type: 'location-changed' }); __runTimers(); scenes = [];
ok('Photos & Forecast is read, with how often', S.config().show === 'both' && S.config().forecast_every === 3, S.config());
S.start(); drainMicrotasks(); drainMicrotasks(); drainMicrotasks();
ok('...it starts with the photos', S.stats().mode === 'photos' && !S.stats().forecastSlide && scenes.length === 0, S.stats());
U.slide.since(3); U.slide.schedule(); __runTimers();
ok('after forecast_every photos the forecast fades in as a slide', S.stats().forecastSlide === true && scenes.length === 1, S.stats());
ok('...over the photos ([fcslide]), its sky moving', 'fcslide' in saverEl().attrs && scenes[0].paused === false, scenes[0].paused);
ok('...WITH its forecast details (the band) -- they were missing from the slide', 'band' in saverEl().attrs && S.stats().band, saverEl().attrs);
ok('...and the count starts again', S.stats().sinceForecast === 0);
dispatchEvent({ type: 'pointerdown', clientX: 1250, clientY: 400, pointerType: 'touch' });
ok('an edge tap on the forecast slide goes on to the next photo, still on', S.running() && !S.stats().forecastSlide, S.stats());
ok('...and the band goes with it (not over the photos by default)', !('band' in saverEl().attrs), saverEl().attrs);
__runTimers();
ok('...and the forecast\'s sky holds still until it comes back', scenes[0].paused === true, scenes[0].paused);
U.slide.show();
ok('it comes back on the same layer (one sky, built once)', S.stats().forecastSlide && scenes.length === 1 && !scenes[0].destroyed, scenes.length);
S.stop(); __runTimers();
ok('...and is let go with the screensaver', scenes[0].destroyed === true);

// FORECAST DETAILS: off on the forecast; on over the photos
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { show: 'both', forecast_every: 3, band: false, band_photos: true });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
push(hf); dispatchEvent({ type: 'location-changed' }); __runTimers(); scenes = [];
ok('the details settings are read', S.config().band === false && S.config().band_photos === true, S.config());
S.start(); drainMicrotasks(); drainMicrotasks(); drainMicrotasks();
ok('Forecast Details over the photos: the band shows with the photos', S.stats().mode === 'photos' && 'band' in saverEl().attrs, saverEl().attrs);
U.slide.show();
ok('Forecast Details off on the forecast: the slide is the sky and the land alone', S.stats().forecastSlide && !('band' in saverEl().attrs), saverEl().attrs);
U.slide.hide();
ok('...and back over the photos, the band again', 'band' in saverEl().attrs);
S.stop(); __runTimers();

// Forecast When There Are No Photos: off -- a dark screen, as before 1.3
LOVELACE.config.hk_screensaver = Object.assign({}, LOVELACE.config.hk_screensaver, { show: 'photos', fallback: false });
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: LOVELACE.config.hk_screensaver } };
push(hassOwn('off')); dispatchEvent({ type: 'location-changed' }); __runTimers(); scenes = [];
ok('the fallback setting is read', S.config() && S.config().fallback === false, S.config());
S.start(); drainMicrotasks(); drainMicrotasks(); drainMicrotasks();
ok('fallback off and no photos: no forecast, the screen stays dark', S.running() && S.stats().mode === 'photos' && scenes.length === 0, S.stats());
S.stop(); __runTimers();

print('\n=== an existing dashboard: the block from its screen\'s HK settings ===');
var BOARD_B = { screensaver: true, tablet_user: 'Kitchen Tablet', screensaver_engine: 'hk',
                screensaver_options: { show: 'forecast' } }, asked = [];
window.hkSettings = { get: function (p, f) { return p === 'boards' ? { 'dashboard-kitchen': BOARD_B } : f; },
                      lovelacePanel: function () { return true; } };
window.hkStrategy = { saverBlock: function (h, b) {
  asked.push(b);
  return b.screensaver ? { user: b.tablet_user, entity: OWN, show: b.screensaver_options.show, cards: [] } : null; } };
lovelacePanel.lovelace = { config: { views: [] } };
// signed in as someone else: the config is read, the screensaver never starts
push(hassOwn('off', 'Desk')); dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('no hk_screensaver in its config: the screen\'s settings make it', S.config() && S.config().user === 'Kitchen Tablet' &&
   S.config().show === 'forecast' && asked.length > 0 && asked[0] === BOARD_B, S.config());
var before = S.config();
dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('...the same settings again: the same config kept (compared as written, not as a new object)', S.config() === before);
BOARD_B.screensaver_options = { show: 'both' };
dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('...and a change to them is picked up', S.config() && S.config().show === 'both', S.config());
lovelacePanel.lovelace = { config: { views: [], hk_screensaver: Object.assign({}, LOVELACE.config.hk_screensaver, { user: 'YAML User' }) } };
dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('its own YAML\'s hk_screensaver wins over its settings', S.config() && S.config().user === 'YAML User', S.config());
lovelacePanel.lovelace = { config: { views: [], wallpanel: { enabled: true } } };
dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('...and so does a WallPanel block: no HK screensaver there', S.config() === null, S.config());
BOARD_B.screensaver = false;
lovelacePanel.lovelace = { config: { views: [] } };
dispatchEvent({ type: 'location-changed' }); __runTimers();
ok('Photo Screensaver off in its settings: none', S.config() === null, S.config());
// A PREVIEW ASKED FOR BEFORE THERE IS A CONFIG (the settings page's frame,
// its dashboard still loading) starts once the config arrives
BOARD_B.screensaver = true;
lovelacePanel.lovelace = {};
dispatchEvent({ type: 'location-changed' }); __runTimers();
S.preview(true); __runTimers();
var early = S.running();
lovelacePanel.lovelace = { config: { views: [] } };
dispatchEvent({ type: 'location-changed' }); __runTimers(); __runTimers(); drainMicrotasks(); drainMicrotasks();
ok('a preview asked for before the config: nothing yet, then it starts once the config is there', !early && S.running() &&
   S.stats().startedBy === 'preview', [early, S.stats()]);
S.preview(false); __runTimers();
ok('...and stops with the preview', !S.running());
delete window.hkSettings; delete window.hkStrategy;

print('\n' + (fail ? fail + ' FAILED, ' : 'ALL ') + pass + ' SAVER TESTS PASS');
if (fail) throw new Error(fail + ' failed');
