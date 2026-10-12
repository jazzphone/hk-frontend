// hk-saver-panel.js: the screensaver music's Speakers panel -- what Add,
// Update and Transfer ask the integration for, what a preset's chip picks,
// and the line that says so before the press. (The panel itself, its turn and
// its taps are checked live, headless: hk_house/tools/headless.)
var DIR = HK_ROOT + '/';
load(DIR + 'tests/dom.js');

var pass = 0, fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass++; print('  PASS  ' + name); }
  else { fail++; print('  FAIL  ' + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); }
}
function same(a, b) { return JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort()); }

load(DIR + 'frontend/modules/hk-saver-panel.js');
var U = window.hkSaverPanel._;
ok('loads: the panel and its CSS', typeof window.hkSaverPanel.create === 'function' && /\.mpanel\{/.test(window.hkSaverPanel.CSS));

var LR = 'lr', K = 'k', O = 'o', L = 'loft', G = 'guest';
var group = [LR, K, O];

// nothing picked: nothing to press
var p = U.plan(group, [], []);
ok('nothing picked: Add and Transfer both dimmed', p.add === null && p.transfer === null && p.addLabel === 'Add');

// ADD: the rooms playing, and the picked ones with them
p = U.plan(group, [L], []);
ok('Add: the rooms playing plus the picked one', same(p.add, [LR, K, O, L]) && p.add[0] === LR, p.add);
ok('...Transfer: the picked one alone', same(p.transfer, [L]));
ok('...still reads Add', p.addLabel === 'Add');

// UPDATE: a playing room marked to leave is a transfer to the rooms that stay
p = U.plan(group, [], [O]);
ok('only a room leaving: Add asks for the rooms that stay', same(p.add, [LR, K]), p.add);
ok('...and reads Update', p.addLabel === 'Update');
ok('...Transfer stays dimmed (nothing picked to move to)', p.transfer === null);

// both at once: one request
p = U.plan(group, [G], [K]);
ok('a room in and a room out: one request, the leader first', same(p.add, [LR, O, G]) && p.add[0] === LR, p.add);
ok('...reads Add while it adds', p.addLabel === 'Add');

// the same rooms again is no request (the engine would refuse it)
ok('picks that end where it started: nothing to Add', U.plan(group, [], []).add === null);

// PRESETS fill in the picks
var everywhere = [LR, K, O, L, G, 'bed'], pk = U.presetPicks(group, everywhere);
ok('a preset: its rooms not playing are picked', same(pk.sel, [L, G, 'bed']) && pk.drop.length === 0, pk);
ok('...and Add asks for exactly its rooms (the engine plays its sync group)', same(U.plan(group, pk.sel, pk.drop).add, everywhere));
var down = [LR, K, 'bath'];
pk = U.presetPicks(group, down);
ok('a preset that leaves a playing room out marks it to leave', same(pk.sel, ['bath']) && same(pk.drop, [O]), pk);
ok('...Add asks for exactly the preset', same(U.plan(group, pk.sel, pk.drop).add, down));

// THE LINE OVER THE BUTTONS: says what each would do
var names = { lr: 'Living Room', k: 'Kitchen', o: 'Office', loft: 'Loft', guest: 'Guest Bedroom' };
var nm = function (e) { return names[e] || e; };
var c0 = U.caption(group, [], [], 'Living Room +2', nm);
ok('nothing picked: how it works', /Tap rooms to <b>Add<\/b>/.test(c0) && /<b>Transfer<\/b>/.test(c0), c0);
var c1 = U.caption(group, [L], [], 'Living Room +2', nm);
ok('one picked: who joins, and that Transfer stops the rest', /Loft joins Living Room \+2/.test(c1) && /only Loft plays, the rest stop/.test(c1), c1);
var c2 = U.caption(group, [L, G], [O], 'Living Room +2', nm);
ok('two picked, one leaving: both said', /Loft and Guest Bedroom join/.test(c2) && /Office stops/.test(c2) && /only Loft and Guest Bedroom play/.test(c2), c2);
var c3 = U.caption(group, [], [O, K], 'Living Room +2', nm);
ok('only leaving: Update says who stops', /<b>Update<\/b>: Office and Kitchen stop, the rest play on/.test(c3), c3);
ok('names are escaped', !/<i>/.test(U.caption(group, ['<i>x'], [], 'A', function (e) { return e; })));

print('\n' + (fail ? fail + ' FAILED, ' : 'ALL ') + pass + ' SAVER PANEL TESTS PASS');
if (fail) throw new Error(fail + ' failed');
