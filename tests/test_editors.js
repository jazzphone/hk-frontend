// EVERY CARD'S PICKER ENTRY AND EDITOR, as a person meets them.
//
// Editors drift the way code does: labels that are the raw config key
// ("min_hour_col"), dropdowns listing internal values ("on_off_sentence"), a
// Status text dropdown with NO options, a vacuum sensor labelled with a
// tile's "Room line", developer notes as picker descriptions, a card that
// exists but is missing from the picker. None of it throws, so nothing else
// catches it. This walks every registered hk-*-card and holds it to the rules.
//
// It cannot render ha-form (jsc has no HA frontend); that an edit actually
// reaches the preview is checked in a browser.
var DIR = HK_ROOT + '/';
load(DIR + 'tests/dom.js');
window.customCards = [];
var defined = {}, od = customElements.define.bind(customElements);
customElements.define = function (n, c) { defined[n] = c; return od(n, c); };
['hk-base', 'hk-tile', 'hk-chip', 'hk-stat', 'hk-control', 'hk-row', 'hk-weather', 'hk-popup',
 'hk-media', 'hk-cameras', 'hk-security', 'hk-home', 'hk-energy', 'hk-layout'].forEach(function (f) {
  load(DIR + 'frontend/cards/' + f + '.js');
});
var pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; } else { fail++; print('  FAIL  ' + n + (x ? '   ' + x : '')); } }

var hass = { states: {} };
['light.a', 'climate.a', 'sensor.a', 'script.a', 'vacuum.a', 'media_player.a', 'input_select.a',
 'weather.a', 'number.a', 'cover.a', 'fan.a', 'alarm_control_panel.a', 'lock.a', 'switch.a', 'timer.a']
  .forEach(function (id) { hass.states[id] = { entity_id: id, state: 'on', attributes: {} }; });

function flatten(schema, out) {
  (schema || []).forEach(function (s) {
    if (s.type === 'expandable') ok('section has a title', !!s.title, JSON.stringify(s).slice(0, 80));
    if (s.schema) flatten(s.schema, out); else out.push(s);
  });
  return out;
}
var RAW = /_/;                       // a label or option still showing a config key
var JARGON = /`|hk-|button-card|swipe|\bTHE\b|\bpx\b/;

var cards = Object.keys(defined).filter(function (n) { return /^hk-.*-card$/.test(n); }).sort();
print('=== ' + cards.length + ' cards ===');
cards.forEach(function (tag) {
  var C = defined[tag];
  var entry = window.customCards.filter(function (c) { return c.type === tag; })[0];
  ok(tag + ' is in the card picker', !!entry);
  if (!entry) return;
  ok(tag + ' name is "HK …"', /^HK [A-Z]/.test(entry.name), entry.name);
  ok(tag + ' description is a sentence for people', !!entry.description && /\.$/.test(entry.description)
     && !JARGON.test(entry.description), entry.description);
  ok(tag + ' has a starter config', typeof C.getStubConfig === 'function');
  var stub = null;
  try { stub = C.getStubConfig && C.getStubConfig(hass); } catch (e) { stub = 'ERR ' + e; }
  ok(tag + ' starter config builds', stub && typeof stub === 'object', String(stub));
  ok(tag + ' has an editor', typeof C.getConfigElement === 'function');
  if (typeof C.getConfigElement !== 'function' || tag === 'hk-camera-mosaic-card') return;  // mosaic: test_editor.js

  var probe = C.getConfigElement(), EC = defined[String(probe.tagName || '').toLowerCase()];
  var ed = EC ? new EC() : probe;
  if (!ed.appendChild) ed.appendChild = function () {};
  ed.hass = hass; ed.setConfig({ type: 'custom:' + tag });
  var form = ed._form, fields = flatten(form && form.schema, []);
  ok(tag + ' editor has fields', fields.length > 0);
  var seen = {};
  fields.forEach(function (f) {
    var label = form.computeLabel(f);
    ok(tag + '.' + f.name + ' has a readable label', label && !RAW.test(label), label);
    ok(tag + '.' + f.name + ' appears once', !seen[f.name]); seen[f.name] = true;
    var sel = f.selector && f.selector.select;
    if (sel) {
      ok(tag + '.' + f.name + ' dropdown is not empty', (sel.options || []).length > 0);
      (sel.options || []).forEach(function (o) {
        ok(tag + '.' + f.name + ' option "' + o.value + '" has a readable name',
           o.label && !RAW.test(o.label), o.label);
      });
    }
    if (typeof form.computeHelper === 'function') {
      var h = form.computeHelper(f);
      ok(tag + '.' + f.name + ' help text is not a raw key', !h || !/^[a-z_]+$/.test(h), h);
    }
  });
});

print('\n=== the specific traps ===');
function fieldsOf(tag) {
  var C = defined[tag], p = C.getConfigElement(), EC = defined[String(p.tagName).toLowerCase()];
  var e = new EC(); e.appendChild = function () {}; e.hass = hass; e.setConfig({});
  return { form: e._form, list: flatten(e._form.schema, []) };
}
['hk-light-card', 'hk-fan-card', 'hk-cover-card'].forEach(function (t) {
  ok(t + ' offers no empty Status text dropdown',
     !fieldsOf(t).list.some(function (f) { return f.name === 'label_mode'; }));
});
var vac = fieldsOf('hk-vacuum-card'), room = vac.list.filter(function (f) { return f.name === 'room'; })[0];
ok('vacuum room is labelled as a sensor', /sensor/i.test(vac.form.computeLabel(room)));
ok('vacuum room does not borrow the tile help text', vac.form.computeHelper(room) !== window.hkCards.HELPERS.room);
ok('speaker picker is in the picker', window.customCards.some(function (c) { return c.type === 'hk-speaker-picker-card'; }));

print('\n' + (fail ? 'FAILURES: ' + fail : 'ALL ' + pass + ' EDITORS TESTS PASS'));
