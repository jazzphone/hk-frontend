// The HK Settings page's decisions (panels/hk-settings-model.js): what each
// list shows and what a change to it SAVES, how a screen value says it
// follows All Screens, the menu's three modes, the sky's dates, search. The
// page draws; this is what it draws from.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
load(HK_ROOT + '/frontend/panels/hk-settings-model.js');
var M = (typeof window !== 'undefined' ? window : globalThis).hkSettingsModel;

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var KINDS = ['weather_alert', 'security', 'doors_windows', 'climate', 'lights', 'blinds', 'timers', 'vacuums',
             'speakers', 'water', 'energy'];

// ------------------------------------------------------------ chips
var m = M.chipsModel({ chips: [], chips_extra: ['sensor.mail'], chips_quiet: ['water'] }, KINDS);
ok('chips: nothing saved is automatic -- every kind, own chips after', m.auto && eq(m.rows.map(function (r) { return r.value; }), KINDS.concat('sensor.mail')));
ok('...quiet is per chip, own chips are never quiet', m.rows[9].quiet === true && m.rows[11].own && !m.rows[11].quiet);
ok('...nothing to add while automatic', m.more.length === 0);
m = M.chipsModel({ chips: ['lights', 'sensor.mail', 'security'], chips_extra: ['sensor.mail', 'sensor.battery'] }, KINDS);
ok('chips: a set list is its order, then own chips not placed yet', !m.auto &&
   eq(m.rows.map(function (r) { return r.value; }), ['lights', 'sensor.mail', 'security', 'sensor.battery']));
ok('...More is the kinds not shown', m.more.length === 9 && m.more[0].value === 'weather_alert');
m = M.chipsModel({ chips: ['lights', 'sensor.gone'], chips_extra: [] }, KINDS);
ok('chips: an entity in the order that is no longer an own chip is dropped', eq(m.rows.map(function (r) { return r.value; }), ['lights']));
ok('chips: the Shown list saves as the order, own chips as chips_extra',
   eq(M.chipsSave(['security', 'sensor.mail', 'lights'], KINDS), { chips_extra: ['sensor.mail'], chips_custom: [], chips: ['security', 'sensor.mail', 'lights'] }));
// CUSTOM CHIPS
var LIB = [{ key: 'mail', name: 'Mail', after: 'weather_alert' }, { key: 'battery', name: 'House Battery', after: 'end' }];
m = M.chipsModel({ chips: [], chips_extra: [], chips_custom: ['mail', 'battery'] }, KINDS, LIB);
ok('custom chips: listed where they sit, automatic still', m.auto &&
   eq(m.rows.map(function (r) { return r.value; }), [KINDS[0], 'chip:mail'].concat(KINDS.slice(1), ['chip:battery'])) &&
   m.rows[1].custom && m.rows[1].name === 'Mail', m.rows.map(function (r) { return r.value; }));
ok('...the automatic order saved is automatic still (and says which)',
   eq(M.chipsSave(m.rows.map(function (r) { return r.value; }), KINDS, LIB), { chips_extra: [], chips_custom: ['mail', 'battery'], chips: [] }));
var moved = m.rows.map(function (r) { return r.value; }).filter(function (v) { return v !== 'chip:battery'; });
moved.splice(3, 0, 'chip:battery');
ok('...moved: saved as an order that places it', M.chipsSave(moved, KINDS, LIB).chips[3] === 'chip:battery');
m = M.chipsModel({ chips: [], chips_extra: [], chips_custom: ['mail'] }, KINDS, LIB);
ok('...one not shown is offered under More, even while automatic', m.more.length === 1 && m.more[0].value === 'chip:battery');
ok('...added: only which changes', eq(M.chipsAddCustom({ chips_custom: ['mail'] }, 'battery'), { chips_custom: ['mail', 'battery'] }));
ok('...removed: from which, and from the order', eq(M.chipsRemoveCustom({ chips_custom: ['mail', 'battery'], chips: ['lights', 'chip:battery'] }, 'battery'),
   { chips_custom: ['mail'], chips: ['lights'] }));
m = M.chipsModel({ chips: ['lights', 'chip:gone'], chips_extra: [], chips_custom: ['gone'] }, KINDS, LIB);
ok('...one the library no longer has is not listed', m.rows.every(function (r) { return r.value !== 'chip:gone'; }));
ok('chips: an own chip added while automatic stays automatic',
   eq(M.chipsAddOwn({ chips: [], chips_extra: [] }, 'sensor.mail'), { chips_extra: ['sensor.mail'], chips: [] }));
