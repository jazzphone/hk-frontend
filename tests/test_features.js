// The features' own pages on HK Settings (panels/hk-settings-features.js):
// which show, what each list shows, what search finds. Nothing here may
// depend on one house: every list is built from what the integration answers.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
load(HK_ROOT + '/frontend/panels/hk-settings-features.js');
var F = (typeof window !== 'undefined' ? window : globalThis).hkSettingsFeatures;

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var routes = function (xs) { return xs.map(function (x) { return x[0]; }); };

// ------------------------------------------------------------ which show
ok('a house with none of them: Music only (Browse Music is HK Frontend’s own)', eq(routes(F.listed({})), ['music']));
var feats = { hk_tv: { installed: true, entries: [{ entry_id: 'a' }] }, hk_alarm_pin: { installed: false, entries: [] },
              hk_clean_areas: { installed: true, entries: [] }, hk_music: { installed: false, entries: [] } };
ok('installed ones show, added or not; a missing one does not', eq(routes(F.listed(feats)), ['music', 'tv', 'clean']));
ok('states: added / installed but not added / missing',
   F.stateOf(feats, 'hk_tv') === 'added' && F.stateOf(feats, 'hk_clean_areas') === 'not_added' &&
   F.stateOf(feats, 'hk_alarm_pin') === 'missing' && F.stateOf(undefined, 'hk_tv') === 'missing');
ok('Add is HK Frontend’s own Add feature (every feature is one of its entries)',
   F.addHref('hk_tv') === '/_my_redirect/config_flow_start?domain=hk_frontend' &&
   F.integrationHref('hk_tv') === '/config/integrations/integration/hk_frontend');

// ------------------------------------------------------------ live tv
var tv = { channels: [{ number: '4.1', name: 'NBC' }, { number: '13.1', name: 'ABC' }, { number: '9.9', name: 'Gone' }],
           lineup: [{ number: '4.1', station: 'WXXX-DT', network: 'NBC' }, { number: '4.3', station: 'WXXXCBS', network: 'CBS' },
                    { number: '13.1', station: 'ABC', network: null }, { number: '21.1', station: 'FOX-HD', network: null }] };
var L = F._.tvLists(tv);
ok('Shown: the saved channels in their order, by their own names', eq(L.rows.map(function (r) { return r.label; }), ['NBC', 'ABC', 'Gone']));
ok('...the station under a renamed one, not under one named after it',
   L.rows[0].sub === '4.1 · WXXX-DT' && L.rows[1].sub === '13.1', L.rows);
ok('...a saved channel the tuner no longer has says so', /Not in the lineup/.test(L.rows[2].sub), L.rows[2]);
ok('More: the rest of the lineup, by network when the guide names one',
   eq(L.more.map(function (r) { return [r.value, r.label, r.sub]; }), [['4.3', 'CBS', '4.3 · WXXXCBS'], ['21.1', 'FOX-HD', '21.1']]), L.more);
ok('the count: saved of the lineup', F._.tvCount(tv) === '3 of 4');
ok('...just the saved number when the tuner did not answer', F._.tvCount({ channels: tv.channels, lineup: null }) === '3');
ok('an empty answer is an empty list, not an error', eq(F._.tvLists({}), { rows: [], more: [] }));

// ------------------------------------------------------------ clean by area
var nm = function (id) { return { office: 'Office' }[id] || id; };
ok('a vacuum’s line says what a chosen room does with it',
   F._.vacuumSub({ how: 'map', areas: ['a', 'b'] }, nm) === 'Cleans 2 rooms on its map' &&
   F._.vacuumSub({ how: 'map', areas: ['a'] }, nm) === 'Cleans 1 room on its map' &&
   F._.vacuumSub({ how: 'start', areas: ['office'] }, nm) === 'Starts when Office is chosen' &&
   /no room map/.test(F._.vacuumSub({ how: 'no_map', areas: [] }, nm)));
