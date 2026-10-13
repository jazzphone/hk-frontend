// The EcoFlow page's cards (hk-energy.js HOME POWER): hk-power-flow-card,
// hk-power-status-card, hk-house-battery-card, hk-segment-card --
// CONSTRUCTED AND DRIVEN against this house's own entity ids and units (the
// panel reports W and kW side by side; the backup runtime in hours).
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/tests/card_harness.js');
load(HK_ROOT + '/frontend/modules/hk-stats.js');
load(HK_ROOT + '/frontend/modules/hk-charts.js');
load(HK_ROOT + '/frontend/cards/hk-base.js');
load(HK_ROOT + '/frontend/cards/hk-energy.js');

function powerHouse(over) {
  var rows = {
    'sensor.panel_ac_in': ['1072.0', { unit_of_measurement: 'W' }],
    'sensor.panel_ac_out': ['1072.0', { unit_of_measurement: 'W' }],
    'sensor.battery_charge_power': ['0.0', { unit_of_measurement: 'W' }],
    'sensor.battery_output_power': ['0.0', { unit_of_measurement: 'kW' }],
    'sensor.battery_level': ['86', { unit_of_measurement: '%' }],
    'sensor.stored': ['21.3', { unit_of_measurement: 'kWh' }],
    'sensor.backup': ['15.78', { unit_of_measurement: 'h' }],
    'number.reserve': ['10', { unit_of_measurement: '%' }],
    'number.limit': ['90', { unit_of_measurement: '%' }],
    'number.speed': ['2500', { unit_of_measurement: 'W' }],
    'sensor.pack1': ['86', { unit_of_measurement: '%' }],
    'sensor.pack1_t': ['96.8', { unit_of_measurement: '°F' }],
    'binary_sensor.grid': ['on', {}],
    'binary_sensor.fault': ['off', {}],
    'switch.eps': ['on', {}],
    'binary_sensor.storm': ['off', {}],
    'select.mode': ['none', { options: ['none', 'time_of_use', 'self_powered', 'scheduled'] }]
  };
  Object.keys(over || {}).forEach(function (k) { rows[k] = over[k]; });
  return H.house(rows);
}
var CFG = { grid: 'sensor.panel_ac_in', home: 'sensor.panel_ac_out', charge: 'sensor.battery_charge_power',
            discharge: 'sensor.battery_output_power', level: 'sensor.battery_level', grid_status: 'binary_sensor.grid' };
function drawn(card) { return H.morphed(card._card); }