ok('...and while set joins the end of the order',
   eq(M.chipsAddOwn({ chips: ['lights'], chips_extra: [] }, 'sensor.mail'), { chips_extra: ['sensor.mail'], chips: ['lights', 'sensor.mail'] }));
ok('chips: an own chip removed leaves both lists',
   eq(M.chipsRemoveOwn({ chips: ['lights', 'sensor.mail'], chips_extra: ['sensor.mail'] }, 'sensor.mail'), { chips_extra: [], chips: ['lights'] }));
ok('chips: quiet on and off', eq(M.chipQuiet({ chips_quiet: ['water'] }, 'lights', true), { chips_quiet: ['water', 'lights'] }) &&
   eq(M.chipQuiet({ chips_quiet: ['water', 'lights'] }, 'water', false), { chips_quiet: ['lights'] }));

// ------------------------------------------------------------ scenes
var SP = ['weather', 'cameras', 'live_tv', 'music'];
m = M.scenesModel({ scenes: [], scenes_pages: ['live_tv'] }, ['scene.a', 'scene.b'], SP);
ok('scenes: automatic is every scene, then the page pills', m.auto && eq(m.rows.map(function (r) { return r.value; }), ['scene.a', 'scene.b', 'page:live_tv']));
ok('...More offers the other pages as pills', eq(m.more.map(function (r) { return r.page; }), ['weather', 'cameras', 'music']));
m = M.scenesModel({ scenes: ['page:music', 'scene.b', 'page:weather'], scenes_pages: ['music', 'live_tv'] }, [], SP);
ok('scenes: a placed pill whose page is not a pill any more is dropped; an unplaced pill joins the end',
   eq(m.rows.map(function (r) { return r.value; }), ['page:music', 'scene.b', 'page:live_tv']));
ok('scenes: saving says which pages are pills',
   eq(M.scenesSave(['scene.b', 'page:cameras']), { scenes: ['scene.b', 'page:cameras'], scenes_pages: ['cameras'] }));
ok('scenes: a pill while automatic changes only scenes_pages',
   eq(M.scenesPagePill({ scenes: [], scenes_pages: [] }, 'music', true), { scenes_pages: ['music'] }));
ok('...and while set is placed at the end / taken out',
   eq(M.scenesPagePill({ scenes: ['scene.a'], scenes_pages: [] }, 'music', true), { scenes_pages: ['music'], scenes: ['scene.a', 'page:music'] }) &&
   eq(M.scenesPagePill({ scenes: ['page:music', 'scene.a'], scenes_pages: ['music'] }, 'music', false), { scenes_pages: [], scenes: ['scene.a'] }));

// ------------------------------------------------------------ pages
var PO = ['weather', 'cameras', 'music', 'browse', 'lights', 'rooms'];
var CUSTOM = { energy: 'Energy', ecoflow: 'EcoFlow' };
m = M.pagesModel({ pages: [], custom_pages: ['energy'] }, PO, CUSTOM);
ok('pages: automatic is every kind with this screen’s custom pages before the rooms',
   m.auto && eq(m.rows.map(function (r) { return r.value; }), ['weather', 'cameras', 'music', 'browse', 'lights', 'energy', 'rooms']));
ok('...Browse Music is fixed, a custom page is marked', m.rows[3].fixed && m.rows[5].custom);
ok('...More is the custom pages not shown', eq(m.more.map(function (r) { return r.value; }), ['ecoflow']));
m = M.pagesModel({ pages: ['lights', 'music', 'weather'], custom_pages: ['ecoflow'] }, PO, CUSTOM);
ok('pages: a set order; Browse follows Play Music; a shown custom page goes before the rooms (or last)',
   eq(m.rows.map(function (r) { return r.value; }), ['lights', 'music', 'browse', 'weather', 'ecoflow']));
ok('pages: saving keeps Browse only with Play Music, and says which custom pages',
   eq(M.pagesSave(['browse', 'lights', 'energy'], CUSTOM), { pages: ['lights', 'energy'], custom_pages: ['energy'] }) &&
   eq(M.pagesSave(['music', 'lights'], CUSTOM), { pages: ['music', 'browse', 'lights'], custom_pages: [] }));
