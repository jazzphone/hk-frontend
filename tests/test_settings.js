// hk-settings.js: the fallbacks a house with nothing configured gets, and
// the cache/change plumbing every page relies on.
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/frontend/modules/hk-settings.js');
var HS = window.hkSettings;
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
function st(v) { return { state: String(v), attributes: {} }; }

print('=== defaults: nothing configured ===');
ok('weather: the first weather entity, sorted', HS.weatherId({ 'weather.zz': st('x'), 'weather.aa': st('y'), 'sun.sun': st('z') }) === 'weather.aa');
ok('weather: none at all is null', HS.weatherId({}) === null);
var ck = HS.clock({});
ok('clock without Time & Date sensors uses the screen clock', /^\d\d:\d\d$/.test(ck.time) && /^\d{4}-\d\d-\d\d$/.test(ck.date), ck);
ok('clock with the sensors reads them', HS.clock({ 'sensor.time': st('07:05'), 'sensor.date': st('2026-01-02') }).time === '07:05');
// Known new moons and full moons (UTC): the computed phase lands within a day.
function near(a, b) { var d = Math.abs(a - b); return Math.min(d, 1 - d) < 1 / 29.5; }
ok('new moon 2026-01-18 is ~0', near(HS.moon({}, new Date(Date.UTC(2026, 0, 18, 19, 52))), 0), HS.moon({}, new Date(Date.UTC(2026, 0, 18, 19, 52))));
ok('full moon 2026-03-03 is ~0.5', near(HS.moon({}, new Date(Date.UTC(2026, 2, 3, 11, 38))), 0.5), HS.moon({}, new Date(Date.UTC(2026, 2, 3, 11, 38))));
ok('seasonal gate: absent means on', HS.seasonalOn({}) === true);
// Browse Music before the integration answers: its five Discover rows, as the
// queries a library card runs -- a generated dashboard's page has no YAML
// rows of its own.
ok('browse: the five default Discover rows, in order',
   HS.get('browse.discover').map(function (r) { return r.title; }).join('|') ===
   'Recently played|Favorite playlists|Most played|Recently added|Favorite radio');
ok('browse: nothing left out by default', HS.get('browse.hide').length === 0);

print('\n=== computed holiday seasons (the built-in windows) ===');
function s(y, m, d) { return HS.seasonName({}, new Date(y, m - 1, d, 12)); }
ok('Sep 21 is nothing', s(2026, 9, 21) === '');
ok('Sep 22 starts Halloween', s(2026, 9, 22) === 'Halloween');
ok('Oct 31 is Halloween', s(2026, 10, 31) === 'Halloween');
ok('Nov 1 starts Thanksgiving', s(2026, 11, 1) === 'Thanksgiving');
ok('Thanksgiving Day 2026 (Nov 26) is Thanksgiving', s(2026, 11, 26) === 'Thanksgiving');
// The Christmas SKY window is Dec 7..25: the garland is eligible only from
// Dec 7, so the weeks after Thanksgiving are no season for it.
ok('the day after Thanksgiving is no season for the sky', s(2026, 11, 27) === '');
ok('Christmas starts Dec 7', s(2026, 12, 6) === '' && s(2026, 12, 7) === 'Christmas');
ok('Thanksgiving 2027 is Nov 25', s(2027, 11, 25) === 'Thanksgiving' && s(2027, 11, 26) === '');
ok('Dec 25 is Christmas', s(2026, 12, 25) === 'Christmas');
ok('Dec 26 is nothing', s(2026, 12, 26) === '');

print('\n=== the server answer ===');
var seen = 0, woke = 0;
HS.onChange(function () { seen++; });
window.addEventListener('hk-module-ready', function (e) { if (e.detail && e.detail.module === 'hk-settings') woke++; });
var v0 = HS.version;
HS._apply({ configured: true, weather: { entity: 'weather.home', place: 'HOME' }, sky: { moon: 'sensor.moon' },
            clock: { time: null, date: null } });
