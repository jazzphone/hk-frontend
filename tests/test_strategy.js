// hk-strategy.js: a whole dashboard from a house's registries.
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/frontend/cards/hk-strategy.js');
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
function st(id, s, a) { return { entity_id: id, state: s, attributes: a || {} }; }
var S = {};
[st('light.kitchen_table_light', 'on', { friendly_name: 'Kitchen Table Light' }),
 st('light.kitchen_lights', 'on', { friendly_name: 'Kitchen Lights', entity_id: ['light.a', 'light.b'] }),
 st('switch.kitchen_coffee', 'off', { friendly_name: 'Kitchen Coffee' }),
 st('lock.front', 'locked', { friendly_name: 'Front Door' }),
 st('cover.garage', 'closed', { friendly_name: 'Garage Door', device_class: 'garage' }),
 st('cover.den_blinds', 'open', { friendly_name: 'Den Blinds' }),
 st('media_player.den_tv', 'off', { friendly_name: 'Den TV', device_class: 'tv' }),
 st('sensor.den_temp', '70', { friendly_name: 'Den Temperature' }),
 st('light.hidden', 'on', {}), st('switch.cfg', 'on', {}),
 st('light.nowhere', 'on', { friendly_name: 'Nowhere' }),
 st('weather.home', 'sunny', {}), st('sun.sun', 'above_horizon', {}),
 st('alarm_control_panel.house', 'disarmed', { friendly_name: 'House Alarm' })
].forEach(function (s) { S[s.entity_id] = s; });
var hass = {
  states: S, themes: { themes: { 'HK Kiosk': {} } },
  floors: { up: { floor_id: 'up', name: 'Upstairs', level: 2 }, main: { floor_id: 'main', name: 'Main', level: 1 } },
  areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'main' },
           den: { area_id: 'den', name: 'Den', floor_id: 'up' },
           garage: { area_id: 'garage', name: 'Garage', floor_id: 'main' },
           empty: { area_id: 'empty', name: 'Empty Room', floor_id: 'main' } },
  devices: { d1: { area_id: 'den' } },
  entities: {
    'light.kitchen_table_light': { area_id: 'kitchen' }, 'light.kitchen_lights': { area_id: 'kitchen' },
    'switch.kitchen_coffee': { area_id: 'kitchen' }, 'lock.front': { area_id: 'garage' },
    'cover.garage': { area_id: 'garage' }, 'cover.den_blinds': { device_id: 'd1' },
    'media_player.den_tv': { device_id: 'd1' }, 'sensor.den_temp': { area_id: 'den' },
    'light.hidden': { area_id: 'kitchen', hidden: true }, 'switch.cfg': { area_id: 'kitchen', entity_category: 'config' },
    'light.nowhere': {}, 'alarm_control_panel.house': { area_id: 'garage' }
  }
};
var asked = 0, unsubbed = 0, WB = null, ACC = null, CP = null;
function cards(v) { return JSON.stringify(v); }
function roomNames(home) {
  return home.cards.filter(function (c) { return c.type === 'grid' && c.cards && c.cards[0].type === 'custom:hk-heading-card'; })
    .map(function (c) { return c.cards[0].name; });
}
function tilesOf(home, room) {
  var sec = home.cards.filter(function (c) { return c.type === 'grid' && c.cards[0].name === room; })[0];
  return sec ? sec.cards[1].cards : [];
}
window.hkStrategy.generate({}, hass).then(function (cfg) {
  var home = cfg.views[0];
  ok('opts into the live sky', !!cfg.sky && home.sky === true);
  ok('home view uses the hk grid view and the theme', home.type === 'custom:hk-grid-view' && home.theme === 'HK Kiosk');
  ok('the header comes first', home.cards[0].cards[0].type === 'custom:hk-header-card');
  ok('rooms by floor level, then name; empty rooms left out', JSON.stringify(roomNames(home)) === '["Garage","Kitchen","Den"]', roomNames(home));
  var k = tilesOf(home, 'Kitchen');
  ok('hidden, config and area-less entities are not room tiles', k.length === 3 && cards(cfg).indexOf('light.hidden') < 0 && cards(cfg).indexOf('switch.cfg') < 0 && cards(home.cards.slice(1)).indexOf('light.nowhere') < 0);
  ok('lights before switches, then by name', k[0].entity === 'light.kitchen_lights' && k[2].entity === 'switch.kitchen_coffee');
  ok('the room is not repeated in a tile name', k[1].name === 'Table Light', k[1].name);
  ok('a light group gets the group glyph at its measured size', k[0].icon === 'hk:lightbulb-group' && k[0].icon_size === '42px');
  ok('a switch is a state-labeled toggle pill', k[2].type === 'custom:hk-tile-card' && k[2].label_mode === 'state' && k[2].icon_size === '21px');
  var d = tilesOf(home, 'Den');
  ok('an entity inherits its device\'s area', d.length === 2);
  ok('a TV is a source-first media pill', d.filter(function (t) { return t.entity === 'media_player.den_tv'; })[0].label_mode === 'source_first');
  ok('sensors are not tiles', cards(home).indexOf('sensor.den_temp') < 0);
  var g = tilesOf(home, 'Garage');
  var garage = g.filter(function (t) { return t.entity === 'cover.garage'; })[0];
  ok('a garage door is a tall tile with the garage glyphs', garage.type === 'custom:hk-tall-card' && garage.view_layout['grid-row'] === 'span 2' && garage.icon_states.closed === 'hk:garage');
  ok('the alarm tile opens its keypad sheet (no navigation)', !g.filter(function (t) { return t.entity === 'alarm_control_panel.house'; })[0].tap_action);
  var paths = cfg.views.map(function (v) { return v.path; });
  ok('a page per category, weather and security, and one per room; no music (not configured)',
     JSON.stringify(paths) === '["home","weather","security","climate","lights","room-garage","room-kitchen","room-den"]', paths);
  var byPath = {}; cfg.views.forEach(function (v) { byPath[v.path] = v; });
  // --- room pages
  var kr = byPath['room-kitchen'];
  ok('a room page names its area, so the menu lists it and headings link to it', kr.area === 'kitchen' && kr.subview === true && kr.title === 'Kitchen');
  var krTypes = kr.cards.map(function (c) { return c.type; });
  ok('...under a back button, then its status row', kr.cards[0].cards[0].type === 'custom:hk-back-card' &&
     krTypes[1] === 'custom:hk-room-status-card' && kr.cards[1].area === 'kitchen');
  ok('...the back button and the title 20 px apart', kr.cards[0].layout['grid-column-gap'] === '20px');
  var groupsOf = function (v) { return v.cards.filter(function (c) { return c.type === 'grid'; }).map(function (c) { return c.cards[0].name; }); };
  ok('...its devices grouped the Home app\'s way', JSON.stringify(groupsOf(kr)) === '["Lights","Other"]', JSON.stringify(groupsOf(kr)));
  var gr = byPath['room-garage'];
  ok('a garage door is Security, not Climate', groupsOf(gr).indexOf('Security') >= 0 && groupsOf(gr).indexOf('Climate') < 0, JSON.stringify(groupsOf(gr)));
  var krLights = kr.cards.filter(function (c) { return c.type === 'grid' && c.cards[0].name === 'Lights'; })[0].cards[1].cards;
  var names = krLights.map(function (t) { return t.name; });
  ok('lights A to Z, as the Home app lists them', JSON.stringify(names) === JSON.stringify(names.slice().sort()), JSON.stringify(names));
  // a room's cameras: one snapshot tile each, never a live mosaic
  var yardHass = { states: { 'camera.yard_left': { entity_id: 'camera.yard_left', state: 'idle', attributes: {} },
                             'camera.yard_right': { entity_id: 'camera.yard_right', state: 'idle', attributes: {} },
                             'light.yard': { entity_id: 'light.yard', state: 'off', attributes: {} } },
                   entities: { 'camera.yard_left': { area_id: 'yard' }, 'camera.yard_right': { area_id: 'yard' },
                               'light.yard': { area_id: 'yard' } },
                   devices: {}, areas: { yard: { area_id: 'yard', name: 'Yard' } } };
  var yc = window.hkStrategy.roomCards(yardHass, ['yard'], 'Yard', {});
  var camSec = yc.filter(function (c) { return c.type === 'grid' && c.cards[0].name === 'Cameras'; })[0];
  var camGrid = camSec && camSec.cards[1];
  ok('a room\'s cameras are one snapshot tile each, in one row that scrolls sideways',
     !!camGrid && camGrid.type === 'custom:hk-row-card' && /--hk-cam-row/.test(camGrid.card_width) &&
     camGrid.cards.length === 2 && camGrid.cards.every(function (t) { return t.type === 'picture-entity' && t.camera_view === 'auto'; }),
     JSON.stringify(camSec));
  ok('...no mosaic, no stream', JSON.stringify(yc).indexOf('mosaic') === -1 && JSON.stringify(yc).indexOf('"live"') === -1);
  // ONE TILE PER CAMERA: a UniFi camera is up to three camera entities, one
  // per channel, and a wall tablet's own camera is not a room camera.
  function camIds(h, areas, o) {
    var sec = window.hkStrategy.roomCards(h, areas, 'Yard', o || {}).filter(function (c) {
      return c.type === 'grid' && c.cards[0].name === 'Cameras'; })[0];
    return sec ? sec.cards[1].cards.map(function (t) { return t.entity; }) : [];
  }
  var chHass = { states: {}, entities: {}, devices: { d1: { area_id: 'yard' }, d2: { area_id: 'yard' }, tab: { area_id: 'yard' } },
                 areas: { yard: { area_id: 'yard', name: 'Yard' } } };
  ['camera.drive_high_resolution_channel', 'camera.drive_medium_resolution_channel', 'camera.drive_low_resolution_channel']
    .forEach(function (id) { chHass.entities[id] = { device_id: 'd1', platform: 'unifiprotect' }; });
  ['camera.porch_high_resolution_channel', 'camera.porch_low_resolution_channel']
    .forEach(function (id) { chHass.entities[id] = { device_id: 'd2', platform: 'unifiprotect' }; });
  chHass.entities['camera.yard_tablet'] = { device_id: 'tab', platform: 'fully_kiosk' };
  chHass.entities['camera.tv_abc'] = { platform: 'hk_frontend', area_id: 'yard' };   // a Live TV channel
  Object.keys(chHass.entities).forEach(function (id) { chHass.states[id] = { entity_id: id, state: 'idle', attributes: {} }; });
  ok('one tile per camera, its low-resolution channel, never a tablet\'s camera or a TV channel',
     JSON.stringify(camIds(chHass, ['yard'])) === '["camera.drive_low_resolution_channel","camera.porch_low_resolution_channel"]',
     JSON.stringify(camIds(chHass, ['yard'])));
  ok('...the channel this screen lists wins, and its list sets the order',
     JSON.stringify(camIds(chHass, ['yard'], { board: { cameras: ['camera.porch_high_resolution_channel', 'camera.drive_medium_resolution_channel'] } })) ===
     '["camera.porch_high_resolution_channel","camera.drive_medium_resolution_channel"]',
     JSON.stringify(camIds(chHass, ['yard'], { board: { cameras: ['camera.porch_high_resolution_channel', 'camera.drive_medium_resolution_channel'] } })));
  // AN hk: ICON SET IN HOME ASSISTANT beats the guess.
  var icHass = { states: { 'switch.coffee': { entity_id: 'switch.coffee', state: 'off', attributes: {} },
                           'light.tree': { entity_id: 'light.tree', state: 'on', attributes: {} },
                           'lock.door': { entity_id: 'lock.door', state: 'locked', attributes: {} },
                           'lock.back': { entity_id: 'lock.back', state: 'locked', attributes: {} },
                           'switch.plain': { entity_id: 'switch.plain', state: 'off', attributes: {} } },
                 entities: { 'switch.coffee': { icon: 'hk:coffee' }, 'light.tree': { icon: 'mdi:string-lights' },
                             'lock.door': { icon: 'mdi:gate' }, 'lock.back': { icon: 'hk:lock' }, 'switch.plain': {} },
                 devices: {} };
  var tf = window.hkStrategy.tileFor;
  ok('an hk: icon set in HA is the tile\'s glyph', tf(icHass, 'switch.coffee', 'Coffee').icon === 'hk:coffee');
  ok('...but an mdi: icon (chosen for HA\'s own screens) is not', tf(icHass, 'light.tree', 'Glow').icon === 'hk:lightbulb');
  icHass.entities['lock.door'].icon = 'hk:gate';
  ok('...and an hk: icon is the glyph in every state', tf(icHass, 'lock.door', 'Door').icon === 'hk:gate' && !tf(icHass, 'lock.door', 'Door').icon_states);
  ok('...but the tile\'s own glyph keeps its open/closed pair', !!tf(icHass, 'lock.back', 'Back').icon_states);
  ok('no icon set: the usual glyph', tf(icHass, 'switch.plain', 'Plain').icon === 'hk:power-socket-us');
  ok('the room prefix drops whichever apostrophe either name uses',
     window.hkStrategy.shortName("Emma's Room Lamp", 'Emma’s Room') === 'Lamp' &&
     window.hkStrategy.shortName('Emma’s Room Lamp', "Emma's Room") === 'Lamp',
     window.hkStrategy.shortName("Emma's Room Lamp", 'Emma’s Room'));
  var homeHeads = home.cards.filter(function (c) { return c.type === 'grid' && c.cards[0].area; }).map(function (c) { return c.cards[0].area; });
  ok('each room heading on Home names its area', homeHeads.indexOf('kitchen') >= 0 && homeHeads.indexOf('den') >= 0, JSON.stringify(homeHeads));
  ok('Weather sits beside Home in the menu', byPath.weather.menu === 'top' && byPath.weather.icon === 'mdi:weather-partly-cloudy');
  ok('the weather view reads the house weather entity', cards(byPath.weather).indexOf('"entity":"weather.home"') > 0);
  // --- chips: the dashboard's own row (hk-chips-card; test_chipkinds.js)
  var row = home.cards[0].cards[1];
  ok('the chip row under the header is the dashboard\'s own, nothing listed', row.type === 'custom:hk-chips-card' &&
     Object.keys(row).length === 2, JSON.stringify(row));
  ok('...and it picks no menu Categories: a generated screen lists every page', row.in_menu === false);
  // --- pages
  ok('Lights page: rooms with lights only', cards(byPath.lights).indexOf('switch.kitchen_coffee') < 0 &&
     cards(byPath.lights).indexOf('light.kitchen_table_light') > 0 && byPath.lights.sky_variant === 'lights');
  ok('Climate page: blinds, not the garage door', cards(byPath.climate).indexOf('cover.den_blinds') > 0 &&
     cards(byPath.climate).indexOf('cover.garage') < 0);
  ok('no Doors & Windows page from locks and a garage door alone: they are Security\'s',
     !byPath['doors-windows'] && cards(byPath.security).indexOf('lock.front') > 0);
  ok('the header links the views it has', home.cards[0].cards[0].weather_path === './weather' && home.cards[0].cards[0].alarm_path === './security');
  // an alarm automation opens <dashboard>/0#alarm on a wall tablet
  var pop = JSON.stringify(home).match(/\{"type":"custom:hk-popup-card"[^}]*\}/);
  ok('Home answers #alarm with the keypad sheet', !!pop && /"hash":"#alarm"/.test(pop[0]) &&
     /"detail":"alarm_control_panel.house"/.test(pop[0]), pop && pop[0]);
  // ...but not when the house has an Alarm pop-up ITEM: that answers #alarm
  // with its own Close after, and a card would claim the hash first
  var prevHS = window.hkSettings;
  window.hkSettings = { get: function (p, f) {
    return p === 'popups' ? [{ hash: 'alarm', kind: 'alarm', dashboards: [], close_after: 3600 }] : f; },
    weatherId: function () { return null; } };
  return window.hkStrategy.generate({}, hass).then(function (withItem) {
    ok('...no #alarm card of its own when an Alarm pop-up item answers it',
       JSON.stringify(withItem.views[0]).indexOf('"hash":"#alarm"') < 0);
    window.hkSettings = { get: function (p, f) {
      return p === 'popups' ? [{ hash: 'alarm', kind: 'alarm', dashboards: ['dashboard-elsewhere'], close_after: 3600 }] : f; },
      weatherId: function () { return null; } };
    return window.hkStrategy.generate({}, hass);
  }).then(function (elsewhere) {
    ok('...but its own card when the item is kept to other dashboards',
       JSON.stringify(elsewhere.views[0]).indexOf('"hash":"#alarm"') > 0);
    window.hkSettings = prevHS;
    return window.hkStrategy.generate({ exclude_areas: ['garage'], areas: [], sky: false, exclude_entities: ['light.kitchen_lights'] }, hass);
  });
}).then(function (cfg) {
  var home = cfg.views[0];
  ok('options: excluded area and entity, no sky', JSON.stringify(roomNames(home)) === '["Kitchen","Den"]' && !cfg.sky && !home.sky && tilesOf(home, 'Kitchen').length === 2);
  return window.hkStrategy.generate({ areas: ['den', 'kitchen'] }, hass);
}).then(function (cfg) {
  ok('options: an explicit area list sets the order', JSON.stringify(roomNames(cfg.views[0])) === '["Den","Kitchen"]');
  var bare = { states: { 'light.x': st('light.x', 'on', {}) }, entities: { 'light.x': {} } };
  return window.hkStrategy.generate({}, bare);
}).then(function (cfg) {
  ok('a house with no areas, weather or alarm still gets a home view (and its Lights page)',
     cfg.views[0].path === 'home' && cfg.views.length === 2 && cfg.views[1].path === 'lights' && !cfg.views[0].theme,
     cfg.views.map(function (v) { return v.path; }));
  ok('...and no #alarm pop-up without an alarm', JSON.stringify(cfg.views[0]).indexOf('hk-popup-card') < 0);
  hass.connection = { subscribeMessage: function (cb, msg) {
    asked++;
    cb({ configured: true, speakers: [{ entity: 'media_player.k' }] });
    return Promise.resolve(function () { unsubbed++; });
  } };
  return window.hkStrategy.generate({}, hass);
}).then(function (m) {
  var paths = m.views.map(function (v) { return v.path; });
  ok('music set up in the integration: Play and Browse Music views', paths.indexOf('playmusic') > 0 && paths.indexOf('music-browse') > 0, paths);
  ok('...the question is asked once and closed', asked === 1 && unsubbed === 1);
  var pm = m.views.filter(function (v) { return v.path === 'playmusic'; })[0];
  ok('Play Music: the album-art sky, the player with progress and volume', pm.sky_variant === 'playmusic' &&
     JSON.stringify(pm).indexOf('"parts":["progress"]') > 0 && JSON.stringify(pm).indexOf('"parts":["volume"]') > 0);
  ok('...reached from the Speakers chip and the menu, not a heading on Home', JSON.stringify(m.views[0]).indexOf('./playmusic') < 0);
  return window.hkStrategy.generate({ music: false }, hass);
}).then(function (m) {
  ok('music: false leaves them out without asking', m.views.map(function (v) { return v.path; }).indexOf('playmusic') < 0 && asked === 1);
  return window.hkStrategy.generate({ chips: false, pages: false, music: false }, hass);
}).then(function (m) {
  ok('chips: false, pages: false (the rooms still get their pages)', m.views.length === 6 && m.views[0].cards[0].cards.length === 2,
     m.views.map(function (v) { return v.path; }).join());
  return window.hkStrategy.generate({ chips: false, pages: false, music: false, rooms: false }, hass);
}).then(function (m) {
  ok('rooms: false leaves the room pages out, and Home\'s headings then link nowhere',
     m.views.length === 3 && m.views.every(function (v) { return !v.area; }));
  // Home status in Configure wins over discovery: a "Garage Door" CONTACT
  // that is really the door into the garage is listed as a door.
  S['binary_sensor.garage_entry'] = st('binary_sensor.garage_entry', 'off', { device_class: 'door', friendly_name: 'Garage Door' });
  hass.entities['binary_sensor.garage_entry'] = { area_id: 'garage' };
  window.hkSettings = { get: function (p, f) {
    var v = { 'security': { garage: ['cover.garage'], doors: ['binary_sensor.garage_entry'], locks: ['lock.front'], windows: [] },
              // Security's own order (Accessories -> Page Order)
              'accessories': { entities: {}, rooms: {}, pages: { security: ['cover.garage', 'lock.front'] } } }[p];
    return v === undefined ? f : v; }, weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, hass);
}).then(function (m) {
  var secv = m.views.filter(function (v) { return v.path === 'security'; })[0];
  var rail = JSON.stringify(secv);
  ok('Security in its own order: the garage door, then the lock', rail.indexOf('"entity":"cover.garage"') > 0 &&
     rail.indexOf('"entity":"cover.garage"') < rail.indexOf('"entity":"lock.front"'), rail.slice(0, 200));
  var dw = m.views.filter(function (v) { return v.path === 'doors-windows'; })[0];
  var secs = {}; dw.cards.slice(1).forEach(function (c) { secs[c.cards[0].name] = c.cards[1].cards.map(function (t) { return t.entity; }); });
  var doorTile = dw.cards.slice(1).filter(function (c) { return c.cards[0].name === 'Doors'; })[0].cards[1].cards[0];
  ok('a page that mixes rooms puts the room ABOVE the name, as the favorites do',
     doorTile.type === 'custom:hk-favorite-card' && doorTile.room === 'Garage' && doorTile.name === 'Door', doorTile);
  ok('the settings decide: the entry contact is a Door; the locks and the garage door are not here',
     JSON.stringify(secs.Doors) === '["binary_sensor.garage_entry"]' && !secs.Garage && !secs.Locks, secs);
  ok('...and it opens and shuts: its two glyphs', doorTile.icon === 'hk:door-open' &&
     JSON.stringify(doorTile.icon_states) === '{"off":"hk:door-closed"}', doorTile);
  // THERMOSTATS: a car's cabin climate is a climate entity too.
  S['climate.car'] = st('climate.car', 'off', { friendly_name: 'Family Car Climate', current_temperature: 91 });
  S['climate.den'] = st('climate.den', 'heat', { friendly_name: 'Den Thermostat', current_temperature: 70 });
  hass.entities['climate.car'] = { area_id: 'garage', name: 'Climate' };
  hass.entities['climate.den'] = { area_id: 'den' };
  var base = window.hkSettings.get;
  window.hkSettings.get = function (p, f) {
    if (p === 'features.thermostats') return ['climate.den'];
    if (p === 'features.temperature') return 'sensor.house_temp';
    return base(p, f);
  };
  return window.hkStrategy.generate({ music: false }, hass).then(function (m2) {
    var clim = m2.views.filter(function (v) { return v.path === 'climate'; })[0];
    ok('the Climate page shows the thermostats, not the car', cards(clim).indexOf('climate.den') > 0 &&
       cards(clim).indexOf('climate.car') < 0);
    var garage = tilesOf(m2.views[0], 'Garage').filter(function (t) { return t.entity === 'climate.car'; })[0];
    ok('a tile is named by its FULL name, not the registry short name', garage && garage.name === 'Family Car Climate', garage && garage.name);
    // WHAT COUNTS answers first: the integration's kinds decide the pages.
    window.hkSettings.get = function (p, f) {
      if (p === 'kinds') return { thermostats: ['climate.car'], lights: ['light.kitchen_table_light'] };
      return base(p, f);
    };
    return window.hkStrategy.generate({ music: false }, hass);
  }).then(function (m3) {
    var clim = m3.views.filter(function (v) { return v.path === 'climate'; })[0];
    ok('What counts decides the thermostats', cards(clim).indexOf('climate.car') > 0 && cards(clim).indexOf('climate.den') < 0);
    var li = m3.views.filter(function (v) { return v.path === 'lights'; })[0];
    ok('...and the lights', cards(li).indexOf('light.kitchen_table_light') > 0 && cards(li).indexOf('light.kitchen_lights') < 0);
    delete window.hkSettings;
  });
}).then(function () {
  // --- Accessories -> Hidden from Screens / Also Shown
  S['switch.car_seat'] = st('switch.car_seat', 'off', { friendly_name: 'Car Seat Heater' });
  hass.entities['switch.car_seat'] = { device_id: 'car' };
  hass.devices.car = { area_id: 'garage' };
  S['scene.movie'] = st('scene.movie', 'scening', { friendly_name: 'Den Movie Night' });
  hass.entities['scene.movie'] = { area_id: 'den' };
  S['sensor.outside'] = st('sensor.outside', '61', { friendly_name: 'Outside Temperature' });
  hass.entities['sensor.outside'] = {};
  var G = { exclude_devices: ['car'], exclude_entities: ['light.kitchen_lights'], exclude_areas: [],
            include_entities: ['scene.movie', 'sensor.outside'], chips: true, pages: false, sky: true, music: false };
  window.hkSettings = { get: function (p, f) { return p === 'generated' ? G : f; },
                        weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({}, hass).then(function (g) {
    var home = g.views[0], all = cards(g);
    ok('an excluded DEVICE is gone everywhere', all.indexOf('switch.car_seat') < 0);
    ok('an excluded entity is gone from its room and its pages', all.indexOf('light.kitchen_lights') < 0);
    var den = tilesOf(home, 'Den');
    var movie = den.filter(function (t) { return t.entity === 'scene.movie'; })[0];
    ok('an added scene appears in its own room, as a tap-to-run tile', movie && movie.type === 'custom:hk-scene-card' &&
       movie.tap_action.service === 'scene.turn_on' && movie.name === 'Movie Night', movie);
    var more = tilesOf(home, 'More');
    ok('an added entity with no room goes to More, showing its state', more.length === 1 &&
       more[0].entity === 'sensor.outside' && more[0].label_mode === 'state');
    // (the house-wide Parts are retired: a stored "pages: false" turns nothing
    // off; the dashboard's own YAML and its Pages still do)
    ok('the retired house-wide "pages: false" turns nothing off',
       g.views.map(function (v) { return v.path; }).indexOf('lights') > 0);
    return window.hkStrategy.generate({ pages: false, exclude_entities: ['switch.kitchen_coffee'] }, hass);
  }).then(function (g2) {
    var all2 = cards(g2);
    ok('the YAML\'s own "pages: false" still turns the category pages off', g2.views.map(function (v) { return v.path; }).indexOf('lights') < 0);
    ok('...and ADDS to a list (both exclusions apply)', all2.indexOf('switch.kitchen_coffee') < 0 &&
       all2.indexOf('light.kitchen_lights') < 0);
    // TWO BUILDS AT ONCE (the editor's preview and the dashboard): each keeps
    // its own exclusions across the await in between (never one module-level
    // list).
    return Promise.all([
      window.hkStrategy.generate({ music: true, exclude_entities: ['switch.kitchen_coffee'] }, hass),
      window.hkStrategy.generate({ music: true }, hass)]);
  }).then(function (both) {
    ok('two builds at once keep their own exclusions',
       cards(both[0]).indexOf('switch.kitchen_coffee') < 0 && cards(both[1]).indexOf('switch.kitchen_coffee') > 0);
    // A direct call uses exactly the options it is given, not the last build's.
    var direct = window.hkStrategy.rooms(hass, {});
    var ids = [].concat.apply([], direct.map(function (r) { return r.entities; }));
    ok('rooms() on its own hides nothing it was not told to', ids.indexOf('switch.kitchen_coffee') >= 0 &&
       ids.indexOf('light.kitchen_lights') >= 0, ids);
    delete window.hkSettings;
  });
}).then(function () {
  // --- EACH DASHBOARD'S OWN: its pages, camera strip, scenes, favorites
  S['camera.porch'] = st('camera.porch', 'idle', { friendly_name: 'Porch Camera' });
  hass.entities['camera.porch'] = { area_id: 'kitchen' };
  S['binary_sensor.sink_leak'] = st('binary_sensor.sink_leak', 'off', { device_class: 'moisture', friendly_name: 'Kitchen Sink Leak' });
  hass.entities['binary_sensor.sink_leak'] = { area_id: 'kitchen' };
  var BOARD = { pages: ['security', 'lights', 'cameras', 'water', 'rooms'], favorites: ['lock.front'] };
  window.hkSettings = { get: function (p, f) { return p === 'boards' ? { '': BOARD } : f; },
                        weatherId: function () { return 'weather.home'; }, onChange: function () {} };
  return window.hkStrategy.generate({ music: false }, hass).then(function (g) {
    var paths = g.views.map(function (v) { return v.path; });
    ok('the item decides the pages, in its order', JSON.stringify(paths.filter(function (p) { return p.indexOf('room-') < 0; })) ===
       '["home","security","lights","cameras","water"]', paths);
    ok('...room pages when it lists them', paths.indexOf('room-kitchen') > 0);
    var home = g.views[0];
    ok('no Weather page: the header does not link one', home.cards[0].cards[0].weather_path === undefined &&
       home.cards[0].cards[0].alarm_path === './security');
    var strip = home.cards[1];
    var mosaic = strip.cards[0].cards[1].cards[0].cards[0];
    ok('the camera strip under the chips, its heading opening Cameras', strip.cards[0].cards[0].navigation_path === './cameras' &&
       mosaic.type === 'custom:hk-camera-mosaic-card' && mosaic.cameras[0].entity === 'camera.porch', JSON.stringify(strip).slice(0, 200));
    ok('the camera strip\'s numbers', mosaic.height === 195 && strip.cards[0].cards[1].layout.margin === '-14px -22px -49px -22px');
    ok('then the scenes row (the dashboard\'s, live)', home.cards[2].type === 'custom:hk-scenes-card');
    var fav = home.cards[3].cards[1].cards[0];
    ok('then Favorites, the Home app\'s favorite tile: the room above, a lock says Locked', home.cards[3].cards[0].name === 'Favorites' &&
       fav.entity === 'lock.front' && fav.type === 'custom:hk-favorite-card' && fav.label_mode === 'sentence' && !fav.view_layout, JSON.stringify(fav));
    var water = g.views.filter(function (v) { return v.path === 'water'; })[0];
    ok('Water: the leak sensors, room by room', cards(water).indexOf('binary_sensor.sink_leak') > 0 && cards(water).indexOf('"label_mode":"leak"') > 0);
    var cams = g.views.filter(function (v) { return v.path === 'cameras'; })[0];
    ok('Cameras: every camera live, beside Home in the menu', cams.menu === 'top' && cards(cams).indexOf('"camera_view":"live"') > 0);
    ok('the category pages carry their icons for the menu', g.views.filter(function (v) { return v.path === 'lights'; })[0].icon === 'mdi:lightbulb');
    ok('no kiosk unless the item asks', !g.kiosk_mode);
    // HomePods and Apple TVs by their device's model
    var T = window.hkStrategy.tile.media_player;
    ok('a HomePod mini is drawn as one', T('media_player.k', 'Kitchen', { attributes: {} }, 'HomePod Mini').icon === 'hk:homepod-mini');
    ok('a HomePod as a HomePod', T('media_player.l', 'Living', { attributes: {} }, 'HomePod 2').icon === 'hk:homepod');
    ok('an Apple TV as the box', T('media_player.a', 'TV', { attributes: {} }, 'Apple TV 4K (gen 3)').icon === 'hk:apple-tv');
    ok('any other speaker is a speaker', T('media_player.s', 'S', { attributes: {} }, 'pi').icon === 'hk:speaker');
    // Security: the keypad with the locks on a rail, under the doors sky
    var sec = g.views.filter(function (v) { return v.path === 'security'; })[0];
    var panel = sec.cards[1].cards[0];
    ok('Security: keypad and a Locks rail', panel.layout['grid-template-columns'] === 'var(--hk-alarm-cols, 430px 408px)' &&
       cards(panel).indexOf('"name":"Locks"') > 0 && cards(panel).indexOf('lock.front') > 0 && sec.sky_variant === 'doors',
       JSON.stringify(panel).slice(0, 200));
    // Timers and Vacuums, with the quick timers and Clean Areas present
    S['timer.quick_1'] = st('timer.quick_1', 'idle', {}); S['timer.nap'] = st('timer.nap', 'idle', { friendly_name: 'Nap - Timer' });
    S['script.quick_timer_start'] = st('script.quick_timer_start', 'off', {});
    S['input_text.quick_timer_1_name'] = st('input_text.quick_timer_1_name', '', {});
    S['vacuum.robo'] = st('vacuum.robo', 'docked', { friendly_name: 'Robo' });
    S['sensor.robo_current_room'] = st('sensor.robo_current_room', 'Den', {});
    S['sensor.robo_operational_error'] = st('sensor.robo_operational_error', 'none', {});
    hass.entities['vacuum.robo'] = { device_id: 'robo', area_id: 'den' };
    hass.entities['sensor.robo_current_room'] = { device_id: 'robo' };
    hass.entities['sensor.robo_operational_error'] = { device_id: 'robo' };
    BOARD = { pages: ['timers', 'vacuums', 'music'] };
    var getB = window.hkSettings.get;
    // the Clean Areas feature added (the settings feed's `added`)
    window.hkSettings.get = function (p, f) {
      if (p === 'added') return ['clean_areas'];
      return p === 'features.house_timers' ? ['timer.nap', 'timer.gone'] : getB(p, f); };
    return window.hkStrategy.generate({ music: false }, hass);
  }).then(function (g) {
    var tv = g.views.filter(function (v) { return v.path === 'timers'; })[0];
    var tc = tv && tv.cards[1].cards[0];
    ok('Timers: the whole page when the quick timers are installed', tc && tc.type === 'custom:hk-timers-page-card' &&
       tc.timers[0].entity === 'timer.quick_1' && tc.timers[0].label_entity === 'input_text.quick_timer_1_name' &&
       tc.timers.some(function (t) { return t.entity === 'timer.nap'; }), JSON.stringify(tc));
    ok('...a house timer is named without its "- Timer"', tc.house[0].name === 'Nap', tc.house[0].name);
    ok('...with the house timers from Configure -> Features', tc.house.length === 1 &&
       tc.house[0].entity === 'timer.nap', JSON.stringify(tc.house));
    var vv = g.views.filter(function (v) { return v.path === 'vacuums'; })[0];
    var vj = cards(vv);
    ok('Vacuums: the vacuum with its own readings', vj.indexOf('"room":"sensor.robo_current_room"') > 0 &&
       vj.indexOf('"error":"sensor.robo_operational_error"') > 0);
    ok('Vacuums: Clean by Area on the rail, its rooms Clean Areas\' own (asked live, none listed)',
       vj.indexOf('{"type":"custom:hk-area-select-card"}') > 0 && vj.indexOf('"floors"') < 0, vj.slice(vj.indexOf('area-select') - 40, vj.indexOf('area-select') + 80));
    delete hass.services;
    // Rooms on pages: floor by floor (Main, then Upstairs), or in room order
    var litRooms = function (gv) {
      var lv = gv.views.filter(function (v) { return v.path === 'lights'; })[0];
      return lv.cards.slice(1).map(function (c) { return c.cards[0].name; });
    };
    S['light.den_lamp'] = st('light.den_lamp', 'off', { friendly_name: 'Den Lamp' });
    hass.entities['light.den_lamp'] = { area_id: 'den' };
    BOARD = { pages: ['lights'] };
    return window.hkStrategy.generate({ music: false }, hass).then(function (g1) {
      var floorOrder = litRooms(g1);
      ok('Lights: rooms floor by floor by default', floorOrder.indexOf('Kitchen') < floorOrder.indexOf('Den'), JSON.stringify(floorOrder));
      BOARD = { pages: ['lights'], page_rooms: 'order', room_order: ['den', 'kitchen'] };
      return window.hkStrategy.generate({ music: false }, hass);
    }).then(function (g2) {
      var o2 = litRooms(g2);
      ok('Lights: in room order when the item asks', o2.indexOf('Den') < o2.indexOf('Kitchen'), JSON.stringify(o2));
      return g2;
    });
  }).then(function (g) {
    BOARD = { pages: ['lights'], camera_strip: false, sky: false, kiosk: true, chips_row: false };
    return window.hkStrategy.generate({ music: false }, hass);
  }).then(function (g) {
    var paths = g.views.map(function (v) { return v.path; });
    ok('only the pages it picked; no room pages', JSON.stringify(paths) === '["home","lights"]', paths);
    ok('no camera strip when it is off', JSON.stringify(g.views[0]).indexOf('hk-camera-mosaic-card') < 0);
    ok('no chip row when the item turns it off', JSON.stringify(g.views[0]).indexOf('hk-chips-card') < 0);
    ok('no live sky when the item turns it off', !g.sky && !g.views[0].sky);
    ok('kiosk: Home Assistant\'s header and sidebar hidden', g.kiosk_mode && g.kiosk_mode.hide_header && g.kiosk_mode.hide_sidebar);
    delete window.hkSettings;
  });
}).then(function () {
  // A GENERATED WALL TABLET: its photo screensaver for its own
  // user, the sky paused behind it and off with the house's switch, and the
  // now-playing bar
  S['input_boolean.wallpanel_screensaver_kitchen'] = st('input_boolean.wallpanel_screensaver_kitchen', 'off', {});
  WB = { screensaver: true, tablet_user: 'kitchen', idle_room: 'kitchen', now_playing: true };
  window.hkSettings = { get: function (p, f) {
    if (p === 'boards') return { '': WB };
    if (p === 'custom_pages') return CP || f;
    if (p === 'look.sky_switch') return 'input_boolean.sky_background';
    if (p === 'look.photos') return 'media-source://media_source/local/photos';
    return f; }, weatherId: function () { return 'weather.home'; } };
  hass.connection = { subscribeMessage: function (cb) { cb({ configured: true, speakers: [{ entity: 'media_player.k' }] });
    return Promise.resolve(function () {}); } };
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  ok('WallPanel for the tablet\'s own user only', g.wallpanel && g.wallpanel.enabled === false &&
     g.wallpanel.profiles['user.kitchen'].enabled === true, g.wallpanel && g.wallpanel.profiles);
  ok('...its screensaver helper and the house\'s photos', g.wallpanel.screensaver_entity === 'input_boolean.wallpanel_screensaver_kitchen' &&
     g.wallpanel.image_url === 'media-source://media_source/local/photos' && g.wallpanel.cards.length === 4);
  ok('the sky pauses behind it and follows the house\'s switch',
     g.sky.sleep === 'input_boolean.wallpanel_screensaver_kitchen' && g.sky.enable === 'input_boolean.sky_background', g.sky);
  var home = JSON.stringify(g.views[0]);
  ok('the now-playing bar (#media) on Home', home.indexOf('"hash":"#media"') > 0 && home.indexOf('hk-now-playing-card') > 0);
  WB.screensaver = false; WB.now_playing = false;
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  ok('...none of it unless asked', !g.wallpanel && !g.sky.sleep && JSON.stringify(g.views[0]).indexOf('"#media"') < 0);
  // THE HOUSE'S CUSTOM PAGES: the ones this dashboard lists,
  // from the settings -- nothing fetched
  WB.custom_pages = ['energy', 'nope', 'lights', 'ecoflow'];
  CP = [{ path: 'energy', title: 'Energy', icon: 'mdi:flash', view: { type: 'custom:hk-grid-view', cards: [{ type: 'x' }] } },
        { path: 'ecoflow', title: 'EcoFlow', icon: '', view: {} },
        { path: 'lights', title: 'Not Lights', view: { cards: [] } }];
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  var paths = g.views.map(function (v) { return v.path; });
  ok('its custom pages, in its order, before the rooms; not one it already has; not one that is not there',
     paths.indexOf('energy') > 0 && paths.indexOf('ecoflow') === paths.indexOf('energy') + 1 &&
     paths.filter(function (p) { return p === 'lights'; }).length === 1 && paths.indexOf('nope') < 0 &&
     (paths.indexOf('room-kitchen') < 0 || paths.indexOf('ecoflow') < paths.indexOf('room-kitchen')), paths);
  var en = g.views.filter(function (v) { return v.path === 'energy'; })[0];
  ok('...each its own view under its title and icon', en.title === 'Energy' && en.icon === 'mdi:flash' &&
     en.type === 'custom:hk-grid-view' && en.cards[0].type === 'x', en);
  ok('...a page with no cards yet is an empty page', JSON.stringify(g.views.filter(function (v) { return v.path === 'ecoflow'; })[0].cards) === '[]');
  // ORDER -> PAGES: a custom page and Browse Music where placed
  WB.pages = ['music', 'energy', 'browse', 'lights'];
  WB.custom_pages = ['energy', 'ecoflow'];
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  var paths = g.views.map(function (v) { return v.path; });
  var at = function (p) { return paths.indexOf(p); };
  ok('the page order places a custom page and Browse Music: Play Music, Energy, Browse Music',
     at('playmusic') > 0 && at('energy') === at('playmusic') + 1 && at('music-browse') === at('energy') + 1, paths);
  ok('...a custom page not placed still comes, before the rooms', at('ecoflow') > at('music-browse') &&
     (at('room-kitchen') < 0 || at('ecoflow') < at('room-kitchen')), paths);
  ok('...and Browse Music follows Play Music in the menu', g.views[at('music-browse')].menu_follows === 'playmusic' &&
     g.views[at('music-browse')].menu !== false);
  // HOME PAGE OFF: only its custom pages, the first opening
  WB.home_page = false;
  WB.custom_pages = ['ecoflow', 'nope', 'energy'];
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  ok('Home Page off: the screen is only its custom pages, in its order (one not there left out)',
     JSON.stringify(g.views.map(function (v) { return v.path; })) === '["ecoflow","energy"]', g.views.map(function (v) { return v.path; }));
  ok('...the menu names its first item after that page, not Home', g.views[0].menu_title === 'EcoFlow' && !g.views[0].menu_icon, g.views[0]);
  WB.custom_pages = [];
  return window.hkStrategy.generate({}, hass);
}).then(function (g) {
  ok('...with none listed it is a whole screen as usual', g.views[0].path === 'home' && g.views.length > 3, g.views.map(function (v) { return v.path; }));
  delete WB.home_page;
  delete WB.pages;
  CP = null;
  delete window.hkSettings;
  delete S['input_boolean.wallpanel_screensaver_kitchen'];
}).then(function () {
  // ACCESSORY SETTINGS (each detail sheet's gear): the house's
  // name and glyph, what it is shown as, whether Home shows it, the room's order.
  ACC = { entities: {
      'switch.kitchen_coffee': { name: 'Coffee Maker', icon: 'hk:coffee', show_as: 'light' },
      'light.kitchen_table_light': { home: false },
      'lock.front': { names: { '': 'Front', other: 'Elsewhere' }, icon: 'mdi:gate' } },
    rooms: { kitchen: ['switch.kitchen_coffee', 'light.kitchen_lights'] } };
  window.hkSettings = { get: function (p, f) { return p === 'accessories' ? ACC : f; },
                        weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, hass);
}).then(function (g) {
  var k = tilesOf(g.views[0], 'Kitchen');
  ok('the room\'s own order first, the rest after', k.map(function (t) { return t.entity; }).join() ===
     'switch.kitchen_coffee,light.kitchen_lights', k.map(function (t) { return t.entity; }));
  ok('Show in Home off: not on Home...', JSON.stringify(g.views[0]).indexOf('light.kitchen_table_light') < 0);
  var kr = g.views.filter(function (v) { return v.path === 'room-kitchen'; })[0];
  ok('...but on its room\'s page', JSON.stringify(kr).indexOf('light.kitchen_table_light') > 0);
  ok('the accessory\'s name, as given', k[0].name === 'Coffee Maker', k[0].name);
  ok('its glyph', k[0].icon === 'hk:coffee');
  ok('...at that glyph\'s measured size', k[0].icon_size === '26px', k[0].icon_size);
  var lock = tilesOf(g.views[0], 'Garage').filter(function (t) { return t.entity === 'lock.front'; })[0];
  ok('a name for this dashboard beats the house\'s', lock.name === 'Front', lock && lock.name);
  ok('an mdi: glyph is drawn from the hk set, in every state', lock.icon === 'hk:gate' && !lock.icon_states);
  ACC.into = { den: 'kitchen' };
  return window.hkStrategy.generate({ music: false }, hass).then(function (g2) {
    ok('a room shown inside another: its things in that room, no section of its own',
       JSON.stringify(roomNames(g2.views[0])).indexOf('Den') < 0 &&
       tilesOf(g2.views[0], 'Kitchen').some(function (t) { return t.entity === 'media_player.den_tv'; }), roomNames(g2.views[0]));
    var kp = g2.views.filter(function (v) { return v.path === 'room-kitchen'; })[0];
    ok('...and its page spans both areas', Array.isArray(kp.area) && kp.area.join() === 'kitchen,den', kp.area);
    delete ACC.into;
    return g;
  });
}).then(function (g) {
  // GLYPH SIZES: every glyph the gear offers that has a measured size
  ACC.entities['switch.kitchen_coffee'] = { icon: 'hk:sword' };
  var sw = window.hkStrategy.tileFor({ states: S, entities: { 'switch.kitchen_coffee': {} } }, 'switch.kitchen_coffee', 'x');
  ok('a measured glyph is drawn at its size (Sword 27 px, not the flat 23)', sw.icon === 'hk:sword' && sw.icon_size === '27px', sw);
  ACC.entities['switch.kitchen_coffee'] = { icon: 'hk:washing-machine' };
  sw = window.hkStrategy.tileFor({ states: S, entities: { 'switch.kitchen_coffee': {} } }, 'switch.kitchen_coffee', 'x');
  ok('...and one with no measured size keeps the card\'s default', sw.icon === 'hk:washing-machine' && !('icon_size' in sw), sw);
  ACC.entities['switch.kitchen_coffee'] = { name: 'Coffee Maker', icon: 'hk:coffee', show_as: 'light' };
  return g;
}).then(function () {
  // a favorite given its own glyph in the gear is drawn at that glyph's size
  var favHS = { boards: { '': { favorites: ['lock.front'] } },
                accessories: { entities: { 'lock.front': { icon: 'hk:fire' } } } };
  window.hkSettings = { get: function (p, f) { return p in favHS ? favHS[p] : f; },
                        weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, hass).then(function (g) {
    var fav = JSON.parse(JSON.stringify(g.views[0])), found = null;
    (function walk(n) { if (!n || typeof n !== 'object' || found) return;
      if (n.type === 'custom:hk-favorite-card' && n.entity === 'lock.front') { found = n; return; }
      Object.keys(n).forEach(function (k) { walk(n[k]); }); })(fav);
    ok('a favorite\'s own glyph keeps its measured size (not 23 px)',
       found && found.icon === 'hk:fire' && found.icon_size === '26px', found);
    window.hkSettings = { get: function (p, f) { return p === 'accessories' ? ACC : f; },
                          weatherId: function () { return 'weather.home'; } };
    return g;
  });
}).then(function (g) {
  ok('Show as a light: a light\'s glyph unless it has its own', window.hkStrategy.tileFor(
     { states: S, entities: { 'switch.kitchen_coffee': {} } }, 'switch.kitchen_coffee', 'x').icon === 'hk:coffee');
  delete window.hkSettings;
}).then(function () {
  // FAVORITES AND ROOM TILES: a favorite's own name and glyph, lights
  // together, brightness / On-Off; a computer's Wake-on-LAN tile; a room shown
  // inside another keeping its order; Apple TVs and speakers as the room tiles
  // draw them.
  var P = {};
  [st('light.k1', 'on', { friendly_name: 'Kitchen Main Lights', brightness: 128 }),
   st('light.k2', 'on', { friendly_name: 'Kitchen Table Light' }),
   st('switch.s1', 'on', { friendly_name: 'Kitchen Outlet' }),
   st('cover.g', 'closed', { friendly_name: 'Garage Door', device_class: 'garage' }),
   st('button.pc_wake_on_lan', 'unknown', { friendly_name: 'PC - Wake On Lan' }),
   st('button.car_horn', 'unknown', { friendly_name: 'Car Honk Horn' }),
   st('light.flood', 'off', { friendly_name: 'Yard Flood' }),
   st('light.deck1', 'off', { friendly_name: 'Deck One' }), st('light.deck2', 'off', { friendly_name: 'Deck Two' }),
   st('media_player.atv', 'playing', { friendly_name: 'Kitchen Apple TV', app_name: 'YouTube' }),
   st('media_player.spk', 'idle', { friendly_name: 'Kitchen Speaker' }),
   st('weather.home', 'sunny', {})
  ].forEach(function (x) { P[x.entity_id] = x; });
  var ph = { states: P, themes: { themes: {} },
    areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' }, garage: { area_id: 'garage', name: 'Garage' },
             yard: { area_id: 'yard', name: 'Yard' }, deck: { area_id: 'deck', name: 'Deck' } },
    devices: { atv: { area_id: 'kitchen', model: 'Apple TV 4K' }, spk: { area_id: 'kitchen', model: 'pi' } },
    entities: { 'light.k1': { area_id: 'kitchen' }, 'light.k2': { area_id: 'kitchen' }, 'switch.s1': { area_id: 'kitchen' },
      'cover.g': { area_id: 'garage' }, 'button.pc_wake_on_lan': { area_id: 'kitchen', platform: 'wake_on_lan' },
      'button.car_horn': { area_id: 'kitchen', platform: 'tesla_fleet' }, 'light.flood': { area_id: 'yard' },
      'light.deck1': { area_id: 'deck' }, 'light.deck2': { area_id: 'deck' },
      'media_player.atv': { device_id: 'atv' }, 'media_player.spk': { device_id: 'spk' } } };
  P['input_boolean.block_game'] = st('input_boolean.block_game', 'on', { friendly_name: 'Block Game' });
  var PS = { boards: { '': { favorites: ['light.k1', 'switch.s1', 'cover.g', 'input_boolean.block_game'] } },
    accessories: { entities: {
        'light.k1': { name: 'Lights', fav_name: 'Main + Table Lights', fav_with: ['light.k2', 'light.nope'] },
        'cover.g': { name: 'Door', fav_name: 'Garage Door' },
        'switch.s1': { fav_icon: 'hk:coffee', on_text: 'Brewing' },
        // a helper with no area: its room line, color and state names are its own
        'input_boolean.block_game': { fav_room: 'Block', color: 'orange',
                                      fav_icon: 'hk:gamepad-variant', on_text: 'Blocked', off_text: 'Allowed' } },
      rooms: { yard: ['light.flood'], deck: ['light.deck2', 'light.deck1'] }, into: { deck: 'yard' } } };
  window.hkSettings = { get: function (p, f) { return p in PS ? PS[p] : f; }, weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, ph).then(function (g) {
    var home = g.views[0], favs = {};
    (function walk(n) { if (!n || typeof n !== 'object') return;
      if (n.type === 'custom:hk-favorite-card') favs[n.entity] = n; Object.keys(n).forEach(function (k) { walk(n[k]); }); })(home);
    var k1 = favs['light.k1'];
    ok('a favorite\'s own name ("Main + Table Lights" where its room tile is "Lights")', k1 && k1.name === 'Main + Table Lights', k1);
    ok('...together with the table light: one group, lit while either is, reading their brightness',
       JSON.stringify(k1.group) === '["light.k1","light.k2"]' && k1.group_lit === 'any' && k1.label_mode === 'group_brightness', k1);
    ok('...a tap toggles both (one that is not there is left out)',
       k1.tap_action.perform_action === 'light.toggle' && JSON.stringify(k1.tap_action.target.entity_id) === '["light.k1","light.k2"]', k1.tap_action);
    ok('...its glyph still toggles it alone', k1.icon_tap_action && k1.icon_tap_action.action === 'toggle');
    ok('a switch favorite reads On / Off, with the glyph picked for it as a favorite, at its size',
       favs['switch.s1'].label_mode === 'on_off' && favs['switch.s1'].icon === 'hk:coffee' && favs['switch.s1'].icon_size === '26px', favs['switch.s1']);
    var bg = favs['input_boolean.block_game'];
    ok('a favorite with its own room line, color and state names; the room line never shortens its name ("Block" over Block Game)',
       bg && bg.room === 'Block' && bg.name === 'Block Game' && bg.icon_color === 'orange' && bg.icon === 'hk:gamepad-variant' &&
       bg.label_map && bg.label_map.on === 'Blocked' && bg.label_map.off === 'Allowed', bg);
    var s1t = tilesOf(home, 'Kitchen').filter(function (t) { return t.entity === 'switch.s1'; })[0];
    ok('...and a switch\'s On name on its room tile too ("Brewing"), Off left as it was',
       s1t && s1t.label_map && s1t.label_map.on === 'Brewing' && !('off' in s1t.label_map), s1t);
    ok('the garage door favorite is named as a favorite, its room tile as the room\'s',
       favs['cover.g'].name === 'Garage Door' && tilesOf(home, 'Garage')[0].name === 'Door', [favs['cover.g'].name, tilesOf(home, 'Garage')[0].name]);
    var kt = tilesOf(home, 'Kitchen');
    var wake = kt.filter(function (t) { return t.entity === 'button.pc_wake_on_lan'; })[0];
    ok('a Wake-on-LAN button is a tile: "PC", Wake, a tap presses it',
       wake && wake.name === 'PC' && wake.label === 'Wake' && wake.icon === 'hk:desktop-tower' && wake.icon_size === '25px' &&
       wake.tap_action.perform_action === 'button.press', wake);
    ok('...and no other button is (a car\'s horn is not a thing in a room)', !kt.some(function (t) { return t.entity === 'button.car_horn'; }));
    ok('a room shown inside another brings its own order along, after the room\'s',
       tilesOf(home, 'Yard').map(function (t) { return t.entity; }).join() === 'light.flood,light.deck2,light.deck1',
       tilesOf(home, 'Yard').map(function (t) { return t.entity; }));
    var atv = kt.filter(function (t) { return t.entity === 'media_player.atv'; })[0];
    var spk = kt.filter(function (t) { return t.entity === 'media_player.spk'; })[0];
    ok('an Apple TV reads like the other room tiles (no source_first)', atv && atv.icon === 'hk:apple-tv' && !atv.label_mode, atv);
    ok('a speaker\'s glyph is 36 px, as the room tiles draw it', spk && spk.icon === 'hk:speaker' && spk.icon_size === '36px', spk);
    delete window.hkSettings;
  });
}).then(function () {
  // a contact's own glyph as its pair; the Vacuums page's own order; the
  // radar map only when the card is installed
  var Q = {};
  [st('binary_sensor.entry', 'on', { device_class: 'door', friendly_name: 'Garage Entry Door' }),
   st('binary_sensor.win', 'off', { device_class: 'window', friendly_name: 'Den Window' }),
   st('vacuum.down', 'docked', { friendly_name: 'Downstairs' }), st('vacuum.office', 'docked', { friendly_name: 'Office' }),
   st('vacuum.up', 'docked', { friendly_name: 'Upstairs' }), st('weather.home', 'sunny', {})
  ].forEach(function (x) { Q[x.entity_id] = x; });
  var qh = { states: Q, themes: { themes: {} }, config: { country: 'US' },
    areas: { garage: { area_id: 'garage', name: 'Garage' }, den: { area_id: 'den', name: 'Den' } }, devices: {},
    entities: { 'binary_sensor.entry': { area_id: 'garage' }, 'binary_sensor.win': { area_id: 'den' },
                'vacuum.down': {}, 'vacuum.office': {}, 'vacuum.up': {} } };
  var QS = { accessories: { entities: { 'binary_sensor.entry': { name: 'Entry', icon: 'hk:garage' },
                                        'binary_sensor.win': { icon: 'hk:lamp' } },
                            rooms: {}, pages: { vacuums: ['vacuum.down', 'vacuum.up'] } },
             extras: { radar: '/hacsfiles/weather-radar-card/weather-radar-card.js?v=1' } };
  window.hkSettings = { get: function (p, f) {
    var parts = p.split('.'), v = QS;
    for (var i = 0; i < parts.length; i++) { if (v == null) return f; v = v[parts[i]]; }
    return v === undefined ? f : v; }, weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, qh).then(function (g) {
    var by = {}; g.views.forEach(function (v) { by[v.path] = v; });
    var tiles = []; (function walk(n) { if (!n || typeof n !== 'object') return;
      if (n.entity && /favorite-card$/.test(n.type || '')) tiles.push(n); Object.keys(n).forEach(function (k) { walk(n[k]); }); })(by['doors-windows']);
    var entry = tiles.filter(function (t) { return t.entity === 'binary_sensor.entry'; })[0];
    var win = tiles.filter(function (t) { return t.entity === 'binary_sensor.win'; })[0];
    ok('a door drawn as a garage in its gear: garage open, garage shut, its own name under its room',
       entry && entry.icon === 'hk:garage-open' && entry.icon_states.off === 'hk:garage' && entry.name === 'Entry' && entry.room === 'Garage', entry);
    ok('...a glyph with no pair is drawn in both states', win && win.icon === 'hk:lamp' && !win.icon_states, win);
    var vac = []; (function walk(n) { if (!n || typeof n !== 'object') return;
      if (n.type === 'custom:hk-vacuum-card') vac.push(n.entity); Object.keys(n).forEach(function (k) { walk(n[k]); }); })(by.vacuums);
    ok('the Vacuums page in its own order, the rest after', vac.join() === 'vacuum.down,vacuum.up,vacuum.office', vac);
    var wx = JSON.stringify(by.weather);
    ok('the radar map when the card is installed: its URL, NOAA in the US',
       wx.indexOf('"module":"/hacsfiles/weather-radar-card/weather-radar-card.js?v=1"') > 0 && wx.indexOf('"data_source":"NOAA"') > 0);
    QS.extras = { radar: null };
    return window.hkStrategy.generate({ music: false }, qh);
  }).then(function (g2) {
    var wx = JSON.stringify(g2.views.filter(function (v) { return v.path === 'weather'; })[0]);
    ok('...and none when it is not', wx.indexOf('weather-radar-card') < 0);
    delete window.hkSettings;
  });
}).then(function () {
  // THIRD-PARTY CARDS' OWN OPTIONS (YAML) over the tuned settings
  var O = window.hkStrategy.overlay;
  var base = { a: 1, b: { c: 2, d: 3 }, l: [1, 2], gone: true };
  var o = O(base, { b: { c: 9 }, l: [7], gone: null, n: 'x' });
  ok('options go key by key into nested mappings; a list replaces; null removes',
     JSON.stringify(o) === '{"a":1,"b":{"c":9,"d":3},"l":[7],"n":"x"}' && base.b.c === 2, o);
  ok('...and none (or not a mapping) leaves the tuned settings', JSON.stringify(O(base, null)) === JSON.stringify(base) &&
     JSON.stringify(O(base, [1])) === JSON.stringify(base));
  var R = { states: { 'weather.home': st('weather.home', 'sunny', {}),
                      'input_boolean.wallpanel_screensaver_kitchen': st('input_boolean.wallpanel_screensaver_kitchen', 'off', {}) },
            themes: { themes: {} }, config: { country: 'DE', unit_system: { temperature: '°C' } }, areas: {}, devices: {}, entities: {} };
  var RS = { boards: { '': { kiosk: true, kiosk_options: { admin_settings: { hide_header: false } },
                             screensaver: true, tablet_user: 'kitchen', idle_room: 'kitchen',
                             wallpanel_options: { idle_time: 300, enabled: null, style: { 'wallpanel-screensaver-info-box': { background: 'red' } } } } },
             weather: { radar: { zoom_level: 8, type: 'custom:not-a-radar' } },
             extras: { radar: '/hacsfiles/weather-radar-card/weather-radar-card.js?v=2' },
             'look.photos': 'media-source://x' };
  window.hkSettings = { get: function (p, f) {
    if (p in RS) return RS[p];
    var parts = p.split('.'), v = RS;
    for (var i = 0; i < parts.length; i++) { if (v == null) return f; v = v[parts[i]]; }
    return v === undefined ? f : v; }, weatherId: function () { return 'weather.home'; } };
  return window.hkStrategy.generate({ music: false }, R).then(function (g) {
    ok('Kiosk Mode: the tuned settings, then the dashboard\'s own options',
       g.kiosk_mode && g.kiosk_mode.hide_header === true && g.kiosk_mode.hide_sidebar === true &&
       g.kiosk_mode.admin_settings && g.kiosk_mode.admin_settings.hide_header === false, g.kiosk_mode);
    ok('the screensaver\'s temperature carries Home Assistant\'s unit letter',
       g.wallpanel && g.wallpanel.cards[1].unit === 'C', g.wallpanel && g.wallpanel.cards[1]);
    ok('WallPanel: its options over the tuned screensaver, the rest kept',
       g.wallpanel && g.wallpanel.idle_time === 300 && g.wallpanel.display_time === 30 && !('enabled' in g.wallpanel) &&
       g.wallpanel.style['wallpanel-screensaver-info-box'].background === 'red' &&
       g.wallpanel.style['wallpanel-screensaver-info-box']['--wp-card-width'] === '600px' &&
       g.wallpanel.profiles['user.kitchen'].enabled === true, g.wallpanel && { idle: g.wallpanel.idle_time, en: g.wallpanel.enabled });
    var wx = JSON.stringify(g.views.filter(function (v) { return v.path === 'weather'; })[0]);
    ok('the radar: its options over the tuned map (RainViewer outside the US); its type is not an option',
       wx.indexOf('"zoom_level":8') > 0 && wx.indexOf('"data_source":"RainViewer"') > 0 &&
       wx.indexOf('"type":"custom:weather-radar-card"') > 0 && wx.indexOf('not-a-radar') < 0, wx.slice(wx.indexOf('radar') - 20, wx.indexOf('radar') + 200));
    delete window.hkSettings;
  });
}).then(function () {
  // WHEN HOME ASSISTANT BUILDS AGAIN: only a change the build reads.
  var S = window.hkStrategy;
  var reg = function (extra) {
    return { entities: Object.assign({ 'light.a': { entity_id: 'light.a', area_id: 'kitchen', device_id: 'd1', platform: 'hue', translation_key: 'x' } }, extra || {}),
             devices: { d1: { id: 'd1', area_id: 'kitchen', sw_version: '1.0' } },
             areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'f0', picture: null } },
             floors: { f0: { floor_id: 'f0', name: 'Ground', level: 0 } } };
  };
  var h0 = reg();
  var h1 = reg(); h1.entities['light.a'].translation_key = 'y'; h1.devices.d1.sw_version = '1.1';
  ok('a registry change the build does not read (a firmware version): no rebuild', S.shouldRegenerate({}, h0, h1) === false);
  var h2 = reg(); h2.entities['light.a'].area_id = 'hall';
  ok('an entity moved to another room: rebuild', S.shouldRegenerate({}, h0, h2) === true);
  var h3 = reg({ 'light.b': { entity_id: 'light.b', area_id: 'kitchen' } });
  ok('a new entity: rebuild', S.shouldRegenerate({}, h0, h3) === true);
  var h4 = reg(); h4.areas.kitchen.name = 'Cook Room';
  ok('a room renamed: rebuild', S.shouldRegenerate({}, h0, h4) === true);
  ok('the same registries: no rebuild', S.shouldRegenerate({}, h0, Object.assign({}, h0)) === false);

  // ...and of the settings, what the build reads
  var ST = { boards: { 'hk-kitchen-ui': { pages: ['lights'], chips: ['security', 'lights'], cameras: ['camera.a'] },
                       'dashboard-loft': { chips: ['climate'], cameras: ['camera.b'] } },
             accessories: { entities: { 'light.a': { name: 'Lamp', status: true } }, rooms: {} } };
  window.hkSettings = { get: function (p, f) {
    var v = ST, parts = p.split('.');
    for (var i = 0; i < parts.length; i++) { if (v == null) return f; v = v[parts[i]]; }
    return v === undefined ? f : v; } };
  var sig = function () { return S.inputs('hk-kitchen-ui'); };
  var s0 = sig();
  ST.boards['hk-kitchen-ui'].chips = ['lights', 'security'];
  ok('this screen\'s chips reordered (a live card): no rebuild', sig() === s0);
  ST.boards['dashboard-loft'].chips = ['lights'];
  ok('another screen\'s chips: no rebuild', sig() === s0);
  ST.accessories.entities['light.a'].status = false;
  ok('an accessory\'s What counts switch (arrives as kinds): no rebuild', sig() === s0);
  ST.boards['dashboard-loft'].cameras = ['camera.c'];
  var s1 = sig();
  ok('another screen\'s cameras (they pick this one\'s channel): rebuild', s1 !== s0);
  ST.boards['hk-kitchen-ui'].pages = ['lights', 'climate'];
  ok('this screen\'s pages: rebuild', sig() !== s1);
  var s2 = sig();
  ST.accessories.entities['light.a'].name = 'Desk Lamp';
  ok('an accessory renamed: rebuild', sig() !== s2);
  delete window.hkSettings;
}).then(function () {
  // --- On Phones, Lights & Outlets, Sensor Coverage
  S['switch.porch_outlet'] = st('switch.porch_outlet', 'off', { friendly_name: 'Porch Outlet' });
  hass.entities['switch.porch_outlet'] = { area_id: 'kitchen' };
  S['binary_sensor.sink_leak'] = st('binary_sensor.sink_leak', 'unavailable', { device_class: 'moisture', friendly_name: 'Kitchen Sink Leak' });
  hass.entities['binary_sensor.sink_leak'] = { area_id: 'kitchen' };
  var B2 = { phone_header: 'strip' };
  window.hkSettings = { get: function (p, f) {
    if (p === 'boards') return { '': B2 };
    if (p === 'kinds') return { lights: ['light.kitchen_table_light', 'switch.porch_outlet'], leaks: ['binary_sensor.sink_leak'] };
    return f; }, weatherId: function () { return 'weather.home'; }, onChange: function () {} };
  return window.hkStrategy.generate({ music: false }, hass).then(function (g) {
    var home = g.views[0], top = home.cards[0].cards;
    ok('On Phones = Weather Strip: the header over 640 px, the strip under it (Home\'s own layout)',
       top[0].type === 'conditional' && top[0].conditions[0].media_query === '(min-width: 640px)' &&
       top[0].card.type === 'custom:hk-header-card' && top[1].card.type === 'custom:hk-weather-strip-card' &&
       top[1].conditions[0].media_query === '(max-width: 639.98px)' && top[1].card.tap_action.navigation_path === './weather',
       JSON.stringify(top).slice(0, 300));
    var byP = {}; g.views.forEach(function (v) { byP[v.path] = v; });
    ok('an outlet among the lights: the page is Lights & Outlets, the menu says Lights',
       byP.lights.title === 'Lights & Outlets' && byP.lights.menu_title === 'Lights' && cards(byP.lights).indexOf('Lights & Outlets') > 0,
       [byP.lights.title, byP.lights.menu_title]);
    var cover = byP.water && byP.water.cards[1];
    ok('Water: Sensor Coverage while a leak sensor has not reported (neither on nor off)',
       cover && cover.type === 'conditional' && cover.conditions[0].condition === 'or' &&
       JSON.stringify(cover.conditions[0].conditions[0].state_not) === '["on","off"]' &&
       cards(cover).indexOf('"label_mode":"unreported"') > 0 && cards(cover).indexOf('binary_sensor.sink_leak') > 0,
       JSON.stringify(cover).slice(0, 300));
    B2.phone_header = 'header';
    return window.hkStrategy.generate({ music: false }, hass);
  }).then(function (g2) {
    ok('On Phones = header (the default): the header alone', g2.views[0].cards[0].cards[0].type === 'custom:hk-header-card');
    delete window.hkSettings;
  });
}).then(function () {
  print(fail ? 'FAIL ' + fail + ' STRATEGY TESTS' : 'ALL ' + pass + ' STRATEGY TESTS PASS');
}).catch(function (e) { print('Exception: ' + e + ' ' + (e.stack || '')); });
