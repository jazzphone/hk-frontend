// hk-saver-weather.js (2026-10-14): the screensaver's Weather -- its words
// and numbers from a weather entity and its forecast (window.hkSaverWeather._.view)
if (typeof HK_ROOT === 'undefined')
  throw new Error('HK_ROOT is not set -- run this through tests/run, not jsc directly');
load(HK_ROOT + '/tests/dom.js');
load(HK_ROOT + '/frontend/modules/hk-saver-weather.js');

var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; print('  PASS  ' + n); } else { fail++; print('  FAIL  ' + n + (d !== undefined ? '   got ' + JSON.stringify(d) : '')); } }
var V = window.hkSaverWeather._.view, NOW = Date.UTC(2026, 9, 14, 18, 15);    // 2:15 PM EDT
function hrs(list) { return list.map(function (x, i) { return { datetime: new Date(NOW + (i + 1) * 36e5).toISOString(), condition: x[0], temperature: x[1], precipitation_probability: x[2] }; }); }
function days(list) { return list.map(function (x, i) { return { datetime: new Date(NOW + i * 864e5).toISOString(), condition: x[0], temperature: x[1], templow: x[2], precipitation_probability: x[3] }; }); }
var sunny = { state: 'sunny', attributes: { temperature: 85, wind_speed: 6, wind_gust_speed: 12, wind_bearing: 225, wind_speed_unit: 'mph' } };
var H1 = hrs([['sunny', 86, 0], ['sunny', 88, 0], ['sunny', 86, 0], ['sunny', 82, 0], ['clear-night', 75, 0], ['clear-night', 71, 0]]);
var D1 = days([['sunny', 88, 58, 0], ['sunny', 81, 62, 0], ['partlycloudy', 64, 50, 10], ['rainy', 58, 46, 70]]);
var v = V(sunny, H1, D1, NOW, []);
ok('the temperature, today\'s high and low', v.t === 85 && v.hi === 88 && v.lo === 58, v);
ok('a dry day: the high, when, and tonight\'s low', /high of <em>88°<\/em> around/.test(v.lede) && /Tonight, 58°/.test(v.lede), v.lede);
ok('three readings: Temperature, Rain, Wind', v.stats.map(function (s) { return s[0]; }).join() === 'temp,rain,wind', v.stats);
ok('...rain: dry until the first wet day', v.stats[1][3] === 'Dry until ' + new Date(D1[3].datetime).toLocaleDateString('en-US', { weekday: 'long' }), v.stats[1]);
ok('...wind: from the southwest, gusts 12', v.stats[2][3] === 'From the southwest, gusts 12', v.stats[2]);
ok('five hours and three days along the bottom', v.hours.length === 5 && v.days.length === 3, [v.hours.length, v.days.length]);
var rainy = { state: 'rainy', attributes: { temperature: 61, wind_speed: 14, wind_bearing: 90 } };
var H2 = hrs([['rainy', 61, 90], ['rainy', 60, 85], ['pouring', 59, 95], ['cloudy', 58, 20], ['cloudy', 56, 10]]);
v = V(rainy, H2, days([['rainy', 63, 52, 90], ['sunny', 70, 52, 0]]), NOW, []);
ok('raining: until about the first dry hour', /Rain until about <em>/.test(v.lede), v.lede);
ok('...its chance today', v.stats[1][0] === 'rain' && v.stats[1][2].indexOf('95') === 0, v.stats[1]);
var snowy = { state: 'snowy', attributes: { temperature: 29, wind_speed: 2 } };
v = V(snowy, [], days([['snowy', 31, 22, 80]]), NOW, []);
ok('snowing: the reading says Snow', v.stats[1][1] === 'Snow', v.stats[1]);
ok('...calm wind says so', /^Calm/.test(v.stats[2][3]), v.stats[2]);
ok('...no forecast hours: none along the bottom', v.hours.length === 0);
v = V({ state: 'partlycloudy', attributes: { temperature: 72, wind_speed: 9 } }, hrs([['partlycloudy', 73, 10], ['rainy', 70, 60]]), D1, NOW, []);
ok('wet later: likely around that hour', /Rain likely around <em>/.test(v.lede), v.lede);
v = V(sunny, H1, D1, NOW, ['rain', 'wind', 'hours', 'days']);
ok('Weather Options leaves out Rain, Wind, the hours and the days', v.stats.length === 1 && !v.hours.length && !v.days.length, v);
v = V({ state: 'clear-night', attributes: { temperature: 58 } }, [], days([['sunny', 88, 52, 0]]), NOW, []);
ok('a clear night: Clear Tonight, down to the low by dawn', v.head === 'Clear Tonight' && /Down to 52° by dawn/.test(v.lede), v);
ok('the wind\'s direction, eight ways', window.hkSaverWeather._.dirOf(0) === 'north' && window.hkSaverWeather._.dirOf(225) === 'southwest' &&
   window.hkSaverWeather._.dirOf(350) === 'north' && window.hkSaverWeather._.dirOf(null) === '');

print(fail ? 'FAIL ' + fail + ' SAVER WEATHER TESTS' : 'ALL ' + pass + ' SAVER WEATHER TESTS PASS');
if (fail) throw new Error(fail + ' failed');