ok('a change bumps the version, calls listeners and wakes the cards', HS.version === v0 + 1 && seen === 1 && woke === 1);
ok('the chosen weather entity wins, even if missing', HS.weatherId({ 'weather.aa': st('x') }) === 'weather.home');
ok('a chosen moon sensor is read', HS.moon({ 'sensor.moon': st('0.25') }) === 0.25);
ok('a chosen but unavailable moon sensor is 0.5', HS.moon({ 'sensor.moon': st('unavailable') }) === 0.5);
ok('a cleared clock sensor falls back to the screen', /^\d\d:\d\d$/.test(HS.clock({ 'sensor.time': st('99:99') }).time));
ok('unset sections keep their defaults', JSON.stringify(HS.get('security.locks')) === '[]');
HS._apply({ configured: true, weather: { entity: 'weather.home', place: 'HOME' }, sky: { moon: 'sensor.moon' },
            clock: { time: null, date: null } });
ok('the same answer again is not a change', HS.version === v0 + 1 && seen === 1);
ok('the answer is cached for the next page load', JSON.parse(localStorage.getItem('hk_settings')).weather.entity === 'weather.home');
ok('unknown keys are ignored', (HS._apply({ weather: { nonsense: 1 } }), HS.get('weather.nonsense')) === undefined);
// the dashboard items arrive whole, keyed by the dashboards' own url paths
// THE HOUSE'S CUSTOM CHIPS and PAGES arrive whole (a merge that dropped the
// chips would leave a screen that lists one drawing nothing)
HS._apply({ configured: true, custom_chips: [{ key: 'battery', name: 'Battery', after: 'end', card: { type: 'custom:hk-status-chip-card' } }],
            custom_pages: [{ path: 'energy', title: 'Energy', view: { cards: [] } }] });
ok('custom chips reach the screens', JSON.stringify(HS.get('custom_chips', null).map(function (c) { return c.key; })) === '["battery"]');
ok('...and custom pages', HS.get('custom_pages', [])[0].path === 'energy');
HS._apply({ configured: true });
ok('...none when the house has none', HS.get('custom_chips', null).length === 0);
// THE FEATURES ADDED: a card offers a feature only when it is added.
HS._apply({ configured: true, added: ['clean_areas', 'music', 5] });
ok('the added features reach the screens', JSON.stringify(HS.get('added', null)) === '["clean_areas","music"]');
HS._apply({ configured: true });
ok('...none added: an empty list', JSON.stringify(HS.get('added', null)) === '[]');
// THE ENERGY PAGE'S PLAN reaches the screens whole; none without the feature
HS._apply({ configured: true, added: ['energy'], energy: { title: 'Energy', sections: [{ id: 'rooms', items: [] }] } });
ok('the Energy page\'s plan reaches the screens', HS.get('energy.title', null) === 'Energy' && HS.get('energy.sections', []).length === 1);
HS._apply({ configured: true });
ok('...none without Energy', HS.get('energy', 'none') === 'none');
HS._apply({ configured: true, boards: { 'dashboard-hall': { menu: 'open', time_weather: 'menu' } } });
ok('the dashboard items are kept whole', HS.get('boards.dashboard-hall.menu') === 'open' &&
   HS.get('boards.dashboard-hall.time_weather') === 'menu');
HS._apply({ configured: true });
ok('...and none is an empty map, never a leftover', JSON.stringify(HS.get('boards', null)) === '{}');
HS._apply({ configured: true, boards: ['dashboard-hall'] });
ok('a list where the map should be is not taken', JSON.stringify(HS.get('boards', null)) === '{}');

print('\n=== seasonal themes: Christmas start, themes off ===');
HS._apply({ configured: true, sky: { christmas_from: '12-01' } });
ok('Christmas from 12-01: Nov 27 is not Christmas yet', s(2026, 11, 27) === '');
ok('...Dec 1 is', s(2026, 12, 1) === 'Christmas');
ok('...and Thanksgiving still runs to its day', s(2026, 11, 26) === 'Thanksgiving');
HS._apply({ configured: true, sky: { christmas_from: '11-15' } });
ok('a start before Thanksgiving wins over it', s(2026, 11, 20) === 'Christmas');
HS._apply({ configured: true, sky: { themes: ['christmas', 'birthday'] } });
ok('themeOn follows the list', HS.themeOn('christmas') && !HS.themeOn('thanksgiving'));
HS._apply({ configured: true });
ok('with no list, every theme is on', HS.themeOn('space-night') && HS.themeOn('halloween'));