ok('pages: a custom page while automatic changes only custom_pages',
   eq(M.pagesCustom({ pages: [], custom_pages: [] }, 'energy', true), { custom_pages: ['energy'] }));
ok('...and while set is placed before the rooms',
   eq(M.pagesCustom({ pages: ['lights', 'rooms'], custom_pages: [] }, 'energy', true), { custom_pages: ['energy'], pages: ['lights', 'energy', 'rooms'] }));

// ------------------------------------------------------------ where in the menu
var KEYS = ['weather', 'security', 'lights', 'music', 'browse', 'water', 'energy', 'rooms'];
var CUS = { energy: 'Energy' };
var IT = M.menuItems(KEYS, CUS);
var byPath = function (p) { return IT.filter(function (x) { return x.path === p; })[0]; };
ok('menu items: the pages a generated screen places (not Browse Music, not rooms), by view path',
   IT.map(function (x) { return x.path; }).join() === 'weather,security,lights,playmusic,water,energy');
ok('automatic: Weather at the top, every other page under Categories',
   M.placeOf({}, byPath('weather'), IT) === 'top' && M.placeOf({}, byPath('water'), IT) === 'list' &&
   M.placeOf({}, byPath('energy'), IT) === 'list');
ok('a set list: by view path (Play Music is playmusic)',
   M.placeOf({ categories: ['playmusic'] }, byPath('playmusic'), IT) === 'list' &&
   M.placeOf({ categories: ['playmusic'] }, byPath('lights'), IT) === 'off');
ok('Not in Menu from automatic: the others listed, in page order',
   eq(M.placeSet({}, IT, 'water', 'off'), { menu_top: [], categories: ['security', 'lights', 'playmusic', 'energy'] }));
ok('...and back: automatic again (follows new pages)',
   eq(M.placeSet({ categories: ['security', 'lights', 'playmusic', 'energy'] }, IT, 'water', 'list'), { menu_top: [], categories: [] }));
ok('EcoFlow-style: a custom page to the top; the rest stay automatic',
   eq(M.placeSet({}, IT, 'energy', 'top'), { menu_top: ['weather', 'energy'], categories: [] }));
var wDown = M.placeSet({}, IT, 'weather', 'list');
ok('Weather down among the categories: nothing at the top ("-", not empty -- empty is the defaults)',
   eq(wDown, { menu_top: ['-'], categories: [] }), wDown);
ok('...and it reads back that way', M.placeOf(wDown, byPath('weather'), IT) === 'list');
ok('...back up: the defaults again', eq(M.placeSet(wDown, IT, 'weather', 'top'), { menu_top: [], categories: [] }));
ok('a stale path (Browse Music, a page no longer here) is dropped',
   eq(M.placeSet({ categories: ['security', 'music-browse', 'vacuums'] }, IT, 'lights', 'list'), { menu_top: [], categories: ['security', 'lights'] }));
ok('the last page cannot leave Categories (empty means every page)',
   M.placeSet({ categories: ['security'] }, IT, 'security', 'off') === null);
ok('narrow labels', M.narrowLabel('chip_scroll') === 'Chip, Then Tab' && M.narrowLabel(undefined) === 'Chip');

// ------------------------------------------------------------ rooms
var AZ = ['attic', 'garage', 'kitchen'];
m = M.roomsModel({ room_order: [], home_rooms: 'as_is' }, AZ);
ok('rooms: automatic is every room, A to Z', m.auto && m.rows.length === 3 && !m.more.length);
m = M.roomsModel({ room_order: ['kitchen', 'attic'], home_rooms: 'only' }, AZ);
ok('rooms: "only" shows the listed rooms on Home, the rest under Not on Home',
   eq(m.rows.map(function (r) { return r.value; }), ['kitchen', 'attic']) && eq(m.more.map(function (r) { return r.value; }), ['garage']));
m = M.roomsModel({ room_order: ['kitchen'], home_rooms: 'order' }, AZ);
ok('rooms: "order" shows every room, the listed ones first', eq(m.rows.map(function (r) { return r.value; }), ['kitchen', 'attic', 'garage']));
ok('rooms: saving all is "order", fewer is "only"',
   eq(M.roomsSave(['garage', 'attic', 'kitchen'], AZ), { room_order: ['garage', 'attic', 'kitchen'], home_rooms: 'order' }) &&
   eq(M.roomsSave(['garage'], AZ), { room_order: ['garage'], home_rooms: 'only' }));