var cd = { vacuums: [{ vacuum: 'vacuum.a' }, { vacuum: 'vacuum.b' }, { vacuum: 'vacuum.c' }], chosen_vacuums: [] };
ok('every vacuum taking part is stored as [] (a new one joins by itself)', eq(F._.vacuumsAfter(cd, 'vacuum.b', true), []));
ok('unticking one of "every vacuum" keeps the others', eq(F._.vacuumsAfter(cd, 'vacuum.b', false), ['vacuum.a', 'vacuum.c']));
cd.chosen_vacuums = ['vacuum.a', 'vacuum.c'];
ok('ticking the missing one back is every vacuum again', eq(F._.vacuumsAfter(cd, 'vacuum.b', true), []));
cd.chosen_vacuums = ['vacuum.a'];
ok('the last one cannot be unticked (none would be every vacuum)', F._.vacuumsAfter(cd, 'vacuum.a', false) === null);
cd.chosen_vacuums = ['vacuum.gone', 'vacuum.a'];
ok('a chosen vacuum the house no longer has is dropped', eq(F._.vacuumsAfter(cd, 'vacuum.b', true), ['vacuum.a', 'vacuum.b']));
var rd = { areas: [{ id: 'kitchen', name: 'Kitchen', floor: 'Main', level: 0, by: ['Down'] }, { id: 'loft', name: 'Loft', floor: 'Up', level: 1, by: ['Up', 'Down'] },
                   { id: 'den', name: 'Den', floor: null, by: [] }],
           chosen_areas: [], offered: ['loft', 'den', 'kitchen'] };
var RL = F._.roomLists(rd);
ok('Rooms, automatic: every room offered, floor by floor (no floor last), with its floor and who reaches it',
   RL.auto && eq(RL.rows.map(function (r) { return [r.label, r.sub]; }), [['Kitchen', 'Main · Down'], ['Loft', 'Up · Up, Down'], ['Den', null]]) && !RL.more.length, RL);
ok('...counted as Automatic', F._.roomCount(rd) === 'Automatic · 3');
rd.chosen_areas = ['loft']; rd.offered = ['loft'];
RL = F._.roomLists(rd);
ok('chosen by hand: the chosen ones shown, the rest a vacuum reaches under More',
   !RL.auto && eq(RL.rows.map(function (r) { return r.value; }), ['loft']) && eq(RL.more.map(function (r) { return r.value; }), ['kitchen', 'den']));
ok('...counted of the reachable', F._.roomCount(rd) === '1 of 3');

// ------------------------------------------------------------ music
var md = { speakers: [{ entity: 'media_player.k', name: 'Kitchen', floor: 'Main', player: 'Kitchen HomePod' },
                      { entity: 'media_player.o', name: 'Office', floor: null, player: 'Office' }],
           presets: [{ id: 'p1', name: 'Everywhere', group: 'media_player.all', members: ['media_player.k', 'media_player.o'] }],
           players: [{ entity: 'media_player.k', name: 'Kitchen HomePod' }, { entity: 'media_player.o', name: 'Office' },
                     { entity: 'media_player.all', name: 'All HomePods' }, { entity: 'media_player.den', name: 'Den HomePod' }] };
var SL = F._.speakerLists(md);
ok('Speakers: in their order, named by area, the player’s own name under it when different',
   eq(SL.rows.map(function (r) { return [r.value, r.label, r.sub]; }),
      [['media_player.k', 'Kitchen', 'Main · Kitchen HomePod'], ['media_player.o', 'Office', null]]), SL.rows);
ok('...More: the other players, never a preset’s sync group', eq(SL.more.map(function (r) { return r.value; }), ['media_player.den']));
ok('a room is named by its speaker’s area, else the player’s name, else its id',
   F._.speakerName(md, 'media_player.k') === 'Kitchen' && F._.speakerName(md, 'media_player.den') === 'Den HomePod' &&
   F._.speakerName(md, 'media_player.x') === 'media_player.x');
ok('a playlist’s line: its chooser and how many it plays',
   F._.playlistSub({ items: ['a'], chooser: 'Decades' }) === 'In Decades · 1 playlist' && F._.playlistSub({ items: ['a', 'b'] }) === '2 playlists');

// ------------------------------------------------------------ search
var s = F.search(feats);
ok('search finds an installed feature’s settings', s.some(function (e) { return e.label === 'Channels' && e.route === 'features/tv/channels' && e.where === 'Live TV'; }));
ok('...and nothing of a missing one', !s.some(function (e) { return e.where === 'Alarm PIN'; }));
var s2 = F.search({ hk_alarm_pin: { installed: true, entries: [{}] }, hk_clean_areas: { installed: true, entries: [] } });
ok('Alarm PIN and Clean by Area are found when installed (added or not)',
   s2.some(function (e) { return e.label === 'Change PIN' && e.route === 'features/alarm'; }) &&
   s2.some(function (e) { return e.label === 'Rooms' && e.route === 'features/clean/rooms'; }));

print('\n' + (fail ? 'FAIL ' + fail + ' of ' + (pass + fail) : 'ALL ' + pass + ' FEATURES TESTS PASS'));
if (fail) throw new Error(fail + ' failed');
