// hk-energy.js -- the energy charts: daily usage tiles, the live trace, the battery strip
//
// hk-usage-card, hk-trace-card, hk-battery-strip-card. Data and drawing come
// from modules/hk-stats.js and modules/hk-charts.js.
//
// One file per family of cards, so each file's name says what is in it.
// Shared pieces -- HkBase, the editor helpers, register(), create(), the
// snapshot cache -- come from hk-base.js through window.hkCards.
(function () {
  'use strict';

  // hk-base.js is a Lovelace resource fetched in PARALLEL with this one, so
  // wait for its ready EVENT (never poll: rAF does not fire in a hidden tab,
  // and a tablet behind the screensaver would define nothing -- see
  // hk-base.js).
  function whenBase(fn) {
    if (window.hkCards && window.hkCards.register) return fn(window.hkCards);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.register) fn(window.hkCards);
      else console.error('[hk-energy] hk-cards-ready fired without hk-base.js');
    }, { once: true });
  }

  whenBase(function (C) {
  if (window.hkEnergy) return;                  // double-load guard
  var HkBase = C.HkBase, register = C.register, firstOf = C.firstOf,
      create = C.create;

  // ----------------------------------------------------------- hk-usage
  //
  // A DAILY COMPARISON: a caption, a headline figure, a sentence saying how
  // this compares with the usual, and a fortnight of bars under it. Used on
  // the energy and weather pages.
  //
  // hk-charts.js does ALL of the work -- hkChart.usage(hass, stat, card, opts)
  // returns {val, sub, chart} and wakes the card through requestUpdate when
  // its statistics arrive. This card is the plate, the type scale and the
  // grid around those three fields.
  //
  // `opts` is passed through UNTOUCHED. Every one of its keys belongs to
  // hk-charts.js (colour, source, format, noun, unit, delta, baseline,
  // statOpts, height, scale...), and re-declaring them here would be a second
  // place to keep them in step. See that file for what they mean.
  class HkUsageCard extends HkBase {
    static get CSS() {
      return [
        // The glass plate, its padding, and the caption/value type scale --
        // the same material hk_glass_tile gives every pop-up tile.
        'ha-card.usage{box-sizing:border-box;display:block;border-radius:' + window.hkCards.M.radius + ';',
        '  height:var(--hk-usage-height,214px);padding:15px 16px 13px 16px;margin:0;',
        '  ' + window.hkCards.M.glass + ';',
        '  border:' + window.hkCards.M.border + ';',
        '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12);',
        '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
        // Four stacked text rows plus the plot. Fixed height rather than auto
        // so a row of these stays flush when one device's comparison sentence
        // wraps to two lines.
        '.usage .grid{display:grid;height:100%;',
        '  grid-template-areas:"nm" "val" "sub" "chart";',
        '  grid-template-columns:minmax(0,1fr);',
        '  grid-template-rows:min-content min-content min-content minmax(0,1fr);',
        '  justify-items:start;align-content:start;row-gap:0}',
        // LEFT, like the Home app's Energy page. width:100% without text-align
        // inherits a centred parent's alignment and the title floats over a
        // left-aligned stat.
        //
        // The PILL name scale, not the hk_popup_tile caps: these cards sit
        // beside pills, and an uppercase tracked caption here would read as a
        // heading for the section rather than a label on the tile.
        '.usage .nm{grid-area:nm;text-align:left;font-size:14px;font-weight:600;',
        '  letter-spacing:-0.15px;line-height:1.15;color:rgba(255,255,255,0.62);',
        '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}',
        // 22px, not hk_popup_tile's 25px: that scale assumes two rows of text,
        // and at 25 the headline crowds the sentence under it.
        '.usage .val{grid-area:val;font-size:22px;font-weight:700;',
        '  letter-spacing:-0.45px;line-height:1.25;color:rgba(255,255,255,0.94);',
        '  white-space:nowrap}',
        '.usage .sub:empty{display:none}',
        '.usage .sub{grid-area:sub;text-align:left;font-size:12.6px;',
        '  font-weight:400;letter-spacing:-0.05px;line-height:1.25;',
        '  color:rgba(235,235,235,0.62);width:100%;white-space:normal}',
        '.usage .chart{grid-area:chart;justify-self:stretch;align-self:end;',
        '  width:100%;margin-top:10px}',
        // ---- `align: center`, opt-in
        //
        // The default above is LEFT on purpose and stays that way: on the
        // Energy page left-aligned mirrors the Home app. On the weather page
        // one sits in a row with the four hk-weather-tile-cards, and those are
        // centred both ways -- one left-aligned tile in a row of centred ones
        // reads as a mistake.
        //
        // THE HEADING STAYS PINNED TO THE TOP, and that is the whole reason
        // this is not a plain `align-content:center`. The four tiles beside it
        // pack their captions to the top of the plate, and all five headings
        // sit on one line (measured: the same ink top on every card). Centring
        // the whole stack pushes this one 15px down and breaks that.
        //
        // So: `start`, with the VALUE's row taking the slack instead of the
        // chart's. The value then centres in whatever space is left between
        // the heading and the chart -- which is what makes the card look
        // settled once `compare: false` removes the sentence.
        //
        // The chart is NOT centred horizontally -- justify-self:stretch above
        // beats justify-items, which is what keeps it full width. A bar chart
        // shrunk to its content would be a different chart.
        '.usage.mid .grid{justify-items:center;align-content:start;',
        '  grid-template-rows:min-content minmax(0,1fr) min-content min-content}',
        '.usage.mid .val{align-self:center}',
        // THE NAME TAKES THE WEATHER TILES' CAPTION. The four
        // hk-weather-tile-cards beside this one on the weather page are the
        // reference: their `.wtile .cap` is the row's heading, so this card
        // adopts it rather than the other way round. Copied from
        // cards/hk-weather.js -- CHANGE ONE, CHANGE BOTH.
        //
        //     12px / 600 / +0.9px tracking / white 0.50 / UPPERCASE
        //
        // text-transform, NOT an uppercase string: the text is a `name:` from
        // YAML, and shouting belongs in the presentation rather than in the
        // config somebody reads.
        //
        // line-height:INHERIT, not normal and not a number. `.wtile .cap` sets
        // none at all, so it picks up the theme's (1.6 here) and its box is
        // 19px at 12px type. `.usage .nm` pins 1.15, and `normal` gives 15px:
        // the heading sits 4px shorter than the four beside it. Inheriting is
        // what actually tracks the tiles, whatever the theme says.
        //
        // It stays LEFT while the value and the sentence centre -- the shape
        // of the whole row: heading left, body centred.
        '.usage.mid .sub,.usage.mid .val{text-align:center}',
        // 14px top, matching `.wtile`'s padding: with `.usage`'s own 15px the
        // heading's ink sits exactly 1px below the four beside it (measured
        // on the page).
        '.usage.mid{padding-top:14px}',
        '.usage.mid .nm{justify-self:start;text-align:left;font-size:12px;',
        '  font-weight:600;letter-spacing:0.9px;line-height:inherit;',
        '  text-transform:uppercase;color:rgba(255,255,255,0.5)}'
      ].join('');
    }
    setConfig(config) {
      if (!config || !config.stat) throw new Error('hk-usage: `stat` is required');
      super.setConfig(config);
    }
    getCardSize() { return 3; }

    // The tile reads STATISTICS, which arrive asynchronously and are not in
    // hass.states at all -- so the default signature would gate out exactly
    // the update this card exists to show. `entity` is the live sensor and
    // moves often enough to keep the tile current; hkChart caches the
    // statistics and calls requestUpdate when a fetch lands.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var s = h.states[c.entity || c.stat];
      return (s ? s.last_updated : 'x') + '|' + (window.hkChart ? '1' : '0');
    }

    _render() {
      var cfg = this._config;
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="usage' + (cfg.align === 'center' ? ' mid' : '') +
          '" data-hk-role="card"><div class="grid">' +
          '<div class="nm" data-hk-role="nm"></div>' +
          '<div class="val" data-hk-role="val"></div>' +
          '<div class="sub" data-hk-role="sub"></div>' +
          '<div class="chart" data-hk-role="chart"></div>' +
          '</div></ha-card>';
        var q = this._root.querySelector.bind(this._root);
        this._e = { card: q('.usage'), nm: q('.nm'), val: q('.val'),
                    sub: q('.sub'), chart: q('.chart') };
        // Only when asked. The energy page wants more-info (the dialog's
        // history graph is the natural next step); the weather row is a row of
        // inert tiles and the chart on its face already IS the history.
        if (cfg.tap_action && cfg.tap_action.action !== 'none') {
          this._bind(this._e.card, 'tap_action', null);
        }
        this._built = true;
      }
      var e = this._e;
      // A per-site height, which is a geometry override rather than a second
      // design: the weather row pins 172px so this tile matches the four
      // beside it, and clips so a long sentence cannot leave the row ragged.
      if (cfg.height) {
        e.card.style.height = cfg.height;
        e.card.style.overflow = 'hidden';
      }
      var nm = cfg.name || '';
      if (e.nm.textContent !== nm) e.nm.textContent = nm;

      var u = (window.hkChart && this._hass)
        ? window.hkChart.usage(this._hass, cfg.stat, this, cfg.opts || {})
        : {};
      // `compare: false` drops the comparison sentence. The chart already
      // shows the fortnight the sentence describes, so on a 172px tile it is
      // a second telling of the same thing and clutters the card. The
      // Energy page's tiles are 214px and keep it.
      //
      // Empty, not absent: the row is min-content so it collapses to nothing,
      // and `.sub:empty{display:none}` stops an empty box carrying its own
      // line-height into the stack.
      var val = u.val || '--', chart = u.chart || '';
      var sub = cfg.compare === false ? '' : (u.sub || '--');
      if (e.val.textContent !== val) e.val.textContent = val;
      if (e.sub.textContent !== sub) e.sub.textContent = sub;
      window.hkCards.morph(e.chart, chart);
    }
  }

  // ----------------------------------------------------------- hk-trace
  //
  // THE LIVE TRACE: a few hours of raw history as a line, with the current
  // value large at the right. Deliberately a DIFFERENT object from
  // hk-usage-card -- that one is a daily comparison and answers "is today
  // normal"; this answers "what is the house doing right now", which no other
  // card on the page does. Statistics are hourly at best and would flatten the
  // steps this exists to show, so hkChart.recent() reads raw recorder history.
  class HkTraceCard extends HkBase {
    static get CSS() {
      return [
        'ha-card.trace{box-sizing:border-box;display:block;border-radius:' + window.hkCards.M.radius + ';',
        '  padding:18px 22px 16px 22px;margin:0;',
        '  ' + window.hkCards.M.glass + ';',
        '  border:' + window.hkCards.M.border + ';',
        '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12);',
        '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
        '.trace .grid{display:grid;',
        '  grid-template-areas:"ttl val" "sub val" "body body";',
        '  grid-template-columns:minmax(0,1fr) max-content;',
        '  grid-template-rows:min-content min-content min-content;',
        '  align-items:start;row-gap:0}',
        '.trace .ttl{grid-area:ttl;justify-self:start;font-size:16px;',
        '  font-weight:700;letter-spacing:-0.2px;line-height:1.25;',
        '  color:rgba(255,255,255,0.94);white-space:nowrap}',
        '.trace .sub{grid-area:sub;justify-self:start;font-size:12px;',
        '  font-weight:400;line-height:1.3;margin-top:2px;',
        '  color:rgba(235,235,235,0.5);white-space:nowrap}',
        // 300 weight at 38px. The reference card's headline is light, not
        // bold -- the trace under it is what carries the emphasis.
        '.trace .val{grid-area:val;grid-row:1 / 3;justify-self:end;',
        '  align-self:center;font-size:38px;font-weight:300;letter-spacing:-1.2px;',
        '  line-height:1;color:rgba(255,255,255,0.96);white-space:nowrap}',
        // The unit set smaller and dimmer beside the numeral, as the reference
        // card does -- one string, two sizes.
        '.trace .val .u{font-size:0.4em;font-weight:500;letter-spacing:0;',
        '  opacity:0.55;margin-left:5px}',
        '.trace .body{grid-area:body;justify-self:stretch;width:100%;margin-top:10px}'
      ].join('');
    }
    setConfig(config) {
      if (!config || !config.entity) throw new Error('hk-trace: `entity` is required');
      super.setConfig(config);
    }
    getCardSize() { return 3; }
    // Raw history arrives asynchronously; the live sensor moving is what keeps
    // the headline current, and hkChart wakes the card when a fetch lands.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var s = h.states[c.entity];
      return (s ? s.last_updated : 'x') + '|' + (window.hkChart ? '1' : '0');
    }
    _render() {
      var cfg = this._config;
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="trace" data-hk-role="card"><div class="grid">' +
          '<div class="ttl" data-hk-role="ttl"></div>' +
          '<div class="sub" data-hk-role="sub"></div>' +
          '<div class="val" data-hk-role="val"></div>' +
          '<div class="body" data-hk-role="body"></div>' +
          '</div></ha-card>';
        var q = this._root.querySelector.bind(this._root);
        this._e = { card: q('.trace'), ttl: q('.ttl'), sub: q('.sub'),
                    val: q('.val'), body: q('.body') };
        if (cfg.tap_action && cfg.tap_action.action !== 'none') {
          this._bind(this._e.card, 'tap_action', null);
        }
        this._built = true;
      }
      var e = this._e;
      if (cfg.margin) e.card.style.margin = cfg.margin;
      var r = (window.hkChart && this._hass)
        ? window.hkChart.recent(this._hass, cfg.entity, this, cfg.trace || {})
        : {};
      var ttl = r.ttl || (cfg.trace && cfg.trace.title) || '';
      if (e.ttl.textContent !== ttl) e.ttl.textContent = ttl;
      var sub = r.sub || '';
      if (e.sub.textContent !== sub) e.sub.textContent = sub;
      // "1.48 kW" -> the numeral, then the unit in its own smaller run.
      var raw = String(r.val || '--'), parts = raw.split(' ');
      var html = parts.length > 1
        ? (parts[0] + '<span class="u">' + parts.slice(1).join(' ') + '</span>')
        : raw;
      window.hkCards.morph(e.val, html);
      var body = r.chart || '';
      window.hkCards.morph(e.body, body);
    }
  }

  // ------------------------------------------------- hk-battery-strip
  //
  // The house battery as one band: what it is doing, how much is in it, how
  // long that lasts, and a capsule showing the charge against its reserve and
  // its limit. Every figure is a named entity in the config.
  //
  // NEVER FORMAT A POWER SENSOR ON ITS RAW NUMBER: one home's power sensors
  // can report kW and W side by side. hkChart.power reads the
  // entity's own unit; {watts: true} returns a comparable number and the plain
  // call returns a formatted string.
  class HkBatteryStripCard extends HkBase {
    static get CSS() {
      return [
        'ha-card.strip2{box-sizing:border-box;display:block;border-radius:' + window.hkCards.M.radius + ';',
        '  padding:15px 18px 13px 18px;margin:0;',
        '  ' + window.hkCards.M.glass + ';',
        '  border:' + window.hkCards.M.border + ';',
        '  box-shadow:inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12);',
        '  cursor:pointer;',
        '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
        // ONE HEADER ROW, NOT A STACK. A title with a sentence under it --
        // "Idle · 21.3 kWh stored · 11h 23m backup" -- reads as text jammed on
        // top of text, and half of that sentence repeats the Battery Flow and
        // Backup Time tiles that sit above this card. So: the name on the
        // left, the reading on the right on one baseline, and the bar with
        // room to breathe.
        '.strip2 .head{display:flex;align-items:baseline;justify-content:space-between;',
        '  gap:12px;min-width:0}',
        '.strip2 .ttl{font-size:15px;font-weight:700;letter-spacing:-0.2px;',
        '  line-height:1.2;color:rgba(255,255,255,0.94);white-space:nowrap;',
        '  overflow:hidden;text-overflow:ellipsis;min-width:0}',
        '.strip2 .read{display:flex;align-items:baseline;gap:8px;flex:0 0 auto}',
        '.strip2 .kwh{font-size:13px;font-weight:500;letter-spacing:-0.05px;',
        '  color:rgba(235,235,235,0.62);white-space:nowrap}',
        '.strip2 .soc{font-size:22px;font-weight:700;letter-spacing:-0.5px;',
        '  line-height:1;color:rgba(255,255,255,0.96);font-variant-numeric:tabular-nums}',
        '.strip2 .body{margin-top:11px;width:100%}'
      ].join('');
    }
    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error('hk-battery-strip: `entity` is the state of charge');
      }
      super.setConfig(config);
    }
    getCardSize() { return 2; }
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var ids = [c.entity, c.discharge, c.stored, c.reserve, c.limit].filter(Boolean);
      var out = '';
      for (var i = 0; i < ids.length; i++) {
        var s = h.states[ids[i]];
        out += ids[i] + '=' + (s ? s.state : 'x') + ';';
      }
      return out;
    }
    _num(id) {
      var s = id && this._st(id);
      var n = Number(s && s.state);
      return isFinite(n) && s && s.state !== '' ? n : null;
    }
    _render() {
      var cfg = this._config;
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="strip2" data-hk-role="card">' +
          '<div class="head"><div class="ttl" data-hk-role="ttl"></div>' +
          '<div class="read"><span class="kwh" data-hk-role="kwh"></span>' +
          '<span class="soc" data-hk-role="soc"></span></div></div>' +
          '<div class="body" data-hk-role="body"></div>' +
          '</ha-card>';
        var q = this._root.querySelector.bind(this._root);
        this._e = { card: q('.strip2'), ttl: q('.ttl'), kwh: q('.kwh'), soc: q('.soc'), body: q('.body') };
        this._bind(this._e.card, 'tap_action', null);
        this._built = true;
      }
      var e = this._e, C = window.hkChart;
      if (cfg.margin) e.card.style.margin = cfg.margin;
      var soc = this._num(cfg.entity);
      var name = cfg.name || 'House Battery';
      if (e.ttl.textContent !== name) e.ttl.textContent = name;
      var socTxt = soc === null ? '--%' : Math.round(soc) + '%';
      if (e.soc.textContent !== socTxt) e.soc.textContent = socTxt;
      // Stored energy stays: nothing else on the page says it. The state and
      // the backup runtime are left out -- the tiles above say both, and the bar's
      // colour already says charging versus discharging.
      var kwh = this._num(cfg.stored);
      var kwhTxt = kwh === null ? '' : kwh.toFixed(1) + ' kWh';
      if (e.kwh.textContent !== kwhTxt) e.kwh.textContent = kwhTxt;

      var dis = null;
      if (C && this._hass && cfg.discharge) {
        dis = C.power(this._hass.states, cfg.discharge, { watts: true, fallback: null });
      }

      var body = '';
      if (C && soc !== null) {
        // Green while charging or idle; the chart amber while the house is
        // actually pulling from the pack -- the one state where the number is
        // falling and you want to notice.
        var colour = (dis !== null && dis >= 5) ? C.colours.curLo : C.colours.good;
        body = C.capsule(soc, { reserve: this._num(cfg.reserve),
                                limit: this._num(cfg.limit), colour: colour });
      }
      window.hkCards.morph(e.body, body);
    }
  }

  register('hk-usage-card', HkUsageCard, 'HK Usage Tile',
    'Today\'s energy use or runtime compared with the last two weeks, with a bar chart.',
    C && [
      { name: 'stat', required: true, label: 'Daily statistic',
        helper: 'The sensor with long-term statistics to chart.',
        selector: { entity: { filter: { domain: 'sensor' } } } },
      { name: 'name', selector: { text: {} } },
      // Left by default, as on the Energy page. Centre is for a tile that
      // sits in a row of centred weather tiles.
      { name: 'compare', label: 'Comparison sentence',
        helper: 'Off drops the "about the same as ..." line. The chart already shows that fortnight.',
        selector: { boolean: {} } },
      { name: 'align', label: 'Text alignment',
        helper: 'Center to match a row of centered tiles. Left is the default; the chart stays full width either way.',
        selector: { select: { mode: 'dropdown', custom_value: true, options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' } ] } } },
      C.section('Chart', [
        { name: 'opts', selector: { object: {} } },
        { name: 'height', selector: { text: {} }, helper: 'CSS height of the tile, e.g. 172px.' }
      ], 'mdi:chart-bar'),
      C.section('Interactions', [
        { name: 'entity', label: 'Entity to open',
          helper: 'Opened by More info. Defaults to the statistic.', selector: { entity: {} } },
        { name: 'tap_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap')
    ],
    function (hass) { return { stat: firstOf(hass, 'sensor'), name: 'Whole Home' }; });

  register('hk-trace-card', HkTraceCard, 'HK Live Graph',
    'A line graph of the last few hours of a sensor, with its current value.',
    C && [
      { name: 'entity', required: true, selector: { entity: { filter: { domain: 'sensor' } } } },
      { name: 'trace', selector: { object: {} } },
      C.section('Layout', [
        { name: 'margin', selector: { text: {} } }
      ], 'mdi:ruler'),
      C.section('Interactions', [
        { name: 'tap_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap')
    ],
    function (hass) { return { entity: firstOf(hass, 'sensor'),
                               trace: { hours: 3, colour: 'orange' } }; });

  register('hk-battery-strip-card', HkBatteryStripCard, 'HK Battery Strip',
    'A home battery\'s charge level against its reserve and charge limit, with stored energy.',
    C && [
      { name: 'entity', required: true, label: 'Battery level sensor',
        helper: 'Percent charged.', selector: { entity: { filter: { domain: 'sensor' } } } },
      { name: 'name', selector: { text: {} } },
      C.section('Sensors', [
        { type: 'grid', name: '', schema: [
          { name: 'stored', selector: { entity: { filter: { domain: 'sensor' } } } },
          { name: 'discharge', selector: { entity: { filter: { domain: 'sensor' } } },
            helper: 'Turns the bar amber while the house is running on the battery.' },
          { name: 'reserve', selector: { entity: { filter: { domain: 'number' } } } },
          { name: 'limit', selector: { entity: { filter: { domain: 'number' } } } }
        ] }
      ], 'mdi:battery', true),
      C.section('Layout', [
        { name: 'margin', selector: { text: {} } }
      ], 'mdi:ruler'),
      C.section('Interactions', [
        { name: 'tap_action', selector: { ui_action: {} } }
      ], 'mdi:gesture-tap')
    ],
    function (hass) { return { entity: firstOf(hass, 'sensor') }; });

  window.hkEnergy = { version: '1.0.0' };
  });
})();