ok('rooms: back to automatic', eq(M.roomsAuto(), { room_order: [], home_rooms: 'as_is' }));

// ------------------------------------------------------------ cameras
var cams = M.autoCameras(['camera.door_high', 'camera.door_low', 'camera.yard'], function (id) { return /door/.test(id) ? 'd1' : 'd2'; });
ok('cameras: automatic is one per device, its low channel', eq(cams, ['camera.door_low', 'camera.yard']));
m = M.camerasModel({ cameras: ['camera.yard', 'camera.gone'] }, ['camera.door_low', 'camera.yard'], cams);
ok('cameras: a set list drops cameras that are gone; More is the rest', !m.auto && m.rows.length === 1 && m.more[0].value === 'camera.door_low');

// ------------------------------------------------------------ menu
ok('menu: three modes', M.menuMode({ menu: 'off' }) === 'off' && M.menuMode({ menu: 'open' }) === 'open' && M.menuMode({ menu: 'chip_home' }) === 'button');
ok('menu: Button keeps its style; from off/open it starts Automatic (or the last one)',
   M.menuFor('button', { menu: 'tab' }) === 'tab' && M.menuFor('button', { menu: 'off' }) === 'auto' && M.menuFor('button', { menu: 'open' }, 'chip') === 'chip');
ok('menu: Tab Position only for styles that can show the tab',
   M.showsTab({ menu: 'chip_scroll' }) && M.showsTab({ menu: 'auto' }) && !M.showsTab({ menu: 'chip' }) && !M.showsTab({ menu: 'open' }));

// ------------------------------------------------------------ glass
var g = M.glassOf({ glass: 'house' }, { glass: 'blur' });
ok('glass: "house" follows All Screens and says what that is', !g.own && g.effective === 'blur' && g.house === 'blur');
g = M.glassOf({ glass: 'frosted' }, { glass: 'blur' });
ok('glass: its own', g.own && g.effective === 'frosted');
var a = M.amountOf({ frost: null }, { frost: 30 }, 'frost');
ok('amounts: null follows All Screens’', !a.own && a.value === 30);
a = M.amountOf({ blur: 0 }, { blur: 50 }, 'blur');
ok('amounts: 0 is a value of its own, not "follow"', a.own && a.value === 0);
ok('amounts: only the one the glass uses is shown', eq(M.amountsFor('frosted'), { frost: true, blur: false }) &&
   eq(M.amountsFor('blur_each'), { frost: false, blur: true }) && eq(M.amountsFor('clear'), { frost: false, blur: false }));

// ------------------------------------------------------------ sky
var BI = { halloween: { north: ['09-22', '10-31'], south: ['09-22', '10-31'] }, spring: { north: ['03-20', '06-20'], south: ['09-22', '12-20'] } };
var d = M.skyDate({ halloween_from: null, hemisphere: 'north' }, BI, 'halloween', 'from');
ok('sky: an unsaved date is the built-in one', !d.own && d.value === '09-22');
d = M.skyDate({ spring_to: null, hemisphere: 'south' }, BI, 'spring', 'to');
ok('sky: the southern hemisphere’s built-in date', d.value === '12-20');
ok('sky: dates read as words', M.dateLabel('10-31') === 'Oct 31' && M.dateLabel('thanksgiving') === 'Thanksgiving Day');

// ------------------------------------------------------------ search, errors
var r = M.search('glass', [{ path: 'dashboard-kitchen', title: 'Kitchen' }]);
ok('search: a screen setting is found once per screen, a house one once',
   r.some(function (x) { return x.route === 'screens/dashboard-kitchen/glass' && x.where === 'Kitchen'; }) &&
   r.some(function (x) { return x.route === 'house/appearance/glass'; }));
var hp = M.search('home page', [{ path: 'energy-tablet', title: 'Energy' }]).filter(function (x) { return x.label === 'Home Page' || /home_page|Home Page/.test(JSON.stringify(x)); });
ok('search: Home Page opens the screen\'s own Pages page (not the house\'s Custom Pages)',
   hp.length > 0 && hp.every(function (x) { return x.route === 'screens/energy-tablet/pages'; }), hp);
