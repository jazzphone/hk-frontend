// hk-slider-card and hk-thermostat-card -- the named variants of
// hk-control-card, CONSTRUCTED AND DRIVEN. test_thermostat.js drives the
// generic hk-control-card; this suite drives the variants themselves.
//
// THESE ARE NOT HkBase CARDS. hk-control.js is the one card file that extends
// HTMLElement directly, so there is no _sigOf: the render gate is inline in
// `set hass` and keeps its signature in `_signature` -- JSON of the resolved
// entity id, its state and its attributes. Same contract, different spelling,
// and one real difference the tests pin: a new last_updated with the same
// state and attributes is NOT a change here (HkBase's default says it is).
//
// Configs: an EcoFlow page's sliders and a Climate page's Ecobee dials, as a
// real dashboard writes them.
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/tests/card_harness.js');
load(HK_ROOT + '/frontend/cards/hk-base.js');
load(HK_ROOT + '/frontend/cards/hk-control.js');

var LIMIT = 'number.ecoflow_panel_charge_limit';
var DOWN = 'climate.downstairs_ecobee_thermostat';
function controlHouse() {
  return H.house({
    [LIMIT]: ['90', { min: 50, max: 100, step: 1, mode: 'slider', unit_of_measurement: '%',
                      friendly_name: 'EF Charge Limit' }],
    'number.ecoflow_panel_backup_reserve_level': ['20', { min: 0, max: 100, step: 1, unit_of_measurement: '%' }],
    [DOWN]: ['heat_cool', { hvac_modes: ['heat_cool', 'heat', 'cool', 'off'], min_temp: 45,
      max_temp: 92, current_temperature: 71, current_humidity: 48, target_temp_low: 68,
      target_temp_high: 74, hvac_action: 'idle', fan_modes: ['auto', 'on'], fan_mode: 'auto',
      friendly_name: 'Downstairs' }],
    'climate.upstairs_ecobee_thermostat': ['cool', { temperature: 72, current_temperature: 74 }],
    'light.kitchen_table_light': ['off', {}]
  });
}
function make(tag, cfg) {
  var card = H.make(tag);
  card.setConfig(cfg);
  H.record(card.shadowRoot);
  return card;
}
function sig(c) { return c._signature; }

