// hk-settings.js -- HK SETTINGS, the admin page (panel.py), built as an
// Apple settings screen:
//
//   OVERVIEW       where settings live, setup status
//   SCREENS        each dashboard, one page: Menu, Home Page, Pages,
//                  Appearance, Behavior -- a live preview beside it
//   ALL SCREENS    General, What Counts, Weather, Appearance, Sky,
//                  Menu & Rooms, Wall Tablets
//   FEATURES       Music, Live TV, Alarm PIN, Clean Areas
//                  (hk-settings-features.js)
//   LIBRARY        Accessories, Pop-ups, Custom Pages, Custom Chips
//   SYSTEM         Advanced, Setup Check (+ the Setup Assistant)
//
// A sidebar with search beside the page on a wide window; stacked pages with
// a back button on a phone. The address is the page (#/screens/dashboard-
// kitchen/chips), so Back, reload and links work.
//
// EVERY CONTROL SAVES AS IT CHANGES, as Settings does: only what changed
// goes to the integration (hk_frontend/settings/set, hk_frontend/board/set --
// settings_api.py checks it the way Configure does), and the bar says Saved
// or what went wrong, beside the field. Configure (HA's own dialogs) keeps
// working on the same storage; either can be used.
//
// Words and the small decisions (what a list shows, what a change saves)
// are hk-settings-model.js; the controls are hk-settings-kit.js.
(function () {
  'use strict';
  if (customElements.get('hk-settings-panel')) return;

  var DOMAIN = 'hk_frontend';
  var M = null, K = null, h = null, F = null;

  // the modules, fetched beside this one with its version (panel.py puts the
  // files' time on our URL)
  function stamp(panel) {
    try { var u = panel.config._panel_custom.module_url; var m = /[?&]v=(\d+)/.exec(u); if (m) return m[1]; } catch (e) { /* none */ }
    return String(Date.now());
  }
  function ensureFont() {
    if (document.querySelector('link[data-hk-font]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/hk/fonts/sf-pro.css'; l.setAttribute('data-hk-font', '');
    document.head.appendChild(l);
  }
  // <ha-form>, and through it the YAML editor, are loaded by the frontend
  // only when something needs them: an entities card's editor pulls them in.
  var formReady = null;
  function loadHaForm() {
    if (customElements.get('ha-form')) return Promise.resolve();
    if (formReady) return formReady;
    formReady = (async function () {
      try {
        var helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
        if (helpers) {
          var c = await helpers.createCardElement({ type: 'entities', entities: [] });
          if (c && c.constructor && c.constructor.getConfigElement) await c.constructor.getConfigElement();
        }
      } catch (e) { /* whenDefined below still waits */ }
      await customElements.whenDefined('ha-form');
    })();
    return formReady;
  }
  var yamlReady = null;
  function loadYaml(hass) {
    if (customElements.get('ha-yaml-editor')) return Promise.resolve(true);
    if (yamlReady) return yamlReady;
    yamlReady = loadHaForm().then(function () {
      // an object selector's form brings the YAML editor with it
      var f = document.createElement('ha-form');
      f.hass = hass; f.schema = [{ name: 'x', selector: { object: {} } }]; f.data = {};
      f.style.display = 'none';
      document.body.appendChild(f);
      return Promise.race([customElements.whenDefined('ha-yaml-editor').then(function () { return true; }),
                           new Promise(function (r) { setTimeout(function () { r(false); }, 6000); })])
        .then(function (ok) { f.remove(); return ok; });
    });
    return yamlReady;
  }
  // The dashboards' own modules, for an accessory's settings: the settings
  // feed they read, the glyphs, the detail sheet's pane.
  var cardsReady = null;
  function loadCards() {
    if (cardsReady) return cardsReady;
    cardsReady = (async function () {
      var v = Date.now();
      var tries = [['hkSettings', '/hk/modules/hk-settings.js'], ['customIconsets', '/hk/iconset/hk-icons.js'],
                   ['hkCards', '/hk/cards/hk-base.js'], ['hkDetail', '/hk/cards/hk-detail.js']];
      for (var i = 0; i < tries.length; i++) {
        var t = tries[i];
        if (t[0] === 'customIconsets' ? (window.customIconsets && window.customIconsets.hk) : window[t[0]]) continue;
        try { await import(t[1] + '?v=' + v); } catch (e) { console.warn('[hk-settings] ' + t[1], e); }
      }
    })();
    return cardsReady;
  }

  // ------------------------------------------------------------ the shell
  var CSS = [
    // PINNED TO THE WINDOW. Home Assistant's panel container
    // (partial-panel-resolver) has no height of its own, so height:100% grew
    // the panel to its content and the window scrolled the menu and the page
    // together. The window's height gives each its own scroll.
    ':host{height:100vh;height:100dvh}',
    '.app{display:flex;height:100%;overflow:hidden;position:relative}',
    '.side{flex:none;width:320px;height:100%;overflow-y:auto;overscroll-behavior:contain;padding:0 16px 40px;',
    '  border-right:.5px solid var(--hk-sep)}',
    '.sidetop{position:sticky;top:0;z-index:2;background:var(--hk-bg);padding:10px 0 12px;margin:0 -4px}',
    '.sidehead{display:flex;align-items:center;gap:4px;min-height:44px;margin-left:-8px}',
    '.sidehead h1{margin:0;font-family:var(--hk-display);font-size:22px;font-weight:700;letter-spacing:.01em}',
    '.search{position:relative;margin:6px 4px 0}',
    '.search input{width:100%;height:36px;border:0;border-radius:10px;padding:0 30px 0 32px;background:var(--hk-fill);',
    '  color:var(--hk-label);font:inherit;font-size:16px;outline:none}',
    '.search input::placeholder{color:var(--hk-label2)}',
    '.search input:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--hk-tint) 45%,transparent)}',
    '.search .mag{position:absolute;left:9px;top:9px;width:18px;height:18px;color:var(--hk-label2);--mdc-icon-size:18px}',
    '.side .grp{margin-bottom:22px}',
    '.side .gh{padding-left:12px}',
    '.side .cell{padding-left:12px;min-height:44px}',
    '.side .cell.hasic + .cell::before,.side .cell + .cell.hasic::before{left:54px}',
    '.side a.cell[aria-current="page"]{background:var(--hk-sel);color:#fff}',
    '.side a.cell[aria-current="page"] .val,.side a.cell[aria-current="page"] .chev,.side a.cell[aria-current="page"] small{color:rgba(255,255,255,.8)}',
    '.side a.cell[aria-current="page"]::before,.side a.cell[aria-current="page"] + .cell::before{display:none}',
    '.side a.cell[aria-current="page"] .tile{box-shadow:0 0 0 1.5px rgba(255,255,255,.55)}',
    '.side .chev{display:none}',
    ':host(:not([wide])) .side .chev{display:block}',
    '.detail{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;position:relative}',
    '.bar{flex:none;position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:8px;height:52px;',
    '  padding:0 10px;background:var(--hk-bar);-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);',
    '  border-bottom:.5px solid transparent;transition:border-color .2s}',
    '.bar.scrolled{border-bottom-color:var(--hk-sep)}',
    '.bar .back{display:inline-flex;align-items:center;gap:3px;height:44px;max-width:100%;min-width:0;padding:0 8px 0 2px;border:0;',
    '  background:none;color:var(--hk-tint);font-size:17px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bar .back svg{width:12px;height:20px;flex:none}',
    '.bar .back span{overflow:hidden;text-overflow:ellipsis}',
    '.bar .mid{flex:1;min-width:0;text-align:center;font-weight:600;font-size:17px;opacity:0;transition:opacity .2s;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bar.scrolled .mid{opacity:1}',
    '.bar .st{flex:1 1 0;min-width:0;display:flex;justify-content:flex-end;align-items:center;gap:5px;font-size:13px;color:var(--hk-label2)}',
    '.bar .st.err{color:var(--hk-red)}',
    '.bar .st svg{width:13px;height:13px;color:var(--hk-green)}',
    '.bar .lead{flex:1 1 0;min-width:0;display:flex;align-items:center}',
    '.bar .mid{flex:0 1 auto;max-width:50%}',
    '.scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding-top:52px}',
    '.page{max-width:680px;margin:0 auto;padding:6px 20px 80px}',
    '.page.split{max-width:1240px;display:grid;grid-template-columns:minmax(0,640px) minmax(320px,1fr);gap:32px;align-items:start}',
    '.page.split{grid-template-areas:"ph pv" "pc pv"}',
    '.page.split .ph{grid-area:ph}',
    '.page.split .pc{grid-area:pc}',
    '.page.split .pvcol{grid-area:pv;align-self:start;position:sticky;top:64px}',
    // narrower: the preview sits under the title of the screen's own page
    ':host(:not([xwide])) .page.split{display:block;max-width:680px}',
    ':host(:not([xwide])) .page.split .pvcol{margin:0 0 30px;max-width:480px}',
    '.pvcol:empty{display:none}',
    '.code{margin:-14px 0 28px;padding:12px 16px;border-radius:10px;background:var(--hk-cell);color:var(--hk-label);',
    '  font:13px/18px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow-x:auto;user-select:text}',
    'h1.lt{margin:4px 0 4px;font-family:var(--hk-display);font-size:34px;line-height:41px;font-weight:700;letter-spacing:.01em;outline:none}',
    ':host([wide]) h1.lt{font-size:30px;line-height:36px}',
    '.scope{margin:0 0 24px;font-size:15px;line-height:20px;color:var(--hk-label2)}',
    '.scope b{font-weight:600;color:var(--hk-label)}',
    '.pvbox{position:relative;width:100%;aspect-ratio:16/10;border-radius:12px;overflow:hidden;background:#000;',
    '  box-shadow:0 0 0 .5px var(--hk-sep)}',
    '.pvbox iframe{position:absolute;top:0;left:0;width:1280px;height:800px;border:0;transform-origin:0 0;pointer-events:none}',
    '.pvhead{display:flex;align-items:baseline;justify-content:space-between;padding:0 4px 8px}',
    '.pvhead span{font-size:13px;text-transform:uppercase;color:var(--hk-label2)}',
    '.pvhead a{font-size:15px;padding:12px 4px;margin:-12px -4px}',
    '.pvcol .gf{padding-left:4px}',
    '.accwrap{--acc-cell:var(--hk-cell);--acc-sep:var(--hk-sep);--acc-label:var(--hk-label);--acc-text:var(--hk-label);',
    '  --acc-label2:var(--hk-label2);--acc-label3:var(--hk-label3);--acc-value:var(--hk-label2);--acc-fill:var(--hk-off);',
    '  --acc-seg:var(--hk-seg);--acc-seg-on:var(--hk-seg-on);--acc-glyph:var(--hk-fill);--acc-glyph-on-bg:var(--hk-tint);',
    '  --acc-glyph-on-fg:#fff;--acc-red:var(--hk-red);--acc-green:var(--hk-green);--acc-orange:var(--hk-orange);font-size:var(--hk-body)}',
    '.accwrap .acc{gap:26px}',
    '.accwrap .acc .cap{padding:0 16px 7px;font-weight:400;letter-spacing:0}',
    '.accwrap .acc .grp{border-radius:10px}',
    '.accwrap .acc .row{min-height:44px}',
    '.accwrap .acc .note{padding:0 16px}',
    '.dated{display:flex;gap:6px;flex:none}',
    '.dated .pop{background:var(--hk-fill);border-radius:7px;padding:5px 10px;color:var(--hk-label)}',
    '.inl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px}',
    '.inl input{flex:1 1 140px;min-width:0;height:34px;border:0;border-radius:8px;padding:0 10px;background:var(--hk-fill);color:var(--hk-label);font:inherit}',
    '.inl select{height:34px;border:0;border-radius:8px;padding:0 8px;background:var(--hk-fill);color:var(--hk-label);font:inherit;font-size:16px}',
    '.dated .pop select{inset:0;width:100%}',
    '.pbtn{height:36px;padding:0 16px;border:0;border-radius:18px;background:var(--hk-tint);color:#fff;font:inherit;font-weight:600;cursor:pointer}',
    '.pbtn:disabled{opacity:.4;cursor:default}',
    '.big{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:26px 16px 30px}',
    '.big .tile{width:64px;height:64px;border-radius:15px}',
    // the icon's own class pins 22 px: the tile's size has to be on it
    '.big .tile .ic{--mdc-icon-size:38px;color:#fff}',
    '.big h2{margin:6px 0 0;font-family:var(--hk-display);font-size:28px;font-weight:700}',
    '.big p{margin:0;max-width:44ch;color:var(--hk-label2);font-size:15px;line-height:20px}',
    '.steps{font-size:13px;color:var(--hk-label2);text-align:center;margin:0 0 8px}',
    '.yaml{display:block;background:var(--hk-cell);border-radius:10px;padding:8px 6px;min-height:120px}',
    'pre.ex{margin:0;padding:12px 16px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hk-label);white-space:pre-wrap}',
    '.yaml textarea{width:100%;min-height:220px;border:0;background:none;color:var(--hk-label);font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none;resize:vertical}',
    '.ok{color:var(--hk-green)} .warn{color:var(--hk-orange)} .note{color:var(--hk-label2)}',
    '.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.loading{display:flex;align-items:center;justify-content:center;height:100%;color:var(--hk-label2)}',
    // ONE COLUMN (phones, narrow windows): the list is its own page
    ':host(:not([wide])) .side{width:100%;border-right:0;padding:0 16px 40px}',
    ':host(:not([wide])) .sidehead h1{font-size:34px;line-height:41px}',
    ':host(:not([wide])) .app[data-view="root"] .detail{display:none}',
    ':host(:not([wide])) .app[data-view="detail"] .side{display:none}',
    ':host(:not([wide])) .page{padding:6px 16px 80px}',
    // AT LEAST ONE SCREEN TALL: on a phone nothing above gives the page a
    // height, so `height:100%` would be the content's, and a short page
    // would end in a band of Home Assistant's own gray under it
    ':host(:not([wide])){min-height:100vh;min-height:100dvh}'
  ].join('\n');
  var BACK = '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TICK = '<svg viewBox="0 0 13 13" aria-hidden="true"><path d="M2 7l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Apple's system colors for the sidebar's tiles
  var C = { blue: '#007aff', green: '#34c759', indigo: '#5856d6', orange: '#ff9500', pink: '#ff2d55', purple: '#af52de',
            red: '#ff3b30', teal: '#30b0c7', yellow: '#ffcc00', gray: '#8e8e93', cyan: '#32ade6', brown: '#a2845e' };
  var HOUSE = [
    ['general', 'General', 'mdi:home', C.gray], ['counts', 'What Counts', 'mdi:counter', C.green],
    ['weather', 'Weather', 'mdi:weather-partly-cloudy', C.cyan], ['appearance', 'Appearance', 'mdi:palette', C.indigo],
    ['sky', 'Sky', 'mdi:weather-night', C.purple], ['menu', 'Menu & Rooms', 'mdi:dock-left', C.orange],
    ['tablets', 'Wall Tablets', 'mdi:tablet', C.blue]
  ];
  // Category pages with an order of their own (accessories.py PAGE_ORDERS):
  // [title, icon, what automatic is].
  var PAGE_ORDERS = { vacuums: ['Vacuums', 'mdi:robot-vacuum', 'A to Z'],
                      security: ['Security', 'mdi:lock', 'locks A to Z, then garage doors'] };
  var LIBRARY = [['accessories', 'Accessories', 'mdi:lightbulb-group', C.yellow], ['popups', 'Pop-ups', 'mdi:bell-ring', C.red],
                 ['pages', 'Custom Pages', 'mdi:file-document-multiple', C.teal], ['chips', 'Custom Chips', 'mdi:label-variant', C.orange]];
  var SYSTEM = [['advanced', 'Advanced', 'mdi:cog', C.gray], ['check', 'Setup Check', 'mdi:clipboard-check', C.green]];
  // THE THIRD-PARTY CARDS' OPTIONS: the handful people change, as controls
  // (an empty YAML box does not say what it wants), each showing the tuned value until changed (hk-strategy.js
  // wallpanel(), kiosk_mode, the Weather page's radar card). A control writes
  // one key of the same options mapping the YAML page edits; set back to the
  // tuned value, the key goes. Everything else: Options in YAML.
  var MIN = function (n) { return n < 60 ? n + ' Seconds' : n === 60 ? '1 Minute' : n < 3600 ? (n / 60) + ' Minutes' : '1 Hour'; };
  var OPTION_PAGES = {
    wallpanel: {
      title: 'Screensaver Options', docs: 'https://github.com/j-a-n/lovelace-wallpanel',
      footer: 'The photos come from Wall Tablets → Screensaver Photos. The clock, the weather, what’s playing and running timers show over them.',
      example: 'idle_time: 300\ndisplay_time: 20\nimage_animation_ken_burns_zoom: 1.2',
      yamlHelp: 'Everything set on the Screensaver Options page, and any other WallPanel option, as YAML. Empty is the tuned screensaver. Set a key to null to remove it from the tuned setup. Changing enabled, profiles or screensaver_entity unhooks it from the tablet’s user and the sky.',
      groups: [
        { header: 'Timing', rows: [
          { key: 'idle_time', label: 'Starts After', type: 'select', num: true, def: 180,
            options: [60, 120, 180, 300, 600, 900, 1800].map(function (n) { return [n, MIN(n)]; }) },
          { key: 'display_time', label: 'Each Photo For', type: 'select', num: true, def: 30,
            options: [10, 20, 30, 60, 120, 300].map(function (n) { return [n, MIN(n)]; }) }] },
        { header: 'Photos', rows: [
          { key: 'media_order', label: 'Order', type: 'seg', def: 'random', options: [['random', 'Random'], ['sorted', 'In Order']] },
          { key: 'image_animation_ken_burns', label: 'Slow Zoom', type: 'switch', def: true },
          { key: 'image_fit_landscape', label: 'Fill the Screen', sub: 'Off: the whole photo, with room around it.', type: 'switch',
            def: 'cover', on: 'cover', off: 'contain' }] }]
    },
    kiosk: {
      title: 'Kiosk Mode Options', docs: 'https://github.com/NemesisRE/kiosk-mode',
      footer: 'Whatever is hidden, the menu’s Home Assistant row still opens Home Assistant’s sidebar.',
      example: 'admin_settings:\n  hide_header: false',
      yamlHelp: 'Everything set on the Kiosk Mode Options page, and any other Kiosk Mode option, as YAML. Empty is the tuned setup: the header and the sidebar hidden. Set a key to null to remove it.',
      groups: [{ rows: [
        { key: 'hide_header', label: 'Hide Header', type: 'switch', def: true },
        { key: 'hide_sidebar', label: 'Hide Sidebar', type: 'switch', def: true },
        { label: 'Show Header for Admins', type: 'switch', fk: 'admin_header',
          get: function (cur) { return !!(cur.admin_settings && cur.admin_settings.hide_header === false); },
          set: function (cur, v) {
            var a = Object.assign({}, cur.admin_settings || {});
            if (v) a.hide_header = false; else delete a.hide_header;
            if (Object.keys(a).length) cur.admin_settings = a; else delete cur.admin_settings;
            return cur;
          } }] }]
    },
    radar: {
      title: 'Radar Map', docs: 'https://github.com/Makin-Things/weather-radar-card',
      footer: 'The radar map on every generated screen’s Weather page.',
      example: 'zoom_level: 7\ndata_source: RainViewer',
      yamlHelp: 'Everything set on the Radar Map page, and any other option of the Weather Radar Card, as YAML. Empty is the tuned map: NOAA in the US (RainViewer elsewhere), OpenStreetMap, zoom level 6, 620 px high, a marker on your home. Set a key to null to remove it.',
      groups: [{ rows: [
        { key: 'data_source', label: 'Radar', type: 'select',
          options: [['', 'Automatic (NOAA in the US)'], ['NOAA', 'NOAA'], ['RainViewer', 'RainViewer']] },
        { key: 'zoom_level', label: 'Zoom', sub: 'Higher is closer.', type: 'select', num: true, def: 6,
          options: [4, 5, 6, 7, 8, 9, 10].map(function (n) { return [n, String(n)]; }) },
        { key: 'height', label: 'Height', type: 'select', def: '620px',
          options: [420, 520, 620, 720, 820].map(function (n) { return [n + 'px', n + ' px']; }) },
        { key: 'show_playback', label: 'Playback Controls', type: 'switch', def: true },
        { label: 'Move and Zoom the Map', sub: 'Off: a still map.', type: 'switch', fk: 'static_map',
          get: function (cur) { return cur.static_map === false; },
          set: function (cur, v) { if (v) cur.static_map = false; else delete cur.static_map; return cur; } }] }]
    }
  };
  function optGet(r, cur) {
    if (r.get) return r.get(cur);
    var v = cur[r.key] === undefined ? r.def : cur[r.key];
    if (r.type === 'switch' && r.on !== undefined) return v === r.on;
    return v === undefined ? '' : v;
  }
  function optSet(r, cur, v) {
    var next = JSON.parse(JSON.stringify(cur || {}));
    if (r.set) return r.set(next, v);
    if (r.type === 'switch' && r.on !== undefined) v = v ? r.on : r.off;
    if (r.num && v !== '') v = Number(v);
    if (v === r.def || ((r.def === undefined) && (v === '' || v === null))) delete next[r.key];
    else next[r.key] = v;
    return next;
  }
  var TILE_DOMAINS = /^(light|switch|fan|cover|lock|media_player|climate|vacuum|valve|humidifier|water_heater|alarm_control_panel|input_boolean|timer|camera)\./;
  var CHIP_POOL = /^(sensor|binary_sensor|input_boolean|input_number|input_select|input_text|switch|light|fan|lock|cover|climate|media_player|timer|counter|person|device_tracker|weather|alarm_control_panel|vacuum|valve|water_heater|humidifier|select|number|update|event)\./;
  var FAV_POOL = /^(light|switch|fan|cover|lock|climate|media_player|alarm_control_panel|vacuum|valve|water_heater|humidifier|input_boolean|scene|script)\./;
  var SCENE_POOL = /^(scene|script|input_button|button)\./;

  class HkSettingsPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.errors = {};
      this.pickers = {};
      this.q = '';
      this.hist = [];
      this.from = loadFrom();
      this._onHash = this.onHash.bind(this);
      this._onClick = this.onClick.bind(this);
      // A PRESS IN PROGRESS: see render(). Released after the press's click.
      var self = this;
      this._onPress = function () { self._pressing = true; };
      this._onRelease = function () {
        if (!self._pressing) return;
        setTimeout(function () {
          self._pressing = false;
          var held = self._held;
          self._held = null;
          if (held) self.render(held.background, held.navigated);
        }, 0);
      };
      // typing over: a redraw skipped while typing (render(true)) is drawn now
      this._onFocusOut = function () {
        setTimeout(function () {
          if (self._dirty && !self.typing()) { self._dirty = false; self.render(true); }
        }, 0);
      };
    }
    set hass(v) {
      var first = !this._hass;
      this._hass = v;
      if (first) this.boot();
      var dark = !!(v && v.themes && v.themes.darkMode);
      if (dark !== this.hasAttribute('dark')) this.toggleAttribute('dark', dark);
      if (this._menuBtn) this._menuBtn.hass = v;
    }
    get hass() { return this._hass; }
    set narrow(v) { this._narrow = v; if (this._menuBtn) this._menuBtn.narrow = v; if (this.ready) this.render(); }
    set panel(v) { this._panel = v; }
    set route(v) { /* our own hash is the route */ }
    // NAVIGATION: our own links are "#/..." and handled here. Home Assistant
    // routes link clicks itself (history.pushState, which fires no
    // hashchange): the address would change and the page would not. So a
    // click on one of ours is ours, and HA's own navigation events are heard
    // too.
    connectedCallback() {
      window.addEventListener('hashchange', this._onHash);
      window.addEventListener('popstate', this._onHash);
      window.addEventListener('location-changed', this._onHash);
      this.shadowRoot.addEventListener('pointerdown', this._onPress, true);
      window.addEventListener('pointerup', this._onRelease, true);
      window.addEventListener('pointercancel', this._onRelease, true);
      this.shadowRoot.addEventListener('focusout', this._onFocusOut);
      if (this.ready) { this.subscribe(); this.render(); }
    }
    disconnectedCallback() {
      window.removeEventListener('hashchange', this._onHash);
      window.removeEventListener('popstate', this._onHash);
      window.removeEventListener('location-changed', this._onHash);
      this.shadowRoot.removeEventListener('pointerdown', this._onPress, true);
      window.removeEventListener('pointerup', this._onRelease, true);
      window.removeEventListener('pointercancel', this._onRelease, true);
      this.shadowRoot.removeEventListener('focusout', this._onFocusOut);
      this._pressing = false; this._held = null;
      if (this._unsub) { try { this._unsub(); } catch (e) { /* gone */ } this._unsub = null; }
    }

    // ---------------------------------------------------------- start
    async boot() {
      var s = this.shadowRoot, self = this;
      s.innerHTML = '<div class="loading">Loading…</div>';
      ensureFont();
      var v = stamp(this._panel);
      try {
        await Promise.all([import('/hk/panels/hk-settings-model.js?v=' + v), import('/hk/panels/hk-settings-kit.js?v=' + v),
                           import('/hk/panels/hk-settings-features.js?v=' + v)]);
      } catch (e) {
        s.innerHTML = '<div class="loading">HK settings couldn’t load: ' + String(e && e.message || e) + '</div>';
        return;
      }
      M = window.hkSettingsModel; K = window.hkSettingsKit; h = K.h; F = window.hkSettingsFeatures; F.use(K);
      s.innerHTML = '<style>' + K.CSS + '\n' + CSS + '</style>' +
        '<div class="app" data-view="root"><nav class="side" aria-label="HK settings"></nav>' +
        '<main class="detail"><div class="bar"><div class="lead"></div><div class="mid" aria-hidden="true"></div>' +
        '<div class="st" role="status" aria-live="polite"></div></div><div class="scroll"><div class="page"></div></div></main></div>' +
        '<div class="live" aria-live="assertive"></div>';
      s.addEventListener('click', this._onClick);
      this.app = s.querySelector('.app');
      this.sideEl = s.querySelector('.side');
      this.bar = s.querySelector('.bar');
      this.scrollEl = s.querySelector('.scroll');
      this.pageEl = s.querySelector('.page');
      this.liveEl = s.querySelector('.live');
      this.scrollEl.addEventListener('scroll', function () {
        self.bar.classList.toggle('scrolled', self.scrollEl.scrollTop > 30);
      }, { passive: true });
      new ResizeObserver(function () { self.measure(); }).observe(this);
      this.measure();
      try { await this.reload(); } catch (e) {
        s.querySelector('.page').innerHTML = '';
        this.pageEl.appendChild(h('div', { class: 'big' }, [h('h2', { text: 'HK Settings' }),
          h('p', { text: String(e && e.message || e) })]));
        this.app.setAttribute('data-view', 'detail');
        return;
      }
      this.ready = true;
      this.subscribe();
      if (!location.hash && !this.data.setup_done && !this.data.dashboards.some(function (d) { return d.item; })) {
        history.replaceState(null, '', '#/setup');
      }
      this.onHash();
    }
    measure() {
      var w = this.getBoundingClientRect().width || window.innerWidth;
      var wide = w >= 860, xwide = w >= 1320;
      var changed = wide !== this.hasAttribute('wide') || xwide !== this.hasAttribute('xwide');
      this.toggleAttribute('wide', wide);
      this.toggleAttribute('xwide', xwide);
      if (changed && this.ready) this.render();
      if (this._fit) this._fit();
    }
    async reload() {
      this.data = await this._hass.callWS({ type: DOMAIN + '/panel/get' });
    }
    // every change, from here or anywhere (Configure, a gear, another
    // browser), comes back over the settings feed: read again and redraw
    subscribe() {
      if (this._unsub || !this._hass || !this._hass.connection) return;
      var self = this, first = true;
      this._hass.connection.subscribeMessage(function () {
        if (first) { first = false; return; }
        self.soon();
      }, { type: DOMAIN + '/settings/subscribe' }).then(function (u) { self._unsub = u; }).catch(function () { /* older server */ });
    }
    soon() {
      var self = this;
      clearTimeout(this._soonT);
      this._soonT = setTimeout(function () {
        self.reload().then(function () { self.render(true); }).catch(function () { /* next change */ });
      }, 450);
    }

    // ---------------------------------------------------------- routing
    parts() {
      return (location.hash || '').replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
    }
    onClick(e) {
      if (e.defaultPrevented && !this._hashLink(e)) return;
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = this._hashLink(e);
      if (!a || a.getAttribute('target')) return;
      e.preventDefault();
      e.stopPropagation();
      var href = a.getAttribute('href');
      this.noteFrom(location.hash || '#/', href, !!(a.closest && a.closest('.side')));
      this.go(href);
    }
    // BACK GOES WHERE YOU CAME FROM, not to a page's fixed parent: in the
    // Setup Assistant, Radar Map's Back must return to the step, not to the
    // Weather page. A page opened by a link from anywhere else remembers that
    // page, and Back -- the bar's, and any "done, go back" -- returns there:
    // the wizard's step, the screen that linked to All Screens' glass. A
    // link to a page's own child, and anything from the sidebar or search,
    // starts fresh. Kept for the browser session, so a reload keeps it.
    noteFrom(from, to, fresh) {
      from = hashOf(from); to = hashOf(to);
      if (from === to) return;
      if (fresh) { delete this.from[to]; }
      else if (to === this.backHref(from)) { return; }         // going up: `to` keeps its own
      else if (this.staticBack(to) === from) { delete this.from[to]; }
      else { this.from[to] = from; }
      saveFrom(this.from);
    }
    staticBack(hash) {
      var parts = hashOf(hash).replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      var pg = null;
      try { pg = this.resolve(parts); } catch (e) { return null; }
      return pg && pg.back ? hashOf(pg.back[1]) : (parts.length ? '#/' : null);
    }
    backHref(hash) { hash = hashOf(hash); return this.from[hash] || this.staticBack(hash); }
    labelOf(hash) {
      var parts = hashOf(hash).replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      if (!parts.length) return 'HK Settings';
      try { var pg = this.resolve(parts); return (pg && (pg.backLabel || pg.title)) || 'Back'; } catch (e) { return 'Back'; }
    }
    _hashLink(e) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n === this) break;
        if (n.tagName === 'A') return String(n.getAttribute('href') || '').charAt(0) === '#' ? n : null;
      }
      return null;
    }
    onHash() {
      var cur = location.hash || '#/';
      // hashchange, popstate and HA's location-changed can all say the same
      if (cur === this._seen && this.hist.length) return;
      this._seen = cur;
      // our own history, to know whether Back can simply go back
      if (this.hist.length > 1 && this.hist[this.hist.length - 2] === cur) this.hist.pop();
      else if (this.hist[this.hist.length - 1] !== cur) this.hist.push(cur);
      // A SCREEN'S FIELD ERRORS ARE THAT SCREEN'S. They are kept by setting
      // (`b:<key>`), and every screen's page has the same settings: a refused
      // Kitchen Tablet Room showed under Loft's and Master Bathroom's too. On
      // to another screen, they go.
      var screen = (/^#\/screens\/([^/?#]+)/.exec(cur) || [])[1] || null;
      if (screen !== this._errScreen) {
        var self = this;
        Object.keys(this.errors).forEach(function (k) { if (/^b:/.test(k)) delete self.errors[k]; });
        this._errScreen = screen;
      }
      this.render(false, true);
    }
    go(hash) {
      if ((location.hash || '#/') === hash) { if (this._seen !== hash) this.onHash(); else this.render(); }
      else location.hash = hash;                           // -> hashchange -> onHash
    }
    // back to `hash`: the browser's Back when that is where we came from.
    // A page's fixed parent means the page it was opened from, if any.
    back(hash) {
      var cur = hashOf(location.hash || '#/');
      if (this.from[cur] && hashOf(hash) === this.staticBack(cur)) hash = this.from[cur];
      if (this.hist.length > 1 && this.hist[this.hist.length - 2] === hash) history.back();
      else this.go(hash);
    }
    announce(text) {
      var l = this.liveEl;
      l.textContent = '';
      setTimeout(function () { l.textContent = text; }, 30);
    }

    // ---------------------------------------------------------- saving
    status(kind) {
      var st = this.bar.querySelector('.st'), self = this;
      clearTimeout(this._stT);
      st.className = 'st' + (kind === 'error' ? ' err' : '');
      if (kind === 'saving') {
        this._stT = setTimeout(function () { st.textContent = 'Saving…'; }, 350);
      } else if (kind === 'saved') {
        st.innerHTML = TICK + '<span>Saved</span>';
        this._stT = setTimeout(function () { st.textContent = ''; }, 1800);
      } else if (kind === 'error') {
        st.textContent = 'Couldn’t Save';
        this._stT = setTimeout(function () { st.textContent = ''; st.className = 'st'; }, 5000);
      } else st.textContent = '';
      void self;
    }
    // One change (or a few) to the house's settings. `local` shows it at
    // once; the answer is the truth.
    setH(changes) {
      var d = this.data;
      return this.save({ type: DOMAIN + '/settings/set', changes: changes }, Object.keys(changes), function () {
        Object.keys(changes).forEach(function (p) {
          if (p === 'sidebar' || p === 'files_folder') { d.integration[p] = changes[p]; return; }
          var i = p.indexOf('.'), sec = p.slice(0, i), key = p.slice(i + 1);
          if (d.settings[sec]) d.settings[sec][key] = changes[p];
        });
      }, function (r) { if (r && r.settings) d.settings = r.settings; });
    }
    setB(path, changes) {
      var d = this.data;
      return this.save({ type: DOMAIN + '/board/set', dashboard: path, changes: changes },
        Object.keys(changes).map(function (k) { return 'b:' + k; }), function () {
          d.boards[path] = Object.assign({}, d.boards[path] || {}, changes);
        }, function (r) { if (r && r.board) d.boards[path] = r.board; });
    }
    // A FEATURE'S OWN SETTINGS (hk-settings-features.js): read with its
    // `<id>/settings/get`, kept here while the page is open, read
    // again in the background when a minute old; saved one change at a time
    // with its `/set`, whose answer is the page again.
    feat(domain) {
      var st = (this.feats = this.feats || {})[domain] || (this.feats[domain] = {});
      if (!st.loading && (!st.at || Date.now() - st.at > 60000)) this.featLoad(domain);
      return st;
    }
    async featLoad(domain, fresh) {
      var st = this.feats[domain], self = this;
      st.loading = true;
      try {
        st.data = await this._hass.callWS(Object.assign({ type: domain + '/settings/get' }, fresh ? { fresh: true } : {}));
        st.error = null;
      } catch (e) {
        st.error = String((e && e.message) || e);
      }
      st.loading = false; st.at = Date.now();
      self.render(true);
    }
    featSet(domain, changes, keys) {
      var st = this.feat(domain);
      keys = keys || Object.keys(changes);
      return this.save({ type: domain + '/settings/set', changes: changes }, keys.map(function (k) { return 'f:' + domain + ':' + k; }),
        function () {
          if (!st.data) return;
          Object.keys(changes).forEach(function (k) {
            if (k in st.data && typeof changes[k] !== 'object') st.data[k] = changes[k];
          });
        }, function (r) { if (r) { st.data = r; st.at = Date.now(); } });
    }
    // any other command of the feature's (add, remove, a set that names an
    // entry): its answer is the page again
    featCall(domain, msg, keys) {
      var st = this.feat(domain);
      return this.save(msg, (keys || []).map(function (k) { return 'f:' + domain + ':' + k; }), function () {},
        function (r) { if (r) { st.data = r; st.at = Date.now(); } });
    }
    ws(msg, keys) {
      var self = this;
      return this.save(msg, keys || [], function () {}, function () {});
    }
    async save(msg, keys, local, apply) {
      var self = this;
      local();
      keys.forEach(function (k) { delete self.errors[k]; });
      this.render();
      this.status('saving');
      try {
        var r = await this._hass.callWS(msg);
        apply(r);
        this.status('saved');
        this.render();
        this.soon();
        return true;
      } catch (e) {
        var f = M.refusals(e);
        keys.forEach(function (k) {
          var code = f ? f[k.replace(/^b:/, '').replace(/^f:[a-z_]+:/, '')] : null;
          self.errors[k] = code ? M.errorText(code) : (f ? null : String((e && e.message) || e));
          if (!self.errors[k]) delete self.errors[k];
        });
        if (!keys.length) this.errors._ = String((e && e.message) || e);
        this.status('error');
        this.announce('Couldn’t save. ' + (Object.keys(self.errors).map(function (k) { return self.errors[k]; })[0] || ''));
        try { await this.reload(); } catch (x) { /* keep what we have */ }
        this.render();
        return false;
      }
    }

    // ---------------------------------------------------------- drawing
    typing() {
      var a = this.shadowRoot.activeElement;
      return !!(a && (a.tagName === 'INPUT' && a.type !== 'range' || a.tagName === 'TEXTAREA' ||
                      a.tagName === 'HA-YAML-EDITOR' || a.closest && a.closest('.accwrap')));
    }
    render(background, navigated) {
      if (!this.ready || !this.data) return;
      // NOT UNDER A PRESS. A text field saves on blur, and the blur of a press
      // elsewhere comes between that press's pointerdown and its click: the
      // redraw replaced the very row being pressed, and the click was lost
      // (a kind picked once did nothing; Add Pop-up needed a second tap).
      // Held until the press has ended and clicked, then drawn once.
      if (this._pressing) {
        var was = this._held || {};
        this._held = { background: !!(was.background !== undefined ? was.background && background : background),
                       navigated: !!(was.navigated || navigated) };
        return;
      }
      if (background && this.typing()) { this._dirty = true; return; }
      var self = this, parts = this.parts(), key = parts.join('/');
      var wide = this.hasAttribute('wide');
      var active = this.shadowRoot.activeElement;
      var fk = active && active.getAttribute && active.getAttribute('data-fk');
      var inSide = active && this.sideEl.contains(active);
      var top = this.scrollEl.scrollTop;
      var root = !parts.length;
      this.app.setAttribute('data-view', root && !wide ? 'root' : 'detail');
      if (wide || root) this.paintSide(parts);
      var pg = root ? this.p_overview() : this.resolve(parts);
      this.pickers = this.pickers || {};
      this.paintPage(pg, parts);
      if (key === this._last) this.scrollEl.scrollTop = top;
      else { this.scrollEl.scrollTop = 0; this.bar.classList.remove('scrolled'); }
      this._last = key;
      var t = null;
      if (fk) {
        var sel = '[data-fk="' + String(fk).replace(/(["\\])/g, '\\$1') + '"]';
        t = (inSide ? this.sideEl : this.shadowRoot).querySelector(sel);
        if (t && t.focus) t.focus({ preventScroll: true });
      }
      if (!t && navigated && !inSide) {
        var h1 = this.pageEl.querySelector('h1');
        if (h1) h1.focus({ preventScroll: true });
      }
      if (this._flash) {
        var el = this.pageEl.querySelector('[data-sk="' + this._flash + '"]');
        this._flash = null;
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('flash');
          setTimeout(function () { el.classList.remove('flash'); }, 1500);
        }
      }
      this._dirty = false;
      void self;
    }
    paintPage(pg, parts) {
      var self = this, wide = this.hasAttribute('wide');
      // THE BAR: Back to the page above (none beside the sidebar at the top)
      var lead = this.bar.querySelector('.lead');
      lead.innerHTML = '';
      var back = pg.back || (parts.length && !wide ? ['HK Settings', '#/'] : null);
      var came = this.from[hashOf(location.hash || '#/')];
      if (came && (!back || hashOf(back[1]) !== came)) back = [this.labelOf(came), came];
      if (back && (!(wide && pg.top) || came)) {
        var b = h('button', { class: 'back', type: 'button', 'aria-label': 'Back to ' + back[0] });
        b.innerHTML = BACK + '<span>' + K.esc(back[0]) + '</span>';
        b.addEventListener('click', function () { self.back(back[1]); });
        lead.appendChild(b);
      }
      this.bar.querySelector('.mid').textContent = pg.title || '';
      // THE PAGE. A screen's preview stays put while its settings redraw (a
      // moved iframe would load the whole dashboard again).
      var head = h('div', { class: 'ph' }, [h('h1', { class: 'lt', tabindex: '-1', text: pg.title || '' }),
        pg.scope ? h('p', { class: 'scope', html: pg.scope }) : null]);
      var content = h('div', { class: 'pc' });
      try { pg.body(content); } catch (e) {
        console.error('[hk-settings]', e);
        content.appendChild(K.group({ footer: 'This page couldn’t be drawn: ' + (e && e.message || e) }, []));
      }
      // beside the page (a wide window) it stays for the screen's sub-pages;
      // above it (narrower) only the screen's own page has it
      if (pg.preview && !this.hasAttribute('xwide') && !pg.previewTop) pg.preview = null;
      var keepPv = pg.preview && this._pv && this._pv.path === pg.preview && this.pageEl.querySelector('.pvcol');
      if (keepPv) {
        this.pageEl.replaceChild(head, this.pageEl.querySelector('.ph'));
        this.pageEl.replaceChild(content, this.pageEl.querySelector('.pc'));
      } else {
        this.pageEl.innerHTML = '';
        this.pageEl.className = 'page' + (pg.preview ? ' split' : '');
        this.pageEl.appendChild(head);
        this._pv = null; this._fit = null;
        if (pg.preview && (this.hasAttribute('xwide') || (pg.previewTop && wide))) {
          this.pageEl.appendChild(this.previewCol(pg.preview));
        }
        this.pageEl.appendChild(content);
      }
    }

    // ---------------------------------------------------------- sidebar
    paintSide(parts) {
      var d = this.data, self = this, wide = this.hasAttribute('wide');
      var here = parts.join('/');
      var at = function (p) { return here === p || here.indexOf(p + '/') === 0; };
      var side = this.sideEl;
      var searchHad = side.querySelector('.search input');
      var focused = searchHad && this.shadowRoot.activeElement === searchHad;
      var selStart = focused ? searchHad.selectionStart : null;
      side.innerHTML = '';
      var top = h('div', { class: 'sidetop' });
      var head = h('div', { class: 'sidehead' });
      if (this._narrow && customElements.get('ha-menu-button')) {
        if (!this._menuBtn) { this._menuBtn = document.createElement('ha-menu-button'); }
        this._menuBtn.hass = this._hass; this._menuBtn.narrow = this._narrow;
        head.appendChild(this._menuBtn);
      }
      head.appendChild(h('h1', { text: 'HK Settings' }));
      top.appendChild(head);
      var sb = h('div', { class: 'search', role: 'search' });
      sb.appendChild(K.icon('mdi:magnify', 'mag'));
      var inp = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search settings', 'data-fk': 'side:search' });
      inp.value = this.q;
      inp.addEventListener('input', function () {
        self.q = inp.value;
        self.paintSide(self.parts());
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.q = ''; self.paintSide(self.parts()); } });
      sb.appendChild(inp);
      top.appendChild(sb);
      side.appendChild(top);
      if (focused) { inp.focus(); try { inp.setSelectionRange(selStart, selStart); } catch (e) { /* type=search */ } }

      if (this.q.trim()) { side.appendChild(this.searchResults()); return; }
      var items = d.dashboards.filter(function (x) { return x.item; });
      var nAcc = Object.keys((d.accessories && d.accessories.entities) || {}).length;
      side.appendChild(K.group({}, [K.nav({ tile: ['mdi:home-heart', C.orange], label: 'Overview',
        sub: items.length + ' Screens · ' + nAcc + ' Accessories', href: '#/overview',
        current: wide && (here === '' || here === 'overview'), fk: 'side:overview' })]));
      var rows = items.map(function (x) {
        return K.nav({ tile: [x.generated ? 'mdi:view-dashboard-variant' : 'mdi:tablet-dashboard', x.generated ? C.indigo : C.blue],
                       label: x.title, href: '#/screens/' + encodeURIComponent(x.path), current: wide && at('screens/' + x.path),
                       fk: 'side:s:' + x.path });
      });
      rows.push(K.nav({ tile: ['mdi:plus', C.gray], label: 'Add Screen', href: '#/add-screen', current: wide && at('add-screen'),
                        fk: 'side:add' }));
      side.appendChild(K.group({ header: 'Screens' }, rows));
      var list = function (header, arr, pre) {
        side.appendChild(K.group({ header: header }, arr.map(function (p) {
          var r = (pre || '') + p[0];
          return K.nav({ tile: [p[2], p[3]], label: p[1], href: '#/' + r, current: wide && at(r), fk: 'side:' + r });
        })));
      };
      list('All Screens', HOUSE, 'house/');
      // FEATURES: Music, Live TV, Alarm PIN, Clean Areas -- each page is that
      // feature's own settings
      list('Features', F.listed(d.features).map(function (x) { return [x[0], x[2], x[3], x[4]]; }), 'features/');
      list('Library', LIBRARY);
      list('System', SYSTEM);
    }
    searchResults() {
      var d = this.data, self = this;
      var screens = d.dashboards.filter(function (x) { return x.item; });
      var extra = [];
      screens.forEach(function (x) { extra.push({ label: x.title, route: 'screens/' + x.path, where: 'Screen', words: x.path }); });
      d.popups.forEach(function (p) { extra.push({ label: p.name || p.hash, route: 'popups/' + p.hash, where: 'Pop-up', words: '#' + p.hash }); });
      (d.custom_pages || []).forEach(function (p) { extra.push({ label: p.title, route: 'pages/' + p.path, where: 'Custom Page', words: p.path }); });
      extra = extra.concat(F.search(d.features));
      var areas = this._hass.areas || {};
      Object.keys(areas).forEach(function (a) { extra.push({ label: areas[a].name, route: 'accessories/room/' + a, where: 'Room', words: 'room' }); });
      var res = M.search(this.q, screens, extra).slice(0, 60);
      if (!res.length) return K.group({ footer: 'No settings match “' + this.q.trim() + '”.' }, []);
      return K.group({ header: 'Results' }, res.map(function (r, i) {
        var a = K.nav({ label: r.label, sub: r.where || null, href: '#/' + r.route, fk: 'side:r:' + i });
        a.addEventListener('click', function () { self._flash = /^screens\/[^/]+$/.test(r.route) && r.where !== 'Screen' ? 'b:' + r.key : r.key; });
        return a;
      }));
    }

    // ---------------------------------------------------------- helpers
    hs(path) { var i = path.indexOf('.'); return (this.data.settings[path.slice(0, i)] || {})[path.slice(i + 1)]; }
    err(sk) { return this.errors[sk] || null; }
    dash(path) { return this.data.dashboards.filter(function (x) { return x.path === path; })[0]; }
    name(id) {
      if (!id) return '';
      var a = ((this.data.accessories || {}).entities || {})[id];
      var st = this._hass.states[id];
      return (a && a.name) || (st && st.attributes.friendly_name) || id;
    }
    areaOf(id) {
      var e = (this._hass.entities || {})[id] || {}, devs = this._hass.devices || {};
      return e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id) || '';
    }
    areaName(a) { var x = (this._hass.areas || {})[a]; return (x && x.name) || a; }
    areasAZ() {
      var areas = this._hass.areas || {};
      return Object.keys(areas).sort(function (p, q) { return String(areas[p].name).localeCompare(String(areas[q].name)); });
    }
    entityIds(filter) {
      var hass = this._hass, ents = hass.entities || {};
      return Object.keys(hass.states).filter(function (id) {
        var dom = id.split('.')[0];
        if (filter.domains && filter.domains.indexOf(dom) < 0) return false;
        if (filter.re && !filter.re.test(id)) return false;
        if (filter.dc && hass.states[id].attributes.device_class !== filter.dc) return false;
        if (filter.shown) { var e = ents[id] || {}; if (e.hidden || e.entity_category) return false; }
        return true;
      });
    }
    // A ROW THAT PICKS AN ENTITY: its value is the entity's name (or what
    // "none" means), and it opens a searchable list.
    entityRow(o) {
      var self = this;
      var href = this.picker(o.sk, {
        title: o.title || o.label, value: o.value, none: o.none, required: o.required,
        items: function () {
          return self.entityIds(o.filter).map(function (id) { return { value: id, label: self.name(id), sub: id }; });
        },
        onPick: o.onPick
      });
      var st = o.value && this._hass.states[o.value];
      var val = o.value ? (st ? this.name(o.value) : o.value + ' (missing)') : (o.none || 'None');
      var row = K.nav({ label: o.label, sub: o.sub, value: val, href: href, sk: o.sk });
      return this.withError(row, o.sk);
    }
    withError(row, sk) {
      var e = this.err(sk);
      if (!e) return row;
      return h('div', { class: 'cellwrap' }, [row, h('div', { class: 'errline', role: 'alert', text: e })]);
    }
    // register a picker page under the current page (#/<here>/~<key>)
    picker(key, spec) {
      var parts = this.parts().filter(function (p) { return p[0] !== '~'; });
      this.pickers[key] = spec;
      return '#/' + parts.map(encodeURIComponent).join('/') + '/~' + encodeURIComponent(key);
    }
    pickerPage(parts) {
      var self = this, key = parts[parts.length - 1].slice(1);
      var parentParts = parts.slice(0, -1);
      // a picker's page is registered by its page: draw that, unseen, first
      var parent = this.resolve(parentParts);
      var scratch = document.createElement('div');
      try { parent.body(scratch); } catch (e) { /* its picker may still be there */ }
      var spec = this.pickers[key];
      var backHash = '#/' + parentParts.map(encodeURIComponent).join('/');
      if (!spec) return { title: parent.title, back: [parent.title, backHash], body: function (c) { self.go(backHash); void c; } };
      return { title: spec.title, back: [parent.title, backHash], body: function (c) {
        var q = self._pq || '';
        var sb = h('div', { class: 'search', style: 'margin:0 0 18px' });
        sb.appendChild(K.icon('mdi:magnify', 'mag'));
        var inp = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search ' + spec.title, 'data-fk': 'pick:search' });
        inp.value = q;
        sb.appendChild(inp);
        c.appendChild(sb);
        var listBox = h('div');
        c.appendChild(listBox);
        var choose = function (v) {
          self._pq = '';
          self.back(backHash);
          spec.onPick(v);
        };
        var paint = function () {
          listBox.innerHTML = '';
          var words = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
          var all = spec.items().sort(function (a, b) { return a.label.localeCompare(b.label); });
          var got = all.filter(function (it) {
            var t = (it.label + ' ' + (it.sub || '')).toLowerCase();
            return words.every(function (w) { return t.indexOf(w) >= 0; });
          });
          var rows = [];
          if (spec.none && !words.length) rows.push(K.check({ label: spec.none, on: !spec.value, onClick: function () { choose(null); }, fk: 'pick:none' }));
          got.slice(0, 250).forEach(function (it) {
            rows.push(K.check({ label: it.label, sub: it.sub, on: it.value === spec.value,
                                onClick: function () { choose(it.value); }, fk: 'pick:' + it.value }));
          });
          listBox.appendChild(K.group({ footer: got.length > 250 ? 'Showing 250 of ' + got.length + '. Search to find more.' :
            (!got.length ? 'Nothing matches.' : null) }, rows));
        };
        inp.addEventListener('input', function () { self._pq = inp.value; paint(); });
        paint();
      } };
    }

    resolve(parts) {
      var last = parts[parts.length - 1] || '';
      if (last[0] === '~') return this.pickerPage(parts);
      var a = parts[0];
      if (a === 'overview') return this.p_overview();
      // no screen named: the Overview (the list of screens is the menu) --
      // not "There's no dashboard at /undefined"
      if (a === 'screens') return parts[1] ? this.p_screen(parts[1], parts.slice(2)) : this.p_overview();
      if (a === 'add-screen') return this.p_add(parts.slice(1));
      if (a === 'house' && parts[1] === 'music') return this.p_music(parts.slice(2));    // its old address
      if (a === 'house') return this.p_house(parts[1], parts.slice(2));
      if (a === 'features') {
        if (parts[1] === 'music') return this.p_music(parts.slice(2));
        return F.page(this, parts.slice(1)) || this.p_overview();
      }
      if (a === 'accessories') return this.p_accessories(parts.slice(1));
      if (a === 'popups') return this.p_popups(parts.slice(1));
      if (a === 'pages') return this.p_pages(parts.slice(1));
      if (a === 'chips') return this.p_chips(parts.slice(1));
      if (a === 'advanced') return this.p_advanced();
      if (a === 'check') return this.p_check();
      if (a === 'setup') return this.p_setup(Number(parts[1] || 0));
      return this.p_overview();
    }

    // ================================================================ PAGES
    // Each: { title, back: [label, hash], top (a sidebar page), scope (html),
    //         preview (a dashboard path), body(container) }

    // ---------------------------------------------------------- overview
    p_overview() {
      var self = this, d = this.data;
      return { title: 'Overview', top: true, scope: 'Settings for the HK Frontend dashboards in this home.', body: function (c) {
        c.appendChild(K.group({ header: 'Where Settings Live' }, [
          K.info({ tile: ['mdi:tablet-dashboard', C.blue], label: 'Screens',
                   sub: 'Each screen’s own menu, Home page, pages, appearance and behavior.' }),
          K.info({ tile: ['mdi:home', C.gray], label: 'All Screens',
                   sub: 'What every screen shares. Where a screen can choose for itself, it says “Same as All Screens” until it does.' }),
          K.info({ tile: ['mdi:lightbulb-group', C.yellow], label: 'Accessories',
                   sub: 'Names, icons and rooms: the same on every screen.' })]));
        var check = self._check;
        var bad = check ? check.filter(function (l) { return l.ok === false; }).length : null;
        c.appendChild(K.group({ header: 'Setup' }, [
          K.nav({ label: 'Setup Check', href: '#/check',
                  value: check ? (bad ? bad + ' to Fix' : 'Ready') : 'Checking…' }),
          K.nav({ label: 'Setup Assistant', href: '#/setup' })]));
        c.appendChild(K.group({ header: 'In This Home' }, [
          K.info({ label: 'Screens', value: String(d.dashboards.filter(function (x) { return x.item; }).length) }),
          K.nav({ label: 'Customized Accessories', value: String(Object.keys(d.accessories.entities || {}).length), href: '#/accessories' }),
          K.nav({ label: 'Pop-ups', value: String(d.popups.length), href: '#/popups' }),
          K.nav({ label: 'Custom Pages', value: String((d.custom_pages || []).length), href: '#/pages' })]));
        if (!check && !self._checking) {
          self._checking = true;
          self._hass.callWS({ type: DOMAIN + '/setup/check' }).then(function (r) {
            self._check = r.lines; self._checking = false; self.render(true);
          }, function () { self._checking = false; });
        }
      } };
    }

    // ---------------------------------------------------------- a screen
    previewCol(path) {
      var self = this, x = this.dash(path);
      var col = h('aside', { class: 'pvcol', 'aria-label': 'Preview' });
      var head = h('div', { class: 'pvhead' }, [h('span', { text: 'Preview' }),
        h('a', { href: '/' + path + '/0', target: '_blank', rel: 'noopener', text: 'Open Screen' })]);
      head.lastChild.setAttribute('href', '/' + path + '/0');
      col.appendChild(head);
      var pv = h('div', { class: 'pvbox' });
      var fr = document.createElement('iframe');
      // kiosk: no Home Assistant header; wp_enabled=false: WallPanel never
      // runs in a preview (it would drive the real tablet's screensaver)
      fr.src = '/' + path + '/0?kiosk&wp_enabled=false';
      fr.title = (x ? x.title : path) + ' preview';
      fr.setAttribute('tabindex', '-1');
      pv.appendChild(fr);
      col.appendChild(pv);
      col.appendChild(h('p', { class: 'gf', text: 'Live: changes show here within seconds. A generated screen rebuilds itself within about ten.' }));
      var fit = function () { var w = pv.clientWidth || 600; fr.style.transform = 'scale(' + (w / 1280) + ')'; };
      requestAnimationFrame(fit);
      new ResizeObserver(fit).observe(pv);
      this._pv = { path: path };
      this._fit = fit;
      void self;
      return col;
    }
    p_screen(path, sub) {
      var self = this, x = this.dash(path);
      var home = ['HK Settings', '#/'];
      if (!x) return { title: 'Screen', back: home, body: function (c) { c.appendChild(K.group({ footer: 'There’s no dashboard at /' + path + '.' }, [])); } };
      var base = '#/screens/' + encodeURIComponent(path);
      var b = this.data.boards[path];
      if (!x.item || !b) {
        return { title: x.title, top: true, back: home, scope: 'This dashboard has no HK settings yet.', body: function (c) {
          c.appendChild(K.group({ footer: 'Give it its own menu, Home page and appearance. It starts from what it’s shown on — a wall tablet, a phone, a computer or a car.' },
            [K.nav({ label: 'Set Up This Screen', href: '#/add-screen/use/' + encodeURIComponent(path), cls: 'tintc' })]));
          if (x.generated && x.mode === 'storage') c.appendChild(self.deleteGroup(x));
        } };
      }
      var s = sub[0];
      var mk = function (title, body, backTo) {
        return { title: title, back: backTo || [x.title, base], preview: path, body: body };
      };
      if (s === 'menu-style') return mk('Button Style', function (c) { self.s_menuStyle(c, x, b); });
      if (s === 'menu-narrow') return mk(b.menu === 'open' ? 'When Folded' : 'On Narrow Screens', function (c) { self.s_menuNarrow(c, x, b); });
      if (s === 'menu-pages' && x.generated) s = 'pages';
      if (s === 'menu-pages') return mk('Pages in Menu', function (c) { self.s_menuPages(c, x, b); });
      if (s === 'chips' && sub[1]) return mk(M.CHIP_LABELS[sub[1]] || sub[1], function (c) { self.s_chip(c, x, b, sub[1]); },
                                               ['Status Chips', base + '/chips']);
      if (s === 'chips') return mk('Status Chips', function (c) { self.s_chips(c, x, b); });
      if (s === 'cameras' && sub[1] === 'live') {
        return mk('Live Camera Follows', function (c) { self.s_cameraLive(c, x, b); }, ['Cameras', base + '/cameras']);
      }
      if (s === 'cameras') return mk('Cameras', function (c) { self.s_cameras(c, x, b); });
      if (s === 'scenes' && sub[1] === 'pill' && sub[2]) {
        return mk(M.PAGE_LABELS[sub[2]] || sub[2], function (c) { self.s_pill(c, x, b, sub[2]); }, ['Scenes', base + '/scenes']);
      }
      if (s === 'scenes') return mk('Scenes', function (c) { self.s_scenes(c, x, b); });
      if (s === 'favorites') return mk('Favorites', function (c) { self.s_favorites(c, x, b); });
      if (s === 'rooms') return mk('Rooms', function (c) { self.s_rooms(c, x, b); });
      if (s === 'pages') return mk('Pages', function (c) { self.s_pages(c, x, b); });
      if (s === 'glass') return mk('Glass', function (c) { self.s_glass(c, x, b); });
      if (s === 'wallpanel' || s === 'kiosk') {
        var key = s + '_options', spec = OPTION_PAGES[s];
        var saveOpts = function (v) { var o = {}; o[key] = v; return self.setB(path, o); };
        if (sub[1] === 'yaml') {
          return mk('Options in YAML', function (c) {
            self.yamlPage(c, { value: b[key] || {}, note: ((self.data.thirdparty || {})[s] || {}).note, sk: 'b:' + key,
                               help: spec.yamlHelp, example: spec.example, docs: spec.docs, onSave: saveOpts });
          }, [spec.title, base + '/' + s]);
        }
        return mk(spec.title, function (c) {
          self.optionsPage(c, spec, b[key] || {}, saveOpts, base + '/' + s + '/yaml', ((self.data.thirdparty || {})[s] || {}));
        });
      }
      return { title: x.title, top: true, back: home, preview: path, previewTop: true,
        scope: 'Only this screen · <b>/' + K.esc(path) + '</b> · ' + (x.generated ? 'Generated from your home' : 'Written in YAML'),
        body: function (c) { self.s_main(c, x, b); } };
    }
    s_main(c, x, b) {
      var self = this, path = x.path, base = '#/screens/' + encodeURIComponent(path), gen = x.generated;
      var set = function (ch) { return self.setB(path, ch); };
      var look = this.data.settings.look;
      if (!this.hasAttribute('wide')) {
        c.appendChild(K.group({}, [K.nav({ label: 'Open Screen', sub: 'In a new tab', href: '/' + path + '/0', icon: 'mdi:open-in-new' })]));
        var o = c.lastChild.querySelector('a');
        o.setAttribute('target', '_blank'); o.setAttribute('rel', 'noopener');
      }
      // MENU
      var mode = M.menuMode(b), rows = [];
      rows.push(K.seg({ label: 'Menu', sk: 'b:menu', value: mode, stack: !this.hasAttribute('wide'),
        options: [['off', 'Off'], ['button', 'Button'], ['open', 'Always Open']],
        onChange: function (v) { set({ menu: M.menuFor(v, b, self._lastStyle) }); } }));
      if (mode === 'button') {
        this._lastStyle = b.menu;
        rows.push(K.nav({ label: 'Button Style', value: M.menuStyleLabel(b.menu), href: base + '/menu-style', sk: 'b:menu-style' }));
        rows.push(K.nav({ label: 'On Narrow Screens', value: M.narrowLabel(b.narrow), href: base + '/menu-narrow', sk: 'b:narrow' }));
      }
      if (M.showsTab(b)) {
        rows.push(K.text({ label: 'Tab Position', sk: 'b:tab_position', value: b.tab_position, placeholder: 'Level with Date',
          error: this.err('b:tab_position'), onCommit: function (v) { set({ tab_position: v.trim() }); } }));
      }
      if (mode === 'open') {
        rows.push(K.text({ label: 'Keep Open Down To', sk: 'b:dock_min', value: b.dock_min, unit: 'px', inputmode: 'numeric',
          error: this.err('b:dock_min'), onCommit: function (v) { set({ dock_min: Number(String(v).replace(/[^\d.]/g, '')) || 0 }); } }));
        rows.push(K.nav({ label: 'When Folded', value: M.narrowLabel(b.narrow), href: base + '/menu-narrow', sk: 'b:narrow' }));
        rows.push(K.toggle({ label: 'Time & Weather in Menu', sk: 'b:time_weather', on: b.time_weather === 'menu',
          onChange: function (on) { set({ time_weather: on ? 'menu' : 'page' }); } }));
      }
      if (mode !== 'off') {
        // a generated screen says which pages its menu lists on its Pages
        if (!gen) rows.push(K.nav({ label: 'Pages in Menu', sk: 'b:categories', href: base + '/menu-pages',
                                    value: b.categories.length || (b.menu_top || []).length ? 'Custom' : 'Automatic' }));
        rows.push(K.seg({ label: 'Rooms in Menu', sk: 'b:menu_rooms', value: b.menu_rooms, stack: !this.hasAttribute('wide'),
                          options: [['az', 'A to Z'], ['order', 'Room Order']], onChange: function (v) { set({ menu_rooms: v }); } }));
        rows.push(K.toggle({ label: 'Home Assistant Row', sk: 'b:ha_row', on: b.ha_row,
                             onChange: function (on) { set({ ha_row: on }); } }));
      }
      var menuFoot = gen && mode !== 'off' ? ' Where each page sits in the menu is set in Pages.' : '';
      c.appendChild(K.group({ header: 'Menu', footer: mode === 'off' ? 'No menu on this screen.' :
        (mode === 'open' ? 'Narrower than this, the menu folds away and When Folded takes its place. The Home Assistant row opens Home Assistant’s own sidebar.' :
        'Below 1,024 px (an iPad held upright, a phone), On Narrow Screens takes over from the Button Style. The Home Assistant row opens Home Assistant’s own sidebar.') + menuFoot }, rows));

      // HOME PAGE
      var chipsVal = !b.chips_row ? 'Off' : b.chips.length ? b.chips.length + ' Chips' : 'Automatic';
      var camsVal = gen && !b.camera_strip ? 'Off' : b.cameras.length ? b.cameras.length + ' Cameras' : 'Automatic';
      var scenesVal = !b.scenes_row ? 'Off' : b.scenes.length ? b.scenes.length + ' Scenes' : 'Automatic';
      var roomsVal = !b.room_order.length ? 'Automatic' : b.home_rooms === 'only' ? b.room_order.length + ' on Home' : 'Custom Order';
      var home = [
        K.nav({ label: 'Status Chips', value: chipsVal, href: base + '/chips', sk: 'b:chips' }),
        K.nav({ label: 'Cameras', value: camsVal, href: base + '/cameras', sk: 'b:cameras' }),
        K.nav({ label: 'Scenes', value: scenesVal, href: base + '/scenes', sk: 'b:scenes' })];
      if (gen) home.push(K.nav({ label: 'Favorites', value: b.favorites.length ? String(b.favorites.length) : 'None',
                                 href: base + '/favorites', sk: 'b:favorites' }));
      // what a phone shows at the top: the clock and weather, or the strip
      if (gen) home.push(K.select({ label: 'On Phones', sub: 'Under 640 px', sk: 'b:phone_header', value: b.phone_header || 'header',
                                    options: [['header', 'Clock and Weather'], ['strip', 'Weather Strip']],
                                    onChange: function (v) { self.setB(path, { phone_header: v }); } }));
      home.push(K.nav({ label: 'Rooms', value: roomsVal, href: base + '/rooms', sk: 'b:room_order' }));
      c.appendChild(K.group({ header: 'Home Page', footer: gen ? null :
        'This screen is written in YAML, so it draws its own Home page. These lists apply where its cards read them: the chip row, the scenes row, the camera strip and the room order.' }, home));

      // PAGES
      if (gen) {
        c.appendChild(K.group({ header: 'Pages', footer: 'The order here is the menu’s too; each page’s row says where it sits in the menu.' }, [
          K.nav({ label: 'Pages', href: base + '/pages', sk: 'b:pages',
                  value: b.pages.length ? b.pages.filter(function (k) { return k !== 'browse'; }).length + ' Pages' : 'Automatic' })]));
      }

      // APPEARANCE
      var gl = M.glassOf(b, look), app = [];
      app.push(K.nav({ label: 'Glass', href: base + '/glass', sk: 'b:glass',
        value: gl.own ? M.glassLabel(gl.value) : 'Same as All Screens (' + M.glassLabel(gl.house) + ')' }));
      var uses = M.amountsFor(gl.effective);
      ['frost', 'blur'].forEach(function (k) {
        if (!uses[k]) return;
        var a = M.amountOf(b, look, k);
        app.push(K.slider({ label: k === 'frost' ? 'Frost' : 'Blur', sk: 'b:' + k, value: a.value, unit: ' %', step: 5,
          badge: a.own ? null : 'Same as All Screens', onChange: function (v) { var o = {}; o[k] = v; set(o); } }));
        if (a.own) app.push(K.button({ label: 'Use All-Screens ' + (k === 'frost' ? 'Frost' : 'Blur') + ' (' + a.house + ' %)', sk: 'b:' + k + ':reset',
          onClick: function () { var o = {}; o[k] = null; set(o); } }));
      });
      app.push(K.toggle({ label: 'Live Sky', sk: 'b:sky', on: b.sky, onChange: function (on) { set({ sky: on }); } }));
      if (gen) app.push(K.toggle({ label: 'Hide Home Assistant Header & Sidebar', sk: 'b:kiosk', on: b.kiosk,
                                   onChange: function (on) { set({ kiosk: on }); } }));
      if (gen && b.kiosk) app.push(K.nav({ label: 'Kiosk Mode Options', href: base + '/kiosk', sk: 'b:kiosk_options',
                                           value: Object.keys(b.kiosk_options || {}).length ? 'Custom' : 'Default' }));
      var skySw = look.sky_switch;
      var appFoot = [];
      if (gen && skySw && b.sky) appFoot.push('The sky also follows ' + this.name(skySw) + ' (Sky).');
      if (!gen) appFoot.push('A YAML screen’s sky comes from its YAML; Live Sky can only turn it off here.');
      if (gen && b.kiosk && (this.data.thirdparty.kiosk || {}).state !== 'ready') appFoot.push((this.data.thirdparty.kiosk || {}).note || '');
      c.appendChild(K.group({ header: 'Appearance', footer: appFoot.join(' ') || null }, app));

      // BEHAVIOR
      var beh = [];
      beh.push(K.toggle({ label: 'Return to Home When Idle', sk: 'b:idle_return', on: b.idle_return,
                          onChange: function (on) { set({ idle_return: on }); } }));
      var needRoom = b.idle_return || (gen && b.screensaver);
      if (needRoom) {
        beh.push(K.text({ label: 'Tablet Room', sk: 'b:idle_room', value: b.idle_room, placeholder: 'kitchen',
          error: this.err('b:idle_room'), onCommit: function (v) { set({ idle_room: v.trim().toLowerCase() }); } }));
      }
      beh.push(K.toggle({ label: 'Allow Pop-ups', sk: 'b:popups', on: b.popups, onChange: function (on) { set({ popups: on }); } }));
      beh.push(K.toggle({ label: 'Car Browser', sub: 'Fit a car’s narrow browser to a desktop layout.', sk: 'b:car', on: b.car,
                          onChange: function (on) { set({ car: on }); } }));
      if (gen) {
        beh.push(K.toggle({ label: 'Now Playing Bar', sk: 'b:now_playing', on: b.now_playing,
                            onChange: function (on) { set({ now_playing: on }); } }));
        beh.push(K.toggle({ label: 'Photo Screensaver', sk: 'b:screensaver', on: b.screensaver,
                            onChange: function (on) { set({ screensaver: on }); } }));
        if (b.screensaver) {
          beh.push(K.nav({ label: 'Screensaver Options', href: base + '/wallpanel', sk: 'b:wallpanel_options',
                           value: Object.keys(b.wallpanel_options || {}).length ? 'Custom' : 'Default' }));
          var users = (this.data.users || []).slice();
          if (b.tablet_user && users.indexOf(b.tablet_user) < 0) users.push(b.tablet_user);
          beh.push(K.select({ label: 'Tablet User', sk: 'b:tablet_user', value: b.tablet_user,
            options: [['', 'Choose…']].concat(users.map(function (u) { return [u, u]; })),
            onChange: function (v) { set({ tablet_user: v }); } }));
        }
      }
      var bf = [];
      if (needRoom) bf.push('The tablet’s room names its helpers (binary_sensor.<room>_tablet_in_use, input_number.<room>_tablet_room_idle). Without a room idle time, the Wall Tablets default is used.');
      var pops = (this.data.popups || []).map(function (p) { return p.name || '#' + p.hash; });
      bf.push((pops.length ? 'Pop-ups (' + pops.join(', ') + ')' : 'Pop-ups') +
        ' open over this screen when an automation shows one. Off: never here — a car’s screen, say.');
      if (gen && b.screensaver) bf.push('Only the tablet’s user gets the screensaver, so a desk opening this screen never does. Photos are set in Wall Tablets.');
      c.appendChild(K.group({ header: 'Behavior', footer: bf.join(' ') }, beh));

      if (gen && x.mode === 'storage') { c.appendChild(this.deleteGroup(x)); return; }
      c.appendChild(K.group({ footer: 'The dashboard itself stays. Its menu, Home page and appearance go back to the defaults.' }, [
        K.button({ label: 'Remove HK Settings…', destructive: true, sk: 'b:remove', onClick: function () {
          K.confirm(self.shadowRoot, { title: 'Remove HK settings for ' + x.title + '?',
            message: 'The dashboard stays. Its menu, Home page, pages and appearance go back to the defaults.',
            ok: 'Remove', destructive: true }).then(function (yes) {
            if (!yes) return;
            self.ws({ type: 'config_entries/subentries/delete', entry_id: self.data.entry_id, subentry_id: x.item })
              .then(function (ok) { if (ok) self.reload().then(function () { self.render(); }); });
          });
        } })]));
    }
    // DELETE SCREEN: a generated screen -- one the page can make -- can go
    // altogether: its dashboard and its settings. A hand-written one only
    // ever loses its settings (Remove HK Settings): it is a file.
    deleteGroup(x) {
      var self = this;
      return K.group({ footer: 'Deletes the dashboard and its HK settings. A tablet showing it will need another screen.' }, [
        K.button({ label: 'Delete Screen…', destructive: true, sk: 'b:delete', onClick: function () {
          K.confirm(self.shadowRoot, { title: 'Delete ' + x.title + '?',
            message: 'The dashboard /' + x.path + ' and its HK settings are deleted. This can’t be undone here.',
            ok: 'Delete', destructive: true }).then(function (yes) { if (yes) self.deleteScreen(x); });
        } })]);
    }
    async deleteScreen(x) {
      var hass = this._hass;
      // the preview is that dashboard, running: unload it first, or it
      // reports its own dashboard missing the moment it is deleted
      var pv = this.pageEl.querySelector('.pvcol');
      if (pv) { var fr = pv.querySelector('iframe'); if (fr) fr.src = 'about:blank'; pv.remove(); }
      this._pv = null; this._fit = null;
      this.status('saving');
      try {
        if (x.item) await hass.callWS({ type: 'config_entries/subentries/delete', entry_id: this.data.entry_id, subentry_id: x.item });
        var list = await hass.callWS({ type: 'lovelace/dashboards/list' });
        var d = (list || []).filter(function (y) { return y.url_path === x.path; })[0];
        if (d) await hass.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
        this.status('saved');
        this.announce(x.title + ' deleted');
      } catch (e) {
        this.status('error');
        this.announce('Couldn’t delete it: ' + ((e && e.message) || e));
      }
      await this.reload();
      this.go('#/overview');
    }
    s_menuStyle(c, x, b) {
      var self = this;
      c.appendChild(K.group({ footer: 'Below 1,024 px — an iPad held upright, a phone — the screen’s On Narrow Screens choice takes over.' },
        M.MENU_STYLES.map(function (s) {
          return K.check({ label: s[1], sub: s[2], on: b.menu === s[0], fk: 'style:' + s[0], onClick: function () {
            self.setB(x.path, { menu: s[0] });
            self.back('#/screens/' + encodeURIComponent(x.path));
          } });
        })));
    }
    s_menuPages(c, x, b) {
      // A HAND-WRITTEN SCREEN'S MENU: each of its pages at the top
      // (right under Home), under Categories, or not in the menu -- as a
      // generated screen's Pages does it. Automatic: the views' own `menu: top`
      // at the top; under Categories, the pages Home's status chips open.
      var self = this, set = function (ch) { return self.setB(x.path, ch); };
      var items = (x.menu_layout || []).map(function (it) { return { path: it.path, title: it.title, page: it.page, top: it.top, auto: it.auto }; });
      if (!items.length) { c.appendChild(K.group({ footer: 'This dashboard has no pages to list besides Home and its rooms.' }, [])); return; }
      c.appendChild(K.group({ footer: 'Top of Menu: right under Home, above Categories. Categories are listed in the order of Home’s status chips. Not in Menu: still one tap away on its chip.' },
        items.map(function (it) {
          return K.select({ label: it.title, sub: it.page ? 'The ' + it.page + ' page' : null, sk: 'place:' + it.path,
            value: M.placeOf(b, it, items), options: M.MENU_PLACES,
            onChange: function (v) {
              var ch = M.placeSet(b, items, it.path, v);
              if (!ch) { self.announce('Categories keeps at least one page: move it to the top, or use the automatic menu.'); self.render(); return; }
              set(ch);
            } });
        })));
      if ((b.menu_top || []).length || (b.categories || []).length) {
        c.appendChild(K.group({ footer: 'Automatic: the pages whose YAML says menu: top at the top; under Categories, the pages Home’s status chips open.' }, [
          K.button({ label: 'Use the Automatic Menu', fk: 'menu:auto', onClick: function () { set({ menu_top: [], categories: [] }); } })]));
      }
    }
    s_menuNarrow(c, x, b) {
      var self = this;
      c.appendChild(K.group({ footer: b.menu === 'open'
          ? 'Narrower than Keep Open Down To — an iPad held upright, a phone — the menu folds away and this takes its place.'
          : 'Below 1,024 px — an iPad held upright, a phone — this takes over from the Button Style.' },
        M.NARROW.map(function (n) {
          return K.check({ label: n[1], sub: n[2], on: (b.narrow || 'chip') === n[0], fk: 'narrow:' + n[0], onClick: function () {
            self.setB(x.path, { narrow: n[0] });
            self.back('#/screens/' + encodeURIComponent(x.path));
          } });
        })));
    }
    s_chips(c, x, b) {
      var self = this, path = x.path, base = '#/screens/' + encodeURIComponent(path);
      var set = function (ch) { return self.setB(path, ch); };
      var kinds = this.data.chip_kinds;
      c.appendChild(K.group({ footer: b.chips_row ? null : 'No chip row on this screen.' }, [
        K.toggle({ label: 'Show Status Chips', sk: 'b:chips_row', on: b.chips_row, onChange: function (on) { set({ chips_row: on }); } })]));
      if (!b.chips_row) return;
      var lib = this.data.custom_chips || [];
      var mdl = M.chipsModel(b, kinds, lib);
      var lab = function (r) { return r.custom ? r.name : r.own ? self.name(r.value) : M.CHIP_LABELS[r.value] || r.value; };
      c.appendChild(K.listEditor({
        fk: 'chips', auto: mdl.auto, announce: this.announce.bind(this), minRows: 1,
        autoFooter: 'Automatic shows a chip for everything the house has, in the usual order. A kind the house has nothing of never shows.',
        rows: mdl.rows.map(function (r) {
          return { value: r.value, label: lab(r), removable: r.own || r.custom,
                   sub: r.custom ? 'Custom chip' : r.own ? 'Accessory chip' : r.quiet ? 'Only when active' : null,
                   href: r.custom ? '#/chips/' + encodeURIComponent(r.key)
                                  : r.own ? '#/accessories/' + encodeURIComponent(r.value) : base + '/chips/' + r.value };
        }),
        more: mdl.more.map(function (r) { return { value: r.value, label: lab(r), sub: r.custom ? 'Custom chip' : null }; }),
        onAdd: function (v) {
          if (v.indexOf(M.CHIP_TOKEN) === 0) { set(M.chipsAddCustom(b, v.slice(M.CHIP_TOKEN.length))); return; }
          set(M.chipsSave(mdl.rows.map(function (r) { return r.value; }).concat(v), kinds, lib));
        },
        onAuto: function (on) {
          if (!on) { set({ chips: mdl.rows.map(function (r) { return r.value; }) }); return; }
          K.confirm(self.shadowRoot, { title: 'Use Automatic Chips?', message: 'This screen’s chip order and choices will be replaced.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) set({ chips: [] }); });
        },
        onChange: function (v) { set(M.chipsSave(v, kinds, lib)); },
        onRemove: function (v) {
          if (v.indexOf(M.CHIP_TOKEN) === 0) { set(M.chipsRemoveCustom(b, v.slice(M.CHIP_TOKEN.length))); return; }
          set(M.chipsRemoveOwn(b, v));
        },
        addLabel: 'Add Accessory Chip…', onAddOther: function () {
          self.go(self.picker('chip-add', { title: 'Add Accessory Chip', value: null,
            items: function () {
              return self.entityIds({ re: CHIP_POOL, shown: true }).filter(function (id) { return (b.chips_extra || []).indexOf(id) < 0; })
                .map(function (id) { return { value: id, label: self.name(id), sub: id }; });
            },
            onPick: function (id) { if (id) set(M.chipsAddOwn(b, id)); } }));
        }
      }));
      c.appendChild(K.group({ footer: h('span', {}, ['What each chip counts is the same on every screen: ',
        h('a', { href: '#/house/counts', text: 'What Counts' }), '. An accessory chip’s look is in its settings; a custom chip is written in ',
        h('a', { href: '#/chips', text: 'Custom Chips' }), '.']) }, []));
    }
    s_chip(c, x, b, kind) {
      var self = this, quiet = (b.chips_quiet || []).indexOf(kind) >= 0;
      c.appendChild(K.group({ footer: 'When Active: the chip appears only while something is on, open, running or wet — Doors & Windows only while one is open.' }, [
        K.seg({ label: 'Show', sk: 'b:chips_quiet:' + kind, value: quiet ? 'quiet' : 'always', stack: !this.hasAttribute('wide'),
                options: [['always', 'Always'], ['quiet', 'When Active']],
                onChange: function (v) { self.setB(x.path, M.chipQuiet(b, kind, v === 'quiet')); } })]));
      var src = M.CHIP_SOURCES[kind] || {}, rows = [];
      (src.kinds || []).forEach(function (k) {
        var ck = (self.data.counts || {})[k] || { found: [] };
        var lbl = M.COUNT_KINDS.filter(function (y) { return y[0] === k; })[0];
        rows.push(K.nav({ label: lbl ? lbl[1] : k, value: String(ck.found.length), href: '#/house/counts/' + k }));
      });
      if (src.setting) {
        var map = { 'Alarm Panel': 'security.alarm', 'Indoor Temperature': 'features.temperature', 'Power Use': 'features.power',
                    'Weather Alerts Sensor': 'weather.alerts' };
        var v = this.hs(map[src.setting[1]]);
        rows.push(K.nav({ label: src.setting[1], value: v ? this.name(v) : 'None', href: '#/' + src.setting[0] }));
      }
      c.appendChild(K.group({ header: 'What It Counts', footer: 'The same on every screen.' }, rows));
    }
    s_cameras(c, x, b) {
      var self = this, set = function (ch) { return self.setB(x.path, ch); }, ents = this._hass.entities || {};
      var NOT = { fully_kiosk: 1, hk_frontend: 1, hk_tv: 1 };
      var ok = this.entityIds({ domains: ['camera'], shown: true }).filter(function (id) { return !NOT[(ents[id] || {}).platform]; }).sort();
      var autoCams = M.autoCameras(ok, function (id) { return (ents[id] || {}).device_id; });
      var top = [];
      if (x.generated) top.push(K.toggle({ label: 'Show Camera Strip', sk: 'b:camera_strip', on: b.camera_strip,
                                           onChange: function (on) { set({ camera_strip: on }); } }));
      top.push(this.entityRow({ label: 'Live Camera Follows', sk: 'b:camera_live', value: b.camera_live || null, none: 'First Camera',
        filter: { domains: ['input_select', 'select'] }, onPick: function (v) { set({ camera_live: v || '' }); } }));
      top.push(K.nav({ label: 'Set Up Live Camera Follows', href: '#/screens/' + encodeURIComponent(x.path) + '/cameras/live',
                       icon: 'mdi:cctv', fk: 'cams:live' }));
      c.appendChild(K.group({ footer: 'The first tile plays live video; the others show snapshots. A dropdown helper can choose which camera is live — the one where someone was just seen, say.' }, top));
      if (x.generated && !b.camera_strip) return;
      var mdl = M.camerasModel(b, ok, autoCams);
      c.appendChild(K.listEditor({ fk: 'cams', auto: mdl.auto, minRows: 1, announce: this.announce.bind(this),
        autoFooter: 'Automatic shows one of every camera, its low-resolution channel. The Cameras page shows the same ones.',
        rows: mdl.rows.map(function (r) { return { value: r.value, label: self.name(r.value) }; }),
        more: mdl.more.map(function (r) { return { value: r.value, label: self.name(r.value) }; }),
        onAuto: function (on) {
          if (!on) { set({ cameras: mdl.rows.map(function (r) { return r.value; }) }); return; }
          K.confirm(self.shadowRoot, { title: 'Use Automatic Cameras?', message: 'This screen’s camera order and choices will be replaced.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) set({ cameras: [] }); });
        },
        onChange: function (v) { set({ cameras: v }); } }));
    }
    // LIVE CAMERA FOLLOWS, explained where it is set: what it does, the
    // dropdown's options for this screen's cameras (made for you, if you
    // like), and the automation that moves it, written for your cameras'
    // own person and motion sensors (M.livePlan, M.liveYaml).
    s_cameraLive(c, x, b) {
      var self = this, hs = this._hass, ents = hs.entities || {}, devs = hs.devices || {};
      var set = function (ch) { return self.setB(x.path, ch); };
      var NOT = { fully_kiosk: 1, hk_frontend: 1, hk_tv: 1 };
      var ok = this.entityIds({ domains: ['camera'], shown: true }).filter(function (id) { return !NOT[(ents[id] || {}).platform]; }).sort();
      var mdl = M.camerasModel(b, ok, M.autoCameras(ok, function (id) { return (ents[id] || {}).device_id; }));
      var cams = mdl.rows.map(function (r) {
        var dev = devs[(ents[r.value] || {}).device_id] || {};
        return { entity: r.value, name: self.name(r.value), device: (ents[r.value] || {}).device_id || null,
                 deviceName: dev.name_by_user || dev.name || null };
      });
      var onCam = {};
      cams.forEach(function (x2) { if (x2.device) onCam[x2.device] = true; });
      var sensors = Object.keys(ents).filter(function (id) {
        return id.indexOf('binary_sensor.') === 0 && onCam[ents[id].device_id];
      }).map(function (id) {
        var st = hs.states[id], dc = st && st.attributes.device_class;
        var kind = /person/.test(id) ? 'person' : (dc === 'motion' || dc === 'occupancy' || /motion/.test(id)) ? 'motion' : null;
        return { entity: id, device: ents[id].device_id, kind: kind };
      }).filter(function (s2) { return s2.kind; });
      var sel = b.camera_live || '';
      var selSt = sel && hs.states[sel];
      var have = selSt && Array.isArray(selSt.attributes.options) ? selSt.attributes.options.map(String) : null;
      var plan = M.livePlan(cams, sensors, have);

      c.appendChild(K.group({ header: 'How It Works', footer: 'The camera strip’s first tile plays live; the others are snapshots. ' +
          'Live Camera Follows is a dropdown helper (an input_select) whose options are your cameras’ names. Whichever option is ' +
          'chosen, that camera plays live. An automation that chooses the camera where a person or motion was just seen makes ' +
          'the strip follow what’s happening. Nothing chosen, or an option that names no camera: the first camera plays.' }, [
        this.entityRow({ label: 'Live Camera Follows', sk: 'b:camera_live', value: sel || null, none: 'First Camera',
          filter: { domains: ['input_select', 'select'] }, onPick: function (v) { set({ camera_live: v || '' }); } })]));

      if (!plan.length) {
        c.appendChild(K.group({ footer: 'This screen has no cameras in its strip yet. Add them on the Cameras page first.' }, []));
        return;
      }
      var opts = plan.map(function (p) { return p.option; });
      var rows = plan.map(function (p) {
        return K.info({ label: p.option, sub: p.name + ' · ' + (p.missing ? 'not in the dropdown yet — add this option'
          : p.sensor ? 'follows ' + self.name(p.sensor) : 'no motion sensor found'), valueCls: p.missing ? 'warn' : null,
          value: p.missing ? 'Missing' : undefined });
      });
      var missing = plan.filter(function (p) { return p.missing; }).length;
      if (!sel) {
        rows.push(K.button({ label: 'Create the Dropdown', fk: 'cams:live:create', onClick: function () {
          hs.callWS({ type: 'input_select/create', name: 'Live Camera', icon: 'mdi:cctv', options: opts }).then(function (item) {
            return set({ camera_live: 'input_select.' + item.id }).then(function () { self.announce('Live Camera made and chosen'); });
          }, function (e) { self.announce('Couldn’t make it: ' + ((e && e.message) || e)); });
        } }));
      }
      c.appendChild(K.group({ header: '1. The Dropdown’s Options', footer: sel
          ? (missing ? 'The dropdown has no option for ' + (missing === 1 ? 'one camera' : missing + ' cameras') + ' in this ' +
              'screen’s strip. Add ' + (missing === 1 ? 'it' : 'them') + ', spelled as shown, in Settings → Devices & Services → ' +
              'Helpers; until then the automation leaves ' + (missing === 1 ? 'it' : 'them') + ' out.'
            : 'The dropdown has an option for every camera in this screen’s strip.')
          : 'Create the Dropdown makes a dropdown helper called Live Camera with these options, and chooses it above. ' +
            'Or make your own in Settings → Devices & Services → Helpers → Create Helper → Dropdown.' }, rows));

      var yaml = M.liveYaml(plan, sel || 'input_select.live_camera');
      if (!yaml) {
        c.appendChild(K.group({ header: '2. The Automation', footer: 'None of these cameras has a person or motion sensor on its ' +
          'device, so there’s nothing to write for you. Make an automation that sets the dropdown to a camera’s option when ' +
          'something happens there.' }, []));
        return;
      }
      var pre = h('pre', { class: 'code', text: yaml, tabindex: '0', 'aria-label': 'The automation, in YAML' });
      c.appendChild(K.group({ header: '2. The Automation', footer: 'Copy it, then in Settings → Automations & Scenes choose ' +
          'Create Automation → Create New Automation → ⋮ → Edit in YAML, paste it over everything there, and save. It chooses the ' +
          'camera where a person (or motion) was just seen, and the first camera again after five quiet minutes. ' +
          (sel ? '' : 'It sets Live Camera; if you name your dropdown differently, change input_select.live_camera in it.') }, [
        K.button({ label: 'Copy Automation', fk: 'cams:live:copy', onClick: function () {
          var done = function () { self.announce('Copied'); };
          var fallback = function () {
            var r = document.createRange(); r.selectNodeContents(pre);
            var s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r);
            self.announce('Selected — copy it with your keyboard');
          };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(yaml).then(done, fallback);
          else fallback();
        } }),
        K.nav({ label: 'Open Automations', href: '/config/automation/dashboard', icon: 'mdi:open-in-new', fk: 'cams:live:auto' })]));
      c.appendChild(pre);
    }
    s_scenes(c, x, b) {
      var self = this, set = function (ch) { return self.setB(x.path, ch); }, ents = this._hass.entities || {};
      c.appendChild(K.group({}, [K.toggle({ label: 'Show Scenes Row', sk: 'b:scenes_row', on: b.scenes_row,
                                            onChange: function (on) { set({ scenes_row: on }); } })]));
      if (!b.scenes_row) return;
      var autoScenes = x.generated ? this.entityIds({ domains: ['scene'], shown: true })
        .sort(function (p, q) { return self.name(p).localeCompare(self.name(q)); }) : [];
      void ents;
      var mdl = M.scenesModel(b, autoScenes, this.data.scene_pages || []);
      var pills = this.hs('look.page_pills') || {};
      var lab = function (r) { return r.page ? (pills[r.page] || {}).name || M.PAGE_LABELS[r.page] || r.page : self.name(r.value); };
      c.appendChild(K.listEditor({ fk: 'scenes', auto: mdl.auto, minRows: 1, announce: this.announce.bind(this),
        autoFooter: x.generated ? 'Automatic shows every scene, A to Z, then any page pills.' :
          'Automatic shows the scenes this screen’s YAML lists, then any page pills. Choosing scenes here replaces the YAML’s list.',
        emptyText: x.generated ? 'No scenes' : 'The scenes in this screen’s YAML',
        rows: mdl.rows.map(function (r) {
          return { value: r.value, label: lab(r), sub: r.page ? 'Opens the page' : null, removable: !!r.page,
                   href: r.page ? '#/screens/' + encodeURIComponent(x.path) + '/scenes/pill/' + r.page
                                : '#/accessories/' + encodeURIComponent(r.value) };
        }),
        more: mdl.more.map(function (r) { return { value: r.value, label: lab(r), sub: 'A pill that opens the page' }; }),
        onAuto: function (on) {
          if (!on) { set(M.scenesSave(mdl.rows.map(function (r) { return r.value; }))); return; }
          K.confirm(self.shadowRoot, { title: 'Use Automatic Scenes?', message: 'This screen’s scene order and choices will be replaced.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) set({ scenes: [] }); });
        },
        onAdd: mdl.auto ? function (v) { set(M.scenesPagePill(b, v.slice(M.PAGE_TOKEN.length), true)); } : null,
        onRemove: function (v) { set(M.scenesPagePill(b, v.slice(M.PAGE_TOKEN.length), false)); },
        onChange: function (v) { set(M.scenesSave(v)); },
        addLabel: 'Add Scene or Shortcut…', onAddOther: function () {
          self.go(self.picker('scene-add', { title: 'Add Scene or Shortcut', value: null,
            items: function () {
              return self.entityIds({ re: SCENE_POOL, shown: true })
                .filter(function (id) { return mdl.rows.every(function (r) { return r.value !== id; }); })
                .map(function (id) { return { value: id, label: self.name(id), sub: id }; });
            },
            onPick: function (id) { if (id) set(M.scenesSave(mdl.rows.map(function (r) { return r.value; }).concat(id))); } }));
        } }));
      c.appendChild(K.group({ footer: 'A scene’s name, icon and color on the pill are in its settings. A page pill’s are its own: tap it.' }, []));
    }
    // A PAGE PILL'S LOOK: its name, icon and color, the same on
    // every screen (look.page_pills) -- "Play Music" can be "Apple Music"
    s_pill(c, x, b, kind) {
      var self = this, all = Object.assign({}, this.hs('look.page_pills') || {}), mine = Object.assign({}, all[kind] || {});
      var put = function (k, v) {
        var next = Object.assign({}, mine);
        if (v) next[k] = v; else delete next[k];
        var out = Object.assign({}, all);
        if (Object.keys(next).length) out[kind] = next; else delete out[kind];
        self.setH({ 'look.page_pills': out });
      };
      var def = M.PAGE_PILL_DEFAULTS[kind] || ['', '', 'white'];
      c.appendChild(K.group({ footer: 'The pill on every screen that shows it. Empty: its own ' + (def[0] ? '“' + def[0] + '”' : 'name') + '.' }, [
        K.text({ label: 'Name', sk: 'look.page_pills', value: mine.name || '', placeholder: def[0], maxlength: 40,
                 error: this.err('look.page_pills'), onCommit: function (v) { put('name', v.trim()); } }),
        K.text({ label: 'Icon', sk: 'look.page_pills.icon', value: mine.icon || '', placeholder: def[1], maxlength: 60,
                 onCommit: function (v) { put('icon', v.trim()); } }),
        K.select({ label: 'Color', sk: 'look.page_pills.color', value: mine.color || '', placeholder: 'Default',
                   options: [['', 'Default (' + M.colorLabel(def[2]) + ')']].concat(M.PILL_COLORS.map(function (k) { return [k, M.colorLabel(k)]; })),
                   onChange: function (v) { put('color', v); } })]));
      void x; void b;
    }
    s_favorites(c, x, b) {
      var self = this, set = function (ch) { return self.setB(x.path, ch); };
      c.appendChild(K.listEditor({ fk: 'favs', announce: this.announce.bind(this), emptyText: 'No Favorites section',
        shownHeader: 'Favorites',
        rows: b.favorites.map(function (id) { return { value: id, label: self.name(id), href: '#/accessories/' + encodeURIComponent(id) }; }),
        onChange: function (v) { set({ favorites: v }); },
        addLabel: 'Add Favorite…', onAddOther: function () {
          self.go(self.picker('fav-add', { title: 'Add Favorite', value: null,
            items: function () {
              return self.entityIds({ re: FAV_POOL, shown: true }).filter(function (id) { return b.favorites.indexOf(id) < 0; })
                .map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; });
            },
            onPick: function (id) { if (id) set({ favorites: b.favorites.concat(id) }); } }));
        } }));
      c.appendChild(K.group({ footer: 'A Favorites section above the rooms. A favorite’s own name and icon there are in its settings.' }, []));
    }
    s_rooms(c, x, b) {
      var self = this, set = function (ch) { return self.setB(x.path, ch); };
      var az = this.areasAZ(), areas = this._hass.areas || {};
      var mdl = M.roomsModel(b, az);
      c.appendChild(K.listEditor({ fk: 'rooms', auto: mdl.auto, minRows: 1, announce: this.announce.bind(this),
        autoFooter: 'Automatic: Home shows its rooms as the screen lists them' + (x.generated ? ' (floor by floor, then A to Z).' : '.'),
        shownHeader: 'On Home', moreHeader: 'Not on Home',
        moreFooter: 'A room that isn’t on Home keeps its page and its row in the menu.',
        rows: mdl.rows.map(function (r) { return { value: r.value, label: self.areaName(r.value), icon: (areas[r.value] || {}).icon || 'mdi:texture-box' }; }),
        more: mdl.more.map(function (r) { return { value: r.value, label: self.areaName(r.value), icon: (areas[r.value] || {}).icon || 'mdi:texture-box' }; }),
        onAuto: function (on) {
          if (!on) { set({ room_order: az.slice(), home_rooms: 'order' }); return; }
          K.confirm(self.shadowRoot, { title: 'Use Automatic Rooms?', message: 'This screen’s room order and choices will be replaced.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) set(M.roomsAuto()); });
        },
        onChange: function (v) { set(M.roomsSave(v, az)); } }));
      var foot = 'The room order is also the menu’s, when Rooms in Menu is Room Order.';
      if (x.generated) {
        c.appendChild(K.group({ header: 'Pages', footer: 'Rooms on Lights, Climate, Water and the other pages that group by room. ' + foot }, [
          K.seg({ label: 'Rooms on Pages', sk: 'b:page_rooms', value: b.page_rooms, stack: !this.hasAttribute('wide'),
                  options: [['floor', 'By Floor'], ['order', 'Room Order']],
                  onChange: function (v) { set({ page_rooms: v }); } })]));
      } else c.appendChild(K.group({ footer: foot }, []));
    }
    s_pages(c, x, b) {
      var self = this, set = function (ch) { return self.setB(x.path, ch); };
      var custom = {};
      (this.data.custom_pages || []).forEach(function (p) { custom[p.path] = p.title; });
      // HOME PAGE: off, the screen is only its custom pages
      var mineC = (b.custom_pages || []).filter(function (k) { return custom[k] !== undefined; });
      c.appendChild(K.group({ footer: b.home_page === false
          ? (mineC.length ? 'This screen is only its custom pages, and opens on ' + custom[mineC[0]] + '.'
                          : 'Add a custom page below: with none, the screen is a whole screen as usual.')
          : 'Off: the screen is only its custom pages, and opens on the first — an Energy panel.' }, [
        K.toggle({ label: 'Home Page', sk: 'b:home_page', on: b.home_page !== false,
                   onChange: function (on) { set({ home_page: on }); } })]));
      // WHICH HOME: the generated one, or one of the house's custom pages, with
      // the screen's other pages generated as usual (a car's own first page)
      if (b.home_page !== false && Object.keys(custom).length) {
        var hv = b.home_view && custom[b.home_view] !== undefined ? b.home_view : '';
        c.appendChild(K.group({ footer: hv
            ? 'The screen opens on ' + custom[hv] + '; its other pages are generated as usual.'
            : 'A custom page can be this screen’s Home, with its other pages generated as usual — a car’s own first page, say.' }, [
          K.select({ label: 'Home', sk: 'b:home_view', value: hv,
                     options: [['', 'Generated']].concat(Object.keys(custom).map(function (k) { return [k, custom[k]]; })),
                     onChange: function (v) { set({ home_view: v }); } })]));
      }
      if (b.home_page === false) {
        c.appendChild(K.listEditor({ fk: 'cpages', minRows: 0, announce: this.announce.bind(this), shownHeader: 'Custom Pages',
          emptyText: 'None yet',
          rows: mineC.map(function (k) { return { value: k, label: custom[k], href: '#/pages/' + encodeURIComponent(k), removable: true }; }),
          more: Object.keys(custom).filter(function (k) { return mineC.indexOf(k) < 0; }).map(function (k) { return { value: k, label: custom[k] }; }),
          onAdd: function (v) { set({ custom_pages: mineC.concat(v) }); },
          onRemove: function (v) { set({ custom_pages: mineC.filter(function (k) { return k !== v; }) }); },
          onChange: function (v) { set({ custom_pages: v }); } }));
        return;
      }
      var mdl = M.pagesModel(b, this.data.page_kinds, custom);
      var lab = function (k) { return custom[k] !== undefined ? custom[k] : (M.PAGE_LABELS[k] || k); };
      var keys = mdl.rows.map(function (r) { return r.value; });
      var menuOn = b.menu !== 'off';
      // WHERE EACH PAGE SITS IN THE MENU: top (right under
      // Home), Categories, or not in the menu -- its row's own pop-up menu
      var items = M.menuItems(keys, custom);
      var placeCtl = function (k) {
        var p = M.menuPathOf(k, custom);
        if (!p || !menuOn) return null;
        var it = items.filter(function (y) { return y.path === p; })[0];
        return K.popup({ label: lab(k) + ' in the menu', options: M.MENU_PLACES, value: M.placeOf(b, it, items),
                         fk: 'place:' + k, onChange: function (v) {
            var ch = M.placeSet(b, items, p, v);
            if (!ch) { self.announce('Categories keeps at least one page: move it to the top, or use the automatic menu.'); self.render(); return; }
            set(ch);
          } });
      };
      c.appendChild(K.listEditor({ fk: 'pages', auto: mdl.auto, minRows: 1, announce: this.announce.bind(this),
        autoFooter: 'Automatic: every page the house has something for, in the usual order.',
        shownFooter: menuOn ? 'Top of Menu: right under Home, above Categories. Not in Menu: still one tap away on its chip. ' +
          'The order here is the menu’s order.' : 'This screen has no menu (Menu is Off).',
        rows: mdl.rows.map(function (r) {
          return { value: r.value, label: lab(r.value), fixed: r.fixed, fixedText: 'Comes with Play Music',
                   sub: r.custom ? 'Custom page' : null, removable: r.custom,
                   href: r.custom ? '#/pages/' + encodeURIComponent(r.value) : null,
                   control: placeCtl(r.value), value2: menuOn && M.MENU_FIXED[r.value] && !r.fixed ? M.MENU_FIXED[r.value] : null };
        }),
        more: mdl.more.filter(function (r) { return !mdl.auto || r.custom; })
          .map(function (r) { return { value: r.value, label: lab(r.value), sub: r.custom ? 'Custom page' : null }; }),
        onAuto: function (on) {
          if (!on) { set(M.pagesSave(mdl.rows.map(function (r) { return r.value; }), custom)); return; }
          K.confirm(self.shadowRoot, { title: 'Use Automatic Pages?', message: 'This screen’s page order and choices will be replaced.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) set({ pages: [] }); });
        },
        onAdd: mdl.auto ? function (v) { set(M.pagesCustom(b, v, true)); } : null,
        onRemove: function (v) { set(M.pagesCustom(b, v, false)); },
        onChange: function (v) { set(M.pagesSave(v, custom)); } }));
      if (menuOn && ((b.menu_top || []).length || (b.categories || []).length)) {
        c.appendChild(K.group({ footer: 'Automatic: Weather, Cameras and Live TV at the top, every other page under Categories.' }, [
          K.button({ label: 'Use the Automatic Menu', fk: 'menu:auto', onClick: function () { set({ menu_top: [], categories: [] }); } })]));
      }
      c.appendChild(K.group({ footer: h('span', {}, ['Custom pages are written in ',
        h('a', { href: '#/pages', text: 'Custom Pages' }), '.']) }, []));
    }
    s_glass(c, x, b) {
      var self = this, look = this.data.settings.look;
      var pick = function (v) { self.setB(x.path, { glass: v }); self.back('#/screens/' + encodeURIComponent(x.path)); };
      c.appendChild(K.group({ footer: 'Same as All Screens follows Appearance, so this screen changes with the others.' }, [
        K.check({ label: 'Same as All Screens', sub: 'Now ' + M.glassLabel(look.glass), on: !b.glass || b.glass === 'house', fk: 'glass:house',
                  onClick: function () { pick('house'); } })]));
      c.appendChild(K.group({ header: 'Just This Screen' }, M.GLASS.map(function (g) {
        return K.check({ label: g[1], sub: g[2], on: b.glass === g[0], fk: 'glass:' + g[0], onClick: function () { pick(g[0]); } });
      })));
    }

    // AN OPTIONS PAGE: OPTION_PAGES' controls over the options mapping, then
    // the way to the rest of it in YAML
    optionsPage(c, spec, cur, save, yamlHref, tp) {
      var self = this;
      if (tp && tp.state && tp.state !== 'ready') c.appendChild(K.group({ footer: tp.note }, []));
      spec.groups.forEach(function (g, gi) {
        var rows = g.rows.map(function (r, ri) {
          var fk = 'opt:' + (r.key || r.fk || gi + '-' + ri), v = optGet(r, cur);
          var put = function (nv) { save(optSet(r, cur, nv)); };
          if (r.type === 'switch') return K.toggle({ label: r.label, sub: r.sub, on: !!v, sk: fk, onChange: put });
          if (r.type === 'seg') return K.seg({ label: r.label, sub: r.sub, value: v, options: r.options, sk: fk, onChange: put });
          var opts = r.options.map(function (op) { return [String(op[0]), op[1]]; });
          if (v !== '' && !opts.some(function (op) { return op[0] === String(v); })) opts.push([String(v), String(v)]);
          return K.select({ label: r.label, sub: r.sub, value: String(v), options: opts, sk: fk, onChange: put });
        });
        c.appendChild(K.group({ header: g.header, footer: gi === spec.groups.length - 1 ? spec.footer : null }, rows));
      });
      var n = Object.keys(cur || {}).length;
      c.appendChild(K.group({ header: 'More', footer: 'Any other option the card has, written in YAML.' }, [
        K.nav({ label: 'Options in YAML', value: n ? n + ' Set' : 'None', href: yamlHref, sk: 'opt:yaml' })]));
      if (n) {
        c.appendChild(K.group({}, [K.button({ label: 'Use the Tuned Setup…', destructive: true, fk: 'opt:reset', onClick: function () {
          K.confirm(self.shadowRoot, { title: 'Use the tuned setup?', message: 'Every option changed here and in YAML goes back.',
                                       ok: 'Use Tuned Setup', destructive: true }).then(function (yes) { if (yes) save({}); });
        } })]));
      }
    }
    // A YAML PAGE: the options as written, Save / Revert / Use Default
    yamlPage(c, o) {
      var self = this, cur = o.value || {}, valid = true;
      if (o.help) c.appendChild(h('p', { class: 'scope', text: o.help }));
      if (o.example) {
        var ex = K.group({ header: 'For Example', footer: o.docs ? h('span', {}, ['Every option: ',
          h('a', { href: o.docs, target: '_blank', rel: 'noopener', text: 'the card’s documentation' }), '.']) : null }, []);
        ex.querySelector('.cells').appendChild(h('pre', { class: 'ex', text: o.example }));
        c.appendChild(ex);
        var dl = ex.querySelector('.gf a'); if (dl) dl.setAttribute('href', o.docs);
      }
      var box = h('div', { class: 'yaml' });
      var grp = K.group({ footer: o.note || null }, []);
      grp.querySelector('.cells').replaceWith(box);
      c.appendChild(grp);
      var err = this.err(o.sk);
      if (err) c.appendChild(h('div', { class: 'errline', role: 'alert', text: err }));
      var saveBtn = K.button({ label: o.saveLabel || 'Save', fk: o.sk + ':save', onClick: function () {
        if (!valid) { self.announce('The YAML has a mistake.'); return; }
        o.onSave(cur && typeof cur === 'object' ? cur : {});
      } });
      var rows = [saveBtn];
      if (o.clear !== false && Object.keys(o.value || {}).length) {
        rows.push(K.button({ label: 'Use Default Options…', destructive: true, fk: o.sk + ':clear', onClick: function () {
          K.confirm(self.shadowRoot, { title: 'Use the default options?', message: 'What’s written here will be removed.',
                                       ok: 'Use Default', destructive: true }).then(function (yes) { if (yes) o.onSave({}); });
        } }));
      }
      c.appendChild(K.group({}, rows));
      loadYaml(this._hass).then(function (ok) {
        if (ok) {
          var ed = document.createElement('ha-yaml-editor');
          ed.hass = self._hass;
          ed.defaultValue = cur;
          ed.addEventListener('value-changed', function (e) {
            e.stopPropagation(); valid = e.detail.isValid !== false; cur = e.detail.value;
            if (valid && o.onDraft) o.onDraft(cur);
          });
          box.appendChild(ed);
        } else {
          var ta = h('textarea', { 'aria-label': 'Options as JSON', spellcheck: 'false' });
          ta.value = JSON.stringify(cur, null, 2);
          ta.addEventListener('input', function () {
            try { cur = ta.value.trim() ? JSON.parse(ta.value) : {}; valid = true; } catch (e) { valid = false; }
            if (valid && o.onDraft) o.onDraft(cur);
          });
          box.appendChild(ta);
        }
      });
    }

    // ---------------------------------------------------------- add a screen
    p_add(sub) {
      var self = this, d = this.data;
      var others = d.dashboards.filter(function (x) { return !x.item; });
      this._new = this._new || { name: '', kind: 'wall_tablet', admin: false };
      var nw = this._new;
      if (sub[0] === 'kind') {
        return { title: 'Shown On', back: ['Add Screen', '#/add-screen'], body: function (c) {
          c.appendChild(K.group({ footer: 'It starts with the settings that suit it. Everything can be changed afterwards.' },
            Object.keys(M.PRESETS).map(function (k) {
              return K.check({ label: M.PRESETS[k][0], sub: M.PRESETS[k][1], on: nw.kind === k, fk: 'kind:' + k,
                               onClick: function () { nw.kind = k; self.back('#/add-screen'); } });
            })));
        } };
      }
      if (sub[0] === 'use' && sub[1]) {
        var x = this.dash(sub[1]);
        this._use = this._use && this._use.path === sub[1] ? this._use : { path: sub[1], kind: 'custom' };
        var use = this._use;
        return { title: x ? 'Set Up ' + x.title : 'Set Up', back: ['Add Screen', '#/add-screen'],
          scope: 'What is it shown on? It starts with the settings that suit it; every one can be changed afterwards.', body: function (c) {
            c.appendChild(K.group({ header: 'Shown On' }, Object.keys(M.PRESETS).map(function (k) {
              return K.check({ label: M.PRESETS[k][0], sub: M.PRESETS[k][1], on: use.kind === k, fk: 'usekind:' + k,
                               onClick: function () { use.kind = k; self.render(); } });
            })));
            c.appendChild(K.group({}, [K.button({ label: 'Set Up Screen', center: true, fk: 'use:go', onClick: function () {
              self.status('saving');
              self.createItem(sub[1], use.kind).then(function () {
                self.status('saved');
                return self.reload();
              }).then(function () {
                // from the Setup Assistant's First Screen step: on to its last step
                if (self.from[hashOf(location.hash)] === '#/setup/' + SETUP_FIRST) { self._created = sub[1]; self.go('#/setup/' + (SETUP_FIRST + 1)); return; }
                self.go('#/screens/' + encodeURIComponent(sub[1]));
              }, function (e) {
                self.status('error'); self.announce('Couldn’t set it up: ' + (e && e.message || e));
              });
            } })]));
          } };
      }
      return { title: 'Add Screen', top: true, body: function (c) { self.addScreenBody(c, others); } };
    }
    addScreenBody(c, others, after) {
      var self = this, nw = this._new = this._new || { name: '', kind: 'wall_tablet', admin: false };
      var nameRow = K.text({ label: 'Name', value: nw.name, placeholder: 'Kitchen', sk: 'new:name', maxlength: 40,
                             onCommit: function (v) { nw.name = v; } });
      c.appendChild(K.group({ header: 'New Screen', footer: 'A new dashboard that builds itself from your rooms and devices.' }, [
        nameRow,
        K.nav({ label: 'Shown On', value: M.PRESETS[nw.kind][0], href: '#/add-screen/kind', sk: 'new:kind' }),
        K.toggle({ label: 'Only Admins Can Open It', on: nw.admin, sk: 'new:admin', onChange: function (on) { nw.admin = on; } })]));
      c.appendChild(K.group({}, [K.button({ label: 'Create Screen', center: true, fk: 'new:go', onClick: function () {
        var inp = self.shadowRoot.querySelector('[data-fk="new:name"]');
        var title = String((inp && inp.value) || nw.name || '').trim();
        if (!title) { self.errors['new:name'] = 'Give it a name.'; self.render(); return; }
        delete self.errors['new:name'];
        self.status('saving');
        self.createScreen(title, nw.kind, nw.admin).then(function (path) {
          self._new = null;
          self.status('saved');
          return self.reload().then(function () { if (after) after(path); else self.go('#/screens/' + encodeURIComponent(path)); });
        }, function (e) { self.status('error'); self.announce('Couldn’t create it: ' + (e && e.message || e)); });
      } })]));
      if (this.err('new:name')) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('new:name') }));
      if (others && others.length) {
        c.appendChild(K.group({ header: 'Existing Dashboards', footer: 'Give a dashboard you already have its own HK settings.' },
          others.map(function (x) {
            return K.nav({ label: x.title, sub: '/' + x.path, href: '#/add-screen/use/' + encodeURIComponent(x.path) });
          })));
      }
    }
    // a dashboard's item, through its own flow (what it is shown on, then
    // its menu as that starts it)
    async createItem(path, kind) {
      var hass = this._hass, base = 'config/config_entries/subentries/flow';
      var r = await hass.callApi('POST', base, { handler: [this.data.entry_id, 'dashboard'] });
      var fid = r.flow_id;
      try {
        r = await hass.callApi('POST', base + '/' + fid, { dashboard: path });
        if (r.step_id === 'kind') r = await hass.callApi('POST', base + '/' + fid, { kind: kind });
        if (r.step_id === 'settings') r = await hass.callApi('POST', base + '/' + fid, {});
      } catch (e) {
        hass.callApi('DELETE', base + '/' + fid).catch(function () {});
        throw e;
      }
      if (r.type !== 'create_entry') throw new Error(r.reason || 'not set up');
    }
    async createScreen(title, kind, admin) {
      var hass = this._hass;
      var slug = 'hk-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      var taken = this.data.dashboards.map(function (d) { return d.path; });
      var path = slug, n = 2;
      while (taken.indexOf(path) >= 0) path = slug + '-' + (n++);
      await hass.callWS({ type: 'lovelace/dashboards/create', url_path: path, title: title,
                          icon: 'mdi:home-heart', show_in_sidebar: true, require_admin: !!admin, mode: 'storage' });
      await hass.callWS({ type: 'lovelace/config/save', url_path: path, config: { strategy: { type: 'custom:hk-dashboard' } } });
      await this.createItem(path, kind);
      return path;
    }

    // ---------------------------------------------------------- custom chips
    // CUSTOM CHIPS (Library): the house's own status chips in YAML
    // (settings.py SUBENTRY_CHIP), shown by the screens that list them.
    p_chips(sub) {
      var self = this, lib = this.data.custom_chips || [], base = '#/chips';
      var mk = function (t, body) { return { title: t, back: ['Custom Chips', base], body: body }; };
      var where = function (after) {
        return after === 'start' ? 'At the start' : after === 'end' || !after ? 'At the end' : 'After ' + (M.CHIP_LABELS[after] || after);
      };
      var usedOn = function (key) {
        return self.data.dashboards.filter(function (d) { var bb = self.data.boards[d.path]; return bb && (bb.chips_custom || []).indexOf(key) >= 0; })
          .map(function (d) { return d.title; });
      };
      if (!sub[0]) {
        return { title: 'Custom Chips', top: true, scope: 'Status chips you write yourself, for any screen.', body: function (c) {
          c.appendChild(K.group({ footer: 'A chip in YAML — an hk-status-chip-card, or one inside a conditional that shows it only sometimes. A screen shows it once it’s added to that screen’s Status Chips.' },
            lib.map(function (x) {
              var on = usedOn(x.key);
              return K.nav({ label: x.name, sub: where(x.after) + ' · ' + (on.length ? on.join(', ') : 'On no screen yet'),
                             href: base + '/' + encodeURIComponent(x.key), fk: 'chips:' + x.key });
            }).concat([K.nav({ label: 'Add Custom Chip', href: base + '/new', icon: 'mdi:plus-circle-outline', fk: 'chips:new' })])));
        } };
      }
      var key = decodeURIComponent(sub[0]), chip = lib.filter(function (x) { return x.key === key; })[0];
      if (key !== 'new' && !chip) return mk('Custom Chip', function (c) { c.appendChild(K.group({ footer: 'That chip isn’t there any more.' }, [])); });
      var f = (this._chipForms = this._chipForms || {})[key] = this._chipForms[key] ||
        (chip ? { name: chip.name, after: chip.after } : { name: '', after: 'end' });
      var save = function (card) {
        return self.ws(Object.assign({ type: DOMAIN + '/chip/save', name: f.name, after: f.after, card: card },
                                     chip ? { key: chip.key } : {}), ['name', 'card', 'after']);
      };
      return mk(chip ? chip.name : 'Add Custom Chip', function (c) {
        c.appendChild(K.group({}, [
          K.text({ label: 'Name', sk: 'name', value: f.name, placeholder: 'House Battery', maxlength: 40, error: self.err('name'),
                   onCommit: function (v) { f.name = v.trim(); if (chip) save(chip.card); } }),
          K.select({ label: 'Sits', sk: 'after', value: f.after,
                     options: [['start', 'At the Start']].concat(self.data.chip_kinds.map(function (k) { return [k, 'After ' + (M.CHIP_LABELS[k] || k)]; }), [['end', 'At the End']]),
                     onChange: function (v) { f.after = v; if (chip) save(chip.card); else self.render(); } })]));
        // THE DRAFT IS THE PAGE'S (f.card): a redraw -- a name or place
        // committed, a save elsewhere -- rebuilt the editor from the stored
        // card and threw away what was being written.
        self.yamlPage(c, { value: f.card !== undefined ? f.card : (chip ? chip.card : {}), sk: 'card', clear: false,
          saveLabel: chip ? 'Save Chip' : 'Add Chip', onDraft: function (v) { f.card = v; },
          help: 'The chip, as a card. Where it sits applies unless a screen orders its chips itself.',
          example: 'type: custom:hk-status-chip-card\nentity: sensor.ecoflow_battery_level\nname: House Battery\nicon: hk:home-battery\nicon_color: green\ntap_action:\n  action: navigate\n  navigation_path: ./ecoflow',
          onSave: function (card) {
            if (!f.name) { self.errors.name = M.errorText('name_needed'); self.render(); return; }
            save(card).then(function (ok) {
              if (!ok) return;
              delete self._chipForms[key];
              self.reload().then(function () { self.back(base); });
            });
          } });
        if (chip) {
          var on = usedOn(chip.key);
          c.appendChild(K.group({ footer: on.length ? 'On ' + on.join(', ') + '.' : 'No screen shows it yet: add it on a screen’s Status Chips.' }, [
            K.button({ label: 'Delete Chip', destructive: true, fk: 'chips:delete', onClick: function () {
              K.confirm(self.shadowRoot, { title: 'Delete “' + chip.name + '”?', ok: 'Delete', destructive: true,
                message: on.length ? 'It goes from ' + on.join(', ') + ' too.' : 'No screen shows it.' })
                .then(function (yes) {
                  if (!yes) return;
                  self.ws({ type: DOMAIN + '/chip/remove', key: chip.key }, ['key'])
                    .then(function (ok) { if (ok) self.reload().then(function () { self.back(base); }); });
                });
            } })]));
        }
      });
    }
    // ---------------------------------------------------------- all screens
    p_music(sub) {
      var self = this, base = '#/features/music', title = 'Music';
      var mk = function (tt, body) { return { title: tt, back: [title, base], body: body }; };
      if (sub[0] === 'categories') return mk('Categories', function (c) { self.h_categories(c); });
      if (sub[0] === 'discover') return mk('Discover Rows', function (c) { self.h_discover(c); });
      // the Music feature's own pages (hk-settings-features.js)
      var fp = sub.length ? F.page(this, ['music'].concat(sub)) : null;
      if (fp) return fp;
      return { title: title, top: true, scope: 'Applies to every screen.', body: function (c) { self.h_music(c); } };
    }
    p_house(page, sub) {
      var self = this, t = HOUSE.filter(function (p) { return p[0] === page; })[0];
      if (!t) return this.p_overview();
      var base = '#/house/' + page, title = t[1];
      var scope = 'Applies to every screen.';
      var mk = function (tt, body, back) { return { title: tt, back: back || [title, base], body: body }; };
      if (page === 'general') {
        if (sub[0] === 'timers') return mk('House Timers', function (c) { self.h_timers(c); });
        return { title: title, top: true, scope: scope, body: function (c) { self.h_general(c); } };
      }
      if (page === 'counts') {
        if (sub[0] && sub[1] === 'all') return mk('Counted', function (c) { self.h_countAll(c, sub[0]); },
          [(M.COUNT_KINDS.filter(function (k) { return k[0] === sub[0]; })[0] || [0, sub[0]])[1], base + '/' + sub[0]]);
        if (sub[0]) return mk((M.COUNT_KINDS.filter(function (k) { return k[0] === sub[0]; })[0] || [0, sub[0]])[1],
                              function (c) { self.h_count(c, sub[0]); });
        return { title: title, top: true, scope: 'What the status chips, their pages and the header count — on every screen.',
                 body: function (c) { self.h_counts(c); } };
      }
      if (page === 'weather') {
        if (sub[0] === 'sensors') return mk('Sensors', function (c) { self.h_weatherSensors(c); });
        if (sub[0] === 'radar') {
          var spec = OPTION_PAGES.radar, tp = (self.data.thirdparty || {}).radar || {};
          var saveRadar = function (v) { return self.setH({ 'weather.radar': v }); };
          if (sub[1] === 'yaml') return mk('Options in YAML', function (c) {
            self.yamlPage(c, { value: self.hs('weather.radar') || {}, note: tp.note, sk: 'weather.radar',
                               help: spec.yamlHelp, example: spec.example, docs: spec.docs, onSave: saveRadar });
          }, [spec.title, base + '/radar']);
          return mk(spec.title, function (c) {
            self.optionsPage(c, spec, self.hs('weather.radar') || {}, saveRadar, base + '/radar/yaml', tp);
          });
        }
        return { title: title, top: true, scope: scope, body: function (c) { self.h_weather(c); } };
      }
      if (page === 'appearance') {
        if (sub[0] === 'glass') return mk('Glass Style', function (c) { self.h_glass(c); });
        return { title: title, top: true, scope: 'Applies to every screen that doesn’t choose its own.', body: function (c) { self.h_appearance(c); } };
      }
      if (page === 'sky') {
        if (sub[0] === 'advanced') return mk('Advanced', function (c) { self.h_skyAdvanced(c); });
        var th = M.SKY_THEMES.filter(function (x) { return x.id === sub[0]; })[0];
        if (th) return mk(th.label, function (c) { self.h_theme(c, th); });
        return { title: title, top: true, scope: scope, body: function (c) { self.h_sky(c); } };
      }
      if (page === 'menu') {
        if (sub[0] === 'status') return mk('Status Row', function (c) { self.h_status(c); });
        return { title: title, top: true, scope: scope, body: function (c) { self.h_menu(c); } };
      }
      if (page === 'tablets') return { title: title, top: true, scope: 'Applies to every wall tablet.', body: function (c) { self.h_tablets(c); } };
      return this.p_overview();
    }
    h_general(c) {
      var self = this, set = function (k) { return function (v) { var o = {}; o[k] = v; self.setH(o); }; };
      var sugg = !this.hs('security.alarm') && (this.data.suggest || {}).alarm;
      c.appendChild(K.group({ header: 'Security', footer: 'The header’s security line, the Security chip and page, and the alarm keypad.' }, [
        this.entityRow({ label: 'Alarm Panel', sk: 'security.alarm', value: this.hs('security.alarm'), none: 'No Alarm',
                         filter: { domains: ['alarm_control_panel'] }, onPick: set('security.alarm') }),
        sugg ? K.button({ label: 'Use ' + this.name(sugg), fk: 'alarm:suggest', onClick: function () { set('security.alarm')(sugg); } }) : null]));
      c.appendChild(K.group({ header: 'Readings', footer: 'Indoor temperature is on the Climate chip; power use on the Energy chip, which needs it.' }, [
        this.entityRow({ label: 'Indoor Temperature', sk: 'features.temperature', value: this.hs('features.temperature'),
                         none: 'First Thermostat’s', filter: { domains: ['sensor'], dc: 'temperature' }, onPick: set('features.temperature') }),
        this.entityRow({ label: 'Power Use', sk: 'features.power', value: this.hs('features.power'), none: 'None',
                         filter: { domains: ['sensor'], dc: 'power' }, onPick: set('features.power') })]));
      var ht = this.hs('features.house_timers') || [];
      c.appendChild(K.group({ header: 'Timers', footer: 'One-tap timers on the Timers page — a nap, bedtime. Their names and icons are Home Assistant’s.' }, [
        K.nav({ label: 'House Timers', value: ht.length ? String(ht.length) : 'None', href: '#/house/general/timers', sk: 'features.house_timers' })]));
    }
    h_timers(c) {
      var self = this, cur = this.hs('features.house_timers') || [];
      var set = function (v) { self.setH({ 'features.house_timers': v }); };
      c.appendChild(K.listEditor({ fk: 'timers', shownHeader: 'House Timers', emptyText: 'None', announce: this.announce.bind(this),
        rows: cur.map(function (id) { return { value: id, label: self.name(id) }; }),
        onChange: set, addLabel: 'Add Timer…', onAddOther: function () {
          self.go(self.picker('timer-add', { title: 'Add Timer', value: null,
            items: function () { return self.entityIds({ domains: ['timer'] }).filter(function (id) { return cur.indexOf(id) < 0; })
              .map(function (id) { return { value: id, label: self.name(id), sub: id }; }); },
            onPick: function (id) { if (id) set(cur.concat(id)); } }));
        } }));
    }
    h_counts(c) {
      var d = this.data;
      c.appendChild(K.group({ footer: h('span', {}, ['Each kind finds its own accessories. Accessories ',
          h('a', { href: '#/accessories/hidden', text: 'hidden from screens' }),
          ' are never counted, and an accessory’s Include in Status turns it off everywhere. Which chips a screen shows is set on the screen.']) },
        M.COUNT_KINDS.map(function (k) {
          var ck = (d.counts || {})[k[0]] || { found: [] };
          var adj = ck.saved && ((ck.exclude || []).length || (ck.include || []).length);
          return K.nav({ label: k[1], value: ck.found.length + (adj ? ' · Adjusted' : ''), href: '#/house/counts/' + k[0], sk: 'counts.' + k[0] });
        })));
    }
    h_count(c, kind) {
      var self = this, ck = (this.data.counts || {})[kind];
      if (!ck) return;
      var desc = (M.COUNT_KINDS.filter(function (k) { return k[0] === kind; })[0] || [])[2];
      var save = function (ex, inc) { self.setH((function () { var o = {}; o['counts.' + kind] = { exclude: ex, include: inc }; return o; })()); };
      c.appendChild(K.group({ footer: desc }, [
        K.info({ label: 'Found Automatically', value: String(ck.auto.length) }),
        K.nav({ label: 'Counted', value: String(ck.found.length), href: '#/house/counts/' + kind + '/all' })]));
      c.appendChild(K.listEditor({ fk: 'ex', reorder: false, shownHeader: 'Left Out', emptyText: 'Nothing left out',
        announce: this.announce.bind(this),
        rows: ck.exclude.map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; }),
        onChange: function (v) { save(v, ck.include); },
        addLabel: 'Leave Out…', onAddOther: function () {
          self.go(self.picker('ex-' + kind, { title: 'Leave Out', value: null,
            items: function () { return ck.auto.filter(function (id) { return ck.exclude.indexOf(id) < 0; })
              .map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; }); },
            onPick: function (id) { if (id) save(ck.exclude.concat(id), ck.include); } }));
        } }));
      c.appendChild(K.listEditor({ fk: 'inc', reorder: false, shownHeader: 'Also Counted', emptyText: 'Nothing added',
        announce: this.announce.bind(this),
        rows: ck.include.map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; }),
        onChange: function (v) { save(ck.exclude, v); },
        addLabel: 'Also Count…', onAddOther: function () {
          self.go(self.picker('inc-' + kind, { title: 'Also Count', value: null,
            items: function () { return self.entityIds({ domains: ck.also }).filter(function (id) {
              return ck.auto.indexOf(id) < 0 && ck.include.indexOf(id) < 0; })
              .map(function (id) { return { value: id, label: self.name(id), sub: id }; }); },
            onPick: function (id) { if (id) save(ck.exclude, ck.include.concat(id)); } }));
        } }));
      if (ck.saved) {
        c.appendChild(K.group({ footer: 'Automatic counts everything the kind finds, and follows new accessories as they’re added.' }, [
          K.button({ label: 'Reset to Automatic…', destructive: true, fk: 'count:reset', onClick: function () {
            K.confirm(self.shadowRoot, { title: 'Count every ' + kind + ' automatically?', message: 'What’s left out and added here will be cleared.',
                                         ok: 'Reset', destructive: true }).then(function (yes) {
              if (yes) self.setH((function () { var o = {}; o['counts.' + kind] = null; return o; })());
            });
          } })]));
      }
    }
    h_countAll(c, kind) {
      var self = this, ck = (this.data.counts || {})[kind] || { found: [] };
      var rows = ck.found.slice().sort(function (a, b) { return self.name(a).localeCompare(self.name(b)); })
        .map(function (id) { return K.info({ label: self.name(id), sub: (self.areaName(self.areaOf(id)) || 'No room') + ' · ' + id }); });
      c.appendChild(K.group({ footer: rows.length ? null : 'Nothing is counted.' }, rows));
    }
    h_weather(c) {
      var self = this, set = function (k) { return function (v) { var o = {}; o[k] = v; self.setH(o); }; };
      var place = (this._hass.config && this._hass.config.location_name) || 'Home';
      c.appendChild(K.group({ footer: 'The name shown above the temperature. Empty: this home’s name, ' + String(place).toUpperCase() + '.' }, [
        this.entityRow({ label: 'Weather Service', sk: 'weather.entity', value: this.hs('weather.entity'), none: 'First Weather Entity',
                         filter: { domains: ['weather'] }, onPick: set('weather.entity') }),
        K.text({ label: 'Place', sk: 'weather.place', value: this.hs('weather.place'), placeholder: place, maxlength: 60,
                 error: this.err('weather.place'), onCommit: function (v) { self.setH({ 'weather.place': v }); } })]));
      var keys = ['feels_like', 'humidity', 'wind', 'gust', 'uv', 'outside', 'forecast_daily', 'forecast_hourly', 'alerts'];
      var n = keys.filter(function (k) { return self.hs('weather.' + k); }).length;
      c.appendChild(K.group({ header: 'Sensors', footer: 'Optional. The weather service gives these when none is chosen.' }, [
        K.nav({ label: 'Sensors', value: n ? n + ' Chosen' : 'None', href: '#/house/weather/sensors', sk: 'weather.sensors' })]));
      var radar = this.hs('weather.radar') || {};
      c.appendChild(K.group({ header: 'Radar Map', footer: ((this.data.thirdparty || {}).radar || {}).note || null }, [
        K.nav({ label: 'Radar Map', value: Object.keys(radar).length ? 'Custom' : 'Default', href: '#/house/weather/radar', sk: 'weather.radar' })]));
    }
    h_weatherSensors(c) {
      var self = this, set = function (k) { return function (v) { var o = {}; o[k] = v; self.setH(o); }; };
      var row = function (key, label, none, dc, sub) {
        return self.entityRow({ label: label, sub: sub, sk: 'weather.' + key, value: self.hs('weather.' + key), none: none,
                                filter: { domains: ['sensor'], dc: dc }, onPick: set('weather.' + key) });
      };
      c.appendChild(K.group({ header: 'Now', footer: 'Empty: the weather service’s own reading.' }, [
        row('feels_like', 'Feels Like', 'From Weather Service'), row('humidity', 'Humidity', 'From Weather Service'),
        row('wind', 'Wind Speed', 'From Weather Service'), row('gust', 'Wind Gust', 'Not Shown'),
        row('uv', 'UV Index', 'Not Shown'),
        row('outside', 'Outside Temperature', 'Not Shown', 'temperature', 'The Weather page’s daily averages')]));
      c.appendChild(K.group({ header: 'Forecast', footer: 'A sensor with a forecast attribute. Empty: the forecast is read from the weather service.' }, [
        row('forecast_daily', 'Daily Forecast', 'From Weather Service'), row('forecast_hourly', 'Hourly Forecast', 'From Weather Service')]));
      c.appendChild(K.group({ header: 'Alerts', footer: 'The NWS Alerts sensor. Its alert chip and card show only while an alert is active.' }, [
        row('alerts', 'Weather Alerts', 'None')]));
    }
    h_appearance(c) {
      var self = this, look = this.data.settings.look, boards = this.data.boards;
      var own = Object.keys(boards).filter(function (p) { return boards[p].glass && boards[p].glass !== 'house'; });
      var effs = [look.glass].concat(own.map(function (p) { return boards[p].glass; }));
      var rows = [K.nav({ label: 'Glass Style', value: M.glassLabel(look.glass), href: '#/house/appearance/glass', sk: 'look.glass' })];
      if (effs.indexOf('frosted') >= 0) rows.push(K.slider({ label: 'Frost', sk: 'look.frost', value: look.frost, unit: ' %', step: 5,
        onChange: function (v) { self.setH({ 'look.frost': v }); } }));
      if (effs.indexOf('blur') >= 0 || effs.indexOf('blur_each') >= 0) rows.push(K.slider({ label: 'Blur', sk: 'look.blur', value: look.blur,
        unit: ' %', step: 5, onChange: function (v) { self.setH({ 'look.blur': v }); } }));
      var names = own.map(function (p) { var x = self.dash(p); return x ? x.title : p; });
      c.appendChild(K.group({ header: 'Glass', footer: 'How the pills, tiles and chips look. 50 % is the middle; Blur at 50 % is 20 px.' +
        (names.length ? ' ' + names.join(', ') + (names.length > 1 ? ' choose their own.' : ' chooses its own.') : '') }, rows));
      c.appendChild(K.group({ header: 'Accessories', footer: 'Tapping an accessory opens an HK detail sheet. Off: Home Assistant’s own dialog. Either way, locks, the alarm, garage doors and thermostats never change from one tap.' }, [
        K.toggle({ label: 'HK Detail Sheets', sk: 'look.details', on: look.details !== false,
                   onChange: function (on) { self.setH({ 'look.details': on }); } })]));
    }
    h_glass(c) {
      var self = this, look = this.data.settings.look;
      c.appendChild(K.group({ footer: 'Each screen can choose its own under its Appearance.' }, M.GLASS.map(function (g) {
        return K.check({ label: g[1], sub: g[2], on: look.glass === g[0], fk: 'hglass:' + g[0], onClick: function () {
          self.setH({ 'look.glass': g[0] }); self.back('#/house/appearance');
        } });
      })));
    }
    h_sky(c) {
      var self = this, sky = this.data.settings.sky, look = this.data.settings.look;
      c.appendChild(K.group({ header: 'Live Sky', footer: 'While this helper is off, no generated screen shows the live sky. A screen written in YAML names its own. Each screen can also turn its sky off.' }, [
        this.entityRow({ label: 'Sky Switch', sk: 'look.sky_switch', value: look.sky_switch, none: 'None (Always On)',
                         filter: { domains: ['input_boolean', 'switch'] }, onPick: function (v) { self.setH({ 'look.sky_switch': v }); } })]));
      var rows = [K.toggle({ label: 'Seasonal Decorations', sk: 'sky.decorations', on: sky.decorations !== false,
                             onChange: function (on) { self.setH({ 'sky.decorations': on }); } })];
      if (sky.decorations !== false) {
        M.SKY_THEMES.forEach(function (t) {
          var on = (sky.themes || []).indexOf(t.id) >= 0;
          rows.push(K.nav({ label: t.label, value: on ? 'On' : 'Off', href: '#/house/sky/' + t.id, sk: 'sky:' + t.id }));
        });
      }
      var gate = sky.seasonal ? ' They also need ' + this.name(sky.seasonal) + ' to be on (Advanced).' : '';
      c.appendChild(K.group({ header: 'Seasonal Decorations', footer: 'What the live sky dresses up for. This is the same switch as Seasonal Decorations on the HK Frontend device.' + gate }, rows));
      c.appendChild(K.group({}, [K.nav({ label: 'Advanced', value: sky.hemisphere === 'south' ? 'Southern' : 'Northern', href: '#/house/sky/advanced' })]));
    }
    h_theme(c, t) {
      var self = this, sky = this.data.settings.sky, themes = sky.themes || [], on = themes.indexOf(t.id) >= 0;
      var built = (this.data.choices || {}).sky_built_in || {};
      c.appendChild(K.group({ footer: t.desc }, [K.toggle({ label: 'Show ' + t.label, sk: 'sky.themes:' + t.id, on: on,
        onChange: function (v) {
          var all = (self.data.choices || {}).themes || [];
          self.setH({ 'sky.themes': all.filter(function (x) { return x === t.id ? v : themes.indexOf(x) >= 0; }) });
        } })]));
      if (t.id === 'birthday') { this.h_birthdays(c); return; }
      if (t.dates) {
        var from = M.skyDate(sky, built, t.dates, 'from'), to = M.skyDate(sky, built, t.dates, 'to');
        var rows = [this.dateRow('Starts', t.dates + '_from', from, false), this.dateRow('Ends', t.dates + '_to', to, t.dates === 'thanksgiving')];
        if (from.own || to.own) rows.push(K.button({ label: 'Use Default Dates', fk: 'sky:dates:reset', onClick: function () {
          var o = {}; o['sky.' + t.dates + '_from'] = null; o['sky.' + t.dates + '_to'] = null; self.setH(o);
        } }));
        c.appendChild(K.group({ header: 'Dates', footer: 'Default: ' + M.dateLabel(from.builtIn) + ' to ' + M.dateLabel(to.builtIn) +
          (t.id === 'spring-garden' || t.id === 'winter-wonderland' ? ', for your hemisphere.' : '.') }, rows.map(function (r, i) {
          return i < 2 ? self.withError(r, 'sky.' + t.dates + (i ? '_to' : '_from')) : r;
        })));
      }
      if (t.often) {
        var labels = M.OFTEN_LABELS[t.often] || {};
        var often = [K.select({ label: 'How Often', sk: 'sky.' + t.often, value: sky[t.often] || M.OFTEN_DEFAULT[t.often] || 'sometimes',
          options: Object.keys(labels).map(function (k) { return [k, labels[k]]; }),
          onChange: function (v) { var o = {}; o['sky.' + t.often] = v; self.setH(o); } })];
        if (t.extra) {
          var l2 = M.OFTEN_LABELS[t.extra];
          often.push(K.select({ label: 'Spooky Nights', sub: 'A big moon, fog, bats and a witch', sk: 'sky.' + t.extra,
            value: sky[t.extra] || 'sometimes', options: Object.keys(l2).map(function (k) { return [k, l2[k]]; }),
            onChange: function (v) { var o = {}; o['sky.' + t.extra] = v; self.setH(o); } }));
        }
        var ofoot = /_per_month$/.test(t.often) ? 'On its own fixed days each month, never the same day as the other.' :
          /^spring/.test(t.often) ? 'Sometimes is about one day in seven.' :
          /^winter/.test(t.often) ? 'Sometimes is about one day in eight.' :
          'Sometimes: some days, more often as the last day nears, and always the final days.';
        c.appendChild(K.group({ footer: ofoot }, often));
      }
    }
    dateRow(label, key, d, allowThanksgiving) {
      var self = this, cur = d.value, md = M.mmdd(cur);
      var monthSel = h('select', { 'aria-label': label + ' month', 'data-fk': 'date:' + key + ':m' });
      var opts = (allowThanksgiving ? [['thanksgiving', 'Thanksgiving Day']] : []).concat(M.MONTHS.map(function (m, i) {
        return [String(i + 1), m]; }));
      var curM = cur === 'thanksgiving' ? 'thanksgiving' : md ? String(md.month) : '';
      opts.forEach(function (o) { var e = h('option', { value: o[0], text: o[1] }); if (o[0] === curM) e.selected = true; monthSel.appendChild(e); });
      var daySel = h('select', { 'aria-label': label + ' day', 'data-fk': 'date:' + key + ':d' });
      for (var i = 1; i <= 31; i++) { var e = h('option', { value: String(i), text: String(i) }); if (md && md.day === i) e.selected = true; daySel.appendChild(e); }
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var commit = function () {
        var o = {};
        o['sky.' + key] = monthSel.value === 'thanksgiving' ? 'Thanksgiving Day' : pad(Number(monthSel.value)) + '-' + pad(Number(daySel.value));
        self.setH(o);
      };
      monthSel.addEventListener('change', commit);
      daySel.addEventListener('change', commit);
      var pop = function (sel, text) {
        return h('span', { class: 'pop' }, [h('span', { class: 'pv', text: text }), sel]);
      };
      var box = h('span', { class: 'dated' }, [pop(monthSel, curM === 'thanksgiving' ? 'Thanksgiving Day' : md ? M.MONTHS[md.month - 1].slice(0, 3) : '—')]);
      if (curM !== 'thanksgiving') box.appendChild(pop(daySel, md ? String(md.day) : '—'));
      return h('div', { class: 'cell', 'data-sk': 'sky.' + key }, [K.label(label, d.own ? null : 'Default'), box]);
    }
    h_birthdays(c) {
      var self = this, list = (this.data.settings.sky.birthdays || []).slice();
      var save = function (v) { self.setH({ 'sky.birthdays': v }); };
      var rows = list.map(function (b, i) {
        var rm = h('button', { class: 'lx rm', type: 'button', 'aria-label': 'Remove ' + b.name, 'data-fk': 'bd:rm:' + i });
        rm.appendChild(K.svg('<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--hk-red)"/><path d="M6.5 11h9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'));
        rm.addEventListener('click', function () { save(list.filter(function (x, j) { return j !== i; })); });
        return h('div', { class: 'cell li' }, [rm, K.label(b.name), h('span', { class: 'val', text: M.MONTHS[b.month - 1] + ' ' + b.day })]);
      });
      if (!rows.length) rows.push(K.info({ label: 'No birthdays yet' }));
      c.appendChild(K.group({ header: 'Birthdays' }, rows));
      var nb = this._nb = this._nb || { name: '', month: '1', day: '1' };
      var nm = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name', maxlength: 40, 'data-fk': 'bd:name' });
      nm.value = nb.name;
      nm.addEventListener('input', function () { nb.name = nm.value; });
      var ms = h('select', { 'aria-label': 'Month', 'data-fk': 'bd:m' });
      M.MONTHS.forEach(function (m, i) { var o = h('option', { value: String(i + 1), text: m }); if (String(i + 1) === nb.month) o.selected = true; ms.appendChild(o); });
      ms.addEventListener('change', function () { nb.month = ms.value; });
      var ds = h('select', { 'aria-label': 'Day', 'data-fk': 'bd:d' });
      for (var i = 1; i <= 31; i++) { var o = h('option', { value: String(i), text: String(i) }); if (String(i) === nb.day) o.selected = true; ds.appendChild(o); }
      ds.addEventListener('change', function () { nb.day = ds.value; });
      var add = h('button', { class: 'pbtn', type: 'button', text: 'Add', 'data-fk': 'bd:add' });
      add.addEventListener('click', function () {
        if (!nb.name.trim()) { nm.focus(); self.announce('Enter a name.'); return; }
        save(list.concat({ name: nb.name.trim(), month: Number(nb.month), day: Number(nb.day) }));
        self._nb = null;
      });
      var box = h('div', { class: 'inl' }, [nm, ms, ds, add]);
      var g = K.group({ header: 'Add a Birthday', footer: 'Balloons and confetti on the day.' }, []);
      g.querySelector('.cells').appendChild(box);
      c.appendChild(g);
      if (this.err('sky.birthdays')) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('sky.birthdays') }));
    }
    h_skyAdvanced(c) {
      var self = this, sky = this.data.settings.sky, set = function (k) { return function (v) { var o = {}; o[k] = v; self.setH(o); }; };
      c.appendChild(K.group({ footer: 'Southern moves the default spring and winter dates by six months.' }, [
        K.seg({ label: 'Hemisphere', sk: 'sky.hemisphere', value: sky.hemisphere === 'south' ? 'south' : 'north',
                options: [['north', 'Northern'], ['south', 'Southern']], onChange: set('sky.hemisphere') })]));
      c.appendChild(K.group({ header: 'Sources', footer: 'Optional. A holiday sensor’s state is Halloween, Thanksgiving or Christmas; the dates then only limit when the sky decorates. A moon sensor gives the phase from 0 to 1.' }, [
        this.entityRow({ label: 'Holiday Season', sk: 'sky.holidays', value: sky.holidays, none: 'From the Dates',
                         filter: { domains: ['sensor'] }, onPick: set('sky.holidays') }),
        this.entityRow({ label: 'Moon Phase', sk: 'sky.moon', value: sky.moon, none: 'Computed',
                         filter: { domains: ['sensor'] }, onPick: set('sky.moon') })]));
      c.appendChild(K.group({ header: 'Decorations Also Need', footer: 'Another on/off that must also be on for the decorations to show.' }, [
        this.entityRow({ label: 'Also Needs', sk: 'sky.seasonal', value: sky.seasonal, none: 'Nothing Else',
                         filter: { domains: ['input_boolean', 'switch'] }, onPick: set('sky.seasonal') })]));
    }
    h_menu(c) {
      var self = this, menu = this.data.settings.menu, rooms = this.data.settings.rooms;
      c.appendChild(K.group({ header: 'Menu', footer: 'Whether a screen has a menu, and its style, is set on each screen.' }, [
        K.seg({ label: 'Button Icon', sk: 'menu.glyph', value: menu.glyph, stack: !this.hasAttribute('wide'),
                options: [['sidebar', 'Sidebar'], ['lines', 'Three Lines']],
                onChange: function (v) { self.setH({ 'menu.glyph': v }); } }),
        K.toggle({ label: 'Tap Clock to Open Menu', sub: 'The weather beside it still opens Weather.', sk: 'menu.clock', on: menu.clock !== false,
                   onChange: function (on) { self.setH({ 'menu.clock': on }); } })]));
      var st = rooms.status || [];
      c.appendChild(K.group({ header: 'Room Pages', footer: 'A room page shows its readings and what’s open or on at the top. Temperature and humidity are the area’s own sensors (Settings → Areas).' }, [
        K.toggle({ label: 'Room Headings Open Room Pages', sk: 'rooms.headings', on: rooms.headings !== false,
                   onChange: function (on) { self.setH({ 'rooms.headings': on }); } }),
        K.nav({ label: 'Status Row', value: st.length + ' of ' + ((this.data.choices || {}).status_kinds || []).length,
                href: '#/house/menu/status', sk: 'rooms.status' })]));
    }
    h_status(c) {
      var self = this, all = (this.data.choices || {}).status_kinds || [], st = this.data.settings.rooms.status || [];
      c.appendChild(K.group({ footer: 'Shown in this order when there’s something to say.' }, all.map(function (k) {
        var on = st.indexOf(k) >= 0;
        return K.check({ label: M.STATUS_LABELS[k] || k, multi: true, on: on, fk: 'st:' + k, onClick: function () {
          self.setH({ 'rooms.status': all.filter(function (y) { return y === k ? !on : st.indexOf(y) >= 0; }) });
        } });
      })));
    }
    h_music(c) {
      var self = this, browse = this.data.settings.browse, look = this.data.settings.look;
      // THE MUSIC FEATURE'S OWN SETTINGS first (hk-settings-features.js)
      F.musicTop(this, c);
      var cats = (this.data.choices || {}).browse_categories || [];
      c.appendChild(K.group({ header: 'Browse Music', footer: 'On every screen’s Browse Music page. A page whose YAML lists its own keeps them.' }, [
        K.nav({ label: 'Categories', value: (cats.length - (browse.hide || []).length) + ' of ' + cats.length + ' Shown', href: '#/features/music/categories', sk: 'browse.hide' }),
        K.nav({ label: 'Discover Rows', value: (browse.discover || []).length ? String(browse.discover.length) : 'None', href: '#/features/music/discover', sk: 'browse.discover' })]));
      c.appendChild(K.group({ header: 'Advanced', footer: 'The page a speaker’s sheet opens with Browse Music, on screens written in YAML (generated screens always use their own). Empty: no Browse button.' }, [
        K.text({ label: 'Browse Page', sk: 'look.browse_view', value: look.browse_view, placeholder: 'None', error: this.err('look.browse_view'),
                 onCommit: function (v) { self.setH({ 'look.browse_view': v }); } })]));
      if (F.stateOf(this.data.features, 'hk_music') === 'added') {
        c.appendChild(K.group({}, [K.nav({ label: 'Music', sub: 'In Devices & Services', href: F.integrationHref('hk_music'),
                                           icon: 'mdi:open-in-new', fk: 'feat:open:hk_music' })]));
      }
    }
    h_categories(c) {
      var self = this, cats = (this.data.choices || {}).browse_categories || [], hide = this.data.settings.browse.hide || [];
      c.appendChild(K.group({ header: 'Shown', footer: 'The categories at the top of Browse Music.' }, cats.map(function (k) {
        var on = hide.indexOf(k) < 0;
        return K.check({ label: M.BROWSE_LABELS[k] || k, multi: true, on: on, fk: 'cat:' + k, onClick: function () {
          self.setH({ 'browse.hide': cats.filter(function (y) { return y === k ? on : hide.indexOf(y) >= 0; }) });
        } });
      })));
    }
    h_discover(c) {
      var self = this, rows = this.data.settings.browse.discover || [], shelves = this.data.shelves || {};
      c.appendChild(K.listEditor({ fk: 'disc', shownHeader: 'Shown', emptyText: 'No Discover section', announce: this.announce.bind(this),
        rows: rows.map(function (k) { return { value: k, label: shelves[k] || k }; }),
        more: Object.keys(shelves).filter(function (k) { return rows.indexOf(k) < 0; }).map(function (k) { return { value: k, label: shelves[k] }; }),
        shownFooter: 'A row with nothing in it yet (no favorite albums) isn’t shown.',
        onChange: function (v) { self.setH({ 'browse.discover': v }); } }));
    }
    h_tablets(c) {
      var self = this, boards = this.data.boards;
      c.appendChild(K.group({ header: 'Idle', footer: 'For a tablet whose optional idle helpers say Auto: how long a page stays before going back to Home when its room has no idle time of its own. Without those helpers a page goes back after 50 seconds.' }, [
        this.entityRow({ label: 'Default Idle Time', sk: 'idle.default', value: this.hs('idle.default'), none: '60 Seconds',
                         filter: { domains: ['input_number', 'number'] }, onPick: function (v) { self.setH({ 'idle.default': v }); } })]));
      c.appendChild(K.group({ header: 'Screensaver', footer: 'A media folder (media-source://…) for generated wall tablets with Photo Screensaver on.' }, [
        K.text({ label: 'Photos', sk: 'look.photos', value: this.hs('look.photos'), placeholder: 'media-source://…', error: this.err('look.photos'),
                 onCommit: function (v) { self.setH({ 'look.photos': v }); } })]));
      var tabs = Object.keys(boards).filter(function (p) { return boards[p].idle_return || boards[p].screensaver; });
      c.appendChild(K.group({ header: 'Wall Tablets', footer: 'Each screen’s Return to Home, room and screensaver are set on the screen.' },
        tabs.length ? tabs.map(function (p) {
          var x = self.dash(p) || { title: p }, bb = boards[p];
          return K.nav({ label: x.title, value: [bb.idle_room, bb.screensaver ? 'Screensaver' : ''].filter(Boolean).join(' · '),
                         href: '#/screens/' + encodeURIComponent(p) });
        }) : [K.info({ label: 'No screen returns to Home when idle yet' })]));
    }

    // ---------------------------------------------------------- accessories
    accIds() {
      var self = this, hass = this._hass, ents = hass.entities || {}, acc = (this.data.accessories || {}).entities || {};
      var chipIds = {};
      Object.keys(this.data.boards || {}).forEach(function (p) {
        ((self.data.boards[p] || {}).chips_extra || []).forEach(function (id) { chipIds[id] = true; });
      });
      return Object.keys(hass.states).filter(function (id) {
        var e = ents[id] || {};
        if (acc[id] || chipIds[id]) return true;
        if (!TILE_DOMAINS.test(id) || e.hidden || e.entity_category) return false;
        return !!self.areaOf(id) || id.indexOf('timer.') === 0;
      });
    }
    p_accessories(sub) {
      var self = this, back = ['Accessories', '#/accessories'];
      if (sub[0] === 'hidden') return { title: 'Hidden from Screens', back: back, body: function (c) { self.a_hidden(c); } };
      if (sub[0] === 'also') return { title: 'Also Shown', back: back, body: function (c) { self.a_also(c); } };
      if (sub[0] === 'page' && PAGE_ORDERS[sub[1]]) return { title: PAGE_ORDERS[sub[1]][0] + ' Page', back: back, body: function (c) { self.a_pageOrder(c, sub[1]); } };
      if (sub[0] === 'room' && sub[1]) {
        var nm = sub[1] === '-' ? 'No Room' : sub[1] === '~timers' ? 'Timers' : this.areaName(sub[1]);
        if (sub[2] === 'order') return { title: 'Tile Order', back: [nm, '#/accessories/room/' + encodeURIComponent(sub[1])], body: function (c) { self.a_roomOrder(c, sub[1]); } };
        return { title: nm, back: back, body: function (c) { self.a_room(c, sub[1]); } };
      }
      if (sub[0]) {
        var id = sub[0], a = this.areaOf(id);
        return { title: this.name(id), back: a ? [this.areaName(a), '#/accessories/room/' + encodeURIComponent(a)] : back,
          scope: K.esc((a ? this.areaName(a) + ' · ' : '') + id) + ' · the same on every screen',
          body: function (c) { self.a_one(c, id); } };
      }
      return { title: 'Accessories', top: true, scope: 'How each accessory shows on every screen: its name, room, icon and where it appears. Home Assistant’s own names are untouched.',
               body: function (c) { self.a_root(c); } };
    }
    a_root(c) {
      var self = this, hass = this._hass, areas = hass.areas || {}, g = this.data.settings.generated;
      var acc = (this.data.accessories || {}).entities || {};
      var ids = this.accIds();
      var sb = h('div', { class: 'search', style: 'margin:0 0 22px' });
      sb.appendChild(K.icon('mdi:magnify', 'mag'));
      var inp = h('input', { type: 'search', placeholder: 'Search Accessories', 'aria-label': 'Search accessories', 'data-fk': 'acc:search' });
      inp.value = this._aq || '';
      sb.appendChild(inp);
      c.appendChild(sb);
      var box = h('div');
      c.appendChild(box);
      var paint = function () {
        box.innerHTML = '';
        var q = inp.value.trim().toLowerCase();
        if (q) {
          var got = ids.filter(function (id) {
            return (self.name(id) + ' ' + id + ' ' + self.areaName(self.areaOf(id))).toLowerCase().indexOf(q) >= 0;
          }).sort(function (a, b) { return self.name(a).localeCompare(self.name(b)); }).slice(0, 200);
          box.appendChild(K.group({ header: 'Accessories', footer: got.length ? null : 'No accessories match.' }, got.map(function (id) {
            return K.nav({ label: self.name(id), sub: self.areaName(self.areaOf(id)) || 'No room', href: '#/accessories/' + encodeURIComponent(id),
                           value: acc[id] ? 'Customized' : '' });
          })));
          return;
        }
        var hidden = (g.exclude_areas || []).length + (g.exclude_devices || []).length + (g.exclude_entities || []).length;
        box.appendChild(K.group({ header: 'Generated Screens', footer: 'Hidden rooms, devices and accessories are left off every generated screen and never counted by What Counts, on any screen.' }, [
          K.nav({ label: 'Hidden from Screens', value: hidden ? String(hidden) : 'None', href: '#/accessories/hidden', sk: 'generated.exclude' }),
          K.nav({ label: 'Also Shown', value: (g.include_entities || []).length ? String(g.include_entities.length) : 'None', href: '#/accessories/also', sk: 'generated.include_entities' })]));
        var po = ((self.data.accessories || {}).pages || {});
        box.appendChild(K.group({ header: 'Page Order', footer: 'Pages that mix rooms list things A to Z unless ordered here.' },
          Object.keys(PAGE_ORDERS).map(function (k) {
            return K.nav({ label: PAGE_ORDERS[k][0], value: (po[k] || []).length ? 'Custom' : PAGE_ORDERS[k][2], href: '#/accessories/page/' + k,
                           sk: 'accessories.pages.' + k, icon: PAGE_ORDERS[k][1] });
          })));
        var count = {};
        ids.forEach(function (id) { var a = self.areaOf(id) || (id.indexOf('timer.') === 0 ? '~timers' : '-'); count[a] = (count[a] || 0) + 1; });
        var rows = self.areasAZ().filter(function (a) { return count[a]; }).map(function (a) {
          return K.nav({ label: areas[a].name, icon: areas[a].icon || 'mdi:texture-box', value: String(count[a]),
                         href: '#/accessories/room/' + encodeURIComponent(a) });
        });
        if (count['~timers']) rows.push(K.nav({ label: 'Timers', icon: 'mdi:timer-outline', value: String(count['~timers']), href: '#/accessories/room/~timers' }));
        if (count['-']) rows.push(K.nav({ label: 'No Room', icon: 'mdi:help-circle-outline', value: String(count['-']), href: '#/accessories/room/-' }));
        box.appendChild(K.group({ header: 'Rooms' }, rows));
      };
      inp.addEventListener('input', function () { self._aq = inp.value; paint(); });
      paint();
    }
    a_room(c, aid) {
      var self = this, hass = this._hass, areas = hass.areas || {}, acc = (this.data.accessories || {}).entities || {};
      var ids = this.accIds().filter(function (id) {
        var a = self.areaOf(id);
        return aid === '-' ? !a && id.indexOf('timer.') !== 0 : aid === '~timers' ? !a && id.indexOf('timer.') === 0 : a === aid;
      }).sort(function (a, b) { return self.name(a).localeCompare(self.name(b)); });
      if (areas[aid]) {
        var into = ((this.data.accessories || {}).into || {})[aid] || '';
        var order = ((this.data.accessories || {}).rooms || {})[aid] || [];
        c.appendChild(K.group({ footer: 'Part of another room: its accessories appear inside that room on generated screens — the Deck in the Backyard.' }, [
          K.select({ label: 'Show As Part Of', sk: 'into:' + aid, value: into,
            options: [['', 'Its Own Room']].concat(this.areasAZ().filter(function (a) { return a !== aid; })
              .map(function (a) { return [a, areas[a].name]; })),
            onChange: function (v) { self.ws({ type: DOMAIN + '/accessory/into', area_id: aid, into: v || null }); } }),
          K.nav({ label: 'Tile Order', value: order.length ? 'Custom' : 'Automatic', href: '#/accessories/room/' + encodeURIComponent(aid) + '/order' })]));
      }
      c.appendChild(K.group({ header: 'Accessories' }, ids.map(function (id) {
        var a = acc[id] || {};
        var st = hass.states[id];
        return K.nav({ label: self.name(id), icon: a.icon ? String(a.icon).replace(/^mdi:/, 'hk:') : (st && st.attributes.icon) || 'mdi:circle-small',
                       value: Object.keys(a).length ? 'Customized' : '', href: '#/accessories/' + encodeURIComponent(id) });
      })));
    }
    a_roomOrder(c, aid) {
      var self = this;
      var inRoom = this.accIds().filter(function (id) { return self.areaOf(id) === aid; });
      var own = (((this.data.accessories || {}).rooms || {})[aid] || []).filter(function (id) { return inRoom.indexOf(id) >= 0; });
      var auto = !own.length;
      var rest = inRoom.filter(function (id) { return own.indexOf(id) < 0; }).sort(function (a, b) { return self.name(a).localeCompare(self.name(b)); });
      var save = function (v) { self.ws({ type: DOMAIN + '/accessory/order', area_id: aid, entities: v }); };
      c.appendChild(K.listEditor({ fk: 'ro', auto: auto, minRows: 1, announce: this.announce.bind(this),
        autoFooter: 'Automatic: the room’s tiles in the screen’s usual order.',
        rows: own.concat(rest).map(function (id) { return { value: id, label: self.name(id) }; }),
        onAuto: function (on) {
          if (!on) { save(own.concat(rest)); return; }
          K.confirm(self.shadowRoot, { title: 'Use the automatic order?', message: 'This room’s tile order will be cleared.', ok: 'Use Automatic' })
            .then(function (yes) { if (yes) save([]); });
        },
        onChange: save }));
      c.appendChild(K.group({ footer: 'On Home and the room’s page, on every generated screen.' }, []));
    }
    a_pageOrder(c, page) {
      var self = this, P = PAGE_ORDERS[page];
      var az = function (a, b) { return self.name(a).localeCompare(self.name(b)); };
      var all = page === 'security'
        ? this.entityIds({ domains: ['lock'], shown: true }).sort(az)
            .concat(this.entityIds({ domains: ['cover'], dc: 'garage', shown: true }).sort(az))
        : this.entityIds({ domains: ['vacuum'], shown: true }).sort(az);
      var own = ((((this.data.accessories || {}).pages || {})[page]) || []).filter(function (id) { return all.indexOf(id) >= 0; });
      var save = function (v) { self.ws({ type: DOMAIN + '/accessory/page_order', page: page, entities: v }); };
      c.appendChild(K.listEditor({ fk: 'po', auto: !own.length, minRows: 1, announce: this.announce.bind(this),
        autoFooter: 'Automatic: ' + P[2] + '.',
        rows: own.concat(all.filter(function (id) { return own.indexOf(id) < 0; })).map(function (id) { return { value: id, label: self.name(id) }; }),
        onAuto: function (on) { save(on ? [] : own.concat(all.filter(function (id) { return own.indexOf(id) < 0; }))); },
        onChange: save }));
    }
    a_hidden(c) {
      var self = this, g = this.data.settings.generated, hass = this._hass, devs = hass.devices || {};
      var set = function (k, v) { var o = {}; o['generated.' + k] = v; self.setH(o); };
      var dn = function (id) { var d = devs[id]; return d ? (d.name_by_user || d.name || id) : id + ' (gone)'; };
      var lists = [
        ['exclude_areas', 'Rooms', 'Hide a Room…', function (id) { return self.areaName(id); },
         function () { return self.areasAZ().map(function (a) { return { value: a, label: self.areaName(a) }; }); }],
        ['exclude_devices', 'Devices', 'Hide a Device…', dn,
         function () { return Object.keys(devs).map(function (id) { return { value: id, label: dn(id), sub: self.areaName(devs[id].area_id) || '' }; }); }],
        ['exclude_entities', 'Accessories', 'Hide an Accessory…', function (id) { return self.name(id); },
         function () { return Object.keys(hass.states).map(function (id) { return { value: id, label: self.name(id), sub: id }; }); }]];
      lists.forEach(function (L) {
        var cur = g[L[0]] || [];
        c.appendChild(K.listEditor({ fk: L[0], reorder: false, shownHeader: L[1], emptyText: 'None', announce: self.announce.bind(self),
          rows: cur.map(function (id) { return { value: id, label: L[3](id) }; })
            .sort(function (a, b) { return a.label.localeCompare(b.label); }),
          onChange: function (v) { set(L[0], v); },
          addLabel: L[2], onAddOther: function () {
            self.go(self.picker('hide-' + L[0], { title: L[2].replace('…', ''), value: null,
              items: function () { return L[4]().filter(function (it) { return cur.indexOf(it.value) < 0; }); },
              onPick: function (v) { if (v) set(L[0], cur.concat(v)); } }));
          } }));
      });
      c.appendChild(K.group({ footer: 'Left off every generated screen — its rooms, chips and pages — and never counted by What Counts, on any screen. To hide something from Home only, use Show on Home in its settings.' }, []));
    }
    a_also(c) {
      var self = this, cur = this.data.settings.generated.include_entities || [];
      var set = function (v) { self.setH({ 'generated.include_entities': v }); };
      c.appendChild(K.listEditor({ fk: 'also', reorder: false, shownHeader: 'Also Shown', emptyText: 'None', announce: this.announce.bind(this),
        rows: cur.map(function (id) { return { value: id, label: self.name(id), sub: id }; }),
        onChange: set, addLabel: 'Add…', onAddOther: function () {
          self.go(self.picker('also-add', { title: 'Also Show', value: null,
            items: function () { return Object.keys(self._hass.states).filter(function (id) { return cur.indexOf(id) < 0; })
              .map(function (id) { return { value: id, label: self.name(id), sub: id }; }); },
            onPick: function (id) { if (id) set(cur.concat(id)); } }));
        } }));
      c.appendChild(K.group({ footer: 'Things a generated screen wouldn’t show by itself — scenes, scripts, sensors. Each appears in its room, or in a section called More.' }, []));
    }
    a_one(c, id) {
      var self = this;
      if (!this._hass.states[id]) { c.appendChild(K.group({ footer: 'This entity doesn’t exist any more.' }, [])); return; }
      var box = h('div', { class: 'accwrap' });
      c.appendChild(box);
      loadCards().then(function () {
        var D = window.hkDetail && window.hkDetail._;
        if (!D || !D.accessoryPane) { box.appendChild(K.group({ footer: 'The accessory settings couldn’t load.' }, [])); return; }
        var st = document.createElement('style');
        st.textContent = D.ACC_CSS || '';
        box.appendChild(st);
        box.appendChild(D.accessoryPane(self._hass, id, function () { self.status('saved'); self.soon(); }, { panel: true, onSaved: function (ok) { self.status(ok ? 'saved' : 'error'); } }));
      });
    }

    // ---------------------------------------------------------- pop-ups
    p_popups(sub) {
      var self = this, back = ['Pop-ups', '#/popups'];
      if (sub[0] === 'new') return { title: 'New Pop-up', back: back, body: function (c) { self.pop_new(c); } };
      if (sub[0]) {
        var p = this.data.popups.filter(function (x) { return x.hash === sub[0]; })[0];
        if (!p) return { title: 'Pop-up', back: back, body: function (c) { c.appendChild(K.group({ footer: 'There’s no pop-up #' + sub[0] + '.' }, [])); } };
        if (sub[1] === 'accessories') return { title: 'Accessories', back: [p.name || p.hash, '#/popups/' + p.hash], body: function (c) { self.pop_entities(c, p); } };
        if (sub[1] === 'cards' && p.kind === 'cards') return { title: 'Cards', back: [p.name || p.hash, '#/popups/' + p.hash], body: function (c) {
          self.yamlPage(c, { value: p.cards, sk: 'pop:cards', clear: false,
            help: 'The sheet’s cards, as a list in YAML — any card, one under another. The sheet has its own name and glyph above them.',
            example: '- type: custom:hk-heading-card\n  name: Garage\n- type: tile\n  entity: cover.garage_door\n- type: custom:hk-camera-card\n  entity: camera.garage',
            onSave: function (v) {
              var cards = Array.isArray(v) ? v : v && v.type ? [v] : [];
              self.popupSave(p, { cards: cards }).then(function () { if (!self.err('pop:' + p.hash)) self.back('#/popups/' + p.hash); });
            } });
        } };
        return { title: p.name || '#' + p.hash, back: back, scope: 'Opens on a screen whose address ends in <b>#' + K.esc(p.hash) + '</b>.',
                 body: function (c) { self.pop_one(c, p); } };
      }
      return { title: 'Pop-ups', top: true, scope: 'Sheets an automation can open on any screen — the doorbell, the alarm keypad.', body: function (c) {
        var d = self.data;
        c.appendChild(K.group({ footer: 'An automation opens one with the hk_frontend.show_popup action, or by loading a screen’s address ending in its #.' },
          d.popups.map(function (p) {
            return K.nav({ label: p.name || p.hash, value: '#' + p.hash, href: '#/popups/' + p.hash,
                           icon: p.kind === 'camera' ? 'mdi:doorbell-video' : p.kind === 'alarm' ? 'mdi:shield-home' :
                                 p.kind === 'cards' ? p.icon || 'mdi:card-text-outline' : 'mdi:view-grid' });
          }).concat([K.nav({ label: 'Add Pop-up', href: '#/popups/new', cls: 'tintc', icon: 'mdi:plus' })])));
      } };
    }
    async popupFlow(p, values) {
      var hass = this._hass, base = 'config/config_entries/subentries/flow';
      var r = await hass.callApi('POST', base, { handler: [this.data.entry_id, 'popup'], subentry_id: p.item });
      var body = {};
      Object.keys(values).forEach(function (k) {
        var v = values[k];
        if (v === '' || v === null || v === undefined) return;
        body[k] = v;
      });
      var r2;
      try { r2 = await hass.callApi('POST', base + '/' + r.flow_id, body); } catch (e) {
        hass.callApi('DELETE', base + '/' + r.flow_id).catch(function () {});
        throw e;
      }
      if (r2.type === 'form') {
        hass.callApi('DELETE', base + '/' + r.flow_id).catch(function () {});
        var code = r2.errors && Object.keys(r2.errors).map(function (k) { return r2.errors[k]; })[0];
        throw new Error(M.errorText(code || 'unknown'));
      }
    }
    popupSave(p, changes) {
      var self = this;
      var v = { name: p.name, close_after: p.close_after, dashboards: p.dashboards };
      if (p.kind === 'camera') { v.entity = p.entity; v.speaker = p.speaker; v.stream = p.stream; }
      else if (p.kind === 'alarm') v.entity = p.entity;
      else if (p.kind === 'cards') { v.cards = p.cards; v.icon = p.icon; v.width = p.width; }
      else v.entities = p.entities;
      Object.assign(v, changes);
      Object.assign(p, changes);
      this.render();
      this.status('saving');
      return this.popupFlow(p, v).then(function () {
        self.status('saved'); return self.reload().then(function () { self.render(); });
      }, function (e) {
        self.status('error'); self.errors['pop:' + p.hash] = String(e && e.message || e);
        return self.reload().then(function () { self.render(); });
      });
    }
    pop_one(c, p) {
      var self = this, save = function (ch) { delete self.errors['pop:' + p.hash]; return self.popupSave(p, ch); };
      var kind = M.POPUP_KINDS.filter(function (k) { return k[0] === p.kind; })[0] || [p.kind, p.kind];
      c.appendChild(K.group({}, [
        K.text({ label: 'Name', sk: 'pop:name', value: p.name, maxlength: 60, onCommit: function (v) { if (v.trim()) save({ name: v.trim() }); } }),
        K.info({ label: 'Type', value: kind[1] }), K.info({ label: 'Address', value: '#' + p.hash })]));
      if (this.err('pop:' + p.hash)) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('pop:' + p.hash) }));
      if (p.kind === 'camera') {
        c.appendChild(K.group({ header: 'Camera', footer: 'Talk-back needs the camera’s own speaker. A higher-resolution stream can be shown live.' }, [
          this.entityRow({ label: 'Camera', sk: 'pop:entity', value: p.entity, none: null, filter: { domains: ['camera'] },
                           onPick: function (v) { if (v) save({ entity: v }); } }),
          this.entityRow({ label: 'Talk-Back Speaker', sk: 'pop:speaker', value: p.speaker, none: 'The Camera’s Own', filter: { domains: ['media_player'] },
                           onPick: function (v) { save({ speaker: v || '' }); } }),
          this.entityRow({ label: 'Live Stream', sk: 'pop:stream', value: p.stream, none: 'Its High-Resolution Channel', filter: { domains: ['camera'] },
                           onPick: function (v) { save({ stream: v || '' }); } })]));
      } else if (p.kind === 'alarm') {
        c.appendChild(K.group({ header: 'Alarm' }, [
          this.entityRow({ label: 'Alarm Panel', sk: 'pop:entity', value: p.entity, none: 'Same as General', filter: { domains: ['alarm_control_panel'] },
                           onPick: function (v) { save({ entity: v || '' }); } })]));
      } else if (p.kind === 'cards') {
        c.appendChild(K.group({ header: 'Sheet', footer: 'Any cards — Home Assistant’s own, or a custom card’s.' }, [
          K.nav({ label: 'Cards', value: p.cards.length ? String(p.cards.length) : 'None Yet', href: '#/popups/' + p.hash + '/cards', sk: 'pop:cards' }),
          K.text({ label: 'Icon', sk: 'pop:icon', value: p.icon, placeholder: 'mdi:card-text-outline', maxlength: 60, autocomplete: 'off',
                   error: this.err('pop:icon'),
                   onCommit: function (v) {
                     v = v.trim();
                     if (v && !/^(mdi|hk):[a-z0-9-]+$/.test(v)) { self.errors['pop:icon'] = M.errorText('icon'); self.render(); return; }
                     delete self.errors['pop:icon']; save({ icon: v });
                   } }),
          K.select({ label: 'Width', sk: 'pop:width', value: p.width, options: [['narrow', 'Narrow'], ['wide', 'Wide']],
                     onChange: function (v) { save({ width: v }); } })]));
      } else {
        c.appendChild(K.group({ header: 'Accessories' }, [K.nav({ label: 'Accessories', value: String(p.entities.length),
                                                                  href: '#/popups/' + p.hash + '/accessories' })]));
      }
      var opts = M.CLOSE_AFTER.slice();
      if (!opts.some(function (o) { return o[0] === p.close_after; })) opts.push([p.close_after, p.close_after + ' Seconds']);
      c.appendChild(K.group({}, [K.select({ label: 'Close After', sk: 'pop:close', value: p.close_after,
        options: opts.map(function (o) { return [String(o[0]), o[1]]; }), onChange: function (v) { save({ close_after: Number(v) }); } })]));
      var screens = this.data.dashboards.filter(function (x) { return x.item; });
      var all = !p.dashboards.length;
      var srows = [K.toggle({ label: 'All Screens', sk: 'pop:all', on: all, onChange: function (on) {
        save({ dashboards: on ? [] : screens.filter(function (x) { return (self.data.boards[x.path] || {}).popups !== false; }).map(function (x) { return x.path; }) });
      } })];
      if (!all) {
        screens.forEach(function (x) {
          var on = p.dashboards.indexOf(x.path) >= 0;
          var answers = (self.data.boards[x.path] || {}).popups !== false;
          srows.push(K.check({ label: x.title, sub: answers ? null : 'Allow Pop-ups is off on this screen', multi: true, on: on, fk: 'pop:d:' + x.path,
            onClick: function () {
              var next = p.dashboards.filter(function (d) { return d !== x.path; });
              if (!on) next.push(x.path);
              if (!next.length) { self.announce('Turn on All Screens instead.'); return; }
              save({ dashboards: next });
            } }));
        });
      }
      c.appendChild(K.group({ header: 'Screens', footer: 'A screen with Allow Pop-ups turned off never shows one.' }, srows));
      c.appendChild(K.group({}, [K.button({ label: 'Delete Pop-up…', destructive: true, sk: 'pop:delete', onClick: function () {
        K.confirm(self.shadowRoot, { title: 'Delete #' + p.hash + '?', message: 'Automations that open it will open nothing.', ok: 'Delete', destructive: true })
          .then(function (yes) {
            if (!yes) return;
            self.ws({ type: 'config_entries/subentries/delete', entry_id: self.data.entry_id, subentry_id: p.item }).then(function (ok) {
              if (ok) self.reload().then(function () { self.go('#/popups'); });
            });
          });
      } })]));
    }
    pop_entities(c, p) {
      var self = this;
      c.appendChild(K.listEditor({ fk: 'pe', shownHeader: 'On the Sheet', minRows: 1, announce: this.announce.bind(this),
        rows: p.entities.map(function (id) { return { value: id, label: self.name(id) }; }),
        onChange: function (v) { self.popupSave(p, { entities: v }); },
        addLabel: 'Add Accessory…', onAddOther: function () {
          self.go(self.picker('pe-add', { title: 'Add Accessory', value: null,
            items: function () { return self.entityIds({ re: TILE_DOMAINS, shown: true }).filter(function (id) { return p.entities.indexOf(id) < 0; })
              .map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; }); },
            onPick: function (id) { if (id) self.popupSave(p, { entities: p.entities.concat(id) }); } }));
        } }));
    }
    pop_new(c) {
      var self = this, np = this._np = this._np || { name: '', hash: '', kind: 'camera', entity: null, speaker: null, stream: null, entities: [] };
      c.appendChild(K.group({ footer: 'The address is what an automation opens: a screen’s address ending in #' + (np.hash || slug(np.name) || 'front-door') + '.' }, [
        K.text({ label: 'Name', sk: 'np:name', value: np.name, placeholder: 'Front Door', maxlength: 60, onCommit: function (v) { np.name = v; self.render(); } }),
        K.text({ label: 'Address', sk: 'np:hash', value: np.hash, placeholder: slug(np.name) || 'front-door', maxlength: 40,
                 onCommit: function (v) { np.hash = v.replace(/^#/, ''); self.render(); } })]));
      c.appendChild(K.group({ header: 'Type' }, M.POPUP_KINDS.map(function (k) {
        return K.check({ label: k[1], sub: k[2], on: np.kind === k[0], fk: 'np:kind:' + k[0], onClick: function () { np.kind = k[0]; self.render(); } });
      })));
      var pick = function (key) { return function (v) { np[key] = v; self.render(); }; };
      if (np.kind === 'camera') {
        c.appendChild(K.group({ header: 'Camera' }, [
          this.entityRow({ label: 'Camera', sk: 'np:entity', value: np.entity, none: 'Choose…', filter: { domains: ['camera'] }, onPick: pick('entity') }),
          this.entityRow({ label: 'Talk-Back Speaker', sk: 'np:speaker', value: np.speaker, none: 'The Camera’s Own', filter: { domains: ['media_player'] }, onPick: pick('speaker') })]));
      } else if (np.kind === 'alarm') {
        c.appendChild(K.group({ header: 'Alarm' }, [
          this.entityRow({ label: 'Alarm Panel', sk: 'np:entity', value: np.entity, none: 'Same as General', filter: { domains: ['alarm_control_panel'] }, onPick: pick('entity') })]));
      } else if (np.kind === 'cards') {
        c.appendChild(K.group({ footer: 'Its cards are written next, in YAML.' }, []));
      } else {
        c.appendChild(K.listEditor({ fk: 'npe', shownHeader: 'Accessories', emptyText: 'None yet', reorder: true,
          rows: np.entities.map(function (id) { return { value: id, label: self.name(id) }; }),
          onChange: function (v) { np.entities = v; self.render(); },
          addLabel: 'Add Accessory…', onAddOther: function () {
            self.go(self.picker('npe-add', { title: 'Add Accessory', value: null,
              items: function () { return self.entityIds({ re: TILE_DOMAINS, shown: true }).filter(function (id) { return np.entities.indexOf(id) < 0; })
                .map(function (id) { return { value: id, label: self.name(id), sub: self.areaName(self.areaOf(id)) || id }; }); },
              onPick: function (id) { if (id) { np.entities = np.entities.concat(id); } } }));
          } }));
      }
      if (this.err('np')) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('np') }));
      var ready = np.name.trim() && (np.kind !== 'camera' || np.entity) && (np.kind !== 'accessories' || np.entities.length);
      c.appendChild(K.group({}, [K.button({ label: 'Add Pop-up', center: true, disabled: !ready, fk: 'np:go', onClick: function () {
        self.status('saving');
        self.addPopup(np).then(function (hash) {
          var kind = np.kind;
          self._np = null; delete self.errors.np; self.status('saved');
          return self.reload().then(function () {
            self.go('#/popups/' + hash);
            // then its cards, one step on (so Back is the pop-up's page)
            if (kind === 'cards') setTimeout(function () { self.go('#/popups/' + hash + '/cards'); }, 80);
          });
        }, function (e) { self.errors.np = String(e && e.message || e); self.status('error'); self.render(); });
      } })]));
    }
    async addPopup(np) {
      var hass = this._hass, base = 'config/config_entries/subentries/flow';
      var r = await hass.callApi('POST', base, { handler: [this.data.entry_id, 'popup'] });
      var fid = r.flow_id;
      try {
        var first = { name: np.name.trim(), kind: np.kind };
        if (np.hash.trim()) first.hash = np.hash.trim();
        r = await hass.callApi('POST', base + '/' + fid, first);
        if (r.type === 'form' && r.step_id === 'user') throw new Error(M.errorText(Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; })[0]));
        var det = { close_after: np.kind === 'alarm' ? 3600 : 60 };
        if (np.entity) det.entity = np.entity;
        if (np.kind === 'camera' && np.speaker) det.speaker = np.speaker;
        if (np.kind === 'accessories') det.entities = np.entities;
        if (np.kind === 'cards') det.width = 'narrow';
        r = await hass.callApi('POST', base + '/' + fid, det);
        if (r.type !== 'create_entry') throw new Error(M.errorText(Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; })[0]));
        return r.result && r.result.unique_id || first.hash || slug(np.name);
      } catch (e) {
        hass.callApi('DELETE', base + '/' + fid).catch(function () {});
        throw e;
      }
    }

    // ---------------------------------------------------------- custom pages
    p_pages(sub) {
      var self = this, back = ['Custom Pages', '#/pages'];
      if (sub[0] === 'new') return { title: 'New Page', back: back, body: function (c) { self.pg_new(c); } };
      if (sub[0]) {
        var p = (this.data.custom_pages || []).filter(function (x) { return x.path === sub[0]; })[0];
        if (!p) return { title: 'Page', back: back, body: function (c) { c.appendChild(K.group({ footer: 'There’s no page /' + sub[0] + '.' }, [])); } };
        if (sub[1] === 'content') return { title: 'Page Content', back: [p.title, '#/pages/' + p.path], body: function (c) {
          self.yamlPage(c, { value: p.view, sk: 'pg:view:' + p.path,
            help: 'The page’s cards, in YAML, as a dashboard view without its title, address and icon.',
            onSave: function (v) { return self.pageSave(p, { view: v }); } });
        } };
        return { title: p.title, back: back, scope: 'At <b>/' + K.esc(p.path) + '</b> on the screens that show it.', body: function (c) { self.pg_one(c, p); } };
      }
      return { title: 'Custom Pages', top: true, scope: 'Pages you write yourself, in YAML — Energy, EcoFlow. Any generated screen can show them.', body: function (c) {
        c.appendChild(K.group({}, (self.data.custom_pages || []).map(function (p) {
          return K.nav({ label: p.title, icon: p.icon || 'mdi:file-document-outline', href: '#/pages/' + p.path,
                         value: p.used_on.length ? 'On ' + p.used_on.length + ' Screen' + (p.used_on.length > 1 ? 's' : '') : 'Not Shown' });
        }).concat([K.nav({ label: 'Add Page', href: '#/pages/new', cls: 'tintc', icon: 'mdi:plus' })])));
      } };
    }
    async pageSave(p, changes) {
      var hass = this._hass, base = 'config/config_entries/subentries/flow', self = this;
      var v = Object.assign({ title: p.title, icon: p.icon, view: p.view }, changes);
      var body = { title: v.title, view: v.view };
      if (v.icon) body.icon = v.icon;
      this.status('saving');
      try {
        var r = await hass.callApi('POST', base, { handler: [this.data.entry_id, 'page'], subentry_id: p.item });
        var r2 = await hass.callApi('POST', base + '/' + r.flow_id, body);
        if (r2.type === 'form') {
          hass.callApi('DELETE', base + '/' + r.flow_id).catch(function () {});
          throw new Error(M.errorText(Object.keys(r2.errors || {}).map(function (k) { return r2.errors[k]; })[0]));
        }
        delete this.errors['pg:' + p.path];
        this.status('saved');
      } catch (e) {
        this.errors['pg:' + p.path] = String(e && e.message || e);
        this.status('error');
      }
      await this.reload();
      self.render();
    }
    pg_one(c, p) {
      var self = this;
      c.appendChild(K.group({}, [
        K.text({ label: 'Name', sk: 'pg:title', value: p.title, maxlength: 40, onCommit: function (v) { if (v.trim()) self.pageSave(p, { title: v.trim() }); } }),
        K.text({ label: 'Icon', sk: 'pg:icon', value: p.icon, placeholder: 'mdi:file-document', maxlength: 60,
                 onCommit: function (v) { self.pageSave(p, { icon: v.trim() }); } }),
        K.info({ label: 'Address', value: '/' + p.path })]));
      if (this.err('pg:' + p.path)) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('pg:' + p.path) }));
      var shown = this.data.dashboards.filter(function (x) { return p.used_on.indexOf(x.path) >= 0; });
      c.appendChild(K.group({ header: 'Shown On', footer: shown.length ? 'Add or remove it in a screen’s Pages.' : 'Not shown yet. Add it in a generated screen’s Pages.' },
        shown.map(function (x) { return K.nav({ label: x.title, value: 'Pages', href: '#/screens/' + encodeURIComponent(x.path) + '/pages' }); })));
      var cards = (p.view && p.view.cards) ? p.view.cards.length : 0;
      c.appendChild(K.group({}, [K.nav({ label: 'Page Content', value: cards + ' Card' + (cards === 1 ? '' : 's'), href: '#/pages/' + p.path + '/content' })]));
      if (shown.length) {
        c.appendChild(K.group({}, [K.nav({ label: 'Open Page', sub: 'On ' + shown[0].title, href: '/' + shown[0].path + '/' + p.path, icon: 'mdi:open-in-new' })]));
        var a = c.lastChild.querySelector('a'); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener');
      }
      c.appendChild(K.group({}, [K.button({ label: 'Delete Page…', destructive: true, sk: 'pg:delete', onClick: function () {
        K.confirm(self.shadowRoot, { title: 'Delete ' + p.title + '?', ok: 'Delete', destructive: true,
          message: shown.length ? shown.length + ' screen' + (shown.length > 1 ? 's show' : ' shows') + ' it; it will be gone from ' + (shown.length > 1 ? 'them' : 'it') + '.' : 'No screen shows it.' })
          .then(function (yes) {
            if (!yes) return;
            self.ws({ type: 'config_entries/subentries/delete', entry_id: self.data.entry_id, subentry_id: p.item }).then(function (ok) {
              if (ok) self.reload().then(function () { self.go('#/pages'); });
            });
          });
      } })]));
    }
    pg_new(c) {
      var self = this, np = this._pgn = this._pgn || { title: '', path: '', icon: '', start: 'blank' };
      if (!this._starts) {
        this._starts = [['blank', 'A Blank Page']];
        var base = 'config/config_entries/subentries/flow';
        this._hass.callApi('POST', base, { handler: [this.data.entry_id, 'page'] }).then(function (r) {
          self._hass.callApi('DELETE', base + '/' + r.flow_id).catch(function () {});
          var f = (r.data_schema || []).filter(function (x) { return x.name === 'start'; })[0];
          var opts = f && f.selector && f.selector.select && f.selector.select.options || [];
          self._starts = opts.map(function (o) { return [o.value, o.value === 'blank' ? 'A Blank Page' : o.label]; });
          self.render();
        }).catch(function () {});
      }
      c.appendChild(K.group({}, [
        K.text({ label: 'Name', sk: 'pgn:title', value: np.title, placeholder: 'Energy', maxlength: 40, onCommit: function (v) { np.title = v; self.render(); } }),
        K.text({ label: 'Address', sk: 'pgn:path', value: np.path, placeholder: slug(np.title) || 'energy', maxlength: 40, onCommit: function (v) { np.path = v; } }),
        K.text({ label: 'Icon', sk: 'pgn:icon', value: np.icon, placeholder: 'mdi:lightning-bolt', maxlength: 60, onCommit: function (v) { np.icon = v; } }),
        K.select({ label: 'Start From', sk: 'pgn:start', value: np.start, options: this._starts, onChange: function (v) { np.start = v; } })]));
      if (this.err('pgn')) c.appendChild(h('div', { class: 'errline', role: 'alert', text: this.err('pgn') }));
      c.appendChild(K.group({ footer: 'Start from a page of another dashboard to copy its cards. You can edit them afterwards.' }, [
        K.button({ label: 'Create Page', center: true, disabled: !np.title.trim(), fk: 'pgn:go', onClick: function () {
          self.status('saving');
          self.addPage(np).then(function (path) {
            self._pgn = null; delete self.errors.pgn; self.status('saved');
            return self.reload().then(function () { self.go('#/pages/' + path); });
          }, function (e) { self.errors.pgn = String(e && e.message || e); self.status('error'); self.render(); });
        } })]));
    }
    async addPage(np) {
      var hass = this._hass, base = 'config/config_entries/subentries/flow';
      var r = await hass.callApi('POST', base, { handler: [this.data.entry_id, 'page'] });
      var fid = r.flow_id;
      try {
        var first = { title: np.title.trim(), start: np.start || 'blank' };
        if (np.path.trim()) first.path = np.path.trim();
        if (np.icon.trim()) first.icon = np.icon.trim();
        r = await hass.callApi('POST', base + '/' + fid, first);
        if (r.step_id === 'user') throw new Error(M.errorText(Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; })[0]));
        // the view step holds the imported (or blank) page: submit it as it is
        var vf = (r.data_schema || []).filter(function (x) { return x.name === 'view'; })[0];
        var view = vf && vf.description && vf.description.suggested_value || { cards: [] };
        r = await hass.callApi('POST', base + '/' + fid, { view: view });
        if (r.type !== 'create_entry') throw new Error(M.errorText(Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; })[0]));
        return (r.result && r.result.unique_id) || first.path || slug(first.title);
      } catch (e) {
        hass.callApi('DELETE', base + '/' + fid).catch(function () {});
        throw e;
      }
    }

    // ---------------------------------------------------------- system
    p_advanced() {
      var self = this;
      return { title: 'Advanced', top: true, scope: 'What almost nobody changes. Everything here works when left empty.', body: function (c) {
        var set = function (k) { return function (v) { var o = {}; o[k] = v; self.setH(o); }; };
        var I = self.data.integration || {}, f = I.files || {};
        c.appendChild(K.group({ header: 'Clock', footer: 'Home Assistant’s Time & Date sensors keep every screen’s clock in step with the house.' }, [
          self.entityRow({ label: 'Time Sensor', sk: 'clock.time', value: self.hs('clock.time'), none: 'Each Screen’s Own Clock', filter: { domains: ['sensor'] }, onPick: set('clock.time') }),
          self.entityRow({ label: 'Date Sensor', sk: 'clock.date', value: self.hs('clock.date'), none: 'Each Screen’s Own Clock', filter: { domains: ['sensor'] }, onPick: set('clock.date') })]));
        c.appendChild(K.group({ header: 'Vacuums', footer: 'Empty: cleaning by area goes through Clean Areas. Only for a house whose own script receives the areas.' }, [
          self.entityRow({ label: 'Clean-Areas Script', sk: 'features.vacuum_script', value: self.hs('features.vacuum_script'), none: 'Clean Areas',
                           filter: { domains: ['script'] }, onPick: set('features.vacuum_script') })]));
        c.appendChild(K.group({ header: 'Alarm Keypad', footer: 'Empty for most alarms: a refused code shows “Wrong Code” by itself. Only for a panel that fails silently.' }, [
          self.entityRow({ label: 'Wrong-Code Indicator', sk: 'features.alarm_bad_code', value: self.hs('features.alarm_bad_code'), none: 'Automatic',
                           filter: { domains: ['input_boolean', 'binary_sensor'] }, onPick: set('features.alarm_bad_code') })]));
        c.appendChild(K.group({ header: 'HK Settings', footer: 'Off: HK Settings leaves the sidebar for everyone. It’s still in Settings → Devices & Services → HK Frontend → Configure.' }, [
          K.toggle({ label: 'Show in Sidebar', sk: 'sidebar', on: I.sidebar !== false, onChange: function (on) { self.setH({ sidebar: on }); } })]));
        var fnd = function (v) { return v ? 'Found' : 'Missing'; };
        c.appendChild(K.group({ header: 'Your Files', footer: 'Apple’s SF Pro font and the SF Symbols glyphs can’t ship with the integration. Put the font at fonts/SF-Pro.woff2 and the glyphs at iconset/hk-glyphs.js in this folder, under /config.' }, [
          K.text({ label: 'Folder', sk: 'files_folder', value: I.files_folder, placeholder: 'hk_local', error: self.err('files_folder'),
                   onCommit: function (v) { self.setH({ files_folder: v }); } }),
          K.info({ label: 'SF Pro Font', value: fnd(f.font), valueCls: f.font ? 'ok' : 'warn' }),
          K.info({ label: 'SF Symbols Glyphs', value: fnd(f.glyphs), valueCls: f.glyphs ? 'ok' : 'warn' })]));
        c.appendChild(K.group({}, [K.nav({ label: 'Setup Assistant', href: '#/setup' })]));
      } };
    }
    p_check() {
      var self = this;
      return { title: 'Setup Check', top: true, scope: 'What these pages need from this Home Assistant, and how to fix what’s missing.', body: function (c) {
        var lines = self._check;
        if (!lines) {
          c.appendChild(K.group({}, [K.info({ label: 'Checking…' })]));
          if (!self._checking) {
            self._checking = true;
            self._hass.callWS({ type: DOMAIN + '/setup/check' }).then(function (r) { self._check = r.lines; self._checking = false; self.render(); },
              function (e) { self._checking = false; self._check = [{ ok: false, title: 'Setup check failed', detail: String(e && e.message || e) }]; self.render(); });
          }
          return;
        }
        var ic = function (ok) { return ok === true ? ['mdi:check', C.green] : ok === false ? ['mdi:exclamation', C.orange] : ['mdi:information-variant', C.gray]; };
        var groups = [['Needs Doing', false], ['Ready', true], ['Notes', null]];
        groups.forEach(function (g) {
          var ls = lines.filter(function (l) { return l.ok === g[1]; });
          if (!ls.length) return;
          c.appendChild(K.group({ header: g[0] }, ls.map(function (l) {
            // a line may carry a [link](/where) to fix it: the row opens it.
            // ONLY A PATH ON THIS SERVER becomes the row's href -- the names in
            // a line come from integrations (setup_check escapes them), and a
            // javascript: or off-site link must never be one click away.
            var text = String(l.detail || '').replace(/(?<!\\)[*`]/g, ''), link = null;
            text = text.replace(/(?<!\\)\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, words, url) {
              if (!link && /^\/(?!\/)/.test(url)) link = url;
              return words;
            }).replace(/\\([\\`*_\[\]()<>])/g, '$1');
            if (link) return K.nav({ tile: ic(l.ok), label: l.title, sub: text, href: link });
            return K.info({ tile: ic(l.ok), label: l.title, sub: text });
          })));
        });
        c.appendChild(K.group({}, [K.button({ label: 'Check Again', fk: 'check:again', onClick: function () { self._check = null; self.render(); } })]));
      } };
    }
    // THE SETUP ASSISTANT'S FEATURES STEP: the optional features, each as
    // this house has it -- added (its page) or not (Add, through HK Frontend's
    // Add feature).
    setupFeatures(c) {
      var feats = this.data.features || {}, rows = [], missing = [];
      F.LIST.forEach(function (x) {
        var st = F.stateOf(feats, x[1]), name = (feats[x[1]] || {}).name || x[2];
        if (st === 'added' || x[0] === 'music') {
          rows.push(K.nav({ tile: [x[3], x[4]], label: x[2], sub: F.SCOPE[x[1]],
                            href: '#/features/' + x[0], fk: 'setup:feat:' + x[0] }));
        }
        if (st === 'not_added') {
          rows.push(K.nav({ tile: [x[3], x[4]], label: 'Add ' + name, sub: F.SCOPE[x[1]], href: F.addHref(x[1]),
                            fk: 'setup:add:' + x[1] }));
        }
        if (st === 'missing') missing.push(name);
      });
      c.appendChild(K.group({ footer: 'Each is optional, added from HK Frontend’s Add feature. Its settings are under Features in the list.' +
          (missing.length ? ' Not available here: ' + missing.join(', ') + '.' : '') }, rows));
    }
    p_setup(step) {
      var self = this;
      var STEPS = SETUP_STEPS;
      step = Math.max(0, Math.min(STEPS.length - 1, step || 0));
      var next = function () { self.go('#/setup/' + (step + 1)); };
      return { title: step ? STEPS[step] : 'Set Up HK Frontend', backLabel: 'Setup',
        back: step ? [STEPS[step - 1], '#/setup/' + (step - 1)] : ['HK Settings', '#/'],
        scope: step && step < STEPS.length - 1 ? 'Step ' + step + ' of ' + (STEPS.length - 2) + '. Everything here can be changed later.' : null,
        body: function (c) {
          if (step === 0) {
            c.appendChild(h('div', { class: 'big' }, [h('span', { class: 'tile', style: 'background:' + C.orange }, K.icon('mdi:home-heart', '')),
              h('p', { text: 'A few questions about your home — its alarm, its weather, how the glass should look — then a first screen, built from your rooms and devices. Everything else is found by itself.' })]));
            c.appendChild(K.group({}, [K.button({ label: 'Get Started', center: true, fk: 'setup:go', onClick: next })]));
            return;
          }
          if (step === 1) self.h_general(c);
          if (step === 2) self.h_weather(c);
          if (step === 3) self.h_appearance(c);
          if (step === 4) self.setupFeatures(c);
          if (step === SETUP_FIRST) {
            self.addScreenBody(c, null, function (path) { self._created = path; next(); });
            c.appendChild(K.group({}, [K.button({ label: 'Skip', center: true, fk: 'setup:skip', onClick: next })]));
            return;
          }
          if (step === SETUP_STEPS.length - 1) {
            c.appendChild(h('div', { class: 'big' }, [h('span', { class: 'tile', style: 'background:' + C.green }, K.icon('mdi:check', '')),
              h('p', { text: 'Your settings are saved. Everything can be changed later, from the list.' })]));
            if (self._created) {
              var a = K.nav({ label: 'Open ' + self._created, href: '/' + self._created + '/0', icon: 'mdi:open-in-new' });
              c.appendChild(K.group({}, [a]));
            }
            c.appendChild(K.group({}, [K.button({ label: 'Done', center: true, fk: 'setup:done', onClick: function () {
              self.go(self.hasAttribute('wide') ? '#/overview' : '#/');
            } })]));
            if (!self._setupMarked) {
              self._setupMarked = true;
              self._hass.callWS({ type: DOMAIN + '/setup/done', done: true }).catch(function () {});
            }
            return;
          }
          c.appendChild(K.group({}, [K.button({ label: 'Continue', center: true, fk: 'setup:next', onClick: next })]));
        } };
    }
  }
  var SETUP_STEPS = ['Welcome', 'General', 'Weather', 'Appearance', 'Features', 'First Screen', 'Done'];
  var SETUP_FIRST = SETUP_STEPS.indexOf('First Screen');
  function hashOf(h) { h = String(h || '#/').split('?')[0]; return h.charAt(0) === '#' ? h : '#' + h; }
  var FROM_KEY = 'hk-settings-from';
  function loadFrom() {
    try { var o = JSON.parse(sessionStorage.getItem(FROM_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
    catch (e) { return {}; }
  }
  function saveFrom(o) { try { sessionStorage.setItem(FROM_KEY, JSON.stringify(o)); } catch (e) { /* private window */ } }
  function slug(t) {
    return String(t || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }
  customElements.define('hk-settings-panel', HkSettingsPanel);
  window.hkSettingsPanel = { version: '2.0.0' };
})();