ok('search: every word must match', M.search('wall photos', []).length === 1 && M.search('zzz', []).length === 0);
ok('errors: a refusal map is read from the message', eq(M.refusals({ message: '{"look.glass":"choice"}' }), { 'look.glass': 'choice' }) &&
   M.refusals({ message: 'Unknown command' }) === null && /isn’t one of/.test(M.errorText('choice')));
ok('reorder', eq(M.move(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']) && eq(M.move(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']));

// LIVE CAMERA FOLLOWS: the option each camera needs, the sensor it follows,
// and the automation written for them
var CAMS = [
  { entity: 'camera.front_door_low', name: 'Front Door Low resolution channel', device: 'd1', deviceName: 'Front Door' },
  { entity: 'camera.deck_low', name: 'Deck Low resolution channel', device: 'd2', deviceName: 'Deck' },
  { entity: 'camera.porch', name: 'Porch Cam', device: 'd3', deviceName: 'Doorbell 2' },
  { entity: 'camera.garage', name: 'Garage', device: null, deviceName: null }];
var SENS = [{ entity: 'binary_sensor.front_door_motion', device: 'd1', kind: 'motion' },
            { entity: 'binary_sensor.front_door_person_detected', device: 'd1', kind: 'person' },
            { entity: 'binary_sensor.deck_motion', device: 'd2', kind: 'motion' }];
var plan = M.livePlan(CAMS, SENS);
ok('live: the option is the device name when the camera’s name starts with it',
   eq(plan.map(function (p) { return p.option; }), ['Front Door', 'Deck', 'Porch Cam', 'Garage']));
ok('...every option names its own camera the way the strip matches it',
   plan.every(function (p, i) { return M.liveNames(p.option, [CAMS[i].name]); }) && !M.liveNames('Fro', ['Front Door Low']) && M.liveNames('Front', ['Front Door Low']));
ok('...a person sensor before a motion one; none without a device',
   plan[0].sensor === 'binary_sensor.front_door_person_detected' && plan[1].sensor === 'binary_sensor.deck_motion' &&
   plan[2].sensor === null && plan[3].sensor === null);
ok('...two cameras on one device get distinct options',
   eq(M.livePlan([CAMS[0], { entity: 'camera.front_door_high', name: 'Front Door High resolution channel', device: 'd1',
                             deviceName: 'Front Door' }], []).map(function (p) { return p.option; }),
      ['Front Door', 'Front Door High resolution channel']));
var y = M.liveYaml(plan, 'input_select.live_camera');
ok('live: the automation triggers on each sensor with the camera’s option as its id',
   /entity_id: binary_sensor\.front_door_person_detected\n    to: "on"\n    id: "Front Door"/.test(y) &&
   /entity_id: binary_sensor\.deck_motion\n    to: "on"\n    id: "Deck"/.test(y) && !/porch|garage/i.test(y.split('actions:')[0].replace(/description.*\n/, '')));
ok('...five quiet minutes on every sensor go back to the first camera',
   /for:\n      minutes: 5\n    id: all quiet/.test(y) && /state: "off"\n      - action: input_select\.select_option[\s\S]*option: "Front Door"/.test(y));
ok('...otherwise it picks the camera that triggered', /else:\n      - action: input_select\.select_option[\s\S]*option: "\{\{ trigger\.id \}\}"/.test(y));
ok('...a select entity is set with select.select_option', /action: select\.select_option/.test(M.liveYaml(plan, 'select.cams')));
ok('...no sensors at all: nothing to write', M.liveYaml(M.livePlan([CAMS[3]], SENS), 'input_select.x') === null);
var kept = M.livePlan(CAMS, SENS, ['Front', 'Front Door', 'Garage', 'Kitchen']);
ok('live: a chosen dropdown keeps its own options, the longest that names each camera',
   kept[0].option === 'Front Door' && !kept[0].missing && kept[3].option === 'Garage' && kept[1].missing && kept[1].option === 'Deck');
var ky = M.liveYaml(kept, 'input_select.cameras');
ok('...and a camera it has no option for is left out of the automation',
   /id: "Front Door"/.test(ky) && !/Deck/.test(ky) && /option: "Front Door"\n    else/.test(ky));

print(fail ? '  ' + fail + ' SETTINGS MODEL TESTS FAILED' : '  ALL ' + pass + ' SETTINGS MODEL TESTS PASS');
if (fail) throw new Error(fail + ' failed');
