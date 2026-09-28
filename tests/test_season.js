// The seasonal sky's per-day schedule: does it dress up today, and is tonight
// spooky? The point of these is that the answer must be STABLE for a whole
// local day, identical on every tablet, and guaranteed on the holiday itself.
var root = HK_ROOT, pass = 0, fail = 0;
function check(name, cond) { print((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; }

globalThis.window = globalThis;
globalThis.addEventListener = function () {};
globalThis.location = { pathname: '/' };
globalThis.setInterval = function () { return 1; };
globalThis.clearInterval = function () {};
function stub() {
  return { style: { setProperty: function () {}, getPropertyValue: function () { return ''; } },
           classList: { toggle: function () {}, add: function () {} },
           appendChild: function () {}, insertBefore: function () {},
           querySelector: function () { return null; },
           querySelectorAll: function () { return []; },
           getRootNode: function () { return null; },
           remove: function () {}, children: [] };
}
globalThis.document = { createElement: stub, addEventListener: function () {},
  readyState: 'complete', head: { appendChild: function () {} },
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }, body: stub() };
// hk-settings.js owns the calendar (skyWindow) and is always loaded first on
// a page: a bootstrap module, ahead of hk-loader and so of hk-sky.
globalThis.localStorage = { getItem: function () { return null; }, setItem: function () {} };
load(root + '/frontend/modules/hk-settings.js');
load(root + '/frontend/modules/hk-sky.js');

var S = window.hkSky._schedule, D = window.hkSky._daysUntil;
function d(y, m, day) { return new Date(y, m - 1, day); }   // local, 1-based month

// ---- the holiday itself is never a gamble -------------------------------
check('Halloween is certain on Oct 31',      S('halloween', d(2026,10,31)).show);
check('Halloween is certain on Oct 29',      S('halloween', d(2026,10,29)).show);
check('Christmas is certain on Dec 25',      S('christmas', d(2026,12,25)).show);
check('Christmas is certain on Dec 23',      S('christmas', d(2026,12,23)).show);
check('Thanksgiving is certain on the day',  S('thanksgiving', d(2026,11,26)).show);
check('Halloween night is spooky on Oct 31', S('halloween', d(2026,10,31)).spooky);

// ---- the garland stays out of early December ----------------------------
// This is the whole point of `within`: sensor.us_holidays says Christmas from
// Thanksgiving, which is a solid month, and a month of garland is wallpaper.
var early = [d(2026,11,27), d(2026,11,30), d(2026,12,3), d(2026,12,6)];
check('no garland between Thanksgiving and Dec 6',
      early.every(function (x) { return !S('christmas', x).show; }));
check('Dec 7 is the first eligible garland day',
      D('christmas', d(2026,12,7)) === 18);

// ---- eligibility ends after the day ------------------------------------
check('nothing after Halloween',  !S('halloween', d(2026,11,1)).show);
check('nothing after Christmas',  !S('christmas', d(2026,12,26)).show);

// ---- determinism: same day, same answer ---------------------------------
var a = S('halloween', new Date(2026, 9, 12, 3, 14));
var b = S('halloween', new Date(2026, 9, 12, 23, 59));
check('same local day gives the same answer at any hour',
      a.show === b.show && a.spooky === b.spooky);
// 8pm local is UTC midnight in EDT -- the bug this guards is a field that
// rebuilds itself in front of you every evening.
var e1 = S('halloween', new Date(2026, 9, 12, 19, 59));
var e2 = S('halloween', new Date(2026, 9, 12, 20, 1));
check('the day does not roll over at 8pm local (UTC midnight)',
      e1.show === e2.show && e1.spooky === e2.spooky);
check('consecutive days differ somewhere in the season',
      (function () {
        for (var i = 1; i < 30; i++) {
          var x = S('halloween', d(2026, 10, i)), y = S('halloween', d(2026, 10, i + 1));
          if (x.show !== y.show) return true;
        }
        return false;
      })());

// ---- the odds actually ramp ---------------------------------------------
function rate(name, from, to, key) {
  var on = 0, n = 0;
  for (var m = from[0], day = from[1]; ; ) {
    var x = d(2026, m, day);
    if (x > d(2026, to[0], to[1])) break;
    var r = S(name, x); n++; if (key ? r.spooky : r.show) on++;
    day++; var dim = new Date(2026, m, 0).getDate();
    if (day > dim) { day = 1; m++; }
  }
  return n ? on / n : 0;
}
var farRate  = rate('halloween', [9, 22], [10, 5]);
var nearRate = rate('halloween', [10, 20], [10, 31]);
check('Halloween gets commoner as Oct 31 approaches (' +
      farRate.toFixed(2) + ' -> ' + nearRate.toFixed(2) + ')', nearRate > farRate);
check('Halloween is not on every day early on', farRate < 0.95);
check('the spooky set is rarer than the leaves',
      rate('halloween', [9, 22], [10, 28], true) <= rate('halloween', [9, 22], [10, 28]));

// ---- days-until arithmetic ----------------------------------------------
check('Thanksgiving 2026 is Nov 26', D('thanksgiving', d(2026,11,1)) === 25);
check('Thanksgiving 2027 is Nov 25', D('thanksgiving', d(2027,11,1)) === 24);
check('days to Christmas counts down', D('christmas', d(2026,12,20)) === 5);
check('an unknown season shows nothing', !S('', d(2026,10,31)).show);

// ---- the calendar is configurable ---------------------------------------
var HS = window.hkSettings, W = HS.skyWindow;
check('built in: Halloween starts Sep 22', !W('halloween', d(2026,9,21)).inside && W('halloween', d(2026,9,22)).inside);
check('built in: Christmas is Dec 7..25', !W('christmas', d(2026,12,6)).inside && W('christmas', d(2026,12,7)).inside);
check('built in: Thanksgiving ends on US Thanksgiving', W('thanksgiving', d(2026,11,26)).daysToEnd === 0 &&
      !W('thanksgiving', d(2026,11,27)).inside);
check('built in: winter wraps New Year', W('winter', d(2027,1,10)).inside && W('winter', d(2026,12,21)).inside &&
      !W('winter', d(2026,3,20)).inside);
HS._apply({ configured: true, sky: { hemisphere: 'south' } });
check('south: spring is Sep 22..Dec 20', W('spring', d(2026,10,1)).inside && !W('spring', d(2026,4,1)).inside);
HS._apply({ configured: true, sky: { christmas_from: '12-20', christmas_to: '01-05' } });
check('a custom window may run past New Year', W('christmas', d(2027,1,5)).inside && !W('christmas', d(2027,1,6)).inside &&
      W('christmas', d(2026,12,20)).inside && !W('christmas', d(2026,12,19)).inside);
check('...and counts down to ITS last day', W('christmas', d(2026,12,31)).daysToEnd === 5);
check('...and the sky follows it', S('christmas', d(2027,1,5)).show && !S('christmas', d(2026,12,10)).show);
HS._apply({ configured: true, sky: { halloween_often: 'every_day' } });
var every = true;
for (var i = 22; i <= 30; i++) every = every && S('halloween', d(2026,9,i)).show;
check('every day: every day of the window', every);
HS._apply({ configured: true, sky: { halloween_often: 'near_end' } });
check('only the last days: not before them', !S('halloween', d(2026,10,27)).show && !S('halloween', d(2026,9,24)).show);
check('...and always on them', S('halloween', d(2026,10,29)).show && S('halloween', d(2026,10,31)).show);
HS._apply({ configured: true, sky: { halloween_often: 'every_day', spooky_often: 'never' } });
var anySpooky = false;
for (var j = 22; j <= 30; j++) anySpooky = anySpooky || S('halloween', d(2026,9,j)).spooky;
check('spooky nights never: leaves only', !anySpooky && !S('halloween', d(2026,10,31)).spooky &&
      S('halloween', d(2026,10,31)).show);
HS._apply({ configured: true, sky: { halloween_often: 'every_day', spooky_often: 'every_night' } });
var allSpooky = true;
for (var k = 22; k <= 30; k++) allSpooky = allSpooky && S('halloween', d(2026,9,k)).spooky;
check('spooky nights every night', allSpooky);
HS._apply({ configured: true, sky: { thanksgiving_to: '11-30' } });
check('Thanksgiving can end on a date instead', W('thanksgiving', d(2026,11,30)).daysToEnd === 0);
HS._apply({ configured: true });

// ---- the witch flies against the moon it is given -----------------------
// The spooky moon: a 384px box, 0.85 of it disc, centred at 70% / 24%.
var WP = window.hkSky._witchPath;
function witchChecks(label, VW, VH) {
  var p = WP(VW, VH, 384, 0.70, 0.24), disc = 384 * 0.85, cx = VW * 0.70;
  var span = p.w * 975 / 1024 / disc;
  check(label + 'broom tip to bristles is 55-60% of the visible disc (' + span.toFixed(3) + ')',
        span >= 0.55 && span <= 0.60);
  check(label + 'a 2:1 box, like the art', Math.abs(p.h - p.w / 2) <= 1);
  check(label + 'right to left', p.dx < 0);
  check(label + 'inside the viewport where she appears',
        p.left >= 0 && p.left + p.w <= VW && p.top >= 0 && p.top + p.h <= VH);
  check(label + 'inside the viewport where she fades out',
        p.left + p.dx >= 0 && p.left + p.dx + p.w <= VW && p.top + p.dy >= 0 && p.top + p.dy + p.h <= VH);
  check(label + 'mostly horizontal', Math.abs(p.dy) <= Math.abs(p.dx) * 0.05 && p.dy !== 0);
  return { p: p, cx: cx, disc: disc };
}
var t = witchChecks('1280x800: ', 1280, 800);
check('1280x800: starts clear of the disc on the right',
      t.p.left >= t.cx + t.disc / 2 - 1);
check('1280x800: ends clear of the disc on the left',
      t.p.left + t.p.dx + t.p.w <= t.cx - t.disc / 2 + 1);
// Across the UPPER disc, clear of the status chips over its middle, and with
// the disc still wider than she is at that height.
var lineY = t.p.top + t.p.dy / 2 + t.p.h / 2, moonY = 800 * 0.24, off = moonY - lineY;
check('1280x800: flies the upper disc', off > t.disc * 0.2 && off < t.disc * 0.35);
check('1280x800: the disc is wider than her there',
      2 * Math.sqrt(Math.pow(t.disc / 2, 2) - off * off) > t.p.w * 975 / 1024);
check('1280x800: her whole box stays on the moon vertically',
      t.p.top >= moonY - t.disc / 2 && t.p.top + t.p.dy + t.p.h <= moonY + t.disc / 2);
check('follows the moon, not a constant',
      WP(1280, 800, 384, 0.40, 0.24).left < t.p.left);
witchChecks('phone 390x844: ', 390, 844);

print(fail ?'FAIL ' + fail + ' SEASON TESTS' : 'ALL ' + pass + ' SEASON TESTS PASS');