H.run('CONTROL CARDS', [

  function () {
    H.section('hk-slider-card: Charge Limit (an EcoFlow page)');
    H.throws('no entity and no entity_from: the config is refused', function () {
      H.make('hk-slider-card').setConfig({ name: 'x' });
    });
    var house = controlHouse(), card;
    H.noThrow('setConfig with the EcoFlow config', function () {
      card = make('hk-slider-card', { type: 'custom:hk-slider-card', entity: LIMIT,
        name: 'Charge Limit', color: 'green', icon: 'hk:battery-arrow-up-outline' });
    });
    H.eq('the variant IS the control, whatever the config says', card._config.control, 'number');
    H.noThrow('first hass', function () { card.hass = house.hass(); });
    var html = card.shadowRoot.__html;
    H.ok('draws the slider plate', /<div class="surface compact">/.test(html));
    H.ok('its name, its range and its value', /<div class="name">Charge Limit<\/div>/.test(html) &&
         /50–100 %/.test(html) && /data-live>90 %</.test(html));
    H.ok('the input sits at the value, the fill at its share of the range',
         /data-number type="range" min="50" max="100" step="1" value="90" style="--hk-fill:80.00%"/.test(html));
    H.ok('its icon', /icon="hk:battery-arrow-up-outline"/.test(html));
    H.eq('green by name, as the pills beside it', card.style['--hk-accent'], 'rgba(48, 209, 88, 0.96)');

    H.gate('slider', card, house,
      function () { return house.set(LIMIT, '85'); },
      function () { return house.set('number.ecoflow_panel_backup_reserve_level', '25'); }, sig);
    H.ok('the new value is drawn', /value="85"/.test(card.shadowRoot.__html));
    var r0 = card.__renders;
    card.hass = house.touch(LIMIT);
    H.eq('a new stamp with the same state and attributes does not redraw', card.__renders - r0, 0);
    card.hass = house.set(LIMIT, '85', { min: 60, max: 100, step: 1, unit_of_measurement: '%' });
    H.eq('an attribute (the range) is part of the signature', card.__renders - r0, 1);

    // The commit path: a release (`change`) writes the value, as a number.
    var input = H.part(card.shadowRoot, '[data-number]');
    input.value = '95';
    input.onchange();
    H.eq('releasing the slider sets the number', house.calls,
         [{ domain: 'number', service: 'set_value', data: { entity_id: LIMIT, value: 95 } }]);
    return H.lifecycle('slider', card, house, function (c) { c.hass = house.hass(); });
  },

  function () {
    H.section('hk-thermostat-card: Downstairs (a Climate page)');
    var house = controlHouse(), card;
    H.noThrow('setConfig with the Climate page config', function () {
      card = make('hk-thermostat-card', { type: 'custom:hk-thermostat-card', entity: DOWN,
                                          name: 'Downstairs' });
    });
    H.eq('the variant IS the control', card._config.control, 'climate');
    H.eq('a dial is five rows tall', card.getCardSize(), 5);
    H.noThrow('first hass', function () { card.hass = house.hass(); });
    var html = card.shadowRoot.__html;
    H.ok('draws the dial', /<div class="surface tstat">/.test(html) && /<svg class="ring"/.test(html));
    H.ok('name and the current reading', /<div class="tstat-name">Downstairs<\/div>/.test(html) &&
         /Current 71° · Humidity 48%/.test(html));
    H.ok('a range thermostat shows both setpoints, with two knobs',
         /data-face>68 – 74</.test(html) && /data-knob="low"/.test(html) && /data-knob="high"/.test(html));
    var modes = [], re = /data-mode="([^"]+)"/g, m;
    while ((m = re.exec(html))) modes.push(m[1]);
    H.eq('the thermostat\'s own modes, in the familiar order', modes, ['off', 'heat', 'cool', 'heat_cool']);
    H.ok('the active mode is marked', /class="segment active" data-mode="heat_cool"/.test(html));
    H.ok('its fan modes', /data-fan="auto"/.test(html) && /data-fan="on"/.test(html));
    H.eq('no colour configured: no accent override', card.style['--hk-accent'], undefined);

    H.gate('thermostat', card, house,
      function () { return house.set(DOWN, 'heat_cool', Object.assign({},
        house.hass().states[DOWN].attributes, { target_temp_high: 75, hvac_action: 'cooling' })); },
      function () { return house.set('climate.upstairs_ecobee_thermostat', 'heat',
        { temperature: 70, current_temperature: 69 }); }, sig);
    H.ok('the new setpoint is drawn', /data-face>68 – 75</.test(card.shadowRoot.__html));
    H.ok('...and cooling is named', />Cooling</.test(card.shadowRoot.__html));
    card.hass = house.set(DOWN, 'off', { hvac_modes: ['heat_cool', 'heat', 'cool', 'off'] });
    H.ok('off: the face says Off and the knobs go', /data-face>Off</.test(card.shadowRoot.__html) &&
         !/data-knob/.test(card.shadowRoot.__html));
    card.hass = house.drop(DOWN);
    H.ok('a vanished thermostat still draws (Off, no crash)', /data-face>Off</.test(card.shadowRoot.__html));
    return H.lifecycle('thermostat', card, house, function (c) { c.hass = house.hass(); });
  },

  function () {
    H.section('the slider caption: a watt range in kW (EcoFlow)');
    // "500–7200 W" wraps on an iPad and pushes the value off the card. A
    // range that reaches a kilowatt reads in kW; anything else is untouched.
    var card = make('hk-slider-card', { type: 'custom:hk-slider-card', entity: LIMIT });
    H.eq('500-7200 W reads in kW', card._rangeText(500, 7200, 'W'), '0.5\u20137.2 kW');
    H.eq('a round top end has no decimal', card._rangeText(0, 3000, 'W'), '0\u20133 kW');
    H.eq('under a kilowatt stays in watts', card._rangeText(100, 800, 'W'), '100\u2013800 W');
    H.eq('a percentage is untouched', card._rangeText(50, 100, '%'), '50\u2013100 %');
    H.eq('a non-numeric bound falls back to the literal', card._rangeText('?', 7200, 'W'), '?\u20137200 W');
    H.eq('the value beside it reads kW from a kilowatt', card._valueText(2500, 'W'), '2.5 kW');
    H.eq('...a round one without a decimal', card._valueText(3000, 'W'), '3 kW');
    H.eq('...and under a kilowatt in watts', card._valueText(800, 'W'), '800 W');
    H.eq('...other units untouched', card._valueText(90, '%'), '90 %');
  }
]);