print('\n=== the header counts a garage COVER, and a moving one is not shut ===');
load(HK_ROOT + '/frontend/modules/hk-header.js');
HS._apply({ configured: true, security: { alarm: 'alarm_control_panel.a', garage: ['cover.garage'],
            doors: ['binary_sensor.garage_entry'], locks: [], windows: [] } });
function sec(g, d) {
  return window.hkHeader.status({ 'alarm_control_panel.a': st('armed_away'), 'cover.garage': st(g),
                                  'binary_sensor.garage_entry': st(d) });
}
ok('closed cover + shut entry door: Home Secured', sec('closed', 'off').secured === true);
ok('an open cover says Garage Open', sec('open', 'off').items.indexOf('Garage Open') >= 0);
ok('a cover still OPENING is not secured', sec('opening', 'off').secured === false && sec('opening', 'off').garageOpen);
ok('a cover CLOSING is not secured either', sec('closing', 'off').secured === false);
ok('the entry door is a DOOR, not the garage', JSON.stringify(sec('closed', 'on').items) === '["1 Door Open"]', sec('closed', 'on').items);

print('\n=== the Seasonal decorations switch ===');
HS._apply({ configured: true, sky: { decorations: false } });
ok('the switch off: no decoration, whatever else says', HS.seasonalOn({}) === false);
HS._apply({ configured: true, sky: { decorations: true, seasonal: 'input_boolean.extra' } });
ok('on, with an extra gate that is off: none', HS.seasonalOn({ 'input_boolean.extra': st('off') }) === false);
ok('on, with the extra gate on: decorations', HS.seasonalOn({ 'input_boolean.extra': st('on') }) === true);
HS._apply({ configured: true });
ok('by default: decorations', HS.seasonalOn({}) === true);

print('\n=== each screen\'s own strength of the same look, across a navigation ===');
if (!document.documentElement) document.documentElement = document.createElement('html');
location.pathname = '/dashboard-a/home';
HS._apply({ configured: true, look: { glass: 'blur', blur: 50 },
  boards: { 'dashboard-a': { blur: 10 }, 'dashboard-b': { blur: 90 } } });
var rs = document.documentElement.style;
ok('screen A: its own blur (10 -> 4 px)', /blur\(4px\)/.test(rs['--hk-blur-filter'] || ''), rs['--hk-blur-filter']);
location.pathname = '/dashboard-b/home';
dispatchEvent(new CustomEvent('location-changed'));
ok('...then screen B, the same look at its own 90: 36 px (it kept A\'s 4 px)',
   /blur\(36px\)/.test(rs['--hk-blur-filter'] || ''), rs['--hk-blur-filter']);
HS._apply({ configured: true });


HS._apply({ sky: {} });
ok('existing users retain Old Decorations', HS.skyLook().decorationStyle === 'old');
location.pathname = '/dashboard-sky/home';
HS._apply({sky:{decoration_style:'new'},boards:{'dashboard-sky':{sky_decoration_style:'old'}}});
ok('screen keeps old style while house uses new', HS.skyLook().decorationStyle === 'old');
HS._apply({sky:{decoration_style:'old'},boards:{'dashboard-sky':{sky_decoration_style:'new'}}});
ok('screen can opt into new style independently', HS.skyLook().decorationStyle === 'new');
HS._apply({sky:{decoration_style:'new'},boards:{'dashboard-sky':{sky_decoration_style:null}}});
ok('reset style follows All Screens', HS.skyLook().decorationStyle === 'new');
print('=== Sky / Background inheritance ===');
location.pathname = '/dashboard-sky/home';
var houseStops = { day: ['#123456', '#223344', '#334455', '#445566'], night: ['#010203', '#020304', '#030405', '#040506'] };
var ownStops = { day: ['#555555', '#444444', '#333333', '#222222'], night: ['#111111', '#222222', '#333333', '#444444'] };
HS._apply({ sky: { animations: false, weather: false, decorations: false, gradient: 'custom', gradient_custom: houseStops },
            boards: { 'dashboard-sky': { sky_gradient: null, sky_custom: ownStops } } });
