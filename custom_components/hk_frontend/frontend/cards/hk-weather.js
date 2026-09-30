// hk-weather.js -- the Weather page's summary band, as a native Lovelace card.
//
// The drawing is code, so it lives in a card rather than in a template
// string. The YAML at each call site is `type`, `entity` and two counts.
//
// WHAT A CARD BUYS OVER A TEMPLATE, because the point is authoring cost and
// not speed:
//
//   * a syntax error here is a syntax error in a .js file, with a line number.
//     Inside a button-card `[[[ ]]]` string it blanks the whole card to a
//     MESSAGE-LESS RED with nothing to bisect.
//   * `hours` / `days` are CONFIG. A template would have to sniff
//     window.innerWidth to decide 12/8 versus 6/5, because an `!include` takes
//     no keys and a merge key does not survive HA's loader. A card is
//     configured at its call site, so there is no guess.
//   * one copy, however many dashboards call it (the weather page, a car's).
//
// THE MATERIAL IS NOT REDEFINED HERE. window.hkCards.M carries the glass plate
// as `var(--hk-glass-*, <literal>)`, published by the HK Kiosk theme, so
// this card cannot drift from the glass tiles the way a hardcoded copy would.
//
// The ICON MAP is deliberately hk-header.js's -- one weather glyph map for the
// whole frontend. A `weather` entity has NO `attributes.icon` (reading one
// draws the fallback forever), and the map is the correct pattern.
(function () {
  'use strict';

  function boot() {
    var C = window.hkCards;
    if (!C || !C.HkBase) return false;
    var M = C.M;
    var Base = C.HkBase;

    // 0.12, NOT 0.10 -- measured, not eyeballed.
    var RULE = 'rgba(255, 255, 255, 0.12)';

    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    // Text going into markup: the place label is typed by a person, the
    // condition comes from the weather provider.
    var esc = C.esc;

    // A REFUSED FORECAST SUBSCRIPTION BACKS OFF. Home Assistant refuses
    // weather/subscribe_forecast for an entity that does not offer that kind
    // of forecast, or does not exist yet. Forgetting the refusal would ask
    // again on the very next render -- every weather update, every module
    // arriving, every resize across a column -- with nothing logged, so a
    // band with no forecast would never say why. So: one console warning per
    // entity and kind per page, and the next attempt waits FC_RETRY, doubling
    // to FC_RETRY_MAX. Any forecast arriving clears the back-off.
    // Keyed 'kind|entity', shared by every band on the page.
    var FC_RETRY = 60 * 1000, FC_RETRY_MAX = 60 * 60 * 1000;
    var fcRefused = {}, fcWarned = {};

    // hk-header.js owns the glyphs (the home's multicolor SF Symbols as inline
    // SVG, or Material stand-ins) and the condition names. If it has not loaded, draw an empty box of the
    // right size rather than a broken icon, so the forecast grid keeps its rows.
    function glyph(cond, px, night) {
      var H = window.hkHeader;
      return H && H.wxSvg ? H.wxSvg(cond, px, { night: night })
        : '<span style="display:inline-block;width:' + px + 'px;height:' + px + 'px"></span>';
    }

    // THE HOUSE'S WEATHER WHEN A CARD NAMES NONE. A key the
    // card's YAML gives wins; one it leaves out is Configure -> Weather's
    // (the weather entity, else the house's first; the wind, gust, UV and
    // alerts sensors), re-read on every hass so an edit there follows at once.
    // So no card throws for want of an `entity:`, and a card added in the UI
    // need not repeat the house's own choice.
    function houseWeather(card, h, keys) {
      var HS = window.hkSettings, c = card._config;
      if (!HS || !c) return;
      var own = card._hkOwn || {};
      Object.keys(keys).forEach(function (k) {
        if (own[k]) return;
        var v = keys[k] === 'weather' ? (h ? HS.weatherId(h.states) : HS.get('weather.entity', null))
                                      : HS.get(keys[k], null);
        if (v && c[k] !== v) { c[k] = v; card._hkSig = null; }
      });
    }
    function ownKeys(config, keys) {
      var out = {};
      Object.keys(keys).forEach(function (k) { if (config && config[k]) out[k] = true; });
      return out;
    }
    var TILE_KEYS = { entity: 'weather', speed: 'weather.wind', gust: 'weather.gust', uv: 'weather.uv' };
    var BAND_KEYS = { entity: 'weather' };
    var ALERT_KEYS = { entity: 'weather.alerts' };

    // ------------------------------------------------- hk-weather-tile-card
    //
    // The four small tiles under the forecast band: WIND, SUNSET/SUNRISE, MOON
    // and UV INDEX. One plate, four drawings -- in a card, because a template
    // block in the view is the worst place for drawing code: no tests, no
    // syntax checking, and the whole page fails if one of them throws.
    //
    // `variant` picks the drawing; every entity it reads is named in the config.
    class HkWeatherTileCard extends Base {
      static get CSS() {
        return [
          'ha-card.wtile{box-sizing:border-box;display:block;height:172px;',
          '  border-radius:' + window.hkCards.M.radius + ';padding:14px 16px;margin:0;',
          '  ' + window.hkCards.M.glass + ';',
          '  border:' + window.hkCards.M.border + ';',
          '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12);',
          '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
          // `start` on a tablet, where five tiles share a row at ~230px each and
          // the compass and moon disc read as a left-aligned column of graphics.
          // On a phone the page drops to ONE column, and a 378px tile with its
          // graphic hard left looks unbalanced.
          '.wtile .grid{display:grid;height:100%;grid-template-areas:"cap" "body";',
          '  grid-template-columns:minmax(0,1fr);',
          '  grid-template-rows:min-content minmax(0,1fr);',
          // --hk-wtile-justify is INERT and kept only so
          // hk-responsive.css's phone override is not a dangling reference:
          // the cap sets its own justify-self:start, and every variant's body
          // is width:100%, so there is nothing left for justify-items to move.
          // Centring happens inside the body instead (see `.body`).
          '  justify-items:var(--hk-wtile-justify,center);align-content:start}',
          // THE TILE CAPTION, and it is the REFERENCE for the row: the
          // hk-usage-card beside these tiles (Outside Temperature) adopts THIS
          // rather than its own larger sentence-case heading -- see
          // `.usage.mid .nm` in hk-energy.js. Change one, change both.
          //
          //     12px / 600 / +0.9px tracking / white 0.50 / UPPERCASE
          //
          // The uppercase is in the STRINGS (see _caption), not a
          // text-transform, because a `caption:` from YAML is passed through
          // untouched and should not be shouted at.
          //
          // justify-self:start pins it LEFT while the body stays centred --
          // the shape of the whole row: heading left, drawing centred.
          '.wtile .cap{grid-area:cap;justify-self:start;text-align:left;',
          '  font-size:12px;font-weight:600;letter-spacing:0.9px;',
          '  color:rgba(255,255,255,0.5);width:100%;',
          '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
          // NO align-self. The grid is `align-content: start`, so the rows pack to
    // the top and the body simply starts under the caption. `center` is wrong
    // and the SUNSET tile shows it: at a narrow column "7:40 PM" wraps
    // to two lines, the body grows past its 1fr row, and centring then pulls
    // it UP OVER the caption -- measured 24.2px of overlap.
    // CENTRED BOTH WAYS, which every tile needs. Packed to the start, the
    // slack around the INK inside each body measures:
    //
    //     wind   h off by 32px (all of it on the right)   v centred
    //     moon   h off by 69px                            v centred
    //     sun    h centred                                v 11px high
    //     uv     h off by 186px                           v 27px high
    //
    // `safe center` IS THE WHOLE TRICK, and the note above this rule is why:
    // plain centring pulls a grown body UP OVER the caption -- measured at
    // 24.2px of overlap on the SUNSET tile, where "7:40 PM" wraps to two lines
    // at a narrow column. `safe` falls back to start exactly when centring
    // would overflow, so the tile centres when it fits and packs to the top
    // when it does not. The grid keeps `align-content:start` for the same
    // reason; the centring happens INSIDE the body, which begins below the cap.
    //
    // align-items:center is safe because every variant's wrapper declares
    // width:100% (sun and uv inline, wind and moon via `.row`), so nothing
    // shrinks to its content -- the UV gradient track in particular has to
    // stay full width, since the dot's position along it IS the reading.
    '.wtile .body{grid-area:body;width:100%;min-width:0;display:flex;',
    '  flex-direction:column;justify-content:safe center;align-items:center;',
    '  text-align:center}',
          // ---- shared type inside the drawings
          '.wtile .big{font-size:31px;font-weight:600;letter-spacing:-0.7px;',
          '  color:rgba(255,255,255,0.96);line-height:1}',
          '.wtile .uvbig{font-size:40px;font-weight:600;letter-spacing:-1px;',
          '  color:rgba(255,255,255,0.96);line-height:1}',
          '.wtile .small{font-size:14px;font-weight:500;color:rgba(255,255,255,0.62)}',
          '.wtile .side{font-size:16px;font-weight:500;line-height:1.4;',
          '  color:rgba(255,255,255,0.75)}',
          // flex:0 1 auto, NOT 1 1 auto. Growing makes the text box eat
          // every pixel the disc does not, so the pair always spans the full
          // row and `justify-content:center` has nothing to centre -- the
          // disc sits hard against the left edge with 69px of slack on the
          // right. Shrink-to-content lets the disc + name centre as one unit.
          // `1 0 auto` would be the same bug; the shrink half (1) is what keeps
          // a long phase name wrapping instead of clipping.
          '.wtile .moonside{font-size:15px;font-weight:500;line-height:1.35;',
          '  flex:0 1 auto;min-width:0;color:rgba(255,255,255,0.75)}',
          '.wtile .band{font-size:18px;font-weight:500;margin-top:4px;',
          '  color:rgba(255,255,255,0.78)}',
          '.wtile .uvtrack{position:relative;height:8px;border-radius:4px;margin-top:16px;',
          '  background:linear-gradient(to right,#4cd964,#ffd60a,#ff9f0a,#ff453a,#bf5af2)}',
          '.wtile .uvdot{position:absolute;top:-3px;width:14px;height:14px;',
          '  border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.35)}',
          '.wtile .row{display:flex;align-items:center;justify-content:center;width:100%}'
        ].join('');
      }

      setConfig(config) {
        var v = config && config.variant;
        if (['wind', 'sun', 'moon', 'uv'].indexOf(v) < 0) {
          throw new Error('hk-weather-tile: `variant` must be wind, sun, moon or uv');
        }
        // only what the drawing reads: the wind tile's weather and sensors,
        // the UV tile's sensor
        this._hkKeys = v === 'wind' ? { entity: TILE_KEYS.entity, speed: TILE_KEYS.speed, gust: TILE_KEYS.gust }
                     : v === 'uv' ? { uv: TILE_KEYS.uv } : {};
        this._hkOwn = ownKeys(config, this._hkKeys);
        super.setConfig(Object.assign({}, config));
        houseWeather(this, this._hass, this._hkKeys);
      }
      get hass() { return super.hass; }
      set hass(h) { houseWeather(this, h, this._hkKeys || {}); super.hass = h; }
      getCardSize() { return 2; }

      _sigOf() {
        var h = this._hass, c = this._config;
        if (!h || !c) return null;
        var ids = [c.entity, c.speed, c.gust, c.sun, c.phase, c.uv].filter(Boolean);
        var out = c.variant + '|';
        // A moon with no sensor follows the built-in phase, which moves with
        // the clock, not with any entity: it is part of the signature.
        if (c.variant === 'moon' && !c.phase) out += 'm=' + this._phase().toFixed(3) + ';';
        for (var i = 0; i < ids.length; i++) {
          var s = h.states[ids[i]];
          out += ids[i] + '=' + (s ? s.last_updated : 'x') + ';';
        }
        return out;
      }
      _n(id, attr) {
        var s = id && this._st(id);
        if (!s) return null;
        var v = attr ? (s.attributes || {})[attr] : s.state;
        var n = Number(v);
        return isFinite(n) && v !== '' && v != null ? n : null;
      }

      // ---- WIND: a compass rose with the needle and the speed in the hub.
      _wind() {
        // No speed sensor configured: the weather entity's own wind_speed.
        var spd = this._config.speed ? this._n(this._config.speed)
                                     : this._n(this._config.entity, 'wind_speed');
        var gust = this._n(this._config.gust);
        var brg = this._n(this._config.entity, 'wind_bearing');
        // The speed's own unit: the sensor's, else the weather entity's.
        var HS = window.hkSettings;
        var spdSt = this._st(this._config.speed || this._config.entity);
        var unit = HS && HS.unit ? HS.unit(spdSt, this._config.speed ? null : 'wind_speed_unit', 'mph')
                                 : 'mph';
        var DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        // Meteorological bearing is the direction the wind comes FROM, so the
        // needle points from that bearing toward the centre.
        var a = (brg === null ? 0 : brg) * Math.PI / 180;
        var R = 30, cx = 34, cy = 34;
        var x1 = cx + R * Math.sin(a), y1 = cy - R * Math.cos(a);
        var x2 = cx - R * Math.sin(a), y2 = cy + R * Math.cos(a);
        var ticks = '';
        for (var i = 0; i < 36; i++) {
          var t = i * 10 * Math.PI / 180;
          var inner = (i % 9 === 0) ? 26 : 29;
          ticks += '<line x1="' + (cx + inner * Math.sin(t)) + '" y1="' + (cy - inner * Math.cos(t)) +
                   '" x2="' + (cx + 32 * Math.sin(t)) + '" y2="' + (cy - 32 * Math.cos(t)) +
                   '" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>';
        }
        var lab = function (x, y, s) {
          return '<text x="' + x + '" y="' + y + '" fill="rgba(255,255,255,0.5)"' +
                 ' font-size="8" text-anchor="middle">' + s + '</text>';
        };
        var dir = brg === null ? '' : DIRS[Math.round((brg % 360) / 45) % 8];
        // GUSTS ARE OFTEN GENUINELY ABSENT, and that is not an error to print.
        // OpenWeatherMap only sends `wind_gust` when the observation carries
        // one, so its gust sensor alternates between a number and `unknown`
        // all day. "Gusts / -- mph NE" looks like a broken card: "--" next to
        // a live compass reads as a failure, not as "calm". So when there is no gust the side
        // states the direction instead, and when there is no bearing either the
        // compass stands alone rather than captioned with nothing.
        var side = gust !== null
          ? '<div class="side">Gusts<br>' + Math.round(gust) + ' ' + unit + ' ' + dir + '</div>'
          : dir ? '<div class="side">From<br>' + dir + '</div>' : '';
        // min-height:100% for the same reason as the moon below: centred in
        // the body rather than packed under the caption.
        return '<div class="row" style="justify-content:center;gap:18px;min-height:100%">' +
          '<svg viewBox="0 0 68 68" style="width:108px;height:108px;flex:0 0 auto">' +
          ticks + lab(34, 9, 'N') + lab(34, 64, 'S') + lab(61, 37, 'E') + lab(7, 37, 'W') +
          '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
          '" stroke="rgba(255,255,255,0.92)" stroke-width="2" stroke-linecap="round"/>' +
          '<circle cx="' + x2 + '" cy="' + y2 + '" r="3.2" fill="rgba(255,255,255,0.95)"/>' +
          '<circle cx="34" cy="34" r="15" fill="rgba(0,0,0,0.28)"/>' +
          '<text x="34" y="33" fill="rgba(255,255,255,0.96)" font-size="15" font-weight="600"' +
          ' text-anchor="middle">' + (spd === null ? '--' : Math.round(spd)) + '</text>' +
          '<text x="34" y="43" fill="rgba(255,255,255,0.6)" font-size="8"' +
          ' text-anchor="middle">' + unit + '</text></svg>' +
          side + '</div>';
      }

      // ---- SUN: the next event, and an arc with the sun's live position.
      _sun() {
        var s = this._st(this._config.sun), a = (s && s.attributes) || {};
        var up = s && s.state === 'above_horizon';
        var fmt = function (iso) {
          if (!iso) return '--';
          var d = new Date(iso);
          return isNaN(d) ? '--' : d.toLocaleTimeString('en-US',
            { hour: 'numeric', minute: '2-digit' });
        };
        var main = fmt(up ? a.next_setting : a.next_rising);
        var other = up ? ('Sunrise: ' + fmt(a.next_rising))
                       : ('Sunset: ' + fmt(a.next_setting));
        // The dot is derived from live ELEVATION, not from clock time: sun.sun
        // exposes only the NEXT rise and set, so today's sunrise is unavailable
        // once the sun is already up. 70 degrees is a rough summer maximum for
        // mid-northern latitudes, so the position is indicative, not surveyed.
        var elev = Number(a.elevation) || 0;
        var f = Math.max(0, Math.min(1, elev / 70));
        var x = a.rising === true ? (8 + 60 * (f * 0.5)) : (8 + 60 * (1 - f * 0.5));
        var y = 34 - 24 * f;
        return '<div style="width:100%">' +
          '<div class="big">' + main + '</div>' +
          '<svg viewBox="0 0 136 44" style="width:100%;height:50px;margin-top:8px">' +
          '<path d="M8,36 Q68,-6 128,36" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>' +
          '<line x1="0" y1="38" x2="136" y2="38" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="rgba(255,214,10,0.98)"/></svg>' +
          '<div class="small">' + other + '</div></div>';
      }

      // ---- MOON: a two-arc terminator, and the phase name.
      // The phase: the card's own sensor, else the one chosen in Configure ->
      // Seasonal sky, else computed from the date -- the same answer the live
      // sky draws (hkSettings.moon), so the tile and the sky always agree.
      _phase() {
        if (this._config.phase) return this._n(this._config.phase);
        var HS = window.hkSettings;
        return HS && HS.moon ? HS.moon((this._hass && this._hass.states) || {}) : null;
      }
      _moon() {
        var p = this._phase();
        if (p === null) return '<div style="color:rgba(255,255,255,0.6)">--</div>';
        var illum = (1 - Math.cos(2 * Math.PI * p)) / 2;
        var waxing = p < 0.5;
        var name = p < 0.03 ? 'New Moon'
                 : p < 0.22 ? 'Waxing Crescent'
                 : p < 0.28 ? 'First Quarter'
                 : p < 0.47 ? 'Waxing Gibbous'
                 : p < 0.53 ? 'Full Moon'
                 : p < 0.72 ? 'Waning Gibbous'
                 : p < 0.78 ? 'Last Quarter'
                 : p < 0.97 ? 'Waning Crescent' : 'New Moon';
        // THE SWEEP FLAGS. arc1 runs top -> bottom, so sweep 1 goes round the
        // RIGHT limb and sweep 0 round the LEFT: waxing is lit on the right,
        // waning on the left. arc2 runs bottom -> top, so the same flag means the
        // opposite side -- sweep 1 is now the LEFT.
        //
        // A CRESCENT therefore needs arc2 to come back on the SAME side as the
        // lit limb, carving the half-disc thin, which is the OPPOSITE flag from
        // arc1. A GIBBOUS needs it to bulge over the dark lobe, the SAME flag.
        // Inverted, every phase renders as its own complement: new moon draws
        // a full disc, full moon an empty one, both crescents draw as gibbous
        // -- while the "% lit" text stays right, which makes it look like a
        // drawing bug rather than a data one.
        //
        // hk-sky.js moonSvg() draws the sky's own moon
        // with `inner = c < 0 ? outer : 1 - outer`, which is this same test
        // written against cos directly (c < 0 is exactly illum > 0.5). If one is
        // ever changed, change both -- they draw the same moon on the same page.
        var r = 26, cx = 30, cy = 30;
        var rx = r * Math.abs(Math.cos(2 * Math.PI * p));
        var a1 = waxing ? 1 : 0;
        var a2 = (illum > 0.5) ? a1 : (1 - a1);
        var d = 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 0 ' + a1 +
                ' ' + cx + ' ' + (cy + r) + ' A ' + rx + ' ' + r + ' 0 0 ' + a2 +
                ' ' + cx + ' ' + (cy - r) + ' Z';
        // 72px, not 104: in a row of five tiles a bigger disc pushes "Waning
        // Crescent" out of the tile. The phase name is broken at its space
        // rather than left to the flex box, which clips it mid-word instead of
        // wrapping.
        // min-height:100% CENTRES IT in the body: the disc
        // is 72px in a 123px body, so packed to the top it sits 25px high while
        // the compass beside it fills its body and looks centred. min-height,
        // not height -- a phase name that wraps can still grow the row rather
        // than be clipped, which is the SUNSET overlap trap in reverse.
        return '<div class="row" style="gap:12px;min-height:100%">' +
          '<svg viewBox="0 0 60 60" style="width:72px;height:72px;flex:0 0 auto">' +
          '<circle cx="30" cy="30" r="26" fill="rgba(255,255,255,0.10)"/>' +
          '<path d="' + d + '" fill="rgba(226,232,240,0.95)"/></svg>' +
          '<div class="moonside">' + String(name).replace(' ', '<br>') +
          '<br>' + Math.round(illum * 100) + '% lit</div></div>';
      }

      // ---- UV: the index, its band, and a dot on the risk gradient.
      _uv() {
        var v = this._n(this._config.uv);
        var n = v === null ? null : Math.round(v);
        var band = n === null ? '--'
                 : n <= 2 ? 'Low'
                 : n <= 5 ? 'Moderate'
                 : n <= 7 ? 'High'
                 : n <= 10 ? 'Very High' : 'Extreme';
        var pct = n === null ? 0 : Math.max(0, Math.min(1, n / 12));
        return '<div style="width:100%">' +
          '<div class="uvbig">' + (n === null ? '--' : n) + '</div>' +
          '<div class="band">' + band + '</div>' +
          '<div class="uvtrack"><div class="uvdot" style="left:calc(' +
          (pct * 100).toFixed(1) + '% - 7px)"></div></div></div>';
      }

      _caption() {
        var cfg = this._config;
        if (cfg.caption) return cfg.caption;
        // UPPERCASE HERE, not a text-transform: a `caption:` set in YAML is
        // passed through untouched and should not be shouted at.
        if (cfg.variant === 'sun') {
          var s = this._st(cfg.sun);
          return (s && s.state === 'above_horizon') ? 'SUNSET' : 'SUNRISE';
        }
        return { wind: 'WIND', moon: 'MOON', uv: 'UV INDEX' }[cfg.variant] || '';
      }

      _render() {
        var cfg = this._config;
        if (!this._built) {
          this._root.innerHTML =
            '<ha-card class="wtile" data-hk-role="card"><div class="grid">' +
            '<div class="cap" data-hk-role="cap"></div>' +
            '<div class="body" data-hk-role="body"></div>' +
            '</div></ha-card>';
          var q = this._root.querySelector.bind(this._root);
          this._e = { card: q('.wtile'), cap: q('.cap'), body: q('.body') };
          if (cfg.tap_action && cfg.tap_action.action !== 'none') {
            this._bind(this._e.card, 'tap_action', null);
          }
          this._built = true;
        }
        var e = this._e;
        var cap = this._caption();
        if (e.cap.textContent !== cap) e.cap.textContent = cap;
        var html = this['_' + cfg.variant]();
        window.hkCards.morph(e.body, html);
      }
    }


    // --------------------------------------------------------- hk-header
    //
    // THE WALL HEADER: the clock, the date and the weather on the left; the
    // security summary on the right. Both halves are already one function each
    // in modules/hk-header.js -- this card is the scaffolding around them.
    //
    // WHY THE LOGIC LIVES IN A MODULE. The clock and the weather appear in
    // several places -- this header, a car dashboard, the screensaver -- and
    // inline copies of them drift apart silently. One module means one clock
    // and one weather everywhere.
    //
    // hk-header.js is a bootstrap module (custom_components/hk_frontend/
    // __init__.py) rather than a hk-loader module because this is the first
    // thing painted. If it fails to load, this header says so rather than
    // rendering blank.
    // THE WEATHER, FITTED TO ITS WIDTH (hkHeader.fitWeather: glyph alone, or
    // the detail line cut to what fits -- never an ellipsis). The rules key on
    // an attribute of the element `holderOf(card)` returns; the fit runs now
    // and again whenever the card's WIDTH changes (a height change is the
    // fit's own doing).
    function fitCss(sel) {
      var H = window.hkHeader;
      return H && H.FIT_CSS ? H.FIT_CSS(sel) : '';
    }
    function fitOnResize(card, fit) {
      var H = window.hkHeader;
      if (!H || !H.fitWeather) return;
      fit(H);
      if (card._wxRO || !window.ResizeObserver) return;
      var w = -1;
      card._wxRO = new ResizeObserver(function (en) {
        var nw = en[0] && en[0].contentRect ? Math.round(en[0].contentRect.width) : -1;
        if (nw === w) return;
        w = nw;
        if (window.hkHeader) fit(window.hkHeader);
      });
      card._wxRO.observe(card);
    }

    // The page's top margin when the header has stepped aside for the menu's
    // clock: the chip row's top edge then sits level with the top of the
    // menu's time digits -- both at y = 32 (measured at 1280 x 800;
    // 16 more px of grid and chip margin sit under this).
    var GONE_H = 16;
    function menuHasTime() {
      var M = C.menu;
      return !!(M && typeof M.hasTime === 'function' && M.hasTime());
    }

    class HkHeaderCard extends Base {
      static get CSS() {
        return [
          // OVERFLOW IS VISIBLE AT EVERY LEVEL, and that is load-bearing: the
          // whole header is drawn under one drop-shadow filter, and a filter's
          // output is clipped by any ancestor that clips.
          'ha-card.hdr{box-sizing:border-box;display:block;min-height:118px;',
          '  background:transparent;box-shadow:none;border:none;overflow:visible;',
          '  padding:28px 0px 14px 0px;',
          // 9px, not 14px: the status chip carries a 5px TOP margin so its
          // drop shadow clears the row above. 9 + 5 = the same 14px gap this
          // header has always had below it. Paired with that margin -- if the
          // chip shadow is retuned, retune this too.
          '  margin:0px 0px 9px 0px}',
          '.hdr .grid{display:grid;grid-template-areas:"left right";',
          '  grid-template-columns:minmax(0,1fr) fit-content(42%);',
          '  grid-template-rows:min-content;align-items:start;',
          '  column-gap:34px;overflow:visible}',
          '.hdr .half{min-height:96px;cursor:pointer;overflow:visible;',
          '  align-self:start;width:100%;min-width:0;',
          '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
          '.hdr .left{grid-area:left;text-align:left}',
          '.hdr .right{grid-area:right;text-align:right;min-width:280px}',
          // the weather fitted to what is left beside the clock (hkHeader.fitWeather),
          // and the clock itself dropped when even that is too little (_fitWx)
          fitCss('.hdr .left'),
          '.hdr .left[data-hdr-fit="noclock"] [data-hk-clock="clock"]{display:none}',
          // THE MENU HAS THE TIME (Configure: "Time and weather in the menu",
          // with the menu always shown): the header steps aside and leaves
          // only the page's top margin, so the chip row moves up level with
          // the menu's clock -- about 130 px back on a wall tablet.
          'ha-card.hdr.gone{min-height:0;height:' + GONE_H + 'px;padding:0;margin:0}',
          '.hdr.gone .grid{display:none}'
        ].join('');
      }
      setConfig(config) { super.setConfig(config || {}); }
      getCardSize() { return 2; }
      // THE WEATHER FITS WHAT IS LEFT BESIDE THE CLOCK: after each redraw and
      // whenever the header's width changes (a window resized, a phone turned,
      // a docked menu coming or going). Wind, then humidity, go first. When
      // even the first line ("73° • Sunny") will not fit beside the clock,
      // THE CLOCK GOES instead of the words: a screen that
      // narrow -- an iPad held upright, a phone -- shows the time and date in
      // its own status bar, so the clock is the redundant half. Then the
      // weather is fitted again on its own; the edge tab moves down level
      // with the chip row (see _publishDate).
      _fitWx() {
        var self = this;
        fitOnResize(this, function (H) {
          var left = self._e && self._e.left;
          if (!left) return;
          var was = left.getAttribute('data-hdr-fit');
          left.removeAttribute('data-hdr-fit');
          H.fitWeather(left);
          if (left.getAttribute('data-wx-fit') === 'glyph') {
            left.setAttribute('data-hdr-fit', 'noclock');
            H.fitWeather(left);
          }
          if (was !== left.getAttribute('data-hdr-fit')) self._publishDate();
        });
      }
      // THE HEADER SIGNS ON EVERYTHING IT DRAWS. Returning null -- "always
      // render" -- would rebuild both HTML strings, scan every security
      // entity and read two computed styles on every hass push, several a
      // second on every wall tablet. Its inputs are all
      // knowable: the clock sensors, the weather entity, sun.sun and the
      // Home-status lists (hkHeader.lists), plus the optical shift. Without a
      // Time & Date sensor the clock is this screen's own and moves once a
      // minute, which the last term covers.
      _sigOf() {
        var h = this._hass, H = window.hkHeader, HS = window.hkSettings;
        if (!h || !H || !h.states) return null;
        var st = h.states;
        var get = function (k) { return (HS && HS.get) ? HS.get(k, null) : null; };
        var timeId = get('clock.time') || 'sensor.time';
        var ids = [timeId, get('clock.date') || 'sensor.date',
                   HS && HS.weatherId ? HS.weatherId(st) : null, 'sun.sun'];
        var L = H.lists ? H.lists() : {};
        ids = ids.concat(L.alarm || [], L.garage || [], L.locks || [], L.doors || [], L.windows || []);
        var out = 'shift=' + (this._shift || 0) + ';';
        for (var i = 0; i < ids.length; i++) {
          var s = ids[i] && st[ids[i]];
          out += (ids[i] || '-') + '=' + (s ? s.state + '@' + s.last_updated : 'x') + ';';
        }
        if (!st[timeId]) out += 'min=' + Math.floor(Date.now() / 60000) + ';';
        return out + 'gone=' + menuHasTime();
      }
      _go(path) {
        this._act({ action: 'navigate', navigation_path: path }, false);
      }
      _render() {
        var cfg = this._config;
        if (!this._built) {
          this._root.innerHTML =
            '<ha-card class="hdr" data-hk-role="card"><div class="grid">' +
            '<div class="half left" role="button" data-hk-role="left"></div>' +
            '<div class="half right" role="button" data-hk-role="right"></div>' +
            '</div></ha-card>';
          var q = this._root.querySelector.bind(this._root);
          this._e = { left: q('.left'), right: q('.right') };
          // New, empty halves: forget what was written into the old ones, or
          // the compare below skips the write after a config edit.
          this._lastL = this._lastR = null;
          var self = this;
          // "./x" is relative to the CURRENT dashboard: dashboards with
          // their own url_paths share this one card.
          // THE CLOCK OPENS THE MENU, where this dashboard has
          // one and "Tapping the clock opens the menu" is on -- a big target
          // for it on the wall. The weather beside it still opens Weather.
          // The clock block is marked data-hk-clock="clock" by hk-header.js.
          this._e.left.addEventListener('click', function (e) {
            if (C.menu && C.menu.clock()) {
              var path = e.composedPath ? e.composedPath() : [];
              for (var i = 0; i < path.length && path[i] !== self._e.left; i++) {
                if (path[i].getAttribute && path[i].getAttribute('data-hk-clock') === 'clock') {
                  C.menu.toggle();
                  return;
                }
              }
            }
            self._go(cfg.weather_path || './weather');
          });
          this._e.right.addEventListener('click', function () {
            self._go(cfg.alarm_path || './alarm');
          });
          this._built = true;
        }
        var gone = menuHasTime();
        var card = this._root.querySelector('ha-card.hdr');
        if (card && card.classList) card.classList.toggle('gone', gone);
        if (gone) { this._lastL = this._lastR = null; return; }
        var H = window.hkHeader, st = this._hass && this._hass.states;
        var l = (H && st) ? H.row(st, { timeShift: this._shift || 0 }) : 'Header module unavailable';
        var r = (H && st) ? H.security(st) : 'Header module unavailable';
        // Compare against the LAST STRING WRITTEN, never against innerHTML.
        // innerHTML is the browser's re-serialisation, which is not guaranteed
        // to round-trip (a self-closed SVG <path/> comes back as <path></path>,
        // attribute quoting and style text can be normalised). When it does
        // not, the comparison is always unequal and the header rebuilds on
        // every hass update -- measured 98 DOM mutations in 10 s, and a
        // visible flicker on a wall tablet with the inline weather glyphs.
        // morph(), not innerHTML: a minute tick changes one text node instead of
        // recreating the whole block -- see morph() in hk-base.js for the
        // tablet flicker that rebuilding it causes.
        var put = (window.hkCards && window.hkCards.morph) ||
                  function (el, html) { el.innerHTML = html; };
        if (this._lastL !== l) { this._lastL = l; put(this._e.left, l); this._fitWx(); }
        if (this._lastR !== r) { this._lastR = r; put(this._e.right, r); }
        // The same optical left edge as the screensaver clock.
        if (H && H.clockShift && !this._aligning) {
          var s = H.clockShift(this._e.left), self = this;
          if (s === null) {
            if (document.fonts && !this._fontWait) {
              this._fontWait = true;
              document.fonts.ready.then(function () { self._fontWait = false; self.requestUpdate(); });
            }
          } else if (Math.abs(s - (this._shift || 0)) >= 0.5) {
            this._shift = s;
            this._aligning = true;
            try { this._render(); } finally { this._aligning = false; }
          }
        }
        if (!this._aligning) this._publishDate();
      }

      // WHERE THE DATE LINE SITS, for the menu's edge tab (modules/hk-menu.js),
      // which centres itself on it: the tab's centre line and the date's
      // line up. The OPTICAL centre of the text -- halfway between its baseline
      // and its cap height, the line the eye reads as its middle -- not the middle of its line
      // box, which sits lower by half the descender. Measured once the fonts
      // are in, and handed over as a distance from the top of the PAGE -- under
      // any Home Assistant toolbar, with the document's scroll added back -- so
      // it is the same number however the page was sitting when it was taken.
      _publishDate() {
        var M = C.menu, self = this;
        if (!M || !M.on() || this._dateBusy) return;
        if (typeof M.tab === 'function' ? M.tab() === 'never' : M.style() !== 'tab') return;
        if (!this.isConnected) return;
        var left = this._e && this._e.left;
        var date = left && left.querySelector('[data-hk-clock="date"]');
        // NO CLOCK on a narrow screen (_fitWx): no date line to sit on. The tab
        // goes LOWER, level with the chip row under the header -- its centre
        // is the header's bottom + 43 px (the header's 9 px margin, the chip's
        // 5, half its 44 -- measured at 744 px: header 142, chips 163-207) --
        // so it reads as that row's lead, 62 px clear of the weather and
        // 92 px clear of a sub-page's back button. Following the weather's
        // first line up instead would put it right beside both.
        if (date && !date.getClientRects().length) {
          var hb = this.getBoundingClientRect();
          var yc = hb.bottom + 43 - (M.viewTop() - (window.scrollY || 0));
          if (yc > 0 && yc < 600 && M.publishDate) M.publishDate(yc);
          return;
        }
        var panel = M.panel && M.panel();
        if (!date || !panel || !date.getBoundingClientRect) return;
        this._dateBusy = true;
        var run = function () {
          self._dateBusy = false;
          if (!self.isConnected || !date.isConnected) return;
          var top = M.viewTop() - (window.scrollY || 0);    // the page's top NOW
          var probe = document.createElement('span');
          probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          date.appendChild(probe);
          var baseline = probe.getBoundingClientRect().top;
          date.removeChild(probe);
          var cs = getComputedStyle(date), cap = 0;
          try {
            var ctx = document.createElement('canvas').getContext('2d');
            ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            cap = ctx.measureText('H').actualBoundingBoxAscent || 0;
          } catch (e) { cap = 0; }
          if (!cap) cap = parseFloat(cs.fontSize) * 0.705;           // SF Pro's cap height
          var y = baseline - cap / 2 - top;
          if (y > 0 && y < 400 && M.publishDate) M.publishDate(y);
        };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(run); });
        else requestAnimationFrame(run);
      }
    }

    // ------------------------------------------------------- hk-alert-card
    //
    // The severe-weather band. It renders the event, the severity, the alert
    // count, the affected-area count and the full "expected to last until ..."
    // sentence -- which is why it is INERT: the more-info dialog behind it is
    // the raw sensor, a count for a state and an `Alerts` attribute holding a
    // ~600-character AreasAffected string. Tapping a severe-weather warning
    // and getting that would be the most confusing thing on the page.
    // ------------------------------------------ hk-screensaver-status-card
    // THE HOUSE AT A GLANCE, top-right of the photo screensaver: the tablet
    // header's own security block (hkHeader.security -- the one definition of
    // "secure" the header and the car share), sized for the photos. "Home
    // Secured" when armed and everything is shut, locked and reporting;
    // otherwise what isn't; NOTHING when there is nothing to say (disarmed,
    // all shut), so the photos stay the point.
    //
    // Occupies no space in the screensaver's info box: like the now-playing
    // card it pins itself to its corner (position:fixed), and like it, the
    // shadow is a filter on the text and the info box's text-shadow is off.
    class HkScreensaverStatusCard extends Base {
      static get CSS() {
        return [
          'ha-card.ssstat{background:none;box-shadow:none;border:none;padding:0;margin:0;height:0;',
          '  overflow:visible;display:block}',
          '.sscorner{position:fixed;top:var(--hk-ss-status-top,44px);right:var(--hk-ss-status-right,50px);',
          '  z-index:5;width:46vw;pointer-events:none;text-shadow:none;will-change:transform}'
        ].join('');
      }
      setConfig(config) { super.setConfig(Object.assign({}, config || {})); }
      getCardSize() { return 1; }
      _html() {
        var H = window.hkHeader, st = this._hass && this._hass.states;
        if (!H || !H.security || !st) return '';
        var c = this._config || {};
        return H.security(st, { line1Size: c.line1_size || '36px', lineSize: c.line_size || '24px',
                                pad: '0px', minHeight: '0px' });
      }
      _sigOf() { return this._hass ? this._html() : null; }
      _render() {
        if (!this._built) {
          this._root.innerHTML = '<ha-card class="ssstat" data-hk-role="card"><div class="sscorner"></div></ha-card>';
          this._e = this._root.querySelector('.sscorner');
          this._built = true;
        }
        var html = this._html();
        if (this._last === html) return;
        this._last = html;
        var put = (window.hkCards && window.hkCards.morph) || function (el, v) { el.innerHTML = v; };
        put(this._e, html);
      }
    }

    class HkAlertCard extends Base {
      static get CSS() {
        return [
          // The glass plate, same as every other card on the page, from the
          // shared tokens. This card ONLY RENDERS WHEN AN ALERT IS LIVE, so
          // drift here would be invisible until it matters, which is the
          // argument for it not being hand-rolled.
          'ha-card.alert{box-sizing:border-box;display:block;border-radius:' + window.hkCards.M.radius + ';',
          '  padding:16px 20px 14px 20px;margin:0px 0px 12px 0px;',
          '  ' + window.hkCards.M.glass + ';',
          '  border:' + window.hkCards.M.border + ';',
          '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12);',
          '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
          '.alert .grid{display:grid;',
          '  grid-template-areas:"i title" "i src" "body body" "count count";',
          '  grid-template-columns:min-content minmax(0,1fr);',
          '  grid-template-rows:min-content min-content min-content min-content;',
          '  justify-items:start;align-content:start;column-gap:12px}',
          '.alert .icon{grid-area:i;width:26px;height:26px;--mdc-icon-size:26px;',
          '  align-self:center}',
          '.alert .title{grid-area:title;font-size:19px;font-weight:700;',
          '  letter-spacing:-0.45px;align-self:end;color:rgba(255,255,255,0.96)}',
          '.alert .src{grid-area:src;font-size:14px;font-weight:500;',
          '  letter-spacing:-0.2px;align-self:start;color:rgba(255,255,255,0.58)}',
          '.alert .body{grid-area:body;font-size:15px;font-weight:500;',
          '  letter-spacing:-0.2px;line-height:1.35;text-align:left;margin-top:12px;',
          '  color:rgba(255,255,255,0.88)}',
          '.alert .count{grid-area:count;font-size:13px;font-weight:500;',
          '  margin-top:10px;color:rgba(255,255,255,0.45)}'
        ].join('');
      }
      setConfig(config) {
        this._hkOwn = ownKeys(config, ALERT_KEYS);
        super.setConfig(Object.assign({}, config));
        houseWeather(this, this._hass, ALERT_KEYS);
      }
      get hass() { return super.hass; }
      set hass(h) { houseWeather(this, h, ALERT_KEYS); super.hass = h; }
      getCardSize() { return 2; }

      _first() {
        var st = this._st(this._config.entity);
        var list = (st && st.attributes && st.attributes.Alerts) || [];
        return { st: st, a: list[0] || {}, n: Number((st && st.state) || 0) || 0 };
      }

      _render() {
        var cfg = this._config;
        if (!this._built) {
          this._root.innerHTML =
            '<ha-card class="alert" data-hk-role="card"><div class="grid">' +
            '<ha-icon class="icon" data-hk-role="icon" icon="' +
            (cfg.icon || 'mdi:alert') + '"></ha-icon>' +
            '<div class="title" data-hk-role="title"></div>' +
            '<div class="src" data-hk-role="src"></div>' +
            '<div class="body" data-hk-role="body"></div>' +
            '<div class="count" data-hk-role="count"></div>' +
            '</div></ha-card>';
          var q = this._root.querySelector.bind(this._root);
          this._e = { icon: q('.icon'), title: q('.title'), src: q('.src'),
                      body: q('.body'), count: q('.count') };
          this._built = true;
        }
        var e = this._e, f = this._first(), a = f.a;

        // NWS severity vocabulary: Extreme / Severe / Moderate / Minor /
        // Unknown. One colour for all would make a tornado warning and a
        // frost advisory look identical.
        var sev = String(a.Severity || '').toLowerCase();
        e.icon.style.color = (sev === 'extreme' || sev === 'severe')
          ? 'rgba(255, 69, 58, 0.98)'
          : sev === 'moderate' ? 'rgba(255, 159, 10, 0.98)'
          : 'rgba(255, 214, 10, 0.98)';

        var title = cfg.title || 'Severe Weather';
        if (e.title.textContent !== title) e.title.textContent = title;
        var src = cfg.source || 'National Weather Service';
        if (e.src.textContent !== src) e.src.textContent = src;

        var ev = a.Event || a.Headline || 'Severe weather';
        var iso = a.Ends || a.Expires;
        var body = ev + '.';
        if (iso) {
          var d = new Date(iso);
          if (!isNaN(d)) {
            var t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            var day = d.toLocaleDateString('en-US',
              { weekday: 'long', month: 'long', day: 'numeric' });
            body = ev + '. These conditions are expected to last until ' +
                   t + ', ' + day + '.';
          }
        }
        if (e.body.textContent !== body) e.body.textContent = body;

        var parts = [];
        if (a.Severity) parts.push(a.Severity);
        parts.push(f.n + ' ' + (f.n === 1 ? 'alert' : 'alerts'));
        // AreasAffected can be a ~600-character semicolon list -- unusable
        // raw on a tablet, and the integration only reports for the home's
        // location anyway, so it is reduced to a count.
        var areas = String(a.AreasAffected || '').split(';')
                      .filter(function (x) { return x.trim(); }).length;
        if (areas > 1) parts.push(areas + ' areas');
        var count = parts.join('  ·  ');
        if (e.count.textContent !== count) e.count.textContent = count;
      }
    }

    class HkWeatherBandCard extends Base {
      static get CSS() {
        return [
          // The plate. Same tokens hk_glass_tile reads, so the two cannot
          // disagree; the 20/24 padding and the 12px bottom margin are the
          // band's own.
          'ha-card.band{' + M.glass + ';border:' + M.border + ';',
          '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),',
          '    var(--hk-glass-shadow-lg, 0 10px 28px rgba(0,0,0,0.12));',
          '  border-radius:' + M.radius + ';padding:20px 24px;margin:0 0 12px 0;',
          '  display:block;overflow:hidden}',
          // A GRID WITH A FIXED 300px LEFT TRACK AND A 24px COLUMN GAP. A
          // flex row with a content-sized left block and no gap looks fine,
          // but its hourly tracks come out 53.5px instead of 40px, because the
          // left column is ~48px narrower than it should be. Measure it; do
          // not judge it by looking.
          '.wrap{display:grid;grid-template-columns:300px 1px minmax(0,1fr);',
          '  column-gap:24px;align-items:stretch;width:100%;min-width:0}',
          // LEFT: the centred stack. The 76px numeral at weight 200 is the
          // signature of the whole page and is only possible because
          // fonts/sf-pro.css declares the variable font across `1 1000`.
          '.now{display:flex;flex-direction:column;justify-content:center;',
          '  align-items:center;text-align:center;padding:0 8px;height:100%}',
          '.place{font-size:12px;font-weight:600;letter-spacing:1.6px;',
          '  color:rgba(255,255,255,0.5)}',
          '.temp{font-size:76px;font-weight:200;letter-spacing:-2px;',
          '  line-height:1.04;margin-top:6px;color:rgba(255,255,255,0.96)}',
          '.cond{font-size:21px;font-weight:600;letter-spacing:-0.3px;',
          '  margin-top:2px;color:rgba(255,255,255,0.92)}',
          '.sub{font-size:14px;font-weight:500;margin-top:8px;',
          '  color:rgba(255,255,255,0.6)}',
          '.sub.wind{margin-top:2px}',
          '.rule{background:' + RULE + ';width:1px}',
          // NARROW (a phone): when no forecast column fits beside
          // the stack the band STACKS -- conditions on top, the strips below at
          // full width, the rule turned horizontal between them. Kept at three
          // columns, the third track would be ~21px, and the only thing
          // visible of the forecast its vertical rule.
          '.wrap.narrow{grid-template-columns:minmax(0,1fr);row-gap:16px}',
          '.wrap.narrow .now{padding:0;height:auto}',
          '.wrap.narrow .rule{width:100%;height:1px}',
          // RIGHT: hours over days, one divider between.
          '.cols{display:flex;flex-direction:column;justify-content:center;',
          '  gap:14px;min-width:0}',
          // THE TRACK COUNT FOLLOWS THE CELL COUNT and is set inline per
          // render. A hardcoded `repeat(12, ...)` packs six cells into the
          // first six of twelve tracks and leaves half the band empty.
          '.strip{display:grid;column-gap:4px}',
          '.hrule{height:1px;background:' + RULE + ';width:100%}',
          '.cell{display:flex;flex-direction:column;align-items:center;',
          '  gap:5px;min-width:0}',
          '.lbl{font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);',
          '  white-space:nowrap}',
          '.lbl.now{font-weight:700;color:rgba(255,255,255,0.94);padding:0;',
          '  display:block}',
          '.hi{font-size:17px;font-weight:700;letter-spacing:-0.3px;',
          '  color:rgba(255,255,255,0.94)}',
          '.lo{font-size:13px;font-weight:500;color:rgba(255,255,255,0.5)}',
          '.pop{font-size:12px;font-weight:500;color:rgba(255,255,255,0.34)}',
          '.pop.wet{color:rgba(255,255,255,0.62)}'
        ].join('');
      }

      get hass() { return super.hass; }
      set hass(h) { houseWeather(this, h, BAND_KEYS); super.hass = h; }
      setConfig(config) {
        this._hkOwn = ownKeys(config, BAND_KEYS);
        // DEFAULTS TO NONE, and that is deliberate. HkBase._bind passes
        // `tapKey === 'tap_action'` as its defaultMoreInfo flag, so an unset
        // tap_action would open the weather entity's more-info dialog -- HA
        // chrome over a page that already says everything the dialog would.
        //
        // The Weather PAGE leaves it unset: tapping the band there would
        // navigate to the page you are already on. The Tesla sets it, because
        // there the band is a summary and the page is somewhere to go.
        super.setConfig(Object.assign({ tap_action: { action: 'none' } }, config));
        houseWeather(this, this._hass, BAND_KEYS);
      }

      // ---------------------------------------------------------------
      // HOW MANY COLUMNS FIT, MEASURED -- not stated, and not guessed from
      // window.innerWidth.
      //
      // `hours` and `days` are MAXIMA. The Weather page never wants more than
      // twelve hours even if a wider screen could hold twenty, so the cap
      // stays config. The COUNT is not: the Tesla's band sits in a ~700px
      // column and the page's in a ~920px one, so the same numbers cannot
      // serve both. Each call site states its cap and the card fills it.
      //
      // THE MEASUREMENT IS THE HOST, NOT THE STRIP. The host's width does not
      // depend on how many columns are drawn, so observing it cannot feed
      // back into itself; observing the strip would re-fire the observer on
      // every re-render. The 397 below is everything between the host edge
      // and the strips: 48 of card padding + the 300px left track + 24 gap +
      // the 1px rule + 24 gap. On a NARROW host (see .wrap.narrow) the strips
      // sit under the stack and get everything but the 48 of padding.
      _width() {
        // The width the ResizeObserver last reported; clientWidth only before
        // it has (a layout read, and _sigOf runs on every hass push).
        return this._w != null ? this._w : this.clientWidth;
      }
      _narrow() {
        var w = this._width();
        if (!w) { return false; }
        var c = this._config || {};
        return (w - 397) < (Number(c.min_hour_col) || 40);
      }
      _fit(max, minCol) {
        var w = this._width();
        if (!w) { return max; }                 // pre-layout: cap, then correct
        var avail = this._narrow() ? w - 48 : w - 397;
        if (avail <= 0) { return 1; }
        // n columns take n*minCol + (n-1)*GAP, so n = (avail + GAP) / (minCol + GAP)
        var n = Math.floor((avail + 4) / (minCol + 4));
        return Math.max(1, Math.min(max, n));
      }

      _counts() {
        var c = this._config || {};
        return {
          // 40 and 55 are MEASURED FLOORS, not taste. The Weather page draws
          // its twelve hours at 40.0px and its eight days at 62.0px and reads
          // cleanly; twelve hours in ~380px -- 28px each -- run together as
          // `Now1 AM2 AM3 AM`.
          hours: this._fit(Number(c.hours) || 12, Number(c.min_hour_col) || 40),
          days: this._fit(Number(c.days) || 8, Number(c.min_day_col) || 55)
        };
      }

      connectedCallback() {
        if (super.connectedCallback) { super.connectedCallback(); }
        if (this._ro || typeof ResizeObserver !== 'function') { return; }
        var self = this;
        this._ro = new ResizeObserver(function (entries) {
          var e = entries && entries[0];
          self._w = (e && e.contentRect) ? e.contentRect.width : self.clientWidth;
          var n = self._counts();
          // ONLY when the count actually changes. A resize that does not cross
          // a column boundary must not re-render, or every drag of a window
          // rebuilds the card.
          if (n.hours === self._nH && n.days === self._nD &&
              self._narrow() === self._nN) { return; }
          self.redraw();
        });
        this._ro.observe(this);
      }

      disconnectedCallback() {
        if (super.disconnectedCallback) super.disconnectedCallback();
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        this._w = null;
        var subs = this._fcSubs || {};
        Object.keys(subs).forEach(function (k) {
          Promise.resolve(subs[k]).then(function (unsub) {
            if (typeof unsub !== 'function') return;
            var r = unsub();
            if (r && typeof r.catch === 'function') r.catch(function () { /* connection gone */ });
          });
        });
        this._fcSubs = {};
        if (this._fcReady && this._fcConn && this._fcConn.removeEventListener) {
          this._fcConn.removeEventListener('ready', this._fcReady);
        }
        this._fcReady = null; this._fcConn = null;
        // A RE-ATTACHED BAND MUST ASK AGAIN. The subscriptions are gone, but
        // the render gate would still hold the old signature, so the next
        // hass push would find nothing to do and the cached forecast would
        // stay on screen until the weather entity itself changed. A fresh
        // ResizeObserver's first notification may happen to force a render;
        // the gate should not depend on that.
        this._hkSig = null;
      }

      // The label over the temperature: the card's own `place`, else the one
      // chosen in Configure, else the home's name.
      _place() {
        var HS = window.hkSettings;
        var p = HS ? HS.get('weather.place', null) : null;
        if (p) return p;
        var name = (this._hass && this._hass.config && this._hass.config.location_name) || 'Home';
        return String(name).toUpperCase();
      }

      // The band reads two FORECAST sensors the config does not name, so the
      // base class's default signature would gate on the weather entity alone
      // and never redraw when a forecast arrived.
      _sigOf() {
        var h = this._hass, c = this._config;
        if (!h || !c) return null;
        var src = this._sources();
        var ids = [c.entity, src.hourly, src.daily, src.feels, src.humidity, src.wind];
        var out = 'fc=' + (this._fcN || 0) + ';';
        for (var i = 0; i < ids.length; i++) {
          var st = h.states[ids[i]];
          out += ids[i] + '=' + (st ? st.last_updated : 'x') + ';';
        }
        // The fitted counts are part of "has anything changed" -- without them
        // a card that resized across a column boundary between state updates
        // would be gated out and keep the old column count.
        var n = this._counts();
        // The hour is in it too: the first hourly slot leaves the band when
        // its hour ends, whether or not the sensor has been refreshed yet.
        return out + 'n=' + n.hours + '/' + n.days + (this._narrow() ? 'N' : '') +
          ';h=' + Math.floor(Date.now() / 3600e3);
      }

      // WHERE EACH NUMBER COMES FROM: Configure -> Weather
      // (hk-settings.js). A sensor left unset is null, and the render then
      // reads the weather entity's own attribute (or, for a forecast, asks
      // the weather entity directly -- see _forecast).
      _sources() {
        var HS = window.hkSettings;
        var g = function (k) { return HS ? HS.get('weather.' + k, null) : null; };
        return { feels: g('feels_like'), humidity: g('humidity'), wind: g('wind'),
                 hourly: g('forecast_hourly'), daily: g('forecast_daily') };
      }

      // A FORECAST SENSOR IS OPTIONAL. Since Home Assistant 2024.4 a weather
      // entity carries no forecast attribute, so the usual answer is a
      // trigger template sensor fed by weather.get_forecasts. A home without
      // one gets the forecast the way Home
      // Assistant's own weather card does: weather/subscribe_forecast, one
      // subscription per kind, dropped when the card leaves the page. A
      // refusal backs off (fcRefused, above) and the band draws no forecast.
      _forecast(kind, sensorId) {
        if (sensorId) {
          return ((this._hass.states[sensorId] || {}).attributes || {}).forecast || [];
        }
        var wid = this._config.entity;
        this._fc = this._fc || {};
        this._fcSubs = this._fcSubs || {};
        var key = kind + '|' + wid;
        var conn = this._hass && this._hass.connection;
        var refused = fcRefused[key];
        if (wid && conn && !this._fcSubs[key] && this.isConnected &&
            !(refused && Date.now() < refused.until)) {
          var self = this;
          // A RECONNECT (Home Assistant restarted) is ours to follow: the
          // library's own resubscribe, refused because the weather entity is
          // not back yet, is dropped for good and the band kept yesterday's
          // forecast. So `resubscribe: false`, and on 'ready' -- the server
          // has forgotten every subscription -- this asks again on the next
          // render, through the same refusal back-off.
          if (!this._fcReady && typeof conn.addEventListener === 'function') {
            this._fcConn = conn;
            this._fcReady = function () {
              self._fcSubs = {};
              self.requestUpdate();
            };
            conn.addEventListener('ready', this._fcReady);
          }
          this._fcSubs[key] = conn.subscribeMessage(function (ev) {
            delete fcRefused[key];
            self._fc[key] = (ev && ev.forecast) || [];
            self._fcN = (self._fcN || 0) + 1;
            self.requestUpdate();
          }, { type: 'weather/subscribe_forecast', forecast_type: kind, entity_id: wid }, { resubscribe: false })
            .catch(function (err) {
              delete self._fcSubs[key];
              var r = fcRefused[key] = fcRefused[key] || { n: 0 };
              r.until = Date.now() + Math.min(FC_RETRY_MAX, FC_RETRY * Math.pow(2, r.n));
              r.n++;
              if (!fcWarned[key]) {
                fcWarned[key] = true;
                console.warn('[hk-weather] Home Assistant refused the ' + kind +
                             ' forecast for ' + wid + ' (' +
                             ((err && (err.message || err.code)) || String(err)) +
                             '); retrying with back-off. A forecast sensor in ' +
                             'Configure -> Weather avoids the subscription.');
              }
              return null;
            });
        }
        return this._fc[key] || [];
      }

      _render() {
        if (!this._config || !this._hass) { return; }
        var cfg = this._config, states = this._hass.states;
        var st = states[cfg.entity] || {};
        var a = st.attributes || {};
        var src = this._sources();
        var fitted = this._counts();
        var nHours = fitted.hours, nDays = fitted.days;
        var narrow = this._narrow();
        this._nH = nHours; this._nD = nDays; this._nN = narrow;

        var t = num(a.temperature);
        // These three read the sensors chosen in Configure when there are
        // any, else the weather entity's own attributes. See the note in
        // hk-header.js about the two being the same provider at different
        // precision.
        var read = function (id, attr) {
          return id ? num((states[id] || {}).state) : num(a[attr]);
        };
        var feels = read(src.feels, 'apparent_temperature');
        var hum = read(src.humidity, 'humidity');
        var wind = read(src.wind, 'wind_speed');
        var windUnit = window.hkSettings && window.hkSettings.unit
          ? window.hkSettings.unit(src.wind ? states[src.wind] : st,
                                   src.wind ? null : 'wind_speed_unit', 'mph')
          : 'mph';
        // conditionName, not a title-case of the id: 'partlycloudy' has no
        // separator to split on and would print as "Partlycloudy".
        var cond = window.hkHeader && window.hkHeader.conditionName
          ? window.hkHeader.conditionName(st.state) : String(st.state || '');

        var line2 = [];
        if (feels !== null) line2.push('Feels ' + Math.round(feels) + '°');
        if (hum !== null) line2.push(Math.round(hum) + '% humidity');

        // AN HOURLY SLOT THAT HAS ENDED IS NOT "NOW". A forecast sensor keeps
        // what the provider last sent, and that list can start with the hour
        // that just finished: at 22:07 the house's began at 21:00, so the 9 PM
        // forecast was labelled Now and "10 PM" came second. A slot covers an
        // hour from its datetime; the first one still open is the one we are in.
        var now = Date.now();
        var hrs = this._forecast('hourly', src.hourly).filter(function (h) {
          return !(Date.parse(h.datetime) + 3600e3 <= now);
        }).slice(0, nHours);
        var days = this._forecast('daily', src.daily).slice(0, nDays);

        var hourCells = hrs.map(function (h, i) {
          var d = new Date(h.datetime), hh = d.getHours();
          var label = i === 0 ? 'Now'
            : (hh % 12 === 0 ? 12 : hh % 12) + ' ' + (hh < 12 ? 'AM' : 'PM');
          var tt = num(h.temperature), pop = num(h.precipitation_probability);
          return '<div class="cell">' +
            '<div class="lbl' + (i === 0 ? ' now' : '') + '">' + label + '</div>' +
            // Moon after dark. Providers that send is_daytime are believed;
            // OpenWeatherMap does not, so sun.sun's times decide (nightAt).
            glyph(h.condition, 26, h.is_daytime != null ? h.is_daytime === false
              : !!(window.hkHeader && window.hkHeader.nightAt &&
                   window.hkHeader.nightAt(states, h.datetime))) +
            '<div class="hi">' + (tt !== null ? Math.round(tt) : '--') + '°</div>' +
            '<div class="pop' + (pop >= 20 ? ' wet' : '') + '">' +
              (pop !== null ? Math.round(pop) : 0) + '%</div>' +
            '</div>';
        }).join('');

        var dayCells = days.map(function (d, i) {
          var dt = new Date(d.datetime);
          var label = i === 0 ? 'Today'
            : dt.toLocaleDateString('en-US', { weekday: 'short' });
          var hi = num(d.temperature), lo = num(d.templow);
          return '<div class="cell">' +
            '<div class="lbl' + (i === 0 ? ' now' : '') + '">' + label + '</div>' +
            // A DAY is never night: OpenWeatherMap's daily entries can carry
            // `clear-night` (it summarises from a night-time reading), which
            // would draw a moon under "Wed". Read it as the clear day it is.
            glyph(d.condition === 'clear-night' ? 'sunny' : d.condition, 26, false) +
            '<div class="hi">' + (hi !== null ? Math.round(hi) : '--') + '°</div>' +
            '<div class="lo">' + (lo !== null ? Math.round(lo) : '--') + '°</div>' +
            '</div>';
        }).join('');

        var tracks = function (n) {
          return 'grid-template-columns:repeat(' + n + ',minmax(0,1fr))';
        };

        this._root.innerHTML =
          '<ha-card class="band"><div class="wrap' + (narrow ? ' narrow' : '') + '">' +
            '<div class="now">' +
              '<div class="place">' + esc(cfg.place || this._place()) + '</div>' +
              '<div class="temp">' + (t !== null ? Math.round(t) : '--') + '°</div>' +
              '<div class="cond">' + esc(cond || '--') + '</div>' +
              '<div class="sub">' + line2.join(' · ') + '</div>' +
              (wind !== null ? '<div class="sub wind">' + Math.round(wind) + ' ' + windUnit + ' wind</div>' : '') +
            '</div>' +
            '<div class="rule"></div>' +
            '<div class="cols">' +
              '<div class="strip" style="' + tracks(hrs.length || nHours) + '">' + hourCells + '</div>' +
              '<div class="hrule"></div>' +
              '<div class="strip" style="' + tracks(days.length || nDays) + '">' + dayCells + '</div>' +
            '</div>' +
          '</div></ha-card>';

        // Bound per render, not once: _render replaces innerHTML wholesale, so
        // the previous ha-card and its listener are discarded with it. There
        // is nothing to accumulate.
        var card = this._root.querySelector('ha-card');
        if (card) {
          this._bind(card, 'tap_action', null);
          // Only look tappable when it is. `pointer` on a card that does
          // nothing is a promise the card does not keep.
          var act = (this._config.tap_action || {}).action;
          card.style.cursor = (act && act !== 'none') ? 'pointer' : '';
        }
      }

      getCardSize() { return 4; }
    }

    // ------------------------------------------------------------------
    // THE HEADER'S TWO HALVES AS CARDS.
    //
    // A CARD IS CONFIGURED AT ITS CALL SITE. A shared YAML snippet arrives by
    // `!include`, an include takes no keys, and custom:layout-card forwards
    // only grid*/place-* to children -- so the only way to size one
    // differently per dashboard would be CSS custom properties published by a
    // whole extra theme and read through `var()` in an inline style. As a
    // card, the Tesla writes `main_size: 26px` next to it and needs no theme.
    //
    // BOTH ARE THIN. The markup is hk-header.js's -- the same builders the wall
    // header itself calls -- so these cards are option mapping and a plate,
    // and cannot drift from the header.
    function opts(cfg, map) {
      var o = {};
      for (var k in map) { if (cfg[k] != null) o[map[k]] = cfg[k]; }
      return o;
    }

    var SHADOW = 'drop-shadow(0px 1px 3px rgba(0,0,0,0.30)) '

      + 'drop-shadow(0px 3px 12px rgba(0,0,0,0.28)) '

      + 'drop-shadow(0px 6px 26px rgba(0,0,0,0.30))';

    var MISSING = '<div style="padding:8px 0;opacity:.6">Header module unavailable</div>';

    class HkWeatherStripCard extends Base {
      static get CSS() {
        // Same reason as the clock: on the screensaver the shadow is a
        // text-shadow inherited from WallPanel's info box, and ha-card clips
        // by default -- which cuts the 68px blur into a hard grey band.
        return ':host{overflow:visible}' +
               'ha-card.strip{background:none;border:none;box-shadow:none;' +
               'padding:2px 3px 0 3px;display:block;overflow:visible}' +
               'ha-card.strip.tappable{cursor:pointer}' +
               '.strip div,.strip span{overflow:visible}' +
               // fitted to its width, as the header is (hkHeader.fitWeather)
               fitCss('ha-card.strip');
      }
      // No entity in the config: the one chosen in Configure -> Weather and
      // sky, else the house's first weather entity. Re-resolved on every
      // hass, so it follows an edit in Configure.
      setConfig(config) {
        this._hkExplicit = !!(config && config.entity);
        var c = Object.assign({}, config);
        if (!c.entity) c.entity = this._autoEntity(this._hass);
        super.setConfig(c);
      }
      _autoEntity(h) {
        var HS = window.hkSettings;
        if (!HS) return null;
        return h ? HS.weatherId(h.states) : HS.get('weather.entity', null);
      }
      get hass() { return super.hass; }
      set hass(h) {
        if (this._config && !this._hkExplicit) {
          var id = this._autoEntity(h);
          if (id && this._config.entity !== id) { this._config.entity = id; this._hkSig = null; }
        }
        super.hass = h;
      }

      // TAP.
      //
      // THE LISTENER GOES ON _root, NOT ON THE ha-card. _render() reassigns
      // this._root.innerHTML on every state change, so anything bound to the
      // card inside it is discarded a few seconds later -- the tap would work
      // once and then stop, which is worse than not working at all. _root is
      // the div HkBase creates and it is never replaced.
      //
      // NO DEFAULT ACTION. The screensaver uses this card too, where a tap
      // must do nothing at all (WallPanel dismisses on touch, and navigating
      // out from under the screensaver would be a surprise). So a dashboard
      // that wants a tap says so and the screensaver stays inert.
      _wireTap() {
        if (this._tapWired) return;
        var ta = this._config && this._config.tap_action;
        if (!ta || ta.action === 'none') return;
        this._tapWired = true;
        this._bind(this._root, 'tap_action', null);
      }
      _sigOf() {
        var h = this._hass, c = this._config;
        if (!h || !c) return null;
        var st = h.states[c.entity];
        // sun.sun too: the glyph turns to a moon at sunset, and the weather
        // entity may not update for another ten minutes after it.
        var sun = h.states['sun.sun'];
        return c.entity + '=' + (st ? st.last_updated : 'x') + ';sun=' + (sun ? sun.state : 'x');
      }
      _render() {
        if (!this._config || !this._hass) return;
        var c = this._config;
        var H = window.hkHeader;
        var body = H ? H.weather(this._hass.states, Object.assign({
          width: '100%', boxSizing: 'border-box'
        }, opts(c, {
          glyph_size: 'glyph',
          main_size: 'mainSize', main_letter_spacing: 'mainLs',
          detail_size: 'detailSize', detail_letter_spacing: 'detailLs',
          detail_gap: 'detailGap', gap: 'gap',
          color: 'fg', dim_color: 'fgDim', shadow: 'selfShadow',
          variant: 'variant', unit: 'unit', temp_gap: 'tempGap',
          icon_gap: 'iconGap'
        }))) : MISSING;
        // The strip has no shadow of its own unless asked -- the wall sits on a
        // photo and needs one, the car sits on a flat background where the same
        // shadow reads as dirt, so `shadow` is stated per call site.
        var ta = c.tap_action;
        var tappable = (ta && ta.action !== 'none') ? ' tappable' : '';
        // `layer: true` (the screensaver sets it): see the clock card below.
        this._root.innerHTML = '<ha-card class="strip' + tappable + '" style="margin:' +
          (c.margin != null ? c.margin : '0 0 12px 0') +
          (c.layer ? ';will-change:transform' : '') + '">' + body + '</ha-card>';
        this._wireTap();
        var self = this;
        fitOnResize(this, function (H) { H.fitWeather(self._root.querySelector('ha-card.strip')); });
      }
      getCardSize() { return 1; }
    }

    class HkClockCard extends Base {
      static get CSS() {
        // OVERFLOW VISIBLE, and it is load-bearing on the screensaver: the
        // shadow there is a text-shadow inherited from WallPanel's info box,
        // and ha-card clips by default, so the 68px blur comes out as a hard
        // grey band round the clock. `:host` too -- a shadow that escapes the
        // card is still clipped by the host element.
        return ':host{overflow:visible}' +
               'ha-card.clock{background:none;border:none;box-shadow:none;' +
               'padding:0;display:block;overflow:visible}' +
               '.clock>div,.clock div{overflow:visible}';
      }
      // The clock's time ticks every minute and its date every day (the Time &
      // Date sensors chosen in Configure, or this screen's clock); neither is
      // named in the config, so the base signature would never redraw.
      _sigOf() {
        var h = this._hass;
        if (!h) return null;
        var HS = window.hkSettings;
        if (!HS) {
          return ((h.states['sensor.time'] || {}).state || '') + '|' +
                 ((h.states['sensor.date'] || {}).state || '');
        }
        var ck = HS.clock(h.states);
        return ck.time + '|' + ck.date;
      }
      _render() {
        if (!this._hass) return;
        var c = this._config || {};
        var H = window.hkHeader;
        var body = H ? H.clock(this._hass.states, Object.assign(opts(c, {
          time_size: 'timeSize', ampm_size: 'ampmSize', date_size: 'dateSize',
          time_letter_spacing: 'timeLs', ampm_letter_spacing: 'ampmLs',
          date_letter_spacing: 'dateLs', date_gap: 'dateGap',
          color: 'fg', ampm_color: 'fgDim', date_color: 'dateFg',
          date_format: 'dateFormat', time_line_height: 'timeLh', gap: 'gap',
          clip: 'clip'
        }), { timeShift: this._shift || 0 })) : MISSING;
        // `shadow: true` is the header's own three-stage drop-shadow, and it
        // is not decoration -- it is what makes white type legible on a BRIGHT
        // daytime sky. On a flat plate the clock needs nothing.
        //
        // `filter`, not `text-shadow`: text-shadow is painted per element and
        // clipped by that element's own overflow, and every line in the clock
        // is nowrap + overflow:hidden for the ellipsis. A filter applies after
        // the element and its descendants have rendered and clipped. The card
        // must have NO background for it (it has none), and nothing inside may
        // carry its own or it doubles.
        var st = 'margin:' + (c.margin != null ? c.margin : '0');
        if (c.height) st += ';height:' + c.height;
        if (c.padding) st += ';padding:' + c.padding;
        if (c.shadow) st += ';filter:' + SHADOW;
        // `layer: true` GIVES THE CLOCK ITS OWN COMPOSITING LAYER, and only the
        // WallPanel screensaver asks for it. There the text sits
        // over photo layers that WallPanel creates and destroys at every photo
        // change; without a layer of its own, a tablet WebView regroups the
        // text with them and re-rasters 150px digits under a 68px-blur shadow
        // -- the time, date and weather flicker around each photo change.
        // A/B-tested on a wall tablet. Opt-in, because a layer costs
        // GPU memory and the wall header and the car have nothing moving
        // underneath. Not a filter/transform on WallPanel's info box: that
        // would become the containing block of the fixed now-playing and
        // timer rows and unpin them from their corners.
        if (c.layer) st += ';will-change:transform';
        // morph, not innerHTML: this runs every minute on the screensaver, and
        // rebuilding the 150px time recreates its layer (the header flicker).
        window.hkCards.morph(this._root,
          '<ha-card class="clock" style="' + st + '">' + body + '</ha-card>');
        this._align();
      }
      // Line the time's first stroke up with the date's (hkHeader.clockShift).
      // Redraws only when the correction CHANGES -- the hour gaining or losing
      // a digit -- so a normal minute tick is still one text change.
      _align() {
        var H = window.hkHeader, self = this;
        if (!H || !H.clockShift || this._aligning) return;
        var s = H.clockShift(this._root);
        if (s === null) {                              // font still loading
          if (document.fonts && !this._fontWait) {
            this._fontWait = true;
            document.fonts.ready.then(function () { self._fontWait = false; self.requestUpdate(); });
          }
          return;
        }
        if (Math.abs(s - (this._shift || 0)) < 0.5) return;
        this._shift = s;
        this._aligning = true;
        try { this.redraw(); } finally { this._aligning = false; }
      }
      getCardSize() { return 1; }
    }

    if (!customElements.get('hk-weather-strip-card')) {
      customElements.define('hk-weather-strip-card', HkWeatherStripCard);
    }
    if (!customElements.get('hk-clock-card')) {
      customElements.define('hk-clock-card', HkClockCard);
    }
    if (C.editor) {
      var stag = C.editor('hk-weather-strip-card', [
        { name: 'entity', selector: { entity: { filter: { domain: 'weather' } } },
          helper: 'Default: the weather entity chosen in HK Frontend -> Configure -> Weather.' },
        C.section('Appearance', [
          { type: 'grid', name: '', schema: [
            { name: 'main_size', selector: { text: {} } },
            { name: 'detail_size', selector: { text: {} } },
            { name: 'glyph_size', selector: { text: {} } },
            { name: 'gap', selector: { text: {} } },
            { name: 'color', selector: { text: {} } },
            { name: 'dim_color', selector: { text: {} } },
            { name: 'shadow', selector: { text: {} }, helper: 'CSS text-shadow, or none.' },
            { name: 'margin', selector: { text: {} } }
          ] }
        ], 'mdi:palette'),
        C.section('Interactions', [
          { name: 'tap_action', selector: { ui_action: {} } }
        ], 'mdi:gesture-tap')
      ]);
      HkWeatherStripCard.getConfigElement = function () { return document.createElement(stag); };
      var ctag = C.editor('hk-clock-card', [
        { name: 'date_format', selector: window.hkCards.selOptions(['weekday', 'monthday']) },
        C.section('Appearance', [
          { type: 'grid', name: '', schema: [
            { name: 'time_size', selector: { text: {} } },
            { name: 'ampm_size', selector: { text: {} } },
            { name: 'date_size', selector: { text: {} } },
            { name: 'color', selector: { text: {} } },
            { name: 'date_color', selector: { text: {} } },
            { name: 'shadow', selector: { boolean: {} } },
            { name: 'time_line_height', selector: { text: {} } }
          ] }
        ], 'mdi:palette'),
        C.section('Layout', [
          { type: 'grid', name: '', schema: [
            { name: 'height', selector: { text: {} } },
            { name: 'padding', selector: { text: {} } },
            { name: 'margin', selector: { text: {} } },
            { name: 'gap', selector: { text: {} } }
          ] }
        ], 'mdi:ruler')
      ]);
      HkClockCard.getConfigElement = function () { return document.createElement(ctag); };
    }
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: 'hk-weather-strip-card', name: 'HK Weather Strip',
      description: 'The current temperature and conditions, as on the wall header.', preview: true
    });
    window.customCards.push({
      type: 'hk-clock-card', name: 'HK Clock',
      description: 'The time and date, as on the wall header.', preview: true
    });

    if (!customElements.get('hk-weather-band-card')) {
      customElements.define('hk-weather-band-card', HkWeatherBandCard);
    }
    if (C.editor) {
      var etag = C.editor('hk-weather-band-card', [
        { name: 'entity', required: true, label: 'Weather entity', selector: { entity: { filter: { domain: 'weather' } } } },
        { type: 'grid', name: '', schema: [
          { name: 'hours', selector: { number: { min: 1, max: 24, mode: 'box' } } },
          { name: 'days', selector: { number: { min: 1, max: 10, mode: 'box' } } },
          { name: 'place', selector: { text: {} } }
        ] },
        C.section('Layout', [
          { type: 'grid', name: '', schema: [
            { name: 'min_hour_col', selector: { number: { min: 20, max: 120, mode: 'box' } } },
            { name: 'min_day_col', selector: { number: { min: 20, max: 160, mode: 'box' } } }
          ] }
        ], 'mdi:ruler'),
        C.section('Interactions', [
          { name: 'tap_action', selector: { ui_action: {} } }
        ], 'mdi:gesture-tap')
      ]);
      HkWeatherBandCard.getConfigElement = function () {
        return document.createElement(etag);
      };
    }
    HkWeatherBandCard.getStubConfig = function (hass) {
      return { entity: C.firstOf(hass, 'weather'), hours: 12, days: 8 };
    };
    // Without a stub the card picker previews the clock and weather strip
    // empty.
    if (!Object.prototype.hasOwnProperty.call(HkClockCard, 'getStubConfig')) {
      HkClockCard.getStubConfig = function () { return {}; };
    }
    if (!Object.prototype.hasOwnProperty.call(HkWeatherStripCard, 'getStubConfig')) {
      HkWeatherStripCard.getStubConfig = function (hass) { return { entity: C.firstOf(hass, 'weather') }; };
    }
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: 'hk-weather-band-card', name: 'HK Weather Band',
      description: 'Current conditions with an hourly and a daily forecast.',
      preview: true
    });
    if (!customElements.get('hk-alert-card')) {
      customElements.define('hk-alert-card', HkAlertCard);
    }
    if (!customElements.get('hk-screensaver-status-card')) {
      customElements.define('hk-screensaver-status-card', HkScreensaverStatusCard);
      window.customCards.push({ type: 'hk-screensaver-status-card', name: 'HK Screensaver Home Status',
        description: 'The house at a glance, top-right of a photo screensaver: Home Secured, or what is open and unlocked.' });
    }
    if (C.editor) {
      var sstag = C.editor('hk-screensaver-status-card', [
        { type: 'grid', name: '', schema: [
          { name: 'line1_size', label: 'First line size', helper: 'Default 36px.', selector: { text: {} } },
          { name: 'line_size', label: 'Other lines size', helper: 'Default 24px.', selector: { text: {} } }
        ] }
      ]);
      HkScreensaverStatusCard.getConfigElement = function () { return document.createElement(sstag); };
    }
    HkScreensaverStatusCard.getStubConfig = function () { return {}; };
    if (C.editor) {
      var atag = C.editor('hk-alert-card', [
        { name: 'entity', required: true, label: 'Alerts sensor',
          helper: 'The NWS Alerts sensor. The card shows only while an alert is active.',
          selector: { entity: { filter: { domain: 'sensor' } } } },
        { type: 'grid', name: '', schema: [
          { name: 'title', selector: { text: {} } },
          { name: 'source', selector: { text: {} } },
          { name: 'icon', selector: { icon: {} } }
        ] }
      ]);
      HkAlertCard.getConfigElement = function () { return document.createElement(atag); };
    }
    HkAlertCard.getStubConfig = function () {
      var HS = window.hkSettings;
      return { entity: (HS && HS.get('weather.alerts', null)) || '' };
    };
    window.customCards.push({
      type: 'hk-alert-card', name: 'HK Weather Alert',
      description: 'Shows active severe-weather alerts from the NWS Alerts integration.',
      preview: true
    });

    if (!customElements.get('hk-header-card')) {
      customElements.define('hk-header-card', HkHeaderCard);
    }
    if (C.editor) {
      var htag = C.editor('hk-header-card', [
        { type: 'grid', name: '', schema: [ // tapping each half opens a page
          { name: 'weather_path', selector: { text: {} } },
          { name: 'alarm_path', selector: { text: {} } }
        ] }
      ]);
      HkHeaderCard.getConfigElement = function () { return document.createElement(htag); };
    }
    HkHeaderCard.getStubConfig = function () { return {}; };
    window.customCards.push({
      type: 'hk-header-card', name: 'HK Wall Header',
      description: 'The wall tablet header: clock, date and weather, with the security summary.',
      preview: true
    });

    if (!customElements.get('hk-weather-tile-card')) {
      customElements.define('hk-weather-tile-card', HkWeatherTileCard);
    }
    if (C.editor) {
      var wtag = C.editor('hk-weather-tile-card', [
        { name: 'variant', required: true, label: 'Shows',
          selector: C.selOptions(['wind', 'sun', 'moon', 'uv']) },
        { name: 'caption', selector: { text: {} }, helper: 'Replaces the heading, e.g. WIND.' },
        C.section('Sensors', [
          { type: 'grid', name: '', schema: [
            { name: 'entity', label: 'Weather entity', selector: { entity: { filter: { domain: 'weather' } } } },
            { name: 'speed', selector: { entity: { filter: { domain: 'sensor' } } } },
            { name: 'gust', selector: { entity: { filter: { domain: 'sensor' } } } },
            { name: 'sun', selector: { entity: { filter: { domain: 'sun' } } } },
            { name: 'phase', selector: { entity: { filter: { domain: 'sensor' } } } },
            { name: 'uv', selector: { entity: { filter: { domain: 'sensor' } } } }
          ] }
        ], 'mdi:weather-partly-cloudy', true),
        C.section('Interactions', [
          { name: 'tap_action', selector: { ui_action: {} } }
        ], 'mdi:gesture-tap')
      ]);
      HkWeatherTileCard.getConfigElement = function () {
        return document.createElement(wtag);
      };
    }
    HkWeatherTileCard.getStubConfig = function () {
      var HS = window.hkSettings;
      return { variant: 'uv', uv: (HS && HS.get('weather.uv', null)) || '' };
    };
    window.customCards.push({
      type: 'hk-weather-tile-card', name: 'HK Weather Tile',
      description: 'A small tile for wind, sunrise and sunset, the moon, or the UV index.',
      preview: true
    });

    window.hkWeather = { version: '1.4.0', HkWeatherBandCard: HkWeatherBandCard,
      HkWeatherStripCard: HkWeatherStripCard, HkClockCard: HkClockCard,
      HkWeatherTileCard: HkWeatherTileCard, HkHeaderCard: HkHeaderCard, HkAlertCard: HkAlertCard,
      HkScreensaverStatusCard: HkScreensaverStatusCard };
    return true;
  }

  // Same rule as every other card file here: hk-base.js is a parallel-loaded
  // resource, so wait for its READY EVENT rather than polling. rAF never fires
  // in a hidden tab, which is where a wall tablet spends most of its life.
  if (!boot()) window.addEventListener('hk-cards-ready', boot, { once: true });
})();
