// The vacuum area picker's AUTOMATIC rooms (hk-area-select-card): a card
// whose YAML names no `floors` shows the areas Clean Areas offers, live,
// grouped by Home Assistant's own floors -- in any house, from its own areas.
// `floors:` written out still wins.
if (typeof HK_ROOT === 'undefined') throw new Error('run through tests/run');
var root = HK_ROOT;
var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); }
}
load(root + '/tests/dom.js');
['hk-base', 'hk-home'].forEach(function (n) { load(root + '/frontend/cards/' + n + '.js'); });

function card(cfg) {
  var c = Object.create(customElements.get('hk-area-select-card').prototype);
  c._config = cfg; c._onConfig();
  c._root = new (Object.getPrototypeOf(document.createElement('div')).constructor)('div');
  c._root.querySelector = function () { return null; };
  c._renders = 0;
  c._render = function () { this._renders++; };
  return c;
}
var AREAS = { kitchen: { name: 'Kitchen', floor_id: 'main' }, loft: { name: 'Loft', floor_id: 'up' },
              den: { name: 'Den', floor_id: 'main' }, shed: { name: 'Shed' }, attic: { name: 'Attic', floor_id: 'up' } };
var FLOORS = { main: { name: 'Main Floor', level: 0 }, up: { name: 'Upstairs', level: 1 } };
function hassWith(sub) {
  return { states: {}, areas: AREAS, floors: FLOORS, services: { hk_frontend: { clean_areas: {} } },
           connection: { subscribeMessage: sub } };
}

// ------------------------------------------------------------ which mode
ok('no floors in the YAML: automatic', card({}).__proto__ && card({})._auto === true);
ok('an empty floors list (the picker’s stub): automatic', card({ floors: [] })._auto === true);
var fixed = card({ floors: [{ name: 'Mine', areas: [{ id: 'x', name: 'X' }] }] });
ok('floors written out: as written, and never asks', fixed._auto === false && fixed._floors()[0].name === 'Mine' &&
   fixed._sigOf() === 'static');

// ------------------------------------------------------------ the list
var got = null, asked = null;
var c = card({});
Object.defineProperty(c, 'isConnected', { value: true });
c._hass = hassWith(function (fn, msg) { got = fn; asked = msg; return Promise.resolve(function () {}); });
ok('while Clean Areas has not answered: nothing drawn yet (not "no rooms")', c._floors() === null);
c._sigOf();
ok('it asks Clean Areas for the offered areas', asked && asked.type === 'hk_clean_areas/subscribe');
got({ configured: true, areas: ['loft', 'kitchen', 'shed', 'den', 'gone'] });
var f = c._floors();
ok('grouped by floor, lowest level first, then rooms with no floor',
   f.map(function (x) { return x.name; }).join() === 'Main Floor,Upstairs,Rooms', f);
ok('...each floor A to Z by the area’s own name', f[0].areas.map(function (a) { return a.name; }).join() === 'Den,Kitchen', f[0]);
ok('...an area the house no longer has is left out', JSON.stringify(f).indexOf('gone') < 0);
ok('the answer redraws the card', c._renders > 0);
var s1 = c._sigOf();
AREAS.den.name = 'Family Room';
ok('a renamed area changes the signature (it redraws)', c._sigOf() !== s1);
AREAS.den.name = 'Den';
var subs = 0;
c._hass = hassWith(function () { subs++; return Promise.resolve(function () {}); });
c._sigOf(); c._sigOf();
ok('one subscription, not one per hass push', subs === 0);

// THE ORDER within a floor: the card's `order:`, else the screen's Room
// order when it is used on pages, else A to Z
var o1 = card({ order: ['kitchen', 'den'] });
o1._hass = hassWith(function () { return Promise.resolve(function () {}); });
o1._offer = { configured: true, areas: ['den', 'kitchen', 'loft', 'attic'] };
ok('the card’s own order: Kitchen before Den', o1._floors()[0].areas.map(function (a) { return a.id; }).join() === 'kitchen,den');
ok('...a room not in it follows, A to Z', o1._floors()[1].areas.map(function (a) { return a.id; }).join() === 'attic,loft');
var saved = globalThis.hkCards;
globalThis.hkCards = Object.assign({}, saved || {}, { menu: { board: function () { return { page_rooms: 'order', room_order: ['loft', 'kitchen', 'den'] }; } } });
var o2 = card({});
o2._hass = o1._hass; o2._offer = o1._offer;
ok('no order on the card: the screen’s Room order', o2._floors()[1].areas.map(function (a) { return a.id; }).join() === 'loft,attic' &&
   o2._floors()[0].areas.map(function (a) { return a.id; }).join() === 'kitchen,den');
var s2 = o2._sigOf();
globalThis.hkCards.menu.board = function () { return { page_rooms: 'floor', room_order: ['loft', 'kitchen', 'den'] }; };
ok('...only when it is used on pages (else A to Z), and a change redraws', o2._floors()[0].areas.map(function (a) { return a.id; }).join() === 'den,kitchen' && o2._sigOf() !== s2);
globalThis.hkCards = saved;

// a room no longer offered is no longer selected
var r = card({});
r._hass = hassWith(function () { return Promise.resolve(function () {}); });
r._offer = { configured: true, areas: ['kitchen'] };
r._sel = new Set(['kitchen', 'loft']);
r._render = customElements.get('hk-area-select-card').prototype._render;
r._statusNode = function () { return document.createElement('div'); };
r._pill = function () { return document.createElement('div'); };
r._render();
ok('a selected room that is no longer offered is dropped', r._sel.size === 1 && r._sel.has('kitchen'), Array.from(r._sel));

// ------------------------------------------------------------ not added
var m = card({});
Object.defineProperty(m, 'isConnected', { value: true });
var tries = 0;
m._hass = hassWith(function () { tries++; return Promise.reject({ code: 'unknown_command' }); });
m._sigOf();
var done = Promise.resolve().then(function () {}).then(function () {}).then(function () {
  ok('Clean Areas not added: the card knows', m._offer && m._offer.missing === true);
  ok('...and an empty list, which says to add it', m._floors().length === 0);
  m._sigOf(); m._sigOf();
  ok('...and it is not asked again on every hass push', tries === 1, tries);
  var ms = card({ start_script: 'script.clean_rooms' });
  ms._hass = m._hass; ms._offer = { configured: false, areas: [], missing: true };
  ok('...but a house’s own clean script still gets every area', ms._floors().reduce(function (n, x) { return n + x.areas.length; }, 0) === 5);
  print('\n' + (fail ? 'FAIL ' + fail + ' of ' + (pass + fail) : 'ALL ' + pass + ' AREA PICKER TESTS PASS'));
  if (fail) throw new Error(fail + ' failed');
});
