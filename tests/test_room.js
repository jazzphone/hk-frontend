// A room page's status row (cards/hk-room.js): what it shows, read from the
// area and nothing else, and the words it uses. Nothing here names a real
// house.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
var root = HK_ROOT;
load(root + '/tests/dom.js');
window.customCards = [];
window.loadCardHelpers = function () { return new Promise(function () {}); };
load(root + '/frontend/cards/hk-base.js');
load(root + '/frontend/cards/hk-room.js');
load(root + '/frontend/cards/hk-strategy.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}
var items = window.hkRoom._.items;

function st(id, state, attrs) { return { entity_id: id, state: state, attributes: attrs || {} }; }
var S = {};
function add(id, state, attrs, reg) {
  S[id] = st(id, state, attrs);
  hass.entities[id] = reg || { area_id: 'den' };
}
var hass = {
  states: S, entities: {},
  devices: { dev1: { area_id: 'den' }, dev2: { area_id: 'porch' } },
  areas: { den: { name: 'Den', temperature_entity_id: 'sensor.den_temp', humidity_entity_id: 'sensor.den_hum' },
           porch: { name: 'Porch' }, other: { name: 'Other' } }
};
add('sensor.den_temp', '71.4', { unit_of_measurement: '°F', device_class: 'temperature' });
add('sensor.den_hum', '46', { unit_of_measurement: '%', device_class: 'humidity' });
add('sensor.tablet_battery_temp', '98', { unit_of_measurement: '°F', device_class: 'temperature' },
    { area_id: 'den', entity_category: 'diagnostic' });
add('switch.den_plug', 'on', { device_class: 'outlet' });
add('switch.den_relay', 'on', {});                         // a switch, not an outlet
add('cover.den_shades', 'open', { device_class: 'shade' });
add('fan.den_ceiling', 'on', {});
add('fan.den_desk', 'off', {}, { device_id: 'dev1' });      // area from its device
add('binary_sensor.den_window_l', 'off', { device_class: 'window' });
add('binary_sensor.den_window_r', 'off', { device_class: 'window' });
add('binary_sensor.den_window_m', 'off', { device_class: 'window' });
add('binary_sensor.den_motion', 'off', { device_class: 'motion' });
add('binary_sensor.den_camera_motion', 'off', { device_class: 'motion' });
add('binary_sensor.den_radar', 'on', { device_class: 'occupancy' });
add('binary_sensor.den_hidden_door', 'on', { device_class: 'door' }, { area_id: 'den', hidden: true });
add('lock.den_door', 'unavailable', {});
add('binary_sensor.porch_leak', 'off', { device_class: 'moisture' }, { device_id: 'dev2' });
add('cover.porch_garage', 'closed', { device_class: 'garage' }, { area_id: 'porch' });
add('binary_sensor.elsewhere_window', 'on', { device_class: 'window' }, { area_id: 'other' });

print('=== what a room shows ===');
var row = items(hass, ['den'], {});
var t = row.map(function (i) { return i.title + '=' + i.value; });
ok('the Home app\'s order: readings, accessories, sensors',
   JSON.stringify(t) === JSON.stringify(['Temperature=71°', 'Humidity=46%', 'Outlet=On', 'Blinds=Open', '2 Fans=1 On',
                                         '3 Windows=Closed', 'Motion=Not Detected', 'Occupancy=Detected']), JSON.stringify(t));
ok('temperature and humidity are the AREA\'s own sensors, not a diagnostic one',
   row[0].ids[0] === 'sensor.den_temp');
ok('the dot sits at the reading: 71 °F near the top, 46 % just left of it',
   Math.abs(row[0].gauge - 0.5) < 0.02 && row[1].gauge > 0.4 && row[1].gauge < 0.5);
ok('a device\'s entity counts in its device\'s area', row[4].ids.indexOf('fan.den_desk') >= 0);
ok('a plain switch is not an outlet', row[2].ids.join() === 'switch.den_plug');
ok('a hidden entity is left out', !row.some(function (i) { return i.kind === 'doors'; }));
ok('an unavailable one is left out (not "Unlocked")', !row.some(function (i) { return i.kind === 'locks'; }));
ok('nothing from another area', row.filter(function (i) { return i.kind === 'windows'; })[0].ids.length === 3);
ok('an idle sensor is dimmed, a detected one is not',
   row.filter(function (i) { return i.kind === 'motion'; })[0].dim === true &&
   row.filter(function (i) { return i.kind === 'occupancy'; })[0].dim === false);
ok('every motion sensor in the room counts', row.filter(function (i) { return i.kind === 'motion'; })[0].ids.length === 2);

print('\n=== words ===');
S['binary_sensor.den_window_l'].state = 'on';
var w = items(hass, ['den'], {}).filter(function (i) { return i.kind === 'windows'; })[0];
ok('one of three open: "1 Open"', w.value === '1 Open');
S['binary_sensor.den_window_r'].state = 'on'; S['binary_sensor.den_window_m'].state = 'on';
ok('all open: "Open"', items(hass, ['den'], {}).filter(function (i) { return i.kind === 'windows'; })[0].value === 'Open');
S['binary_sensor.den_window_l'].state = S['binary_sensor.den_window_r'].state = S['binary_sensor.den_window_m'].state = 'off';
S['lock.den_door'].state = 'unlocked';
var lk = items(hass, ['den'], {}).filter(function (i) { return i.kind === 'locks'; })[0];
ok('an unlocked lock says so, in the alert colour', lk.value === 'Unlocked' && lk.alert === true);
S['lock.den_door'].state = 'locked';
ok('a locked one is quiet', items(hass, ['den'], {}).filter(function (i) { return i.kind === 'locks'; })[0].alert === false);

print('\n=== a room across two areas ===');
var two = items(hass, ['den', 'porch'], {});
ok('both areas count: the porch\'s garage door and leak sensor join the den\'s',
   two.some(function (i) { return i.kind === 'garage' && i.value === 'Closed'; }) &&
   two.some(function (i) { return i.kind === 'leaks' && i.value === 'None'; }));
ok('the first area with a temperature sensor gives it', two[0].value === '71°');

print('\n=== the accessories on the page ===');
add('cover.den_shades_matter', 'open', { device_class: 'shade' });       // a bridge's copy
var onPage = items(hass, ['den'], { entities: ['cover.den_shades', 'fan.den_ceiling', 'switch.den_plug'] });
var kinds = {}; onPage.forEach(function (i) { kinds[i.kind] = i; });
ok('given the page\'s devices, blinds count only those: "Blinds", not "2 Blinds"', kinds.blinds.title === 'Blinds' && kinds.blinds.ids.length === 1);
ok('...and fans: the one fan tile, not the desk fan elsewhere in the area', kinds.fans.title === 'Fan');
ok('sensors still come from the whole area', kinds.windows.ids.length === 3 && kinds.motion.ids.length === 2);
ok('without them the area counts, bridge copy and all', items(hass, ['den'], {}).filter(function (i) { return i.kind === 'blinds'; })[0].title === '2 Blinds');
delete S['cover.den_shades_matter']; delete hass.entities['cover.den_shades_matter'];

print('\n=== choosing what shows ===');
var only = items(hass, ['den'], { items: ['motion', 'temperature'] });
ok('items: shows only those, in the house order', only.map(function (i) { return i.kind; }).join() === 'temperature,motion');
var ex = items(hass, ['den'], { exclude: ['binary_sensor.den_camera_motion'] });
ok('exclude: takes one out of a count', ex.filter(function (i) { return i.kind === 'motion'; })[0].ids.length === 1);
ok('a card may name its own temperature sensor',
   items(hass, ['porch'], { temperature: 'sensor.den_temp' })[0].value === '71°');
ok('no area sensor and nothing to count: nothing to show', items(hass, ['other'], { items: ['temperature', 'fans'] }).length === 0);
S['sensor.den_temp'].attributes.unit_of_measurement = '°C'; S['sensor.den_temp'].state = '21.5';
ok('Celsius centres on 21.5', Math.abs(items(hass, ['den'], {})[0].gauge - 0.5) < 0.02);

print('\n=== the row keeps its place when something in the room changes ===');
var RC = customElements.get('hk-room-status-card');
var rc = new RC(); rc.setConfig({ area: 'den' });
var H1 = { states: S, entities: hass.entities, devices: hass.devices, areas: hass.areas };
rc.hass = H1;
var row0 = rc._root.querySelector('.row');
row0.scrollLeft = 120;                                   // a phone scrolled it sideways
var S2 = Object.assign({}, S); S2['fan.den_desk'] = st('fan.den_desk', 'on', {});
rc.hass = { states: S2, entities: hass.entities, devices: hass.devices, areas: hass.areas };
var row1 = rc._root.querySelector('.row');
ok('a fan turning on redraws the buttons', rc._list.filter(function (i) { return i.kind === 'fans'; })[0].value !== undefined);
ok('...in the same scroller, still scrolled', row1 === row0 && row1.scrollLeft === 120);

print('\n=== the room page as a view strategy ===');
window.hkStrategy.room({ area: 'den' }, { states: S, entities: hass.entities, devices: hass.devices, areas: hass.areas,
                                          themes: { themes: { 'HK Kiosk': {} } } }).then(function (v) {
  var types = v.cards.map(function (c) { return c.type; });
  ok('custom:hk-room builds the page from the area', v.type === 'custom:hk-grid-view' && types[1] === 'custom:hk-room-status-card', types.join());
  ok('...named by the area, in the HK Kiosk theme', v.cards[0].cards[1].name === 'Den' && v.theme === 'HK Kiosk');
  print('\n' + (fail ? fail + ' FAILED, ' + pass + ' passed' : 'ALL ' + pass + ' ROOM TESTS PASS'));
  if (fail) throw new Error(fail + ' failed');
}).catch(function (e) { print('FAIL ' + e); throw e; });
drainMicrotasks && drainMicrotasks();
