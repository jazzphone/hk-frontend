// hk-saver-weather.js -- THE SCREENSAVER'S WEATHER (2026-10-14): today's
// weather at a glance, laid out as Home Energy is (hk-saver-energy.js), over
// HK's own Live Sky in its Sky Only form (hk-sky.js scene, skyOnly: the sky,
// its clouds, rain, snow, stars and moon -- no land, no decorations). The
// temperature in front of the condition's own symbol, huge (hk-header.js
// wxSvg), as a backdrop; a headline and a line in words; Temperature, Rain
// (or Snow) and Wind with leader lines; Next Hours and Coming Days along the
// bottom. A slide among the photos, or one of the Additional Screens over the
// clock (hk-saver.js; settings.py weather_slide, weather_hide). Designed in
// hk_house/docs/mockups/saver-weather-screen.html.
//
// Loaded by hk-saver.js only when a screen shows Weather -- never on its own.
//
// WHAT IT COSTS A WALL TABLET, by design:
//   - its sky is one more Live Sky scene, held still (paused) whenever it is
//     not on screen; the words and numbers sit still once drawn
//   - the forecast: a configured forecast sensor, else Home Assistant's
//     weather/subscribe_forecast (hourly and daily), as the forecast band does,
//     dropped with the screen
//   - laid out at a 1280 x 800 tablet's size and scaled whole to the room it
//     has (one transform), redrawn at most every REDRAW_MS while it shows
//
//   hkSaverWeather.create({ hide, h24 }) -> ctl
//     ctl.el                  the layer (hk-saver.js puts it in its root)
//     ctl.ready(hass)         a weather to show
//     ctl.draw(hass)          fill it in now, its sky running
//     ctl.arrived()           the fade is done: the lines and the bar draw
//     ctl.layout(W, H)        the room it has (beside any pane)
//     ctl.setHass(hass), setHide(list), leave(), destroy()
(function () {
  'use strict';
  if (window.hkSaverWeather) return;

  var FONT = '"SF Pro","SF Pro Display",-apple-system,system-ui,"Roboto",sans-serif';
  var W0 = 1280, H0 = 800, REDRAW_MS = 10000;
  // the readings' and bars' colors (Home Energy's palette: hk-energy.js RING)
  var COL = { temp: '#ff9f0a', rain: '#0a84ff', wind: '#66d4cf' };
  // the parts Weather Options can leave out (settings.py SAVER_WEATHER_PARTS)
  var PARTS = ['rain', 'wind', 'hours', 'days'];

  var CSS = [
    '.wx{position:absolute;inset:0;z-index:3;opacity:0;visibility:hidden;pointer-events:none;overflow:hidden;background:#0b1830;',
    '  font-family:' + FONT + ';color:#fff;text-shadow:0 1px 10px rgba(0,0,0,.28);',
    '  transition:opacity var(--hk-wx-fade,3000ms) ease,visibility 0s linear var(--hk-wx-fade,3000ms)}',
    '.wx.on{opacity:1;visibility:visible;transition:opacity var(--hk-wx-fade,3000ms) ease,visibility 0s}',
    '.wx .wxsky{position:absolute;inset:0}',
    // where the text is, the sky darkened a little -- never a box behind it
    '.wx .wxwash{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,10,24,.42),rgba(4,10,24,.18) 55%,rgba(4,10,24,.24)),',
    '  linear-gradient(180deg,rgba(4,10,24,0) 55%,rgba(4,10,24,.42))}',
    '.wx[night] .wxwash{background:linear-gradient(180deg,rgba(0,0,0,0) 60%,rgba(0,0,0,.3))}',
    // EVERYTHING ELSE at a 1280 x 800 tablet's size, scaled whole (--z)
    '.wx .wxin{position:absolute;left:0;top:0;width:calc(100% / var(--z,1));height:calc(100% / var(--z,1));transform:scale(var(--z,1));transform-origin:0 0}',
    '.wx .wxin .wxcorner{position:absolute;left:44px;top:34px}',
    '.wx .wxin .wxt{font-size:64px;font-weight:600;letter-spacing:-2px;line-height:1}',
    '.wx .wxin .wxt small{font-size:24px;font-weight:600;letter-spacing:0;margin-left:4px;opacity:.85}',
    '.wx .wxin .wxd{font-size:20px;font-weight:500;margin-top:6px;opacity:.85}',
    '.wx .wxin .wxbody{position:absolute;left:0;right:0;top:150px;bottom:150px;display:flex;align-items:center;justify-content:center;gap:64px}',
    // THE TEMPERATURE IN FRONT OF ITS WEATHER: the symbol huge, to the left and
    // low, mostly behind the digits; a sun or a moon glows into the sky
    '.wx .wxin .hero{position:relative;width:420px;height:400px;flex:none}',
    '.wx .wxin .hin{position:absolute;inset:0}',
    '.wx .wxin .bd{position:absolute;line-height:0;font-size:300px;left:-41px;top:-42px;filter:drop-shadow(0 10px 40px rgba(0,10,30,.25))}',
    '.wx .wxin .bd svg{display:block}',
    // (a white symbol -- a cloud, the moon, snow -- behind white digits: eased back)
    '.wx .wxin .hero.pale .bd{opacity:.7}',
    '.wx .wxin .glow{position:absolute;left:-151px;top:-146px;width:520px;height:520px;border-radius:50%;',
    '  background:radial-gradient(circle,rgba(255,214,10,.28),rgba(255,214,10,0) 62%)}',
    '.wx[night] .wxin .glow{background:radial-gradient(circle,rgba(220,230,255,.16),rgba(220,230,255,0) 62%)}',
    '.wx .wxin .tp{position:absolute;left:73px;bottom:96px;font-size:210px;font-weight:200;letter-spacing:-9px;line-height:.8;white-space:nowrap;',
    '  text-shadow:0 0 2px rgba(0,10,30,.35),0 6px 30px rgba(0,10,30,.55),0 2px 8px rgba(0,10,30,.3)}',
    '.wx .wxin .hl{position:absolute;left:79px;bottom:46px;font-size:24px;font-weight:600;opacity:.95;white-space:nowrap}',
    '.wx .wxin .bar{position:absolute;left:79px;bottom:16px;width:300px;height:8px;border-radius:4px;background:rgba(255,255,255,.22)}',
    '.wx .wxin .bar i{position:absolute;inset:0;border-radius:4px;background:linear-gradient(90deg,#64d2ff,#ffd60a,#ff9f0a)}',
    '.wx .wxin .bar b{position:absolute;top:-4px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.25);margin-left:-8px}',
    // THE READINGS (Home Energy's): one grid, the numbers in one column
    // against the right edge, a leader line from each name to its number
    '.wx .wxin .read{width:560px;flex:none}',
    '.wx .wxin .eye{font-size:15px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.75}',
    '.wx .wxin .h2{font-size:52px;font-weight:700;letter-spacing:-1.2px;line-height:1.05;margin:6px 0 4px}',
    '.wx .wxin .lede{font-size:21px;font-weight:500;line-height:1.35;opacity:.92;margin-bottom:26px}',
    '.wx .wxin .lede em{font-style:normal;font-weight:600}',
    '.wx .wxin .stats{display:grid;grid-template-columns:12px auto 1fr auto;row-gap:20px;column-gap:12px}',
    '.wx .wxin .st{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:center}',
    '.wx .wxin .st i{width:12px;height:12px;border-radius:50%}',
    '.wx .wxin .st .k{font-size:15px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;opacity:.8}',
    '.wx .wxin .st .ln{grid-column:3;height:2px;border-radius:1px;margin:0 8px;min-width:24px;transform-origin:left center}',
    '.wx .wxin .st .v{grid-column:4;grid-row:1;font-size:40px;font-weight:700;letter-spacing:-1px;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.wx .wxin .st .v u{text-decoration:none;font-size:20px;font-weight:600;margin-left:6px;opacity:.8;letter-spacing:0}',
    '.wx .wxin .st .of{grid-column:4;font-size:15px;opacity:.72;margin-top:5px;white-space:nowrap}',
    '.wx .wxin .st i,.wx .wxin .st .k,.wx .wxin .st .ln{grid-row:1/3}',
    // ALONG THE BOTTOM: the next hours, the coming days
    '.wx .wxin .foot{position:absolute;left:44px;right:44px;bottom:26px;display:flex;justify-content:space-between;gap:40px;align-items:flex-start;',
    '  border-top:1px solid rgba(255,255,255,.2);padding-top:16px}',
    '.wx .wxin .foot:empty{display:none}',
    '.wx .wxin .fg .gh{font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;opacity:.92;margin-bottom:10px}',
    '.wx .wxin .fg .its{display:flex;gap:30px;align-items:flex-start}',
    '.wx .wxin .fg.mo{margin-left:auto;padding-left:40px;border-left:1px solid rgba(255,255,255,.2)}',
    '.wx .wxin .fg.mo:first-child{margin-left:0;padding-left:0;border-left:0}',
    '.wx .wxin .fg .k{font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.75;white-space:nowrap}',
    '.wx .wxin .fg .v{font-size:30px;font-weight:700;letter-spacing:-.6px;margin-top:4px;white-space:nowrap;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}',
    '.wx .wxin .fg .v .gl{font-size:28px;line-height:0}',
    '.wx .wxin .fg .v small{font-size:20px;font-weight:600;opacity:.65;letter-spacing:0}',
    // TALL (a portrait screen): the temperature above the readings
    '.wx[tall] .wxin .wxbody{flex-direction:column;gap:40px;top:170px}',
    '.wx[tall] .wxin .foot{flex-direction:column;gap:18px}',
    '.wx[tall] .wxin .fg.mo{margin-left:0;padding-left:0;border-left:0}',
    // THE SYMBOL MOVES (2026-10-14, the owner's ask), each layer as its
    // weather does: the sun's rays turn and it breathes, clouds drift (the
    // whole symbol: a sun or moon is cut around its cloud, so the cloud can
    // never move alone), rain and snow fall, a bolt flickers, stars twinkle,
    // fog and wind slide. Only while it is on screen (paused otherwise), not
    // with Reduce Motion or with the sky's Animations off ([still]), and
    // never while balance() measures it (.calm).
    '.wx .bd svg path{transform-box:fill-box;transform-origin:50% 50%}',
    '.wx .bd svg[data-sym="sun.max.fill"] path:first-child{animation:wxspin 70s linear infinite}',
    '.wx .bd svg[data-sym="sun.max.fill"] path:last-child,.wx .bd svg[data-sym="cloud.sun.fill"] path:first-child{animation:wxbreathe 5s ease-in-out infinite alternate}',
    '.wx .bd svg[data-sym^="cloud."]{animation:wxdrift 11s ease-in-out infinite alternate}',
    '.wx .bd svg[data-sym="cloud.rain.fill"] path:not(:last-child),.wx .bd svg[data-sym="cloud.heavyrain.fill"] path:not(:last-child),' +
    '.wx .bd svg[data-sym="cloud.moon.rain.fill"] path:nth-child(-n+4),.wx .bd svg[data-sym="cloud.hail.fill"] path:not(:last-child),' +
    '.wx .bd svg[data-sym="cloud.sleet.fill"] path:not(:last-child),.wx .bd svg[data-sym="cloud.bolt.rain.fill"] path:not(:last-child):not(:nth-child(3))' +
    '{animation:wxfall 1.5s linear infinite}',
    '.wx .bd svg[data-sym="cloud.snow.fill"] path:not(:last-child){animation:wxsnow 3.6s linear infinite}',
    '.wx .bd svg path:nth-child(2){animation-delay:-.45s}.wx .bd svg path:nth-child(3){animation-delay:-.9s}',
    '.wx .bd svg path:nth-child(4){animation-delay:-.2s}.wx .bd svg path:nth-child(5){animation-delay:-1.1s}.wx .bd svg path:nth-child(6){animation-delay:-.65s}',
    '.wx .bd svg[data-sym="cloud.snow.fill"] path:nth-child(2){animation-delay:-1.4s}.wx .bd svg[data-sym="cloud.snow.fill"] path:nth-child(3){animation-delay:-2.7s}',
    '.wx .bd svg[data-sym="cloud.snow.fill"] path:nth-child(4){animation-delay:-.7s}.wx .bd svg[data-sym="cloud.snow.fill"] path:nth-child(5){animation-delay:-3.1s}',
    '.wx .bd svg[data-sym="cloud.snow.fill"] path:nth-child(6){animation-delay:-2s}',
    '.wx .bd svg[data-sym="cloud.bolt.fill"] path:first-child,.wx .bd svg[data-sym="cloud.bolt.rain.fill"] path:nth-child(3){animation:wxflash 5s linear infinite}',
    // (moon.stars.fill draws its stars first, the moon last)
    '.wx .bd svg[data-sym="moon.stars.fill"] path:first-child{animation:wxtwinkle 3.2s ease-in-out infinite alternate}',
    '.wx .bd svg[data-sym="moon.stars.fill"] path:last-child{animation:wxbreathe 6s ease-in-out infinite alternate}',
    '.wx .bd svg[data-sym="cloud.fog.fill"] path:not(:last-child),.wx .bd svg[data-sym="wind"] path{animation:wxslide 4s ease-in-out infinite alternate}',
    '.wx .bd svg[data-sym="cloud.fog.fill"] path:nth-child(2),.wx .bd svg[data-sym="wind"] path:nth-child(2){animation-delay:-2s}',
    '.wx .bd svg[data-sym="wind"] path:nth-child(3){animation-delay:-1s}',
    '.wx .bd [data-sym="mdi"]{animation:wxfloat 6s ease-in-out infinite alternate}',
    '@keyframes wxspin{to{transform:rotate(360deg)}}',
    '@keyframes wxbreathe{from{transform:scale(1)}to{transform:scale(1.045)}}',
    '@keyframes wxdrift{from{transform:translateX(-2.2%)}to{transform:translateX(2.2%)}}',
    '@keyframes wxfall{0%{transform:translateY(-7px);opacity:0}20%{opacity:1}75%{opacity:1}100%{transform:translateY(9px);opacity:0}}',
    '@keyframes wxsnow{0%{transform:translate(0,-6px);opacity:0}20%{opacity:1}50%{transform:translate(2px,1px)}80%{opacity:1}100%{transform:translate(-1px,8px);opacity:0}}',
    '@keyframes wxflash{0%,84%,89%,93%,100%{opacity:1}86%{opacity:.2}91%{opacity:.4}}',
    '@keyframes wxtwinkle{from{opacity:.35}to{opacity:1}}',
    '@keyframes wxslide{from{transform:translateX(-5px)}to{transform:translateX(5px)}}',
    '@keyframes wxfloat{from{transform:translateY(-1.5%)}to{transform:translateY(1.5%)}}',
    '.wx:not(.on) .bd *,.wx:not(.on) .bd svg{animation-play-state:paused!important}',
    '.wx[still] .bd *,.wx[still] .bd svg,.wx .bd.calm *,.wx .bd.calm svg{animation:none!important}',
    '@media (prefers-reduced-motion: reduce){.wx .bd *,.wx .bd svg{animation:none!important}}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // (a missing value stays missing: Number(null) is 0, a bearing of north)
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function tz() { return window.hkStats && window.hkStats.tz ? window.hkStats.tz() : undefined; }
  function HD() { return window.hkHeader || null; }
  function glyph(cond, size, night, sym) { var H = HD(); return H && H.wxSvg ? H.wxSvg(cond, size, { night: !!night, sym: !!sym }) : ''; }
  function condName(c) {
    var H = HD();
    if (H && H.conditionName) return H.conditionName(c);
    return String(c || '').replace(/-/g, ' ').replace(/\b\w/g, function (x) { return x.toUpperCase(); });
  }
  function hourOf(t) { return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: tz() }); }
  function dayOf(t) { return new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: tz() }); }
  function longDayOf(t) { return new Date(t).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz() }); }
  var DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  function dirOf(b) { b = num(b); return b == null ? '' : DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8]; }
  var WET = /rain|pour|snow|hail|lightning/;

  // THE WEATHER'S WORDS AND NUMBERS, from the entity and its forecast:
  // pure, so tests drive it with any weather (window.hkSaverWeather._.view)
  function view(w, hourly, daily, now, hide, unitWind) {
    var off = {};
    (hide || []).forEach(function (k) { off[k] = true; });
    var a = w.attributes || {}, cond = w.state, t = num(a.temperature);
    var night = /night/.test(cond) || !!(HD() && HD().isNight && hd.states && HD().isNight(hd.states));
    var today = (daily || [])[0] || {}, hi = num(today.temperature), lo = num(today.templow);
    if (hi != null && t != null) hi = Math.max(hi, t);
    if (lo != null && t != null) lo = Math.min(lo, t);
    var snow = /snow/.test(cond);
    // THE HEADLINE: the condition, or at night when it's clear, tonight
    var head = cond === 'clear-night' ? 'Clear Tonight' : condName(cond);
    // THE LINE IN WORDS: wet now, until when it dries; wet coming, when;
    // else the day's high, and tonight's low
    var hrs = (hourly || []).filter(function (h) { return h && +new Date(h.datetime) >= now - 36e5; }).slice(0, 18);
    var prob = function (h) { var p = num(h.precipitation_probability); return p == null ? (WET.test(h.condition || '') ? 80 : 0) : p; };
    var lede = '';
    // the first hour ahead that's wet (likely, or a wet condition)
    var wet = hrs.filter(function (h) { return +new Date(h.datetime) > now && (prob(h) >= 50 || WET.test(h.condition || '')); })[0];
    if (WET.test(cond)) {
      var dry = hrs.filter(function (h) { return +new Date(h.datetime) > now && prob(h) < 30 && !WET.test(h.condition || ''); })[0];
      lede = (snow ? 'Snow' : 'Rain') + (dry ? ' until about <em>' + esc(hourOf(dry.datetime)) + '</em>, then drying out.' : ' through the day.');
    } else {
      if (wet) lede = (/snow/.test(wet.condition || '') ? 'Snow' : 'Rain') + ' likely around <em>' + esc(hourOf(wet.datetime)) + '</em>.';
      else if (hi != null && !night) {
        var peak = hrs.filter(function (h) { return +new Date(h.datetime) > now && num(h.temperature) != null; })
          .reduce(function (b, h) { return !b || num(h.temperature) > num(b.temperature) ? h : b; }, null);
        lede = 'A high of <em>' + Math.round(hi) + '°</em>' + (peak && num(peak.temperature) >= hi - 1 ? ' around ' + esc(hourOf(peak.datetime)) : '') + '.';
      }
    }
    if (lo != null) lede += (lede ? ' ' : '') + (night ? 'Down to ' : 'Tonight, ') + Math.round(lo) + '°' + (night ? ' by dawn.' : '.');
    var stats = [];
    if (t != null) stats.push(['temp', 'Temperature', Math.round(t) + '°', hi != null && lo != null ? 'High ' + Math.round(hi) + '° · Low ' + Math.round(lo) + '°' : condName(cond)]);
    if (!off.rain) {
      var pToday = hrs.length ? Math.max.apply(null, hrs.slice(0, 12).map(prob)) : num(today.precipitation_probability);
      var nextWet = (daily || []).slice(1).filter(function (d) { return (num(d.precipitation_probability) || 0) >= 40 || WET.test(d.condition || ''); })[0];
      var of = WET.test(cond) ? (num(today.precipitation) ? today.precipitation + ' ' + esc(a.precipitation_unit || 'in') + ' today' : 'Through ' + (lede.indexOf('until') >= 0 ? 'this evening' : 'the day'))
        : pToday >= 30 ? 'Most likely ' + (wet ? 'around ' + esc(hourOf(wet.datetime)) : 'later today')
        : nextWet ? 'Dry until ' + longDayOf(nextWet.datetime) : 'Dry for the days ahead';
      if (pToday != null) stats.push(['rain', snow ? 'Snow' : 'Rain', Math.round(pToday) + '<u>%</u>', of]);
    }
    if (!off.wind) {
      var ws = num(a.wind_speed), gust = num(a.wind_gust_speed), dir = dirOf(a.wind_bearing);
      if (ws != null) stats.push(['wind', 'Wind', Math.round(ws) + '<u>' + esc(unitWind || a.wind_speed_unit || 'mph') + '</u>',
        ws < 3 ? 'Calm' + (dir ? ', from the ' + dir : '') : (dir ? 'From the ' + dir : 'Steady') + (gust != null && gust > ws + 2 ? ', gusts ' + Math.round(gust) : '')]);
    }
    var hours = off.hours ? [] : hrs.filter(function (h) { return +new Date(h.datetime) > now - 18e5; }).slice(1, 6);
    var days = off.days ? [] : (daily || []).slice(1, 4);
    return { cond: cond, night: night, t: t, hi: hi, lo: lo, head: head, lede: lede, stats: stats, hours: hours, days: days };
  }
  var hd = { states: null };

  function create(opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'wx';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<style>' + CSS + '</style><div class="wxsky"></div><div class="wxwash"></div><div class="wxin">' +
      '<div class="wxcorner"><div class="wxt"></div><div class="wxd"></div></div><div class="wxbody"></div><div class="foot"></div></div>';
    var inn = el.querySelector('.wxin');
    var alive = true, showing = false, hass = null, sig = '', drawnAt = 0, redrawT = null, clockT = null, scene = null;
    var hide = Array.isArray(opts.hide) ? opts.hide.slice() : [], h24 = !!opts.h24;
    var fc = {}, subs = {}, refused = {}, conn = null, onReady = null;

    function wid() {
      var HS = window.hkSettings, st = hass && hass.states;
      return st && HS && HS.weatherId ? HS.weatherId(st) : null;
    }
    // THE FORECAST: Configure -> Weather's forecast sensor, else the
    // weather entity's own subscription (as the forecast band has it)
    function forecast(kind) {
      var HS = window.hkSettings, sensor = HS && HS.get ? HS.get('weather.forecast_' + kind, null) : null;
      if (sensor) return ((hass.states[sensor] || {}).attributes || {}).forecast || [];
      var id = wid(), key = kind + '|' + id, c = hass && hass.connection;
      if (id && c && alive && !subs[key] && !(refused[key] && Date.now() < refused[key])) {
        if (!onReady && typeof c.addEventListener === 'function') {
          conn = c;
          onReady = function () { subs = {}; soon(); };       // Home Assistant restarted: ask again
          c.addEventListener('ready', onReady);
        }
        subs[key] = c.subscribeMessage(function (ev) { fc[key] = (ev && ev.forecast) || []; soon(); },
          { type: 'weather/subscribe_forecast', forecast_type: kind, entity_id: id }, { resubscribe: false })
          .catch(function () { delete subs[key]; refused[key] = Date.now() + 5 * 60e3; return null; });
      }
      return fc[key] || [];
    }
    function weather() { var id = wid(); return id && hass.states[id] ? hass.states[id] : null; }
    function tick() {
      var now = new Date(), z = tz();
      var t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !h24, timeZone: z }).split(' ');
      var th = esc(t[0]) + (t[1] ? '<small>' + esc(t[1]) + '</small>' : '');
      var tEl = inn.querySelector('.wxt'), dEl = inn.querySelector('.wxd');
      if (tEl.innerHTML !== th) tEl.innerHTML = th;
      var d = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: z });
      if (dEl.textContent !== d) dEl.textContent = d;
      align();
    }
    function soon() {
      if (!alive || !showing || redrawT) return;
      redrawT = setTimeout(function () { redrawT = null; if (alive && showing) paint(false); }, Math.max(0, REDRAW_MS - (Date.now() - drawnAt)));
    }
    function paint(fresh) {
      var w = weather();
      if (!w) return false;
      hd.states = hass.states;
      var v = view(w, forecast('hourly'), forecast('daily'), Date.now(), hide);
      if (v.t == null) return false;
      drawnAt = Date.now();
      var key = JSON.stringify(v);
      if (key === sig && !fresh) return true;
      sig = key;
      if (v.night) el.setAttribute('night', ''); else el.removeAttribute('night');
      // the symbol holds still with the sky's Animations off
      var HSk = window.hkSettings, moves = !(HSk && HSk.skyLook && HSk.skyLook().animations === false);
      if (moves) el.removeAttribute('still'); else el.setAttribute('still', '');
      var span = v.hi != null && v.lo != null ? Math.max(1, v.hi - v.lo) : 0;
      var glowy = /^(sunny|clear-night|partlycloudy)$/.test(v.cond);
      var hero = '<div class="hero' + (v.cond === 'sunny' ? '' : ' pale') + '"><div class="hin">' + (glowy ? '<div class="glow"></div>' : '') +
        '<div class="bd">' + glyph(v.cond, '1em', v.night, true) + '</div><div class="tp">' + Math.round(v.t) + '°</div>' +
        '<div class="hl">' + esc(condName(v.cond)) + (span ? ' · H ' + Math.round(v.hi) + '° L ' + Math.round(v.lo) + '°' : '') + '</div>' +
        (span ? '<div class="bar"><i></i><b style="left:' + Math.round(300 * (v.t - v.lo) / span) + 'px"></b></div>' : '') + '</div></div>';
      // (Configure -> Weather's place label, as the forecast band shows it)
      var place = window.hkSettings && window.hkSettings.get ? window.hkSettings.get('weather.place', null) : null;
      var stats = v.stats.map(function (s) {
        return '<div class="st"><i style="background:' + COL[s[0]] + '"></i><span class="k">' + esc(s[1]) + '</span>' +
          '<span class="ln" style="background:linear-gradient(90deg,' + COL[s[0]] + ',' + COL[s[0]] + '40)"></span>' +
          '<span class="v">' + s[2] + '</span><span class="of">' + s[3] + '</span></div>';
      }).join('');
      inn.querySelector('.wxbody').innerHTML = hero + '<div class="read"><div class="eye">' + (place ? esc(place) : 'Weather') + '</div>' +
        '<div class="h2">' + esc(v.head) + '</div><div class="lede">' + v.lede + '</div><div class="stats">' + stats + '</div></div>';
      var hours = v.hours.map(function (h) {
        var n = /night/.test(h.condition || '') || h.is_daytime === false;
        return '<div><div class="k">' + esc(hourOf(h.datetime)) + '</div><div class="v"><span class="gl">' + glyph(h.condition, '1em', n) + '</span>' +
          (num(h.temperature) != null ? Math.round(h.temperature) + '°' : '—') + '</div></div>';
      }).join('');
      var days = v.days.map(function (d) {
        return '<div><div class="k">' + esc(dayOf(d.datetime)) + '</div><div class="v"><span class="gl">' + glyph(d.condition === 'clear-night' ? 'sunny' : d.condition, '1em', false) + '</span>' +
          (num(d.temperature) != null ? Math.round(d.temperature) + '°' : '—') + (num(d.templow) != null ? '<small>' + Math.round(d.templow) + '°</small>' : '') + '</div></div>';
      }).join('');
      inn.querySelector('.foot').innerHTML = (hours ? '<div class="fg"><div class="gh">Next Hours</div><div class="its">' + hours + '</div></div>' : '') +
        (days ? '<div class="fg mo"><div class="gh">Coming Days</div><div class="its">' + days + '</div></div>' : '');
      balance();
      if (fresh) hold(true);
      return true;
    }
    // AS MUCH ROOM LEFT OF THE SYMBOL AS RIGHT OF THE NUMBER (before the
    // readings), measured on what is DRAWN -- the symbol's paths, the
    // number's ink: a 1 is narrow, a cloud with a sun wide -- the pair slides
    // to even them (the user, 2026-10-14)
    function balance() {
      var hin = inn.querySelector('.hin'), tp = inn.querySelector('.tp'), rd = inn.querySelector('.read');
      if (!hin || !tp || !rd || el.hasAttribute('tall')) { if (hin) hin.style.transform = ''; return; }
      hin.style.transform = '';
      var box = inn.getBoundingClientRect(), k = box.width / Math.max(1, inn.offsetWidth), L = 1e9;
      if (!k || !box.width) return;
      // (measured at rest: a turning ray or a drifting cloud would move the edge)
      var bd = inn.querySelector('.bd');
      if (bd) bd.classList.add('calm');
      inn.querySelectorAll('.bd svg path').forEach(function (p) { var b = p.getBoundingClientRect(); if (b.width) L = Math.min(L, b.left); });
      if (bd) bd.classList.remove('calm');
      if (L === 1e9) return;
      var cs = getComputedStyle(tp), cv = document.createElement('canvas').getContext('2d');
      cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if ('letterSpacing' in cv) cv.letterSpacing = cs.letterSpacing;
      var m = cv.measureText(tp.textContent), R = tp.getBoundingClientRect().left + m.actualBoundingBoxRight * k;
      var left = (L - box.left) / k, right = (rd.getBoundingClientRect().left - R) / k;
      hin.style.transform = 'translateX(' + ((right - left) / 2).toFixed(1) + 'px)';
    }
    // the time's and the date's first ink on one line (Home Energy's)
    var inkC = null;
    function align() {
      [inn.querySelector('.wxt'), inn.querySelector('.wxd')].forEach(function (n) {
        var txt = (n && n.textContent || '').trim();
        if (!txt) return;
        try {
          inkC = inkC || document.createElement('canvas');
          var ctx = inkC.getContext('2d'), cs = getComputedStyle(n);
          ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          var m = ctx.measureText(txt.charAt(0));
          if (typeof m.actualBoundingBoxLeft === 'number') n.style.marginLeft = (Math.round(m.actualBoundingBoxLeft * 10) / 10) + 'px';
        } catch (e) { /* as it is */ }
      });
    }
    // BEFORE IT HAS ARRIVED: the lines and the bar's dot at nothing (Reduce Motion: finished)
    function hold(on) {
      if (reduced()) return;
      inn.querySelectorAll('.st .ln').forEach(function (l) { if (on) l.style.transform = 'scaleX(0)'; else l.style.removeProperty('transform'); });
      inn.querySelectorAll('.bar b').forEach(function (b) { if (on) b.style.opacity = '0'; else b.style.removeProperty('opacity'); });
    }
    function arrived() {
      if (!alive || !showing) return;
      hold(false);
      if (reduced()) return;
      var D = window.hkCards && window.hkCards.DUR, Ez = window.hkCards && window.hkCards.EASE;
      var dur = (D && parseFloat(D.ring) * 1000) || 850, ease = (Ez && Ez.build) || 'cubic-bezier(.22,.8,.25,1)';
      inn.querySelectorAll('.st .ln').forEach(function (l) {
        if (l.animate) l.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: dur, easing: ease, fill: 'backwards' });
      });
      inn.querySelectorAll('.bar b').forEach(function (b) {
        if (b.animate) b.animate([{ left: '0px', opacity: 0 }, { left: b.style.left, opacity: 1 }], { duration: dur, easing: ease, fill: 'backwards' });
      });
    }
    function sky(run) {
      if (!scene && window.hkSky && window.hkSky.scene) {
        try { scene = window.hkSky.scene(el.querySelector('.wxsky'), { skyOnly: true }); } catch (e) { scene = null; }
      }
      if (!scene) return;
      if (run && hass) { try { scene.update(hass); } catch (e) { /* the next update */ } }
      try { scene.pause(!run); } catch (e) { /* gone */ }
    }
    return {
      el: el,
      // a weather to show (and its forecast asked for, and its sky readied)
      ready: function (h) {
        if (h) hass = h;
        var w = hass && weather();
        if (!w || num((w.attributes || {}).temperature) == null) return false;
        forecast('hourly'); forecast('daily');
        sky(false);
        return true;
      },
      draw: function (h) {
        if (h) hass = h;
        showing = true;
        sky(true);
        tick();
        if (!clockT) clockT = setInterval(function () { if (alive && showing) tick(); }, 10000);
        sig = '';
        return paint(true);
      },
      arrived: arrived,
      setHass: function (h) { hass = h; if (showing) soon(); },
      setHide: function (list) { hide = Array.isArray(list) ? list.slice() : []; sig = ''; },
      layout: function (w, h) {
        if (!w || !h) return;
        var tall = h > w * 1.05;
        if (tall) el.setAttribute('tall', ''); else el.removeAttribute('tall');
        var z = tall ? Math.min(w / 800, h / 1280) : Math.min(w / W0, h / H0);
        el.style.setProperty('--z', Math.max(0.4, Math.min(z, 2.5)).toFixed(3));
        if (showing) { balance(); align(); }
      },
      leave: function () {
        showing = false;
        if (redrawT) { clearTimeout(redrawT); redrawT = null; }
        if (clockT) { clearInterval(clockT); clockT = null; }
        sky(false);
      },
      showing: function () { return showing; },
      destroy: function () {
        alive = false; showing = false;
        if (redrawT) { clearTimeout(redrawT); redrawT = null; }
        if (clockT) { clearInterval(clockT); clockT = null; }
        Object.keys(subs).forEach(function (k) { Promise.resolve(subs[k]).then(function (u) { if (typeof u === 'function') u(); }); });
        subs = {};
        if (conn && onReady && typeof conn.removeEventListener === 'function') conn.removeEventListener('ready', onReady);
        if (scene) { try { scene.destroy(); } catch (e) { /* gone */ } scene = null; }
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }

  window.hkSaverWeather = { create: create, PARTS: PARTS.slice(), _: { view: view, dirOf: dirOf } };
})();
