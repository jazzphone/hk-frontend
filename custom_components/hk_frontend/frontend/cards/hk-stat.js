// hk-stat.js -- headings and metric readouts as native Lovelace cards.
//
// WHY THESE ARE CARDS, THOUGH THEY HOLD ALMOST NO LOGIC
// A heading could be plain YAML, but a surface where some things are cards
// and some are templates is its own maintenance cost: one card system for
// every surface keeps a template engine from being a hard dependency of
// every heading.
//
// What needs care is the shadows: the heading carries a MEASURED
// text-shadow, and the metric carries a `filter: drop-shadow()` that exists
// because its name and state are both overflow:hidden with an ellipsis -- a
// text-shadow there is clipped into a hard band. Both values are measured.
// Do not tune either by eye.
//
// NOT HERE, deliberately: the weather and usage tiles. They are SHELLS around
// charts drawn by hk-charts.js, which is a different job from formatting a
// state (see hk-weather.js and hk-energy.js).
(function () {
  'use strict';

  if (window.hkStat) return;
  window.hkStat = { version: '1.0.0' };

  // Event, never a poll -- see hk-tile.js for why rAF is wrong here.
  function whenBase(fn) {
    if (window.hkCards && window.hkCards.HkBase) return fn(window.hkCards.HkBase);
    window.addEventListener('hk-cards-ready', function () {
      if (window.hkCards && window.hkCards.HkBase) fn(window.hkCards.HkBase);
      else console.error('[hk-stat] hk-cards-ready fired without HkBase');
    }, { once: true });
  }

  whenBase(function (HkBase) {

  // RESOLVE hk-tile's EXPORTS AT CALL TIME, NEVER AT LOAD TIME.
  //
  // hk-tile.js is a sibling Lovelace resource, so it may not have run yet when
  // this file does -- and `var colourFor = window.hkTile.colourFor || fallback`
  // captures the FALLBACK permanently when it loses that race. The symptom is
  // subtle and survives review: colours still appear, but as the raw CSS
  // keyword ("yellow" -> rgb(255,255,0)) instead of the Home app's mapped
  // rgba(255,204,0,0.98). A per-card test misses it whenever it happens to
  // run after hk-tile has loaded.
  //
  // Same lesson as the HkBase race, one level up: waiting on load order is the
  // bug. Look the dependency up when you need it.
  function tile() { return window.hkTile || {}; }
  function colourFor(cfg, st) {
    var f = tile().colourFor;
    return f ? f(cfg, st) : (cfg.icon_color || 'rgba(200, 200, 200, 0.80)');
  }
  function nameMap() { return tile().NAME_MAP || {}; }

  // hk_metric DOES NOT USE THE DOMAIN MAP, and that is the difference from
  // every tile: its rule is `override -> named colour or literal, else GRAY`,
  // full stop. Reusing hk-tile's colourFor would tint a unit-less sensor
  // blue, because the domain fallback fires.
  //
  // A metric is a readout on the energy page, where a dozen of them sit in a
  // row; letting the domain pick would paint that row in five colours.
  function metricColour(cfg) {
    var o = cfg.icon_color ? String(cfg.icon_color).toLowerCase().trim() : '';
    var M = nameMap();
    if (o) return M[o] || cfg.icon_color;
    return M.gray || 'rgba(200, 200, 200, 0.80)';
  }

  var CSS = [
    ':host{display:block}',

    // ---- heading ---------------------------------------------------------
    // overflow:visible at EVERY level, and it is load-bearing. Where an
    // ha-card clips, a text-shadow that reaches outside the 21px line box
    // comes out as a hard rectangular band; this card simply never closes the
    // clip.
    'ha-card.heading{background:none;border:none;box-shadow:none;',
    '  height:21px;margin:0px;padding:0px 0px 0px 3px;overflow:visible;',
    '  display:flex;align-items:center;justify-content:center;',
    '  font-size:1.2em;text-align:center;',
    '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
    // width:100% is load-bearing. ha-card is flex with justify-content:center,
    // so a min-content grid gets CENTRED in the full card width and the
    // heading lands 600px to the right.
    '.heading .grid{display:grid;width:100%;overflow:visible;align-items:center;',
    '  justify-content:start;grid-template-areas:"n";',
    '  grid-template-columns:min-content;grid-template-rows:21px}',
    // align-self:stretch, because ha-card is a flex box with
    // align-items:center. When a call site makes the card TALLER than the 21px
    // row -- a 42px heading with 18px of lead, as on the energy page -- a
    // CENTRED grid puts the text 2.5px high. Filling the content box and
    // letting the row overflow keeps it on its line. Equal sizes stretch and
    // centre alike, which is why an ordinary heading never shows it.
    '.heading .grid{align-self:stretch}',
    // THE TEXT-SHADOW IS MEASURED. One value covers pages and pop-ups: over an
    // opaque dark sheet it is simply invisible, so there is no second variant.
    // text-shadow rather than filter:drop-shadow here because the name is NOT
    // clipped -- nothing sets overflow:hidden on it, so the shadow escapes on
    // its own. (hk_metric below is the opposite case.)
    '.heading .name{grid-area:n;justify-self:start;align-self:center;',
    '  font-size:19.7px;font-weight:700;line-height:1;letter-spacing:-0.45px;',
    '  color:rgba(255,255,255,0.94);overflow:visible;',
    // nowrap + ellipsis: without them a long heading WRAPS TO FOUR LINES
    // instead of truncating -- an 80px name box against 20.7px.
    '  white-space:nowrap;text-overflow:ellipsis;',
    // content-box so the 1px of padding does not grow the measured box, the
    // same trap as the favourite label in hk-tile.js.
    '  box-sizing:content-box;padding-left:1px;padding-top:1px;',
    '  text-shadow:0 1px 3px rgba(0,0,0,0.30),0 2px 8px rgba(0,0,0,0.22)}',
    // The link variant adds a chevron chip beside the name.
    '.heading.link .grid{grid-template-areas:"n c";',
    '  grid-template-columns:max-content max-content;column-gap:6px}',
    'ha-card.heading.link{cursor:pointer}',
    // MEASURED, not written by eye. Every property below moves the box:
    // letter-spacing is 0.2px over ~17 glyphs, the chevron is heavier than
    // the words, the line-height adds almost a pixel, and the colour is 0.62
    // (0.82 reads as a second heading).
    //
    // margin-top:2px nudges the whole chip down so its optical centre lines
    // up with a 19.7px heading rather than its box centre.
    '.heading .extra{grid-area:c;align-self:center;display:inline-flex;',
    '  align-items:center;gap:3px;padding:3px 9px 3px 10px;border-radius:11px;',
    '  background:rgba(255,255,255,0.11);font-size:11.5px;font-weight:600;',
    '  letter-spacing:0.2px;line-height:1.25;white-space:nowrap;margin-top:2px;',
    '  color:rgba(255,255,255,0.62)}',
    // The chevron is its OWN span -- lighter and bolder than
    // the words beside it. Rendering the whole string as one run makes it a
    // weight-600 glyph at full opacity, which reads as part of the label.
    '.heading .extra .chev{opacity:0.75;font-weight:700}',
    // A ROOM HEADING: "Living Room ›", the Home app's way into a
    // room. A bare chevron, not the chip above -- grey, a little over half the
    // heading's cap height, centred on the name's optical middle. Only the
    // name and chevron take the tap (not the empty width of the row), with
    // the target grown to 44px tall by an invisible margin.
    '.heading.room .grid{grid-template-areas:"n c";grid-template-columns:max-content max-content;',
    '  column-gap:7px;justify-self:start;position:relative;cursor:pointer;',
    '  -webkit-tap-highlight-color:transparent}',
    '.heading.room .grid::after{content:"";position:absolute;inset:-12px -14px -12px -8px}',
    '.heading .rchev{grid-area:c;align-self:center;display:flex;margin-top:1px;',
    '  filter:drop-shadow(0 1px 2px rgba(0,0,0,0.30))}',
    '.heading.room .grid:active{opacity:0.6}',

    // ---- metric ----------------------------------------------------------
    // filter:drop-shadow, NOT text-shadow, and the reason is specific: this
    // card's name and state are both overflow:hidden with an ellipsis, and a
    // text-shadow is clipped by the box that paints it -- a 34px blur on a
    // 21px line box comes out as a hard band. A filter applies AFTER the
    // element has rendered and clipped, so the ellipsis still works and the
    // shadow escapes. Moving it to a wrapper does not help: text-shadow
    // INHERITS, so every line paints and clips its own copy.
    'ha-card.metric{background:none;border:none;box-shadow:none;border-radius:0px;',
    '  height:78px;margin:0px;padding:0px 4px 0px 3px;overflow:visible;',
    '  display:flex;align-items:center;justify-content:center;',
    '  font-size:1.2em;text-align:center;cursor:pointer;',
    '  filter:drop-shadow(0 1px 3px rgba(0,0,0,0.30)) drop-shadow(0 2px 8px rgba(0,0,0,0.22));',
    '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0}',
    '.metric .grid{display:grid;width:100%;overflow:visible;',
    '  grid-template-areas:"i n" "i s";grid-template-columns:40px minmax(0,1fr);',
    '  grid-template-rows:min-content min-content;row-gap:3px;column-gap:14px;',
    '  align-content:center;justify-content:start}',
    // width:100%, not 42px. The grid track is 40 and the well resolves to the
    // TRACK -- a literal 42 here is 2px too wide and sits 1px left.
    '.metric .well{grid-area:i;width:100%;height:42px;border-radius:50%;',
    '  background:rgba(0,0,0,0.14);align-self:center;justify-self:center;',
    '  display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.metric .icon{width:23px;height:23px;--mdc-icon-size:100%;display:flex;align-items:center;justify-content:center;line-height:0;}',
    // The label is uppercase, wide-tracked and half-opacity -- a caption, not
    // a name. 0.9px of POSITIVE tracking, which is the opposite of every tile
    // in this library and is correct: small uppercase needs opening up.
    '.metric .name{grid-area:n;justify-self:start;align-self:end;',
    '  font-size:12px;font-weight:600;letter-spacing:0.9px;text-transform:uppercase;',
    '  color:rgba(255,255,255,0.5);text-align:left;width:100%;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.metric .state{grid-area:s;justify-self:start;align-self:start;',
    '  font-size:25px;font-weight:700;line-height:1.05;letter-spacing:-0.4px;',
    '  color:rgba(255,255,255,0.94);text-align:left;width:100%;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

    // ---- hero / pct / rank pill -----------------------------------------
    // One card, three modes: the hero, percent and rank pills share every
    // style exactly and differ only in what their `hero` cell renders.
    'ha-card.rank{box-sizing:border-box;height:152px;width:var(--hk-pill,192px);',
    '  min-width:var(--hk-pill,192px);max-width:var(--hk-pill,192px);border-radius:' + window.hkCards.M.radius + ';',
    '  padding:12.8px 12.8px;margin:0px;',
    '  border:' + window.hkCards.M.border + ';',
    '  ' + window.hkCards.M.glass + ';',
    '  box-shadow:var(--hk-glass-shadow-tall,inset 0 1px 0 rgba(255,255,255,0.20),0 10px 28px rgba(0,0,0,0.12));',
    '  display:flex;align-items:center;justify-content:center;',
    '  overflow:hidden;text-align:center;font-size:1.2em;cursor:pointer;',
    '  --ha-ripple-hover-opacity:0;--ha-ripple-pressed-opacity:0;',
    '  transition:background-color .25s ease,transform .12s ease}',
    'ha-card.rank:active{transform:scale(0.97);filter:brightness(0.93)}',
    'ha-card.rank[data-on="1"]{background:white}',
    // The reading sits top-left and the well top-RIGHT -- the mirror of a
    // tall tile, which is why this is not a hk_pill_tall variant.
    '.rank .grid{display:grid;width:100%;align-self:stretch;',
    '  grid-template-areas:"hero i" ". ." "n n" "l l";',
    '  grid-template-columns:minmax(0,1fr) 42px;',
    '  grid-template-rows:46px 1fr min-content min-content;',
    '  row-gap:0px;column-gap:8px;align-content:stretch}',
    '.rank .well{grid-area:i;width:42px;height:42px;border-radius:50%;',
    '  background:rgba(0,0,0,0.14);align-self:start;justify-self:end;',
    '  display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.rank .icon{width:23px;height:23px;--mdc-icon-size:100%;display:flex;align-items:center;justify-content:center;line-height:0;}',
    '.rank .hero{grid-area:hero;justify-self:start;align-self:start;',
    '  line-height:1;white-space:nowrap;font-size:30px;font-weight:700;',
    '  letter-spacing:-0.6px;overflow:hidden;text-overflow:ellipsis}',
    '.rank .unit{font-size:0.40em;font-weight:600;letter-spacing:0;',
    '  margin-left:3px;opacity:0.62}',
    '.rank .unit.pct{font-size:0.42em;margin-left:2px}',
    '.rank .name{grid-area:n;justify-self:stretch;align-self:center;',
    '  font-size:14px;font-weight:600;line-height:1.1;letter-spacing:-0.15px;',
    '  color:rgba(255,255,255,0.92);text-align:left;min-width:0;width:100%;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'ha-card.rank[data-on="1"] .name{color:black}',
    '.rank .label{grid-area:l;justify-self:stretch;align-self:start;',
    '  font-size:14px;font-weight:400;line-height:1.1;letter-spacing:-0.15px;',
    '  color:rgba(220,220,220,0.70);text-align:left;min-width:0;width:100%;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'ha-card.rank[data-on="1"] .label{color:rgba(0,0,0,0.65)}',
    // ================================================ PHONE: FILL THE TRACK
    // Below 640px the room grids switch to `repeat(auto-fill, minmax(168px,
    // 1fr))` (see frontend/css/hk-responsive.css), so the track is no longer
    // 192px and a pill pinned to 192px would overflow it. Here the pill fills
    // whatever track it is given instead.
    //
    // WHY `calc(100% + 8px)` AND NOT `100%`: layout-card gives every grid child
    // 4px side margins, so the cell is always 8px narrower than the track
    // (layout-card's card_margin cannot change it). At 1280 the pill is 192px in a 184px
    // cell -- it already overflows by exactly 8px, and that is what makes the
    // visible gap come out at the intended 12px. Plain `100%` would shrink
    // every pill to the cell and change the gap.
    //
    // `--hk-cell-bleed` exists because that 8px is NOT universal: inside
    // hk-row-card the child is sized directly with no layout-card margin, so
    // that card sets the bleed to 0 for its own children. Default 8px = the
    // grid case.
    //
    // No max-width: capping at 192px makes the track wider than the pill on a
    // large phone and the gap jumps 12px -> 25px. Verified 375/402/440/1280.
    '@media (max-width: 640px){',
    // NO `:host{width:100%}` HERE. These hosts are already `display:block`, so
    // an auto width fills the grid area MINUS the 4px side margins layout-card
    // gives every child -- which is exactly the 184px cell the 192px pill is
    // built to overflow by 8. Forcing width:100% resolves against the full
    // grid AREA instead and every tile comes out 8px too wide (190.95 measured
    // against a 182.95 track), eating the 12px gap down to 4px.
    '  :host{max-width:none !important}',
    '  ha-card.rank{width:calc(100% + var(--hk-cell-bleed, 8px));min-width:0;max-width:none}',
    '}',
  ].join('');

  class HkStatBase extends HkBase {
    static get CSS() { return CSS; }
    getCardSize() { return 1; }
  }

  // The section heading, and the section link.
  //
  // `navigation_path` turns it into the link variant. Dashboards have
  // different url_paths and one shared config has to work on all of them --
  // so a relative path ("./cameras") is resolved against the CURRENT
  // dashboard rather than hardcoded.
  class HkHeadingCard extends HkStatBase {
    setConfig(config) {
      if (!config || !config.name) throw new Error('hk-heading: `name` is required');
      super.setConfig(config);
    }
    _sigOf() {
      // No entity: a heading depends on its config alone, so it never needs to
      // re-render on a state change. Returning a constant means the base class
      // gates it out of every hass push. A ROOM heading also
      // depends on where its room page is (and whether headings link at all).
      return this._config && this._config.area ? 'room=' + this._roomPath() : 'static';
    }
    // `area:` -- this dashboard's room page for it (hk-base.js menu.roomPath).
    _roomPath() {
      var M = window.hkCards && window.hkCards.menu;
      return (M && this._config.area) ? M.roomPath(this._config.area) : null;
    }
    _render() {
      var cfg = this._config;
      var room = cfg.navigation_path ? null : this._roomPath();
      var isLink = !!cfg.navigation_path;
      if (this._built && room !== this._roomWas) this._built = false;
      if (!this._built) {
        this._roomWas = room;
        this._root.innerHTML =
          '<ha-card class="heading' + (isLink ? ' link' : '') + (room ? ' room' : '') + '" data-hk-role="card">' +
          '<div class="grid"' + (room ? ' role="link" tabindex="0"' : '') + '>\n<div class="name" data-hk-role="name"></div>\n' +
          (cfg.chevron ? '<div class="extra" data-hk-role="extra"></div>\n' : '') +
          (room ? '<div class="rchev" aria-hidden="true"><svg viewBox="0 0 8 13" width="8" height="13" fill="none"' +
                  ' stroke="rgba(255,255,255,0.55)" stroke-width="2.2" stroke-linecap="round"' +
                  ' stroke-linejoin="round"><path d="M1.6 1.6 L6.4 6.5 L1.6 11.4"/></svg></div>\n' : '') +
          '</div></ha-card>';
        this._e = {
          card: this._root.querySelector('.heading'),
          name: this._root.querySelector('.name'),
          extra: this._root.querySelector('.extra')
        };
        if (isLink) this._e.card.addEventListener('click', this._go.bind(this));
        if (room) {
          var self = this, grid = this._root.querySelector('.grid');
          var go = function () {
            self._act({ action: 'navigate', navigation_path: self._roomWas }, false);
          };
          grid.addEventListener('click', go);
          grid.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        }
        this._built = true;
      }
      // A HEADING IS NOT ALWAYS 21px. Call sites override its box -- a 44px
      // row on the timers page, a 42px one with 18px of lead where the
      // heading sits under something. Those are per-site geometry, not a
      // second design, so they stay per-site options rather than becoming
      // variants; `padding` is passed through verbatim.
      // `height` sizes the CARD only and leaves grid-template-rows at 21px:
      // defaulting the row to the card height re-centres the text and pushes
      // the heading 2.5px up. The row moves only when the call site sets
      // `grid_rows` itself.
      if (cfg.height) this._e.card.style.height = cfg.height;
      if (cfg.grid_rows) {
        this._e.card.querySelector('.grid').style.gridTemplateRows = cfg.grid_rows;
      }
      if (cfg.padding) this._e.card.style.padding = cfg.padding;
      if (this._e.name.textContent !== cfg.name) this._e.name.textContent = cfg.name;
      // A TRAILING CHEVRON IS ITS OWN RUN. `chevron: "See all\u203a"`
      // is one string in the config because that reads well in YAML; it
      // draws as two spans, so it is split apart here.
      if (this._e.extra && this._e.extra.getAttribute('data-txt') !== cfg.chevron) {
        this._e.extra.setAttribute('data-txt', cfg.chevron);
        var txt = String(cfg.chevron), tail = '';
        if (/[\u203a\u276f>]$/.test(txt)) {
          tail = txt.slice(-1);
          txt = txt.slice(0, -1);
        }
        this._e.extra.textContent = txt;
        if (tail) {
          var cv = document.createElement('span');
          cv.className = 'chev';
          cv.textContent = tail;
          this._e.extra.appendChild(cv);
        }
      }
    }
    // The same navigate every tile uses (HkBase._act): "./x" is relative to
    // the CURRENT dashboard, and `navigation_path_map` names the one
    // dashboard where that is the wrong answer. One copy means a heading and
    // a tile with the same path always land on the same page.
    _go() {
      this._act({ action: 'navigate', navigation_path: this._config.navigation_path,
                  navigation_path_map: this._config.navigation_path_map }, false);
    }
  }

  // hk_metric -- an icon well, an uppercase caption and a big value, with no
  // plate under it. Used on the energy and battery pages.
  class HkMetricCard extends HkStatBase {
    setConfig(config) {
      if (!config || !config.entity) throw new Error('hk-stat: `entity` is required');
      super.setConfig(config);
    }
    _render() {
      var cfg = this._config, st = this._st(cfg.entity);
      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="metric" data-hk-role="card"><div class="grid">' +
          '<div class="well" data-hk-role="well"><ha-state-icon class="icon" data-hk-role="icon"></ha-state-icon></div>\n' +
          '<div class="name" data-hk-role="name"></div>\n' +
          '<div class="state" data-hk-role="state"></div>\n' +
          '</div></ha-card>';
        this._e = {
          card: this._root.querySelector('.metric'), icon: this._root.querySelector('.icon'),
          name: this._root.querySelector('.name'), state: this._root.querySelector('.state')
        };
        // _bind, not a hardcoded more-info: these configs carry tap_action
        // (some with a `confirmation`), and a card that always
        // opened the detail dialog would drop it with no visible symptom.
        // No hold key -- the tap contract has no hold anywhere.
        this._bind(this._e.card, 'tap_action', null);
        this._built = true;
      }
      var e = this._e;
      e.icon.style.color = metricColour(cfg);
      if (this._hass) { e.icon.hass = this._hass; e.icon.stateObj = st; }
      var ic = this._icon(st);
      if (ic) e.icon.icon = ic;
      var nm = cfg.name || (st && st.attributes && st.attributes.friendly_name) || cfg.entity;
      if (e.name.textContent !== nm) e.name.textContent = nm;
      // THE FORMATTED STATE, not the raw one. The value shows
      // what HA would show -- "0.51 MB", not "0.51" -- so it carries the unit
      // and the locale's number formatting. hass.formatEntityState is the same
      // function the rest of the frontend uses; the fallback only matters on
      // an older core.
      var val;
      var mode = this._modeValue(st);
      if (mode !== null) {
        val = mode;
      } else if (cfg.value != null) {
        val = cfg.value;
      } else if (st && this._hass && this._hass.formatEntityState) {
        val = this._hass.formatEntityState(st);
      } else if (st) {
        var u = st.attributes && st.attributes.unit_of_measurement;
        val = u ? (st.state + ' ' + u) : st.state;
      } else {
        val = '';
      }
      if (e.state.textContent !== val) e.state.textContent = val;
    }

    // ---- THE VALUE MODES -------------------------------------------------
    //
    // Each mode is a named reading, not a bespoke calculation:
    //
    //   temperature  a rounded degree, from the state or an attribute
    //   power        live watts through hkChart, already unit-formatted
    //   runtime      hours as "19h 3m", or `idle_text` at or below zero
    //   cost         "$1.23 \u00b7 45 kWh" -- a currency sensor and its meter
    //   cost_today   the same, from STATISTICS: today's change of a kWh meter
    //                (`stat`) and of its cost (`cost_stat`), or the kWh times
    //                `price` (a number, or an entity holding one) -- for a
    //                house with no "today's cost" sensor (the Energy page)
    //   flow         two sensors, charge and discharge; whichever is running
    //                wins, with its sign. Also picks the glyph (see _icon).
    //
    // Returns null when no mode applies, so the ordinary formatted state
    // still wins and nothing about the other cards changes.
    _modeValue(st) {
      var cfg = this._config, m = cfg.value_mode;
      if (!m) return null;
      var n = function (v) { return Number.isFinite(Number(v)) ? Number(v) : null; };

      if (m === 'temperature') {
        var t = cfg.value_attribute
          ? (st && st.attributes && st.attributes[cfg.value_attribute])
          : (st && st.state);
        var tv = n(t);
        return tv === null ? '--' : (Math.round(tv) + (cfg.value_suffix || '\u00b0F'));
      }

      if (m === 'runtime') {
        var h = n(st && st.state);
        if (h === null || h <= 0) return cfg.idle_text || 'Standby';
        var whole = Math.floor(h);
        return whole + 'h ' + Math.round((h - whole) * 60) + 'm';
      }

      // hkChart is a separate module that may not have loaded yet. Every mode
      // below needs it, and "--" is the honest answer until it has.
      var C = window.hkChart, h2 = this._hass;
      if (!C || !h2) return '--';
      var watts = function (id) {
        return C.power(h2.states, id, { watts: true, fallback: null });
      };
      var fmt = function (id) { return C.power(h2.states, id); };

      if (m === 'power') return fmt(cfg.power || cfg.entity);

      if (m === 'cost_today') {
        var S2 = window.hkStats;
        if (!S2 || !cfg.stat) return '--';
        var ids = [cfg.stat].concat(cfg.cost_stat ? [cfg.cost_stat] : []);
        var all = S2.daily(h2, ids, 2, this);
        var today = function (id) {
          var a = all && all[id], v = a && a.length ? a[a.length - 1].v : null;
          return Number.isFinite(v) ? v : null;
        };
        var kwh = today(cfg.stat), money = cfg.cost_stat ? today(cfg.cost_stat) : null;
        if (money === null && kwh !== null && cfg.price != null) {
          var pr = typeof cfg.price === 'number' ? cfg.price : n(this._st(cfg.price) && this._st(cfg.price).state);
          if (pr !== null) money = kwh * pr;
        }
        if (kwh === null && money === null) return '--';
        var ms = money === null ? null : ('$' + money.toFixed(2));
        var ks = kwh === null ? null : (Math.round(kwh) + ' kWh');
        return [ms, ks].filter(Boolean).join(' \u00b7 ');
      }

      if (m === 'cost') {
        var c = n(st && st.state);
        var cs = c === null ? '--' : ('$' + c.toFixed(2));
        var k = n(this._st(cfg.value_peer) && this._st(cfg.value_peer).state);
        return k === null ? cs : (cs + ' \u00b7 ' + Math.round(k) + ' kWh');
      }

      if (m === 'flow') {
        // DISCHARGE IS TESTED FIRST. Both sensors can read non-zero at once
        // during a changeover, and "the house is drawing from the battery" is
        // the more urgent of the two readings.
        var dis = watts(cfg.discharge), chg = watts(cfg.charge);
        if (dis !== null && dis >= FLOW_FLOOR) return '\u2212' + fmt(cfg.discharge);
        if (chg !== null && chg >= FLOW_FLOOR) return '+' + fmt(cfg.charge);
        return cfg.idle_text || 'Idle';
      }
      return null;
    }

    // `flow` picks its own glyph from the same two readings the value uses.
    _icon(st) {
      var cfg = this._config;
      if (cfg.value_mode === 'flow' && cfg.icon_flow && window.hkChart && this._hass) {
        var C = window.hkChart, S = this._hass.states;
        var w = function (id) {
          return C.power(S, id, { watts: true, fallback: 0 });
        };
        if (w(cfg.discharge) >= FLOW_FLOOR) return cfg.icon_flow.discharging;
        if (w(cfg.charge) >= FLOW_FLOOR) return cfg.icon_flow.charging;
        return cfg.icon_flow.idle;
      }
      return cfg.icon;
    }

    // A metric may read sensors its `entity` does not name -- the cost tile's
    // meter, the flow tile's two power sensors. Without them in the signature
    // the card renders once and then freezes -- the same trap as the chips'.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var ids = [c.entity, c.power, c.value_peer, c.charge, c.discharge,
                 typeof c.price === 'string' ? c.price : null]
                  .filter(Boolean);
      var out = '';
      for (var i = 0; i < ids.length; i++) {
        var s = h.states[ids[i]];
        out += ids[i] + '=' + (s ? s.last_updated : 'x') + ';';
      }
      return out;
    }
  }

  // 5 W. Below this a battery is not meaningfully charging or discharging --
  // it is the same floor the rank pills use to decide a circuit is idle.
  var FLOW_FLOOR = 5;


  // hk_hero_pill / hk_pct_pill / hk_rank_pill.
  //
  //   mode: hero  the value as given (or the entity state)
  //   mode: pct   a rounded percentage with a small % suffix
  //   mode: rank  live watts via hkChart.power(), with kWh-today as the label
  //               via hkStats.daily()
  //
  // `rank` is the only card in this library that INTEGRATES other modules
  // rather than formatting state, which is why it needs HkBase.requestUpdate:
  // hkStats resolves asynchronously and wakes the card when the data lands.
  class HkRankCard extends HkStatBase {
    setConfig(config) {
      if (!config || !config.entity) throw new Error('hk-rank: `entity` is required');
      super.setConfig(config);
    }

    // A SWITCH THAT IS ON INVERTS THE PILL TO WHITE, so the reading has to
    // invert with it. Only switches -- a sensor is never "on" in this sense.
    _lit(st) {
      if (!st) return false;
      return String(st.entity_id || '').indexOf('switch.') === 0 &&
             ['off', 'unavailable', 'unknown'].indexOf(st.state) === -1;
    }

    // THE RANK PILLS INHERIT hk_pill's COLOUR RULE -- with the domain map --
    // not hk_metric's override-or-gray. They are tall tiles, not metrics.
    //
    // icon_color_steps is a threshold list in the CARD's config:
    //
    //   icon_color_steps:
    //     - {above: 60, color: green}
    //     - {above: 25, color: yellow}
    //     - {color: red}
    //
    // First match wins; an entry with no threshold is the fallback. A battery
    // level's colour, say, made declarative -- a config written by hand in
    // YAML needs no expression for it.
    //
    // THE CHIPS' WORDS, THE CHIPS' MEANINGS: `above` is STRICT
    // and `at_least` is inclusive, exactly as in hk-status-chip-card's `when`
    // (and Home Assistant's own numeric_state `above`), so `above: 0` means
    // "more than nothing" on a chip and on this card alike.
    _colour(st) {
      var cfg = this._config;
      var steps = cfg.icon_color_steps;
      if (Array.isArray(steps) && steps.length) {
        var v = Number(st && st.state);
        for (var i = 0; i < steps.length; i++) {
          var sp = steps[i];
          var hit = (sp.above == null && sp.at_least == null) ||
                    (Number.isFinite(v) &&
                     (sp.above == null || v > Number(sp.above)) &&
                     (sp.at_least == null || v >= Number(sp.at_least)));
          if (hit) return colourFor({ icon_color: sp.color }, st);
        }
      }
      return colourFor(cfg, st);
    }

    _watts(st) {
      var cfg = this._config;
      var pid = cfg.power || cfg.entity;
      if (!window.hkChart || !this._hass) return null;
      return window.hkChart.power(this._hass.states, pid, { watts: true, fallback: null });
    }

    _render() {
      var cfg = this._config, st = this._st(cfg.entity);
      var mode = cfg.mode || (cfg.power || cfg.stat ? 'rank' : 'hero');
      var lit = this._lit(st);

      if (!this._built) {
        this._root.innerHTML =
          '<ha-card class="rank" data-hk-role="card"><div class="grid">' +
          '<div class="well" data-hk-role="well"><ha-state-icon class="icon" data-hk-role="icon"></ha-state-icon></div>\n' +
          '<div class="name" data-hk-role="name"></div>\n' +
          '<div class="label" data-hk-role="label"></div>\n' +
          // LAST in the DOM, after the name and the label. grid-area places
          // it top-left either way; DOM order only shows in the card's text
          // order.
          '<div class="hero" data-hk-role="hero"></div>\n' +
          '</div></ha-card>';
        this._e = {
          card: this._root.querySelector('.rank'), hero: this._root.querySelector('.hero'),
          icon: this._root.querySelector('.icon'), name: this._root.querySelector('.name'),
          label: this._root.querySelector('.label'), well: this._root.querySelector('.well')
        };
        this._bind(this._e.card, 'tap_action', null);
        this._built = true;
      }

      var e = this._e;
      e.card.setAttribute('data-on', lit ? '1' : '0');
      // LIT = THE TILES' ON STATE: a coloured well with a WHITE glyph, the same
      // wellColour/iconColour rule every hk tile uses. Keeping the OFF well --
      // the 0.14 grey disc with the colour on the glyph -- on the white plate
      // would read as a grey circle with a coloured icon, unlike every other
      // lit tile. Unlit: grey well, coloured glyph, as an off tile is.
      var col = this._colour(st);
      e.well.style.background = lit ? col : '';
      e.icon.style.color = lit ? 'white' : col;
      if (this._hass) { e.icon.hass = this._hass; e.icon.stateObj = st; }
      if (cfg.icon) e.icon.icon = cfg.icon;

      // ---- the reading
      var html = '--', idle = true;
      if (mode === 'rank') {
        var w = this._watts(st);
        // IDLE CIRCUITS RECEDE. A dozen cards all shouting "0 W" at full
        // contrast is a wall of noise; dimming them makes the two or three
        // actually drawing power the thing you see first.
        idle = (w === null || Math.abs(w) < 5);
        if (w !== null) {
          var kilo = Math.abs(w) >= 1000;
          var val = kilo ? (w / 1000).toFixed(2) : String(Math.round(w));
          html = val + '<span class="unit">' + (kilo ? 'kW' : 'W') + '</span>';
        }
      } else if (mode === 'energy') {
        // NO POWER SENSOR: today's kWh is the reading, and the label says so
        var td = this._today();
        idle = !(td > 0.05);
        if (td !== null) html = td.toFixed(1) + '<span class="unit">kWh</span>';
      } else if (mode === 'pct') {
        var v = Number(st && st.state);
        idle = false;
        html = Number.isFinite(v) ? (Math.round(v) + '<span class="unit pct">%</span>') : '--';
      } else {
        idle = false;
        html = cfg.value != null ? String(cfg.value) : (st ? st.state : '--');
      }
      window.hkCards.morph(e.hero, html);
      e.hero.style.color = lit
        ? (idle ? 'rgba(0, 0, 0, 0.30)' : 'rgba(0, 0, 0, 0.92)')
        : (idle ? 'rgba(255, 255, 255, 0.32)' : 'rgba(255, 255, 255, 0.94)');

      var nm = cfg.name || (st && st.attributes && st.attributes.friendly_name) || cfg.entity;
      if (e.name.textContent !== nm) e.name.textContent = nm;

      // ---- the label: kWh so far today, fetched asynchronously
      var lb = cfg.label != null ? cfg.label : '';
      // label_entity + label_suffix: "the range sensor, rounded, with
      // ' mi range' after it".
      if (!cfg.label && cfg.label_entity) {
        var ls = this._st(cfg.label_entity);
        var lv = Number(ls && ls.state);
        // label_decimals: the range sensors read whole miles, the stored-energy
        // sensor reads "1.5 kWh". Default 0 keeps every existing config.
        var dp = Number(cfg.label_decimals || 0);
        lb = Number.isFinite(lv)
          ? ((dp > 0 ? lv.toFixed(dp) : String(Math.round(lv))) +
             (cfg.label_suffix || ''))
          : '';
      }
      if (mode === 'energy' && !cfg.label && !cfg.label_entity) {
        lb = this._today() !== null ? 'Today' : '';
      } else if (!cfg.label && !cfg.label_entity && cfg.stat && window.hkStats && this._hass) {
        var all = window.hkStats.daily(this._hass, cfg.peers || [cfg.stat], 14, this);
        var a = all && all[cfg.stat];
        var t = (a && a.length) ? a[a.length - 1].v : null;
        lb = Number.isFinite(t) ? (t.toFixed(1) + ' kWh today') : '';
      }
      if (e.label.textContent !== lb) e.label.textContent = lb;
    }

    // TODAY'S kWh from the meter's statistics (with its section's peers, in
    // one request); null until they arrive
    _today() {
      var cfg = this._config, id = cfg.stat || cfg.entity;
      if (!window.hkStats || !this._hass || !id) return null;
      var all = window.hkStats.daily(this._hass, cfg.peers || [id], 14, this);
      var a = all && all[id], t = (a && a.length) ? a[a.length - 1].v : null;
      return Number.isFinite(t) ? t : null;
    }

    // The reading changes when the POWER entity moves, which may not be the
    // card's own entity -- so the default signature would gate out exactly the
    // updates this card exists to show.
    _sigOf() {
      var h = this._hass, c = this._config;
      if (!h || !c) return null;
      var ids = [c.entity, c.power, c.label_entity].filter(Boolean);
      var out = '';
      for (var i = 0; i < ids.length; i++) {
        var s = h.states[ids[i]];
        out += ids[i] + '=' + (s ? s.last_updated : 'x') + ';';
      }
      return out;
    }
  }

  // register / firstOf are hk-base.js's.
  var C2 = window.hkCards, register = C2.register, firstOf = C2.firstOf;

  register('hk-heading-card', HkHeadingCard, 'HK Section Heading',
           'A section title, optionally linking to another page.',
           [
             { name: 'name', required: true, selector: { text: {} } },
             // A room heading: opens this dashboard's room page for the area
             // (a view with `area:`), with a › -- see docs/Menu.md.
             { name: 'area', selector: { area: {} },
               helper: 'A room heading: links to this area\'s room page when the dashboard has one.' },
             // "./cameras" is relative to the CURRENT dashboard, which is how
             // one shared heading navigates correctly on every dashboard.
             { type: 'grid', name: '', schema: [
               { name: 'navigation_path', selector: { text: {} } },
               { name: 'chevron', selector: { text: {} } }
             ] },
             C2.section('Layout', [
               { type: 'grid', name: '', schema: [
                 { name: 'height', selector: { text: {} } },
                 { name: 'padding', selector: { text: {} } },
                 { name: 'grid_rows', selector: { text: {} } }
               ] }
             ], 'mdi:ruler')
           ],
           function () { return { name: 'Living Room' }; });

  register('hk-stat-card', HkMetricCard, 'HK Metric',
           'An icon, a caption and a large reading with no background, such as temperature or power.',
           [
             { name: 'entity', required: true, selector: { entity: {} } },
             { type: 'grid', name: '', schema: [
               { name: 'name', selector: { text: {} } },
               { name: 'value_mode', selector: C2.selOptions(
                   ['temperature', 'power', 'runtime', 'cost', 'cost_today', 'flow']) }
             ] },
             C2.section('Appearance', [
               { type: 'grid', name: '', schema: [
                 { name: 'icon', selector: { icon: {} } },
                 { name: 'icon_color', selector: C2.selColour() }
               ] }
             ], 'mdi:palette'),
             C2.section('Value options', [
               { name: 'value', selector: { text: {} } },
               { type: 'grid', name: '', schema: [
                 { name: 'value_attribute', selector: { text: {} } },
                 { name: 'value_suffix', selector: { text: {} } },
                 { name: 'idle_text', selector: { text: {} } },
                 { name: 'value_peer', selector: { entity: { filter: { domain: 'sensor' } } } },
                 { name: 'charge', selector: { entity: { filter: { domain: 'sensor' } } } },
                 { name: 'discharge', selector: { entity: { filter: { domain: 'sensor' } } } },
                 { name: 'stat', selector: { entity: { filter: { domain: 'sensor' } } } },
                 { name: 'cost_stat', selector: { entity: { filter: { domain: 'sensor' } } } }
               ] }
             ], 'mdi:tune'),
             C2.section('Interactions', [
               { name: 'tap_action', selector: { ui_action: {} } }
             ], 'mdi:gesture-tap')
           ],
           function (hass) { return { entity: firstOf(hass, 'sensor') }; });

  register('hk-rank-card', HkRankCard, 'HK Reading Tile',
           'A tile with a large reading: a value, a percentage, or a device\'s power use ranked against others.',
           [
             { name: 'entity', required: true, selector: { entity: {} } },
             { type: 'grid', name: '', schema: [
               { name: 'name', selector: { text: {} } },
               { name: 'mode', selector: C2.selOptions(['hero', 'pct', 'rank', 'energy']),
                 helper: 'Value: the state. Percent: a 0–100 reading. Power use: live watts, with today\'s energy below. Energy: today\'s kWh, for a meter with no power sensor.' }
             ] },
             C2.section('Power use', [
               { name: 'power', selector: { entity: { filter: { domain: 'sensor' } } } },
               { name: 'stat', selector: { entity: { filter: { domain: 'sensor' } } } },
               { name: 'peers', selector: { entity: { multiple: true, filter: { domain: 'sensor' } } } }
             ], 'mdi:flash'),
             C2.section('Appearance', [
               { type: 'grid', name: '', schema: [
                 { name: 'icon', selector: { icon: {} } },
                 { name: 'icon_color', selector: C2.selColour() }
               ] },
               // Colour thresholds, e.g. for a battery level:
               // [{above: 60, color: green}, ...], first match
               // wins, an entry with no `above` is the fallback.
               { name: 'icon_color_steps', selector: { object: {} } }
             ], 'mdi:palette'),
             C2.section('Status text', [
               { type: 'grid', name: '', schema: [
                 { name: 'label_entity', selector: { entity: {} } },
                 { name: 'label_suffix', selector: { text: {} } },
                 { name: 'label_decimals', selector: { number: { min: 0, max: 3, mode: 'box' } } }
               ] }
             ], 'mdi:format-text'),
             C2.section('Interactions', [
               { name: 'tap_action', selector: { ui_action: {} } }
             ], 'mdi:gesture-tap')
           ],
           function (hass) { return { entity: firstOf(hass, 'sensor'), mode: 'hero' }; });

  window.hkStat.HkHeadingCard = HkHeadingCard;
  window.hkStat.HkMetricCard = HkMetricCard;
  window.hkStat.HkRankCard = HkRankCard;
  });
})();
