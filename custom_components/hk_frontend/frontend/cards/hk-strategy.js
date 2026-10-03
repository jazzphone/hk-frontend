// hk-strategy.js -- A WHOLE HOME APP-STYLE DASHBOARD FROM THE HOUSE ITSELF.
//
//     # a new dashboard, in its raw configuration editor:
//     strategy:
//       type: custom:hk-dashboard
//
// A Lovelace dashboard STRATEGY: Home Assistant asks it for the dashboard and
// it answers from the house's own registries -- floors, areas, devices and
// entities -- so a house with none of this configuration gets a working
// dashboard on day one, and a new light appears on its own. It is curated on
// the HK Settings page (each screen's item, the accessories' gear), not in
// YAML: since 2026-09-28 every screen of this house but the car's is one.
//
// WHAT IT BUILDS
//   Home      the wall header (clock, weather, security) and the status chips,
//             then one section per area -- a heading and its tiles -- ordered
//             by floor level, then area name. Areas with nothing are left out.
//   Lights, Climate, Doors & Windows, Timers, Vacuums
//             a page per category the house has, opened from its chip.
//   Weather   the band, and wind / sun / moon / UV tiles.       (./weather)
//   Security  the alarm keypad, when there is an alarm panel.   (./security)
//   Play/Browse Music, when Music is set up with speakers.     (./playmusic)
//   Rooms     a page per area: its status row, cameras and devices grouped as
//             the Home app groups them (./room-<area>); each room heading on
//             Home opens its page. The same page is a view strategy of its own
//             for hand-built dashboards: `strategy: {type: custom:hk-room,
//             area: kitchen}` (docs/Menu.md).
//   The menu  (the dashboard item's gear -> Menu) lists all of it: the chip
//             row carries its button, Weather sits beside Home, Browse Music
//             is left out unless its Categories pick it.
//
// THE TILES follow hand-curated conventions (card type, glyph,
// colour, tall tiles for locks, thermostats, vacuums and garage doors) and the
// MEASURED glyph sizes -- see TILE below. A glyph without a measured size keeps
// the card default rather than a guessed one.
//
// OPTIONS (all optional) -- normally set on the HK Settings page (Accessories
// -> Hidden from Screens / Also Shown, and each screen's Pages); the same keys
// in the dashboard's raw configuration add to those (lists) or win (yes/no).
//   areas:           [area_id, ...]   only these, in this order
//   exclude_areas:   [area_id, ...]
//   exclude_entities:[entity_id, ...]
//   exclude_devices: [device_id, ...]
//   include_entities:[entity_id, ...]  shown in their room, or in "More"
//   theme:           a theme name     (default: HK Kiosk when installed)
//   sky:             false            no live sky
//   music:           false            no music pages even when music is set up
//   chips:           false            no status chips under the header
//   pages:           false            no category pages
//   rooms:           false            no room pages
//
// It reads hass.floors / areas / devices / entities, which every user --
// including a non-admin wall tablet -- already has. One websocket call
// (hk_music/subscribe, bounded to 4 s) asks whether music is configured.
(function () {
  'use strict';

  var GRID = {
    'grid-template-columns': 'repeat(auto-fill, var(--hk-track, 192px))',
    'grid-auto-rows': '82px',
    'grid-auto-flow': 'dense',
    'grid-column-gap': '12px',
    'grid-row-gap': '0px',
    margin: '0px',
    padding: '0px 0px 11px 0px'
  };
  var VIEW_LAYOUT = {
    'grid-template-columns': '2% 96% 2%', 'grid-column-gap': '0px', 'grid-row-gap': '0px',
    margin: '0px', padding: '0px', 'grid-auto-flow': 'row', 'grid-auto-rows': 'auto'
  };
  var COL2 = { 'grid-column': '2' };
  var TALL = { 'grid-row': 'span 2' };
  var TEAL = 'rgba(88, 192, 206, 0.98)';

  // Measured glyph boxes: each glyph's size in the tile's well, measured against
  // the Home app, not guessed. An unlisted glyph keeps the card default -- so
  // every glyph the accessory gear offers belongs here, or a Fire or Sword
  // picked there draws at the flat 23 px default.
  var PX = {
    'blinds-horizontal': 26, 'blinds-horizontal-closed': 26, 'ceiling-light': 28,
    chandelier: 32, 'desk-lamp': 30, 'floor-lamp': 30, lamp: 30, 'led-strip-variant': 27,
    'light-recessed': 32, lightbulb: 28, 'lightbulb-group': 42, 'lightbulb-multiple': 28,
    lock: 23, 'lock-open-variant': 24, 'outdoor-lamp': 30, 'power-socket-us': 21,
    'string-lights': 30, 'vanity-light': 32, 'wall-sconce': 26, coffee: 26,
    'motion-sensor': 31, garage: 26, 'garage-open': 26, 'air-humidifier': 31,
    'robot-vacuum': 38, 'alarm-light-off': 27, television: 29,
    amplifier: 25, bed: 32, 'blinds-open': 26, 'desktop-tower': 25, fire: 26, 'gamepad-variant': 28,
    'printer-3d': 23, 'roller-shade': 26, 'run-fast': 26, server: 26, 'server-network': 24, sword: 27,
    // the players, at the Home app's sizes
    speaker: 36, homepod: 36, 'homepod-mini': 40, 'apple-tv': 35
  };
  // THE HOME GLYPHS ADDED 2026-10-01 (Apple's Home symbols, offered by the
  // gear): NOT MEASURED against the Home app -- each is sized like its
  // nearest measured kin (a chandelier like the chandelier, a shade like the
  // blinds), so none draws at the flat 23 px. Replace one with a measurement
  // when it is taken.
  var PX_KIN = {
    'ceiling-light-multiple': 32, 'ceiling-fan': 30, 'ceiling-fan-light': 30, 'light-switch': 24,
    'lightbulb-variant': 28, 'lightbulb-fluorescent-tube': 28, 'lightbulb-spot': 28, 'wall-sconce-flat': 26,
    'fan-desk': 28, 'fan-floor': 30, 'air-purifier': 30, dehumidifier: 30, radiator: 28, fireplace: 28,
    'heat-wave': 26, 'blinds-vertical': 26, 'blinds-vertical-closed': 26, 'window-shutter': 26,
    'window-shutter-open': 26, 'roman-shade': 26, 'roman-shade-open': 26, curtains: 26, 'curtains-closed': 26,
    'window-closed': 26, 'window-open': 26, awning: 26, skylight: 26, 'door-sliding': 26, 'door-sliding-open': 26,
    'door-french': 26, 'garage-double': 26, gate: 26, 'gate-open': 26, 'lock-smart': 24, 'contact-sensor': 26,
    'smoke-detector': 30, 'molecule-co': 30, 'molecule-co2': 30, 'air-filter': 26, 'doorbell-video': 26,
    webcam: 26, bell: 24, 'power-strip': 30, 'power-plug': 26, 'gesture-tap-button': 24, remote: 24,
    sprinkler: 26, 'pipe-leak': 26, pool: 30, waves: 26, 'tumble-dryer': 25, 'toaster-oven': 26, 'pot-steam': 25,
    pot: 30, popcorn: 26, dresser: 25, seat: 26, 'audio-video': 32, projector: 32, 'remote-tv': 26,
    'television-speaker': 30, 'speaker-multiple': 30, radio: 28, 'volume-high': 26, 'router-wireless': 30,
    wifi: 26, laptop: 30, cellphone: 24, tablet: 25, watch: 24, printer: 26, 'party-popper': 26, balloon: 26,
    paw: 26, 'ev-station': 26, clock: 24, alarm: 25, 'trash-can': 24
  };
  Object.keys(PX_KIN).forEach(function (k) { if (!PX[k]) PX[k] = PX_KIN[k]; });
  // ON A FAVORITE, where the hand-written favorites drew a glyph at a size of
  // its own: the gamepad is 28 on a room tile (the Arcade) and was 24 on the
  // Roblocks favorite, beside its two-line room and name.
  var FAV_PX = { 'gamepad-variant': 24 };
  function sized(tile, over) {
    var g = String(tile.icon || '').replace(/^hk:/, '');
    var px = (over && over[g]) || PX[g];
    if (px) tile.icon_size = px + 'px';
    return tile;
  }

  // A light's glyph from what it is called -- the one place a guess is made,
  // and only between glyphs the Home app itself uses for lights.
  function lightGlyph(st, name) {
    var n = (name || '').toLowerCase();
    if (st && st.attributes && Array.isArray(st.attributes.entity_id)) return 'hk:lightbulb-group';
    if (/floor lamp/.test(n)) return 'hk:floor-lamp';
    if (/desk lamp/.test(n)) return 'hk:desk-lamp';
    if (/lamp/.test(n)) return 'hk:lamp';
    if (/chandelier/.test(n)) return 'hk:chandelier';
    if (/sconce/.test(n)) return 'hk:wall-sconce';
    if (/strip|led/.test(n)) return 'hk:led-strip-variant';
    if (/string|christmas|tree/.test(n)) return 'hk:string-lights';
    if (/recessed|can light|pot light/.test(n)) return 'hk:light-recessed';
    if (/vanity/.test(n)) return 'hk:vanity-light';
    if (/porch|outdoor|flood|landscape/.test(n)) return 'hk:outdoor-lamp';
    if (/ceiling/.test(n)) return 'hk:ceiling-light';
    return 'hk:lightbulb';
  }

  // THE TILE for one entity, or null for one this dashboard does not show.
  var TILE = {
    light: function (id, name, st) {
      return sized({ type: 'custom:hk-light-card', entity: id, name: name,
        icon: lightGlyph(st, name), icon_color: 'yellow', icon_tap_action: { action: 'toggle' } });
    },
    switch: function (id, name) {
      return sized({ type: 'custom:hk-tile-card', entity: id, name: name, icon: 'hk:power-socket-us',
        icon_color: 'yellow', label_mode: 'state', icon_tap_action: { action: 'toggle' } });
    },
    fan: function (id, name) {
      return { type: 'custom:hk-fan-card', entity: id, name: name, icon: 'hk:fan',
        icon_color: 'blue', icon_tap_action: { action: 'toggle' } };
    },
    cover: function (id, name, st) {
      var dc = st && st.attributes && st.attributes.device_class;
      if (dc === 'garage' || dc === 'gate') {
        return sized({ type: 'custom:hk-tall-card', entity: id, name: name, icon: 'hk:garage-open',
          icon_states: { closed: 'hk:garage' }, icon_color: 'mint', label_mode: 'title', view_layout: TALL });
      }
      return sized({ type: 'custom:hk-cover-card', entity: id, name: name, icon: 'hk:blinds-horizontal',
        icon_states: { closed: 'hk:blinds-horizontal-closed' }, icon_color: 'blue',
        icon_tap_action: { action: 'toggle' } });
    },
    lock: function (id, name) {
      return sized({ type: 'custom:hk-tall-card', entity: id, name: name, icon: 'hk:lock',
        icon_states: { unlocked: 'hk:lock-open-variant' }, icon_color: 'mint', label_mode: 'title',
        view_layout: TALL });
    },
    // THE DEVICE SAYS WHAT IT IS: a HomePod and a HomePod mini
    // are drawn as themselves, an Apple TV as the box (hk:homepod 36 px,
    // hk:homepod-mini 40 px, hk:apple-tv 35 px) -- read off the device's model.
    media_player: function (id, name, st, model) {
      var dc = st && st.attributes && st.attributes.device_class;
      var m = String(model || '').toLowerCase();
      // An Apple TV reads as the HomePods do -- its state, not the
      // televisions' source_first.
      if (/apple tv/.test(m)) {
        return { type: 'custom:hk-media-card', entity: id, name: name, icon: 'hk:apple-tv', icon_size: '35px',
          icon_color: 'rgba(255, 255, 255, 0.88)', bare_icon: true, bare_icon_color: 'rgba(152, 152, 157, 1)',
          well_background: 'transparent' };
      }
      if (dc === 'tv' || dc === 'receiver') {
        return sized({ type: 'custom:hk-media-card', entity: id, name: name, icon: 'hk:television',
          icon_color: TEAL, label_mode: 'source_first', icon_tap_action: { action: 'toggle' } });
      }
      // A speaker is drawn at 36 px like a HomePod, not at the 23 px
      // default.
      var mini = /homepod mini/.test(m), pod = !mini && /homepod/.test(m);
      return { type: 'custom:hk-media-card', entity: id, name: name,
        icon: mini ? 'hk:homepod-mini' : pod ? 'hk:homepod' : 'hk:speaker',
        icon_size: mini ? '40px' : '36px',
        icon_color: 'rgba(255, 255, 255, 0.85)', bare_icon: true,
        bare_icon_color: 'rgba(152, 152, 157, 1)', well_background: 'transparent' };
    },
    climate: function (id, name) {
      return { type: 'custom:hk-climate-tall-card', entity: id, name: name, icon_color: 'red',
        label_mode: 'setpoint_verb', view_layout: TALL };
    },
    water_heater: function (id, name) { return TILE.climate(id, name); },
    humidifier: function (id, name) {
      return sized({ type: 'custom:hk-tile-card', entity: id, name: name, icon: 'hk:air-humidifier',
        icon_states: { on: 'hk:air-humidifier-active' }, icon_color: 'blue', label_mode: 'humidity',
        icon_tap_action: { action: 'toggle' } });
    },
    vacuum: function (id, name) {
      return sized({ type: 'custom:hk-tall-card', entity: id, name: name, icon: 'hk:robot-vacuum',
        icon_color: 'rgba(242, 144, 105, 0.98)', bare_icon: true, well_background: 'transparent',
        label_mode: 'vacuum', view_layout: TALL });
    },
    valve: function (id, name) {
      return { type: 'custom:hk-tall-card', entity: id, name: name, icon: 'hk:spigot',
        icon_color: 'rgba(58, 134, 247, 0.98)', label_mode: 'title', view_layout: TALL };
    },
    // A COMPUTER'S WAKE-ON-LAN BUTTON: a tile that wakes it. Only the Wake
    // on LAN integration's buttons: every other button (a car's horn, an
    // energy meter's reset, a restart) is not a thing in a room (see isTileButton).
    button: function (id, name) {
      // "Office PC - Wake On Lan" is the Office PC
      name = String(name || '').replace(/\s*[-\u2013]?\s*wake[\s-]*on[\s-]*lan\s*$/i, '') || name;
      // A light's split: the GLYPH wakes it, the name opens its sheet (one
      // big Wake button and when it was last woken), as a light's glyph
      // toggles and its name opens its sheet.
      return sized({ type: 'custom:hk-tile-card', entity: id, name: name, icon: 'hk:desktop-tower',
        icon_color: 'yellow', label: 'Wake',
        tap_action: { action: 'more-info' },
        icon_tap_action: { action: 'perform-action', perform_action: 'button.press', target: { entity_id: id } } });
    },
    alarm_control_panel: function (id, name) {
      var armed = {};
      ['armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass',
       'arming', 'triggered'].forEach(function (s) { armed[s] = 'hk:alarm-light'; });
      // A tap opens the alarm's keypad sheet, as any device's tap opens its
      // sheet.
      return sized({ type: 'custom:hk-tall-card', entity: id, name: name, icon: 'hk:alarm-light-off',
        icon_states: armed, icon_color: 'mint', bare_icon: true, well_background: 'transparent',
        label_mode: 'alarm', view_layout: TALL });
    }
  };
  // THE ONE "IS THIS HIDDEN?" RULE: an excluded entity, anything on an
  // excluded device, anything in an excluded area -- read from the options
  // THIS build was given (the HK Settings page's Hidden from Screens plus the
  // dashboard's own YAML, merged in generate()). Derived per options object
  // and passed along, never kept in module state: two builds at once (the
  // editor's preview and the dashboard) cannot see each other's exclusions,
  // and a direct call (hkStrategy.rooms) uses exactly what it is given.
  var HIDES = new WeakMap();
  function hideOf(opts) {
    opts = opts || {};
    var h = HIDES.get(opts);
    if (h) return h;
    h = { entities: {}, devices: {}, areas: {}, include: {} };
    (opts.exclude_entities || []).forEach(function (e) { h.entities[e] = true; });
    (opts.exclude_devices || []).forEach(function (d) { h.devices[d] = true; });
    (opts.exclude_areas || []).forEach(function (a) { h.areas[a] = true; });
    (opts.include_entities || []).forEach(function (e) { if (!h.entities[e]) h.include[e] = true; });
    if (typeof opts === 'object') HIDES.set(opts, h);
    return h;
  }
  function areaOf(hass, id) {
    var e = (hass.entities || {})[id] || {}, devs = hass.devices || {};
    return e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id) || null;
  }
  function hidden(hass, opts, id) {
    var hide = hideOf(opts);
    if (hide.entities[id]) return true;
    var e = (hass.entities || {})[id] || {};
    if (e.device_id && hide.devices[e.device_id]) return true;
    var a = areaOf(hass, id);
    return !!(a && hide.areas[a]);
  }

  // A tile for something the house ADDED (Configure -> Also show) that has no
  // tile of its own: scenes and scripts run on a tap, buttons press, toggles
  // toggle, and anything else shows its state and opens its details.
  var ANY_ICON = { scene: 'mdi:palette', script: 'mdi:script-text-play', button: 'mdi:gesture-tap-button',
                   input_button: 'mdi:gesture-tap-button', sensor: 'mdi:eye', binary_sensor: 'mdi:checkbox-blank-circle-outline',
                   input_boolean: 'mdi:toggle-switch', automation: 'mdi:robot', person: 'mdi:account' };
  function anyTile(id, name, st) {
    var d = id.split('.')[0];
    var icon = (st && st.attributes && st.attributes.icon) || ANY_ICON[d] || 'mdi:circle-outline';
    var call = function (service) {
      return { action: 'call-service', service: service, target: { entity_id: id } };
    };
    if (d === 'scene' || d === 'script') {
      return { type: 'custom:hk-scene-card', entity: id, name: name, icon: icon, icon_color: 'white',
               elevated: true, tap_action: call(d + '.turn_on') };
    }
    if (d === 'button' || d === 'input_button') {
      return { type: 'custom:hk-scene-card', entity: id, name: name, icon: icon, icon_color: 'white',
               elevated: true, tap_action: call(d + '.press') };
    }
    var t = { type: 'custom:hk-tile-card', entity: id, name: name, icon: icon, icon_color: 'white',
              label_mode: 'state' };
    if (d === 'input_boolean' || d === 'automation') {
      t.icon_color = 'yellow';
      t.icon_tap_action = { action: 'toggle' };
    }
    return t;
  }
  // AN `hk:` ICON SET IN HOME ASSISTANT'S ENTITY SETTINGS is the tile's
  // glyph. Only `hk:`: other icons (mdi:, the Hue set's phu:) are chosen
  // for Home Assistant's own screens, and drawing them here matches the
  // Home app's tiles LESS often than the name guess (measured) -- the Home
  // app glyph of each accessory is a choice of its own (the accessory
  // settings). A chosen icon
  // is the icon in every state, as it is in Home Assistant, unless it IS the
  // tile's own default glyph.
  function ownIcon(icon) {
    var v = String(icon || '');
    return /^hk:/.test(v) ? v : null;
  }

  // ACCESSORY SETTINGS (Configure lives in each detail sheet's gear;
  // accessories.py): the house's own name and glyph for a thing,
  // what it is shown as, whether Home shows it, and each room's tile order.
  // They beat everything worked out here -- they are a person's choice.
  function accOf(id) {
    var A = setting('accessories');
    return (A && A.entities && A.entities[id]) || null;
  }
  function accName(id) {
    var a = accOf(id);
    if (!a) return null;
    var dash = dashSeg();
    return (a.names && a.names[dash]) || a.name || null;
  }
  function accIcon(id) {
    var a = accOf(id), v = a && a.icon ? String(a.icon) : '';
    return v ? (/^mdi:/.test(v) ? 'hk:' + v.slice(4) : v) : null;
  }
  // "Show as": a switch drawn as a light or a fan, a light as an outlet.
  var SHOW_GLYPH = { light: 'hk:lightbulb', fan: 'hk:fan', switch: 'hk:toggle-switch', outlet: 'hk:power-socket-us' };
  function INTO() {
    var A = setting('accessories');
    return (A && A.into && typeof A.into === 'object') ? A.into : {};
  }
  function roomOrder(area) {
    var A = setting('accessories'), list = A && A.rooms && A.rooms[area];
    return Array.isArray(list) ? list : null;
  }
  function tileFor(hass, id, name) { return stateNames(tileOf(hass, id, name), id); }
  function tileOf(hass, id, name) {
    var d = id.split('.')[0];
    var e = (hass.entities || {})[id], dv = e && e.device_id && (hass.devices || {})[e.device_id];
    var a = accOf(id), show = a && a.show_as;
    var t;
    if (show && (d === 'switch' || d === 'light' || d === 'input_boolean')) {
      // drawn as what it is shown as: a switch's tile, with that glyph and,
      // for a fan, the fans' blue
      t = TILE.switch(id, name);
      t.icon = SHOW_GLYPH[show];
      if (show === 'fan') t.icon_color = 'blue';
      if (show === 'light' && d === 'light') t = TILE.light(id, name, hass.states[id]);
      delete t.icon_size;
      sized(t);
    } else {
      // a button that is not a computer's wake is the generic pressable tile
      var fn = d === 'button' && !isTileButton(e) ? anyTile : (TILE[d] || anyTile);
      t = fn(id, name, hass.states[id], dv && dv.model);
    }
    var own = accIcon(id) || (e && ownIcon(e.icon));
    if (t && own && 'icon' in t && own !== t.icon) {
      t.icon = own;
      delete t.icon_states;
      delete t.icon_size;
      sized(t);
    }
    if (t && t.icon_size === undefined) delete t.icon_size;
    return t && a && a.size ? resized(t, a.size) : t;
  }
  // THE ACCESSORY'S SIZE (its gear, 2026-10-01): Regular or Tall, over what
  // its kind is drawn as -- a light as a tall tile, a lock as a pill. The
  // card swaps its layout (hk-tile.js `size`); the tile's cell here spans
  // two rows of the room grid, or one.
  function resized(t, size) {
    if (size !== 'tall' && size !== 'regular') return t;
    t.size = size;
    if (size === 'tall') t.view_layout = TALL;
    else delete t.view_layout;
    return t;
  }

  // Display order inside a room: what a person reaches for first.
  var ORDER = ['light', 'switch', 'fan', 'cover', 'media_player', 'climate', 'water_heater',
               'humidifier', 'lock', 'alarm_control_panel', 'vacuum', 'valve', 'button'];
  function isTileButton(e) { return !!e && e.platform === 'wake_on_lan'; }

  // "Kitchen Table Light" in the Kitchen is a "Table Light" -- the Home app
  // never repeats the room on its tiles.
  // The area's name is matched with its apostrophes folded: the area
  // registry may spell it "Emma’s Room" (curly) and the entity names
  // "Emma's Room Lamp" (straight), and unfolded the prefix would never be
  // dropped. Same length either way, so the slice below still lines up.
  function fold(v) { return String(v).toLowerCase().replace(/[’‘`]/g, "'"); }
  function shortName(full, area) {
    var n = String(full || '').trim(), a = String(area || '').trim();
    if (a && fold(n).indexOf(fold(a) + ' ') === 0 && n.length > a.length + 1) {
      n = n.slice(a.length + 1);
      n = n.charAt(0).toUpperCase() + n.slice(1);
    }
    return n;
  }

  // The FULL name ("Family Car Climate"), not the registry's short entity
  // name ("Climate"), which leaves out the device and makes two cars' climate
  // controls indistinguishable. The room prefix is then dropped by shortName.
  function nameOf(hass, id, ent) {
    var st = hass.states[id];
    return (st && st.attributes && st.attributes.friendly_name) || (ent && ent.name) || id;
  }

  function heading(name) {
    return { type: 'custom:hk-heading-card', name: name };
  }

  function titleBar(name) {
    return { type: 'custom:hk-grid-card', view_layout: COL2,
      // 20 px between the back button (and the menu button beside it) and
      // the title -- room enough that a tap meant for one cannot land on
      // the other.
      layout: { 'grid-template-columns': 'max-content minmax(0, 1fr)', 'grid-column-gap': '20px',
                'grid-row-gap': '0px', margin: '0px', padding: '10px 0px 6px 0px' },
      cards: [{ type: 'custom:hk-back-card', parents: { 'music-browse': 'playmusic' } },
              { type: 'custom:hk-heading-card', name: name, height: '44px',
                padding: '0px 0px 0px 3px', grid_rows: '44px' }] };
  }

  function column(cards, extra) {
    return Object.assign({ type: 'custom:hk-grid-card', view_layout: COL2,
      layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-column-gap': '0px',
                'grid-row-gap': '0px', margin: '0px', padding: '0px' },
      cards: cards }, extra || {});
  }

  // ------------------------------------------------------------ the house
  // area -> [entity ids] from the registries: an entity's own area, else its
  // device's. Hidden, disabled, config and diagnostic entities are left out.
  // ONE PASS OVER THE HOUSE PER BUILD. rooms() is asked once for Home and
  // once for every room page (27 times on this house), and each pass walked
  // every entity (4,195): 113k visits, ~170 ms of a tablet's generate().
  // What it sorts into rooms depends only on the build's hass and its
  // exclusions -- not on which areas one caller wants -- so a build keeps the
  // one pass in its options (`__build`, copied into every per-room options
  // object by Object.assign) and rooms() only picks and orders from it. Kept
  // per BUILD, not per hass object: a second build always looks again.
  function byArea(hass, opts) {
    var hide = hideOf(opts), into = INTO(), build = opts && opts.__build;
    var key = JSON.stringify([opts.exclude_entities || [], opts.exclude_devices || [], opts.exclude_areas || [],
                              opts.include_entities || [], into]);
    var memo = build && build.byArea;
    if (memo && memo.key === key && memo.hass === hass) return memo;
    var ents = hass.entities || {}, devs = hass.devices || {}, areas = hass.areas || {};
    var by = {}, more = [], seen = {};
    Object.keys(ents).concat(Object.keys(hide.include)).forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      var e = ents[id] || {}, dom = id.split('.')[0];
      var added = !!hide.include[id];
      if (!hass.states[id] || hidden(hass, opts, id)) return;
      if (!added && (!TILE[dom] || e.hidden || e.entity_category)) return;
      if (!added && dom === 'button' && !isTileButton(e)) return;
      var area = e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id);
      // A ROOM SHOWN AS PART OF ANOTHER (the accessories' `into`): the Deck's
      // things are the Backyard's, its section and page the Backyard's
      if (area && into[area] && areas[into[area]]) area = into[area];
      if (!area || !areas[area]) { if (added) more.push(id); return; }
      (by[area] = by[area] || []).push(id);
    });
    memo = { key: key, hass: hass, by: by, more: more };
    if (build) build.byArea = memo;
    return memo;
  }
  function rooms(hass, opts) {
    var areas = hass.areas || {}, floors = hass.floors || {};
    var hide = hideOf(opts), sorted = byArea(hass, opts);
    var by = sorted.by, more = sorted.more;
    var list = Object.keys(by);
    if (Array.isArray(opts.areas) && opts.areas.length) {
      list = opts.areas.filter(function (a) { return by[a]; });
    } else {
      var level = function (a) {
        var f = areas[a].floor_id && floors[areas[a].floor_id];
        return (f && typeof f.level === 'number') ? f.level : 1e6;
      };
      list.sort(function (x, y) {
        return (level(x) - level(y)) || String(areas[x].name).localeCompare(String(areas[y].name));
      });
    }
    var rank = function (id) {
      var i = ORDER.indexOf(id.split('.')[0]);
      return i < 0 ? ORDER.length : i;              // added kinds after the built-in ones
    };
    // BY THE NAME THE TILE SHOWS (named: the accessory's own, else the room
    // dropped), so a renamed accessory takes its new place, as on its page
    var sortIds = function (ids, area) {
      var key = {};
      ids.forEach(function (x) { key[x] = named(hass, x, area || ''); });
      return ids.slice().sort(function (x, y) {
        return (rank(x) - rank(y)) || key[x].localeCompare(key[y]);
      });
    };
    // A ROOM'S OWN ORDER (the accessories' room order): the ones it lists,
    // in its order, then the rest as usual.
    // A room shown inside it (the accessories' `into`) brings its own order
    // along, after the room's -- or the Deck's lights would stay in the
    // Backyard's automatic order.
    var inOrder = function (a, ids, inside) {
      var own = null;
      [a].concat(inside || []).forEach(function (r) {
        var o = roomOrder(r);
        if (o) own = (own || []).concat(o.filter(function (x) { return !own || own.indexOf(x) < 0; }));
      });
      if (!own) return sortIds(ids, areas[a].name);
      var rankOf = {};
      own.forEach(function (x, i) { rankOf[x] = i; });
      var listed = ids.filter(function (x) { return x in rankOf; })
                      .sort(function (x, y) { return rankOf[x] - rankOf[y]; });
      return listed.concat(sortIds(ids.filter(function (x) { return !(x in rankOf); }), areas[a].name));
    };
    var out = list.filter(function (a) { return !hide.areas[a]; }).map(function (a) {
      var inside = Object.keys(INTO()).filter(function (x) { return INTO()[x] === a; });
      return { id: a, name: areas[a].name, entities: inOrder(a, by[a], inside), areas: [a].concat(inside) };
    });
    if (more.length) out.push({ id: '', name: 'More', entities: sortIds(more) });
    return out;
  }

  // THE NAME A TILE SHOWS: the accessory's own (its gear), else the entity's
  // with the room's name dropped ("Kitchen Table Light" -> "Table Light").
  function named(hass, id, area) {
    return accName(id) || shortName(nameOf(hass, id, (hass.entities || {})[id]), area);
  }
  function roomSection(hass, room) {
    // "Show in Home" off (the accessory's gear): not on Home -- its room's
    // page and the category pages still list it, as the Home app does.
    var tiles = room.entities.filter(function (id) {
      var a = accOf(id);
      return !(a && a.home === false);
    }).map(function (id) {
      return placed(tileFor(hass, id, named(hass, id, room.name)), room.id ? { area: room.id } : null);
    }).filter(Boolean);
    var head = heading(room.name);
    if (room.id) head.area = room.id;         // "Living Room ›" when it has a page
    return { type: 'grid', columns: 1, square: false, view_layout: COL2,
             cards: [head, { type: 'custom:hk-grid-card', layout: GRID, cards: tiles }] };
  }

  // WHERE A TILE LIVES, for Arrange in its sheet's settings (hk-detail.js,
  // 2026-10-01): a room section on Home ({area}), a group on a room page
  // ({area, group}) or the Favorites ({fav: true}). The order it moves in
  // is the room's Tile Order (accessories `rooms`) or the screen's
  // favorites. A tile with none (a category page's) has no Arrange.
  function placed(t, place) {
    if (t && place) t.hk_place = place;
    return t;
  }

  // ------------------------------------------------------------ room pages
  // A ROOM PAGE, the Home app's: the room's name under a back button, its
  // status row, its cameras, then its devices grouped as the Home app groups
  // them -- Climate, Lights, Speakers & TVs, Security, Water, Other. Lights
  // run A to Z (as the Home app lists them); every other group keeps the
  // room's own order. `areas` may be several (a backyard and its deck).
  var GROUPS = ['Climate', 'Lights', 'Speakers & TVs', 'Security', 'Water', 'Other'];
  var DOORS = { garage: 1, gate: 1, door: 1 };
  function groupOf(hass, id) {
    var d = id.split('.')[0], st = hass.states[id];
    var dc = st && st.attributes && st.attributes.device_class;
    if (d === 'valve' || d === 'water_heater') return 'Water';
    if (d === 'fan' || d === 'climate' || d === 'humidifier' || (d === 'cover' && !DOORS[dc])) return 'Climate';
    if (d === 'light') return 'Lights';
    if (d === 'media_player') return 'Speakers & TVs';
    if (d === 'lock' || d === 'alarm_control_panel' || d === 'cover') return 'Security';
    return 'Other';
  }
  function roomCameras(hass, areas, opts) {
    var want = {};
    areas.forEach(function (a) { want[a] = true; });
    return houseCameras(hass, opts, function (id) { return want[areaOf(hass, id)]; });
  }

  // THE HOUSE'S CAMERAS, ONE TILE PER CAMERA. A UniFi Protect
  // camera offers the same picture as three camera entities -- its high,
  // medium and low resolution channels -- so a room page listing every
  // camera entity in the area would give a front yard 14 tiles for 5
  // cameras. And two kinds of "camera" are not the house's at all: a wall
  // tablet's own front camera (Fully Kiosk) and Live TV's channels (the
  // Live TV page).
  //
  // One per DEVICE, picked in this order: the one this screen lists for its
  // strip, one any screen lists, a low-resolution channel (a still refreshes
  // faster from it), then A to Z. The
  // screen's own list also sets the order; the rest follow A to Z.
  // not the house's cameras: a wall tablet's own, and Live TV's channels
  // (HK Frontend's only cameras; hk_tv before 1.0)
  var NOT_HOUSE_CAMERAS = { fully_kiosk: 1, hk_frontend: 1, hk_tv: 1 };
  function houseCameras(hass, opts, pred) {
    var ents = hass.entities || {};
    var mine = listOf((opts && opts.board) || {}, 'cameras');
    var anyList = {}, boards = setting('boards') || {};
    Object.keys(boards).forEach(function (k) {
      listOf(boards[k] || {}, 'cameras').forEach(function (id) { anyList[id] = true; });
    });
    var byDev = {}, devs = [];
    shown(hass, opts, 'camera').forEach(function (id) {
      var e = ents[id] || {};
      if (NOT_HOUSE_CAMERAS[e.platform] || (pred && !pred(id))) return;
      var d = e.device_id || id;
      if (!byDev[d]) { byDev[d] = []; devs.push(d); }
      byDev[d].push(id);
    });
    function score(id) {
      var i = mine.indexOf(id);
      if (i >= 0) return i;
      if (anyList[id]) return 1000;
      return /low/.test(id) ? 2000 : 3000;
    }
    var picked = devs.map(function (d) {
      return byDev[d].slice().sort(function (a, b) { return score(a) - score(b) || (a < b ? -1 : 1); })[0];
    });
    return picked.sort(function (a, b) {
      var x = mine.indexOf(a), y = mine.indexOf(b);
      if (x < 0) x = Infinity;
      if (y < 0) y = Infinity;
      return x - y || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
  function roomCards(hass, areas, name, opts) {
    areas = [].concat(areas || []).filter(Boolean);
    var ents = hass.entities || {}, seen = {}, groups = {};
    rooms(hass, Object.assign({}, opts, { areas: areas })).forEach(function (r) {
      if (!r.id) return;                        // "More" is not a room
      r.entities.forEach(function (id) {
        if (seen[id]) return;
        seen[id] = true;
        var g = groupOf(hass, id);
        (groups[g] = groups[g] || []).push(placed(tileFor(hass, id, named(hass, id, name)), { area: areas[0], group: g }));
      });
    });
    // Lights A to Z -- unless the room has an order of its own (the gear)
    var ordered = areas.some(function (a) { return roomOrder(a); });
    if (groups.Lights && !ordered) {
      groups.Lights.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }
    // the status row counts the accessories ON THIS PAGE (hk-room.js `entities`)
    var cards = [titleBar(name),
      { type: 'custom:hk-room-status-card', area: areas.length === 1 ? areas[0] : areas,
        entities: Object.keys(seen), view_layout: COL2 }];
    // THE CAMERAS AS SNAPSHOTS, ONE TILE EACH: a still that
    // refreshes, never a live stream, and no mosaic -- in one row that
    // scrolls sideways, three showing on a tablet, two on an iPad held
    // upright, one and a bit on a phone (--hk-cam-row, hk-responsive.css).
    // A tap opens the camera, as any camera card does.
    var cams = roomCameras(hass, areas, opts);
    if (cams.length) {
      cards.push({ type: 'grid', columns: 1, square: false, view_layout: COL2, cards: [heading('Cameras'),
        // the row reaches out by the tiles' shadow and pads it back inside,
        // as the scenes row does (a scroller clips at its own edge); 26 at the
        // sides lines the first camera up with the tiles, which sit 4 px in
        { type: 'custom:hk-row-card', gap: 12, pad_top: 14, pad_bottom: 30, pad_left: 26, pad_right: 26,
          margin: '-14px -22px -30px -22px',
          card_width: 'calc((100% - (var(--hk-cam-row, 3) - 1) * 12px) / var(--hk-cam-row, 3))',
          cards: cams.map(function (id) {
            return { type: 'picture-entity', entity: id, camera_view: 'auto', show_name: false,
                     show_state: false, aspect_ratio: '16x9', fit_mode: 'cover' };
          }) }] });
    }
    // THE ROOM'S SCENES (2026-10-01): a row of scene pills under the status
    // row -- under the cameras when it has some -- that scrolls sideways, as
    // Home's does (hk-scenes-card in room mode). Each room's own (HK Settings
    // -> Accessories -> the room -> Scenes): its own list, none, or
    // Automatic -- the Home Assistant scenes in the room.
    var scenes = roomScenes(hass, areas, opts);
    if (scenes.length) cards.push({ type: 'custom:hk-scenes-card', room: true, scenes: scenes, view_layout: COL2 });
    GROUPS.forEach(function (g) { if (groups[g]) cards.push(section(g, groups[g])); });
    return cards;
  }
  // A ROOM'S SCENES: the lists its areas have of their own (the Deck's
  // after the Backyard's), else every shown scene in them, A to Z. A list
  // that is empty is a room with no row.
  function roomScenes(hass, areas, opts) {
    var A = setting('accessories'), own = (A && A.scenes && typeof A.scenes === 'object') ? A.scenes : {};
    var mine = areas.filter(function (a) { return Array.isArray(own[a]); });
    if (mine.length) {
      var out = [];
      mine.forEach(function (a) {
        own[a].forEach(function (id) { if (out.indexOf(id) < 0 && hass.states[id] && !hidden(hass, opts, id)) out.push(id); });
      });
      return out;
    }
    var want = {};
    areas.forEach(function (a) { want[a] = true; });
    var st = hass.states;
    return shown(hass, opts, 'scene', null).filter(function (id) { return want[areaOf(hass, id)]; })
      .sort(function (x, y) {
        return String(st[x].attributes.friendly_name || x).localeCompare(String(st[y].attributes.friendly_name || y));
      });
  }
  function slug(v) {
    return String(v || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function firstOf(hass, domain) {
    return Object.keys(hass.states).filter(function (k) { return k.indexOf(domain + '.') === 0; }).sort()[0] || null;
  }

  function setting(path) {
    var HS = window.hkSettings;
    return HS ? HS.get(path, null) : null;
  }
  // THE THEME a generated view wears: HK Kiosk when it is loaded, else the
  // house's default
  function kioskTheme(themes) {
    return themes && themes['HK Kiosk'] ? 'HK Kiosk' : undefined;
  }
  // a feature of HK Frontend added and set up (the settings feed's `added`)
  function added(kind) {
    var a = setting('added');
    return Array.isArray(a) && a.indexOf(kind) >= 0;
  }

  // Every shown entity of a domain (same rules as the rooms: not hidden, not a
  // config/diagnostic entity, has a state), optionally filtered, sorted by id.
  // The house's entity ids by domain, once per build (as byArea): shown() is
  // asked for a dozen domains and each call walked every state.
  function idsOf(hass, opts, domain) {
    var build = opts && opts.__build, idx = build && build.hass === hass ? build.domains : null;
    if (!idx) {
      idx = {};
      Object.keys(hass.states).forEach(function (id) {
        var d = id.split('.')[0];
        (idx[d] = idx[d] || []).push(id);
      });
      if (build) { build.domains = idx; build.hass = hass; }
    }
    return idx[domain] || [];
  }
  function shown(hass, opts, domain, pred) {
    var ents = hass.entities || {};
    return idsOf(hass, opts, domain).filter(function (id) {
      var e = ents[id] || {};
      if (e.hidden || e.entity_category || hidden(hass, opts, id)) return false;
      return !pred || pred(hass.states[id]);
    }).sort();
  }
  function dc(st) { return st && st.attributes && st.attributes.device_class; }

  // A sensor on the same DEVICE with this device_class -- a vacuum's battery.
  function sibling(hass, id, deviceClass) {
    var ents = hass.entities || {}, dev = ents[id] && ents[id].device_id;
    if (!dev) return null;
    var hit = Object.keys(ents).filter(function (k) {
      return k !== id && ents[k].device_id === dev && k.indexOf('sensor.') === 0 &&
             dc(hass.states[k]) === deviceClass;
    }).sort();
    return hit[0] || null;
  }

  // A sensor on the same device whose entity id matches -- a vacuum's
  // current room, its cleaning progress, its dock error.
  function siblingLike(hass, id, re, not) {
    var ents = hass.entities || {}, dev = ents[id] && ents[id].device_id;
    if (!dev) return null;
    return Object.keys(ents).filter(function (k) {
      return k !== id && ents[k].device_id === dev && k.indexOf('sensor.') === 0 && hass.states[k] &&
             re.test(k) && !(not && not.test(k));
    }).sort()[0] || null;
  }
  function friendly(hass, id, area) {
    var ents = hass.entities || {}, areas = hass.areas || {}, devs = hass.devices || {};
    var e = ents[id] || {};
    var a = e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id);
    return accName(id) || shortName(nameOf(hass, id, e), area || (a && areas[a] && areas[a].name));
  }

  // --------------------------------------------------------- what exists
  // One pass over the house, shared by the chips, the pages and the header.
  //
  // WHAT COUNTS FIRST (kinds.py): the integration resolves each
  // kind for the whole house -- the chips read the same lists -- and this
  // keeps the ones this dashboard shows (its own YAML may leave out more).
  // Before the integration has answered, the rules below.
  function inventory(hass, opts) {
    var K = setting('kinds') || {};
    if (K && typeof K === 'object' && Object.keys(K).length) {
      var mine = function (kind) {
        return (Array.isArray(K[kind]) ? K[kind] : []).filter(function (id) {
          return hass.states[id] && !hidden(hass, opts, id);
        });
      };
      var gar = mine('garage');
      return { lights: mine('lights'), climates: mine('thermostats'), fans: mine('fans'),
               blinds: mine('blinds'), locks: mine('locks'), doors: mine('doors'), windows: mine('windows'),
               garage: gar, vacuums: mine('vacuums'), timers: mine('timers'), speakers: mine('speakers'),
               leaks: mine('leaks') };
    }
    var sec = window.hkSettings ? window.hkSettings.get('security', {}) : {};
    var has = function (l) { return Array.isArray(l) && l.length; };
    var keep = function (l) { return l.filter(function (id) { return !hidden(hass, opts, id); }); };
    var contact = function (kind) {
      return function (st) { return dc(st) === kind; };
    };
    return {
      leaks: shown(hass, opts, 'binary_sensor', contact('moisture')),
      lights: shown(hass, opts, 'light'),
      climates: (function () {
        var t = window.hkSettings ? window.hkSettings.get('features.thermostats', []) : [];
        return has(t) ? keep(t).filter(function (id) { return hass.states[id]; }) : shown(hass, opts, 'climate');
      })(),
      fans: shown(hass, opts, 'fan'),
      blinds: shown(hass, opts, 'cover', function (st) {
        var d = dc(st);
        return d !== 'garage' && d !== 'gate' && d !== 'door';
      }),
      locks: has(sec.locks) ? keep(sec.locks) : shown(hass, opts, 'lock'),
      doors: has(sec.doors) ? keep(sec.doors) : shown(hass, opts, 'binary_sensor', contact('door')),
      windows: has(sec.windows) ? keep(sec.windows) : shown(hass, opts, 'binary_sensor', contact('window')),
      garage: has(sec.garage) ? keep(sec.garage) : shown(hass, opts, 'cover', function (st) {
        return dc(st) === 'garage' || dc(st) === 'gate';
      }),
      vacuums: shown(hass, opts, 'vacuum'),
      timers: shown(hass, opts, 'timer'),
      speakers: shown(hass, opts, 'media_player', function (st) { return dc(st) !== 'tv' && dc(st) !== 'receiver'; })
    };
  }

  // ------------------------------------------------------------- the views
  // Climate summaries and their open sheets share these exact lists. The
  // server resolves What counts; before it answers, prefer related sensors
  // and then a room's thermostat, never every temperature sensor in a house.
  function climateMembers(hass, o) {
    o = o || {};
    var K = setting('kinds') || {}, A = hass.areas || {}, st = hass.states || {};
    var G = setting('generated') || {}, cl = setting('climate') || {};
    var opts = {};
    ['exclude_entities', 'exclude_devices', 'exclude_areas'].forEach(function (k) {
      opts[k] = [].concat(G[k] || [], o[k] || [], k === 'exclude_areas' ? cl.exclude_areas || [] : []);
    });
    function visible(id) {
      var e = (hass.entities || {})[id] || {}, own = accOf(id) || {};
      return st[id] && !e.hidden && !e.entity_category && !e.disabled_by && own.status !== false &&
        !Array.isArray(st[id].attributes.entity_id) && !hidden(hass, opts, id);
    }
    function reading(k) {
      if (Array.isArray(K[k])) return K[k].filter(function (id) { return st[id] && !hidden(hass, opts, id); });
      var ids = [];
      Object.keys(A).forEach(function (a) {
        if (opts.exclude_areas.indexOf(a) >= 0) return;
        var id = A[a][k + '_entity_id'];
        if (id) { if (visible(id)) ids.push(id); return; }
        Object.keys(st).forEach(function (eid) {
          if (eid.indexOf('climate.') === 0 && areaOf(hass, eid) === a &&
              ('current_' + k) in st[eid].attributes && visible(eid)) ids.push(eid);
        });
      });
      return ids.filter(function (id, i) { return ids.indexOf(id) === i; }).sort();
    }
    function accessories(k, d) {
      if (Array.isArray(K[k])) return K[k].filter(function (id) { return st[id] && !hidden(hass, opts, id); });
      return Object.keys(st).filter(function (id) {
        return id.indexOf(d + '.') === 0 && visible(id) && (k !== 'blinds' ||
          ['awning', 'blind', 'curtain', 'shade', 'shutter', 'window', undefined].indexOf(dc(st[id])) >= 0);
      }).sort();
    }
    return { temperature: reading('temperature'), humidity: reading('humidity'),
             blinds: accessories('blinds', 'cover'), fans: accessories('fans', 'fan') };
  }

  // ------------------------------------------------------------ the chips
  // hk-chips-card (hk-chip.js): the kinds from What counts, in this
  // dashboard's order.

  // ------------------------------------------------------- category pages
  function section(name, tiles) {
    return { type: 'grid', columns: 1, square: false, view_layout: COL2,
             cards: [heading(name), { type: 'custom:hk-grid-card', layout: GRID, cards: tiles }] };
  }
  // Pages that MIX rooms (doors, locks, thermostats, timers) keep the full
  // name: under no room heading, "Door" twice says nothing.
  // THE NAME ON A PAGE THAT MIXES ROOMS (Security, Doors & Windows, Climate):
  // the entity's full name -- or the accessory's, which is room-relative the
  // way a room's tiles are ("Lock"), so the room goes in front unless it is
  // already there ("Crawl Space Lock", "Front Door Lock").
  function fullName(hass, id) {
    var own = accName(id);
    if (!own) return nameOf(hass, id, (hass.entities || {})[id]);
    var room = areaName(hass, id);
    return room && fold(own).indexOf(fold(room)) < 0 ? room + ' ' + own : own;
  }
  // A door, window or garage sensor: its open glyph, and its closed one
  // while shut. A glyph picked in its gear brings its own pair (a door into
  // the garage drawn as a garage); one with no pair is drawn in
  // both states.
  var CONTACT_PAIRS = {
    'door-closed': ['hk:door-open', 'hk:door-closed'], 'door-open': ['hk:door-open', 'hk:door-closed'],
    'window-closed-variant': ['hk:window-open-variant', 'hk:window-closed-variant'],
    'window-open-variant': ['hk:window-open-variant', 'hk:window-closed-variant'],
    garage: ['hk:garage-open', 'hk:garage'], 'garage-open': ['hk:garage-open', 'hk:garage'],
    'garage-variant': ['hk:garage-open-variant', 'hk:garage-variant'],
    'garage-open-variant': ['hk:garage-open-variant', 'hk:garage-variant'],
    'window-closed': ['hk:window-open', 'hk:window-closed'], 'window-open': ['hk:window-open', 'hk:window-closed'],
    'door-sliding': ['hk:door-sliding-open', 'hk:door-sliding'],
    'door-sliding-open': ['hk:door-sliding-open', 'hk:door-sliding'],
    gate: ['hk:gate-open', 'hk:gate'], 'gate-open': ['hk:gate-open', 'hk:gate']
  };
  function contactGlyphs(id, open, closed) {
    var own = accIcon(id);
    if (!own) return [open, closed];
    var p = CONTACT_PAIRS[own.replace(/^hk:/, '')];
    return p ? p.slice() : [own, own];
  }
  function contactTile(hass, id, open, closed) {
    var g = contactGlyphs(id, open, closed), room = areaName(hass, id);
    var t = { type: 'custom:hk-favorite-card', entity: id, name: named(hass, id, room), room: room, icon: g[0],
              icon_color: 'red', label_mode: 'open_closed' };
    if (g[1] !== g[0]) t.icon_states = { off: g[1] };
    return sized(t);
  }
  // A CATEGORY PAGE'S OWN ORDER (the accessories' `pages`, set on the
  // HK Settings page -- the Vacuums, Security's locks): the ones it lists, in its order,
  // then the rest as they were.
  function ownOrder(page, ids) {
    var A = setting('accessories'), list = A && A.pages && A.pages[page];
    if (!Array.isArray(list) || !list.length) return ids;
    var rank = {};
    list.forEach(function (x, i) { rank[x] = i; });
    return ids.filter(function (x) { return x in rank; }).sort(function (x, y) { return rank[x] - rank[y]; })
      .concat(ids.filter(function (x) { return !(x in rank); }));
  }
  // Rooms, keeping only the entities `keep` accepts; empty rooms drop out.
  // THE PAGES' ROOMS IN THIS DASHBOARD'S ROOM ORDER when its item asks
  // (Home -> Rooms -> Rooms on pages: In room order); else floor by floor, A
  // to Z, as rooms() lists them. A room not in the order keeps its place
  // after those that are -- HkGridView.roomOrder's rule for Home.
  function pageOrder(list, opts) {
    var b = opts.board || {};
    var order = b.page_rooms === 'order' && Array.isArray(b.room_order) ? b.room_order : [];
    if (!order.length) return list;
    var rank = {};
    order.forEach(function (a, i) { if (!(a in rank)) rank[a] = i; });
    return list.map(function (r, i) { return { r: r, k: r.id in rank ? rank[r.id] : order.length, i: i }; })
      .sort(function (x, y) { return x.k - y.k || x.i - y.i; }).map(function (x) { return x.r; });
  }
  function roomsWith(hass, opts, keep) {
    return pageOrder(rooms(hass, opts).map(function (r) {
      return { id: r.id, name: r.name, entities: r.entities.filter(keep) };
    }).filter(function (r) { return r.entities.length; }), opts);
  }
  function roomTiles(hass, r) {
    return r.entities.map(function (id) {
      return tileFor(hass, id, friendly(hass, id, r.name));
    });
  }
  // WHAT ITS STATES ARE CALLED (the accessory's On Says / Off Says):
  // "Blocked" / "Allowed" in place of On / Off on a switch or
  // helper's tile and favorite (a light keeps its brightness). Only the
  // words: whether it is lit is still its state.
  function stateNames(t, id) {
    var a = accOf(id) || {};
    if (!t || (!a.on_text && !a.off_text) || !/^(switch|input_boolean)\./.test(id)) return t;
    t.label_map = Object.assign({}, t.label_map || {}, a.on_text ? { on: a.on_text } : {}, a.off_text ? { off: a.off_text } : {});
    return t;
  }

  function categoryPages(hass, opts, inv, view) {
    var out = [];
    var dom = function (list) { return function (id) { return list.indexOf(id.split('.')[0]) !== -1; }; };
    if (inv.lights.length) {
      // What counts' lights -- which may be an outlet the house thinks of as
      // a light -- room by room, as the chip counts them.
      var lit = {};
      inv.lights.forEach(function (id) { lit[id] = true; });
      // LIGHTS & OUTLETS when What counts has an outlet (a switch) among the
      // lights; "Lights" in the menu
      var outlets = inv.lights.some(function (id) { return id.split('.')[0] !== 'light'; });
      var ltitle = outlets ? 'Lights & Outlets' : 'Lights';
      out.push(view({ title: ltitle, menu_title: outlets ? 'Lights' : undefined, icon: 'mdi:lightbulb', path: 'lights',
        subview: true, sky_variant: 'lights',
        background: '#1c1608', cards: [titleBar(ltitle)].concat(
          roomsWith(hass, opts, function (id) { return !!lit[id]; }).map(function (r) {
            return section(r.name, roomTiles(hass, r)); })) }));
    }
    var climateSources = climateMembers(hass, opts);
    if (inv.climates.length || inv.fans.length || inv.blinds.length ||
        climateSources.temperature.length || climateSources.humidity.length) {
      // THE CLIMATE PAGE: the rooms' fans, humidifiers and blinds on
      // the left, the thermostats on a rail to the right (--hk-page-split
      // stacks them on a narrow page), both stacks top-aligned.
      var blinds = {};
      inv.blinds.forEach(function (b) { blinds[b] = 1; });
      var stack = function (cards) {
        return { type: 'custom:hk-grid-card', cards: cards,
          layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-rows': 'min-content',
                    'place-content': 'start stretch', 'grid-row-gap': '0px', margin: '0px', padding: '0px' } };
      };
      var left = [];
      roomsWith(hass, opts, function (id) {
        var d = id.split('.')[0];
        return d === 'fan' || d === 'humidifier' || (d === 'cover' && blinds[id]);
      }).forEach(function (r) {
        left.push(heading(r.name));
        left.push({ type: 'custom:hk-grid-card', cards: roomTiles(hass, r),
          layout: Object.assign({}, GRID, { padding: '0px 0px 19px 0px' }) });
      });
      var right = [];
      if (inv.climates.length) {
        right.push(heading('Thermostats'));
        right.push({ type: 'custom:hk-grid-card',
          layout: { 'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 340px), 364px))', 'grid-auto-rows': 'min-content',
                    // The heading and dials share their left edge even when
                    // this rail has spare width before a second dial fits.
                    'place-content': 'start start', 'grid-column-gap': '16px', 'grid-row-gap': '16px', margin: '0px 0px 16px 0px', padding: '0px' },
          cards: inv.climates.map(function (id) {
            return { type: 'custom:hk-thermostat-card', entity: id, name: fullName(hass, id) };
          }) });
      }
      var body = left.length && right.length
        ? { type: 'custom:hk-grid-card', cards: [stack(left), stack(right)],
            layout: { 'grid-template-columns': 'var(--hk-page-split, minmax(0, 1fr) var(--hk-climate-dials, 364px))',
                      'grid-column-gap': '28px', 'grid-row-gap': '0px', margin: '0px', padding: '0px' } }
        : stack(left.length ? left : right);
      var cards = [titleBar('Climate'), { type: 'custom:hk-climate-status-card', view_layout: COL2,
        exclude_entities: opts.exclude_entities, exclude_devices: opts.exclude_devices, exclude_areas: opts.exclude_areas }];
      if (left.length || right.length) cards.push(column([body]));
      out.push(view({ title: 'Climate', icon: 'mdi:home-thermometer', path: 'climate', subview: true, sky_variant: 'climate',
                      background: '#0d1a1c', cards: cards }));
    }
    // DOORS & WINDOWS: the doors and the windows -- not the locks and the
    // garage door, which are Security's. Each tile carries its room as a
    // line above its name,
    // as the favorites do, so a name stays the accessory's own ("Left
    // Window", "Entry") however many rooms the page mixes.
    if (inv.doors.length || inv.windows.length) {
      var dw = [titleBar('Doors & Windows')];
      if (inv.doors.length) dw.push(section('Doors', inv.doors.map(function (id) { return contactTile(hass, id, 'hk:door-open', 'hk:door-closed'); })));
      if (inv.windows.length) dw.push(section('Windows', inv.windows.map(function (id) { return contactTile(hass, id, 'hk:window-open-variant', 'hk:window-closed-variant'); })));
      out.push(view({ title: 'Doors & Windows', icon: 'mdi:window-closed-variant', path: 'doors-windows', subview: true, sky_variant: 'doors',
                      background: '#1c0e10', cards: dw }));
    }
    if (inv.timers.length) {
      // THE TIMERS PAGE: with the quick timers (helpers/quick_timers.yaml)
      // the whole page -- presets, what is running, the New Timer keypad;
      // without them, what is running.
      var quick = !!hass.states['script.quick_timer_start'];
      var slots = ['timer.quick_1', 'timer.quick_2', 'timer.quick_3', 'timer.quick_4'];
      var tlist = [];
      if (quick) slots.forEach(function (id, i) {
        if (!hass.states[id]) return;
        var t = { entity: id, label: 'Quick Timer ' + (i + 1), glyph: 'mdi:timer-outline' };
        if (hass.states['input_text.quick_timer_' + (i + 1) + '_name']) t.label_entity = 'input_text.quick_timer_' + (i + 1) + '_name';
        tlist.push(t);
      });
      // ONE NAME PER TIMER on this page, in the running list and the house
      // row alike: "Nap - Timer" is a Nap under a Timers heading, as a tile
      // drops its room's name (the accessory's own name wins).
      var timerName = function (id) {
        var at = hass.states[id].attributes || {};
        return accName(id) || String(at.friendly_name || id).replace(/\s*[-\u2013]?\s*timer\s*$/i, '') ||
          fullName(hass, id);
      };
      // THE HOUSE TIMERS (Configure -> Your home -> House timers): one tap
      // each, named and pictured as the timers themselves are -- and first in
      // the running list, in their own order, as the hand-written page had them.
      var houseIds = (setting('features.house_timers') || []).filter(function (id) { return hass.states[id]; });
      var running = inv.timers.filter(function (id) { return !(quick && slots.indexOf(id) >= 0); });
      houseIds.filter(function (id) { return running.indexOf(id) >= 0; })
        .concat(running.filter(function (id) { return houseIds.indexOf(id) < 0; }))
        .forEach(function (id) {
          var ent = (hass.entities || {})[id] || {};
          tlist.push({ entity: id, label: timerName(id),
                       glyph: ent.icon || (hass.states[id].attributes || {}).icon || 'hk:timer-sand' });
        });
      var house = houseIds.map(function (id) {
        var ent = (hass.entities || {})[id] || {}, at = hass.states[id].attributes || {};
        return { entity: id, name: timerName(id), icon: accIcon(id) || ent.icon || at.icon || 'mdi:timer-outline' };
      });
      var tcard = quick
        ? { type: 'custom:hk-timers-page-card', tint: 'rgba(255, 159, 10, 0.95)', empty_text: 'Nothing is running.',
            presets: [5, 10, 15, 20, 30, 60], name_chips: ['Pasta', 'Oven', 'Laundry', 'Tea', 'Kids', 'Break'],
            house: house, timers: tlist }
        : { type: 'custom:hk-timers-card', tint: 'rgba(255, 159, 10, 0.95)', empty_text: 'Nothing is running.',
            timers: tlist };
      out.push(view({ title: 'Timers', icon: 'mdi:timer-sand', path: 'timers', subview: true, sky_variant: 'timers',
        background: '#1e1408', cards: [titleBar('Timers'), column([tcard])] }));
    }
    if (inv.vacuums.length) {
      // THE VACUUMS PAGE: the vacuums in a column, each with the readings its
      // own device has; Clean by Area on the rail when Clean Areas is set up.
      // In the page's own order (the HK Settings page's drag list), the
      // rest after it.
      var vcols = ownOrder('vacuums', inv.vacuums).map(function (id, i) {
        var v = { type: 'custom:hk-vacuum-card', entity: id };
        var bat = sibling(hass, id, 'battery');
        if (bat) v.battery = bat;
        var find = function (re, not) { return siblingLike(hass, id, re, not); };
        var err = find(/operational_error|_error$/, /dock/);
        if (err) v.error = err;
        var dock = find(/dock.*error/);
        if (dock) v.dock_error = dock;
        var room = find(/current_room/);
        if (room) v.room = room;
        var prog = find(/cleaning_progress/);
        if (prog) v.progress = prog;
        return { type: 'custom:hk-grid-card', cards: [v],
          layout: { 'grid-template-columns': 'var(--hk-col-fill, 460px)', 'grid-auto-rows': 'minmax(200px, auto)',
                    'grid-column-gap': '16px', 'grid-row-gap': '4px', margin: (i ? '10px' : '0px') + ' 0px 4px 0px',
                    padding: '0px' } };
      });
      var vstack = { type: 'custom:hk-grid-card', cards: vcols,
        layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-rows': 'min-content', 'grid-row-gap': '0px',
                  margin: '0px', padding: '0px' } };
      // CLEAN BY AREA: the picker's rooms are Clean Areas': the
      // ones a vacuum's room map reaches, or those chosen on HK Settings
      // -> Clean by Area -- asked live by the card, so a change there reaches
      // an open screen, and an area no vacuum reaches is not offered.
      var vbody = (added('clean_areas') && inv.vacuums.length)
        ? { type: 'custom:hk-grid-card',
            layout: { 'grid-template-columns': 'var(--hk-page-split, minmax(0, 460px) minmax(var(--hk-rail, 0px), 1fr))',
                      'grid-column-gap': '28px', 'grid-row-gap': '0px', margin: '0px', padding: '0px' },
            cards: [vstack, { type: 'custom:hk-grid-card',
              layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-rows': 'min-content',
                        'grid-row-gap': '0px', margin: '0px', padding: '0px' },
              cards: [heading('Clean Areas'), { type: 'custom:hk-area-select-card' }] }] }
        : vstack;
      out.push(view({ title: 'Vacuums', icon: 'mdi:robot-vacuum', path: 'vacuums', subview: true, sky_variant: 'vacuums',
        background: '#170f14', cards: [titleBar('Vacuums'), column([vbody])] }));
    }
    return out;
  }

  // IS MUSIC SET UP? Asked of the feature itself, once; if it is not
  // installed the subscribe is refused, which answers no. The page's own
  // hkMusic has not been handed its configuration yet when a dashboard is
  // generated (no card has attached it), so it cannot say.
  function musicConfigured(hass) {
    return new Promise(function (resolve) {
      var conn = hass && hass.connection, done = false, unsub = null;
      // an unsubscribe the server refuses (the socket reconnected meanwhile)
      // is not an error: never an uncaught rejection
      var end = function (u) { var r = u(); if (r && r.catch) r.catch(function () {}); };
      function finish(v) {
        if (done) return;
        done = true;
        if (unsub) end(unsub);
        resolve(v);
      }
      if (!conn || typeof conn.subscribeMessage !== 'function') return finish(false);
      // THE BOUND STARTS NOW, not once the subscribe is accepted: on a
      // connection that is down, that acceptance waits for the reconnect.
      setTimeout(function () { finish(false); }, 4000);
      conn.subscribeMessage(function (ev) {
        finish(!!(ev && ev.configured && ev.speakers && ev.speakers.length));
      }, { type: 'hk_music/subscribe' }).then(function (u) {
        unsub = u;
        if (done) end(u);
      }, function () { finish(false); });
    });
  }

  // ------------------------------------------------ this dashboard's item
  // Its Home and Pages settings (1.7): the item under Dashboards whose url
  // path is this one. None: every default.
  function dashSeg() {
    try { return String(location.pathname).split('/')[1] || ''; } catch (e) { return ''; }
  }
  function boardOf(seg) {
    var all = setting('boards') || {};
    var b = all[seg === undefined ? dashSeg() : seg];
    return (b && typeof b === 'object') ? b : {};
  }
  function listOf(b, k) { return Array.isArray(b[k]) ? b[k] : []; }

  // THE CAMERA STRIP: its measured structure and numbers
  // (one live tile, the rest stills, in a mosaic that scrolls), inside the
  // per-dashboard wrapper that sets the nesting depth the rows align by.
  function cameraStrip(hass, opts, b, page) {
    if (b.camera_strip === false) return null;
    var ids = listOf(b, 'cameras').length ? listOf(b, 'cameras').filter(function (id) { return hass.states[id]; })
                                          : houseCameras(hass, opts);
    ids = ids.filter(function (id) { return !hidden(hass, opts, id); });
    if (!ids.length) return null;
    var head = heading('Cameras');
    if (page) head.navigation_path = './cameras';
    return { type: 'grid', columns: 1, square: false, view_layout: COL2, cards: [
      { type: 'grid', columns: 1, square: false, cards: [head, {
        type: 'custom:hk-grid-card',
        layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-flow': 'row', 'grid-column-gap': '12px',
                  'grid-row-gap': '12px', margin: '-14px -22px -49px -22px', padding: '0px' },
        cards: [{ type: 'custom:hk-row-card', card_width: 'fit-content', pad_top: '14px', pad_bottom: '30px',
                  pad_left: '22px', pad_right: '22px', cards: [{
                    type: 'custom:hk-camera-mosaic-card', height: 195, seam: 2, snapshot_cap: '480x270',
                    max_upscale: 1.2, show_age: true,
                    cameras: ids.map(function (id) { return { entity: id, name: fullName(hass, id) }; }) }] }] },
        // ...and the strip's closing 22 px: 30 px to the scenes with the gap.
        { type: 'custom:hk-spacer-card', height: '22px' }] }] };
  }
  // FAVORITES: the tiles the item picked, as the Home app's Favorites draws
  // them -- one height, the ROOM above the name (hk-favorite-card) -- in the
  // favorite shapes: a lock says
  // "Locked", a garage door "Closed", a thermostat its reading and setpoint.
  function areaName(hass, id) {
    var ents = hass.entities || {}, devs = hass.devices || {}, areas = hass.areas || {};
    var e = ents[id] || {};
    var a = e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id);
    return (a && areas[a] && areas[a].name) || '';
  }
  // A FAVORITE is its room tile on the favorites row, with what the
  // accessory's gear gives it AS a favorite: its name and glyph
  // there ("Garage Door" where its room tile is "Door"), and the lights it
  // controls together with ("Main + Table Lights") -- and the state text a
  // favorite reads: a light its brightness, a switch On / Off.
  function favTile(hass, id) {
    var fa = accOf(id) || {};
    // its room line: the accessory's own as a favorite (a helper with no
    // area), else its area's
    var d = id.split('.')[0], st = hass.states[id], area = areaName(hass, id), room = fa.fav_room || area;
    // shortened by its real room only: a room line of its own is just words
    // ("Office" over Office Lights, a group with no area)
    var name = fa.fav_name || accName(id) || shortName(nameOf(hass, id, (hass.entities || {})[id]), area);
    var dc = st && st.attributes && st.attributes.device_class;
    if (d === 'climate' || d === 'water_heater') {
      return { type: 'custom:hk-climate-card', entity: id, name: name, room: room, icon_color: 'blue',
               label_mode: 'setpoint' };
    }
    var base = { type: 'custom:hk-favorite-card', entity: id, name: name, room: room };
    // the accessory's own glyph (its gear) over the favourite's usual one, at
    // that glyph's measured size (without it every picked glyph would draw 23 px)
    var mine = function (t) {
      var own = favIcon(fa) || accIcon(id);
      if (own && own !== t.icon) { t.icon = own; delete t.icon_states; delete t.icon_size; sized(t, FAV_PX); }
      return t;
    };
    if (d === 'lock') {
      return mine(Object.assign(base, { icon: 'hk:lock', icon_states: { unlocked: 'hk:lock-open-variant' },
                                        icon_size: '23px', icon_color: 'mint', label_mode: 'sentence' }));
    }
    if (d === 'cover' && (dc === 'garage' || dc === 'gate')) {
      return mine(Object.assign(base, { icon: 'hk:garage-variant', icon_size: '26px', icon_color: 'mint',
        icon_states: { open: 'hk:garage-open-variant', opening: 'hk:garage-open-variant' }, label_mode: 'open_closed' }));
    }
    var t = tileFor(hass, id, name);
    if (!t) return base;
    t = Object.assign({}, t, { type: 'custom:hk-favorite-card', room: room });
    delete t.view_layout;                     // one height, like every favorite
    delete t.size;                            // ...whatever the accessory's own size
    delete t.hk_place;                        // its place here is the favorites'
    // A LIGHT GROUP (a helper: its members in attributes.entity_id) reads how
    // many are on, "2 On", as the hand-written favorites did; a blind its
    // position.
    var members = d === 'light' && st && Array.isArray(st.attributes.entity_id)
      ? st.attributes.entity_id.filter(function (x) { return x !== id && hass.states[x]; }) : [];
    if (members.length) { t.label_mode = 'group_count'; t.group = members; }
    else if (d === 'light') t.label_mode = 'brightness';
    else if (d === 'switch' || d === 'input_boolean') t.label_mode = 'on_off';
    else if (d === 'cover') t.label_mode = 'position';
    mine(t);
    // its own colour when on (the accessory's Color)
    if (fa.color) t.icon_color = fa.color;
    var together = (Array.isArray(fa.fav_with) ? fa.fav_with : []).filter(function (x) {
      return x !== id && hass.states[x];
    });
    if (together.length && (d === 'light' || d === 'switch' || d === 'input_boolean')) {
      var all = [id].concat(together);
      var lights = all.every(function (x) { return x.split('.')[0] === 'light'; });
      t.group = all;
      t.group_lit = 'any';
      if (d === 'light') t.label_mode = 'group_brightness';
      t.tap_action = { action: 'perform-action', perform_action: lights ? 'light.toggle' : 'homeassistant.toggle',
                       target: { entity_id: all } };
    }
    return t;
  }
  function favIcon(fa) {
    var v = fa && fa.fav_icon ? String(fa.fav_icon) : '';
    return v ? (/^mdi:/.test(v) ? 'hk:' + v.slice(4) : v) : null;
  }
  function favorites(hass, opts, b) {
    var tiles = listOf(b, 'favorites').filter(function (id) { return hass.states[id]; }).map(function (id) {
      return placed(favTile(hass, id), { fav: true });
    });
    if (!tiles.length) return null;
    // The favorites grid: 9 px below, where a room's is 11.
    return { type: 'grid', columns: 1, square: false, view_layout: COL2, cards: [heading('Favorites'),
      { type: 'custom:hk-grid-card', layout: Object.assign({}, GRID, { padding: '0px 0px 9px 0px' }), cards: tiles }] };
  }

  // ONE PAGE THAT CANNOT BE BUILT IS ONE PAGE, NOT THE DASHBOARD. Home
  // Assistant replaces EVERY view with one "Error loading the dashboard
  // strategy" card when generate() throws -- on a wall tablet, the whole
  // screen until it is reloaded. So the category pages and each room page are
  // built guarded: one that throws is logged and left out (a room page says
  // so in its place, as its heading on Home still links to it).
  function guarded(label, build, instead) {
    try { return build(); } catch (e) {
      try { console.error('[hk-strategy] could not build ' + label, e); } catch (x) { /* no console */ }
      return instead ? instead(e) : null;
    }
  }

  function views(hass, opts, music) {
    var themes = (hass.themes && hass.themes.themes) || {};
    var theme = opts.theme || kioskTheme(themes);
    var sky = opts.sky !== false;
    var weather = (window.hkSettings && window.hkSettings.weatherId(hass.states)) || firstOf(hass, 'weather');
    var alarm = setting('security.alarm') || firstOf(hass, 'alarm_control_panel');
    // Left out means left out everywhere -- its page and its header link too.
    if (weather && hidden(hass, opts, weather)) weather = null;
    if (alarm && hidden(hass, opts, alarm)) alarm = null;

    function view(o) {
      var v = Object.assign({ type: 'custom:hk-grid-view', layout: VIEW_LAYOUT, background: '#05070e' }, o);
      if (theme) v.theme = theme;
      if (o.sky_variant) { delete v.sky; if (!sky) delete v.sky_variant; }
      else if (sky && o.sky !== false) v.sky = true; else delete v.sky;
      return v;
    }

    var inv = inventory(hass, opts);
    // THE CHIP ROW is the dashboard's own (hk-chips-card): which chips, their
    // order and which are quiet come from its item, live -- no rebuild.
    // `in_menu: false`: a generated screen's menu lists every page under
    // Categories, not only the chips' pages (hk-menu.js chipPaths).
    var row = opts.chips === false || (opts.board || {}).chips_row === false ? null
            : { type: 'custom:hk-chips-card', in_menu: false };
    // THIS DASHBOARD'S PAGES (its item's Pages; empty: every page the house
    // has something for), in its order. A page left out is left out of the
    // menu and of every link to it.
    var b = opts.board || {};
    var picked = listOf(b, 'pages');
    var want = function (k) { return picked.length ? picked.indexOf(k) >= 0 : true; };
    // The cameras the item picked for its strip are the Cameras page's too
    // (a house's high-resolution channels and tablet cameras stay off both).
    var cams = listOf(b, 'cameras').length
      ? listOf(b, 'cameras').filter(function (id) { return hass.states[id] && !hidden(hass, opts, id); })
      : houseCameras(hass, opts);
    var hasCams = cams.length > 0 && want('cameras');
    if (!want('weather')) weather = null;
    var alarmId = alarm;                // the #alarm pop-up needs no Security page
    if (!want('security')) alarm = null;
    if (!want('music')) music = false;
    var hdr = { type: 'custom:hk-header-card', weather_path: weather ? './weather' : undefined,
                alarm_path: alarm ? './security' : undefined };
    // ON PHONES (its Home Page's setting): the clock and weather
    // header, or under 640 px the one-line weather strip in its place
    var tops = b.phone_header === 'strip'
      ? [{ type: 'conditional', conditions: [{ condition: 'screen', media_query: '(min-width: 640px)' }], card: hdr },
         { type: 'conditional', conditions: [{ condition: 'screen', media_query: '(max-width: 639.98px)' }],
           card: Object.assign({ type: 'custom:hk-weather-strip-card', margin: '30px 0px 23px 0px' },
                               weather ? { tap_action: { action: 'navigate', navigation_path: './weather' } } : {}) }]
      : [hdr];
    var header = { type: 'grid', columns: 1, square: false, view_layout: COL2, cards: tops.concat(row ? [row] : [], [
      { type: 'custom:hk-spacer-card', height: '2px' }]) };
    // HOME, in this order: the header and
    // chips, the camera strip, the scenes, the favorites, then the rooms.
    var home = [header];
    var strip = cameraStrip(hass, opts, b, hasCams);
    if (strip) home.push(strip);
    home.push({ type: 'custom:hk-scenes-card', view_layout: COL2 });
    var fav = favorites(hass, opts, b);
    if (fav) home.push(fav);
    // Play Music is reached from the Speakers chip, the menu and a scene pill
    // (Home -> Scenes -> Pills that open a page) -- not a heading of its own
    // between Favorites and the rooms.
    rooms(hass, opts).forEach(function (r) {
      var sec = guarded('the ' + r.name + ' section of Home', function () { return roomSection(hass, r); });
      if (sec) home.push(sec);
    });
    // THE #alarm POP-UP. An alarm automation may open
    // `<dashboard>/0#alarm` on the tablets, and a Home with nothing
    // listening would just show Home. An Alarm pop-up ITEM (HK Settings
    // -> Pop-ups) answers #alarm on every dashboard with its own Close
    // after -- and a card here would claim the hash first, so the item's
    // settings would never apply on a generated dashboard (the keypad would
    // close after the default minute, not the item's). So this card is only
    // for a house with no Alarm item for this dashboard, and not where the
    // dashboard refuses pop-ups.
    var popups = [];
    var seg = dashSeg();
    var alarmItem = (setting('popups') || []).some(function (p) {
      return p && p.hash === 'alarm' && (!p.dashboards || !p.dashboards.length || p.dashboards.indexOf(seg) >= 0);
    });
    if (alarmId && !alarmItem && b.popups !== false) {
      popups.push({ type: 'custom:hk-popup-card', hash: '#alarm', detail: alarmId, name: 'Alarm' });
    }
    // its Screen page's Now-playing bar (with music set up)
    if (b.now_playing && music) popups.push(mediaBar());
    if (popups.length) {
      home.push({ type: 'custom:hk-grid-card', view_layout: COL2,
        layout: { 'grid-template-columns': '1fr', 'grid-column-gap': '0px', 'grid-row-gap': '0px',
                  margin: '0px', padding: '0px' },
        cards: popups });
    }

    var out = [view({ title: 'Home', path: 'home', cards: home })];
    // A HOME OF ITS OWN (its Pages page -> Home): one of the house's custom
    // pages in place of the generated Home, and the rest of the screen
    // generated as usual -- a car's own first page, say, over the house's
    // Lights, Climate and Cameras. The page keeps its address and is called
    // Home, as the generated one is (the menu, HA's header, the tab). A page
    // that is gone leaves the generated Home.
    var own = (opts.board || {}).home_view ? customView(opts.board.home_view) : null;
    if (own) {
      own.title = own.menu_title = 'Home';
      if (!own.icon) own.icon = 'mdi:home';
      out[0] = own;
    }
    var pages = {};
    if (opts.pages !== false) {
      guarded('the category pages', function () {
        categoryPages(hass, opts, inv, view).forEach(function (v) { pages[v.path] = v; });
      });
    }

    if (weather) {
      // THE WEATHER ROW: wind, sun and moon, then UV and the outside
      // temperature's week, each pair of groups sized by --hk-wtile-a / -b.
      var A = { 'grid-column': 'var(--hk-wtile-a, auto)' }, Bw = { 'grid-column': 'var(--hk-wtile-b, auto)' };
      var wind = { type: 'custom:hk-weather-tile-card', variant: 'wind', entity: weather, view_layout: A };
      if (setting('weather.wind')) wind.speed = setting('weather.wind');
      if (setting('weather.gust')) wind.gust = setting('weather.gust');
      var tiles = [wind];
      if (hass.states['sun.sun']) tiles.push({ type: 'custom:hk-weather-tile-card', variant: 'sun', sun: 'sun.sun', view_layout: A });
      // Always a moon: with no sensor chosen the tile computes the phase.
      var moon = setting('sky.moon');
      tiles.push(moon ? { type: 'custom:hk-weather-tile-card', variant: 'moon', phase: moon, view_layout: A }
                      : { type: 'custom:hk-weather-tile-card', variant: 'moon', view_layout: A });
      var uv = setting('weather.uv');
      if (uv) tiles.push({ type: 'custom:hk-weather-tile-card', variant: 'uv', uv: uv, view_layout: Bw });
      var outside = setting('weather.outside');
      if (outside && hass.states[outside]) {
        var unit = (hass.states[outside].attributes || {}).unit_of_measurement || '\u00b0';
        tiles.push({ type: 'custom:hk-usage-card', entity: outside, name: 'Outside Temperature', height: '172px',
          align: 'center', compare: false, stat: outside, view_layout: Bw, tap_action: { action: 'none' },
          opts: { unit: unit, unitSpace: false, noun: 'Daily average', colour: 'teal', valSuffix: ' avg',
                  delta: 'absolute', deltaUnit: '\u00b0', words: ['warmer', 'cooler'], baseline: 'min',
                  statOpts: { type: 'mean' }, height: 38, days: 7 } });
      }
      var alerts = setting('weather.alerts');
      var body = [{ type: 'custom:hk-weather-band-card', entity: weather, hours: 12, days: 8 }];
      if (alerts) {
        body.push({ type: 'conditional',
          conditions: [{ condition: 'numeric_state', entity: alerts, above: 0 }],
          card: { type: 'custom:hk-alert-card', entity: alerts, title: 'Severe Weather', icon: 'mdi:alert' } });
      }
      body.push({ type: 'custom:hk-grid-card', cards: tiles,
        layout: { 'grid-template-columns': 'var(--hk-cols-5, repeat(5, minmax(0, 1fr)))',
                  'grid-column-gap': '6px', 'grid-row-gap': '0px', margin: '0px', padding: '0px' } });
      // THE RADAR MAP, when the Weather Radar Card is installed from HACS
      // (settings.find_extras hands its URL; hk-frame-card imports it the
      // first time this page builds -- it is not a Lovelace resource, which
      // would load 457 KB on every page). The card, as tuned:
      // NOAA in the US (US-only; RainViewer elsewhere), OpenStreetMap under
      // it (the only basemap with no "API key required" watermark).
      var radar = setting('extras.radar');
      if (radar) {
        body.push({ type: 'custom:hk-grid-card',
          layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-rows': 'min-content', 'grid-column-gap': '0px',
                    'grid-row-gap': '0px', margin: '12px 0px 0px 0px', padding: '0px' },
          cards: [{ type: 'custom:hk-frame-card', module: radar, material: 'glass', card: Object.assign(overlay({
            data_source: (hass.config && hass.config.country) === 'US' ? 'NOAA' : 'RainViewer',
            map_style: 'OSM', static_map: true, markers: [{ entity: 'zone.home' }], show_scale: true,
            show_playback: true, show_zoom: false, show_range: false, show_recenter: false, square_map: false,
            extra_labels: false, height: '620px', zoom_level: 6
            // its own options (Configure -> Weather -> Radar map, YAML); the
            // card's type is not one of them
          }, setting('weather.radar')), { type: 'custom:weather-radar-card' }) }] });
      }
      pages.weather = view({ title: 'Weather', path: 'weather', subview: true, icon: 'mdi:weather-partly-cloudy',
                      menu: 'top', cards: [titleBar('Weather'), column(body)] });
    }

    // CAMERAS: every camera live, three across.
    if (hasCams) {
      pages.cameras = view({ title: 'Cameras', path: 'cameras', subview: true, icon: 'mdi:camera', menu: 'top',
        sky_variant: 'cameras', background: '#080a0e', cards: [titleBar('Cameras'), column([{
          type: 'custom:hk-grid-card',
          layout: { 'grid-template-columns': 'var(--hk-cameras, repeat(3, minmax(0, 1fr)))', 'grid-column-gap': '4px',
                    'grid-row-gap': '0px', margin: '0px', padding: '0px' },
          cards: cams.map(function (id) {
            return { type: 'picture-entity', entity: id, camera_view: 'live', show_name: false, show_state: false,
                     aspect_ratio: '16x9', fit_mode: 'cover' };
          }) }])] });
    }

    // THE CALENDAR, when the house has a calendar (All Screens -> Calendar
    // chooses which, and their colours -- read live by the card, so neither
    // rebuilds anything): the month, week or day, and its events to add,
    // change and delete.
    var HS0 = window.hkSettings;
    var cals = (HS0 && HS0.calendarIds ? HS0.calendarIds(hass.states)
                : Object.keys(hass.states).filter(function (k) { return k.indexOf('calendar.') === 0; }))
      .filter(function (id) { return !hidden(hass, opts, id); });
    if (want('calendar') && cals.length) {
      pages.calendar = view({ title: 'Calendar', path: 'calendar', subview: true, icon: 'mdi:calendar-month',
        cards: [titleBar('Calendar'), column([{ type: 'custom:hk-calendar-card' }])] });
    }

    // LIVE TV, when the Live TV feature is added (its guide knows the channels).
    if (want('live_tv') && added('live_tv')) {
      pages.live_tv = view({ title: 'Live TV', path: 'live-tv', subview: true, icon: 'mdi:television', menu: 'top',
        sky_variant: 'cameras', background: '#080a0e', cards: [titleBar('Live TV'), column([
          { type: 'custom:hk-tv-guide-card' }], { layout: { 'grid-template-columns': 'minmax(0, 1fr)',
            margin: '0px 4px', padding: '4px 0px 24px 0px' } })] });
    }

    // SECURITY: the keypad, and the locks and garage doors
    // on a rail beside it (--hk-alarm-* stack it on
    // a narrow page), under the doors sky.
    if (alarm) {
      // the locks, then the garage doors -- or the page's own order
      // (Accessories -> Page Order -> Security)
      var guards = ownOrder('security', inv.locks.concat(inv.garage.filter(function (id) { return id.indexOf('cover.') === 0; })))
        .map(function (id) {
          if (id.indexOf('lock.') === 0) {
            return { type: 'custom:hk-tile-card', entity: id, name: fullName(hass, id).replace(/ Lock$/, ''),
                     icon: 'hk:lock', icon_states: { unlocked: 'hk:lock-open-variant' }, icon_color: 'mint',
                     label_mode: 'title' };
          }
          return { type: 'custom:hk-tile-card', entity: id, name: fullName(hass, id), icon: 'hk:garage-variant',
                   icon_states: { open: 'hk:garage-open-variant', opening: 'hk:garage-open-variant' },
                   icon_color: 'mint', label_mode: 'title' };
        });
      var keypad = { type: 'custom:hk-alarm-keypad-card', entity: alarm, view_layout: { 'grid-area': 'alarm' } };
      var panel = guards.length ? { type: 'custom:hk-grid-card',
        layout: { 'grid-template-columns': 'var(--hk-alarm-cols, 430px 408px)', 'grid-column-gap': '18px',
                  'grid-row-gap': '0px', 'place-content': 'stretch center', margin: '0px', padding: '0px',
                  'grid-template-areas': 'var(--hk-alarm-areas, "alarm locks")' },
        cards: [keypad, { type: 'custom:hk-grid-card', view_layout: { 'grid-area': 'locks' },
          layout: { 'grid-template-columns': 'minmax(0, 1fr)', 'grid-auto-rows': 'min-content',
                    'grid-row-gap': '0px', margin: '0px -4px', padding: '0px' },
          cards: [heading('Locks'), { type: 'custom:hk-grid-card', cards: guards,
            layout: { 'grid-template-columns': 'var(--hk-alarm-locks, repeat(2, 192px))', 'grid-column-gap': '12px',
                      'grid-row-gap': '0px', 'grid-auto-rows': '82px', margin: '0px 0px -16px 0px', padding: '0px' } }] }] }
        : { type: 'custom:hk-grid-card', cards: [keypad],
            layout: { 'grid-template-columns': 'minmax(0, 430px)', 'place-content': 'stretch center',
                      'grid-template-areas': '"alarm"', margin: '0px', padding: '0px' } };
      pages.security = view({ title: 'Security', path: 'security', subview: true, icon: 'mdi:lock',
        sky_variant: 'doors', background: '#1c0e10', cards: [titleBar('Security'), column([panel])] });
    }

    // WATER: the leak sensors, room by room.
    if (opts.pages !== false && inv.leaks && inv.leaks.length) {
      var wet = {};
      inv.leaks.forEach(function (id) { wet[id] = true; });
      var byRoom = roomsWith(hass, Object.assign({}, opts, { include_entities: [].concat(opts.include_entities || [], inv.leaks) }),
                             function (id) { return !!wet[id]; });
      // SENSOR COVERAGE, while a leak sensor has said nothing since Home
      // Assistant started -- neither wet nor dry. Sleepy battery sensors can stay
      // silent for days after a restart, and a page of calm tiles would hide
      // that nobody is listening. A count, not an alarm.
      var cover = { type: 'conditional', view_layout: COL2,
        conditions: [{ condition: 'or', conditions: inv.leaks.map(function (id) {
          return { condition: 'state', entity: id, state_not: ['on', 'off'] }; }) }],
        card: section('Sensor Coverage', [{ type: 'custom:hk-tile-card', name: 'Not Reporting', icon: 'hk:water-alert',
          icon_color: 'red', label_mode: 'unreported', group: inv.leaks.slice(), tap_action: { action: 'none' } }]) };
      pages.water = view({ title: 'Water', path: 'water', subview: true, icon: 'mdi:water', sky_variant: 'water',
        background: '#0c1526', cards: [titleBar('Water'), cover].concat(byRoom.map(function (r) {
          return section(r.name, r.entities.map(function (id) {
            return { type: 'custom:hk-tile-card', entity: id, name: friendly(hass, id, r.name), icon: 'hk:water-alert',
                     icon_color: 'red', label_mode: 'leak' };
          }));
        })) });
    }

    if (music) {
      // PLAY MUSIC: the cover is the page's background (the playmusic
      // sky), the player carries its progress and volume, the speakers rail.
      out.push(view({ title: 'Play Music', path: 'playmusic', subview: true, sky_variant: 'playmusic',
        icon: 'mdi:speaker', menu_title: 'Speakers',
        background: '#150e1f', cards: [titleBar('Play Music'), {
          type: 'custom:hk-grid-card', view_layout: COL2,
          layout: { 'grid-template-columns': 'var(--hk-page-split, minmax(0, 368px) minmax(var(--hk-rail, 0px), 1fr))',
                    'grid-column-gap': '28px', 'grid-row-gap': '0px', margin: '0px', padding: '0px' },
          cards: [
            Object.assign(column([{ type: 'custom:hk-now-playing-card', music: true, tall: true,
              sub_card: { type: 'custom:hk-media-control-card', color: 'purple', bare: true, parts: ['progress'],
                          entity_from: { music: true } },
              meta_card: { type: 'custom:hk-media-control-card', color: 'purple', bare: true, parts: ['volume'],
                           entity_from: { music: true } } }]), { view_layout: {} }),
            Object.assign(column([heading('Speakers'),
                   { type: 'custom:hk-speaker-picker-card', browse_url: './music-browse' }]), { view_layout: {} })
          ] }] }));
      // IN THE MENU WITH PLAY MUSIC: listed when Play Music is,
      // right after it -- or where the Order tab places it (hk-menu.js)
      out.push(view({ title: 'Browse Music', path: 'music-browse', subview: true, sky_variant: 'playmusic',
        menu_follows: 'playmusic', icon: 'mdi:music-box-multiple',
        background: '#150e1f', cards: [titleBar('Browse Music'),
          column([{ type: 'custom:hk-library-card', music: true }])] }));
    }
    // THE PAGES IN THIS DASHBOARD'S ORDER (Order -> Pages): the
    // kinds, Browse Music where it is placed (else right after Play Music --
    // it comes with it, never on its own), and a custom page where it is
    // placed; custom pages not placed come before the rooms (customPages).
    var play = out.filter(function (v) { return v.path === 'playmusic'; });
    var browse = out.filter(function (v) { return v.path === 'music-browse'; });
    out = out.filter(function (v) { return play.indexOf(v) < 0 && browse.indexOf(v) < 0; });
    var KEY = { weather: 'weather', calendar: 'calendar', cameras: 'cameras', live_tv: 'live_tv', security: 'security',
                doors_windows: 'doors-windows', climate: 'climate', lights: 'lights', timers: 'timers',
                vacuums: 'vacuums', water: 'water' };
    var order = picked.length ? picked : ['weather', 'calendar', 'cameras', 'live_tv', 'security', 'doors_windows', 'climate',
                                          'lights', 'timers', 'vacuums', 'music', 'water', 'rooms'];
    var placed = order.indexOf('browse') >= 0;
    var mine = listOf(b, 'custom_pages');
    order.forEach(function (k) {
      if (k === 'music') { out = out.concat(play, placed ? [] : browse); play = []; if (!placed) browse = []; return; }
      if (k === 'browse') { out = out.concat(browse); browse = []; return; }
      if (KEY[k]) {
        var v = pages[KEY[k]];
        if (v) { out.push(v); delete pages[KEY[k]]; }
        return;
      }
      // a custom page, when this dashboard shows it
      if (mine.indexOf(k) >= 0) { var cv = customView(k); if (cv) out.push(cv); }
    });
    // A PAGE PER ROOM (Parts -> Room pages): each room heading on Home opens it.
    if (opts.rooms !== false && want('rooms')) {
      rooms(hass, opts).forEach(function (r) {
        if (!r.id) return;
        var head = { title: r.name, path: 'room-' + slug(r.id), subview: true,
                     area: r.areas && r.areas.length > 1 ? r.areas : r.id };
        out.push(guarded('the ' + r.name + ' page', function () {
          return view(Object.assign({}, head, { cards: roomCards(hass, r.areas || [r.id], r.name, opts) }));
        }, function (e) {
          return view(Object.assign({}, head, { cards: [{ type: 'markdown',
            content: 'This room page could not be built (' + String((e && e.message) || e).replace(/[<>&]/g, '') + ').' }] }));
        }));
      });
    }
    return out;
  }

  // THE ROOM PAGE AS A VIEW STRATEGY, for a hand-built dashboard:
  //
  //     - title: Kitchen
  //       path: room-kitchen
  //       subview: true
  //       sky: true                  # the live sky, as on any HK view
  //       strategy:
  //         type: custom:hk-room
  //         area: kitchen            # or a list: [backyard, deck]
  //
  // Built from the area every time the page opens. The menu lists it as a
  // room (it reads the strategy's `area`).
  // WHEN HOME ASSISTANT SHOULD BUILD THE DASHBOARD AGAIN.
  // A strategy that says nothing is rebuilt whenever the entity, device, area
  // or floor registry changes at all -- anywhere in the house, for any field
  // (a firmware version, an integration's own bookkeeping) -- and HA hands
  // the view a new config without comparing it, so every card on an open
  // screen is made again: the camera strip's live tile reconnects, the sky
  // and glass rebuild. What the build reads of the registries is small, so
  // it is compared instead: an entity's area, device, platform, name, icon,
  // hidden and category; a device's area; an area's name and floor; a
  // floor's name and level. Worked out once per registry object (HA
  // replaces the object when it changes), so an unchanged registry costs a
  // lookup per hass push.
  var REG_FIELDS = {
    entities: ['area_id', 'device_id', 'platform', 'name', 'icon', 'hidden', 'entity_category'],
    // a device's names are its tiles' names (friendly_name), its model picks
    // the Apple TV / HomePod glyph
    devices: ['area_id', 'name', 'name_by_user', 'model'], areas: ['name', 'floor_id'], floors: ['name', 'level']
  };
  var regSeen = new WeakMap();
  function regView(reg, fields) {
    if (!reg || typeof reg !== 'object') return '';
    var hit = regSeen.get(reg);
    if (hit !== undefined) return hit;
    var out = Object.keys(reg).sort().map(function (k) {
      var r = reg[k] || {};
      return k + '=' + fields.map(function (f) { return r[f] == null ? '' : String(r[f]); }).join('|');
    }).join(';');
    regSeen.set(reg, out);
    return out;
  }
  function regChanged(config, oldHass, newHass) {
    if (!oldHass || !newHass) return true;
    return Object.keys(REG_FIELDS).some(function (k) {
      return oldHass[k] !== newHass[k] && regView(oldHass[k], REG_FIELDS[k]) !== regView(newHass[k], REG_FIELDS[k]);
    });
  }

  class HkRoomViewStrategy extends HTMLElement {
    static shouldRegenerate(config, oldHass, newHass) { return regChanged(config, oldHass, newHass); }
    static async generate(config, hass) {
      if (window.hkSettings && window.hkSettings.whenLive) await window.hkSettings.whenLive(3000);
      var c = config || {};
      var areas = [].concat(c.area || []).filter(Boolean);
      var A = hass.areas || {};
      var name = c.name || (A[areas[0]] && A[areas[0]].name) || 'Room';
      var themes = (hass.themes && hass.themes.themes) || {};
      var v = { type: 'custom:hk-grid-view', layout: VIEW_LAYOUT, background: '#05070e',
                cards: roomCards(hass, areas, name, Object.assign({}, c, { __build: {} })) };
      var theme = c.theme || kioskTheme(themes);
      if (theme) v.theme = theme;
      return v;
    }
  }
  if (!customElements.get('ll-strategy-view-hk-room')) {
    customElements.define('ll-strategy-view-hk-room', HkRoomViewStrategy);
  }

  class HkDashboardStrategy extends HTMLElement {
    static shouldRegenerate(config, oldHass, newHass) { return regChanged(config, oldHass, newHass); }
    static async generate(config, hass) {
      // THE SETTINGS FIRST. This runs once per load, so it cannot redraw when
      // they arrive: on a browser with no cached copy it waits (up to 3 s)
      // for the integration's answer instead of building from the defaults.
      if (window.hkSettings && window.hkSettings.whenLive) await window.hkSettings.whenLive(3000);
      // WHAT THIS BUILD READS, fingerprinted BEFORE it reads it, and the
      // listener hooked before the first await below: a settings push that
      // lands while the build waits (on music, up to 4 s) is then seen as a
      // change and rebuilds. Fingerprinted at the end, as it was, the push
      // was in the fingerprint but not in the build, and nothing followed.
      var seg = dashSeg();
      watch(seg, inputs(seg));
      // Accessories -> Hidden from Screens / Also Shown (the house's), then
      // the dashboard's own YAML: the lists ADD together. The parts (chips,
      // pages, sky, music, rooms) are the YAML's and the screen's own --
      // there are no house-wide switches for them.
      var G = (window.hkSettings && window.hkSettings.get('generated', null)) || {};
      var y = config || {};
      var both = function (k) { return [].concat(G[k] || [], y[k] || []); };
      var opts = Object.assign({}, y, {
        exclude_areas: both('exclude_areas'), exclude_entities: both('exclude_entities'),
        exclude_devices: both('exclude_devices'), include_entities: both('include_entities'),
        __build: {}                     // this build's one pass over the house (byArea)
      });
      opts.board = boardOf(seg);
      if (opts.board.sky === false) opts.sky = false;
      var b = opts.board;
      // HOME PAGE OFF (its Pages page): the screen is only its
      // custom pages, in its order, and opens on the first -- an Energy
      // panel. With none listed it is a whole screen as usual.
      var only = b.home_page === false ? listOf(b, 'custom_pages').map(customView).filter(Boolean) : [];
      var cfg;
      if (only.length) {
        // the menu's first item is this page, under its own name -- not "Home"
        only[0].menu_title = only[0].title;
        if (only[0].icon) only[0].menu_icon = only[0].icon;
        cfg = { views: only };
      } else {
        var music = opts.music === false ? false : await musicConfigured(hass);
        cfg = { views: views(hass, opts, music) };
        customPages(cfg.views, listOf(b, 'custom_pages'));
      }
      var saver = screensaverOf(hass, b);
      if (opts.sky !== false) {
        // THE SKY (hk-sky.js): off everywhere with the house's switch (Look ->
        // Live sky switch), and paused behind this tablet's screensaver
        cfg.sky = {};
        if (setting('look.sky_switch')) cfg.sky.enable = setting('look.sky_switch');
        if (saver && saver.entity) cfg.sky.sleep = saver.entity;
      }
      // Its Screen page's "Hide Home Assistant Header & Sidebar": HK
      // Frontend's own (hk-kiosk.js reads cfg.hk_kiosk), or the Kiosk Mode
      // plugin for a screen that chooses it -- the tuned settings, then the
      // screen's own options for it (Kiosk Mode Options, YAML).
      var kiosk = kioskOf(b);
      if (kiosk === 'kiosk_mode') cfg.kiosk_mode = overlay({ hide_header: true, hide_sidebar: true }, b.kiosk_options);
      else if (kiosk) cfg.hk_kiosk = kiosk;
      // THE PHOTO SCREENSAVER: HK Frontend's own (hk-saver.js reads
      // cfg.hk_screensaver), or WallPanel for a screen that chooses it.
      if (saver && b.screensaver_engine === 'wallpanel') cfg.wallpanel = overlay(wallpanel(saver), b.wallpanel_options);
      else if (saver) cfg.hk_screensaver = hkSaver(saver, b.screensaver_options);
      return cfg;
    }
  }

  // THE HOUSE'S CUSTOM PAGES this dashboard lists (its Pages page; Custom
  // pages on the HK Settings page): each page's own view --
  // its cards, as the house wrote them -- under its title, address and icon,
  // after the category pages and before the rooms. A chip whose page it is
  // (Energy) opens it. An address this dashboard already has is left out.
  // Nothing is fetched from another dashboard.
  // One custom page's view: its cards as the house wrote them, under its
  // title, address and icon; null when the house has no such page.
  function customView(k) {
    var all = setting('custom_pages') || [], p = null;
    (Array.isArray(all) ? all : []).forEach(function (x) { if (x && x.path === k) p = x; });
    if (!p) return null;
    var v = JSON.parse(JSON.stringify(p.view || {}));
    v.title = p.title || k;
    v.path = k;
    if (p.icon) v.icon = p.icon;
    if (!Array.isArray(v.cards) && !Array.isArray(v.sections)) v.cards = [];
    return v;
  }
  function customPages(list, keys) {
    if (!keys.length) return;
    var all = setting('custom_pages') || [], by = {};
    (Array.isArray(all) ? all : []).forEach(function (p) { if (p && p.path) by[p.path] = p; });
    var have = {};
    list.forEach(function (v) { if (v && v.path) have[v.path] = true; });
    var at = list.length;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && /^room-/.test(list[i].path || '')) { at = i; break; }
    }
    keys.forEach(function (k) {
      var p = by[k];
      if (!p || have[k]) return;
      var v = JSON.parse(JSON.stringify(p.view || {}));
      v.title = p.title || k;
      v.path = k;
      if (p.icon) v.icon = p.icon;
      if (!Array.isArray(v.cards) && !Array.isArray(v.sections)) v.cards = [];
      list.splice(at++, 0, v);
      have[k] = true;
    });
  }

  // THE PHOTO SCREENSAVER (a generated wall tablet's Screen page):
  // HK Frontend's own (hk-saver.js), or WallPanel (HACS) for a screen that
  // chooses it -- either way for the tablet's own user only (a desk opening
  // the same dashboard never gets it), with the house's photos, and the wall
  // tablet's screensaver content (the clock, the weather, what is playing,
  // the running timers). Its helper, the one a tablet's automations read, is
  // input_boolean.wallpanel_screensaver_<its room> -- the name predates
  // HK's own screensaver and is kept, so no automation has to change.
  function screensaverOf(hass, b) {
    if (!b || !b.screensaver || !b.tablet_user) return null;
    // HK Frontend's own switch for the screen (screensaver.py), else the old
    // input_boolean.wallpanel_screensaver_<Tablet Room> a house may still
    // have (and WallPanel can only use an input_boolean)
    var legacy = b.idle_room ? 'input_boolean.wallpanel_screensaver_' + b.idle_room : null;
    if (legacy && !hass.states[legacy]) legacy = null;
    var own = b.screensaver_switch && hass.states[b.screensaver_switch] ? b.screensaver_switch : null;
    var ent = b.screensaver_engine === 'wallpanel' ? legacy : (own || legacy);
    // the temperature's letter on the screensaver ("68°F"): Home
    // Assistant's unit system's
    var temp = String((hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || '');
    return { user: b.tablet_user, entity: ent, unit: /C/.test(temp) ? 'C' : /F/.test(temp) ? 'F' : '',
             photos: setting('look.photos') || 'media-source://media_source/local/photos' };
  }
  var SAVER_CARDS = [
    { type: 'custom:hk-clock-card', time_size: '150px', ampm_size: '40px', date_size: '40px',
      time_letter_spacing: '0px', ampm_letter_spacing: '0.37px', date_letter_spacing: '0.37px',
      time_line_height: '1', date_format: 'monthday', date_gap: '4px', gap: '8px',
      color: 'rgba(255,255,255,0.95)', ampm_color: 'rgba(255,255,255,0.70)', date_color: 'rgba(255,255,255,0.85)',
      margin: '0px 0px 0px 20px', clip: false, layer: true },
    { type: 'custom:hk-weather-strip-card', variant: 'inline', unit: 'F', main_size: '36px', main_letter_spacing: '0.37px',
      glyph_size: '60px', temp_gap: '36px', icon_gap: '12px', color: 'rgba(255,255,255,0.95)',
      margin: '-4px 0px 0px 20px', layer: true },
    { type: 'custom:hk-screensaver-now-card', music: true },
    { type: 'custom:hk-timer-strip-card', entity: 'sensor.running_quick_timers', scale: 1.6, fixed: true },
    // top-right: the house at a glance (HK's own screensaver only)
    { type: 'custom:hk-screensaver-status-card' }
  ];
  // HK FRONTEND'S OWN SCREENSAVER (hk-saver.js): the block it reads from the
  // dashboard's config. `cards` are the same four as WallPanel's, less the
  // ones the screen turned off (Over the Photos).
  function hkSaver(sv, o) {
    o = o || {};
    var cards = JSON.parse(JSON.stringify(SAVER_CARDS));
    if (sv.unit) cards[1].unit = sv.unit; else delete cards[1].unit;
    var keep = [o.clock !== false, o.weather !== false, o.music !== false, o.timers !== false, o.status !== false];
    return {
      user: sv.user, entity: sv.entity || null, photos: sv.photos,
      starts_after: o.starts_after || 180, each_photo: o.each_photo || 30,
      order: o.order === 'sorted' ? 'sorted' : 'random',
      fill: o.fill !== false, zoom: o.zoom === true,
      show: o.show === 'forecast' || o.show === 'both' ? o.show : 'photos', fallback: o.fallback !== false,
      forecast_every: o.forecast_every || 5,
      band: o.band !== false, band_photos: o.band_photos === true,
      calendar: o.calendar === true, calendar_days: o.calendar_days || 2,
      cards: cards.filter(function (c, i) { return keep[i]; })
    };
  }
  // HIDE HOME ASSISTANT'S HEADER AND SIDEBAR (a screen's Hide Home Assistant
  // Header & Sidebar): null, 'kiosk_mode' (the plugin does it), or the block
  // hk-kiosk.js reads -- the same one a YAML dashboard can write as hk_kiosk.
  function kioskOf(b) {
    if (!b || !b.kiosk) return null;
    // (no kiosk_engine: an integration older than 1.3 -- its screens with
    // Kiosk Mode Options of their own were the plugin's, as settings.py says)
    var eng = b.kiosk_engine || (b.kiosk_options && Object.keys(b.kiosk_options).length ? 'kiosk_mode' : 'hk');
    if (eng === 'kiosk_mode') return 'kiosk_mode';
    return { header: b.kiosk_header !== false, sidebar: b.kiosk_sidebar !== false, admins: b.kiosk_admins !== false };
  }
  // A SCREEN'S hk_screensaver BLOCK FROM ITS SETTINGS ALONE, for a dashboard
  // HK Frontend does not draw (an existing dashboard given HK settings):
  // hk-saver.js asks for it when the dashboard's own config has no
  // hk_screensaver. HK Frontend's own screensaver only -- WallPanel reads its
  // block from the dashboard itself. null: no screensaver for this screen.
  function saverBlock(hass, b) {
    if (!hass || !b || b.screensaver_engine === 'wallpanel') return null;
    var sv = screensaverOf(hass, b);
    return sv ? hkSaver(sv, b.screensaver_options) : null;
  }
  // A THIRD-PARTY CARD'S OWN OPTIONS over the tuned settings:
  // key by key, into nested mappings; a list or a value replaces; `key: null`
  // removes one. Never changes `base`.
  function overlay(base, over) {
    var out = JSON.parse(JSON.stringify(base || {}));
    if (!over || typeof over !== 'object' || Array.isArray(over)) return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v === null) { delete out[k]; return; }
      var plain = function (x) { return x && typeof x === 'object' && !Array.isArray(x); };
      out[k] = plain(v) && plain(out[k]) ? overlay(out[k], v) : JSON.parse(JSON.stringify(v));
    });
    return out;
  }
  function wallpanel(sv) {
    var cards = JSON.parse(JSON.stringify(SAVER_CARDS)).slice(0, 4);
    if (sv.unit) cards[1].unit = sv.unit; else delete cards[1].unit;
    var profiles = {};
    profiles['user.' + sv.user] = { enabled: true };
    var wp = {
      enabled: false, profiles: profiles, idle_time: 180, display_time: 30, control_reactivation_time: 3,
      fade_out_time_motion_detected: 0.1, fade_out_time_screensaver_entity: 0.1,
      image_animation_ken_burns: true, image_animation_ken_burns_zoom: 1.1,
      image_url: sv.photos, image_fit_landscape: 'cover', image_background: 'image', media_order: 'random',
      cards: cards,
      style: {
        'wallpanel-screensaver-info-box-content': { '--ha-card-background': 'none', '--ha-card-box-shadow': 'none',
          '--ha-card-border-width': '0px', '--primary-text-color': '#ffffff', '--secondary-text-color': '#dddddd',
          'text-shadow': '0px 2px 8px rgba(0, 0, 0, 0.30), 0px 6px 28px rgba(0, 0, 0, 0.26), 0px 12px 68px rgba(0, 0, 0, 0.34)',
          '--font-weight': 'bold', 'font-size': '15px', 'letter-spacing': '-0.23px' },
        'wallpanel-screensaver-info-box': { '--wp-card-width': '600px', background: 'none', 'box-shadow': 'none' },
        'wallpanel-screensaver-image-background': { filter: 'blur(40px) brightness(80%)', 'will-change': 'transform' },
        'wallpanel-screensaver-image-one': { 'will-change': 'transform' },
        'wallpanel-screensaver-image-two': { 'will-change': 'transform' },
        'wallpanel-screensaver-image-one-container': { 'will-change': 'opacity' },
        'wallpanel-screensaver-image-two-container': { 'will-change': 'opacity' }
      }
    };
    // THE HELPER IS WRITTEN FROM THE TABLET'S OWN USER ONLY. WallPanel's element
    // connects in every browser that opens the dashboard, enabled or not, and
    // sets screensaver_entity to "is MY screensaver running" -- so a desk
    // opening /dashboard-kitchen turned the kitchen tablet's helper off (107
    // times from one desk user, 09-27..29) until the tablet's own idle timer
    // put it back 180 s later. WallPanel merges the user's profile before it
    // connects, so in the profile only the tablet has a helper to write.
    if (sv.entity) profiles['user.' + sv.user].screensaver_entity = sv.entity;
    return wp;
  }
  // THE NOW-PLAYING BAR: rises from
  // the bottom while music plays or a quick timer runs.
  function mediaBar() {
    var bar = { type: 'custom:hk-now-playing-card', bar: true, music: true,
      meta_card: { type: 'custom:hk-media-control-card', color: 'purple', bare: true, parts: ['volume'], entity_from: { music: true } },
      sub_card: { type: 'custom:hk-media-control-card', color: 'purple', bare: true, parts: ['progress'], entity_from: { music: true } } };
    return { type: 'custom:hk-popup-card', hash: '#media', position: 'bottom', modal: false,
      vars: { 'hk-np-height': '104px', 'hk-np-pad': '12px 16px',
              'hk-np-areas': '"art title . prev play next stop . meta close" "art artist . prev play next stop . meta close" "art sub . prev play next stop . meta close"',
              'hk-np-cols': '72px minmax(220px, max-content) 1fr 64px 64px 64px 64px 1fr minmax(0, 380px) 48px',
              'hk-np-rows': 'auto auto auto', 'hk-np-gap': '14px' },
      width: '100%', max_width: '100%', background: 'transparent', dismissable: true,
      dismiss_scope: [{ music: true }, { entity: 'sensor.running_quick_timers', above: 0 }],
      trigger: [{ condition: 'or', conditions: [
        { condition: 'numeric_state', entity: 'sensor.running_quick_timers', above: 0 },
        { condition: 'state', entity_from: { music: true }, state: 'playing', grace: 20 }] }],
      trigger_close: true,
      cards: [{ type: 'custom:hk-timer-strip-card', plated: true, glass: true }, bar] };
  }

  // REBUILT WHEN ITS SETTINGS CHANGE. A strategy builds the dashboard once,
  // when it opens -- so an edit to this dashboard's item (its pages, camera
  // strip, favorites), to What counts or to the hidden / also-shown lists would wait
  // for a reload. Instead, when what it was built from changes, it asks
  // Home Assistant to rebuild it (`config-refresh`, what the dashboard
  // menu's own Refresh does), at most every 10 s. The chips and scenes are
  // live cards and need none of this.
  // WHAT A BUILD READS, not every setting it could: reading the
  // whole of every item and every accessory would make one chip reorder on
  // one screen, or one glyph picked anywhere, rebuild every open generated
  // screen. This item's keys that live cards and modules follow by
  // themselves are left out (the chips row, scenes, menu, look, pop-ups);
  // of the other items only their cameras, which pick the channel this one
  // shows (houseCameras); of the accessories not `status`, which only What
  // counts reads (and that arrives as `kinds`). Any key not named here still
  // rebuilds, so a new one is safe by default.
  // (`popups` is NOT live -- it decides this build's own #alarm
  // card, so it rebuilds, and so does the house's pop-up list; the look's
  // amounts, the car viewport and the idle return are applied by their
  // modules, so they do not rebuild -- a rebuild reconnects every camera.)
  var LIVE_KEYS = { chips: 1, chips_quiet: 1, chips_extra: 1, scenes: 1, scenes_pages: 1, scenes_row: 1,
                    categories: 1, menu: 1, menu_rooms: 1, dock_min: 1, time_weather: 1, ha_row: 1,
                    tab_position: 1, home_rooms: 1, glass: 1, frost: 1, blur: 1, camera_live: 1,
                    car: 1, idle_return: 1, narrow: 1, menu_top: 1, chips_custom: 1 };
  // an accessory's fields only the chips read (What counts' status, a custom
  // chip's when / label / attribute): changing one rebuilds nothing
  var CHIP_ONLY = { status: 1, when: 1, label: 1, attribute: 1 };
  function inputs(seg) {
    var b = boardOf(seg), mine = {};
    Object.keys(b).forEach(function (k) { if (!LIVE_KEYS[k]) mine[k] = b[k]; });
    var all = setting('boards') || {}, cams = {};
    Object.keys(all).forEach(function (k) { if (all[k] && all[k].cameras) cams[k] = all[k].cameras; });
    var acc = setting('accessories') || {}, ents = {}, rest = {};
    Object.keys(acc).forEach(function (k) { if (k !== 'entities') rest[k] = acc[k]; });
    Object.keys(acc.entities || {}).forEach(function (id) {
      var a = acc.entities[id] || {}, o = {};
      Object.keys(a).forEach(function (k) { if (!CHIP_ONLY[k]) o[k] = a[k]; });
      ents[id] = o;
    });
    return JSON.stringify([mine, cams, setting('kinds'), setting('generated'),
                           setting('security'), setting('sky.moon'), setting('weather'), setting('features'),
                           ents, rest, setting('look.sky_switch'), setting('look.photos'),
                           setting('extras'), setting('custom_pages'), setting('popups'), setting('added'),
                           // which calendars there are decides whether there is a Calendar page
                           (setting('calendar') || {}).entities]);
  }
  var built = { seg: null, sig: null, at: 0, timer: null };
  // NOT UNDER A FINGER. A rebuild re-creates every card -- an open sheet
  // closes, a live camera reconnects, a scrolled page jumps to the top -- so
  // while someone is using the screen (touched in the last 30 s, or a sheet
  // or pop-up covering the page) it waits, and runs once it is left alone,
  // as the tablets are only ever reloaded when nobody is looking.
  var BUSY_MS = 30000, touched = 0;
  ['pointerdown', 'keydown', 'wheel'].forEach(function (t) {
    try { window.addEventListener(t, function () { touched = Date.now(); }, { capture: true, passive: true }); }
    catch (e) { /* no window (tests) */ }
  });
  function busy() {
    return Date.now() - touched < BUSY_MS || (window.hkPopupCover || 0) > 0;
  }
  // A CHANGE MADE ON THIS SCREEN (2026-10-01: an accessory's gear, on a
  // sheet here -- its Tile Size, name, icon): the person who made it is
  // looking for it, so it is built the moment the sheet closes, not after
  // the 30 s of nobody touching an unattended change waits for -- and the
  // page stays where it was scrolled to. Good for MINE_MS after the change.
  var MINE_MS = 120000, MINE_POLL = 300;
  function ownChange() { built.mine = Date.now(); }
  function mine() { return !!built.mine && Date.now() - built.mine < MINE_MS; }
  function refreshKeepingPlace() {
    var y = window.scrollY || 0;
    refresh();
    if (!y) return;
    // the rebuilt view draws over a frame or two; put the page back each
    // time until it is tall enough to be put back
    [80, 250, 600, 1200].forEach(function (ms) {
      setTimeout(function () { if (Math.abs((window.scrollY || 0) - y) > 2) window.scrollTo(0, y); }, ms);
    });
  }
  function watch(seg, sig) {
    built.seg = seg; built.sig = sig; built.at = Date.now();
    if (built.hooked || !window.hkSettings || !window.hkSettings.onChange) return;
    built.hooked = true;
    var due = function () {
      built.timer = null;
      if (dashSeg() !== built.seg || inputs(built.seg) === built.sig) return;
      var own = mine();
      if (own ? (window.hkPopupCover || 0) > 0 : busy()) { built.timer = setTimeout(due, own ? MINE_POLL : 5000); return; }
      built.sig = inputs(built.seg);
      built.mine = 0;
      if (own) refreshKeepingPlace(); else refresh();
    };
    window.hkSettings.onChange(function () {
      if (!built.seg || dashSeg() !== built.seg || inputs(built.seg) === built.sig) return;
      if (built.timer && !mine()) return;
      clearTimeout(built.timer);
      built.timer = setTimeout(due, mine() ? 0 : Math.max(0, 10000 - (Date.now() - built.at)));
    });
  }
  function refresh() {
    try {
      var ha = document.querySelector('home-assistant');
      var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      var panel = main && main.shadowRoot && main.shadowRoot.querySelector('ha-panel-lovelace');
      var root = panel && panel.shadowRoot && panel.shadowRoot.querySelector('hui-root');
      (root || panel).dispatchEvent(new CustomEvent('config-refresh', { bubbles: true, composed: true }));
    } catch (e) { /* not on a dashboard */ }
  }
  // LATE ARRIVAL. Home Assistant waits 5 s for this element, then draws
  // "Error loading the dashboard strategy: ... Timeout waiting for strategy
  // element" and never asks again. A page opened while Home Assistant is
  // restarting, or on a slow phone connection, can get this file after that
  // (2026-09-29 15:17: a phone and the Kitchen tablet, right after an
  // update's restart). So when it does arrive: a generated dashboard showing
  // that error is built again, now that the element is here.
  function lateError(panel) {
    var L = panel && panel.lovelace;
    var raw = L && L.rawConfig, s = raw && raw.strategy;
    if (!s || s.type !== 'custom:hk-dashboard' || !L.config) return false;
    try { return JSON.stringify(L.config).indexOf('ll-strategy-dashboard-hk-dashboard') >= 0; }
    catch (e) { return false; }
  }
  function lovelacePanel() {
    var ha = document.querySelector('home-assistant');
    var main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
    return main && main.shadowRoot && main.shadowRoot.querySelector('ha-panel-lovelace');
  }
  function recoverLate() {
    try {
      if (lateError(lovelacePanel())) { refresh(); kioskAgain(); }
    } catch (e) { /* not on a dashboard */ }
  }
  // KIOSK MODE LOOKS AGAIN. The kiosk-mode plugin reads the dashboard's
  // kiosk_mode when the page changes (location-changed); on the error page
  // there was none, so Home Assistant's header and sidebar showed -- and a
  // rebuild is not a page change, so they stayed (2026-09-29, the Kitchen
  // tablet). Once the rebuilt dashboard is in place, the same signal again.
  function kioskAgain() {
    var n = 0;
    var iv = setInterval(function () {
      var p = null;
      try { p = lovelacePanel(); } catch (e) { /* gone */ }
      var built = p && p.lovelace && !lateError(p) && p.lovelace.config && p.lovelace.config.views &&
                  p.lovelace.config.views.length > 0;
      if (built) window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
      if (built || ++n >= 40) clearInterval(iv);
    }, 250);
  }
  if (!customElements.get('ll-strategy-dashboard-hk-dashboard')) {
    customElements.define('ll-strategy-dashboard-hk-dashboard', HkDashboardStrategy);
    recoverLate();
  }
  // HOME ASSISTANT SWAPS THE REGISTRY. Its frontend replaces
  // window.customElements with a polyfill (scoped custom elements) that keeps
  // a list of its own: a definition made BEFORE the swap -- this file,
  // served from the browser's cache ahead of the frontend's own code -- is
  // invisible to it, so Home Assistant waits 5 s for an element it can
  // never see and draws "Timeout waiting for strategy element". Measured
  // 2026-09-29 on the wall tablets: most cached loads, all four tablets
  // (the file ran fine; `customElements.get` on the swapped registry still
  // said undefined). So until the frontend has started, both strategies are
  // defined again in whichever registry is current -- as subclasses, since a
  // constructor may be registered only once -- and a page already stuck is
  // rebuilt. At most a minute; nothing to do once Home Assistant's own
  // element and ours are in the same registry.
  function defineHere() {
    var made = false;
    if (!customElements.get('ll-strategy-view-hk-room')) {
      customElements.define('ll-strategy-view-hk-room', class extends HkRoomViewStrategy {});
      made = true;
    }
    if (!customElements.get('ll-strategy-dashboard-hk-dashboard')) {
      customElements.define('ll-strategy-dashboard-hk-dashboard', class extends HkDashboardStrategy {});
      made = true;
    }
    if (made) recoverLate();
    return made;
  }
  (function () {
    var n = 0;
    var iv = setInterval(function () {
      try { defineHere(); } catch (e) { /* the registry is mid-swap: next tick */ }
      if (++n >= 600 || (customElements.get('home-assistant') &&
                         customElements.get('ll-strategy-dashboard-hk-dashboard'))) clearInterval(iv);
    }, 100);
  })();
  // For tests and the console: hkStrategy.generate(config, hass).
  window.hkStrategy = { generate: HkDashboardStrategy.generate, tile: TILE, shortName: shortName,
                        lateError: lateError, recoverLate: recoverLate, defineHere: defineHere,
                        tileFor: tileFor, roomCards: roomCards, climateMembers: climateMembers, groupOf: groupOf, ownChange: ownChange,
                        room: HkRoomViewStrategy.generate,
                        rooms: rooms, contactGlyphs: contactGlyphs, overlay: overlay,
                        kioskOf: kioskOf, saverBlock: saverBlock,
                        shouldRegenerate: HkDashboardStrategy.shouldRegenerate, inputs: inputs,
                        _built: built, _busy: busy };
})();
