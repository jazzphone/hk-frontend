// The thermostat dial's mode buttons are the modes the THERMOSTAT has
// (hvac_modes), not a fixed four.
var root = HK_ROOT;
var pass = 0, fail = 0;
function check(name, cond, got) {
  print((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '   got=' + JSON.stringify(got)));
  cond ? pass++ : fail++;
}
load(root + '/tests/dom.js');
['hk-base', 'hk-tile', 'hk-control'].forEach(function (n) {
  load(root + '/frontend/cards/' + n + '.js');
});

function modes(hvacModes) {
  var C = customElements.get('hk-control-card');
  var c = new C();
  c.setConfig({ type: 'custom:hk-control-card', entity: 'climate.x' });
  // The harness does not parse markup, so the markup is read as written.
  var html = '';
  Object.defineProperty(c.shadowRoot, 'innerHTML', { get: function () { return html; },
                                                     set: function (v) { html = String(v); } });
  var a = { current_temperature: 70, temperature: 68, hvac_action: 'idle', min_temp: 45, max_temp: 90 };
  if (hvacModes) a.hvac_modes = hvacModes;
  c.hass = { states: { 'climate.x': { state: 'heat', attributes: a } }, callService: function () {} };
  var out = [], re = /data-mode="([^"]+)"/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

var ecobee = modes(['heat_cool', 'heat', 'cool', 'off']);
check('a full thermostat keeps the familiar order', ecobee.join() === 'off,heat,cool,heat_cool', ecobee);
var car = modes(['heat_cool', 'off']);
check('a thermostat without heat or cool shows only what it has', car.join() === 'off,heat_cool', car);
var extra = modes(['off', 'heat', 'cool', 'auto', 'dry']);
check('modes beyond the four follow them', extra.join() === 'off,heat,cool,auto,dry', extra);
var none = modes(null);
check('an entity that lists none gets the classic four', none.join() === 'off,heat,cool,heat_cool', none);

// hk-control.js is its own Lovelace resource and can run before hk-base.js,
// whose material, palette and escaper it draws with. It must not draw until
// that has run -- a frame from stand-ins would be held by the render gate --
// and must draw as soon as it has.
(function () {
  var saved = window.hkCards;
  var C = customElements.get('hk-control-card');
  var c = new C();
  c.setConfig({ type: 'custom:hk-control-card', entity: 'climate.x', color: 'teal' });
  var html = null;
  Object.defineProperty(c.shadowRoot, 'innerHTML', { get: function () { return html; },
                                                     set: function (v) { html = String(v); } });
  window.hkCards = undefined;
  try {
    c.hass = { states: { 'climate.x': { state: 'heat', attributes: { temperature: 68 } } },
               callService: function () {} };
  } finally { window.hkCards = saved; }
  check('before hk-base.js: nothing drawn', html === null, html);
  dispatchEvent(new Event('hk-cards-ready'));
  check('hk-cards-ready: drawn', html !== null && html.indexOf('tstat') !== -1);
  check('...in the palette\'s accent teal',
        c.style['--hk-accent'] === window.hkCards.PALETTE.accent.teal &&
        c.style['--hk-accent'] === 'rgba(64, 200, 224, 0.96)', c.style['--hk-accent']);
})();

print(fail ? 'FAIL ' + fail + ' THERMOSTAT TESTS' : 'ALL ' + pass + ' THERMOSTAT TESTS PASS');
if (fail) throw new Error('thermostat tests failed');