H.run('power cards', [
  function () {
    H.section('hk-power-flow-card');
    var house = powerHouse(), card = H.make('hk-power-flow-card');
    card.setConfig(Object.assign({ type: 'custom:hk-power-flow-card' }, CFG));
    card.hass = house.hass();
    var html = drawn(card);
    H.ok('no art: the flow chart, the three figures', html.indexOf('class="fchart"') > 0 && html.indexOf('1.07 kW') > 0 && html.indexOf('86%') > 0, html.slice(0, 200));
    H.ok('the grid line flows (1.07 kW in), the battery line does not (standing by)',
      (html.match(/class="run"/g) || []).length === 1 && html.indexOf('Standing by') > 0);
    H.ok('on the grid', html.indexOf('on the grid') > 0);
    H.ok('a tap on a figure opens its sensor: the grid, the house, the battery', html.indexOf('data-more="sensor.panel_ac_in"') > 0 &&
      html.indexOf('data-more="sensor.panel_ac_out"') > 0 && html.indexOf('data-more="sensor.battery_level"') > 0);
    card.setConfig(Object.assign({ type: 'custom:hk-power-flow-card', art: '/hk/art/ecoflow/house.webp' }, CFG));
    card.hass = house.hass();
    html = drawn(card);
    H.ok('with art: the picture, its cable lit, the wall battery filled to 86%', html.indexOf('/hk/art/ecoflow/house.webp') > 0 &&
      html.indexOf('run flowline') > 0 && /class="wfill"[^>]*height="82\.6"/.test(html), html.slice(0, 300));
    card.hass = house.set('sensor.battery_output_power', '1.2');
    html = drawn(card);
    H.ok('a battery giving 1.2 kW (its sensor in kW): powering the house, the light falling and flowing into the house',
      html.indexOf('Powering the house') > 0 && html.indexOf('shim down') > 0 && html.indexOf('flowline bat') > 0);
  },
  function () {
    H.section('hk-power-status-card');
    var house = powerHouse(), card = H.make('hk-power-status-card');
    card.setConfig({ type: 'custom:hk-power-status-card', grid_status: 'binary_sensor.grid', problem: 'binary_sensor.fault', level: 'sensor.battery_level',
      backup: 'sensor.backup', home: 'sensor.panel_ac_out', charge: 'sensor.battery_charge_power', discharge: 'sensor.battery_output_power',
      eps: 'switch.eps', storm: 'binary_sensor.storm' });
    card.hass = house.hass();
    var html = drawn(card);
    H.ok('the source first, then the backup, EPS, Storm Mode', html.indexOf('Running on the grid') < html.indexOf('15h 47m') &&
      html.indexOf('15h 47m') < html.indexOf('EPS is on') && html.indexOf('Storm Mode is off') > 0, html);
    H.eq('four rows', (html.match(/class="hli/g) || []).length, 4);
    H.ok('each sentence opens what it is about: the grid, the backup, EPS, Storm Mode', html.indexOf('data-more="binary_sensor.grid"') > 0 &&
      html.indexOf('data-more="sensor.backup"') > 0 && html.indexOf('data-more="switch.eps"') > 0 && html.indexOf('data-more="binary_sensor.storm"') > 0);
    card.hass = house.set('binary_sensor.grid', 'off');
    html = drawn(card);
    H.ok('the grid down: its own red row first, and the backup reads as what is left', html.indexOf('hli alert') > 0 &&
      html.indexOf('The grid is down') < html.indexOf('The battery will last') && html.indexOf('Running on the grid') < 0);
    card.hass = house.set('binary_sensor.fault', 'on');
    html = drawn(card);
    H.eq('a fault too: two red rows', (html.match(/hli alert/g) || []).length, 2);
  },
  function () {
    H.section('hk-house-battery-card');
    var house = powerHouse(), card = H.make('hk-house-battery-card');
    card.setConfig({ type: 'custom:hk-house-battery-card', level: 'sensor.battery_level', stored: 'sensor.stored', backup: 'sensor.backup',
      reserve: 'number.reserve', limit: 'number.limit', speed: 'number.speed', charge: 'sensor.battery_charge_power',
      discharge: 'sensor.battery_output_power', eps: 'switch.eps', packs: [{ level: 'sensor.pack1', temperature: 'sensor.pack1_t' }] });
    card.hass = house.hass();
    var html = drawn(card);
    H.ok('filled to 86%, the reserve and the limit marked where they belong', html.indexOf('class="fill" style="width:86%"') > 0 &&
      html.indexOf('* 0.1)') > 0 && html.indexOf('Reserve 10%') > 0 && html.indexOf('* 0.9)') > 0 && html.indexOf('Limit 90%') > 0, html.slice(0, 400));
    H.ok('21.3 kWh and 15h 47m of backup in it', html.indexOf('21.3 kWh · 15h 47m of backup at this load') > 0);
    H.ok('the pack with its temperature; EPS; the charging speed', html.indexOf('97°F') > 0 && html.indexOf('>On<') > 0 && html.indexOf('2.50<u>kW</u>') > 0);
    H.ok('standing by: no light running', html.indexOf('hshim') < 0 && html.indexOf('standing by') > 0);
    H.ok('the battery opens its level, a pack its own', html.indexOf('class="cell" data-more="sensor.battery_level"') > 0 && html.indexOf('class="pk2" data-more="sensor.pack1"') > 0);
    card.hass = house.set('sensor.battery_charge_power', '800');
    H.ok('charging: light running forward', drawn(card).indexOf('class="hshim"') > 0 && drawn(card).indexOf('>charging<') > 0);
    card.hass = house.set('sensor.battery_level', '8');
    H.ok('at or under its reserve: red', drawn(card).indexOf('class="fill low"') > 0);
  },
  function () {
    H.section('hk-segment-card');
    var house = powerHouse(), card = H.make('hk-segment-card');
    card.setConfig({ type: 'custom:hk-segment-card', entity: 'select.mode', options: [
      { value: 'none', name: 'Off', description: 'Grid passes through.' }, { value: 'self_powered', name: 'Self-Powered', description: 'Battery first.' }] });
    card.hass = house.hass();
    var html = drawn(card);
    H.ok('the options given, the current one pressed, its line under them', html.indexOf('data-v="none" aria-selected="true">Off') > 0 &&
      html.indexOf('Grid passes through.') > 0 && html.indexOf('Time Of Use') < 0);
    card._choose('self_powered');
    H.eq('a choice asks the select', house.calls.slice(-1)[0], { domain: 'select', service: 'select_option', data: { entity_id: 'select.mode', option: 'self_powered' } });
    H.ok('...and shows at once', drawn(card).indexOf('data-v="self_powered" aria-selected="true"') > 0 && drawn(card).indexOf('Battery first.') > 0);
    var plain = H.make('hk-segment-card');
    plain.setConfig({ type: 'custom:hk-segment-card', entity: 'select.mode' });
    plain.hass = house.hass();
    H.ok('no options given: the select\'s own, prettied', drawn(plain).indexOf('>Time Of Use<') > 0 && drawn(plain).indexOf('>Self Powered<') > 0);
    H.runTimers();
  }
]);
