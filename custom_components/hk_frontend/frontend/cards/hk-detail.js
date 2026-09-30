// hk-detail.js - detail sheets in the style of the Home app, in place of
// Home Assistant's more-info dialog.
//
// THE TAP CONTRACT IS UNCHANGED. A pill's glyph toggles; its name (or any
// card with nothing to toggle) fires `hass-more-info`, exactly as before.
// This file catches that event on the way down (a capture listener on
// window) and opens its own sheet instead of HA's dialog. No dashboard
// changes, no new gestures, no holds.
//
// ONLY ON DASHBOARDS. The event is taken only when it comes from a dashboard
// (ha-panel-lovelace) or an hk card (the pop-ups live beside the panel), and
// never from inside HA's own Settings screens or dialogs -- an hk card in the
// card editor's preview included. Those keep HA's dialog.
//
// SIMPLE, ON PURPOSE. One big control per sheet; only the thermostat and
// sensors carry extra information. No history, no settings, nothing that
// leads anywhere a household user should not go. A kind of entity with no
// sheet here falls through to HA's dialog.
//
// LIVE STATE: the sheet is not a card, so nothing hands it hass. It takes
// every new object from hkCards.onHass (hk-base.js) AND from <home-assistant>
// itself (see open()): the hub only moves while hk cards are on screen.
(function () {
  'use strict';

  function whenBase(fn) {
    if (window.hkCards && window.hkCards.register) return fn(window.hkCards.HkBase);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.register) fn(window.hkCards.HkBase);
    }, { once: true });
  }

  whenBase(function (HkBase) {
    if (window.hkDetail) return;
    var C = window.hkCards;
    var esc = C.esc;
    var PAL = C.PALETTE.icon;
    var DOORS = C.DOOR_COVERS || { garage: 1, gate: 1, door: 1 };

    // ------------------------------------------------------------ helpers
    var ON_STATES = ['on', 'open', 'opening', 'closing', 'unlocked', 'playing',
                     'armed_home', 'armed_away', 'armed_night', 'armed_vacation',
                     'cleaning', 'returning', 'paused', 'heat', 'cool', 'heat_cool',
                     'auto', 'dry', 'fan_only'];
    // The tile's domain colours (hk-tile.js DOMAIN_MAP), so the sheet's glyph
    // is the colour of the pill it was opened from.
    var DOMAIN_COL = {
      light: 'yellow', switch: 'orange', input_boolean: 'orange', fan: 'blue',
      cover: 'blue', lock: 'green', climate: 'red', media_player: 'red',
      sensor: 'blue', binary_sensor: 'blue', vacuum: 'green', humidifier: 'blue',
      water_heater: 'orange', valve: 'blue', number: 'blue', select: 'blue',
      input_number: 'blue', input_select: 'blue', alarm_control_panel: 'green'
    };
    function stOf(h, id) { return (h && h.states && id) ? h.states[id] : null; }
    function at(s, k) { return s && s.attributes ? s.attributes[k] : undefined; }
    function num(v) { var n = Number(v); return (v === null || v === '' || !isFinite(n)) ? null : n; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function domainOf(id) { return String(id || '').split('.')[0]; }
    function isOn(s) { return !!s && ON_STATES.indexOf(s.state) !== -1; }
    function unavailable(s) { return !s || s.state === 'unavailable' || s.state === 'unknown'; }

    function colourName(src, id) {
      var c = src && src.icon_color ? String(src.icon_color).toLowerCase().trim() : '';
      if (c && PAL[c]) return PAL[c];
      if (c) return src.icon_color;
      return PAL[DOMAIN_COL[domainOf(id)] || 'gray'] || PAL.gray;
    }

    // Light capabilities, from supported_color_modes.
    var COLOUR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
    function lightCaps(s) {
      var modes = at(s, 'supported_color_modes') || [];
      var colour = modes.some(function (m) { return COLOUR_MODES.indexOf(m) !== -1; });
      var temp = modes.indexOf('color_temp') !== -1;
      var dim = modes.some(function (m) { return m !== 'onoff'; });
      var fx = (at(s, 'effect_list') || []).length > 0;
      return { colour: colour, temp: temp, dim: dim, effects: fx };
    }

    // WHICH SHEET. null = not ours; HA's dialog opens as before.
    function kindOf(h, id) {
      var s = stOf(h, id);
      if (!s) return null;
      var d = domainOf(id);
      var f = num(at(s, 'supported_features')) || 0;
      switch (d) {
        case 'light': return lightCaps(s).dim ? 'light' : 'toggle';
        case 'switch': case 'input_boolean': return 'toggle';
        case 'fan': return (at(s, 'percentage') != null || (f & 1)) ? 'fan' : 'toggle';
        case 'cover':
          // Nothing to open, close or place -- a tilt-only blind (open/close
          // TILT and tilt position, bits 16-128): HA's dialog, which has the
          // tilt controls this sheet does not.
          if (!(f & 7)) return null;
          // A DOOR IS THE LOCK'S RING -- a garage, a gate, a car's frunk --
          // from the same list hk-base's one-tap guard uses, so the two can
          // never disagree about what a door is.
          if (DOORS[at(s, 'device_class')]) return 'garage';
          return (f & 4) ? 'cover' : 'cover_buttons';
        case 'lock': return 'lock';
        case 'climate': return 'climate';
        case 'media_player': return 'media';
        case 'sensor': return num(s.state) != null || at(s, 'unit_of_measurement') ? 'sensor' : 'state';
        case 'binary_sensor': return 'binary';
        case 'vacuum': return 'vacuum';
        case 'humidifier': return 'humidifier';
        case 'water_heater': return 'water_heater';
        case 'valve': return 'valve';
        case 'number': case 'input_number': return 'number';
        case 'select': case 'input_select': return 'select';
        case 'alarm_control_panel': return 'alarm';
        case 'camera': return 'camera';
        default: return null;
      }
    }

    // FAN SPEEDS. A Lutron Caseta fan steps in 25s: its own names are
    // low / medium / medium-high / high.
    var SPEED_NAMES = {
      2: ['Low', 'High'],
      3: ['Low', 'Medium', 'High'],
      4: ['Low', 'Medium', 'Medium-High', 'High'],
      5: ['Low', 'Medium-Low', 'Medium', 'Medium-High', 'High']
    };
    function fanSteps(s) {
      var step = num(at(s, 'percentage_step')) || 1;
      return Math.max(1, Math.round(100 / Math.max(1, step)));
    }
    function fanLabel(pct, n, on) {
      if (!on || !pct) return 'Off';
      var names = SPEED_NAMES[n];
      if (!names) return Math.round(pct) + '%';
      return names[clamp(Math.round(pct / (100 / n)), 1, n) - 1];
    }
    // timer.fan_manual_<room>: the timer of a manual-override guard, when the
    // home's automations keep one. fan.living_room_fan -> living_room.
    function fanGuard(id) {
      return 'timer.fan_manual_' + String(id).replace(/^fan\./, '').replace(/_fan$/, '');
    }

    // At most `max` points, averaged in time buckets: a power sensor writes a
    // row every few seconds, and 17,000 points in one SVG path is a tablet's
    // whole frame budget.
    function downsample(pts, max) {
      if (!pts || pts.length <= max) return pts || [];
      var t0 = +pts[0].t, t1 = +pts[pts.length - 1].t, span = (t1 - t0) || 1;
      var out = [], b = -1, sum = 0, n = 0, bt = 0;
      pts.forEach(function (p) {
        var k = Math.min(max - 1, Math.floor((+p.t - t0) / span * max));
        if (k !== b && n) { out.push({ t: new Date(bt / n), v: sum / n }); sum = 0; n = 0; bt = 0; }
        b = k; sum += p.v; n++; bt += +p.t;
      });
      if (n) out.push({ t: new Date(bt / n), v: sum / n });
      return out;
    }

    // A LINE SPANS ITS RANGE, NOT ITS ROWS. hkChart.line draws first row to
    // last row, and a sensor that has not changed lately has few rows: an
    // unchanged hour is ONE row -- "No history for this range" for a value
    // that was known all hour (most battery sensors, most of the time) -- and
    // a day that last changed at noon would end its "Now" axis at noon. So:
    // the value in force at t0 is pinned AT t0, and the live reading closes
    // the line at `now`. pts: [{t: Date|ms, v}]; returns [{t: ms, v}].
    function spanTo(pts, t0, now, live) {
      var out = [], before = null;
      (pts || []).forEach(function (p) {
        if (!p || p.v == null || !isFinite(p.v)) return;
        var t = +p.t;
        if (!isFinite(t) || t > now) return;
        if (t < t0) { before = p; return; }
        out.push({ t: t, v: p.v });
      });
      if (before && (!out.length || out[0].t > t0)) out.unshift({ t: t0, v: before.v });
      if (live != null && isFinite(live)) out.push({ t: now, v: live });
      return out;
    }

    // ------------------------------------------------------------ axes
    // ROUND NUMBERS UP THE LEFT, TIMES ALONG THE BOTTOM, so both axes carry
    // information. niceTicks picks 3-5 round values spanning the data and
    // the chart is drawn to exactly that range (hkChart's lo/hi/pad, bars'
    // max), so every label sits on its gridline: the gridlines are placed by
    // the same formula the line is.
    var AX_PAD = 6;
    function niceTicks(lo, hi, want) {
      if (!isFinite(lo) || !isFinite(hi)) return null;
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      var raw = (hi - lo) / Math.max(1, (want || 4) - 1);
      var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
      // 1, 2, 5 or 10: no 2.5 -- a tick at 72.5 printed "73", which is a lie
      var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
      var a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
      var out = [];
      for (var v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(6));
      if (out.length < 2) out.push(+(a + step).toFixed(6));
      return out;
    }
    function tickText(v, unit) {
      var a = Math.abs(v);
      var t = a >= 1000 ? (Math.round(v / 100) / 10) + 'k' : String(+v.toFixed(a >= 10 || v === Math.round(v) ? 0 : 1));
      return /°/.test(unit || '') ? t + '°' : /%/.test(unit || '') ? t + '%' : t;
    }
    // n labels across a span of `ms` ending now: clock times for an hour or
    // two, hours for a day, weekdays for a week, dates beyond. The last is
    // "Now" (a day or less) or "Today".
    function timeTicks(ms, n) {
      var now = Date.now(), out = [];
      for (var i = 0; i < n; i++) {
        var f = i / (n - 1), d = new Date(now - ms * (1 - f)), t;
        if (i === n - 1) t = ms <= 36 * 3600000 ? 'Now' : 'Today';
        else if (ms <= 2 * 3600000) t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
        else if (ms <= 36 * 3600000) t = d.toLocaleTimeString([], { hour: 'numeric' }).replace(/:00/, '');
        else if (ms <= 8 * 86400000) t = d.toLocaleDateString([], { weekday: 'short' });
        else t = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        out.push({ f: f, t: t });
      }
      return out;
    }
    function timeRow(ms, n, cls) {
      return '<div class="' + (cls || 'axx') + '">' + timeTicks(ms, n).map(function (k) {
        return '<span style="left:' + (k.f * 100).toFixed(2) + '%">' + esc(k.t) + '</span>';
      }).join('') + '</div>';
    }
    // o: { pts, bars (bool), H, unit, ms (the span), n (time labels), colour,
    //      fluid } -- a FLUID chart fills whatever height its box has (the
    //      thermostat's trend, stretched to the dial's height): no padding,
    //      every rule and label placed by percentage, so it stays true at any
    //      height (the box's CSS must stretch .axc and the svg)
    function axesChart(o) {
      var vals = (o.pts || []).filter(function (p) { return p && p.v != null && isFinite(p.v); })
                              .map(function (p) { return p.v; });
      if (!vals.length || !window.hkChart) return '';
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), H = o.H;
      var ticks = o.bars ? niceTicks(0, Math.max(hi, 1e-9), 4) : niceTicks(lo, hi, 4);
      var tLo = ticks[0], tHi = ticks[ticks.length - 1], pad = o.fluid ? 0 : AX_PAD;
      var plot = o.bars
        ? window.hkChart.bars(o.pts, { height: H, split: 0, labels: false, avg: false, scale: false, max: tHi })
        : window.hkChart.line(o.pts, { height: H, colour: o.colour || 'orange', lo: tLo, hi: tHi, pad: pad, grid: false });
      var y = function (v) {
        if (o.fluid) return ((tHi - v) / (tHi - tLo) * 100).toFixed(2) + '%';
        return (o.bars ? H - (v - tLo) / (tHi - tLo) * H : pad + (tHi - v) / (tHi - tLo) * (H - 2 * pad)).toFixed(1) + 'px';
      };
      var grid = '', labs = '';
      ticks.forEach(function (v, i) {
        var top = y(v);
        grid += '<i class="gr' + (i === 0 ? ' b' : '') + '" style="top:' + top + '"></i>';
        labs += '<span style="top:' + top + '">' + esc(tickText(v, o.unit)) + '</span>';
      });
      var hs = o.fluid ? '' : ' style="height:' + H + 'px"';
      var widest = ticks.map(function (v) { return tickText(v, o.unit); })
                        .reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
      return '<div class="axc' + (o.fluid ? ' fl' : '') + '"><div class="ay"' + hs + '><b class="sz">' + esc(widest) + '</b>' + labs + '</div>' +
             '<div class="ap"' + hs + '>' + grid + plot + '</div>' +
             timeRow(o.ms, o.n || 5) + '</div>';
    }

    // Colour temperature -> an sRGB swatch (Tanner Helland's fit).
    function kelvinRgb(k) {
      var t = clamp(k, 1000, 40000) / 100, r, g, b;
      r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
      return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
    }
    function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
    function hsCss(hs) { return 'hsl(' + Math.round(hs[0]) + ',100%,' + Math.round(100 - (hs[1] / 2)) + '%)'; }
    // A fill colour for a light: its own colour, lifted toward white so a dim
    // red is still readable as a slider.
    function lightFill(s) {
      var rgb = at(s, 'rgb_color');
      if (!rgb || rgb.length !== 3) return 'rgba(255,255,255,0.95)';
      return css(rgb.map(function (c) { return Math.round(c + (255 - c) * 0.3); }));
    }

    // HA's favourite colours for a light live in the entity registry
    // (options.light.favorite_colors). Reading it needs an admin; a wall
    // tablet is not one, so it gets the same kind of defaults HA itself
    // offers: a few whites across the light's range, then colours.
    var FAV_CACHE = {};
    function defaultFavourites(s) {
      var caps = lightCaps(s), out = [];
      if (caps.temp) {
        var lo = num(at(s, 'min_color_temp_kelvin')) || 2000, hi = num(at(s, 'max_color_temp_kelvin')) || 6500;
        [2700, 4000, 6000].forEach(function (k) { out.push({ color_temp_kelvin: clamp(k, lo, hi) }); });
      }
      if (caps.colour) {
        [[0, 100], [30, 100], [120, 90], [210, 100], [280, 85], [330, 75]].forEach(function (hs) {
          out.push({ hs_color: hs });
        });
      }
      return out.slice(0, 6);
    }
    function favourites(h, s, cb) {
      var id = s.entity_id;
      if (FAV_CACHE[id]) return FAV_CACHE[id];
      FAV_CACHE[id] = defaultFavourites(s);
      if (h && h.user && h.user.is_admin && h.callWS) {
        h.callWS({ type: 'config/entity_registry/get', entity_id: id }).then(function (e) {
          var f = e && e.options && e.options.light && e.options.light.favorite_colors;
          if (Array.isArray(f) && f.length) { FAV_CACHE[id] = f; if (cb) cb(); }
        }).catch(function () { /* defaults stand */ });
      }
      return FAV_CACHE[id];
    }
    function favCss(f) {
      if (f.color_temp_kelvin) return css(kelvinRgb(f.color_temp_kelvin));
      if (f.hs_color) return hsCss(f.hs_color);
      if (f.rgb_color) return css(f.rgb_color);
      if (f.rgbw_color) return css(f.rgbw_color.slice(0, 3));
      if (f.rgbww_color) return css(f.rgbww_color.slice(0, 3));
      if (f.xy_color) return 'rgb(255,255,255)';
      return 'rgb(255,255,255)';
    }
    function favMatches(f, s) {
      if (f.color_temp_kelvin) {
        return at(s, 'color_mode') === 'color_temp' && Math.abs((num(at(s, 'color_temp_kelvin')) || 0) - f.color_temp_kelvin) < 120;
      }
      var hs = at(s, 'hs_color');
      if (f.hs_color && hs && at(s, 'color_mode') !== 'color_temp') {
        var dh = Math.abs(hs[0] - f.hs_color[0]); dh = Math.min(dh, 360 - dh);
        return dh < 8 && Math.abs(hs[1] - f.hs_color[1]) < 8;
      }
      return false;
    }

    function throttle(fn, ms) {
      var last = 0, t = null, args = null;
      function run() { last = Date.now(); t = null; fn.apply(null, args); }
      var w = function () {
        args = arguments;
        var wait = ms - (Date.now() - last);
        if (wait <= 0) { clearTimeout(t); run(); } else if (!t) t = setTimeout(run, wait);
      };
      w.cancel = function () { clearTimeout(t); t = null; };
      return w;
    }

    function glyph(icon, size) {
      return '<ha-icon icon="' + esc(icon) + '" style="--mdc-icon-size:' + size + 'px"></ha-icon>';
    }
    var BACK = 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z';

    // ------------------------------------------------------------ the sheet
    // Widths on a tablet. On a phone every sheet is the screen less 16 px a
    // side (CSS below), whatever its kind.
    // TWO WIDTHS AND ONE HEIGHT: every sheet is STD wide except the two that
    // lay out in two columns, and every sheet is SHEET_H tall -- the X and the
    // name land in the same place whatever opens. The keys stay per kind so a
    // kind can move.
    var STD = 460, WIDE = 820, SHEET_H = 680;
    // ONE PHONE HEIGHT TOO, the speaker's, so every sheet is the same size.
    // The whole screen less 80 -- which only the stacked thermostat needs --
    // would leave every other phone sheet in 200-350 px of empty space.
    // 643 = the playing speaker's panel (548, Browse Music the last row) +
    // the header, gap, padding and border (94) + 1: the tallest sheet that
    // does not scroll. Measured with offsetHeight -- a sheet caught mid-open
    // is scaled 0.98 and its rect reads 2% short. The thermostat (668) and
    // the water heater (644) scroll inside theirs; a shorter screen still
    // takes screen - 80 and scrolls more of them.
    var PHONE_H = 643;
    var WIDTH = {
      light: STD, light_colour: STD, toggle: STD, fan: STD, cover: STD,
      cover_buttons: STD, lock: STD, climate: WIDE, media: STD, media_tv: STD,
      sensor: WIDE, state: STD, binary: STD, vacuum: STD, control: STD,
      // the water heater is the thermostat's sheet: its ring, its size, its
      // two columns -- the two are the same, and the same size
      number: STD, select: STD, humidifier: STD, water_heater: WIDE, alarm: STD,
      // a room's "3 Windows": two 192 px tiles a row, the sheet's own width
      group: STD,
      // a custom pop-up's own cards: narrow or wide, as it asks
      cards: STD, cards_wide: WIDE,
      // a camera: the camera pop-ups' 1200 (16:9 -> 675 of picture);
      // the height is the picture's (hkAutoHeight), never past the screen
      camera: 1200
    };
    var AUTO_CLOSE_MS = 60000;

    var SHEET_CSS = [
      '.hkd{position:fixed;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;',
      '  pointer-events:none;-webkit-tap-highlight-color:transparent;color:#fff;',
      // CENTRED ON THE DASHBOARD, past Home Assistant's sidebar (hk-menu.js
      // publishes where the dashboard starts) -- a docked menu is part of the
      // dashboard, so the sheet centres over it too. The backdrop, inset 0,
      // still covers everything.
      '  box-sizing:border-box;padding-left:var(--hk-content-left,0px)}',
      '.hkd .bd{position:absolute;inset:0;background:rgba(17,17,17,0.34);opacity:0;',
      '  transition:opacity .3s ease;pointer-events:auto}',
      '.hkd.open .bd{opacity:1}',
      // THE CAPS ARE THE SCREEN LESS 16 px A SIDE. On the car the document is
      // zoomed (tesla-viewport.js, <html> at ~0.67), and a viewport unit is
      // zoomed with it: 100dvh capped the thermostat at 406 of 638 px. That
      // script sets --hk-vw / --hk-vh in layout px on a zoomed car dashboard
      // only; everywhere else they are unset and the viewport units stand.
      // ONE HEIGHT: SHEET_H on a tablet, the screen less 40 px top and bottom
      // on a phone (below) -- and never past the screen less 16 a side, which
      // is where a short window (the car, a phone on its side) scrolls.
      '.hkd .sheet{position:relative;box-sizing:border-box;pointer-events:auto;',
      '  width:var(--hkd-w,' + STD + 'px);max-width:calc(var(--hk-vw, 100vw) - var(--hk-content-left, 0px) - 32px);',
      '  height:' + SHEET_H + 'px;max-height:calc(var(--hk-vh, 100dvh) - 32px);',
      '  display:flex;flex-direction:column;gap:20px;padding:24px;border-radius:38px;',
      // THE COLOUR COMES THROUGH: a light tint over a saturated blur, so the
      // sky and the pills behind tint the sheet the way the Home app's cards
      // are tinted.
      '  background:rgba(30,30,34,0.46);-webkit-backdrop-filter:blur(34px) saturate(1.9);',
      '  backdrop-filter:blur(34px) saturate(1.9);border:1px solid rgba(255,255,255,0.12);',
      '  box-shadow:0 26px 64px rgba(0,0,0,0.55);overflow:hidden;',
      '  opacity:0;transform:translateY(24px) scale(.98);',
      '  transition:opacity .25s ease,transform .3s cubic-bezier(.2,.8,.2,1)}',
      '.hkd.open .sheet{opacity:1;transform:none}',
      // THE HEADER IS EXACTLY AS TALL AS THE X (44, a phone 40), so the X --
      // centred on the row -- sits the sheet's padding from the top AND from
      // the right. It is the glyph and the NAME, centred together: room, state
      // and speed are all in the sheet itself.
      '.hkd .hd{display:flex;align-items:center;gap:14px;flex-shrink:0;height:44px}',
      '.hkd .well{width:44px;height:44px;border-radius:22px;flex-shrink:0;display:flex;',
      '  align-items:center;justify-content:center;background:rgba(255,255,255,0.12);transition:background .2s}',
      '.hkd .well ha-state-icon{--mdc-icon-size:24px;width:24px;height:24px;display:flex}',
      '.hkd .tx{flex-grow:1;min-width:0}',
      '.hkd .tt{font-size:22px;font-weight:700;letter-spacing:-0.35px;line-height:24px;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // THE X IS THE SAME SIZE AS THE WELL, so centring it on the header row
      // puts it exactly as far from the top as from the right (the sheet's
      // padding either way) -- the rule the alarm pop-up's X broke.
      '.hkd .x{width:44px;height:44px;border-radius:22px;border:0;padding:0;flex-shrink:0;',
      '  display:flex;align-items:center;justify-content:center;cursor:pointer;',
      '  background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.92);--mdc-icon-size:20px}',
      '.hkd .x:active{background:rgba(255,255,255,0.26)}',
      '.hkd .body{flex-grow:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;',
      '  -webkit-overflow-scrolling:touch;scrollbar-width:none;display:flex;flex-direction:column}',
      '.hkd .body::-webkit-scrollbar{display:none}',
      // THE CONTROL SITS IN THE MIDDLE of what the header leaves. Auto
      // margins, not justify-content:center: when a short window makes the
      // content taller than the body, auto margins fall to zero and the body
      // scrolls from the top; centring would cut the top off unreachably.
      '.hkd .body > *{margin-block:auto}',
      // a panel that FILLS the body instead (a pick list) -- see hkFill
      '.hkd .body > .fill{margin-block:0;flex-grow:1;min-height:0;display:flex;flex-direction:column}',
      // A BARE SHEET (the camera): a camera pop-up, not a control sheet --
      // the picture to every edge, the pop-ups' 30 px corners, no header, the
      // X floating over the picture as the pop-ups' is (rgba(28,28,30,.62),
      // 16 from the top, 18 from the right). As wide as --hkd-w, or narrower
      // when the screen is too short for the picture at that width (--hkd-ar
      // is its shape), so there are never bars beside it. Specific enough to
      // win over the phone rules below.
      // opaque: the picture fills it, so the sheet's frost is work nobody sees
      // -- a 34 px blur of everything behind a 1200x675 box, re-run whenever
      // the strip's live tile or the sky moves under it
      '.hkd .sheet.bare{padding:0;gap:0;border-radius:30px;height:auto;background:#0b0d12;',
      '  -webkit-backdrop-filter:none;backdrop-filter:none;',
      '  width:min(var(--hkd-w,1200px), calc((var(--hk-vh, 100dvh) - 32px) * var(--hkd-ar, 1.7778)))}',
      '.hkd .sheet.bare .hd{position:absolute;top:16px;right:18px;z-index:3;height:auto}',
      '.hkd .sheet.bare .well,.hkd .sheet.bare .tx{display:none}',
      '.hkd .sheet.bare .x{background:rgba(28,28,30,0.62)}',
      '.hkd .sheet.bare .body{overflow:hidden}',
      // ...and the pop-ups' dim (hk-popup.js, rgba(17,17,17,.8)): a control
      // sheet's lighter one lets the sky tint its glass; a picture has none.
      '.hkd.bare .bd{background:rgba(17,17,17,0.8)}',
      '@media (max-width:600px){',
      '  .hkd .sheet{width:calc(var(--hk-vw, 100vw) - 32px);padding:18px;gap:16px;border-radius:30px;',
      '    height:min(' + PHONE_H + 'px, calc(var(--hk-vh, 100dvh) - 80px))}',
      '  .hkd .well,.hkd .x{width:40px;height:40px;border-radius:20px}',
      '  .hkd .hd{height:40px;gap:12px}',
      '  .hkd .tt{font-size:20px;line-height:22px}',
      '}',
      '@media (prefers-reduced-motion:reduce){.hkd .bd,.hkd .sheet{transition:none}}'
    ].join('');

    var D = { el: null };

    function haRoot() {
      var ha = document.querySelector('home-assistant');
      return (ha && ha.shadowRoot) || document.body;
    }

    // THE ROOM: the media sheet's "Playing on · Living Room" (a pill can be
    // named for a shortcut like "Apple Music", not for where it plays).
    function roomOf(h, id) {
      var e = h && h.entities && h.entities[id];
      if (!e) return '';
      var area = e.area_id;
      if (!area && e.device_id && h.devices && h.devices[e.device_id]) area = h.devices[e.device_id].area_id;
      var a = area && h.areas && h.areas[area];
      return a ? a.name : '';
    }

    // A NEAR-WHITE WELL TAKES A DARK GLYPH. The well is the pill's colour
    // while the thing is on, and a pill can be coloured near-white (the
    // speakers are rgba(255,255,255,0.85)): a white glyph on it vanishes.
    // Near-white = every channel bright, so yellow and mint keep white.
    function nearWhite(c) {
      var t = String(c || '').trim(), rgb = null, m;
      if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t))) {
        var x = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
        rgb = [0, 2, 4].map(function (i) { return parseInt(x.substr(i, 2), 16); });
      } else if ((m = /^rgba?\(([^)]+)\)$/i.exec(t))) {
        rgb = m[1].split(',').slice(0, 3).map(parseFloat);
      }
      return !!rgb && rgb.length === 3 && Math.min.apply(null, rgb) >= 200;
    }

    // THE HEADER'S GLYPH IS THE ENTITY'S OWN GLYPH: the header icons and the
    // pop-ups' icons match the entity's icons, and the mdi icons are only the
    // fallback. In order:
    //   1. the card it was opened from -- its `icon`, and `icon_states` by
    //      state, exactly as that tile draws it;
    //   2. opened from anywhere else (a chip, a room's status row, #alarm, a
    //      link in another sheet): THIS dashboard's own card for the entity,
    //      the first that names an hk: glyph;
    //   3. the entity's own icon, as its SF Symbol when the glyph set has one
    //      of the same name (mdi:fan -> hk:fan, as the menu does);
    //   4. and only then Home Assistant's own icon for it.
    // The colour follows the same card (icon_color), so the header matches
    // the pill it stands for.
    var LOOKS = typeof WeakMap === 'function' ? new WeakMap() : null;
    function lookOf(id) {
      var cfg = C.menu && typeof C.menu.config === 'function' ? C.menu.config() : null;
      if (!cfg || !id || !LOOKS) return null;
      var map = LOOKS.get(cfg);
      if (!map) {
        map = {};
        (function walk(node, depth) {
          if (!node || typeof node !== 'object' || depth > 14) return;
          if (Array.isArray(node)) { node.forEach(function (n) { walk(n, depth + 1); }); return; }
          if (typeof node.entity === 'string' && typeof node.icon === 'string' && /^hk:/.test(node.icon) &&
              !map[node.entity]) {
            map[node.entity] = { icon: node.icon, icon_states: node.icon_states, icon_color: node.icon_color };
          }
          for (var k in node) {
            if (Object.prototype.hasOwnProperty.call(node, k) && node[k] && typeof node[k] === 'object') walk(node[k], depth + 1);
          }
        })(cfg.views, 0);
        LOOKS.set(cfg, map);
      }
      return map[id] || null;
    }
    // The card whose look the header takes: the one it was opened from when
    // that names a glyph, else the dashboard's card for the entity.
    function lookFor(src, id) {
      return (src && src.icon) ? src : (lookOf(id) || src || {});
    }
    function headIcon(look, s) {
      var m = look && look.icon_states, st = s && s.state;
      if (m && st != null) {
        // `on:` unquoted in YAML is the boolean true (hk-tile.js normalises
        // its own copy; a looked-up config is raw)
        var alias = st === 'on' ? 'true' : st === 'off' ? 'false' : null;
        if (m[st] != null) return m[st];
        if (alias && m[alias] != null) return m[alias];
      }
      if (look && look.icon) return look.icon;
      var acc = s && accIcon(s.entity_id);
      if (acc) return acc;
      var own = s && s.attributes && s.attributes.icon;
      var mm = /^mdi:(.+)$/.exec(String(own || ''));
      var g = window.hkGlyphs && window.hkGlyphs.icons;
      if (mm && g && g[mm[1]]) return 'hk:' + mm[1];
      return null;                          // Home Assistant's own, via stateObj
    }

    function paintHeader(h) {
      var d = D, s = stOf(h, d.id);
      var on = isOn(s);
      d.well.style.background = on ? d.colour : 'rgba(255,255,255,0.12)';
      d.icon.style.color = on ? (nearWhite(d.colour) ? 'rgba(0,0,0,0.78)' : '#fff') : d.colour;
      d.icon.hass = h;
      d.icon.stateObj = s;
      var hk = headIcon(d.look, s);
      if (hk) d.icon.icon = hk;
      else if (d.icon.icon) d.icon.icon = undefined;
      // AN ALARM'S GLYPH IS ITS STATE: the shield and colour the keypad shows
      // at rest (hk-security.js HkAlarmKeypadCard.status) on a plain well --
      // not the domain's fixed green, which would put a green shield over a
      // red "Disarmed".
      var K = domainOf(d.id) === 'alarm_control_panel' && !(d.look && d.look.icon_color) &&
              customElements.get('hk-alarm-keypad-card');
      if (K && K.status) {
        var look = K.status(s);
        d.well.style.background = 'rgba(255,255,255,0.12)';
        d.icon.style.color = look.color;
        d.icon.icon = look.icon;
      }
      // A camera is its own glyph, and is named for its device ("Driveway"),
      // not its stream ("Driveway Camera Low resolution channel").
      if (domainOf(d.id) === 'camera' && !hk) d.icon.icon = 'hk:camera';
      // the name on the tile it was opened from (a generated tile already
      // carries the accessory's), else the accessory's own (its gear), else
      // the panel's -- the card over the home, as everywhere
      d.tt.textContent = (d.src && d.src.name) || accName(d.id) ||
                         (d.panel && d.panel.hkTitle && d.panel.hkTitle(h, s)) || at(s, 'friendly_name') || d.id;
    }

    function armAuto() {
      clearTimeout(D.auto);
      D.auto = setTimeout(function () { close(); }, D.autoMs || AUTO_CLOSE_MS);
    }

    // Does this dashboard have a view at `path`? true / false, or null when
    // the config cannot be read.
    function hasView(path) {
      try {
        var ha = document.querySelector('home-assistant');
        var main = ha.shadowRoot.querySelector('home-assistant-main');
        var panel = main.shadowRoot.querySelector('ha-panel-lovelace');
        var views = panel && panel.lovelace && panel.lovelace.config && panel.lovelace.config.views;
        if (!views) return null;
        return views.some(function (x) { return x.path === path; });
      } catch (e) { return null; }
    }

    // OUR HISTORY ENTRY CARRIES A TOKEN, and only an entry with THIS sheet's
    // token is ours to go back from. "Any hkDetail state" is not enough: a
    // pop-up that opens while the sheet is up (the #media bar when Play is
    // pressed in a speaker's sheet) pushes its entry with a copy of ours, the
    // X would then go back off the pop-up's entry, and hk-popup would read
    // that as a hand close -- a dismissal.
    var TOK = 0;
    function ours(d) {
      return !!(d && d.tok && history.state && history.state.hkTok === d.tok);
    }

    // ============================================================ ACCESSORY
    // SETTINGS: the Home app's per-accessory settings, behind a gear in the
    // sheet's header -- for admins only, since a wall tablet's user must not
    // rename the home. Everything is saved as it is changed (accessories.py;
    // the room is Home Assistant's own area) and reaches every screen: a
    // generated dashboard redraws within ten seconds.
    //
    //   Name        the tile's and the sheet's name, the home's (or, with
    //               "Only on this dashboard", this one's)
    //   Room        Home Assistant's area for it
    //   Show As     a switch drawn and counted as a light, a fan, an outlet
    //   Icon        the glyph
    //   Include in Status   counted by the chips (What counts)
    //   Show on Home        on a generated Home; its room's page lists it anyway
    //   Favorite on this dashboard
    var ACC_CSS = [
      '.hkd .gear{width:44px;height:44px;border-radius:22px;border:0;padding:0;flex-shrink:0;',
      '  display:flex;align-items:center;justify-content:center;cursor:pointer;',
      '  background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.92);--mdc-icon-size:20px}',
      '.hkd .gear:active{background:rgba(255,255,255,0.26)}',
      // a phone's header row is 40 px, as are its well and X (SHEET_CSS)
      '@media (max-width:600px){.hkd .gear{width:40px;height:40px;border-radius:20px}}',
      '.hkd .gear[hidden]{display:none}',
      '.hkd .body > .acc{margin-block:0}',
      '.acc{display:flex;flex-direction:column;gap:18px;padding-bottom:6px;font-size:16px}',
      // colours are variables with the sheet's (dark) values as defaults, so
      // the settings page can draw the same pane in its own light or dark
      '.acc .cap{font-size:13px;font-weight:600;letter-spacing:.3px;color:var(--acc-label2,rgba(255,255,255,0.55));',
      '  text-transform:uppercase;padding:0 6px 6px}',
      '.acc .grp{background:var(--acc-cell,rgba(255,255,255,0.08));border-radius:14px;overflow:hidden}',
      '.acc .row{display:flex;align-items:center;justify-content:space-between;gap:14px;',
      '  min-height:50px;padding:0 16px;box-sizing:border-box}',
      // the line between two rows starts at their text, as iOS draws it
      '.acc .row + .row{background:linear-gradient(var(--acc-sep,rgba(255,255,255,0.09)),var(--acc-sep,rgba(255,255,255,0.09)))',
      '  16px 0/calc(100% - 16px) 1px no-repeat}',
      '.acc .row .k{flex-shrink:0;color:var(--acc-label,rgba(255,255,255,0.92))}',
      '.acc input.nm{flex:1;min-width:0;background:transparent;border:0;color:var(--acc-text,#fff);font:inherit;',
      '  text-align:right;outline:none;padding:0;text-overflow:ellipsis}',
      // the whole row's height is the field's target, not its 21 px of text
      '.acc .row input.nm,.acc .row select{align-self:stretch;min-height:44px}',
      '.acc input.nm::placeholder{color:var(--acc-label3,rgba(255,255,255,0.4))}',
      '.acc select{min-width:0;max-width:60%;background:transparent;color:var(--acc-value,rgba(255,255,255,0.75));border:0;',
      '  font:inherit;text-align:right;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer}',
      '.acc select option{color:#000}',
      '.acc .tg{-webkit-appearance:none;appearance:none;width:51px;height:31px;border-radius:16px;margin:0;',
      '  background:var(--acc-fill,rgba(255,255,255,0.18));position:relative;cursor:pointer;flex-shrink:0;transition:background .2s}',
      '.acc .tg::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;',
      '  background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);transition:transform .2s}',
      '.acc .tg:checked{background:var(--acc-green,#34c759)}',
      '.acc .tg:checked::after{transform:translateX(20px)}',
      '.acc .seg{display:flex;gap:2px;background:var(--acc-seg,rgba(255,255,255,0.08));border-radius:10px;padding:2px;margin:10px 12px}',
      // each choice as wide as its word, the rest shared out: equal fifths
      // left "Automatic" (bold when chosen) spilling into "Light" on a phone
      '.acc .seg button{flex:1 1 auto;min-width:0;padding:0 6px;height:32px;border:0;border-radius:8px;background:transparent;',
      '  color:var(--acc-text,#fff);font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}',
      '.acc .seg button.on{background:var(--acc-seg-on,rgba(255,255,255,0.24));font-weight:600}',
      '.acc .glyphs{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:8px;padding:12px}',
      '.acc .glyphs button{width:46px;height:46px;border-radius:23px;border:0;cursor:pointer;justify-self:center;',
      '  background:var(--acc-glyph,rgba(255,255,255,0.10));color:var(--acc-text,#fff);--mdc-icon-size:23px;display:flex;',
      '  align-items:center;justify-content:center;font:inherit;font-size:11px}',
      '.acc .glyphs button.on{background:var(--acc-glyph-on-bg,rgba(255,255,255,0.92));color:var(--acc-glyph-on-fg,#000)}',
      '.acc .swatches{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px}',
      '.acc .swatches button{width:32px;height:32px;border-radius:16px;border:2px solid transparent;cursor:pointer;',
      '  font:inherit;font-size:10px;color:var(--acc-text,#fff);background:var(--acc-glyph,rgba(255,255,255,0.12))}',
      '.acc .swatches button.on{border-color:var(--acc-text,#fff);box-shadow:0 0 0 2px rgba(0,0,0,0.4) inset}',
      '.acc .swatches button:first-child{width:auto;padding:0 10px}',
      '.acc .glyphs.fvg{border-top:1px solid var(--acc-sep,rgba(255,255,255,0.09))}',
      '.acc .with{display:flex;flex-wrap:wrap;gap:8px;padding:0 14px 12px}',
      '.acc .with[hidden]{display:none}',
      '.acc .with button{height:32px;border-radius:16px;border:0;background:var(--acc-glyph,rgba(255,255,255,0.14));color:var(--acc-text,#fff);',
      '  font:inherit;font-size:14px;padding:0 12px;cursor:pointer}',
      '.acc .reset{height:50px;border:0;border-radius:14px;background:var(--acc-cell,rgba(255,255,255,0.08));',
      '  color:var(--acc-red,#ff453a);font:inherit;cursor:pointer;width:100%}',
      // Reset asks first, in place (an alert over a sheet would stack two sheets)
      '.acc .sure{display:flex;flex-direction:column;gap:8px}',
      '.acc .sure[hidden]{display:none}',
      '.acc .sure .q{font-size:13px;line-height:18px;color:var(--acc-label2,rgba(255,255,255,0.55));padding:0 6px;text-align:center}',
      '.acc .sure .b{display:flex;gap:8px}',
      '.acc .sure button{flex:1;height:44px;border:0;border-radius:12px;font:inherit;cursor:pointer;',
      '  background:var(--acc-cell,rgba(255,255,255,0.08));color:var(--acc-text,#fff)}',
      '.acc .sure button.go{color:var(--acc-red,#ff453a);font-weight:600}',
      '.acc .note{font-size:13px;line-height:18px;color:var(--acc-label2,rgba(255,255,255,0.5));padding:0 6px}',
      '.acc .err{color:var(--acc-orange,#ff9f0a)}',
      '.acc .sec[hidden],.acc .row[hidden]{display:none}',
      '.acc .tg:focus-visible,.acc button:focus-visible,.acc select:focus-visible,.acc input:focus-visible{outline:2px solid var(--acc-focus,#0a84ff);outline-offset:2px}'
    ].join('');

    // The glyphs a kind of thing is offered, the Home app's vocabulary first.
    var GLYPHS = {
      light: ['lightbulb', 'lightbulb-group', 'lightbulb-multiple', 'ceiling-light', 'chandelier', 'lamp',
              'floor-lamp', 'desk-lamp', 'wall-sconce', 'vanity-light', 'light-recessed', 'light-flood-down',
              'outdoor-lamp', 'coach-lamp', 'string-lights', 'led-strip-variant', 'christmas-tree', 'pine-tree',
              'lightbulb-night', 'motion-sensor', 'sword', 'fire'],
      outlet: ['power-socket-us', 'toggle-switch', 'coffee', 'lamp', 'string-lights', 'christmas-tree', 'fire',
               'fan', 'television', 'monitor', 'desktop-tower', 'server', 'server-network', 'printer-3d',
               'amplifier', 'gamepad-variant', 'run-fast', 'washing-machine', 'dishwasher', 'fridge',
               'microwave', 'stove', 'water-boiler', 'sprinkler-variant', 'faucet', 'scent',
               'guitar-acoustic', 'teddy-bear', 'ev-plug-tesla', 'power-plug-battery-outline'],
      fan: ['fan', 'air-conditioner', 'hvac', 'air-humidifier'],
      cover: ['blinds-horizontal', 'roller-shade', 'window-closed-variant', 'garage', 'garage-variant', 'door-closed'],
      // a door or window sensor: each is drawn open and shut (its pair)
      contact: ['door-closed', 'window-closed-variant', 'garage', 'garage-variant'],
      media_player: ['television', 'apple-tv', 'homepod', 'homepod-mini', 'speaker', 'speaker-play', 'music',
                     'amplifier', 'monitor'],
      lock: ['lock', 'door-closed-lock', 'key-variant', 'garage'],
      other: ['home', 'star-fill', 'sparkles', 'toggle-switch', 'power-socket-us', 'lightbulb', 'fan',
              'thermometer-water', 'water', 'timer-sand', 'bed', 'sofa', 'shield-home', 'car']
    };
    function glyphsFor(id, show) {
      var d = domainOf(id);
      if (show === 'light') return GLYPHS.light;
      if (show === 'fan') return GLYPHS.fan;
      if (show === 'switch' || show === 'outlet') return GLYPHS.outlet;
      if (d === 'switch' || d === 'input_boolean') return GLYPHS.outlet;
      if (d === 'binary_sensor') {
        var dc = at(stOf(C.hass(), id), 'device_class');
        if (/^(door|window|garage_door|opening)$/.test(String(dc || ''))) return GLYPHS.contact;
      }
      return GLYPHS[d] || GLYPHS.other;
    }
    function accessoriesNow() {
      var HS = window.hkSettings;
      return (HS && HS.get('accessories', null)) || { entities: {}, rooms: {} };
    }
    function accOf(id) { return (accessoriesNow().entities || {})[id] || {}; }
    function dashNow() { try { return String(location.pathname).split('/')[1] || ''; } catch (e) { return ''; } }
    // THE ACCESSORY'S NAME for the sheet's title: this dashboard's, else the
    // home's (null: none set).
    function accName(id) {
      var a = accOf(id), dash = dashNow();
      return (a.names && a.names[dash]) || a.name || null;
    }
    function accIcon(id) {
      var v = String(accOf(id).icon || '');
      return v ? (/^mdi:/.test(v) ? 'hk:' + v.slice(4) : v) : null;
    }
    function canEdit(h) { return !!(h && h.user && h.user.is_admin); }
    // Is this dashboard a generated one (custom:hk-dashboard)? Only those
    // draw favorites, so only there is "Favorite on this dashboard" offered.
    function generatedHere() {
      try {
        var ha = document.querySelector('home-assistant');
        var main = ha.shadowRoot.querySelector('home-assistant-main');
        var panel = main.shadowRoot.querySelector('ha-panel-lovelace');
        var raw = panel && panel.lovelace && panel.lovelace.rawConfig;
        return !!(raw && raw.strategy && /hk-dashboard$/.test(String(raw.strategy.type || '')));
      } catch (e) { return false; }
    }

    // opts.panel: drawn on the settings page, which is no dashboard -- no
    // "Only on this dashboard", no "Favorite on this dashboard".
    function accessoryPane(h, id, onName, opts) {
      opts = opts || {};
      var el = document.createElement('div');
      el.className = 'acc';
      var cur = accOf(id), dash = dashNow();
      var d = domainOf(id);
      var s = stOf(h, id);
      var HS = window.hkSettings;
      var boards = (HS && HS.get('boards', null)) || {};
      // opts.generated: said by the caller (tests); else read off the page
      var gen = opts.generated !== undefined ? !!opts.generated : generatedHere();
      var board = opts.panel || !gen ? null : boards[dash];
      // WHAT IS RELEVANT: "As a favorite" for something that is a favorite
      // somewhere, "As a chip or scene pill" for a chip or a pill -- or for
      // anything that already has those set, so nothing set hides.
      var anyBoard = function (key) {
        return Object.keys(boards).some(function (p) { return ((boards[p] || {})[key] || []).indexOf(id) >= 0; });
      };
      var isChip = anyBoard('chips_extra');
      var isPill = /^(scene|script|input_button|button)\./.test(id) || anyBoard('scenes');
      var favShown = anyBoard('favorites') || !!(cur.fav_name || cur.fav_icon || cur.fav_room || (cur.fav_with && cur.fav_with.length));
      var chipShown = isChip || isPill || !!(cur.color || cur.when || cur.attribute || cur.label);
      var chipRows = isChip || !!(cur.when || cur.attribute || cur.label);
      var e = (h.entities || {})[id] || {};
      var devArea = e.device_id && h.devices && h.devices[e.device_id] ? h.devices[e.device_id].area_id : null;
      var area = e.area_id || devArea || '';
      var here = !!(cur.names && cur.names[dash]);
      var errBox = null;

      function fail(err) {
        if (!errBox) return;
        errBox.textContent = 'Not saved: ' + ((err && err.message) || err || 'unknown error');
        errBox.hidden = false;
      }
      function save(changes) {
        if (errBox) errBox.hidden = true;
        return h.callWS(Object.assign({ type: 'hk_frontend/accessory/set', entity_id: id }, changes)).then(function (r) {
          if (opts.onSave) opts.onSave(true);
          return r;
        }, function (e) { fail(e); if (opts.onSave) opts.onSave(false); });
      }

      var html = '';
      html += '<div><div class="cap">Name and room</div><div class="grp">' +
        '<div class="row"><span class="k">Name</span><input class="nm" type="text" maxlength="60" aria-label="Name" ' +
        'autocomplete="off" spellcheck="false"></div>' +
        (opts.panel ? '' : '<div class="row"><span class="k">Only on this dashboard</span><input class="tg here" type="checkbox" role="switch" aria-label="Only on this dashboard"></div>') +
        '<div class="row"><span class="k">Room</span><select class="room" aria-label="Room"></select></div></div></div>';
      var showable = d === 'switch' || d === 'light' || d === 'input_boolean';
      if (showable) {
        html += '<div><div class="cap">Show as</div><div class="grp"><div class="seg show"></div></div></div>';
      }
      // WHAT ITS STATES ARE CALLED: a switch or a helper's
      // "Blocked" / "Allowed" in place of On / Off, on its tiles and favorite
      var named2 = d === 'switch' || d === 'input_boolean';
      if (named2) {
        html += '<div><div class="cap">What it says</div><div class="grp">' +
          '<div class="row"><span class="k">When on</span><input class="nm ontx" type="text" maxlength="30" aria-label="When on, it says" ' +
          'placeholder="On" autocomplete="off" spellcheck="false"></div>' +
          '<div class="row"><span class="k">When off</span><input class="nm offtx" type="text" maxlength="30" aria-label="When off, it says" ' +
          'placeholder="Off" autocomplete="off" spellcheck="false"></div></div></div>';
      }
      html += '<div><div class="cap">Icon</div><div class="grp"><div class="glyphs"></div></div></div>';
      html += '<div><div class="cap">Where it shows</div><div class="grp">' +
        '<div class="row"><span class="k">Include in Status</span><input class="tg status" type="checkbox" role="switch" aria-label="Include in Status"></div>' +
        '<div class="row"><span class="k">Show on Home</span><input class="tg home" type="checkbox" role="switch" aria-label="Show on Home"></div>' +
        (board ? '<div class="row"><span class="k">Favorite on this dashboard</span><input class="tg fav" type="checkbox" role="switch" aria-label="Favorite on this dashboard"></div>' : '') +
        '</div></div>';
      // AS A FAVORITE: its name and glyph on the favorites row,
      // on every dashboard where it is a favorite, and the lights it controls
      // together with there ("Main + Table Lights")
      var joinable = d === 'light' || d === 'switch' || d === 'input_boolean';
      html += '<div class="sec fav"' + (favShown ? '' : ' hidden') + '><div class="cap">As a favorite</div><div class="grp">' +
        '<div class="row"><span class="k">Name</span><input class="nm fvn" type="text" maxlength="60" aria-label="Name as a favorite" ' +
        'autocomplete="off" spellcheck="false"></div>' +
        // the room line above its name there (a helper with no area)
        '<div class="row"><span class="k">Room</span><input class="nm fvr" type="text" maxlength="40" aria-label="Room line as a favorite" ' +
        'autocomplete="off" spellcheck="false"></div>' +
        '<div class="glyphs fvg"></div>' +
        (joinable ? '<div class="row"><span class="k">Together with</span><select class="fvw" aria-label="Together with"></select></div>' +
                    '<div class="with"></div>' : '') +
        '</div></div>';
      // AS A CHIP OR A SCENE PILL: its colour there, and as a chip ("Also as
      // chips") a label in place of its state and "show only when"
      html += '<div class="sec chip"' + (chipShown || favShown ? '' : ' hidden') + '><div class="cap">' +
        (!chipShown ? 'Its color, as a favorite' : isChip || !isPill ? 'As a chip or scene pill' : 'As a scene pill') + '</div><div class="grp">' +
        '<div class="swatches"></div>' +
        '<div class="row"' + (chipRows ? '' : ' hidden') + '><span class="k">Show only when it is</span><input class="nm when" type="text" maxlength="60" aria-label="Show only when it is" ' +
        'placeholder="any state" autocomplete="off" spellcheck="false"></div>' +
        // what the chip reads: its state, or one of its attributes, so a
        // chip of your own can pick what it shows
        '<div class="row"' + (chipRows ? '' : ' hidden') + '><span class="k">Shows</span><select class="attr" aria-label="Shows"></select></div>' +
        '<div class="row"' + (chipRows ? '' : ' hidden') + '><span class="k">Label</span><input class="nm lbl" type="text" maxlength="40" aria-label="Label" ' +
        'placeholder="what it shows" autocomplete="off" spellcheck="false"></div></div></div>';
      html += '<button class="reset">Reset to Automatic</button>' +
        '<div class="sure" hidden role="group" aria-label="Reset to Automatic"><div class="q">Every setting of this accessory goes back ' +
        'to automatic, on every screen. Its room stays.</div><div class="b"><button class="no">Cancel</button>' +
        '<button class="go">Reset</button></div></div>' +
        '<div class="note err" hidden></div>' +
        '<div class="note">Saved as you change it, on every screen. The room is Home Assistant\'s own; ' +
        'the name and icon are these dashboards\' only.</div>';
      el.innerHTML = html;
      errBox = el.querySelector('.err');

      // NAME
      var nm = el.querySelector('.nm'), hereBox = el.querySelector('.here') || { checked: false, addEventListener: function () {} };
      var fallback = at(s, 'friendly_name') || id;
      nm.placeholder = fallback;
      hereBox.checked = here;
      nm.value = (here ? cur.names[dash] : cur.name) || '';
      var nt = null;
      var saveName = function () {
        clearTimeout(nt);
        var v = nm.value.trim();
        var ch = { name: v || null };
        if (hereBox.checked) ch.screen = dash;
        else cur.name = v || null;
        save(ch).then(function () { if (onName) onName(v || null); });
      };
      nm.addEventListener('input', function () { clearTimeout(nt); nt = setTimeout(saveName, 700); });
      nm.addEventListener('change', saveName);
      nm.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') nm.blur(); });
      hereBox.addEventListener('change', function () {
        // moving the name between "the home's" and "this dashboard's"
        // (turning it off must not save the typed per-screen name as the
        // HOME's, overwriting it: the home's name comes back.)
        var v = nm.value.trim();
        if (hereBox.checked) {
          save({ name: v || null, screen: dash });
        } else {
          save({ name: null, screen: dash }).then(function () {
            nm.value = cur.name || '';
            if (onName) onName(cur.name || null);
          });
        }
      });

      // ROOM (Home Assistant's area). Choosing the device's own area goes
      // back to following the device.
      var room = el.querySelector('.room');
      var areas = Object.keys(h.areas || {}).map(function (k) { return h.areas[k]; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      room.innerHTML = '<option value="">No room</option>' + areas.map(function (a) {
        return '<option value="' + a.area_id + '">' + String(a.name).replace(/</g, '&lt;') + '</option>';
      }).join('');
      room.value = area;
      room.addEventListener('change', function () {
        var v = room.value || null;
        if (errBox) errBox.hidden = true;
        h.callWS({ type: 'config/entity_registry/update', entity_id: id,
                   area_id: v && v === devArea ? null : v }).catch(fail);
      });

      // SHOW AS
      var seg = el.querySelector('.seg.show');
      if (seg) {
        var showAs = [['', 'Automatic'], ['light', 'Light'], ['switch', 'Switch'], ['outlet', 'Outlet'], ['fan', 'Fan']];
        seg.innerHTML = showAs.map(function (o) {
          return '<button data-v="' + o[0] + '"' + ((cur.show_as || '') === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>';
        }).join('');
        seg.addEventListener('click', function (ev) {
          var b = ev.target.closest('button');
          if (!b) return;
          seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
          save({ show_as: b.dataset.v || null });
          paintGlyphs(b.dataset.v || null);
        });
      }

      // ICON
      var grid = el.querySelector('.glyphs');
      function paintGlyphs(show) {
        var chosen = String(cur.icon || '');
        var list = glyphsFor(id, show === undefined ? cur.show_as : show);
        if (chosen && list.indexOf(chosen.replace(/^(hk|mdi):/, '')) < 0) list = [chosen.replace(/^(hk|mdi):/, '')].concat(list);
        grid.innerHTML = '<button data-v="" class="' + (chosen ? '' : 'on') + '" aria-label="Automatic">Auto</button>' +
          list.map(function (g) {
            var on = chosen === 'hk:' + g || chosen === 'mdi:' + g;
            return '<button data-v="hk:' + g + '" aria-label="' + g + '"' + (on ? ' class="on"' : '') +
                   '><ha-icon icon="hk:' + g + '"></ha-icon></button>';
          }).join('');
      }
      paintGlyphs();
      grid.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        grid.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        cur.icon = b.dataset.v || null;
        save({ icon: b.dataset.v || null });
      });

      // WHERE IT SHOWS
      var st = el.querySelector('.status'), hm = el.querySelector('.home'), fav = el.querySelector('.fav');
      st.checked = cur.status !== false;
      hm.checked = cur.home !== false;
      st.addEventListener('change', function () { save({ status: st.checked ? null : false }); });
      hm.addEventListener('change', function () { save({ home: hm.checked ? null : false }); });
      if (fav && board) {
        fav.checked = (board.favorites || []).indexOf(id) >= 0;
        fav.addEventListener('change', function () {
          if (errBox) errBox.hidden = true;
          if (fav.checked) { var fs = el.querySelector('.sec.fav'); if (fs) fs.hidden = false; }
          h.callWS({ type: 'hk_frontend/board/favorite', dashboard: dash, entity_id: id,
                     favorite: fav.checked }).catch(fail);
        });
      }

      // AS A FAVORITE
      var fvn = el.querySelector('.fvn'), fvg = el.querySelector('.fvg'), fvw = el.querySelector('.fvw');
      var withBox = el.querySelector('.with');
      fvn.value = cur.fav_name || '';
      var favFallback = function () { return nm.value.trim() || fallback; };
      fvn.placeholder = favFallback();
      var fvr = el.querySelector('.fvr');
      if (fvr) fvr.placeholder = (area && h.areas && h.areas[area] && h.areas[area].name) || 'None';
      ['input', 'change'].forEach(function (t) { nm.addEventListener(t, function () { fvn.placeholder = favFallback(); }); });
      var ft = null;
      var saveFav = function () { clearTimeout(ft); save({ fav_name: fvn.value.trim() || null }); };
      fvn.addEventListener('input', function () { clearTimeout(ft); ft = setTimeout(saveFav, 700); });
      fvn.addEventListener('change', saveFav);
      fvn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') fvn.blur(); });
      function paintFavGlyphs() {
        var chosen = String(cur.fav_icon || '');
        var list = glyphsFor(id, cur.show_as);
        if (chosen && list.indexOf(chosen.replace(/^(hk|mdi):/, '')) < 0) list = [chosen.replace(/^(hk|mdi):/, '')].concat(list);
        fvg.innerHTML = '<button data-v="" class="' + (chosen ? '' : 'on') + '" aria-label="Same as its icon">Same</button>' +
          list.map(function (g) {
            var on = chosen === 'hk:' + g || chosen === 'mdi:' + g;
            return '<button data-v="hk:' + g + '" aria-label="' + g + '"' + (on ? ' class="on"' : '') +
                   '><ha-icon icon="hk:' + g + '"></ha-icon></button>';
          }).join('');
      }
      paintFavGlyphs();
      fvg.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        fvg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        cur.fav_icon = b.dataset.v || null;
        save({ fav_icon: b.dataset.v || null });
      });
      var nameOfId = function (x) { return at(stOf(h, x), 'friendly_name') || x; };
      function paintWith() {
        if (!fvw) return;
        var chosen = Array.isArray(cur.fav_with) ? cur.fav_with : [];
        withBox.innerHTML = chosen.map(function (x) {
          return '<button data-v="' + x + '" aria-label="Remove ' + esc(nameOfId(x)) + '">' + esc(nameOfId(x)) +
                 ' <span aria-hidden="true">\u2715</span></button>';
        }).join('');
        withBox.hidden = !chosen.length;
        // the others it could be joined with: this room's first, then the rest
        var areaOfId = function (x) {
          var ex = (h.entities || {})[x] || {};
          return ex.area_id || (ex.device_id && h.devices && h.devices[ex.device_id] ? h.devices[ex.device_id].area_id : '');
        };
        var pool = Object.keys(h.states).filter(function (x) {
          var dx = domainOf(x), ex = (h.entities || {})[x] || {};
          return x !== id && chosen.indexOf(x) < 0 && !ex.hidden && !ex.entity_category &&
                 (d === 'light' ? dx === 'light' : (dx === 'switch' || dx === 'light' || dx === 'input_boolean'));
        }).sort(function (x, y) {
          return ((areaOfId(y) === area) - (areaOfId(x) === area)) || nameOfId(x).localeCompare(nameOfId(y));
        });
        fvw.innerHTML = '<option value="">' + (chosen.length ? 'Add another' : 'Nothing else') + '</option>' +
          pool.map(function (x) { return '<option value="' + x + '">' + esc(nameOfId(x)) + '</option>'; }).join('');
        fvw.value = '';
      }
      if (fvw) {
        paintWith();
        fvw.addEventListener('change', function () {
          if (!fvw.value) return;
          cur.fav_with = (Array.isArray(cur.fav_with) ? cur.fav_with : []).concat([fvw.value]);
          save({ fav_with: cur.fav_with });
          paintWith();
        });
        withBox.addEventListener('click', function (ev) {
          var b = ev.target.closest('button');
          if (!b) return;
          cur.fav_with = (cur.fav_with || []).filter(function (x) { return x !== b.dataset.v; });
          save({ fav_with: cur.fav_with.length ? cur.fav_with : null });
          paintWith();
        });
      }

      // COLOR, SHOW ONLY WHEN, LABEL
      var SW = { white: '#f2f2f7', yellow: '#ffd60a', orange: '#ff9f0a', red: '#ff453a', pink: '#ff375f',
                 purple: '#bf5af2', blue: '#0a84ff', teal: '#64d2ff', mint: '#63e6e2', green: '#30d158' };
      var sw = el.querySelector('.swatches');
      if (sw) {
        sw.innerHTML = '<button data-v="" class="' + (cur.color ? '' : 'on') + '">Auto</button>' + Object.keys(SW).map(function (c) {
          return '<button data-v="' + c + '" aria-label="' + c + '" class="' + (cur.color === c ? 'on' : '') +
                 '" style="background:' + SW[c] + '"></button>';
        }).join('');
        sw.addEventListener('click', function (ev) {
          var b = ev.target.closest('button');
          if (!b) return;
          sw.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
          save({ color: b.dataset.v || null });
        });
      }
      var attrSel = el.querySelector('.attr');
      if (attrSel) {
        var sa = (h.states[id] && h.states[id].attributes) || {};
        var SKIP = { friendly_name: 1, icon: 1, entity_picture: 1, supported_features: 1, device_class: 1,
                     unit_of_measurement: 1, state_class: 1, attribution: 1, restored: 1, editable: 1, id: 1 };
        var keys = Object.keys(sa).filter(function (k) {
          var v = sa[k];
          return !SKIP[k] && v !== null && (typeof v !== 'object');
        }).sort();
        if (cur.attribute && keys.indexOf(cur.attribute) < 0) keys.unshift(cur.attribute);
        attrSel.innerHTML = '<option value="">Its state</option>' + keys.map(function (k) {
          return '<option value="' + esc(k) + '"' + (cur.attribute === k ? ' selected' : '') + '>' +
            esc(k.replace(/_/g, ' ')) + '</option>';
        }).join('');
        attrSel.addEventListener('change', function () { save({ attribute: attrSel.value || null }); });
      }
      [['.when', 'when'], ['.lbl', 'label'], ['.ontx', 'on_text'], ['.offtx', 'off_text'], ['.fvr', 'fav_room']].forEach(function (p) {
        var inp = el.querySelector(p[0]);
        if (!inp) return;
        inp.value = cur[p[1]] || '';
        var t = null;
        var go = function () { clearTimeout(t); var ch = {}; ch[p[1]] = inp.value.trim() || null; save(ch); };
        inp.addEventListener('input', function () { clearTimeout(t); t = setTimeout(go, 700); });
        inp.addEventListener('change', go);
      });

      var resetBtn = el.querySelector('.reset'), sure = el.querySelector('.sure');
      var noBtn = el.querySelector('.sure .no'), goBtn = el.querySelector('.sure .go');
      var focus = function (b) { if (b && b.focus) b.focus(); };
      resetBtn.addEventListener('click', function () {
        resetBtn.hidden = true; sure.hidden = false;
        focus(noBtn);
      });
      noBtn.addEventListener('click', function () {
        sure.hidden = true; resetBtn.hidden = false; focus(resetBtn);
      });
      goBtn.addEventListener('click', function () {
        sure.hidden = true; resetBtn.hidden = false;
        var all = { name: null, icon: null, show_as: null, status: null, home: null, color: null, when: null, label: null,
                    attribute: null, fav_name: null, fav_icon: null, fav_with: null, fav_room: null,
                    on_text: null, off_text: null };
        save(all).then(function () { return save({ name: null, screen: dash }); }).then(function () {
          cur = {};
          nm.value = ''; hereBox.checked = false; st.checked = true; hm.checked = true;
          if (seg) seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', !x.dataset.v); });
          paintGlyphs(null);
          fvn.value = ''; paintFavGlyphs(); paintWith();
          // everything the reset cleared shows cleared (the colour, what a
          // chip shows, its gate and label), not their old values
          if (sw) sw.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', !x.dataset.v); });
          if (attrSel) attrSel.value = '';
          ['.when', '.lbl', '.ontx', '.offtx', '.fvr'].forEach(function (q) { var i = el.querySelector(q); if (i) i.value = ''; });
          if (onName) onName(null);
        });
      });
      return el;
    }

    // opts: { direct } -- open this sheet, not the #alarm pop-up that hands
    //        back to it; { hashed } -- opened FOR a pop-up's hash, whose own
    //        history entry is the one Back leaves (so none is pushed here);
    //        { onClose } -- called once the sheet has gone, however it went
    function open(id, src, opts) {
      opts = opts || {};
      var h = C.hass();
      // A GROUP (openGroup below) is a sheet of several things, not one;
      // CARDS (a custom pop-up) the home's own cards.
      var kind = opts.group ? 'group' : opts.cards ? 'cards' : kindOf(h, id);
      if (!kind) return false;
      // THE ALARM IS A SHEET LIKE THE REST -- just the keypad -- opened
      // directly on a tap, not through a # pop-up. The #alarm pop-up remains
      // for an alarm automation that opens it by URL, and it hands straight
      // back here (opts.direct).
      var tag = PANELS[kind];
      if (!tag || !customElements.get(tag)) return false;
      // A SHEET OPENED FROM A SHEET takes over the open one's history entry
      // rather than stacking a second: pushing again would leave the first
      // entry behind, and the next Back press would land on it and do nothing.
      var reuse = false;
      if (D.el) { reuse = D.pushed && ours(D); close(true); }

      var s = stOf(h, id);
      var tok = ++TOK;
      var el = document.createElement('div');
      el.className = 'hkd';
      el.innerHTML = '<style>' + SHEET_CSS + ACC_CSS + '</style><div class="bd"></div>' +
        '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="hkd-t' + tok + '">' +
          '<div class="hd"><div class="well"><ha-state-icon></ha-state-icon></div>' +
          '<div class="tx"><div class="tt" id="hkd-t' + tok + '"></div></div>' +
          '<button class="gear" aria-label="Accessory settings" hidden><ha-icon icon="mdi:cog"></ha-icon></button>' +
          '<button class="x" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button></div>' +
          '<div class="body"></div></div>';
      var sheet = el.querySelector('.sheet');
      var panel = document.createElement(tag);
      // glass: false -- the sheet is its own blur; a panel in hk-glass's
      // member set would only make it re-measure the page on every open and
      // close.
      panel.setConfig(Object.assign({ entity: id, kind: kind, src: src || {}, glass: false },
        opts.group ? { entities: opts.group.ids, room: opts.group.room, groupKind: opts.group.kind } :
        opts.cards ? { cards: opts.cards.cards, width: opts.cards.width } : {}));

      D = {
        el: el, id: id, kind: kind, src: src || {}, panel: panel, sheet: sheet, tok: tok,
        well: el.querySelector('.well'), icon: el.querySelector('ha-state-icon'),
        tt: el.querySelector('.tt'), fed: null,
        // where it opened: a move to another page, or to a pop-up's hash,
        // takes the sheet down (see `moved` below)
        path: location.pathname, hash: location.hash,
        look: lookFor(src, id),
        colour: colourName(lookFor(src, id), id), sig: null, closing: false,
        // a pop-up's own "Close after" (Pop-ups)
        autoMs: opts.autoClose > 0 ? opts.autoClose : 0
      };
      sheet.style.setProperty('--hkd-w', (WIDTH[panel.hkWidthKind ? panel.hkWidthKind(h, s) : kind] || 440) + 'px');
      if (panel.hkFill && panel.hkFill()) panel.classList.add('fill');
      // A sheet as tall as its content (the camera's picture) instead of the
      // one height every control sheet shares; a bare one (the camera) is the
      // picture alone.
      if (panel.hkAutoHeight && panel.hkAutoHeight()) sheet.style.height = 'auto';
      if (panel.hkBare && panel.hkBare()) { sheet.classList.add('bare'); el.classList.add('bare'); }
      sheet.querySelector('.body').appendChild(panel);
      el.querySelector('.bd').addEventListener('click', function () { close(); });
      el.querySelector('.x').addEventListener('click', function (e) { e.stopPropagation(); close(); });
      // THE GEAR: this accessory's settings in place of its controls, and
      // back (admins only; not on a picture sheet or a group of several).
      var gear = el.querySelector('.gear');
      if (canEdit(h) && !opts.group && !opts.cards && !(panel.hkBare && panel.hkBare())) {
        gear.hidden = false;
        gear.addEventListener('click', function (e) {
          e.stopPropagation();
          var body = sheet.querySelector('.body');
          var pane = body.querySelector('.acc');
          if (pane) {
            body.removeChild(pane);
            panel.style.display = '';
            gear.firstChild.setAttribute('icon', 'mdi:cog');
            gear.setAttribute('aria-label', 'Accessory settings');
            return;
          }
          panel.style.display = 'none';
          body.appendChild(accessoryPane(C.hass() || h, id, function (name) {
            // what was just typed shows at once (a hand-written tile's own
            // name is back the next time the sheet opens)
            if (D.el === el) D.tt.textContent = name || (D.src && D.src.name) ||
              at(stOf(C.hass(), id), 'friendly_name') || id;
          }));
          body.scrollTop = 0;
          gear.firstChild.setAttribute('icon', 'mdi:check');
          gear.setAttribute('aria-label', 'Done');
        });
      }
      sheet.addEventListener('pointerdown', armAuto, true);
      panel.hkSheet = { close: close, sheet: sheet };

      haRoot().appendChild(el);
      var d = D;
      // EVERY NEW HASS, FROM EITHER SOURCE, ONCE. The hub (hk-base.js) moves
      // only while hk cards are on screen; <home-assistant> always holds the
      // frontend's current object. It is read once per animation frame while
      // the sheet is open: one property read and an identity compare, in the
      // frame a change would paint in, paused with the tab and gone with the
      // sheet (60 s at most). An event would need Home Assistant to announce
      // hass changes, which it does not, and wrapping its `hass` setter would
      // be reaching into the frontend's own element.
      var feed = function (nh) {
        if (!nh || nh === d.fed || D !== d) return;
        d.fed = nh;
        var ns = stOf(nh, d.id);
        var sig = ns ? ns.last_updated : 'x';
        if (sig !== d.sig) { d.sig = sig; paintHeader(nh); }
        panel.hass = nh;
      };
      feed(h);
      d.off = C.onHass(feed);
      var ha = document.querySelector('home-assistant');
      var poll = function () {
        if (D !== d) return;
        if (ha && ha.hass) feed(ha.hass);
        d.raf = requestAnimationFrame(poll);
      };
      d.raf = requestAnimationFrame(poll);
      // THE BACK BUTTON CLOSES IT, like a pop-up: one history entry, same URL.
      // A hash would do the same but would also close any hk-popup sheet the
      // detail was opened from (hk-popup matches the hash exactly).
      var entry = { hkDetail: id, hkTok: tok };
      d.onClose = opts.onClose || null;
      // OPENED FOR A POP-UP'S HASH (#alarm): that hash's own entry is the one
      // Back leaves, so pushing another would take two presses to get out
      if (opts.hashed) d.pushed = false;
      else try {
        if (reuse) history.replaceState(entry, '', location.href);
        else history.pushState(entry, '', location.href);
        d.pushed = true;
      } catch (e) { d.pushed = false; }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { if (D.el === el) el.classList.add('open'); });
      });
      armAuto();
      d.covers = true;
      covering(1);
      if (window.hkIdle && window.hkIdle.hold) window.hkIdle.hold('hk-detail', true);
      return true;
    }

    // silent: no history.back() -- the entry is already gone (popstate), or a
    // new sheet, a pop-up or a navigation is taking over.
    // A SHEET COVERS THE PAGE, as a pop-up does (hk-popup.js hkPopupCover):
    // the camera strip stops swapping stills under its blur until it goes.
    function covering(delta) {
      window.hkPopupCover = Math.max(0, (window.hkPopupCover || 0) + delta);
      try {
        window.dispatchEvent(new CustomEvent('hk-popup-change',
          { detail: { open: window.hkPopupOpen || 0, cover: window.hkPopupCover } }));
      } catch (e) { /* no event bus (a test) */ }
    }
    function close(silent) {
      var d = D;
      if (!d.el || d.closing) return;
      d.closing = true;
      if (d.covers) { d.covers = false; covering(-1); }
      clearTimeout(d.auto);
      if (d.off) d.off();
      if (d.raf && window.cancelAnimationFrame) cancelAnimationFrame(d.raf);
      d.el.classList.remove('open');
      var el = d.el;
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      D = { el: null };
      if (window.hkIdle && window.hkIdle.hold) window.hkIdle.hold('hk-detail', false);
      if (!silent && d.pushed && ours(d)) history.back();
      if (d.onClose) { try { d.onClose(); } catch (e) { /* the caller's */ } }
    }

    window.addEventListener('popstate', function () {
      if (D.el && !ours(D)) close(true);
    });

    // A POP-UP OR ANOTHER PAGE TAKES THE SCREEN: the sheet goes, quietly. A
    // pop-up's sheet sits under this one (z-index 7 to our 8), so a pop-up
    // opened by its trigger -- the #media bar when music starts, a quick
    // timer -- would be hidden until the sheet was closed. The hash the
    // sheet opened over (a sheet opened from inside a pop-up) is not a move.
    function moved() {
      if (!D.el) return;
      // A POP-UP'S SHEET GOES WITH ITS HASH, as an hk-popup-card does: an
      // alarm automation that re-opens #alarm every 50 s by loading the root
      // and then the hash again must close and re-open it (restarting its
      // Close after), not leave it up to time out mid-alarm.
      if (D.popup && location.hash !== '#' + D.popup) { close(true); return; }
      if (location.pathname !== D.path || (location.hash && location.hash !== D.hash)) close(true);
    }
    window.addEventListener('location-changed', moved);
    window.addEventListener('hashchange', moved);

    // ESCAPE CLOSES IT, like HA's dialog. On window, bubbling: hk-base's
    // confirm and choose sheets take Escape at document capture and stop it,
    // so a question asked over this sheet closes alone.
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && D.el) { e.stopPropagation(); close(); }
    });

    // Leave the sheet for another page (Browse Music): drop our history entry
    // without going back, then navigate.
    function navigateFrom(path) {
      if (D.el) {
        try { if (ours(D)) history.replaceState(null, '', location.href); } catch (e) { /* ok */ }
        close(true);
      }
      history.pushState(null, '', path);
      window.dispatchEvent(new CustomEvent('location-changed'));
    }

    // ------------------------------------------------------------ interception
    // HA's own surfaces, anywhere in the event's path. Checked over the WHOLE
    // path before anything is taken: an hk card inside HA's card-editor
    // preview (an HA dialog) is still an HK- element, and a first-match
    // walk would take it before it ever reached the dialog.
    var HA_OWN = { 'HA-PANEL-CONFIG': 1, 'HA-DIALOG': 1, 'HA-MD-DIALOG': 1, 'HA-WA-DIALOG': 1,
                   'HA-ADAPTIVE-DIALOG': 1, 'HA-MORE-INFO-DIALOG': 1 };
    function fromDashboard(e) {
      var path = e.composedPath ? e.composedPath() : [], mine = false;
      for (var i = 0; i < path.length; i++) {
        var t = path[i] && path[i].tagName;
        if (!t) continue;
        if (HA_OWN[t]) return false;
        if (t === 'HA-PANEL-LOVELACE' || t.indexOf('HK-') === 0) mine = true;
      }
      return mine;
    }
    // THE CARD THAT ASKED, for its name, glyph, colour and any confirmation:
    // the sheet should look like the pill it came from. Only a card whose own
    // entity is the one asked about: the first hk card in the path can be a
    // container (a row, a grid) or a card showing something else, and its
    // name would then label the wrong sheet. None: {} -- the entity's own name.
    function sourceOf(e, id) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (!el || !el._config || !el.tagName || el.tagName.indexOf('HK-') !== 0) continue;
        var c = el._config;
        if (c.entity !== id) continue;
        var conf = (c.icon_tap_action && c.icon_tap_action.confirmation) ||
                   (c.tap_action && c.tap_action.confirmation) || null;
        return { name: c.name, icon: c.icon, icon_color: c.icon_color, confirmation: conf,
                 type: el.tagName.toLowerCase(), config: c };
      }
      return {};
    }
    // OFF: the Configure menu's detail sheets switch (look.details),
    // a card's own `detail: false`, or localStorage hk-detail-off=1 on one screen.
    function disabled(src) {
      if (C.setting && C.setting('look.details', true) === false) return true;
      try { if (localStorage.getItem('hk-detail-off') === '1') return true; } catch (e) { /* none */ }
      return !!(src && src.config && src.config.detail === false);
    }

    window.addEventListener('hass-more-info', function (e) {
      var id = e.detail && e.detail.entityId;
      if (!id) return;
      if (!fromDashboard(e)) return;
      var src = sourceOf(e, id);
      if (disabled(src)) return;
      var h = C.hass();
      if (!kindOf(h, id)) return;
      // Taken only if a sheet actually opened: open() can still say no (an
      // alarm on a dashboard with neither #alarm nor an alarm view), and a
      // swallowed event would be a dead tap. HA's own dialog then opens.
      if (!open(id, src)) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
    }, true);

    // ------------------------------------------------------------ panels
    var PANEL_CSS = [
      ':host{display:block;color:#fff;font-family:inherit}',
      // a display rule beats the hidden attribute; this puts it back
      '[hidden]{display:none!important}',
      // 3 px above and below, the same: a centred panel is centred to the pixel
      '.pn{display:flex;flex-direction:column;align-items:center;gap:20px;padding:3px 0}',
      '.big{font-size:44px;font-weight:600;letter-spacing:-1.5px;line-height:1;',
      '  font-variant-numeric:tabular-nums;min-height:44px;text-align:center}',
      '.lab{align-self:stretch;font-size:13px;font-weight:600;letter-spacing:.2px;',
      '  color:rgba(235,235,245,0.55);text-transform:uppercase;margin-bottom:-10px}',
      // the vertical slider (brightness, speed, shade)
      // ONE SLIDER SIZE on every sheet (150 x 440; a phone 128 x 360)
      '.vs{position:relative;width:150px;height:440px;border-radius:44px;flex-shrink:0;',
      '  background:rgba(255,255,255,0.14);overflow:hidden;touch-action:none;cursor:pointer;',
      '  outline:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}',
      '.vs:focus-visible{box-shadow:0 0 0 3px rgba(100,181,255,0.8)}',
      // shorter when a row of buttons sits under it (a colour light, a humidifier)
      '.vs.short{height:320px}',
      '.vs .fill{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(255,255,255,0.95);',
      '  transition:height .18s ease}',
      '.vs.drag .fill{transition:none}',
      '.vs .gl{position:absolute;left:0;right:0;bottom:22px;display:flex;justify-content:center;',
      '  pointer-events:none;color:rgba(255,255,255,0.72);transition:color .15s}',
      '.vs .gl.dark{color:rgba(0,0,0,0.55)}',
      '.vs .tick{position:absolute;left:20px;right:20px;height:2px;border-radius:1px;',
      '  background:rgba(255,255,255,0.16);pointer-events:none}',
      '.vs .tick.in{background:rgba(0,0,0,0.13)}',
      // buttons -- NOT ".pill": hk-base's BASE_CSS owns that name (the
      // dashboard's glass pill, with the blur layer's marker), and reusing it
      // draws a dark box behind every sheet button
      '.btn{height:52px;border:0;border-radius:26px;padding:0 20px;display:inline-flex;',
      '  align-items:center;justify-content:center;gap:8px;font:inherit;font-size:16px;',
      '  font-weight:600;color:#fff;background:rgba(255,255,255,0.13);cursor:pointer;',
      '  -webkit-tap-highlight-color:transparent}',
      '.btn:active{background:rgba(255,255,255,0.24)}',
      '.btn.sel{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.88)}',
      '.btn[disabled]{opacity:.4;cursor:default}',
      // UNAVAILABLE (Panel._na): every control greys out and takes no input
      ':host([na]) .vs,:host([na]) .btn,:host([na]) .sw,:host([na]) .tp,:host([na]) .vol,',
      ':host([na]) .vst,:host([na]) .list,:host([na]) .cmds{opacity:.4;pointer-events:none}',
      '.menu{align-self:stretch;justify-content:space-between;padding:0 16px 0 20px}',
      '.menu .cur{display:inline-flex;align-items:center;gap:4px;color:rgba(235,235,245,0.62);',
      '  font-weight:500;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.menu .cur svg{flex-shrink:0}',
      '.muted{font-size:15px;color:rgba(235,235,245,0.62);text-align:center}',
      // the axes (axesChart): values up the left, each centred on its rule
      // ONE GRID: the values' column, as wide as its WIDEST label (a hidden
      // copy of it sizes the column), then the plot; the times sit under the
      // plot in the same grid. A fixed 38 px column leaves short labels ("0",
      // "2") far in from the card's edge while the plot runs to the other --
      // the chart looks off-centre in its card.
      '.axc{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:10px;align-items:start}',
      '.ay{position:relative}',
      '.ay .sz{visibility:hidden;display:block;height:0;overflow:hidden;font-size:12px;line-height:14px;',
      '  font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.ay span{position:absolute;right:0;transform:translateY(-50%);font-size:12px;line-height:14px;',
      '  color:rgba(235,235,245,0.5);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.ap{position:relative;min-width:0}',
      '.axc > .axx{grid-column:2;margin:8px 0 0}',
      '.ap .gr{position:absolute;left:0;right:0;height:1px;margin-top:-0.5px;background:rgba(255,255,255,0.07);pointer-events:none}',
      '.ap .gr.b{background:rgba(255,255,255,0.16)}',
      '.axc.fl{align-items:stretch;grid-template-rows:minmax(0,1fr) auto}',
      '.axc.fl .ap > svg{height:100% !important;overflow:visible}',
      '.axx{position:relative;height:14px;margin:8px 0 0 48px;font-size:12px;line-height:14px;color:rgba(235,235,245,0.5)}',
      '.axx span{position:absolute;top:0;white-space:nowrap;transform:translateX(-50%)}',
      '.axx span:first-child{transform:none}',
      '.axx span:last-child{transform:translateX(-100%)}',
      '@media (max-width:600px){',
      '  .pn{gap:16px}',
      '  .big{font-size:38px;min-height:38px}',
      '  .vs{width:128px;height:360px;border-radius:38px}',
      '  .vs.short{height:280px}',
      '  .vs .gl{bottom:18px}',
      '  .lab{margin-bottom:-8px}',
      '  .btn{height:48px;border-radius:24px;font-size:15px}',
      '}'
    ].join('');

    var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
               'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
               '<path d="m9 6 6 6-6 6"/></svg>';
    // the current row's tick (effects, inputs, every pick list) and the search glyph
    var TICK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" stroke-width="2.6" ' +
               'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    var SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(235,235,245,.6)" stroke-width="2.2" ' +
                 'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';

    class Panel extends HkBase {
      static get CSS() { return PANEL_CSS; }
      // _stateObj, not _st: HkBase has a METHOD _st(id), and a getter of the
      // same name would replace it for every panel.
      get _stateObj() { return stOf(this._hass, this._config && this._config.entity); }
      get _id() { return this._config && this._config.entity; }
      get _src() { return (this._config && this._config.src) || {}; }
      _svc(domain, service, data) {
        return this._call(domain, service, Object.assign({ entity_id: this._id }, data || {}));
      }
      // UNAVAILABLE, ONE WAY FOR EVERY SHEET: the controls grey out and take
      // no input (PANEL_CSS :host([na])), and the caller's readout says
      // "Unavailable" -- never a stale "Off" or a shade drawn "Open". Only
      // `unavailable`: an `unknown` device still takes commands, as in HA.
      _na(s) {
        var na = !!s && s.state === 'unavailable';
        if (na) this.setAttribute('na', ''); else this.removeAttribute('na');
        return na;
      }
      // The vertical slider. o: { steps, glyph, onInput(v), onChange(v), label }
      // Drag moves from where it is (as the Home app does); a tap jumps to the tap.
      _vslider(o) {
        var self = this;
        var el = document.createElement('div');
        el.className = 'vs';
        el.setAttribute('role', 'slider');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', o.label || 'Level');
        el.setAttribute('aria-valuemin', '0');
        el.setAttribute('aria-valuemax', '100');
        var ticks = '';
        if (o.steps && o.steps > 1 && o.steps <= 10) {
          for (var i = 1; i < o.steps; i++) {
            ticks += '<div class="tick" data-f="' + (i / o.steps) + '" style="bottom:calc(' + (i / o.steps * 100) + '% - 1px)"></div>';
          }
        }
        el.innerHTML = '<div class="fill"></div>' + ticks + '<div class="gl">' + (o.glyph || '') + '</div>';
        var fill = el.querySelector('.fill'), gl = el.querySelector('.gl');
        var cur = 0, drag = null;
        function snap(v) {
          v = clamp(v, 0, 1);
          if (o.steps && o.steps > 1) return Math.round(v * o.steps) / o.steps;
          return Math.round(v * 100) / 100;
        }
        function show(v) {
          cur = v;
          fill.style.height = (v * 100) + '%';
          el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
          var h = el.clientHeight || 380;
          gl.classList.toggle('dark', v * h > 58);
          el.querySelectorAll('.tick').forEach(function (t) {
            t.classList.toggle('in', Number(t.getAttribute('data-f')) < v - 1e-6);
          });
        }
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
          drag = { y0: e.clientY, v0: cur, moved: false, rect: el.getBoundingClientRect() };
        });
        el.addEventListener('pointermove', function (e) {
          if (!drag) return;
          var dy = e.clientY - drag.y0;
          if (!drag.moved && Math.abs(dy) < 5) return;
          if (!drag.moved) { drag.moved = true; el.classList.add('drag'); }
          var v = snap(drag.v0 - dy / drag.rect.height);
          if (v !== cur) { show(v); if (o.onInput) o.onInput(v); }
        });
        function end(e, cancel) {
          if (!drag) return;
          var d = drag; drag = null;
          el.classList.remove('drag');
          if (cancel) return;
          var v = d.moved ? cur : snap(1 - (e.clientY - d.rect.top) / d.rect.height);
          show(v);
          if (o.onChange) o.onChange(v);
        }
        el.addEventListener('pointerup', function (e) { end(e, false); });
        el.addEventListener('pointercancel', function (e) { end(e, true); });
        el.addEventListener('keydown', function (e) {
          var step = o.steps && o.steps > 1 ? 1 / o.steps : 0.05;
          var v = null;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = snap(cur + step);
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = snap(cur - step);
          if (v == null) return;
          e.preventDefault();
          show(v);
          if (o.onChange) o.onChange(v);
        });
        return {
          el: el,
          set: function (v) { if (!drag) show(clamp(v, 0, 1)); },
          fill: function (bg) { fill.style.background = bg; },
          dragging: function () { return !!drag; }
        };
      }
      // TWO COLUMNS WHEN THERE IS ROOM, decided here and not by a CSS
      // container query: Safari does not match container-query rules in a shadow
      // tree against :host, so the thermostat and the graph would stay stacked
      // (and overflow the 680 sheet) there while Chrome is fine. A panel that
      // has a wide layout returns its width from _wideAt(); its CSS keys off
      // :host([wide]) and _onWide() repaints whatever it drew for the other
      // width.
      _wideAt() { return 0; }
      connectedCallback() {
        if (super.connectedCallback) super.connectedCallback();
        var at = this._wideAt(), self = this;
        if (!at || this._ro || typeof ResizeObserver === 'undefined') return;
        this._ro = new ResizeObserver(function () {
          var w = self.clientWidth >= at;
          if (w === self.hasAttribute('wide')) return;
          if (w) self.setAttribute('wide', ''); else self.removeAttribute('wide');
          if (self._onWide) self._onWide();
        });
        this._ro.observe(this);
      }
      disconnectedCallback() {
        if (super.disconnectedCallback) super.disconnectedCallback();
        if (this._tickT) { clearInterval(this._tickT); this._tickT = null; }
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
      }
    }

    // ------------------------------------------------------------ light
    class LightPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // THE COLOUR GROUP: label, circles and Effects share one left edge and
          // one width (the row of circles), centred under the slider.
          '.grp{display:flex;flex-direction:column;gap:12px;align-self:center;max-width:100%;min-width:300px}',
          // the circles sit 4 px inside the row (room for the selected ring), so
          // the label and the button step in 4 px to share their edges exactly
          '.grp .lab{margin:0 0 -2px 4px}',
          '.grp .menu{align-self:stretch;margin:0 4px}',
          '.sw{display:flex;gap:12px;justify-content:flex-start;overflow-x:auto;',
          '  scrollbar-width:none;padding:4px}',
          '.sw::-webkit-scrollbar{display:none}',
          '.sw button{width:46px;height:46px;border-radius:23px;border:0;padding:0;flex-shrink:0;',
          '  cursor:pointer;box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
          '.sw button.sel{box-shadow:0 0 0 3px rgba(28,28,30,1),0 0 0 6px #fff}',
          '.sw .rainbow{background:conic-gradient(hsl(0,100%,55%),hsl(60,100%,55%),hsl(120,100%,50%),',
          '  hsl(180,100%,50%),hsl(240,100%,60%),hsl(300,100%,55%),hsl(360,100%,55%))}',
          // the sub-views: back row, wheel, whites, effects list
          // one height for every sub-view, so Colour <-> White does not
          // make the sheet jump (the wheel's view is the tallest)
          '.sub{align-self:stretch;display:flex;flex-direction:column;gap:16px;min-height:436px}',
          '.ctv{min-height:40px}',
          '.bk{display:flex;align-items:center;gap:10px}',
          '.bk button{width:40px;height:40px;border-radius:20px;border:0;padding:0;display:flex;',
          '  align-items:center;justify-content:center;background:rgba(255,255,255,0.13);color:#fff;cursor:pointer}',
          '.bk .t{font-size:20px;font-weight:700;letter-spacing:-.3px}',
          '.seg{display:flex;gap:4px;padding:4px;border-radius:16px;background:rgba(255,255,255,0.09)}',
          '.seg button{flex:1;height:40px;border:0;border-radius:12px;background:transparent;',
          '  color:rgba(255,255,255,0.86);font:inherit;font-size:15px;font-weight:600;cursor:pointer}',
          '.seg button.sel{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.88)}',
          '.wheel{position:relative;width:300px;height:300px;border-radius:50%;align-self:center;',
          '  touch-action:none;cursor:crosshair;',
          '  background:radial-gradient(circle closest-side,#fff,rgba(255,255,255,0)),',
          '  conic-gradient(hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),',
          '  hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))}',
          '.knob{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:17px;',
          '  border:4px solid #fff;box-sizing:border-box;box-shadow:0 2px 10px rgba(0,0,0,0.45);pointer-events:none}',
          '.ct{position:relative;height:56px;border-radius:28px;touch-action:none;cursor:pointer}',
          '.ct .knob{top:50%}',
          '.ctv{font-size:34px;font-weight:600;letter-spacing:-1px;text-align:center;font-variant-numeric:tabular-nums}',
          '.list{border-radius:18px;background:rgba(255,255,255,0.06);max-height:420px;overflow-y:auto;',
          '  overscroll-behavior:contain;scrollbar-width:none}',
          '.list::-webkit-scrollbar{display:none}',
          '.list button{display:flex;align-items:center;justify-content:space-between;width:100%;',
          '  min-height:52px;padding:0 18px;border:0;border-bottom:1px solid rgba(255,255,255,0.07);',
          '  background:transparent;color:#fff;font:inherit;font-size:17px;text-align:left;cursor:pointer}',
          '.list button:last-child{border-bottom:0}',
          '.list .hd2{padding:16px 18px 6px;font-size:13px;font-weight:600;letter-spacing:.2px;',
          '  color:rgba(235,235,245,0.55);text-transform:uppercase}',
          '.list button:active{background:rgba(255,255,255,0.08)}',
          '.search{display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:14px;',
          '  background:rgba(255,255,255,0.10)}',
          '.search input{flex-grow:1;min-width:0;border:0;background:transparent;color:#fff;font:inherit;',
          '  font-size:17px;outline:none}',
          '.search input::placeholder{color:rgba(235,235,245,0.5)}',
          '@media (max-width:600px){',
          '  .sw{gap:8px}',
          '  .grp{min-width:0}',
          '  .sw button{width:38px;height:38px;border-radius:19px}',
          '  .wheel{width:250px;height:250px}',
          '  .sub{min-height:374px}',
          '  .list{max-height:340px}',
          '}'
        ].join('');
      }
      hkWidthKind(h, s) { var c = lightCaps(s); return (c.colour || c.temp || c.effects) ? 'light_colour' : 'light'; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        this._na(s);
        if (!this._built) this._build();
        this._view === 'main' ? this._paintMain(s) : this._view === 'effects' ? this._paintEffects(s) : this._paintWheel(s);
      }
      _build() {
        this._built = true;
        this._view = this._view || 'main';
        var self = this;
        this._root.innerHTML = '';
        var pn = document.createElement('div');
        pn.className = 'pn';
        this._root.appendChild(pn);
        this._pn = pn;
        if (this._view !== 'main') return this._buildSub();
        var s = this._stateObj, caps = lightCaps(s);
        var big = document.createElement('div');
        big.className = 'big';
        pn.appendChild(big);
        this._big = big;
        var send = throttle(function (v) {
          if (v <= 0) self._svc('light', 'turn_off');
          else self._svc('light', 'turn_on', { brightness_pct: Math.max(1, Math.round(v * 100)) });
        }, 350);
        this._slider = this._vslider({
          label: 'Brightness',
          glyph: glyph((this._src.icon || 'hk:lightbulb'), 30),
          onInput: function (v) { big.textContent = Math.round(v * 100) + '%'; send(v); },
          onChange: function (v) { big.textContent = v <= 0 ? 'Off' : Math.round(v * 100) + '%'; send(v); }
        });
        pn.appendChild(this._slider.el);
        if (caps.colour || caps.temp || caps.effects) {
          this._slider.el.classList.add('short');
          var grp = document.createElement('div');
          grp.className = 'grp';
          pn.appendChild(grp);
          if (caps.colour || caps.temp) {
            var lab = document.createElement('div');
            lab.className = 'lab';
            lab.textContent = 'Favorite colors';
            grp.appendChild(lab);
            var sw = document.createElement('div');
            sw.className = 'sw';
            grp.appendChild(sw);
            this._sw = sw;
            this._favSig = null;
          }
          if (caps.effects) {
            var fx = document.createElement('button');
            fx.className = 'btn menu';
            fx.innerHTML = '<span>Effects</span><span class="cur"></span>';
            fx.addEventListener('click', function () { self._go('effects'); });
            grp.appendChild(fx);
            this._fx = fx;
          }
        }
      }
      _go(view) {
        this._view = view;
        this._built = false;
        this._render();
      }
      _paintMain(s) {
        var on = s.state === 'on';
        var b = num(at(s, 'brightness'));
        var v = on ? (b != null ? b / 255 : 1) : 0;
        if (!this._slider.dragging()) {
          this._slider.set(v);
          this._big.textContent = s.state === 'unavailable' ? 'Unavailable' : on ? Math.round(v * 100) + '%' : 'Off';
        }
        this._slider.fill(lightFill(s));
        if (this._sw) this._paintFavs(s);
        if (this._fx) {
          // "off" is HA's no-effect; some lights say "none" or "None" instead
          var e = at(s, 'effect');
          var none = !e || e === 'off' || String(e).toLowerCase() === 'none';
          this._fx.querySelector('.cur').innerHTML = esc(none ? 'None' : e) + CHEV;
        }
      }
      _paintFavs(s) {
        var self = this;
        var favs = favourites(this._hass, s, function () { self._favSig = null; self._render(); });
        var sig = JSON.stringify(favs) + '|' + (at(s, 'hs_color') || '') + '|' + at(s, 'color_temp_kelvin') + '|' + at(s, 'color_mode');
        if (sig === this._favSig) return;
        this._favSig = sig;
        var html = favs.map(function (f, i) {
          return '<button data-i="' + i + '" aria-label="Favorite color ' + (i + 1) + '" class="' +
                 (favMatches(f, s) ? 'sel' : '') + '" style="background:' + favCss(f) + '"></button>';
        }).join('') + '<button class="rainbow" aria-label="More colors"></button>';
        this._sw.innerHTML = html;
        this._sw.querySelectorAll('button[data-i]').forEach(function (b) {
          b.addEventListener('click', function () {
            var f = favs[Number(b.getAttribute('data-i'))];
            self._svc('light', 'turn_on', Object.assign({}, f));
          });
        });
        this._sw.querySelector('.rainbow').addEventListener('click', function () { self._go('wheel'); });
      }
      // ---- sub-views
      _buildSub() {
        var self = this, s = this._stateObj, caps = lightCaps(s);
        var sub = document.createElement('div');
        sub.className = 'sub';
        this._pn.appendChild(sub);
        var title = this._view === 'effects' ? 'Effects' : 'Color';
        sub.innerHTML = '<div class="bk"><button aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BACK + '"/></svg></button><div class="t">' + title + '</div></div>';
        sub.querySelector('.bk button').addEventListener('click', function () { self._go('main'); });
        if (this._view === 'effects') {
          var list = (at(s, 'effect_list') || []).slice();
          if (list.length > 12) {
            var se = document.createElement('label');
            se.className = 'search';
            se.innerHTML = SEARCH + '<input type="search" placeholder="Search effects" aria-label="Search effects" autocomplete="off">';
            sub.appendChild(se);
            se.querySelector('input').addEventListener('input', function (ev) {
              self._q = ev.target.value;
              self._paintEffects(self._stateObj, true);
            });
          }
          var box = document.createElement('div');
          box.className = 'list';
          sub.appendChild(box);
          this._list = box;
          this._q = '';
          this._fxSig = null;
          return;
        }
        // the wheel: Colour and/or White
        this._tab = this._tab || (caps.colour ? 'colour' : 'white');
        if (caps.colour && caps.temp) {
          var seg = document.createElement('div');
          seg.className = 'seg';
          seg.innerHTML = '<button data-t="colour">Color</button><button data-t="white">White</button>';
          seg.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () { self._tab = b.getAttribute('data-t'); self._go('wheel'); });
            b.classList.toggle('sel', b.getAttribute('data-t') === self._tab);
          });
          sub.appendChild(seg);
        }
        if (this._tab === 'colour') {
          var w = document.createElement('div');
          w.className = 'wheel';
          w.setAttribute('role', 'slider');
          w.setAttribute('aria-label', 'Color');
          w.innerHTML = '<div class="knob"></div>';
          sub.appendChild(w);
          this._wheel = w;
          var sendHs = throttle(function (hs) { self._svc('light', 'turn_on', { hs_color: hs }); }, 300);
          var pick = function (e) {
            var r = w.getBoundingClientRect(), R = r.width / 2;
            var dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
            var hue = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            var sat = clamp(Math.sqrt(dx * dx + dy * dy) / R, 0, 1) * 100;
            var hs = [Math.round(hue), Math.round(sat)];
            self._placeKnob(hs);
            sendHs(hs);
          };
          var down = false;
          w.addEventListener('pointerdown', function (e) { e.preventDefault(); down = true; try { w.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } pick(e); });
          w.addEventListener('pointermove', function (e) { if (down) pick(e); });
          w.addEventListener('pointerup', function (e) { if (down) { down = false; pick(e); } });
          w.addEventListener('pointercancel', function () { down = false; });
        } else {
          var lo = num(at(s, 'min_color_temp_kelvin')) || 2000, hi = num(at(s, 'max_color_temp_kelvin')) || 6500;
          var val = document.createElement('div');
          val.className = 'ctv';
          sub.appendChild(val);
          var ct = document.createElement('div');
          ct.className = 'ct';
          ct.setAttribute('role', 'slider');
          ct.setAttribute('aria-label', 'Color temperature');
          var stops = [];
          for (var k = 0; k <= 4; k++) stops.push(css(kelvinRgb(lo + (hi - lo) * k / 4)));
          ct.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
          ct.innerHTML = '<div class="knob"></div>';
          sub.appendChild(ct);
          this._ct = { el: ct, val: val, lo: lo, hi: hi };
          var sendK = throttle(function (kv) { self._svc('light', 'turn_on', { color_temp_kelvin: kv }); }, 300);
          var pickK = function (e) {
            var r = ct.getBoundingClientRect();
            var f = clamp((e.clientX - r.left - 28) / (r.width - 56), 0, 1);
            var kv = Math.round((lo + (hi - lo) * f) / 50) * 50;
            self._placeCt(kv);
            sendK(kv);
          };
          var dn = false;
          ct.addEventListener('pointerdown', function (e) { e.preventDefault(); dn = true; try { ct.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } pickK(e); });
          ct.addEventListener('pointermove', function (e) { if (dn) pickK(e); });
          ct.addEventListener('pointerup', function (e) { if (dn) { dn = false; pickK(e); } });
          ct.addEventListener('pointercancel', function () { dn = false; });
        }
      }
      _placeKnob(hs) {
        if (!this._wheel) return;
        var k = this._wheel.querySelector('.knob');
        var a = hs[0] * Math.PI / 180, r = hs[1] / 100 * 50;
        k.style.left = (50 + Math.sin(a) * r) + '%';
        k.style.top = (50 - Math.cos(a) * r) + '%';
        k.style.background = hsCss(hs);
      }
      _placeCt(kv) {
        var c = this._ct;
        if (!c) return;
        var f = clamp((kv - c.lo) / ((c.hi - c.lo) || 1), 0, 1);
        var k = c.el.querySelector('.knob');
        k.style.left = 'calc(28px + ' + (f * 100) + '% - ' + (f * 56) + 'px)';
        k.style.background = css(kelvinRgb(kv));
        c.val.textContent = kv + ' K';
      }
      _paintWheel(s) {
        // A light that is off (or in a white mode) reports no colour: the
        // marker waits at the white centre rather than a corner of the box.
        if (this._wheel && !this._wheel.matches(':active')) {
          var hs = at(s, 'color_mode') !== 'color_temp' && at(s, 'hs_color');
          this._placeKnob(hs || [0, 0]);
        }
        if (this._ct) {
          var kv = num(at(s, 'color_temp_kelvin'));
          if (kv && !this._ct.el.matches(':active')) this._placeCt(kv);
          else if (!kv && !this._ct.placed) {
            // no reading (off, or in colour): the knob waits mid-strip, and
            // the readout stays blank rather than claim a temperature
            this._placeCt(Math.round((this._ct.lo + this._ct.hi) / 2));
            this._ct.val.textContent = '';
          }
          this._ct.placed = true;
        }
      }
      _paintEffects(s, force) {
        var self = this;
        var cur = at(s, 'effect');
        var q = (this._q || '').toLowerCase();
        var list = (at(s, 'effect_list') || []).filter(function (e) { return !q || String(e).toLowerCase().indexOf(q) !== -1; });
        var sig = cur + '|' + q + '|' + list.length;
        if (!force && sig === this._fxSig) return;
        this._fxSig = sig;
        var tick = TICK;
        // WLED lists its presets first ("Preset: Doorbell"), then a divider
        // line, then the effects: two headed sections, the prefix dropped, and
        // no row for the divider. Anything else is one plain list.
        var presets = [], plain = [];
        list.forEach(function (e) {
          var t = String(e);
          if (/^[\s\u2500-\u257f\-_=\u2014]+$/.test(t)) return;
          if (/^preset:\s*/i.test(t)) presets.push(e); else plain.push(e);
        });
        var row = function (e) {
          var label = String(e).replace(/^preset:\s*/i, '');
          return '<button data-e="' + esc(e) + '"><span>' + esc(label) + '</span>' + (e === cur ? tick : '') + '</button>';
        };
        var html = '';
        if (presets.length) html += '<div class="hd2">Presets</div>' + presets.map(row).join('') + (plain.length ? '<div class="hd2">Effects</div>' : '');
        html += plain.map(row).join('');
        this._list.innerHTML = html || '<div class="muted" style="padding:18px">No effects match</div>';
        this._list.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () { self._svc('light', 'turn_on', { effect: b.getAttribute('data-e') }); });
        });
      }
    }

    // ------------------------------------------------------------ toggle
    class TogglePanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // 150 x 320: the sliders' width, shorter than them (a 440 switch
          // reads as a funny tall pill)
          '.tg{position:relative;width:150px;height:320px;border-radius:75px;border:0;padding:0;',
          '  cursor:pointer;background:rgba(255,255,255,0.16);transition:background .25s;',
          '  -webkit-tap-highlight-color:transparent}',
          '.tg.on{background:#30d158}',
          '.tg .kn{position:absolute;left:12px;right:12px;top:calc(100% - 12px - 126px);height:126px;',
          '  border-radius:63px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.25);display:flex;',
          '  align-items:center;justify-content:center;color:rgba(0,0,0,0.35);',
          '  transition:top .28s cubic-bezier(.2,.8,.2,1),color .25s}',
          '.tg.on .kn{top:12px;color:#30d158}',
          '.tg[disabled]{opacity:.45;cursor:default}',
          '.since{font-size:16px;color:rgba(235,235,245,0.62);min-height:20px}',
          '@media (max-width:600px){.tg{width:128px;height:280px;border-radius:64px}',
          '  .tg .kn{height:108px;border-radius:54px;top:calc(100% - 12px - 108px)}.tg.on .kn{top:12px}}'
        ].join('');
      }
      hkWidthKind() { return 'toggle'; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        var self = this;
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><div class="big"></div><button class="tg" role="switch"><div class="kn">' +
            '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.4 7.4a8 8 0 1 0 11.2 0"/></svg>' +
            '</div></button><div class="since"></div></div>';
          this._tg = this._root.querySelector('.tg');
          this._big = this._root.querySelector('.big');
          this._since = this._root.querySelector('.since');
          this._tg.addEventListener('click', function () { self._toggle(); });
        }
        var on = s.state === 'on';
        this._tg.classList.toggle('on', on);
        this._tg.setAttribute('aria-checked', on ? 'true' : 'false');
        this._tg.setAttribute('aria-label', (this._src.name || at(s, 'friendly_name') || '') + (on ? ' on' : ' off'));
        this._tg.disabled = unavailable(s);
        this._big.textContent = unavailable(s) ? 'Unavailable' : on ? 'On' : 'Off';
        this._since.textContent = unavailable(s) ? '' : sinceText(s.last_changed);
      }
      _toggle() {
        var self = this, s = this._stateObj;
        var go = function () { self._svc('homeassistant', 'toggle'); };
        var conf = this._src.confirmation;
        if (conf && C.confirmSheet) C.confirmSheet(conf.text || ('Turn ' + (s.state === 'on' ? 'off' : 'on') + '?'), go);
        else go();
      }
    }

    // ------------------------------------------------------------ fan
    class FanPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // 16, not 20: the word, its percentage, the 420 slider and a guard
          // chip all fit the one sheet height
          '.pn{gap:16px}',
          '.rd{text-align:center}',
          '.pct{font-size:16px;color:rgba(235,235,245,0.62);margin-top:6px;min-height:20px;font-variant-numeric:tabular-nums}',
          '.vs{height:420px}',
          '.wrap{position:relative}',
          '.names{position:absolute;left:calc(100% + 16px);top:0;bottom:0;width:max-content;pointer-events:none}',
          '.names span{position:absolute;left:0;transform:translateY(50%);font-size:15px;',
          '  color:rgba(235,235,245,0.5);white-space:nowrap;transition:color .15s}',
          '.names span.cur{color:#fff;font-weight:600}',
          '.guard{display:flex;align-items:center;gap:10px;height:40px;padding:0 5px 0 14px;',
          '  border-radius:20px;background:rgba(255,179,64,0.16);color:#FFB340;font-size:15px;font-weight:600}',
          '.guard button{height:30px;padding:0 13px;border:0;border-radius:15px;font:inherit;font-size:13px;',
          '  font-weight:600;color:#fff;background:rgba(255,255,255,0.16);cursor:pointer}',
          '@media (max-width:600px){.names{left:calc(100% + 12px)}.names span{font-size:14px}.vs{height:340px}}'
        ].join('');
      }
      hkWidthKind() { return 'fan'; }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var n = fanSteps(s);
        if (!this._built || this._n !== n) {
          this._built = true;
          this._n = n;
          this._root.innerHTML = '<div class="pn"><div class="rd"><div class="big"></div><div class="pct"></div></div>' +
            '<div class="wrap"></div><div class="gslot"></div></div>';
          this._big = this._root.querySelector('.big');
          this._pct = this._root.querySelector('.pct');
          var send = throttle(function (v) {
            if (v <= 0) self._svc('fan', 'turn_off');
            else self._svc('fan', 'set_percentage', { percentage: Math.round(v * 100) });
          }, 400);
          var steps = n <= 10 ? n : 0;
          this._slider = this._vslider({
            label: 'Speed', steps: steps,
            glyph: glyph(this._src.icon || 'hk:fan', 32),
            onInput: function (v) { self._big.textContent = fanLabel(v * 100, n, v > 0); self._pct.textContent = self._pctText(v * 100, v > 0); },
            onChange: function (v) { self._big.textContent = fanLabel(v * 100, n, v > 0); self._pct.textContent = self._pctText(v * 100, v > 0); send(v); }
          });
          var wrap = this._root.querySelector('.wrap');
          wrap.appendChild(this._slider.el);
          if (SPEED_NAMES[n]) {
            var names = document.createElement('div');
            names.className = 'names';
            names.innerHTML = SPEED_NAMES[n].map(function (nm, i) {
              // each speed's name at the middle of its band
              return '<span data-i="' + (i + 1) + '" style="bottom:' + ((i + 0.5) / n * 100) + '%">' + nm + '</span>';
            }).join('');
            wrap.appendChild(names);
            this._names = names;
          }
          this._gslot = this._root.querySelector('.gslot');
          if (!this._tickT) this._tickT = setInterval(function () { self._paintGuard(); }, 30000);
        }
        var on = s.state === 'on', na = this._na(s);
        var pct = on ? (num(at(s, 'percentage')) || 0) : 0;
        if (!this._slider.dragging()) {
          this._slider.set(pct / 100);
          this._big.textContent = na ? 'Unavailable' : fanLabel(pct, n, on);
          this._pct.textContent = na ? '' : this._pctText(pct, on);
        }
        if (this._names) {
          var ci = on ? clamp(Math.round(pct / (100 / n)), 1, n) : 0;
          this._names.querySelectorAll('span').forEach(function (sp) {
            sp.classList.toggle('cur', Number(sp.getAttribute('data-i')) === ci);
          });
        }
        this._paintGuard();
      }
      // the speed as a number under its name ("Medium" / "50%"); a fan with
      // no named steps already reads as a percentage, so it says nothing more
      _pctText(pct, on) {
        if (!on || !pct) return '';
        return SPEED_NAMES[this._n] ? Math.round(pct) + '%' : '';
      }
      _sigOf() {
        var h = this._hass, id = this._id;
        if (!h || !id) return null;
        var a = h.states[id], g = h.states[fanGuard(id)];
        return (a ? a.last_updated : 'x') + '|' + (g ? g.last_updated : 'x');
      }
      _paintGuard() {
        var h = this._hass, slot = this._gslot, self = this;
        if (!h || !slot) return;
        var g = h.states[fanGuard(this._id)];
        if (!g || g.state !== 'active') { slot.innerHTML = ''; return; }
        var fin = at(g, 'finishes_at') ? Date.parse(at(g, 'finishes_at')) : NaN;
        var mins = isFinite(fin) ? Math.max(1, Math.ceil((fin - Date.now()) / 60000)) : null;
        slot.innerHTML = '<div class="guard"><span>Automations paused' + (mins ? ' · ' + mins + ' min' : '') +
                         '</span><button>Cancel</button></div>';
        slot.querySelector('button').addEventListener('click', function () {
          self._call('timer', 'cancel', { entity_id: fanGuard(self._id) });
        });
      }
    }

    // ------------------------------------------------------------ cover
    var ICON_PATH = {
      up: 'M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z',
      down: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
      stop: 'M8 8h8v8H8z'
    };
    function svgIcon(path, size) {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + path + '"/></svg>';
    }
    class CoverPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // THE SHADE ITSELF: the track is the fabric (slats from the top),
          // the fill is the window it uncovers, the handle is the shade's edge.
          '.vs.shade{background:repeating-linear-gradient(180deg,#e7e1d4 0,#e7e1d4 22px,#cfc6b3 22px,#cfc6b3 24px)}',
          '.vs.shade .fill{background:linear-gradient(180deg,#7f9fc6,#56779f)}',
          '.vs.shade .fill::before{content:"";position:absolute;left:50%;top:-3px;width:52px;height:6px;',
          '  margin-left:-26px;border-radius:3px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.4)}',
          '.vs.shade .gl{display:none}',
          '.vs.shade{height:400px}',
          '.btns{display:flex;gap:12px;justify-content:center}',
          '.btns .btn{width:76px;padding:0}',
          '.btns.wide{align-self:stretch}',
          '.btns.wide .btn{flex:1;width:auto;gap:6px}',
          '.state{width:220px;height:220px;border-radius:110px;display:flex;align-items:center;',
          '  justify-content:center;background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.85)}',
          '.state.open{background:rgba(86,189,228,0.22);color:#56bde4}',
          '@media (max-width:600px){.state{width:180px;height:180px;border-radius:90px}.vs.shade{height:330px}',
          '  .btns .btn{width:68px}}'
        ].join('');
      }
      hkWidthKind(h, s) { return ((num(at(s, 'supported_features')) || 0) & 4) ? 'cover' : 'cover_buttons'; }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var f = num(at(s, 'supported_features')) || 0;
        var hasPos = !!(f & 4);
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><div class="big"></div><div class="ctl"></div><div class="btns"></div></div>';
          this._big = this._root.querySelector('.big');
          var ctl = this._root.querySelector('.ctl');
          if (hasPos) {
            var send = throttle(function (v) {
              self._svc('cover', 'set_cover_position', { position: Math.round(v * 100) });
            }, 500);
            this._slider = this._vslider({
              label: 'Position',
              onInput: function (v) { self._big.textContent = self._posText(Math.round(v * 100)); },
              onChange: function (v) { self._big.textContent = self._posText(Math.round(v * 100)); send(v); }
            });
            this._slider.el.classList.add('shade');
            ctl.appendChild(this._slider.el);
          } else {
            ctl.innerHTML = '<div class="state">' + glyph(this._src.icon || 'hk:blinds-horizontal', 88) + '</div>';
            this._stateEl = ctl.firstChild;
          }
          var btns = this._root.querySelector('.btns');
          if (!hasPos) btns.classList.add('wide');
          var defs = [];
          if (f & 1) defs.push(['open_cover', 'Open', ICON_PATH.up]);
          if (f & 8) defs.push(['stop_cover', 'Stop', ICON_PATH.stop]);
          if (f & 2) defs.push(['close_cover', 'Close', ICON_PATH.down]);
          btns.innerHTML = defs.map(function (d) {
            return '<button class="btn" data-s="' + d[0] + '" aria-label="' + d[1] + '">' + svgIcon(d[2], 24) +
                   (hasPos ? '' : '<span>' + d[1] + '</span>') + '</button>';
          }).join('');
          btns.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () { self._svc('cover', b.getAttribute('data-s')); });
          });
        }
        var na = this._na(s), pos = num(at(s, 'current_position'));
        if (hasPos) {
          if (!this._slider.dragging()) {
            // no position reported: the end its state names, else nothing to
            // claim -- an unavailable shade must not read "Open" at 100 %
            var p = pos != null ? pos : s.state === 'closed' ? 0 : s.state === 'open' ? 100 : null;
            this._slider.set((p || 0) / 100);
            this._big.textContent = na ? 'Unavailable' : p == null ? '—' : this._posText(p);
          }
        } else {
          var st = s.state;
          this._big.textContent = na ? 'Unavailable' : st === 'unknown' ? '—' :
            ({ open: 'Open', closed: 'Closed', opening: 'Opening…', closing: 'Closing…' })[st] || st;
          if (this._stateEl) this._stateEl.classList.toggle('open', st === 'open' || st === 'opening');
        }
      }
      _posText(p) { return p <= 0 ? 'Closed' : p >= 100 ? 'Open' : p + '% open'; }
    }

    // ------------------------------------------------------------ lock + garage
    // THE HOLD RING. A door that lets someone in is opened by a hold: the ring
    // fills over a second, let go early and nothing happens, so a mis-tap on a
    // wall tablet never opens a door. Securing it again is a tap. The lock and
    // the garage are two specs on one panel so they look and behave the same.
    var HOLD_MS = 1000;
    class RingPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // 264: a little over 236 (360 is far too big)
          '.lk{position:relative;width:264px;height:264px;border-radius:132px;border:0;padding:0;',
          '  cursor:pointer;background:rgba(48,209,88,0.16);display:flex;align-items:center;',
          '  justify-content:center;-webkit-tap-highlight-color:transparent;touch-action:none;',
          '  -webkit-user-select:none;user-select:none}',
          '.lk svg.ring{position:absolute;inset:0;pointer-events:none}',
          '.lk .trk{fill:none;stroke:rgba(255,255,255,0.12);stroke-width:8}',
          '.lk .prg{fill:none;stroke:#30d158;stroke-width:8;stroke-linecap:round;',
          '  stroke-dasharray:703.7;stroke-dashoffset:703.7;transition:stroke-dashoffset .25s ease}',
          '.lk.holding .prg{stroke-dashoffset:0;transition:stroke-dashoffset ' + HOLD_MS + 'ms linear}',
          '.lk .core{width:192px;height:192px;border-radius:96px;background:#30d158;display:flex;',
          '  align-items:center;justify-content:center;color:#fff;transition:background .25s,transform .15s}',
          '.lk:active .core{transform:scale(.97)}',
          '.lk.open{background:rgba(255,159,10,0.16)}',
          '.lk.open .core{background:#ff9f0a}',
          '.lk.open .prg{stroke:#ff9f0a}',
          '.lk.busy .core{animation:hkd-pulse 1.1s ease-in-out infinite}',
          '.lk.bad{background:rgba(255,69,58,0.16)}.lk.bad .core{background:#ff453a}',
          // tone "water": blue when it runs, grey when it is shut (the Home app's valve)
          // the palette's blue (the header well's), not iOS system blue
          '.lk.water{background:rgba(86,189,228,0.16)}.lk.water .core{background:#56bde4}.lk.water .prg{stroke:#56bde4}',
          '.lk.water.shut{background:rgba(255,255,255,0.08)}.lk.water.shut .core{background:rgba(255,255,255,0.22)}',
          '@keyframes hkd-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
          '.big.lkt{font-size:38px}',
          '.hint{font-size:16px}',
          '@media (max-width:600px){.lk{width:228px;height:228px;border-radius:114px}',
          '  .lk .core{width:166px;height:166px;border-radius:83px}.big.lkt{font-size:32px}}',
          '@media (prefers-reduced-motion:reduce){.lk.busy .core{animation:none}}'
        ].join('');
      }
      // spec(st) -> { word, glyph, hint, label, open, busy, bad,
      //               hold: [domain, service] | null, tap: [domain, service] | null, ask }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><button class="lk">' +
            '<svg class="ring" viewBox="0 0 236 236" aria-hidden="true"><circle class="trk" cx="118" cy="118" r="112"/>' +
            '<circle class="prg" cx="118" cy="118" r="112" transform="rotate(-90 118 118)"/></svg>' +
            '<div class="core"></div></button><div class="big lkt"></div><div class="muted hint"></div></div>';
          var b = this._lk = this._root.querySelector('.lk');
          this._core = this._root.querySelector('.core');
          this._big = this._root.querySelector('.big');
          this._hint = this._root.querySelector('.hint');
          // ONE PRESS, ONE ACTION, DECIDED WHEN THE FINGER LANDS.
          // Reading the spec again on release means a hold that outlasts the
          // device's answer does the OPPOSITE on the way up: the lock reports
          // unlocked under the finger and letting go locks it again; the
          // garage reads open and letting go sends close_cover -- a relay
          // pulse, which stops a moving door. So a press keeps the spec it
          // landed on. A hold spec never taps: let go early and nothing
          // happens, and once the hold has fired the release does nothing.
          var press = null;
          var call = function (a) { if (a) self._svc(a[0], a[1]); };
          // the device is still where the press found it (nobody else moved
          // it meanwhile): the same hold is still the one on offer
          var still = function (a) {
            var now = self._stateObj, sp = now && self.spec(now);
            return !!(sp && sp.hold && sp.hold[1] === a[1]);
          };
          var cancel = function () {
            if (press) clearTimeout(press.timer);
            press = null;
            b.classList.remove('holding');
          };
          b.addEventListener('pointerdown', function (e) {
            var st = self._stateObj, sp = st && self.spec(st);
            if (!sp || (!sp.hold && !sp.tap)) return;
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            cancel();
            var p = press = { sp: sp, timer: null, fired: false };
            if (!sp.hold) return;
            b.classList.add('holding');
            p.timer = setTimeout(function () {
              p.timer = null;
              p.fired = true;
              b.classList.remove('holding');
              if (still(p.sp.hold)) call(p.sp.hold);
            }, HOLD_MS);
          });
          b.addEventListener('pointerup', function () {
            var p = press;
            cancel();
            if (!p || p.fired || p.sp.hold) return;
            call(p.sp.tap);
          });
          b.addEventListener('pointercancel', cancel);
          b.addEventListener('pointerleave', function () { if (press && press.timer) cancel(); });
          b.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            var st = self._stateObj, sp = st && self.spec(st);
            if (!sp) return;
            // the keyboard cannot hold, so it asks -- and sends only if the
            // device is still where the question found it
            if (sp.hold) C.confirmSheet(sp.ask, function () { if (still(sp.hold)) call(sp.hold); });
            else call(sp.tap);
          });
        }
        var sp = this.spec(s);
        this._lk.classList.toggle('open', !!sp.open);
        this._lk.classList.toggle('busy', !!sp.busy);
        this._lk.classList.toggle('bad', !!sp.bad);
        this._lk.classList.toggle('water', sp.tone === 'water');
        this._lk.classList.toggle('shut', !!sp.shut);
        if (this._glyph !== sp.glyph) { this._glyph = sp.glyph; this._core.innerHTML = glyph(sp.glyph, 80); }
        this._big.textContent = sp.word;
        this._hint.textContent = sp.hint || '';
        this._lk.setAttribute('aria-label', sp.label || sp.word);
      }
      _who(st, fallback) { return (this._src && this._src.name) || at(st, 'friendly_name') || fallback; }
    }

    class LockPanel extends RingPanel {
      hkWidthKind() { return 'lock'; }
      spec(s) {
        var st = s.state;
        var locked = st === 'locked', open = st === 'unlocked' || st === 'open';
        var jammed = st === 'jammed', bad = jammed || unavailable(s);
        return {
          word: bad ? (jammed ? 'Jammed' : 'Unavailable') :
            ({ locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking…', unlocking: 'Unlocking…', open: 'Open', opening: 'Opening…' })[st] || st,
          glyph: open || st === 'unlocking' ? 'hk:lock-open-variant' : 'hk:lock',
          open: open || st === 'unlocking', busy: st === 'locking' || st === 'unlocking' || st === 'opening', bad: bad,
          hold: locked ? ['lock', 'unlock'] : null,
          // JAMMED: try locking again, the safe direction -- HA's dialog is
          // not reachable from here, so this is the only retry there is
          tap: open || jammed ? ['lock', 'lock'] : null,
          hint: locked ? 'Hold to unlock' : open || jammed ? 'Tap to lock' : '',
          label: locked ? 'Hold to unlock' : 'Lock',
          ask: 'Unlock ' + this._who(s, 'the door') + '?'
        };
      }
    }

    // A DOOR COVER -- a garage, a gate, a car's frunk or charge port -- is a
    // door too: hold to open, tap to close, and while it moves a tap stops it
    // (when the opener can stop).
    class GaragePanel extends RingPanel {
      hkWidthKind() { return 'lock'; }
      spec(s) {
        var st = s.state, f = num(at(s, 'supported_features')) || 0;
        var moving = st === 'opening' || st === 'closing';
        var stop = moving && (f & 8) ? ['cover', 'stop_cover'] : null;
        var bad = unavailable(s), door = at(s, 'device_class') === 'door';
        var shut = st === 'closed' || st === 'closing';
        return {
          word: bad ? 'Unavailable' : ({ open: 'Open', closed: 'Closed', opening: 'Opening…', closing: 'Closing…' })[st] || st,
          glyph: door ? (shut ? 'hk:door-closed' : 'hk:door-open') : shut ? 'hk:garage-variant' : 'hk:garage-open-variant',
          open: st === 'open' || st === 'opening', busy: moving, bad: bad,
          hold: st === 'closed' && (f & 1) ? ['cover', 'open_cover'] : null,
          tap: st === 'open' && (f & 2) ? ['cover', 'close_cover'] : stop,
          hint: st === 'closed' ? 'Hold to open' : st === 'open' ? 'Tap to close' : stop ? 'Tap to stop' : '',
          label: st === 'closed' ? 'Hold to open' : st === 'open' ? 'Close' : stop ? 'Stop' : '',
          ask: 'Open ' + this._who(s, door ? 'the door' : 'the garage') + '?'
        };
      }
    }

    // ------------------------------------------------------------ climate
    // The home's own thermostat card (hk-thermostat-card) in `bare` mode --
    // the dial, modes and fan exactly as on the Climate page -- plus the
    // reading around it and the day's trend.
    var RUNNING = { heating: 1, cooling: 1 };
    // rows: HA's compressed history ({s, a, lu}); live: the current state,
    // which covers the time since the last recorded row -- from its own
    // last_updated when that is newer, so a start or stop after the fetch
    // counts from when it happened, not from the next fetch.
    function runTimes(rows, now, live) {
      var mid = new Date(now); mid.setHours(0, 0, 0, 0);
      var tMid = +mid;
      var yd = new Date(tMid); yd.setDate(yd.getDate() - 1);
      var yMid = +yd;   // setDate, not minus 24 h: a DST day is 23 or 25 hours
      var pts = rows.map(function (r) {
        return { t: (r.lu || r.lc || 0) * 1000, on: !!(r.a && RUNNING[r.a.hvac_action]) };
      }).filter(function (p) { return p.t; });
      if (live) {
        var lt = Date.parse(live.last_updated), last = pts.length ? pts[pts.length - 1].t : 0;
        pts.push({ t: isFinite(lt) && lt > last && lt < now ? lt : now, on: !!RUNNING[at(live, 'hvac_action')] });
      }
      var today = 0, yesterday = 0;
      for (var i = 0; i < pts.length; i++) {
        if (!pts[i].on) continue;
        var a = pts[i].t, b = i + 1 < pts.length ? pts[i + 1].t : now;
        today += Math.max(0, Math.min(b, now) - Math.max(a, tMid));
        yesterday += Math.max(0, Math.min(b, tMid) - Math.max(a, yMid));
      }
      return { today: today / 1000, yesterday: yesterday / 1000 };
    }
    // Does this thermostat say what it is doing at all? A water heater or a
    // car's climate entity never reports hvac_action, and its run time would
    // read "0 min" every day.
    function reportsAction(rows, live) {
      return at(live, 'hvac_action') != null ||
        !!(rows && rows.some(function (r) { return r.a && r.a.hvac_action != null; }));
    }
    // THE TREND IS THE THERMOSTAT'S OWN READING: current_temperature in the
    // rows the run time already fetched -- no second request, and not the
    // home's temperature sensor (features.temperature, which may be a mean
    // of several thermostats and says nothing about a water heater or a car).
    // the wide sheet's dial column, shared by the thermostat and the water heater:
    // the ring as wide as its buttons, bigger digits and rows
    var TSTAT_WIDE = 'width:400px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center;' +
      '--hk-tstat-ring:100%;--hk-tstat-val:58px;--hk-tstat-gap:22px;--hk-tstat-seg:44px;--hk-tstat-seg-font:14px;' +
      '--hk-tstat-fan-gap:10px;--hk-tstat-fan:38px;--hk-tstat-fan-font:13px';
    function trendOf(rows, now, live) {
      var pts = rows.map(function (r) {
        return { t: (r.lu || r.lc || 0) * 1000, v: num(r.a && r.a.current_temperature) };
      });
      return spanTo(pts, now - 24 * 3600000, now, num(at(live, 'current_temperature')));
    }
    function dur(sec) {
      var m = Math.round(sec / 60);
      if (m < 60) return m + ' min';
      var hh = Math.floor(m / 60), mm = m % 60;
      return hh + ' hr' + (mm ? ' ' + mm + ' min' : '');
    }
    class ClimatePanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // 14 not 18: the run-time row had to fit an 800 px tablet with margin
          '.pn{gap:14px}',
          // narrow (a phone): one column -- .side dissolves into it
          '.side{display:contents}',
          '.dial{align-self:stretch;display:flex;justify-content:center}',
          // full width, so the mode and fan rows share their edges with the
          // reading card below (the ring itself stays 300 px, centred)
          '.dial > *{width:100%}',
          // each reading centred in its third
          '.now{align-self:stretch;display:flex;flex-direction:column;gap:12px;',
          '  padding:12px 18px;border-radius:20px;background:rgba(255,255,255,0.08);text-align:center}',
          '.now .rd{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
          '.now .k{font-size:13px;color:rgba(235,235,245,0.6)}',
          '.now .v{font-size:19px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}',
          // RUN TIME, today and yesterday: the second row of the same card,
          // two halves under a hairline
          '.now .run{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;',
          '  padding-top:12px;border-top:1px solid rgba(255,255,255,0.10)}',
          '.trend{align-self:stretch;padding:12px 16px 8px;border-radius:20px;background:rgba(255,255,255,0.08)}',
          '.trend .t{font-size:13px;font-weight:600;letter-spacing:.2px;color:rgba(235,235,245,0.55);',
          '  text-transform:uppercase;margin-bottom:6px}',
          '@media (max-width:600px){.now{padding:12px 14px;gap:10px}.now .rd,.now .run{gap:8px}',
          '  .now .run{padding-top:10px}.now .v{font-size:17px}}',
          // WIDE: the dial, modes and fan on the left; the readings,
          // run time and trend on the right, as tall as the left -- the right
          // column stretches and its trend card takes the difference, so the
          // tops line up and so do the bottoms. :host([wide]) -- see _wideAt.
          ':host([wide]) .pn{flex-direction:row;align-items:stretch;gap:28px}',
          // THE DIAL AS WIDE AS ITS BUTTONS (not 102 px empty above and
          // below): a 400 px column, the ring filling it, bigger digits and
          // rows, more air between them -- the card's --hk-tstat-* sizes
          ':host([wide]) .dial{' + TSTAT_WIDE + '}',
          ':host([wide]) .side{display:flex;flex-direction:column;gap:14px;flex:1;min-width:0}',
          ':host([wide]) .now{background:none;padding:0;gap:14px}',
          ':host([wide]) .now .rd,:host([wide]) .now .run{padding:14px 18px;border-radius:20px;background:rgba(255,255,255,0.08)}',
          ':host([wide]) .now .run{border-top:0}',
          ':host([wide]) .trend{flex:1;display:flex;flex-direction:column;padding:16px 18px 14px;min-height:0}',
          // the chart takes whatever height is left, so the right column is
          // exactly as tall as the dial column: tops AND bottoms line up
          ':host([wide]) .trend .axc{flex:1;min-height:72px;margin-top:8px}',
          ':host([wide]) .trend .t{margin-bottom:0}'
        ].join('');
      }
      hkWidthKind() { return 'climate'; }
      _wideAt() { return 700; }
      // the trend is drawn for one width (fluid and five times, or fixed and
      // three): redraw it for the other, and realign the columns
      _onWide() { this._trendKey = null; this._paintRuns(); this._alignTop(); }
      // RUN TIME: seconds heating or cooling since midnight, and all of
      // yesterday, from the thermostat's own hvac_action history (any home,
      // no helper sensors). Fetched every 5 minutes; "today" is re-added up
      // to now every minute, so a running system counts up. The same rows
      // carry current_temperature, which is the trend.
      _runs() {
        var self = this, h = this._hass, id = this._id, now = Date.now();
        if (h && h.callWS && (!this._runAt || now - this._runAt > 300000)) {
          this._runAt = now;
          var y = new Date(); y.setHours(0, 0, 0, 0); y.setDate(y.getDate() - 1);
          h.callWS({ type: 'history/history_during_period', start_time: y.toISOString(), entity_ids: [id],
                     minimal_response: false, no_attributes: false, significant_changes_only: false })
            .then(function (r) { self._runRows = (r && r[id]) || []; self._paintRuns(); },
                  function () { self._runAt = 0; });
        }
        this._paintRuns();
      }
      _paintRuns() {
        var rt = this._root.querySelector('.rt'), ry = this._root.querySelector('.ry');
        var run = this._root.querySelector('.run');
        if (!rt) return;
        var rows = this._runRows, live = this._stateObj, now = Date.now();
        var reports = reportsAction(rows, live);
        run.hidden = !reports;
        if (!rows) return;
        if (reports) {
          var t = runTimes(rows, now, live);
          rt.textContent = dur(t.today);
          ry.textContent = dur(t.yesterday);
        }
        // redrawn when the rows or the reading move, not on every minute's tick
        var key = rows.length + '|' + (rows.length ? rows[rows.length - 1].lu : '') + '|' + at(live, 'current_temperature');
        if (!window.hkChart || key === this._trendKey) return;
        var pts = trendOf(rows, now, live);
        if (pts.length < 2) return;
        this._trendKey = key;
        this._trend.hidden = false;
        // the wide sheet's trend is a real chart with both axes; a phone's is
        // shorter with three times
        var wide = this.hasAttribute('wide');
        this._trend.innerHTML = '<div class="t">Inside, last 24 hours</div>' +
          axesChart({ pts: downsample(pts, 240), H: wide ? 120 : 96, unit: '°', ms: 24 * 3600000, n: wide ? 5 : 3,
                      colour: 'orange', fluid: wide });
        this._alignTop();
      }
      // THE RIGHT COLUMN STARTS WHERE THE DIAL IS SEEN TO START. The dial
      // card's ring has empty space above its track (the track's top is
      // y = 100 - 78 - 11 of a 172-high viewBox: ~16 px on a 300 px ring), so
      // "both columns start at the card's top" still read as the readings
      // sitting higher than the dial. Measured from the ring itself, so it
      // follows the card if its geometry changes; wide layout only.
      _alignTop() {
        var side = this._root.querySelector('.side'), card = this._card;
        if (!side || !side.style) return;
        var ring = card && card.shadowRoot && card.shadowRoot.querySelector('svg.ring');
        if (!this.hasAttribute('wide') || !ring || !ring.getBoundingClientRect) { side.style.marginTop = ''; return; }
        var rr = ring.getBoundingClientRect(), cr = card.getBoundingClientRect();
        if (!rr.height) return;
        var inset = rr.top - cr.top + rr.height * (100 - 78 - 11) / 172;
        side.style.marginTop = Math.max(0, Math.round(inset)) + 'px';
      }
      _sigOf() {
        var h = this._hass, id = this._id;
        if (!h || !id) return null;
        var a = h.states[id], w = h.states[this._wx()];
        return (a ? a.last_updated : 'x') + '|' + (w ? w.last_updated : '');
      }
      _wx() { return (C.setting && C.setting('weather.entity', null)) || ''; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        var h = this._hass;
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><div class="dial"></div><div class="side"><div class="now"><div class="rd"></div>' +
            '<div class="run"><div><div class="k">Ran today</div><div class="v rt">—</div></div>' +
            '<div><div class="k">Yesterday</div><div class="v ry">—</div></div></div></div><div class="trend" hidden></div></div></div>';
          var card = document.createElement('hk-thermostat-card');
          try { card.setConfig({ entity: this._id, bare: true, glass: false }); } catch (e) { /* not ready */ }
          this._card = card;
          this._root.querySelector('.dial').appendChild(card);
          this._now = this._root.querySelector('.now .rd');
          this._trend = this._root.querySelector('.trend');
          // a running system's "today" grows while the sheet is open
          var self = this;
          this._tickT = setInterval(function () { self._runs(); }, 60000);
        }
        if (this._card) this._card.hass = h;
        this._alignTop();
        var a = s.attributes || {};
        var wx = stOf(h, this._wx());
        var out = wx && at(wx, 'temperature') != null ? Math.round(at(wx, 'temperature')) + '°' : '—';
        var cur = a.current_temperature != null ? Math.round(a.current_temperature) + '°' : '—';
        var hum = a.current_humidity != null ? Math.round(a.current_humidity) + '%' : '—';
        this._now.innerHTML = '<div><div class="k">Inside</div><div class="v">' + cur + '</div></div>' +
          '<div><div class="k">Humidity</div><div class="v">' + hum + '</div></div>' +
          '<div><div class="k">Outside</div><div class="v">' + out + '</div></div>';
        this._runs();
      }
    }

    // ------------------------------------------------------------ media
    // THE PLAY MUSIC PAGE'S PLAYER: framed artwork, title, artist and album,
    // the "playing on" line, the progress bar, plain transport icons, and the
    // thin volume slider in the playlist accent. A speaker adds Browse Music;
    // a TV adds an Input list (same pattern as a light's effects) and a power
    // button.
    var ACCENT = '#b25bd9';
    var MF = { PAUSE: 1, VOLUME_SET: 4, PREV: 16, NEXT: 32, VOLUME_STEP: 1024, PLAY: 16384 };
    function isTv(s) {
      var a = s.attributes || {}, oid = String(s.entity_id).split('.')[1] || '';
      if (a.device_class === 'tv') return true;
      if (a.device_class === 'speaker' || a.mass_player_type) return false;
      return /(^|_)(tv|apple_tv|roku|webos)(_|$)/.test(oid) || (Array.isArray(a.source_list) && a.source_list.length > 0 && /tv/.test(oid));
    }
    function clock(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
      return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
    }
    // The view to Browse Music on: the setting, if this dashboard has it.
    function browseView() {
      var v = C.setting ? C.setting('look.browse_view', 'music-browse') : 'music-browse';
      if (!v) return null;
      // cannot tell (null): offer it
      return hasView(v) === false ? null : v;
    }
    class MediaPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // INSET AND TIGHT: the player's text and controls sit 20 px
          // in from the sheet's padding, 12 apart; the TV's picture comes in
          // with them, the speaker's cover is centred anyway
          '.pl{align-self:stretch;display:flex;flex-direction:column;gap:12px;margin:0 20px}',
          '.art{align-self:center;box-sizing:border-box;border-radius:16px;overflow:hidden;box-shadow:0 10px 26px rgba(0,0,0,.24);',
          '  background:linear-gradient(135deg,#3a3a40,#6e6e76);display:flex;align-items:center;justify-content:center;',
          // 260, not 280: with the title, times and Browse Music the player
          // measures 581 px against the 568 a 680 sheet has
          '  color:rgba(255,255,255,0.7);width:260px;height:260px;flex-shrink:0}',
          // .ab: one box per picture (see _paint), so a stale one's fallback
          // can only ever reach its own box
          '.art .ab{width:100%;height:100%;display:flex;align-items:center;justify-content:center}',
          '.art img{width:100%;height:100%;object-fit:cover;display:block}',
          '.art.tv{width:100%;height:auto;aspect-ratio:16/9}',
          '.ti{font-size:22px;font-weight:700;letter-spacing:-.4px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
          '.ar{font-size:15px;color:rgba(235,235,245,0.62);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
          '.on{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:rgba(235,235,245,0.5)}',
          '.pg{height:4px;border-radius:2px;background:rgba(255,255,255,0.22);overflow:hidden}',
          '.pg i{display:block;height:100%;width:0;background:#fff;border-radius:2px}',
          '.tm{display:flex;justify-content:space-between;font-size:12px;color:rgba(235,235,245,0.5);',
          '  margin-top:6px;font-variant-numeric:tabular-nums}',
          '.tp{display:flex;justify-content:center;align-items:center;gap:44px}',
          '.tp button{width:52px;height:52px;border:0;border-radius:26px;background:transparent;color:#fff;',
          '  display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
          '.tp button:active{background:rgba(255,255,255,0.12)}',
          '.tp button[disabled]{opacity:.3;cursor:default}',
          '.tp .pp{width:60px;height:60px;border-radius:30px}',
          '.vol{position:relative;height:28px;touch-action:none;cursor:pointer;margin:0 2px}',
          '.vol .t{position:absolute;left:0;right:0;top:11px;height:6px;border-radius:3px;background:rgba(255,255,255,0.28)}',
          '.vol .f{position:absolute;left:0;top:11px;height:6px;border-radius:3px;background:' + ACCENT + '}',
          '.vol .k{position:absolute;top:0;width:28px;height:28px;margin-left:-14px;border-radius:14px;background:#fff;',
          '  box-shadow:0 1px 6px rgba(0,0,0,0.3)}',
          // a player that steps its volume but never reports a level (an Apple TV
          // driving the receiver): a slider could only guess, so down and up
          '.vst{display:flex;align-items:center;justify-content:center;gap:28px;height:44px}',
          // THE VOLUME ROW SITS HALFWAY between the transport and the row under
          // it, with equal space above and below. What is seen above it is the
          // pause glyph's ink, which ends 15 px of empty button plus the glyph's
          // own padding above the row's edge, so plain 12 px gaps read as 31
          // above and 12 below. Up 8, 11 more below: 23 and 23, measured, for the
          // slider and the +/- buttons; the play button's hit area still clears
          // it by 4 px, and the tablet speaker sheet (Browse Music) keeps its
          // 566 px body.
          '.vst{margin:-8px 0 11px}',
          '.vol{margin:-8px 2px 11px}',
          '.vst button{width:44px;height:44px;border-radius:22px;border:0;padding:0;display:flex;align-items:center;',
          '  justify-content:center;background:rgba(255,255,255,0.13);color:#fff;cursor:pointer}',
          '.vst button:active{background:rgba(255,255,255,0.24)}',
          '.vst span{font-size:15px;font-weight:600;color:rgba(235,235,245,0.62);min-width:64px;text-align:center}',
          '.acts{display:flex;gap:10px}',
          '.acts .btn{flex:1}',
          '.acts .pw{flex:0 0 52px;padding:0}',
          '.acts .pw.lit{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.85)}',
          '.sub{align-self:stretch;display:flex;flex-direction:column;gap:16px}',
          '.bk{display:flex;align-items:center;gap:10px}',
          '.bk button{width:40px;height:40px;border-radius:20px;border:0;padding:0;display:flex;',
          '  align-items:center;justify-content:center;background:rgba(255,255,255,0.13);color:#fff;cursor:pointer}',
          '.bk .t{font-size:20px;font-weight:700;letter-spacing:-.3px}',
          '.list{border-radius:18px;background:rgba(255,255,255,0.06);max-height:420px;overflow-y:auto;',
          '  overscroll-behavior:contain;scrollbar-width:none}',
          '.list::-webkit-scrollbar{display:none}',
          '.list button{display:flex;align-items:center;justify-content:space-between;width:100%;',
          '  min-height:52px;padding:0 18px;border:0;border-bottom:1px solid rgba(255,255,255,0.07);',
          '  background:transparent;color:#fff;font:inherit;font-size:17px;text-align:left;cursor:pointer}',
          '.list button:last-child{border-bottom:0}',
          '@media (max-width:600px){',
          '  .pl{margin:0 8px}',
          '  .art{width:250px;height:250px}.art.tv{width:100%;height:auto}',
          '  .ti{font-size:20px}.tp{gap:30px}.list{max-height:340px}',
          '}'
        ].join('');
      }
      hkWidthKind(h, s) { return isTv(s) ? 'media_tv' : 'media'; }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        if (!this._built) this._build(s);
        if (this._view === 'inputs') return this._paintInputs(s);
        this._paint(s);
      }
      _build(s) {
        this._built = true;
        this._view = this._view || 'main';
        var self = this;
        this._tv = isTv(s);
        if (this._view === 'inputs') {
          this._root.innerHTML = '<div class="pn"><div class="sub"><div class="bk"><button aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BACK + '"/></svg></button><div class="t">Input</div></div><div class="list"></div></div></div>';
          this._root.querySelector('.bk button').addEventListener('click', function () { self._go('main'); });
          this._list = this._root.querySelector('.list');
          this._inSig = null;
          return;
        }
        this._root.innerHTML = '<div class="pn"><div class="pl">' +
          '<div class="art' + (this._tv ? ' tv' : '') + '"></div>' +
          '<div><div class="ti"></div><div class="ar"></div></div>' +
          '<div class="on"></div>' +
          '<div><div class="pg"><i></i></div><div class="tm"><span class="el"></span><span class="du"></span></div></div>' +
          '<div class="tp"><button class="pv" aria-label="Previous">' + glyph('mdi:skip-previous', 30) + '</button>' +
          '<button class="pp" aria-label="Play or pause"></button>' +
          '<button class="nx" aria-label="Next">' + glyph('mdi:skip-next', 30) + '</button></div>' +
          '<div class="vol" role="slider" aria-label="Volume" tabindex="0"><div class="t"></div><div class="f"></div><div class="k"></div></div>' +
          '<div class="vst" hidden><button class="vd" aria-label="Volume down">' + glyph('mdi:volume-minus', 22) + '</button>' +
          '<span>Volume</span><button class="vu" aria-label="Volume up">' + glyph('mdi:volume-plus', 22) + '</button></div>' +
          '<div class="acts"></div></div></div>';
        var q = function (c) { return self._root.querySelector(c); };
        this._e = { art: q('.art'), ti: q('.ti'), ar: q('.ar'), on: q('.on'), pg: q('.pg i'), el: q('.el'), du: q('.du'),
                    pv: q('.pv'), pp: q('.pp'), nx: q('.nx'), vol: q('.vol'), vst: q('.vst'), acts: q('.acts') };
        q('.vd').addEventListener('click', function () { self._svc('media_player', 'volume_down'); });
        q('.vu').addEventListener('click', function () { self._svc('media_player', 'volume_up'); });
        this._e.pv.addEventListener('click', function () { self._svc('media_player', 'media_previous_track'); });
        this._e.nx.addEventListener('click', function () { self._svc('media_player', 'media_next_track'); });
        this._e.pp.addEventListener('click', function () { self._svc('media_player', 'media_play_pause'); });
        // volume: drag or tap along the track
        var vol = this._e.vol, sendV = throttle(function (v) { self._svc('media_player', 'volume_set', { volume_level: v }); }, 250);
        var pick = function (e) {
          var r = vol.getBoundingClientRect();
          var v = clamp((e.clientX - r.left) / r.width, 0, 1);
          v = Math.round(v * 100) / 100;
          self._showVol(v);
          sendV(v);
        };
        var down = false;
        vol.addEventListener('pointerdown', function (e) { e.preventDefault(); down = true; self._volDrag = true; try { vol.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } pick(e); });
        vol.addEventListener('pointermove', function (e) { if (down) pick(e); });
        var up = function (e) { if (down) { down = false; pick(e); setTimeout(function () { self._volDrag = false; }, 800); } };
        vol.addEventListener('pointerup', up);
        vol.addEventListener('pointercancel', function () { down = false; self._volDrag = false; });
        vol.addEventListener('keydown', function (e) {
          var cur = num(at(self._stateObj, 'volume_level')) || 0, v = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = clamp(cur + 0.05, 0, 1);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = clamp(cur - 0.05, 0, 1);
          if (v == null) return;
          e.preventDefault(); self._showVol(v); sendV(v);
        });
        // actions: Browse Music (a speaker) or Input + power (a TV)
        var acts = this._e.acts;
        if (this._tv) {
          if (Array.isArray(at(s, 'source_list')) && at(s, 'source_list').length) {
            var inp = document.createElement('button');
            inp.className = 'btn menu';
            inp.innerHTML = '<span>Input</span><span class="cur"></span>';
            inp.addEventListener('click', function () { self._go('inputs'); });
            acts.appendChild(inp);
            this._e.inp = inp;
          }
          var pw = document.createElement('button');
          pw.className = 'btn pw';
          pw.setAttribute('aria-label', 'Power');
          pw.innerHTML = glyph('mdi:power', 22);
          pw.addEventListener('click', function () {
            var st = self._stateObj;
            self._svc('media_player', st && st.state !== 'off' && st.state !== 'standby' ? 'turn_off' : 'turn_on');
          });
          acts.appendChild(pw);
          this._e.pw = pw;
        } else {
          // BROWSE ONLY FOR A SPEAKER THE MUSIC FEATURE PLAYS TO. Browse plays to
          // the focused speaker, and focus refuses one it does not know (a speaker
          // outside Music Assistant): the button would then browse for another room.
          var bv = browseView(), M2 = window.hkMusic;
          if (bv && M2 && M2.known && M2.known(this._id)) {
            var br = document.createElement('button');
            br.className = 'btn';
            br.textContent = 'Browse Music';
            br.addEventListener('click', function () {
              // Browse plays to the focused speaker: make it this one first.
              if (window.hkMusic && window.hkMusic.setFocus) window.hkMusic.setFocus(self._id);
              var seg = String(location.pathname).split('/')[1];
              navigateFrom('/' + seg + '/' + bv);
            });
            acts.appendChild(br);
          }
        }
        if (!acts.children.length) acts.hidden = true;
      }
      _go(view) { this._view = view; this._built = false; this._render(); }
      _showVol(v) {
        this._e.vol.querySelector('.f').style.width = (v * 100) + '%';
        this._e.vol.querySelector('.k').style.left = 'calc(14px + ' + (v * 100) + '% - ' + (v * 28) + 'px)';
        this._e.vol.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      }
      _paint(s) {
        var a = s.attributes || {}, e = this._e, self = this;
        var f = num(a.supported_features) || 0;
        var na = this._na(s);
        var off = s.state === 'off' || s.state === 'standby' || unavailable(s);
        var title = na ? 'Unavailable' :
          a.media_title || (off ? 'Off' : s.state === 'idle' ? 'Not playing' : (a.app_name || a.source || ''));
        var line = [a.media_artist || a.media_series_title, a.media_album_name].filter(Boolean).join(' · ') ||
                   (this._tv ? (a.app_name || a.source || '') : '');
        e.ti.textContent = title;
        e.ar.textContent = line;
        // WHERE it plays: the speaker's room (the pill's own name can be a
        // shortcut like "Apple Music"), else its own name.
        var where = roomOf(this._hass, this._id) || a.friendly_name || '';
        e.on.textContent = (s.state === 'playing' ? 'Playing on · ' : s.state === 'paused' ? 'Paused on · ' : off ? '' : 'Ready on · ') + (off ? '' : where);
        // artwork: entity_picture_local FIRST, as the now-playing bar and Play
        // Music do (hk-media). Music Assistant's entity_picture is
        // http://<music-assistant-host>:8095/imageproxy/..., which an https page
        // must not load and which reaches the art proxy only for an https reverse
        // proxy to refuse (no cover in Safari, or on a tablet over https, while
        // Chrome over http is fine). _local is HA's own media_player_proxy on
        // this origin. Any other host still goes through the art proxy.
        // '' not undefined: an idle speaker has no picture on the FIRST paint too
        var pic = a.entity_picture_local || a.entity_picture || '';
        // A NEW BOX PER PICTURE, swapped in. _artImage appends to the box it
        // is handed and its placeholder fallback rewrites that whole box, so
        // one shared box would stack a second cover beside the first on a track
        // change -- and the old cover's 6 s timeout, firing later, would wipe
        // the new one. The old image's request is stopped as it goes.
        if (pic !== this._pic) {
          this._pic = pic;
          var icon = glyph(this._tv ? 'hk:television' : 'hk:homepod', this._tv ? 56 : 72);
          var box = document.createElement('div');
          box.className = 'ab';
          if (this._artImg) { try { this._artImg.src = ''; } catch (x) { /* going anyway */ } }
          this._artImg = pic && this._artImage ? this._artImage(pic, box, icon, 600) : null;
          if (!this._artImg) box.innerHTML = icon;
          e.art.innerHTML = '';
          e.art.appendChild(box);
        }
        e.pp.innerHTML = glyph(s.state === 'playing' ? 'mdi:pause' : 'mdi:play', 38);
        e.pp.disabled = off || !(f & (MF.PAUSE | MF.PLAY));
        e.pv.disabled = off || !(f & MF.PREV);
        e.nx.disabled = off || !(f & MF.NEXT);
        var level = a.volume_level != null, step = !level && !!(f & MF.VOLUME_STEP);
        // OFF: no volume row at all. Hidden (visibility) it would keep its 28-44
        // px, and Prev / Play / Next would sit 27 px under the progress bar but
        // 83 over Input. Removed, the transport is centred.
        e.vol.hidden = step || off;
        e.vst.hidden = !step || off;
        e.vst.style.visibility = '';
        e.vol.style.visibility = (f & MF.VOLUME_SET) && level ? '' : 'hidden';
        if (!this._volDrag) this._showVol(num(a.volume_level) || 0);
        // an Apple TV's "input" is the app it is in
        if (e.inp) e.inp.querySelector('.cur').innerHTML = esc(a.source || a.app_name || '') + CHEV;
        if (e.pw) e.pw.classList.toggle('lit', !off);
        this._tick();
        clearInterval(this._tickT);
        this._tickT = s.state === 'playing' ? setInterval(function () { self._tick(); }, 1000) : null;
      }
      _tick() {
        var s = this._stateObj, e = this._e;
        if (!s || !e) return;
        var a = s.attributes || {};
        var dur = num(a.media_duration), pos = num(a.media_position);
        if (!dur || pos == null) { e.pg.style.width = '0'; e.el.textContent = ''; e.du.textContent = ''; return; }
        if (s.state === 'playing' && a.media_position_updated_at) pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
        pos = clamp(pos, 0, dur);
        e.pg.style.width = (pos / dur * 100) + '%';
        e.el.textContent = clock(pos);
        e.du.textContent = clock(dur);
      }
      _paintInputs(s) {
        var self = this, cur = at(s, 'source'), list = at(s, 'source_list') || [];
        cur = cur || at(s, 'app_name');
        var sig = cur + '|' + list.length;
        if (sig === this._inSig) return;
        this._inSig = sig;
        var tick = TICK;
        this._list.innerHTML = list.map(function (x) {
          return '<button data-s="' + esc(x) + '"><span>' + esc(x) + '</span>' + (x === cur ? tick : '') + '</button>';
        }).join('');
        this._list.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () {
            self._svc('media_player', 'select_source', { source: b.getAttribute('data-s') });
            self._go('main');
          });
        });
      }
    }

    // ------------------------------------------------------------ sensor
    // The one sheet (with the thermostat) that carries information: the
    // reading, Hour / Day / Week / Month, the graph and its low / average /
    // high. An energy meter draws its use as bars (per hour, per day) with a
    // total instead.
    var RANGES = [['hour', 'Hour'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
    var RANGE_H = { hour: 1, day: 24, week: 168, month: 720 };
    function isEnergy(s) {
      var a = s.attributes || {};
      return a.state_class === 'total_increasing' || a.state_class === 'total' || a.device_class === 'energy';
    }
    function fmtNum(v, s) {
      var a = s.attributes || {};
      var unit = a.unit_of_measurement || '';
      var d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
      if (/°|%/.test(unit)) d = Math.abs(v) >= 100 ? 0 : 1;
      return Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
    }
    class SensorPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // WIDE on a tablet: the value left, the ranges right, a tall chart
          // with both axes. By the sheet's own width (:host([wide]), see
          // _wideAt), so a narrow sheet (a phone, a small window) stacks them
          // whatever the screen is.
          '.pn{align-items:stretch;gap:18px}',
          '.top{display:flex;flex-direction:column;gap:18px}',
          ':host([wide]) .top{flex-direction:row;justify-content:space-between;align-items:flex-end}',
          ':host([wide]) .top .seg{width:380px;flex-shrink:0}',
          '.rd{align-self:stretch}',
          '.val{display:flex;align-items:baseline;gap:8px}',
          '.upd{margin-top:6px;font-size:14px;line-height:18px;min-height:18px;color:rgba(235,235,245,0.55)}',
          '.val .n{font-size:72px;font-weight:600;letter-spacing:-2.5px;line-height:1;font-variant-numeric:tabular-nums}',
          '.val .u{font-size:26px;font-weight:600;color:rgba(235,235,245,0.62)}',
          '.seg{display:flex;gap:4px;padding:4px;border-radius:16px;background:rgba(255,255,255,0.09)}',
          '.seg button{flex:1;height:40px;border:0;border-radius:12px;background:transparent;',
          '  color:rgba(255,255,255,0.86);font:inherit;font-size:15px;font-weight:600;cursor:pointer}',
          '.seg button.sel{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.88)}',
          '.chart{padding:18px 18px 14px;border-radius:20px;background:rgba(255,255,255,0.08);',
          '  box-sizing:border-box;position:relative}',
          // the placeholder is the chart's own height (plot + time row), so
          // the sheet does not jump when the data lands
          '.chart .ph{display:flex;align-items:center;justify-content:center;',
          '  color:rgba(235,235,245,0.45);font-size:15px}',
          '.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px 18px;',
          '  border-radius:20px;background:rgba(255,255,255,0.08);text-align:center}',
          '.stats .k{font-size:13px;color:rgba(235,235,245,0.6)}',
          // the last range's chart and figures, dimmed while the next one loads
          '.chart .axc,.stats{transition:opacity .2s ease}',
          '.chart.stale .axc,.stats.stale{opacity:.35}',
          '.stats .v{font-size:19px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}',
          '@media (max-width:600px){.val .n{font-size:60px}.val .u{font-size:22px}',
          '  .chart{padding:14px 14px 12px}.stats{padding:12px 14px;gap:8px}.stats .v{font-size:17px}}'
        ].join('');
      }
      hkWidthKind() { return 'sensor'; }
      _wideAt() { return 700; }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var energy = isEnergy(s);
        if (!this._built) {
          this._built = true;
          this._range = this._range || 'day';
          this._asked = {};
          var ranges = energy ? RANGES.slice(1) : RANGES;
          this._root.innerHTML = '<div class="pn"><div class="top"><div class="rd"><div class="val"><span class="n"></span><span class="u"></span></div>' +
            '<div class="upd"></div></div>' +
            '<div class="seg">' + ranges.map(function (r) { return '<button data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div></div>' +
            '<div class="chart"></div><div class="stats"></div></div>';
          this._root.querySelectorAll('.seg button').forEach(function (b) {
            b.addEventListener('click', function () { self._range = b.getAttribute('data-r'); self._paintSeg(); self.redraw(); });
          });
          this._n = this._root.querySelector('.n');
          this._u = this._root.querySelector('.u');
          this._chart = this._root.querySelector('.chart');
          this._stats = this._root.querySelector('.stats');
          this._paintSeg();
          this._upd = this._root.querySelector('.upd');
          if (!this._tickT) this._tickT = setInterval(function () { self._paintUpd(self._stateObj); }, 30000);
        }
        var v = num(s.state);
        this._n.textContent = v == null ? (unavailable(s) ? '—' : s.state) : fmtNum(v, s);
        this._u.textContent = at(s, 'unit_of_measurement') || '';
        this._paintUpd(s);
        this._paintChart(s, energy);
      }
      // when the reading last changed ("Updated just now", "Updated 5 min ago")
      _paintUpd(s) {
        if (!this._upd || !s) return;
        var t = Date.parse(s.last_changed || s.last_updated);
        var ago = Math.round((Date.now() - t) / 60000);
        this._upd.textContent = unavailable(s) || !isFinite(t) ? '' : ago < 1 ? 'Updated just now' :
          ago < 60 ? 'Updated ' + ago + ' min ago' :
          'Updated ' + new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      _paintSeg() {
        var r = this._range;
        this._root.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-r') === r); });
      }
      // The series for the range, or null while it loads.
      _series(s, energy) {
        var h = this._hass, id = this._id, r = this._range, S = window.hkStats;
        if (!S) return null;
        var self = this, key = r + (energy ? 'e' : '');
        var viaStats = function (fn, n, opts) {
          var d = S[fn](h, id, n, self, opts);
          if (d && d.some(function (p) { return p && p.v != null; })) return d;
          // NO LONG-TERM STATISTICS for this sensor: after a moment, fall back
          // to its recorded history (14 days here) rather than wait forever.
          if (!self._asked[key]) { self._asked[key] = Date.now(); setTimeout(function () { self.redraw(); }, 2600); }
          if (Date.now() - self._asked[key] > 2500) return undefined;
          return null;
        };
        var out;
        if (energy) {
          if (r === 'day') out = viaStats('hourly', 24, {});
          else if (r === 'week') out = viaStats('daily', 7, {});
          else out = viaStats('daily', 30, {});
          return out === undefined ? [] : out;
        }
        if (r === 'hour') return S.history(h, id, 1, this);
        if (r === 'day') return S.history(h, id, 24, this);
        if (r === 'week') { out = viaStats('hourly', 168, { type: 'mean' }); return out === undefined ? S.history(h, id, 168, this) : out; }
        out = viaStats('daily', 30, { type: 'mean' });
        return out === undefined ? S.history(h, id, 336, this) : out;
      }
      _paintChart(s, energy) {
        var pts = this._series(s, energy);
        var unit = at(s, 'unit_of_measurement') || '', u = esc(unit);
        var r = this._range;
        // plot height and time labels: a tall chart in the wide sheet, a
        // shorter one with three times on a phone
        var phone = matchMedia('(max-width:600px)').matches;
        var H = phone ? 180 : 250, NT = phone ? 3 : 5, MS = RANGE_H[r] * 3600000;
        // NOTHING CHANGES HEIGHT ON A RANGE SWITCH, so the card does not bounce.
        // The stats row is never taken out -- dashes when there is nothing to
        // say -- and a chart already drawn stays, dimmed, until the new range
        // lands; the placeholder is only for the first open, at the chart's
        // own height. Taking the row out would re-centre the whole sheet twice.
        var ks = energy ? [{ day: '24-hour total', week: '7-day total', month: '30-day total' }[r],
                           { day: 'Hourly average', week: 'Daily average', month: 'Daily average' }[r],
                           { day: 'Peak hour', week: 'Peak day', month: 'Peak day' }[r]] : ['Low', 'Average', 'High'];
        var dash = function (self) {
          self._stats.hidden = false;
          self._stats.classList.remove('stale');
          self._stats.innerHTML = ks.map(function (k) { return '<div><div class="k">' + k + '</div><div class="v">—</div></div>'; }).join('');
        };
        var ph = function (self, text) {
          self._chart.classList.remove('stale');
          self._chart.innerHTML = '<div class="ph" style="height:' + (H + 22) + 'px">' + text + '</div>';
          dash(self);
        };
        var empty = function (self) { ph(self, 'No history for this range'); };
        if (!pts) {
          this._ser = null;
          if (this._chart.querySelector('.axc')) { this._chart.classList.add('stale'); this._stats.classList.add('stale'); return; }
          ph(this, 'Loading…');
          return;
        }
        this._chart.classList.remove('stale');
        this._stats.classList.remove('stale');
        var c = this._ser;
        if (energy) {
          // bars move only with their series: drawn again when it changes
          if (c && c.src === pts && c.r === r) return;
          this._ser = { src: pts, r: r };
          var nums = pts.filter(function (p) { return p && p.v != null && isFinite(p.v); }).map(function (p) { return p.v; });
          // none at all is "no history", not a "0 kWh" total
          if (!nums.length) { empty(this); return; }
          this._chart.innerHTML = axesChart({ pts: pts, bars: true, H: H, unit: unit, ms: MS, n: NT });
          this._stats.hidden = false;
          var tot = nums.reduce(function (a, b) { return a + b; }, 0);
          // the headline is the meter (today so far); these are the chart's span
          var per = { day: 'Hourly average', week: 'Daily average', month: 'Daily average' }[r];
          var span = { day: '24-hour total', week: '7-day total', month: '30-day total' }[r];
          var peak = { day: 'Peak hour', week: 'Peak day', month: 'Peak day' }[r];
          this._stats.innerHTML = '<div><div class="k">' + span + '</div><div class="v">' + fmtNum(tot, s) + ' ' + u + '</div></div>' +
            '<div><div class="k">' + per + '</div><div class="v">' + fmtNum(tot / nums.length, s) + ' ' + u + '</div></div>' +
            '<div><div class="k">' + peak + '</div><div class="v">' + fmtNum(Math.max.apply(null, nums.concat([0])), s) + ' ' + u + '</div></div>';
          return;
        }
        // THE LINE. The heavy part -- a day of a power sensor is ~11,000 rows
        // -- is filtered, downsampled and summed ONCE per series; a state
        // push only pins the ends (the range start, the live reading) rather
        // than redoing all of it every few seconds.
        if (!c || c.src !== pts || c.r !== r) {
          var full = pts.filter(function (p) { return p && p.v != null && isFinite(p.v); });
          var lo = Infinity, hi = -Infinity, sum = 0;
          full.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; sum += p.v; });
          c = this._ser = { src: pts, r: r, ds: downsample(full, 300), lo: lo, hi: hi, sum: sum, n: full.length };
        }
        var now = Date.now(), live = num(s.state);
        var line = spanTo(c.ds, now - RANGE_H[r] * 3600000, now, live);
        if (line.length < 2) { empty(this); return; }
        this._chart.innerHTML = axesChart({ pts: line, H: H, unit: unit, ms: MS, n: NT, colour: 'orange' });
        var low = live != null ? Math.min(c.lo, live) : c.lo, high = live != null ? Math.max(c.hi, live) : c.hi;
        var avg = c.n ? c.sum / c.n : live;
        this._stats.hidden = false;
        this._stats.innerHTML = '<div><div class="k">Low</div><div class="v">' + fmtNum(low, s) + ' ' + u + '</div></div>' +
          '<div><div class="k">Average</div><div class="v">' + fmtNum(avg, s) + ' ' + u + '</div></div>' +
          '<div><div class="k">High</div><div class="v">' + fmtNum(high, s) + ' ' + u + '</div></div>';
      }
    }

    // ------------------------------------------------------------ binary / state
    var BIN_WORDS = {
      door: ['Closed', 'Open'], window: ['Closed', 'Open'], garage_door: ['Closed', 'Open'], opening: ['Closed', 'Open'],
      moisture: ['Dry', 'Wet'], motion: ['Clear', 'Detected'], occupancy: ['Clear', 'Detected'], presence: ['Away', 'Home'],
      lock: ['Locked', 'Unlocked'], smoke: ['Clear', 'Detected'], gas: ['Clear', 'Detected'], problem: ['OK', 'Problem'],
      connectivity: ['Disconnected', 'Connected'], plug: ['Unplugged', 'Plugged in'], power: ['Off', 'On'], battery: ['Normal', 'Low']
    };
    function sinceText(iso) {
      var t = Date.parse(iso);
      if (!isFinite(t)) return '';
      var d = new Date(t), today = new Date();
      var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (d.toDateString() === today.toDateString()) return 'Since ' + time;
      return 'Since ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
    }
    // THE SENSOR'S OWN GLYPH, large, in the pill's colour while it is on /
    // open (the state icon follows the state: a door open or shut), then the
    // word, "Since", and a card for the last 24 hours with its times along
    // the bottom. Shared by the door-style and the text sensors.
    var SENSE_CSS = [
      '.pn{gap:12px}',
      '.gw{width:180px;height:180px;border-radius:90px;display:flex;align-items:center;justify-content:center;',
      '  background:rgba(255,255,255,0.07);margin-bottom:6px;transition:background .25s}',
      '.gw .gc{width:120px;height:120px;border-radius:60px;display:flex;align-items:center;justify-content:center;',
      '  background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.85);transition:background .25s,color .25s}',
      '.gw ha-state-icon{--mdc-icon-size:56px;display:flex}',
      '.gw.on{background:color-mix(in srgb,var(--hkd-accent,#56bde4) 22%,transparent)}',
      '.gw.on .gc{background:var(--hkd-accent,#56bde4);color:#fff}',
      '.big.w{font-size:52px}',
      '.since{font-size:16px;color:rgba(235,235,245,0.62);min-height:20px}',
      '.tl{align-self:stretch;margin-top:12px;padding:16px 18px 14px;border-radius:20px;background:rgba(255,255,255,0.08)}',
      '.tl .th{display:flex;justify-content:space-between;align-items:baseline;gap:12px}',
      '.tl .t{font-size:13px;font-weight:600;letter-spacing:.2px;color:rgba(235,235,245,0.55);text-transform:uppercase}',
      '.tl .n{font-size:15px;color:rgba(235,235,245,0.8);white-space:nowrap}',
      '.tl .bar{position:relative;height:64px;margin-top:12px;border-radius:10px;background:rgba(255,255,255,0.10);overflow:hidden}',
      '.tl .bar i{position:absolute;top:0;bottom:0;min-width:2px}',
      '.tl .bar .q{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.08)}',
      '.tl .axx{margin-left:0}',
      '.tl .lg{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:13px;color:rgba(235,235,245,0.75)}',
      '.tl .lg span{display:inline-flex;align-items:center;gap:6px}',
      '.tl .lg b{width:10px;height:10px;border-radius:3px;display:inline-block}',
      '@media (max-width:600px){.gw{width:150px;height:150px;border-radius:75px}',
      '  .gw .gc{width:100px;height:100px;border-radius:50px}.gw ha-state-icon{--mdc-icon-size:48px}',
      '  .big.w{font-size:44px}.tl .bar{height:52px}}'
    ].join('');
    var DAY = 24 * 3600000;
    var QUARTERS = '<b class="q" style="left:25%"></b><b class="q" style="left:50%"></b><b class="q" style="left:75%"></b>';
    function senseShell(title) {
      return '<div class="pn"><div class="gw"><div class="gc"><ha-state-icon></ha-state-icon></div></div>' +
        '<div class="big w"></div><div class="since"></div>' +
        '<div class="tl" hidden><div class="th"><span class="t">' + title + '</span><span class="n"></span></div>' +
        '<div class="bar"></div>' + timeRow(DAY, 5) + '<div class="lg" hidden></div></div></div>';
    }
    // the day's rows, straight from the recorder (hkStats.history keeps numbers only)
    function dayRows(h, id) {
      if (!h || !h.callApi) return Promise.reject(new Error('no api'));
      var start = new Date(Date.now() - DAY);
      var url = 'history/period/' + encodeURIComponent(start.toISOString()) + '?filter_entity_id=' +
                encodeURIComponent(id) + '&minimal_response&no_attributes';
      return h.callApi('GET', url).then(function (res) {
        return { t0: start.getTime(), rows: (Array.isArray(res) && Array.isArray(res[0])) ? res[0] : [] };
      });
    }
    // rows -> [{state, a, b}] clipped to [t0, now]
    function spansOf(rows, t0, now) {
      return (rows || []).map(function (r, i) {
        var a = Math.max(t0, Date.parse(r.last_changed || r.last_updated));
        var b = i + 1 < rows.length ? Date.parse(rows[i + 1].last_changed || rows[i + 1].last_updated) : now;
        return { state: r.state, a: a, b: Math.min(now, b) };
      }).filter(function (g) { return g.b > g.a; });
    }
    class SensePanel extends Panel {
      static get CSS() { return PANEL_CSS + SENSE_CSS; }
      _shell(title) {
        this._root.innerHTML = senseShell(title);
        var q = this._root.querySelector.bind(this._root);
        this._gw = q('.gw'); this._icon = q('ha-state-icon');
        this._big = q('.big'); this._since = q('.since'); this._tl = q('.tl');
        this.style.setProperty('--hkd-accent', colourName(lookFor(this._src, this._id), this._id));
        if (this._src.icon) this._icon.icon = this._src.icon;
      }
      _glyph(s, on) {
        this._icon.hass = this._hass;
        this._icon.stateObj = s;
        this._gw.classList.toggle('on', !!on);
      }
      _fetch() {
        var self = this;
        dayRows(this._hass, this._id).then(function (r) {
          self._rows = r.rows; self._t0 = r.t0;
          self._paintDay();
        }).catch(function () { /* no timeline */ });
      }
    }
    class BinaryPanel extends SensePanel {
      hkWidthKind() { return 'binary'; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        if (!this._built) {
          this._built = true;
          this._shell('Last 24 hours');
          this._fetch();
        }
        var w = BIN_WORDS[at(s, 'device_class')] || ['Off', 'On'];
        this._glyph(s, s.state === 'on');
        this._big.textContent = unavailable(s) ? 'Unavailable' : (s.state === 'on' ? w[1] : w[0]);
        this._since.textContent = sinceText(s.last_changed);
        if (this._lastSeen !== s.last_changed) { this._lastSeen = s.last_changed; if (this._rows) this._fetch(); }
      }
      _paintDay() {
        var t0 = this._t0, now = Date.now(), span = now - t0, opens = 0, prev = null;
        var segs = spansOf(this._rows, t0, now);
        segs.forEach(function (g, i) { if (g.state === 'on' && prev !== 'on' && i > 0) opens++; prev = g.state; });
        var s = this._stateObj, w = BIN_WORDS[at(s, 'device_class')] || ['Off', 'On'];
        this._tl.hidden = false;
        this._tl.querySelector('.bar').innerHTML = QUARTERS + segs.filter(function (g) { return g.state === 'on'; }).map(function (g) {
          return '<i style="left:' + ((g.a - t0) / span * 100).toFixed(2) + '%;width:' + Math.max(0.3, (g.b - g.a) / span * 100).toFixed(2) +
                 '%;background:var(--hkd-accent,#56bde4)"></i>';
        }).join('');
        this._tl.querySelector('.n').textContent = opens ? w[1] + ' ' + opens + (opens === 1 ? ' time' : ' times') : 'No change in 24 hours';
      }
    }
    // A TEXT SENSOR: its value, and the day as a strip of its states with the
    // time spent in each (the most-held state in the pill's colour).
    var STRIP = ['var(--hkd-accent,#56bde4)', 'rgba(255,255,255,0.24)', '#ff9f0a', '#bf5af2', '#30d158', '#ff6961'];
    class StatePanel extends SensePanel {
      hkWidthKind() { return 'state'; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        if (!this._built) {
          this._built = true;
          this._shell('Last 24 hours');
          this._fetch();
        }
        var h = this._hass, txt;
        try { txt = h.formatEntityState ? h.formatEntityState(s) : s.state; } catch (e) { txt = s.state; }
        this._glyph(s, !unavailable(s) && s.state !== 'off' && s.state !== 'unknown');
        this._big.textContent = unavailable(s) ? 'Unavailable' : txt;
        this._since.textContent = sinceText(s.last_changed);
        if (this._lastSeen !== s.last_changed) { this._lastSeen = s.last_changed; if (this._rows) this._fetch(); }
      }
      _paintDay() {
        var t0 = this._t0, now = Date.now(), span = now - t0, h = this._hass, self = this;
        var segs = spansOf(this._rows, t0, now).filter(function (g) { return g.state !== 'unavailable' && g.state !== 'unknown'; });
        if (!segs.length) return;
        var total = {};
        segs.forEach(function (g) { total[g.state] = (total[g.state] || 0) + (g.b - g.a); });
        var order = Object.keys(total).sort(function (a, b) { return total[b] - total[a]; });
        var col = {};
        order.forEach(function (st, i) { col[st] = STRIP[Math.min(i, STRIP.length - 1)]; });
        var word = function (st) {
          try { return h.formatEntityState ? h.formatEntityState(Object.assign({}, self._stateObj, { state: st })) : st; } catch (e) { return st; }
        };
        this._tl.hidden = false;
        this._tl.querySelector('.n').textContent = order.length === 1 ? 'No change in 24 hours' :
          (segs.length - 1) + (segs.length === 2 ? ' change' : ' changes');
        this._tl.querySelector('.bar').innerHTML = segs.map(function (g) {
          return '<i style="left:' + ((g.a - t0) / span * 100).toFixed(2) + '%;width:' + Math.max(0.3, (g.b - g.a) / span * 100).toFixed(2) +
                 '%;background:' + col[g.state] + '"></i>';
        }).join('') + QUARTERS;
        var lg = this._tl.querySelector('.lg');
        lg.hidden = false;
        lg.innerHTML = order.slice(0, 4).map(function (st) {
          return '<span><b style="background:' + col[st] + '"></b>' + esc(word(st)) + ' · ' + dur(total[st] / 1000) + '</span>';
        }).join('');
      }
    }

    // ------------------------------------------------------------ lists
    // One pick-list look for every "choose one of these": a select, a
    // humidifier's modes. The current row carries the orange tick the light's
    // effects use; past 12 rows there is a search.
    var LIST_CSS = [
      '.list{align-self:stretch;border-radius:18px;background:rgba(255,255,255,0.06);max-height:420px;overflow-y:auto;',
      '  overscroll-behavior:contain;scrollbar-width:none}',
      '.list::-webkit-scrollbar{display:none}',
      '.list button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;',
      '  min-height:52px;padding:0 18px;border:0;border-bottom:1px solid rgba(255,255,255,0.07);',
      '  background:transparent;color:#fff;font:inherit;font-size:17px;text-align:left;cursor:pointer}',
      '.list button span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.list button svg{flex-shrink:0}',
      '.list button:last-child{border-bottom:0}',
      '.list button:active{background:rgba(255,255,255,0.08)}',
      '.search{align-self:stretch;display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:14px;',
      '  background:rgba(255,255,255,0.10)}',
      '.search input{flex-grow:1;min-width:0;border:0;background:transparent;color:#fff;font:inherit;',
      '  font-size:17px;outline:none}',
      '.search input::placeholder{color:rgba(235,235,245,0.5)}',
      '.sub{align-self:stretch;display:flex;flex-direction:column;gap:16px}',
      '.bk{display:flex;align-items:center;gap:10px}',
      '.bk button{width:40px;height:40px;border-radius:20px;border:0;padding:0;display:flex;',
      '  align-items:center;justify-content:center;background:rgba(255,255,255,0.13);color:#fff;cursor:pointer}',
      '.bk .t{font-size:20px;font-weight:700;letter-spacing:-.3px}',
      '@media (max-width:600px){.list{max-height:340px}}'
    ].join('');
    function pretty(v) {
      var t = String(v == null ? '' : v).replace(/_/g, ' ');
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    // pickList(host, options, onPick, label): paints the list (and, past 12
    // options, its search) into host; returns repaint(cur) for state changes.
    // `label` names the search field for a screen reader.
    function pickList(host, options, onPick, label) {
      var q = '', sig = null, box = document.createElement('div');
      box.className = 'list';
      if (options.length > 12) {
        var se = document.createElement('label');
        se.className = 'search';
        se.innerHTML = SEARCH + '<input type="search" placeholder="Search" aria-label="Search ' + esc(label || '') + '" autocomplete="off">';
        host.appendChild(se);
        se.querySelector('input').addEventListener('input', function (ev) { q = ev.target.value.toLowerCase(); paint(last, true); });
      }
      host.appendChild(box);
      var last = null;
      function paint(cur, force) {
        last = cur;
        var s2 = cur + '|' + q;
        if (!force && s2 === sig) return;
        sig = s2;
        var rows = options.filter(function (o) { return !q || pretty(o).toLowerCase().indexOf(q) !== -1; });
        box.innerHTML = rows.map(function (o) {
          return '<button data-o="' + esc(o) + '"' + (o === cur ? ' aria-current="true"' : '') + '><span>' + esc(pretty(o)) + '</span>' +
                 (o === cur ? TICK : '') + '</button>';
        }).join('') || '<div class="muted" style="padding:18px">Nothing matches</div>';
        box.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () { onPick(b.getAttribute('data-o')); });
        });
      }
      return paint;
    }

    // ------------------------------------------------------------ vacuum
    // The robot, what it is doing, and its four commands. Battery, room,
    // progress and errors are SEPARATE sensors here (the vacuum entities carry
    // no battery_level): the vacuum page's card names them, and a vacuum
    // opened from anywhere else finds them on its own device.
    var VF = { PAUSE: 4, RETURN_HOME: 16, LOCATE: 512, START: 8192 };
    var VAC_WORDS = { docked: 'Docked', cleaning: 'Cleaning', paused: 'Paused', returning: 'Returning',
                      idle: 'Idle', error: 'Error' };
    var VAC_OK = ['no_error', 'none', 'ok', 'unknown', 'unavailable', ''];
    function deviceSensor(h, id, test) {
      var ents = h && h.entities, me = ents && ents[id];
      if (!me || !me.device_id) return null;
      var hit = null;
      Object.keys(ents).some(function (k) {
        if (k.indexOf('sensor.') !== 0 || !ents[k] || ents[k].device_id !== me.device_id) return false;
        if (test(k, h.states[k])) { hit = k; return true; }
        return false;
      });
      return hit;
    }
    class VacuumPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          '.pn{gap:16px;padding:3px 0}',
          // the robot 200 and its commands 72: sized for the one sheet height
          '.bot{width:200px;height:200px;border-radius:100px;display:flex;align-items:center;justify-content:center;',
          '  background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.85);transition:background .25s,color .25s}',
          '.bot.live{background:rgba(48,209,88,0.20);color:#30d158}',
          '.bot.bad{background:rgba(255,69,58,0.18);color:#ff453a}',
          '.big.w{font-size:40px;margin-top:4px}',
          '.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;min-height:30px}',
          '.chips span{height:30px;padding:0 12px;border-radius:15px;display:inline-flex;align-items:center;',
          '  font-size:14px;font-weight:600;background:rgba(255,255,255,0.10);color:rgba(235,235,245,0.8);',
          '  font-variant-numeric:tabular-nums}',
          '.chips .good{color:#30d158}.chips .warn{color:#ffd60a}.chips .low{color:#ff453a}',
          '.chips .err{background:rgba(255,69,58,0.18);color:#ff6961}',
          '.cmds{align-self:stretch;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}',
          '.cmds button{display:flex;flex-direction:column;align-items:center;gap:8px;border:0;background:none;',
          '  color:#fff;font:inherit;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent}',
          '.cmds .ci{width:72px;height:72px;border-radius:36px;display:flex;align-items:center;justify-content:center;',
          '  background:rgba(255,255,255,0.13);transition:background .2s,color .2s}',
          '.cmds button:active .ci{background:rgba(255,255,255,0.24)}',
          '.cmds button.sel .ci{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.85)}',
          '.cmds button[disabled]{opacity:.35;cursor:default}',
          '.cmds .cl{font-size:14px;font-weight:600;color:rgba(235,235,245,0.75)}',
          '.pn > .menu{margin-top:10px}',
          // CLEAN AREAS: the rooms this robot has on its map, two to a row,
          // a pick toggles; the green button sends only this robot.
          '.sub{align-self:stretch;display:flex;flex-direction:column;gap:16px}',
          '.bk{display:flex;align-items:center;gap:10px}',
          '.bk button{width:40px;height:40px;border-radius:20px;border:0;padding:0;display:flex;',
          '  align-items:center;justify-content:center;background:rgba(255,255,255,0.13);color:#fff;cursor:pointer}',
          '.bk .t{font-size:20px;font-weight:700;letter-spacing:-.3px}',
          '.ag{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-height:360px;overflow-y:auto;',
          '  overscroll-behavior:contain;scrollbar-width:none}',
          '.ag::-webkit-scrollbar{display:none}',
          // centred: text-only buttons have no glyph to share a left edge with
          '.ag .btn{height:48px;border-radius:24px;padding:0 12px;font-size:15px;min-width:0;justify-content:center;text-align:center}',
          '.ag .btn span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
          '.go{align-self:stretch;background:#30d158}',
          '.go:active{background:#28b84c}',
          '.go[disabled]{background:rgba(255,255,255,0.13);opacity:.5}',
          '.why{font-size:14px;color:#ff6961;text-align:center;min-height:18px;margin-top:-6px}',
          '@media (max-width:600px){.bot{width:170px;height:170px;border-radius:85px}',
          '  .cmds .ci{width:60px;height:60px;border-radius:30px}.big.w{font-size:34px}',
          '  .ag{max-height:320px}.ag .btn{height:44px;border-radius:22px;padding:0 10px}}'
        ].join('');
      }
      hkWidthKind() { return 'vacuum'; }
      // the sensors: the source card's, else found on the vacuum's device
      _parts() {
        if (this._pt) return this._pt;
        var c = this._src.config || {}, h = this._hass, id = this._id;
        var find = function (re, dc) {
          return deviceSensor(h, id, function (k, st) {
            return dc ? !!(st && st.attributes && st.attributes.device_class === dc) : re.test(k);
          });
        };
        this._pt = {
          battery: c.battery || find(null, 'battery'),
          room: c.room || find(/current_room$/),
          progress: c.progress || find(/cleaning_progress$/),
          error: c.error || find(/(operational|vacuum)_error$/),
          dock_error: c.dock_error || find(/dock_error$/)
        };
        return this._pt;
      }
      _v(id) { var st = id && this._hass && this._hass.states[id]; return st ? st.state : null; }
      // The chips read other sensors (battery, room, progress, errors): they
      // are inputs like the vacuum, or a battery charging on the dock would
      // never move the sheet (the default signature is the vacuum alone).
      _sigOf() {
        var h = this._hass, id = this._id;
        if (!h || !id) return null;
        var p = this._parts(), out = '';
        [id, p.battery, p.room, p.progress, p.error, p.dock_error].forEach(function (k) {
          var st = k && h.states[k];
          out += (st ? st.last_updated : 'x') + '|';
        });
        return out;
      }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        this._na(s);
        var f = num(at(s, 'supported_features')) || 0;
        if (!this._view) this._view = 'main';
        if (this._view === 'areas') { this._renderAreas(); return; }
        if (!this._built) {
          this._built = true;
          var cmds = [['start', 'mdi:play', 'Start', VF.START], ['pause', 'mdi:pause', 'Pause', VF.PAUSE],
                      ['locate', 'mdi:map-marker', 'Locate', VF.LOCATE], ['return_to_base', 'mdi:home-import-outline', 'Dock', VF.RETURN_HOME]];
          this._root.innerHTML = '<div class="pn"><div class="bot">' + glyph('mdi:robot-vacuum', 96) + '</div>' +
            '<div class="big w"></div><div class="chips"></div><div class="cmds">' +
            cmds.map(function (c) {
              return '<button data-s="' + c[0] + '"' + (f & c[3] ? '' : ' disabled') + ' aria-label="' + c[2] + '">' +
                     '<div class="ci">' + glyph(c[1], 30) + '</div><div class="cl">' + c[2] + '</div></button>';
            }).join('') + '</div></div>';
          this._root.querySelectorAll('.cmds button').forEach(function (b) {
            b.addEventListener('click', function () { self._svc('vacuum', b.getAttribute('data-s')); });
          });
          this._bot = this._root.querySelector('.bot');
          this._big = this._root.querySelector('.big');
          this._chips = this._root.querySelector('.chips');
          this._areasBtn();
        }
        var st = s.state, p = this._parts();
        var live = st === 'cleaning' || st === 'returning';
        var chips = [];
        var bn = num(at(s, 'battery_level'));
        if (bn == null) bn = num(this._v(p.battery));
        if (bn != null) chips.push([Math.round(bn) + '% battery', bn <= 20 ? 'low' : bn <= 40 ? 'warn' : '']);
        // a room and a percentage next to a DOCKED vacuum are last run's
        if (live) {
          var room = this._v(p.room);
          if (room && room !== 'unknown' && room !== 'unavailable') chips.push([room, '']);
          var pr = num(this._v(p.progress));
          if (pr != null && pr > 0) chips.push([Math.round(pr) + '% done', 'good']);
        }
        var errs = [p.error, p.dock_error].map(function (id) { return self._v(id); })
          .filter(function (e) { return e && VAC_OK.indexOf(e) === -1; });
        errs.forEach(function (e) { chips.push([pretty(e), 'err']); });
        var bad = unavailable(s) || st === 'error' || errs.length > 0;
        this._bot.classList.toggle('live', live && !bad);
        this._bot.classList.toggle('bad', bad);
        this._big.textContent = unavailable(s) ? 'Unavailable' : VAC_WORDS[st] || pretty(st);
        var html = chips.map(function (c) { return '<span class="' + c[1] + '">' + esc(c[0]) + '</span>'; }).join('');
        if (this._chipsHtml !== html) { this._chipsHtml = html; this._chips.innerHTML = html; }
        var on = { start: st === 'cleaning', pause: st === 'paused', return_to_base: st === 'returning' };
        this._root.querySelectorAll('.cmds button').forEach(function (b) {
          b.classList.toggle('sel', !!on[b.getAttribute('data-s')]);
        });
      }
    }

    // ------------------------------------------------------------ vacuum: areas
    // WHICH ROOMS THIS ROBOT KNOWS comes from Home Assistant's own mapping (the
    // vacuum's entity settings), read through Clean Areas' dry run -- a
    // plan, nothing sent -- once per sheet. Only a robot that takes
    // vacuum.clean_area gets the button; one that just starts in its own room
    // has nothing to choose.
    VacuumPanel.prototype._areasBtn = function () {
      var self = this, h = this._hass;
      var add = function () {
        if (!self._reach || !self._reach.length || self._view !== 'main') return;
        var pn = self._root.querySelector('.pn');
        if (!pn || pn.querySelector('.menu')) return;
        var b = document.createElement('button');
        b.className = 'btn menu';
        b.innerHTML = '<span>Clean Areas</span><span class="cur">' + self._reach.length + ' rooms' + CHEV + '</span>';
        b.addEventListener('click', function () { self._view = 'areas'; self._built = false; self._render(); });
        pn.appendChild(b);
      };
      if (this._reach !== undefined) { add(); return; }
      this._reach = null;
      var C1 = window.hkCards;
      if (!h || !C1 || !C1.added || !C1.added('clean_areas') || !h.services || !h.services.vacuum ||
          !h.services.vacuum.clean_area) return;
      var id = this._id;
      this._callResp('hk_frontend', 'clean_areas', { areas: Object.keys(h.areas || {}), dry_run: true }).then(function (res) {
        var plan = (res && res.response && res.response.plan) || [];
        var mine = plan.filter(function (p) { return p.vacuum === id && p.action === 'clean_area'; })[0];
        var areas = (mine && mine.areas) || [];
        var hh = self._hass || h;
        self._reach = areas.map(function (a) { return { id: a, name: (hh.areas[a] && hh.areas[a].name) || pretty(a) }; })
          .sort(function (x, y) { return x.name.localeCompare(y.name); });
        add();
      });
    };
    VacuumPanel.prototype._renderAreas = function () {
      var self = this;
      if (!this._pick) this._pick = new Set();
      if (!this._built) {
        this._built = true;
        this._root.innerHTML = '<div class="pn"><div class="sub"><div class="bk"><button aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BACK + '"/></svg></button><div class="t">Clean Areas</div></div>' +
          '<div class="ag">' + (this._reach || []).map(function (a) {
            return '<button class="btn" data-a="' + esc(a.id) + '" aria-pressed="false"><span>' + esc(a.name) + '</span></button>';
          }).join('') + '</div><button class="btn go" disabled></button><div class="why"></div></div></div>';
        this._root.querySelector('.bk button').addEventListener('click', function () { self._view = 'main'; self._built = false; self._render(); });
        this._root.querySelectorAll('.ag .btn').forEach(function (b) {
          b.addEventListener('click', function () {
            var a = b.getAttribute('data-a');
            if (self._pick.has(a)) self._pick.delete(a); else self._pick.add(a);
            self._paintAreas();
          });
        });
        var go = this._goBtn = this._root.querySelector('.go');
        this._why = this._root.querySelector('.why');
        go.addEventListener('click', function () {
          if (!self._pick.size || go.disabled) return;
          var areas = Array.from(self._pick);
          go.disabled = true;
          self._why.textContent = '';
          // THIS robot only: the picker on the vacuum page is the home-wide one
          self._svc('vacuum', 'clean_area', { cleaning_area_id: areas }).then(function (ok) {
            if (ok) { self._pick.clear(); self._view = 'main'; self._built = false; self._render(); return; }
            // the selection survives a failed send
            self._why.textContent = 'Could not start. Tap to try again.';
            self._paintAreas();
          });
        });
      }
      this._paintAreas();
    };
    VacuumPanel.prototype._paintAreas = function () {
      var pick = this._pick, n = pick.size;
      this._root.querySelectorAll('.ag .btn').forEach(function (b) {
        var on = pick.has(b.getAttribute('data-a'));
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (this._goBtn) {
        this._goBtn.disabled = !n;
        this._goBtn.textContent = n ? 'Clean ' + n + (n === 1 ? ' Area' : ' Areas') : 'Choose Areas';
      }
    };

    // ------------------------------------------------------------ valve
    // The water is never one tap either way: the lock's ring, held to close
    // AND held to open. Blue while it runs, grey when it is shut.
    class ValvePanel extends RingPanel {
      hkWidthKind() { return 'lock'; }
      spec(s) {
        var st = s.state, f = num(at(s, 'supported_features')) || 0;
        var bad = unavailable(s);
        var what = ({ water: 'the water', gas: 'the gas' })[at(s, 'device_class')] || this._who(s, 'the valve');
        var shut = st === 'closed' || st === 'closing';
        return {
          word: bad ? 'Unavailable' : ({ open: 'Open', closed: 'Closed', opening: 'Opening…', closing: 'Closing…' })[st] || pretty(st),
          glyph: at(s, 'device_class') === 'gas' ? 'mdi:fire' : shut ? 'hk:water-alert' : 'hk:water',
          tone: 'water', shut: shut, busy: st === 'opening' || st === 'closing', bad: bad,
          hold: st === 'closed' && (f & 1) ? ['valve', 'open_valve'] : st === 'open' && (f & 2) ? ['valve', 'close_valve'] : null,
          tap: null,
          hint: st === 'closed' ? 'Hold to open' : st === 'open' ? 'Hold to close' : '',
          label: st === 'closed' ? 'Hold to open' : st === 'open' ? 'Hold to close' : '',
          ask: (st === 'open' ? 'Turn off ' : 'Turn on ') + what + '?'
        };
      }
    }

    // ------------------------------------------------------------ numbers
    // A number is the brightness slider with the value above it.
    class NumberPanel extends Panel {
      static get CSS() { return PANEL_CSS + '.big .u{font-size:22px;font-weight:600;color:rgba(235,235,245,0.62);margin-left:4px;letter-spacing:0}'; }
      hkWidthKind() { return 'number'; }
      _range(s) {
        var lo = num(at(s, 'min')), hi = num(at(s, 'max')), step = num(at(s, 'step')) || 1;
        if (lo == null) lo = 0;
        if (hi == null || hi <= lo) hi = lo + 100;
        return { lo: lo, hi: hi, step: step, n: Math.round((hi - lo) / step) };
      }
      _fmt(v, r) {
        var dp = String(r.step).indexOf('.') === -1 ? 0 : String(r.step).split('.')[1].length;
        return Number(v).toFixed(dp);
      }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var r = this._range(s), u = at(s, 'unit_of_measurement') || '';
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><div class="big"><span class="n"></span><span class="u"></span></div></div>';
          var pn = this._root.querySelector('.pn');
          var val = function (v) { return r.lo + Math.round(v * r.n) * r.step; };
          var send = throttle(function (v) { self._svc(domainOf(self._id), 'set_value', { value: Number(self._fmt(val(v), r)) }); }, 400);
          this._slider = this._vslider({
            steps: r.n <= 10 ? r.n : 0, label: at(s, 'friendly_name') || 'Value',
            onInput: function (v) { self._n.textContent = self._fmt(val(v), r); },
            onChange: function (v) { self._n.textContent = self._fmt(val(v), r); send(v); }
          });
          pn.appendChild(this._slider.el);
          this._n = this._root.querySelector('.n');
          this._root.querySelector('.u').textContent = u;
        }
        var v = num(s.state), na = this._na(s);
        if (!this._slider.dragging()) {
          this._n.textContent = na ? 'Unavailable' : v == null ? '—' : this._fmt(v, r);
          if (v != null) this._slider.set((v - r.lo) / (r.hi - r.lo));
        }
      }
    }

    // ------------------------------------------------------------ selects
    // A select is its list.
    // THE LIST FILLS THE SHEET: rows stretch from 52 to at most ROW_MAX px,
    // so eight options fill the height and three stay a list, centred --
    // and past what fits, it scrolls at 52.
    var ROW_MAX = 68;
    class SelectPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + LIST_CSS + [
          // the host fills the body; HkBase's own wrapper div passes it on
          ':host{display:flex;flex-direction:column}',
          ':host > div{flex:1;min-height:0;display:flex;flex-direction:column}',
          '.pn{flex:1;min-height:0;align-items:stretch;justify-content:center;gap:16px;padding:0}',
          '.list{flex:1 1 auto;min-height:0;max-height:none;display:flex;flex-direction:column}',
          '.list button{flex:1 0 52px}',
          '@media (max-width:600px){.list{max-height:none}}'
        ].join('');
      }
      hkWidthKind() { return 'select'; }
      hkFill() { return true; }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var opts = (at(s, 'options') || []).slice();
        var sig = opts.join('|');
        if (!this._built || this._opsSig !== sig) {
          this._built = true;
          this._opsSig = sig;
          this._root.innerHTML = '<div class="pn"></div>';
          this._paint = pickList(this._root.querySelector('.pn'), opts, function (o) {
            self._svc(domainOf(self._id), 'select_option', { option: o });
          }, at(s, 'friendly_name'));
          this._root.querySelector('.list').style.maxHeight = (opts.length * ROW_MAX) + 'px';
        }
        this._na(s);
        this._paint(s.state);
      }
    }

    // ------------------------------------------------------------ humidifier
    // Target humidity is the slider; power and (when it has them) the mode
    // sit under it, the mode opening its list.
    class HumidifierPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + LIST_CSS + [
          '.pn{gap:20px}',
          // Target and Now, side by side
          '.rds{align-self:stretch;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));text-align:center}',
          '.rds .k{font-size:13px;color:rgba(235,235,245,0.6)}',
          '.rds .v{font-size:40px;font-weight:600;letter-spacing:-1px;line-height:1.15;font-variant-numeric:tabular-nums}',
          '.rds .v.nw{color:rgba(235,235,245,0.62)}',
          // the slider between an empty column and the "Now" marker's, so it
          // stays centred on the sheet
          '.sl{display:grid;grid-template-columns:96px 150px 96px;column-gap:14px;align-items:center}',
          // 400, not 330: at 330 the same 150 px width reads as a wider slider
          // than the fan's 420 -- the proportion, not the width
          '.vs{height:400px}',
          '.vs .fill{background:linear-gradient(180deg,#8fd6ef,#56bde4)}',
          '.vs.off .fill{background:rgba(255,255,255,0.35)}',
          '.mk{position:relative;height:400px}',
          '.mk span{position:absolute;left:0;transform:translateY(50%);display:flex;align-items:center;gap:6px;',
          '  font-size:13px;font-weight:600;color:rgba(235,235,245,0.8);white-space:nowrap;transition:bottom .2s}',
          '.mk span::before{content:"";width:14px;height:2px;border-radius:1px;background:currentColor}',
          '.acts{align-self:stretch;display:flex;gap:10px;align-items:center}',
          '.acts .menu{flex:1}',
          '.seg{flex:1;display:flex;gap:4px;padding:4px;border-radius:16px;background:rgba(255,255,255,0.09);min-width:0}',
          '.seg button{flex:1;min-width:0;height:44px;border:0;border-radius:12px;background:transparent;',
          '  color:rgba(255,255,255,0.86);font:inherit;font-size:15px;font-weight:600;cursor:pointer;',
          '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px}',
          '.seg button.sel{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.88)}',
          '.acts .pw{width:52px;height:52px;padding:0;flex-shrink:0}',
          '.acts .pw.lit{background:rgba(255,255,255,0.95);color:rgba(0,0,0,0.85)}',
          '.acts .wide{flex:1}',
          '@media (max-width:600px){.sl{grid-template-columns:72px 128px 72px;column-gap:10px}',
          '  .vs{height:330px}.mk{height:330px}.rds .v{font-size:34px}.acts .pw{width:48px;height:48px}',
          '  .seg button{height:48px;font-size:13px;line-height:15px;white-space:normal;text-overflow:clip}}'
        ].join('');
      }
      hkWidthKind() { return 'humidifier'; }
      _go(v) { this._view = v; this._built = false; this._render(); }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var a = s.attributes || {}, on = s.state === 'on';
        var lo = num(a.min_humidity) != null ? num(a.min_humidity) : 0, hi = num(a.max_humidity) || 100;
        var modes = (a.available_modes || []).slice();
        if (!this._built) {
          this._built = true;
          if (this._view === 'modes') {
            this._root.innerHTML = '<div class="pn"><div class="sub"><div class="bk"><button aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BACK + '"/></svg></button><div class="t">Mode</div></div></div></div>';
            this._root.querySelector('.bk button').addEventListener('click', function () { self._go('main'); });
            this._paintModes = pickList(this._root.querySelector('.sub'), modes, function (m) {
              self._svc('humidifier', 'set_mode', { mode: m });
              self._go('main');
            }, 'modes');
          } else {
            this._paintModes = null;
            this._root.innerHTML = '<div class="pn">' +
              '<div class="rds"><div><div class="k">Target</div><div class="v tg"></div></div>' +
              '<div><div class="k kn">Now</div><div class="v nw"></div></div></div>' +
              '<div class="sl"><div></div><div class="slot"></div><div class="mk"><span></span></div></div>' +
              '<div class="acts"></div></div>';
            var val = function (v) { return Math.round(lo + v * (hi - lo)); };
            var send = throttle(function (v) { self._svc('humidifier', 'set_humidity', { humidity: val(v) }); }, 400);
            this._slider = this._vslider({
              label: 'Target humidity', glyph: glyph('mdi:water-percent', 30),
              onInput: function (v) { self._tgt.textContent = val(v) + '%'; },
              onChange: function (v) { self._tgt.textContent = val(v) + '%'; send(v); }
            });
            this._root.querySelector('.slot').appendChild(this._slider.el);
            this._tgt = this._root.querySelector('.tg');
            this._nw = this._root.querySelector('.nw');
            this._kn = this._root.querySelector('.kn');
            this._mk = this._root.querySelector('.mk span');
            var acts = this._root.querySelector('.acts');
            this._seg = null; this._mode = null;
            if (modes.length && modes.length <= 4) {
              // up to four modes: a segmented row; more: the pick list
              var seg = document.createElement('div');
              seg.className = 'seg';
              seg.innerHTML = modes.map(function (m) { return '<button data-m="' + esc(m) + '">' + esc(pretty(m)) + '</button>'; }).join('');
              seg.querySelectorAll('button').forEach(function (b) {
                b.addEventListener('click', function () { self._svc('humidifier', 'set_mode', { mode: b.getAttribute('data-m') }); });
              });
              acts.appendChild(seg);
              this._seg = seg;
            } else if (modes.length) {
              var m = document.createElement('button');
              m.className = 'btn menu';
              m.innerHTML = '<span>Mode</span><span class="cur"></span>';
              m.addEventListener('click', function () { self._go('modes'); });
              acts.appendChild(m);
              this._mode = m;
            }
            var pw = document.createElement('button');
            pw.className = 'btn pw';
            pw.setAttribute('aria-label', 'Power');
            pw.innerHTML = glyph('mdi:power', 24);
            pw.addEventListener('click', function () { self._svc('humidifier', self._stateObj.state === 'on' ? 'turn_off' : 'turn_on'); });
            // no modes: the power button is the row, with its words
            if (!modes.length) { pw.className = 'btn wide'; pw.innerHTML = glyph('mdi:power', 22) + '<span class="pwl"></span>'; }
            acts.appendChild(pw);
            this._pw = pw;
          }
        }
        var na = this._na(s);
        if (this._paintModes) { this._paintModes(a.mode); return; }
        var t = num(a.humidity), cur = num(a.current_humidity);
        if (!this._slider.dragging()) {
          this._tgt.textContent = t == null || na ? '—' : Math.round(t) + '%';
          if (t != null) this._slider.set((t - lo) / (hi - lo));
        }
        this._slider.el.classList.toggle('off', !on);
        this._nw.textContent = na || cur == null ? '—' : Math.round(cur) + '%';
        this._kn.textContent = na ? 'Unavailable' : !on ? 'Now · Off' :
          'Now · ' + (a.action === 'drying' ? 'Drying' : a.action === 'humidifying' ? 'Humidifying' : a.action === 'idle' ? 'Idle' : 'On');
        // the marker: where the air is, against where it is asked to be
        this._mk.hidden = cur == null || na;
        if (cur != null) {
          this._mk.style.bottom = (clamp((cur - lo) / (hi - lo), 0, 1) * 100).toFixed(1) + '%';
          this._mk.textContent = 'Now ' + Math.round(cur) + '%';
        }
        if (this._seg) this._seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-m') === a.mode); });
        if (this._mode) this._mode.querySelector('.cur').innerHTML = esc(pretty(a.mode || '')) + CHEV;
        this._pw.classList.toggle('lit', on && this._pw.classList.contains('pw'));
        this._pw.classList.toggle('sel', on && !this._pw.classList.contains('pw'));
        var l = this._pw.querySelector('.pwl');
        if (l) l.textContent = on ? 'Turn Off' : 'Turn On';
      }
    }

    // ------------------------------------------------------------ water heater
    // THE THERMOSTAT'S SHEET, ONE SETPOINT: the two are the same, and the
    // same size. The ring is the thermostat
    // card's ring -- same box, radius, stroke, knob, blue-to-orange band and
    // current-temperature dot (hk-control _climate; a test holds the numbers
    // together) -- sized by the same --hk-tstat-* variables, so the wide sheet
    // makes both 400 px and a phone both 300. Left: the ring, the operation
    // modes and the power. Right: the tank now and its 24-hour low and high,
    // away mode, and the tank's last day. Drag the ring or use the arrows.
    var WF = { TARGET: 1, MODE: 2, AWAY: 4, ONOFF: 8 };
    // the heater's own words for its modes: one word where HA's is
    // two and the row is a quarter wide ("High demand" -> "Demand"), and
    // "Heat Pump" capitalised as the name it is; the rest are pretty(m)
    var WH_WORDS = { high_demand: 'Demand', heat_pump: 'Heat Pump' };
    function whWord(m) { return WH_WORDS[m] || pretty(m); }
    // hk-control _climate: viewBox 0 0 200 172, centre (100,100), r 78,
    // 135 degrees round through 270 (the gap at the bottom)
    var WD = { W: 200, H: 172, CX: 100, CY: 100, R: 78, A0: 135, SWEEP: 270 };
    function arcPoint(deg) {
      var r = deg * Math.PI / 180;
      return [WD.CX + WD.R * Math.cos(r), WD.CY + WD.R * Math.sin(r)];
    }
    function arcPath(f) {
      var a = arcPoint(WD.A0), b = arcPoint(WD.A0 + WD.SWEEP * f);
      var large = WD.SWEEP * f > 180 ? 1 : 0;
      return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A' + WD.R + ' ' + WD.R + ' 0 ' + large + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
    }
    class WaterHeaterPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + LIST_CSS + [
          '.pn{gap:14px}',
          // narrow (a phone): one column -- .side dissolves into it
          '.side{display:contents}',
          '.dial{align-self:stretch;display:flex;flex-direction:column;align-items:center}',
          // the ring: hk-control's .ring/.tstat-wrap/.tstat-face, value for value
          // pan-y, as the thermostat's ring: a vertical swipe scrolls the sheet
          '.dl{position:relative;width:100%;max-width:var(--hk-tstat-ring,300px);touch-action:pan-y;cursor:pointer;',
          '  outline:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}',
          '.dl:focus-visible{border-radius:20px;box-shadow:0 0 0 3px rgba(100,181,255,0.8)}',
          '.dl svg{display:block;width:100%;height:auto;overflow:visible}',
          '.dl .trk{fill:none;stroke:rgba(255,255,255,.13);stroke-width:22px;stroke-linecap:round}',
          '.dl .bnd{fill:none;stroke-width:22px;stroke-linecap:round}',
          '.dl .kn{fill:#fff;stroke:rgba(0,0,0,.18);stroke-width:1px}',
          '.dl .cur{fill:rgba(255,255,255,.92)}',
          '.dl .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}',
          '.dl .l{font-size:11px;font-weight:730;letter-spacing:1.1px;text-transform:uppercase;color:rgba(255,255,255,.52)}',
          '.dl .t{font-size:var(--hk-tstat-val,46px);font-weight:600;letter-spacing:-2px;line-height:1.04;',
          '  font-variant-numeric:tabular-nums;margin-top:2px}',
          '.dl .r{font-size:13px;font-weight:680;margin-top:4px;color:#ff9f0a}',
          '.dl.off .r{color:rgba(255,255,255,.55)}',
          // the modes: the thermostat's mode row (hk-control .tstat-modes
          // .segment). A label may take two lines -- "High demand" in a
          // quarter of the row -- rather than lose its end.
          '.acts,.pwr{align-self:stretch;display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:6px}',
          // + 2: the card's flex gap under its ring (.tstat{gap:2px})
          '.acts,.dl + .pwr{margin-top:calc(var(--hk-tstat-gap,14px) + 2px)}',
          '.acts button,.pwr button{height:var(--hk-tstat-seg,40px);border:0;border-radius:13px;background:rgba(255,255,255,.09);',
          '  color:rgba(255,255,255,.92);font:inherit;font-size:var(--hk-tstat-seg-font,12.5px);font-weight:680;line-height:1.15;',
          '  padding:0 4px;cursor:pointer;white-space:normal;overflow:hidden;display:flex;align-items:center;justify-content:center;',
          '  gap:6px;-webkit-tap-highlight-color:transparent}',
          '.acts button.sel,.pwr button.sel{background:rgba(255,255,255,.96);color:rgba(0,0,0,.88)}',
          '.acts .menu{justify-content:space-between;padding:0 14px}',
          // THE POWER, ITS OWN ROW, AS WIDE AS THE MODES: where the
          // thermostat has its fan row, and sized as that row
          '.acts + .pwr{margin-top:calc(var(--hk-tstat-fan-gap,6px) + 2px)}',
          '.pwr button{height:var(--hk-tstat-fan,32px);border-radius:11px;font-size:var(--hk-tstat-fan-font,11.5px);font-weight:640}',
          // the tank now and its day's low and high (the thermostat's reading card)
          '.now{align-self:stretch;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;',
          '  padding:12px 18px;border-radius:20px;background:rgba(255,255,255,0.08);text-align:center}',
          '.now .k{font-size:13px;color:rgba(235,235,245,0.6)}',
          '.now .v{font-size:19px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}',
          '.away{align-self:stretch;justify-content:space-between;padding:0 12px 0 20px}',
          '.sw{width:51px;height:31px;border-radius:16px;background:rgba(255,255,255,0.22);position:relative;flex-shrink:0;transition:background .2s}',
          '.sw i{position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;transition:left .2s}',
          '.sw.on{background:#30d158}.sw.on i{left:22px}',
          '.trend{align-self:stretch;padding:12px 16px 8px;border-radius:20px;background:rgba(255,255,255,0.08)}',
          '.trend .tt2{font-size:13px;font-weight:600;letter-spacing:.2px;color:rgba(235,235,245,0.55);text-transform:uppercase;margin-bottom:6px}',
          '@media (max-width:600px){.now{padding:12px 14px;gap:8px}.now .v{font-size:17px}}',
          // WIDE: the thermostat's two columns -- see ClimatePanel
          ':host([wide]) .pn{flex-direction:row;align-items:stretch;gap:28px}',
          ':host([wide]) .dial{' + TSTAT_WIDE + '}',
          ':host([wide]) .side{display:flex;flex-direction:column;gap:14px;flex:1;min-width:0}',
          ':host([wide]) .now{padding:14px 18px}',
          ':host([wide]) .trend{flex:1;display:flex;flex-direction:column;padding:16px 18px 14px;min-height:0}',
          ':host([wide]) .trend .axc{flex:1;min-height:72px;margin-top:8px}',
          ':host([wide]) .trend .tt2{margin-bottom:0}'
        ].join('');
      }
      hkWidthKind() { return 'water_heater'; }
      _wideAt() { return 700; }
      _onWide() { this._tankKey = null; this._paintTank(); this._alignTop(); }
      _go(v) { this._view = v; this._built = false; this._render(); }
      _range(s) {
        var a = s.attributes || {};
        var unit = (this._hass && this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.temperature) || '°F';
        var lo = num(a.min_temp), hi = num(a.max_temp);
        if (lo == null) lo = /C/.test(unit) ? 30 : 90;
        if (hi == null || hi <= lo) hi = /C/.test(unit) ? 70 : 150;
        return { lo: lo, hi: hi, step: num(a.target_temp_step) || (/C/.test(unit) ? 0.5 : 1) };
      }
      _render() {
        var s = this._stateObj, self = this;
        if (!s) return;
        var a = s.attributes || {}, f = num(a.supported_features) || 0;
        // "off" is the power, not a mode: it leaves the mode row for the power
        // button (the heater's own turn_off where it has one)
        var all = (a.operation_list || []).slice();
        var hasOff = all.indexOf('off') !== -1;
        var modes = all.filter(function (m) { return m !== 'off'; });
        var power = !!(f & WF.ONOFF) || hasOff;
        if (!this._built) {
          this._built = true;
          if (this._view === 'modes') {
            this._root.innerHTML = '<div class="pn"><div class="sub"><div class="bk"><button aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BACK + '"/></svg></button><div class="t">Mode</div></div></div></div>';
            this._root.querySelector('.bk button').addEventListener('click', function () { self._go('main'); });
            this._paintModes = pickList(this._root.querySelector('.sub'), modes, function (m) {
              self._svc('water_heater', 'set_operation_mode', { operation_mode: m });
              self._go('main');
            }, 'modes');
          } else {
            this._paintModes = null;
            // what the heater has decides what is built: up to four modes as
            // the row, more as the pick list, away mode only where it exists
            var segMode = (f & WF.MODE) && modes.length && modes.length <= 4;
            var menuMode = (f & WF.MODE) && modes.length > 4;
            this._root.innerHTML = '<div class="pn"><div class="dial">' +
              '<div class="dl" role="slider" tabindex="0" aria-label="Target temperature">' +
              '<svg viewBox="0 0 ' + WD.W + ' ' + WD.H + '" aria-hidden="true">' +
              '<defs class="gd"></defs>' +
              '<path class="trk" d="' + arcPath(1) + '"/><path class="bnd" stroke="url(#whg)" d=""/>' +
              '<circle class="cur" r="4" cx="0" cy="0"/><circle class="kn" r="13" cx="0" cy="0"/></svg>' +
              '<div class="c"><div class="l">Heat to</div><div class="t"></div><div class="r"></div></div></div>' +
              (segMode ? '<div class="acts" style="--n:' + modes.length + '">' +
                modes.map(function (m) { return '<button class="seg-m" data-m="' + esc(m) + '">' + esc(whWord(m)) + '</button>'; }).join('') + '</div>' : '') +
              (menuMode ? '<div class="acts" style="--n:1"><button class="menu mode"><span>Mode</span><span class="cur"></span></button></div>' : '') +
              (power ? '<div class="pwr" style="--n:1"><button class="pw" aria-label="Power">' + glyph('mdi:power', 18) + '<span class="pwl"></span></button></div>' : '') +
              '</div><div class="side">' +
              '<div class="now"><div><div class="k">Tank now</div><div class="v tn">—</div></div>' +
              '<div><div class="k">Lowest</div><div class="v tl">—</div></div>' +
              '<div><div class="k">Highest</div><div class="v th">—</div></div></div>' +
              ((f & WF.AWAY) ? '<button class="btn away" role="switch"><span>Away mode</span><span class="sw"><i></i></span></button>' : '') +
              '<div class="trend" hidden></div></div></div>';
            this._dl = this._root.querySelector('.dl');
            this._wire();
            this._seg = segMode ? this._root.querySelector('.acts') : null;
            this._mode = menuMode ? this._root.querySelector('.mode') : null;
            this._away = (f & WF.AWAY) ? this._root.querySelector('.away') : null;
            this._pw = power ? this._root.querySelector('.pw') : null;
            if (this._pw) this._pw.addEventListener('click', function () {
              var st = self._stateObj, ff = num(at(st, 'supported_features')) || 0, isOff = st.state === 'off';
              if (ff & WF.ONOFF) { self._svc('water_heater', isOff ? 'turn_on' : 'turn_off'); return; }
              // no on/off service: "off" is a mode; on is the last mode it ran in
              var back = self._lastMode || (at(st, 'operation_list') || []).filter(function (m) { return m !== 'off'; })[0];
              self._svc('water_heater', 'set_operation_mode', { operation_mode: isOff ? back : 'off' });
            });
            if (this._seg) this._seg.querySelectorAll('[data-m]').forEach(function (b) {
              b.addEventListener('click', function () { self._svc('water_heater', 'set_operation_mode', { operation_mode: b.getAttribute('data-m') }); });
            });
            if (this._mode) this._mode.addEventListener('click', function () { self._go('modes'); });
            if (this._away) this._away.addEventListener('click', function () {
              self._svc('water_heater', 'set_away_mode', { away_mode: at(self._stateObj, 'away_mode') !== 'on' });
            });
            this._trend = this._root.querySelector('.trend');
            this._runAt = 0; this._tankKey = null;
          }
        }
        var na = this._na(s);
        if (this._paintModes) { this._paintModes(a.operation_mode || s.state); return; }
        var cur = num(a.current_temperature), off = s.state === 'off';
        this._dl.classList.toggle('off', off);
        if (!this._drag) this._paintDial(num(a.temperature));
        var om = a.operation_mode || s.state;
        if (om && om !== 'off') this._lastMode = om;
        // the face's third line is the thermostat's "Cooling": what it is doing
        this._root.querySelector('.r').textContent = na ? 'Unavailable' : off ? 'Off' : whWord(om || 'on');
        this._root.querySelector('.tn').textContent = na || cur == null ? '—' : Math.round(cur) + '°';
        if (this._seg) this._seg.querySelectorAll('[data-m]').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-m') === om); });
        if (this._pw) {
          this._pw.classList.toggle('sel', !off);
          this._pw.setAttribute('aria-pressed', off ? 'false' : 'true');
          // the humidifier's wide power button says what a tap does
          this._pw.querySelector('.pwl').textContent = off ? 'Turn On' : 'Turn Off';
        }
        if (this._mode) this._mode.querySelector('.cur').innerHTML = esc(whWord(om || '')) + CHEV;
        if (this._away) {
          var aw = at(s, 'away_mode') === 'on';
          this._away.querySelector('.sw').classList.toggle('on', aw);
          this._away.setAttribute('aria-checked', aw ? 'true' : 'false');
        }
        this._alignTop();
        this._tank();
      }
      // the band from the bottom of the scale to the setpoint, cold to warm,
      // the knob on the setpoint, the dot at the tank -- hk-control _climate
      _paintDial(t) {
        var s = this._stateObj, r = this._range(s), off = s.state === 'off';
        var fr = t == null ? 0 : clamp((t - r.lo) / (r.hi - r.lo), 0, 1);
        var p0 = arcPoint(WD.A0), p = arcPoint(WD.A0 + WD.SWEEP * fr);
        var c0 = off ? 'rgba(255,255,255,.30)' : '#32ade6', c1 = off ? 'rgba(255,255,255,.30)' : '#ff9f0a';
        this._dl.querySelector('.gd').innerHTML = '<linearGradient id="whg" gradientUnits="userSpaceOnUse" x1="' + p0[0].toFixed(2) +
          '" y1="' + p0[1].toFixed(2) + '" x2="' + p[0].toFixed(2) + '" y2="' + p[1].toFixed(2) + '">' +
          '<stop offset="0" stop-color="' + c0 + '"/><stop offset="1" stop-color="' + c1 + '"/></linearGradient>';
        this._dl.querySelector('.bnd').setAttribute('d', fr > 0.001 ? arcPath(fr) : '');
        var k = this._dl.querySelector('.kn');
        k.setAttribute('cx', p[0].toFixed(2)); k.setAttribute('cy', p[1].toFixed(2));
        k.style.display = t == null || off ? 'none' : '';
        var cur = num(at(s, 'current_temperature')), d = this._dl.querySelector('.cur');
        d.style.display = cur == null ? 'none' : '';
        if (cur != null) {
          var q = arcPoint(WD.A0 + WD.SWEEP * clamp((cur - r.lo) / (r.hi - r.lo), 0, 1));
          d.setAttribute('cx', q[0].toFixed(2)); d.setAttribute('cy', q[1].toFixed(2));
        }
        this._dl.querySelector('.t').textContent = t == null ? '—' : (r.step < 1 ? t.toFixed(1) : Math.round(t)) + '°';
        this._dl.setAttribute('aria-valuenow', t == null ? '' : String(t));
      }
      // THE RIGHT COLUMN STARTS WHERE THE RING IS SEEN TO START -- the track's
      // top, y = 100 - 78 - 11 of the 172 box (as ClimatePanel._alignTop)
      _alignTop() {
        var side = this._root.querySelector('.side'), dial = this._root.querySelector('.dial');
        if (!side || !side.style || !dial) return;
        var svg = this._dl && this._dl.querySelector('svg');
        if (!this.hasAttribute('wide') || !svg || !svg.getBoundingClientRect) { side.style.marginTop = ''; return; }
        var rr = svg.getBoundingClientRect(), dr = dial.getBoundingClientRect();
        if (!rr.height) return;
        side.style.marginTop = Math.max(0, Math.round(rr.top - dr.top + rr.height * (WD.CY - WD.R - 11) / WD.H)) + 'px';
      }
      // THE THERMOSTAT RING'S GESTURE (hk-control _bind), because the phone
      // sheet scrolls and the dial must not take every touch. pan-y hands
      // a vertical swipe that starts on the dial to the sheet; nothing is
      // painted until the finger has moved SLOP px, so brushing it while
      // scrolling does not jump the number; the browser reports "that was a
      // scroll" by CANCELLING the pointer, which puts the dial back; a tap
      // that does not travel sets that point on lift. The heater hears the
      // value once, on release. Arrow keys unchanged.
      _wire() {
        var self = this, dl = this._dl;
        var send = throttle(function (t) { self._svc('water_heater', 'set_temperature', { temperature: t }); }, 500);
        var valueAt = function (e) {
          var b = dl.getBoundingClientRect(), sx = WD.W / b.width, sy = WD.H / b.height;
          var x = (e.clientX - b.left) * sx - WD.CX, y = (e.clientY - b.top) * sy - WD.CY;
          var deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
          var rel = (deg - WD.A0 + 360) % 360;
          if (rel > WD.SWEEP) rel = rel > (WD.SWEEP + 360) / 2 ? 0 : WD.SWEEP;
          var r = self._range(self._stateObj);
          var t = r.lo + rel / WD.SWEEP * (r.hi - r.lo);
          return clamp(Math.round(t / r.step) * r.step, r.lo, r.hi);
        };
        var ok = function () { var st = self._stateObj; return st && !unavailable(st) && st.state !== 'off' && ((num(at(st, 'supported_features')) || 0) & WF.TARGET); };
        var SLOP = 6, armed = null;
        var restore = function () { self._paintDial(num(at(self._stateObj, 'temperature'))); };
        dl.addEventListener('pointerdown', function (e) {
          if (!ok()) return;
          try { dl.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
          // armed, not grabbed: no paint yet
          armed = { x: e.clientX, y: e.clientY, t: valueAt(e) };
        });
        dl.addEventListener('pointermove', function (e) {
          if (armed && !self._drag) {
            var dx = e.clientX - armed.x, dy = e.clientY - armed.y;
            if (dx * dx + dy * dy <= SLOP * SLOP) return;     // not yet a drag
            self._drag = true;
          }
          if (!self._drag) return;
          self._paintDial(valueAt(e));
        });
        dl.addEventListener('pointerup', function (e) {
          if (!armed && !self._drag) return;
          try { dl.releasePointerCapture(e.pointerId); } catch (x) { /* ok */ }
          // a drag lands where it ended; a tap that did not travel, where it was
          var t = self._drag ? valueAt(e) : armed.t;
          self._drag = false; armed = null;
          self._paintDial(t);
          self._svc('water_heater', 'set_temperature', { temperature: t });
        });
        // the sheet took it for a scroll: forget it and show the real setpoint
        dl.addEventListener('pointercancel', function (e) {
          try { dl.releasePointerCapture(e.pointerId); } catch (x) { /* ok */ }
          var was = self._drag || armed;
          self._drag = false; armed = null;
          if (was) restore();
        });
        dl.addEventListener('keydown', function (e) {
          if (!ok()) return;
          var r = self._range(self._stateObj), cur = num(at(self._stateObj, 'temperature'));
          if (cur == null) cur = r.lo;
          var d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? r.step : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -r.step : 0;
          if (!d) return;
          e.preventDefault();
          var t = clamp(cur + d, r.lo, r.hi);
          self._paintDial(t); send(t);
        });
      }
      // the tank's last day, from the heater's own history (current_temperature)
      _tank() {
        var self = this, h = this._hass, id = this._id, now = Date.now();
        if (!this._trend) return;
        if (h && h.callWS && (!this._runAt || now - this._runAt > 300000)) {
          this._runAt = now;
          h.callWS({ type: 'history/history_during_period', start_time: new Date(now - 24 * 3600000).toISOString(), entity_ids: [id],
                     minimal_response: false, no_attributes: false, significant_changes_only: false })
            .then(function (r) { self._rows = (r && r[id]) || []; self._paintTank(); }, function () { self._runAt = 0; });
        }
        this._paintTank();
      }
      _paintTank() {
        if (!this._rows || !this._trend) return;
        var pts = trendOf(this._rows, Date.now(), this._stateObj);
        var vs = pts.map(function (p) { return p.v; }).filter(function (v) { return v != null; });
        var lo = this._root.querySelector('.tl'), hi = this._root.querySelector('.th');
        if (lo && vs.length) {
          lo.textContent = Math.round(Math.min.apply(null, vs)) + '°';
          hi.textContent = Math.round(Math.max.apply(null, vs)) + '°';
        }
        if (pts.length < 2) return;
        // redrawn when the rows or the reading move, or the width changes
        var key = this._rows.length + '|' + at(this._stateObj, 'current_temperature');
        if (key === this._tankKey) return;
        this._tankKey = key;
        var wide = this.hasAttribute('wide'), phone = matchMedia('(max-width:600px)').matches;
        this._trend.hidden = false;
        this._trend.innerHTML = '<div class="tt2">Tank, last 24 hours</div>' +
          axesChart({ pts: downsample(pts, 240), H: wide ? 120 : 70, unit: '°', ms: 24 * 3600000, n: phone ? 3 : 5,
                      colour: 'orange', fluid: wide });
      }
    }

    // ------------------------------------------------------------ alarm
    // JUST THE KEYPAD, in the sheet: the state as the word every sheet leads
    // with, and the home's own keypad card under it -- the same card the
    // Security page shows, so the code path cannot drift. Locks and a
    // status block belong on the Security page, not in the alarm's sheet.
    var ALARM_WORDS = { disarmed: 'Disarmed', armed_home: 'Armed Home', armed_away: 'Armed Away', armed_night: 'Armed Night',
                        armed_vacation: 'Armed Vacation', armed_custom_bypass: 'Armed', arming: 'Arming…',
                        disarming: 'Disarming…', pending: 'Pending…', triggered: 'Triggered' };
    class AlarmPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          '.pn{align-items:stretch;gap:20px}',
          '.big.al{font-size:40px;align-self:center;display:flex;align-items:center;gap:12px}',
          '.big.al.trg{color:#ff453a}',
          // the shield the Security page's keypad shows at rest, in its colour
          '.big.al ha-icon{--mdc-icon-size:36px;width:36px;height:36px;display:flex;flex:none}',
          'hk-alarm-keypad-card{display:block}',
          '@media (max-width:600px){.big.al{font-size:34px}}'
        ].join('');
      }
      hkWidthKind() { return 'alarm'; }
      _render() {
        var s = this._stateObj;
        if (!s) return;
        if (!this._built) {
          this._built = true;
          this._root.innerHTML = '<div class="pn"><div class="big al"><ha-icon></ha-icon><span></span></div></div>';
          this._big = this._root.querySelector('.big');
          this._bigIcon = this._big.querySelector('ha-icon');
          this._bigWord = this._big.querySelector('span');
          var card = document.createElement('hk-alarm-keypad-card');
          // glass: false -- the sheet is its own blur (as every panel).
          // status: false -- the sheet leads with the state word already, so
          // its readout stays the code line rather than saying it twice.
          try { card.setConfig({ entity: this._id, glass: false, status: false }); } catch (e) { /* not ready */ }
          this._root.querySelector('.pn').appendChild(card);
          this._card = card;
        }
        if (this._card) this._card.hass = this._hass;
        var st = s.state;
        (this._bigWord || this._big).textContent = unavailable(s) ? 'Unavailable' : ALARM_WORDS[st] || pretty(st);
        this._big.classList.toggle('trg', st === 'triggered');
        var K = customElements.get('hk-alarm-keypad-card');
        if (this._bigIcon && K && K.status) {
          var look = K.status(s);
          if (this._bigIcon.getAttribute('icon') !== look.icon) this._bigIcon.setAttribute('icon', look.icon);
          this._bigIcon.style.color = look.color;
        }
      }
    }

    // ------------------------------------------------------------ a camera
    // THE CAMERA SHEET: what every camera tap opens -- a tile on the Cameras
    // page, a room page's camera, the strip's stills and live tile -- in
    // place of HA's dialog, which on these dashboards is either a plain
    // dialog or, under a finger, nothing at all. It is a camera pop-up as a
    // sheet: hk-doorbell-card, which runs its own stream WITH sound, at the
    // camera's own shape, with hold-to-talk where the camera has a speaker.
    // A stream channel is chosen up: a strip shows the LOW resolution
    // channel, the sheet the HIGH one of the same device when there is one.
    function cameraStream(h, id) {
      var ents = (h && h.entities) || {}, e = ents[id], dev = e && e.device_id;
      if (!dev) return id;
      var hi = Object.keys(ents).filter(function (k) {
        return k.indexOf('camera.') === 0 && ents[k].device_id === dev && /high/.test(k) &&
               h.states[k] && h.states[k].state !== 'unavailable';
      }).sort()[0];
      return hi || id;
    }
    function cameraSpeaker(h, id) {
      var ents = (h && h.entities) || {}, e = ents[id], dev = e && e.device_id;
      if (!dev) return null;
      return Object.keys(ents).filter(function (k) {
        return k.indexOf('media_player.') === 0 && ents[k].device_id === dev && /speaker/.test(k);
      }).sort()[0] || null;
    }
    function cameraName(h, id) {
      var ents = (h && h.entities) || {}, devs = (h && h.devices) || {}, e = ents[id] || {};
      var dv = e.device_id && devs[e.device_id];
      var n = (dv && (dv.name_by_user || dv.name)) || at(stOf(h, id), 'friendly_name') || id;
      return String(n).replace(/\s+(low|medium|high)\s+resolution\s+channel$/i, '')
                      .replace(/\s+camera$/i, '') || n;
    }
    class CameraPanel extends Panel {
      static get CSS() {
        return PANEL_CSS + [
          // the pop-ups' corners, reaching the picture through the card
          ':host{display:block;border-radius:30px}',
          // never taller than the screen less 16 a side: the sheet is the
          // picture and nothing else
          ':host{--hk-db-max:calc(var(--hk-vh, 100dvh) - 32px)}',
          '.cam{border-radius:inherit}',
          '.na{aspect-ratio:16/9;border-radius:inherit;background:rgba(255,255,255,0.06);display:flex;flex-direction:column;',
          '  align-items:center;justify-content:center;gap:14px;color:rgba(235,235,245,0.62);font-size:17px;font-weight:600}'
        ].join('');
      }
      hkWidthKind() { return 'camera'; }
      hkAutoHeight() { return true; }
      hkBare() { return true; }
      hkTitle(h) { return cameraName(h, this._id); }
      // AN UNAVAILABLE CAMERA IS SAID, NOT BLACK: the stream card over a camera
      // that is gone would draw an empty black sheet. The signature follows
      // only that, so the card is built the moment the camera comes back.
      _streamOf(h) {
        var pc = (this._config && this._config.src && this._config.src.popup) || {};
        return pc.stream || cameraStream(h, this._id);
      }
      _gone(h) { var st = h && h.states[this._streamOf(h)]; return !st || st.state === 'unavailable'; }
      _sigOf() { return this._hass ? 'camera|' + this._gone(this._hass) : null; }
      // THE SHEET TAKES THE CAMERA'S SHAPE: the pop-ups' sizes, a picture
      // about 750 tall at most 1200 wide -- the doorbell (4:3) 1000 x 750, a
      // 16:9 camera 1200 x 675. A camera with a speaker is the doorbell, so
      // it starts at 4:3; the still, once loaded, has the last word.
      _shape(ar) {
        var sh = this.hkSheet && this.hkSheet.sheet;
        if (!sh || !(ar > 0)) return;
        sh.style.setProperty('--hkd-ar', String(ar));
        sh.style.setProperty('--hkd-w', Math.min(1200, Math.round(750 * ar)) + 'px');
      }
      _render() {
        var h = this._hass;
        if (!h) return;
        // _naEl, not _na: Panel._na(s) is the shared unavailable helper, and a
        // property of that name would replace it (see HkBase method shadowing)
        if (this._gone(h)) {
          // THE CAMERA WENT AWAY WHILE ITS SHEET WAS OPEN: its stream card goes
          // too (its detach stops the stream and its retries), or the dead video
          // and the message stacked, and the sheet grew by a picture. It is
          // built again when the camera comes back.
          if (this._card) {
            if (this._card.parentNode) this._card.parentNode.removeChild(this._card);
            this._card = null;
          }
          if (!this._naEl) {
            this._shape(16 / 9);
            this._naEl = document.createElement('div');
            this._naEl.className = 'na';
            this._naEl.innerHTML = glyph('hk:camera', 56) + '<div>' + esc(cameraName(h, this._id)) + ' is unavailable</div>';
            this._root.appendChild(this._naEl);
          }
          return;
        }
        if (this._naEl) { if (this._naEl.parentNode) this._naEl.parentNode.removeChild(this._naEl); this._naEl = null; }
        if (!this._card) {
          // a pop-up's own (Pop-ups: talk-back speaker, full-resolution
          // picture), else what the camera's device has
          var pc = (this._config && this._config.src && this._config.src.popup) || {};
          var stream = pc.stream || cameraStream(h, this._id);
          var sp = pc.speaker || cameraSpeaker(h, this._id);
          var cfg = { type: 'custom:hk-doorbell-card', entity: stream, volume: true,
                      aspect_ratio: 'auto', glass: false };
          // as the camera pop-ups: a camera is captioned with its name, the
          // doorbell (the camera that talks) is not
          if (sp) cfg.speaker = sp; else cfg.name = cameraName(h, this._id);
          this._shape(sp ? 4 / 3 : 16 / 9);
          var self = this, st = h.states[stream];
          var pic = st && st.attributes && !C.stale(st) && st.attributes.entity_picture;
          if (pic) {
            var probe = new Image();
            probe.onload = function () {
              if (probe.naturalWidth && probe.naturalHeight) self._shape(probe.naturalWidth / probe.naturalHeight);
            };
            // ONLY THE SHAPE IS WANTED: a small still keeps the camera's
            // aspect (HA scales to cover, both dimensions or none -- see
            // hk-cameras.js), where the bare URL would fetch the high channel's
            // full 3840x2160 frame, ~1.8 MB, on every camera sheet.
            probe.src = pic + (pic.indexOf('?') < 0 ? '?' : '&') + 'width=320&height=180';
          }
          this._card = C.create(cfg);
          if (this._card) {
            this._card.classList.add('cam');
            this._card.style.borderRadius = 'inherit';
            this._card.style.display = 'block';
            this._root.appendChild(this._card);
          }
        }
        if (this._card && this._card.hkSetHass) this._card.hkSetHass(h);
      }
    }

    // ------------------------------------------------------------ registry
    // kind (kindOf) -> element
    var PANELS = {
      light: 'hk-detail-light',
      toggle: 'hk-detail-toggle',
      fan: 'hk-detail-fan',
      cover: 'hk-detail-cover',
      cover_buttons: 'hk-detail-cover', garage: 'hk-detail-garage',
      vacuum: 'hk-detail-vacuum', valve: 'hk-detail-valve', number: 'hk-detail-number',
      select: 'hk-detail-select', humidifier: 'hk-detail-humidifier', water_heater: 'hk-detail-water-heater',
      lock: 'hk-detail-lock',
      climate: 'hk-detail-climate',
      media: 'hk-detail-media',
      sensor: 'hk-detail-sensor',
      state: 'hk-detail-state',
      binary: 'hk-detail-binary',
      alarm: 'hk-detail-alarm',
      camera: 'hk-detail-camera',
      group: 'hk-detail-group',
      cards: 'hk-detail-cards'
    };
    function def(tag, Ctor) { if (!customElements.get(tag)) customElements.define(tag, Ctor); }
    def('hk-detail-light', LightPanel);
    def('hk-detail-toggle', TogglePanel);
    def('hk-detail-fan', FanPanel);
    def('hk-detail-cover', CoverPanel);
    def('hk-detail-lock', LockPanel);
    def('hk-detail-garage', GaragePanel);
    def('hk-detail-climate', ClimatePanel);
    def('hk-detail-media', MediaPanel);
    def('hk-detail-sensor', SensorPanel);
    def('hk-detail-state', StatePanel);
    def('hk-detail-binary', BinaryPanel);
    def('hk-detail-vacuum', VacuumPanel);
    def('hk-detail-valve', ValvePanel);
    def('hk-detail-number', NumberPanel);
    def('hk-detail-select', SelectPanel);
    def('hk-detail-humidifier', HumidifierPanel);
    def('hk-detail-water-heater', WaterHeaterPanel);
    def('hk-detail-alarm', AlarmPanel);
    def('hk-detail-camera', CameraPanel);

    // ------------------------------------------------------------ a group
    // A ROOM'S "3 WINDOWS" (hk-room.js): the sheet every device gets, holding
    // those devices as the dashboard's own tiles, two to a row. A tile's name
    // opens that device's sheet in place of this one, as any sheet opened
    // from a sheet does. Tiles come from the generated dashboard's builder
    // where it has one for the kind (a fan is a fan tile), else a sensor tile
    // that reads its own state.
    var SENSOR_TILE = {
      windows: { icon: 'hk:window-closed-variant', on: 'hk:window-open-variant', label: 'open_closed' },
      doors: { icon: 'hk:door-closed', on: 'hk:door-open', label: 'open_closed' },
      garage: { icon: 'hk:garage', on: 'hk:garage-open', label: 'open_closed' },
      motion: { icon: 'hk:motion-sensor', label: 'state' },
      occupancy: { icon: 'hk:walk', label: 'state' },
      leaks: { icon: 'hk:water', on: 'hk:water-alert', label: 'state' }
    };
    function groupTile(h, id, room, kind) {
      var st = stOf(h, id), full = at(st, 'friendly_name') || id, S = window.hkStrategy;
      // the accessory's own name (its gear), as on every other page
      var name = accName(id) || (S && S.shortName ? S.shortName(full, room) : full);
      var d = domainOf(id);
      if (d !== 'binary_sensor' && d !== 'sensor' && S && S.tileFor) {
        var t = S.tileFor(h, id, name);
        if (t) { t = Object.assign({}, t); delete t.view_layout; return t; }
      }
      var k = SENSOR_TILE[kind] || { icon: 'mdi:eye', label: 'state' };
      var closed = k.icon, opened = k.on;
      // a door, window or garage sensor's own glyph (its gear), as its pair
      if (opened && S && S.contactGlyphs) { var g = S.contactGlyphs(id, opened, closed); opened = g[0]; closed = g[1]; }
      var cfg = { type: 'custom:hk-tile-card', entity: id, name: name, icon: closed,
                  icon_color: 'blue', label_mode: k.label };
      if (opened && opened !== closed) cfg.icon_states = { on: opened };
      return cfg;
    }
    class GroupPanel extends HkBase {
      static get CSS() {
        // A sheet is the same 460 px on an iPad as on a desk, so its two
        // columns keep the full pill (--hk-pill is 165 there on the page).
        // No cell bleed: a phone tile is its cell PLUS 8 px, for the 4 px
        // margins layout-card gives a page's cells (hk-tile.js) -- this grid
        // has none, so each pill would run 8 px into the gap and the right
        // column would be cut off at the sheet's edge on a phone.
        return ':host{display:block;--hk-pill:192px;--hk-cell-bleed:0px}' +
          '.grp{display:grid;grid-template-columns:repeat(2,192px);grid-auto-rows:70px;gap:12px;' +
          '  justify-content:center;align-content:start;padding:2px 0 8px}' +
          '@media (max-width:600px){.grp{grid-template-columns:repeat(2,minmax(0,1fr))}}';
      }
      hkWidthKind() { return 'group'; }
      hkFill() { return true; }
      _sigOf() { return null; }
      _render() {
        var h = this._hass, cfg = this._config || {};
        if (!h) return;
        if (!this._built) {
          this._built = true;
          var grid = document.createElement('div');
          grid.className = 'grp';
          this._kids = (cfg.entities || []).map(function (id) {
            var el = C.create(groupTile(h, id, cfg.room, cfg.groupKind));
            if (el) grid.appendChild(el);
            return el;
          }).filter(Boolean);
          this._root.innerHTML = '';
          this._root.appendChild(grid);
        }
        (this._kids || []).forEach(function (el) { if (el.hkSetHass) el.hkSetHass(h); else el.hass = h; });
      }
    }
    def('hk-detail-group', GroupPanel);
    // A CUSTOM POP-UP'S CARDS (Pop-ups -> Custom): any cards, in
    // a column, built by Home Assistant's own card helpers (a core card or a
    // custom one), fed hass while the sheet is up. A card that cannot be
    // built is HA's error card, in its place.
    class CardsPanel extends HkBase {
      static get CSS() {
        return ':host{display:block}' +
          '.cards{display:flex;flex-direction:column;gap:12px;padding:2px 0 8px}' +
          '.none{color:rgba(235,235,245,.6);font-size:15px;text-align:center;padding:40px 12px}';
      }
      hkWidthKind() { return (this._config || {}).width === 'wide' ? 'cards_wide' : 'cards'; }
      hkFill() { return true; }
      _sigOf() { return null; }
      _render() {
        var h = this._hass, cfg = this._config || {}, self = this;
        if (!h) return;
        if (!this._built) {
          this._built = true;
          this._kids = [];
          var box = document.createElement('div');
          box.className = 'cards';
          this._root.innerHTML = '';
          this._root.appendChild(box);
          var list = Array.isArray(cfg.cards) ? cfg.cards : [];
          if (!list.length) {
            box.innerHTML = '<div class="none">No cards yet.</div>';
          } else if (typeof window.loadCardHelpers === 'function') {
            window.loadCardHelpers().then(function (helpers) {
              list.forEach(function (cc) {
                var el;
                try { el = helpers.createCardElement(cc); } catch (e) {
                  el = helpers.createCardElement({ type: 'error', error: String(e && e.message || e), origConfig: cc });
                }
                el.hass = self._hass;
                box.appendChild(el);
                self._kids.push(el);
              });
            }, function (e) { console.error('[hk-detail] custom pop-up: no card helpers', e); });
          }
        }
        (this._kids || []).forEach(function (el) { el.hass = h; });
      }
    }
    def('hk-detail-cards', CardsPanel);
    // openGroup(title, ids, { icon, room, kind, color })
    function openGroup(title, ids, o, extra) {
      o = o || {};
      if (!ids || !ids.length) return false;
      return open(null, { name: title, icon: o.icon, icon_color: o.color || 'rgba(255,255,255,0.92)' },
                  Object.assign({ group: { ids: ids.slice(), room: o.room || '', kind: o.kind || '' } }, extra || {}));
    }

    // ================================================================ POP-UPS
    // THE HOME'S POP-UPS (Pop-ups in HK Settings): a hash
    // on any dashboard's address -- `#doorbell` -- opens its sheet, which is
    // how an automation that loads `<dashboard>/0#doorbell` on a tablet shows
    // it. A YAML hk-popup-card on the page that claims the same hash wins (it
    // is mounted by then: the look waits GRACE_MS for a page's cards). And
    // hk_frontend.show_popup (the settings module's events) sets the hash on
    // the screens it asks.
    var POPUP_GRACE_MS = 700;
    function popupsNow() {
      var HS = window.hkSettings;
      return (HS && HS.get('popups', null)) || [];
    }
    function popupFor(hash) {
      var dash = dashNow();
      var name = String(hash || '').replace(/^#/, '');
      // this dashboard's gear -> Screen -> Answer pop-ups
      var b = C.menu && typeof C.menu.board === 'function' ? C.menu.board() : null;
      if (b && b.popups === false) return null;
      return popupsNow().filter(function (p) {
        return p && p.hash === name && (!p.dashboards || !p.dashboards.length || p.dashboards.indexOf(dash) >= 0);
      })[0] || null;
    }
    // does a pop-up item answer this hash on this dashboard? (hk-popup.js asks,
    // so the now-playing bar never takes the hash from one)
    function answers(hash) { return !!popupFor(hash); }
    function yamlClaims(hash) {
      var P = window.hkPopup;
      return !!(P && typeof P.hashes === 'function' && P.hashes().indexOf(hash) >= 0);
    }
    // opens the pop-up for `hash` here (true), or says why not (false)
    function openPopup(hash) {
      var p = popupFor(hash);
      if (!p || yamlClaims(hash)) return false;
      if (D.el && D.popup === p.hash) return true;          // already up
      var h = C.hass();
      var clear = function () {
        // closed by hand or by time: the hash goes, so nothing reopens it
        if (location.hash === hash) {
          try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ok */ }
        }
      };
      var o = { hashed: true, onClose: clear, autoClose: (p.close_after || 60) * 1000 };
      var ok = false;
      if (p.kind === 'camera' && p.entity) {
        ok = open(p.entity, { popup: p }, o);
      } else if (p.kind === 'alarm') {
        var alarm = p.entity || (window.hkSettings && window.hkSettings.get('security.alarm', null));
        ok = !!alarm && open(alarm, {}, Object.assign({ direct: true }, o));
      } else if (p.kind === 'accessories' && p.entities && p.entities.length) {
        ok = openGroup(p.name, p.entities.filter(function (e) { return h && h.states && h.states[e]; }), {}, o);
      } else if (p.kind === 'cards') {
        ok = open(null, { name: p.name || '#' + p.hash, icon: p.icon || 'mdi:card-text-outline', icon_color: 'rgba(255,255,255,0.92)' },
                  Object.assign({ cards: { cards: p.cards || [], width: p.width } }, o));
      }
      if (ok && D.el) D.popup = p.hash;
      return !!ok;
    }
    // ONLY ON A DASHBOARD: a show_popup, or a #hash, on one of Home
    // Assistant's own pages (Settings, the map) must not open the sheet
    // over it. A dashboard is a panel whose component is lovelace.
    function onDashboard() {
      var h = C.hass(), seg = String(location.pathname || '').split('/')[1] || '';
      var p = h && h.panels && h.panels[seg];
      return !!p && p.component_name === 'lovelace';
    }
    var routeT = null;
    function route() {
      clearTimeout(routeT);
      var hash = location.hash;
      if (!hash || hash.length < 2 || !onDashboard() || !popupFor(hash)) return;
      routeT = setTimeout(function () { if (location.hash === hash) openPopup(hash); }, POPUP_GRACE_MS);
    }
    ['location-changed', 'hashchange', 'popstate'].forEach(function (ev) {
      window.addEventListener(ev, route);
    });
    // the pop-ups can arrive after the page (a fresh load with #doorbell)
    (function wait() {
      if (window.hkSettings && window.hkSettings.onChange) { window.hkSettings.onChange(route); route(); }
      else setTimeout(wait, 200);
    })();
    // SHOW POP-UP (hk_frontend.show_popup): this screen, if it is one of those
    // asked -- on a listed dashboard (or any), signed in as a listed user (or
    // anyone) -- gets the hash, and the router above opens it.
    // A HIDDEN PAGE HOLDS IT: a browser tab in the background would take
    // every show_popup -- history entries and sheets nobody sees. But a
    // wall tablet whose screen is off reports hidden too, and the
    // doorbell must be up when the screen wakes. So a hidden page keeps the
    // newest request and opens it when it becomes visible, if the pop-up's
    // own Close after has not run out by then.
    var held = null;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !held) return;
      var h2 = held; held = null;
      if (Date.now() < h2.until) asked(h2.ev);
    });
    function asked(ev) {
      var e = ev && ev.detail;
      if (!e || e.type !== 'popup' || !e.popup) return false;
      if (!onDashboard()) return false;
      if (document.visibilityState === 'hidden') {
        var pp = popupFor('#' + e.popup);
        if (pp) held = { ev: ev, until: Date.now() + (pp.close_after || 60) * 1000 };
        return false;
      }
      var dash = dashNow(), h = C.hass();
      if (e.dashboards && e.dashboards.length && e.dashboards.indexOf(dash) < 0) return false;
      if (e.users && e.users.length && !(h && h.user && e.users.indexOf(h.user.id) >= 0)) return false;
      if (!popupFor('#' + e.popup)) return false;
      // ASKED AGAIN WHILE IT IS UP (the alarm automation re-shows it every
      // minute while the alarm lasts): nothing to navigate -- that would close
      // a keypad mid-code -- only its Close after runs again from now. And no
      // second history entry for the same hash, or Back does nothing once.
      var same = location.hash === '#' + e.popup;
      if (same && D.el && D.popup === e.popup) { armAuto(); return true; }
      try {
        history[same ? 'replaceState' : 'pushState'](history.state, '', location.pathname + location.search + '#' + e.popup);
        window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      } catch (err) { return false; }
      return true;
    }
    window.addEventListener('hk-house-event', asked);

    window.hkDetail = {
      version: '1.0.0',
      open: open,
      openGroup: openGroup,
      close: close,
      navigateFrom: navigateFrom,
      kindOf: kindOf,
      answers: answers,
      // the pieces later phases and the tests build on
      _: {
        runTimes: runTimes, dur: dur, niceTicks: niceTicks, tickText: tickText, timeTicks: timeTicks, arcPath: arcPath,
        STD: STD, WIDE: WIDE, SHEET_H: SHEET_H, PHONE_H: PHONE_H,
        Panel: Panel, PANELS: PANELS, PANEL_CSS: PANEL_CSS, WIDTH: WIDTH, def: def, stOf: stOf, at: at,
        num: num, clamp: clamp, isOn: isOn, unavailable: unavailable, throttle: throttle, glyph: glyph,
        lookOf: lookOf, lookFor: lookFor, headIcon: headIcon,
        esc: esc, CHEV: CHEV, BACK: BACK, fanSteps: fanSteps, fanLabel: fanLabel, fanGuard: fanGuard,
        downsample: downsample, kelvinRgb: kelvinRgb, lightCaps: lightCaps, defaultFavourites: defaultFavourites,
        favMatches: favMatches, fromDashboard: fromDashboard, sourceOf: sourceOf, colourName: colourName,
        nearWhite: nearWhite, spanTo: spanTo, trendOf: trendOf, reportsAction: reportsAction,
        accessoryPane: accessoryPane, accName: accName, accIcon: accIcon, canEdit: canEdit, glyphsFor: glyphsFor, ACC_CSS: ACC_CSS,
        popupFor: popupFor, openPopup: openPopup, route: route, asked: asked, onDashboard: onDashboard,
        state: function () { return D; }
      }
    };
  });
})();