var sl = HS.skyLook();
ok('following uses all house flags and house custom colors, even with a stored own draft',
   !sl.animations && !sl.weather && !sl.decorations && JSON.stringify(sl.backdrop) === JSON.stringify(houseStops));
HS._apply({ sky: { decorations: false, gradient: 'dusk' }, boards: { 'dashboard-sky': {
  sky_animations: false, sky_weather: false, sky_decorations: true, sky_gradient: 'live' } } });
sl = HS.skyLook();
ok('own Live overrides a fixed house backdrop', sl.backdrop === null);
ok('own decorations on overrides house off through the seasonal gate', sl.decorations && HS.seasonalOn({}));
HS._apply({ sky: { seasonal: 'input_boolean.extra', decorations: false },
            boards: { 'dashboard-sky': { sky_decorations: true, sky_gradient: 'custom', sky_custom: ownStops } } });
ok('own custom colors resolve', JSON.stringify(HS.skyLook().backdrop) === JSON.stringify(ownStops));
ok('the extra seasonal gate still applies to an own decorations override', !HS.seasonalOn({ 'input_boolean.extra': st('off') }));
HS._apply({ sky: { gradient: 'fjord' }, boards: { 'dashboard-sky': { sky_gradient: null } } });
ok('curated backdrop matches the published palette', JSON.stringify(HS.skyLook().backdrop.day) === JSON.stringify(HS.skyPalettes().filter(function(p) { return p.id === 'fjord'; })[0].day));
location.pathname = '/dashboard-other/home';
ok('moving to another dashboard uses that dashboard settings', HS.skyLook().animations === true);
HS._apply({ sky: { gradient: 'custom', gradient_custom: null } });
ok('unset custom stops fall back to live', HS.skyLook().backdrop === null);
HS._apply({ sky: { gradient: 'bad' } });
ok('unknown persisted palette falls back to live', HS.skyLook().backdrop === null);
HS._apply({ configured: true });
location.pathname = '/';

print('\n=== a subscription that survives ===');
function settle() { var p = Promise.resolve(); for (var i = 0; i < 6; i++) p = p.then(function () {}); return p; }
var calls = [], readyL = [], unsubs = 0;
var fake = {
  subscribeMessage: function (cb, msg, opts) {
    calls.push({ cb: cb, msg: msg, opts: opts });
    // The first answer is what a page gets while Home Assistant is starting.
    if (calls.length === 1) return Promise.reject({ code: 'unknown_command', message: 'Unknown command.' });
    return Promise.resolve(function () { unsubs++; });
  },
  addEventListener: function (t, f) { if (t === 'ready') readyL.push(f); },
  removeEventListener: function (t, f) { readyL = readyL.filter(function (x) { return x !== f; }); }
};
var got = [];
var endSub = HS.subscribe(fake, { type: 'hk_frontend/settings/subscribe' }, function (ev) { got.push(ev); }, 'test');
settle().then(function () {
  ok('the first attempt was refused', calls.length === 1);
  ok('home-assistant-js-websocket is not left to resubscribe', calls[0].opts && calls[0].opts.resubscribe === false);
  __runTimers();                                          // the backoff elapses
  return settle();
}).then(function () {
  ok('a refused subscribe is retried', calls.length === 2, calls.length);
  calls[1].cb({ n: 1 });
  ok('...and its events arrive', got.length === 1 && got[0].n === 1);
  readyL.forEach(function (f) { f(); });                  // Home Assistant restarted
  return settle();
}).then(function () {
  ok('a reconnect subscribes again', calls.length === 3, calls.length);
  calls[1].cb({ n: 'stale' });
  ok('the old subscription is ignored', got.length === 1);
  calls[2].cb({ n: 2 });
  ok('the new one delivers', got.length === 2 && got[1].n === 2);
  endSub();
  ok('ending it unsubscribes', unsubs === 1, unsubs);
  ok('...and stops listening for reconnects', readyL.length === 0);
  return HS.whenLive(10);
}).then(function (live) {
  ok('whenLive: the answer is in', live === true && HS.configured === true);
  print(fail ? 'FAIL ' + fail + ' SETTINGS TESTS' : 'ALL ' + pass + ' SETTINGS TESTS PASS');
  if (fail) throw new Error('settings tests failed');
});
